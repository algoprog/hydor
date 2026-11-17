// What each session was given of memory without asking, and what of it its agent then used. A session's refs
// (memory_given) say what is in its conversation or its instructions already, so nothing is given twice: `n:<id>`
// an entry (a note, a topic, a profile), `w:<path>` a wiki article's line, `p:<path>` a plan's line, `a:<dir>` an area
// of the project already looked up for the files its agent touched. They go when the conversation is condensed (Custom
// counts its condensings: `e:<epoch>`; Claude Code and Codex show a compaction in their timeline: `c:<when>`: what came
// before it), save the entries of the memory block in its instructions, which stay; and with the session.
// When a turn ends, a note given and not used yet counts as used once the agent cites it (#123), or its tools work on
// a file the note is anchored to or name what the note writes in backticks (index.ts).
import path from 'node:path';
import fs from 'node:fs';
import type { TimelineItem, ToolInfo } from '../../shared/types.ts';
import type { DB } from '../db.ts';
import { entries, markUsed, memorySchema, words } from './store.ts';

export const noteRef = (id: number) => `n:${id}`;
/** A Codex session is known by its run until its thread starts: what it was given at the start waits there. */
export const runRef = (runId: string) => `run:${runId}`;

/** The message a session started with, by its words: memory for it came with the start (`q:<hash>`). */
export function askRef(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of words(text).join(' ').slice(0, 2000)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return `q:${h.toString(36)}`;
}

/** The refs a session was given. */
export function givenRefs(db: DB, key: string): Set<string> {
  memorySchema(db);
  return new Set((db.prepare('select ref from memory_given where key = ?').all(key) as { ref: string }[]).map((r) => r.ref));
}

/** The entries among refs. */
export const idsOf = (refs: Iterable<string>): number[] => [...refs].flatMap((r) => (/^n:\d+$/.test(r) ? [Number(r.slice(2))] : []));

export function recordGiven(db: DB, key: string, refs: Iterable<string>, at = Date.now()) {
  const list = [...new Set(refs)];
  if (!list.length || !key) return;
  memorySchema(db);
  const put = db.prepare('insert or ignore into memory_given (key, ref, at) values (?, ?, ?)');
  db.transaction(() => list.forEach((r) => put.run(key, r, at)))();
}

export function dropGiven(db: DB, key: string, refs: Iterable<string>) {
  const list = [...refs];
  if (!list.length) return;
  memorySchema(db);
  const del = db.prepare('delete from memory_given where key = ? and ref = ?');
  db.transaction(() => list.forEach((r) => del.run(key, r)))();
}

export function clearGiven(db: DB, key: string) {
  memorySchema(db);
  db.prepare('delete from memory_given where key = ?').run(key);
}

/** What a run was given before its session had a key, moved to that key. */
export function moveGiven(db: DB, from: string, to: string) {
  if (!from || !to || from === to) return;
  memorySchema(db);
  db.transaction(() => {
    db.prepare('insert or ignore into memory_given (key, ref, at, used) select ?, ref, at, used from memory_given where key = ?').run(to, from);
    db.prepare('delete from memory_given where key = ?').run(from);
  })();
}

/**
 * The entries a memory block gives in full: its lines (a note, a topic, a profile; quoted material), not its index of
 * titles. The last [#id…] of each line is the entry's own (the text before it may name others).
 */
