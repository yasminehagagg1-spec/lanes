import { z } from 'zod';
import { STAGES, type Stage } from './stages.js';
import { REMINDER_PRESETS } from './time.js';

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const ENERGIES = ['low', 'medium', 'high'] as const;
export const SOURCES = ['manual', 'quick_capture', 'claude'] as const;
export const NOTE_TYPES = [
  'note',
  'pending_reason',
  'stage_change',
  'focus_log',
  'claude',
] as const;
export const FOCUS_OUTCOMES = ['completed_task', 'stopped', 'extended'] as const;
export const CELEBRATION_LEVELS = ['full', 'subtle', 'off'] as const;
/** Project palette tokens from tokens.css (`--p-blue` …), assigned in this order. */
export const PROJECT_COLORS = [
  'p-blue',
  'p-yellow',
  'p-ink',
  'p-orange',
  'p-teal',
  'p-violet',
  'p-rose',
  'p-olive',
] as const;

export type Priority = (typeof PRIORITIES)[number];
export type Energy = (typeof ENERGIES)[number];
export type TaskSource = (typeof SOURCES)[number];
export type NoteType = (typeof NOTE_TYPES)[number];
export type FocusOutcome = (typeof FOCUS_OUTCOMES)[number];
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const StageSchema = z.enum(STAGES);
export const PrioritySchema = z.enum(PRIORITIES);
export const EnergySchema = z.enum(ENERGIES);
export const SourceSchema = z.enum(SOURCES);

const DateTime = z.iso.datetime({ offset: true });
const LocalDate = z.iso.date();
/** A full date-time, or a bare YYYY-MM-DD meaning "that day, no time". */
const DueValue = z.union([DateTime, LocalDate]);
const Id = z.string().min(1).max(64);
const Text = (max: number) => z.string().trim().min(1).max(max);

// ---------- Inputs ----------

export const TaskDraftSchema = z.object({
  title: Text(300),
  description: z.string().max(20_000).optional(),
  stage: StageSchema.optional(),
  project: Text(80).optional(),
  priority: PrioritySchema.optional(),
  energy: EnergySchema.optional(),
  dueAt: DueValue.optional(),
  dueHasTime: z.boolean().optional(),
  estimateMin: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  subtasks: z.array(Text(300)).max(100).optional(),
  notes: z.array(Text(20_000)).max(50).optional(),
  reminders: z
    .array(z.object({ fireAt: DateTime, message: z.string().trim().max(500).optional() }))
    .max(20)
    .optional(),
  /** Required when stage is `pending` (enforced by moveTask/createTask on the server). */
  pendingReason: Text(500).optional(),
  resumeOn: LocalDate.optional(),
  source: SourceSchema.optional(),
});
export type TaskDraft = z.infer<typeof TaskDraftSchema>;

export const TaskPatchSchema = z
  .object({
    title: Text(300),
    description: z.string().max(20_000),
    project: Text(80).nullable(),
    priority: PrioritySchema,
    energy: EnergySchema.nullable(),
    dueAt: DueValue.nullable(),
    dueHasTime: z.boolean(),
    estimateMin: z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .nullable(),
    resumeOn: LocalDate.nullable(),
  })
  .partial()
  .strict(); // stage changes must go through /move
export type TaskPatch = z.infer<typeof TaskPatchSchema>;

export const MoveInputSchema = z
  .object({
    stage: StageSchema,
    pendingReason: Text(500).optional(),
    resumeOn: LocalDate.nullable().optional(),
    beforeId: Id.optional(),
    afterId: Id.optional(),
  })
  .strict();
export type MoveInput = z.infer<typeof MoveInputSchema>;

export const TaskQuerySchema = z.object({
  stage: StageSchema.optional(),
  project: z.string().optional(),
  priority: PrioritySchema.optional(),
  energy: EnergySchema.optional(),
  due: z.enum(['today', 'week', 'overdue']).optional(),
  source: SourceSchema.optional(),
  q: z.string().max(200).optional(),
  includeDone: z.enum(['today', 'all']).optional(),
});
export type TaskQuery = z.infer<typeof TaskQuerySchema>;

