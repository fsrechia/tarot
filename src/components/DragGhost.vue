<script setup lang="ts">
/** The card that follows the pointer while dragging. */
import { computed } from 'vue';
import Card from './Card.vue';
import type { CardSize } from '../engine/geometry';
import type { TableCard } from '../engine/types';

const props = defineProps<{
  card: TableCard;
  clientX: number;
  clientY: number;
  grabX: number;
  grabY: number;
  cardSize: CardSize;
  zoom: number;
  frontSrc: string | null;
  backSrc: string | null;
  fit: 'cover' | 'contain';
  alt: string;
}>();

const style = computed(() => {
  const w = props.cardSize.width * props.zoom;
  const h = props.cardSize.height * props.zoom;
  return {
    left: `${props.clientX - props.grabX * w}px`,
    top: `${props.clientY - props.grabY * h}px`,
    transform: `scale(${props.zoom})`,
  };
});
</script>

<template>
  <div class="ghost" :style="style" aria-hidden="true">
    <Card :face="card.face" :reversed="card.reversed" :front-src="frontSrc" :back-src="backSrc" :fit="fit" :alt="alt" :animated="false" />
  </div>
</template>

<style scoped>
.ghost {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  transform-origin: top left;
  filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.7));
  will-change: left, top;
}
</style>
