// Diagrams to and from draw.io (diagrams.net). drawioToDiagram reads its files: a .drawio or .xml (<mxfile>, a <diagram>
// for each page, its content plain or compressed), a bare <mxGraphModel>, a draw.io SVG (the file inside its root's
// `content`) or a draw.io PNG (the file in a text chunk), into a diagram (diagram.ts), each of its pages a page:
// containers and groups as they were, a table's or a class's rows as one shape, words from its HTML labels, and what a
// diagram has no kind for (draw.io's stencil libraries, layers, custom shapes) as near as it comes, with a note of what
// did not come along. diagramToDrawio writes a diagram as a file draw.io opens, its shapes drawn as draw.io's own as far
// as it has them; a kind draw.io lacks is drawn as the nearest it has, marked (hydorShape=…) so that it reads back as it
// was. Shared by the server and the browser: no DOM, no Node; the caller brings raw inflate.
import type { ArrowKind, Dash, Diagram, DiagramEdge, DiagramEnd, DiagramIcon, DiagramItem, DiagramPage, DiagramShape, DiagramStyle, FontKind, LabelPos, RouteKind, ShapeKind } from './diagram.ts';
import { arrowFrom, cleanColour, DIAGRAM_LIMITS, isShapeKind, normalizeDiagram, ROW_KINDS } from './diagram.ts';
import { BAND, headHeight, KINDS, lookOf, rowHeight } from './diagram-shapes.ts';
import { textWidth } from './diagram-text.ts';
import type { IconNode } from './slides.ts';

type Inflate = (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;

// ---- a small XML reader -------------------------------------------------------------------------------------------------

/** An element: its tag, its attributes (entities decoded), its child elements, and the text right inside it. */
export interface XmlEl {
  tag: string;
  attrs: Record<string, string>;
  kids: XmlEl[];
  text: string;
}

const XML_ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Text with its entities (named and numeric) as the characters they stand for. */
function decodeEntities(s: string, named: Record<string, string> = XML_ENT): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return named[e] ?? named[e.toLowerCase()] ?? m;
  });
}

const isWs = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;

/** A start tag at `at` ("<name a='1' b="2"/>"): its name, attributes, where it ends, and whether it closes itself. */
function readTag(src: string, at: number): { tag: string; attrs: Record<string, string>; end: number; closed: boolean } | null {
  const m = /^<([A-Za-z_][\w.:-]*)/.exec(src.slice(at, at + 256));
  if (!m) return null;
  const attrs: Record<string, string> = {};
  const n = src.length;
  let i = at + m[0].length;
  while (i < n) {
    while (i < n && isWs(src.charCodeAt(i))) i++;
    if (src[i] === '>') return { tag: m[1], attrs, end: i + 1, closed: false };
    if (src[i] === '/' && src[i + 1] === '>') return { tag: m[1], attrs, end: i + 2, closed: true };
    const s = i;
    while (i < n && !isWs(src.charCodeAt(i)) && src[i] !== '=' && src[i] !== '>' && src[i] !== '/') i++;
    const name = src.slice(s, i);
    if (!name) {
      i++;
      continue;
    }
    while (i < n && isWs(src.charCodeAt(i))) i++;
    if (src[i] !== '=') {
      attrs[name] = '';
      continue;
    }
    i++;
    while (i < n && isWs(src.charCodeAt(i))) i++;
    const q = src[i];
    let raw: string;
    if (q === '"' || q === "'") {
      const e = src.indexOf(q, i + 1);
      raw = src.slice(i + 1, e < 0 ? n : e);
      i = e < 0 ? n : e + 1;
    } else {
      const s2 = i;
      while (i < n && !isWs(src.charCodeAt(i)) && src[i] !== '>') i++;
      raw = src.slice(s2, i);
    }
    // As XML reads an attribute: its line breaks are spaces, its &#10; a line break.
    attrs[name] = decodeEntities(raw.replace(/[\t\n\r]/g, ' '));
  }
  return { tag: m[1], attrs, end: n, closed: true };
}

/**
 * XML as elements (its root returned): attributes in ' or ", elements that close themselves, text, comments, CDATA, the
 * <?xml ?> declaration and a DOCTYPE, the five entities and numeric ones. Forgiving: an end tag that closes nothing is
 * passed over, an element left open ends with the text.
 */
export function parseXml(src: string): XmlEl {
  const doc: XmlEl = { tag: '#document', attrs: {}, kids: [], text: '' };
  const stack: XmlEl[] = [doc];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const top = stack[stack.length - 1];
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      top.text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) top.text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      top.text += src.slice(lt + 9, e < 0 ? n : e);
      i = e < 0 ? n : e + 3;
    } else if (src[lt + 1] === '?') {
      const e = src.indexOf('?>', lt + 2);
      i = e < 0 ? n : e + 2;
    } else if (src[lt + 1] === '!') {
      // A DOCTYPE, with what its brackets hold.
      let j = lt + 2;
      let depth = 0;
      while (j < n && (src[j] !== '>' || depth > 0)) {
        if (src[j] === '[') depth++;
        else if (src[j] === ']') depth--;
        j++;
      }
      i = j + 1;
    } else if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt + 2);
      const name = src.slice(lt + 2, e < 0 ? n : e).trim();
      for (let k = stack.length - 1; k > 0; k--)
        if (stack[k].tag === name) {
          stack.length = k;
          break;
        }
      i = e < 0 ? n : e + 1;
    } else {
      const t = readTag(src, lt);
      if (!t) {
        top.text += '<';
        i = lt + 1;
        continue;
      }
      const el: XmlEl = { tag: t.tag, attrs: t.attrs, kids: [], text: '' };
      top.kids.push(el);
      if (!t.closed) stack.push(el);
      i = t.end;
    }
  }
  const root = doc.kids[0];
  if (!root) throw new Error('This is not XML.');
  return root;
}

const kid = (el: XmlEl, tag: string) => el.kids.find((k) => k.tag === tag);

// ---- bytes: base64, UTF-8, PNG chunks --------------------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_AT = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
  t[45] = 62; // "-" and "_" of the URL-safe alphabet
  t[95] = 63;
  return t;
})();

