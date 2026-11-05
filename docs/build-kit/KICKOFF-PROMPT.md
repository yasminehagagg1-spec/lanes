# Kickoff prompt — paste this as your first message to Claude Code

Open Terminal in the `lanes` folder (the unzipped kit) and run `claude`. Then paste:

---

We're building **Lanes**, my local task manager. Everything you need is in this folder: `CLAUDE.md` first, then `docs/` and `design/`.

1. Read `CLAUDE.md` and every file it lists, and look at `design/mockup.png`.
2. Before writing code, give me a short summary of what you understood (stages, data storage, Claude connection, momentum system, the three extras) and list anything that's unclear or that you'd change. Keep it under 20 lines.
3. After I confirm, start **Phase 0** from `docs/build-kit/07-BUILD-PLAN.md`. The spec folders stay where they are; build the app in this same folder following the repo layout in `docs/build-kit/02-ARCHITECTURE.md`.
4. At the end of each phase: run the tests, screenshot the UI at 1440×900, compare it to `design/mockup.png`, then stop and tell me what's done and what's next.

My brand fonts (Marine Elmoure, Madinet Al Bat) will go in `packages/web/public/fonts/` — use the fallbacks until they're there.

---

## Useful follow-ups while building

- "Continue with Phase N."
- "Screenshot the board and compare it with the mockup. List the 5 biggest differences and fix them."
- "Install the 21st Kanban component and restyle it to our tokens." (2 free installs a day — see `design/COMPONENTS-21ST.md`)
- "Run the Phase 6 connect script and walk me through restarting the Claude desktop app."
- "Add my real projects: Kitebird, Northfield Studio, Freelance, Personal."
