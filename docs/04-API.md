# Local API

Base: `http://127.0.0.1:4747/api` · JSON in/out · camelCase fields.
Browser UI on the same origin needs no token. Every other client sends `Authorization: Bearer <token>` (token in `~/Library/Application Support/Lanes/token`).

Errors: `{ "error": { "code": "PENDING_REASON_REQUIRED", "message": "…" } }` with a sensible HTTP status (400 validation, 404 not found, 401 token, 409 conflict).

## Tasks

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/tasks` | `?stage=&project=&priority=&energy=&due=today\|week\|overdue&source=&q=&includeDone=today\|all` | `Task[]` |
| GET | `/tasks/:id` | — | `Task` + `notes[]` + `reminders[]` + `focusSessions[]` |
| POST | `/tasks` | `TaskDraft` | `{ task, stats }` (201) |
| PATCH | `/tasks/:id` | partial fields (not `stage`) | `{ task }` |
| POST | `/tasks/:id/move` | `{ stage, pendingReason?, resumeOn?, beforeId?, afterId? }` | `{ task, stats }` |
| DELETE | `/tasks/:id` | — | soft delete, `{ ok, undoToken }` |
| POST | `/tasks/:id/restore` | — | `{ task }` |
| POST | `/tasks/parse` | `{ text }` | `TaskDraft` (preview; nothing saved) — used by quick capture and MCP |
| GET | `/tasks/pick` | `?energy=low\|medium\|high&minutes=` | `{ task, reason }` or `{ task: null }` — "Pick for me" |

## Subtasks

| POST | `/tasks/:id/subtasks` | `{ title }` |
| PATCH | `/subtasks/:id` | `{ title?, done?, position? }` → returns `{ subtask, stats }` (done counts as micro-win) |
| DELETE | `/subtasks/:id` | |

## Notes

| GET | `/tasks/:id/notes` | | `Note[]` newest first |
| POST | `/tasks/:id/notes` | `{ body, type?: 'note'\|'claude' }` | `Note` (stage captured server-side) |
| PATCH | `/notes/:id` | `{ body }` (only `note`/`claude` types editable) |
| DELETE | `/notes/:id` | (only `note`/`claude` types) |

## Reminders

| GET | `/reminders/upcoming` | `?within=24h` | `(Reminder & { taskTitle })[]` |
| POST | `/tasks/:id/reminders` | `{ fireAt, message? }` or `{ preset: 'in_1h'\|'tonight'\|'tomorrow_morning'\|'next_monday' }` |
| POST | `/reminders/:id/snooze` | `{ minutes }` | creates a new reminder, dismisses old |
| DELETE | `/reminders/:id` | |

## Projects

| GET | `/projects` | | with open task counts |
| POST | `/projects` | `{ name, color? }` |
| PATCH | `/projects/:id` | `{ name?, color?, archived? }` |

## Stats & focus

| GET | `/stats/today` | | `TodayStats` |
| GET | `/stats/history` | `?days=30` | `{ date, done }[]` (heatmap) |
| POST | `/focus` | `{ taskId, plannedMin }` | session |
| POST | `/focus/:id/end` | `{ outcome }` | session + auto `focus_log` note + stats |

## Settings & data

| GET/PATCH | `/settings` | |
| GET | `/data/export` | | JSON file download |
| POST | `/data/import` | `{ mode: 'replace'\|'merge', data }` |
| GET | `/health` | | `{ ok, version, dataDir, tasks }` (no token needed) |

## Events (SSE)

`GET /api/events` → `text/event-stream`

```
event: task.created   data: { task, stats }
event: task.updated   data: { task, stats? }
event: task.deleted   data: { id }
event: note.created   data: { note }
event: reminder.fired data: { reminder, task }
event: stats.updated  data: { stats }
: heartbeat (every 20s)
```
