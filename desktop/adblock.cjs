// The ad and tracker blocker of your own browsing: Ghostery's engine (@ghostery/adblocker, which ships with the server's packages)
// made from uBlock Origin's own filter lists, on the sessions of the browsing profile and of its private tabs. It blocks requests
// (a page's ads, trackers and their scripts), answers the ones that anti-adblock checks wait for with stand-ins, runs the
// scriptlets (YouTube's ad removal, the defusers of "please turn off your ad blocker") before the page's own scripts, and hides
// what is left with cosmetic filters, procedural ones included. How it hooks in:
//
//   - The lists come from the server (`browser-prefs` → `adLists`: the core lists, the cookie notices list with Hide cookie
//     banners, and those you turned on; each with its mirrors). adblock-lists.cjs fetches them, resolves their includes, keeps a
//     copy of each and fetches it again when it says it expires (its `! Expires:` line; quick-fixes says 8 hours, EasyList 4
//     days). An older server sends none: then `FALLBACK_LISTS` below (it must match the core and cookie notices lists of
//     shared/browser.ts, AD_FILTER_LISTS) are used.
//   - The engine is made in a worker thread (adblock-build.cjs: ~200,000 rules take seconds that would freeze every window if
//     they ran here), saved as engine.bin with engine.json (its key: the lists it was made from, by their text), and loaded from
//     there at the next start without a worker or a download. The one in use goes on working until the new one is loaded. An
//     hourly look makes it again when a list in use has expired (a list that is the same text again only renews its dates);
//     without a network the copies on disk are used, and without those an old engine.bin, and without that there is no blocker.
//   - Electron has one webRequest handler for each event and session, and while a session has any of the app's, its requests
//     skip Chromium's own extension webRequest. So the blocker's handlers go on a stand-in for the session (request-hub.cjs) whose
//     handlers the hub puts on the session, and the hub tells the extensions of the requests too (extensions.cjs): an extension
//     sees them, but one that blocks requests (an ad blocker of your own) does not block while this blocker is on. Turning the
//     setting off takes ours off (the session's handlers are removed) and the extension has the session again.
//   - Requests: our own onBeforeRequest (not the engine's own handler: that one redirects to `data:` addresses, which Chromium
//     aborts for a subresource, so every `$redirect` rule only blocked and the checks that wait for googletag, adsbygoogle or the
//     video ads' library went off). A request a `$redirect` rule matches goes to hydor-adblock://<secret>/<name> instead, a scheme this
//     app serves from the engine's resources on each session it blocks in (the scheme is registered before the app is ready: a
//     blocker made later, as a check does, can only cancel such a request).
//   - Frames: adblock-preload.cjs (put together with Ghostery's procedural-selector evaluator into a file of the app's data
//     folder) is registered as a frame preload on those sessions, and every one of your own tabs has `nodeIntegrationInSubFrames`
//     so that it runs in iframes too (browser.cjs). The preload asks here, synchronously (`hydor:adblock-frame`), for its frame's
//     scriptlets and style sheet, and later for the generic rules the page's classes, ids and links can match
//     (`hydor:adblock-features`). Ghostery's own preload (top frame only, asked asynchronously) is not used.
//   - allowAds: the sites you allowed ads on (a site includes its subdomains). The page's host decides, not the request's or the
//     frame's: nothing of its is blocked, and no frame of it gets a style sheet or a scriptlet.
//   - Trackers are told from ads by the privacy lists (EasyPrivacy, uBlock's privacy list): a blocked request is a 'tracker' when
//     the rule that blocked it, or its host (or a parent domain of it), is in what adblock-build.cjs kept of those, else an 'ad'.
//   - The sessions of each private context (browser.cjs attaches them) block as your own browsing's does, and are detached when
//     the context is disposed of. What a page had blocked is counted in browser.cjs (`onBlocked`).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hubOf } = require('./request-hub.cjs');
const { createListStore } = require('./adblock-lists.cjs');
const { workerSource, ENV, CONFIG, buildEngine } = require('./adblock-build.cjs');

/** The session as the blocker is given it: its webRequest handlers go through the hub, which shares them with the extensions. */
const facadeOf = (ses) => hubOf(ses).facade;

