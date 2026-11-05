# Lanes · مسارات — Product Requirements

> A personal, local-only task manager built for a brain with a lot going on.
> Not just where tasks live, but how they move.

**Owner / only user:** Yasmine Hagag (designer + front-end dev, works across many clients at once)
**Platform:** macOS (Apple Silicon), runs locally at `http://localhost:4747`
**Status:** v1 spec, ready to build

---

## 1. Why this exists

Tasks are coming from too many directions (clients, freelance, personal). Existing tools either need an account, feel like spreadsheets, or give zero reward for finishing things. Lanes is:

1. **Local.** No login, no cloud, no account. Data lives on this Mac and survives closing the tab, the browser, or restarting.
2. **Honest about state.** A task isn't just "todo / done". It can be waiting on someone, or deliberately pushed.
3. **Rewarding.** Every finished task should *feel* like something. Progress is visible all day.
4. **Reachable by Claude.** Typing `/task …` in Claude adds a fully detailed task to the board.

## 2. Non-goals (v1)

- No multi-user, sharing, sync between devices, or cloud backup.
- No calendar integrations (Google Calendar etc.) — maybe later.
- No mobile app. (The page should still be usable at narrow widths.)
- No "strategic marketing / automations" features yet — that's a later phase.

---

## 3. Core concepts

### 3.1 Stages (the lanes)

| # | Stage | Key | Meaning | Required when entering |
|---|---|---|---|---|
| 1 | New | `new` | Captured, not started | — |
| 2 | In process | `in_process` | Actively being worked on | — |
| 3 | Pending | `pending` | Blocked / waiting on something | **A pending reason (note) is required** |
| 4 | Done | `done` | Finished | — (triggers celebration) |
| 5 | Postponed | `postponed` | Deliberately pushed to later | Optional "back on" date |

- The main flow is `new → in_process → pending → done`, but **any stage can move to any stage** (real life is not linear). Postponed sits outside the flow.
- Moving a task **into Pending** opens a small sheet: *"What's it waiting on?"* The reason is saved as a note of type `pending_reason` and shown on the card until the task leaves Pending.
- Moving a task **into Postponed** offers an optional "bring it back on…" date. When that date arrives, the task automatically returns to `new` and a reminder fires.
- Moving a task **out of Done** (undo) is allowed and silently removes it from today's progress.
- Every stage change is recorded in the task's activity log (`stage_change` note, auto-generated).

### 3.2 Task

| Field | Required | Notes |
|---|---|---|
| Title | yes | One line. Arabic or English (or both). |
| Description | no | Longer text, markdown-light (bold, links, line breaks). |
| Stage | yes | Defaults to `new`. |
| Project / client | no | Free-text tag with autocomplete from existing projects, e.g. "Kitebird", "Personal". Each project gets a color. |
| Priority | no | `low`, `normal` (default), `high`, `urgent`. |
| Energy | no | `low`, `medium`, `high` — how much brain it takes. Powers "Pick for me". |
| Due date (+ time) | no | Overdue tasks get a hand-drawn red circle on their date. |
| Estimate | no | Minutes. Used by Focus mode as the default timer. |
| Subtasks | no | Simple checklist inside the task. Each checked subtask = a micro-reward. |
| Notes | no | Timeline of notes, allowed in **every** stage. |
| Reminders | no | One or many, each a date-time with optional message. |
| Source | auto | `manual`, `quick_capture`, or `claude`. Claude-added tasks show a small ✳ badge. |

### 3.3 Notes

- Notes can be added in **all five stages**, from the task drawer.
- Each note stores: text, the stage the task was in when written, timestamp, and a type: `note` (manual), `pending_reason`, `stage_change` (auto), `focus_log` (auto, from Focus mode), `claude` (added via Claude).
- Notes display as a vertical timeline in the drawer, newest first, each with a small stage-colored dot.
- Text direction is detected per note (`dir="auto"`) so Arabic notes render right-to-left.

### 3.4 Reminders

