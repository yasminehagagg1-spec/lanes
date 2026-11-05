// Natural language → TaskDraft. Shared by quick capture (UI) and the Claude bridge (MCP).
//
//   Title words  #project  !high|!urgent|!low  ~low|~med|~high  @tomorrow 3pm  ^1pm  =30m  > waiting on X
//
// Plain date phrases work too ("tomorrow at 3", "by Thursday", "بكرة الساعة ٥").
// Dates resolve in the device's timezone. Nothing here touches the network or storage.

import * as chrono from 'chrono-node';
import type { Energy, Priority, TaskDraft, TaskSource } from './schemas.js';
import { endOfLocalDay } from './time.js';

export interface ParseOptions {
  now?: Date;
  /** Existing project names, so `#northfield` can resolve to "Northfield Studio". */
  knownProjects?: readonly string[];
  source?: TaskSource;
}

interface When {
  date: Date;
  hasTime: boolean;
  /** False for time-only phrases ("3pm") where the day was inferred. */
  dateCertain: boolean;
}

interface Span {
  start: number;
  end: number;
}

// ---------- helpers ----------

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (ch) => {
    const i = ARABIC_DIGITS.indexOf(ch);
    return String(i >= 0 ? i : PERSIAN_DIGITS.indexOf(ch));
  });
}

const PREFIX = /^\s*(?:new\s+tasks?|task\s+جديد[ةه]|مهم[ةه]\s+جديد[ةه])\s*[:\-–—]?\s*/iu;
const BULLET = /^\s*(?:[-*•–]|\d+[.)])\s+/u;
const EN_PREPOSITION = /(?:^|\s)(?:on|at|by|before|due|until|for)\s*$/i;

function removeSpans(text: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const s of sorted) out = `${out.slice(0, s.start)} ${out.slice(s.end)}`;
  return out;
}

function cleanTitle(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/\s+(?:on|at|by|before|due|until|for)$/i, '')
      .replace(/\s+(?:في|يوم)$/u, '')
      .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/gu, '');
  }
  return t;
}

/** Bare hours 1–7 without am/pm almost always mean the afternoon ("call at 3"). */
function assumeMeridiem(hour: number): number {
  return hour >= 1 && hour <= 7 ? hour + 12 : hour;
}

