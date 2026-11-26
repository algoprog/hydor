// Small tools the judge and its self-test share: how a page is turned into the words a person reads, how numbers are found in those words, how a name is matched,
// and how a command is run.
import { spawnSync } from 'node:child_process';

// ------------------------------------------------------------------------------------------------ what a person reads

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', pound: '£', euro: '€', eacute: 'é', hellip: '…' };

/** The words of a page as a person reads them: no scripts, styles or tags, entities written out, white space made single. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return NAMED[code.toLowerCase()] ?? whole;
    })
    .replace(/[\s  ]+/g, ' ')
    .trim();
}

/** A text made comparable: no accents, one kind of quote and dash, lower case, single spaces. */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‛′`´]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .toLowerCase()
    .replace(/[\s  ]+/g, ' ')
    .trim();
}

/** Whether a phrase is in a text, ignoring case, accents, the kind of quote or dash and the spaces between a sign and its number ("£ 18"). */
export function hasPhrase(text: string, phrase: string): boolean {
  const t = fold(text);
  const p = fold(phrase);
  if (t.includes(p)) return true;
  const squash = (s: string) => s.replace(/\s+/g, '');
  return squash(t).includes(squash(p));
}

/** A name as it is compared: lower case letters and digits only ("Best before" and "bestBefore" and "best_before" are one). */
export function slug(text: string): string {
  return fold(text).replace(/[^a-z0-9]+/g, '');
}

/** The singular of an English plural, near enough for matching names ("deliveries" and "delivery", "classes" and "class"). */
export function singular(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
  return word;
}

/** Whether two names are the same name, allowing a plural. */
export function sameName(a: string, b: string): boolean {
  const [x, y] = [slug(a), slug(b)];
  return x === y || singular(x) === singular(y);
}

// ------------------------------------------------------------------------------------------------ numbers in a page

export interface Token {
  value: number;
  decimals: number;
}

/** Every number written in a text, with how many decimals it shows: "€1,300.00" is 1300 with 2, "4.050" with a point as thousands is 4050, "16,3" is 16.3. */
export function numberTokens(text: string): Token[] {
  const found: Token[] = [];
  const grouped = /(?<![\d.,])\d{1,3}(?:[,.  ’']\d{3})+(?:[.,]\d+)?(?![\d])|(?<![\d.,])\d+(?:[.,]\d+)?/g;
  for (const match of text.matchAll(grouped)) {
    const raw = match[0].replace(/[  ’']/g, '');
    const seps = [...raw.matchAll(/[.,]/g)].map((m) => m[0]);
    const kinds = new Set(seps);
    let integer = raw;
    let fraction = '';
    if (seps.length > 0) {
      const last = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
      const after = raw.length - last - 1;
      // two kinds of sign: the last is the decimal point. One sign once: three digits after it make it a thousands sign. One sign many times: thousands.
      const decimal = kinds.size === 2 || (seps.length === 1 && after !== 3);
      if (decimal) {
        integer = raw.slice(0, last);
        fraction = raw.slice(last + 1);
      }
    }
    const value = Number.parseFloat(`${integer.replace(/[.,]/g, '')}${fraction ? `.${fraction}` : ''}`);
    if (Number.isFinite(value)) found.push({ value, decimals: fraction.length });
  }
  return found;
}

/** How many numbers in the text are `value`, to the digits they show (`exact`: to the cent, else a number shown rounded counts). */
export function countNumber(tokens: Token[], value: number, exact: boolean): number {
  return tokens.filter((t) => Math.abs(t.value - value) <= (exact ? 0.005 : 0.5 * 10 ** -t.decimals + 1e-9)).length;
}

// ------------------------------------------------------------------------------------------------ commands

export interface Ran {
  status: number | null;
  out: string;
  timedOut: boolean;
}

/** Runs a command at the lowest priority and gives what it said. Nothing is read from a terminal. */
export function run(command: string, args: string[], cwd: string, extra: Record<string, string> = {}, minutes = 12): Ran {
  const r = spawnSync('nice', ['-n', '19', command, ...args], {
    cwd,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false', CUDA_VISIBLE_DEVICES: '', CI: '1', ...extra },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: minutes * 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, timedOut: r.error !== undefined && /ETIMEDOUT/.test(String(r.error)) };
}

export const tail = (text: string, n = 8): string => text.trim().split('\n').slice(-n).join('\n');
