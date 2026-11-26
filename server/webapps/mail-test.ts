// Checks for what Hydor makes of a web app's mail (mail.ts, the route POST /api/apps/:slug/mail and what the app is started with), with the host's own fixtures: small apps made of a hydor.json and
// a server that says what its environment gives it. Who may ask, the answers of the route (200 sent and queued, the Idempotency-Key, 400, 401, 403, 413, 429
// with its limit and when it lifts, 501, 503), the owner's say on the card (not decided, allowed, off, another account), the limits, every person sent to alone, header injection field by field,
// what the records and the app's JSON show, that app_api cannot send and asks before allowing, and that nothing of an address or a word of a mail is in the database or a log.
// The two sides: the process Hydor starts as the launched version has a marked key and sends once allowed; every other call counts as the app being made, whose mail is kept (501) unless the owner
// switched on sending while it is being made; each combination, and that the two share no Idempotency-Key and no count.
// STAND-IN: the mail server. The connected accounts are real ones of Hydor's (server/mail/accounts.ts, the password sealed in the vault) whose SMTP server is a small one this test starts on this
// computer, scripted by each test, so the sending itself is Hydor's own path (server/mail/send.ts, nodemailer). No mail leaves this machine; no address is real (.test and example.com).
// Ports 4780 (Hydor), 4781 (the mail server), 4782 to 4789 (apps).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/mail-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> HYDOR_APPS_DIR=<scratch folder> node dist/dev/mail-test.js
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { Writable } from "node:stream";
import { format } from "node:util";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { ApprovalRequest } from "../../shared/types.ts";
import type { WebApp } from "../../shared/webapps.ts";
import { apps as appsFeature } from "../apps/index.ts";
import { startRuns } from "../apps/runs.ts";
import { HttpError } from "../auth.ts";
import { appTables } from "../connections/apps.ts";
import { useMaskDb, vaultTables } from "../connections/vault.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps, RunCtx } from "../features/types.ts";
import { appApi, ruleFor } from "../guide/api.ts";
import { mailTables, removeAccount, saveAccount } from "../mail/accounts.ts";
import { initPages } from "../pages/store.ts";
import { embedKey } from "./embed.ts";
import { createWebapps } from "./index.ts";
import { releaseDir } from "./hydor-launch.ts";
import { getWebApp } from "./store.ts";
import { saveLaunch, setLive } from "./launch-store.ts";
import { forgetMailLimits, mailView, MAIL_LIMITS, stopMail, usesMail } from "./mail.ts";
import { writeTestApp } from "./test-apps.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/") || !process.env.HYDOR_APPS_DIR?.startsWith("/tmp/") || !process.env.HOME?.startsWith("/tmp/")) {
  console.error("Run with HOME=/tmp/…, DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}
const HYDOR_PORT = 4780;
const SMTP_PORT = 4781;
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "mail-"));
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const until = async (what: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!what() && Date.now() < end) await sleep(10);
  assert.ok(what(), "what was waited for did not happen");
};

// Everything written to the console is kept too, for the last test.
const logged: string[] = [];
for (const level of ["log", "warn", "error", "info", "debug"] as const) {
  const was = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    logged.push(format(...args));
    was(...args);
  };
}

// ---- the stand-in mail server -------------------------------------------------------------------------------------------------------

interface Got {
  user: string;
  from: string;
  to: string[];
  data: string;
}
const got: Got[] = [];
/** What the server says at a step, when a test wants it to say no: a reply line, or undefined for yes. */
let script: (step: "AUTH" | "MAIL" | "RCPT" | "DATA", about: string) => string | undefined = () => undefined;
let dataDelayMs = 0;
const PASSWORD = "stand-in-app-password";
const sockets = new Set<net.Socket>();
const smtp = net.createServer((socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => {});
  let buf = "";
  let user = "";
  let from = "";
  let to: string[] = [];
  let data: string[] | null = null;
  let login: "user" | "pass" | null = null;
  const say = (line: string) => !socket.destroyed && socket.write(`${line}\r\n`);
  const auth = (u: string, p: string) => {
    user = u;
    const no = script("AUTH", u) ?? (p === PASSWORD ? undefined : "535 5.7.8 Username and Password not accepted");
    say(no ?? "235 2.7.0 Accepted");
  };
  say("220 stand-in ESMTP");
  socket.on("data", async (chunk) => {
    buf += chunk.toString("utf8");
    let at: number;
    while ((at = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, at);
      buf = buf.slice(at + 2);
      if (data) {
        if (line !== ".") {
          data.push(line.startsWith(".") ? line.slice(1) : line);
          continue;
        }
        const message = { user, from, to, data: data.join("\r\n") };
        data = null;
        if (dataDelayMs) await sleep(dataDelayMs);
        const no = script("DATA", message.to[0]);
        if (!no) got.push(message);
        say(no ?? "250 2.0.0 Ok: queued");
        continue;
      }
      if (login === "user") {
        user = Buffer.from(line, "base64").toString();
        login = "pass";
        say("334 UGFzc3dvcmQ6");
      } else if (login === "pass") {
        login = null;
        auth(user, Buffer.from(line, "base64").toString());
      } else if (/^(EHLO|HELO)/i.test(line)) say("250-stand-in\r\n250 AUTH PLAIN LOGIN");
      else if (/^AUTH PLAIN /i.test(line)) {
        const [, u, p] = Buffer.from(line.slice(11), "base64").toString().split("\0");
        auth(u, p);
      } else if (/^AUTH LOGIN/i.test(line)) {
        login = "user";
        say("334 VXNlcm5hbWU6");
      } else if (/^MAIL FROM:/i.test(line)) {
        from = /<([^>]*)>/.exec(line)?.[1] ?? "";
        to = [];
        say(script("MAIL", from) ?? "250 2.1.0 Ok");
      } else if (/^RCPT TO:/i.test(line)) {
        const rcpt = /<([^>]*)>/.exec(line)?.[1] ?? "";
        const no = script("RCPT", rcpt);
        if (!no) to.push(rcpt);
        say(no ?? "250 2.1.5 Ok");
      } else if (/^DATA/i.test(line)) {
        data = [];
        say("354 End data with <CR><LF>.<CR><LF>");
      } else if (/^QUIT/i.test(line)) {
        say("221 Bye");
        socket.end();
      } else say("250 Ok");
    }
  });
});
await new Promise<void>((r) => smtp.listen(SMTP_PORT, "127.0.0.1", r));

/** The header block of a message, folded lines joined. */
const headersOf = (data: string) => data.split("\r\n\r\n")[0].replace(/\r\n[ \t]+/g, " ").split("\r\n");
const header = (data: string, name: string) => headersOf(data).find((h) => h.toLowerCase().startsWith(`${name.toLowerCase()}:`))?.slice(name.length + 1).trim();
const unquoted = (data: string) => data.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));

// ---- Hydor, as the host's tests make it -----------------------------------------------------------------------------------------------

const SERVER = String.raw`import http from 'node:http';
http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/api/health') return send(200, { ok: true });
  if (req.url === '/env') { const k = process.env.HYDOR_APP_KEY; return send(200, { url: process.env.HYDOR_URL ?? null, slug: process.env.HYDOR_APP_SLUG ?? null, key: k ?? null }); }
  send(404, { error: 'not here' });
}).listen(Number(process.env.PORT), '127.0.0.1');
`;
function fixture(name: string, mail: string | null, blocks: Record<string, unknown> = {}): string {
  return writeTestApp(path.join(scratch, "apps", name), SERVER, { name, services: { ...(mail === "hydor" ? { mail: {} } : {}), ...("search" in blocks ? { embed: {} } : {}) } });
}

