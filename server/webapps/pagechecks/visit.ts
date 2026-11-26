// One page, opened as a phone and as a desktop, each in a browser context of its own with nothing cached: what is read from it, what
// it fetched, and what of the given keys turned up. Nothing is judged here but pixels (contrast, the focus mark); lines.ts judges.
import { type CheckBrowser, type Request, Tab, type TabOptions } from "./browser.ts";
import * as page from "./in-page.ts";
import { brightness, compressedSize, contrastNeeded, decodePng, downloadKind, type DownloadKind, FOCUS_PIXELS, hexOf, onApp, keysReadIn, over, PHONE_WIDTH, pixelsChanged, pixelsStrong, sampleBox, type Secret, secretsIn, type TapTarget, textContrast, TEXT_MIN, TAP_MIN } from "./measure.ts";

export interface Download {
  url: string;
  kind: DownloadKind;
  /** Once compressed. */
  size: number;
  wire: number;
  ms: number | null;
}

export interface Fetched {
  url: string;
  type: string;
  kind: DownloadKind;
  status: number;
  failed?: string;
  /** From another site than the app's. */
  other: boolean;
}

export interface LowContrast {
  what: string;
  words: string;
  ratio: number;
  need: number;
  look: "light" | "dark";
  color: string;
  behind: string;
}

export interface PageSeen {
  /** The address asked for (path and query). */
  path: string;
  signedIn: boolean;
  /** Where it ended up, after redirects: the path, or a whole address when it left the app. */
  final: string;
  status: number | null;
  html: boolean;
  headers: Record<string, string>;
  /** Why it could not be read: "slow" is the machine's or the page's slowness, never a failure. */
  problem?: string;
  phone?: {
    facts: page.PhoneFacts;
    taps: TapTarget[];
    hidden: { what: string; by: string }[];
    errors: string[];
    downloads: Download[];
    broken: string[];
  };
  desktop?: {
    reading: page.ReadingFacts;
    contrast: LowContrast[] | null;
    texts: number;
    hasDark: boolean;
    focus: { stops: number; missing: string[]; faint: string[]; trap: string | null } | null;
    mouse: string[] | null;
  };
  fetched: Fetched[];
  setCookies: string[];
  /** Areas that could not be looked at, with why. */
  unread: string[];
}

export interface Found {
  name: string;
  /** Not the value but a script that reads it by name. */
  read?: boolean;
  /** The file a browser got it in. */
  file: string;
}

export interface VisitCtx {
  browser: CheckBrowser;
  base: URL;
  origins: string[];
  cookies: TabOptions["cookies"];
  headers: () => Record<string, string>;
  secrets: Secret[];
  /** The names of every key given, however short its value. */
  names: string[];
  found: Found[];
  /** Files of the app's own whose text names more files (source maps, parts loaded later). */
  texts: Map<string, string>;
  loadMs: number;
  check: () => void;
}

export const shortUrl = (url: string, origins: string[]): string => {
  try {
    const u = new URL(url);
    if (origins.includes(u.origin)) return u.pathname + u.search;
    return u.protocol === "data:" ? "data:…" : `${u.origin}${u.pathname}`.slice(0, 160);
  } catch {
    return url.slice(0, 160);
  }
};

const isOther = (url: string, origins: string[]): boolean => {
  try {
    const u = new URL(url);
    return /^(https?|wss?):$/.test(u.protocol) && !origins.includes(u.origin.replace(/^ws/, "http"));
  } catch {
    return false;
  }
};

/** Notes the keys a script (a file of its own, or one in a page) reads by name. */
export function noteKeysRead(text: string, mime: string, file: string, names: string[], found: Found[]): void {
  const script = /javascript|ecmascript/i.test(mime) ? text : /html/i.test(mime) ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n") : "";
  for (const name of script ? keysReadIn(script, names) : []) if (!found.some((f) => f.name === name && f.file === file && f.read)) found.push({ name, file, read: true });
}

