// The browsers: one Chromium per profile (a fresh one shared by sessions, each in a browser context of
// its own, or a named profile that keeps logins), and each session's browser in it: its tabs, who
// drives (the agent, or the user who took over), what waits for the user, and its live view, with
// the agent's pointer in it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserAsk, BrowserDialog, BrowserInput, BrowserNote, BrowserView, ChromeInfo } from '../../shared/browser.ts';
import type { AgentPointer, PointerAct, Way } from '../../shared/pointer.ts';
import { config } from '../config.ts';
import type { Deps } from '../features/types.ts';
import { addNote, notesOf, updateNote } from '../notes.ts';
import { Cdp, CdpSession } from './cdp.ts';
import { BROWSER_DIR, launchChrome, pickChrome, plainUserAgent } from './chrome.ts';
import { refusal, type Policy } from './guard.ts';
import { BrowserProxy, contextProxy } from './proxy.ts';
import { browserSettings, profileDir, profiles, sessionOptions } from './settings.ts';
import { shownUrl } from './outline.ts';
import { sleep, Tab, type ElRef, type TabOwner } from './tab.ts';

const DESKTOP = { w: 1280, h: 800 };
/** How long the agent's pointer takes to glide to where it acts, while someone watches (the action waits for it). */
export const GLIDE_MS = 300;
/** The session's browser a tab belongs to. */
const ownerOf = (t: Tab) => t.owner as SessionBrowser;
/** A browser nobody used or watched for this long closes. */
const IDLE_MS = 15 * 60_000;
/** ...unless it waits for the user, then this long. */
const ASK_IDLE_MS = 2 * 3600_000;
const STAGING = path.join(BROWSER_DIR, 'downloads');
const PIDS = path.join(BROWSER_DIR, 'pids.json');

let deps: Deps | null = null;
export const setBrowserDeps = (d: Deps) => (deps = d);
const d = () => {
  if (!deps) throw new Error('The app is still starting');
  return deps;
};

// ---- Chromium processes ------------------------------------------------------------------------------

class Chromium {
  readonly cdp: Cdp;
  ua = '';
  closed = false;
  /** Pages by target id, frames (any process) by frame id, and attached sessions, to their tab. */
  tabs = new Map<string, Tab>();
  frames = new Map<string, Tab>();
  sessions = new Map<string, Tab>();
  /** A fresh profile's contexts belong to one session each. */
  contexts = new Map<string, SessionBrowser>();
  private creating: SessionBrowser | null = null;
  private lock: Promise<unknown> = Promise.resolve();
  private compositor: { ctx: string; s: CdpSession } | null = null;
  private compositorCtx: string | null = null;
  private downloads = new Map<string, { owner: SessionBrowser; name: string }>();

  private constructor(
    readonly profile: string,
    readonly chrome: ChromeInfo,
    readonly dir: string,
    readonly proc: import('node:child_process').ChildProcess,
    cdp: Cdp,
    private proxy: BrowserProxy,
  ) {
    this.cdp = cdp;
    cdp.onClose(() => this.gone());
    proc.on('exit', () => this.gone());
  }

  static async start(profile: string, chrome: ChromeInfo, headless: boolean): Promise<Chromium> {
    const dir = profile ? profileDir(profile) : path.join(BROWSER_DIR, 'run', `fresh-${process.pid}`);
    if (!profile) fs.rmSync(dir, { recursive: true, force: true });
    // Everything outside a session's own context goes through the process's proxy: a named profile's
    // sessions (they share its context), and the pages the app opens for itself.
    let self: Chromium | null = null;
    const proxy = await BrowserProxy.start({
      appPort: config.port,
      policy: () => (self ? self.sharedPolicy() : globalPolicy()),
      refused: (target, why) => self?.sharedRefused(target, why),
    });
    let launched: Awaited<ReturnType<typeof launchChrome>>;
    try {
      launched = await launchChrome(chrome, { userDataDir: dir, headless, proxy: proxy.port });
    } catch (e) {
      proxy.close();
      throw e;
    }
    const { proc, wsUrl } = launched;
    rememberPid(proc.pid, true);
    let cdp: Cdp;
    try {
      cdp = await Cdp.connect(wsUrl);
    } catch (e) {
      proc.kill('SIGKILL');
      proxy.close();
      throw e;
    }
    const c = (self = new Chromium(profile, chrome, dir, proc, cdp, proxy));
    await c.init();
    return c;
  }

  /** The sessions in the process's shared context: a named profile's. */
  private shared(): SessionBrowser[] {
    return [...browsers.values()].filter((b) => b.chromium === this && !b.closed && !b.context);
  }

  /** The shared context's rules: the app's settings, and the addresses any of its sessions allowed (each page's requests are still held to its own session's). */
  sharedPolicy(): Policy {
    const g = globalPolicy();
    return { ...g, local: [...new Set(this.shared().flatMap((b) => b.policy().local))] };
  }

  sharedRefused(target: string, why: string) {
    const [only, ...more] = this.shared();
    if (only && !more.length) only.refused(target, why);
  }

