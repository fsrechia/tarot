/**
 * Tarot spreads as data. Slot positions are card centres in card units
 * (x in card widths, y in card heights). Adding a spread = adding an object.
 */
import type { SpreadDef } from '../engine/types';

/** Horizontal/vertical spacing between neighbouring cards, in card units. */
const GX = 1.22;
const GY = 1.3;

export const freeSpread: SpreadDef = {
  id: 'free',
  name: { en: 'Free table', 'pt-BR': 'Mesa livre' },
  description: {
    en: 'No positions. Draw and place cards anywhere.',
    'pt-BR': 'Sem posições. Tire e coloque cartas onde quiser.',
  },
  slots: [],
};

export const singleCard: SpreadDef = {
  id: 'single',
  name: { en: 'Single card', 'pt-BR': 'Carta única' },
  description: { en: 'One card for one clear question.', 'pt-BR': 'Uma carta para uma pergunta clara.' },
  slots: [{ id: 'insight', label: { en: 'Insight', 'pt-BR': 'Insight' }, x: 0, y: 0 }],
};

export const threeCard: SpreadDef = {
  id: 'three',
  name: { en: 'Past · Present · Future', 'pt-BR': 'Passado · Presente · Futuro' },
  slots: [
    { id: 'past', label: { en: 'Past', 'pt-BR': 'Passado' }, x: -GX, y: 0 },
    { id: 'present', label: { en: 'Present', 'pt-BR': 'Presente' }, x: 0, y: 0 },
    { id: 'future', label: { en: 'Future', 'pt-BR': 'Futuro' }, x: GX, y: 0 },
  ],
};

export const relationship: SpreadDef = {
  id: 'relationship',
  name: { en: 'Relationship', 'pt-BR': 'Relacionamento' },
  slots: [
    { id: 'you', label: { en: 'You', 'pt-BR': 'Você' }, x: -GX, y: -GY / 2 },
    { id: 'them', label: { en: 'Them', 'pt-BR': 'A outra pessoa' }, x: GX, y: -GY / 2 },
    { id: 'bond', label: { en: 'The bond', 'pt-BR': 'O vínculo' }, x: 0, y: 0 },
    { id: 'challenge', label: { en: 'Challenge', 'pt-BR': 'Desafio' }, x: -GX, y: GY / 2 + 0.2 },
    { id: 'outcome', label: { en: 'Outcome', 'pt-BR': 'Resultado' }, x: GX, y: GY / 2 + 0.2 },
  ],
};

export const horseshoe: SpreadDef = {
  id: 'horseshoe',
  name: { en: 'Horseshoe', 'pt-BR': 'Ferradura' },
  slots: [
    { id: 'past', label: { en: 'Past', 'pt-BR': 'Passado' }, x: -3 * GX, y: 0.9 },
    { id: 'present', label: { en: 'Present', 'pt-BR': 'Presente' }, x: -2 * GX, y: 0.45 },
    { id: 'hidden', label: { en: 'Hidden influences', 'pt-BR': 'Influências ocultas' }, x: -GX, y: 0.1 },
    { id: 'obstacles', label: { en: 'Obstacles', 'pt-BR': 'Obstáculos' }, x: 0, y: 0 },
    { id: 'attitudes', label: { en: 'Attitudes of others', 'pt-BR': 'Atitudes dos outros' }, x: GX, y: 0.1 },
    { id: 'advice', label: { en: 'Advice', 'pt-BR': 'Conselho' }, x: 2 * GX, y: 0.45 },
    { id: 'outcome', label: { en: 'Outcome', 'pt-BR': 'Resultado' }, x: 3 * GX, y: 0.9 },
  ],
};

export const celticCross: SpreadDef = {
  id: 'celtic-cross',
  name: { en: 'Celtic Cross', 'pt-BR': 'Cruz Celta' },
  slots: [
    { id: 'heart', label: { en: '1. The heart', 'pt-BR': '1. O coração' }, x: 0, y: 0 },
    { id: 'challenge', label: { en: '2. The challenge', 'pt-BR': '2. O desafio' }, x: 0, y: 0, rotation: 90, labelPlacement: 'none' },
    { id: 'root', label: { en: '3. The root', 'pt-BR': '3. A raiz' }, x: 0, y: GY },
    { id: 'past', label: { en: '4. The past', 'pt-BR': '4. O passado' }, x: -GX, y: 0 },
    { id: 'crown', label: { en: '5. The crown', 'pt-BR': '5. A coroa' }, x: 0, y: -GY },
    { id: 'future', label: { en: '6. The future', 'pt-BR': '6. O futuro' }, x: GX, y: 0 },
    { id: 'self', label: { en: '7. The self', 'pt-BR': '7. Você' }, x: 2.4 * GX, y: 1.5 * GY },
    { id: 'environment', label: { en: '8. Environment', 'pt-BR': '8. Ambiente' }, x: 2.4 * GX, y: 0.5 * GY },
    { id: 'hopes', label: { en: '9. Hopes / fears', 'pt-BR': '9. Esperanças / medos' }, x: 2.4 * GX, y: -0.5 * GY },
    { id: 'outcome', label: { en: '10. Outcome', 'pt-BR': '10. Resultado' }, x: 2.4 * GX, y: -1.5 * GY },
  ],
};

export const tarotSpreads: SpreadDef[] = [freeSpread, singleCard, threeCard, relationship, horseshoe, celticCross];