export const TEXTUAL = /^text\/|javascript|ecmascript|json|xml|svg|manifest/i;

/** Looks for the keys in what a tab got, and what it sent to other sites. */
async function harvest(ctx: VisitCtx, tab: Tab, seen: PageSeen) {
  for (const r of tab.requests) {
    if (r.url.startsWith("data:")) continue;
    const other = isOther(r.url, ctx.origins);
    const file = shortUrl(r.url, ctx.origins);
    if (!seen.fetched.some((f) => f.url === file && f.status === r.status)) seen.fetched.push({ url: file, type: r.type, kind: downloadKind(r.type, r.mime), status: r.status, ...(r.failed ? { failed: r.failed } : {}), other });
    if (!ctx.secrets.length && !ctx.names.length) continue;
    const note = (name: string) => {
      const shown = other ? `the address sent to ${file}` : file;
      if (!ctx.found.some((f) => f.name === name && f.file === shown)) ctx.found.push({ name, file: shown });
    };
    if (other) {
      secretsIn(r.sent, ctx.secrets).forEach(note);
      continue;
    }
    secretsIn(JSON.stringify(r.headers), ctx.secrets).forEach(note);
    const body = await r.body;
    if (!body) continue;
    const text = body.toString("utf8");
    secretsIn(text, ctx.secrets).forEach(note);
    noteKeysRead(text, r.mime, file, ctx.names, ctx.found);
  }
  for (const r of tab.requests) {
    if (isOther(r.url, ctx.origins) || r.url.startsWith("data:") || !TEXTUAL.test(r.mime) || ctx.texts.has(r.url) || ctx.texts.size >= 300) continue;
    const body = await r.body;
    if (body && body.length < 4_000_000) ctx.texts.set(r.url, body.toString("utf8"));
  }
  seen.setCookies.push(...tab.setCookies.filter((c) => !seen.setCookies.includes(c)));
}

async function downloads(ctx: VisitCtx, requests: Request[]): Promise<Download[]> {
  const out: Download[] = [];
  for (const r of requests) {
    if (r.url.startsWith("data:") || r.url.startsWith("blob:") || r.status === 0 || (r.status >= 300 && r.status < 400)) continue;
    const body = await r.body;
    out.push({ url: shortUrl(r.url, ctx.origins), kind: downloadKind(r.type, r.mime), size: compressedSize(r.wire, r.mime, body), wire: r.wire, ms: r.endedAt === null ? null : Math.round(r.endedAt - r.startedAt) });
  }
  return out;
}

async function contrast(tab: Tab, look: "light" | "dark"): Promise<{ low: LowContrast[]; texts: number }> {
  const low: LowContrast[] = [];
  let texts = 0;
  await tab.evaluate(page.forgetRuns);
  const size = await tab.evaluate(page.pageSize);
  const step = Math.max(200, size.view - 100);
  for (let y = 0, screens = 0; screens < 8 && y < size.height; y += step, screens++) {
    await tab.evaluate(page.scrollToY, y);
    const runs = await tab.evaluate(page.textRuns);
    if (!runs.length) continue;
    await tab.evaluate(page.hideWords, true);
    const shot = decodePng(await tab.screenshot());
    await tab.evaluate(page.hideWords, false);
    for (const run of runs) {
      const behind = run.boxes.flatMap((b) => sampleBox(shot, b));
      if (!behind.length) continue;
      texts++;
      const ratio = textContrast(run.color, behind);
      const need = contrastNeeded(run.px, run.weight);
      if (ratio >= need - 0.05) continue;
      const middle = behind[Math.floor(behind.length / 2)];
      low.push({ what: run.what, words: run.words, ratio: Math.round(ratio * 100) / 100, need, look, color: hexOf(over(run.color, middle)), behind: hexOf(middle) });
    }
  }
  await tab.evaluate(page.scrollToY, 0);
  return { low, texts };
}

