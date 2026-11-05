import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingHttpHeaders } from 'node:http';

const TOKEN_FILE = 'token';
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

/** Reads `<dataDir>/token`, creating a random 32-byte hex token (mode 600) on first run. */
export function ensureToken(dataDir: string): string {
  const file = path.join(dataDir, TOKEN_FILE);
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (TOKEN_SHAPE.test(existing)) {
      fs.chmodSync(file, 0o600);
      return existing;
    }
  }
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return token;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Hostname from a Host/Origin authority, without the port. */
export function hostnameOf(host: string | undefined): string {
  if (!host) return '';
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0] ?? '';
}

export function isLocalHost(host: string | undefined): boolean {
  return LOCAL_HOSTNAMES.has(hostnameOf(host));
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * The browser UI (same origin) needs no token: browsers send `Sec-Fetch-Site: same-origin`,
 * which other websites can't fake. Everything else (MCP server, curl) sends the bearer token.
 */
export function isAuthorized(headers: IncomingHttpHeaders, token: string): boolean {
  const auth = headers.authorization;
  if (auth?.startsWith('Bearer ') && safeEqual(auth.slice(7).trim(), token)) return true;

  if (headers['sec-fetch-site'] !== 'same-origin') return false;
  const origin = headers.origin;
  if (!origin) return true;
  try {
    return isLocalHost(new URL(origin).host);
  } catch {
    return false;
  }
}
