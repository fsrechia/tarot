import { useSettings } from './useSettings';

export function useHaptics() {
  const settings = useSettings();
  const vibrate = (pattern: number | number[] = 10) => {
    if (!settings.haptics) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  };
  return { vibrate };
}
