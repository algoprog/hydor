// The desktop app's own browser, as the engine Hydor's browser runs on: this answers the Chrome DevTools Protocol the server
// already speaks to a Chromium it starts (server/browser/cdp.ts), over the app's message channel with the server
// (server/desktop.ts, server/browser/desktopEngine.ts), and each tab is a WebContentsView of this app.
//
// One virtual browser for each connection (one for each profile: a fresh one, a named profile, or 'browsing', which is
// yours). The server's commands go to the tab's own debugger (webContents.debugger), which is Chromium's CDP; what that
// does not have, the browser's own side of it, is answered here: targets (tabs) and their contexts, the guard's
// Fetch for every page at once, downloads, permissions, the browser's version.
//
// Two kinds of tab, because of how Electron 45 draws (measured, not guessed): a page that is not drawn on screen (a
// hidden window, or outside its window) stops drawing, and then screenshots hang and CDP's mouse and keys are dropped;
// a view made with `offscreen: true` works fully wherever it is. So:
//   - the agents' tabs are offscreen views (a fresh or named profile's, and an agent's tab in your own browsing). The
//     window shows them as a picture that comes from here (`watch`: their paint frames) that you click and type into
//     (`input`: real input events, so they count as your gestures);
//   - your own tabs are real pages. The window shows one where the Browser page puts it (`show`: the view is laid over
//     that place of the window); not shown, it rests in a window nobody sees and stops drawing until shown again.
// What the app's own page may ask (preload.cjs, `window.hydorDesktop.browser`) is answered by registerIpc.
//
// What people expect of a browser is here for your own tabs: the right-click menu (with its video and audio items and the
// translation ones, which only ask the app), zoom, print, muting, full-screen video, find in page with its match count,
// opening a page in the default browser, the shortcuts, a picture of the page or a PDF of it saved in Downloads, deleting
// one site's data, the address a link points at shown in a small bubble over the page's corner (as Chrome does), and clearing
// browsing data; and the ad blocker of the browsing profile (adblock.cjs), whose count of what a page had blocked goes to the
// window with the tab's other news (sound, zoom, full screen) as `hydor:browser-tab-state`.
//
// Private tabs are your own tabs in a context of their own (`Target.createBrowserContext` with `hydorPrivate: true`, on
// the browsing connection only): a partition that is never saved (`hydor-private-<id>`), so its cookies and storage go when
// the context is disposed of or the browser closes. The ad blocker works there too; extensions do not. The server's
// `browser-prefs` also bring whether pages are shown dark (`darkPages`, except `darkExcept`), whether sound may play by
// itself (`autoplay`: it decides the policy of tabs made after it), whether cookie notices are hidden (`cookieBanners`), the zoom
// pages have unless you zoomed their site yourself (`zoom`) and whether misspelled words are underlined (`spellcheck`).
'use strict';
const { BrowserWindow, Menu, WebContentsView, ClipboardItem, app, clipboard, ipcMain, nativeImage, nativeTheme, screen, session, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAC = process.platform === 'darwin';
const BROWSING = 'browsing';
/** The size a page has until the server (an agent's tab) or the window (your own) gives it one. */
const PAGE = { width: 1280, height: 800 };
/** Permissions every page may have: they let a page copy into the clipboard, or show itself full screen. */
const ALWAYS = new Set(['clipboard-sanitized-write', 'fullscreen']);
/** How long a request the guard has paused waits for the server's word, and how long you have to answer a permission. */
const PAUSE_MS = 30_000;
const PERMISSION_MS = 120_000;
/** Chrome's zoom steps, 25 % to 500 %. */
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
/** What the blocked count of a page shows in the window at most this often (a page can have hundreds of requests blocked). */
const BLOCKED_MS = 500;
/** How many hosts a tab remembers it blocked requests to (the most are shown, 50). */
const HOSTS_PER_TAB = 200;
/** The search pages of the engines (shared/browser.ts SEARCH_ENGINES), for the right-click menu's search; the server has the same table. */
const ENGINES = {
  google: ['Google', 'https://www.google.com/search?q=%s'],
  duckduckgo: ['DuckDuckGo', 'https://duckduckgo.com/?q=%s'],
  bing: ['Bing', 'https://www.bing.com/search?q=%s'],
  brave: ['Brave', 'https://search.brave.com/search?q=%s'],
  ecosia: ['Ecosia', 'https://www.ecosia.org/search?q=%s'],
  startpage: ['Startpage', 'https://www.startpage.com/do/search?q=%s'],
};
/** The picture of your page shown under a menu: at most this many pixels (a whole 5K screen's page fits), and a JPEG
 * quality at which small text stays clean. */
const STILL_PIXELS = 16_000_000;
const STILL_QUALITY = 90;
/** The bubble that shows where a link goes: its height, its distance from the page's side, how far the mouse must be from it, and how often that is looked at. */
/** Whether this Electron lets a video go into picture in picture (its own check says so: desktop/scripts/browser-ipc-check.cjs). */
const PIP = true;
const BUBBLE_H = 24;
const BUBBLE_SIDE = 4;
const BUBBLE_AWAY = 14;
const BUBBLE_POLL_MS = 100;
/** The tallest a picture of a whole page is, in CSS pixels, and the longest an address shown or a selection translated is. */
const WHOLE_PAGE_MAX = 16_384;
const BUBBLE_TEXT_MAX = 2000;
const TRANSLATE_MAX = 5000;
/** Frames to the window: at most this many a second, while someone watches. */
const WATCH_FPS = 30;
const IDLE_FPS = 10;

const hex32 = () => crypto.randomBytes(16).toString('hex').toUpperCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) => {
  let timer;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} did not finish in time`)), ms);
    }),
  ]);
};
const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));
/** Text on the clipboard (Electron's clipboard answers with a promise). */
const copyText = (text) => void Promise.resolve(clipboard.writeText(String(text))).catch(() => {});

/** A page's host in lower case (no trailing dot), or ''. */
const hostOf = (url) => {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
};

/** A host as the dark pages setting keeps it: in lower case, without www. */
const plainHost = (h) => String(h || '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '').replace(/^www\./, '');

/** Whether a host is a site, or under one, of this list (a site covers its subdomains, www. or not). */
const inSites = (host, sites) => {
  const h = plainHost(host);
  return !!h && sites.some((s) => h === s || h.endsWith('.' + s));
};

/** The second-level names that sit under a country's two letters (co.uk, com.au, ac.jp, ne.jp…). */
const COUNTRY_SECOND = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'ne', 'or', 'go', 'gob', 'mil', 'nom', 'sch', 'ltd', 'plc', 'ind', 'biz', 'info']);

/**
 * The site a host belongs to, as well as can be told without a list of public suffixes: the last two names of its host, or
 * three when the last is a country's two letters and the one before it is a short second-level name (co.uk, com.au).
 * An address of numbers, and a host of one name (localhost), is its own site.
 */
function siteOfHost(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!h || h.includes(':') || /^\d+(\.\d+){3}$/.test(h)) return h;
  const labels = h.split('.');
  if (labels.length <= 2) return h;
  const last = labels[labels.length - 1];
  const before = labels[labels.length - 2];
  const three = last.length === 2 && (COUNTRY_SECOND.has(before) || before.length <= 2);
  return labels.slice(three ? -3 : -2).join('.');
}

/** What a title is as the start of a file's name: no character a file system dislikes, no more than `max` letters. */
function fileSafe(title, max = 80) {
  let name = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f‎‏‪-‮]+/g, ' ').replace(/\s+/g, ' ').trim();
  name = Array.from(name).slice(0, max).join('').replace(/^\.+/, '').replace(/[. ]+$/, '').trim();
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name) ? `${name}_` : name;
}

/** Writes a file named `<base><ext>` in a folder, or `<base> (2)<ext>`, `(3)`… when that is taken; the path it has. */
async function writeFree(dir, base, ext, bytes) {
  await fs.promises.mkdir(dir, { recursive: true });
  for (let n = 1; n < 1000; n++) {
    const file = path.join(dir, `${base}${n > 1 ? ` (${n})` : ''}${ext}`);
    try {
      await fs.promises.writeFile(file, bytes, { flag: 'wx' });
      return file;
    } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e;
    }
  }
  throw new Error('There is no free name for the file.');
}

/** `YYYY-MM-DD at HH.MM.SS` of a moment, in this computer's time. */
function stamp(d = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} at ${two(d.getHours())}.${two(d.getMinutes())}.${two(d.getSeconds())}`;
}

/** A link's address as the bubble shows it: decoded (%E4%B8%AD as the letters) where that cannot hide anything, else as it is. */
function shownAddress(url) {
  let text = String(url || '').slice(0, BUBBLE_TEXT_MAX);
  try {
    const plain = decodeURI(text);
    // A decoded address with a space, a control or a direction mark in it could show one thing and mean another.
    if (!/[\p{C}\p{Z}]/u.test(plain)) text = plain;
  } catch {}
  return text;
}

/**
 * The little page of the bubble (a data: address, nothing from the net): `__bubble(text, widest, dark)` sets its words, shortened
 * in the middle to fit `widest` pixels (the start, with the host, and the end of the address stay), its colours, and answers
 * the width it needs.
 */
