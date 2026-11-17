// Writing what the helper chose into a wiki: articles with their sources in the frontmatter (the code writes the
// frontmatter, the model only the body), `index.md` and `log.md`. Only paths wiki/**/*.md, index.md and log.md.
import path from 'node:path';
import { applyWikiChanges, readWiki, redirectOf, wikiHash } from '../core.ts';
import { browseWiki } from '../browse.ts';
import { areaOrder, hasAreas, hubPath, isHubPath, loadRegistry, memberPath, placedIn } from '../areas/registry.ts';
import { snapshotArticle, type Removed } from './history.ts';

/** A path as this feature writes one: no segment starting with a dot, under wiki/ and ending .md, or index.md or log.md. */
export function writable(p: string): boolean {
  if (p === 'index.md' || p === 'log.md') return true;
  return /^wiki\/(?:[^/\0\\]+\/)*[^/\0\\]+\.md$/.test(p) && !p.split('/').some((s) => s.startsWith('.') || s === '..');
}

/** Lowercase words with dashes, from a title (letters and digits of any language that fold to ASCII; else a short hash). */
export function slugOf(title: string): string {
  const s = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || `article-${wikiHash(title).slice(0, 8)}`;
}

/** A free path `wiki/<slug>.md`, not among `taken` and not a file already there. */
export function freePath(root: string, title: string, taken: Set<string>): string {
  const base = slugOf(title);
  for (let n = 1; ; n++) {
    const p = `wiki/${base}${n > 1 ? `-${n}` : ''}.md`;
    if (!taken.has(p) && !exists(root, p)) return p;
  }
}

/** The file's text and hash, or null when there is none (or it cannot be read as a wiki file). */
export function readOrNull(root: string, rel: string): { content: string; sha256: string } | null {
  try {
    const r = readWiki(root, rel);
    return { content: r.content, sha256: r.sha256 };
  } catch {
    return null;
  }
}
const exists = (root: string, rel: string) => readOrNull(root, rel) !== null;

// ---- frontmatter ------------------------------------------------------------------------------------------------

export interface Front {
  /** Keys with their lines, in order, as written. */
  keys: { key: string; lines: string[] }[];
  body: string;
}

export function splitFront(text: string): Front {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { keys: [], body: text };
  const keys: Front['keys'] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const k = /^([A-Za-z_][\w-]*)\s*:/.exec(line);
    if (k) keys.push({ key: k[1], lines: [line] });
    else if (keys.length) keys[keys.length - 1].lines.push(line);
  }
  return { keys, body: text.slice(m[0].length).replace(/^\r?\n/, '') };
}

/** The values of a list key (`sources:`), as a block or inline. */
export function listOf(f: Front, key: string): string[] {
  const k = f.keys.find((x) => x.key === key);
  if (!k) return [];
  const inline = /^[^:]+:\s*\[([^\]]*)\]\s*$/.exec(k.lines[0]);
  const raw = inline ? inline[1].split(',') : k.lines.slice(1).map((l) => /^\s*-\s*(.+?)\s*$/.exec(l)?.[1] ?? '');
  return raw.map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

