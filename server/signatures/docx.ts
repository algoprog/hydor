// A saved signature placed into a Word file (.docx) as Word places a picture: at {{signature}}-like words (which it
// takes the place of), right after words such as "Signature:", in a table's cell, or at the end; in the line, or in
// front of the text (floating, so a line of underscores stays where it was). Only what placing it needs changes: the
// words of document.xml where it goes (text and runs around them kept as they were, attributes and all), the picture
// as word/media/signatureN.png, its relationship and the PNG content type. Every other part of the zip is copied as
// it is packed, byte for byte. Each XML part changed is checked to be well formed (tags, quotes, entities and
// namespace prefixes) before anything is written.
import zlib from 'node:zlib';
import type { PlaceSpot } from '../../shared/signatures.ts';
import { Zip } from '../documents/zip.ts';

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const DOC_REL = /\/officeDocument$/;

/** Where in the file: words to take the place of, words to go right after, a table's cell, or (none) the end. */
export interface DocxSpot {
  placeholder?: string;
  after?: string;
  cell?: { table: number; row: number; column: number };
  /** Which of the words' places, from 1 (-1 the last). */
  occurrence?: number;
}

export interface DocxPlacement {
  /** The signed file. */
  docx: Buffer;
  /** Where it went, in plain words: "right after “Signature:” (paragraph 12 of 30)"; and for a card to say. */
  where: string;
  spot: PlaceSpot;
  /** The words just before and after it, for the user to see on the card. */
  before: string;
  after: string;
  float: boolean;
}

// ---- XML, with where everything is --------------------------------------------------------------------------------

interface Tok {
  kind: 'open' | 'close' | 'self' | 'text';
  name: string;
  start: number;
  end: number;
  /** An open or self-closing tag's attributes, as written. */
  attrs?: string;
}

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s.includes('&')
    ? s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
        if (e[0] === '#') {
          const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
        }
        return NAMED[e] ?? m;
      })
    : s;
}

export const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The tags and text of an XML part, each with where it starts and ends (comments, declarations and doctypes skipped). */
function tokens(xml: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      out.push({ kind: 'text', name: '', start: i, end: n });
      break;
    }
    if (lt > i) out.push({ kind: 'text', name: '', start: i, end: lt });
    if (xml.startsWith('<!--', lt)) {
      const e = xml.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const e = xml.indexOf(']]>', lt + 9);
      out.push({ kind: 'text', name: '#cdata', start: lt, end: e < 0 ? n : e + 3 });
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (xml[lt + 1] === '?' || xml[lt + 1] === '!') {
      const e = xml.indexOf('>', lt);
      i = e < 0 ? n : e + 1;
      continue;
    }
    // The tag's end: the first > outside quotes.
    let j = lt + 1;
    let q = '';
    for (; j < n; j++) {
      const c = xml[j];
      if (q) {
        if (c === q) q = '';
      } else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
    }
    const raw = xml.slice(lt + 1, j);
    if (raw[0] === '/') out.push({ kind: 'close', name: raw.slice(1).trim(), start: lt, end: j + 1 });
    else {
      const self = raw.endsWith('/');
      const body = self ? raw.slice(0, -1) : raw;
      const m = /^([^\s/>]+)/.exec(body);
      out.push({ kind: self ? 'self' : 'open', name: m?.[1] ?? '', start: lt, end: j + 1, attrs: body.slice(m?.[1].length ?? 0) });
    }
    i = j + 1;
  }
  return out;
}

/**
 * Why an XML part is not well formed, or null when it is: every tag closed in order, attributes quoted and not twice,
 * entities known, no < in text or values, and every prefix of an element or attribute declared where it is used.
 */
