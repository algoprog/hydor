// The hub: the server the user opened the app on, which reads a project from one machine and writes it to another (itself,
// '' , or a machine of Settings → Machines), with progress and a way to cancel, and keeps the copies of projects it was
// asked to keep in sync in step while both machines are on. shared/transfer.ts has the shapes; endpoints.ts says how a machine
// is asked; sync-endpoint.ts is what each machine does for a round.
//
// Transfers (copy, move, keep in sync) live in memory: the running ones and the last 20 that ended. A sync link is kept
// in this server's database (project_links, its files' last-known stats in project_link_files, its details and notes as last
// settled in the link's row) so a restart carries on where it was.
//
// A round of a link: both machines say what they hold (state) → merge against the base (twice when it needs hashes) →
// renames, removals, details and notes on each machine (one call each) → files copied (pulled from the machine that has
// them, pushed to the other, through tapBundle for progress) → the next base is settled from what happened and saved →
// marks on both projects. One round per link at a time, two links at once, the others wait their turn.
import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import type { NotifyEvent } from '../../../shared/types.ts';
import type { ArrivalPlace, CarryPlan, MachineRef, ProjectSyncMark, SendHow, SyncArea, SyncLink, SyncState, Transfer } from '../../../shared/transfer.ts';
import { HttpError } from '../../auth.ts';
import type { DB } from '../../db.ts';
import type { Deps, Feature } from '../../features/types.ts';
import { machineId } from '../../machines.ts';
import { spaceById } from '../index.ts';
import { endpointOf, isGone, RemoteError, selfName, Unreachable, useTransferLocal, wordsOf, type Endpoint } from './endpoints.ts';
import { keyOf, mergeDetails, mergeFiles, mergeNotes, settle, type Base, type BaseEntry, type FilePlan, type Outcome } from './merge.ts';
import { setSyncMark, syncRoutes, type ApplyBody, type ApplyResult } from './sync-endpoint.ts';
import { sizeWords } from './safe.ts';
import { tapBundle } from './stream.ts';

const enc = encodeURIComponent;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const newId = () => crypto.randomBytes(5).toString('hex');
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

let deps: Deps | null = null;
const dep = () => {
  if (!deps) throw new HttpError(503, 'The app is still starting');
  return deps;
};

/** An error as the page should see it: this app's own errors stay, a machine that cannot be reached is a gateway's. */
function http(e: unknown): Error {
  if (e instanceof HttpError) return e;
  if (e instanceof Unreachable) return new HttpError(502, e.message);
  if (e instanceof RemoteError) return new HttpError(e.status >= 400 && e.status < 600 ? e.status : 502, e.message);
  if (isGone(e)) return new HttpError(404, 'No such project');
  return e as Error;
}

// ---- where things are, in words ------------------------------------------------------------------------------

/** `p` under `home` as the other machine's system writes it ('/' between parts), or null. */
function relUnder(home: string, p: string, windows: boolean): string | null {
  const norm = (x: string) => x.replace(/\\/g, '/').replace(/\/+$/, '');
  const h = norm(home);
  const q = norm(p);
  if (!h) return null;
  const [hh, qq] = windows ? [h.toLowerCase(), q.toLowerCase()] : [h, q];
  return qq.startsWith(hh + '/') ? q.slice(h.length + 1) : null;
}

const projectUrl = (machine: MachineRef, id: string) => (machine ? `/m/${enc(machine)}/projects/${enc(id)}` : `/projects/${enc(id)}`);

function notice(n: Pick<NotifyEvent, 'kind' | 'title' | 'body' | 'url'>) {
  dep().sessions.emit('notify', { key: '', agent: 'claude', at: Date.now(), ownWords: true, ...n } satisfies NotifyEvent);
}

/** At most `per` ms between two calls: the last one is never lost. */
function throttled(per: number) {
  const last = new Map<string, number>();
  const timers = new Map<string, NodeJS.Timeout>();
  return (key: string, fn: () => void, force = false) => {
    const now = Date.now();
    clearTimeout(timers.get(key));
    timers.delete(key);
    const wait = (last.get(key) ?? 0) + per - now;
    if (force || wait <= 0) {
      last.set(key, now);
      fn();
    } else {
      const t = setTimeout(() => {
        timers.delete(key);
        last.set(key, Date.now());
        fn();
      }, wait);
      t.unref();
      timers.set(key, t);
    }
  };
}

// ---- plan ----------------------------------------------------------------------------------------------------

interface Planned {
  src: Endpoint;
  dst: Endpoint;
  plan: CarryPlan;
  place: ArrivalPlace;
}

/** What it would carry from one machine and where it would go on the other. */
async function planFor(o: { from: MachineRef; project: string; to: MachineRef; leaveOut: boolean; also: boolean }): Promise<Planned> {
  if (o.from === o.to) throw new HttpError(400, 'It is on that machine already: pick another machine');
  const src = endpointOf(o.from);
  const dst = endpointOf(o.to);
  const [srcInfo] = await Promise.all([src.info(), dst.info()]);
  const plan = await src.plan(o.project, { leaveOut: o.leaveOut, also: o.also });
  const windows = srcInfo.platform === 'win32';
  const rel = relUnder(srcInfo.home, plan.project.folder, windows);
  // Its other folders: where each goes under the other's home, '' for one that cannot go (by its position among them).
  const alsoRels = plan.also.map((a) => (a.home ? (relUnder(srcInfo.home, a.path, windows) ?? '') : ''));
  const place = await dst.place({ name: plan.project.name, ...(rel ? { rel } : {}), ...(o.also && alsoRels.length ? { also: alsoRels } : {}) });
  return { src, dst, plan, place };
}

