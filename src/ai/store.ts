/**
 * Local history of interpretations (IndexedDB). This is the first slice of
 * the reading journal (plans/persistence-and-journal.md): each record keeps
 * the question, the thread and a snapshot of the table it was read from.
 */
import { createStore, del, entries, set } from 'idb-keyval';
import type { Locale, TableState } from '../engine/types';
import type { ChatMessage } from './openrouter';
import type { AskMode } from './prompts';

/** A chat message plus, for user turns, the text to show instead of the raw payload. */
export interface ThreadMessage extends ChatMessage {
  shown?: string;
}

export interface Interpretation {
  version: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  locale: Locale;
  mode: AskMode;
  question: string;
  spreadId: string;
  deckId: string;
  model: string;
  provider: 'openrouter';
  /** The conversation without the system prompt. */
  messages: ThreadMessage[];
  /** JSON of the reading input the thread was started with (for follow-ups). */
  input: string;
  tableSnapshot: TableState;
}

// A separate database name: idb-keyval cannot add a second object store to
// the `tarot` database used by the deck importer.
const store = typeof indexedDB !== 'undefined' ? createStore('tarot-ai', 'interpretations') : undefined;

export function newInterpretationId(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveInterpretation(rec: Interpretation): Promise<void> {
  if (!store) return;
  try {
    await set(rec.id, rec, store);
  } catch {
    /* quota or private mode: history is best-effort */
  }
}

/** Newest first. */
export async function listInterpretations(limit = 20): Promise<Interpretation[]> {
  if (!store) return [];
  try {
    const all = (await entries<string, Interpretation>(store)).map(([, v]) => v).filter((v) => v?.version === 1);
    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  } catch {
    return [];
  }
}

export async function deleteInterpretation(id: string): Promise<void> {
  if (!store) return;
  try {
    await del(id, store);
  } catch {
    /* ignore */
  }
}
