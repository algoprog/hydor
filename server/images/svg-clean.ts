// Drawings (SVG) made safe to keep and show. A drawing a model wrote, a vector model drew or a plot made is read as
// XML here and written out again from what is allowed alone, never patched by searching and replacing: its shapes,
// words, gradients, patterns, clip paths, masks, markers, symbols and the usual filters, with the attributes that
// draw them. Its own CSS (a <style> element, style="…") is put on the shapes it styles, the properties that only
// draw, so no CSS is left to reach anything else. Left out: scripts and on… handlers, links, pictures and anything
// loaded from elsewhere (an href or url() that is not one of the drawing's own #ids), foreignObject, animations,
// comments, entities and DOCTYPEs. Its ids get a prefix of its own, so two drawings on one page never take each
// other's gradients. Cleaning a cleaned drawing changes nothing.
import crypto from 'node:crypto';

/** The largest drawing read, and the most elements and nesting in one: past these it is not a drawing to keep. */
const MAX_TEXT = 8 * 1024 * 1024;
const MAX_NODES = 200_000;
const MAX_DEPTH = 120;
/** The most shapes drawn once <use> has repeated what it points at: more, and every <use> goes. */
const MAX_DRAWN = 250_000;

const ELEMENT_NAMES = (
  'svg g defs symbol use title desc path rect circle ellipse line polyline polygon text tspan textPath linearGradient radialGradient stop pattern clipPath mask marker ' +
  'filter feBlend feColorMatrix feComponentTransfer feFuncR feFuncG feFuncB feFuncA feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight ' +
  'feDropShadow feFlood feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence'
).split(' ');
/** The elements kept, by their name in lower case (models write "lineargradient" too). */
const ELEMENTS = new Map(ELEMENT_NAMES.map((n) => [n.toLowerCase(), n]));
/** Left out themselves, what is inside them kept: a link's shapes. */
const UNWRAP = new Set(['a', 'switch']);
/** Words inside these are kept; elsewhere text is only the spaces between tags. */
const TEXT_IN = new Set(['text', 'tspan', 'textPath', 'title', 'desc']);
/** What draws something: a drawing with none of these left is empty. */
const DRAWS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'use']);
/** Where an href may point at one of the drawing's own #ids: a shape repeated, a path for words, a gradient, pattern or filter taken after. */
const HREF_ON = new Set(['use', 'textPath', 'linearGradient', 'radialGradient', 'pattern', 'filter']);

const ATTR_NAMES = [
  // where, how big, what shape
  'x y width height x1 y1 x2 y2 cx cy r rx ry fx fy fr d points pathLength viewBox preserveAspectRatio transform xml:space',
  // gradients, patterns, clips, masks, markers
  'offset gradientUnits gradientTransform spreadMethod patternUnits patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits markerUnits markerWidth markerHeight refX refY orient',
  // words
  'dx dy rotate textLength lengthAdjust startOffset method spacing side',
  // filters
  'filterUnits primitiveUnits in in2 result stdDeviation mode type values operator k1 k2 k3 k4 radius scale xChannelSelector yChannelSelector baseFrequency numOctaves seed stitchTiles tableValues',
  'slope intercept amplitude exponent surfaceScale diffuseConstant specularConstant specularExponent kernelUnitLength azimuth elevation pointsAtX pointsAtY pointsAtZ z limitingConeAngle order kernelMatrix',
  'divisor bias targetX targetY edgeMode preserveAlpha',
  // what it says to people who cannot see it
  'role aria-label aria-hidden lang xml:lang',
].flatMap((x) => x.split(' '));
/** The properties that are attributes too (fill="…" or style="fill: …"). */
const PRESENTATION = (
  'fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color display visibility ' +
  'overflow clip clip-path clip-rule mask filter marker-start marker-mid marker-end font-family font-size font-size-adjust font-weight font-style font-variant font-stretch text-anchor ' +
  'dominant-baseline alignment-baseline baseline-shift letter-spacing word-spacing text-decoration writing-mode direction unicode-bidi stop-color stop-opacity flood-color flood-opacity ' +
  'lighting-color color-interpolation color-interpolation-filters color-rendering paint-order vector-effect shape-rendering text-rendering image-rendering pointer-events'
).split(' ');
const PRESENTS = new Set(PRESENTATION);
/** CSS that only draws but is no attribute: kept in style="…". */
const CSS_ONLY = new Set(['font', 'marker', 'mix-blend-mode', 'isolation', 'transform', 'transform-origin', 'transform-box']);
/** The attributes kept, by their name in lower case. */
const ATTRS = new Map([...ATTR_NAMES, ...PRESENTATION].map((n) => [n.toLowerCase(), n]));

