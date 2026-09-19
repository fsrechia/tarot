<script setup lang="ts">
/**
 * Orchestrator for the tarot table. Owns no game logic itself: state changes
 * go through `engine/table`, gestures through `usePointerDrag`, the camera
 * through `useCamera`. Swapping `tarotGame` for another GameDef is the path
 * to other card games.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Toolbar from './Toolbar.vue';
import TableCanvas from './TableCanvas.vue';
import DeckDrawer, { type Scatter } from './DeckDrawer.vue';
import DragGhost from './DragGhost.vue';
import CardDetail from './CardDetail.vue';
import HelpPanel from './HelpPanel.vue';
import RoomPanel from './RoomPanel.vue';
import AskPanel from './AskPanel.vue';
import type { SuggestedCard } from '../ai/prompts';
import { useRoom } from '../composables/useRoom';
import { applyOp, isValidState, randomSeed, type Msg, type Op, type Peer } from '../net/protocol';
import type { Room } from '../net/room';
import { tarotGame } from '../games/tarot';
import type { DeckDef, DropTarget, GameRules, Locale, Location, TableState } from '../engine/types';
import * as ops from '../engine/table';
import { createTable } from '../engine/table';
import {
  cardBounds,
  canvasToUnits,
  screenToCanvas,
  tableBounds,
  unitsToCanvas,
  type CardSize,
  type Point,
} from '../engine/geometry';
import { decksForFamily, findDeck, resolveBack, resolveImage, staticDecks } from '../decks/registry';
import { deleteCustomDeck, importZip, loadCustomDecks, revokeDeck, saveCustomDeck, toDeckDef } from '../decks/zip';
import { useSettings } from '../composables/useSettings';
import { useI18n } from '../composables/useI18n';
import { useHaptics } from '../composables/useHaptics';
import { useCamera } from '../composables/useCamera';
import { usePointerDrag, type DragSession } from '../composables/usePointerDrag';
import { isCompatible, loadSavedTable, useTable } from '../composables/useTable';

const game = tarotGame;
const settings = useSettings();
const { t, l } = useI18n();
const { vibrate } = useHaptics();

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------
const customDecks = ref<DeckDef[]>([]);
const decks = computed(() => [...decksForFamily(staticDecks, game.family), ...customDecks.value]);
const deckId = ref(settings.deckId && findDeck(decks.value, settings.deckId) ? settings.deckId : game.defaultDeckId);
const deck = computed(() => findDeck(decks.value, deckId.value) ?? decks.value[0]!);
const imageFor = (key: string) => resolveImage(decks.value, deck.value, key);
const cardsById = new Map(game.cards.map((c) => [c.id, c]));
/** Minor Arcana cards have their own back (when the deck has one) and are drawn a bit smaller. */
const backFor = (id: string) => resolveBack(decks.value, deck.value, cardsById.get(id));
const scaleFor = (id: string) => cardsById.get(id)?.scale ?? 1;

// ---------------------------------------------------------------------------
// Spread + rules + table state
// ---------------------------------------------------------------------------
const knownSpread = (id: string | null | undefined) => !!id && game.spreads.some((s) => s.id === id);
// The saved table wins over the remembered spread: a host who changed the
// spread at a shared table must find that table again after a reload.
const saved = loadSavedTable();
const spreadId = ref(
  knownSpread(saved?.spreadId) ? saved!.spreadId : knownSpread(settings.spreadId) ? settings.spreadId! : game.defaultSpreadId,
);
const spread = computed(() => game.spreads.find((s) => s.id === spreadId.value) ?? game.spreads[0]!);
const rules = computed<GameRules>(() => ({
  ...game.rules,
  allowReversed: settings.allowReversed,
  minorArcana: settings.minorArcana,
}));

/** A fresh table using the current rules (settings can override the game defaults). */
const newTable = () => createTable({ game: { ...game, rules: rules.value }, deckId: deckId.value, spread: spread.value });

// Like the spread, the restored table decides whether the Minor Arcana are in
// play; the setting only applies to the next new table.
const restored = saved && isCompatible(saved, game, spread.value) ? saved : null;
if (restored) settings.minorArcana = ops.usesMinorArcana(restored, game);
const initial: TableState = restored ?? newTable();
const tbl = useTable(initial);
const state = tbl.state;

