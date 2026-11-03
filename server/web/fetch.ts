// Reading a web page for an agent, safely: only public http(s) addresses (never this machine, its
// network or a cloud's metadata service, checked again at every redirect), bounded in time and size, and
// HTML turned into Markdown that keeps headings, links, lists, tables and code, taken from the page's
// main content without its menus, footers and other boilerplate. Imports nothing from the server, so
// Custom's own process can use it too.
import dns from 'node:dns/promises';
import net from 'node:net';

export interface FetchedPage {
  /** Where it landed after redirects. */
  url: string;
  status: number;
  contentType: string;
  title?: string;
  /** What the page says about itself (its meta description). */
  description?: string;
  /** Readable text: Markdown for HTML, other text types as they are (JSON indented). */
  text: string;
  /** The raw body, for types the caller reads itself (a PDF, an image, an Office file). */
  body?: Buffer;
  /** The body was longer than the limit and was cut there. */
  truncated?: boolean;
}

export class BlockedAddress extends Error {}

/** Loopback, private, link-local, carrier-grade NAT, multicast and reserved ranges, IPv4 and IPv6. */
export function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  // IPv4 inside IPv6: mapped (::ffff:127.0.0.1, which a parsed address writes as ::ffff:7f00:1),
  // IPv4-compatible (::7f00:1) and NAT64 (64:ff9b::/96) are all refused.
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (hex) return privateIp([parseInt(hex[1], 16) >> 8, parseInt(hex[1], 16) & 255, parseInt(hex[2], 16) >> 8, parseInt(hex[2], 16) & 255].join('.'));
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || /^::[0-9a-f.]/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}

/** Throws BlockedAddress unless every address the host resolves to is public. */
export async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedAddress('Only http and https addresses');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) throw new BlockedAddress(`${host} is on this machine or its network`);
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw new BlockedAddress(`${host} does not resolve`);
  if (ips.some(privateIp)) throw new BlockedAddress(`${host} is on this machine or its network`);
}

// ---- entities ------------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', deg: '°', middot: '·', bull: '•', times: '×', divide: '÷', euro: '€', pound: '£', yen: '¥',
  cent: '¢', sect: '§', para: '¶', plusmn: '±', frac12: '½', frac14: '¼', frac34: '¾', shy: '', zwj: '', zwnj: '', thinsp: ' ', ensp: ' ', emsp: ' ',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', hearts: '♥', check: '✓', minus: '−', le: '≤', ge: '≥', ne: '≠', infin: '∞', micro: 'µ',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', pi: 'π', sigma: 'σ', mu: 'μ', lambda: 'λ', omega: 'ω', iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª',
  sup2: '²', sup3: '³', acute: '´', cedil: '¸', uml: '¨', szlig: 'ß', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', eacute: 'é',
  egrave: 'è', ecirc: 'ê', aacute: 'á', agrave: 'à', acirc: 'â', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ccedil: 'ç', Eacute: 'É', oslash: 'ø', aring: 'å',
};

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});?/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

// ---- HTML into a tree ----------------------------------------------------------------------------

interface El {
  tag: string;
  attrs: Record<string, string>;
  kids: Node[];
  parent?: El;
}
type Node = El | string;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen']);
/** Elements whose content is not HTML. */
const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template', 'xmp', 'iframe', 'noembed', 'noframes']);
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul', 'li', 'dd', 'dt', 'tr', 'center', 'summary', 'caption',
]);

