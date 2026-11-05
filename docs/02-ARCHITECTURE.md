# Architecture

## 1. Shape of the system

```
┌──────────────────────────┐        ┌────────────────────────────┐
│  Browser tab             │  HTTP  │  Lanes server (Node)       │
│  React app (Vite build)  │◄──────►│  localhost:4747            │
│  - board, drawer, focus  │  SSE   │  - REST API  /api/*        │
└──────────────────────────┘◄───────│  - SSE stream /api/events  │
                                    │  - reminder scheduler      │──► macOS notifications
┌──────────────────────────┐  HTTP  │  - serves built UI (/)     │
│  Lanes MCP server        │───────►│  - SQLite (better-sqlite3) │──► ~/Library/Application Support/Lanes/lanes.db
│  (stdio, spawned by      │ +token └────────────────────────────┘
│  Claude desktop / Code)  │
└──────────────────────────┘
```

Why a tiny local server instead of browser storage only:

1. **Durability** — a SQLite file on disk can't be wiped by clearing browser data, and can be backed up.
2. **Reminders with the tab closed** — only a running process can fire notifications when no tab is open.
3. **Claude access** — Claude can't reach a browser's localStorage, but it *can* call a local MCP server that talks to this API.
4. **Live updates** — when Claude adds a task, the server pushes it to the open tab via Server-Sent Events.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces | Three small packages sharing types |
| UI | React 19 + TypeScript + Vite | Fast, standard; 21st.dev components target React + Tailwind |
| Styling | Tailwind CSS v4 + CSS variables from `design/tokens.css` | shadcn/21st components drop in cleanly |
| Components | shadcn/ui base + selected 21st.dev components (see `design/COMPONENTS-21ST.md`) | |
| Motion | `motion` (Framer Motion) | Card moves, drawer, number rolls, celebrations |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Accessible, works with keyboard |
| Client state | TanStack Query (server cache) + Zustand (UI state: drawer, filters, focus) | |
| Dates | `date-fns` + `chrono-node` (natural language parsing) | |
| Server | Node 22+, Fastify 5 | Small, fast, typed |
| DB | SQLite via `better-sqlite3`, schema migrations in plain SQL files | Single file, zero setup |
| Validation | `zod` schemas shared between server, UI, and MCP | One source of truth |
| Notifications | `node-notifier` (uses macOS Notification Center) | Works with the tab closed |
| MCP | `@modelcontextprotocol/sdk` (stdio transport) | Claude desktop + Claude Code |
| Tests | Vitest (unit), Playwright (a few end-to-end flows) | |

## 3. Repository layout

```
lanes/
├─ CLAUDE.md
├─ package.json                 # workspace root, scripts: dev, build, start, test
├─ pnpm-workspace.yaml
├─ packages/
│  ├─ shared/                   # zod schemas, TS types, stage rules, NL parser, progress math
│  │  └─ src/
│  │     ├─ schemas.ts
│  │     ├─ stages.ts           # stage list, labels (EN/AR), colors, transition rules
│  │     ├─ parse-task.ts       # natural-language → TaskDraft (used by UI quick capture AND MCP)
│  │     └─ progress.ts         # momentum, streak, level math (pure functions, unit tested)
│  ├─ server/
│  │  └─ src/
│  │     ├─ index.ts            # fastify boot, static UI, port 4747, bind 127.0.0.1 only
│  │     ├─ db/ (connection.ts, migrations/*.sql, repo/*.ts)
│  │     ├─ routes/ (tasks.ts, notes.ts, reminders.ts, projects.ts, stats.ts, data.ts, events.ts)
│  │     ├─ scheduler.ts        # reminder loop + postponed "bring back" loop
│  │     ├─ notify.ts           # macOS notification wrapper
│  │     ├─ events.ts           # in-memory SSE broadcaster
│  │     ├─ backup.ts           # daily DB copy, keep 14
│  │     └─ auth.ts             # local API token for non-browser clients
│  ├─ web/
│  │  └─ src/
│  │     ├─ app/ (App.tsx, routes, providers)
│  │     ├─ features/
│  │     │  ├─ board/  (Board, Lane, TaskCard, dnd)
│  │     │  ├─ task-drawer/
│  │     │  ├─ quick-capture/
│  │     │  ├─ focus/
│  │     │  ├─ momentum/ (MomentumBar, StreakSticker, Celebration)
│  │     │  ├─ pick-for-me/
│  │     │  ├─ reminders/ (bell, toast)
│  │     │  └─ settings/
│  │     ├─ components/ui/      # shadcn + 21st components land here
│  │     ├─ assets/scribbles/   # hand-drawn SVGs from design/assets
│  │     ├─ lib/ (api.ts, sse.ts, sounds.ts)
│  │     └─ styles/ (tokens.css, fonts.css, globals.css)
│  └─ mcp/
│     └─ src/index.ts           # MCP server: tools → HTTP calls to localhost:4747
├─ scripts/
│  ├─ install-launchagent.sh    # auto-start server at login
│  └─ lanes                     # CLI: lanes start | stop | status | open | backup
└─ e2e/
```