// ---------------------------------------------------------------------------
// Layout: surface size → card size (CSS variables) → camera
// ---------------------------------------------------------------------------
const root = ref<HTMLElement | null>(null);
const surface = ref<HTMLElement | null>(null);
const surfaceSize = ref({ width: 800, height: 600 });

const cardSize = computed<CardSize>(() => {
  const w = Math.round(Math.min(150, Math.max(84, surfaceSize.value.width * 0.27)));
  return { width: w, height: Math.round(w / (deck.value.aspectRatio || 0.6)) };
});
const cssVars = computed(() => ({
  '--card-w': `${cardSize.value.width}px`,
  '--card-h': `${cardSize.value.height}px`,
  '--detail-aspect': String(deck.value.aspectRatio || 0.6),
}));

/** Screen areas covered by overlays that the fitted spread must avoid. */
const reserve = computed(() => ({
  bottom: cardSize.value.height * (settings.fanned ? 0.62 : 0.36) + 28,
  right: 56, // floating zoom buttons
  left: 0,
  top: 0,
}));

const cam = useCamera(surface, {
  isBackground: (target) => {
    const el = target as Element | null;
    return !el?.closest?.('[data-card], [data-drop="deck"], .ui');
  },
  onPinchStart: () => drag.cancel(),
});

const fitView = () => {
  const bounds = tableBounds(spread.value, state.value.loose, cardSize.value) ?? cardBounds({ x: 0, y: 0 }, cardSize.value);
  cam.fit(bounds, reserve.value, 16, spread.value.slots.length <= 1 ? 1.35 : 1.15);
};

let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let observer: ResizeObserver | null = null;

// ---------------------------------------------------------------------------
// Gestures: tap / long-press / drag
// ---------------------------------------------------------------------------
const drag = usePointerDrag<Location>({
  onDragStart: (session) => {
    vibrate(8);
    announceHolding(session.data);
  },
  onTap: (loc) => {
    if (loc.kind === 'deck') drawFromDeck(loc.index);
    else flip(loc);
  },
  onLongPress: (loc) => {
    if (loc.kind === 'deck') return;
    vibrate(20);
    openDetail(loc);
  },
  onDrop: (session, e) => {
    announceHolding(null);
    handleDrop(session, e);
  },
  onCancel: () => announceHolding(null),
});

/** Tells the other players which card we are holding (visual only). */
const announceHolding = (loc: Location | null) => {
  const r = roomApi.room.value;
  if (!r || !roomApi.inRoom.value) return;
  if (r.isHost) r.broadcast({ t: 'held', peerId: 'host', loc });
  else r.send({ t: 'holding', loc });
};

const dragging = computed(() => (drag.session.value?.active ? drag.session.value.data : null));
const dragCard = computed(() => (dragging.value ? ops.getCard(state.value, dragging.value) : null));

const onCardDown = (e: PointerEvent, loc: Location, el: HTMLElement) => {
  if (shuffling.value || cam.pointerCount.value > 1) return;
  drag.begin(e, loc, el);
};

const onDeckCardDown = (e: PointerEvent, index: number, el: HTMLElement) => onCardDown(e, { kind: 'deck', index }, el);

/** Viewport centre in card units, jittered so successive draws do not stack exactly. */
const freeDropPoint = (): Point => {
  const vp = cam.viewport(reserve.value);
  const centre = screenToCanvas({ x: vp.left + vp.width / 2, y: vp.top + vp.height / 2 }, cam.camera.value);
  const u = canvasToUnits(centre, cardSize.value);
  const n = state.value.loose.length;
  return { x: u.x + (n % 5) * 0.12 - 0.24, y: u.y + Math.floor(n / 5) * 0.12 - 0.12 };
};

/**
 * Applies an op to the current state, or returns null when the engine rejects
 * it (e.g. a drag that started before a snapshot moved the card away).
 */
const tryApply = (op: Op): TableState | null => {
  try {
    return applyOp(state.value, op, { game, rules: rules.value });
  } catch (e) {
    console.warn('op rejected', op, e);
    return null;
  }
};

/**
 * Every table change is an `Op`. Alone: apply + undo history. Host: apply and
 * broadcast the snapshot. Guest: propose to the host, who owns the truth.
 * `amend` replaces the state without a new undo entry (second half of the
 * shuffle animation).
 */
