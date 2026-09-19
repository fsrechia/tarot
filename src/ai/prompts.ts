/**
 * Prompt construction for the AI reader. Pure functions: the table state goes
 * in, chat messages come out. The user message is data (JSON), not prose, so
 * small models stay on track and the model can only interpret cards that are
 * actually face up on the table.
 */
import type { CardDef, DeckDef, Locale, Location, SpreadDef, TableState } from '../engine/types';
import { pick, pickList } from '../i18n';
import type { ChatMessage } from './openrouter';

export type AskMode = 'reading' | 'dream';

export interface ReadingCardInput {
  position: string | null;
  card: string;
  number?: number;
  orientation: 'upright' | 'reversed';
  keywords: string[];
  meaning: string;
}

export interface ReadingInput {
  mode: AskMode;
  question: string;
  locale: Locale;
  spread: { id: string; name: string } | null;
  cards: ReadingCardInput[];
  /** Face-down cards on the table: described to the model as "not yet revealed". */
  hiddenCards: number;
  deck?: { name: string; notes?: string };
}

export interface BuildOptions {
  state: TableState;
  spread: SpreadDef;
  cardsById: Map<string, CardDef>;
  deck: DeckDef;
  question: string;
  mode: AskMode;
  locale: Locale;
  includeDeckNotes: boolean;
}

/** Face-up cards in reading order (slots, then loose by z) with their locations. */
export function visibleCards(state: TableState): { loc: Location; id: string; reversed: boolean; position: number | null }[] {
  const slots = state.slots.flatMap((c, index) =>
    c && c.face === 'up' ? [{ loc: { kind: 'slot', index } as Location, id: c.id, reversed: c.reversed, position: index }] : [],
  );
  const loose = state.loose
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => c.face === 'up')
    .sort((a, b) => a.c.z - b.c.z)
    .map(({ c, index }) => ({ loc: { kind: 'loose', index } as Location, id: c.id, reversed: c.reversed, position: null }));
  return [...slots, ...loose];
}

export function hiddenCount(state: TableState): number {
  return state.slots.filter((c) => c && c.face === 'down').length + state.loose.filter((c) => c.face === 'down').length;
}

export function buildReadingInput(o: BuildOptions): ReadingInput {
  const cards: ReadingCardInput[] = visibleCards(o.state).map((v) => {
    const def = o.cardsById.get(v.id);
    const slot = v.position !== null ? o.spread.slots[v.position] : undefined;
    return {
      position: slot ? pick(o.locale, slot.label) : null,
      card: def ? pick(o.locale, def.name) : v.id,
      number: def?.number,
      orientation: v.reversed ? 'reversed' : 'upright',
      keywords: pickList(o.locale, def?.keywords),
      meaning: pick(o.locale, v.reversed ? def?.meaning?.reversed : def?.meaning?.upright),
    };
  });
  const input: ReadingInput = {
    mode: o.mode,
    question: o.question.trim(),
    locale: o.locale,
    spread: o.spread.slots.length ? { id: o.spread.id, name: pick(o.locale, o.spread.name) } : null,
    cards,
    hiddenCards: hiddenCount(o.state),
  };
  const notes = o.includeDeckNotes ? pick(o.locale, o.deck.notes) : '';
  if (notes) input.deck = { name: o.deck.name, notes };
  return input;
}

const LANGUAGE: Record<Locale, string> = { en: 'English', 'pt-BR': 'Brazilian Portuguese' };

/** Word budget grows with the number of cards but stays readable on a phone. */
export function lengthBudget(cardCount: number): number {
  return Math.min(900, 250 + cardCount * 70);
}

