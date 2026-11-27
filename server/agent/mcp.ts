// MCP servers for Console: the user's (Claude Code's user and project settings, the project's
// .mcp.json, Codex's config.toml, and Custom's own, kept by Hydor: server/mcpservers) and those the app hands
// over (its show_html page server). Over stdio (newline-delimited JSON-RPC), Streamable HTTP or the older SSE;
// their tools join Console's as mcp__<server>__<tool>. A server that wants a browser sign-in is reached through
// the app, which adds the token (def.relay). An app's tool steps call a plugin's tools with the same client
// (server/apps/plugins.ts).
import { spawn, type ChildProcess } from 'node:child_process';
import { spawnProgram } from '../platform.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SseLink, Unauthorized } from '../connections/upstream.ts';
import { readStore, STORE_ENV } from '../mcpservers/store.ts';

export { Unauthorized };

/** Where a server was set up: Claude Code's settings, a folder's .mcp.json, Codex's, Custom's own, or the app. */
export type McpFrom = 'claude' | 'project' | 'codex' | 'custom' | 'app';

export interface McpDef {
  name: string;
  type: 'stdio' | 'http' | 'sse';
  from?: McpFrom;
  /** The folder a stdio server starts in (this process's unless given). */
  cwd?: string;
  /** The app's address that adds a browser sign-in to an HTTP server's requests (server/mcpservers). */
  relay?: string;
  /** Hydor holds a sign-in for this address: its requests go through `relay` from the start. */
  signedIn?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** Codex's enabled_tools and disabled_tools. */
  only?: string[];
  skip?: string[];
  /** The environment a stdio server starts with, before `env` (this process's unless given). */
  baseEnv?: Record<string, string>;
}