fs.mkdirSync(path.join(scratch, "hydor-data"), { recursive: true });
const dbFile = path.join(scratch, "test.db");
const db = openDb(dbFile);
kvSet(db, "sharing:owner", "Dana");
vaultTables(db);
appTables(db);
mailTables(db);
useMaskDb(db);
initPages(db);
const sessions = Object.assign(new EventEmitter(), { adapterByRun: () => null, summary: () => null });
const serverLog = new Writable({
  write(chunk, _enc, done) {
    logged.push(String(chunk));
    done();
  },
});
const server = Fastify({ logger: { level: "trace", stream: serverLog } });
await server.register(cookie);
server.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  const status = err instanceof HttpError ? err.status : err.statusCode && err.statusCode < 600 ? err.statusCode : 500;
  if (status >= 500) server.log.error(err);
  reply.code(status).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const deps = { app: server, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as Deps;
appsFeature.routes!(deps);
const web = createWebapps({ dataDir: path.join(scratch, "hydor-data"), port: 4789, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4782, 4788], startTimeoutMs: 20_000, hydorUrl: `http://127.0.0.1:${HYDOR_PORT}`, appsRoot: path.join(scratch, "WebApps") });
web.routes!(deps);
startRuns(deps);
await server.listen({ port: HYDOR_PORT, host: "127.0.0.1" });
web.start!(deps);
await web.ready;

