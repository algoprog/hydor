// What a project has that its wiki memory has not read: the history sources of a build and of a rebuild. Each is a source
// the digest reads with digestText, through the code the daily passes use (documents: digest.ts, conversations: work.ts, commits:
// commits.ts); nothing here copies what they do.
//   · Files: one text, "Project files": the project's name and description, its folder tree (two levels), the README and the
//     agents' and contributors' notes, and what the docs folder holds (a title and a first paragraph for each file).
//   · Notes: the project's memory notes, in texts of at most MAX_DOC_CHARS. Never changed, and no new notes are made from them.
//   · Documents: the project's Knowledge documents its wiki has not read (as Wiki memory picks them: pinned, most used, newest,
//     within its limit).
//   · Sessions: the project's conversations the work pass may read and has not, the most signal first.
//   · Commits: the newest BUILD_MAX_COMMITS commit messages, in batches.
// The texts of Files, Notes and Commits are kept as sources in raw/ when a job starts (so a restart reads the same texts);
// documents and sessions are read from where they are when their turn comes (their hashes say whether they were read).
import fs from 'node:fs';
import path from 'node:path';
import { kvGet, type DB } from '../../db.ts';
import { knowledgeSchema } from '../../knowledge/store.ts';
import { conversationsSince } from '../../memory/learn.ts';
import { redactSecrets } from '../../memory/secrets.ts';
import { entries, learnOn, memoryOn, repoRoot, titleOf } from '../../memory/store.ts';
import { ingestWikiSource, redirectOf, wikiHash } from '../core.ts';
import { digestDocument, digestText, documentToRead, MAX_DOC_CHARS, type DigestTextInput } from '../digest/digest.ts';
import { countHistory, git, readHistory } from '../digest/commits.ts';
import { documentBases, documentLimit, documentsToRead } from '../digest/limit.ts';
import { wikiSpaceOfSession } from '../roots.ts';
import { conversationSignal } from '../digest/signal.ts';
import { MIN_CONVO_CHARS, prepareSession, readSession, type Candidate } from '../digest/work.ts';
import { setWorkMark, workMark } from '../digest/store.ts';
import type { DigestAsk, TextKind } from '../digest/plan.ts';
import { frontValue, readOrNull, splitFront, titleOfArticle } from '../digest/write.ts';

/** The most sessions a build reads, how many of them are essentials, and how many sources the essentials hold at least when there are fewer sessions. */
export const BUILD_MAX_SESSIONS = 300;
export const BUILD_ESSENTIAL_SESSIONS = 10;
export const BUILD_ESSENTIALS_MIN = 12;
/** Sources a build or rebuild starts in an hour at most: only a guard (the workers set its pace). */
export const BUILD_PER_HOUR = 240;
/** The most lines the folder tree takes, characters of one file of the project read, and docs listed. */
export const TREE_LINES = 300;
export const FILE_CHARS = 8000;
export const DOC_FILES = 40;

/** What a source of a job is: files, notes, sessions, commits, documents, or another kept source (k). One letter each in a job's `cats`. */
export type Cat = 'f' | 'n' | 's' | 'c' | 'd' | 'k';

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

// ---- the project's files ----------------------------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'venv', '.venv', '__pycache__', 'target']);
const WALK_MAX = 20_000;

/** The files of a folder, relative and with `/`: in a Git repository what git lists (tracked, and untracked but not ignored), else a walk that skips hidden folders and the usual build folders. */
export async function folderFiles(folder: string): Promise<string[]> {
  if (!fs.existsSync(folder)) return [];
  const out = await git(folder, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (out !== null && out.length) return [...new Set(out.split('\0').filter(Boolean))].filter((f) => !f.split('/').some((s) => SKIP_DIRS.has(s))).slice(0, WALK_MAX);
  const files: string[] = [];
  const walk = (dir: string, rel: string) => {
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      if (files.length >= WALK_MAX) return;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name), `${rel}${e.name}/`);
      } else if (e.isFile() && !e.name.startsWith('.DS_')) files.push(`${rel}${e.name}`);
    }
  };
  walk(folder, '');
  return files;
}

