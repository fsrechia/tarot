# Plan: adding a new game (template)

Status: the engine supports it; the UI still hard-codes `tarotGame`. This plan makes games selectable and documents the template. Also covers the Minor Arcana.

## Steps to make games selectable
1. `useSettings.gameId`; `TarotTable.vue` → `GameTable.vue` taking a `GameDef` prop; the game picker in the menu (only shown when >1 game).
2. Persistence keys include the game id (`tarot.table.v1` → `table.<gameId>.v1`).
3. Deck family filter already exists (`decksForFamily`).

## Template
```ts
// src/games/lenormand.ts
export const lenormandGame: GameDef = {
  id: 'lenormand', name: { en: 'Lenormand', 'pt-BR': 'Lenormand' },
  family: 'lenormand-36', cards: lenormandCards,             // 36 CardDefs in src/decks/lenormand.ts
  spreads: [threeLine, nineSquare, grandTableau],            // grand tableau = 4×8 + 4 → 36 slots, data only
  rules: { allowReversed: false, reversedChance: 0, drawFaceDown: true },
  defaultDeckId: 'lenormand-classic', defaultSpreadId: 'threeLine',
};
```
Plus a deck manifest + images under `public/decks/lenormand-classic/`.

## Minor Arcana (78-card tarot)
Shipped: see [minor-arcana.md](minor-arcana.md). The tarot game carries 78 `CardDef`s and `rules.minorArcana` (a setting) leaves the 56 minors out; deck manifests declare which minor ids they have and the rest falls back to the generic set.

## Card *games* (solitaire, etc.)
Need engine additions that tarot does not: per-player hands (`owner`, `visibility`), rule validation hooks (`canMove(state, from, to)`), scoring, turn order. Plan them as an `engine/rules.ts` layer that wraps the pure ops without changing the tarot path. Multiplayer (`multiplayer-table.md`) already assumes host authority, which is what rule validation needs.

## Open questions
- First non-tarot game to build: Lenormand (reading-oriented, same UX) or a playing-card game (exercises rules/hands)?
- Are 78-card images planned for the personal deck? (The generic fronts stand in until then; `back-minor.webp` for Vitoriushka is a tinted copy of the painted back.)
