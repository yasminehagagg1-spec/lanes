import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Reminder, Task, TaskDetail } from '@lanes/shared';
import type { LanesNotification } from './notify.js';
import { BACK_FROM_POSTPONED, createScheduler, reminderBody } from './scheduler.js';
import { makeHarness, type Harness } from './test-harness.js';

let h: Harness;
let sent: LanesNotification[];
let scheduler: ReturnType<typeof createScheduler>;

beforeEach(async () => {
  h = await makeHarness(); // now = Wed 4 Nov 2026, 10:00 Cairo
  sent = [];
  scheduler = createScheduler(h.ctx, {
    notify: async (n) => {
      sent.push(n);
    },
    baseUrl: 'http://localhost:4747',
    log: () => {},
  });
});
afterEach(() => h.app.close());

const create = async (body: Record<string, unknown>) =>
  (await h.api<{ task: Task }>('POST', '/api/tasks', body)).body.task;
const detail = async (id: string) => (await h.api<TaskDetail>('GET', `/api/tasks/${id}`)).body;
const fired = () => h.events.filter((e) => e.type === 'reminder.fired');

describe('reminders', () => {
  it('fires a due reminder once: notification, SSE event, marked fired', async () => {
    const t = await create({
      title: 'Call the printer',
      reminders: [{ fireAt: '2026-11-04T08:05:00.000Z', message: 'Ask about paper stock' }],
    });

    expect((await scheduler.tick()).fired).toBe(0); // 10:00, not yet

    h.advance(5);
    const result = await scheduler.tick();
    expect(result.fired).toBe(1);
    expect(sent).toEqual([
      {
        title: 'Call the printer',
        body: 'Ask about paper stock',
        url: `http://localhost:4747/?task=${t.id}`,
        sound: true,
      },
    ]);
    expect(fired()).toHaveLength(1);
    expect((await detail(t.id)).reminders[0]?.firedAt).toBe('2026-11-04T08:05:00.000Z');

    h.advance(5);
    expect((await scheduler.tick()).fired).toBe(0); // never twice
    expect(sent).toHaveLength(1);
  });

  it('skips dismissed reminders and deleted tasks', async () => {
    const a = await create({ title: 'A', reminders: [{ fireAt: '2026-11-04T07:00:00.000Z' }] });
    const b = await create({ title: 'B', reminders: [{ fireAt: '2026-11-04T07:00:00.000Z' }] });
    const reminderA = (await detail(a.id)).reminders[0] as Reminder;
    await h.api('POST', `/api/reminders/${reminderA.id}/dismiss`);
    await h.api('DELETE', `/api/tasks/${b.id}`);
    expect((await scheduler.tick()).fired).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('uses the due date when there is no message', async () => {
    await create({
      title: 'Send banners',
      dueAt: '2026-11-04T13:00:00.000Z', // 15:00 Cairo
      reminders: [{ fireAt: '2026-11-04T08:00:00.000Z' }],
    });
    await scheduler.tick();
    expect(sent[0]?.body).toBe('Due today at 3:00 pm');
  });

  it('groups more than 2 missed reminders into one notification on startup', async () => {
    for (const title of ['One', 'Two', 'Three', 'Four']) {
      await create({ title, reminders: [{ fireAt: '2026-11-04T06:00:00.000Z' }] });
    }
    const result = await scheduler.tick({ startup: true });
    expect(result).toMatchObject({ fired: 4, grouped: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toBe('While you were away: 4 reminders');
    expect(sent[0]?.body).toBe('One · Two · Three +1 more');
    expect(fired()).toHaveLength(4); // the open tab still hears about each one
  });

  it('two missed reminders on startup are shown separately', async () => {
    await create({ title: 'One', reminders: [{ fireAt: '2026-11-04T06:00:00.000Z' }] });
    await create({ title: 'Two', reminders: [{ fireAt: '2026-11-04T06:00:00.000Z' }] });
    expect((await scheduler.tick({ startup: true })).grouped).toBe(false);
    expect(sent.map((n) => n.title)).toEqual(['One', 'Two']);
  });

  it('respects the Sounds setting', async () => {
    await h.api('PATCH', '/api/settings', { sounds: false });
    await create({ title: 'Quiet', reminders: [{ fireAt: '2026-11-04T07:00:00.000Z' }] });
    await scheduler.tick();
    expect(sent[0]?.sound).toBe(false);
  });

  it('a failing notification never crashes the loop or refires', async () => {
    const broken = createScheduler(h.ctx, {
      notify: async () => {
        throw new Error('Notification Center unavailable');
      },
      baseUrl: 'http://localhost:4747',
      log: () => {},
    });
    await create({ title: 'X', reminders: [{ fireAt: '2026-11-04T07:00:00.000Z' }] });
    expect((await broken.tick()).fired).toBe(1);
    expect((await broken.tick()).fired).toBe(0);
  });
});

describe('postponed auto-return', () => {
  it('brings a task back to New on its day, logs it, and reminds', async () => {
    const t = await create({
      title: 'Learn Framer motion',
      stage: 'postponed',
      resumeOn: '2026-11-05',
    });
    expect((await scheduler.tick()).returned).toBe(0);

    h.setNow(new Date('2026-11-05T05:30:00.000Z')); // Thu 07:30 — the new day has started
    const result = await scheduler.tick();
    expect(result).toMatchObject({ returned: 1, fired: 1 });

    const d = await detail(t.id);
    expect(d.stage).toBe('new');
    expect(d.resumeOn).toBeNull();
    expect(d.notes.find((n) => n.type === 'stage_change')?.body).toBe(BACK_FROM_POSTPONED);
    expect(sent[0]).toMatchObject({ title: 'Learn Framer motion', body: BACK_FROM_POSTPONED });
  });

  it('waits for the lived day: 1am still counts as the day before', async () => {
    await create({ title: 'Later', stage: 'postponed', resumeOn: '2026-11-05' });
    h.setNow(new Date('2026-11-04T23:00:00.000Z')); // Thu 01:00 Cairo, day starts at 6
    expect((await scheduler.tick()).returned).toBe(0);
  });

  it('leaves "someday" postponed tasks alone', async () => {
    await create({ title: 'Someday', stage: 'postponed' });
    h.setNow(new Date('2027-01-01T10:00:00.000Z'));
    expect((await scheduler.tick()).returned).toBe(0);
  });
});

describe('reminder endpoints for the bell', () => {
  it('lists what rang today until it is dismissed', async () => {
    await create({ title: 'Rang', reminders: [{ fireAt: '2026-11-04T07:00:00.000Z' }] });
    await scheduler.tick();
    const rang = (await h.api<(Reminder & { taskTitle: string })[]>('GET', '/api/reminders/rang'))
      .body;
    expect(rang.map((r) => r.taskTitle)).toEqual(['Rang']);
    await h.api('POST', `/api/reminders/${rang[0]?.id}/dismiss`);
    expect((await h.api<unknown[]>('GET', '/api/reminders/rang')).body).toHaveLength(0);
  });
});

describe('reminderBody', () => {
  it('falls back to project, then a plain line', () => {
    const base = { message: null } as Reminder;
    const task = { dueAt: null, dueHasTime: false, project: { name: 'Kitebird' } } as Task;
    expect(reminderBody(base, task, new Date())).toBe('Kitebird');
    expect(reminderBody(base, { ...task, project: null }, new Date())).toBe('Lanes reminder');
  });
});