function fromBase64(s: string): Uint8Array {
  const out = new Uint8Array(Math.ceil((s.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64_AT[c] : -1;
    if (v < 0) continue;
    buf = ((buf << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

function toBase64(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const fromUtf8 = (b: Uint8Array) => new TextDecoder().decode(b);
const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
};
const uriDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Deflated bytes inflated: raw, as draw.io writes them, or in zlib's wrapping (its two bytes ahead, four behind). */
async function inflateAny(data: Uint8Array, inflate: Inflate): Promise<Uint8Array> {
  const zlib = data.length > 6 && (data[0] & 0x0f) === 8 && ((data[0] << 8) | data[1]) % 31 === 0;
  if (zlib) {
    try {
      return await inflate(data.subarray(2, data.length - 4));
    } catch {
      // Raw after all.
    }
  }
  return await inflate(data);
}

/** A <diagram>'s compressed content as its XML: base64, raw deflate, then URI-encoded text. */
async function decompress(text: string, inflate: Inflate): Promise<string> {
  return uriDecode(fromUtf8(await inflateAny(fromBase64(text), inflate)));
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng = (b: Uint8Array) => b.length > 8 && PNG_SIG.every((v, i) => b[i] === v);

/** The text chunks of a PNG ahead of its picture, each keyword with its value (zTXt and iTXt left to inflate). */
function pngChunks(b: Uint8Array): { key: string; type: string; data: Uint8Array }[] {
  const out: { key: string; type: string; data: Uint8Array }[] = [];
  let pos = 8;
  while (pos + 8 <= b.length) {
    const len = ((b[pos] << 24) | (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3]) >>> 0;
    const type = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    if (type === 'IDAT' || type === 'IEND' || pos + 12 + len > b.length + 4) break;
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const z = data.indexOf(0);
      if (z > 0) out.push({ key: latin1(data.subarray(0, z)), type, data: data.subarray(z + 1) });
    }
    pos += 12 + len;
  }
  return out;
}

/** The draw.io file a PNG carries (draw.io writes it URI-encoded), or null. */
async function pngDrawio(b: Uint8Array, inflate: Inflate): Promise<string | null> {
  for (const c of pngChunks(b)) {
    if (c.key !== 'mxfile' && c.key !== 'mxGraphModel') continue;
    let text: string;
    if (c.type === 'tEXt') text = latin1(c.data);
    else if (c.type === 'zTXt') text = latin1(await inflateAny(c.data.subarray(1), inflate));
    else {
      // iTXt: compressed or not, its method, its language and translated keyword, then UTF-8 text.
      const compressed = c.data[0] === 1;
      let p = 2;
      for (let k = 0; k < 2; k++) p = c.data.indexOf(0, p) + 1;
      if (p <= 0) continue;
      const body = c.data.subarray(p);
      text = fromUtf8(compressed ? await inflateAny(body, inflate) : body);
    }
    // Java's URL encoder wrote its spaces as "+" (draw.io's old PNGs).
    if (c.type === 'zTXt') text = text.replace(/\+/g, ' ');
    for (let k = 0; k < 2 && text.startsWith('%'); k++) text = uriDecode(text);
    return text;
  }
  return null;
}

/** Whether text or bytes look like a draw.io file (mxfile / mxGraphModel / draw.io SVG, or a PNG carrying one). */
export function isDrawio(input: string | Uint8Array): boolean {
  if (typeof input !== 'string') {
    if (isPng(input)) return pngChunks(input).some((c) => c.key === 'mxfile' || c.key === 'mxGraphModel');
    input = fromUtf8(input.subarray(0, 1 << 20));
  }
  const head = input.replace(/^﻿/, '').trimStart().slice(0, 1 << 20);
  if (!head.startsWith('<')) return /^%3C(mxfile|mxGraphModel)/i.test(head);
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(mxfile|mxGraphModel)[\s>]/.test(head)) return true;
  return /<svg\b[^>]*?\scontent\s*=\s*["']\s*(&lt;\?xml[^>]*?\?&gt;\s*)?(&lt;|%3C)\s*(mxfile|mxGraphModel)/i.test(head);
}

// ---- the file's pages ---------------------------------------------------------------------------------------------------

interface RawPage {
  id?: string;
  name?: string;
  /** Its model; null for an empty page. */
  model: XmlEl | null;
  /** It could not be read. */
  bad?: boolean;
}

/** A <diagram>'s model: an <mxGraphModel> inside it, or its text (XML, URI-encoded XML, or compressed). */
async function modelOf(d: XmlEl, inflate: Inflate): Promise<XmlEl | null> {
  const m = kid(d, 'mxGraphModel');
  if (m) return m;
  const raw = d.text.trim();
  if (!raw) return null;
  const xml = raw.startsWith('<') ? raw : /^%3C/i.test(raw) ? uriDecode(raw) : await decompress(raw, inflate);
  const el = parseXml(xml);
  return el.tag === 'mxGraphModel' ? el : (kid(el, 'mxGraphModel') ?? null);
}

/** The pages a draw.io file holds, each with its model (null for one that could not be read). */
async function readPages(text: string, inflate: Inflate, depth = 0): Promise<RawPage[]> {
  const t = text.replace(/^﻿/, '').trim();
  const notIt = () => new Error('This is not a draw.io file.');
  if (depth > 3) throw notIt();
  if (!t.startsWith('<')) {
    if (/^%3C/i.test(t)) return readPages(uriDecode(t), inflate, depth + 1);
    if (/^[A-Za-z0-9+/=\s]{16,}$/.test(t.slice(0, 4000))) {
      let inner: string;
      try {
        inner = await decompress(t, inflate);
      } catch {
        throw notIt();
      }
      return readPages(inner, inflate, depth + 1);
    }
    throw notIt();
  }
  let root: XmlEl;
  try {
    root = parseXml(t);
  } catch {
    throw notIt();
  }
  if (root.tag === 'svg') {
    const content = root.attrs.content;
    if (!content) throw new Error('This SVG holds no draw.io diagram.');
    return readPages(content, inflate, depth + 1);
  }
  if (root.tag === 'mxGraphModel') return [{ model: root }];
  if (root.tag === 'diagram') root = { tag: 'mxfile', attrs: {}, kids: [root], text: '' };
  if (root.tag !== 'mxfile') throw notIt();
  const out: RawPage[] = [];
  for (const d of root.kids.filter((k) => k.tag === 'diagram')) {
    try {
      out.push({ id: d.attrs.id, name: d.attrs.name, model: await modelOf(d, inflate) });
    } catch {
      out.push({ id: d.attrs.id, name: d.attrs.name, model: null, bad: true });
    }
  }
  if (!out.length) throw new Error('This draw.io file has no pages.');
  return out;
}

// ---- draw.io's styles ---------------------------------------------------------------------------------------------------

/** A cell's style: its key=value pairs, and its bare words (named styles of draw.io's: "ellipse", "text", "swimlane"…). */
interface Sty {
  map: Map<string, string>;
  named: string[];
}

function parseStyle(s: string | undefined): Sty {
  const map = new Map<string, string>();
  const named: string[] = [];
  let last = '';
  for (const part of (s ?? '').split(';')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq > 0) {
      last = p.slice(0, eq).trim();
      map.set(last, p.slice(eq + 1).trim());
    } else if (last === 'image' && p.startsWith('base64,')) map.set('image', `${map.get('image')};${p}`);
    else named.push(p);
  }
  return { map, named };
}

/** What the named styles of draw.io's own stylesheet bring, under what a style says itself. */
const NAMED: Record<string, Record<string, string>> = {
  text: { fillColor: 'none', strokeColor: 'none', align: 'left', verticalAlign: 'top' },
  edgeLabel: { fillColor: 'none', strokeColor: 'none', align: 'left', verticalAlign: 'top', fontSize: '11' },
  label: { shape: 'label', fontStyle: '1', align: 'left', rounded: '1' },
  icon: { shape: 'label', verticalLabelPosition: 'bottom', verticalAlign: 'top' },
  swimlane: { shape: 'swimlane', fontStyle: '1', startSize: '23' },
  group: { verticalAlign: 'top', fillColor: 'none', strokeColor: 'none' },
  ellipse: { shape: 'ellipse' },
  rhombus: { shape: 'rhombus' },
  triangle: { shape: 'triangle' },
  line: { shape: 'line', strokeWidth: '4', verticalAlign: 'top' },
  image: { shape: 'image', verticalLabelPosition: 'bottom', verticalAlign: 'top' },
  roundImage: { shape: 'image', verticalLabelPosition: 'bottom', verticalAlign: 'top' },
  rhombusImage: { shape: 'image', verticalLabelPosition: 'bottom', verticalAlign: 'top' },
};

/** A style's value for a key: its own, or its named style's. */
function sv(st: Sty, k: string): string | undefined {
  const v = st.map.get(k);
  if (v !== undefined) return v;
  for (const n of st.named) {
    const d = NAMED[n]?.[k];
    if (d !== undefined) return d;
  }
  return undefined;
}
function svNum(st: Sty, k: string): number | undefined {
  const v = sv(st, k);
  const n = v === undefined || v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
const on = (st: Sty, k: string) => sv(st, k) === '1' || sv(st, k) === 'true';
/** The shape a style draws: its shape=…, its named style's, or a rectangle. */
const baseOf = (st: Sty) => sv(st, 'shape') ?? 'rectangle';
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A colour of draw.io's as a diagram keeps it (#rrggbb or 'none'); undefined for its own defaults ("default", "inherit"). */
function colour(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const ld = /^light-dark\(\s*([^,]+),/i.exec(v);
  return cleanColour(ld ? ld[1] : v);
}

/** A draw.io font family as one of a diagram's fonts. */
function fontOf(family: string | undefined): FontKind | undefined {
  if (!family) return undefined;
  const f = family.toLowerCase();
  if (/mono|courier|consol|menlo|lucida console|source code|terminal/.test(f)) return 'mono';
  if (/comic|architects daughter|hand|kalam|virgil|caveat|indie flower|segoe print|gloria|xkcd|script|marker|chalk/.test(f)) return 'hand';
  if (/sans/.test(f)) return 'sans';
  if (/serif|times|georgia|garamond|cambria|palatino|baskerville|didot|book/.test(f)) return 'serif';
  return 'sans';
}

function dashOf(st: Sty): Dash {
  if (!on(st, 'dashed')) return 'solid';
  const p = (sv(st, 'dashPattern') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((x) => Number.isFinite(x) && x > 0);
  if (p.length >= 4) return 'dash-dot';
  if (p.length && p[0] <= 2) return 'dotted';
  return 'dashed';
}

// ---- labels ---------------------------------------------------------------------------------------------------------------

const HTML_ENT: Record<string, string> = {
  ...XML_ENT,
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  micro: 'µ',
  sect: '§',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  le: '≤',
  ge: '≥',
  ne: '≠',
  infin: '∞',
  check: '✓',
};
const BLOCKS = new Set(['div', 'p', 'li', 'ul', 'ol', 'tr', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr', 'section', 'header', 'footer']);

/**
 * An HTML label's words: a line for each line break and each block (as a browser lays them out: a <br> always breaks, a
 * block starts on a line of its own), other tags left out, entities decoded, spaces run together as HTML runs them.
 */
export function htmlText(html: string): string {
  const lines: string[] = [];
  let cur = '';
  const soft = () => {
    if (cur.replace(/[ \t\n\r\f]/g, '')) lines.push(cur);
    cur = '';
  };
  const re = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*>|<!--[\s\S]*?-->|([^<]+)|</g;
  let skip = false;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[3] !== undefined) {
      if (!skip) cur += decodeEntities(m[3], HTML_ENT).replace(/[ \t\n\r\f]+/g, ' ');
      continue;
    }
    if (!m[2]) {
      if (m[0] === '<' && !skip) cur += '<';
      continue;
    }
    const tag = m[2].toLowerCase();
    const close = m[1] === '/';
    if (tag === 'script' || tag === 'style') {
      skip = !close;
      continue;
    }
    if (skip) continue;
    if (tag === 'br') {
      lines.push(cur);
      cur = '';
    } else if (BLOCKS.has(tag)) {
      soft();
      if (tag === 'li' && !close) cur = '• ';
    } else if ((tag === 'td' || tag === 'th') && !close && cur.trim()) cur += ' ';
  }
  soft();
  return lines
    .map((l) => l.replace(/[ \t\n\r\f]+/g, ' ').replace(/^[ \t]+|[ \t]+$/g, '').replace(/ /g, ' '))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

/** A cell's words: its label (with its object's %placeholders% filled in), from HTML when it is HTML. */
function labelOf(value: string, st: Sty, attrs: Record<string, string>): string {
  let v = value ?? '';
  if (attrs.placeholders === '1') v = v.replace(/%([\w.-]+)%/g, (m, k: string) => (k !== 'label' && Object.hasOwn(attrs, k) ? attrs[k] : m));
  if (on(st, 'html')) v = htmlText(v);
  v = v.replace(/\r\n?/g, '\n');
  return v.trim() ? v : '';
}

/** Words as an HTML label: escaped, a <br> for each line break, spaces kept where HTML would run them together. */
function htmlLabel(t: string): string {
  return t
    .split('\n')
    .map((line) =>
      line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/ {2,}/g, (m) => `${'&nbsp;'.repeat(m.length - 1)} `)
        .replace(/^ /, '&nbsp;'),
    )
    .join('<br>');
}

// ---- shapes: draw.io's and a diagram's kinds ------------------------------------------------------------------------------

/**
 * Each kind as draw.io draws it: its own shape where it has one (its core shapes first, then its built-in flowchart and
 * basic stencils). A kind with none is drawn as the nearest, and diagramToDrawio marks it with hydorShape=… so it reads
 * back as itself.
 */
const KIND_OUT: Record<ShapeKind, string> = {
  rect: 'rounded=0;whiteSpace=wrap;html=1;',
  rounded: 'rounded=1;whiteSpace=wrap;html=1;',
  ellipse: 'ellipse;whiteSpace=wrap;html=1;',
  diamond: 'rhombus;whiteSpace=wrap;html=1;',
  triangle: 'triangle;direction=north;whiteSpace=wrap;html=1;',
  'triangle-right': 'triangle;whiteSpace=wrap;html=1;',
  hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;',
  octagon: 'shape=mxgraph.basic.octagon2;dx=15;whiteSpace=wrap;html=1;',
  pentagon: 'shape=mxgraph.basic.pentagon;whiteSpace=wrap;html=1;',
  parallelogram: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
  trapezoid: 'shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
  star: 'shape=mxgraph.basic.star;whiteSpace=wrap;html=1;',
  cross: 'shape=cross;whiteSpace=wrap;html=1;',
  heart: 'shape=mxgraph.basic.heart;whiteSpace=wrap;html=1;',
  cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;',
  cloud: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;',
  document: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;',
  note: 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=18;',
  card: 'shape=card;whiteSpace=wrap;html=1;size=18;',
  callout: 'shape=callout;whiteSpace=wrap;html=1;perimeter=calloutPerimeter;',
  cube: 'shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=18;',
  step: 'shape=step;perimeter=stepPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
  chevron: 'shape=mxgraph.arrows2.arrow;dy=0;notch=0;whiteSpace=wrap;html=1;',
  'arrow-right': 'shape=singleArrow;whiteSpace=wrap;html=1;arrowWidth=0.48;arrowSize=0.38;',
  'arrow-left': 'shape=singleArrow;direction=west;whiteSpace=wrap;html=1;arrowWidth=0.48;arrowSize=0.38;',
  'arrow-up': 'shape=singleArrow;direction=north;whiteSpace=wrap;html=1;arrowWidth=0.48;arrowSize=0.38;',
  'arrow-down': 'shape=singleArrow;direction=south;whiteSpace=wrap;html=1;arrowWidth=0.48;arrowSize=0.38;',
  'arrow-both': 'shape=doubleArrow;whiteSpace=wrap;html=1;arrowWidth=0.48;arrowSize=0.28;',
  text: 'text;html=1;whiteSpace=wrap;',
  image: 'shape=image;html=1;imageAspect=1;',
  icon: 'shape=image;html=1;imageAspect=1;',
  sticky: 'rounded=0;whiteSpace=wrap;html=1;',
  brace: 'shape=curlyBracket;whiteSpace=wrap;html=1;rounded=1;',
  bracket: 'shape=partialRectangle;whiteSpace=wrap;html=1;top=0;bottom=0;',
  terminator: 'shape=mxgraph.flowchart.terminator;whiteSpace=wrap;html=1;',
  predefined: 'shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;',
  'manual-input': 'shape=manualInput;whiteSpace=wrap;html=1;',
  delay: 'shape=delay;whiteSpace=wrap;html=1;',
  display: 'shape=display;whiteSpace=wrap;html=1;',
  'multi-document': 'shape=mxgraph.flowchart.multi-document;whiteSpace=wrap;html=1;',
  'off-page': 'shape=offPageConnector;whiteSpace=wrap;html=1;',
  connector: 'shape=mxgraph.flowchart.on-page_reference;whiteSpace=wrap;html=1;',
  'manual-operation': 'shape=mxgraph.flowchart.manual_operation;whiteSpace=wrap;html=1;',
  'stored-data': 'shape=dataStorage;whiteSpace=wrap;html=1;fixedSize=1;',
  'internal-storage': 'shape=internalStorage;whiteSpace=wrap;html=1;backgroundOutline=1;',
  merge: 'shape=mxgraph.flowchart.merge_or_storage;whiteSpace=wrap;html=1;',
  extract: 'shape=mxgraph.flowchart.extract_or_measurement;whiteSpace=wrap;html=1;',
  sort: 'shape=sortShape;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;',
  collate: 'shape=collate;whiteSpace=wrap;html=1;',
  or: 'shape=orEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;',
  summing: 'shape=sumEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;',
  'loop-limit': 'shape=loopLimit;whiteSpace=wrap;html=1;',
  'punched-tape': 'shape=tape;whiteSpace=wrap;html=1;',
  annotation: 'shape=mxgraph.flowchart.annotation_1;whiteSpace=wrap;html=1;',
  container: 'rounded=0;whiteSpace=wrap;html=1;container=1;collapsible=0;',
  swimlane: `swimlane;whiteSpace=wrap;html=1;startSize=${BAND};`,
  lane: `swimlane;horizontal=0;whiteSpace=wrap;html=1;startSize=${BAND};`,
  class: 'swimlane;childLayout=stackLayout;horizontal=1;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;',
  entity: 'swimlane;childLayout=stackLayout;horizontal=1;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;',
  table: 'shape=table;container=1;collapsible=0;childLayout=tableLayout;fixedRows=1;rowLines=1;whiteSpace=wrap;html=1;',
  actor: 'shape=umlActor;html=1;outlineConnect=0;',
  component: 'shape=component;whiteSpace=wrap;html=1;',
  package: 'shape=folder;tabWidth=80;tabHeight=22;tabPosition=left;whiteSpace=wrap;html=1;',
  lifeline: 'shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;dropTarget=0;collapsible=0;recursiveResize=0;outlineConnect=0;portConstraint=eastwest;size=40;',
  activation: 'html=1;points=[];perimeter=orthogonalPerimeter;outlineConnect=0;targetShapes=umlLifeline;portConstraint=eastwest;',
  initial: 'ellipse;shape=startState;html=1;',
  final: 'ellipse;shape=endState;html=1;',
  bar: 'rounded=0;html=1;points=[];',
  frame: 'shape=umlFrame;whiteSpace=wrap;html=1;pointerEvents=0;',
  event: 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;',
  'event-end': 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;',
  'event-mid': 'ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;aspect=fixed;',
  gateway: 'rhombus;whiteSpace=wrap;html=1;',
  'gateway-parallel': 'rhombus;whiteSpace=wrap;html=1;',
  'gateway-inclusive': 'rhombus;whiteSpace=wrap;html=1;',
  'data-object': 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=14;',
};

/** draw.io's shapes (shape=…, lower case) as a diagram's kinds. */
const BASES: Record<string, ShapeKind> = {
  rectangle: 'rect',
  rect: 'rect',
  label: 'rect',
  ext: 'rect',
  tablerow: 'rect',
  'mxgraph.flowchart.process': 'rect',
  'mxgraph.basic.rect': 'rect',
  ellipse: 'ellipse',
  doubleellipse: 'ellipse',
  lineellipse: 'ellipse',
  umlboundary: 'ellipse',
  umlentity: 'ellipse',
  umlcontrol: 'ellipse',
  lollipop: 'ellipse',
  'mxgraph.flowchart.start_1': 'ellipse',
  'mxgraph.flowchart.start_2': 'ellipse',
  'mxgraph.flowchart.sequential_data': 'ellipse',
  rhombus: 'diamond',
  'mxgraph.flowchart.decision': 'diamond',
  'mxgraph.basic.acute_triangle': 'triangle',
  hexagon: 'hexagon',
  'mxgraph.flowchart.preparation': 'hexagon',
  octagon: 'octagon',
  'mxgraph.basic.octagon2': 'octagon',
  'mxgraph.basic.octagon': 'octagon',
  pentagon: 'pentagon',
  'mxgraph.basic.pentagon': 'pentagon',
  parallelogram: 'parallelogram',
  'mxgraph.flowchart.data': 'parallelogram',
  trapezoid: 'trapezoid',
  star: 'star',
  'mxgraph.basic.star': 'star',
  'mxgraph.basic.4_point_star_2': 'star',
  'mxgraph.basic.6_point_star': 'star',
  'mxgraph.basic.8_point_star': 'star',
  cross: 'cross',
  plus: 'cross',
  heart: 'heart',
  'mxgraph.basic.heart': 'heart',
  cylinder: 'cylinder',
  cylinder2: 'cylinder',
  cylinder3: 'cylinder',
  datastore: 'cylinder',
  'mxgraph.flowchart.database': 'cylinder',
  'mxgraph.flowchart.direct_data': 'cylinder',
  cloud: 'cloud',
  document: 'document',
  'mxgraph.flowchart.document': 'document',
  note: 'note',
  note2: 'note',
  'mxgraph.basic.document': 'note',
  card: 'card',
  'mxgraph.flowchart.card': 'card',
  callout: 'callout',
  'mxgraph.basic.rectangular_callout': 'callout',
  'mxgraph.basic.rounded_rectangular_callout': 'callout',
  'mxgraph.basic.oval_callout': 'callout',
  'mxgraph.basic.cloud_callout': 'callout',
  cube: 'cube',
  isocube: 'cube',
  isocube2: 'cube',
  'mxgraph.basic.isocube': 'cube',
  step: 'step',
  doublearrow: 'arrow-both',
  'mxgraph.arrows2.twowayarrow': 'arrow-both',
  'mxgraph.flowchart.transfer': 'arrow-right',
  image: 'image',
  curlybracket: 'brace',
  process: 'predefined',
  process2: 'predefined',
  'mxgraph.flowchart.predefined_process': 'predefined',
  manualinput: 'manual-input',
  'mxgraph.flowchart.manual_input': 'manual-input',
  delay: 'delay',
  'mxgraph.flowchart.delay': 'delay',
  display: 'display',
  'mxgraph.flowchart.display': 'display',
  'mxgraph.flowchart.multi-document': 'multi-document',
  offpageconnector: 'off-page',
  'mxgraph.flowchart.off-page_reference': 'off-page',
  'mxgraph.flowchart.on-page_reference': 'connector',
  'mxgraph.flowchart.manual_operation': 'manual-operation',
  datastorage: 'stored-data',
  'mxgraph.flowchart.stored_data': 'stored-data',
  internalstorage: 'internal-storage',
  'mxgraph.flowchart.internal_storage': 'internal-storage',
  'mxgraph.flowchart.merge_or_storage': 'merge',
  'mxgraph.flowchart.extract_or_measurement': 'extract',
  sortshape: 'sort',
  'mxgraph.flowchart.sort': 'sort',
  collate: 'collate',
  'mxgraph.flowchart.collate': 'collate',
  orellipse: 'or',
  'mxgraph.flowchart.or': 'or',
  sumellipse: 'summing',
  'mxgraph.flowchart.summing_function': 'summing',
  looplimit: 'loop-limit',
  'mxgraph.flowchart.loop_limit': 'loop-limit',
  tape: 'punched-tape',
  'mxgraph.flowchart.paper_tape': 'punched-tape',
  'mxgraph.flowchart.annotation_1': 'annotation',
  'mxgraph.flowchart.annotation_2': 'annotation',
  'mxgraph.flowchart.terminator': 'terminator',
  'mxgraph.flowchart.parallel_mode': 'bar',
  table: 'table',
  umlactor: 'actor',
  umllifeline: 'lifeline',
  umlframe: 'frame',
  component: 'component',
  module: 'component',
  folder: 'package',
  umlstate: 'rounded',
  startstate: 'initial',
  endstate: 'final',
  line: 'bar',
};

/** Kinds draw.io's direction=… does not change (drawn turned in the same box, they look the same). */
const TURN_FREE = new Set<ShapeKind>([
  'rect', 'rounded', 'ellipse', 'diamond', 'octagon', 'cross', 'text', 'image', 'icon', 'container', 'swimlane', 'lane', 'class', 'entity', 'table',
  'terminator', 'connector', 'or', 'summing', 'initial', 'final', 'event', 'event-end', 'event-mid', 'gateway', 'gateway-parallel', 'gateway-inclusive',
  'sticky', 'activation', 'lifeline', 'frame', 'actor', 'star', 'sort', 'bar', 'collate',
]);

/** A cell's kind, as its style says, with how it is turned and flipped (`swap`: its box turned a quarter). */
interface Found {
  kind: ShapeKind;
  rot: number;
  flipH: boolean;
  flipV: boolean;
  swap: boolean;
  /** A shape of draw.io's a diagram has no kind for (a stencil library's prefix, or its name), drawn as a rectangle. */
  lacks?: string;
}

function detect(st: Sty): Found {
  const base = baseOf(st);
  const b = base.toLowerCase();
  let flipH = on(st, 'flipH');
  let flipV = on(st, 'flipV');
  const dir = (sv(st, 'direction') ?? 'east').toLowerCase();
  const found = (kind: ShapeKind, rot = 0, swap = false, lacks?: string): Found => ({ kind, rot, flipH, flipV, swap, ...(lacks ? { lacks } : {}) });
  // A kind draw.io lacks, written as its nearest shape: itself while that shape is still the one drawn.
  const mark = st.map.get('hydorShape');
  if (mark && isShapeKind(mark) && baseOf(parseStyle(KIND_OUT[mark])).toLowerCase() === b) return found(mark);
  if ((st.named.includes('text') || st.named.includes('edgeLabel')) && !st.map.has('shape')) return found('text');
  if (b === 'image' || (st.named.includes('icon') && st.map.has('image'))) return found('image');
  if (st.map.has('hydorSrc') && b === 'rectangle') return found('image');
  if (b === 'rectangle' && /umlLifeline/.test(sv(st, 'targetShapes') ?? '')) return found('activation');
  // Which way a triangle or an arrow points (east unless turned), its flips taken in.
  const pointing = () => {
    let d = dir === 'north' || dir === 'south' || dir === 'west' ? dir : 'east';
    if (flipH) d = d === 'east' ? 'west' : d === 'west' ? 'east' : d;
    if (flipV) d = d === 'north' ? 'south' : d === 'south' ? 'north' : d;
    flipH = flipV = false;
    return d;
  };
  if (b === 'triangle') {
    const p = pointing();
    if (p === 'west') flipH = true;
    if (p === 'south') flipV = true;
    return found(p === 'east' || p === 'west' ? 'triangle-right' : 'triangle');
  }
  const dy = svNum(st, 'dy') ?? 0.6;
  if (b === 'singlearrow' || b === 'flexarrow' || (b === 'mxgraph.arrows2.arrow' && dy > 0.05)) {
    const p = pointing();
    return found(p === 'east' ? 'arrow-right' : p === 'west' ? 'arrow-left' : p === 'north' ? 'arrow-up' : 'arrow-down');
  }
  if (b === 'partialrectangle') {
    const side = (k: string) => sv(st, k) !== '0';
    const [t, r, bt, l] = [side('top'), side('right'), side('bottom'), side('left')];
    if (!t && !bt && l && r) return found('bracket');
    if (t && bt && l && !r) return found('annotation');
    if (t && bt && !l && r) {
      flipH = !flipH;
      return found('annotation');
    }
    return found('rect');
  }
  if (b.startsWith('mxgraph.bpmn.')) {
    const name = b.slice(13);
    const outline = sv(st, 'outline') ?? '';
    const sym = `${sv(st, 'symbol') ?? ''} ${sv(st, 'gwType') ?? ''}`.toLowerCase();
    if (name.startsWith('gateway') || sv(st, 'background') === 'gateway' || sv(st, 'perimeter') === 'rhombusPerimeter')
      return found(sym.includes('parallel') ? 'gateway-parallel' : sym.includes('inclusive') || (outline === 'end' && sym.includes('general')) ? 'gateway-inclusive' : 'gateway');
    if (name === 'event' || name === 'shape') return found(outline === 'end' ? 'event-end' : outline && outline !== 'standard' && outline !== 'none' ? 'event-mid' : 'event');
    if (name.startsWith('data')) return found('data-object');
    if (name.startsWith('task')) return found('rounded');
  }
  let kind: ShapeKind | undefined;
  let lacks: string | undefined;
  if (b === 'swimlane') kind = sv(st, 'horizontal') === '0' ? 'lane' : 'swimlane';
  else if (b === 'mxgraph.arrows2.arrow') kind = (svNum(st, 'notch') ?? 0) > 0 ? 'step' : 'chevron';
  else kind = BASES[b];
  if (!kind) {
    kind = 'rect';
    lacks = b.startsWith('mxgraph.') ? base.split('.').slice(0, 2).join('.') : b.startsWith('stencil(') ? 'stencil' : base;
  }
  if (kind === 'rect' && on(st, 'rounded')) kind = !on(st, 'absoluteArcSize') && (svNum(st, 'arcSize') ?? 15) >= 50 ? 'terminator' : 'rounded';
  // draw.io's brace opens to the right ("{"); a diagram's to the left ("}").
  if (kind === 'brace') flipH = !flipH;
  let rot = b === 'mxgraph.flowchart.direct_data' ? 90 : 0;
  let swap = rot !== 0;
  if (!TURN_FREE.has(kind)) {
    if (dir === 'south' || dir === 'north') {
      rot += dir === 'south' ? 90 : 270;
      swap = !swap;
    } else if (dir === 'west') flipH = !flipH;
  }
  return found(kind, rot % 360, swap, lacks);
}

/** Kinds drawn as a box with rounded corners (style.radius). */
const RADIUS_KINDS = new Set<ShapeKind>(['rect', 'rounded', 'container', 'entity']);
/** Kinds whose words are in a title band (where they sit in it is the band's). */
const BAND_KINDS = new Set<ShapeKind>(['swimlane', 'lane', 'class', 'entity', 'table']);
const ALIGNS = new Set(['left', 'center', 'right']);
const VALIGNS = new Set(['top', 'middle', 'bottom']);

/** The theme's own line or fill for a kind drawn in its line's colour: black in draw.io's palettes. */
const isBlack = (c: string | undefined) => c === '#000000';

/**
 * A shape's look from its style: only what draws differently from its kind's own look (KINDS) and the theme's, so that
 * what is left out follows them. A colour draw.io leaves to its defaults is left to the theme's.
 */
function shapeLook(st: Sty, kind: ShapeKind, w: number, h: number, words: boolean): DiagramStyle {
  const s: DiagramStyle = {};
  // A table's or a class's name is bold unless it says otherwise.
  const own: DiagramStyle = ROW_KINDS.has(kind) ? { ...KINDS[kind]?.style, bold: true } : (KINDS[kind]?.style ?? {});
  const fill = colour(sv(st, 'fillColor'));
  const stroke = colour(sv(st, 'strokeColor'));
  if (kind === 'initial' || kind === 'final' || kind === 'bar') {
    // Drawn solid in their line's colour: draw.io's fill (its line, for a bar drawn as a line).
    const c = kind === 'bar' && baseOf(st) === 'line' ? stroke : fill && fill !== 'none' ? fill : stroke;
    if (c && c !== 'none' && !isBlack(c)) s.stroke = c;
  } else {
    if (fill && fill !== own.fill) s.fill = fill;
    if (stroke && stroke !== own.stroke) s.stroke = stroke;
    if (kind === 'rect' && baseOf(st) === 'partialRectangle' && ['top', 'right', 'bottom', 'left'].every((k) => sv(st, k) === '0')) s.stroke = 'none';
    const gradient = colour(sv(st, 'gradientColor'));
    if (gradient && gradient !== 'none' && fill !== 'none') s.gradient = gradient;
  }
  const width = svNum(st, 'strokeWidth');
  if (width !== undefined && kind !== 'bar' && width !== (own.width ?? (kind === 'icon' ? 2 : 1.5))) s.width = width;
  const dash = dashOf(st);
  if (dash !== (own.dash ?? 'solid')) s.dash = dash;
  const opacity = svNum(st, 'opacity');
  if (opacity !== undefined && opacity < 100) s.opacity = Math.max(0, Math.round(opacity));
  if (on(st, 'shadow') && !own.shadow) s.shadow = true;
  if (on(st, 'sketch')) s.sketch = true;
  if (RADIUS_KINDS.has(kind)) {
    const r = on(st, 'rounded') ? (on(st, 'absoluteArcSize') ? Math.min((svNum(st, 'arcSize') ?? 20) / 2, w / 2, h / 2) : (Math.min(w, h) * (svNum(st, 'arcSize') ?? 15)) / 100) : 0;
    const dflt = own.radius ?? (kind === 'rounded' ? Math.min(16, Math.min(w, h) * 0.18) : 0);
    // draw.io's own rounding (15% of the shorter side) is near enough the kind's; a radius it is given is kept.
    const slack = kind === 'rounded' && !st.map.has('arcSize') ? 2 : 0.01;
    if (Math.abs(r - dflt) >= slack) s.radius = r2(r);
  }
  if (words) {
    Object.assign(s, wordsLook(st, own, 12, 14));
    const vlp = sv(st, 'verticalLabelPosition');
    const lp = sv(st, 'labelPosition');
    const label: LabelPos = vlp === 'bottom' ? 'below' : vlp === 'top' ? 'above' : lp === 'right' ? 'right' : lp === 'left' ? 'left' : 'inside';
    if (label !== (own.label ?? 'inside')) s.label = label;
    // Beside a shape, its words' alignment only says which side they are on.
    if (label === 'inside' && kind !== 'class' && kind !== 'entity' && kind !== 'table') {
      const align = sv(st, 'align') ?? 'center';
      const valign = sv(st, 'verticalAlign') ?? 'middle';
      if (ALIGNS.has(align) && align !== (own.align ?? 'center')) s.align = align as DiagramStyle['align'];
      if (!BAND_KINDS.has(kind) && VALIGNS.has(valign) && valign !== (own.valign ?? 'middle')) s.valign = valign as DiagramStyle['valign'];
    }
  }
  return s;
}

/** The words' look (their size, font, colour, bold, italic, underline) where it is not the kind's own. */
function wordsLook(st: Sty, own: DiagramStyle, drawioSize: number, ourSize: number): DiagramStyle {
  const s: DiagramStyle = {};
  const size = svNum(st, 'fontSize') ?? drawioSize;
  if (size !== (own.size ?? ourSize)) s.size = size;
  const fs = svNum(st, 'fontStyle') ?? 0;
  if (fs & 1 && !own.bold) s.bold = true;
  if (fs & 2 && !own.italic) s.italic = true;
  if (fs & 4 && !own.underline) s.underline = true;
  const color = colour(sv(st, 'fontColor'));
  if (color && color !== 'none' && color !== own.color) s.color = color;
  const font = fontOf(sv(st, 'fontFamily'));
  if (font && font !== (own.font ?? 'sans')) s.font = font;
  return s;
}

/** An arrowhead of draw.io's (its name, filled or not) as a diagram's. */
function arrowIn(name: string | undefined, fill: string | undefined, dflt: ArrowKind): ArrowKind {
  if (name === undefined || name === '') return dflt;
  const filled = fill !== '0';
  switch (name) {
    case 'none':
      return 'none';
    case 'classic':
    case 'classicThin':
      return filled ? 'arrow' : 'triangle';
    case 'block':
    case 'blockThin':
    case 'doubleBlock':
      return filled ? 'block' : 'triangle';
    case 'open':
    case 'openThin':
    case 'openAsync':
    case 'async':
      return 'open';
    case 'oval':
    case 'circle':
      return filled ? 'circle' : 'circle-open';
    case 'halfCircle':
    case 'circlePlus':
      return 'circle-open';
    case 'diamond':
    case 'diamondThin':
      return filled ? 'diamond' : 'diamond-open';
    case 'dash':
    case 'baseDash':
      return 'bar';
    case 'cross':
      return 'cross';
    case 'ERone':
      return 'er-one';
    case 'ERmandOne':
      return 'er-only-one';
    case 'ERzeroToOne':
      return 'er-zero-one';
    case 'ERmany':
      return 'er-many';
    case 'ERoneToMany':
      return 'er-one-many';
    case 'ERzeroToMany':
      return 'er-zero-many';
  }
  return arrowFrom(name) ?? 'arrow';
}

/** A connector's look: its line, its ends, its bends and its words. */
function edgeLook(st: Sty, route: RouteKind, words: boolean): DiagramStyle {
  const s: DiagramStyle = {};
  const stroke = colour(sv(st, 'strokeColor'));
  if (stroke) s.stroke = stroke;
  const width = svNum(st, 'strokeWidth');
  if (width !== undefined && width !== 1.5) s.width = width;
  const dash = dashOf(st);
  if (dash !== 'solid') s.dash = dash;
  const opacity = svNum(st, 'opacity');
  if (opacity !== undefined && opacity < 100) s.opacity = Math.max(0, Math.round(opacity));
  if (on(st, 'sketch')) s.sketch = true;
  if (on(st, 'flowAnimation')) s.flow = true;
  const start = arrowIn(sv(st, 'startArrow'), sv(st, 'startFill'), 'none');
  const end = arrowIn(sv(st, 'endArrow'), sv(st, 'endFill'), 'arrow');
  if (start !== 'none') s.start = start;
  if (end !== 'arrow') s.end = end;
  // Bends rounded (8 pixels unless it says), or sharp; a straight connector has none to round.
  if (route !== 'straight') {
    if (!on(st, 'rounded')) s.radius = 0;
    else {
      const a = svNum(st, 'arcSize');
      if (a !== undefined && a / 2 !== 8) s.radius = r2(a / 2);
    }
  }
  if (words) Object.assign(s, wordsLook(st, {}, 11, 13));
  return s;
}

// ---- reading a page -------------------------------------------------------------------------------------------------------

type Box = { x: number; y: number; w: number; h: number };
type Pt2 = [number, number];

interface Geo {
  x: number;
  y: number;
  w: number;
  h: number;
  relative: boolean;
  offset?: Pt2;
  points: Pt2[];
  source?: Pt2;
  target?: Pt2;
  /** A folded container's size unfolded. */
  alt?: { w: number; h: number };
}

/** A cell of draw.io's model, its children in their order. */
interface Cell {
  id: string;
  parent?: string;
  value: string;
  style: Sty;
  vertex: boolean;
  edge: boolean;
  source?: string;
  target?: string;
  geo: Geo;
  /** The attributes of the object wrapping it (<UserObject>, <object>): its link, its tooltip, its own data. */
  attrs: Record<string, string>;
  visible: boolean;
  collapsed: boolean;
  connectable: boolean;
  kids: Cell[];
}

const fnum = (v: string | undefined) => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const pointOf = (el: XmlEl): Pt2 => [fnum(el.attrs.x), fnum(el.attrs.y)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function geoOf(g: XmlEl | undefined): Geo {
  const a = g?.attrs ?? {};
  const geo: Geo = { x: fnum(a.x), y: fnum(a.y), w: fnum(a.width), h: fnum(a.height), relative: a.relative === '1', points: [] };
  for (const k of g?.kids ?? []) {
    if (k.tag === 'mxPoint') {
      if (k.attrs.as === 'sourcePoint') geo.source = pointOf(k);
      else if (k.attrs.as === 'targetPoint') geo.target = pointOf(k);
      else if (k.attrs.as === 'offset') geo.offset = pointOf(k);
    } else if (k.tag === 'Array' && k.attrs.as === 'points') {
      for (const p of k.kids) if (p.tag === 'mxPoint') geo.points.push(pointOf(p));
    } else if (k.tag === 'mxRectangle' && k.attrs.as === 'alternateBounds') geo.alt = { w: fnum(k.attrs.width), h: fnum(k.attrs.height) };
  }
  return geo;
}

/** A model's cells by id, from its <mxCell>s and the objects wrapping them (whose label is their value). */
function cellsOf(model: XmlEl): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  for (const el of kid(model, 'root')?.kids ?? []) {
    const inner = el.tag === 'mxCell' ? el : kid(el, 'mxCell');
    if (!inner) continue;
    const wrapped = inner !== el;
    const a = inner.attrs;
    const id = (wrapped ? el.attrs.id : a.id) ?? `_${cells.size}`;
    if (cells.has(id)) continue;
    cells.set(id, {
      id,
      parent: a.parent,
      value: wrapped ? (el.attrs.label ?? '') : (a.value ?? ''),
      style: parseStyle(a.style),
      vertex: a.vertex === '1',
      edge: a.edge === '1',
      source: a.source,
      target: a.target,
      geo: geoOf(kid(inner, 'mxGeometry')),
      attrs: wrapped ? el.attrs : {},
      visible: a.visible !== '0',
      collapsed: a.collapsed === '1',
      connectable: a.connectable !== '0',
      kids: [],
    });
  }
  for (const c of cells.values()) if (c.parent && c.parent !== c.id) cells.get(c.parent)?.kids.push(c);
  return cells;
}

/** Ids a diagram can keep (letters, digits, _ . : -, 64 at most), each draw.io id always given the same one. */
function idMaker(): (raw: string) => string {
  const used = new Set<string>();
  const made = new Map<string, string>();
  return (raw) => {
    const had = made.get(raw);
    if (had) return had;
    const base = raw.replace(/[^\w.:-]/g, '_').slice(0, 56) || 'c';
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}_${k}`;
    used.add(id);
    made.set(raw, id);
    return id;
  };
}

/** What did not come along, counted, to say once each. */
class Notes {
  private n = new Map<string, number>();
  add(k: string, by = 1) {
    if (by > 0) this.n.set(k, (this.n.get(k) ?? 0) + by);
  }
  list(): string[] {
    const out: string[] = [];
    const s = (v: number, one: string, many: string) => (v === 1 ? one : many);
    const lacking: string[] = [];
    let lackingN = 0;
    for (const [k, v] of this.n) {
      if (k.startsWith('lacks:mxgraph.')) out.push(`${v} ${s(v, 'shape', 'shapes')} of draw.io's stencils (${k.slice(6)}.*) came in as plain rectangles`);
      else if (k === 'lacks:stencil') out.push(`${v} custom ${s(v, 'shape', 'shapes')} drawn by the file's own stencils came in as plain rectangles`);
      else if (k.startsWith('lacks:')) {
        lacking.push(k.slice(6));
        lackingN += v;
      }
    }
    if (lackingN) out.push(`${lackingN} ${s(lackingN, 'shape', 'shapes')} of kinds a diagram lacks (${lacking.join(', ')}) came in as plain rectangles`);
    const say: Record<string, (v: number) => string> = {
      layers: (v) => `${v} layers were put together into one on ${this.n.get('layerPages') === 1 ? 'their page' : `each of ${this.n.get('layerPages')} pages`}`,
      hiddenLayer: (v) => `${v} hidden ${s(v, 'layer was', 'layers were')} left out`,
      hidden: (v) => `${v} hidden ${s(v, 'shape or connector was', 'shapes and connectors were')} left out`,
      edgeEnd: (v) => `${v} ${s(v, 'connector end', 'connector ends')} joined to another connector came in as ${s(v, 'a free end', 'free ends')}`,
      dropped: (v) => `${v} ${s(v, 'connector', 'connectors')} with an end joined to nothing ${s(v, 'was', 'were')} left out`,
      rows: (v) => `${v} ${s(v, 'table had', 'tables had')} more rows than the ${DIAGRAM_LIMITS.rows} a shape holds`,
      items: (v) => `${v} ${s(v, 'item was', 'items were')} over the ${DIAGRAM_LIMITS.items} a page holds`,
      pages: (v) => `${v} ${s(v, 'page was', 'pages were')} over the ${DIAGRAM_LIMITS.pages} a diagram holds`,
      bad: (v) => `${v} ${s(v, 'page', 'pages')} could not be read`,
      math: () => 'Formulas came in as their LaTeX source',
    };
    for (const [k, f] of Object.entries(say)) {
      const v = this.n.get(k);
      if (v) out.push(f(v));
    }
    return out;
  }
}

/** Where a page's shapes and connectors are: the origin coordinates are relative to, their container, their group. */
interface Ctx {
  ox: number;
  oy: number;
  parent?: string;
  group?: string;
}

/** A table's or a class's rows, read into one shape, with where each row (and cell) was, for connectors joined to them. */
interface Rows {
  kind: 'class' | 'entity' | 'table';
  rows: string[];
  parts: { id: string; box: Box }[];
}

const isRowCell = (c: Cell) => !c.kids.some((k) => k.vertex) && ['rectangle', 'label', 'line', 'partialrectangle'].includes(baseOf(c.style).toLowerCase());

/** Whether a cell only groups the cells in it: draw.io's group, or a cell with children that draws and says nothing. */
function isGroup(c: Cell): boolean {
  if (c.style.named.includes('group')) return true;
  if (!c.kids.length || labelOf(c.value, c.style, c.attrs) || sv(c.style, 'shape')) return false;
  if (!c.style.map.size && !c.style.named.length) return !c.connectable;
  return colour(sv(c.style, 'fillColor')) === 'none' && colour(sv(c.style, 'strokeColor')) === 'none';
}

/** A picture's source as a diagram keeps it: draw.io's data URIs lack ";base64" (";" splits its styles). */
function imageIn(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  const m = /^data:([\w.+-]+\/[\w.+-]+),/.exec(s);
  if (m && /^[A-Za-z0-9+/=\s]*$/.test(s.slice(m[0].length, m[0].length + 400))) return `data:${m[1]};base64,${s.slice(m[0].length)}`;
  // draw.io's own pictures, relative to its app.
  if (/^img\/(lib|clipart)\//i.test(s)) return `https://app.diagrams.net/${s}`;
  return s || undefined;
}

const ICON_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);

/** An icon diagramToDrawio wrote as a picture of it (hydorIcon=…), as the icon it was. */
function iconIn(st: Sty): DiagramIcon | undefined {
  const name = st.map.get('hydorIcon');
  const m = /^data:image\/svg\+xml(;base64)?,([\s\S]*)$/.exec(sv(st, 'image') ?? '');
  if (!name || !m) return undefined;
  try {
    const svg = m[1] || /^[A-Za-z0-9+/=\s]+$/.test(m[2]) ? fromUtf8(fromBase64(m[2])) : uriDecode(m[2]);
    const paths = parseXml(svg)
      .kids.filter((k) => ICON_TAGS.has(k.tag))
      .map((k) => [k.tag, { ...k.attrs }] as IconNode);
    return paths.length ? { name, paths } : undefined;
  } catch {
    return undefined;
  }
}

/** One page of draw.io's as a page's items, in the order draw.io draws them. */
function readPage(model: XmlEl, notes: Notes): DiagramItem[] {
  const cells = cellsOf(model);
  const ids = idMaker();
  const seq: (DiagramItem | { cell: Cell; ctx: Ctx })[] = [];
  const boxes = new Map<string, Box>();
  const shapes = new Map<string, DiagramShape>();
  const absorbed = new Map<string, { owner: DiagramShape; box: Box }>();
  const edgeCtx = new Map<string, Ctx>();

  const boxOf = (c: Cell, ctx: Ctx, holder?: Box): Box => {
    const g = c.geo;
    const w = c.collapsed && g.alt ? Math.max(g.w, g.alt.w) : g.w;
    const h = c.collapsed && g.alt ? Math.max(g.h, g.alt.h) : g.h;
    // A relative geometry is placed as fractions of the shape it is on (a marker on a shape's edge).
    if (g.relative && holder) return { x: holder.x + g.x * holder.w + (g.offset?.[0] ?? 0), y: holder.y + g.y * holder.h + (g.offset?.[1] ?? 0), w, h };
    return { x: ctx.ox + g.x, y: ctx.oy + g.y, w, h };
  };

  const rowsOf = (c: Cell, box: Box, kidsV: Cell[]): Rows | null => {
    const base = baseOf(c.style).toLowerCase();
    const text = (k: Cell) => labelOf(k.value, k.style, k.attrs).replace(/\n/g, ' ');
    if (base === 'table') {
      const out: Rows = { kind: 'table', rows: [], parts: [] };
      for (const r of kidsV) {
        const rb = boxOf(r, { ox: box.x, oy: box.y }, box);
        out.parts.push({ id: r.id, box: rb });
        const inRow = r.kids.filter((k) => k.vertex && k.visible);
        const cellsText = inRow.map((k) => text(k).replace(/\|/g, '¦'));
        while (cellsText.length > 1 && !cellsText[cellsText.length - 1]) cellsText.pop();
        out.rows.push(cellsText.join('|'));
        for (const k of inRow) out.parts.push({ id: k.id, box: boxOf(k, { ox: rb.x, oy: rb.y }, rb) });
      }
      return out;
    }
    if (base !== 'swimlane' || sv(c.style, 'childLayout') !== 'stackLayout' || !kidsV.length || !kidsV.every(isRowCell)) return null;
    const rows = kidsV.map((k) => (baseOf(k.style) === 'line' ? '---' : text(k)));
    const mark = c.style.map.get('hydorShape');
    const uml = mark === 'class' || mark === 'entity' ? mark === 'class' : rows.some((r) => r === '---' || /\(|^\s*[+\-#~]/.test(r));
    return { kind: uml ? 'class' : 'entity', rows, parts: kidsV.map((k) => ({ id: k.id, box: boxOf(k, { ox: box.x, oy: box.y }, box) })) };
  };

  const makeShape = (c: Cell, box: Box, ctx: Ctx, kidsV: Cell[], rows: Rows | null): DiagramShape => {
    const st = c.style;
    const f: Found = rows ? { kind: rows.kind, rot: 0, flipH: false, flipV: false, swap: false } : detect(st);
    if (f.lacks) notes.add(`lacks:${f.lacks}`);
    let kind = f.kind;
    // A box that holds others is a container (draw.io's container=1, or shapes placed in it).
    if (!rows && (kind === 'rect' || kind === 'rounded') && (on(st, 'container') || kidsV.some((k) => !k.geo.relative))) kind = 'container';
    let { x, y, w, h } = box;
    if (f.swap) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      [w, h] = [h, w];
      x = cx - w / 2;
      y = cy - h / 2;
    }
    if (kind === 'bar' && baseOf(st) === 'line') {
      // A line as a bar: as thick as the line, along it.
      const t = Math.max(2, svNum(st, 'strokeWidth') ?? 4);
      const dir = sv(st, 'direction');
      if (dir === 'south' || dir === 'north') {
        x += (w - Math.min(t, w)) / 2;
        w = Math.min(t, w);
      } else {
        y += (h - Math.min(t, h)) / 2;
        h = Math.min(t, h);
      }
    }
    const s: DiagramShape = { id: ids(c.id), type: 'shape', shape: kind, x, y, w: Math.max(1, w), h: Math.max(1, h) };
    const rot = (((svNum(st, 'rotation') ?? 0) + f.rot) % 360 + 360) % 360;
    if (rot) s.rot = r2(rot);
    if (f.flipH) s.flipH = true;
    if (f.flipV) s.flipV = true;
    const text = labelOf(c.value, st, c.attrs);
    if (text) s.text = text;
    if (rows) {
      if (rows.rows.length > DIAGRAM_LIMITS.rows) notes.add('rows');
      s.rows = rows.rows;
    }
    if (kind === 'image') {
      const kept = st.map.get('hydorSrc');
      const src = kept && baseOf(st) === 'rectangle' ? uriDecode(kept) : imageIn(sv(st, 'image'));
      if (src) s.src = src;
    }
    if (kind === 'icon') {
      const icon = iconIn(st);
      if (icon) s.icon = icon;
      else {
        s.shape = 'image';
        const src = imageIn(sv(st, 'image'));
        if (src) s.src = src;
      }
    }
    const link = c.attrs.link ?? st.map.get('link');
    if (link) s.link = link;
    const tip = c.attrs.tooltip;
    if (tip?.trim()) s.note = tip;
    const look = shapeLook(st, s.shape, s.w, s.h, !!text || !!rows?.rows.length);
    // The grey box a picture of the app's own was written as is not its look.
    if (st.map.has('hydorSrc')) for (const k of ['fill', 'stroke', 'color'] as const) delete look[k];
    if (Object.keys(look).length) s.style = look;
    if (ctx.parent) s.parent = ctx.parent;
    if (ctx.group) s.group = ctx.group;
    if (on(st, 'locked')) s.locked = true;
    return s;
  };

  const walk = (holder: Cell, ctx: Ctx, holderBox?: Box) => {
    for (const c of holder.kids) {
      if (!c.visible) {
        notes.add('hidden');
        continue;
      }
      if (c.edge) {
        edgeCtx.set(c.id, ctx);
        seq.push({ cell: c, ctx });
        continue;
      }
      if (!c.vertex) {
        walk(c, ctx, holderBox);
        continue;
      }
      const box = boxOf(c, ctx, holderBox);
      boxes.set(c.id, box);
      if (isGroup(c)) {
        // Not a shape: what is in it is grouped (the nearest group), placed on the page.
        walk(c, { ox: box.x, oy: box.y, parent: ctx.parent, group: ids(c.id) }, box);
        continue;
      }
      const kidsV = c.kids.filter((k) => k.vertex && k.visible);
      const rows = rowsOf(c, box, kidsV);
      const s = makeShape(c, box, ctx, kidsV, rows);
      seq.push(s);
      shapes.set(c.id, s);
      if (rows) {
        for (const p of rows.parts) {
          absorbed.set(p.id, { owner: s, box: p.box });
          boxes.set(p.id, p.box);
        }
        // Its rows are in the shape; a connector drawn inside it is on the page.
        for (const k of c.kids)
          if (k.edge && k.visible) {
            const kc = { ox: box.x, oy: box.y, parent: ctx.parent, group: ctx.group };
            edgeCtx.set(k.id, kc);
            seq.push({ cell: k, ctx: kc });
          }
        continue;
      }
      if (c.kids.length) walk(c, { ox: box.x, oy: box.y, parent: s.id }, box);
    }
  };

  // The root's children are layers: each put on the page, in its order.
  let layers = 0;
  for (const top of [...cells.values()].filter((c) => !c.parent || !cells.has(c.parent))) {
    if (top.vertex || top.edge) {
      walk({ ...top, kids: [top] }, { ox: 0, oy: 0 });
      continue;
    }
    for (const layer of top.kids) {
      if (layer.vertex || layer.edge) {
        walk({ ...top, kids: [layer] }, { ox: 0, oy: 0 });
        continue;
      }
      layers++;
      if (!layer.visible) notes.add('hiddenLayer');
      else walk(layer, { ox: 0, oy: 0 });
    }
  }
  if (layers > 1) {
    notes.add('layers', layers);
    notes.add('layerPages');
  }

  // Connectors, once every shape is placed.
  const centreOf = (id: string | undefined, depth = 0): Pt2 | undefined => {
    if (!id) return undefined;
    const b = boxes.get(id);
    if (b) return [b.x + b.w / 2, b.y + b.h / 2];
    const e = cells.get(id);
    const ctx = edgeCtx.get(id);
    if (!e?.edge || !ctx || depth > 3) return undefined;
    // A connector's middle: its middle point, or halfway between its ends.
    const pts = e.geo.points;
    if (pts.length) {
      const p = pts[Math.floor(pts.length / 2)];
      return [p[0] + ctx.ox, p[1] + ctx.oy];
    }
    const a = centreOf(e.source, depth + 1) ?? (e.geo.source ? [e.geo.source[0] + ctx.ox, e.geo.source[1] + ctx.oy] : undefined);
    const b2 = centreOf(e.target, depth + 1) ?? (e.geo.target ? [e.geo.target[0] + ctx.ox, e.geo.target[1] + ctx.oy] : undefined);
    return a && b2 ? [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2] : undefined;
  };

  const makeEdge = (c: Cell, ctx: Ctx): DiagramEdge | null => {
    const st = c.style;
    const free = (p: Pt2 | undefined): Pt2 | undefined => (p ? [p[0] + ctx.ox, p[1] + ctx.oy] : undefined);
    const anchor = (which: 'source' | 'target'): Pt2 | undefined => {
      const ref = c[which];
      const s = ref ? (shapes.get(ref) ?? absorbed.get(ref)?.owner) : undefined;
      return s ? [s.x + s.w / 2, s.y + s.h / 2] : (free(c.geo[which]) ?? centreOf(ref));
    };
    const pts = c.geo.points.map((p) => free(p) as Pt2);
    const end = (which: 'source' | 'target', toward: Pt2 | undefined): DiagramEnd | null => {
      const ref = c[which];
      const pre = which === 'source' ? 'exit' : 'entry';
      const px = svNum(st, `${pre}X`);
      const py = svNum(st, `${pre}Y`);
      const at = free(c.geo[which]);
      if (ref) {
        const s = shapes.get(ref);
        if (s) {
          const e: DiagramEnd = { id: s.id };
          if (px !== undefined && py !== undefined) {
            const dx = svNum(st, `${pre}Dx`) ?? 0;
            const dy = svNum(st, `${pre}Dy`) ?? 0;
            e.port = [r2(clamp(px + dx / s.w, 0, 1)), r2(clamp(py + dy / s.h, 0, 1))];
          }
          return e;
        }
        const a = absorbed.get(ref);
        if (a) {
          // Joined to a row of a table or a class: to the shape, at that row (on the side facing the other end).
          const o = a.owner;
          const y = px !== undefined && py !== undefined ? a.box.y + py * a.box.h : a.box.y + a.box.h / 2;
          const x = px !== undefined && py !== undefined ? a.box.x + px * a.box.w : toward && toward[0] < o.x + o.w / 2 ? o.x : o.x + o.w;
          return { id: o.id, port: [r2(clamp((x - o.x) / o.w, 0, 1)), r2(clamp((y - o.y) / o.h, 0, 1))] };
        }
        // Joined to what is not a shape here (a group, a connector, a hidden shape): a free end where it was.
        if (cells.get(ref)?.edge) notes.add('edgeEnd');
        const p = at ?? centreOf(ref);
        return p ? { x: p[0], y: p[1] } : null;
      }
      return at ? { x: at[0], y: at[1] } : null;
    };
    const from = end('source', pts[0] ?? anchor('target'));
    const to = end('target', pts[pts.length - 1] ?? anchor('source'));
    if (!from || !to) {
      notes.add('dropped');
      return null;
    }
    const es = sv(st, 'edgeStyle');
    const route: RouteKind = on(st, 'curved') ? 'curved' : es && es !== 'none' ? 'orthogonal' : 'straight';
    let text = labelOf(c.value, st, c.attrs);
    let at = text && c.geo.x ? (clamp(c.geo.x, -1, 1) + 1) / 2 : undefined;
    let fromText = '';
    let toText = '';
    const join = (a: string, b: string) => (a ? `${a}\n${b}` : b);
    // Labels as cells of their own on the connector: where along it (-1 its start, 1 its end) says which they are.
    for (const k of c.kids) {
      if (!k.vertex || !k.visible) continue;
      const t = labelOf(k.value, k.style, k.attrs);
      if (!t) continue;
      const x = k.geo.relative ? clamp(k.geo.x, -1, 1) : 0;
      if (x < -0.6) fromText = join(fromText, t);
      else if (x > 0.6) toText = join(toText, t);
      else if (!text) {
        text = t;
        at = (x + 1) / 2;
      } else text = join(text, t);
    }
    const e: DiagramEdge = { id: ids(c.id), type: 'edge', from, to };
    if (route !== 'orthogonal') e.route = route;
    if (pts.length) e.points = pts;
    if (text) e.text = text;
    if (text && at !== undefined && Math.abs(at - 0.5) > 0.005) e.at = r2(at);
    if (fromText) e.fromText = fromText;
    if (toText) e.toText = toText;
    const look = edgeLook(st, route, !!(text || fromText || toText));
    if (Object.keys(look).length) e.style = look;
    if (ctx.parent) e.parent = ctx.parent;
    if (ctx.group) e.group = ctx.group;
    if (on(st, 'locked')) e.locked = true;
    return e;
  };

  const items: DiagramItem[] = [];
  for (const it of seq) {
    if ('cell' in it) {
      const e = makeEdge(it.cell, it.ctx);
      if (e) items.push(e);
    } else items.push(it);
  }
  if (items.length > DIAGRAM_LIMITS.items) notes.add('items', items.length - DIAGRAM_LIMITS.items);
  return items;
}

/** Bytes as text: UTF-8, or UTF-16 with its byte-order mark. */
function bytesText(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  return fromUtf8(b);
}

/**
 * Reads a draw.io file: .drawio / .xml (<mxfile> with one <diagram> per page, its content plain XML or compressed), a bare
 * <mxGraphModel>, a draw.io SVG (its root <svg content="…mxfile…"> attribute), or a draw.io PNG's text (pass `png` bytes:
 * the 'mxfile' tEXt/zTXt/iTXt chunk). `inflate` undoes raw DEFLATE (the server passes zlib.inflateRawSync; the browser a
 * DecompressionStream). Throws for what is not a draw.io file; `notes` say what could not come along.
 */
export async function drawioToDiagram(input: string | Uint8Array, o: { inflate: Inflate }): Promise<{ diagram: Diagram; notes: string[] }> {
  let text: string;
  if (typeof input === 'string') text = input;
  else if (isPng(input)) {
    const t = await pngDrawio(input, o.inflate);
    if (!t) throw new Error('This PNG holds no draw.io diagram.');
    text = t;
  } else text = bytesText(input);
  const raw = await readPages(text, o.inflate);
  const notes = new Notes();
  const pages: DiagramPage[] = [];
  let grid: number | undefined;
  for (const [i, p] of raw.entries()) {
    if (p.bad) {
      notes.add('bad');
      continue;
    }
    if (pages.length >= DIAGRAM_LIMITS.pages) {
      notes.add('pages');
      continue;
    }
    const m = p.model;
    const items = m ? readPage(m, notes) : [];
    if (m && grid === undefined) grid = m.attrs.grid === '0' ? 0 : fnum(m.attrs.gridSize) || 10;
    if (m?.attrs.math === '1' && items.some((it) => it.text?.includes('$$') || it.text?.includes('`'))) notes.add('math');
    const page: DiagramPage = { id: p.id ?? `p${i + 1}`, name: p.name?.trim() || `Page ${i + 1}`, items };
    const bg = colour(m?.attrs.background);
    if (bg && bg !== 'none' && bg !== '#ffffff') page.background = bg;
    pages.push(page);
  }
  if (!pages.length) throw new Error('No page of this draw.io file could be read.');
  // Drawn by hand throughout: the whole diagram is.
  const all = pages.flatMap((p) => p.items);
  const sketch = all.length > 0 && all.every((it) => it.style?.sketch);
  if (sketch)
    for (const it of all) {
      if (!it.style) continue;
      delete it.style.sketch;
      if (!Object.keys(it.style).length) delete it.style;
    }
  return { diagram: normalizeDiagram({ pages, grid, sketch }), notes: notes.list() };
}

// ---- writing draw.io --------------------------------------------------------------------------------------------------------

/** An attribute's value, escaped (its line breaks as &#10;, as draw.io writes them). */
const xa = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');
const fx = (v: number) => String(Math.round(v * 100) / 100);

/** A style being written: a shape's own (KIND_OUT), then each key set once, the last word kept. */
class StyleOut {
  private named: string[] = [];
  private kv = new Map<string, string>();
  constructor(base: string) {
    for (const p of base.split(';')) {
      const t = p.trim();
      const eq = t.indexOf('=');
      if (eq > 0) this.kv.set(t.slice(0, eq), t.slice(eq + 1));
      else if (t) this.named.push(t);
    }
  }
  set(k: string, v: string | number | undefined): this {
    if (v !== undefined && v !== '') this.kv.set(k, String(v));
    return this;
  }
  toString(): string {
    return [...this.named, ...[...this.kv].map(([k, v]) => `${k}=${v}`)].join(';') + ';';
  }
}

const ARROW_OUT: Record<ArrowKind, [string, 0 | 1]> = {
  none: ['none', 1],
  arrow: ['classic', 1],
  open: ['open', 1],
  block: ['block', 1],
  triangle: ['block', 0],
  diamond: ['diamond', 1],
  'diamond-open': ['diamond', 0],
  circle: ['oval', 1],
  'circle-open': ['oval', 0],
  bar: ['dash', 1],
  cross: ['cross', 1],
  'er-one': ['ERone', 0],
  'er-only-one': ['ERmandOne', 0],
  'er-zero-one': ['ERzeroToOne', 0],
  'er-many': ['ERmany', 0],
  'er-one-many': ['ERoneToMany', 0],
  'er-zero-many': ['ERzeroToMany', 0],
};
const DASH_OUT: Record<Dash, [number, string | undefined]> = { solid: [0, undefined], dashed: [1, undefined], dotted: [1, '1 2'], 'dash-dot': [1, '8 4 1 4'] };
const FONT_OUT: Record<FontKind, string> = { sans: 'Helvetica', serif: 'Georgia', mono: 'Courier New', hand: 'Architects Daughter' };

/** The words' look, written. */
function wordsOut(o: StyleOut, look: DiagramStyle, d: Diagram, size: number, bold: boolean | undefined) {
  o.set('fontSize', size).set('fontStyle', (bold ? 1 : 0) | (look.italic ? 2 : 0) | (look.underline ? 4 : 0));
  if (look.color) o.set('fontColor', look.color);
  const font = look.font ?? d.font;
  if (font && font !== 'sans') o.set('fontFamily', FONT_OUT[font]);
  if (font === 'hand') o.set('fontSource', 'https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DArchitects%2BDaughter');
}

/** The line's look, written. */
function lineOut(o: StyleOut, look: DiagramStyle, d: Diagram, width: number) {
  o.set('strokeWidth', width);
  const [dashed, pattern] = DASH_OUT[look.dash ?? 'solid'];
  if (dashed) o.set('dashed', 1).set('dashPattern', pattern);
  if (look.opacity !== undefined && look.opacity < 100) o.set('opacity', look.opacity);
  if (look.sketch || d.sketch) o.set('sketch', 1).set('curveFitting', 1).set('jiggle', 2);
}

/** The kind a style reads back as (diagramToDrawio marks a shape whose style would read back as another). */
function kindBack(st: Sty): ShapeKind {
  const f = detect(st);
  return (f.kind === 'rect' || f.kind === 'rounded') && on(st, 'container') ? 'container' : f.kind;
}

/** A picture's source as draw.io's style holds it: a data URI without ";base64" (";" splits a style); null for one only the app reaches. */
function imageOut(src: string | undefined): string | null {
  if (!src || /^naget-asset:/i.test(src)) return null;
  const m = /^data:([\w.+-]+\/[\w.+-]+)((?:;[^;,]*)*?)(;base64)?,([\s\S]*)$/.exec(src);
  if (m) return `data:${m[1]},${m[3] ? m[4].replace(/\s+/g, '') : toBase64(utf8(uriDecode(m[4])))}`;
  return src.replace(/;/g, '%3B');
}

/** An icon as a picture draw.io shows: an SVG of its lines, in the shape's line colour (the theme's ink when it has none). */
function iconImage(icon: DiagramIcon, look: DiagramStyle): string {
  const stroke = look.stroke && look.stroke !== 'none' ? look.stroke : '#1f2328';
  const fill = look.fill && look.fill !== 'none' ? look.fill : 'none';
  const body = icon.paths.map(([tag, a]) => `<${tag}${Object.entries(a).map(([k, v]) => ` ${k}="${xa(String(v))}"`).join('')}/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml,${toBase64(utf8(svg))}`;
}

/** A table's columns' widths, as the diagram draws them: from what their cells hold, fitted to its width. */
function tableCols(rows: string[][], w: number, size: number): number[] {
  const n = Math.max(1, ...rows.map((r) => r.length));
  const want = new Array<number>(n).fill(24);
  for (const r of rows) r.forEach((c, i) => (want[i] = Math.max(want[i], textWidth(c, { size }) + 16)));
  const total = want.reduce((a, b) => a + b, 0);
  return want.map((x) => (x / total) * w);
}

/** A shape's style, in draw.io's words: its kind's shape and its look (its kind's own look where it says nothing). */
function shapeStyle(s: DiagramShape, d: Diagram, base = KIND_OUT[s.shape]): StyleOut {
  const k = s.shape;
  const look = lookOf(s);
  const o = new StyleOut(base);
  if (k === 'initial' || k === 'final' || k === 'bar') {
    // Drawn solid in their line's colour.
    const c = look.stroke && look.stroke !== 'none' ? look.stroke : '#000000';
    o.set('fillColor', c).set('strokeColor', k === 'bar' ? 'none' : c);
  } else {
    o.set('fillColor', look.fill).set('strokeColor', look.stroke);
    if (look.gradient && look.fill !== 'none') o.set('gradientColor', look.gradient);
    if ((k === 'swimlane' || k === 'lane' || k === 'class' || k === 'entity') && look.fill) o.set('swimlaneFillColor', look.fill);
  }
  lineOut(o, look, d, look.width ?? (k === 'icon' ? 2 : 1.5));
  if (look.shadow) o.set('shadow', 1);
  if (RADIUS_KINDS.has(k)) {
    const r = k === 'entity' ? Math.min(look.radius ?? 0, 12) : (look.radius ?? (k === 'rounded' ? Math.min(16, Math.min(s.w, s.h) * 0.18) : 0));
    if (r > 0) o.set('rounded', 1).set('absoluteArcSize', 1).set('arcSize', r2(r * 2));
    else o.set('rounded', 0);
  }
  if (k === 'chevron') o.set('dx', Math.round(Math.min(s.w * 0.2, s.h * 0.5)));
  const headed = ROW_KINDS.has(k);
  wordsOut(o, look, d, look.size ?? 14, headed ? (look.bold ?? true) : look.bold);
  const label = look.label ?? 'inside';
  if (label === 'below') o.set('labelPosition', 'center').set('verticalLabelPosition', 'bottom').set('align', 'center').set('verticalAlign', 'top');
  else if (label === 'above') o.set('labelPosition', 'center').set('verticalLabelPosition', 'top').set('align', 'center').set('verticalAlign', 'bottom');
  else if (label === 'right') o.set('labelPosition', 'right').set('verticalLabelPosition', 'middle').set('align', 'left').set('verticalAlign', 'middle');
  else if (label === 'left') o.set('labelPosition', 'left').set('verticalLabelPosition', 'middle').set('align', 'right').set('verticalAlign', 'middle');
  else if (headed) o.set('align', 'center').set('verticalAlign', 'top');
  else {
    o.set('align', look.align ?? 'center');
    if (!BAND_KINDS.has(k)) o.set('verticalAlign', look.valign ?? 'middle');
  }
  if (s.rot) o.set('rotation', s.rot);
  // draw.io's brace opens the other way.
  if (k === 'brace' ? !s.flipH : s.flipH) o.set('flipH', 1);
  if (s.flipV) o.set('flipV', 1);
  if (s.locked) o.set('locked', 1);
  return o;
}

/** A shape's cells: itself, and a table's or a class's rows in it. */
function shapeCells(s: DiagramShape, id: string, parent: string, at: Pt2, d: Diagram): string {
  const k = s.shape;
  const look = lookOf(s);
  const size = look.size ?? 14;
  // A picture only the app reaches is drawn as a grey box.
  const kept = k === 'image' && !!s.src && !imageOut(s.src);
  const o = shapeStyle(s, d, kept ? 'rounded=0;whiteSpace=wrap;html=1;' : KIND_OUT[k]);
  const value = s.text ? htmlLabel(s.text) : '';
  const kids: string[] = [];
  const cell = (cid: string, v: string, style: string, p: string, geo: string, more = '') => `<mxCell id="${xa(cid)}" value="${xa(v)}" style="${xa(style)}" vertex="1"${more} parent="${xa(p)}">${geo}</mxCell>`;
  const rowWords = (st: StyleOut, align: string, bold = false) => {
    wordsOut(st, { ...look, bold: undefined }, d, size, bold);
    return st.set('align', align);
  };
  if (k === 'class' || k === 'entity') {
    const head = headHeight(Math.max(1, (s.text ?? '').split('\n').length), size);
    o.set('startSize', head).set('hydorShape', k);
    let y = head;
    (s.rows ?? []).forEach((r, i) => {
      const line = r.trim() === '---';
      const h = line ? 8 : rowHeight(size);
      const st = line
        ? new StyleOut('line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=inherit;')
        : rowWords(new StyleOut('text;strokeColor=none;fillColor=none;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;'), look.align ?? 'left');
      kids.push(cell(`${id}-r${i + 1}`, line ? '' : htmlLabel(r), st.toString(), id, `<mxGeometry y="${fx(y)}" width="${fx(s.w)}" height="${h}" as="geometry"/>`));
      y += h;
    });
  } else if (k === 'table') {
    const head = s.text ? headHeight(Math.max(1, s.text.split('\n').length), size) : 0;
    o.set('startSize', head);
    const rows = (s.rows ?? []).filter((r) => r.trim() !== '---').map((r) => r.split('|').map((c) => c.trim()));
    const cols = tableCols(rows, s.w, size);
    const rh = rowHeight(size);
    rows.forEach((r, i) => {
      const rid = `${id}-r${i + 1}`;
      const rowStyle = 'shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;strokeColor=inherit;top=0;left=0;bottom=0;right=0;collapsible=0;dropTarget=0;fillColor=none;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;';
      kids.push(cell(rid, '', rowStyle, id, `<mxGeometry y="${fx(head + i * rh)}" width="${fx(s.w)}" height="${rh}" as="geometry"/>`));
      let x = 0;
      cols.forEach((cw, j) => {
        const st = rowWords(new StyleOut('shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;strokeColor=inherit;overflow=hidden;fillColor=none;top=0;left=0;bottom=0;right=0;pointerEvents=1;spacingLeft=8;'), 'left', i === 0 && !head);
        const geo = `<mxGeometry x="${fx(x)}" width="${fx(cw)}" height="${rh}" as="geometry"><mxRectangle width="${fx(cw)}" height="${rh}" as="alternateBounds"/></mxGeometry>`;
        kids.push(cell(`${rid}c${j + 1}`, htmlLabel(r[j] ?? ''), st.toString(), rid, geo, ' connectable="0"'));
        x += cw;
      });
    });
  } else if (k === 'icon' && s.icon?.paths.length) {
    o.set('image', iconImage(s.icon, look)).set('hydorIcon', s.icon.name);
  } else if (k === 'image' && s.src) {
    // A picture only the app reaches keeps its source, so that it reads back as the picture.
    if (kept) o.set('fillColor', '#f5f5f5').set('strokeColor', '#666666').set('fontColor', '#333333').set('hydorSrc', encodeURIComponent(s.src));
    else o.set('image', imageOut(s.src) ?? undefined);
  }
  const finalStyle = (() => {
    if (k !== 'class' && k !== 'entity' && kindBack(parseStyle(o.toString())) !== k) o.set('hydorShape', k);
    return o.toString();
  })();
  const geo = `<mxGeometry x="${fx(s.x - at[0])}" y="${fx(s.y - at[1])}" width="${fx(s.w)}" height="${fx(s.h)}" as="geometry"/>`;
  const self =
    s.link || s.note
      ? `<UserObject label="${xa(value)}"${s.link ? ` link="${xa(s.link)}"` : ''}${s.note ? ` tooltip="${xa(s.note)}"` : ''} id="${xa(id)}"><mxCell style="${xa(finalStyle)}" vertex="1" parent="${xa(parent)}">${geo}</mxCell></UserObject>`
      : cell(id, value, finalStyle, parent, geo);
  return [self, ...kids].join('\n');
}

/** A connector's cells: itself (its words in its value, placed along it by its geometry's x), and its end words as labels on it. */
function edgeCells(e: DiagramEdge, id: string, parent: string, at: Pt2, ends: { from?: string; to?: string }, d: Diagram): string {
  const look = e.style ?? {};
  const route = e.route ?? 'orthogonal';
  const o = new StyleOut('');
  o.set('edgeStyle', route === 'straight' ? 'none' : 'orthogonalEdgeStyle');
  if (route === 'curved') o.set('curved', 1);
  if (route === 'straight' || look.radius === 0) o.set('rounded', 0);
  else {
    o.set('rounded', 1);
    if (look.radius !== undefined && look.radius !== 8) o.set('arcSize', r2(look.radius * 2));
  }
  o.set('orthogonalLoop', 1).set('jettySize', 'auto').set('html', 1);
  const [ea, ef] = ARROW_OUT[look.end ?? 'arrow'];
  const [sa, sf] = ARROW_OUT[look.start ?? 'none'];
  o.set('endArrow', ea).set('endFill', ef).set('startArrow', sa).set('startFill', sf);
  if (look.stroke) o.set('strokeColor', look.stroke);
  lineOut(o, look, d, look.width ?? 1.5);
  if (look.flow) o.set('flowAnimation', 1);
  const words = !!(e.text || e.fromText || e.toText);
  if (words) wordsOut(o, look, d, look.size ?? 13, look.bold);
  if (e.from.port && ends.from) o.set('exitX', e.from.port[0]).set('exitY', e.from.port[1]).set('exitDx', 0).set('exitDy', 0);
  if (e.to.port && ends.to) o.set('entryX', e.to.port[0]).set('entryY', e.to.port[1]).set('entryDx', 0).set('entryDy', 0);
  if (e.locked) o.set('locked', 1);
  const pt = (x: number, y: number, as?: string) => `<mxPoint x="${fx(x - at[0])}" y="${fx(y - at[1])}"${as ? ` as="${as}"` : ''}/>`;
  const inner: string[] = [];
  if (e.from.x !== undefined && e.from.y !== undefined) inner.push(pt(e.from.x, e.from.y, 'sourcePoint'));
  if (e.to.x !== undefined && e.to.y !== undefined) inner.push(pt(e.to.x, e.to.y, 'targetPoint'));
  if (e.points?.length) inner.push(`<Array as="points">${e.points.map((p) => pt(p[0], p[1])).join('')}</Array>`);
  const gx = e.text && e.at !== undefined && e.at !== 0.5 ? ` x="${fx(e.at * 2 - 1)}"` : '';
  const terms = `${ends.from ? ` source="${xa(ends.from)}"` : ''}${ends.to ? ` target="${xa(ends.to)}"` : ''}`;
  const out = [`<mxCell id="${xa(id)}" value="${xa(e.text ? htmlLabel(e.text) : '')}" style="${xa(o.toString())}" edge="1" parent="${xa(parent)}"${terms}><mxGeometry${gx} relative="1" as="geometry">${inner.join('')}</mxGeometry></mxCell>`];
  for (const [t, x, suffix] of [
    [e.fromText, -0.8, 'from'],
    [e.toText, 0.8, 'to'],
  ] as const) {
    if (!t) continue;
    const st = new StyleOut('edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];');
    wordsOut(st, look, d, look.size ?? 13, look.bold);
    out.push(`<mxCell id="${xa(`${id}-${suffix}`)}" value="${xa(htmlLabel(t))}" style="${xa(st.toString())}" vertex="1" connectable="0" parent="${xa(id)}"><mxGeometry x="${x}" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`);
  }
  return out.join('\n');
}

/** One page as draw.io's model: containers holding their shapes, groups as draw.io's group cells, items in their order. */
function pageModel(p: DiagramPage, d: Diagram): string {
  const shapes = new Map(p.items.filter((it): it is DiagramShape => it.type === 'shape').map((s) => [s.id, s]));
  // Cell ids: the items' own, but "0" and "1" (draw.io's root and layer).
  const used = new Set<string>(['0', '1']);
  const cids = new Map<string, string>();
  const cidOf = (raw: string) => {
    let c = cids.get(raw);
    if (c) return c;
    c = raw;
    for (let k = 2; used.has(c); k++) c = `${raw}-${k}`;
    used.add(c);
    cids.set(raw, c);
    return c;
  };
  for (const it of p.items) cidOf(it.id);
  // What holds an item: its container (a table or a class holds only its rows), or the layer.
  const holderOf = (it: DiagramItem): string | undefined => {
    const seen = new Set<string>([it.id]);
    let h = it.parent;
    while (h && !seen.has(h)) {
      seen.add(h);
      const s = shapes.get(h);
      if (s && !ROW_KINDS.has(s.shape)) return h;
      h = s?.parent;
    }
    return undefined;
  };
  // Groups: those of an item's group in the same holder, two or more, as a group cell round them.
  const groupKey = (it: DiagramItem) => (it.group ? `${it.group}\u0000${holderOf(it) ?? ''}` : undefined);
  const members = new Map<string, DiagramItem[]>();
  for (const it of p.items) {
    const g = groupKey(it);
    if (g) members.set(g, [...(members.get(g) ?? []), it]);
  }
  const groups = new Map<string, { cid: string; box: Box }>();
  for (const [key, its] of members) {
    if (its.length < 2) continue;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    const take = (x: number, y: number, w = 0, h = 0) => {
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + w), Math.max(y1, y + h)];
    };
    for (const it of its) {
      if (it.type === 'shape') take(it.x, it.y, it.w, it.h);
      else {
        for (const q of it.points ?? []) take(q[0], q[1]);
        for (const end of [it.from, it.to]) if (!end.id && end.x !== undefined && end.y !== undefined) take(end.x, end.y);
      }
    }
    if (x0 === Infinity) continue;
    // Its own cell id, apart from the items'.
    const gid = key.split('\u0000')[0];
    let cid = gid;
    for (let k = 2; used.has(cid); k++) cid = `${gid}-${k}`;
    used.add(cid);
    groups.set(key, { cid, box: { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) } });
  }
  // Each cell's children, in the items' order (a group where its first member was).
  type Entry = { item: DiagramItem } | { group: string };
  const lists = new Map<string, Entry[]>();
  const push = (holder: string, en: Entry) => lists.set(holder, [...(lists.get(holder) ?? []), en]);
  for (const it of p.items) {
    const holder = holderOf(it);
    const hc = holder ? cidOf(holder) : '1';
    const gk = groupKey(it);
    const g = gk ? groups.get(gk) : undefined;
    if (gk && g) {
      if (!lists.has(g.cid)) {
        lists.set(g.cid, []);
        push(hc, { group: gk });
      }
      push(g.cid, { item: it });
    } else push(hc, { item: it });
  }
  const out: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const emit = (holder: string, at: Pt2) => {
    for (const en of lists.get(holder) ?? []) {
      if ('group' in en) {
        const g = groups.get(en.group)!;
        out.push(`<mxCell id="${xa(g.cid)}" value="" style="group" vertex="1" connectable="0" parent="${xa(holder)}"><mxGeometry x="${fx(g.box.x - at[0])}" y="${fx(g.box.y - at[1])}" width="${fx(g.box.w)}" height="${fx(g.box.h)}" as="geometry"/></mxCell>`);
        emit(g.cid, [g.box.x, g.box.y]);
        continue;
      }
      const it = en.item;
      const cid = cidOf(it.id);
      if (it.type === 'shape') {
        out.push(shapeCells(it, cid, holder, at, d));
        if (lists.has(cid)) emit(cid, [it.x, it.y]);
      } else {
        const end = (e: DiagramEnd) => (e.id && shapes.has(e.id) ? cidOf(e.id) : undefined);
        out.push(edgeCells(it, cid, holder, at, { from: end(it.from), to: end(it.to) }, d));
      }
    }
  };
  emit('1', [0, 0]);
  // The page as large as what it holds (draw.io's own Letter page at least).
  let [w, h] = [850, 1100];
  for (const it of p.items) {
    if (it.type === 'shape') [w, h] = [Math.max(w, it.x + it.w + 40), Math.max(h, it.y + it.h + 40)];
    else for (const q of it.points ?? []) [w, h] = [Math.max(w, q[0] + 40), Math.max(h, q[1] + 40)];
  }
  const grid = d.grid ?? 10;
  const attrs = `dx="1200" dy="800" grid="${grid ? 1 : 0}" gridSize="${grid || 10}" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.ceil(w)}" pageHeight="${Math.ceil(h)}" math="0" shadow="0"${p.background ? ` background="${xa(p.background)}"` : ''}`;
  return `<mxGraphModel ${attrs}>\n<root>\n${out.join('\n')}\n</root>\n</mxGraphModel>`;
}

/**
 * Writes a diagram as a draw.io file (uncompressed <mxfile>, one <diagram> per page), which draw.io and diagrams.net open.
 * A diagram of one page with no name of its own takes `title` as its page's name.
 */
export function diagramToDrawio(d: Diagram, title?: string): string {
  const pages = d.pages.map((p) => {
    const name = d.pages.length === 1 && title?.trim() && /^Page \d+$/.test(p.name) ? title.trim() : p.name;
    return `<diagram id="${xa(p.id)}" name="${xa(name)}">\n${pageModel(p, d)}\n</diagram>`;
  });
  return `<mxfile host="Hydor" agent="Hydor" version="24.0.0">\n${pages.join('\n')}\n</mxfile>\n`;
}
