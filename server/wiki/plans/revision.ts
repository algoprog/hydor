// Preserve a reviewed plan revision before replacing the active document.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readWiki, wikiHash, withWikiWriteLock } from '../core.ts';
import { wikiFileActive } from '../knowledge/bindings.ts';
import { secretIn } from '../../memory/secrets.ts';

interface RevisionInput { path: string; content: string; expectedSha256: string; reason: string; authorization: string }
export interface RevisionPreview {
  path: string; original: string; originalSha256: string; content: string; documentId: string;
  revision: number; snapshot: string; reason: string; authorization: string; sha256: string;
}
const OWNED = ['document_id', 'document_kind', 'revision', 'revision_date', 'change_reason', 'authorization_ref', 'previous_revision_ref'];

/** Identify helper-owned top-level fields in either common quoted or unquoted YAML form. */
function ownedKey(line: string): string | undefined {
  const match = /^(?:"([A-Za-z_]+)"|'([A-Za-z_]+)'|([A-Za-z_]+))\s*:/.exec(line);
  const key = match?.[1] ?? match?.[2] ?? match?.[3];
  return key && OWNED.includes(key) ? key : undefined;
}

/** Read only simple top-level lifecycle values and fail closed for ambiguous metadata. */
function parse(text: string): { header: string[]; body: string; meta: Record<string, string> } {
  // Normalize line endings for metadata interpretation; the original snapshot remains byte-exact.
  text = text.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { header: [], body: text, meta: {} };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) throw new Error('Invalid plan frontmatter');
  const header = text.slice(4, end).split('\n');
  const meta: Record<string, string> = {};
  for (const line of header) {
    if (/^\s*<<\s*:/.test(line)) throw new Error('Ambiguous plan metadata');
    const m = /^(?:"(document_id|document_kind|document_status|revision)"|'(document_id|document_kind|document_status|revision)'|(document_id|document_kind|document_status|revision))\s*:\s*(.*?)\s*$/.exec(line);
    if (!m) {
      if (/^\s*["']?(?:document_id|document_kind|document_status|revision)["']?\s*:/.test(line)) throw new Error('Ambiguous plan metadata');
      continue;
    }
    const key = m[1] ?? m[2] ?? m[3];
    if (key in meta) throw new Error('Duplicate plan metadata');
    const raw = m[4];
    let value: unknown;
    if (raw.startsWith('"')) {
      const quoted = /^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/.exec(raw);
      if (!quoted) throw new Error('Ambiguous plan metadata');
      try { value = JSON.parse(quoted[1]); } catch { throw new Error('Ambiguous plan metadata'); }
    }
    else if (raw.startsWith("'")) {
      const single = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(raw);
      if (!single) throw new Error('Ambiguous plan metadata');
      value = single[1].replace(/''/g, "'");
    } else value = raw.replace(/\s+#.*$/, '').trim();
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) throw new Error('Ambiguous plan metadata');
    meta[key] = value;
  }
  return { header, body: text.slice(end + 5), meta };
}

/** Prepare a byte-bound, read-only proposal with stable identifiers and exact displayed replacement. */
export function previewRevision(root: string, input: RevisionInput): RevisionPreview {
  const relative = typeof input.path === 'string' ? input.path : '';
  if (!/^output\/projects\/(?!\.)(?:[^/]+\/)+[^/]+\.md$/i.test(relative) || relative.split('/').some((part) => !part || part.startsWith('.') || part === '..') || /(?:^|\/)(?:_index|WHY)\.md$/i.test(relative) || /(?:^|[-_])(?:evidence|nachweise|register|status)(?:[-_.]|$)/i.test(path.posix.basename(relative))) throw new Error('Choose an active project plan');
  if (!wikiFileActive(root, path.resolve(root, relative))) throw new Error('Choose an active project plan');
  const original = readWiki(root, relative);
  if (!/^[a-f0-9]{64}$/.test(String(input.expectedSha256 ?? '')) || original.sha256 !== input.expectedSha256) throw new Error('Plan changed; read it again');
  const bytes = fs.readFileSync(path.join(root, relative));
  if (wikiHash(bytes) !== original.sha256) throw new Error('Plan bytes cannot be safely revised');
  const replacement = typeof input.content === 'string' ? input.content : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const authorization = typeof input.authorization === 'string' ? input.authorization.trim() : '';
  if (!replacement.trim() || Buffer.byteLength(replacement) > 60_000 || replacement.includes('\0') || secretIn(replacement)) throw new Error('Provide bounded plan text without credentials');
  if (!reason || !authorization || reason.length > 500 || authorization.length > 500 || /[\r\n\0]/.test(reason + authorization) || secretIn(reason + authorization)) throw new Error('Provide a safe reason and authorization source');
  const old = parse(original.content), next = parse(replacement);
  if (old.meta.document_kind && old.meta.document_kind !== 'plan') throw new Error('The selected document is not a plan');
  if (next.meta.document_kind && next.meta.document_kind !== 'plan') throw new Error('The replacement must remain a plan');
  if (['archived', 'superseded', 'retired'].includes(String(next.meta.document_status ?? '').toLowerCase())) throw new Error('The replacement must remain active');
  const revision = Number(old.meta.revision ?? '1');
  if (!Number.isSafeInteger(revision) || revision < 1 || revision >= 999999) throw new Error('Invalid plan revision');
  const documentId = old.meta.document_id ?? `DOC-${wikiHash(relative).slice(0, 12)}`;
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(documentId) || (next.meta.document_id && next.meta.document_id !== documentId)) throw new Error('Plan identity cannot change');
  const substantive = (v: ReturnType<typeof parse>) => `${v.header.filter((line) => !ownedKey(line)).join('\n')}\n${v.body}`;
  if (substantive(old) === substantive(next)) throw new Error('The plan has no substantive changes');
  // A revision must not silently discard established work-item identifiers or an in-document register.
  const ids = new Set(old.body.match(/\b(?:WP|WI|REQ)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g) ?? []);
  const nextIds = new Set(next.body.match(/\b(?:WP|WI|REQ)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g) ?? []);
  if ([...ids].some((id) => !nextIds.has(id))) throw new Error('Keep the existing work item identifiers');
  const register = /^#{1,4}\s+(execution(?:\s+control|\s+tracking)?|evidence|implementation\s+status|umsetzungskontrolle|nachweisregister)\s*$/gim;
  const headings = [...old.body.matchAll(register)].map((m) => m[1].toLowerCase());
  const nextHeadings = new Set([...next.body.matchAll(register)].map((m) => m[1].toLowerCase()));
  if (headings.some((heading) => !nextHeadings.has(heading))) throw new Error('Keep the existing execution register');
  const registerLink = /\]\(([^)\n]*(?:evidence|nachweise|execution)[^)\n]*\.md(?:#[^)]*)?)\)/gi;
  const links = [...old.body.matchAll(registerLink)].map((m) => m[1]);
  const nextLinks = new Set([...next.body.matchAll(registerLink)].map((m) => m[1]));
  if (links.some((link) => !nextLinks.has(link))) throw new Error('Keep the existing execution register');
  const snapshot = `output/projects/.archive/revision-${wikiHash(documentId).slice(0, 12)}-r${String(revision).padStart(6, '0')}`;
  // Stamp only lifecycle fields; leave the supplied body and all other frontmatter intact.
  const header = next.header.filter((line) => !ownedKey(line));
  const fields: Record<string, string | number> = { document_id: documentId, document_kind: 'plan', revision: revision + 1, revision_date: new Date().toISOString().slice(0, 10), change_reason: reason, authorization_ref: authorization, previous_revision_ref: `${snapshot}/record.json` };
  const stamped = `---\n${header.length ? header.join('\n') + '\n' : ''}${Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n${next.body}`;
  const proposal = { path: relative, original: original.content, originalSha256: original.sha256, content: stamped, documentId, revision, snapshot, reason, authorization };
  return { ...proposal, sha256: wikiHash(JSON.stringify(proposal)) };
}

