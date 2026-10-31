// Previewing a dev server that runs on this machine (Vite on :5173, say) from another device. The
// preview is served on a port of its own (PREVIEW_PORT, 8791 by default), so its pages have an origin
// apart from the app's: the app's origin check refuses their requests, and the app's cookies are taken
// off what goes to the dev server. Entry is by a short-lived link the app signs, which sets a cookie
// naming the port for this browser; requests and WebSockets (hot reload) then go through.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { config } from './config.ts';
import { readLink, signLink } from './links.ts';

export const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 8791);
/** Where browsers reach the preview port, when it is not the app's host on PREVIEW_PORT (a tunnel hostname, say). */
export const PREVIEW_ORIGIN = (process.env.PREVIEW_ORIGIN ?? '').replace(/\/+$/, '');

const COOKIE = 'ac_preview';
const SESSION_MS = 12 * 3600_000;
// The app's own cookies never reach a dev server.
const APP_COOKIES = new Set([COOKIE, 'wa_session']);

/** A link that opens the preview of `port` (it works once within two minutes, setting the cookie). */
export function previewToken(port: number): string {
  return signLink({ k: 'preview-open', port }, 120_000);
}

function portOf(req: http.IncomingMessage): number | null {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(String(req.headers.cookie ?? ''));
  const p = m ? readLink<{ k: string; port: number }>(decodeURIComponent(m[1])) : null;
  return p?.k === 'preview' && Number.isInteger(p.port) ? p.port : null;
}

/** The request's headers as the dev server should see them: its own host and origin, no app cookies. */
function forwarded(req: http.IncomingMessage, port: number): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) out[k] = v;
  out.host = `localhost:${port}`;
  if (out.origin) out.origin = `http://localhost:${port}`;
  const jar = String(req.headers.cookie ?? '')
    .split(/;\s*/)
    .filter((c) => c && !APP_COOKIES.has(c.split('=')[0]));
  if (jar.length) out.cookie = jar.join('; ');
  else delete out.cookie;
  return out;
}

// Entry links work once: each is kept here until it would have expired anyway.
const used = new Map<string, number>();
setInterval(() => {
  for (const [k, e] of used) if (e < Date.now()) used.delete(k);
}, 60_000).unref();

const page = (res: http.ServerResponse, code: number, text: string) => {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
};

export function startPreviewServer(): http.Server | null {
  if (!PREVIEW_PORT) return null;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://preview');
    // The app checks whether the browser can reach this port before offering links to it.
    if (url.pathname === '/__ac/ping') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (url.pathname === '/__ac/open') {
      const raw = url.searchParams.get('t') ?? '';
      const t = readLink<{ k: string; port: number; e: number }>(raw);
      if (t?.k !== 'preview-open' || used.has(raw)) return page(res, 403, 'This preview link has expired. Open the preview again from Naget Agent.');
      used.set(raw, t.e);
      const https = req.headers['x-forwarded-proto'] === 'https' || String(req.headers['cf-visitor'] ?? '').includes('https');
      const session = signLink({ k: 'preview', port: t.port }, SESSION_MS);
      res.writeHead(302, {
        'Set-Cookie': `${COOKIE}=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${https ? '; Secure' : ''}`,
        Location: '/',
        'Cache-Control': 'no-store',
      });
      return res.end();
    }
    const port = portOf(req);
    if (!port) return page(res, 403, 'Open this preview from Naget Agent (Preview in the menu).');
    // localhost, trying both address families: dev servers listen on 127.0.0.1, ::1 or both.
    const opts = { host: 'localhost', port, autoSelectFamily: true, method: req.method, path: req.url, headers: forwarded(req, port) } as http.RequestOptions;
    const up = http.request(opts, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => {
      if (!res.headersSent) page(res, 502, `Nothing answers on port ${port}. Is the dev server still running?`);
      else res.destroy();
    });
    req.pipe(up);
  });
  // Hot reload and other WebSockets: the handshake goes over with the same rewrites, then bytes flow both ways.
  server.on('upgrade', (req, socket, head) => {
    const port = portOf(req);
    if (!port) return socket.destroy();
    const up = net.connect({ host: 'localhost', port, autoSelectFamily: true }, () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (const [k, v] of Object.entries(forwarded(req, port))) for (const x of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${x}`);
      up.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });
  server.on('error', (e) => console.error(`[preview] ${(e as Error).message}; previews are off`));
  server.listen(PREVIEW_PORT, config.host, () => console.log(`[preview] dev-server previews on port ${PREVIEW_PORT}`));
  return server;
}

export interface DevServer {
  port: number;
  /** The program listening, and the folder it runs in. */
  program: string;
  command: string;
  cwd?: string;
  pid?: number;
}

/** Servers listening on this machine that a browser could preview: the user's own, not the app's. */
export function listDevServers(): Promise<DevServer[]> {
  return new Promise((resolve) =>
    execFile('ss', ['-ltnpH'], { timeout: 5000 }, (err, out) => {
      if (err) return resolve([]);
      const seen = new Map<number, DevServer>();
      for (const l of String(out).split('\n')) {
        const m = /\s(\S+):(\d+)\s+\S+\s+users:\(\("([^"]+)",pid=(\d+)/.exec(l);
        if (!m) continue;
        const [, addr, p, program, pid] = m;
        const port = Number(p);
        if (port === config.port || port === PREVIEW_PORT || port < 1024 || seen.has(port)) continue;
        // Reachable from this machine: loopback or every address.
        if (!/^(127\.0\.0\.1|0\.0\.0\.0|\*|\[::\]|\[::1\]|\[::ffff:127\.0\.0\.1\])$/.test(addr)) continue;
        let command = program;
        let cwd: string | undefined;
        try {
          command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ').slice(0, 200) || program;
          cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        } catch {}
        seen.set(port, { port, program, command, cwd, pid: Number(pid) });
      }
      resolve([...seen.values()].sort((a, b) => a.port - b.port));
    }),
  );
}