const call = async (method: string, url: string, body?: unknown, headers?: Record<string, string>) => {
  const r = await server.inject({ method: method as any, url, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, payload: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  let json: any = null;
  try {
    json = r.json();
  } catch {}
  return { status: r.statusCode, json, text: r.body, headers: r.headers };
};
const send = (slug: string, key: string | null, body: unknown, idem?: string) => call("POST", `/api/apps/${slug}/mail`, body, { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(idem ? { "idempotency-key": idem } : {}) });

const account = (address: string, o: { password?: string; port?: number; name?: string } = {}) =>
  saveAccount(db, { address, name: o.name ?? "Dana Owner", username: address, imap: { host: "127.0.0.1", port: 9, security: "none" }, smtp: { host: "127.0.0.1", port: o.port ?? SMTP_PORT, security: "none" } }, o.password ?? PASSWORD);

let made = 0;
async function register(name: string, mail: string | null = "hydor", blocks?: Record<string, unknown>) {
  const unique = `${name}-${++made}`;
  const r = await call("POST", "/api/webapps", { folder: fixture(unique, mail, blocks), name: unique });
  assert.equal(r.status, 200, r.text);
  return r.json.app as WebApp;
}
type Env = { url: string | null; slug: string | null; key: string | null };
const envFrom = async (hosted: { id: string; slug: string; dir: string }) => {
  const port = await web.parts().host!.ensure(hosted);
  return (await (await fetch(`http://127.0.0.1:${port}/env`)).json()) as Env;
};
/** What the process of the app being made is given. */
const envOf = (a: WebApp) => envFrom({ id: a.id, slug: a.slug, dir: a.folder });
/** What the process Hydor starts as the launched version is given (the host's own `<id>_live`). */
const envLive = (a: WebApp) => envFrom({ id: `${a.id}_live`, slug: a.slug, dir: a.folder });
const allow = async (a: WebApp, mail: Record<string, unknown>) => call("PUT", `/api/webapps/${a.id}`, { settings: { mail } });
const view = async (a: WebApp) => (await call("GET", `/api/webapps/${a.id}`)).json.app.mail;
const page = async (a: WebApp) => (await call("GET", `/api/webapps/${a.id}/mail`)).json;

let main: { id: string; address: string };
/** An app that uses mail, allowed from the first account unless told otherwise; `key` is its launched version's, `preview` the one of the version being made. */
async function mailApp(name = "harbor", o: { allow?: boolean; perDay?: number } = {}) {
  const a = await register(name);
  const preview = await envOf(a);
  await web.parts().host!.stop(a.id);
  const env = await envLive(a);
  await web.parts().host!.stop(`${a.id}_live`);
  if (o.allow !== false) {
    const r = await allow(a, { on: true, account: main.id, perDay: o.perDay ?? 100 });
    assert.equal(r.status, 200, r.text);
  }
  return { a, key: env.key!, preview: preview.key!, slug: env.slug! };
}
let n = 0;
const mail = (extra: Record<string, unknown> = {}) => ({ to: [`person${++n}@users.test`], subject: "Confirm your address", text: "Open the link to confirm.", html: "<p>Open the link to confirm.</p>", ...extra });
const many = (count: number) => Array.from({ length: count }, () => `person${++n}@users.test`);

const reset = () => {
  got.length = 0;
  script = () => undefined;
  dataDelayMs = 0;
  forgetMailLimits();
  MAIL_LIMITS.waitMs = 5000;
  MAIL_LIMITS.retryMs = [40, 40, 40];
};

// ---- the tests ----------------------------------------------------------------------------------------------------------------------

test("an app whose hydor.json lists mail is started with where Hydor is, its address and a key; one that does not gets none", async () => {
  const a = await register("uses");
  const env = await envOf(a);
  assert.equal(env.url, `http://127.0.0.1:${HYDOR_PORT}`);
  assert.equal(env.slug, a.slug);
  assert.equal(env.key, embedKey(web.parts().host!.secret(a.id)), "the version being made: the app's key, unmarked");
  const live = await envLive(a);
  assert.match(live.key!, new RegExp(`^${env.key}~live\\.[A-Za-z0-9_-]{43}$`), "the launched version: the same key, marked");
  assert.deepEqual([live.url, live.slug], [env.url, env.slug]);
  for (const other of [await register("outbox", "outbox"), await register("nomail", null)]) {
    assert.equal(usesMail(other), false);
    const e = await envOf(other);
    assert.deepEqual([e.url, e.slug, e.key], [null, null, null], other.name);
    assert.equal((await call("GET", `/api/webapps/${other.id}`)).json.app.mail, undefined, "and its page says nothing of mail");
    assert.equal((await call("GET", `/api/webapps/${other.id}/mail`)).status, 404);
  }
});

test("no account in this Hydor: 501 whatever the owner said, the card's state says it cannot send, and nothing reaches a mail server", async () => {
  reset();
  const { a, key, slug } = await mailApp("early", { allow: false });
  const r = await send(slug, key, mail());
  assert.equal(r.status, 501, r.text);
  assert.match(r.json.error, /no mail account that can send/);
  const v = await view(a);
  assert.equal(v.canSend, false);
  assert.equal(v.state, "ask");
  assert.equal(v.today.refused, 1);
  const on = await allow(a, { on: true, account: "abcdef123456" });
  assert.equal(on.status, 400, "an account that is not there cannot be chosen");
  assert.equal((await allow(a, { on: true })).status, 400, "nor allowed with none");
  assert.deepEqual((await page(a)).accounts, []);
  assert.equal(got.length, 0);
  main = account("dana@owner.test");
});

test("the owner decides: nothing is sent until allowed (501); allowed it goes from the chosen account with the app's name; turned off it is 403; another account sends from that one", async () => {
  reset();
  const { a, key, slug } = await mailApp("decide", { allow: false });
  const before = await send(slug, key, mail());
  assert.equal(before.status, 501, before.text);
  assert.match(before.json.error, /not allowed this app to send mail yet/);
  assert.equal(got.length, 0);
  assert.equal((await view(a)).state, "ask");
  // A limit or an account saved without "on" decides nothing.
  assert.equal((await allow(a, { perDay: 40 })).status, 200);
  assert.equal((await view(a)).state, "ask");
  const on = await allow(a, { on: true, account: main.id });
  assert.equal(on.status, 200, on.text);
  assert.equal(on.json.app.mail.state, "allowed");
  assert.deepEqual(on.json.app.mail.account, { id: main.id, address: "dana@owner.test" });
  assert.equal(on.json.app.mail.perDay, 40);
  const r = await send(slug, key, mail({ to: ["ana@users.test"] }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.status, "sent");
  assert.match(r.json.id, /^mail_[0-9a-f]{24}$/);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(got.length, 1);
  assert.equal(got[0].user, "dana@owner.test");
  assert.equal(got[0].from, "dana@owner.test", "the envelope sender is the account's");
  assert.deepEqual(got[0].to, ["ana@users.test"]);
  assert.equal(header(got[0].data, "From"), `"${a.name}" <dana@owner.test>`, "left out, the name is the web app's");
  assert.equal(header(got[0].data, "To"), "ana@users.test");
  assert.equal(header(got[0].data, "Subject"), "Confirm your address");
  assert.equal(header(got[0].data, "Reply-To"), undefined);
  assert.equal(header(got[0].data, "List-Unsubscribe"), undefined);
  assert.match(got[0].data, /multipart\/alternative/);
  assert.match(unquoted(got[0].data), /<p>Open the link to confirm\.<\/p>/);
  const off = await allow(a, { on: false });
  assert.equal(off.json.app.mail.state, "off");
  const no = await send(slug, key, mail());
  assert.equal(no.status, 403, no.text);
  assert.match(no.json.error, /turned mail off/);
  assert.equal(got.length, 1);
  const second = account("shop@owner.test", { name: "Shop" });
  assert.equal((await allow(a, { on: true, account: second.id })).status, 200);
  assert.equal((await send(slug, key, mail())).status, 200);
  assert.equal(got[1].from, "shop@owner.test", "changed: the other account sends");
  assert.equal((await page(a)).accounts.length, 2);
  // The chosen account removed: never another one in its place.
  removeAccount(db, second.id);
  const gone = await send(slug, key, mail());
  assert.equal(gone.status, 501, gone.text);
  assert.match(gone.json.error, /not connected any more/);
  assert.equal((await view(a)).accountGone, true);
  assert.equal((await view(a)).account, undefined);
  assert.equal(got.length, 2);
});

test("what the request may carry: replyTo, fromName beside the owner's address, unsubscribe headers, no html; the sender's address is never the request's", async () => {
  reset();
  const { key, slug } = await mailApp("carry");
  const r = await send(slug, key, mail({ to: ["bo@users.test"], replyTo: "help@harbor.test", fromName: "Harbor “Bikes”, Ltd.", unsubscribe: "https://harbor.test/u?t=abc", from: "ceo@bank.example.com", subject: "Καλημέρα — news" }));
  assert.equal(r.status, 200, r.text);
  const d = got[0].data;
  assert.equal(got[0].from, "dana@owner.test", "a from in the request is nothing");
  assert.ok(!d.includes("ceo@bank.example.com"));
  assert.match(header(d, "From")!, /<dana@owner\.test>$/);
  assert.match(header(d, "From")!, /=\?UTF-8\?|Harbor/);
  assert.equal(header(d, "Reply-To"), "help@harbor.test");
  assert.equal(header(d, "List-Unsubscribe"), "<https://harbor.test/u?t=abc>");
  assert.equal(header(d, "List-Unsubscribe-Post"), "List-Unsubscribe=One-Click");
  assert.match(header(d, "Subject")!, /^=\?UTF-8\?/, "words outside ASCII are encoded");
  await send(slug, key, { to: ["cy@users.test"], subject: "Words only", text: "no html here", unsubscribe: "mailto:off@harbor.test?subject=stop" });
  assert.equal(header(got[1].data, "List-Unsubscribe"), "<mailto:off@harbor.test?subject=stop>");
  assert.equal(header(got[1].data, "List-Unsubscribe-Post"), undefined, "one click is for https alone");
  assert.match(header(got[1].data, "Content-Type")!, /^text\/plain/);
  // What the text and html hold is passed as given: Hydor cleans neither (mail.ts says so).
  await send(slug, key, mail({ html: '<a href="https://harbor.test/x">here</a><script>1</script><img src="file:///etc/hostname">' }));
  assert.ok(unquoted(got[2].data).includes('<script>1</script><img src="file:///etc/hostname">'), "as given, and no file read");
});

test("several recipients: each is sent a mail of their own that names no one else; the same address twice is one; each counts as one mail", async () => {
  reset();
  const { a, key, slug } = await mailApp("several");
  const to = ["one@users.test", "two@users.test", "three@users.test", "TWO@users.test"];
  const r = await send(slug, key, mail({ to }));
  assert.equal(r.status, 200, r.text);
  assert.equal(got.length, 3);
  for (const [i, m] of got.entries()) {
    assert.deepEqual(m.to, [to[i]], "one in the envelope");
    assert.equal(header(m.data, "To"), to[i]);
    assert.equal(header(m.data, "Cc"), undefined);
    assert.equal(header(m.data, "Bcc"), undefined);
    for (const other of to.slice(0, 3).filter((_x, j) => j !== i)) assert.ok(!m.data.includes(other), "no one sees another's address");
  }
  assert.equal(new Set(got.map((m) => header(m.data, "Message-ID"))).size, 3);
  const v = await view(a);
  assert.deepEqual(v.today, { counted: 3, sent: 3, waiting: 0, failed: 0, refused: 0 });
  assert.deepEqual(v.making.today, { counted: 0, sent: 0, waiting: 0, failed: 0, refused: 0 });
  assert.equal((await page(a)).recent[0].recipients, 3);
});

test("who may ask: no key, a wrong key, another app's key, an address that is nothing, an app that names no hydor mail driver; a flows half's key made for the web app opens it", async () => {
  reset();
  const one = await mailApp("mine");
  const two = await mailApp("theirs");
  assert.equal((await send(one.slug, null, mail())).status, 401);
  assert.equal((await send(one.slug, "napp_nonsense", mail())).status, 401);
  assert.equal((await send(one.slug, "not-a-key", mail())).status, 401);
  assert.equal((await send(one.slug, two.key, mail())).status, 401);
  assert.equal((await send("no-such-app", one.key, mail())).status, 401);
  const other = await register("nomail", "outbox", { search: {} });
  const k = (await envOf(other)).key!;
  const no = await send(other.slug, k, mail());
  assert.equal(no.status, 403, "a key that opens its search does not let it send");
  assert.match(no.json.error, /does not send mail through Hydor/);
  const f = await register("withflows", "hydor", {});
  const linked = await call("POST", `/api/webapps/${f.id}/flows`, {});
  assert.equal(linked.status, 200, linked.text);
  await web.parts().host!.stop(f.id);
  const env = await envLive(f);
  assert.equal(env.slug, linked.json.flows.app.slug);
  assert.match(env.key!, /^napp_[A-Za-z0-9_-]+~live\.[A-Za-z0-9_-]{43}$/, "the flows half's key, marked");
  const preview = await envOf(f);
  assert.equal(preview.key, env.key!.split("~")[0], "the two sides of a flows half share the key; only the mark tells them apart");
  assert.equal((await call("GET", `/api/apps/${env.slug}/flows`, undefined, { authorization: `Bearer ${env.key}` })).status, 200, "the marked key opens the flows routes as the plain one does");
  assert.equal((await allow(f, { on: true, account: main.id })).status, 200);
  assert.equal((await send(env.slug!, env.key, mail())).status, 200);
  assert.equal((await send(env.slug!, preview.key, mail())).status, 501, "the same app's version being made does not send");
  const second = await call("POST", `/api/apps/${linked.json.flows.app.id}/keys`, { name: "a script" });
  assert.equal((await send(env.slug!, second.json.key, mail())).status, 403, "another key of the agent app is not the web app's");
  assert.equal(got.length, 1);
});

test("a mail that is not valid is 400, one too long 413, and the refusal repeats nothing of it", async () => {
  reset();
  const { key, slug } = await mailApp("invalid");
  const check = async (body: unknown, status: number, re: RegExp) => {
    forgetMailLimits();
    const r = await send(slug, key, body);
    assert.equal(r.status, status, `${JSON.stringify(body).slice(0, 100)} → ${r.status} ${r.text.slice(0, 160)}`);
    assert.match(r.json.error, re);
    assert.ok(!r.text.includes("users.test") && !r.text.includes("Confirm your address"), r.text);
  };
  for (const body of [[], "x", 5]) await check(body, 400, /JSON|object/i);
  await check(mail({ to: [] }), 400, /1 to 50/);
  await check(mail({ to: "a@users.test" }), 400, /1 to 50/);
  await check(mail({ to: many(51) }), 400, /at most 50/);
  for (const to of [["not an address"], ["a@users"], ["Name <a@users.test>"], ["a@users.test, b@users.test"], [5], ["a@users.test", ""], [`${"x".repeat(250)}@users.test`]]) await check(mail({ to }), 400, /not one email address/);
  await check(mail({ subject: "" }), 400, /needs a subject/);
  await check(mail({ subject: "s".repeat(901) }), 400, /at most 900/);
  await check(mail({ text: "" }), 400, /needs its text/);
  await check(mail({ text: undefined }), 400, /needs its text/);
  await check(mail({ html: { path: "/etc/hostname" } }), 400, /html is text/);
  await check(mail({ text: { href: "http://127.0.0.1/" } }), 400, /needs its text/);
  await check(mail({ replyTo: "nobody" }), 400, /replyTo/);
  await check(mail({ fromName: "x".repeat(81) }), 400, /at most 80/);
  await check(mail({ unsubscribe: "http://harbor.test/u" }), 400, /https:\/\/ or mailto:/);
  await check(mail({ unsubscribe: "javascript:alert(1)" }), 400, /https:\/\/ or mailto:/);
  await check(mail({ text: "t".repeat(200_001) }), 413, /text is longer/);
  await check(mail({ html: "h".repeat(200_001) }), 413, /html is longer/);
  const huge = await send(slug, key, mail({ text: "t".repeat(3_200_000) }));
  assert.equal(huge.status, 413, huge.text.slice(0, 120));
  assert.equal((await send(slug, key, "{not json")).status, 400);
  assert.equal((await call("POST", `/api/apps/${slug}/mail`, mail(), { authorization: `Bearer ${key}`, "idempotency-key": "k".repeat(257) })).status, 400);
  assert.equal(got.length, 0, "nothing of this reached the mail server");
  assert.equal((await send(slug, key, mail({ subject: "s".repeat(900), text: "t".repeat(200_000), html: "h".repeat(200_000), fromName: "n".repeat(80) }))).status, 200, "the most that fits is sent");
});

// Header injection, one test for each field that becomes part of a header.
const INJECTIONS = ["\r\nBcc: spy@evil.test", "\nBcc: spy@evil.test", "\rX-Injected: yes", "\u2028Bcc: spy@evil.test", "\u0000"];
const injection = (field: string, body: (bad: string) => Record<string, unknown>) =>
  test(`header injection in ${field} is refused with 400 and nothing is sent`, async () => {
    reset();
    const { key, slug } = await mailApp("inject");
    for (const bad of INJECTIONS) {
      forgetMailLimits();
      const r = await send(slug, key, mail(body(bad)));
      assert.equal(r.status, 400, `${field} ${JSON.stringify(bad)} → ${r.status} ${r.text}`);
      assert.ok(!r.text.includes("spy@evil.test"), r.text);
    }
    assert.equal(got.length, 0);
  });
injection("the subject", (bad) => ({ subject: `Hello${bad}` }));
injection("an address in to", (bad) => ({ to: [`a@users.test${bad}`] }));
injection("a second address in to", (bad) => ({ to: ["a@users.test", `b@users.test${bad}`] }));
injection("replyTo", (bad) => ({ replyTo: `help@harbor.test${bad}` }));
injection("fromName", (bad) => ({ fromName: `Harbor${bad}` }));
injection("unsubscribe", (bad) => ({ unsubscribe: `https://harbor.test/u${bad}` }));

test("a name cannot look like another sender: no address or angle brackets in fromName, no right-to-left override; the web app's own name is cleaned the same way", async () => {
  reset();
  const { a, key, slug } = await mailApp("names");
  for (const fromName of ["security\uff20bank.example.com", "security@bank.example.com", "Bank <security@bank.example.com>", "Harbor\u202egnp.exe", "<x>"]) assert.equal((await send(slug, key, mail({ fromName }))).status, 400, fromName);
  assert.equal(got.length, 0);
  assert.equal((await call("PUT", `/api/webapps/${a.id}`, { name: "Shop <boss@bank.example.com>" })).status, 200);
  assert.equal((await send(slug, key, mail())).status, 200);
  assert.equal(header(got[0].data, "From"), '"Shop bossbank.example.com" <dana@owner.test>', "one address, the account's");
});

test("the day's limit: 429 with the limit, when it lifts (midnight UTC) and Retry-After; it lifts then, or when the owner raises it; a mail that cannot ever fit is 400", async () => {
  reset();
  const { a, key, slug } = await mailApp("limit", { perDay: 3 });
  assert.equal((await send(slug, key, mail({ to: many(2) }))).status, 200);
  const over = await send(slug, key, mail({ to: many(2) }));
  assert.equal(over.status, 429, over.text);
  assert.equal(got.length, 2, "refused whole: not one of the two went");
  assert.equal(over.json.limit, 3);
  const midnight = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) + 24 * 3600_000;
  assert.equal(over.json.resetsAt, new Date(midnight).toISOString());
  assert.ok(Math.abs(Number(over.headers["retry-after"]) - (midnight - Date.now()) / 1000) < 5, String(over.headers["retry-after"]));
  assert.match(over.json.error, /sent 2 of the 3 mails/);
  assert.equal((await send(slug, key, mail())).status, 200, "one still fits");
  assert.equal((await send(slug, key, mail())).status, 429);
  let v = await view(a);
  assert.equal(v.atLimit, true);
  assert.deepEqual(v.today, { counted: 3, sent: 3, waiting: 0, failed: 0, refused: 2 });
  assert.equal((await allow(a, { perDay: 4 })).status, 200);
  assert.equal((await send(slug, key, mail())).status, 200, "raised");
  assert.equal((await send(slug, key, mail())).status, 429);
  const never = await send(slug, key, mail({ to: many(5) }));
  assert.equal(never.status, 400, never.text);
  assert.match(never.json.error, /5 people.*4 mails a day/);
  for (const perDay of [0, -1, 1.5, "100", 10_001]) assert.equal((await allow(a, { perDay })).status, 400, String(perDay));
  // The next UTC day: it goes again. The count is the database's, so a restart changes nothing.
  const real = Date.now;
  Date.now = () => real() + 24 * 3600_000;
  try {
    forgetMailLimits();
    assert.equal((await send(slug, key, mail({ to: many(4) }))).status, 200);
    v = await view(a);
    assert.equal(v.today.counted, 4);
  } finally {
    Date.now = real;
  }
});

test("a minute: 30 requests (the refused too) and 60 mails, each 429 saying which limit and when it lifts, kept in the database", async () => {
  reset();
  const { key, slug } = await mailApp("minute", { perDay: 1000 });
  let last = 0;
  let calls = 0;
  for (; calls < MAIL_LIMITS.callsPerMinute + 3 && last !== 429; calls++) last = (await send(slug, key, { to: [] })).status;
  assert.equal(calls, MAIL_LIMITS.callsPerMinute + 1);
  const r = await send(slug, key, mail());
  assert.equal(r.status, 429);
  assert.equal(r.json.limit, 30);
  assert.ok(Date.parse(r.json.resetsAt) > Date.now() && Date.parse(r.json.resetsAt) <= Date.now() + 60_000);
  assert.ok(Number(r.headers["retry-after"]) >= 1 && Number(r.headers["retry-after"]) <= 60);
  const rows = db.prepare("select count(*) as n from rate_hits where scope = 'web-mail'").get() as { n: number };
  assert.ok(rows.n >= 30, "the requests are counted in the database");
  forgetMailLimits();
  assert.equal((await send(slug, key, mail({ to: many(50) }))).status, 200);
  assert.equal((await send(slug, key, mail({ to: many(10) }))).status, 200);
  const fast = await send(slug, key, mail());
  assert.equal(fast.status, 429, fast.text);
  assert.equal(fast.json.limit, 60);
  assert.match(fast.json.error, /60 a minute/);
  assert.ok(Date.parse(fast.json.resetsAt) <= Date.now() + 60_000);
  assert.equal(got.length, 60);
});

test("Idempotency-Key: a repeat within a day is answered with the same id and sends nothing, even once turned off or past the limit; after a day it is a new mail; another app's key of the same words is its own", async () => {
  reset();
  const { a, key, slug } = await mailApp("again", { perDay: 2 });
  const body = mail({ to: ["zoe@users.test"] });
  const first = await send(slug, key, body, "key-invite-zoe@users.test");
  assert.equal(first.status, 200, first.text);
  const repeat = await send(slug, key, body, "key-invite-zoe@users.test");
  assert.equal(repeat.status, 200);
  assert.deepEqual(repeat.json, first.json);
  assert.equal(got.length, 1);
  const other = await send(slug, key, body, "key-invite-zoe-2");
  assert.notEqual(other.json.id, first.json.id);
  assert.equal(got.length, 2);
  assert.equal((await send(slug, key, mail())).status, 429, "at the limit");
  assert.deepEqual((await send(slug, key, body, "key-invite-zoe@users.test")).json, first.json, "a repeat counts nothing");
  assert.equal((await allow(a, { on: false })).status, 200);
  assert.deepEqual((await send(slug, key, body, "key-invite-zoe@users.test")).json, first.json, "nor does turning it off undo what was sent");
  assert.equal(got.length, 2);
  const kept = db.prepare("select key_hash from web_app_mail where web_id = ?").all(a.id) as { key_hash: string | null }[];
  assert.ok(kept.every((r) => r.key_hash === null || /^[0-9a-f]{64}$/.test(r.key_hash)), "only a fingerprint of the key is kept");
  const b = await mailApp("again-other");
  assert.notEqual((await send(b.slug, b.key, body, "key-invite-zoe@users.test")).json.id, first.json.id);
  assert.equal((await allow(a, { on: true, perDay: 100 })).status, 200);
  db.prepare("update web_app_mail set at = at - ? where web_id = ?").run(25 * 3600_000, a.id);
  got.length = 0;
  const later = await send(slug, key, body, "key-invite-zoe@users.test");
  assert.equal(later.status, 200);
  assert.notEqual(later.json.id, first.json.id);
  assert.equal(got.length, 1);
});

test("two requests with one key at once send once and get one answer; a request that failed is not remembered, so the same key tries again", async () => {
  reset();
  const { key, slug } = await mailApp("atonce");
  dataDelayMs = 200;
  const body = mail();
  const [x, y] = await Promise.all([send(slug, key, body, "same"), send(slug, key, body, "same")]);
  assert.equal(x.status, 200, x.text);
  assert.deepEqual(x.json, y.json);
  assert.equal(got.length, 1);
  reset();
  script = (step) => (step === "RCPT" ? "451 4.7.1 Greylisted, try again later" : undefined);
  const no = await send(slug, key, body, "retried");
  assert.equal(no.status, 503, no.text);
  assert.equal(no.headers["retry-after"], "60");
  script = () => undefined;
  const yes = await send(slug, key, body, "retried");
  assert.equal(yes.status, 200, yes.text);
  assert.equal(got.length, 1);
});

test("what the mail server says: for later 503 (counted nothing), a refused address 400, a refused sign-in 501, a server that is not there 503; none of it repeats the server's words", async () => {
  reset();
  const { a, key, slug } = await mailApp("server", { perDay: 5 });
  const cases: [typeof script, number, string][] = [
    [(s) => (s === "DATA" ? "451 4.3.0 try later SECRET-SERVER-WORDS" : undefined), 503, "server"],
    [(s) => (s === "DATA" ? "550 5.4.5 Daily user sending limit exceeded" : undefined), 503, "server"],
    [(s, about) => (s === "RCPT" ? `550 5.1.1 <${about}>: no such user SECRET-SERVER-WORDS` : undefined), 400, "recipient"],
    [(s) => (s === "DATA" ? "554 5.7.1 looks like spam SECRET-SERVER-WORDS" : undefined), 400, "content"],
    [(s) => (s === "AUTH" ? "535 5.7.8 not accepted SECRET-SERVER-WORDS" : undefined), 501, "sign-in"],
    [(s) => (s === "MAIL" ? "553 5.7.1 sender not allowed" : undefined), 501, "sign-in"],
  ];
  for (const [say, status, reason] of cases) {
    reset();
    script = say;
    const r = await send(slug, key, mail());
    assert.equal(r.status, status, `${reason}: ${r.status} ${r.text}`);
    assert.ok(!r.text.includes("SECRET-SERVER-WORDS") && !r.text.includes("users.test"), r.text);
    assert.equal((await page(a)).recent[0].reason, reason);
    assert.equal((await page(a)).recent[0].status, "failed");
  }
  assert.equal((await view(a)).today.counted, 0, "what Hydor did not accept counts nothing against the day");
  const nowhere = account("nowhere@owner.test", { port: 4788 });
  assert.equal((await allow(a, { account: nowhere.id })).status, 200);
  assert.equal((await send(slug, key, mail())).status, 503);
  const wrong = account("wrong@owner.test", { password: "an old password" });
  reset();
  assert.equal((await allow(a, { account: wrong.id })).status, 200);
  assert.equal((await send(slug, key, mail())).status, 501);
  removeAccount(db, nowhere.id);
  removeAccount(db, wrong.id);
});

test("a slow mail server: 200 queued, and the mail goes; a repeat of the key meanwhile is answered queued and sends nothing", async () => {
  reset();
  const { a, key, slug } = await mailApp("slow");
  MAIL_LIMITS.waitMs = 100;
  dataDelayMs = 400;
  const body = mail();
  const r = await send(slug, key, body, "slow-1");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.status, "queued");
  assert.equal(got.length, 0);
  assert.deepEqual((await send(slug, key, body, "slow-1")).json, r.json);
  assert.equal((await view(a)).today.waiting, 1);
  await until(() => got.length === 1);
  await sleep(50);
  assert.equal((await page(a)).recent[0].status, "sent");
  assert.deepEqual((await send(slug, key, body, "slow-1")).json, { id: r.json.id, status: "sent" });
  assert.equal(got.length, 1);
});

test("some sent, the rest for later: queued, and only the rest are tried again; one the server refuses for good is left out; tries run out; turning it off drops what waits", async () => {
  reset();
  const { a, key, slug } = await mailApp("partly");
  let greylisted = 1;
  script = (s, about) => (s === "RCPT" && about === "b@users.test" && greylisted-- > 0 ? "451 4.7.1 later" : undefined);
  const r = await send(slug, key, { ...mail(), to: ["a@users.test", "b@users.test", "c@users.test"] }, "partly-1");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.status, "queued", "one has it: the request is not to be made again");
  await until(() => got.length === 3);
  assert.deepEqual(got.map((m) => m.to[0]).sort(), ["a@users.test", "b@users.test", "c@users.test"], "each once");
  await sleep(50);
  assert.deepEqual([(await page(a)).recent[0].status, (await page(a)).recent[0].sent], ["sent", 3]);
  // Someone the server keeps putting off does not hold back those after them.
  reset();
  script = (s, about) => (s === "RCPT" && about === "stuck@users.test" ? "452 4.2.2 mailbox full" : undefined);
  assert.equal((await send(slug, key, { ...mail(), to: ["stuck@users.test", "after@users.test"] })).json.status, "queued");
  assert.deepEqual(got.map((m) => m.to[0]), ["after@users.test"], "sent at once, though listed after the one put off");
  await until(() => (db.prepare("select status from web_app_mail where web_id = ? order by rowid desc limit 1").get(a.id) as { status: string }).status === "partial");
  assert.equal(got.length, 1);
  // One address refused for good among others.
  reset();
  script = (s, about) => (s === "RCPT" && about === "gone@users.test" ? "550 5.1.1 no such user" : undefined);
  const p = await send(slug, key, { ...mail(), to: ["gone@users.test", "d@users.test"] });
  assert.deepEqual([p.status, p.json.status], [200, "sent"]);
  assert.deepEqual([(await page(a)).recent[0].status, (await page(a)).recent[0].reason, (await page(a)).recent[0].sent], ["partial", "recipient", 1]);
  // Tries run out.
  reset();
  script = (s, about) => (s === "RCPT" && about === "never@users.test" ? "451 4.7.1 later" : undefined);
  assert.equal((await send(slug, key, { ...mail(), to: ["e@users.test", "never@users.test"] })).json.status, "queued");
  await until(() => (db.prepare("select status from web_app_mail where web_id = ? order by rowid desc limit 1").get(a.id) as { status: string }).status === "partial");
  assert.equal(got.length, 1);
  // Turned off while something waits.
  reset();
  MAIL_LIMITS.retryMs = [300];
  script = (s, about) => (s === "RCPT" && about === "wait@users.test" ? "451 4.7.1 later" : undefined);
  assert.equal((await send(slug, key, { ...mail(), to: ["f@users.test", "wait@users.test"] })).json.status, "queued");
  script = () => undefined;
  assert.equal((await allow(a, { on: false })).status, 200);
  assert.deepEqual([(await page(a)).recent[0].status, (await page(a)).recent[0].reason], ["partial", "off"]);
  await sleep(450);
  assert.equal(got.length, 1, "nothing more was sent");
});