export interface McpTool {
  server: string;
  name: string;
  /** The name the model calls it by. */
  fullName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The server says it only reads (MCP's readOnlyHint). */
  readOnly?: boolean;
  /** A connected account's tool on Ask first: Hydor holds each call in the Outbox for the user's OK (server/outbox). */
  held?: boolean;
}

const readJson = (f: string): any => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * MCP servers from Claude Code's settings, the project's .mcp.json, Codex's settings and Custom's own (which win
 * over the same name in a program's), plus the ones the app passes (which win over all). `store` is Hydor's file
 * of Custom's servers; `relay` is the app's address that adds browser sign-ins.
 */
export function mcpServers(cwd: string, fromClient: any[], o: { store?: string; relay?: string } = {}): McpDef[] {
  const out = new Map<string, McpDef>();
  const add = (name: string, d: any, from: McpFrom) => {
    if (!d || typeof d !== 'object' || d.disabled) return;
    const type = d.type === 'sse' && d.url ? 'sse' : d.type === 'http' || d.type === 'streamable-http' || d.url ? 'http' : d.command ? 'stdio' : null;
    if (!type) return;
    const headers = Array.isArray(d.headers) ? Object.fromEntries(d.headers.map((h: any) => [h.name, h.value])) : d.headers;
    out.set(name, { name, type, from, command: d.command, args: d.args ?? [], env: d.env, url: d.url, headers });
  };
  const claude = readJson(path.join(os.homedir(), '.claude.json'));
  for (const [n, d] of Object.entries(claude?.mcpServers ?? {})) add(n, d, 'claude');
  for (const [n, d] of Object.entries(claude?.projects?.[cwd]?.mcpServers ?? {})) add(n, d, 'claude');
  for (const [n, d] of Object.entries(readJson(path.join(cwd, '.mcp.json'))?.mcpServers ?? {})) add(n, d, 'project');
  // Codex's, where Claude Code has none of the same name.
  for (const [n, d] of Object.entries(codexServers())) if (!out.has(n)) out.set(n, { ...d, from: 'codex' });
  let kept: Record<string, unknown> = {};
  let signedIn: string[] = [];
  try {
    ({ servers: kept, signedIn } = readStore(o.store ?? process.env[STORE_ENV]));
  } catch (e) {
    console.error((e as Error).message);
  }
  for (const [n, d] of Object.entries(kept)) add(n, d, 'custom');
  // Sign-ins are for the user's own servers only: what the app passes carries its own.
  for (const d of out.values())
    if (d.type === 'http' && o.relay) Object.assign(d, { relay: o.relay, ...(signedIn.includes(d.url!) ? { signedIn: true } : {}) });
  for (const d of fromClient ?? []) if (d?.name) add(d.name, d, 'app');
  return [...out.values()];
}

/** Codex's MCP servers ([mcp_servers.<name>] in config.toml): their commands, or addresses and headers. */
function codexServers(): Record<string, McpDef> {
  let cfg: Record<string, any>;
  try {
    cfg = parseToml(fs.readFileSync(path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'config.toml'), 'utf8'));
  } catch {
    return {};
  }
  const out: Record<string, McpDef> = {};
  for (const [name, d] of Object.entries<any>(cfg.mcp_servers ?? {})) {
    if (!d || typeof d !== 'object' || d.enabled === false) continue;
    const lists = { only: Array.isArray(d.enabled_tools) ? d.enabled_tools.map(String) : undefined, skip: Array.isArray(d.disabled_tools) ? d.disabled_tools.map(String) : undefined };
    if (d.command) out[name] = { name, type: 'stdio', command: String(d.command), args: (d.args ?? []).map(String), env: d.env, ...lists };
    else if (d.url) {
      const headers: Record<string, string> = { ...(d.http_headers ?? {}) };
      for (const [h, v] of Object.entries<string>(d.env_http_headers ?? {})) if (process.env[v]) headers[h] = process.env[v]!;
      if (d.bearer_token_env_var && process.env[d.bearer_token_env_var]) headers.Authorization = `Bearer ${process.env[d.bearer_token_env_var]}`;
      out[name] = { name, type: 'http', url: String(d.url), headers, ...lists };
    }
  }
  return out;
}

/**
 * Enough TOML for Codex's settings: tables (dotted, quoted names), keys, strings (basic, literal,
 * multi-line), numbers, booleans, arrays across lines, inline tables. Arrays of tables are skipped.
 */
export function parseToml(src: string): Record<string, any> {
  const root: Record<string, any> = {};
  let table: Record<string, any> | null = root;
  let i = 0;
  const ws = (lines = true) => {
    for (;;) {
      while (i < src.length && (src[i] === ' ' || src[i] === '\t' || (lines && (src[i] === '\n' || src[i] === '\r')))) i++;
      if (src[i] === '#') while (i < src.length && src[i] !== '\n') i++;
      else return;
    }
  };
  const str = (): string => {
    const q = src[i];
    const triple = src.startsWith(q.repeat(3), i);
    i += triple ? 3 : 1;
    if (triple && src[i] === '\n') i++;
    let out = '';
    while (i < src.length && !(triple ? src.startsWith(q.repeat(3), i) : src[i] === q)) {
      if (q === '"' && src[i] === '\\') {
        const c = src[++i];
        if (c === 'u' || c === 'U') {
          const n = c === 'u' ? 4 : 8;
          out += String.fromCodePoint(parseInt(src.slice(i + 1, i + 1 + n), 16));
          i += n;
        } else out += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' } as Record<string, string>)[c] ?? c;
        i++;
      } else out += src[i++];
    }
    i += triple ? 3 : 1;
    return out;
  };
  const key = (): string[] => {
    const parts: string[] = [];
    for (;;) {
      ws(false);
      if (src[i] === '"' || src[i] === "'") parts.push(str());
      else {
        const m = /^[A-Za-z0-9_-]+/.exec(src.slice(i));
        if (!m) break;
        parts.push(m[0]);
        i += m[0].length;
      }
      ws(false);
      if (src[i] !== '.') break;
      i++;
    }
    return parts;
  };
  const value = (): any => {
    ws();
    const c = src[i];
    if (c === '"' || c === "'") return str();
    if (c === '[') {
      i++;
      const arr: any[] = [];
      for (ws(); src[i] !== ']' && i < src.length; ws()) {
        arr.push(value());
        ws();
        if (src[i] === ',') i++;
      }
      i++;
      return arr;
    }
    if (c === '{') {
      i++;
      const obj: Record<string, any> = {};
      for (ws(); src[i] !== '}' && i < src.length; ws()) {
        const k = key();
        ws();
        i++; // =
        set(obj, k, value());
        ws();
        if (src[i] === ',') i++;
      }
      i++;
      return obj;
    }
    const m = /^[^\s,\]}#]+/.exec(src.slice(i));
    const w = m?.[0] ?? '';
    i += w.length;
    if (w === 'true' || w === 'false') return w === 'true';
    const n = Number(w.replace(/_/g, ''));
    return Number.isNaN(n) ? w : n;
  };
  const set = (obj: Record<string, any>, k: string[], v: any) => {
    let o = obj;
    for (const p of k.slice(0, -1)) o = o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {};
    o[k[k.length - 1]] = v;
  };
  while (i < src.length) {
    ws();
    if (i >= src.length) break;
    if (src.startsWith('[[', i)) {
      // An array of tables: not needed here, so its keys are read and dropped.
      i += 2;
      key();
      i += 2;
      table = null;
    } else if (src[i] === '[') {
      i++;
      const k = key();
      i++;
      let t: Record<string, any> = root;
      for (const p of k) t = t[p] = t[p] && typeof t[p] === 'object' ? t[p] : {};
      table = t;
    } else {
      const k = key();
      ws(false);
      if (src[i] !== '=' || !k.length) {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      i++;
      const v = value();
      if (table) set(table, k, v);
    }
  }
  return root;
}

const clean = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');

export class McpClient {
  tools: McpTool[] = [];
  error?: string;
  /** A stdio server that ended (or never started): it answers nothing more. */
  stopped = false;
  /** The last of what a stdio server wrote on stderr, to say why it stopped. */
  private said = '';
  private proc?: ChildProcess;
  private link?: SseLink;
  private seq = 0;
  private waiting = new Map<number, (m: any) => void>();
  private session?: string;
  /** Requests go through the app, which adds the sign-in. */
  private relayed = false;

