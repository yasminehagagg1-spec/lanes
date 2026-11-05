# Components from 21st.dev

Use these as **starting points**, then restyle them to `tokens.css` (never keep their default colors/fonts). If a component fights the design, build it from shadcn/Radix primitives instead — the design system wins.

## How to install

21st components install through the shadcn CLI. Free accounts get **2 component installs per day** (search is free); paid plans are unlimited. So pick the essentials first.

```bash
# one-time: get an API key at https://21st.dev/mcp (or run `21st login` with the CLI)
export API_KEY_21ST=...                      # never commit this
npx shadcn@latest init                       # in packages/web, Tailwind v4, CSS variables on
npx shadcn@latest add "https://21st.dev/r/<author>/<slug>?api_key=$API_KEY_21ST"
```

Optional, nicer for Claude Code: the 21st plugin, so Claude Code can search and install from the library itself:

```
/plugin marketplace add 21st-dev/claude-code-plugin
/plugin install 21st@21st
```

Install base shadcn primitives (free, unlimited) first: `button dialog sheet popover dropdown-menu tooltip checkbox input textarea calendar sonner scroll-area`.

## Picks

### Must-have (install first — 2 per day)

| # | Component | Used for | Install slug | Notes |
|---|---|---|---|---|
| 1 | **Kanban** — Kibo UI (Hayden Bleasel) | Board + lanes + drag | `haydenbleasel/kanban` | Built on `@dnd-kit/core`. Restyle columns to lane spec; add keyboard sensor. Alt: ReUI Kanban `sean0205/kanban` (adds sortable). |
| 2 | **Burst** — tinkerers-labs | Confetti on done + tier milestones | `tinkerers-labs/burst` | Canvas, MIT, made for "celebrate a finished task". Pass brand colors; disable on reduced motion. |
| 3 | **Number Ticker** — Yad Hakim | Momentum count, stats | `dev.yadhakim/number-ticker` | Odometer-style digit roll with spring physics (framer-motion). Simpler alt: `kevingirelli/number-ticker`. |
| 4 | **Command Palette** — Joly UI | Quick capture + search | `dev.shejanmahamud/command-palette` | Fuzzy search, nested pages, recent items. We replace the list with the parsed-chip preview. Alt with sketchy border that matches the scribble vibe: **Doodle Command Palette** `kanchanasw/command` (cmdk). |

### Nice-to-have (day 3+)

| # | Component | Used for | Install slug | Notes |
|---|---|---|---|---|
| 5 | **Date Picker** — Wensity Labs | Due date, reminder, postpone date | `wensity/date-picker` | Has presets + optional time — perfect for reminder presets. Alt: Origin UI calendar with time input. |
| 6 | **Expandable Tabs** — victorwelander | Board / List view switch + filters | `victorwelander/expandable-tabs` | |
| 7 | **Status Roadmap Board** — Oliver | Card details reference (progress bars on cards) | `olewandowski1/roadmap-1` | Borrow the card-level progress bar for subtasks. |
| 8 | **Command Palette with Argument Chips** — UI TripleD | Inspiration for parsed chips in quick capture | `moumensoliman/command-palette` | Inline argument chips + animated height morph — closest to our live-preview idea. |
| 9 | **Spotlight Card** — jahed | Optional hover glow on hero glass cards | `jahed/spotlight-card` | Only on the hero; never on board cards. |

### Build in-house (no component needed)

- Rotating streak sticker — SVG `<textPath>` on a circle + CSS rotation.
- Ring timer (Focus) — SVG circle with `stroke-dashoffset`, driven by `requestAnimationFrame`.
- Hand-drawn scribbles — `design/assets/*.svg`.
- Sounds — Web Audio (oscillator + gain envelope), no files.

## Browse more

Relevant categories on 21st.dev if something needs swapping: Progress, Numbers, Toasts, Date Pickers, Dialogs/Modals, Tabs, Checkboxes, Empty States, Stats & KPIs, Dashboards. Full machine-readable directory: `https://21st.dev/llms.txt`.

> Licenses vary per component (MIT, "unknown", none). Prefer MIT ones; for "unknown" ones, it's personal-use local software, but check the component page before reusing anything publicly.
