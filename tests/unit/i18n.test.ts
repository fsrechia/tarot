import { describe, expect, it } from 'vitest';
import { messages, translate } from '../../src/i18n';
import { tarotMajorArcana } from '../../src/decks/tarot-major';

describe('i18n', () => {
  it('interpolates parameters', () => {
    expect(translate('en', 'deck.remaining', { n: 3 })).toBe('3 left');
    expect(translate('pt-BR', 'deck.remaining', { n: 3 })).toBe('3 restantes');
  });
  it('has every key in every locale', () => {
    const en = Object.keys(messages.en);
    for (const loc of Object.keys(messages) as (keyof typeof messages)[]) {
      expect(Object.keys(messages[loc]).sort()).toEqual(en.sort());
    }
  });
  it('has 22 major arcana with pt-BR names and meanings', () => {
    expect(tarotMajorArcana).toHaveLength(22);
    for (const c of tarotMajorArcana) {
      expect(c.name['pt-BR']).toBeTruthy();
      expect(c.meaning?.upright['pt-BR']).toBeTruthy();
      expect(c.meaning?.reversed['pt-BR']).toBeTruthy();
    }
    expect(new Set(tarotMajorArcana.map((c) => c.id)).size).toBe(22);
  });
});
