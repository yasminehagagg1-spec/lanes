// Reward moments (docs/build-kit/06 §A). Every effect checks the Celebration setting and reduced motion:
//   full   → stamp + confetti + sound (if Sounds is on)
//   subtle → stamp + bar only (no confetti, no sound)
//   off    → nothing extra; the bar still updates
import type { MomentumLevel, Settings } from '@lanes/shared';
import { burst } from './confetti';
import { playChime, playPop, playTick } from './sounds';
import { useUi } from './store';

let prefs: Pick<Settings, 'celebration' | 'sounds'> = { celebration: 'full', sounds: true };

export function setCelebrationPrefs(next: Pick<Settings, 'celebration' | 'sounds'>) {
  prefs = next;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const effects = () => ({
  stamp: prefs.celebration !== 'off',
  confetti: prefs.celebration === 'full' && !reducedMotion(),
  sound: prefs.celebration === 'full' && prefs.sounds,
  motion: prefs.celebration !== 'off' && !reducedMotion(),
});

function centerOf(el: Element | null | undefined) {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top } : null;
}

/** A task landed in Done. */
export function celebrateCompletion(taskId: string, combo: number) {
  const fx = effects();
  if (fx.stamp) useUi.getState().stamp(taskId);
  if (fx.sound) playPop(combo);
  if (fx.confetti) {
    // Wait a frame so the card is in its new lane.
    requestAnimationFrame(() => {
      const at = centerOf(document.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`));
      if (at) burst({ x: at.x, y: at.top + 12, count: 12 + Math.min(8, combo * 2), power: 8 });
    });
  }
}

/** A step was checked: mini version. */
export function celebrateSubtask(el: Element | null) {
  const fx = effects();
  if (fx.sound) playTick();
  const at = centerOf(el);
  if (fx.confetti && at) burst({ x: at.x, y: at.y, count: 6, power: 5, life: 600 });
}

/** Crossed a milestone tier (25 / 50 / 75 / 100%). */
export function celebrateLevel(level: MomentumLevel) {
  const fx = effects();
  const card = centerOf(document.querySelector('[data-testid="momentum"]'));
  if (level >= 2 && fx.motion) useUi.getState().spinSticker();
  if (level === 4) {
    if (fx.sound) playChime();
    if (fx.confetti) {
      const w = window.innerWidth;
      for (const x of [w * 0.2, w * 0.5, w * 0.8]) {
        burst({
          x,
          y: window.innerHeight * 0.55,
          count: 40,
          power: 15,
          spread: Math.PI * 0.7,
          life: 2200,
        });
      }
    }
    return;
  }
  if (fx.confetti && card) {
    const count = level === 3 ? 36 : level === 2 ? 22 : 12;
    burst({
      x: card.x,
      y: card.y,
      count,
      power: level === 3 ? 12 : 9,
      spread: Math.PI * 1.4,
      life: 1100,
    });
  }
}
