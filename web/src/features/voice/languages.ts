// Languages to dictate in, named in the page's own language ("Deutsch" reads "German" in English).

export const LANGUAGES = [
  'en-US', 'en-GB', 'en-AU', 'en-IN', 'es-ES', 'es-MX', 'fr-FR', 'fr-CA', 'de-DE', 'it-IT', 'pt-BR', 'pt-PT', 'nl-NL',
  'sv-SE', 'da-DK', 'nb-NO', 'fi-FI', 'pl-PL', 'cs-CZ', 'sk-SK', 'hu-HU', 'ro-RO', 'bg-BG', 'hr-HR', 'sr-RS', 'sl-SI',
  'el-GR', 'tr-TR', 'ru-RU', 'uk-UA', 'ar-SA', 'he-IL', 'fa-IR', 'hi-IN', 'bn-IN', 'ta-IN', 'ur-PK', 'id-ID', 'ms-MY',
  'th-TH', 'vi-VN', 'fil-PH', 'zh-CN', 'zh-TW', 'yue-HK', 'ja-JP', 'ko-KR', 'ca-ES', 'eu-ES', 'gl-ES', 'cy-GB',
  'et-EE', 'lv-LV', 'lt-LT', 'sw-KE', 'af-ZA',
];

let names: Intl.DisplayNames | null = null;
/** "German (Germany)", or the tag itself when the browser cannot name it. */
export function languageName(tag: string): string {
  try {
    names ??= new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' });
    return names.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** The short label for a chip: "EN", "PT-BR". */
export const languageCode = (tag: string) => {
  const [l, r] = tag.split('-');
  return LANGUAGES.filter((t) => t.startsWith(`${l}-`)).length > 1 && r ? `${l}-${r}`.toUpperCase() : l.toUpperCase();
};
