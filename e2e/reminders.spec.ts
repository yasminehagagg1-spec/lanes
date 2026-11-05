import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

const DATA_DIR = path.resolve(import.meta.dirname, '../.data-e2e');
const auth = () => ({
  authorization: `Bearer ${fs.readFileSync(path.join(DATA_DIR, 'token'), 'utf8').trim()}`,
});
const unique = (label: string) => `${label} ${Math.random().toString(36).slice(2, 7)}`;
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function newTask(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/tasks', { headers: auth(), data });
  expect(res.status()).toBe(201);
  return (await res.json()).task as { id: string };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
});

test('a reminder rings in the open tab, and Snooze moves it to later', async ({
  page,
  request,
}) => {
  const title = unique('Call the printer');
  await newTask(request, {
    title,
    reminders: [{ fireAt: inSeconds(1), message: 'Ask about paper' }],
  });

  const toast = page.getByTestId('reminder-toast').filter({ hasText: title });
  await expect(toast).toBeVisible({ timeout: 5000 });
  await expect(toast).toContainText('Ask about paper');

  await toast.getByRole('button', { name: 'Snooze 15m' }).click();
  await expect(toast).toHaveCount(0);
  await expect(page.getByText(/Snoozed until/)).toBeVisible();

  await page.getByRole('button', { name: /^Reminders/ }).click();
  await expect(page.getByTestId('bell')).toContainText(title);
});

test('Done from the toast finishes the task', async ({ page, request }) => {
  const title = unique('Send the invoice');
  await newTask(request, { title, reminders: [{ fireAt: inSeconds(1) }] });
  const toast = page.getByTestId('reminder-toast').filter({ hasText: title });
  await expect(toast).toBeVisible({ timeout: 5000 });
  await toast.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Done lane' }).getByText(title)).toBeVisible();
});

test('reminders that land together are grouped into one toast', async ({ page, request }) => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const titles = [unique('Away 1'), unique('Away 2'), unique('Away 3')];
  // Create all three before the next tick so they fire together.
  await Promise.all(
    titles.map((title) => newTask(request, { title, reminders: [{ fireAt: past }] })),
  );
  const grouped = page
    .getByTestId('reminder-toast')
    .filter({ hasText: 'While you were away: 3 reminders' });
  await expect(grouped).toBeVisible({ timeout: 5000 });
  for (const t of titles) await expect(grouped).toContainText(t);
  await grouped.getByRole('button', { name: 'Got it' }).click();
  await expect(grouped).toHaveCount(0);
});

test('a postponed task comes back to New on its day, with a reminder', async ({
  page,
  request,
}) => {
  const title = unique('Learn Framer motion');
  // "Back on today" — the scheduler brings it back on its next tick.
  await newTask(request, { title, stage: 'postponed', resumeOn: localDate() });

  const toast = page.getByTestId('reminder-toast').filter({ hasText: title });
  await expect(toast).toBeVisible({ timeout: 5000 });
  await expect(toast).toContainText('Back from postponed');
  await expect(page.getByRole('region', { name: 'New lane' }).getByText(title)).toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss reminder' }).click();
});

test('a reminder that rang shows under "Rang today" in the bell until opened', async ({
  page,
  request,
}) => {
  const title = unique('Rang earlier');
  await newTask(request, { title, reminders: [{ fireAt: inSeconds(1) }] });
  await expect(page.getByTestId('reminder-toast').filter({ hasText: title })).toBeVisible({
    timeout: 5000,
  });
  await page.reload();
  await page.getByRole('button', { name: /^Reminders/ }).click();
  const bell = page.getByTestId('bell');
  await expect(bell).toContainText('Rang today');
  await bell.getByText(title).click();
  await expect(page.getByRole('dialog', { name: title })).toBeVisible();
});
