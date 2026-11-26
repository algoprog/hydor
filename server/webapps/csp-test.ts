// Checks for the content security policy of Hydor's own pages (server/csp.ts, which server/index.ts uses) and what it lets them
// frame (server/webapps/frames.ts): web apps at their own addresses and nothing wider, nothing at all while web apps are off,
// and the policy as it was for everything else. Run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/csp-test.ts && node dist/dev/csp-test.js
import assert from "node:assert/strict";
import { buildCsp } from "../csp.ts";
import { appFrameSources } from "./frames.ts";

let passed = 0;
const step = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};
const directive = (csp: string, name: string) => {
  const d = csp.split("; ").find((x) => x === name || x.startsWith(`${name} `));
  assert.ok(d, `${name} is in the policy`);
  return d!.split(" ").slice(1);
};
const off = { port: 0, origin: "", domain: "" };
const local = { port: 8792, origin: "", domain: "" };

// The policy before web apps, word for word, with the preview on its usual port.
const BEFORE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http://*:8791 https://*:8791",
  "media-src 'self' blob:",
  "frame-src 'self' blob: https://www.youtube-nocookie.com https://player.vimeo.com http://*:8791 https://*:8791",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

step("with web apps off, the policy is exactly what it was before them", () => {
  assert.equal(buildCsp({ previewPort: 8791, previewOrigin: "", apps: off }), BEFORE);
  assert.deepEqual(appFrameSources(off), []);
  assert.deepEqual(appFrameSources({ port: -1, origin: "", domain: "x.test" }), []);
});

step("on this computer, only the apps' hostnames under .localhost on the apps' port may be framed", () => {
  assert.deepEqual(appFrameSources(local), ["http://*.localhost:8792", "https://*.localhost:8792"]);
  const csp = buildCsp({ previewPort: 8791, previewOrigin: "", apps: local });
  const frame = directive(csp, "frame-src");
  assert.ok(frame.includes("http://*.localhost:8792"));
  assert.ok(frame.includes("https://*.localhost:8792"));
  // Nothing wider: no bare wildcard, no other port, and every other directive is as it was.
  assert.ok(!frame.includes("*") && !frame.includes("http:") && !frame.includes("https:"));
  const rest = (c: string) => c.split("; ").filter((d) => !d.startsWith("frame-src"));
  assert.deepEqual(rest(csp), rest(BEFORE));
  assert.deepEqual(directive(csp, "connect-src"), directive(BEFORE, "connect-src"));
  assert.deepEqual(directive(csp, "frame-ancestors"), ["'self'"]);
  assert.deepEqual(directive(csp, "script-src"), ["'self'"]);
});

step("the port follows APPS_PORT", () => {
  assert.deepEqual(appFrameSources({ port: 4400, origin: "", domain: "" }), ["http://*.localhost:4400", "https://*.localhost:4400"]);
  assert.ok(!buildCsp({ previewPort: 8791, previewOrigin: "", apps: { port: 4400, origin: "", domain: "" } }).includes("8792"));
});

step("with a domain, its subdomains too: the scheme and port APPS_ORIGIN gives, else the apps' port", () => {
  assert.deepEqual(appFrameSources({ port: 8792, origin: "", domain: "apps.example.org" }), [
    "http://*.localhost:8792",
    "https://*.localhost:8792",
    "http://*.apps.example.org:8792",
    "https://*.apps.example.org:8792",
  ]);
  assert.deepEqual(appFrameSources({ port: 8792, origin: "https://apps.example.org", domain: "apps.example.org" }), [
    "http://*.localhost:8792",
    "https://*.localhost:8792",
    "https://*.apps.example.org",
  ]);
  assert.deepEqual(appFrameSources({ port: 8792, origin: "http://apps.example.org:9000", domain: "apps.example.org" }).slice(2), ["http://*.apps.example.org:9000"]);
});

step("an origin without a domain (the path way) frames nothing more: that page runs in a sandbox and is opened in a tab", () => {
  assert.deepEqual(appFrameSources({ port: 8792, origin: "https://tunnel.example.org", domain: "" }), ["http://*.localhost:8792", "https://*.localhost:8792"]);
});

step("a domain that is not a hostname never reaches the policy", () => {
  for (const bad of ["x.test; script-src *", "a b.test", "*.test", "x.test/", "x", "https://x.test", "a..b.test", "-a.test", "x.test'"]) {
    const sources = appFrameSources({ port: 8792, origin: "", domain: bad });
    assert.deepEqual(sources, ["http://*.localhost:8792", "https://*.localhost:8792"], bad);
  }
  // An origin that is not a web address is ignored too.
  assert.deepEqual(appFrameSources({ port: 8792, origin: "javascript:alert(1)", domain: "apps.example.org" }).slice(2), ["http://*.apps.example.org:8792", "https://*.apps.example.org:8792"]);
  assert.deepEqual(appFrameSources({ port: 8792, origin: "not a url", domain: "apps.example.org" }).slice(2), ["http://*.apps.example.org:8792", "https://*.apps.example.org:8792"]);
});

step("the preview's own sources stay beside the apps'", () => {
  const csp = buildCsp({ previewPort: 8791, previewOrigin: "https://preview.example.org", apps: local });
  const frame = directive(csp, "frame-src");
  for (const s of ["'self'", "blob:", "https://www.youtube-nocookie.com", "https://player.vimeo.com", "http://*:8791", "https://*:8791", "https://preview.example.org", "http://*.localhost:8792"]) assert.ok(frame.includes(s), s);
  assert.ok(!buildCsp({ previewPort: 0, previewOrigin: "", apps: local }).includes(":8791"));
});

console.log(`all ${passed} steps passed`);
