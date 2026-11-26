// Checks for the scan of an app's own source for addresses that start with a slash (own-paths.ts): the forms it flags, the ones it
// leaves alone, the folders and files it skips, the five it names, and the line the contract check makes of it. No network, no browser.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/own-paths-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> node dist/dev/own-paths-test.js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkContract } from "./contract-check.ts";
import { addressesIn, scanOwnPaths } from "./own-paths.ts";

let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "own-paths-"));
let n = 0;
/** A folder with these files (path → text). */
const folder = (files: Record<string, string>): string => {
  const dir = path.join(scratch, `app${n++}`);
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const addresses = (text: string, ext: string) => addressesIn(text, ext).map((a) => a.address);

await step("markup: href, src, action, formaction, poster and srcset that start with one slash are flagged", () => {
  const html = `<a href="/notes">n</a> <img src='/img/x.png' srcset="a.png 1x, /big.png 2x"> <form action="/login"><button formaction="/other"></button></form> <video poster="/p.jpg"></video> <base href="/"> <a href=\\"/escaped\\">`;
  assert.deepEqual(new Set(addresses(html, ".html")), new Set(["/notes", "/img/x.png", "/big.png", "/login", "/other", "/p.jpg", "/", "/escaped"]));
  assert.deepEqual(addresses('<a href={"/x"}>x</a> <Link href="/y" />', ".jsx"), ["/x", "/y"]);
  assert.deepEqual(addresses('<meta http-equiv="refresh" content="0; url=/home">', ".html"), ["/home"]);
});

await step("css: url(/…) and @import \"/…\"", () => {
  assert.deepEqual(addresses('a { background: url(/img/x.png) } b { background: url("/y.png") } @import "/base.css"; @import url(/c.css);', ".css"), ["/img/x.png", "/y.png", "/base.css", "/c.css"]);
});

await step("scripts: fetch, axios, EventSource, WebSocket, XHR, location, history and baseURL", () => {
  const js = [
    'fetch("/api/notes")', "fetch(`/api/notes/${id}`)", "window.fetch('/w')", 'axios.get("/a")', 'axios.post("/b", {})', 'axios("/c")',
    'new EventSource("/events")', 'new WebSocket("/ws")', 'xhr.open("GET", "/d")', 'location.href = "/home"', 'window.location = "/e"', 'location.assign("/f")', 'location.replace("/g")',
    'history.pushState(null, "", "/h")', 'axios.create({ baseURL: "/api" })', '$.getJSON("/j")',
  ].join("\n");
  assert.deepEqual(addresses(js, ".js"), ["/api/notes", "/api/notes/${id}", "/w", "/a", "/b", "/c", "/events", "/ws", "/d", "/home", "/e", "/f", "/g", "/h", "/api", "/j"]);
  assert.equal(addresses('fetch("/x")', ".ts").length, 1);
  assert.equal(addresses('fetch("/x")', ".tsx").length, 1);
});

await step("server code: redirects in Express, Flask, Rails, Go, PHP and by header", () => {
  assert.deepEqual(addresses('res.redirect("/login"); res.redirect(302, "/home"); res.writeHead(302, { Location: "/" }); res.setHeader("location", "/x");', ".js"), ["/login", "/home", "/", "/x"]);
  assert.deepEqual(addresses('return redirect("/login")\nresp = Response(status=302, headers={"Location": "/y"})', ".py"), ["/login", "/y"]);
  assert.deepEqual(addresses('redirect_to "/home"\nredirect_to("/b")', ".rb"), ["/b"]);
  assert.deepEqual(addresses('http.Redirect(w, r, "/login", http.StatusFound)', ".go"), ["/login"]);
  assert.deepEqual(addresses('<?php header("Location: /home"); ?>', ".php"), ["/home"]);
});

await step("not flagged: relative, //host, #anchors, data:, mailto:, http(s):, routes, comparisons, and what is in comments", () => {
  const html = '<a href="notes">a</a><a href="./b">b</a><a href="../c">c</a><a href="//cdn.example.test/x.js">d</a><a href="#top">e</a><img src="data:image/png;base64,AAA/BBB"><a href="mailto:a@b.c">f</a><a href="https://example.test/g">g</a><a href="http://example.test/h">h</a><a href="">i</a><a href="tel:+30">j</a><form action="login">k</form>';
  assert.deepEqual(addresses(html, ".html"), []);
  assert.deepEqual(addresses('<!-- <a href="/gone">x</a> -->\n<a href="kept">k</a>', ".html"), []);
  const js = [
    'fetch("api/notes"); fetch("./a"); fetch("//cdn.example.test/x"); fetch("https://example.test/api"); fetch(`${base}/x`);',
    'app.get("/notes", (req, res) => res.send("ok")); router.post("/login", go); app.use("/static", s);',
    'if (location.href === "/x") {} if (location.pathname == "/y") {}',
    'const where = { location: "/shelf" }; item.location = "/z";',
    'res.redirect("notes"); res.redirect(`${prefix}/notes`); res.redirect("https://example.test/");',
    '// fetch("/commented")',
    '/* location.href = "/blocked"; */ const s = "http://example.test/x"; // res.redirect("/c2")',
    "const glob = 'src/*'; const ok = fetch('rel');",
    'api.get("/users", handler); axios_like.get("/q");',
  ].join("\n");
  assert.deepEqual(addresses(js, ".js"), []);
  assert.deepEqual(addresses('# redirect("/commented")\nx = 1', ".py"), []);
  assert.deepEqual(addresses('a { background: url(img/x.png) } b { background: url(data:image/png;base64,AA/BB) } /* url(/gone.png) */ @import "x.css"; @import url(//fonts.example.test/a.css);', ".css"), []);
});

await step("the scan reads the app's own files only: not node_modules, dist, build, .git, vendored, minified, tests or big files", () => {
  const bad = '<a href="/own">x</a>';
  const dir = folder({
    "index.html": bad,
    "src/app.js": 'fetch("/api/notes")\n',
    "node_modules/pkg/index.js": 'fetch("/skipped")',
    "dist/index.html": bad,
    "build/app.js": 'fetch("/skipped")',
    ".git/hooks/x.js": 'fetch("/skipped")',
    "vendor/lib.js": 'fetch("/skipped")',
    "public/vendor/lib.js": 'fetch("/skipped")',
    "public/app.min.js": 'fetch("/skipped")',
    "design/first.html": bad,
    "tests/a.js": 'fetch("/skipped")',
    "server-test.js": 'fetch("/skipped")',
    "big.js": `fetch("/skipped");\n${"// pad\n".repeat(80_000)}`,
    "long.js": `fetch("/skipped"); ${"x".repeat(2500)}`,
    "notes.md": "[x](/skipped) href=\"/skipped\"",
    "data.json": '{"href": "/skipped"}',
  });
  assert.ok(fs.statSync(path.join(dir, "big.js")).size > 512 * 1024);
  const r = scanOwnPaths(dir);
  assert.deepEqual(r.found.map((f) => `${f.file}:${f.line} ${f.address}`).sort(), ["index.html:1 /own", "src/app.js:1 /api/notes"]);
});

await step("lines are right, and an index.html that Vite rewrites is judged by its base", () => {
  const dir = folder({ "a.js": '\n\nconst x = 1;\nfetch("/third");\n' });
  assert.deepEqual(scanOwnPaths(dir).found, [{ file: "a.js", line: 4, address: "/third" }]);
  const html = '<script type="module" src="/src/main.ts"></script><link rel="icon" href="/favicon.ico">';
  const none = scanOwnPaths(folder({ "index.html": html, "vite.config.ts": "export default {};\n" }));
  assert.deepEqual(none.found.map((f) => f.file), ["vite.config.ts"]);
  assert.match(none.found[0].address, /base: '\.\/'/);
  const slash = scanOwnPaths(folder({ "index.html": html, "vite.config.js": 'export default {\n  base: "/",\n};\n' }));
  assert.deepEqual(slash.found.map((f) => `${f.file}:${f.line}`), ["vite.config.js:2"]);
  for (const base of ["./", "", "process.env.BASE"]) {
    const config = base === "process.env.BASE" ? "export default { base: process.env.BASE };" : `export default { base: "${base}" };`;
    assert.deepEqual(scanOwnPaths(folder({ "index.html": html, "vite.config.ts": config })).found, [], base);
  }
});

await step("the scan finds nothing in an app with relative addresses only, and says how many files it read", () => {
  const r = scanOwnPaths(folder({ "index.html": '<a href="notes">n</a><script src="app.js"></script>', "app.js": 'fetch("api/notes")' }));
  assert.deepEqual(r, { files: 2, found: [] });
  assert.deepEqual(scanOwnPaths(folder({})), { files: 0, found: [] });
});

await step("the contract check: names at most five, says why in a sentence, and is a warning that fails and stops nothing", async () => {
  const many = Array.from({ length: 8 }, (_, i) => `fetch("/api/n${i}");`).join("\n");
  const dir = folder({ "app.js": many });
  // No hydor.json: the check ends at its first line, so the scan is read alone from a folder that has one.
  fs.writeFileSync(path.join(dir, "hydor.json"), JSON.stringify({ start: "node server.js", env: { port: "PORT", data: "DATA_DIR" }, ready: "/health", signIn: "own" }));
  fs.writeFileSync(path.join(dir, "server.js"), "process.exit(1);\n");
  const r = await checkContract({ dir, build: false, readyMs: 500, ports: [4780, 4799] });
  const l = r.lines.find((x) => x.id === "paths")!;
  assert.equal(l.state, "failed");
  assert.equal(l.group, "pages");
  assert.equal(l.title, "It works under any path");
  assert.match(l.text, /^8 addresses of its own start with “\/”: app\.js:1 \/api\/n0; app\.js:2 \/api\/n1; app\.js:3 \/api\/n2; app\.js:4 \/api\/n3; app\.js:5 \/api\/n4 and 3 more\. They leave the app when Hydor shows it through a tunnel/);
  assert.equal(l.details?.length, 5);
  assert.match(l.hint!, /Make them relative/);
  // it came before the start, so a start that failed did not take it away; and it is no failure of the check's own
  assert.equal(r.lines.find((x) => x.id === "ready")!.state, "failed");
  assert.match(r.summary, /1 to fix/);
  const clean = folder({ "app.js": 'fetch("api/x")', "hydor.json": JSON.stringify({ start: "node server.js", env: { port: "PORT", data: "DATA_DIR" }, ready: "/health", signIn: "own" }), "server.js": "process.exit(1);\n" });
  const ok = await checkContract({ dir: clean, build: false, readyMs: 500, ports: [4780, 4799] });
  const line = ok.lines.find((x) => x.id === "paths")!;
  assert.equal(line.state, "passed");
  assert.equal(line.group, "pages");
  assert.match(line.text, /^None of its 2 source files writes an address of its own that starts with “\/”, so it works at any path\.$/);
});

fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} checks passed`);
