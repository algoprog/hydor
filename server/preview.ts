// Previewing a dev server that runs on this machine (Vite on :5173, say) from another device. The
// preview is served on a port of its own (PREVIEW_PORT, 8791 by default), so its pages have an origin
// apart from the app's: the app's origin check refuses their requests, and the app's cookies are taken
// off what goes to the dev server. Entry is by a short-lived link the app signs, which sets a cookie
// naming the port for this browser; requests and WebSockets (hot reload) then go through.
//
// Shown inside the app's Preview page (a frame), its pages get a small helper that tells the page where
// they are (for its address bar) and goes back, forward or reloads when asked. Where the browser cannot
// reach the preview port (the app behind a tunnel with one hostname), Preview shows pictures of the screen
// instead, taken here (devServerShot).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { capture } from './capture/index.ts';
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
  // A page for the app's frame comes uncompressed, so the helper can go in.
  if (inFrame(req)) delete out['accept-encoding'];
  const jar = String(req.headers.cookie ?? '')
    .split(/;\s*/)
    .filter((c) => c && !APP_COOKIES.has(c.split('=')[0]));
  if (jar.length) out.cookie = jar.join('; ');
  else delete out.cookie;
  return out;
}

/** A page asked for by the frame in the app's Preview page. */
const inFrame = (req: http.IncomingMessage) => req.headers['sec-fetch-dest'] === 'iframe' && req.method === 'GET';

/**
 * In the app's frame: tells the Preview page where the page is and its title as they change, and goes
 * back, forward or reloads when the page asks. It only talks to its parent, by postMessage.
 */
const HELPER = `<script data-naget-preview>(function(){if(window.parent===window)return;var P=window.parent,t=0;function say(){clearTimeout(t);t=setTimeout(function(){try{P.postMessage({type:'naget-preview',href:location.href,title:document.title},'*')}catch(e){}},50)}['pushState','replaceState'].forEach(function(k){var o=history[k];history[k]=function(){var r=o.apply(this,arguments);say();return r}});addEventListener('popstate',say);addEventListener('hashchange',say);addEventListener('load',say);addEventListener('message',function(e){var d=e.data;if(e.source!==P||!d||d.type!=='naget-preview-go')return;if(d.go==='back')history.back();else if(d.go==='forward')history.forward();else if(d.go==='reload')location.reload()});say()})();</script>`;

/** The helper at the start of an HTML page's head. */
function withHelper(html: string): string {
  const m = /<head[^>]*>/i.exec(html);
  if (m) return html.slice(0, m.index + m[0].length) + HELPER + html.slice(m.index + m[0].length);
  const d = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(html);
  return d ? d[0] + HELPER + html.slice(d[0].length) : HELPER + html;
}

/** A path inside the preview to open at (not another site). */
const safePath = (p: string | null) => (p && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') ? p : '/');

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
      if (t?.k !== 'preview-open' || used.has(raw)) return page(res, 403, 'This preview link has expired. Open the preview again from Hydor.');
      used.set(raw, t.e);
      const https = req.headers['x-forwarded-proto'] === 'https' || String(req.headers['cf-visitor'] ?? '').includes('https');
      const session = signLink({ k: 'preview', port: t.port }, SESSION_MS);
      res.writeHead(302, {
        'Set-Cookie': `${COOKIE}=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${https ? '; Secure' : ''}`,
        Location: safePath(url.searchParams.get('to')),
        'Cache-Control': 'no-store',
      });
      return res.end();
    }
    const port = portOf(req);
    if (!port) return page(res, 403, 'Open this preview from Hydor (Preview in the menu).');
    // localhost, trying both address families: dev servers listen on 127.0.0.1, ::1 or both.
    const opts = { host: 'localhost', port, autoSelectFamily: true, method: req.method, path: req.url, headers: forwarded(req, port) } as http.RequestOptions;
    const up = http.request(opts, (r) => {
      const type = String(r.headers['content-type'] ?? '');
      // A page in the app's frame: read whole (pages are small), the helper put in.
      if (inFrame(req) && type.includes('text/html') && !r.headers['content-encoding']) {
        const chunks: Buffer[] = [];
        let size = 0;
        r.on('data', (c: Buffer) => {
          size += c.length;
          if (size <= 8 << 20) chunks.push(c);
        });
        r.on('end', () => {
          if (size > 8 << 20) return page(res, 502, 'The page is too big to preview here.');
          const body = Buffer.from(withHelper(Buffer.concat(chunks).toString('utf8')), 'utf8');
          const headers = { ...r.headers, 'content-length': String(body.length) };
          delete headers['transfer-encoding'];
          res.writeHead(r.statusCode ?? 200, headers);
          res.end(body);
        });
        r.on('error', () => res.destroy());
        return;
      }
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
  /** It answers with a web page (not an API or a database). */
  web?: boolean;
  /** That page's title. */
  title?: string;
  /** The project it runs: its package's name, else its folder's. */
  project?: string;
  /** What serves it, when it can be told: Vite, Next.js… */
  framework?: string;
}

/** What answers on a port: a web page (with its title and what made it) or something else. */
async function probe(port: number): Promise<{ web: boolean; title?: string; hint: string }> {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port, path: '/', autoSelectFamily: true, timeout: 1500, headers: { accept: 'text/html', 'user-agent': 'Hydor-Preview' } } as http.RequestOptions, (r) => {
      const type = String(r.headers['content-type'] ?? '');
      const hint = `${r.headers['x-powered-by'] ?? ''} ${r.headers.server ?? ''}`;
      // A page that says it is not there (an API's 404) is no web app to look at.
      if (!type.includes('text/html') || (r.statusCode ?? 500) >= 400) {
        r.resume();
        return resolve({ web: false, hint });
      }
      let html = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => {
        if (html.length < 65_536) html += c;
      });
      r.on('end', () => {
        const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1].replace(/\s+/g, ' ').trim();
        resolve({ web: true, title: title ? decodeEntities(title) : undefined, hint: `${hint} ${html.slice(0, 20_000)}` });
      });
      r.on('error', () => resolve({ web: false, hint }));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ web: false, hint: '' }));
  });
}

const decodeEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** What serves a page, from its command and its page. */
function frameworkOf(command: string, hint: string): string | undefined {
  const c = command.toLowerCase();
  const tests: [RegExp, string][] = [
    [/@vite\/client|\bvite\b/, 'Vite'],
    [/__next|\/_next\/|next(-server| dev| start)/, 'Next.js'],
    [/astro/, 'Astro'],
    [/nuxt/, 'Nuxt'],
    [/svelte-?kit/, 'SvelteKit'],
    [/remix/, 'Remix'],
    [/webpack/, 'webpack'],
    [/jupyter/, 'Jupyter'],
    [/streamlit/, 'Streamlit'],
    [/gradio/, 'Gradio'],
    [/manage\.py runserver|django/, 'Django'],
    [/flask|werkzeug/, 'Flask'],
    [/uvicorn|fastapi/, 'FastAPI'],
    [/http\.server|simplehttp/, 'Python'],
    [/express/, 'Express'],
    [/rails|puma/, 'Rails'],
    [/hugo/, 'Hugo'],
    [/jekyll/, 'Jekyll'],
  ];
  for (const [re, name] of tests) if (re.test(c) || re.test(hint.toLowerCase())) return name;
  return undefined;
}

/** The project a folder belongs to: the nearest package's name, else the folder's. */
function projectOf(dir: string | undefined): string | undefined {
  if (!dir) return undefined;
  let d = dir;
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
      if (typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim().replace(/^@[^/]+\//, '');
    } catch {}
    try {
      const py = fs.readFileSync(path.join(d, 'pyproject.toml'), 'utf8');
      const m = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(py);
      if (m) return m[1];
    } catch {}
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return path.basename(dir) || undefined;
}

const probed = new Map<string, { at: number; r: { web: boolean; title?: string; hint: string } }>();

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
      const list = [...seen.values()].sort((a, b) => a.port - b.port);
      // What each one serves, asked at most every 15 seconds (a page's title changes as it is built).
      void Promise.all(
        list.map(async (d) => {
          // A browser's own debugging port answers with a page too; it is never a dev server.
          if (/chrom|headless/i.test(d.program)) return;
          const k = `${d.port}:${d.pid}`;
          let p = probed.get(k);
          if (!p || Date.now() - p.at > 15_000) probed.set(k, (p = { at: Date.now(), r: await probe(d.port) }));
          d.web = p.r.web;
          d.title = p.r.title;
          d.project = projectOf(d.cwd);
          d.framework = d.web ? frameworkOf(d.command, p.r.hint) : undefined;
        }),
      ).then(() => resolve(list));
    }),
  );
}

/** A picture of a dev server's page, as a browser here sees it. */
export async function devServerShot(port: number, at: string, device: 'desktop' | 'tablet' | 'phone'): Promise<Buffer> {
  const vp = device === 'phone' ? { width: 390, height: 844, scale: 2, mobile: true } : device === 'tablet' ? { width: 820, height: 1180, scale: 1, mobile: true } : { width: 1280, height: 800, scale: 1, mobile: false };
  const shot = await capture({ url: `http://localhost:${port}${safePath(at)}`, ...vp, format: 'png', settleMs: 900 });
  return shot.data;
}
