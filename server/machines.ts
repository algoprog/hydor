// Other machines running Agent Console, used from this one. The app shows one machine at a time: under
// /m/<id>/ its pages call that machine's API and sockets, which this server forwards there with an
// access token made on that machine (Settings → Machines). A machine is reached by URL (on a VPN or a
// private network) or over SSH, through a tunnel this server keeps open to the Agent Console listening
// there on 127.0.0.1.
//
// While a machine is connected this server follows its events too: it counts the sessions there that
// need you and passes its notices on (to the app and as push notifications).
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import type { MachineStatus, MachineView, NotifyEvent, SessionSummary } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { config } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';

/** What another Agent Console reports about the machine it runs on. */
export function machineInfo() {
  let user = '';
  try {
    user = os.userInfo().username;
  } catch {}
  return { host: os.hostname(), version: config.version, home: config.home, platform: process.platform, user };
}

// ---- access tokens: other machines using this one ------------------------------------------------

interface AccessToken {
  id: string;
  name: string;
  hash: string;
  createdAt: number;
  lastUsed?: number;
}

const hashOf = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const TOKEN_PREFIX = 'acm_';

export function accessTokens(db: DB): AccessToken[] {
  try {
    return JSON.parse(kvGet(db, 'machine_tokens') ?? '[]');
  } catch {
    return [];
  }
}

