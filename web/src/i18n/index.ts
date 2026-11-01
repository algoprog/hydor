// Which language the pages are shown in: picked in Settings → General, else the browser's own when the app
// has it. Kept on this device; the server hears of it as the app starts (App.tsx) and when it changes, so
// agents reply in it. Changing it reloads the page.
import { isLang, preferred, type Lang } from '@shared/i18n';
import { put } from '../lib/api';
import { startTranslating } from './runtime';

const KEY = 'naget.lang';

export function currentLang(): Lang {
  const v = localStorage.getItem(KEY);
  return isLang(v) ? v : preferred(navigator.languages ?? [navigator.language]);
}

export function setLang(lang: Lang) {
  localStorage.setItem(KEY, lang);
  void put('/api/me/language', { lang })
    .catch(() => {})
    .finally(() => location.reload());
}

/** At start: the page in the language in use, its dictionary loaded before the first paint (no English flashes by). */
export const startLanguage = (): Promise<void> => startTranslating(currentLang()).catch(() => {});
