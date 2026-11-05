import type { MomentumLevel } from '@lanes/shared';

// Tier lines (docs/build-kit/06 §A2). Short, calm, no hype, no guilt. One line is chosen per day and tier,
// so it doesn't flicker on every update but doesn't go stale across days either.
export const TIER_POOL: Record<MomentumLevel, string[]> = {
  0: [
    'Start anywhere.',
    'One small thing counts.',
    'Pick the easiest one. That’s allowed.',
    'The first one is the heaviest.',
  ],
  1: [
    'Moving. Keep it light.',
    'You started. That was the hard part.',
    'Warm now. Keep the pace easy.',
    'One down shifts the whole day.',
  ],
  2: [
    'Halfway. That’s real.',
    'Half the goal, all the momentum.',
    'Middle of the day, middle of the bar.',
    'You’re in it now.',
  ],
  3: [
    'Almost there. One more push.',
    'Close enough to see it.',
    'The last stretch is the short one.',
    'One or two more, then rest.',
  ],
  4: [
    'Goal hit. Anything now is extra.',
    'That’s the day. Let it count.',
    'Done for today. The rest is a bonus.',
    'Everything after this is overtime.',
  ],
};

/** Arabic for the hero and tier headline (first line of each tier). */
export const TIER_AR: Record<MomentumLevel, string> = {
  0: 'ابدئي من أي مكان',
  1: 'اتحركتي',
  2: 'نص الطريق',
  3: 'قربتي جداً',
  4: 'خلصتي هدف النهارده',
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function tierLine(level: MomentumLevel, dayKey: string): string {
  const pool = TIER_POOL[level];
  return pool[hash(`${dayKey}:${level}`) % pool.length] ?? pool[0] ?? '';
}

/** 3 → "3", 3.5 → "3.5", 3.25 → "3.25" */
export const formatPoints = (points: number) =>
  Number.isInteger(points) ? String(points) : String(Math.round(points * 100) / 100);