test("a restart: what waited is lost and says so; a request Hydor never answered is finished by its key, to those it had not reached", async () => {
  reset();
  const { a, key, slug } = await mailApp("restart");
  MAIL_LIMITS.retryMs = [60_000];
  script = (s, about) => (s === "RCPT" && about === "h@users.test" ? "451 4.7.1 later" : undefined);
  const body = { ...mail(), to: ["g@users.test", "h@users.test"] };
  const r = await send(slug, key, body, "restart-1");
  assert.equal(r.json.status, "queued");
  stopMail();
  assert.deepEqual([(await page(a)).recent[0].status, (await page(a)).recent[0].reason], ["lost", "restart"]);
  assert.deepEqual((await send(slug, key, body, "restart-1")).json, { id: r.json.id, status: "queued" }, "it was taken: nothing is sent twice");
  assert.equal(got.length, 1);
  // As a Hydor that stopped while the request was still open would leave it: not answered.
  script = () => undefined;
  db.prepare("update web_app_mail set answered = 0 where id = ?").run(r.json.id);
  const back = await send(slug, key, body, "restart-1");
  assert.deepEqual(back.json, { id: r.json.id, status: "sent" });
  assert.deepEqual(got.map((m) => m.to[0]), ["g@users.test", "h@users.test"], "g was not sent it again");
  assert.equal((await view(a)).today.counted, 2);
});

