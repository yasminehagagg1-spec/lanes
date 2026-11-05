import { STAGES, type Stage, type Task } from '@lanes/shared';
import type { HeldMove } from '@/lib/store';

export type Columns = Record<Stage, string[]>;

export function columnsFrom(groups: Record<Stage, Task[]>, held: HeldMove | null): Columns {
  const cols = Object.fromEntries(STAGES.map((s) => [s, groups[s].map((t) => t.id)])) as Columns;
  return held ? placeHeld(cols, held) : cols;
}

/** Shows a move that's waiting on the Pending/Postponed sheet as if it already happened. */
function placeHeld(cols: Columns, held: HeldMove): Columns {
  const next = Object.fromEntries(
    STAGES.map((s) => [s, cols[s].filter((id) => id !== held.id)]),
  ) as Columns;
  const target = next[held.stage];
  let at = 0;
  if (held.afterId && target.includes(held.afterId)) at = target.indexOf(held.afterId) + 1;
  else if (held.beforeId && target.includes(held.beforeId)) at = target.indexOf(held.beforeId);
  target.splice(at, 0, held.id);
  return next;
}

export function findStage(cols: Columns, id: string): Stage | null {
  if (id.startsWith('lane:')) return id.slice(5) as Stage;
  return STAGES.find((s) => cols[s].includes(id)) ?? null;
}

/** Neighbours of `id` in its column, for the server's position math. */
export function neighbours(column: string[], id: string): { afterId?: string; beforeId?: string } {
  const i = column.indexOf(id);
  const afterId = column[i - 1];
  const beforeId = column[i + 1];
  return { ...(afterId ? { afterId } : {}), ...(beforeId ? { beforeId } : {}) };
}
