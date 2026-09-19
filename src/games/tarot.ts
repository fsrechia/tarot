import type { GameDef } from '../engine/types';
import { TAROT_MAJOR_FAMILY, tarotMajorArcana } from '../decks/tarot-major';
import { tarotMinorArcana } from '../decks/tarot-minor';
import { tarotSpreads } from '../spreads/tarot';

/**
 * The tarot game: 22 Major + 56 Minor Arcana, classic spreads, reversed cards
 * optional. `rules.minorArcana` (a setting) leaves the minors out for a
 * Major-only reading. A new game (Lenormand, playing cards, an oracle deck)
 * is another GameDef registered in `./index.ts`.
 */
export const tarotGame: GameDef = {
  id: 'tarot',
  name: { en: 'Tarot', 'pt-BR': 'Tarô' },
  family: TAROT_MAJOR_FAMILY,
  cards: [...tarotMajorArcana, ...tarotMinorArcana],
  spreads: tarotSpreads,
  rules: {
    allowReversed: true,
    reversedChance: 0.3,
    drawFaceDown: true,
    minorArcana: true,
  },
  defaultDeckId: 'vitoria',
  defaultSpreadId: 'free',
};