/** The functions a value may call: colours, sizes, transforms, CSS filters, and url() to the drawing's own #ids. */
const FUNCTIONS = new Set(
  (
    'url rgb rgba hsl hsla hwb lab lch oklab oklch color calc min max clamp matrix translate translatex translatey scale scalex scaley rotate skew skewx skewy ' +
    'drop-shadow blur brightness contrast grayscale hue-rotate invert opacity saturate sepia'
  ).split(' '),
);

/** Stands for the drawing's id prefix while it is cleaned (control characters are taken out of everything read). */
const P = '\u0001';
/** A prefix this file gave before: taken off, so cleaning again gives the same drawing. */
const OURS = /^h[0-9a-f]{6}-/;
const ID_OK = /^[A-Za-z_][\w.-]{0,80}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

// ---- reading -------------------------------------------------------------------------------------------------

interface Elem {
  tag: string;
  attrs: [string, string][];
  kids: Node[];
}
type Node = Elem | string;

/** Not a drawing to keep: too large, too many elements, nested too deep. */
class Refused extends Error {}

/** The few named characters models write, beyond XML's five; any other named entity is left out. */
const NAMED: Record<string, string> = Object.fromEntries(
  (
    'lt < gt > amp & quot " apos \' nbsp \u00a0 copy © reg ® trade ™ hellip … mdash — ndash – lsquo ‘ rsquo ’ ldquo “ rdquo ” laquo « raquo » bull • middot · deg ° times × ' +
    'divide ÷ plusmn ± minus − euro € pound £ yen ¥ cent ¢ sect § para ¶ micro µ frac12 ½ frac14 ¼ frac34 ¾ larr ← rarr → uarr ↑ darr ↓ harr ↔ check ✓ hearts ♥ star ☆'
  )
    .split(' ')
    .flatMap((x, i, all) => (i % 2 ? [] : [[x, all[i + 1]]])),
);

function decode(t: string): string {
  if (!t.includes('&')) return t.replace(CONTROL, '');
  return t
    .replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{0,31});/gi, (_m, e: string) => {
      if (e[0] !== '#') return NAMED[e] ?? NAMED[e.toLowerCase()] ?? '';
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '';
    })
    .replace(CONTROL, '');
}

const space = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;
const NAME = /[A-Za-z_][\w.:-]*/y;

/** Past a <!DOCTYPE …> (with its [ … ] of entities) or another <!…> declaration. */
function pastDeclaration(s: string, i: number): number {
  let depth = 0;
  let quote = '';
  for (let j = i + 2; j < s.length; j++) {
    const c = s[j];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === '>' && depth === 0) return j + 1;
  }
  return s.length;
}

