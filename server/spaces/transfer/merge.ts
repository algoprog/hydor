// What to copy, remove, rename or keep when a project is kept in sync with its copy on another machine: from what each
// side has now and what both had at the last round (the base). Pure: no files, no network, no clock. The hub lists both
// sides, calls mergeFiles (twice when it needs hashes), carries out the plan, and settles the base with what happened.
import { createHash } from 'node:crypto';
import type { SyncArea, SyncDetails, SyncFile, SyncNote } from '../../../shared/transfer.ts';

/** A file as a side lists it: its size, the time it was last changed (ms) and its permission bits. */
export interface Stat { size: number; mtime: number; mode?: number }
/** What both sides had at the last round: each side's stat, and the content hash when known. */
export interface BaseEntry { a: Stat; b: Stat; hash?: string }
/** key = area + '\n' + path */
export type Base = Map<string, BaseEntry>;

export const keyOf = (area: SyncArea, path: string): string => area + '\n' + path;
export const splitKey = (key: string): { area: SyncArea; path: string } => {
  const i = key.indexOf('\n');
  return { area: key.slice(0, i) as SyncArea, path: key.slice(i + 1) };
};

export interface CopyOp {
  area: SyncArea;
  path: string;
  from: 'a' | 'b';
  /** The source's stat as listed. */
  stat: Stat;
  /** The target's stat now, or null: it must not be there (after a conflict rename, or a new file). */
  expect: Stat | null;
}
export interface RemoveOp { area: SyncArea; path: string; side: 'a' | 'b'; expect: Stat }
export interface RenameOp { area: SyncArea; path: string; side: 'a' | 'b'; expect: Stat; to: string }
export interface FilePlan {
  /** Conflicts' losers: applied first. */
  renames: RenameOp[];
  removes: RemoveOp[];
  /** Copies from 'a' go A→B. */
  copies: CopyOp[];
  /** `at` is the loser's mtime (the plan has no clock). */
  conflicts: { area: SyncArea; path: string; copy: string; loser: 'a' | 'b'; at: number }[];
  /** Settled with nothing to move. */
  same: { key: string; a: Stat; b: Stat; hash?: string }[];
  /** Keys gone on both sides: they leave the base. */
  drop: string[];
  /** When not empty: ask both sides for these hashes and call mergeFiles again with them. */
  needHash: { area: SyncArea; path: string }[];
  /** Removals held by the mass-delete guard. */
  held: { side: 'a' | 'b'; area: SyncArea; count: number; of: number }[];
}

const AREAS: SyncArea[] = ['folder', 'skills', 'wiki'];
/** Same size and a time within this many ms: the same file without reading it. */
const CLOSE_MS = 2000;
/** The mass-delete guard: more than this many removals, and more than half of the area's base. */
const GUARD_MIN = 20;

const statOf = (f: SyncFile): Stat => (f.mode === undefined ? { size: f.size, mtime: f.mtime } : { size: f.size, mtime: f.mtime, mode: f.mode });
const sameStat = (x: Stat, y: Stat): boolean => x.size === y.size && x.mtime === y.mtime;

