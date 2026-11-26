// Checks for the web apps host and the proxy in front of it (host.ts, proxy.ts, sign.ts): apps that start on first
// use, stop when idle, come back after a fall; people kept apart; Hydor's cookies and keys kept out of an app; the three
// ways in (a hostname, a port, a path with a token); and, where bubblewrap is, the sandbox. The apps are small ones this
// test writes, which show the headers and environment an app gets and the files it can read.
// Build and run (ports 4330 to 4339 only):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/host-test.ts
//   DATA_DIR=<scratch folder> node dist/dev/host-test.js
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { sandboxAvailable } from "../agent/sandbox.ts";
import { signLink } from "../links.ts";
import { createHost, type Host, type HostedApp } from "./host.ts";
import {
  createAppsProxy,
  SANDBOX_POLICY,
  SESSION_COOKIE,
  webappOpenToken,
  webappSession,
} from "./proxy.ts";
import { writeTestApp } from "./test-apps.ts";
import { PERSON_HEADER, type Person, signPerson } from "./sign.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/")) {
  console.error("Run with DATA_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}

const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "run-"));
const PORT_PROXY = 4330;
const PORT_PROXY_IDLE = 4339;
const PORTS: [number, number] = [4331, 4337];

let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const until = async (what: string, fn: () => boolean, ms = 8000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) assert.fail(`Waited ${ms} ms for ${what}`);
    await sleep(50);
  }
};

// ---------------------------------------------------------------------------------------------------------------
// The fixture app: a server in a few lines of node:http, built the way the host runs it.

const FIXTURE = String.raw`import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const port = Number(process.env.PORT);
const data = process.env.DATA_DIR;
if (process.env.APP_URL) console.log('APP_URL=' + process.env.APP_URL);
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o, code = 200, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/health') return json({ ok: true });
  if (u.pathname === '/echo') return json({ method: req.method, url: req.url, headers: req.headers });
  if (u.pathname === '/env') return json(Object.keys(process.env).sort());
  if (u.pathname === '/redirect') { res.writeHead(302, { location: '/echo' }); return res.end(); }
  if (u.pathname === '/setcookie') return json({ ok: true }, 200, { 'set-cookie': ['app_c=1; Path=/', 'wa_session=evil; Path=/', 'dom=1; Domain=localhost; Path=/'] });
  if (u.pathname === '/count') {
    const f = path.join(data, 'counter.txt');
    let n = 0;
    try { n = Number(fs.readFileSync(f, 'utf8')); } catch {}
    fs.writeFileSync(f, String(++n));
    return json({ n, pid: process.pid });
  }
  if (u.pathname === '/read') {
    try { return json({ ok: true, text: fs.readFileSync(u.searchParams.get('file'), 'utf8').slice(0, 200) }); }
    catch (e) { return json({ ok: false, error: e.code || String(e) }); }
  }
  if (u.pathname === '/write') {
    try { fs.writeFileSync(u.searchParams.get('file'), 'x'); return json({ ok: true }); }
    catch (e) { return json({ ok: false, error: e.code || String(e) }); }
  }
  json({ error: 'no such route' }, 404);
});
// One text frame with the handshake's headers, then the connection stays open.
server.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const body = Buffer.from(JSON.stringify({ headers: req.headers, url: req.url }));
  const head = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
  socket.write(Buffer.concat([head, body]));
  socket.on('error', () => {});
});
process.on('SIGTERM', () => process.exit(0));
server.listen(port, process.env.HOST);
`;

// An app built to live under a base path (Vite's `base`, as TanStack Start takes it): it answers only there.
const FIXTURE_BASED = String.raw`import http from 'node:http';
const B = '/__hydor_base__';
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const say = (type, body, h = {}) => { res.writeHead(200, { 'content-type': type, ...h }); res.end(body); };
  if (!u.pathname.startsWith(B)) { res.writeHead(404); return res.end('outside the base'); }
  const p = u.pathname.slice(B.length) || '/';
  if (p === '/api/health') return say('application/json', '{"ok":true}');
  if (p === '/echo') return say('application/json', JSON.stringify({ url: req.url, headers: req.headers }));
  if (p === '/page') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.write('<a href="/__hy');
    return setTimeout(() => { res.write('dor_base__/split">split</a><a href="/__hydor_base__/whole">whole</a>'); res.end('<script>router.update({basepath:"__hydor_base__"});fetch("/__hydor_base__/_serverFn/x")</script>'); }, 40);
  }
  if (p === '/asset.js') return say('text/javascript', 'import("/__hydor_base__/chunk.js")');
  if (p === '/blob') return say('application/octet-stream', '/__hydor_base__ stays');
  if (p === '/redirect') { res.writeHead(302, { location: B + '/page' }); return res.end(); }
  if (p === '/cookie') return say('text/plain', 'ok', { 'set-cookie': 'based=1; Path=/__hydor_base__/' });
  res.writeHead(404); res.end('no such route');
});
server.listen(Number(process.env.PORT), process.env.HOST);
process.on('SIGTERM', () => process.exit(0));
`;

const BROKEN = `console.log('boom marker line'); console.error('boom error line'); process.exit(3);\n`;
const SILENT = `import http from 'node:http'; http.createServer((q, s) => { s.writeHead(500); s.end('no'); }).listen(Number(process.env.PORT), process.env.HOST); console.log('silent app waiting');\n`;

function makeApp(name: string, source: string): string {
  const dir = writeTestApp(path.join(scratch, "apps", name), source);
  fs.writeFileSync(path.join(dir, "app-file.txt"), "inside the app folder");
  return dir;
}

// ---------------------------------------------------------------------------------------------------------------
// A browser: cookies kept for each host, requests sent to the proxy with that Host.

interface Answer {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: () => any;
}

class Browser {
  jar = new Map<string, Map<string, string>>();
  constructor(readonly proxyPort: number) {}
  cookieHeader(host: string): string {
    return [...(this.jar.get(host.replace(/:\d+$/, "")) ?? new Map()).entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  request(
    host: string,
    urlPath: string,
    o: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      follow?: boolean;
      cookies?: boolean;
    } = {},
  ): Promise<Answer> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { host, ...o.headers };
      const c = o.cookies === false ? "" : this.cookieHeader(host);
      if (c) headers.cookie = headers.cookie ? `${c}; ${headers.cookie}` : c;
      if (o.body !== undefined) headers["content-type"] ??= "application/json";
      const req = http.request(
        {
          host: "127.0.0.1",
          port: this.proxyPort,
          method: o.method ?? "GET",
          path: urlPath,
          headers,
          agent: false,
        },
        (res) => {
          const jar =
            this.jar.get(host.replace(/:\d+$/, "")) ??
            new Map<string, string>();
          for (const sc of res.headers["set-cookie"] ?? []) {
            const [pair] = sc.split(";");
            const i = pair.indexOf("=");
            jar.set(pair.slice(0, i), decodeURIComponent(pair.slice(i + 1)));
          }
          this.jar.set(host.replace(/:\d+$/, ""), jar);
          const chunks: Buffer[] = [];
          res.on("data", (b: Buffer) => chunks.push(b));
          res.on("end", async () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const a: Answer = {
              status: res.statusCode ?? 0,
              headers: res.headers,
              text,
              json: () => JSON.parse(text),
            };
            if (
              o.follow !== false &&
              a.status >= 300 &&
              a.status < 400 &&
              typeof res.headers.location === "string"
            )
              return resolve(
                await this.request(host, res.headers.location, {
                  cookies: o.cookies,
                  headers: o.headers?.["x-forwarded-proto"]
                    ? { "x-forwarded-proto": o.headers["x-forwarded-proto"] }
                    : {},
                }),
              );
            resolve(a);
          });
        },
      );
      req.on("error", reject);
      req.end(o.body);
    });
  }
  /** Opens an app from Hydor: its entry link, then the page. */
  open(
    host: string,
    appId: string,
    person: Person,
    to = "/",
    extra: Record<string, string> = {},
  ) {
    return this.request(
      host,
      `/__hydor/open?t=${encodeURIComponent(webappOpenToken(appId, person))}&to=${encodeURIComponent(to)}`,
      { headers: extra },
    );
  }
}

