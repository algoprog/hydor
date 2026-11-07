// Mermaid read into a diagram said simply (diagram-spec.ts), so a diagram written in Mermaid, by an agent or a person,
// opens as one that can be edited: flowcharts, mind maps, class, ER, state and sequence diagrams become nodes and edges
// with their words, their kinds of shape, their colours, the containers they are in and the way they are laid out. Most
// are laid out where the page is made (each shape sized to its words, placed by the layout named); a sequence diagram is
// placed here, lifeline by lifeline and message by message, as Mermaid draws it. What a diagram cannot keep (a click's
// script, an icon, an invisible link) is left out, and the notes that come back with the page say so.
import type { ArrowKind, DiagramStyle, RouteKind, ShapeKind } from './diagram.ts';
import { cleanColour } from './diagram.ts';
import type { LayoutKind, SpecEdge, SpecNode, SpecPage } from './diagram-spec.ts';
import { lineHeight, textWidth } from './diagram-text.ts';

const SUPPORTED = 'flowchart, mindmap, class, ER, state and sequence diagrams';
const NOT_MERMAID =
  'This is not a Mermaid diagram: its first line should name its kind (flowchart, mindmap, classDiagram, erDiagram, stateDiagram or sequenceDiagram).';

/** Mermaid as a diagram's spec, with notes on what was left out. Throws when it is not a kind of Mermaid this reads. */
export function mermaidSpec(text: string): { page: SpecPage; notes: string[] } {
  const src = prepare(text);
  const head = readHead(src.lines);
  if (!head) throw new Error(NOT_MERMAID);
  if ('other' in head) throw new Error(`Mermaid ${head.other} diagrams cannot become an editable diagram; supported: ${SUPPORTED}.`);
  if ('bad' in head) throw new Error(`A flowchart runs TD, TB, BT, LR or RL, not ${head.bad}.`);
  const notes = new Notes();
  const after: Line[] = src.lines.slice(head.at + 1).map((t, i) => ({ t, n: head.at + 2 + i }));
  const page =
    head.kind === 'flowchart'
      ? flowchart([head.rest, ...src.lines.slice(head.at + 1)].join('\n'), head.at + 1, head.layout, notes)
      : head.kind === 'mindmap'
        ? mindmap(after, notes)
        : head.kind === 'class'
          ? classDiagram(after, notes)
          : head.kind === 'er'
            ? erDiagram(after, notes)
            : head.kind === 'state'
              ? stateDiagram(after, notes)
              : sequence(after, notes);
  if (!page.name && src.title) page.name = src.title;
  return { page, notes: notes.done() };
}

/** Whether the text is Mermaid of a kind this reads: its first line (after front matter and comments) starts one. */
export function isMermaid(text: string): boolean {
  if (typeof text !== 'string' || !text.trim()) return false;
  const head = readHead(prepare(text).lines);
  return !!head && 'kind' in head;
}

// ---- the text and its first line ----------------------------------------------------------------------------------------

type Kind = 'flowchart' | 'mindmap' | 'class' | 'er' | 'state' | 'sequence';

/** A line of the text, and its number in the text given (from 1), for notes on lines that could not be read. */
interface Line {
  t: string;
  n: number;
}

const KINDS: Record<string, Kind> = {
  flowchart: 'flowchart',
  'flowchart-elk': 'flowchart',
  'flowchart-v2': 'flowchart',
  graph: 'flowchart',
  mindmap: 'mindmap',
  classdiagram: 'class',
  'classdiagram-v2': 'class',
  erdiagram: 'er',
  statediagram: 'state',
  'statediagram-v2': 'state',
  sequencediagram: 'sequence',
};

/** Mermaid's other kinds, which are not shapes joined by lines (charts, timelines, plans). */
const OTHER_KINDS = new Set([
  'gantt',
  'pie',
  'journey',
  'gitgraph',
  'timeline',
  'quadrantchart',
  'requirementdiagram',
  'c4context',
  'c4container',
  'c4component',
  'c4dynamic',
  'c4deployment',
  'sankey',
  'xychart',
  'block',
  'packet',
  'architecture',
  'kanban',
  'radar',
  'zenuml',
  'info',
  'treemap',
]);

/** A flowchart's directions (Mermaid's old arrows too), as layouts. */
const DIRECTIONS: Record<string, LayoutKind> = { TB: 'down', TD: 'down', BT: 'up', LR: 'right', RL: 'left', V: 'down', '^': 'up', '>': 'right', '<': 'left' };

/**
 * The text's lines without what Mermaid ignores, each where it was so a line keeps its number: a fence round it
 * (```mermaid), front matter (--- … ---, whose title is kept), %%{init…}%% directives, %% comments, accTitle and accDescr.
 */
function prepare(text: string): { lines: string[]; title?: string } {
  const lines = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const first = () => lines.findIndex((l) => l.trim() !== '');
  let at = first();
  if (at >= 0 && /^\s*(`{3,}|~{3,})\s*(mermaid)?\s*$/i.test(lines[at])) {
    lines[at] = '';
    for (let i = lines.length - 1; i > at; i--) {
      if (!lines[i].trim()) continue;
      if (/^\s*(`{3,}|~{3,})\s*$/.test(lines[i])) lines[i] = '';
      break;
    }
  }
  let title: string | undefined;
  at = first();
  if (at >= 0 && lines[at].trim() === '---') {
    const close = lines.findIndex((l, i) => i > at && l.trim() === '---');
    if (close > at)
      for (let i = at; i <= close; i++) {
        const m = /^title\s*:\s*(.*)$/.exec(lines[i]);
        if (m && title === undefined) title = label(unquote(m[1]));
        lines[i] = '';
      }
  }
  const out = lines
    .join('\n')
    .replace(/%%\{[\s\S]*?\}%%/g, (d) => d.replace(/[^\n]/g, ''))
    .split('\n');
  let inDescr = false;
  for (let i = 0; i < out.length; i++) {
    const t = out[i].trim();
    if (inDescr) {
      if (t.includes('}')) inDescr = false;
      out[i] = '';
    } else if (t.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(t)) out[i] = '';
    else if (/^accDescr\s*\{/.test(t)) {
      inDescr = !t.includes('}');
      out[i] = '';
    } else out[i] = cutComment(out[i]);
  }
  return title ? { lines: out, title } : { lines: out };
}

/** A line without a %% comment at its end (one inside quotes stays). */
function cutComment(l: string): string {
  let quoted = false;
  for (let i = 0; i < l.length - 1; i++) {
    if (l[i] === '"') quoted = !quoted;
    else if (!quoted && l[i] === '%' && l[i + 1] === '%') return l.slice(0, i).trimEnd();
  }
  return l;
}

interface Head {
  kind: Kind;
  /** The index of its line. */
  at: number;
  /** What follows on its line: a flowchart's first statements, after a semicolon. */
  rest: string;
  layout: LayoutKind;
}

/** The diagram's first line: the kind it names (or the other kind of Mermaid it is), where it is and what follows it. */
function readHead(lines: string[]): Head | { other: string } | { bad: string } | null {
  const at = lines.findIndex((l) => l.trim() !== '');
  if (at < 0) return null;
  const m = /^\s*([A-Za-z][\w-]*)(.*)$/.exec(lines[at]);
  if (!m) return null;
  const kind = KINDS[m[1].toLowerCase()];
  if (!kind) {
    const word = m[1].replace(/-beta$/i, '');
    return OTHER_KINDS.has(word.toLowerCase()) ? { other: word } : null;
  }
  if (kind !== 'flowchart') return /^\s*;?\s*$/.test(m[2]) ? { kind, at, rest: '', layout: 'down' } : null;
  const d = /^\s*(TB|TD|BT|RL|LR|[<>^v])?\s*(?:;([\s\S]*))?$/i.exec(m[2]);
  if (d) return { kind, at, rest: d[2] ?? '', layout: DIRECTIONS[(d[1] ?? 'TD').toUpperCase()] };
  const w = /^\s*([A-Z]{2})\b/.exec(m[2]);
  return w ? { bad: w[1] } : null;
}

// ---- notes, ids, words --------------------------------------------------------------------------------------------------

/** What was left out, each said once. */
class Notes {
  private list: string[] = [];
  private unread = 0;
  add(s: string): void {
    if (!this.list.includes(s)) this.list.push(s);
  }
  /** A line that could not be read: the first few said with their words, the others counted. */
  skip(l: Line): void {
    const t = l.t.trim();
    if (++this.unread <= 8) this.add(`line ${l.n} could not be read: ${JSON.stringify(t.length > 60 ? `${t.slice(0, 57)}…` : t)}`);
  }
  done(): string[] {
    if (this.unread > 8) this.add(`${this.unread - 8} more lines could not be read`);
    return this.list;
  }
}

const ID_OK = /^[\w.:-]{1,64}$/;

/** Ids as a diagram keeps them: Mermaid's own names where a diagram can keep them, others made up and starting "__". */
class Ids {
  private used = new Set<string>();
  private map = new Map<string, string>();
  /** The id for one of Mermaid's names: the name itself, unless a diagram cannot keep it or it is taken. */
  of(name: string): string {
    let id = this.map.get(name);
    if (id === undefined) {
      id = ID_OK.test(name) && !this.used.has(name) ? name : this.fresh(name);
      this.map.set(name, id);
      this.used.add(id);
    }
    return id;
  }
  /** A name as its own id when it can be one and is free, for things whose names need not be one of a kind (a mind map's). */
  claim(name: string): string | undefined {
    if (!ID_OK.test(name) || this.used.has(name)) return undefined;
    this.used.add(name);
    return name;
  }
  /** A new id, "__" and the word given (as much of it as an id may hold), with a number when that is taken. */
  fresh(base: string): string {
    const b = `__${base.replace(/[^\w.:-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'node'}`;
    let id = b;
    for (let k = 2; this.used.has(id); k++) id = `${b}${k}`;
    this.used.add(id);
    return id;
  }
}

/** The words of a diagram, as the sequence diagram's sizes are measured. */
const FONT = { size: 14 };
/** The widest of some words' lines, in pixels. */
const widest = (t: string) => t.split('\n').reduce((m, l) => Math.max(m, textWidth(l, FONT)), 0);
const even = (v: number) => Math.ceil(v / 2) * 2;
const lineCount = (t: string) => (t ? t.split('\n').length : 1);

/** A circle's size for its words: as wide as they are and as tall, with room round them. */
const roundSize = (text: string) => Math.ceil(Math.max(80, widest(text) + 30, lineCount(text) * lineHeight(FONT.size) + 30));

