// A small program agents start for their connected apps (built as dist/server/connbridge.js), so no key
// is ever written into an agent's MCP settings:
//
//   connbridge launch unix:<socket> <path>   asks Hydor for a local app's command and environment (its
//                                 keys among them) on the app's own socket, which only this user can open
//                                 (or at an http address when that socket is off), runs it, and passes its
//                                 MCP messages through: only the tools that are on, keys masked in replies.
//                                 A form the app asks for mid-call (MCP elicitation) goes to Hydor,
//                                 which shows it in the session; the answer goes back to the app.
//   connbridge relay <address>    MCP over stdin and stdout, for an agent that cannot reach an address
//                                 itself, carried to Hydor's relay for a remote app.
//
// Messages are JSON-RPC, one per line. Imports nothing from the server.
import { spawn } from 'node:child_process';
import { spawnProgram } from '../platform.ts';
import http from 'node:http';

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any; result?: any; error?: any };

const [mode, address, socketPath] = process.argv.slice(2);
const out = (m: Msg) => process.stdout.write(`${JSON.stringify(m)}\n`);
const die = (text: string) => {
  process.stderr.write(`[hydor] ${text}\n`);
  process.exit(1);
};

/** Calls `fn` with each line of a stream. */
function lines(stream: NodeJS.ReadableStream, fn: (line: string) => void, end?: () => void) {
  let buf = '';
  stream.setEncoding?.('utf8');
  stream.on('data', (d: string) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (line.trim()) fn(line);
    }
  });
  stream.on('end', () => {
    if (buf.trim()) fn(buf);
    end?.();
  });
}

/** GET over a Unix socket: { status, body }. */
function getUnix(socket: string, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ socketPath: socket, path, timeout: 20_000 }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(b) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: {} });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('no answer')));
    req.on('error', reject);
  });
}

/** POSTs JSON over a Unix socket, however long the answer takes: { status, body }. */
function postUnix(socket: string, path: string, body: string, signal: AbortSignal): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: socket, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, signal }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(b) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: {} });
        }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** Calls `fn` with each message of a line: one, or each of a batch. */
const each = (v: unknown, fn: (m: Msg) => void) => (Array.isArray(v) ? v : [v]).forEach((m) => m && typeof m === 'object' && fn(m as Msg));