const BUBBLE_PAGE = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent}
#b{box-sizing:border-box;height:${BUBBLE_H}px;display:inline-block;max-width:100%;padding:0 8px;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--fg);font:12px/${BUBBLE_H - 2}px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none;cursor:default}
#b{--bg:#ffffff;--bd:#d4d4d8;--fg:#27272a}
#b.dark{--bg:#1f1f23;--bd:#3f3f46;--fg:#e4e4e7}
</style><div id="b"></div><script>
const b=document.getElementById('b');
const wide=()=>Math.ceil(b.getBoundingClientRect().width);
window.__bubble=(text,widest,dark)=>{
  b.className=dark?'dark':'';
  // Measured as wide as it wants to be (the width it is let have is a limit, not a measure).
  b.style.maxWidth='none';
  b.textContent=text;
  if(wide()>widest){
    const host=/^[a-z][a-z0-9+.-]*:\\/\\/[^/?#]*/i.exec(text);
    const head=host?host[0]:'';
    const rest=text.slice(head.length);
    const make=(n)=>{const a=Math.ceil(n*0.4);return head+rest.slice(0,a)+'\\u2026'+rest.slice(rest.length-(n-a))};
    let lo=0,hi=rest.length;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);b.textContent=make(mid);if(wide()<=widest)lo=mid;else hi=mid-1}
    b.textContent=make(lo);
  }
  const w=Math.min(wide(),widest);
  b.style.maxWidth=widest+'px';
  return w;
};
</script>`;

/** Chrome's own user agent as this Electron makes it, without Electron's words and the app's. */
function plainUserAgent() {
  return session.defaultSession
    .getUserAgent()
    .replace(/\s+Electron\/\S+/i, '')
    .replace(/\s+[\w.-]+\/\d[\w.-]*(?=\s+Chrome\/)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Electron's cursor names are nearly CSS's. */
const CURSORS = { hand: 'pointer', nodrop: 'no-drop', 'm-panning': 'all-scroll', 'm-panning-vertical': 'all-scroll', 'm-panning-horizontal': 'all-scroll', custom: 'default', null: 'default' };
const cursorOf = (type) => {
  if (CURSORS[type]) return CURSORS[type];
  if (/-panning$/.test(type)) return 'all-scroll';
  if (/^drag-drop-/.test(type)) return 'default';
  if (/-no-resize$/.test(type)) return 'not-allowed';
  return type || 'default';
};

/** DOM key names (and what the server sends) as Electron names keys for sendInputEvent. */
const KEY_NAMES = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
  Escape: 'Esc',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  CapsLock: 'Capslock',
  Shift: 'Shift',
  Control: 'Control',
  Alt: 'Alt',
  Meta: 'Meta',
};
/** The server's modifier bits (shared/browser.ts MOD) as Electron names them. */
const modifiersOf = (mods) => {
  const m = [];
  if (mods & 1) m.push('alt');
  if (mods & 2) m.push('control');
  if (mods & 4) m.push('meta');
  if (mods & 8) m.push('shift');
  return m;
};

/**
 * @param {object} o
 * @param {(...what: any[]) => void} o.log
 * @param {(m: object) => void} o.toServer          a message to the server
 * @param {() => import('electron').BrowserWindow | null} o.mainWindow
 * @param {(e: import('electron').IpcMainInvokeEvent) => boolean} o.fromOwnPage  whether a message is from the app's own page
 * @param {object | null} [o.ext]                   desktop/extensions.cjs's createExtensions(), when there is one
 * @param {{ dir: string, modulePath: () => string, engine?: object } | null} [o.adblock]   where the ad blocker keeps its lists and
 *        finds its package (desktop/adblock.cjs); without it, or where the package does not load, there is no blocker
 */
function createBrowser({ log, toServer, mainWindow, fromOwnPage, ext = null, adblock: adblockOptions = null }) {
  /** One virtual browser for each connection of the server. */
  const conns = new Map();
  /** Every target by its webContents id, to find who asks for a permission or starts a download. */
  const byWc = new Map();
  /** The state of each session (partition) this module prepared: whose it is now, so handlers need installing once. */
  const sessions = new WeakMap();
  const extended = new WeakSet();
  let host = null;
  let ua = null;
  /** What the server's `browser-prefs` say that this module acts on (the blocker has its own). */
  const settings = { darkPages: false, darkExcept: [], autoplay: false, zoom: 1, spellcheck: true };
  /** The sites you zoomed yourself (`<partition>|<host>`): they keep that zoom, and the others have the default one. */
  const zoomedByYou = new Set();
  /** The ad blocker of the browsing profile, when this app has it (adblock.cjs). */
  let adblock = null;
  /** What it blocked, kept on this computer (adblock-stats.cjs). */
  let adStats = null;
  if (adblockOptions) {
    try {
      adblock = require('./adblock.cjs').createAdblock({ log, ...adblockOptions, onBlocked: (wcId, what) => blocked(wcId, what) });
      adStats = require('./adblock-stats.cjs').createStats({ file: path.join(adblockOptions.dir, 'stats.json'), log });
    } catch (e) {
      log('the ad blocker did not start', String((e && e.message) || e));
    }
  }

  const say = (conn, msg) => toServer({ type: 'cdp', conn: conn.id, data: JSON.stringify(msg) });
  const event = (conn, method, params, sessionId) => say(conn, sessionId ? { method, params, sessionId } : { method, params });

  // ---- the window nobody sees ---------------------------------------------------------------------------------------

  /** Where every page rests when no window shows it. Made once. */
  function hostWindow() {
    if (!host || host.isDestroyed()) {
      host = new BrowserWindow({ show: false, width: 1400, height: 900, skipTaskbar: true, focusable: false, webPreferences: { backgroundThrottling: false } });
      host.on('closed', () => (host = null));
    }
    return host;
  }

  function park(t) {
    if (t.gone) return;
    bubbleOff(t);
    exitFullScreen(t);
    try {
      if (t.shownIn && !t.shownIn.isDestroyed()) t.shownIn.contentView.removeChildView(t.view);
    } catch {}
    t.shownIn = null;
    try {
      hostWindow().contentView.addChildView(t.view);
      t.view.setBounds(t.bounds);
    } catch {}
  }

  // ---- sessions (partitions) ----------------------------------------------------------------------------------------

  const partitionOf = (conn, ctxId, isPrivate = false) => {
    if (ctxId && isPrivate) return `hydor-private-${ctxId.toLowerCase()}`;
    if (ctxId) return `hydor-ctx-${ctxId.toLowerCase()}`;
    if (conn.profile === BROWSING) return 'persist:hydor-browsing';
    if (conn.profile) return `persist:hydor-profile-${conn.profile.replace(/[^\w.-]/g, '_')}`;
    return `hydor-fresh-${conn.id}`;
  };

  /**
   * A context of a connection: its default one (id '') or one made with Target.createBrowserContext. A private one (`private`)
   * has a partition that is only in memory, and is your own browsing's: its tabs are your own tabs.
   */
  async function makeContext(conn, id, proxy, { private: isPrivate = false } = {}) {
    const ctx = { id, partition: partitionOf(conn, id, isPrivate), conn, ses: null, download: null, granted: new Set(), persistent: false, private: isPrivate, asks: new Map() };
    const ses = session.fromPartition(ctx.partition);
    ctx.ses = ses;
    ctx.persistent = ctx.partition.startsWith('persist:');
    ua ??= plainUserAgent();
    sessions.set(ses, ctx);
    // Agents' pages go through the server's proxy (it keeps them off this machine and its network); your own browsing
    // has none (proxy null) and connects directly, as any browser does: a hop through the server slowed every page.
    await ses.setProxy(proxy ? { proxyRules: proxy.server, proxyBypassRules: proxy.bypass } : { mode: 'direct' });
    ses.setUserAgent(ua);
    if (!extended.has(ses)) {
      extended.add(ses);
      guardSession(ses);
      if (ownSession(ctx)) {
        if (adblock) adblock.attach(ses);
        ses.setSpellCheckerEnabled(settings.spellcheck);
      }
      if (ctx.persistent && ext) {
        try {
          ext.prepare(ses);
        } catch (e) {
          log('extensions could not prepare', ctx.partition, String((e && e.message) || e));
        }
      }
    }
    return ctx;
  }

  /** Whether a context's session is for your own browsing: its profile and its private tabs (not agents' pages, whose spell checking is off). */
  const ownSession = (ctx) => ctx.conn.profile === BROWSING && (ctx.private || ctx.persistent);

  /** The handlers of a session: permissions and downloads, answered for whichever connection has the session now. */
  function guardSession(ses) {
    const own = () => sessions.get(ses);
    ses.setPermissionCheckHandler((wc, permission, origin) => {
      if (ALWAYS.has(permission)) return true;
      const ctx = own();
      return !!ctx && ctx.granted.has(`${permission}|${origin}`);
    });
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (ALWAYS.has(permission)) return callback(true);
      const ctx = own();
      const t = wc ? byWc.get(wc.id) : null;
      // Only your own tabs ask you (those of your browsing's default context and of its private ones); the agents' browsers
      // refuse everything else, and so does a page that is not a tab here.
      if (!ctx || !t || t.offscreen || ctx.conn.profile !== BROWSING || (ctx !== ctx.conn.defaultCtx && !ctx.private)) return callback(false);
      let origin = '';
      try {
        origin = new URL(details.requestingUrl || wc.getURL()).origin;
      } catch {}
      const id = crypto.randomBytes(5).toString('hex');
      const done = (allow) => {
        const w = ctx.asks.get(id);
        if (!w) return;
        ctx.asks.delete(id);
        clearTimeout(w.timer);
        if (allow) ctx.granted.add(`${permission}|${origin}`);
        callback(allow);
      };
      ctx.asks.set(id, { done, timer: setTimeout(() => done(false), PERMISSION_MS) });
      toServer({ type: 'browser-permission', conn: ctx.conn.id, target: t.id, id, permission, origin, ...(details.mediaTypes ? { media: details.mediaTypes } : {}) });
    });
    ses.on('will-download', (_e, item, wc) => {
      const ctx = own();
      const conn = ctx && ctx.conn;
      const rule = ctx && (ctx.download || conn.defaultCtx.download);
      // A download an extension asked for: it hears how it goes, and it keeps the name the extension gave it.
      const claim = ext && ext.claimDownload ? ext.claimDownload(item) : null;
      if (!conn || !rule || rule.behavior === 'deny' || !rule.path) return item.cancel();
      const guid = crypto.randomUUID();
      const t = wc ? byWc.get(wc.id) : null;
      try {
        fs.mkdirSync(rule.path, { recursive: true });
      } catch {}
      item.setSavePath(path.join(rule.path, guid));
      const events = rule.events !== false;
      if (events) event(conn, 'Browser.downloadWillBegin', { frameId: t ? t.id : '', guid, url: item.getURL(), suggestedFilename: (claim && claim.name) || item.getFilename() });
      const progress = (state) => events && event(conn, 'Browser.downloadProgress', { guid, totalBytes: item.getTotalBytes(), receivedBytes: item.getReceivedBytes(), state });
      item.on('updated', () => progress('inProgress'));
      item.on('done', (_ev, state) => progress(state === 'completed' ? 'completed' : 'canceled'));
    });
  }

  // ---- targets (tabs) -------------------------------------------------------------------------------------------------

  const infoOf = (t) => ({
    targetId: t.id,
    type: 'page',
    title: t.wc.isDestroyed() ? '' : t.wc.getTitle(),
    url: t.wc.isDestroyed() ? '' : t.wc.getURL(),
    attached: true,
    canAccessOpener: !!t.opener,
    ...(t.opener ? { openerId: t.opener.id } : {}),
    browserContextId: t.ctx.id || t.conn.defaultCtx.id,
  });

  const changed = (t) => {
    if (t.gone || !t.ready || !t.conn.discover) return;
    event(t.conn, 'Target.targetInfoChanged', { targetInfo: infoOf(t) });
  };

  /** The view and its page's handlers; not yet a target the server knows. */
  function makeTarget(conn, ctx, o) {
    const offscreen = o.offscreen;
    // Your own tabs run the ad blocker's preload in every frame, iframes of other sites too (with the sandbox and context
    // isolation on, this only makes the session's frame preloads run in each frame; the page's own scripts get nothing).
    const prefsNow = () => ({ partition: ctx.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: !offscreen, ...(offscreen ? { offscreen: true } : { autoplayPolicy: autoplayPolicy(), nodeIntegrationInSubFrames: ownSession(ctx) }) });
    const prefs = prefsNow();
    const view = o.webContents ? new WebContentsView({ webContents: o.webContents }) : new WebContentsView({ webPreferences: prefs });
    const wc = view.webContents;
    const t = {
      id: '',
      sid: hex32(),
      conn,
      ctx,
      view,
      wc,
      dbg: wc.debugger,
      offscreen,
      agent: !!o.agent,
      opener: o.opener || null,
      bounds: { x: 0, y: 0, ...PAGE },
      shownIn: null,
      wanted: null,
      ready: false,
      gone: false,
      children: new Set(),
      fetch: null,
      watchers: new Map(),
      frame: null,
      /** The page's size in CSS pixels when the server set one (an off-screen page's frames are bigger by its scale). */
      css: null,
      cursor: 'default',
      resume: null,
      /** Your own tab's news for the window (see tabState), the ads and trackers it had blocked, and its full-screen state. */
      news: null,
      newsAt: 0,
      newsTimer: null,
      blocked: 0,
      blockedAds: 0,
      blockedTrackers: 0,
      blockedHosts: new Map(),
      fs: null,
      finding: null,
      /** Whether this tab shows pages dark now (what was last sent to its page), and the bubble that has its link's address. */
      dark: false,
      darkMedia: null,
      bubble: null,
    };
    byWc.set(wc.id, t);
    hostWindow().contentView.addChildView(view);
    view.setBounds(t.bounds);
    if (offscreen) wc.setFrameRate(IDLE_FPS);
    // The page's own news, for the server.
    wc.on('page-title-updated', () => changed(t));
    wc.on('did-navigate', () => changed(t));
    wc.on('did-navigate-in-page', () => changed(t));
    wc.on('render-process-gone', () => t.ready && event(conn, 'Inspector.targetCrashed', {}, t.sid));
    wc.once('destroyed', () => destroyTarget(t, true));
    if (offscreen) {
      wc.on('paint', (_e, _dirty, image) => {
        t.frame = image;
        if (t.watchers.size) feed(t);
      });
      wc.on('cursor-changed', (_e, type) => {
        t.cursor = cursorOf(type);
        for (const w of t.watchers.values()) w.send('hydor:browser-cursor', { target: t.id, cursor: t.cursor });
      });
    } else {
      ownPage(t);
    }
    // Pop-ups open as tabs of this browser, in the same partition and drawn the same way as their opener.
    wc.setWindowOpenHandler(() => ({
      action: 'allow',
      // The sound policy is the one the setting says when the pop-up opens (a tab's own is fixed when it was made).
      overrideBrowserWindowOptions: { show: false, webPreferences: prefsNow() },
      createWindow: (options) => popup(t, options),
    }));
    return t;
  }

  // ---- your own tabs: what a browser does for a page you use ----------------------------------------------------------

  /** Sound that plays by itself: the page's own policy. By default it waits until you click or type in the page (muted video plays). */
  const autoplayPolicy = () => (settings.autoplay ? 'no-user-gesture-required' : 'document-user-activation-required');

  // ---- pages shown dark -----------------------------------------------------------------------------------------------

  /** Whether a page of this address is shown dark: the setting is on and its site is not one you made an exception for. */
  const darkFor = (url) => settings.darkPages && !inSites(hostOf(url), settings.darkExcept);

  /**
   * Puts one of your tabs' pages dark or back, as the setting and its site say: the browser's own darkening (auto dark mode) for
   * a page with no dark look, and the page's preference for a dark look (`prefers-color-scheme`) for a page that has one. The
   * server's own `Emulation.setEmulatedMedia` to the tab (pageCommand) is merged with it, not replaced.
   */
  async function applyDark(t, url) {
    if (t.gone || t.offscreen || t.wc.isDestroyed() || !t.dbg.isAttached()) return;
    const on = darkFor(url ?? t.wc.getURL());
    if (on === t.dark) return;
    t.dark = on;
    await setDark(t, on);
  }
  async function setDark(t, on) {
    try {
      await t.dbg.sendCommand('Emulation.setAutoDarkModeOverride', on ? { enabled: true } : {});
    } catch (e) {
      // A Chromium without it still has the page's preference below.
      log('automatic dark mode is not there', String((e && e.message) || e));
    }
    try {
      await t.dbg.sendCommand('Emulation.setEmulatedMedia', mediaOf(t, on));
    } catch {}
  }
  /** The media emulation of a tab: what the server set, and a preference for dark when the page is shown dark and the server set none. */
  function mediaOf(t, on) {
    const own = t.darkMedia || {};
    const features = (Array.isArray(own.features) ? own.features : []).filter((f) => f && typeof f.name === 'string');
    if (on && !features.some((f) => f.name === 'prefers-color-scheme')) features.push({ name: 'prefers-color-scheme', value: 'dark' });
    return { ...(own.media !== undefined ? { media: own.media } : {}), features };
  }
  /** Every one of your tabs again, after the setting changed. */
  function applyDarkAll() {
    for (const conn of conns.values()) for (const t of conn.targets.values()) if (!t.offscreen && !t.gone) void applyDark(t);
  }

  /** The window's page that shows a tab (or the main window's), for the tab's news and what the menu asks. */
  function uiOf(t) {
    const w = t.shownIn && !t.shownIn.isDestroyed() ? t.shownIn : mainWindow();
    return w && !w.isDestroyed() && !w.webContents.isDestroyed() ? w.webContents : null;
  }

  /**
   * News of a tab for the window (`hydor:browser-tab-state`: audible, muted, zoom, blocked, fullscreen), only what changed.
   * The blocked count changes fast, so it goes at most twice a second; the rest goes at once.
   */
  function tabState(t, patch) {
    if (t.gone || t.offscreen || !t.id) return;
    t.news = { ...(t.news || {}), ...patch };
    if (Object.keys(patch).every((k) => k === 'blocked')) {
      if (t.newsTimer) return;
      t.newsTimer = setTimeout(() => flushState(t), Math.max(0, BLOCKED_MS - (Date.now() - t.newsAt)));
      t.newsTimer.unref?.();
      return;
    }
    flushState(t);
  }
  function flushState(t) {
    clearTimeout(t.newsTimer);
    t.newsTimer = null;
    const news = t.news;
    t.news = null;
    if (!news || t.gone || !t.id) return;
    t.newsAt = Date.now();
    uiOf(t)?.send('hydor:browser-tab-state', { target: t.id, ...news });
  }
  /** Everything about a tab, for a window that has just got it. */
  const allState = (t) => ({ audible: t.wc.isCurrentlyAudible(), muted: t.wc.isAudioMuted(), zoom: zoomOf(t), blocked: t.blocked, fullscreen: !!t.fs });

  /**
   * The ad blocker blocked a request of this page (`what`: { kind: 'ad' | 'tracker', host, type }): the tab counts it since its last
   * main-frame navigation (and its hosts, the most 200), and the statistics do, by the page's site. A private tab counts in the
   * totals only.
   */
  function blocked(wcId, what) {
    const t = byWc.get(wcId);
    if (!t || t.gone || t.offscreen) return;
    t.blocked++;
    const kind = what && what.kind === 'tracker' ? 'tracker' : 'ad';
    if (kind === 'tracker') t.blockedTrackers++;
    else t.blockedAds++;
    const host = what && what.host;
    if (host) {
      const h = t.blockedHosts.get(host);
      if (h) h.count++;
      else if (t.blockedHosts.size < HOSTS_PER_TAB) t.blockedHosts.set(host, { count: 1, kind });
    }
    if (adStats) {
      try {
        adStats.record({ kind, host, site: siteOfPage(t), type: what && what.type, private: !!t.ctx.private });
      } catch {}
    }
    tabState(t, { blocked: t.blocked });
  }
  /** A tab's page's site: its host without www. ('' when it has none). */
  const siteOfPage = (t) => {
    try {
      return new URL(t.wc.getURL()).hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const zoomOf = (t) => Math.round((t.wc.isDestroyed() ? 1 : t.wc.getZoomFactor()) * 100) / 100;
  /** The key of a tab's site in the ones you zoomed yourself. */
  const zoomSite = (t, url) => `${t.ctx.partition}|${hostOf(url ?? t.wc.getURL())}`;
  /** Chrome's steps: the next one up or down from where the page is now, or back to the default zoom (100 % unless you chose another). */
  function zoom(t, op) {
    const now = t.wc.getZoomFactor();
    let next = settings.zoom;
    if (op === 'in') next = ZOOMS.find((z) => z > now + 0.001) ?? ZOOMS[ZOOMS.length - 1];
    else if (op === 'out') next = [...ZOOMS].reverse().find((z) => z < now - 0.001) ?? ZOOMS[0];
    // A site you zoomed is kept as you left it; Reset gives it back to the default.
    if (op === 'reset') zoomedByYou.delete(zoomSite(t));
    else zoomedByYou.add(zoomSite(t));
    t.wc.setZoomFactor(next);
    const z = zoomOf(t);
    tabState(t, { zoom: z });
    return z;
  }

  /** What a key is when it is a zoom (Ctrl or ⌘ with + − 0), or null. */
  const zoomKey = (k) => (k === '=' || k === '+' ? 'in' : k === '-' || k === '_' ? 'out' : k === '0' ? 'reset' : null);

  /**
   * A page you use takes keys itself, and the app's shortcuts would never reach the app's page: those go to it (Ctrl or ⌘
   * with T, W, L, R, F, P, D, H, J, B (the tab column), 1 to 9; Ctrl+Tab and Ctrl+Shift+Tab; Ctrl or ⌘+Shift+T, Ctrl or ⌘+Shift+N and
   * Shift+Delete; F5; Alt with the arrows, and ⌘ with [ and ] on a Mac). Zoom (Ctrl or ⌘ with + − 0) is the app's own, done here.
   */
  function shortcut(t, input) {
    const mod = MAC ? input.meta : input.control;
    const k = String(input.key || '');
    const lower = k.toLowerCase();
    if (mod && !input.alt && zoomKey(k)) return { zoom: zoomKey(k) };
    const hit =
      (mod && !input.alt && /^[twlrfpdhjb]$/.test(lower)) ||
      (mod && !input.alt && /^[1-9]$/.test(k)) ||
      (mod && input.shift && !input.alt && lower === 'n') ||
      (input.control && !input.alt && k === 'Tab') ||
      (mod && input.shift && !input.alt && k === 'Delete') ||
      (k === 'F5' && !mod && !input.alt) ||
      (input.alt && !mod && (k === 'ArrowLeft' || k === 'ArrowRight')) ||
      (MAC && input.meta && !input.alt && (k === '[' || k === ']'));
    return hit ? { key: k } : null;
  }

  function ownPage(t) {
    const { wc } = t;
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const hit = shortcut(t, input);
      if (!hit) return;
      e.preventDefault();
      if (hit.zoom) return void zoom(t, hit.zoom);
      uiOf(t)?.send('hydor:browser-key', { key: hit.key, ctrl: !!input.control, meta: !!input.meta, alt: !!input.alt, shift: !!input.shift });
    });
    // The page took the keys (you clicked into it): the window's page is told, so its address bar lets go of them as in any
    // browser. It cannot tell by itself: to it, that looks the same as the window going behind another one.
    wc.on('focus', () => uiOf(t)?.send('hydor:browser-page-focus', { target: t.id }));
    // Ctrl and the wheel zoom as in Chrome.
    wc.on('zoom-changed', (_e, direction) => zoom(t, direction === 'in' ? 'in' : 'out'));
    wc.on('audio-state-changed', (e) => tabState(t, { audible: !!e.audible }));
    // Each page counts its own blocked ads and trackers, and has the zoom its site has.
    wc.on('did-start-navigation', (d) => {
      if (!d.isMainFrame || d.isSameDocument) return;
      t.blocked = 0;
      t.blockedAds = 0;
      t.blockedTrackers = 0;
      t.blockedHosts = new Map();
      tabState(t, { blocked: 0 });
      bubbleOff(t);
      // Dark or not by the site it goes to (and again once it is there: a redirect may have taken it to another).
      void applyDark(t, d.url);
    });
    wc.on('did-navigate', () => {
      // A site you did not zoom has the default zoom.
      if (!zoomedByYou.has(zoomSite(t)) && Math.abs(t.wc.getZoomFactor() - settings.zoom) > 0.001) t.wc.setZoomFactor(settings.zoom);
      tabState(t, { zoom: zoomOf(t) });
      void applyDark(t);
    });
    wc.on('update-target-url', (_e, url) => void bubbleShow(t, url));
    wc.on('render-process-gone', () => bubbleOff(t));
    wc.on('enter-html-full-screen', () => enterFullScreen(t));
    wc.on('leave-html-full-screen', () => leaveFullScreen(t));
    wc.on('found-in-page', (_e, r) => {
      const f = t.finding;
      if (!f || r.requestId !== f.id || !r.finalUpdate) return;
      t.finding = null;
      clearTimeout(f.timer);
      f.resolve({ matches: r.matches, active: r.activeMatchOrdinal });
    });
    wc.on('context-menu', (_e, params) => void popupMenu(t, params));
  }

  /**
   * While a video (or any page) is shown full screen, the page fills the window. Electron takes the window in and out of
   * full screen itself (the page's owner window, which is the one showing it): doing it here too queues a second change
   * on macOS, where it is animated, and a change queued behind one that does nothing is never made, so the window stayed
   * full screen with the video back in its place. `was`: the window was full screen already, as far as it says now.
   */
  function enterFullScreen(t) {
    const win = t.shownIn && !t.shownIn.isDestroyed() ? t.shownIn : null;
    if (!win || t.fs) return;
    const fit = () => {
      const [width, height] = win.getContentSize();
      t.bounds = { x: 0, y: 0, width, height };
      t.view.setBounds(t.bounds);
    };
    bubbleOff(t);
    t.fs = { win, was: win.isFullScreen(), fit };
    try {
      // Laid over everything of the window (adding a view again brings it to the front).
      win.contentView.addChildView(t.view);
      fit();
      win.on('resize', fit);
    } catch (e) {
      log('full screen did not work', String((e && e.message) || e));
    }
    tabState(t, { fullscreen: true });
  }
  /** The page left full screen (Electron takes the window out of it, when the page put it there): back to its place. */
  function leaveFullScreen(t) {
    const fs = t.fs;
    if (!fs) return;
    t.fs = null;
    try {
      fs.win.removeListener('resize', fs.fit);
      if (!fs.win.isDestroyed()) {
        // The place the Browser page asked for (it may have moved while the page was full screen).
        if (t.wanted && t.shownIn === fs.win) place(t, fs.win);
      }
    } catch {}
    tabState(t, { fullscreen: false });
  }
  /** A page that is taken away (another tab, another page of the app) cannot stay full screen. */
  function exitFullScreen(t) {
    if (!t.fs) return;
    leaveFullScreen(t);
    if (!t.wc.isDestroyed()) t.wc.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {});
  }

  // ---- the address a link points at ------------------------------------------------------------------------------------

  /**
   * One bubble for each window: a transparent view laid over the corner of the tab shown there (the tab's own page draws over
   * the window's, so it has to be a view of its own, put in front of the tab's). { win, view, ready, seq, t, text, width,
   * side, poll, shown, dark, darkAt }.
   */
  const bubbles = new WeakMap();

  function bubbleFor(win) {
    let b = bubbles.get(win);
    if (b) return b;
    const view = new WebContentsView({ webPreferences: { partition: 'hydor-bubble', sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false } });
    view.setBackgroundColor('#00000000');
    const wc = view.webContents;
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (e) => e.preventDefault());
    b = { win, view, ready: null, seq: 0, t: null, text: '', width: 0, side: 'left', poll: null, shown: false, dark: null, darkAt: 0 };
    b.ready = wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(BUBBLE_PAGE)}`).then(
      () => true,
      () => false,
    );
    bubbles.set(win, b);
    win.once('closed', () => {
      bubbleHide(b);
      try {
        if (!wc.isDestroyed()) wc.close({ waitForBeforeUnload: false });
      } catch {}
    });
    return b;
  }

  /** Whether the app is dark now: its own theme (a class of its page), else the system's. */
  async function bubbleDark(b) {
    if (b.dark !== null && Date.now() - b.darkAt < 2000) return b.dark;
    let dark = nativeTheme.shouldUseDarkColors;
    try {
      const ui = b.win.webContents;
      if (!ui.isDestroyed()) dark = !!(await withTimeout(ui.executeJavaScript("document.documentElement.classList.contains('dark')", true), 400, 'The theme'));
    } catch {}
    b.dark = dark;
    b.darkAt = Date.now();
    return dark;
  }

  /** The address a link points at (a page's `update-target-url`; '' when the mouse leaves it) shown over the tab's corner. */
  async function bubbleShow(t, url) {
    const win = t.shownIn && !t.shownIn.isDestroyed() ? t.shownIn : null;
    // Only a tab you see has one: not a parked, closed or full-screen tab, and not one with a menu over it.
    if (!url || !win || t.gone || t.fs || t.wc.isDestroyed() || (openMenu && openMenu.t === t)) return bubbleOff(t);
    const b = bubbleFor(win);
    const seq = ++b.seq;
    b.t = t;
    t.bubble = b;
    const text = shownAddress(url);
    const widest = Math.max(60, Math.floor((t.view.getBounds().width * 2) / 3));
    if (!(await b.ready)) return;
    const dark = await bubbleDark(b);
    if (b.seq !== seq || t.gone) return;
    let width = 0;
    try {
      width = await withTimeout(b.view.webContents.executeJavaScript(`__bubble(${JSON.stringify(text)}, ${widest}, ${dark})`, true), 1000, 'The bubble');
    } catch (e) {
      return void log('the link bubble did not show', String((e && e.message) || e));
    }
    if (b.seq !== seq || t.gone || t.shownIn !== win) return;
    b.text = text;
    b.width = Math.max(20, Math.min(widest, Math.ceil(Number(width) || 0)));
    b.shown = true;
    bubbleLay(b);
    // The mouse may come to the corner it is in: looked at while it shows.
    b.poll ??= setInterval(() => bubbleLay(b), BUBBLE_POLL_MS);
    b.poll.unref?.();
  }

  /**
   * Puts the bubble where it belongs: the bottom left corner of the tab, 0 px from its bottom edge, or the bottom right
   * while the mouse is over (or near) the left one, and in front of the tab's own view.
   */
  function bubbleLay(b) {
    const { win, t } = b;
    if (!b.shown || !t || t.gone || win.isDestroyed() || t.shownIn !== win || t.fs) return bubbleHide(b);
    const tb = t.view.getBounds();
    const width = Math.min(b.width, tb.width);
    const y = tb.y + tb.height - BUBBLE_H;
    const left = tb.x + BUBBLE_SIDE;
    let side = 'left';
    try {
      const c = screen.getCursorScreenPoint();
      const o = win.getContentBounds();
      const cx = c.x - o.x;
      const cy = c.y - o.y;
      if (cx >= left - BUBBLE_AWAY && cx <= left + width + BUBBLE_AWAY && cy >= y - BUBBLE_AWAY && cy <= y + BUBBLE_H + BUBBLE_AWAY) side = 'right';
    } catch {}
    b.side = side;
    const want = { x: side === 'left' ? left : tb.x + tb.width - BUBBLE_SIDE - width, y, width, height: BUBBLE_H };
    try {
      const now = b.view.getBounds();
      if (now.x !== want.x || now.y !== want.y || now.width !== want.width || now.height !== want.height) b.view.setBounds(want);
      // Adding a view again brings it to the front: after the tab's own (placed again) it is the last of the window's.
      const kids = win.contentView.children;
      if (kids[kids.length - 1] !== b.view) win.contentView.addChildView(b.view);
    } catch (e) {
      log('the link bubble could not be placed', String((e && e.message) || e));
    }
  }

  function bubbleHide(b) {
    b.seq++;
    b.shown = false;
    b.t = null;
    clearInterval(b.poll);
    b.poll = null;
    try {
      if (!b.win.isDestroyed() && b.win.contentView.children.includes(b.view)) b.win.contentView.removeChildView(b.view);
    } catch {}
  }

  /** The tab's bubble goes, if it has the window's (a tab that is parked, closed, full screen or has a menu over it, or whose link the mouse left). */
  function bubbleOff(t) {
    const b = t.bubble;
    if (b && b.t === t) bubbleHide(b);
  }

  // ---- the right-click menu ----------------------------------------------------------------------------------------

  /** The search engine as the server has it (the app's own page asks it), for the menu's "Search Google for …". */
  let engine = { name: 'Google', template: ENGINES.google[1], translateTo: '' };
  async function readEngine() {
    const win = mainWindow();
    if (!win || win.isDestroyed()) return;
    try {
      const p = await withTimeout(win.webContents.executeJavaScript("fetch('/api/browser/browsing/prefs', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)"), 600, 'The search engine');
      if (!p || typeof p !== 'object') return;
      // The language "Translate this page" goes to (the app does the translating).
      if (typeof p.translateTo === 'string' && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(p.translateTo)) engine = { ...engine, translateTo: p.translateTo };
      if (ENGINES[p.engine]) engine = { ...engine, name: ENGINES[p.engine][0], template: ENGINES[p.engine][1] };
      else if (p.engine === 'custom' && typeof p.customSearch === 'string' && /^https?:\/\/.+%s/i.test(p.customSearch)) {
        let name = 'your search engine';
        try {
          name = new URL(p.customSearch.replace('%s', 'x')).hostname.replace(/^www\./, '');
        } catch {}
        engine = { ...engine, name, template: p.customSearch };
      }
    } catch {}
  }

  const web = (u) => /^https?:\/\//i.test(String(u || ''));
  /** A click on the page itself: not on a link, a picture, a video or audio, words or a field. */
  const plainPage = (params) => !params.linkURL && !params.isEditable && !String(params.selectionText || '').trim() && !(params.mediaType && params.mediaType !== 'none');
  const short = (text, n = 30) => {
    const one = String(text).replace(/\s+/g, ' ').trim();
    return one.length > n ? `${one.slice(0, n - 1)}…` : one;
  };

  // ---- a picture of a page: to keep in a project, or for a question ---------------------------------------------------------

  /** The biggest picture kept or asked about. */
  const PICTURE_MAX = 50 * 1024 * 1024;
  const PICTURE_MS = 60_000;
  /** Where the pictures wait for the app to take them: kept ones go after a few minutes, those of a question after a week. */
  const pictureDir = (what) => path.join(os.tmpdir(), `hydor-browser-${what}`);
  const PICTURE_KEEP = { library: 10 * 60_000, ask: 7 * 24 * 3_600_000 };

  /** Whether a picture can be read from this address: a web address, or a picture inside the page's own data or blobs. */
  const readable = (src) => /^(https?:|data:|blob:)/i.test(String(src || ''));

  /** The kind of picture the first bytes say (kept pictures are PNG, JPEG, WebP, GIF and AVIF), or null. */
  function pictureKind(b) {
    const at = (i, s) => b.length >= i + s.length && b.subarray(i, i + s.length).toString('latin1') === s;
    if (b.length >= 8 && b[0] === 0x89 && at(1, 'PNG')) return 'png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
    if (at(0, 'GIF8')) return 'gif';
    if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
    if (at(4, 'ftyp') && (at(8, 'avif') || at(8, 'avis'))) return 'avif';
    if (at(0, 'BM')) return 'bmp';
    if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico';
    return null;
  }

  const tooBig = () => new Error('That picture is over 50 MB.');

  /** The bytes of a data: address. */
  function fromData(src) {
    const comma = src.indexOf(',');
    if (comma < 0) throw new Error('That picture could not be read.');
    const head = src.slice(5, comma);
    const body = src.slice(comma + 1);
    if (body.length > PICTURE_MAX * 1.4) throw tooBig();
    const bytes = /;base64$/i.test(head) ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'latin1');
    if (bytes.length > PICTURE_MAX) throw tooBig();
    return bytes;
  }

  /**
   * The bytes of the picture at `src` as this tab sees it: its own session reads it (so a picture behind a sign-in is
   * there, with the page as its referrer); a blob: address only the page itself can read, so the page does.
   */
  async function readPicture(t, src, page) {
    if (/^data:/i.test(src)) return fromData(src);
    if (/^blob:/i.test(src)) {
      const url = await withTimeout(
        t.wc.executeJavaScript(
          `fetch(${JSON.stringify(src)}).then((r) => r.blob()).then((b) => b.size > ${PICTURE_MAX} ? 'big' : new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => no(f.error); f.readAsDataURL(b); }))`,
          true,
        ),
        PICTURE_MS,
        'The picture',
      );
      if (url === 'big') throw tooBig();
      return fromData(String(url));
    }
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), PICTURE_MS);
    try {
      const r = await t.wc.session.fetch(src, { signal: stop.signal, headers: page && /^https?:/i.test(page) ? { Referer: page } : {} });
      if (!r.ok) throw new Error(`The site did not give the picture (${r.status}).`);
      if (Number(r.headers.get('content-length')) > PICTURE_MAX) throw tooBig();
      const parts = [];
      let got = 0;
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (got > PICTURE_MAX) {
          stop.abort();
          throw tooBig();
        }
        parts.push(Buffer.from(value));
      }
      return Buffer.concat(parts);
    } catch (e) {
      if (stop.signal.aborted && !/50 MB/.test(String((e && e.message) || e))) throw new Error('The picture took too long to load.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** A name for the picture's file from its address (or the page's title): letters, digits, dots, dashes. */
  function pictureName(src, title) {
    let base = '';
    if (/^https?:/i.test(src)) {
      try {
        base = decodeURIComponent(path.basename(new URL(src).pathname));
      } catch {}
    }
    base = base.replace(/\.[A-Za-z0-9]{1,5}$/, '');
    // A name that says nothing (a hash, a number) is no better than the page's title.
    if (!/[A-Za-z]{3}/.test(base) || /^[0-9a-f-]{24,}$/i.test(base)) base = '';
    base = (base || String(title || '').trim() || 'picture').replace(/[^\p{L}\p{N}._ -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
    return base || 'picture';
  }

  /** The picture of a right-click, read and written to a file of its own (PNG, JPEG, WebP, GIF or AVIF; a bitmap or icon becomes a PNG). */
  async function pictureFile(t, params, what) {
    const src = String(params.srcURL || '');
    if (!readable(src)) throw new Error('That picture cannot be read.');
    let bytes = await readPicture(t, src, params.pageURL || t.wc.getURL());
    let kind = pictureKind(bytes);
    if (kind === 'bmp' || kind === 'ico') {
      const img = nativeImage.createFromBuffer(bytes);
      if (img.isEmpty()) throw new Error('That picture could not be read.');
      bytes = img.toPNG();
      kind = 'png';
    }
    if (!kind) throw new Error('Only a PNG, JPEG, WebP, GIF or AVIF picture can be kept (this one is another kind, or not a picture).');
    const dir = pictureDir(what);
    await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
    const name = `${pictureName(src, t.wc.getTitle())}.${kind}`;
    // A folder of its own, so the file keeps the picture's own name (the kept picture is named after it).
    const own = path.join(dir, crypto.randomBytes(4).toString('hex'));
    await fs.promises.mkdir(own, { recursive: true, mode: 0o700 });
    const file = path.join(own, name);
    await fs.promises.writeFile(file, bytes, { mode: 0o600 });
    // What is old goes now, and this one too once the app has taken it (a picture of a question stays: the agent may open it again).
    void sweepPictures(what);
    if (what === 'library') setTimeout(() => fs.promises.rm(own, { recursive: true, force: true }).catch(() => {}), PICTURE_KEEP.library).unref();
    return { path: file, name };
  }

  async function sweepPictures(what) {
    const dir = pictureDir(what);
    try {
      const now = Date.now();
      for (const f of await fs.promises.readdir(dir)) {
        const p = path.join(dir, f);
        const st = await fs.promises.stat(p).catch(() => null);
        if (st && now - st.mtimeMs > PICTURE_KEEP[what]) await fs.promises.rm(p, { recursive: true, force: true });
      }
    } catch {}
  }

  /** Reads the picture, then tells the app (a command), or tells it why not. */
  async function sendPicture(t, params, what, command) {
    const page = params.pageURL || t.wc.getURL();
    try {
      const f = await pictureFile(t, params, what);
      uiOf(t)?.send('hydor:browser-command', { ...command, path: f.path, name: f.name, url: page, title: t.wc.getTitle() });
    } catch (e) {
      log('a picture could not be read', String((e && e.message) || e));
      uiOf(t)?.send('hydor:browser-command', { cmd: 'picture-failed', message: String((e && e.message) || e) });
    }
  }

  /** The most of a selection a question quotes (the app cuts it there; this keeps what travels to the window small). */
  const QUOTE_MAX = 20_000;

  /**
   * Asks an agent about words picked in a page. The menu's own copy of the selection is cut short (Chromium keeps about a
   * thousand characters of it), so the page itself is asked for the whole of it, when its main frame holds the same words.
   */
  async function askAbout(t, text, url) {
    const words = await wholeSelection(t, text);
    uiOf(t)?.send('hydor:browser-command', { cmd: 'ask', text: words.slice(0, QUOTE_MAX), url });
  }

  /** The whole selection of the page when its main frame holds the same words as the menu's (cut short) copy, else that copy. */
  async function wholeSelection(t, text) {
    let words = text;
    try {
      const plain = (v) => String(v || '').replace(/\s+/g, ' ').trim();
      const whole = String(await withTimeout(t.wc.executeJavaScript('String(window.getSelection() || "")', true), 800, 'The selection')).trim();
      if (plain(whole).length > plain(text).length && plain(whole).startsWith(plain(text).slice(0, 200))) words = whole;
    } catch {}
    return words;
  }

  /** Words picked in a page, for the app to translate (it shows the translation). */
  async function translateAbout(t, text, url) {
    const words = await wholeSelection(t, text);
    uiOf(t)?.send('hydor:browser-command', { cmd: 'translate-text', text: words.slice(0, TRANSLATE_MAX), url });
  }

  // ---- video and audio: the items of the menu act on the element that was clicked -------------------------------------------

  /**
   * Does something to the video or audio at a click, in a world of its own that the page's scripts cannot see (as a click
   * of yours, so play() and picture in picture are allowed). The element is the one at the point (into open shadow roots),
   * else the video or audio whose box holds the point, the one with this source first.
   */
  async function mediaDo(t, params, op) {
    const z = t.wc.getZoomFactor() || 1;
    const x = Number(params.x) / z;
    const y = Number(params.y) / z;
    const code = `(async () => {
      const x = ${JSON.stringify(x)}, y = ${JSON.stringify(y)}, src = ${JSON.stringify(String(params.srcURL || ''))};
      const isMedia = (e) => e && (e instanceof HTMLVideoElement || e instanceof HTMLAudioElement);
      let m = null;
      let e = document.elementFromPoint(x, y);
      for (let i = 0; e && e.shadowRoot && i < 32; i++) { const d = e.shadowRoot.elementFromPoint(x, y); if (!d || d === e) break; e = d; }
      if (isMedia(e)) m = e;
      else if (e && e.closest) { const c = e.closest('video,audio'); if (isMedia(c)) m = c; }
      if (!m) {
        const all = [];
        const walk = (root) => { for (const el of root.querySelectorAll('*')) { if (isMedia(el)) all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
        walk(document);
        const inside = all.filter((el) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
        m = inside.find((el) => el.currentSrc === src) || inside[0] || null;
      }
      if (!m) return 'none';
      const op = ${JSON.stringify(op)};
      if (op === 'play') await m.play();
      else if (op === 'pause') m.pause();
      else if (op === 'mute') m.muted = true;
      else if (op === 'unmute') m.muted = false;
      else if (op === 'loop') m.loop = !m.loop;
      else if (op === 'controls') m.controls = !m.controls;
      else if (op === 'pip') {
        if (document.pictureInPictureElement === m) await document.exitPictureInPicture();
        else await m.requestPictureInPicture();
      }
      return 'done';
    })()`;
    try {
      const r = await withTimeout(t.wc.executeJavaScriptInIsolatedWorld(1000, [{ code }], true), 5000, 'The media');
      if (r === 'none') log('no video or audio where you clicked');
    } catch (e) {
      log('a video or audio item did not work', op, String((e && e.message) || e));
    }
  }

  /** Pages that keep your highlights: websites and files (not a blank page, an error page or an extension's). */
  const marksOn = (u) => /^(https?|file):\/\//i.test(String(u || ''));

  /** The highlight where you clicked (the id on its marks, or ''), asked of the page in a world of its own, which its scripts cannot see. */
  async function highlightAt(t, params) {
    try {
      const z = t.wc.getZoomFactor() || 1;
      const x = Number(params.x) / z;
      const y = Number(params.y) / z;
      // Into open shadow roots too (a mark inside a web component): the page's own answer is the component.
      const code = `(() => { let e = document.elementFromPoint(${x}, ${y}); for (let i = 0; e && e.shadowRoot && i < 32; i++) { const d = e.shadowRoot.elementFromPoint(${x}, ${y}); if (!d || d === e) break; e = d; } const m = e && e.closest && e.closest('mark.hydor-hl'); return m ? String(m.getAttribute('data-hydor-hl')) : ''; })()`;
      const id = await withTimeout(t.wc.executeJavaScriptInIsolatedWorld(1000, [{ code }]), 1000, 'The highlight');
      return /^[0-9a-f-]{36}$/.test(id) ? id : '';
    } catch {
      return '';
    }
  }

  /**
   * The items of the menu for a click in one of your tabs, as a template for Menu.buildFromTemplate: what the page offers
   * where you clicked (a link, an image, selected text, a field) and what any page has. Each has an id (the window's page
   * draws the menu by them, in the app's own look and language: menuInPage), and those whose words change have them in
   * `args` too. An item may have `checked` (Loop, Show controls, Picture in picture). A private tab opens its links and
   * pictures in a private tab again, has no "Open link in private tab", and no Ask items (agents never get a private tab).
   */
  function menuTemplate(t, params, eng = engine) {
    const { wc } = t;
    const isPrivate = !!t.ctx.private;
    /** A new tab for an address: of the same private context when this tab is private. */
    const open = (url) => void openTab(url, t).catch((e) => log('a tab could not open', String((e && e.message) || e)));
    const items = [];
    const sep = () => items.length && items[items.length - 1].type !== 'separator' && items.push({ type: 'separator' });
    const flags = params.editFlags || {};
    const text = String(params.selectionText || '').trim();
    const page = params.pageURL || wc.getURL();
    // Words selected in a frame inside the page (another page shown in it) are not the page's own: no highlight of them.
    const inFrame = !!params.frame && params.frame !== wc.mainFrame;
    // Spelling comes first in a field: the word's suggestions, and adding it to the dictionary.
    if (params.isEditable && params.misspelledWord) {
      (params.dictionarySuggestions || []).slice(0, 5).forEach((w, i) => items.push({ id: `spell-${i}`, label: w, click: () => wc.replaceMisspelling(w) }));
      if (!(params.dictionarySuggestions || []).length) items.push({ id: 'no-suggestions', label: 'No suggestions', enabled: false });
      items.push({ id: 'add-to-dictionary', label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
      sep();
    }
    if (params.linkURL) {
      if (web(params.linkURL)) {
        items.push({ id: 'open-link', label: 'Open link in new tab', click: () => open(params.linkURL) });
        if (!isPrivate) items.push({ id: 'open-link-private', label: 'Open link in private tab', click: () => uiOf(t)?.send('hydor:browser-command', { cmd: 'open-private', url: params.linkURL }) });
        items.push({ id: 'open-link-external', label: 'Open link in your default browser', click: () => void shell.openExternal(params.linkURL).catch(() => {}) });
      }
      items.push({ id: 'copy-link', label: 'Copy link address', click: () => copyText(params.linkURL) });
      if (web(params.linkURL)) items.push({ id: 'read-link-later', label: 'Read link later', click: () => uiOf(t)?.send('hydor:browser-command', { cmd: 'later', url: params.linkURL, title: String(params.linkText || '').trim() }) });
      sep();
    }
    if (params.mediaType === 'image' && params.srcURL) {
      if (web(params.srcURL)) items.push({ id: 'open-image', label: 'Open image in new tab', click: () => open(params.srcURL) });
      items.push({ id: 'save-image-as', label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) });
      if (readable(params.srcURL)) {
        items.push({ id: 'save-image-library', label: 'Save image', click: () => void sendPicture(t, params, 'library', { cmd: 'save-image' }) });
        if (!isPrivate) items.push({ id: 'ask-image', label: 'Ask about this image', click: () => void sendPicture(t, params, 'ask', { cmd: 'ask-image' }) });
      }
      items.push({ id: 'copy-image', label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) });
      items.push({ id: 'copy-image-address', label: 'Copy image address', click: () => copyText(params.srcURL) });
      sep();
    }
    if ((params.mediaType === 'video' || params.mediaType === 'audio') && params.mediaFlags) {
      const kind = params.mediaType;
      const f = params.mediaFlags;
      const src = String(params.srcURL || '');
      const act = (op) => () => void mediaDo(t, params, op);
      if (!f.inError) items.push(f.isPaused ? { id: 'media-play', label: 'Play', click: act('play') } : { id: 'media-pause', label: 'Pause', click: act('pause') });
      if (f.hasAudio !== false) items.push(f.isMuted ? { id: 'media-unmute', label: 'Unmute', click: act('unmute') } : { id: 'media-mute', label: 'Mute', click: act('mute') });
      if (f.canLoop !== false) items.push({ id: 'media-loop', label: 'Loop', checked: !!f.isLooping, click: act('loop') });
      if (f.canToggleControls) items.push({ id: 'media-controls', label: 'Show controls', checked: !!f.isControlsVisible, click: act('controls') });
      if (kind === 'video' && f.canShowPictureInPicture && PIP) items.push({ id: 'media-pip', label: 'Picture in picture', checked: !!f.isShowingPictureInPicture, click: act('pip') });
      sep();
      if (web(src)) items.push({ id: `open-${kind}`, label: `Open ${kind} in new tab`, click: () => open(src) });
      if (web(src) && f.canSave !== false) items.push({ id: `save-${kind}`, label: `Save ${kind} as…`, click: () => wc.downloadURL(src) });
      if (/^(https?|file):/i.test(src)) items.push({ id: `copy-${kind}-address`, label: `Copy ${kind} address`, click: () => copyText(src) });
      sep();
    }
    if (params.isEditable) {
      items.push({ id: 'undo', label: 'Undo', enabled: !!flags.canUndo, click: () => wc.undo() });
      items.push({ id: 'redo', label: 'Redo', enabled: !!flags.canRedo, click: () => wc.redo() });
      items.push({ type: 'separator' });
      items.push({ id: 'cut', label: 'Cut', enabled: !!flags.canCut, click: () => wc.cut() });
      items.push({ id: 'copy', label: 'Copy', enabled: !!flags.canCopy, click: () => wc.copy() });
      items.push({ id: 'paste', label: 'Paste', enabled: !!flags.canPaste, click: () => wc.paste() });
      items.push({ id: 'select-all', label: 'Select all', enabled: !!flags.canSelectAll, click: () => wc.selectAll() });
      sep();
    }
    if (text) {
      if (!params.isEditable) items.push({ id: 'copy', label: 'Copy', click: () => wc.copy() });
      const words = short(text);
      items.push({ id: 'search', label: `Search ${eng.name} for “${words}”`, args: { engine: eng.name, text: words }, click: () => open(eng.template.replace('%s', encodeURIComponent(text))) });
      if (!isPrivate) items.push({ id: 'ask', label: `Ask an agent about “${words}”`, args: { text: words }, click: () => void askAbout(t, text, page) });
      if (!params.isEditable && marksOn(page)) items.push({ id: 'translate-selection', label: `Translate “${words}”`, args: { text: words }, click: () => void translateAbout(t, text, page) });
      if (!params.isEditable && !inFrame && marksOn(page)) items.push({ id: 'highlight', label: 'Highlight', click: () => uiOf(t)?.send('hydor:browser-command', { cmd: 'highlight', target: t.id, url: page, title: wc.getTitle() }) });
      sep();
    }
    // Where a highlight of yours is (popupMenu looked): taking it away.
    if (params.hydorHighlight && marksOn(page)) {
      items.push({ id: 'remove-highlight', label: 'Remove highlight', click: () => uiOf(t)?.send('hydor:browser-command', { cmd: 'unhighlight', id: params.hydorHighlight, url: page }) });
      sep();
    }
    if (!params.isEditable && !text) {
      const nav = wc.navigationHistory;
      items.push({ id: 'back', label: 'Back', enabled: nav.canGoBack(), click: () => nav.goBack() });
      items.push({ id: 'forward', label: 'Forward', enabled: nav.canGoForward(), click: () => nav.goForward() });
      items.push({ id: 'reload', label: 'Reload', click: () => wc.reload() });
      // On the page itself (not on a link, a picture or a video), the app translates it (or shows the original again).
      if (plainPage(params) && marksOn(page)) items.push({ id: 'translate-page', label: 'Translate this page', args: { lang: String(eng.translateTo || engine.translateTo || '') }, click: () => uiOf(t)?.send('hydor:browser-command', { cmd: 'translate', target: t.id }) });
      sep();
    }
    items.push({ id: 'bookmark', label: 'Bookmark this page', click: () => uiOf(t)?.send('hydor:browser-command', { cmd: 'bookmark', url: page, title: wc.getTitle() }) });
    if (web(page)) items.push({ id: 'read-later', label: 'Read this page later', click: () => uiOf(t)?.send('hydor:browser-command', { cmd: 'later', url: page, title: wc.getTitle() }) });
    items.push({ id: 'print', label: 'Print…', click: () => wc.print({ printBackground: true }) });
    items.push({ type: 'separator' });
    items.push({ id: 'inspect', label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) });
    return items;
  }

  // ---- the menu drawn by the window's page ---------------------------------------------------------------------------

  /** The window pages (their webContents) that draw your tabs' right-click menus themselves, in the app's own look. */
  const menuPages = new Set();
  const menuHooked = new WeakSet();
  /** The menu such a page shows now, at most one: { id, t, ui, items: Map(id → template item) }. */
  let openMenu = null;
  let menuSeq = 0;

  /** A window's page says it draws the menus itself (on), or no longer does; a page loaded there again says so again. */
  function menusFrom(e, on) {
    if (!fromOwnPage(e)) return;
    const ui = e.sender;
    if (!on) return void menuPages.delete(ui);
    menuPages.add(ui);
    if (menuHooked.has(ui)) return;
    menuHooked.add(ui);
    ui.on('did-navigate', () => menuPages.delete(ui));
    ui.once('destroyed', () => menuPages.delete(ui));
  }

  /**
   * The menu for the window's page that shows the tab, when that page draws menus: its items (id, words, whether they can
   * be used, and the words that change), where the click was in the page's own pixels, and a picture of the tab as it is
   * now, which the page shows in the tab's place while its menu lies over it (the tab's own page always draws over the
   * window's). Its keys go to the window's page meanwhile. False when the system's own menu is to show instead.
   */
  async function menuInPage(t, params, tpl) {
    const ui = t.shownIn && !t.shownIn.isDestroyed() ? t.shownIn.webContents : null;
    if (!ui || ui.isDestroyed() || !menuPages.has(ui)) return false;
    const id = ++menuSeq;
    const items = new Map();
    const list = [];
    for (const it of tpl) {
      if (it.type === 'separator') list.push({ type: 'separator' });
      else {
        items.set(it.id, it);
        list.push({ id: it.id, label: it.label, enabled: it.enabled !== false, ...(typeof it.checked === 'boolean' ? { checked: it.checked } : {}), ...(it.args ? { args: it.args } : {}) });
      }
    }
    openMenu = { id, t, ui, items };
    bubbleOff(t);
    const still = await stillOf(t);
    if (!openMenu || openMenu.id !== id || t.gone || t.wc.isDestroyed() || ui.isDestroyed()) return true;
    const b = t.view.getBounds();
    const z = ui.getZoomFactor() || 1;
    ui.send('hydor:browser-menu', { target: t.id, menu: id, x: (b.x + (Number(params.x) || 0)) / z, y: (b.y + (Number(params.y) || 0)) / z, items: list, still });
    ui.focus();
    return true;
  }

  /** What was picked in the menu the window's page drew (an item's id), or null when it closed with nothing picked. */
  function menuPick(e, target, menu, item) {
    if (!fromOwnPage(e)) return false;
    const m = openMenu;
    if (!m || m.id !== Number(menu) || m.t.id !== String(target) || m.ui !== e.sender) return false;
    openMenu = null;
    if (item === null || item === undefined) return true;
    const it = m.items.get(String(item));
    if (!it || it.enabled === false || typeof it.click !== 'function' || m.t.gone || m.t.wc.isDestroyed()) return false;
    try {
      it.click();
    } catch (err) {
      log('a menu item failed', String((err && err.message) || err));
      return false;
    }
    return true;
  }

  async function popupMenu(t, params) {
    if (t.gone || t.wc.isDestroyed()) return;
    // A menu over the page takes the link bubble away.
    bubbleOff(t);
    // The server's prefs are only asked for when an item needs them: words selected (the search engine, translating them) or
    // a click on the page itself (the language "Translate this page" goes to).
    if (String(params.selectionText || '').trim() || (plainPage(params) && marksOn(params.pageURL || t.wc.getURL()))) await readEngine();
    // Whether the click is on one of your highlights (a page of a site or a file, not in a field).
    const here = params.pageURL || t.wc.getURL();
    const hl = marksOn(here) && !params.isEditable ? await highlightAt(t, params) : '';
    if (t.gone || t.wc.isDestroyed()) return;
    if (hl) params = { ...params, hydorHighlight: hl };
    const tpl = menuTemplate(t, params);
    // In the app's own look when the window's page draws it; the system's menu for a page that does not (an older one).
    if (await menuInPage(t, params, tpl).catch(() => false)) return;
    const win = t.shownIn && !t.shownIn.isDestroyed() ? t.shownIn : mainWindow();
    if (!win || win.isDestroyed() || t.gone || t.wc.isDestroyed()) return;
    try {
      // An item with `checked` is a checkbox in the system's menu.
      Menu.buildFromTemplate(tpl.map((it) => (typeof it.checked === 'boolean' ? { ...it, type: 'checkbox' } : it))).popup({ window: win });
    } catch (e) {
      log('the menu did not open', String((e && e.message) || e));
    }
  }

  /** The debugger on, the target's id (its main frame's), Fetch if the guard has it on; then the server hears of it. */
  async function announce(t) {
    const { conn } = t;
    t.dbg.attach('1.3');
    t.dbg.on('message', (_e, method, params, sessionId) => onPageEvent(t, method, params, sessionId));
    const tree = await withTimeout(t.dbg.sendCommand('Page.getFrameTree'), 10_000, 'The new tab');
    t.id = tree.frameTree.frame.id;
    if (t.gone) return;
    conn.targets.set(t.id, t);
    conn.sessions.set(t.sid, t);
    if (conn.fetch) await t.dbg.sendCommand('Fetch.enable', conn.fetch).catch(() => {});
    // Dark or not before its first page loads (the server resumes the tab after it has heard of it).
    await applyDark(t, '');
    t.ready = true;
    if (conn.discover) event(conn, 'Target.targetCreated', { targetInfo: { ...infoOf(t), attached: false } });
    event(conn, 'Target.attachedToTarget', { sessionId: t.sid, targetInfo: infoOf(t), waitingForDebugger: true });
    extTab(t);
  }

  /** Extensions see your own tabs (not private ones, not agents' tabs in your browsing). */
  const forExtensions = (t) => !!ext && t.conn.profile === BROWSING && !t.offscreen && !t.agent && !t.ctx.private && !t.gone;
  function extTab(t) {
    if (forExtensions(t) && ext.tabAdded) ext.tabAdded(t.wc);
  }

  async function loadBlank(wc) {
    const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve));
    wc.loadURL('about:blank').catch(() => {});
    await withTimeout(loaded, 10_000, 'A blank page');
  }

  /** Target.createTarget (and a tab an extension opens). Answers when the server has been told of the new tab. */
  async function createTarget(conn, p) {
    let ctx = conn.defaultCtx;
    if (p.browserContextId && p.browserContextId !== conn.defaultCtx.id) {
      ctx = conn.contexts.get(p.browserContextId);
      if (!ctx) throw new RpcError(-32602, 'Failed to find browser context with id ' + p.browserContextId);
    }
    // Your own browsing's tabs (and its private ones) are real pages; everything else, and an agent's tab there, is drawn off screen.
    const own = conn.profile === BROWSING && !p.hydorAgent && (ctx === conn.defaultCtx || ctx.private);
    const t = makeTarget(conn, ctx, { offscreen: !own, agent: !own });
    try {
      await loadBlank(t.wc);
      await announce(t);
    } catch (e) {
      destroyTarget(t, false);
      throw e;
    }
    const url = String(p.url || '');
    if (url && url !== 'about:blank') {
      // The server sets the tab up first, and resumes it; the page loads then (or after a while, should it never).
      const go = () => {
        if (t.resume !== go) return;
        t.resume = null;
        if (!t.gone) t.wc.loadURL(url).catch(() => {});
      };
      t.resume = go;
      setTimeout(go, 5000).unref?.();
    }
    return { targetId: t.id };
  }

  /** A page opened by another (window.open, target=_blank): a tab of the same partition, drawn like its opener. */
  function popup(opener, options) {
    const { conn, ctx } = opener;
    const t = makeTarget(conn, ctx, { offscreen: opener.offscreen, agent: opener.agent, opener, webContents: options.webContents });
    t.dbg.attach('1.3');
    t.dbg.on('message', (_e, method, params, sessionId) => onPageEvent(t, method, params, sessionId));
    if (!t.offscreen) void applyDark(t, opener.wc.isDestroyed() ? '' : opener.wc.getURL());
    // Chrome holds a pop-up until the server has set it up; here it is already on its way, so the guard goes on before
    // it asks for anything (the debugger's Fetch is answered at once), and its session is known from the start.
    conn.sessions.set(t.sid, t);
    // A window.open pop-up comes with no size (0 by 0, and it never draws): it has the page size until the server sets one.
    if (t.offscreen) {
      const css = opener.css || { w: PAGE.width, h: PAGE.height };
      t.css = css;
      t.dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: css.w, height: css.h, deviceScaleFactor: 1, mobile: false }).catch(() => {});
    }
    const guard = conn.fetch || opener.fetch;
    if (guard) {
      t.fetch = conn.fetch ? null : guard;
      t.dbg.sendCommand('Fetch.enable', guard).catch(() => {});
    }
    void (async () => {
      try {
        // The page is already loading: its main frame's id is there once it has started.
        let tree;
        for (let i = 0; i < 20 && !tree; i++) {
          tree = await withTimeout(t.dbg.sendCommand('Page.getFrameTree'), 2000, 'The new window').catch(() => null);
          if (!tree) await sleep(100);
        }
        if (!tree) throw new Error('the new window has no page');
        t.id = tree.frameTree.frame.id;
        if (t.gone) return;
        conn.targets.set(t.id, t);
        conn.sessions.set(t.sid, t);
        if (conn.fetch) await t.dbg.sendCommand('Fetch.enable', conn.fetch).catch(() => {});
        t.ready = true;
        if (conn.discover) event(conn, 'Target.targetCreated', { targetInfo: { ...infoOf(t), attached: false } });
        event(conn, 'Target.attachedToTarget', { sessionId: t.sid, targetInfo: infoOf(t), waitingForDebugger: true });
        extTab(t);
      } catch (e) {
        log('a new window could not be set up', String((e && e.message) || e));
        destroyTarget(t, false);
      }
    })();
    return options.webContents;
  }

  function destroyTarget(t, selfClosed) {
    if (t.gone) return;
    t.gone = true;
    if (ext && ext.tabRemoved) ext.tabRemoved(t.wc);
    const { conn } = t;
    byWc.delete(t.wc.id);
    bubbleOff(t);
    clearTimeout(t.newsTimer);
    clearTimeout(t.finding && t.finding.timer);
    // A page that was full screen takes the window back out of it.
    if (t.fs) {
      const { fs } = t;
      t.fs = null;
      try {
        fs.win.removeListener('resize', fs.fit);
        if (!fs.was && !fs.win.isDestroyed()) fs.win.setFullScreen(false);
      } catch {}
    }
    for (const w of t.watchers.values()) w.stop?.();
    t.watchers.clear();
    if (t.id) {
      conn.targets.delete(t.id);
      conn.sessions.delete(t.sid);
      for (const c of t.children) conn.sessions.delete(c);
      for (const [k, r] of conn.requests) if (r.t === t) (clearTimeout(r.timer), conn.requests.delete(k));
      if (t.ready) {
        event(conn, 'Target.detachedFromTarget', { sessionId: t.sid, targetId: t.id });
        if (conn.discover) event(conn, 'Target.targetDestroyed', { targetId: t.id });
      }
    }
    try {
      if (t.dbg.isAttached()) t.dbg.detach();
    } catch {}
    try {
      (t.shownIn && !t.shownIn.isDestroyed() ? t.shownIn : host && !host.isDestroyed() ? host : null)?.contentView.removeChildView(t.view);
    } catch {}
    if (!selfClosed) {
      try {
        if (!t.wc.isDestroyed()) t.wc.close({ waitForBeforeUnload: false });
      } catch {}
    }
  }

  /** A context's session is let go: what its in-memory partition held (cookies, storage, cache, sign-ins) is cleared, and the blocker leaves it. */
  function forgetSession(ctx) {
    const { ses } = ctx;
    if (ctx.private && adblock) adblock.detach(ses);
    ses.clearStorageData().catch(() => {});
    ses.clearCache().catch(() => {});
    ses.clearAuthCache().catch(() => {});
    if (sessions.get(ses) === ctx) sessions.delete(ses);
  }

  function closeConn(conn, why) {
    if (conn.closed) return;
    conn.closed = true;
    conns.delete(conn.id);
    for (const t of [...conn.targets.values()]) destroyTarget(t, false);
    for (const t of [...byWc.values()]) if (t.conn === conn) destroyTarget(t, false);
    for (const r of conn.requests.values()) clearTimeout(r.timer);
    conn.requests.clear();
    for (const ctx of [conn.defaultCtx, ...conn.contexts.values()]) {
      for (const w of ctx.asks.values()) w.done(false);
      // What an in-memory partition (a fresh profile's, a context's) held goes with it.
      if (!ctx.persistent) forgetSession(ctx);
      else if (sessions.get(ctx.ses) === ctx) sessions.delete(ctx.ses);
    }
    log('browser closed', conn.id, why || '');
  }

  // ---- what the pages say: events, and the guard's Fetch --------------------------------------------------------------

  /** A key for a paused request of a page's own (page-level Fetch, the guard of one tab). */
  const pauseKey = (t, sid, requestId) => `${t.sid}:${sid}:${requestId}`;

  function failPaused(conn, key) {
    const r = conn.requests.get(key);
    if (!r) return;
    conn.requests.delete(key);
    if (!r.t.gone) r.t.dbg.sendCommand('Fetch.failRequest', { requestId: r.orig, errorReason: 'TimedOut' }, r.sid || undefined).catch(() => {});
  }

  function onPageEvent(t, method, params, sid) {
    const { conn } = t;
    if (t.gone) return;
    // The top page's session is ours (a fresh id); a child's is the debugger's own.
    const session = sid ? sid : t.sid;
    if (method === 'Inspector.targetCrashed') return; // from render-process-gone
    if (method === 'Target.attachedToTarget') return void childAttached(t, params, session);
    if (method === 'Target.detachedFromTarget') {
      t.children.delete(params.sessionId);
      conn.sessions.delete(params.sessionId);
    }
    if (method === 'Fetch.requestPaused' || method === 'Fetch.authRequired') {
      // Never wait for the server for ever.
      const orig = params.requestId;
      if (conn.fetch) {
        // The guard is the browser's: every page's pauses go to the browser, which tells them apart by this id.
        const key = `${++conn.seq}.${orig}`;
        conn.requests.set(key, { t, sid, orig, timer: setTimeout(() => failPaused(conn, key), PAUSE_MS) });
        return event(conn, method, { ...params, requestId: key });
      }
      const key = pauseKey(t, sid || '', orig);
      if (!conn.requests.has(key)) conn.requests.set(key, { t, sid, orig, timer: setTimeout(() => failPaused(conn, key), PAUSE_MS) });
    }
    event(conn, method, params, session);
  }

  /** A page's child (a frame in another process, a worker) is held until it has the guard (Fetch), then let go. */
  async function childAttached(t, p, parent) {
    const { conn } = t;
    const child = p.sessionId;
    t.children.add(child);
    conn.sessions.set(child, t);
    const fetch = conn.fetch || t.fetch;
    try {
      if (fetch) await t.dbg.sendCommand('Fetch.enable', fetch, child);
    } catch {}
    try {
      if (p.waitingForDebugger) await t.dbg.sendCommand('Runtime.runIfWaitingForDebugger', {}, child);
    } catch {}
    if (!t.gone) event(conn, 'Target.attachedToTarget', p, parent);
  }

  // ---- the server's commands ----------------------------------------------------------------------------------------

  class RpcError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  /** Commands for the browser itself (no session). */
  async function browserCommand(conn, method, p) {
    switch (method) {
      case 'Browser.getVersion':
        return { protocolVersion: '1.3', product: `Chrome/${process.versions.chrome}`, revision: '', userAgent: ua, jsVersion: process.versions.v8 };
      case 'Browser.close':
        setImmediate(() => closeConn(conn, 'the server closed it'));
        return {};
      case 'Browser.setDownloadBehavior': {
        const ctx = p.browserContextId && p.browserContextId !== conn.defaultCtx.id ? conn.contexts.get(p.browserContextId) : conn.defaultCtx;
        if (!ctx) throw new RpcError(-32602, 'Browser context not found');
        ctx.download = { behavior: p.behavior, path: p.downloadPath, events: p.eventsEnabled };
        return {};
      }
      case 'Target.setDiscoverTargets':
        conn.discover = !!p.discover;
        if (conn.discover) for (const t of conn.targets.values()) if (t.ready) event(conn, 'Target.targetCreated', { targetInfo: { ...infoOf(t), attached: false } });
        return {};
      case 'Target.setAutoAttach':
        conn.autoAttach = !!p.autoAttach;
        return {};
      case 'Target.createTarget':
        return createTarget(conn, p);
      case 'Target.closeTarget': {
        const t = conn.targets.get(p.targetId);
        if (!t) throw new RpcError(-32602, 'No target with given id found');
        destroyTarget(t, false);
        return { success: true };
      }
      case 'Target.activateTarget':
        return {};
      case 'Target.getTargets':
        return { targetInfos: [...conn.targets.values()].filter((t) => t.ready).map((t) => ({ ...infoOf(t), attached: true })) };
      case 'Target.getTargetInfo': {
        const t = p.targetId ? conn.targets.get(p.targetId) : null;
        if (!t) throw new RpcError(-32602, 'No target with given id found');
        return { targetInfo: infoOf(t) };
      }
      case 'Target.attachToTarget': {
        const t = conn.targets.get(p.targetId);
        if (!t) throw new RpcError(-32602, 'No target with given id found');
        return { sessionId: t.sid };
      }
      case 'Target.getBrowserContexts':
        return { browserContextIds: [...conn.contexts.keys()] };
      case 'Target.createBrowserContext': {
        // A private context is your own browsing's alone (an agent's browser has none).
        if (p.hydorPrivate && conn.profile !== BROWSING) throw new RpcError(-32602, 'Only your own browsing has private contexts');
        const id = hex32();
        const ctx = await makeContext(conn, id, p.proxyServer ? { server: String(p.proxyServer), bypass: String(p.proxyBypassList || '') } : conn.proxy, { private: !!p.hydorPrivate });
        conn.contexts.set(id, ctx);
        return { browserContextId: id };
      }
      case 'Target.disposeBrowserContext': {
        const ctx = conn.contexts.get(p.browserContextId);
        if (!ctx) throw new RpcError(-32602, 'Failed to find context with id ' + p.browserContextId);
        conn.contexts.delete(ctx.id);
        for (const t of [...byWc.values()]) if (t.ctx === ctx) destroyTarget(t, false);
        for (const w of ctx.asks.values()) w.done(false);
        forgetSession(ctx);
        return {};
      }
      case 'Fetch.enable': {
        conn.fetch = p;
        await Promise.all([...conn.targets.values()].map((t) => enableFetch(t, p)));
        return {};
      }
      case 'Fetch.disable': {
        conn.fetch = null;
        await Promise.all([...conn.targets.values()].map((t) => (t.fetch ? null : enableFetch(t, null))));
        for (const [k, r] of conn.requests) (clearTimeout(r.timer), conn.requests.delete(k));
        return {};
      }
      case 'Fetch.continueRequest':
      case 'Fetch.failRequest':
      case 'Fetch.fulfillRequest':
      case 'Fetch.continueResponse':
      case 'Fetch.continueWithAuth':
      case 'Fetch.getResponseBody':
      case 'Fetch.takeResponseBodyAsStream': {
        const r = conn.requests.get(p.requestId);
        if (!r) throw new RpcError(-32602, 'Invalid InterceptionId.');
        const done = !/Body/.test(method);
        if (done) {
          clearTimeout(r.timer);
          conn.requests.delete(p.requestId);
        }
        if (r.t.gone) throw new RpcError(-32000, 'The tab has closed');
        return r.t.dbg.sendCommand(method, { ...p, requestId: r.orig }, r.sid || undefined);
      }
      default:
        throw new RpcError(-32601, `'${method}' wasn't found`);
    }
  }

  /** Fetch on (params) or off (null) for a page and the children it has. */
  async function enableFetch(t, params) {
    for (const s of [undefined, ...t.children]) {
      try {
        if (params) await t.dbg.sendCommand('Fetch.enable', params, s);
        else await t.dbg.sendCommand('Fetch.disable', {}, s);
      } catch {}
    }
  }

  /** The commands for a page (its own session id) or a child of it. */
  async function pageCommand(conn, t, sessionId, method, p) {
    const child = sessionId === t.sid ? undefined : sessionId;
    if (!child) {
      switch (method) {
        case 'Runtime.runIfWaitingForDebugger': {
          const go = t.resume;
          if (go) go();
          return {};
        }
        case 'Target.setAutoAttach':
          // The children are held until they have the guard: the page's debugger holds them, and they are let go here.
          return t.dbg.sendCommand(method, { ...p, ...(p.autoAttach ? { waitForDebuggerOnStart: true, flatten: true } : {}) });
        case 'Fetch.enable':
          t.fetch = p;
          break;
        case 'Fetch.disable':
          t.fetch = null;
          break;
        case 'Emulation.setDeviceMetricsOverride':
          // An off-screen page is as big as the server says its page is (its frames are that size, times its scale).
          if (t.offscreen && p.width > 0 && p.height > 0) {
            t.css = { w: Math.round(p.width), h: Math.round(p.height) };
            t.dsf = p.deviceScaleFactor > 0 ? p.deviceScaleFactor : 1;
          } else if (t.offscreen) t.css = null;
          break;
        case 'Emulation.clearDeviceMetricsOverride':
          t.css = null;
          break;
        case 'Emulation.setEmulatedMedia':
          // On one of your tabs the server's media (a print look, a colour scheme) is kept with the dark look of this module's.
          if (!t.offscreen) {
            t.darkMedia = p;
            return t.dbg.sendCommand(method, mediaOf(t, t.dark));
          }
          break;
        default:
      }
    }
    if (/^Fetch\.(continueRequest|failRequest|fulfillRequest|continueResponse|continueWithAuth)$/.test(method)) {
      const key = pauseKey(t, child || '', p.requestId);
      const r = conn.requests.get(key);
      if (r) (clearTimeout(r.timer), conn.requests.delete(key));
    }
    return t.dbg.sendCommand(method, p, child);
  }

  async function handle(conn, msg) {
    const { id, method, sessionId } = msg;
    const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
    try {
      let result;
      if (!sessionId) result = await browserCommand(conn, method, params);
      else {
        const t = conn.sessions.get(sessionId);
        if (!t || t.gone) throw new RpcError(-32001, 'Session with given id not found.');
        result = await pageCommand(conn, t, sessionId, method, params);
      }
      say(conn, { id, ...(sessionId ? { sessionId } : {}), result: result ?? {} });
    } catch (e) {
      say(conn, { id, ...(sessionId ? { sessionId } : {}), error: { code: e instanceof RpcError ? e.code : -32000, message: String((e && e.message) || e) } });
    }
  }

  // ---- what the server asks, and says ---------------------------------------------------------------------------------

  /** { type: 'ask', what: 'browser-launch' }: a browser for a profile; answers its product and user agent. */
  async function launch(m) {
    if (conns.has(m.conn)) throw new Error('that connection is already open');
    const proxy = Number(m.proxy) > 0 ? { server: `http://127.0.0.1:${Number(m.proxy)}`, bypass: '<-loopback>' } : null;
    const conn = {
      id: String(m.conn),
      profile: String(m.profile || ''),
      proxy,
      defaultCtx: null,
      contexts: new Map(),
      targets: new Map(),
      sessions: new Map(),
      requests: new Map(),
      fetch: null,
      discover: false,
      autoAttach: false,
      seq: 0,
      closed: false,
    };
    conns.set(conn.id, conn);
    try {
      conn.defaultCtx = await makeContext(conn, '', proxy);
      conn.defaultCtx.id = hex32();
      hostWindow();
      if (conn.defaultCtx.persistent && ext && Array.isArray(m.extensions)) await syncExtensions(conn.defaultCtx.ses, m.extensions);
    } catch (e) {
      closeConn(conn, 'it did not start');
      throw e;
    }
    return { product: `Chrome/${process.versions.chrome}`, userAgent: ua };
  }

  async function syncExtensions(ses, list) {
    try {
      await ext.sync(ses, list);
    } catch (e) {
      log('extensions could not load', String((e && e.message) || e));
    }
  }

  /** The messages for the browser from the server; true when it was one of them. */
  function message(m) {
    if (!m || typeof m !== 'object') return false;
    if (m.type === 'cdp') {
      const conn = conns.get(m.conn);
      if (!conn) return true;
      let msg;
      try {
        msg = JSON.parse(m.data);
      } catch {
        return true;
      }
      void handle(conn, msg);
      return true;
    }
    if (m.type === 'browser-close') {
      const conn = conns.get(m.conn);
      if (conn) closeConn(conn, 'the server closed it');
      return true;
    }
    if (m.type === 'browser-extensions') {
      if (!ext) return true;
      for (const conn of conns.values()) if (conn.profile === m.profile && conn.defaultCtx.persistent) void syncExtensions(conn.defaultCtx.ses, Array.isArray(m.extensions) ? m.extensions : []);
      return true;
    }
    if (m.type === 'browser-prefs') {
      if (adblock) adblock.setPrefs({ adblock: m.adblock, allowAds: m.allowAds, cookieBanners: m.cookieBanners, adLists: m.adLists });
      if (typeof m.autoplay === 'boolean') settings.autoplay = m.autoplay;
      if (typeof m.spellcheck === 'boolean' && m.spellcheck !== settings.spellcheck) {
        settings.spellcheck = m.spellcheck;
        for (const conn of conns.values()) for (const ctx of [conn.defaultCtx, ...conn.contexts.values()]) if (ownSession(ctx)) ctx.ses.setSpellCheckerEnabled(settings.spellcheck);
      }
      if (typeof m.zoom === 'number' && m.zoom > 0 && m.zoom !== settings.zoom) {
        settings.zoom = m.zoom;
        // Every one of your tabs on a site you did not zoom takes the new default.
        for (const conn of conns.values()) {
          for (const t of conn.targets.values()) {
            if (t.offscreen || t.gone || t.wc.isDestroyed() || zoomedByYou.has(zoomSite(t))) continue;
            t.wc.setZoomFactor(settings.zoom);
            tabState(t, { zoom: zoomOf(t) });
          }
        }
      }
      if (typeof m.darkPages === 'boolean' || Array.isArray(m.darkExcept)) {
        if (typeof m.darkPages === 'boolean') settings.darkPages = m.darkPages;
        if (Array.isArray(m.darkExcept)) settings.darkExcept = [...new Set(m.darkExcept.map(plainHost).filter(Boolean))];
        applyDarkAll();
      }
      return true;
    }
    if (m.type === 'browser-clear') {
      void clearData(m);
      return true;
    }
    if (m.type === 'browser-permission-answer') {
      const conn = conns.get(m.conn);
      for (const ctx of conn ? [conn.defaultCtx, ...conn.contexts.values()] : []) ctx.asks.get(String(m.id))?.done(!!m.allow);
      return true;
    }
    return false;
  }

  /** The server is gone (or the app quits): every browser closes. */
  function closeAll(why) {
    for (const conn of [...conns.values()]) closeConn(conn, why);
    adStats?.flush();
  }

  /**
   * A tab of your own browsing, opened by an extension or by the menu of another tab (the server takes it as yours): when
   * `from` is a private tab, a tab of the same private context.
   */
  async function openTab(url, from = null) {
    const conn = from && !from.gone ? from.conn : [...conns.values()].find((c) => c.profile === BROWSING && !c.closed);
    if (!conn || conn.closed) return false;
    await createTarget(conn, { url: String(url), ...(from && from.ctx.private ? { browserContextId: from.ctx.id } : {}) });
    return true;
  }

  const browsingSession = () => session.fromPartition('persist:hydor-browsing');

  // What extensions may do with your tabs (extensions.cjs): open one (in front, unless the extension asks otherwise: the
  // server makes it the tab you see), bring one to the front, close one.
  if (ext && ext.useTabs)
    ext.useTabs({
      open: async (url, { active = true } = {}) => {
        const conn = [...conns.values()].find((c) => c.profile === BROWSING && !c.closed);
        if (!conn) return null;
        const { targetId } = await createTarget(conn, { url: String(url) });
        const t = conn.targets.get(targetId);
        if (!t || t.gone) return null;
        if (active) toServer({ type: 'browser-front', conn: conn.id, target: t.id });
        return t.wc;
      },
      activate: (wc) => {
        const t = byWc.get(wc.id);
        if (t && !t.gone && t.id) toServer({ type: 'browser-front', conn: t.conn.id, target: t.id });
      },
      close: (wc) => {
        const t = byWc.get(wc.id);
        if (t && forExtensions(t)) destroyTarget(t, false);
      },
      bounds: (wc) => {
        const t = byWc.get(wc.id);
        return t ? t.bounds : null;
      },
    });

  // ---- what the app's own page asks (preload.cjs) -------------------------------------------------------------------

  const ownTab = (id) => {
    for (const conn of conns.values()) {
      const t = conn.targets.get(String(id));
      if (t && !t.offscreen && !t.gone) return t;
    }
    return null;
  };
  const anyTab = (id) => {
    for (const conn of conns.values()) {
      const t = conn.targets.get(String(id));
      if (t && !t.gone) return t;
    }
    return null;
  };
  const agentTab = (id) => {
    const t = anyTab(id);
    return t && t.offscreen ? t : null;
  };

  /** Windows whose hiding or showing moves the pages laid over them. */
  const watched = new WeakSet();
  function watchWindow(win) {
    if (watched.has(win)) return;
    watched.add(win);
    // A page shown full screen stays: macOS says a window is hidden while it is only covered for a moment, as when it
    // moves to a space of its own to go full screen, and parking the page then took it out of full screen at once.
    const away = () => {
      for (const t of shownIn(win)) if (!t.fs) park(t);
    };
    const back = () => {
      for (const t of shownIn(win, true)) place(t, win);
    };
    win.on('hide', away);
    win.on('minimize', away);
    win.on('closed', () => {
      for (const conn of conns.values()) for (const t of conn.targets.values()) if (t.wanted && t.wanted.win === win) t.wanted = null;
    });
    win.on('show', back);
    win.on('restore', back);
    // The pages follow the window's edges at once (by the distance each keeps from them), without waiting for the app's
    // page to notice the new size; the page's own next `show` corrects whatever this guessed.
    win.on('resize', () => follow(win));
    win.on('will-resize', (_e, next) => {
      // The size the window is about to get (Windows and macOS): its content is that less the frame.
      const [cw, ch] = win.getContentSize();
      const [ow, oh] = win.getSize();
      follow(win, [next.width - (ow - cw), next.height - (oh - ch)]);
    });
    // The app's page loads again (the server started over): its pages have to be asked for again.
    win.webContents.on('did-start-navigation', (d) => {
      if (d.isMainFrame && !d.isSameDocument) away();
    });
    win.webContents.on('render-process-gone', away);
  }
  /** The pages shown in a window (or, with `wanted`, those that want to be there and are parked). */
  function shownIn(win, wanted = false) {
    const out = [];
    for (const conn of conns.values()) for (const t of conn.targets.values()) if (wanted ? t.wanted && t.wanted.win === win && !t.shownIn : t.shownIn === win) out.push(t);
    return out;
  }
  /** Sets a view's bounds only when they are not what they are. */
  function setBoundsOnce(t, b) {
    t.bounds = b;
    const c = t.view.getBounds();
    if (c.x !== b.x || c.y !== b.y || c.width !== b.width || c.height !== b.height) t.view.setBounds(b);
  }
  /** Where a page is, as its distance from each edge of the window's content (so that the window's size moves it at once). */
  function insetsOf(win, b) {
    const [cw, ch] = win.getContentSize();
    return { left: b.x, top: b.y, right: cw - (b.x + b.width), bottom: ch - (b.y + b.height) };
  }
  /** The pages shown in a window, placed again from their insets after its size changed (to `size`, when that is known first). */
  function follow(win, size) {
    if (win.isDestroyed()) return;
    const [cw, ch] = size || win.getContentSize();
    for (const t of shownIn(win)) {
      const w = t.wanted;
      if (t.gone || t.fs || !w || !w.insets) continue;
      const i = w.insets;
      const b = { x: i.left, y: i.top, width: Math.max(1, cw - i.left - i.right), height: Math.max(1, ch - i.top - i.bottom) };
      w.bounds = b;
      try {
        setBoundsOnce(t, b);
        if (t.bubble && t.bubble.t === t) bubbleLay(t.bubble);
      } catch {}
    }
  }

  function place(t, win) {
    if (t.gone || win.isDestroyed()) return;
    try {
      if (t.shownIn !== win) {
        const from = t.shownIn && !t.shownIn.isDestroyed() ? t.shownIn : host && !host.isDestroyed() ? host : null;
        from?.contentView.removeChildView(t.view);
        win.contentView.addChildView(t.view);
        t.shownIn = win;
        if (forExtensions(t) && ext.tabFront) ext.tabFront(t.wc);
      }
      // A page that is full screen fills the window, wherever the Browser page says its place is.
      if (t.fs) t.fs.fit();
      else setBoundsOnce(t, t.wanted.bounds);
      if (t.focusAt) {
        if (Date.now() - t.focusAt < 3000) t.wc.focus();
        t.focusAt = 0;
      }
      // The tab's view was put in front (or moved): the bubble over it is put in front of that.
      if (t.bubble && t.bubble.t === t) bubbleLay(t.bubble);
    } catch (e) {
      log('a page could not be shown', String((e && e.message) || e));
    }
  }

  function show(e, target, rect) {
    if (!fromOwnPage(e)) return false;
    const t = ownTab(target);
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow();
    if (!t || !win || win.isDestroyed()) return false;
    watchWindow(win);
    const z = e.sender.getZoomFactor() || 1;
    const r = rect || {};
    const bounds = { x: Math.round(Number(r.x) * z) || 0, y: Math.round(Number(r.y) * z) || 0, width: Math.round(Number(r.w) * z) || 0, height: Math.round(Number(r.h) * z) || 0 };
    if (bounds.width < 2 || bounds.height < 2) {
      t.wanted = null;
      park(t);
      return true;
    }
    const was = t.shownIn === win;
    t.wanted = { win, bounds, insets: insetsOf(win, bounds) };
    // Laid over the window (in front of everything of its own) now, or when the window is shown again.
    if (win.isVisible() && !win.isMinimized()) place(t, win);
    else t.bounds = bounds;
    // The window's page learns how the tab is (sound, zoom, blocked ads) as it gets it: once, not at every move of its place.
    if (!was) {
      t.news = { ...allState(t) };
      flushState(t);
    }
    return true;
  }

  /**
   * A picture of a page of yours as it is now (a JPEG data URL of its place, in the screen's own pixels), for the app's
   * page to show where the page is taken away for a while (a menu over it): null when it is not shown, or not one of your
   * tabs here.
   */
  async function still(e, target) {
    if (!fromOwnPage(e)) return null;
    const t = ownTab(target);
    return t ? stillOf(t) : null;
  }

  /** A picture of a tab of yours as it is shown now (a JPEG data URL), or null: see still. */
  async function stillOf(t) {
    if (!t.shownIn || t.shownIn.isDestroyed() || t.wc.isDestroyed()) return null;
    try {
      let img = await withTimeout(t.wc.capturePage(), 400, 'The picture');
      if (img.isEmpty()) return null;
      // capturePage gives the screen's own pixels (two for each of the page's on a Retina screen): kept as they are, or
      // the picture is blurred as the window stretches it back over the page. Only a giant one is made smaller.
      const { width, height } = img.getSize();
      const over = (width * height) / STILL_PIXELS;
      if (over > 1) img = img.resize({ width: Math.round(width / Math.sqrt(over)), quality: 'good' });
      return `data:image/jpeg;base64,${img.toJPEG(STILL_QUALITY).toString('base64')}`;
    } catch {
      return null;
    }
  }

  function hide(e, target) {
    if (!fromOwnPage(e)) return;
    const list = target ? [ownTab(target)].filter(Boolean) : [...conns.values()].flatMap((c) => [...c.targets.values()].filter((t) => !t.offscreen && !t.gone));
    for (const t of list) {
      t.wanted = null;
      if (t.shownIn) park(t);
    }
  }

  // ---- an agent's tab, watched: its frames to the window ----------------------------------------------------------------

  /** Watchers by the sender of the page that watches: { send, wc, pending, waiting, at, timer, stop }. */
  function watcherOf(t, sender) {
    return t.watchers.get(sender.id);
  }

  function feed(t) {
    for (const w of t.watchers.values()) {
      if (w.waiting) {
        w.pending = true;
        continue;
      }
      const wait = Math.max(0, 1000 / WATCH_FPS - (Date.now() - w.at));
      if (wait > 4) {
        if (!w.timer) {
          w.timer = setTimeout(() => {
            w.timer = null;
            if (!w.waiting) sendFrame(t, w);
          }, wait);
        }
        continue;
      }
      sendFrame(t, w);
    }
  }

  function sendFrame(t, w) {
    if (!t.frame || t.gone || w.wc.isDestroyed()) return;
    w.at = Date.now();
    w.pending = false;
    // A frame the window has not taken yet is not followed by another; if it never says, it goes on after a moment.
    w.waiting = true;
    clearTimeout(w.late);
    w.late = setTimeout(() => {
      w.waiting = false;
      if (t.watchers.has(w.wc.id)) feed(t);
    }, 500);
    try {
      const size = pageSize(t);
      w.send('hydor:browser-frame', { target: t.id, jpeg: pageImage(t, size).toJPEG(80), w: size.w, h: size.h });
    } catch {
      w.waiting = false;
    }
  }

  /**
   * The page's part of the last frame: an off-screen view paints more than the page when the page is set smaller than
   * the view (the page sits in its top left corner), so the frame is cut to the page (its CSS size times its scale).
   */
  function pageImage(t, size) {
    const img = t.frame;
    const s = img.getSize();
    const k = t.css ? t.dsf || 1 : 1;
    const w = Math.min(s.width, Math.round(size.w * k));
    const h = Math.min(s.height, Math.round(size.h * k));
    return w > 0 && h > 0 && (w < s.width || h < s.height) ? img.crop({ x: 0, y: 0, width: w, height: h }) : img;
  }

  /** An agent's page in CSS pixels: what the server set, else what the last frame shows. */
  function pageSize(t) {
    if (t.css) return t.css;
    const size = t.frame ? t.frame.getSize() : t.view.getBounds();
    return { w: size.width, h: size.height };
  }

  function frameTaken(e, target) {
    if (!fromOwnPage(e)) return;
    const t = anyTab(target);
    const w = t && watcherOf(t, e.sender);
    if (!w) return;
    w.waiting = false;
    clearTimeout(w.late);
    if (w.first) {
      w.first = false;
      w.send('hydor:browser-cursor', { target: t.id, cursor: t.cursor });
      w.pending = true;
    }
    if (w.pending) feed(t);
  }

  function watch(e, target, on) {
    if (!fromOwnPage(e)) return false;
    const t = agentTab(target);
    if (!t) return false;
    const sender = e.sender;
    if (!on) {
      stopWatching(t, sender.id);
      return true;
    }
    if (!t.watchers.has(sender.id)) {
      // Nothing is sent until the page has its listener up and says so (frameTaken), or a moment has passed.
      const w = { wc: sender, send: (channel, data) => !sender.isDestroyed() && sender.send(channel, data), pending: false, waiting: true, first: true, at: 0, timer: null, late: null, stop: null };
      w.late = setTimeout(() => {
        w.waiting = false;
        if (t.watchers.has(sender.id)) feed(t);
      }, 1000);
      w.stop = () => {
        clearTimeout(w.timer);
        clearTimeout(w.late);
        unbindSender(t, sender);
      };
      t.watchers.set(sender.id, w);
      bindSender(t, sender);
      if (!t.wc.isDestroyed()) t.wc.setFrameRate(WATCH_FPS);
    }
    // One at once, and the page keeps painting only when something changes: ask for one more now.
    if (!t.frame && !t.wc.isDestroyed()) t.wc.invalidate();
    return true;
  }

  /**
   * The page that watches going away (closed, or loading another page) ends all its watching. One pair of listeners for
   * each such page however many tabs it watches, and they come off when its last watch stops.
   */
  const senders = new Map();
  function bindSender(t, sender) {
    let s = senders.get(sender.id);
    if (!s) {
      s = { sender, tabs: new Set(), gone: null, nav: null };
      s.gone = () => {
        for (const x of [...s.tabs]) stopWatching(x, sender.id);
      };
      s.nav = (d) => {
        if (d.isMainFrame && !d.isSameDocument) s.gone();
      };
      sender.on('destroyed', s.gone);
      sender.on('did-start-navigation', s.nav);
      senders.set(sender.id, s);
    }
    s.tabs.add(t);
  }
  function unbindSender(t, sender) {
    const s = senders.get(sender.id);
    if (!s) return;
    s.tabs.delete(t);
    if (s.tabs.size) return;
    senders.delete(sender.id);
    sender.removeListener('destroyed', s.gone);
    sender.removeListener('did-start-navigation', s.nav);
  }

  function stopWatching(t, senderId) {
    const w = t.watchers.get(senderId);
    if (!w) return;
    w.stop?.();
    t.watchers.delete(senderId);
    if (!t.watchers.size && !t.wc.isDestroyed() && t.offscreen) t.wc.setFrameRate(IDLE_FPS);
  }

  // ---- your clicks and keys in an agent's tab ----------------------------------------------------------------------------

  function input(e, target, events) {
    if (!fromOwnPage(e)) return false;
    const t = agentTab(target);
    if (!t || t.wc.isDestroyed() || !Array.isArray(events)) return false;
    const wc = t.wc;
    const { w, h } = pageSize(t);
    let typed = false;
    for (const ev of events.slice(0, 200)) {
      if (!ev || typeof ev !== 'object') continue;
      try {
        if (ev.t === 'mouse') {
          const type = ev.type === 'down' ? 'mouseDown' : ev.type === 'up' ? 'mouseUp' : 'mouseMove';
          const button = ev.button || (ev.type === 'move' ? undefined : 'left');
          wc.sendInputEvent({ type, x: Math.round(clamp01(ev.x) * w), y: Math.round(clamp01(ev.y) * h), ...(button ? { button } : {}), clickCount: ev.type === 'move' ? 0 : Math.max(1, Number(ev.clicks) || 1), modifiers: modifiersOf(ev.mods | 0) });
        } else if (ev.t === 'wheel') {
          // Electron's wheel deltas point the other way from the page's (a positive one scrolls up).
          wc.sendInputEvent({ type: 'mouseWheel', x: Math.round(clamp01(ev.x) * w), y: Math.round(clamp01(ev.y) * h), deltaX: -(Number(ev.dx) || 0), deltaY: -(Number(ev.dy) || 0), canScroll: true });
        } else if (ev.t === 'key') {
          typed = typed || ev.type === 'down';
          key(wc, ev);
        } else if (ev.t === 'text') {
          typed = true;
          text(wc, String(ev.text || '').slice(0, 5000));
        }
      } catch (err) {
        log('input did not reach the page', String((err && err.message) || err));
      }
    }
    // What you type, the agent never sees: the server is told which tab you drive and that you typed.
    toServer({ type: 'browser-input', conn: t.conn.id, target: t.id, typed });
    return true;
  }

  function key(wc, ev) {
    const name = KEY_NAMES[ev.key] || (/^F\d{1,2}$/.test(ev.key) ? ev.key : String(ev.key || '').length === 1 ? ev.key : null);
    if (!name) return;
    const modifiers = modifiersOf(ev.mods | 0);
    if (ev.type === 'up') return wc.sendInputEvent({ type: 'keyUp', keyCode: name, modifiers });
    wc.sendInputEvent({ type: 'keyDown', keyCode: name, modifiers });
    // What the key types follows it, as a character, unless a shortcut's key (Ctrl or ⌘) is held.
    const text = ev.key === 'Enter' ? '\r' : typeof ev.text === 'string' && ev.text.length === 1 ? ev.text : '';
    if (text && !(ev.mods & 6)) wc.sendInputEvent({ type: 'char', keyCode: text, modifiers });
  }

  /**
   * Text as characters of the same queue as the keys, so it lands in order with them (webContents.insertText takes
   * another way and could arrive before keys sent earlier); what a character cannot carry goes the other way.
   */
  function text(wc, str) {
    let rest = '';
    for (const ch of str) {
      if (ch === '\n' || ch === '\r') {
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
        wc.sendInputEvent({ type: 'char', keyCode: '\r' });
        wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      } else if (ch.length === 1) wc.sendInputEvent({ type: 'char', keyCode: ch });
      else rest += ch;
    }
    if (rest) setTimeout(() => !wc.isDestroyed() && void wc.insertText(rest), 50);
  }

  function edit(e, target, op) {
    if (!fromOwnPage(e) || !['copy', 'cut', 'paste', 'selectAll', 'undo', 'redo'].includes(op)) return;
    const t = anyTab(target);
    if (!t || t.wc.isDestroyed()) return;
    t.wc[op]();
  }

  function focus(e, target) {
    if (!fromOwnPage(e)) return;
    const t = ownTab(target);
    if (!t || t.wc.isDestroyed()) return;
    // Taken away for a while (a menu of the window's page over it): it gets the keys when it is back, if that is soon.
    if (!t.shownIn) t.focusAt = Date.now();
    else t.wc.focus();
  }

  /**
   * The window's page takes the keys back from your tab's page, after a shortcut that page passed on types into the window's
   * page (⌘L the address bar, ⌘F the find bar): window.focus() there cannot take them from another page in the window.
   */
  function focusApp(e) {
    if (!fromOwnPage(e) || e.sender.isDestroyed()) return false;
    e.sender.focus();
    return true;
  }

  /** An extension's button pressed: true when the extension took it, false when it is not running here. */
  async function popupOf(e, extension, rect) {
    if (!fromOwnPage(e) || !ext) return false;
    try {
      return (await ext.popup(browsingSession(), String(extension), rect)) === true;
    } catch (err) {
      log('an extension popup did not open', String((err && err.message) || err));
      return false;
    }
  }

  /** Shows a downloaded file in the system's file manager: only a file that is there, in the user's own folders. */
  function showFile(e, file) {
    if (!fromOwnPage(e) || typeof file !== 'string' || !path.isAbsolute(file)) return false;
    try {
      const real = fs.realpathSync(file);
      const home = fs.realpathSync(os.homedir());
      if (!fs.statSync(real).isFile() || !(real === home || real.startsWith(home + path.sep))) return false;
      shell.showItemInFolder(real);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Native find in one of your tabs, with the number of matches and which one is on; empty words stop it. null when it is
   * not one of your tabs here.
   */
  function find(e, target, text, opts) {
    if (!fromOwnPage(e)) return null;
    const t = ownTab(target);
    if (!t || t.wc.isDestroyed()) return null;
    const o = opts && typeof opts === 'object' ? opts : {};
    text = String(text || '').slice(0, 1000);
    if (t.finding) (clearTimeout(t.finding.timer), t.finding.resolve(null), (t.finding = null));
    if (!text) {
      t.wc.stopFindInPage('clearSelection');
      return Promise.resolve({ matches: 0, active: 0 });
    }
    return new Promise((resolve) => {
      const id = t.wc.findInPage(text, { forward: o.forward !== false, findNext: !!o.findNext, matchCase: !!o.matchCase });
      // The answer is the last update of this search (Chromium counts on after the first); if none comes, none was found.
      const timer = setTimeout(() => {
        if (t.finding && t.finding.id === id) t.finding = null;
        resolve({ matches: 0, active: 0 });
      }, 3000);
      t.finding = { id, resolve, timer };
    });
  }

  function zoomTab(e, target, op) {
    if (!fromOwnPage(e) || !['in', 'out', 'reset'].includes(op)) return 1;
    const t = ownTab(target);
    return t && !t.wc.isDestroyed() ? zoom(t, op) : 1;
  }

  function print(e, target) {
    if (!fromOwnPage(e)) return;
    const t = ownTab(target);
    if (t && !t.wc.isDestroyed()) t.wc.print({ printBackground: true });
  }

  function mute(e, target, muted) {
    if (!fromOwnPage(e)) return;
    const t = ownTab(target);
    if (!t || t.wc.isDestroyed()) return;
    t.wc.setAudioMuted(!!muted);
    tabState(t, { muted: t.wc.isAudioMuted() });
  }

  /** A web address in the computer's default browser: http and https only. */
  async function openExternal(e, url) {
    if (!fromOwnPage(e) || !web(url)) return false;
    try {
      await shell.openExternal(String(url));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Browsing data of a profile cleared ({ type: 'browser-clear' }): its cookies and sites' storage, its cached files. Chromium's
   * clearing in Electron 45 (session.clearData) has no time range, so what you asked for since a time is cleared in whole. The
   * extensions keep their own storage.
   */
  async function clearData(m) {
    const profile = String(m.profile || '');
    if (!profile) return;
    // The history is gone: so are the sites the ad blocker's statistics name (its totals and days are only counts).
    if (m.history && profile === BROWSING && adStats) adStats.forgetSites();
    try {
      const ses = session.fromPartition(partitionOf({ profile, id: '' }, ''));
      if (m.cookies) {
        const keep = [];
        try {
          for (const x of ses.extensions.getAllExtensions()) keep.push(new URL(x.url).origin);
        } catch {}
        await ses.clearData({ dataTypes: ['cookies', 'localStorage', 'indexedDB', 'serviceWorkers', 'fileSystems', 'webSQL', 'backgroundFetch'], ...(keep.length ? { excludeOrigins: keep } : {}) });
      }
      if (m.cache) await ses.clearCache();
      log('browsing data cleared', profile, m.cookies ? 'cookies' : '', m.cache ? 'cache' : '');
    } catch (e) {
      log('browsing data could not be cleared', String((e && e.message) || e));
    }
  }

  // ---- a picture or a PDF of a page, and deleting a site's data -------------------------------------------------------------

  /** What a file made of a page is named after: its title, else its site. */
  const nameOfPage = (t) => fileSafe(t.wc.getTitle()) || fileSafe(hostOf(t.wc.getURL()).replace(/^www\./, '')) || 'Page';

  /**
   * A PNG of what one of your tabs shows (`whole` false), or of the whole page, as tall as 16384 CSS pixels at most (what the
   * visible part is when that cannot be taken). It is saved in the computer's Downloads folder, as "<title> <date> at <time>.png",
   * and put on the clipboard. { path, name, copied }, or null when it is not one of your tabs, or is not shown.
   */
  async function capture(e, target, whole) {
    if (!fromOwnPage(e)) return null;
    const t = ownTab(target);
    // A page that is not shown does not draw, and cannot be photographed.
    if (!t || t.wc.isDestroyed() || !t.shownIn) return null;
    try {
      let png = null;
      if (whole) {
        try {
          const m = await withTimeout(t.dbg.sendCommand('Page.getLayoutMetrics'), 5000, 'The page size');
          const size = m.cssContentSize || m.contentSize;
          const width = Math.min(Math.ceil(size.width), WHOLE_PAGE_MAX);
          const height = Math.min(Math.ceil(size.height), WHOLE_PAGE_MAX);
          if (!(width > 0 && height > 0)) throw new Error('the page has no size');
          const shot = await withTimeout(t.dbg.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } }), 30_000, 'The picture');
          png = Buffer.from(shot.data, 'base64');
        } catch (err) {
          log('the whole page could not be photographed; the visible part is', String((err && err.message) || err));
        }
      }
      if (!png) {
        const img = await withTimeout(t.wc.capturePage(), 5000, 'The picture');
        if (img.isEmpty()) return null;
        png = img.toPNG();
      }
      const name = `${nameOfPage(t)} ${stamp()}`;
      const file = await writeFree(app.getPath('downloads'), name, '.png', png);
      let copied = false;
      try {
        await withTimeout(clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]), 5000, 'The clipboard');
        copied = true;
      } catch (err) {
        log('the picture could not be put on the clipboard', String((err && err.message) || err));
      }
      return { path: file, name: path.basename(file), copied };
    } catch (err) {
      log('a picture of the page could not be made', String((err && err.message) || err));
      return null;
    }
  }

  /** The page as a PDF (with its backgrounds), saved in Downloads as "<title>.pdf": { path, name }, or null. */
  async function savePdf(e, target) {
    if (!fromOwnPage(e)) return null;
    const t = ownTab(target);
    if (!t || t.wc.isDestroyed()) return null;
    try {
      const pdf = await withTimeout(t.wc.printToPDF({ printBackground: true }), 60_000, 'The PDF');
      const file = await writeFree(app.getPath('downloads'), nameOfPage(t), '.pdf', pdf);
      return { path: file, name: path.basename(file) };
    } catch (err) {
      log('a PDF of the page could not be made', String((err && err.message) || err));
      return null;
    }
  }

  /**
   * Deletes what the tab's site (its host's last two names; three under co.uk and the like) has kept in this tab's own session:
   * every cookie of the site and its subdomains, and the storage of its origins (the page's own and the site's, on http and
   * https); then the tab loads again. A private tab's session is its own. { cleared, site }, or null.
   */
  async function clearSite(e, target) {
    if (!fromOwnPage(e)) return null;
    const t = ownTab(target);
    if (!t || t.wc.isDestroyed()) return null;
    let url;
    try {
      url = new URL(t.wc.getURL());
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const site = siteOfHost(host);
    const { ses } = t.ctx;
    try {
      for (const c of await ses.cookies.get({ domain: site })) {
        const dom = String(c.domain || '').replace(/^\./, '').toLowerCase();
        if (dom !== site && !dom.endsWith('.' + site)) continue;
        await ses.cookies.remove(`${c.secure ? 'https' : 'http'}://${dom}${c.path || '/'}`, c.name).catch(() => {});
      }
      const origins = new Set([url.origin, `http://${host}`, `https://${host}`, `http://${site}`, `https://${site}`]);
      for (const origin of origins) {
        await ses.clearStorageData({ origin, storages: ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'filesystem', 'websql'] }).catch(() => {});
      }
      if (!t.wc.isDestroyed()) t.wc.reload();
      return { cleared: true, site };
    } catch (err) {
      log('a site’s data could not be deleted', String((err && err.message) || err));
      return null;
    }
  }

  // ---- the ad blocker's page and statistics -------------------------------------------------------------------------------

  /**
   * What the ad blocker blocked on a tab's page since it loaded (shared/browser.ts AdblockPage): the ads, the trackers, the hosts
   * the most, and how much was blocked on that site in all. A private tab has no total for its site and no `since`: it keeps nothing.
   * Null when it is not one of your tabs, or there is no blocker.
   */
  function adblockPage(e, target) {
    if (!fromOwnPage(e) || !adblock || !adStats) return null;
    const t = ownTab(target);
    if (!t || t.wc.isDestroyed()) return null;
    const site = siteOfPage(t);
    const hosts = [...t.blockedHosts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 50)
      .map(([host, v]) => ({ host, count: v.count, kind: v.kind }));
    const priv = !!t.ctx.private;
    return { ads: t.blockedAds, trackers: t.blockedTrackers, hosts, site, siteTotal: priv ? 0 : adStats.siteTotal(site), since: priv ? 0 : adStats.summary(adblock.status()).since };
  }
  /** The statistics (shared/browser.ts AdblockStats), or null without a blocker. */
  function adblockStats(e) {
    if (!fromOwnPage(e) || !adblock || !adStats) return null;
    return adStats.summary(adblock.status());
  }
  /** Starts the statistics again from nothing. */
  function adblockReset(e) {
    if (!fromOwnPage(e) || !adStats) return false;
    adStats.reset();
    adStats.flush();
    return true;
  }
  /** Fetches the filter lists now and makes the blocker again; false when that failed (or there is no blocker). */
  async function adblockUpdate(e) {
    if (!fromOwnPage(e) || !adblock) return false;
    try {
      return await adblock.update();
    } catch {
      return false;
    }
  }

  let registered = false;
  function registerIpc() {
    if (registered) return;
    registered = true;
    ipcMain.handle('hydor:browser-show', (e, a) => show(e, a && a.target, a && a.rect));
    ipcMain.handle('hydor:browser-hide', (e, target) => hide(e, target));
    ipcMain.handle('hydor:browser-still', (e, target) => still(e, target));
    ipcMain.handle('hydor:browser-focus', (e, target) => focus(e, target));
    ipcMain.handle('hydor:browser-focus-app', (e) => focusApp(e));
    ipcMain.handle('hydor:browser-watch', (e, a) => watch(e, a && a.target, !a || a.on !== false));
    ipcMain.handle('hydor:browser-input', (e, a) => input(e, a && a.target, a && a.events));
    ipcMain.handle('hydor:browser-edit', (e, a) => edit(e, a && a.target, a && a.op));
    ipcMain.handle('hydor:browser-popup', (e, a) => popupOf(e, a && a.extension, a && a.rect));
    ipcMain.handle('hydor:browser-show-file', (e, file) => showFile(e, file));
    ipcMain.handle('hydor:browser-find', (e, a) => find(e, a && a.target, a && a.text, a && a.opts));
    ipcMain.handle('hydor:browser-zoom', (e, a) => zoomTab(e, a && a.target, a && a.op));
    ipcMain.handle('hydor:browser-print', (e, target) => print(e, target));
    ipcMain.handle('hydor:browser-mute', (e, a) => mute(e, a && a.target, a && a.muted));
    ipcMain.handle('hydor:browser-open-external', (e, url) => openExternal(e, url));
    ipcMain.handle('hydor:browser-capture', (e, a) => capture(e, a && a.target, !!(a && a.whole)));
    ipcMain.handle('hydor:browser-pdf', (e, a) => savePdf(e, a && a.target));
    ipcMain.handle('hydor:browser-clear-site', (e, a) => clearSite(e, a && a.target));
    ipcMain.handle('hydor:browser-adblock-page', (e, a) => adblockPage(e, a && a.target));
    ipcMain.handle('hydor:browser-adblock-stats', (e) => adblockStats(e));
    ipcMain.handle('hydor:browser-adblock-reset', (e) => adblockReset(e));
    ipcMain.handle('hydor:browser-adblock-update', (e) => adblockUpdate(e));
    ipcMain.on('hydor:browser-frame-ack', (e, target) => frameTaken(e, target));
    ipcMain.on('hydor:browser-menus', (e, on) => menusFrom(e, !!on));
    ipcMain.handle('hydor:browser-menu-pick', (e, a) => menuPick(e, a && a.target, a && a.menu, a && a.item));
  }

  return {
    launch,
    message,
    closeAll,
    openTab,
    registerIpc,
    /** What the app tells the extensions (a stand-in for tests, and for the window's page). */
    browsingSession,
    // For desktop/scripts/browser-ipc-check.cjs, which calls what the page's messages call.
    handlers: { show, hide, still, watch, input, edit, focus, showFile, find, zoom: zoomTab, print, mute, openExternal, menuPick, capture, savePdf, clearSite, adblockPage, adblockStats, adblockReset, adblockUpdate },
    /** The link bubble of a window, for the checks: { view, shown, text, side, bounds }, or null. */
    bubble: (win) => {
      const b = bubbles.get(win);
      return b ? { view: b.view, shown: b.shown, text: b.text, side: b.side, bounds: b.view.getBounds() } : null;
    },
    menuTemplate,
    highlightAt,
    shortcut,
    siteOfHost,
    adblock,
    /** The ad blocker's statistics (for checks). */
    adStats,
    conns,
  };
}

module.exports = { createBrowser };
