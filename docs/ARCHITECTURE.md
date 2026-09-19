# Architecture

## Goals

1. **Touch-first and everywhere**: Android, iOS, desktop; installable; offline.
2. **Data-driven**: decks, spreads and games are data. Adding one never touches the renderer.
3. **Pure core**: all game logic is framework-free TypeScript so it is testable, undoable, serializable and, later, shareable between peers.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ components/  Vue: TarotTable (orchestrator) → TableCanvas,    │
│              DeckDrawer, Card, Toolbar, CardDetail, HelpPanel,│
│              RoomPanel, AskPanel                              │
├──────────────────────────────────────────────────────────────┤
│ ai/          OpenRouter client, prompts, markdown, history    │
├──────────────────────────────────────────────────────────────┤
│ composables/ useTable (state+undo+autosave), useCamera,       │
│              usePointerDrag, useSettings, useI18n, useHaptics │
├──────────────────────────────────────────────────────────────┤
│ games/ spreads/ decks/   data + registries                    │
├──────────────────────────────────────────────────────────────┤
│ engine/      types, table ops, shuffle, geometry (pure)       │
└──────────────────────────────────────────────────────────────┘
```

Dependencies only point downward.

## Core types (`src/engine/types.ts`)

- `CardDef` — a card of a *family* (e.g. `tarot-major`): id, localized name, keywords, meanings. Optional `arcana` (`major` | `minor`), `suit`/`rank` for the Minor Arcana, and `scale` (relative size on the table; minors are 0.88).
- `DeckDef` — artwork for a family: which card ids it has, back image (`hasBack`, plus `hasMinorBack` for a separate `back-minor` image), aspect ratio, `fit`, fallback deck, and a `source` (`static` path or `blob` URLs for imported decks).
- `SpreadDef` / `SlotDef` — positions as card centres in **card units** (x in card widths, y in card heights), optional `rotation` and `labelPlacement`.
- `GameDef` — family, cards, spreads, `rules` (`allowReversed`, `reversedChance`, `drawFaceDown`, `minorArcana`), defaults. The tarot game carries all 78 cards; `rules.minorArcana` (a setting) decides whether a new table deals 22 or 78 (`activeCards`). A table's cards must always be one of the game's *card sets* (`cardSets`: all cards, or all but the minors), which is what autosave restore and multiplayer snapshot validation check (`isCardSet`).
- `TableCard` — `id`, `face`, `reversed`, and an optional `turned` flag set when the player toggled a face-up card's orientation by hand (absent = false; cleared when the card goes face down).
- `TableState` — `deck` (last = top), `slots` (one per spread slot), `loose` (free cards with `x`, `y`, `z`), `nextZ`, plus `gameId/deckId/spreadId`. `version: 1`.
- `Location` (`deck|slot|loose` + index) and `DropTarget` (`deck` | `slot` | `loose {x,y}`).

## Engine (`src/engine/table.ts`)

Pure functions `TableState → TableState`: `createTable`, `shuffleTable`, `moveCard`, `flipCard`, `setCard`, `raiseLoose`, `draw`, `placeCards`, `dealSpread`, `revealAll`, `gatherAll`, `changeSpread`; plus the card-set helpers `activeCards`, `cardSets`, `isCardSet`, `allCards`, `usesMinorArcana`. Rules:

- Dropping on the deck returns a card face down to the top.
- Dropping on an occupied slot swaps (slot↔slot), displaces to the loose card's old spot (loose→slot) or returns the occupant to the deck (deck→slot).
- `flipCard`: down → up (as dealt) → up with orientation toggled (`turned`) → down. With `allowReversed = false` the middle collapses. A card dealt reversed therefore shows reversed first, then upright.
- Reversed orientation is decided at shuffle time with `reversedChance` when allowed, so a face-down card already "is" reversed, like a physical deck.

`shuffle.ts` is Fisher–Yates over `crypto.getRandomValues` with an injectable RNG (`seededRng` for tests / reproducible readings).

## Geometry and camera (`src/engine/geometry.ts`, `composables/useCamera.ts`)

Three coordinate spaces:

| Space | Unit | Used for |
| --- | --- | --- |
| card units | card widths / heights | spread data, loose card positions, persistence (viewport-independent) |
| canvas px | pixels at zoom 1, origin = spread origin | rendering inside `.canvas` |
| surface px | pixels relative to the table surface | pointer events, camera |

`screen = canvas * zoom + offset`. `zoomAround` keeps the point under the cursor/pinch fixed. `fitCamera(bounds, viewport, padding, maxZoom)` frames a spread; the orchestrator subtracts a `reserve` for the drawer and floating buttons. Card size is derived from the surface width (84–150px) and the deck's aspect ratio and published as `--card-w` / `--card-h`.

The camera tracks every pointer that goes down on the surface (listeners for move/up/cancel on `window`). One pointer pans only if it started on the background; two pointers always pinch (and cancel any card drag).

## Gestures (`composables/usePointerDrag.ts`)

One recogniser for cards in the drawer and on the table:

- `begin(e, data, el)` on `pointerdown` (primary button only). Captures the pointer, records the grab point as a fraction of the element.
- Movement beyond the threshold → **drag** (ghost rendered by `DragGhost.vue` from the session).
- Release without movement → **tap**. Held still 450ms → **long press**.
- `pointercancel`, `blur`, second finger → cancel with no state change.

Drop resolution (orchestrator `handleDrop`): element under the pointer inside `[data-drop="deck"]` → deck; otherwise geometric slot hit-test (`findSlotAt`) on the pointer position; otherwise loose at the card's centre.

## State, undo, persistence (`composables/useTable.ts`)

`state` is a `ref<TableState>`; `commit(next)` records history (60 steps), `amend(next)` replaces the current state without a new entry (the shuffle animation's second half), and `replace(next)` resets history. Autosave (150ms debounce) writes `tarot.table.v1` to localStorage; on load the saved table's spread is used (settings' remembered spread is only a fallback) and `isCompatible` checks game, spread and card set (22 or 78 cards) before restoring; the *Minor Arcana* setting is then synced from the restored table, so it only ever applies to the next new table. Settings live in `tarot.settings.v1` (`useSettings`, shared reactive singleton; unknown locales fall back to detection). Imported decks live in IndexedDB store `tarot/decks` (`idb-keyval`).

Because every mutation is a pure function of the previous state, the same operations can later be sent over the wire for multiplayer (`plans/multiplayer-table.md`) or replayed for a reading journal.

## Shared table (`src/net/`)

Every action is an `Op` (`protocol.ts`): `move`, `flip`, `draw`, `gather`, `shuffle{seed}`, `deal`, `reveal`, `place{cards}` (AI-suggested cards), `newReading{spreadId, seed}`. `applyOp` maps ops onto the engine. `TarotTable.dispatch(op)`:

- alone → apply locally with undo history;
- host → apply, broadcast `{t:'snapshot', state}` to every guest (plus `{t:'effect'}` for the shuffle animation);
- guest → send `{t:'op'}` to the host and wait for the snapshot.

`room.ts` builds a star of WebRTC DataChannels around the host; `signaling.ts` talks to the helper in `server/signaling/` which maps a 6-character token to a room and relays SDP/ICE only. Once a guest's channel is open the helper is out of the loop for that guest; a `disconnected` connection gets an 8-second grace before it counts as lost. If the helper goes away the host retries it and takes a fresh code (`Room.renewToken`, surfaced through `onToken`); the game continues on the channels meanwhile. Guests validate every snapshot (`isValidState`: every card once, a known spread with matching slot count, finite loose positions). Presence ("who is holding which card") is a `holding`/`held` message rendered as a coloured outline. Ops at a shared table bypass the undo history (which is cleared when hosting starts); guests pause autosave and get their own table back on leaving. Rooms with no guests expire 10 minutes after the last join/leave; the host then simply fetches a new code. `useRoom` tags every host/join attempt with an id so *Cancel* while connecting wins over a late completion. Details and decisions: `plans/multiplayer-table.md`.

## AI reader (`src/ai/`)

`AskPanel.vue` builds a `ReadingInput` from the table (`prompts.ts`: face-up cards with position, orientation, keywords and our short meaning; face-down cards only as a count; optional `DeckDef.notes`) and streams the answer from OpenRouter with the user's own key (`openrouter.ts`: fetch + SSE, `AiError` codes). Model output is rendered by `markdown.ts` (escaped, no raw HTML). Threads are stored in IndexedDB `tarot-ai/interpretations` (`store.ts`). In dream mode a fast model can pick cards, which reach the table through the `place` op. Details: `plans/ai-interpretation.md`.

## Rendering

- `TableCanvas.vue`: one absolutely positioned `.canvas` with the camera transform; slots at `(x*cw - cw/2, y*ch - ch/2)`, a rotated `.slot-box` for sideways positions, labels outside the rotation; loose cards ordered by `z`.
- `Card.vue`: back/front faces with a 3D flip; reversed = `rotateZ(180deg)`; the front `<img>` only gets a `src` once shown face up. `scale` shrinks the face around its centre (Minor Arcana) while the holder keeps the full card box, so positions, hit-tests and card units stay in Major-card size. Backs are resolved per card (`resolveBack`): minors get `back-minor` when the deck or its fallback chain has one, else the regular back.
- `DeckDrawer.vue`: the same deck rendered as a stack (top card grabbable) or a fan whose spacing adapts to the available width; the shuffle scatter animation is driven by a transient `scatter` map.
- The whole component is `client:only="vue"` (it reads storage during setup).

## i18n

`src/i18n/index.ts` holds UI strings for `en` and `pt-BR`; `translate(locale, key, params)` and `pick(locale, Localized)`. Card text lives with the card data. A unit test enforces that every locale has every key.

## Adding things

- **Deck**: images in `public/decks/<id>/` + manifest in `src/decks/manifests/` (auto-registered via `import.meta.glob`). Minor Arcana images are `<suit>-<rank>.<ext>` (`wands-01` … `pentacles-king`) and `back-minor.<ext>`; a deck may carry any subset and the rest falls back (the generic set lives in `standard`, generated by `scripts/gen-minor-cards.mjs`).
- **Spread**: a `SpreadDef` in `src/spreads/`.
- **Game**: a `GameDef` in `src/games/` (+ card data) registered in `src/games/index.ts`. The orchestrator currently imports `tarotGame`; making the game selectable is a small change (`plans/new-game-template.md`).

## Build and delivery

Astro static build. `@vite-pwa/astro` generates the manifest and a Workbox service worker that precaches the app shell and all deck images (≈9.5 MB) so the table works offline. Icons are in `public/icons/`. CI runs `check`, unit tests, build and Playwright e2e on three device profiles.