/** The header as an app checks it: base64url(JSON) "." base64url(HMAC-SHA256) with the app's own secret. */
function verifyPerson(
  value: string | undefined,
  secret: string,
): (Person & { exp: number }) | null {
  if (!value) return null;
  const [payload, sig, extra] = value.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const want = crypto.createHmac("sha256", secret).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want))
    return null;
  const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return p.exp > Math.floor(Date.now() / 1000) ? p : null;
}

/** A WebSocket handshake by hand: the status line, the headers, and the first frame the app sends. */
function websocket(
  host: string,
  urlPath: string,
  headers: Record<string, string>,
): Promise<{ status: number; frame?: any }> {
  return new Promise((resolve, reject) => {
    const s = net.connect(PORT_PROXY, "127.0.0.1");
    let buf = Buffer.alloc(0);
    s.on("connect", () => {
      const h = {
        host,
        upgrade: "websocket",
        connection: "Upgrade",
        "sec-websocket-key": crypto.randomBytes(16).toString("base64"),
        "sec-websocket-version": "13",
        ...headers,
      };
      s.write(
        `GET ${urlPath} HTTP/1.1\r\n${Object.entries(h)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n")}\r\n\r\n`,
      );
    });
    const finish = () => {
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      const status = Number(
        /HTTP\/1\.1 (\d+)/.exec(buf.toString("latin1", 0, end))?.[1],
      );
      if (status !== 101) {
        s.destroy();
        return resolve({ status });
      }
      const rest = buf.subarray(end + 4);
      if (rest.length < 2) return;
      let len = rest[1] & 127;
      let off = 2;
      if (len === 126) {
        if (rest.length < 4) return;
        len = rest.readUInt16BE(2);
        off = 4;
      }
      if (rest.length < off + len) return;
      s.destroy();
      resolve({
        status,
        frame: JSON.parse(rest.subarray(off, off + len).toString("utf8")),
      });
    };
    s.on("data", (b) => {
      buf = Buffer.concat([buf, b]);
      finish();
    });
    s.on("close", () =>
      resolve({
        status: Number(
          /HTTP\/1\.1 (\d+)/.exec(buf.toString("latin1"))?.[1] ?? 0,
        ),
      }),
    );
    s.on("error", reject);
    setTimeout(
      () => (s.destroy(), reject(new Error("WebSocket timed out"))),
      8000,
    ).unref();
  });
}

// ---------------------------------------------------------------------------------------------------------------

/** Where a Chromium is, for the check that runs a real page (CHROME, else one Playwright left in the home folder). */
function findChrome(): string {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(process.env.HOME ?? "", ".cache", "ms-playwright");
  try {
    for (const d of fs
      .readdirSync(base)
      .filter((x) => /^chromium-\d+$/.test(x))
      .sort()
      .reverse()) {
      const c = path.join(base, d, "chrome-linux64", "chrome");
      if (fs.existsSync(c)) return c;
    }
  } catch {}
  return "";
}

