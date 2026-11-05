import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  APP_VERSION,
  ProjectCreateSchema,
  ProjectPatchSchema,
  SettingsPatchSchema,
} from '@lanes/shared';
import type { ServerConfig } from '../config.js';
import type { Ctx } from '../context.js';
import { findProjectByName, getProject, insertProject, listProjects } from '../db/repo/projects.js';
import { getSettings, saveSettings } from '../db/repo/settings.js';
import { countTasks } from '../db/repo/tasks.js';
import { AppError, notFound } from '../errors.js';
import { getHistory, getTodayStats } from '../services/stats.js';

type IdParams = { Params: { id: string } };
const HistorySchema = z.object({ days: z.coerce.number().int().min(1).max(366).optional() });

const projectExists = (name: string) =>
  new AppError('PROJECT_EXISTS', 409, `A project called “${name}” already exists.`);

export function metaRoutes(app: FastifyInstance, ctx: Ctx, config: ServerConfig) {
  app.get('/api/health', async () => ({
    ok: true,
    version: APP_VERSION,
    dataDir: config.dataDir,
    tasks: countTasks(ctx.db),
  }));

  // Projects
  app.get('/api/projects', async () => listProjects(ctx.db));

  app.post('/api/projects', async (req, reply) => {
    const { name, color } = ProjectCreateSchema.parse(req.body);
    if (findProjectByName(ctx.db, name)) throw projectExists(name);
    return reply.code(201).send(insertProject(ctx.db, name, color, ctx.clock().toISOString()));
  });

  app.patch<IdParams>('/api/projects/:id', async (req) => {
    const patch = ProjectPatchSchema.parse(req.body);
    const current = getProject(ctx.db, req.params.id);
    if (!current) throw notFound('Project');
    if (patch.name) {
      const clash = findProjectByName(ctx.db, patch.name);
      if (clash && clash.id !== current.id) throw projectExists(patch.name);
    }
    ctx.db
      .prepare(
        `UPDATE projects SET name = COALESCE(?, name), color = COALESCE(?, color),
           archived = COALESCE(?, archived) WHERE id = ?`,
      )
      .run(
        patch.name?.trim() ?? null,
        patch.color ?? null,
        patch.archived === undefined ? null : Number(patch.archived),
        current.id,
      );
    return getProject(ctx.db, current.id);
  });

  // Stats
  app.get('/api/stats/today', async () => getTodayStats(ctx));
  app.get('/api/stats/history', async (req) =>
    getHistory(ctx, HistorySchema.parse(req.query).days ?? 30),
  );

  // Settings
  app.get('/api/settings', async () => getSettings(ctx.db));
  app.patch('/api/settings', async (req) => {
    const settings = saveSettings(ctx.db, SettingsPatchSchema.parse(req.body));
    // Goal or day start may have changed the momentum bar.
    ctx.events.emit({ type: 'stats.updated', data: { stats: getTodayStats(ctx) } });
    return settings;
  });
}
