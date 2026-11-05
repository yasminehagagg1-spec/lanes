# Motivation system + the three extra features

Design principle: **reward progress, never punish the backlog.** The bar only goes up during a day. Adding tasks never makes it shrink. Missing a day never resets anything harshly.

---

## A. Momentum (the motivational progress bar)

### A1. The math (`packages/shared/src/progress.ts`, unit tested)

```
points   = tasksDoneToday × 1
         + subtasksDoneToday × 0.25
         + completedFocusSessionsToday × 0.5
momentum = points / dailyGoal            // dailyGoal default 5, set in Settings
```

- Measured against the **daily goal**, not against the size of the backlog → the bar never drops when new tasks arrive.
- `momentum > 1` is allowed: the bar fills, then a second "overdrive" layer starts filling on top in yellow with a subtle shimmer (you can keep going past 100%).
- Undoing a done task subtracts its point (honest), with a gentle animation, no sad messaging.
- The day resets at `day_start_hour` (6:00 by default), so a 1am finish counts for the day you were living in.

### A2. Milestones

| Tier | At | What happens | Copy (EN / AR) |
|---|---|---|---|
| 0 | 0% | Empty bar with a dashed hand-drawn arrow pointing at it | "Start anywhere." / "ابدئي من أي مكان" |
| 1 | 25% | Small burst + the bar's leading edge sparkles | "Moving. Keep it light." / "اتحركتي" |
| 2 | 50% | Burst + the streak sticker spins once | "Halfway. That's real." / "نص الطريق" |
| 3 | 75% | Bigger burst + header type gets a hand-drawn underline | "Almost there. One more push." / "قربتي جداً" |
| 4 | 100% | Full-screen confetti (21st **Burst**), chime, hero text swaps to "DONE FOR TODAY" with a red hand-drawn circle around "DONE" | "Goal hit. Anything now is extra." / "خلصتي هدف النهارده" |

Copy rules: short, first person-adjacent, no hype words ("amazing", "crushing it"), no guilt. Messages rotate from a small pool per tier so they don't get stale (pool lives in `momentum/copy.ts`, 4–5 lines per tier).

### A3. Micro-rewards (every single completion)

When a card lands in Done:

1. Card plays a quick "stamp" animation (scale 1 → 1.06 → 1, yellow check draws itself with SVG stroke animation, 350ms).
2. Small confetti burst from the card's position (12–20 pieces, brand colors).
3. Momentum bar fills with spring physics; the number counter rolls (21st **Number Ticker**).
4. Soft "pop" sound (synthesized with Web Audio — no audio files; pitch rises slightly with each completion in a row → a "combo").
5. **Combo**: completing 2+ tasks within 10 minutes shows a tiny `×2`, `×3` chip next to the bar.

Subtask checks get a mini version (checkbox tick animation + tiny 6-piece burst + higher-pitched tick sound).

All of this respects Settings → Celebration (`full` / `subtle` = no confetti, no sound / `off`) and `prefers-reduced-motion`.

### A4. Streak sticker

- The rotating circular sticker from the reference ("GET STARTED OF FREE" circle) becomes the streak badge: circular text **"KEEP THE STREAK · KEEP THE STREAK ·"** rotating slowly, with the day count in the middle.
- Streak = consecutive days with ≥1 task done.
- **Grace day**: one missed day per rolling 7 days doesn't break the streak (shown as a small hollow dot in the history). Everyone has off days; the system shouldn't punish them.
- Clicking the sticker opens a 30-day heatmap (dots, like the reference's "13 Days" card) with best streak and total done.

---

## B. Three extra features (researched picks)

Common threads in focus-friendly task tools: natural-language capture so ideas get out of the head fast, visual timers to fight time blindness, and help with choosing what to do when everything feels equally loud — plus filtering by energy instead of guilt. The three below cover those gaps without bloating the app.

### B1. Brain-dump Quick Capture (⌘K / `N`)

**Problem it solves:** the moment between "I need to remember this" and "it's written down" is where tasks get lost.

- Opens a centered command bar (21st command palette, restyled) from anywhere — keyboard `N` or ⌘K, or the `+` button.
- Type naturally. As you type, a live preview shows parsed chips under the input: project, priority, due, reminder, energy, estimate. Click a chip to remove it.
- **Multi-line = multiple tasks.** Paste a list and each line becomes a task (preview shows "5 tasks").
- `Enter` saves and keeps the bar open for the next one (brain-dump mode). `Esc` closes. `⌘Enter` saves and opens the task.
- Parser (`packages/shared/src/parse-task.ts`), shared with Claude:
  - `#Kitebird` → project · `!urgent !high !low` → priority · `~low ~med ~high` → energy
  - `@tomorrow 3pm`, `@thu`, `@next week` and plain phrases like "tomorrow at 3" → due (chrono-node)
  - `^1pm`, `^30m before` → reminder · `=45m`, `=2h` → estimate
  - `> waiting on client` → creates it in Pending with that reason
  - Arabic day words supported in a small lookup: بكرة، النهارده، بعد بكرة، السبت…الجمعة.
- Typing `?` in the bar switches to search mode (jump to a task).

### B2. Focus Mode with a visual timer

**Problem it solves:** time blindness and context switching. Seeing time physically drain makes it concrete.

- Press `F` on a card (or "Focus" in the hero) → full-screen, royal-blue view with only: the task title in huge type, its subtasks, and a big **draining ring timer** (like the "36% growth rate" ring in the reference, but counting down).
- Duration defaults to the task's estimate, else 25 min. Quick picks: 10 / 25 / 45 / custom.
- Optional **ambient ticking** or brown noise (Web Audio generated) — toggle.
- During focus, the task auto-moves to In process.
- When time's up: gentle chime + three big buttons: **Done ✓** (moves to Done, full celebration), **5 more min**, **Stop here** (asks for an optional one-line "where I left off" note — that note is gold when you come back to it later).
- Every session is logged as a `focus_log` note ("Focused 25 min") and adds +0.5 momentum points if completed.
- The browser tab title shows the countdown (`12:04 · Lanes`) so it's visible from other tabs.

### B3. "Pick for me" (decision-paralysis breaker)

**Problem it solves:** a full board can freeze you. Choosing is its own task.

- Button in the hero, or `P`. Asks one question with three big buttons: **"How's your energy?"** Low · Medium · High (plus optional "I have ~15 / 30 / 60 min").
- Scores open tasks (`new` + `in_process`; never pending/postponed/done):

  ```
  score = urgency + priority + energyFit + momentumBias + jitter
  urgency      = overdue 5 · due today 4 · due ≤2 days 2 · else 0
  priority     = urgent 4 · high 2 · normal 1 · low 0
  energyFit    = same energy 3 · lower than mine 2 · unset 1 · higher than mine -3
  timeFit      = estimate ≤ minutes available ? 2 : estimate unset ? 0 : -2
  momentumBias = in_process 1.5 (finish what you started)
  jitter       = random 0..0.75 (so it doesn't feel robotic)
  ```

- Shows **one** card, big, flipping in like a dealt card, with a one-line reason: "Due today, and it fits low energy."
- Buttons: **Let's go** (opens Focus mode on it) · **Not this one** (deals the next best; max 3 skips, then "Okay, you pick — here are your top 3").
- Low energy + nothing low-energy available → suggests the smallest subtask anywhere instead.

### Considered but parked (for later phases)

- AI task breakdown ("split this into steps") — natural fit for the Claude connection later.
- Daily review / shutdown ritual at end of day.
- Weekly recap card for the portfolio-minded: what shipped, by project.
