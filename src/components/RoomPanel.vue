<script setup lang="ts">
/** "Play together": host a room (get a token) or join one. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from '../composables/useI18n';
import { useRoom } from '../composables/useRoom';
import { useSettings } from '../composables/useSettings';
import { copyText } from '../composables/useClipboard';

const props = defineProps<{ initialToken?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { t } = useI18n();
const settings = useSettings();
const roomApi = useRoom();
const rs = roomApi.state;

const name = ref(settings.nickname || '');
// After a dropped connection the last code is pre-filled so rejoining is one tap.
const token = ref((props.initialToken || (rs.status === 'error' ? rs.lastToken : '') || '').toUpperCase());
const copied = ref<'link' | 'code' | 'failed' | null>(null);
const renewing = ref(false);

const link = computed(() => (rs.token ? `${location.origin}${location.pathname}#join=${rs.token}` : ''));
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

const saveName = () => {
  settings.nickname = name.value.trim().slice(0, 24);
};
const displayName = () => settings.nickname || t('room.anonymous');

const host = async () => {
  saveName();
  await roomApi.host(displayName());
};
const join = async () => {
  saveName();
  const tk = token.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (tk.length < 4) return;
  await roomApi.join(tk, displayName());
  if (rs.status === 'joined') emit('close');
};
const copy = async (what: 'link' | 'code') => {
  const ok = await copyText(what === 'link' ? link.value : rs.token ?? '');
  copied.value = ok ? what : 'failed';
  setTimeout(() => (copied.value = null), 1800);
};
const renew = async () => {
  renewing.value = true;
  try {
    await roomApi.renewToken();
  } finally {
    renewing.value = false;
  }
};
const close = () => {
  roomApi.dismissError(); // a stale error must not greet the next opening
  emit('close');
};
const share = async () => {
  try {
    await navigator.share({ title: t('app.title'), text: t('room.shareText', { token: rs.token ?? '' }), url: link.value });
  } catch {
    /* cancelled */
  }
};
const leave = () => {
  roomApi.leave();
};

const errorText = computed(() => {
  const code = rs.error ?? '';
  const map: Record<string, string> = {
    'bad-token': t('room.errBadToken'),
    'room-full': t('room.errFull'),
    'rate-limited': t('room.errRate'),
    'signaling-unreachable': t('room.errNoServer'),
    'signaling-timeout': t('room.errNoServer'),
    'connect-timeout': t('room.errConnect'),
    'host-left': t('room.errHostLeft'),
    'room-expired': t('room.errExpired'),
    'host-unreachable': t('room.errConnect'),
    'signaling-lost': t('room.errNoServer'),
  };
  return map[code] ?? `${t('room.errGeneric')} (${code})`;
});

