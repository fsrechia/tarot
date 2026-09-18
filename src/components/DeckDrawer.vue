<script setup lang="ts">
/**
 * The deck at the bottom of the table: a stack (only the top card is
 * grabbable, tap to draw) or a fan (any card is grabbable). The fan width
 * adapts to the available width so every card stays reachable on phones.
 */
import { computed } from 'vue';
import Card from './Card.vue';
import type { CardSize } from '../engine/geometry';
import type { TableCard } from '../engine/types';
import { useI18n } from '../composables/useI18n';

export interface Scatter {
  x: number;
  y: number;
  r: number;
}

const props = defineProps<{
  cards: TableCard[];
  fanned: boolean;
  cardSize: CardSize;
  backSrc: string | null;
  availableWidth: number;
  shuffling: boolean;
  scatter: Record<string, Scatter>;
  draggingIndex: number | null;
}>();

const emit = defineEmits<{
  (e: 'card-down', ev: PointerEvent, index: number, el: HTMLElement): void;
  (e: 'activate'): void;
}>();

const { t } = useI18n();

const count = computed(() => props.cards.length);

const fanSpacing = computed(() => {
  const n = count.value;
  if (n <= 1) return 0;
  const avail = Math.max(props.cardSize.width, props.availableWidth - 24);
  return Math.min(26, (avail - props.cardSize.width) / (n - 1));
});

const cardStyle = (card: TableCard, index: number) => {
  const n = count.value;
  if (props.shuffling) {
    const s = props.scatter[card.id] ?? { x: 0, y: 0, r: 0 };
    return {
      transform: `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg)`,
      zIndex: index,
      transition: 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
    };
  }
  if (props.fanned) {
    const offset = index - (n - 1) / 2;
    const lift = Math.abs(offset) * Math.abs(offset) * 0.35;
    return {
      transform: `translateX(${offset * fanSpacing.value}px) translateY(${lift}px) rotate(${offset * 1.4}deg)`,
      zIndex: index,
      transition: 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
    };
  }
  const depth = (n - 1 - index) * -0.4;
  return {
    transform: `translate(${depth}px, ${depth}px)`,
    zIndex: index,
    transition: 'transform 0.3s ease',
  };
};

const isGrabbable = (index: number) => props.fanned || index === count.value - 1;

const onDown = (ev: PointerEvent, index: number) => {
  if (!isGrabbable(index) || props.shuffling) return;
  emit('card-down', ev, index, ev.currentTarget as HTMLElement);
};

const onKey = (ev: KeyboardEvent) => {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    emit('activate');
  }
};
</script>

<template>
  <div class="drawer" :class="{ 'is-open': fanned, 'is-empty': count === 0 }" data-drop="deck">
    <div
      class="deck"
      role="button"
      tabindex="0"
      :aria-label="t('a11y.deck', { n: count })"
      @keydown="onKey"
    >
      <div
        v-for="(card, index) in cards"
        :key="card.id"
        class="deck-card"
        :class="{ 'is-grabbable': isGrabbable(index), 'is-hidden': draggingIndex === index }"
        :style="cardStyle(card, index)"
        data-card
        @pointerdown="onDown($event, index)"
      >
        <Card face="down" :back-src="backSrc" :animated="false" />
      </div>
      <div v-if="count === 0" class="empty"></div>
    </div>
    <div class="label" role="status" aria-live="polite">
      {{ count === 0 ? t('deck.empty') : t('deck.remaining', { n: count }) }}
    </div>
  </div>
</template>

<style scoped>
.drawer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-bottom: calc(var(--safe-bottom) + 6px);
  z-index: 300;
  /* Only the top part of the stack peeks out; the fan slides up. */
  transform: translateY(calc(var(--card-h) * 0.68));
  transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  touch-action: none;
}
.drawer.is-open { transform: translateY(calc(var(--card-h) * 0.42)); }
.drawer.is-empty { transform: translateY(calc(var(--card-h) * 0.8)); }

.deck {
  position: relative;
  width: var(--card-w);
  height: var(--card-h);
  outline: none;
  border-radius: calc(var(--card-w) * 0.07);
}
.deck:focus-visible { box-shadow: 0 0 0 3px var(--color-accent); }
.deck-card {
  position: absolute;
  inset: 0;
  touch-action: none;
}
.deck-card.is-grabbable { cursor: grab; }
.deck-card.is-hidden { opacity: 0; pointer-events: none; }
.empty {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: calc(var(--card-w) * 0.07);
  background: rgba(0, 0, 0, 0.25);
}
.label {
  color: var(--color-text-muted);
  font-size: 12px;
  letter-spacing: 0.05em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  order: -1;
  pointer-events: none;
}
</style>
