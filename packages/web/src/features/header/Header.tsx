import { useEffect, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { Bell, Plus, Search } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn, IconButton, Kbd, UserText } from '@/components/ui/primitives';
import { dayLabel, timeLabel } from '@/lib/format';
import { useQueryClient } from '@tanstack/react-query';
import type { Reminder } from '@lanes/shared';
import { api } from '@/lib/api';
import { keys, useRang, useUpcoming } from '@/lib/queries';
import { useUi } from '@/lib/store';

function MenuGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M4 7h12M4 13h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AppMenu() {
  const clearFilters = useUi((s) => s.clearFilters);
  const setIncludeDone = useUi((s) => s.setIncludeDone);
  const openSettings = useUi((s) => s.openSettings);
  const item =
    'flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-sunk data-[disabled]:cursor-default data-[disabled]:text-fg-3';
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>
        <IconButton label="Menu">
          <MenuGlyph />
        </IconButton>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          sideOffset={8}
          align="start"
          className="lanes-pop z-50 min-w-52 rounded-md bg-surface p-1.5 shadow-lift"
        >
          <DropdownPrimitive.Item className={item} onSelect={clearFilters}>
            Clear filters and search
          </DropdownPrimitive.Item>
          <DropdownPrimitive.Item className={item} onSelect={() => setIncludeDone('all')}>
            Show every finished task
          </DropdownPrimitive.Item>
          <DropdownPrimitive.Item className={item} onSelect={() => openSettings(true)}>
            Settings
          </DropdownPrimitive.Item>
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

function ViewToggle() {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  return (
    <div
      role="tablist"
      aria-label="View"
      className="flex h-12 items-center rounded-full bg-surface p-1 shadow-card"
    >
      {(['board', 'list'] as const).map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={view === v}
          onClick={() => setView(v)}
          className={cn(
            'h-10 rounded-full px-4 text-sm font-medium capitalize transition',
            view === v ? 'bg-charcoal text-white' : 'text-fg-2 hover:text-fg',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function ReminderRow({
  reminder,
  onOpen,
}: {
  reminder: Reminder & { taskTitle: string };
  onOpen: () => void;
}) {
  const at = new Date(reminder.firedAt ?? reminder.fireAt);
  return (
    <li>
      <Popover.Close asChild>
        <button
          onClick={onOpen}
          className="flex w-full items-start gap-3 rounded-sm px-2 py-2 text-left hover:bg-surface-sunk"
        >
          <span className="tabular w-20 shrink-0 pt-0.5 text-xs text-fg-2">
            {dayLabel(at)}
            <br />
            {timeLabel(at)}
          </span>
          <span className="min-w-0">
            <UserText text={reminder.taskTitle} className="block text-sm" />
            {reminder.message && (
              <UserText text={reminder.message} className="block truncate text-xs text-fg-2" />
            )}
          </span>
        </button>
      </Popover.Close>
    </li>
  );
}

function ReminderBell() {
  const qc = useQueryClient();
  const { data: upcoming = [] } = useUpcoming();
  const { data: rang = [] } = useRang();
  const openDrawer = useUi((s) => s.openDrawer);
  const total = upcoming.length + rang.length;
  const open = (r: Reminder & { taskTitle: string }, dismiss: boolean) => () => {
    openDrawer(r.taskId);
    if (dismiss)
      void api
        .dismissReminder(r.id)
        .finally(() => qc.invalidateQueries({ queryKey: keys.reminders }));
  };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton
          label={`Reminders${rang.length ? `, ${rang.length} rang` : ''}${upcoming.length ? `, ${upcoming.length} upcoming` : ''}`}
        >
          <Bell className="size-5" aria-hidden="true" />
          {total > 0 && (
            <span
              data-testid="bell-dot"
              className="absolute top-3 right-3.5 size-2 rounded-full bg-scribble ring-2 ring-surface"
            />
          )}
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          data-testid="bell"
          className="lanes-pop z-50 w-80 rounded-md bg-surface p-3 shadow-lift outline-none"
        >
          {rang.length > 0 && (
            <>
              <div className="type-label px-2 pb-1 text-fg-2">Rang today</div>
              <ul className="m-0 mb-2 flex list-none flex-col p-0">
                {rang.map((r) => (
                  <ReminderRow key={r.id} reminder={r} onOpen={open(r, true)} />
                ))}
              </ul>
            </>
          )}
          <div className="type-label px-2 pb-1 text-fg-2">Next 24 hours</div>
          {upcoming.length === 0 ? (
            <p className="m-0 px-2 pb-2 text-sm text-fg-2">Nothing ringing soon. Quiet is fine.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {upcoming.map((r) => (
                <ReminderRow key={r.id} reminder={r} onOpen={open(r, false)} />
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SearchField() {
  const search = useUi((s) => s.search);
  const setSearch = useUi((s) => s.setSearch);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => ref.current?.focus();
    window.addEventListener('lanes:focus-search', focus);
    return () => window.removeEventListener('lanes:focus-search', focus);
  }, []);

  return (
    <label className="flex items-center gap-3">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface shadow-card">
        <Search className="size-5" aria-hidden="true" />
      </span>
      <input
        ref={ref}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setSearch('');
            e.currentTarget.blur();
          }
        }}
        placeholder="Search tasks"
        aria-label="Search tasks"
        dir="auto"
        className="w-32 bg-transparent text-sm outline-none placeholder:text-fg-3 focus:w-44 transition-[width]"
      />
      <Kbd className="border border-border bg-surface text-fg-3">/</Kbd>
    </label>
  );
}

export function Header() {
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <AppMenu />
        <Logo />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ViewToggle />
        <IconButton label="Add a task (N)" onClick={() => openQuickAdd('new')}>
          <Plus className="size-5" aria-hidden="true" />
        </IconButton>
        <ReminderBell />
        <SearchField />
      </div>
    </header>
  );
}
