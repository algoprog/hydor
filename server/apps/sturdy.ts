// A flow's own calls to the web (a tool step, and ctx.tool in a code step), made sturdier than one try: services
// limit requests, sites fail for a moment, and pages keep programs out, and a run that met any of these used to end
// with its fields empty and nothing on screen saying why. What agents do inside their sessions is not touched: they
// see a failure and can choose what to do about it; a flow cannot.
//
// - A failure that may pass (408, 425, 429, 500, 502, 503, 504, no answer in time, a dropped or refused connection, a
//   search service limiting requests) is tried again, up to three tries in all, after what the service asked to wait
//   (Retry-After, "can be asked again in N s"), else about 1 s and then 3 s; never more than 20 s of waiting for one call.
//   A call that may not be safe to repeat (a POST) is tried again only when the service did not take it (429, 503…).
// - Calls to one host are spaced as its service asks (shared/app-services.ts: Semantic Scholar and Nominatim one a
//   second, arXiv one every 3 s), for every step and run of this server; a 429 that names a wait holds that host for all.
// - Look-ups (read_page, web_search, http_request GET) are kept in memory for a while: a view's run-again buttons
//   repeat the same look-ups, and the services limit them. Five minutes, a day for places and encyclopedias.
// - A page that keeps programs out (401, 403, 429, a bot check) is tried once in this server's own headless browser.
//   Only for flows: an agent has the real browser and the person to hand a check to (the blocked-pages skill), and a
//   hidden try of up to 20 s in every agent's read_page would hold up its turns and queue behind screenshots.
//   Nothing is sent to services outside (no archives, no reader proxies).
import { serviceOf } from '../../shared/app-services.ts';
import { formatPage } from '../../shared/search.ts';
import type { RunCtx, RunTool, ToolFailure, ToolOutput } from '../features/types.ts';
import { assertPublic, htmlMarkdown } from '../web/fetch.ts';
import { botWall, failureOf } from '../web/failure.ts';
import { nearest, parts } from '../search/page.ts';
import { canCapture, withTab } from '../capture/index.ts';

/** Tries of one call in all, and the most it waits between them. */
export const TRIES = 3;
export const MOST_WAITING = 20_000;

/** A failed call as a flow reads it: what the tool said in a structured way, else what its words say. */
export interface Failure extends ToolFailure {
  text: string;
}

const PASSING = new Set([408, 425, 429, 500, 502, 503, 504]);
/** Answers that say the service did not take the request at all: safe to send again even when it changes something. */
const NOT_TAKEN = new Set([408, 425, 429, 503]);

/** A failure from a tool's answer or what it threw: its own structured failure first, else read from its words. */
export function readFailure(out: ToolOutput | string | undefined, error?: unknown): Failure {
  const text = error !== undefined ? String((error as Error)?.message ?? error) : typeof out === 'string' ? out : (out?.text ?? '');
  const given = error !== undefined ? failureOf(error) : typeof out === 'object' ? out.failure : undefined;
  if (given) return { ...given, text };
  // Tools that do not say it in a structured way: their words.
  const f: Failure = { text };
  const head = text.slice(0, 600);
  const key = /There is no key named ([A-Z][A-Z0-9_]{1,63})/.exec(head);
  if (key) return { ...f, kind: 'key', key: key[1] };
  const again = /can be asked again in (\d+(?:\.\d+)?) ?s\b/i.exec(head);
  if (/is limiting requests/i.test(head)) return { ...f, kind: 'limit', ...(again ? { waitMs: Math.round(Number(again[1]) * 1000) } : {}) };
  const status = /\b(?:HTTP|answered|status)\s*:?\s*(\d{3})\b/i.exec(head);
  if (status) return { ...f, status: Number(status[1]) };
  if (/No search provider could answer/i.test(head)) return /had a problem|did not answer in time|could not be reached/i.test(head) ? { ...f, kind: 'down' } : f;
  if (/timed? ?out|did not answer (within|in time)/i.test(head)) return { ...f, kind: 'timeout' };
  if (/ECONNRESET|socket hang up|other side closed/i.test(head)) return { ...f, kind: 'dropped' };
  if (/ECONNREFUSED|EAI_AGAIN|EHOSTUNREACH/i.test(head)) return { ...f, kind: 'unreachable' };
  return f;
}

