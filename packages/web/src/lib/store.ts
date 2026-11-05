import type { Energy, Priority, Stage, TaskSource } from '@lanes/shared';
import { create } from 'zustand';

export type DueFilter = 'today' | 'week' | 'overdue';

export interface Filters {
  projectId: string | null;
  priority: Priority | null;
  energy: Energy | null;
  due: DueFilter | null;
  source: TaskSource | null;
}

export const NO_FILTERS: Filters = {
  projectId: null,
  priority: null,
  energy: null,
  due: null,
  source: null,
};

/** A move waiting for the Pending reason or the Postponed date. */
export interface HeldMove {
  id: string;
  stage: 'pending' | 'postponed';
  beforeId?: string | undefined;
  afterId?: string | undefined;
}

/** Focus mode. Kept in localStorage so a reload resumes the timer. */
export interface FocusState {
  taskId: string;
  phase: 'setup' | 'running' | 'timeup' | 'stopping';
  plannedMin: number;
  sessionId?: string;
  /** Epoch ms. */
  startedAt?: number;
  /** "+5 min" presses. */
  extraMin: number;
}

export type ServerState = 'connecting' | 'live' | 'sleeping';

interface UiState {
  view: 'board' | 'list';
  filters: Filters;
  search: string;
  includeDone: 'today' | 'all';
  selectedId: string | null;
  drawerId: string | null;
  held: HeldMove | null;
  quickAdd: { open: boolean; stage: Stage };
  server: ServerState;
  dragging: boolean;
  /** Card that just landed in Done (plays the stamp). */
  justDone: string | null;
  stickerSpins: number;
  settingsOpen: boolean;
  focus: FocusState | null;
  pickOpen: boolean;

  setView: (view: UiState['view']) => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clearFilters: () => void;
  setSearch: (search: string) => void;
  setIncludeDone: (v: UiState['includeDone']) => void;
  select: (id: string | null) => void;
  openDrawer: (id: string | null) => void;
  hold: (move: HeldMove | null) => void;
  openQuickAdd: (stage?: Stage) => void;
  closeQuickAdd: () => void;
  setServer: (s: ServerState) => void;
  setDragging: (dragging: boolean) => void;
  stamp: (id: string) => void;
  spinSticker: () => void;
  openSettings: (open: boolean) => void;
  setFocus: (focus: FocusState | null) => void;
  openPick: (open: boolean) => void;
}

const FOCUS_KEY = 'lanes.focus';

function loadFocus(): FocusState | null {
  try {
    const raw = localStorage.getItem(FOCUS_KEY);
    const f = raw ? (JSON.parse(raw) as FocusState) : null;
    // Only a running session is worth resuming.
    return f && f.phase !== 'setup' && f.sessionId ? f : null;
  } catch {
    return null;
  }
}

function saveFocus(focus: FocusState | null) {
  try {
    if (focus) localStorage.setItem(FOCUS_KEY, JSON.stringify(focus));
    else localStorage.removeItem(FOCUS_KEY);
  } catch {
    // Private mode etc. — focus still works, it just won't survive a reload.
  }
}

export const useUi = create<UiState>((set) => ({
  view: 'board',
  filters: NO_FILTERS,
  search: '',
  includeDone: 'today',
  selectedId: null,
  drawerId: null,
  held: null,
  quickAdd: { open: false, stage: 'new' },
  server: 'connecting',
  dragging: false,
  justDone: null,
  stickerSpins: 0,
  settingsOpen: false,
  focus: loadFocus(),
  pickOpen: false,

  setView: (view) => set({ view }),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearFilters: () => set({ filters: NO_FILTERS, search: '' }),
  setSearch: (search) => set({ search }),
  setIncludeDone: (includeDone) => set({ includeDone }),
  select: (selectedId) => set({ selectedId }),
  openDrawer: (drawerId) => set({ drawerId }),
  hold: (held) => set({ held }),
  openQuickAdd: (stage = 'new') => set({ quickAdd: { open: true, stage } }),
  closeQuickAdd: () => set((s) => ({ quickAdd: { ...s.quickAdd, open: false } })),
  setServer: (server) => set({ server }),
  setDragging: (dragging) => set({ dragging }),
  stamp: (id) => {
    set({ justDone: id });
    setTimeout(() => set((s) => (s.justDone === id ? { justDone: null } : {})), 1200);
  },
  spinSticker: () => set((s) => ({ stickerSpins: s.stickerSpins + 1 })),
  openSettings: (settingsOpen) => set({ settingsOpen }),
  setFocus: (focus) => {
    saveFocus(focus);
    set({ focus });
  },
  openPick: (pickOpen) => set({ pickOpen }),
}));