/** The text as a tree of elements and words, leniently: an end tag closes up to its element, one that matches none is passed by. */
function parse(s: string): Elem {
  const top: Elem = { tag: '', attrs: [], kids: [] };
  const stack: Elem[] = [top];
  const text = (t: string) => void (t && stack[stack.length - 1].kids.push(t));
  let nodes = 0;
  let i = 0;
  const n = s.length;
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) {
      text(decode(s.slice(i)));
      break;
    }
    if (lt > i) text(decode(s.slice(i, lt)));
    i = lt;
    if (s.startsWith('<!--', i)) {
      const e = s.indexOf('-->', i + 4);
      i = e < 0 ? n : e + 3;
    } else if (s.startsWith('<![CDATA[', i)) {
      const e = s.indexOf(']]>', i + 9);
      text(s.slice(i + 9, e < 0 ? n : e).replace(CONTROL, ''));
      i = e < 0 ? n : e + 3;
    } else if (s.startsWith('<!', i)) i = pastDeclaration(s, i);
    else if (s.startsWith('<?', i)) {
      const e = s.indexOf('?>', i + 2);
      i = e < 0 ? n : e + 2;
    } else if (s.startsWith('</', i)) {
      NAME.lastIndex = i + 2;
      const m = NAME.exec(s);
      const gt = s.indexOf('>', i + 2);
      if (gt < 0) break;
      if (m) {
        const want = m[0].toLowerCase();
        for (let k = stack.length - 1; k > 0; k--)
          if (stack[k].tag.toLowerCase() === want) {
            stack.length = k;
            break;
          }
      }
      i = gt + 1;
    } else {
      NAME.lastIndex = i + 1;
      const m = NAME.exec(s);
      if (!m) {
        text('<');
        i++;
        continue;
      }
      i = NAME.lastIndex;
      const attrs: [string, string][] = [];
      let closed = false;
      let whole = false;
      while (i < n) {
        while (i < n && space(s.charCodeAt(i))) i++;
        if (i >= n) break;
        if (s[i] === '>') {
          i++;
          whole = true;
          break;
        }
        if (s[i] === '/' && s[i + 1] === '>') {
          i += 2;
          whole = closed = true;
          break;
        }
        let j = i;
        while (j < n && !space(s.charCodeAt(j)) && !'=>/"\'<'.includes(s[j])) j++;
        if (j === i) {
          i++;
          continue;
        }
        const name = s.slice(i, j);
        i = j;
        while (i < n && space(s.charCodeAt(i))) i++;
        let value = '';
        if (s[i] === '=') {
          i++;
          while (i < n && space(s.charCodeAt(i))) i++;
          const q = s[i];
          if (q === '"' || q === "'") {
            const e = s.indexOf(q, i + 1);
            if (e < 0) {
              i = n;
              break;
            }
            value = s.slice(i + 1, e);
            i = e + 1;
          } else {
            let e = i;
            while (e < n && !space(s.charCodeAt(e)) && s[e] !== '>' && !(s[e] === '/' && s[e + 1] === '>')) e++;
            value = s.slice(i, e);
            i = e;
          }
        }
        if (attrs.length < 200 && !attrs.some(([k]) => k === name)) attrs.push([name, decode(value)]);
      }
      // A tag cut off at the end of the text is not one.
      if (!whole) break;
      if (++nodes > MAX_NODES) throw new Refused('too many elements');
      const el: Elem = { tag: m[0], attrs, kids: [] };
      stack[stack.length - 1].kids.push(el);
      if (!closed) {
        if (stack.length > MAX_DEPTH) throw new Refused('nested too deep');
        stack.push(el);
      }
    }
  }
  return top;
}

// ---- the drawing's own CSS -------------------------------------------------------------------------------------

interface Decl {
  prop: string;
  value: string;
  important: boolean;
}
interface Rule {
  tag?: string;
  id?: string;
  classes: string[];
  /** How specific its selector is, then where it came: the later of two as specific wins. */
  spec: number;
  order: number;
  decls: Decl[];
}

function declarations(text: string): Decl[] {
  const out: Decl[] = [];
  for (const part of text.replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ').split(';')) {
    const c = part.indexOf(':');
    if (c < 0) continue;
    const prop = part.slice(0, c).trim().toLowerCase();
    let value = part.slice(c + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
    if (/^-?[a-z][a-z-]*$/.test(prop) && value) out.push({ prop, value, important });
  }
  return out;
}

function pastBlock(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return j + 1;
  }
  return s.length;
}

