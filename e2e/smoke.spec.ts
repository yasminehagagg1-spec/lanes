import { expect, test } from '@playwright/test';

test('health endpoint answers', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ ok: true });
});

test('styled page loads with tokens and fonts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const styles = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const title = document.querySelector('h1');
    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      fontDisplayVar: root.getPropertyValue('--font-display').trim(),
      shadowCardVar: root.getPropertyValue('--shadow-card').trim(),
      titleFont: title ? getComputedStyle(title).fontFamily : '',
    };
  });

  // Canvas is --grey-100 (#EDEDED), and theme variables resolve to real values (no self-reference).
  expect(styles.bodyBg).toBe('rgb(237, 237, 237)');
  expect(styles.fontDisplayVar).toContain('Archivo');
  expect(styles.shadowCardVar).toMatch(/^0 1px 0 /);
  expect(styles.shadowCardVar).not.toContain('var(');
  expect(styles.titleFont).toContain('Archivo');

  await page.screenshot({ path: 'e2e/screenshots/phase-0.png' });
});
