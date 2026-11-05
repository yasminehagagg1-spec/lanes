import { useState, type FormEvent } from 'react';
import { localDateKey } from '@lanes/shared';
import { Dialog } from '@/components/ui/overlays';
import { Button, cn } from '@/components/ui/primitives';
import { useMoveTask } from '@/lib/queries';
import { useUi, type HeldMove } from '@/lib/store';

const inputClass =
  'w-full rounded-sm border border-border bg-surface-sunk px-4 py-3 text-base outline-none focus:border-royal focus:bg-surface';

function PendingSheet() {
  const held = useUi((s) => (s.held?.stage === 'pending' ? s.held : null));
  const hold = useUi((s) => s.hold);
  return (
    <Dialog
      open={!!held}
      onOpenChange={(open) => !open && hold(null)}
      title="What’s it waiting on?"
      description="A person, a file, a decision. It shows on the card until it moves on."
    >
      {held && <PendingForm key={held.id} held={held} />}
    </Dialog>
  );
}

function PendingForm({ held }: { held: HeldMove }) {
  const hold = useUi((s) => s.hold);
  const move = useMoveTask();
  const [reason, setReason] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    move.mutate({ ...held, pendingReason: reason.trim() });
    hold(null);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input
        autoFocus
        dir="auto"
        aria-label="Waiting on"
        placeholder="Their final prices"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className={inputClass}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => hold(null)}>
          Cancel
        </Button>
        <Button type="submit" variant="ink" disabled={!reason.trim()}>
          Move to Pending
        </Button>
      </div>
    </form>
  );
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

function PostponeSheet() {
  const held = useUi((s) => (s.held?.stage === 'postponed' ? s.held : null));
  const hold = useUi((s) => s.hold);
  return (
    <Dialog
      open={!!held}
      onOpenChange={(open) => !open && hold(null)}
      title="Not now isn’t never."
      description="When should it come back? It returns to New on that day."
    >
      {held && <PostponeForm key={held.id} held={held} />}
    </Dialog>
  );
}

function PostponeForm({ held }: { held: HeldMove }) {
  const hold = useUi((s) => s.hold);
  const move = useMoveTask();
  const [date, setDate] = useState('');

  const nextMonth = () => {
    const d = new Date();
    return localDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };
  const presets = [
    { label: 'Tomorrow', value: addDays(1) },
    { label: 'Next week', value: addDays(7) },
    { label: 'Next month', value: nextMonth() },
  ];

  const commit = (resumeOn: string | null) => {
    move.mutate({ ...held, resumeOn });
    hold(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setDate(p.value)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition',
              date === p.value
                ? 'border-charcoal bg-charcoal text-white'
                : 'border-border hover:bg-surface-sunk',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        aria-label="Bring it back on"
        value={date}
        min={addDays(1)}
        onChange={(e) => setDate(e.target.value)}
        className={inputClass}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => hold(null)}>
          Cancel
        </Button>
        <Button variant="white" onClick={() => commit(null)}>
          No date
        </Button>
        <Button variant="ink" disabled={!date} onClick={() => commit(date)}>
          Postpone
        </Button>
      </div>
    </div>
  );
}

export function StageSheets() {
  return (
    <>
      <PendingSheet />
      <PostponeSheet />
    </>
  );
}
