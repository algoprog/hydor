// The sums behind the page checks (index.ts), with no browser and no network: colours and contrast, the pixels of a picture, tap
// sizes and the room between them, a visit's weight against a budget, keys in files, cookie flags, which links to follow and what a
// form posted from another site was answered. Every function is pure, so each is tried on its own (pagechecks-test.ts).
import zlib from "node:zlib";

// ---- the sizes -----------------------------------------------------------------------------------------------------------------------

/** The width of the phone the pages are tried on. */
export const PHONE_WIDTH = 390;
/** Text under this many pixels is too small to read on a phone. */
export const TEXT_MIN = 12;
/** The web standard's least size for what is pressed, either way (WCAG 2.2, 2.5.8): under it, and crowded, fails. */
export const TAP_LEAST = 24;
/** What a thumb hits comfortably: smaller is worth a note, never a failure. */
export const TAP_MIN = 40;

// ---- colour --------------------------------------------------------------------------------------------------------------------------

export type Rgb = [number, number, number];
/** Red, green and blue 0–255, and how solid 0–1. */
export type Rgba = [number, number, number, number];

const linear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** WCAG 2 relative luminance. */
export const luminance = ([r, g, b]: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
/** WCAG 2 contrast ratio between two solid colours, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** A colour that lets some through, laid over what is behind it. */
export const over = ([r, g, b, a]: Rgba, under: Rgb): Rgb => [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)];
/** What WCAG AA asks of text: 4.5, or 3 when it is large (24 px, or 18.66 px in bold). */
export const contrastNeeded = (px: number, weight: number): number => (px >= 24 || (px >= 18.66 && weight >= 700) ? 3 : 4.5);
/**
 * The contrast of text against the pixels really behind it. A few points may fall on an edge or a line through the box, so the
 * answer is the one a fifth of the way up from the worst, not the single worst.
 */
export function textContrast(fg: Rgba, behind: Rgb[]): number {
  if (!behind.length) return 21;
  const all = behind.map((bg) => contrastRatio(over(fg, bg), bg)).sort((a, b) => a - b);
  return all[Math.floor(all.length / 5)];
}
export const hexOf = (c: Rgb): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

// ---- pictures of the page ------------------------------------------------------------------------------------------------------------

export interface Pixels {
  width: number;
  height: number;
  /** Bytes per pixel: 3 or 4. */
  channels: number;
  data: Buffer;
}

/** A PNG as Chromium writes its screenshots (8 bits, RGB or RGBA, not interlaced). */
export function decodePng(png: Buffer): Pixels {
  if (png.length < 33 || png.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG picture.");
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Buffer[] = [];
  for (let at = 8; at + 8 <= png.length; ) {
    const length = png.readUInt32BE(at);
    const kind = png.toString("latin1", at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (kind === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (body[8] !== 8 || !channels || body[12] !== 0) throw new Error("A kind of PNG that is not read here.");
    } else if (kind === "IDAT") parts.push(body);
    else if (kind === "IEND") break;
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? data[y * stride + x - channels] : 0;
      const up = y ? data[(y - 1) * stride + x] : 0;
      const corner = y && x >= channels ? data[(y - 1) * stride + x - channels] : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
        add = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      data[y * stride + x] = (raw[from + x] + add) & 255;
    }
  }
  return { width, height, channels, data };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Points spread over a box of the picture (those inside it), as colours. */
export function sampleBox(p: Pixels, box: Box, across = 7, down = 3): Rgb[] {
  const out: Rgb[] = [];
  for (let j = 0; j < down; j++)
    for (let i = 0; i < across; i++) {
      const x = Math.floor(box.x + ((i + 0.5) * box.width) / across);
      const y = Math.floor(box.y + ((j + 0.5) * box.height) / down);
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) continue;
      const at = (y * p.width + x) * p.channels;
      out.push([p.data[at], p.data[at + 1], p.data[at + 2]]);
    }
  return out;
}

/** How many pixels of two pictures of the same size differ to the eye. */
export function pixelsChanged(a: Pixels, b: Pixels): number {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) return Math.max(a.width * a.height, b.width * b.height);
  let n = 0;
  for (let at = 0; at < a.data.length; at += a.channels)
    if (Math.abs(a.data[at] - b.data[at]) + Math.abs(a.data[at + 1] - b.data[at + 1]) + Math.abs(a.data[at + 2] - b.data[at + 2]) > 30) n++;
  return n;
}
/** How many pixels differ strongly (3:1, what the standard asks of a mark that is not text). */
export function pixelsStrong(a: Pixels, b: Pixels): number {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) return Math.max(a.width * a.height, b.width * b.height);
  let n = 0;
  for (let at = 0; at < a.data.length; at += a.channels)
    if (contrastRatio([a.data[at], a.data[at + 1], a.data[at + 2]], [b.data[at], b.data[at + 1], b.data[at + 2]]) >= 3) n++;
  return n;
}
/** The mean luminance of a picture, 0 black to 1 white (every 7th pixel). */
export function brightness(p: Pixels): number {
  let sum = 0;
  let n = 0;
  for (let at = 0; at < p.data.length; at += p.channels * 7, n++) sum += luminance([p.data[at], p.data[at + 1], p.data[at + 2]]);
  return n ? sum / n : 0;
}
/** A focus mark someone can find changes at least this many pixels (an outline round a small control changes hundreds). */
export const FOCUS_PIXELS = 24;

