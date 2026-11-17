// Memory for search indexes. Every index of vectors for search by meaning (memory's notes, knowledge bases, the
// search box, past conversations, apps' records) lives on disk, in the database; what one keeps in memory is only a
// cache, so a search does not read the database again for each vector. The caches of the notes' places and of the
// knowledge bases share one budget here, so together they never take more than it (the search box holds only the
// vectors of what exists now; past conversations and apps' records are always read as they are scanned).
// The budget follows how much memory the computer has (or the container or service, when a control group limits it)
// and how much is free right now: a 64th of the total, at most 512 MB, at most an eighth of what is free, and nothing
// at all when free memory runs short. A cache asks for room before it fills (keep), the ones used least lately make
// room for it, and when memory gets short every cache is dropped; a search then reads its vectors from the database
// as it goes, slower but light. Free memory is what the system could give a new program without swapping, the page
// cache it gives back when asked included (in a control group Node.js counts that cache as used, and on a Mac only
// the pages that are free right now, which is why the readings are made here).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { availableMemory } from '../models/machine.ts';

const MB = 2 ** 20;
/** How long a reading of free memory is taken as it is now. */
const STALE_MS = 5000;
/** How often what is kept is checked against the budget, while anything is kept. */
const WATCH_MS = 30_000;

// ---- control groups: a container's limit -----------------------------------------------------------