  constructor(readonly def: McpDef) {}

  async connect(): Promise<void> {
    if (this.def.type === 'stdio') {
      this.proc = spawnProgram(this.def.command!, this.def.args ?? [], { cwd: this.def.cwd, env: { ...(this.def.baseEnv ?? process.env), ...(this.def.env ?? {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
      let buf = '';
      this.proc.stderr!.on('data', (d) => (this.said = (this.said + d.toString()).slice(-4000)));
      // A server that ended: writing to it fails here, not as a crash of this process.
      this.proc.stdin!.on('error', () => {});
      this.proc.stdout!.on('data', (d) => {
        buf += d.toString();
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          try {
            const m = JSON.parse(line);
            if (m.id != null && this.waiting.has(m.id)) this.waiting.get(m.id)!(m);
          } catch {}
        }
      });
      const ended = (why?: string) => {
        this.stopped = true;
        const tail = why ?? this.said.trim().split('\n').slice(-3).join(' ').slice(0, 300);
        for (const w of this.waiting.values()) w({ error: { message: `The MCP server stopped${tail ? `: ${tail}` : ''}` } });
        this.waiting.clear();
      };
      this.proc.on('exit', () => ended());
      this.proc.on('error', (e) => ended(e.message));
    } else if (this.def.type === 'sse') this.link = await SseLink.open(this.def.url!, this.def.headers ?? {});
    await this.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'console', version: '1' } }, 30_000);
    this.notify('notifications/initialized');
    const tools: any[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await this.request('tools/list', cursor ? { cursor } : {}, 30_000);
      tools.push(...(r.tools ?? []));
      cursor = r.nextCursor;
      if (!cursor) break;
    }
    this.tools = tools
      .filter((t) => (!this.def.only || this.def.only.includes(t.name)) && !this.def.skip?.includes(t.name))
      .map((t) => ({
      server: this.def.name,
      name: t.name,
      fullName: `mcp__${clean(this.def.name)}__${clean(t.name)}`.slice(0, 64),
      description: String(t.description ?? '').slice(0, 1000),
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
      readOnly: t.annotations?.readOnlyHint === true,
      ...(t._meta?.['hydor/askFirst'] === true ? { held: true } : {}),
    }));
  }

  /**
   * A tool's result: its text, its images (a screenshot) for the models that see them, and its
   * structured content when the text does not already carry it.
   */
  async call(tool: string, args: unknown, signal: AbortSignal, timeoutMs = 600_000): Promise<{ text: string; images: { data: string; mimeType: string }[]; isError: boolean; structured?: unknown }> {
    const r = await this.request('tools/call', { name: tool, arguments: args ?? {} }, timeoutMs, signal);
    const images: { data: string; mimeType: string }[] = [];
    const parts: string[] = [];
    for (const c of r.content ?? []) {
      if (c?.type === 'text') parts.push(String(c.text ?? ''));
      else if (c?.type === 'image' && typeof c.data === 'string') {
        images.push({ data: c.data, mimeType: String(c.mimeType ?? 'image/png') });
        parts.push(`[image ${images.length}]`);
      } else if (c?.type === 'resource') {
        const res = c.resource ?? {};
        if (typeof res.text === 'string') parts.push(res.text);
        else if (typeof res.blob === 'string' && /^image\//.test(res.mimeType ?? '')) {
          images.push({ data: res.blob, mimeType: res.mimeType });
          parts.push(`[image ${images.length}: ${res.uri ?? ''}]`);
        } else parts.push(`[resource ${res.uri ?? ''}${res.mimeType ? ` (${res.mimeType})` : ''}]`);
      } else if (c?.type === 'resource_link') parts.push(`[link: ${c.name ?? ''} ${c.uri ?? ''}]`.replace(/\s+\]/, ']'));
      else if (c?.type) parts.push(`[${c.type}]`);
    }
    let text = parts.join('\n');
    // Structured content usually comes as text too; when it does not, it is added.
    if (r.structuredContent !== undefined) {
      const json = JSON.stringify(r.structuredContent);
      const compact = (s: string) => s.replace(/\s+/g, '');
      if (!compact(text).includes(compact(json).slice(0, 200))) text = text ? `${text}\n\nStructured result:\n${JSON.stringify(r.structuredContent, null, 1)}` : JSON.stringify(r.structuredContent, null, 1);
    }
    return { text: text || (images.length ? '' : '(no output)'), images, isError: !!r.isError, ...(r.structuredContent !== undefined ? { structured: r.structuredContent } : {}) };
  }

