<script setup lang="ts">
/**
 * Top toolbar. Primary controls are always visible; everything else lives in
 * the "more" menu so the toolbar stays a single row on phones.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { DeckDef, Locale, SpreadDef } from '../engine/types';
import { useI18n } from '../composables/useI18n';
import { locales } from '../i18n';

defineProps<{
  decks: DeckDef[];
  deckId: string;
  spreads: SpreadDef[];
  spreadId: string;
  fanned: boolean;
  shuffling: boolean;
  canUndo: boolean;
  canRedo: boolean;
  allowReversed: boolean;
  minorArcana: boolean;
  /** Guests follow the host's deck; only the host decides on the Minor Arcana. */
  minorArcanaLocked: boolean;
  haptics: boolean;
  locale: Locale;
  deckIsCustom: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:deckId', id: string): void;
  (e: 'update:spreadId', id: string): void;
  (e: 'shuffle'): void;
  (e: 'toggle-fan'): void;
  (e: 'draw'): void;
  (e: 'deal'): void;
  (e: 'reveal'): void;
  (e: 'gather'): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'fit'): void;
  (e: 'new-reading'): void;
  (e: 'toggle-reversed'): void;
  (e: 'toggle-minor'): void;
  (e: 'toggle-haptics'): void;
  (e: 'set-locale', locale: Locale): void;
  (e: 'import-zip', file: File): void;
  (e: 'delete-deck'): void;
  (e: 'help'): void;
  (e: 'room'): void;
  (e: 'ask'): void;
}>();

const { t } = useI18n();
const menuOpen = ref(false);
const root = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const run = (fn: () => void) => {
  menuOpen.value = false;
  fn();
};

const onFile = (ev: Event) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit('import-zip', file);
  input.value = '';
  menuOpen.value = false;
};

