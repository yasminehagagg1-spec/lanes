import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, ZodError } from 'zod';
import {
  ENERGIES,
  PRIORITIES,
  REMINDER_PRESETS,
  STAGES,
  TaskDraftSchema,
  TaskPatchSchema,
  defaultReminder,
  localDateKey,
  normalizeDigits,
  resolveProject,
  resolveReminder,
  resolveWhen,
  type Note,
  type Project,
  type Reminder,
  type ResolvedWhen,
  type Task,
  type TaskDetail,
  type TaskDraft,
  type TaskPatch,
  type TodayStats,
} from '@lanes/shared';
import { LanesError, type LanesClient } from './client.js';
import { detail, line, stageName, statsLine, when } from './format.js';
import { FIELD_GUIDE } from './instructions.js';

export interface ToolDeps {
  client: LanesClient;
  linkBase: string;
  now?: () => Date;
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

/** Every tool answers in plain text; known problems come back as a friendly tool error. */
function run<A>(fn: (args: A) => Promise<string>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return { content: [{ type: 'text', text: await fn(args) }] };
    } catch (err) {
      const text =
        err instanceof LanesError
          ? err.message
          : err instanceof ZodError
            ? `That doesn’t fit Lanes: ${z.prettifyError(err)}`
            : `Something went wrong talking to Lanes: ${(err as Error).message}`;
      return { isError: true, content: [{ type: 'text', text }] };
    }
  };
}

// ---------- shared pieces ----------

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const norm = (s: string) =>
  normalizeDigits(s)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** A task by id, or by a few words of its title. Ambiguity is an error listing the candidates. */
async function findTask(client: LanesClient, ref: string): Promise<TaskDetail> {
  const r = ref.trim();
  if (ULID.test(r)) return client.call<TaskDetail>('GET', `/api/tasks/${r}`);
  const all = await client.call<Task[]>('GET', '/api/tasks?includeDone=all');
  const key = norm(r);
  const words = key.split(' ').filter(Boolean);
  const exact = all.filter((t) => norm(t.title) === key);
  let hits = exact.length
    ? exact
    : all.filter((t) => words.every((w) => norm(t.title).includes(w)));
  if (hits.length > 1) {
    const open = hits.filter((t) => t.stage !== 'done');
    if (open.length) hits = open;
  }
  const [only] = hits;
  if (!only) throw new LanesError(`No task matches “${r}”. Try list_tasks to see what’s there.`);
  if (hits.length > 1) {
    const list = hits.slice(0, 8).map(line).join('\n');
    throw new LanesError(`Several tasks match “${r}”. Use one of these ids:\n${list}`);
  }
  return client.call<TaskDetail>('GET', `/api/tasks/${only.id}`);
}

function whenOrThrow(phrase: string, now: Date, what: string): ResolvedWhen {
  const w = resolveWhen(phrase, now);
  if (!w) {
    throw new LanesError(
      `Couldn’t read the ${what} “${phrase}”. Use words like “tomorrow 3pm”, “Thursday”, or an ISO date.`,
    );
  }
  return w;
}

const dayOf = (phrase: string, now: Date) =>
  localDateKey(new Date(whenOrThrow(phrase, now, 'date').at));

const link = (base: string, id: string) => `${base}/?task=${id}`;

async function projectNames(client: LanesClient): Promise<string[]> {
  const projects = await client.call<Project[]>('GET', '/api/projects');
  return projects.filter((p) => !p.archived).map((p) => p.name);
}

function summary(t: Task): string {
  const bits: string[] = [];
  if (t.project) bits.push(`#${t.project.name}`);
  if (t.priority !== 'normal') bits.push(`!${t.priority}`);
  if (t.energy) bits.push(`${t.energy} energy`);
  if (t.dueAt) bits.push(`due ${when(t.dueAt, t.dueHasTime)}`);
  if (t.nextReminderAt) bits.push(`reminder ${when(t.nextReminderAt)}`);
  if (t.estimateMin) bits.push(`~${t.estimateMin} min`);
  if (t.subtasks.length) bits.push(`${t.subtasks.length} steps`);
  if (t.pendingReason) bits.push(`waiting on: ${t.pendingReason}`);
  return bits.join(' · ');
}

