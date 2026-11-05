// pnpm seed — fresh DEV database with realistic tasks, shaped like design/mockup.png:
// 3 done today + 2 subtasks today (3.5 points), a 6-day streak, every stage populated.
import fs from 'node:fs';
import path from 'node:path';
import { dayWindow, localDateKey, type ProjectColor, type TaskDraft } from '@lanes/shared';
import type { Ctx } from '../context.js';
import { openDatabase } from '../db/connection.js';
import { insertProject } from '../db/repo/projects.js';
import { EventBus } from '../events.js';
import { addNote, addSubtask, updateSubtask } from '../services/items.js';
import { createTask, moveTask } from '../services/tasks.js';
import { devDataDir } from './guard.js';

const dir = devDataDir();
fs.mkdirSync(dir, { recursive: true });
for (const file of ['lanes.db', 'lanes.db-wal', 'lanes.db-shm']) {
  fs.rmSync(path.join(dir, file), { force: true });
}

const now = new Date();
const ctx: Ctx = {
  db: openDatabase(path.join(dir, 'lanes.db')),
  clock: () => now,
  events: new EventBus(),
};
const { db } = ctx;
const { start: dayStart } = dayWindow(now, 6);

// ---- time helpers ----
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const daysFromNow = (d: number, hour?: number, minute = 0) => {
  const x = new Date(now.getTime() + d * DAY);
  if (hour !== undefined) x.setHours(hour, minute, 0, 0);
  return x;
};
const dateOnly = (d: number) => localDateKey(daysFromNow(d));
/** A moment earlier today (fraction 0..1 of the time since the day started). */
const earlierToday = (f: number) =>
  new Date(dayStart.getTime() + (now.getTime() - dayStart.getTime()) * f);
const iso = (d: Date) => d.toISOString();

// ---- projects ----
const projects: [string, ProjectColor][] = [
  ['Kitebird', 'p-blue'],
  ['Northfield Studio', 'p-violet'],
  ['Jewelry catalog', 'p-yellow'],
  ['Personal', 'p-ink'],
  ['Café rebrand', 'p-teal'],
  ['Real estate site', 'p-rose'],
];
for (const [name, color] of projects) insertProject(db, name, color, iso(now));

