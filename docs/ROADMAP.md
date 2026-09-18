# Roadmap

Priorities after the mobile-first refactor. Effort: S (≤1 day), M (2–4 days), L (1–2 weeks), XL (more). Each item links to its implementation plan.

## Now (Phase 4, in priority order)

| # | Feature | Effort | Why | Plan |
| --- | --- | --- | --- | --- |
| 1 | **AI interpretation** of readings and dreams — **v1 shipped** (BYO OpenRouter key); v2: proxy, book-corpus retrieval | L | Turns a card table into a reader; the feature people will come back for | [plans/ai-interpretation.md](plans/ai-interpretation.md) |
| 2 | **Reading journal**: question, notes, date, cards, export/import | M | Readings are worthless if you can't revisit them; also the storage the AI feature writes into | [plans/persistence-and-journal.md](plans/persistence-and-journal.md) |
| 3 | **Multiplayer with a token** (P2P shared table) — **v1 shipped** (WebRTC star + tiny signaling helper); v2: reconnection, host migration, TURN, spectators | XL | Read for a friend remotely; LAN games | [plans/multiplayer-table.md](plans/multiplayer-table.md) |
| 4 | **Share a reading** as image / link | S–M | Growth loop; complements the journal | [plans/share-reading.md](plans/share-reading.md) |
| 5 | **Daily card** + reminders | S | Habit-forming; trivial with the engine | [plans/daily-card.md](plans/daily-card.md) |
| 6 | **Custom spread editor** | M | Power users; makes the data-driven spreads user-facing | [plans/custom-spread-editor.md](plans/custom-spread-editor.md) |
| 7 | **Settings & themes** (table cloth, card size, sounds, styled dialogs) | S–M | Polish | [plans/settings-and-themes.md](plans/settings-and-themes.md) |
| 8 | **Accessibility pass** (keyboard moves, announcements) | M | Playable by everyone | [plans/accessibility.md](plans/accessibility.md) |
| 9 | **PWA polish** (smarter caching, update toast, install prompt) | S | Offline is there; make it graceful | [plans/pwa-offline.md](plans/pwa-offline.md) |
| 10 | **Minor Arcana** (78-card deck) | M | Most tarot users expect it; needs artwork | [plans/new-game-template.md](plans/new-game-template.md) |
| 11 | **New games** (Lenormand, oracle decks, playing-card solitaire) | M each | The engine's raison d'être | [plans/new-game-template.md](plans/new-game-template.md) |
| 12 | **ZIP deck import** — already built; polish only (drag-and-drop a ZIP, deck cover, share) | S | Lowest priority per maintainer | [plans/zip-deck-import.md](plans/zip-deck-import.md) |

Related design notes: [shuffle entropy](plans/shuffle-entropy.md).

Also shipped and documented: [card detail & meanings](plans/card-detail-and-meanings.md), [undo/redo](plans/undo-redo.md), [i18n](plans/i18n.md), [testing & CI](plans/testing-and-ci.md), [ZIP deck import](plans/zip-deck-import.md), [PWA/offline baseline](plans/pwa-offline.md). Bug history: [BUGS.md](BUGS.md).

## Small improvements (backlog)

- Responsive image sizes (`srcset` / thumbnails) for slow networks; prefetch the next card's front while it is face down in a slot.
- Styled confirm/alert dialogs instead of `window.confirm`.
- Deck "cover" thumbnail in the deck picker; deck credits screen.
- Keyboard: move the focused card between slots with arrow keys.
- Loose-card tidy: "snap to grid" and "align" actions.
- Tilt-on-drag and drop shadow scaling by zoom for a more physical feel.
- Haptic pattern per action (draw vs flip vs drop).
- Table zoom-to-card (double-tap zooms to a card, double-tap again fits).
- Onboarding: short animated tour on first launch instead of the text help.
- Analytics-free usage counters stored locally (readings done, favourite spread) for the journal's summary.

## "Best tarot app in the world" vision

What would make this the app tarot readers recommend to each other:

1. **Readings that feel real**: physical deck behaviour (cut, riffle, fan, draw from anywhere, reversed as dealt), lovely decks, haptics, sound. Mostly done.
2. **Meaning at your fingertips**: every card explained in your language, per position, per orientation, with the querent's question in mind (AI), and a corpus of respected books behind it (RAG).
3. **Memory**: a journal that shows patterns over time (cards that keep coming back, moods, questions), export in open formats, never locked in.
4. **Together**: read for someone remotely on one shared table, or sit around a phone on the same LAN.
5. **Your decks**: your own art, imported in seconds, shared with friends as a file.
6. **Yours, private, offline**: no account, no server required for the core, keys and journals stay on the device unless you choose otherwise.
7. **Any card game**: the same table runs Lenormand, oracle decks and card games; the community can add spreads and games as data.
