// Momentum + streak math. Pure functions; the server feeds them counts from SQLite.
// Principle: reward progress, never punish the backlog. Nothing here looks at how many
// tasks are open, so adding tasks can never make the bar drop.

import { addDaysToKey } from './time.js';

export const POINTS = { task: 1, subtask: 0.25, focusSession: 0.5 } as const;

export type MomentumLevel = 0 | 1 | 2 | 3 | 4;

export interface TodayStats {
  doneToday: number;
  /** doneToday + open tasks due today/overdue or in process. Context only — never the denominator. */
  plannedToday: number;
  goal: number;
  points: number;
  /** points / goal. Can exceed 1 ("overdrive"). */
  momentum: number;
  level: MomentumLevel;
  streakDays: number;
  bestStreak: number;
  subtasksDoneToday: number;
  focusMinutesToday: number;
}

export function momentumPoints(input: {
  tasksDone: number;
  subtasksDone: number;
  focusSessionsCompleted: number;
}): number {
  return (
    input.tasksDone * POINTS.task +
    input.subtasksDone * POINTS.subtask +
    input.focusSessionsCompleted * POINTS.focusSession
  );
}

export function momentumFor(points: number, goal: number): number {
  return points / Math.max(1, goal);
}

/** Milestone tier: 25% → 1, 50% → 2, 75% → 3, 100%+ → 4. */
export function levelFor(momentum: number): MomentumLevel {
  if (momentum >= 1) return 4;
  if (momentum >= 0.75) return 3;
  if (momentum >= 0.5) return 2;
  if (momentum >= 0.25) return 1;
  return 0;
}

/** One missed day is forgiven per rolling 7 days. */
export const GRACE_EVERY_DAYS = 7;

/**
 * Days with ≥1 task done, counted back from `endKey`. A single missed day is forgiven
 * (it doesn't break the streak, but doesn't add to it either) if no other day was
 * forgiven in the previous 7 days, and only when the streak continues past it.
 */
export function streakEndingAt(doneDays: ReadonlySet<string>, endKey: string): number {
  return streakDetail(doneDays, endKey).days;
}

/** The streak ending at `endKey`, plus which missed days were forgiven inside it. */
export function streakDetail(
  doneDays: ReadonlySet<string>,
  endKey: string,
): { days: number; graceDays: string[] } {
  let days = 0;
  const graceDays: string[] = [];
  let key = endKey;

  for (let guard = 0; guard < 5000; guard++) {
    if (doneDays.has(key)) {
      days++;
    } else {
      const before = addDaysToKey(key, -1);
      const lastGrace = graceDays[graceDays.length - 1];
      const graceAvailable =
        lastGrace === undefined || daysBetween(key, lastGrace) >= GRACE_EVERY_DAYS;
      if (days > 0 && graceAvailable && doneDays.has(before)) {
        graceDays.push(key);
      } else {
        break;
      }
    }
    key = addDaysToKey(key, -1);
  }
  return { days, graceDays };
}

/** Streak details for "now": ending today, or yesterday if nothing is done yet today. */
export function currentStreakDetail(
  doneDays: ReadonlySet<string>,
  todayKey: string,
): { days: number; graceDays: string[] } {
  return streakDetail(doneDays, doneDays.has(todayKey) ? todayKey : addDaysToKey(todayKey, -1));
}

/** Current streak: ending today, or ending yesterday if nothing is done yet today. */
export function currentStreak(doneDays: ReadonlySet<string>, todayKey: string): number {
  return currentStreakDetail(doneDays, todayKey).days;
}

export const COMBO_WINDOW_MIN = 10;

/**
 * Finishes in a row: how many completions chain back from the latest one, each within
 * 10 minutes of the next, as long as the latest is within 10 minutes of now. 0 or 1 = no combo.
 */
export function comboCount(
  completedAt: readonly string[],
  now: Date,
  windowMin = COMBO_WINDOW_MIN,
): number {
  const windowMs = windowMin * 60_000;
  const times = completedAt
    .map((iso) => Date.parse(iso))
    .filter((t) => Number.isFinite(t) && t <= now.getTime())
    .sort((a, b) => b - a);
  const latest = times[0];
  if (latest === undefined || now.getTime() - latest > windowMs) return 0;
  let count = 1;
  for (let i = 1; i < times.length; i++) {
    const newer = times[i - 1] ?? 0;
    const older = times[i] ?? 0;
    if (newer - older > windowMs) break;
    count++;
  }
  return count;
}

export function bestStreak(doneDays: ReadonlySet<string>): number {
  let best = 0;
  for (const key of doneDays) {
    // Only start counting from the last day of a run.
    if (doneDays.has(addDaysToKey(key, 1))) continue;
    best = Math.max(best, streakEndingAt(doneDays, key));
  }
  return best;
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

export function computeTodayStats(input: {
  doneToday: number;
  subtasksDoneToday: number;
  focusSessionsCompletedToday: number;
  focusMinutesToday: number;
  openPlannedToday: number;
  goal: number;
  doneDays: ReadonlySet<string>;
  todayKey: string;
}): TodayStats {
  const points = momentumPoints({
    tasksDone: input.doneToday,
    subtasksDone: input.subtasksDoneToday,
    focusSessionsCompleted: input.focusSessionsCompletedToday,
  });
  const momentum = momentumFor(points, input.goal);
  return {
    doneToday: input.doneToday,
    plannedToday: input.doneToday + input.openPlannedToday,
    goal: input.goal,
    points,
    momentum,
    level: levelFor(momentum),
    streakDays: currentStreak(input.doneDays, input.todayKey),
    bestStreak: Math.max(bestStreak(input.doneDays), 0),
    subtasksDoneToday: input.subtasksDoneToday,
    focusMinutesToday: input.focusMinutesToday,
  };
}