/** What a page does in a real browser (headless Chromium over its debugging port): whether it hydrates, adds a note, follows a link. */
async function inChrome(
  chrome: string,
  url: string,
): Promise<{
  href: string;
  origin: string;
  h1: string;
  hydrated: boolean;
  afterAdd: string;
  afterLink: string;
  errors: string[];
}> {
  const proc = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--remote-debugging-port=4338",
      `--user-data-dir=${path.join(scratch, "chrome-profile")}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    let targets: any[] = [];
    for (let i = 0; i < 50 && !targets.length; i++) {
      try {
        targets = await (await fetch("http://127.0.0.1:4338/json")).json();
      } catch {
        await sleep(200);
      }
    }
    const ws = new WebSocket(
      targets.find((t) => t.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((r) => (ws.onopen = r));
    let n = 0;
    const waiting = new Map<number, (v: any) => void>();
    const errors: string[] = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      if (d.id && waiting.has(d.id)) waiting.get(d.id)!(d);
      else if (d.method === "Runtime.exceptionThrown")
        errors.push(
          String(
            d.params.exceptionDetails.exception?.description ??
              d.params.exceptionDetails.text,
          ).split("\n")[0],
        );
    };
    const send = (method: string, params: any = {}) =>
      new Promise<any>(
        (r) => (
          waiting.set(++n, r),
          ws.send(JSON.stringify({ id: n, method, params }))
        ),
      );
    const ev = async (expression: string) =>
      (
        await send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        })
      ).result?.result?.value;
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Page.navigate", { url });
    await sleep(3000);
    const out = {
      href: String(await ev("location.href")),
      origin: String(await ev("String(origin)")),
      h1: String(await ev('document.querySelector("h1")?.textContent')),
      hydrated: !!(await ev(
        'Object.keys(document.querySelector("main")||{}).some(k=>k.startsWith("__react"))',
      )),
      afterAdd: String(
        await ev(
          `(async()=>{const i=document.querySelector('input'); const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i),'value').set; set.call(i,'written from the page'); i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('form button').click(); await new Promise(r=>setTimeout(r,1500)); return document.body.innerText})()`,
        ),
      ),
      afterLink: "",
      errors,
    };
    out.afterLink = String(
      await ev(
        `(async()=>{document.querySelector('a').click(); await new Promise(r=>setTimeout(r,1500)); return location.pathname+' | '+document.querySelector('h1')?.textContent})()`,
      ),
    );
    ws.close();
    return out;
  } finally {
    proc.kill("SIGTERM");
  }
}

// ---------------------------------------------------------------------------------------------------------------

const bwrapHere = sandboxAvailable()?.kind === "bwrap";
if (!bwrapHere)
  console.log(
    "skip - bubblewrap is not on this computer: the sandbox checks are skipped",
  );

// A canary: nothing of this may reach an app.
process.env.HYDOR_CANARY_KEY = "canary-value-from-hydor";
process.env.ANTHROPIC_API_KEY = "sk-canary";

const hydorData = path.join(scratch, "hydor-data");
fs.mkdirSync(hydorData);
const host = createHost({
  dataDir: hydorData,
  idleMs: 120_000,
  sandbox: false,
  ports: PORTS,
  startTimeoutMs: 20_000,
});
const hosts: Host[] = [host];

const fixtureDir = makeApp("fixture", FIXTURE);
const apps: HostedApp[] = [
  { id: "fix1", slug: "one", dir: fixtureDir },
  { id: "fix2", slug: "two", dir: fixtureDir },
];
const directory = {
  bySlug: (s: string) => apps.find((a) => a.slug === s),
  byId: (id: string) => apps.find((a) => a.id === id),
};
const proxy = createAppsProxy({ host, apps: directory, port: PORT_PROXY });
const proxies = [proxy];

const basedDir = makeApp("based", FIXTURE_BASED);
apps.push({
  id: "based",
  slug: "based",
  dir: basedDir,
  base: "/__hydor_base__",
});

const alice: Person = {
  id: "u-alice",
  name: "Alice",
  email: "alice@example.com",
  role: "owner",
};
const bob: Person = { id: "u-bob", name: "Bob", role: "member", teamId: "t1" };
const one = apps[0];
const two = apps[1];
const H1 = `one.localhost:${PORT_PROXY}`;
const H2 = `two.localhost:${PORT_PROXY}`;

let failed: unknown = null;
try {
  await proxy.listen();

  // ---- the header --------------------------------------------------------------------------------------------
  await step(
    'signPerson makes base64url(JSON) "." base64url(HMAC-SHA256), with an expiry a minute on',
    () => {
      const v = signPerson(alice, "secret-1");
      assert.match(v, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      const p = verifyPerson(v, "secret-1");
      assert.deepEqual(
        { ...p, exp: 0 },
        {
          id: "u-alice",
          name: "Alice",
          email: "alice@example.com",
          role: "owner",
          exp: 0,
        },
      );
      const now = Math.floor(Date.now() / 1000);
      assert.ok(p!.exp >= now + 55 && p!.exp <= now + 61);
      assert.equal(verifyPerson(v, "secret-2"), null);
      assert.equal(
        verifyPerson(signPerson(alice, "s", -5), "s"),
        null,
        "a past expiry is no one",
      );
      assert.equal(
        JSON.parse(
          Buffer.from(
            signPerson(bob, "s").split(".")[0],
            "base64url",
          ).toString(),
        ).teamId,
        "t1",
      );
    },
  );

  // ---- an app starts on first use ----------------------------------------------------------------------------
  const a = new Browser(PORT_PROXY);
  await step(
    "an app is stopped before anyone uses it, starts on first use and answers",
    async () => {
      assert.equal(host.status("fix1").state, "stopped");
      assert.equal(host.status("fix1").pid, null);
      const r = await a.open(H1, "fix1", alice, "/echo");
      assert.equal(r.status, 200, r.text);
      const s = host.status("fix1");
      assert.equal(s.state, "running");
      assert.ok(s.pid && s.port && s.port >= PORTS[0] && s.port <= PORTS[1]);
      assert.equal(s.restarts, 0);
      assert.equal(s.sandboxed, false);
      assert.ok(s.log.some((l) => l.includes("--- ready")));
    },
  );

  await step(
    "the app is told who is there in a signed header it can verify with its own secret, and Host is localhost:<port>",
    async () => {
      const e = (await a.request(H1, "/echo")).json();
      const secret = host.secret("fix1");
      const p = verifyPerson(e.headers[PERSON_HEADER], secret);
      assert.deepEqual(
        { id: p!.id, name: p!.name, email: p!.email, role: p!.role },
        {
          id: "u-alice",
          name: "Alice",
          email: "alice@example.com",
          role: "owner",
        },
      );
      assert.equal(e.headers.host, `localhost:${host.status("fix1").port}`);
      assert.equal(
        verifyPerson(e.headers[PERSON_HEADER], "another-secret"),
        null,
      );
    },
  );

  await step("a fresh header is signed on every request", async () => {
    const x = (await a.request(H1, "/echo?n=1")).json().headers[PERSON_HEADER];
    await sleep(1100);
    const y = (await a.request(H1, "/echo?n=2")).json().headers[PERSON_HEADER];
    assert.notEqual(x, y);
    assert.ok(verifyPerson(y, host.secret("fix1")));
  });

  await step(
    "the secret is made once, 32 random bytes, kept in a file only its owner reads, and differs by app",
    () => {
      const f = path.join(hydorData, "webapps", "fix1", "secret");
      assert.equal(fs.statSync(f).mode & 0o777, 0o600);
      assert.equal(fs.readFileSync(f, "utf8").trim(), host.secret("fix1"));
      assert.match(host.secret("fix1"), /^[0-9a-f]{64}$/);
      assert.notEqual(host.secret("fix1"), host.secret("fix2"));
      const again = createHost({
        dataDir: hydorData,
        idleMs: 0,
        sandbox: false,
      });
      assert.equal(
        again.secret("fix1"),
        host.secret("fix1"),
        "a second host reads the same secret",
      );
      assert.throws(() => host.secret("../x"), /Not an app id/);
    },
  );

  await step("an app is told the address it is reached at (APP_URL) when the host knows it, and has no such variable when it does not", async () => {
    const h = createHost({
      dataDir: hydorData,
      idleMs: 0,
      sandbox: false,
      ports: [4331, 4337],
      address: (slug) => `http://${slug}.localhost:4339`,
    });
    hosts.push(h);
    await h.ensure({ id: "addr", slug: "addr", dir: fixtureDir });
    assert.ok(h.status("addr").log.includes("APP_URL=http://addr.localhost:4339"), h.status("addr").log.join("|"));
    await h.stop("addr");
    // The host of every other check here is given no address: the app's environment is the eight values (below).
    assert.ok(!host.status("fix1").log.some((l) => l.startsWith("APP_URL=")));
  });

  await step("callers at the same time share one start", async () => {
    const h = createHost({
      dataDir: hydorData,
      idleMs: 0,
      sandbox: false,
      ports: [4331, 4337],
    });
    hosts.push(h);
    const app = { id: "shared", slug: "shared", dir: fixtureDir };
    const ports = await Promise.all([1, 2, 3, 4, 5].map(() => h.ensure(app)));
    assert.equal(new Set(ports).size, 1);
    assert.equal(
      h.status("shared").log.filter((l) => l.startsWith("--- starting")).length,
      1,
    );
    await h.stop("shared");
    assert.equal(h.status("shared").state, "stopped");
  });

  // ---- a browser cannot choose who it is ----------------------------------------------------------------------
  await step(
    "a header the browser sends is taken off: garbage, a well-formed one signed with a wrong secret, an underscore spelling",
    async () => {
      const forged = signPerson(
        { id: "u-root", name: "Root", role: "owner" },
        "not-the-apps-secret",
      );
      for (const headers of [
        { [PERSON_HEADER]: "garbage" } as Record<string, string>,
        { [PERSON_HEADER]: forged },
        { "X-Hydor-Person": forged } as Record<string, string>,
        { x_hydor_person: forged } as Record<string, string>,
      ]) {
        const e = (await a.request(H1, "/echo", { headers })).json();
        const p = verifyPerson(e.headers[PERSON_HEADER], host.secret("fix1"));
        assert.equal(
          p?.id,
          "u-alice",
          `served as ${p?.id} for ${Object.keys(headers)[0]}`,
        );
        assert.ok(!Object.keys(e.headers).includes("x_hydor_person"));
        assert.ok(!JSON.stringify(e.headers).includes("Root"));
      }
    },
  );

  // ---- cookies and the environment ----------------------------------------------------------------------------
  await step(
    "none of Hydor's cookies reaches the app, the app's own do",
    async () => {
      const r = await a.request(H1, "/echo", {
        headers: {
          cookie: "wa_session=hydor-login; ac_preview=pv; app_c=keep; other=1",
        },
      });
      const cookie = r.json().headers.cookie as string;
      assert.ok(
        !/wa_session|ac_preview|hydor-login|wa_app/.test(cookie),
        cookie,
      );
      assert.ok(
        cookie.includes("app_c=keep") && cookie.includes("other=1"),
        cookie,
      );
      // This proxy's own session cookie is in the jar and went with the request, and is not seen either.
      assert.ok(a.cookieHeader(H1).includes(`${SESSION_COOKIE}=`));
      // Without any cookie the app gets none.
      const bare = await a.request(H1, "/echo", { cookies: false });
      assert.equal(bare.status, 403);
    },
  );

  await step(
    "the app's own Set-Cookie comes through (without a Domain), a name of Hydor's does not",
    async () => {
      const r = await a.request(H1, "/setcookie", { follow: false });
      const set = r.headers["set-cookie"] ?? [];
      assert.ok(
        set.some((c) => c.startsWith("app_c=1")),
        set.join(" | "),
      );
      assert.ok(
        set.some((c) => c.startsWith("dom=1") && !/domain/i.test(c)),
        set.join(" | "),
      );
      assert.ok(!set.some((c) => c.startsWith("wa_session")), set.join(" | "));
      const e = (await a.request(H1, "/echo")).json().headers.cookie as string;
      assert.ok(e.includes("app_c=1"), e);
    },
  );

  await step(
    "the address an app is told a request came from is the one that connected, never what the browser wrote (X-Forwarded-For, X-Real-IP)",
    async () => {
      const e = (
        await a.request(H1, "/echo", {
          headers: { "x-forwarded-for": "6.6.6.6, 7.7.7.7", "x-real-ip": "6.6.6.6" },
        })
      ).json();
      assert.equal(e.headers["x-forwarded-for"], "127.0.0.1");
      assert.equal(e.headers["x-real-ip"], undefined);
    },
  );

  await step(
    "the app's environment is its own eight values and nothing of Hydor's (a canary key set here is not there)",
    async () => {
      const names = (await a.request(H1, "/env")).json() as string[];
      assert.ok(
        !names.includes("HYDOR_CANARY_KEY") &&
          !names.includes("ANTHROPIC_API_KEY"),
        names.join(","),
      );
      assert.deepEqual(names, [
        "APP_SECRET",
        "DATA_DIR",
        "HOME",
        "HOST",
        "HYDOR_APP_PROCESS",
        "NODE_ENV",
        "NODE_OPTIONS",
        "PATH",
        "PORT",
        "PWD",
      ]);
      assert.ok(process.env.HYDOR_CANARY_KEY, "the canary is set here");
    },
  );

  // ---- sessions that are not ----------------------------------------------------------------------------------
  await step(
    "no session, a tampered session, an expired one and a used entry link each give 403",
    async () => {
      const none = new Browser(PORT_PROXY);
      const r0 = await none.request(H1, "/echo");
      assert.equal(r0.status, 403);
      assert.equal(r0.text, "Open this app from Hydor.");
      assert.match(String(r0.headers["content-type"]), /text\/plain/);
      const good = webappSession("fix1", alice);
      const bad = `${good.slice(0, -4)}${good.endsWith("AAAA") ? "BBBB" : "AAAA"}`;
      assert.equal(
        (
          await none.request(H1, "/echo", {
            headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(bad)}` },
          })
        ).status,
        403,
        "tampered signature",
      );
      const body = good.split(".")[0];
      const swapped = Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(body, "base64url").toString()),
          p: { id: "u-root", name: "Root", role: "owner" },
        }),
      ).toString("base64url");
      assert.equal(
        (
          await none.request(H1, "/echo", {
            headers: {
              cookie: `${SESSION_COOKIE}=${swapped}.${good.split(".")[1]}`,
            },
          })
        ).status,
        403,
        "tampered body",
      );
      const old = webappSession("fix1", alice, -1000);
      assert.equal(
        (
          await none.request(H1, "/echo", {
            headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(old)}` },
          })
        ).status,
        403,
        "expired session",
      );
      assert.equal(
        (
          await none.request(H1, "/echo", {
            headers: {
              cookie: `${SESSION_COOKIE}=${encodeURIComponent(good)}`,
            },
          })
        ).status,
        200,
        "the genuine one works",
      );
      // An entry link: once.
      const link = `/__hydor/open?t=${encodeURIComponent(webappOpenToken("fix1", bob))}&to=/echo`;
      assert.equal((await none.request(H1, link)).status, 200);
      const replay = new Browser(PORT_PROXY);
      assert.equal(
        (await replay.request(H1, link)).status,
        403,
        "a used entry link",
      );
      assert.equal(
        (
          await replay.request(
            H1,
            `/__hydor/open?t=${encodeURIComponent(webappOpenToken("fix1", bob, -1000))}`,
          )
        ).status,
        403,
        "an expired entry link",
      );
      assert.equal(
        (
          await replay.request(
            H1,
            `/__hydor/open?t=${encodeURIComponent(webappSession("fix1", bob))}`,
          )
        ).status,
        403,
        "a session is no entry link",
      );
      assert.equal(
        (
          await replay.request(
            H1,
            `/__hydor/open?t=${encodeURIComponent(signLink({ k: "preview-open", port: 4321 }, 60_000))}`,
          )
        ).status,
        403,
        "a Preview link is no entry link",
      );
      assert.equal(
        (
          await replay.request(
            H2,
            `/__hydor/open?t=${encodeURIComponent(webappOpenToken("fix1", bob))}`,
          )
        ).status,
        403,
        "one app's link does not open another's hostname",
      );
    },
  );

  // ---- two apps in one cookie jar -----------------------------------------------------------------------------
  await step(
    "two apps on two hostnames in one cookie jar stay apart",
    async () => {
      const b = new Browser(PORT_PROXY);
      assert.equal((await b.open(H1, "fix1", alice, "/echo")).status, 200);
      assert.equal((await b.open(H2, "fix2", bob, "/echo")).status, 200);
      const e1 = (await b.request(H1, "/echo")).json().headers;
      const e2 = (await b.request(H2, "/echo")).json().headers;
      assert.equal(
        verifyPerson(e1[PERSON_HEADER], host.secret("fix1"))?.id,
        "u-alice",
      );
      assert.equal(
        verifyPerson(e2[PERSON_HEADER], host.secret("fix2"))?.id,
        "u-bob",
      );
      assert.equal(
        verifyPerson(e1[PERSON_HEADER], host.secret("fix2")),
        null,
        "one app's header means nothing to the other",
      );
      assert.notEqual(host.status("fix1").pid, host.status("fix2").pid);
      // Each host's own cookie only.
      assert.ok(
        b.jar.get("one.localhost")?.get(SESSION_COOKIE) &&
          b.jar.get("two.localhost")?.get(SESSION_COOKIE),
      );
      assert.notEqual(
        b.jar.get("one.localhost")!.get(SESSION_COOKIE),
        b.jar.get("two.localhost")!.get(SESSION_COOKIE),
      );
      // The session of one sent to the other host is no way in.
      const stolen = b.jar.get("one.localhost")!.get(SESSION_COOKIE)!;
      assert.equal(
        (
          await new Browser(PORT_PROXY).request(H2, "/echo", {
            headers: {
              cookie: `${SESSION_COOKIE}=${encodeURIComponent(stolen)}`,
            },
          })
        ).status,
        403,
      );
      // The data of each is its own.
      assert.equal((await b.request(H1, "/count")).json().n, 1);
      assert.equal((await b.request(H2, "/count")).json().n, 1);
      assert.equal((await b.request(H1, "/count")).json().n, 2);
      assert.ok(
        fs.existsSync(
          path.join(hydorData, "webapps", "fix1", "data", "counter.txt"),
        ),
      );
    },
  );

  await step(
    "the cookie is HttpOnly, SameSite=Lax, for the host only, and Secure when the request came over https",
    async () => {
      const plain = await new Browser(PORT_PROXY).request(
        H1,
        `/__hydor/open?t=${encodeURIComponent(webappOpenToken("fix1", alice))}`,
        { follow: false },
      );
      const c = String(plain.headers["set-cookie"]);
      assert.ok(
        /HttpOnly/.test(c) &&
          /SameSite=Lax/.test(c) &&
          /Max-Age=43200/.test(c) &&
          !/Secure/.test(c) &&
          !/Domain/i.test(c) &&
          /Path=\//.test(c),
        c,
      );
      const s = await new Browser(PORT_PROXY).request(
        H1,
        `/__hydor/open?t=${encodeURIComponent(webappOpenToken("fix1", alice))}`,
        { follow: false, headers: { "x-forwarded-proto": "https" } },
      );
      assert.ok(/; Secure/.test(String(s.headers["set-cookie"])));
      assert.equal(plain.headers.location, "/");
      const out = await new Browser(PORT_PROXY).request(
        H1,
        `/__hydor/open?t=${encodeURIComponent(webappOpenToken("fix1", alice))}&to=${encodeURIComponent("//evil.example/x")}`,
        { follow: false },
      );
      assert.equal(
        out.headers.location,
        "/",
        "an entry link cannot send the browser to another site",
      );
    },
  );

  // ---- a port of its own is no way in ----------------------------------------------------------------------------
  await step(
    "a port of its own is no way in: the plain host has no app, with a link, a session cookie or none",
    async () => {
      const b = new Browser(PORT_PROXY);
      for (const P of [`localhost:${PORT_PROXY}`, `127.0.0.1:${PORT_PROXY}`]) {
        assert.equal((await b.request(P, "/echo")).status, 403);
        const linked = await b.open(P, "fix1", alice, "/echo");
        assert.equal(linked.status, 403, "an entry link opens only a hostname of its own");
        assert.equal(
          (await b.request(P, "/echo")).status,
          403,
          "and sets no session on the plain host",
        );
        // A session cookie from a hostname, sent to the plain host, is no key there either.
        const cookie = `${SESSION_COOKIE}=${encodeURIComponent(webappSession("fix1", alice))}`;
        assert.equal(
          (await b.request(P, "/echo", { cookies: false, headers: { cookie } }))
            .status,
          403,
        );
      }
      // A hostname that is not the app's own: its link opens nothing there.
      assert.equal(
        (await b.open(`two.localhost:${PORT_PROXY}`, "fix1", alice, "/echo"))
          .status,
        403,
      );
    },
  );

  // ---- a path with a token ------------------------------------------------------------------------------------
  await step(
    "the path way: the sandbox policy on every response, no Set-Cookie, the address kept under the prefix",
    async () => {
      const b = new Browser(PORT_PROXY);
      const P = `localhost:${PORT_PROXY}`;
      const t = webappSession("fix1", alice);
      const r = await b.request(P, `/w/${t}/setcookie`, {
        follow: false,
        cookies: false,
      });
      assert.equal(r.status, 200);
      assert.equal(r.headers["content-security-policy"], SANDBOX_POLICY);
      assert.equal(
        r.headers["set-cookie"],
        undefined,
        String(r.headers["set-cookie"]),
      );
      assert.ok(
        /sandbox/.test(SANDBOX_POLICY) &&
          !/allow-same-origin/.test(SANDBOX_POLICY),
      );
      const e = await b.request(P, `/w/${t}/echo?x=1`, {
        follow: false,
        cookies: false,
        headers: {
          [PERSON_HEADER]: "garbage",
          cookie: "wa_session=h; app_c=1",
        },
      });
      assert.equal(e.headers["content-security-policy"], SANDBOX_POLICY);
      const j = e.json();
      assert.equal(j.url, "/echo?x=1", "the app sees its own path");
      assert.equal(
        verifyPerson(j.headers[PERSON_HEADER], host.secret("fix1"))?.id,
        "u-alice",
      );
      assert.equal(j.headers.cookie, "app_c=1");
      assert.equal(j.headers["x-forwarded-prefix"], `/w/${t}`);
      const redirected = await b.request(P, `/w/${t}/redirect`, {
        follow: false,
        cookies: false,
      });
      assert.equal(redirected.headers.location, `/w/${t}/echo`);
      assert.equal(
        (await b.request(P, `/w/${t}`, { follow: false, cookies: false }))
          .headers.location,
        `/w/${t}/`,
      );
      assert.equal(
        (await b.request(P, `/w/${t}x/echo`, { follow: false, cookies: false }))
          .status,
        403,
        "a changed token",
      );
      assert.equal(
        (
          await b.request(P, `/w/${webappSession("fix1", alice, -1)}/echo`, {
            cookies: false,
          })
        ).status,
        403,
        "an expired token",
      );
      assert.equal(
        (
          await b.request(P, `/w/${webappOpenToken("fix1", alice)}/echo`, {
            cookies: false,
          })
        ).status,
        403,
        "an entry link is no session",
      );
    },
  );

  // ---- an app built for a base path ------------------------------------------------------------------------------
  await step(
    "an app built for a base path: asked at its base, its own addresses put where the page really is (hostname, port and path), also split between chunks",
    async () => {
      const b = new Browser(PORT_PROXY);
      const HB = `based.localhost:${PORT_PROXY}`;
      const r = await b.open(HB, "based", alice, "/page");
      assert.equal(r.status, 200, r.text);
      assert.equal(
        host.status("based").state,
        "running",
        "its health was asked for under its base",
      );
      assert.equal(
        r.text,
        '<a href="/split">split</a><a href="/whole">whole</a><script>router.update({basepath:""});fetch("/_serverFn/x")</script>',
      );
      assert.equal(
        (await b.request(HB, "/asset.js")).text,
        'import("/chunk.js")',
      );
      assert.equal(
        (await b.request(HB, "/blob")).text,
        "/__hydor_base__ stays",
        "what is not text is left alone",
      );
      const redirect = await b.request(HB, "/redirect", { follow: false });
      assert.equal(redirect.headers.location, "/page");
      assert.equal(redirect.headers["content-length"], undefined);
      assert.equal(
        String((await b.request(HB, "/cookie")).headers["set-cookie"]),
        "based=1; Path=/",
      );
      // The app answers only under its base (anything else is its 404), so it was asked there; its echo of the address comes back as the browser has it.
      assert.equal((await b.request(HB, "/echo?x=1")).json().url, "/echo?x=1");
      // The same on the path way: the token's address is where the base was.
      const t = webappSession("based", alice);
      const P = `localhost:${PORT_PROXY}`;
      const p = await b.request(P, `/w/${t}/page`, { cookies: false });
      assert.equal(
        p.text,
        `<a href="/w/${t}/split">split</a><a href="/w/${t}/whole">whole</a><script>router.update({basepath:"w/${t}"});fetch("/w/${t}/_serverFn/x")</script>`,
      );
      assert.equal(p.headers["content-security-policy"], SANDBOX_POLICY);
      assert.equal(
        (
          await b.request(P, `/w/${t}/redirect`, {
            follow: false,
            cookies: false,
          })
        ).headers.location,
        `/w/${t}/page`,
      );
      assert.equal(
        (await b.request(P, `/w/${t}/asset.js`, { cookies: false })).text,
        `import("/w/${t}/chunk.js")`,
      );
      // A hostname of its own: the same, with nothing of the path.
      assert.equal(
        (await b.open(HB, "based", alice, "/page")).text,
        '<a href="/split">split</a><a href="/whole">whole</a><script>router.update({basepath:""});fetch("/_serverFn/x")</script>',
      );
    },
  );

  await step(
    "the path way lets a page with no origin through: CORS for its requests and a preflight, and Sec-Fetch-Site said same-origin to the app",
    async () => {
      const t = webappSession("fix1", alice);
      const P = `localhost:${PORT_PROXY}`;
      const b = new Browser(PORT_PROXY);
      const pre = await b.request(P, `/w/${t}/echo`, {
        method: "OPTIONS",
        cookies: false,
        follow: false,
        headers: {
          origin: "null",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,x-tsr-serverfn",
        },
      });
      assert.equal(pre.status, 204);
      assert.equal(pre.headers["access-control-allow-origin"], "*");
      assert.equal(
        pre.headers["access-control-allow-headers"],
        "content-type,x-tsr-serverfn",
      );
      assert.equal(pre.headers["access-control-allow-methods"], "POST");
      const bad = await b.request(P, `/w/${t}x/echo`, {
        method: "OPTIONS",
        cookies: false,
        follow: false,
        headers: { origin: "null", "access-control-request-method": "POST" },
      });
      assert.equal(
        bad.status,
        403,
        "no preflight for a token that is no token",
      );
      const e = await b.request(P, `/w/${t}/echo`, {
        cookies: false,
        headers: { origin: "null", "sec-fetch-site": "cross-site" },
      });
      assert.equal(e.headers["access-control-allow-origin"], "*");
      assert.equal(e.json().headers["sec-fetch-site"], "same-origin");
      assert.equal(
        e.json().headers.origin,
        `http://localhost:${host.status("fix1").port}`,
      );
      // On a hostname the browser's own words are the app's to judge.
      await b.open(H1, "fix1", alice);
      const h = await b.request(H1, "/echo", {
        headers: { "sec-fetch-site": "cross-site" },
      });
      assert.equal(h.json().headers["sec-fetch-site"], "cross-site");
      assert.equal(h.headers["access-control-allow-origin"], undefined);
    },
  );

  await step(
    "an app is told a request came from its own page only when it did: another site's Origin and Referer reach it as the browser said them, and none is made up",
    async () => {
      const P = `localhost:${PORT_PROXY}`;
      const b = new Browser(PORT_PROXY);
      await b.open(H1, "fix1", alice);
      const app = `http://localhost:${host.status("fix1").port}`;
      const seen = async (headers: Record<string, string>) => (await b.request(H1, "/echo", { headers })).json().headers as Record<string, string | undefined>;
      // Its own hostname's page: renamed to what the app sees itself as.
      const own = await seen({ origin: `http://${H1}`, referer: `http://${H1}/orders?x=1` });
      assert.deepEqual([own.origin, own.referer], [app, `${app}/orders?x=1`]);
      // Another site, another app's hostname, a page with an origin of no one: as they were said.
      for (const origin of ["https://evil.example", "http://other.localhost:" + PORT_PROXY, `http://${H1.split(":")[0]}:1`, "null"]) {
        const h = await seen({ origin, referer: `${origin === "null" ? "https://evil.example" : origin}/page`, "sec-fetch-site": "cross-site" });
        assert.equal(h.origin, origin);
        assert.equal(h.referer, `${origin === "null" ? "https://evil.example" : origin}/page`);
        assert.equal(h["sec-fetch-site"], "cross-site");
      }
      // No Origin and no Referer: none is made.
      const bare = await seen({});
      assert.deepEqual([bare.origin, bare.referer], [undefined, undefined]);
      // The path way: its own sandboxed page says "null"; another site that had the address is not renamed.
      const t = webappSession("fix1", alice);
      const anon = new Browser(PORT_PROXY);
      const path_ = async (method: string, headers: Record<string, string>) => (await anon.request(P, `/w/${t}/echo`, { method, cookies: false, headers })).json().headers as Record<string, string | undefined>;
      const evil = await path_("POST", { origin: "https://evil.example", "sec-fetch-site": "cross-site", referer: "https://evil.example/x" });
      assert.deepEqual([evil.origin, evil["sec-fetch-site"], evil.referer], ["https://evil.example", "cross-site", "https://evil.example/x"]);
      const itself = await path_("POST", { origin: "null", "sec-fetch-site": "cross-site", referer: `http://${P}/w/${t}/list` });
      assert.deepEqual([itself.origin, itself["sec-fetch-site"], itself.referer], [app, "same-origin", `${app}/list`]);
      const noOrigin = await path_("POST", { "sec-fetch-site": "cross-site" });
      assert.deepEqual([noOrigin.origin, noOrigin["sec-fetch-site"]], [undefined, "cross-site"], "a change with no Origin is not called the app's own");
      assert.equal((await path_("GET", { "sec-fetch-site": "cross-site" }))["sec-fetch-site"], "same-origin", "a plain read, as its sandboxed page's links send");
    },
  );

  // ---- WebSockets ---------------------------------------------------------------------------------------------
  await step(
    "WebSocket upgrades follow the same rules: no session 403, the person signed fresh, a forged header and Hydor cookies taken off",
    async () => {
      const none = await websocket(H1, "/ws", {});
      assert.equal(none.status, 403);
      const b = new Browser(PORT_PROXY);
      await b.open(H1, "fix1", alice);
      const forged = signPerson(
        { id: "u-root", name: "Root", role: "owner" },
        "wrong",
      );
      const ws = await websocket(H1, "/ws", {
        cookie: `${b.cookieHeader(H1)}; wa_session=h; app_c=1`,
        [PERSON_HEADER]: forged,
        origin: `http://${H1}`,
      });
      assert.equal(ws.status, 101);
      assert.equal(
        verifyPerson(ws.frame.headers[PERSON_HEADER], host.secret("fix1"))?.id,
        "u-alice",
      );
      assert.equal(ws.frame.headers.cookie, "app_c=1");
      assert.equal(
        ws.frame.headers.origin,
        `http://localhost:${host.status("fix1").port}`,
      );
      const t = webappSession("fix1", bob);
      const viaPath = await websocket(
        `localhost:${PORT_PROXY}`,
        `/w/${t}/ws?a=1`,
        { [PERSON_HEADER]: forged },
      );
      assert.equal(viaPath.status, 101);
      assert.equal(viaPath.frame.url, "/ws?a=1");
      assert.equal(
        verifyPerson(viaPath.frame.headers[PERSON_HEADER], host.secret("fix1"))
          ?.id,
        "u-bob",
      );
      assert.equal(
        (await websocket(`localhost:${PORT_PROXY}`, `/w/${t}x/ws`, {})).status,
        403,
      );
    },
  );

  // ---- falls and starts ---------------------------------------------------------------------------------------
  await step(
    "a killed app (SIGKILL to its pid) comes back on the next request and status counts the restart",
    async () => {
      const b = new Browser(PORT_PROXY);
      await b.open(H1, "fix1", alice);
      const before = host.status("fix1");
      assert.equal(before.restarts, 0);
      const n = (await b.request(H1, "/count")).json().n;
      process.kill(before.pid!, "SIGKILL");
      await until(
        "the fall to be seen",
        () => host.status("fix1").state === "crashed",
      );
      assert.match(host.status("fix1").lastExit ?? "", /SIGKILL/);
      const r = await b.request(H1, "/count");
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json().n, n + 1, "its data is as it was");
      const after = host.status("fix1");
      assert.equal(after.state, "running");
      assert.equal(after.restarts, 1);
      assert.notEqual(after.pid, before.pid);
    },
  );

  await step(
    "after a second fall in a row the next start waits a second",
    async () => {
      const b = new Browser(PORT_PROXY);
      await b.open(H1, "fix1", alice);
      process.kill(host.status("fix1").pid!, "SIGKILL");
      await until("the fall", () => host.status("fix1").state === "crashed");
      const t = Date.now();
      assert.equal((await b.request(H1, "/echo")).status, 200);
      const took = Date.now() - t;
      assert.ok(took >= 900, `the restart came after ${took} ms`);
      assert.equal(host.status("fix1").restarts, 2);
    },
  );

  await step(
    "an app that cannot start fails with a plain error holding its log, and one that never answers is stopped",
    async () => {
      const h = createHost({
        dataDir: hydorData,
        idleMs: 0,
        sandbox: false,
        ports: PORTS,
        startTimeoutMs: 1500,
      });
      hosts.push(h);
      await assert.rejects(
        h.ensure({
          id: "broken",
          slug: "broken",
          dir: makeApp("broken", BROKEN),
        }),
        (e: Error) =>
          /did not start/.test(e.message) &&
          /boom marker line/.test(e.message) &&
          /boom error line/.test(e.message) &&
          /code 3/.test(e.message),
      );
      assert.equal(h.status("broken").state, "crashed");
      assert.ok(
        h.status("broken").log.some((l) => l.includes("boom marker line")),
      );
      const t = Date.now();
      await assert.rejects(
        h.ensure({
          id: "silent",
          slug: "silent",
          dir: makeApp("silent", SILENT),
        }),
        (e: Error) =>
          /silent app waiting/.test(e.message) &&
          // It is up but its ready address answers no page: said as such, not as one that does not answer.
          /\/api\/health answered 500 for 2 s, not a 2xx or 3xx/.test(e.message),
      );
      assert.ok(Date.now() - t < 6000);
      const s = h.status("silent");
      assert.equal(s.state, "crashed");
      assert.equal(
        s.pid,
        null,
        "the app that never answered is not left running",
      );
      await assert.rejects(
        h.ensure({
          id: "unbuilt",
          slug: "unbuilt",
          dir: path.join(scratch, "nothing-here"),
        }),
        /not there any more/,
      );
    },
  );

  // ---- idle -----------------------------------------------------------------------------------------------------
  await step(
    "an idle app is stopped (1.5 s), a use keeps it, and it comes back on the next request with its data intact",
    async () => {
      const idleHost = createHost({
        dataDir: hydorData,
        idleMs: 1500,
        sandbox: false,
        ports: PORTS,
      });
      hosts.push(idleHost);
      const idleProxy = createAppsProxy({
        host: idleHost,
        apps: directory,
        port: PORT_PROXY_IDLE,
      });
      proxies.push(idleProxy);
      await idleProxy.listen();
      const b = new Browser(PORT_PROXY_IDLE);
      const HI = `one.localhost:${PORT_PROXY_IDLE}`;
      assert.equal((await b.open(HI, "fix1", alice, "/count")).status, 200);
      const n = (await b.request(HI, "/count")).json().n;
      const pid = idleHost.status("fix1").pid!;
      // Used every half second: it stays.
      for (let i = 0; i < 6; i++) {
        await sleep(500);
        assert.equal((await b.request(HI, "/echo")).status, 200);
      }
      assert.equal(
        idleHost.status("fix1").pid,
        pid,
        "an app in use is not stopped",
      );
      await until(
        "the app to be stopped",
        () => idleHost.status("fix1").state === "stopped",
        6000,
      );
      assert.throws(() => process.kill(pid, 0), "its process is gone");
      assert.equal(idleHost.status("fix1").pid, null);
      const back = await b.request(HI, "/count");
      assert.equal(back.status, 200);
      assert.equal(back.json().n, n + 1, "its data is as it was");
      assert.equal(
        idleHost.status("fix1").restarts,
        0,
        "stopping for being idle is no fall",
      );
      assert.notEqual(idleHost.status("fix1").pid, pid);
      // An open socket is a use too.
      const sock = net.connect(PORT_PROXY_IDLE, "127.0.0.1");
      await new Promise<void>((r) => sock.on("connect", () => r()));
      sock.write(
        `GET /ws HTTP/1.1\r\nhost: ${HI}\r\nupgrade: websocket\r\nconnection: Upgrade\r\nsec-websocket-key: ${crypto.randomBytes(16).toString("base64")}\r\nsec-websocket-version: 13\r\ncookie: ${b.cookieHeader(HI)}\r\n\r\n`,
      );
      await sleep(3500);
      assert.equal(
        idleHost.status("fix1").state,
        "running",
        "an open socket keeps the app",
      );
      sock.destroy();
      await until(
        "the app to be stopped once the socket closed",
        () => idleHost.status("fix1").state === "stopped",
        8000,
      );
      await idleProxy.close();
    },
  );

  // ---- the sandbox ----------------------------------------------------------------------------------------------
  const canary = path.join(scratch, "canary.txt");
  fs.writeFileSync(canary, "the canary: not for apps");
  await step(
    "without a sandbox the fixture can read a file outside its folders (so the next check means something)",
    async () => {
      const b = new Browser(PORT_PROXY);
      await b.open(H1, "fix1", alice);
      const r = (
        await b.request(H1, `/read?file=${encodeURIComponent(canary)}`)
      ).json();
      assert.equal(r.ok, true);
      assert.equal(host.status("fix1").sandboxed, false);
    },
  );

  if (bwrapHere) {
    const sbHost = createHost({
      dataDir: hydorData,
      idleMs: 0,
      sandbox: true,
      ports: PORTS,
    });
    hosts.push(sbHost);
    const sbApps: HostedApp[] = [{ id: "sb1", slug: "sbone", dir: fixtureDir }];
    const sbDirectory = {
      bySlug: (s: string) => sbApps.find((x) => x.slug === s),
      byId: (id: string) => sbApps.find((x) => x.id === id),
    };
    const sbProxy = createAppsProxy({
      host: sbHost,
      apps: sbDirectory,
      port: 4339,
    });
    proxies.push(sbProxy);
    await sbProxy.listen();
    const sb = new Browser(4339);
    const HB = "sbone.localhost:4339";
    await step(
      "sandboxed (bubblewrap): the app serves, is told who is there, and cannot read a canary outside its folders",
      async () => {
        assert.equal((await sb.open(HB, "sb1", alice, "/echo")).status, 200);
        const s = sbHost.status("sb1");
        assert.equal(s.state, "running");
        assert.equal(s.sandboxed, true);
        assert.equal(s.sandboxNote, null);
        assert.equal(
          verifyPerson(
            (await sb.request(HB, "/echo")).json().headers[PERSON_HEADER],
            sbHost.secret("sb1"),
          )?.id,
          "u-alice",
        );
        const read = async (f: string) =>
          (await sb.request(HB, `/read?file=${encodeURIComponent(f)}`)).json();
        assert.deepEqual(
          await read(canary),
          { ok: false, error: "ENOENT" },
          "a file in the test folder is not there",
        );
        assert.equal(
          (await read(path.join(fixtureDir, "app-file.txt"))).ok,
          true,
          "its own folder is",
        );
        assert.equal(
          (await read(path.join(hydorData, "webapps", "sb1", "secret"))).ok,
          false,
          "Hydor's copy of its secret is not",
        );
        assert.equal((await read("/home")).ok, false);
        assert.equal(
          (await read("/etc/hostname")).ok,
          true,
          "the system is there to read",
        );
      },
    );
    await step(
      "sandboxed: only its data folder is writable, /tmp is its own, the environment is the same values (bubblewrap adds PWD)",
      async () => {
        const w = async (f: string) =>
          (await sb.request(HB, `/write?file=${encodeURIComponent(f)}`)).json();
        assert.equal(
          (await w(path.join(hydorData, "webapps", "sb1", "data", "x.txt"))).ok,
          true,
        );
        assert.ok(
          fs.existsSync(
            path.join(hydorData, "webapps", "sb1", "data", "x.txt"),
          ),
          "what it writes there is seen from outside",
        );
        assert.equal(
          (await w(path.join(fixtureDir, "new.txt"))).ok,
          false,
          "its own folder is read-only",
        );
        assert.equal((await w("/usr/new.txt")).error, "EROFS");
        assert.equal((await w("/etc/new.txt")).ok, false);
        assert.equal((await w("/tmp/inside.txt")).ok, true);
        assert.ok(
          !fs.existsSync("/tmp/inside.txt"),
          "its /tmp is not this computer's",
        );
        assert.equal((await sb.request(HB, "/count")).json().n, 1);
        const names = (await sb.request(HB, "/env")).json() as string[];
        assert.deepEqual(names, [
          "APP_SECRET",
          "DATA_DIR",
          "HOME",
          "HOST",
          "HYDOR_APP_PROCESS",
          "NODE_ENV",
          "NODE_OPTIONS",
          "PATH",
          "PORT",
          "PWD",
        ]);
      },
    );
    await step(
      "sandboxed: a killed app comes back, and stopping it ends everything inside",
      async () => {
        const pid = sbHost.status("sb1").pid!;
        process.kill(pid, "SIGKILL");
        await until("the fall", () => sbHost.status("sb1").state === "crashed");
        assert.equal((await sb.request(HB, "/count")).json().n, 2);
        assert.equal(sbHost.status("sb1").restarts, 1);
        const port = sbHost.status("sb1").port!;
        await sbHost.stop("sb1");
        assert.equal(sbHost.status("sb1").state, "stopped");
        const listening = () =>
          new Promise<boolean>((res) =>
            net
              .connect(port, "127.0.0.1")
              .on("connect", function (this: net.Socket) {
                this.destroy();
                res(true);
              })
              .on("error", () => res(false)),
          );
        assert.equal(
          await listening(),
          false,
          "nothing of it is left listening",
        );
      },
    );
    await sbProxy.close();
  }

  await step("without bubblewrap (or with sandbox off) status says so", () => {
    assert.equal(host.status("fix1").sandboxed, false);
    assert.equal(host.status("fix1").sandboxNote, null);
    // Asked for where there is none: the note says why (shown here only where bwrap is missing).
    if (!bwrapHere)
      assert.match(
        createHost({ dataDir: hydorData, idleMs: 0, sandbox: true }).status("x")
          .sandboxNote ?? "",
        /bubblewrap/,
      );
  });
} catch (e) {
  failed = e;
  console.error(e);
} finally {
  for (const p of proxies) await p.close().catch(() => {});
  for (const h of hosts) await h.close().catch(() => {});
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (failed) {
  console.error(`\nFAILED after ${passed} checks`);
  process.exit(1);
}
console.log(`\n${passed} checks passed`);
process.exit(0);