- A task can have any number of reminders: an absolute date-time, or a quick preset (in 1 hour, tonight 8pm, tomorrow 9am, next Monday 9am).
- Reminders fire **even when the browser tab is closed**, because the local server fires them as native macOS notifications.
- If the tab is open, an in-app toast also appears with buttons: **Open task**, **Snooze 15m**, **Snooze 1h**, **Done**.
- Missed reminders (Mac asleep / server off) fire once on next startup, grouped: "While you were away: 3 reminders".
- A bell icon in the header shows upcoming reminders for today.

---

## 4. Screens

### 4.1 Home / Board (the main screen)

Top to bottom (see `design/mockup.html`):

1. **Header row** — logo mark, app name, global search (`/`), quick-add `+` button, upcoming-reminders bell, settings.
2. **Hero band (royal blue)** — giant greeting type ("TODAY · اليوم"), date bubble, the **Momentum bar** (motivational progress), streak badge (rotating circular sticker), "Pick for me" and "Focus" buttons. Hand-drawn arrows pointing at the progress.
3. **Board** — five lanes as columns: New, In process, Pending, Done (today), Postponed. Drag-and-drop cards between lanes and to reorder within a lane. Each lane header shows count. Done lane shows only today's completed tasks by default with a "show all" toggle; Postponed lane is narrower/collapsible.
4. **Card** — title, project chip, priority marker, due date, subtask progress (e.g. 2/5), notes count, reminder bell if set, ✳ if from Claude. Pending cards show the pending reason in one line under the title.

Views (toggle in header): **Board** (default) and **List** (grouped by stage, denser, keyboard friendly). Filters: project, priority, energy, due (today / this week / overdue), source.

### 4.2 Task drawer

Opens from the right when clicking a card (bento-style panel, 480px). Contains: title (inline editable), stage switcher (5 pills), project, priority, energy, due, estimate, description, subtasks, reminders, notes timeline + "add note" input pinned at the bottom, delete (with undo toast, soft delete).

### 4.3 Quick capture (⌘K or `N`)

A command bar for brain dumps — see `06-MOTIVATION-AND-EXTRAS.md §B1`.

### 4.4 Focus mode

Full-screen single-task view with a visual timer — see `06-MOTIVATION-AND-EXTRAS.md §B2`.

### 4.5 Settings

- Name used in greetings (default "Yasmine").
- Sounds on/off, celebration intensity (full / subtle / off), reduced motion follows OS by default.
- Daily goal (number of tasks, default 5) and day start time (default 6:00 — tasks finished at 1am count for the previous day).
- Projects: rename, recolor, archive.
- Data: **Export JSON**, **Import JSON**, open data folder, show automatic backups.
- Claude: shows connection status of the Lanes MCP server and the API token location.

---

## 5. Data persistence (requirement #1)

- All data is stored in a SQLite file at `~/Library/Application Support/Lanes/lanes.db` — **not** in browser storage. Closing the tab, the browser, clearing browser history, or switching browsers does not lose anything.
- Automatic daily backup: a copy of the database in `~/Library/Application Support/Lanes/backups/`, keeping the last 14.
- The UI saves optimistically (instant) and the server is the source of truth.
- If the server is unreachable, the UI shows a calm banner ("Lanes server is sleeping — run `lanes start`") and does not let edits silently fail.

---

## 6. Acceptance criteria (v1 is done when…)

- [ ] I can open `http://localhost:4747` without logging in and see my board.
- [ ] Tasks I added are still there after closing the tab, quitting the browser, and restarting the Mac.
- [ ] I can move a task between all five stages by drag and drop and via the drawer's stage pills.
- [ ] Moving to Pending forces a reason; the reason shows on the card.
- [ ] I can add notes in every stage and see them as a timeline.
- [ ] I can set reminders and receive a macOS notification at the right time with the tab closed.
- [ ] The Momentum bar updates instantly when I finish a task, with a celebration.
- [ ] Quick capture parses "Send Kitebird invoice tomorrow 3pm !high #Kitebird" into a task with title, due, priority, project and a reminder.
- [ ] Focus mode runs a visual timer for one task and logs the session as a note.
- [ ] "Pick for me" suggests one task based on my energy and urgency.
- [ ] In the Claude desktop app, `/task …` creates the task in Lanes and it appears on the open board within 2 seconds without refreshing.
- [ ] Arabic text renders correctly (right-to-left) in titles and notes.
- [ ] Export → delete DB → Import restores everything.
