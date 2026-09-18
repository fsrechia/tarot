import { describe, expect, it } from 'vitest';
import { AiError, chat, chunkText, maskKey, parseSse } from '../../src/ai/openrouter';
import { renderMarkdown } from '../../src/ai/markdown';
import {
  buildReadingInput,
  buildThread,
  followUpMessage,
  hiddenCount,
  lengthBudget,
  parseSuggestedCards,
  suggestCardsMessages,
  visibleCards,
} from '../../src/ai/prompts';
import { createTable, placeCards, setCard } from '../../src/engine/table';
import { seededRng } from '../../src/engine/shuffle';
import { tarotGame } from '../../src/games/tarot';
import { staticDecks } from '../../src/decks/registry';

const spread = tarotGame.spreads.find((s) => s.id === 'three')!;
const cardsById = new Map(tarotGame.cards.map((c) => [c.id, c]));
const deck = staticDecks.find((d) => d.id === 'vitoria')!;
const fresh = () => createTable({ game: tarotGame, deckId: 'vitoria', spread, rng: seededRng(3) });

/** A table with The Star upright in "Past", The Tower reversed in "Present", a face-down card in "Future". */
function sampleTable() {
  let s = placeCards(fresh(), [{ id: '17', reversed: false }, { id: '16', reversed: true }, { id: '00', reversed: false }], { x: 0, y: 0 });
  s = setCard(s, { kind: 'slot', index: 2 }, { face: 'down' });
  return s;
}

describe('SSE parsing', () => {
  it('splits complete events and keeps the remainder', () => {
    const a = parseSse(': OPENROUTER PROCESSING\n\ndata: {"a":1}\n\ndata: {"b":');
    expect(a.payloads).toEqual(['{"a":1}']);
    expect(a.rest).toBe('data: {"b":');
    const b = parseSse('2}\n\ndata: [DONE]\n\n', a.rest);
    expect(b.payloads).toEqual(['{"b":2}', '[DONE]']);
    expect(b.rest).toBe('');
  });
  it('handles CRLF and multi-line data', () => {
    const r = parseSse('data: {"x":\r\ndata: 1}\r\n\r\n');
    expect(r.payloads).toEqual(['{"x":\n1}']);
  });
  it('extracts delta text, message text and errors from chunks', () => {
    expect(chunkText('{"choices":[{"delta":{"content":"Hi"}}],"model":"m"}')).toEqual({ text: 'Hi', model: 'm' });
    expect(chunkText('{"choices":[{"message":{"content":"Full"}}]}').text).toBe('Full');
    expect(chunkText('{"error":{"message":"boom"}}').error).toBe('boom');
    expect(chunkText('not json').text).toBe('');
  });
  it('masks keys for display', () => {
    expect(maskKey('sk-or-v1-abcdefghijklmnop')).toBe('sk-or-…mnop');
    expect(maskKey('short')).toBe('••••');
  });
});