const onKey = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape') close();
};
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal panel" role="dialog" aria-modal="true" :aria-label="t('room.title')">
      <div class="modal-title-row">
        <h2>{{ t('room.title') }}</h2>
        <button class="btn btn-icon" type="button" :aria-label="t('card.close')" @click="close">✕</button>
      </div>

      <!-- Active room -->
      <template v-if="rs.status === 'hosting' || rs.status === 'joined'">
        <p class="hint">{{ rs.status === 'hosting' ? t('room.hostingHint') : t('room.joinedHint') }}</p>
        <div class="token" aria-live="polite">
          <span class="token-label">{{ t('room.token') }}</span>
          <strong v-if="rs.token" class="token-value" data-testid="room-token">{{ rs.token }}</strong>
          <template v-else>
            <span class="hint small" data-testid="room-token-unavailable">{{ t('room.tokenUnavailable') }}</span>
            <button class="btn" type="button" :disabled="renewing" @click="renew">{{ t('room.newCode') }}</button>
          </template>
        </div>
        <template v-if="rs.token">
          <label class="field">
            <span>{{ t('room.link') }}</span>
            <input class="input link" type="text" readonly :value="link" @focus="($event.target as HTMLInputElement).select()" />
          </label>
          <div class="row">
            <button class="btn" type="button" @click="copy('link')">{{ copied === 'link' ? t('room.copied') : t('room.copyLink') }}</button>
            <button class="btn" type="button" @click="copy('code')">{{ copied === 'code' ? t('room.copied') : t('room.copyCode') }}</button>
            <button v-if="canShare" class="btn" type="button" @click="share">{{ t('room.share') }}</button>
          </div>
          <p v-if="copied === 'failed'" class="hint small" role="status">{{ t('room.copyFailed') }}</p>
        </template>
        <h3>{{ t('room.players', { n: rs.peers.length }) }}</h3>
        <ul class="peers">
          <li v-for="p in rs.peers" :key="p.id"><span class="dot" :style="{ background: p.color }"></span>{{ p.name }}<span v-if="p.id === 'host'" class="tag">{{ t('room.hostTag') }}</span></li>
        </ul>
        <p class="hint small">{{ t('room.privacy') }}</p>
        <div class="row end">
          <button class="btn btn-danger" type="button" @click="leave">{{ rs.status === 'hosting' ? t('room.endRoom') : t('room.leave') }}</button>
        </div>
      </template>

      <!-- Connecting -->
      <template v-else-if="rs.status === 'connecting'">
        <p class="hint">{{ t('room.connecting') }}</p>
        <div class="row end"><button class="btn" type="button" @click="leave">{{ t('room.cancel') }}</button></div>
      </template>

      <!-- Idle / error -->
      <template v-else>
        <p v-if="rs.status === 'error'" class="error" role="alert">{{ errorText }}</p>
        <label class="field">
          <span>{{ t('room.nickname') }}</span>
          <input v-model="name" class="input" type="text" maxlength="24" :placeholder="t('room.anonymous')" autocomplete="nickname" />
        </label>

        <section class="block">
          <h3>{{ t('room.hostTitle') }}</h3>
          <p class="hint">{{ t('room.hostHint') }}</p>
          <button class="btn btn-primary" type="button" data-testid="room-host" @click="host">{{ t('room.hostButton') }}</button>
        </section>

        <section class="block">
          <h3>{{ t('room.joinTitle') }}</h3>
          <div class="row">
            <input
              v-model="token"
              class="input token-input"
              type="text"
              inputmode="text"
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
              maxlength="8"
              :placeholder="t('room.tokenPlaceholder')"
              data-testid="room-token-input"
              @keydown.enter="join"
            />
            <button class="btn btn-primary" type="button" data-testid="room-join" :disabled="token.replace(/[^A-Za-z0-9]/g, '').length < 4" @click="join">{{ t('room.joinButton') }}</button>
          </div>
        </section>

        <p class="hint small">{{ t('room.how') }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.hint { margin: 0 0 0.75rem; color: var(--color-text-muted); line-height: 1.5; }
.input.link { font-size: 0.85rem; font-family: ui-monospace, monospace; }
.hint.small { font-size: 0.8rem; }
.error { margin: 0 0 0.75rem; padding: 0.6rem 0.8rem; border-radius: 10px; background: #3a2626; color: #f0b7b7; }
.block { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--color-panel-border); }
h3 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--color-text-muted); }
.input {
  min-height: 42px; padding: 0 0.8rem; border-radius: 10px; border: 1px solid var(--color-panel-border);
  background: #262630; color: var(--color-text); font-size: 1rem; width: 100%; min-width: 0;
}
.input:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.token-input { text-transform: uppercase; letter-spacing: 0.2em; font-family: ui-monospace, monospace; font-weight: 700; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
.row.end { justify-content: flex-end; }
.token { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 1rem; margin: 0.5rem 0; border-radius: 14px; background: #262630; }
.token-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-text-muted); }
.token-value { font-family: ui-monospace, monospace; font-size: 2.2rem; letter-spacing: 0.25em; color: var(--color-accent); }
.peers { list-style: none; margin: 0 0 0.5rem; padding: 0; }
.peers li { display: flex; align-items: center; gap: 8px; min-height: 32px; }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.tag { margin-left: 4px; font-size: 0.7rem; text-transform: uppercase; color: var(--color-text-muted); }
</style>
