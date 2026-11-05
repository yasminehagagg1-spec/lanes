// Subtasks, notes, reminders and focus sessions — the things that hang off a task.
import {
  dayWindow,
  presetTime,
  ulid,
  type FocusOutcome,
  type FocusSession,
  type Note,
  type Reminder,
  type ReminderPreset,
  type Subtask,
  type Task,
  type TodayStats,
} from '@lanes/shared';
import { nowIso, type Ctx } from '../context.js';
import {
  getFocusSession,
  getNote,
  getReminder,
  getSubtask,
  getTask,
  getTaskRow,
} from '../db/repo/tasks.js';
import { getSettings } from '../db/repo/settings.js';
import { AppError, notFound } from '../errors.js';
import { getTodayStats } from './stats.js';
import { insertNote, moveTask } from './tasks.js';

function requireTask(ctx: Ctx, id: string) {
  const row = getTaskRow(ctx.db, id);
  if (!row) throw notFound('Task');
  return row;
}

function touchTask(ctx: Ctx, taskId: string, stats?: TodayStats): Task {
  ctx.db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(nowIso(ctx), taskId);
  const task = getTask(ctx.db, taskId);
  if (!task) throw notFound('Task');
  ctx.events.emit({ type: 'task.updated', data: stats ? { task, stats } : { task } });
  return task;
}

// ---------- subtasks ----------

export function addSubtask(ctx: Ctx, taskId: string, title: string): Subtask {
  requireTask(ctx, taskId);
  const max = ctx.db
    .prepare('SELECT MAX(position) FROM subtasks WHERE task_id = ?')
    .pluck()
    .get(taskId) as number | null;
  const id = ulid();
  ctx.db
    .prepare('INSERT INTO subtasks (id, task_id, title, done, position) VALUES (?, ?, ?, 0, ?)')
    .run(id, taskId, title.trim(), (max ?? 0) + 1);
  touchTask(ctx, taskId);
  return getSubtask(ctx.db, id) as Subtask;
}

/** Checking a subtask is a micro-win, so the fresh stats come back with it. */
export function updateSubtask(
  ctx: Ctx,
  id: string,
  patch: { title?: string | undefined; done?: boolean | undefined; position?: number | undefined },
): { subtask: Subtask; stats: TodayStats } {
  const current = getSubtask(ctx.db, id);
  if (!current || !getTaskRow(ctx.db, current.taskId)) throw notFound('Subtask');

  const sets: Record<string, string | number | null> = {};
  if (patch.title !== undefined) sets.title = patch.title.trim();
  if (patch.position !== undefined) sets.position = patch.position;
  if (patch.done !== undefined && patch.done !== current.done) {
    sets.done = patch.done ? 1 : 0;
    sets.done_at = patch.done ? nowIso(ctx) : null;
  }
  const columns = Object.keys(sets);
  if (columns.length) {
    ctx.db
      .prepare(
        `UPDATE subtasks SET ${columns.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`,
      )
      .run({ ...sets, id });
  }
  const stats = getTodayStats(ctx);
  touchTask(ctx, current.taskId, stats);
  return { subtask: getSubtask(ctx.db, id) as Subtask, stats };
}

export function deleteSubtask(ctx: Ctx, id: string): { ok: true } {
  const current = getSubtask(ctx.db, id);
  if (!current) throw notFound('Subtask');
  ctx.db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
  touchTask(ctx, current.taskId, getTodayStats(ctx));
  return { ok: true };
}

// ---------- notes (allowed in every stage) ----------

const EDITABLE_NOTES = new Set(['note', 'claude']);

export function addNote(
  ctx: Ctx,
  taskId: string,
  body: string,
  type: 'note' | 'claude' = 'note',
): Note {
  const row = requireTask(ctx, taskId);
  const id = insertNote(ctx.db, taskId, body.trim(), type, row.stage, nowIso(ctx));
  const note = getNote(ctx.db, id) as Note;
  ctx.events.emit({ type: 'note.created', data: { note } });
  touchTask(ctx, taskId);
  return note;
}

function editableNote(ctx: Ctx, id: string): Note {
  const note = getNote(ctx.db, id);
  if (!note) throw notFound('Note');
  if (!EDITABLE_NOTES.has(note.type)) {
    throw new AppError('NOTE_NOT_EDITABLE', 409, 'Only your own notes can be changed.');
  }
  return note;
}

export function updateNote(ctx: Ctx, id: string, body: string): Note {
  const note = editableNote(ctx, id);
  ctx.db.prepare('UPDATE notes SET body = ? WHERE id = ?').run(body.trim(), id);
  touchTask(ctx, note.taskId);
  return getNote(ctx.db, id) as Note;
}

export function deleteNote(ctx: Ctx, id: string): { ok: true } {
  const note = editableNote(ctx, id);
  ctx.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  touchTask(ctx, note.taskId);
  return { ok: true };
}

// ---------- reminders ----------