/**
 * Whether a failed call may pass, and how long to wait before trying it again: null when it is not tried again (it
 * would fail the same way, its tries are used up, or the wait would go past MOST_WAITING). `tries`: how many were made;
 * `waited`: how long it waited already; `safe`: the call may be sent again without harm (it only reads).
 */
export function retryWait(f: ToolFailure, o: { tries: number; waited: number; safe: boolean; random?: () => number }): number | null {
  if (o.tries >= TRIES) return null;
  if (f.kind === 'botwall' || f.kind === 'key' || f.kind === 'refused') return null;
  const passing = f.status !== undefined ? PASSING.has(f.status) : f.kind === 'timeout' || f.kind === 'dropped' || f.kind === 'unreachable' || f.kind === 'limit' || f.kind === 'down';
  if (!passing) return null;
  // A request that changes something is sent again only when the service did not take it the first time.
  if (!o.safe && !(f.status !== undefined ? NOT_TAKEN.has(f.status) : f.kind === 'unreachable' || f.kind === 'limit')) return null;
  const jitter = 1 + ((o.random ?? Math.random)() - 0.5) * 0.4;
  const wait = f.waitMs && f.waitMs > 0 ? f.waitMs + 100 : Math.round((o.tries <= 1 ? 1000 : 3000) * jitter);
  return o.waited + wait > MOST_WAITING ? null : wait;
}

// ---- spacing the calls to one host ---------------------------------------------------------------------------

/** Per host: when its next call may start (its service's spacing), and until when a 429 holds it. */
const hosts = new Map<string, { next: number; held: number }>();

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    if (signal?.aborted) return reject(new Error('Stopped'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(t);
      reject(new Error('Stopped'));
    };
    signal?.addEventListener('abort', stop, { once: true });
  });

/** Waits for this host's turn: its service's spacing, and a wait a 429 asked of everyone. */
export async function gate(host: string, signal?: AbortSignal): Promise<void> {
  const h = host.toLowerCase();
  const per = serviceOf(h)?.perSecond;
  const now = Date.now();
  let s = hosts.get(h);
  if (!s) {
    if (hosts.size > 1000) for (const [k, v] of hosts) if (v.next < now && v.held < now) hosts.delete(k);
    hosts.set(h, (s = { next: 0, held: 0 }));
  }
  const at = Math.max(now, s.held, per ? s.next : 0);
  if (per) s.next = at + Math.round(1000 / per);
  await sleep(at - now, signal);
}

/** A host asked every caller to wait (a 429 with Retry-After): its calls hold until then. */
export function holdHost(host: string, ms: number) {
  const h = host.toLowerCase();
  const s = hosts.get(h) ?? { next: 0, held: 0 };
  s.held = Math.max(s.held, Date.now() + Math.min(ms, 3600_000));
  hosts.set(h, s);
}

// ---- answers kept for a while ---------------------------------------------------------------------------------

const MOST_ENTRIES = 500;
const MOST_CHARS = 50 * 1024 * 1024;
export const CACHE_SECONDS = 300;
const cache = new Map<string, { until: number; text: string }>();
let chars = 0;

/** A value as JSON with its keys in order, so the same inputs make the same key. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** A call by its tool and inputs (a key's NAME is among the inputs, never its value: the tool puts that in). */
export const callKey = (tool: string, args: Record<string, unknown>) => `${tool} ${stable(args)}`;

/** The calls whose answers are kept: reads of pages, searches, and GET requests. */
function cacheable(tool: string, args: Record<string, unknown>): boolean {
  if (tool === 'read_page' || tool === 'web_search') return true;
  return tool === 'http_request' && String(args.method ?? 'GET').toUpperCase() === 'GET';
}

function cached(key: string): string | null {
  const e = cache.get(key);
  if (!e) return null;
  cache.delete(key);
  if (e.until <= Date.now()) {
    chars -= e.text.length;
    return null;
  }
  // Used now: the newest in line.
  cache.set(key, e);
  return e.text;
}

function keep(key: string, text: string, seconds: number) {
  if (seconds <= 0 || text.length > MOST_CHARS / 10) return;
  const old = cache.get(key);
  if (old) {
    cache.delete(key);
    chars -= old.text.length;
  }
  cache.set(key, { until: Date.now() + seconds * 1000, text });
  chars += text.length;
  for (const [k, e] of cache) {
    if (cache.size <= MOST_ENTRIES && chars <= MOST_CHARS) break;
    cache.delete(k);
    chars -= e.text.length;
  }
}

