// The language in use, and the locale dates and times are written in. A page in Chinese or Greek writes its
// dates that way too ("10月31日 14:28", "31 Οκτ, 2:28 μ.μ."), whatever the browser's own language; in English
// the browser's locale keeps its own way of writing them, as it does in another language it is set to (es-MX).
// Changing the language reloads the page.
import { isLang, preferred, type Lang } from '@shared/i18n';

export const KEY = 'naget.lang';

export function currentLang(): Lang {
  const v = localStorage.getItem(KEY);
  return isLang(v) ? v : preferred(navigator.languages ?? [navigator.language]);
}

const TAGS: Partial<Record<Lang, string>> = { de: 'de-DE', es: 'es', fr: 'fr-FR', pt: 'pt-BR', el: 'el-GR', ja: 'ja-JP', zh: 'zh-CN' };

/**
 * For toLocaleString, Intl.DateTimeFormat and the like; undefined (the browser's) in English. The browser's own
 * locale when it is of the same language, so its region's ways stay (es-MX writes 2:28 p.m., es-ES 14:28).
 */
export const LOCALE: string | undefined = (() => {
  try {
    const lang = currentLang();
    if (lang === 'en') return undefined;
    // Not Chinese: a browser in zh-TW would write the dates in Traditional characters beside a Simplified page.
    const own = lang === 'zh' ? undefined : (navigator.languages ?? [navigator.language]).find((l) => l.toLowerCase().split('-')[0] === lang);
    return own && Intl.DateTimeFormat.supportedLocalesOf(own).length ? own : TAGS[lang];
  } catch {
    return undefined;
  }
})();
