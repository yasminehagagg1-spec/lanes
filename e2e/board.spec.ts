import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const DATA_DIR = path.resolve(import.meta.dirname, '../.data-e2e');
const token = () => fs.readFileSync(path.join(DATA_DIR, 'token'), 'utf8').trim();
const unique = (label: string) => `${label} ${Math.random().toString(36).slice(2, 7)}`;

const lane = (page: Page, name: string) => page.getByRole('region', { name: `${name} lane` });
const card = (page: Page, title: string) =>
  page.locator('[data-task-id]').filter({ hasText: title }).first();

async function addTask(page: Page, text: string) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add a task (N)' }).click();
  const input = page.getByRole('textbox', { name: 'Task' });
  await input.fill(text);
  await input.press('Enter');
  await page.keyboard.press('Escape');
}

/**
 * dnd-kit needs real pointer movement (it activates after 6px). On slow machines the card may
 * still be settling from the last move, and the hover can lag the pointer, so: wait for the card
 * to be still, confirm the board picked it up, and confirm it's over the target before letting go.
 */
async function drag(page: Page, from: Locator, to: Locator) {
  const status = (text: string | RegExp) => page.locator('[role="status"]', { hasText: text });
  const name = ((await to.getAttribute('aria-label')) ?? '').replace(/ lane$/, '');

  await expect(async () => {
    await from.hover(); // waits until the card has stopped moving
    const a = await from.boundingBox();
    if (!a) throw new Error('card has no box');
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 4 });
    try {
      // "Picked up …" is replaced almost at once by "Over <its own lane>."; either means it started.
      await expect(status(/^(Picked up|Over )/)).toBeAttached({ timeout: 1000 });
    } catch (err) {
      await page.mouse.up();
      throw err;
    }
  }).toPass({ timeout: 10_000 });

  const b = await to.boundingBox();
  if (!b) throw new Error('lane has no box');
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 });
  let nudge = 0;
  await expect(async () => {
    nudge = (nudge + 1) % 4;
    await page.mouse.move(b.x + b.width / 2 + nudge * 3, b.y + 80 + nudge * 3, { steps: 2 });
    await expect(status(`Over ${name}.`)).toBeAttached({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  // E2E_THROTTLE=20 slows the browser's CPU, to reproduce slow-CI timing locally.
  if (process.env.E2E_THROTTLE) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.E2E_THROTTLE) });
  }
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
});

test('quick add parses and lands in New', async ({ page }) => {
  const title = unique('Send Kitebird invoice');
  await addTask(page, `${title} tomorrow 3pm !high #Kitebird`);
  const c = card(page, title);
  await expect(
    lane(page, 'New').locator('[data-task-id]').filter({ hasText: title }),
  ).toBeVisible();
  await expect(c).toContainText('Kitebird');
  await expect(c).toContainText('Tomorrow 3:00 pm');
});

test('drag between lanes, Pending asks for a reason, and it persists', async ({ page }) => {
  const title = unique('Menu layout');
  await addTask(page, title);

  await drag(page, card(page, title), lane(page, 'In process'));
  await expect(lane(page, 'In process').getByText(title)).toBeVisible();

  await drag(page, card(page, title), lane(page, 'Pending'));
  const dialog = page.getByRole('dialog', { name: 'What’s it waiting on?' });
  await expect(dialog).toBeVisible();
  // Right after a drop, dnd-kit hands focus back to the card for a moment before the dialog
  // reclaims it; on a slow machine a fill can land in that gap. Retry until the text sticks.
  const reason = dialog.getByRole('textbox');
  await expect(async () => {
    await reason.fill('their final prices');
    await expect(reason).toHaveValue('their final prices', { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Move to Pending' }).click();
  await expect(card(page, title)).toContainText('Waiting on: their final prices');

  await page.reload();
  await expect(lane(page, 'Pending').getByText(title)).toBeVisible();
  await expect(card(page, title)).toContainText('Waiting on: their final prices');
});

test('cancelling the Pending sheet puts the card back', async ({ page }) => {
  const title = unique('Cancel me');
  await addTask(page, title);
  await drag(page, card(page, title), lane(page, 'Pending'));
  const sheet = page.getByRole('dialog', { name: 'What’s it waiting on?' });
  await expect(sheet).toBeVisible();
  // dnd-kit swallows clicks for 50ms after a drop; people can't click that fast, tests can.
  await page.waitForTimeout(100);
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(lane(page, 'New').getByText(title)).toBeVisible();
});

test('drawer: notes in any stage, stage pills, done shows in Done today', async ({ page }) => {
  const title = unique('Export icons');
  await addTask(page, title);
  await card(page, title).click();

  const drawer = page.getByRole('dialog', { name: title });
  await expect(drawer).toBeVisible();
  const note = drawer.getByRole('textbox', { name: 'Add a note' });
  await note.fill('Use the 24px grid');
  await note.press('Enter');
  await expect(drawer.getByText('Use the 24px grid')).toBeVisible();

  await drawer.getByRole('radio', { name: 'Done' }).click();
  await expect(drawer.getByText('Moved from New to Done')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lane(page, 'Done').getByText(title)).toBeVisible();
  await expect(page.getByTestId('momentum')).not.toContainText('0/5');
});

test('keyboard: focus a card, press 2 to move it to In process', async ({ page }) => {
  const title = unique('Keyboard move');
  await addTask(page, title);
  await card(page, title).focus();
  await page.keyboard.press('2');
  await expect(lane(page, 'In process').getByText(title)).toBeVisible();
});

test('search and list view', async ({ page }) => {
  const title = unique('Findable');
  await addTask(page, title);
  await page.keyboard.press('/');
  await page.keyboard.type(title);
  await expect(page.locator('[data-task-id]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'list' }).click();
  await expect(page.getByTestId('list').getByText(title)).toBeVisible();
});

test('a task added by another client (Claude) appears live, without reloading', async ({
  page,
  request,
}) => {
  const title = unique('From Claude');
  const res = await request.post('/api/tasks', {
    headers: { authorization: `Bearer ${token()}` },
    data: { title, source: 'claude', project: 'Kitebird' },
  });
  expect(res.status()).toBe(201);
  const c = card(page, title);
  await expect(c).toBeVisible({ timeout: 2000 });
  await expect(c).toContainText('✳');
});

test('Arabic titles render right-to-left', async ({ page }) => {
  await addTask(page, 'تحديث البورتفوليو على بيهانس');
  const h = card(page, 'تحديث البورتفوليو').locator('h3');
  await expect(h).toHaveAttribute('lang', 'ar');
  expect(await h.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
});
