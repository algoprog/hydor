// The ad and tracker blocker of your own browsing: Ghostery's engine (@ghostery/adblocker-electron, which ships with the
// server's packages) on the session of the browsing profile. It blocks requests in the session's webRequest (a page's ads,
// trackers and their scripts) and hides what is left of them with the cosmetic filters its frame preload injects.
//
// How it hooks in:
//   - The engine is made from Ghostery's ads-and-tracking lists (EasyList, EasyPrivacy, uBlock's and Peter Lowe's lists), and
//     with `cookieBanners` on (the default) from the EasyList cookie notices list besides: that one list only, not the broader
//     "annoyances" lists (pop-ups, newsletter boxes, chat widgets) the package's full engine adds, which break more pages.
//     Each of the two engines is made once and kept as a file of its own in the app's data folder; a file older than 7 days is
//     made again from the lists (checked when the browser starts and once a day), and when that fails (no network) the old
//     file is kept and used (an engine with cookie notices that cannot be made, and has no file, is the one without them if
//     that file is there). The engine loads the first time the browsing browser starts, so someone who never opens it
//     downloads nothing; changing the setting loads the other engine (when its file is not fresh yet) and swaps it in on the
//     sessions that block, and until it is there the one in use goes on.
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
//   - The session of each private context (browser.cjs attaches it) blocks as your own browsing's does, and is detached when
//     the context is disposed of.
//   - The count of what a tab had blocked since its last main-frame navigation is in browser.cjs (`onBlocked` gets the id
//     of the page's webContents).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** The two channels the engine's frame preload asks its cosmetic filters over (the engine's own handlers are for one session at a time). */
const COSMETIC_CHANNELS = ['@ghostery/adblocker/inject-cosmetic-filters', '@ghostery/adblocker/is-mutation-observer-enabled'];
const ipc = () => {
  try {
    return require('electron').ipcMain || null;
  } catch {
    return null;
  }
};

/** A file of the engine older than this is made again. */
const STALE_MS = 7 * 24 * 3600 * 1000;
/** How often a running app looks at it, and how long it waits to try again after a failed download. */
const CHECK_MS = 24 * 3600 * 1000;
const RETRY_MS = 3600 * 1000;
const FETCH_MS = 60_000;
/** The saved file of each engine: without and with the cookie notices list. */
const FILES = { plain: 'engine-ads-and-tracking.bin', cookies: 'engine-ads-tracking-cookies.bin' };
/** EasyList's cookie notices list as the package ships it (its own address is in `fullLists`, found there first). */
const COOKIE_LIST = 'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/easylist/easylist-cookie.txt';

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
 * @param {object} [o.engine]                     a ready engine in place of the made ones (for tests)
 * @param {{ plain?: object, cookies?: object }} [o.engines]   ready engines for each variant, as `engine` for one (for tests)
 */
