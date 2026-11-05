import { describe, expect, it } from 'vitest';
import { parseTask, parseTasks } from './parse-task.js';
import { local, NOW } from './test-utils.js';

const KNOWN = ['Kitebird', 'Northfield Studio', 'Café rebrand', 'Personal'];
const parse = (text: string) => parseTask(text, { now: NOW, knownProjects: KNOWN });

describe('parseTask — the acceptance example', () => {
  it('parses "Send Kitebird invoice tomorrow 3pm !high #Kitebird"', () => {
    const d = parse('Send Kitebird invoice tomorrow 3pm !high #Kitebird');
    expect(d?.title).toBe('Send Kitebird invoice');
    expect(d?.priority).toBe('high');
    expect(d?.project).toBe('Kitebird');
    expect(local(d?.dueAt)).toBe('2026-11-05 15:00');
    expect(d?.dueHasTime).toBe(true);
    expect(d?.reminders?.map((r) => local(r.fireAt))).toEqual(['2026-11-05 14:00']);
  });
});

describe('parseTask — plain titles', () => {
  it('keeps a plain title untouched', () => {
    expect(parse('Buy milk')).toEqual({ title: 'Buy milk' });
  });

  it('does not treat numbers in titles as dates', () => {
    expect(parse('Social grid for the fragrance launch — 9 posts')).toEqual({
      title: 'Social grid for the fragrance launch — 9 posts',
    });
    expect(parse('Update v2/5 doc')).toEqual({ title: 'Update v2/5 doc' });
  });

  it('keeps a number with a unit in the title (3d model, 30m, 12h batch)', () => {
    expect(parse('Fix 3d model')).toEqual({ title: 'Fix 3d model' });
    expect(parse('Order 12h batch')).toEqual({ title: 'Order 12h batch' });
    expect(parse('Printer 1200m roll')).toEqual({ title: 'Printer 1200m roll' });
    expect(parse('Call 30m')).toEqual({ title: 'Call 30m' });
    const d = parse('Send invoice 2507m tomorrow 3pm');
    expect(d?.title).toBe('Send invoice 2507m');
    expect(local(d?.dueAt)).toBe('2026-11-05 15:00');
  });

  it('does not treat short weekday-like words as dates', () => {
    expect(parse('Sun protection poster')).toEqual({ title: 'Sun protection poster' });
  });

  it('leaves unknown sigils and exclamation marks in the title', () => {
    expect(parse('Done! Celebrate !maybe')?.title).toBe('Done! Celebrate !maybe');
    expect(parse('Done! Celebrate !maybe')?.priority).toBeUndefined();
  });

  it('returns null when nothing is left for a title', () => {
    expect(parse('   ')).toBeNull();
    expect(parse('#Kitebird !high')).toBeNull();
  });
});

describe('parseTask — projects', () => {
  it('matches a known project by unique prefix, case-insensitive', () => {
    const d = parse('#northfield social grid');
    expect(d?.project).toBe('Northfield Studio');
    expect(d?.title).toBe('social grid');
  });

  it('turns underscores into spaces and matches accented names', () => {
    expect(parse('Mascot sketches #Café_rebrand')?.project).toBe('Café rebrand');
  });

  it('keeps a new project name as typed', () => {
    expect(parse('Catalog layout #Jewelry')?.project).toBe('Jewelry');
  });
});

describe('parseTask — priority, energy, estimate', () => {
  it('reads !urgent / !low and !!/!!! shorthands', () => {
    expect(parse('Fix checkout !urgent')?.priority).toBe('urgent');
    expect(parse('Tidy desktop !low')?.priority).toBe('low');
    expect(parse('!! Call the bank')?.priority).toBe('high');
    expect(parse('!!! Call the bank')?.priority).toBe('urgent');
  });

  it('reads energy', () => {
    expect(parse('Quick email ~low')?.energy).toBe('low');
    expect(parse('Logo sketches ~med')?.energy).toBe('medium');
    expect(parse('Whole identity ~high')?.energy).toBe('high');
  });

  it('reads estimates in minutes and hours', () => {
    expect(parse('Review =45m')?.estimateMin).toBe(45);
    expect(parse('Review =2h')?.estimateMin).toBe(120);
    expect(parse('Review =1h30m')?.estimateMin).toBe(90);
    expect(parse('Review =1.5h')?.estimateMin).toBe(90);
    expect(parse('Review =20')?.estimateMin).toBe(20);
  });
});

describe('parseTask — pending', () => {
  it('"> reason" puts the task in Pending with that reason', () => {
    const d = parse('Menu layout, Arabic + English #Café > waiting on their final prices');
    expect(d?.title).toBe('Menu layout, Arabic + English');
    expect(d?.stage).toBe('pending');
    expect(d?.pendingReason).toBe('waiting on their final prices');
    expect(d?.project).toBe('Café rebrand');
  });
});

