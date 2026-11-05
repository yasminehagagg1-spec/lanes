import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { STAGE_META, parseTask, type Stage, type TaskDraft } from '@lanes/shared';
import { Dialog } from '@/components/ui/overlays';
import { cn, Kbd, StageDot, UserText } from '@/components/ui/primitives';
import { dueLabel, timeLabel } from '@/lib/format';
import { useCreateTask, useProjects, useTasks } from '@/lib/queries';
import { useUi } from '@/lib/store';

// ---------- chips ----------

interface Chip {
  key: string;
  label: string;
}

function chipsFor(d: TaskDraft): Chip[] {
  const chips: Chip[] = [];
  if (d.project) chips.push({ key: 'project', label: `#${d.project}` });
  if (d.priority && d.priority !== 'normal')
    chips.push({ key: 'priority', label: `!${d.priority}` });
  if (d.energy) chips.push({ key: 'energy', label: `~${d.energy} energy` });
  if (d.dueAt) {
    chips.push({
      key: 'due',
      label: `Due ${dueLabel({ dueAt: d.dueAt, dueHasTime: d.dueHasTime ?? false })}`,
    });
  }
  d.reminders?.forEach((r, i) =>
    chips.push({ key: `reminder:${i}`, label: `🔔 ${timeLabel(new Date(r.fireAt))}` }),
  );
  if (d.estimateMin) chips.push({ key: 'estimate', label: `=${d.estimateMin}m` });
  if (d.pendingReason) chips.push({ key: 'pending', label: `Waiting on: ${d.pendingReason}` });
  return chips;
}

/** Removing a chip removes that piece of the parse (the words stay in your text). */
function without(d: TaskDraft, removed: (key: string) => boolean): TaskDraft {
  const next: TaskDraft = { ...d };
  if (removed('project')) delete next.project;
  if (removed('priority')) delete next.priority;
  if (removed('energy')) delete next.energy;
  if (removed('due')) {
    delete next.dueAt;
    delete next.dueHasTime;
  }
  if (next.reminders) {
    next.reminders = next.reminders.filter((_, i) => !removed(`reminder:${i}`));
    if (!next.reminders.length) delete next.reminders;
  }
  if (removed('estimate')) delete next.estimateMin;
  if (removed('pending')) {
    delete next.pendingReason;
    delete next.stage;
  }
  return next;
}

// ---------- capture ----------

interface Line {
  line: string;
  draft: TaskDraft;
}