/** A new token; its value is returned once and only its hash is kept. */
export function createAccessToken(db: DB, name: string): { id: string; token: string } {
  const token = `${TOKEN_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
  const t: AccessToken = { id: crypto.randomBytes(4).toString('hex'), name: name.trim().slice(0, 60) || 'Another machine', hash: hashOf(token), createdAt: Date.now() };
  kvSet(db, 'machine_tokens', JSON.stringify([...accessTokens(db), t]));
  return { id: t.id, token };
}

export function revokeAccessToken(db: DB, id: string) {
  kvSet(db, 'machine_tokens', JSON.stringify(accessTokens(db).filter((t) => t.id !== id)));
}

/** The access token in an Authorization header, when there is one (other headers are not ours). */
export function bearerOf(header: unknown): string | null {
  const m = /^Bearer\s+(acm_\S+)$/i.exec(String(header ?? ''));
  return m ? m[1] : null;
}

export function accessOk(db: DB, token: string): boolean {
  const h = Buffer.from(hashOf(token));
  const list = accessTokens(db);
  const t = list.find((x) => crypto.timingSafeEqual(Buffer.from(x.hash), h));
  if (!t) return false;
  // At most one write a minute for "last used".
  if (!t.lastUsed || Date.now() - t.lastUsed > 60_000) {
    t.lastUsed = Date.now();
    kvSet(db, 'machine_tokens', JSON.stringify(list));
  }
  return true;
}

// ---- the machines this one uses -------------------------------------------------------------------

interface MachineDef {
  id: string;
  name: string;
  via: 'url' | 'ssh';
  url?: string;
  ssh?: string;
  port?: number;
  /** The access token made on that machine; it never leaves this server. */
  token: string;
}

const TUNNEL_DIR = path.join(config.dataDir, 'machines');
const DEFAULT_PORT = 8790;

/** Where a machine's server answers: its URL, or the local end of the SSH tunnel. */
interface Endpoint {
  url: URL;
  /** The URL's path, for a server behind a proxy at a sub-path ('' otherwise). */
  prefix: string;
  socketPath?: string;
}

/** An SSH tunnel from a local socket to the machine's Agent Console on its 127.0.0.1. */
class Tunnel {
  child: ChildProcess | null = null;
  private starting: Promise<void> | null = null;
  private lastStart = 0;

  constructor(
    readonly sock: string,
    private dest: string,
    private port: number,
  ) {}

  ready(): Promise<void> {
    if (this.child && this.child.exitCode === null && this.child.signalCode === null && fs.existsSync(this.sock)) return Promise.resolve();
    return (this.starting ??= this.open().finally(() => (this.starting = null)));
  }

  private async open(): Promise<void> {
    // Not more than one try every few seconds, whatever asks.
    const wait = this.lastStart + 3000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastStart = Date.now();
    this.stop();
    fs.mkdirSync(TUNNEL_DIR, { recursive: true, mode: 0o700 });
    await new Promise<void>((resolve, reject) => {
      // BatchMode: keys only (from ~/.ssh), never a prompt; accept-new: a new host's key is learned once.
      const args = ['-N', '-T', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3'];
      args.push('-o', 'StrictHostKeyChecking=accept-new', '-o', 'StreamLocalBindUnlink=yes', '-L', `${this.sock}:127.0.0.1:${this.port}`, '--', this.dest);
      const child = spawn('ssh', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      this.child = child;
      let err = '';
      child.stderr!.on('data', (d) => (err = (err + d).slice(-4000)));
      const started = Date.now();
      const poll = setInterval(() => {
        if (fs.existsSync(this.sock)) {
          clearInterval(poll);
          resolve();
        } else if (Date.now() - started > 25_000) {
          clearInterval(poll);
          child.kill();
          reject(new Error('The SSH connection did not open within 25 s'));
        }
      }, 100);
      child.on('error', (e) => {
        clearInterval(poll);
        reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? new Error('ssh is not installed on this machine') : e);
      });
      child.on('exit', (code) => {
        clearInterval(poll);
        if (this.child === child) this.child = null;
        reject(new Error(sshError(err) || `ssh stopped (exit code ${code})`));
      });
    });
  }

  stop() {
    this.child?.kill();
    this.child = null;
    fs.rmSync(this.sock, { force: true });
  }
}

/** The line of ssh's output that says what went wrong. */
function sshError(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^Warning: Permanently added/i.test(l));
  return lines.at(-1) ?? '';
}

/** ssh processes left by an earlier run of this server (the service stops only its main process). */
function killStaleTunnels() {
  if (process.platform !== 'linux') return;
  const mine = `${TUNNEL_DIR}${path.sep}`;
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
      if (path.basename(argv[0] ?? '') === 'ssh' && argv.some((a) => a.startsWith(mine))) process.kill(Number(pid), 'SIGTERM');
    } catch {}
  }
}

const statusOf = (s: SessionSummary) => s.live?.status ?? s.external?.status;

/** One machine: how to reach it, and its events while connected. */
class Machine extends EventEmitter {
  status: MachineStatus = { state: 'connecting', waiting: 0, working: 0 };
  private tunnel: Tunnel | null = null;
  private ws: WebSocket | null = null;
  private sessions = new Map<string, string | undefined>();
  private retry = 0;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(public def: MachineDef) {
    super();
    if (def.via === 'ssh') {
      // One socket per tunnel, so an old ssh going away never takes a new one's socket with it. Socket
      // paths are short (about 100 bytes): a long DATA_DIR falls back to the temp folder.
      const name = `${def.id}-${crypto.randomBytes(3).toString('hex')}.sock`;
      let sock = path.join(TUNNEL_DIR, name);
      if (sock.length > 100) sock = path.join(os.tmpdir(), `ac-${process.getuid?.() ?? 0}-${name}`);
      this.tunnel = new Tunnel(sock, def.ssh!, def.port ?? DEFAULT_PORT);
    }
  }

  view(): MachineView {
    const { id, name, via, url, ssh, port } = this.def;
    return { id, name, via, url, ssh, port, status: this.status };
  }

  async endpoint(): Promise<Endpoint> {
    if (this.tunnel) {
      await this.tunnel.ready();
      return { url: new URL('http://localhost'), prefix: '', socketPath: this.tunnel.sock };
    }
    const url = new URL(this.def.url!);
    return { url, prefix: url.pathname.replace(/\/+$/, '') };
  }

  /** A request to the machine's server, with the access token. */
  async request(method: string, p: string, headers: http.OutgoingHttpHeaders = {}, timeoutMs = 0): Promise<http.ClientRequest> {
    const ep = await this.endpoint();
    const tls = ep.url.protocol === 'https:';
    const where = ep.socketPath ? { socketPath: ep.socketPath } : { hostname: ep.url.hostname.replace(/^\[|\]$/g, ''), port: ep.url.port || (tls ? 443 : 80) };
    const req = (tls ? https : http).request({
      ...where,
      method,
      path: ep.prefix + p,
      headers: { ...headers, host: ep.socketPath ? 'localhost' : ep.url.host, authorization: `Bearer ${this.def.token}` },
    });
    if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('timed out')));
    return req;
  }

  /** A JSON call to the machine's API; errors say what is wrong in words. */
  async call<T>(method: string, p: string, timeoutMs = 15_000): Promise<T> {
    let req: http.ClientRequest;
    try {
      req = await this.request(method, p, { accept: 'application/json' }, timeoutMs);
    } catch (e) {
      throw new Error(this.reason(e));
    }
    return new Promise<T>((resolve, reject) => {
      req.on('response', (r) => {
        let data = '';
        r.setEncoding('utf8');
        r.on('data', (d) => (data += d));
        r.on('end', () => {
          let j: any = null;
          try {
            j = JSON.parse(data);
          } catch {}
          if (r.statusCode === 401) reject(new Error('It refused the access token: make a new one there (Settings → Machines) and paste it here'));
          else if (!r.statusCode || r.statusCode >= 400 || !j) reject(new Error(j?.error ?? `It answered ${r.statusCode}${j ? '' : ', not as Agent Console does'}`));
          else resolve(j as T);
        });
      });
      req.on('error', (e) => reject(new Error(this.reason(e))));
      req.end();
    });
  }

  /** What a failed connection means, in words. */
  reason(e: unknown): string {
    const err = e as NodeJS.ErrnoException;
    const port = this.def.port ?? DEFAULT_PORT;
    if (this.tunnel && (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || /socket hang up/.test(err.message)))
      return `Connected over SSH, but nothing answers on port ${port} there: is Agent Console running on that machine?`;
    if (err.code === 'ECONNREFUSED') return 'Nothing answers at that address';
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') return 'That host name is not known';
    if (err.code === 'ETIMEDOUT' || /timed out/.test(err.message)) return 'It did not answer in time';
    if (/certificate|self.signed/i.test(err.message)) return `Its HTTPS certificate is not trusted (${err.message})`;
    return err.message;
  }

  /** Checks the machine answers and takes the token; returns what it says about itself. */
  async check(): Promise<{ host: string; version: string }> {
    const info = await this.call<{ host: string; version: string }>('GET', '/api/machine');
    this.status = { ...this.status, host: info.host, version: info.version };
    return info;
  }

  // ---- following its events ------------------------------------------------------------------------

  start() {
    this.closed = false;
    this.follow();
  }

  private setStatus(s: Partial<MachineStatus>) {
    const next = { ...this.status, ...s };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next;
    this.emit('changed');
  }

  private async follow() {
    if (this.closed) return;
    let ep: Endpoint;
    try {
      ep = await this.endpoint();
    } catch (e) {
      this.setStatus({ state: 'offline', error: this.reason(e) });
      return this.later();
    }
    if (this.closed) return;
    const ws = new WebSocket(socketUrl(ep, '/ws'), { headers: { authorization: `Bearer ${this.def.token}` }, perMessageDeflate: false, handshakeTimeout: 15_000 });
    this.ws = ws;
    let error = '';
    ws.on('open', async () => {
      try {
        const info = await this.check();
        const list = await this.call<{ sessions: SessionSummary[] }>('GET', '/api/sessions?limit=500');
        this.sessions = new Map(list.sessions.map((s) => [s.key, statusOf(s)]));
        this.retry = 0;
        this.setStatus({ state: 'online', error: undefined, host: info.host, version: info.version, since: Date.now(), ...this.counts() });
      } catch (e) {
        error = (e as Error).message;
        ws.close();
      }
    });
    ws.on('message', (raw) => {
      let e: any;
      try {
        e = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (e.t === 'sessions') {
        for (const s of (e.upsert ?? []) as SessionSummary[]) this.sessions.set(s.key, statusOf(s));
        for (const k of (e.remove ?? []) as string[]) this.sessions.delete(k);
        this.setStatus(this.counts());
      } else if (e.t === 'notify' && e.n && !e.n.machine) {
        // Its own sessions' notices (ones it passes on from its machines would point at the wrong one).
        this.emit('notify', { ...(e.n as NotifyEvent), machine: { id: this.def.id, name: this.def.name } });
      }
    });
    ws.on('error', (e) => (error ||= /server response: 401/.test(e.message) ? 'It refused the access token: make a new one there (Settings → Machines) and paste it here' : this.reason(e)));
    ws.on('close', () => {
      if (this.ws === ws) this.ws = null;
      if (this.closed) return;
      this.setStatus({ state: 'offline', error: error || 'The connection closed', waiting: 0, working: 0 });
      this.later();
    });
  }

  private counts() {
    let waiting = 0;
    let working = 0;
    for (const st of this.sessions.values()) {
      if (st === 'waiting') waiting++;
      else if (st === 'working' || st === 'starting') working++;
    }
    return { waiting, working };
  }

  /** Tries again: soon at first, then every minute. */
  private later() {
    if (this.closed || this.timer) return;
    const delay = Math.min(60_000, 3000 * 2 ** this.retry++);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.follow();
    }, delay);
  }

  /** Connects again now (after an edit, or when asked). */
  reconnect() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.retry = 0;
    const ws = this.ws;
    this.ws = null;
    ws?.removeAllListeners('close');
    ws?.terminate();
    this.setStatus({ state: 'connecting' });
    this.follow();
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.terminate();
    this.ws = null;
    this.tunnel?.stop();
  }
}

function socketUrl(ep: Endpoint, p: string): string {
  if (ep.socketPath) return `ws+unix:${ep.socketPath}:${p}`;
  return `${ep.url.protocol === 'https:' ? 'wss' : 'ws'}://${ep.url.host}${ep.prefix}${p}`;
}

