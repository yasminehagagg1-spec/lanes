import path from 'node:path';
import { REAL_DATA_DIR, loadConfig } from '../config.js';

/** Dev scripts must never touch the real Lanes data folder. */
export function devDataDir(): string {
  const { dataDir } = loadConfig();
  if (path.resolve(dataDir) === path.resolve(REAL_DATA_DIR)) {
    console.error(
      `Refusing to run against the real data folder (${REAL_DATA_DIR}).\n` +
        'Set LANES_DATA_DIR to a dev folder, e.g. LANES_DATA_DIR=./.data-dev',
    );
    process.exit(1);
  }
  return dataDir;
}
