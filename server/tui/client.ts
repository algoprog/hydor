// How `hydor` reaches a Hydor server: another computer's by its address and an access token (--server and --token, or
// HYDOR_URL and HYDOR_TOKEN), or this computer's, at the port its settings give, with a token the command line makes
// once in the database and keeps in the data folder (shared with `hydor app …`; Settings → Machines lists it as
// "This computer’s command line"). When nothing answers here, it starts the server in the background and leaves it
// running, as the service would. The API's errors come back in the server's own words; the event socket subscribes
// to sessions, pings, and reconnects with backoff (as web/src/lib/ws.ts does).
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import type { ClientEvent, ServerEvent } from '../../shared/types.ts';
import { UsageError } from './areas/kit.ts';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** What a session has spent at API prices, its child sessions' with it (GET /api/budget/:key); null when the server cannot say. */
export interface Spent {
  spentUsd: number;
  ownUsd: number;
  childrenUsd: number;
}

export interface Conn {
  /** The server's address, without a slash at its end. */
  base: string;
  /** This computer's server (its token made here). */
  local: boolean;
  /** The server runs on this computer (its own, or one named at a loopback address): a folder here is a folder there. */
  here: boolean;
  /** The server's version, from its health check. */
  version: string;
  /** Calls the API; the server's `{ error }` as an ApiError. */
  api<T = any>(method: string, p: string, body?: unknown, o?: { timeoutMs?: number }): Promise<T>;
  /** The event socket (opened on first use, one per connection). */
  events(): Events;
  /** A page of the web app: a session's when given its key. */
  url(key?: string): string;
  close(): void;
}

const LOCAL_HOSTS = /^(127\.\d+\.\d+\.\d+|localhost|\[::1\])$/;

/** The token file and the name the command line's token has in Settings → Machines. */
const TOKEN_FILE = 'cli-token';
const TOKEN_NAME = 'This computer’s command line';

/** This computer's command-line token: the one kept in the data folder, or a new one made in the database (`fresh`). */
async function localToken(fresh: boolean): Promise<string> {
  const { config, ensureDirs } = await import('../config.ts');
  const file = path.join(config.dataDir, TOKEN_FILE);
  if (!fresh) {
    try {
      const t = fs.readFileSync(file, 'utf8').trim();
      if (t) return t;
    } catch {}
  }
  ensureDirs();
  const { openDb } = await import('../db.ts');
  const { createAccessToken } = await import('../machines.ts');
  const db = openDb();
  try {
    const t = createAccessToken(db, TOKEN_NAME).token;
    fs.writeFileSync(file, t, { mode: 0o600 });
    return t;
  } finally {
    db.close();
  }
}

/** Whether a Hydor answers at `base`: its version, or null. */
export async function health(base: string, timeoutMs = 3000): Promise<string | null> {
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const j = (await r.json()) as { ok?: boolean; version?: string };
    return j.ok ? (j.version ?? '?') : null;
  } catch {
    return null;
  }
}

/** The address of this computer's server, from PORT and HOST as the server reads them. */
export async function localBase(): Promise<string> {
  const { config } = await import('../config.ts');
  const h = config.host;
  const host = !h || h === '0.0.0.0' || h === '::' || LOCAL_HOSTS.test(h) ? '127.0.0.1' : h.includes(':') ? `[${h}]` : h;
  return `http://${host}:${config.port}`;
}

