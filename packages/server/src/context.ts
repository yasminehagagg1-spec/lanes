import type { DB } from './db/connection.js';
import type { EventBus } from './events.js';

/** What every service needs. `clock` is injectable so tests can control "now". */
export interface Ctx {
  db: DB;
  clock: () => Date;
  events: EventBus;
}

export const nowIso = (ctx: Ctx) => ctx.clock().toISOString();