## 4. Server details

- **Bind to `127.0.0.1` only**, never `0.0.0.0`. Nothing on the network can reach it.
- **Port** `4747` (configurable via `LANES_PORT`).
- **Data dir** `~/Library/Application Support/Lanes/` (override `LANES_DATA_DIR`). Created on first run. Contains `lanes.db`, `backups/`, `token`.
- **Auth model:**
  - Requests from the browser UI served on the same origin are allowed (check `Origin`/`Host` is `localhost:4747` or `127.0.0.1:4747`).
  - All other clients (the MCP server, curl) must send `Authorization: Bearer <token>`. The token is a random 32-byte hex string generated on first run into `<dataDir>/token` (file mode 600). The MCP server reads it from that file.
  - Reject any request whose `Host` header is not localhost/127.0.0.1 (DNS rebinding protection).
- **SSE** at `GET /api/events`: emits `task.created`, `task.updated`, `task.deleted`, `note.created`, `reminder.fired`, `stats.updated`. The UI invalidates/patches TanStack Query caches on these events. Send a heartbeat comment every 20s.
- **Scheduler** (`setInterval` every 15s):
  1. Find reminders with `fire_at <= now AND fired_at IS NULL AND dismissed = 0` → send macOS notification (title = task title, body = reminder message or due info), set `fired_at`, emit `reminder.fired`.
  2. Find postponed tasks with `resume_on <= today` → move to `new`, add `stage_change` note "Back from postponed", create an immediate reminder.
  3. On startup, run both immediately and group missed reminders into one notification if more than 2.
- **Notification click** opens `http://localhost:4747/?task=<id>` (node-notifier `open` option).
- **Backups:** on startup and every 24h, `VACUUM INTO` a dated copy; prune to 14.
- **Logging:** pino, to `<dataDir>/logs/server.log`, rotated small.

## 5. Running it

- `pnpm dev` — server (tsx watch) + Vite dev server with proxy to 4747.
- `pnpm build && pnpm start` — server serves the built UI at `http://localhost:4747`.
- `scripts/install-launchagent.sh` — writes `~/Library/LaunchAgents/com.yasmine.lanes.plist` so the server starts at login and restarts if it crashes. `scripts/lanes` gives `start | stop | status | open | backup | token`.
- The UI is installable as a PWA (manifest + icon) so it can live in the Dock as "Lanes" with its own window.

## 6. Frontend data flow

- `lib/api.ts`: typed fetch wrapper using shared zod schemas.
- TanStack Query keys: `['tasks', filters]`, `['task', id]`, `['stats','today']`, `['projects']`, `['reminders','upcoming']`.
- Mutations are optimistic (stage moves especially — the card must move instantly; roll back with a toast on error).
- SSE client reconnects with backoff; on reconnect, refetch everything (cheap — it's local).
- Celebrations are triggered client-side on a successful move into `done`, using the `stats` returned in the mutation response (so the momentum bar animates from old → new value).

## 7. Performance and quality bars

- Board interactive in < 300ms on load with 500 tasks.
- Drag at 60fps; respect `prefers-reduced-motion` (swap motion for opacity fades, no confetti).
- Full keyboard support: `N` quick add, `/` search, `F` focus, `P` pick for me, arrow keys between cards, `1–5` move selected card to stage, `Enter` open drawer, `Esc` close.
- Accessible: lanes are labeled regions, cards are buttons, drag has keyboard alternative (dnd-kit keyboard sensor), color is never the only signal (stage also shown by label/icon).
