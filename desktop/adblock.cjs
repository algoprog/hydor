// The ad and tracker blocker of your own browsing: Ghostery's engine (@ghostery/adblocker-electron, which ships with the
// server's packages) on the session of the browsing profile. It blocks requests in the session's webRequest (a page's ads,
// trackers and their scripts) and hides what is left of them with the cosmetic filters its frame preload injects.
//
// How it hooks in:
//   - The engine is the prebuilt ads-and-tracking one (EasyList, EasyPrivacy, uBlock's and Peter Lowe's lists, as Ghostery
//     builds them), made once and kept as a file in the app's data folder; a file older than 7 days is made again from the
//     lists (checked when the browser starts and once a day), and when that fails (no network) the old file is kept and
//     used. The engine loads the first time the browsing browser starts, so someone who never opens it downloads nothing.
//   - `enableBlockingInSession` puts the engine's handlers on the session: webRequest.onBeforeRequest and onHeadersReceived,
//     and a frame preload with two ipcMain handlers for the cosmetic filters. The engine's own handlers are arrow functions
//     the session calls through the engine at the time of a request, so this module replaces them on the engine object with
//     ones that first leave out the sites you allowed ads on, and count what was blocked.
//   - Electron has one webRequest handler for each event and session, and Electron's own handlers go before an extension's
//     chrome.webRequest: with this blocker on, an extension that blocks requests (an ad blocker of your own) may not run.
//     Turning the setting off takes ours off (the session's handlers are removed) and the extension has the session again.
//   - allowAds: the sites you allowed ads on (a site includes its subdomains). The page's host decides, not the request's:
//     its requests are never blocked and no cosmetic filter runs on it. The engine gets `@@||host^$document` exceptions for
//     them as well (which it honours for its cosmetic and scriptlet rules; its network matching ignores a $document
//     exception for the requests of that page, which is why the host check above is the one that counts).
//   - The count of what a tab had blocked since its last main-frame navigation is in browser.cjs (`onBlocked` gets the id
//     of the page's webContents).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** A file of the engine older than this is made again. */
const STALE_MS = 7 * 24 * 3600 * 1000;
/** How often a running app looks at it, and how long it waits to try again after a failed download. */
const CHECK_MS = 24 * 3600 * 1000;
const RETRY_MS = 3600 * 1000;
const FETCH_MS = 60_000;
const FILE = 'engine-ads-and-tracking.bin';

/** A site as the setting keeps it: a host in lower case, without a leading dot. Anything else is not a site. */
const siteOf = (s) => {
  const h = String(s || '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '');
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h) && h.length <= 253 ? h : '';
};
const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
};

/**
 * @param {object} o
 * @param {(...what: any[]) => void} o.log
 * @param {string} o.dir                          where the engine's file is kept (made when needed)
 * @param {() => string} o.modulePath             the folder of @ghostery/adblocker-electron (the server's packages)
 * @param {(webContentsId: number) => void} o.onBlocked   a request of this page was blocked
 * @param {object} [o.engine]                     a ready engine in place of the prebuilt one (for tests)
 */