  private async init() {
    const v = await this.cdp.send('Browser.getVersion');
    this.ua = plainUserAgent(String(v.userAgent ?? ''));
    fs.mkdirSync(STAGING, { recursive: true, mode: 0o700 });
    this.cdp.on('Target.attachedToTarget', (p, sid) => void this.attached(p, sid).catch((e) => console.error(`[browser] attach: ${(e as Error).message}`)));
    this.cdp.on('Target.detachedFromTarget', (p) => this.detached(p.sessionId, p.targetId));
    this.cdp.on('Target.targetInfoChanged', (p) => {
      const t = this.tabs.get(p.targetInfo.targetId);
      if (!t) return;
      t.title = p.targetInfo.title ?? t.title;
      if (p.targetInfo.url) t.url = p.targetInfo.url;
      t.owner.changed();
    });
    this.cdp.on('Target.targetDestroyed', (p) => {
      const t = this.tabs.get(p.targetId);
      if (t) this.dropTab(t);
    });
    this.cdp.on('Page.frameAttached', (p, sid) => {
      const t = sid ? this.sessions.get(sid) : undefined;
      if (t) this.frames.set(p.frameId, t);
    });
    this.cdp.on('Fetch.requestPaused', (p) => void this.paused(p), '');
    this.cdp.on('Browser.downloadWillBegin', (p) => this.downloadBegins(p), '');
    this.cdp.on('Browser.downloadProgress', (p) => this.downloadProgress(p), '');
    await this.cdp.send('Target.setDiscoverTargets', { discover: true });
    await this.cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    // Every request of every page, frame and worker passes through the guard.
    await this.cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await this.cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: STAGING, eventsEnabled: true });
  }

  /** Runs one tab creation at a time, so a new page in a shared profile is known to be its creator's. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.lock.then(fn, fn);
    this.lock = p.catch(() => {});
    return p;
  }

  /** A browser context of its own for a session, with its own proxy (a named profile's sessions share its default one). */
  async context(owner: SessionBrowser): Promise<string | undefined> {
    if (this.profile) return undefined;
    owner.proxy = await BrowserProxy.start({ appPort: config.port, policy: () => owner.policy(), refused: (target, why) => owner.refused(target, why) });
    const { browserContextId } = await this.cdp.send('Target.createBrowserContext', { disposeOnDetach: false, ...contextProxy(owner.proxy.port) });
    this.contexts.set(browserContextId, owner);
    await this.cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: STAGING, eventsEnabled: true, browserContextId });
    return browserContextId;
  }

  async disposeContext(ctx: string) {
    this.contexts.delete(ctx);
    await this.cdp.send('Target.disposeBrowserContext', { browserContextId: ctx }).catch(() => {});
  }

  newTab(owner: SessionBrowser, ctx: string | undefined): Promise<Tab> {
    return this.serial(async () => {
      this.creating = owner;
      try {
        // No window size here: a tab in an existing window cannot have one (each tab's page size is set on it).
        const { targetId } = await this.cdp.send('Target.createTarget', { url: 'about:blank', ...(ctx ? { browserContextId: ctx } : {}) });
        for (let i = 0; i < 100 && !this.tabs.has(targetId); i++) await sleep(50);
        const t = this.tabs.get(targetId);
        if (!t) throw new Error('The new tab did not open');
        return t;
      } finally {
        this.creating = null;
      }
    });
  }

  private async attached(p: any, parent?: string) {
    if (parent) {
      // A frame in another process inside one of our tabs: its requests and downloads are that tab's.
      const t = this.sessions.get(parent);
      if (t) {
        this.sessions.set(p.sessionId, t);
        this.frames.set(p.targetInfo.targetId, t);
      }
      return;
    }
    const info = p.targetInfo;
    const s = new CdpSession(this.cdp, p.sessionId);
    if (info.type !== 'page') {
      await s.send('Runtime.runIfWaitingForDebugger').catch(() => {});
      return;
    }
    if (this.compositorCtx && info.browserContextId === this.compositorCtx) {
      this.compositor = { ctx: this.compositorCtx, s };
      await s.send('Runtime.runIfWaitingForDebugger').catch(() => {});
      return;
    }
    const opener = info.openerId ? this.tabs.get(info.openerId) : undefined;
    const owner = this.contexts.get(info.browserContextId) ?? (opener ? ownerOf(opener) : undefined) ?? this.creating;
    if (!owner || owner.closed) {
      await s.send('Runtime.runIfWaitingForDebugger').catch(() => {});
      return;
    }
    const tab = new Tab(owner, info.targetId, s, this.ua);
    this.tabs.set(info.targetId, tab);
    this.frames.set(info.targetId, tab);
    this.sessions.set(p.sessionId, tab);
    owner.pendingTabs++;
    // Set up before its page runs: the commands go out first, then it resumes (a popup waits on both).
    const init = tab.init(owner.viewportFor()).catch((e) => console.error(`[browser] tab setup: ${(e as Error).message}`));
    await s.send('Runtime.runIfWaitingForDebugger').catch(() => {});
    await init;
    owner.pendingTabs--;
    owner.adopt(tab, opener);
  }

  private detached(sessionId: string, targetId?: string) {
    this.cdp.dropSession(sessionId);
    const t = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (t && targetId === t.targetId) this.dropTab(t);
  }

  private dropTab(t: Tab) {
    if (!this.tabs.has(t.targetId)) return;
    this.tabs.delete(t.targetId);
    for (const [f, x] of this.frames) if (x === t) this.frames.delete(f);
    for (const [s, x] of this.sessions) if (x === t) this.sessions.delete(s);
    t.close();
    ownerOf(t).tabGone(t);
  }

  async closeTab(t: Tab) {
    await this.cdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
    this.dropTab(t);
  }

  /** The guard: each request goes on, or fails before it leaves. */
  private async paused(p: any) {
    const tab = p.frameId ? this.frames.get(p.frameId) : undefined;
    const policy = tab ? ownerOf(tab).policy() : globalPolicy();
    let why: string | null = null;
    try {
      why = await refusal(p.request.url, p.resourceType, policy, config.port);
    } catch {
      why = null;
    }
    if (why) {
      if (tab) noteBlocked(tab, String(p.request.url), why);
      await this.cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    } else await this.cdp.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
  }

  private downloadBegins(p: any) {
    const tab = this.frames.get(p.frameId);
    if (!tab) return;
    const name = safeName(String(p.suggestedFilename || 'download'));
    this.downloads.set(p.guid, { owner: ownerOf(tab), name });
    ownerOf(tab).downloadStarted(name);
  }

  private downloadProgress(p: any) {
    const dl = this.downloads.get(p.guid);
    if (!dl || p.state === 'inProgress') return;
    this.downloads.delete(p.guid);
    const from = path.join(STAGING, p.guid);
    if (p.state !== 'completed') {
      fs.rmSync(from, { force: true });
      return dl.owner.downloadEnded(dl.name, null);
    }
    try {
      const dir = path.join(dl.owner.cwd, 'downloads');
      fs.mkdirSync(dir, { recursive: true });
      const to = freeName(dir, dl.name);
      try {
        fs.renameSync(from, to);
      } catch {
        fs.copyFileSync(from, to);
        fs.rmSync(from, { force: true });
      }
      dl.owner.downloadEnded(path.basename(to), to);
    } catch (e) {
      console.error(`[browser] download: ${(e as Error).message}`);
      dl.owner.downloadEnded(dl.name, null);
    }
  }

  /** Draws numbered boxes over a screenshot, in a page of its own (the agent's page stays untouched). */
  async label(jpeg: string, w: number, h: number, boxes: { id: number; x: number; y: number; w: number; h: number }[]): Promise<string> {
    return this.serial(async () => {
      if (!this.compositor) {
        const { browserContextId } = await this.cdp.send('Target.createBrowserContext', { disposeOnDetach: false });
        this.compositorCtx = browserContextId;
        await this.cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
        const made = async () => {
          for (let i = 0; i < 100 && !this.compositor; i++) await sleep(30);
          return this.compositor as { ctx: string; s: CdpSession } | null;
        };
        const c = await made();
        if (!c) throw new Error('Could not draw the labels');
        await c.s.send('Page.enable');
      }
      const s = (this.compositor as unknown as { s: CdpSession }).s;
      await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      const colors = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4d7c0f'];
      const marks = boxes
        .map((b, i) => {
          const c = colors[i % colors.length];
          const ly = b.y >= 15 ? b.y - 15 : b.y;
          return `<div style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;outline:2px solid ${c};outline-offset:-1px"></div><span style="left:${Math.max(0, b.x)}px;top:${Math.max(0, ly)}px;background:${c}">${b.id}</span>`;
        })
        .join('');
      const html = `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden}div,span{position:absolute;box-sizing:border-box}span{color:#fff;font:bold 11px/15px Arial,sans-serif;padding:0 3px;border-radius:3px;white-space:nowrap}</style></head><body><img id="i" src="data:image/jpeg;base64,${jpeg}" style="display:block;width:${w}px;height:${h}px">${marks}</body></html>`;
      const tree = await s.send('Page.getFrameTree');
      await s.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html });
      await s.send('Runtime.evaluate', { expression: 'document.getElementById("i").decode().then(() => 1)', awaitPromise: true });
      const r = await s.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
      return r.data as string;
    });
  }

  async close() {
    if (this.closed) return;
    try {
      await this.cdp.send('Browser.close', {}, undefined, 5000);
    } catch {}
    await sleep(300);
    try {
      this.proc.kill('SIGKILL');
    } catch {}
    this.gone();
  }

  private gone() {
    if (this.closed) return;
    this.closed = true;
    this.cdp.close();
    try {
      this.proc.kill('SIGKILL');
    } catch {}
    rememberPid(this.proc.pid, false);
    this.proxy.close();
    for (const t of [...this.tabs.values()]) this.dropTab(t);
    if (processes.get(this.profile) === this) processes.delete(this.profile);
    if (!this.profile) fs.rmSync(this.dir, { recursive: true, force: true });
    for (const b of [...browsers.values()]) if (b.chromium === this) void b.close('The browser stopped');
  }
}

