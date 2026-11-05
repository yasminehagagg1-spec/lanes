import { useEffect } from 'react';
import { STAGES, type Stage, type Task } from '@lanes/shared';
import { useUi } from '@/lib/store';
import { useMoveFlow } from './useMoveFlow';
import { useFocusFor } from './useFocusFor';

const focusCard = (id: string | undefined) => {
  if (id) document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)?.focus();
};

/** Keyboard: / search · N add · ←↑→↓ move between cards · 1–5 move selected card · Enter opens. */
export function useBoardKeys(groups: Record<Stage, Task[]>) {
  const moveFlow = useMoveFlow();
  const focusFor = useFocusFor();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui0 = useUi.getState();
      if (ui0.focus) return;
      // ⌘K opens quick capture from anywhere (except over another dialog).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        ui0.openQuickAdd('new');
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const ui = useUi.getState();
      if (ui.drawerId || ui.held || ui.quickAdd.open || ui.dragging || ui.pickOpen) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;

      const key = e.key.toLowerCase();
      if (key === '/') {
        e.preventDefault();
        window.dispatchEvent(new Event('lanes:focus-search'));
        return;
      }
      if (key === 'n') {
        e.preventDefault();
        ui.openQuickAdd('new');
        return;
      }
      if (key === 'p') {
        e.preventDefault();
        ui.openPick(true);
        return;
      }
      if (key === 'f') {
        e.preventDefault();
        focusFor(groups);
        return;
      }

      const visible = STAGES.filter((s) => groups[s].length > 0);
      const selected = ui.selectedId;
      const where = selected
        ? STAGES.map((s) => ({ s, i: groups[s].findIndex((t) => t.id === selected) })).find(
            (x) => x.i >= 0,
          )
        : undefined;

      if (/^[1-5]$/.test(key) && where) {
        e.preventDefault();
        const to = STAGES[Number(key) - 1];
        const task = groups[where.s][where.i];
        if (to && task) moveFlow(task.id, task.stage, to);
        return;
      }

      const arrows = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
      if (!arrows.includes(key)) return;
      e.preventDefault();

      if (!where) {
        const first = visible[0];
        focusCard(first ? groups[first][0]?.id : undefined);
        return;
      }

      const back = key === 'arrowup' || key === 'arrowleft';
      if (ui.view === 'list') {
        // The list is one column: every arrow walks the stages in order.
        const flat = STAGES.flatMap((s) => groups[s]);
        const i = flat.findIndex((t) => t.id === selected);
        focusCard(flat[back ? i - 1 : i + 1]?.id);
        return;
      }
      if (key === 'arrowup' || key === 'arrowdown') {
        focusCard(groups[where.s][back ? where.i - 1 : where.i + 1]?.id);
        return;
      }

      const laneIndex = visible.indexOf(where.s);
      const nextLane = visible[back ? laneIndex - 1 : laneIndex + 1];
      if (!nextLane) return;
      const lane = groups[nextLane];
      focusCard(lane[Math.min(where.i, lane.length - 1)]?.id);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groups, moveFlow, focusFor]);
}
