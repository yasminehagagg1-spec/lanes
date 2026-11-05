import { describe, expect, it } from 'vitest';
import { defaultReminder, resolveProject, resolveReminder, resolveWhen } from './parse-task.js';
import { local, NOW } from './test-utils.js';

const when = (s: string) => {
  const r = resolveWhen(s, NOW);
  return r ? `${local(r.at)}${r.hasTime ? '' : ' (no time)'}` : null;
};

describe('resolveWhen', () => {
  it('reads natural English phrases', () => {
    expect(when('tomorrow 3pm')).toBe('2026-11-05 15:00');
    expect(when('by Thursday')).toBe('2026-11-05 23:59 (no time)');
    expect(when('next monday at 10am')).toBe('2026-11-09 10:00');
    expect(when('at 3')).toBe('2026-11-04 15:00');
  });

  it('reads Arabic phrases and digits', () => {
    expect(when('بكرة الساعة ٥')).toBe('2026-11-05 17:00');
    expect(when('الخميس')).toBe('2026-11-05 23:59 (no time)');
  });

  it('accepts ISO dates and date-times', () => {
    expect(when('2026-11-10')).toBe('2026-11-10 23:59 (no time)');
    expect(when('2026-11-10T09:30:00+02:00')).toBe('2026-11-10 09:30');
  });

  it('rejects phrases that are not only a date', () => {
    expect(when('call the printer')).toBeNull();
    expect(when('tomorrow and also call')).toBeNull();
    expect(when('')).toBeNull();
  });
});

describe('resolveReminder', () => {
  const due = resolveWhen('tomorrow 3pm', NOW);
  it('puts a bare time on the due day', () => {
    expect(local(resolveReminder('1pm', NOW, due))).toBe('2026-11-05 13:00');
    expect(local(resolveReminder('at 1', NOW, due))).toBe('2026-11-05 13:00');
  });
  it('counts back from due', () => {
    expect(local(resolveReminder('30m before', NOW, due))).toBe('2026-11-05 14:30');
  });
  it('uses 9:00 for a date alone, and the next such time with no due', () => {
    expect(local(resolveReminder('friday', NOW))).toBe('2026-11-06 09:00');
    expect(local(resolveReminder('11am', NOW))).toBe('2026-11-04 11:00');
  });
  it('returns null for nonsense', () => {
    expect(resolveReminder('whenever', NOW)).toBeNull();
  });
});

describe('defaultReminder / resolveProject', () => {
  it('adds an hour-before reminder only for timed dues', () => {
    expect(local(defaultReminder(resolveWhen('tomorrow 3pm', NOW)!, NOW))).toBe('2026-11-05 14:00');
    expect(defaultReminder(resolveWhen('tomorrow', NOW)!, NOW)).toBeNull();
  });
  it('matches existing project names loosely', () => {
    expect(resolveProject('northfield', ['Northfield Studio', 'Kitebird'])).toBe('Northfield Studio');
    expect(resolveProject('kitebird', ['Northfield Studio', 'Kitebird'])).toBe('Kitebird');
    expect(resolveProject('New Client', ['Kitebird'])).toBe('New Client');
  });
});