/** A selector of one element alone (rect, .a, #b, path.a.b, *): others (descendants, :hover, [x]) match nothing here. */
function selector(t: string): Omit<Rule, 'order' | 'decls'> | null {
  const m = /^(\*|[A-Za-z][\w-]*)?((?:[.#][A-Za-z_-][\w-]*)*)$/.exec(t);
  if (!t || !m) return null;
  const parts = m[2].match(/[.#][A-Za-z_-][\w-]*/g) ?? [];
  const ids = parts.filter((p) => p[0] === '#').map((p) => p.slice(1));
  if (ids.length > 1) return null;
  const classes = parts.filter((p) => p[0] === '.').map((p) => p.slice(1));
  const tag = m[1] && m[1] !== '*' ? m[1].toLowerCase() : undefined;
  return { tag, id: ids[0], classes, spec: ids.length * 10_000 + classes.length * 100 + (tag ? 1 : 0) };
}

/** The rules of a style sheet; at-rules (@import, @font-face, @media…) are left out with what is in them. */
function rules(css: string): Rule[] {
  const s = css.replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ');
  const out: Rule[] = [];
  let order = 0;
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s;}]/.test(s[i])) i++;
    if (i >= s.length) break;
    const brace = s.indexOf('{', i);
    if (s[i] === '@') {
      const semi = s.indexOf(';', i);
      i = brace < 0 || (semi >= 0 && semi < brace) ? (semi < 0 ? s.length : semi + 1) : pastBlock(s, brace);
      continue;
    }
    if (brace < 0) break;
    const end = s.indexOf('}', brace);
    const body = s.slice(brace + 1, end < 0 ? s.length : end);
    if (body.includes('{')) {
      i = pastBlock(s, brace);
      continue;
    }
    const decls = declarations(body);
    for (const one of s.slice(i, brace).split(',')) {
      const sel = selector(one.trim());
      if (sel) out.push({ ...sel, order: order++, decls });
    }
    i = end < 0 ? s.length : end + 1;
  }
  return out;
}

// ---- values ------------------------------------------------------------------------------------------------------

const unprefixed = (id: string) => id.replace(OURS, '');

/**
 * A value as kept: its url(#id)s pointed at the drawing's prefixed ids; null when it holds anything that could load or
 * run (a url() to anywhere else, a function that is not for drawing, a script address, CSS escapes).
 */
function value(raw: string, o: { css?: boolean; long?: boolean } = {}): string | null {
  const v = raw.replace(CONTROL, '').trim();
  if (!v || v.length > (o.long ? 2_000_000 : 4000)) return null;
  if (v.includes('\\') || /(?:java|vb)script\s*:|expression\s*\(|@import|-moz-binding|\/\*/i.test(v)) return null;
  if (o.css && (/[;{}<>]/.test(v) || (v.split('"').length - 1) % 2 || (v.split("'").length - 1) % 2)) return null;
  for (const m of v.matchAll(/([A-Za-z][\w-]*)?\s*\(/g)) if (!m[1] || !FUNCTIONS.has(m[1].toLowerCase())) return null;
  let urls = 0;
  const out = v.replace(/url\(\s*(['"]?)\s*#([A-Za-z_][\w.-]{0,80})\s*\1\s*\)/gi, (_m, _q, id: string) => {
    urls++;
    return `url(#${P}${unprefixed(id)})`;
  });
  return (v.match(/url\s*\(/gi)?.length ?? 0) === urls ? out : null;
}

// ---- writing again -------------------------------------------------------------------------------------------

/** An element as it is written out: its name as SVG spells it, its attributes cleaned, ids and refs with P before them. */
interface Clean {
  tag: string;
  attrs: [string, string][];
  kids: (Clean | string)[];
  /** Its id, without the prefix. */
  id?: string;
  /** What a <use> repeats: an id, without the prefix. */
  ref?: string;
}

/** The rules by what their selectors name, so each element is matched against its own few. */
interface Sheet {
  byId: Map<string, Rule[]>;
  byClass: Map<string, Rule[]>;
  byTag: Map<string, Rule[]>;
  any: Rule[];
}

function sheet(all: Rule[]): Sheet {
  const s: Sheet = { byId: new Map(), byClass: new Map(), byTag: new Map(), any: [] };
  const add = (m: Map<string, Rule[]>, k: string, r: Rule) => void (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  for (const r of all.slice(0, 5000)) {
    if (r.id) add(s.byId, r.id, r);
    else if (r.classes.length) add(s.byClass, r.classes[0], r);
    else if (r.tag) add(s.byTag, r.tag, r);
    else s.any.push(r);
  }
  return s;
}

interface Ctx {
  sheet: Sheet;
  /** The ids kept, without the prefix: the first element of each. */
  ids: Set<string>;
}

const local = (tag: string) => {
  const c = tag.indexOf(':');
  return { prefix: c < 0 ? '' : tag.slice(0, c).toLowerCase(), name: (c < 0 ? tag : tag.slice(c + 1)).toLowerCase() };
};

const attr = (e: Elem, name: string) => e.attrs.find(([k]) => k.toLowerCase() === name)?.[1];

/** The CSS that reaches an element: its rules by how specific they are, its own style="…" over them, !important over all. */
function css(e: Elem, name: string, s: Sheet): Map<string, string> {
  const id = attr(e, 'id');
  const classes = new Set((attr(e, 'class') ?? '').split(/\s+/).filter(Boolean));
  const near = [...(id ? (s.byId.get(id) ?? []) : []), ...[...classes].flatMap((c) => s.byClass.get(c) ?? []), ...(s.byTag.get(name) ?? []), ...s.any];
  const hit = near.filter((r) => (!r.tag || r.tag === name) && (!r.id || r.id === id) && r.classes.every((c) => classes.has(c))).sort((a, b) => a.spec - b.spec || a.order - b.order);
  const own = declarations(attr(e, 'style') ?? '');
  const out = new Map<string, string>();
  for (const important of [false, true]) {
    for (const r of hit) for (const d of r.decls) if (d.important === important) out.set(d.prop, d.value);
    for (const d of own) if (d.important === important) out.set(d.prop, d.value);
  }
  return out;
}

/** The ids of the elements kept, without the prefix, so references can be checked. */
function gather(e: Elem, ids: Set<string>, styles: string[]) {
  for (const k of e.kids) {
    if (typeof k === 'string') continue;
    const { prefix, name } = local(k.tag);
    if (name === 'style' && (!prefix || prefix === 'svg')) styles.push(k.kids.filter((x): x is string => typeof x === 'string').join(''));
    if (prefix && prefix !== 'svg') continue;
    if (!ELEMENTS.has(name) && !UNWRAP.has(name)) continue;
    const id = attr(k, 'id');
    if (ELEMENTS.has(name) && id && ID_OK.test(unprefixed(id))) ids.add(unprefixed(id));
    gather(k, ids, styles);
  }
}

/** Where an href points, when it is one of the drawing's own #ids. */
function ownRef(e: Elem, c: Ctx): string | undefined {
  const h = (attr(e, 'href') ?? attr(e, 'xlink:href') ?? '').replace(CONTROL, '').trim();
  const m = /^#([A-Za-z_][\w.-]{0,80})$/.exec(h);
  return m && c.ids.has(unprefixed(m[1])) ? unprefixed(m[1]) : undefined;
}

function clean(e: Elem, c: Ctx, seen: Set<string>): (Clean | string)[] {
  const { prefix, name } = local(e.tag);
  if (prefix && prefix !== 'svg') return [];
  const tag = ELEMENTS.get(name);
  if (!tag) return UNWRAP.has(name) ? e.kids.flatMap((k) => (typeof k === 'string' ? [] : clean(k, c, seen))) : [];
  const out: Clean = { tag, attrs: [], kids: [] };
  const put = (k: string, v: string) => {
    const at = out.attrs.findIndex(([x]) => x === k);
    if (at >= 0) out.attrs[at][1] = v;
    else out.attrs.push([k, v]);
  };
  for (const [raw, v] of e.attrs) {
    const k = raw.toLowerCase();
    if (k === 'id') {
      const id = unprefixed(v.trim());
      if (ID_OK.test(id) && !seen.has(id)) {
        seen.add(id);
        out.id = id;
        put('id', P + id);
      }
      continue;
    }
    const canon = ATTRS.get(k);
    if (!canon) continue;
    if (k === 'xml:space') {
      if (v === 'preserve' || v === 'default') put(canon, v);
      continue;
    }
    const kept = value(v, { long: k === 'd' || k === 'points' || k === 'values' || k === 'kernelmatrix' || k === 'tablevalues' });
    if (kept === null) continue;
    put(canon, canon === 'numOctaves' ? String(Math.max(0, Math.min(8, Math.round(Number(kept) || 0)))) : kept);
  }
  // The CSS that reaches it, as attributes where SVG has them, else in style="…".
  const style: string[] = [];
  for (const [prop, v] of css(e, name, c.sheet)) {
    if (!PRESENTS.has(prop) && !CSS_ONLY.has(prop)) continue;
    const kept = value(v, { css: true });
    if (kept === null) continue;
    if (PRESENTS.has(prop)) put(prop, kept);
    else style.push(`${prop}:${kept}`);
  }
  if (style.length) put('style', style.join(';'));
  if (HREF_ON.has(tag)) {
    const ref = ownRef(e, c);
    if (ref) {
      out.ref = tag === 'use' ? ref : undefined;
      put('xlink:href', `#${P}${ref}`);
    } else if (tag === 'use') return [];
  }
  for (const k of e.kids) {
    if (typeof k === 'string') {
      if (TEXT_IN.has(tag)) out.kids.push(k);
    } else out.kids.push(...clean(k, c, seen));
  }
  return [out];
}

/**
 * <use> that repeats one of its own ancestors, or what leads back to it: left out (each one found closes a loop, so
 * none is left). False when the drawing is too tangled to tell, and every <use> is to go.
 */
function cutLoops(root: Clean, byId: Map<string, Clean>): boolean {
  const on = new Set<Clean>();
  const done = new Set<Clean>();
  let steps = 0;
  const walk = (e: Clean, depth: number): boolean => {
    if (++steps > 2_000_000) throw new Refused('too tangled');
    if (on.has(e) || depth > 400) return false;
    if (done.has(e)) return true;
    on.add(e);
    e.kids = e.kids.filter((k) => typeof k === 'string' || walk(k, depth + 1));
    let fine = true;
    if (e.tag === 'use' && e.ref) {
      const t = byId.get(e.ref);
      fine = !t || walk(t, depth + 1);
    }
    on.delete(e);
    if (fine) done.add(e);
    return fine;
  };
  try {
    walk(root, 0);
    return true;
  } catch (e) {
    if (e instanceof Refused) return false;
    throw e;
  }
}

/** How many elements are drawn, <use> counting what it repeats each time (no loops are left by now). */
function drawn(root: Clean, byId: Map<string, Clean>): number {
  const memo = new Map<Clean, number>();
  const count = (e: Clean, depth: number): number => {
    const m = memo.get(e);
    if (m !== undefined) return m;
    if (depth > 400) return Infinity;
    let n = 1;
    for (const k of e.kids) if (typeof k !== 'string') n += count(k, depth + 1);
    if (e.tag === 'use' && e.ref && byId.has(e.ref)) n += count(byId.get(e.ref)!, depth + 1);
    n = Math.min(n, Number.MAX_SAFE_INTEGER);
    memo.set(e, n);
    return n;
  };
  return count(root, 0);
}

function index(e: Clean, byId: Map<string, Clean>) {
  if (e.id && !byId.has(e.id)) byId.set(e.id, e);
  for (const k of e.kids) if (typeof k !== 'string') index(k, byId);
}

function dropUses(e: Clean) {
  e.kids = e.kids.filter((k) => typeof k === 'string' || k.tag !== 'use');
  for (const k of e.kids) if (typeof k !== 'string') dropUses(k);
}

const linked = (e: Clean): boolean => e.attrs.some(([k]) => k === 'xlink:href') || e.kids.some((k) => typeof k !== 'string' && linked(k));
const hasDrawing = (e: Clean): boolean => DRAWS.has(e.tag) || e.kids.some((k) => typeof k !== 'string' && hasDrawing(k));

const escText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (t: string) => escText(t).replace(/"/g, '&quot;');

function write(e: Clean, prefix: string, out: string[]) {
  out.push('<', e.tag);
  for (const [k, v] of e.attrs) out.push(' ', k, '="', escAttr(v.replaceAll(P, prefix)), '"');
  if (!e.kids.length) {
    out.push('/>');
    return;
  }
  out.push('>');
  for (const k of e.kids) {
    if (typeof k === 'string') out.push(escText(k));
    else write(k, prefix, out);
  }
  out.push('</', e.tag, '>');
}

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?`;
const VIEWBOX = new RegExp(`^\\s*(${NUM})[\\s,]+(${NUM})[\\s,]+(${NUM})[\\s,]+(${NUM})\\s*$`, 'i');
const LENGTH = new RegExp(`^\\s*(${NUM})\\s*(?:px)?\\s*$`, 'i');

/** Numbers written short: whole when they are, else up to three decimals. */
const short = (n: number) => String(Math.round(n * 1000) / 1000);

/** The drawing's size and shape: its root's width and height (in pixels), else its viewBox's, and the viewBox to keep. */
function sized(root: Clean): { w: number; h: number } {
  const get = (k: string) => root.attrs.find(([x]) => x === k)?.[1];
  const vb = VIEWBOX.exec(get('viewBox') ?? '');
  const box = vb ? vb.slice(1, 5).map(Number) : null;
  const box_ok = box && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0;
  const wm = LENGTH.exec(get('width') ?? '');
  const hm = LENGTH.exec(get('height') ?? '');
  const w0 = wm ? Number(wm[1]) : NaN;
  const h0 = hm ? Number(hm[1]) : NaN;
  const set = (k: string, v: string | null) => {
    root.attrs = root.attrs.filter(([x]) => x !== k);
    if (v !== null) root.attrs.push([k, v]);
  };
  let w: number;
  let h: number;
  if (w0 > 0 && h0 > 0 && Number.isFinite(w0) && Number.isFinite(h0)) {
    [w, h] = [w0, h0];
    if (!box_ok) set('viewBox', `0 0 ${short(w0)} ${short(h0)}`);
  } else if (box_ok) [w, h] = [box![2], box![3]];
  else {
    // No size at all: a browser's for a picture without one, its units pixels.
    [w, h] = [300, 150];
    set('viewBox', '0 0 300 150');
  }
  if (box_ok) set('viewBox', box!.map(short).join(' '));
  // Small enough to be an icon's grid, or larger than a screen: a size to show it at, its shape kept.
  const long = Math.max(w, h);
  const k = long < 256 ? 512 / long : long > 4096 ? 2048 / long : 1;
  const W = Math.max(1, Math.round(w * k));
  const H = Math.max(1, Math.round(h * k));
  set('width', String(W));
  set('height', String(H));
  return { w: W, h: H };
}

/** The first <svg> in the tree (a model may wrap it). */
function findSvg(e: Elem): Elem | null {
  for (const k of e.kids) {
    if (typeof k === 'string') continue;
    const { prefix, name } = local(k.tag);
    if (name === 'svg' && (!prefix || prefix === 'svg')) return k;
    const deeper = findSvg(k);
    if (deeper) return deeper;
  }
  return null;
}

/** A drawing made safe, with its size in pixels; null when nothing safe to draw is left of it. */
export function cleanDrawing(text: string): { svg: string; w: number; h: number } | null {
  if (typeof text !== 'string' || !text || text.length > MAX_TEXT) return null;
  let tree: Elem;
  try {
    tree = parse(text);
  } catch (e) {
    if (e instanceof Refused) return null;
    throw e;
  }
  const svg = findSvg(tree);
  if (!svg) return null;
  const ids = new Set<string>();
  const styles: string[] = [];
  gather({ tag: '', attrs: [], kids: [svg] }, ids, styles);
  const ctx: Ctx = { sheet: sheet(rules(styles.join('\n'))), ids };
  const root = clean(svg, ctx, new Set())[0] as Clean | undefined;
  if (!root) return null;
  const byId = new Map<string, Clean>();
  index(root, byId);
  if (!cutLoops(root, byId) || drawn(root, byId) > MAX_DRAWN) dropUses(root);
  if (!hasDrawing(root)) return null;
  const { w, h } = sized(root);
  const xlink = linked(root);
  root.attrs = [['xmlns', 'http://www.w3.org/2000/svg'], ...(xlink ? ([['xmlns:xlink', 'http://www.w3.org/1999/xlink']] as [string, string][]) : []), ...root.attrs];
  // The prefix comes from the drawing itself, written without it: the same drawing always gets the same ids.
  const plain: string[] = [];
  write(root, '', plain);
  const prefix = `h${crypto.createHash('sha256').update(plain.join('')).digest('hex').slice(0, 6)}-`;
  const out: string[] = [];
  write(root, prefix, out);
  return { svg: out.join(''), w, h };
}

/** A drawing's SVG made safe to keep and show, or null when nothing safe to draw is left of it. */
export const cleanSvg = (text: string): string | null => cleanDrawing(text)?.svg ?? null;

/** The SVG in a model's answer: from its first <svg to its last </svg>, past any words or Markdown around it. */
export function svgIn(answer: string): string | null {
  const start = answer.search(/<svg[\s>]/i);
  if (start < 0) return null;
  const end = answer.toLowerCase().lastIndexOf('</svg>');
  return end > start ? answer.slice(start, end + 6) : null;
}
