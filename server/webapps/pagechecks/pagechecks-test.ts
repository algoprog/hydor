// The page checks in a real browser, against small apps of their own: a clean one passes every line, and each of the others has one
// fault and fails exactly its line. Then what happens with no browser, with no app, and when the check is stopped or its program is
// killed half-way (no process and no profile folder may be left). Needs a Chromium (Hydor's own finding); without one it says so.
// Ports 4700 to 4709. No network.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/pagechecks/pagechecks-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> [PLAYWRIGHT_BROWSERS_PATH=…] node dist/dev/pagechecks-test.js
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { CheckBrowser, findBrowser, sweepProfiles } from "./browser.ts";
import { asCheckLines, checkPages, LINE_IDS, type LineId, type PageChecks, type PageChecksInput, summarize } from "./index.ts";

// Run again as a child that starts a browser and waits to be killed.
if (process.argv[2] === "hold") {
  const b = await CheckBrowser.launch(findBrowser()!, []);
  console.log(JSON.stringify({ pid: b.pid, profile: b.profile }));
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}

const program = findBrowser();
if (!program) {
  console.log("skipped: no browser here (install Chromium, or set PLAYWRIGHT_BROWSERS_PATH)");
  process.exit(0);
}

const APP = 4700;
const ELSEWHERE = 4701;
const KEY = "sk-live-pagecheck-9f8a7b6c5d4e";
let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  const t = Date.now();
  await fn();
  passed++;
  console.log(`ok - ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
};

// ---- the small app -------------------------------------------------------------------------------------------------------------------

interface Fault {
  /** Added to the body of "/". */
  body?: string;
  style?: string;
  head?: string;
  title?: string;
  lang?: string;
  viewport?: boolean;
  description?: string;
  /** Every page titled alike. */
  oneTitle?: boolean;
  /** The app's styles without their dark look. */
  lightOnly?: boolean;
  heading?: string;
  /** Other addresses. */
  routes?: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => void>;
  /** The form on /home takes a post from anywhere. */
  openForm?: boolean;
  cookie?: string;
  input?: Partial<PageChecksInput>;
}

const DARK = "@media (prefers-color-scheme: dark){body{background:#111;color:#eee}a{color:#9cc3ff}}";
const CSS = "html{color-scheme:light dark}body{margin:0;padding:16px;font:16px system-ui,sans-serif;background:#fff;color:#111}a{color:#0645ad}.btn,button,input,select{font:inherit;min-height:44px;min-width:44px}.btn{display:inline-flex;align-items:center;margin:8px 8px 8px 0}label{display:block;margin:8px 0}:focus-visible{outline:3px solid #b45309;outline-offset:2px}img{max-width:100%}";
const DOT = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

function html(f: Fault, body: string, title: string, heading: string): string {
  return `<!doctype html><html${f.lang === "" ? "" : ` lang="${f.lang ?? "en"}"`}><head><meta charset="utf-8">${f.viewport === false ? "" : '<meta name="viewport" content="width=device-width, initial-scale=1">'}${title ? `<title>${f.oneTitle ? "Small app" : title}</title>` : ""}${f.description === "" ? "" : `<meta name="description" content="${f.description ?? "A small app to try the checks on."}">`}<link rel="stylesheet" href="/app.css">${f.head ?? ""}</head><body><main>${heading}${body}</main></body></html>`;
}

function app(f: Fault): http.Server {
  const SAFE = { "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" };
  return http.createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const send = (status: number, type: string, body: string | Buffer, more: Record<string, string> = {}) => res.writeHead(status, { "content-type": type, ...SAFE, ...more }).end(body);
    if (f.routes?.[path]) return f.routes[path](req, res);
    if (path === "/app.css") return send(200, "text/css", CSS + (f.lightOnly ? "" : DARK) + (f.style ?? ""));
    if (path === "/app.js") return send(200, "text/javascript", "document.documentElement.dataset.ready = '1';");
    if (path === "/favicon.ico") return send(204, "image/x-icon", "");
    const page = (b: string, title: string, heading = `<h1>${title}</h1>`) => send(200, "text/html; charset=utf-8", html(f, b, title, heading));
    const signedIn = /(^|; )sid=good-session-value/.test(req.headers.cookie ?? "");
    if (path === "/") return send(200, "text/html; charset=utf-8", html(f, `<p>A small app. <a href="/about">About it</a>.</p><p><a class="btn" href="/about">About</a> <button type="button">Save</button></p><label>Name <input name="who"></label><p><img src="${DOT}" alt="A dot" width="20" height="20"></p>${f.body ?? ""}<script src="/app.js"></script>`, f.title ?? "Small app", f.heading ?? "<h1>Small app</h1>"));
    if (path === "/about") return page('<p>About it.</p><p><a class="btn" href="/">Home</a></p>', "About");
    if (path === "/home") {
      if (!signedIn) return send(303, "text/plain", "", { location: "/" });
      return page('<form method="post" action="/notes"><input type="hidden" name="csrf" value="tk_9f8a7b6c5d4e3f2a1b0c9d8e7f"><label>Note <input name="note" required></label><button>Add note</button></form>', "Your notes");
    }
    if (path === "/notes" && req.method === "POST") {
      const own = req.headers.origin === `http://${req.headers.host}`;
      req.resume();
      if (!f.openForm && !own) return send(403, "text/plain", "That did not come from this app.");
      return send(303, "text/plain", "", { location: "/home" });
    }
    send(404, "text/plain", "Not found");
  });
}

