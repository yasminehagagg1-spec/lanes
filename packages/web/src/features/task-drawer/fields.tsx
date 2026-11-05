import { useEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/components/ui/primitives';

export const fieldInput =
  'w-full rounded-sm border border-transparent bg-surface px-3 py-2 text-sm outline-none transition focus:border-royal';

export function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="type-label m-0 text-fg-2">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-fg-2">{label}</span>
      {children}
    </label>
  );
}

/** Text that saves when you leave it (or press Enter, for single-line fields). */
export function CommitText({
  value,
  onCommit,
  multiline = false,
  allowEmpty = true,
  className,
  ...rest
}: {
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  allowEmpty?: boolean;
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Follow outside changes (SSE, another tab) unless you're typing here.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  // Auto-grow.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const commit = () => {
    const next = multiline ? draft : draft.replace(/\s+/g, ' ').trim();
    if (!allowEmpty && !next.trim()) {
      setDraft(value);
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      dir="auto"
      value={draft}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setDraft(value);
        }
      }}
      className={cn('resize-none overflow-hidden', className)}
      {...rest}
    />
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 flex-1 rounded-full px-2 text-xs font-medium transition',
            o.value === value ? 'bg-charcoal text-white' : 'text-fg-2 hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
