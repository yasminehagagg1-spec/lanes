import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Bell, Check } from 'lucide-react';
import type { Task } from '@lanes/shared';
import { Scribble } from '@/components/Scribble';
import { cn, ProjectChip, UserText } from '@/components/ui/primitives';
import { dueLabel, isOverdue, resumeLabel, timeLabel } from '@/lib/format';
import { useUi } from '@/lib/store';

/** "waiting on their IT" → "their IT" (the card adds "Waiting on:"). */
export function reasonText(reason: string): string {
  return reason.replace(/^\s*waiting\s+(on|for)\s*:?\s*/i, '');
}

function PriorityMark({ task }: { task: Task }) {
  if (task.priority === 'urgent') {
    return (
      <span
        title="Urgent"
        className="flex items-center gap-1 text-sm font-bold text-[var(--prio-urgent)]"
      >
        <span className="size-2 rounded-full bg-[var(--prio-urgent)]" />
        !!
        <span className="sr-only">Urgent</span>
      </span>
    );
  }
  if (task.priority === 'high') {
    return (
      <span title="High priority" className="text-sm font-bold text-[var(--prio-high)]">
        !<span className="sr-only">High priority</span>
      </span>
    );
  }
  return null;
}

function SubtaskMeter({ task }: { task: Task }) {
  const total = task.subtasks.length;
  if (!total) return null;
  const done = task.subtasks.filter((s) => s.done).length;
  return (
    <span className="flex items-center gap-1.5" title={`${done} of ${total} steps done`}>
      <span className="relative h-1 w-9 overflow-hidden rounded-full bg-border">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-royal"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </span>
      <span className="tabular">
        {done}/{total}
      </span>
    </span>
  );
}

function Meta({ task, now }: { task: Task; now: Date }) {
  const items: ReactNode[] = [];

  if (task.stage === 'done') {
    if (task.completedAt) items.push(<span key="at">{timeLabel(new Date(task.completedAt))}</span>);
    if (task.counts.focusMin) items.push(<span key="focus">Focused {task.counts.focusMin}m</span>);
  } else if (task.stage === 'postponed') {
    items.push(<span key="resume">{resumeLabel(task.resumeOn)}</span>);
  } else {
    const due = dueLabel(task, now);
    if (due && isOverdue(task, now)) {
      items.push(
        <span key="due" className="relative px-1 font-semibold text-scribble">
          {due}
          <Scribble
            name="circle-scribble"
            stretch
            className="absolute -inset-x-2 -inset-y-1.5 text-scribble [&_path]:[stroke-width:1.75px]"
          />
          <span className="sr-only"> (overdue)</span>
        </span>,
      );
    } else if (due) {
      items.push(<span key="due">{due}</span>);
    }
    items.push(<SubtaskMeter key="sub" task={task} />);
    if (task.nextReminderAt) {
      items.push(
        <span key="rem" className="flex items-center gap-1" title="Reminder">
          <Bell className="size-3.5 fill-yellow text-[var(--p-yellow)]" aria-hidden="true" />
          {timeLabel(new Date(task.nextReminderAt)).replace(' ', '')}
        </span>,
      );
    }
    if (task.counts.notes) {
      items.push(
        <span key="notes">
          {task.counts.notes} {task.counts.notes === 1 ? 'note' : 'notes'}
        </span>,
      );
    }
    if (task.energy === 'low') items.push(<span key="en">~ low energy</span>);
    if (task.estimateMin) items.push(<span key="est">={task.estimateMin}m</span>);
  }

  return (
    <div className="flex min-h-5 items-center gap-x-3 gap-y-1 text-[0.8125rem] text-fg-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{items}</div>
      {task.source === 'claude' && (
        <span title="Added by Claude" className="ml-auto text-base leading-none text-royal">
          ✳<span className="sr-only">Added by Claude</span>
        </span>
      )}
    </div>
  );
}

interface TaskCardProps extends HTMLAttributes<HTMLDivElement> {
  task: Task;
  now: Date;
  selected?: boolean;
  lifted?: boolean;
}

/** A card on the board. Visual only — drag behaviour is added by SortableCard. */
export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(function TaskCard(
  { task, now, selected, lifted, className, ...rest },
  ref,
) {
  const done = task.stage === 'done';
  const pending = task.stage === 'pending';
  const stamped = useUi((s) => s.justDone === task.id);
  return (
    <div
      ref={ref}
      data-task-id={task.id}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-2.5 rounded-md bg-surface p-4 text-left shadow-card outline-none',
        'transition-[box-shadow,transform] duration-[var(--dur-2)] hover:-translate-y-0.5',
        pending && 'shadow-[inset_3px_0_0_var(--stage-pending),var(--shadow-card)]',
        selected && 'ring-2 ring-royal',
        'focus-visible:ring-2 focus-visible:ring-royal',
        lifted && 'scale-[1.03] rotate-2 shadow-lift',
        stamped && 'lanes-stamp',
        className,
      )}
      {...rest}
    >
      {(task.project || task.priority === 'urgent' || task.priority === 'high' || done) && (
        <div className="flex min-h-6 items-center justify-between gap-2">
          {task.project ? (
            <ProjectChip name={task.project.name} color={task.project.color} />
          ) : (
            <span />
          )}
          {done ? (
            <span
              className="flex size-7 items-center justify-center rounded-full bg-yellow"
              title="Done"
              data-stamped={stamped || undefined}
            >
              {stamped ? (
                <Scribble name="check-draw" draw className="size-4 text-charcoal" />
              ) : (
                <Check className="size-4 text-charcoal" strokeWidth={2.5} aria-hidden="true" />
              )}
            </span>
          ) : (
            <PriorityMark task={task} />
          )}
        </div>
      )}

      <UserText
        as="h3"
        text={task.title}
        className={cn(
          'm-0 line-clamp-2 text-[0.9375rem] leading-snug font-medium',
          done && 'text-fg/60',
        )}
      />

      {pending && task.pendingReason && (
        <p className="m-0 line-clamp-2 text-[0.8125rem] text-fg-2 italic">
          Waiting on: <UserText text={reasonText(task.pendingReason)} />
        </p>
      )}

      <Meta task={task} now={now} />
    </div>
  );
});