function attrsOf(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** A forgiving HTML parser: unclosed paragraphs, list items and cells close themselves as browsers do. */
function parseHtml(html: string): El {
  const root: El = { tag: '#root', attrs: {}, kids: [] };
  let cur = root;
  const up = (tags: string[], stops: string[]) => {
    for (let e: El | undefined = cur; e && e !== root; e = e.parent) {
      if (tags.includes(e.tag)) {
        cur = e.parent ?? root;
        return;
      }
      if (stops.includes(e.tag)) return;
    }
  };
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      cur.kids.push(html.slice(i));
      break;
    }
    if (lt > i) cur.kids.push(html.slice(i, lt));
    i = lt;
    if (html.startsWith('<!--', i)) {
      const e = html.indexOf('-->', i + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (html.startsWith('<![CDATA[', i)) {
      const e = html.indexOf(']]>', i);
      cur.kids.push(html.slice(i + 9, e < 0 ? n : e));
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (html[i + 1] === '!' || html[i + 1] === '?') {
      const e = html.indexOf('>', i);
      i = e < 0 ? n : e + 1;
      continue;
    }
    const m = /^<(\/?)([a-zA-Z][\w:-]*)/.exec(html.slice(i, i + 80));
    if (!m) {
      cur.kids.push('<');
      i++;
      continue;
    }
    let j = i + m[0].length;
    for (let q = ''; j < n; j++) {
      const c = html[j];
      if (q) {
        if (c === q) q = '';
      } else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
    }
    const inner = html.slice(i + m[0].length, j);
    i = j + 1;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let e: El | undefined = cur; e && e !== root; e = e.parent)
        if (e.tag === tag) {
          cur = e.parent ?? root;
          break;
        }
      continue;
    }
    if (BLOCK.has(tag)) up(['p'], ['table', 'li', 'td', 'th', 'blockquote', 'div', 'section', 'article', 'main']);
    if (tag === 'li') up(['li'], ['ul', 'ol', 'menu']);
    if (tag === 'dt' || tag === 'dd') up(['dt', 'dd'], ['dl']);
    if (tag === 'tr') up(['tr', 'td', 'th'], ['table', 'thead', 'tbody', 'tfoot']);
    if (tag === 'td' || tag === 'th') up(['td', 'th'], ['tr', 'table']);
    if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') up(['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], ['table']);
    if (tag === 'option') up(['option'], ['select']);
    const el: El = { tag, attrs: attrsOf(inner), kids: [], parent: cur };
    cur.kids.push(el);
    if (VOID.has(tag) || (inner.trimEnd().endsWith('/') && !RAW.has(tag))) continue;
    // Broken pages can nest without end: past a depth, elements stay where they are (reading them recurses).
    let depth = 0;
    for (let e: El | undefined = cur; e && depth <= 300; e = e.parent) depth++;
    if (depth > 300 && !RAW.has(tag)) continue;
    if (RAW.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, 'ig');
      close.lastIndex = i;
      const c = close.exec(html);
      const content = html.slice(i, c ? c.index : n);
      i = c ? c.index + c[0].length : n;
      if (tag === 'title' || tag === 'textarea' || tag === 'xmp') el.kids.push(content);
      continue;
    }
    cur = el;
  }
  return root;
}

const isEl = (n: Node): n is El => typeof n !== 'string';

function find(e: El, test: (e: El) => boolean, out: El[] = []): El[] {
  for (const k of e.kids)
    if (isEl(k)) {
      if (test(k)) out.push(k);
      find(k, test, out);
    }
  return out;
}

function textOf(n: Node): string {
  return typeof n === 'string' ? decodeEntities(n) : n.kids.map(textOf).join(n.tag === 'br' ? '\n' : '');
}

const lengths = new WeakMap<El, number>();
function textLen(e: El): number {
  let n = lengths.get(e);
  if (n === undefined) {
    n = 0;
    for (const k of e.kids) n += typeof k === 'string' ? k.replace(/\s+/g, ' ').trim().length : textLen(k);
    lengths.set(e, n);
  }
  return n;
}
const links = new WeakMap<El, number>();
function linkLen(e: El): number {
  let n = links.get(e);
  if (n === undefined) links.set(e, (n = find(e, (x) => x.tag === 'a').reduce((s, a) => s + textLen(a), 0)));
  return n;
}

// ---- the main content ----------------------------------------------------------------------------

