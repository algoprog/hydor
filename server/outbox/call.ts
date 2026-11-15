// Making a held call: when you send it from the Outbox, Hydor calls the connected account's tool itself (the
// agent that asked may have long finished): a remote account over Streamable HTTP or the older SSE, a local one
// started for the call and stopped after it, a built-in one (Email) through the function its module registers.
// The account's sign-in is added here, as the relay does for agents; known secrets are masked in what comes back.
import os from 'node:os';
import { authHeaders, localCommand, remoteUrl, type Conn } from '../connections/apps.ts';
import { INIT_PARAMS, isRequest, postHttp, SseLink, Unauthorized, type Rpc } from '../connections/upstream.ts';
import { redact } from '../connections/vault.ts';
import { agentBaseEnv } from '../env.ts';
import type { Deps } from '../features/types.ts';
import { spawnProgram } from '../platform.ts';

export interface CallResult {
  /** What the tool answered, as text (pictures named, not kept). */
  text: string;
  isError: boolean;
}

/** How long a held call may take once sent. */
const CALL_MS = 5 * 60_000;

type BuiltinCaller = (d: Deps, c: Conn, tool: string, args: Record<string, unknown>, o: { key?: string; cwd?: string }) => Promise<{ content: unknown[]; isError?: boolean; structuredContent?: unknown }>;
let builtin: BuiltinCaller | null = null;
/** A built-in account's module (server/mail) says how its tools are called without an agent. */
export const setBuiltinCaller = (fn: BuiltinCaller) => {
  builtin = fn;
};

/** A tool's answer as text: its text parts, other parts named. */
export function resultText(r: { content?: unknown; structuredContent?: unknown } | undefined): string {
  const parts = Array.isArray(r?.content) ? (r!.content as { type?: string; text?: string; resource?: { uri?: string; text?: string } }[]) : [];
  const out = parts.map((p) => (p?.type === 'text' ? String(p.text ?? '') : p?.type === 'resource' ? String(p.resource?.text ?? p.resource?.uri ?? '') : p?.type ? `[${p.type}]` : '')).filter(Boolean);
  if (!out.length && r?.structuredContent !== undefined) out.push(JSON.stringify(r.structuredContent));
  return out.join('\n').trim();
}

const asResult = (m: Rpc | null | undefined, name: string): CallResult => {
  if (!m) return { text: `${name} gave no answer`, isError: true };
  if (m.error) return { text: m.error.message || `${name} answered with an error`, isError: true };
  return { text: resultText(m.result) || '(no text in its answer)', isError: m.result?.isError === true };
};

