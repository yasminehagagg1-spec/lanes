import type { Note, Reminder, Task, TodayStats } from '@lanes/shared';

/** Server-Sent Events pushed to open tabs (docs/build-kit/04-API.md, "Events"). */
export type LanesEvent =
  | { type: 'task.created'; data: { task: Task; stats: TodayStats } }
  | { type: 'task.updated'; data: { task: Task; stats?: TodayStats } }
  | { type: 'task.deleted'; data: { id: string } }
  | { type: 'note.created'; data: { note: Note } }
  | { type: 'reminder.fired'; data: { reminder: Reminder; task: Task } }
  | { type: 'stats.updated'; data: { stats: TodayStats } }
  /** Everything may have changed: refetch. */
  | { type: 'data.imported'; data: { mode: 'replace' | 'merge' } };

type Listener = (event: LanesEvent) => void;

/** In-memory broadcaster. One per server process. */
export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: LanesEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken connection must never break a write.
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
