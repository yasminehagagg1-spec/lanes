import {
  dayWindow,
  weekWindow,
  type Energy,
  type FocusOutcome,
  type FocusSession,
  type Note,
  type NoteType,
  type Priority,
  type ProjectColor,
  type Reminder,
  type Settings,
  type Stage,
  type Subtask,
  type Task,
  type TaskDetail,
  type TaskQuery,
  type TaskSource,
} from '@lanes/shared';
import type { DB } from '../connection.js';

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  stage: Stage;
  position: number;
  project_id: string | null;
  priority: Priority;
  energy: Energy | null;
  due_at: string | null;
  due_has_time: number;
  estimate_min: number | null;
  resume_on: string | null;
  source: TaskSource;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  project_name: string | null;
  project_color: string | null;
}

interface SubtaskRow {
  id: string;
  task_id: string;
  title: string;
  done: number;
  position: number;
  done_at: string | null;
}

interface NoteRow {
  id: string;
  task_id: string;
  body: string;
  type: NoteType;
  stage: Stage;
  created_at: string;
}

interface ReminderRow {
  id: string;
  task_id: string;
  fire_at: string;
  message: string | null;
  fired_at: string | null;
  dismissed: number;
  created_at: string;
}

interface FocusRow {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  planned_min: number;
  actual_min: number | null;
  outcome: FocusOutcome | null;
}

const SELECT_TASK = `
  SELECT t.*, p.name AS project_name, p.color AS project_color
  FROM tasks t LEFT JOIN projects p ON p.id = t.project_id`;

export const rowToSubtask = (r: SubtaskRow): Subtask => ({
  id: r.id,
  taskId: r.task_id,
  title: r.title,
  done: r.done === 1,
  position: r.position,
  doneAt: r.done_at,
});

export const rowToNote = (r: NoteRow): Note => ({
  id: r.id,
  taskId: r.task_id,
  body: r.body,
  type: r.type,
  stage: r.stage,
  createdAt: r.created_at,
});

export const rowToReminder = (r: ReminderRow): Reminder => ({
  id: r.id,
  taskId: r.task_id,
  fireAt: r.fire_at,
  message: r.message,
  firedAt: r.fired_at,
  dismissed: r.dismissed === 1,
  createdAt: r.created_at,
});

const rowToFocus = (r: FocusRow): FocusSession => ({
  id: r.id,
  taskId: r.task_id,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  plannedMin: r.planned_min,
  actualMin: r.actual_min,
  outcome: r.outcome,
});

/** Attaches subtasks, counts, pending reason and next reminder — in a few batched queries. */
function hydrate(db: DB, rows: TaskRow[]): Task[] {
  if (rows.length === 0) return [];
  const ids = JSON.stringify(rows.map((r) => r.id));
  const inIds = 'IN (SELECT value FROM json_each(?))';

  const subtasks = new Map<string, Subtask[]>();
  for (const s of db
    .prepare(`SELECT * FROM subtasks WHERE task_id ${inIds} ORDER BY position`)
    .all(ids) as SubtaskRow[]) {
    const list = subtasks.get(s.task_id) ?? [];
    list.push(rowToSubtask(s));
    subtasks.set(s.task_id, list);
  }

  const noteCounts = new Map(
    (
      db
        .prepare(
          `SELECT task_id, COUNT(*) AS n FROM notes
           WHERE task_id ${inIds} AND type != 'stage_change' GROUP BY task_id`,
        )
        .all(ids) as { task_id: string; n: number }[]
    ).map((r) => [r.task_id, r.n]),
  );

  const reminders = new Map(
    (
      db
        .prepare(
          `SELECT task_id, COUNT(*) AS n, MIN(fire_at) AS next FROM reminders
           WHERE task_id ${inIds} AND fired_at IS NULL AND dismissed = 0 GROUP BY task_id`,
        )
        .all(ids) as { task_id: string; n: number; next: string }[]
    ).map((r) => [r.task_id, r]),
  );

  const focusMinutes = new Map(
    (
      db
        .prepare(
          `SELECT task_id, SUM(actual_min) AS m FROM focus_sessions
           WHERE task_id ${inIds} AND actual_min IS NOT NULL GROUP BY task_id`,
        )
        .all(ids) as { task_id: string; m: number }[]
    ).map((r) => [r.task_id, r.m]),
  );

  // Ordered oldest → newest, so the Map keeps the latest reason per task.
  const pendingReasons = new Map(
    (
      db
        .prepare(
          `SELECT task_id, body FROM notes
           WHERE task_id ${inIds} AND type = 'pending_reason' ORDER BY created_at, id`,
        )
        .all(ids) as { task_id: string; body: string }[]
    ).map((r) => [r.task_id, r.body]),
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    stage: r.stage,
    position: r.position,
    project:
      r.project_id && r.project_name
        ? {
            id: r.project_id,
            name: r.project_name,
            color: (r.project_color ?? 'p-ink') as ProjectColor,
          }
        : null,
    priority: r.priority,
    energy: r.energy,
    dueAt: r.due_at,
    dueHasTime: r.due_has_time === 1,
    estimateMin: r.estimate_min,
    resumeOn: r.resume_on,
    source: r.source,
    pendingReason: r.stage === 'pending' ? (pendingReasons.get(r.id) ?? null) : null,
    subtasks: subtasks.get(r.id) ?? [],
    counts: {
      notes: noteCounts.get(r.id) ?? 0,
      reminders: reminders.get(r.id)?.n ?? 0,
      focusMin: focusMinutes.get(r.id) ?? 0,
    },
    nextReminderAt: reminders.get(r.id)?.next ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  }));
}