/** A request or connection that was refused, for the agent's next look at the page. */
function noteBlocked(tab: Tab, url: string, why: string) {
  tab.blocked.push({ url: url.slice(0, 200), why });
  if (tab.blocked.length > 20) tab.blocked.shift();
}

/** Process ids of the browsers this server started, to end any a crash left behind. */
function rememberPid(pid: number | undefined, on: boolean) {
  if (!pid) return;
  let list: number[] = [];
  try {
    list = JSON.parse(fs.readFileSync(PIDS, 'utf8'));
  } catch {}
  list = on ? [...new Set([...list, pid])] : list.filter((x) => x !== pid);
  try {
    fs.mkdirSync(BROWSER_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(PIDS, JSON.stringify(list));
  } catch {}
}

/** Ends browsers an earlier run of the server left running (checked by their command line). */
export function reapStale() {
  let list: number[] = [];
  try {
    list = JSON.parse(fs.readFileSync(PIDS, 'utf8'));
  } catch {
    return;
  }
  for (const pid of list) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (cmd.includes(BROWSER_DIR)) process.kill(pid, 'SIGKILL');
    } catch {}
  }
  // (Windows may still hold a file of a browser that has not quite ended: it goes next time.)
  try {
    fs.rmSync(PIDS, { force: true });
    fs.rmSync(path.join(BROWSER_DIR, 'run'), { recursive: true, force: true });
  } catch {}
}

