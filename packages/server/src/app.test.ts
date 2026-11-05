import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureToken, hostnameOf, isAuthorized } from './auth.js';
import { loadConfig } from './config.js';
import { migrate, openDatabase } from './db/connection.js';
import { BROWSER, makeHarness, TOKEN, type Harness } from './test-harness.js';

describe('server security', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(() => h.app.close());

  const get = (headers: Record<string, string>) =>
    h.app.inject({ url: '/api/tasks', headers: { host: 'localhost:4747', ...headers } });

  it('health is open and reports the task count', async () => {
    const res = await h.app.inject({ url: '/api/health', headers: { host: 'localhost:4747' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, version: '0.1.0', tasks: 0 });
  });

  it('rejects requests addressed to another host (DNS rebinding)', async () => {
    const res = await h.app.inject({ url: '/api/health', headers: { host: 'evil.example:4747' } });
    expect(res.statusCode).toBe(403);
  });

  it('lets the same-origin browser UI in without a token', async () => {
    expect((await get({ 'sec-fetch-site': 'same-origin' })).statusCode).toBe(200);
  });

  it('lets other clients in with the bearer token only', async () => {
    expect((await get({})).statusCode).toBe(401);
    expect((await get({ authorization: 'Bearer wrong' })).statusCode).toBe(401);
    expect((await get({ authorization: `Bearer ${TOKEN}` })).statusCode).toBe(200);
  });

  it('rejects other websites calling the API from a browser', async () => {
    expect((await get({ 'sec-fetch-site': 'cross-site' })).statusCode).toBe(401);
    expect(
      isAuthorized({ 'sec-fetch-site': 'same-origin', origin: 'https://evil.example' }, TOKEN),
    ).toBe(false);
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await h.app.inject({ url: '/api/nope', headers: BROWSER });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('returns a readable 400 for bad input', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: BROWSER,
      payload: { title: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
  });
});

describe('config, token, migrations', () => {
  it('defaults to port 4747 on 127.0.0.1 and the real data folder', () => {
    const c = loadConfig({});
    expect(c.port).toBe(4747);
    expect(c.host).toBe('127.0.0.1');
    expect(c.dataDir).toMatch(/Application Support\/Lanes$/);
  });

  it('rejects a bad port', () => {
    expect(() => loadConfig({ LANES_PORT: 'abc' })).toThrow();
  });

  it('creates a private token once and keeps it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanes-token-'));
    const first = ensureToken(dir);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(ensureToken(dir)).toBe(first);
    expect(fs.statSync(path.join(dir, 'token')).mode & 0o777).toBe(0o600);
    fs.rmSync(dir, { recursive: true });
  });

  it('migrations are idempotent and insert settings defaults', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db)).toEqual([]);
    expect(db.prepare("SELECT value FROM settings WHERE key = 'daily_goal'").pluck().get()).toBe(
      '5',
    );
    db.close();
  });

  it('strips ports and keeps IPv6 brackets', () => {
    expect(hostnameOf('localhost:4747')).toBe('localhost');
    expect(hostnameOf('[::1]:4747')).toBe('[::1]');
    expect(hostnameOf(undefined)).toBe('');
  });
});