describe('parseTask — due dates (English)', () => {
  it('@ accepts short forms: @thu → Thursday, no time', () => {
    const d = parse('@thu Kitebird banners');
    expect(d?.title).toBe('Kitebird banners');
    expect(local(d?.dueAt)).toBe('2026-11-05 23:59');
    expect(d?.dueHasTime).toBe(false);
    expect(d?.reminders).toBeUndefined();
  });

  it('@next week → a week from today', () => {
    expect(local(parse('Report @next week')?.dueAt)).toBe('2026-11-11 23:59');
  });

  it('"by Thursday" → Thursday end of day, preposition removed', () => {
    const d = parse('Pay rent by Thursday');
    expect(d?.title).toBe('Pay rent');
    expect(local(d?.dueAt)).toBe('2026-11-05 23:59');
  });

  it('"at 3" means 3pm today', () => {
    const d = parse('Call mom at 3');
    expect(d?.title).toBe('Call mom');
    expect(local(d?.dueAt)).toBe('2026-11-04 15:00');
  });

  it('a time that already passed today rolls to tomorrow', () => {
    expect(local(parse('Standup 9am')?.dueAt)).toBe('2026-11-05 09:00');
  });

  it('"tonight" is today with no fixed time', () => {
    const d = parse('Gym tonight');
    expect(d?.title).toBe('Gym');
    expect(local(d?.dueAt)).toBe('2026-11-04 23:59');
    expect(d?.dueHasTime).toBe(false);
  });

  it('month + day dates work without @', () => {
    expect(local(parse('Portfolio review Nov 12')?.dueAt)).toBe('2026-11-12 23:59');
  });
});

describe('parseTask — reminders', () => {
  it('^time lands on the due day', () => {
    const d = parse('Call the printer tomorrow at 11am ^10:30');
    expect(local(d?.dueAt)).toBe('2026-11-05 11:00');
    expect(d?.reminders?.map((r) => local(r.fireAt))).toEqual(['2026-11-05 10:30']);
  });

  it('^30m before is relative to the due time', () => {
    const d = parse('Draft proposal @fri 5pm ^30m before');
    expect(local(d?.dueAt)).toBe('2026-11-06 17:00');
    expect(d?.reminders?.map((r) => local(r.fireAt))).toEqual(['2026-11-06 16:30']);
  });

  it('^30m with no due date means 30 minutes from now', () => {
    const d = parse('Water the plants ^30m');
    expect(d?.dueAt).toBeUndefined();
    expect(d?.reminders?.map((r) => local(r.fireAt))).toEqual(['2026-11-04 10:30']);
  });

  it('a due time less than an hour away gets a reminder at the due time', () => {
    const d = parse('Ping Sara at 10:30am');
    expect(d?.reminders?.map((r) => local(r.fireAt))).toEqual(['2026-11-04 10:30']);
  });
});

describe('parseTask — Arabic', () => {
  it('"بكرة الساعة ٥" → tomorrow 17:00, with Arabic-Indic digits', () => {
    const d = parse('تسليم بوستات السوشيال بكرة الساعة ٥');
    expect(d?.title).toBe('تسليم بوستات السوشيال');
    expect(local(d?.dueAt)).toBe('2026-11-05 17:00');
    expect(d?.reminders?.map((r) => local(r.fireAt))).toEqual(['2026-11-05 16:00']);
  });

  it('"النهارده الساعة 8 بالليل" → today 20:00', () => {
    const d = parse('اجتماع مع العميل النهارده الساعة 8 بالليل');
    expect(d?.title).toBe('اجتماع مع العميل');
    expect(local(d?.dueAt)).toBe('2026-11-04 20:00');
  });

  it('"يوم الخميس" → Thursday, no time', () => {
    const d = parse('مراجعة الكتالوج يوم الخميس');
    expect(d?.title).toBe('مراجعة الكتالوج');
    expect(local(d?.dueAt)).toBe('2026-11-05 23:59');
    expect(d?.dueHasTime).toBe(false);
  });

  it('"بعد بكرة" → the day after tomorrow', () => {
    const d = parse('تحديث البورتفوليو على بيهانس بعد بكرة');
    expect(d?.title).toBe('تحديث البورتفوليو على بيهانس');
    expect(local(d?.dueAt)).toBe('2026-11-06 23:59');
  });

  it('"الساعة ٩ الصبح" when 9am has passed → tomorrow 09:00', () => {
    expect(local(parse('مكالمة المطبعة الساعة ٩ الصبح')?.dueAt)).toBe('2026-11-05 09:00');
  });

  it('"الساعة 3 ونص" → 15:30', () => {
    expect(local(parse('مكالمة مع ليلى بكرة الساعة 3 ونص')?.dueAt)).toBe('2026-11-05 15:30');
  });

  it('works with English sigils mixed in', () => {
    const d = parse('بوستات الكافيه #Café !urgent بكرة');
    expect(d?.title).toBe('بوستات الكافيه');
    expect(d?.project).toBe('Café rebrand');
    expect(d?.priority).toBe('urgent');
    expect(local(d?.dueAt)).toBe('2026-11-05 23:59');
  });
});

describe('parseTask — prefixes', () => {
  it('strips a "new task:" prefix', () => {
    expect(parse('new task: Kitebird banners !high')).toEqual({
      title: 'Kitebird banners',
      priority: 'high',
    });
  });

  it('strips an Arabic "مهمة جديدة" prefix', () => {
    expect(parse('مهمة جديدة: شراء ورق')?.title).toBe('شراء ورق');
  });
});

describe('parseTasks — brain dump', () => {
  it('one task per line; bullets, numbering and blank lines are ignored', () => {
    const drafts = parseTasks('- Moodboard\n- Logo sketches #Personal\n\n3) Palette ~low', {
      now: NOW,
      knownProjects: KNOWN,
    });
    expect(drafts.map((d) => d.title)).toEqual(['Moodboard', 'Logo sketches', 'Palette']);
    expect(drafts[1]?.project).toBe('Personal');
    expect(drafts[2]?.energy).toBe('low');
  });

  it('passes the source through', () => {
    expect(parseTasks('Buy paper', { now: NOW, source: 'quick_capture' })[0]?.source).toBe(
      'quick_capture',
    );
  });
});
