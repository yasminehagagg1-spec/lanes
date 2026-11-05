// Test helpers (excluded from the build).

/** Wednesday 4 Nov 2026, 10:00 in Cairo (UTC+2). */
export const NOW = new Date('2026-11-04T08:00:00.000Z');

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO → "YYYY-MM-DD HH:mm" in local time, for readable assertions. */
export function local(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
