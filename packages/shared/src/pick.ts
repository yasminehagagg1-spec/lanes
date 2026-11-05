// "Pick for me": score open tasks and deal the best one, with a one-line reason.
import type { Energy, Priority } from './schemas.js';
import type { Stage } from './stages.js';

export interface PickCandidate {
  id: string;
  stage: Stage;
  priority: Priority;
  energy: Energy | null;
  dueAt: string | null;
  estimateMin: number | null;
}

export interface PickOptions {
  energy?: Energy;
  minutes?: number;
  now: Date;
  /** End of the lived day (see dayWindow). */
  todayEnd: Date;
  random?: () => number;
}

const ENERGY_RANK: Record<Energy, number> = { low: 1, medium: 2, high: 3 };
const PRIORITY_SCORE: Record<Priority, number> = { urgent: 4, high: 2, normal: 1, low: 0 };

export interface PickScore {
  score: number;
  reasons: string[];
}

export function scoreCandidate(task: PickCandidate, opts: PickOptions): PickScore {
  const reasons: string[] = [];
  let score = 0;

  if (task.dueAt) {
    const due = Date.parse(task.dueAt);
    const twoDays = opts.todayEnd.getTime() + 2 * 86_400_000;
    if (due < opts.now.getTime()) {
      score += 5;
      reasons.push('It’s overdue');
    } else if (due < opts.todayEnd.getTime()) {
      score += 4;
      reasons.push('Due today');
    } else if (due < twoDays) {
      score += 2;
      reasons.push('Due soon');
    }
  }

  score += PRIORITY_SCORE[task.priority];
  if (task.priority === 'urgent') reasons.push('marked urgent');

  if (opts.energy) {
    if (!task.energy) {
      score += 1;
    } else if (task.energy === opts.energy) {
      score += 3;
      reasons.push(`fits ${opts.energy} energy`);
    } else if (ENERGY_RANK[task.energy] < ENERGY_RANK[opts.energy]) {
      score += 2;
      reasons.push('light enough for now');
    } else {
      score -= 3;
    }
  }

  if (opts.minutes) {
    if (task.estimateMin == null) {
      // unknown size: neutral
    } else if (task.estimateMin <= opts.minutes) {
      score += 2;
      reasons.push(`fits in ${opts.minutes} min`);
    } else {
      score -= 2;
    }
  }

  if (task.stage === 'in_process') {
    score += 1.5;
    reasons.push('you already started it');
  }

  score += (opts.random ?? Math.random)() * 0.75;
  return { score, reasons };
}

export function reasonLine(reasons: string[]): string {
  const [first, second] = reasons;
  if (!first) return 'A good one to start with.';
  const head = first.charAt(0).toUpperCase() + first.slice(1);
  return second ? `${head}, and ${second}.` : `${head}.`;
}

/** Best open task (new / in process), or null. */
export function pickTask<T extends PickCandidate>(
  candidates: readonly T[],
  opts: PickOptions,
  exclude: ReadonlySet<string> = new Set(),
): { task: T; reason: string } | null {
  let best: { task: T; score: PickScore } | null = null;
  for (const task of candidates) {
    if (task.stage !== 'new' && task.stage !== 'in_process') continue;
    if (exclude.has(task.id)) continue;
    const score = scoreCandidate(task, opts);
    if (!best || score.score > best.score.score) best = { task, score };
  }
  return best ? { task: best.task, reason: reasonLine(best.score.reasons) } : null;
}

/** The best `n` open tasks, for "Okay, you pick — here are your top 3". */
export function rankTasks<T extends PickCandidate>(
  candidates: readonly T[],
  opts: PickOptions,
  n = 3,
): { task: T; reason: string }[] {
  return candidates
    .filter((t) => t.stage === 'new' || t.stage === 'in_process')
    .map((task) => ({ task, score: scoreCandidate(task, opts) }))
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, n)
    .map(({ task, score }) => ({ task, reason: reasonLine(score.reasons) }));
}

/**
 * Low energy and nothing light on the board: suggest one open step instead.
 * Takes the first unfinished step of the best-scoring task that has steps,
 * preferring the shortest step text as the "smallest".
 */
export function smallestStep<
  T extends PickCandidate & { subtasks: { id: string; title: string; done: boolean }[] },
>(
  candidates: readonly T[],
  opts: PickOptions,
): { task: T; step: { id: string; title: string } } | null {
  const withSteps = rankTasks(
    candidates.filter((t) => t.subtasks.some((s) => !s.done)),
    { ...opts, random: () => 0 },
    candidates.length,
  );
  const best = withSteps[0]?.task;
  if (!best) return null;
  const open = best.subtasks.filter((s) => !s.done).sort((a, b) => a.title.length - b.title.length);
  const step = open[0];
  return step ? { task: best, step: { id: step.id, title: step.title } } : null;
}

/** True when nothing open is light enough for low energy. */
export function nothingLight(candidates: readonly PickCandidate[]): boolean {
  return !candidates.some(
    (t) => (t.stage === 'new' || t.stage === 'in_process') && t.energy === 'low',
  );
}
