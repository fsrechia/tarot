<script setup lang="ts">
/** Bottom sheet / modal with the card art, name, keywords and meanings. */
import { onBeforeUnmount, onMounted } from 'vue';
import Card from './Card.vue';
import type { CardDef, TableCard } from '../engine/types';
import { useI18n } from '../composables/useI18n';

defineProps<{
  card: TableCard;
  def: CardDef | undefined;
  positionLabel: string | null;
  frontSrc: string | null;
  backSrc: string | null;
  fit: 'cover' | 'contain';
  hasPrev: boolean;
  hasNext: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'flip'): void;
  (e: 'prev'): void;
  (e: 'next'): void;
}>();

const { t, l, ll } = useI18n();

const onKey = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape') emit('close');
  else if (ev.key === 'ArrowLeft') emit('prev');
  else if (ev.key === 'ArrowRight') emit('next');
};
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal panel detail" role="dialog" aria-modal="true" :aria-label="def ? l(def.name) : ''">
      <div class="modal-title-row">
        <h2>{{ card.face === 'up' && def ? l(def.name) : '✦' }}</h2>
        <button class="btn btn-icon" type="button" :aria-label="t('card.close')" @click="emit('close')">✕</button>
      </div>

      <div class="body">
        <div class="art">
          <Card :face="card.face" :reversed="card.reversed" :front-src="frontSrc" :back-src="backSrc" :fit="fit" :alt="def ? l(def.name) : ''" />
        </div>

        <div class="text">
          <p v-if="positionLabel" class="meta"><strong>{{ t('card.position') }}:</strong> {{ positionLabel }}</p>

          <template v-if="card.face === 'down'">
            <p>{{ t('card.hidden') }}</p>
            <button class="btn btn-primary" type="button" @click="emit('flip')">{{ t('card.flip') }}</button>
          </template>

          <template v-else-if="def">
            <p class="meta">
              <span class="badge" :class="{ rev: card.reversed }">{{ card.reversed ? t('card.reversed') : t('card.upright') }}</span>
            </p>
            <p v-if="def.keywords" class="keywords">
              <span v-for="k in ll(def.keywords)" :key="k" class="kw">{{ k }}</span>
            </p>
            <template v-if="def.meaning">
              <h3>{{ card.reversed ? t('card.meaningReversed') : t('card.meaningUpright') }}</h3>
              <p>{{ l(card.reversed ? def.meaning.reversed : def.meaning.upright) }}</p>
              <h3 class="secondary">{{ card.reversed ? t('card.meaningUpright') : t('card.meaningReversed') }}</h3>
              <p class="secondary">{{ l(card.reversed ? def.meaning.upright : def.meaning.reversed) }}</p>
            </template>
          </template>
        </div>
      </div>

      <div class="nav">
        <button class="btn" type="button" :disabled="!hasPrev" @click="emit('prev')">‹ {{ t('card.previous') }}</button>
        <button class="btn" type="button" :disabled="!hasNext" @click="emit('next')">{{ t('card.next') }} ›</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail { --card-w: min(46vw, 220px); --card-h: calc(var(--card-w) / var(--detail-aspect, 0.6)); }
.body { display: grid; grid-template-columns: var(--card-w) 1fr; gap: 1rem; align-items: start; }
@media (max-width: 480px) { .body { grid-template-columns: 1fr; justify-items: center; } .text { width: 100%; } }
.art { display: flex; justify-content: center; }
.text p { margin: 0 0 0.6rem; line-height: 1.5; }
.meta { color: var(--color-text-muted); font-size: 0.9rem; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #2e3a2e; color: #b7e3b7; font-size: 0.8rem; font-weight: 600; }
.badge.rev { background: #3a2e2e; color: #f0b7b7; }
.keywords { display: flex; flex-wrap: wrap; gap: 6px; }
.kw { padding: 3px 10px; border-radius: 999px; background: #262630; font-size: 0.8rem; color: var(--color-accent); }
h3 { margin: 0.8rem 0 0.3rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); }
.secondary { opacity: 0.7; }
.nav { display: flex; justify-content: space-between; gap: 8px; margin-top: 1rem; }
</style>
