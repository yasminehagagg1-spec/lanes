import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const DATA_DIR = path.resolve(import.meta.dirname, '../.data-e2e');
const auth = () => ({
  authorization: `Bearer ${fs.readFileSync(path.join(DATA_DIR, 'token'), 'utf8').trim()}`,
});
const unique = (label: string) => `${label} ${Math.random().toString(36).slice(2, 7)}`;

async function newTask(request: APIRequestContext, title: string) {
  const res = await request.post('/api/tasks', { headers: auth(), data: { title } });
  expect(res.status()).toBe(201);
}

async function settings(request: APIRequestContext, patch: Record<string, unknown>) {
  const res = await request.patch('/api/settings', { headers: auth(), data: patch });
  expect(res.ok()).toBe(true);
}

/** Focus the card and press 4 (Done). */
async function finish(page: Page, title: string) {
  const card = page.locator('[data-task-id]').filter({ hasText: title }).first();
  await card.focus();
  await page.keyboard.press('4');
  return card;
}

test.afterEach(async ({ request }) => {
  await settings(request, { dailyGoal: 5, celebration: 'full', sounds: true });
});

test('finishing a task stamps the card and rolls the number', async ({ page, request }) => {
  const title = unique('Stamp me');
  await newTask(request, title);
  await page.goto('/');
  const before = await page
    .getByTestId('momentum')
    .getByRole('img')
    .first()
    .getAttribute('aria-label');

  const card = await finish(page, title);
  await expect(card.locator('[data-stamped]')).toBeVisible();
  await expect(page.getByTestId('momentum').getByRole('img').first()).not.toHaveAttribute(
    'aria-label',
    before ?? '',
  );
});

test('two finishes within 10 minutes show a combo chip', async ({ page, request }) => {
  const a = unique('Combo A');
  const b = unique('Combo B');
  await newTask(request, a);
  await newTask(request, b);
  await page.goto('/');
  await finish(page, a);
  await finish(page, b);
  await expect(page.getByTestId('combo')).toContainText(/×\d+ combo/);
});

test('hitting the goal swaps the hero to DONE FOR TODAY', async ({ page, request }) => {
  const stats = await (await request.get('/api/stats/today', { headers: auth() })).json();
  await settings(request, { dailyGoal: Math.floor(stats.points) + 1 });
  const title = unique('The last one');
  await newTask(request, title);
  await page.goto('/');
  await expect(page.getByTestId('hero-title')).toContainText(/today/i);
  await expect(page.getByTestId('hero-title')).not.toContainText(/done/i);

  await finish(page, title);
  await expect(page.getByTestId('hero-title')).toContainText(/done/i);
  await expect(page.getByTestId('momentum')).toHaveAttribute('data-level', '4');
});

test('going past the goal fills the overdrive layer', async ({ page, request }) => {
  await settings(request, { dailyGoal: 1 });
  await page.goto('/');
  await expect(page.getByTestId('overdrive')).toBeVisible();
});

test('the streak sticker opens a 30-day heatmap', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /day streak/ }).click();
  await expect(page.getByTestId('heatmap').locator('li')).toHaveCount(30);
});

test('settings: raising the goal updates the momentum card', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByTestId('goal')).toHaveText('5');
  await dialog.getByRole('button', { name: 'Raise goal' }).click();
  await expect(dialog.getByTestId('goal')).toHaveText('6');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('momentum')).toContainText('Goal 6');
});

test('celebration off: no stamp, bar still updates', async ({ page, request }) => {
  await settings(request, { celebration: 'off' });
  const title = unique('Quiet finish');
  await newTask(request, title);
  await page.goto('/');
  const card = await finish(page, title);
  await expect(page.getByRole('region', { name: 'Done lane' }).getByText(title)).toBeVisible();
  await expect(card.locator('[data-stamped]')).toHaveCount(0);
});