/** The top two levels of a file list: each folder with its number of files, the top-level files after; at most `max` lines. */
export function treeLines(files: string[], max = TREE_LINES): string[] {
  const top = new Map<string, { n: number; sub: Map<string, number> }>();
  const loose: string[] = [];
  for (const f of files) {
    const parts = f.split('/');
    if (parts.length === 1) {
      loose.push(f);
      continue;
    }
    const t = top.get(parts[0]) ?? { n: 0, sub: new Map<string, number>() };
    t.n++;
    if (parts.length > 2) t.sub.set(parts[1], (t.sub.get(parts[1]) ?? 0) + 1);
    top.set(parts[0], t);
  }
  const lines: string[] = [];
  const count = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
  for (const [name, t] of [...top].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${name}/ (${count(t.n)})`);
    for (const [sub, n] of [...t.sub].sort((a, b) => a[0].localeCompare(b[0]))) lines.push(`  ${name}/${sub}/ (${count(n)})`);
  }
  lines.push(...loose.sort((a, b) => a.localeCompare(b)));
  return lines.length > max ? [...lines.slice(0, max - 1), `… (${lines.length - max + 1} more lines)`] : lines;
}

const readText = (file: string, max: number): string | null => {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 4_000_000) return null;
    const t = fs.readFileSync(file, 'utf8').replace(/\0/g, '').trim();
    return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : null;
  } catch {
    return null;
  }
};

/** A Markdown file's title (its front matter's, else its first heading, else its name) and its first paragraph. */
export function docSummary(text: string, name: string): { title: string; first: string } {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  const title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(fm)?.[1] ?? /^#\s+(.+?)\s*#*$/m.exec(body)?.[1] ?? name.replace(/\.[^.]+$/, '');
  const paragraphs = body.split(/\r?\n\s*\r?\n/).map((p) => p.trim());
  const first = paragraphs.find((p) => p && !/^(?:#|```|---|<!--|\||!\[|\[!)/.test(p)) ?? '';
  return { title: title.trim(), first: first.replace(/\s+/g, ' ').slice(0, 300) };
}

/** The Markdown files of a docs folder, by path, at most `max`. */
function docFiles(files: string[], dir: string, max: number): string[] {
  return files
    .filter((f) => f.startsWith(`${dir}/`) && /\.(?:md|mdx|markdown)$/i.test(f) && f.split('/').length <= 4)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, max);
}

const READ_ME = /^(?:readme(?:\.[a-z0-9]+)?)$/i;
const NOTES_FILES = ['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md'];

export interface ProjectFiles {
  /** What the helper reads (within MAX_DOC_CHARS). */
  text: string;
  /** What was found, as the offer says it: README.md, AGENTS.md, docs/. */
  names: string[];
}

/** The names a project's folder has among the files read for the Files source (no text is made). */
export async function projectFileNames(folder: string): Promise<string[]> {
  const files = await folderFiles(folder);
  return filesFound(files).names;
}

/** The same from one look at the folder's top level (and docs/): cheap enough for every session start. `any`: the folder has files at all (a Files source can be made). */
export function quickFileNames(folder: string): { names: string[]; any: boolean } {
  let top: fs.Dirent[];
  try {
    top = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return { names: [], any: false };
  }
  const files = top.filter((e) => e.isFile()).map((e) => e.name);
  const readmes = files.filter((f) => READ_ME.test(f)).sort();
  const notes = NOTES_FILES.map((n) => files.find((f) => f.toLowerCase() === n.toLowerCase())).filter((f): f is string => !!f);
  const docDir = top.find((e) => e.isDirectory() && (e.name === 'docs' || e.name === 'doc'))?.name;
  const docs = docDir ? fs.readdirSync(path.join(folder, docDir)).some((f) => /\.(?:md|mdx|markdown)$/i.test(f) || !f.includes('.')) : false;
  const any = files.some((f) => !f.startsWith('.')) || top.some((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name));
  return { names: [...readmes, ...notes, ...(docs ? [`${docDir}/`] : [])], any };
}