const dispatch = (op: Op, opts: { amend?: boolean } = {}) => {
  const r = roomApi.room.value;
  if (!r || !roomApi.inRoom.value) {
    const next = tryApply(op);
    if (!next) return;
    if (opts.amend) tbl.amend(next);
    else tbl.commit(next);
    return;
  }
  if (r.isHost) {
    applyAsHost(op, r);
  } else {
    r.send({ t: 'op', op });
  }
};

const applyAsHost = (op: Op, r: Room) => {
  const next = tryApply(op);
  if (!next) return;
  tbl.state.value = next;
  if (op.k === 'shuffle') {
    r.broadcast({ t: 'effect', name: 'shuffle' });
    if (!shuffling.value) playScatter(next.deck); // a guest shuffled: animate here too
  }
  r.broadcast({ t: 'snapshot', state: next });
  if (op.k === 'newReading') syncSpreadFromState();
};

const drawFromDeck = (index = state.value.deck.length - 1) => {
  if (state.value.deck.length === 0) return;
  dispatch({ k: 'draw', index, fallback: freeDropPoint() });
  vibrate(12);
};

const flip = (loc: Location) => {
  dispatch({ k: 'flip', loc });
  vibrate(6);
};

const handleDrop = (session: DragSession<Location>, e: PointerEvent) => {
  const from = session.data;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  let target: DropTarget;

  if (under?.closest('[data-drop="deck"]')) {
    if (from.kind === 'deck') return;
    target = { kind: 'deck' };
  } else {
    const zoom = cam.camera.value.zoom;
    const w = cardSize.value.width * zoom;
    const h = cardSize.value.height * zoom;
    const centreClient = { clientX: e.clientX - session.grabX * w + w / 2, clientY: e.clientY - session.grabY * h + h / 2 };
    const pointerCanvas = cam.screenToCanvas(e);
    const centreCanvas = cam.screenToCanvas(centreClient);
    const slotIndex = findSlotAt(pointerCanvas, from);
    if (slotIndex >= 0) {
      target = { kind: 'slot', index: slotIndex };
    } else {
      const u = canvasToUnits(centreCanvas, cardSize.value);
      target = { kind: 'loose', x: u.x, y: u.y };
    }
  }

  dispatch({ k: 'move', from, to: target });
  vibrate(10);
};

/**
 * Which slot is under a canvas point. Empty slots win over occupied ones, then
 * the nearest centre, then the lowest index (so the Celtic Cross heart fills
 * before the crossing card that shares its centre).
 */
