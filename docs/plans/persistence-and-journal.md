# Plan: persistence and reading journal

Status: table autosave shipped; journal planned (Phase 4 #2).

## Shipped
- `tarot.table.v1` (localStorage): the current table, restored on load if compatible with the game and card set; the table's own spread is used, so a spread changed at a shared table survives a reload.
- `tarot.settings.v1`: locale, reversed, haptics, fan, deck, spread, help seen, nickname, AI consent / model / "send deck notes".
- `tarot.ai.key` (localStorage): the OpenRouter key, alone so the settings blob can be shared or inspected without it.
- IndexedDB `tarot/decks`: imported decks (`version: 1` on new records).
- IndexedDB `tarot-ai/interpretations`: AI threads with a table snapshot — the first slice of the journal (see `ai-interpretation.md`).

## Goal
Keep every reading the user chooses to save: question, date, spread, cards (with orientation and position), personal notes, optional AI interpretation; browse, search and revisit; export/import as JSON; never require an account.

## Data model
```ts
interface Reading {
  id: string; createdAt: number; updatedAt: number;
  locale: Locale; gameId: string; deckId: string; spreadId: string;
  question?: string; mood?: string; tags: string[];
  cards: { position: string | null; cardId: string; reversed: boolean; x?: number; y?: number }[];
  notes: string;                       // Markdown
  interpretationId?: string;           // → Interpretation (ai-interpretation.md)
  snapshot: TableState;                // to reopen the exact table
}
```
IndexedDB store `tarot/readings` (idb-keyval or a small Dexie schema if queries grow). Indexes by date and cardId for "cards that keep coming back".

## UX
- Menu → **Save reading** (asks for question/notes; pre-filled if the Ask panel was used).
- **Journal** screen: list by date with spread name and mini card icons; open → read-only table view + notes; "Reopen on table"; delete.
- Insights tab: most frequent cards, reversed ratio, readings per month.
- Export all (JSON file via `Blob` + download, or Web Share on mobile); import merges by id.

## Steps
1. `src/journal/store.ts` CRUD + export/import; unit tests.
2. `JournalPanel.vue`, `ReadingView.vue` (renders `TableCanvas` read-only from a snapshot).
3. Hook "Save" into the toolbar menu; auto-title from the question.
4. Migration guard: `version` field on every record.

## Open questions
- Should the AI history (`tarot-ai/interpretations`) merge into `tarot/readings` when the journal ships, or stay a separate database that readings link to by `interpretationId`?
- Should every completed spread auto-save (with a "discard" option) or only explicit saves?
- Encrypt the journal at rest with a passphrase (Web Crypto)? Nice for shared devices, costs UX.
- Sync between devices later (file-based via the user's cloud drive vs. our server)?