export function systemPrompt(locale: Locale, mode: AskMode, cardCount: number): string {
  const words = lengthBudget(cardCount);
  if (locale === 'pt-BR') {
    return [
      'Você é uma leitora de tarô experiente, calorosa e concreta. Fale com a pessoa consulente em segunda pessoa, com respeito e sem misticismo vazio.',
      'Regras:',
      '- Interprete APENAS as cartas listadas no JSON, na posição e orientação indicadas. Nunca invente cartas. Se `hiddenCards` for maior que zero, mencione que há cartas ainda não reveladas e convide a pessoa a virá-las e perguntar de novo.',
      '- Use as palavras-chave e significados curtos fornecidos como base, enriquecidos pelo seu conhecimento do tarô. Quando houver `deck.notes`, considere o simbolismo próprio desse baralho.',
      '- Tom: acolhedor, direto, não fatalista. O tarô descreve tendências e convida à reflexão; a pessoa tem sempre agência.',
      '- Nunca dê orientações médicas, jurídicas ou financeiras; se surgirem, recomende profissionais. Se houver menção a se machucar ou a crise, responda com cuidado e indique buscar ajuda (no Brasil, o CVV atende no 188).',
      mode === 'dream'
        ? '- Modo sonho: a pessoa descreveu um sonho. Identifique os símbolos e sentimentos centrais do sonho e mostre como cada carta dialoga com eles.'
        : '- Modo leitura: a pessoa fez uma pergunta ou pediu uma orientação geral.',
      `- Estrutura em Markdown: um parágrafo de visão geral; um subtítulo por carta (posição — carta, orientação) com 1 a 3 parágrafos curtos; uma síntese; e termine com UMA pergunta para a pessoa refletir.`,
      `- Tamanho: no máximo cerca de ${words} palavras. Sem introduções sobre o que você é.`,
      `- Responda sempre em ${LANGUAGE[locale]}.`,
    ].join('\n');
  }
  return [
    'You are an experienced tarot reader: warm, concrete and grounded. Address the querent as "you", with respect and without empty mysticism.',
    'Rules:',
    '- Interpret ONLY the cards listed in the JSON, in the stated position and orientation. Never invent cards. If `hiddenCards` is greater than zero, mention that some cards are not yet revealed and invite the querent to turn them and ask again.',
    '- Build on the provided keywords and short meanings, enriched by your knowledge of tarot. When `deck.notes` is present, take that deck’s own symbolism into account.',
    '- Tone: kind, direct, non-fatalistic. Tarot describes tendencies and invites reflection; the querent always has agency.',
    '- Never give medical, legal or financial directives; if these come up, recommend professionals. If self-harm or crisis is mentioned, answer gently and point to local help lines.',
    mode === 'dream'
      ? '- Dream mode: the querent described a dream. Identify its central symbols and feelings and show how each card speaks to them.'
      : '- Reading mode: the querent asked a question or wants general guidance.',
    '- Structure in Markdown: an overview paragraph; one subheading per card (position — card, orientation) with 1–3 short paragraphs; a synthesis; and end with ONE question for the querent to reflect on.',
    `- Length: about ${words} words at most. No preamble about what you are.`,
    `- Always answer in ${LANGUAGE[locale]}.`,
  ].join('\n');
}

/** The first user turn: the reading as JSON plus a one-line instruction. */
export function initialUserMessage(input: ReadingInput): string {
  const ask =
    input.locale === 'pt-BR'
      ? input.mode === 'dream'
        ? 'Interprete estas cartas à luz do sonho descrito em `question`.'
        : input.question
          ? 'Interprete esta tiragem em relação à pergunta em `question`.'
          : 'Interprete esta tiragem como uma orientação geral (não há pergunta específica).'
      : input.mode === 'dream'
        ? 'Interpret these cards in the light of the dream described in `question`.'
        : input.question
          ? 'Interpret this spread in relation to the question in `question`.'
          : 'Interpret this spread as general guidance (there is no specific question).';
  return `${ask}\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``;
}

/**
 * Follow-up turn. When the table changed since the thread started (e.g. a card
 * was revealed) the new state is attached so "reveal the next card" works.
 */
export function followUpMessage(text: string, current: ReadingInput, previousJson: string): string {
  const json = JSON.stringify(current);
  if (json === previousJson) return text;
  const label = current.locale === 'pt-BR' ? 'A mesa mudou. Estado atual:' : 'The table changed. Current state:';
  return `${text}\n\n${label}\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\``;
}

export function buildThread(input: ReadingInput): ChatMessage[] {
  return [{ role: 'system', content: systemPrompt(input.locale, input.mode, input.cards.length) }, { role: 'user', content: initialUserMessage(input) }];
}

// ---------------------------------------------------------------------------
// Dream → suggested cards (step 1 of the dream pipeline)
// ---------------------------------------------------------------------------

export interface SuggestedCard {
  id: string;
  reversed: boolean;
}

export function suggestCardsMessages(o: {
  dream: string;
  count: number;
  available: CardDef[];
  locale: Locale;
  allowReversed: boolean;
}): ChatMessage[] {
  const list = o.available.map((c) => `${c.id}: ${pick('en', c.name)} (${pickList('en', c.keywords).join(', ')})`).join('\n');
  const system = [
    'You map dreams to tarot cards. Reply with JSON only: {"cards":[{"id":"17","reversed":false}]}.',
    `Pick exactly ${o.count} distinct cards from the available list whose symbolism resonates most with the dream, ordered from most to least central.`,
    o.allowReversed ? 'Set "reversed": true only when the dream shows the card’s energy blocked, inverted or excessive.' : 'Always set "reversed": false.',
    'Available cards (id: name (keywords)):',
    list,
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Dream (${LANGUAGE[o.locale]}):\n${o.dream.trim()}` },
  ];
}

/** Extracts valid, distinct card ids from the model's JSON (tolerates prose around it). */
export function parseSuggestedCards(text: string, validIds: Set<string>, max: number): SuggestedCard[] {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return [];
  let obj: { cards?: unknown };
  try {
    obj = JSON.parse(match[0]) as { cards?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(obj.cards)) return [];
  const seen = new Set<string>();
  const out: SuggestedCard[] = [];
  for (const raw of obj.cards) {
    const c = raw as { id?: unknown; reversed?: unknown };
    let id = typeof c.id === 'string' ? c.id : typeof c.id === 'number' ? String(c.id) : '';
    if (/^\d$/.test(id)) id = `0${id}`;
    if (!validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, reversed: c.reversed === true });
    if (out.length >= max) break;
  }
  return out;
}