const safeName = (n: string) => n.replace(/[/\\\0:*?"<>|]/g, '_').replace(/^\.+/, '_').slice(0, 150) || 'download';

function freeName(dir: string, name: string): string {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 0; ; i++) {
    const p = path.join(dir, i ? `${base} (${i})${ext}` : name);
    if (!fs.existsSync(p)) return p;
  }
}

const processes = new Map<string, Chromium>();
const starting = new Map<string, Promise<Chromium>>();

async function processFor(profile: string): Promise<Chromium> {
  const have = processes.get(profile);
  if (have && !have.closed) return have;
  let p = starting.get(profile);
  if (!p) {
    const s = browserSettings(d().db);
    const chrome = pickChrome(s.chrome);
    if (!chrome) throw new Error('No Chromium is installed: Settings → Browser can download one');
    p = Chromium.start(profile, chrome, s.headless || !!chrome.shell).finally(() => starting.delete(profile));
    starting.set(profile, p);
  }
  const c = await p;
  processes.set(profile, c);
  return c;
}

function globalPolicy(): Policy {
  const s = browserSettings(d().db);
  return { blockPrivate: s.blockPrivate, allow: s.allow, block: s.block, local: [] };
}

// ---- each session's browser ----------------------------------------------------------------------

/** A browser of the user's own outside any session: logging a profile in from Settings… */
export const profileKey = (id: string) => `browser-profile:${id}`;
/** …or a dev server's page streaming to Preview, where the browser can't reach the preview port (server/preview.ts). */
export const previewKey = (port: number) => `preview:${port}`;
/** Neither has an agent to tell, cards in a conversation, or a session's options. */
export const outsideSessions = (key: string) => key.startsWith('browser-profile:') || key.startsWith('preview:');
/** A preview's page reaches its own dev server, by each name of this machine, and nothing else here. */
const previewLocal = (key: string): string[] => {
  const port = key.startsWith('preview:') ? Number(key.slice('preview:'.length)) : 0;
  return Number.isInteger(port) && port > 0 ? ['localhost', '127.0.0.1', '::1'].map((h) => `${h}:${port}`) : [];
};

const browsers = new Map<string, SessionBrowser>();
/** Element numbers go on counting for the life of the server, so a number never means two things. */
const counters = new Map<string, number>();

export class SessionBrowser implements TabOwner {
  tabs: Tab[] = [];
  active: Tab | null = null;
  driver: 'agent' | 'user' = 'agent';
  asks: BrowserAsk[] = [];
  busy: string | undefined;
  downloads: BrowserView['downloads'] = [];
  refs = new Map<number, ElRef>();
  closed = false;
  lastUse = Date.now();
  /** Someone watches the live view until then. */
  watchUntil = 0;
  /** Where the agent's pointer rests, as fractions of the page (null until it first points). */
  pointer: { x: number; y: number } | null = null;
  private cast: { w: number; h: number } | null = null;
  /** The agent was turned away while the user drove: it hears when they hand back. */
  turnedAway = false;
  /** A dialog the agent's action opened: it hears how the user answered. */
  agentDialog: string | null = null;
  /** Tabs being set up (a link opening a new tab). */
  pendingTabs = 0;
  opening() {
    return this.pendingTabs;
  }
  /** Downloads under way and just finished, for the agent's next answer. */
  pendingDownloads = 0;
  finishedDownloads: { name: string; path: string | null }[] = [];
  private emitTimer: NodeJS.Timeout | null = null;
  context: string | undefined;
  /** The proxy its own context's connections go through. */
  proxy: BrowserProxy | null = null;

  constructor(
    readonly key: string,
    public cwd: string,
    readonly chromium: Chromium,
    readonly profile: string,
  ) {}

  get ownBrowser() {
    return outsideSessions(this.key);
  }

  /** The size Preview shows its page at: new tabs open at it too. */
  fit: { w: number; h: number; mobile: boolean; scale: number } | null = null;

  viewportFor(): { w: number; h: number; mobile?: boolean; scale?: number } {
    if (this.fit) return this.fit;
    return this.active ? { w: this.active.viewport.w, h: this.active.viewport.h } : DESKTOP;
  }

  policy(): Policy {
    const s = browserSettings(d().db);
    const o = this.ownBrowser ? {} : sessionOptions(d().db, this.key);
    return { blockPrivate: s.blockPrivate, allow: [...s.allow, ...(o.allow ?? [])], block: [...s.block, ...(o.block ?? [])], local: [...(o.local ?? []), ...previewLocal(this.key)] };
  }

  /** Its proxy refused a connection (a WebSocket, or a name that now leads inward): noted on the tab in front. */
  refused(target: string, why: string) {
    const t = this.active ?? this.tabs[this.tabs.length - 1];
    if (t) noteBlocked(t, target, why);
  }

  // ---- TabOwner ----
  newId(tab: Tab, session: string, backendNodeId: number): number {
    const n = (counters.get(this.key) ?? 0) + 1;
    counters.set(this.key, n);
    this.refs.set(n, { tab, session, backendNodeId });
    return n;
  }
  forget(_tab: Tab, ids: Iterable<number>) {
    for (const id of ids) this.refs.delete(id);
  }
  changed() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      emitView(this.key);
    }, 120);
  }
  dialog(tab: Tab, dl: BrowserDialog | null) {
    if (dl && tab === this.active && this.driver === 'agent' && !this.ownBrowser) {
      this.agentDialog = dl.message;
      notifyUser(this.key, `The page asks: ${dl.message.slice(0, 120) || 'a question'}`);
    }
    this.changed();
  }

  adopt(tab: Tab, opener?: Tab) {
    this.tabs.push(tab);
    // A tab the page opened (a link to a new tab) is where the agent goes on.
    if (!this.active || (opener && opener === this.active)) this.setActive(tab);
    this.changed();
  }

  tabGone(tab: Tab) {
    this.tabs = this.tabs.filter((t) => t !== tab);
    for (const [id, r] of this.refs) if (r.tab === tab) this.refs.delete(id);
    if (this.active === tab) this.setActive(this.tabs[this.tabs.length - 1] ?? null);
    if (!this.tabs.length && !this.closed) void this.close('Its last tab closed');
    this.changed();
  }

  setActive(tab: Tab | null) {
    const was = this.active;
    this.active = tab;
    if (was && was !== tab && was.casting) void was.stopCast();
    if (tab && this.cast && Date.now() < this.watchUntil) void this.startCast();
  }

  downloadStarted(name: string) {
    this.pendingDownloads++;
    this.downloads = [{ name, path: '', done: false, at: Date.now() }, ...this.downloads.filter((x) => x.name !== name || x.done)].slice(0, 8);
    this.changed();
  }

  downloadEnded(name: string, file: string | null) {
    this.pendingDownloads = Math.max(0, this.pendingDownloads - 1);
    this.finishedDownloads.push({ name, path: file });
    const i = this.downloads.findIndex((x) => !x.done);
    const entry = { name, path: file ?? '', done: true, failed: !file, at: Date.now() };
    if (i >= 0) this.downloads[i] = entry;
    else this.downloads.unshift(entry);
    this.changed();
  }

  view(): BrowserView {
    const prof = this.profile ? profiles(d().db).find((p) => p.id === this.profile) : undefined;
    return {
      key: this.key,
      open: !this.closed,
      profile: this.profile || undefined,
      profileName: prof?.name,
      tabs: this.tabs.map((t) => ({ id: t.targetId, title: t.title, url: t.url, active: t === this.active, loading: t.navigating || undefined })),
      driver: this.driver,
      busy: this.busy,
      asks: this.asks,
      dialog: this.active?.dialog ?? this.tabs.find((t) => t.dialog)?.dialog ?? undefined,
      viewport: { w: this.active?.viewport.w ?? DESKTOP.w, h: this.active?.viewport.h ?? DESKTOP.h, mobile: this.active?.viewport.mobile || undefined },
      downloads: this.downloads,
      ...(this.pointer ? { pointer: this.pointer } : {}),
    };
  }

  /** A tab to work in: the active one, or a new one. */
  async tab(): Promise<Tab> {
    if (this.active && !this.active.closed) return this.active;
    return this.newTab();
  }

  async newTab(): Promise<Tab> {
    const t = await this.chromium.newTab(this, this.context);
    this.setActive(t);
    return t;
  }

  async closeTab(t: Tab) {
    await this.chromium.closeTab(t);
  }

  // ---- the live view ----

  private viewers = new Map<string, { w: number; h: number; until: number }>();

  /** Someone watches: frames flow for a while (each page asks again to keep them coming), as large as the largest view. */
  async watch(w: number, h: number, viewer = '') {
    const now = Date.now();
    this.watchUntil = now + 45_000;
    this.viewers.set(viewer, { w: Math.max(160, Math.min(1600, Math.round(w))), h: Math.max(100, Math.min(1600, Math.round(h))), until: now + 45_000 });
    for (const [id, v] of this.viewers) if (v.until < now) this.viewers.delete(id);
    const vs = [...this.viewers.values()];
    const size = { w: Math.max(...vs.map((v) => v.w)), h: Math.max(...vs.map((v) => v.h)) };
    const same = this.cast && this.cast.w === size.w && this.cast.h === size.h;
    this.cast = size;
    if (!same || !this.active?.casting) await this.startCast();
    // A still page sends no new frames: whoever just started watching gets the last one.
    else if (this.lastFrame && this.lastFrame.tab === this.active?.targetId) d().toSubscribers(this.key, { t: 'feature', id: 'browser', key: this.key, data: { type: 'frame', ...this.lastFrame } });
  }
  private lastFrame: { tab: string; data: string; w: number; h: number } | null = null;
  private refresh: NodeJS.Timeout | null = null;

  /** Someone watches the live view now (the small picture on the folded panel counts). */
  get watched(): boolean {
    return !!this.cast && Date.now() < this.watchUntil;
  }

  /**
   * The agent's pointer, for the live view: it goes to a place on the page (CSS pixels; a key is pressed where it
   * rests) and acts there. While someone watches, it glides from where it was and this waits as long, so the eye has
   * followed it before the click lands; nobody watching, nothing waits. Returns what was shown, in fractions.
   */
  async pointAt(t: Tab, p: { x?: number; y?: number; act: PointerAct; box?: { x: number; y: number; w: number; h: number }; dir?: Way; keys?: string }): Promise<AgentPointer> {
    const from = this.pointer ?? { x: 0.5, y: 0.5 };
    const f = p.x === undefined || p.y === undefined ? null : await t.frameSize();
    const frac = (v: number, of: number) => Math.round(Math.min(1, Math.max(0, v / Math.max(1, of))) * 10_000) / 10_000;
    const x = f ? frac(p.x!, f.w) : from.x;
    const y = f ? frac(p.y!, f.h) : from.y;
    const far = Math.hypot(x - from.x, y - from.y) > 0.004;
    const shown: AgentPointer = { x, y, act: p.act };
    if (far && this.watched) shown.glide = GLIDE_MS;
    if (p.box && f) shown.box = { x: frac(p.box.x, f.w), y: frac(p.box.y, f.h), w: frac(p.box.w, f.w), h: frac(p.box.h, f.h) };
    if (p.dir) shown.dir = p.dir;
    if (p.keys) shown.keys = p.keys.slice(0, 60);
    this.pointer = { x, y };
    d().toSubscribers(this.key, { t: 'feature', id: 'browser', key: this.key, data: { type: 'pointer', tab: t.targetId, pointer: shown } });
    this.changed();
    if (shown.glide) await sleep(shown.glide);
    return shown;
  }

  /** A full-resolution picture of the page as a frame: after a restart, or once a zoom or scroll settles. */
  private freshFrame(t: Tab) {
    if (!this.cast || this.active !== t || t.closed || Date.now() > this.watchUntil) return;
    const { w, h } = t.viewport;
    t.screenshot({ quality: 60, width: this.cast.w, height: this.cast.h })
      .then((data) => {
        this.lastFrame = { tab: t.targetId, data, w, h };
        d().toSubscribers(this.key, { t: 'feature', id: 'browser', key: this.key, data: { type: 'frame', ...this.lastFrame } });
      })
      .catch(() => {});
  }

  private async startCast() {
    const t = this.active;
    if (!t || !this.cast) return;
    for (const x of this.tabs) if (x !== t && x.casting) await x.stopCast();
    const key = this.key;
    // A still page sends nothing new when the stream starts again: a picture of it, at the new size, comes first.
    setTimeout(() => this.freshFrame(t), 400);
    await t
      .startCast(
        (f) => {
          if (Date.now() > this.watchUntil) {
            void t.stopCast();
            return;
          }
          this.lastFrame = { tab: t.targetId, data: f.data, w: f.w, h: f.h };
          d().toSubscribers(key, { t: 'feature', id: 'browser', key, data: { type: 'frame', ...this.lastFrame } });
        },
        { maxWidth: this.cast.w, maxHeight: this.cast.h },
      )
      .catch(() => {});
  }

  /** Preview's page, laid out at the size it shows it (a computer's, a tablet's or a phone's), the user driving. */
  async layOut(fit: { w: number; h: number; mobile: boolean; scale: number }) {
    this.lastUse = Date.now();
    this.driver = 'user';
    this.fit = fit;
    const t = await this.tab();
    const v = t.viewport;
    if (v.w !== fit.w || v.h !== fit.h || v.mobile !== fit.mobile || v.scale !== fit.scale) {
      await t.setViewport(fit.w, fit.h, fit.mobile, fit.scale);
      if (this.cast && Date.now() < this.watchUntil) await this.startCast();
    }
    this.changed();
  }

  /** The user takes the wheel (or hands it back). On a phone the page is laid out for its screen meanwhile. */
  async takeOver(on: boolean, fit?: { w: number; h: number; scale: number }) {
    this.lastUse = Date.now();
    if (on) {
      this.driver = 'user';
      const t = await this.tab();
      if (fit && fit.w > 200 && fit.h > 200) await t.setViewport(Math.round(fit.w), Math.round(fit.h), true, Math.min(3, Math.max(1, fit.scale)));
      else if (t.viewport.mobile) await t.setViewport(DESKTOP.w, DESKTOP.h, false, 1);
      if (this.cast && Date.now() < this.watchUntil) await this.startCast();
    } else {
      this.driver = 'agent';
      for (const t of this.tabs) if (t.viewport.mobile) await t.setViewport(DESKTOP.w, DESKTOP.h, false, 1).catch(() => {});
      if (this.cast && Date.now() < this.watchUntil) await this.startCast();
      if (this.turnedAway && !this.asks.some((a) => a.kind !== 'local')) {
        this.turnedAway = false;
        await tellAgent(this.key, `I handed the browser back to you. ${await pageLine(this)}`);
      }
    }
    this.changed();
  }

  async input(events: BrowserInput[]) {
    if (this.driver !== 'user') throw Object.assign(new Error('Take over the browser first'), { status: 409 });
    const t = this.active;
    if (!t) return;
    this.lastUse = Date.now();
    // Input is in the page's CSS pixels, across the whole frame: its scrollbars too (measured without them, a click
    // landed up to their width to the left), and a zoomed-out page (a phone layout without a viewport tag) shows more.
    const { w, h } = await t.frameSize();
    const k = w / Math.max(1, t.viewport.w);
    let typed = false;
    for (const e of events.slice(0, 200)) {
      if (t.dialog) break;
      try {
        if (e.t === 'mouse') {
          const type = e.type === 'down' ? 'mousePressed' : e.type === 'up' ? 'mouseReleased' : 'mouseMoved';
          await t.s.send('Input.dispatchMouseEvent', { type, x: clamp01(e.x) * w, y: clamp01(e.y) * h, button: e.type === 'move' ? (e.button ? e.button : 'none') : (e.button ?? 'left'), buttons: e.type === 'move' && e.button ? 1 : 0, clickCount: e.type === 'move' ? 0 : (e.clicks ?? 1), modifiers: e.mods ?? 0 }, 5000);
        } else if (e.t === 'wheel') {
          await t.s.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: clamp01(e.x) * w, y: clamp01(e.y) * h, deltaX: e.dx * k, deltaY: e.dy * k }, 5000);
        } else if (e.t === 'key') {
          const text = e.type === 'down' && e.text && !((e.mods ?? 0) & 6) ? e.text : undefined;
          await t.s.send('Input.dispatchKeyEvent', { type: e.type === 'down' ? (text ? 'keyDown' : 'rawKeyDown') : 'keyUp', key: e.key, code: e.code ?? '', windowsVirtualKeyCode: e.keyCode ?? 0, nativeVirtualKeyCode: e.keyCode ?? 0, modifiers: e.mods ?? 0, ...(text ? { text, unmodifiedText: text } : {}) }, 5000);
          if (e.type === 'down') typed = true;
        } else if (e.t === 'text') {
          await t.s.send('Input.insertText', { text: String(e.text).slice(0, 5000) }, 5000);
          typed = true;
        }
      } catch {}
    }
    // What the user types stays theirs: the field is noted so its value is never shown to the agent.
    if (typed) void t.markTyped();
    // Chrome may leave a zoomed or scrolled page's last frame blurry: a sharp one follows once input pauses.
    if (this.refresh) clearTimeout(this.refresh);
    this.refresh = setTimeout(() => this.freshFrame(t), 900);
  }

  // ---- waiting for the user ----

  /** Adds something for the user to do: a card in the conversation, the live view, a notification. */
  async ask(kind: BrowserAsk['kind'], text: string): Promise<BrowserAsk> {
    const t = this.active;
    const a: BrowserAsk = { id: crypto.randomBytes(5).toString('hex'), kind, text: text.slice(0, 500), url: t?.url, title: t?.title, at: Date.now() };
    this.asks.push(a);
    this.changed();
    if (!this.ownBrowser) {
      const anchor = await lastItem(this.key);
      addNote(d().db, { key: this.key, kind: 'browser', anchor, data: { ask: a, status: 'waiting' } satisfies BrowserNote });
      notifyUser(this.key, kind === 'local' ? `Asks to open ${a.text}` : kind === 'payment' ? `Stopped before paying: ${a.text}` : `Needs you in the browser: ${a.text}`);
    }
    return a;
  }

  /** The user finished (or skipped) what was asked; the agent hears how it went. */
  async answer(id: string, outcome: 'done' | 'skipped') {
    const a = this.asks.find((x) => x.id === id);
    if (!a) return;
    this.asks = this.asks.filter((x) => x !== a);
    if (!this.asks.some((x) => x.kind !== 'local')) {
      this.driver = 'agent';
      for (const t of this.tabs) if (t.viewport.mobile) await t.setViewport(DESKTOP.w, DESKTOP.h, false, 1).catch(() => {});
    }
    this.changed();
    for (const n of notesOf(d().db, this.key, 'browser')) {
      const data = n.data as BrowserNote;
      if (data?.ask?.id === id) updateNote(d().db, n.id, { ...data, status: outcome, endedAt: Date.now() } satisfies BrowserNote);
    }
    const page = await pageLine(this);
    let msg: string;
    if (a.kind === 'local') {
      msg = outcome === 'done' ? `I allowed ${a.text} in the browser for this session. Open it again with browser_open.` : `I did not allow ${a.text} in the browser.`;
    } else if (a.kind === 'payment') {
      msg = outcome === 'done' ? `I took care of “${a.text}” in the browser myself. ${page}` : `I did not go ahead with “${a.text}”. ${page}`;
    } else msg = outcome === 'done' ? `Done in the browser (${a.text}). ${page}` : `I could not do that in the browser (${a.text}). ${page}`;
    this.turnedAway = false;
    await tellAgent(this.key, msg);
  }

  async answerDialog(accept: boolean, text?: string) {
    const t = this.tabs.find((x) => x.dialog);
    if (!t || !t.dialog) return;
    const dl = t.dialog;
    await t.answerDialog(accept, text);
    this.lastUse = Date.now();
    if (this.agentDialog !== null && !this.ownBrowser) {
      this.agentDialog = null;
      await sleep(400);
      await tellAgent(this.key, `The page asked “${dl.message.slice(0, 200)}” and I answered ${dl.type === 'alert' ? 'OK' : accept ? (dl.type === 'prompt' ? 'with my reply' : 'OK') : 'Cancel'}. ${await pageLine(this)}`);
    }
  }

  async close(why = 'closed') {
    if (this.closed) return;
    this.closed = true;
    browsers.delete(this.key);
    if (this.emitTimer) clearTimeout(this.emitTimer);
    for (const t of [...this.tabs]) {
      if (t.casting) await t.stopCast();
      if (this.profile && !this.chromium.closed) await this.chromium.closeTab(t).catch(() => {});
    }
    if (this.context && !this.chromium.closed) await this.chromium.disposeContext(this.context);
    this.proxy?.close();
    this.proxy = null;
    this.tabs = [];
    this.active = null;
    // Waiting cards end with the browser.
    for (const a of this.asks)
      for (const n of this.ownBrowser ? [] : notesOf(d().db, this.key, 'browser')) {
        const data = n.data as BrowserNote;
        if (data?.ask?.id === a.id && data.status === 'waiting') updateNote(d().db, n.id, { ...data, status: 'skipped', endedAt: Date.now() } satisfies BrowserNote);
      }
    this.asks = [];
    emitView(this.key);
    console.log(`[browser] ${this.key}: ${why}`);
    // A process nobody uses any more ends a little later.
    const c = this.chromium;
    setTimeout(() => {
      if (![...browsers.values()].some((b) => b.chromium === c)) void c.close();
    }, 60_000).unref();
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number(v) || 0));