const findSlotAt = (p: Point, from: Location): number => {
  const cs = cardSize.value;
  let best = -1;
  let bestScore = Infinity;
  spread.value.slots.forEach((slot, index) => {
    const c = unitsToCanvas(slot, cs);
    const b = cardBounds(c, cs, slot.rotation ?? 0);
    if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) return;
    const occupied = state.value.slots[index] !== null && !(from.kind === 'slot' && from.index === index);
    const score = (occupied ? 1e6 : 0) + Math.hypot(p.x - c.x, p.y - c.y) + index * 0.001;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
};

// ---------------------------------------------------------------------------
// Shuffle with a small scatter animation
// ---------------------------------------------------------------------------
const shuffling = ref(false);
const scatter = ref<Record<string, Scatter>>({});

const playScatter = (cards: { id: string }[]) => {
  shuffling.value = true;
  const s: Record<string, Scatter> = {};
  for (const c of cards) {
    s[c.id] = { x: (Math.random() - 0.5) * 160, y: (Math.random() - 0.5) * 160, r: (Math.random() - 0.5) * 80 };
  }
  scatter.value = s;
  setTimeout(() => {
    scatter.value = {};
    setTimeout(() => (shuffling.value = false), 420);
  }, 420);
};

const shuffle = () => {
  if (shuffling.value) return;
  drag.cancel();
  const seed = randomSeed();
  if (roomApi.inRoom.value && !roomApi.isHost.value) {
    // The host applies it and broadcasts the effect back to everyone.
    dispatch({ k: 'shuffle', seed });
    return;
  }
  dispatch({ k: 'gather' });
  playScatter(state.value.deck);
  // One undo step for the whole shuffle: the gathered deck is the history
  // entry, the shuffled order replaces it without another entry.
  setTimeout(() => dispatch({ k: 'shuffle', seed }, { amend: true }), 420);
};

// ---------------------------------------------------------------------------
// Toolbar actions
// ---------------------------------------------------------------------------
const confirmReset = () => ops.cardsOnTable(state.value) === 0 || window.confirm(t('confirm.resetTable'));

const newReading = () => {
  if (!confirmReset()) return;
  if (roomApi.inRoom.value) {
    dispatch({ k: 'newReading', spreadId: spreadId.value, seed: randomSeed() });
  } else {
    tbl.replace(newTable());
  }
  nextTick(fitView);
};

const onSpreadChange = (id: string) => {
  if (id === spreadId.value) return;
  if (!confirmReset()) {
    toolbarKey.value++; // re-render the toolbar so the <select> snaps back
    return;
  }
  if (roomApi.inRoom.value) {
    dispatch({ k: 'newReading', spreadId: id, seed: randomSeed() });
    if (roomApi.isHost.value) nextTick(fitView);
    return; // guests follow the host's snapshot
  }
  spreadId.value = id;
  settings.spreadId = id;
  tbl.replace(newTable());
  nextTick(fitView);
};

const onDeckChange = (id: string) => {
  deckId.value = id;
  settings.deckId = id;
  tbl.state.value = { ...state.value, deckId: id };
};

/** With or without the 56 Minor Arcana: a new table, like changing the spread. */
const toggleMinorArcana = () => {
  if (roomApi.inRoom.value && !roomApi.isHost.value) return;
  if (!confirmReset()) return;
  settings.minorArcana = !settings.minorArcana;
  if (roomApi.inRoom.value) {
    dispatch({ k: 'newReading', spreadId: spreadId.value, seed: randomSeed() });
  } else {
    tbl.replace(newTable());
  }
  nextTick(fitView);
};

const toggleFan = () => {
  settings.fanned = !settings.fanned;
  vibrate(8);
};

const deal = () => dispatch({ k: 'deal' });
const reveal = () => dispatch({ k: 'reveal' });
const gather = () => dispatch({ k: 'gather' });

const onImportZip = async (file: File) => {
  try {
    const record = await importZip(file, game.family, game.cards.map((c) => c.id));
    await saveCustomDeck(record);
    const def = toDeckDef(record, game.defaultDeckId === record.id ? undefined : 'standard');
    customDecks.value = [...customDecks.value, def];
    onDeckChange(def.id);
    window.alert(t('zip.imported', { name: def.name }));
  } catch {
    window.alert(t('zip.error'));
  }
};

const onDeleteDeck = async () => {
  const d = deck.value;
  if (!d.custom || !window.confirm(t('confirm.deleteDeck', { name: d.name }))) return;
  await deleteCustomDeck(d.id);
  revokeDeck(d);
  customDecks.value = customDecks.value.filter((x) => x.id !== d.id);
  onDeckChange(game.defaultDeckId);
};

// ---------------------------------------------------------------------------
// Shared table (Play together)
// ---------------------------------------------------------------------------
const roomApi = useRoom();
const roomOpen = ref(false);
const roomInitialToken = ref('');
const roomNotice = ref<string | null>(null);
/** The guest's own table, put aside while at someone else's table. */
let stashed: { state: TableState; spreadId: string } | null = null;

const syncSpreadFromState = () => {
  const id = state.value.spreadId;
  if (id !== spreadId.value && game.spreads.some((s) => s.id === id)) {
    spreadId.value = id;
    // Guests get their own spread back on leave; the host keeps the new one.
    if (roomApi.isHost.value) settings.spreadId = id;
    nextTick(fitView);
  }
};

const heldColors = computed(() => {
  const out: Record<string, string> = {};
  for (const [k, p] of Object.entries(roomApi.state.held)) out[k] = p.color;
  return out;
});

roomApi.setHandlers({
  onMessage: (from: string, msg: Msg, r: Room) => {
    if (r.isHost) {
      if (msg.t === 'op') applyAsHost(msg.op, r);
      return;
    }
    // Guest: follow the host.
    if (msg.t === 'snapshot') {
      if (!isValidState(msg.state, game)) {
        console.warn('snapshot rejected', msg.state);
        return;
      }
      tbl.state.value = msg.state;
      syncSpreadFromState();
    } else if (msg.t === 'effect' && msg.name === 'shuffle') {
      playScatter(state.value.deck);
    }
  },
  onGuestReady: (_peer: Peer, r: Room) => {
    r.send({ t: 'snapshot', state: state.value }, _peer.id);
  },
  onLeft: (reason: string, wasHost: boolean) => {
    if (stashed) {
      tbl.setAutosave(true);
      spreadId.value = stashed.spreadId;
      tbl.replace(stashed.state);
      stashed = null;
      nextTick(fitView);
    }
    roomNotice.value =
      reason === 'left'
        ? t(wasHost ? 'room.ended' : 'room.left')
        : reason === 'room-expired' || reason === 'signaling-lost'
          ? t(wasHost ? 'room.errExpired' : 'room.errConnect')
          : reason === 'host-left'
            ? t('room.errHostLeft')
            : t('room.errConnect');
    setTimeout(() => (roomNotice.value = null), 5000);
  },
});

// When we become a guest, stash our table; the host's snapshot replaces it.
watch(
  () => roomApi.state.status,
  (status, prev) => {
    if (status === 'joined' && prev !== 'joined') {
      stashed = { state: state.value, spreadId: spreadId.value };
      tbl.setAutosave(false);
    }
    if (status === 'hosting' && prev !== 'hosting') {
      // Ops at a shared table bypass the history, so an old undo stack would
      // jump the table back to before the room. Guests get a snapshot on hello.
      tbl.replace(state.value);
    }
  },
);

const openRoomPanel = (token = '') => {
  roomInitialToken.value = token;
  roomOpen.value = true;
};

/** `#join=CODE` in the URL opens the panel with the code filled in. Returns whether there was one. */
const checkJoinLink = (): boolean => {
  const m = /[#&]join=([A-Za-z0-9]{4,8})/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + location.search);
  openRoomPanel(m[1]!.toUpperCase());
  return true;
};

const inRoom = computed(() => roomApi.inRoom.value);

// ---------------------------------------------------------------------------
// Detail + help modals
// ---------------------------------------------------------------------------
const toolbarKey = ref(0);
const detailLoc = shallowRef<Location | null>(null);
const helpOpen = ref(false);

/** Cards on the table in reading order: slots first, then loose by z. */
const readingOrder = computed<Location[]>(() => {
  const slots: Location[] = state.value.slots.flatMap((c, index) => (c ? [{ kind: 'slot', index } as Location] : []));
  const loose: Location[] = state.value.loose
    .map((c, index) => ({ z: c.z, loc: { kind: 'loose', index } as Location }))
    .sort((a, b) => a.z - b.z)
    .map((x) => x.loc);
  return [...slots, ...loose];
});
const detailIndex = computed(() =>
  readingOrder.value.findIndex((x) => x.kind === detailLoc.value?.kind && x.index === detailLoc.value?.index),
);
const detailCard = computed(() => (detailLoc.value ? ops.getCard(state.value, detailLoc.value) : null));
const detailLabel = computed(() =>
  detailLoc.value?.kind === 'slot' ? l(spread.value.slots[detailLoc.value.index]?.label) : null,
);

const openDetail = (loc: Location) => {
  if (loc.kind === 'deck') return;
  detailLoc.value = loc;
};
const stepDetail = (dir: 1 | -1) => {
  const next = readingOrder.value[detailIndex.value + dir];
  if (next) detailLoc.value = next;
};

const closeHelp = () => {
  helpOpen.value = false;
  settings.seenHelp = true;
};

// ---------------------------------------------------------------------------
// Ask the cards (AI interpretation)
// ---------------------------------------------------------------------------
const askOpen = ref(false);

/** A card chip in the interpretation was tapped: show that card. */
const focusFromAsk = (loc: Location) => {
  askOpen.value = false;
  openDetail(loc);
};

/** The model picked cards for a dream: lay them face up, like any other op. */
const placeSuggested = (cards: SuggestedCard[]) => {
  dispatch({ k: 'place', cards, fallback: freeDropPoint() });
  vibrate(12);
  nextTick(fitView);
};

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
const onKeydown = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (detailLoc.value || helpOpen.value || roomOpen.value || askOpen.value) return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    e.preventDefault();
    if (!inRoom.value) e.shiftKey ? tbl.redo() : tbl.undo();
  } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
    e.preventDefault();
    if (!inRoom.value) tbl.redo();
  } else if (e.ctrlKey || e.metaKey || e.altKey) {
    return;
  } else if (key === 'd') drawFromDeck();
  else if (key === 's') shuffle();
  else if (key === 'f') fitView();
  else if (key === 'r') reveal();
  else if (key === 'z') { if (!inRoom.value) tbl.undo(); }
  else if (key === '+' || key === '=') cam.zoomBy(1.2);
  else if (key === '-') cam.zoomBy(1 / 1.2);
  else if (key === '?') helpOpen.value = true;
  else if (key === 'a') askOpen.value = true;
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
onMounted(async () => {
  const el = surface.value!;
  const measure = () => {
    const r = el.getBoundingClientRect();
    surfaceSize.value = { width: r.width, height: r.height };
  };
  measure();
  observer = new ResizeObserver(() => {
    measure();
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitView, 120);
  });
  observer.observe(el);
  el.addEventListener('scroll', () => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });
  window.addEventListener('keydown', onKeydown);
  await nextTick();
  fitView();

  if (!checkJoinLink() && !settings.seenHelp) helpOpen.value = true;
  // A join link opened while the app is already running (PWA, second tap on a
  // shared link) changes only the hash and does not reload the page.
  window.addEventListener('hashchange', checkJoinLink);

  const records = await loadCustomDecks();
  customDecks.value = records.map((r) => toDeckDef(r, 'standard'));
  if (settings.deckId && findDeck(decks.value, settings.deckId)) deckId.value = settings.deckId;
});