test("app_api cannot send through the route, and allowing an app (or changing its account or limit) asks on a card each time, in Full access too", async () => {
  reset();
  const { a } = await mailApp("agents", { allow: false });
  for (const m of ["POST", "GET", "PUT"]) assert.equal(ruleFor(m, `/api/apps/${a.slug}/mail`).level, "refuse", m);
  const cards: ApprovalRequest[] = [];
  let decision: "accept" | "decline" = "decline";
  const adapter = {
    state: { mode: "bypassPermissions", status: "idle" as const },
    ask: async (card: ApprovalRequest) => {
      cards.push(card);
      return { decision };
    },
  };
  const ctx = { runId: "r1", key: "claude:own", agent: "claude", cwd: scratch, deps: { ...deps, sessions: { adapterByRun: () => adapter, summary: () => ({ key: "claude:own", title: "Work" }), formsChanged: () => {} } } } as unknown as RunCtx;
  const sendAsAgent = await appApi({ method: "POST", path: `/api/apps/${a.slug}/mail`, body: mail() }, ctx);
  assert.equal(sendAsAgent.isError, true);
  assert.match(sendAsAgent.text, /send_email/);
  const no = await appApi({ method: "PUT", path: `/api/webapps/${a.id}`, body: { settings: { mail: { on: true, account: main.id } } } }, ctx);
  assert.equal(no.isError, true, no.text);
  assert.equal(cards.length, 1);
  assert.match(cards[0].detail!, /send mail from your account, in your name/);
  assert.deepEqual(cards[0].options.map((o) => o.id), ["accept", "deny"], "never for the rest of the session");
  assert.equal((await view(a)).state, "ask", "said no: nothing changed");
  decision = "accept";
  await appApi({ method: "PUT", path: `/api/webapps/${a.id}`, body: { settings: { mail: { perDay: 500 } } } }, ctx);
  assert.equal(cards.length, 2, "the limit alone asks too");
  assert.equal(got.length, 0);
});

