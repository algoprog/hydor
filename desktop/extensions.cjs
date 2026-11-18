'use strict';
// Chrome extensions in the desktop app's own browser: loads the ones the server lists into a persistent session, adds
// the chrome.* parts Electron 45 has no browser side for (tabs and windows, badges, menus, notifications, downloads…),
// and opens an extension's toolbar popup. main.cjs and browser.cjs call it as
//   const ext = createExtensions({ log, mainWindow, openTab, badge });
//   ext.prepare(ses); await ext.sync(ses, [{ id, path }]); await ext.popup(ses, id, rect);
//   ext.useTabs({ open, activate, close, bounds }); ext.tabAdded(wc); ext.tabFront(wc); ext.tabRemoved(wc);
//   ext.claimDownload(item);
//
// What Electron 45 does and does not do (measured, 45.2.1):
// - Extension pages (popups, options, MV2 background pages) run a session's frame preloads, so extension-preload.cjs
//   puts the stand-ins into their main world.
// - An extension's service worker runs NO preload (session.registerPreloadScript 'service-worker' works for ordinary
//   workers only). So for an extension with a worker, the extension is loaded from a copy (in the app's data folder)
//   whose worker is a small loader: it first runs the same stand-ins, then the extension's own worker script. The
//   worker has no ipcRenderer, so it writes to its console and `serviceWorkers` 'console-message' brings the lines here.
// - Each context has two objects with the native APIs, `chrome` and `browser`; the stand-ins go on both.
// - chrome.action, chrome.alarms, chrome.permissions, chrome.storage, chrome.runtime exist, but nothing in the app hears
//   the action's badge, so the stand-in replaces action (and answers permissions with yes). chrome.tabs has a few
//   functions that know no tab strip (the focused page counts as the active tab, an extension's popup too) and events that
//   never fire: the stand-ins replace them with the tabs of your own browsing, which this module keeps (browser.cjs tells
//   it of each tab, and which you see). chrome.windows, webNavigation, downloads, sidePanel, cookies, contextMenus and
//   notifications are not there at all; offscreen documents, idle, alarms, scripting and runtime.getContexts are.
//
// The app answers the stand-ins' questions and tells them of events over a BroadcastChannel ('hydor-ext') that every
// context of an extension hears: a small script run in one of the extension's pages posts it (the page that asked, or
// any page of the extension, or a hidden one made for that, hydor-ext-relay.html in the copy). Events go out in order,
// a few at a time.
//
// webRequest: while the ad blocker is on, the session's requests skip Chromium's extension webRequest (request-hub.cjs),
// so the requests an extension listens to and may see (its host permissions, its listeners' filters) are told from here,
// in Chrome's form, with their headers when it asked for them. They are seen, not blocked: what a listener answers is not
// used. With the blocker off, Electron's own extension webRequest serves them.
const { app, BrowserWindow, Notification, ipcMain, nativeImage, screen, shell, webContents } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { standIns } = require('./extension-preload.cjs');
const { hubOf } = require('./request-hub.cjs');

const PREFIX = 'hydor-ext:';
const STANDINS_FILE = 'hydor-ext-standins.js';
const LOADER_FILE = 'hydor-ext-worker.js';
const RELAY_FILE = 'hydor-ext-relay.html';
const SKIP_COPY = new Set(['.git', 'node_modules', '_metadata']);
const POPUP_MIN = 25;
const POPUP_MAX = { w: 800, h: 600 };
/** The side panel, shown as a popup: this wide, and as tall as the window lets it be up to the most. */
const PANEL = { w: 400, h: 900, min: 360 };
/** Your own browsing is one window to extensions. */
const WINDOW_ID = 1;
// The stand-ins' one way out of a worker.
const workerSend = (op, data) => {
  try {
    console.debug('hydor-ext:' + JSON.stringify([op, data]));
  } catch {
    // a message that cannot be written is not sent
  }
};

const readManifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, ''));

/** Size and time of every file below a folder, as one string: changes when something in it does. */
function stampOf(dir) {
  const parts = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP_COPY.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const s = fs.statSync(p);
        parts.push(`${p}:${s.size}:${Math.round(s.mtimeMs)}`);
      }
    }
  };
  walk(dir);
  return parts.join('|');
}

const safeName = (s) => String(s).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'x';

