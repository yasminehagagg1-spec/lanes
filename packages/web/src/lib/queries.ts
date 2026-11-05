import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  comboCount,
  type MoveInput,
  type Task,
  type TaskDraft,
  type TaskPatch,
  type TodayStats,
} from '@lanes/shared';
import { toast } from 'sonner';
import { api, ApiError } from './api';
import { celebrateCompletion } from './celebrate';
import { useUi } from './store';

export const keys = {
  tasks: (includeDone: 'today' | 'all') => ['tasks', { includeDone }] as const,
  allTasks: ['tasks'] as const,
  task: (id: string) => ['task', id] as const,
  stats: ['stats', 'today'] as const,
  projects: ['projects'] as const,
  upcoming: ['reminders', 'upcoming'] as const,
  rang: ['reminders', 'rang'] as const,
  reminders: ['reminders'] as const,
  settings: ['settings'] as const,
};

// ---------- cache helpers (shared with the SSE client) ----------

/** Replace or insert a task in every cached task list. */
export function upsertTask(qc: QueryClient, task: Task) {
  qc.setQueriesData<Task[]>({ queryKey: keys.allTasks }, (list) => {
    if (!list) return list;
    const i = list.findIndex((t) => t.id === task.id);
    if (i < 0) return [...list, task];
    const next = [...list];
    next[i] = task;
    return next;
  });
}

export function removeTask(qc: QueryClient, id: string) {
  qc.setQueriesData<Task[]>({ queryKey: keys.allTasks }, (list) =>
    list?.filter((t) => t.id !== id),
  );
}

export function setStats(qc: QueryClient, stats: TodayStats | undefined) {
  if (stats) qc.setQueryData(keys.stats, stats);
}

function errorToast(err: unknown, fallback: string) {
  toast(err instanceof ApiError ? err.message : fallback);
}

// ---------- queries ----------

export function useTasks() {
  const includeDone = useUi((s) => s.includeDone);
  return useQuery({ queryKey: keys.tasks(includeDone), queryFn: () => api.tasks(includeDone) });
}

export function useTaskDetail(id: string | null) {
  return useQuery({
    queryKey: keys.task(id ?? ''),
    queryFn: () => api.task(id ?? ''),
    enabled: !!id,
  });
}

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: api.stats });
export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: api.projects });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.settings });
export const useRang = () => useQuery({ queryKey: keys.rang, queryFn: api.rang });
export const useUpcoming = () =>
  useQuery({ queryKey: keys.upcoming, queryFn: api.upcoming, refetchInterval: 60_000 });

// ---------- mutations ----------

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: TaskDraft) => api.createTask(draft),
    onSuccess: ({ task, stats }) => {
      upsertTask(qc, task);
      setStats(qc, stats);
      void qc.invalidateQueries({ queryKey: keys.projects });
    },
    onError: (err) => errorToast(err, 'Couldn’t add that task.'),
  });
}

/** Where a card should land: stage plus the cards around it. */
export interface MoveRequest extends MoveInput {
  id: string;
}

/** Fractional position between two neighbours, mirroring the server. */
function optimisticPosition(list: Task[], req: MoveRequest): number {
  const pos = (id?: string) => list.find((t) => t.id === id)?.position;
  const after = pos(req.afterId);
  const before = pos(req.beforeId);
  if (after !== undefined && before !== undefined) return (after + before) / 2;
  if (after !== undefined) return after + 1;
  if (before !== undefined) return before - 1;
  const lane = list.filter((t) => t.stage === req.stage && t.id !== req.id);
  return lane.length ? Math.min(...lane.map((t) => t.position)) - 1 : 0;
}

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: MoveRequest) => api.moveTask(id, input),
    onMutate: async (req) => {
      await qc.cancelQueries({ queryKey: keys.allTasks });
      const snapshot = qc.getQueriesData<Task[]>({ queryKey: keys.allTasks });
      const prevStage = snapshot
        .flatMap(([, list]) => list ?? [])
        .find((t) => t.id === req.id)?.stage;
      const now = new Date().toISOString();
      qc.setQueriesData<Task[]>({ queryKey: keys.allTasks }, (list) =>
        list?.map((t) => {
          if (t.id !== req.id) return t;
          const changing = t.stage !== req.stage;
          return {
            ...t,
            stage: req.stage,
            position: optimisticPosition(list, req),
            pendingReason: req.stage === 'pending' ? (req.pendingReason ?? t.pendingReason) : null,
            completedAt: req.stage === 'done' ? (changing ? now : t.completedAt) : null,
          };
        }),
      );
      return { snapshot, prevStage };
    },
    onError: (err, _req, context) => {
      context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      errorToast(err, 'Couldn’t move that. It’s back where it was.');
    },
    onSuccess: ({ task, stats }, _req, context) => {
      upsertTask(qc, task);
      setStats(qc, stats);
      void qc.invalidateQueries({ queryKey: keys.task(task.id) });
      if (task.stage === 'done' && context?.prevStage !== 'done') {
        celebrateCompletion(task.id, currentCombo(qc));
      }
    },
  });
}

/** Finishes in a row right now, from every cached list. */
function currentCombo(qc: QueryClient): number {
  const stamps = new Set<string>();
  for (const [, list] of qc.getQueriesData<Task[]>({ queryKey: keys.allTasks })) {
    for (const t of list ?? []) if (t.stage === 'done' && t.completedAt) stamps.add(t.completedAt);
  }
  return comboCount([...stamps], new Date());
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => api.updateTask(id, patch),
    onSuccess: ({ task }) => {
      upsertTask(qc, task);
      void qc.invalidateQueries({ queryKey: keys.task(task.id) });
      void qc.invalidateQueries({ queryKey: keys.projects });
    },
    onError: (err) => errorToast(err, 'Couldn’t save that change.'),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: (_res, id) => {
      removeTask(qc, id);
      void qc.invalidateQueries({ queryKey: keys.stats });
      toast('Task deleted.', {
        action: {
          label: 'Undo',
          onClick: () => {
            void api.restoreTask(id).then(({ task, stats }) => {
              upsertTask(qc, task);
              setStats(qc, stats);
            });
          },
        },
      });
    },
    onError: (err) => errorToast(err, 'Couldn’t delete that task.'),
  });
}

/** For drawer sub-items (notes, subtasks, reminders): run, then refresh the task. */
export function useTaskItemMutation<TArgs>(
  taskId: string,
  fn: (args: TArgs) => Promise<unknown>,
  failure = 'Couldn’t save that.',
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      const stats = (result as { stats?: TodayStats } | undefined)?.stats;
      setStats(qc, stats);
      void qc.invalidateQueries({ queryKey: keys.task(taskId) });
      void qc.invalidateQueries({ queryKey: keys.allTasks });
      void qc.invalidateQueries({ queryKey: keys.reminders });
    },
    onError: (err) => errorToast(err, failure),
  });
}
