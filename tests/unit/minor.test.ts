import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RANKS, SUITS, TAROT_MINOR_ARCANA_COUNT, tarotMinorArcana } from '../../src/decks/tarot-minor';
import { tarotGame } from '../../src/games/tarot';
import { resolveBack } from '../../src/decks/registry';
import { imageKeyFromName } from '../../src/decks/zip';
import { activeCards, cardSets, createTable, isCardSet, usesMinorArcana } from '../../src/engine/table';
import { seededRng } from '../../src/engine/shuffle';
import { isCompatible } from '../../src/composables/useTable';
import { isValidOp, isValidState } from '../../src/net/protocol';
import type { DeckDef } from '../../src/engine/types';

const spread = tarotGame.spreads.find((s) => s.id === 'three')!;
const full = () => createTable({ game: tarotGame, deckId: 'standard', spread, rng: seededRng(1) });
const majorOnly = () =>
  createTable({ game: { ...tarotGame, rules: { ...tarotGame.rules, minorArcana: false } }, deckId: 'standard', spread, rng: seededRng(1) });

describe('Minor Arcana data', () => {
  it('has 56 cards: four suits of fourteen, ids unique and matching the image names', () => {
    expect(tarotMinorArcana).toHaveLength(TAROT_MINOR_ARCANA_COUNT);
    expect(new Set(tarotMinorArcana.map((c) => c.id)).size).toBe(56);
    for (const suit of SUITS) for (const rank of RANKS) expect(tarotMinorArcana.some((c) => c.id === `${suit}-${rank}`)).toBe(true);
    for (const c of tarotMinorArcana) {
      expect(c.arcana).toBe('minor');
      expect(c.scale).toBeLessThan(1);
      expect(c.name['pt-BR']).toBeTruthy();
      expect(c.keywords?.['pt-BR']).toHaveLength(3);
      expect(c.meaning?.upright['pt-BR']).toBeTruthy();
      expect(c.meaning?.reversed['pt-BR']).toBeTruthy();
    }
  });
  it('names follow "<Rank> of <Suit>" / "<Rank> de <Naipe>"', () => {
    const q = tarotMinorArcana.find((c) => c.id === 'cups-queen')!;
    expect(q.name.en).toBe('Queen of Cups');
    expect(q.name['pt-BR']).toBe('Rainha de Copas');
    expect(tarotMinorArcana.find((c) => c.id === 'pentacles-01')!.name['pt-BR']).toBe('Ás de Ouros');
  });
  it('ships generic artwork and a minor back for every static deck that declares one', () => {
    for (const c of tarotMinorArcana) expect(existsSync(`public/decks/standard/${c.id}.webp`), c.id).toBe(true);
    expect(existsSync('public/decks/standard/back-minor.webp')).toBe(true);
    expect(existsSync('public/decks/vitoria/back-minor.webp')).toBe(true);
  });
  it('is part of the tarot game after the 22 majors', () => {
    expect(tarotGame.cards).toHaveLength(78);
    expect(tarotGame.cards.slice(0, 22).every((c) => c.arcana === 'major')).toBe(true);
  });
});