describe('chat()', () => {
  const sse = (...texts: string[]) =>
    texts.map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }], model: 'test/model' })}\n\n`).join('') + 'data: [DONE]\n\n';
  const streamResponse = (body: string, init: ResponseInit = {}) =>
    new Response(new ReadableStream({ start: (c) => { c.enqueue(new TextEncoder().encode(body)); c.close(); } }), { status: 200, ...init });

  it('streams deltas and resolves with the full text', async () => {
    const deltas: string[] = [];
    const calls: RequestInit[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => { calls.push(init!); return streamResponse(sse('Hel', 'lo')); }) as typeof fetch;
    const res = await chat({ apiKey: 'k', model: 'm', messages: [{ role: 'user', content: 'x' }], onDelta: (d) => deltas.push(d), fetchImpl });
    expect(deltas).toEqual(['Hel', 'lo']);
    expect(res).toEqual({ text: 'Hello', model: 'test/model' });
    const body = JSON.parse(calls[0]!.body as string);
    expect(body.stream).toBe(true);
    expect((calls[0]!.headers as Record<string, string>).Authorization).toBe('Bearer k');
  });
  it('maps HTTP errors to codes', async () => {
    const mk = (status: number) => (async () => new Response('{"error":{"message":"no"}}', { status })) as typeof fetch;
    const code = (status: number) => chat({ apiKey: 'k', model: 'm', messages: [], fetchImpl: mk(status) }).catch((e: AiError) => e.code);
    expect(await code(401)).toBe('unauthorized');
    expect(await code(402)).toBe('credits');
    expect(await code(429)).toBe('rate-limited');
    expect(await code(500)).toBe('server');
    expect(await code(400)).toBe('bad-request');
    await expect(chat({ apiKey: '', model: 'm', messages: [] })).rejects.toMatchObject({ code: 'no-key' });
  });
  it('returns a non-streamed message when no onDelta is given', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"cards":[]}' } }] }))) as typeof fetch;
    const res = await chat({ apiKey: 'k', model: 'm', messages: [], fetchImpl });
    expect(res.text).toBe('{"cards":[]}');
  });
});

describe('markdown', () => {
  it('escapes HTML and renders headings, lists, bold and italics', () => {
    const html = renderMarkdown('# Title\n\nHello **world** and *you* <b>x</b>\n\n- one\n- two\n\n1. a\n2. b');
    expect(html).toBe(
      '<h3>Title</h3><p>Hello <strong>world</strong> and <em>you</em> &lt;b&gt;x&lt;/b&gt;</p><ul><li>one</li><li>two</li></ul><ol><li>a</li><li>b</li></ol>',
    );
  });
  it('joins consecutive lines into one paragraph with breaks', () => {
    expect(renderMarkdown('a\nb')).toBe('<p>a<br>b</p>');
  });
});

describe('prompts', () => {
  it('sends only face-up cards, with position, orientation, keywords and meaning, and counts hidden ones', () => {
    const state = sampleTable();
    expect(visibleCards(state).map((v) => v.id)).toEqual(['17', '16']);
    expect(hiddenCount(state)).toBe(1);
    const input = buildReadingInput({ state, spread, cardsById, deck, question: ' New job? ', mode: 'reading', locale: 'en', includeDeckNotes: true });
    expect(input.question).toBe('New job?');
    expect(input.spread).toEqual({ id: 'three', name: 'Past · Present · Future' });
    expect(input.hiddenCards).toBe(1);
    expect(input.cards).toHaveLength(2);
    expect(input.cards[0]).toMatchObject({ position: 'Past', card: 'The Star', orientation: 'upright', number: 17 });
    expect(input.cards[0]!.keywords.length).toBeGreaterThan(0);
    expect(input.cards[1]).toMatchObject({ position: 'Present', card: 'The Tower', orientation: 'reversed' });
    expect(input.cards[1]!.meaning).toBe(cardsById.get('16')!.meaning!.reversed.en);
    expect(input.deck?.notes).toContain('Van Gogh');
  });
  it('localizes the payload and omits deck notes when asked', () => {
    const input = buildReadingInput({ state: sampleTable(), spread, cardsById, deck, question: '', mode: 'dream', locale: 'pt-BR', includeDeckNotes: false });
    expect(input.cards[0]!.card).toBe('A Estrela');
    expect(input.cards[0]!.position).toBe('Passado');
    expect(input.deck).toBeUndefined();
    const thread = buildThread(input);
    expect(thread[0]!.role).toBe('system');
    expect(thread[0]!.content).toContain('Brazilian Portuguese');
    expect(thread[1]!.content).toContain('"card": "A Estrela"');
  });
  it('uses the free table as "no spread" and loose cards without positions', () => {
    const free = tarotGame.spreads.find((s) => s.id === 'free')!;
    const state = placeCards(createTable({ game: tarotGame, deckId: 'vitoria', spread: free, rng: seededRng(1) }), [{ id: '01', reversed: false }], { x: 0, y: 0 });
    const input = buildReadingInput({ state, spread: free, cardsById, deck, question: '', mode: 'reading', locale: 'en', includeDeckNotes: false });
    expect(input.spread).toBeNull();
    expect(input.cards[0]!.position).toBeNull();
  });
  it('attaches the table to a follow-up only when it changed', () => {
    const input = buildReadingInput({ state: sampleTable(), spread, cardsById, deck, question: 'q', mode: 'reading', locale: 'en', includeDeckNotes: false });
    const same = JSON.stringify(input);
    expect(followUpMessage('and the future?', input, same)).toBe('and the future?');
    const revealed = { ...input, hiddenCards: 0 };
    expect(followUpMessage('and now?', revealed, same)).toContain('The table changed');
  });
  it('scales the length budget with the card count and caps it', () => {
    expect(lengthBudget(1)).toBeLessThan(lengthBudget(3));
    expect(lengthBudget(10)).toBe(900);
  });
  it('builds a dream → cards request and parses the answer defensively', () => {
    const msgs = suggestCardsMessages({ dream: 'A tower fell', count: 2, available: tarotGame.cards, locale: 'en', allowReversed: false });
    expect(msgs[0]!.content).toContain('exactly 2');
    expect(msgs[0]!.content).toContain('16: The Tower');
    const valid = new Set(tarotGame.cards.map((c) => c.id));
    expect(parseSuggestedCards('Sure! {"cards":[{"id":"16","reversed":true},{"id":16},{"id":"xx"},{"id":5,"reversed":false}]}', valid, 3)).toEqual([
      { id: '16', reversed: true },
      { id: '05', reversed: false },
    ]);
    expect(parseSuggestedCards('nope', valid, 3)).toEqual([]);
    expect(parseSuggestedCards('{"cards":[{"id":"01"},{"id":"02"},{"id":"03"}]}', valid, 2)).toHaveLength(2);
  });
});
