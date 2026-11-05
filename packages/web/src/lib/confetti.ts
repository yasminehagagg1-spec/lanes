// A tiny canvas confetti engine. One full-viewport canvas, a rAF loop only while pieces exist.
// Colors come from tokens at runtime (never hex in code).

export interface BurstOptions {
  x: number;
  y: number;
  count: number;
  /** Initial speed in px/frame. */
  power?: number;
  /** Upward cone (radians) — Math.PI*2 = all directions. */
  spread?: number;
  life?: number;
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  round: boolean;
  age: number;
  life: number;
}

const TOKENS = ['--yellow', '--royal', '--white', '--charcoal', '--yellow'];

let canvas: HTMLCanvasElement | null = null;
let pieces: Piece[] = [];
let running = false;

export function attachCanvas(el: HTMLCanvasElement | null) {
  canvas = el;
}

function palette(): string[] {
  const css = getComputedStyle(document.documentElement);
  return TOKENS.map((t) => css.getPropertyValue(t).trim() || 'currentColor');
}

export function burst(opts: BurstOptions) {
  if (!canvas) return;
  const colors = palette();
  const spread = opts.spread ?? Math.PI * 0.9;
  const power = opts.power ?? 9;
  for (let i = 0; i < opts.count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
    const speed = power * (0.55 + Math.random() * 0.6);
    pieces.push({
      x: opts.x,
      y: opts.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 5,
      color: colors[i % colors.length] ?? 'currentColor',
      round: Math.random() < 0.3,
      age: 0,
      life: (opts.life ?? 900) / 16.7,
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(step);
  }
}

function step() {
  const c = canvas;
  const g = c?.getContext('2d');
  if (!c || !g) {
    running = false;
    pieces = [];
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== innerWidth * dpr || c.height !== innerHeight * dpr) {
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);

  pieces = pieces.filter((p) => p.age < p.life && p.y < innerHeight + 40);
  for (const p of pieces) {
    p.age++;
    p.vy += 0.32; // gravity
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    const fade = Math.min(1, (p.life - p.age) / 12);
    g.save();
    g.globalAlpha = fade;
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.fillStyle = p.color;
    if (p.round) {
      g.beginPath();
      g.arc(0, 0, p.h / 1.4, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    // White pieces need an edge to read on white cards.
    if (p.color.toLowerCase() === '#ffffff' || p.color === 'white') {
      g.strokeStyle = 'rgba(30,30,30,.15)';
      g.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    g.restore();
  }

  if (pieces.length) requestAnimationFrame(step);
  else {
    g.clearRect(0, 0, innerWidth, innerHeight);
    running = false;
  }
}