// ---------- schemas ----------

const Ref = z.string().min(1).max(300).describe('Task id, or a few words of its title');
const When = (what: string) =>
  z
    .string()
    .min(1)
    .max(100)
    .describe(`${what}: words ("tomorrow 3pm", "by Thursday", "بكرة الساعة ٥") or ISO`);

const AddTaskInput = {
  title: z.string().min(1).max(300).describe('Short imperative line, in the user’s language'),
  description: z.string().max(20_000).optional(),
  project: z.string().min(1).max(80).optional().describe('Client or brand mentioned'),
  priority: z.enum(PRIORITIES).optional(),
  energy: z.enum(ENERGIES).optional().describe('Only if stated or obvious'),
  due: When('When it’s due. A date alone means the end of that day').optional(),
  estimateMin: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional()
    .describe('Minutes it should take'),
  subtasks: z.array(z.string().min(1).max(300)).max(100).optional().describe('Steps, in order'),
  notes: z.array(z.string().min(1).max(20_000)).max(50).optional(),
  reminders: z
    .array(
      z.object({
        at: When('When to remind. A bare time lands on the due day; "30m before" works too'),
        message: z.string().max(500).optional(),
      }),
    )
    .max(20)
    .optional()
    .describe('Leave out: a timed due gets one an hour before. [] for none'),
  stage: z.enum(STAGES).optional().describe('Default new'),
  pendingReason: z.string().min(1).max(500).optional().describe('Needed for pending'),
  resumeOn: When('For postponed: the day it comes back').optional(),
  rawText: z.string().max(5000).optional().describe('The user’s original words, kept as a note'),
};

