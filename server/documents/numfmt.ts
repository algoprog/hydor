// Spreadsheet numbers shown roughly as their format asks: dates and times (as ISO dates), percentages,
// fixed decimals, thousands separators, currency signs, scientific notation. Not every corner of
// Excel's format language: colours and conditions are dropped, fractions show as decimals.

/** Excel's built-in formats, by id (the locale-dependent ones written the ISO way). */
export const BUILTIN_FORMATS: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy-mm-dd h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;(#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;(#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
  // East Asian date formats.
  27: 'yyyy-mm-dd', 28: 'yyyy-mm-dd', 29: 'yyyy-mm-dd', 30: 'yyyy-mm-dd', 31: 'yyyy-mm-dd', 32: 'h:mm', 33: 'h:mm:ss', 34: 'h:mm', 35: 'h:mm:ss', 36: 'yyyy-mm-dd',
  50: 'yyyy-mm-dd', 51: 'yyyy-mm-dd', 52: 'yyyy-mm-dd', 53: 'yyyy-mm-dd', 54: 'yyyy-mm-dd', 55: 'yyyy-mm-dd', 56: 'yyyy-mm-dd', 57: 'yyyy-mm-dd', 58: 'yyyy-mm-dd',
};

/** The format's sections (positive;negative;zero;text), split outside quotes. */
function sections(code: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') q = !q;
    if (ch === '\\' && !q) {
      cur += ch + (code[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === ';' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** The section's letters that are format codes: quoted text, escapes, colours and conditions taken out. */
const bare = (s: string) =>
  s
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[(?![hms]+\])[^\]]*\]/gi, '')
    .replace(/[_*]./g, '');

export function isDateFormat(code: string | undefined): boolean {
  if (!code || /^general$/i.test(code.trim())) return false;
  return /[dmyhs]/i.test(bare(sections(code)[0]).replace(/E[+-]/gi, ''));
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function dateText(v: number, code: string, date1904: boolean): string {
  const b = bare(sections(code)[0]);
  const elapsed = /\[h+\]/i.test(b);
  const hasTime = /[hs]/i.test(b);
  const hasDate = /[dy]/i.test(b) || (/m/i.test(b) && !hasTime);
  if (elapsed) {
    const secs = Math.round(v * 86400);
    return `${Math.floor(secs / 3600)}:${pad(Math.floor(secs / 60) % 60)}${/s/i.test(b) ? `:${pad(secs % 60)}` : ''}`;
  }
  let serial = date1904 ? v + 1462 : v;
  // Excel counts a 29 February 1900 that never was: dates before it are a day off.
  if (!date1904 && serial < 60) serial += 1;
  const d = new Date(Math.round((serial - 25569) * 86400) * 1000);
  if (Number.isNaN(d.getTime())) return String(v);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${/s/i.test(b) ? `:${pad(d.getUTCSeconds())}` : ''}`;
  return hasDate && hasTime ? `${date} ${time}` : hasTime ? time : date;
}

export function generalNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(12)));
}

function grouped(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A number as its format code shows it, roughly. */
export function formatNumber(v: number, code: string | undefined, date1904 = false): string {
  if (!code || /^general$/i.test(code.trim())) return generalNumber(v);
  if (isDateFormat(code)) return dateText(v, code, date1904);
  const secs = sections(code);
  let sec = secs[0];
  let sign = v < 0 ? '-' : '';
  if (v < 0 && secs[1] !== undefined && secs[1] !== '') {
    sec = secs[1];
    sign = '';
  } else if (v === 0 && secs[2] !== undefined && secs[2] !== '') sec = secs[2];
  const abs = Math.abs(v);
  if (sec.trim() === '@') return generalNumber(v);
  // Currency from [$€-407]; other bracketed parts (colours, conditions, locales) go.
  const s = sec.replace(/\[\$([^\]-]*)(?:-[^\]]*)?\]/g, (_m, sym: string) => (sym ? `"${sym}"` : '')).replace(/\[[^\]]*\]/g, '');
  const firstDigit = s.search(/[0#?]/);
  if (firstDigit < 0) return generalNumber(v);
  let lastDigit = firstDigit;
  for (let i = s.length - 1; i >= 0; i--)
    if (/[0#?]/.test(s[i])) {
      lastDigit = i;
      break;
    }
  const lit = (t: string) => t.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/_./g, ' ').replace(/\*./g, '');
  const prefix = lit(s.slice(0, firstDigit));
  const body = s.slice(firstDigit, lastDigit + 1);
  const after = s.slice(lastDigit + 1);
  // Commas right after the last digit scale by thousands.
  const scale = /^,+/.exec(after)?.[0].length ?? 0;
  const suffix = lit(after.slice(scale));
  let n = abs * 100 ** (s.replace(/"[^"]*"/g, '').match(/%/g)?.length ?? 0);
  if (scale) n /= 1000 ** scale;
  const dec = /\.([0#?]+)/.exec(body)?.[1].length ?? 0;
  let txt: string;
  if (/E[+-]/i.test(body)) txt = n.toExponential(dec).replace('e', 'E');
  else if (/\?\/\?|#\/#/.test(body)) txt = generalNumber(Number(n.toFixed(4)));
  else {
    const [int, frac] = n.toFixed(Math.min(dec, 20)).split('.');
    txt = (/[0#?],[0#?]/.test(body) ? grouped(int) : int) + (frac ? `.${frac}` : '');
    if (/^#/.test(body) && txt === '0' && !body.includes('0')) txt = '';
  }
  return `${sign}${prefix}${txt}${suffix}`.trim();
}
