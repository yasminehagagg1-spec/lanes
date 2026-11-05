import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { TaskDetail } from '@lanes/shared';
// The real Lanes app on an in-memory database (no port, no data folder).
import { makeHarness, NOW, TOKEN, type Harness } from '../../server/src/test-harness.js';
import { createClient, NOT_RUNNING, type FetchLike } from './client.js';
import { loadConfig } from './config.js';
import { createLanesServer } from './server.js';

const pad = (n: number) => String(n).padStart(2, '0');
const local = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

let h: Harness;
let mcp: Client;

async function connect(fetchImpl: FetchLike, readToken = () => TOKEN) {
  const server = createLanesServer({
    client: createClient({ url: 'http://127.0.0.1:4747', readToken, fetch: fetchImpl }),
    linkBase: 'http://localhost:4747',
    now: () => h.ctx.clock(),
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

/** fetch → app.inject, with the headers a real MCP process would send. */
const injectFetch: FetchLike = async (url, init) => {
  const u = new URL(url);
  const res = await h.app.inject({
    method: init.method as 'GET',
    url: u.pathname + u.search,
    headers: { ...init.headers, host: u.host },
    ...(init.body ? { payload: init.body } : {}),
  });
  return { status: res.statusCode, text: async () => res.body };
};

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = (await mcp.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[];
    isError?: boolean;
  };
  return { text: res.content.map((c) => c.text).join('\n'), isError: res.isError === true };
}

const tasks = async () => (await h.api<TaskDetail[]>('GET', '/api/tasks?includeDone=all')).body;
const detail = async (id: string) => (await h.api<TaskDetail>('GET', `/api/tasks/${id}`)).body;
const only = async () => {
  const all = await tasks();
  expect(all).toHaveLength(1);
  return detail(all[0]!.id);
};

beforeEach(async () => {
  h = await makeHarness();
  mcp = await connect(injectFetch);
});
afterEach(async () => {
  await mcp.close();
  await h.app.close();
});

describe('server basics', () => {
  it('lists the tools from the spec, with instructions and no message-prefix trigger', async () => {
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_note',
      'add_reminder',
      'add_task',
      'get_task',
      'list_tasks',
      'move_task',
      'parse_task',
      'today',
      'update_task',
    ]);
    expect(tools.some((t) => /delete/i.test(t.name))).toBe(false);
    const instructions = mcp.getInstructions() ?? '';
    expect(instructions).toContain('/task');
    expect(instructions).not.toMatch(/new task/i);
  });

  it('only accepts a loopback LANES_URL', () => {
    expect(loadConfig({ LANES_URL: 'http://127.0.0.1:4848' }).url).toBe('http://127.0.0.1:4848');
    expect(() => loadConfig({ LANES_URL: 'http://example.com' })).toThrow(/this Mac/);
    expect(() => loadConfig({ LANES_URL: 'https://127.0.0.1:4747' })).toThrow();
  });
});

