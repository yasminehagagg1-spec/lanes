import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Task } from '@lanes/shared';
import {
  backupDir,
  backupNow,
  ensureDailyBackup,
  KEEP_BACKUPS,
  listBackups,
} from './services/backup.js';
import type { LanesExport } from './services/data.js';
import { makeHarness, TOKEN, type Harness } from './test-harness.js';

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(() => h.app.close());

const created = async (body: Record<string, unknown>) =>
  (await h.api<{ task: Task }>('POST', '/api/tasks', body)).body.task;

/** A board with one of everything, including a task in the undo window. */
async function fillBoard() {
  const a = await created({
    title: 'Kitebird banners',
    project: 'Kitebird',
    priority: 'urgent',
    dueAt: '2026-11-05T13:00:00.000Z',
    dueHasTime: true,
    subtasks: ['Sizes', 'Copy'],
    notes: ['Brief in Drive'],
    reminders: [{ fireAt: '2026-11-05T12:00:00.000Z' }],
  });
  const b = await created({ title: 'تسليم البوستات', stage: 'pending', pendingReason: 'العميل' });
  await created({ title: 'Later', stage: 'postponed', resumeOn: '2026-11-10' });
  const gone = await created({ title: 'Deleted one' });
  await h.api('DELETE', `/api/tasks/${gone.id}`);
  const focus = (
    await h.api<{ id: string }>('POST', '/api/focus', { taskId: a.id, plannedMin: 25 })
  ).body;
  h.advance(25);
  await h.api('POST', `/api/focus/${focus.id}/end`, { outcome: 'completed_task' });
  await h.api('PATCH', `/api/subtasks/${a.subtasks[0]!.id}`, { done: true });
  await h.api('PATCH', '/api/settings', { dailyGoal: 7, displayName: 'Yasmine H' });
  return { a, b };
}

const exportNow = async () => (await h.api<LanesExport>('GET', '/api/data/export')).body;
const strip = ({ exportedAt: _, ...rest }: LanesExport) => rest;

describe('export', () => {
  it('holds every table and is offered as a dated file', async () => {
    await fillBoard();
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/data/export',
      headers: { host: 'localhost:4747', authorization: `Bearer ${TOKEN}` },
    });
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="lanes-export-2026-11-04.json"',
    );
    const data = res.json<LanesExport>();
    expect(data).toMatchObject({ app: 'lanes', version: 1 });
    expect(data.tasks).toHaveLength(4);
    expect(data.tasks.some((t) => t.deletedAt)).toBe(true);
    expect(data.projects.map((p) => p.name)).toEqual(['Kitebird']);
    expect(data.subtasks.filter((s) => s.done)).toHaveLength(1);
    expect(data.focusSessions).toHaveLength(1);
    expect(data.reminders[0]).toMatchObject({ dismissed: false });
    expect(data.settings).toMatchObject({ dailyGoal: 7, displayName: 'Yasmine H' });
  });
});

describe('import', () => {
  it('Export → wipe → Import restores everything (the acceptance criterion)', async () => {
    await fillBoard();
    const before = await exportNow();

    // "Delete the DB": replace with an empty export.
    const empty = {
      ...before,
      projects: [],
      tasks: [],
      subtasks: [],
      notes: [],
      reminders: [],
      focusSessions: [],
      settings: {},
    };
    await h.api('POST', '/api/data/import', { mode: 'replace', data: empty });
    expect((await h.api<Task[]>('GET', '/api/tasks?includeDone=all')).body).toHaveLength(0);

    const res = await h.api<{ added: Record<string, number> }>('POST', '/api/data/import', {
      mode: 'replace',
      data: before,
    });
    expect(res.status).toBe(200);
    expect(res.body.added.tasks).toBe(4);
    expect(strip(await exportNow())).toEqual(strip(before));
    // The board and the momentum it earned are back.
    const stats = (await h.api<{ points: number }>('GET', '/api/stats/today')).body;
    expect(stats.points).toBeGreaterThan(0);
  });

  it('merge skips ids already here and folds same-name projects together', async () => {
    const { a } = await fillBoard();
    const file = await exportNow();
    // A fresh Mac with its own "kitebird" project and one task of its own.
    await h.api('POST', '/api/data/import', {
      mode: 'replace',
      data: {
        ...file,
        projects: [],
        tasks: [],
        subtasks: [],
        notes: [],
        reminders: [],
        focusSessions: [],
      },
    });
    await created({ title: 'Mine', project: 'kitebird' });

    const res = await h.api<{ added: Record<string, number>; skipped: number }>(
      'POST',
      '/api/data/import',
      {
        mode: 'merge',
        data: file,
      },
    );
    expect(res.body.added.tasks).toBe(4);
    expect(res.body.added.projects).toBe(0);
    const projects = (await h.api<{ name: string }[]>('GET', '/api/projects')).body;
    expect(projects.map((p) => p.name)).toEqual(['kitebird']);
    const task = (await h.api<Task>('GET', `/api/tasks/${a.id}`)).body;
    expect(task.project?.name).toBe('kitebird');

    // Merging the same file again adds nothing.
    const again = await h.api<{ added: Record<string, number> }>('POST', '/api/data/import', {
      mode: 'merge',
      data: file,
    });
    expect(Object.values(again.body.added).every((n) => n === 0)).toBe(true);
  });

  it('takes a backup first, and refuses files that aren’t Lanes exports', async () => {
    await fillBoard();
    const file = await exportNow();
    await h.api('POST', '/api/data/import', { mode: 'merge', data: file });
    expect(listBackups(h.dataDir).map((b) => b.kind)).toContain('before-import');

    const wrong = await h.api<{ error: { code: string } }>('POST', '/api/data/import', {
      mode: 'replace',
      data: { hello: 'world' },
    });
    expect(wrong.body.error.code).toBe('NOT_A_LANES_FILE');

    const broken = await h.api<{ error: { message: string } }>('POST', '/api/data/import', {
      mode: 'replace',
      data: { ...file, tasks: [] },
    });
    expect(broken.status).toBe(400);
    expect(broken.body.error.message).toMatch(/isn’t in the file/);
    // Nothing changed.
    expect((await h.api<Task[]>('GET', '/api/tasks?includeDone=all')).body).toHaveLength(3);
  });

  it('tells open tabs to refetch', async () => {
    await h.api('POST', '/api/data/import', { mode: 'merge', data: await exportNow() });
    expect(h.events.map((e) => e.type)).toContain('data.imported');
  });
});