const unquote = (s: string) => {
  const t = s.trim();
  return t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0] ? t.slice(1, -1).replace(/\\(["'\\])/g, '$1') : t;
};

const ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: '\u00a0',
  semi: ';',
  colon: ':',
  num: '#',
  lpar: '(',
  rpar: ')',
  lsqb: '[',
  rsqb: ']',
  lbrace: '{',
  rbrace: '}',
  vert: '|',
  excl: '!',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  deg: '°',
  times: '×',
  divide: '÷',
  plusmn: '±',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  hearts: '♥',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  check: '✓',
  infin: '∞',
  ne: '≠',
  le: '≤',
  ge: '≥',
};

/** Mermaid's entity codes (#quot;, #35;, #9829;) and HTML's (&amp;, &#39;, &#x2192;), as the characters they stand for. */
function decode(s: string): string {
  return s.replace(/#(\w+);|&(#x[0-9a-f]+|#\d+|[a-z]\w*);/gi, (m: string, own: string | undefined, html: string | undefined) => {
    const k = own ?? html ?? '';
    const code = /^#?\d+$/.test(k) ? Number(k.replace('#', '')) : /^#x[0-9a-f]+$/i.test(k) ? parseInt(k.slice(2), 16) : NaN;
    if (Number.isFinite(code)) return code > 31 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : m;
    return ENTITIES[k] ?? ENTITIES[k.toLowerCase()] ?? m;
  });
}

/** A Markdown string's words without their marks (**bold**, __bold__, *italic*, _italic_). */
const unmark = (s: string) =>
  s
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/(^|[^\w*])\*(\S(?:[\s\S]*?\S)?)\*(?![\w*])/g, '$1$2')
    .replace(/(^|\W)_(\S(?:[\s\S]*?\S)?)_(?!\w)/g, '$1$2');

/**
 * Words as Mermaid writes them, as plain words: quotes and a Markdown string's marks taken off, <br> and \n as new lines,
 * other HTML tags left out, entity codes as their characters.
 */
function label(raw: string): string {
  let s = raw.trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') s = s.slice(1, -1);
  let md = false;
  if (s.length >= 2 && s[0] === '`' && s[s.length - 1] === '`') {
    s = s.slice(1, -1);
    md = true;
  }
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/<\/?[a-z][^<>]*>/gi, '');
  if (md) s = unmark(s);
  return decode(s)
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/** An edge's arrowheads in a spec's terms: none said when it is the usual arrow at its end. */
function heads(start: ArrowKind, end: ArrowKind): Pick<SpecEdge, 'arrow' | 'start' | 'end'> {
  if (start === 'none' && end === 'arrow') return {};
  if (start === 'none' && end === 'none') return { arrow: 'none' };
  return { start, end };
}

