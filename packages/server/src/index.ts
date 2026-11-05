import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from './app.js';
import { ensureToken } from './auth.js';
import { loadConfig } from './config.js';
import type { Ctx } from './context.js';
import { openDatabase } from './db/connection.js';
import { EventBus } from './events.js';
import { notifierFromEnv } from './notify.js';
import { createScheduler, DEFAULT_TICK_MS } from './scheduler.js';
import { ensureDailyBackup } from './services/backup.js';
import { purgeDeleted } from './services/tasks.js';
import { logToFile } from './log.js';

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
const logFile = logToFile(config.dataDir);

const ctx: Ctx = {
  db: openDatabase(path.join(config.dataDir, 'lanes.db')),
  clock: () => new Date(),
  events: new EventBus(),
};
const token = ensureToken(config.dataDir);
purgeDeleted(ctx);

// Daily backup: on startup, then checked hourly (so a Mac that slept still gets one a day).
const backupDaily = () => {
  try {
    const made = ensureDailyBackup(ctx.db, config.dataDir, ctx.clock());
    if (made) console.log(`Backup saved: backups/${made.name}`);
  } catch (err) {
    console.error('Daily backup failed:', err);
  }
};
backupDaily();
const backupTimer = setInterval(backupDaily, 60 * 60_000);
backupTimer.unref();

const app = await buildApp({ config, ctx, token });
await app.listen({ host: config.host, port: config.port });
console.log(`Lanes is awake at http://localhost:${config.port}  (data: ${config.dataDir})`);
console.log(`Log: ${logFile}`);

const scheduler = createScheduler(ctx, {
  notify: notifierFromEnv(),
  baseUrl: `http://localhost:${config.port}`,
  tickMs: Number(process.env.LANES_SCHEDULER_MS) || DEFAULT_TICK_MS,
});
await scheduler.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    scheduler.stop();
    clearInterval(backupTimer);
    void app.close().then(() => {
      ctx.db.close();
      process.exit(0);
    });
  });
}