/** A title the wiki browser shows whole: no quotes in it. */
const plainTitle = (t: string) => t.replace(/["'`]/g, '’').replace(/\s+/g, ' ').trim();

export function titleOfArticle(text: string, fallback: string): string {
  const f = splitFront(text);
  const t = f.keys.find((x) => x.key === 'title');
  const fromFront = t && /^[^:]+:\s*["']?(.+?)["']?\s*$/.exec(t.lines[0])?.[1];
  const h1 = /^#\s+(.+?)\s*#*$/m.exec(f.body)?.[1];
  return (fromFront || h1 || fallback).trim();
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The value of a one-line key (`summary:`, `commit:`), without its quotes; undefined when there is none. */
export function frontValue(f: Front, key: string): string | undefined {
  const k = f.keys.find((x) => x.key === key);
  if (!k) return undefined;
  const raw = /^[^:]+:\s*(.*?)\s*$/.exec(k.lines[0])?.[1] ?? '';
  if (raw.startsWith('"')) {
    try {
      return String(JSON.parse(raw)).trim() || undefined;
    } catch {
      /* not JSON: as written */
    }
  }
  return raw.replace(/^['"]|['"]$/g, '').trim() || undefined;
}

/** A line of text cut to `n` characters at a word. */
export function clipLine(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > n * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

/** Longest summary an article's front matter holds. */
export const SUMMARY_MAX = 160;

/** A summary as one plain line: links become their text (the index lists summaries, and a link in one would point from the wrong folder). */
const plainLine = (s: string) => s.replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, '$1').replace(/[<>]/g, '');

/** The first line of a body that is not a heading, as one line. */
export function firstLine(body: string): string {
  return clipLine(plainLine(body.split('\n').find((l) => l.trim() && !/^\s*(?:#|---|<!--)/.test(l)) ?? ''), SUMMARY_MAX);
}

/** An article's summary: its `summary:`, else its first line that is not a heading (at most SUMMARY_MAX characters). */
export function summaryOf(content: string): string {
  const f = splitFront(content);
  return frontValue(f, 'summary') ?? firstLine(f.body);
}

/** A path as the front matter lists it: plain characters only. */
const listable = (p: string) => /^[\w@.+\-/]+$/.test(p) && !p.includes('..');

const KEYS_OWNED = ['title', 'summary', 'areas', 'sources', 'anchors', 'commit', 'stale', 'updated'];

/** An area id as front matter lists it. */
const areaId = (id: string) => /^[a-z0-9][a-z0-9-]{0,47}$/.test(id);

export interface Compose {
  title: string;
  /** A source to add to the article's `sources`. */
  source?: string;
  /** Sources a new part takes over from the article it was split from. */
  carry?: string[];
  now: number;
  /** One line about what the article covers; kept as it was when not given. */
  summary?: string;
  /** The repository paths the article names; kept as they were when not given. */
  anchors?: string[];
  /** The repository's commit the article was written against; kept as it was when not given. */
  commit?: string | null;
  /** The ids of the areas it is in (wiki/areas); kept as they were when not given. */
  areas?: string[];
}

/**
 * An article as written: the old frontmatter kept (its other keys as they were), the title kept (or the one given),
 * the new source added to its `sources`, `summary`, `anchors` and `commit` set (or kept), `updated` set, `stale`
 * dropped (the article was just written), then the body the model wrote.
 */
export function composeArticle(old: string | null, body: string, o: Compose): string {
  const f = old ? splitFront(old) : { keys: [] as Front['keys'], body: '' };
  const sources = [...new Set([...listOf(f, 'sources'), ...(o.carry ?? []), ...(o.source ? [o.source] : [])])];
  const own = f.keys.find((k) => k.key === 'title');
  const titleLine = own ? own.lines[0].replace(/^[^:]+:\s*/, '') : JSON.stringify(plainTitle(old ? titleOfArticle(old, o.title) : o.title));
  const kept = f.keys.filter((k) => !KEYS_OWNED.includes(k.key)).flatMap((k) => k.lines);
  const summary = o.summary != null ? clipLine(plainLine(o.summary), SUMMARY_MAX) : frontValue(f, 'summary');
  const anchors = (o.anchors ?? (old ? listOf(f, 'anchors') : [])).filter(listable);
  const commit = o.commit || frontValue(f, 'commit');
  const areas = [...new Set(o.areas ?? areaList(f))].filter(areaId).slice(0, 2);
  const front = [
    '---',
    `title: ${titleLine}`,
    ...(summary ? [`summary: ${JSON.stringify(summary)}`] : []),
    ...(areas.length ? [`areas: [${areas.join(', ')}]`] : []),
    ...(sources.length ? ['sources:', ...sources.map((s) => `  - ${s}`)] : []),
    ...(anchors.length ? ['anchors:', ...anchors.map((a) => `  - ${a}`)] : []),
    ...(commit ? [`commit: ${commit}`] : []),
    `updated: ${day(o.now)}`,
    ...kept,
    '---',
  ];
  return `${front.join('\n')}\n\n${body.trim()}\n`;
}

/**
 * The article with its `areas:` set to `ids` (none: removed), the body and every other key untouched; an article with
 * no front matter gets one holding only its areas.
 */
export function withAreas(text: string, ids: string[]): string {
  const list = [...new Set(ids)].filter(areaId).slice(0, 2);
  const line = list.length ? [`areas: [${list.join(', ')}]`] : [];
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return list.length ? `---\n${line.join('\n')}\n---\n\n${text.replace(/^\s+/, '')}` : text;
  const f = splitFront(text);
  const at = f.keys.findIndex((k) => k.key === 'areas');
  const keys = f.keys.map((k) => k.lines);
  if (at >= 0) keys.splice(at, 1, line);
  else {
    // After the summary (or the title), where the code writes it.
    const after = Math.max(f.keys.findIndex((k) => k.key === 'summary'), f.keys.findIndex((k) => k.key === 'title'));
    keys.splice(after + 1, 0, line);
  }
  return `---\n${keys.flat().join('\n')}\n---\n${text.slice(m[0].length)}`;
}

/** The ids a front matter lists under `areas:`: a list (`[a, b]` or one a line), or one id or several with commas. */
function areaList(f: Front): string[] {
  const listed = listOf(f, 'areas');
  if (listed.length) return listed;
  return (frontValue(f, 'areas') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}

/** The ids an article's front matter lists under `areas:`. */
export const areasOfArticle = (text: string): string[] => areaList(splitFront(text));

/** The `## ` and `### ` headings of a body, as plain text. */
export function headingsOf(body: string, max = 12): string[] {
  return [...body.matchAll(/^#{2,3}\s+(.+?)\s*#*\s*$/gm)].map((m) => m[1].replace(/[*_`]/g, '').trim()).filter(Boolean).slice(0, max);
}

/** The article with its `stale:` set to `paths` (none: removed), the body and every other key untouched. */
export function withStale(text: string, paths: string[]): string {
  const f = splitFront(text);
  if (!f.keys.length) return text;
  const lines = f.keys.filter((k) => k.key !== 'stale').flatMap((k) => k.lines);
  const stale = paths.filter(listable).slice(0, 5);
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)!;
  const rest = text.slice(m[0].length);
  return `---\n${[...lines, ...(stale.length ? ['stale:', ...stale.map((p) => `  - ${p}`)] : [])].join('\n')}\n---\n${rest}`;
}

/** The article's `commit:` and `anchors:` and `stale:`, as drift needs them. */
export function trackingOf(content: string): { anchors: string[]; commit?: string; stale: string[] } {
  const f = splitFront(content);
  return { anchors: listOf(f, 'anchors'), commit: frontValue(f, 'commit'), stale: listOf(f, 'stale') };
}

/** The body of a model's article without any frontmatter it wrote anyway. */
export const bodyOf = (content: string): string => splitFront(content.replace(/\r\n/g, '\n')).body.trim();

/**
 * Links to files that are not there become plain text: `known` holds the wiki paths a link may go to (articles, the
 * source, index.md and log.md); other links (web, mail, #anchors) stay.
 */
export function cleanLinks(body: string, articlePath: string, known: Set<string>): string {
  return body.replace(/(!?)\[([^\]\n]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (all, bang: string, text: string, target: string) => {
    if (bang) return text;
    const t = target.split('#')[0];
    if (!t || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) return all;
    let dec: string;
    try {
      dec = decodeURIComponent(t);
    } catch {
      return text;
    }
    const dest = path.posix.normalize(path.posix.join(path.posix.dirname(articlePath), dec));
    return known.has(dest) ? all : text;
  });
}

// ---- applying -------------------------------------------------------------------------------------------------

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const conflict = (e: unknown) => /conflict|locked/i.test((e as Error)?.message ?? '');

/**
 * Writes one file. `make` gets what the file holds now (null: none) and returns the new text, or null to leave
 * it. On a conflict (another writer got there first) it reads again and tries once more.
 */
export async function writeFile(root: string, rel: string, make: (current: string | null) => string | null): Promise<boolean> {
  if (!writable(rel)) throw new Error(`Not a path to write: ${rel}`);
  for (let attempt = 0; ; attempt++) {
    const cur = readOrNull(root, rel);
    const next = make(cur?.content ?? null);
    if (next == null || next === cur?.content) return false;
    try {
      applyWikiChanges(root, [{ path: rel, content: next, expectedSha256: cur?.sha256 ?? null }]);
      return true;
    } catch (e) {
      if (attempt >= 1 || !conflict(e)) throw e;
      await pause(250);
    }
  }
}

const START = '<!-- articles:start -->';
const END = '<!-- articles:end -->';
/** A wiki with fewer articles than this keeps its index a flat list, areas or not. */
export const GROUP_FROM = 10;

/** One line of the index: the article's title, link and summary. */
function indexLine(root: string, a: { path: string; title: string }, content?: string): string {
  const summary = plainLine(summaryOf(content ?? readOrNull(root, a.path)?.content ?? '')).replace(/[\r\n]+/g, ' ');
  return `- [${a.title.replace(/[\[\]]/g, '')}](${encodeURI(a.path)})${summary ? ` — ${summary}` : ''}`;
}

/**
 * The index's block: every article (not hubs, not redirects) with its title, link and summary. Grouped by area once
 * the wiki has areas and at least GROUP_FROM articles: a heading for each area (linking its hub when it has one), what
 * it holds, then its articles, in its hub's reading order; an article in two areas is under both; Other last.
 */
export function indexBlock(root: string): string {
  const articles = browseWiki(root).articles.filter((a) => !isHubPath(a.path));
  const registry = loadRegistry(root);
  if (!hasAreas(registry) || articles.length < GROUP_FROM) return articles.map((a) => indexLine(root, a)).join('\n') || '(no articles yet)';
  const texts = new Map(articles.map((a) => [a.path, readOrNull(root, a.path)?.content ?? '']));
  const members = new Map<string, { path: string; title: string }[]>();
  for (const a of articles) for (const id of placedIn(areasOfArticle(texts.get(a.path)!), registry)) members.set(id, [...(members.get(id) ?? []), a]);
  const out: string[] = [];
  for (const { area, depth } of areaOrder(registry)) {
    const own = members.get(area.id) ?? [];
    const subs = registry.areas.filter((x) => x.parent === area.id && (members.get(x.id)?.length ?? 0) > 0);
    if (!own.length && !subs.length) continue;
    const hub = readOrNull(root, hubPath(area.id));
    // The hub's reading order (its members), then the rest by title.
    const order = hub ? listOf(splitFront(hub.content), 'members').map(memberPath) : [];
    const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
    own.sort((x, y) => rank(x.path) - rank(y.path) || x.title.localeCompare(y.title));
    const name = area.name.replace(/[\[\]\r\n]/g, '');
    const heading = hub && redirectOf(hub.content) == null ? `[${name}](${encodeURI(hubPath(area.id))})` : name;
    out.push(`${depth ? '###' : '##'} ${heading}`, '', ...(area.about ? [plainLine(area.about), ''] : []), ...own.map((a) => indexLine(root, a, texts.get(a.path))), '');
  }
  return out.join('\n').trim();
}

/** `index.md`: every article with its title, link and summary, grouped by area when the wiki has them, in a block the code owns (what else is in the file stays). */
export async function writeIndex(root: string): Promise<void> {
  await writeFile(root, 'index.md', (cur) => {
    const block = `${START}\n${indexBlock(root)}\n${END}`;
    if (cur == null) return `# Wiki index\n\nEvery article, by title.\n\n${block}\n`;
    const a = cur.indexOf(START);
    const b = cur.indexOf(END);
    if (a >= 0 && b > a) return cur.slice(0, a) + block + cur.slice(b + END.length);
    return `${cur.replace(/\s*$/, '')}\n\n${block}\n`;
  });
}

/** `log.md`: one line added: the day, the document, the articles it changed. */
export async function appendLog(root: string, o: { document: string; articles: { path: string; title: string }[]; now: number }): Promise<void> {
  const doc = o.document.replace(/[\r\n\[\]]+/g, ' ').trim().slice(0, 120);
  const links = o.articles.map((a) => `[${a.title.replace(/[\[\]\r\n]/g, '')}](${encodeURI(a.path)})`).join(', ');
  const line = `- ${day(o.now)} · ${doc}${links ? ` → ${links}` : ' → nothing changed in the articles'}`;
  await writeFile(root, 'log.md', (cur) => (cur == null ? `# Log\n\n${line}\n` : `${cur.replace(/\s*$/, '')}\n${line}\n`));
}

/** Lines added to `log.md` as they are (each already a whole `- date · …` line). */
export async function appendLines(root: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await writeFile(root, 'log.md', (cur) => (cur == null ? `# Log\n\n${lines.join('\n')}\n` : `${cur.replace(/\s*$/, '')}\n${lines.join('\n')}\n`));
}

const logSource = (s: string) => s.replace(/[\r\n\[\]]+/g, ' ').trim().slice(0, 120);
const logLink = (a: { path: string; title: string }) => `[${a.title.replace(/[\[\]\r\n]/g, '')}](${encodeURI(a.path)})`;

/** `log.md`: a line for each article a source revised (`replaced` statements went, the earlier text is kept) or split into parts. */
export async function appendRevisions(root: string, o: { source: string; now: number; revised?: { path: string; title: string; replaced: number }[]; split?: { path: string; title: string; parts: number }[] }): Promise<void> {
  const d = day(o.now);
  await appendLines(root, [
    ...(o.revised ?? []).map((r) => `- ${d} · ${logSource(o.source)} → revised ${logLink(r)}: ${r.replaced ? `replaced ${r.replaced} statement${r.replaced === 1 ? '' : 's'}` : 'brought up to date'} (earlier text kept)`),
    ...(o.split ?? []).map((r) => `- ${d} · ${logSource(o.source)} → split ${logLink(r)} into ${r.parts} parts (earlier text kept)`),
  ]);
}

// ---- revising -------------------------------------------------------------------------------------------------

/** A rewrite shorter than this share of the old article is refused unless it says what it replaced. */
export const KEEP_SHARE = 0.8;
/** Whatever it says it replaced, a rewrite keeps at least this share of the old article. */
export const KEEP_FLOOR = 0.5;

/** The `removed` list of an answer: what is usable, and whether every item in it had its statement and a reason. */
export function parseRemoved(raw: unknown): { items: Removed[]; valid: boolean } {
  if (raw == null) return { items: [], valid: true };
  if (!Array.isArray(raw)) return { items: [], valid: false };
  const items: Removed[] = [];
  let valid = true;
  for (const r of raw.slice(0, 60)) {
    const text = typeof (r as { text?: unknown })?.text === 'string' ? (r as { text: string }).text.replace(/\s+/g, ' ').trim() : '';
    const why = typeof (r as { why?: unknown })?.why === 'string' ? (r as { why: string }).why.replace(/\s+/g, ' ').trim() : '';
    if (text.length < 3 || why.length < 3) valid = false;
    else items.push({ text: text.slice(0, 400), why: why.slice(0, 200) });
  }
  return { items, valid };
}

const plain = (s: string) => s.toLowerCase().replace(/[`*_>#\[\]()|~-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Whether a statement the helper says it replaced was really in the article (its words, or most of them). */
function saidIn(body: string, statement: string): boolean {
  const hay = plain(body);
  const t = plain(statement);
  if (!t || hay.includes(t)) return !!t;
  const ws = [...new Set(t.match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  return ws.length >= 3 && ws.filter((w) => hay.includes(w)).length / ws.length >= 0.7;
}

/**
 * Whether a rewrite of an article's body may replace it. As long as it keeps KEEP_SHARE of the old text it may; shorter
 * only when it lists what it dropped, every item with a reason, each item a statement the article really had, and it
 * still keeps KEEP_FLOOR of it.
 */
export function judgeRewrite(oldBody: string, newBody: string, removed: { items: Removed[]; valid: boolean }): { ok: true } | { ok: false; reason: string } {
  const was = oldBody.trim().length;
  const now = newBody.trim().length;
  if (now >= was * KEEP_SHARE) return { ok: true };
  if (!removed.items.length || !removed.valid) return { ok: false, reason: 'the new text dropped what it said' };
  if (!removed.items.every((r) => saidIn(oldBody, r.text))) return { ok: false, reason: 'the new text listed statements the article never said' };
  if (now < was * KEEP_FLOOR) return { ok: false, reason: 'the new text dropped too much of what it said' };
  return { ok: true };
}

export interface StoreArticle {
  path: string;
  title: string;
  /** The new body, links already cleaned. */
  body: string;
  source?: string;
  now: number;
  summary?: string;
  anchors?: string[];
  commit?: string | null;
  removed?: { items: Removed[]; valid: boolean };
  /** What the snapshot says the rewrite came from. */
  why?: string;
  /** Skip the KEEP_SHARE guard: the caller has judged the rewrite (a split's hub). */
  judged?: boolean;
  /** Only write over exactly this file text (a split: the article was read and split as it was). */
  expect?: string;
  carry?: string[];
  /** The areas it is in (a new article placed by the digest; a merge's union); kept as they were when not given. */
  areas?: string[];
}

export interface Stored {
  status: 'written' | 'refused' | 'unchanged';
  reason?: string;
  /** Statements the rewrite replaced (listed with their reasons), 0 for a first write or a plain addition. */
  replaced: number;
  /** The copy of the article's earlier text, when there was one. */
  snapshot?: string;
}

/**
 * Writes an article: a new one, or a rewrite of an existing one, which first keeps the earlier text in the wiki's
 * history (`.history/`, with the reasons when statements were replaced). The rewrite is judged against what the file
 * holds now (another writer may have changed it since it was read), under the rule of judgeRewrite.
 */
export async function storeArticle(root: string, a: StoreArticle): Promise<Stored> {
  const removed = a.removed ?? { items: [], valid: true };
  let result: Stored = { status: 'unchanged', replaced: 0 };
  const did = await writeFile(root, a.path, (cur) => {
    if (cur != null) {
      if (a.expect != null && cur !== a.expect) {
        result = { status: 'refused', reason: 'changed meanwhile', replaced: 0 };
        return null;
      }
      if (!a.judged) {
        const j = judgeRewrite(splitFront(cur).body, a.body, removed);
        if (!j.ok) {
          result = { status: 'refused', reason: j.reason, replaced: 0 };
          return null;
        }
      }
    }
    const next = composeArticle(cur, a.body, { title: a.title, source: a.source, carry: a.carry, now: a.now, summary: a.summary, anchors: a.anchors, commit: a.commit, areas: a.areas });
    if (cur == null) {
      result = { status: 'written', replaced: 0 };
      return next;
    }
    const replaced = removed.items.length;
    const snapshot = snapshotArticle(root, a.path, cur, a.now, { source: a.why ?? a.source, removed: removed.items });
    result = { status: 'written', replaced, snapshot };
    return next;
  });
  // Nothing written and no reason given: the text came out as it was.
  if (!did && result.status === 'written') result = { status: 'unchanged', replaced: 0 };
  return result;
}
