// MCP servers for Console: the user's (Claude Code's user and project settings, the project's
// .mcp.json) and those the app hands over (its show_html page server). Over stdio (newline-delimited
// JSON-RPC) or Streamable HTTP; their tools join Console's as mcp__<server>__<tool>.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface McpDef {
  name: string;
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpTool {
  server: string;
  name: string;
  /** The name the model calls it by. */
  fullName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const readJson = (f: string): any => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

/** MCP servers from Claude Code's settings and the project's .mcp.json, plus the ones the app passes. */
export function mcpServers(cwd: string, fromClient: any[]): McpDef[] {
  const out = new Map<string, McpDef>();
  const add = (name: string, d: any) => {
    if (!d || typeof d !== 'object' || d.disabled) return;
    const type = d.type === 'http' || d.type === 'streamable-http' || (d.url && d.type !== 'sse') ? 'http' : d.command ? 'stdio' : null;
    if (!type) return;
    const headers = Array.isArray(d.headers) ? Object.fromEntries(d.headers.map((h: any) => [h.name, h.value])) : d.headers;
    out.set(name, { name, type, command: d.command, args: d.args ?? [], env: d.env, url: d.url, headers });
  };
  const claude = readJson(path.join(os.homedir(), '.claude.json'));
  for (const [n, d] of Object.entries(claude?.mcpServers ?? {})) add(n, d);
  for (const [n, d] of Object.entries(claude?.projects?.[cwd]?.mcpServers ?? {})) add(n, d);
  for (const [n, d] of Object.entries(readJson(path.join(cwd, '.mcp.json'))?.mcpServers ?? {})) add(n, d);
  for (const d of fromClient ?? []) if (d?.name) add(d.name, d);
  return [...out.values()];
}

const clean = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');

export class McpClient {
  tools: McpTool[] = [];
  error?: string;
  private proc?: ChildProcess;
  private seq = 0;
  private waiting = new Map<number, (m: any) => void>();
  private session?: string;

  constructor(readonly def: McpDef) {}

  async connect(): Promise<void> {
    if (this.def.type === 'stdio') {
      this.proc = spawn(this.def.command!, this.def.args ?? [], { env: { ...process.env, ...(this.def.env ?? {}) }, stdio: ['pipe', 'pipe', 'ignore'] });
      let buf = '';
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
      this.proc.on('exit', () => {
        for (const w of this.waiting.values()) w({ error: { message: 'The MCP server stopped' } });
        this.waiting.clear();
      });
    }
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
    this.tools = tools.map((t) => ({
      server: this.def.name,
      name: t.name,
      fullName: `mcp__${clean(this.def.name)}__${clean(t.name)}`.slice(0, 64),
      description: String(t.description ?? '').slice(0, 1000),
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
    }));
  }

  /** A tool's result as text (images and other content noted, not shown). */
  async call(tool: string, args: unknown, signal: AbortSignal): Promise<{ text: string; isError: boolean }> {
    const r = await this.request('tools/call', { name: tool, arguments: args ?? {} }, 600_000, signal);
    const text = (r.content ?? [])
      .map((c: any) => (c.type === 'text' ? c.text : c.type === 'resource' ? (c.resource?.text ?? `[resource ${c.resource?.uri}]`) : `[${c.type}]`))
      .join('\n');
    return { text: text || JSON.stringify(r.structuredContent ?? r), isError: !!r.isError };
  }

  close() {
    this.proc?.kill();
  }

  private notify(method: string, params: unknown = {}) {
    const m = { jsonrpc: '2.0', method, params };
    if (this.proc) this.proc.stdin!.write(JSON.stringify(m) + '\n');
    else void this.post(m).catch(() => {});
  }

  private async request(method: string, params: unknown, timeout: number, signal?: AbortSignal): Promise<any> {
    const id = ++this.seq;
    const msg = { jsonrpc: '2.0', id, method, params };
    let m: any;
    if (this.proc) {
      m = await new Promise((resolve, reject) => {
        const t = setTimeout(() => (this.waiting.delete(id), reject(new Error(`${this.def.name}: ${method} took too long`))), timeout);
        signal?.addEventListener('abort', () => (clearTimeout(t), this.waiting.delete(id), reject(new Error('stopped'))), { once: true });
        this.waiting.set(id, (r) => (clearTimeout(t), this.waiting.delete(id), resolve(r)));
        this.proc!.stdin!.write(JSON.stringify(msg) + '\n');
      });
    } else m = await this.post(msg, timeout, signal);
    if (m.error) throw new Error(`${this.def.name}: ${m.error.message ?? 'error'}`);
    return m.result ?? {};
  }

  /** Streamable HTTP: the answer comes as JSON, or as an event stream that carries it. */
  private async post(msg: any, timeout = 30_000, signal?: AbortSignal): Promise<any> {
    const r = await fetch(this.def.url!, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(this.session ? { 'mcp-session-id': this.session } : {}), ...(this.def.headers ?? {}) },
      body: JSON.stringify(msg),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    });
    this.session = r.headers.get('mcp-session-id') ?? this.session;
    if (msg.id == null) return null;
    if (!r.ok) throw new Error(`${this.def.name} answered ${r.status}`);
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
