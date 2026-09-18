# Tarot Table

A touch-first tarot table that runs in any modern browser: Android, iOS, desktop, installable as a PWA and playable offline. Shuffle, fan or stack the deck, drag cards into classic spreads or anywhere on a free table, flip them upright or reversed, read their meanings, and pick up where you left off.

Built with [Astro](https://astro.build) + [Vue 3](https://vuejs.org) + TypeScript. The table is a small, data-driven **card-game engine**: tarot is the first game, and other card games (Lenormand, oracle decks, playing cards) plug in as data plus a game definition. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

```sh
npm install
npm run dev        # http://localhost:4321
```

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                                      |
| `npm run build`     | Production build into `dist/` (includes the service worker)     |
| `npm run preview`   | Serve the production build locally                              |
| `npm run check`     | `astro check` + `vue-tsc` type-checking                         |
| `npm test`          | Unit tests (Vitest) for the engine, decks, spreads and i18n     |
| `npm run test:e2e`  | Playwright smoke tests on phone, iPhone and desktop viewports   |
| `npm run verify`    | check + test + build (what CI runs)                             |
| `npm run signaling` | Start the WebRTC signaling helper for *Play together* (:8787)   |
| `npm run dev:all`   | Dev server + signaling helper                                   |

First-time e2e setup: `npx playwright install chromium`.

## How to play

- **Tap the deck** to draw the next card into the next empty position (or onto the table in free mode).
- **Drag** a card from the deck or the table to a position or anywhere on the table. Drop it on the deck to return it.
- **Tap a card** to flip it; tap again to turn it the other way up (reversed, or upright if it was dealt reversed); again to turn it face down.
- **ⓘ or long-press** a face-up card to read its meaning (English / Português).
- **Pan** by dragging the empty table; **pinch** or scroll to zoom; the ⛶ button fits the spread to the screen.
- **Keyboard**: `D` draw, `S` shuffle, `F` fit, `R` reveal all, `A` ask the cards, `Z` / `Ctrl+Z` undo, `Enter`/`Space` flip the focused card, `?` help.
- Everything on the table is saved locally and restored when you come back.
- **Ask the cards (AI)**: the ✦ button. Type a question (or nothing, for general guidance) or describe a dream, and the face-up cards are interpreted position by position, streamed, in your language, with follow-ups. Uses your own [OpenRouter](https://openrouter.ai/keys) key, kept in this browser; nothing is sent until you press *Interpret*. In dream mode the model can also lay out cards that echo the dream. See [docs/plans/ai-interpretation.md](docs/plans/ai-interpretation.md).
- **Play together**: More → *Play together* → *Create a code*; friends enter the 6-character code (or open the shared link) and everyone moves, flips and draws on the same table over WebRTC. Needs the small signaling helper running (`npm run signaling`, port 8787); see [docs/plans/multiplayer-table.md](docs/plans/multiplayer-table.md).

## Project layout

```
src/
  engine/        pure, framework-free game engine (types, table ops, shuffle, geometry)
  games/         GameDef registry (tarot today)
  spreads/       spread layouts as data (card-unit coordinates)
  decks/         card data (names/meanings), deck manifests, image resolution, ZIP import
  composables/   Vue glue: camera, pointer gestures, table state + undo + autosave, settings, i18n
  components/    TarotTable (orchestrator), TableCanvas, DeckDrawer, Card, Toolbar, CardDetail, …
  net/           shared table: wire protocol (ops), signaling client, WebRTC room (host star)
  ai/            "Ask the cards": OpenRouter streaming client, prompts, markdown, local history
  i18n/          UI strings (en, pt-BR)
  layouts/, pages/, styles/
server/signaling/        tiny Node WebSocket helper that brokers WebRTC handshakes by token
public/decks/<deckId>/   card images: 00.webp … 21.webp and back.webp
src/decks/manifests/     one JSON per static deck (which cards it has, aspect ratio, fallback deck)
src/assets/images/       original artwork sources (not shipped)
tests/unit, tests/e2e    Vitest and Playwright
docs/                    bug reports, architecture, roadmap and feature plans
```

## Adding a deck

1. Put `NN.webp` (00–21) and `back.webp` in `public/decks/<id>/`. A deck may be partial.
2. Add `src/decks/manifests/<id>.json`:
   ```json
   { "id": "mydeck", "name": "My Deck", "family": "tarot-major", "cards": ["00","01"], "hasBack": true,
     "extension": "webp", "fallbackDeckId": "standard", "aspectRatio": 0.6, "fit": "cover", "credits": "…" }
   ```
   Missing cards resolve to `fallbackDeckId` without 404s. It appears in the Deck menu automatically.

Users can also import a deck at runtime from a ZIP (More → Import deck) — see [docs/plans/zip-deck-import.md](docs/plans/zip-deck-import.md).

## Adding a spread

Append a `SpreadDef` to `src/spreads/tarot.ts`. Positions are card centres in card units (`x` in card widths, `y` in card heights); `rotation: 90` lays a card sideways. The renderer, drop targets and fit-to-screen all derive from that data.

## Adding a game

Create `src/games/<game>.ts` exporting a `GameDef` (cards, spreads, rules, defaults) and register it in `src/games/index.ts`. See [docs/plans/new-game-template.md](docs/plans/new-game-template.md).

## Documentation

- [docs/BUGS.md](docs/BUGS.md) — bug reports from the code review and their fixes
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — engine, state, coordinates, persistence
- [docs/ROADMAP.md](docs/ROADMAP.md) — prioritised enhancements and the "best tarot app" vision
- [docs/plans/](docs/plans/) — one implementation plan per pending feature (AI interpretation, multiplayer, journal, …)
- [AGENTS.md](AGENTS.md) — conventions for people and coding agents working on this repo

## Deployment

Static output. Set `site` (and `base` if served from a sub-path) in `astro.config.mjs`; image URLs honour `base`. CI (`.github/workflows/ci.yml`) runs check, unit tests, build and e2e on every push.
