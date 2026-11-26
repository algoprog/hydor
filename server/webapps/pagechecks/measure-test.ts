// The measuring functions of the page checks, each on its own: no browser, no network.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/pagechecks/measure-test.ts
//   DATA_DIR=<scratch folder> node dist/dev/measure-test.js
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { examplesOf, LINE_IDS } from "./lines.ts";
import {
  acts, brightness, compressedSize, isDevPart, judgeTaps, keysReadIn, pixelsStrong, spacedEnough, contrastNeeded, contrastRatio, cookiePairs, decodePng, downloadKind, isFile, isSignInPath, isTokenField, judgeCrossSite, onApp, over, overBudget,
  pageKind, parseSetCookie, pixelsChanged, PUBLIC_BUDGET, sampleBox, scrub, secretsIn, type TapTarget, textContrast, weigh,
} from "./measure.ts";

let passed = 0;
const step = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

step("contrast is WCAG's, with the text laid over what is behind it", () => {
  assert.equal(Math.round(contrastRatio([0, 0, 0], [255, 255, 255])), 21);
  assert.equal(contrastRatio([118, 118, 118], [255, 255, 255]).toFixed(2), "4.54");
  assert.deepEqual(over([0, 0, 0, 0.5], [255, 255, 255]), [127.5, 127.5, 127.5]);
  assert.equal(contrastNeeded(16, 400), 4.5);
  assert.equal(contrastNeeded(24, 400), 3);
  assert.equal(contrastNeeded(19, 700), 3);
  assert.equal(contrastNeeded(19, 400), 4.5);
  // a line through a few points does not decide; a picture half dark does
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  assert.ok(textContrast([0, 0, 0, 1], [black, ...Array(20).fill(white)]) > 20);
  assert.ok(textContrast([0, 0, 0, 1], [...Array(10).fill(black), ...Array(10).fill(white)]) < 1.1);
});

