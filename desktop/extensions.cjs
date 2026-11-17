'use strict';
// Chrome extensions in the desktop app's own browser: loads the ones the server lists into a persistent session, adds
// the chrome.* parts Electron 45 has no browser side for (badges, tabs.create, windows, menus, notifications…), and
// opens an extension's toolbar popup. main.cjs and browser.cjs call it as
//   const ext = createExtensions({ log, mainWindow: () => win, openTab, badge });
//   ext.prepare(ses); await ext.sync(ses, [{ id, path }]); await ext.popup(ses, id, rect);
//
// What Electron 45 does and does not do (measured, 45.2.1):
// - Extension pages (popups, options, MV2 background pages) run a session's frame preloads, so extension-preload.cjs
//   puts the stand-ins into their main world.
// - An extension's service worker runs NO preload (session.registerPreloadScript 'service-worker' works for ordinary
//   workers only). So for an extension with a worker, the extension is loaded from a copy (in the app's data folder)
//   whose worker is a small loader: it first runs the same stand-ins, then the extension's own worker script. The
//   worker has no ipcRenderer, so it writes to its console and `serviceWorkers` 'console-message' brings the lines here.
// - chrome.action, chrome.alarms, chrome.permissions, chrome.storage, chrome.runtime exist, but nothing in the app hears
//   the action's badge, so the stand-in replaces action (and answers permissions with yes).
const { app, BrowserWindow, Notification, ipcMain, nativeImage, screen, webContents } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { standIns } = require('./extension-preload.cjs');

const PREFIX = 'hydor-ext:';
const STANDINS_FILE = 'hydor-ext-standins.js';
const LOADER_FILE = 'hydor-ext-worker.js';
const RELAY_FILE = 'hydor-ext-relay.html';
const SKIP_COPY = new Set(['.git', 'node_modules', '_metadata']);
const POPUP_MIN = 25;
const POPUP_MAX = { w: 800, h: 600 };
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

