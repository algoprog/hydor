// Takes the guide's screenshots again (docs/guide/images/<topic>.webp and <topic>-light.webp): starts a demo copy
// of the app with made-up data (demo.mjs) in a folder of its own, then each shot (shots.mjs) in the dark and the
// light theme with Chromium. See README.md.
//
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app [--only projects,tasks] [--themes dark] [--out dir] [--keep]
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots website/shots.mjs --out website/src/img   another list
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --serve     the demo app alone, until Ctrl+C
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Browser, sleep } from './cdp.mjs';
import { CATALOG, EMAIL, makeData, makeFiles, makeImported, makeSessions, overrides, seedApi } from './demo.mjs';
import { SHOTS as GUIDE_SHOTS } from './shots.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : d;
  };
  return {
    root: path.resolve(get('root', process.env.GUIDE_SHOTS_ROOT ?? '')),
    out: path.resolve(get('out', path.join(REPO, 'docs/guide/images'))),
    only: get('only', '')?.split(',').filter(Boolean) ?? [],
    shots: get('shots', ''),
    themes: get('themes', 'dark,light').split(',').filter(Boolean),
    port: Number(get('port', 8795)),
    keep: a.includes('--keep'),
    serve: a.includes('--serve'),
  };
}

const o = args();
// Another list of shots (the website's, website/shots.mjs) instead of the guide's.
const SHOTS = o.shots ? (await import(pathToFileURL(path.resolve(o.shots)).href)).SHOTS : GUIDE_SHOTS;
if (!fs.existsSync(path.join(o.root, 'dist/server/index.js')) || !fs.existsSync(path.join(o.root, 'dist/web/index.html')))
  throw new Error('--root: a built copy of the app (dist/server and dist/web), made in a git worktree under /tmp (see README.md)');
// A copy started by hand from a git checkout outside the temp folder sets itself up to start with the computer.
if (!o.root.startsWith(os.tmpdir() + path.sep)) throw new Error(`--root must be under ${os.tmpdir()}: the app sets up a service for copies elsewhere`);
if (o.port === 8790) throw new Error('--port: not 8790, the usual app’s');

const now = Date.now();
// Not under /tmp: the Git page leaves out repositories there (scratch copies), and the demo has one to show.
const demo = fs.mkdtempSync(path.join(process.env.GUIDE_SHOTS_DIR ?? (fs.existsSync('/dev/shm') ? '/dev/shm' : os.homedir()), 'guide-shots-demo-'));
const home = path.join(demo, 'home');
const bin = path.join(demo, 'bin');
const base = `http://127.0.0.1:${o.port}`;
let server = null;
let browser = null;

/** Stand-ins for the agents' programs: they answer what the pages ask (version, sign-in), and run nothing. */
function stubs() {
  fs.mkdirSync(bin, { recursive: true });
  const claude = `#!/bin/sh\ncase "$1" in\n  --version|-v) echo "2.1.30 (Claude Code)" ;;\n  auth) echo '{"loggedIn":true,"authMethod":"claude.ai","email":"${EMAIL}","subscriptionType":"max"}' ;;\n  *) exit 1 ;;\nesac\n`;
  const codex = '#!/bin/sh\ncase "$1" in\n  --version) echo "codex-cli 0.161.0" ;;\n  *) exit 1 ;;\nesac\n';
  fs.writeFileSync(path.join(bin, 'claude'), claude, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'codex'), codex, { mode: 0o755 });
}