export const PickQuerySchema = z.object({
  energy: EnergySchema.optional(),
  minutes: z.coerce
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  /** Comma-separated ids already skipped ("Not this one"). */
  exclude: z.string().max(2000).optional(),
});

export const SubtaskCreateSchema = z.object({ title: Text(300) }).strict();
export const SubtaskPatchSchema = z
  .object({ title: Text(300), done: z.boolean(), position: z.number().finite() })
  .partial()
  .strict();

export const NoteCreateSchema = z
  .object({ body: Text(20_000), type: z.enum(['note', 'claude']).optional() })
  .strict();
export const NotePatchSchema = z.object({ body: Text(20_000) }).strict();

export const ReminderCreateSchema = z.union([
  z.object({ fireAt: DateTime, message: z.string().trim().max(500).optional() }).strict(),
  z
    .object({ preset: z.enum(REMINDER_PRESETS), message: z.string().trim().max(500).optional() })
    .strict(),
]);
export const SnoozeSchema = z
  .object({
    minutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
  })
  .strict();

export const ProjectCreateSchema = z
  .object({ name: Text(80), color: z.enum(PROJECT_COLORS).optional() })
  .strict();
export const ProjectPatchSchema = z
  .object({ name: Text(80), color: z.enum(PROJECT_COLORS), archived: z.boolean() })
  .partial()
  .strict();

export const FocusStartSchema = z
  .object({ taskId: Id, plannedMin: z.number().int().min(1).max(240) })
  .strict();
export const FocusEndSchema = z
  .object({ outcome: z.enum(FOCUS_OUTCOMES), note: z.string().trim().max(2000).optional() })
  .strict();

export const SettingsSchema = z.object({
  displayName: Text(40),
  dailyGoal: z.number().int().min(1).max(50),
  dayStartHour: z.number().int().min(0).max(12),
  sounds: z.boolean(),
  celebration: z.enum(CELEBRATION_LEVELS),
  theme: z.enum(['light', 'dark']),
  weekStartsOn: z.number().int().min(0).max(6),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const SettingsPatchSchema = SettingsSchema.partial().strict();

export const DEFAULT_SETTINGS: Settings = {
  displayName: 'there',
  dailyGoal: 5,
  dayStartHour: 6,
  sounds: true,
  celebration: 'full',
  theme: 'light',
  weekStartsOn: 6,
};

// ---------- Outputs ----------

export interface Project {
  id: string;
  name: string;
  color: ProjectColor;
  archived: boolean;
  createdAt: string;
  openCount?: number;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  position: number;
  doneAt: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  stage: Stage;
  position: number;
  project: { id: string; name: string; color: ProjectColor } | null;
  priority: Priority;
  energy: Energy | null;
  dueAt: string | null;
  dueHasTime: boolean;
  estimateMin: number | null;
  resumeOn: string | null;
  source: TaskSource;
  /** Latest pending_reason note while the task is in Pending. */
  pendingReason: string | null;
  subtasks: Subtask[];
  /** notes excludes automatic stage-change entries; focusMin = total focused minutes. */
  counts: { notes: number; reminders: number; focusMin: number };
  nextReminderAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Note {
  id: string;
  taskId: string;
  body: string;
  type: NoteType;
  stage: Stage;
  createdAt: string;
}

export interface Reminder {
  id: string;
  taskId: string;
  fireAt: string;
  message: string | null;
  firedAt: string | null;
  dismissed: boolean;
  createdAt: string;
}

export interface FocusSession {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt: string | null;
  plannedMin: number;
  actualMin: number | null;
  outcome: FocusOutcome | null;
}

export interface TaskDetail extends Task {
  notes: Note[];
  reminders: Reminder[];
  focusSessions: FocusSession[];
}

export interface ApiError {
  error: { code: string; message: string };
}
