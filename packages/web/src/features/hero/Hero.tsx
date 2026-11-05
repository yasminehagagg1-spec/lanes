import { useMemo } from 'react';
import { Timer, WalletCards } from 'lucide-react';
import type { Task } from '@lanes/shared';
import { BilingualTitle } from '@/components/BilingualTitle';
import { Scribble } from '@/components/Scribble';
import { Button, Kbd } from '@/components/ui/primitives';
import { MomentumCard } from '@/features/momentum/MomentumCard';
import { StreakSticker } from '@/features/momentum/StreakSticker';
import { useFocusFor } from '@/features/board/useFocusFor';
import { countWord, groupByStage, timeLabel } from '@/lib/format';
import { useUi } from '@/lib/store';
import { useSettings, useStats, useTasks } from '@/lib/queries';

/** "Three down, “Client call” at 3:00 pm." */
function summary(done: number, tasks: Task[], now: Date): string {
  const head = done === 0 ? 'A fresh page' : `${countWord(done)} down`;
  const next = tasks
    .filter((t) => t.stage !== 'done' && t.dueHasTime && t.dueAt && new Date(t.dueAt) > now)
    .filter((t) => new Date(t.dueAt ?? 0).toDateString() === now.toDateString())
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))[0];
  if (!next?.dueAt) return `${head}.`;
  const title = next.title.length > 34 ? `${next.title.slice(0, 33)}…` : next.title;
  return `${head}, “${title}” at ${timeLabel(new Date(next.dueAt))}.`;
}

/** Tier 4: the hero swaps to DONE FOR TODAY, with a red hand-drawn circle around DONE. */
function DoneForToday() {
  return (
    <h1 className="type-display relative m-0 text-[length:calc(var(--fs-mega)*0.52)]">
      <span className="relative inline-block">
        Done
        <Scribble
          name="circle-scribble"
          stretch
          draw
          className="absolute -top-[0.2em] -right-[0.3em] -bottom-[0.22em] -left-[0.12em] text-scribble [&_path]:[stroke-width:5px]"
        />
      </span>
      <br />
      <span className="relative inline-block">
        For today
        <span
          lang="ar"
          dir="rtl"
          className="pointer-events-none absolute -top-[0.62em] right-[-0.42em] -rotate-[4deg] text-[0.46em] leading-none font-extrabold tracking-normal text-yellow normal-case"
        >
          خلصتي
        </span>
      </span>
    </h1>
  );
}

export function Hero() {
  const { data: stats } = useStats();
  const { data: settings } = useSettings();
  const { data: tasks = [] } = useTasks();

  const now = new Date();
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = now.toLocaleDateString('en-GB', { month: 'long' });
  const level = stats?.level ?? 0;
  const openPick = useUi((s) => s.openPick);
  const focusFor = useFocusFor();
  const line = useMemo(() => summary(stats?.doneToday ?? 0, tasks, new Date()), [stats, tasks]);

  return (
    <section
      aria-label="Today"
      className="bg-royal-grid relative rounded-xl px-12 pt-8 pb-10 text-on-royal"
    >
      <div className="flex flex-wrap items-start justify-between gap-10">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <div className="type-display flex size-[76px] items-center justify-center rounded-full border-[1.5px] border-on-royal-2 text-[1.75rem] leading-none">
              {now.getDate()}
            </div>
            <div className="leading-snug font-medium">
              {weekday},
              <br />
              <span className="text-on-royal-2">{month}</span>
            </div>
          </div>

          <div className="relative mt-6 inline-block" data-testid="hero-title">
            {level === 4 ? <DoneForToday /> : <BilingualTitle en="Today" ar="اليوم" />}
            {level < 4 && (
              <Scribble
                name="arrow-loop"
                className="absolute -right-[6.5rem] bottom-0 h-[5.5rem] w-[7.5rem] text-yellow"
              />
            )}
            {level === 3 && (
              <Scribble
                name="underline-scribble"
                draw
                className="absolute -bottom-6 left-0 h-7 w-[88%] text-yellow"
              />
            )}
          </div>

          <p className="mt-6 mb-0 max-w-[31rem] text-[1.0625rem] leading-relaxed">
            <strong className="font-semibold">Hey {settings?.displayName ?? 'Yasmine'}.</strong>{' '}
            <span className="text-on-royal-2">
              {line} Pick one thing and give it your whole attention.
            </span>
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="yellow" size="lg" onClick={() => openPick(true)}>
              <WalletCards className="size-5" aria-hidden="true" />
              Pick for me
              <Kbd className="bg-charcoal/10">P</Kbd>
            </Button>
            <Button
              variant="outline-on-royal"
              size="lg"
              onClick={() => focusFor(groupByStage(tasks))}
            >
              <Timer className="size-5" aria-hidden="true" />
              Focus
              <Kbd className="bg-white/15">F</Kbd>
            </Button>
          </div>
        </div>

        <div className="mt-[4.25rem] flex w-full max-w-[420px] justify-end">
          <MomentumCard stats={stats} />
        </div>
      </div>

      <div className="absolute right-[27%] -bottom-[60px] z-10 max-lg:hidden">
        <StreakSticker />
      </div>
    </section>
  );
}