/** A string split at any of `seps` outside round brackets. */
function splitOutside(s: string, seps: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (!depth && seps.includes(ch)) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** A string split at `sep` outside quotes. */
function splitQuoted(s: string, sep: string): string[] {
  const out: string[] = [];
  let quoted = false;
  let cur = '';
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Where the } closing the { at `i` is (quoted words may hold one); -1 when none does. */
function closeBrace(s: string, i: number): number {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const ch = s[k];
    if (ch === '"') {
      const q = s.indexOf('"', k + 1);
      if (q < 0) return -1;
      k = q;
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return k;
  }
  return -1;
}

/** Mermaid 11's data for a shape or a participant, @{ shape: …, label: "…" }: its keys (in lower case) and values. */
function readProps(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/["']?([\w-]+)["']?\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,\n}]*)/g)) out[m[1].toLowerCase()] = unquote(m[2]);
  return out;
}

/** Lines holding a quoted string that runs on (a Markdown string may) joined with the lines it runs over. */
function joinQuoted(lines: Line[]): Line[] {
  const odd = (t: string) => (t.match(/"/g) ?? []).length % 2 === 1;
  const out: Line[] = [];
  for (let i = 0; i < lines.length; i++) {
    let t = lines[i].t;
    if (odd(t)) {
      let j = i + 1;
      while (j < lines.length && !odd(lines[j].t)) j++;
      if (j < lines.length) {
        t = [t, ...lines.slice(i + 1, j + 1).map((l) => l.t)].join('\n');
        out.push({ t, n: lines[i].n });
        i = j;
        continue;
      }
    }
    out.push({ t, n: lines[i].n });
  }
  return out;
}

// ---- looks: style, classDef, class ----------------------------------------------------------------------------------------

/** A look as Mermaid's styles say it (fill:#f9f,stroke:#333,stroke-width:4px…), in a diagram's terms. */
interface Look {
  fill?: string;
  stroke?: string;
  color?: string;
  width?: number;
  dash?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  opacity?: number;
}

/** CSS's colour names that Mermaid's styles use most. */
const CSS_COLOURS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  grey: '#808080',
  gray: '#808080',
  brown: '#a52a2a',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  lime: '#00ff00',
  navy: '#000080',
  teal: '#008080',
  olive: '#808000',
  maroon: '#800000',
  silver: '#c0c0c0',
  gold: '#ffd700',
  indigo: '#4b0082',
  violet: '#ee82ee',
  coral: '#ff7f50',
  salmon: '#fa8072',
  tomato: '#ff6347',
  crimson: '#dc143c',
  khaki: '#f0e68c',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  lavender: '#e6e6fa',
  tan: '#d2b48c',
  wheat: '#f5deb3',
  orchid: '#da70d6',
  plum: '#dda0dd',
  turquoise: '#40e0d0',
  skyblue: '#87ceeb',
  steelblue: '#4682b4',
  royalblue: '#4169e1',
  dodgerblue: '#1e90ff',
  cornflowerblue: '#6495ed',
  cadetblue: '#5f9ea0',
  midnightblue: '#191970',
  slateblue: '#6a5acd',
  lightblue: '#add8e6',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightgray: '#d3d3d3',
  lightyellow: '#ffffe0',
  lightpink: '#ffb6c1',
  lightcoral: '#f08080',
  lightsalmon: '#ffa07a',
  lightcyan: '#e0ffff',
  lightsteelblue: '#b0c4de',
  darkblue: '#00008b',
  darkgreen: '#006400',
  darkred: '#8b0000',
  darkorange: '#ff8c00',
  darkgrey: '#a9a9a9',
  darkgray: '#a9a9a9',
  darkviolet: '#9400d3',
  darkcyan: '#008b8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  dimgray: '#696969',
  dimgrey: '#696969',
  slategray: '#708090',
  slategrey: '#708090',
  gainsboro: '#dcdcdc',
  whitesmoke: '#f5f5f5',
  honeydew: '#f0fff0',
  mintcream: '#f5fffa',
  azure: '#f0ffff',
  aliceblue: '#f0f8ff',
  mistyrose: '#ffe4e1',
  lemonchiffon: '#fffacd',
  palegreen: '#98fb98',
  palegoldenrod: '#eee8aa',
  powderblue: '#b0e0e6',
  seagreen: '#2e8b57',
  forestgreen: '#228b22',
  limegreen: '#32cd32',
  springgreen: '#00ff7f',
  chartreuse: '#7fff00',
  hotpink: '#ff69b4',
  deeppink: '#ff1493',
  firebrick: '#b22222',
  chocolate: '#d2691e',
  sienna: '#a0522d',
  peru: '#cd853f',
  goldenrod: '#daa520',
  mediumpurple: '#9370db',
  rebeccapurple: '#663399',
  thistle: '#d8bfd8',
  linen: '#faf0e6',
  snow: '#fffafa',
  seashell: '#fff5ee',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  moccasin: '#ffe4b5',
  bisque: '#ffe4c4',
  cornsilk: '#fff8dc',
  antiquewhite: '#faebd7',
  ghostwhite: '#f8f8ff',
};

/** An hsl() colour as #rrggbb. */
function hsl(h: number, s: number, l: number): string {
  const sat = Math.min(1, s / 100);
  const lig = Math.min(1, l / 100);
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** A CSS colour as a diagram keeps it (#rrggbb, or none); undefined when it is no colour. */
function colour(v: string): string | undefined {
  const s = v.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return 'none';
  if (CSS_COLOURS[s]) return CSS_COLOURS[s];
  const h = /^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(s);
  if (h) return hsl(((Number(h[1]) % 360) + 360) % 360, Number(h[2]), Number(h[3]));
  return cleanColour(/^#[0-9a-f]{4}$/.test(s) ? s.slice(0, 4) : s);
}

/** Mermaid's CSS for a shape or a link, read. */
function readLook(css: string): Look {
  const look: Look = {};
  for (const part of splitOutside(css.trim(), ',;')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part
      .slice(i + 1)
      .trim()
      .replace(/\s*!important$/i, '');
    const n = parseFloat(v);
    if (k === 'fill' || k === 'background' || k === 'background-color') look.fill = colour(v) ?? look.fill;
    else if (k === 'stroke' || k === 'border-color') look.stroke = colour(v) ?? look.stroke;
    else if (k === 'color') look.color = colour(v) ?? look.color;
    else if (k === 'stroke-width' && Number.isFinite(n)) look.width = n;
    else if (k === 'stroke-dasharray') look.dash = !/^(0|none)?$/i.test(v);
    else if (k === 'font-weight') look.bold = /^bold/i.test(v) || n >= 600;
    else if (k === 'font-style') look.italic = /^(italic|oblique)/i.test(v);
    else if (k === 'text-decoration') look.underline = /underline/i.test(v);
    else if (k === 'font-size' && n > 0) look.size = Math.round((/pt$/i.test(v) ? (n * 4) / 3 : /r?em$/i.test(v) ? n * FONT.size : n) * 100) / 100;
    else if (k === 'opacity' && Number.isFinite(n)) look.opacity = Math.round(Math.min(100, Math.max(0, n <= 1 ? n * 100 : n)));
  }
  return look;
}

/** A shape's look put on its node. */
function lookNode(nd: SpecNode, l: Look | undefined): void {
  if (!l) return;
  if (l.fill) nd.fill = l.fill;
  if (l.stroke) nd.stroke = l.stroke;
  if (l.color && l.color !== 'none') nd.textColor = l.color;
  const st: DiagramStyle = { ...nd.style };
  if (l.width !== undefined) st.width = l.width;
  if (l.dash) st.dash = 'dashed';
  if (l.bold) st.bold = true;
  if (l.italic) st.italic = true;
  if (l.underline) st.underline = true;
  if (l.size) st.size = l.size;
  if (l.opacity !== undefined) st.opacity = l.opacity;
  if (Object.keys(st).length) nd.style = st;
}

/** A link's look (linkStyle) put on its edge: its line's colour and width, dashes, its words' colour. */
function lookEdge(e: SpecEdge, l: Look): void {
  if (l.stroke && l.stroke !== 'none') e.color = l.stroke;
  if (l.width !== undefined) e.width = l.width;
  if (l.dash) e.dashed = true;
  const st: DiagramStyle = { ...e.style };
  if (l.color && l.color !== 'none') st.color = l.color;
  if (l.bold) st.bold = true;
  if (l.italic) st.italic = true;
  if (l.size) st.size = l.size;
  if (l.opacity !== undefined) st.opacity = l.opacity;
  if (Object.keys(st).length) e.style = st;
}

/** Mermaid's ways of giving shapes a look: classDef and class (or cssClass, or name:::class), and style. */
class Styles {
  private defs = new Map<string, Look>();
  private classes = new Map<string, string[]>();
  private own = new Map<string, Look>();

  /** Reads a classDef, cssClass, style or (where `classLines`: not in a class diagram) class line; false when it is none. */
  read(t: string, classLines: boolean): boolean {
    let m = /^classDef\s+(\S+)\s+([\s\S]+)$/.exec(t);
    if (m) {
      const look = readLook(m[2]);
      for (const name of m[1].split(',')) if (name) this.defs.set(name, { ...this.defs.get(name), ...look });
      return true;
    }
    m = /^cssClass\s+"([^"]*)"\s+([\w-]+)\s*;?$/.exec(t);
    if (m) {
      this.add(m[1].split(','), [m[2]]);
      return true;
    }
    if (classLines && (m = /^class\s+([\s\S]+)$/.exec(t))) {
      const words = m[1].trim().replace(/;$/, '').split(/\s+/);
      if (words.length < 2) return false;
      const cls = words.pop() ?? '';
      this.add(words.join('').split(','), cls.split(','));
      return true;
    }
    m = /^style\s+(\S+)\s+([\s\S]+)$/.exec(t);
    if (m) {
      const look = readLook(m[2]);
      for (const id of m[1].split(',')) if (id) this.own.set(id, { ...this.own.get(id), ...look });
      return true;
    }
    return false;
  }

  /** Classes given to shapes by their Mermaid names. */
  add(names: string[], classes: string[]): void {
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const list = this.classes.get(name) ?? [];
      for (const c of classes) if (c.trim() && !list.includes(c.trim())) list.push(c.trim());
      this.classes.set(name, list);
    }
  }

  /** A shape's look: the default class's (when it has no class of its own and `useDefault`), its classes', its own style's. */
  look(name: string, useDefault: boolean): Look | undefined {
    const cls = this.classes.get(name) ?? [];
    const l: Look = {};
    if (!cls.length && useDefault) Object.assign(l, this.defs.get('default'));
    for (const c of cls) Object.assign(l, this.defs.get(c));
    Object.assign(l, this.own.get(name));
    return Object.keys(l).length ? l : undefined;
  }
}

// ---- flowcharts -----------------------------------------------------------------------------------------------------------

/** A node as a statement names it: its name, and its brackets or shape data and classes when it has them. */
interface FlowRef {
  name: string;
  /** Its words as written in its brackets (quotes and all). */
  text?: string;
  shape?: ShapeKind;
  round?: boolean;
  data?: Record<string, string>;
  classes: string[];
}

interface FlowNode {
  name: string;
  text: string;
  shape: ShapeKind;
  /** A circle: as wide as it is tall. */
  round?: boolean;
  container?: boolean;
  /** The subgraph it is in. */
  parent?: string;
}

interface FlowLink {
  line: 'solid' | 'dotted' | 'thick' | 'invisible';
  start: ArrowKind;
  end: ArrowKind;
  text?: string;
  /** Its Mermaid 11 id (e1@-->), for data given it later. */
  id?: string;
}

/** A flowchart node's brackets, longest first: what opens them, what may close them and the kind of shape each makes. */
const FLOW_SHAPES: { open: string; close: [string, ShapeKind][]; round?: boolean }[] = [
  { open: '(((', close: [[')))', 'event-mid']] },
  { open: '((', close: [['))', 'ellipse']], round: true },
  { open: '([', close: [['])', 'terminator']] },
  { open: '(-', close: [['-)', 'ellipse']] },
  { open: '(', close: [[')', 'rounded']] },
  { open: '[[', close: [[']]', 'predefined']] },
  { open: '[(', close: [[')]', 'cylinder']] },
  {
    open: '[/',
    close: [
      ['/]', 'parallelogram'],
      ['\\]', 'trapezoid'],
    ],
  },
  {
    open: '[\\',
    close: [
      ['\\]', 'parallelogram'],
      ['/]', 'manual-operation'],
    ],
  },
  { open: '[', close: [[']', 'rect']] },
  { open: '{{', close: [['}}', 'hexagon']] },
  { open: '{', close: [['}', 'diamond']] },
  { open: '>', close: [[']', 'step']] },
];

/** Mermaid 11's shape names (A@{ shape: … }), as kinds of shape ("circle": an ellipse as wide as it is tall). */
const NAMED_SHAPES: Record<string, ShapeKind | 'circle'> = {
  rect: 'rect',
  rectangle: 'rect',
  proc: 'rect',
  process: 'rect',
  'lin-rect': 'rect',
  'lined-rectangle': 'rect',
  'lin-proc': 'rect',
  'lined-process': 'rect',
  'shaded-process': 'rect',
  'tag-rect': 'rect',
  'tagged-rectangle': 'rect',
  'tag-proc': 'rect',
  'tagged-process': 'rect',
  'st-rect': 'rect',
  'stacked-rectangle': 'rect',
  procs: 'rect',
  processes: 'rect',
  rounded: 'rounded',
  event: 'rounded',
  stadium: 'terminator',
  pill: 'terminator',
  terminal: 'terminator',
  subproc: 'predefined',
  subroutine: 'predefined',
  subprocess: 'predefined',
  'fr-rect': 'predefined',
  'framed-rectangle': 'predefined',
  cyl: 'cylinder',
  cylinder: 'cylinder',
  db: 'cylinder',
  database: 'cylinder',
  das: 'cylinder',
  'h-cyl': 'cylinder',
  'horizontal-cylinder': 'cylinder',
  'lin-cyl': 'cylinder',
  'lined-cylinder': 'cylinder',
  disk: 'cylinder',
  circle: 'circle',
  circ: 'circle',
  'dbl-circ': 'event-mid',
  'double-circle': 'event-mid',
  diam: 'diamond',
  diamond: 'diamond',
  decision: 'diamond',
  question: 'diamond',
  hex: 'hexagon',
  hexagon: 'hexagon',
  prepare: 'hexagon',
  'lean-r': 'parallelogram',
  'lean-right': 'parallelogram',
  'in-out': 'parallelogram',
  'lean-l': 'parallelogram',
  'lean-left': 'parallelogram',
  'out-in': 'parallelogram',
  'trap-b': 'trapezoid',
  'trapezoid-bottom': 'trapezoid',
  trapezoid: 'trapezoid',
  priority: 'trapezoid',
  'trap-t': 'manual-operation',
  'trapezoid-top': 'manual-operation',
  'inv-trapezoid': 'manual-operation',
  manual: 'manual-operation',
  doc: 'document',
  document: 'document',
  'lin-doc': 'document',
  'lined-document': 'document',
  'tag-doc': 'document',
  'tagged-document': 'document',
  docs: 'multi-document',
  documents: 'multi-document',
  'st-doc': 'multi-document',
  'stacked-document': 'multi-document',
  delay: 'delay',
  'half-rounded-rectangle': 'delay',
  'notch-rect': 'card',
  'notched-rectangle': 'card',
  card: 'card',
  'bow-rect': 'stored-data',
  'bow-tie-rectangle': 'stored-data',
  'stored-data': 'stored-data',
  tri: 'extract',
  triangle: 'extract',
  extract: 'extract',
  'flip-tri': 'merge',
  'flipped-triangle': 'merge',
  merge: 'merge',
  'sm-circ': 'initial',
  'small-circle': 'initial',
  start: 'initial',
  'fr-circ': 'final',
  'framed-circle': 'final',
  stop: 'final',
  'f-circ': 'connector',
  'filled-circle': 'connector',
  junction: 'connector',
  'cross-circ': 'summing',
  'crossed-circle': 'summing',
  summary: 'summing',
  hourglass: 'collate',
  collate: 'collate',
  brace: 'annotation',
  'brace-l': 'annotation',
  'brace-r': 'annotation',
  braces: 'annotation',
  comment: 'annotation',
  flag: 'punched-tape',
  'paper-tape': 'punched-tape',
  'notch-pent': 'loop-limit',
  'notched-pentagon': 'loop-limit',
  'loop-limit': 'loop-limit',
  'curv-trap': 'display',
  'curved-trapezoid': 'display',
  display: 'display',
  'sl-rect': 'manual-input',
  'sloped-rectangle': 'manual-input',
  'manual-input': 'manual-input',
  'div-rect': 'internal-storage',
  'div-proc': 'internal-storage',
  'divided-rectangle': 'internal-storage',
  'divided-process': 'internal-storage',
  'win-pane': 'internal-storage',
  'window-pane': 'internal-storage',
  'internal-storage': 'internal-storage',
  text: 'text',
  odd: 'step',
  fork: 'bar',
  join: 'bar',
  cloud: 'cloud',
  bang: 'cloud',
};
/** Mermaid 11's shapes a diagram draws as a rectangle. */
const RECT_LIKE = new Set(['bolt', 'com-link', 'lightning-bolt']);
/** Kinds that show no words of their own (a start's dot, a junction, a fork's bar). */
const WORDLESS = new Set<ShapeKind>(['initial', 'final', 'connector', 'summing', 'bar']);

/** Linking curves (linkStyle … interpolate, e1@{ curve: … }) as the ways a connector runs. */
const CURVES: Record<string, RouteKind> = {
  basis: 'curved',
  bumpx: 'curved',
  bumpy: 'curved',
  cardinal: 'curved',
  catmullrom: 'curved',
  monotonex: 'curved',
  monotoney: 'curved',
  natural: 'curved',
  linear: 'straight',
  step: 'orthogonal',
  stepafter: 'orthogonal',
  stepbefore: 'orthogonal',
};

/**
 * A flowchart's statements and the lines they start on: apart at line ends and semicolons, but not inside a quoted string
 * (which may run over lines), a node's brackets, an edge's |words|, an entity code (#59;) or a shape's @{…}.
 */
function flowStatements(text: string, line: number): Line[] {
  const out: Line[] = [];
  let cur = '';
  let start = line;
  let depth = 0;
  let bar = false;
  const push = () => {
    if (cur.trim()) out.push({ t: cur.trim(), n: start });
    cur = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || (ch === '@' && text[i + 1] === '{')) {
      const close = ch === '"' ? text.indexOf('"', i + 1) : closeBrace(text, i + 1);
      if (close > 0) {
        const s = text.slice(i, close + 1);
        if (!cur.trim()) start = line;
        cur += s;
        line += s.split('\n').length - 1;
        i = close;
        continue;
      }
    }
    if (ch === '#') {
      const m = /^#\w+;/.exec(text.slice(i, i + 40));
      if (m) {
        cur += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    if (ch === '\n') {
      push();
      line++;
      start = line;
      depth = 0;
      bar = false;
      continue;
    }
    if (ch === ';' && !depth && !bar) {
      push();
      start = line;
      continue;
    }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === '|' && !depth) bar = !bar;
    cur += ch;
  }
  push();
  return out;
}

/** A place in a statement being read. */
class Cursor {
  i = 0;
  constructor(readonly s: string) {}
  ws(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  done(): boolean {
    return this.i >= this.s.length;
  }
  /** What a sticky pattern matches here, moving past it. */
  eat(re: RegExp): RegExpExecArray | null {
    re.lastIndex = this.i;
    const m = re.exec(this.s);
    if (m) this.i = re.lastIndex;
    return m;
  }
}

/** A node's name: letters, digits and a few signs (a dash, dot or = only inside it, so arrows stay arrows). */
const FLOW_ID = /[\w\u00a0-\uffff](?:[\w\u00a0-\uffff$!?'*+/\\]|[-.=](?=[\w\u00a0-\uffff]))*/y;
const FLOW_CLASS = /:::([\w-]+)/y;

/** A node's brackets at `p`: where they end, the words in them and the shape they make; null when there are none. */
function readShape(s: string, p: number): { end: number; text: string; shape: ShapeKind; round?: boolean } | null {
  for (const sh of FLOW_SHAPES) {
    if (!s.startsWith(sh.open, p)) continue;
    const from = p + sh.open.length;
    // Words in quotes may hold brackets of their own.
    const q = /\s*"/y;
    q.lastIndex = from;
    if (q.exec(s)) {
      const open = q.lastIndex - 1;
      const close = s.indexOf('"', open + 1);
      if (close > 0) {
        const after = close + 1 + (/^\s*/.exec(s.slice(close + 1))?.[0].length ?? 0);
        for (const [c, kind] of sh.close) if (s.startsWith(c, after)) return { end: after + c.length, text: s.slice(open, close + 1), shape: kind, round: sh.round };
      }
    }
    // Otherwise up to the nearest of its closing brackets.
    let best: { at: number; c: string; kind: ShapeKind } | null = null;
    for (const [c, kind] of sh.close) {
      const at = s.indexOf(c, from);
      if (at >= 0 && (!best || at < best.at)) best = { at, c, kind };
    }
    if (best) return { end: best.at + best.c.length, text: s.slice(from, best.at), shape: best.kind, round: sh.round };
  }
  return null;
}

/** A node as a statement names it: A, A[words], A@{ shape: … }, A:::class. */
function readRef(c: Cursor): FlowRef | null {
  const m = c.eat(FLOW_ID);
  if (!m) return null;
  const ref: FlowRef = { name: m[0], classes: [] };
  if (c.s.startsWith('@{', c.i)) {
    const close = closeBrace(c.s, c.i + 1);
    if (close > 0) {
      ref.data = readProps(c.s.slice(c.i + 2, close));
      c.i = close + 1;
    }
  } else {
    // Its brackets: right after its name (or after spaces, as some write them).
    const save = c.i;
    c.ws();
    const ch = c.s[c.i] ?? '';
    const sh = (ch && '[({'.includes(ch)) || (ch === '>' && c.i === save) ? readShape(c.s, c.i) : null;
    if (sh) {
      ref.text = sh.text;
      ref.shape = sh.shape;
      ref.round = sh.round;
      c.i = sh.end;
    } else c.i = save;
  }
  let k: RegExpExecArray | null;
  while ((k = c.eat(FLOW_CLASS))) ref.classes.push(k[1]);
  return ref;
}

/** Nodes joined by &: A & B. */
function readGroup(c: Cursor): FlowRef[] | null {
  const first = readRef(c);
  if (!first) return null;
  const out = [first];
  for (;;) {
    const save = c.i;
    c.ws();
    if (c.s[c.i] !== '&') {
      c.i = save;
      return out;
    }
    c.i++;
    c.ws();
    const next = readRef(c);
    if (!next) {
      c.i = save;
      return out;
    }
    out.push(next);
  }
}

const LINK_ID = /[A-Za-z_][\w-]*@(?=[-=.~<ox])/y;
const LINK_INVISIBLE = /~{3,}/y;
const LINK_SOLID = /([xo<])?(-{2,})([->ox])/y;
const LINK_THICK = /([xo<])?(={2,})([=>ox])/y;
const LINK_DOTTED = /([xo<])?-?\.+-([>ox])?/y;
/** Links with their words on the line (A -- words --> B): how they open, how they close, and their line. */
const TEXT_LINKS: [RegExp, RegExp, FlowLink['line']][] = [
  [/([xo<])?--(?![->])/y, /-{2,}([->ox])/g, 'solid'],
  [/([xo<])?==(?![=>])/y, /={2,}([=>ox])/g, 'thick'],
  [/([xo<])?-\./y, /\.+-([>ox])?/g, 'dotted'],
];
const FLOW_HEADS: Record<string, ArrowKind> = { '>': 'arrow', '<': 'arrow', o: 'circle', x: 'cross' };
const headOf = (c: string | undefined): ArrowKind => (c && FLOW_HEADS[c]) || 'none';

/** Where the bar closing an edge's |words| is (quoted words may hold one); -1 when none does. */
function closeBar(s: string, from: number): number {
  let k = from;
  while (k < s.length && /\s/.test(s[k])) k++;
  if (s[k] === '"') {
    const q = s.indexOf('"', k + 1);
    if (q > 0) k = q + 1;
  }
  return s.indexOf('|', k);
}

/** A link: -->, ---, -.->, ==>, --o, --x, <-->, ~~~ and longer ones, with words between bars or on the line. */
function readLink(c: Cursor): FlowLink | null {
  const save = c.i;
  c.ws();
  const named = c.eat(LINK_ID);
  let link: FlowLink | null = null;
  let m: RegExpExecArray | null;
  if (c.eat(LINK_INVISIBLE)) link = { line: 'invisible', start: 'none', end: 'none' };
  else if ((m = c.eat(LINK_SOLID))) link = { line: 'solid', start: headOf(m[1]), end: headOf(m[3]) };
  else if ((m = c.eat(LINK_THICK))) link = { line: 'thick', start: headOf(m[1]), end: headOf(m[3]) };
  else if ((m = c.eat(LINK_DOTTED))) link = { line: 'dotted', start: headOf(m[1]), end: headOf(m[2]) };
  else
    for (const [open, close, line] of TEXT_LINKS) {
      const o = c.eat(open);
      if (!o) continue;
      // Its close comes after its words (words in quotes may hold dashes of their own).
      const q = /\s*"/y;
      q.lastIndex = c.i;
      const quote = q.exec(c.s) ? c.s.indexOf('"', q.lastIndex) : -1;
      close.lastIndex = quote > 0 ? quote + 1 : c.i;
      const k = close.exec(c.s);
      if (k) {
        link = { line, start: headOf(o[1]), end: headOf(k[1]), text: label(c.s.slice(c.i, k.index)) };
        c.i = close.lastIndex;
      }
      break;
    }
  if (!link) {
    c.i = save;
    return null;
  }
  if (named) link.id = named[0].slice(0, -1);
  const after = c.i;
  c.ws();
  if (c.s[c.i] === '|') {
    const end = closeBar(c.s, c.i + 1);
    if (end > 0) {
      link.text = label(c.s.slice(c.i + 1, end));
      c.i = end + 1;
      return link;
    }
  }
  c.i = after;
  return link;
}

function flowchart(text: string, firstLine: number, layout0: LayoutKind, notes: Notes): SpecPage {
  const nodes = new Map<string, FlowNode>();
  const containers: string[] = [];
  const open: { name: string; mentions: Set<string> }[] = [];
  // Every link in order, an invisible one as null: linkStyle's numbers count them all.
  const links: (SpecEdge | null)[] = [];
  const named = new Map<string, SpecEdge>();
  const linkStyles: { all: boolean; at: number[]; look: Look; route?: RouteKind }[] = [];
  const styles = new Styles();
  let layout = layout0;
  let subs = 0;

  // A node by its name, made when first named; named inside a subgraph, it is one that subgraph holds.
  const node = (name: string): FlowNode => {
    let n = nodes.get(name);
    if (!n) {
      n = { name, text: name, shape: 'rect' };
      nodes.set(name, n);
    }
    open[open.length - 1]?.mentions.add(name);
    return n;
  };

  // A node as a statement names it: its brackets or shape data say its words and shape (the last that says wins).
  const touch = (r: FlowRef) => {
    const n = node(r.name);
    if (!n.container) {
      if (r.shape) {
        n.shape = r.shape;
        n.round = r.round;
        n.text = label(r.text ?? '');
      }
      if (r.data) {
        const d = r.data;
        if (d.shape) {
          const key = d.shape.trim().toLowerCase();
          const kind = NAMED_SHAPES[key];
          if (!kind) notes.add(RECT_LIKE.has(key) ? `the ${key} shape is drawn as a rectangle` : `the shape "${d.shape}" is not known, so it is drawn as a rectangle`);
          n.shape = kind === 'circle' ? 'ellipse' : (kind ?? 'rect');
          n.round = kind === 'circle';
          if (WORDLESS.has(n.shape) && d.label === undefined && n.text === n.name) n.text = '';
        }
        if (d.label !== undefined) n.text = label(d.label);
        if (d.icon) notes.add('icons are left out');
        if (d.img) notes.add('pictures are left out');
      }
    }
    if (r.classes.length) styles.add([r.name], r.classes);
  };

  const addLink = (a: string, b: string, l: FlowLink) => {
    if (l.line === 'invisible') {
      links.push(null);
      notes.add('invisible links (~~~) are left out');
      return;
    }
    const e: SpecEdge = { from: a, to: b, ...heads(l.start, l.end) };
    if (l.text) e.text = l.text;
    if (l.line === 'dotted') e.dashed = true;
    if (l.line === 'thick') e.thick = true;
    links.push(e);
    if (l.id && !named.has(l.id)) named.set(l.id, e);
  };

  // subgraph id [title], subgraph id["title"], subgraph "title", subgraph title words.
  const openSub = (rest: string) => {
    let name: string;
    let title: string;
    const m = /^([^\s"[\]]+)\s*\[([\s\S]*)\]$/.exec(rest);
    if (m) {
      name = m[1];
      title = label(m[2]);
    } else {
      title = label(rest);
      const bare = unquote(rest);
      name = !bare || /\s/.test(bare) ? `\u0001subgraph${++subs}` : bare;
    }
    const n = node(name);
    n.container = true;
    n.shape = 'container';
    n.round = undefined;
    n.text = title;
    if (!containers.includes(name)) containers.push(name);
    open.push({ name, mentions: new Set() });
  };

  // A subgraph holds what was named inside it and is in no subgraph yet (an inner one is closed, so takes its own, first).
  const closeSub = () => {
    const s = open.pop();
    if (!s) {
      notes.add('an end with no subgraph to close is left out');
      return;
    }
    for (const name of s.mentions) {
      const n = nodes.get(name);
      if (!n || name === s.name || n.parent !== undefined) continue;
      let inside = false;
      for (let up: string | undefined = s.name; up !== undefined && !inside; up = nodes.get(up)?.parent) inside = up === name;
      if (!inside) n.parent = s.name;
    }
  };

  // A statement of nodes and links (A --> B & C -->|words| D), read whole before any of it is kept: a line that does not
  // read (or is cut short, as it streams in) adds nothing.
  const chain = (t: string): boolean => {
    const c = new Cursor(t);
    const first = readGroup(c);
    if (!first) return false;
    const groups = [first];
    const joins: FlowLink[] = [];
    c.ws();
    while (!c.done()) {
      const link = readLink(c);
      if (!link) return false;
      c.ws();
      const to = readGroup(c);
      if (!to) return false;
      joins.push(link);
      groups.push(to);
      c.ws();
    }
    // Data for an edge named before (e1@{ animate: true }), not a node.
    const data = groups.length === 1 && first.length === 1 ? first[0].data : undefined;
    const edge = data ? named.get(first[0].name) : undefined;
    if (edge && data) {
      if (data.animate === 'true' || data.animation) edge.style = { ...edge.style, flow: true };
      const route = data.curve ? CURVES[data.curve.toLowerCase()] : undefined;
      if (route) edge.route = route;
      return true;
    }
    first.forEach(touch);
    joins.forEach((link, i) => {
      groups[i + 1].forEach(touch);
      for (const a of groups[i]) for (const b of groups[i + 1]) addLink(a.name, b.name, link);
    });
    return true;
  };

  for (const st of flowStatements(text, firstLine)) {
    const t = st.t;
    let m: RegExpExecArray | null;
    if (/^subgraph(\s|$)/.test(t)) openSub(t.slice(8).trim());
    else if (t === 'end') closeSub();
    else if ((m = /^direction\s+(TB|TD|BT|RL|LR)$/i.exec(t))) {
      if (open.length) notes.add('the direction of a subgraph is left out: the whole flowchart runs one way');
      else layout = DIRECTIONS[m[1].toUpperCase()];
    } else if ((m = /^linkStyle\s+(default|\d+(?:\s*,\s*\d+)*)\s*(?:interpolate\s+(\w+)\s*)?([\s\S]*)$/.exec(t))) {
      const all = m[1] === 'default';
      linkStyles.push({ all, at: all ? [] : m[1].split(',').map(Number), look: readLook(m[3]), route: m[2] ? CURVES[m[2].toLowerCase()] : undefined });
    } else if (/^(click|callback)\s/.test(t)) notes.add('click lines are left out');
    else if (!styles.read(t, true) && !chain(t)) notes.skip(st);
  }
  while (open.length) {
    notes.add('a subgraph with no end is closed at the end');
    closeSub();
  }

  // Containers first (drawn behind what they hold), then the other nodes in the order they were first named.
  const ids = new Ids();
  const order = [...containers, ...[...nodes.keys()].filter((k) => !nodes.get(k)?.container)];
  for (const k of order) ids.of(k);
  const out: SpecNode[] = order.map((k) => {
    const n = nodes.get(k) as FlowNode;
    const nd: SpecNode = { id: ids.of(k), shape: n.shape };
    if (n.text) nd.text = n.text;
    if (n.parent !== undefined) nd.parent = ids.of(n.parent);
    if (n.round) nd.w = nd.h = roundSize(n.text);
    lookNode(nd, styles.look(k, !n.container));
    return nd;
  });
  // linkStyle default first, then each by its number.
  for (const ls of [...linkStyles.filter((l) => l.all), ...linkStyles.filter((l) => !l.all)])
    for (const i of ls.all ? links.map((_, k) => k) : ls.at) {
      const e = links[i];
      if (i >= links.length) notes.add(`linkStyle ${i} names no link`);
      else if (e) {
        lookEdge(e, ls.look);
        if (ls.route) e.route = ls.route;
      }
    }
  const edges = links.filter((e): e is SpecEdge => !!e).map((e) => ({ ...e, from: ids.of(e.from), to: ids.of(e.to) }));
  return { layout, nodes: out, edges };
}

// ---- mind maps ------------------------------------------------------------------------------------------------------------

/** The looks a mind map's branches take in turn, each with all it holds. */
const BRANCH_COLOURS = ['blue', 'green', 'orange', 'purple', 'yellow', 'red', 'teal', 'pink'];

const MIND_SHAPES: Record<string, { close: string; shape: ShapeKind }> = {
  '((': { close: '))', shape: 'ellipse' },
  '))': { close: '((', shape: 'cloud' },
  '{{': { close: '}}', shape: 'hexagon' },
  '(': { close: ')', shape: 'rounded' },
  ')': { close: '(', shape: 'cloud' },
  '[': { close: ']', shape: 'rect' },
};

/** A mind map's line: its own name, its words and its shape (id[words], id(words), id((words)), id))words((, id)words(, id{{words}}, or words alone). */
function mindNode(t: string): { name?: string; text: string; shape: ShapeKind; round?: boolean } {
  const m = /^([^()[\]{}"]*?)\s*(\(\(|\)\)|\{\{|\(|\)|\[)([\s\S]*)$/.exec(t);
  const sh = m ? MIND_SHAPES[m[2]] : undefined;
  if (m && sh && m[3].length >= sh.close.length && m[3].endsWith(sh.close))
    return { name: m[1].trim() || undefined, text: label(m[3].slice(0, m[3].length - sh.close.length)), shape: sh.shape, round: m[2] === '((' };
  return { text: label(t), shape: 'rounded' };
}

function mindmap(lines: Line[], notes: Notes): SpecPage {
  const nodes: SpecNode[] = [];
  const edges: SpecEdge[] = [];
  const ids = new Ids();
  const stack: { indent: number; id: string; color: string }[] = [];
  let root: { indent: number; id: string; color: string } | undefined;
  let branches = 0;
  for (const l of joinQuoted(lines)) {
    let t = l.t.trim();
    if (!t) continue;
    if (t.startsWith('::icon(')) {
      notes.add('icons are left out');
      continue;
    }
    if (t.startsWith(':::')) {
      notes.add('classes in mind maps are left out');
      continue;
    }
    if (/::icon\([^)]*\)\s*$/.test(t)) {
      notes.add('icons are left out');
      t = t.replace(/\s*::icon\([^)]*\)\s*$/, '');
    }
    t = t.replace(/\s*:::[\w\s-]*$/, '');
    const indent = l.t.length - l.t.trimStart().length;
    const nd = mindNode(t);
    // Its parent: the nearest node above it that is indented less (the root, for one beside the root).
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    let parent = stack[stack.length - 1];
    if (!parent && root) {
      parent = root;
      notes.add('a mind map has one root: the nodes beside it are put under it');
    }
    const id = (nd.name && ids.claim(nd.name)) || ids.fresh(`node${nodes.length + 1}`);
    const color = !parent ? 'dark-blue' : parent === root ? BRANCH_COLOURS[branches++ % BRANCH_COLOURS.length] : parent.color;
    const s: SpecNode = { id, shape: nd.shape, color };
    if (nd.text) s.text = nd.text;
    if (nd.round) s.w = s.h = roundSize(nd.text);
    nodes.push(s);
    if (parent) edges.push({ from: parent.id, to: id, arrow: 'none' });
    const entry = { indent, id, color };
    root ??= entry;
    stack.push(entry);
  }
  return { layout: 'mindmap', route: 'curved', nodes, edges };
}

// ---- class diagrams -------------------------------------------------------------------------------------------------------

interface ClassBox {
  name: string;
  label?: string;
  generic?: string;
  annotation?: string;
  attrs: string[];
  methods: string[];
  /** The namespace it is in. */
  parent?: string;
}

/** A class's name: in backticks, or letters and digits (a dash or a dot only inside it). */
const CLASS_NAME = String.raw`\x60[^\x60]+\x60|[\w\u00a0-\uffff]+(?:[-.][\w\u00a0-\uffff]+)*`;
const CLASS_REL = new RegExp(
  String.raw`^(${CLASS_NAME})\s*(?:"([^"]*)")?\s*(<\||\*|o|<|\(\))?(--|\.\.)(\|>|\*|o|>|\(\))?\s*(?:"([^"]*)")?\s*(${CLASS_NAME})\s*(?::\s*([\s\S]*))?$`,
);
const CLASS_MEMBER = new RegExp(String.raw`^(${CLASS_NAME})\s*:\s*([\s\S]+)$`);
const CLASS_ANNOTATION = new RegExp(String.raw`^<<\s*([^>]+?)\s*>>\s*(${CLASS_NAME})$`);
const CLASS_NOTE_FOR = new RegExp(String.raw`^note\s+for\s+(${CLASS_NAME})\s+"([\s\S]*)"$`);
const NAMESPACE = new RegExp(String.raw`^namespace\s+(${CLASS_NAME})\s*\{\s*$`);
const CLASS_HEADS: Record<string, ArrowKind> = { '<|': 'triangle', '|>': 'triangle', '*': 'diamond', o: 'diamond-open', '()': 'circle-open' };
/** The ends a parent or a whole is at (inheritance's triangle, composition's and aggregation's diamonds). */
const WHOLE_ENDS = new Set<ArrowKind>(['triangle', 'diamond', 'diamond-open']);

const className = (s: string) => s.trim().replace(/^`([\s\S]*)`$/, '$1');

/** Mermaid's generics, List~int~, as List<int> (nested ones too: Map~K, List~V~~). */
function generics(s: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '~') out += ch;
    else if (/[\w\]]/.test(s[i - 1] ?? '') && /[\w([]/.test(s[i + 1] ?? '')) {
      out += '<';
      depth++;
    } else if (depth > 0) {
      out += '>';
      depth--;
    } else out += ch;
  }
  return out;
}

/** A member as Mermaid shows it: generics as <T>, a method's return type after a colon, the marks for static and abstract taken off. */
function memberText(raw: string): { text: string; method: boolean } {
  const s = decode(raw.trim());
  const m = /^([+\-#~])?\s*([^(]*)\(([^)]*)\)\s*[$*]?\s*([\s\S]*?)\s*[$*]?$/.exec(s);
  if (m) return { text: generics(`${m[1] ?? ''}${m[2].trim()}(${m[3].trim()})${m[4] ? ` : ${m[4]}` : ''}`), method: true };
  return { text: generics(s.replace(/\s*[$*]$/, '')), method: false };
}

function classDiagram(lines: Line[], notes: Notes): SpecPage {
  const classes = new Map<string, ClassBox>();
  const spaces = new Map<string, string | undefined>(); // each namespace, and the namespace it is in
  const edges: SpecEdge[] = [];
  const memos: { name: string; text: string; parent?: string }[] = [];
  const block: { kind: 'class' | 'namespace'; name: string }[] = [];
  const styles = new Styles();
  let layout: LayoutKind = 'down';

  const space = () => {
    for (let i = block.length - 1; i >= 0; i--) if (block[i].kind === 'namespace') return block[i].name;
    return undefined;
  };
  // A class by its name, made when first named (in the namespace it is named in).
  const cls = (name: string): ClassBox => {
    let c = classes.get(name);
    if (!c) {
      c = { name, attrs: [], methods: [], parent: space() };
      classes.set(name, c);
    }
    return c;
  };
  const member = (c: ClassBox, raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const an = /^<<\s*([^>]+?)\s*>>$/.exec(t);
    if (an) c.annotation = an[1];
    else {
      const m = memberText(t);
      (m.method ? c.methods : c.attrs).push(m.text);
    }
  };
  // class Name~T~["label"]:::css <<annotation>> { members }
  const declare = (rest: string, l: Line) => {
    const nm = new RegExp(`^(?:${CLASS_NAME})`).exec(rest);
    if (!nm) return notes.skip(l);
    const c = cls(className(nm[0]));
    let r = rest.slice(nm[0].length);
    const g = /^~[^\s{[:]*~/.exec(r);
    if (g) {
      c.generic = g[0];
      r = r.slice(g[0].length);
    }
    const lb = /^\s*\[\s*("[^"]*"|[^\]]*?)\s*\]/.exec(r);
    if (lb) {
      c.label = label(lb[1]);
      r = r.slice(lb[0].length);
    }
    let k: RegExpExecArray | null;
    while ((k = /^\s*:::([\w-]+)/.exec(r))) {
      styles.add([c.name], [k[1]]);
      r = r.slice(k[0].length);
    }
    const an = /^\s*<<\s*([^>]+?)\s*>>/.exec(r);
    if (an) {
      c.annotation = an[1];
      r = r.slice(an[0].length);
    }
    const br = /^\s*\{([\s\S]*)$/.exec(r);
    if (br) {
      const close = br[1].indexOf('}');
      if (close >= 0) for (const part of br[1].slice(0, close).split(';')) member(c, part);
      else {
        member(c, br[1]);
        block.push({ kind: 'class', name: c.name });
      }
    } else if (r.trim()) notes.skip(l);
  };

  for (const l of lines) {
    const t = l.t.trim();
    if (!t) continue;
    const top = block[block.length - 1];
    if (top?.kind === 'class') {
      // Inside a class's braces: a member to a line, until }.
      const close = t.indexOf('}');
      member(cls(top.name), close >= 0 ? t.slice(0, close) : t);
      if (close >= 0) block.pop();
      continue;
    }
    let m: RegExpExecArray | null;
    if (t === '}') {
      if (block.length) block.pop();
      else notes.skip(l);
    } else if ((m = NAMESPACE.exec(t))) {
      const name = className(m[1]);
      if (!spaces.has(name)) spaces.set(name, space());
      block.push({ kind: 'namespace', name });
    } else if ((m = /^class\s+([\s\S]+)$/.exec(t))) declare(m[1], l);
    else if ((m = CLASS_ANNOTATION.exec(t))) cls(className(m[2])).annotation = m[1];
    else if ((m = CLASS_REL.exec(t))) {
      const dotted = m[4] === '..';
      const kind = (h: string | undefined): ArrowKind => (!h ? 'none' : h === '<' || h === '>' ? (dotted ? 'open' : 'arrow') : CLASS_HEADS[h]);
      let [a, b] = [cls(className(m[1])).name, cls(className(m[7])).name];
      let [ka, kb] = [kind(m[3]), kind(m[5])];
      let [ca, cb] = [m[2]?.trim(), m[6]?.trim()];
      // The parent or the whole (the end with the triangle or the diamond) goes first, so a layered layout puts it on top.
      if (WHOLE_ENDS.has(kb) && !WHOLE_ENDS.has(ka)) {
        [a, b, ka, kb, ca, cb] = [b, a, kb, ka, cb, ca];
      }
      const e: SpecEdge = { from: a, to: b, ...(ka === 'none' && kb === 'none' ? { arrow: 'none' as const } : { start: ka, end: kb }) };
      if (dotted) e.dashed = true;
      if (ca) e.fromText = ca;
      if (cb) e.toText = cb;
      const text = m[8] ? label(m[8]) : '';
      if (text) e.text = text;
      edges.push(e);
    } else if ((m = CLASS_NOTE_FOR.exec(t))) {
      const name = `\u0001note${memos.length + 1}`;
      const c = cls(className(m[1]));
      memos.push({ name, text: label(m[2]), parent: c.parent });
      edges.push({ from: name, to: c.name, dashed: true, arrow: 'none' });
    } else if ((m = /^note\s+"([\s\S]*)"$/.exec(t))) memos.push({ name: `\u0001note${memos.length + 1}`, text: label(m[1]), parent: space() });
    else if ((m = /^direction\s+(TB|TD|BT|RL|LR)$/i.exec(t))) layout = DIRECTIONS[m[1].toUpperCase()];
    else if (/^(click|callback|link)\s/.test(t)) notes.add('click, link and callback lines are left out');
    else if ((m = CLASS_MEMBER.exec(t))) member(cls(className(m[1])), m[2]);
    else if (!styles.read(t, false)) notes.skip(l);
  }

  // Namespaces first (drawn behind their classes), then the classes, then the notes.
  const ids = new Ids();
  const spaceIds = new Map<string, string>();
  for (const name of spaces.keys()) spaceIds.set(name, ids.claim(name) ?? ids.fresh(name));
  for (const c of classes.values()) ids.of(c.name);
  const out: SpecNode[] = [];
  for (const [name, parent] of spaces) out.push({ id: spaceIds.get(name) as string, shape: 'container', text: name, ...(parent ? { parent: spaceIds.get(parent) } : {}) });
  for (const c of classes.values()) {
    const name = c.label ?? generics(c.name + (c.generic ?? ''));
    const nd: SpecNode = { id: ids.of(c.name), shape: 'class', text: c.annotation ? `«${c.annotation}»\n${name}` : name };
    const rows = c.methods.length ? [...c.attrs, '---', ...c.methods] : c.attrs;
    if (rows.length) nd.rows = rows;
    if (c.parent) nd.parent = spaceIds.get(c.parent);
    lookNode(nd, styles.look(c.name, true));
    out.push(nd);
  }
  for (const n of memos) out.push({ id: ids.of(n.name), shape: 'note', text: n.text, ...(n.parent ? { parent: spaceIds.get(n.parent) } : {}) });
  return { layout, nodes: out, edges: edges.map((e) => ({ ...e, from: ids.of(e.from), to: ids.of(e.to) })) };
}

// ---- ER diagrams ----------------------------------------------------------------------------------------------------------

/** An entity's name (in quotes, or letters, digits, dashes) and the alias it may show instead: p[Person]. */
const ER_ENTITY = String.raw`("[^"]+"|[\w\u00a0-\uffff][\w\u00a0-\uffff-]*)(?:\[\s*("[^"]*"|[^\]]*?)\s*\])?`;
const ER_MARK = String.raw`\|o|o\||\|\||\}o|o\{|\}\||\|\{`;
const ER_WORD = String.raw`zero or one|one or zero|one or more|one or many|many\(1\)|1\+|zero or more|zero or many|many\(0\)|0\+|only one|1`;
const ER_REL = new RegExp(String.raw`^${ER_ENTITY}\s*(${ER_MARK})\s*(--|\.\.|-\.|\.-)\s*(${ER_MARK})\s*${ER_ENTITY}\s*(?::\s*([\s\S]*))?$`);
const ER_REL_WORDS = new RegExp(String.raw`^${ER_ENTITY}\s+(${ER_WORD})\s+(optionally to|to)\s+(${ER_WORD})\s+${ER_ENTITY}\s*(?::\s*([\s\S]*))?$`, 'i');
const ER_BLOCK = new RegExp(String.raw`^${ER_ENTITY}\s*((?::::[\w-]+)*)\s*\{([\s\S]*)$`);
const ER_ALONE = new RegExp(String.raw`^${ER_ENTITY}\s*((?::::[\w-]+)*)$`);
const ER_ATTR = /^([\w\u00a0-\uffff][^\s"]*)\s+([\w\u00a0-\uffff*][^\s",]*)((?:\s+(?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?)\s*(?:"([^"]*)")?$/i;
/** Crow's foot marks (either way round) and their words, as ends. */
const ER_ENDS: Record<string, ArrowKind> = {
  '|o': 'er-zero-one',
  'o|': 'er-zero-one',
  '||': 'er-only-one',
  '}o': 'er-zero-many',
  'o{': 'er-zero-many',
  '}|': 'er-one-many',
  '|{': 'er-one-many',
  'zero or one': 'er-zero-one',
  'one or zero': 'er-zero-one',
  'one or more': 'er-one-many',
  'one or many': 'er-one-many',
  'many(1)': 'er-one-many',
  '1+': 'er-one-many',
  'zero or more': 'er-zero-many',
  'zero or many': 'er-zero-many',
  'many(0)': 'er-zero-many',
  '0+': 'er-zero-many',
  'only one': 'er-only-one',
  '1': 'er-only-one',
};

function erDiagram(lines: Line[], notes: Notes): SpecPage {
  const entities = new Map<string, { name: string; alias?: string; rows: string[] }>();
  const edges: SpecEdge[] = [];
  const styles = new Styles();
  let layout: LayoutKind = 'right';
  let inside: string | undefined;

  const entity = (raw: string, alias?: string) => {
    const name = unquote(raw);
    let e = entities.get(name);
    if (!e) {
      e = { name, rows: [] };
      entities.set(name, e);
    }
    if (alias !== undefined && label(alias)) e.alias = label(alias);
    return e;
  };
  // An attribute: type name [PK, FK, UK] ["comment"], as "name type PK".
  const attribute = (raw: string, l: Line) => {
    const t = raw.trim();
    if (!t || !inside) return;
    const m = ER_ATTR.exec(t);
    if (!m) return notes.skip(l);
    const keys = m[3].trim().toUpperCase().replace(/\s*,\s*/g, ', ');
    entities.get(inside)?.rows.push(`${m[2]} ${m[1]}${keys ? ` ${keys}` : ''}`);
    if (m[4]) notes.add('the comments on attributes are left out');
  };
  // What is inside an entity's braces, until }: attributes, a line (or a semicolon) apart.
  const body = (s: string, l: Line) => {
    const close = s.indexOf('}');
    for (const part of splitQuoted(close >= 0 ? s.slice(0, close) : s, ';')) attribute(part, l);
    if (close >= 0) inside = undefined;
  };

  for (const l of lines) {
    const t = l.t.trim();
    if (!t) continue;
    let m: RegExpExecArray | null;
    if (inside) body(t, l);
    else if ((m = ER_REL.exec(t)) || (m = ER_REL_WORDS.exec(t))) {
      const a = entity(m[1], m[2] || undefined);
      const b = entity(m[6], m[7] || undefined);
      const e: SpecEdge = { from: a.name, to: b.name, start: ER_ENDS[m[3].toLowerCase()], end: ER_ENDS[m[5].toLowerCase()] };
      if (m[4].includes('.') || /^optionally/i.test(m[4])) e.dashed = true;
      const text = m[8] ? label(m[8]) : '';
      if (text) e.text = text;
      edges.push(e);
    } else if ((m = ER_BLOCK.exec(t))) {
      const e = entity(m[1], m[2] || undefined);
      if (m[3]) styles.add([e.name], m[3].split(':::').filter(Boolean));
      inside = e.name;
      body(m[4], l);
    } else if ((m = /^direction\s+(TB|TD|BT|RL|LR)$/i.exec(t))) layout = DIRECTIONS[m[1].toUpperCase()];
    else if (styles.read(t, true)) continue;
    else if ((m = ER_ALONE.exec(t))) {
      const e = entity(m[1], m[2] || undefined);
      if (m[3]) styles.add([e.name], m[3].split(':::').filter(Boolean));
    } else notes.skip(l);
  }

  const ids = new Ids();
  for (const e of entities.values()) ids.of(e.name);
  const out: SpecNode[] = [...entities.values()].map((e) => {
    const nd: SpecNode = { id: ids.of(e.name), shape: 'entity', text: e.alias ?? e.name };
    if (e.rows.length) nd.rows = e.rows;
    lookNode(nd, styles.look(e.name, true));
    return nd;
  });
  return { layout, nodes: out, edges: edges.map((e) => ({ ...e, from: ids.of(e.from), to: ids.of(e.to) })) };
}

// ---- state diagrams -------------------------------------------------------------------------------------------------------

interface StateBox {
  name: string;
  text: string;
  shape: ShapeKind;
  /** The composite state it is in. */
  parent?: string;
  container?: boolean;
  /** Its descriptions, a line each under its name. */
  lines: string[];
  w?: number;
  h?: number;
  bar?: boolean;
}

const STATE_ID = String.raw`[\w\u00a0-\uffff]+(?:[-.][\w\u00a0-\uffff]+)*`;
const TRANSITION = new RegExp(String.raw`^(\[\*\]|${STATE_ID})((?::::[\w-]+)*)\s*-->\s*(\[\*\]|${STATE_ID})((?::::[\w-]+)*)\s*(?::\s*([\s\S]*))?$`);
const STATE_AS = new RegExp(String.raw`^state\s+"([^"]*)"\s+as\s+(${STATE_ID})\s*(\{)?$`);
const STATE_KIND = new RegExp(String.raw`^state\s+(${STATE_ID})\s*<<\s*(\w+)\s*>>$`);
const STATE_OPEN = new RegExp(String.raw`^state\s+(${STATE_ID})\s*\{$`);
const STATE_ONE = new RegExp(String.raw`^state\s+(${STATE_ID})\s*(?::\s*([\s\S]*))?$`);
const STATE_NOTE = new RegExp(String.raw`^note\s+(left|right)\s+of\s+(${STATE_ID})\s*(?::\s*([\s\S]*))?$`, 'i');
const STATE_DESCR = new RegExp(String.raw`^(${STATE_ID})((?::::[\w-]+)*)\s*:\s*([\s\S]+)$`);

function stateDiagram(lines: Line[], notes: Notes): SpecPage {
  const states = new Map<string, StateBox>();
  const containers: string[] = [];
  const scope: string[] = [];
  const edges: SpecEdge[] = [];
  const styles = new Styles();
  let layout: LayoutKind = 'down';
  let memos = 0;

  const here = () => scope[scope.length - 1];
  // A state by its name, made when first named, in the composite state it is first named in.
  const state = (name: string): StateBox => {
    let s = states.get(name);
    if (!s) {
      s = { name, text: name, shape: 'rounded', parent: here(), lines: [] };
      states.set(name, s);
    }
    return s;
  };
  // [*]: the start (or the end) of the composite state it is in, or of the whole diagram; one each.
  const pseudo = (kind: 'start' | 'end'): string => {
    const where = here();
    const name = `\u0001${kind}${where ? `_${where}` : ''}`;
    if (!states.has(name)) states.set(name, { name, text: '', shape: kind === 'start' ? 'initial' : 'final', parent: where, lines: [] });
    return name;
  };
  const classesOf = (name: string, list: string) => {
    if (list) styles.add([name], list.split(':::').filter(Boolean));
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.t.trim();
    if (!t) continue;
    let m: RegExpExecArray | null;
    if (t === '}') {
      if (scope.length) scope.pop();
      else notes.skip(l);
    } else if (t === '--') notes.add('the lines between concurrent regions (--) are left out');
    else if ((m = TRANSITION.exec(t))) {
      const from = m[1] === '[*]' ? pseudo('start') : state(m[1]).name;
      const to = m[3] === '[*]' ? pseudo('end') : state(m[3]).name;
      classesOf(from, m[2]);
      classesOf(to, m[4]);
      const e: SpecEdge = { from, to };
      const text = m[5] ? label(m[5]) : '';
      if (text) e.text = text;
      edges.push(e);
    } else if ((m = STATE_AS.exec(t))) {
      const s = state(m[2]);
      s.text = label(m[1]);
      if (m[3]) openState(s);
    } else if ((m = STATE_KIND.exec(t))) {
      const s = state(m[1]);
      const kind = m[2].toLowerCase();
      if (kind === 'fork' || kind === 'join') Object.assign(s, { shape: 'bar', text: '', bar: true });
      else if (kind === 'choice') Object.assign(s, { shape: 'diamond', text: '', w: 40, h: 40 });
      else notes.add(`states of the kind <<${m[2]}>> are drawn as plain states`);
    } else if ((m = STATE_OPEN.exec(t))) openState(state(m[1]));
    else if ((m = STATE_ONE.exec(t))) {
      const s = state(m[1]);
      if (m[2]) s.lines.push(label(m[2]));
    } else if ((m = STATE_NOTE.exec(t))) {
      let text = m[3];
      if (text === undefined) {
        // A note of several lines, until "end note".
        const body: string[] = [];
        while (++i < lines.length && !/^\s*end\s+note\s*$/i.test(lines[i].t)) body.push(lines[i].t.trim());
        text = body.join('\n');
      }
      const target = state(m[2]);
      const name = `\u0001note${++memos}`;
      states.set(name, { name, text: label(text), shape: 'note', parent: target.parent, lines: [] });
      edges.push({ from: name, to: target.name, dashed: true, arrow: 'none' });
    } else if ((m = /^direction\s+(TB|TD|BT|RL|LR)$/i.exec(t))) layout = DIRECTIONS[m[1].toUpperCase()];
    else if (/^hide\s+empty\s+description$/i.test(t)) continue;
    else if (styles.read(t, true)) continue;
    else if ((m = STATE_DESCR.exec(t))) {
      const s = state(m[1]);
      classesOf(s.name, m[2]);
      s.lines.push(label(m[3]));
    } else notes.skip(l);
  }
  if (scope.length) notes.add('a composite state with no } is closed at the end');

  function openState(s: StateBox) {
    s.container = true;
    s.shape = 'container';
    if (!containers.includes(s.name)) containers.push(s.name);
    scope.push(s.name);
  }

  const ids = new Ids();
  const order = [...containers, ...[...states.keys()].filter((k) => !states.get(k)?.container)];
  for (const k of order) ids.of(k);
  const across = layout === 'right' || layout === 'left';
  const out: SpecNode[] = order.map((k) => {
    const s = states.get(k) as StateBox;
    const nd: SpecNode = { id: ids.of(k), shape: s.shape };
    const text = [s.text, ...s.lines].filter(Boolean).join('\n');
    if (text && !s.bar && !(s.shape === 'diamond' && s.w)) nd.text = text;
    if (s.parent !== undefined) nd.parent = ids.of(s.parent);
    // A fork's bar lies across the way the diagram runs.
    if (s.bar) Object.assign(nd, across ? { w: 8, h: 80 } : { w: 80, h: 8 });
    else if (s.w && s.h) Object.assign(nd, { w: s.w, h: s.h });
    lookNode(nd, styles.look(k, !s.container && s.shape !== 'note'));
    return nd;
  });
  return { layout, nodes: out, edges: edges.map((e) => ({ ...e, from: ids.of(e.from), to: ids.of(e.to) })) };
}

// ---- sequence diagrams ----------------------------------------------------------------------------------------------------

/** The sizes a sequence diagram is laid out at, in pixels. */
const SEQ = {
  /** The first lifeline's top left. */
  left: 40,
  top: 40,
  /** A lifeline's head (the box with its name), and the narrowest a head is. */
  head: 40,
  minHead: 120,
  /** Between two lifelines. */
  gap: 60,
  /** A message's row, and what each line of its words more adds. */
  row: 44,
  line: 18,
  /** A message to itself: how far right its loop goes, and how far down. */
  loop: 44,
  self: 22,
  /** A block's frame: its head's height, and how far it reaches past the lifelines' middles. */
  frameHead: 30,
  margin: 70,
};

/** How each of Mermaid's message arrows is drawn. */
const MESSAGES: Record<string, { dashed: boolean; start: ArrowKind; end: ArrowKind }> = {
  '->>': { dashed: false, start: 'none', end: 'arrow' },
  '-->>': { dashed: true, start: 'none', end: 'arrow' },
  '->': { dashed: false, start: 'none', end: 'none' },
  '-->': { dashed: true, start: 'none', end: 'none' },
  '-x': { dashed: false, start: 'none', end: 'cross' },
  '--x': { dashed: true, start: 'none', end: 'cross' },
  '-)': { dashed: false, start: 'none', end: 'open' },
  '--)': { dashed: true, start: 'none', end: 'open' },
  '<<->>': { dashed: false, start: 'arrow', end: 'arrow' },
  '<<-->>': { dashed: true, start: 'arrow', end: 'arrow' },
};
const SEQ_MESSAGE = /^([^:]+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-]?)\s*([^:]+?)\s*(?::([\s\S]*))?$/;
const SEQ_NOTE = /^note\s+(left of|right of|over)\s+([^:]+?)\s*(?::([\s\S]*))?$/i;
const SEQ_BLOCK = /^(loop|opt|alt|par|par_over|critical|break|rect|box)(?:\s+([\s\S]*))?$/i;

interface Lifeline {
  name: string;
  text: string;
  w: number;
  x: number;
  /** The middle, where its dashed line runs. */
  cx: number;
}

type SeqEvent =
  | { k: 'message'; from: string; to: string; text: string; arrow: string; act: string }
  | { k: 'note'; side: string; who: string[]; text: string }
  | { k: 'activate'; who: string; on: boolean }
  | { k: 'open'; kind: string; text: string }
  | { k: 'divider'; text: string }
  | { k: 'end' };

/** A sequence diagram's statements: its lines, apart at semicolons too (but not an entity code's, #59;). */
function semis(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (const l of lines) {
    let cur = '';
    for (let i = 0; i < l.t.length; i++) {
      const m = l.t[i] === '#' ? /^#\w+;/.exec(l.t.slice(i, i + 40)) : null;
      if (m) {
        cur += m[0];
        i += m[0].length - 1;
      } else if (l.t[i] === ';') {
        if (cur.trim()) out.push({ t: cur.trim(), n: l.n });
        cur = '';
      } else cur += l.t[i];
    }
    if (cur.trim()) out.push({ t: cur.trim(), n: l.n });
  }
  return out;
}

function sequence(lines: Line[], notes: Notes): SpecPage {
  const parts = new Map<string, Lifeline>();
  const events: SeqEvent[] = [];
  // The blocks open, to match each end to its own ('' for one left out: a rect, a box).
  const kinds: string[] = [];
  let title: string | undefined;
  let numbers: { n: number; step: number } | null = null;
  const part = (raw: string, text?: string): Lifeline => {
    const name = raw.trim();
    let p = parts.get(name);
    if (!p) {
      p = { name, text: name, w: 0, x: 0, cx: 0 };
      parts.set(name, p);
    }
    if (text) p.text = text;
    return p;
  };

  for (const l of semis(lines)) {
    const t = l.t;
    let m: RegExpExecArray | null;
    if (t.startsWith('#')) continue;
    if ((m = /^(?:create\s+)?(?:participant|actor)\s+([\s\S]+)$/i.exec(t))) {
      let rest = m[1];
      const data = /@\{([\s\S]*)\}/.exec(rest);
      if (data) {
        const type = readProps(data[1]).type?.toLowerCase();
        if (type && type !== 'actor' && type !== 'participant') notes.add('kinds of participant (database, queue…) are drawn as plain lifelines');
        rest = rest.replace(data[0], ' ');
      }
      const as = /^([\s\S]+?)\s+as\s+([\s\S]+)$/.exec(rest.trim());
      part(as ? as[1] : rest, as ? label(as[2]) : undefined);
    } else if (/^destroy\s/i.test(t)) notes.add('destroy lines are left out: every lifeline runs to the end');
    else if ((m = SEQ_NOTE.exec(t))) {
      const who = m[2]
        .split(',')
        .filter((w) => w.trim())
        .map((w) => part(w).name);
      if (who.length) events.push({ k: 'note', side: m[1].toLowerCase().split(/\s+/)[0], who, text: label(m[3] ?? '') });
    } else if ((m = /^(activate|deactivate)\s+([\s\S]+)$/i.exec(t))) events.push({ k: 'activate', who: part(m[2]).name, on: m[1].toLowerCase() === 'activate' });
    else if ((m = SEQ_BLOCK.exec(t))) {
      const kind = m[1].toLowerCase();
      if (kind === 'rect' || kind === 'box') {
        notes.add(kind === 'rect' ? 'the coloured backgrounds of rect blocks are left out' : 'boxes round participants are left out');
        kinds.push('');
      } else {
        kinds.push(kind);
        events.push({ k: 'open', kind: kind === 'par_over' ? 'par' : kind, text: label(m[2] ?? '') });
      }
    } else if ((m = /^(else|and|option)(?:\s+([\s\S]*))?$/i.exec(t))) {
      if (kinds[kinds.length - 1]) events.push({ k: 'divider', text: label(m[2] ?? '') });
    } else if (/^end$/i.test(t)) {
      const k = kinds.pop();
      if (k) events.push({ k: 'end' });
      else if (k === undefined) notes.add('an end with no block to close is left out');
    } else if ((m = /^autonumber(?:\s+(off)|\s+(\d+)(?:\s+(\d+))?)?$/i.exec(t))) numbers = m[1] ? null : { n: m[2] ? Number(m[2]) : 1, step: m[3] ? Number(m[3]) : 1 };
    else if ((m = /^title(?:\s*:\s*|\s+)([\s\S]*)$/i.exec(t))) title = label(m[1]);
    else if (/^(links?|properties|details)\s/i.test(t)) notes.add('the links and properties of participants are left out');
    else if ((m = SEQ_MESSAGE.exec(t))) {
      const from = part(m[1]).name;
      const to = part(m[4]).name;
      let text = label(m[5] ?? '');
      if (numbers) {
        text = `${numbers.n}. ${text}`.trim();
        numbers.n += numbers.step;
      }
      events.push({ k: 'message', from, to, text, arrow: m[2], act: m[3] });
    } else notes.skip(l);
  }

  // Across: each lifeline as wide as its name, and the gaps between them wide enough for the words of the messages
  // between them (between their middles, 12 pixels clear of each), the nearest first.
  const list = [...parts.values()];
  const at = new Map(list.map((p, i) => [p.name, i]));
  for (const p of list) p.w = even(Math.max(SEQ.minHead, widest(p.text) + 32));
  const gaps = list.map(() => SEQ.gap);
  const spans: { i: number; j: number; need: number }[] = [];
  for (const e of events) {
    if (e.k !== 'message') continue;
    const a = at.get(e.from) as number;
    const b = at.get(e.to) as number;
    // A message to itself has its words right of its loop, before the next lifeline.
    if (a === b) {
      if (a < list.length - 1) spans.push({ i: a, j: a + 1, need: SEQ.loop + widest(e.text) / 2 + 12 });
    } else spans.push({ i: Math.min(a, b), j: Math.max(a, b), need: widest(e.text) + 24 });
  }
  const between = (i: number, j: number) => {
    let d = (list[i].w + list[j].w) / 2;
    for (let k = i; k < j; k++) d += gaps[k] + (k > i ? list[k].w : 0);
    return d;
  };
  for (const s of spans.sort((a, b) => a.j - a.i - (b.j - b.i))) {
    const short = s.need - between(s.i, s.j);
    if (short > 0) for (let k = s.i; k < s.j; k++) gaps[k] += Math.ceil(short / (s.j - s.i));
  }
  let x = SEQ.left;
  list.forEach((p, i) => {
    p.x = x;
    p.cx = x + p.w / 2;
    x += p.w + gaps[i];
  });

  // Down: a row for each message and note, blocks framed round theirs.
  const ids = new Ids();
  for (const p of list) ids.of(p.name);
  const frames: { order: number; nodes: SpecNode[] }[] = [];
  const acts: SpecNode[] = [];
  const memos: SpecNode[] = [];
  const texts: SpecNode[] = [];
  const messages: { e: SpecEdge; y: number; y2: number }[] = [];
  const open: { kind: string; text: string; top: number; lo: number; hi: number; order: number; dividers: { y: number; text: string }[] }[] = [];
  const active = new Map<string, number[]>();
  let y = SEQ.top + SEQ.head + 30;
  let last: number | undefined;
  let opened = 0;
  let dividers = 0;
  const P = (name: string) => list[at.get(name) as number];
  // What a block's frame must reach round: its lifelines' middles (with its margin), its notes and loops.
  const cover = (lo: number, hi: number) => {
    for (const b of open) {
      b.lo = Math.min(b.lo, lo);
      b.hi = Math.max(b.hi, hi);
    }
  };
  const coverLines = (xs: number[]) => cover(Math.min(...xs) - SEQ.margin, Math.max(...xs) + SEQ.margin);
  const activate = (name: string, top: number) => active.set(name, [...(active.get(name) ?? []), top]);
  // An activation's bar, centred on its lifeline (one inside another 6 pixels right of it).
  const deactivate = (name: string, bottom: number) => {
    const tops = active.get(name) ?? [];
    const top = tops.pop();
    if (top === undefined) {
      notes.add(`${name} is deactivated when it is not active: that is left out`);
      return;
    }
    acts.push({ id: ids.fresh(`activation${acts.length + 1}`), shape: 'activation', x: P(name).cx - 6 + 6 * tops.length, y: top, w: 12, h: Math.max(20, bottom - top) });
  };
  const closeBlock = () => {
    const b = open.pop();
    if (!b) return;
    let { lo, hi } = b;
    if (!(lo < hi)) {
      // Nothing inside: across every lifeline.
      lo = list.length ? list[0].cx - SEQ.margin : SEQ.left;
      hi = list.length ? list[list.length - 1].cx + SEQ.margin : SEQ.left + 2 * SEQ.margin;
    }
    const head = b.text ? `${b.kind} [${b.text}]` : b.kind;
    hi = Math.ceil(Math.max(hi, lo + widest(head) + 40, ...b.dividers.map((d) => lo + widest(`[${d.text}]`) + 24)));
    const bottom = y + 10;
    const nodes: SpecNode[] = [{ id: ids.fresh(`frame${b.order + 1}`), shape: 'frame', text: head, x: lo, y: b.top, w: hi - lo, h: bottom - b.top }];
    for (const d of b.dividers) {
      // The line between a block's parts: a thin bar (drawn in its line's colour) across its frame, its condition under it.
      nodes.push({ id: ids.fresh(`divider${++dividers}`), shape: 'bar', x: lo, y: d.y, w: hi - lo, h: 1, fill: '#9198a1', stroke: '#9198a1' });
      if (d.text) texts.push({ id: ids.fresh(`condition${dividers}`), shape: 'text', text: `[${d.text}]`, x: lo + 8, y: d.y + 3, w: Math.ceil(widest(`[${d.text}]`) + 8), h: 20 });
    }
    frames.push({ order: b.order, nodes });
    y = bottom;
    cover(lo - 10, hi + 10);
  };

  for (const ev of events) {
    if (ev.k === 'message') {
      const self = ev.from === ev.to;
      const h = SEQ.row + SEQ.line * (lineCount(ev.text) - 1) + (self ? SEQ.self : 0);
      const ly = y + (self ? (h - SEQ.self) / 2 : h / 2);
      const a = P(ev.from);
      const b = P(ev.to);
      const look = MESSAGES[ev.arrow];
      const e: SpecEdge = { from: ids.of(a.name), to: ids.of(b.name), route: self ? 'orthogonal' : 'straight', ...heads(look.start, look.end) };
      if (look.dashed) e.dashed = true;
      if (ev.text) e.text = ev.text;
      if (self) e.points = [
        [a.cx + SEQ.loop, ly],
        [a.cx + SEQ.loop, ly + SEQ.self],
      ];
      messages.push({ e, y: ly, y2: self ? ly + SEQ.self : ly });
      coverLines([a.cx, b.cx]);
      if (self) cover(a.cx, a.cx + SEQ.loop + widest(ev.text) / 2 + 12);
      if (ev.act === '+') activate(b.name, ly);
      if (ev.act === '-') deactivate(a.name, ly);
      last = ly;
      y += h;
    } else if (ev.k === 'note') {
      const xs = ev.who.map((w) => P(w).cx);
      let w = even(Math.max(100, widest(ev.text) + 20));
      const h = Math.ceil(lineCount(ev.text) * lineHeight(FONT.size) + 16);
      let nx: number;
      if (ev.side === 'right') nx = Math.max(...xs) + 16;
      else if (ev.side === 'left') nx = Math.min(...xs) - 16 - w;
      else {
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        if (xs.length > 1) w = Math.max(w, even(hi - lo + 40));
        nx = Math.round((lo + hi) / 2 - w / 2);
      }
      memos.push({ id: ids.fresh(`note${memos.length + 1}`), shape: 'note', ...(ev.text ? { text: ev.text } : {}), x: nx, y: y + 8, w, h });
      coverLines(xs);
      cover(nx - 10, nx + w + 10);
      last = y + 8 + h;
      y += h + 16;
    } else if (ev.k === 'activate') {
      if (ev.on) activate(ev.who, last ?? y);
      else deactivate(ev.who, last ?? y);
    } else if (ev.k === 'open') {
      open.push({ kind: ev.kind, text: ev.text, top: y, lo: Infinity, hi: -Infinity, order: opened++, dividers: [] });
      y += SEQ.frameHead;
    } else if (ev.k === 'divider') {
      const b = open[open.length - 1];
      if (b) {
        b.dividers.push({ y, text: ev.text });
        y += 24;
      }
    } else closeBlock();
  }
  if (open.length) notes.add('a block with no end is closed at the end');
  while (open.length) closeBlock();
  for (const [name, tops] of active) while (tops.length) deactivate(name, y);

  // Every lifeline as long as the rows, and 30 pixels more; a message meets its lifelines at its row, as fractions of them.
  const height = y + 30 - SEQ.top;
  const lifelines: SpecNode[] = list.map((p) => ({ id: ids.of(p.name), shape: 'lifeline', text: p.text, x: p.x, y: SEQ.top, w: p.w, h: height }));
  const fy = (v: number) => Math.round(((v - SEQ.top) / height) * 10000) / 10000;
  for (const m of messages) {
    m.e.fromPort = [0.5, fy(m.y)];
    m.e.toPort = [0.5, fy(m.y2)];
  }
  const nodes = [...frames.sort((a, b) => a.order - b.order).flatMap((f) => f.nodes), ...lifelines, ...acts, ...memos, ...texts];
  // A note left of the first lifeline (or a frame round it) moves it all right, to keep clear of the page's edge.
  const minX = Math.min(...nodes.map((nd) => nd.x ?? 0));
  if (minX < 20) {
    const dx = Math.ceil(20 - minX);
    for (const nd of nodes) nd.x = (nd.x ?? 0) + dx;
    for (const m of messages) if (m.e.points) m.e.points = m.e.points.map(([px, py]) => [px + dx, py] as [number, number]);
  }
  return { ...(title ? { name: title } : {}), layout: 'none', nodes, edges: messages.map((m) => m.e) };
}
