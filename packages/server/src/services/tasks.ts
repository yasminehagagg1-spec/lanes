import {
  STAGE_META,
  dayWindow,
  normalizeDue,
  pickTask,
  ulid,
  type MoveInput,
  type Stage,
  type Task,
  type TaskDraft,
  type TaskPatch,
  type TaskSource,
  type TodayStats,
  type NoteType,
} from '@lanes/shared';
import { nowIso, type Ctx } from '../context.js';
import type { DB } from '../db/connection.js';
import { ensureProject } from '../db/repo/projects.js';
import { getSettings } from '../db/repo/settings.js';
import { getTask, getTaskRow, listOpenTasks } from '../db/repo/tasks.js';
import { AppError, notFound } from '../errors.js';
import { getTodayStats } from './stats.js';

export interface TaskWithStats {
  task: Task;
  stats: TodayStats;
}

const MIN_GAP = 1e-6;

const pendingReasonRequired = () =>
  new AppError('PENDING_REASON_REQUIRED', 400, "What's it waiting on? Pending needs a reason.");

export function insertNote(
  db: DB,
  taskId: string,
  body: string,
  type: NoteType,
  stage: Stage,
  now: string,
): string {
  const id = ulid();
  db.prepare(
    'INSERT INTO notes (id, task_id, body, type, stage, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, taskId, body, type, stage, now);
  return id;
}

function mustGetTask(db: DB, id: string): Task {
  const task = getTask(db, id);
  if (!task) throw notFound('Task');
  return task;
}

/** New cards go to the top of their lane. */
function topPosition(db: DB, stage: Stage, excludeId = ''): number {
  const min = db
    .prepare('SELECT MIN(position) FROM tasks WHERE stage = ? AND deleted_at IS NULL AND id != ?')
    .pluck()
    .get(stage, excludeId) as number | null;
  return min === null ? 0 : min - 1;
}

/**
 * Fractional position for dropping a card into `stage`: after `afterId` (the card above it)
 * or before `beforeId` (the card below it); top of the lane when neither is given.
 * Renormalises the lane to 1, 2, 3 … when two neighbours get too close.
 */
function positionBetween(
  db: DB,
  stage: Stage,
  movingId: string,
  ref: { beforeId?: string | undefined; afterId?: string | undefined },
): number {
  const lane = () =>
    db
      .prepare(
        'SELECT id, position FROM tasks WHERE stage = ? AND deleted_at IS NULL AND id != ? ORDER BY position, id',
      )
      .all(stage, movingId) as { id: string; position: number }[];

  let rows = lane();
  const indexOf = (id: string) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0)
      throw new AppError('INVALID_POSITION', 400, 'That neighbour card is not in this lane.');
    return i;
  };
  const slot = ref.afterId ? indexOf(ref.afterId) + 1 : ref.beforeId ? indexOf(ref.beforeId) : 0;

  let prev = rows[slot - 1];
  let next = rows[slot];
  if (prev && next && next.position - prev.position < MIN_GAP) {
    const update = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
    rows.forEach((r, i) => update.run(i + 1, r.id));
    rows = lane();
    prev = rows[slot - 1];
    next = rows[slot];
  }
  if (!prev && !next) return 0;
  if (!prev) return (next?.position ?? 0) - 1;
  if (!next) return prev.position + 1;
  return (prev.position + next.position) / 2;
}

function dueColumns(dueAt: string | null | undefined, dueHasTime: boolean | undefined) {
  if (dueAt === undefined) return undefined;
  if (dueAt === null) return { due_at: null, due_has_time: 0 };
  const due = normalizeDue(dueAt, dueHasTime);
  return { due_at: due.dueAt, due_has_time: due.dueHasTime ? 1 : 0 };
}

// ---------- create ----------

