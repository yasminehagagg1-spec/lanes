import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PORT } from '@lanes/shared';

export interface ServerConfig {
  host: '127.0.0.1';
  port: number;
  dataDir: string;
  /** Built web UI to serve at `/`, if present. */
  webDist: string;
  /** Home folder, for reading Claude's config (connection status). */
  home: string;
}

export const REAL_DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Lanes');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.LANES_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`LANES_PORT must be a port number, got "${env.LANES_PORT}"`);
  }
  return {
    // Never 0.0.0.0: nothing on the network may reach Lanes.
    host: '127.0.0.1',
    port,
    dataDir: env.LANES_DATA_DIR ? path.resolve(env.LANES_DATA_DIR) : REAL_DATA_DIR,
    webDist: path.resolve(import.meta.dirname, '../../web/dist'),
    home: os.homedir(),
  };
}
