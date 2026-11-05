// "Today" is the day you're living in: it starts at `dayStartHour` local time (default 6),
// so a 1am finish still counts for the previous day. All math is in the device's timezone.

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a YYYY-MM-DD key. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDaysToKey(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

/** The lived day an instant belongs to. */
export function dayKey(date: Date, dayStartHour: number): string {
  const shifted = new Date(date.getTime());
  shifted.setHours(shifted.getHours() - dayStartHour);
  return localDateKey(shifted);
}

export interface TimeWindow {
  start: Date;
  end: Date;
}

/** Start/end of the lived day containing `now`. */
export function dayWindow(now: Date, dayStartHour: number): TimeWindow {
  const start = fromDateKey(dayKey(now, dayStartHour));
  start.setHours(dayStartHour, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** The lived week containing `now`, starting on `weekStartsOn` (0 = Sunday, 6 = Saturday). */
export function weekWindow(now: Date, dayStartHour: number, weekStartsOn: number): TimeWindow {
  const { start: today } = dayWindow(now, dayStartHour);
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() - weekStartsOn + 7) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** A due date given without a time means "by the end of that day". */
export function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 0, 0);
  return d;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalises a due value to a UTC ISO string. Accepts a full ISO date-time or a bare
 * YYYY-MM-DD (which becomes 23:59 local, without a time).
 */
export function normalizeDue(
  dueAt: string,
  dueHasTime?: boolean,
): { dueAt: string; dueHasTime: boolean } {
  if (DATE_ONLY.test(dueAt)) {
    return { dueAt: endOfLocalDay(fromDateKey(dueAt)).toISOString(), dueHasTime: false };
  }
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${dueAt}`);
  if (dueHasTime === false) return { dueAt: endOfLocalDay(d).toISOString(), dueHasTime: false };
  return { dueAt: d.toISOString(), dueHasTime: true };
}

export const REMINDER_PRESETS = ['in_1h', 'tonight', 'tomorrow_morning', 'next_monday'] as const;
export type ReminderPreset = (typeof REMINDER_PRESETS)[number];

export function presetTime(preset: ReminderPreset, now: Date): Date {
  const d = new Date(now);
  switch (preset) {
    case 'in_1h':
      return new Date(now.getTime() + 60 * 60_000);
    case 'tonight': {
      d.setHours(20, 0, 0, 0);
      // Already past 8pm: keep it "tonight", just a little later.
      const soon = new Date(now.getTime() + 30 * 60_000);
      return d > soon ? d : soon;
    }
    case 'tomorrow_morning':
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    case 'next_monday': {
      const days = (8 - d.getDay()) % 7 || 7; // strictly after today
      d.setDate(d.getDate() + days);
      d.setHours(9, 0, 0, 0);
      return d;
    }
  }
}