export function xmlProblem(xml: string): string | null {
  const stack: { name: string; ns: Map<string, string> }[] = [];
  let roots = 0;
  const NAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/;
  const entities = (s: string, where: string) => {
    for (const m of s.matchAll(/&([^;\s]*);?/g)) {
      const e = m[1];
      if (!m[0].endsWith(';') || !(e in NAMED || /^#\d+$/.test(e) || /^#x[0-9a-f]+$/i.test(e))) return `a bad entity (&${e}) in ${where}`;
    }
    return null;
  };
  const toks = tokens(xml);
  for (const t of toks) {
    if (t.kind === 'text') {
      if (t.name === '#cdata') continue;
      const s = xml.slice(t.start, t.end);
      if (!stack.length) {
        if (s.trim()) return 'text outside the root element';
        continue;
      }
      const bad = entities(s, 'text');
      if (bad) return bad;
      if (s.includes('>') && /\]\]>/.test(s)) return 'a stray ]]> in text';
      continue;
    }
    if (t.kind === 'close') {
      const top = stack.pop();
      if (!top || top.name !== t.name) return `</${t.name}> closes ${top ? `<${top.name}>` : 'nothing'}`;
      continue;
    }
    if (!NAME.test(t.name)) return `a bad element name <${t.name}>`;
    const ns = new Map(stack.length ? stack[stack.length - 1].ns : [['xml', 'http://www.w3.org/XML/1998/namespace']]);
    const seen = new Set<string>();
    const attrs = t.attrs ?? '';
    const re = /\s*([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/y;
    let at = 0;
    const list: [string, string][] = [];
    while (at < attrs.length) {
      if (!attrs.slice(at).trim()) break;
      re.lastIndex = at;
      const m = re.exec(attrs);
      if (!m) return `a bad attribute in <${t.name}>: ${attrs.slice(at, at + 40).trim()}`;
      const [, an, , v1, v2] = m;
      const v = v1 ?? v2 ?? '';
      if (!NAME.test(an)) return `a bad attribute name ${an} in <${t.name}>`;
      if (seen.has(an)) return `${an} twice in <${t.name}>`;
      seen.add(an);
      if (v.includes('<')) return `a < in ${an} of <${t.name}>`;
      const bad = entities(v, `${an} of <${t.name}>`);
      if (bad) return bad;
      list.push([an, v]);
      at = re.lastIndex;
    }
    for (const [an, v] of list) {
      if (an === 'xmlns') ns.set('', v);
      else if (an.startsWith('xmlns:')) ns.set(an.slice(6), v);
    }
    const prefix = (q: string) => (q.includes(':') ? q.split(':')[0] : null);
    const ep = prefix(t.name);
    if (ep && !ns.has(ep)) return `the prefix ${ep} of <${t.name}> is not declared`;
    for (const [an] of list) {
      const p = prefix(an);
      if (p && p !== 'xmlns' && !ns.has(p)) return `the prefix ${p} of ${an} in <${t.name}> is not declared`;
    }
    if (!stack.length) roots++;
    if (roots > 1) return 'more than one root element';
    if (t.kind === 'open') stack.push({ name: t.name, ns });
  }
  if (stack.length) return `<${stack[stack.length - 1].name}> is never closed`;
  if (!roots) return 'no root element';
  return null;
}

// ---- the main document's words, and where each piece of them is ---------------------------------------------------

interface Piece {
  /** Its paragraph. */
  p: number;
  run: number;
  /** The whole <w:t> element, and its text (decoded). */
  elStart: number;
  elEnd: number;
  text: string;
  /** A tab or a break: a space in the paragraph's words, never cut. */
  gap?: boolean;
}

interface Run {
  start: number;
  /** The end of its opening tag. */
  openEnd: number;
  end: number;
  /** Its <w:rPr>, when it has one. */
  rPr: [number, number] | null;
  /** Its font size in points, when its own properties say. */
  pt?: number;
}

interface Para {
  start: number;
  openEnd: number;
  end: number;
  self: boolean;
  pieces: number[];
}

interface Body {
  xml: string;
  w: string;
  paras: Para[];
  runs: Run[];
  pieces: Piece[];
  /** Top-level tables: rows of cells, each cell its paragraphs. */
  tables: number[][][][];
  /** Where a new last paragraph goes: before the body's own sectPr, or its end. */
  endAt: number;
}

/** The prefix the document gives Word's main namespace ("w", nearly always). */
function mainPrefix(xml: string): string {
  const m = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)\\s*=\\s*["']${W_NS.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}["']`).exec(xml);
  if (!m) throw new Error('This is not a Word document this can sign (its main part has no Word namespace)');
  return m[1];
}

/** Wrappers that do not make a level of their own between a table, its rows, cells and paragraphs. */
const SEE_THROUGH = new Set(['sdt', 'sdtContent', 'customXml', 'smartTag']);

function readBody(xml: string): Body {
  const w = mainPrefix(xml);
  const toks = tokens(xml);
  const paras: Para[] = [];
  const runs: Run[] = [];
  const pieces: Piece[] = [];
  const tables: number[][][][] = [];
  const stack: { name: string; tok: Tok; para?: number; run?: number; table?: number; row?: number; cell?: number }[] = [];
  const local = (q: string) => (q.startsWith(`${w}:`) ? q.slice(w.length + 1) : null);
  // The nearest open element of a kind, and the nearest that is not a see-through wrapper.
  const nearest = (k: string) => {
    for (let i = stack.length - 1; i >= 0; i--) if (local(stack[i].name) === k) return stack[i];
    return null;
  };
  const parent = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (!SEE_THROUGH.has(local(stack[i].name) ?? '')) return stack[i];
    return null;
  };
  let endAt = -1;
  let bodyDepth = -1;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const k = t.kind === 'text' ? null : local(t.name);
    if (t.kind === 'open' || t.kind === 'self') {
      const par = parent();
      const entry: (typeof stack)[number] = { name: t.name, tok: t };
      if (k === 'body') bodyDepth = stack.length;
      if (k === 'sectPr' && stack.length === bodyDepth + 1 && endAt < 0) endAt = t.start;
      if (k === 'p') {
        const p: Para = { start: t.start, openEnd: t.end, end: t.end, self: t.kind === 'self', pieces: [] };
        paras.push(p);
        entry.para = paras.length - 1;
        if (par && local(par.name) === 'tc' && par.cell !== undefined && par.table !== undefined && par.row !== undefined) tables[par.table][par.row][par.cell].push(paras.length - 1);
      } else if (k === 'r' && nearest('p')) {
        runs.push({ start: t.start, openEnd: t.end, end: t.end, rPr: null });
        entry.run = runs.length - 1;
      } else if (k === 'tbl') {
        // Only tables of the body: not inside another table.
        if (!nearest('tbl')) {
          tables.push([]);
          entry.table = tables.length - 1;
        }
      } else if (k === 'tr' && par && local(par.name) === 'tbl' && par.table !== undefined) {
        tables[par.table].push([]);
        entry.table = par.table;
        entry.row = tables[par.table].length - 1;
      } else if (k === 'tc' && par && local(par.name) === 'tr' && par.table !== undefined && par.row !== undefined) {
        tables[par.table][par.row].push([]);
        entry.table = par.table;
        entry.row = par.row;
        entry.cell = tables[par.table][par.row].length - 1;
      } else if (k === 'rPr' && par && local(par.name) === 'r' && par.run !== undefined) {
        const r = runs[par.run];
        if (!r.rPr) {
          // Its end: this tag's own, or its closing tag's.
          let end = t.end;
          if (t.kind === 'open') {
            let depth = 0;
            for (let j = i + 1; j < toks.length; j++) {
              const u = toks[j];
              if (u.kind === 'open' && u.name === t.name) depth++;
              else if (u.kind === 'close' && u.name === t.name) {
                if (!depth) {
                  end = u.end;
                  break;
                }
                depth--;
              }
            }
          }
          r.rPr = [t.start, end];
          const sz = /<[\w.-]+:sz\s+[\w.-]+:val\s*=\s*["'](\d+)["']/.exec(xml.slice(t.start, end));
          if (sz) r.pt = Number(sz[1]) / 2;
        }
      } else if ((k === 't' || k === 'tab' || k === 'br' || k === 'cr') && par && local(par.name) === 'r' && par.run !== undefined) {
        const pe = nearest('p');
        if (pe?.para !== undefined) {
          if (k === 't') {
            let text = '';
            let elEnd = t.end;
            if (t.kind === 'open') {
              // Its words, up to its closing tag (a <w:t> holds text alone, so that is the next one).
              let j = i + 1;
              while (j < toks.length && !(toks[j].kind === 'close' && toks[j].name === t.name)) j++;
              if (j < toks.length) {
                text = decodeXml(xml.slice(t.end, toks[j].start));
                elEnd = toks[j].end;
              }
            }
            pieces.push({ p: pe.para, run: par.run, elStart: t.start, elEnd, text });
          } else pieces.push({ p: pe.para, run: par.run, elStart: t.start, elEnd: t.end, text: ' ', gap: true });
          paras[pe.para].pieces.push(pieces.length - 1);
        }
      }
      if (t.kind === 'open') stack.push(entry);
      else if (k === 'p') paras[entry.para!].end = t.end;
      else if (k === 'r' && entry.run !== undefined) runs[entry.run].end = t.end;
    } else if (t.kind === 'close') {
      const top = stack.pop();
      if (!top) continue;
      if (top.para !== undefined) paras[top.para].end = t.end;
      if (top.run !== undefined) runs[top.run].end = t.end;
      if (k === 'body' && endAt < 0) endAt = t.start;
    }
  }
  if (endAt < 0) throw new Error('This Word document has no body to sign');
  return { xml, w, paras, runs, pieces, tables, endAt };
}

/** A paragraph's words, and for each of their characters the piece and the place in it. */
function paraWords(b: Body, p: number): { text: string; at: [number, number][] } {
  let text = '';
  const at: [number, number][] = [];
  for (const i of b.paras[p].pieces) {
    const pc = b.pieces[i];
    for (let k = 0; k < pc.text.length; k++) at.push([i, k]);
    text += pc.text;
  }
  return { text, at };
}

/** Where words are in a paragraph, ignoring case and runs of spaces: their first and last characters' places. */
function findIn(text: string, words: string): [number, number][] {
  const want = words.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!want) return [];
  // The words with their spaces made one, and where each character came from.
  let norm = '';
  const from: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = /\s/.test(text[i]) ? ' ' : text[i].toLowerCase();
    if (c === ' ' && norm.endsWith(' ')) continue;
    norm += c;
    from.push(i);
  }
  const out: [number, number][] = [];
  for (let i = norm.indexOf(want); i >= 0; i = norm.indexOf(want, i + 1)) out.push([from[i], from[i + want.length - 1]]);
  return out;
}