function createAdblock({ log, dir, modulePath, onBlocked, engine: givenOne = null, engines: givenEach = null }) {
  const given = givenOne || givenEach ? { plain: givenEach?.plain || givenOne, cookies: givenEach?.cookies || givenOne } : null;
  let lib = null;
  let failed = false;
  /** The engines made so far, by variant ('plain', 'cookies'); each remembers the sites it has exceptions for. */
  const engines = new Map();
  const prefs = { adblock: true, allowAds: [], cookieBanners: true };
  const variant = () => (prefs.cookieBanners ? 'cookies' : 'plain');
  /** The engine to block with: the one the setting wants, else any that is there (until the wanted one is made). */
  const current = () => engines.get(variant()) || engines.get(prefs.cookieBanners ? 'plain' : 'cookies') || null;
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

  /** An engine's exceptions are what `prefs.allowAds` says. */
  function syncExceptions(engine) {
    if (!engine) return;
    const had = engine.hydorExcepted || new Set();
    const want = new Set(prefs.allowAds);
    const added = [...want].filter((s) => !had.has(s)).map((s) => `@@||${s}^$document`);
    const removed = [...had].filter((s) => !want.has(s)).map((s) => `@@||${s}^$document`);
    if (!added.length && !removed.length) return;
    try {
      engine.updateFromDiff({ added, removed });
      engine.hydorExcepted = want;
    } catch (e) {
      log('the ad blocker could not take the sites you allowed', String((e && e.message) || e));
    }
  }

  /**
   * The engine registers its two cosmetic filter handlers on ipcMain each time it enables a session, and removes them when it
   * disables one: a second session (a private context's) would fail to enable, and one session's leaving would take them from the
   * others. So they are taken off before an engine enables a session, and put back after, once, answering each page by the engine
   * its session blocks with.
   */
  function routeCosmetics() {
    const main = ipc();
    if (!main) return;
    for (const c of COSMETIC_CHANNELS) main.removeHandler(c);
    if (!enabled.size) return;
    main.handle(COSMETIC_CHANNELS[0], (event, url, msg) => {
      const e = enabled.get(event.sender.session);
      return e ? e.onInjectCosmeticFilters(event, url, msg) : undefined;
    });
    main.handle(COSMETIC_CHANNELS[1], (event) => {
      const e = enabled.get(event.sender.session);
      return e ? e.onIsMutationObserverEnabled(event) : false;
    });
  }

  /** Every attached session blocks (or not) as the setting and the engine say. */
  function apply() {
    let changed = false;
    for (const ses of attached) {
      const had = enabled.get(ses);
      const want = prefs.adblock ? current() : null;
      if (had === want) continue;
      changed = true;
      try {
        if (had) {
          if (had.isBlockingEnabled(ses)) had.disableBlockingInSession(ses);
          enabled.delete(ses);
        }
        if (want) {
          const main = ipc();
          if (main) for (const c of COSMETIC_CHANNELS) main.removeHandler(c);
          want.enableBlockingInSession(ses);
          enabled.set(ses, want);
        }
      } catch (e) {
        log('the ad blocker did not switch', String((e && e.message) || e));
      }
    }
    if (changed) routeCosmetics();
  }

  const fsp = fs.promises;
  const file = (v) => path.join(dir, FILES[v]);
  const caching = (v) => ({
    path: file(v),
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

  /** Makes the engine of a variant: [the engine, the variant it is]. Null when there is none (no network and no saved file). */
  async function make(v) {
    const { ElectronBlocker } = lib;
    try {
      if (v === 'cookies') {
        const list = (lib.fullLists || []).find((u) => /\/easylist-cookie\.txt$/.test(u)) || COOKIE_LIST;
        return [await ElectronBlocker.fromLists(download, [...lib.adsAndTrackingLists, list], {}, caching(v)), v];
      }
      return [await ElectronBlocker.fromPrebuiltAdsAndTracking(download, caching(v)), v];
    } catch (e) {
      log('the ad blocker lists could not be fetched', String((e && e.message) || e));
    }
    // No network: the old file does, or else (for the cookie notices) the one without them.
    for (const other of v === 'cookies' ? ['cookies', 'plain'] : ['plain']) {
      try {
        const old = ElectronBlocker.deserialize(new Uint8Array(await fsp.readFile(file(other))));
        log('the ad blocker goes on with its saved lists');
        return [old, other];
      } catch {}
    }
    return null;
  }

  /** Whether the saved file of a variant is still within its week. */
  const fresh = (v) => {
    try {
      return Date.now() - fs.statSync(file(v)).mtimeMs <= STALE_MS;
    } catch {
      return false;
    }
  };

  /**
   * Loads the engine the setting wants (one load at a time) and puts it to work; later it looks again by itself (see the
   * top). The setting may change meanwhile: then the other one is made after this one.
   */
  function load() {
    loading ??= (async () => {
      for (let round = 0; round < 2; round++) {
        const v = variant();
        let made = given ? [given[v], v] : null;
        if (!made && library()) made = await make(v);
        if (!made) break;
        const [next, as] = made;
        patch(next);
        engines.set(as, next);
        syncExceptions(next);
        apply();
        // Done, unless the setting changed while this loaded and the engine it wants now is not there yet: another round.
        if (as !== v || variant() === v || engines.has(variant())) break;
      }
      return engines.size > 0;
    })().finally(() => {
      loading = null;
      if (given) return;
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), engines.size ? CHECK_MS : RETRY_MS);
      timer.unref?.();
    });
    return loading;
  }
  /** The daily look: a file that is still fresh keeps the engine in use; an old one is made again. */
  function refresh() {
    // Off: no fresh lists either (turning it on again loads them).
    if (!prefs.adblock) return undefined;
    return engines.has(variant()) && fresh(variant()) ? undefined : load();
  }

  return {
    /** A session to block in whenever the setting is on (the browsing profile's). The first one starts the engine. */
    attach(ses) {
      attached.add(ses);
      apply();
      // Nothing is downloaded while blocking is off: the lists come the first time it is on.
      if (!engines.size && prefs.adblock && (told || given)) void load();
    },
    /** A session no longer blocks (a private context that was disposed of): it is let go, with what the engine put on it. */
    detach(ses) {
      attached.delete(ses);
      const had = enabled.get(ses);
      enabled.delete(ses);
      try {
        if (had && had.isBlockingEnabled(ses)) had.disableBlockingInSession(ses);
      } catch {}
      if (had) routeCosmetics();
    },
    /** What the server says (`browser-prefs`): on or off, the sites you allowed ads on, and whether cookie notices are hidden. */
    setPrefs(p) {
      if (!p || typeof p !== 'object') return;
      told = true;
      if (typeof p.adblock === 'boolean') prefs.adblock = p.adblock;
      if (Array.isArray(p.allowAds)) prefs.allowAds = [...new Set(p.allowAds.map(siteOf).filter(Boolean))];
      if (typeof p.cookieBanners === 'boolean') prefs.cookieBanners = p.cookieBanners;
      for (const e of engines.values()) syncExceptions(e);
      apply();
      // The engine the setting wants is made when it is not there yet (the one in use goes on until then).
      if (prefs.adblock && attached.size && !engines.has(variant())) void load();
    },
    /** Whether the engine is in use on this session. */
    isOn: (ses) => enabled.has(ses),
    /** Whether the engine in use on this session is the one that also hides cookie notices. */
    hidesCookieNotices: (ses) => enabled.has(ses) && enabled.get(ses) === engines.get('cookies'),
    /** Resolves once an engine is loaded (false when none could be). */
    ready: () => (engines.size ? Promise.resolve(true) : load()),
    /** Whether a site has its ads allowed. */
    allows: (host) => allowed(String(host || '').toLowerCase()),
    close() {
      clearTimeout(timer);
      for (const ses of [...enabled.keys()]) {
        try {
          enabled.get(ses).disableBlockingInSession(ses);
        } catch {}
      }
      const had = enabled.size;
      enabled.clear();
      attached.clear();
      if (had) routeCosmetics();
    },
  };
}

module.exports = { createAdblock };