function filesFound(files: string[]): { names: string[]; readmes: string[]; notes: string[]; docs: string[]; docDir: string | null } {
  const top = files.filter((f) => !f.includes('/'));
  const readmes = top.filter((f) => READ_ME.test(f)).sort();
  const notes = NOTES_FILES.map((n) => top.find((f) => f.toLowerCase() === n.toLowerCase())).filter((f): f is string => !!f);
  const docDir = ['docs', 'doc'].find((d) => files.some((f) => f.startsWith(`${d}/`))) ?? null;
  const docs = docDir ? docFiles(files, docDir, DOC_FILES) : [];
  return { names: [...readmes, ...notes, ...(docs.length ? [`${docDir}/`] : [])], readmes, notes, docs, docDir };
}

/**
 * The text of the Files source: the project's name and description, its folder tree, its README, AGENTS.md, CLAUDE.md and
 * CONTRIBUTING.md (each at most FILE_CHARS characters), and a title and first paragraph for each Markdown file of docs/ (at most DOC_FILES).
 * Within MAX_DOC_CHARS. Null when the folder has none of these.
 */
export async function projectFiles(project: { name: string; description?: string; folder: string }): Promise<ProjectFiles | null> {
  const files = await folderFiles(project.folder);
  if (!files.length) return null;
  const found = filesFound(files);
  const tree = treeLines(files);
  const docLines = found.docs.map((f) => {
    const t = readText(path.join(project.folder, ...f.split('/')), 6000);
    const s = t ? docSummary(t, path.posix.basename(f)) : { title: path.posix.basename(f), first: '' };
    return `- ${f} — ${s.title}${s.first ? `: ${s.first}` : ''}`;
  });
  const head = `Project files of "${project.name}".${project.description ? `\n${project.description.trim()}` : ''}\n\n## Folder tree (top two levels)\n\n${tree.join('\n')}`;
  const docsText = docLines.length ? `\n\n## Documentation (${found.docDir}/)\n\n${docLines.join('\n')}` : '';
  const named = [...found.readmes, ...found.notes];
  // Each file at most FILE_CHARS; all within MAX_DOC_CHARS: the files are cut shorter together when they do not fit.
  let each = FILE_CHARS;
  let text = '';
  for (;;) {
    const parts = named.map((f) => {
      const t = readText(path.join(project.folder, f), each);
      return t ? `\n\n## ${f}\n\n${t}` : '';
    });
    text = head + parts.join('') + docsText;
    if (text.length <= MAX_DOC_CHARS || each <= 500) break;
    each = Math.floor(each * 0.7);
  }
  return { text: text.slice(0, MAX_DOC_CHARS), names: found.names };
}

// ---- the project's memory notes ----------------------------------------------------------------------------------------

/** The project's memory notes as "## <title>\n<text>" blocks, in texts of at most MAX_DOC_CHARS, titled "Memory notes (1 of 2)". */
export function noteTexts(db: DB, project: { folder: string }, now = Date.now()): { title: string; text: string }[] {
  const place = repoRoot(project.folder);
  if (!place) return [];
  const blocks = entries(db, { scope: 'repo', scopeKey: place, live: now, limit: 2000 })
    .map((n) => `## ${titleOf(n)}\n${n.text.trim()}`)
    .filter((b) => b.length > 8);
  const texts: string[] = [];
  let cur = '';
  for (const b of blocks) {
    const block = b.slice(0, MAX_DOC_CHARS);
    if (cur && cur.length + block.length + 2 > MAX_DOC_CHARS) {
      texts.push(cur);
      cur = '';
    }
    cur += `${cur ? '\n\n' : ''}${block}`;
  }
  if (cur) texts.push(cur);
  return texts.map((text, i) => ({ title: `Memory notes (${i + 1} of ${texts.length})`, text }));
}

/** How many memory notes the project has (for the offer: no text is made). */
export function noteCount(db: DB, project: { folder: string }, now = Date.now()): number {
  const place = repoRoot(project.folder);
  return place ? entries(db, { scope: 'repo', scopeKey: place, live: now, limit: 2000 }).length : 0;
}

// ---- documents --------------------------------------------------------------------------------------------------------