const JUNK_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'object', 'embed', 'head', 'nav', 'footer', 'aside', 'button', 'select', 'input', 'textarea', 'dialog', 'link', 'meta', 'map', 'audio', 'video', 'picture', 'source']);
const JUNK_ROLES = /^(navigation|banner|contentinfo|complementary|search|dialog|alertdialog|menu|menubar|toolbar|tablist)$/;
const JUNK_NAMES =
  /(^|[\s_-])(nav|navbar|navigation|menu|menubar|footer|sidebar|side-bar|cookies?|consent|gdpr|banner|advert|advertisement|ads?|adsbygoogle|promo|sponsor(ed)?|share|sharing|social|related|recommended|newsletter|subscribe|subscription|breadcrumbs?|popup|modal|overlay|skip-link|toolbar|masthead|comments?|disqus|signup|paywall|outbrain|taboola|widget|ambox|navbox|catlinks|printfooter|mw-editsection|mw-jump-link|noprint|sistersitebox|headerlink)([\s_-]|$)/i;

/** Takes out what is not content: scripts, menus, footers, sidebars, hidden parts, ads. */
function strip(e: El, total: number, inArticle = false) {
  e.kids = e.kids.filter((k) => {
    if (!isEl(k)) return true;
    const a = k.attrs;
    if (JUNK_TAGS.has(k.tag)) return k.tag === 'picture' && find(k, (x) => x.tag === 'img').length > 0 && inArticle;
    if (k.tag === 'header' && !inArticle) return false;
    if ('hidden' in a || a['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.style ?? '')) return false;
    if (JUNK_ROLES.test(a.role ?? '')) return false;
    // A wrapper with an unlucky class ("has-sidebar") that holds most of the page stays.
    if (JUNK_NAMES.test(`${a.class ?? ''} ${a.id ?? ''}`) && textLen(k) < total * 0.4) return false;
    strip(k, total, inArticle || k.tag === 'article' || k.tag === 'main' || a.role === 'main');
    return true;
  });
  lengths.delete(e);
}

/** The element holding the page's main text: <main> or one <article> when they hold most of it, else the best-scored block. */
function mainOf(body: El): El {
  const total = textLen(body);
  if (total < 200) return body;
  const big = (list: El[]) => list.filter((e) => textLen(e) > total * 0.3);
  const mains = big(find(body, (e) => e.tag === 'main' || e.attrs.role === 'main'));
  if (mains.length === 1) return mains[0];
  const articles = big(find(body, (e) => e.tag === 'article')).filter((a, _, all) => !all.some((b) => b !== a && find(b, (x) => x === a).length));
  if (articles.length === 1) return articles[0];
  // Score paragraphs' parents, as reading modes do: long text with commas counts, links count against.
  const score = new Map<El, number>();
  for (const p of find(body, (e) => ['p', 'pre', 'td', 'blockquote', 'li', 'dd'].includes(e.tag))) {
    const t = textLen(p);
    if (t < 25 || !p.parent) continue;
    const s = 1 + (textOf(p).match(/[,，、]/g)?.length ?? 0) + Math.min(3, Math.floor(t / 100));
    score.set(p.parent, (score.get(p.parent) ?? 0) + s);
    if (p.parent.parent) score.set(p.parent.parent, (score.get(p.parent.parent) ?? 0) + s / 2);
  }
  let best: El | null = null;
  let top = 0;
  for (const [e, s] of score) {
    const len = textLen(e) || 1;
    const adjusted = s * (1 - Math.min(1, linkLen(e) / len));
    if (adjusted > top) [best, top] = [e, adjusted];
  }
  if (!best || textLen(best) < total * 0.25) return body;
  // Its siblings often hold the rest of the text (a lead paragraph, a second column).
  const parent = best.parent;
  if (parent && parent !== body) {
    const near = parent.kids.filter((k): k is El => isEl(k) && k !== best && (score.get(k) ?? 0) >= top * 0.3);
    if (near.length) return parent;
  }
  return best;
}

// ---- Markdown ------------------------------------------------------------------------------------

/** Stands for one space of a list's indentation until the Markdown is finished. */
const INDENT = '\uE000';

interface Ctx {
  base: URL | null;
  list: number;
  /** Inside a link: pictures there are thumbnails, left out. */
  link?: boolean;
}

/** Elements rendered elsewhere already (a card link's heading). */
const skip = new WeakSet<El>();

function href(u: string | undefined, base: URL | null): string {
  if (!u || /^(javascript|data|mailto:$)/i.test(u.trim())) return '';
  try {
    return base ? new URL(u.trim(), base).toString() : u.trim();
  } catch {
    return u.trim();
  }
}

const inline = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ');

function kids(e: El, c: Ctx): string {
  return e.kids.map((k) => render(k, c)).join('');
}

function render(n: Node, c: Ctx): string {
  if (typeof n === 'string') return decodeEntities(n).replace(/\s+/g, ' ');
  if (skip.has(n)) return '';
  const block = (s: string) => `\n\n${s.trim()}\n\n`;
  const wrap = (mark: string) => {
    const t = kids(n, c);
    return t.trim() ? `${t.match(/^\s*/)![0]}${mark}${t.trim()}${mark}${t.match(/\s*$/)![0]}` : t;
  };
  switch (n.tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const t = inline(kids(n, c)).trim();
      return t ? block(`${'#'.repeat(Number(n.tag[1]))} ${t}`) : '';
    }
    case 'br':
      return '\n';
    case 'hr':
      return block('---');
    case 'a': {
      const url = href(n.attrs.href, c.base);
      // A card: a link around a heading and a few lines, as on news and blog index pages.
      const heading = url && !url.startsWith('#') ? find(n, (e) => /^h[1-6]$/.test(e.tag))[0] : undefined;
      if (heading) {
        const title = inline(kids(heading, c)).trim();
        skip.add(heading);
        const rest = inline(kids(n, { ...c, link: true })).trim();
        if (title) return block(`${'#'.repeat(Number(heading.tag[1]))} [${title}](${url.replace(/\)/g, '%29').replace(/ /g, '%20')})${rest ? `\n\n${rest}` : ''}`);
      }
      const t = inline(kids(n, { ...c, link: true }));
      // Permalink marks beside headings (#, ¶) and empty links say nothing.
      if (!t.trim() || /^[#¶§🔗]$/u.test(t.trim())) return '';
      if (!url || url.startsWith('#') || (c.base && url.startsWith(`${c.base.origin}${c.base.pathname}#`))) return t;
      return `${t.match(/^\s*/)![0]}[${t.trim()}](${url.replace(/\)/g, '%29').replace(/ /g, '%20')})${t.match(/\s*$/)![0]}`;
    }
    case 'img': {
      if (c.link) return '';
      const alt = inline(n.attrs.alt ?? '').trim();
      const src = href(n.attrs.src ?? n.attrs['data-src'], c.base);
      return alt && src ? `![${alt}](${src})` : alt ? alt : '';
    }
    case 'strong':
    case 'b':
      return wrap('**');
    case 'em':
    case 'i':
      return wrap('_');
    case 's':
    case 'del':
    case 'strike':
      return wrap('~~');
    case 'code':
    case 'kbd':
    case 'samp':
    case 'tt': {
      const t = textOf(n).replace(/\s+/g, ' ');
      if (!t.trim()) return '';
      const fence = t.includes('`') ? '``' : '`';
      return `${fence}${t}${fence}`;
    }
    case 'pre': {
      const code = textOf(n).replace(/^\n/, '').replace(/\s+$/, '');
      const lang = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(`${n.attrs.class ?? ''} ${find(n, (x) => x.tag === 'code')[0]?.attrs.class ?? ''}`)?.[1] ?? '';
      return code ? block(`\`\`\`${lang}\n${code}\n\`\`\``) : '';
    }
    case 'blockquote': {
      const t = tidy(kids(n, c));
      return t ? block(t.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')) : '';
    }
    case 'ul':
    case 'ol':
    case 'menu': {
      let k = Number(n.attrs.start) || 1;
      const items = n.kids.filter((x): x is El => isEl(x) && x.tag === 'li');
      const lines = items.map((li) => {
        const mark = n.tag === 'ol' ? `${k++}.` : '-';
        const body = tidy(kids(li, { ...c, list: c.list + 1 })).replace(/\n{2,}/g, '\n');
        // Indented with a placeholder that tidying leaves alone; it becomes spaces at the end.
        return body ? `${mark} ${body.split('\n').join(`\n${INDENT.repeat(mark.length + 1)}`)}` : '';
      });
      const text = lines.filter(Boolean).join('\n');
      return text ? block(text) : '';
    }
    case 'li':
      return block(`- ${tidy(kids(n, c))}`);
    case 'dl':
      return block(
        n.kids
          .filter(isEl)
          .map((x) => (x.tag === 'dt' ? `**${inline(kids(x, c)).trim()}**` : x.tag === 'dd' ? `: ${tidy(kids(x, c))}` : tidy(kids(x, c))))
          .filter((x) => x.trim())
          .join('\n'),
      );
    case 'table':
      return table(n, c);
    case 'figcaption':
    case 'caption': {
      const t = inline(kids(n, c)).trim();
      return t ? block(`_${t}_`) : '';
    }
    case 'summary': {
      const t = inline(kids(n, c)).trim();
      return t ? block(`**${t}**`) : '';
    }
    case 'sup':
      return `^${kids(n, c)}`;
    case 'title':
    case 'head':
      return '';
    default:
      return BLOCK.has(n.tag) ? block(kids(n, c)) : kids(n, c);
  }
}

/** A table as Markdown rows; a layout table (cells holding paragraphs or lists) as its contents. */
function table(t: El, c: Ctx): string {
  const rows = find(t, (e) => e.tag === 'tr').filter((r) => {
    for (let p = r.parent; p && p !== t; p = p.parent) if (p.tag === 'table') return false;
    return true;
  });
  const cells = rows.map((r) => r.kids.filter((x): x is El => isEl(x) && (x.tag === 'td' || x.tag === 'th')));
  // A table used for layout (one column, tables inside, code or headings in cells): its cells as blocks.
  const layout = cells.every((r) => r.length <= 1) || cells.flat().some((cell) => find(cell, (e) => /^(table|pre|h[1-6])$/.test(e.tag)).length > 0);
  if (!rows.length) return `\n\n${kids(t, c)}\n\n`;
  if (layout) return `\n\n${cells.map((r) => r.map((cell) => tidy(kids(cell, c))).filter(Boolean).join('\n\n')).filter(Boolean).join('\n\n')}\n\n`;
  const text = cells.map((r) => r.map((cell) => inline(kids(cell, c)).trim().replace(/\|/g, '\\|')));
  const width = Math.max(...text.map((r) => r.length));
  const line = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill('')].join(' | ')} |`;
  const caption = t.kids.find((k): k is El => isEl(k) && k.tag === 'caption');
  return `\n\n${caption ? `_${inline(kids(caption, c)).trim()}_\n\n` : ''}${[line(text[0]), line(Array(width).fill('---')), ...text.slice(1).map(line)].join('\n')}\n\n`;
}

/** Tidies Markdown: no trailing spaces, at most one blank line, code blocks left as they are. */
function tidy(md: string): string {
  const out: string[] = [];
  let code = false;
  for (const raw of md.split('\n')) {
    if (raw.replace(/^[\s\uE000]+/, '').startsWith('```')) code = !code;
    const l = code ? raw.replace(/\s+$/, '') : raw.replace(/[ \t]+/g, ' ').trim();
    if (!l && !code && (!out.length || !out[out.length - 1])) continue;
    out.push(l);
  }
  return out.join('\n').trim();
}

/** A page's main content as Markdown, with its title and description. */
export function htmlMarkdown(html: string, url?: string): { markdown: string; title?: string; description?: string } {
  const root = parseHtml(html);
  const meta = (name: string) => find(root, (e) => e.tag === 'meta' && (e.attrs.name ?? e.attrs.property ?? '').toLowerCase() === name)[0]?.attrs.content?.trim();
  const title = (find(root, (e) => e.tag === 'title')[0] ? inline(textOf(find(root, (e) => e.tag === 'title')[0])).trim() : '') || meta('og:title') || undefined;
  const description = meta('description') || meta('og:description') || undefined;
  let base: URL | null = null;
  try {
    base = url ? new URL(find(root, (e) => e.tag === 'base')[0]?.attrs.href ?? url, url) : null;
  } catch {}
  const body = find(root, (e) => e.tag === 'body')[0] ?? root;
  strip(body, textLen(body));
  const main = mainOf(body);
  let markdown = tidy(render(main, { base, list: 0 })).replaceAll(INDENT, ' ');
  // A title the content does not open with goes on top.
  const h1 = /^# (.+)$/m.exec(markdown)?.[1];
  if (title && !h1 && !markdown.startsWith(title)) markdown = `# ${title}\n\n${markdown}`;
  return { markdown, title, description };
}

/** A page's readable text: no scripts or styles, block elements on their own lines. */
export function htmlText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head|template)[\s\S]*?<\/\1>/gi, '')
      .replace(/<(br|p|div|li|tr|h[1-6]|section|article|header|footer|blockquote|pre)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

// ---- fetching ------------------------------------------------------------------------------------

/** The character set a body is in: from the header, else from the page's own <meta>, else UTF-8. */
function charsetOf(contentType: string, body: Buffer): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const head = body.subarray(0, 4096).toString('latin1');
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  return (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();
}

function decodeBody(body: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return body.toString('utf8');
  }
}

