import { addDaysToKey, computeTodayStats, dayKey, dayWindow, type TodayStats } from '@lanes/shared';
import type { Ctx } from '../context.js';
import { getSettings } from '../db/repo/settings.js';

function doneDayKeys(ctx: Ctx, dayStartHour: number): string[] {
  const rows = ctx.db
    .prepare(
      `SELECT completed_at FROM tasks
       WHERE deleted_at IS NULL AND stage = 'done' AND completed_at IS NOT NULL`,
    )
    .pluck()
    .all() as string[];
  return rows.map((iso) => dayKey(new Date(iso), dayStartHour));
}

export function getTodayStats(ctx: Ctx): TodayStats {
  const { db } = ctx;
  const now = ctx.clock();
  const settings = getSettings(db);
  const { start, end } = dayWindow(now, settings.dayStartHour);
  const s = start.toISOString();
  const e = end.toISOString();

  const doneToday = db
    .prepare(
      `SELECT COUNT(*) FROM tasks
       WHERE deleted_at IS NULL AND stage = 'done' AND completed_at >= ? AND completed_at < ?`,
    )
    .pluck()
    .get(s, e) as number;

  const subtasksDoneToday = db
    .prepare(
      `SELECT COUNT(*) FROM subtasks st JOIN tasks t ON t.id = st.task_id
       WHERE t.deleted_at IS NULL AND st.done = 1 AND st.done_at >= ? AND st.done_at < ?`,
    )
    .pluck()
    .get(s, e) as number;

  const focus = db
    .prepare(
      `SELECT COALESCE(SUM(f.actual_min), 0) AS minutes,
              COALESCE(SUM(CASE WHEN f.outcome = 'completed_task' OR f.actual_min >= f.planned_min
                                THEN 1 ELSE 0 END), 0) AS completed
       FROM focus_sessions f JOIN tasks t ON t.id = f.task_id
       WHERE t.deleted_at IS NULL AND f.ended_at >= ? AND f.ended_at < ?`,
    )
    .get(s, e) as { minutes: number; completed: number };

  const openPlannedToday = db
    .prepare(
      `SELECT COUNT(*) FROM tasks
       WHERE deleted_at IS NULL AND stage IN ('new','in_process','pending')
         AND (stage = 'in_process' OR (due_at IS NOT NULL AND due_at < ?))`,
    )
    .pluck()
    .get(e) as number;

  return computeTodayStats({
    doneToday,
    subtasksDoneToday,
    focusSessionsCompletedToday: focus.completed,
    focusMinutesToday: focus.minutes,
    openPlannedToday,
    goal: settings.dailyGoal,
    doneDays: new Set(doneDayKeys(ctx, settings.dayStartHour)),
    todayKey: dayKey(now, settings.dayStartHour),
  });
}

/** Done count per lived day, oldest first (for the 30-day heatmap). */
export function getHistory(ctx: Ctx, days: number): { date: string; done: number }[] {
  const settings = getSettings(ctx.db);
  const counts = new Map<string, number>();
  for (const key of doneDayKeys(ctx, settings.dayStartHour)) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = dayKey(ctx.clock(), settings.dayStartHour);
  return Array.from({ length: days }, (_, i) => {
    const date = addDaysToKey(today, i - days + 1);
    return { date, done: counts.get(date) ?? 0 };
  });
}
