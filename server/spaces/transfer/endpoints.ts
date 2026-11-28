// One way to ask a machine about its projects, whether it is this server (direct calls) or a machine of Settings → Machines
// (its /api/projects/… routes, through the access token; streams have no timeout and end when the transfer's AbortSignal
// fires, JSON calls give up after 30 s, those that walk a folder after two minutes). The hub (hub.ts) reads from one and
// writes to the other without caring which is which.
//
// A machine that has no such routes (404) or runs a Hydor older than TRANSFER_SINCE is named in words: "GPU box runs Hydor
// 0.119.0: update it there to send projects to it". One that does not answer says why, as Settings → Machines does.
import type http from 'node:http';
import os from 'node:os';
import { Readable } from 'node:stream';
import type { ClientView, MachineView } from '../../../shared/types.ts';
import { compareVersions } from '../../../shared/releases.ts';
import type { ArrivalPlace, Arrived, CarryPlan, MachineRef, ProjectSyncMark, SendHow, SyncState } from '../../../shared/transfer.ts';
import { isClientRef, TRANSFER_SINCE } from '../../../shared/transfer.ts';
import { HttpError } from '../../auth.ts';
import { config } from '../../config.ts';
import type { Deps } from '../../features/types.ts';
import { machineId } from '../../machines.ts';
import { arrivalPlace, arrive, leave } from './arrive.ts';
import { carryBundle, carryPlan } from './carry.ts';
import { syncApply, syncHashes, syncPull, syncPush, syncState, syncStats, setSyncMark, type ApplyBody, type ApplyResult, type AskedFile, type PullFile, type PushResult } from './sync-endpoint.ts';

/** What a machine says about itself (GET /api/machine). */
export interface MachineFacts {
  host: string;
  version: string;
  home: string;
  platform: string;
  id: string;
}

export interface ArriveRequest {
  folder: string;
  how: SendHow;
  from: string;
  also?: string[];
  signal?: AbortSignal;
}

export interface Endpoint {
  ref: MachineRef;
  /** What to call it in words: the machine's name in Settings → Machines, or this server's host name. */
  name: string;
  info(): Promise<MachineFacts>;
  plan(project: string, o: { leaveOut: boolean; also: boolean }): Promise<CarryPlan>;
  place(q: { name?: string; rel?: string; also?: string[] }): Promise<ArrivalPlace>;
  bundle(project: string, o: { leaveOut: boolean; also: boolean }, signal?: AbortSignal): Promise<Readable>;
  arrive(stream: Readable, o: ArriveRequest): Promise<Arrived>;
  leave(project: string, to: string): Promise<{ ok: true; trashed: string | null; kept?: string }>;
  state(project: string): Promise<SyncState>;
  hashes(project: string, files: AskedFile[]): Promise<Record<string, string | null>>;
  /** Whether each path is on disk (size and time), listed in its state or not: null when nothing is there. */
  stats(project: string, files: AskedFile[]): Promise<Record<string, { size: number; mtime: number } | null>>;
  pull(project: string, files: PullFile[], signal?: AbortSignal): Promise<Readable>;
  push(project: string, stream: Readable, signal?: AbortSignal): Promise<PushResult[]>;
  apply(project: string, body: ApplyBody): Promise<ApplyResult[]>;
  /** Sets or clears its mark; `ifLink`: only when its mark is that link's (so a link that ended never clears another's). */
  mark(project: string, mark: ProjectSyncMark | null, ifLink?: string): Promise<void>;
}