function createExtensions({ log, mainWindow, openTab, badge }) {
  const say = (...a) => {
    try {
      log(a.join(' '));
    } catch {
      // logging must never break the browser
    }
  };
  const sessions = new Map(); // Session -> { loaded: Map<registry id, record>, byRuntime: Map<runtime id, record>, chain, relays, popup? }
  let popupWin = null;
  let popupOf = null; // the runtime id whose popup is open
  let lastClosed = { id: '', at: 0 };
  let ipcListening = false;

  const stateOf = (ses) => sessions.get(ses) || null;

  // ---- what the extensions send us ---------------------------------------------------------------------------------
  function onTabUrl(url, rec) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return;
    }
    // Only pages a browser would open for a person: web pages, blank, and the extension's own pages.
    const ok = u.protocol === 'http:' || u.protocol === 'https:' || url === 'about:blank' || (u.protocol === 'chrome-extension:' && u.host === rec.runtimeId);
    if (ok) openTab(u.href === 'about:blank/' ? 'about:blank' : url);
  }

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

  function onMessage(ses, rec, op, data) {
    if (!data || typeof data !== 'object') data = {};
    if (op === 'badge') {
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
    } else if (op === 'tab') {
      onTabUrl(String(data.url || ''), rec);
    } else if (op === 'notify') {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title: String(data.title || rec.name).slice(0, 200), body: String(data.message || '').slice(0, 1000), silent: data.silent === true, icon: iconFor(rec, data.iconUrl) });
      const id = String(data.id || '');
      rec.notes.set(id, n);
      n.on('click', () => deliver(ses, rec, { hydor: 'notification-click', id }));
      n.on('close', () => rec.notes.delete(id));
      n.show();
    } else if (op === 'notify-clear') {
      const n = rec.notes.get(String(data.id || ''));
      if (n) n.close();
    }
  }

  /** Tell an extension's contexts something (a click): from a page of its origin, over a BroadcastChannel they all hear. */
  async function deliver(ses, rec, message) {
    try {
      if (rec.worker) await ses.serviceWorkers.startWorkerForScope(`chrome-extension://${rec.runtimeId}/`).catch(() => undefined);
      const prefix = `chrome-extension://${rec.runtimeId}/`;
      let wc = webContents.getAllWebContents().find((w) => !w.isDestroyed() && w.session === ses && w.getURL().startsWith(prefix));
      if (!wc && rec.relay) {
        const st = stateOf(ses);
        let win = st.relays.get(rec.runtimeId);
        if (!win || win.isDestroyed()) {
          win = new BrowserWindow({ show: false, width: 100, height: 100, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
          st.relays.set(rec.runtimeId, win);
          await win.loadURL(prefix + RELAY_FILE);
        }
        wc = win.webContents;
      }
      if (!wc) return;
      await wc.executeJavaScript(`(() => { const c = new BroadcastChannel('hydor-ext'); c.postMessage(${JSON.stringify(message)}); setTimeout(() => c.close(), 200); })()`);
    } catch (e) {
      say('could not reach', rec.name, ':', e.message);
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
        if (rec) onMessage(e.sender.session, rec, String(op), data);
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
    // The lines the stand-ins in an extension's worker write to its console are its messages to the app.
    ses.serviceWorkers.on('console-message', (_e, d) => {
      if (typeof d.message !== 'string' || !d.message.startsWith(PREFIX)) return;
      try {
        const scope = ses.serviceWorkers.getInfoFromVersionID(d.versionId).scope;
        if (!scope.startsWith('chrome-extension://')) return;
        const rec = recordOfHost(ses, new URL(scope).host);
        const [op, data] = JSON.parse(d.message.slice(PREFIX.length));
        if (rec) onMessage(ses, rec, String(op), data);
      } catch (err) {
        say('message from an extension worker failed:', err.message);
      }
    });
    ses.extensions.on('extension-unloaded', (_e, x) => {
      const rec = st.byRuntime.get(x.id);
      if (rec) forget(st, rec);
    });
  }

  function forget(st, rec) {
    st.byRuntime.delete(rec.runtimeId);
    if (st.loaded.get(rec.id) === rec) st.loaded.delete(rec.id);
    const relay = st.relays.get(rec.runtimeId);
    if (relay && !relay.isDestroyed()) relay.destroy();
    st.relays.delete(rec.runtimeId);
    for (const n of rec.notes.values()) n.close();
    if (popupOf === rec.runtimeId) closePopup();
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
    const rec = {
      id: item.id,
      runtimeId: x.id,
      name: x.name,
      src: item.path,
      stamp: stampOf(item.path),
      loadedPath,
      worker,
      relay: worker && loadedPath !== item.path,
      manifest,
      badge: { text: '' },
      popup: null,
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

  // ---- the toolbar popup -----------------------------------------------------------------------------------------------
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

  async function popup(ses, extensionId, rect, tab) {
    const st = stateOf(ses);
    const rec = st && (st.loaded.get(extensionId) || st.byRuntime.get(extensionId));
    if (!rec) return false;
    const main = mainWindow();
    if (!main || main.isDestroyed()) return false;
    const page = popupPage(rec);
    if (!page) {
      // No popup: the button is a click for the extension.
      closePopup();
      await deliver(ses, rec, { hydor: 'action-click', tab: tab || undefined });
      return true;
    }
    // Pressing the button of a popup that is open closes it; the press blurs the popup first, which closes it, so a close a
    // moment ago counts as open.
    const toggle = popupOf === rec.runtimeId || (lastClosed.id === rec.runtimeId && Date.now() - lastClosed.at < 400);
    closePopup();
    if (toggle) return true;

    const zoom = main.webContents.getZoomFactor();
    const content = main.getContentBounds();
    // The button's box in the page's CSS pixels, as the preload passes it ({ x, y, w, h }; width and height taken too).
    const r =
      rect && typeof rect === 'object'
        ? { x: Number(rect.x) || 0, y: Number(rect.y) || 0, width: Number(rect.width ?? rect.w) || 0, height: Number(rect.height ?? rect.h) || 0 }
        : { x: 0, y: 0, width: 0, height: 0 };
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
      width: POPUP_MAX.w,
      height: POPUP_MAX.h,
      backgroundColor: '#ffffff',
      webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
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
    const timer = setInterval(() => (win.isDestroyed() ? clearInterval(timer) : fit()), 300);
    win.once('closed', () => clearInterval(timer));
    return true;
  }

  return { prepare, sync, popup, closePopup };
}

module.exports = { createExtensions };
