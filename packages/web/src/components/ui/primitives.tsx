import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { STAGE_META, type ProjectColor, type Stage } from '@lanes/shared';
import { isArabic } from '@/lib/format';

export const cn = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

// ---------- buttons ----------

type Variant = 'ink' | 'royal' | 'yellow' | 'white' | 'ghost' | 'outline-on-royal';

const VARIANTS: Record<Variant, string> = {
  ink: 'bg-charcoal text-white hover:bg-charcoal/85',
  royal: 'bg-royal text-white hover:bg-royal-600',
  yellow: 'bg-yellow text-charcoal hover:brightness-95',
  white: 'bg-surface text-fg shadow-card hover:bg-surface-sunk',
  ghost: 'text-fg-2 hover:bg-surface-sunk hover:text-fg',
  'outline-on-royal': 'border-[1.5px] border-on-royal-2 text-on-royal hover:bg-white/10',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ink', size = 'md', className, type = 'button', ...props },
  ref,
) {
  const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-14 px-6 text-base' };
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition',
        'focus-visible:ring-ring outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});

/** Round 48px header-style button (ref 02). */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(
  function IconButton({ label, className, variant = 'white', type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          'relative inline-flex size-12 shrink-0 items-center justify-center rounded-full transition',
          'focus-visible:ring-ring outline-none focus-visible:ring-2',
          VARIANTS[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] px-1 font-sans text-[0.6875rem] font-semibold',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ---------- text ----------

/** User-entered text: direction follows the content, Arabic gets the Arabic font. */
export function UserText({
  text,
  as: Tag = 'span',
  className,
}: {
  text: string;
  as?: 'span' | 'p' | 'div' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <Tag dir="auto" lang={isArabic(text) ? 'ar' : undefined} className={className}>
      {text}
    </Tag>
  );
}

// ---------- stage + project marks ----------

export const stageColor = (stage: Stage) => `var(${STAGE_META[stage].token})`;

export function StageDot({ stage, className }: { stage: Stage; className?: string }) {
  const style = { '--dot': stageColor(stage) } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'inline-block size-3 shrink-0 rounded-full',
        stage === 'new' ? 'border-2 border-[var(--dot)]' : 'bg-[var(--dot)]',
        className,
      )}
    />
  );
}

export const projectStyle = (color: ProjectColor) =>
  ({ '--pc': `var(--${color})` }) as CSSProperties;

export function ProjectChip({
  name,
  color,
  className,
}: {
  name: string;
  color: ProjectColor;
  className?: string;
}) {
  return (
    <span
      style={projectStyle(color)}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        'bg-[color-mix(in_srgb,var(--pc)_12%,transparent)] text-fg',
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--pc)]" />
      <UserText text={name} className="truncate" />
    </span>
  );
}

/** Pill used for filters ("All projects ▾"). */
export const Pill = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(function Pill({ className, active, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium shadow-card transition',
        'focus-visible:ring-ring outline-none hover:bg-surface-sunk focus-visible:ring-2',
        active && 'ring-charcoal/80 ring-[1.5px]',
        className,
      )}
      {...props}
    />
  );
});
