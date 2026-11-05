import type { FastifyInstance } from 'fastify';
import { localDateKey } from '@lanes/shared';
import type { ServerConfig } from '../config.js';
import type { Ctx } from '../context.js';
import { backupNow, listBackups } from '../services/backup.js';
import { claudeStatus } from '../services/claude-status.js';
import { exportData, importData, ImportSchema } from '../services/data.js';

export interface Presence {
  mcpAt: string | null;
}

export function dataRoutes(
  app: FastifyInstance,
  ctx: Ctx,
  config: ServerConfig,
  deps: { presence: Presence; openPath: (dir: string) => void },
) {
  app.get('/api/data/export', async (_req, reply) => {
    const name = `lanes-export-${localDateKey(ctx.clock())}.json`;
    return reply
      .header('content-disposition', `attachment; filename="${name}"`)
      .send(exportData(ctx));
  });

  app.post('/api/data/import', async (req) => {
    const { mode, data } = ImportSchema.parse(req.body);
    return importData(ctx, config.dataDir, mode, data);
  });

  app.get('/api/data/backups', async () => ({
    dataDir: config.dataDir,
    backups: listBackups(config.dataDir),
  }));

  app.post('/api/data/backup', async (_req, reply) =>
    reply.code(201).send(backupNow(ctx.db, config.dataDir, ctx.clock(), 'manual')),
  );

  app.post('/api/data/open-folder', async () => {
    deps.openPath(config.dataDir);
    return { ok: true, dataDir: config.dataDir };
  });

  app.get('/api/claude/status', async () =>
    claudeStatus({ home: config.home, dataDir: config.dataDir, lastSeenAt: deps.presence.mcpAt }),
  );
}
