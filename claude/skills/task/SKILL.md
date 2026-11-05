---
name: task
description: Add a task to Lanes, your local task manager. Runs when you type /task followed by the task in plain words.
argument-hint: <the task in plain words — dates, project, priority, reminders, steps>
disable-model-invocation: true
allowed-tools: mcp__lanes__add_task mcp__lanes__parse_task mcp__lanes__list_tasks
---

<!-- lanes-skill: installed by ~/Projects/lanes/scripts/connect-claude.sh -->

Add this to Lanes: $ARGUMENTS

1. Call the lanes `add_task` tool once with every detail you can infer, using the guide below.
   Several tasks (numbered, bulleted, or one per line) → one `add_task` call each.
   Pass the user's original words as `rawText` only when they hold context the fields don't.
2. Reply in one or two short lines: the title, the stage, the due date and reminder if any,
   and anything you assumed. No pep talk, no follow-up questions.
3. If the lanes tools aren't available here, or Lanes says it isn't running, say so in one
   line, then give the task in quick-capture syntax so it can be pasted into Lanes (⌘K):
   `Title words #project !high @tomorrow 3pm ^1pm ~low =30m > waiting on X`

If nothing follows `/task`, ask what the task is.

## How to fill in the fields

- **title** — a short imperative line, in the user's language (Arabic stays Arabic).
  Extra context goes in `description`.
- **project** — a client or brand that's mentioned ("for Kitebird", "#Northfield").
  Existing names are matched loosely, so pass it as said.
- **priority** — "urgent / asap / مستعجل" → `urgent`; "important / high" → `high`;
  "whenever / low priority" → `low`; otherwise leave it out.
- **due** — pass the date words as said: "tomorrow 3pm", "by Thursday", "بكرة الساعة ٥".
  A date alone means the end of that day.
- **reminders** — "remind me at 1" → `[{ "at": "1pm" }]` (a bare time lands on the due day).
  Leave `reminders` out and a timed due gets one an hour before. Pass `[]` if the user says no reminder.
- **subtasks** — any list: "1) … 2) …", bullets, "first … then …".
- **energy** — only if stated or obvious: "quick email" → `low`, "design the whole identity" → `high`.
- **estimateMin** — only if a duration is said ("30 min job" → 30).
- **stage** — default `new`. "already started" → `in_process`.
  "waiting on X" → `pending` with `pendingReason: "X"`.
- Never invent details that weren't said.

## Examples

`/task Kitebird homepage banners, due Thursday, high priority`
→ `{ title: "Kitebird homepage banners", project: "Kitebird", priority: "high", due: "Thursday" }`

`/task call the printer about the jewelry catalog tomorrow 11am, remind me at 10:30, quick one`
→ `{ title: "Call the printer about the jewelry catalog", due: "tomorrow 11am", reminders: [{ at: "10:30" }], energy: "low" }`

`/task rebrand for the café — 1) moodboard 2) logo sketches 3) palette. waiting on their menu file`
→ `{ title: "Café rebrand", stage: "pending", pendingReason: "their menu file", subtasks: ["Moodboard", "Logo sketches", "Palette"], energy: "high" }`

`/task تسليم بوستات السوشيال بكرة الساعة ٥`
→ `{ title: "تسليم بوستات السوشيال", due: "بكرة الساعة ٥" }` (gets a 4 pm reminder automatically)
