import { STAGES, STAGE_META, type Stage, type Task } from '@lanes/shared';
import { Check } from 'lucide-react';
import { cn, ProjectChip, StageDot, UserText } from '@/components/ui/primitives';
import { dueLabel, isOverdue, resumeLabel, timeLabel } from '@/lib/format';
import { useUi } from '@/lib/store';
import { reasonText } from './TaskCard';

function Row({ task, now }: { task: Task; now: Date }) {
  const selected = useUi((s) => s.selectedId === task.id);
  const select = useUi((s) => s.select);
  const openDrawer = useUi((s) => s.openDrawer);
  const total = task.subtasks.length;
  const doneSubs = task.subtasks.filter((s) => s.done).length;
  const side =
    task.stage === 'done'
      ? task.completedAt && timeLabel(new Date(task.completedAt))
      : task.stage === 'postponed'
        ? resumeLabel(task.resumeOn)
        : dueLabel(task, now);

  return (
    <button
      type="button"
      data-task-id={task.id}
      onFocus={() => select(task.id)}
      onClick={() => openDrawer(task.id)}
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto_9.5rem_3rem_2rem] items-center gap-4 rounded-md bg-surface px-4 py-3 text-left outline-none',
        'transition hover:bg-surface-sunk focus-visible:ring-2 focus-visible:ring-royal',
        selected && 'ring-2 ring-royal',
      )}
    >
      <span className="min-w-0">
        <UserText
          text={task.title}
          className={cn('block truncate font-medium', task.stage === 'done' && 'text-fg/60')}
        />
        {task.stage === 'pending' && task.pendingReason && (
          <span className="block truncate text-[0.8125rem] text-fg-2 italic">
            Waiting on: {reasonText(task.pendingReason)}
          </span>
        )}
      </span>
      <span className="justify-self-end">
        {task.project && <ProjectChip name={task.project.name} color={task.project.color} />}
      </span>
      <span
        className={cn(
          'text-[0.8125rem] text-fg-2',
          isOverdue(task, now) && 'font-semibold text-scribble',
        )}
      >
        {side}
      </span>
      <span className="tabular text-[0.8125rem] text-fg-2">
        {total ? `${doneSubs}/${total}` : ''}
      </span>
      <span className="justify-self-end text-sm font-bold">
        {task.stage === 'done' ? (
          <Check className="size-4" aria-label="Done" />
        ) : task.priority === 'urgent' ? (
          <span className="text-[var(--prio-urgent)]">!!</span>
        ) : task.priority === 'high' ? (
          <span className="text-[var(--prio-high)]">!</span>
        ) : null}
      </span>
    </button>
  );
}

export function ListView({ groups, now }: { groups: Record<Stage, Task[]>; now: Date }) {
  return (
    <div data-testid="list" className="flex flex-col gap-6">
      {STAGES.map((stage) => (
        <section
          key={stage}
          aria-label={`${STAGE_META[stage].en} tasks`}
          className="flex flex-col gap-2"
        >
          <h3 className="m-0 flex items-center gap-3 px-1 text-base font-semibold">
            <StageDot stage={stage} />
            {stage === 'done' ? 'Done today' : STAGE_META[stage].en}
            <span lang="ar" className="text-sm font-normal text-fg-2/70">
              {STAGE_META[stage].ar}
            </span>
            <span className="tabular text-sm font-normal text-fg-2">{groups[stage].length}</span>
          </h3>
          {groups[stage].length === 0 ? (
            <p className="m-0 px-1 text-sm text-fg-3">Empty.</p>
          ) : (
            groups[stage].map((t) => <Row key={t.id} task={t} now={now} />)
          )}
        </section>
      ))}
    </div>
  );
}