async function startServer() {
  const env = {
    PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
    HOME: home,
    TMPDIR: os.tmpdir(),
    LANG: 'en_US.UTF-8',
    TZ: 'America/New_York',
    DATA_DIR: path.join(home, '.hydor'),
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    CODEX_HOME: path.join(home, '.codex'),
    CLAUDE_BIN: path.join(bin, 'claude'),
    CODEX_BIN: path.join(bin, 'codex'),
    PORT: String(o.port),
    HOST: '127.0.0.1',
    HYDOR_ROOT: o.root,
    // Playwright's browsers, where the app takes pages' pictures with (its home is the demo's).
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } : {}),
    // A preview port of its own (the usual one may be the real app's).
    PREVIEW_PORT: process.env.PREVIEW_PORT ?? '0',
  };
  const log = fs.openSync(path.join(demo, 'server.log'), 'a');
  server = spawn(process.execPath, [path.join(o.root, 'dist/server/index.js')], { cwd: home, env, stdio: ['ignore', log, log] });
  for (let i = 0; i < 100; i++) {
    await sleep(300);
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    if (server.exitCode !== null) throw new Error(`The demo app stopped: see ${path.join(demo, 'server.log')}`);
  }
  const token = fs.readFileSync(path.join(env.DATA_DIR, 'setup-token'), 'utf8').trim();
  const r = await fetch(`${base}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ token, password: 'a demo password' }) });
  const cookie = /wa_session=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1];
  if (!cookie) throw new Error(`No sign-in: ${r.status} ${await r.text()}`);
  return cookie;
}

function apiFor(cookie) {
  return async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { cookie: `wa_session=${cookie}`, origin: base, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
}

/** Before the app's own scripts: the theme, no caret, and the socket's news for the faked sessions held back. */
const pageScript = (theme, live) => `
(() => {
  try {
    const k = 'wa.ui.v1';
    const v = JSON.parse(localStorage.getItem(k) || '{}');
    if (v.theme !== ${JSON.stringify(theme)}) { v.theme = ${JSON.stringify(theme)}; localStorage.setItem(k, JSON.stringify(v)); localStorage.removeItem('wa.theme.boot'); }
  } catch {}
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = '*{caret-color:transparent!important}';
    document.head.appendChild(s);
  });
  const LIVE = ${JSON.stringify(live)};
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(fn) {
      if (!fn) return desc.set.call(this, fn);
      desc.set.call(this, (ev) => {
        let e;
        try { e = JSON.parse(ev.data); } catch { return fn.call(this, ev); }
        if (e.t === 'usage' || e.t === 'models') return;
        if (e.t === 'live' && LIVE[e.key]) return;
        if (e.t === 'sessions' && e.upsert) {
          e.upsert = e.upsert.map((x) => (LIVE[x.key] ? { ...x, live: LIVE[x.key].live } : x));
          return fn.call(this, new MessageEvent('message', { data: JSON.stringify(e) }));
        }
        return fn.call(this, ev);
      });
    },
  });
})();`;

async function main() {
  console.log(`demo app in ${demo}`);
  stubs();
  const folders = makeFiles(home, now);
  const sessions = makeSessions(home, path.join(home, '.claude/projects'), now, folders);
  const imported = makeImported(home, path.join(home, '.codex'), path.join(home, '.claude/projects'), now);
  makeData(path.join(home, '.hydor'));
  const cookie = await startServer();
  const api = apiFor(cookie);
  await seedApi(api, home, now, sessions);
  // Alex's sessions were started in Hydor (the app's own are, and so they show); those the API touched (a space, a
  // pin) take the time of their last message again. The imported ones stay as they came.
  const Database = createRequire(path.join(REPO, 'package.json'))('better-sqlite3');
  const db = new Database(path.join(home, '.hydor', 'hydor.db'));
  db.pragma('busy_timeout = 5000');
  const own = db.prepare(
    `insert into app_sessions (key, agent, created_by_app, created_at, updated_at) values (?, 'claude', 1, ?, ?)
     on conflict(key) do update set created_by_app = 1, created_at = excluded.created_at, updated_at = excluded.updated_at`,
  );
  for (const x of Object.values(sessions)) own.run(x.key, x.at - 60_000, x.at);
  db.close();
  // The sessions once the app has read their transcripts.
  const keys = [...Object.values(sessions), ...Object.values(imported)].map((s) => s.key);
  for (let i = 0; i < 60; i++) {
    const list = await api('GET', '/api/sessions?limit=300');
    const have = new Set((list.sessions ?? list).map((s) => s.key));
    if (keys.every((k) => have.has(k))) break;
    await sleep(500);
  }
  const ctx = { base, home, sessions, api, out: o.out };

  if (o.serve) {
    // To look around (password "a demo password"); what route() fakes shows only in the shots.
    console.log(`serving ${base}; Ctrl+C to stop`);
    await new Promise((r) => process.on('SIGINT', r).on('SIGTERM', r));
    return;
  }
  browser = await Browser.launch();
  const shots = o.only.length ? SHOTS.filter((s) => o.only.includes(s.id)) : SHOTS;
  for (const theme of o.themes) {
    for (const shot of shots) {
      const p = await browser.page();
      await p.viewport(shot.width ?? 1280, shot.height ?? 800, shot.phone ? { scale: 3, mobile: true } : { scale: 2 });
      await p.timezone('America/New_York');
      await p.cookie('wa_session', cookie, base);
      // Made afresh for each picture, so a card has waited seconds, not the minutes the run takes.
      const fake = overrides(sessions, Date.now());
      await p.initScript(pageScript(theme, fake.live));
      await route(p, api, fake);
      const file = path.join(o.out, `${shot.id}${theme === 'light' ? '-light' : ''}.webp`);
      try {
        const size = await shot.take(p, { ...ctx, theme, file, go: (u, opts) => p.goto(base + u, opts) });
        console.log(`${path.relative(REPO, file)}  ${Math.round(size / 1024)} KB`);
      } catch (e) {
        console.warn(`${shot.id} (${theme}) failed: ${e.message}`);
      }
      if (p.errors.length) console.warn(`  page errors: ${p.errors.slice(0, 3).join(' | ').slice(0, 300)}`);
      await browser.conn.send('Target.closeTarget', { targetId: p.targetId }).catch(() => {});
    }
  }
}

/** The faked parts: sessions waiting on a card, Claude Code's models, the plans' usage, the inbox, Settings → Models
 * and the models it suggests, and Experiments' GPUs. */
async function route(p, api, fake) {
  await p.route(/\/api\/(sessions(\?|\/[^/?]+(\?|$))|usage|inbox|catalog\/claude|models(\?|$)|models\/picks|experiments\/queue)/, async (req) => {
    if (req.method !== 'GET') return null;
    const u = new URL(req.url);
    if (u.pathname === '/api/models') return { json: fake.models(await api('GET', u.pathname)) };
    if (u.pathname === '/api/models/picks') return { json: { picks: fake.picks } };
    if (u.pathname === '/api/catalog/claude') return { json: { ...(await api('GET', u.pathname)), models: CATALOG.claude } };
    if (u.pathname === '/api/usage') return { json: { ...fake.usage, accounts: {} } };
    if (u.pathname === '/api/inbox') return { json: { items: fake.inbox } };
    if (u.pathname === '/api/experiments/queue') {
      const { gpuNote, ...q } = await api('GET', u.pathname);
      return { json: { ...q, gpus: fake.gpus } };
    }
    if (u.pathname === '/api/sessions') {
      const list = await api('GET', u.pathname + u.search);
      const patch = (x) => (fake.live[x.key] ? { ...x, live: fake.live[x.key].live } : x);
      return { json: Array.isArray(list) ? list.map(patch) : { ...list, sessions: list.sessions.map(patch) } };
    }
    const key = decodeURIComponent(u.pathname.slice('/api/sessions/'.length));
    if (!fake.live[key]) return null;
    const r = await api('GET', u.pathname);
    return { json: { ...r, summary: r.summary && { ...r.summary, live: fake.live[key].live }, live: fake.live[key].live, overlay: fake.live[key].overlay } };
  });
}

try {
  await main();
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    for (let i = 0; i < 20 && server.exitCode === null; i++) await sleep(250);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  if (o.keep) console.log(`kept ${demo}`);
  else fs.rmSync(demo, { recursive: true, force: true });
}