function CaptureBody({ stage }: { stage: Stage }) {
  const close = useUi((s) => s.closeQuickAdd);
  const openDrawer = useUi((s) => s.openDrawer);
  const create = useCreateTask();
  const { data: projects = [] } = useProjects();
  const { data: tasks = [] } = useTasks();
  const [text, setText] = useState('');
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ n: number; at: number } | null>(null);
  const [hit, setHit] = useState(0);

  const searching = text.startsWith('?');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Grow with the text (wrapped lines included), up to the max height.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  const known = useMemo(() => projects.map((p) => p.name), [projects]);

  const lines: Line[] = useMemo(() => {
    if (searching) return [];
    return text
      .split(/\r?\n/)
      .map((line) => ({
        line,
        raw: parseTask(line, { knownProjects: known, source: 'quick_capture' }),
      }))
      .filter((l): l is { line: string; raw: TaskDraft } => l.raw !== null)
      .map(({ line, raw }) => ({ line, draft: without(raw, (k) => removed.has(`${line}::${k}`)) }));
  }, [text, known, removed, searching]);

  const results = useMemo(() => {
    if (!searching) return [];
    const q = text.slice(1).trim().toLocaleLowerCase();
    return tasks.filter((t) => !q || t.title.toLocaleLowerCase().includes(q)).slice(0, 8);
  }, [searching, text, tasks]);

  const save = async (openAfter: boolean) => {
    if (!lines.length) return;
    const drafts = lines.map(({ draft }) => ({ ...draft, stage: draft.stage ?? stage }));
    if (drafts.some((d) => d.stage === 'pending' && !d.pendingReason)) {
      setError('Pending tasks need a reason. Add “> what it’s waiting on”.');
      return;
    }
    const created: string[] = [];
    try {
      for (const d of drafts) created.push((await create.mutateAsync(d)).task.id);
    } catch {
      // The toast says why; keep the text so nothing typed is lost.
      if (!created.length) return;
      setText(
        lines
          .slice(created.length)
          .map((l) => l.line)
          .join('\n'),
      );
      return;
    }
    setText('');
    setRemoved(new Set());
    setError(null);
    if (openAfter && created[0]) {
      close();
      openDrawer(created[0]);
      return;
    }
    setAdded({ n: created.length, at: Date.now() });
  };

  const openResult = (id: string) => {
    close();
    openDrawer(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (searching) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHit((h) => Math.min(results.length - 1, h + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHit((h) => Math.max(0, h - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = results[hit];
        if (r) openResult(r.id);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void save(e.metaKey || e.ctrlKey);
    }
  };

  return (
    <div data-testid="capture" data-mode={searching ? 'search' : 'capture'}>
      <div className="flex items-start gap-3 border-b border-border px-6 pt-6 pb-4">
        {searching ? (
          <Search className="mt-2 size-5 shrink-0 text-fg-2" aria-hidden="true" />
        ) : (
          <StageDot stage={stage} className="mt-2.5" />
        )}
        <textarea
          ref={inputRef}
          autoFocus
          dir="auto"
          rows={1}
          aria-label={searching ? 'Search tasks' : 'Task'}
          placeholder={
            stage === 'new'
              ? 'Dump it here. One line, one task.'
              : `Add to ${STAGE_META[stage].en}…${stage === 'pending' ? ' > what it’s waiting on' : ''}`
          }
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setHit(0);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          className="max-h-60 w-full resize-none bg-transparent text-[1.375rem] leading-snug outline-none placeholder:text-fg-3"
        />
      </div>

      <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
        {searching ? (
          results.length ? (
            <ul
              role="listbox"
              aria-label="Matching tasks"
              className="m-0 flex list-none flex-col gap-1 p-0"
            >
              {results.map((t, i) => (
                <li key={t.id} role="option" aria-selected={i === hit}>
                  <button
                    type="button"
                    onMouseEnter={() => setHit(i)}
                    onClick={() => openResult(t.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left',
                      i === hit && 'bg-surface-sunk',
                    )}
                  >
                    <StageDot stage={t.stage} />
                    <UserText text={t.title} className="flex-1 truncate text-sm" />
                    <span className="text-xs text-fg-3">{STAGE_META[t.stage].en}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-fg-3">Nothing matches.</p>
          )
        ) : lines.length ? (
          <>
            {lines.length > 1 && (
              <p className="m-0 mb-2 text-xs font-semibold text-fg-2" data-testid="capture-count">
                {lines.length} tasks
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {lines.map(({ line, draft }, i) => (
                <li
                  key={`${i}-${line}`}
                  className="flex flex-col gap-1.5"
                  data-testid="capture-preview"
                >
                  <UserText text={draft.title} className="text-sm font-medium" />
                  <div className="flex flex-wrap gap-1.5">
                    {chipsFor(draft).map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        title="Remove"
                        onClick={() => setRemoved((r) => new Set(r).add(`${line}::${c.key}`))}
                        className="group inline-flex items-center gap-1 rounded-full bg-surface-sunk px-2.5 py-1 text-xs font-medium hover:bg-yellow-200"
                      >
                        {c.label}
                        <X className="size-3 text-fg-3 group-hover:text-fg" aria-label="remove" />
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <AnimatePresence mode="wait">
            {added ? (
              <motion.p
                key={added.at}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="m-0 text-sm font-medium text-royal"
                data-testid="capture-added"
              >
                Added {added.n === 1 ? 'one' : added.n}. Next?
              </motion.p>
            ) : (
              <p className="m-0 text-sm text-fg-3">
                Type naturally — dates, #projects and !priorities are picked up as you go.
              </p>
            )}
          </AnimatePresence>
        )}
        {error && <p className="mt-3 mb-0 text-sm text-scribble">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-6 py-3 text-[0.6875rem] text-fg-3">
        <span>#project</span>
        <span>!high</span>
        <span>~low</span>
        <span>@tomorrow 3pm</span>
        <span>^1pm</span>
        <span>=30m</span>
        <span>&gt; waiting on</span>
        <span>? search</span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd className="bg-surface-sunk">
            <CornerDownLeft className="size-3" aria-label="Enter" />
          </Kbd>
          add & keep going ·<Kbd className="bg-surface-sunk">⌘↵</Kbd> add & open ·
          <Kbd className="bg-surface-sunk">⇧↵</Kbd> new line
        </span>
      </div>
    </div>
  );
}

/** Quick capture (⌘K, N, the + buttons). */
export function QuickAdd() {
  const { open, stage } = useUi((s) => s.quickAdd);
  const close = useUi((s) => s.closeQuickAdd);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Quick capture"
      hideTitle
      placement="top"
      className="w-[min(92vw,640px)] p-0"
    >
      <CaptureBody stage={stage} />
    </Dialog>
  );
}
