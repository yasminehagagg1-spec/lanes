import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PORT } from '@lanes/shared';

export interface McpConfig {
  /** Lanes server base, always loopback. */
  url: string;
  /** Link base for "open in Lanes" (localhost, as the browser uses). */
  linkBase: string;
  /** Where the token file lives. */
  dataDir: string;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const url = new URL(env.LANES_URL ?? `http://127.0.0.1:${DEFAULT_PORT}`);
  // The bridge only ever talks to this Mac.
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname)) {
    throw new Error(`LANES_URL must point at this Mac (127.0.0.1), got ${url.origin}`);
  }
  const dataDir = env.LANES_DATA_DIR
    ? path.resolve(env.LANES_DATA_DIR)
    : path.join(os.homedir(), 'Library', 'Application Support', 'Lanes');
  return {
    url: url.origin,
    linkBase: `http://localhost:${url.port || '80'}`,
    dataDir,
  };
}
