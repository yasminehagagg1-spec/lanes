// ULID: 26 chars, time-sortable, Crockford base32. Monotonic within the same millisecond.
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let lastTime = -1;
let lastRandom: number[] = [];

// Web Crypto exists in browsers and Node 19+; typed locally so this package needs no DOM lib.
const webCrypto = (
  globalThis as unknown as { crypto: { getRandomValues<T extends Uint8Array>(array: T): T } }
).crypto;

function randomDigits(): number[] {
  // 256 is divisible by 32, so `byte % 32` is uniform.
  return Array.from(webCrypto.getRandomValues(new Uint8Array(16)), (b) => b % 32);
}

function increment(digits: number[]): number[] {
  const out = [...digits];
  for (let i = out.length - 1; i >= 0; i--) {
    const d = out[i] ?? 0;
    if (d < 31) {
      out[i] = d + 1;
      return out;
    }
    out[i] = 0;
  }
  return out;
}

export function ulid(now: number = Date.now()): string {
  const random = now === lastTime ? increment(lastRandom) : randomDigits();
  lastTime = now;
  lastRandom = random;

  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ENCODING.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  return time + random.map((d) => ENCODING.charAt(d)).join('');
}
