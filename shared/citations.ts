// The sources an agent cites in a reply, as the pages show them. Agents are asked (server/search/tools.ts) to put a
// number in brackets after what a page backs ("[1]", "[1][3]") and to end the reply with a "Sources:" list of just
// those pages ("1. [Title](address)"); Claude Code's own web search asks for that list too. Read as it is written, the
// list renumbers itself (Markdown counts 1, 2, 3 whatever the numbers say), so a "[10]" points at the wrong line. Here
// the list is taken out of the text and kept by the numbers the agent wrote, so each [n] can show as a link to its
// own page, and the list as cards under the reply. Text the agent did not write that way is left as it is.
import { plainCodexCitations } from './file-citations.ts';

export interface Cited {
  /** The number the reply cites it by. */
  n: number;
  title: string;
  url: string;
}

export interface CitedReply {
  /** The reply without its list of sources. */
  body: string;
  /** The sources, in the order the list gives them (then those only cited inline, as numbered links). */
  sources: Cited[];
}

/** A line that heads a list of sources: "Sources:", "**Sources**", "## References"… */
const HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:sources|references|citations|sources used|sources consulted)\s*(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*$/i;
/** "Sources: [IGN](…), [Polygon](…)" on one line. */
const INLINE_HEADING = /^\s*(?:\*\*|__)?\s*(?:sources|references|citations)\s*(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(?=\S)(.*\S)\s*$/i;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*(```|~~~)/;
/** A list item's mark: "1." "1)" "-" "*" "•" "[1]". */
const ITEM = /^\s*(?:(\d{1,3})[.)]|[-*+•]|\[(\d{1,3})\])\s+/;
/** A reference definition: "[1]: https://… "Title"". */
const DEFINITION = /^\s*\[(\d{1,3})\]:\s*<?(https?:\/\/[^\s>]+)>?(?:\s+["'(](.+?)["')])?\s*$/;
const MD_LINK = /\[((?:[^[\]]|\[[^\]]*\])+)\]\((https?:\/\/[^\s)]+(?:\([^\s)]*\)[^\s)]*)*)(?:\s+"[^"]*")?\)/;
const BARE = /<?(https?:\/\/[^\s<>]+[^\s<>.,;:!?'")\]])>?/;

/** "ign.com" from an address. */
export function siteOfUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Parts of a host that are not the site's own name. */
const SUFFIX = /\.(?:com|org|net|io|co|gov|edu|info|biz|app|dev|ai|me|tv|news|blog)(?:\.[a-z]{2})?$|\.(?:co|com|org|gov|ac|net)\.[a-z]{2}$|\.[a-z]{2}$/;

/** A site as a chip names it: its own name, without www, a language or the ending ("en.wikipedia.org" → wikipedia). */
export function shortSite(url: string): string {
  const host = siteOfUrl(url).toLowerCase();
  const bare = host.replace(/^(?:m|mobile|amp|en|www2?)\./, '');
  const name = bare.replace(SUFFIX, '');
  const last = name.split('.').pop() || name;
  return last.length >= 2 ? last : bare;
}

/** One line of a list of sources, read: its number when it gives one, its title and its address; null when it is not one. */
function entryOf(line: string): { n?: number; title: string; url: string } | null {
  const def = DEFINITION.exec(line);
  if (def) return { n: Number(def[1]), url: def[2], title: def[3]?.trim() || '' };
  const item = ITEM.exec(line);
  const rest = item ? line.slice(item[0].length) : line.trim();
  const n = item ? Number(item[1] ?? item[2]) || undefined : undefined;
  const link = MD_LINK.exec(rest);
  if (link) {
    // "[1] [Title](…)", "[Title](…) — what it says": the link's words, else what comes before it.
    const words = link[1].replace(/^\s*\[?\d{1,3}\]?\s*$/, '').trim();
    const before = rest
      .slice(0, link.index)
      .replace(/[\s:–—-]+$/, '')
      .replace(/^\s*\[(\d{1,3})\]\s*/, '')
      .trim();
    return { n: n ?? (Number(/^\s*\[(\d{1,3})\]/.exec(rest)?.[1]) || undefined), url: link[2], title: plainTitle(words || before) };
  }
  const bare = BARE.exec(rest);
  if (!bare) return null;
  const before = rest
    .slice(0, bare.index)
    .replace(/[\s:–—|-]+$/, '')
    .replace(/^\s*\[(\d{1,3})\]\s*/, '')
    .trim();
  return { n: n ?? (Number(/^\s*\[(\d{1,3})\]/.exec(rest)?.[1]) || undefined), url: bare[1], title: plainTitle(before) };
}

/** A title without Markdown's marks. */
const plainTitle = (s: string) =>
  s
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

/** Several sources on one line: "[IGN](…), [Polygon](…)". */
function entriesInLine(text: string): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  const re = new RegExp(MD_LINK.source, 'g');
  for (const m of text.matchAll(re)) out.push({ title: plainTitle(m[1]), url: m[2] });
  if (!out.length) for (const m of text.matchAll(new RegExp(BARE.source, 'g'))) out.push({ title: '', url: m[1] });
  return out;
}

/** Numbered links in the text itself ("[3](https://…)", "[[3]](https://…)"), outside code. */
function numberedLinks(body: string): Cited[] {
  const out: Cited[] = [];
  let fenced = false;
  for (const line of body.split('\n')) {
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced) continue;
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\[\[?(\d{1,3})\]?\]\((https?:\/\/[^\s)]+)\)/g)) out.push({ n: Number(m[1]), url: m[2], title: '' });
  }
  return out;
}

/**
 * A reply's sources, and the reply without its list of them. The list is the last "Sources:" heading (outside code)
 * followed by nothing but sources (an indented line under one, saying what it is, belongs to it); what follows the
 * list (a last question) stays in the reply. While the reply is still coming (`streaming`), a last line that is only
 * the start of a source is held back.
 */
export function citedReply(text: string, o: { streaming?: boolean } = {}): CitedReply {
  const lines = text.split('\n');
  let fenced = false;
  let head = -1;
  let inline: string | null = null;
  lines.forEach((l, i) => {
    if (FENCE.test(l)) fenced = !fenced;
    if (fenced) return;
    if (HEADING.test(l)) {
      head = i;
      inline = null;
    } else {
      const m = INLINE_HEADING.exec(l);
      if (m && (MD_LINK.test(m[1]) || BARE.test(m[1]))) {
        head = i;
        inline = m[1];
      }
    }
  });
  const sources: Cited[] = [];
  const add = (e: { n?: number; title: string; url: string }) => {
    if (sources.some((s) => s.url === e.url && (e.n === undefined || s.n === e.n))) return;
    const n = e.n !== undefined && !sources.some((s) => s.n === e.n) ? e.n : Math.max(0, ...sources.map((s) => s.n)) + 1;
    sources.push({ n, title: e.title, url: e.url });
  };
  let body = text;
  if (head >= 0) {
    let end = head + 1;
    let taken = 0;
    if (inline) for (const e of entriesInLine(inline)) (add(e), taken++);
    for (; end < lines.length; end++) {
      const l = lines[end];
      if (!l.trim()) continue;
      const e = entryOf(l);
      if (e) {
        add(e);
        taken++;
        continue;
      }
      // What a source is, indented under it.
      if (taken && /^\s{2,}\S/.test(l)) continue;
      // The start of a source still coming.
      if (o.streaming && end === lines.length - 1 && /^\s*(?:\d{1,3}[.)]?|[-*+•]|\[)/.test(l)) {
        end = lines.length;
        break;
      }
      break;
    }
    if (taken || (o.streaming && end >= lines.length)) {
      // A rule just above the heading goes with it.
      let from = head;
      while (from > 0 && (!lines[from - 1].trim() || RULE.test(lines[from - 1]))) from--;
      const after = lines.slice(end).join('\n').trim();
      body = [lines.slice(0, from).join('\n').trimEnd(), after].filter(Boolean).join('\n\n');
    } else sources.length = 0;
  }
  // Sources given as reference definitions ("[1]: https://…"), anywhere outside code: out of the text, so its [1] cites them.
  if (/^\s*\[\d{1,3}\]:\s/m.test(body)) {
    let inCode = false;
    const kept: string[] = [];
    for (const l of body.split('\n')) {
      if (FENCE.test(l)) inCode = !inCode;
      const d = inCode ? null : DEFINITION.exec(l);
      if (d) add({ n: Number(d[1]), url: d[2], title: plainTitle(d[3] ?? '') });
      else kept.push(l);
    }
    body = kept.join('\n').trimEnd();
  }
  // Sources cited only as numbered links in the text.
  for (const l of numberedLinks(body)) if (!sources.some((s) => s.n === l.n)) add(l);
  return { body, sources };
}

/** A reply as it is read aloud: without its list of sources, nor the numbers that cite them; files it cites by their names. */
export function spokenReply(reply: string): string {
  const text = plainCodexCitations(reply);
  const { body, sources } = citedReply(text);
  if (!sources.length) return text;
  return body
    .replace(/\[\[?(\d{1,3})\]?\]\(https?:\/\/[^\s)]+\)/g, '')
    .replace(/\s?(?:\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\])+/g, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1');
}

/** Where a run of citing numbers is in a piece of text: "[1][12]", "[1], [12]", "[1, 12]", "[3–5]". */
export const CITE_RUN = /\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\](?:(?:\s*,\s*|\s?)\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\])*(?![(:[])/g;

/** The numbers a run of them cites, in order, once each: "[3–5][7]" → 3, 4, 5, 7. */
export function citeNumbers(run: string): number[] {
  const out: number[] = [];
  for (const m of run.matchAll(/\[([^\]]*)\]/g))
    for (const part of m[1].split(',')) {
      const r = /^\s*(\d{1,3})\s*(?:[–-]\s*(\d{1,3}))?\s*$/.exec(part);
      if (!r) continue;
      const a = Number(r[1]);
      const b = r[2] ? Number(r[2]) : a;
      for (let k = a; k <= Math.min(b, a + 20); k++) if (!out.includes(k)) out.push(k);
    }
  return out;
}