describe('add_task — the §4 examples', () => {
  it('“Kitebird homepage banners, due Thursday, high priority”', async () => {
    const r = await call('add_task', {
      title: 'Kitebird homepage banners',
      project: 'Kitebird',
      priority: 'high',
      due: 'Thursday',
    });
    expect(r.isError).toBe(false);
    expect(r.text).toContain('Added “Kitebird homepage banners” to New.');
    expect(r.text).toContain('new project “Kitebird”');
    expect(r.text).toMatch(/Open in Lanes: http:\/\/localhost:4747\/\?task=[0-9A-Z]{26}/);
    const t = await only();
    expect(t).toMatchObject({ source: 'claude', priority: 'high', dueHasTime: false });
    expect(t.project?.name).toBe('Kitebird');
    expect(local(t.dueAt)).toBe('2026-11-05 23:59');
    expect(t.reminders).toHaveLength(0);
    // The open board hears about it right away.
    expect(h.events.some((e) => e.type === 'task.created')).toBe(true);
  });

  it('“call the printer … tomorrow 11am, remind me at 10:30, quick one”', async () => {
    await call('add_task', {
      title: 'Call the printer about the jewelry catalog',
      due: 'tomorrow 11am',
      reminders: [{ at: '10:30' }],
      energy: 'low',
    });
    const t = await only();
    expect(local(t.dueAt)).toBe('2026-11-05 11:00');
    expect(t.reminders.map((r) => local(r.fireAt))).toEqual(['2026-11-05 10:30']);
    expect(t.energy).toBe('low');
  });

  it('“rebrand for the café — 1) moodboard 2) logo sketches 3) palette. waiting on their menu file”', async () => {
    await call('add_task', {
      title: 'Café rebrand',
      stage: 'pending',
      pendingReason: 'Waiting on their menu file',
      subtasks: ['Moodboard', 'Logo sketches', 'Palette'],
      energy: 'high',
      rawText:
        'rebrand for the café — 1) moodboard 2) logo sketches 3) palette. waiting on their menu file',
    });
    const t = await only();
    expect(t.stage).toBe('pending');
    expect(t.pendingReason).toBe('Waiting on their menu file');
    expect(t.subtasks.map((s) => s.title)).toEqual(['Moodboard', 'Logo sketches', 'Palette']);
    expect(t.notes.some((n) => n.type === 'claude' && n.body.startsWith('Asked in Claude'))).toBe(
      true,
    );
  });

  it('“تسليم بوستات السوشيال بكرة الساعة ٥” gets a reminder an hour before', async () => {
    const r = await call('add_task', { title: 'تسليم بوستات السوشيال', due: 'بكرة الساعة ٥' });
    expect(r.text).toContain('a reminder an hour before');
    const t = await only();
    expect(t.title).toBe('تسليم بوستات السوشيال');
    expect(local(t.dueAt)).toBe('2026-11-05 17:00');
    expect(t.reminders.map((r) => local(r.fireAt))).toEqual(['2026-11-05 16:00']);
  });
});

