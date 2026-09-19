<script setup lang="ts">
/**
 * Visual card: back / front, flip and reversed animation.
 * Size comes from the `--card-w` / `--card-h` CSS variables of an ancestor;
 * `scale` shrinks the face around its centre (Minor Arcana are a bit smaller)
 * without changing the box the parent lays out.
 * The front image is only requested once the card is shown face up (or the
 * parent asks for it), so a full deck does not download 22 images at start.
 */
import { computed, ref, watch } from 'vue';
import type { Face } from '../engine/types';

const props = withDefaults(
  defineProps<{
    face: Face;
    reversed?: boolean;
    frontSrc?: string | null;
    backSrc?: string | null;
    fit?: 'cover' | 'contain';
    alt?: string;
    /** Force the front image to load even while face down (e.g. for prefetch). */
    preloadFront?: boolean;
    animated?: boolean;
    /** Relative size of the face (1 = the full card box). */
    scale?: number;
  }>(),
  { reversed: false, frontSrc: null, backSrc: null, fit: 'cover', alt: '', preloadFront: false, animated: true, scale: 1 },
);

const frontWanted = ref(props.face === 'up' || props.preloadFront);
watch(
  () => [props.face, props.preloadFront] as const,
  ([face, pre]) => {
    if (face === 'up' || pre) frontWanted.value = true;
  },
);

const backFailed = ref(false);
const frontFailed = ref(false);
watch(() => props.backSrc, () => (backFailed.value = false));
watch(() => props.frontSrc, () => (frontFailed.value = false));

const showBackImage = computed(() => Boolean(props.backSrc) && !backFailed.value);
const showFrontImage = computed(() => Boolean(props.frontSrc) && frontWanted.value && !frontFailed.value);
</script>

<template>
  <div
    class="card"
    :class="{ 'is-up': face === 'up', 'is-reversed': reversed, 'no-anim': !animated }"
    :style="{ '--fit': fit, '--card-scale': scale }"
  >
    <div class="card-inner">
      <div class="face back" aria-hidden="true">
        <div class="back-fallback"><span>✦</span></div>
        <img
          v-if="showBackImage"
          class="art"
          :src="backSrc!"
          alt=""
          draggable="false"
          decoding="async"
          @error="backFailed = true"
        />
      </div>
      <div class="face front">
        <img
          v-if="showFrontImage"
          class="art"
          :src="frontSrc!"
          :alt="alt"
          draggable="false"
          decoding="async"
          @error="frontFailed = true"
        />
        <div v-else class="front-fallback">
          <span>{{ alt }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  width: var(--card-w, 120px);
  height: var(--card-h, 200px);
  perspective: 1000px;
  position: relative;
}
.card-inner {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform: scale(var(--card-scale, 1)) rotateY(0deg) rotateZ(0deg);
  will-change: transform;
}
.no-anim .card-inner { transition: none; }
.card.is-up .card-inner { transform: scale(var(--card-scale, 1)) rotateY(180deg) rotateZ(0deg); }
.card.is-up.is-reversed .card-inner { transform: scale(var(--card-scale, 1)) rotateY(180deg) rotateZ(180deg); }

.face {
  position: absolute;
  inset: 0;
  border-radius: calc(var(--card-w, 120px) * 0.07);
  overflow: hidden;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
  background: #000;
}
.front { transform: rotateY(180deg); }

.art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: var(--fit, cover);
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
  border-radius: inherit;
  background: #0b0b10;
}

.back-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
  font-size: calc(var(--card-w, 120px) * 0.28);
  background: radial-gradient(circle, #1a1a2e 0%, #0a0a0f 100%);
}
.back-fallback span {
  width: calc(100% - 12px);
  height: calc(100% - 12px);
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
}
.front-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8%;
  text-align: center;
  color: #1c1a17;
  background: #fbf9f5;
  font-family: var(--font-display);
  font-size: calc(var(--card-w, 120px) * 0.11);
  border: 4px double var(--color-accent);
  border-radius: inherit;
}
</style>