// ---- what is tapped ------------------------------------------------------------------------------------------------------------------

export interface TapTarget {
  what: string;
  /** Where a tap reaches it, in pixels (the in-page measure). */
  width: number;
  height: number;
  /** An icon with no words: its width counts for comfort too. */
  iconOnly: boolean;
  /** A link inside a sentence: the standard leaves it out (it is still a neighbour). */
  inline?: boolean;
  /** The size the browser gives it and the page did not change: the standard leaves it out. */
  asBrowser?: boolean;
  /** What is fixed or sticky that holds it (0: nothing): only controls of one layer are neighbours. */
  layer?: number;
  /** Its drawn box, in the page. */
  box: Box;
}

export interface SmallTap {
  what: string;
  width: number;
  height: number;
}

const half = 0.5;
const undersized = (t: TapTarget): boolean => t.width < TAP_LEAST - half || t.height < TAP_LEAST - half;
const middle = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** How far a point is from a box (0 inside it). */
const fromBox = (p: { x: number; y: number }, b: Box): number => Math.hypot(Math.max(b.x - p.x, 0, p.x - b.x - b.width), Math.max(b.y - p.y, 0, p.y - b.y - b.height));
const inside = (a: Box, b: Box): boolean => a.x >= b.x - half && a.y >= b.y - half && a.x + a.width <= b.x + b.width + half && a.y + a.height <= b.y + b.height + half;

/**
 * The standard's spacing exception, as it words it: an undersized target passes when a circle 24 px across, centred on its bounding
 * box, intersects no other target and no such circle of another undersized target. A control inside another is not its neighbour.
 */
export function spacedEnough(t: TapTarget, all: TapTarget[]): boolean {
  const c = middle(t.box);
  return all.every((o) => {
    if (o === t || (o.layer ?? 0) !== (t.layer ?? 0) || inside(o.box, t.box) || inside(t.box, o.box)) return true;
    if (fromBox(c, o.box) < TAP_LEAST / 2 - half) return false;
    if (!undersized(o) || o.inline) return true;
    const other = middle(o.box);
    return Math.hypot(other.x - c.x, other.y - c.y) >= TAP_LEAST - half;
  });
}

/**
 * The controls of a page: `failed` are under the standard's minimum with no exception; `small` are the others a thumb would find
 * small (under TAP_MIN high, or wide for a control with no words). Each list is smallest first. The standard's exceptions judged here:
 * spacing, in a sentence, and the browser's own size; "another control does the same" and "essential" are a person's to judge.
 */
export function judgeTaps(all: TapTarget[]): { failed: SmallTap[]; small: SmallTap[] } {
  const failed: SmallTap[] = [];
  const small: SmallTap[] = [];
  for (const t of all) {
    if (t.inline) continue;
    const said = { what: t.what, width: Math.round(t.width), height: Math.round(t.height) };
    if (undersized(t) && !t.asBrowser && !spacedEnough(t, all)) failed.push(said);
    else if (t.height < TAP_MIN - half || (t.iconOnly && t.width < TAP_MIN - half)) small.push(said);
  }
  const bySize = (a: SmallTap, b: SmallTap) => Math.min(a.width, a.height) - Math.min(b.width, b.height) || a.width * a.height - b.width * b.height;
  return { failed: failed.sort(bySize), small: small.sort(bySize) };
}

// ---- weight --------------------------------------------------------------------------------------------------------------------------

