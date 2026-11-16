// File-backed wiki primitives: paths stay in one active wiki and writes use a shared lock and expected hashes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { secretIn } from '../memory/secrets.ts';

const MAX_BYTES = 4 * 1024 * 1024;
const LOCK = '.hydor-wiki-write.lock';

/** A digest of exact bytes, used to detect stale edits and identify unchanged sources. */
export const wikiHash = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');

/** A frontmatter document's own retirement status, never a generic task status. */
export function activeWikiDocument(text: string): boolean {
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  return !m || !/^document_status\s*:\s*["']?(?:archived|superseded|retired)["']?\s*(?:#.*)?$/im.test(m[1]);
}

/** Reject symlinks in the path components we control, including the final file. */
function noSymlinks(root: string, target: string): void {
  const rel = path.relative(root, target);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('Wiki path escapes its root');
  let current = root;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Wiki paths cannot contain symbolic links');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
}

/**
 * Resolve a bounded active file path without following wiki-internal symlinks. Hidden names (a part starting with a
 * dot: .git, .sessions, .archive, locks) are never reachable. Project planning Markdown is bounded to
 * output/projects/; a hub's separate projects/ directory remains inaccessible from this wiki.
 */
function filePath(root: string, relative: string, missing = false): string {
  if (!relative || relative.includes('\0') || relative.includes('\\') || path.posix.isAbsolute(relative)) throw new Error('Expected a relative wiki path');
  const parts = relative.split('/');
  if (parts.some((p) => !p || p.startsWith('.'))) throw new Error('Invalid or hidden wiki path');
  const projectDocument = parts.length >= 4 && parts[0] === 'output' && parts[1] === 'projects' && /\.md$/i.test(relative);
  if (!projectDocument && (parts.length === 1 ? !/\.md$/i.test(parts[0]) : !['wiki', 'raw'].includes(parts[0]))) throw new Error('A wiki holds its files in wiki/, raw/, project plans and Markdown files at its root');
  const target = path.resolve(root, ...parts);
  noSymlinks(root, target);
  if (fs.existsSync(target)) {
    if (!fs.statSync(target).isFile()) throw new Error('Expected a wiki file');
    if (target.toLowerCase().endsWith('.md') && !activeWikiDocument(readText(target))) throw new Error('Retired wiki documents are excluded');
  } else if (!missing) throw new Error(`Wiki file does not exist: ${relative}`);
  return target;
}

/** Where a write may go: articles (wiki/**.md), the index and log at the root, and Markdown notes in raw/ (never existing ones). */
function writable(relative: string): boolean {
  const parts = relative.split('/');
  if (parts.length === 1) return /^(?:index|log)\.md$/.test(parts[0]);
  if (parts.length >= 4 && parts[0] === 'output' && parts[1] === 'projects') return /\.md$/i.test(relative);
  return ['wiki', 'raw'].includes(parts[0]) && /\.md$/i.test(relative);
}

/** Read bounded UTF-8 content without accepting binary files. */
function readText(file: string): string {
  const st = fs.statSync(file);
  if (st.size > MAX_BYTES) throw new Error('Wiki file is too large');
  const data = fs.readFileSync(file);
  if (data.includes(0)) throw new Error('Wiki file is binary');
  return new TextDecoder('utf-8', { fatal: true }).decode(data);
}

/** Read a document and return the hash needed for a conflict-checked update. */
export function readWiki(root: string, relative: string): { path: string; content: string; sha256: string } {
  const file = filePath(root, relative);
  const content = readText(file);
  return { path: relative, content, sha256: wikiHash(Buffer.from(content)) };
}

export interface WikiChange { path: string; content: string; expectedSha256: string | null }

/** Serialize cooperating writers. An abandoned lock fails closed for an operator to inspect. */
function locked<T>(root: string, f: () => T): T {
  const lock = path.join(root, LOCK);
  try { fs.mkdirSync(lock, { mode: 0o700 }); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Wiki is locked by another writer');
    throw e;
  }
  try { return f(); } finally { fs.rmdirSync(lock); }
}

/** Atomically replace one file after checking its expected bytes again under the cooperative lock. */
function applyOne(root: string, change: WikiChange): void {
  if (Buffer.byteLength(change.content) > MAX_BYTES) throw new Error('Wiki file is too large');
  const file = filePath(root, change.path, true);
  if (change.path.split('/')[0].toLowerCase() === 'raw' && fs.existsSync(file)) throw new Error('Existing raw sources are immutable');
  const actual = fs.existsSync(file) ? wikiHash(fs.readFileSync(file)) : null;
  if (actual !== change.expectedSha256) throw new Error(`Wiki conflict: ${change.path}`);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  noSymlinks(root, file);
  const temp = path.join(path.dirname(file), `.hydor-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, change.content, { mode: 0o600, flag: 'wx' });
    // Independent clients must also cooperate; recheck immediately before replacement.
    const current = fs.existsSync(file) ? wikiHash(fs.readFileSync(file)) : null;
    if (current !== change.expectedSha256) throw new Error(`Wiki conflict: ${change.path}`);
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

/** Apply one change at a time; partial multi-file transactions are deliberately refused. */
export function applyWikiChanges(root: string, changes: WikiChange[]): { paths: string[] } {
  if (changes.length !== 1) throw new Error('Apply exactly one wiki file per operation');
  if (!writable(changes[0].path)) throw new Error('A wiki is written only in wiki/, in index.md and log.md, and in raw/ by its ingestion');
  // The path is judged before the lock is taken, so a refused path never waits on (or leaves) a lock.
  filePath(root, changes[0].path, true);
  return locked(root, () => { applyOne(root, changes[0]); return { paths: [changes[0].path] }; });
}

/** Coordinate protected plan snapshots with the same cooperative lock as ordinary wiki writes. */
export function withWikiWriteLock<T>(root: string, action: (apply: (change: WikiChange) => void) => T): T {
  return locked(root, () => action((change) => {
    if (!writable(change.path)) throw new Error('This wiki path cannot be written');
    applyOne(root, change);
  }));
}

const SECRET_NAME = /token|secret|passw|passwd|pwd|api[-_]?key|apikey|key|sig(?:nature)?|auth|credential|bearer|session|cookie/i;
/** A long mixed run of letters and digits that is not a plain hash or a UUID: what a token looks like in a path. */
const tokenLike = (s: string) => s.length >= 32 && /^[A-Za-z0-9_\-+=]+$/.test(s) && /[A-Za-z]/.test(s) && /\d/.test(s) && !/^[a-f0-9]+$/i.test(s) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const secretValue = (v: string) => !!secretIn(v) || tokenLike(v);

/** Refuse an origin (a URL, a file, a name) that carries credentials: user info, or secret-looking keys or values in the query, path or fragment. */
export function checkOrigin(origin: string): void {
  if (!origin.trim() || /[\r\n\0]/.test(origin) || origin.length > 2000) throw new Error('A single-line source origin is required');
  const credentials = () => new Error('Remove credentials from the source origin');
  if (secretIn(origin)) throw credentials();
  // User info in any scheme (ssh://user:pw@host), found without parsing so that no scheme escapes the check.
  if (/\/\/[^/?#\s]*@/.test(origin) || /^(?!mailto:)[^\s/@]+:[^\s/@]+@/i.test(origin)) throw credentials();
  let url: URL | null = null;
  try { url = new URL(origin); } catch { /* not a URL: a name or a path */ }
  const decode = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } };
  const pieces: string[] = [];
  if (url) {
    if (url.username || url.password) throw credentials();
    for (const [k, v] of url.searchParams) {
      if (SECRET_NAME.test(k) && v) throw credentials();
      pieces.push(v);
    }
    pieces.push(...url.pathname.split('/').map(decode));
    // A fragment is a list of parameters (#access_token=…) or one value.
    const hash = decode(url.hash.slice(1));
    for (const part of hash.split(/[&;]/)) {
      const eq = part.indexOf('=');
      if (eq > 0 && SECRET_NAME.test(part.slice(0, eq)) && part.slice(eq + 1)) throw credentials();
      pieces.push(eq > 0 ? part.slice(eq + 1) : part);
    }
  } else pieces.push(...origin.split(/[\s/]+/));
  if (pieces.some((v) => v && secretValue(v))) throw credentials();
}

/** Preserve exact text once while retaining a distinct, immutable note for each origin. */
export function ingestWikiSource(root: string, content: string, origin: string, translate: (text: string) => string = (text) => text): { path: string; originalPath: string; sha256: string; existing: boolean } {
  checkOrigin(origin);
  if (!content.trim() || Buffer.byteLength(content) > MAX_BYTES - 4096 || content.includes('\0')) throw new Error('A bounded text source is required');
  if (secretIn(content)) throw new Error('The text may contain credentials; review it before it is kept');
  const sha256 = wikiHash(content);
  const originalPath = `raw/articles/source-${sha256}.txt`;
  // The same bytes can arrive from independent sources; never silently discard the second origin.
  const relative = `raw/articles/source-${sha256}-${wikiHash(origin)}.md`;
  return locked(root, () => {
    const target = filePath(root, originalPath, true);
    const originalExists = fs.existsSync(target);
    if (originalExists && wikiHash(fs.readFileSync(target)) !== sha256) throw new Error('Source hash conflict');
    if (!originalExists) applyOne(root, { path: originalPath, content, expectedSha256: null });
    // The source note follows the wiki's Markdown conventions while the adjacent text stays byte-for-byte intact.
    const note = filePath(root, relative, true);
    const existing = fs.existsSync(note);
    if (!existing) {
      const day = new Date().toISOString().slice(0, 10);
      // Translate generated labels only; the source text and metadata keys stay intact.
      const header = `---\ntitle: ${JSON.stringify(translate('Source') + ' ' + sha256.slice(0, 12))}\nsource: ${JSON.stringify(origin)}\ntype: articles\ningested: ${day}\ntags: []\nsummary: ${JSON.stringify(translate('Source preserved at') + ' ' + originalPath)}\nsource_sha256: ${sha256}\n---\n\n`;
      applyOne(root, { path: relative, content: header + content, expectedSha256: null });
    } else {
      const previous = readText(note);
      if (!previous.includes(`source_sha256: ${sha256}\n`) || !previous.includes(`source: ${JSON.stringify(origin)}\n`)) throw new Error('Source note conflict');
    }
    return { path: relative, originalPath, sha256, existing };
  });
}

/** Preserve document bytes once and keep a distinct extracted Markdown source note for each origin. */
export function ingestWikiDocument(root: string, bytes: Buffer, extension: string, origin: string, extracted: { text: string; format: string; note?: string }, translate: (text: string) => string = (text) => text): { path: string; originalPath: string; sha256: string; existing: boolean } {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('Document must be between 1 byte and 20 MiB');
  if (!/^[a-z0-9]{1,8}$/.test(extension)) throw new Error('Invalid document extension');
  if (!origin.trim() || /[\r\n\0]/.test(origin) || origin.length > 2000) throw new Error('A single-line source origin is required');
  if (!extracted.text.trim() || Buffer.byteLength(extracted.text) > MAX_BYTES - 8192 || extracted.text.includes('\0')) throw new Error('A bounded extracted document is required');
  const sha256 = wikiHash(bytes);
  const originalPath = `raw/articles/source-${sha256}.${extension}`;
  const relative = `raw/articles/source-${sha256}-${wikiHash(origin)}.md`;
  return locked(root, () => {
    const original = filePath(root, originalPath, true);
    if (fs.existsSync(original)) {
      if (wikiHash(fs.readFileSync(original)) !== sha256) throw new Error('Source hash conflict');
    } else {
      fs.mkdirSync(path.dirname(original), { recursive: true, mode: 0o700 });
      noSymlinks(root, original);
      // Exclusive creation prevents a cooperating or racing writer from replacing existing raw bytes.
      fs.writeFileSync(original, bytes, { flag: 'wx', mode: 0o600 });
    }
    const note = filePath(root, relative, true);
    const existing = fs.existsSync(note);
    if (!existing) {
      const day = new Date().toISOString().slice(0, 10);
      const header = `---\ntitle: ${JSON.stringify(translate('Source') + ' ' + sha256.slice(0, 12))}\nsource: ${JSON.stringify(origin)}\ntype: articles\ningested: ${day}\ntags: []\nsummary: ${JSON.stringify(translate('Extracted document') + ' (' + extracted.format + '); ' + translate('Original at') + ' ' + originalPath)}\nsource_sha256: ${sha256}\noriginal: ${JSON.stringify(originalPath)}\n---\n\n`;
      const warning = extracted.note ? `Extraction note: ${extracted.note.replace(/[\r\n]+/g, ' ')}\n\n` : '';
      applyOne(root, { path: relative, content: `${header}${warning}${extracted.text}\n`, expectedSha256: null });
    } else {
      const previous = readText(note);
      if (!previous.includes(`source_sha256: ${sha256}\n`) || !previous.includes(`source: ${JSON.stringify(origin)}\n`)) throw new Error('Source note conflict');
    }
    return { path: relative, originalPath, sha256, existing };
  });
}

/** Check active Markdown, references and existing section indexes without writing wiki data. */
export function checkWiki(root: string): { checked: number; issues: { path: string; detail: string }[]; truncated: boolean } {
  const issues: { path: string; detail: string }[] = [];
  const documents = new Map<string, { markdown: string[]; wiki: string[] }>();
  let checked = 0;
  let linkCount = 0;
  let truncated = false;
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (truncated || checked >= 5000) { truncated = true; return; }
      // Hidden internal state, including session digests and archives, is not ordinary wiki content.
      if (entry.isSymbolicLink() || entry.name.startsWith('.') || ['node_modules'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      // Only content owned by this wiki is traversed, never sibling project wikis in the hub.
      if (entry.isDirectory()) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        if (dir === root ? ['wiki', 'raw', 'output'].includes(entry.name) : rel === 'output/projects' || rel.startsWith('output/projects/') || rel.startsWith('wiki/') || rel.startsWith('raw/')) visit(file);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
      const relative = path.relative(root, file).split(path.sep).join('/');
      let content: string;
      try { content = readText(file); } catch { issues.push({ path: relative, detail: 'Unreadable or invalid UTF-8' }); continue; }
      if (!activeWikiDocument(content)) continue;
      checked++;
      // Check simple YAML source lists used by compiled articles; report unsupported list syntax explicitly.
      const front = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
      const sourceBlock = front && /^sources:\s*(?:\r?\n((?:[ \t]+-[^\r\n]*(?:\r?\n|$))+)|\[([^\]]*)\])/m.exec(front);
      const sourceValues = sourceBlock ? (sourceBlock[1] ? [...sourceBlock[1].matchAll(/^\s*-\s*(.+?)\s*$/gm)].map((m) => m[1]) : sourceBlock[2].split(',')) : [];
      for (const raw of sourceValues) {
        const source = raw.trim().replace(/^['"]|['"]$/g, '');
        if (!source || /^(?:https?:|\/\/)/i.test(source)) continue;
        try { filePath(root, source); } catch { issues.push({ path: relative, detail: `Missing or excluded source: ${source}` }); }
      }
      // Ignore fenced and inline examples when checking a document's actual links.
      const prose = content.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '').replace(/`[^`\n]*`/g, '');
      const markdown = [...prose.matchAll(/\]\(([^\s)]+)(?:\s+["'][^)]*["'])?\)/g)].map((m) => m[1]);
      const wiki = [...prose.matchAll(/\[\[([^\]\n]+)\]\]/g)].map((m) => m[1].split('|')[0].trim());
      linkCount += markdown.length + wiki.length;
      // A limited scan must not draw global conclusions about unvisited links.
      if (linkCount > 100_000) { truncated = true; return; }
      documents.set(relative, { markdown, wiki });
      // Standard Markdown links can be checked without interpreting content as instructions.
      for (const link of markdown) {
        const target = link.split('#')[0];
        if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;
        let decoded: string;
        try { decoded = decodeURIComponent(target); } catch { issues.push({ path: relative, detail: `Invalid link: ${target}` }); continue; }
        const absolute = path.resolve(path.dirname(file), decoded);
        const dest = path.relative(root, absolute).split(path.sep).join('/');
        try {
          const p = filePath(root, dest);
          if (!fs.existsSync(p)) throw new Error('missing');
        } catch { issues.push({ path: relative, detail: `Missing or excluded link: ${target}` }); }
      }
    }
  };
  visit(root);
  // An article is an active non-index Markdown file under the wiki's article tree.
  const articles = new Set([...documents.keys()].filter((p) => p.startsWith('wiki/') && !/(?:^|\/)_(?:index)\.md$/i.test(p)));
  const byName = new Map<string, string[]>();
  for (const document of documents.keys()) {
    const name = path.posix.basename(document).replace(/\.md$/i, '').toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), document]);
  }
  const referenced = new Set<string>();
  const indexed = new Map<string, Set<string>>();
  for (const [from, links] of documents) {
    const index = /(?:^|\/)_index\.md$/i.test(from);
    const record = (target: string) => {
      if (!articles.has(target) || target === from) return;
      if (index) {
        const entries = indexed.get(from) ?? new Set<string>();
        entries.add(target); indexed.set(from, entries);
      } else referenced.add(target);
    };
    for (const link of links.markdown) {
      const name = link.split('#')[0];
      if (!name || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(name)) continue;
      try {
        const decoded = decodeURIComponent(name);
        record(path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded)));
      } catch { /* Invalid links were already reported above. */ }
    }
    for (const link of links.wiki) {
      const name = link.split('#')[0].trim();
      if (!name) continue;
      if (name.startsWith('/') || name.includes('\\')) { issues.push({ path: from, detail: `Invalid wiki link: ${name}` }); continue; }
      const target = name.toLowerCase().endsWith('.md') ? name : `${name}.md`;
      const direct = [path.posix.normalize(path.posix.join(path.posix.dirname(from), target)), path.posix.normalize(target), path.posix.normalize(`wiki/${target}`)].find((p) => documents.has(p));
      const matches = direct ? [direct] : target.includes('/') ? [] : (byName.get(path.posix.basename(target, '.md').toLowerCase()) ?? []);
      if (matches.length === 1) record(matches[0]);
      else if (matches.length > 1) issues.push({ path: from, detail: `Ambiguous wiki link: ${name}` });
      else issues.push({ path: from, detail: `Missing or excluded wiki link: ${name}` });
    }
  }
  // Do not declare partial scans complete or draw global graph conclusions from them.
  if (!truncated) for (const article of articles) {
    if (!referenced.has(article)) issues.push({ path: article, detail: 'Article has no incoming non-index links' });
    const index = path.posix.join(path.posix.dirname(article), '_index.md');
    if (documents.has(index) && !indexed.get(index)?.has(article)) issues.push({ path: index, detail: `Article missing from index: ${article}` });
  }
  return { checked, issues, truncated };
}
