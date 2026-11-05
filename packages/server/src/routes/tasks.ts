import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  MoveInputSchema,
  PickQuerySchema,
  TaskDraftSchema,
  TaskPatchSchema,
  TaskQuerySchema,
  parseTask,
} from '@lanes/shared';
import type { Ctx } from '../context.js';
import { listProjects } from '../db/repo/projects.js';
import { getSettings } from '../db/repo/settings.js';
import { getTaskDetail, listTasks } from '../db/repo/tasks.js';
import { AppError, notFound } from '../errors.js';
import {
  createTask,
  deleteTask,
  moveTask,
  pickForMe,
  restoreTask,
  updateTask,
} from '../services/tasks.js';

type IdParams = { Params: { id: string } };
const ParseSchema = z.object({ text: z.string().max(5000) }).strict();

export function taskRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/tasks', async (req) =>
    listTasks(ctx.db, TaskQuerySchema.parse(req.query), ctx.clock(), getSettings(ctx.db)),
  );

  app.get('/api/tasks/pick', async (req) => {
    const q = PickQuerySchema.parse(req.query);
    return pickForMe(ctx, {
      energy: q.energy,
      minutes: q.minutes,
      exclude: q.exclude?.split(',').filter(Boolean) ?? [],
    });
  });

  app.post('/api/tasks/parse', async (req) => {
    const { text } = ParseSchema.parse(req.body);
    const draft = parseTask(text, {
      now: ctx.clock(),
      knownProjects: listProjects(ctx.db).map((p) => p.name),
    });
    if (!draft) throw new AppError('NOTHING_TO_ADD', 400, 'There’s no task title in that text.');
    return draft;
  });

  app.get<IdParams>('/api/tasks/:id', async (req) => {
    const detail = getTaskDetail(ctx.db, req.params.id);
    if (!detail) throw notFound('Task');
    return detail;
  });

  app.post('/api/tasks', async (req, reply) => {
    const result = createTask(ctx, TaskDraftSchema.parse(req.body));
    return reply.code(201).send(result);
  });

  app.patch<IdParams>('/api/tasks/:id', async (req) =>
    updateTask(ctx, req.params.id, TaskPatchSchema.parse(req.body)),
  );

  app.post<IdParams>('/api/tasks/:id/move', async (req) =>
    moveTask(ctx, req.params.id, MoveInputSchema.parse(req.body)),
  );

  app.delete<IdParams>('/api/tasks/:id', async (req) => deleteTask(ctx, req.params.id));

  app.post<IdParams>('/api/tasks/:id/restore', async (req) => restoreTask(ctx, req.params.id));
}
