// Reminder + postponed loop (docs/build-kit/02 §4). Runs inside the server, so reminders fire
// with the browser tab closed. Every tick:
//   1. Postponed tasks whose "back on" day has arrived return to New (with a reminder).
//   2. Due reminders fire: macOS notification + `reminder.fired` over SSE.
// On startup, if more than 2 reminders were missed (Mac asleep, server off), they're
// grouped into one notification.
import { dayKey, ulid, type Reminder, type Task } from '@lanes/shared';
import type { Ctx } from './context.js';
import { getSettings } from './db/repo/settings.js';
import { getReminder, getTask } from './db/repo/tasks.js';
import type { Notifier } from './notify.js';
import { moveTask } from './services/tasks.js';

export const DEFAULT_TICK_MS = 15_000;
export const BACK_FROM_POSTPONED = 'Back from postponed';

const pad = (n: number) => String(n).padStart(2, '0');

function timeText(d: Date): string {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}

function dueText(task: Task, now: Date): string | null {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const days = Math.round(
    (new Date(due.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86_400_000,
  );
  const day =
    days === 0
      ? 'today'
      : days === 1
        ? 'tomorrow'
        : days === -1
          ? 'yesterday'
          : due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `Due ${day}${task.dueHasTime ? ` at ${timeText(due)}` : ''}`;
}

/** What the banner says under the task title. */
export function reminderBody(reminder: Reminder, task: Task, now: Date): string {
  return reminder.message || dueText(task, now) || task.project?.name || 'Lanes reminder';
}

export interface SchedulerDeps {
  notify: Notifier;
  /** e.g. http://localhost:4747 — notification clicks open `${baseUrl}/?task=<id>`. */
  baseUrl: string;
  tickMs?: number;
  log?: (msg: string) => void;
}

export interface TickResult {
  fired: number;
  returned: number;
  grouped: boolean;
}

export function createScheduler(ctx: Ctx, deps: SchedulerDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  const log = deps.log ?? console.error;

  function returnPostponed(now: Date): number {
    const today = dayKey(now, getSettings(ctx.db).dayStartHour);
    const ids = ctx.db
      .prepare(
        `SELECT id FROM tasks WHERE deleted_at IS NULL AND stage = 'postponed'
           AND resume_on IS NOT NULL AND resume_on <= ? ORDER BY resume_on, position`,
      )
      .pluck()
      .all(today) as string[];

    for (const id of ids) {
      moveTask(ctx, id, { stage: 'new' }, { logNote: BACK_FROM_POSTPONED });
      ctx.db
        .prepare(
          'INSERT INTO reminders (id, task_id, fire_at, message, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(ulid(), id, now.toISOString(), BACK_FROM_POSTPONED, now.toISOString());
    }
    return ids.length;
  }

  async function fireDue(
    now: Date,
    startup: boolean,
  ): Promise<{ fired: number; grouped: boolean }> {
    const due = ctx.db
      .prepare(
        `SELECT r.id FROM reminders r JOIN tasks t ON t.id = r.task_id
         WHERE r.fired_at IS NULL AND r.dismissed = 0 AND t.deleted_at IS NULL AND r.fire_at <= ?
         ORDER BY r.fire_at`,
      )
      .pluck()
      .all(now.toISOString()) as string[];
    if (!due.length) return { fired: 0, grouped: false };

    // Mark first, so a slow or failing notification can never fire the same reminder twice.
    const mark = ctx.db.prepare(
      'UPDATE reminders SET fired_at = ? WHERE id = ? AND fired_at IS NULL',
    );
    ctx.db.transaction(() => {
      for (const id of due) mark.run(now.toISOString(), id);
    })();

    const items = due
      .map((id) => {
        const reminder = getReminder(ctx.db, id);
        const task = reminder ? getTask(ctx.db, reminder.taskId) : null;
        return reminder && task ? { reminder, task } : null;
      })
      .filter((x): x is { reminder: Reminder; task: Task } => x !== null);

    for (const item of items) ctx.events.emit({ type: 'reminder.fired', data: item });

    const sound = getSettings(ctx.db).sounds;
    const grouped = startup && items.length > 2;
    try {
      if (grouped) {
        const titles = items.map((i) => i.task.title);
        await deps.notify({
          title: `While you were away: ${items.length} reminders`,
          body: `${titles.slice(0, 3).join(' · ')}${titles.length > 3 ? ` +${titles.length - 3} more` : ''}`,
          url: `${deps.baseUrl}/`,
          sound,
        });
      } else {
        for (const { reminder, task } of items) {
          await deps.notify({
            title: task.title,
            body: reminderBody(reminder, task, now),
            url: `${deps.baseUrl}/?task=${encodeURIComponent(task.id)}`,
            sound,
          });
        }
      }
    } catch (err) {
      log(`Couldn’t show a notification: ${(err as Error).message}`);
    }
    return { fired: items.length, grouped };
  }

  /** One pass. Exposed for tests and for the startup run. */
  async function tick(opts: { startup?: boolean } = {}): Promise<TickResult> {
    if (running) return { fired: 0, returned: 0, grouped: false };
    running = true;
    try {
      const now = ctx.clock();
      const returned = returnPostponed(now);
      const { fired, grouped } = await fireDue(now, opts.startup ?? false);
      return { fired, returned, grouped };
    } catch (err) {
      log(`Scheduler tick failed: ${(err as Error).message}`);
      return { fired: 0, returned: 0, grouped: false };
    } finally {
      running = false;
    }
  }

  return {
    tick,
    async start() {
      await tick({ startup: true });
      timer = setInterval(() => void tick(), deps.tickMs ?? DEFAULT_TICK_MS);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