/** The words' places throughout the document, in order: paragraph, and where in its words. */
function findAll(b: Body, words: string): { p: number; s: number; e: number }[] {
  const out: { p: number; s: number; e: number }[] = [];
  b.paras.forEach((_, p) => {
    const { text } = paraWords(b, p);
    for (const [s, e] of findIn(text, words)) out.push({ p, s, e });
  });
  return out;
}

function pickOccurrence<T>(list: T[], occurrence: number | undefined, what: string): T {
  if (!list.length) throw new Error(what);
  const n = Math.trunc(Number(occurrence) || 1);
  const i = n < 0 ? list.length + n : n - 1;
  if (i < 0 || i >= list.length) throw new Error(`Those words are in the document ${list.length} time${list.length === 1 ? '' : 's'}: occurrence is from 1 to ${list.length} (or -1 for the last)`);
  return list[i];
}

const clip = (s: string, n: number, end: boolean) => {
  const t = s.replace(/\s+/g, ' ');
  return end ? (t.length > n ? `…${t.slice(-n).trimStart()}` : t) : t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
};

// ---- the picture ------------------------------------------------------------------------------------------------

function drawingRun(o: { w: string; rId: string; id: number; cx: number; cy: number; float: boolean; pt: number; before: number; name: string }): string {
  const { w, rId, id, cx, cy } = o;
  const graphic =
    `<wp:docPr id="${id}" name="${escXml(o.name)} ${id}" descr="${escXml(o.name)}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A_NS}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${A_NS}"><a:graphicData uri="${PIC_NS}"><pic:pic xmlns:pic="${PIC_NS}">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="signature${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="${R_NS}" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>`;
  let drawing: string;
  if (o.float) {
    // In front of the text, from where the words stop, standing on the baseline of the paragraph's first line (its tails
    // a little below), so whatever follows (a line of underscores) stays where it was. From the paragraph's top, as Word
    // writes floating pictures itself: Word and LibreOffice read that alike (from the line, they do not).
    const line = o.pt * 1.15 * 12700;
    const top = Math.round(o.before + line * 0.8 - cy * 0.85);
    drawing =
      `<wp:anchor xmlns:wp="${WP_NS}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251659264 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
      `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="character"><wp:posOffset>0</wp:posOffset></wp:positionH>` +
      `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${top}</wp:posOffset></wp:positionV>` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>${graphic}</wp:anchor>`;
  } else drawing = `<wp:inline xmlns:wp="${WP_NS}" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${graphic}</wp:inline>`;
  return `<${w}:r><${w}:rPr><${w}:noProof/></${w}:rPr><${w}:drawing>${drawing}</${w}:drawing></${w}:r>`;
}

