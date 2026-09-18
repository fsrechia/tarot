# Plan: AI interpretation of readings and dreams

**Priority: highest (Phase 4 #1).** Status: **v1 shipped** (bring-your-own OpenRouter key, reading + dream modes, streaming, follow-ups, local history). Retrieval over a book corpus and the proxy are v2.

## What shipped (v1)

- `src/ai/openrouter.ts` — streaming chat client (fetch + SSE, abort, error codes `no-key | offline | unauthorized | credits | rate-limited | bad-request | server | network | aborted | empty`), key in `localStorage['tarot.ai.key']` (kept out of the settings blob on purpose).
- `src/ai/prompts.ts` — system prompt per locale, `buildReadingInput` (face-up cards only; face-down cards as a `hiddenCards` count), follow-ups that attach the table only when it changed, dream → cards suggestion (`suggestCardsMessages` / `parseSuggestedCards`).
- `src/ai/markdown.ts` — tiny escaping Markdown renderer (no dependency, no raw HTML).
- `src/ai/store.ts` — `Interpretation` records in IndexedDB `tarot-ai/interpretations` (a separate database: idb-keyval cannot add a store to the existing `tarot` database). This is the first slice of the journal.
- `src/ai/models.ts` — preset slugs; the default is `anthropic/claude-opus-5`, `anthropic/claude-haiku-4.5` picks cards for dreams.
- `AskPanel.vue` — consent → key → question/dream, mode toggle, table summary, card chips (tap → card detail), streamed answer with stop, follow-ups, copy/share, recent threads, settings (model preset or custom slug, "send deck notes", remove key). Toolbar ✦ button, menu item, keyboard `A`.
- `DeckDef.notes` (localized) + `notes` in the Vitoriushka manifest.
- Engine op `placeCards` + protocol op `place` so model-suggested cards go through `dispatch` like every other action (works at a shared table too).
- Tests: `tests/unit/ai.test.ts` (SSE, client, markdown, prompts), engine/protocol tests, `tests/e2e/ask.spec.ts` against a mocked endpoint.

### Decisions taken on the open questions

1. **BYO key first** (option A). No server, no bill. The proxy (B/C) stays in v2 if the app is published to others.
2. **Dream mode does both**: the user can draw physically, or press "Suggest cards from the dream" and the fast model lays cards face up into the empty slots (three loose cards on the free table).
3. **No corpus in v1.** Good models know tarot; retrieval needs a licence review first.
4. **Default model: Claude Opus 5** via OpenRouter, changeable in the panel (presets + custom slug). No cost ceiling in the app: the OpenRouter key's own credit limit is the ceiling.
5. **Sharing is explicit**: copy / Web Share of the transcript (question + cards + answers). Nothing is shared automatically.
6. **Face-down cards are never described**, only counted, so the reader can say "there is more to reveal" and the user can flip one and ask a follow-up.

## Goal

Let the user ask a question or describe a dream, draw a spread, and receive an interpretation that references the actual cards, positions and orientations on the table, in their language, in the voice of a thoughtful reader — optionally grounded in a curated corpus of tarot books. The result is saved to the journal.

Two entry points, same pipeline:

1. **Reading interpretation** — "What should I know about my job change?" → user draws (or the app deals) → interpretation of the spread.
2. **Dream interpretation** — user writes down a dream → the app suggests cards that resonate (or the user draws) → interpretation that ties dream symbols to the cards.

## UX

- A **"Ask" panel** (bottom sheet on phones, side panel on desktop) with: a free-text question / dream field, a mode toggle (*Reading* / *Dream*), the current spread name, and an **Interpret** button that is enabled once every slot is filled (free table: at least one card).
- Interpretation **streams** in as it is generated (tokens appear progressively); a stop button; copy and share; "Save to journal".
- Per-card **"why?"** chips: tapping a card name in the text highlights the card on the table and vice versa.
- **Follow-up**: after the first answer the user can ask follow-ups in the same thread ("what about the outcome card?").
- Card back/face state matters: only face-up cards are sent. Face-down cards are described as "not yet revealed" so the user can reveal progressively ("reveal the next card").
- First-run consent screen explaining what is sent, to whom, and that it can be turned off. Works only when online; the panel shows a clear offline message.
- Language follows the app locale (`en` / `pt-BR`); the model is asked to answer in that language.

## Prompt design

System prompt (per locale) establishes: tone (warm, concrete, non-fatalistic, no medical/legal/financial advice), structure (overview → each position → synthesis → a question to reflect on), length budget, and the rule to *only* interpret cards present in the input.

User message is built from data, not prose, e.g.:

```json
{
  "mode": "reading",
  "question": "…",
  "spread": { "id": "celtic-cross", "name": "Celtic Cross" },
  "cards": [
    { "position": "1. The heart", "card": "The Star", "orientation": "upright",
      "keywords": ["hope", "healing"], "meaning": "…short meaning…" },
    { "position": "2. The challenge", "card": "The Tower", "orientation": "reversed", "…": "…" }
  ],
  "deck": { "name": "Vitoriushka", "notes": "Van Gogh-style personal deck; cards depict the querent's own life (cats, cabin, partner)…" },
  "locale": "pt-BR"
}
```

Including our own short meanings and keywords keeps small/cheap models on track. A deck-level `notes` field (new in `DeckDef`) lets a personal deck explain its symbolism.

For **dreams**: step 1 asks the model to extract symbols/themes from the dream and map them to Major Arcana (returning JSON); step 2 interprets the drawn or suggested cards in light of the dream.

## Retrieval over a book corpus (optional layer)

Question from the maintainer: could a **public NotebookLM** loaded with the books be used? Findings:

- NotebookLM has **no public API** for querying a notebook from another app (as of writing). Sharing a notebook gives humans a UI, not a programmatic endpoint. So it cannot power an in-app feature; it *can* remain a great authoring/research tool for writing our own card meanings.
- Google offers programmatic RAG through **Gemini "File Search"** (Gemini API) and Vertex AI RAG Engine; those are usable from a backend with a Google key but tie the corpus to Google.
- Provider-agnostic option: **our own retrieval index** — chunk the books (EPUB/PDF → text), embed with an OpenRouter-available embedding model (or a local one at build time), store vectors in a small file (few MB for a handful of books) or SQLite-vec / pgvector on the helper server, retrieve top-k chunks per card + question and put them in the prompt as "reference passages" with citations (book, chapter).
- Licensing: only books we have the right to use (public domain such as Waite's *Pictorial Key*, or the author's own notes). Copyrighted books can be used for *personal* reading on one's own device but must not be redistributed inside the app bundle.

Recommendation: start **without** retrieval (good models know tarot well), add retrieval as v2 with a small public-domain corpus, and keep the corpus and index on the helper server (or bundled if it is public domain and small).

## Architecture options for the key

| Option | How | Pros | Cons |
| --- | --- | --- | --- |
| **A. Bring-your-own key** (client only) | User pastes an OpenRouter key; stored in localStorage; browser calls `https://openrouter.ai/api/v1/chat/completions` directly (CORS is allowed) | No server at all, fits the offline-first philosophy, user pays | Friction; key in browser storage; no rate limiting |
| **B. Tiny proxy** | Cloudflare Worker / Deno Deploy / Vercel Edge function holding the key; forwards streaming requests; per-IP rate limits; optional shared secret or Turnstile | Zero-friction for users; we control model, costs and prompts server-side | Costs money; abuse surface; needs a deploy |
| **C. Both** | Proxy by default with a daily free quota; BYO key to lift limits | Best UX and sustainable | Most work |

Recommendation: **A first** (ships in a day, proves the feature), then **B/C** if the app is published to others. The proxy is also the natural home for retrieval and for the multiplayer signaling helper (see `multiplayer-table.md`) — one small always-on service.

## Model choice (OpenRouter)

OpenRouter exposes many providers behind one OpenAI-compatible API with streaming. Choose per tier in a `models.ts` map so it can change without a release:

- *quality*: a frontier model (e.g. latest Claude or GPT/Gemini flagship) for the full interpretation.
- *cheap/fast*: a small model for symbol extraction, title generation, and follow-ups.
- Send `HTTP-Referer` / `X-Title` headers as OpenRouter recommends; set `max_tokens`; use `stream: true` and parse SSE.

Costs: a Celtic Cross interpretation is ~1.5k input + ~800 output tokens; well under a cent on mid models, a few cents on flagship models.

## Data model (as shipped in `src/ai/store.ts`)

```ts
interface Interpretation {
  version: 1;
  id: string; createdAt: number; updatedAt: number; locale: Locale;
  mode: 'reading' | 'dream';
  question: string;
  spreadId: string; deckId: string;
  model: string; provider: 'openrouter';
  messages: { role: 'user' | 'assistant'; content: string; shown?: string }[];  // thread without the system prompt; `shown` = what the user typed
  input: string;               // JSON of the ReadingInput the thread started with (follow-ups diff against it)
  tableSnapshot: TableState;   // what was on the table
  // v2: citations?: { book: string; location: string; text: string }[];
}
```

Stored in IndexedDB `tarot-ai/interpretations` (a separate database, see *What shipped*); the journal (`persistence-and-journal.md`) will link readings to these records or migrate them.

## Implementation steps

1. ~~`src/ai/openrouter.ts`: streaming chat client (fetch + SSE parser, abort support), key storage, error mapping (401, 402 insufficient credits, 429).~~ done
2. ~~`src/ai/prompts.ts`: system prompts per locale; `buildReadingInput(state, spread, cards, deck, question)`; dream two-step.~~ done
3. ~~`DeckDef.notes` (localized) + manifest field; write notes for the Vitoriushka deck.~~ done
4. ~~`AskPanel.vue`: input, mode, consent, streaming output (render Markdown safely), follow-ups, save/share.~~ done
5. ~~Settings: API key entry (masked), model tier, "send deck notes" toggle, delete key.~~ done (inside the panel)
6. ~~Journal integration; e2e test with a mocked endpoint (Playwright `route`).~~ done as a local history; the full journal (`persistence-and-journal.md`) should read `tarot-ai/interpretations` or migrate it.
7. v2: retrieval index build script (`scripts/build-corpus.ts`), proxy worker, citations UI, the evaluation set below.

## Privacy and safety

- Nothing is sent until the user presses Interpret; consent text names the provider and that OpenRouter's own routing may send data to different model providers; link to OpenRouter's data policy.
- No personal identifiers are added; the user's question is sent as typed.
- Guardrail in the system prompt: no medical, legal or financial directives; encourage agency; handle distressing dreams gently and point to help lines when self-harm is mentioned.
- Journal is local-only; export is explicit.

## Evaluation

- A fixed set of 20 spreads + questions with expected properties (mentions every position, respects orientation, answers in the right language, length within budget). Run against candidate models with a script; keep results in `docs/eval/`.

## Open questions for the maintainer (v2)

1. Proxy with a free daily quota (option C) if the app is published: is a small monthly bill acceptable?
2. Which books are in scope for the corpus and what are their licences?
3. Should the AI history merge into the journal store when the journal ships, or stay a separate database?
