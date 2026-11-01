// Talking MCP to a connected app: Streamable HTTP (a POST answered with JSON or an event stream), the
// older HTTP with server-sent events (a stream that names where to post, answers coming on the
// stream), or a local command over stdin and stdout (for the Test button; agents start those themselves).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { agentBaseEnv } from '../env.ts';

export interface Rpc {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

export interface ToolInfo {
  name: string;
  description?: string;
}

/** The app refused the sign-in (401): renew it and try again, or ask the person to connect again. */
export class Unauthorized extends Error {}

const PROTOCOL = '2025-06-18';
export const INIT_PARAMS = { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'naget-agent', title: 'Naget Agent', version: '1' } };
const UA = 'Naget Agent (+https://github.com/Naget-Inc/naget-agent)';

export const isRequest = (m: Rpc) => m.id !== undefined && m.id !== null && typeof m.method === 'string';

/**
 * A request that carries an app's sign-in: a redirect is followed only within the same origin (a key in
 * a header of its own would otherwise go along to any host), and a POST only by 307 or 308.
 */
export async function fetchSigned(url: string, init: RequestInit): Promise<{ res: Response; url: string }> {
  let u = new URL(url);
  for (let hop = 0; ; hop++) {
    const res = await fetch(u, { ...init, redirect: 'manual' });
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) return { res, url: u.toString() };
    res.body?.cancel().catch(() => {});
    const next = new URL(loc, u);
    if (next.origin !== u.origin || hop >= 3) throw new Error(`${u.host} redirected to ${next.host}: not followed with the sign-in`);
    if (init.method === 'POST' && res.status !== 307 && res.status !== 308) throw new Error(`${u.host} answered ${res.status} (a redirect)`);
    u = next;
  }
}
const isReply = (m: Rpc) => m.id !== undefined && m.id !== null && !m.method && ('result' in m || 'error' in m);

/** Server-sent events from a response body: { event, data } as each one completes. */
export async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let m: RegExpExecArray | null;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      const block = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
  }
}

export interface HttpReply {
  status: number;
  sessionId?: string;
  replies: Rpc[];
  /** The body, when it was not MCP (an error page). */
  text?: string;
}

/**
 * One POST to a Streamable HTTP server. The replies to the requests in `body` come back as JSON or on an
 * event stream, which is read until each request has its answer.
 */
export async function postHttp(
  url: string,
  body: Rpc | Rpc[],
  headers: Record<string, string>,
  o: { sessionId?: string; protocol?: string; signal?: AbortSignal; timeoutMs?: number; onRequest?: (m: Rpc) => Promise<Rpc> } = {},
): Promise<HttpReply> {
  const list = Array.isArray(body) ? body : [body];
  const want = new Set(list.filter(isRequest).map((m) => String(m.id)));
  const signal = AbortSignal.any([o.signal ?? new AbortController().signal, AbortSignal.timeout(o.timeoutMs ?? 600_000)]);
  const { res: r } = await fetchSigned(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'user-agent': UA,
      ...(o.sessionId ? { 'mcp-session-id': o.sessionId } : {}),
      ...(o.protocol ? { 'mcp-protocol-version': o.protocol } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  });
  const sessionId = r.headers.get('mcp-session-id') ?? undefined;
  if (r.status === 401) {
    r.body?.cancel().catch(() => {});
    throw new Unauthorized(`${new URL(url).host} refused the sign-in`);
  }
  const type = r.headers.get('content-type') ?? '';
  if (r.status === 202 || !want.size) {
    r.body?.cancel().catch(() => {});
    return { status: r.status, sessionId, replies: [] };
  }
  if (type.includes('text/event-stream') && r.body) {
    const replies: Rpc[] = [];
    // The app asks something of its client while it works (a form for the user): answered by a POST of its own.
    const answer = (m: Rpc) =>
      void o.onRequest!(m)
        .then((reply) =>
          fetchSigned(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': UA, ...(sessionId || o.sessionId ? { 'mcp-session-id': (sessionId ?? o.sessionId)! } : {}), ...(o.protocol ? { 'mcp-protocol-version': o.protocol } : {}), ...headers },
            body: JSON.stringify(reply),
            signal,
          }),
        )
        .then(({ res }) => res.body?.cancel().catch(() => {}))
        .catch(() => {});
    for await (const e of events(r.body)) {
      if (e.event !== 'message') continue;
      try {
        const m = JSON.parse(e.data);
        for (const x of Array.isArray(m) ? m : [m])
          if (isReply(x) && want.has(String(x.id))) {
            replies.push(x);
            want.delete(String(x.id));
          } else if (isRequest(x) && o.onRequest) answer(x);
      } catch {}
      if (!want.size) break;
    }
    r.body.cancel().catch(() => {});
    return { status: r.status, sessionId, replies };
  }
  const text = await r.text();
  try {
    const m = JSON.parse(text);
    return { status: r.status, sessionId, replies: (Array.isArray(m) ? m : [m]).filter(isReply) };
  } catch {
    return { status: r.status, sessionId, replies: [], text: text.slice(0, 500) };
  }
}

