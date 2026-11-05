import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCode,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { STAGES, STAGE_META, type Stage, type Task } from '@lanes/shared';
import { useUi } from '@/lib/store';
import { columnsFrom, findStage, neighbours, type Columns } from './columns';
import { Lane, PostponedFooter } from './Lane';
import { TaskCard } from './TaskCard';
import { useMoveFlow } from './useMoveFlow';

// Space picks up / drops; Enter is kept for "open the drawer".
const KEYBOARD_CODES = {
  start: ['Space'] as KeyboardCode[],
  cancel: ['Escape'] as KeyboardCode[],
  end: ['Space'] as KeyboardCode[],
};

export function Board({ groups, now }: { groups: Record<Stage, Task[]>; now: Date }) {
  const held = useUi((s) => s.held);
  const setDragging = useUi((s) => s.setDragging);
  const moveFlow = useMoveFlow();

  const base = useMemo(() => columnsFrom(groups, held), [groups, held]);
  const [dragCols, setDragCols] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const cols = dragCols ?? base;

  // After a drop, keep the dropped layout until the cache catches up (no flicker).
  const settleFrom = useRef<Columns | null>(null);
  useEffect(() => {
    if (settleFrom.current && base !== settleFrom.current) {
      settleFrom.current = null;
      setDragCols(null);
    }
  }, [base]);

  const byId = useMemo(() => {
    const map = new Map<string, Task>();
    for (const s of STAGES) for (const t of groups[s]) map.set(t.id, t);
    return map;
  }, [groups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: KEYBOARD_CODES,
    }),
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setDragCols(base);
    setDragging(true);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setDragCols((current) => {
      const c = current ?? base;
      const from = findStage(c, String(active.id));
      const to = findStage(c, String(over.id));
      if (!from || !to || from === to) return c;
      const target = [...c[to]];
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex < 0 ? target.length : overIndex, 0, String(active.id));
      return { ...c, [from]: c[from].filter((id) => id !== active.id), [to]: target };
    });
  };

  const finish = () => {
    setActiveId(null);
    setDragging(false);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const task = byId.get(id);
    const c = dragCols ?? base;
    const to = over ? findStage(c, String(over.id)) : null;
    if (!task || !over || !to) {
      setDragCols(null);
      return finish();
    }
    const column = c[to];
    const overIndex = column.indexOf(String(over.id));
    const finalCol = overIndex >= 0 ? arrayMove(column, column.indexOf(id), overIndex) : column;
    const unchanged = to === task.stage && finalCol.join() === base[to].join();
    if (unchanged) {
      setDragCols(null);
      return finish();
    }
    settleFrom.current = base;
    setDragCols({ ...c, [to]: finalCol });
    moveFlow(id, task.stage, to, neighbours(finalCol, id));
    finish();
    // Safety net in case the cache never changes (e.g. a failed request restores it).
    setTimeout(() => {
      settleFrom.current = null;
      setDragCols(null);
    }, 1200);
  };

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragCols(null);
        finish();
      }}
      accessibility={{
        announcements: {
          onDragStart: ({ active: a }) => `Picked up ${byId.get(String(a.id))?.title ?? 'card'}.`,
          onDragOver: ({ over }) =>
            over ? `Over ${STAGE_META[findStage(cols, String(over.id)) ?? 'new'].en}.` : '',
          onDragEnd: ({ over }) =>
            over
              ? `Dropped in ${STAGE_META[findStage(cols, String(over.id)) ?? 'new'].en}.`
              : 'Dropped.',
          onDragCancel: () => 'Move cancelled.',
        },
      }}
    >
      <div
        data-testid="board"
        className="grid gap-3.5 overflow-x-auto pb-4 [grid-template-columns:repeat(4,minmax(240px,1fr))_minmax(200px,0.78fr)]"
      >
        {STAGES.map((stage) => (
          <Lane
            key={stage}
            stage={stage}
            now={now}
            tasks={cols[stage].map((id) => byId.get(id)).filter((t): t is Task => !!t)}
            footer={stage === 'postponed' ? <PostponedFooter /> : undefined}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' }}>
        {active ? <TaskCard task={active} now={now} lifted /> : null}
      </DragOverlay>
    </DndContext>
  );
}
