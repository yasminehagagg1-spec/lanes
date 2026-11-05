import { useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowUp, Check, Trash2, X } from 'lucide-react';
import {
  STAGES,
  STAGE_META,
  type Energy,
  type Priority,
  type ReminderPreset,
  type TaskDetail,
  type TaskPatch,
} from '@lanes/shared';
import { Sheet, SheetClose } from '@/components/ui/overlays';
import { Button, cn, IconButton, stageColor, StageDot, UserText } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { celebrateSubtask } from '@/lib/celebrate';
import { dayLabel, noteTime, timeLabel, toLocalInput } from '@/lib/format';
import {
  useDeleteTask,
  useProjects,
  useTaskDetail,
  useTaskItemMutation,
  useUpdateTask,
} from '@/lib/queries';
import { useUi } from '@/lib/store';
import { reasonText } from '@/features/board/TaskCard';
import { useMoveFlow } from '@/features/board/useMoveFlow';
import { CommitText, Field, fieldInput, Section, Segmented } from './fields';

// ---------- stage switcher ----------

function StagePills({ task }: { task: TaskDetail }) {
  const moveFlow = useMoveFlow();
  return (
    <div role="radiogroup" aria-label="Stage" className="flex flex-wrap gap-1.5">
      {STAGES.map((stage) => {
        const active = task.stage === stage;
        const style = { '--sc': stageColor(stage) } as CSSProperties;
        return (
          <button
            key={stage}
            type="button"
            role="radio"
            aria-checked={active}
            style={style}
            onClick={() => moveFlow(task.id, task.stage, stage)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition',
              active
                ? cn(
                    'border-transparent bg-[var(--sc)]',
                    stage === 'done' ? 'text-charcoal' : 'text-white',
                  )
                : 'border-border text-fg-2 hover:bg-surface-sunk hover:text-fg',
            )}
          >
            {!active && <StageDot stage={stage} className="size-2.5" />}
            {STAGE_META[stage].en}
          </button>
        );
      })}
    </div>
  );
}

// ---------- details well ----------

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];
const ENERGIES: { value: Energy | 'none'; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
];

