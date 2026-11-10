// The terminal's basics for `hydor`: colours (off when piped, with NO_COLOR or --no-color; on with FORCE_COLOR), how
// many columns a string takes (East Asian wide characters and emoji count two, escape codes none), and wrapping text
// by words to a width with its colours carried from line to line.

/** Colours and styles, or nothing at all when they are off: every style is a function of a string. */
export interface Paint {
  on: boolean;
  bold: (s: string) => string;
  dim: (s: string) => string;
  italic: (s: string) => string;
  underline: (s: string) => string;
  inverse: (s: string) => string;
  /** The one accent colour. */
  accent: (s: string) => string;
  red: (s: string) => string;
  green: (s: string) => string;
  /** For what needs you (an approval, a question): the app's warning colour. */
  yellow: (s: string) => string;
}

const sgr = (open: number | string, close: number) => (s: string) => (s ? `\x1b[${open}m${s}\x1b[${close}m` : s);
const plain = (s: string) => s;

/** Styles that write escape codes (on) or leave the text as it is (off). */
export function makePaint(on: boolean): Paint {
  if (!on) return { on, bold: plain, dim: plain, italic: plain, underline: plain, inverse: plain, accent: plain, red: plain, green: plain, yellow: plain };
  return {
    on,
    bold: sgr(1, 22),
    dim: sgr(2, 22),
    italic: sgr(3, 23),
    underline: sgr(4, 24),
    inverse: sgr(7, 27),
    accent: sgr(36, 39),
    red: sgr(31, 39),
    green: sgr(32, 39),
    yellow: sgr(33, 39),
  };
}

/** Whether to colour what goes to this stream: FORCE_COLOR turns colours on, NO_COLOR and --no-color off, a pipe off. */
export function colorWanted(stream: { isTTY?: boolean }, noColor = false, env: NodeJS.ProcessEnv = process.env): boolean {
  if (noColor) return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false') return true;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  return !!stream.isTTY && env.TERM !== 'dumb';
}

// ---- widths ---------------------------------------------------------------------------------------

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** The text without its escape codes. */
export const stripAnsi = (s: string) => s.replace(ANSI, '');

/** Ranges of code points that take two columns: East Asian wide and fullwidth characters, and emoji. */
const WIDE: [number, number][] = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3], [0x25fd, 0x25fe],
  [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be],
  [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa],
  [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728], [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755],
  [0x2757, 0x2757], [0x2795, 0x2797], [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55],
  [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x16fe0, 0x16fe4], [0x17000, 0x18cff],
  [0x1b000, 0x1b2ff], [0x1f004, 0x1f004], [0x1f0cf, 0x1f0cf], [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a], [0x1f200, 0x1f251],
  [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f7e0, 0x1f7eb], [0x1f90c, 0x1f9ff], [0x1fa70, 0x1faff], [0x20000, 0x3fffd],
];

/** Code points that take no column: combining marks, joiners, variation selectors. */
const ZERO: [number, number][] = [
  [0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05bd], [0x0610, 0x061a], [0x064b, 0x065f], [0x0e31, 0x0e31], [0x0e34, 0x0e3a],
  [0x0e47, 0x0e4e], [0x1ab0, 0x1aff], [0x1dc0, 0x1dff], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f], [0xfe20, 0xfe2f], [0xfeff, 0xfeff], [0x1f3fb, 0x1f3ff], [0xe0000, 0xe0fff],
];

const inRanges = (cp: number, r: [number, number][]) => {
  let lo = 0;
  let hi = r.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < r[mid][0]) hi = mid - 1;
    else if (cp > r[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
};

/** How many columns one code point takes: 0, 1 or 2. */
export function codeWidth(cp: number): number {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (cp < 0x300) return 1;
  if (inRanges(cp, ZERO)) return 0;
  return inRanges(cp, WIDE) ? 2 : 1;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The characters as a person sees them (an emoji with its modifiers, a letter with its accents): one each. */
export function graphemes(s: string): string[] {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(s)) return s.split('');
  return Array.from(segmenter.segment(s), (x) => x.segment);
}

/** Columns of one character as a person sees it: an emoji sequence (with a joiner or U+FE0F) takes two. */
export function graphemeWidth(g: string): number {
  const cp = g.codePointAt(0) ?? 0;
  const w = codeWidth(cp);
  if (g.length > 1 && w === 1 && (g.includes('️') || g.includes('‍'))) return 2;
  // Two regional indicators are a flag.
  if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return 2;
  return w;
}

/** How many columns a string takes on screen, escape codes left out. */
export function strWidth(s: string): number {
  const t = s.includes('\x1b') ? stripAnsi(s) : s;
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(t)) return t.length;
  let n = 0;
  for (const g of graphemes(t)) n += graphemeWidth(g);
  return n;
}

// ---- cutting and wrapping -------------------------------------------------------------------------

/** Pieces of a styled string: its escape codes, and its characters with their widths. */
function pieces(s: string): { code?: string; ch?: string; w: number }[] {
  const out: { code?: string; ch?: string; w: number }[] = [];
  let last = 0;
  const push = (text: string) => {
    for (const g of graphemes(text)) out.push({ ch: g, w: graphemeWidth(g) });
  };
  for (const m of s.matchAll(ANSI)) {
    if (m.index! > last) push(s.slice(last, m.index));
    out.push({ code: m[0], w: 0 });
    last = m.index! + m[0].length;
  }
  if (last < s.length) push(s.slice(last));
  return out;
}

