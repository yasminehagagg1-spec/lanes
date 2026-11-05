import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError, z } from 'zod';
import { isAuthorized, isLocalHost } from './auth.js';
import type { ServerConfig } from './config.js';
import type { Ctx } from './context.js';
import { AppError } from './errors.js';
import { eventRoutes } from './routes/events.js';
import { itemRoutes } from './routes/items.js';
import { metaRoutes } from './routes/meta.js';
import { dataRoutes, type Presence } from './routes/data.js';
import { taskRoutes } from './routes/tasks.js';

export { hostnameOf } from './auth.js';

export interface AppDeps {
  config: ServerConfig;
  ctx: Ctx;
  token: string;
  /** Opens a folder in Finder (stubbed in tests). */
  openPath?: (dir: string) => void;
}

/** Finder, via macOS `open`. Fixed program, path from our own config. */
const openInFinder = (dir: string) => {
  execFile('open', [dir], () => undefined);
};

const error = (code: string, message: string) => ({ error: { code, message } });

export async function buildApp({
  config,
  ctx,
  token,
  openPath = openInFinder,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 });
  const presence: Presence = { mcpAt: null };

  app.addHook('onRequest', async (req, reply) => {
    // DNS-rebinding protection: only answer requests addressed to this machine.
    if (!isLocalHost(req.headers.host)) {
      return reply.code(403).send(error('FORBIDDEN_HOST', 'Lanes only answers on localhost.'));
    }
    // API calls need the same-origin UI or the bearer token. Health stays open for `lanes status`.
    const pathname = req.url.split('?')[0] ?? '';
    if (pathname.startsWith('/api/') && pathname !== '/api/health') {
      if (!isAuthorized(req.headers, token)) {
        return reply.code(401).send(error('UNAUTHORIZED', 'Missing or wrong Lanes token.'));
      }
      if (req.headers['x-lanes-client'] === 'mcp') presence.mcpAt = ctx.clock().toISOString();
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send(error(err.code, err.message));
    if (err instanceof ZodError) {
      return reply.code(400).send(error('VALIDATION', z.prettifyError(err)));
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send(error('BAD_REQUEST', (err as Error).message));
    }
    console.error(err);
    return reply.code(500).send(error('INTERNAL', 'Something went wrong on the Lanes server.'));
  });

  metaRoutes(app, ctx, config);
  taskRoutes(app, ctx);
  itemRoutes(app, ctx);
  eventRoutes(app, ctx);
  dataRoutes(app, ctx, config, { presence, openPath });

  const hasUi = fs.existsSync(path.join(config.webDist, 'index.html'));
  if (hasUi) {
    // wildcard: files are looked up per request, so a rebuild never needs a restart.
    await app.register(fastifyStatic, { root: config.webDist });
  }

  app.setNotFoundHandler((req, reply) => {
    const pathname = req.url.split('?')[0] ?? '';
    // Missing files (e.g. brand fonts not dropped in yet) get a real 404, not the app shell.
    const looksLikeFile = /\.[a-z0-9]+$/i.test(pathname);
    if (pathname.startsWith('/api/') || looksLikeFile || !hasUi || req.method !== 'GET') {
      return reply.code(404).send(error('NOT_FOUND', 'Not found.'));
    }
    // Single-page app: unknown paths get the UI shell.
    return reply.sendFile('index.html');
  });

  return app;
}
