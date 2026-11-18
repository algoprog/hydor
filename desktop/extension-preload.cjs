'use strict';
// The stand-ins for the chrome.* APIs that Electron 45 has no browser side for (desktop/extensions.cjs loads this).
//
// `standIns` runs in the main world of an extension's own page (Electron's frame preload, below) and in its service
// worker (extensions.cjs writes it into the worker's folder: Electron 45 runs no preload in an extension's worker).
// It must be one self-contained function: Electron serializes it, and nothing outside it exists where it runs. `send(op,
// data)` is its one way to the app: an IPC message from a page, a console line from a worker (the app reads those). The
// app answers, and tells of events (a press on the toolbar button, a tab that changed), over a BroadcastChannel that every
// context of the extension hears; an answer carries the id of its question, so only the context that asked takes it.
// Each API answers in both forms Chrome has, a callback or a promise.
//
// Electron 45 gives an extension two objects with the native APIs, `chrome` and `browser` (Firefox's name, with copies of
// its own). An extension that uses `browser` (webextension-polyfill does when it is there) must meet the same stand-ins,
// so every one goes on both.
//
// What the app answers (extensions.cjs): your tabs in your own browsing (one window), opening, switching to and closing
// them, the toolbar button's popup, the side panel (shown as a popup), downloads, cookies and page loads (webNavigation).
// Electron 45 has offscreen documents, idle, alarms, scripting and runtime.getContexts itself.
function standIns(send, kind) {
  'use strict';
  const g = globalThis;
  const chrome = g.chrome;
  if (!chrome || !chrome.runtime || !chrome.runtime.id) return;
  const GUARD = Symbol.for('hydor.extension.standins');
  if (g[GUARD]) return;
  g[GUARD] = true;

  const roots = [chrome];
  try {
    if (g.browser && typeof g.browser === 'object' && g.browser !== chrome && g.browser.runtime) roots.push(g.browser);
  } catch {
    // no second object
  }
  /** A namespace made here: the same object on both. */
  const setNs = (ns, value) => {
    for (const r of roots)
      try {
        r[ns] = value;
      } catch {
        // a namespace that cannot be replaced keeps its own
      }
  };
  /** A member of a namespace: on each object's own copy of it (a namespace that is not there is made). */
  const setIn = (ns, key, value) => {
    for (const r of roots)
      try {
        if (!r[ns] || typeof r[ns] !== 'object') r[ns] = {};
        r[ns][key] = value;
      } catch {
        // a member that cannot be replaced keeps its own
      }
  };

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

  // ---- answers: a callback or a promise, and runtime.lastError while a callback runs -------------------------------
  const cbOf = (a) => (a.length && typeof a[a.length - 1] === 'function' ? a[a.length - 1] : null);
  const argsOf = (a) => (cbOf(a) ? a.slice(0, -1) : a);
  const withError = (err, fn) => {
    let old;
    let set = false;
    try {
      old = Object.getOwnPropertyDescriptor(chrome.runtime, 'lastError');
      Object.defineProperty(chrome.runtime, 'lastError', { value: { message: String((err && err.message) || err) }, configurable: true, enumerable: true });
      set = true;
    } catch {
      // the callback runs without it
    }
    try {
      fn();
    } finally {
      if (set)
        try {
          if (old) Object.defineProperty(chrome.runtime, 'lastError', old);
          else delete chrome.runtime.lastError;
        } catch {
          // left as it is
        }
    }
  };
  const settle = (a, p) => {
    const cb = cbOf(a);
    if (!cb) return p;
    p.then(
      (v) => cb(v),
      (err) => withError(err, () => cb()),
    );
    return undefined;
  };
  /** A method answered here. */
  const method = (fn) =>
    function (...a) {
      return settle(a, new Promise((resolve) => resolve(fn(...argsOf(a)))));
    };

  // ---- questions for the app ------------------------------------------------------------------------------------------
  const me = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  let seq = 0;
  const waiting = new Map();
  const ask = (op, data) =>
    new Promise((resolve, reject) => {
      const id = `${me}.${++seq}`;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`The browser did not answer ${op}`));
      }, 20000);
      waiting.set(id, { resolve, reject, timer });
      send('ask', { id, op, data: data === undefined ? null : data });
    });
  /** A method the app answers; `shape` makes what it is sent of the arguments (without the callback). */
  const asking = (op, shape) =>
    function (...a) {
      const args = argsOf(a);
      return settle(a, ask(op, shape ? shape(...args) : args));
    };

  // ---- events: kept here; the app's (tabs, page loads, the button, notifications) are fired when it tells of them ----
  const listeners = new Map();
  const told = new Set();
  const makeEvent = (key, fromApp = false) => {
    const ls = [];
    listeners.set(key, ls);
    return {
      addListener(fn, filter) {
        if (typeof fn !== 'function' || ls.some((l) => l.fn === fn)) return;
        ls.push({ fn, filter });
        // The app tells an extension only of the events it listens to.
        if (fromApp && !told.has(key)) {
          told.add(key);
          send('listen', { event: key });
        }
      },
      removeListener(fn) {
        const i = ls.findIndex((l) => l.fn === fn);
        if (i >= 0) ls.splice(i, 1);
      },
      hasListener: (fn) => ls.some((l) => l.fn === fn),
      hasListeners: () => ls.length > 0,
    };
  };
  // A page-load event's filter ({ url: [UrlFilter] }), as Chrome applies it.
  const urlPasses = (f, url) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return false;
    }
    const host = u.hostname;
    const p = u.pathname;
    const q = u.search.replace(/^\?/, '');
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : u.protocol === 'http:' ? 80 : 0);
    const re = (v, s) => {
      try {
        return new RegExp(v).test(s);
      } catch {
        return false;
      }
    };
    const tests = {
      hostContains: (v) => `.${host}`.includes(v),
      hostEquals: (v) => host === v,
      hostPrefix: (v) => host.startsWith(v),
      hostSuffix: (v) => host.endsWith(v),
      pathContains: (v) => p.includes(v),
      pathEquals: (v) => p === v,
      pathPrefix: (v) => p.startsWith(v),
      pathSuffix: (v) => p.endsWith(v),
      queryContains: (v) => q.includes(v),
      queryEquals: (v) => q === v,
      queryPrefix: (v) => q.startsWith(v),
      querySuffix: (v) => q.endsWith(v),
      urlContains: (v) => url.includes(v),
      urlEquals: (v) => url === v,
      urlPrefix: (v) => url.startsWith(v),
      urlSuffix: (v) => url.endsWith(v),
      urlMatches: (v) => re(v, url),
      originAndPathMatches: (v) => re(v, u.origin + p),
    };
    for (const [k, test] of Object.entries(tests)) if (f[k] !== undefined && !test(String(f[k]))) return false;
    if (Array.isArray(f.schemes) && !f.schemes.includes(u.protocol.slice(0, -1))) return false;
    if (Array.isArray(f.ports) && !f.ports.some((x) => (Array.isArray(x) ? port >= x[0] && port <= x[1] : port === x))) return false;
    return true;
  };
  // A match pattern (`<all_urls>`, `*://*.example.com/*`), as Chrome reads them.
  const patternMatches = (pattern, url) => {
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
    const h = u.hostname.toLowerCase();
    if (scheme !== 'file' && host !== '*' && !(host.startsWith('*.') ? h === host.slice(2) || h.endsWith(host.slice(1)) : h === host)) return false;
    const glob = (m[3] || '/*')
      .split('*')
      .map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${glob}$`).test(u.pathname + u.search);
  };
  // A webRequest listener's filter ({ urls, types, tabId, windowId }).
  const requestPasses = (f, d) =>
    (!Array.isArray(f.urls) || f.urls.some((p) => patternMatches(p, d.url))) &&
    (!Array.isArray(f.types) || f.types.includes(d.type)) &&
    (typeof f.tabId !== 'number' || f.tabId === d.tabId) &&
    (typeof f.windowId !== 'number' || f.windowId === d.windowId);
  const passes = (filter, first) => {
    if (!filter || !first || typeof first !== 'object') return true;
    if (filter.request) return requestPasses(filter.request, first);
    return !(Array.isArray(filter.url) && typeof first.url === 'string') || filter.url.some((f) => f && urlPasses(f, first.url));
  };
  const fire = (key, ...args) => {
    for (const l of (listeners.get(key) || []).slice()) {
      if (!passes(l.filter, args[0])) continue;
      try {
        l.fn(...args);
      } catch (e) {
        console.error(e);
      }
    }
  };
  const events = (ns, names, fromApp = []) => {
    const o = {};
    for (const n of names) o[n] = makeEvent(`${ns}.${n}`, fromApp === true || fromApp.includes(n));
    return o;
  };

  try {
    const channel = new BroadcastChannel('hydor-ext');
    channel.onmessage = (e) => {
      const m = e.data;
      if (!m || typeof m !== 'object') return;
      if (m.hydor === 'answer') {
        const w = waiting.get(m.id);
        if (!w) return;
        waiting.delete(m.id);
        clearTimeout(w.timer);
        if (m.ok) w.resolve(m.value);
        else w.reject(new Error(String(m.error || 'It did not work')));
      } else if (m.hydor === 'event' && typeof m.name === 'string') {
        fire(m.name, ...(Array.isArray(m.args) ? m.args : []));
      } else if (m.hydor === 'events' && Array.isArray(m.list)) {
        for (const x of m.list) if (Array.isArray(x) && typeof x[0] === 'string') fire(x[0], ...(Array.isArray(x[1]) ? x[1] : []));
      }
    };
  } catch {
    // no BroadcastChannel here: no answers and no events arrive
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
      getPopup: method(() => (st.popup !== null ? st.popup : spec.default_popup ? abs(spec.default_popup) : '')),
      enable: method(() => {
        st.enabled = true;
      }),
      disable: method(() => {
        st.enabled = false;
      }),
      isEnabled: method(() => st.enabled),
      openPopup: asking('action.openPopup', () => null),
      getUserSettings: method(() => ({ isOnToolbar: true })),
      show: method(() => undefined),
      hide: method(() => undefined),
      onClicked: makeEvent('action.onClicked', true),
      onUserSettingsChanged: makeEvent('action.onUserSettingsChanged'),
    };
    setNs(actionKey, action);
  }

  // ---- your tabs: the app has them (one window, id 1) ---------------------------------------------------------------
  const idAndProps = (a, b) => (typeof a === 'number' ? { tabId: a, props: b || {} } : { tabId: null, props: a || {} });
  const withUrl = (o) => (o && o.url !== undefined ? { ...o, url: abs(o.url) } : o || {});
  const tabs = {
    TAB_ID_NONE: -1,
    TAB_INDEX_NONE: -1,
    MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND: 2,
    query: asking('tabs.query', (q) => q || {}),
    get: asking('tabs.get', (id) => id),
    getCurrent: asking('tabs.getCurrent', () => null),
    create: asking('tabs.create', (p) => withUrl(p)),
    update: asking('tabs.update', (a, b) => {
      const x = idAndProps(a, b);
      return { tabId: x.tabId, props: withUrl(x.props) };
    }),
    remove: asking('tabs.remove', (ids) => [].concat(ids)),
    reload: asking('tabs.reload', idAndProps),
    duplicate: asking('tabs.duplicate', (id) => id),
    goBack: asking('tabs.goBack', (id) => (typeof id === 'number' ? id : null)),
    goForward: asking('tabs.goForward', (id) => (typeof id === 'number' ? id : null)),
    captureVisibleTab: asking('tabs.captureVisibleTab', (a, b) => (a && typeof a === 'object' ? { options: a } : { windowId: a ?? null, options: b || {} })),
    highlight: asking('tabs.highlight', (info) => info || {}),
    move: asking('tabs.move', (ids, props) => ({ ids: [].concat(ids), props: props || {} })),
    discard: asking('tabs.discard', (id) => (typeof id === 'number' ? id : null)),
    detectLanguage: method(() => 'und'),
    getSelected: function (...a) {
      return settle(
        a,
        ask('tabs.query', { active: true }).then((l) => l[0]),
      );
    },
    getAllInWindow: function (...a) {
      return settle(a, ask('tabs.query', {}));
    },
    ...events('tabs', ['onActivated', 'onUpdated', 'onCreated', 'onRemoved', 'onHighlighted', 'onReplaced', 'onMoved', 'onAttached', 'onDetached', 'onZoomChange', 'onActiveChanged', 'onSelectionChanged', 'onHighlightChanged'], ['onActivated', 'onUpdated', 'onCreated', 'onRemoved', 'onHighlighted']),
  };
  // MV2's script and style injection with no tab id: the tab you see (Electron's own idea of it is the focused page).
  for (const name of ['executeScript', 'insertCSS', 'removeCSS']) {
    const own = chrome.tabs && chrome.tabs[name];
    if (typeof own !== 'function') continue;
    const nativeTabs = chrome.tabs;
    tabs[name] = function (...a) {
      if (typeof a[0] === 'number') return own.apply(nativeTabs, a);
      const cb = cbOf(a);
      ask('tabs.query', { active: true }).then(
        (l) => own.call(nativeTabs, l && l[0] ? l[0].id : undefined, ...argsOf(a), ...(cb ? [cb] : [])),
        (err) => cb && withError(err, () => cb()),
      );
      return undefined;
    };
  }
  for (const [k, v] of Object.entries(tabs)) setIn('tabs', k, v);

  const windows = {
    WINDOW_ID_NONE: -1,
    WINDOW_ID_CURRENT: -2,
    CreateType: { NORMAL: 'normal', POPUP: 'popup', PANEL: 'panel' },
    WindowType: { NORMAL: 'normal', POPUP: 'popup', PANEL: 'panel', APP: 'app', DEVTOOLS: 'devtools' },
    WindowState: { NORMAL: 'normal', MINIMIZED: 'minimized', MAXIMIZED: 'maximized', FULLSCREEN: 'fullscreen', LOCKED_FULLSCREEN: 'locked-fullscreen' },
    get: asking('windows.get', (id, info) => ({ windowId: id, info: info || {} })),
    getCurrent: asking('windows.get', (info) => ({ windowId: -2, info: info || {} })),
    getLastFocused: asking('windows.get', (info) => ({ windowId: -2, info: info || {} })),
    getAll: asking('windows.getAll', (info) => info || {}),
    create: asking('windows.create', (p) => {
      const d = { ...(p || {}) };
      if (d.url !== undefined) d.url = [].concat(d.url).map(abs);
      return d;
    }),
    update: asking('windows.update', (id, info) => ({ windowId: id, info: info || {} })),
    remove: asking('windows.remove', (id) => id),
    ...events('windows', ['onCreated', 'onRemoved', 'onFocusChanged', 'onBoundsChanged'], ['onCreated', 'onRemoved', 'onFocusChanged']),
  };
  if (!chrome.windows) setNs('windows', windows);
  else for (const [k, v] of Object.entries(windows)) setIn('windows', k, v);

  // ---- runtime: the options page as a tab, the contexts the app made, what Electron leaves out ---------------------
  const optionsPage = (manifest.options_ui && manifest.options_ui.page) || manifest.options_page;
  if (optionsPage) setIn('runtime', 'openOptionsPage', asking('tabs.create', () => ({ url: abs(optionsPage), active: true })));
  if (!chrome.runtime.setUninstallURL) setIn('runtime', 'setUninstallURL', method(() => undefined));
  if (!chrome.runtime.requestUpdateCheck) setIn('runtime', 'requestUpdateCheck', method(() => ({ status: 'no_update' })));
  if (!chrome.runtime.getPlatformInfo) setIn('runtime', 'getPlatformInfo', asking('runtime.getPlatformInfo', () => null));

  // ---- menus, notifications, alarms, commands --------------------------------------------------------------------
  if (!chrome.contextMenus && asked.has('contextMenus')) {
    // Accepted so extensions that make menus at start do not break; the app shows none, and onClicked never fires.
    setNs('contextMenus', {
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
    });
  }

  if (!chrome.notifications && asked.has('notifications')) {
    setNs('notifications', {
      create(...a) {
        const rest = a.filter((x) => typeof x !== 'function');
        const id = (typeof rest[0] === 'string' && rest.shift()) || `n${Date.now()}${++seq}`;
        const o = rest[0] || {};
        send('notify', { id, title: String(o.title ?? ''), message: String(o.message ?? ''), iconUrl: typeof o.iconUrl === 'string' ? o.iconUrl : '', silent: o.silent === true });
        return settle(a, Promise.resolve(id));
      },
      update: method(() => true),
      clear: method((id) => {
        send('notify-clear', { id: String(id) });
        return true;
      }),
      getAll: method(() => ({})),
      getPermissionLevel: method(() => 'granted'),
      ...events('notifications', ['onClicked', 'onClosed', 'onButtonClicked', 'onShowSettings', 'onPermissionLevelChanged'], ['onClicked']),
    });
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
    setNs('alarms', {
      create(...a) {
        const rest = a.filter((x) => typeof x !== 'function');
        const name = typeof rest[0] === 'string' ? rest.shift() : '';
        const i = rest[0] || {};
        stop(name);
        const minutes = i.delayInMinutes ?? i.periodInMinutes ?? 0;
        const alarm = { name, scheduledTime: i.when ?? Date.now() + minutes * 60000, periodInMinutes: i.periodInMinutes };
        alarms.set(name, alarm);
        arm(alarm);
        return settle(a, Promise.resolve(undefined));
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
    });
  }

  if (!chrome.commands) setNs('commands', { getAll: method(() => []), onCommand: makeEvent('commands.onCommand') });

  // ---- webRequest: Electron's own, and the app's while the ad blocker has the session's requests (the two never both)
  if (chrome.webRequest) {
    for (const n of ['onBeforeRequest', 'onBeforeSendHeaders', 'onSendHeaders', 'onHeadersReceived', 'onResponseStarted', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred']) {
      const key = `webRequest.${n}`;
      const own = chrome.webRequest[n];
      const ours = makeEvent(key);
      setIn('webRequest', n, {
        addListener(fn, filter, spec) {
          if (typeof fn !== 'function' || ours.hasListener(fn)) return;
          try {
            if (own) own.addListener(fn, filter, spec);
          } catch (e) {
            console.error(e);
          }
          const f = filter && typeof filter === 'object' ? filter : {};
          ours.addListener(fn, { request: f });
          send('listen', { event: key, spec: Array.isArray(spec) ? spec.filter((x) => typeof x === 'string') : [], filter: { urls: f.urls, types: f.types, tabId: f.tabId } });
        },
        removeListener(fn) {
          try {
            if (own) own.removeListener(fn);
          } catch {}
          ours.removeListener(fn);
        },
        hasListener: (fn) => ours.hasListener(fn),
        hasListeners: () => ours.hasListeners(),
      });
    }
  }

  // ---- what the app does for parts Electron does not have: only for an extension that asks for them ------------------
  const missing = (ns, permission = ns) => !chrome[ns] && asked.has(permission);

  if (missing('webNavigation')) {
    setNs('webNavigation', {
      getFrame: asking('webNavigation.getFrame', (d) => d || {}),
      getAllFrames: asking('webNavigation.getAllFrames', (d) => d || {}),
      ...events(
        'webNavigation',
        ['onBeforeNavigate', 'onCommitted', 'onDOMContentLoaded', 'onCompleted', 'onErrorOccurred', 'onCreatedNavigationTarget', 'onReferenceFragmentUpdated', 'onTabReplaced', 'onHistoryStateUpdated'],
        ['onBeforeNavigate', 'onCommitted', 'onDOMContentLoaded', 'onCompleted', 'onErrorOccurred', 'onReferenceFragmentUpdated', 'onHistoryStateUpdated'],
      ),
    });
  }

  if (missing('downloads')) {
    setNs('downloads', {
      download: asking('downloads.download', (o) => withUrl(o)),
      search: asking('downloads.search', (q) => q || {}),
      pause: asking('downloads.pause', (id) => id),
      resume: asking('downloads.resume', (id) => id),
      cancel: asking('downloads.cancel', (id) => id),
      open: asking('downloads.open', (id) => id),
      show: asking('downloads.show', (id) => id),
      showDefaultFolder: asking('downloads.showDefaultFolder', () => null),
      erase: asking('downloads.erase', (q) => q || {}),
      removeFile: asking('downloads.removeFile', (id) => id),
      acceptDanger: method(() => undefined),
      setShelfEnabled: method(() => undefined),
      setUiOptions: method(() => undefined),
      getFileIcon: method(() => {
        throw new Error('No icon here');
      }),
      ...events('downloads', ['onCreated', 'onChanged', 'onErased', 'onDeterminingFilename'], ['onCreated', 'onChanged', 'onErased']),
    });
  }

  if (missing('sidePanel')) {
    // The app shows the side panel's page the way it shows a popup, under the extension's button.
    const panel = { path: (manifest.side_panel && manifest.side_panel.default_path) || '', enabled: true, onClick: false };
    setNs('sidePanel', {
      setOptions: method((o) => {
        if (o && typeof o.path === 'string') panel.path = o.path;
        if (o && typeof o.enabled === 'boolean') panel.enabled = o.enabled;
        send('sidePanel', { path: panel.path ? abs(panel.path) : '', enabled: panel.enabled });
      }),
      getOptions: method(() => ({ path: panel.path, enabled: panel.enabled })),
      setPanelBehavior: method((b) => {
        if (b && typeof b.openPanelOnActionClick === 'boolean') panel.onClick = b.openPanelOnActionClick;
        send('sidePanel', { onClick: panel.onClick });
      }),
      getPanelBehavior: method(() => ({ openPanelOnActionClick: panel.onClick })),
      open: asking('sidePanel.open', (o) => ({ path: panel.path ? abs(panel.path) : '', ...(o || {}) })),
      getLayout: method(() => ({ side: 'right' })),
      onOpened: makeEvent('sidePanel.onOpened'),
    });
  }

  if (missing('cookies')) {
    setNs('cookies', {
      get: asking('cookies.get', (d) => d || {}),
      getAll: asking('cookies.getAll', (d) => d || {}),
      set: asking('cookies.set', (d) => d || {}),
      remove: asking('cookies.remove', (d) => d || {}),
      getAllCookieStores: asking('cookies.getAllCookieStores', () => null),
      getPartitionKey: method(() => ({})),
      onChanged: makeEvent('cookies.onChanged', true),
    });
  }

  // The rest an extension may ask for and Electron does not have: there so that using them does not stop the extension
  // (its events never fire, a question gets an empty answer).
  for (const ns of ['history', 'bookmarks', 'topSites', 'sessions', 'tabGroups', 'browsingData', 'tts', 'ttsEngine', 'fontSettings', 'search', 'readingList', 'pageCapture', 'tabCapture', 'desktopCapture', 'gcm', 'power', 'printing', 'declarativeContent']) {
    if (!missing(ns)) continue;
    const made = {};
    setNs(
      ns,
      new Proxy(made, {
        get(t, k) {
          if (k in t || typeof k !== 'string') return t[k];
          if (/^on[A-Z]/.test(k)) return (t[k] = makeEvent(`${ns}.${k}`));
          if (/^[A-Z][A-Z_]*$/.test(k) || k === 'then') return undefined;
          return (t[k] = method(() => (/^(get|search|query)/.test(k) ? [] : undefined)));
        },
      }),
    );
  }

  // ---- chrome.extension: Electron 45 has getURL and the like, but not what asks whether the extension may run on file: pages
  if (chrome.extension) {
    if (!chrome.extension.isAllowedFileSchemeAccess) setIn('extension', 'isAllowedFileSchemeAccess', method(() => false));
    if (!chrome.extension.isAllowedIncognitoAccess) setIn('extension', 'isAllowedIncognitoAccess', method(() => false));
  }

  // ---- permissions: the app asks nobody, so the answer is yes ------------------------------------------------------
  if (chrome.permissions) {
    const isOrigin = (p) => /[/*]/.test(p);
    const listed = [...(manifest.permissions || []), ...(manifest.host_permissions || [])].filter((p) => typeof p === 'string');
    setIn('permissions', 'contains', method(() => true));
    setIn('permissions', 'request', method(() => true));
    setIn('permissions', 'remove', method(() => true));
    setIn('permissions', 'getAll', method(() => ({ permissions: listed.filter((p) => !isOrigin(p)), origins: listed.filter(isOrigin) })));
  }
  void kind;
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