const lastRow = (a: WebApp) => db.prepare("select side, status, reason from web_app_mail where web_id = ? order by rowid desc limit 1").get(a.id) as { side: string; status: string; reason: string | null };

// Every combination of the owner's say and the side that asks.
test("each side with each of the owner's says: the version being made keeps its mail (501) until the owner lets it send; the launched version sends once allowed, as before", async () => {
  reset();
  const { a, key, preview, slug } = await mailApp("combos", { allow: false });
  const check = async (say: string, expected: { making: [number, string?]; launched: [number, string?] }) => {
    for (const [side, k] of [["making", preview], ["launched", key]] as const) {
      forgetMailLimits();
      const before = got.length;
      const r = await send(slug, k, mail());
      const [status, reason] = expected[side];
      assert.equal(r.status, status, `${say}, ${side}: ${r.status} ${r.text}`);
      assert.equal(got.length - before, status === 200 ? 1 : 0, `${say}, ${side}: what reached the mail server`);
      assert.equal(lastRow(a).side, side);
      assert.equal(lastRow(a).reason ?? undefined, reason, `${say}, ${side}: the record's reason`);
      if (side === "making" && reason === "making") assert.match(r.json.error, /still being made.*keeps it/);
    }
  };
  await check("not decided", { making: [501, "making"], launched: [501, "ask"] });
  assert.equal((await allow(a, { on: true, account: main.id })).status, 200);
  assert.equal((await view(a)).whileMaking, false, "off by default");
  await check("allowed", { making: [501, "making"], launched: [200] });
  assert.equal((await allow(a, { whileMaking: true })).status, 200);
  assert.equal((await view(a)).whileMaking, true);
  await check("allowed, and while being made", { making: [200], launched: [200] });
  assert.equal((await allow(a, { on: false })).status, 200);
  assert.equal((await view(a)).whileMaking, false, "off again with the mail");
  await check("turned off", { making: [501, "making"], launched: [403, "off"] });
  assert.equal((await allow(a, { on: true })).status, 200);
  assert.equal((await view(a)).whileMaking, false, "allowing it anew does not bring the test mail back");
  await check("allowed anew", { making: [501, "making"], launched: [200] });
  assert.equal((await allow(a, { whileMaking: true })).status, 200);
  removeAccount(db, main.id);
  await check("no account", { making: [501, "no-account"], launched: [501, "no-account"] });
  assert.equal((await allow(a, { whileMaking: false })).status, 200);
  await check("no account, not while being made", { making: [501, "making"], launched: [501, "no-account"] });
  main = account("dana@owner.test");
});