/** Starts this computer's server in the background (its output to logs/terminal-server.log) and waits for it. */
export async function startServer(base: string, say: (s: string) => void): Promise<string> {
  // Inside the Mac app (its `hydor` sets HYDOR_APP_BUNDLE) the app owns the server, its restarts and its updates:
  // a server of this command's own would hold the port. Opening the app (in the background) starts it.
  const bundle = process.env.HYDOR_APP_BUNDLE;
  if (bundle && process.platform === 'darwin') {
    spawn('open', ['-g', '-a', bundle], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    const t0 = Date.now();
    let told = false;
    while (Date.now() - t0 < 90_000) {
      const v = await health(base, 1500);
      if (v) return v;
      if (!told && Date.now() - t0 > 1000) {
        say('Opening Hydor…');
        told = true;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new ApiError(0, 'Hydor did not start in time: open the Hydor app, then try again.');
  }
  const { APP_ROOT, config, ensureDirs, paths } = await import('../config.ts');
  const entry = path.join(APP_ROOT, 'dist/server/index.js');
  if (!fs.existsSync(entry)) throw new ApiError(0, `Hydor is not running here, and it is not built yet: npm ci && npm run build (in ${APP_ROOT})`);
  ensureDirs();
  const log = path.join(paths.logs, 'terminal-server.log');
  const fd = fs.openSync(log, 'a');
  const child = spawn(process.execPath, [entry], { cwd: APP_ROOT, detached: true, stdio: ['ignore', fd, fd], env: { NODE_ENV: 'production', ...process.env, PORT: String(config.port) } });
  child.unref();
  fs.closeSync(fd);
  const t0 = Date.now();
  let told = false;
  while (Date.now() - t0 < 60_000) {
    const v = await health(base, 1500);
    if (v) return v;
    if (!told && Date.now() - t0 > 1000) {
      say('Starting Hydor…');
      told = true;
    }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new ApiError(0, `Hydor did not start: see ${log}`);
}

/**
 * A connection to a Hydor: the one named (`server`, `token`, or HYDOR_URL and HYDOR_TOKEN), else this computer's,
 * started first when nothing answers (unless `start` is false).
 */
export async function connect(o: { server?: string; token?: string; start?: boolean; say?: (s: string) => void } = {}): Promise<Conn> {
  const named = (o.server ?? process.env.HYDOR_URL ?? '').trim().replace(/\/+$/, '');
  let token = (o.token ?? process.env.HYDOR_TOKEN ?? '').trim();
  let base: string;
  let local: boolean;
  if (named) {
    if (!/^https?:\/\//.test(named)) throw new UsageError(`--server takes an address like https://hydor.example.com (it was “${named}”)`);
    base = named;
    local = LOCAL_HOSTS.test(new URL(named).hostname) && !token;
    if (!token && !local) throw new UsageError('Give that Hydor’s access token too: --token (run `hydor access-token` there to make one), or HYDOR_TOKEN');
  } else {
    base = await localBase();
    local = !token;
  }
  let version = await health(base);
  if (!version) {
    if (named || o.start === false) throw new ApiError(0, `Hydor does not answer at ${base}${named ? '' : ': start it with `hydor serve`, or `hydor service install` to keep it running'}`);
    version = await startServer(base, o.say ?? ((s) => process.stderr.write(`${s}\n`)));
  }
  if (local) token = await localToken(false);
  let remade = false;
  let socket: Events | null = null;

  const call = async (method: string, p: string, body?: unknown, timeoutMs = 60_000): Promise<Response> => {
    try {
      return await fetch(base + p, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if ((e as Error).name === 'TimeoutError') throw new ApiError(0, `Hydor took too long to answer (${method} ${p.split('?')[0]})`);
      throw new ApiError(0, `Hydor does not answer at ${base}`);
    }
  };

  const conn: Conn = {
    base,
    local,
    here: local || LOCAL_HOSTS.test(new URL(base).hostname),
    version,
    async api<T>(method: string, p: string, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
      let r = await call(method, p, body, opts.timeoutMs);
      if (r.status === 401 && local && !remade) {
        // The kept token is no longer known there (revoked, or another data folder): made again, once.
        remade = true;
        token = await localToken(true);
        socket?.setToken(token);
        r = await call(method, p, body, opts.timeoutMs);
      }
      const text = await r.text();
      let data: any = text;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {}
      if (!r.ok) {
        const msg = data && typeof data === 'object' && typeof data.error === 'string' ? data.error : `${r.status} ${String(text).slice(0, 200)}`;
        if (r.status === 401 && local) throw new ApiError(401, `This computer’s Hydor refused the command line’s token: does it use another data folder (DATA_DIR)? (${msg})`);
        throw new ApiError(r.status, msg);
      }
      return data as T;
    },
    events() {
      if (!socket) {
        socket = new Events(base.replace(/^http/, 'ws') + '/ws', token);
        socket.start();
      }
      return socket;
    },
    url(key) {
      return key ? `${base}/s/${encodeURIComponent(key)}` : base;
    },
    close() {
      socket?.stop();
    },
  };
  return conn;
}

/** What a session has spent, its child sessions' with it, as the server adds it up; null when it cannot say (an older server). */
export async function spentOf(conn: Conn, key: string): Promise<Spent | null> {
  try {
    const b = await conn.api<Partial<Spent>>('GET', `/api/budget/${enc(key)}`, undefined, { timeoutMs: 15_000 });
    return typeof b.spentUsd === 'number' ? { spentUsd: b.spentUsd, ownUsd: b.ownUsd ?? b.spentUsd, childrenUsd: b.childrenUsd ?? 0 } : null;
  } catch {
    return null;
  }
}

/**
 * The server's event socket: subscriptions kept across reconnects (each sent again, after which the server sends the
 * session's live state again), a ping every 25 s, and reconnects with backoff. Emits `event` (a ServerEvent), `up`
 * and `down`.
 */
export class Events extends EventEmitter {
  private ws: WebSocket | null = null;
  private subs = new Set<string>();
  private backoff = 500;
  private timer: NodeJS.Timeout | null = null;
  private pinger: NodeJS.Timeout | null = null;
  private stopped = true;
  up = false;

  constructor(
    private url: string,
    private token: string,
  ) {
    super();
    this.setMaxListeners(50);
  }

  setToken(t: string) {
    this.token = t;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.pinger) clearInterval(this.pinger);
    try {
      this.ws?.terminate();
    } catch {}
    this.ws = null;
  }

  private send(m: ClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private connect() {
    const ws = new WebSocket(this.url, { headers: { authorization: `Bearer ${this.token}` }, handshakeTimeout: 10_000 });
    this.ws = ws;
    ws.on('open', () => {
      this.backoff = 500;
      for (const key of this.subs) this.send({ t: 'sub', key });
      this.pinger = setInterval(() => this.send({ t: 'ping' }), 25_000);
      this.pinger.unref?.();
      this.setUp(true);
    });
    ws.on('message', (raw) => {
      let e: ServerEvent;
      try {
        e = JSON.parse(String(raw));
      } catch {
        return;
      }
      this.emit('event', e);
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (this.pinger) clearInterval(this.pinger);
      this.pinger = null;
      if (this.ws === ws) this.ws = null;
      this.setUp(false);
      if (this.stopped) return;
      this.timer = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 1.8, 10_000);
    });
  }

  private setUp(up: boolean) {
    if (this.up === up) return;
    this.up = up;
    this.emit(up ? 'up' : 'down');
  }

  /** Follows a session (or another channel) until unsub. */
  sub(key: string) {
    if (this.subs.has(key)) return;
    this.subs.add(key);
    this.send({ t: 'sub', key });
  }

  unsub(key: string) {
    if (!this.subs.delete(key)) return;
    this.send({ t: 'unsub', key });
  }

  /** Waits until the socket is up (or `ms` passed): true when it is. */
  ready(ms = 10_000): Promise<boolean> {
    if (this.up) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => (this.off('up', on), resolve(false)), ms);
      const on = () => (clearTimeout(t), resolve(true));
      this.once('up', on);
    });
  }
}

/** A session's key in a path. */
export const enc = (key: string) => encodeURIComponent(key);
