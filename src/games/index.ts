import type { GameDef } from '../engine/types';
import { tarotGame } from './tarot';

export const games: GameDef[] = [tarotGame];

export function getGame(id: string): GameDef {
  return games.find((g) => g.id === id) ?? tarotGame;
}