/** What a conflict's loser is renamed to: `<stem> (conflict, <machine>, <YYYY-MM-DD HH.MM UTC>)<ext>`, ` 2`, ` 3`… while taken. */
export function conflictName(path: string, machine: string, mtime: number, taken: (p: string) => boolean): string {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  // The extension is what follows the last dot of the file name: none for ".env", for "README" or for "name."
  const hasExt = dot > 0 && dot < file.length - 1;
  const stem = hasExt ? file.slice(0, dot) : file;
  const ext = hasExt ? file.slice(dot) : '';
  const when = new Date(mtime).toISOString(); // 2026-11-27T14:05:00.000Z
  const stamp = `${when.slice(0, 10)} ${when.slice(11, 13)}.${when.slice(14, 16)}`;
  // A machine's name goes into a file name: no characters a path or another system cannot have.
  const who = machine.replace(/[\u0000-\u001f\\/:*?"<>|]/g, '-').trim() || 'machine';
  const make = (n: number) => `${dir}${stem} (conflict, ${who}, ${stamp}${n > 1 ? ' ' + n : ''})${ext}`;
  let n = 1;
  while (taken(make(n))) n++;
  return make(n);
}

export function mergeFiles(
  a: Record<SyncArea, SyncFile[] | null>,
  b: Record<SyncArea, SyncFile[] | null>,
  base: Base,
  o: { names: { a: string; b: string }; hashes?: Map<string, { a?: string | null; b?: string | null }>; force?: boolean },
): FilePlan {
  const plan: FilePlan = { renames: [], removes: [], copies: [], conflicts: [], same: [], drop: [], needHash: [], held: [] };
  const baseKeysOf = new Map<SyncArea, string[]>();
  for (const k of base.keys()) {
    const area = splitKey(k).area;
    const list = baseKeysOf.get(area);
    if (list) list.push(k);
    else baseKeysOf.set(area, [k]);
  }

  for (const area of AREAS) {
    const la = a[area];
    const lb = b[area];
    if (!la || !lb) continue; // an area that is not there on one side is left alone, base and all
    const ma = new Map<string, Stat>();
    const mb = new Map<string, Stat>();
    for (const f of la) ma.set(f.path, statOf(f));
    for (const f of lb) mb.set(f.path, statOf(f));
    const paths = new Set<string>([...ma.keys(), ...mb.keys()]);
    for (const k of baseKeysOf.get(area) ?? []) paths.add(splitKey(k).path);
    const taken = new Set<string>([...ma.keys(), ...mb.keys()]);

    for (const path of [...paths].sort()) {
      const key = keyOf(area, path);
      const sa = ma.get(path);
      const sb = mb.get(path);
      const old = base.get(key);
      const changedA = sa && old ? !sameStat(sa, old.a) : !!sa !== !!old;
      const changedB = sb && old ? !sameStat(sb, old.b) : !!sb !== !!old;
      if (!changedA && !changedB) continue;

      if (changedA && !changedB) {
        if (sa) plan.copies.push({ area, path, from: 'a', stat: sa, expect: sb ?? null });
        else if (sb) plan.removes.push({ area, path, side: 'b', expect: sb });
        continue;
      }
      if (changedB && !changedA) {
        if (sb) plan.copies.push({ area, path, from: 'b', stat: sb, expect: sa ?? null });
        else if (sa) plan.removes.push({ area, path, side: 'a', expect: sa });
        continue;
      }
      // both changed
      if (!sa && !sb) {
        plan.drop.push(key);
        continue;
      }
      if (sa && !sb) {
        plan.copies.push({ area, path, from: 'a', stat: sa, expect: null });
        continue;
      }
      if (sb && !sa) {
        plan.copies.push({ area, path, from: 'b', stat: sb, expect: null });
        continue;
      }
      // both present
      if (sa && sb) {
        let conflict = sa.size !== sb.size;
        if (!conflict) {
          if (Math.abs(sa.mtime - sb.mtime) <= CLOSE_MS) {
            plan.same.push({ key, a: sa, b: sb });
            continue;
          }
          const h = o.hashes?.get(key);
          if (!h || h.a === undefined || h.b === undefined) {
            plan.needHash.push({ area, path });
            continue;
          }
          // A hash that is null was asked for and could not be read: keep both rather than ask again for ever.
          if (h.a !== null && h.a === h.b) {
            plan.same.push({ key, a: sa, b: sb, hash: h.a });
            continue;
          }
          conflict = true;
        }
        if (conflict) {
          const winner: 'a' | 'b' = sb.mtime > sa.mtime ? 'b' : 'a';
          const loser: 'a' | 'b' = winner === 'a' ? 'b' : 'a';
          const ls = loser === 'a' ? sa : sb;
          const ws = winner === 'a' ? sa : sb;
          const copy = conflictName(path, o.names[loser], ls.mtime, (p) => taken.has(p));
          taken.add(copy);
          plan.renames.push({ area, path, side: loser, expect: ls, to: copy });
          plan.copies.push({ area, path, from: winner, stat: ws, expect: null });
          plan.conflicts.push({ area, path, copy, loser, at: ls.mtime });
        }
      }
    }
  }

  // The mass-delete guard: one side, one area.
  if (!o.force && plan.removes.length > GUARD_MIN) {
    const groups = new Map<string, RemoveOp[]>();
    for (const r of plan.removes) {
      const g = r.side + '\n' + r.area;
      const list = groups.get(g);
      if (list) list.push(r);
      else groups.set(g, [r]);
    }
    const heldOps = new Set<RemoveOp>();
    for (const list of groups.values()) {
      const { side, area } = list[0];
      const of = baseKeysOf.get(area)?.length ?? 0;
      if (list.length > GUARD_MIN && list.length > of / 2) {
        for (const r of list) heldOps.add(r);
        plan.held.push({ side, area, count: list.length, of });
      }
    }
    if (heldOps.size) plan.removes = plan.removes.filter((r) => !heldOps.has(r));
  }
  return plan;
}

export interface Outcome {
  /** Aligned with plan.copies / plan.removes / plan.renames. `written` is the target's stat after the write. */
  copies: { ok: boolean; written?: Stat }[];
  removes: boolean[];
  renames: { ok: boolean }[];
}

/** The next base: for each op that succeeded, both sides' resulting stats; failed ops leave the key as it was. */
export function settle(base: Base, plan: FilePlan, outcome: Outcome): Base {
  const next: Base = new Map();
  for (const [k, v] of base) next.set(k, { ...v });
  for (const s of plan.same) {
    const e: BaseEntry = { a: s.a, b: s.b };
    if (s.hash !== undefined) e.hash = s.hash;
    next.set(s.key, e);
  }
  for (const k of plan.drop) next.delete(k);
  plan.removes.forEach((r, i) => {
    if (outcome.removes[i]) next.delete(keyOf(r.area, r.path));
  });
  plan.copies.forEach((c, i) => {
    const res = outcome.copies[i];
    if (!res || !res.ok) return;
    if (!res.written) throw new Error(`settle: copy of ${c.area}/${c.path} is ok but has no written stat`);
    next.set(keyOf(c.area, c.path), c.from === 'a' ? { a: c.stat, b: res.written } : { a: res.written, b: c.stat });
  });
  // Renames leave the base alone: the conflict copy is a new file that the next round carries over.
  return next;
}

const FIELDS = ['name', 'color', 'description', 'instructions'] as const;

/** Per field: equal → nothing; only B changed → to A; only A changed → to B; both changed or no base → A's to B. */
export function mergeDetails(
  a: SyncDetails,
  b: SyncDetails,
  base: SyncDetails | null,
): { toA: Partial<SyncDetails>; toB: Partial<SyncDetails>; base: SyncDetails } {
  const toA: Partial<SyncDetails> = {};
  const toB: Partial<SyncDetails> = {};
  const out: SyncDetails = { name: '', color: '' };
  for (const f of FIELDS) {
    const va = a[f] ?? '';
    const vb = b[f] ?? '';
    let win = va;
    if (va !== vb) {
      const vo = base ? (base[f] ?? '') : null;
      if (vo !== null && vo === va) {
        win = vb;
        toA[f] = vb;
      } else {
        toB[f] = va;
      }
    }
    if (f === 'name' || f === 'color') out[f] = win;
    else if (win !== '') out[f] = win;
  }
  return { toA, toB, base: out };
}

/** The same note on any machine: sha256 of kind + '\n' + its text with its spaces made one, first 32 hex characters. */
export function noteHash(kind: string, text: string): string {
  return createHash('sha256')
    .update(kind + '\n' + text.trim().replace(/\s+/g, ' '))
    .digest('hex')
    .slice(0, 32);
}

export function mergeNotes(
  a: SyncNote[],
  b: SyncNote[],
  base: Set<string> | null,
  o: { force?: boolean } = {},
): { addToA: SyncNote[]; addToB: SyncNote[]; forgetOnA: string[]; forgetOnB: string[]; held: { side: 'a' | 'b'; count: number; of: number }[]; base: Set<string> } {
  const ma = new Map<string, SyncNote>();
  const mb = new Map<string, SyncNote>();
  for (const n of a) if (!ma.has(n.hash)) ma.set(n.hash, n);
  for (const n of b) if (!mb.has(n.hash)) mb.set(n.hash, n);
  const addToA: SyncNote[] = [];
  const addToB: SyncNote[] = [];
  let forgetOnA: string[] = [];
  let forgetOnB: string[] = [];
  const held: { side: 'a' | 'b'; count: number; of: number }[] = [];
  const next = new Set<string>();

  if (!base) {
    for (const [h, n] of mb) if (!ma.has(h)) addToA.push(n);
    for (const [h, n] of ma) if (!mb.has(h)) addToB.push(n);
    for (const h of ma.keys()) next.add(h);
    for (const h of mb.keys()) next.add(h);
    return { addToA, addToB, forgetOnA, forgetOnB, held, base: next };
  }

  for (const [h, n] of ma) {
    if (mb.has(h)) next.add(h);
    else if (base.has(h)) forgetOnA.push(h); // gone on B: forget it here
    else {
      addToB.push(n);
      next.add(h);
    }
  }
  for (const [h, n] of mb) {
    if (ma.has(h)) continue;
    if (base.has(h)) forgetOnB.push(h);
    else {
      addToA.push(n);
      next.add(h);
    }
  }
  const guard = (side: 'a' | 'b', list: string[]): string[] => {
    if (o.force || list.length <= GUARD_MIN || list.length <= base.size / 2) return list;
    held.push({ side, count: list.length, of: base.size });
    for (const h of list) next.add(h); // still on one side, still in the base: seen again next round
    return [];
  };
  forgetOnA = guard('a', forgetOnA);
  forgetOnB = guard('b', forgetOnB);
  return { addToA, addToB, forgetOnA, forgetOnB, held, base: next };
}
