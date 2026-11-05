# Claude ↔ Lanes

Goal: when Yasmine types **`/task …`** in Claude, Claude creates the task in Lanes with all the details it can infer, and it appears on the open board instantly. Manual adding in the UI keeps working as normal.

## 1. How it works

```
/task send Kitebird the final banners tomorrow 3pm, urgent, remind me at 1
        │
        ▼
Claude (desktop app or Claude Code) runs the `task` skill
        │  calls tool  lanes.add_task({...})
        ▼
Lanes MCP server (stdio, packages/mcp)      ← started by Claude, lives on the Mac
        │  POST http://127.0.0.1:4747/api/tasks  + Bearer token
        ▼
Lanes server → SQLite → SSE → open board shows the card (with a ✳ "from Claude" badge)
```

Claude can't read the browser's storage, which is why Lanes keeps data in a local server. The MCP server is a thin, safe bridge: it only knows the endpoints below and only talks to `127.0.0.1`.

**Where it works:** the Claude desktop app on this Mac, and Claude Code in the terminal. Claude chats that are linked to this Mac through the desktop app can usually reach it too, as long as the desktop app is open and the Lanes server is running. A browser-only claude.ai chat that isn't linked to the Mac can't.

## 2. MCP server spec (`packages/mcp`)

- Transport: **stdio**. Entry: `packages/mcp/dist/index.js`. Built with `@modelcontextprotocol/sdk`.
- Config via env: `LANES_URL` (default `http://127.0.0.1:4747`), `LANES_DATA_DIR` (to find the token file).
- On each call, if the server is down, return a friendly tool error: *"Lanes isn't running. Start it with `lanes start`."* — never crash.
- Server name: `lanes`. Provide short **server instructions** (the MCP `instructions` field): what Lanes is and the field guide below. No message-prefix trigger; the `/task` skill in §4 is the trigger.

### Tools

All inputs validated with the shared zod schemas. Dates accept ISO strings; natural-language dates ("tomorrow 3pm") are resolved by the server's `parse-task` using the Mac's timezone (Africa/Cairo), so Claude may pass either.

| Tool | Input | Does |
|---|---|---|
| `add_task` | `TaskDraft` (title required; description, project, priority, energy, due, estimateMin, subtasks[], notes[], reminders[], stage, pendingReason) + optional `rawText` | Creates task with `source: 'claude'`. Returns task summary + link `http://localhost:4747/?task=<id>`. |
| `parse_task` | `{ text }` | Dry run: returns what Lanes would create. Use when unsure. |
| `list_tasks` | `{ stage?, project?, due?, q?, limit? }` | Compact list (id, title, stage, project, due). |
| `get_task` | `{ id \| query }` | Full task with notes and reminders. `query` does a fuzzy title match; if several match, return the candidates. |
| `update_task` | `{ id, ...fields }` | Edit fields (not stage). |
| `move_task` | `{ id, stage, pendingReason?, resumeOn? }` | Stage change with the same rules as the UI (Pending needs a reason). |
| `add_note` | `{ id, body }` | Adds a note of type `claude`. |
| `add_reminder` | `{ id, fireAt \| preset, message? }` | |
| `today` | — | Today's stats + open tasks for today, for "what's on my plate?" |

Tool descriptions must be short and plain — they're what Claude reads to decide.

### Field inference guide (goes in `add_task`'s description and the server instructions)

- **Title**: a short imperative line, same language the user used (keep Arabic as Arabic). Move extra context into `description`.
- **Project**: a client or brand name mentioned ("for Kitebird", "#Northfield") → `project`. Prefer an existing project name (call `list_tasks` or check the returned project list if unsure).
- **Priority**: "urgent / asap / مستعجل" → `urgent`; "important / high" → `high`; "whenever / low priority" → `low`; else `normal`.
- **Due**: any date/time phrase. "by Thursday" → Thursday 23:59 without time.
- **Reminders**: "remind me at 1" → reminder that day at 13:00. If a due time exists and no reminder was asked for, add one reminder 1 hour before due.
- **Subtasks**: lists ("1) … 2) …", bullets, "then …") → `subtasks`.
- **Energy**: only if stated or obvious ("quick email" → low; "design the whole identity" → high).
- **Stage**: default `new`. "already started" → `in_process`. "waiting on X" → `pending` with `pendingReason`.
- Never invent details that weren't said. Don't ask follow-up questions unless the title itself is unclear — add the task, then say what was assumed.

## 3. Setup on the Mac (Claude Code should automate most of this in `scripts/connect-claude.sh`)

