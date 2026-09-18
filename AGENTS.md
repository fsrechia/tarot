# AGENTS.md — working on this repository

Guidance for humans and AI coding agents. Keep it current when conventions change.

## What this is

A browser tarot table (Astro + Vue 3 + TypeScript, static output, PWA) built on a small data-driven card-game engine. Primary target is phones (Android Chrome, iOS Safari), then desktop. Read `README.md` first, then `docs/ARCHITECTURE.md`.

## Ground rules

1. **Game logic lives in `src/engine/` and is pure.** No DOM, no Vue, no side effects. Functions take a `TableState` and return a new one. Add a unit test in `tests/unit/` for every new operation.
2. **Spreads, decks and games are data.** New spread → object in `src/spreads/`. New deck → manifest JSON + images. New game → `GameDef`. Do not add spread-specific CSS or component branches.
3. **Gestures go through `usePointerDrag` / `useCamera`.** Never attach `@click` and `@pointerdown` to the same card (that was bug B1). Every pointer listener must handle `pointercancel` and be removed on unmount.
4. **Coordinates**: card positions are card units (`x` in card widths, `y` in card heights, centre-anchored). Screen ↔ canvas conversion is in `src/engine/geometry.ts`; do not hard-code card pixel sizes (bug B3). Card size is the `--card-w` / `--card-h` CSS variables.
5. **Mobile first.** Anything new must work at 360×640 with `touch-action: none`, respect `env(safe-area-inset-*)`, and not rely on hover. Test with Playwright's phone projects.
6. **Strings are localized.** UI text goes in `src/i18n/index.ts` (`en` and `pt-BR`, both required — the unit test enforces key parity). Card text goes in `src/decks/tarot-major.ts`.
7. **Persistence formats are versioned.** `tarot.table.v1`, `tarot.settings.v1`, IndexedDB stores `tarot/decks` and `tarot-ai/interpretations` (`version: 1` on each record; deck records imported before the field existed have none and are still accepted). The OpenRouter key lives alone in `tarot.ai.key`. Bump the version and write a migration (or a compatibility check) when the shape changes; a new *optional* field (like `TableCard.turned`) may be added without a bump as long as every reader treats its absence as the old behaviour.
8. **The component is client-only** (`client:only="vue"`): it reads localStorage in setup. Do not switch it to `client:load`.
9. **Every table action is an `Op`** (`src/net/protocol.ts`) dispatched through `TarotTable.dispatch`, never a direct `tbl.commit` — that is what keeps single-player, host and guest paths identical. New actions: add the op, its `applyOp` case, its validator and a unit test.
10. **Images are not our job right now.** `todo.md` lists artwork still to be painted; the app must degrade gracefully via the deck fallback chain.
11. **The AI reader only sees what is face up.** Everything sent to the model goes through `buildReadingInput` in `src/ai/prompts.ts`; do not send the table state or face-down card ids anywhere else. Model output is untrusted text: render it only through `src/ai/markdown.ts`.

## Commands

```sh
npm run dev          # develop
npm run verify       # astro check + vue-tsc + vitest + build  (run before committing)
npm run test:e2e     # playwright (needs: npx playwright install chromium)
```

## Layout of the code

| Path | Responsibility |
| --- | --- |
| `src/engine/types.ts` | All shared types (CardDef, DeckDef, SpreadDef, GameDef, TableState, Location, DropTarget) |
| `src/engine/table.ts` | create/shuffle/move/flip/draw/deal/reveal/gather |
| `src/engine/shuffle.ts` | Fisher–Yates over the CSPRNG; `seededRng` for reproducible/shared shuffles |
| `src/engine/geometry.ts` | camera math, bounds, fit-to-viewport, unit conversions |
| `src/games/tarot.ts`, `src/spreads/tarot.ts`, `src/decks/tarot-major.ts` | the tarot `GameDef`, its spreads, and the 22 cards' names/keywords/meanings |
| `src/composables/useTable.ts` | reactive state + undo/redo (`commit` / `amend` / `replace`) + autosave |
| `src/composables/useSettings.ts` | `tarot.settings.v1` reactive singleton (locale, rules, deck, spread, nickname, AI prefs) |
| `src/composables/useI18n.ts`, `src/i18n/index.ts` | `t()` for UI strings, `l()` for `Localized` data; the string tables |
| `src/composables/useCamera.ts` | pan / pinch / wheel zoom, pointer bookkeeping on `window` |
| `src/composables/usePointerDrag.ts` | tap / long-press / drag recogniser |
| `src/components/TarotTable.vue` | orchestrator: wires the above, resolves drops, toolbar actions, `dispatch(op)` |
| `src/components/TableCanvas.vue` | renders slots + cards from spread data inside the camera transform |
| `src/components/Card.vue`, `DragGhost.vue` | one card face (flip / reversed animation); the card that follows the pointer |
| `src/components/DeckDrawer.vue` | stack / fan / shuffle animation |
| `src/components/Toolbar.vue`, `CardDetail.vue`, `HelpPanel.vue`, `RoomPanel.vue` | toolbar + "more" menu; card meaning sheet; first-run help; Play together |
| `src/decks/registry.ts` | static deck manifests, image URL resolution with fallback chain |
| `src/decks/zip.ts` | ZIP import → IndexedDB → DeckDef with blob URLs |
| `src/net/protocol.ts` | `Op` (every table action), `applyOp`, message validation |
| `src/net/room.ts` | WebRTC star around the host; `src/net/signaling.ts` talks to `server/signaling/` |
| `src/composables/useRoom.ts` | room status/peers/held cards; `TarotTable.dispatch(op)` routes local / host / guest |
| `src/ai/openrouter.ts` | OpenRouter streaming client (SSE), key storage, `AiError` codes |
| `src/ai/models.ts`, `src/ai/markdown.ts` | model preset slugs; the escaping Markdown renderer for model output |
| `src/ai/prompts.ts` | system prompts per locale, table → `ReadingInput`, follow-ups, dream → cards |
| `src/ai/store.ts` | interpretation history in IndexedDB `tarot-ai/interpretations` |
| `src/components/AskPanel.vue` | "Ask the cards": consent, key, question/dream, streamed answer, follow-ups |

## Style

- TypeScript strict; `<script setup lang="ts">`; scoped styles; shared primitives in `src/styles/ui.css`.
- Small, named functions with a one-line doc comment explaining *why* when it is not obvious.
- No new runtime dependencies without a note in the PR explaining why the platform can't do it.
- Commit messages: imperative, one line of what + optional body of why.

## When adding a feature

1. Check `docs/ROADMAP.md` and `docs/plans/<feature>.md` — most features already have a plan with open questions. Resolve the open questions with the maintainer before building.
2. Engine change → unit test. Interaction change → e2e test in `tests/e2e/`. UI change → run the phone project and look at a screenshot.
3. Update `docs/` (and this file) if the architecture or conventions moved.