export interface Budget {
  total: number;
  scripts: number;
  pictures: number;
  fonts: number;
}
/** Bytes after compression. A public page is one anyone lands on, perhaps on a slow phone; a signed-in page may carry more. */
export const PUBLIC_BUDGET: Budget = { total: 450_000, scripts: 280_000, pictures: 300_000, fonts: 150_000 };
export const SIGNED_IN_BUDGET: Budget = { total: 600_000, scripts: 350_000, pictures: 300_000, fonts: 150_000 };

export type DownloadKind = "page" | "scripts" | "styles" | "pictures" | "fonts" | "other";

export function downloadKind(type: string, mime: string): DownloadKind {
  if (type === "Document") return "page";
  if (type === "Script" || /javascript|ecmascript/i.test(mime)) return "scripts";
  if (type === "Font" || /^font\/|woff/i.test(mime)) return "fonts";
  if (type === "Image" || /^image\//i.test(mime)) return "pictures";
  if (type === "Stylesheet") return "styles";
  return "other";
}

/** Whether a host would compress it on the way. */
export const compressible = (mime: string): boolean => /^text\/|javascript|ecmascript|json|xml|svg|manifest|wasm/i.test(mime) && !/event-stream/i.test(mime);

/** What it weighs once compressed: what came over the wire, or less when the app sent text bare and a host would not. */
export function compressedSize(wire: number, mime: string, body: Buffer | null): number {
  if (!body || !compressible(mime) || body.length > 8_000_000) return wire;
  return Math.min(wire, zlib.gzipSync(body).length);
}

export interface Weight {
  total: number;
  scripts: number;
  pictures: number;
  fonts: number;
  /** What the app itself sent, uncompressed or not. */
  wire: number;
  requests: number;
}

export function weigh(items: { kind: DownloadKind; size: number; wire: number }[]): Weight {
  const of = (k: DownloadKind) => items.filter((i) => i.kind === k).reduce((n, i) => n + i.size, 0);
  return { total: items.reduce((n, i) => n + i.size, 0), scripts: of("scripts"), pictures: of("pictures"), fonts: of("fonts"), wire: items.reduce((n, i) => n + i.wire, 0), requests: items.length };
}

export const kb = (n: number): string => (n < 950 ? `${Math.round(n)} bytes` : `${Math.round(n / 1000)} kB`);

/** Which parts of the budget a visit is over, in words. */
export function overBudget(w: Weight, b: Budget): string[] {
  const names: [keyof Budget, string][] = [["total", "in all"], ["scripts", "of scripts"], ["pictures", "of pictures"], ["fonts", "of fonts"]];
  return names.filter(([k]) => w[k] > b[k]).map(([k, n]) => `${kb(w[k])} ${n} where the budget is ${kb(b[k])}`);
}

// ---- keys in what a browser gets -----------------------------------------------------------------------------------------------------

export interface Secret {
  name: string;
  value: string;
}
/** Shorter values would be found by chance (a port, "true", a name). */
export const SECRET_MIN = 8;

/** The ways a value could be written where it should not be. */
export const shapesOf = (value: string): string[] =>
  [...new Set([value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1), Buffer.from(value).toString("base64").replace(/=+$/, ""), Buffer.from(value).toString("base64url")])];

/** The names of the values found in a text. */
export function secretsIn(text: string, secrets: Secret[]): string[] {
  return secrets.filter((s) => s.value.length >= SECRET_MIN && shapesOf(s.value).some((w) => text.includes(w))).map((s) => s.name);
}

/**
 * The names of the keys a browser's script reads as its environment (process.env.NAME, import.meta.env.NAME, env.NAME): the value
 * may not be there today, and will be the day the build is given it.
 */
export function keysReadIn(script: string, names: string[]): string[] {
  const safe = (n: string) => n.replace(/[^A-Za-z0-9_]/g, "");
  return names.filter((k) => safe(k) === k && k.length > 1 && new RegExp(`(?:process\\.env|import\\.meta\\.env|\\benv|\\bvars)\\s*(?:\\??\\.\\s*${k}\\b|\\[\\s*['"\`]${k}['"\`]\\s*\\])`).test(script));
}

/** Files and addresses only a development server serves. */
export const isDevPart = (url: string): boolean => /\/@vite\/client|\/@react-refresh|\/__webpack_hmr|webpack-dev-server|\/_next\/webpack-hmr|livereload(\.min)?\.js|browser-sync-client/.test(url);

/** Takes every value out of a text that is going to be shown or kept. */
export function scrub(text: string, secrets: Secret[]): string {
  let out = text;
  for (const s of secrets) if (s.value.length >= 4) for (const w of shapesOf(s.value).sort((a, b) => b.length - a.length)) out = out.split(w).join(`«${s.name}»`);
  return out;
}

