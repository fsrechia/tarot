import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/engine/shuffle';
import * as ops from '../../src/engine/table';
import type { GameDef, GameRules, SpreadDef } from '../../src/engine/types';

const spread: SpreadDef = {
  id: 'three',
  name: { en: 'Three' },
  slots: [
    { id: 'a', label: { en: 'A' }, x: -1.2, y: 0 },
    { id: 'b', label: { en: 'B' }, x: 0, y: 0 },
    { id: 'c', label: { en: 'C' }, x: 1.2, y: 0 },
  ],
};

const rules: GameRules = { allowReversed: true, reversedChance: 0.5, drawFaceDown: true };
const noReversed: GameRules = { ...rules, allowReversed: false };

const game: GameDef = {
  id: 'test',
  name: { en: 'Test' },
  family: 'test',
  cards: Array.from({ length: 6 }, (_, i) => ({ id: String(i).padStart(2, '0'), name: { en: `Card ${i}` } })),
  spreads: [spread],
  rules,
  defaultDeckId: 'd',
  defaultSpreadId: 'three',
};

const fresh = (r: GameRules = rules) => ops.createTable({ game: { ...game, rules: r }, deckId: 'd', spread, rng: seededRng(5) });

const total = (s: ReturnType<typeof fresh>) => s.deck.length + s.loose.length + s.slots.filter(Boolean).length;

describe('createTable / shuffleTable', () => {
  it('puts every card in the deck face down', () => {
    const s = fresh();
    expect(s.deck).toHaveLength(6);
    expect(s.slots).toEqual([null, null, null]);
    expect(s.deck.every((c) => c.face === 'down')).toBe(true);
  });

  it('never deals reversed cards when the rule is off', () => {
    const s = fresh(noReversed);
    expect(s.deck.some((c) => c.reversed)).toBe(false);
  });

  it('gathers cards from slots and loose before shuffling', () => {
    let s = fresh();
    s = ops.dealSpread(s);
    s = ops.moveCard(s, { kind: 'deck', index: s.deck.length - 1 }, { kind: 'loose', x: 1, y: 1 });
    const again = ops.shuffleTable(s, rules, seededRng(9));
    expect(again.deck).toHaveLength(6);
    expect(again.loose).toHaveLength(0);
    expect(again.slots).toEqual([null, null, null]);
  });
});

describe('moveCard', () => {
  it('deck → slot', () => {
    const s = fresh();
    const top = s.deck[s.deck.length - 1]!;
    const next = ops.moveCard(s, { kind: 'deck', index: s.deck.length - 1 }, { kind: 'slot', index: 1 });
    expect(next.slots[1]?.id).toBe(top.id);
    expect(next.deck).toHaveLength(5);
    expect(total(next)).toBe(6);
  });

  it('deck → loose keeps position and assigns increasing z', () => {
    let s = fresh();
    s = ops.moveCard(s, { kind: 'deck', index: 5 }, { kind: 'loose', x: 0.5, y: -0.5 });
    s = ops.moveCard(s, { kind: 'deck', index: 4 }, { kind: 'loose', x: 1, y: 1 });
    expect(s.loose[0]).toMatchObject({ x: 0.5, y: -0.5, z: 1 });
    expect(s.loose[1]).toMatchObject({ x: 1, y: 1, z: 2 });
  });

  it('dropping on the deck returns the card face down', () => {
    let s = fresh();
    s = ops.moveCard(s, { kind: 'deck', index: 5 }, { kind: 'slot', index: 0 });
    s = ops.flipCard(s, { kind: 'slot', index: 0 }, rules);
    expect(s.slots[0]?.face).toBe('up');
    s = ops.moveCard(s, { kind: 'slot', index: 0 }, { kind: 'deck' });
    expect(s.slots[0]).toBeNull();
    expect(s.deck).toHaveLength(6);
    expect(s.deck[5]?.face).toBe('down');
  });

  it('slot → occupied slot swaps the two cards', () => {
    let s = ops.dealSpread(fresh());
    const a = s.slots[0]!.id;
    const b = s.slots[2]!.id;
    s = ops.moveCard(s, { kind: 'slot', index: 0 }, { kind: 'slot', index: 2 });
    expect(s.slots[2]?.id).toBe(a);
    expect(s.slots[0]?.id).toBe(b);
    expect(total(s)).toBe(6);
  });

  it('loose → occupied slot puts the occupant where the loose card was', () => {
    let s = ops.dealSpread(fresh());
    s = ops.moveCard(s, { kind: 'deck', index: s.deck.length - 1 }, { kind: 'loose', x: 2, y: 2 });
    const occupant = s.slots[1]!.id;
    const mover = s.loose[0]!.id;
    s = ops.moveCard(s, { kind: 'loose', index: 0 }, { kind: 'slot', index: 1 });
    expect(s.slots[1]?.id).toBe(mover);
    expect(s.loose[0]).toMatchObject({ id: occupant, x: 2, y: 2 });
  });

  it('deck → occupied slot sends the occupant back to the deck', () => {
    let s = ops.dealSpread(fresh());
    const occupant = s.slots[0]!.id;
    s = ops.moveCard(s, { kind: 'deck', index: s.deck.length - 1 }, { kind: 'slot', index: 0 });
    expect(s.deck[s.deck.length - 1]?.id).toBe(occupant);
    expect(total(s)).toBe(6);
  });
});