async function run(f: Fault): Promise<PageChecks> {
  const server = app(f);
  await new Promise<void>((r) => server.listen(APP, "127.0.0.1", r));
  try {
    return await checkPages({
      address: `http://localhost:${APP}`,
      signedIn: { cookie: "sid=good-session-value", setCookies: [f.cookie ?? "sid=good-session-value; Path=/; HttpOnly; SameSite=Lax"], home: "/home" },
      secrets: [{ name: "PAY_KEY", value: KEY }],
      throwaway: true,
      allowLocal: [`127.0.0.1:${ELSEWHERE}`],
      ...f.input,
    });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

const of = (r: PageChecks, state: string) => r.lines.filter((l) => l.state === state).map((l) => l.id);
const get = (r: PageChecks, id: LineId) => r.lines.find((l) => l.id === id)!;
const text = (r: PageChecks) => r.lines.map((l) => `${l.state.padEnd(6)} ${l.id}: ${l.text}${l.details?.length && l.state !== "passed" ? `\n         ${l.details.join("\n         ")}` : ""}`).join("\n");

const elsewhere = http.createServer((_req, res) => res.writeHead(200, { "content-type": "font/woff2", "access-control-allow-origin": "*" }).end(Buffer.alloc(2000)));
await new Promise<void>((r) => elsewhere.listen(ELSEWHERE, "127.0.0.1", r));

const profiles = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(`hydor-pagecheck-${process.pid}-`));
/** Processes whose command line names a profile folder. */
const holding = (needle: string): number[] =>
  fs.readdirSync("/proc").filter((p) => /^\d+$/.test(p)).map(Number).filter((p) => {
    try {
      return p !== process.pid && fs.readFileSync(`/proc/${p}/cmdline`, "utf8").includes(needle);
    } catch {
      return false;
    }
  });
const linux = fs.existsSync("/proc/self/cmdline");

await step("a clean app passes every line, and nothing is left of the browser", async () => {
  const r = await run({});
  assert.deepEqual(r.lines.map((l) => l.id), LINE_IDS);
  assert.deepEqual(r.lines.filter((l) => l.state !== "passed").map((l) => `${l.id}: ${l.text} ${l.details?.join(" | ") ?? ""}`), [], text(r));
  assert.equal(r.ok, true);
  assert.deepEqual(r.pages.map((p) => `${p.signedIn ? "in " : ""}${p.path} ${p.status} ${p.read}`), ["/ 200 true", "/about 200 true", "in /home 200 true"]);
  assert.match(get(r, "cross-site-forms").text, /1 form posted as another site would was refused/);
  assert.match(get(r, "contrast").text, /light and the dark look/);
  assert.match(get(r, "weight-first").text, /A first visit to \/ downloads .* the budget for a public page is 450 kB/);
  assert.match(get(r, "weight-inner").text, /\/home \(signed in\).*signed-in page is 600 kB/);
  assert.deepEqual(profiles(), []);
  assert.equal(summarize(r).split("\n").length, 1);
});

/** Text that stays about this many bytes once compressed. */
const gz = (bytes = 400_000) => crypto.randomBytes(bytes).toString("base64");
const faults: [string, LineId, Fault, RegExp][] = [
  ["a page wider than a phone", "phone-sideways", { body: '<div style="width:700px;height:10px;background:#c00"></div>' }, /px wider than the screen \(div/],
  ["no viewport tag", "phone-sideways", { viewport: false, style: "body{font-size:40px}.btn,button,input{min-height:100px;min-width:100px;font-size:40px}" }, /drawn as a desktop page/],
  ["tiny letters", "phone-text", { body: '<p style="font-size:9px">The small print that matters.</p>' }, /is 9 px/],
  ["a row of tiny buttons", "phone-tap", { body: `<p>${["a", "b", "c", "d"].map((x) => `<button type="button" style="min-height:0;min-width:0;width:18px;height:18px;padding:0;font-size:12px">${x}</button>`).join("")}</p>` }, /button "a" is 18 × 18 px/],
  ["the end of a page under a fixed bar", "phone-hidden", { body: '<div style="height:900px"></div><p>The total to pay.</p><div style="position:fixed;left:0;right:0;bottom:0;height:120px;background:#333;color:#fff">Bar</div>' }, /p "The total to pay." stays under div/],
  ["grey on grey", "contrast", { body: '<p style="color:#999;background:#bbb;padding:8px">You cannot read this well.</p>' }, /"You cannot read this well\." in p .* needs 4\.5:1/],
  ["grey on grey in the dark look only", "contrast", { body: '<p class="dim">Dim at night.</p>', style: "@media (prefers-color-scheme: dark){.dim{color:#333}}" }, /\(dark look\)/],
  ["white words over a pale part of a gradient", "contrast", { body: '<p style="color:#fff;background:linear-gradient(90deg,#fff,#eee);padding:8px">Over a picture of sorts.</p>' }, /Over a picture/],
  ["no title", "page-title", { title: "" }, /no title/],
  ["no language", "page-language", { lang: "" }, /no language named/],
  ["no main heading", "main-heading", { heading: "<h2>Small app</h2>" }, /no main heading/],
  ["a heading level skipped", "heading-order", { body: "<h3>Details</h3>" }, /\/: an h3 \("Details"\) follows an h1/],
  ["no description on public pages", "page-description", { description: "" }, /\/ and 1 more page: no description/],
  ["the same title on every page", "page-title", { oneTitle: true }, /All 3 pages have the same title, "Small app"/],
  ["grey on grey in a dark look the page switches itself", "contrast", { lightOnly: true, body: '<p class="dim">Dim in the dark.</p>', style: ".dark body{background:#111;color:#eee}.dark a{color:#9cc3ff}.dark .dim{color:#333}" }, /\(dark look\)/],
  ["a script that reads a key by name", "browser-keys", { body: '<script src="/pay.js"></script>', routes: { "/pay.js": (_q, res) => res.writeHead(200, { "content-type": "text/javascript" }).end("window.key = () => process.env.PAY_KEY;") } }, /\/pay\.js: reads PAY_KEY/],
  ["a development server's live reloading", "dev-parts", { body: '<script type="module" src="/@vite/client"></script>', routes: { "/@vite/client": (_q, res) => res.writeHead(200, { "content-type": "text/javascript" }).end("export {};") } }, /loads \/@vite\/client/],
  ["a picture with no words", "picture-words", { body: `<img src="${DOT}" width="30" height="30">` }, /\/: img/],
  ["a field with no label", "field-labels", { body: '<p><input name="q" placeholder="Search"></p>' }, /input \(q\)/],
  ["a button with no name", "control-names", { body: '<p><button type="button"><svg width="10" height="10"><circle cx="5" cy="5" r="4"/></svg></button></p>' }, /button/],
  ["no mark where the keyboard is", "focus-visible", { body: '<p><button type="button" class="quiet">Quiet</button></p>', style: ".quiet:focus,.quiet:focus-visible{outline:none}" }, /no mark when the keyboard is on button "Quiet"/],
  ["something only a mouse can press", "mouse-only", { body: '<div id="go" style="cursor:pointer;padding:12px">Open the list</div><span id="two" style="display:inline-block;padding:12px">Remove</span><script>document.getElementById("two").addEventListener("click", () => {})</script>' }, /div "Open the list" answers a click[\s\S]*span "Remove" answers a click/],
  ["500 kB of script", "weight-first", { body: '<script src="/big.js"></script>', routes: { "/big.js": (_q, res) => res.writeHead(200, { "content-type": "text/javascript" }).end(`/*${gz()}*/`) } }, /of scripts where the budget is 280 kB/],
  ["an inner page too heavy", "weight-inner", { input: { signedIn: undefined }, routes: { "/about": (_q, res) => res.writeHead(200, { "content-type": "text/html", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" }).end(html({}, `<!--${gz(520_000)}-->`, "About", "<h1>About</h1>")) } }, /\/about downloads .* in all where the budget is 450 kB/],
  ["a font from another site", "other-sites", { style: `@font-face{font-family:Far;src:url(http://127.0.0.1:${ELSEWHERE}/far.woff2)}h1{font-family:Far,sans-serif}` }, /a font from http:\/\/127\.0\.0\.1:4701\/far\.woff2/],
  ["a key in a script", "browser-keys", { body: '<script src="/config.js"></script>', routes: { "/config.js": (_q, res) => res.writeHead(200, { "content-type": "text/javascript" }).end(`window.pay = ${JSON.stringify(KEY)};`) } }, /\/config\.js: holds PAY_KEY/],
  ["a key in a source map no page loads", "browser-keys", { body: '<script src="/min.js"></script>', routes: { "/min.js": (_q, res) => res.writeHead(200, { "content-type": "text/javascript" }).end("1;\n//# sourceMappingURL=min.js.map"), "/min.js.map": (_q, res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ version: 3, sources: ["a.js"], sourcesContent: [`const k = "${KEY}"`], mappings: "" })) } }, /\/min\.js\.map: holds PAY_KEY/],
  ["a form another site can post to", "cross-site-forms", { openForm: true }, /form "Add note" \(POST \/notes\) was answered 303/],
  ["a sign-in cookie a script can read", "cookie-flags", { cookie: "sid=good-session-value; Path=/" }, /sid is not HttpOnly.*sid has no SameSite/],
  ["a page that answers 500", "pages-answer", { body: '<p><a class="btn" href="/report">Report</a></p>', routes: { "/report": (_q, res) => res.writeHead(500, { "content-type": "text/plain" }).end("boom") } }, /\/report answers 500|answered 500/],
  ["a fault only on what a search shows", "main-heading", { body: '<form action="/find" method="get"><label>Find <input name="q"></label><label>How many <input name="n" inputmode="numeric"></label><button>Search</button></form>', routes: { "/find": (_q, res) => res.writeHead(200, { "content-type": "text/html", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" }).end(html({}, "<p>Nothing found.</p>", "Found", "")) } }, /\/find\?q=Page\+check&n=2: no main heading/],
  ["a dead link", "links", { body: '<p><a class="btn" href="/gone">Old page</a></p>' }, /the link to \/gone answers 404/],
  ["a link to a place that is not there", "links", { body: '<p><a class="btn" href="#prices">Prices</a></p>' }, /#prices/],
  ["an error in the console", "console-errors", { body: "<script>document.querySelector('#nothing').focus()</script>" }, /TypeError/],
  ["a picture that does not load", "pictures-load", { body: '<img src="/missing.png" alt="A missing picture" width="40" height="40">' }, /missing\.png/],
];

for (const [name, id, fault, says] of faults)
  await step(`${name}: only the ${id} line fails`, async () => {
    const r = await run(fault);
    assert.deepEqual(of(r, "failed"), [id], text(r));
    assert.deepEqual(of(r, "notRun"), [], text(r));
    const l = get(r, id);
    assert.match(`${l.text}\n${l.details?.join("\n") ?? ""}`, says, text(r));
    assert.ok(l.hint, "a failed line says what to do");
    assert.ok(!JSON.stringify(r).includes(KEY), "the key's value is never given back");
    assert.ok(!JSON.stringify(r).includes("good-session-value"), "nor the sign-in");
  });

await step("small but not under the standard, or small with room round it, is a note: how many and the three smallest, in one line", async () => {
  const buttons = Array.from({ length: 6 }, (_, i) => `<button type="button" style="min-height:0;height:${30 + i}px;margin:6px">Choice ${i + 1}</button>`).join(" ");
  const r = await run({ body: `<p>${buttons}</p><p style="padding:30px"><button type="button" style="min-height:0;min-width:0;width:18px;height:18px;padding:0;font-size:12px">x</button></p>` });
  assert.deepEqual(of(r, "failed"), [], text(r));
  assert.deepEqual(of(r, "note"), ["phone-tap"], text(r));
  const l = get(r, "phone-tap");
  assert.equal(l.count, 7);
  assert.match(l.text, /^7 controls on a phone are smaller than the comfortable 40 px \(none breaks the standard's 24 px minimum\); the three smallest: button "x" 18 × 18, button "Choice 1" \d+ × 30, button "Choice 2" \d+ × 31\.$/);
  assert.equal(l.details!.length, 3);
  const s = summarize(r).split("\n");
  assert.equal(s.length, 2);
  assert.match(s[1], /^Note: phone-tap: 7 controls/);
});

await step("many of one thing are counted, with three examples", async () => {
  const r = await run({ body: `<p>${Array.from({ length: 9 }, (_, i) => `<a class="btn" href="/gone-${i}">Gone ${i}</a>`).join("")}</p><p>${Array.from({ length: 7 }, (_, i) => `<input name="f${i}">`).join("")}</p>` });
  assert.deepEqual(of(r, "failed"), ["field-labels", "links"], text(r));
  for (const [id, count, says] of [["links", 9, /^9 links or files lead nowhere/], ["field-labels", 7, /^7 fields have no label/]] as const) {
    const l = get(r, id);
    assert.equal(l.count, count);
    assert.match(l.text, says);
    assert.equal(l.details!.length, 3);
    assert.equal(l.items!.length, 3);
  }
  assert.match(summarize(r), /✗ links: .*\(\+7 more\)/);
});

await step("a focus mark that is there but faint is a note", async () => {
  const r = await run({ body: '<p><button type="button" class="faint">Faint</button></p>', style: ".faint:focus,.faint:focus-visible{outline:2px solid #e4e4e4}" });
  assert.deepEqual(of(r, "failed"), [], text(r));
  assert.deepEqual(of(r, "note"), ["focus-visible"], text(r));
  assert.match(get(r, "focus-visible").text, /only faintly.*button "Faint"/);
});

await step("lines can be left out by id, and a line that is left out does nothing; the first visit and budgets are given", async () => {
  let posts = 0;
  const r = await run({ openForm: true, title: "", routes: { "/notes": (_q, res) => (posts++, res.writeHead(303, { location: "/home" }).end()) }, input: { skip: ["page-title", "cross-site-forms"] } });
  assert.deepEqual(of(r, "failed"), [], text(r));
  assert.deepEqual(of(r, "notRun"), ["page-title", "cross-site-forms"], text(r));
  assert.equal(get(r, "page-title").text, "Left out on request.");
  assert.equal(posts, 0);
  assert.equal(r.firstVisit?.path, "/");
  assert.ok(r.firstVisit!.total > 0 && r.budgets.public.total === 450_000);
  assert.deepEqual(r.notes, []);
  await assert.rejects(checkPages({ address: `http://localhost:${APP}`, skip: ["tap" as LineId] }), /"tap" is not the id of a line/);
});

await step("headers that protect visitors are a note, not a failure", async () => {
  const r = await run({ routes: { "/about": (_q, res) => res.writeHead(200, { "content-type": "text/html" }).end(html({}, '<p><a class="btn" href="/">Home</a></p>', "About", "<h1>About</h1>")) } });
  assert.deepEqual(of(r, "failed"), [], text(r));
  assert.deepEqual(of(r, "note"), ["headers"], text(r));
  assert.match(get(r, "headers").details!.join("\n"), /\/about: no X-Content-Type-Options/);
});

await step("an agent's summary is at most a dozen lines, failures first, each with the page and what to do; the Checks tab's lines", async () => {
  const r = await run({ title: "", lang: "", heading: "", openForm: true, body: '<p style="font-size:8px;color:#aaa">tiny and faint</p><a class="btn" href="/gone">gone</a><img src="/missing.png"><input name="q"><div style="width:900px;height:4px;background:#000"></div><div onclick="1" style="padding:12px">press</div><script>console.error("it broke")</script>', cookie: "sid=good-session-value" });
  assert.ok(of(r, "failed").length > 10, text(r));
  const s = summarize(r);
  assert.ok(s.split("\n").length <= 12, s);
  assert.match(s.split("\n")[1], /^✗ cross-site-forms: \/.*Fix: /);
  assert.match(s.split("\n")[2], /^✗ cookie-flags: /);
  assert.match(s, /✗ also failed: /);
  const lines = asCheckLines(r);
  assert.deepEqual(lines.map((l) => l.id), LINE_IDS);
  assert.ok(lines.every((l) => ["pages", "accessibility", "safety"].includes(l.group!) && (l.details?.length ?? 0) <= 9));
  console.log(s);
});

await step("the sign-in that does not take is said, and its pages are not claimed", async () => {
  const r = await run({ input: { signedIn: { cookie: "sid=an-old-session-value", home: "/home" } } });
  assert.match(r.summary, /sign-in given did not take/);
  assert.equal(get(r, "pages-answer").state, "notRun", text(r));
  assert.equal(get(r, "cross-site-forms").state, "notRun", text(r));
});

await step("a sign-in by a signed header (Hydor's way): each request to the app has a fresh one, another site gets none, and it is never given back", async () => {
  const got: (string | undefined)[] = [];
  let asked = 0;
  const away = http.createServer((req, res) => (got.push(req.headers["x-hydor-person"] as string), res.writeHead(200, { "content-type": "image/gif" }).end(Buffer.from(DOT.split(",")[1], "base64"))));
  await new Promise<void>((r) => away.listen(4702, "127.0.0.1", r));
  const routes: Fault["routes"] = {
    "/": (req, res) => {
      const ok = String(req.headers["x-hydor-person"] ?? "").startsWith("signed-person-");
      res.writeHead(ok ? 200 : 401, { "content-type": "text/html", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" }).end(html({}, ok ? `<img src="http://127.0.0.1:4702/a.gif" alt="Far" width="20" height="20"><p>${String(req.headers["x-hydor-person"])}</p>` : "<p>Sign in through Hydor.</p>", "Mine", "<h1>Mine</h1>"));
    },
  };
  const r = await run({ routes, input: { signedOut: false, signedIn: { headers: () => ({ "x-hydor-person": `signed-person-${++asked}` }) }, allowLocal: ["127.0.0.1:4702"] } });
  away.close();
  assert.deepEqual(of(r, "failed"), [], text(r));
  assert.deepEqual(r.pages.map((p) => `${p.signedIn} ${p.path} ${p.status}`), ["true / 200"]);
  assert.ok(asked > 2);
  assert.ok(got.length && got.every((h) => h === undefined), "the header stays with the app");
  assert.ok(!JSON.stringify(r).includes("signed-person-1"), "nor is it given back");
  assert.match(get(r, "cookie-flags").text, /header from the host/);
});

await step("the pages reach nothing else on this computer", async () => {
  let hits = 0;
  const private_ = http.createServer((_q, res) => (hits++, res.end("secret")));
  await new Promise<void>((r) => private_.listen(4703, "127.0.0.1", r));
  await run({ body: '<img src="http://127.0.0.1:4703/x.gif" alt="x"><script>fetch("http://localhost:4703/y", { mode: "no-cors" }).catch(() => {})</script>' });
  private_.close();
  assert.equal(hits, 0);
});

await step("an app that asks for a sign-in the check was not given is not said to have none", async () => {
  const r = await run({ body: '<form method="post" action="/in"><label>Password <input type="password" name="p"></label><button>Sign in</button></form>', input: { signedIn: undefined } });
  assert.equal(get(r, "cross-site-forms").state, "notRun", text(r));
  assert.equal(get(r, "cookie-flags").state, "notRun", text(r));
});

await step("the keyboard held in one place is found", async () => {
  const r = await run({ body: '<p><button type="button">One</button> <button type="button" id="hold">Two</button> <button type="button">Three</button></p><script>document.getElementById("hold").addEventListener("keydown", (e) => e.key === "Tab" && e.preventDefault())</script>' });
  assert.deepEqual(of(r, "failed"), ["focus-visible"], text(r));
  assert.match(get(r, "focus-visible").details!.join("\n"), /does not get past button "Two"/);
});

await step("forms are not posted to an app that is not a throwaway copy", async () => {
  const r = await run({ openForm: true, input: { throwaway: false } });
  assert.equal(get(r, "cross-site-forms").state, "notRun");
  assert.match(get(r, "cross-site-forms").text, /throwaway/);
});

await step("with no browser and with no app, every line could not run and says why", async () => {
  const none = await run({ input: { browser: null } });
  assert.equal(none.ok, true);
  assert.deepEqual(of(none, "notRun"), LINE_IDS);
  assert.match(none.lines[0].text, /Could not run: no browser here/);
  const bad = await run({ input: { browser: "/nonexistent/chrome" } });
  assert.deepEqual(of(bad, "notRun"), LINE_IDS, text(bad));
  assert.match(bad.lines[0].text, /Could not run: The browser did not start/);
  const gone = await checkPages({ address: "http://localhost:4709" });
  assert.deepEqual(of(gone, "notRun"), LINE_IDS);
  assert.match(gone.lines[0].text, /did not answer.*ECONNREFUSED/);
  assert.deepEqual(profiles(), []);
});

await step("a page too slow to load fails nothing", async () => {
  const r = await run({ input: { signedIn: undefined, loadMs: 1500, pages: ["/slow"] }, routes: { "/slow": () => {} } });
  assert.deepEqual(of(r, "failed"), [], text(r));
  assert.ok(of(r, "notRun").includes("contrast"), text(r));
});

await step("stopped half-way, and out of time: the browser is closed, its folder gone, nothing claimed", async () => {
  const stop = new AbortController();
  const r = await run({ input: { signal: stop.signal, onStep: (s) => s.startsWith("Looking at /about") && setTimeout(() => stop.abort(), 300) } });
  assert.ok(of(r, "notRun").length > 15, text(r));
  assert.match(get(r, "links").text, /stopped/);
  assert.deepEqual(profiles(), []);
  if (linux) assert.deepEqual(holding(`hydor-pagecheck-${process.pid}-`), []);
  const late = await run({ input: { totalMs: 2500 } });
  assert.ok(of(late, "notRun").length > 0, text(late));
  assert.match(late.lines.find((l) => l.state === "notRun")!.text, /ran out of time/);
  assert.deepEqual(profiles(), []);
});

await step("closing never throws when the folder cannot be taken away: it gives a sentence", async () => {
  const b = await CheckBrowser.launch(program, []);
  const stuck = fs.mkdtempSync(`${os.tmpdir()}/pagechecks-stuck-`);
  fs.mkdirSync(`${stuck}/inner`);
  fs.writeFileSync(`${stuck}/inner/file`, "x");
  fs.chmodSync(`${stuck}/inner`, 0o555);
  const profile = b.profile;
  (b as unknown as { profile: string }).profile = `${stuck}/inner`;
  b.cleanupAttempts = 2;
  try {
    const note = await b.close();
    if (process.getuid?.() !== 0) assert.match(note!, /temporary folder .* could not be removed .* it is safe to delete/);
  } finally {
    fs.chmodSync(`${stuck}/inner`, 0o755);
    fs.rmSync(stuck, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

await step("when its program is killed outright, the browser ends by itself and the next run takes the folder away", async () => {
  const child = spawn(process.execPath, [process.argv[1], "hold"], { stdio: ["ignore", "pipe", "inherit"] });
  const said = await new Promise<{ pid: number; profile: string }>((resolve, reject) => {
    let out = "";
    child.stdout!.on("data", (d) => ((out += d), out.includes("\n") && resolve(JSON.parse(out.split("\n")[0]))));
    child.on("exit", () => reject(new Error(`the child ended: ${out}`)));
  });
  child.kill("SIGKILL");
  if (linux) {
    for (let i = 0; i < 200 && holding(said.profile).length; i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(holding(said.profile), [], "no process of the browser is left");
  } else execFileSync("sleep", ["5"]);
  for (let i = 0; i < 30; i++) {
    if (child.exitCode !== null || child.signalCode) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(sweepProfiles().some((n) => said.profile.endsWith(n)));
  assert.equal(fs.existsSync(said.profile), false);
});

elsewhere.close();
console.log(`\n${passed} checks passed.`);
process.exit(0);