// ---- cookies -------------------------------------------------------------------------------------------------------------------------

export interface Cookie {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none" | null;
  /** Set to be taken away. */
  gone: boolean;
}

export function parseSetCookie(header: string): Cookie | null {
  const [pair, ...attrs] = header.split(";");
  const eq = pair.indexOf("=");
  if (eq < 1) return null;
  const at = new Map(attrs.map((a) => [a.split("=")[0].trim().toLowerCase(), (a.split("=")[1] ?? "").trim().toLowerCase()]));
  const same = at.get("samesite");
  const value = pair.slice(eq + 1).trim();
  return {
    name: pair.slice(0, eq).trim(),
    value,
    httpOnly: at.has("httponly"),
    secure: at.has("secure"),
    sameSite: same === "strict" || same === "lax" || same === "none" ? same : null,
    gone: value === "" || at.get("max-age") === "0" || (at.has("expires") && Date.parse(at.get("expires")!) < Date.now()),
  };
}

/** The names and values of a Cookie header. */
export const cookiePairs = (header: string): { name: string; value: string }[] =>
  header
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.indexOf("=") > 0)
    .map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1) }));

// ---- addresses -----------------------------------------------------------------------------------------------------------------------

/** An address that does something when it is merely opened: never followed. */
export const acts = (pathAndQuery: string): boolean => /(sign|log)[-_]?(out|off)|(^|[/?&=_-])(delete|remove|destroy|revoke|unsubscribe|deactivate|reset-data|purge)([/?&=_-]|$)/i.test(pathAndQuery);
/** A file to download rather than a page to look at. */
export const isFile = (pathname: string): boolean => /\.(zip|gz|csv|tsv|pdf|xlsx?|docx?|pptx?|json|xml|ics|vcf|txt|png|jpe?g|gif|webp|avif|svg|ico|mp[34]|webm|mov|wav|woff2?|css|m?js|map|webmanifest)$/i.test(pathname);
export const isSignInPath = (pathname: string): boolean => /(^|\/)(sign[-_]?in|log[-_]?in|signin|login|auth)(\/|$|\.)/i.test(pathname);

/** One page of a kind is enough: /jobs/12 and /jobs/13 are the same page twice. */
export function pageKind(pathAndQuery: string): string {
  const [pathname, query = ""] = pathAndQuery.split("?");
  const parts = pathname.split("/").map((p) => (/^\d+$|^[0-9a-f]{8,}$|^[0-9a-f-]{32,}$|^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9_-]{10,}$/i.test(p) ? ":id" : p));
  const names = [...new URLSearchParams(query).keys()].sort();
  return `${parts.join("/").replace(/(.)\/$/, "$1")}${names.length ? `?${names.join("&")}` : ""}`;
}

/**
 * A path as an address of the app, whatever it holds: "//elsewhere/x" is a path here, never another host, so nothing that signs in
 * can be sent away by an address a page was made to name.
 */
export const onApp = (base: URL, pathAndQuery: string): URL => new URL(base.origin + (pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`));

// ---- a form posted from another site -------------------------------------------------------------------------------------------------

export interface Answer {
  status: number;
  location?: string;
}
export type CrossSite = "refused" | "accepted" | "unclear";

const turnedAway = (a: Answer): boolean => a.status >= 300 && a.status < 400 && /sign[-_]?in|log[-_]?in|forbidden|denied|csrf|error/i.test(a.location ?? "");

/**
 * What the app made of a form that said it came from another site, with the person's cookie. `same` (the same form as the app's own
 * page sends it) is needed when the first answer could also mean the made-up words were not accepted: null asks for it.
 */
export function judgeCrossSite(cross: Answer, same?: Answer): CrossSite | null {
  if ([401, 403, 419].includes(cross.status) || turnedAway(cross)) return "refused";
  if (cross.status >= 200 && cross.status < 400) return "accepted";
  if (cross.status === 404 || cross.status === 405 || cross.status >= 500) return "unclear";
  if (!same) return null;
  return same.status >= 200 && same.status < 400 && !turnedAway(same) ? "refused" : "unclear";
}

/** A hidden field another site could not know: sent wrong. */
export const isTokenField = (name: string, value: string): boolean => /csrf|xsrf|token|authenticity|nonce|crumb/i.test(name) || /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9_\-+=/.]{24,}$/.test(value);
