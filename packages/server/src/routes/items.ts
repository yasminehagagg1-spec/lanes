import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  FocusEndSchema,
  FocusStartSchema,
  NoteCreateSchema,
  NotePatchSchema,
  ReminderCreateSchema,
  SnoozeSchema,
  SubtaskCreateSchema,
  SubtaskPatchSchema,
} from '@lanes/shared';
import type { Ctx } from '../context.js';
import { getTaskRow, listNotes } from '../db/repo/tasks.js';
import { notFound } from '../errors.js';
import {
  addNote,
  addReminder,
  addSubtask,
  deleteNote,
  deleteReminder,
  deleteSubtask,
  dismissReminder,
  endFocus,
  snoozeReminder,
  startFocus,
  rangReminders,
  updateNote,
  updateSubtask,
  upcomingReminders,
} from '../services/items.js';

type IdParams = { Params: { id: string } };

const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
const WithinSchema = z.object({
  within: z
    .string()
    .regex(/^\d{1,4}[mhd]$/)
    .optional(),
});

export function itemRoutes(app: FastifyInstance, ctx: Ctx) {
  // Subtasks
  app.post<IdParams>('/api/tasks/:id/subtasks', async (req, reply) => {
    const { title } = SubtaskCreateSchema.parse(req.body);
    return reply.code(201).send(addSubtask(ctx, req.params.id, title));
  });
  app.patch<IdParams>('/api/subtasks/:id', async (req) =>
    updateSubtask(ctx, req.params.id, SubtaskPatchSchema.parse(req.body)),
  );
  app.delete<IdParams>('/api/subtasks/:id', async (req) => deleteSubtask(ctx, req.params.id));

  // Notes
  app.get<IdParams>('/api/tasks/:id/notes', async (req) => {
    if (!getTaskRow(ctx.db, req.params.id)) throw notFound('Task');
    return listNotes(ctx.db, req.params.id);
  });
  app.post<IdParams>('/api/tasks/:id/notes', async (req, reply) => {
    const { body, type } = NoteCreateSchema.parse(req.body);
    return reply.code(201).send(addNote(ctx, req.params.id, body, type));
  });
  app.patch<IdParams>('/api/notes/:id', async (req) =>
    updateNote(ctx, req.params.id, NotePatchSchema.parse(req.body).body),
  );
  app.delete<IdParams>('/api/notes/:id', async (req) => deleteNote(ctx, req.params.id));

  // Reminders
  app.get('/api/reminders/upcoming', async (req) => {
    const within = WithinSchema.parse(req.query).within ?? '24h';
    const unit = within.slice(-1) as keyof typeof UNIT_MS;
    return upcomingReminders(ctx, Number(within.slice(0, -1)) * UNIT_MS[unit]);
  });
  app.post<IdParams>('/api/tasks/:id/reminders', async (req, reply) =>
    reply.code(201).send(addReminder(ctx, req.params.id, ReminderCreateSchema.parse(req.body))),
  );
  app.post<IdParams>('/api/reminders/:id/snooze', async (req, reply) =>
    reply.code(201).send(snoozeReminder(ctx, req.params.id, SnoozeSchema.parse(req.body).minutes)),
  );
  app.get('/api/reminders/rang', async () => rangReminders(ctx));
  app.post<IdParams>('/api/reminders/:id/dismiss', async (req) =>
    dismissReminder(ctx, req.params.id),
  );
  app.delete<IdParams>('/api/reminders/:id', async (req) => deleteReminder(ctx, req.params.id));

  // Focus
  app.post('/api/focus', async (req, reply) => {
    const { taskId, plannedMin } = FocusStartSchema.parse(req.body);
    return reply.code(201).send(startFocus(ctx, taskId, plannedMin));
  });
  app.post<IdParams>('/api/focus/:id/end', async (req) => {
    const { outcome, note } = FocusEndSchema.parse(req.body);
    return endFocus(ctx, req.params.id, outcome, note);
  });
}
