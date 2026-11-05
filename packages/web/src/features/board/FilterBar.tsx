import { ChevronDown, X } from 'lucide-react';
import type { Energy, Priority, TaskSource } from '@lanes/shared';
import { Menu, type MenuOption } from '@/components/ui/overlays';
import { Pill } from '@/components/ui/primitives';
import { useProjects } from '@/lib/queries';
import { useUi, type DueFilter, type Filters } from '@/lib/store';

const ANY = '__any' as const;
type Any = typeof ANY;

const DUE: MenuOption<DueFilter | Any>[] = [
  { value: ANY, label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'overdue', label: 'Overdue' },
];
const DUE_LABEL: Record<DueFilter, string> = {
  today: 'today',
  week: 'this week',
  overdue: 'overdue',
};

const ENERGY: MenuOption<Energy | Any>[] = [
  { value: ANY, label: 'Any energy' },
  { value: 'low', label: 'Low energy' },
  { value: 'medium', label: 'Medium energy' },
  { value: 'high', label: 'High energy' },
];
const PRIORITY: MenuOption<Priority | Any>[] = [
  { value: ANY, label: 'Any priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];
const SOURCE: MenuOption<TaskSource | Any>[] = [
  { value: ANY, label: 'From anywhere' },
  { value: 'claude', label: '✳ Added by Claude' },
  { value: 'quick_capture', label: 'Quick capture' },
  { value: 'manual', label: 'Added by hand' },
];

function FilterMenu<K extends keyof Filters>({
  name,
  options,
  label,
}: {
  name: K;
  options: MenuOption<NonNullable<Filters[K]> | Any>[];
  label: (value: NonNullable<Filters[K]>) => string;
}) {
  const value = useUi((s) => s.filters[name]);
  const setFilter = useUi((s) => s.setFilter);
  const fallback = options[0]?.label;
  return (
    <span className="relative inline-flex">
      <Menu
        options={options}
        value={(value ?? ANY) as NonNullable<Filters[K]> | Any}
        onSelect={(v) => setFilter(name, (v === ANY ? null : v) as Filters[K])}
        trigger={
          <Pill active={value !== null} className={value !== null ? 'pr-9' : undefined}>
            {value !== null ? label(value as NonNullable<Filters[K]>) : fallback}
            {value === null && <ChevronDown className="size-4" aria-hidden="true" />}
          </Pill>
        }
      />
      {value !== null && (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={() => setFilter(name, null as Filters[K])}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-3 hover:text-fg"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

export function FilterBar() {
  const view = useUi((s) => s.view);
  const includeDone = useUi((s) => s.includeDone);
  const setIncludeDone = useUi((s) => s.setIncludeDone);
  const { data: projects = [] } = useProjects();

  const projectOptions: MenuOption<string>[] = [
    { value: ANY, label: 'All projects' },
    ...projects
      .filter((p) => !p.archived)
      .map((p) => ({
        value: p.id,
        label: (
          <>
            <span className="size-2 rounded-full" style={{ background: `var(--${p.color})` }} />
            {p.name}
          </>
        ),
      })),
  ];
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Project';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="m-0 mr-3 text-[1.5rem] font-bold capitalize">{view}</h2>
      <FilterMenu name="projectId" options={projectOptions} label={(id) => projectName(id)} />
      <FilterMenu name="due" options={DUE} label={(v) => `Due: ${DUE_LABEL[v]}`} />
      <FilterMenu
        name="energy"
        options={ENERGY}
        label={(v) => `${v[0]?.toUpperCase()}${v.slice(1)} energy`}
      />
      <FilterMenu
        name="priority"
        options={PRIORITY}
        label={(v) => `${v[0]?.toUpperCase()}${v.slice(1)} priority`}
      />
      <FilterMenu
        name="source"
        options={SOURCE}
        label={(v) => SOURCE.find((o) => o.value === v)?.label as string}
      />

      <div className="ml-auto">
        <Menu
          align="end"
          options={[
            { value: 'today', label: 'Done: today' },
            { value: 'all', label: 'Done: all time' },
          ]}
          value={includeDone}
          onSelect={setIncludeDone}
          trigger={
            <Pill>
              Done: {includeDone === 'today' ? 'today' : 'all time'}
              <ChevronDown className="size-4" aria-hidden="true" />
            </Pill>
          }
        />
      </div>
    </div>
  );
}
