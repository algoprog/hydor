// The language in use, and the locale dates and times are written in. A page in Chinese or Greek writes its
// dates that way too ("10月31日 14:28", "31 Οκτ, 2:28 μ.μ."), whatever the browser's own language; in English
// the browser's locale keeps its own way of writing them. Changing the language reloads the page.
import { isLang, preferred, type Lang } from '@shared/i18n';

export const KEY = 'naget.lang';

export function currentLang(): Lang {
  const v = localStorage.getItem(KEY);
  return isLang(v) ? v : preferred(navigator.languages ?? [navigator.language]);
}

const TAGS: Partial<Record<Lang, string>> = { zh: 'zh-CN', el: 'el-GR' };

/** For toLocaleString, Intl.DateTimeFormat and the like; undefined (the browser's) in English. */
export const LOCALE: string | undefined = (() => {
  try {
    return TAGS[currentLang()];
  } catch {
    return undefined;
  }
})();