/** A run cut in two at a place in one of its pieces, `put` between the halves (or before or after it, at an end). */
function splitRun(b: Body, piece: number, k: number, put: string): { start: number; end: number; xml: string } {
  const pc = b.pieces[piece];
  const r = b.runs[pc.run];
  const x = b.xml;
  const w = b.w;
  const t1 = pc.text.slice(0, k);
  const t2 = pc.text.slice(k);
  const propsEnd = r.rPr ? r.rPr[1] : r.openEnd;
  const closeAt = x.lastIndexOf('</', r.end - 1);
  const beforeIt = x.slice(propsEnd, pc.elStart).trim();
  const afterIt = x.slice(pc.elEnd, closeAt).trim();
  if (!t1 && !beforeIt) return { start: r.start, end: r.start, xml: put };
  if (!t2 && !afterIt) return { start: r.end, end: r.end, xml: put };
  const props = r.rPr ? x.slice(r.rPr[0], r.rPr[1]) : '';
  const tag = (s: string) => `<${w}:t xml:space="preserve">${escXml(s)}</${w}:t>`;
  const first = `${x.slice(r.start, pc.elStart)}${t1 ? tag(t1) : ''}</${w}:r>`;
  const second = `${x.slice(r.start, r.openEnd)}${props}${t2 ? tag(t2) : ''}${x.slice(pc.elEnd, r.end)}`;
  return { start: r.start, end: r.end, xml: first + put + second };
}