/** For tests: nothing kept, no host held. */
export function forgetAll() {
  cache.clear();
  chars = 0;
  hosts.clear();
}

/** The host a call goes to (read_page, http_request), lower case. */
export function hostOf(tool: string, args: Record<string, unknown>): string | undefined {
  if (tool !== 'read_page' && tool !== 'http_request') return undefined;
  const raw = String(args.url ?? args.address ?? '').trim();
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

// ---- a page that keeps programs out, in the browser --------------------------------------------------------

type BrowserRead = (a: { url: string; question?: string; page?: number }, signal?: AbortSignal) => Promise<string | null>;

/** Reads a page in this server's headless browser, as read_page would give it; null when there is no browser or it is kept out there too. */
const browserRead: BrowserRead = async (a, signal) => {
  if (!canCapture()) return null;
  const url = new URL(a.url);
  await assertPublic(url);
  const deadline = Date.now() + 20_000;
  type Shown = { html: string; title: string; url: string };
  const SHOWN = '({ html: document.documentElement.outerHTML, title: document.title, url: location.href })';
  const job = withTab({ url: url.toString(), width: 1280, height: 900, blockPrivate: true, plainAgent: true, settleMs: 800 }, async (tab) => {
    // A check that lets a browser through does so after a few seconds of its script.
    let page = await tab.evaluate<Shown>(SHOWN);
    while (botWall(htmlMarkdown(page.html, page.url).markdown, page.title) && Date.now() < deadline - 2000 && !signal?.aborted) {
      await sleep(1500);
      page = await tab.evaluate<Shown>(SHOWN);
    }
    return page;
  });
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()))));
  const page = await Promise.race([job, late])
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  if (!page) return null;
  const md = htmlMarkdown(page.html, page.url);
  if (!md.markdown.trim() || botWall(md.markdown, page.title)) return null;
  const title = md.title || page.title;
  if (a.question) {
    const near = nearest(md.markdown, a.question);
    return formatPage({ title, url: page.url, detail: `read in this server’s browser; ${near ? `the paragraphs that share the most words with ${JSON.stringify(a.question)}` : 'its beginning'}`, body: near || parts(md.markdown)[0] });
  }
  const all = parts(md.markdown);
  const n = Math.min(Math.max(1, Number(a.page) || 1), all.length);
  return formatPage({ title, url: page.url, detail: `read in this server’s browser${all.length > 1 ? `, part ${n} of ${all.length}` : ''}`, body: all[n - 1] });
};

let readInBrowser: BrowserRead = browserRead;
/** For tests: a stand-in for the browser (null: the real one). */
export const setBrowserRead = (f: BrowserRead | null) => (readInBrowser = f ?? browserRead);

// ---- one call -------------------------------------------------------------------------------------------------

/** Tools that only read: their calls are safe to send again. */
const READS = new Set(['web_search', 'read_page', 'find_media', 'read_document', 'knowledge_search', 'knowledge_read', 'recall', 'read_paper', 'experiment_list', 'experiment_get']);

export type Called = { ok: true; text: string; from?: 'cache' | 'browser'; tries: number } | { ok: false; text: string; failure: Failure; tries: number };

/**
 * One call of a flow: from what is kept when it is there; else made in its host's turn, tried again while its failure may
 * pass, a page that keeps programs out read in the browser (unless `browser` is false), and a good answer kept. `cache`:
 * the step's say (false: never kept; seconds: kept that long).
 */
