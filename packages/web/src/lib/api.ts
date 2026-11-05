import type {
  Energy,
  FocusOutcome,
  FocusSession,
  MoveInput,
  Note,
  Project,
  ProjectColor,
  Reminder,
  ReminderPreset,
  Settings,
  Subtask,
  Task,
  TaskDetail,
  TaskDraft,
  TaskPatch,
  TodayStats,
} from '@lanes/shared';
import { useUi } from './store';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface BackupInfo {
  name: string;
  kind: 'daily' | 'manual' | 'before-import';
  size: number;
  createdAt: string;
}

export interface ImportResult {
  mode: 'replace' | 'merge';
  added: Record<
    'projects' | 'tasks' | 'subtasks' | 'notes' | 'reminders' | 'focusSessions',
    number
  >;
  skipped: number;
  backup: string;
}

export interface ClaudeStatus {
  desktop: boolean | null;
  code: boolean | null;
  skill: boolean;
  lastSeenAt: string | null;
  tokenPath: string;
}

/** Same-origin fetch; the server trusts the browser UI without a token. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    // Show the banner right away; the live connection clears it when Lanes is back.
    useUi.getState().setServer('sleeping');
    throw new ApiError(
      0,
      'OFFLINE',
      'Lanes is sleeping, so that wasn’t saved. Run lanes start to wake it.',
    );
  }
  const data: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string } } | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP',
      err?.message ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}

export interface WithStats {
  task: Task;
  stats: TodayStats;
}

export const api = {
  health: () => request<{ ok: boolean; tasks: number }>('GET', '/health'),

  tasks: (includeDone: 'today' | 'all') =>
    request<Task[]>('GET', `/tasks?includeDone=${includeDone}`),
  task: (id: string) => request<TaskDetail>('GET', `/tasks/${id}`),
  createTask: (draft: TaskDraft) => request<WithStats>('POST', '/tasks', draft),
  updateTask: (id: string, patch: TaskPatch) =>
    request<{ task: Task }>('PATCH', `/tasks/${id}`, patch),
  moveTask: (id: string, input: MoveInput) =>
    request<WithStats>('POST', `/tasks/${id}/move`, input),
  deleteTask: (id: string) => request<{ ok: true; undoToken: string }>('DELETE', `/tasks/${id}`),
  restoreTask: (id: string) => request<WithStats>('POST', `/tasks/${id}/restore`),

  addSubtask: (taskId: string, title: string) =>
    request<Subtask>('POST', `/tasks/${taskId}/subtasks`, { title }),
  updateSubtask: (id: string, patch: { title?: string; done?: boolean }) =>
    request<{ subtask: Subtask; stats: TodayStats }>('PATCH', `/subtasks/${id}`, patch),
  deleteSubtask: (id: string) => request<{ ok: true }>('DELETE', `/subtasks/${id}`),

  addNote: (taskId: string, body: string) =>
    request<Note>('POST', `/tasks/${taskId}/notes`, { body }),
  updateNote: (id: string, body: string) => request<Note>('PATCH', `/notes/${id}`, { body }),
  deleteNote: (id: string) => request<{ ok: true }>('DELETE', `/notes/${id}`),

  addReminder: (
    taskId: string,
    input: { fireAt: string; message?: string } | { preset: ReminderPreset },
  ) => request<Reminder>('POST', `/tasks/${taskId}/reminders`, input),
  deleteReminder: (id: string) => request<{ ok: true }>('DELETE', `/reminders/${id}`),
  snoozeReminder: (id: string, minutes: number) =>
    request<Reminder>('POST', `/reminders/${id}/snooze`, { minutes }),
  dismissReminder: (id: string) => request<Reminder>('POST', `/reminders/${id}/dismiss`),
  rang: () => request<(Reminder & { taskTitle: string })[]>('GET', '/reminders/rang'),
  upcoming: () =>
    request<(Reminder & { taskTitle: string })[]>('GET', '/reminders/upcoming?within=24h'),

  startFocus: (taskId: string, plannedMin: number) =>
    request<{ session: FocusSession; task: Task }>('POST', '/focus', { taskId, plannedMin }),
  endFocus: (id: string, outcome: FocusOutcome, note?: string) =>
    request<{ session: FocusSession; task: Task; stats: TodayStats }>('POST', `/focus/${id}/end`, {
      outcome,
      ...(note ? { note } : {}),
    }),
  pick: (q: { energy?: Energy; minutes?: number; exclude?: string[] }) => {
    const params = new URLSearchParams();
    if (q.energy) params.set('energy', q.energy);
    if (q.minutes) params.set('minutes', String(q.minutes));
    if (q.exclude?.length) params.set('exclude', q.exclude.join(','));
    return request<{ task: Task | null; reason?: string }>('GET', `/tasks/pick?${params}`);
  },

  projects: () => request<Project[]>('GET', '/projects'),
  stats: () => request<TodayStats>('GET', '/stats/today'),
  settings: () => request<Settings>('GET', '/settings'),
  updateSettings: (patch: Partial<Settings>) => request<Settings>('PATCH', '/settings', patch),
  history: (days: number) =>
    request<{ date: string; done: number }[]>('GET', `/stats/history?days=${days}`),
  backups: () => request<{ dataDir: string; backups: BackupInfo[] }>('GET', '/data/backups'),
  backupNow: () => request<BackupInfo>('POST', '/data/backup'),
  importData: (mode: 'replace' | 'merge', data: unknown) =>
    request<ImportResult>('POST', '/data/import', { mode, data }),
  openDataFolder: () => request<{ dataDir: string }>('POST', '/data/open-folder'),
  claudeStatus: () => request<ClaudeStatus>('GET', '/claude/status'),
  updateProject: (id: string, patch: { name?: string; color?: ProjectColor; archived?: boolean }) =>
    request<Project>('PATCH', `/projects/${id}`, patch),
};
