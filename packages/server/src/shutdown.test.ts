import http from 'node:http';
import { expect, it } from 'vitest';
import { makeHarness } from './test-harness.js';

it('shuts down promptly while a tab holds the live-updates stream open', async () => {
  const h = await makeHarness();
  await h.app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = h.app.server.address() as { port: number };

  const ended = new Promise<void>((resolve) => {
    http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/api/events',
        headers: { host: `localhost:${port}`, 'sec-fetch-site': 'same-origin' },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve());
      },
    );
  });
  await new Promise((r) => setTimeout(r, 100));

  const started = Date.now();
  await h.app.close();
  await ended;
  expect(Date.now() - started).toBeLessThan(1000);
});
