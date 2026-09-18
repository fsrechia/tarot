/**
 * Pure table operations. Every function returns a new TableState and never
 * mutates its input, which makes undo/redo, persistence and testing trivial.
 */
import type {
  DropTarget,
  GameDef,
  GameRules,
  Location,
  LooseCard,
  Rng,
  SpreadDef,
  TableCard,
  TableState,
} from './types';
import { cryptoRandom, shuffle } from './shuffle';

export interface CreateTableOptions {
  game: GameDef;
  deckId: string;
  spread: SpreadDef;
  rng?: Rng;
}

/** Fresh, shuffled table with every card in the deck. */
export function createTable({ game, deckId, spread, rng = cryptoRandom }: CreateTableOptions): TableState {
  const cards: TableCard[] = game.cards.map((c) => ({ id: c.id, face: 'down', reversed: false }));
  const state: TableState = {
    version: 1,
    gameId: game.id,
    deckId,
    spreadId: spread.id,
    deck: cards,
    slots: spread.slots.map(() => null),
    loose: [],
    nextZ: 1,
  };
  return shuffleTable(state, game.rules, rng);
}

/** Collects every card back into the deck, face down, and shuffles. */
export function shuffleTable(state: TableState, rules: GameRules, rng: Rng = cryptoRandom): TableState {
  const all: TableCard[] = [
    ...state.deck,
    ...state.slots.filter((c): c is TableCard => c !== null),
    ...state.loose,
  ].map(({ id }) => ({ id, face: 'down' as const, reversed: false }));

  const deck = shuffle(all, rng).map((c) => ({
    ...c,
    reversed: rules.allowReversed && rng() < rules.reversedChance,
  }));

  return {
    ...state,
    deck,
    slots: state.slots.map(() => null),
    loose: [],
    nextZ: 1,
  };
}

export function getCard(state: TableState, loc: Location): TableCard | null {
  switch (loc.kind) {
    case 'deck':
      return state.deck[loc.index] ?? null;
    case 'slot':
      return state.slots[loc.index] ?? null;
    case 'loose':
      return state.loose[loc.index] ?? null;
  }
}

/** Removes a card from a location. Returns the card and the new state. */
function take(state: TableState, loc: Location): { state: TableState; card: TableCard } {
  const card = getCard(state, loc);
  if (!card) throw new Error(`No card at ${loc.kind}[${loc.index}]`);
  switch (loc.kind) {
    case 'deck':
      return { card, state: { ...state, deck: state.deck.filter((_, i) => i !== loc.index) } };
    case 'slot':
      return { card, state: { ...state, slots: state.slots.map((c, i) => (i === loc.index ? null : c)) } };
    case 'loose':
      return { card, state: { ...state, loose: state.loose.filter((_, i) => i !== loc.index) } };
  }
}

function strip(card: TableCard): TableCard {
  const out: TableCard = { id: card.id, face: card.face, reversed: card.reversed };
  if (card.turned) out.turned = true;
  return out;
}

/** A card as it goes back face down: orientation kept as dealt, hand-turn forgotten. */
function faceDown(card: TableCard): TableCard {
  return { id: card.id, face: 'down', reversed: card.reversed };
}

/**
 * Moves a card from `from` to `target`.
 * - Dropping on the deck returns the card face down to the top of the stack.
 * - Dropping on an occupied slot swaps: the occupant goes back to `from`
 *   (or becomes a loose card next to the slot when `from` was the deck).
 * - Dropping elsewhere creates a loose card at the given centre.
 */
export function moveCard(state: TableState, from: Location, target: DropTarget): TableState {
  const { state: s1, card } = take(state, from);

  switch (target.kind) {
    case 'deck': {
      return { ...s1, deck: [...s1.deck, faceDown(card)] };
    }
    case 'slot': {
      const occupant = s1.slots[target.index] ?? null;
      const slots = s1.slots.map((c, i) => (i === target.index ? strip(card) : c));
      let next: TableState = { ...s1, slots };
      if (occupant) {
        if (from.kind === 'slot') {
          next = { ...next, slots: next.slots.map((c, i) => (i === from.index ? occupant : c)) };
        } else if (from.kind === 'loose') {
          const original = state.loose[from.index]!;
          next = pushLoose(next, occupant, original.x, original.y);
        } else {
          // Came from the deck: put the occupant back on top of the deck.
          next = { ...next, deck: [...next.deck, faceDown(occupant)] };
        }
      }
      return next;
    }
    case 'loose': {
      return pushLoose(s1, card, target.x, target.y);
    }
  }
}

function pushLoose(state: TableState, card: TableCard, x: number, y: number): TableState {
  const loose: LooseCard = { ...strip(card), x, y, z: state.nextZ };
  return { ...state, loose: [...state.loose, loose], nextZ: state.nextZ + 1 };
}

/** Brings a loose card to the front without moving it. */
export function raiseLoose(state: TableState, index: number): TableState {
  const card = state.loose[index];
  if (!card || card.z === state.nextZ - 1) return state;
  return {
    ...state,
    loose: state.loose.map((c, i) => (i === index ? { ...c, z: state.nextZ } : c)),
    nextZ: state.nextZ + 1,
  };
}

