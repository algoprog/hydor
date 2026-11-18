// The languages pages are translated into, named in the app's own language ("Deutsch", "German", "Allemand"…).
import { langName } from '@shared/browser';
import { LOCALE } from '../../i18n/locale';

let names: Intl.DisplayNames | null | undefined;

/** A language's name in the app's language (its English name where the browser has none). */
export function langLabel(code: string): string {
  try {
    names ??= new Intl.DisplayNames([LOCALE ?? 'en'], { type: 'language' });
    const n = names.of(code);
    return n && n !== code ? n : langName(code);
  } catch {
    return langName(code);
  }
}

/** A language as a choice: its own name and its name in the app's language ("Deutsch — German"), one name when they are the same. */
export function langChoice(l: { code: string; native: string }): string {
  const here = langLabel(l.code);
  return l.native === here ? here : `${l.native} — ${here}`;
}
