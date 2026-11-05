import { useCallback } from 'react';
import type { Stage, Task } from '@lanes/shared';
import { useStartFocus } from '@/features/focus/FocusMode';
import { useUi } from '@/lib/store';

/**
 * "Focus" without saying on what: the selected card, else the top In process card,
 * else ask Pick for me.
 */
export function useFocusFor() {
  const startFocus = useStartFocus();
  return useCallback(
    (groups: Record<Stage, Task[]>) => {
      const ui = useUi.getState();
      const all = Object.values(groups).flat();
      const selected = all.find((t) => t.id === ui.selectedId && t.stage !== 'done');
      const target = selected ?? groups.in_process[0];
      if (target) startFocus(target);
      else ui.openPick(true);
    },
    [startFocus],
  );
}
