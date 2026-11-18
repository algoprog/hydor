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
// What people expect of a browser is here for your own tabs: the right-click menu, zoom, print, muting, full-screen video,
// find in page with its match count, opening a page in the default browser, the shortcuts, and clearing browsing data; and
// the ad blocker of the browsing profile (adblock.cjs), whose count of what a page had blocked goes to the window with the
// tab's other news (sound, zoom, full screen) as `hydor:browser-tab-state`.
'use strict';
const { BrowserWindow, Menu, WebContentsView, clipboard, ipcMain, session, shell } = require('electron');
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
  /** The ad blocker of the browsing profile, when this app has it (adblock.cjs). */
  let adblock = null;
  if (adblockOptions) {
    try {
      adblock = require('./adblock.cjs').createAdblock({ log, ...adblockOptions, onBlocked: (wcId) => blocked(wcId) });
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

  const partitionOf = (conn, ctxId) => {
    if (ctxId) return `hydor-ctx-${ctxId.toLowerCase()}`;
    if (conn.profile === BROWSING) return 'persist:hydor-browsing';
    if (conn.profile) return `persist:hydor-profile-${conn.profile.replace(/[^\w.-]/g, '_')}`;
    return `hydor-fresh-${conn.id}`;
  };

  /** A context of a connection: its default one (id '') or one made with Target.createBrowserContext. */
  async function makeContext(conn, id, proxy) {
    const ctx = { id, partition: partitionOf(conn, id), conn, ses: null, download: null, granted: new Set(), persistent: false, asks: new Map() };
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
      if (adblock && ctx.persistent && conn.profile === BROWSING && !ctx.id) adblock.attach(ses);
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
      // Only your own tabs ask you; the agents' browsers refuse everything else, and so does a page that is not a tab here.
      if (!ctx || !t || t.offscreen || ctx.conn.profile !== BROWSING || ctx.id) return callback(false);
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
      if (!conn || !rule || rule.behavior === 'deny' || !rule.path) return item.cancel();
      const guid = crypto.randomUUID();
      const t = wc ? byWc.get(wc.id) : null;
      try {
        fs.mkdirSync(rule.path, { recursive: true });
      } catch {}
      item.setSavePath(path.join(rule.path, guid));
      const events = rule.events !== false;
      if (events) event(conn, 'Browser.downloadWillBegin', { frameId: t ? t.id : '', guid, url: item.getURL(), suggestedFilename: item.getFilename() });
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
    const prefs = { partition: ctx.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: !offscreen, ...(offscreen ? { offscreen: true } : {}) };
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
      fs: null,
      finding: null,
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
      overrideBrowserWindowOptions: { show: false, webPreferences: { ...prefs } },
      createWindow: (options) => popup(t, options),
    }));
    return t;
  }

  // ---- your own tabs: what a browser does for a page you use ----------------------------------------------------------

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

  /** The ad blocker blocked a request of this page. */
  function blocked(wcId) {
    const t = byWc.get(wcId);
    if (!t || t.gone || t.offscreen) return;
    t.blocked++;
    tabState(t, { blocked: t.blocked });
  }

  const zoomOf = (t) => Math.round((t.wc.isDestroyed() ? 1 : t.wc.getZoomFactor()) * 100) / 100;
  /** Chrome's steps: the next one up or down from where the page is now, or back to 100 %. */
  function zoom(t, op) {
    const now = t.wc.getZoomFactor();
    let next = 1;
    if (op === 'in') next = ZOOMS.find((z) => z > now + 0.001) ?? ZOOMS[ZOOMS.length - 1];
    else if (op === 'out') next = [...ZOOMS].reverse().find((z) => z < now - 0.001) ?? ZOOMS[0];
    t.wc.setZoomFactor(next);
    const z = zoomOf(t);
    tabState(t, { zoom: z });
    return z;
  }

  /** What a key is when it is a zoom (Ctrl or ⌘ with + − 0), or null. */
  const zoomKey = (k) => (k === '=' || k === '+' ? 'in' : k === '-' || k === '_' ? 'out' : k === '0' ? 'reset' : null);

  /**
   * A page you use takes keys itself, and the app's shortcuts would never reach the app's page: those go to it (Ctrl or ⌘
   * with T, W, L, R, F, P, D, H, J, B (the tab column), 1 to 9; Ctrl+Tab and Ctrl+Shift+Tab; Ctrl or ⌘+Shift+T and Shift+Delete; F5; Alt with the
   * arrows, and ⌘ with [ and ] on a Mac). Zoom (Ctrl or ⌘ with + − 0) is the app's own, done here.
   */
  function shortcut(t, input) {
    const mod = MAC ? input.meta : input.control;
    const k = String(input.key || '');
    const lower = k.toLowerCase();
    if (mod && !input.alt && zoomKey(k)) return { zoom: zoomKey(k) };
    const hit =
      (mod && !input.alt && /^[twlrfpdhjb]$/.test(lower)) ||
      (mod && !input.alt && /^[1-9]$/.test(k)) ||
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
    // Ctrl and the wheel zoom as in Chrome.
    wc.on('zoom-changed', (_e, direction) => zoom(t, direction === 'in' ? 'in' : 'out'));
    wc.on('audio-state-changed', (e) => tabState(t, { audible: !!e.audible }));
    // Each page counts its own blocked ads and trackers, and has the zoom its site has.
    wc.on('did-start-navigation', (d) => {
      if (!d.isMainFrame || d.isSameDocument) return;
      t.blocked = 0;
      tabState(t, { blocked: 0 });
    });
    wc.on('did-navigate', () => tabState(t, { zoom: zoomOf(t) }));
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

  /** The window goes full screen and the page fills it, while a video (or any page) is shown full screen. */
  function enterFullScreen(t) {
    const win = t.shownIn && !t.shownIn.isDestroyed() ? t.shownIn : null;
    if (!win || t.fs) return;
    const fit = () => {
      const [width, height] = win.getContentSize();
      t.bounds = { x: 0, y: 0, width, height };
      t.view.setBounds(t.bounds);
    };
    t.fs = { win, was: win.isFullScreen(), fit };
    try {
      if (!t.fs.was) win.setFullScreen(true);
      // Laid over everything of the window (adding a view again brings it to the front).
      win.contentView.addChildView(t.view);
      fit();
      win.on('resize', fit);
    } catch (e) {
      log('full screen did not work', String((e && e.message) || e));
    }
    tabState(t, { fullscreen: true });
  }
  function leaveFullScreen(t) {
    const fs = t.fs;
    if (!fs) return;
    t.fs = null;
    try {
      fs.win.removeListener('resize', fs.fit);
      if (!fs.win.isDestroyed()) {
        if (!fs.was) fs.win.setFullScreen(false);
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

  // ---- the right-click menu ----------------------------------------------------------------------------------------

  /** The search engine as the server has it (the app's own page asks it), for the menu's "Search Google for …". */
  let engine = { name: 'Google', template: ENGINES.google[1] };
  async function readEngine() {
    const win = mainWindow();
    if (!win || win.isDestroyed()) return;
    try {
      const p = await withTimeout(win.webContents.executeJavaScript("fetch('/api/browser/browsing/prefs', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)"), 600, 'The search engine');
      if (!p || typeof p !== 'object') return;
      if (ENGINES[p.engine]) engine = { name: ENGINES[p.engine][0], template: ENGINES[p.engine][1] };
      else if (p.engine === 'custom' && typeof p.customSearch === 'string' && /^https?:\/\/.+%s/i.test(p.customSearch)) {
        let name = 'your search engine';
        try {
          name = new URL(p.customSearch.replace('%s', 'x')).hostname.replace(/^www\./, '');
        } catch {}
        engine = { name, template: p.customSearch };
      }
    } catch {}
  }

  const web = (u) => /^https?:\/\//i.test(String(u || ''));
  const short = (text, n = 30) => {
    const one = String(text).replace(/\s+/g, ' ').trim();
    return one.length > n ? `${one.slice(0, n - 1)}…` : one;
  };

  /**
   * The items of the menu for a click in one of your tabs, as a template for Menu.buildFromTemplate: what the page offers
   * where you clicked (a link, an image, selected text, a field) and what any page has.
   */
  function menuTemplate(t, params, eng = engine) {
    const { wc } = t;
    const items = [];
    const sep = () => items.length && items[items.length - 1].type !== 'separator' && items.push({ type: 'separator' });
    const flags = params.editFlags || {};
    const text = String(params.selectionText || '').trim();
    const page = params.pageURL || wc.getURL();
    // Spelling comes first in a field: the word's suggestions, and adding it to the dictionary.
    if (params.isEditable && params.misspelledWord) {
      for (const w of (params.dictionarySuggestions || []).slice(0, 5)) items.push({ label: w, click: () => wc.replaceMisspelling(w) });
      if (!(params.dictionarySuggestions || []).length) items.push({ label: 'No suggestions', enabled: false });
      items.push({ label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
      sep();
    }
    if (params.linkURL) {
      if (web(params.linkURL)) {
        items.push({ label: 'Open link in new tab', click: () => void openTab(params.linkURL).catch((e) => log('a tab could not open', String((e && e.message) || e))) });
        items.push({ label: 'Open link in your default browser', click: () => void shell.openExternal(params.linkURL).catch(() => {}) });
      }
      items.push({ label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) });
      sep();
    }
    if (params.mediaType === 'image' && params.srcURL) {
      if (web(params.srcURL)) items.push({ label: 'Open image in new tab', click: () => void openTab(params.srcURL).catch((e) => log('a tab could not open', String((e && e.message) || e))) });
      items.push({ label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) });
      items.push({ label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) });
      items.push({ label: 'Copy image address', click: () => clipboard.writeText(params.srcURL) });
      sep();
    }
    if (params.isEditable) {
      items.push({ label: 'Undo', enabled: !!flags.canUndo, click: () => wc.undo() });
      items.push({ label: 'Redo', enabled: !!flags.canRedo, click: () => wc.redo() });
      items.push({ type: 'separator' });
      items.push({ label: 'Cut', enabled: !!flags.canCut, click: () => wc.cut() });
      items.push({ label: 'Copy', enabled: !!flags.canCopy, click: () => wc.copy() });
      items.push({ label: 'Paste', enabled: !!flags.canPaste, click: () => wc.paste() });
      items.push({ label: 'Select all', enabled: !!flags.canSelectAll, click: () => wc.selectAll() });
      sep();
    }
    if (text) {
      if (!params.isEditable) items.push({ label: 'Copy', click: () => wc.copy() });
      items.push({ label: `Search ${eng.name} for “${short(text)}”`, click: () => void openTab(eng.template.replace('%s', encodeURIComponent(text))).catch((e) => log('a tab could not open', String((e && e.message) || e))) });
      items.push({ label: `Ask an agent about “${short(text)}”`, click: () => uiOf(t)?.send('hydor:browser-command', { cmd: 'ask', text, url: page }) });
      sep();
    }
    if (!params.isEditable && !text) {
      const nav = wc.navigationHistory;
      items.push({ label: 'Back', enabled: nav.canGoBack(), click: () => nav.goBack() });
      items.push({ label: 'Forward', enabled: nav.canGoForward(), click: () => nav.goForward() });
      items.push({ label: 'Reload', click: () => wc.reload() });
      sep();
    }
    items.push({ label: 'Bookmark this page', click: () => uiOf(t)?.send('hydor:browser-command', { cmd: 'bookmark', url: page, title: wc.getTitle() }) });
    items.push({ label: 'Print…', click: () => wc.print({ printBackground: true }) });
    items.push({ type: 'separator' });
    items.push({ label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) });
    return items;
  }

  async function popupMenu(t, params) {
    if (t.gone || t.wc.isDestroyed()) return;
    // The engine is only asked for when words are selected: that is the one item that needs it.
    if (String(params.selectionText || '').trim()) await readEngine();
    const win = t.shownIn && !t.shownIn.isDestroyed() ? t.shownIn : mainWindow();
    if (!win || win.isDestroyed() || t.gone || t.wc.isDestroyed()) return;
    try {
      Menu.buildFromTemplate(menuTemplate(t, params)).popup({ window: win });
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
    t.ready = true;
    if (conn.discover) event(conn, 'Target.targetCreated', { targetInfo: { ...infoOf(t), attached: false } });
    event(conn, 'Target.attachedToTarget', { sessionId: t.sid, targetInfo: infoOf(t), waitingForDebugger: true });
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
    // Your own browsing's tabs are real pages; everything else, and an agent's tab there, is drawn off screen.
    const own = conn.profile === BROWSING && ctx === conn.defaultCtx && !p.hydorAgent;
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
    const { conn } = t;
    byWc.delete(t.wc.id);
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
      if (!ctx.persistent) {
        ctx.ses.clearStorageData().catch(() => {});
        ctx.ses.clearCache().catch(() => {});
      }
      if (sessions.get(ctx.ses) === ctx) sessions.delete(ctx.ses);
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
        const id = hex32();
        const ctx = await makeContext(conn, id, p.proxyServer ? { server: String(p.proxyServer), bypass: String(p.proxyBypassList || '') } : conn.proxy);
        conn.contexts.set(id, ctx);
        return { browserContextId: id };
      }
      case 'Target.disposeBrowserContext': {
        const ctx = conn.contexts.get(p.browserContextId);
        if (!ctx) throw new RpcError(-32602, 'Failed to find context with id ' + p.browserContextId);
        conn.contexts.delete(ctx.id);
        for (const t of [...byWc.values()]) if (t.ctx === ctx) destroyTarget(t, false);
        for (const w of ctx.asks.values()) w.done(false);
        ctx.ses.clearStorageData().catch(() => {});
        ctx.ses.clearCache().catch(() => {});
        if (sessions.get(ctx.ses) === ctx) sessions.delete(ctx.ses);
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
      if (adblock) adblock.setPrefs({ adblock: m.adblock, allowAds: m.allowAds });
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
  }

  /** A tab of your own browsing, opened by an extension (the server takes it as yours). */
  async function openTab(url) {
    const conn = [...conns.values()].find((c) => c.profile === BROWSING && !c.closed);
    if (!conn) return false;
    await createTarget(conn, { url: String(url) });
    return true;
  }

  const browsingSession = () => session.fromPartition('persist:hydor-browsing');

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
    const away = () => {
      for (const t of shownIn(win)) park(t);
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
      }
      // A page that is full screen fills the window, wherever the Browser page says its place is.
      if (t.fs) t.fs.fit();
      else setBoundsOnce(t, t.wanted.bounds);
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
    if (!t || !t.shownIn || t.shownIn.isDestroyed() || t.wc.isDestroyed()) return null;
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
    if (t && !t.wc.isDestroyed()) t.wc.focus();
  }

  async function popupOf(e, extension, rect) {
    if (!fromOwnPage(e) || !ext) return false;
    try {
      await ext.popup(browsingSession(), String(extension), rect);
      return true;
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

  let registered = false;
  function registerIpc() {
    if (registered) return;
    registered = true;
    ipcMain.handle('hydor:browser-show', (e, a) => show(e, a && a.target, a && a.rect));
    ipcMain.handle('hydor:browser-hide', (e, target) => hide(e, target));
    ipcMain.handle('hydor:browser-still', (e, target) => still(e, target));
    ipcMain.handle('hydor:browser-focus', (e, target) => focus(e, target));
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
    ipcMain.on('hydor:browser-frame-ack', (e, target) => frameTaken(e, target));
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
    handlers: { show, hide, still, watch, input, edit, focus, showFile, find, zoom: zoomTab, print, mute, openExternal },
    menuTemplate,
    shortcut,
    adblock,
    conns,
  };
}

module.exports = { createBrowser };