// ---- transfers -----------------------------------------------------------------------------------------------

interface Running {
  t: Transfer;
  ac: AbortController;
  cancelled: boolean;
}
const transfers = new Map<string, Running>();
const tell = throttled(250);

function emitTransfer(r: Running, force = false) {
  tell(`t:${r.t.id}`, () => dep().broadcast({ t: 'feature', id: 'transfers', data: { transfer: structuredClone(r.t) } }), force);
}

/** The running transfers and the last 20 that ended, newest first. */
const listTransfers = () => [...transfers.values()].map((r) => structuredClone(r.t)).sort((a, b) => b.startedAt - a.startedAt);

function trimTransfers() {
  const ended = [...transfers.values()].filter((r) => r.t.endedAt).sort((a, b) => b.t.endedAt! - a.t.endedAt!);
  for (const r of ended.slice(20)) transfers.delete(r.t.id);
}

interface SendBody {
  from?: unknown;
  project?: unknown;
  to?: unknown;
  how?: unknown;
  folder?: unknown;
  leaveOut?: unknown;
  also?: unknown;
}

const isAbs = (p: string) => /^([\\/]|[A-Za-z]:[\\/])/.test(p);

async function send(b: SendBody): Promise<Transfer> {
  const from = typeof b.from === 'string' ? b.from : '';
  const to = typeof b.to === 'string' ? b.to : '';
  const project = typeof b.project === 'string' ? b.project : '';
  const how = b.how as SendHow;
  if (!project) throw new HttpError(400, 'Which project?');
  if (!['copy', 'sync', 'move'].includes(how)) throw new HttpError(400, 'how: copy, sync or move');
  if (how === 'sync' && from !== '' && to !== '') throw new HttpError(400, 'One of the two must be this machine to keep them in sync');
  const busy = [...transfers.values()].find((r) => !r.t.endedAt && r.t.project.id === project && r.t.from.machine === from);
  if (busy) throw new HttpError(409, `“${busy.t.project.name}” is being sent already`);
  const leaveOut = b.leaveOut !== false;
  const also = b.also === true;
  let planned: Planned;
  try {
    planned = await planFor({ from, project, to, leaveOut, also });
  } catch (e) {
    throw http(e);
  }
  const { src, dst, plan, place } = planned;
  // A disk that is too small is said here: arrive() finds out mid-upload, which the sender sees as a connection reset.
  if (place.free != null && place.free < plan.total.bytes) throw new HttpError(507, `${dst.name} has ${sizeWords(place.free)} free; the project needs ${sizeWords(plan.total.bytes)}`);
  if (how === 'sync' && plan.sync) throw new HttpError(409, `“${plan.project.name}” is kept in sync with ${plan.sync.peer.name} already: stop that first`);
  const folder = typeof b.folder === 'string' && b.folder.trim() ? b.folder.trim() : place.folder;
  if (!isAbs(folder)) throw new HttpError(400, 'Where on that machine? Give the whole path of a new or empty folder');
  const r: Running = {
    ac: new AbortController(),
    cancelled: false,
    t: {
      id: newId(),
      how,
      from: { machine: from, name: src.name },
      to: { machine: to, name: dst.name },
      project: { id: project, name: plan.project.name },
      state: 'sending',
      done: { files: 0, bytes: 0 },
      total: { files: plan.total.files, bytes: plan.total.bytes },
      startedAt: Date.now(),
    },
  };
  transfers.set(r.t.id, r);
  void runTransfer(r, planned, { folder, leaveOut, also });
  return structuredClone(r.t);
}

async function runTransfer(r: Running, p: Planned, o: { folder: string; leaveOut: boolean; also: boolean }) {
  const { t } = r;
  const { src, dst, place } = p;
  const signal = r.ac.signal;
  let bundle: Readable | null = null;
  let tapped: Readable | null = null;
  try {
    emitTransfer(r, true);
    bundle = await src.bundle(t.project.id, { leaveOut: o.leaveOut, also: o.also }, signal);
    tapped = tapBundle(bundle, (n) => {
      t.done = { files: n.files, bytes: n.bytes };
      emitTransfer(r);
    });
    const arrived = await dst.arrive(tapped, { folder: o.folder, how: t.how, from: src.name, ...(o.also && place.also ? { also: place.also } : {}), signal });
    t.state = 'finishing';
    t.done = { files: arrived.files, bytes: arrived.bytes };
    t.result = { project: arrived.project.id, folder: arrived.project.folder, leftOut: arrived.leftOut };
    emitTransfer(r, true);
    if (t.how === 'move') {
      try {
        const left = await src.leave(t.project.id, t.to.machine);
        t.result.trashed = left.trashed;
        if (left.kept) t.result.kept = left.kept;
      } catch (e) {
        t.result.kept = `It is on ${dst.name} now, but it could not leave ${src.name}: ${wordsOf(e)}`;
      }
    }
    if (t.how === 'sync') {
      const here = t.from.machine === '' ? t.project.id : arrived.project.id;
      const there = t.from.machine === '' ? arrived.project.id : t.project.id;
      const remote = t.from.machine === '' ? t.to : t.from;
      const link = await createLink({ here, there, machine: remote.machine, machineName: remote.name, hereName: t.project.name, thereName: arrived.project.name });
      t.result.link = link.id;
    }
    t.state = 'done';
    t.endedAt = Date.now();
    emitTransfer(r, true);
    notice({
      kind: 'done',
      title: `“${t.project.name}” is on ${dst.name} now`,
      body: arrived.leftOut.length ? `${plural(arrived.leftOut.length, 'thing')} could not be placed there` : t.result.kept ? t.result.kept : '',
      url: projectUrl(t.to.machine, arrived.project.id),
    });
  } catch (e) {
    // The source's file handles are let go at once, whoever failed.
    tapped?.destroy();
    bundle?.destroy();
    t.endedAt = Date.now();
    if (r.cancelled || signal.aborted) {
      t.state = 'cancelled';
    } else {
      t.state = 'failed';
      t.error = wordsOf(e);
      notice({ kind: 'failed', title: `Could not send “${t.project.name}” to ${dst.name}`, body: t.error, url: projectUrl(t.from.machine, t.project.id) });
    }
    emitTransfer(r, true);
  } finally {
    trimTransfers();
  }
}