// ---- the registry -----------------------------------------------------------------------------------

export const browserOf = (key: string) => {
  const b = browsers.get(key);
  return b && !b.closed ? b : undefined;
};
export const openBrowsers = () => [...browsers.values()].filter((b) => !b.closed);

/** The session's browser, started when it has none (in the profile its settings name). */
export async function ensureBrowser(key: string, cwd: string, profile?: string): Promise<SessionBrowser> {
  const have = browserOf(key);
  if (have) {
    have.cwd = cwd;
    if (!have.tabs.length) await have.newTab();
    return have;
  }
  const prof = profile ?? (key.startsWith('browser-profile:') ? key.slice('browser-profile:'.length) : sessionOptions(d().db, key).profile) ?? '';
  const known = !prof || profiles(d().db).some((p) => p.id === prof);
  const c = await processFor(known ? prof : '');
  const b = new SessionBrowser(key, cwd, c, known ? prof : '');
  browsers.set(key, b);
  try {
    b.context = await c.context(b);
    await b.newTab();
  } catch (e) {
    await b.close('could not start');
    throw e;
  }
  return b;
}

export async function closeBrowser(key: string, why?: string) {
  await browserOf(key)?.close(why);
}

export async function closeAll() {
  for (const b of openBrowsers()) await b.close('the server stops');
  for (const c of [...processes.values()]) await c.close();
}

