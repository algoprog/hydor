// Writing what the helper chose into a wiki: articles with their sources in the frontmatter (the code writes the
// frontmatter, the model only the body), `index.md` and `log.md`. Only paths wiki/**/*.md, index.md and log.md.
import path from 'node:path';
import { applyWikiChanges, readWiki, wikiHash } from '../core.ts';
import { browseWiki } from '../browse.ts';

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

interface Front {
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
function listOf(f: Front, key: string): string[] {
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

/**
 * An article as written: the old frontmatter kept (its other keys as they were), the title kept (or the one given),
 * the new source added to its `sources`, `updated` set, then the body the model wrote.
 */
export function composeArticle(old: string | null, body: string, o: { title: string; source: string; now: number }): string {
  const f = old ? splitFront(old) : { keys: [] as Front['keys'], body: '' };
  const sources = [...new Set([...listOf(f, 'sources'), o.source])];
  const own = f.keys.find((k) => k.key === 'title');
  const titleLine = own ? own.lines[0].replace(/^[^:]+:\s*/, '') : JSON.stringify(plainTitle(old ? titleOfArticle(old, o.title) : o.title));
  const kept = f.keys.filter((k) => !['title', 'sources', 'updated'].includes(k.key)).flatMap((k) => k.lines);
  const front = ['---', `title: ${titleLine}`, 'sources:', ...sources.map((s) => `  - ${s}`), `updated: ${day(o.now)}`, ...kept, '---'];
  return `${front.join('\n')}\n\n${body.trim()}\n`;
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

/** `index.md`: every article with its title and link, in a block the code owns (what else is in the file stays). */
export async function writeIndex(root: string): Promise<void> {
  await writeFile(root, 'index.md', (cur) => {
    const articles = browseWiki(root).articles;
    const lines = articles.map((a) => `- [${a.title.replace(/[\[\]]/g, '')}](${encodeURI(a.path)})`);
    const block = `${START}\n${lines.join('\n') || '(no articles yet)'}\n${END}`;
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
