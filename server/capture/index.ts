// Pictures of web pages for the app's own use: a saved page's picture in Pages, a dev server's screen
// for Preview, and the before and after screenshots agents take of a web app for the user to review.
// One headless Chromium (the binary Settings → Browser picks), started on first use with a profile of
// its own and closed when idle; one picture at a time, each in a fresh browser context.
import fs from 'node:fs';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { Cdp, CdpSession } from '../browser/cdp.ts';
import { launchChrome, pickChrome } from '../browser/chrome.ts';
import { browserSettings } from '../browser/settings.ts';

const DIR = path.join(config.dataDir, 'capture');
const PROFILE = path.join(DIR, 'profile');
const PID = path.join(DIR, 'pid');
let IDLE_MS = 90_000;
/** How long the browser stays open with nothing asked of it (tests make it short). */
export const setCaptureIdle = (ms: number) => (IDLE_MS = ms);
/** The address a document given as text is shown at. */
const DOC_URL = 'https://page.naget.invalid/';

export interface CaptureOpts {
  /** An address to open… */
  url?: string;
  /** …or a document to show. */
  html?: string;
  /** The window, in CSS pixels. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  scale?: number;
  /** As a phone: touch, and the page's mobile layout. */
  mobile?: boolean;
  /** The whole page, up to `maxHeight` CSS pixels, instead of the first screen. */
  fullPage?: boolean;
  maxHeight?: number;
  format?: 'webp' | 'jpeg' | 'png';
  quality?: number;
  /** The picture's width in pixels, when it should be smaller than the window. */
  outWidth?: number;
  /** After the page loaded and its network went quiet, how long to let it settle (fonts, animations). */
  settleMs?: number;
  /** Refuse requests to this machine and private networks (for pages the app did not write). */
  blockPrivate?: boolean;
  /** A second picture of the same page, as it is (another size or format): Captured.alt. */
  alt?: { format: 'webp' | 'jpeg' | 'png'; quality?: number; outWidth?: number; fullPage?: boolean };
}

export interface Captured {
  data: Buffer;
  /** The picture's size in pixels. */
  width: number;
  height: number;
  /** The page's own title. */
  title: string;
  /** Where the page ended up (after redirects). */
  url: string;
  alt?: Buffer;
}

let db: DB | null = null;
/** Settings → Browser decides which Chromium runs. */
export const setCaptureDb = (d: DB) => (db = d);

/** A Chromium to take pictures with is on this machine. */
export function canCapture(): boolean {
  return !!pickChrome(db ? browserSettings(db).chrome : '');
}

let proc: ChildProcess | null = null;
let cdp: Cdp | null = null;
let starting: Promise<Cdp> | null = null;
let idle: NodeJS.Timeout | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** A Chromium of ours left running by an app that stopped without closing it. */
function reap() {
  try {
    const pid = Number(fs.readFileSync(PID, 'utf8'));
    if (pid && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(PROFILE)) process.kill(pid, 'SIGKILL');
  } catch {}
  fs.rmSync(PID, { force: true });
}

async function browser(): Promise<Cdp> {
  if (cdp && !cdp.closed) return cdp;
  starting ??= (async () => {
    const chrome = pickChrome(db ? browserSettings(db).chrome : '');
    if (!chrome) throw new Error('There is no Chromium on this computer to take the picture with: Settings → Browser can download one.');
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    reap();
    const l = await launchChrome(chrome, { userDataDir: PROFILE, headless: true, exactText: true });
    proc = l.proc;
    if (l.proc.pid) fs.writeFileSync(PID, String(l.proc.pid));
    l.proc.on('exit', () => {
      if (proc === l.proc) {
        proc = null;
        cdp = null;
      }
    });
    try {
      cdp = await Cdp.connect(l.wsUrl);
    } catch (e) {
      l.proc.kill('SIGKILL');
      throw e;
    }
    return cdp;
  })().finally(() => (starting = null));
  return starting;
}

