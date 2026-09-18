/**
 * Model presets for OpenRouter. Slugs live here (not in the UI) so they can
 * change without touching components; the user can also type any slug.
 */
export interface ModelPreset {
  id: string;
  label: string;
}

/** Full interpretation. */
export const QUALITY_MODEL = 'anthropic/claude-opus-5';
/** Symbol extraction / card suggestion (small JSON answers). */
export const FAST_MODEL = 'anthropic/claude-haiku-4.5';

export const modelPresets: ModelPreset[] = [
  { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5' },
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'openai/gpt-5.2', label: 'GPT-5.2' },
];

export const isPreset = (id: string) => modelPresets.some((m) => m.id === id);
