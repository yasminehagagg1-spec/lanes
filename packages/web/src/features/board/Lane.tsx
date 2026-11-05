import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Plus } from 'lucide-react';
import { STAGE_META, type Stage, type Task } from '@lanes/shared';
import { Scribble } from '@/components/Scribble';
import { cn, StageDot } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';
import { TaskCard } from './TaskCard';

const EMPTY_COPY: Partial<Record<Stage, string>> = {
  in_process: 'Nothing in motion. Pick one and start.',
  pending: 'Nothing waiting on anyone.',
  done: 'Nothing finished yet. Not a verdict, just a morning.',
  postponed: 'Nothing pushed back.',
};

export const laneId = (stage: Stage) => `lane:${stage}`;

function SortableCard({ task, now }: { task: Task; now: Date }) {
  const selected = useUi((s) => s.selectedId === task.id);
  const openDrawer = useUi((s) => s.openDrawer);
  const select = useUi((s) => s.select);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { stage: task.stage },
  });

  if (isDragging) {
    // The card itself rides in the DragOverlay; leave a dashed slot where it will land.
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className="h-24 rounded-md border-2 border-dashed border-fg-3/60"
      />
    );
  }

  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      now={now}
      selected={selected}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription="task card"
      aria-label={`${task.title}, ${STAGE_META[task.stage].en}`}
      onFocus={() => select(task.id)}
      onClick={() => openDrawer(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          openDrawer(task.id);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
    />
  );
}

interface LaneProps {
  stage: Stage;
  tasks: Task[];
  now: Date;
  footer?: ReactNode;
}

export function Lane({ stage, tasks, now, footer }: LaneProps) {
  const meta = STAGE_META[stage];
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  const { setNodeRef, isOver } = useDroppable({ id: laneId(stage), data: { stage } });
  const canAdd = stage !== 'done' && stage !== 'postponed';

  return (
    <section
      aria-label={`${meta.en} lane`}
      data-stage={stage}
      className={cn(
        'flex min-w-0 flex-col self-start rounded-lg bg-lane p-3 transition-colors',
        isOver && 'bg-[color-mix(in_srgb,var(--lane-bg)_88%,var(--royal))]',
      )}
    >
      <header className="flex items-center gap-3 px-2 pt-1 pb-3">
        {stage === 'done' ? (
          <span
            className="flex size-3 items-center justify-center rounded-full bg-stage-done"
            aria-hidden="true"
          >
            <Check className="size-2 text-charcoal" strokeWidth={4} />
          </span>
        ) : (
          <StageDot stage={stage} />
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <h2 className="m-0 text-base font-semibold">
            {stage === 'done' ? 'Done today' : meta.en}
          </h2>
          <div lang="ar" className="text-sm text-fg-2/70">
            {meta.ar}
          </div>
        </div>
        <span
          className="tabular flex h-7 min-w-7 items-center justify-center rounded-full bg-surface px-2 text-xs font-semibold"
          aria-label={`${tasks.length} tasks`}
        >
          {tasks.length}
        </span>
        {canAdd && (
          <button
            type="button"
            aria-label={`Add to ${meta.en}`}
            onClick={() => openQuickAdd(stage)}
            className="flex size-7 items-center justify-center rounded-full bg-surface text-fg-2 transition hover:text-fg"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        )}
      </header>

      <SortableContext
        id={laneId(stage)}
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="flex min-h-24 flex-col gap-3">
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} now={now} />
          ))}
          {tasks.length === 0 && stage === 'new' && <NewLaneEmpty />}
          {tasks.length === 0 && stage !== 'new' && (
            <div className="flex min-h-24 items-center justify-center rounded-md border-2 border-dashed border-fg-3/40 px-4 text-center text-sm text-fg-2">
              {EMPTY_COPY[stage]}
            </div>
          )}
        </div>
      </SortableContext>

      {footer}
    </section>
  );
}

/** Empty New lane: a hand-drawn arrow up to the + and an invitation to brain-dump. */
function NewLaneEmpty() {
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  return (
    <button
      type="button"
      data-testid="empty-new"
      onClick={() => openQuickAdd('new')}
      className="group relative flex min-h-40 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-fg-3/40 px-4 pt-8 pb-5 text-center transition hover:border-royal/60"
    >
      <Scribble
        name="arrow-swoop"
        draw
        className="absolute -top-2 right-3 h-14 w-20 -scale-y-100 -rotate-12 text-royal"
      />
      <span className="text-[0.9375rem] font-semibold text-fg">Dump everything here.</span>
      <span className="text-sm text-fg-2">Sort it later.</span>
      <span lang="ar" dir="rtl" className="mt-1.5 text-sm text-fg-2/70">
        طلّعي كل اللي في دماغك
      </span>
    </button>
  );
}

export function PostponedFooter() {
  return (
    <div className="flex items-center justify-center gap-2 pt-4 pb-1 text-sm text-fg-2">
      <Scribble name="arrow-swoop" className="h-5 w-9 rotate-[200deg] -scale-y-100 text-fg/40" />
      Not now isn’t never.
    </div>
  );
}