export function createTask(
  ctx: Ctx,
  draft: TaskDraft,
  defaultSource: TaskSource = 'manual',
): TaskWithStats {
  const { db } = ctx;
  const now = nowIso(ctx);
  const stage = draft.stage ?? 'new';
  const source = draft.source ?? defaultSource;
  if (stage === 'pending' && !draft.pendingReason?.trim()) throw pendingReasonRequired();

  const id = ulid();
  db.transaction(() => {
    const projectId = draft.project ? ensureProject(db, draft.project, now).id : null;
    const due = dueColumns(draft.dueAt, draft.dueHasTime);
    db.prepare(
      `INSERT INTO tasks (id, title, description, stage, position, project_id, priority, energy,
         due_at, due_has_time, estimate_min, resume_on, source, created_at, updated_at,
         started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      draft.title.trim(),
      draft.description ?? '',
      stage,
      topPosition(db, stage),
      projectId,
      draft.priority ?? 'normal',
      draft.energy ?? null,
      due?.due_at ?? null,
      due?.due_has_time ?? 0,
      draft.estimateMin ?? null,
      stage === 'postponed' ? (draft.resumeOn ?? null) : null,
      source,
      now,
      now,
      stage === 'in_process' ? now : null,
      stage === 'done' ? now : null,
    );

    const addSubtask = db.prepare(
      'INSERT INTO subtasks (id, task_id, title, done, position) VALUES (?, ?, ?, 0, ?)',
    );
    draft.subtasks?.forEach((title, i) => addSubtask.run(ulid(), id, title.trim(), i + 1));

    const noteType: NoteType = source === 'claude' ? 'claude' : 'note';
    for (const body of draft.notes ?? []) insertNote(db, id, body.trim(), noteType, stage, now);
    if (stage === 'pending' && draft.pendingReason) {
      insertNote(db, id, draft.pendingReason.trim(), 'pending_reason', stage, now);
    }

    const addReminder = db.prepare(
      'INSERT INTO reminders (id, task_id, fire_at, message, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const r of draft.reminders ?? []) {
      addReminder.run(ulid(), id, new Date(r.fireAt).toISOString(), r.message || null, now);
    }
  })();

  const result = { task: mustGetTask(db, id), stats: getTodayStats(ctx) };
  ctx.events.emit({ type: 'task.created', data: result });
  return result;
}

// ---------- update (everything except stage) ----------

export function updateTask(ctx: Ctx, id: string, patch: TaskPatch): { task: Task } {
  const { db } = ctx;
  const now = nowIso(ctx);
  const row = getTaskRow(db, id);
  if (!row) throw notFound('Task');

  const sets: Record<string, string | number | null> = {};
  if (patch.title !== undefined) sets.title = patch.title.trim();
  if (patch.description !== undefined) sets.description = patch.description;
  if (patch.priority !== undefined) sets.priority = patch.priority;
  if (patch.energy !== undefined) sets.energy = patch.energy;
  if (patch.estimateMin !== undefined) sets.estimate_min = patch.estimateMin;
  if (patch.resumeOn !== undefined) sets.resume_on = patch.resumeOn;

  if (patch.dueAt !== undefined) {
    Object.assign(sets, dueColumns(patch.dueAt, patch.dueHasTime));
  } else if (patch.dueHasTime !== undefined && row.due_at) {
    Object.assign(sets, dueColumns(row.due_at, patch.dueHasTime));
  }

  db.transaction(() => {
    if (patch.project !== undefined) {
      sets.project_id = patch.project ? ensureProject(db, patch.project, now).id : null;
    }
    sets.updated_at = now;
    const columns = Object.keys(sets);
    db.prepare(
      `UPDATE tasks SET ${columns.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`,
    ).run({ ...sets, id });
  })();

  const task = mustGetTask(db, id);
  ctx.events.emit({ type: 'task.updated', data: { task } });
  return { task };
}

// ---------- move: the one place stage rules live ----------

/** `logNote` replaces the default "Moved from X to Y" entry (e.g. "Back from postponed"). */
export function moveTask(
  ctx: Ctx,
  id: string,
  input: MoveInput,
  opts: { logNote?: string } = {},
): TaskWithStats {
  const { db } = ctx;
  const now = nowIso(ctx);
  const row = getTaskRow(db, id);
  if (!row) throw notFound('Task');

  const from = row.stage;
  const to = input.stage;
  const changing = from !== to;
  const reason = input.pendingReason?.trim();
  if (changing && to === 'pending' && !reason) throw pendingReasonRequired();

  db.transaction(() => {
    const sets: Record<string, string | number | null> = { updated_at: now };

    if (changing) {
      sets.stage = to;
      if (to === 'in_process' && !row.started_at) sets.started_at = now;
      if (to === 'done') sets.completed_at = now;
      if (from === 'done') sets.completed_at = null;
      if (from === 'postponed') sets.resume_on = null;
      if (to === 'postponed') sets.resume_on = input.resumeOn ?? null;
    } else if (to === 'postponed' && input.resumeOn !== undefined) {
      sets.resume_on = input.resumeOn;
    }

    const hasRef = input.beforeId !== undefined || input.afterId !== undefined;
    if (hasRef) sets.position = positionBetween(db, to, id, input);
    else if (changing) sets.position = topPosition(db, to, id);

    const columns = Object.keys(sets);
    db.prepare(
      `UPDATE tasks SET ${columns.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`,
    ).run({ ...sets, id });

    if (changing) {
      insertNote(
        db,
        id,
        opts.logNote ?? `Moved from ${STAGE_META[from].en} to ${STAGE_META[to].en}`,
        'stage_change',
        to,
        now,
      );
    }
    // A new reason can be given on entering Pending, or to update it while there.
    if (to === 'pending' && reason) insertNote(db, id, reason, 'pending_reason', to, now);
  })();

  const result = { task: mustGetTask(db, id), stats: getTodayStats(ctx) };
  ctx.events.emit({ type: 'task.updated', data: result });
  return result;
}

// ---------- delete / restore (soft) ----------

export function deleteTask(ctx: Ctx, id: string): { ok: true; undoToken: string } {
  const row = getTaskRow(ctx.db, id);
  if (!row) throw notFound('Task');
  ctx.db
    .prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(nowIso(ctx), nowIso(ctx), id);
  ctx.events.emit({ type: 'task.deleted', data: { id } });
  ctx.events.emit({ type: 'stats.updated', data: { stats: getTodayStats(ctx) } });
  return { ok: true, undoToken: id };
}

export function restoreTask(ctx: Ctx, id: string): TaskWithStats {
  const row = getTaskRow(ctx.db, id, true);
  if (!row) throw notFound('Task');
  ctx.db
    .prepare('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?')
    .run(nowIso(ctx), id);
  const result = { task: mustGetTask(ctx.db, id), stats: getTodayStats(ctx) };
  ctx.events.emit({ type: 'task.created', data: result });
  return result;
}

/** Soft-deleted tasks are purged after 30 days. */
export function purgeDeleted(ctx: Ctx, days = 30): number {
  const cutoff = new Date(ctx.clock().getTime() - days * 86_400_000).toISOString();
  return ctx.db
    .prepare('DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .run(cutoff).changes;
}

// ---------- pick for me ----------

export function pickForMe(
  ctx: Ctx,
  opts: { energy?: Task['energy'] | undefined; minutes?: number | undefined; exclude?: string[] },
): { task: Task | null; reason?: string } {
  const now = ctx.clock();
  const { end } = dayWindow(now, getSettings(ctx.db).dayStartHour);
  const picked = pickTask(
    listOpenTasks(ctx.db),
    {
      ...(opts.energy ? { energy: opts.energy } : {}),
      ...(opts.minutes ? { minutes: opts.minutes } : {}),
      now,
      todayEnd: end,
    },
    new Set(opts.exclude ?? []),
  );
  return picked ? { task: picked.task, reason: picked.reason } : { task: null };
}
