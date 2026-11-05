// MCP server instructions: what Lanes is and how to fill in a task.
// The trigger lives in the `/task` skill (claude/skills/task/SKILL.md), not here.

export const FIELD_GUIDE = `How to fill in a task:
- title: a short imperative line in the user's language (Arabic stays Arabic). Extra context goes in description.
- project: a client or brand that's mentioned ("for Kitebird", "#Northfield"). Existing names are matched loosely.
- priority: "urgent / asap / مستعجل" → urgent; "important / high" → high; "whenever / low priority" → low; otherwise leave it out.
- due: any date/time phrase, passed as words ("tomorrow 3pm", "by Thursday", "بكرة الساعة ٥") or ISO. A date alone means the end of that day.
- reminders: "remind me at 1" → [{ at: "1pm" }] (a bare time lands on the due day). Leave reminders out and a timed due gets one an hour before; pass [] for none.
- subtasks: lists ("1) … 2) …", bullets, "then …").
- energy: only if stated or obvious ("quick email" → low, "design the whole identity" → high).
- stage: default new. "already started" → in_process. "waiting on X" → pending with pendingReason.
- Never invent details that weren't said. Don't ask follow-up questions unless the title itself is unclear: add the task, then say what you assumed.`;

export const INSTRUCTIONS = `Lanes is Yasmine's local task manager: a board with five stages (New, In process, Pending, Done, Postponed), running on her Mac.
She adds tasks with the /task command. Otherwise only create, move or change tasks when she asks.
Use list_tasks, get_task or today to answer questions about her work. Tasks can be referred to by id or by a few words of the title.
Moving to Pending needs a reason (what it's waiting on). Deleting stays a human action in the app.

${FIELD_GUIDE}`;
