// What of a page of HTML is code (what runs or navigates by itself) and which web addresses it fetches, so a page
// changed through someone's link (server/spaces/portal.ts) is held to its words, pictures and layout: its scripts,
// event handlers (onclick=…), javascript: addresses, frames and embedded objects, a refresh or a base address, and
// forms' targets must stay exactly as they were; and no new web address may be fetched (pictures, styles, fonts, media)
// except Google's fonts, which designs load by address. The page is read by parse5, as a browser builds it (SVG and
// MathML, elements that break out of them, the insides of a template), so what a browser would run is what is counted;
// a page saved by the editors (a browser's own serializing) reads the same as before when only its words and look changed.
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';

/** Hosts a page may load from without that being new: Google's fonts (designs and decks link them). */
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

/** Elements that run, embed or navigate by themselves: counted whole. */
const EMBEDS = new Set(['iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal', 'base', 'fencedframe']);
/** Attributes that hold an address a browser may follow or run. */
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'poster', 'background', 'ping', 'codebase', 'cite', 'to', 'from', 'values', 'by']);
/** Attributes whose address a browser fetches as the page shows (a link's waits for a click). */
const FETCHED = new Set(['src', 'poster', 'data', 'background', 'codebase']);
/** Elements whose href is fetched as the page shows. */
const HREF_FETCHED = new Set(['link', 'image', 'use', 'feimage', 'script']);

const isElement = (n: T.Node): n is T.Element => 'tagName' in n;

/** Every element of the page, a template's insides too, in order. */
function* elements(root: T.ParentNode): Generator<T.Element> {
  const stack: T.Node[] = [...root.childNodes].reverse();
  while (stack.length) {
    const n = stack.pop()!;
    if (!isElement(n)) continue;
    yield n;
    const kids = [...n.childNodes];
    const content = (n as T.Template).content;
    if (content) kids.push(...content.childNodes);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
}

/** An element's text, as a script or a style holds it. */
function textOf(e: T.Element): string {
  let s = '';
  for (const n of e.childNodes) {
    if ('value' in n && n.nodeName === '#text') s += n.value;
    else if (isElement(n)) s += textOf(n);
  }
  return s;
}

/** An attribute's name as written (its prefix too: xlink:href), in lower case. */
const nameOf = (a: T.Element['attrs'][number]) => (a.prefix ? `${a.prefix}:${a.name}` : a.name).toLowerCase();

const tagText = (e: T.Element) =>
  `<${e.tagName} ${e.attrs
    .map((a) => [nameOf(a), a.value] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ')}>`;

/** An address as a browser reads it: spaces, tabs and line breaks (and control characters) inside it ignored. */
const squeeze = (url: string) => url.replace(/[\u0000- \u007f]+/g, '');

/** An address's scheme, in lower case ('' for none). */
const schemeOf = (url: string) => /^([a-z][a-z0-9+.-]*):/i.exec(squeeze(url))?.[1]?.toLowerCase() ?? '';

/**
 * The page's code, each part as one line, sorted: its scripts (with their attributes and words), event handlers (name
 * and code), javascript: and vbscript: addresses (and data: pages to go to), elements that embed or navigate, a
 * refresh, forms' targets and animations that change an address. `trustedKit`: a design's own fitting script
 * (#n-design-fit), which the server puts back in every design saved through a link, is not counted.
 */
export function codeOf(html: string, o: { trustedKit?: boolean } = {}): string[] {
  const out: string[] = [];
  for (const e of elements(parse(html))) {
    const name = e.tagName.toLowerCase();
    if (name === 'script') {
      if (o.trustedKit && e.attrs.some((a) => a.name === 'id' && a.value === 'n-design-fit')) continue;
      out.push(`script ${tagText(e)}${textOf(e)}`);
      continue;
    }
    const animates = (name === 'set' || name.startsWith('animate')) && e.attrs.some((a) => a.name.toLowerCase() === 'attributename' && /href/i.test(a.value));
    if (EMBEDS.has(name) || animates || (name === 'meta' && e.attrs.some((a) => a.name === 'http-equiv')) || (name === 'form' && e.attrs.some((a) => a.name === 'action'))) {
      out.push(`tag ${tagText(e)}`);
      continue;
    }
    for (const a of e.attrs) {
      const k = nameOf(a);
      if (a.name.toLowerCase().startsWith('on')) out.push(`on ${k}=${a.value}`);
      else if (URL_ATTRS.has(a.name.toLowerCase()) || k === 'xlink:href') {
        const s = schemeOf(a.value);
        const page = s === 'data' && /^data:(text\/html|application\/xhtml|image\/svg)/i.test(squeeze(a.value)) && !FETCHED.has(a.name.toLowerCase());
        if (s === 'javascript' || s === 'vbscript' || page || /javascript:/i.test(squeeze(a.value))) out.push(`url ${k}=${a.value}`);
      }
    }
  }
  return out.sort();
}

/** Whether two pages' code (codeOf) is the same. */
export const sameCode = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Addresses in CSS: url(…) and @import "…". */
function cssAddresses(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) out.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  for (const m of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) out.push((m[1] ?? m[2] ?? '').trim());
  return out;
}

/**
 * The web addresses the page has a browser fetch as it shows (pictures, videos and sounds, styles, fonts, scripts,
 * frames), each absolute (http, https, or // another site), in lower case. Google's fonts are left out. A link
 * (<a href>) is not fetched until it is followed, so it is not one.
 */
export function webAddressesOf(html: string): string[] {
  const urls: string[] = [];
  for (const e of elements(parse(html))) {
    const name = e.tagName.toLowerCase();
    for (const a of e.attrs) {
      const k = a.name.toLowerCase();
      if (FETCHED.has(k)) urls.push(a.value);
      else if (k === 'srcset' || k === 'imagesrcset') for (const c of a.value.split(',')) urls.push(c.trim().split(/\s+/)[0] ?? '');
      else if (k === 'href' && HREF_FETCHED.has(name)) urls.push(a.value);
      else if (k === 'style') urls.push(...cssAddresses(a.value));
      else if (k === 'content' && name === 'meta') {
        const u = /url\s*=\s*(.+)$/i.exec(a.value)?.[1];
        if (u) urls.push(u.trim().replace(/^['"]|['"]$/g, ''));
      }
    }
    if (name === 'style') urls.push(...cssAddresses(textOf(e)));
  }
  const out = new Set<string>();
  for (const raw of urls) {
    const u = squeeze(raw).replace(/\\/g, '/');
    const m = /^(?:(https?):)?\/\/([^/?#]+)/i.exec(u);
    if (!m) continue;
    const host = m[2].toLowerCase().replace(/^[^@]*@/, '').replace(/:\d+$/, '');
    if (FONT_HOSTS.has(host)) continue;
    out.add(u.toLowerCase());
  }
  return [...out].sort();
}