/** Whether a match pattern (`<all_urls>`, `*://*.example.com/*`…) covers an address, as Chrome reads them. */
function matchesPattern(pattern, url) {
  if (typeof pattern !== 'string' || typeof url !== 'string') return false;
  if (pattern === '<all_urls>') return /^(https?|wss?|ftp|file):/i.test(url);
  const m = /^(\*|[a-z][a-z0-9+.-]*):\/\/([^/]*)(\/.*)?$/i.exec(pattern);
  if (!m) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const scheme = u.protocol.slice(0, -1).toLowerCase();
  if (m[1] === '*' ? !['http', 'https', 'ws', 'wss'].includes(scheme) : m[1].toLowerCase() !== scheme) return false;
  const host = m[2].replace(/:(\d+|\*)$/, '').toLowerCase();
  if (scheme !== 'file' && host !== '*') {
    const h = u.hostname.toLowerCase();
    if (host.startsWith('*.')) {
      const base = host.slice(2);
      if (h !== base && !h.endsWith(`.${base}`)) return false;
    } else if (h !== host) return false;
  }
  const glob = (m[3] || '/*')
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${glob}$`).test(u.pathname + u.search);
}

/** A title pattern of tabs.query: `*` for any run of characters. */
const globMatches = (pattern, text) =>
  new RegExp(
    `^${String(pattern)
      .split('*')
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
    'i',
  ).test(String(text));

function createExtensions({ log, mainWindow, openTab, badge }) {
  const say = (...a) => {
    try {
      log(a.join(' '));
    } catch {
      // logging must never break the browser
    }
  };
  const sessions = new Map(); // Session -> { loaded: Map<registry id, record>, byRuntime: Map<runtime id, record>, chain, relays }
  let popupWin = null;
  let popupOf = null; // the runtime id whose popup is open
  let lastClosed = { id: '', at: 0 };
  let ipcListening = false;

  const stateOf = (ses) => sessions.get(ses) || null;

  // ---- your tabs, as extensions see them -------------------------------------------------------------------------
  /** browser.cjs: { open(url, { active }) -> Promise<webContents|null>, activate(wc), close(wc), bounds(wc) }. */
  let provider = null;
  /** Your tabs, in the order they opened: { wc, id, ses, url }. */
  const tabList = [];
  let front = null; // the webContents of the tab you see, or saw last
  const seenAt = new Map(); // tab id -> when it last came to the front
  const favicons = new Map(); // tab id -> its icon's address
  const watchedWindows = new WeakSet();
  let focusedWin = true;

  const entryOf = (wc) => tabList.find((x) => x.wc === wc);
  const tabsIn = (ses) => tabList.filter((x) => x.ses === ses && !x.wc.isDestroyed()).map((x) => x.wc);
  /** The tab you see in a session: the one in front, or else the newest. */
  const activeIn = (ses) => {
    const list = tabsIn(ses);
    return front && list.includes(front) ? front : list[list.length - 1] || null;
  };
  const findTab = (ses, id) => tabsIn(ses).find((w) => w.id === Number(id)) || null;
  const noTab = (id) => new Error(`No tab with id: ${id}.`);

  /** What an extension may read of a page: with "tabs", a host permission for it, or activeTab after you pressed its button there. */
  const mayRead = (rec, tabId, url) => rec.perms.has('tabs') || rec.grants.has(tabId) || rec.hosts.some((p) => matchesPattern(p, url));

  function boundsOf(wc) {
    try {
      const b = provider && provider.bounds ? provider.bounds(wc) : null;
      if (b && b.width) return b;
    } catch {}
    const w = mainWindow();
    return w && !w.isDestroyed() ? w.getContentBounds() : { width: 1280, height: 800 };
  }

  function tabInfo(rec, wc) {
    const active = wc === activeIn(rec.ses);
    const b = boundsOf(wc);
    const info = {
      id: wc.id,
      index: tabsIn(rec.ses).indexOf(wc),
      windowId: WINDOW_ID,
      active,
      highlighted: active,
      selected: active,
      pinned: false,
      incognito: false,
      discarded: false,
      autoDiscardable: true,
      frozen: false,
      groupId: -1,
      status: wc.isLoading() ? 'loading' : 'complete',
      audible: wc.isCurrentlyAudible(),
      mutedInfo: { muted: wc.isAudioMuted() },
      width: Math.round(b.width),
      height: Math.round(b.height),
      lastAccessed: seenAt.get(wc.id) || 0,
    };
    const url = wc.getURL();
    if (mayRead(rec, wc.id, url)) {
      info.url = url;
      info.title = wc.getTitle();
      const icon = favicons.get(wc.id);
      if (icon) info.favIconUrl = icon;
    }
    return info;
  }

  function windowInfo(rec, populate) {
    const w = mainWindow();
    const live = w && !w.isDestroyed();
    const b = live ? w.getBounds() : { x: 0, y: 0, width: 1280, height: 800 };
    const state = !live ? 'normal' : w.isFullScreen() ? 'fullscreen' : w.isMinimized() ? 'minimized' : w.isMaximized() ? 'maximized' : 'normal';
    return {
      id: WINDOW_ID,
      focused: live && w.isFocused(),
      top: b.y,
      left: b.x,
      width: b.width,
      height: b.height,
      incognito: false,
      type: 'normal',
      state,
      alwaysOnTop: false,
      ...(populate ? { tabs: tabsIn(rec.ses).map((t) => tabInfo(rec, t)) } : {}),
    };
  }

  /** Only pages a browser would open for a person: web pages, blank, and the extension's own pages. */
  function openable(rec, url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    if (url === 'about:blank' || u.href === 'about:blank') return 'about:blank';
    if (u.protocol === 'chrome:' && (u.host === 'newtab' || u.host === 'new-tab-page')) return 'about:blank';
    if (u.protocol === 'chrome-extension:' && u.host === rec.runtimeId) return u.href;
    return null;
  }

  /** A tab an extension opens (a page of a popup's link too): in front unless it asks otherwise. */
  async function openFor(rec, url, active = true) {
    const href = openable(rec, url);
    if (!href) throw new Error(`Cannot open ${String(url).slice(0, 200)}`);
    if (provider) {
      const wc = await provider.open(href, { active });
      if (!wc) throw new Error('The tab did not open');
      return wc;
    }
    openTab(href);
    return null;
  }
  const onTabUrl = (url, rec) => void openFor(rec, url, true).catch((e) => say(rec.name, 'could not open a tab:', e.message));

  // ---- telling extensions of things: events and answers --------------------------------------------------------------
  const post = (message) => `(() => { const c = new BroadcastChannel('hydor-ext'); c.postMessage(${JSON.stringify(message)}); setTimeout(() => c.close(), 200); })()`;

  /** A page of the extension to post from: one that is open, or (`make`) the hidden one of its copy. */
  async function pageOf(rec, make = true) {
    const prefix = `chrome-extension://${rec.runtimeId}/`;
    const open = webContents.getAllWebContents().find((w) => !w.isDestroyed() && w.session === rec.ses && w.getURL().startsWith(prefix));
    if (open) return open;
    if (!rec.relay || !make) return null;
    const st = stateOf(rec.ses);
    let relay = st.relays.get(rec.runtimeId);
    if (!relay || relay.win.isDestroyed()) {
      const win = new BrowserWindow({ show: false, width: 100, height: 100, webPreferences: { session: rec.ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      // Used once it has loaded: a script run while it loads would post from the blank page before it.
      relay = { win, ready: win.loadURL(prefix + RELAY_FILE).then(() => true, () => false) };
      st.relays.set(rec.runtimeId, relay);
    }
    return (await relay.ready) && !relay.win.isDestroyed() ? relay.win.webContents : null;
  }

  /** Tells an extension's contexts something, after what it was told before: true when it reached them (its worker, when it has one, is running). */
  function deliver(rec, message) {
    const run = () => deliverNow(rec, message);
    const next = rec.chain.then(run, run);
    rec.chain = next.catch(() => false);
    return next;
  }
  async function deliverNow(rec, message) {
    try {
      let workerUp = true;
      if (rec.worker)
        workerUp = await rec.ses.serviceWorkers.startWorkerForScope(`chrome-extension://${rec.runtimeId}/`).then(
          () => true,
          (e) => {
            say(rec.name, 'did not start:', (e && e.message) || e);
            return false;
          },
        );
      // A worker that does not start has nothing to hear it with: only pages of the extension that are open get it.
      const wc = await pageOf(rec, workerUp);
      if (!wc) return false;
      await wc.executeJavaScript(post(message));
      return workerUp;
    } catch (e) {
      say('could not reach', rec.name, ':', e.message);
      return false;
    }
  }

  /** An event, to an extension that listens to it (`args` for that extension, or null to skip it): queued, and sent in a moment with the others. */
  function tell(rec, name, args) {
    if (!rec.listening.has(name) || !args) return;
    rec.queue.push([name, args]);
    if (rec.queue.length >= 200) void flush(rec);
    else if (!rec.flushTimer) rec.flushTimer = setTimeout(() => void flush(rec), 40);
  }
  /** What is queued for an extension, sent now (in order, before anything sent after). */
  function flush(rec) {
    clearTimeout(rec.flushTimer);
    rec.flushTimer = null;
    if (!rec.queue.length) return Promise.resolve(true);
    return deliver(rec, { hydor: 'events', list: rec.queue.splice(0) });
  }
  function tellAll(ses, name, argsFor) {
    const st = stateOf(ses);
    if (!st) return;
    for (const rec of st.loaded.values()) {
      if (!rec.listening.has(name)) continue;
      let args = null;
      try {
        args = argsFor(rec);
      } catch (e) {
        say('an event for', rec.name, 'failed:', e.message);
      }
      tell(rec, name, args);
    }
  }

  function answerTo(rec, sender, message) {
    if (sender && !sender.isDestroyed()) {
      sender.executeJavaScript(post(message)).catch(() => void deliver(rec, message));
      return;
    }
    void deliver(rec, message);
  }

  // ---- the tabs browser.cjs tells of -----------------------------------------------------------------------------------
  function useTabs(p) {
    provider = p;
  }

  function watchWindow() {
    const w = mainWindow();
    if (!w || w.isDestroyed() || watchedWindows.has(w)) return;
    watchedWindows.add(w);
    const ses = () => (front && !front.isDestroyed() ? front.session : null);
    w.on('focus', () => {
      if (focusedWin) return;
      focusedWin = true;
      const s = ses();
      if (s) tellAll(s, 'windows.onFocusChanged', () => [WINDOW_ID]);
    });
    // Leaving for one of the app's own windows (an extension's popup) is not leaving the browser.
    w.on('blur', () =>
      setTimeout(() => {
        if (BrowserWindow.getFocusedWindow() || !focusedWin) return;
        focusedWin = false;
        const s = ses();
        if (s) tellAll(s, 'windows.onFocusChanged', () => [-1]);
      }, 100),
    );
  }

  /** One of your tabs (of your own browsing) is there: extensions see it, and hear of what it does. */
  function tabAdded(wc) {
    if (!wc || wc.isDestroyed() || entryOf(wc)) return;
    const entry = { wc, id: wc.id, ses: wc.session, url: wc.getURL() };
    tabList.push(entry);
    watchWindow();
    const { ses, id } = entry;
    const updated = (change) =>
      tellAll(ses, 'tabs.onUpdated', (rec) => {
        const c = { ...change };
        if (!mayRead(rec, id, wc.getURL())) for (const k of ['url', 'title', 'favIconUrl']) delete c[k];
        return Object.keys(c).length ? [id, c, tabInfo(rec, wc)] : null;
      });
    const nav = (name, extra) => tellAll(ses, `webNavigation.${name}`, () => [{ tabId: id, frameId: 0, parentFrameId: -1, processId: -1, frameType: 'outermost_frame', documentLifecycle: 'active', timeStamp: Date.now(), url: wc.getURL(), ...extra }]);
    wc.on('did-start-loading', () => updated({ status: 'loading' }));
    wc.on('did-stop-loading', () => updated({ status: 'complete' }));
    wc.on('page-title-updated', (_e, title) => updated({ title }));
    wc.on('page-favicon-updated', (_e, icons) => {
      if (!Array.isArray(icons) || !icons[0]) return;
      favicons.set(id, icons[0]);
      updated({ favIconUrl: icons[0] });
    });
    wc.on('audio-state-changed', (e) => updated({ audible: !!(e && e.audible) }));
    wc.on('did-start-navigation', (d) => {
      if (!d || !d.isMainFrame || d.isSameDocument) return;
      nav('onBeforeNavigate', { url: d.url });
    });
    wc.on('did-navigate', (_e, url) => {
      entry.url = url;
      favicons.delete(id);
      // activeTab lasts until the tab goes to another page.
      const st = stateOf(ses);
      if (st) for (const rec of st.loaded.values()) rec.grants.delete(id);
      updated({ url });
      nav('onCommitted', { url, transitionType: 'link', transitionQualifiers: [] });
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      const was = entry.url;
      entry.url = url;
      updated({ url });
      const sameButHash = String(was).split('#')[0] === String(url).split('#')[0];
      nav(sameButHash ? 'onReferenceFragmentUpdated' : 'onHistoryStateUpdated', { url, transitionType: 'link', transitionQualifiers: [] });
    });
    wc.on('dom-ready', () => nav('onDOMContentLoaded', {}));
    wc.on('did-finish-load', () => nav('onCompleted', {}));
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) nav('onErrorOccurred', { url, error: `net::${desc}` });
    });
    wc.once('destroyed', () => tabRemoved(wc));
    tellAll(ses, 'tabs.onCreated', (rec) => [tabInfo(rec, wc)]);
  }

  function tabRemoved(wc) {
    const entry = entryOf(wc);
    if (!entry) return;
    tabList.splice(tabList.indexOf(entry), 1);
    if (front === wc) front = null;
    seenAt.delete(entry.id);
    favicons.delete(entry.id);
    const st = stateOf(entry.ses);
    if (st) for (const rec of st.loaded.values()) rec.grants.delete(entry.id);
    tellAll(entry.ses, 'tabs.onRemoved', () => [entry.id, { windowId: WINDOW_ID, isWindowClosing: false }]);
  }

  /** The tab you see now. */
  function tabFront(wc) {
    if (!wc || wc.isDestroyed() || wc === front || !entryOf(wc)) return;
    const was = front && !front.isDestroyed() ? front.id : undefined;
    front = wc;
    seenAt.set(wc.id, Date.now());
    const { ses, id } = entryOf(wc);
    tellAll(ses, 'tabs.onActivated', () => [{ tabId: id, windowId: WINDOW_ID, ...(was !== undefined ? { previousTabId: was } : {}) }]);
    tellAll(ses, 'tabs.onHighlighted', () => [{ tabIds: [id], windowId: WINDOW_ID }]);
  }

  // ---- what the extensions send us ---------------------------------------------------------------------------------
  function iconFor(rec, iconUrl) {
    if (!iconUrl) return undefined;
    try {
      const u = new URL(iconUrl, `chrome-extension://${rec.runtimeId}/`);
      if (u.protocol !== 'chrome-extension:' || u.host !== rec.runtimeId) return undefined;
      const file = path.resolve(rec.loadedPath, decodeURIComponent(u.pathname).replace(/^\/+/, ''));
      if (!file.startsWith(path.resolve(rec.loadedPath) + path.sep)) return undefined;
      const img = nativeImage.createFromPath(file);
      return img.isEmpty() ? undefined : img;
    } catch {
      return undefined;
    }
  }

  function onMessage(rec, op, data, sender) {
    if (!data || typeof data !== 'object') data = {};
    if (op === 'ask') {
      const id = String(data.id || '');
      if (!id) return;
      Promise.resolve()
        .then(() => answer(rec, String(data.op || ''), data.data, sender))
        .then(
          (value) => answerTo(rec, sender, { hydor: 'answer', id, ok: true, value: value === undefined ? null : value }),
          (e) => answerTo(rec, sender, { hydor: 'answer', id, ok: false, error: String((e && e.message) || e).slice(0, 500) }),
        );
    } else if (op === 'listen') {
      if (typeof data.event !== 'string' || data.event.length >= 80) return;
      rec.listening.add(data.event);
      if (data.event.startsWith('webRequest.')) {
        const spec = rec.webSpec.get(data.event) || new Set();
        for (const x of Array.isArray(data.spec) ? data.spec.slice(0, 10) : []) if (typeof x === 'string') spec.add(x);
        rec.webSpec.set(data.event, spec);
        const f = data.filter && typeof data.filter === 'object' ? data.filter : {};
        const filters = rec.webFilters.get(data.event) || [];
        if (filters.length < 50)
          filters.push({
            urls: Array.isArray(f.urls) ? f.urls.filter((u) => typeof u === 'string').slice(0, 100) : null,
            types: Array.isArray(f.types) ? f.types.filter((t) => typeof t === 'string') : null,
            tabId: typeof f.tabId === 'number' ? f.tabId : null,
          });
        rec.webFilters.set(data.event, filters);
        wantRequests(rec.ses);
      }
    } else if (op === 'badge') {
      if (data.text !== undefined) rec.badge.text = String(data.text).slice(0, 12);
      if (data.color !== undefined) rec.badge.color = String(data.color).slice(0, 80);
      if (data.title !== undefined) rec.badge.title = String(data.title).slice(0, 200);
      const b = { extension: rec.id, text: rec.badge.text };
      if (rec.badge.color !== undefined) b.color = rec.badge.color;
      if (rec.badge.title !== undefined) b.title = rec.badge.title;
      try {
        badge(b);
      } catch (e) {
        say('badge failed:', e.message);
      }
    } else if (op === 'popup') {
      rec.popup = typeof data.popup === 'string' ? data.popup : null;
    } else if (op === 'sidePanel') {
      if (typeof data.path === 'string') rec.panel.path = data.path;
      if (typeof data.enabled === 'boolean') rec.panel.enabled = data.enabled;
      if (typeof data.onClick === 'boolean') rec.panel.onClick = data.onClick;
    } else if (op === 'notify') {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title: String(data.title || rec.name).slice(0, 200), body: String(data.message || '').slice(0, 1000), silent: data.silent === true, icon: iconFor(rec, data.iconUrl) });
      const id = String(data.id || '');
      rec.notes.set(id, n);
      n.on('click', () => void deliver(rec, { hydor: 'event', name: 'notifications.onClicked', args: [id] }));
      n.on('close', () => rec.notes.delete(id));
      n.show();
    } else if (op === 'notify-clear') {
      const n = rec.notes.get(String(data.id || ''));
      if (n) n.close();
    }
  }

  // ---- the questions the stand-ins ask -----------------------------------------------------------------------------
  async function answer(rec, op, data, sender) {
    const d = data && typeof data === 'object' ? data : {};
    const ses = rec.ses;
    switch (op) {
      case 'tabs.query': {
        const q = d;
        return tabsIn(ses)
          .map((wc) => tabInfo(rec, wc))
          .filter((t) => {
            for (const k of ['active', 'highlighted', 'pinned', 'audible', 'discarded']) if (q[k] !== undefined && q[k] !== null && t[k] !== !!q[k]) return false;
            if (q.muted !== undefined && q.muted !== null && t.mutedInfo.muted !== !!q.muted) return false;
            if (q.status && t.status !== q.status) return false;
            if (typeof q.index === 'number' && t.index !== q.index) return false;
            if (q.windowId !== undefined && q.windowId !== null && q.windowId !== -2 && q.windowId !== WINDOW_ID) return false;
            if (q.windowType && q.windowType !== 'normal') return false;
            if (q.groupId !== undefined && q.groupId !== null && q.groupId !== -1) return false;
            if (q.currentWindow === false || q.lastFocusedWindow === false) return false;
            if (q.url !== undefined && q.url !== null && !(t.url && [].concat(q.url).some((p) => matchesPattern(p, t.url)))) return false;
            if (q.title !== undefined && q.title !== null && !(t.title !== undefined && globMatches(q.title, t.title))) return false;
            return true;
          });
      }
      case 'tabs.get': {
        const wc = findTab(ses, data);
        if (!wc) throw noTab(data);
        return tabInfo(rec, wc);
      }
      case 'tabs.getCurrent':
        return sender && entryOf(sender) ? tabInfo(rec, sender) : undefined;
      case 'tabs.create': {
        const wc = await openFor(rec, d.url ? String(d.url) : 'about:blank', d.active !== false);
        if (!wc) return undefined;
        const t = tabInfo(rec, wc);
        if (d.url && mayRead(rec, wc.id, String(d.url))) t.pendingUrl = String(d.url);
        return t;
      }
      case 'tabs.update': {
        const wc = d.tabId === null || d.tabId === undefined ? activeIn(ses) : findTab(ses, d.tabId);
        if (!wc) throw noTab(d.tabId);
        const p = d.props || {};
        if (typeof p.url === 'string') {
          const href = openable(rec, p.url);
          if (!href) throw new Error(`Cannot navigate to ${p.url.slice(0, 200)}`);
          wc.loadURL(href).catch(() => {});
        }
        if ((p.active === true || p.highlighted === true) && provider) provider.activate(wc);
        if (typeof p.muted === 'boolean') wc.setAudioMuted(p.muted);
        return tabInfo(rec, wc);
      }
      case 'tabs.remove': {
        for (const id of Array.isArray(data) ? data : [data]) {
          const wc = findTab(ses, id);
          if (wc && provider) provider.close(wc);
          else {
            const win = [...rec.windows.values()].find((w) => !w.isDestroyed() && w.webContents.id === Number(id));
            if (win) win.close();
            else throw noTab(id);
          }
        }
        return undefined;
      }
      case 'tabs.reload': {
        const wc = d.tabId === null || d.tabId === undefined ? activeIn(ses) : findTab(ses, d.tabId);
        if (!wc) throw noTab(d.tabId);
        if (d.props && d.props.bypassCache) wc.reloadIgnoringCache();
        else wc.reload();
        return undefined;
      }
      case 'tabs.duplicate': {
        const wc = findTab(ses, data);
        if (!wc) throw noTab(data);
        const copy = await openFor(rec, wc.getURL() || 'about:blank', true);
        return copy ? tabInfo(rec, copy) : undefined;
      }
      case 'tabs.goBack':
      case 'tabs.goForward': {
        const wc = data === null || data === undefined ? activeIn(ses) : findTab(ses, data);
        if (!wc) throw noTab(data);
        const h = wc.navigationHistory;
        if (op === 'tabs.goBack' ? !h.canGoBack() : !h.canGoForward()) throw new Error('Cannot find a next page in history.');
        if (op === 'tabs.goBack') h.goBack();
        else h.goForward();
        return undefined;
      }
      case 'tabs.captureVisibleTab': {
        const wc = activeIn(ses);
        if (!wc) throw new Error('No tab to capture');
        // As in Chrome: <all_urls>, or activeTab after you pressed its button on this tab.
        if (!rec.hosts.includes('<all_urls>') && !rec.grants.has(wc.id)) throw new Error("Either the '<all_urls>' or 'activeTab' permission is required.");
        const img = await wc.capturePage();
        const o = d.options || {};
        if (o.format === 'png') return img.toDataURL();
        const quality = Math.max(0, Math.min(100, Number.isFinite(o.quality) ? o.quality : 92));
        return `data:image/jpeg;base64,${img.toJPEG(quality).toString('base64')}`;
      }
      case 'tabs.highlight': {
        const list = tabsIn(ses);
        const i = [].concat(d.tabs)[0];
        const wc = list[Number(i)];
        if (!wc) throw new Error(`No tab at index: ${i}.`);
        if (provider) provider.activate(wc);
        return windowInfo(rec, true);
      }
      case 'tabs.move': {
        const out = (d.ids || []).map((id) => findTab(ses, id)).filter(Boolean).map((wc) => tabInfo(rec, wc));
        return out.length === 1 ? out[0] : out;
      }
      case 'tabs.discard': {
        const wc = data === null || data === undefined ? activeIn(ses) : findTab(ses, data);
        if (!wc) throw noTab(data);
        return tabInfo(rec, wc);
      }
      case 'windows.get': {
        const id = d.windowId;
        if (id === undefined || id === null || id === -2 || id === WINDOW_ID) return windowInfo(rec, !!(d.info && d.info.populate));
        const win = rec.windows.get(Number(id));
        if (win && !win.isDestroyed()) return extWindowInfo(rec, Number(id), win);
        throw new Error(`No window with id: ${id}.`);
      }
      case 'windows.getAll': {
        const types = Array.isArray(d.windowTypes) ? d.windowTypes : ['normal', 'popup'];
        const out = types.includes('normal') ? [windowInfo(rec, !!d.populate)] : [];
        for (const [id, win] of rec.windows) if (!win.isDestroyed() && types.includes('popup')) out.push(extWindowInfo(rec, id, win));
        return out;
      }
      case 'windows.create':
        return createWindow(rec, d);
      case 'windows.update': {
        const id = Number(d.windowId);
        const info = d.info || {};
        if (id === WINDOW_ID || id === -2) {
          const w = mainWindow();
          if (info.focused === true && w && !w.isDestroyed()) w.focus();
          return windowInfo(rec, false);
        }
        const win = rec.windows.get(id);
        if (!win || win.isDestroyed()) throw new Error(`No window with id: ${id}.`);
        const b = win.getBounds();
        const nb = { x: info.left ?? b.x, y: info.top ?? b.y, width: info.width ?? b.width, height: info.height ?? b.height };
        if (nb.x !== b.x || nb.y !== b.y || nb.width !== b.width || nb.height !== b.height) win.setBounds(nb);
        if (info.state === 'minimized') win.minimize();
        else if (info.state === 'maximized') win.maximize();
        else if (info.state === 'normal') win.restore();
        if (info.focused === true) win.focus();
        return extWindowInfo(rec, id, win);
      }
      case 'windows.remove': {
        const id = Number(data);
        const win = rec.windows.get(id);
        if (win && !win.isDestroyed()) {
          win.close();
          return undefined;
        }
        if (id === WINDOW_ID) throw new Error('An extension cannot close this window');
        throw new Error(`No window with id: ${id}.`);
      }
      case 'action.openPopup':
        return popup(ses, rec.id, rec.lastRect);
      case 'sidePanel.open': {
        const page = typeof d.path === 'string' && d.path ? d.path : panelPage(rec);
        if (!page) throw new Error('No side panel to open');
        return showPopup(rec, page, rec.lastRect, true);
      }
      case 'runtime.getPlatformInfo': {
        const os = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform === 'linux' ? 'linux' : process.platform;
        const arch = process.arch === 'x64' ? 'x86-64' : process.arch === 'ia32' ? 'x86-32' : process.arch;
        return { os, arch, nacl_arch: arch };
      }
      case 'webNavigation.getFrame':
      case 'webNavigation.getAllFrames': {
        const wc = findTab(ses, d.tabId);
        if (!wc) return null;
        const frames = framesOf(wc);
        if (op === 'webNavigation.getAllFrames') return frames;
        const f = frames.find((x) => x.frameId === Number(d.frameId ?? 0));
        return f || null;
      }
      case 'downloads.download':
        return startDownload(rec, d);
      case 'downloads.search':
        return searchDownloads(rec, d);
      case 'downloads.pause':
      case 'downloads.resume':
      case 'downloads.cancel': {
        const dl = rec.downloads.get(Number(data));
        if (!dl) throw new Error(`Download ${data} not found`);
        if (dl.item) dl.item[op.slice('downloads.'.length)]();
        else if (op === 'downloads.cancel') dl.cancelled = true;
        return undefined;
      }
      case 'downloads.open':
      case 'downloads.show': {
        const dl = rec.downloads.get(Number(data));
        const file = dl && dl.item ? dl.item.getSavePath() : '';
        if (!file || !fs.existsSync(file)) throw new Error('The file is not there');
        if (op === 'downloads.open') await shell.openPath(file);
        else shell.showItemInFolder(file);
        return undefined;
      }
      case 'downloads.showDefaultFolder':
        await shell.openPath(app.getPath('downloads'));
        return undefined;
      case 'downloads.erase': {
        const ids = searchDownloads(rec, d).map((x) => x.id);
        for (const id of ids) {
          rec.downloads.delete(id);
          tell(rec, 'downloads.onErased', [id]);
        }
        return ids;
      }
      case 'downloads.removeFile':
        return undefined;
      case 'cookies.getAll':
        return cookiesFor(rec, d);
      case 'cookies.get': {
        if (!d.url || !d.name) throw new Error('A url and a name are needed');
        const list = await cookiesFor(rec, { url: d.url, name: d.name });
        return list[0] || null;
      }
      case 'cookies.set': {
        if (!d.url || !rec.hosts.some((p) => matchesPattern(p, String(d.url)))) throw new Error(`No host permission for cookies at ${d.url}`);
        const c = { url: String(d.url) };
        for (const k of ['name', 'value', 'domain', 'path', 'secure', 'httpOnly', 'expirationDate']) if (d[k] !== undefined) c[k] = d[k];
        if (d.sameSite && d.sameSite !== 'unspecified') c.sameSite = d.sameSite;
        await ses.cookies.set(c);
        const list = await cookiesFor(rec, { url: d.url, name: d.name || '' });
        return list[0] || null;
      }
      case 'cookies.remove': {
        if (!d.url || !rec.hosts.some((p) => matchesPattern(p, String(d.url)))) throw new Error(`No host permission for cookies at ${d.url}`);
        await ses.cookies.remove(String(d.url), String(d.name || ''));
        return { url: String(d.url), name: String(d.name || ''), storeId: '0' };
      }
      case 'cookies.getAllCookieStores':
        return [{ id: '0', tabIds: tabsIn(ses).map((w) => w.id) }];
      default:
        throw new Error(`${op} is not available in this browser`);
    }
  }

  function framesOf(wc) {
    const out = [];
    try {
      const main = wc.mainFrame;
      out.push({ frameId: 0, parentFrameId: -1, url: main.url, errorOccurred: false, frameType: 'outermost_frame', documentLifecycle: 'active', processId: main.processId });
      for (const f of main.framesInSubtree) {
        if (f === main) continue;
        const parent = f.parent;
        out.push({
          frameId: f.frameTreeNodeId,
          parentFrameId: !parent || parent === main ? 0 : parent.frameTreeNodeId,
          url: f.url,
          errorOccurred: false,
          frameType: 'sub_frame',
          documentLifecycle: 'active',
          processId: f.processId,
        });
      }
    } catch {
      // a page that is going away has no frames to tell of
    }
    return out;
  }

  // ---- windows an extension makes ------------------------------------------------------------------------------------
  let windowSeq = 100;
  function extWindowInfo(rec, id, win) {
    const b = win.getBounds();
    const wc = win.webContents;
    return {
      id,
      focused: win.isFocused(),
      top: b.y,
      left: b.x,
      width: b.width,
      height: b.height,
      incognito: false,
      type: 'popup',
      state: win.isMinimized() ? 'minimized' : win.isMaximized() ? 'maximized' : 'normal',
      alwaysOnTop: false,
      tabs: [{ id: wc.id, index: 0, windowId: id, active: true, highlighted: true, selected: true, pinned: false, incognito: false, discarded: false, autoDiscardable: true, groupId: -1, status: wc.isLoading() ? 'loading' : 'complete', url: wc.getURL(), title: wc.getTitle() }],
    };
  }

  /**
   * windows.create: a page of the extension as a popup or panel is a small window of its own (a sign-in box, a player);
   * anything else opens as tabs of your own browsing.
   */
  async function createWindow(rec, d) {
    const urls = (Array.isArray(d.url) ? d.url : d.url ? [d.url] : []).map(String).filter(Boolean);
    const own = urls.length > 0 && urls.every((u) => u.startsWith(`chrome-extension://${rec.runtimeId}/`));
    if (own && (d.type === 'popup' || d.type === 'panel')) {
      const size = (v, lo, hi, dflt) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : dflt));
      const win = new BrowserWindow({
        width: size(d.width, 200, 2000, 500),
        height: size(d.height, 150, 1600, 600),
        ...(Number.isFinite(d.left) && Number.isFinite(d.top) ? { x: d.left, y: d.top } : {}),
        title: rec.name,
        show: false,
        autoHideMenuBar: true,
        webPreferences: { session: rec.ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      const id = ++windowSeq;
      rec.windows.set(id, win);
      win.on('closed', () => {
        rec.windows.delete(id);
        tell(rec, 'windows.onRemoved', [id]);
      });
      win.webContents.setWindowOpenHandler(({ url }) => {
        onTabUrl(url, rec);
        return { action: 'deny' };
      });
      await win.loadURL(urls[0]);
      if (win.isDestroyed()) throw new Error('The window closed');
      if (d.focused === false) win.showInactive();
      else win.show();
      const info = extWindowInfo(rec, id, win);
      tell(rec, 'windows.onCreated', [info]);
      return info;
    }
    let first = true;
    for (const u of urls.length ? urls : ['about:blank']) {
      await openFor(rec, u, first && d.focused !== false);
      first = false;
    }
    return windowInfo(rec, true);
  }

  // ---- downloads an extension starts ----------------------------------------------------------------------------------
  let downloadSeq = 0;
  /** Downloads asked for whose item has not come yet, by address: { rec, dl }. */
  const expected = [];

  function downloadInfo(rec, dl) {
    const item = dl.item;
    const state = dl.state;
    return {
      id: dl.id,
      url: dl.url,
      finalUrl: item ? item.getURL() : dl.url,
      referrer: '',
      filename: item ? item.getSavePath() || '' : '',
      incognito: false,
      danger: 'safe',
      mime: item ? item.getMimeType() : '',
      startTime: dl.startTime,
      ...(dl.endTime ? { endTime: dl.endTime } : {}),
      state,
      paused: item ? item.isPaused() : false,
      canResume: item ? item.canResume() : false,
      ...(dl.error ? { error: dl.error } : {}),
      bytesReceived: item ? item.getReceivedBytes() : 0,
      totalBytes: item ? item.getTotalBytes() : -1,
      fileSize: item ? item.getTotalBytes() : -1,
      exists: state === 'complete',
      byExtensionId: rec.runtimeId,
      byExtensionName: rec.name,
    };
  }

  async function startDownload(rec, d) {
    const url = String(d.url || '');
    if (!/^(https?|blob|data):/i.test(url)) throw new Error('Invalid URL');
    if (/^blob:/i.test(url) && !url.startsWith(`blob:chrome-extension://${rec.runtimeId}/`)) throw new Error('Invalid URL');
    const name = typeof d.filename === 'string' ? path.basename(d.filename.replace(/\\/g, '/')).replace(/[\0-\x1f<>:"|?*]/g, '_').slice(0, 200) : '';
    const dl = { id: ++downloadSeq, url, name, item: null, state: 'in_progress', startTime: new Date().toISOString(), endTime: '', error: '', cancelled: false };
    rec.downloads.set(dl.id, dl);
    expected.push({ rec, dl, at: Date.now() });
    // A blob: or data: address is the extension's own: the download starts from one of its pages.
    const page = /^(blob|data):/i.test(url) ? await pageOf(rec) : null;
    const headers = Array.isArray(d.headers) ? Object.fromEntries(d.headers.filter((h) => h && h.name).map((h) => [String(h.name), String(h.value ?? '')])) : null;
    if (page) page.downloadURL(url);
    else rec.ses.downloadURL(url, headers ? { headers } : undefined);
    tell(rec, 'downloads.onCreated', [downloadInfo(rec, dl)]);
    return dl.id;
  }

  function searchDownloads(rec, q) {
    let list = [...rec.downloads.values()];
    if (q.id !== undefined && q.id !== null) list = list.filter((x) => x.id === Number(q.id));
    if (q.url) list = list.filter((x) => x.url === q.url);
    if (q.state) list = list.filter((x) => x.state === q.state);
    if (q.filenameRegex)
      try {
        const re = new RegExp(String(q.filenameRegex));
        list = list.filter((x) => re.test(x.item ? x.item.getSavePath() : ''));
      } catch {}
    if (q.query) list = list.filter((x) => [].concat(q.query).every((w) => x.url.includes(String(w).replace(/^-/, ''))));
    const out = list.map((x) => downloadInfo(rec, x));
    if (Array.isArray(q.orderBy) && q.orderBy.includes('-startTime')) out.reverse();
    return typeof q.limit === 'number' && q.limit > 0 ? out.slice(0, q.limit) : out;
  }

  /** browser.cjs's will-download: a download an extension asked for is followed here; its name is the one it asked for. */
  function claimDownload(item) {
    const url = item.getURL();
    const chain = typeof item.getURLChain === 'function' ? item.getURLChain() : [url];
    for (let i = expected.length - 1; i >= 0; i--) if (Date.now() - expected[i].at > 60000) expected.splice(i, 1);
    const i = expected.findIndex((x) => x.dl.url === url || chain.includes(x.dl.url));
    if (i < 0) return null;
    const { rec, dl } = expected.splice(i, 1)[0];
    dl.item = item;
    if (dl.cancelled) {
      item.cancel();
      return { name: dl.name };
    }
    const changed = (delta) => tell(rec, 'downloads.onChanged', [{ id: dl.id, ...delta }]);
    let last = 0;
    item.on('updated', (_e, state) => {
      if (state === 'interrupted') {
        dl.state = 'interrupted';
        dl.error = 'NETWORK_FAILED';
        changed({ state: { previous: 'in_progress', current: 'interrupted' } });
      } else if (Date.now() - last > 1000) {
        last = Date.now();
        changed({ bytesReceived: { current: item.getReceivedBytes() } });
      }
    });
    item.on('done', (_e, state) => {
      const previous = dl.state;
      dl.state = state === 'completed' ? 'complete' : 'interrupted';
      dl.endTime = new Date().toISOString();
      if (state !== 'completed') dl.error = state === 'cancelled' ? 'USER_CANCELED' : 'NETWORK_FAILED';
      changed({ state: { previous, current: dl.state }, endTime: { current: dl.endTime }, ...(dl.error ? { error: { current: dl.error } } : {}) });
    });
    return { name: dl.name };
  }

  // ---- cookies (with the host permissions the extension has) ----------------------------------------------------------
  const cookieUrl = (c) => `${c.secure ? 'https' : 'http'}://${String(c.domain || '').replace(/^\./, '')}${c.path || '/'}`;
  const mayCookie = (rec, c) => rec.hosts.some((p) => matchesPattern(p, cookieUrl(c)));
  const SAME_SITE = { no_restriction: 'no_restriction', lax: 'lax', strict: 'strict', unspecified: 'unspecified' };
  const cookieOf = (c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    hostOnly: !!c.hostOnly,
    path: c.path,
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: SAME_SITE[c.sameSite] || 'unspecified',
    session: !!c.session,
    ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate } : {}),
    storeId: '0',
  });
  async function cookiesFor(rec, d) {
    const filter = {};
    for (const k of ['url', 'name', 'domain', 'path', 'secure', 'session']) if (d[k] !== undefined && d[k] !== null) filter[k] = d[k];
    const list = await rec.ses.cookies.get(filter);
    return list.filter((c) => mayCookie(rec, c)).map(cookieOf);
  }

  // ---- requests (webRequest), while the app has the session's (request-hub.cjs) -----------------------------------------
  const TYPES = { mainFrame: 'main_frame', subFrame: 'sub_frame', xhr: 'xmlhttprequest', cspReport: 'csp_report', webSocket: 'websocket' };
  const headerList = (h) => Object.entries(h || {}).flatMap(([name, v]) => (Array.isArray(v) ? v : [v]).map((value) => ({ name, value: String(value) })));
  const originOf = (u) => {
    try {
      const o = new URL(u).origin;
      return o && o !== 'null' ? o : undefined;
    } catch {
      return undefined;
    }
  };

  /** The events the extensions of a session listen to, for the hub (Electron's names). */
  function wantRequests(ses) {
    const st = stateOf(ses);
    const names = new Set();
    if (st) for (const rec of st.loaded.values()) for (const k of rec.listening) if (k.startsWith('webRequest.')) names.add(k.slice('webRequest.'.length));
    hubOf(ses).want('extensions', names);
  }

  /** A request in Chrome's form, without its headers. */
  function requestDetails(d) {
    const type = TYPES[d.resourceType] || String(d.resourceType || 'other').toLowerCase();
    const wcId = typeof d.webContentsId === 'number' ? d.webContentsId : -1;
    const tabId = tabList.some((x) => x.id === wcId) ? wcId : -1;
    let frameId = type === 'main_frame' ? 0 : -1;
    let parentFrameId = -1;
    let initiator = type === 'main_frame' && d.referrer ? originOf(d.referrer) : undefined;
    try {
      const f = d.frame;
      if (f && type !== 'main_frame') {
        frameId = f.parent ? f.frameTreeNodeId : 0;
        parentFrameId = !f.parent ? -1 : f.parent.parent ? f.parent.frameTreeNodeId : 0;
        initiator = originOf(f.url) || initiator;
      }
    } catch {
      // the frame is gone already
    }
    const out = { requestId: String(d.id), url: d.url, method: d.method, frameId, parentFrameId, tabId, type, timeStamp: d.timestamp };
    if (tabId !== -1) out.windowId = WINDOW_ID;
    if (initiator) out.initiator = initiator;
    if (d.statusCode !== undefined) out.statusCode = d.statusCode;
    if (d.statusLine) out.statusLine = d.statusLine;
    if (d.ip) out.ip = d.ip;
    if (d.fromCache !== undefined) out.fromCache = d.fromCache;
    if (d.redirectURL) out.redirectUrl = d.redirectURL;
    if (d.error) out.error = d.error;
    return out;
  }

  function onRequest(ses, event, d) {
    const st = stateOf(ses);
    if (!st || !d || typeof d.url !== 'string') return;
    const key = `webRequest.${event}`;
    let base = null;
    for (const rec of st.loaded.values()) {
      if (!rec.listening.has(key)) continue;
      // As in Chrome: only the requests of sites it has host permissions for.
      if (!rec.hosts.some((p) => matchesPattern(p, d.url))) continue;
      base = base || requestDetails(d);
      const filters = rec.webFilters.get(key) || [];
      if (filters.length && !filters.some((f) => (!f.urls || f.urls.some((p) => matchesPattern(p, d.url))) && (!f.types || f.types.includes(base.type)) && (f.tabId === null || f.tabId === base.tabId))) continue;
      const spec = rec.webSpec.get(key);
      const out = { ...base };
      if (spec && spec.has('requestHeaders') && d.requestHeaders) out.requestHeaders = headerList(d.requestHeaders);
      if (spec && spec.has('responseHeaders') && d.responseHeaders) out.responseHeaders = headerList(d.responseHeaders);
      tell(rec, key, [out]);
    }
  }

  function recordOfHost(ses, host) {
    const st = stateOf(ses);
    return st ? st.byRuntime.get(host) : undefined;
  }

  function listenIpc() {
    if (ipcListening) return;
    ipcListening = true;
    ipcMain.on('hydor:ext', (e, op, data) => {
      try {
        const url = (e.senderFrame && e.senderFrame.url) || '';
        if (!url.startsWith('chrome-extension://')) return;
        const rec = recordOfHost(e.sender.session, new URL(url).host);
        if (rec) onMessage(rec, String(op), data, e.sender);
      } catch (err) {
        say('message from an extension page failed:', err.message);
      }
    });
  }

  // ---- once per session ----------------------------------------------------------------------------------------------
  function prepare(ses) {
    if (sessions.has(ses)) return;
    const st = { loaded: new Map(), byRuntime: new Map(), chain: Promise.resolve(), relays: new Map() };
    sessions.set(ses, st);
    listenIpc();
    try {
      ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'extension-preload.cjs'), matches: ['chrome-extension://*/*'] });
    } catch (e) {
      say('could not register the extension preload:', e.message);
    }
    // The lines the stand-ins in an extension's worker write to its console are its messages to the app. The worker is
    // known by its version; while it is still being installed that may not be found yet, and the line's own script (the
    // stand-ins, a file of the extension) says whose it is.
    ses.serviceWorkers.on('console-message', (_e, d) => {
      if (typeof d.message !== 'string' || !d.message.startsWith(PREFIX)) return;
      try {
        let host = '';
        try {
          const scope = ses.serviceWorkers.getInfoFromVersionID(d.versionId).scope;
          if (scope.startsWith('chrome-extension://')) host = new URL(scope).host;
        } catch {
          const src = new URL(String(d.sourceUrl || ''));
          if (src.protocol === 'chrome-extension:') host = src.host;
        }
        const rec = host ? recordOfHost(ses, host) : undefined;
        const [op, data] = JSON.parse(d.message.slice(PREFIX.length));
        if (rec) onMessage(rec, String(op), data, null);
      } catch (err) {
        say('message from an extension worker failed:', err.message);
      }
    });
    ses.extensions.on('extension-unloaded', (_e, x) => {
      const rec = st.byRuntime.get(x.id);
      if (rec) forget(st, rec);
    });
    hubOf(ses).observe((event, d) => onRequest(ses, event, d));
    ses.cookies.on('changed', (_e, cookie, cause, removed) => {
      const why = cause === 'expired-overwrite' ? 'expired_overwrite' : cause;
      tellAll(ses, 'cookies.onChanged', (rec) => (mayCookie(rec, cookie) ? [{ removed: !!removed, cookie: cookieOf(cookie), cause: why }] : null));
    });
  }

  function forget(st, rec) {
    st.byRuntime.delete(rec.runtimeId);
    if (st.loaded.get(rec.id) === rec) st.loaded.delete(rec.id);
    const relay = st.relays.get(rec.runtimeId);
    if (relay && !relay.win.isDestroyed()) relay.win.destroy();
    st.relays.delete(rec.runtimeId);
    clearTimeout(rec.flushTimer);
    rec.queue.length = 0;
    for (const n of rec.notes.values()) n.close();
    for (const w of rec.windows.values()) if (!w.isDestroyed()) w.destroy();
    rec.windows.clear();
    for (const x of expected.filter((e) => e.rec === rec)) expected.splice(expected.indexOf(x), 1);
    if (popupOf === rec.runtimeId) closePopup();
    wantRequests(rec.ses);
  }

  // ---- loading ---------------------------------------------------------------------------------------------------------
  // One folder for each extension in each session (the browsing profile and the agents' profiles may run the same one).
  const shimDir = (ses, id) => {
    const where = crypto.createHash('sha1').update(String(ses.storagePath || '')).digest('hex').slice(0, 8);
    return path.join(app.getPath('userData'), 'extension-shims', `${where}-${safeName(id)}`);
  };

  /** A copy of the extension whose worker first runs the stand-ins (see the top of this file), in the app's data folder. */
  function shimmed(ses, id, src, manifest) {
    const bg = manifest.background;
    // The worker's place comes from the manifest: inside the extension, or no stand-ins (they would be written elsewhere).
    const given = String(bg.service_worker).replace(/\\/g, '/').replace(/^\/+/, '');
    const workerRel = path.posix.normalize(given);
    if (!given || /^[A-Za-z]:/.test(given) || given.split('/').includes('..') || workerRel === '..' || workerRel.startsWith('../') || path.posix.isAbsolute(workerRel) || workerRel.endsWith('/'))
      throw new Error(`its service worker path ${JSON.stringify(String(bg.service_worker).slice(0, 200))} is not inside the extension`);
    const dir = shimDir(ses, id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.cpSync(src, dir, { recursive: true, filter: (from) => !SKIP_COPY.has(path.basename(from)) });
    const workerDir = path.posix.dirname(workerRel);
    const real = fs.realpathSync(dir);
    // Every file the stand-ins add stays inside the copy: not through a link, and not by its name.
    const put = (rel, data) => {
      const file = path.resolve(dir, rel);
      if (file !== dir && !file.startsWith(dir + path.sep)) throw new Error(`${rel} is outside the extension`);
      const parent = fs.realpathSync(path.dirname(file));
      if (parent !== real && !parent.startsWith(real + path.sep)) throw new Error(`${rel} is outside the extension`);
      try {
        if (fs.lstatSync(file).isSymbolicLink()) fs.unlinkSync(file);
      } catch {}
      fs.writeFileSync(file, data);
    };
    const into = (name) => path.join(workerDir, name);
    put(into(STANDINS_FILE), `(${standIns.toString()})(${workerSend.toString()}, 'worker');\n`);
    const orig = path.posix.basename(workerRel);
    put(
      into(LOADER_FILE),
      bg.type === 'module' ? `import './${STANDINS_FILE}';\nimport './${orig}';\n` : `importScripts('${STANDINS_FILE}', ${JSON.stringify(orig)});\n`,
    );
    put(RELAY_FILE, '<!doctype html><meta charset="utf-8"><title></title>\n');
    const changed = { ...manifest, background: { ...bg, service_worker: path.posix.join(workerDir, LOADER_FILE) } };
    put('manifest.json', JSON.stringify(changed));
    return dir;
  }

  /** What a manifest lets an extension read: its permissions, and the sites it may touch (content scripts' too). */
  function accessOf(manifest) {
    const perms = new Set();
    const hosts = [];
    const add = (p) => {
      if (typeof p !== 'string') return;
      if (p === '<all_urls>' || p.includes('://')) hosts.push(p);
      else perms.add(p);
    };
    for (const k of ['permissions', 'optional_permissions', 'host_permissions', 'optional_host_permissions']) for (const p of manifest[k] || []) add(p);
    for (const cs of manifest.content_scripts || []) for (const p of (cs && cs.matches) || []) add(p);
    return { perms, hosts };
  }

  async function loadOne(ses, st, item) {
    let manifest;
    try {
      manifest = readManifest(item.path);
    } catch (e) {
      throw new Error(`its manifest cannot be read (${e.message})`);
    }
    const worker = !!(manifest.background && typeof manifest.background.service_worker === 'string');
    let loadedPath = item.path;
    if (worker) {
      try {
        loadedPath = shimmed(ses, item.id, item.path, manifest);
      } catch (e) {
        say(item.id, 'runs without its stand-ins, the copy failed:', e.message);
        loadedPath = item.path;
      }
    }
    const x = await ses.extensions.loadExtension(loadedPath, { allowFileAccess: false });
    const { perms, hosts } = accessOf(manifest);
    const rec = {
      id: item.id,
      runtimeId: x.id,
      name: x.name,
      ses,
      src: item.path,
      stamp: stampOf(item.path),
      loadedPath,
      worker,
      relay: worker && loadedPath !== item.path,
      manifest,
      perms,
      hosts,
      /** Tabs it may read because you pressed its button there (activeTab). */
      grants: new Set(),
      /** The app's events it has listeners for, and for webRequest's what its listeners asked for and their filters. */
      listening: new Set(),
      webSpec: new Map(),
      webFilters: new Map(),
      /** Events waiting to go, and the deliveries in order. */
      queue: [],
      flushTimer: null,
      chain: Promise.resolve(true),
      badge: { text: '' },
      popup: null,
      panel: { path: (manifest.side_panel && manifest.side_panel.default_path) || '', enabled: true, onClick: false },
      lastRect: null,
      windows: new Map(),
      downloads: new Map(),
      notes: new Map(),
    };
    st.loaded.set(item.id, rec);
    st.byRuntime.set(x.id, rec);
    say('loaded', x.name, x.version);
    return rec;
  }

  function unload(ses, st, rec, gone) {
    try {
      ses.extensions.removeExtension(rec.runtimeId);
    } catch (e) {
      say('could not unload', rec.name, ':', e.message);
    }
    forget(st, rec);
    // The copy goes with an extension that is no longer listed (one that is loaded again is copied afresh).
    if (gone && rec.loadedPath !== rec.src) fs.rmSync(rec.loadedPath, { recursive: true, force: true });
  }

  /** Loads exactly these extensions into the session (unloading those it loaded that are no longer listed). */
  function sync(ses, list) {
    prepare(ses);
    const st = stateOf(ses);
    // One sync at a time: the server asks again after every change, and loading two ways at once would trip.
    const run = async () => {
      const want = new Map();
      for (const e of Array.isArray(list) ? list : []) if (e && typeof e.id === 'string' && typeof e.path === 'string') want.set(e.id, e);
      for (const rec of [...st.loaded.values()]) {
        const w = want.get(rec.id);
        let same = !!w && w.path === rec.src;
        if (same) {
          try {
            same = stampOf(rec.src) === rec.stamp;
          } catch {
            same = false;
          }
        }
        if (!same) unload(ses, st, rec, !w);
      }
      for (const item of want.values()) {
        if (st.loaded.has(item.id)) continue;
        try {
          await loadOne(ses, st, item);
        } catch (e) {
          say('could not load', item.id, item.path, ':', e && e.message ? e.message : e);
        }
      }
    };
    const next = st.chain.then(run, run);
    st.chain = next.catch(() => undefined);
    return next;
  }

  // ---- the toolbar popup (and the side panel, shown the same way) -----------------------------------------------------
  function closePopup() {
    const w = popupWin;
    if (popupOf) lastClosed = { id: popupOf, at: Date.now() };
    popupWin = null;
    popupOf = null;
    if (w && !w.isDestroyed()) w.destroy();
  }

  function popupPage(rec) {
    if (rec.popup !== null) return rec.popup;
    const m = rec.manifest;
    const a = m.action || m.browser_action || m.page_action;
    return (a && a.default_popup) || '';
  }
  const panelPage = (rec) => (rec.panel.enabled !== false && rec.panel.path) || '';

  // The popup's size is its content's: measured with the page as wide as its content wants (as Chrome does).
  const MEASURE = `(() => {
    const el = document.documentElement;
    const old = el.style.cssText;
    el.style.cssText += ';width:max-content;height:max-content;min-width:0;min-height:0';
    const r = el.getBoundingClientRect();
    const size = { w: Math.ceil(Math.max(r.width, document.body ? document.body.scrollWidth : 0)), h: Math.ceil(Math.max(r.height, document.body ? document.body.scrollHeight : 0)) };
    el.style.cssText = old;
    return size;
  })()`;

  /**
   * The extension's button was pressed (`rect`: the button's box in the page's CSS pixels). Its popup opens under it, or
   * the side panel when it asked for that, or else the extension hears the press with the tab you see. True when the
   * extension took it; false when it is not running here (not loaded, or its worker does not start).
   */
  async function popup(ses, extensionId, rect) {
    const st = stateOf(ses);
    const rec = st && (st.loaded.get(extensionId) || st.byRuntime.get(extensionId));
    if (!rec) return false;
    const main = mainWindow();
    if (!main || main.isDestroyed()) return false;
    if (rect && typeof rect === 'object') rec.lastRect = rect;
    // activeTab: pressing the button lets it read the tab you see.
    const tab = activeIn(ses);
    if (tab && rec.perms.has('activeTab')) rec.grants.add(tab.id);
    const page = popupPage(rec);
    if (page) return showPopup(rec, page, rect, false);
    if (rec.panel.onClick && panelPage(rec)) return showPopup(rec, panelPage(rec), rect, true);
    // No popup: the press is the extension's (after what it was told before it).
    closePopup();
    void flush(rec);
    const ok = await deliver(rec, { hydor: 'event', name: 'action.onClicked', args: [tab ? tabInfo(rec, tab) : { id: -1, index: -1, windowId: WINDOW_ID, active: true, highlighted: true, pinned: false, incognito: false }] });
    return ok;
  }

  async function showPopup(rec, page, rect, panel) {
    const main = mainWindow();
    if (!main || main.isDestroyed()) return false;
    // Pressing the button of a popup that is open closes it; the press blurs the popup first, which closes it, so a close a
    // moment ago counts as open.
    const toggle = popupOf === rec.runtimeId || (lastClosed.id === rec.runtimeId && Date.now() - lastClosed.at < 400);
    closePopup();
    if (toggle) return true;

    const zoom = main.webContents.getZoomFactor();
    const content = main.getContentBounds();
    // The button's box in the page's CSS pixels, as the preload passes it ({ x, y, w, h }; width and height taken too).
    // With none (an extension that opens its popup itself), the top right of the window.
    const r =
      rect && typeof rect === 'object'
        ? { x: Number(rect.x) || 0, y: Number(rect.y) || 0, width: Number(rect.width ?? rect.w) || 0, height: Number(rect.height ?? rect.h) || 0 }
        : { x: content.width / zoom - 48, y: 8, width: 32, height: 32 };
    const panelH = Math.max(PANEL.min, Math.min(PANEL.h, Math.round(content.height - (r.y + r.height) * zoom - 16)));
    const win = new BrowserWindow({
      parent: main,
      frame: false,
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      useContentSize: true,
      width: panel ? PANEL.w : POPUP_MAX.w,
      height: panel ? panelH : POPUP_MAX.h,
      backgroundColor: '#ffffff',
      webPreferences: { session: rec.ses, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    });
    popupWin = win;
    popupOf = rec.runtimeId;
    const wc = win.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      onTabUrl(url, rec);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      if (url.startsWith(`chrome-extension://${rec.runtimeId}/`)) return;
      e.preventDefault();
      onTabUrl(url, rec);
    });
    wc.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        e.preventDefault();
        if (popupWin === win) closePopup();
      }
    });
    win.on('blur', () => {
      if (popupWin === win) closePopup();
    });
    win.on('closed', () => {
      if (popupWin === win) {
        popupWin = null;
        popupOf = null;
      }
    });
    const hideWith = () => {
      if (popupWin === win) closePopup();
    };
    const events = ['hide', 'minimize', 'close', 'move', 'resize'];
    for (const ev of events) main.on(ev, hideWith);
    win.once('closed', () => {
      for (const ev of events) if (!main.isDestroyed()) main.off(ev, hideWith);
    });

    const place = (w, h) => {
      const x0 = Math.round(content.x + (r.x + r.width) * zoom - w);
      const y0 = Math.round(content.y + (r.y + r.height) * zoom + 4);
      const area = screen.getDisplayNearestPoint({ x: Math.round(content.x + r.x * zoom), y: Math.round(content.y + r.y * zoom) }).workArea;
      const x = Math.min(Math.max(x0, area.x), Math.max(area.x, area.x + area.width - w));
      const y = Math.min(Math.max(y0, area.y), Math.max(area.y, area.y + area.height - h));
      return { x, y };
    };
    let size = { w: 0, h: 0 };
    const fit = async () => {
      if (win.isDestroyed()) return;
      if (panel) {
        if (size.w) return;
        size = { w: PANEL.w, h: panelH };
        const p = place(size.w, size.h);
        win.setContentBounds({ x: p.x, y: p.y, width: size.w, height: size.h });
        return;
      }
      let m;
      try {
        m = await wc.executeJavaScript(MEASURE);
      } catch {
        return;
      }
      if (win.isDestroyed() || !m) return;
      const w = Math.min(POPUP_MAX.w, Math.max(POPUP_MIN, m.w));
      const h = Math.min(POPUP_MAX.h, Math.max(POPUP_MIN, m.h));
      if (w === size.w && h === size.h) return;
      size = { w, h };
      const p = place(w, h);
      win.setContentBounds({ x: p.x, y: p.y, width: w, height: h });
    };
    try {
      await win.loadURL(new URL(page, `chrome-extension://${rec.runtimeId}/`).href);
    } catch (e) {
      say('the popup of', rec.name, 'did not load:', e.message);
      if (popupWin === win) closePopup();
      return false;
    }
    if (win.isDestroyed()) return false;
    await fit();
    if (win.isDestroyed()) return false;
    win.show();
    win.focus();
    // Pages draw their content after they start (fetches, frameworks): fit again while the popup is open.
    if (!panel) {
      const timer = setInterval(() => (win.isDestroyed() ? clearInterval(timer) : fit()), 300);
      win.once('closed', () => clearInterval(timer));
    }
    return true;
  }

  return { prepare, sync, popup, closePopup, useTabs, tabAdded, tabRemoved, tabFront, claimDownload };
}

module.exports = { createExtensions, matchesPattern };