describe('minorArcana rule', () => {
  it('leaves the minors out of a new table when off', () => {
    expect(activeCards(tarotGame, tarotGame.rules)).toHaveLength(78);
    expect(activeCards(tarotGame, { ...tarotGame.rules, minorArcana: false })).toHaveLength(22);
    expect(full().deck).toHaveLength(78);
    expect(majorOnly().deck).toHaveLength(22);
    expect(usesMinorArcana(full(), tarotGame)).toBe(true);
    expect(usesMinorArcana(majorOnly(), tarotGame)).toBe(false);
  });
  it('recognises both card sets and nothing in between', () => {
    expect(cardSets(tarotGame)).toHaveLength(2);
    const all = tarotGame.cards.map((c) => c.id);
    const majors = all.slice(0, 22);
    expect(isCardSet(all, tarotGame)).toBe(true);
    expect(isCardSet(majors, tarotGame)).toBe(true);
    expect(isCardSet([...majors, 'wands-01'], tarotGame)).toBe(false);
    expect(isCardSet(all.slice(1), tarotGame)).toBe(false);
    expect(isCardSet([...majors.slice(1), '00', '00'], tarotGame)).toBe(false);
    expect(isCardSet([...majors, 'nope'], tarotGame)).toBe(false);
  });
  it('a game without minors has a single card set', () => {
    const game = { ...tarotGame, cards: tarotGame.cards.slice(0, 22) };
    expect(cardSets(game)).toHaveLength(1);
  });
  it('saved tables and host snapshots are accepted with or without the minors', () => {
    for (const s of [full(), majorOnly()]) {
      expect(isCompatible(s, tarotGame, spread)).toBe(true);
      expect(isValidState(s, tarotGame)).toBe(true);
    }
    const mixed = { ...majorOnly(), loose: [{ id: 'cups-02', face: 'down' as const, reversed: false, x: 0, y: 0, z: 1 }] };
    expect(isCompatible(mixed, tarotGame, spread)).toBe(false);
    expect(isValidState(mixed, tarotGame)).toBe(false);
  });
  it('place ops may carry a full deck but not more', () => {
    const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), reversed: false }));
    expect(isValidOp({ k: 'place', cards: cards(78), fallback: { x: 0, y: 0 } })).toBe(true);
    expect(isValidOp({ k: 'place', cards: cards(79), fallback: { x: 0, y: 0 } })).toBe(false);
  });
});

describe('minor backs', () => {
  const standard: DeckDef = {
    id: 'standard', name: 'Std', family: 'tarot-major', cards: ['00', 'wands-01'], hasBack: true, hasMinorBack: true, aspectRatio: 0.6, fit: 'cover',
    source: { type: 'static', basePath: '/decks/standard', extension: 'webp' },
  };
  const painted: DeckDef = {
    id: 'painted', name: 'P', family: 'tarot-major', cards: ['00'], hasBack: true, aspectRatio: 0.6, fit: 'cover',
    fallbackDeckId: 'standard', source: { type: 'static', basePath: '/decks/painted', extension: 'png' },
  };
  const lonely: DeckDef = { ...painted, id: 'lonely', fallbackDeckId: undefined, source: { type: 'static', basePath: '/decks/lonely', extension: 'png' } };
  const major = tarotGame.cards[0]!;
  const minor = tarotMinorArcana[0]!;

  it('minor cards use back-minor when the deck has one, majors keep the regular back', () => {
    expect(resolveBack([standard], standard, minor)).toBe('/decks/standard/back-minor.webp');
    expect(resolveBack([standard], standard, major)).toBe('/decks/standard/back.webp');
    expect(resolveBack([standard], standard, undefined)).toBe('/decks/standard/back.webp');
  });
  it('follows the fallback chain for the minor back and falls back to the deck’s own back', () => {
    expect(resolveBack([standard, painted], painted, minor)).toBe('/decks/standard/back-minor.webp');
    expect(resolveBack([lonely], lonely, minor)).toBe('/decks/lonely/back.png');
  });
});

describe('ZIP file names', () => {
  it('accepts majors, minors and both backs', () => {
    expect(imageKeyFromName('art/0.png')).toEqual({ key: '00', ext: 'png' });
    expect(imageKeyFromName('21.webp')).toEqual({ key: '21', ext: 'webp' });
    expect(imageKeyFromName('deck/Wands-01.JPG')).toEqual({ key: 'wands-01', ext: 'jpg' });
    expect(imageKeyFromName('pentacles-knight.webp')).toEqual({ key: 'pentacles-knight', ext: 'webp' });
    expect(imageKeyFromName('back-minor.webp')).toEqual({ key: 'back-minor', ext: 'webp' });
    expect(imageKeyFromName('back.webp')).toEqual({ key: 'back', ext: 'webp' });
    expect(imageKeyFromName('wands-11.webp')).toBeNull();
    expect(imageKeyFromName('coins-01.webp')).toBeNull();
    expect(imageKeyFromName('readme.txt')).toBeNull();
  });
});
