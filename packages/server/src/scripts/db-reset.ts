// pnpm db:reset — wipes the DEV database (never the real one). Keeps the token.
import fs from 'node:fs';
import path from 'node:path';
import { devDataDir } from './guard.js';

const dir = devDataDir();
for (const file of ['lanes.db', 'lanes.db-wal', 'lanes.db-shm']) {
  fs.rmSync(path.join(dir, file), { force: true });
}
console.log(`Dev database wiped in ${dir}`);
