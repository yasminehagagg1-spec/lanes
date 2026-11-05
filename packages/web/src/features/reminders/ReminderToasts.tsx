import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Reminder, Task } from '@lanes/shared';
import { cn, UserText } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { dueLabel, timeLabel } from '@/lib/format';
import { keys, useMoveTask } from '@/lib/queries';
import { useUi } from '@/lib/store';

export interface FiredReminder {
  reminder: Reminder;
  task: Task;
}

const bodyText = ({ reminder, task }: FiredReminder) =>
  reminder.message ||
  (task.dueAt ? `Due ${dueLabel(task)?.toLowerCase()}` : task.project?.name) ||
  'Reminder';

function Action({
  children,
  onClick,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 rounded-full px-3 text-sm font-semibold transition',
        primary ? 'bg-yellow text-charcoal hover:brightness-95' : 'text-yellow hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

function useReminderActions() {
  const qc = useQueryClient();
  const move = useMoveTask();
  const openDrawer = useUi((s) => s.openDrawer);
  const refresh = () => void qc.invalidateQueries({ queryKey: keys.reminders });
  const dismiss = (id: string) => void api.dismissReminder(id).finally(refresh);

  return {
    dismiss,
    open: (item: FiredReminder) => {
      openDrawer(item.task.id);
      dismiss(item.reminder.id);
    },
    done: (item: FiredReminder) => {
      if (item.task.stage !== 'done') move.mutate({ id: item.task.id, stage: 'done' });
      dismiss(item.reminder.id);
    },
    snooze: (item: FiredReminder, minutes: number) =>
      void api
        .snoozeReminder(item.reminder.id, minutes)
        .then((r) => toast(`Snoozed until ${timeLabel(new Date(r.fireAt))}.`))
        .catch(() => toast('Couldn’t snooze that reminder.'))
        .finally(refresh),
  };
}

function Shell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      role="alert"
      data-testid="reminder-toast"
      className="relative w-[min(92vw,480px)] rounded-[24px] bg-charcoal p-4 pr-12 text-white shadow-lift"
    >
      <button
        type="button"
        aria-label="Dismiss reminder"
        onClick={onClose}
        className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}

export function ReminderToast({
  toastId,
  item,
}: {
  toastId: string | number;
  item: FiredReminder;
}) {
  const a = useReminderActions();
  const close = (fn: () => void) => () => {
    fn();
    toast.dismiss(toastId);
  };
  return (
    <Shell onClose={close(() => a.dismiss(item.reminder.id))}>
      <div className="flex gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-yellow" aria-hidden="true" />
        <div className="min-w-0">
          <UserText text={item.task.title} className="block font-semibold" />
          <UserText text={bodyText(item)} className="block text-sm text-white/70" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1 pl-7">
        <Action onClick={close(() => a.open(item))}>Open task</Action>
        <Action onClick={close(() => a.snooze(item, 15))}>Snooze 15m</Action>
        <Action onClick={close(() => a.snooze(item, 60))}>Snooze 1h</Action>
        {item.task.stage !== 'done' && (
          <Action primary onClick={close(() => a.done(item))}>
            Done
          </Action>
        )}
      </div>
    </Shell>
  );
}

/** "While you were away: 3 reminders" — one toast instead of a pile. */
export function GroupedReminderToast({
  toastId,
  items,
}: {
  toastId: string | number;
  items: FiredReminder[];
}) {
  const a = useReminderActions();
  const dismissAll = () => {
    for (const i of items) a.dismiss(i.reminder.id);
    toast.dismiss(toastId);
  };
  return (
    <Shell onClose={dismissAll}>
      <div className="flex gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-yellow" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">While you were away: {items.length} reminders</div>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {items.slice(0, 5).map((item) => (
              <li key={item.reminder.id}>
                <button
                  type="button"
                  onClick={() => a.open(item)}
                  className="w-full truncate rounded-sm py-0.5 text-left text-sm text-white/80 hover:text-white"
                >
                  <UserText text={item.task.title} />
                </button>
              </li>
            ))}
            {items.length > 5 && (
              <li className="text-sm text-white/50">+{items.length - 5} more in the bell</li>
            )}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex gap-1 pl-7">
        <Action primary onClick={dismissAll}>
          Got it
        </Action>
      </div>
    </Shell>
  );
}

// ---------- queue: reminders that land together are grouped ----------

const GROUP_WINDOW_MS = 1200;
/** Custom toasts draw their own card; drop the default charcoal pill around them. */
const BARE = { toast: 'bg-transparent! p-0! shadow-none! rounded-none!' };
let pending: FiredReminder[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  const items = pending;
  pending = [];
  flushTimer = null;
  if (items.length > 2) {
    toast.custom((id) => <GroupedReminderToast toastId={id} items={items} />, {
      id: `rem-group-${items[0]?.reminder.id}`,
      duration: Infinity,
      classNames: BARE,
    });
    return;
  }
  for (const item of items) {
    toast.custom((id) => <ReminderToast toastId={id} item={item} />, {
      id: `rem-${item.reminder.id}`,
      duration: Infinity,
      classNames: BARE,
    });
  }
}

/** Called for every `reminder.fired` event from the server. */
export function showReminder(item: FiredReminder) {
  pending.push(item);
  if (!flushTimer) flushTimer = setTimeout(flush, GROUP_WINDOW_MS);
}
