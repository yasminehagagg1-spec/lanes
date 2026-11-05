import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Note, Reminder, Task, TodayStats } from '@lanes/shared';
import { showReminder } from '@/features/reminders/ReminderToasts';
import { keys, removeTask, setStats, upsertTask } from './queries';
import { useUi } from './store';

/**
 * Live updates: the server pushes changes (from Claude, another tab, the scheduler) over SSE.
 * EventSource reconnects by itself; after a reconnect we refetch everything (cheap — it's local).
 */
export function useLiveUpdates() {
  const qc = useQueryClient();
  const setServer = useUi((s) => s.setServer);

  useEffect(() => {
    const source = new EventSource('/api/events');
    let lostAt: number | null = null;
    let sleepTimer: ReturnType<typeof setTimeout> | undefined;

    const parse = <T>(e: MessageEvent<string>) => JSON.parse(e.data) as T;
    const onTask = (e: MessageEvent<string>) => {
      const { task, stats } = parse<{ task: Task; stats?: TodayStats }>(e);
      upsertTask(qc, task);
      setStats(qc, stats);
      void qc.invalidateQueries({ queryKey: keys.task(task.id) });
      // The server decides which lists a task belongs in (e.g. "done today").
      void qc.invalidateQueries({ queryKey: keys.allTasks });
    };

    source.addEventListener('task.created', onTask);
    source.addEventListener('task.updated', onTask);
    source.addEventListener('task.deleted', (e) => removeTask(qc, parse<{ id: string }>(e).id));
    source.addEventListener('note.created', (e) => {
      void qc.invalidateQueries({ queryKey: keys.task(parse<{ note: Note }>(e).note.taskId) });
    });
    source.addEventListener('stats.updated', (e) =>
      setStats(qc, parse<{ stats: TodayStats }>(e).stats),
    );
    // An import may have changed anything.
    source.addEventListener('data.imported', () => void qc.invalidateQueries());
    source.addEventListener('reminder.fired', (e) => {
      showReminder(parse<{ reminder: Reminder; task: Task }>(e));
      void qc.invalidateQueries({ queryKey: keys.reminders });
    });

    source.onopen = () => {
      clearTimeout(sleepTimer);
      if (lostAt !== null) void qc.invalidateQueries();
      lostAt = null;
      setServer('live');
    };
    source.onerror = () => {
      if (lostAt === null) {
        lostAt = Date.now();
        // Brief blips (dev reloads) shouldn't flash the banner.
        sleepTimer = setTimeout(() => setServer('sleeping'), 2500);
      }
    };

    return () => {
      clearTimeout(sleepTimer);
      source.close();
    };
  }, [qc, setServer]);
}