/** Closes the browser now (idle, or the app is stopping). */
export function closeCapture() {
  if (idle) clearTimeout(idle);
  idle = null;
  cdp?.close();
  cdp = null;
  try {
    proc?.kill('SIGKILL');
  } catch {}
  proc = null;
  fs.rmSync(PID, { force: true });
}

const PRIVATE = /^(localhost|.*\.localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[(::1?|f[cd][0-9a-f:]*|fe80:[0-9a-f:]*)\])$/i;

function isPrivate(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return true;
    return PRIVATE.test(u.hostname);
  } catch {
    return true;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for an event of the tab, or gives up after `ms`. */
function waitFor(s: CdpSession, method: string, ms: number, test: (p: any) => boolean = () => true): Promise<boolean> {
  return new Promise((resolve) => {
    const off = s.on(method, (p) => {
      if (!test(p)) return;
      clearTimeout(t);
      off();
      resolve(true);
    });
    const t = setTimeout(() => {
      off();
      resolve(false);
    }, ms);
  });
}

/** What a job gets of the tab it works in: the protocol session, and the page's title, address and height once it settled. */
export interface Tab {
  s: CdpSession;
  info: { t?: string; u?: string; h?: number };
  /** Runs `expression` in the page; its value, which must be JSON (a promise is waited for). */
  evaluate<T>(expression: string, timeoutMs?: number): Promise<T>;
}

type TabOpts = Pick<CaptureOpts, 'url' | 'html' | 'width' | 'height' | 'scale' | 'mobile' | 'settleMs' | 'blockPrivate'>;

/** Opens a page in a fresh context, waits for it to load and settle, and hands it to `job`; the context goes after. */
async function inTab<T>(o: TabOpts, job: (tab: Tab) => Promise<T>): Promise<T> {
  const c = await browser();
  const { browserContextId } = await c.send('Target.createBrowserContext', { disposeOnDetach: true });
  try {
    const { targetId } = await c.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
    const s = new CdpSession(c, sessionId);
    await Promise.all([s.send('Page.enable'), s.send('Page.setLifecycleEventsEnabled', { enabled: true }), s.send('Runtime.enable')]);
    await s.send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: o.scale ?? 1, mobile: !!o.mobile });
    if (o.mobile) await s.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await s.send('Emulation.setScrollbarsHidden', { hidden: true }).catch(() => {});
    if (o.html !== undefined || o.blockPrivate) {
      const html = o.html;
      s.on('Fetch.requestPaused', (p) => {
        const id = p.requestId;
        if (html !== undefined && p.request?.url === DOC_URL) {
          void s
            .send('Fetch.fulfillRequest', {
              requestId: id,
              responseCode: 200,
              responseHeaders: [
                { name: 'content-type', value: 'text/html; charset=utf-8' },
                { name: 'cache-control', value: 'no-store' },
              ],
              body: Buffer.from(html, 'utf8').toString('base64'),
            })
            .catch(() => {});
        } else if (o.blockPrivate && isPrivate(String(p.request?.url ?? ''))) void s.send('Fetch.failRequest', { requestId: id, errorReason: 'BlockedByClient' }).catch(() => {});
        else void s.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
      });
      await s.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    }
    const url = o.html !== undefined ? DOC_URL : o.url!;
    const loaded = waitFor(s, 'Page.loadEventFired', 20_000);
    const nav = await s.send('Page.navigate', { url }, 25_000);
    if (nav.errorText) throw new Error(`The page did not open: ${nav.errorText.replace(/^net::/, '')}`);
    await loaded;
    // Quiet network, at most a few seconds: dev servers keep a socket open for hot reload.
    await waitFor(s, 'Page.lifecycleEvent', 4000, (p) => p.name === 'networkIdle' || p.name === 'networkAlmostIdle');
    await sleep(o.settleMs ?? 500);
    const evaluate = async <T,>(expression: string, timeoutMs = 20_000): Promise<T> => {
      const r = await s.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
      if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'The page’s script failed').split('\n')[0]);
      return r.result?.value as T;
    };
    const info = JSON.parse(String((await evaluate<string>('JSON.stringify({ t: document.title, u: location.href, h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0) })')) ?? '{}')) as Tab['info'];
    return await job({ s, info, evaluate });
  } finally {
    await c.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}

