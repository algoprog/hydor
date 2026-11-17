'use strict';
// The stand-ins for the chrome.* APIs that Electron 45 has no browser side for (desktop/extensions.cjs loads this).
//
// `standIns` runs in the main world of an extension's own page (Electron's frame preload, below) and in its service
// worker (extensions.cjs writes it into the worker's folder: Electron 45 runs no preload in an extension's worker).
// It must be one self-contained function: Electron serializes it, and nothing outside it exists where it runs. `send(op,
// data)` is its one way to the app: an IPC message from a page, a console line from a worker (the app reads those).
// Everything else is kept in the context that asked, and each API answers in both forms Chrome has, a callback or a
// promise.
function standIns(send, kind) {
  'use strict';
  const g = globalThis;
  const chrome = g.chrome;
  if (!chrome || !chrome.runtime || !chrome.runtime.id) return;
  const GUARD = Symbol.for('hydor.extension.standins');
  if (g[GUARD]) return;
  g[GUARD] = true;

  let manifest = {};
  try {
    manifest = chrome.runtime.getManifest() || {};
  } catch {
    // an extension without a readable manifest has nothing to ask for
  }
  const asked = new Set([...(manifest.permissions || []), ...(manifest.optional_permissions || [])].filter((p) => typeof p === 'string'));
  const baseUrl = chrome.runtime.getURL('/');
  const abs = (u) => {
    try {
      return new URL(String(u), baseUrl).href;
    } catch {
      return '';
    }
  };

  const cbOf = (a) => (a.length && typeof a[a.length - 1] === 'function' ? a[a.length - 1] : null);
  const reply = (a, value) => {
    const cb = cbOf(a);
    if (!cb) return Promise.resolve(value);
    Promise.resolve().then(() => cb(value));
    return undefined;
  };
  const method = (fn) =>
    function (...a) {
      return reply(a, fn(a[0], a));
    };
  let seq = 0;

  // Events: addListener and the rest, kept here; `fire` calls them.
  const listeners = new Map();
  const makeEvent = (key) => {
    const ls = [];
    listeners.set(key, ls);
    return {
      addListener(fn) {
        if (typeof fn === 'function' && !ls.includes(fn)) ls.push(fn);
      },
      removeListener(fn) {
        const i = ls.indexOf(fn);
        if (i >= 0) ls.splice(i, 1);
      },
      hasListener: (fn) => ls.includes(fn),
      hasListeners: () => ls.length > 0,
    };
  };
  const fire = (key, ...args) => {
    for (const fn of (listeners.get(key) || []).slice()) {
      try {
        fn(...args);
      } catch (e) {
        console.error(e);
      }
    }
  };
  const tabOf = (url) => ({
    id: 100000 + ++seq,
    index: 0,
    windowId: 1,
    active: true,
    highlighted: true,
    pinned: false,
    incognito: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    status: 'loading',
    url,
    pendingUrl: url,
    title: '',
  });

  // The app tells a worker or a page about a click on the toolbar button or on a notification.
  try {
    const channel = new BroadcastChannel('hydor-ext');
    channel.onmessage = (e) => {
      const m = e.data;
      if (!m || typeof m !== 'object') return;
      if (m.hydor === 'action-click') fire('action.onClicked', m.tab || tabOf(''));
      else if (m.hydor === 'notification-click') fire('notifications.onClicked', m.id);
    };
  } catch {
    // no BroadcastChannel here: clicks do not arrive
  }

  // ---- the toolbar button: chrome.action (MV3), browserAction and pageAction (MV2) -------------------------------
  const actionKey = manifest.action ? 'action' : manifest.browser_action ? 'browserAction' : manifest.page_action ? 'pageAction' : chrome.action ? 'action' : null;
  if (actionKey) {
    const spec = manifest.action || manifest.browser_action || manifest.page_action || {};
    const st = { text: '', textTab: {}, color: [0, 0, 0, 0], title: null, popup: null, enabled: true };
    const css = (c) => (Array.isArray(c) ? `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${(c[3] === undefined ? 255 : c[3]) / 255})` : String(c));
    const rgba = (c) => {
      if (Array.isArray(c)) return c;
      const m = /^#([0-9a-f]{3,8})$/i.exec(String(c));
      if (m && m[1].length >= 6) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(m[1].length === 8 ? [parseInt(m[1].slice(6, 8), 16)] : [255]);
      return [0, 0, 0, 255];
    };
    const action = {
      setBadgeText: method((d) => {
        const text = String((d && d.text) ?? '');
        if (d && d.tabId !== undefined) st.textTab[d.tabId] = text;
        else st.text = text;
        send('badge', { text, tabId: d && d.tabId });
      }),
      getBadgeText: method((d) => (d && d.tabId !== undefined && d.tabId in st.textTab ? st.textTab[d.tabId] : st.text)),
      setBadgeBackgroundColor: method((d) => {
        st.color = rgba(d && d.color);
        send('badge', { color: css(d && d.color) });
      }),
      getBadgeBackgroundColor: method(() => st.color),
      setBadgeTextColor: method(() => undefined),
      getBadgeTextColor: method(() => [255, 255, 255, 255]),
      setTitle: method((d) => {
        st.title = String((d && d.title) ?? '');
        send('badge', { title: st.title });
      }),
      getTitle: method(() => (st.title !== null ? st.title : spec.default_title || manifest.name || '')),
      setIcon: method(() => undefined),
      setPopup: method((d) => {
        st.popup = String((d && d.popup) ?? '');
        send('popup', { popup: st.popup });
      }),
      getPopup: method(() => (st.popup !== null ? st.popup : spec.default_popup || '')),
      enable: method(() => {
        st.enabled = true;
      }),
      disable: method(() => {
        st.enabled = false;
      }),
      isEnabled: method(() => st.enabled),
      openPopup: method(() => undefined),
      getUserSettings: method(() => ({ isOnToolbar: true })),
      show: method(() => undefined),
      hide: method(() => undefined),
      onClicked: makeEvent('action.onClicked'),
    };
    chrome[actionKey] = action;
  }

  // ---- tabs and windows: your own browsing has the tabs, the app answers for one window ---------------------------
  const openUrl = (u) => {
    const url = abs(u || 'about:blank');
    send('tab', { url });
    return url;
  };
  if (!chrome.tabs) chrome.tabs = {};
  if (!chrome.tabs.create) {
    chrome.tabs.create = method((p) => tabOf(openUrl(p && p.url)));
  }
  if (!chrome.tabs.getCurrent) chrome.tabs.getCurrent = method(() => undefined);

  if (!chrome.windows) {
    const win = () => ({ id: 1, focused: true, incognito: false, alwaysOnTop: false, state: 'normal', type: 'normal', top: 0, left: 0, width: 1280, height: 800 });
    chrome.windows = {
      WINDOW_ID_NONE: -1,
      WINDOW_ID_CURRENT: -2,
      getCurrent: method(win),
      getLastFocused: method(win),
      getAll: method(() => [win()]),
      get: method(win),
      create: method((p) => {
        const urls = p && p.url ? [].concat(p.url) : [];
        for (const u of urls) openUrl(u);
        return win();
      }),
      update: method(win),
      remove: method(() => undefined),
      onCreated: makeEvent('windows.onCreated'),
      onRemoved: makeEvent('windows.onRemoved'),
      onFocusChanged: makeEvent('windows.onFocusChanged'),
      onBoundsChanged: makeEvent('windows.onBoundsChanged'),
    };
  }

  if (manifest.options_ui || manifest.options_page) {
    const page = (manifest.options_ui && manifest.options_ui.page) || manifest.options_page;
    chrome.runtime.openOptionsPage = method(() => {
      openUrl(page);
    });
  }

  // ---- menus, notifications, alarms, commands --------------------------------------------------------------------
  if (!chrome.contextMenus && asked.has('contextMenus')) {
    // Accepted so extensions that make menus at start do not break; the app shows none, and onClicked never fires.
    chrome.contextMenus = {
      ACTION_MENU_TOP_LEVEL_LIMIT: 6,
      create(p, ...rest) {
        const cb = cbOf([p, ...rest]);
        if (cb) Promise.resolve().then(cb);
        return (p && p.id) ?? `menu${++seq}`;
      },
      update: method(() => undefined),
      remove: method(() => undefined),
      removeAll: method(() => undefined),
      onClicked: makeEvent('contextMenus.onClicked'),
    };
  }

  if (!chrome.notifications && asked.has('notifications')) {
    chrome.notifications = {
      create(...a) {
        const rest = a.filter((x) => typeof x !== 'function');
        const id = (typeof rest[0] === 'string' && rest.shift()) || `n${Date.now()}${++seq}`;
        const o = rest[0] || {};
        send('notify', { id, title: String(o.title ?? ''), message: String(o.message ?? ''), iconUrl: typeof o.iconUrl === 'string' ? o.iconUrl : '', silent: o.silent === true });
        return reply(a, id);
      },
      update: method(() => true),
      clear: method((id) => {
        send('notify-clear', { id: String(id) });
        return true;
      }),
      getAll: method(() => ({})),
      getPermissionLevel: method(() => 'granted'),
      onClicked: makeEvent('notifications.onClicked'),
      onClosed: makeEvent('notifications.onClosed'),
      onButtonClicked: makeEvent('notifications.onButtonClicked'),
      onShowSettings: makeEvent('notifications.onShowSettings'),
      onPermissionLevelChanged: makeEvent('notifications.onPermissionLevelChanged'),
    };
  }

  if (!chrome.alarms && asked.has('alarms')) {
    // Electron 45 has chrome.alarms itself; this is for a build that does not. Timers last as long as the worker does.
    const alarms = new Map();
    const arm = (a) => {
      const delay = Math.max(0, a.scheduledTime - Date.now());
      a.timer = setTimeout(() => {
        fire('alarms.onAlarm', { name: a.name, scheduledTime: a.scheduledTime, periodInMinutes: a.periodInMinutes });
        if (a.periodInMinutes) {
          a.scheduledTime = Date.now() + a.periodInMinutes * 60000;
          arm(a);
        } else alarms.delete(a.name);
      }, delay);
    };
    const info = (a) => ({ name: a.name, scheduledTime: a.scheduledTime, periodInMinutes: a.periodInMinutes });
    const stop = (name) => {
      const a = alarms.get(name);
      if (a) clearTimeout(a.timer);
      return alarms.delete(name);
    };
    chrome.alarms = {
      create(...a) {
        const rest = a.filter((x) => typeof x !== 'function');
        const name = typeof rest[0] === 'string' ? rest.shift() : '';
        const i = rest[0] || {};
        stop(name);
        const minutes = i.delayInMinutes ?? i.periodInMinutes ?? 0;
        const alarm = { name, scheduledTime: i.when ?? Date.now() + minutes * 60000, periodInMinutes: i.periodInMinutes };
        alarms.set(name, alarm);
        arm(alarm);
        return reply(a, undefined);
      },
      get: method((name) => {
        const a = alarms.get(name ?? '');
        return a ? info(a) : undefined;
      }),
      getAll: method(() => [...alarms.values()].map(info)),
      clear: method((name) => stop(name ?? '')),
      clearAll: method(() => {
        const any = alarms.size > 0;
        for (const name of [...alarms.keys()]) stop(name);
        return any;
      }),
      onAlarm: makeEvent('alarms.onAlarm'),
    };
  }

  if (!chrome.commands) {
    chrome.commands = { getAll: method(() => []), onCommand: makeEvent('commands.onCommand') };
  }

  // ---- chrome.extension: Electron 45 has getURL and the like, but not what asks whether the extension may run on file: pages
  if (chrome.extension) {
    if (!chrome.extension.isAllowedFileSchemeAccess) chrome.extension.isAllowedFileSchemeAccess = method(() => false);
    if (!chrome.extension.isAllowedIncognitoAccess) chrome.extension.isAllowedIncognitoAccess = method(() => false);
  }

  // ---- permissions: the app asks nobody, so the answer is yes ------------------------------------------------------
  if (chrome.permissions) {
    const isOrigin = (p) => /[/*]/.test(p);
    const listed = [...(manifest.permissions || []), ...(manifest.host_permissions || [])].filter((p) => typeof p === 'string');
    chrome.permissions.contains = method(() => true);
    chrome.permissions.request = method(() => true);
    chrome.permissions.remove = method(() => true);
    chrome.permissions.getAll = method(() => ({ permissions: listed.filter((p) => !isOrigin(p)), origins: listed.filter(isOrigin) }));
  }
}

let electron = null;
try {
  electron = require('electron');
} catch {
  // not in Electron: only standIns is wanted
}
// As Electron's frame preload (extensions.cjs registers it for chrome-extension: pages): the stand-ins go into the
// page's main world before the page's own scripts run. In the main process these are undefined, and nothing happens.
if (electron && electron.contextBridge && electron.ipcRenderer && typeof location !== 'undefined' && location.protocol === 'chrome-extension:') {
  const { contextBridge, ipcRenderer } = electron;
  const send = (op, data) => ipcRenderer.send('hydor:ext', String(op), data);
  try {
    contextBridge.executeInMainWorld({ func: standIns, args: [send, 'page'] });
  } catch {
    // An MV2 background page has no context isolation: this script already runs in the page's own world.
    try {
      standIns(send, 'page');
    } catch (e) {
      console.error('Hydor extension stand-ins:', e);
    }
  }
}

module.exports = { standIns };