describe('backups', () => {
  it('makes one daily copy, a manual one on request, and keeps the newest 14', async () => {
    await fillBoard();
    expect(ensureDailyBackup(h.ctx.db, h.dataDir, h.ctx.clock())?.name).toBe('lanes-2026-11-04.db');
    expect(ensureDailyBackup(h.ctx.db, h.dataDir, h.ctx.clock())).toBeNull();

    const manual = await h.api<{ name: string; kind: string }>('POST', '/api/data/backup');
    expect(manual.status).toBe(201);
    expect(manual.body.kind).toBe('manual');

    // The copy is a real database with the tasks in it.
    const Database = (await import('better-sqlite3')).default;
    const copy = new Database(path.join(backupDir(h.dataDir), 'lanes-2026-11-04.db'), {
      readonly: true,
    });
    expect(copy.prepare('SELECT COUNT(*) FROM tasks').pluck().get()).toBe(4);
    copy.close();

    for (let i = 0; i < 20; i++) {
      h.advance(24 * 60);
      backupNow(h.ctx.db, h.dataDir, h.ctx.clock(), 'daily');
    }
    const list = (await h.api<{ backups: { name: string }[] }>('GET', '/api/data/backups')).body
      .backups;
    expect(list).toHaveLength(KEEP_BACKUPS);
    expect(fs.readdirSync(backupDir(h.dataDir))).toHaveLength(KEEP_BACKUPS);
  });

  it('opens the data folder in Finder', async () => {
    const res = await h.api<{ dataDir: string }>('POST', '/api/data/open-folder');
    expect(h.opened).toEqual([h.dataDir]);
    expect(res.body.dataDir).toBe(h.dataDir);
  });
});

describe('Claude status', () => {
  it('reads the Claude configs and notices the connector calling in', async () => {
    const empty = (await h.api<Record<string, unknown>>('GET', '/api/claude/status')).body;
    expect(empty).toMatchObject({ desktop: null, code: null, skill: false, lastSeenAt: null });

    const desktop = path.join(h.home, 'Library', 'Application Support', 'Claude');
    fs.mkdirSync(desktop, { recursive: true });
    fs.writeFileSync(
      path.join(desktop, 'claude_desktop_config.json'),
      JSON.stringify({ mcpServers: { lanes: {} } }),
    );
    fs.writeFileSync(path.join(h.home, '.claude.json'), JSON.stringify({ mcpServers: {} }));
    fs.mkdirSync(path.join(h.home, '.claude', 'skills', 'task'), { recursive: true });
    fs.writeFileSync(
      path.join(h.home, '.claude', 'skills', 'task', 'SKILL.md'),
      '<!-- lanes-skill: x -->',
    );

    await h.app.inject({
      method: 'GET',
      url: '/api/stats/today',
      headers: {
        host: '127.0.0.1:4747',
        authorization: `Bearer ${TOKEN}`,
        'x-lanes-client': 'mcp',
      },
    });
    const status = (await h.api<Record<string, unknown>>('GET', '/api/claude/status')).body;
    expect(status).toMatchObject({
      desktop: true,
      code: false,
      skill: true,
      lastSeenAt: h.ctx.clock().toISOString(),
      tokenPath: path.join(h.dataDir, 'token'),
    });
  });
});
