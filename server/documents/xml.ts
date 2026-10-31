// Just enough XML for documents: a forgiving scanner (tags, text, CDATA; comments, declarations and
// doctypes skipped), and a small tree built on it. Elements are known by their local name ("p" for
// w:p), attributes by their full name, with lookups that ignore the prefix. Node built-ins only.

export interface El {
  /** Local name: "p" for <w:p>. */
  n: string;
  a: Record<string, string>;
  c: Node[];
}
export type Node = El | string;

const NAMED: Record<string, string> = {
  lt: '<', gt: '>', amp: '&', quot: '"', apos: "'",
  // HTML names some e-books use without declaring them.
  nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', deg: '°', times: '×', euro: '€', pound: '£', shy: '', thinsp: ' ', ensp: ' ', emsp: ' ',
};

export function decode(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}

const local = (q: string) => {
  const i = q.indexOf(':');
  return i < 0 ? q : q.slice(i + 1);
};

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw.includes('=')) return out;
  const re = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1]] = decode(m[2] ?? m[3] ?? '');
  return out;
}

export interface ScanHandlers {
  open(name: string, a: Record<string, string>, selfClosing: boolean): void | false;
  close(name: string): void;
  text(t: string): void;
}

/** Walks the XML once, in order. `open` returning false stops the walk. */
export function scan(xml: string, h: ScanHandlers) {
  const len = xml.length;
  let i = 0;
  while (i < len) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      h.text(decode(xml.slice(i)));
      return;
    }
    if (lt > i) h.text(decode(xml.slice(i, lt)));
    const c1 = xml.charCodeAt(lt + 1);
    if (c1 === 33 /* ! */) {
      if (xml.startsWith('<!--', lt)) {
        const e = xml.indexOf('-->', lt + 4);
        i = e < 0 ? len : e + 3;
      } else if (xml.startsWith('<![CDATA[', lt)) {
        const e = xml.indexOf(']]>', lt + 9);
        h.text(xml.slice(lt + 9, e < 0 ? len : e));
        i = e < 0 ? len : e + 3;
      } else {
        // A doctype, perhaps with an internal subset in brackets.
        let j = lt + 2;
        let depth = 0;
        for (; j < len; j++) {
          const ch = xml[j];
          if (ch === '[') depth++;
          else if (ch === ']') depth--;
          else if (ch === '>' && depth <= 0) break;
        }
        i = j + 1;
      }
      continue;
    }
    if (c1 === 63 /* ? */) {
      const e = xml.indexOf('?>', lt + 2);
      i = e < 0 ? len : e + 2;
      continue;
    }
    // A tag: up to the first '>' outside quotes.
    let j = lt + 1;
    let q = 0;
    for (; j < len; j++) {
      const ch = xml.charCodeAt(j);
      if (q) {
        if (ch === q) q = 0;
      } else if (ch === 34 || ch === 39) q = ch;
      else if (ch === 62) break;
    }
    const raw = xml.slice(lt + 1, j);
    i = j + 1;
    if (raw[0] === '/') {
      h.close(local(raw.slice(1).trim()));
      continue;
    }
    const self = raw.endsWith('/');
    const body = self ? raw.slice(0, -1) : raw;
    const sp = body.search(/[\s]/);
    const name = sp < 0 ? body : body.slice(0, sp);
    if (!name) continue;
    if (h.open(local(name), sp < 0 ? {} : attrs(body.slice(sp)), self) === false) return;
    if (self) h.close(local(name));
  }
}

/** The XML as a tree (the root element), cut at `maxNodes` nodes. */
export function parseXml(xml: string, maxNodes = 1_500_000): { root: El; cut: boolean } {
  const root: El = { n: '#root', a: {}, c: [] };
  const stack: El[] = [root];
  let nodes = 0;
  let cut = false;
  scan(xml, {
    open(n, a) {
      if (++nodes > maxNodes) return ((cut = true), false);
      const el: El = { n, a, c: [] };
      stack[stack.length - 1].c.push(el);
      stack.push(el);
    },
    close(n) {
      // Forgiving: close up to the nearest open element of that name.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].n === n) {
          stack.length = k;
          return;
        }
      }
    },
    text(t) {
      if (!t) return;
      nodes++;
      stack[stack.length - 1].c.push(t);
    },
  });
  const top = root.c.find((x): x is El => typeof x !== 'string');
  return { root: top ?? root, cut };
}

export const isEl = (x: Node | undefined): x is El => !!x && typeof x !== 'string';

/** Child elements, of one local name or all. */
export function kids(el: El | undefined, name?: string): El[] {
  if (!el) return [];
  const out: El[] = [];
  for (const x of el.c) if (typeof x !== 'string' && (!name || x.n === name)) out.push(x);
  return out;
}

export const kid = (el: El | undefined, name: string): El | undefined => el?.c.find((x): x is El => typeof x !== 'string' && x.n === name);

/** The first element of these local names on a path down the tree: path(sp, 'spPr', 'xfrm', 'off'). */
export function path(el: El | undefined, ...names: string[]): El | undefined {
  let cur = el;
  for (const n of names) cur = kid(cur, n);
  return cur;
}

/** Every element of this local name below `el`, in document order. */
export function all(el: El | undefined, name: string, out: El[] = []): El[] {
  if (!el) return out;
  for (const x of el.c) {
    if (typeof x === 'string') continue;
    if (x.n === name) out.push(x);
    all(x, name, out);
  }
  return out;
}

/** An attribute by local name: the unprefixed one first, then any prefix ("val" finds w:val). */
export function att(el: El | undefined, name: string): string | undefined {
  if (!el) return undefined;
  if (name in el.a) return el.a[name];
  for (const k in el.a) if (k.endsWith(`:${name}`)) return el.a[k];
  return undefined;
}

/** A prefixed attribute only (r:id, not id): links to related parts. */
export function patt(el: El | undefined, name: string): string | undefined {
  if (!el) return undefined;
  for (const k in el.a) if (k.endsWith(`:${name}`) && !k.startsWith('xmlns')) return el.a[k];
  return undefined;
}

/** All the text below an element, as it stands. */
export function textOf(el: Node | undefined): string {
  if (!el) return '';
  if (typeof el === 'string') return el;
  let s = '';
  for (const x of el.c) s += typeof x === 'string' ? x : textOf(x);
  return s;
}