/** Fetches a public page, following redirects itself (each one checked), and a page that sends you on with <meta refresh>. */
export async function fetchPage(input: string, o: { signal?: AbortSignal; maxBytes?: number; timeoutMs?: number; allowPrivate?: boolean } = {}): Promise<FetchedPage> {
  const max = o.maxBytes ?? 5_000_000;
  const signal = AbortSignal.any([o.signal ?? new AbortController().signal, AbortSignal.timeout(o.timeoutMs ?? 30_000)]);
  let url = new URL(input);
  let refreshed = false;
  for (let hop = 0; ; hop++) {
    if (!o.allowPrivate) await assertPublic(url);
    const r = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Hydor)', accept: 'text/html,application/xhtml+xml,text/plain,application/json,application/pdf,*/*;q=0.8' },
    });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      if (hop >= 8) throw new Error('Too many redirects');
      url = new URL(loc, url);
      continue;
    }
    const contentType = r.headers.get('content-type') ?? '';
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    for await (const c of r.body ?? []) {
      const b = Buffer.from(c as Uint8Array);
      size += b.length;
      if (size > max) {
        chunks.push(b.subarray(0, b.length - (size - max)));
        truncated = true;
        break;
      }
      chunks.push(b);
    }
    const body = Buffer.concat(chunks);
    const sniffed = body.subarray(0, 5).toString('latin1');
    const textual = (/^text\/|html|xml|json|javascript|yaml|csv/i.test(contentType) || !contentType) && sniffed !== '%PDF-';
    const base = { url: url.toString(), status: r.status, contentType, ...(truncated ? { truncated } : {}) };
    if (!textual) return { ...base, text: '', body };
    const raw = decodeBody(body, charsetOf(contentType, body));
    const html = /html/i.test(contentType) || /^\s*<(!doctype html|html|head|body)/i.test(raw);
    if (!html) {
      if (/json/i.test(contentType) && raw.length < 200_000)
        try {
          return { ...base, text: JSON.stringify(JSON.parse(raw), null, 2) };
        } catch {}
      return { ...base, text: raw };
    }
    // A page that only sends you on (<meta http-equiv="refresh" content="0; url=…">): followed once.
    const refresh = /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?\s*\d*\s*;\s*url=([^"'>\s]+)/i.exec(raw.slice(0, 8192));
    if (refresh && !refreshed && raw.length < 20_000 && hop < 8) {
      refreshed = true;
      url = new URL(decodeEntities(refresh[1]), url);
      continue;
    }
    const page = htmlMarkdown(raw, url.toString());
    return { ...base, title: page.title, description: page.description, text: page.markdown };
  }
}
