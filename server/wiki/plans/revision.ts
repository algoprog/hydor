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

/** The header without the fields the app owns (and the indented lines that continue them): the app stamps those itself. */
function withoutOwned(header: string[]): string[] {
  const kept: string[] = [];
  let skipping = false;
  for (const line of header) {
    if (ownedKey(line)) { skipping = true; continue; }
    if (skipping && /^[ \t]/.test(line)) continue;
    skipping = false;
    kept.push(line);
  }
  return kept;
}

type Who = 'the current plan' | 'the replacement';
/** The statuses that end a plan: a replacement cannot carry one. */
const ENDED = ['archived', 'superseded', 'retired'];

/** A found value for an error message: one line, cut to about 60 characters. */
function shown(value: string): string {
  const one = value.replace(/\s+/g, ' ').trim();
  return `"${one.length > 60 ? `${one.slice(0, 59)}…` : one}"`;
}

/**
 * Read the few top-level values the lifecycle needs and fail closed for ambiguous metadata, with an error that names the
 * document, the field, the line in the file and what is allowed. The current plan is read strictly (its document_id,
 * document_kind and revision feed the new stamp); in the replacement only document_status is read, because the fields the
 * app owns are ignored whatever they say.
 */
function parse(text: string, who: Who): { header: string[]; body: string; meta: Record<string, string>; at: Record<string, number> } {
  // Normalize line endings for metadata interpretation; the original snapshot remains byte-exact.
  text = text.replace(/\r\n/g, '\n');
  const Who = who[0].toUpperCase() + who.slice(1);
  const mine = who === 'the current plan' ? "The current plan's" : "The replacement's";
  if (!text.startsWith('---\n')) return { header: [], body: text, meta: {}, at: {} };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) throw new Error(`${mine} frontmatter opens with --- on line 1 but has no closing --- line.`);
  const header = text.slice(4, end).split('\n');
  const meta: Record<string, string> = {};
  const at: Record<string, number> = {};
  const keys = (who === 'the current plan' ? ['document_id', 'document_kind', 'document_status', 'revision'] : ['document_status']).join('|');
  const strict = new RegExp(`^(?:"(${keys})"|'(${keys})'|(${keys}))\\s*:\\s*(.*?)\\s*$`);
  const loose = new RegExp(`^\\s*["']?(?:${keys})["']?\\s*:`);
  header.forEach((line, i) => {
    // The frontmatter starts after line 1's ---, so header line i is file line i + 2.
    const where = `${Who}, line ${i + 2}`;
    if (/^\s*<<\s*:/.test(line)) throw new Error(`${where}: YAML merge keys (<<:) are not allowed in plan metadata.`);
    const m = strict.exec(line);
    if (!m) {
      if (loose.test(line)) throw new Error(`${where}: write ${new RegExp(keys).exec(line)?.[0] ?? 'the field'} at the start of the line as "name: value" (found ${shown(line)}).`);
      return;
    }
    const key = m[1] ?? m[2] ?? m[3];
    if (key in at) throw new Error(`${where}: ${key} appears twice (first on line ${at[key]}).`);
    let raw = m[4];
    if (raw.startsWith('#')) raw = '';
    let value: string;
    if (raw.startsWith('"')) {
      const quoted = /^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/.exec(raw);
      if (!quoted) throw new Error(`${where}: ${key} has a quote that does not close on this line; write the whole value on one line (found ${shown(raw)}).`);
      try { value = JSON.parse(quoted[1]) as string; } catch { throw new Error(`${where}: ${key} has an invalid escape inside its quotes (found ${shown(raw)}).`); }
    } else if (raw.startsWith("'")) {
      const single = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(raw);
      if (!single) throw new Error(`${where}: ${key} has a quote that does not close on this line; write the whole value on one line (found ${shown(raw)}).`);
      value = single[1].replace(/''/g, "'");
    } else value = raw.replace(/\s+#.*$/, '').trim();
    if (typeof value !== 'string' || !value) throw new Error(`${where}: ${key} is empty; write its value after the colon or remove the line.`);
    if (/[\x00-\x1f\x7f]/.test(value)) throw new Error(`${where}: ${key} must be one line of plain text without control characters (found ${shown(value)}).`);
    if (key === 'document_status') {
      if (value.length > 80) throw new Error(`${where}: document_status is longer than 80 characters (found ${shown(value)}).`);
      if (/^[|>][+-]?\d*$/.test(value)) throw new Error(`${where}: document_status must be written on this line, not as a | or > block (found ${shown(value)}).`);
    } else if (key === 'revision') {
      if (!/^\d+$/.test(value)) throw new Error(`${where}: revision must be a whole number (found ${shown(value)}).`);
    } else if (key === 'document_id') {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(value)) throw new Error(`${where}: document_id must start with a letter and use only letters, digits, - and _, up to 48 characters (found ${shown(value)}).`);
    }
    meta[key] = value;
    at[key] = i + 2;
  });
  return { header, body: text.slice(end + 5), meta, at };
}