/** The address scheme the stand-ins of `$redirect` rules are served from. */
const SCHEME = 'hydor-adblock';
/**
 * The host of the stand-ins' addresses, new at each start of the app: a page could otherwise load hydor-adblock://… itself and so
 * learn that this blocker is there (an anti-adblock check would), as uBlock keeps its own stand-ins behind a secret too.
 */
const TOKEN = crypto.randomBytes(12).toString('hex');
const electron = () => {
  try {
    return require('electron');
  } catch {
    return {};
  }
};
let schemeRegistered = false;
/**
 * Registers the stand-ins' scheme. Electron allows it once, and only before the app is ready; the browser starts before that
 * (main.cjs makes it at the top), and a blocker made later cannot, and then cancels such requests as it did before.
 */
function registerScheme() {
  if (schemeRegistered) return true;
  const { app, protocol } = electron();
  if (!app || !protocol || app.isReady()) return false;
  try {
    protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, bypassCSP: true, supportFetchAPI: true, corsEnabled: true } }]);
    schemeRegistered = true;
  } catch {}
  return schemeRegistered;
}

/** The engine's file and what is kept with it. Changing how it is made (the engine's config, the environment) changes this. */
const BUILD_VERSION = 'adblock-3';
const HOUR = 3600 * 1000;
const CHECK_MS = HOUR;

/**
 * The lists to use when the server sends none (an older server): the core lists and the cookie notices list, with the same
 * addresses as shared/browser.ts (AD_FILTER_LISTS). Keep the two in step.
 */
const UBO = (file) => [`https://ublockorigin.github.io/uAssetsCDN/${file}`, `https://ublockorigin.pages.dev/${file}`, `https://cdn.jsdelivr.net/gh/uBlockOrigin/uAssetsCDN@main/${file}`];
const FALLBACK_CORE = [
  { id: 'ublock-filters', urls: UBO('filters/filters.min.txt') },
  { id: 'ublock-badware', urls: UBO('filters/badware.min.txt') },
  { id: 'ublock-privacy', urls: UBO('filters/privacy.min.txt') },
  { id: 'ublock-unbreak', urls: UBO('filters/unbreak.min.txt') },
  { id: 'ublock-quick-fixes', urls: UBO('filters/quick-fixes.min.txt') },
  { id: 'easylist', urls: [...UBO('thirdparties/easylist.txt'), 'https://easylist.to/easylist/easylist.txt'] },
  { id: 'easyprivacy', urls: [...UBO('thirdparties/easyprivacy.txt'), 'https://easylist.to/easylist/easyprivacy.txt'] },
  { id: 'plowe', urls: ['https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext'] },
  { id: 'urlhaus', urls: ['https://malware-filter.gitlab.io/urlhaus-filter/urlhaus-filter-vivaldi-online.txt', 'https://curbengh.github.io/malware-filter/urlhaus-filter-vivaldi-online.txt'] },
];
const FALLBACK_COOKIES = { id: 'easylist-cookies', urls: [...UBO('thirdparties/easylist-cookies.txt'), 'https://secure.fanboy.co.nz/fanboy-cookiemonster_ubo.txt'] };
/** The lists whose rules say what a tracker is. */
const PRIVACY_IDS = new Set(['easyprivacy', 'ublock-privacy']);

/**
 * The two channels the frame preload asks over. A blocker is one for the app, but a check makes several, so the channels belong to
 * the module: while any blocker has a session on, one handler each answers by the session that asks (a frame of a session no
 * blocker is on gets `{ off: true }`: a synchronous message must always be answered, or its frame waits for good).
 */
const peers = new Set();
let wired = false;
function wireIpc() {
  const { ipcMain } = electron();
  if (!ipcMain || wired === peers.size > 0) return;
  wired = peers.size > 0;
  const ownerOf = (event) => [...peers].find((p) => p.owns(event.sender.session));
  if (wired) {
    ipcMain.on('hydor:adblock-frame', (event) => {
      let r = { off: true };
      try {
        const p = ownerOf(event);
        if (p) r = p.onFrame(event);
      } catch {}
      event.returnValue = r;
    });
    ipcMain.handle('hydor:adblock-features', (event, msg) => {
      const p = ownerOf(event);
      return p ? p.onFeatures(event, msg) : null;
    });
  } else {
    ipcMain.removeAllListeners('hydor:adblock-frame');
    ipcMain.removeHandler('hydor:adblock-features');
  }
}

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