/** Create only the expected directory chain; never follow links in a historical destination. */
function archiveDir(root: string): string {
  let current = root;
  for (const part of ['output', 'projects', '.archive']) {
    current = path.join(current, part);
    try { fs.mkdirSync(current, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const st = fs.lstatSync(current);
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('Unsafe wiki revision directory');
  }
  return current;
}

/** Probe write access without truncation or writing; mode bits alone may be synthetic on network mounts. */
function canOpenForWrite(file: string): boolean {
  try {
    const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW ?? 0));
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (['EACCES', 'EPERM', 'EROFS'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
}

/** Use effective read-only permissions, or the native macOS immutable flag when chmod is insufficient. */
function protect(file: string): 'readonly_permissions' | 'immutable_flag' {
  try { fs.chmodSync(file, 0o444); } catch { /* Try the platform immutable flag below. */ }
  if (!(fs.statSync(file).mode & 0o222) && !canOpenForWrite(file)) return 'readonly_permissions';
  if (process.platform === 'darwin') {
    const result = spawnSync('/usr/bin/chflags', ['uchg', file], { stdio: 'ignore' });
    const flags = spawnSync('/usr/bin/stat', ['-f', '%Sf', file], { encoding: 'utf8' });
    if (result.status === 0 && flags.status === 0 && /(?:^|,)uchg(?:,|\s|$)/.test(flags.stdout.trim()) && !canOpenForWrite(file)) return 'immutable_flag';
  }
  throw new Error('Revision snapshot cannot be protected');
}

/** A lock older than this is abandoned (a revision takes well under a minute). */
const STALE_LOCK_MS = 5 * 60_000;

/** Is a process with this id still running here? Unknown counts as running. */
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}

/** Take the revision lock, clearing one that is stale (older than a few minutes, or left by a process that is gone). */
function takeLock(lock: string): number {
  for (let attempt = 0; ; attempt++) {
    try {
      const fd = fs.openSync(lock, 'wx', 0o600);
      fs.writeSync(fd, `${process.pid}\n${Date.now()}\n`);
      return fd;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (attempt > 0 || !staleLock(lock)) throw new Error('Wiki revision is locked by another writer');
      try { fs.unlinkSync(lock); } catch { /* Someone else cleared it: try once more. */ }
    }
  }
}

function staleLock(lock: string): boolean {
  try {
    const st = fs.lstatSync(lock);
    if (!st.isFile()) return false;
    if (Date.now() - st.mtimeMs > STALE_LOCK_MS) return true;
    const pid = Number(/^(\d+)\n/.exec(fs.readFileSync(lock, 'utf8'))?.[1]);
    return Number.isInteger(pid) && pid > 0 && pid !== process.pid && !alive(pid);
  } catch { return false; }
}

/** Remove a snapshot folder, including files the protection made read-only (or immutable on macOS). */
function removeSnapshot(dir: string): void {
  try {
    if (process.platform === 'darwin') spawnSync('/usr/bin/chflags', ['-R', 'nouchg', dir], { stdio: 'ignore' });
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* Best effort: the next attempt clears what is left, see clearLeftovers. */ }
}

/**
 * What a failed or interrupted revision can leave: a half-built temporary folder, or a finished snapshot of a plan
 * that was never replaced (its record names the very bytes the plan still has). Both are removed, so that a plan never
 * becomes impossible to revise; a snapshot of anything else is history and is never touched.
 */
function clearLeftovers(archive: string, finalDir: string, currentSha: string): void {
  for (const entry of fs.readdirSync(archive, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('.tmp-revision-')) continue;
    const dir = path.join(archive, entry.name);
    try { if (Date.now() - fs.lstatSync(dir).mtimeMs > STALE_LOCK_MS) removeSnapshot(dir); } catch { /* Gone already. */ }
  }
  let st: fs.Stats;
  try { st = fs.lstatSync(finalDir); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (!st.isDirectory()) return;
  try {
    const record = JSON.parse(fs.readFileSync(path.join(finalDir, 'record.json'), 'utf8')) as { sha256?: string };
    const copy = wikiHash(fs.readFileSync(path.join(finalDir, 'document.md')));
    if (record.sha256 === currentSha && copy === currentSha) removeSnapshot(finalDir);
  } catch { /* Not a leftover we can recognise: it stays, and the revision is refused below. */ }
}

/** Save exact original bytes under both shared locks, then atomically replace the active file. */
export function applyRevision(root: string, input: RevisionInput, expectedPreview: string): { path: string; sha256: string; revision: number; snapshot: string; protection: string } {
  return withWikiWriteLock(root, (apply) => {
    // Reject stale previews before creating even the archive directory.
    if (previewRevision(root, input).sha256 !== expectedPreview) throw new Error('Plan preview changed; review it again');
    const archive = archiveDir(root);
    const lock = path.join(archive, '.revision.lock');
    const fd = takeLock(lock);
    let temporary: string | undefined;
    let placed: string | undefined;
    try {
      const preview = previewRevision(root, input);
      if (preview.sha256 !== expectedPreview) throw new Error('Plan preview changed; review it again');
      const snapshot = path.join(root, preview.snapshot);
      clearLeftovers(archive, snapshot, preview.originalSha256);
      // An existing snapshot is history: it is never read, reused or replaced.
      if (fs.existsSync(snapshot)) throw new Error('A snapshot of this revision already exists');
      const original = fs.readFileSync(path.join(root, preview.path));
      if (wikiHash(original) !== preview.originalSha256) throw new Error('Plan changed; read it again');
      // Build the whole snapshot out of sight, protect it, verify it, and only then give it its name.
      temporary = fs.mkdtempSync(path.join(archive, '.tmp-revision-'));
      const doc = path.join(temporary, 'document.md'), why = path.join(temporary, 'WHY.md'), recordPath = path.join(temporary, 'record.json');
      fs.writeFileSync(doc, original, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(why, `# Historical revision ${preview.revision}\n\nPreserve the replaced state of ${preview.documentId}; not active project context.\n`, { flag: 'wx', mode: 0o600 });
      const docProtection = protect(doc), whyProtection = protect(why);
      if (docProtection !== whyProtection) throw new Error('Revision snapshot protection differs between files');
      const record = { schema: 'wiki-document-revision/v1', document_id: preview.documentId, kind: 'plan', revision: preview.revision, original_path: preview.path, original_link_base: path.posix.dirname(preview.path), sha256: preview.originalSha256, captured_at: new Date().toISOString(), change_reason: preview.reason, authorization_ref: preview.authorization, superseded_by_revision: preview.revision + 1, protection: docProtection };
      fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      if (protect(recordPath) !== docProtection) throw new Error('Revision snapshot protection differs between files');
      if (wikiHash(fs.readFileSync(doc)) !== preview.originalSha256) throw new Error('Revision snapshot verification failed');
      fs.renameSync(temporary, snapshot);
      placed = snapshot;
      temporary = undefined;
      // applyOne rechecks the source hash immediately before its atomic rename.
      apply({ path: preview.path, content: preview.content, expectedSha256: preview.originalSha256 });
      placed = undefined;
      return { path: preview.path, sha256: wikiHash(preview.content), revision: preview.revision + 1, snapshot: preview.snapshot, protection: docProtection };
    } finally {
      // Whatever went wrong, no half-made or unused snapshot stays to block the next attempt.
      if (temporary) removeSnapshot(temporary);
      if (placed) removeSnapshot(placed);
      fs.closeSync(fd);
      try { fs.unlinkSync(lock); } catch { /* Already cleared. */ }
    }
  });
}
