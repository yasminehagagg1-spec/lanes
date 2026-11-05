// Renders the app icons from the SVGs next to this file, using Playwright's Chromium.
//   node scripts/icons/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const here = import.meta.dirname;
const out = path.resolve(here, '../../packages/web/public/icons');
fs.mkdirSync(out, { recursive: true });

const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['maskable.svg', 'maskable-512.png', 512],
  ['maskable.svg', 'apple-touch-icon.png', 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, name, size] of jobs) {
  const svg = fs.readFileSync(path.join(here, src), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: path.join(out, name), omitBackground: true });
  console.log(`icons/${name}`);
}
await browser.close();
fs.copyFileSync(path.join(here, 'icon.svg'), path.join(out, 'icon.svg'));
console.log('icons/icon.svg');
