import { describe, expect, it } from 'vitest';
import { applyOp, isValidMsg, isValidOp, isValidState } from '../../src/net/protocol';
import { createTable } from '../../src/engine/table';
import { seededRng } from '../../src/engine/shuffle';
import { tarotGame } from '../../src/games/tarot';

const spread = tarotGame.spreads.find((s) => s.id === 'three')!;
const ctx = { game: tarotGame, rules: tarotGame.rules };
const fresh = () => createTable({ game: tarotGame, deckId: 'standard', spread, rng: seededRng(1) });

describe('protocol validation', () => {
  it('accepts well-formed ops and rejects malformed ones', () => {
    expect(isValidOp({ k: 'move', from: { kind: 'deck', index: 21 }, to: { kind: 'slot', index: 0 } })).toBe(true);
    expect(isValidOp({ k: 'move', from: { kind: 'deck', index: 21 }, to: { kind: 'loose', x: 1, y: 2 } })).toBe(true);
    expect(isValidOp({ k: 'move', from: { kind: 'deck' }, to: { kind: 'slot', index: 0 } })).toBe(false);
    expect(isValidOp({ k: 'flip', loc: { kind: 'slot', index: 'a' } })).toBe(false);
    expect(isValidOp({ k: 'shuffle', seed: 'x' })).toBe(false);
    expect(isValidOp({ k: 'place', cards: [{ id: '17', reversed: false }], fallback: { x: 0, y: 0 } })).toBe(true);
    expect(isValidOp({ k: 'place', cards: [{ id: 17 }], fallback: { x: 0, y: 0 } })).toBe(false);
    expect(isValidOp({ k: 'place', cards: [], fallback: null })).toBe(false);
    expect(isValidOp({ k: 'nope' })).toBe(false);
    expect(isValidOp(null)).toBe(false);
  });

  it('validates messages structurally', () => {
    expect(isValidMsg({ t: 'hello', v: 1, name: 'x' })).toBe(true);
    expect(isValidMsg({ t: 'op', op: { k: 'deal' } })).toBe(true);
    expect(isValidMsg({ t: 'op', op: { k: 'bogus' } })).toBe(false);
    expect(isValidMsg({ t: 'holding', loc: null })).toBe(true);
    expect(isValidMsg({ t: 'unknown' })).toBe(false);
  });

  it('validates snapshots against the game', () => {
    const s = fresh();
    expect(isValidState(s, tarotGame)).toBe(true);
    expect(isValidState({ ...s, gameId: 'other' }, tarotGame)).toBe(false);
    expect(isValidState({ ...s, deck: s.deck.slice(1) }, tarotGame)).toBe(false);
    expect(isValidState({ ...s, deck: [...s.deck.slice(1), { id: 'zz', face: 'down', reversed: false }] }, tarotGame)).toBe(false);
    // The same card twice, a spread the guest does not know, a slot count that
    // does not match the spread, and a loose card with a NaN position.
    expect(isValidState({ ...s, deck: [...s.deck.slice(1), { ...s.deck[5]! }] }, tarotGame)).toBe(false);
    expect(isValidState({ ...s, spreadId: 'nope' }, tarotGame)).toBe(false);
    expect(isValidState({ ...s, slots: [null] }, tarotGame)).toBe(false);
    const top = s.deck[s.deck.length - 1]!;
    expect(isValidState({ ...s, deck: s.deck.slice(0, -1), loose: [{ ...top, x: NaN, y: 0, z: 1 }] }, tarotGame)).toBe(false);
    expect(isValidState({ ...s, deck: s.deck.slice(0, -1), loose: [{ ...top, x: 1, y: 0, z: 1 }] }, tarotGame)).toBe(true);
  });
});

describe('applyOp', () => {
  it('places suggested cards face up and ignores reversal when the rules forbid it', () => {
    const s = applyOp(fresh(), { k: 'place', cards: [{ id: '17', reversed: true }], fallback: { x: 0, y: 0 } }, { game: tarotGame, rules: { ...tarotGame.rules, allowReversed: false } });
    expect(s.slots[0]).toEqual({ id: '17', face: 'up', reversed: false });
    const r = applyOp(fresh(), { k: 'place', cards: [{ id: '17', reversed: true }], fallback: { x: 0, y: 0 } }, ctx);
    expect(r.slots[0]?.reversed).toBe(true);
  });

  it('is deterministic for seeded ops so every peer computes the same table', () => {
    const a = applyOp(fresh(), { k: 'shuffle', seed: 42 }, ctx);
    const b = applyOp(fresh(), { k: 'shuffle', seed: 42 }, ctx);
    expect(a).toEqual(b);
    const c = applyOp(fresh(), { k: 'newReading', spreadId: 'celtic-cross', seed: 7 }, ctx);
    const d = applyOp(fresh(), { k: 'newReading', spreadId: 'celtic-cross', seed: 7 }, ctx);
    expect(c).toEqual(d);
    expect(c.slots).toHaveLength(10);
  });

  it('routes each op to the engine', () => {
    let s = fresh();
    s = applyOp(s, { k: 'draw', fallback: { x: 0, y: 0 } }, ctx);
    expect(s.slots[0]).not.toBeNull();
    s = applyOp(s, { k: 'flip', loc: { kind: 'slot', index: 0 } }, ctx);
    expect(s.slots[0]?.face).toBe('up');
    s = applyOp(s, { k: 'deal' }, ctx);
    expect(s.slots.every(Boolean)).toBe(true);
    s = applyOp(s, { k: 'reveal' }, ctx);
    expect(s.slots.every((c) => c?.face === 'up')).toBe(true);
    s = applyOp(s, { k: 'move', from: { kind: 'slot', index: 1 }, to: { kind: 'deck' } }, ctx);
    expect(s.slots[1]).toBeNull();
    s = applyOp(s, { k: 'gather' }, ctx);
    expect(s.deck).toHaveLength(22);
  });

  it('ignores newReading for an unknown spread', () => {
    const s = fresh();
    expect(applyOp(s, { k: 'newReading', spreadId: 'nope', seed: 1 }, ctx)).toBe(s);
  });
});