/** The older SSE transport: a stream that names the address to post to; answers come on the stream. */
export class SseLink {
  endpoint = '';
  closed = false;
  lastUsed = Date.now();
  /** The initialize request it was opened with (sent again when it has to reopen). */
  init?: Rpc;
  /** Answers what the app asks of its client (a form for the user); without it, only pings are answered. */
  onRequest?: (m: Rpc) => Promise<Rpc>;
  private ctl = new AbortController();
  private waiting = new Map<string, (m: Rpc) => void>();

  private constructor(private url: string) {}

  static async open(url: string, headers: Record<string, string>, timeoutMs = 20_000): Promise<SseLink> {
    const link = new SseLink(url);
    const opened = await fetchSigned(url, { method: 'GET', headers: { accept: 'text/event-stream', 'user-agent': UA, ...headers }, signal: link.ctl.signal }).catch((e) => {
      throw new Error(/redirect/.test((e as Error).message) ? (e as Error).message : `Could not reach ${new URL(url).host}: ${(e as Error).message}`);
    });
    const r = opened.res;
    const base = new URL(opened.url);
    if (r.status === 401) throw new Unauthorized(`${new URL(url).host} refused the sign-in`);
    if (!r.ok || !r.body) throw new Error(`${new URL(url).host} answered ${r.status}`);
    const ready = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${new URL(url).host} did not say where to send messages`)), timeoutMs);
      void (async () => {
        try {
          for await (const e of events(r.body!)) {
            if (e.event === 'endpoint') {
              const ep = new URL(e.data.trim(), base);
              clearTimeout(t);
              // Messages carry the sign-in: they go to the stream's own origin only.
              if (ep.origin !== base.origin) return reject(new Error(`${base.host} named an endpoint on another host (${ep.host})`));
              link.endpoint = ep.toString();
              resolve();
            } else if (e.event === 'message') link.take(e.data, headers);
          }
        } catch {}
        link.end();
        clearTimeout(t);
        reject(new Error(`${new URL(url).host} closed the stream`));
      })();
    });
    try {
      await ready;
    } catch (e) {
      link.close();
      throw e;
    }
    return link;
  }

  private take(data: string, headers: Record<string, string>) {
    let m: Rpc;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (isReply(m)) this.waiting.get(String(m.id))?.(m);
    // The server asking: its pings answered here, the rest by onRequest (or not offered).
    else if (isRequest(m)) {
      const reply = m.method === 'ping' || !this.onRequest ? Promise.resolve<Rpc>({ jsonrpc: '2.0', id: m.id, ...(m.method === 'ping' ? { result: {} } : { error: { code: -32601, message: 'Not offered' } }) }) : this.onRequest(m);
      void reply.then((r) => this.post(r, headers)).then((r) => r.body?.cancel().catch(() => {})).catch(() => {});
    }
  }

  private async post(m: Rpc, headers: Record<string, string>, signal?: AbortSignal): Promise<Response> {
    const { res: r } = await fetchSigned(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA, ...headers }, body: JSON.stringify(m), signal });
    if (r.status === 401) throw new Unauthorized(`${new URL(this.url).host} refused the sign-in`);
    return r;
  }

  /** Sends one message; for a request, waits for its answer on the stream. */
  async send(m: Rpc, headers: Record<string, string>, o: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Rpc | null> {
    if (this.closed) throw new Error('The connection to the app ended');
    this.lastUsed = Date.now();
    if (!isRequest(m)) {
      const r = await this.post(m, headers, o.signal);
      r.body?.cancel().catch(() => {});
      return null;
    }
    // Our own id upstream, so two callers' ids cannot clash.
    const mine = `n${crypto.randomBytes(6).toString('hex')}`;
    let timer: NodeJS.Timeout | undefined;
    const answer = new Promise<Rpc>((resolve, reject) => {
      timer = setTimeout(() => (this.waiting.delete(mine), reject(new Error('The app took too long to answer'))), o.timeoutMs ?? 600_000);
      o.signal?.addEventListener('abort', () => (clearTimeout(timer), this.waiting.delete(mine), reject(new Error('stopped'))), { once: true });
      this.waiting.set(mine, (x) => (clearTimeout(timer), this.waiting.delete(mine), resolve(x)));
    });
    // Awaited below; a failed post must not leave it to reject unheard.
    answer.catch(() => {});
    let r: Response;
    try {
      r = await this.post({ ...m, id: mine }, headers, o.signal);
    } catch (e) {
      clearTimeout(timer);
      this.waiting.delete(mine);
      throw e;
    }
    if (!r.ok && r.status !== 202) {
      this.waiting.get(mine)?.({ jsonrpc: '2.0', id: mine, error: { code: -32000, message: `The app answered ${r.status}` } });
    } else {
      // Some servers answer in the reply itself.
      const text = await r.text().catch(() => '');
      try {
        const x = JSON.parse(text);
        if (isReply(x) && String(x.id) === mine) this.waiting.get(mine)?.(x);
      } catch {}
    }
    const x = await answer;
    this.lastUsed = Date.now();
    return { ...x, id: m.id };
  }

  private end() {
    this.closed = true;
    for (const [id, w] of this.waiting) w({ jsonrpc: '2.0', id, error: { code: -32000, message: 'The connection to the app ended' } });
    this.waiting.clear();
  }

  close() {
    this.end();
    this.ctl.abort();
  }
}

/** Initializes, then lists every tool (all pages), over Streamable HTTP. */
export async function httpTools(url: string, headers: Record<string, string>, timeoutMs = 30_000): Promise<{ tools: ToolInfo[]; server?: string }> {
  const init = await postHttp(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS }, headers, { timeoutMs });
  const r0 = init.replies[0];
  if (!r0) throw new Error(init.text ? `${new URL(url).host} did not answer as an MCP server (${init.status})` : `${new URL(url).host} answered ${init.status}`);
  if (r0.error) throw new Error(r0.error.message);
  const o = { sessionId: init.sessionId, protocol: String(r0.result?.protocolVersion ?? PROTOCOL), timeoutMs };
  await postHttp(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, headers, o).catch(() => {});
  const tools: ToolInfo[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = (await postHttp(url, { jsonrpc: '2.0', id: 2 + i, method: 'tools/list', params: cursor ? { cursor } : {} }, headers, o)).replies[0];
    if (!r) throw new Error('No answer to tools/list');
    if (r.error) throw new Error(r.error.message);
    tools.push(...((r.result?.tools ?? []) as ToolInfo[]));
    cursor = r.result?.nextCursor;
    if (!cursor) break;
  }
  if (init.sessionId) void fetch(url, { method: 'DELETE', headers: { 'mcp-session-id': init.sessionId, ...headers }, redirect: 'manual' }).catch(() => {});
  return { tools: tools.map((t) => ({ name: String(t.name), description: t.description ? String(t.description) : undefined })), server: r0.result?.serverInfo?.name };
}

/** The same over the older SSE transport. */
export async function sseTools(url: string, headers: Record<string, string>, timeoutMs = 30_000): Promise<{ tools: ToolInfo[]; server?: string }> {
  const link = await SseLink.open(url, headers, timeoutMs);
  try {
    const init = await link.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS }, headers, { timeoutMs });
    if (init?.error) throw new Error(init.error.message);
    await link.send({ jsonrpc: '2.0', method: 'notifications/initialized' }, headers);
    const tools: ToolInfo[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await link.send({ jsonrpc: '2.0', id: 2 + i, method: 'tools/list', params: cursor ? { cursor } : {} }, headers, { timeoutMs });
      if (r?.error) throw new Error(r.error.message);
      tools.push(...((r?.result?.tools ?? []) as ToolInfo[]));
      cursor = r?.result?.nextCursor;
      if (!cursor) break;
    }
    return { tools: tools.map((t) => ({ name: String(t.name), description: t.description ? String(t.description) : undefined })), server: init?.result?.serverInfo?.name };
  } finally {
    link.close();
  }
}

/** Starts a local app's command, lists its tools, and stops it. */
export function stdioTools(o: { command: string; args: string[]; env: Record<string, string>; cwd: string; timeoutMs?: number; mask?: (s: string) => string }): Promise<{ tools: ToolInfo[]; server?: string }> {
  return new Promise((resolve, reject) => {
    let p: ReturnType<typeof spawn>;
    try {
      p = spawn(o.command, o.args, { cwd: o.cwd, env: { ...agentBaseEnv(), ...o.env }, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return reject(e);
    }
    let err = '';
    let out = '';
    let done = false;
    const waiting = new Map<number, (m: Rpc) => void>();
    const finish = (e: Error | null, v?: { tools: ToolInfo[]; server?: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      p.kill();
      setTimeout(() => p.kill('SIGKILL'), 3000).unref();
      if (e) reject(e);
      else resolve(v!);
    };
    const tail = () => (o.mask ?? ((s) => s))(err.trim().split('\n').slice(-3).join(' ').slice(0, 300));
    const timer = setTimeout(() => finish(new Error(`It did not answer within ${Math.round((o.timeoutMs ?? 120_000) / 1000)} seconds${err ? `: ${tail()}` : ' (still downloading?)'}`)), o.timeoutMs ?? 120_000);
    p.on('error', (e) => finish(new Error((e as NodeJS.ErrnoException).code === 'ENOENT' ? `${o.command} is not installed here` : e.message)));
    p.on('exit', (code) => finish(new Error(`It stopped (exit ${code})${err ? `: ${tail()}` : ''}`)));
    p.stdin!.on('error', () => {});
    p.stderr!.on('data', (d) => (err = (err + d.toString()).slice(-4000)));
    p.stdout!.on('data', (d) => {
      out += d.toString();
      let i: number;
      while ((i = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, i).trim();
        out = out.slice(i + 1);
        try {
          const m = JSON.parse(line);
          if (isReply(m)) waiting.get(Number(m.id))?.(m);
        } catch {}
      }
    });
    let seq = 0;
    const ask = (method: string, params: unknown) =>
      new Promise<any>((res, rej) => {
        const id = ++seq;
        waiting.set(id, (m) => (waiting.delete(id), m.error ? rej(new Error(m.error.message)) : res(m.result ?? {})));
        p.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    void (async () => {
      try {
        const init = await ask('initialize', INIT_PARAMS);
        p.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
        const tools: ToolInfo[] = [];
        let cursor: string | undefined;
        for (let i = 0; i < 20; i++) {
          const r = await ask('tools/list', cursor ? { cursor } : {});
          tools.push(...((r.tools ?? []) as ToolInfo[]));
          cursor = r.nextCursor;
          if (!cursor) break;
        }
        finish(null, { tools: tools.map((t) => ({ name: String(t.name), description: t.description ? String(t.description) : undefined })), server: init.serverInfo?.name });
      } catch (e) {
        finish(e as Error);
      }
    })();
  });
}