export const docId = (base: string, p: string) => `doc:${base}:${p}`;
export function parseDocId(id: string): { base: string; path: string } | null {
  const m = /^doc:([^:]+):(.*)$/s.exec(id);
  return m ? { base: m[1], path: m[2] } : null;
}

/** The documents the project's wiki reads (within its limit; pinned, most used, newest), in that order. */
function readSet(db: DB, space: string): { base: string; path: string; title: string }[] {
  const picked = documentsToRead(db, space);
  if (picked) return picked;
  const bases = documentBases(db, space);
  if (!bases.length) return [];
  return db
    .prepare(`select base, path, title from kb_docs where status = 'indexed' and base in (${bases.map(() => '?').join(',')}) order by mtime desc, id desc limit ?`)
    .all(...bases, Math.max(documentLimit(db, space), 1)) as { base: string; path: string; title: string }[];
}

/**
 * The documents of the project's Knowledge its wiki has not read: its text has not been digested (the hash the document digest
 * uses). `exact: false` counts the documents the wiki reads without looking at each one's text (cheap: a first look at a project).
 */
export function unreadDocuments(db: DB, space: string, o: { exact?: boolean } = {}): { id: string; title: string }[] {
  knowledgeSchema(db);
  const set = readSet(db, space);
  return set
    .filter((d) => o.exact === false || documentToRead(db, { base: d.base, path: d.path, title: d.title }, { limit: false }) !== null)
    .map((d) => ({ id: docId(d.base, d.path), title: d.title }));
}

// ---- sessions ---------------------------------------------------------------------------------------------------------

/** How many of a project's sessions a build looks at to pick the ones with the most signal. */
const SESSIONS_LOOKED_AT = 1000;

/**
 * The project's conversations the work pass may read (conversationsSince: not memory off, confidential, subagents or scheduled
 * runs) that it has not: no work mark covers the last turn, and its text is not digested. The most signal first, the latest
 * first among equals, at most BUILD_MAX_SESSIONS. Nothing when Learn from conversations is off. `exclude`: a session key left out
 * (the session that is asking). `count`: only how many there are (cheap: no text is made, at most BUILD_MAX_SESSIONS).
 */
export function unreadSessions(db: DB, space: string, o: { exclude?: string; count?: boolean; now?: number; max?: number } = {}): { id: string; title: string }[] {
  if (!memoryOn(db) || !learnOn(db)) return [];
  const now = o.now ?? Date.now();
  const max = o.max ?? BUILD_MAX_SESSIONS;
  const candidates: Candidate[] = [];
  for (const c of conversationsSince(db, 0, SESSIONS_LOOKED_AT)) {
    if (c.key === o.exclude) continue;
    if (wikiSpaceOfSession(db, c.key, c.cwd) !== space) continue;
    const mark = workMark(db, c.key);
    if (mark && mark.upto >= c.last) continue;
    candidates.push({ key: c.key, title: c.title, last: c.last, space, since: mark?.upto ?? 0, mark, score: 0 });
  }
  if (o.count) {
    // Only those with enough new text to be worth reading (a session of one short turn is not), by a sum over its indexed text.
    const size = db.prepare("select coalesce(sum(length(text)), 0) as n from chunk_text where key = ? and kind in ('user', 'assistant') and coalesce(ts, 0) > ?");
    return candidates
      .filter((c) => (size.get(c.key, c.since) as { n: number }).n >= MIN_CONVO_CHARS)
      .slice(0, max)
      .map((c) => ({ id: `session:${c.key}`, title: c.title }));
  }
  for (const c of candidates) c.score = conversationSignal(db, c.key, c.since).score;
  candidates.sort((a, b) => b.score - a.score || b.last - a.last);
  const out: { id: string; title: string }[] = [];
  for (const c of candidates) {
    if (out.length >= max) break;
    const p = prepareSession(db, c, now);
    if (!p) continue;
    if ('read' in p) {
      // Its text was read before: marked read, as the work pass does.
      setWorkMark(db, c.key, { space, upto: p.read, at: now });
      continue;
    }
    out.push({ id: `session:${c.key}`, title: p.chosen.title });
  }
  return out;
}

