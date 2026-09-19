<script setup lang="ts">
/**
 * The zoomable table: spread slots (drop targets), placed cards and loose
 * cards, positioned from spread data in card units.
 */
import Card from './Card.vue';
import type { CardSize } from '../engine/geometry';
import type { CardDef, DeckDef, Location, SpreadDef, TableState } from '../engine/types';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{
  spread: SpreadDef;
  state: TableState;
  cardSize: CardSize;
  cardsById: Map<string, CardDef>;
  deck: DeckDef;
  transform: string;
  imageFor: (key: string) => string | null;
  /** Back image for a card id (Minor Arcana may have their own back). */
  backFor: (id: string) => string | null;
  /** Relative size of a card id (Minor Arcana are a bit smaller). */
  scaleFor: (id: string) => number;
  /** Card currently being dragged (hidden at its source). */
  dragging: Location | null;
  /** Colour of the remote player holding a card, by `kind:index`. */
  held?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'card-down', ev: PointerEvent, loc: Location, el: HTMLElement): void;
  (e: 'activate', loc: Location): void;
  (e: 'info', loc: Location): void;
}>();

const { t, l } = useI18n();

const isDragging = (loc: Location) =>
  props.dragging?.kind === loc.kind && props.dragging.index === loc.index;

const heldStyle = (loc: Location) => {
  const color = props.held?.[`${loc.kind}:${loc.index}`];
  return color ? { '--held': color } : {};
};

const slotStyle = (x: number, y: number, rotation = 0) => ({
  left: `${x * props.cardSize.width - props.cardSize.width / 2}px`,
  top: `${y * props.cardSize.height - props.cardSize.height / 2}px`,
  '--slot-rot': `${rotation}deg`,
});

const cardName = (id: string) => l(props.cardsById.get(id)?.name) || id;

const stateLabel = (c: { face: string; reversed: boolean }) =>
  c.face === 'down' ? t('card.faceDown') : c.reversed ? t('card.reversed') : t('card.upright');

const onDown = (ev: PointerEvent, loc: Location) => {
  emit('card-down', ev, loc, ev.currentTarget as HTMLElement);
};

const onKey = (ev: KeyboardEvent, loc: Location) => {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    emit('activate', loc);
  } else if (ev.key === 'i' || ev.key === 'I') {
    emit('info', loc);
  }
};
</script>

<template>
  <div class="canvas" :style="{ transform }">
    <div
      v-for="(slot, index) in spread.slots"
      :key="slot.id"
      class="slot"
      :class="{ 'is-rotated': (slot.rotation ?? 0) !== 0 }"
      :style="slotStyle(slot.x, slot.y, slot.rotation)"
      :data-slot-index="index"
    >
      <div class="slot-box">
        <div v-if="!state.slots[index]" class="placeholder" :aria-label="t('a11y.slotEmpty', { label: l(slot.label) })"></div>
        <div
          v-else
          class="holder"
          :class="{ 'is-hidden': isDragging({ kind: 'slot', index }), 'is-held': !!held?.[`slot:${index}`] }"
          :style="heldStyle({ kind: 'slot', index })"
          data-card
          role="button"
          tabindex="0"
          :aria-label="t('a11y.cardIn', { name: cardName(state.slots[index]!.id), state: stateLabel(state.slots[index]!), label: l(slot.label) })"
          @pointerdown="onDown($event, { kind: 'slot', index })"
          @keydown="onKey($event, { kind: 'slot', index })"
        >
          <Card
            :face="state.slots[index]!.face"
            :reversed="state.slots[index]!.reversed"
            :front-src="imageFor(state.slots[index]!.id)"
            :back-src="backFor(state.slots[index]!.id)"
            :scale="scaleFor(state.slots[index]!.id)"
            :fit="deck.fit"
            :alt="cardName(state.slots[index]!.id)"
          />
          <button
            v-if="state.slots[index]!.face === 'up'"
            class="info"
            type="button"
            :aria-label="cardName(state.slots[index]!.id)"
            @pointerdown.stop
            @click.stop="emit('info', { kind: 'slot', index })"
          >i</button>
        </div>
      </div>
      <div v-if="slot.labelPlacement !== 'none'" class="label" :class="slot.labelPlacement === 'top' ? 'at-top' : 'at-bottom'">
        {{ l(slot.label) }}
      </div>
    </div>

    <div
      v-for="(card, index) in state.loose"
      :key="card.id"
      class="loose holder"
      :class="{ 'is-hidden': isDragging({ kind: 'loose', index }), 'is-held': !!held?.[`loose:${index}`] }"
      :style="{ ...slotStyle(card.x, card.y), zIndex: 100 + card.z, ...heldStyle({ kind: 'loose', index }) }"
      data-card
      role="button"
      tabindex="0"
      :aria-label="t('a11y.card', { name: cardName(card.id), state: stateLabel(card) })"
      @pointerdown="onDown($event, { kind: 'loose', index })"
      @keydown="onKey($event, { kind: 'loose', index })"
    >
      <Card
        :face="card.face"
        :reversed="card.reversed"
        :front-src="imageFor(card.id)"
        :back-src="backFor(card.id)"
        :scale="scaleFor(card.id)"
        :fit="deck.fit"
        :alt="cardName(card.id)"
      />
      <button
        v-if="card.face === 'up'"
        class="info"
        type="button"
        :aria-label="cardName(card.id)"
        @pointerdown.stop
        @click.stop="emit('info', { kind: 'loose', index })"
      >i</button>
    </div>
  </div>
</template>

<style scoped>
.canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
  will-change: transform;
}
.slot {
  position: absolute;
  width: var(--card-w);
  height: var(--card-h);
}
.slot-box {
  position: absolute;
  inset: 0;
  transform: rotate(var(--slot-rot, 0deg));
}
.slot.is-rotated { z-index: 2; }
.placeholder {
  position: absolute;
  inset: 0;
  border: 2px dashed rgba(255, 255, 255, 0.22);
  border-radius: calc(var(--card-w) * 0.07);
  background: rgba(255, 255, 255, 0.03);
}
.label {
  position: absolute;
  left: -50%;
  width: 200%;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}
.label.at-bottom { top: calc(100% + 6px); }
.label.at-top { bottom: calc(100% + 6px); }

.holder {
  position: absolute;
  inset: 0;
  cursor: grab;
  touch-action: none;
  border-radius: calc(var(--card-w) * 0.07);
  outline: none;
}
.holder:focus-visible { box-shadow: 0 0 0 3px var(--color-accent); }
.holder:active { cursor: grabbing; }
.holder.is-hidden { opacity: 0; pointer-events: none; }
.holder.is-held { box-shadow: 0 0 0 3px var(--held), 0 0 18px var(--held); animation: held-pulse 1.2s ease-in-out infinite; }
@keyframes held-pulse { 50% { box-shadow: 0 0 0 4px var(--held), 0 0 26px var(--held); } }
.loose {
  width: var(--card-w);
  height: var(--card-h);
  inset: auto;
}
.info {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(10, 10, 16, 0.75);
  color: #fff;
  font: 700 13px/1 var(--font-display);
  cursor: pointer;
  z-index: 3;
  touch-action: manipulation;
}
.info:hover { background: var(--color-accent); color: var(--color-accent-ink); }
</style>