export async function callTool(tool: RunTool, args: Record<string, unknown>, ctx: RunCtx, o: { cache?: false | number; signal?: AbortSignal; random?: () => number; browser?: boolean } = {}): Promise<Called> {
  const host = hostOf(tool.name, args);
  const key = o.cache !== false && o.cache !== 0 && cacheable(tool.name, args) ? callKey(tool.name, args) : null;
  if (key) {
    const hit = cached(key);
    if (hit !== null) return { ok: true, text: hit, from: 'cache', tries: 0 };
  }
  const seconds = typeof o.cache === 'number' ? o.cache : (host && serviceOf(host)?.cacheSeconds) || CACHE_SECONDS;
  const safe = READS.has(tool.name) || !!tool.annotations?.readOnlyHint || (tool.name === 'http_request' && /^(GET|HEAD|OPTIONS)$/i.test(String(args.method ?? 'GET')));
  let waited = 0;
  let failure: Failure;
  for (let tries = 1; ; tries++) {
    if (host) await gate(host, o.signal);
    let out: ToolOutput | string | undefined;
    let thrown: unknown;
    try {
      out = await tool.run(args, ctx);
    } catch (e) {
      if (o.signal?.aborted) throw e;
      thrown = e;
    }
    const text = thrown === undefined ? (typeof out === 'string' ? out : out!.text) : '';
    const failed = thrown !== undefined || (typeof out === 'object' && !!out.isError);
    // A page read whole that is only a bot check is no page.
    if (!failed && !(tool.name === 'read_page' && botWall(text))) {
      if (key) keep(key, text, seconds);
      return { ok: true, text, tries };
    }
    failure = failed ? readFailure(out, thrown) : { text, kind: 'botwall' };
    if (host && failure.waitMs && (failure.status === 429 || failure.status === 503)) holdHost(host, failure.waitMs);
    const wait = retryWait(failure, { tries, waited, safe, random: o.random });
    if (wait === null) {
      // A page that keeps programs out: once in the browser.
      if (o.browser !== false && tool.name === 'read_page' && (failure.kind === 'botwall' || failure.status === 401 || failure.status === 403 || failure.status === 429)) {
        const url = String(args.url ?? '');
        const read = await readInBrowser({ url: /^https?:/i.test(url) ? url : `https://${url}`, question: typeof args.question === 'string' ? args.question : undefined, page: Number(args.page) || undefined }, o.signal).catch(() => null);
        if (read) {
          if (key) keep(key, read, seconds);
          return { ok: true, text: read, from: 'browser', tries };
        }
      }
      return { ok: false, text: failure.text || 'The tool failed', failure, tries };
    }
    await sleep(wait, o.signal);
    waited += wait;
  }
}

// ---- what could not be had, in words ----------------------------------------------------------------------------

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** What a call wanted, shortened: a host with its path, a search's words. */
export function whatOf(tool: string, args: Record<string, unknown>): string | undefined {
  if (tool === 'web_search' && typeof args.query === 'string') return `“${cut(args.query.replace(/\s+/g, ' ').trim(), 60)}”`;
  const host = hostOf(tool, args);
  if (!host) return undefined;
  try {
    const raw = String(args.url ?? args.address ?? '');
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    // The path without its query: a key may be written there, and it says little to a person.
    return cut(`${u.hostname}${u.pathname === '/' ? '' : decodeURI(u.pathname).replace(/\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/g, '…')}`, 60);
  } catch {
    return host;
  }
}

/** Why a call failed, in plain words for the person; `optional`: keys the app does well enough without. */
export function whyOf(tool: string, f: Failure, optional: (key: string) => boolean = () => false): string {
  if (f.kind === 'key' && f.key) return optional(f.key) ? `it would do more with the key ${f.key} (optional)` : `it needs the key ${f.key}`;
  if (f.kind === 'botwall') return 'it keeps programs out';
  const search = tool === 'web_search';
  if (f.status === 429 || f.kind === 'limit') return search ? 'the search services limit requests' : 'it limits requests';
  if (f.kind === 'timeout' || f.status === 408 || f.status === 504) return 'no answer in time';
  if (f.kind === 'down') return 'no search service could answer';
  if (f.kind === 'dropped') return 'the connection dropped';
  if (f.kind === 'unreachable') return 'it could not be reached';
  if (f.status === 403) return tool === 'read_page' ? 'it keeps programs out' : 'it refused the request (403)';
  if (f.status === 401) return 'it needs a key or a sign-in (401)';
  if (f.status === 404 || f.status === 410) return `nothing is there (${f.status})`;
  if (f.status !== undefined && f.status >= 500) return `it had a problem (${f.status})`;
  if (f.status !== undefined && f.status >= 400) return `it did not take the request (${f.status})`;
  if (search && /No search provider could answer/i.test(f.text)) return 'no search service could answer';
  return firstLine(f.text) || 'it failed';
}

/** A failure's first line, shortened, without the name of the step it came through in front. */
export function firstLine(text: string, max = 160): string {
  const line =
    String(text ?? '')
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? '';
  return cut(line, max);
}
