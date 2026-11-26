// "3 minutes ago", in the language of the page (LOCALE, as dates and times are everywhere).
import { LOCALE } from '../../i18n/locale';

/** How long ago `ts` (ms since 1970) was, as a person says it; "now" within the first minute. */
export function ago(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return '';
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return rtf.format(0, 'second');
  const m = Math.round(s / 60);
  if (m < 60) return rtf.format(-m, 'minute');
  const h = Math.round(m / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  return rtf.format(-Math.round(h / 24), 'day');
}
