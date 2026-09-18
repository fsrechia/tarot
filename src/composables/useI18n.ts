import { computed } from 'vue';
import type { Localized } from '../engine/types';
import { pick, pickList, translate, type MessageKey } from '../i18n';
import { useSettings } from './useSettings';

export function useI18n() {
  const settings = useSettings();
  const locale = computed(() => settings.locale);
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(settings.locale, key, params);
  const l = (text: Localized | undefined) => pick(settings.locale, text);
  const ll = (text: Parameters<typeof pickList>[1]) => pickList(settings.locale, text);
  return { locale, t, l, ll };
}