describe('flipCard', () => {
  it('cycles down → up → reversed → down when reversed is allowed', () => {
    let s = ops.moveCard(fresh(noReversed), { kind: 'deck', index: 5 }, { kind: 'slot', index: 0 });
    const loc = { kind: 'slot', index: 0 } as const;
    s = ops.flipCard(s, loc, rules);
    expect(s.slots[0]).toMatchObject({ face: 'up', reversed: false });
    s = ops.flipCard(s, loc, rules);
    expect(s.slots[0]).toMatchObject({ face: 'up', reversed: true });
    s = ops.flipCard(s, loc, rules);
    expect(s.slots[0]).toMatchObject({ face: 'down', reversed: false });
  });

  it('cycles down → up → down when reversed is not allowed', () => {
    let s = ops.moveCard(fresh(noReversed), { kind: 'deck', index: 5 }, { kind: 'slot', index: 0 });
    const loc = { kind: 'slot', index: 0 } as const;
    s = ops.flipCard(s, loc, noReversed);
    expect(s.slots[0]?.face).toBe('up');
    s = ops.flipCard(s, loc, noReversed);
    expect(s.slots[0]?.face).toBe('down');
  });

  it('shows a dealt-reversed card reversed first, then upright, then face down', () => {
    let s = fresh(noReversed);
    s = { ...s, deck: s.deck.map((c, i) => (i === 5 ? { ...c, reversed: true } : c)) };
    s = ops.moveCard(s, { kind: 'deck', index: 5 }, { kind: 'slot', index: 0 });
    const loc = { kind: 'slot', index: 0 } as const;
    s = ops.flipCard(s, loc, rules);
    expect(s.slots[0]).toEqual({ id: s.slots[0]!.id, face: 'up', reversed: true });
    s = ops.flipCard(s, loc, rules);
    expect(s.slots[0]).toMatchObject({ face: 'up', reversed: false, turned: true });
    s = ops.flipCard(s, loc, rules);
    expect(s.slots[0]).toEqual({ id: s.slots[0]!.id, face: 'down', reversed: false });
  });

  it('keeps the hand-turn through a move and forgets it when the card goes face down', () => {
    let s = ops.moveCard(fresh(noReversed), { kind: 'deck', index: 5 }, { kind: 'loose', x: 0, y: 0 });
    const loose = { kind: 'loose', index: 0 } as const;
    s = ops.flipCard(s, loose, rules);
    s = ops.flipCard(s, loose, rules);
    expect(s.loose[0]).toMatchObject({ face: 'up', reversed: true, turned: true });
    s = ops.moveCard(s, loose, { kind: 'slot', index: 1 });
    expect(s.slots[1]).toMatchObject({ turned: true });
    s = ops.flipCard(s, { kind: 'slot', index: 1 }, rules);
    expect(s.slots[1]).toEqual({ id: s.slots[1]!.id, face: 'down', reversed: false });
    s = ops.flipCard(s, { kind: 'slot', index: 1 }, rules);
    s = ops.flipCard(s, { kind: 'slot', index: 1 }, rules);
    s = ops.moveCard(s, { kind: 'slot', index: 1 }, { kind: 'deck' });
    expect(s.deck[s.deck.length - 1]).toEqual({ id: s.deck[s.deck.length - 1]!.id, face: 'down', reversed: true });
  });
});

describe('draw / deal / reveal / gather', () => {
  it('draw fills the next empty slot, then goes loose', () => {
    let s = fresh();
    s = ops.draw(s, { x: 0, y: 0 });
    s = ops.draw(s, { x: 0, y: 0 });
    s = ops.draw(s, { x: 0, y: 0 });
    expect(s.slots.every(Boolean)).toBe(true);
    s = ops.draw(s, { x: 3, y: 3 });
    expect(s.loose).toHaveLength(1);
    expect(s.loose[0]).toMatchObject({ x: 3, y: 3 });
  });

  it('draw with a specific deck index takes that card', () => {
    const s = fresh();
    const chosen = s.deck[2]!.id;
    const next = ops.draw(s, { x: 0, y: 0 }, 2);
    expect(next.slots[0]?.id).toBe(chosen);
  });

  it('deal, reveal and gather round-trip', () => {
    let s = ops.dealSpread(fresh());
    expect(s.deck).toHaveLength(3);
    s = ops.revealAll(s);
    expect(s.slots.every((c) => c?.face === 'up')).toBe(true);
    s = ops.gatherAll(s);
    expect(s.deck).toHaveLength(6);
    expect(s.deck.every((c) => c.face === 'down')).toBe(true);
  });

  it('raiseLoose puts a card on top', () => {
    let s = fresh();
    s = ops.moveCard(s, { kind: 'deck', index: 5 }, { kind: 'loose', x: 0, y: 0 });
    s = ops.moveCard(s, { kind: 'deck', index: 4 }, { kind: 'loose', x: 0, y: 0 });
    s = ops.raiseLoose(s, 0);
    expect(s.loose[0]!.z).toBeGreaterThan(s.loose[1]!.z);
  });
});

describe('placeCards', () => {
  it('lays the given cards face up in the next empty slots, then loose, skipping unknown ids', () => {
    const single: SpreadDef = { id: 'single', name: { en: 'One' }, slots: [{ id: 'a', label: { en: 'A' }, x: 0, y: 0 }] };
    const s0 = ops.createTable({ game, deckId: 'd', spread: single, rng: seededRng(5) });
    const s1 = ops.placeCards(s0, [{ id: '04', reversed: true }, { id: 'zz', reversed: false }, { id: '01', reversed: false }], { x: 1, y: 2 });
    expect(s1.slots[0]).toEqual({ id: '04', face: 'up', reversed: true });
    expect(s1.loose).toHaveLength(1);
    expect(s1.loose[0]).toMatchObject({ id: '01', face: 'up', reversed: false, x: 1.35, y: 2 }); // offset by the one card already placed
    expect(s1.deck).toHaveLength(4);
    expect(s1.deck.some((c) => c.id === '04' || c.id === '01')).toBe(false);
    expect(total(s1)).toBe(6);
  });
});
