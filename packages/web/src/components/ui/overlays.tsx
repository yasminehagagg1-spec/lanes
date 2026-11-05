import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from './primitives';

// ---------- centered dialog ----------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  autoFocus = true,
  hideTitle = false,
  placement = 'center',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** False: focus the dialog itself instead of its first field. */
  autoFocus?: boolean;
  /** Keep the title for screen readers only (e.g. the quick capture bar). */
  hideTitle?: boolean;
  /** 'top' sits under the header like a command bar. */
  placement?: 'center' | 'top';
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="lanes-fade fixed inset-0 z-40 bg-charcoal/30 backdrop-blur-[6px]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={autoFocus ? undefined : (e) => e.preventDefault()}
          className={cn(
            'lanes-pop fixed left-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2',
            placement === 'top' ? 'top-[16vh]' : 'top-1/2 -translate-y-1/2',
            'rounded-lg bg-surface p-7 shadow-lift outline-none',
            className,
          )}
        >
          <DialogPrimitive.Title className={hideTitle ? 'sr-only' : 'm-0 text-xl font-semibold'}>
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1 mb-0 text-sm text-fg-2">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className={hideTitle ? undefined : 'mt-5'}>{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------- right-side sheet (task drawer) ----------

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="lanes-fade fixed inset-0 z-30 bg-charcoal/20" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'lanes-slide fixed inset-y-0 right-0 z-30 flex w-[min(100vw,var(--drawer-w))] flex-col',
            'rounded-l-lg bg-surface shadow-lift outline-none',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const SheetClose = DialogPrimitive.Close;

// ---------- dropdown menu ----------

export interface MenuOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function Menu<T extends string>({
  trigger,
  options,
  value,
  onSelect,
  align = 'start',
}: {
  trigger: ReactNode;
  options: MenuOption<T>[];
  value: T | null;
  onSelect: (value: T) => void;
  align?: 'start' | 'end';
}) {
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          align={align}
          sideOffset={8}
          className="lanes-pop z-50 min-w-48 rounded-md bg-surface p-1.5 shadow-lift outline-none"
        >
          {options.map((o) => (
            <DropdownPrimitive.Item
              key={o.value}
              onSelect={() => onSelect(o.value)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm outline-none',
                'data-[highlighted]:bg-surface-sunk',
              )}
            >
              <span className="flex items-center gap-2">{o.label}</span>
              {o.value === value && <Check className="size-4 text-royal" aria-hidden="true" />}
            </DropdownPrimitive.Item>
          ))}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}
