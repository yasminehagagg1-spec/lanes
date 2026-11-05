import { describe, expect, it } from 'vitest';
import { STAGES, STAGE_META, isStage } from './stages.js';

describe('stages', () => {
  it('has exactly the five stages in flow order', () => {
    expect(STAGES).toEqual(['new', 'in_process', 'pending', 'done', 'postponed']);
  });

  it('has bilingual labels and a token for every stage', () => {
    for (const stage of STAGES) {
      const meta = STAGE_META[stage];
      expect(meta.en.length).toBeGreaterThan(0);
      expect(meta.ar.length).toBeGreaterThan(0);
      expect(meta.token.startsWith('--stage-')).toBe(true);
    }
  });

  it('recognises valid stages only', () => {
    expect(isStage('pending')).toBe(true);
    expect(isStage('todo')).toBe(false);
    expect(isStage(3)).toBe(false);
  });
});