function Details({ task, save }: { task: TaskDetail; save: (patch: TaskPatch) => void }) {
  const { data: projects = [] } = useProjects();
  const hold = useUi((s) => s.hold);
  const dueDate = toLocalInput(task.dueAt, false);
  const dueTime = task.dueHasTime && task.dueAt ? toLocalInput(task.dueAt).slice(11) : '';

  const setDue = (date: string, time: string) => {
    if (!date) return save({ dueAt: null });
    if (!time) return save({ dueAt: date, dueHasTime: false });
    save({ dueAt: new Date(`${date}T${time}`).toISOString(), dueHasTime: true });
  };

  return (
    <div className="grid grid-cols-2 gap-4 rounded-md bg-surface-sunk p-4">
      <Field label="Project" className="col-span-2">
        <input
          list="lanes-projects"
          defaultValue={task.project?.name ?? ''}
          key={task.project?.name ?? ''}
          dir="auto"
          placeholder="No project"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== (task.project?.name ?? '')) save({ project: next || null });
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={fieldInput}
        />
        <datalist id="lanes-projects">
          {projects.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </Field>

      <Field label="Priority" className="col-span-2">
        <Segmented
          label="Priority"
          options={PRIORITIES}
          value={task.priority}
          onChange={(priority) => save({ priority })}
        />
      </Field>

      <Field label="Energy" className="col-span-2">
        <Segmented
          label="Energy"
          options={ENERGIES}
          value={task.energy ?? 'none'}
          onChange={(v) => save({ energy: v === 'none' ? null : v })}
        />
      </Field>

      <Field label="Due date">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDue(e.target.value, dueTime)}
          className={fieldInput}
        />
      </Field>
      <Field label="Time (optional)">
        <input
          type="time"
          value={dueTime}
          disabled={!dueDate}
          onChange={(e) => setDue(dueDate, e.target.value)}
          className={fieldInput}
        />
      </Field>

      <Field label="Estimate (minutes)">
        <input
          type="number"
          min={1}
          max={1440}
          defaultValue={task.estimateMin ?? ''}
          key={task.estimateMin ?? 'none'}
          placeholder="—"
          onBlur={(e) => {
            const n = e.target.value ? Math.round(Number(e.target.value)) : null;
            if (n !== task.estimateMin && (n === null || n > 0)) save({ estimateMin: n });
          }}
          className={fieldInput}
        />
      </Field>

      {task.stage === 'postponed' && (
        <Field label="Back on">
          <input
            type="date"
            value={task.resumeOn ?? ''}
            onChange={(e) => save({ resumeOn: e.target.value || null })}
            className={fieldInput}
          />
        </Field>
      )}

      {task.stage === 'pending' && (
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-sm bg-surface px-3 py-2 text-sm">
          <span className="min-w-0 italic text-fg-2">
            Waiting on:{' '}
            <UserText text={reasonText(task.pendingReason ?? '—')} className="text-fg" />
          </span>
          <Button size="sm" variant="ghost" onClick={() => hold({ id: task.id, stage: 'pending' })}>
            Change
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- subtasks ----------

function Subtasks({ task }: { task: TaskDetail }) {
  const [title, setTitle] = useState('');
  const add = useTaskItemMutation(task.id, (t: string) => api.addSubtask(task.id, t));
  const toggle = useTaskItemMutation(task.id, (a: { id: string; done: boolean }) =>
    api.updateSubtask(a.id, { done: a.done }),
  );
  const remove = useTaskItemMutation(task.id, (id: string) => api.deleteSubtask(id));
  const done = task.subtasks.filter((s) => s.done).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    add.mutate(title.trim());
    setTitle('');
  };

  return (
    <Section
      title="Steps"
      aside={
        task.subtasks.length > 0 && (
          <span className="tabular text-xs text-fg-2">
            {done}/{task.subtasks.length}
          </span>
        )
      }
    >
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {task.subtasks.map((s) => (
          <li
            key={s.id}
            className="group flex items-center gap-3 rounded-sm px-1 py-1.5 hover:bg-surface-sunk"
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={s.done}
              aria-label={s.title}
              onClick={(e) => {
                if (!s.done) celebrateSubtask(e.currentTarget);
                toggle.mutate({ id: s.id, done: !s.done });
              }}
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition',
                s.done
                  ? 'lanes-stamp border-yellow bg-yellow'
                  : 'border-fg-3 hover:border-charcoal',
              )}
            >
              {s.done && (
                <Check className="size-3 text-charcoal" strokeWidth={3.5} aria-hidden="true" />
              )}
            </button>
            <UserText text={s.title} className={cn('flex-1 text-sm', s.done && 'text-fg-2')} />
            <button
              type="button"
              aria-label={`Remove step ${s.title}`}
              onClick={() => remove.mutate(s.id)}
              className="text-fg-3 opacity-0 transition group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit}>
        <input
          value={title}
          dir="auto"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a step"
          aria-label="Add a step"
          className={cn(fieldInput, 'bg-surface-sunk')}
        />
      </form>
    </Section>
  );
}

// ---------- reminders ----------

const PRESETS: { value: ReminderPreset; label: string }[] = [
  { value: 'in_1h', label: 'In 1 hour' },
  { value: 'tonight', label: 'Tonight 8pm' },
  { value: 'tomorrow_morning', label: 'Tomorrow 9am' },
  { value: 'next_monday', label: 'Next Monday' },
];

function Reminders({ task }: { task: TaskDetail }) {
  const [custom, setCustom] = useState('');
  const add = useTaskItemMutation(task.id, (input: Parameters<typeof api.addReminder>[1]) =>
    api.addReminder(task.id, input),
  );
  const remove = useTaskItemMutation(task.id, (id: string) => api.deleteReminder(id));
  const active = task.reminders.filter((r) => !r.firedAt && !r.dismissed);

  return (
    <Section title="Reminders">
      {active.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {active.map((r) => (
            <li
              key={r.id}
              className="group flex items-center gap-3 rounded-sm px-1 py-1.5 text-sm hover:bg-surface-sunk"
            >
              <span className="tabular font-medium">
                {dayLabel(new Date(r.fireAt))}, {timeLabel(new Date(r.fireAt))}
              </span>
              {r.message && <UserText text={r.message} className="flex-1 truncate text-fg-2" />}
              <button
                type="button"
                aria-label="Remove reminder"
                onClick={() => remove.mutate(r.id)}
                className="ml-auto text-fg-3 opacity-0 transition group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            size="sm"
            variant="white"
            onClick={() => add.mutate({ preset: p.value })}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="datetime-local"
          aria-label="Custom reminder time"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className={cn(fieldInput, 'bg-surface-sunk')}
        />
        <Button
          variant="ink"
          disabled={!custom}
          onClick={() => {
            add.mutate({ fireAt: new Date(custom).toISOString() });
            setCustom('');
          }}
        >
          Add
        </Button>
      </div>
    </Section>
  );
}

// ---------- notes ----------

const NOTE_KIND: Record<string, string> = {
  pending_reason: 'Waiting on',
  stage_change: '',
  focus_log: 'Focus',
  claude: '✳ Claude',
  note: '',
};

function NotesTimeline({ task }: { task: TaskDetail }) {
  const remove = useTaskItemMutation(task.id, (id: string) => api.deleteNote(id));
  if (task.notes.length === 0) {
    return (
      <p className="m-0 text-sm text-fg-3">
        No notes yet. Anything you write here stays with the task.
      </p>
    );
  }
  return (
    <ol className="relative m-0 flex list-none flex-col gap-4 p-0 pl-6 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-0.5 before:bg-border">
      {task.notes.map((n) => {
        const auto = n.type === 'stage_change';
        return (
          <li key={n.id} className="group relative">
            <StageDot
              stage={n.stage}
              className="absolute top-1.5 -left-6 size-3 ring-4 ring-surface"
            />
            <UserText
              as="p"
              text={NOTE_KIND[n.type] ? `${NOTE_KIND[n.type]}: ${n.body}` : n.body}
              className={cn('m-0 text-sm whitespace-pre-wrap', auto && 'text-fg-2 italic')}
            />
            <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-3">
              {STAGE_META[n.stage].en} · {noteTime(n.createdAt)}
              {(n.type === 'note' || n.type === 'claude') && (
                <button
                  type="button"
                  onClick={() => remove.mutate(n.id)}
                  className="opacity-0 transition group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function NoteComposer({ task }: { task: TaskDetail }) {
  const [body, setBody] = useState('');
  const add = useTaskItemMutation(
    task.id,
    (b: string) => api.addNote(task.id, b),
    'Couldn’t save that note.',
  );
  const send = () => {
    if (!body.trim()) return;
    add.mutate(body.trim());
    setBody('');
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex items-end gap-2 border-t border-border bg-surface p-4"
    >
      <textarea
        rows={1}
        dir="auto"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={`Add a note while it’s ${STAGE_META[task.stage].en.toLowerCase()}…`}
        aria-label="Add a note"
        className="max-h-40 min-h-12 flex-1 resize-none rounded-[24px] bg-surface-sunk px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-royal"
      />
      <IconButton label="Save note" variant="ink" type="submit" disabled={!body.trim()}>
        <ArrowUp className="size-5" aria-hidden="true" />
      </IconButton>
    </form>
  );
}

// ---------- drawer ----------

function DrawerBody({ task }: { task: TaskDetail }) {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const openDrawer = useUi((s) => s.openDrawer);
  const save = (patch: TaskPatch) => update.mutate({ id: task.id, patch });

  return (
    <>
      <div className="flex items-center gap-3 px-6 pt-5 pb-2">
        <StageDot stage={task.stage} />
        <span className="text-sm font-medium text-fg-2">{STAGE_META[task.stage].en}</span>
        {task.source === 'claude' && <span className="text-sm text-royal">✳ from Claude</span>}
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Delete task"
            variant="ghost"
            className="size-10"
            onClick={() => {
              del.mutate(task.id);
              openDrawer(null);
            }}
          >
            <Trash2 className="size-[18px]" aria-hidden="true" />
          </IconButton>
          <SheetClose asChild>
            <IconButton label="Close" variant="ghost" className="size-10">
              <X className="size-5" aria-hidden="true" />
            </IconButton>
          </SheetClose>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 pt-2 pb-8 [&>*]:shrink-0">
        <CommitText
          value={task.title}
          allowEmpty={false}
          onCommit={(title) => save({ title })}
          aria-label="Title"
          className="m-0 w-full bg-transparent text-[1.75rem] leading-tight font-semibold outline-none"
        />
        <StagePills task={task} />
        <Details task={task} save={save} />
        <Section title="Description">
          <CommitText
            multiline
            value={task.description}
            onCommit={(description) => save({ description })}
            placeholder="Context, links, the why."
            aria-label="Description"
            className="min-h-20 w-full rounded-md bg-surface-sunk px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-royal"
          />
        </Section>
        <Subtasks task={task} />
        <Reminders task={task} />
        <Section title="Notes">
          <NotesTimeline task={task} />
        </Section>
      </div>

      <NoteComposer task={task} />
    </>
  );
}

export function TaskDrawer() {
  const id = useUi((s) => s.drawerId);
  const openDrawer = useUi((s) => s.openDrawer);
  const { data: task, isError } = useTaskDetail(id);

  return (
    <Sheet
      open={!!id}
      onOpenChange={(open) => !open && openDrawer(null)}
      title={task?.title ?? 'Task'}
    >
      {task && task.id === id ? (
        <DrawerBody key={task.id} task={task} />
      ) : (
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-fg-2">
          {isError ? 'That task isn’t here anymore.' : 'Opening…'}
        </div>
      )}
    </Sheet>
  );
}
