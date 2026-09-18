<script setup lang="ts">
/**
 * "Ask the cards": question or dream in, streamed interpretation out.
 * Talks to OpenRouter with the user's own key (src/ai/openrouter.ts); the
 * prompt is built from the table state (src/ai/prompts.ts); every thread is
 * kept locally (src/ai/store.ts).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CardDef, DeckDef, Location, SpreadDef, TableState } from '../engine/types';
import { useI18n } from '../composables/useI18n';
import { useSettings } from '../composables/useSettings';
import { AiError, chat, getApiKey, maskKey, setApiKey, type ChatMessage } from '../ai/openrouter';
import {
  buildReadingInput,
  buildThread,
  followUpMessage,
  parseSuggestedCards,
  suggestCardsMessages,
  systemPrompt,
  visibleCards,
  type AskMode,
  type SuggestedCard,
} from '../ai/prompts';
import { renderMarkdown } from '../ai/markdown';
import { FAST_MODEL, isPreset, modelPresets } from '../ai/models';
import {
  deleteInterpretation,
  listInterpretations,
  newInterpretationId,
  saveInterpretation,
  type Interpretation,
} from '../ai/store';

const props = defineProps<{
  state: TableState;
  spread: SpreadDef;
  cardsById: Map<string, CardDef>;
  deck: DeckDef;
  allowReversed: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'focus-card', loc: Location): void;
  (e: 'place-cards', cards: SuggestedCard[]): void;
}>();

const { t, l, locale } = useI18n();
const settings = useSettings();

// ---------------------------------------------------------------------------
// Access: consent + key + connectivity
// ---------------------------------------------------------------------------
const apiKey = ref(getApiKey());
const keyInput = ref('');
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
const setOnline = () => (online.value = navigator.onLine !== false);

const saveKey = () => {
  setApiKey(keyInput.value);
  apiKey.value = getApiKey();
  keyInput.value = '';
};
const removeKey = () => {
  setApiKey('');
  apiKey.value = '';
};

// ---------------------------------------------------------------------------
// Question + table
// ---------------------------------------------------------------------------
const mode = ref<AskMode>('reading');
const question = ref('');
const input = computed(() =>
  buildReadingInput({
    state: props.state,
    spread: props.spread,
    cardsById: props.cardsById,
    deck: props.deck,
    question: question.value,
    mode: mode.value,
    locale: locale.value,
    includeDeckNotes: settings.aiSendDeckNotes,
  }),
);
const chips = computed(() =>
  visibleCards(props.state).map((v) => ({
    loc: v.loc,
    name: l(props.cardsById.get(v.id)?.name) || v.id,
    position: v.position !== null ? l(props.spread.slots[v.position]?.label) : '',
    reversed: v.reversed,
  })),
);
const summary = computed(() =>
  t('ask.tableSummary', {
    spread: l(props.spread.name),
    up: input.value.cards.length,
    down: input.value.hiddenCards,
  }),
);

// ---------------------------------------------------------------------------
// Thread + streaming
// ---------------------------------------------------------------------------
const thread = ref<Interpretation | null>(null);
const streaming = ref(false);
const partial = ref('');
const error = ref<string | null>(null);
const followUp = ref('');
const copied = ref(false);
const suggesting = ref(false);
let controller: AbortController | null = null;
let pending = '';
let raf = 0;

const canInterpret = computed(() => input.value.cards.length > 0 && online.value && !!apiKey.value && !streaming.value);

const errorText = (e: unknown): string => {
  const err = e instanceof AiError ? e : new AiError('network');
  switch (err.code) {
    case 'no-key': return t('ask.errNoKey');
    case 'unauthorized': return t('ask.errUnauthorized');
    case 'credits': return t('ask.errCredits');
    case 'rate-limited': return t('ask.errRate');
    case 'offline': return t('ask.errOffline');
    case 'server': return t('ask.errServer');
    case 'bad-request': return t('ask.errBadRequest', { detail: err.message });
    case 'empty': return t('ask.errEmpty');
    case 'aborted': return '';
    default: return t('ask.errNetwork');
  }
};

/** Streams one assistant turn for the current thread and stores it. */
const run = async (rec: Interpretation) => {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(rec.locale, rec.mode, JSON.parse(rec.input).cards.length) },
    ...rec.messages.map(({ role, content }) => ({ role, content })),
  ];
  controller = new AbortController();
  streaming.value = true;
  partial.value = '';
  pending = '';
  error.value = null;
  try {
    const res = await chat({
      apiKey: apiKey.value,
      model: settings.aiModel.trim() || modelPresets[0]!.id,
      messages,
      maxTokens: 2000,
      signal: controller.signal,
      onDelta: (text) => {
        pending += text;
        if (!raf) raf = requestAnimationFrame(flush);
      },
    });
    flush();
    rec.model = res.model;
    rec.messages.push({ role: 'assistant', content: res.text });
  } catch (e) {
    flush();
    if (e instanceof AiError && e.code === 'aborted' && partial.value) {
      rec.messages.push({ role: 'assistant', content: partial.value });
    } else {
      const msg = errorText(e);
      if (msg) error.value = msg;
      // A follow-up that got no answer (error, or stopped before any text) is
      // dropped so the thread never holds two user turns in a row.
      if (rec.messages[rec.messages.length - 1]?.role === 'user' && rec.messages.length > 1) rec.messages.pop();
    }
  } finally {
    streaming.value = false;
    partial.value = '';
    controller = null;
  }
  if (rec.messages.some((m) => m.role === 'assistant')) {
    rec.updatedAt = Date.now();
    await saveInterpretation(JSON.parse(JSON.stringify(rec)) as Interpretation);
    void loadRecent();
  }
};

