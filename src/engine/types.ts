/**
 * Core, framework-free types for the card-game engine.
 *
 * Everything here is plain data so it can be serialized (persistence, sharing,
 * multiplayer) and unit-tested without a DOM.
 */

export type Locale = 'en' | 'pt-BR';

/** A string with translations. `en` is required and is the fallback. */
export type Localized = { en: string } & Partial<Record<Locale, string>>;

/** A card as defined by a game (independent of any deck's artwork). */
export interface CardDef {
  id: string;
  /** Ordinal within its family (0 for The Fool, 1 for The Magician...). */
  number?: number;
  /**
   * Which part of the deck the card belongs to. `GameRules.minorArcana`
   * leaves `minor` cards out of the deck; absent = always in play.
   */
  arcana?: 'major' | 'minor';
  /** Minor Arcana only: suit and rank (`01`…`10`, `page`, `knight`, `queen`, `king`). */
  suit?: string;
  rank?: string;
  /** Size relative to the deck's card size (1 = full size). Minor cards are drawn a bit smaller. */
  scale?: number;
  name: Localized;
  keywords?: { en: string[] } & Partial<Record<Locale, string[]>>;
  meaning?: {
    upright: Localized;
    reversed: Localized;
  };
}

/** Where a deck's images come from. */
export type DeckSource =
  | { type: 'static'; basePath: string; extension: string }
  | { type: 'blob'; urls: Record<string, string> };

/** A deck is artwork for a card family. It may cover only some cards. */
export interface DeckDef {
  id: string;
  name: string;
  /** Which CardDef set this deck depicts, e.g. `tarot-major`. */
  family: string;
  /** Card ids that this deck has art for. Missing ids fall back to `fallbackDeckId`. */
  cards: string[];
  /** Whether a back image exists (`back.<ext>` for static decks). */
  hasBack: boolean;
  /** Whether a separate back for Minor Arcana cards exists (`back-minor.<ext>`). Absent = no. */
  hasMinorBack?: boolean;
  fallbackDeckId?: string;
  /** width / height of the artwork. */
  aspectRatio: number;
  fit: 'cover' | 'contain';
  source: DeckSource;
  credits?: string;
  /**
   * Free-text notes about the deck's symbolism, sent to the AI reader so a
   * personal deck can explain what its images mean (see plans/ai-interpretation.md).
   */
  notes?: Localized;
  /** True for decks imported by the user (deletable). */
  custom?: boolean;
}

/**
 * A slot in a spread. Coordinates are in *card units*: `x` is measured in card
 * widths and `y` in card heights, relative to the spread origin. `(0, 0)` is the
 * centre of the first card in a single-card spread. Positions are card centres.
 */
export interface SlotDef {
  id: string;
  label: Localized;
  x: number;
  y: number;
  /** Degrees. 90 renders the card sideways (Celtic Cross "crossing" card). */
  rotation?: number;
  /** Where the label is drawn. Defaults to `bottom`. */
  labelPlacement?: 'bottom' | 'top' | 'none';
  description?: Localized;
}

export interface SpreadDef {
  id: string;
  name: Localized;
  description?: Localized;
  slots: SlotDef[];
}

export interface GameRules {
  /** Whether cards can be dealt / shown reversed (upside down). */
  allowReversed: boolean;
  /** Probability [0, 1] that a shuffled card is reversed when allowed. */
  reversedChance: number;
  /** Whether cards come out of the deck face down. */
  drawFaceDown: boolean;
  /** Whether cards tagged `arcana: 'minor'` are in the deck. Absent = yes. */
  minorArcana?: boolean;
}

export interface GameDef {
  id: string;
  name: Localized;
  family: string;
  cards: CardDef[];
  spreads: SpreadDef[];
  rules: GameRules;
  /** Deck id used when the user has not chosen one. */
  defaultDeckId: string;
  defaultSpreadId: string;
}

// ---------------------------------------------------------------------------
// Table state (what is on the table right now)
// ---------------------------------------------------------------------------

export type Face = 'down' | 'up';

export interface TableCard {
  id: string;
  face: Face;
  reversed: boolean;
  /**
   * True once the player toggled a face-up card's orientation by hand, so the
   * next tap turns it face down instead of toggling again. Cleared whenever
   * the card goes face down. Absent in older saved tables (= false).
   */
  turned?: boolean;
}

/** A card lying freely on the table. `x`/`y` are the card centre in card units. */
export interface LooseCard extends TableCard {
  x: number;
  y: number;
  z: number;
}

export interface TableState {
  version: 1;
  gameId: string;
  deckId: string;
  spreadId: string;
  /** Remaining pool. The last element is the top of the stack. */
  deck: TableCard[];
  /** One entry per spread slot. */
  slots: (TableCard | null)[];
  loose: LooseCard[];
  nextZ: number;
}

/** Where a card is on the table. */
export type Location =
  | { kind: 'deck'; index: number }
  | { kind: 'slot'; index: number }
  | { kind: 'loose'; index: number };

/** Where a card is being dropped. */
export type DropTarget =
  | { kind: 'deck' }
  | { kind: 'slot'; index: number }
  | { kind: 'loose'; x: number; y: number };

export type Rng = () => number;