/** The lists the server sent, as { id, urls } with only web addresses; null when it sent nothing usable. */
function listsOf(x) {
  if (!Array.isArray(x)) return null;
  const out = [];
  const seen = new Set();
  for (const l of x) {
    if (!l || typeof l.id !== 'string' || !/^[\w.-]{1,64}$/.test(l.id) || seen.has(l.id) || !Array.isArray(l.urls)) continue;
    const urls = l.urls.filter((u) => typeof u === 'string' && /^https:\/\//i.test(u)).slice(0, 8);
    if (!urls.length) continue;
    seen.add(l.id);
    out.push({ id: l.id, urls });
  }
  return out.length ? out : null;
}

/**
 * @param {object} o
 * @param {(...what: any[]) => void} o.log
 * @param {string} o.dir                          where the lists, the engine and the preload are kept (made when needed)
 * @param {() => string} o.modulePath             the folder of @ghostery/adblocker-electron (the server's packages)
 * @param {(webContentsId: number, what: { kind: 'ad' | 'tracker', host: string, type: string }) => void} o.onBlocked   a request of this page was blocked
 * @param {object} [o.engine]                     a ready engine in place of the made one (for tests)
 * @param {typeof fetch} [o.fetch]                the fetch to use (for tests; else the global one, looked up at each request)
 * @param {() => number} [o.now]                  the clock (for tests)
 * @param {boolean} [o.inProcess]                 make the engine here, not in a worker (for tests)
 */
function createAdblock({ log, dir, modulePath, onBlocked, engine: givenEngine = null, fetch: fetchImpl, now = Date.now, inProcess = false }) {
  registerScheme();
  let lib = null;
  let failed = false;
  const store = createListStore({ dir, fetch: fetchImpl, now, log });
  const prefs = { adblock: true, allowAds: [], cookieBanners: true, adLists: null };
  /** The engine in use, the key of the lists it was made from, their ids and when they were fetched, how many rules it has. */
  let engine = null;
  let engineKey = '';
  let engineIds = [];
  let rules = 0;
  let error = '';
  let updating = false;
  let trackerIds = new Set();
  let trackerHosts = new Set();
  /** Whether the server has said yet (its first word comes as your browser starts): nothing is downloaded before it. */
  let told = false;
  /** The sessions this blocks in when it is on: the handlers and the preload each has. */
  const attached = new Set();
  const active = new Map();
  let running = null;
  let rerun = null;
  let timer = null;
  let lastRun = { ok: false };
  let preload = null;
  let closed = false;
  const metrics = { frames: 0, ms: 0, bytes: 0, samples: [] };

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

  /** The lists to make the engine from, as the settings say. */
  function wantedLists() {
    if (prefs.adLists) return prefs.adLists;
    return prefs.cookieBanners ? [...FALLBACK_CORE, FALLBACK_COOKIES] : FALLBACK_CORE;
  }

  // ---- what blocked a request ---------------------------------------------------------------------------------------------

  const kindOf = (filterId, host) => {
    if (filterId !== undefined && trackerIds.has(filterId)) return 'tracker';
    for (let h = host; h && h.includes('.'); h = h.slice(h.indexOf('.') + 1)) if (trackerHosts.has(h)) return 'tracker';
    return 'ad';
  };
  function loadTrackers() {
    try {
      const t = JSON.parse(fs.readFileSync(path.join(dir, 'trackers.json'), 'utf8'));
      trackerIds = new Set(t.ids || []);
      trackerHosts = new Set(t.hosts || []);
    } catch {
      trackerIds = new Set();
      trackerHosts = new Set();
    }
  }

  // ---- requests -----------------------------------------------------------------------------------------------------------

  const redirectUrl = (name) => `${SCHEME}://${TOKEN}/${encodeURIComponent(name)}`;

  function onBeforeRequest(details, callback) {
    const e = engine;
    // Our own stand-ins are left alone (a redirect to them would loop), and so are pages (never blocked) and allowed sites.
    if (!e || details.resourceType === 'mainFrame' || details.url.startsWith(`${SCHEME}:`) || allowed(pageHost(details))) return callback({});
    let m;
    try {
      m = e.match(lib.fromElectronDetails(details));
    } catch {
      return callback({});
    }
    if (!m || (!m.match && !m.redirect)) return callback({});
    if (details.webContentsId) {
      try {
        const host = hostOf(details.url);
        onBlocked(details.webContentsId, { kind: kindOf(m.filter && m.filter.getId(), host), host, type: details.resourceType || 'other' });
      } catch {}
    }
    if (m.redirect && schemeRegistered) callback({ redirectURL: redirectUrl(m.redirect.filename) });
    else callback({ cancel: true });
  }
  /** The engine's $csp rules (a page's policy gets what its rules add), for pages that are not allowed ones. */
  function onHeadersReceived(details, callback) {
    const e = engine;
    if (!e || allowed(pageHost(details))) return callback({});
    try {
      e.onHeadersReceived(details, callback);
    } catch {
      callback({});
    }
  }

  /** Serves a stand-in of the engine's resources (an image, a script that does nothing, the video ads' library…). */
  function serveStandIn(req) {
    try {
      const u = new URL(req.url);
      // Only the addresses this blocker gave out (a page that guesses one gets nothing).
      if (u.hostname !== TOKEN) throw new Error('not ours');
      const name = decodeURIComponent(u.pathname.slice(1));
      const r = engine && engine.resources.getResource(name);
      if (!r) throw new Error('none');
      const base64 = /;\s*base64/i.test(r.contentType);
      const body = base64 ? Buffer.from(r.body, 'base64') : r.body;
      return new Response(body, { headers: { 'content-type': base64 ? r.contentType.split(';')[0] : r.contentType, 'access-control-allow-origin': '*' } });
    } catch {
      return new Response('', { status: 404, headers: { 'access-control-allow-origin': '*' } });
    }
  }

  // ---- frames -------------------------------------------------------------------------------------------------------------

  /**
   * A scriptlet's code for its arguments, as the page's own world should run it. The engine's own (`filter.getScript`) puts the
   * arguments in raw, and the code decodes them with decodeURIComponent: an argument with a % in it (a pattern, a percentage)
   * made the whole scriptlet fail with "URI malformed". Here each is encoded, so it comes out as written. And the code is a
   * block of its own: scriptlets bring the helpers they need as declarations (some are classes, such as the one that reads JSON
   * paths), which a second scriptlet in the same page would declare again, a SyntaxError that stopped it; in a block each has
   * its own (`var`s and functions still reach the page's world, so the scriptlets keep sharing `scriptletGlobals`).
   */
  function scriptOf(e, filter) {
    const parsed = filter.parseScript();
    if (!parsed) return undefined;
    let code = e.resources.getScriptlet(parsed.name);
    if (code === undefined) return undefined;
    parsed.args.forEach((arg, i) => {
      code = code.replace(`{{${i + 1}}}`, () => encodeURIComponent(arg));
    });
    return `{${code}\n}`;
  }

  /**
   * What the engine says for a frame (the engine's own `getCosmeticsFilters`, but with the scriptlets made by `scriptOf`):
   * { active, scripts, styles, extended }.
   */
  function cosmeticsFor(e, p) {
    if (e.config.loadCosmeticFilters === false) return { active: false, scripts: [], styles: '', extended: [] };
    const { matches, allowGenericHides } = e.matchCosmeticFilters({ ...p, getExtendedRules: true });
    const filters = [];
    const scripts = [];
    for (const { filter, exception } of matches) {
      if (!filter || exception !== undefined) continue;
      if (filter.isScriptInject()) {
        const code = scriptOf(e, filter);
        if (code) scripts.push(code);
      } else filters.push(filter);
    }
    const { extended, styles } = e.injectCosmeticFilters(filters, { url: p.url, injectScriptlets: false, injectExtended: true, allowGenericHides, getBaseRules: p.getBaseRules });
    return { active: true, scripts, styles, extended };
  }

  /** What a frame's engine call needs: its address (a blank frame has its parent's), its ancestors, and whether it is for a site you allowed. */
  function frameOf(event) {
    const { Request } = library() || {};
    if (!engine || !Request || !active.has(event.sender.session)) return null;
    const frame = event.senderFrame;
    if (!frame) return null;
    let f = frame;
    let url = f.url;
    while ((!url || url === 'about:blank' || url === 'about:srcdoc') && f.parent) {
      f = f.parent;
      url = f.url;
    }
    if (!/^https?:/i.test(url)) return null;
    const top = (frame.top && frame.top.url) || url;
    if (allowed(hostOf(top))) return null;
    const ancestors = [];
    for (let p = f.parent; p; p = p.parent) {
      if (!/^https?:/i.test(p.url || '')) continue;
      const r = Request.fromRawDetails({ url: p.url, type: 'mainFrame' });
      ancestors.push({ hostname: r.hostname, domain: r.domain });
    }
    const r = Request.fromRawDetails({ url, type: 'mainFrame' });
    return { url, hostname: r.hostname, domain: r.domain, ancestors };
  }

  /**
   * The frame's first answer: the generic style sheet (what hides the ads that can be on any page; measured with the default lists:
   * 21 KB, so it goes to every frame, as uBlock does), what belongs to the frame's own address (specific rules, scriptlets,
   * procedural filters). The generic rules for the classes, ids and links found in it come later (`onFeatures`). The biggest part
   * of an answer can be the scriptlets: YouTube's are 32 scripts, 317 KB, since each carries the helpers it needs.
   */
  function onFrame(event) {
    const t0 = process.hrtime.bigint();
    let reply = { off: true };
    try {
      const f = frameOf(event);
      if (f) {
        const c = cosmeticsFor(engine, { url: f.url, hostname: f.hostname, domain: f.domain, ancestors: f.ancestors, getBaseRules: true, getInjectionRules: true, getRulesFromHostname: true, getRulesFromDOM: false });
        if (c.active) reply = { scripts: c.scripts, styles: c.styles, extended: c.extended, observe: !!engine.config.enableMutationObserver };
      }
    } catch (e) {
      log('the ad blocker could not answer a frame', String((e && e.message) || e));
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const size = reply.off ? 0 : (reply.styles || '').length + (reply.scripts || []).reduce((n, s) => n + s.length, 0) + JSON.stringify(reply.extended || []).length;
    metrics.frames++;
    metrics.ms += ms;
    metrics.bytes += size;
    // Timings and sizes only: no addresses of the pages (a private tab's either) are kept.
    if (metrics.samples.length < 2000) metrics.samples.push({ ms, size });
    return reply;
  }

  const strings = (a) => (Array.isArray(a) ? a.slice(0, 5000).filter((s) => typeof s === 'string' && s.length < 400) : []);
  /** The generic rules the classes, ids and links of a page (or what was added to it) can match. */
  function onFeatures(event, msg) {
    try {
      const f = frameOf(event);
      if (!f || !msg || typeof msg !== 'object') return null;
      const c = cosmeticsFor(engine, { url: f.url, hostname: f.hostname, domain: f.domain, ancestors: f.ancestors, classes: strings(msg.classes), ids: strings(msg.ids), hrefs: strings(msg.hrefs), getBaseRules: false, getInjectionRules: false, getRulesFromHostname: false, getRulesFromDOM: true });
      if (!c.active || (!c.styles && !c.extended.length)) return null;
      return { styles: c.styles, extended: c.extended };
    } catch {
      return null;
    }
  }

  /** This blocker's answers to the frame preload, for the one channel pair all blockers of the app share (below). */
  const peer = { owns: (ses) => active.has(ses), onFrame, onFeatures };
  const listen = (on) => (on ? peers.add(peer) : peers.delete(peer), wireIpc());

  /**
   * The preload of the frames: Ghostery's procedural-selector evaluator (its self-contained build, which only needs a global to
   * answer to) in front of adblock-preload.cjs, as one file in the data folder, written only when it changed.
   */
  function preloadFile() {
    if (preload !== null) return preload || null;
    preload = '';
    try {
      let selectors = '';
      try {
        selectors = fs.readFileSync(path.join(modulePath(), '..', 'adblocker-extended-selectors', 'dist', 'adblocker.umd.min.js'), 'utf8');
      } catch (e) {
        log('the ad blocker has no procedural filters', String((e && e.message) || e));
      }
      const own = fs.readFileSync(path.join(__dirname, 'adblock-preload.cjs'), 'utf8');
      const text = selectors ? `'use strict';\nconst __adblockSelectors = (function () {\nconst module = { exports: {} };\nconst exports = module.exports;\n${selectors}\n;return module.exports;\n})();\n${own}` : own;
      const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
      const file = path.join(dir, `preload-${hash}.cjs`);
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
      for (const n of fs.readdirSync(dir)) if (/^preload-[0-9a-f]+\.cjs$/.test(n) && n !== path.basename(file)) fs.rmSync(path.join(dir, n), { force: true });
      preload = file;
    } catch (e) {
      log('the ad blocker’s frame preload could not be made', String((e && e.message) || e));
    }
    return preload || null;
  }

  // ---- sessions -----------------------------------------------------------------------------------------------------------

  /** Every attached session blocks (or not) as the setting and the engine say. */
  function apply() {
    const want = !!(prefs.adblock && engine);
    for (const ses of attached) {
      const has = active.get(ses);
      if (!!has === want) continue;
      try {
        if (want) turnOn(ses);
        else turnOff(ses);
      } catch (e) {
        log('the ad blocker did not switch', String((e && e.message) || e));
      }
    }
    listen(active.size > 0);
  }
  function turnOn(ses) {
    const facade = facadeOf(ses);
    const entry = { preloadId: null, scheme: false };
    active.set(ses, entry);
    facade.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, onBeforeRequest);
    facade.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, onHeadersReceived);
    try {
      ses.protocol.handle(SCHEME, serveStandIn);
      entry.scheme = true;
    } catch {}
    const file = preloadFile();
    if (file) {
      try {
        entry.preloadId = facade.registerPreloadScript({ type: 'frame', filePath: file });
      } catch (e) {
        log('the ad blocker’s preload did not register', String((e && e.message) || e));
      }
    }
  }
  function turnOff(ses) {
    const entry = active.get(ses);
    active.delete(ses);
    if (!entry) return;
    const facade = facadeOf(ses);
    facade.webRequest.onBeforeRequest(null);
    facade.webRequest.onHeadersReceived(null);
    try {
      if (entry.scheme) ses.protocol.unhandle(SCHEME);
    } catch {}
    try {
      if (entry.preloadId) facade.unregisterPreloadScript(entry.preloadId);
    } catch {}
  }

  // ---- the engine: from its saved file, or made from the lists ------------------------------------------------------------

  const engineFile = path.join(dir, 'engine.bin');
  const engineInfo = path.join(dir, 'engine.json');
  const readSaved = () => {
    try {
      return JSON.parse(fs.readFileSync(engineInfo, 'utf8'));
    } catch {
      return null;
    }
  };
  function writeFile(file, data) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  /** The key of an engine made from these lists as they are on disk now: what each says, and the resources. */
  function keyOf(lists) {
    const res = store.resources.info();
    return [BUILD_VERSION, res ? res.hash : '', ...lists.filter((l) => store.info(l.id)).map((l) => `${l.id}:${store.info(l.id).hash}`)].join('|');
  }
  const anyDue = (lists) => lists.some((l) => store.due(l.id)) || store.resources.due();

  /** Takes an engine (from its bytes) into use. */
  function use(bytes, key, ids, ruleCount) {
    const { ElectronBlocker } = lib;
    const next = ElectronBlocker.deserialize(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    engine = next;
    engineKey = key;
    engineIds = ids;
    rules = ruleCount;
    loadTrackers();
    apply();
  }

  function buildInWorker(input) {
    const libPath = path.join(modulePath(), '..', 'adblocker');
    if (inProcess) return Promise.resolve().then(() => buildEngine(require(libPath), input));
    return new Promise((resolve, reject) => {
      let worker;
      try {
        const { Worker } = require('node:worker_threads');
        worker = new Worker(workerSource, { eval: true, workerData: { libPath, input } });
      } catch (e) {
        // No worker: made here, as slow as that is (a freeze for a few seconds, once).
        log('the ad blocker is made in the app itself', String((e && e.message) || e));
        return resolve(Promise.resolve().then(() => buildEngine(require(libPath), input)));
      }
      worker.once('message', (m) => (m.ok ? resolve(m) : reject(new Error(m.error))));
      worker.once('error', reject);
      worker.once('exit', (code) => reject(new Error(`the ad blocker's worker stopped (${code})`)));
    });
  }

  /** One round: fetch what is due, then load the saved engine or make a new one. Resolves true when there is an engine to block with. */
  async function once({ force = false } = {}) {
    if (!library()) return false;
    const lists = wantedLists();
    const ids = lists.map((l) => l.id);
    lastRun = { ok: false, fetched: 0, unchanged: 0, failed: 0 };
    updating = true;
    error = '';
    try {
      const saved = readSaved();
      const haveFile = fs.existsSync(engineFile);
      // Everything is as it was made: the saved engine does, without a worker or a download.
      if (!force && !anyDue(lists) && saved && haveFile && saved.key === keyOf(lists)) {
        if (engineKey !== saved.key) use(fs.readFileSync(engineFile), saved.key, ids, saved.rules || 0);
        lastRun.ok = true;
        return true;
      }
      const res = await store.sync(lists, { force });
      lastRun.fetched = res.fetched.length;
      lastRun.unchanged = res.unchanged.length;
      lastRun.failed = res.failed.length;
      if (store.resources.due() || force) {
        const r = await store.resources.refresh();
        if (r === 'failed') lastRun.failed++;
      }
      if (res.failed.length) error = `could not fetch ${res.failed.join(', ')}`;
      store.prune(ids);
      const have = lists.filter((l) => store.info(l.id));
      const key = keyOf(lists);
      if (!have.length) {
        // Nothing of the lists on this computer and no way to get them: an old engine, whatever it was made from.
        if (engine) return (lastRun.ok = true);
        if (haveFile && saved) {
          use(fs.readFileSync(engineFile), saved.key, saved.ids || [], saved.rules || 0);
          log('the ad blocker goes on with its saved engine');
          return (lastRun.ok = true);
        }
        return false;
      }
      if (engine && engineKey === key) return (lastRun.ok = true);
      if (saved && haveFile && saved.key === key) {
        use(fs.readFileSync(engineFile), key, ids, saved.rules || 0);
        return (lastRun.ok = true);
      }
      const resFile = store.resources.info() ? store.resources.file : null;
      const built = await buildInWorker({
        lists: have.map((l) => ({ id: l.id, file: store.textFile(l.id), trusted: l.id.startsWith('ublock-'), privacy: PRIVACY_IDS.has(l.id) })),
        resources: resFile,
        env: ENV,
        config: CONFIG,
      });
      writeFile(engineFile, Buffer.from(built.bytes.buffer, built.bytes.byteOffset, built.bytes.byteLength));
      writeFile(path.join(dir, 'trackers.json'), JSON.stringify({ ids: built.trackerIds, hosts: built.trackerHosts }));
      writeFile(engineInfo, JSON.stringify({ key, ids: have.map((l) => l.id), rules: built.rules, builtAt: now(), ms: built.ms }));
      // What the earlier versions kept.
      for (const old of ['engine-ads-and-tracking.bin', 'engine-ads-tracking-cookies.bin']) fs.rmSync(path.join(dir, old), { force: true });
      use(built.bytes, key, have.map((l) => l.id), built.rules);
      lastRun.ok = true;
      return true;
    } catch (e) {
      error = String((e && e.message) || e);
      log('the ad blocker could not be made', error);
      // The engine in use goes on; with none, an old file does.
      if (!engine) {
        try {
          const saved = readSaved();
          if (saved) {
            use(fs.readFileSync(engineFile), saved.key, saved.ids || [], saved.rules || 0);
            return (lastRun.ok = true);
          }
        } catch {}
      }
      return !!engine;
    } finally {
      updating = false;
    }
  }
  /** Runs `once` (one at a time); settings that changed while it ran make one more round. */
  function refreshEngine(opts = {}) {
    if (running) {
      rerun = { force: !!((rerun && rerun.force) || opts.force) };
      return running;
    }
    running = (async () => {
      let o = opts;
      let ok = false;
      for (let round = 0; o && round < 3; round++) {
        rerun = null;
        const wanted = wantedLists()
          .map((l) => l.id)
          .join(',');
        ok = await once(o);
        o = rerun || (prefs.adblock && wantedLists().map((l) => l.id).join(',') !== wanted ? {} : null);
      }
      return ok;
    })().finally(() => {
      running = null;
      if (closed || givenEngine) return;
      clearTimeout(timer);
      timer = setInterval(() => {
        if (prefs.adblock && !running && anyDue(wantedLists())) void refreshEngine();
      }, CHECK_MS);
      timer.unref?.();
    });
    return running;
  }

  /** Whether the engine in use was made for the lists the settings want now. */
  const current = () => !!engine && engineIds.join(',') === wantedLists().filter((l) => store.info(l.id)).map((l) => l.id).join(',');

  if (givenEngine) {
    engine = givenEngine;
    engineKey = 'given';
    library();
  }

  return {
    /** A session to block in whenever the setting is on (the browsing profile's). The first one starts the engine. */
    attach(ses) {
      attached.add(ses);
      apply();
      // Nothing is downloaded while blocking is off: the lists come the first time it is on.
      if (!engine && prefs.adblock && told) void refreshEngine();
    },
    /** A session no longer blocks (a private context that was disposed of): it is let go, with what was put on it. */
    detach(ses) {
      attached.delete(ses);
      if (active.has(ses)) turnOff(ses);
      listen(active.size > 0);
    },
    /** What the server says (`browser-prefs`): on or off, the sites you allowed ads on, the cookie notices, and the lists. */
    setPrefs(p) {
      if (!p || typeof p !== 'object') return;
      told = true;
      if (typeof p.adblock === 'boolean') prefs.adblock = p.adblock;
      if (Array.isArray(p.allowAds)) prefs.allowAds = [...new Set(p.allowAds.map(siteOf).filter(Boolean))];
      if (typeof p.cookieBanners === 'boolean') prefs.cookieBanners = p.cookieBanners;
      if (p.adLists !== undefined) prefs.adLists = listsOf(p.adLists);
      apply();
      // The engine the settings want is made when it is not there yet (the one in use goes on until then).
      if (prefs.adblock && attached.size && !givenEngine && !current()) void refreshEngine();
    },
    /** Whether the engine is in use on this session. */
    isOn: (ses) => active.has(ses),
    /** Whether the engine in use has the cookie notices list. */
    hidesCookieNotices: (ses) => active.has(ses) && engineIds.includes('easylist-cookies'),
    /** Resolves once an engine is loaded (false when none could be). */
    ready: () => (engine ? Promise.resolve(true) : refreshEngine()),
    /** Fetches every list now and makes the engine again when one changed ("Update now"): false when that failed. */
    async update() {
      if (givenEngine) return true;
      await refreshEngine({ force: true });
      // Done when the lists answered (new text or the same again) and the engine is there; false when none answered.
      return lastRun.ok && lastRun.fetched + lastRun.unchanged > 0;
    },
    /** What the statistics page shows of the lists. */
    status() {
      const stamps = engineIds.map((id) => store.info(id)).filter(Boolean).map((m) => m.fetchedAt);
      return { updatedAt: stamps.length ? Math.max(...stamps) : null, rules, ids: [...engineIds], updating, ...(error ? { error } : {}) };
    },
    /** Whether a site has its ads allowed. */
    allows: (host) => allowed(String(host || '').toLowerCase()),
    /** What the frames cost (for checks and the real-world measurements): { frames, ms, bytes, samples }. */
    metrics: () => metrics,
    close() {
      closed = true;
      clearInterval(timer);
      for (const ses of [...active.keys()]) {
        try {
          turnOff(ses);
        } catch {}
      }
      attached.clear();
      listen(false);
    },
  };
}

module.exports = { createAdblock, registerScheme, FALLBACK_CORE, FALLBACK_COOKIES, SCHEME };
