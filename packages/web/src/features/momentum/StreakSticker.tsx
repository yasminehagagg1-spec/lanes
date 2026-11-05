import { useId } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { currentStreakDetail } from '@lanes/shared';
import { cn } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useStats } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { useTodayKey } from './useMomentum';

function Sticker({ days }: { days: number }) {
  const id = useId();
  const spins = useUi((s) => s.stickerSpins);
  const text = 'KEEP THE STREAK • KEEP THE STREAK • ';
  return (
    <div className="relative size-[148px] rounded-full bg-yellow text-charcoal shadow-glass">
      {/* Extra fast turn at the 50% milestone, on top of the slow 18s spin. */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: spins * 360 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <svg
          viewBox="0 0 148 148"
          className="lanes-spin absolute inset-0 size-full"
          aria-hidden="true"
        >
          <defs>
            <path id={id} d="M74,74 m-56,0 a56,56 0 1,1 112,0 a56,56 0 1,1 -112,0" />
          </defs>
          <text className="fill-charcoal text-[13.5px] font-bold tracking-[0.14em]">
            <textPath href={`#${id}`} textLength="350">
              {text}
            </textPath>
          </text>
        </svg>
      </motion.div>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="type-display tabular text-[2.5rem] leading-none">{days}</span>
        <span className="text-xs font-semibold">{days === 1 ? 'day' : 'days'}</span>
      </div>
    </div>
  );
}

function Heatmap() {
  const today = useTodayKey();
  const { data: stats } = useStats();
  const { data: history = [], isPending } = useQuery({
    queryKey: ['stats', 'history', 30],
    queryFn: () => api.history(30),
    staleTime: 0,
  });
  const doneDays = new Set(history.filter((d) => d.done > 0).map((d) => d.date));
  const grace = new Set(currentStreakDetail(doneDays, today).graceDays);
  const total = history.reduce((n, d) => n + d.done, 0);
  const fmt = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="type-display text-[2rem] leading-none">{stats?.streakDays ?? 0} days</div>
          <div className="mt-1 text-sm text-fg-2">current streak</div>
        </div>
        <div className="text-right text-sm text-fg-2">
          Best {stats?.bestStreak ?? 0}
          <br />
          {total} done in 30 days
        </div>
      </div>
      <ol
        aria-label="Last 30 days"
        className="m-0 grid list-none grid-cols-10 gap-2 p-0"
        data-testid="heatmap"
      >
        {(isPending ? [] : history).map((d) => (
          <li
            key={d.date}
            title={`${fmt(d.date)} · ${d.done} done${grace.has(d.date) ? ' · grace day' : ''}`}
            aria-label={`${fmt(d.date)}: ${d.done} done${grace.has(d.date) ? ', grace day' : ''}`}
            className={cn(
              'size-[18px] rounded-full',
              d.done >= 3
                ? 'bg-royal'
                : d.done > 0
                  ? 'bg-yellow'
                  : grace.has(d.date)
                    ? 'border-2 border-yellow'
                    : 'bg-lane',
              d.date === today && 'ring-2 ring-charcoal ring-offset-2 ring-offset-surface',
            )}
          />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-yellow" /> 1–2 done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-royal" /> 3+
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-yellow" /> grace day
        </span>
      </div>
      <p className="m-0 text-xs text-fg-3">One missed day a week is forgiven. Off days happen.</p>
    </div>
  );
}

/** The rotating streak badge; click for the 30-day history. */
export function StreakSticker() {
  const { data: stats } = useStats();
  const days = stats?.streakDays ?? 0;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${days}-day streak. Show the last 30 days`}
          className="rounded-full outline-none transition hover:scale-[1.03] focus-visible:ring-4 focus-visible:ring-white/70"
        >
          <Sticker days={days} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={10}
          className="lanes-pop z-50 w-[340px] rounded-lg bg-surface p-6 shadow-lift outline-none"
        >
          <Heatmap />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
