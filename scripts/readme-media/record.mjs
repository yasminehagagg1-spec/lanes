// Records the README demos: real browser sessions against a throwaway demo board.
/* global document -- used inside page.evaluate callbacks, which run in the browser */
//
//   pnpm build && node scripts/readme-media/record.mjs [name …]
//
// Each demo gets a fresh copy of the sample board (.data-demo), is recorded at 1440×900,
// and is turned into lanes_gifs/<name>.gif with ffmpeg (the board still lands in
// docs/media/board.png). Never touches your real data.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, '.data-demo');
const OUT = path.join(ROOT, 'docs/media');
const GIFS = path.join(ROOT, 'lanes_gifs');
const TMP = path.join(ROOT, '.data-demo-video');
const PORT = 4870;
const URL = `http://localhost:${PORT}`;
const SIZE = { width: 1440, height: 900 };
// Browser screen recording stops capturing above ~900px tall, so the finish demo zooms the
// page out instead (the whole board fits) and the GIF crops to the board.
const ZOOM = { finish: 0.69 };
const CROP = { finish: 'crop=1000:900:220:0,' };
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = {
  ...process.env,
  LANES_DATA_DIR: DATA,
  LANES_PORT: String(PORT),
  LANES_NOTIFY: 'off',
  TZ: process.env.TZ ?? 'Africa/Cairo',
};

function seed() {
  fs.rmSync(DATA, { recursive: true, force: true });
  execFileSync(
    'pnpm',
    [
      '--silent',
      '--filter',
      '@lanes/server',
      'exec',
      'tsx',
      '--conditions=source',
      'src/scripts/seed.ts',
    ],
    {
      cwd: ROOT,
      env,
      stdio: 'ignore',
    },
  );
}

async function startServer() {
  const proc = spawn(process.execPath, [path.join(ROOT, 'packages/server/dist/index.js')], {
    env,
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${URL}/api/health`)).ok) return proc;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error('demo server did not start');
}

/** A visible pointer (headless recordings have none). */
const CURSOR = `
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform .02s linear';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.7 L11.6 14 L18 14 Z" fill="#1e1e1e" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    window.addEventListener('pointermove', (e) => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
  });
`;

/** Glide the pointer like a person would. */
async function glide(page, to, steps = 25) {
  await page.mouse.move(to.x, to.y, { steps });
}

async function drag(page, from, to) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await glide(page, { x: a.x + a.width / 2, y: a.y + 30 }, 20);
  await sleep(300);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + 40, { steps: 5 });
  await glide(page, { x: b.x + b.width / 2, y: b.y + 110 }, 40);
  await sleep(250);
  await page.mouse.up();
}

const card = (page, title) => page.locator('[data-task-id]').filter({ hasText: title }).first();
const lane = (page, name) => page.getByRole('region', { name: `${name} lane` });

/** A caption pill for the "from Claude" demo (our own styling, not Claude's UI). */
async function caption(page, label, text) {
  await page.evaluate(
    ([label, text]) => {
      const el = document.createElement('div');
      el.style.cssText =
        'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;display:flex;gap:12px;align-items:center;' +
        'background:#1e1e1e;color:#fff;border-radius:999px;padding:14px 24px;font:500 17px Poppins,system-ui,sans-serif;box-shadow:0 18px 40px rgba(0,0,0,.25);max-width:1100px';
      el.innerHTML = `<span style="color:#f3c623;font-weight:700">${label}</span><span id="demo-typed"></span><span style="opacity:.6">▍</span>`;
      document.body.appendChild(el);
      const typed = el.querySelector('#demo-typed');
      let i = 0;
      const tick = () => {
        typed.textContent = text.slice(0, ++i);
        if (i < text.length) setTimeout(tick, 38);
      };
      tick();
    },
    [label, text],
  );
  await sleep(text.length * 38 + 400);
}

/** A key badge, so a keyboard shortcut is visible in the recording. */
async function keycap(page, label) {
  await page.evaluate((label) => {
    const el = document.createElement('div');
    el.textContent = label;
    el.style.cssText =
      'position:fixed;right:28px;bottom:28px;z-index:99999;background:#1e1e1e;color:#fff;border-radius:14px;' +
      'padding:12px 20px;font:600 26px Poppins,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:opacity .4s';
    document.body.appendChild(el);
    setTimeout(() => (el.style.opacity = '0'), 1400);
    setTimeout(() => el.remove(), 1900);
  }, label);
  await sleep(350);
}

// ---------- demos ----------

const DEMOS = {
  async capture(page) {
    await sleep(900);
    await page.keyboard.press('n');
    await sleep(700);
    await page.keyboard.type('Send Kitebird the final banners tomorrow 3pm !urgent #Kitebird', {
      delay: 55,
    });
    await sleep(1400);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('بوستات السوشيال بكرة الساعة ٥ ~low', { delay: 55 });
    await sleep(1400);
    await page.keyboard.press('Enter');
    await sleep(900);
    await page.keyboard.press('Escape');
    await sleep(2200);
  },

  async finish(page) {
    await sleep(800);
    // Zoomed out, so finish with the keyboard (select, press 4) rather than a drag.
    const c = card(page, 'Social grid for the fragrance');
    await c.focus();
    await sleep(600);
    await keycap(page, '4 · Done');
    await page.keyboard.press('4');
    await sleep(3400);
  },

  async pending(page) {
    await sleep(800);
    await drag(page, card(page, 'Mascot exploration'), lane(page, 'Pending'));
    await sleep(900);
    await page.keyboard.type('the client’s brand book', { delay: 60 });
    await sleep(500);
    const btn = page.getByRole('button', { name: 'Move to Pending' });
    const box = await btn.boundingBox();
    await glide(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await sleep(250);
    await btn.click();
    await sleep(2400);
  },

  async focus(page, mark) {
    await sleep(700);
    await card(page, 'Fix product card spacing').focus();
    await sleep(300);
    await page.keyboard.press('f');
    await sleep(1600);
    const custom = page.getByRole('spinbutton', { name: 'Custom minutes' });
    await custom.click();
    await page.keyboard.type('1', { delay: 120 });
    await sleep(400);
    await page.keyboard.press('Enter');
    await sleep(2500);
    mark('fast');
    await page.locator('[data-testid="focus"][data-phase="timeup"]').waitFor({ timeout: 90_000 });
    mark('normal');
    await sleep(3200);
  },

  async pick(page) {
    await sleep(700);
    await page.keyboard.press('p');
    await sleep(1300);
    const medium = page.getByRole('button', { name: 'Medium' });
    const box = await medium.boundingBox();
    await glide(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await sleep(300);
    await medium.click();
    await sleep(2400);
    const skip = page.getByRole('button', { name: /Not this one/ });
    const sb = await skip.boundingBox();
    await glide(page, { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 });
    await sleep(250);
    await skip.click();
    await sleep(2600);
  },

  async claude(page) {
    await sleep(800);
    await caption(
      page,
      '/task',
      'send Kitebird the final banners tomorrow 3pm, urgent, remind me at 1',
    );
    await sleep(500);
    // The real connector path: the MCP server's add_task, over stdio.
    execFileSync(process.execPath, [path.join(import.meta.dirname, 'mcp-add.mjs')], {
      env: { ...env, LANES_URL: `http://127.0.0.1:${PORT}` },
      stdio: 'ignore',
    });
    await sleep(3000);
  },
};

