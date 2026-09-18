/**
 * Minimal OpenRouter client for the browser: streaming chat completions over
 * SSE, key storage, and errors mapped to codes the UI can translate.
 * No SDK: the endpoint is OpenAI-compatible and CORS-enabled, and the key is
 * the user's own (see docs/plans/ai-interpretation.md, option A).
 */

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const KEY_STORAGE = 'tarot.ai.key';

export type AiErrorCode =
  | 'no-key'
  | 'offline'
  | 'unauthorized'
  | 'credits'
  | 'rate-limited'
  | 'bad-request'
  | 'server'
  | 'network'
  | 'aborted'
  | 'empty';

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message?: string,
    public status?: number,
  ) {
    super(message ?? code);
    this.name = 'AiError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a JSON object (only for models that support it). */
  json?: boolean;
  signal?: AbortSignal;
  /** Called with each text fragment as it streams in. */
  onDelta?: (text: string) => void;
  fetchImpl?: typeof fetch;
}

export interface ChatResult {
  text: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Key storage
// ---------------------------------------------------------------------------

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string): void {
  try {
    const k = key.trim();
    if (k) localStorage.setItem(KEY_STORAGE, k);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

/** `sk-or-v1-…abcd` for display. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// SSE parsing (pure, unit-tested)
// ---------------------------------------------------------------------------

/**
 * Splits a text chunk into complete SSE `data:` payloads. Returns the payloads
 * and the unfinished remainder to prepend to the next chunk. Comment lines
 * (`: OPENROUTER PROCESSING`) are ignored.
 */
export function parseSse(chunk: string, carry = ''): { payloads: string[]; rest: string } {
  const text = carry + chunk;
  const parts = text.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? '';
  const payloads: string[] = [];
  for (const block of parts) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (data) payloads.push(data);
  }
  return { payloads, rest };
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null }; message?: { content?: string | null }; finish_reason?: string | null }[];
  error?: { message?: string; code?: number | string };
  model?: string;
}

/** Text carried by one streamed (or non-streamed) chunk. */
export function chunkText(payload: string): { text: string; model?: string; error?: string } {
  let obj: StreamChunk;
  try {
    obj = JSON.parse(payload) as StreamChunk;
  } catch {
    return { text: '' };
  }
  if (obj.error) return { text: '', error: obj.error.message ?? String(obj.error.code ?? 'error') };
  const choice = obj.choices?.[0];
  const text = choice?.delta?.content ?? choice?.message?.content ?? '';
  return { text, model: obj.model };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function mapStatus(status: number, body: string): AiError {
  let detail = '';
  try {
    detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? '';
  } catch {
    detail = body.slice(0, 200);
  }
  if (status === 401 || status === 403) return new AiError('unauthorized', detail, status);
  if (status === 402) return new AiError('credits', detail, status);
  if (status === 429) return new AiError('rate-limited', detail, status);
  if (status >= 500) return new AiError('server', detail, status);
  return new AiError('bad-request', detail, status);
}

/**
 * Streams a chat completion. Resolves with the full text once the stream
 * ends; rejects with an `AiError`. `onDelta` receives fragments as they arrive.
 */
export async function chat(opts: ChatOptions): Promise<ChatResult> {
  if (!opts.apiKey) throw new AiError('no-key');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError('offline');
  const doFetch = opts.fetchImpl ?? fetch;
  const stream = Boolean(opts.onDelta);

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream,
    max_tokens: opts.maxTokens ?? 2000,
    temperature: opts.temperature ?? 0.8,
  };
  if (opts.json) body.response_format = { type: 'json_object' };

  let res: Response;
  try {
    res = await doFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://tarot.local',
        'X-Title': 'Tarot Table',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new AiError('aborted');
    throw new AiError('network', (e as Error)?.message);
  }

  if (!res.ok) throw mapStatus(res.status, await res.text().catch(() => ''));

  if (!stream) {
    const { text, model, error } = chunkText(await res.text());
    if (error) throw new AiError('bad-request', error);
    if (!text) throw new AiError('empty');
    return { text, model: model ?? opts.model };
  }

  if (!res.body) throw new AiError('network', 'no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let text = '';
  let model = opts.model;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const parsed = parseSse(decoder.decode(value, { stream: true }), carry);
      carry = parsed.rest;
      for (const payload of parsed.payloads) {
        if (payload === '[DONE]') continue;
        const c = chunkText(payload);
        if (c.error) throw new AiError('server', c.error);
        if (c.model) model = c.model;
        if (c.text) {
          text += c.text;
          opts.onDelta!(c.text);
        }
      }
    }
  } catch (e) {
    if (e instanceof AiError) throw e;
    if ((e as Error)?.name === 'AbortError') throw new AiError('aborted');
    throw new AiError('network', (e as Error)?.message);
  }
  if (!text) throw new AiError('empty');
  return { text, model };
}