/** A PNG as an encoder would write it, one filter per row, to read back. */
function png(width: number, height: number, channels: 3 | 4, pixel: (x: number, y: number) => number[]): Buffer {
  const stride = width * channels;
  const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => pixel(x, y)).flat());
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const filter = y % 5;
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y][x - channels] : 0;
      const b = y ? rows[y - 1][x] : 0;
      const c = y && x >= channels ? rows[y - 1][x - channels] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      raw[y * (stride + 1) + 1 + x] = (rows[y][x] - [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
    }
  }
  const chunk = (kind: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(kind, 4, "latin1");
    return Buffer.concat([head, body, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

step("a screenshot is read back pixel for pixel, whatever filter a row has; boxes are sampled and pictures compared", () => {
  for (const channels of [3, 4] as const) {
    const pixel = (x: number, y: number) => [(x * 37 + y * 11) % 256, (x * 5 + y * 91) % 256, (x + y) % 256, 255].slice(0, channels);
    const p = decodePng(png(9, 11, channels, pixel));
    assert.deepEqual([p.width, p.height, p.channels], [9, 11, channels]);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 9; x++) assert.deepEqual([...p.data.subarray((y * 9 + x) * channels, (y * 9 + x + 1) * channels)], pixel(x, y));
  }
  const a = decodePng(png(20, 10, 3, (x) => (x < 10 ? [255, 0, 0] : [0, 0, 255])));
  assert.deepEqual(sampleBox(a, { x: 0, y: 0, width: 10, height: 10 }, 2, 1), [[255, 0, 0], [255, 0, 0]]);
  assert.deepEqual(sampleBox(a, { x: 15, y: 0, width: 10, height: 10 }, 2, 1), [[0, 0, 255]]);
  assert.equal(pixelsChanged(a, a), 0);
  assert.equal(pixelsChanged(a, decodePng(png(20, 10, 3, (x, y) => (y === 0 ? [0, 0, 0] : x < 10 ? [255, 0, 0] : [0, 0, 255])))), 20);
  assert.throws(() => decodePng(Buffer.from("not a picture, not at all, nothing like one")), /Not a PNG/);
});

const tap = (what: string, x: number, y: number, width: number, height: number, o: Partial<TapTarget> = {}): TapTarget => ({ what, width, height, iconOnly: false, box: { x, y, width, height }, ...o });
const names = (list: { what: string }[]) => list.map((t) => t.what);

step("under 24 px either way fails only when crowded, as the standard's spacing exception words it", () => {
  // alone: the 24 px circle touches nothing
  assert.deepEqual(names(judgeTaps([tap("alone", 0, 0, 18, 18)]).failed), []);
  assert.deepEqual(names(judgeTaps([tap("alone", 0, 0, 18, 18)]).small), ["alone"]);
  // two undersized: their circles meet when the centres are under 24 px apart
  assert.deepEqual(names(judgeTaps([tap("a", 0, 0, 18, 18), tap("b", 22, 0, 18, 18)]).failed), ["a", "b"]);
  assert.deepEqual(names(judgeTaps([tap("a", 0, 0, 18, 18), tap("b", 24, 0, 18, 18)]).failed), []);
  // the circle may not reach into a big neighbour: 12 px from the centre
  assert.equal(spacedEnough(tap("s", 0, 0, 18, 18), [tap("big", 0, 20, 200, 44)]), false);
  assert.equal(spacedEnough(tap("s", 0, 0, 18, 18), [tap("big", 0, 22, 200, 44)]), true);
  // either way: wide enough but low, or high but narrow
  assert.deepEqual(names(judgeTaps([tap("low", 0, 0, 80, 20), tap("near", 0, 21, 80, 44)]).failed), ["low"]);
  assert.deepEqual(names(judgeTaps([tap("narrow", 0, 0, 20, 44), tap("near", 21, 0, 80, 44)]).failed), ["narrow"]);
  assert.deepEqual(names(judgeTaps([tap("24", 0, 0, 24, 24), tap("near", 25, 0, 24, 24)]).failed), []);
  // left out: in a sentence, the browser's own size; another layer (a fixed bar) and a control inside another are not neighbours
  const crowd = tap("n", 0, 21, 80, 44);
  assert.deepEqual(names(judgeTaps([tap("in a sentence", 0, 0, 80, 18, { inline: true }), crowd]).failed), []);
  assert.deepEqual(names(judgeTaps([tap("plain box", 0, 0, 13, 13, { asBrowser: true }), crowd]).failed), []);
  assert.deepEqual(names(judgeTaps([tap("s", 0, 0, 18, 18), tap("bar", 0, 20, 200, 44, { layer: 1 })]).failed), []);
  assert.deepEqual(names(judgeTaps([tap("inner", 10, 10, 20, 20), tap("outer", 0, 0, 200, 60)]).failed), []);
  // a sentence's link is still a neighbour of others
  assert.deepEqual(names(judgeTaps([tap("s", 0, 0, 18, 18), tap("link", 0, 20, 80, 18, { inline: true })]).failed), ["s"]);
});

step("between the minimum and 40 px is only small, smallest first; words may be narrow, an icon may not", () => {
  const r = judgeTaps([tap("38", 0, 0, 80, 38), tap("25", 0, 100, 80, 25), tap("40", 0, 200, 80, 40), tap("word", 0, 300, 30, 44), tap("icon", 0, 400, 30, 44, { iconOnly: true })]);
  assert.deepEqual([names(r.failed), names(r.small)], [[], ["25", "icon", "38"]]);
});

step("a visit is weighed once compressed, by kind, against its budget", () => {
  assert.equal(downloadKind("Script", "text/javascript"), "scripts");
  assert.equal(downloadKind("Fetch", "font/woff2"), "fonts");
  assert.equal(downloadKind("Document", "text/html"), "page");
  const body = Buffer.from("a".repeat(100_000));
  assert.ok(compressedSize(100_300, "text/javascript", body) < 1000);
  assert.equal(compressedSize(100_300, "image/png", body), 100_300);
  assert.equal(compressedSize(90, "text/javascript", body), 90); // sent compressed already, and better
  const w = weigh([{ kind: "page", size: 10_000, wire: 40_000 }, { kind: "scripts", size: 300_000, wire: 900_000 }, { kind: "pictures", size: 200_000, wire: 200_000 }]);
  assert.deepEqual([w.total, w.scripts, w.pictures, w.fonts, w.wire, w.requests], [510_000, 300_000, 200_000, 0, 1_140_000, 3]);
  assert.deepEqual(overBudget(w, PUBLIC_BUDGET), ["510 kB in all where the budget is 450 kB", "300 kB of scripts where the budget is 280 kB"]);
});

step("keys are found however they are written, and taken out of what is shown", () => {
  const secrets = [{ name: "API_KEY", value: "sk-test/abc+123456" }, { name: "SHORT", value: "abc" }];
  assert.deepEqual(secretsIn("x sk-test/abc+123456 y", secrets), ["API_KEY"]);
  assert.deepEqual(secretsIn(`?k=${encodeURIComponent(secrets[0].value)}`, secrets), ["API_KEY"]);
  assert.deepEqual(secretsIn(Buffer.from(secrets[0].value).toString("base64"), secrets), ["API_KEY"]);
  assert.deepEqual(secretsIn("abc", secrets), []);
  assert.equal(scrub(`error at ?k=${encodeURIComponent(secrets[0].value)} and sk-test/abc+123456`, secrets), "error at ?k=«API_KEY» and «API_KEY»");
});

step("cookies are read with what protects them", () => {
  assert.deepEqual(parseSetCookie("sid=abc123; Path=/; HttpOnly; SameSite=Lax"), { name: "sid", value: "abc123", httpOnly: true, secure: false, sameSite: "lax", gone: false });
  assert.equal(parseSetCookie("sid=; Max-Age=0")?.gone, true);
  assert.equal(parseSetCookie("a=1; Secure; SameSite=None")?.sameSite, "none");
  assert.equal(parseSetCookie("nonsense"), null);
  assert.deepEqual(cookiePairs("a=1; b=x=y"), [{ name: "a", value: "1" }, { name: "b", value: "x=y" }]);
});

step("addresses that act or are files are not followed as pages, and one page of a kind is enough", () => {
  for (const a of ["/sign-out", "/logout", "/jobs/4/delete", "/x?action=delete", "/api/remove/3"]) assert.ok(acts(a), a);
  for (const a of ["/jobs", "/deliveries", "/removals-policy", "/undeleted-items"]) assert.ok(!acts(a), a);
  assert.ok(isFile("/export.csv") && isFile("/a/photo.JPG") && !isFile("/jobs/4") && !isFile("/v1.2/notes"));
  assert.ok(isSignInPath("/sign-in") && isSignInPath("/auth/login") && !isSignInPath("/authors"));
  assert.equal(onApp(new URL("http://localhost:4000"), "//elsewhere.example/x?a=1").host, "localhost:4000");
  assert.equal(onApp(new URL("http://localhost:4000/sub"), "jobs").href, "http://localhost:4000/jobs");
  assert.equal(pageKind("/jobs/12"), pageKind("/jobs/13"));
  assert.equal(pageKind("/notes/3f2a9c1b7d4e"), pageKind("/notes/aaaa1111bbbb"));
  assert.notEqual(pageKind("/jobs"), pageKind("/notes"));
  assert.equal(pageKind("/stock?sort=a"), pageKind("/stock?sort=b"));
  assert.notEqual(pageKind("/stock"), pageKind("/stock/new"));
});

step("what a form from another site was answered is judged, asking for the app's own post only when it must", () => {
  assert.equal(judgeCrossSite({ status: 403 }), "refused");
  assert.equal(judgeCrossSite({ status: 303, location: "/jobs" }), "accepted");
  assert.equal(judgeCrossSite({ status: 200 }), "accepted");
  assert.equal(judgeCrossSite({ status: 303, location: "/sign-in?next=%2Fjobs" }), "refused");
  assert.equal(judgeCrossSite({ status: 400 }), null);
  assert.equal(judgeCrossSite({ status: 400 }, { status: 303, location: "/jobs" }), "refused");
  assert.equal(judgeCrossSite({ status: 400 }, { status: 400 }), "unclear");
  assert.equal(judgeCrossSite({ status: 404 }), "unclear");
  assert.equal(judgeCrossSite({ status: 500 }), "unclear");
  assert.ok(isTokenField("_csrf", "x") && isTokenField("t", "9f8a7b6c5d4e3f2a1b0c9d8e7f6a") && !isTokenField("id", "42") && !isTokenField("note", "call the customer about the roof"));
});

step("a line counts the different things and gives at most three, each once with its pages", () => {
  const items = [{ page: "/", thing: "x" }, { page: "/a", signedIn: true, thing: "x" }, { page: "/b", thing: "y" }];
  assert.deepEqual(examplesOf(items), { count: 2, items: [items[0], items[2]], details: ["/ and 1 more page: x", "/b: y"] });
  const many = examplesOf(Array.from({ length: 17 }, (_, i) => ({ page: "/", thing: `t${i}` })));
  assert.deepEqual([many.count, many.items.length, many.details.length], [17, 3, 3]);
});

step("a faint mark is told from a strong one, and a dark picture from a light one", () => {
  const flat = (v: number) => decodePng(png(10, 10, 3, () => [v, v, v]));
  assert.equal(pixelsChanged(flat(255), flat(232)), 100);
  assert.equal(pixelsStrong(flat(255), flat(232)), 0);
  assert.equal(pixelsStrong(flat(255), flat(60)), 100);
  assert.ok(brightness(flat(255)) > 0.9 && brightness(flat(17)) < 0.05);
});

step("a script that reads a key by name is seen, and a development server's parts", () => {
  const keys = ["STRIPE_KEY", "APP_SECRET", "a.b"];
  assert.deepEqual(keysReadIn("fetch(x, process.env.STRIPE_KEY)", keys), ["STRIPE_KEY"]);
  assert.deepEqual(keysReadIn("const s = import.meta.env['APP_SECRET']; env?.STRIPE_KEY", keys), ["STRIPE_KEY", "APP_SECRET"]);
  assert.deepEqual(keysReadIn("// set STRIPE_KEY first; myenv.STRIPE_KEYS; process.env.STRIPE_KEY_PUBLIC", keys), []);
  for (const u of ["/@vite/client", "/@react-refresh", "/__webpack_hmr", "http://localhost:35729/livereload.js", "/_next/webpack-hmr"]) assert.ok(isDevPart(u), u);
  for (const u of ["/app.js", "/vite/clients.js", "/reload.js"]) assert.ok(!isDevPart(u), u);
});

step("the lines' ids, in their order: a page shows the same line getting fixed by its id", () => {
  assert.deepEqual(LINE_IDS, [
    "phone-sideways", "phone-text", "phone-tap", "phone-hidden",
    "contrast", "page-title", "page-description", "page-language", "main-heading", "heading-order", "picture-words", "field-labels", "control-names", "focus-visible", "mouse-only",
    "weight-first", "weight-inner", "other-sites", "slowest",
    "browser-keys", "dev-parts", "headers", "cross-site-forms", "cookie-flags",
    "pages-answer", "links", "console-errors", "pictures-load",
  ]);
});

console.log(`\n${passed} checks passed.`);
