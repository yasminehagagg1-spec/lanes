import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const DATA_DIR = path.resolve(import.meta.dirname, '../.data-e2e');
const auth = () => ({
  authorization: `Bearer ${fs.readFileSync(path.join(DATA_DIR, 'token'), 'utf8').trim()}`,
});
const unique = (label: string) => `${label} ${Math.random().toString(36).slice(2, 7)}`;

async function newTask(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/tasks', { headers: auth(), data });
  expect(res.status()).toBe(201);
  return (await res.json()).task as { id: string };
}

const card = (page: Page, title: string) =>
  page.locator('[data-task-id]').filter({ hasText: title }).first();
const lane = (page: Page, name: string) => page.getByRole('region', { name: `${name} lane` });

// ---------- quick capture ----------

test('quick capture: chips, remove a chip, brain-dump several lines', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const bar = page.getByTestId('capture');
  const input = bar.getByRole('textbox', { name: 'Task' });

  const a = unique('Moodboard');
  const b = unique('Logo sketches');
  await input.fill(`${a} #Kitebird !high tomorrow 3pm`);
  const preview = bar.getByTestId('capture-preview').first();
  await expect(preview).toContainText('#Kitebird');
  await expect(preview).toContainText('!high');
  await expect(preview).toContainText('Due Tomorrow 3:00 pm');

  // Click the priority chip to drop it.
  await preview.getByRole('button', { name: /!high/ }).click();
  await expect(preview).not.toContainText('!high');

  await input.press('Shift+Enter');
  await input.pressSequentially(`${b} ~low`);
  await expect(bar.getByTestId('capture-count')).toHaveText('2 tasks');
  await input.press('Enter');

  // Stays open for the next one.
  await expect(bar.getByTestId('capture-added')).toContainText('Added 2');
  await expect(input).toHaveValue('');
  await page.keyboard.press('Escape');

  await expect(card(page, a)).toContainText('Kitebird');
  await expect(card(page, a).getByTitle('High priority')).toHaveCount(0);
  await expect(card(page, b)).toContainText('~ low energy');
});

test('quick capture: ⌘Enter adds and opens the task', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('n');
  const title = unique('Open me');
  const input = page.getByTestId('capture').getByRole('textbox', { name: 'Task' });
  await input.fill(title);
  await input.press('ControlOrMeta+Enter');
  await expect(page.getByRole('dialog', { name: title })).toBeVisible();
});

test('quick capture: "?" searches and jumps to a task', async ({ page, request }) => {
  const title = unique('Findable invoice');
  await newTask(request, { title });
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const bar = page.getByTestId('capture');
  await bar.getByRole('textbox').fill(`?${title}`);
  await expect(bar).toHaveAttribute('data-mode', 'search');
  await bar.getByRole('textbox').press('Enter');
  await expect(page.getByRole('dialog', { name: title })).toBeVisible();
});

// ---------- focus ----------

test('focus: F on a card, timer runs, tab title counts down, Stop logs a note', async ({
  page,
  request,
}) => {
  const title = unique('Deep work');
  await newTask(request, { title, estimateMin: 10 });
  await page.goto('/');
  await card(page, title).focus();
  await page.keyboard.press('f');

  const focus = page.getByTestId('focus');
  await expect(focus).toHaveAttribute('data-phase', 'setup');
  await expect(focus).toContainText(title);
  await focus.getByRole('button', { name: '10 min' }).click();

  await expect(focus).toHaveAttribute('data-phase', 'running');
  await expect(page.getByTestId('focus-clock')).toHaveText(/^(10:00|09:5\d)$/);
  await expect(page).toHaveTitle(/^\d\d:\d\d · Lanes$/);

  await focus.getByRole('button', { name: 'Stop' }).click();
  await focus.getByRole('textbox').fill('left off at the hero banner');
  await focus.getByRole('button', { name: 'Save and stop' }).click();
  await expect(focus).toHaveCount(0);
  await expect(page).toHaveTitle('Lanes');

  // During focus the task moved to In process; the session is logged as a note.
  await expect(lane(page, 'In process').getByText(title)).toBeVisible();
  await card(page, title).click();
  await expect(page.getByRole('dialog', { name: title })).toContainText(
    /Focus: Focused \d+ min — left off at the hero banner/,
  );
});

test('focus: time runs out → "Where did you land?" → 5 more → Done', async ({ page, request }) => {
  await page.clock.install();
  const title = unique('Timed');
  await newTask(request, { title });
  await page.goto('/');
  await card(page, title).focus();
  await page.keyboard.press('f');
  const focus = page.getByTestId('focus');
  await focus.getByRole('button', { name: '10 min' }).click();
  await expect(focus).toHaveAttribute('data-phase', 'running');

  await page.clock.fastForward('10:02');
  await expect(focus).toHaveAttribute('data-phase', 'timeup');
  await expect(focus).toContainText('Time. Where did you land?');

  await focus.getByRole('button', { name: '5 more min' }).click();
  // The fake clock also drives animation frames: let the screen change finish.
  await page.clock.runFor(1000);
  await expect(focus).toHaveAttribute('data-phase', 'running');
  await expect(page.getByTestId('focus-clock')).toHaveText(/^0[34]:\d\d$/);

  await focus.getByTestId('focus-controls').getByRole('button', { name: 'Done' }).click();
  await expect(focus).toHaveCount(0);
  await expect(lane(page, 'Done').getByText(title)).toBeVisible();
});

// ---------- pick for me ----------

test('pick for me: deals a task with a reason, skips, then offers a top 3', async ({
  page,
  request,
}) => {
  const urgent = unique('Due today low');
  await newTask(request, {
    title: urgent,
    energy: 'low',
    priority: 'urgent',
    dueAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  await page.goto('/');
  await page.keyboard.press('p');
  const dialog = page.getByRole('dialog', { name: 'How’s your energy?' });
  await dialog.getByRole('button', { name: 'Low' }).click();

  const dealt = dialog.getByTestId('dealt-card');
  await expect(dealt).toContainText(urgent);
  await expect(dealt).toContainText(/Due today/);

  for (let i = 0; i < 3; i++) {
    await dialog.getByRole('button', { name: /Not this one/ }).click();
  }
  const top = dialog.getByTestId('top-picks');
  await expect(top).toContainText('Okay, you pick');
  await top.getByRole('button').first().click();
  await expect(page.getByTestId('focus')).toHaveAttribute('data-phase', 'setup');
  await page.keyboard.press('Escape');
});

test('pick for me: "Let’s go" opens Focus on the dealt task', async ({ page, request }) => {
  const title = unique('Go for it');
  await newTask(request, {
    title,
    energy: 'high',
    priority: 'urgent',
    dueAt: new Date(Date.now() - 3600_000).toISOString(),
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Pick for me/ }).click();
  const dialog = page.getByRole('dialog', { name: 'How’s your energy?' });
  await dialog.getByRole('button', { name: 'High' }).click();
  await expect(dialog.getByTestId('dealt-card')).toContainText(title);
  await dialog.getByRole('button', { name: 'Let’s go' }).click();
  await expect(page.getByTestId('focus')).toContainText(title);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('focus')).toHaveCount(0);
});
