import { STAGES, dayWindow, weekWindow, type Stage, type Task } from '@lanes/shared';
import type { Filters } from './store';

const pad = (n: number) => String(n).padStart(2, '0');

/** "3:00 pm" */
export function timeLabel(date: Date): string {
  const h = date.getHours();
  return `${h % 12 || 12}:${pad(date.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);

/** Short relative day: Today, Tomorrow, Yesterday, Thu, Next week, Nov 12. */
export function dayLabel(date: Date, now = new Date()): string {
  const diff = dayDiff(date, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return date.toLocaleDateString('en-GB', { weekday: 'short' });
  if (diff >= 7 && diff < 14) return 'Next week';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dueLabel(
  task: Pick<Task, 'dueAt' | 'dueHasTime'>,
  now = new Date(),
): string | null {
  if (!task.dueAt) return null;
  const d = new Date(task.dueAt);
  const day = dayLabel(d, now);
  return task.dueHasTime ? `${day} ${timeLabel(d)}` : day;
}

export function isOverdue(task: Pick<Task, 'dueAt' | 'stage'>, now = new Date()): boolean {
  return !!task.dueAt && task.stage !== 'done' && new Date(task.dueAt) < now;
}

export function resumeLabel(resumeOn: string | null): string {
  if (!resumeOn) return 'Someday';
  const [y, m, d] = resumeOn.split('-').map(Number);
  const date = new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1);
  return `Back on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function noteTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return `${dayLabel(d, now)}, ${timeLabel(d)}`;
}

/** For <input type="datetime-local"> / <input type="date">. */
export function toLocalInput(iso: string | null, withTime = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
export const isArabic = (text: string) => ARABIC.test(text);

export function countWord(n: number): string {
  return (
    ['Nothing', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] ??
    String(n)
  );
}

// ---------- filtering (client side: the list is local and small) ----------

export function applyFilters(
  tasks: Task[],
  filters: Filters,
  search: string,
  opts: { now: Date; dayStartHour: number; weekStartsOn: number },
): Task[] {
  const q = search.trim().toLocaleLowerCase();
  const today = dayWindow(opts.now, opts.dayStartHour);
  const week = weekWindow(opts.now, opts.dayStartHour, opts.weekStartsOn);
  return tasks.filter((t) => {
    if (filters.projectId && t.project?.id !== filters.projectId) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.energy && t.energy !== filters.energy) return false;
    if (filters.source && t.source !== filters.source) return false;
    if (filters.due) {
      if (!t.dueAt) return false;
      const due = new Date(t.dueAt);
      if (filters.due === 'today' && (due < today.start || due >= today.end)) return false;
      if (filters.due === 'week' && (due < today.start || due >= week.end)) return false;
      if (filters.due === 'overdue' && !isOverdue(t, opts.now)) return false;
    }
    if (q && !`${t.title}\n${t.description}`.toLocaleLowerCase().includes(q)) return false;
    return true;
  });
}

export function groupByStage(tasks: Task[]): Record<Stage, Task[]> {
  const groups = Object.fromEntries(STAGES.map((s) => [s, [] as Task[]])) as Record<Stage, Task[]>;
  for (const t of [...tasks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))) {
    groups[t.stage].push(t);
  }
  // Done shows the most recent finish first.
  groups.done.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return groups;
}
