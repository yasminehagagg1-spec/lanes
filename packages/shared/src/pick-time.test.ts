import { describe, expect, it } from 'vitest';
import {
  nothingLight,
  pickTask,
  rankTasks,
  reasonLine,
  smallestStep,
  type PickCandidate,
} from './pick.js';
import { dayKey, dayWindow, normalizeDue, presetTime, weekWindow } from './time.js';
import { ulid } from './ids.js';
import { local, NOW } from './test-utils.js';

const todayEnd = dayWindow(NOW, 6).end;
const noJitter = () => 0;
const task = (over: Partial<PickCandidate> & { id: string }): PickCandidate => ({
  stage: 'new',
  priority: 'normal',
  energy: null,
  dueAt: null,
  estimateMin: null,
  ...over,
});

describe('pickTask', () => {
  it('prefers what is due today and fits my energy', () => {
    const picked = pickTask(
      [
        task({ id: 'a', energy: 'high' }),
        task({ id: 'b', energy: 'low', dueAt: '2026-11-04T14:00:00.000Z' }),
      ],
      { energy: 'low', now: NOW, todayEnd, random: noJitter },
    );
    expect(picked?.task.id).toBe('b');
    expect(picked?.reason).toBe('Due today, and fits low energy.');
  });

  it('never suggests pending, postponed or done tasks', () => {
    const picked = pickTask(
      [task({ id: 'p', stage: 'pending', priority: 'urgent' }), task({ id: 'n' })],
      { now: NOW, todayEnd, random: noJitter },
    );
    expect(picked?.task.id).toBe('n');
  });

  it('skips excluded ids and returns null when nothing is left', () => {
    const list = [task({ id: 'x' })];
    expect(pickTask(list, { now: NOW, todayEnd }, new Set(['x']))).toBeNull();
  });

  it('nudges toward finishing what was started', () => {
    const picked = pickTask([task({ id: 'new' }), task({ id: 'started', stage: 'in_process' })], {
      now: NOW,
      todayEnd,
      random: noJitter,
    });
    expect(picked?.task.id).toBe('started');
  });

  it('ranks the top 3', () => {
    const ranked = rankTasks(
      [
        task({ id: 'low' }),
        task({ id: 'urgent', priority: 'urgent' }),
        task({ id: 'due', dueAt: '2026-11-04T14:00:00.000Z' }),
        task({ id: 'done', stage: 'done', priority: 'urgent' }),
      ],
      { now: NOW, todayEnd, random: noJitter },
    );
    expect(ranked.map((r) => r.task.id)).toEqual(['due', 'urgent', 'low']);
  });

  it('suggests the smallest open step when nothing is light', () => {
    const withSteps = (id: string, steps: string[], over: Partial<PickCandidate> = {}) => ({
      ...task({ id, energy: 'high', ...over }),
      subtasks: steps.map((title, i) => ({ id: `${id}-${i}`, title, done: false })),
    });
    const list = [
      withSteps('a', ['Write the whole brief']),
      withSteps('b', ['Export all assets', 'Rename'], { priority: 'urgent' }),
    ];
    expect(nothingLight(list)).toBe(true);
    expect(smallestStep(list, { now: NOW, todayEnd })).toEqual({
      task: list[1],
      step: { id: 'b-1', title: 'Rename' },
    });
  });

  it('has a fallback reason', () => {
    expect(reasonLine([])).toBe('A good one to start with.');
  });
});

describe('time', () => {
  it('a 1am finish counts for the previous day (day starts at 6)', () => {
    expect(dayKey(new Date('2026-11-04T23:00:00.000Z'), 6)).toBe('2026-11-04'); // Thu 01:00 Cairo
    expect(dayKey(new Date('2026-11-05T05:00:00.000Z'), 6)).toBe('2026-11-05'); // Thu 07:00
  });

  it('day window runs 06:00 → 06:00', () => {
    const w = dayWindow(NOW, 6);
    expect(local(w.start.toISOString())).toBe('2026-11-04 06:00');
    expect(local(w.end.toISOString())).toBe('2026-11-05 06:00');
  });

  it('week window starts on Saturday by default', () => {
    const w = weekWindow(NOW, 6, 6);
    expect(local(w.start.toISOString())).toBe('2026-10-31 06:00');
    expect(local(w.end.toISOString())).toBe('2026-11-07 06:00');
  });

  it('normalises date-only and offset due values', () => {
    expect(local(normalizeDue('2026-11-05').dueAt)).toBe('2026-11-05 23:59');
    expect(normalizeDue('2026-11-05').dueHasTime).toBe(false);
    expect(normalizeDue('2026-11-05T15:00:00+02:00').dueAt).toBe('2026-11-05T13:00:00.000Z');
  });

  it('reminder presets', () => {
    expect(local(presetTime('in_1h', NOW).toISOString())).toBe('2026-11-04 11:00');
    expect(local(presetTime('tonight', NOW).toISOString())).toBe('2026-11-04 20:00');
    expect(local(presetTime('tomorrow_morning', NOW).toISOString())).toBe('2026-11-05 09:00');
    expect(local(presetTime('next_monday', NOW).toISOString())).toBe('2026-11-09 09:00');
  });
});

describe('ulid', () => {
  it('is 26 chars and sorts by time, even within one millisecond', () => {
    const a = ulid(1000);
    const b = ulid(1000);
    const c = ulid(2000);
    expect(a).toHaveLength(26);
    expect([c, b, a].sort()).toEqual([a, b, c]);
  });
});