export function getTaskRow(db: DB, id: string, includeDeleted = false): TaskRow | null {
  const row = db
    .prepare(`${SELECT_TASK} WHERE t.id = ? ${includeDeleted ? '' : 'AND t.deleted_at IS NULL'}`)
    .get(id) as TaskRow | undefined;
  return row ?? null;
}

export function getTask(db: DB, id: string): Task | null {
  const row = getTaskRow(db, id);
  return row ? (hydrate(db, [row])[0] ?? null) : null;
}

export function getTaskDetail(db: DB, id: string): TaskDetail | null {
  const task = getTask(db, id);
  if (!task) return null;
  return {
    ...task,
    notes: listNotes(db, id),
    reminders: (
      db
        .prepare('SELECT * FROM reminders WHERE task_id = ? ORDER BY fire_at')
        .all(id) as ReminderRow[]
    ).map(rowToReminder),
    focusSessions: (
      db
        .prepare('SELECT * FROM focus_sessions WHERE task_id = ? ORDER BY started_at DESC')
        .all(id) as FocusRow[]
    ).map(rowToFocus),
  };
}

export function listNotes(db: DB, taskId: string): Note[] {
  return (
    db
      .prepare('SELECT * FROM notes WHERE task_id = ? ORDER BY created_at DESC, id DESC')
      .all(taskId) as NoteRow[]
  ).map(rowToNote);
}

export function getNote(db: DB, id: string): Note | null {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined;
  return row ? rowToNote(row) : null;
}

export function getSubtask(db: DB, id: string): Subtask | null {
  const row = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as SubtaskRow | undefined;
  return row ? rowToSubtask(row) : null;
}

export function getReminder(db: DB, id: string): Reminder | null {
  const row = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as ReminderRow | undefined;
  return row ? rowToReminder(row) : null;
}

export function getFocusSession(db: DB, id: string): FocusSession | null {
  const row = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id) as
    FocusRow | undefined;
  return row ? rowToFocus(row) : null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listTasks(db: DB, query: TaskQuery, now: Date, settings: Settings): Task[] {
  const where = ['t.deleted_at IS NULL'];
  const params: (string | number)[] = [];
  const today = dayWindow(now, settings.dayStartHour);

  if (query.stage) {
    where.push('t.stage = ?');
    params.push(query.stage);
  }
  if (query.project) {
    where.push('(t.project_id = ? OR p.name = ? COLLATE NOCASE)');
    params.push(query.project, query.project);
  }
  if (query.priority) {
    where.push('t.priority = ?');
    params.push(query.priority);
  }
  if (query.energy) {
    where.push('t.energy = ?');
    params.push(query.energy);
  }
  if (query.source) {
    where.push('t.source = ?');
    params.push(query.source);
  }
  if (query.due === 'today') {
    where.push('t.due_at >= ? AND t.due_at < ?');
    params.push(today.start.toISOString(), today.end.toISOString());
  } else if (query.due === 'week') {
    const week = weekWindow(now, settings.dayStartHour, settings.weekStartsOn);
    where.push('t.due_at >= ? AND t.due_at < ?');
    params.push(today.start.toISOString(), week.end.toISOString());
  } else if (query.due === 'overdue') {
    where.push("t.due_at < ? AND t.stage != 'done'");
    params.push(now.toISOString());
  }
  if (query.q?.trim()) {
    where.push("(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')");
    const like = `%${escapeLike(query.q.trim())}%`;
    params.push(like, like);
  }
  if ((query.includeDone ?? 'today') === 'today') {
    where.push("(t.stage != 'done' OR t.completed_at >= ?)");
    params.push(today.start.toISOString());
  }

  const rows = db
    .prepare(`${SELECT_TASK} WHERE ${where.join(' AND ')} ORDER BY t.position, t.id`)
    .all(...params) as TaskRow[];
  return hydrate(db, rows);
}

/** Open tasks for "Pick for me" (new + in process). */
export function listOpenTasks(db: DB): Task[] {
  const rows = db
    .prepare(
      `${SELECT_TASK} WHERE t.deleted_at IS NULL AND t.stage IN ('new','in_process') ORDER BY t.position`,
    )
    .all() as TaskRow[];
  return hydrate(db, rows);
}

export function countTasks(db: DB): number {
  return db.prepare('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL').pluck().get() as number;
}