/** A session by its key as the work pass would pick it now (the turns it has not read), for reading it when its turn comes. */
function sessionCandidate(db: DB, key: string, space: string): Candidate | null {
  const r = db
    .prepare(
      "select coalesce(s.title, a.title, a.first_prompt, '') as title, (select max(ts) from chunk_text where key = a.key and kind = 'user') as last from app_sessions a left join sessions s on s.key = a.key where a.key = ?",
    )
    .get(key) as { title: string; last: number | null } | undefined;
  if (!r?.last) return null;
  const mark = workMark(db, key);
  if (mark && mark.upto >= r.last) return null;
  return { key, title: r.title, last: r.last, space, since: mark?.upto ?? 0, mark, score: 0 };
}

// ---- the history of a project ------------------------------------------------------------------------------------------

export interface HistoryCounts {
  /** What was found among the files read for the Files source: README.md, AGENTS.md, docs/… (none: no Files source). */
  files: string[];
  notes: number;
  commits: number;
  documents: number;
  sessions: number;
}

/** What a project has to read, counted cheaply: no text is made, and a document's text is not looked at (a first look). */
export async function historyCounts(
  db: DB,
  project: { id: string; folder: string },
  o: { exclude?: string; exactDocuments?: boolean; quick?: boolean; now?: number } = {},
): Promise<HistoryCounts & { anyFiles: boolean }> {
  const now = o.now ?? Date.now();
  let found: { names: string[]; any: boolean };
  if (o.quick) found = quickFileNames(project.folder);
  else {
    const all = await folderFiles(project.folder);
    found = { names: filesFound(all).names, any: all.length > 0 };
  }
  return {
    files: found.names,
    anyFiles: found.any,
    notes: noteCount(db, project, now),
    commits: await countHistory(project.folder, now),
    documents: unreadDocuments(db, project.id, { exact: o.exactDocuments }).length,
    sessions: unreadSessions(db, project.id, { exclude: o.exclude, count: true, now }).length,
  };
}

export interface HistorySource {
  /** A kept source (raw/…), `session:<key>` or `doc:<base>:<path>`. */
  id: string;
  cat: Cat;
}

export interface History {
  /** In the order a build reads them: essentials first (the first `essentials`), then the rest. */
  sources: HistorySource[];
  /** The same by kind, each in its order (a rebuild puts them among its kept sources itself). */
  byCat: Record<Cat, HistorySource[]>;
  essentials: number;
  counts: HistoryCounts & { commitBatches: number };
  /** The commit HEAD the history was read to (null: no repository). */
  head: string | null;
}

/** Keeps a prepared text as a source in raw/ (redacted); null when it cannot be kept. */
function keep(root: string, text: string, origin: string): string | null {
  try {
    return ingestWikiSource(root, redactSecrets(text), origin).path;
  } catch {
    return null;
  }
}

/**
 * Prepares everything a project has to read: the texts of Files, Notes and Commits are kept in raw/, sessions and documents are
 * picked. Returns the sources in the order they are read. A build: the essentials (Files, Notes and the BUILD_ESSENTIAL_SESSIONS
 * sessions with the most signal; with fewer sessions the newest commit batches, until the essentials hold BUILD_ESSENTIALS_MIN) come first,
 * then the other sessions, the other commit batches, the documents. A rebuild (`order: 'rebuild'`) gives the sources in the order it
 * reads them, with no essentials: files, commits, documents, sessions, notes.
 */