/**
 * Cycles a card's orientation:
 *   face down → face up (as dealt) → face up, orientation toggled → face down.
 * With reversed cards disabled the middle two states collapse into one.
 * `turned` remembers the toggle so a card dealt reversed can be shown upright
 * (and a card dealt upright reversed) before it goes back face down.
 */
export function flipCard(state: TableState, loc: Location, rules: GameRules): TableState {
  const card = getCard(state, loc);
  if (!card) return state;

  let next: TableCard;
  if (card.face === 'down') {
    next = { id: card.id, face: 'up', reversed: card.reversed };
  } else if (rules.allowReversed && !card.turned) {
    next = { id: card.id, face: 'up', reversed: !card.reversed, turned: true };
  } else {
    next = { id: card.id, face: 'down', reversed: false };
  }
  return replace(state, loc, next);
}

/** Sets a card's orientation directly (keyboard / menu actions). */
export function setCard(state: TableState, loc: Location, patch: Partial<TableCard>): TableState {
  const card = getCard(state, loc);
  if (!card) return state;
  return replace(state, loc, { ...card, ...patch });
}

function replace(state: TableState, loc: Location, card: TableCard): TableState {
  switch (loc.kind) {
    case 'deck':
      return { ...state, deck: state.deck.map((c, i) => (i === loc.index ? card : c)) };
    case 'slot':
      return { ...state, slots: state.slots.map((c, i) => (i === loc.index ? card : c)) };
    case 'loose': {
      // Position is kept; the card fields are replaced wholesale so a dropped
      // optional flag (`turned`) does not linger.
      const { x, y, z } = state.loose[loc.index]!;
      return { ...state, loose: state.loose.map((c, i) => (i === loc.index ? { ...card, x, y, z } : c)) };
    }
  }
}

/** Index of the first empty slot, or -1. */
export function nextEmptySlot(state: TableState): number {
  return state.slots.findIndex((c) => c === null);
}

/**
 * Draws the top card (or a specific deck index) to the next empty slot. When the
 * spread has no free slot the card becomes a loose card at `fallback`.
 */
export function draw(
  state: TableState,
  fallback: { x: number; y: number },
  deckIndex: number = state.deck.length - 1,
): TableState {
  if (state.deck.length === 0 || !state.deck[deckIndex]) return state;
  const slot = nextEmptySlot(state);
  const from: Location = { kind: 'deck', index: deckIndex };
  return slot >= 0 ? moveCard(state, from, { kind: 'slot', index: slot }) : moveCard(state, from, { kind: 'loose', ...fallback });
}

/**
 * Places specific cards from the deck face up (used when the AI suggests cards
 * for a dream). Each card goes to the next empty slot, or lies loose near
 * `fallback` when the spread is full. Ids not in the deck are skipped.
 */
export function placeCards(
  state: TableState,
  cards: { id: string; reversed: boolean }[],
  fallback: { x: number; y: number },
): TableState {
  let s = state;
  let placed = 0;
  for (const c of cards) {
    const index = s.deck.findIndex((d) => d.id === c.id);
    if (index < 0) continue;
    const slot = nextEmptySlot(s);
    const from: Location = { kind: 'deck', index };
    const to: DropTarget = slot >= 0 ? { kind: 'slot', index: slot } : { kind: 'loose', x: fallback.x + placed * 0.35, y: fallback.y };
    s = moveCard(s, from, to);
    const loc: Location = to.kind === 'slot' ? { kind: 'slot', index: to.index } : { kind: 'loose', index: s.loose.length - 1 };
    s = setCard(s, loc, { face: 'up', reversed: c.reversed });
    placed++;
  }
  return s;
}

/** Deals the whole spread from the top of the deck, face down. */
export function dealSpread(state: TableState): TableState {
  let s = state;
  for (let i = 0; i < s.slots.length; i++) {
    if (s.slots[i] === null && s.deck.length > 0) {
      s = moveCard(s, { kind: 'deck', index: s.deck.length - 1 }, { kind: 'slot', index: i });
    }
  }
  return s;
}

/** Turns every card on the table face up. */
export function revealAll(state: TableState): TableState {
  return {
    ...state,
    slots: state.slots.map((c) => (c ? { ...c, face: 'up' } : c)),
    loose: state.loose.map((c) => ({ ...c, face: 'up' })),
  };
}

/** Returns every card on the table to the deck (top), face down, keeping deck order. */
export function gatherAll(state: TableState): TableState {
  const returned: TableCard[] = [
    ...state.slots.filter((c): c is TableCard => c !== null),
    ...state.loose,
  ].map(faceDown);
  return { ...state, deck: [...state.deck, ...returned], slots: state.slots.map(() => null), loose: [], nextZ: 1 };
}

/** Number of cards currently placed on the table (slots + loose). */
export function cardsOnTable(state: TableState): number {
  return state.slots.filter((c) => c !== null).length + state.loose.length;
}

/** Changes the spread, keeping the deck and turning placed cards into loose cards. */
export function changeSpread(state: TableState, spread: SpreadDef): TableState {
  let s: TableState = { ...state, spreadId: spread.id, slots: spread.slots.map(() => null) };
  const placed = state.slots.filter((c): c is TableCard => c !== null);
  placed.forEach((c, i) => {
    s = pushLoose(s, c, i * 0.3, 0);
  });
  return s;
}