export function blockIds(text: string): number[] {
  const out: number[] = [];
  for (const l of text.split('\n')) {
    if (!l.startsWith('- ') && !l.startsWith('Profile: ')) continue;
    const all = [...l.matchAll(/\[#(\d+)[,\]]/g)];
    if (all.length) out.push(Number(all[all.length - 1][1]));
  }
  return [...new Set(out)];
}

/** The memory blocks a session's agent was given (store.ts keepBlock), by flavor. */
function blockRows(db: DB, key: string): { flavor: string; text: string }[] {
  memorySchema(db);
  return db.prepare('select flavor, text from memory_blocks where key = ?').all(key) as { flavor: string; text: string }[];
}

/**
 * A session's agent has this memory block in its instructions now (made or kept): its entries count as given. Those of
 * the blocks it had before and has no longer (another flavor, one remade after a rest) are not in view any more.
 * `before`: the session's blocks as they were before this one was kept.
 */
export function noteBlock(db: DB, key: string, text: string, before: { text: string }[]) {
  const now = new Set(blockIds(text));
  const gone = before.flatMap((b) => blockIds(b.text)).filter((id) => !now.has(id));
  dropGiven(db, key, gone.map(noteRef));
  recordGiven(db, key, [...now].map(noteRef));
}

/** The blocks a session has before one is kept (for noteBlock). */
export const blocksOf = (db: DB, key: string) => blockRows(db, key);

/**
 * Custom's conversation was condensed (`epoch` counts that): what was said with its messages is no longer in it, so
 * its refs go (its block is made again for the new epoch and noted then). True when they went.
 */
export function noteEpoch(db: DB, key: string, epoch: number): boolean {
  const refs = givenRefs(db, key);
  const was = [...refs].find((r) => r.startsWith('e:'));
  if (was === `e:${epoch}`) return false;
  if (was) clearGiven(db, key);
  recordGiven(db, key, [`e:${epoch}`]);
  return !!was;
}

/** A compaction in Claude Code's or Codex's timeline. */
const isCompaction = (it: TimelineItem) => it.kind === 'system' && /^(Conversation compacted|Context compacted)\b/.test(it.text);

/**
 * Claude Code or Codex condensed the conversation (a compaction in its timeline since `from` not seen before): what it
 * was given before that goes (what came after stays), save the entries of the blocks in its instructions, which stay.
 * True when that happened.
 */
export function seeCompactions(db: DB, key: string, items: TimelineItem[], from = 0): boolean {
  const refs = givenRefs(db, key);
  const fresh = items.slice(Math.max(0, from)).filter((it) => isCompaction(it) && !refs.has(`c:${it.ts ?? it.id}`));
  if (!fresh.length) return false;
  // When it happened (a compaction without a time: everything given so far).
  const until = Math.max(...fresh.map((it) => it.ts ?? Number.MAX_SAFE_INTEGER));
  db.prepare("delete from memory_given where key = ? and ref not like 'c:%' and at <= ?").run(key, until);
  recordGiven(db, key, [...fresh.map((it) => `c:${it.ts ?? it.id}`), ...blockRows(db, key).flatMap((b) => blockIds(b.text).map(noteRef))]);
  return true;
}

// ---- anchors (S2's memory_anchors: what file or folder of its project an entry is about) ---------------------------

const anchored = new WeakMap<DB, number>();

/** Whether entries have anchors here (the table is made by the anchors' upkeep); looked at again each minute until then. */
export function hasAnchors(db: DB): boolean {
  const at = anchored.get(db);
  if (at === Infinity) return true;
  if (at && Date.now() - at < 60_000) return false;
  const yes = !!db.prepare("select 1 from sqlite_master where type = 'table' and name = 'memory_anchors'").get();
  anchored.set(db, yes ? Infinity : Date.now());
  return yes;
}

/** Entries' anchors (repo-relative paths, a folder ending in /), sorted. */
export function anchorsOf(db: DB, ids: number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (!ids.length || !hasAnchors(db)) return out;
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    for (const r of db.prepare(`select entry, path from memory_anchors where entry in (${part.map(() => '?').join(',')}) order by entry, path`).all(...part) as { entry: number; path: string }[])
      out.set(r.entry, [...(out.get(r.entry) ?? []), r.path]);
  }
  return out;
}

// ---- what agents did with what they were given ---------------------------------------------------------------------

/** A step as text to look for names in: its title, what it was given and the files it changed (never its output). */
function stepText(t: ToolInfo): string {
  let input = '';
  try {
    input = typeof t.input === 'string' ? t.input : JSON.stringify(t.input ?? '');
  } catch {}
  return `${t.title ?? ''}\n${t.subtitle ?? ''}\n${input.slice(0, 20_000)}\n${(t.files ?? []).map((f) => `${f.path}${f.movePath ? `\n${f.movePath}` : ''}`).join('\n')}`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A name as a whole (not the end of a longer one: store.ts is not in restore.ts). */
const holds = (text: string, name: string) => text.includes(name) && new RegExp(`(?<![\\w.-])${escape(name)}(?![\\w-])`).test(text);
/** An agent cites a note by its number: #123 or [#123]. */
const cites = (text: string, id: number) => new RegExp(`(?<![\\w&/])#${id}(?!\\d)`).test(text);
/** What a note writes in backticks, 4 characters or more: a command, a name, a path. */
export const spansOf = (text: string) => [...text.matchAll(/`([^`\n]{4,160})`/g)].map((m) => m[1].trim()).filter((x) => x.length >= 4);

/** A path the steps name: in full, or by its file's name when that is long enough not to be any file's. */
function names(did: string, p: string): boolean {
  const clean = p.replace(/\/$/, '');
  if (!clean) return false;
  if (holds(did, clean)) return true;
  const base = path.posix.basename(clean);
  return !p.endsWith('/') && base.length >= 6 && holds(did, base);
}

/**
 * Notes given to a session and not used yet that the agent used in these timeline items (from `from` on): it cited
 * one, or its steps worked on a file one is anchored to or named what one writes in backticks. Each counts once per
 * session (until its conversation is condensed). Returns their ids.
 */
export function seeUses(db: DB, key: string, items: TimelineItem[], from = 0, now = Date.now()): number[] {
  memorySchema(db);
  const unused = idsOf((db.prepare("select ref from memory_given where key = ? and used = 0 and ref like 'n:%'").all(key) as { ref: string }[]).map((r) => r.ref));
  if (!unused.length) return [];
  let said = '';
  let did = '';
  for (const it of items.slice(Math.max(0, from))) {
    if (it.kind === 'assistant') said += `${it.text}\n`;
    else if (it.kind === 'tool') did += `${stepText(it.tool)}\n`;
    if (said.length + did.length > 400_000) break;
  }
  if (!said && !did) return [];
  const anchors = anchorsOf(db, unused);
  const used = entries(db, { ids: unused, status: 'all', limit: unused.length })
    .filter((e) => cites(said, e.id) || (anchors.get(e.id) ?? []).some((p) => names(did, p)) || spansOf(e.text).some((s) => did.includes(s)))
    .map((e) => e.id);
  if (!used.length) return [];
  const set = db.prepare('update memory_given set used = 1 where key = ? and ref = ?');
  db.transaction(() => used.forEach((id) => set.run(key, noteRef(id))))();
  markUsed(db, used, now);
  return used;
}

// ---- files an agent touched, for the notes about their area ---------------------------------------------------------

/** Files touched in a session since its last message, for the agents without a hook that says so at once (index.ts). */
const touched = new Map<string, Set<string>>();
const MAX_TOUCHED = 40;

/** The files these timeline items read or changed (absolute paths). */
export function touchedFiles(items: TimelineItem[], cwd: string, from = 0): string[] {
  const out = new Set<string>();
  const add = (p: unknown) => {
    if (typeof p !== 'string' || !p.trim() || p.length > 1000 || /[\n\0]/.test(p)) return;
    out.add(path.resolve(cwd, p.trim()));
  };
  for (const it of items.slice(Math.max(0, from))) {
    if (it.kind !== 'tool' || it.tool.status === 'error') continue;
    const t = it.tool;
    for (const f of t.files ?? []) add(f.op === 'delete' ? undefined : (f.movePath ?? f.path));
    if (t.category === 'read' || t.category === 'edit') {
      const i = (t.input ?? {}) as Record<string, unknown>;
      add(i.file_path ?? i.notebook_path ?? i.path ?? i.filePath);
    }
    if (out.size >= MAX_TOUCHED) break;
  }
  return [...out];
}

export function addTouched(key: string, files: string[]) {
  if (!files.length) return;
  const set = touched.get(key) ?? new Set<string>();
  for (const f of files) if (set.size < MAX_TOUCHED) set.add(f);
  touched.set(key, set);
}

export function takeTouched(key: string): string[] {
  const set = touched.get(key);
  touched.delete(key);
  return set ? [...set] : [];
}

/** The top of the checkout a file is in (where its .git is), or null outside git. */
export function checkoutOf(file: string): string | null {
  for (let d = path.dirname(path.resolve(file)); ; ) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}
