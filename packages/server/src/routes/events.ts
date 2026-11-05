import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';

const HEARTBEAT_MS = 20_000;

/** GET /api/events — Server-Sent Events stream for open tabs. */
export function eventRoutes(app: FastifyInstance, ctx: Ctx) {
  const open = new Set<ServerResponse>();

  app.get('/api/events', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    open.add(res);

    const unsubscribe = ctx.events.subscribe((event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      open.delete(res);
    });
  });

  // Streams never end on their own. End them *before* the server waits for open
  // connections (preClose), or shutting down hangs while a tab is open.
  app.addHook('preClose', async () => {
    for (const res of open) res.end();
    open.clear();
  });
}
