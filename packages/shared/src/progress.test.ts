import { describe, expect, it } from 'vitest';
import {
  bestStreak,
  comboCount,
  currentStreakDetail,
  computeTodayStats,
  currentStreak,
  levelFor,
  momentumFor,
  momentumPoints,
} from './progress.js';

const days = (...keys: string[]) => new Set(keys);

describe('momentum', () => {
  it('counts tasks 1, subtasks 0.25, focus sessions 0.5', () => {
    expect(momentumPoints({ tasksDone: 3, subtasksDone: 2, focusSessionsCompleted: 0 })).toBe(3.5);
    expect(momentumPoints({ tasksDone: 0, subtasksDone: 0, focusSessionsCompleted: 2 })).toBe(1);
  });

  it('is measured against the goal and can exceed 1', () => {
    expect(momentumFor(3.5, 5)).toBeCloseTo(0.7);
    expect(momentumFor(7, 5)).toBeCloseTo(1.4);
    expect(momentumFor(1, 0)).toBe(1); // goal is never below 1
  });

  it('maps to milestone tiers at 25 / 50 / 75 / 100%', () => {
    expect([0, 0.24, 0.25, 0.5, 0.74, 0.75, 1, 1.6].map(levelFor)).toEqual([
      0, 0, 1, 2, 2, 3, 4, 4,
    ]);
  });

  it('never drops when tasks are added (planned count is not the denominator)', () => {
    const base = {
      doneToday: 2,
      subtasksDoneToday: 0,
      focusSessionsCompletedToday: 0,
      focusMinutesToday: 0,
      goal: 5,
      doneDays: days('2026-11-04'),
      todayKey: '2026-11-04',
    };
    const few = computeTodayStats({ ...base, openPlannedToday: 1 });
    const many = computeTodayStats({ ...base, openPlannedToday: 40 });
    expect(many.momentum).toBe(few.momentum);
    expect(many.plannedToday).toBe(42);
  });
});

describe('streak', () => {
  it('counts consecutive days ending today', () => {
    expect(currentStreak(days('2026-11-02', '2026-11-03', '2026-11-04'), '2026-11-04')).toBe(3);
  });

  it('still counts yesterday’s streak when nothing is done yet today', () => {
    expect(currentStreak(days('2026-11-02', '2026-11-03'), '2026-11-04')).toBe(2);
  });

  it('forgives one missed day (grace) without counting it', () => {
    // 1, 2, (3 missed), 4 → streak 3
    expect(currentStreak(days('2026-11-01', '2026-11-02', '2026-11-04'), '2026-11-04')).toBe(3);
  });

  it('only forgives one missed day per rolling 7 days', () => {
    // 10/30, (10/31 missed), 11/1, 11/2, (11/3 missed), 11/4 → second miss breaks it
    const d = days('2026-10-30', '2026-11-01', '2026-11-02', '2026-11-04');
    expect(currentStreak(d, '2026-11-04')).toBe(3);
  });

  it('two missed days in a row break the streak', () => {
    expect(currentStreak(days('2026-11-01', '2026-11-04'), '2026-11-04')).toBe(1);
  });

  it('is 0 with no history', () => {
    expect(currentStreak(days(), '2026-11-04')).toBe(0);
  });

  it('finds the best streak in history', () => {
    const d = days('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-11-04');
    expect(bestStreak(d)).toBe(4);
  });
});

describe('streak detail (heatmap)', () => {
  it('reports which missed day was forgiven', () => {
    const d = days('2026-11-01', '2026-11-02', '2026-11-04');
    expect(currentStreakDetail(d, '2026-11-04')).toEqual({ days: 3, graceDays: ['2026-11-03'] });
  });
});

describe('combo', () => {
  const at = (hhmm: string) => `2026-11-04T${hhmm}:00.000Z`;
  const now = new Date(at('10:30'));

  it('counts finishes chained within 10 minutes of each other', () => {
    expect(comboCount([at('10:05'), at('10:14'), at('10:22')], now)).toBe(3);
  });

  it('stops the chain at a gap over 10 minutes', () => {
    expect(comboCount([at('09:40'), at('10:14'), at('10:22')], now)).toBe(2);
  });

  it('is 0 when the latest finish is more than 10 minutes ago', () => {
    expect(comboCount([at('10:05'), at('10:10')], now)).toBe(0);
  });

  it('a single recent finish is not a combo (1)', () => {
    expect(comboCount([at('10:25')], now)).toBe(1);
    expect(comboCount([], now)).toBe(0);
  });
});
