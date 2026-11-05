-- Lanes initial schema (docs/03-DATA-MODEL.md §1).
-- PRAGMAs (WAL, foreign keys) are set on every connection in connection.ts,
-- because journal_mode can't change inside the migration transaction.

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color       TEXT NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description   TEXT NOT NULL DEFAULT '',
  stage         TEXT NOT NULL DEFAULT 'new'
                CHECK (stage IN ('new','in_process','pending','done','postponed')),
  position      REAL NOT NULL,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  priority      TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low','normal','high','urgent')),
  energy        TEXT CHECK (energy IN ('low','medium','high')),
  due_at        TEXT,
  due_has_time  INTEGER NOT NULL DEFAULT 0,
  estimate_min  INTEGER CHECK (estimate_min > 0),
  resume_on     TEXT,
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','quick_capture','claude')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  started_at    TEXT,
  completed_at  TEXT,
  deleted_at    TEXT
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
CREATE INDEX idx_subtasks_task ON subtasks(task_id, position);

CREATE TABLE notes (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'note'
              CHECK (type IN ('note','pending_reason','stage_change','focus_log','claude')),
  stage       TEXT NOT NULL,
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
CREATE INDEX idx_focus_task ON focus_sessions(task_id);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL  -- JSON-encoded
);

INSERT INTO settings (key, value) VALUES
  ('display_name',   '"Yasmine"'),
  ('daily_goal',     '5'),
  ('day_start_hour', '6'),
  ('sounds',         'true'),
  ('celebration',    '"full"'),
  ('theme',          '"light"'),
  ('week_starts_on', '6');
