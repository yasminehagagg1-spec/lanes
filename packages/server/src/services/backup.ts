// Database copies in <dataDir>/backups: one a day (on startup and every 24h), one before
// every import, and any made by hand. Only the newest KEEP_BACKUPS are kept.
import fs from 'node:fs';
import path from 'node:path';
import { localDateKey } from '@lanes/shared';
import type { DB } from '../db/connection.js';

export const KEEP_BACKUPS = 14;
const FILE = /^lanes-(\d{4}-\d{2}-\d{2})(?:-(\d{6})-(manual|before-import))?\.db$/;

export type BackupKind = 'daily' | 'manual' | 'before-import';

export interface BackupInfo {
  name: string;
  kind: BackupKind;
  size: number;
  createdAt: string;
}

export const backupDir = (dataDir: string) => path.join(dataDir, 'backups');

const pad = (n: number) => String(n).padStart(2, '0');
const clockKey = (d: Date) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function info(dir: string, name: string): BackupInfo | null {
  const m = FILE.exec(name);
  if (!m) return null;
  const stat = fs.statSync(path.join(dir, name));
  return {
    name,
    kind: (m[3] as BackupKind | undefined) ?? 'daily',
    size: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
}

/** Newest first. */
export function listBackups(dataDir: string): BackupInfo[] {
  const dir = backupDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => info(dir, name))
    .filter((b): b is BackupInfo => b !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
}

export function pruneBackups(dataDir: string, keep = KEEP_BACKUPS): string[] {
  const removed = listBackups(dataDir)
    .slice(keep)
    .map((b) => b.name);
  for (const name of removed) fs.rmSync(path.join(backupDir(dataDir), name), { force: true });
  return removed;
}

/** A consistent copy of the live database (VACUUM INTO works while Lanes keeps running). */
export function backupNow(db: DB, dataDir: string, now: Date, kind: BackupKind): BackupInfo {
  const dir = backupDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const day = localDateKey(now);
  const name = kind === 'daily' ? `lanes-${day}.db` : `lanes-${day}-${clockKey(now)}-${kind}.db`;
  const file = path.join(dir, name);
  if (fs.existsSync(file)) fs.rmSync(file);
  db.prepare('VACUUM INTO ?').run(file);
  pruneBackups(dataDir);
  return info(dir, name) as BackupInfo;
}

/** Today's daily copy, unless it's already there. */
export function ensureDailyBackup(db: DB, dataDir: string, now: Date): BackupInfo | null {
  const name = `lanes-${localDateKey(now)}.db`;
  if (fs.existsSync(path.join(backupDir(dataDir), name))) return null;
  return backupNow(db, dataDir, now, 'daily');
}