const flush = () => {
  raf = 0;
  if (!pending) return;
  partial.value += pending;
  pending = '';
};

const interpret = async () => {
  if (!canInterpret.value) return;
  const inp = input.value;
  const rec: Interpretation = {
    version: 1,
    id: newInterpretationId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    locale: inp.locale,
    mode: inp.mode,
    question: inp.question,
    spreadId: props.state.spreadId,
    deckId: props.state.deckId,
    model: settings.aiModel,
    provider: 'openrouter',
    messages: buildThread(inp).slice(1).map((m) => ({ ...m, shown: inp.question || t('ask.noQuestion') })),
    input: JSON.stringify(inp),
    tableSnapshot: JSON.parse(JSON.stringify(props.state)) as TableState,
  };
  thread.value = rec;
  await run(thread.value); // the reactive proxy, so pushes into `messages` render
};

const sendFollowUp = async () => {
  const text = followUp.value.trim();
  const rec = thread.value;
  if (!text || !rec || streaming.value || !online.value) return;
  followUp.value = '';
  const current = { ...input.value, question: rec.question, mode: rec.mode };
  rec.messages.push({ role: 'user', content: followUpMessage(text, current, rec.input), shown: text });
  rec.input = JSON.stringify(current);
  await run(rec);
};

const stop = () => controller?.abort();

const newThread = () => {
  stop();
  thread.value = null;
  error.value = null;
};

const openRecent = (rec: Interpretation) => {
  stop();
  thread.value = rec;
  mode.value = rec.mode;
  question.value = rec.question;
  error.value = null;
};

// ---------------------------------------------------------------------------
// Dream → cards
// ---------------------------------------------------------------------------
const freeRoom = computed(() => {
  const empty = props.state.slots.filter((c) => c === null).length;
  return props.spread.slots.length ? empty : 3;
});
const canSuggest = computed(
  () => mode.value === 'dream' && question.value.trim().length > 10 && freeRoom.value > 0 && online.value && !!apiKey.value && !suggesting.value && !streaming.value,
);

const suggest = async () => {
  if (!canSuggest.value) return;
  suggesting.value = true;
  error.value = null;
  const available = props.state.deck.map((c) => props.cardsById.get(c.id)).filter((c): c is CardDef => !!c);
  const count = Math.min(freeRoom.value, available.length);
  try {
    const res = await chat({
      apiKey: apiKey.value,
      model: FAST_MODEL,
      messages: suggestCardsMessages({ dream: question.value, count, available, locale: locale.value, allowReversed: props.allowReversed }),
      maxTokens: 300,
      temperature: 0.4,
    });
    const cards = parseSuggestedCards(res.text, new Set(available.map((c) => c.id)), count);
    if (!cards.length) error.value = t('ask.errSuggest');
    else emit('place-cards', cards);
  } catch (e) {
    error.value = errorText(e) || t('ask.errSuggest');
  } finally {
    suggesting.value = false;
  }
};

// ---------------------------------------------------------------------------
// Copy / share / history / settings
// ---------------------------------------------------------------------------
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