export function addReminder(
  ctx: Ctx,
  taskId: string,
  input:
    | { fireAt: string; message?: string | undefined }
    | { preset: ReminderPreset; message?: string | undefined },
): Reminder {
  requireTask(ctx, taskId);
  const fireAt = 'preset' in input ? presetTime(input.preset, ctx.clock()) : new Date(input.fireAt);
  const id = ulid();
  ctx.db
    .prepare(
      'INSERT INTO reminders (id, task_id, fire_at, message, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, taskId, fireAt.toISOString(), input.message || null, nowIso(ctx));
  touchTask(ctx, taskId);
  return getReminder(ctx.db, id) as Reminder;
}

export function upcomingReminders(
  ctx: Ctx,
  withinMs: number,
): (Reminder & { taskTitle: string })[] {
  const until = new Date(ctx.clock().getTime() + withinMs).toISOString();
  const rows = ctx.db
    .prepare(
      `SELECT r.id, t.title AS task_title FROM reminders r JOIN tasks t ON t.id = r.task_id
       WHERE r.fired_at IS NULL AND r.dismissed = 0 AND t.deleted_at IS NULL AND r.fire_at <= ?
       ORDER BY r.fire_at`,
    )
    .all(until) as { id: string; task_title: string }[];
  return rows.map((r) => ({ ...(getReminder(ctx.db, r.id) as Reminder), taskTitle: r.task_title }));
}

/** Snoozing creates a fresh reminder and dismisses the old one. */
export function snoozeReminder(ctx: Ctx, id: string, minutes: number): Reminder {
  const old = getReminder(ctx.db, id);
  if (!old) throw notFound('Reminder');
  ctx.db.prepare('UPDATE reminders SET dismissed = 1 WHERE id = ?').run(id);
  const fireAt = new Date(ctx.clock().getTime() + minutes * 60_000).toISOString();
  return addReminder(ctx, old.taskId, {
    fireAt,
    ...(old.message ? { message: old.message } : {}),
  });
}

/** Reminders that already rang today and haven't been dealt with (for the bell). */
export function rangReminders(ctx: Ctx): (Reminder & { taskTitle: string })[] {
  const { start } = dayWindow(ctx.clock(), getSettings(ctx.db).dayStartHour);
  const rows = ctx.db
    .prepare(
      `SELECT r.id, t.title AS task_title FROM reminders r JOIN tasks t ON t.id = r.task_id
       WHERE r.fired_at IS NOT NULL AND r.fired_at >= ? AND r.dismissed = 0 AND t.deleted_at IS NULL
       ORDER BY r.fired_at DESC`,
    )
    .all(start.toISOString()) as { id: string; task_title: string }[];
  return rows.map((r) => ({ ...(getReminder(ctx.db, r.id) as Reminder), taskTitle: r.task_title }));
}

/** "Got it" — opened, done, or closed from the toast. */
export function dismissReminder(ctx: Ctx, id: string): Reminder {
  if (!getReminder(ctx.db, id)) throw notFound('Reminder');
  ctx.db.prepare('UPDATE reminders SET dismissed = 1 WHERE id = ?').run(id);
  return getReminder(ctx.db, id) as Reminder;
}

export function deleteReminder(ctx: Ctx, id: string): { ok: true } {
  const old = getReminder(ctx.db, id);
  if (!old) throw notFound('Reminder');
  ctx.db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
  touchTask(ctx, old.taskId);
  return { ok: true };
}

// ---------- focus sessions ----------

export function startFocus(
  ctx: Ctx,
  taskId: string,
  plannedMin: number,
): { session: FocusSession; task: Task } {
  const row = requireTask(ctx, taskId);
  // During focus the task lives in In process.
  if (row.stage !== 'in_process' && row.stage !== 'done') {
    moveTask(ctx, taskId, { stage: 'in_process' });
  }
  const id = ulid();
  ctx.db
    .prepare(
      'INSERT INTO focus_sessions (id, task_id, started_at, planned_min) VALUES (?, ?, ?, ?)',
    )
    .run(id, taskId, nowIso(ctx), plannedMin);
  return {
    session: getFocusSession(ctx.db, id) as FocusSession,
    task: getTask(ctx.db, taskId) as Task,
  };
}

export function endFocus(
  ctx: Ctx,
  id: string,
  outcome: FocusOutcome,
  note?: string,
): { session: FocusSession; task: Task; stats: TodayStats } {
  const session = getFocusSession(ctx.db, id);
  if (!session) throw notFound('Focus session');
  if (session.endedAt)
    throw new AppError('FOCUS_ALREADY_ENDED', 409, 'This session already ended.');
  const row = requireTask(ctx, session.taskId);

  const now = ctx.clock();
  const actual = Math.max(1, Math.round((now.getTime() - Date.parse(session.startedAt)) / 60_000));
  ctx.db.transaction(() => {
    ctx.db
      .prepare('UPDATE focus_sessions SET ended_at = ?, actual_min = ?, outcome = ? WHERE id = ?')
      .run(now.toISOString(), actual, outcome, id);
    const body = note?.trim() ? `Focused ${actual} min — ${note.trim()}` : `Focused ${actual} min`;
    insertNote(ctx.db, session.taskId, body, 'focus_log', row.stage, now.toISOString());
  })();

  let task: Task;
  if (outcome === 'completed_task' && row.stage !== 'done') {
    task = moveTask(ctx, session.taskId, { stage: 'done' }).task;
  } else {
    task = touchTask(ctx, session.taskId);
  }
  const stats = getTodayStats(ctx);
  ctx.events.emit({ type: 'stats.updated', data: { stats } });
  return { session: getFocusSession(ctx.db, id) as FocusSession, task, stats };
}
