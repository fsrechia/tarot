<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from '../composables/useI18n';

defineProps<{ credits?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const { t } = useI18n();

const onKey = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape') emit('close');
};
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal panel" role="dialog" aria-modal="true" :aria-label="t('help.title')">
      <div class="modal-title-row">
        <h2>{{ t('help.title') }}</h2>
        <button class="btn btn-icon" type="button" :aria-label="t('card.close')" @click="emit('close')">✕</button>
      </div>
      <ul class="tips">
        <li>{{ t('help.deckTap') }}</li>
        <li>{{ t('help.drag') }}</li>
        <li>{{ t('help.tap') }}</li>
        <li>{{ t('help.longPress') }}</li>
        <li>{{ t('help.pan') }}</li>
        <li class="desktop">{{ t('help.keys') }}</li>
        <li>{{ t('help.install') }}</li>
      </ul>
      <p v-if="credits" class="credits">{{ credits }}</p>
    </div>
  </div>
</template>

<style scoped>
.tips { margin: 0; padding-left: 1.2rem; line-height: 1.6; }
.tips li + li { margin-top: 0.4rem; }
.credits { margin: 1rem 0 0; color: var(--color-text-muted); font-size: 0.85rem; }
@media (pointer: coarse) { .desktop { display: none; } }
</style>
