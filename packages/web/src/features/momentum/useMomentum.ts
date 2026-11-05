import { useEffect, useRef, useState } from 'react';
import { comboCount, dayKey } from '@lanes/shared';
import { celebrateLevel } from '@/lib/celebrate';
import { useSettings, useStats, useTasks } from '@/lib/queries';

/** Re-render on an interval. */
function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** Finishes in a row (within 10 minutes of each other). */
export function useCombo(): number {
  useTick(30_000);
  const { data: tasks = [] } = useTasks();
  return comboCount(
    tasks.filter((t) => t.stage === 'done' && t.completedAt).map((t) => t.completedAt as string),
    new Date(),
  );
}

export function useTodayKey(): string {
  useTick(60_000);
  const { data: settings } = useSettings();
  return dayKey(new Date(), settings?.dayStartHour ?? 6);
}

/** Fires tier effects when the momentum level goes up (never on first load or on undo). */
export function useMilestones() {
  const { data: stats } = useStats();
  const today = useTodayKey();
  const seen = useRef<{ day: string; level: number } | null>(null);

  useEffect(() => {
    if (!stats) return;
    const prev = seen.current;
    seen.current = { day: today, level: stats.level };
    if (prev && prev.day === today && stats.level > prev.level) celebrateLevel(stats.level);
  }, [stats, today]);
}