async function launch() {
  let spec: { name: string; command: string; args: string[]; env: Record<string, string>; only: string[] | null; skip: string[]; mask: string[] };
  try {
    const r = address.startsWith('unix:') ? await getUnix(address.slice(5), socketPath ?? '') : await fetch(address, { signal: AbortSignal.timeout(20_000) }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
    if (r.status !== 200) return die(r.body?.error ?? `Hydor answered ${r.status}`);
    spec = r.body;
  } catch (e) {
    return die(`Could not reach Hydor: ${(e as Error).message}`);
  }
  const only = spec.only ? new Set(spec.only) : null;
  const skip = new Set(spec.skip ?? []);
  const filtering = !!only || skip.size > 0;
  const on = (name: unknown) => (!only || only.has(String(name))) && !skip.has(String(name));
  const masks = [...new Set(spec.mask.filter((s) => s.length >= 6).flatMap((s) => [s, JSON.stringify(s).slice(1, -1), encodeURIComponent(s), new URLSearchParams({ v: s }).toString().slice(2)]))].sort((a, b) => b.length - a.length);
  const mask = (t: string) => masks.reduce((s, m) => (s.includes(m) ? s.split(m).join('[hidden]') : s), t);
  const child = spawnProgram(spec.command, spec.args, { env: { ...process.env, ...spec.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.on('error', (e) => die(`${spec.name} did not start: ${(e as NodeJS.ErrnoException).code === 'ENOENT' ? `${spec.command} is not installed` : e.message}`));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.stdin!.on('error', () => {});
  // (Windows has no SIGHUP to pass on: there the program just ends.)
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const)
    process.on(s, () => {
      try {
        child.kill(s);
      } catch {}
    });
  // tools/list requests on their way, so their answers can be trimmed to the tools that are on.
  const listing = new Set<string>();
  const off = (m: Msg) => m.method === 'tools/call' && !on(m.params?.name);
  // Forms the app asks for: to Hydor, beside the address the command came from.
  const asking = new Set<AbortController>();
  const toApp = (m: Msg) => child.stdin!.write(`${JSON.stringify(m)}\n`);
  const askUser = async (m: Msg) => {
    const ac = new AbortController();
    asking.add(ac);
    const body = JSON.stringify(m.params ?? {});
    try {
      const r = address.startsWith('unix:')
        ? await postUnix(address.slice(5), (socketPath ?? '').replace(/^\/launch\//, '/elicit/'), body, ac.signal)
        : await fetch(address.replace('/launch/', '/elicit/'), { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: ac.signal }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
      toApp({ jsonrpc: '2.0', id: m.id, result: r.status === 200 && r.body?.action ? r.body : { action: 'cancel' } });
    } catch {
      toApp({ jsonrpc: '2.0', id: m.id, result: { action: 'cancel' } });
    } finally {
      asking.delete(ac);
    }
  };
  lines(
    process.stdin,
    (line) => {
      // Only lines that may need a change are read: the introduction, a call given up, calls to tools that are off.
      if (!filtering && !line.includes('"initialize"') && !line.includes('notifications/cancelled')) return void child.stdin!.write(`${line}\n`);
      let v: unknown;
      try {
        v = JSON.parse(line);
      } catch {
        return void child.stdin!.write(`${line}\n`);
      }
      // Calls to tools that are off are answered here (or dropped, without an id), in a batch too.
      each(v, (m) => {
        // The app may ask for forms: Hydor shows them, whatever the agent itself can.
        if (m.method === 'initialize') m.params = { ...(m.params ?? {}), capabilities: { ...(m.params?.capabilities ?? {}), elicitation: { form: {}, url: {} } } };
        // The agent gave up on a call: a form it was waiting on ends.
        if (m.method === 'notifications/cancelled') for (const ac of asking) ac.abort();
        if (off(m) && m.id != null) out({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: `${spec.name}'s ${m.params?.name} tool is turned off (Apps → Connected apps).` }], isError: true } });
        if (m.method === 'tools/list' && m.id != null) listing.add(String(m.id));
      });
      let rest = Array.isArray(v) ? v.filter((m) => !(m && typeof m === 'object' && off(m as Msg))) : off(v as Msg) ? null : v;
      // A batch down to one message goes as that message (newer servers take no batches).
      if (Array.isArray(rest) && rest.length === 1 && Array.isArray(v) && v.length > 1) rest = rest[0];
      if (rest && (!Array.isArray(rest) || rest.length)) child.stdin!.write(`${JSON.stringify(rest)}\n`);
    },
    () => child.stdin!.end(),
  );
  lines(child.stdout!, (line) => {
    // A form the app asks for goes to the user, not the agent.
    if (line.includes('elicitation/create')) {
      try {
        const v = JSON.parse(line);
        const asks = (m: Msg) => m.method === 'elicitation/create' && m.id != null;
        each(v, (m) => asks(m) && void askUser(m));
        const rest = Array.isArray(v) ? v.filter((m) => !(m && typeof m === 'object' && asks(m as Msg))) : asks(v) ? null : v;
        if (!rest || (Array.isArray(rest) && !rest.length)) return;
        line = JSON.stringify(rest);
      } catch {}
    }
    if (filtering && listing.size) {
      try {
        const v = JSON.parse(line);
        let changed = false;
        each(v, (m) => {
          if (m.id != null && listing.has(String(m.id)) && Array.isArray(m.result?.tools)) {
            listing.delete(String(m.id));
            m.result.tools = m.result.tools.filter((t: { name?: unknown }) => on(t?.name));
            changed = true;
          }
        });
        if (changed) line = JSON.stringify(v);
      } catch {}
    }
    process.stdout.write(`${mask(line)}\n`);
  });
  lines(child.stderr!, (line) => process.stderr.write(`${mask(line)}\n`));
}

function relay() {
  let session: string | undefined;
  /** The agent's initialize, to introduce it again when Hydor or the app has forgotten the session. */
  let init: string | undefined;
  let again: Promise<void> | null = null;
  let pending = 0;
  let ended = false;
  const finish = () => ended && !pending && process.exit(0);
  const post = (body: string) =>
    fetch(address, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(session ? { 'mcp-session-id': session } : {}) },
      body,
      signal: AbortSignal.timeout(11 * 60_000),
    });
  const reintroduce = () =>
    (again ??= (async () => {
      session = undefined;
      const r = await post(init!);
      session = r.headers.get('mcp-session-id') ?? undefined;
      await r.text().catch(() => '');
      await post(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })).then((x) => x.text().catch(() => ''));
    })().finally(() => (again = null)));
  lines(
    process.stdin,
    (line) => {
      let m: Msg;
      try {
        m = JSON.parse(line);
      } catch {
        return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      }
      if (!Array.isArray(m) && m.method === 'initialize') init = line;
      pending++;
      void (async () => {
        try {
          if (again) await again;
          let r = await post(line);
          // The session is gone (Hydor or the app restarted): introduced again, then once more.
          if (r.status === 404 && session && init && init !== line) {
            await r.text().catch(() => '');
            await reintroduce();
            r = await post(line);
          }
          session = r.headers.get('mcp-session-id') ?? session;
          if (r.status === 202) return;
          const j = await r.json().catch(() => null);
          if (j && typeof j === 'object' && !Array.isArray(j) && 'jsonrpc' in j) out(j as Msg);
          else if (Array.isArray(j)) j.forEach((x) => out(x));
          else if (m.id != null) out({ jsonrpc: '2.0', id: m.id, error: { code: -32000, message: (j as any)?.error ?? `Hydor answered ${r.status}` } });
        } catch (e) {
          if (m.id != null) out({ jsonrpc: '2.0', id: m.id, error: { code: -32000, message: `Could not reach Hydor: ${(e as Error).message}` } });
        } finally {
          pending--;
          finish();
        }
      })();
    },
    () => {
      ended = true;
      finish();
    },
  );
}

if (!address || !(/^https?:\/\//.test(address) || (mode === 'launch' && address.startsWith('unix:') && socketPath))) die('usage: connbridge launch unix:<socket> <path> | launch <address> | relay <address>');
else if (mode === 'launch') void launch();
else if (mode === 'relay') relay();
else die('usage: connbridge launch|relay <address>');
