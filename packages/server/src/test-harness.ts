// Test harness: in-memory database, controllable clock, real Fastify app (excluded from build).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import type { Ctx } from './context.js';
import { openDatabase } from './db/connection.js';
import { EventBus, type LanesEvent } from './events.js';

/** Wednesday 4 Nov 2026, 10:00 in Cairo. */
export const NOW = new Date('2026-11-04T08:00:00.000Z');
export const TOKEN = 'a'.repeat(64);

/** Headers a same-origin browser tab sends. */
export const BROWSER = { host: 'localhost:4747', 'sec-fetch-site': 'same-origin' };

export interface Harness {
  app: FastifyInstance;
  ctx: Ctx;
  events: LanesEvent[];
  /** Fresh temp folders per harness: data (backups land here) and a fake home. */
  dataDir: string;
  home: string;
  /** Folders "opened in Finder". */
  opened: string[];
  setNow: (d: Date) => void;
  advance: (minutes: number) => void;
  api: <T = unknown>(
    method: InjectOptions['method'],
    url: string,
    body?: unknown,
  ) => Promise<{ status: number; body: T }>;
}

export async function makeHarness(): Promise<Harness> {
  let now = new Date(NOW);
  const ctx: Ctx = {
    db: openDatabase(':memory:'),
    clock: () => new Date(now),
    events: new EventBus(),
  };
  const events: LanesEvent[] = [];
  ctx.events.subscribe((e) => events.push(e));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lanes-test-'));
  const dataDir = path.join(root, 'data');
  const home = path.join(root, 'home');
  fs.mkdirSync(dataDir);
  fs.mkdirSync(home);
  const config = { ...loadConfig({ LANES_DATA_DIR: dataDir }), webDist: '/nonexistent', home };
  const opened: string[] = [];
  const app = await buildApp({ config, ctx, token: TOKEN, openPath: (d) => opened.push(d) });
  app.addHook('onClose', async () => fs.rmSync(root, { recursive: true, force: true }));

  return {
    app,
    ctx,
    events,
    dataDir,
    home,
    opened,
    setNow: (d) => {
      now = new Date(d);
    },
    advance: (minutes) => {
      now = new Date(now.getTime() + minutes * 60_000);
    },
    api: async (method, url, body) => {
      const res = await app.inject({
        method,
        url,
        headers: BROWSER,
        ...(body === undefined ? {} : { payload: body as InjectOptions['payload'] }),
      });
      return { status: res.statusCode, body: (res.body ? res.json() : undefined) as never };
    },
  };
}