/** Why a path is not an active project plan, in words a model can act on. */
function notAPlan(relative: string): string | undefined {
  const base = path.posix.basename(relative);
  if (!/^output\/projects\/(?!\.)(?:[^/]+\/)+[^/]+\.md$/i.test(relative) || relative.split('/').some((part) => !part || part.startsWith('.') || part === '..')) return `The path must be output/projects/<plan>/<file>.md, with no hidden or .. parts (found ${shown(relative)}).`;
  if (/^(?:_index|WHY)\.md$/i.test(base)) return `${shown(relative)} is an ${base} file, not a plan: choose the plan file itself (output/projects/<plan>/<file>.md).`;
  if (/(?:^|[-_])(?:evidence|nachweise|register|status)(?:[-_.]|$)/i.test(base)) return `${shown(relative)} is named like an evidence, register or status file, not a plan: choose the plan file itself (output/projects/<plan>/<file>.md).`;
  return undefined;
}

/** Prepare a byte-bound, read-only proposal with stable identifiers and exact displayed replacement. */
export function previewRevision(root: string, input: RevisionInput): RevisionPreview {
  const relative = typeof input.path === 'string' ? input.path : '';
  const wrongPath = notAPlan(relative);
  if (wrongPath) throw new Error(wrongPath);
  if (!wikiFileActive(root, path.resolve(root, relative))) throw new Error(`${shown(relative)} is not an active plan: it is not in the project's wiki, or it is archived or retired. Check the path with wiki_read.`);
  const original = readWiki(root, relative);
  if (!/^[a-f0-9]{64}$/.test(String(input.expectedSha256 ?? ''))) throw new Error('expectedSha256 must be the 64-character sha256 that wiki_read gave for the plan.');
  if (original.sha256 !== input.expectedSha256) throw new Error('The plan changed since you read it: wiki_read it again for its current sha256 and redo the change.');
  const bytes = fs.readFileSync(path.join(root, relative));
  if (wikiHash(bytes) !== original.sha256) throw new Error('Plan bytes cannot be safely revised');
  const replacement = typeof input.content === 'string' ? input.content : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const authorization = typeof input.authorization === 'string' ? input.authorization.trim() : '';
  if (!replacement.trim()) throw new Error('The replacement is empty: send the complete new plan text in content.');
  if (Buffer.byteLength(replacement) > 60_000) throw new Error(`The replacement is over 60,000 bytes (it has ${Buffer.byteLength(replacement)}): shorten the plan.`);
  if (replacement.includes('\0')) throw new Error('The replacement contains a null character: remove it.');
  if (secretIn(replacement)) throw new Error('The replacement seems to hold a credential (a key, token or password): remove it from the plan.');
  for (const [name, text] of [['reason', reason], ['authorization', authorization]] as const) {
    if (!text) throw new Error(`The ${name} is missing: ${name === 'reason' ? 'say in a sentence why the plan changes' : 'name the user request or source that asked for the change'}.`);
    if (text.length > 500) throw new Error(`The ${name} is over 500 characters (it has ${text.length}): shorten it.`);
    if (/[\r\n\0]/.test(text)) throw new Error(`The ${name} must be one line: remove the line breaks.`);
    if (secretIn(text)) throw new Error(`The ${name} seems to hold a credential (a key, token or password): remove it.`);
  }
  const old = parse(original.content, 'the current plan'), next = parse(replacement, 'the replacement');
  if (old.meta.document_kind && old.meta.document_kind !== 'plan') throw new Error(`The current plan, line ${old.at.document_kind}: document_kind is ${shown(old.meta.document_kind)}, so it is not a plan; only a plan (document_kind: plan) can be revised here.`);
  const status = String(next.meta.document_status ?? '');
  if (ENDED.includes(status.toLowerCase())) throw new Error(`The replacement, line ${next.at.document_status}: document_status ${shown(status)} ends a plan, so a revision cannot use it. Write another status (such as "In progress") or leave the line out.`);
  const revision = Number(old.meta.revision ?? '1');
  if (!Number.isSafeInteger(revision) || revision < 1 || revision >= 999999) throw new Error(`The current plan, line ${old.at.revision}: revision must be a whole number from 1 to 999998 (found ${shown(old.meta.revision ?? '')}).`);
  // The plan keeps its identity; the replacement's own document_id and document_kind are ignored (the app stamps both).
  const documentId = old.meta.document_id ?? `DOC-${wikiHash(relative).slice(0, 12)}`;
  const substantive = (v: ReturnType<typeof parse>) => `${withoutOwned(v.header).join('\n')}\n${v.body}`;
  if (substantive(old) === substantive(next)) throw new Error('The replacement has no changes from the current plan beyond the fields the app sets itself: change the plan itself.');
  // A revision must not silently discard established work-item identifiers or an in-document register.
  const idPattern = /\b(?:WP|WI|REQ)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g;
  const ids = [...new Set(old.body.match(idPattern) ?? [])];
  const nextIds = new Set(next.body.match(idPattern) ?? []);
  const lost = ids.filter((id) => !nextIds.has(id));
  if (lost.length) throw new Error(`The replacement drops work item ids the plan has: ${lost.slice(0, 10).join(', ')}${lost.length > 10 ? ` and ${lost.length - 10} more` : ''}. Keep every id, finished items too.`);
  const register = /^#{1,4}\s+(execution(?:\s+control|\s+tracking)?|evidence|implementation\s+status|umsetzungskontrolle|nachweisregister)\s*$/gim;
  const headings = [...old.body.matchAll(register)].map((m) => m[1]);
  const nextHeadings = new Set([...next.body.matchAll(register)].map((m) => m[1].toLowerCase()));
  const lostHeading = headings.find((heading) => !nextHeadings.has(heading.toLowerCase()));
  if (lostHeading) throw new Error(`The replacement drops the plan's execution register heading ${shown(lostHeading)}. Keep it as it is.`);
  const registerLink = /\]\(([^)\n]*(?:evidence|nachweise|execution)[^)\n]*\.md(?:#[^)]*)?)\)/gi;
  const links = [...old.body.matchAll(registerLink)].map((m) => m[1]);
  const nextLinks = new Set([...next.body.matchAll(registerLink)].map((m) => m[1]));
  const lostLink = links.find((link) => !nextLinks.has(link));
  if (lostLink) throw new Error(`The replacement drops the link to the execution register (${shown(lostLink).slice(1, -1)}). Keep it as it is.`);
  const snapshot = `output/projects/.archive/revision-${wikiHash(documentId).slice(0, 12)}-r${String(revision).padStart(6, '0')}`;
  // Stamp only lifecycle fields; leave the supplied body and all other frontmatter intact.
  const header = withoutOwned(next.header);
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

/** Remove a snapshot folder; one an older version made immutable on macOS (chflags uchg) is unlocked first. */
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
export function applyRevision(root: string, input: RevisionInput, expectedPreview: string): { path: string; sha256: string; revision: number; snapshot: string } {
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
      if (wikiHash(original) !== preview.originalSha256) throw new Error('The plan changed since you read it: wiki_read it again for its current sha256 and redo the change.');
      // Build the whole snapshot out of sight (ordinary files, the document's checksum in record.json), verify it, and only then give it its name.
      temporary = fs.mkdtempSync(path.join(archive, '.tmp-revision-'));
      const doc = path.join(temporary, 'document.md'), why = path.join(temporary, 'WHY.md'), recordPath = path.join(temporary, 'record.json');
      fs.writeFileSync(doc, original, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(why, `# Historical revision ${preview.revision}\n\nPreserve the replaced state of ${preview.documentId}; not active project context.\n`, { flag: 'wx', mode: 0o600 });
      const record = { schema: 'wiki-document-revision/v1', document_id: preview.documentId, kind: 'plan', revision: preview.revision, original_path: preview.path, original_link_base: path.posix.dirname(preview.path), sha256: preview.originalSha256, captured_at: new Date().toISOString(), change_reason: preview.reason, authorization_ref: preview.authorization, superseded_by_revision: preview.revision + 1 };
      fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      if (wikiHash(fs.readFileSync(doc)) !== preview.originalSha256) throw new Error('Revision snapshot verification failed');
      fs.renameSync(temporary, snapshot);
      placed = snapshot;
      temporary = undefined;
      // applyOne rechecks the source hash immediately before its atomic rename.
      apply({ path: preview.path, content: preview.content, expectedSha256: preview.originalSha256 });
      placed = undefined;
      return { path: preview.path, sha256: wikiHash(preview.content), revision: preview.revision + 1, snapshot: preview.snapshot };
    } finally {
      // Whatever went wrong, no half-made or unused snapshot stays to block the next attempt.
      if (temporary) removeSnapshot(temporary);
      if (placed) removeSnapshot(placed);
      fs.closeSync(fd);
      try { fs.unlinkSync(lock); } catch { /* Already cleared. */ }
    }
  });
}
