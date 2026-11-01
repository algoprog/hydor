// Which language the pages are shown in: picked in Settings → General, else the browser's own when the app
// has it. Kept on this device; the server hears of it as the app starts (App.tsx) and when it changes, so
// agents reply in it. Changing it reloads the page.
import type { Lang } from '@shared/i18n';
import { put } from '../lib/api';
import { currentLang, KEY } from './locale';
import { startTranslating } from './runtime';

export { currentLang };

export function setLang(lang: Lang) {
  localStorage.setItem(KEY, lang);
  void put('/api/me/language', { lang })
    .catch(() => {})
    .finally(() => location.reload());
}

/** At start: the page in the language in use, its dictionary loaded before the first paint (no English flashes by). */
export const startLanguage = (): Promise<void> => startTranslating(currentLang()).catch(() => {});