const transcript = () => {
  const rec = thread.value;
  if (!rec) return '';
  const cards = JSON.parse(rec.input).cards as { position: string | null; card: string; orientation: string }[];
  const lines = [
    rec.question ? `${rec.mode === 'dream' ? t('ask.dreamLabel') : t('ask.questionLabel')}: ${rec.question}` : '',
    cards.map((c) => `- ${c.position ? `${c.position}: ` : ''}${c.card} (${c.orientation === 'reversed' ? t('card.reversed') : t('card.upright')})`).join('\n'),
    '',
    ...rec.messages.slice(1).map((m) => (m.role === 'user' ? `> ${m.shown ?? m.content}` : m.content)),
  ];
  return lines.filter((x, i) => x !== '' || i === 2).join('\n');
};
const copy = async () => {
  try {
    await navigator.clipboard.writeText(transcript());
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard unavailable */
  }
};
const share = async () => {
  try {
    await navigator.share({ title: t('app.title'), text: transcript() });
  } catch {
    /* cancelled */
  }
};

const recent = ref<Interpretation[]>([]);
const loadRecent = async () => {
  recent.value = await listInterpretations(10);
};
const removeRecent = async (id: string) => {
  await deleteInterpretation(id);
  if (thread.value?.id === id) thread.value = null;
  await loadRecent();
};
const dateOf = (ms: number) => new Date(ms).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' });

const settingsOpen = ref(false);
const modelChoice = computed({
  get: () => (isPreset(settings.aiModel) ? settings.aiModel : 'custom'),
  set: (v: string) => {
    if (v !== 'custom') settings.aiModel = v;
    else if (isPreset(settings.aiModel)) settings.aiModel = '';
  },
});

const html = (text: string) => renderMarkdown(text);