/** What the app may ask of Hydor while it works: a ping is answered, a form declined (nobody waits on this call to fill one in). */
const decline = async (m: Rpc): Promise<Rpc> => (m.method === 'ping' ? { jsonrpc: '2.0', id: m.id, result: {} } : m.method === 'elicitation/create' ? { jsonrpc: '2.0', id: m.id, result: { action: 'decline' } } : { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Not offered' } });

async function viaHttp(d: Deps, c: Conn, call: Rpc, force = false): Promise<CallResult> {
  const url = remoteUrl(c);
  const h = await authHeaders(d.db, c, force);
  const init = await postHttp(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS }, h, { timeoutMs: 30_000, onRequest: decline });
  const r0 = init.replies[0];
  if (!r0) throw new Error(`${c.entry.name} answered ${init.status}${init.text ? `: ${init.text.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
  if (r0.error) throw new Error(r0.error.message);
  const o = { sessionId: init.sessionId, protocol: String(r0.result?.protocolVersion ?? INIT_PARAMS.protocolVersion), timeoutMs: CALL_MS, onRequest: decline };
  await postHttp(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, h, o).catch(() => {});
  try {
    const r = await postHttp(url, call, h, o);
    if (!r.replies.length && r.status >= 400) return { text: `${c.entry.name} answered ${r.status}${r.text ? `: ${r.text.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`, isError: true };
    return asResult(r.replies[0], c.entry.name);
  } finally {
    if (init.sessionId) void fetch(url, { method: 'DELETE', headers: { ...h, 'mcp-session-id': init.sessionId }, signal: AbortSignal.timeout(10_000), redirect: 'manual' }).catch(() => {});
  }
}

async function viaSse(d: Deps, c: Conn, call: Rpc, force = false): Promise<CallResult> {
  const url = remoteUrl(c);
  const h = await authHeaders(d.db, c, force);
  const link = await SseLink.open(url, h);
  link.onRequest = decline;
  try {
    const init = await link.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS }, h, { timeoutMs: 30_000 });
    if (init?.error) throw new Error(init.error.message);
    await link.send({ jsonrpc: '2.0', method: 'notifications/initialized' }, h);
    return asResult(await link.send(call, h, { timeoutMs: CALL_MS }), c.entry.name);
  } finally {
    link.close();
  }
}

/** A local app: started for this call, introduced, called, stopped. */
function viaStdio(d: Deps, c: Conn, call: Rpc, cwd?: string): Promise<CallResult> {
  const lc = localCommand(d.db, c);
  return new Promise((resolve, reject) => {
    let p: ReturnType<typeof spawnProgram>;
    try {
      p = spawnProgram(lc.command, lc.args, { cwd: cwd ?? os.homedir(), env: { ...agentBaseEnv(), ...lc.env }, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return reject(e);
    }
    let err = '';
    let buf = '';
    let done = false;
    const waiting = new Map<string, (m: Rpc) => void>();
    const finish = (e: Error | null, v?: CallResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      p.kill();
      setTimeout(() => p.kill('SIGKILL'), 3000).unref();
      if (e) reject(e);
      else resolve(v!);
    };
    const tail = () => redact(err.trim().split('\n').slice(-3).join(' ').slice(0, 300));
    const timer = setTimeout(() => finish(new Error(`${c.entry.name} did not answer within ${CALL_MS / 60_000} minutes`)), CALL_MS);
    p.on('error', (e) => finish(new Error((e as NodeJS.ErrnoException).code === 'ENOENT' ? `${lc.command} is not installed here` : e.message)));
    p.on('exit', (code) => finish(new Error(`${c.entry.name} stopped (exit ${code})${err ? `: ${tail()}` : ''}`)));
    p.stdin!.on('error', () => {});
    p.stderr!.on('data', (x) => (err = (err + x.toString()).slice(-4000)));
    const write = (m: Rpc) => p.stdin!.write(`${JSON.stringify(m)}\n`);
    p.stdout!.on('data', (x) => {
      buf += x.toString();
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        let m: Rpc;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        if (isRequest(m)) void decline(m).then(write);
        else if (m.id !== undefined && m.id !== null) waiting.get(String(m.id))?.(m);
      }
    });
    const ask = (m: Rpc) =>
      new Promise<Rpc>((res) => {
        waiting.set(String(m.id), (r) => (waiting.delete(String(m.id)), res(r)));
        write(m);
      });
    void (async () => {
      try {
        const init = await ask({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: INIT_PARAMS });
        if (init.error) throw new Error(init.error.message);
        write({ jsonrpc: '2.0', method: 'notifications/initialized' });
        finish(null, asResult(await ask(call), c.entry.name));
      } catch (e) {
        finish(e as Error);
      }
    })();
  });
}

/** Calls one of a connected account's tools now, with `args`: what it answered. Throws when it could not be reached. */
export async function callTool(d: Deps, c: Conn, tool: string, args: Record<string, unknown>, o: { key?: string; cwd?: string } = {}): Promise<CallResult> {
  const call: Rpc = { jsonrpc: '2.0', id: 'held', method: 'tools/call', params: { name: tool, arguments: args } };
  const t = c.entry.server.transport as string;
  let r: CallResult;
  if (t === 'builtin') {
    if (!builtin) throw new Error(`${c.entry.name} cannot be called from the Outbox in this version`);
    const x = await builtin(d, c, tool, args, o);
    r = { text: resultText(x) || '(no text in its answer)', isError: x.isError === true };
  } else if (t === 'stdio') r = await viaStdio(d, c, call, o.cwd);
  else {
    const via = t === 'sse' ? viaSse : viaHttp;
    try {
      r = await via(d, c, call);
    } catch (e) {
      if (!(e instanceof Unauthorized) || c.entry.auth.type !== 'oauth') throw e;
      // The token may have ended early: renewed once, then tried again.
      r = await via(d, c, call, true);
    }
  }
  return { text: redact(r.text), isError: r.isError };
}
