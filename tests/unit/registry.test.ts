import { describe, expect, it } from 'vitest';
import { resolveImage } from '../../src/decks/registry';
import type { DeckDef } from '../../src/engine/types';

const standard: DeckDef = {
  id: 'standard', name: 'Std', family: 'tarot-major', cards: ['00', '01'], hasBack: true, aspectRatio: 0.6, fit: 'cover',
  source: { type: 'static', basePath: '/decks/standard', extension: 'webp' },
};
const partial: DeckDef = {
  id: 'partial', name: 'P', family: 'tarot-major', cards: ['01'], hasBack: false, aspectRatio: 0.6, fit: 'cover',
  fallbackDeckId: 'standard', source: { type: 'static', basePath: '/decks/partial', extension: 'png' },
};
const loop: DeckDef = { ...partial, id: 'loop', fallbackDeckId: 'loop' };

describe('resolveImage', () => {
  it('uses the deck’s own image when present', () => {
    expect(resolveImage([standard, partial], partial, '01')).toBe('/decks/partial/01.png');
  });
  it('falls back for missing cards and backs', () => {
    expect(resolveImage([standard, partial], partial, '00')).toBe('/decks/standard/00.webp');
    expect(resolveImage([standard, partial], partial, 'back')).toBe('/decks/standard/back.webp');
  });
  it('returns null when nothing has the image and survives fallback loops', () => {
    expect(resolveImage([standard, partial], partial, '21')).toBeNull();
    expect(resolveImage([loop], loop, '00')).toBeNull();
  });
});