const num = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);
const read = (f: string) => fs.readFileSync(f, 'utf8');
const statValue = (f: string, key: string): number => {
  try {
    const m = new RegExp(`^${key} (\\d+)$`, 'm').exec(read(f));
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
};

/**
 * The memory limit of the control group this process runs in (Linux containers, services) and what is left of it,
 * the tightest of the group and the ones above it; null with no limit, or when it cannot be read. What the group
 * could still give counts the page cache as free (the inactive part: the kernel drops it when asked).
 */
export function cgroupMemory(o: { root?: string; self?: string } = {}): { limit: number; free: number } | null {
  const root = o.root ?? '/sys/fs/cgroup';
  const self = o.self ?? '/proc/self/cgroup';
  try {
    const lines = read(self).split('\n');
    const inside = (base: string, rel: string) => {
      const dir = path.join(base, rel);
      return dir === base || dir.startsWith(base + path.sep) ? dir : base;
    };
    let best: { limit: number; free: number } | null = null;
    const v2 = lines.find((l) => l.startsWith('0::'));
    if (v2) {
      let dir = inside(root, v2.slice(3).trim());
      for (;;) {
        const limit = fs.existsSync(path.join(dir, 'memory.max')) ? num(read(path.join(dir, 'memory.max'))) : null;
        if (limit !== null) {
          const used = (num(read(path.join(dir, 'memory.current'))) ?? 0) - statValue(path.join(dir, 'memory.stat'), 'inactive_file');
          const free = Math.max(0, limit - used);
          if (!best || free < best.free) best = { limit, free };
        }
        if (dir === root) break;
        dir = path.dirname(dir);
      }
      if (best) return best;
    }
    // The older layout: a memory folder of its own.
    const v1 = lines.map((l) => l.split(':')).find((p) => p.length >= 3 && p[1].split(',').includes('memory'));
    const base = path.join(root, 'memory');
    const dirs = v1 ? [inside(base, v1.slice(2).join(':')), base] : [base];
    for (const dir of new Set(dirs)) {
      const f = path.join(dir, 'memory.limit_in_bytes');
      if (!fs.existsSync(f)) continue;
      const limit = num(read(f));
      if (limit === null || limit >= os.totalmem()) continue;
      const used = (num(read(path.join(dir, 'memory.usage_in_bytes'))) ?? 0) - statValue(path.join(dir, 'memory.stat'), 'total_inactive_file');
      const free = Math.max(0, limit - used);
      if (!best || free < best.free) best = { limit, free };
    }
    return best;
  } catch {
    return null;
  }
}

// ---- how much memory there is, and how much is free --------------------------------------------------

let fixed: { total?: number; free?: number; budget?: number } = {};

/** For tests: fixed readings (`budget` replaces the formula); null goes back to the real ones. */
export function setRamForTests(o: { total?: number; free?: number; budget?: number } | null) {
  fixed = o ?? {};
  if (!o) reading = null;
}

let reading: { at: number; cgroup: { limit: number; free: number } | null; avail: number } | null = null;
let mac: { at: number; value: number | null; refreshing: Promise<void> | null } = { at: 0, value: null, refreshing: null };

/** The control group's numbers and Linux's own count of free memory, read at most every STALE_MS. */
function linux() {
  if (!reading || Date.now() - reading.at > STALE_MS) {
    let avail = os.freemem();
    if (process.platform === 'linux') {
      try {
        const m = /MemAvailable:\s+(\d+) kB/.exec(read('/proc/meminfo'));
        if (m) avail = Number(m[1]) * 1024;
      } catch {}
    }
    reading = { at: Date.now(), cgroup: process.platform === 'linux' ? cgroupMemory() : null, avail };
  }
  return reading;
}

/** The computer's memory, or its container's when that is less. */
export function totalMemory(): number {
  if (fixed.total !== undefined) return fixed.total;
  const c = linux().cgroup;
  return c ? Math.min(os.totalmem(), c.limit) : os.totalmem();
}

/** One reading of a Mac's free memory at a time, in the background (vm_stat runs a program). */
function refreshMac(): Promise<void> {
  mac.refreshing ??= availableMemory()
    .then((v) => {
      mac.value = v;
      mac.at = Date.now();
    })
    .catch(() => {})
    .finally(() => (mac.refreshing = null));
  return mac.refreshing;
}

/**
 * Memory the system could give now. Taken a few seconds ago at most; on a Mac the reading comes from a program that
 * runs in the background, so the last one answers, and none is kept until the first has come (it says 0).
 */
export function freeMemory(): number {
  if (fixed.free !== undefined) return fixed.free;
  if (process.platform === 'darwin') {
    if (Date.now() - mac.at > STALE_MS) void refreshMac();
    return mac.value ?? 0;
  }
  const r = linux();
  return r.cgroup ? Math.min(r.avail, r.cgroup.free) : r.avail;
}

/** Bytes the search indexes may keep in memory now: none while memory is short. */
export function searchBudget(): number {
  if (fixed.budget !== undefined) return fixed.budget;
  const total = totalMemory();
  const free = freeMemory();
  if (free < Math.max(256 * MB, total / 20)) return 0;
  return Math.floor(Math.min(512 * MB, total / 64, free / 8));
}

// ---- what is kept ----------------------------------------------------------------------------------

export interface Kept {
  bytes: number;
  /** When it was last used (a count that only rises, near the time). */
  at: number;
  /** Lets go of what the owner holds (called when it makes room for others or memory runs short). */
  drop: () => void;
}

const held = new Set<Kept>();
let last = 0;
const stamp = () => (last = Math.max(Date.now(), last + 1));
let watcher: NodeJS.Timeout | null = null;

export const heldBytes = () => {
  let n = 0;
  for (const k of held) n += k.bytes;
  return n;
};

/** Drops the least recently used until what is held is at most `to` bytes. */
function shrink(to: number) {
  let total = heldBytes();
  while (total > to && held.size) {
    let oldest: Kept | null = null;
    for (const k of held) if (!oldest || k.at < oldest.at) oldest = k;
    held.delete(oldest!);
    total -= oldest!.bytes;
    try {
      oldest!.drop();
    } catch {}
  }
  if (!held.size) stopWatching();
}

/** Asks for room for a cache of `bytes`: null when it is more than the budget now (read from the database instead). */
export function keep(bytes: number, drop: () => void): Kept | null {
  const budget = searchBudget();
  if (bytes > budget) {
    shrink(budget);
    return null;
  }
  shrink(budget - bytes);
  const k: Kept = { bytes, at: stamp(), drop };
  held.add(k);
  watch();
  return k;
}

/** Marks a cache as used just now. */
export function used(k: Kept) {
  k.at = stamp();
}

/** Its owner let it go: it takes no more of the budget (drop is not called). */
export function release(k?: Kept | null) {
  if (!k) return;
  held.delete(k);
  if (!held.size) stopWatching();
}

/** While anything is kept, the budget is looked at every now and then: when memory gets short, caches go. */
function watch() {
  if (watcher) return;
  watcher = setInterval(() => void checkRamNow(), WATCH_MS);
  watcher.unref();
}

function stopWatching() {
  if (watcher) clearInterval(watcher);
  watcher = null;
}

/** Reads free memory again and drops what no longer fits the budget (the watcher does it; tests may too). */
export async function checkRamNow(): Promise<void> {
  reading = null;
  if (process.platform === 'darwin' && fixed.free === undefined) await refreshMac();
  shrink(searchBudget());
}