/** Walks the page with the Tab key and, at each stop, compares the control's picture with and without the focus. */
async function keyboard(tab: Tab, check: () => void): Promise<{ stops: number; missing: string[]; faint: string[]; trap: string | null }> {
  const missing: string[] = [];
  const faint: string[] = [];
  let stops = 0;
  let stuck = 0;
  let trap: string | null = null;
  await tab.evaluate(page.scrollToY, 0);
  await tab.evaluate(page.blurNow);
  for (let i = 0; i < 80 && stops < 30; i++) {
    check();
    await tab.key("Tab", 9);
    const at = await tab.evaluate(page.focused);
    if (!at) break;
    // the same one again: a date's parts, or a control that keeps the key
    if (at.same) {
      if (++stuck >= 8) {
        trap = at.what;
        break;
      }
      continue;
    }
    stuck = 0;
    // back to the first: all the way round. Back to a later one, outside a box that is meant to keep the keyboard: held there.
    if (at.again) {
      if (!at.first && !at.inDialog) trap = at.what;
      break;
    }
    stops++;
    if (at.frame) continue;
    if (at.clip.width < 2 || at.clip.height < 2) {
      missing.push(`${at.what} (it cannot be seen at all)`);
      continue;
    }
    await tab.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const withFocus = decodePng(await tab.screenshot(at.clip));
    await tab.evaluate(page.blurNow);
    const without = decodePng(await tab.screenshot(at.clip));
    await tab.evaluate(page.focusAgain);
    if (pixelsChanged(withFocus, without) < FOCUS_PIXELS) missing.push(at.what);
    else if (pixelsStrong(withFocus, without) < FOCUS_PIXELS) faint.push(at.what);
  }
  return { stops, missing, faint, trap };
}

async function mouse(tab: Tab): Promise<string[]> {
  // Click listeners added by scripts are not in the page's text: the browser's debugger names the elements that have them.
  const doc = (await tab.send("Runtime.evaluate", { expression: "document.body" })).result?.objectId;
  if (doc) {
    const { listeners } = await tab.send("DOMDebugger.getEventListeners", { objectId: doc, depth: -1 });
    const nodes = [...new Set((listeners as { type: string; backendNodeId?: number }[]).filter((l) => /^(click|dblclick|mousedown|mouseup|pointerdown|pointerup)$/.test(l.type) && l.backendNodeId).map((l) => l.backendNodeId!))];
    for (const backendNodeId of nodes.slice(0, 200)) {
      const node = await tab.send("DOM.resolveNode", { backendNodeId }).catch(() => null);
      if (node?.object?.objectId) await tab.send("Runtime.callFunctionOn", { objectId: node.object.objectId, functionDeclaration: "function () { this.setAttribute && this.setAttribute('data-pc-click', '') }" });
    }
  }
  return tab.evaluate(page.mouseOnly);
}

