// The languages the app is shown in. English is the app's own; the others come from a dictionary each
// (web/src/i18n), and agents are asked to reply in the language picked.

export type Lang = 'en' | 'de' | 'es' | 'fr' | 'pt' | 'el' | 'ja' | 'zh';

/** In the pickers' order: English, then the others by their own names, Latin letters first. */
export const LANGS: { id: Lang; name: string; english: string }[] = [
  { id: 'en', name: 'English', english: 'English' },
  { id: 'de', name: 'Deutsch', english: 'German' },
  { id: 'es', name: 'Español', english: 'Spanish' },
  { id: 'fr', name: 'Français', english: 'French' },
  { id: 'pt', name: 'Português (Brasil)', english: 'Portuguese (Brazil)' },
  { id: 'el', name: 'Ελληνικά', english: 'Greek' },
  { id: 'ja', name: '日本語', english: 'Japanese' },
  { id: 'zh', name: '中文（简体）', english: 'Chinese (Simplified)' },
];

export const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.id === v);

/** The language a browser asks for first, among these; English otherwise. */
export function preferred(list: readonly string[]): Lang {
  for (const l of list) {
    const base = l.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}