  close() {
    this.link?.close();
    const p = this.proc;
    if (!p) return;
    // Its input closed first: a server ends on that even behind a launcher that is killed.
    p.stdin?.end();
    p.kill();
  }

  private notify(method: string, params: unknown = {}) {
    const m = { jsonrpc: '2.0', method, params };
    if (this.proc) this.proc.stdin!.write(JSON.stringify(m) + '\n');
    else if (this.link) void this.link.send(m, this.def.headers ?? {}).catch(() => {});
    else void this.post(m).catch(() => {});
  }

  private async request(method: string, params: unknown, timeout: number, signal?: AbortSignal): Promise<any> {
    const id = ++this.seq;
    const msg = { jsonrpc: '2.0', id, method, params };
    let m: any;
    if (this.proc) {
      if (this.stopped) throw new Error(`${this.def.name}: The MCP server stopped`);
      m = await new Promise((resolve, reject) => {
        const t = setTimeout(() => (this.waiting.delete(id), reject(new Error(`${this.def.name}: ${method} took too long`))), timeout);
        signal?.addEventListener('abort', () => (clearTimeout(t), this.waiting.delete(id), reject(new Error('stopped'))), { once: true });
        this.waiting.set(id, (r) => (clearTimeout(t), this.waiting.delete(id), resolve(r)));
        this.proc!.stdin!.write(JSON.stringify(msg) + '\n');
      });
    } else if (this.link) m = await this.link.send(msg, this.def.headers ?? {}, { timeoutMs: timeout, signal });
    else m = await this.post(msg, timeout, signal);
    if (m.error) throw new Error(`${this.def.name}: ${m.error.message ?? 'error'}`);
    return m.result ?? {};
  }

  /** Streamable HTTP: the answer comes as JSON, or as an event stream that carries it. */
  private async post(msg: any, timeout = 30_000, signal?: AbortSignal): Promise<any> {
    const own = this.def.headers ?? {};
    const keyed = Object.keys(own).some((h) => h.toLowerCase() === 'authorization');
    // Signed in through Hydor, and no key of the server's own to try first.
    if (this.def.relay && this.def.signedIn && !keyed) this.relayed = true;
    const relayed = this.relayed;
    const session: Record<string, string> = this.session ? { 'mcp-session-id': this.session } : {};
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...session };
    if (relayed) {
      // The server's own headers go along (all but Authorization, which the sign-in replaces).
      headers['x-hydor-mcp-url'] = this.def.url!;
      headers['x-hydor-mcp-headers'] = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(own).filter(([h]) => h.toLowerCase() !== 'authorization')))).toString('base64');
    } else Object.assign(headers, own);
    const r = await fetch(relayed ? this.def.relay! : this.def.url!, {
      method: 'POST',
      headers,
      body: JSON.stringify(msg),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    });
    const refused = async () => String(((await r.json().catch(() => ({}))) as { error?: unknown }).error ?? '');
    if (r.status === 401) {
      // A server that wants a sign-in: asked again through the app, which has it when the person signed in.
      if (!relayed && this.def.relay) {
        r.body?.cancel().catch(() => {});
        this.relayed = true;
        return this.post(msg, timeout, signal);
      }
      throw new Unauthorized(`${this.def.name}: ${(relayed && (await refused())) || 'refused the request (401)'}`);
    }
    this.session = r.headers.get('mcp-session-id') ?? this.session;
    if (msg.id == null) return null;
    if (!r.ok) throw new Error((relayed && (await refused())) || `${this.def.name} answered ${r.status}`);
    if (!(r.headers.get('content-type') ?? '').includes('text/event-stream')) return r.json();
    const text = await r.text();
    for (const block of text.split(/\n\n/))
      for (const line of block.split('\n'))
        if (line.startsWith('data:'))
          try {
            const m = JSON.parse(line.slice(5));
            if (m.id === msg.id) return m;
          } catch {}
    throw new Error(`${this.def.name}: no answer`);
  }
}