export function emitView(key: string) {
  const b = browsers.get(key);
  const view: BrowserView = b && !b.closed ? b.view() : { key, open: false, tabs: [], driver: 'agent', asks: [], viewport: DESKTOP, downloads: [] };
  d().toSubscribers(key, { t: 'feature', id: 'browser', key, data: { type: 'state', view } });
}

export function viewOf(key: string): BrowserView {
  const b = browserOf(key);
  return b ? b.view() : { key, open: false, tabs: [], driver: 'agent', asks: [], viewport: DESKTOP, downloads: [] };
}

/** Closes browsers nobody has used or watched for a while (longer while one waits for the user). */
export function sweepIdle() {
  const now = Date.now();
  for (const b of openBrowsers()) {
    // A preview has nothing to wait for: it closes like any browser nobody looks at.
    const limit = b.key.startsWith('preview:') ? IDLE_MS : b.asks.length || b.driver === 'user' ? ASK_IDLE_MS : IDLE_MS;
    if (now - Math.max(b.lastUse, b.watchUntil) > limit) void b.close('idle');
  }
}

// ---- telling the agent and the user ----------------------------------------------------------------

/** A message to the session's agent: now when it is free, else after the running turn. */
async function tellAgent(key: string, text: string) {
  if (outsideSessions(key)) return;
  try {
    await d().sessions.deliverOrQueue(key, text);
  } catch (e) {
    console.error(`[browser] message to ${key}: ${(e as Error).message}`);
  }
}

/** A notification (and a push to the phone) that the session needs the user. */
function notifyUser(key: string, body: string) {
  const s = d().sessions.summary(key);
  if (!s) return;
  d().sessions.emit('notify', { key, kind: 'waiting', title: s.title, body: body.slice(0, 160), agent: s.agent, at: Date.now() });
}

/** The timeline's last item, so a card shows with the turn it belongs to. */
async function lastItem(key: string): Promise<string | undefined> {
  try {
    const tl = await d().sessions.timeline(key);
    return tl.parser.items.at(-1)?.id;
  } catch {
    return undefined;
  }
}

/** Where the browser is now, in a line: for messages to the agent. */
export async function pageLine(b: SessionBrowser): Promise<string> {
  const t = b.active;
  if (!t) return 'The browser has no page open.';
  await t.waitLoad(3000);
  return `The browser now shows “${t.title || 'a page'}” at ${shownUrl(t.url)}. Read it with browser_read.`;
}

/** The server is exiting: no browser outlives it. */
export function killAll() {
  for (const c of processes.values()) {
    try {
      c.proc.kill('SIGKILL');
    } catch {}
  }
}