const onKey = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape') emit('close');
};
onMounted(() => {
  document.addEventListener('keydown', onKey);
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
  void loadRecent();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('online', setOnline);
  window.removeEventListener('offline', setOnline);
  stop();
  if (raf) cancelAnimationFrame(raf);
});
watch(mode, () => {
  if (!thread.value) error.value = null;
});
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal panel ask" role="dialog" aria-modal="true" :aria-label="t('ask.title')" data-testid="ask-panel">
      <div class="modal-title-row">
        <h2>✦ {{ t('ask.title') }}</h2>
        <button class="btn btn-icon" type="button" :aria-label="t('card.close')" @click="emit('close')">✕</button>
      </div>

      <!-- Step 1: consent -->
      <template v-if="!settings.aiConsent">
        <h3>{{ t('ask.consentTitle') }}</h3>
        <p class="hint">{{ t('ask.consentBody') }}</p>
        <p class="hint small"><a href="https://openrouter.ai/privacy" target="_blank" rel="noopener">{{ t('ask.consentLink') }}</a></p>
        <div class="row end">
          <button class="btn btn-primary" type="button" data-testid="ask-consent" @click="settings.aiConsent = true">{{ t('ask.consentAccept') }}</button>
        </div>
      </template>

      <!-- Step 2: key -->
      <template v-else-if="!apiKey">
        <h3>{{ t('ask.keyTitle') }}</h3>
        <p class="hint">{{ t('ask.keyBody') }}</p>
        <div class="row">
          <input
            v-model="keyInput"
            class="input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('ask.keyPlaceholder')"
            data-testid="ask-key-input"
            @keydown.enter="saveKey"
          />
          <button class="btn btn-primary" type="button" :disabled="keyInput.trim().length < 8" data-testid="ask-key-save" @click="saveKey">{{ t('ask.keySave') }}</button>
        </div>
      </template>

      <!-- Main -->
      <template v-else>
        <p v-if="!online" class="error" role="alert">{{ t('ask.offline') }}</p>

        <template v-if="!thread">
          <div class="segmented" role="radiogroup" :aria-label="t('ask.modeReading') + ' / ' + t('ask.modeDream')">
            <button type="button" role="radio" :aria-checked="mode === 'reading'" :class="{ on: mode === 'reading' }" @click="mode = 'reading'">{{ t('ask.modeReading') }}</button>
            <button type="button" role="radio" :aria-checked="mode === 'dream'" :class="{ on: mode === 'dream' }" data-testid="ask-mode-dream" @click="mode = 'dream'">{{ t('ask.modeDream') }}</button>
          </div>

          <label class="field">
            <span>{{ mode === 'dream' ? t('ask.dreamLabel') : t('ask.questionLabel') }}</span>
            <textarea
              v-model="question"
              class="input textarea"
              :rows="mode === 'dream' ? 5 : 2"
              maxlength="2000"
              :placeholder="mode === 'dream' ? t('ask.dreamPlaceholder') : t('ask.questionPlaceholder')"
              data-testid="ask-question"
            ></textarea>
          </label>

          <div v-if="mode === 'dream'" class="row">
            <button class="btn" type="button" :disabled="!canSuggest" data-testid="ask-suggest" @click="suggest">
              {{ suggesting ? t('ask.suggesting') : t('ask.suggestCards') }}
            </button>
            <span class="hint small grow">{{ freeRoom > 0 ? t('ask.suggestHint') : t('ask.suggestNoRoom') }}</span>
          </div>

          <p class="summary" data-testid="ask-summary">{{ summary }}</p>
          <p v-if="input.cards.length === 0" class="hint">{{ t('ask.noCards') }}</p>
          <p v-else-if="input.hiddenCards > 0" class="hint small">{{ t('ask.hiddenHint') }}</p>
        </template>

        <!-- Cards in the reading -->
        <div v-if="chips.length" class="chips" :aria-label="t('ask.cards')">
          <button v-for="c in chips" :key="c.loc.kind + c.loc.index" class="chip" type="button" @click="emit('focus-card', c.loc)">
            <span v-if="c.position" class="pos">{{ c.position }}</span>{{ c.name }}<span v-if="c.reversed" class="rev"> ↓</span>
          </button>
        </div>

        <p v-if="error" class="error" role="alert" data-testid="ask-error">{{ error }}</p>

        <!-- Thread -->
        <div v-if="thread" class="thread" aria-live="polite">
          <template v-for="(m, i) in thread.messages" :key="i">
            <p v-if="m.role === 'user'" class="user"><span class="who">{{ thread.mode === 'dream' && i === 0 ? t('ask.modeDream') : '?' }}</span>{{ m.shown ?? m.content }}</p>
            <div v-else class="answer" data-testid="ask-answer" v-html="html(m.content)"></div>
          </template>
          <div v-if="streaming" class="answer streaming" data-testid="ask-streaming" v-html="html(partial) + '<span class=&quot;cursor&quot;>▍</span>'"></div>
        </div>

        <!-- Actions -->
        <div v-if="!thread" class="row end">
          <button class="btn btn-primary" type="button" :disabled="!canInterpret" data-testid="ask-interpret" @click="interpret">{{ t('ask.interpret') }}</button>
        </div>
        <template v-else>
          <div v-if="streaming" class="row end">
            <button class="btn" type="button" data-testid="ask-stop" @click="stop">{{ t('ask.stop') }}</button>
          </div>
          <template v-else>
            <div class="row">
              <input
                v-model="followUp"
                class="input grow"
                type="text"
                maxlength="1000"
                :placeholder="t('ask.followUpPlaceholder')"
                data-testid="ask-followup"
                @keydown.enter="sendFollowUp"
              />
              <button class="btn btn-primary" type="button" :disabled="!followUp.trim() || !online" @click="sendFollowUp">{{ t('ask.send') }}</button>
            </div>
            <div class="row between">
              <span class="hint small">{{ t('ask.saved') }}</span>
              <span class="row tight">
                <button class="btn" type="button" @click="copy">{{ copied ? t('ask.copied') : t('ask.copy') }}</button>
                <button v-if="canShare" class="btn" type="button" @click="share">{{ t('ask.share') }}</button>
                <button class="btn" type="button" data-testid="ask-new" @click="newThread">{{ t('ask.newThread') }}</button>
              </span>
            </div>
          </template>
        </template>

        <!-- Recent -->
        <section v-if="!thread && recent.length" class="block">
          <h3>{{ t('ask.recent') }}</h3>
          <ul class="recent">
            <li v-for="r in recent" :key="r.id">
              <button class="recent-item" type="button" @click="openRecent(r)">
                <span class="date">{{ dateOf(r.updatedAt) }}</span>
                <span class="q">{{ r.question || t('ask.noQuestion') }}</span>
              </button>
              <button class="btn btn-icon small" type="button" :aria-label="t('ask.delete')" @click="removeRecent(r.id)">🗑</button>
            </li>
          </ul>
        </section>

        <!-- Settings -->
        <section class="block">
          <button class="disclosure" type="button" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen">
            {{ settingsOpen ? '▾' : '▸' }} {{ t('ask.settings') }}
          </button>
          <div v-if="settingsOpen" class="settings">
            <label class="field">
              <span>{{ t('ask.model') }}</span>
              <select v-model="modelChoice" class="select">
                <option v-for="m in modelPresets" :key="m.id" :value="m.id">{{ m.label }}</option>
                <option value="custom">{{ t('ask.modelCustom') }}</option>
              </select>
            </label>
            <input v-if="modelChoice === 'custom'" v-model="settings.aiModel" class="input" type="text" spellcheck="false" :placeholder="t('ask.modelCustomPlaceholder')" />
            <label class="check">
              <input v-model="settings.aiSendDeckNotes" type="checkbox" /> {{ t('ask.sendDeckNotes') }}
            </label>
            <div class="row between">
              <code class="key">{{ maskKey(apiKey) }}</code>
              <button class="btn btn-danger" type="button" @click="removeKey">{{ t('ask.keyRemove') }}</button>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ask { display: flex; flex-direction: column; gap: 0.5rem; }
