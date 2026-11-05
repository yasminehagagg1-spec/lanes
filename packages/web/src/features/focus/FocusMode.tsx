import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Square, Volume1, VolumeX, Waves, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import type { FocusOutcome, Task } from '@lanes/shared';
import { Button, cn, IconButton, UserText } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/api';
import { celebrateCompletion, celebrateSubtask, effects } from '@/lib/celebrate';
import { keys, setStats, upsertTask, useTaskDetail, useTaskItemMutation } from '@/lib/queries';
import { playChime, startAmbient, type Ambient } from '@/lib/sounds';
import { useUi, type FocusState } from '@/lib/store';

const RING = 320;
const STROKE = 18;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const AMBIENT_KEY = 'lanes.ambient';
const PICKS = [10, 25, 45];

const pad = (n: number) => String(n).padStart(2, '0');
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

function readAmbient(): Ambient {
  try {
    const v = localStorage.getItem(AMBIENT_KEY);
    return v === 'tick' || v === 'brown' ? v : 'off';
  } catch {
    return 'off';
  }
}

/** Big for short titles, calmer for long ones, so the ring always fits on screen. */
function titleSize(title: string, roomy: boolean): string {
  if (title.length <= 24)
    return roomy ? 'text-[clamp(3rem,8vw,7.5rem)]' : 'text-[clamp(2.75rem,6vw,5.5rem)]';
  if (title.length <= 48)
    return roomy ? 'text-[clamp(2.5rem,5.5vw,5.5rem)]' : 'text-[clamp(2.25rem,4vw,4rem)]';
  return roomy ? 'text-[clamp(2.25rem,4vw,4rem)]' : 'text-[clamp(2rem,3vw,3rem)]';
}

/** Remaining time, re-rendered ~4×/s while running. */
function useRemaining(focus: FocusState | null): { remaining: number; total: number } {
  const [now, setNow] = useState(() => Date.now());
  const running = focus?.phase === 'running';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  const total = ((focus?.plannedMin ?? 25) + (focus?.extraMin ?? 0)) * 60_000;
  const elapsed = focus?.startedAt ? now - focus.startedAt : 0;
  return { remaining: Math.max(0, total - elapsed), total };
}

