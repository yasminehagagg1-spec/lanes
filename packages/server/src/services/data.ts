// Export / import (docs/build-kit/03-DATA-MODEL.md §6). The file holds every row, including tasks in the
// undo window, so Export → wipe → Import gives back exactly what was there.
import { z } from 'zod';
import {
  CELEBRATION_LEVELS,
  ENERGIES,
  FOCUS_OUTCOMES,
  NOTE_TYPES,
  PRIORITIES,
  PROJECT_COLORS,
  SOURCES,
  STAGES,
  SettingsSchema,
  type Settings,
} from '@lanes/shared';
import type { Ctx } from '../context.js';
import { getSettings, saveSettings } from '../db/repo/settings.js';
import { AppError } from '../errors.js';
import { backupNow } from './backup.js';
import { getTodayStats } from './stats.js';

const Id = z.string().min(1).max(64);
const Iso = z.string().min(1).max(40);
const Day = z.iso.date();

const ProjectRow = z.object({
  id: Id,
  name: z.string().trim().min(1).max(80),
  color: z.enum(PROJECT_COLORS),
  archived: z.boolean(),
  createdAt: Iso,
});
const TaskRow = z.object({
  id: Id,
  title: z.string().min(1).max(300),
  description: z.string().max(20_000),
  stage: z.enum(STAGES),
  position: z.number().finite(),
  projectId: Id.nullable(),
  priority: z.enum(PRIORITIES),
  energy: z.enum(ENERGIES).nullable(),
  dueAt: Iso.nullable(),
  dueHasTime: z.boolean(),
  estimateMin: z.number().int().positive().nullable(),
  resumeOn: Day.nullable(),
  source: z.enum(SOURCES),
  createdAt: Iso,
  updatedAt: Iso,
  startedAt: Iso.nullable(),
  completedAt: Iso.nullable(),
  deletedAt: Iso.nullable(),
});
const SubtaskRow = z.object({
  id: Id,
  taskId: Id,
  title: z.string().min(1).max(300),
  done: z.boolean(),
  position: z.number().finite(),
  doneAt: Iso.nullable(),
});
const NoteRow = z.object({
  id: Id,
  taskId: Id,
  body: z.string().max(20_000),
  type: z.enum(NOTE_TYPES),
  stage: z.enum(STAGES),
  createdAt: Iso,
});
const ReminderRow = z.object({
  id: Id,
  taskId: Id,
  fireAt: Iso,
  message: z.string().max(500).nullable(),
  firedAt: Iso.nullable(),
  dismissed: z.boolean(),
  createdAt: Iso,
});
const FocusRow = z.object({
  id: Id,
  taskId: Id,
  startedAt: Iso,
  endedAt: Iso.nullable(),
  plannedMin: z.number().int().positive(),
  actualMin: z.number().int().min(0).nullable(),
  outcome: z.enum(FOCUS_OUTCOMES).nullable(),
});

export const ExportSchema = z.object({
  app: z.literal('lanes'),
  version: z.literal(1),
  exportedAt: Iso,
  projects: z.array(ProjectRow),
  tasks: z.array(TaskRow),
  subtasks: z.array(SubtaskRow),
  notes: z.array(NoteRow),
  reminders: z.array(ReminderRow),
  focusSessions: z.array(FocusRow),
  settings: SettingsSchema.partial().extend({ celebration: z.enum(CELEBRATION_LEVELS).optional() }),
});
export type LanesExport = z.infer<typeof ExportSchema>;

export const ImportSchema = z
  .object({ mode: z.enum(['replace', 'merge']), data: z.unknown() })
  .strict();

// ---------- table mapping ----------

interface Table {
  key: Exclude<keyof LanesExport, 'app' | 'version' | 'exportedAt' | 'settings'>;
  table: string;
  columns: string[];
  booleans: string[];
}

/** Insert order (parents first). Delete in reverse. */
const TABLES: Table[] = [
  {
    key: 'projects',
    table: 'projects',
    columns: ['id', 'name', 'color', 'archived', 'created_at'],
    booleans: ['archived'],
  },
  {
    key: 'tasks',
    table: 'tasks',
    columns: [
      'id',
      'title',
      'description',
      'stage',
      'position',
      'project_id',
      'priority',
      'energy',
      'due_at',
      'due_has_time',
      'estimate_min',
      'resume_on',
      'source',
      'created_at',
      'updated_at',
      'started_at',
      'completed_at',
      'deleted_at',
    ],
    booleans: ['due_has_time'],
  },
  {
    key: 'subtasks',
    table: 'subtasks',
    columns: ['id', 'task_id', 'title', 'done', 'position', 'done_at'],
    booleans: ['done'],
  },
  {
    key: 'notes',
    table: 'notes',
    columns: ['id', 'task_id', 'body', 'type', 'stage', 'created_at'],
    booleans: [],
  },
  {
    key: 'reminders',
    table: 'reminders',
    columns: ['id', 'task_id', 'fire_at', 'message', 'fired_at', 'dismissed', 'created_at'],
    booleans: ['dismissed'],
  },
  {
    key: 'focusSessions',
    table: 'focus_sessions',
    columns: ['id', 'task_id', 'started_at', 'ended_at', 'planned_min', 'actual_min', 'outcome'],
    booleans: [],
  },
];

