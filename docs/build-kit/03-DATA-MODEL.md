# Data Model

SQLite, one file. All ids are ULIDs (sortable, generated in the app). All timestamps are ISO-8601 strings in UTC; the UI renders in the device timezone (Africa/Cairo). "Today" is computed in local time using the `day_start_hour` setting (default 6).

## 1. Schema (migration `001_init.sql`)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color       TEXT NOT NULL,             -- one of the project palette tokens, e.g. 'p-blue'
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description   TEXT NOT NULL DEFAULT '',
  stage         TEXT NOT NULL DEFAULT 'new'
                CHECK (stage IN ('new','in_process','pending','done','postponed')),
  position      REAL NOT NULL,             -- order within a lane (fractional indexing)
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  priority      TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low','normal','high','urgent')),
  energy        TEXT CHECK (energy IN ('low','medium','high')),
  due_at        TEXT,                      -- date-time, or date at 23:59 local if no time given
  due_has_time  INTEGER NOT NULL DEFAULT 0,
  estimate_min  INTEGER CHECK (estimate_min > 0),
  resume_on     TEXT,                      -- local date (YYYY-MM-DD) for postponed tasks
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','quick_capture','claude')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  started_at    TEXT,                      -- first time moved to in_process
  completed_at  TEXT,                      -- set when entering done, cleared when leaving
  deleted_at    TEXT                       -- soft delete (undo window), purge after 30 days
);
CREATE INDEX idx_tasks_stage ON tasks(stage, position) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_completed ON tasks(completed_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due ON tasks(due_at) WHERE deleted_at IS NULL;

CREATE TABLE subtasks (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  position   REAL NOT NULL,
  done_at    TEXT
);

CREATE TABLE notes (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'note'
              CHECK (type IN ('note','pending_reason','stage_change','focus_log','claude')),
  stage       TEXT NOT NULL,               -- stage of the task at the moment the note was written
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_notes_task ON notes(task_id, created_at DESC);

CREATE TABLE reminders (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  fire_at     TEXT NOT NULL,
  message     TEXT,
  fired_at    TEXT,
  dismissed   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_reminders_due ON reminders(fire_at) WHERE fired_at IS NULL AND dismissed = 0;

CREATE TABLE focus_sessions (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  planned_min  INTEGER NOT NULL,
  actual_min   INTEGER,
  outcome      TEXT CHECK (outcome IN ('completed_task','stopped','extended'))
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL                     -- JSON-encoded
);
-- defaults inserted by migration:
-- display_name="Yasmine", daily_goal=5, day_start_hour=6, sounds=true,
-- celebration="full", theme="light", week_starts_on=6 (Saturday)
```

## 2. TypeScript (in `packages/shared/src/schemas.ts`, zod-first)

```ts
export const STAGES = ['new','in_process','pending','done','postponed'] as const;
export type Stage = typeof STAGES[number];
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type Energy = 'low' | 'medium' | 'high';
export type TaskSource = 'manual' | 'quick_capture' | 'claude';

export interface Task {
  id: string;
  title: string;
  description: string;
  stage: Stage;
  position: number;
  project: { id: string; name: string; color: string } | null;
  priority: Priority;
  energy: Energy | null;
  dueAt: string | null;
  dueHasTime: boolean;
  estimateMin: number | null;
  resumeOn: string | null;
  source: TaskSource;
  pendingReason: string | null;   // derived: latest pending_reason note while stage === 'pending'
  subtasks: Subtask[];
  counts: { notes: number; reminders: number };
  nextReminderAt: string | null;
  createdAt: string; updatedAt: string;
  startedAt: string | null; completedAt: string | null;
}

export interface TaskDraft {        // input for create (UI, quick capture, MCP)
  title: string;
  description?: string;
  stage?: Stage;                    // default 'new'
  project?: string;                 // name; created if missing
  priority?: Priority;
  energy?: Energy;
  dueAt?: string; dueHasTime?: boolean;
  estimateMin?: number;
  subtasks?: string[];
  notes?: string[];
  reminders?: { fireAt: string; message?: string }[];
  pendingReason?: string;           // required if stage === 'pending'
  resumeOn?: string;
  source?: TaskSource;
}
```

## 3. Stage rules (`packages/shared/src/stages.ts`)

```ts
export const STAGE_META = {
  new:        { en: 'New',        ar: 'جديد',       token: '--stage-new' },
  in_process: { en: 'In process', ar: 'قيد التنفيذ', token: '--stage-progress' },
  pending:    { en: 'Pending',    ar: 'معلّق',       token: '--stage-pending' },
  done:       { en: 'Done',       ar: 'تم',         token: '--stage-done' },
  postponed:  { en: 'Postponed',  ar: 'مؤجّل',      token: '--stage-postponed' },
};
```

`moveTask(task, toStage, opts)` — single server-side function, used by every route and the MCP tools:

1. Any stage → any stage is allowed. Same-stage move = reorder only.
2. `→ pending` requires `opts.pendingReason` (non-empty, trimmed). Insert a `pending_reason` note. Error code `PENDING_REASON_REQUIRED` otherwise.
3. `→ in_process` sets `started_at` if null.
4. `→ done` sets `completed_at = now`; also checks all open subtasks? **No** — leaving subtasks open is fine, just show "3/5" on the done card.
5. `done →` anything clears `completed_at`.
6. `→ postponed` stores `opts.resumeOn` if given.
7. Leaving `postponed` clears `resume_on`.
8. Always insert a `stage_change` note: `"Moved from In process to Done"` and emit `task.updated`.
9. All in one transaction. Return the updated task **and** fresh `TodayStats` so the UI can animate.

## 4. Derived stats (`packages/shared/src/progress.ts`, pure)

```ts
export interface TodayStats {
  doneToday: number;          // tasks with completed_at inside today's window
  plannedToday: number;       // doneToday + open tasks that are due today/overdue OR in_process
  goal: number;               // settings.daily_goal
  momentum: number;           // 0..1, see 06 §A1
  level: 0 | 1 | 2 | 3 | 4;   // milestone tier reached today
  streakDays: number;         // consecutive days (ending today or yesterday) with ≥1 done
  bestStreak: number;
  subtasksDoneToday: number;
  focusMinutesToday: number;
}
```

## 5. Fractional positions

New cards go to the top of a lane: `position = min(position in lane) - 1`. Moving between two cards: midpoint of neighbors. If the gap gets below `1e-6`, renormalize the lane (1, 2, 3, …) in one transaction.

## 6. Export format

`GET /api/data/export` → `lanes-export-YYYY-MM-DD.json`:

```json
{ "app": "lanes", "version": 1, "exportedAt": "…",
  "projects": [], "tasks": [], "subtasks": [], "notes": [],
  "reminders": [], "focusSessions": [], "settings": {} }
```

Import validates with zod, runs in one transaction, and offers **Replace all** or **Merge (skip existing ids)**. A backup is taken automatically before any import.
