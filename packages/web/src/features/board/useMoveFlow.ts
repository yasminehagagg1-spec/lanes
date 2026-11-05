import { useCallback } from 'react';
import type { Stage } from '@lanes/shared';
import { useMoveTask } from '@/lib/queries';
import { useUi } from '@/lib/store';

/**
 * Every UI path that changes a stage goes through here (drag, drawer pills, keys 1–5).
 * Pending asks for a reason and Postponed for a date first, so those moves are "held".
 */
export function useMoveFlow() {
  const move = useMoveTask();
  const hold = useUi((s) => s.hold);

  return useCallback(
    (id: string, from: Stage, to: Stage, ref: { afterId?: string; beforeId?: string } = {}) => {
      if (from !== to && (to === 'pending' || to === 'postponed')) {
        hold({ id, stage: to, ...ref });
        return;
      }
      move.mutate({ id, stage: to, ...ref });
    },
    [move, hold],
  );
}