/** The project there is gone (or never was). */
export class Gone extends Error {
  override name = 'Gone';
}
/** The machine could not be reached, or does not do this (said in words, with its name). */
export class Unreachable extends Error {
  override name = 'Unreachable';
}
/** What a machine's API answered with an error. */
export class RemoteError extends Error {
  override name = 'RemoteError';
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** What this module needs of server/machines.ts (set once the server has made it). */
export interface MachinesFor {
  list(): MachineView[];
  get(id: string): {
    def: { name: string };
    status: { state: string; error?: string };
    request(method: string, p: string, headers?: http.OutgoingHttpHeaders, timeoutMs?: number): Promise<http.ClientRequest>;
    reason(e: unknown): string;
    /** Sends a frame up the machine's open socket (false: there is none). */
    tell(frame: unknown): boolean;
  };
  /** Who answers what a machine of the list asks of this server over its socket. */
  setCallHandler(h: { call(machine: { id: string; name: string }, op: string, args: unknown): Promise<unknown>; back(machine: { id: string; name: string }): void } | null): void;
}

/** What this module needs of server/machine-clients.ts: the machines that use this one and are connected now. */
export interface ClientsFor {
  list(): ClientView[];
  get(ref: string): ClientView | undefined;
  call(ref: string, op: string, args: unknown, timeoutMs: number): Promise<unknown>;
  /** 'transfer' (ref, handoff, Transfer), 'gone' (ref) and 'back' (ref). */
  on(event: string, fn: (...a: any[]) => void): unknown;
  off(event: string, fn: (...a: any[]) => void): unknown;
}

let machines: MachinesFor | null = null;
let clients: ClientsFor | null = null;
let local: Pick<Deps, 'db' | 'broadcast' | 'sessions'> | null = null;

export function useTransferMachines(m: MachinesFor) {
  machines = m;
}
export function useTransferClients(c: ClientsFor) {
  clients = c;
}
/** The machines of Settings → Machines, and those that use this one (null before the server has made them). */
export const transferMachines = () => machines;
export const transferClients = () => clients;
/** This server's own projects (set by the hub's routes, which get the app's deps). */
export function useTransferLocal(d: Pick<Deps, 'db' | 'broadcast' | 'sessions'>) {
  local = d;
}

/** This server's name in words: its host name. */
export const selfName = () => os.hostname();

export const SHORT = 30_000;
export const LONG = 120_000;
const enc = encodeURIComponent;

const FACTS_FOR = 60_000;
const facts = new Map<string, { at: number; facts: MachineFacts }>();

// ---- this server ---------------------------------------------------------------------------------------------

function localEndpoint(): Endpoint {
  const d = local;
  if (!d) throw new HttpError(503, 'The app is still starting');
  return {
    ref: '',
    name: selfName(),
    async info() {
      return { host: os.hostname(), version: config.version, home: config.home, platform: process.platform, id: machineId(d.db) };
    },
    plan: async (id, o) => carryPlan(d.db, id, o),
    place: async (q) => arrivalPlace(d.db, q, config.version),
    bundle: async (id, o) => carryBundle(d.db, id, o),
    arrive: async (stream, o) => arrive(d, stream, { folder: o.folder, how: o.how, from: o.from, also: o.also, signal: o.signal }),
    leave: async (id, to) => leave(d, id, { to }),
    state: async (id) => syncState(d, id),
    hashes: async (id, files) => (await syncHashes(d, id, files)).hashes,
    stats: async (id, files) => (await syncStats(d, id, files)).stats,
    pull: async (id, files) => syncPull(d, id, files),
    push: async (id, stream, signal) => (await syncPush(d, id, stream, { signal })).results,
    apply: async (id, body) => (await syncApply(d, id, body)).results,
    mark: async (id, mark, ifLink) => void setSyncMark(d, id, mark, ifLink),
  };
}

// ---- a machine of Settings → Machines ------------------------------------------------------------------------

function remoteEndpoint(ref: string): Endpoint {
  if (!machines) throw new HttpError(503, 'The app is still starting');
  const m = machines.get(ref);
  const name = m.def.name;
  const down = () => new Unreachable(`${name} is not reachable: ${m.status.error ?? 'it did not answer'}`);
  const unreachable = (e: unknown) => (e instanceof Unreachable ? e : new Unreachable(`${name} is not reachable: ${m.reason(e)}`));
  const tooOld = (v: string | undefined, dir: 'to' | 'from') => new Unreachable(`${name} runs Hydor ${v ?? 'an older version'}: update it there to send projects ${dir} it`);

  /** A request with its answer's head read; JSON bodies are read to the end, streams are left to the caller. */
  const open = async (dir: 'to' | 'from', method: string, p: string, o: { body?: unknown; stream?: Readable; timeoutMs?: number; signal?: AbortSignal; octet?: boolean } = {}): Promise<http.IncomingMessage> => {
    if (m.status.state === 'offline') throw down();
    const json = o.body !== undefined;
    let req: http.ClientRequest;
    try {
      req = await m.request(method, p, { accept: 'application/json', ...(json ? { 'content-type': 'application/json' } : o.octet ? { 'content-type': 'application/octet-stream' } : {}) }, o.timeoutMs ?? SHORT);
    } catch (e) {
      throw unreachable(e);
    }
    return new Promise<http.IncomingMessage>((resolve, reject) => {
      const stop = () => req.destroy(new Error('Cancelled'));
      if (o.signal?.aborted) stop();
      o.signal?.addEventListener('abort', stop, { once: true });
      const done = () => o.signal?.removeEventListener('abort', stop);
      req.on('response', (r) => {
        r.once('close', done);
        resolve(r);
      });
      req.on('error', (e) => {
        done();
        o.stream?.destroy();
        reject(o.signal?.aborted ? new Error('Cancelled') : unreachable(e));
      });
      if (o.stream) {
        o.stream.on('error', (e) => req.destroy(e));
        o.stream.pipe(req);
      } else req.end(json ? JSON.stringify(o.body) : undefined);
    }).then(async (r) => {
      if (r.statusCode && r.statusCode < 400) return r;
      // An error answer: its words, with what it means for this machine.
      let text = '';
      r.setEncoding('utf8');
      for await (const c of r) text += c;
      o.stream?.destroy();
      let j: { error?: string } | null = null;
      try {
        j = JSON.parse(text);
      } catch {}
      const status = r.statusCode ?? 0;
      if (status === 401) throw new Unreachable(`${name} refused the access token: make a new one there (Settings → Machines) and paste it here`);
      if (status === 404 && /^not found$/i.test(String(j?.error ?? ''))) throw tooOld(facts.get(ref)?.facts.version, dir);
      throw new RemoteError(status, j?.error ?? `${name} answered ${status}`);
    });
  };

  const text = async (r: http.IncomingMessage) => {
    let s = '';
    r.setEncoding('utf8');
    for await (const c of r) s += c;
    return s;
  };
  const jsonOf = async <T>(r: http.IncomingMessage): Promise<T> => {
    try {
      return JSON.parse(await text(r)) as T;
    } catch {
      throw new Unreachable(`${name} did not answer as Hydor does`);
    }
  };
  const gone = <T>(p: Promise<T>): Promise<T> =>
    p.catch((e) => {
      if (e instanceof RemoteError && e.status === 404 && /no such project/i.test(e.message)) throw new Gone(e.message);
      throw e;
    });

  const info = async (): Promise<MachineFacts> => {
    const hit = facts.get(ref);
    if (hit && Date.now() - hit.at < FACTS_FOR) return hit.facts;
    const r = await open('to', 'GET', '/api/machine');
    const j = await jsonOf<Partial<MachineFacts>>(r);
    const f: MachineFacts = { host: String(j.host ?? name), version: String(j.version ?? ''), home: String(j.home ?? ''), platform: String(j.platform ?? ''), id: String(j.id ?? '') };
    facts.set(ref, { at: Date.now(), facts: f });
    return f;
  };
  /** It must be new enough to have the routes. */
  const ready = async (dir: 'to' | 'from') => {
    const f = await info();
    if (!f.version || compareVersions(f.version, TRANSFER_SINCE) < 0) throw tooOld(f.version, dir);
  };
  const query = (o: { leaveOut: boolean; also: boolean }) => `leaveOut=${o.leaveOut ? 1 : 0}&also=${o.also ? 1 : 0}`;
  const call = async <T>(dir: 'to' | 'from', method: string, p: string, o: { body?: unknown; timeoutMs?: number } = {}): Promise<T> => {
    await ready(dir);
    return gone(open(dir, method, p, o).then((r) => jsonOf<T>(r)));
  };

  return {
    ref,
    name,
    info,
    plan: (id, o) => call('from', 'GET', `/api/projects/${enc(id)}/carry?${query(o)}`, { timeoutMs: LONG }),
    place: (q) => call('to', 'GET', `/api/projects/arrival?${new URLSearchParams({ ...(q.name ? { name: q.name } : {}), ...(q.rel ? { rel: q.rel } : {}), ...(q.also ? { also: JSON.stringify(q.also) } : {}) })}`),
    async bundle(id, o, signal) {
      await ready('from');
      return gone(open('from', 'GET', `/api/projects/${enc(id)}/carry/bundle?${query(o)}`, { timeoutMs: 0, signal }));
    },
    async arrive(stream, o) {
      try {
        await ready('to');
      } catch (e) {
        stream.destroy();
        throw e;
      }
      const q = new URLSearchParams({ folder: o.folder, how: o.how, from: o.from, ...(o.also ? { also: JSON.stringify(o.also) } : {}) });
      return jsonOf<Arrived>(await open('to', 'POST', `/api/projects/arrive?${q}`, { stream, octet: true, timeoutMs: 0, signal: o.signal }));
    },
    leave: (id, to) => call('from', 'POST', `/api/projects/${enc(id)}/leave`, { body: { to } }),
    state: (id) => call('to', 'GET', `/api/projects/${enc(id)}/sync/state`, { timeoutMs: LONG }),
    stats: async (id, files) => (await call<{ stats: Record<string, { size: number; mtime: number } | null> }>('to', 'POST', `/api/projects/${enc(id)}/sync/hashes`, { body: { files, stat: true }, timeoutMs: LONG })).stats,
    hashes: async (id, files) => (await call<{ hashes: Record<string, string | null> }>('to', 'POST', `/api/projects/${enc(id)}/sync/hashes`, { body: { files }, timeoutMs: LONG })).hashes,
    async pull(id, files, signal) {
      await ready('from');
      return gone(open('from', 'POST', `/api/projects/${enc(id)}/sync/pull`, { body: { files }, timeoutMs: 0, signal }));
    },
    async push(id, stream, signal) {
      try {
        await ready('to');
      } catch (e) {
        stream.destroy();
        throw e;
      }
      const r = await gone(open('to', 'POST', `/api/projects/${enc(id)}/sync/push`, { stream, octet: true, timeoutMs: 0, signal }));
      return (await jsonOf<{ results: PushResult[] }>(r)).results;
    },
    apply: async (id, body) => (await call<{ results: ApplyResult[] }>('to', 'POST', `/api/projects/${enc(id)}/sync/apply`, { body })).results,
    mark: async (id, mark, ifLink) => void (await call('to', 'PUT', `/api/projects/${enc(id)}/sync/mark`, { body: { mark, ...(ifLink ? { link: ifLink } : {}) } })),
  };
}

// ---- a machine that uses this one ----------------------------------------------------------------------------

/** It cannot be reached from here: it is asked what is needed to plan, and sends the project itself (hub.ts). */
function clientEndpoint(ref: string): Endpoint {
  if (!clients) throw new HttpError(503, 'The app is still starting');
  const c = clients.get(ref);
  if (!c) throw new HttpError(404, 'That machine is not connected now: open Hydor there');
  // An older Hydor would not answer the calls below at all: said at once, not after a wait.
  if (!c.takes) throw new HttpError(409, `${c.name} runs an older Hydor: update it there to send projects to it`);
  const name = c.name;
  const never = async (): Promise<never> => {
    throw new Unreachable(`${name} takes projects from here only by sending them itself`);
  };
  return {
    ref,
    name,
    async info() {
      const j = ((await clients!.call(ref, 'info', {}, SHORT)) ?? {}) as Partial<MachineFacts>;
      return { host: String(j.host ?? name), version: String(j.version ?? ''), home: String(j.home ?? ''), platform: String(j.platform ?? ''), id: String(j.id ?? '') };
    },
    place: async (q) => (await clients!.call(ref, 'place', q, LONG)) as ArrivalPlace,
    plan: never,
    bundle: never,
    arrive: never,
    leave: never,
    state: never,
    hashes: never,
    stats: never,
    pull: never,
    push: never,
    apply: never,
    mark: never,
  };
}

/** The endpoint of a machine: '' for this server, a machine that uses this one ('c:…'), else the id of one in Settings → Machines. */
export function endpointOf(ref: MachineRef): Endpoint {
  return ref === '' ? localEndpoint() : isClientRef(ref) ? clientEndpoint(ref) : remoteEndpoint(ref);
}

/** Whether an error says the project there is gone. */
export const isGone = (e: unknown) => e instanceof Gone || ((e as { status?: number })?.status === 404 && /no such project/i.test((e as Error).message));

/** The words of an error for a person: a plain message, without the class's name. */
export const wordsOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