test("the second switch: only once mail is allowed, true or false, and an agent asks on a card before switching it", async () => {
  reset();
  const { a } = await mailApp("switch", { allow: false });
  const early = await allow(a, { whileMaking: true });
  assert.equal(early.status, 400, early.text);
  assert.match(early.json.error, /Allow the app’s mail first/);
  assert.equal((await allow(a, { on: true, account: main.id, whileMaking: "yes" })).status, 400);
  const both = await allow(a, { on: true, account: main.id, whileMaking: true });
  assert.equal(both.status, 200, both.text);
  assert.deepEqual(both.json.app.settings.mail, { on: true, account: main.id, perDay: 100, whileMaking: true });
  assert.equal((await allow(a, { whileMaking: false })).json.app.settings.mail.whileMaking, undefined);
  const cards: ApprovalRequest[] = [];
  const adapter = { state: { mode: "bypassPermissions", status: "idle" as const }, ask: async (card: ApprovalRequest) => (cards.push(card), { decision: "decline" as const }) };
  const ctx = { runId: "r1", key: "claude:own", agent: "claude", cwd: scratch, deps: { ...deps, sessions: { adapterByRun: () => adapter, summary: () => ({ key: "claude:own", title: "Work" }), formsChanged: () => {} } } } as unknown as RunCtx;
  const asked = await appApi({ method: "PUT", path: `/api/webapps/${a.id}`, body: { settings: { mail: { whileMaking: true } } } }, ctx);
  assert.equal(asked.isError, true, asked.text);
  assert.equal(cards.length, 1);
  assert.match(cards[0].detail!, /while it is being made, so that trying it out mails real people\)\. A link in its mail opens only for someone/);
  assert.equal((await view(a)).whileMaking, false);
});

test("which side is calling is Hydor's own knowledge: only the mark on the launched version's key makes it launched; a made-up or borrowed mark, anything the app says of itself, do not", async () => {
  reset();
  const { a, key, preview, slug } = await mailApp("sides");
  const other = await mailApp("sides-other");
  const [plain, mark] = key.split("~live.");
  assert.equal(plain, preview);
  const claimed = await call("POST", `/api/apps/${slug}/mail`, { ...mail(), launched: true, side: "launched" }, { authorization: `Bearer ${preview}`, "x-hydor-side": "launched" });
  assert.equal(claimed.status, 501, claimed.text);
  assert.equal((await view(a)).launched, false, "and the card goes by Hydor's own launches");
  const secret = web.parts().host!.secret(a.id);
  for (const forged of [`${preview}~live.${"A".repeat(43)}`, `${preview}~live.${other.key.split("~live.")[1]}`, `${preview}~live.${crypto.createHmac("sha256", secret).update(preview).digest("base64url")}`, preview]) {
    const r = await send(slug, forged, mail());
    assert.equal(r.status, 501, `${forged.slice(-20)}: ${r.text}`);
    assert.match(r.json.error, /still being made/);
  }
  assert.equal((await send(slug, `${preview}~anything`, mail())).status, 401, "any other tail is not a key");
  assert.equal((await send(other.slug, `${other.preview}~live.${mark}`, mail())).status, 501, "one app's mark does nothing on another");
  assert.equal(got.length, 0);
  assert.equal((await send(slug, key, mail())).status, 200);
});

test("the launched side is the process Hydor hosts as it: a launch on record is what the card and the JSON call launched", async () => {
  reset();
  const { a, preview, slug } = await mailApp("launched");
  assert.equal((await view(a)).launched, false);
  const dir = releaseDir(path.join(scratch, "hydor-data", "webapps"), a.id, "t1");
  writeTestApp(dir, SERVER, { services: { mail: {} } });
  saveLaunch(db, { id: "t1", app: a.id, place: "hydor", env: "hydor", commit: "0".repeat(40), by: "Dana", at: Date.now(), ms: 1, result: "live", overrides: [] });
  setLive(db, a.id, "t1", null);
  assert.equal((await view(a)).launched, true);
  assert.equal((await send(slug, preview, mail())).status, 501, "launched or not, the version being changed keeps its mail");
  const live = await envFrom({ id: `${a.id}_live`, slug: a.slug, dir });
  assert.equal((await send(slug, live.key, mail())).status, 200);
  assert.equal(got.length, 1);
});

test("the two sides share no Idempotency-Key, no day's count and no minute: a test can neither use up nor replay what is the launched version's", async () => {
  reset();
  const { a, key, preview, slug } = await mailApp("apart", { perDay: 3 });
  assert.equal((await allow(a, { whileMaking: true })).status, 200);
  const body = mail({ to: ["same@users.test"] });
  const tested = await send(slug, preview, body, "key-welcome-1");
  assert.equal(tested.status, 200, tested.text);
  const real = await send(slug, key, body, "key-welcome-1");
  assert.equal(real.status, 200, real.text);
  assert.notEqual(real.json.id, tested.json.id, "the same key on the other side is another mail");
  assert.equal(got.length, 2, "and it is sent: Preview did not use it up");
  assert.deepEqual((await send(slug, preview, body, "key-welcome-1")).json, tested.json);
  assert.deepEqual((await send(slug, key, body, "key-welcome-1")).json, real.json);
  assert.equal(got.length, 2);
  // Preview uses up its day.
  assert.equal((await send(slug, preview, mail({ to: many(2) }))).status, 200);
  assert.equal((await send(slug, preview, mail())).status, 429);
  assert.equal((await send(slug, key, mail({ to: many(2) }))).status, 200, "the launched version has its own");
  let v = await view(a);
  assert.deepEqual([v.today.counted, v.atLimit, v.making.today.counted, v.making.atLimit], [3, true, 3, true]);
  assert.equal((await allow(a, { perDay: 4 })).status, 200);
  v = await view(a);
  assert.deepEqual([v.atLimit, v.making.atLimit], [false, false]);
  const recent = (await page(a)).recent as { making?: boolean }[];
  assert.ok(recent.some((r) => r.making) && recent.some((r) => !r.making), "the records say which side");
  // A minute: Preview asking too often holds back Preview alone.
  forgetMailLimits();
  for (let i = 0; i < MAIL_LIMITS.callsPerMinute; i++) await send(slug, preview, { to: [] });
  assert.equal((await send(slug, preview, mail())).status, 429);
  assert.equal((await send(slug, key, mail())).status, 200);
  assert.equal((await allow(a, { perDay: 1000 })).status, 200);
  forgetMailLimits();
  db.prepare("delete from web_app_mail where web_id = ?").run(a.id);
  assert.equal((await send(slug, preview, mail({ to: many(50) }))).status, 200);
  assert.equal((await send(slug, preview, mail({ to: many(11) }))).status, 429, "its minute is full");
  assert.equal((await send(slug, key, mail({ to: many(50) }))).status, 200, "the launched version's is not");
});