describe('add_task — details', () => {
  it('matches an existing project loosely and skips reminders when given []', async () => {
    await h.api('POST', '/api/projects', { name: 'Northfield Studio' });
    const r = await call('add_task', {
      title: 'Brand deck',
      project: 'northfield',
      due: 'tomorrow 3pm',
      reminders: [],
    });
    expect(r.text).not.toContain('new project');
    const t = await only();
    expect(t.project?.name).toBe('Northfield Studio');
    expect(t.reminders).toHaveLength(0);
  });

  it('explains a date it can’t read instead of guessing', async () => {
    const r = await call('add_task', { title: 'Something', due: 'when the moon is full' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Couldn’t read the due date/);
    expect(await tasks()).toHaveLength(0);
  });

  it('refuses pending without a reason', async () => {
    const r = await call('add_task', { title: 'Hold', stage: 'pending' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/need a reason/);
  });

  it('parse_task previews without saving', async () => {
    const r = await call('parse_task', { text: 'Send invoice tomorrow 3pm !high #Kitebird' });
    expect(JSON.parse(r.text)).toMatchObject({
      title: 'Send invoice',
      priority: 'high',
      project: 'Kitebird',
    });
    expect(await tasks()).toHaveLength(0);
  });
});

describe('reading and changing tasks', () => {
  beforeEach(async () => {
    await call('add_task', {
      title: 'Kitebird homepage banners',
      project: 'Kitebird',
      due: 'tomorrow 3pm',
    });
    await call('add_task', { title: 'Kitebird invoice' });
    await call('add_task', { title: 'Logo sketches for the café' });
  });

  it('list_tasks filters and get_task finds by title words', async () => {
    const list = await call('list_tasks', { project: 'Kitebird' });
    expect(list.text.split('\n')).toHaveLength(1);
    expect(list.text).toMatch(
      /“Kitebird homepage banners” · New · #Kitebird · due Thu 5 Nov, 3:00 pm/,
    );
    expect((await call('list_tasks', { q: 'kitebird' })).text.split('\n')).toHaveLength(2);
    const got = await call('get_task', { id: 'homepage banners' });
    expect(got.text).toContain('“Kitebird homepage banners” — New');
    expect(got.text).toMatch(/Reminders:\n- Thu 5 Nov, 2:00 pm/);
  });

  it('asks which one when several match', async () => {
    const r = await call('get_task', { id: 'kitebird' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Several tasks match');
    expect(r.text).toContain('Kitebird invoice');
  });

  it('move_task follows the stage rules and celebrates done', async () => {
    const noReason = await call('move_task', { id: 'Kitebird invoice', stage: 'pending' });
    expect(noReason.isError).toBe(true);
    const pending = await call('move_task', {
      id: 'Kitebird invoice',
      stage: 'pending',
      pendingReason: 'their PO number',
    });
    expect(pending.text).toBe('Moved “Kitebird invoice” to Pending.');
    const done = await call('move_task', { id: 'logo sketches', stage: 'done' });
    expect(done.text).toContain('to Done.');
    expect(done.text).toMatch(/Today: 1 done/);
    const later = await call('move_task', {
      id: 'homepage banners',
      stage: 'postponed',
      resumeOn: 'next monday',
    });
    expect(later.text).toContain('Comes back Mon 9 Nov');
  });

  it('update_task, add_note and add_reminder', async () => {
    const up = await call('update_task', {
      id: 'Kitebird invoice',
      priority: 'urgent',
      due: 'friday',
    });
    expect(up.text).toContain('!urgent');
    const note = await call('add_note', { id: 'Kitebird invoice', body: 'Amount is 12,400 EGP' });
    expect(note.text).toBe('Note added to “Kitebird invoice”.');
    const rem = await call('add_reminder', { id: 'homepage banners', at: '30m before' });
    expect(rem.text).toBe('Reminder set for Thu 5 Nov, 2:30 pm on “Kitebird homepage banners”.');
    const t = (await tasks()).find((x) => x.title === 'Kitebird invoice')!;
    const d = await detail(t.id);
    expect(d.priority).toBe('urgent');
    expect(d.notes.find((n) => n.type === 'claude')?.body).toBe('Amount is 12,400 EGP');
  });

  it('today shows progress and what’s on the plate', async () => {
    await call('move_task', { id: 'Kitebird invoice', stage: 'in_process' });
    const r = await call('today');
    expect(r.text).toMatch(/^Today: 0 done/);
    expect(r.text).toContain('In process:');
    expect(r.text).toContain('Kitebird invoice');
  });
});

describe('when Lanes is down', () => {
  it('returns a friendly error instead of crashing', async () => {
    const down = await connect(async () => {
      throw new TypeError('fetch failed');
    });
    const r = (await down.callTool({ name: 'add_task', arguments: { title: 'x' } })) as {
      content: { text: string }[];
      isError: boolean;
    };
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toBe(NOT_RUNNING);
    await down.close();
  });

  it('treats a missing token file as not running, and a wrong token as a key problem', async () => {
    const noToken = await connect(injectFetch, () => {
      throw new Error('ENOENT');
    });
    expect(
      (
        (await noToken.callTool({ name: 'today', arguments: {} })) as {
          content: { text: string }[];
        }
      ).content[0]?.text,
    ).toBe(NOT_RUNNING);
    const wrong = await connect(injectFetch, () => 'b'.repeat(64));
    expect(
      ((await wrong.callTool({ name: 'today', arguments: {} })) as { content: { text: string }[] })
        .content[0]?.text,
    ).toMatch(/didn’t accept/);
    await noToken.close();
    await wrong.close();
  });
});

it('uses the fixed test clock', () => {
  expect(local(NOW.toISOString())).toBe('2026-11-04 10:00');
});