// Request headers passed on to the machine; the browser's cookies, origin and the like stay here. The
// machine compresses its answers itself (the routes here do not compress them again).
const PASS_REQUEST = new Set(['accept', 'accept-encoding', 'accept-language', 'content-type', 'content-length', 'range', 'if-range', 'if-none-match', 'if-modified-since', 'cache-control', 'user-agent']);
// Response headers not passed back: hop-by-hop ones, and cookies (of the other machine).
const DROP_RESPONSE = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authenticate', 'trailer', 'set-cookie']);

export class Machines extends EventEmitter {
  private live = new Map<string, Machine>();

  constructor(private db: DB) {
    super();
  }

  private defs(): MachineDef[] {
    try {
      return JSON.parse(kvGet(this.db, 'machines') ?? '[]');
    } catch {
      return [];
    }
  }

  private save(list: MachineDef[]) {
    kvSet(this.db, 'machines', JSON.stringify(list));
  }

  /** Connects to every machine (at server start). */
  start() {
    try {
      killStaleTunnels();
    } catch {}
    for (const d of this.defs()) this.track(new Machine(d));
  }

  private track(m: Machine) {
    this.live.set(m.def.id, m);
    m.on('changed', () => this.emit('changed'));
    m.on('notify', (n: NotifyEvent) => this.emit('notify', n));
    m.start();
  }

