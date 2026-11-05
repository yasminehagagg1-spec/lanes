import { STAGE_META, type Task, type TaskDetail, type TodayStats } from '@lanes/shared';

const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Thu 5 Nov, 3:00 pm" or "Thu 5 Nov". */
export function when(iso: string, hasTime = true): string {
  const d = new Date(iso);
  const day = DATE.format(d);
  return hasTime ? `${day}, ${TIME.format(d).toLowerCase()}` : day;
}

export const stageName = (t: Pick<Task, 'stage'>) => STAGE_META[t.stage].en;

/** One line: `id · title · stage · project · due …`. */
export function line(t: Task): string {
  const bits = [t.id, `“${t.title}”`, stageName(t)];
  if (t.project) bits.push(`#${t.project.name}`);
  if (t.priority !== 'normal') bits.push(`!${t.priority}`);
  if (t.dueAt) bits.push(`due ${when(t.dueAt, t.dueHasTime)}`);
  if (t.pendingReason) bits.push(`waiting on: ${t.pendingReason}`);
  if (t.resumeOn) bits.push(`back ${when(`${t.resumeOn}T12:00:00`, false)}`);
  return bits.join(' · ');
}

export function detail(t: TaskDetail, link: string): string {
  const out = [`“${t.title}” — ${stageName(t)}`, `id ${t.id} · ${link}`];
  const meta: string[] = [];
  if (t.project) meta.push(`project ${t.project.name}`);
  meta.push(`priority ${t.priority}`);
  if (t.energy) meta.push(`${t.energy} energy`);
  if (t.estimateMin) meta.push(`~${t.estimateMin} min`);
  if (t.counts.focusMin) meta.push(`${t.counts.focusMin} min focused`);
  out.push(meta.join(' · '));
  if (t.dueAt) out.push(`Due ${when(t.dueAt, t.dueHasTime)}`);
  if (t.pendingReason) out.push(`Waiting on: ${t.pendingReason}`);
  if (t.resumeOn) out.push(`Comes back ${when(`${t.resumeOn}T12:00:00`, false)}`);
  if (t.description) out.push('', t.description);
  if (t.subtasks.length) {
    out.push('', 'Steps:');
    for (const s of t.subtasks) out.push(`${s.done ? '✓' : '○'} ${s.title}`);
  }
  const upcoming = t.reminders.filter((r) => !r.firedAt && !r.dismissed);
  if (upcoming.length) {
    out.push('', 'Reminders:');
    for (const r of upcoming) out.push(`- ${when(r.fireAt)}${r.message ? ` — ${r.message}` : ''}`);
  }
  if (t.notes.length) {
    out.push('', 'Notes (newest first):');
    for (const n of t.notes.slice(0, 15)) {
      out.push(`- ${when(n.createdAt)} [${n.type}] ${n.body.replace(/\s+/g, ' ').slice(0, 400)}`);
    }
  }
  return out.join('\n');
}

export function statsLine(s: TodayStats): string {
  const pct = Math.round(s.momentum * 100);
  const streak = s.streakDays > 0 ? ` · ${s.streakDays}-day streak` : '';
  return `Today: ${s.doneToday} done, momentum ${pct}% of a ${s.goal}-point goal${streak}`;
}
