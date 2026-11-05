import { useState } from 'react';
import { BatteryFull, BatteryLow, BatteryMedium } from 'lucide-react';
import { motion } from 'motion/react';
import {
  dayWindow,
  nothingLight,
  rankTasks,
  smallestStep,
  type Energy,
  type Task,
} from '@lanes/shared';
import { Dialog } from '@/components/ui/overlays';
import { Button, cn, ProjectChip, UserText } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { dueLabel } from '@/lib/format';
import { useSettings, useTasks } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { useStartFocus } from '@/features/focus/FocusMode';

const MAX_SKIPS = 3;

type Step =
  | { kind: 'ask' }
  | { kind: 'dealt'; task: Task; reason: string; deal: number }
  | { kind: 'step'; task: Task; step: string }
  | { kind: 'top'; picks: { task: Task; reason: string }[] }
  | { kind: 'empty' };

const ENERGY: { value: Energy; label: string; Icon: typeof BatteryLow }[] = [
  { value: 'low', label: 'Low', Icon: BatteryLow },
  { value: 'medium', label: 'Medium', Icon: BatteryMedium },
  { value: 'high', label: 'High', Icon: BatteryFull },
];
const MINUTES = [15, 30, 60];

function DealtCard({ task, reason, deal }: { task: Task; reason: string; deal: number }) {
  const due = dueLabel(task);
  return (
    <motion.div
      key={`${task.id}-${deal}`}
      data-testid="dealt-card"
      initial={{ rotate: -10, y: 80, opacity: 0, scale: 0.92 }}
      animate={{ rotate: [-10, -3, 0], y: 0, opacity: 1, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 220,
        damping: 18,
        rotate: { duration: 0.7, times: [0, 0.45, 1] },
      }}
      className="flex flex-col gap-4 rounded-lg bg-surface p-7 text-left shadow-lift ring-1 ring-border"
    >
      <div className="flex items-center justify-between gap-2">
        {task.project ? (
          <ProjectChip name={task.project.name} color={task.project.color} />
        ) : (
          <span />
        )}
        {due && <span className="text-sm text-fg-2">{due}</span>}
      </div>
      <UserText as="h3" text={task.title} className="m-0 text-2xl leading-snug font-semibold" />
      <p className="m-0 text-sm text-fg-2">{reason}</p>
    </motion.div>
  );
}

function PickBody() {
  const close = () => useUi.getState().openPick(false);
  const startFocus = useStartFocus();
  const { data: tasks = [] } = useTasks();
  const { data: settings } = useSettings();
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'ask' });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const opts = () => ({
    now: new Date(),
    todayEnd: dayWindow(new Date(), settings?.dayStartHour ?? 6).end,
    ...(energy ? { energy } : {}),
    ...(minutes ? { minutes } : {}),
  });

  const deal = async (e: Energy, exclude: string[]) => {
    // Low energy and nothing light anywhere: offer one small step instead.
    if (e === 'low' && exclude.length === 0 && nothingLight(tasks)) {
      const small = smallestStep(tasks, { ...opts(), energy: e });
      if (small) {
        setStep({ kind: 'step', task: small.task, step: small.step.title });
        return;
      }
    }
    setLoading(true);
    try {
      const res = await api.pick({
        energy: e,
        ...(minutes ? { minutes } : {}),
        exclude,
      });
      if (res.task)
        setStep({ kind: 'dealt', task: res.task, reason: res.reason ?? '', deal: exclude.length });
      else if (exclude.length)
        setStep({ kind: 'top', picks: rankTasks(tasks, { ...opts(), energy: e }) });
      else setStep({ kind: 'empty' });
    } finally {
      setLoading(false);
    }
  };

  const choose = (e: Energy) => {
    setEnergy(e);
    setSkipped([]);
    void deal(e, []);
  };

  const skip = (task: Task) => {
    const next = [...skipped, task.id];
    setSkipped(next);
    if (next.length >= MAX_SKIPS) {
      setStep({ kind: 'top', picks: rankTasks(tasks, opts()) });
      return;
    }
    if (energy) void deal(energy, next);
  };

  const go = (task: Task, mins?: number) => {
    close();
    startFocus(task, mins ?? minutes ?? undefined);
  };

  if (step.kind === 'ask') {
    return (
      <div className="flex flex-col items-center gap-7 py-2">
        <div className="flex justify-center gap-5">
          {ENERGY.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              disabled={loading}
              onClick={() => choose(value)}
              className="group flex flex-col items-center gap-3"
            >
              <span className="flex size-28 items-center justify-center rounded-full bg-surface-sunk transition group-hover:bg-yellow group-focus-visible:ring-4 group-focus-visible:ring-royal">
                <Icon className="size-10" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <span className="font-semibold">{label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-fg-2">I have about</span>
          {MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              onClick={() => setMinutes(minutes === m ? null : m)}
              className={cn(
                'rounded-full border px-3 py-1.5 font-medium transition',
                minutes === m
                  ? 'border-charcoal bg-charcoal text-white'
                  : 'border-border hover:bg-surface-sunk',
              )}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step.kind === 'dealt') {
    return (
      <div className="flex flex-col gap-6">
        <DealtCard task={step.task} reason={step.reason} deal={step.deal} />
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => skip(step.task)} disabled={loading}>
            Not this one{skipped.length ? ` (${MAX_SKIPS - skipped.length} left)` : ''}
          </Button>
          <Button variant="yellow" size="lg" onClick={() => go(step.task)}>
            Let’s go
          </Button>
        </div>
      </div>
    );
  }

  if (step.kind === 'step') {
    return (
      <div className="flex flex-col gap-6">
        <div
          data-testid="dealt-card"
          className="flex flex-col gap-3 rounded-lg bg-surface-sunk p-7"
        >
          <span className="text-sm text-fg-2">
            Nothing on the board is light right now. Just one step:
          </span>
          <UserText as="h3" text={step.step} className="m-0 text-2xl font-semibold" />
          <span className="text-sm text-fg-2">
            from <UserText text={step.task.title} className="font-medium text-fg" />
          </span>
        </div>
        <div className="flex justify-end">
          <Button variant="yellow" size="lg" onClick={() => go(step.task, 10)}>
            Let’s go — 10 min
          </Button>
        </div>
      </div>
    );
  }

  if (step.kind === 'top') {
    return (
      <div className="flex flex-col gap-3" data-testid="top-picks">
        <p className="m-0 text-sm text-fg-2">
          Okay, you pick. Here are your top {step.picks.length}:
        </p>
        {step.picks.map(({ task, reason }) => (
          <button
            key={task.id}
            type="button"
            onClick={() => go(task)}
            className="flex flex-col gap-1 rounded-md bg-surface-sunk px-5 py-4 text-left transition hover:bg-yellow-200"
          >
            <UserText text={task.title} className="font-semibold" />
            <span className="text-sm text-fg-2">{reason}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <p className="m-0 text-fg-2">Nothing open right now. Enjoy the quiet.</p>
      <Button variant="ink" onClick={close}>
        Close
      </Button>
    </div>
  );
}

export function PickForMe() {
  const open = useUi((s) => s.pickOpen);
  const openPick = useUi((s) => s.openPick);
  return (
    <Dialog
      open={open}
      onOpenChange={openPick}
      title="How’s your energy?"
      description="One question, one task. Choosing is a task too."
      className="w-[min(92vw,560px)]"
    >
      <PickBody />
    </Dialog>
  );
}
