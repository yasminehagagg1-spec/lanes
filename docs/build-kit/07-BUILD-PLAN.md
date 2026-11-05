# Build plan (for Claude Code)

Work phase by phase. At the end of each phase: run tests, run the app, take a screenshot of the UI (Playwright) and compare it against `design/mockup.png`, then stop and summarize for Yasmine before starting the next phase.

## Phase 0 — Scaffold (small)
- [ ] pnpm workspace with `shared`, `server`, `web`, `mcp` packages, TypeScript strict, ESLint + Prettier.
- [ ] Copy `design/tokens.css` → `packages/web/src/styles/tokens.css`; Tailwind v4 theme mapped to tokens (`design/tailwind-theme.css`).
- [ ] Fonts wired (`design/DESIGN-SYSTEM.md §3`), with fallbacks working even if brand font files are missing.
- [ ] Copy `design/assets/*.svg` → `packages/web/src/assets/scribbles/`.
- [ ] `pnpm dev` shows a blank styled page; `/api/health` returns ok.

## Phase 1 — Data + API
- [ ] SQLite connection, data dir, migrations, settings defaults, token file.
- [ ] Repos + routes per `docs/build-kit/04-API.md`; `moveTask` rules per `docs/build-kit/03-DATA-MODEL.md §3`.
- [ ] SSE broadcaster.
- [ ] `progress.ts` and `parse-task.ts` in `shared` with thorough unit tests (parser: at least 25 cases incl. Arabic).
- [ ] Seed script with ~15 realistic tasks across projects (Kitebird, Northfield Studio, Personal, a café rebrand, a jewelry catalog) for development.

## Phase 2 — Board + drawer (the core)
- [ ] Header, hero band, board with five lanes, cards — match the mockup.
- [ ] Drag & drop between and within lanes (dnd-kit), optimistic, keyboard sensor.
- [ ] Pending reason sheet on move to Pending; postponed date sheet on move to Postponed.
- [ ] Task drawer: all fields, subtasks, notes timeline + add note, reminders list.
- [ ] Filters, search, list view.
- [ ] SSE live updates.

## Phase 3 — Momentum + celebrations
- [ ] Momentum bar, number ticker, tiers, copy pool, overdrive layer.
- [ ] Card stamp animation, bursts, synthesized sounds, combo chip.
- [ ] Streak sticker + 30-day heatmap popover.
- [ ] Settings: celebration level, sounds, daily goal, day start.

## Phase 4 — Reminders
- [ ] Scheduler, macOS notifications (`node-notifier`), click opens the task.
- [ ] In-app toasts with snooze/done, upcoming bell.
- [ ] Postponed auto-return.
- [ ] Missed-reminder grouping on startup.

## Phase 5 — Extras
- [ ] Quick capture command bar with live chip preview + multi-line.
- [ ] Focus mode with draining ring, tab title countdown, end-of-session flow, focus log notes.
- [ ] Pick for me with scoring + dealt-card animation.

## Phase 6 — Claude connection
- [ ] `claude/skills/task/SKILL.md` — the `/task` skill (§4).
- [ ] `packages/mcp` with the tools and server instructions in `docs/build-kit/05-CLAUDE-INTEGRATION.md`.
- [ ] `scripts/connect-claude.sh`: safely merges into the Claude desktop config and runs `claude mcp add` if the `claude` CLI exists. Installs the `/task` skill into `~/.claude/skills/task/` and builds `dist/lanes-task-skill.zip` for the desktop app. Prints what it changed.
- [ ] Manual test: in Claude desktop, run each `/task` example from §4 and confirm cards appear live.

## Phase 7 — Polish + ship
- [ ] Export / import, daily backups, data folder button.
- [ ] LaunchAgent install script + `lanes` CLI.
- [ ] PWA manifest + icon (royal blue square, white "L" with a yellow hand-drawn swoosh).
- [ ] Empty states (hand-drawn arrow pointing to `+`: "Dump everything here.").
- [ ] Offline/server-down banner.
- [ ] Playwright e2e: create → move through all stages → note → reminder → done celebration; persistence across reload; quick capture parse.
- [ ] README for Yasmine: start, stop, connect Claude, back up.

## Definition of done
All acceptance criteria in `docs/build-kit/01-PRD.md §6` pass, `pnpm test` is green, and the UI screenshot reads as the same design as `design/mockup.png`.
