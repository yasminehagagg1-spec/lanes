import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from '@lanes/shared';
import type { DB } from '../connection.js';

const KEYS: Record<keyof Settings, string> = {
  displayName: 'display_name',
  dailyGoal: 'daily_goal',
  dayStartHour: 'day_start_hour',
  sounds: 'sounds',
  celebration: 'celebration',
  theme: 'theme',
  weekStartsOn: 'week_starts_on',
};

export function getSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [field, key] of Object.entries(KEYS)) {
    const raw = stored.get(key);
    if (raw !== undefined) {
      try {
        merged[field] = JSON.parse(raw);
      } catch {
        // keep the default for a corrupt value
      }
    }
  }
  const parsed = SettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function saveSettings(db: DB, patch: Partial<Settings>): Settings {
  const next = SettingsSchema.parse({ ...getSettings(db), ...patch });
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  db.transaction(() => {
    for (const field of Object.keys(patch) as (keyof Settings)[]) {
      upsert.run(KEYS[field], JSON.stringify(next[field]));
    }
  })();
  return next;
}
