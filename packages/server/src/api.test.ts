import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Note, Reminder, Settings, Task, TaskDetail, TodayStats } from '@lanes/shared';
import { makeHarness, TOKEN, type Harness } from './test-harness.js';

type WithStats = { task: Task; stats: TodayStats };
type Err = { error: { code: string } };

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(() => h.app.close());

const create = async (body: Record<string, unknown>) => {
  const res = await h.api<WithStats>('POST', '/api/tasks', body);
  expect(res.status).toBe(201);
  return res.body.task;
};
const move = (id: string, body: Record<string, unknown>) =>
  h.api<WithStats>('POST', `/api/tasks/${id}/move`, body);
const detail = async (id: string) => (await h.api<TaskDetail>('GET', `/api/tasks/${id}`)).body;
const list = async (query = '') => (await h.api<Task[]>('GET', `/api/tasks${query}`)).body;

describe('creating tasks', () => {
  it('creates with defaults, at the top of the lane, and broadcasts it', async () => {
    const a = await create({ title: 'First' });
    const b = await create({ title: 'Second' });
    expect(a).toMatchObject({ stage: 'new', priority: 'normal', source: 'manual', project: null });
    expect(b.position).toBeLessThan(a.position);
    expect(h.events.filter((e) => e.type === 'task.created')).toHaveLength(2);
  });

  it('creates projects by name and reuses them case-insensitively', async () => {
    const a = await create({ title: 'A', project: 'Kitebird' });
    const b = await create({ title: 'B', project: 'kitebird' });
    expect(b.project?.id).toBe(a.project?.id);
    expect(a.project?.color).toBe('p-blue');
  });

  it('stores subtasks, notes and reminders from the draft', async () => {
    const t = await create({
      title: 'Café rebrand',
      subtasks: ['Moodboard', 'Logo sketches', 'Palette'],
      notes: ['Start with the menu'],
      reminders: [{ fireAt: '2026-11-05T08:00:00.000Z' }],
      source: 'claude',
    });
    expect(t.subtasks.map((s) => s.title)).toEqual(['Moodboard', 'Logo sketches', 'Palette']);
    expect(t.counts).toEqual({ notes: 1, reminders: 1, focusMin: 0 });
    expect(t.nextReminderAt).toBe('2026-11-05T08:00:00.000Z');
    expect((await detail(t.id)).notes[0]?.type).toBe('claude');
  });

  it('a date-only due becomes 23:59 local without a time', async () => {
    const t = await create({ title: 'Pay rent', dueAt: '2026-11-05' });
    expect(t.dueAt).toBe('2026-11-05T21:59:00.000Z'); // 23:59 Cairo
    expect(t.dueHasTime).toBe(false);
  });

  it('a pending task needs a reason', async () => {
    const res = await h.api<Err>('POST', '/api/tasks', { title: 'Menu', stage: 'pending' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PENDING_REASON_REQUIRED');
    const t = await create({ title: 'Menu', stage: 'pending', pendingReason: 'their prices' });
    expect(t.pendingReason).toBe('their prices');
  });

  it('PATCH edits fields but never the stage', async () => {
    const t = await create({ title: 'Draft' });
    const ok = await h.api<{ task: Task }>('PATCH', `/api/tasks/${t.id}`, {
      title: 'Final draft',
      priority: 'high',
      project: 'Personal',
      dueAt: '2026-11-06T13:00:00.000Z',
    });
    expect(ok.body.task).toMatchObject({
      title: 'Final draft',
      priority: 'high',
      dueHasTime: true,
    });
    expect(ok.body.task.project?.name).toBe('Personal');
    const bad = await h.api('PATCH', `/api/tasks/${t.id}`, { stage: 'done' });
    expect(bad.status).toBe(400);
  });
});

describe('moveTask — stage rules', () => {
  it('moves through all five stages, logging each change', async () => {
    const t = await create({ title: 'Banners' });

    const inProcess = await move(t.id, { stage: 'in_process' });
    const startedAt = inProcess.body.task.startedAt;
    expect(startedAt).toBeTruthy();

    expect((await move(t.id, { stage: 'pending' })).status).toBe(400); // no reason
    const pending = await move(t.id, { stage: 'pending', pendingReason: 'client copy' });
    expect(pending.body.task.pendingReason).toBe('client copy');

    h.advance(5);
    const done = await move(t.id, { stage: 'done' });
    expect(done.body.task.completedAt).toBeTruthy();
    expect(done.body.task.pendingReason).toBeNull();
    expect(done.body.stats.doneToday).toBe(1);

    const postponed = await move(t.id, { stage: 'postponed', resumeOn: '2026-12-01' });
    expect(postponed.body.task).toMatchObject({ resumeOn: '2026-12-01', completedAt: null });
    expect(postponed.body.stats.doneToday).toBe(0); // undo from Done is silent but honest

    const back = await move(t.id, { stage: 'in_process' });
    expect(back.body.task.resumeOn).toBeNull();
    expect(back.body.task.startedAt).toBe(startedAt); // only set the first time

    const notes = (await detail(t.id)).notes.filter((n) => n.type === 'stage_change');
    expect(notes.map((n) => n.body).reverse()).toEqual([
      'Moved from New to In process',
      'Moved from In process to Pending',
      'Moved from Pending to Done',
      'Moved from Done to Postponed',
      'Moved from Postponed to In process',
    ]);
  });

  it('any stage can move to any stage (New → Done directly)', async () => {
    const t = await create({ title: 'Quick one' });
    const res = await move(t.id, { stage: 'done' });
    expect(res.body.task.stage).toBe('done');
  });

  it('reorders within a lane using neighbours', async () => {
    const c = await create({ title: 'C' });
    const b = await create({ title: 'B' });
    const a = await create({ title: 'A' }); // lane: A, B, C
    await move(a.id, { stage: 'new', afterId: c.id }); // B, C, A
    expect((await list('?stage=new')).map((t) => t.title)).toEqual(['B', 'C', 'A']);
    await move(a.id, { stage: 'new', beforeId: c.id }); // B, A, C
    expect((await list('?stage=new')).map((t) => t.title)).toEqual(['B', 'A', 'C']);
    expect((await move(a.id, { stage: 'new', afterId: 'nope' })).status).toBe(400);
    expect(b.id).toBeTruthy();
  });

  it('renormalises a lane when positions get too close', async () => {
    const x = await create({ title: 'X' });
    const y = await create({ title: 'Y' });
    const z = await create({ title: 'Z' });
    h.ctx.db.prepare('UPDATE tasks SET position = ? WHERE id = ?').run(1, y.id);
    h.ctx.db.prepare('UPDATE tasks SET position = ? WHERE id = ?').run(1 + 1e-9, x.id);
    await move(z.id, { stage: 'new', afterId: y.id });
    expect((await list('?stage=new')).map((t) => t.title)).toEqual(['Y', 'Z', 'X']);
  });

  it('drops into another lane next to a given card', async () => {
    const p1 = await create({ title: 'P1', stage: 'in_process' });
    const p2 = await create({ title: 'P2', stage: 'in_process' }); // P2, P1
    const t = await create({ title: 'T' });
    await move(t.id, { stage: 'in_process', afterId: p2.id });
    expect((await list('?stage=in_process')).map((x) => x.title)).toEqual(['P2', 'T', 'P1']);
    expect(p1.id).toBeTruthy();
  });
});

describe('notes', () => {
  it('can be added in every stage and remember the stage', async () => {
    const t = await create({ title: 'Everywhere' });
    const stages = ['new', 'in_process', 'pending', 'done', 'postponed'] as const;
    for (const stage of stages) {
      if (stage !== 'new') {
        await move(t.id, { stage, ...(stage === 'pending' ? { pendingReason: 'x' } : {}) });
      }
      const res = await h.api<Note>('POST', `/api/tasks/${t.id}/notes`, { body: `in ${stage}` });
      expect(res.status).toBe(201);
      expect(res.body.stage).toBe(stage);
    }
    const mine = (await h.api<Note[]>('GET', `/api/tasks/${t.id}/notes`)).body.filter(
      (n) => n.type === 'note',
    );
    expect(mine.map((n) => n.stage)).toEqual([...stages].reverse()); // newest first
  });

  it('only manual and Claude notes can be edited or deleted', async () => {
    const t = await create({ title: 'Menu', stage: 'pending', pendingReason: 'prices' });
    const auto = (await detail(t.id)).notes.find((n) => n.type === 'pending_reason');
    const res = await h.api<Err>('PATCH', `/api/notes/${auto?.id}`, { body: 'changed' });
    expect(res.status).toBe(409);
    const mine = await h.api<Note>('POST', `/api/tasks/${t.id}/notes`, { body: 'draft' });
    expect((await h.api('PATCH', `/api/notes/${mine.body.id}`, { body: 'final' })).status).toBe(
      200,
    );
    expect((await h.api('DELETE', `/api/notes/${mine.body.id}`)).status).toBe(200);
  });
});

describe('momentum', () => {
  it('done tasks, subtasks and focus sessions add points; adding tasks never lowers it', async () => {
    const t = await create({ title: 'Grid', subtasks: ['a', 'b'] });
    await move(t.id, { stage: 'done' });
    const sub = t.subtasks[0];
    const res = await h.api<{ stats: TodayStats }>('PATCH', `/api/subtasks/${sub?.id}`, {
      done: true,
    });
    expect(res.body.stats).toMatchObject({ doneToday: 1, subtasksDoneToday: 1, points: 1.25 });

    const before = (await h.api<TodayStats>('GET', '/api/stats/today')).body.momentum;
    for (let i = 0; i < 10; i++) await create({ title: `More ${i}`, dueAt: '2026-11-04' });
    const after = (await h.api<TodayStats>('GET', '/api/stats/today')).body;
    expect(after.momentum).toBe(before);
    expect(after.plannedToday).toBe(11);
  });

  it('a 1am finish counts for the previous day (day starts at 6)', async () => {
    const t = await create({ title: 'Late night' });
    h.setNow(new Date('2026-11-04T23:00:00.000Z')); // Thu 01:00 Cairo
    await move(t.id, { stage: 'done' });
    h.setNow(new Date('2026-11-04T23:30:00.000Z'));
    expect((await h.api<TodayStats>('GET', '/api/stats/today')).body.doneToday).toBe(1);
    h.setNow(new Date('2026-11-05T05:00:00.000Z')); // Thu 07:00 → new day
    expect((await h.api<TodayStats>('GET', '/api/stats/today')).body.doneToday).toBe(0);
  });

  it('builds a streak and history from finished days', async () => {
    for (const day of ['2026-11-02', '2026-11-03', '2026-11-04']) {
      h.setNow(new Date(`${day}T10:00:00.000Z`));
      const t = await create({ title: day });
      await move(t.id, { stage: 'done' });
    }
    const stats = (await h.api<TodayStats>('GET', '/api/stats/today')).body;
    expect(stats.streakDays).toBe(3);
    const history = (
      await h.api<{ date: string; done: number }[]>('GET', '/api/stats/history?days=4')
    ).body;
    expect(history).toEqual([
      { date: '2026-11-01', done: 0 },
      { date: '2026-11-02', done: 1 },
      { date: '2026-11-03', done: 1 },
      { date: '2026-11-04', done: 1 },
    ]);
  });

  it('daily goal comes from settings', async () => {
    const res = await h.api<Settings>('PATCH', '/api/settings', { dailyGoal: 2 });
    expect(res.body.dailyGoal).toBe(2);
    const t = await create({ title: 'One' });
    expect((await move(t.id, { stage: 'done' })).body.stats).toMatchObject({ goal: 2, level: 2 });
    expect((await h.api('PATCH', '/api/settings', { dailyGoal: 0 })).status).toBe(400);
  });
});

describe('reminders', () => {
  it('adds by preset or time, lists upcoming, snoozes', async () => {
    const t = await create({ title: 'Call printer' });
    const preset = await h.api<Reminder>('POST', `/api/tasks/${t.id}/reminders`, {
      preset: 'tomorrow_morning',
    });
    expect(preset.body.fireAt).toBe('2026-11-05T07:00:00.000Z'); // 09:00 Cairo
    await h.api('POST', `/api/tasks/${t.id}/reminders`, { fireAt: '2026-11-10T08:00:00.000Z' });

    const soon = await h.api<(Reminder & { taskTitle: string })[]>(
      'GET',
      '/api/reminders/upcoming?within=24h',
    );
    expect(soon.body.map((r) => r.taskTitle)).toEqual(['Call printer']);

    const snoozed = await h.api<Reminder>('POST', `/api/reminders/${preset.body.id}/snooze`, {
      minutes: 15,
    });
    expect(snoozed.body.fireAt).toBe('2026-11-04T08:15:00.000Z');
    const reminders = (await detail(t.id)).reminders;
    expect(reminders.find((r) => r.id === preset.body.id)?.dismissed).toBe(true);
  });
});

describe('delete, restore, filters, pick, focus, projects', () => {
  it('soft-deletes and restores', async () => {
    const t = await create({ title: 'Oops' });
    const del = await h.api<{ undoToken: string }>('DELETE', `/api/tasks/${t.id}`);
    expect(await list()).toHaveLength(0);
    expect((await h.api('GET', `/api/tasks/${t.id}`)).status).toBe(404);
    await h.api('POST', `/api/tasks/${del.body.undoToken}/restore`);
    expect(await list()).toHaveLength(1);
  });

  it('filters by due, search, project and done window', async () => {
    await create({ title: 'Due today', dueAt: '2026-11-04', project: 'Kitebird' });
    await create({ title: 'Overdue', dueAt: '2026-11-02T08:00:00.000Z' });
    await create({ title: 'Next month', dueAt: '2026-12-10' });
    const old = await create({ title: 'Finished long ago' });
    h.setNow(new Date('2026-11-01T10:00:00.000Z'));
    await move(old.id, { stage: 'done' });
    h.setNow(new Date('2026-11-04T08:00:00.000Z'));

    expect((await list('?due=today')).map((t) => t.title)).toEqual(['Due today']);
    expect((await list('?due=overdue')).map((t) => t.title)).toEqual(['Overdue']);
    expect((await list('?due=week')).map((t) => t.title)).toEqual(['Due today']);
    expect((await list('?q=month')).map((t) => t.title)).toEqual(['Next month']);
    expect((await list('?project=kitebird')).map((t) => t.title)).toEqual(['Due today']);
    expect((await list()).some((t) => t.title === 'Finished long ago')).toBe(false);
    expect((await list('?includeDone=all')).some((t) => t.title === 'Finished long ago')).toBe(
      true,
    );
  });

  it('pick for me suggests one open task with a reason, and honours skips', async () => {
    const urgent = await create({ title: 'Due today', dueAt: '2026-11-04', energy: 'low' });
    const other = await create({ title: 'Someday' });
    await create({ title: 'Blocked', stage: 'pending', pendingReason: 'x', priority: 'urgent' });
    const res = await h.api<{ task: Task; reason: string }>('GET', '/api/tasks/pick?energy=low');
    expect(res.body.task.id).toBe(urgent.id);
    expect(res.body.reason).toMatch(/^Due today/);
    const next = await h.api<{ task: Task }>('GET', `/api/tasks/pick?exclude=${urgent.id}`);
    expect(next.body.task.id).toBe(other.id);
  });

  it('focus moves the task to In process, logs the session, and can finish it', async () => {
    const t = await create({ title: 'Deep work' });
    const start = await h.api<{ session: { id: string }; task: Task }>('POST', '/api/focus', {
      taskId: t.id,
      plannedMin: 25,
    });
    expect(start.body.task.stage).toBe('in_process');
    h.advance(25);
    const end = await h.api<{ task: Task; stats: TodayStats }>(
      'POST',
      `/api/focus/${start.body.session.id}/end`,
      { outcome: 'completed_task', note: 'shipped v1' },
    );
    expect(end.body.task.stage).toBe('done');
    expect(end.body.stats).toMatchObject({ doneToday: 1, points: 1.5, focusMinutesToday: 25 });
    const log = (await detail(t.id)).notes.find((n) => n.type === 'focus_log');
    expect(log?.body).toBe('Focused 25 min — shipped v1');
    expect(
      (await h.api<Err>('POST', `/api/focus/${start.body.session.id}/end`, { outcome: 'stopped' }))
        .status,
    ).toBe(409);
  });

  it('projects: list with open counts, refuse duplicates, rename', async () => {
    await create({ title: 'A', project: 'Kitebird' });
    const dup = await h.api<Err>('POST', '/api/projects', { name: 'KITEBIRD' });
    expect(dup.status).toBe(409);
    const projects = (await h.api<{ id: string; openCount: number }[]>('GET', '/api/projects'))
      .body;
    expect(projects[0]?.openCount).toBe(1);
    const renamed = await h.api<{ name: string }>('PATCH', `/api/projects/${projects[0]?.id}`, {
      name: 'Kitebird Co',
    });
    expect(renamed.body.name).toBe('Kitebird Co');
  });

  it('parse previews a draft using known project names', async () => {
    await create({ title: 'x', project: 'Northfield Studio' });
    const res = await h.api<{ title: string; project: string }>('POST', '/api/tasks/parse', {
      text: 'Social grid #northfield !high',
    });
    expect(res.body).toMatchObject({ title: 'Social grid', project: 'Northfield Studio' });
  });
});

describe('live updates (SSE)', () => {
  it('streams task events to connected clients', async () => {
    await h.app.listen({ host: '127.0.0.1', port: 0 });
    const address = h.app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const controller = new AbortController();
    const res = await fetch(`http://localhost:${port}/api/events`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      signal: controller.signal,
    });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    await create({ title: 'Live card' });
    let text = '';
    while (!text.includes('event: task.created')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    controller.abort();
    expect(text).toContain('"title":"Live card"');
  });
});