function createAdblock({ log, dir, modulePath, onBlocked, engine: given = null }) {
  let lib = null;
  let failed = false;
  /** The engine in use, and the sites it has exceptions for. */
  let engine = null;
  let excepted = new Set();
  let prefs = { adblock: true, allowAds: [] };
  /** Whether the server has said yet (its first word comes as your browser starts): nothing is downloaded before it. */
  let told = false;
  /** The sessions this blocks in when it is on, and the engine each has now. */
  const attached = new Set();
  const enabled = new Map();
  let loading = null;
  let timer = null;

  function library() {
    if (lib || failed) return lib;
    try {
      lib = require(modulePath());
    } catch (e) {
      failed = true;
      log('the ad blocker is not here', String((e && e.message) || e));
    }
    return lib;
  }

  const allowed = (host) => !!host && prefs.allowAds.some((s) => host === s || host.endsWith('.' + s));

  /** The site a request or a frame belongs to: its page's address, not the request's own. */
  function pageHost(details) {
    try {
      const top = details.frame && details.frame.top && details.frame.top.url;
      if (top) return hostOf(top);
    } catch {}
    try {
      if (details.webContents && !details.webContents.isDestroyed()) return hostOf(details.webContents.getURL());
    } catch {}
    return hostOf(details.referrer);
  }

  /** The engine's own handlers, wrapped: sites you allowed are left alone, and what is blocked is counted. */
  function patch(e) {
    if (e.hydorPatched) return;
    e.hydorPatched = true;
    const { onBeforeRequest, onHeadersReceived, onInjectCosmeticFilters } = e;
    e.onBeforeRequest = (details, callback) => {
      if (details.resourceType === 'mainFrame' || allowed(pageHost(details))) return callback({});
      onBeforeRequest(details, (r) => {
        if (r && (r.cancel || r.redirectURL) && details.webContentsId) {
          try {
            onBlocked(details.webContentsId);
          } catch {}
        }
        callback(r);
      });
    };
    e.onHeadersReceived = (details, callback) => (allowed(pageHost(details)) ? callback({}) : onHeadersReceived(details, callback));
    // The handler is the app's (ipcMain), so it answers only the pages of a session this blocks in, and for the tab's own site.
    e.onInjectCosmeticFilters = async (event, url, msg) => {
      try {
        if (!enabled.has(event.sender.session)) return;
        if (allowed(hostOf(event.sender.getURL()))) return;
      } catch {
        return;
      }
      return onInjectCosmeticFilters(event, url, msg);
    };
  }

  /** The engine's exceptions are what `prefs.allowAds` says. */
  function syncExceptions() {
    if (!engine) return;
    const want = new Set(prefs.allowAds);
    const added = [...want].filter((s) => !excepted.has(s)).map((s) => `@@||${s}^$document`);
    const removed = [...excepted].filter((s) => !want.has(s)).map((s) => `@@||${s}^$document`);
    if (!added.length && !removed.length) return;
    try {
      engine.updateFromDiff({ added, removed });
      excepted = want;
    } catch (e) {
      log('the ad blocker could not take the sites you allowed', String((e && e.message) || e));
    }
  }

  /** Every attached session blocks (or not) as the setting and the engine say. */
  function apply() {
    for (const ses of attached) {
      const had = enabled.get(ses);
      const want = prefs.adblock ? engine : null;
      if (had === want) continue;
      try {
        if (had) {
          if (had.isBlockingEnabled(ses)) had.disableBlockingInSession(ses);
          enabled.delete(ses);
        }
        if (want) {
          want.enableBlockingInSession(ses);
          enabled.set(ses, want);
        }
      } catch (e) {
        log('the ad blocker did not switch', String((e && e.message) || e));
      }
    }
  }

  const fsp = fs.promises;
  const file = () => path.join(dir, FILE);
  const caching = () => ({
    path: file(),
    // A file older than a week is as good as none: the engine is made again, and the old file is the fallback below.
    read: async (p) => {
      const st = await fsp.stat(p);
      if (Date.now() - st.mtimeMs > STALE_MS) throw new Error('the saved ad blocker is old');
      return new Uint8Array(await fsp.readFile(p));
    },
    write: async (p, buffer) => {
      await fsp.mkdir(path.dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, buffer);
      await fsp.rename(tmp, p);
    },
  });
  const download = (url) => fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });

  async function make() {
    const { ElectronBlocker } = lib;
    try {
      return await ElectronBlocker.fromPrebuiltAdsAndTracking(download, caching());
    } catch (e) {
      log('the ad blocker lists could not be fetched', String((e && e.message) || e));
    }
    // No network: the old file does.
    try {
      const old = ElectronBlocker.deserialize(new Uint8Array(await fsp.readFile(file())));
      log('the ad blocker goes on with its saved lists');
      return old;
    } catch {
      return null;
    }
  }

  /** Whether the saved file is still within its week. */
  const fresh = () => {
    try {
      return Date.now() - fs.statSync(file()).mtimeMs <= STALE_MS;
    } catch {
      return false;
    }
  };

  /** Loads the engine (one load at a time) and puts it to work; later it looks again by itself (see the top). */
  function load() {
    loading ??= (async () => {
      let next = given;
      if (!next && library()) next = await make();
      if (next) {
        patch(next);
        engine = next;
        excepted = new Set();
        syncExceptions();
        apply();
      }
      return !!engine;
    })().finally(() => {
      loading = null;
      if (given) return;
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), engine ? CHECK_MS : RETRY_MS);
      timer.unref?.();
    });
    return loading;
  }
  /** The daily look: a file that is still fresh keeps the engine in use; an old one is made again. */
  function refresh() {
    // Off: no fresh lists either (turning it on again loads them).
    if (!prefs.adblock) return undefined;
    return engine && fresh() ? undefined : load();
  }

  return {
    /** A session to block in whenever the setting is on (the browsing profile's). The first one starts the engine. */
    attach(ses) {
      attached.add(ses);
      apply();
      // Nothing is downloaded while blocking is off: the lists come the first time it is on.
      if (!engine && prefs.adblock && (told || given)) void load();
    },
    /** What the server says (`browser-prefs`): on or off, and the sites you allowed ads on. */
    setPrefs(p) {
      if (!p || typeof p !== 'object') return;
      told = true;
      if (typeof p.adblock === 'boolean') prefs.adblock = p.adblock;
      if (Array.isArray(p.allowAds)) prefs.allowAds = [...new Set(p.allowAds.map(siteOf).filter(Boolean))];
      syncExceptions();
      apply();
      if (!engine && prefs.adblock && attached.size) void load();
    },
    /** Whether the engine is in use on this session. */
    isOn: (ses) => enabled.has(ses),
    /** Resolves once the engine is loaded (false when it could not be). */
    ready: () => (engine ? Promise.resolve(true) : load()),
    /** Whether a site has its ads allowed. */
    allows: (host) => allowed(String(host || '').toLowerCase()),
    close() {
      clearTimeout(timer);
      for (const ses of [...enabled.keys()]) {
        try {
          enabled.get(ses).disableBlockingInSession(ses);
        } catch {}
      }
      enabled.clear();
      attached.clear();
    },
  };
}

module.exports = { createAdblock };