async function take(o: CaptureOpts): Promise<Captured> {
  return inTab(o, async ({ s, info }) => {
    const url = o.html !== undefined ? DOC_URL : o.url!;
    const height = o.fullPage ? Math.max(o.height, Math.min(Math.ceil(info.h ?? o.height), o.maxHeight ?? 8000)) : o.height;
    const out = o.outWidth && o.outWidth < o.width * (o.scale ?? 1) ? o.outWidth / (o.width * (o.scale ?? 1)) : 1;
    const shot = await s.send(
      'Page.captureScreenshot',
      {
        format: o.format ?? 'webp',
        quality: o.format === 'png' ? undefined : (o.quality ?? 80),
        clip: { x: 0, y: 0, width: o.width, height, scale: out },
        captureBeyondViewport: !!o.fullPage,
      },
      30_000,
    );
    const dpr = (o.scale ?? 1) * out;
    let alt: Buffer | undefined;
    if (o.alt) {
      const h2 = o.alt.fullPage ? height : o.height;
      const s2 = o.alt.outWidth && o.alt.outWidth < o.width * (o.scale ?? 1) ? o.alt.outWidth / (o.width * (o.scale ?? 1)) : 1;
      const r2 = await s
        .send('Page.captureScreenshot', { format: o.alt.format, quality: o.alt.format === 'png' ? undefined : (o.alt.quality ?? 70), clip: { x: 0, y: 0, width: o.width, height: h2, scale: s2 }, captureBeyondViewport: !!o.alt.fullPage }, 30_000)
        .catch(() => null);
      if (r2?.data) alt = Buffer.from(r2.data, 'base64');
    }
    return {
      alt,
      data: Buffer.from(shot.data, 'base64'),
      width: Math.round(o.width * dpr),
      height: Math.round(height * dpr),
      title: String(info.t ?? '').slice(0, 200),
      url: o.html !== undefined ? '' : String(info.u ?? url),
    };
  });
}

/** One job at a time in the browser, which closes when nothing was asked of it for a while (not while a job runs: one that starts as the last one's while runs out keeps it open). */
function queued<T>(f: () => Promise<T>): Promise<T> {
  const start = () => {
    if (idle) clearTimeout(idle);
    idle = null;
    return f();
  };
  const run = queue.then(start, start);
  queue = run.catch(() => {});
  const done = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(closeCapture, IDLE_MS);
    idle.unref();
  };
  run.then(done, done);
  return run;
}

/**
 * A page opened as capture() opens one, for a job of its own: printing it as a PDF, reading what it shows, taking
 * pictures of parts of it. One at a time, with the pictures.
 */
export function withTab<T>(o: TabOpts, job: (tab: Tab) => Promise<T>): Promise<T> {
  return queued(() => inTab(o, job));
}

/** A tab's page as a PDF (Chromium's print), with its backgrounds. Sizes in inches. */
export async function printPdf(s: CdpSession, o: { paperWidth: number; paperHeight: number; margin?: number; landscape?: boolean; cssPageSize?: boolean }): Promise<Buffer> {
  const m = o.margin ?? 0;
  const r = await s.send(
    'Page.printToPDF',
    {
      paperWidth: o.paperWidth,
      paperHeight: o.paperHeight,
      marginTop: m,
      marginBottom: m,
      marginLeft: m,
      marginRight: m,
      landscape: !!o.landscape,
      printBackground: true,
      preferCSSPageSize: !!o.cssPageSize,
      generateDocumentOutline: true,
    },
    120_000,
  );
  return Buffer.from(r.data, 'base64');
}

/** A picture of a page; one at a time, the browser closing when nothing was asked for a while. */
export function capture(o: CaptureOpts): Promise<Captured> {
  return queued(() => take(o));
}

process.once('exit', closeCapture);
