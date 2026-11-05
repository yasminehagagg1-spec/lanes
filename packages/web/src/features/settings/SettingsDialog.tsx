import { Minus, Plus, Volume2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PROJECT_COLORS, type Project, type ProjectColor, type Settings } from '@lanes/shared';
import { Dialog } from '@/components/ui/overlays';
import { Button, cn, IconButton } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/api';
import { playChime, playPop } from '@/lib/sounds';
import { keys, useProjects, useSettings } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { Field, fieldInput, Section, Segmented } from '@/features/task-drawer/fields';
import { ClaudeSettings, DataSettings } from './DataSettings';

function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.updateSettings(patch),
    onMutate: (patch) => {
      const prev = qc.getQueryData<Settings>(keys.settings);
      if (prev) qc.setQueryData(keys.settings, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _patch, context) => {
      if (context?.prev) qc.setQueryData(keys.settings, context.prev);
      toast(err instanceof ApiError ? err.message : 'Couldn’t save that setting.');
    },
    onSuccess: (settings) => {
      qc.setQueryData(keys.settings, settings);
      void qc.invalidateQueries({ queryKey: keys.stats });
      void qc.invalidateQueries({ queryKey: keys.allTasks });
    },
  });
}

const hourLabel = (h: number) => (h === 0 ? 'Midnight' : h === 12 ? 'Noon' : `${h}:00 am`);

const CELEBRATION_HELP: Record<Settings['celebration'], string> = {
  full: 'Stamp, confetti and sounds.',
  subtle: 'Stamp and the bar only. No confetti, no sound.',
  off: 'Just the numbers.',
};

function ProjectRow({ project }: { project: Project }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateProject>[1]) =>
      api.updateProject(project.id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.projects });
      void qc.invalidateQueries({ queryKey: keys.allTasks });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Couldn’t save that project.'),
  });

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-sm bg-surface p-3',
        project.archived && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <input
          defaultValue={project.name}
          key={project.name}
          dir="auto"
          aria-label={`Rename ${project.name}`}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== project.name) save.mutate({ name });
            else e.target.value = project.name;
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={cn(fieldInput, 'bg-surface-sunk font-medium')}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => save.mutate({ archived: !project.archived })}
        >
          {project.archived ? 'Restore' : 'Archive'}
        </Button>
      </div>
      <div role="radiogroup" aria-label={`Color for ${project.name}`} className="flex gap-1.5">
        {PROJECT_COLORS.map((c: ProjectColor) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={project.color === c}
            aria-label={c.replace('p-', '')}
            onClick={() => save.mutate({ color: c })}
            style={{ background: `var(--${c})` }}
            className={cn(
              'size-6 rounded-full transition',
              project.color === c ? 'ring-2 ring-charcoal ring-offset-2' : 'hover:scale-110',
            )}
          />
        ))}
      </div>
    </li>
  );
}

function SettingsBody() {
  const { data: settings } = useSettings();
  const { data: projects = [] } = useProjects();
  const save = useSaveSettings();
  if (!settings) return <p className="text-sm text-fg-2">Loading…</p>;
  const set = (patch: Partial<Settings>) => save.mutate(patch);

  return (
    <div className="flex max-h-[70vh] flex-col gap-7 overflow-y-auto pr-1 [&>*]:shrink-0">
      <Section title="You">
        <Field label="Name in the greeting">
          <input
            defaultValue={settings.displayName}
            key={settings.displayName}
            dir="auto"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== settings.displayName) set({ displayName: v });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className={cn(fieldInput, 'bg-surface-sunk')}
          />
        </Field>
      </Section>

      <Section title="Momentum">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Daily goal (tasks)">
            <div className="flex items-center gap-2">
              <IconButton
                label="Lower goal"
                variant="white"
                className="size-9"
                disabled={settings.dailyGoal <= 1}
                onClick={() => set({ dailyGoal: settings.dailyGoal - 1 })}
              >
                <Minus className="size-4" aria-hidden="true" />
              </IconButton>
              <span data-testid="goal" className="type-display tabular w-10 text-center text-2xl">
                {settings.dailyGoal}
              </span>
              <IconButton
                label="Raise goal"
                variant="white"
                className="size-9"
                disabled={settings.dailyGoal >= 50}
                onClick={() => set({ dailyGoal: settings.dailyGoal + 1 })}
              >
                <Plus className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
          </Field>
          <Field label="My day starts at">
            <select
              value={settings.dayStartHour}
              onChange={(e) => set({ dayStartHour: Number(e.target.value) })}
              className={cn(fieldInput, 'bg-surface-sunk')}
            >
              {Array.from({ length: 13 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                  {h === 6 ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="m-0 text-xs text-fg-3">
          Finishing something at 1am still counts for the day you were living in.
        </p>
        <Field label="Week starts on">
          <Segmented
            label="Week starts on"
            value={String(settings.weekStartsOn) as '6' | '0' | '1'}
            options={[
              { value: '6', label: 'Saturday' },
              { value: '0', label: 'Sunday' },
              { value: '1', label: 'Monday' },
            ]}
            onChange={(v) => set({ weekStartsOn: Number(v) })}
          />
        </Field>
      </Section>

      <Section title="Celebrations">
        <Segmented
          label="Celebration"
          value={settings.celebration}
          options={[
            { value: 'full', label: 'Full' },
            { value: 'subtle', label: 'Subtle' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(celebration) => set({ celebration })}
        />
        <p className="m-0 text-xs text-fg-2">
          {CELEBRATION_HELP[settings.celebration]} Reduced motion on your Mac always turns confetti
          off.
        </p>
        <div className="flex items-center justify-between gap-3 rounded-sm bg-surface-sunk px-4 py-3">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              role="switch"
              checked={settings.sounds}
              onChange={(e) => set({ sounds: e.target.checked })}
              className="size-4 accent-[var(--royal)]"
            />
            Sounds
          </label>
          <Button
            size="sm"
            variant="white"
            onClick={() => {
              playPop(1);
              setTimeout(playChime, 250);
            }}
          >
            <Volume2 className="size-4" aria-hidden="true" /> Test
          </Button>
        </div>
      </Section>

      <Section title="Projects">
        {projects.length === 0 ? (
          <p className="m-0 text-sm text-fg-3">Projects appear here when a task uses one.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </ul>
        )}
      </Section>

      <DataSettings />
      <ClaudeSettings />
    </div>
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const openSettings = useUi((s) => s.openSettings);
  return (
    <Dialog
      open={open}
      onOpenChange={openSettings}
      title="Settings"
      autoFocus={false}
      className="w-[min(92vw,520px)] bg-surface-sunk"
    >
      <SettingsBody />
    </Dialog>
  );
}
