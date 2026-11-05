import { useRef, useState, type ChangeEvent } from 'react';
import { Download, FolderOpen, HardDriveDownload, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, cn } from '@/components/ui/primitives';
import { api, ApiError, type ClaudeStatus, type ImportResult } from '@/lib/api';
import { Section } from '@/features/task-drawer/fields';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const stamp = (iso: string) =>
  `${DAY.format(new Date(iso))}, ${TIME.format(new Date(iso)).toLowerCase()}`;
const kb = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : stamp(iso);
}

const failed = (err: unknown, fallback: string) =>
  toast(err instanceof ApiError ? err.message : fallback);

// ---------- import ----------

interface Picked {
  name: string;
  data: unknown;
  summary: string;
}

function summarize(data: unknown): string | null {
  const d = data as {
    app?: string;
    tasks?: unknown[];
    projects?: unknown[];
    exportedAt?: string;
  } | null;
  if (d?.app !== 'lanes' || !Array.isArray(d.tasks)) return null;
  const when = d.exportedAt ? ` · exported ${stamp(d.exportedAt)}` : '';
  return `${d.tasks.length} tasks · ${d.projects?.length ?? 0} projects${when}`;
}

function ImportControl() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const run = useMutation({
    mutationFn: ({ mode, data }: { mode: 'replace' | 'merge'; data: unknown }) =>
      api.importData(mode, data),
    onSuccess: (r: ImportResult) => {
      void qc.invalidateQueries();
      const skipped = r.skipped ? `, ${r.skipped} already here` : '';
      toast(`Imported: ${r.added.tasks} tasks added${skipped}. A backup was saved first.`);
      setPicked(null);
      setConfirmReplace(false);
    },
    onError: (err) => failed(err, 'Couldn’t import that file.'),
  });

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast('That file isn’t a Lanes export.');
      return;
    }
    const summary = summarize(data);
    if (!summary) {
      toast('That file isn’t a Lanes export.');
      return;
    }
    setConfirmReplace(false);
    setPicked({ name: file.name, data, summary });
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Lanes export file"
        onChange={(e) => void onFile(e)}
      />
      <Button variant="white" size="sm" onClick={() => input.current?.click()}>
        <Upload className="size-4" aria-hidden="true" /> Import…
      </Button>
      {picked && (
        <div
          data-testid="import-panel"
          className="flex basis-full flex-col gap-3 rounded-sm bg-surface p-4"
        >
          <div>
            <div className="text-sm font-semibold break-all">{picked.name}</div>
            <div className="text-xs text-fg-2">{picked.summary}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="royal"
              disabled={run.isPending}
              onClick={() => run.mutate({ mode: 'merge', data: picked.data })}
            >
              Add to this board
            </Button>
            {confirmReplace ? (
              <Button
                size="sm"
                variant="ink"
                disabled={run.isPending}
                onClick={() => run.mutate({ mode: 'replace', data: picked.data })}
                className="bg-destructive hover:bg-destructive/85"
              >
                Yes, replace everything
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmReplace(true)}>
                Replace everything…
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
              Cancel
            </Button>
          </div>
          <p className="m-0 text-xs text-fg-3">
            {confirmReplace
              ? 'Everything on this board is swapped for the file. A backup is saved first, so it can be undone.'
              : 'Adding keeps everything here and skips anything already on the board.'}
          </p>
        </div>
      )}
    </>
  );
}

// ---------- data ----------

export function DataSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['backups'], queryFn: api.backups });
  const backup = useMutation({
    mutationFn: api.backupNow,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['backups'] });
      toast('Backup saved.');
    },
    onError: (err) => failed(err, 'Couldn’t save a backup.'),
  });
  const open = useMutation({
    mutationFn: api.openDataFolder,
    onError: (err) => failed(err, 'Couldn’t open the folder.'),
  });
  const backups = data?.backups ?? [];

  return (
    <Section title="Your data">
      <p className="m-0 text-xs text-fg-2">
        Everything lives on this Mac in one file. A copy is saved every day; the last 14 are kept.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href="/api/data/export"
          download
          className="inline-flex h-8 items-center gap-2 rounded-full bg-surface px-3 text-sm font-medium shadow-card transition hover:bg-surface-sunk"
        >
          <Download className="size-4" aria-hidden="true" /> Export
        </a>
        <ImportControl />
      </div>

      <div className="flex flex-col gap-2 rounded-sm bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Backups</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => backup.mutate()}
              disabled={backup.isPending}
            >
              <HardDriveDownload className="size-4" aria-hidden="true" /> Back up now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => open.mutate()}>
              <FolderOpen className="size-4" aria-hidden="true" /> Open folder
            </Button>
          </div>
        </div>
        {backups.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs" data-testid="backups">
            {backups.slice(0, 5).map((b) => (
              <li key={b.name} className="flex justify-between gap-3 text-fg-2">
                <span>
                  {stamp(b.createdAt)}
                  {b.kind !== 'daily' && (
                    <span className="text-fg-3">
                      {' '}
                      · {b.kind === 'manual' ? 'by hand' : 'before an import'}
                    </span>
                  )}
                </span>
                <span className="tabular text-fg-3">{kb(b.size)}</span>
              </li>
            ))}
            {backups.length > 5 && (
              <li className="text-fg-3">+{backups.length - 5} older in the folder</li>
            )}
          </ul>
        ) : (
          <p className="m-0 text-xs text-fg-3">The first one is saved when Lanes starts.</p>
        )}
        {data?.dataDir && (
          <code className="mt-1 text-[0.6875rem] break-all text-fg-3">{data.dataDir}</code>
        )}
      </div>
    </Section>
  );
}

// ---------- Claude ----------

function StatusRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: boolean | null;
  detail: string;
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        aria-hidden="true"
        className={cn(
          'size-2.5 shrink-0 rounded-full',
          state ? 'bg-stage-done' : state === false ? 'bg-stage-pending' : 'bg-fg-3/40',
        )}
      />
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-xs text-fg-2">{detail}</span>
    </li>
  );
}

const connected = (s: boolean | null) =>
  s === null ? 'Not installed' : s ? 'Connected' : 'Not connected';

export function ClaudeSettings() {
  const { data: s } = useQuery<ClaudeStatus>({
    queryKey: ['claude-status'],
    queryFn: api.claudeStatus,
  });
  if (!s) return null;
  const allSet = (s.desktop || s.code) && s.skill;
  return (
    <Section title="Claude">
      <ul
        className="m-0 flex list-none flex-col gap-2.5 rounded-sm bg-surface p-4"
        data-testid="claude-status"
      >
        <StatusRow label="Claude desktop app" state={s.desktop} detail={connected(s.desktop)} />
        <StatusRow label="Claude Code" state={s.code} detail={connected(s.code)} />
        <StatusRow
          label="/task skill in Claude Code"
          state={s.skill}
          detail={s.skill ? 'Installed' : 'Not installed'}
        />
        <StatusRow
          label="Last call from Claude"
          state={s.lastSeenAt ? true : null}
          detail={s.lastSeenAt ? ago(s.lastSeenAt) : 'Not since Lanes started'}
        />
      </ul>
      <p className="m-0 text-xs text-fg-2">
        {allSet ? 'Type ' : 'To connect, run '}
        <code className="rounded bg-surface px-1.5 py-0.5">
          {allSet ? '/task …' : 'scripts/connect-claude.sh'}
        </code>
        {allSet ? ' in Claude to add a task.' : ' in the lanes folder.'} The key Claude uses lives
        in <code className="break-all">{s.tokenPath}</code>.
      </p>
    </Section>
  );
}
