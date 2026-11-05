// Copies console output to <dataDir>/logs/server.log (kept small: rolled over at 1 MB on start).
import fs from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';

const MAX_BYTES = 1024 * 1024;

export function logToFile(dataDir: string): string {
  const dir = path.join(dataDir, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'server.log');
  if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
    fs.renameSync(file, `${file}.1`);
  }
  const stream = fs.createWriteStream(file, { flags: 'a' });
  for (const [method, level] of [
    ['log', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
  ] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      stream.write(`${new Date().toISOString()} ${level} ${format(...args)}\n`);
    };
  }
  return file;
}
