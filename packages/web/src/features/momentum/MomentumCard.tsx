import { AnimatePresence, motion } from 'motion/react';
import type { TodayStats } from '@lanes/shared';
import { Scribble } from '@/components/Scribble';
import { formatPoints, tierLine } from './copy';
import { NumberTicker } from './NumberTicker';
import { useCombo, useTodayKey } from './useMomentum';

const FILL_SPRING = { type: 'spring', stiffness: 120, damping: 18 } as const;

function ComboChip({ combo }: { combo: number }) {
  return (
    <AnimatePresence>
      {combo >= 2 && (
        <motion.span
          key="combo"
          initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: -3 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          data-testid="combo"
          className="relative ml-auto self-center rounded-[14px] bg-yellow px-3 py-1.5 text-sm font-bold text-charcoal shadow-glass after:absolute after:-bottom-1.5 after:left-4 after:size-3 after:rotate-45 after:bg-yellow"
        >
          <span className="relative z-10">×{combo} combo</span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Glass card on the hero (docs/build-kit/06 §A1–A3). */
export function MomentumCard({ stats }: { stats: TodayStats | undefined }) {
  const today = useTodayKey();
  const combo = useCombo();
  const goal = stats?.goal ?? 5;
  const points = stats?.points ?? 0;
  const momentum = stats?.momentum ?? 0;
  const level = stats?.level ?? 0;
  const fill = Math.min(1, momentum);
  const overdrive = Math.min(1, Math.max(0, momentum - 1));

  return (
    <div
      data-testid="momentum"
      data-level={level}
      className="relative w-full max-w-[420px] rounded-lg bg-[var(--glass-bg)] px-7 pt-6 pb-6 shadow-glass backdrop-blur-[var(--glass-blur)]"
    >
      <div className="flex items-center justify-between text-sm text-on-royal-2">
        <span>Momentum today</span>
        <span>Goal {goal}</span>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <NumberTicker
          value={formatPoints(points)}
          className="type-display tabular text-[5.25rem] leading-none"
        />
        <span className="type-display mb-1 text-[2rem] leading-none text-on-royal-2">/{goal}</span>
        <span className="mb-1.5 ml-1 text-sm text-on-royal-2">points</span>
        <ComboChip combo={combo} />
      </div>

      <div className="relative mt-6">
        <div
          role="progressbar"
          aria-label="Momentum"
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={points}
          aria-valuetext={`${formatPoints(points)} of ${goal} points`}
          className="relative h-4 rounded-full bg-white/20"
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-yellow shadow-[inset_0_2px_0_rgba(255,255,255,.45)]"
            initial={false}
            animate={{ width: `${fill * 100}%` }}
            transition={FILL_SPRING}
          />
          {overdrive > 0 && (
            <motion.div
              data-testid="overdrive"
              className="lanes-shimmer absolute inset-y-[3px] left-0 rounded-full"
              initial={false}
              animate={{ width: `${overdrive * 100}%` }}
              transition={FILL_SPRING}
            />
          )}
          {[0.25, 0.5, 0.75].map((tick) => (
            <span
              key={tick}
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-royal/25"
              style={{ left: `${tick * 100}%` }}
            />
          ))}
          {level >= 1 && fill < 1 && (
            <motion.span
              className="absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2"
              initial={false}
              animate={{ left: `${fill * 100}%` }}
              transition={FILL_SPRING}
            >
              <Scribble name="sparkle" className="lanes-twinkle size-7 text-white" />
            </motion.span>
          )}
        </div>
        {level === 0 && (
          <Scribble
            name="arrow-swoop"
            className="absolute -top-9 left-3 h-8 w-14 -rotate-12 text-white/60 [&_path]:[stroke-dasharray:6_7]"
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={level}
            data-testid="tier-line"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="font-medium"
          >
            {tierLine(level, today)}
          </motion.span>
        </AnimatePresence>
        <span className="shrink-0 text-on-royal-2">
          {overdrive > 0
            ? `+${formatPoints(points - goal)} extra`
            : `${stats?.doneToday ?? 0} tasks · ${stats?.subtasksDoneToday ?? 0} subtasks`}
        </span>
      </div>
    </div>
  );
}
