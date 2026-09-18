import { reactive, watch } from 'vue';
import type { Locale } from '../engine/types';
import { detectLocale, locales } from '../i18n';
import { QUALITY_MODEL } from '../ai/models';

export interface Settings {
  version: 1;
  locale: Locale;
  allowReversed: boolean;
  haptics: boolean;
  fanned: boolean;
  deckId: string | null;
  spreadId: string | null;
  seenHelp: boolean;
  nickname: string;
  /** AI reader (plans/ai-interpretation.md). The API key is stored separately. */
  aiConsent: boolean;
  aiModel: string;
  aiSendDeckNotes: boolean;
}

const KEY = 'tarot.settings.v1';

function defaults(): Settings {
  return {
    version: 1,
    locale: detectLocale(),
    allowReversed: true,
    haptics: true,
    fanned: false,
    deckId: null,
    spreadId: null,
    seenHelp: false,
    nickname: '',
    aiConsent: false,
    aiModel: QUALITY_MODEL,
    aiSendDeckNotes: true,
  };
}

function load(): Settings {
  const base = defaults();
  if (typeof localStorage === 'undefined') return base;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged: Settings = { ...base, ...parsed, version: 1 };
    // A locale this build does not ship (edited storage, an older/newer build)
    // would leave the language menu blank; fall back to detection.
    if (!locales.some((l) => l.id === merged.locale)) merged.locale = base.locale;
    return merged;
  } catch {
    return base;
  }
}

let settings: Settings | null = null;

/** App-wide settings, persisted to localStorage. Shared singleton. */
export function useSettings(): Settings {
  if (!settings) {
    settings = reactive(load());
    watch(
      settings,
      (s) => {
        try {
          localStorage.setItem(KEY, JSON.stringify(s));
        } catch {
          /* storage unavailable (private mode, quota) – settings stay in memory */
        }
      },
      { deep: true },
    );
  }
  return settings;
}