function cancelTransfer(id: string): Transfer {
  const r = transfers.get(id);
  if (!r) throw new HttpError(404, 'No such transfer');
  if (r.t.endedAt) return structuredClone(r.t);
  if (r.t.state !== 'sending') throw new HttpError(409, 'It is almost done: it cannot be stopped now');
  r.cancelled = true;
  r.ac.abort();
  return structuredClone(r.t);
}

// ---- links: what is kept --------------------------------------------------------------------------------------

interface LinkRow {
  id: string;
  here: string;
  machine: string;
  machineName: string;
  there: string;
  hereName: string;
  thereName: string;
  createdAt: number;
  state: ProjectSyncMark['state'];
  at?: number;
  error?: string;
  conflicts?: NonNullable<ProjectSyncMark['conflicts']>;
  lastMs?: number;
  baseDetails: { name: string; color: string; description?: string; instructions?: string } | null;
  baseNotes: Set<string> | null;
}

const made = new WeakSet<DB>();
function tables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists project_links (
      id text primary key, here text not null, machine text not null, machine_name text not null, there text not null,
      here_name text not null, there_name text not null, created_at integer not null, state text not null,
      at integer, error text, conflicts text, last_ms integer, base_details text, base_notes text
    );
    create table if not exists project_link_files (
      link text not null, k text not null, a_size integer not null, a_mtime integer not null, b_size integer not null, b_mtime integer not null, hash text,
      primary key (link, k)
    ) without rowid;
  `);
  made.add(db);
}

interface Row {
  id: string;
  here: string;
  machine: string;
  machine_name: string;
  there: string;
  here_name: string;
  there_name: string;
  created_at: number;
  state: string;
  at: number | null;
  error: string | null;
  conflicts: string | null;
  last_ms: number | null;
  base_details: string | null;
  base_notes: string | null;
}
const parse = <T>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};
const rowOf = (r: Row): LinkRow => ({
  id: r.id,
  here: r.here,
  machine: r.machine,
  machineName: r.machine_name,
  there: r.there,
  hereName: r.here_name,
  thereName: r.there_name,
  createdAt: r.created_at,
  state: r.state as LinkRow['state'],
  ...(r.at ? { at: r.at } : {}),
  ...(r.error ? { error: r.error } : {}),
  ...(r.conflicts ? { conflicts: parse(r.conflicts) ?? undefined } : {}),
  ...(r.last_ms ? { lastMs: r.last_ms } : {}),
  baseDetails: parse(r.base_details),
  baseNotes: (() => {
    const a = parse<string[]>(r.base_notes);
    return a ? new Set(a) : null;
  })(),
});

function insertLink(db: DB, L: LinkRow) {
  tables(db);
  db.prepare('insert into project_links (id, here, machine, machine_name, there, here_name, there_name, created_at, state) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(L.id, L.here, L.machine, L.machineName, L.there, L.hereName, L.thereName, L.createdAt, L.state);
}

function saveLink(db: DB, L: LinkRow) {
  db.prepare('update project_links set machine_name = ?, here_name = ?, there_name = ?, state = ?, at = ?, error = ?, conflicts = ?, last_ms = ?, base_details = ?, base_notes = ? where id = ?').run(
    L.machineName,
    L.hereName,
    L.thereName,
    L.state,
    L.at ?? null,
    L.error ?? null,
    L.conflicts?.length ? JSON.stringify(L.conflicts) : null,
    L.lastMs ?? null,
    L.baseDetails ? JSON.stringify(L.baseDetails) : null,
    L.baseNotes ? JSON.stringify([...L.baseNotes]) : null,
    L.id,
  );
}

function loadBase(db: DB, link: string): Base {
  const base: Base = new Map();
  for (const r of db.prepare('select k, a_size, a_mtime, b_size, b_mtime, hash from project_link_files where link = ?').all(link) as { k: string; a_size: number; a_mtime: number; b_size: number; b_mtime: number; hash: string | null }[]) {
    const e: BaseEntry = { a: { size: r.a_size, mtime: r.a_mtime }, b: { size: r.b_size, mtime: r.b_mtime } };
    if (r.hash) e.hash = r.hash;
    base.set(r.k, e);
  }
  return base;
}

/** Writes what differs between two bases. */
function saveBase(db: DB, link: string, before: Base, after: Base) {
  const sig = (e: BaseEntry) => `${e.a.size}/${e.a.mtime}/${e.b.size}/${e.b.mtime}/${e.hash ?? ''}`;
  const put = db.prepare('insert into project_link_files (link, k, a_size, a_mtime, b_size, b_mtime, hash) values (?, ?, ?, ?, ?, ?, ?) on conflict(link, k) do update set a_size = excluded.a_size, a_mtime = excluded.a_mtime, b_size = excluded.b_size, b_mtime = excluded.b_mtime, hash = excluded.hash');
  const del = db.prepare('delete from project_link_files where link = ? and k = ?');
  db.transaction(() => {
    for (const [k, e] of after) {
      const o = before.get(k);
      if (!o || sig(o) !== sig(e)) put.run(link, k, e.a.size, e.a.mtime, e.b.size, e.b.mtime, e.hash ?? null);
    }
    for (const k of before.keys()) if (!after.has(k)) del.run(link, k);
  })();
}

function deleteLinkRows(db: DB, id: string) {
  db.transaction(() => {
    db.prepare('delete from project_link_files where link = ?').run(id);
    db.prepare('delete from project_links where id = ?').run(id);
  })();
}

interface Live {
  row: LinkRow;
  running: boolean;
  queued: boolean;
  /** Another round soon: a change, or Sync now, came while one was running. */
  again: boolean;
  force: boolean;
  /** A file changed while it was copied: look again in a few seconds. */
  retrySoon: boolean;
  dead: boolean;
  /** The other machine's project has this link's mark (made when the link was; false while that did not work yet). */
  remoteMarked: boolean;
  timer?: NodeJS.Timeout;
  watcher?: fs.FSWatcher;
  watched?: string;
  debounce?: NodeJS.Timeout;
  ac?: AbortController;
  progress?: SyncLink['progress'];
  /** The marks as last written, to write them only when they change. */
  lastMark: { here?: { json: string; at?: number }; there?: { json: string; at?: number } };
}

const lives = new Map<string, Live>();
let active = 0;
const waiting: Live[] = [];
const MAX_ROUNDS = 2;
const MAX_WATCHED_DIRS = 5000;
const tellLink = throttled(250);

const linkOf = (L: LinkRow, live?: Live): SyncLink => ({
  id: L.id,
  here: { project: L.here, name: L.hereName },
  there: { machine: L.machine, machineName: L.machineName, project: L.there, name: L.thereName },
  createdAt: L.createdAt,
  state: L.state,
  ...(L.at ? { at: L.at } : {}),
  ...(L.error ? { error: L.error } : {}),
  ...(L.conflicts?.length ? { conflicts: L.conflicts } : {}),
  ...(live?.progress ? { progress: live.progress } : {}),
});

function emitLink(live: Live, force = false) {
  tellLink(`l:${live.row.id}`, () => dep().broadcast({ t: 'feature', id: 'transfers', data: { link: linkOf(live.row, live) } }), force);
}

const markOf = (L: LinkRow, role: 'here' | 'there'): ProjectSyncMark => {
  const by = { id: machineId(dep().db), name: selfName() };
  return {
    link: L.id,
    by,
    peer: role === 'here' ? { name: L.machineName, project: L.there, projectName: L.thereName } : { name: by.name, project: L.here, projectName: L.hereName },
    ...(L.at ? { at: L.at } : {}),
    state: L.state,
    ...(L.error ? { error: L.error } : {}),
    ...(L.conflicts?.length ? { conflicts: L.conflicts } : {}),
  };
};

/** Writes the marks on both projects that need it: the state or anything but `at` changed, or `at` moved by over a minute. */
async function writeMarks(live: Live, o: { remote: boolean; there?: Endpoint }) {
  const L = live.row;
  const wanted: ['here' | 'there', ProjectSyncMark][] = [['here', markOf(L, 'here')]];
  if (o.remote) wanted.push(['there', markOf(L, 'there')]);
  for (const [role, mark] of wanted) {
    const { at, ...rest } = mark;
    const json = JSON.stringify(rest);
    const prev = live.lastMark[role];
    if (prev && prev.json === json && (at ?? 0) - (prev.at ?? 0) <= 60_000) continue;
    try {
      if (role === 'here') setSyncMark(dep(), L.here, mark);
      else await (o.there ?? endpointOf(L.machine)).mark(L.there, mark);
      live.lastMark[role] = { json, at };
      if (role === 'there') live.remoteMarked = true;
    } catch {
      // The project went away, or the machine did: the next round says so.
    }
  }
}

async function setState(live: Live, state: ProjectSyncMark['state'], error?: string, o: { remote?: boolean; there?: Endpoint } = {}) {
  const L = live.row;
  if (L.state === state && (L.error ?? '') === (error ?? '')) return;
  L.state = state;
  if (error) L.error = error;
  else delete L.error;
  if (!live.dead) saveLink(dep().db, L);
  emitLink(live, true);
  await writeMarks(live, { remote: o.remote ?? false, there: o.there });
}

// ---- the runner ----------------------------------------------------------------------------------------------

function schedule(live: Live, ms: number) {
  clearTimeout(live.timer);
  if (live.dead) return;
  live.timer = setTimeout(() => want(live), ms);
  live.timer.unref();
}

/** A round for this link as soon as one can start (two links at a time). */
function want(live: Live, force = false) {
  if (live.dead) return;
  if (force) live.force = true;
  if (live.running) {
    live.again = true;
    return;
  }
  if (live.queued) return;
  live.queued = true;
  waiting.push(live);
  pump();
}

function pump() {
  while (active < MAX_ROUNDS && waiting.length) {
    const live = waiting.shift()!;
    live.queued = false;
    if (live.dead) continue;
    active++;
    void run(live).finally(() => {
      active--;
      pump();
    });
  }
}

async function run(live: Live) {
  live.running = true;
  live.again = false;
  const force = live.force;
  live.force = false;
  live.retrySoon = false;
  const t0 = Date.now();
  try {
    await round(live, force);
  } catch (e) {
    if (!live.dead && !live.ac?.signal.aborted) {
      console.warn(`[transfer] a round of ${live.row.id} failed: ${wordsOf(e)}`);
      await setState(live, 'error', wordsOf(e)).catch(() => {});
    }
  } finally {
    live.running = false;
    live.ac = undefined;
    live.progress = undefined;
    if (!live.dead) {
      live.row.lastMs = Date.now() - t0;
      try {
        saveLink(dep().db, live.row);
      } catch {}
      emitLink(live, true);
      const delay = live.again ? 1000 : live.retrySoon ? 5000 : clamp(10 * live.row.lastMs, 30_000, 300_000);
      schedule(live, delay);
    }
  }
}

/** Watches the project's folder: a change there brings a round about three seconds later. */
function watch(live: Live, folder: string | null, dirs: number) {
  if (live.watcher && (live.watched !== folder || !folder)) {
    live.watcher.close();
    live.watcher = undefined;
  }
  if (live.watcher || !folder || dirs >= MAX_WATCHED_DIRS || live.dead) return;
  try {
    live.watched = folder;
    live.watcher = fs.watch(folder, { recursive: true }, (_ev, name) => {
      const n = String(name ?? '').replace(/\\/g, '/');
      if (n.startsWith('.git/') || n === '.git' || n.includes('/.git/') || n.includes('node_modules/') || /(^|\/)\.hydor-(sync|arriving)-/.test(n)) return;
      clearTimeout(live.debounce);
      live.debounce = setTimeout(() => want(live), 3000);
      live.debounce.unref();
    });
    live.watcher.on('error', () => {
      live.watcher?.close();
      live.watcher = undefined;
    });
  } catch {
    live.watcher = undefined;
  }
}

const dirsOf = (state: SyncState) => new Set((state.files.folder ?? []).map((f) => path.posix.dirname(f.path))).size;

interface Why {
  /** Who said stop. */
  by: 'here' | 'there' | 'gone-here' | 'gone-there' | 'asked';
}

/** The link ends: nothing is kept in step any more, both copies stay as they are. */
async function endLink(live: Live, why: Why['by'], o: { clearHere: boolean; clearThere: boolean; there?: Endpoint }) {
  const L = live.row;
  if (live.dead) return;
  live.dead = true;
  live.ac?.abort();
  clearTimeout(live.timer);
  clearTimeout(live.debounce);
  live.watcher?.close();
  lives.delete(L.id);
  deleteLinkRows(dep().db, L.id);
  const d = dep();
  if (o.clearHere) {
    try {
      const s = spaceById(d.db, L.here);
      if (s?.sync?.link === L.id) setSyncMark(d, L.here, null);
    } catch {}
  }
  if (o.clearThere) {
    try {
      await (o.there ?? endpointOf(L.machine)).mark(L.there, null, L.id);
    } catch {}
  }
  d.broadcast({ t: 'feature', id: 'transfers', data: { linkEnded: L.id } });
  if (why === 'there') notice({ kind: 'waiting', title: `Stopped keeping “${L.hereName}” in sync`, body: `It was stopped on ${L.machineName}. Both copies are kept as they are.`, url: projectUrl('', L.here) });
  if (why === 'gone-there') notice({ kind: 'waiting', title: `Stopped keeping “${L.hereName}” in sync`, body: `The copy on ${L.machineName} is gone. This one is kept as it is.`, url: projectUrl('', L.here) });
}

async function createLink(o: { here: string; there: string; machine: string; machineName: string; hereName: string; thereName: string }): Promise<LinkRow> {
  const d = dep();
  const L: LinkRow = { id: newId(), here: o.here, machine: o.machine, machineName: o.machineName, there: o.there, hereName: o.hereName, thereName: o.thereName, createdAt: Date.now(), state: 'ok', baseDetails: null, baseNotes: null };
  insertLink(d.db, L);
  const live: Live = { row: L, running: false, queued: false, again: false, force: false, retrySoon: false, dead: false, remoteMarked: false, lastMark: {} };
  lives.set(L.id, live);
  await writeMarks(live, { remote: true });
  emitLink(live, true);
  // The first round settles what the copy and the original hold.
  schedule(live, 300);
  return L;
}

/** Stops keeping a project in sync: both marks go (the other machine's when it answers), both copies stay as they are. */
async function stopLink(id: string) {
  const live = lives.get(id);
  if (!live) throw new HttpError(404, 'No such link');
  await endLink(live, 'asked', { clearHere: true, clearThere: true });
}

// ---- a round -------------------------------------------------------------------------------------------------

type Got = { v: SyncState } | { e: unknown };
const got = (p: Promise<SyncState>): Promise<Got> => p.then((v) => ({ v }), (e) => ({ e }));

/** Files and bytes in one pull-and-push, at most. */
const BATCH_FILES = 1000;
const BATCH_BYTES = 512 * 1024 * 1024;

async function round(live: Live, force: boolean) {
  const d = dep();
  const L = live.row;
  const here = endpointOf('');
  let there: Endpoint;
  try {
    there = endpointOf(L.machine);
  } catch (e) {
    await setState(live, 'error', wordsOf(e));
    return;
  }
  live.row.machineName = there.name;
  const ac = (live.ac = new AbortController());
  const signal = ac.signal;

  const [ra, rb] = await Promise.all([got(here.state(L.here)), got(there.state(L.there))]);
  if (live.dead || signal.aborted) return;
  if ('e' in ra) {
    // The project here is gone: nothing here to keep in step.
    if (isGone(ra.e)) return endLink(live, 'gone-here', { clearHere: false, clearThere: true, there });
    return setState(live, 'error', wordsOf(ra.e), { remote: true, there });
  }
  if ('e' in rb) {
    if (isGone(rb.e)) return endLink(live, 'gone-there', { clearHere: true, clearThere: false, there });
    if (rb.e instanceof Unreachable) return setState(live, 'waiting', rb.e.message.includes('not reachable') ? rb.e.message : `Waiting for ${there.name}: ${rb.e.message}`);
    return setState(live, 'error', `${there.name}: ${wordsOf(rb.e)}`);
  }
  const sa = ra.v;
  const sb = rb.v;

  // Who stopped it: the mark is gone from one of the two projects.
  if (sa.mark?.link !== L.id) return endLink(live, 'here', { clearHere: false, clearThere: sb.mark?.link === L.id, there });
  if (sb.mark?.link !== L.id) {
    if (live.remoteMarked) return endLink(live, 'there', { clearHere: true, clearThere: false, there });
    // Its mark was never written (the machine went away just after it arrived): written now.
    await writeMarks(live, { remote: true, there });
  }

  if (L.hereName !== sa.details.name || L.thereName !== sb.details.name) {
    L.hereName = sa.details.name;
    L.thereName = sb.details.name;
  }
  watch(live, sa.files.folder ? spaceById(d.db, L.here)?.folder ?? null : null, dirsOf(sa));

  const base = loadBase(d.db, L.id);
  const names = { a: selfName(), b: there.name };
  // What each side lists is not all it has: a file that left a listing while it is still on disk (Git ignores it now, its folder
  // became a Python environment) is not deleted, and one that is new on the other side but there already is not new. So the merge
  // runs once without the mass-delete hold to see which paths those could be, the side that lacks them in its listing is asked
  // whether they are on disk, and the ones that are leave both listings and the base: they are no longer kept in step.
  let plan: FilePlan;
  let base2 = base;
  let planned: { a: SyncState['files']; b: SyncState['files'] };
  try {
    let hashes: Map<string, { a?: string | null; b?: string | null }> | undefined;
    let first = mergeFiles(sa.files, sb.files, base, { names, force: true });
    if (first.needHash.length) {
      const asked = first.needHash;
      const [ha, hb] = await Promise.all([here.hashes(L.here, asked), there.hashes(L.there, asked)]);
      hashes = new Map();
      for (const f of asked) {
        const k = keyOf(f.area, f.path);
        hashes.set(k, { a: ha[k] ?? null, b: hb[k] ?? null });
      }
      first = mergeFiles(sa.files, sb.files, base, { names, hashes, force: true });
    }
    const renamed = new Set(first.renames.map((r) => keyOf(r.area, r.path)));
    const ask = { a: new Map<string, { area: SyncArea; path: string }>(), b: new Map<string, { area: SyncArea; path: string }>() };
    // A removal on one side asks the other (it is gone from its listing); a copy onto a path it lacks asks it whether it is there.
    for (const r of first.removes) ask[r.side === 'a' ? 'b' : 'a'].set(keyOf(r.area, r.path), { area: r.area, path: r.path });
    for (const c of first.copies) if (c.expect === null && !renamed.has(keyOf(c.area, c.path))) ask[c.from === 'a' ? 'b' : 'a'].set(keyOf(c.area, c.path), { area: c.area, path: c.path });
    const onDisk = new Set<string>();
    await Promise.all(
      (['a', 'b'] as const).map(async (side) => {
        const files = [...ask[side].values()];
        for (let i = 0; i < files.length; i += 5000) {
          const stats = await (side === 'a' ? here : there).stats(side === 'a' ? L.here : L.there, files.slice(i, i + 5000));
          for (const [k, st] of Object.entries(stats)) if (st) onDisk.add(k);
        }
      }),
    );
    const without = (f: SyncState['files']): SyncState['files'] => ({
      folder: f.folder && f.folder.filter((x) => !onDisk.has(keyOf(x.area, x.path))),
      skills: f.skills && f.skills.filter((x) => !onDisk.has(keyOf(x.area, x.path))),
      wiki: f.wiki && f.wiki.filter((x) => !onDisk.has(keyOf(x.area, x.path))),
    });
    planned = onDisk.size ? { a: without(sa.files), b: without(sb.files) } : { a: sa.files, b: sb.files };
    if (onDisk.size) {
      base2 = new Map(base);
      for (const k of onDisk) base2.delete(k);
    }
    plan = mergeFiles(planned.a, planned.b, base2, { names, hashes, force });
  } catch (e) {
    if (e instanceof Unreachable) return setState(live, 'waiting', e.message);
    throw e;
  }
  const notes = mergeNotes(sa.notes, sb.notes, L.baseNotes, { force });
  const details = mergeDetails(sa.details, sb.details, L.baseDetails);

  const hasDetails = (x: object) => Object.keys(x).length > 0;
  const work = plan.renames.length + plan.removes.length + plan.copies.length;
  const flip = work ? setTimeout(() => void setState(live, 'syncing', undefined, { remote: true, there }), 2000) : null;
  flip?.unref();

  const outcome: Outcome = { copies: plan.copies.map(() => ({ ok: false })), removes: plan.removes.map(() => false), renames: plan.renames.map(() => ({ ok: false })) };
  const failures: { path: string; why: string; on: string }[] = [];
  let stopped: unknown = null;
  let detailsDone = !hasDetails(details.toA) && !hasDetails(details.toB);
  let notesDone = false;
  try {
    // Renames (a conflict's loser), removals, details and notes: one call to each machine.
    const bodyFor = (side: 'a' | 'b'): ApplyBody => {
      const b: ApplyBody = {};
      const rn = plan.renames.filter((r) => r.side === side).map((r) => ({ area: r.area, path: r.path, expect: { size: r.expect.size, mtime: r.expect.mtime }, to: r.to }));
      const rm = plan.removes.filter((r) => r.side === side).map((r) => ({ area: r.area, path: r.path, expect: { size: r.expect.size, mtime: r.expect.mtime } }));
      if (rn.length) b.rename = rn;
      if (rm.length) b.remove = rm;
      const dt = side === 'a' ? details.toA : details.toB;
      if (hasDetails(dt)) b.details = dt;
      const add = side === 'a' ? notes.addToA : notes.addToB;
      const forget = side === 'a' ? notes.forgetOnA : notes.forgetOnB;
      if (add.length) b.addNotes = add;
      if (forget.length) b.forgetNotes = forget;
      return b;
    };
    const apply = async (side: 'a' | 'b'): Promise<ApplyResult[] | null> => {
      const b = bodyFor(side);
      if (!Object.keys(b).length) return null;
      return (side === 'a' ? here : there).apply(side === 'a' ? L.here : L.there, b);
    };
    const [resA, resB] = await Promise.all([apply('a'), apply('b')]);
    const counters = { a: { rename: 0, remove: 0 }, b: { rename: 0, remove: 0 } };
    const take = (side: 'a' | 'b', res: ApplyResult[] | null, op: 'rename' | 'remove') => res?.filter((r) => r.op === op)[counters[side][op]++];
    plan.renames.forEach((r, i) => {
      const x = take(r.side, r.side === 'a' ? resA : resB, 'rename');
      outcome.renames[i] = { ok: !!x?.ok };
      if (x && !x.ok) failures.push({ path: r.path, why: x.why ?? 'changed', on: r.side });
    });
    plan.removes.forEach((r, i) => {
      const x = take(r.side, r.side === 'a' ? resA : resB, 'remove');
      outcome.removes[i] = !!x?.ok;
      if (x && !x.ok) failures.push({ path: r.path, why: x.why ?? 'changed', on: r.side });
    });
    const sideOk = (res: ApplyResult[] | null, op: 'details' | 'notes', needed: boolean) => !needed || !!res?.find((r) => r.op === op)?.ok;
    detailsDone = sideOk(resA, 'details', hasDetails(details.toA)) && sideOk(resB, 'details', hasDetails(details.toB));
    notesDone = sideOk(resA, 'notes', notes.addToA.length + notes.forgetOnA.length > 0) && sideOk(resB, 'notes', notes.addToB.length + notes.forgetOnB.length > 0);

    // Files: from the machine that has the newer one, in batches.
    const progress = { files: 0, bytes: 0, total: { files: plan.copies.length, bytes: plan.copies.reduce((n, c) => n + c.stat.size, 0) } };
    const batches: { from: 'a' | 'b'; items: number[] }[] = [];
    for (const from of ['a', 'b'] as const) {
      let cur: number[] = [];
      let bytes = 0;
      plan.copies.forEach((c, i) => {
        if (c.from !== from) return;
        if (cur.length && (cur.length >= BATCH_FILES || bytes + c.stat.size > BATCH_BYTES)) {
          batches.push({ from, items: cur });
          cur = [];
          bytes = 0;
        }
        cur.push(i);
        bytes += c.stat.size;
      });
      if (cur.length) batches.push({ from, items: cur });
    }
    for (const batch of batches) {
      if (signal.aborted) throw new Error('Cancelled');
      const src = batch.from === 'a' ? here : there;
      const dst = batch.from === 'a' ? there : here;
      const sp = batch.from === 'a' ? L.here : L.there;
      const dp = batch.from === 'a' ? L.there : L.here;
      const files = batch.items.map((i) => {
        const c = plan.copies[i];
        return { area: c.area, path: c.path, size: c.stat.size, mtime: c.stat.mtime, expect: c.expect ? { size: c.expect.size, mtime: c.expect.mtime } : null };
      });
      const before = { files: progress.files, bytes: progress.bytes };
      let results;
      try {
        const raw = await src.pull(sp, files, signal);
        const tapped = tapBundle(raw, (n) => {
          live.progress = { files: before.files + n.files, bytes: before.bytes + n.bytes, total: progress.total };
          emitLink(live);
        });
        results = await dst.push(dp, tapped, signal);
      } catch (e) {
        if (e instanceof Unreachable || signal.aborted) throw e;
        for (const i of batch.items) failures.push({ path: plan.copies[i].path, why: wordsOf(e), on: batch.from === 'a' ? 'b' : 'a' });
        continue;
      }
      const byKey = new Map(results.map((r) => [keyOf(r.area as never, r.path), r]));
      for (const i of batch.items) {
        const c = plan.copies[i];
        const r = byKey.get(keyOf(c.area, c.path));
        progress.files++;
        progress.bytes += c.stat.size;
        if (r?.ok && r.size !== undefined && r.mtime !== undefined) outcome.copies[i] = { ok: true, written: { size: r.size, mtime: r.mtime } };
        else failures.push({ path: c.path, why: r?.why ?? 'changed', on: batch.from === 'a' ? 'b' : 'a' });
      }
    }
  } catch (e) {
    stopped = e;
  } finally {
    clearTimeout(flip ?? undefined);
  }
  if (live.dead) return;

  // What happened is what the next round starts from (also when it stopped half way).
  const next = settle(base2, plan, outcome);
  saveBase(d.db, L.id, base, next);
  if (detailsDone) L.baseDetails = details.base;
  if (notesDone) L.baseNotes = notes.base;

  if (signal.aborted && !stopped) stopped = new Error('Cancelled');
  if (stopped && signal.aborted) return;

  // Conflicts kept both: told once.
  const found = plan.conflicts.filter((_, i) => outcome.renames[i]?.ok);
  if (found.length) {
    const at = Date.now();
    const week = at - 7 * 86_400_000;
    L.conflicts = [...found.map((c) => ({ path: c.path, copy: c.copy, at })), ...(L.conflicts ?? [])].filter((c) => c.at > week).slice(0, 10);
    notice({
      kind: 'waiting',
      title: `Changed on both machines: “${L.hereName}”`,
      body: found.length === 1 ? `${found[0].path} changed on both. Both are kept: ${found[0].copy}` : `${found[0].path} and ${plural(found.length - 1, 'other file')} changed on both. Both are kept.`,
      url: projectUrl('', L.here),
    });
  }

  const hard = failures.filter((f) => f.why !== 'changed');
  const heldWords = [
    ...plan.held.map((h) => `Sync would remove ${plural(h.count, 'file')} on ${h.side === 'a' ? names.a : names.b}`),
    ...notes.held.map((h) => `Sync would forget ${plural(h.count, 'note')} on ${h.side === 'a' ? names.a : names.b}`),
  ];
  if (stopped) {
    if (stopped instanceof Unreachable) await setState(live, 'waiting', stopped.message, { remote: false });
    else await setState(live, 'error', wordsOf(stopped), { remote: true, there });
  } else if (heldWords.length) {
    await setState(live, 'held', `${heldWords.join('; ')}: Sync anyway, or Stop syncing`, { remote: true, there });
  } else if (hard.length) {
    const f = hard[0];
    await setState(live, 'error', `${plural(hard.length, 'file')} could not be updated on ${f.on === 'a' ? names.a : names.b} (${f.path}: ${f.why})`, { remote: true, there });
  } else {
    L.at = Date.now();
    if (failures.length) live.retrySoon = true;
    L.state = 'ok';
    delete L.error;
    saveLink(d.db, L);
    emitLink(live, true);
    await writeMarks(live, { remote: true, there });
    return;
  }
  saveLink(d.db, L);
  if (failures.length) live.retrySoon = true;
}

// ---- the routes ----------------------------------------------------------------------------------------------

function hubRoutes(d: Deps) {
  const q = (req: { query: unknown }) => (req.query ?? {}) as Record<string, string | undefined>;
  const id = (req: { params: unknown }) => String((req.params as { id: string }).id);
  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw http(e);
    }
  };

  // What it would carry from one machine and where it would go on the other.
  d.app.get('/api/machines/projects/plan', async (req) => {
    const a = q(req);
    if (!a.project) throw new HttpError(400, 'Which project?');
    return wrap(async () => {
      const { plan, place } = await planFor({ from: a.from ?? '', project: a.project!, to: a.to ?? '', leaveOut: a.leaveOut !== '0', also: a.also === '1' });
      return { plan, place };
    });
  });
  d.app.post('/api/machines/projects/send', async (req) => ({ transfer: await send((req.body ?? {}) as SendBody) }));
  d.app.get('/api/machines/projects/transfers', async () => ({ transfers: listTransfers() }));
  d.app.delete('/api/machines/projects/transfers/:id', async (req) => ({ transfer: cancelTransfer(id(req)) }));
  d.app.get('/api/machines/projects/links', async () => ({ links: [...lives.values()].map((l) => linkOf(l.row, l)) }));
  d.app.post('/api/machines/projects/links/:id/sync', async (req) => {
    const live = lives.get(id(req));
    if (!live) throw new HttpError(404, 'No such link');
    want(live, (req.body as { force?: unknown } | null)?.force === true);
    return { link: linkOf(live.row, live) };
  });
  d.app.delete('/api/machines/projects/links/:id', async (req) => {
    await stopLink(id(req));
    return { ok: true };
  });
}

export const projectHub: Feature = {
  id: 'project-hub',
  routes(d) {
    deps = d;
    useTransferLocal(d);
    syncRoutes(d);
    hubRoutes(d);
  },
  start(d) {
    deps = d;
    tables(d.db);
    d.db.prepare("update project_links set state = 'ok' where state = 'syncing'").run();
    const rows = (d.db.prepare('select * from project_links order by created_at').all() as Row[]).map(rowOf);
    rows.forEach((L, i) => {
      const live: Live = { row: L, running: false, queued: false, again: false, force: false, retrySoon: false, dead: false, remoteMarked: true, lastMark: {} };
      lives.set(L.id, live);
      // A round at start, a few at a time once the machines have connected.
      schedule(live, 4000 + i * 1000);
    });
  },
  stop() {
    for (const live of lives.values()) {
      live.dead = true;
      live.ac?.abort();
      clearTimeout(live.timer);
      clearTimeout(live.debounce);
      live.watcher?.close();
    }
    for (const r of transfers.values()) if (!r.t.endedAt) r.ac.abort();
  },
};