const splice = (s: string, at: { start: number; end: number; xml: string }) => s.slice(0, at.start) + at.xml + s.slice(at.end);

/** A name in the zip no part has (in any case): word/media/signature1.png, then 2… */
function freeName(zip: Zip, make: (n: number) => string): string {
  for (let n = 1; ; n++) if (!zip.has(make(n))) return make(n);
}

// ---- the zip, its other parts as they were ------------------------------------------------------------------------

/** The zip again: `changed` parts written anew (deflated), `added` ones after the rest, every other part copied as packed. */
export function rezip(zip: Zip, changed: Map<string, Buffer>, added: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const dos = { time: (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2), date: ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate() };
  const put = (e: { name: string; method: number; crc: number; csize: number; usize: number; dosTime: number; dosDate: number; data: Buffer }) => {
    if (e.csize > 0xfffffff0 || e.usize > 0xfffffff0 || offset > 0xfffffff0) throw new Error('This Word file is too large to sign here');
    const name = Buffer.from(e.name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(e.method, 8);
    head.writeUInt16LE(e.dosTime, 10);
    head.writeUInt16LE(e.dosDate, 12);
    head.writeUInt32LE(e.crc >>> 0, 14);
    head.writeUInt32LE(e.csize, 18);
    head.writeUInt32LE(e.usize, 22);
    head.writeUInt16LE(name.length, 26);
    local.push(head, name, e.data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(e.method, 10);
    c.writeUInt16LE(e.dosTime, 12);
    c.writeUInt16LE(e.dosDate, 14);
    c.writeUInt32LE(e.crc >>> 0, 16);
    c.writeUInt32LE(e.csize, 20);
    c.writeUInt32LE(e.usize, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + e.data.length;
  };
  const fresh = (name: string, raw: Buffer) => {
    const packed = /\.(png|jpe?g|gif)$/i.test(name) ? null : zlib.deflateRawSync(raw, { level: 6 });
    const use = packed && packed.length < raw.length ? packed : raw;
    put({ name, method: use === raw ? 0 : 8, crc: zlib.crc32(raw), csize: use.length, usize: raw.length, dosTime: dos.time, dosDate: dos.date, data: use });
  };
  for (const name of zip.names()) {
    const c = changed.get(name);
    if (c) {
      fresh(name, c);
      continue;
    }
    const e = zip.packed(name);
    if (!e) throw new Error(`Part ${name} of this Word file cannot be copied (it is encrypted or damaged)`);
    put(e);
  }
  for (const a of added) fresh(a.name, a.data);
  const cd = Buffer.concat(central);
  if (central.length / 2 > 0xffff) throw new Error('This Word file has too many parts to sign here');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

// ---- placing it ---------------------------------------------------------------------------------------------------

/** The main document part's name (word/document.xml, as the package's relationships say). */
function mainPart(zip: Zip): string {
  const rels = zip.text('_rels/.rels') ?? '';
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)>/g)) {
    const type = /\bType\s*=\s*["']([^"']+)["']/.exec(m[1])?.[1] ?? '';
    const target = /\bTarget\s*=\s*["']([^"']+)["']/.exec(m[1])?.[1];
    if (DOC_REL.test(type) && target) return decodeXml(target).replace(/^\/+/, '');
  }
  return 'word/document.xml';
}

/**
 * A signature (`png`, `px` its size in pixels) placed into a Word file at `spot`, `widthMm` wide; `float` puts it in front
 * of the text (the default right after words) rather than in the line. Throws, in words an agent can act on, when the
 * spot is not there.
 */
export function placeInDocx(file: Buffer, png: Buffer, px: { width: number; height: number }, spot: DocxSpot, o: { widthMm: number; float?: boolean; name?: string }): DocxPlacement {
  let zip: Zip;
  try {
    zip = new Zip(file);
  } catch {
    throw new Error('This is not a Word file (.docx) this can open');
  }
  const part = mainPart(zip);
  const xml = zip.text(part);
  if (!xml) throw new Error('This Word file has no document part (it may be damaged, or locked with a password)');
  const b0 = readBody(xml);
  const float = o.float ?? !!spot.after;
  let doc = xml;
  let where = '';
  let place: PlaceSpot = { kind: 'end' };
  let before = '';
  let after = '';
  // Where it goes: a run split at a place in a piece, or a paragraph's end, or a new paragraph at the end.
  let at: { piece: number; k: number } | { para: number } | { end: true };
  let body = b0;
  if (spot.placeholder || spot.after) {
    const words = (spot.placeholder ?? spot.after)!;
    const hits = findAll(b0, words);
    const hit = pickOccurrence(hits, spot.occurrence, `“${words}” is not in the document. Read it (read_document) and name words that are, as they are written there.`);
    const { text, at: map } = paraWords(b0, hit.p);
    before = clip(text.slice(0, spot.placeholder ? hit.s : hit.e + 1), 90, true);
    after = clip(text.slice(hit.e + 1), 90, false);
    where = `${spot.placeholder ? `in place of “${words}”` : `right after “${words}”`} (paragraph ${hit.p + 1} of ${b0.paras.length}${hits.length > 1 ? `; the ${ordinal(hits.indexOf(hit) + 1)} of ${hits.length} places with those words` : ''})`;
    place = { kind: 'words', words, how: spot.placeholder ? 'replace' : 'after', ...(hits.length > 1 ? { nth: hits.indexOf(hit) + 1, of: hits.length } : {}) };
    if (spot.placeholder) {
      // The words go first (each piece of them cut where it is), then the picture goes where they began.
      const cuts = new Map<number, [number, number]>();
      for (let c = hit.s; c <= hit.e; c++) {
        const [pi, k] = map[c];
        if (b0.pieces[pi].gap) continue;
        const span = cuts.get(pi);
        cuts.set(pi, span ? [span[0], k + 1] : [k, k + 1]);
      }
      const order = [...cuts.entries()].sort((x, y) => b0.pieces[y[0]].elStart - b0.pieces[x[0]].elStart);
      for (const [pi, [s, e]] of order) {
        const pc = b0.pieces[pi];
        const t = pc.text.slice(0, s) + pc.text.slice(e);
        doc = splice(doc, { start: pc.elStart, end: pc.elEnd, xml: `<${b0.w}:t xml:space="preserve">${escXml(t)}</${b0.w}:t>` });
      }
      body = readBody(doc);
      const [pi, k] = map[hit.s];
      // The piece the words began in, or (a tab) the next one.
      at = b0.pieces[pi].gap ? { piece: Math.min(pi + 1, body.pieces.length - 1), k: 0 } : { piece: pi, k };
    } else {
      const [pi, k] = map[hit.e];
      at = { piece: pi, k: b0.pieces[pi].gap ? 0 : k + 1 };
      if (b0.pieces[pi].gap) at = { piece: pi + 1 < b0.pieces.length && b0.pieces[pi + 1].p === hit.p ? pi + 1 : pi, k: 0 };
    }
  } else if (spot.cell) {
    const { table, row, column } = spot.cell;
    const tb = b0.tables[Math.trunc(table) - 1];
    if (!tb) throw new Error(`The document has ${b0.tables.length} table${b0.tables.length === 1 ? '' : 's'}: cell.table is from 1 to ${b0.tables.length}`);
    const rw = tb[Math.trunc(row) - 1];
    if (!rw) throw new Error(`Table ${table} has ${tb.length} rows: cell.row is from 1 to ${tb.length}`);
    const cl = rw[Math.trunc(column) - 1];
    if (!cl) throw new Error(`Row ${row} of table ${table} has ${rw.length} cells: cell.column is from 1 to ${rw.length} (a merged cell counts once)`);
    if (!cl.length) throw new Error('That cell has no paragraph to put it in');
    const para = cl[cl.length - 1];
    at = { para };
    before = clip(paraWords(b0, para).text, 90, true);
    where = `in table ${table}, row ${row}, column ${column}`;
    place = { kind: 'cell', table, row, column };
  } else {
    at = { end: true };
    const last = [...b0.paras.keys()].reverse().find((p) => paraWords(b0, p).text.trim());
    before = last === undefined ? '' : clip(paraWords(b0, last).text, 90, true);
    where = 'at the end of the document';
  }

  // The picture's part, its relationship and its content type.
  const media = freeName(zip, (n) => `word/media/signature${n}.png`);
  const relsName = part.replace(/([^/]+)$/, '_rels/$1.rels');
  const relsXml = zip.text(relsName) ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const ids = new Set([...relsXml.matchAll(/\bId\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
  let rId = 'rIdSignature1';
  for (let n = 2; ids.has(rId); n++) rId = `rIdSignature${n}`;
  const partDir = part.includes('/') ? part.slice(0, part.lastIndexOf('/') + 1) : '';
  const target = media.startsWith(partDir) ? media.slice(partDir.length) : `/${media}`;
  const closeRels = relsXml.lastIndexOf('</');
  if (closeRels < 0) throw new Error('This Word file’s relationships are damaged');
  const rels = `${relsXml.slice(0, closeRels)}<Relationship Id="${rId}" Type="${IMAGE_REL}" Target="${escXml(target)}"/>${relsXml.slice(closeRels)}`;
  let types = zip.text('[Content_Types].xml');
  if (!types) throw new Error('This Word file has no content types (it may be damaged)');
  if (!/<(?:\w+:)?Default\b[^>]*\bExtension\s*=\s*["']png["']/i.test(types)) {
    const open = /<(?:\w+:)?Types\b[^>]*>/.exec(types);
    if (!open) throw new Error('This Word file’s content types are damaged');
    types = `${types.slice(0, open.index + open[0].length)}<Default Extension="png" ContentType="image/png"/>${types.slice(open.index + open[0].length)}`;
  }

  // Its size, and a picture id the document does not use.
  const cx = Math.round(o.widthMm * 36000);
  const cy = Math.round((cx * px.height) / Math.max(1, px.width));
  const used = [...doc.matchAll(/<[\w.-]+:docPr\b[^>]*?\bid\s*=\s*["'](\d+)["']/g)].map((m) => Number(m[1]));
  const id = (used.length ? Math.max(...used) : 0) + 1;
  const ptOf = (run: number | undefined) => (run === undefined ? undefined : body.runs[run]?.pt);
  const pt = 'piece' in at ? (ptOf(body.pieces[at.piece]?.run) ?? 11) : 11;
  // The space before the paragraph, when it says (twips), for where its first line's baseline is.
  const para = 'piece' in at ? body.paras[body.pieces[at.piece].p] : null;
  const spacing = para ? /<[\w.-]+:spacing\b[^>]*?[\w.-]+:before\s*=\s*["'](\d+)["']/.exec(doc.slice(para.start, para.end).split(/<[\w.-]+:r[\s>]/)[0]) : null;
  const run = drawingRun({ w: body.w, rId, id, cx, cy, float, pt, before: spacing ? Number(spacing[1]) * 635 : 0, name: o.name ?? 'Signature' });
  if ('piece' in at) doc = splice(doc, splitRun(body, at.piece, at.k, run));
  else if ('para' in at) {
    const p = body.paras[at.para];
    doc = p.self ? splice(doc, { start: p.start, end: p.end, xml: `${doc.slice(p.start, p.end - 2).trimEnd()}>${run}</${body.w}:p>` }) : splice(doc, { start: doc.lastIndexOf('</', p.end - 1), end: doc.lastIndexOf('</', p.end - 1), xml: run });
  } else doc = splice(doc, { start: body.endAt, end: body.endAt, xml: `<${body.w}:p>${run}</${body.w}:p>` });

  for (const [name, x] of [
    [part, doc],
    [relsName, rels],
    ['[Content_Types].xml', types],
  ] as const) {
    const bad = xmlProblem(x);
    if (bad) throw new Error(`Placing it would leave ${name} damaged (${bad}); nothing was written`);
  }
  const changed = new Map<string, Buffer>([
    [zip.find(part) ?? part, Buffer.from(doc, 'utf8')],
    [zip.find('[Content_Types].xml') ?? '[Content_Types].xml', Buffer.from(types, 'utf8')],
  ]);
  const added = [{ name: media, data: png }];
  if (zip.has(relsName)) changed.set(zip.find(relsName)!, Buffer.from(rels, 'utf8'));
  else added.unshift({ name: relsName, data: Buffer.from(rels, 'utf8') });
  return { docx: rezip(zip, changed, added), where, spot: place, before, after, float };
}

const ordinal = (n: number) => (n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`);
