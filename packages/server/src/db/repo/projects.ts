import { PROJECT_COLORS, ulid, type Project, type ProjectColor } from '@lanes/shared';
import type { DB } from '../connection.js';

export interface ProjectRow {
  id: string;
  name: string;
  color: string;
  archived: number;
  created_at: string;
  open_count?: number;
}

const toColor = (c: string): ProjectColor =>
  (PROJECT_COLORS as readonly string[]).includes(c) ? (c as ProjectColor) : 'p-ink';

export function rowToProject(row: ProjectRow): Project {
  const project: Project = {
    id: row.id,
    name: row.name,
    color: toColor(row.color),
    archived: row.archived === 1,
    createdAt: row.created_at,
  };
  if (row.open_count !== undefined) project.openCount = row.open_count;
  return project;
}

export function listProjects(db: DB): Project[] {
  const rows = db
    .prepare(
      `SELECT p.*, (
         SELECT COUNT(*) FROM tasks t
         WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.stage != 'done'
       ) AS open_count
       FROM projects p ORDER BY p.archived, p.name COLLATE NOCASE`,
    )
    .all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProject(db: DB, id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function findProjectByName(db: DB, name: string): Project | null {
  const row = db
    .prepare('SELECT * FROM projects WHERE name = ? COLLATE NOCASE')
    .get(name.trim()) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

/** Next palette color, cycling in token order. */
function nextColor(db: DB): ProjectColor {
  const count = db.prepare('SELECT COUNT(*) FROM projects').pluck().get() as number;
  return PROJECT_COLORS[count % PROJECT_COLORS.length] ?? 'p-blue';
}

export function insertProject(db: DB, name: string, color: ProjectColor | undefined, now: string) {
  const project: Project = {
    id: ulid(),
    name: name.trim(),
    color: color ?? nextColor(db),
    archived: false,
    createdAt: now,
  };
  db.prepare(
    'INSERT INTO projects (id, name, color, archived, created_at) VALUES (?, ?, ?, 0, ?)',
  ).run(project.id, project.name, project.color, now);
  return project;
}

/** Finds a project by name (case-insensitive) or creates it. Archived projects are revived. */
export function ensureProject(db: DB, name: string, now: string): Project {
  const existing = findProjectByName(db, name);
  if (existing) {
    if (existing.archived)
      db.prepare('UPDATE projects SET archived = 0 WHERE id = ?').run(existing.id);
    return { ...existing, archived: false };
  }
  return insertProject(db, name, undefined, now);
}