export async function visit(ctx: VisitCtx, path: string, signedIn: boolean): Promise<PageSeen> {
  const seen: PageSeen = { path, signedIn, final: path, status: null, html: false, headers: {}, fetched: [], setCookies: [], unread: [] };
  const url = onApp(ctx.base, path).href;
  const options = () => ({ origins: ctx.origins, ...(signedIn ? { cookies: ctx.cookies, headers: ctx.headers() } : {}) });
  const area = async <T>(what: string, fn: () => Promise<T>): Promise<T | null> => {
    ctx.check();
    try {
      return await fn();
    } catch (e) {
      ctx.check();
      seen.unread.push(`${what}: ${(e as Error).message.split("\n")[0].slice(0, 200)}`);
      return null;
    }
  };
  const load = async (tab: Tab): Promise<boolean> => {
    const went = await tab.goto(url, ctx.loadMs);
    const doc = tab.document();
    if (doc) {
      seen.status = doc.status;
      seen.headers = doc.headers;
      seen.html = /html/i.test(doc.mime);
    }
    if (went !== "ok") {
      // A load cut short (by the page itself, or by this computer) judges nothing; a server that drops or loops does.
      seen.problem = went === "slow" || /ERR_(ABORTED|BLOCKED_BY|NETWORK_CHANGED|INSUFFICIENT_RESOURCES|TIMED_OUT|CONNECTION_TIMED_OUT)/.test(went.error) ? "slow" : went.error;
      return false;
    }
    const at = await tab.evaluate(() => location.href);
    seen.final = at.startsWith("chrome-error:") ? path : shortUrl(at, ctx.origins);
    await tab.evaluate(page.helpers);
    return !at.startsWith("chrome-error:") && seen.final.startsWith("/");
  };

  // ---- the phone: what a first visit downloads, and how it sits under a thumb
  ctx.check();
  let tab = await Tab.open(ctx.browser, { ...options(), width: PHONE_WIDTH, height: 844, phone: true });
  try {
    const ok = await load(tab);
    if (!ok || !seen.html) {
      await harvest(ctx, tab, seen);
      return seen;
    }
    const first = await downloads(ctx, [...tab.requests]);
    const errors = () => [...new Set(tab.errors)];
    const facts = await area("the phone's layout", () => tab.evaluate(page.phoneFacts, PHONE_WIDTH, TEXT_MIN));
    await area("stilling the page", () => tab.evaluate(page.still));
    const taps = await area("what is tapped", () => tab.evaluate(page.tapTargets, TAP_MIN));
    const hidden = await area("what is behind fixed things", () => tab.evaluate(page.hiddenBehindFixed));
    const broken = await area("pictures", async () => {
      await tab.evaluate(page.scrollThrough);
      await tab.quiet(300, 3000);
      return tab.evaluate(page.brokenPictures);
    });
    if (facts) seen.phone = { facts, taps: taps ?? [], hidden: hidden ?? [], errors: errors(), downloads: first, broken: broken ?? [] };
    await harvest(ctx, tab, seen);
  } finally {
    await tab.close();
  }

  // ---- the desktop: reading, colours, the keyboard, what only a mouse can do
  ctx.check();
  tab = await Tab.open(ctx.browser, { ...options(), width: 1280, height: 900 });
  try {
    if (await load(tab)) {
      const reading = await area("the page's words", () => tab.evaluate(page.readingFacts));
      await area("stilling the page", () => tab.evaluate(page.still));
      let texts = 0;
      let hasDark = false;
      const low = await area("contrast", async () => {
        const light = await contrast(tab, "light");
        texts = light.texts;
        const before = decodePng(await tab.screenshot());
        await tab.scheme("dark");
        await tab.evaluate(page.scrollToY, 0);
        await tab.quiet(300, 2000);
        const after = decodePng(await tab.screenshot());
        hasDark = pixelsChanged(before, after) > before.width * before.height * 0.2;
        let dark = hasDark ? await contrast(tab, "dark") : { low: [] as LowContrast[], texts: 0 };
        await tab.scheme("light");
        if (!hasDark) {
          // a dark look the page switches itself: a class or attribute on <html>
          await tab.evaluate(page.scrollToY, 0);
          await tab.quiet(300, 2000);
          const light2 = decodePng(await tab.screenshot());
          await tab.evaluate(page.darkSwitch, true);
          const switched = decodePng(await tab.screenshot());
          hasDark = pixelsChanged(light2, switched) > light2.width * light2.height * 0.2 && brightness(switched) < 0.2 && brightness(light2) > 0.4;
          if (hasDark) dark = await contrast(tab, "dark");
          await tab.evaluate(page.darkSwitch, false);
        }
        return [...light.low, ...dark.low];
      });
      const focus = await area("the keyboard", () => keyboard(tab, ctx.check));
      const mouseFound = await area("what only a mouse can do", () => mouse(tab));
      if (reading) seen.desktop = { reading, contrast: low, texts, hasDark, focus, mouse: mouseFound };
    }
    await harvest(ctx, tab, seen);
  } finally {
    await tab.close();
  }
  return seen;
}