h3 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); }
.hint { margin: 0; color: var(--color-text-muted); line-height: 1.5; }
.hint.small { font-size: 0.8rem; }
.hint a { color: var(--color-accent); }
.error { margin: 0; padding: 0.6rem 0.8rem; border-radius: 10px; background: #3a2626; color: #f0b7b7; }
.block { margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--color-panel-border); }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--color-text-muted); }
.input {
  min-height: 42px; padding: 0 0.8rem; border-radius: 10px; border: 1px solid var(--color-panel-border);
  background: #262630; color: var(--color-text); font-size: 1rem; width: 100%; min-width: 0; font-family: inherit;
}
.input:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.textarea { padding: 0.6rem 0.8rem; line-height: 1.4; resize: vertical; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.row.end { justify-content: flex-end; }
.row.between { justify-content: space-between; }
.row.tight { gap: 6px; }
.grow { flex: 1 1 160px; min-width: 0; }
.segmented { display: inline-flex; padding: 3px; border-radius: 12px; background: #262630; align-self: flex-start; }
.segmented button {
  min-height: 36px; padding: 0 1rem; border: 0; border-radius: 9px; background: transparent; color: var(--color-text-muted);
  font-weight: 600; font-size: 0.9rem; cursor: pointer; touch-action: manipulation;
}
.segmented button.on { background: var(--color-accent); color: var(--color-accent-ink); }
.summary { margin: 0; font-size: 0.9rem; color: var(--color-accent); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; border-radius: 999px;
  border: 1px solid var(--color-panel-border); background: #262630; color: var(--color-text); font-size: 0.8rem; cursor: pointer;
}
.chip .pos { color: var(--color-text-muted); }
.chip .rev { color: #f0b7b7; }
.thread { display: flex; flex-direction: column; gap: 0.6rem; }
.user { margin: 0; padding: 0.5rem 0.8rem; border-radius: 12px; background: #262630; white-space: pre-wrap; line-height: 1.45; }
.user .who { display: inline-block; margin-right: 8px; padding: 0 6px; border-radius: 6px; background: var(--color-accent); color: var(--color-accent-ink); font-size: 0.75rem; font-weight: 700; }
.answer { line-height: 1.55; font-size: 0.98rem; }
.answer :deep(p) { margin: 0 0 0.6rem; }
.answer :deep(h3), .answer :deep(h4), .answer :deep(h5), .answer :deep(h6) {
  margin: 0.9rem 0 0.3rem; font-family: var(--font-display); font-weight: 500; font-size: 1.05rem; color: var(--color-accent); text-transform: none; letter-spacing: 0;
}
.answer :deep(ul), .answer :deep(ol) { margin: 0 0 0.6rem; padding-left: 1.2rem; }
.answer :deep(.cursor) { color: var(--color-accent); animation: blink 1s steps(2) infinite; }
@keyframes blink { to { opacity: 0; } }
.recent { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.recent li { display: flex; align-items: center; gap: 6px; }
.recent-item {
  flex: 1; min-width: 0; display: flex; gap: 10px; align-items: baseline; min-height: 40px; padding: 0 10px; border: 0; border-radius: 8px;
  background: transparent; color: var(--color-text); text-align: left; cursor: pointer;
}
.recent-item:hover, .recent-item:focus-visible { background: #2a2a34; outline: none; }
.recent .date { flex: 0 0 auto; font-size: 0.75rem; color: var(--color-text-muted); }
.recent .q { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn.small { width: 34px; min-height: 34px; font-size: 0.9rem; }
.disclosure { border: 0; background: transparent; color: var(--color-text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 0; cursor: pointer; }
.settings { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
.check { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; min-height: 32px; }
.key { font-family: ui-monospace, monospace; color: var(--color-text-muted); font-size: 0.85rem; }
</style>