test("switching off sending while it is being made drops what waits from that side, and leaves what waits from the launched version", async () => {
  reset();
  const { a, key, preview, slug } = await mailApp("dropped");
  assert.equal((await allow(a, { whileMaking: true })).status, 200);
  MAIL_LIMITS.retryMs = [300];
  let failing = true;
  script = (s, about) => (s === "RCPT" && failing && about.startsWith("wait") ? "451 4.7.1 later" : undefined);
  assert.equal((await send(slug, preview, { ...mail(), to: ["p@users.test", "wait-p@users.test"] })).json.status, "queued");
  assert.equal((await send(slug, key, { ...mail(), to: ["l@users.test", "wait-l@users.test"] })).json.status, "queued");
  assert.equal((await allow(a, { whileMaking: false })).status, 200);
  failing = false;
  await until(() => got.some((m) => m.to[0] === "wait-l@users.test"));
  await sleep(100);
  assert.ok(!got.some((m) => m.to[0] === "wait-p@users.test"), "what waited from the version being made was dropped");
  const rows = db.prepare("select side, status, reason from web_app_mail where web_id = ? order by rowid").all(a.id) as { side: string; status: string; reason: string | null }[];
  assert.deepEqual(rows.map((r) => [r.side, r.status, r.reason]), [["making", "partial", "making"], ["launched", "sent", null]]);
});

test("links in its mail: the app's JSON says what they point at, and whether only this computer knows that name (no APPS_DOMAIN); it is the address the app itself is given, and a warning, not a refusal", async () => {
  reset();
  const { a, slug, key } = await mailApp("links");
  assert.deepEqual((await view(a)).links, { host: `${a.slug}.localhost:4789`, local: true });
  assert.deepEqual((await page(a)).mail.links, (await view(a)).links);
  const row = getWebApp(db, a.id)!;
  assert.deepEqual(mailView(db, row, false, `https://${a.slug}.apps.example.com`)!.links, { host: `${a.slug}.apps.example.com`, local: false });
  assert.equal(mailView(db, row, false, `http://${a.slug}.apps.localhost:8792`)!.links.local, true);
  assert.equal((await send(slug, key, mail({ text: `Open http://${a.slug}.localhost:4789/x` }))).status, 200);
});

test("the records and the app's JSON: when, how many people, the subject's length and how it ended; never an address or a word of a mail", async () => {
  reset();
  const { a, key, slug } = await mailApp("records");
  assert.equal((await send(slug, key, { ...mail(), subject: "Twelve chars" })).status, 200);
  const p = await page(a);
  assert.deepEqual(Object.keys(p.recent[0]).sort(), ["at", "recipients", "sent", "status", "subjectChars"]);
  assert.deepEqual([p.recent[0].recipients, p.recent[0].subjectChars, p.recent[0].sent, p.recent[0].status], [1, 12, 1, "sent"]);
  assert.ok(Math.abs(p.recent[0].at - Date.now()) < 10_000);
  assert.deepEqual(Object.keys(p.mail).sort(), ["account", "atLimit", "canSend", "launched", "links", "making", "perDay", "resetsAt", "state", "today", "whileMaking"]);
  const listed = (await call("GET", "/api/webapps")).json.apps.find((x: WebApp) => x.id === a.id);
  assert.deepEqual(listed.mail, p.mail);
  assert.deepEqual(listed.settings.mail, { on: true, account: main.id, perDay: 100 });
});

test("nothing of an address or of a mail's words is in Hydor's database, its files or its log, whatever became of the mail", async () => {
  reset();
  const { a, key, slug } = await mailApp("private");
  const secret = { to: ["MARK-TO@private.test"], subject: "MARK-SUBJECT", text: "MARK-TEXT", html: "<p>MARK-HTML</p>", replyTo: "MARK-REPLY@private.test", fromName: "MARK-FROMNAME", unsubscribe: "https://private.test/MARK-UNSUB" };
  assert.equal((await send(slug, key, secret, "key-MARK-KEY@private.test")).status, 200);
  assert.equal(got.length, 1);
  for (const say of [
    (s: string, about: string) => (s === "RCPT" ? `550 5.1.1 <${about}>: no such user` : undefined),
    (s: string, about: string) => (s === "RCPT" ? `451 4.7.1 <${about}> later` : undefined),
    (s: string) => (s === "AUTH" ? "535 5.7.8 not accepted" : undefined),
    (s: string) => (s === "DATA" ? "554 5.7.1 MARK-TEXT rejected" : undefined),
  ]) {
    script = say;
    const r = await send(slug, key, secret);
    assert.ok(r.status >= 400, r.text);
    assert.ok(!/MARK-/.test(r.text), r.text);
  }
  // Slow, some sent and some for later, tries running out.
  reset();
  MAIL_LIMITS.retryMs = [20];
  script = (s, about) => (s === "RCPT" && about.startsWith("MARK-LATE") ? `451 4.7.1 <${about}> later` : undefined);
  assert.equal((await send(slug, key, { ...secret, to: ["MARK-TO@private.test", "MARK-LATE@private.test"] })).json.status, "queued");
  await sleep(300);
  assert.equal((await allow(a, { on: false })).status, 200);
  assert.equal((await send(slug, key, secret)).status, 403);
  assert.equal((await send(slug, key, { ...secret, subject: "MARK-SUBJECT\r\nBcc: MARK-BCC@private.test" })).status, 400);
  db.pragma("wal_checkpoint(TRUNCATE)");
  const files = [scratch, process.env.DATA_DIR!]
    .flatMap((dir) => (fs.readdirSync(dir, { recursive: true }) as string[]).map((f) => path.join(dir, f)))
    .filter((f) => !f.includes(`${path.sep}apps${path.sep}`) && fs.statSync(f).isFile());
  assert.ok(files.includes(dbFile));
  for (const f of files) assert.ok(!/MARK-|private\.test/.test(fs.readFileSync(f, "latin1")), `something of the mail is in ${path.basename(f)}`);
  const log = logged.join("\n");
  assert.ok(log.includes("a web app's mail was not sent"), "the log has the failures");
  assert.ok(!/MARK-|private\.test|users\.test/.test(log), "and nothing of an address or a mail");
});

// ---- run ----------------------------------------------------------------------------------------------------------------------------

let passed = 0;
let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    await web.parts().host!.stopAll();
    passed++;
    process.stdout.write(`ok   ${name}\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`FAIL ${name}\n${(e as Error).stack}\n`);
  }
}
process.stdout.write(`\n${passed}/${tests.length} passed\n(the mail server was a stand-in on this computer in every one of them; no mail left this machine)\n`);
await web.stop!(null as never);
for (const s of sockets) s.destroy();
smtp.close();
await server.close();
fs.rmSync(scratch, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
