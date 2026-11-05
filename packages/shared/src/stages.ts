export const STAGES = ['new', 'in_process', 'pending', 'done', 'postponed'] as const;
export type Stage = (typeof STAGES)[number];

export interface StageMeta {
  en: string;
  ar: string;
  /** CSS custom property from tokens.css that colors this stage. */
  token: `--stage-${string}`;
}

export const STAGE_META: Record<Stage, StageMeta> = {
  new: { en: 'New', ar: 'جديد', token: '--stage-new' },
  in_process: { en: 'In process', ar: 'قيد التنفيذ', token: '--stage-progress' },
  pending: { en: 'Pending', ar: 'معلّق', token: '--stage-pending' },
  done: { en: 'Done', ar: 'تم', token: '--stage-done' },
  postponed: { en: 'Postponed', ar: 'مؤجّل', token: '--stage-postponed' },
};

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value);
}