/** The styles open at the end of a string (the escape codes since the last reset), to carry onto its next line. */
function openCodes(codes: string[]): string {
  let open: string[] = [];
  for (const c of codes) {
    if (!c.endsWith('m')) continue;
    if (c === '\x1b[0m' || c === '\x1b[m') open = [];
    else if (/^\x1b\[(22|23|24|27|39|49)m$/.test(c)) {
      // A closing code ends the styles it closes.
      const n = c.slice(2, -1);
      const closes: Record<string, RegExp> = { '22': /^\x1b\[[12]m$/, '23': /^\x1b\[3m$/, '24': /^\x1b\[4m$/, '27': /^\x1b\[7m$/, '39': /^\x1b\[(3\d|9\d|38;[\d;]+)m$/, '49': /^\x1b\[(4\d|10\d|48;[\d;]+)m$/ };
      open = open.filter((o) => !closes[n].test(o));
    } else open.push(c);
  }
  return open.join('');
}

/** A string cut to at most `width` columns, with `…` where it was cut; its open styles closed. */
export function truncate(s: string, width: number, ellipsis = '…'): string {
  if (width <= 0) return '';
  if (strWidth(s) <= width) return s;
  const room = width - strWidth(ellipsis);
  let out = '';
  let w = 0;
  let styled = false;
  for (const p of pieces(s)) {
    if (p.code) {
      out += p.code;
      styled = true;
      continue;
    }
    if (w + p.w > room) break;
    out += p.ch;
    w += p.w;
  }
  return out + (styled ? '\x1b[0m' : '') + ellipsis;
}

/** Spaces to pad a string to `width` columns (on the right). */
export const pad = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - strWidth(s)));

/**
 * Text wrapped by words to `width` columns: each line of the text on its own, long words cut where they must be, the
 * styles open at a break closed at its line's end and opened again on the next. `indent` starts the lines after the
 * first (a hanging indent), `first` the first.
 */
export function wrap(text: string, width: number, o: { indent?: string; first?: string } = {}): string[] {
  const first = o.first ?? '';
  const indent = o.indent ?? '';
  const out: string[] = [];
  for (const para of text.split('\n')) wrapLine(para, Math.max(4, width), first, indent, out, out.length === 0);
  return out;
}

function wrapLine(text: string, width: number, first: string, indent: string, out: string[], isFirst: boolean) {
  let prefix = isFirst ? first : indent;
  const codes: string[] = [];
  let line = '';
  let lineW = 0;
  const room = () => Math.max(1, width - strWidth(prefix));
  const flush = () => {
    const open = openCodes(codes);
    out.push(prefix + line.replace(/ +((?:\x1b\[[0-9;]*m)*)$/, '$1') + (open ? '\x1b[0m' : ''));
    prefix = indent;
    line = open;
    lineW = 0;
  };
  // Words with the spaces after them (and the spaces a line starts with, its own indentation).
  const words = text.match(/\S+\s*|\s+/g) ?? [];
  for (const word of words) {
    const bare = word.replace(/\s+$/, '');
    const wW = strWidth(bare);
    if (lineW > 0 && lineW + wW > room()) flush();
    if (wW > room()) {
      // A word longer than a line: cut where it must be.
      for (const p of pieces(word)) {
        if (p.code) {
          line += p.code;
          codes.push(p.code);
          continue;
        }
        if (lineW > 0 && lineW + p.w > room()) {
          if (p.ch === ' ') continue;
          flush();
        }
        line += p.ch;
        lineW += p.w;
      }
      continue;
    }
    for (const m of word.matchAll(ANSI)) codes.push(m[0]);
    line += word;
    lineW += strWidth(word);
  }
  const open = openCodes(codes);
  out.push(prefix + line.replace(/ +((?:\x1b\[[0-9;]*m)*)$/, '$1') + (open ? '\x1b[0m' : ''));
}

// ---- small words ----------------------------------------------------------------------------------

/** "850 ms", "8.1 s", "42 s", "1m 04s", "2h 5m": as the app writes durations. */
export function duration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Whole seconds while something runs: "12 s", "1m 04s". */
export function elapsed(since?: number, now = Date.now()): string {
  if (!since) return '';
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return s < 60 ? `${s} s` : duration(s * 1000);
}

/** "$0.31", "$0.0042", or '' for nothing. */
export const money = (n?: number | null) => (n ? `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}` : '');

/** "17K", "1.2M". */
export function compact(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const a = Math.abs(n);
  const f = (v: number, unit: string) => `${v.toFixed(1).replace(/\.0$/, '')}${unit}`;
  if (a >= 1e9) return f(n / 1e9, 'B');
  if (a >= 1e6) return f(n / 1e6, 'M');
  if (a >= 1e3) return a >= 1e4 ? `${Math.round(n / 1e3)}K` : f(n / 1e3, 'K');
  return String(Math.round(n));
}

/** "just now", "5m", "2h", "3d" ago. */
export function timeAgo(ts?: number | null, now = Date.now()): string {
  if (!ts) return '';
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

/** A folder with the home folder as ~. */
export function tildify(p: string | undefined, home: string): string {
  if (!p) return '';
  return home && (p === home || p.startsWith(home + '/')) ? `~${p.slice(home.length)}` : p;
}

/** Rows of cells as aligned columns (each column as wide as its widest cell), two spaces between. */
export function columns(rows: string[][], gap = '  '): string[] {
  const widths: number[] = [];
  for (const r of rows) r.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, strWidth(c))));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : pad(c, widths[i]))).join(gap).replace(/\s+$/, ''));
}