1. `pnpm build` (builds `packages/mcp/dist/index.js`).
2. **Claude desktop app** — Settings → Developer → Edit Config opens `~/Library/Application Support/Claude/claude_desktop_config.json`. Add:

   ```json
   {
     "mcpServers": {
       "lanes": {
         "command": "node",
         "args": ["/Users/<you>/Projects/lanes/packages/mcp/dist/index.js"],
         "env": { "LANES_URL": "http://127.0.0.1:4747" }
       }
     }
   }
   ```

   Merge with any servers already there (the script must read-modify-write the JSON, never overwrite). Restart the Claude desktop app. The `lanes` tools appear in the tools menu.
3. **Claude Code** (all projects) — the MCP server:

   ```bash
   claude mcp add lanes --scope user --transport stdio -e LANES_URL=http://127.0.0.1:4747 -- node /Users/<you>/Projects/lanes/packages/mcp/dist/index.js
   ```

   Check with `claude mcp get lanes`.
4. Use the absolute path to `node` if the desktop app can't find it (`which node`), since GUI apps don't load the shell PATH.
5. **The `/task` skill** (§4):
   - Claude Code: the script copies `claude/skills/task/` to `~/.claude/skills/task/` (replacing only that folder).
   - Claude desktop app: the script builds `dist/lanes-task-skill.zip`; Yasmine uploads it once in Settings → Capabilities → Skills. The zip's copy keeps only `name` and `description` in the frontmatter (the desktop uploader doesn't take Claude Code's extra fields) and reads the task from the message instead of `$ARGUMENTS`.
   - Run `scripts/connect-claude.sh --dry-run` first to see what would change. The desktop config is backed up before every write.

## 4. The `/task` skill

The trigger is a skill named **`task`**, run by typing `/task` followed by the task in plain words. Nothing else in a chat creates tasks; a message that merely starts with "new task" is just a message.

Source lives in the repo at `claude/skills/task/SKILL.md`:

```markdown
---
name: task
description: Add a task to Lanes, Yasmine's local task manager. Use when the user runs /task.
argument-hint: <task in plain words — dates, project, priority, reminders, steps>
disable-model-invocation: true
allowed-tools: mcp__lanes__add_task mcp__lanes__parse_task mcp__lanes__list_tasks
---

Add what follows to Lanes: $ARGUMENTS

- Call `add_task` once with every detail you can infer (field guide below). Several tasks
  (numbered, or one per line) → one `add_task` call each.
- Keep the user's language (Arabic stays Arabic). Never invent details.
- Reply in one or two short lines: title, stage, due/reminder if any, and anything you assumed.
- If the lanes tools aren't available here, say so and give the task in quick-capture syntax
  (§5) so it can be pasted into Lanes.

<field guide from §2>
```

`disable-model-invocation: true` means Claude only runs it when Yasmine types `/task`, never on its own.

### Examples

As built, `add_task` takes dates as words (`due: "tomorrow 11am"`, `reminders: [{ at: "10:30" }]`) and the connector resolves them with the same parser as quick capture. The table shows what ends up stored.

| Message | Stored task |
|---|---|
| `/task Kitebird homepage banners, due Thursday, high priority` | `{title:"Kitebird homepage banners", project:"Kitebird", priority:"high", dueAt:"<Thu> 23:59", dueHasTime:false}` |
| `/task call the printer about the jewelry catalog tomorrow 11am, remind me at 10:30, quick one` | `{title:"Call the printer about the jewelry catalog", dueAt:"<tomorrow> 11:00", dueHasTime:true, reminders:[{fireAt:"<tomorrow> 10:30"}], energy:"low"}` |
| `/task rebrand for the café — 1) moodboard 2) logo sketches 3) palette. waiting on their menu file` | `{title:"Café rebrand", stage:"pending", pendingReason:"Waiting on their menu file", subtasks:["Moodboard","Logo sketches","Palette"], energy:"high"}` |
| `/task تسليم بوستات السوشيال بكرة الساعة ٥` | `{title:"تسليم بوستات السوشيال", dueAt:"<tomorrow> 17:00", dueHasTime:true, reminders:[{fireAt:"<tomorrow> 16:00"}]}` |

## 5. Fallback: Quick-capture syntax

The same parser used by Claude powers the in-app quick capture, so anything Claude writes as a fallback can be pasted straight in:

```
Title words  #project  !high|!urgent|!low  ~low|~med|~high (energy)  @tomorrow 3pm (due)  ^1pm (reminder)  =30m (estimate)
```

## 6. Safety

- MCP server only calls `127.0.0.1:4747`; it has no delete tool in v1 (deleting stays a human action in the UI).
- Token file is `chmod 600`; the MCP server reads it, never prints it.
- Text from Claude is stored as plain text (escape on render; no HTML injection in notes or titles).