// ---------- tools ----------

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const { client, linkBase } = deps;
  const now = deps.now ?? (() => new Date());

  server.registerTool(
    'add_task',
    {
      title: 'Add a task to Lanes',
      description: `Create one task on the Lanes board. One call per task.\n\n${FIELD_GUIDE}`,
      inputSchema: AddTaskInput,
    },
    run(async (a) => {
      const at = now();
      const known = await projectNames(client);
      const draft: TaskDraft = { title: a.title.trim(), source: 'claude' };
      const assumed: string[] = [];

      if (a.description) draft.description = a.description;
      if (a.project) {
        draft.project = resolveProject(a.project, known);
        if (!known.includes(draft.project)) assumed.push(`new project “${draft.project}”`);
      }
      if (a.priority) draft.priority = a.priority;
      if (a.energy) draft.energy = a.energy;
      if (a.estimateMin) draft.estimateMin = a.estimateMin;
      if (a.subtasks?.length) draft.subtasks = a.subtasks;
      if (a.stage) draft.stage = a.stage;
      if (a.pendingReason) draft.pendingReason = a.pendingReason;
      if (a.resumeOn) draft.resumeOn = dayOf(a.resumeOn, at);

      let due: ResolvedWhen | null = null;
      if (a.due) {
        due = whenOrThrow(a.due, at, 'due date');
        draft.dueAt = due.at;
        draft.dueHasTime = due.hasTime;
      }

      if (a.reminders === undefined) {
        const auto = due ? defaultReminder(due, at) : null;
        if (auto) {
          draft.reminders = [{ fireAt: auto }];
          assumed.push('a reminder an hour before');
        }
      } else if (a.reminders.length) {
        draft.reminders = a.reminders.map((r) => {
          const fireAt = resolveReminder(r.at, at, due);
          if (!fireAt) throw new LanesError(`Couldn’t read the reminder time “${r.at}”.`);
          return { fireAt, ...(r.message ? { message: r.message } : {}) };
        });
      }

      const notes = [...(a.notes ?? [])];
      if (a.rawText?.trim()) notes.push(`Asked in Claude: “${a.rawText.trim()}”`);
      if (notes.length) draft.notes = notes;

      if (draft.stage === 'pending' && !draft.pendingReason) {
        throw new LanesError('Pending tasks need a reason: what is it waiting on?');
      }

      const { task } = await client.call<{ task: Task }>(
        'POST',
        '/api/tasks',
        TaskDraftSchema.parse(draft),
      );
      const out = [`Added “${task.title}” to ${stageName(task)}.`];
      const s = summary(task);
      if (s) out.push(s);
      if (assumed.length) out.push(`Assumed: ${assumed.join('; ')}.`);
      out.push(`Open in Lanes: ${link(linkBase, task.id)}`);
      return out.join('\n');
    }),
  );

  server.registerTool(
    'parse_task',
    {
      title: 'Preview a task',
      description:
        'Dry run: shows what Lanes’ quick-capture parser makes of a line. Nothing is saved.',
      inputSchema: { text: z.string().min(1).max(5000) },
    },
    run(async ({ text }) => {
      const draft = await client.call<TaskDraft>('POST', '/api/tasks/parse', { text });
      return JSON.stringify(draft, null, 2);
    }),
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description: 'Compact list: id · title · stage · project · due. Done tasks only from today.',
      inputSchema: {
        stage: z.enum(STAGES).optional(),
        project: z.string().max(80).optional(),
        due: z.enum(['today', 'week', 'overdue']).optional(),
        q: z.string().max(200).optional().describe('Words in the title or description'),
        limit: z.number().int().min(1).max(200).optional().describe('Default 30'),
      },
    },
    run(async (a) => {
      const params = new URLSearchParams();
      if (a.stage) params.set('stage', a.stage);
      if (a.project) params.set('project', a.project);
      if (a.due) params.set('due', a.due);
      if (a.q) params.set('q', a.q);
      const tasks = await client.call<Task[]>('GET', `/api/tasks?${params}`);
      if (!tasks.length) return 'No tasks match.';
      const limit = a.limit ?? 30;
      const more = tasks.length > limit ? `\n(+${tasks.length - limit} more)` : '';
      return tasks.slice(0, limit).map(line).join('\n') + more;
    }),
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get a task',
      description: 'One task in full: steps, notes, reminders. By id or by words of its title.',
      inputSchema: { id: Ref },
    },
    run(async ({ id }) => {
      const t = await findTask(client, id);
      return detail(t, link(linkBase, t.id));
    }),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Edit a task',
      description:
        'Change a task’s fields (not its stage; use move_task). null clears project, energy, due or estimate.',
      inputSchema: {
        id: Ref,
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(20_000).optional(),
        project: z.string().min(1).max(80).nullable().optional(),
        priority: z.enum(PRIORITIES).optional(),
        energy: z.enum(ENERGIES).nullable().optional(),
        due: When('New due date').nullable().optional(),
        estimateMin: z
          .number()
          .int()
          .positive()
          .max(24 * 60)
          .nullable()
          .optional(),
      },
    },
    run(async (a) => {
      const t = await findTask(client, a.id);
      const patch: TaskPatch = {};
      if (a.title !== undefined) patch.title = a.title;
      if (a.description !== undefined) patch.description = a.description;
      if (a.project !== undefined) {
        patch.project =
          a.project === null ? null : resolveProject(a.project, await projectNames(client));
      }
      if (a.priority !== undefined) patch.priority = a.priority;
      if (a.energy !== undefined) patch.energy = a.energy;
      if (a.estimateMin !== undefined) patch.estimateMin = a.estimateMin;
      if (a.due === null) patch.dueAt = null;
      else if (a.due !== undefined) {
        const due = whenOrThrow(a.due, now(), 'due date');
        patch.dueAt = due.at;
        patch.dueHasTime = due.hasTime;
      }
      if (!Object.keys(patch).length) throw new LanesError('Nothing to change.');
      const res = await client.call<{ task: Task }>(
        'PATCH',
        `/api/tasks/${t.id}`,
        TaskPatchSchema.parse(patch),
      );
      return `Updated “${res.task.title}”.\n${line(res.task)}`;
    }),
  );

  server.registerTool(
    'move_task',
    {
      title: 'Move a task',
      description:
        'Change stage, with the same rules as the board: pending needs pendingReason; postponed can take resumeOn.',
      inputSchema: {
        id: Ref,
        stage: z.enum(STAGES),
        pendingReason: z.string().min(1).max(500).optional().describe('What it’s waiting on'),
        resumeOn: When('For postponed: the day it comes back').optional(),
      },
    },
    run(async (a) => {
      const t = await findTask(client, a.id);
      if (a.stage === 'pending' && !a.pendingReason) {
        throw new LanesError('Moving to Pending needs a reason: what is it waiting on?');
      }
      const body: Record<string, string> = { stage: a.stage };
      if (a.pendingReason) body.pendingReason = a.pendingReason;
      if (a.resumeOn) body.resumeOn = dayOf(a.resumeOn, now());
      const res = await client.call<{ task: Task; stats: TodayStats }>(
        'POST',
        `/api/tasks/${t.id}/move`,
        body,
      );
      const out = [`Moved “${res.task.title}” to ${stageName(res.task)}.`];
      if (res.task.stage === 'done') out.push(statsLine(res.stats));
      if (res.task.resumeOn)
        out.push(`Comes back ${when(`${res.task.resumeOn}T12:00:00`, false)}.`);
      return out.join('\n');
    }),
  );

  server.registerTool(
    'add_note',
    {
      title: 'Add a note',
      description: 'Add a note to a task’s timeline (marked as from Claude).',
      inputSchema: { id: Ref, body: z.string().min(1).max(20_000) },
    },
    run(async ({ id, body }) => {
      const t = await findTask(client, id);
      await client.call<Note>('POST', `/api/tasks/${t.id}/notes`, { body, type: 'claude' });
      return `Note added to “${t.title}”.`;
    }),
  );

  server.registerTool(
    'add_reminder',
    {
      title: 'Add a reminder',
      description: `Remind about a task, at a time ("1pm", "30m before", "friday 9am") or a preset (${REMINDER_PRESETS.join(', ')}).`,
      inputSchema: {
        id: Ref,
        at: When('When to remind').optional(),
        preset: z.enum(REMINDER_PRESETS).optional(),
        message: z.string().max(500).optional(),
      },
    },
    run(async (a) => {
      const t = await findTask(client, a.id);
      const msg: Record<string, string> = a.message ? { message: a.message } : {};
      let body: Record<string, string>;
      if (a.at) {
        const due = t.dueAt ? { at: t.dueAt, hasTime: t.dueHasTime } : null;
        const fireAt = resolveReminder(a.at, now(), due);
        if (!fireAt) throw new LanesError(`Couldn’t read the reminder time “${a.at}”.`);
        body = { fireAt, ...msg };
      } else if (a.preset) {
        body = { preset: a.preset, ...msg };
      } else {
        throw new LanesError('Say when: give `at` or a `preset`.');
      }
      const r = await client.call<Reminder>('POST', `/api/tasks/${t.id}/reminders`, body);
      return `Reminder set for ${when(r.fireAt)} on “${t.title}”.`;
    }),
  );

  server.registerTool(
    'today',
    {
      title: 'Today in Lanes',
      description:
        'Today’s progress plus what’s in process, due today, and still open from before.',
      inputSchema: {},
    },
    run(async () => {
      const [stats, inProcess, dueToday, overdue] = await Promise.all([
        client.call<TodayStats>('GET', '/api/stats/today'),
        client.call<Task[]>('GET', '/api/tasks?stage=in_process'),
        client.call<Task[]>('GET', '/api/tasks?due=today'),
        client.call<Task[]>('GET', '/api/tasks?due=overdue'),
      ]);
      const seen = new Set<string>();
      const section = (title: string, tasks: Task[]) => {
        const fresh = tasks.filter((t) => t.stage !== 'done' && !seen.has(t.id));
        fresh.forEach((t) => seen.add(t.id));
        return fresh.length ? [``, `${title}:`, ...fresh.map(line)] : [];
      };
      const out = [
        statsLine(stats),
        ...section('In process', inProcess),
        ...section('Due today', dueToday),
        ...section('Still open from before', overdue),
      ];
      if (seen.size === 0) out.push('', 'Nothing in process or due today.');
      return out.join('\n');
    }),
  );
}