onBeforeUnmount(() => {
  roomApi.leave();
  observer?.disconnect();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('hashchange', checkJoinLink);
  customDecks.value.forEach(revokeDeck);
});

watch(
  () => settings.fanned,
  () => nextTick(fitView),
);

const zoomPct = computed(() => Math.round(cam.camera.value.zoom * 100));
</script>

<template>
  <div ref="root" class="table" :style="cssVars" :aria-label="t('a11y.table')">
    <Toolbar
      :key="toolbarKey"
      :decks="decks"
      :deck-id="deckId"
      :spreads="game.spreads"
      :spread-id="spreadId"
      :fanned="settings.fanned"
      :shuffling="shuffling"
      :can-undo="tbl.canUndo.value && !inRoom"
      :can-redo="tbl.canRedo.value && !inRoom"
      :allow-reversed="settings.allowReversed"
      :minor-arcana="settings.minorArcana"
      :minor-arcana-locked="inRoom && !roomApi.isHost.value"
      :haptics="settings.haptics"
      :locale="settings.locale"
      :deck-is-custom="Boolean(deck.custom)"
      @update:deck-id="onDeckChange"
      @update:spread-id="onSpreadChange"
      @shuffle="shuffle"
      @toggle-fan="toggleFan"
      @draw="drawFromDeck()"
      @deal="deal"
      @reveal="reveal"
      @gather="gather"
      @undo="tbl.undo"
      @redo="tbl.redo"
      @fit="fitView"
      @new-reading="newReading"
      @toggle-reversed="settings.allowReversed = !settings.allowReversed"
      @toggle-minor="toggleMinorArcana"
      @toggle-haptics="settings.haptics = !settings.haptics"
      @set-locale="(loc: Locale) => (settings.locale = loc)"
      @import-zip="onImportZip"
      @delete-deck="onDeleteDeck"
      @help="helpOpen = true"
      @room="openRoomPanel()"
      @ask="askOpen = true"
    />


    <main ref="surface" class="surface" @contextmenu.prevent>
      <TableCanvas
        :spread="spread"
        :state="state"
        :card-size="cardSize"
        :cards-by-id="cardsById"
        :deck="deck"
        :transform="cam.transformStyle.value"
        :image-for="imageFor"
        :back-for="backFor"
        :scale-for="scaleFor"
        :dragging="dragging"
        :held="heldColors"
        @card-down="onCardDown"
        @activate="flip"
        @info="openDetail"
      />

      <DeckDrawer
        :cards="state.deck"
        :fanned="settings.fanned"
        :card-size="cardSize"
        :back-for="backFor"
        :scale-for="scaleFor"
        :available-width="surfaceSize.width"
        :shuffling="shuffling"
        :scatter="scatter"
        :dragging-index="dragging?.kind === 'deck' ? dragging.index : null"
        @card-down="onDeckCardDown"
        @activate="drawFromDeck()"
      />

      <div v-if="inRoom" class="room-banner ui" role="status">
        <button class="btn" type="button" data-testid="room-banner" @click="openRoomPanel()">
          <span class="dot" :style="{ background: roomApi.state.me?.color }"></span>
          {{ t('room.banner', { n: roomApi.state.peers.length, token: roomApi.state.token ?? '…' }) }}
        </button>
      </div>
      <div v-else-if="roomNotice" class="room-banner ui" role="status"><span class="notice">{{ roomNotice }}</span></div>

      <div class="view-controls ui" role="group" :aria-label="t('a11y.zoom', { pct: zoomPct })">
        <button class="btn btn-icon" type="button" :aria-label="t('toolbar.zoomIn')" @click="cam.zoomBy(1.25)">+</button>
        <button class="btn btn-icon" type="button" :aria-label="t('toolbar.zoomOut')" @click="cam.zoomBy(0.8)">−</button>
        <button class="btn btn-icon" type="button" :aria-label="t('toolbar.fit')" :title="t('toolbar.fit')" @click="fitView">⛶</button>
        <div class="zoom-pct" aria-hidden="true">{{ zoomPct }}%</div>
      </div>
    </main>

    <DragGhost
      v-if="drag.session.value?.active && dragCard"
      :card="dragCard"
      :client-x="drag.session.value.clientX"
      :client-y="drag.session.value.clientY"
      :grab-x="drag.session.value.grabX"
      :grab-y="drag.session.value.grabY"
      :card-size="cardSize"
      :zoom="cam.camera.value.zoom"
      :front-src="imageFor(dragCard.id)"
      :back-src="backFor(dragCard.id)"
      :scale="scaleFor(dragCard.id)"
      :fit="deck.fit"
      :alt="l(cardsById.get(dragCard.id)?.name)"
    />

    <CardDetail
      v-if="detailLoc && detailCard"
      :card="detailCard"
      :def="cardsById.get(detailCard.id)"
      :position-label="detailLabel"
      :front-src="imageFor(detailCard.id)"
      :back-src="backFor(detailCard.id)"
      :fit="deck.fit"
      :has-prev="detailIndex > 0"
      :has-next="detailIndex >= 0 && detailIndex < readingOrder.length - 1"
      @close="detailLoc = null"
      @flip="flip(detailLoc)"
      @prev="stepDetail(-1)"
      @next="stepDetail(1)"
    />

    <HelpPanel v-if="helpOpen" :credits="deck.credits" @close="closeHelp" />
    <RoomPanel v-if="roomOpen" :initial-token="roomInitialToken" @close="roomOpen = false" />
    <AskPanel
      v-if="askOpen"
      :state="state"
      :spread="spread"
      :cards-by-id="cardsById"
      :deck="deck"
      :allow-reversed="settings.allowReversed"
      @close="askOpen = false"
      @focus-card="focusFromAsk"
      @place-cards="placeSuggested"
    />
  </div>
</template>

<style scoped>
.table {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #3b3b4f;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(138, 120, 160, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(90, 130, 160, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, #4a4a60 0%, #202028 100%);
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.surface {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  /* `clip` (unlike `hidden`) cannot be scrolled by focus/scrollIntoView, which
     would otherwise shift the whole table when a card or the deck gets focus. */
  overflow: hidden;
  overflow: clip;
  touch-action: none;
}
.view-controls {
  position: absolute;
  right: calc(8px + var(--safe-right));
  bottom: calc(var(--card-h) * 0.32 + 48px + var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 400;
  align-items: center;
}
.room-banner {
  position: absolute;
  left: calc(8px + var(--safe-left));
  top: 8px;
  z-index: 400;
}
.room-banner .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.room-banner .notice {
  display: inline-block; padding: 8px 12px; border-radius: 10px;
  background: rgba(20, 20, 26, 0.9); color: var(--color-text); font-size: 0.85rem;
}
.zoom-pct {
  font: 11px/1 ui-monospace, monospace;
  color: var(--color-text-muted);
  text-shadow: 0 1px 3px #000;
}
</style>
