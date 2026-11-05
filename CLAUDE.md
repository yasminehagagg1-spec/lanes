# CLAUDE.md — Lanes · مسارات

You are building **Lanes**, a local-only task manager for one person (Yasmine, a designer/front-end dev juggling many clients at once) on macOS. Read this file fully, then the docs in order before writing code.

## Read first (in order)
1. `docs/01-PRD.md` — what and why, acceptance criteria
2. `docs/02-ARCHITECTURE.md` — stack, repo layout, server, security
3. `docs/03-DATA-MODEL.md` — SQLite schema, types, stage rules
4. `docs/04-API.md` — endpoints + SSE events
5. `docs/05-CLAUDE-INTEGRATION.md` — MCP server + `/task` skill
6. `docs/06-MOTIVATION-AND-EXTRAS.md` — momentum math, celebrations, quick capture, focus, pick-for-me
7. `docs/07-BUILD-PLAN.md` — phases; follow them in order
8. `design/DESIGN-SYSTEM.md`, `design/tokens.css`, `design/tailwind-theme.css`, `design/COMPONENTS-21ST.md`
9. `design/mockup.html` + `design/mockup.png` — the visual target.

## Non-negotiables
- **Local only.** Server binds to `127.0.0.1:4747`. No accounts, no cloud, no telemetry, no external API calls at runtime (fonts may load from Google Fonts with local fallbacks).
- **Data lives in SQLite** at `~/Library/Application Support/Lanes/lanes.db` — never only in localStorage/IndexedDB.
- **Five stages exactly:** `new`, `in_process`, `pending`, `done`, `postponed`. Moving to `pending` requires a reason. All stage logic goes through one `moveTask()` on the server.
- **Notes in every stage.** Reminders fire as macOS notifications even with the tab closed.
- **Tokens, not hex.** Every color/radius/font comes from `tokens.css` via Tailwind theme. 21st/shadcn components must be restyled to the tokens.
- **Reward progress, never punish the backlog** (momentum never drops because tasks were added).
- **Respect `prefers-reduced-motion`** and the in-app celebration setting.
- **Arabic support:** `dir="auto"` + Arabic font on user text everywhere.

## Stack (don't swap without asking)
pnpm workspaces · TypeScript strict · React 19 + Vite · Tailwind v4 · shadcn/ui + selected 21st.dev components · motion (Framer Motion) · dnd-kit · TanStack Query · Zustand · zod (shared) · Fastify 5 · better-sqlite3 · node-notifier · chrono-node + date-fns · @modelcontextprotocol/sdk · Vitest · Playwright.

## Commands (create these)
- `pnpm dev` — server + web with hot reload
- `pnpm build` / `pnpm start` — production at http://localhost:4747
- `pnpm test` — unit tests (shared + server); `pnpm e2e` — Playwright
- `pnpm seed` — dev data; `pnpm db:reset` — wipe dev DB (dev data dir only, never the real one)
- Use `LANES_DATA_DIR=./.data-dev` in development so the real data folder is never touched by dev/test runs.

## Working style
- Work phase by phase from `docs/07-BUILD-PLAN.md`. At the end of each phase: tests green, screenshot the UI with Playwright at 1440×900, compare with `design/mockup.png`, fix drift, then summarize what changed and stop for review.
- Keep `packages/shared` pure and unit-tested (parser and progress math especially).
- Small components, feature folders, no giant files. No `any`.
- When a 21st.dev install fails (daily free limit), build the piece from shadcn/Radix primitives following the design spec rather than waiting.
- Ask before: adding a dependency not listed above, changing the schema in a non-additive way, or changing anything in the Claude desktop config beyond adding the `lanes` entry.
- Microcopy follows `design/DESIGN-SYSTEM.md §9`: short, calm, a little poetic, no hype words.

## Fonts
Brand fonts (Marine Elmoure, Madinet Al Bat) are licensed files Yasmine will drop into `packages/web/public/fonts/`. Code must work and look right with the fallbacks (Archivo wide 900, Alexandria) when the files aren't there.