export async function gatherHistory(
  db: DB,
  project: { id: string; name: string; description?: string; folder: string },
  root: string,
  o: { exclude?: string; order: 'build' | 'rebuild'; commits?: boolean; now?: number },
): Promise<History> {
  const now = o.now ?? Date.now();
  const stamp = day(now);
  const files = await projectFiles(project);
  const filesPath = files ? keep(root, files.text, `files:${project.name} · ${stamp}`) : null;
  const notes = noteTexts(db, project, now);
  const notePaths = notes.map((n, i) => keep(root, n.text, `notes:${project.name} · ${stamp} · ${i + 1} of ${notes.length}`)).filter((p): p is string => !!p);
  const hist = o.commits === false ? null : await readHistory(project.folder);
  const commitPaths = (hist?.batches ?? []).map((b) => keep(root, b.text, `commits:${project.name} · ${b.from}–${b.to}`)).filter((p): p is string => !!p);
  const sessions = unreadSessions(db, project.id, { exclude: o.exclude, now });
  const documents = unreadDocuments(db, project.id);
  const f: HistorySource[] = filesPath ? [{ id: filesPath, cat: 'f' }] : [];
  const n: HistorySource[] = notePaths.map((id) => ({ id, cat: 'n' as const }));
  const s: HistorySource[] = sessions.map((x) => ({ id: x.id, cat: 's' as const }));
  const c: HistorySource[] = commitPaths.map((id) => ({ id, cat: 'c' as const }));
  const d: HistorySource[] = documents.map((x) => ({ id: x.id, cat: 'd' as const }));
  const counts = { files: files?.names ?? [], notes: noteCount(db, project, now), commits: hist?.commits ?? 0, documents: d.length, sessions: s.length, commitBatches: c.length };
  const byCat = { f, n, s, c, d, k: [] as HistorySource[] };
  if (o.order === 'rebuild') return { sources: [...f, ...c, ...d, ...s, ...n], byCat, essentials: 0, counts, head: hist?.head ?? null };
  const essentialSessions = s.slice(0, BUILD_ESSENTIAL_SESSIONS);
  const essentials: HistorySource[] = [...f, ...n, ...essentialSessions];
  let restCommits = c;
  if (s.length < BUILD_ESSENTIAL_SESSIONS) {
    const more = Math.max(0, BUILD_ESSENTIALS_MIN - essentials.length);
    essentials.push(...c.slice(0, more));
    restCommits = c.slice(more);
  }
  const rest: HistorySource[] = [...s.slice(BUILD_ESSENTIAL_SESSIONS), ...restCommits, ...d];
  // Nothing of the kind that matters first: the first few documents are the essentials.
  if (!essentials.length) essentials.push(...rest.splice(0, Math.min(5, rest.length)));
  return { sources: [...essentials, ...rest], byCat, essentials: essentials.length, counts, head: hist?.head ?? null };
}

// ---- kept sources -------------------------------------------------------------------------------------------------------

export interface RebuildSource {
  /** raw/… (a kept source), or wiki/… (an article that cites no source, read from the archive). */
  path: string;
  title: string;
  origin: string;
  kind: TextKind;
  text: string;
}