function Ring({ remaining, total }: { remaining: number; total: number }) {
  const fraction = total ? remaining / total : 1;
  return (
    <div className="relative shrink-0" style={{ width: RING, height: RING }}>
      <svg viewBox={`0 0 ${RING} ${RING}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,.15)"
          strokeWidth={STROKE}
        />
        <circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          fill="none"
          className="stroke-yellow"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 250ms linear' }}
        />
      </svg>
      <div
        role="timer"
        aria-live="off"
        data-testid="focus-clock"
        className="type-display tabular absolute inset-0 flex items-center justify-center text-[4.5rem] leading-none"
      >
        {clock(remaining)}
      </div>
    </div>
  );
}

function Steps({ task }: { task: Task }) {
  const toggle = useTaskItemMutation(task.id, (a: { id: string; done: boolean }) =>
    api.updateSubtask(a.id, { done: a.done }),
  );
  if (!task.subtasks.length) return null;
  return (
    <ul className="m-0 flex max-h-[320px] w-full max-w-sm shrink-0 list-none lg:w-80 flex-col gap-1 overflow-y-auto rounded-lg bg-[var(--glass-bg)] p-3 shadow-glass backdrop-blur-[var(--glass-blur)]">
      {task.subtasks.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            role="checkbox"
            aria-checked={s.done}
            onClick={(e) => {
              if (!s.done) celebrateSubtask(e.currentTarget);
              toggle.mutate({ id: s.id, done: !s.done });
            }}
            className="flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-white/10"
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                s.done ? 'border-yellow bg-yellow' : 'border-white/60',
              )}
            >
              {s.done && (
                <Check className="size-3 text-charcoal" strokeWidth={3.5} aria-hidden="true" />
              )}
            </span>
            <UserText
              text={s.title}
              className={cn('text-sm', s.done && 'text-on-royal-2 line-through')}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

function StopNote({ onSave }: { onSave: (note: string) => void }) {
  const [note, setNote] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(note.trim());
  };
  return (
    <form onSubmit={submit} className="flex w-full max-w-lg flex-col items-center gap-4">
      <label htmlFor="left-off" className="text-lg text-on-royal-2">
        Where did you leave off?{' '}
        <span className="text-sm">(optional — future you will thank you)</span>
      </label>
      <input
        id="left-off"
        autoFocus
        dir="auto"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Halfway through the hero banner, copy pending"
        className="w-full rounded-full bg-white px-6 py-4 text-base text-charcoal outline-none focus:ring-4 focus:ring-yellow"
      />
      <Button type="submit" variant="yellow" size="lg">
        Save and stop
      </Button>
    </form>
  );
}

export function FocusMode() {
  const focus = useUi((s) => s.focus);
  const setFocus = useUi((s) => s.setFocus);
  const openDrawer = useUi((s) => s.openDrawer);
  const qc = useQueryClient();
  const { data: task } = useTaskDetail(focus?.taskId ?? null);
  const { remaining, total } = useRemaining(focus);
  const [ambient, setAmbient] = useState<Ambient>(readAmbient);
  const [custom, setCustom] = useState('');
  const busy = useRef(false);

  // Time's up → chime and ask where you landed.
  useEffect(() => {
    if (focus?.phase === 'running' && remaining <= 0) {
      if (effects().sound) playChime();
      setFocus({ ...focus, phase: 'timeup' });
    }
  }, [focus, remaining, setFocus]);

  // Countdown in the tab title, so it's visible from other tabs.
  useEffect(() => {
    if (focus?.phase !== 'running') return;
    const original = 'Lanes';
    document.title = `${clock(remaining)} · Lanes`;
    return () => {
      document.title = original;
    };
  }, [focus?.phase, remaining]);

  // Ambient sound only while the timer runs.
  useEffect(() => {
    if (focus?.phase !== 'running') return;
    return startAmbient(ambient);
  }, [focus?.phase, ambient]);

  // Esc during setup just closes; while running it asks for the stop note.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (focus.phase === 'setup') setFocus(null);
      else if (focus.phase === 'running') setFocus({ ...focus, phase: 'stopping' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, setFocus]);

  if (!focus) return null;

  const cycleAmbient = () => {
    const next: Ambient = ambient === 'off' ? 'tick' : ambient === 'tick' ? 'brown' : 'off';
    setAmbient(next);
    try {
      localStorage.setItem(AMBIENT_KEY, next);
    } catch {
      // ignore
    }
  };

  const start = async (minutes: number) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { session, task: t } = await api.startFocus(focus.taskId, minutes);
      upsertTask(qc, t);
      setFocus({
        ...focus,
        phase: 'running',
        plannedMin: minutes,
        sessionId: session.id,
        startedAt: Date.parse(session.startedAt),
        extraMin: 0,
      });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t start the timer.');
    } finally {
      busy.current = false;
    }
  };

  const end = async (outcome: FocusOutcome, note?: string) => {
    if (busy.current || !focus.sessionId) return;
    busy.current = true;
    try {
      const res = await api.endFocus(focus.sessionId, outcome, note);
      upsertTask(qc, res.task);
      setStats(qc, res.stats);
      void qc.invalidateQueries({ queryKey: keys.task(focus.taskId) });
      void qc.invalidateQueries({ queryKey: keys.allTasks });
      setFocus(null);
      if (outcome === 'completed_task') celebrateCompletion(res.task.id, 1);
      else toast(`Logged ${res.session.actualMin ?? 0} focused min.`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t save the session.');
    } finally {
      busy.current = false;
    }
  };

  const AmbientIcon = ambient === 'off' ? VolumeX : ambient === 'tick' ? Volume1 : Waves;
  const ambientLabel = { off: 'Sound: off', tick: 'Sound: ticking', brown: 'Sound: brown noise' }[
    ambient
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      data-testid="focus"
      data-phase={focus.phase}
      className="bg-royal-grid lanes-fade fixed inset-0 z-40 flex flex-col overflow-y-auto px-10 py-8 text-on-royal"
    >
      <div className="flex items-center justify-between">
        <span className="type-label text-on-royal-2">Focus</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline-on-royal"
            size="sm"
            onClick={cycleAmbient}
            aria-label={ambientLabel}
          >
            <AmbientIcon className="size-4" aria-hidden="true" />
            {ambientLabel.replace('Sound: ', '')}
          </Button>
          {focus.phase === 'setup' && (
            <IconButton
              label="Close focus"
              variant="outline-on-royal"
              className="size-10"
              onClick={() => setFocus(null)}
            >
              <X className="size-5" aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-8 py-6">
        <UserText
          as="h2"
          text={task?.title ?? ' '}
          className={cn(
            'type-display m-0 max-w-5xl text-center leading-[1.02] break-words normal-case',
            titleSize(task?.title ?? '', focus.phase === 'setup'),
          )}
        />

        <AnimatePresence mode="popLayout" initial={false}>
          {focus.phase === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.12 } }}
              className="flex flex-col items-center gap-5"
            >
              <p className="m-0 text-on-royal-2">How long?</p>
              <div className="flex flex-wrap justify-center gap-3">
                {[...new Set([focus.plannedMin, ...PICKS])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <Button
                      key={m}
                      size="lg"
                      variant={m === focus.plannedMin ? 'yellow' : 'outline-on-royal'}
                      onClick={() => void start(m)}
                    >
                      {m} min
                    </Button>
                  ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Math.round(Number(custom));
                    if (n >= 1 && n <= 240) void start(n);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Custom"
                    aria-label="Custom minutes"
                    className="h-14 w-28 rounded-full border-[1.5px] border-on-royal-2 bg-transparent px-5 text-center text-base text-on-royal outline-none placeholder:text-on-royal-2 focus:border-yellow"
                  />
                </form>
              </div>
            </motion.div>
          )}

          {focus.phase === 'running' && (
            <motion.div
              key="running"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.12 } }}
              className="flex flex-col items-center justify-center gap-10 lg:flex-row lg:gap-14"
            >
              <Ring remaining={remaining} total={total} />
              {task && <Steps task={task} />}
            </motion.div>
          )}

          {focus.phase === 'timeup' && (
            <motion.div
              key="timeup"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.12 } }}
              className="flex flex-col items-center gap-6"
            >
              <p className="type-display m-0 text-[2.5rem] normal-case">
                Time. Where did you land?
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="yellow" size="lg" onClick={() => void end('completed_task')}>
                  <Check className="size-5" aria-hidden="true" /> Done
                </Button>
                <Button
                  variant="outline-on-royal"
                  size="lg"
                  onClick={() =>
                    setFocus({ ...focus, phase: 'running', extraMin: focus.extraMin + 5 })
                  }
                >
                  <Plus className="size-5" aria-hidden="true" /> 5 more min
                </Button>
                <Button
                  variant="outline-on-royal"
                  size="lg"
                  onClick={() => setFocus({ ...focus, phase: 'stopping' })}
                >
                  Stop here
                </Button>
              </div>
            </motion.div>
          )}

          {focus.phase === 'stopping' && (
            <motion.div
              key="stopping"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <div className="flex justify-center">
                <StopNote onSave={(note) => void end('stopped', note || undefined)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {focus.phase === 'running' && (
        <div className="flex flex-wrap justify-center gap-3" data-testid="focus-controls">
          <Button variant="yellow" size="lg" onClick={() => void end('completed_task')}>
            <Check className="size-5" aria-hidden="true" /> Done
          </Button>
          <Button
            variant="outline-on-royal"
            size="lg"
            onClick={() => setFocus({ ...focus, extraMin: focus.extraMin + 5 })}
          >
            <Plus className="size-5" aria-hidden="true" /> 5
          </Button>
          <Button
            variant="outline-on-royal"
            size="lg"
            onClick={() => setFocus({ ...focus, phase: 'stopping' })}
          >
            <Square className="size-4" aria-hidden="true" /> Stop
          </Button>
        </div>
      )}

      {focus.phase !== 'setup' && task && (
        <button
          type="button"
          onClick={() => openDrawer(task.id)}
          className="sr-only focus:not-sr-only focus:self-center focus:text-sm"
        >
          Open the task details
        </button>
      )}
    </div>
  );
}

/** Open Focus for a task (keyboard F, hero button, Pick for me "Let's go"). */
export function useStartFocus() {
  const setFocus = useUi((s) => s.setFocus);
  const current = useUi((s) => s.focus);
  return (task: Pick<Task, 'id' | 'estimateMin'>, minutes?: number) => {
    if (current && current.phase !== 'setup') {
      toast('A focus session is already running.');
      return;
    }
    setFocus({
      taskId: task.id,
      phase: 'setup',
      plannedMin: minutes ?? task.estimateMin ?? 25,
      extraMin: 0,
    });
  };
}
