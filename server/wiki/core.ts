// File-backed wiki primitives: paths stay in one active wiki and writes use a shared lock and expected hashes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_BYTES = 4 * 1024 * 1024;
const ARCHIVES = new Set(['.archive', '.history']);
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

/** Resolve a bounded active file path without following wiki-internal symlinks or archives. */
function filePath(root: string, relative: string, missing = false): string {
  if (!relative || relative.includes('\0') || relative.includes('\\') || path.posix.isAbsolute(relative)) throw new Error('Expected a relative wiki path');
  const parts = relative.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || ARCHIVES.has(p.toLowerCase()) || p === LOCK)) throw new Error('Invalid or archived wiki path');
  const target = path.resolve(root, ...parts);
  noSymlinks(root, target);
  if (fs.existsSync(target)) {
    if (!fs.statSync(target).isFile()) throw new Error('Expected a wiki file');
    if (target.toLowerCase().endsWith('.md') && !activeWikiDocument(readText(target))) throw new Error('Retired wiki documents are excluded');
  } else if (!missing) throw new Error(`Wiki file does not exist: ${relative}`);
  return target;
}

/** Read bounded UTF-8 content without accepting binary files. */
function readText(file: string): string {
  const st = fs.statSync(file);
  if (st.size > MAX_BYTES) throw new Error('Wiki file is too large');
  const data = fs.readFileSync(file);
  if (data.includes(0)) throw new Error('Wiki file is binary');
  return new TextDecoder('utf-8', { fatal: true }).decode(data);
}

/** Resolve an existing hub, a project binding or a named active registry entry. */
export function resolveWiki(o: { hub: string; cwd: string; projectWiki?: string; name?: string }): string {
  const expand = (p: string) => p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
  const hub = path.resolve(expand(o.hub));
  let candidate: string;
  if (o.name && o.name !== 'hub') {
    const registry = JSON.parse(readText(path.join(hub, 'wikis.json'))) as { wikis?: Record<string, { path?: string; status?: string }> };
    const entry = registry.wikis?.[o.name];
    if (!entry) throw new Error('Wiki is not registered');
    if (['archived', 'superseded', 'retired'].includes(String(entry.status ?? '').toLowerCase())) throw new Error('Archived wikis are excluded');
    const spec = expand((entry.path ?? `topics/${o.name}`).replace('<HUB>', hub));
    candidate = path.resolve(hub, spec);
  } else if (!o.name && o.projectWiki) candidate = path.resolve(o.cwd, expand(o.projectWiki));
  else candidate = hub;
  if (candidate.split(path.sep).some((p) => ARCHIVES.has(p.toLowerCase()))) throw new Error('Archived wikis are excluded');
  if (!fs.statSync(candidate).isDirectory()) throw new Error('Wiki root is not a directory');
  const root = fs.realpathSync(candidate);
  const config = path.join(root, 'config.md');
  noSymlinks(root, config);
  if (fs.existsSync(config) && !activeWikiDocument(readText(config))) throw new Error('Retired wiki is excluded');
  return root;
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
  return locked(root, () => { applyOne(root, changes[0]); return { paths: [changes[0].path] }; });
}

/** Preserve exact text once while retaining a distinct, immutable note for each origin. */
export function ingestWikiSource(root: string, content: string, origin: string): { path: string; originalPath: string; sha256: string; existing: boolean } {
  if (!origin.trim() || /[\r\n]/.test(origin) || origin.length > 2000) throw new Error('A single-line source origin is required');
  // Origin metadata must never persist credentials embedded in a source URL.
  if (/^https?:\/\//i.test(origin)) {
    const url = new URL(origin);
    if (url.username || url.password || [...url.searchParams.keys()].some((key) => /token|secret|password|key|signature|auth/i.test(key))) throw new Error('Remove credentials from the source URL');
  }
  if (!content.trim() || Buffer.byteLength(content) > MAX_BYTES - 4096 || content.includes('\0')) throw new Error('A bounded text source is required');
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
      const header = `---\ntitle: ${JSON.stringify('Source ' + sha256.slice(0, 12))}\nsource: ${JSON.stringify(origin)}\ntype: articles\ningested: ${day}\ntags: []\nsummary: ${JSON.stringify('Source preserved at ' + originalPath)}\nsource_sha256: ${sha256}\n---\n\n`;
      applyOne(root, { path: relative, content: header + content, expectedSha256: null });
    } else {
      const previous = readText(note);
      if (!previous.includes(`source_sha256: ${sha256}\n`) || !previous.includes(`source: ${JSON.stringify(origin)}\n`)) throw new Error('Source note conflict');
    }
    return { path: relative, originalPath, sha256, existing };
  });
}

/** Preserve document bytes once and keep a distinct extracted Markdown source note for each origin. */
export function ingestWikiDocument(root: string, bytes: Buffer, extension: string, origin: string, extracted: { text: string; format: string; note?: string }): { path: string; originalPath: string; sha256: string; existing: boolean } {
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
      const header = `---\ntitle: ${JSON.stringify('Source ' + sha256.slice(0, 12))}\nsource: ${JSON.stringify(origin)}\ntype: articles\ningested: ${day}\ntags: []\nsummary: ${JSON.stringify('Extracted ' + extracted.format + ' document; original at ' + originalPath)}\nsource_sha256: ${sha256}\noriginal: ${JSON.stringify(originalPath)}\n---\n\n`;
      const warning = extracted.note ? `Extraction note: ${extracted.note.replace(/[\r\n]+/g, ' ')}\n\n` : '';
      applyOne(root, { path: relative, content: `${header}${warning}${extracted.text}\n`, expectedSha256: null });
    } else {
      const previous = readText(note);
      if (!previous.includes(`source_sha256: ${sha256}\n`) || !previous.includes(`source: ${JSON.stringify(origin)}\n`)) throw new Error('Source note conflict');
    }
    return { path: relative, originalPath, sha256, existing };
  });
}

/** Check active Markdown and local Markdown links without reading archived or symlinked trees. */
export function checkWiki(root: string): { checked: number; issues: { path: string; detail: string }[]; truncated: boolean } {
  const issues: { path: string; detail: string }[] = [];
  let checked = 0;
  let truncated = false;
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (checked >= 5000) { truncated = true; return; }
      if (entry.isSymbolicLink() || ARCHIVES.has(entry.name.toLowerCase()) || ['.git', LOCK, 'node_modules'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
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
      // Standard Markdown links can be checked without interpreting the article's content as instructions.
      for (const match of content.matchAll(/\]\(([^\s)]+)(?:\s+["'][^)]*["'])?\)/g)) {
        const target = match[1].split('#')[0];
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
  return { checked, issues, truncated };
}
