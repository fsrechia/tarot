/**
 * Deck registry. Static decks are described by a manifest in `./manifests`
 * (bundled at build time) with images served from `public/decks/<id>/`.
 * Custom decks (ZIP imports) are added at runtime by `./zip.ts`.
 */
import type { DeckDef, Localized } from '../engine/types';

interface StaticManifest {
  id: string;
  name: string;
  family: string;
  cards: string[];
  hasBack: boolean;
  extension: string;
  fallbackDeckId?: string;
  aspectRatio: number;
  fit: 'cover' | 'contain';
  credits?: string;
  notes?: Localized;
}

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');

const manifests = import.meta.glob<{ default: StaticManifest }>('./manifests/*.json', { eager: true });

export const staticDecks: DeckDef[] = Object.values(manifests)
  .map((m) => m.default)
  .map((m): DeckDef => ({
    id: m.id,
    name: m.name,
    family: m.family,
    cards: m.cards,
    hasBack: m.hasBack,
    fallbackDeckId: m.fallbackDeckId,
    aspectRatio: m.aspectRatio,
    fit: m.fit,
    credits: m.credits,
    notes: m.notes,
    source: { type: 'static' as const, basePath: `${BASE}/decks/${m.id}`, extension: m.extension },
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Decks that depict a card family. */
export function decksForFamily(decks: readonly DeckDef[], family: string): DeckDef[] {
  return decks.filter((d) => d.family === family);
}

function ownImage(deck: DeckDef, key: string): string | null {
  const has = key === 'back' ? deck.hasBack : deck.cards.includes(key);
  if (!has) return null;
  if (deck.source.type === 'static') return `${deck.source.basePath}/${key}.${deck.source.extension}`;
  return deck.source.urls[key] ?? null;
}

/**
 * Resolves the image URL for a card (or `'back'`), following the fallback
 * chain so that partially painted decks never produce 404s.
 */
export function resolveImage(decks: readonly DeckDef[], deck: DeckDef, key: string): string | null {
  const seen = new Set<string>();
  let current: DeckDef | undefined = deck;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const url = ownImage(current, key);
    if (url) return url;
    current = current.fallbackDeckId ? decks.find((d) => d.id === current!.fallbackDeckId) : undefined;
  }
  return null;
}

export function findDeck(decks: readonly DeckDef[], id: string): DeckDef | undefined {
  return decks.find((d) => d.id === id);
}
