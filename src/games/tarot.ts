import type { GameDef } from '../engine/types';
import { TAROT_MAJOR_FAMILY, tarotMajorArcana } from '../decks/tarot-major';
import { tarotSpreads } from '../spreads/tarot';

/**
 * The tarot game: 22 Major Arcana, classic spreads, reversed cards optional.
 * A new game (Lenormand, playing cards, an oracle deck) is another GameDef
 * registered in `./index.ts`.
 */
export const tarotGame: GameDef = {
  id: 'tarot',
  name: { en: 'Tarot', 'pt-BR': 'Tarô' },
  family: TAROT_MAJOR_FAMILY,
  cards: tarotMajorArcana,
  spreads: tarotSpreads,
  rules: {
    allowReversed: true,
    reversedChance: 0.3,
    drawFaceDown: true,
  },
  defaultDeckId: 'vitoria',
  defaultSpreadId: 'free',
};