const camel = (col: string) => col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function exportData(ctx: Ctx): LanesExport {
  const out: Record<string, unknown> = {
    app: 'lanes',
    version: 1,
    exportedAt: ctx.clock().toISOString(),
  };
  for (const t of TABLES) {
    const rows = ctx.db
      .prepare(`SELECT ${t.columns.join(', ')} FROM ${t.table} ORDER BY id`)
      .all() as Record<string, unknown>[];
    out[t.key] = rows.map((row) =>
      Object.fromEntries(
        t.columns.map((c) => [camel(c), t.booleans.includes(c) ? row[c] === 1 : row[c]]),
      ),
    );
  }
  out.settings = getSettings(ctx.db);
  return out as LanesExport;
}

export interface ImportResult {
  mode: 'replace' | 'merge';
  added: Record<Table['key'], number>;
  skipped: number;
  backup: string;
}

function readExport(raw: unknown): LanesExport {
  const parsed = ExportSchema.safeParse(raw);
  if (!parsed.success) {
    const app = (raw as { app?: unknown } | null)?.app;
    if (app !== 'lanes')
      throw new AppError('NOT_A_LANES_FILE', 400, 'That file isn’t a Lanes export.');
    throw new AppError(
      'BAD_EXPORT',
      400,
      `That export doesn’t look right: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

export function importData(
  ctx: Ctx,
  dataDir: string,
  mode: 'replace' | 'merge',
  raw: unknown,
): ImportResult {
  const data = readExport(raw);
  const db = ctx.db;
  const exists = (table: string, id: string) =>
    db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).pluck().get(id) !== undefined;

  // Merge: a project with the same name already here takes the imported one's place.
  const projectIdMap = new Map<string, string>();
  if (mode === 'merge') {
    for (const p of data.projects) {
      if (exists('projects', p.id)) continue;
      const same = db
        .prepare('SELECT id FROM projects WHERE name = ? COLLATE NOCASE')
        .pluck()
        .get(p.name) as string | undefined;
      if (same) projectIdMap.set(p.id, same);
    }
  }

  // Every row must point at something that will exist.
  const taskIds = new Set(data.tasks.map((t) => t.id));
  const projectIds = new Set(data.projects.map((p) => p.id));
  const taskKnown = (id: string) => taskIds.has(id) || (mode === 'merge' && exists('tasks', id));
  for (const t of data.tasks) {
    if (
      t.projectId &&
      !projectIds.has(t.projectId) &&
      !(mode === 'merge' && exists('projects', t.projectId))
    ) {
      throw new AppError(
        'BAD_EXPORT',
        400,
        `Task “${t.title}” points at a project that isn’t in the file.`,
      );
    }
  }
  for (const key of ['subtasks', 'notes', 'reminders', 'focusSessions'] as const) {
    for (const row of data[key]) {
      if (!taskKnown(row.taskId)) {
        throw new AppError(
          'BAD_EXPORT',
          400,
          `Some ${key} point at a task that isn’t in the file.`,
        );
      }
    }
  }

  const backup = backupNow(db, dataDir, ctx.clock(), 'before-import');
  const added = Object.fromEntries(TABLES.map((t) => [t.key, 0])) as ImportResult['added'];
  let skipped = 0;

  db.transaction(() => {
    if (mode === 'replace') {
      for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t.table}`).run();
    }
    for (const t of TABLES) {
      const insert = db.prepare(
        `INSERT OR IGNORE INTO ${t.table} (${t.columns.join(', ')}) VALUES (${t.columns.map(() => '?').join(', ')})`,
      );
      for (const row of data[t.key] as Record<string, unknown>[]) {
        if (t.key === 'projects' && projectIdMap.has(row.id as string)) {
          skipped++;
          continue;
        }
        const values = t.columns.map((c) => {
          let v = row[camel(c)];
          if (c === 'project_id' && typeof v === 'string') v = projectIdMap.get(v) ?? v;
          if (t.booleans.includes(c)) return v ? 1 : 0;
          return v ?? null;
        });
        if (insert.run(...values).changes) added[t.key]++;
        else skipped++;
      }
    }
    if (mode === 'replace') {
      db.prepare('DELETE FROM settings').run();
      saveSettings(db, data.settings as Partial<Settings>);
    }
  })();

  ctx.events.emit({ type: 'data.imported', data: { mode } });
  ctx.events.emit({ type: 'stats.updated', data: { stats: getTodayStats(ctx) } });
  return { mode, added, skipped, backup: backup.name };
}