const onDocPointer = (ev: PointerEvent) => {
  if (menuOpen.value && root.value && !root.value.contains(ev.target as Node)) menuOpen.value = false;
};
const onKey = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape') menuOpen.value = false;
};
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <header ref="root" class="toolbar ui">
    <label class="field">
      <span class="visually-hidden">{{ t('toolbar.deck') }}</span>
      <select class="select" :value="deckId" :title="t('toolbar.deck')" @change="emit('update:deckId', ($event.target as HTMLSelectElement).value)">
        <template v-if="decks.some((d) => d.custom)">
          <optgroup :label="t('toolbar.deck')">
            <option v-for="d in decks.filter((d) => !d.custom)" :key="d.id" :value="d.id">{{ d.name }}</option>
          </optgroup>
          <optgroup :label="t('deck.custom')">
            <option v-for="d in decks.filter((d) => d.custom)" :key="d.id" :value="d.id">{{ d.name }}</option>
          </optgroup>
        </template>
        <template v-else>
          <option v-for="d in decks" :key="d.id" :value="d.id">{{ d.name }}</option>
        </template>
      </select>
    </label>

    <label class="field">
      <span class="visually-hidden">{{ t('toolbar.spread') }}</span>
      <select class="select" :value="spreadId" :title="t('toolbar.spread')" @change="emit('update:spreadId', ($event.target as HTMLSelectElement).value)">
        <option v-for="s in spreads" :key="s.id" :value="s.id">{{ s.name[locale] ?? s.name.en }}</option>
      </select>
    </label>

    <button class="btn btn-primary" type="button" :disabled="shuffling" @click="emit('shuffle')">
      {{ shuffling ? t('toolbar.shuffling') : t('toolbar.shuffle') }}
    </button>

    <button class="btn btn-icon undo" type="button" :title="t('toolbar.undo')" :aria-label="t('toolbar.undo')" :disabled="!canUndo" @click="emit('undo')">↶</button>

    <button class="btn btn-icon ask" type="button" :title="t('toolbar.ask')" :aria-label="t('toolbar.ask')" data-testid="toolbar-ask" @click="emit('ask')">✦</button>

    <div class="more">
      <button
        class="btn btn-icon"
        type="button"
        :aria-label="t('toolbar.more')"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        @click="menuOpen = !menuOpen"
      >⋯</button>

      <div v-if="menuOpen" class="menu panel" role="menu">
        <button class="item" role="menuitem" @click="run(() => emit('toggle-fan'))">{{ fanned ? t('toolbar.stack') : t('toolbar.fan') }}</button>
        <button class="item" role="menuitem" @click="run(() => emit('draw'))">{{ t('toolbar.draw') }}</button>
        <button class="item" role="menuitem" @click="run(() => emit('deal'))">{{ t('toolbar.deal') }}</button>
        <button class="item" role="menuitem" @click="run(() => emit('reveal'))">{{ t('toolbar.reveal') }}</button>
        <button class="item" role="menuitem" @click="run(() => emit('gather'))">{{ t('toolbar.gather') }}</button>
        <button class="item" role="menuitem" :disabled="!canUndo" @click="run(() => emit('undo'))">{{ t('toolbar.undo') }}</button>
        <button class="item" role="menuitem" :disabled="!canRedo" @click="run(() => emit('redo'))">{{ t('toolbar.redo') }}</button>
        <hr />
        <button class="item" role="menuitem" @click="run(() => emit('fit'))">{{ t('toolbar.fit') }}</button>
        <button class="item" role="menuitem" @click="run(() => emit('new-reading'))">{{ t('toolbar.newReading') }}</button>
        <hr />
        <button class="item" role="menuitemcheckbox" :aria-checked="allowReversed" @click="emit('toggle-reversed')">
          <span class="check" aria-hidden="true">{{ allowReversed ? '☑' : '☐' }}</span> {{ t('toolbar.reversed') }}
        </button>
        <button class="item" role="menuitemcheckbox" :aria-checked="minorArcana" :disabled="minorArcanaLocked" data-testid="menu-minor" @click="run(() => emit('toggle-minor'))">
          <span class="check" aria-hidden="true">{{ minorArcana ? '☑' : '☐' }}</span> {{ t('toolbar.minorArcana') }}
        </button>
        <button class="item" role="menuitemcheckbox" :aria-checked="haptics" @click="emit('toggle-haptics')">
          <span class="check" aria-hidden="true">{{ haptics ? '☑' : '☐' }}</span> {{ t('toolbar.haptics') }}
        </button>
        <label class="item as-label">
          <span>{{ t('toolbar.language') }}</span>
          <select class="select small" :value="locale" @change="emit('set-locale', ($event.target as HTMLSelectElement).value as Locale)">
            <option v-for="loc in locales" :key="loc.id" :value="loc.id">{{ loc.label }}</option>
          </select>
        </label>
        <hr />
        <button class="item" role="menuitem" @click="fileInput?.click()">{{ t('toolbar.loadZip') }}</button>
        <input ref="fileInput" type="file" accept=".zip,application/zip" hidden @change="onFile" />
        <button v-if="deckIsCustom" class="item btn-danger" role="menuitem" @click="run(() => emit('delete-deck'))">{{ t('toolbar.deleteDeck') }}</button>
        <hr />
        <button class="item" role="menuitem" data-testid="menu-ask" @click="run(() => emit('ask'))">✦ {{ t('toolbar.ask') }}</button>
        <button class="item" role="menuitem" data-testid="menu-room" @click="run(() => emit('room'))">{{ t('toolbar.playTogether') }}</button>
        <button class="item" role="menuitem" @click="run(() => emit('help'))">{{ t('toolbar.help') }}</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  position: relative;
  z-index: 500;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: calc(6px + var(--safe-top)) calc(6px + var(--safe-right)) 6px calc(6px + var(--safe-left));
  background: rgba(20, 20, 26, 0.92);
  border-bottom: 1px solid var(--color-panel-border);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.field {
  /* Basis small enough that deck + spread + shuffle + ask + more fit one row at 360px. */
  flex: 1 1 72px;
  min-width: 0;
  display: flex;
}
.field .select { width: 100%; }
.more { position: static; }
/* On narrow phones undo lives in the menu (and Ctrl+Z / Z) so the bar stays one row. */
@media (max-width: 480px) { .undo { display: none; } }
.ask { color: var(--color-accent); }
.menu {
  /* Anchored to the toolbar, not the button, so it never opens off-screen. */
  position: absolute;
  right: calc(6px + var(--safe-right));
  top: calc(100% + 4px);
  min-width: 240px;
  max-width: calc(100vw - 16px);
  padding: 6px;
  display: flex;
  flex-direction: column;
  z-index: 600;
}
.menu hr { border: 0; border-top: 1px solid var(--color-panel-border); margin: 4px 0; }
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 42px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  font-size: 0.95rem;
  cursor: pointer;
  touch-action: manipulation;
}
.item:hover, .item:focus-visible { background: #2a2a34; outline: none; }
.item:disabled { opacity: 0.4; cursor: not-allowed; }
.item.as-label { justify-content: space-between; cursor: default; }
.item.as-label:hover { background: transparent; }
.check { width: 1.2em; }
.select.small { min-height: 34px; font-size: 0.85rem; }
</style>
