/**
 * Reactive wrapper around the pure table engine with undo/redo and autosave.
 */
import { computed, ref, watch } from 'vue';
import type { GameDef, SpreadDef, TableState } from '../engine/types';
import * as table from '../engine/table';

const STORAGE_KEY = 'tarot.table.v1';
const HISTORY_LIMIT = 60;

export function loadSavedTable(): TableState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TableState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.deck) || !Array.isArray(parsed.slots) || !Array.isArray(parsed.loose)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * True when a saved state is consistent with the given game and spread: its
 * cards must be one of the game's card sets (with or without the Minor Arcana).
 */
export function isCompatible(state: TableState, game: GameDef, spread: SpreadDef): boolean {
  if (state.gameId !== game.id || state.spreadId !== spread.id) return false;
  if (state.slots.length !== spread.slots.length) return false;
  const all = table.allCards(state);
  return all.every((c) => c && typeof c.id === 'string') && table.isCardSet(all.map((c) => c.id), game);
}

export function useTable(initial: TableState) {
  const state = ref<TableState>(initial);
  const past = ref<TableState[]>([]);
  const future = ref<TableState[]>([]);

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  /** Applies a new state as an undoable step. */
  const commit = (next: TableState) => {
    if (next === state.value) return;
    past.value = [...past.value.slice(-(HISTORY_LIMIT - 1)), state.value];
    future.value = [];
    state.value = next;
  };

  /** Replaces the state without recording history (new reading, restore). */
  const replace = (next: TableState) => {
    past.value = [];
    future.value = [];
    state.value = next;
  };

  /**
   * Replaces the current state without a new history entry, so a two-step
   * action (gather, then the shuffled order) undoes as one step.
   */
  const amend = (next: TableState) => {
    state.value = next;
  };

  const undo = () => {
    const prev = past.value[past.value.length - 1];
    if (!prev) return;
    past.value = past.value.slice(0, -1);
    future.value = [state.value, ...future.value];
    state.value = prev;
  };

  const redo = () => {
    const next = future.value[0];
    if (!next) return;
    future.value = future.value.slice(1);
    past.value = [...past.value, state.value];
    state.value = next;
  };

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let autosave = true;
  /** Guests at a shared table must not overwrite their own saved table. */
  const setAutosave = (on: boolean) => {
    autosave = on;
  };
  watch(
    state,
    (s) => {
      if (!autosave) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        } catch {
          /* ignore */
        }
      }, 150);
    },
    { deep: false },
  );

  return { state, commit, replace, amend, undo, redo, canUndo, canRedo, setAutosave, ops: table };
}