  list(): MachineView[] {
    return [...this.live.values()].map((m) => m.view());
  }

  get(id: string): Machine {
    const m = this.live.get(id);
    if (!m) throw new HttpError(404, 'That machine is not in Settings → Machines');
    return m;
  }

  /** A machine from what the form sent, checked; `prev` keeps the token when none is given. */
  private parse(b: any, prev?: MachineDef): MachineDef {
    const name = String(b?.name ?? prev?.name ?? '')
      .trim()
      .slice(0, 40);
    if (!name) throw new HttpError(400, 'Give the machine a name');
    // An edit may send only what changes.
    const via = (b?.via ?? prev?.via) === 'ssh' ? 'ssh' : 'url';
    const token = String(b?.token ?? '').trim() || prev?.token || '';
    if (!token.startsWith(TOKEN_PREFIX)) throw new HttpError(400, 'Paste an access token made on that machine (Settings → Machines → Access from other machines)');
    const id = prev?.id ?? this.newId(name);
    if (via === 'url') {
      let url: URL;
      try {
        url = new URL(String(b?.url ?? prev?.url ?? '').trim());
      } catch {
        throw new HttpError(400, 'Give its address, like http://10.0.0.5:8790');
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError(400, 'The address starts with http:// or https://');
      if (url.username || url.password) throw new HttpError(400, 'Leave the user and password out of the address: the access token is the sign-in');
      return { id, name, via, url: `${url.origin}${url.pathname.replace(/\/+$/, '')}`, token };
    }
    const ssh = String(b?.ssh ?? prev?.ssh ?? '').trim();
    // A host from ~/.ssh/config, host or user@host: nothing that ssh could take as an option.
    if (!/^[A-Za-z0-9_.@%:[\]-]{1,200}$/.test(ssh) || ssh.startsWith('-')) throw new HttpError(400, 'Give the SSH host, like gpu-box or chris@10.0.0.5');
    const port = Number(b?.port ?? prev?.port ?? DEFAULT_PORT) || DEFAULT_PORT;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, 'The port is a number from 1 to 65535');
    return { id, name, via, ssh, port, token };
  }

  /** A short id from the name, for the machine's pages (/m/<id>/). */
  private newId(name: string): string {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'machine';
    const taken = new Set(this.defs().map((d) => d.id));
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
    return id;
  }

  /** Checks a machine answers before it is kept; a failed SSH tunnel is closed again. */
  private async tryOut(def: MachineDef): Promise<Machine> {
    const m = new Machine(def);
    try {
      await m.check();
      return m;
    } catch (e) {
      m.close();
      throw new HttpError(400, `Could not use ${def.name}: ${(e as Error).message}`);
    }
  }

  async add(b: unknown): Promise<MachineView> {
    const def = this.parse(b);
    const m = await this.tryOut(def);
    this.save([...this.defs(), def]);
    this.track(m);
    this.emit('changed');
    return m.view();
  }