function atTime(day: Date, hour: number, minute: number): Date {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Today at hh:mm, or tomorrow if that moment has passed. */
function nextAt(now: Date, hour: number, minute: number): Date {
  const d = atTime(now, hour, minute);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

// ---------- English (chrono) ----------

function fromChrono(result: chrono.ParsedResult, now: Date): When {
  const c = result.start;
  const dateCertain = c.isCertain('day') || c.isCertain('weekday');
  if (!c.isCertain('hour')) {
    return { date: endOfLocalDay(c.date()), hasTime: false, dateCertain: true };
  }
  const minute = c.get('minute') ?? 0;
  let hour = c.get('hour') ?? 0;
  if (!c.isCertain('meridiem')) hour = assumeMeridiem(hour);
  if (!dateCertain) return { date: nextAt(now, hour, minute), hasTime: true, dateCertain: false };
  return { date: atTime(c.date(), hour, minute), hasTime: true, dateCertain: true };
}

/** Without an explicit `@`, only accept phrases that clearly mean a date. */
function looksLikeDate(result: chrono.ParsedResult): boolean {
  const t = result.text;
  if (!/\p{L}/u.test(t)) return false; // "6/9", "10:30" alone are too ambiguous in a title
  // "3d model", "30m", "12h batch", "1200m roll": a number with a unit is part of the title
  // (estimates use =30m). Times like "3pm" / "11am" still count.
  if (
    /^\d+(?:\.\d+)?\s*[a-z]{1,5}$/i.test(t.trim()) &&
    !/^\d{1,2}(?::\d{2})?\s*[ap]\.?m?\.?$/i.test(t.trim())
  ) {
    return false;
  }
  if (result.start.isCertain('hour')) return true;
  if (/\b(?:today|tonight|tomorrow|tmrw|next|this|weekend|in\s+\d+)\b/i.test(t)) return true;
  if (/\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i.test(t)) return true; // not "Sun", "Wed"
  return result.start.isCertain('day') && result.start.isCertain('month') && /\d/.test(t);
}

// ---------- Arabic ----------

const NOT_LETTER_BEFORE = '(?<!\\p{L})';
const NOT_LETTER_AFTER = '(?!\\p{L})';
const ar = (body: string) =>
  new RegExp(`${NOT_LETTER_BEFORE}(?:يوم\\s+)?(?:${body})${NOT_LETTER_AFTER}`, 'u');

const AR_RELATIVE: [RegExp, number][] = [
  [ar('بعد\\s+بكر[ةه]'), 2],
  [ar('بكر[ةه]|غدا'), 1],
  [ar('النهارد[ةه]|اليوم'), 0],
];
const AR_WEEKDAYS: [RegExp, number][] = [
  [ar('السبت'), 6],
  [ar('ال[أا]حد'), 0],
  [ar('ال[إا]?[ثت]نين'), 1],
  [ar('الثلاثاء|التلات'), 2],
  [ar('ال[أا]ربع(?:اء)?'), 3],
  [ar('الخميس'), 4],
  [ar('الجمع[ةه]'), 5],
];
const AR_TIME = new RegExp(
  `${NOT_LETTER_BEFORE}(?:ال)?ساع[ةه]\\s*(\\d{1,2})(?:[:.](\\d{2}))?` +
    `(?:\\s*و\\s*(نص|ربع))?` +
    `(?:\\s+(الصبح|صباحا|الظهر|الضهر|العصر|المغرب|بالليل|بليل|الليل|مساء|بعد\\s+ال[ضظ]هر))?`,
  'u',
);
const AR_MORNING = new Set(['الصبح', 'صباحا']);

function parseArabicWhen(text: string, now: Date): { when: When; spans: Span[] } | null {
  const spans: Span[] = [];
  let day: Date | null = null;

  for (const [re, offset] of AR_RELATIVE) {
    const m = re.exec(text);
    if (m) {
      day = new Date(now);
      day.setDate(day.getDate() + offset);
      spans.push({ start: m.index, end: m.index + m[0].length });
      break;
    }
  }
  if (!day) {
    for (const [re, weekday] of AR_WEEKDAYS) {
      const m = re.exec(text);
      if (m) {
        day = new Date(now);
        day.setDate(day.getDate() + ((weekday - day.getDay() + 7) % 7));
        spans.push({ start: m.index, end: m.index + m[0].length });
        break;
      }
    }
  }

  const t = AR_TIME.exec(text);
  if (t) {
    let hour = Number(t[1]);
    let minute = t[2] ? Number(t[2]) : 0;
    if (t[3] === 'نص') minute += 30;
    if (t[3] === 'ربع') minute += 15;
    const period = t[4]?.replace(/ً/g, '');
    if (period && AR_MORNING.has(period)) hour = hour === 12 ? 0 : hour;
    else if (period) hour = hour < 12 ? hour + 12 : hour;
    else hour = assumeMeridiem(hour);
    if (hour > 23 || minute > 59) return null;
    spans.push({ start: t.index, end: t.index + t[0].length });
    const date = day ? atTime(day, hour, minute) : nextAt(now, hour, minute);
    return { when: { date, hasTime: true, dateCertain: day !== null }, spans };
  }

  if (!day) return null;
  return { when: { date: endOfLocalDay(day), hasTime: false, dateCertain: true }, spans };
}

// ---------- date phrase after a sigil (@ / ^) ----------

/** Parses a date at the very start of `phrase`. Returns how many characters it used. */
function parseWhenPrefix(phrase: string, now: Date): { when: When; length: number } | null {
  const arabic = parseArabicWhen(phrase, now);
  if (arabic) {
    const spans = [...arabic.spans].sort((a, b) => a.start - b.start);
    const first = spans[0];
    const last = spans[spans.length - 1];
    const gapsAreBlank = spans.every(
      (s, i) => i === 0 || phrase.slice(spans[i - 1]?.end ?? 0, s.start).trim() === '',
    );
    if (first && last && first.start === 0 && gapsAreBlank) {
      return { when: arabic.when, length: last.end };
    }
  }
  const result = chrono.parse(phrase, now, { forwardDate: true })[0];
  if (result && result.index === 0) {
    return { when: fromChrono(result, now), length: result.text.length };
  }
  return null;
}

// ---------- sigils ----------

interface Segment {
  sigil: string;
  value: string;
  start: number;
  valueStart: number;
  end: number;
}

const MARK = /(^|\s)([#!~=@^])/gu;

function findSegments(text: string): Segment[] {
  const marks = [...text.matchAll(MARK)].map((m) => ({
    sigil: m[2] ?? '',
    pos: (m.index ?? 0) + (m[1]?.length ?? 0),
  }));
  return marks.map((mark, i) => {
    const phraseEnd = marks[i + 1]?.pos ?? text.length;
    let end = phraseEnd;
    if (mark.sigil !== '@' && mark.sigil !== '^') {
      const space = text.slice(mark.pos).search(/\s/);
      end = space < 0 ? text.length : mark.pos + space;
    }
    const raw = text.slice(mark.pos + 1, end);
    const lead = raw.length - raw.trimStart().length;
    return {
      sigil: mark.sigil,
      value: raw.trim(),
      start: mark.pos,
      valueStart: mark.pos + 1 + lead,
      end,
    };
  });
}

const PRIORITY_TOKENS: Record<string, Priority> = {
  urgent: 'urgent',
  high: 'high',
  low: 'low',
  normal: 'normal',
  '!': 'high', // "!!"
  '!!': 'urgent', // "!!!"
};
const ENERGY_TOKENS: Record<string, Energy> = {
  low: 'low',
  l: 'low',
  med: 'medium',
  medium: 'medium',
  m: 'medium',
  high: 'high',
  h: 'high',
};

function parseEstimate(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(m|min|mins|h|hr|hrs)?(?:(\d+)\s*(?:m|min)?)?$/i.exec(value);
  if (!m) return null;
  const amount = Number(m[1]);
  const isHours = /^h/i.test(m[2] ?? '');
  const minutes = Math.round(isHours ? amount * 60 + Number(m[3] ?? 0) : amount);
  return minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

const squash = (s: string) => s.toLocaleLowerCase().replace(/[\s_-]+/g, '');

/** Matches a project name against existing ones ("north" → "Northfield Studio"). */
export function resolveProject(raw: string, known: readonly string[]): string {
  const name = raw.replace(/_/g, ' ').trim();
  const key = squash(name);
  const exact = known.find((p) => squash(p) === key);
  if (exact) return exact;
  const prefixed = known.filter((p) => squash(p).startsWith(key));
  return prefixed.length === 1 && prefixed[0] ? prefixed[0] : name;
}

function parseReminder(value: string, now: Date, due: When | null): Date | null {
  const rel = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?)\s*(before)?$/i.exec(value);
  if (rel) {
    const minutes = Number(rel[1]) * (/^h/i.test(rel[2] ?? '') ? 60 : 1);
    const base = rel[3] && due ? due.date.getTime() : now.getTime();
    const sign = rel[3] && due ? -1 : 1;
    return new Date(base + sign * minutes * 60_000);
  }
  const parsed = parseWhenPrefix(value, now);
  if (!parsed || parsed.length < value.length) return null;
  const { when } = parsed;
  if (!when.hasTime) return atTime(when.date, 9, 0);
  if (!when.dateCertain && due) {
    return atTime(due.date, when.date.getHours(), when.date.getMinutes());
  }
  return when.date;
}

// ---------- public API ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** "3" alone means 3 o'clock ("remind me at 1"). */
const bareHour = (s: string) => s.replace(/^(\d{1,2})$/, '$1:00');

export interface ResolvedWhen {
  /** ISO date-time. A date without a time resolves to 23:59 local that day. */
  at: string;
  hasTime: boolean;
}

/**
 * A whole phrase → a moment: ISO ("2026-11-06T15:00:00+02:00"), a bare date ("2026-11-06"),
 * or natural words in English or Arabic ("tomorrow 3pm", "by Thursday", "بكرة الساعة ٥").
 * Returns null when the phrase isn't entirely a date.
 */
export function resolveWhen(phrase: string, now: Date = new Date()): ResolvedWhen | null {
  let text = normalizeDigits(phrase)
    .trim()
    .replace(/^(?:on|at|by|before|due|until)\s+/i, '')
    .replace(/[.,;!]+$/, '');
  if (!text) return null;
  text = bareHour(text);
  if (ISO_DATE.test(text)) {
    const [y, m, d] = text.split('-').map(Number);
    return {
      at: endOfLocalDay(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1)).toISOString(),
      hasTime: false,
    };
  }
  if (ISO_DATE_TIME.test(text)) {
    const t = Date.parse(text);
    return Number.isNaN(t) ? null : { at: new Date(t).toISOString(), hasTime: true };
  }
  const parsed = parseWhenPrefix(text, now);
  if (!parsed || text.slice(parsed.length).trim() !== '') return null;
  return { at: parsed.when.date.toISOString(), hasTime: parsed.when.hasTime };
}

/**
 * A reminder phrase → ISO time. Same rules as `^` in quick capture: "1pm" lands on the due
 * day when there is one, "30m before" counts back from due, a date alone means 9:00 that day.
 */
export function resolveReminder(
  phrase: string,
  now: Date = new Date(),
  due?: ResolvedWhen | null,
): string | null {
  const text = bareHour(
    normalizeDigits(phrase)
      .trim()
      .replace(/^(?:at|on)\s+/i, ''),
  );
  if (ISO_DATE_TIME.test(text)) {
    const t = Date.parse(text);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const dueWhen: When | null = due
    ? { date: new Date(due.at), hasTime: due.hasTime, dateCertain: true }
    : null;
  return parseReminder(text, now, dueWhen)?.toISOString() ?? null;
}

/** "An hour before a timed due date (or at due, if that's sooner)" — the default reminder. */
export function defaultReminder(due: ResolvedWhen, now: Date = new Date()): string | null {
  if (!due.hasTime) return null;
  const at = new Date(due.at);
  const hourBefore = new Date(at.getTime() - 60 * 60_000);
  if (hourBefore > now) return hourBefore.toISOString();
  return at > now ? at.toISOString() : null;
}

/** Parses one line. Returns null when there's no title left (e.g. only "#Kitebird"). */
export function parseTask(line: string, opts: ParseOptions = {}): TaskDraft | null {
  const now = opts.now ?? new Date();
  let text = normalizeDigits(line).replace(PREFIX, '').replace(BULLET, '');

  let stage: TaskDraft['stage'];
  let pendingReason: string | undefined;
  const pending = /(?:^|\s)>\s*(.*)$/u.exec(text);
  if (pending) {
    const reason = pending[1]?.trim();
    if (reason) {
      stage = 'pending';
      pendingReason = reason;
    }
    text = text.slice(0, pending.index);
  }

  let project: string | undefined;
  let priority: Priority | undefined;
  let energy: Energy | undefined;
  let estimateMin: number | undefined;
  let due: When | null = null;
  const reminderPhrases: string[] = [];
  const spans: Span[] = [];

  for (const seg of findSegments(text)) {
    const value = seg.value;
    const whole = { start: seg.start, end: seg.end };
    switch (seg.sigil) {
      case '#': {
        const m = /^([\p{L}\p{N}][\p{L}\p{N}_&.'-]*?)[.,;:]*$/u.exec(value);
        if (m?.[1] && !project) {
          project = resolveProject(m[1], opts.knownProjects ?? []);
          spans.push(whole);
        }
        break;
      }
      case '!': {
        const p = PRIORITY_TOKENS[value.toLowerCase()];
        if (p && !priority) {
          priority = p;
          spans.push(whole);
        }
        break;
      }
      case '~': {
        const e = ENERGY_TOKENS[value.toLowerCase()];
        if (e && !energy) {
          energy = e;
          spans.push(whole);
        }
        break;
      }
      case '=': {
        const est = parseEstimate(value);
        if (est && !estimateMin) {
          estimateMin = est;
          spans.push(whole);
        }
        break;
      }
      case '@': {
        const parsed: { when: When; length: number } | null = due
          ? null
          : parseWhenPrefix(value, now);
        if (parsed) {
          due = parsed.when;
          spans.push({ start: seg.start, end: seg.valueStart + parsed.length });
        }
        break;
      }
      case '^':
        if (value) {
          reminderPhrases.push(value);
          spans.push(whole);
        }
        break;
    }
  }

  let rest = removeSpans(text, spans);

  // Plain date phrases, when no @ was given.
  if (!due) {
    const arabic = parseArabicWhen(rest, now);
    if (arabic) {
      due = arabic.when;
      rest = removeSpans(rest, arabic.spans);
    } else {
      const result = chrono.parse(rest, now, { forwardDate: true }).find(looksLikeDate);
      if (result) {
        due = fromChrono(result, now);
        let start = result.index;
        const prep = EN_PREPOSITION.exec(rest.slice(0, start));
        if (prep) start = prep.index;
        rest = removeSpans(rest, [{ start, end: result.index + result.text.length }]);
      }
    }
  }

  const reminders: { fireAt: string }[] = [];
  const leftovers: string[] = [];
  for (const phrase of reminderPhrases) {
    const at = parseReminder(phrase, now, due);
    if (at) reminders.push({ fireAt: at.toISOString() });
    else leftovers.push(`^${phrase}`);
  }

  // A timed due date with no reminder gets one an hour before (or at due, if that's sooner).
  const dueWhen: When | null = due;
  if (dueWhen && dueWhen.hasTime && reminders.length === 0) {
    const hourBefore = new Date(dueWhen.date.getTime() - 60 * 60_000);
    if (hourBefore > now) reminders.push({ fireAt: hourBefore.toISOString() });
    else if (dueWhen.date > now) reminders.push({ fireAt: dueWhen.date.toISOString() });
  }

  const title = cleanTitle([rest, ...leftovers].join(' '));
  if (!title) return null;

  const draft: TaskDraft = { title };
  if (stage) draft.stage = stage;
  if (pendingReason) draft.pendingReason = pendingReason;
  if (project) draft.project = project;
  if (priority) draft.priority = priority;
  if (energy) draft.energy = energy;
  if (estimateMin) draft.estimateMin = estimateMin;
  if (dueWhen) {
    draft.dueAt = dueWhen.date.toISOString();
    draft.dueHasTime = dueWhen.hasTime;
  }
  if (reminders.length) draft.reminders = reminders;
  if (opts.source) draft.source = opts.source;
  return draft;
}

/** Multi-line input = one task per line ("brain dump"). Bullets and numbering are stripped. */
export function parseTasks(text: string, opts: ParseOptions = {}): TaskDraft[] {
  return normalizeDigits(text)
    .replace(PREFIX, '')
    .split(/\r?\n/)
    .map((line) => parseTask(line, opts))
    .filter((d): d is TaskDraft => d !== null);
}
