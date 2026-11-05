import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const DATA_DIR = path.resolve(import.meta.dirname, '../.data-e2e');
const auth = () => ({
  authorization: `Bearer ${fs.readFileSync(path.join(DATA_DIR, 'token'), 'utf8').trim()}`,
});
const unique = (label: string) => `${label} ${Math.random().toString(36).slice(2, 7)}`;
const lane = (page: Page, name: string) => page.getByRole('region', { name: `${name} lane` });
const card = (page: Page, title: string) =>
  page.locator('[data-task-id]').filter({ hasText: title }).first();

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

test('a task’s whole life: capture → every stage → note → reminder → done, and it survives a reload', async ({
  page,
}) => {
  const title = unique('Send Kitebird invoice');
  await page.goto('/');

  // Quick capture parses the acceptance example.
  await page.getByRole('button', { name: 'Add a task (N)' }).click();
  const input = page.getByTestId('capture').getByRole('textbox', { name: 'Task' });
  await input.fill(`${title} tomorrow 3pm !high #Kitebird`);
  await input.press('Enter');
  await page.keyboard.press('Escape');
  const c = card(page, title);
  await expect(lane(page, 'New').getByText(title)).toBeVisible();
  await expect(c).toContainText('Kitebird');
  await expect(c).toContainText('Tomorrow 3:00 pm');
  await expect(c).toContainText('2:00pm'); // the automatic reminder
  await expect(c.getByTitle('High priority')).toBeVisible();

  // Momentum before finishing (read now: the open drawer hides the page behind it).
  const before = await page
    .getByTestId('momentum')
    .getByRole('img')
    .first()
    .getAttribute('aria-label');

  await c.click();
  const drawer = page.getByRole('dialog', { name: title });
  const stage = (name: string) => drawer.getByRole('radio', { name, exact: true });

  await stage('In process').click();
  await expect(drawer.getByText('Moved from New to In process')).toBeVisible();

  await stage('Pending').click();
  const pending = page.getByRole('dialog', { name: 'What’s it waiting on?' });
  await pending.getByRole('textbox').fill('their PO number');
  await pending.getByRole('button', { name: 'Move to Pending' }).click();
  await expect(drawer.getByText('their PO number').first()).toBeVisible();

  const note = drawer.getByRole('textbox', { name: 'Add a note' });
  await note.fill('Asked twice already');
  await note.press('Enter');
  await expect(drawer.getByText('Asked twice already')).toBeVisible();

  await stage('Postponed').click();
  const later = page.getByRole('dialog', { name: 'Not now isn’t never.' });
  await later.getByRole('button', { name: 'Tomorrow' }).click();
  await later.getByRole('button', { name: 'Postpone' }).click();
  await expect(drawer.getByText(/Moved from Pending to Postponed/)).toBeVisible();

  await stage('New').click();
  await drawer.getByRole('button', { name: 'Tonight 8pm' }).click();
  await expect(drawer.getByRole('button', { name: 'Remove reminder' })).toHaveCount(2);
  await stage('Done').click();
  await expect(drawer.getByText('Moved from New to Done')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lane(page, 'Done').getByText(title)).toBeVisible();
  await expect(page.getByTestId('momentum').getByRole('img').first()).not.toHaveAttribute(
    'aria-label',
    before ?? '',
  );

  // Everything is still there after a reload.
  await page.reload();
  await expect(lane(page, 'Done').getByText(title)).toBeVisible();
  await card(page, title).click();
  const again = page.getByRole('dialog', { name: title });
  await expect(again.getByText('Asked twice already')).toBeVisible();
  await expect(again.getByText('Moved from New to Done')).toBeVisible();
  await expect(
    again.getByText(/Moved from In process to Pending|their PO number/).first(),
  ).toBeVisible();
});

test('Export → delete → Import (replace) restores everything', async ({ page, request }) => {
  const keep = unique('Keep me safe');
  const res = await request.post('/api/tasks', {
    headers: auth(),
    data: { title: keep, subtasks: ['One step'], notes: ['A note to keep'] },
  });
  const { task } = (await res.json()) as { task: { id: string } };

  await page.goto('/');
  let settings = await openSettings(page);
  const downloading = page.waitForEvent('download');
  await settings.getByRole('link', { name: 'Export' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^lanes-export-\d{4}-\d{2}-\d{2}\.json$/);
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'lanes-e2e-')),
    download.suggestedFilename(),
  );
  await download.saveAs(file);
  await page.keyboard.press('Escape');

  // Lose it, and add something that wasn't in the export.
  await request.delete(`/api/tasks/${task.id}`, { headers: auth() });
  const extra = unique('Added after export');
  await request.post('/api/tasks', { headers: auth(), data: { title: extra } });
  await page.reload();
  await expect(page.locator('[data-task-id]').filter({ hasText: keep })).toHaveCount(0);
  await expect(card(page, extra)).toBeVisible();

  settings = await openSettings(page);
  await settings.getByLabel('Lanes export file').setInputFiles(file);
  const panel = settings.getByTestId('import-panel');
  await expect(panel).toContainText(/\d+ tasks · \d+ projects/);
  await panel.getByRole('button', { name: 'Replace everything…' }).click();
  await panel.getByRole('button', { name: 'Yes, replace everything' }).click();
  await expect(
    page.getByText(/Imported: \d+ tasks added\. A backup was saved first\./),
  ).toBeVisible();
  await expect(settings.getByTestId('backups')).toContainText('before an import');
  await page.keyboard.press('Escape');

  await expect(card(page, keep)).toBeVisible();
  await expect(page.locator('[data-task-id]').filter({ hasText: extra })).toHaveCount(0);
  await card(page, keep).click();
  const drawer = page.getByRole('dialog', { name: keep });
  await expect(drawer.getByText('A note to keep')).toBeVisible();
  await expect(drawer.getByText('One step')).toBeVisible();
});

test('settings shows backups and the Claude connection', async ({ page }) => {
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Back up now' }).click();
  await expect(settings.getByTestId('backups')).toContainText('by hand');
  await expect(settings.getByTestId('claude-status')).toContainText('Claude desktop app');
  await expect(settings.getByTestId('claude-status')).toContainText('Last call from Claude');
});

test('an empty New lane points at + and opens quick capture', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  await page.keyboard.type('zzz nothing matches this zzz');
  const empty = page.getByTestId('empty-new');
  await expect(empty).toContainText('Dump everything here.');
  await expect(empty).toContainText('طلّعي كل اللي في دماغك');
  await empty.click();
  await expect(page.getByTestId('capture')).toBeVisible();
});

test('when the server is unreachable, edits say so instead of failing silently', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
  await page.route('**/api/tasks', (route) => route.abort('connectionrefused'));
  await page.keyboard.press('n');
  const input = page.getByTestId('capture').getByRole('textbox', { name: 'Task' });
  await input.fill('Never saved');
  await input.press('Enter');
  await expect(page.getByTestId('server-status')).toContainText('Lanes is sleeping');
  await expect(page.getByText('Lanes is sleeping, so that wasn’t saved.')).toBeVisible();
  await expect(input).toHaveValue('Never saved');
});

test('installable: manifest and icons are served', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    icons: { src: string }[];
  };
  expect(manifest).toMatchObject({ display: 'standalone' });
  expect(manifest.name).toContain('Lanes');
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status()).toBe(200);
  }
});