/** What a source note says it came from, as a title the helper reads, and how to read it (a conversation or a document). */
export function titleAndKind(origin: string, fallback: string): { title: string; kind: TextKind } {
  const clip = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;
  if (origin.startsWith('session:')) return { title: clip(origin.slice(8).split(' · ')[0]), kind: 'conversation' };
  if (origin.startsWith('commits:')) return { title: clip(`Commits ${origin.slice(8).split(' · ').slice(1).join(' · ')}`), kind: 'conversation' };
  if (origin.startsWith('knowledge:')) return { title: clip(origin.slice(10).replace(/^[^/]*\//, '')), kind: 'document' };
  if (origin.startsWith('files:')) return { title: 'Project files', kind: 'document' };
  if (origin.startsWith('notes:')) {
    const n = /(\d+) of (\d+)$/.exec(origin);
    return { title: n ? `Memory notes (${n[1]} of ${n[2]})` : 'Memory notes', kind: 'document' };
  }
  if (origin.startsWith('memory notes')) return { title: 'Notes from memory', kind: 'document' };
  if (origin.startsWith('file:')) return { title: clip(path.posix.basename(origin.slice(5).split('#')[0])), kind: 'document' };
  return { title: clip(origin), kind: 'document' };
}

/** A kept source as the digest reads it: its text (without the note's front matter), where it came from, its title. */
export function readSource(root: string, rel: string): RebuildSource | null {
  const cur = readOrNull(root, rel);
  if (!cur) return null;
  const f = splitFront(cur.content);
  const origin = frontValue(f, 'source') ?? rel;
  const text = f.body.trim();
  if (!text) return null;
  const { title, kind } = titleAndKind(origin, path.posix.basename(rel, '.md'));
  return { path: rel, title, origin, kind, text: text.slice(0, MAX_DOC_CHARS) };
}

/** An article that cited no source, read from the archive as its own source (never kept in raw/). */
export function readArchived(archiveDir: string, rel: string): RebuildSource | null {
  try {
    const content = fs.readFileSync(path.join(archiveDir, ...rel.split('/')), 'utf8');
    if (redirectOf(content) != null) return null;
    const body = splitFront(content).body.trim();
    if (!body) return null;
    const title = titleOfArticle(content, path.posix.basename(rel, '.md'));
    return { path: rel, title, origin: `wiki article ${rel} of the earlier wiki`, kind: 'document', text: body.slice(0, MAX_DOC_CHARS) };
  } catch {
    return null;
  }
}

// ---- reading one source when its turn comes ----------------------------------------------------------------------------

export interface ReadContext {
  db: DB;
  space: string | null;
  root: string;
  /** What the sources' update rows are listed under ('build' or 'rebuild'). */
  base: 'build' | 'rebuild';
  /** The archive of the wiki a rebuild replaced: an article that cites no source is read from it (wiki/…). */
  archiveDir?: string;
  now: () => number;
  /** Hears the articles each source made or changed. */
  report: (articles: string[]) => void;
}

export interface Ready {
  title: string;
  /** Reads it: true when the helper answered, 'skipped' when there was nothing to read it with, false when it failed. */
  run: (ask: DigestAsk) => Promise<boolean | 'skipped'>;
}

/**
 * What to do for one source id of a job: null when there is nothing to read any more (a document gone, a session marked
 * read, a source file missing); else its title and how to read it.
 */
export function prepareSource(c: ReadContext, id: string): Ready | null {
  const report: DigestTextInput['report'] = (r) => c.report(r.articles);
  if (id.startsWith('raw/') || id.startsWith('wiki/')) {
    const src = id.startsWith('raw/') ? readSource(c.root, id) : readArchived(c.archiveDir ?? '', id);
    if (!src) return null;
    const kept = id.startsWith('raw/');
    return {
      title: src.title,
      run: (ask) =>
        digestText(c.db, ask, {
          space: c.space,
          base: c.base,
          title: src.title,
          path: `${c.base}:${id}`,
          origin: src.origin,
          text: src.text,
          cut: false,
          kind: src.kind,
          notes: false,
          hash: wikiHash(src.text),
          now: c.now,
          source: kept ? id : null,
          quiet: true,
          report,
        }),
    };
  }
  if (id.startsWith('session:') && c.space) {
    const key = id.slice('session:'.length);
    const cand = sessionCandidate(c.db, key, c.space);
    if (!cand) return null;
    const p = prepareSession(c.db, cand, c.now());
    if (!p) return null;
    if ('read' in p) {
      setWorkMark(c.db, key, { space: c.space, upto: p.read, at: c.now() });
      return null;
    }
    return { title: p.chosen.title, run: (ask) => readSession(c.db, ask, p.chosen, c.now(), { quiet: true, report, log: false }) };
  }
  if (id.startsWith('doc:')) {
    const ref = parseDocId(id);
    const r = ref ? documentToRead(c.db, { base: ref.base, path: ref.path, title: '' }, { limit: false }) : null;
    if (!r) return null;
    return { title: r.doc.title, run: (ask) => digestDocument(c.db, ask, r, { now: c.now, quiet: true, report }) };
  }
  return null;
}

/** The average seconds one source took recently (30 until there is a measure), kept in the database (run.ts recordSeconds). */
export const AVG_KEY = 'wiki.job.avg';
export function averageSeconds(db: DB): number {
  try {
    const a = JSON.parse(kvGet(db, AVG_KEY) || 'null') as { avg?: number } | null;
    return a && typeof a.avg === 'number' && a.avg > 0 ? a.avg : 30;
  } catch {
    return 30;
  }
}