  async update(id: string, b: unknown): Promise<MachineView> {
    const prev = this.defs().find((d) => d.id === id);
    if (!prev) throw new HttpError(404, 'That machine is not in Settings → Machines');
    const def = this.parse(b, prev);
    const reach = (d: MachineDef) => JSON.stringify([d.via, d.url, d.ssh, d.port, d.token]);
    this.save(this.defs().map((d) => (d.id === id ? def : d)));
    const old = this.live.get(id);
    if (old && reach(def) === reach(prev)) {
      // A new name only.
      old.def = def;
      this.emit('changed');
      return old.view();
    }
    const m = await this.tryOut(def).catch((e) => {
      this.save(this.defs().map((d) => (d.id === id ? prev : d)));
      throw e;
    });
    old?.close();
    this.track(m);
    this.emit('changed');
    return m.view();
  }

  remove(id: string) {
    this.save(this.defs().filter((d) => d.id !== id));
    this.live.get(id)?.close();
    this.live.delete(id);
    this.emit('changed');
  }

  reconnect(id: string) {
    this.get(id).reconnect();
  }

  shutdown() {
    for (const m of this.live.values()) m.close();
  }

  // ---- forwarding the app's calls ------------------------------------------------------------------

  /** Forwards one HTTP request (path and query after /m/<id>) to the machine; streams both ways. */
  async forward(req: FastifyRequest, reply: FastifyReply, id: string, rest: string) {
    const m = this.get(id);
    // Some routes here need no sign-in (signed file views, guest links): a '..' could turn one into
    // another path on the way (a proxy in front of the machine decodes and resolves them), so none pass,
    // encoded or not.
    let path: string;
    try {
      path = decodeURIComponent(rest.split('?')[0]);
    } catch {
      return reply.code(400).send({ error: 'Bad path' });
    }
    if (/(^|[/\\])\.{1,2}([/\\]|$)/.test(path) || path.includes('\\')) return reply.code(400).send({ error: 'Bad path' });
    const headers: http.OutgoingHttpHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) if (PASS_REQUEST.has(k) && v != null) headers[k] = v;
    let up: http.ClientRequest;
    try {
      up = await m.request(req.method, rest, headers);
    } catch (e) {
      return reply.code(502).send({ error: `${m.def.name} is not reachable: ${m.reason(e)}` });
    }
    return new Promise<void>((resolve) => {
      up.on('response', (r) => {
        if (r.statusCode === 401) {
          r.resume();
          reply.code(502).send({ error: `${m.def.name} refused this app's access token: make a new one there and update it in Settings → Machines` });
          return resolve();
        }
        reply.code(r.statusCode ?? 502);
        for (const [k, v] of Object.entries(r.headers)) if (!DROP_RESPONSE.has(k) && v != null) reply.header(k, v);
        reply.send(r);
        resolve();
      });
      up.on('error', (e) => {
        if (!reply.sent) reply.code(502).send({ error: `${m.def.name} is not reachable: ${m.reason(e)}` });
        resolve();
      });
      // The body as it came (the routes here leave it unparsed).
      const body = req.body as Readable | undefined;
      if (body && typeof body.pipe === 'function') body.pipe(up);
      else up.end();
      // The browser went away before the answer was through.
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) up.destroy();
      });
    });
  }

  /** Joins a browser's socket to the same socket on the machine. */
  relay(client: WebSocket, id: string, rest: string) {
    let m: Machine;
    try {
      m = this.get(id);
    } catch {
      return client.close(1008, 'Unknown machine');
    }
    const queued: [WebSocket.RawData, boolean][] = [];
    let up: WebSocket | null = null;
    let done = false;
    const end = (code = 1011, why = '') => {
      if (done) return;
      done = true;
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) client.close(code, why.slice(0, 60));
      up?.terminate();
    };
    client.on('message', (d, binary) => {
      if (up?.readyState === WebSocket.OPEN) up.send(d, { binary });
      else queued.push([d, binary]);
    });
    client.on('close', () => end());
    client.on('error', () => end());
    m.endpoint()
      .then((ep) => {
        if (done) return;
        up = new WebSocket(socketUrl(ep, rest), { headers: { authorization: `Bearer ${m.def.token}` }, perMessageDeflate: false, handshakeTimeout: 15_000 });
        up.on('open', () => {
          for (const [d, binary] of queued.splice(0)) up!.send(d, { binary });
        });
        up.on('message', (d, binary) => {
          if (client.readyState === WebSocket.OPEN) client.send(d, { binary });
        });
        up.on('close', (code, why) => end(code >= 3000 || (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) ? code : 1011, String(why)));
        up.on('error', (e) => end(1011, `${m.def.name}: ${m.reason(e)}`));
      })
      .catch((e) => end(1011, `${m.def.name}: ${m.reason(e)}`));
  }
}
