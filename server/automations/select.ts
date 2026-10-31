// Part of a page by a simple CSS selector, without a browser: tag, #id, .class, [attr] and
// [attr=value], combined (div.price) and nested (main .price, ul > li), several with commas. Enough
// to keep a watcher to the part of a page that matters.
import { HttpError } from '../auth.ts';
import { htmlText } from '../web/fetch.ts';

interface El {
  tag: string;
  attrs: Record<string, string>;
  /** Where its content starts and ends in the page. */
  start: number;
  end: number;
  parent: El | null;
}

interface Compound {
  tag?: string;
  id?: string;
  classes: string[];
  attrs: { name: string; value?: string }[];
}

/** One selector: compounds left to right; `child[i]` when compound i must be a direct child of i-1. */
interface Chain {
  parts: Compound[];
  child: boolean[];
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** Their content is text, not tags. */
const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript']);

function attrsOf(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

/** The page's elements, each with where its content is; unclosed ones end where their parent does. */
export function elements(html: string): El[] {
  const out: El[] = [];
  const stack: El[] = [];
  const lower = html.toLowerCase();
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      let i = stack.length - 1;
      while (i >= 0 && stack[i].tag !== tag) i--;
      if (i < 0) continue;
      while (stack.length > i) stack.pop()!.end = m.index;
      continue;
    }
    const el: El = { tag, attrs: attrsOf(m[3]), start: m.index + m[0].length, end: html.length, parent: stack[stack.length - 1] ?? null };
    out.push(el);
    if (VOID.has(tag) || m[4]) {
      el.end = el.start;
    } else if (RAW.has(tag)) {
      const close = lower.indexOf(`</${tag}`, re.lastIndex);
      el.end = close < 0 ? html.length : close;
      re.lastIndex = el.end;
    } else stack.push(el);
  }
  return out;
}

const SIMPLE = 'Use a simple selector: a tag, #id, .class or [attribute=value], combined (div.price) or nested (main .price)';

function compound(src: string): Compound {
  const c: Compound = { classes: [], attrs: [] };
  const re = /^([a-zA-Z][\w-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:[~|^$*]?=(?:"[^"]*"|'[^']*'|[^\]]*))?\])*)$/;
  const m = re.exec(src);
  if (!m || (!m[1] && !m[2])) throw new HttpError(400, `${SIMPLE}; “${src}” is not one`);
  if (m[1] && m[1] !== '*') c.tag = m[1].toLowerCase();
  for (const p of m[2].matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g)) {
    if (p[1]) c.id = p[1];
    else if (p[2]) c.classes.push(p[2]);
    else c.attrs.push({ name: p[3].toLowerCase(), value: p[4] ?? p[5] ?? p[6] });
  }
  return c;
}

/** Reads a selector list; throws an HttpError for what it cannot do. */
export function parseSelector(sel: string): Chain[] {
  if (!sel.trim()) throw new HttpError(400, SIMPLE);
  return sel.split(',').map((one) => {
    const tokens = one.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/).filter(Boolean);
    const chain: Chain = { parts: [], child: [] };
    let child = false;
    for (const t of tokens) {
      if (t === '>') {
        if (!chain.parts.length || child) throw new HttpError(400, SIMPLE);
        child = true;
        continue;
      }
      chain.parts.push(compound(t));
      chain.child.push(child);
      child = false;
    }
    if (!chain.parts.length || child) throw new HttpError(400, SIMPLE);
    return chain;
  });
}

function fits(el: El, c: Compound): boolean {
  if (c.tag && el.tag !== c.tag) return false;
  if (c.id && el.attrs.id !== c.id) return false;
  if (c.classes.length) {
    const have = new Set((el.attrs.class ?? '').split(/\s+/));
    if (!c.classes.every((x) => have.has(x))) return false;
  }
  return c.attrs.every((a) => a.name in el.attrs && (a.value === undefined || el.attrs[a.name] === a.value));
}

function matches(el: El | null, chain: Chain, i: number): boolean {
  if (!el || !fits(el, chain.parts[i])) return false;
  if (i === 0) return true;
  if (chain.child[i]) return matches(el.parent, chain, i - 1);
  for (let up = el.parent; up; up = up.parent) if (matches(up, chain, i - 1)) return true;
  return false;
}

/** The readable text of the parts of `html` the selector picks, in page order; empty when none. */
export function selectText(html: string, selector: string): string {
  const chains = parseSelector(selector);
  const picked = elements(html).filter((el) => chains.some((c) => matches(el, c, c.parts.length - 1)));
  // An element inside one already picked is in its text already.
  const top = picked.filter((el) => !picked.some((o) => o !== el && o.start <= el.start && el.end <= o.end && (o.start < el.start || o.end > el.end)));
  return top
    .map((el) => htmlText(html.slice(el.start, el.end)))
    .filter(Boolean)
    .join('\n');
}
