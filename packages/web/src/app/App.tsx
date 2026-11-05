import { useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { Board } from '@/features/board/Board';
import { FilterBar } from '@/features/board/FilterBar';
import { ListView } from '@/features/board/ListView';
import { StageSheets } from '@/features/board/StageSheets';
import { useBoardKeys } from '@/features/board/useBoardKeys';
import { FocusMode } from '@/features/focus/FocusMode';
import { Header } from '@/features/header/Header';
import { PickForMe } from '@/features/pick/PickForMe';
import { Hero } from '@/features/hero/Hero';
import { useMilestones } from '@/features/momentum/useMomentum';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { QuickAdd } from '@/features/quick-capture/QuickAdd';
import { TaskDrawer } from '@/features/task-drawer/TaskDrawer';
import { setCelebrationPrefs } from '@/lib/celebrate';
import { attachCanvas } from '@/lib/confetti';
import { applyFilters, groupByStage } from '@/lib/format';
import { useSettings, useTasks } from '@/lib/queries';
import { useLiveUpdates } from '@/lib/sse';
import { useUi } from '@/lib/store';

/** Re-render once a minute so "overdue" and relative dates stay true. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ServerBanner() {
  const server = useUi((s) => s.server);
  if (server !== 'sleeping') return null;
  return (
    <div
      role="status"
      data-testid="server-status"
      data-state="sleeping"
      className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-charcoal px-5 py-3 text-sm text-white shadow-lift"
    >
      Lanes is sleeping. Run <code className="text-yellow">lanes start</code> to wake it.
    </div>
  );
}

export function App() {
  useLiveUpdates();
  const now = useNow();
  const { data: tasks = [], isPending } = useTasks();
  const { data: settings } = useSettings();
  const view = useUi((s) => s.view);
  const filters = useUi((s) => s.filters);
  const search = useUi((s) => s.search);
  const openDrawer = useUi((s) => s.openDrawer);

  // Notification clicks open http://localhost:4747/?task=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('task');
    if (id) {
      openDrawer(id);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [openDrawer]);

  const groups = useMemo(() => {
    const visible = applyFilters(tasks, filters, search, {
      now,
      dayStartHour: settings?.dayStartHour ?? 6,
      weekStartsOn: settings?.weekStartsOn ?? 6,
    });
    return groupByStage(visible);
  }, [tasks, filters, search, now, settings]);

  useBoardKeys(groups);
  useMilestones();
  useEffect(() => {
    if (settings) setCelebrationPrefs(settings);
  }, [settings]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex min-h-screen max-w-[var(--frame-max)] flex-col gap-7 px-7 pt-7 pb-12">
        <Header />
        <Hero />
        <main className="mt-6 flex flex-col gap-6">
          <FilterBar />
          {isPending ? (
            <p className="text-sm text-fg-2">Loading your lanes…</p>
          ) : view === 'board' ? (
            <Board groups={groups} now={now} />
          ) : (
            <ListView groups={groups} now={now} />
          )}
        </main>
      </div>

      <TaskDrawer />
      <StageSheets />
      <QuickAdd />
      <SettingsDialog />
      <PickForMe />
      <FocusMode />
      <canvas
        ref={attachCanvas}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[60] size-full"
      />
      <ServerBanner />
      <Toaster
        position="bottom-center"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              'flex items-center gap-4 rounded-full bg-charcoal px-5 py-3 text-sm text-white shadow-lift',
            actionButton: 'ml-auto font-semibold text-yellow',
          },
        }}
      />
    </MotionConfig>
  );
}