// ---------- record ----------

const SPEEDUP = 15;
/** Mostly flat-colour demos (focus) look the same with fewer colours, at half the size. */
const COLORS = { focus: 48 };
const look = (name) =>
  `fps=14,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${COLORS[name] ?? 160}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;

/** webm → GIF. `marks` switch between normal speed and a time-lapse ("fast"). */
function toGif(webm, gif, startSec, marks = [], crop = '', LOOK = look('')) {
  if (!marks.length) {
    execFileSync(FFMPEG, [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      String(startSec),
      '-i',
      webm,
      '-vf',
      crop + LOOK,
      '-loop',
      '0',
      gif,
    ]);
    return;
  }
  const cuts = [{ at: startSec, speed: 'normal' }, ...marks];
  const parts = cuts.map((c, i) => {
    const end = cuts[i + 1]?.at;
    const trim = end === undefined ? `trim=start=${c.at}` : `trim=start=${c.at}:end=${end}`;
    const pts = c.speed === 'fast' ? `(PTS-STARTPTS)/${SPEEDUP}` : 'PTS-STARTPTS';
    return `[0:v]${trim},setpts=${pts}[s${i}]`;
  });
  const graph = `${parts.join(';')};${cuts.map((_, i) => `[s${i}]`).join('')}concat=n=${cuts.length}:v=1:a=0[cat];[cat]${LOOK}`;
  execFileSync(FFMPEG, [
    '-y',
    '-loglevel',
    'error',
    '-i',
    webm,
    '-filter_complex',
    graph,
    '-loop',
    '0',
    gif,
  ]);
}

async function record(name) {
  seed();
  const server = await startServer();
  fs.rmSync(TMP, { recursive: true, force: true });
  const browser = await chromium.launch();
  const size = SIZE;
  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir: TMP, size },
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const opened = Date.now();
  await page.goto(URL);
  await page.locator('[data-task-id]').first().waitFor();
  if (ZOOM[name])
    await page.evaluate((z) => (document.documentElement.style.zoom = String(z)), ZOOM[name]);
  await sleep(1200); // fonts and entrance animations settle
  const start = (Date.now() - opened) / 1000;
  const marks = [];
  const mark = (speed) => marks.push({ at: (Date.now() - opened) / 1000, speed });
  try {
    await DEMOS[name](page, mark);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    server.kill();
    const webm = await video.path();
    toGif(webm, path.join(GIFS, `${name}.gif`), start, marks, CROP[name] ?? '', look(name));
    const kb = Math.round(fs.statSync(path.join(GIFS, `${name}.gif`)).size / 1024);
    console.log(`lanes_gifs/${name}.gif  ${kb} KB`);
  }
}

async function hero() {
  seed();
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
  await page.goto(URL);
  await page.locator('[data-task-id]').first().waitFor();
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, 'board.png') });
  await browser.close();
  server.kill();
  console.log('docs/media/board.png');
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(GIFS, { recursive: true });
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : ['hero', ...Object.keys(DEMOS)];
for (const name of names) {
  if (name === 'hero') await hero();
  else await record(name);
}
fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(DATA, { recursive: true, force: true });