const add = (draft: TaskDraft) => createTask(ctx, draft, 'manual').task.id;
const setCol = (table: string, col: string, value: string | null, id: string) =>
  db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`).run(value, id);

/** Ticks n subtasks of a task, stamping them at `when`. */
function tick(taskId: string, n: number, when: Date) {
  const ids = db
    .prepare('SELECT id FROM subtasks WHERE task_id = ? ORDER BY position LIMIT ?')
    .pluck()
    .all(taskId, n) as string[];
  for (const id of ids) {
    updateSubtask(ctx, id, { done: true });
    setCol('subtasks', 'done_at', iso(when), id);
  }
}

function finish(taskId: string, when: Date) {
  moveTask(ctx, taskId, { stage: 'done' });
  setCol('tasks', 'completed_at', iso(when), taskId);
}

// ---- New ----
add({
  title: 'Send final homepage banners for the winter sale',
  project: 'Kitebird',
  priority: 'urgent',
  dueAt: iso(daysFromNow(1, 15)),
  reminders: [{ fireAt: iso(daysFromNow(1, 13)) }],
  source: 'claude',
  notes: ['Client wants the red version as the hero.'],
});
add({
  title: 'Call the printer about paper stock samples',
  project: 'Jewelry catalog',
  priority: 'high',
  energy: 'low',
  dueAt: dateOnly(2),
});
const portfolio = add({
  title: 'تحديث البورتفوليو على بيهانس',
  project: 'Personal',
  subtasks: ['اختيار المشاريع', 'صور الموكاب', 'كتابة الوصف', 'الغلاف', 'النشر'],
  notes: ['ابدئي بمشروع باكمان', 'Use the new cover grid'],
});
tick(portfolio, 1, daysFromNow(-1));
add({
  title: 'Mascot exploration — 3 JSON prompt directions',
  project: 'Café rebrand',
  dueAt: dateOnly(7),
  estimateMin: 45,
  energy: 'high',
});

// ---- In process ----
const grid = add({
  title: 'Social grid for the fragrance launch — 9 posts',
  project: 'Northfield Studio',
  priority: 'high',
  stage: 'in_process',
  dueAt: dateOnly(-1),
  subtasks: Array.from({ length: 9 }, (_, i) => `Post ${i + 1}`),
  notes: ['Palette locked: amber + ink', 'Copy from Lina by Tuesday', 'Post 4 needs a reshoot'],
});
tick(grid, 6, daysFromNow(-1));
const spacing = add({
  title: 'Fix product card spacing in the design system',
  project: 'Kitebird',
  stage: 'in_process',
  dueAt: dateOnly(0),
  subtasks: ['Audit paddings', 'Update tokens', 'Fix card component', 'QA on mobile'],
  energy: 'medium',
});
tick(spacing, 2, earlierToday(0.5)); // 2 subtasks today → +0.5 points

// ---- Pending ----
const menu = add({
  title: 'Menu layout, Arabic + English',
  project: 'Café rebrand',
  stage: 'pending',
  pendingReason: 'their final prices',
  dueAt: dateOnly(4),
});
addNote(ctx, menu, 'Draft v2 sent on WhatsApp.');
add({
  title: 'Webflow CMS migration',
  project: 'Real estate site',
  stage: 'pending',
  pendingReason: 'hosting access from their IT',
  reminders: [{ fireAt: iso(daysFromNow(2, 10)) }],
});

// ---- Done today (3 tasks → 3 points) ----
finish(add({ title: 'Export icon set for dev handoff', project: 'Kitebird' }), earlierToday(0.4));
const invoice = add({
  title: 'Invoice October freelance work',
  project: 'Personal',
  energy: 'low',
});
db.prepare(
  `INSERT INTO focus_sessions (id, task_id, started_at, ended_at, planned_min, actual_min, outcome)
   VALUES ('seed-focus-1', ?, ?, ?, 30, 25, 'stopped')`,
).run(invoice, iso(daysFromNow(-1, 16)), iso(daysFromNow(-1, 16, 25)));
finish(invoice, earlierToday(0.6));
finish(
  add({ title: 'Reply to feedback on the nightlife flyer', project: 'Northfield Studio' }),
  earlierToday(0.8),
);

// ---- Postponed ----
const framer = add({ title: 'Learn Framer motion components', project: 'Personal' });
moveTask(ctx, framer, {
  stage: 'postponed',
  resumeOn: localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
});
moveTask(ctx, add({ title: 'Redo personal logo lockups', project: 'Personal' }), {
  stage: 'postponed',
});

// ---- History: one finish on each of the last 5 days → 6-day streak ----
const history: [string, string][] = [
  ['Moodboard for the café rebrand', 'Café rebrand'],
  ['Kitebird newsletter header', 'Kitebird'],
  ['Jewelry catalog cover options', 'Jewelry catalog'],
  ['Renew the portfolio domain', 'Personal'],
  ['Proofread the Northfield Studio deck', 'Northfield Studio'],
];
history.forEach(([title, project], i) => {
  finish(add({ title, project }), daysFromNow(-(i + 1), 15));
});

// Keep a manual subtask so the API path is exercised too.
addSubtask(ctx, spacing, 'Screenshot before/after');

const counts = db
  .prepare('SELECT stage, COUNT(*) AS n FROM tasks GROUP BY stage ORDER BY stage')
  .all() as { stage: string; n: number }[];
console.log(`Seeded ${dir}`);
console.log(counts.map((c) => `  ${c.stage.padEnd(11)} ${c.n}`).join('\n'));
db.close();
