// Synthesized sounds (Web Audio) — no audio files. Quiet by design.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  ac: AudioContext,
  opts: {
    type: OscillatorType;
    from: number;
    to?: number;
    start?: number;
    attack: number;
    decay: number;
    gain: number;
  },
) {
  const t0 = ac.currentTime + (opts.start ?? 0);
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, t0);
  if (opts.to)
    osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.attack + opts.decay * 0.4);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(opts.gain, t0 + opts.attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.attack + opts.decay);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.attack + opts.decay + 0.05);
}

/** Soft pop for a finished task. Pitch climbs with the combo. */
export function playPop(combo = 1) {
  const ac = audio();
  if (!ac) return;
  const base = 480 * Math.min(1.6, 1 + 0.07 * Math.max(0, combo - 1));
  tone(ac, {
    type: 'triangle',
    from: base,
    to: base * 1.6,
    attack: 0.006,
    decay: 0.16,
    gain: 0.22,
  });
  tone(ac, { type: 'sine', from: base * 2, attack: 0.004, decay: 0.08, gain: 0.05 });
}

/** Tiny higher tick for a checked step. */
export function playTick() {
  const ac = audio();
  if (!ac) return;
  tone(ac, { type: 'sine', from: 1320, to: 1760, attack: 0.003, decay: 0.07, gain: 0.1 });
}

/** Three-note chime when the daily goal is hit. */
export function playChime() {
  const ac = audio();
  if (!ac) return;
  [1046.5, 1318.5, 1568].forEach((f, i) => {
    tone(ac, { type: 'sine', from: f, start: i * 0.09, attack: 0.01, decay: 0.9, gain: 0.11 });
    tone(ac, {
      type: 'triangle',
      from: f * 2,
      start: i * 0.09,
      attack: 0.01,
      decay: 0.3,
      gain: 0.025,
    });
  });
}

export type Ambient = 'off' | 'tick' | 'brown';

/** Background sound for Focus mode. Returns a stop function. */
export function startAmbient(kind: Ambient): () => void {
  const ac = kind === 'off' ? null : audio();
  if (!ac) return () => {};

  if (kind === 'tick') {
    const id = setInterval(() => {
      tone(ac, { type: 'sine', from: 1900, attack: 0.002, decay: 0.025, gain: 0.03 });
    }, 1000);
    return () => clearInterval(id);
  }

  // Brown noise: integrated white noise, looped. Soft and low.
  const seconds = 4;
  const buffer = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 1.2);
  source.connect(gain).connect(ac.destination);
  source.start();
  return () => {
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.4);
    source.stop(ac.currentTime + 0.45);
  };
}
