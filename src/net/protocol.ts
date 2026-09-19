/**
 * Wire protocol for a shared table. The host is the authority: guests send
 * `op` proposals, the host applies them with the pure engine and broadcasts
 * the resulting `snapshot`. Everything is JSON and versioned.
 */
import type { DropTarget, GameDef, GameRules, Location, TableState } from '../engine/types';
import * as table from '../engine/table';
import { seededRng } from '../engine/shuffle';

export const PROTOCOL_VERSION = 1;

/** Upper bound for cards in one `place` op (a full 78-card deck). */
const MAX_PLACE = 78;

export type Op =
  | { k: 'move'; from: Location; to: DropTarget }
  | { k: 'flip'; loc: Location }
  | { k: 'draw'; index?: number; fallback: { x: number; y: number } }
  | { k: 'gather' }
  | { k: 'shuffle'; seed: number }
  | { k: 'deal' }
  | { k: 'reveal' }
  | { k: 'place'; cards: { id: string; reversed: boolean }[]; fallback: { x: number; y: number } }
  | { k: 'newReading'; spreadId: string; seed: number };

export interface Peer {
  id: string;
  name: string;
  color: string;
}

export type Msg =
  | { t: 'hello'; v: number; name: string }
  | { t: 'welcome'; v: number; you: Peer; peers: Peer[] }
  | { t: 'peers'; peers: Peer[] }
  | { t: 'snapshot'; state: TableState }
  | { t: 'op'; op: Op }
  | { t: 'effect'; name: 'shuffle' }
  | { t: 'holding'; loc: Location | null }
  | { t: 'held'; peerId: string; loc: Location | null }
  | { t: 'bye' };

export interface ApplyContext {
  game: GameDef;
  rules: GameRules;
}

/** Applies an op to a state with the engine. Throws on unknown ops. */
export function applyOp(state: TableState, op: Op, ctx: ApplyContext): TableState {
  switch (op.k) {
    case 'move':
      return table.moveCard(state, op.from, op.to);
    case 'flip': {
      let s = table.flipCard(state, op.loc, ctx.rules);
      if (op.loc.kind === 'loose') s = table.raiseLoose(s, op.loc.index);
      return s;
    }
    case 'draw':
      return table.draw(state, op.fallback, op.index);
    case 'gather':
      return table.gatherAll(state);
    case 'shuffle':
      return table.shuffleTable(state, ctx.rules, seededRng(op.seed));
    case 'deal':
      return table.dealSpread(state);
    case 'reveal':
      return table.revealAll(state);
    case 'place':
      return table.placeCards(
        state,
        op.cards.map((c) => ({ id: c.id, reversed: ctx.rules.allowReversed && c.reversed })),
        op.fallback,
      );
    case 'newReading': {
      const spread = ctx.game.spreads.find((s) => s.id === op.spreadId);
      if (!spread) return state;
      return table.createTable({ game: { ...ctx.game, rules: ctx.rules }, deckId: state.deckId, spread, rng: seededRng(op.seed) });
    }
  }
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isLoc = (v: unknown): v is Location =>
  !!v && typeof v === 'object' && ['deck', 'slot', 'loose'].includes((v as Location).kind) && isNum((v as Location).index);
const isTarget = (v: unknown): v is DropTarget => {
  if (!v || typeof v !== 'object') return false;
  const t = v as DropTarget;
  if (t.kind === 'deck') return true;
  if (t.kind === 'slot') return isNum(t.index);
  if (t.kind === 'loose') return isNum(t.x) && isNum(t.y);
  return false;
};

/** Structural validation of an op received from a peer. */
export function isValidOp(v: unknown): v is Op {
  if (!v || typeof v !== 'object') return false;
  const op = v as Op;
  switch (op.k) {
    case 'move':
      return isLoc(op.from) && isTarget(op.to);
    case 'flip':
      return isLoc(op.loc);
    case 'draw':
      return (op.index === undefined || isNum(op.index)) && !!op.fallback && isNum(op.fallback.x) && isNum(op.fallback.y);
    case 'gather':
    case 'deal':
    case 'reveal':
      return true;
    case 'shuffle':
      return isNum(op.seed);
    case 'place':
      return (
        Array.isArray(op.cards) &&
        op.cards.length <= MAX_PLACE &&
        op.cards.every((c) => !!c && typeof c.id === 'string' && typeof c.reversed === 'boolean') &&
        !!op.fallback && isNum(op.fallback.x) && isNum(op.fallback.y)
      );
    case 'newReading':
      return typeof op.spreadId === 'string' && isNum(op.seed);
    default:
      return false;
  }
}

/**
 * Validation of a table snapshot from the host: exactly one of the game's card
 * sets (with or without the Minor Arcana, whatever the host plays), each card
 * once, a known spread with the right number of slots, finite loose positions.
 */
export function isValidState(v: unknown, game: GameDef): v is TableState {
  if (!v || typeof v !== 'object') return false;
  const s = v as TableState;
  if (s.version !== 1 || s.gameId !== game.id || typeof s.deckId !== 'string') return false;
  if (!Array.isArray(s.deck) || !Array.isArray(s.slots) || !Array.isArray(s.loose) || !isNum(s.nextZ)) return false;
  const spread = game.spreads.find((sp) => sp.id === s.spreadId);
  if (!spread || spread.slots.length !== s.slots.length) return false;
  const all = [...s.deck, ...s.loose, ...s.slots.filter((c) => c !== null)];
  for (const c of all) {
    if (!c || typeof c.id !== 'string' || (c.face !== 'up' && c.face !== 'down') || typeof c.reversed !== 'boolean') return false;
  }
  if (!table.isCardSet(all.map((c) => c.id), game)) return false;
  return s.loose.every((c) => isNum(c.x) && isNum(c.y) && isNum(c.z));
}

const isPeer = (v: unknown): v is Peer => {
  if (!v || typeof v !== 'object') return false;
  const p = v as Peer;
  return typeof p.id === 'string' && p.id.length <= 32 && typeof p.name === 'string' && p.name.length <= 32 && /^#[0-9a-f]{6}$/i.test(p.color);
};
const isPeerList = (v: unknown): v is Peer[] => Array.isArray(v) && v.length <= 16 && v.every(isPeer);

export function isValidMsg(v: unknown): v is Msg {
  if (!v || typeof v !== 'object') return false;
  const m = v as Msg;
  switch (m.t) {
    case 'hello':
      return typeof m.name === 'string';
    case 'welcome':
      return isPeer(m.you) && isPeerList(m.peers);
    case 'peers':
      return isPeerList(m.peers);
    case 'snapshot':
      return !!m.state;
    case 'op':
      return isValidOp(m.op);
    case 'effect':
      return m.name === 'shuffle';
    case 'holding':
      return m.loc === null || isLoc(m.loc);
    case 'held':
      return typeof m.peerId === 'string' && (m.loc === null || isLoc(m.loc));
    case 'bye':
      return true;
    default:
      return false;
  }
}

const COLORS = ['#e0b458', '#6fc2e0', '#e08a6f', '#8fd68f', '#c99be0', '#e0d06f', '#6fe0c2', '#e06fa6'];

export function colorFor(peerId: string): string {
  let h = 0;
  for (const ch of peerId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

export function locKey(loc: Location): string {
  return `${loc.kind}:${loc.index}`;
}
