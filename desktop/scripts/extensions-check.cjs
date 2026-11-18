// What desktop/extensions.cjs (and desktop/extension-preload.cjs) give Chrome extensions in the app's own browser, checked
// with small extensions this script writes itself. Run by Electron as its main script (desktop/scripts/browser-selftest.mjs
// does that, with a display). It stands in for the server (the messages browser.cjs sends it) and for the app's window (a
// real BrowserWindow with desktop/preload.cjs), loads the extensions with createExtensions + createBrowser into the
// browsing profile, serves a local site, opens one of your own tabs and shows it, and presses the extensions' buttons the
// way the app's page does (hydorDesktop.browser.popup). The extensions' workers tell what they saw through the console
// ("hydor-test ..." lines), which this script reads. It checks that:
//   - a press gives a listener on `browser.action.onClicked` (the `browser` object, not `chrome`) the real tab (its id is the
//     page's own, with its address), and the press answers true;
//   - tabs.query for the active tab of this window gives that tab; tabs.create gives a real number that tabs.get finds, and
//     the server is told to bring that tab to the front;
//   - tabs.onUpdated (status, address, title) and tabs.onActivated reach the worker, a content script's message arrives with
//     the tab's id in sender.tab, and webRequest's details carry the tab's id;
//   - webNavigation.onCompleted reaches a listener whose filter matches and not one whose filter does not;
//   - scripting.executeScript runs in the tab;
//   - downloads.download gives an id, the download starts under the file name asked for and downloads.onChanged says complete;
//   - what a worker sends while it first starts (action.setTitle at the top of its script) reaches the app's badge callback;
//   - an extension with a side panel (and openPanelOnActionClick) opens it as a pop-up window on a press, and the panel
//     page's tabs.query sees the tab you see; pressing again closes it;
//   - an extension whose worker throws at start answers false to a press, and no hidden relay window is made for it;
//   - an extension with a default_popup opens it on a press, and pressing again closes it;
//   - webRequest: the listeners of an extension get the tab's main_frame and a subresource request, each with the tab's id, type
//     and address (onSendHeaders and onResponseStarted with their headers as [{ name, value }] when asked), each request once,
//     only as often as the listener's filter allows, and none of a site the extension has no host permission for.
// All of it runs twice, in two Electron processes: with the ad blocker off (Chromium's own webRequest serves the extensions),
// and with it on (the blocker's handlers take the session's requests, request-hub.cjs tells the extensions of them), where
// the blocker still has to block a request to a host on its list.
'use strict';
const { app, BrowserWindow, session, webContents } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createBrowser } = require('../browser.cjs');
const { createExtensions } = require('../extensions.cjs');
const { hubOf } = require('../request-hub.cjs');

// The second run: with the ad blocker on (a tiny list of its own, no network). The blocker's package is the server's.
const BLOCKER = process.argv.includes('--blocker');
const TAG = BLOCKER ? '[blocker on] ' : '[blocker off] ';
const ADBLOCK = path.resolve(__dirname, '../../node_modules/@ghostery/adblocker-electron');
const AD_HOST = 'ads.hydor-test.example';
const OK_HOST = 'fine.hydor-test.example';

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
// Everything it makes (the profile, the extensions, the downloads) is in one folder that goes away at the end.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-ext-check-'));
app.setPath('userData', path.join(tmp, 'user'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
let failed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    ok++;
    console.log(`ok   ${TAG}${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${TAG}${name}\n     ${String((e && e.message) || e).split('\n').join('\n     ')}`);
  }
};
const until = async (fn, ms = 8000, what = 'it') => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`${what} did not happen in ${ms} ms`);
    await sleep(50);
  }
};

// ---- the extensions: written into the temp folder ----
// A worker reports through `say`, one console line of JSON: { x: the extension, event, data }.
const SAY = (x) => `const say = (event, data) => console.log('hydor-test ' + JSON.stringify({ x: '${x}', event, data }));\n`;
const ID = {
  main: 'abcdefghijklmnopabcdefghijklmnop',
  panel: 'bcdefghijklmnopabcdefghijklmnopa',
  broken: 'cdefghijklmnopabcdefghijklmnopab',
  popup: 'defghijklmnopabcdefghijklmnopabc',
  req: 'efghijklmnopabcdefghijklmnopabcd',
  nohost: 'fghijklmnopabcdefghijklmnopabcde',
};
const NAME = { main: 'Hydor main test', panel: 'Hydor panel test', broken: 'Hydor broken test', popup: 'Hydor popup test', req: 'Hydor requests test', nohost: 'Hydor no host test' };
const manifest = (x, more) => JSON.stringify({ manifest_version: 3, name: NAME[x], version: '1.0', action: { default_title: NAME[x] }, ...more });
const EXTENSIONS = {
  main: {
    'manifest.json': manifest('main', {
      background: { service_worker: 'bg.js' },
      permissions: ['tabs', 'webRequest', 'webNavigation', 'scripting', 'downloads', 'storage'],
      host_permissions: ['<all_urls>'],
      content_scripts: [{ matches: ['http://127.0.0.1/*'], js: ['cs.js'], run_at: 'document_idle' }],
    }),
    'bg.js':
      SAY('main') +
      `
browser.action.setTitle({ title: 'set at start' });
browser.action.onClicked.addListener(async (tab) => {
  say('clicked', { id: tab.id, url: tab.url, active: tab.active });
  const base = 'http://127.0.0.1:' + new URL(tab.url).port;
  try {
    const q = await chrome.tabs.query({ active: true, currentWindow: true });
    say('active', q.map((x) => ({ id: x.id, url: x.url })));
    const t = await chrome.tabs.create({ url: base + '/own?made', active: true });
    say('created', { id: t.id, type: typeof t.id });
    const back = await chrome.tabs.get(t.id);
    say('got', { id: back.id });
  } catch (e) { say('tabs error', String(e && e.message)); }
  chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title }).then((r) => say('script', r.map((x) => x.result)), (e) => say('script error', e.message));
  chrome.downloads.download({ url: base + '/file.txt', filename: 'from-ext.txt' }).then((id) => say('download id', { id, type: typeof id }), (e) => say('download error', e.message));
});
chrome.webRequest.onResponseStarted.addListener((d) => say('webRequest', { tabId: d.tabId, type: d.type, url: d.url }), { urls: ['<all_urls>'] });
chrome.tabs.onUpdated.addListener((id, c) => say('updated', { id, change: c }));
chrome.tabs.onActivated.addListener((i) => say('activated', i));
chrome.webNavigation.onCompleted.addListener((d) => say('navCompleted', { tabId: d.tabId, frameId: d.frameId, url: d.url }), { url: [{ hostEquals: '127.0.0.1' }] });
chrome.webNavigation.onCompleted.addListener((d) => say('wrongFilter', { url: d.url }), { url: [{ hostSuffix: 'example.org' }] });
chrome.runtime.onMessage.addListener((m, sender) => { say('message', { m, tab: sender.tab && sender.tab.id, url: sender.tab && sender.tab.url }); });
chrome.downloads.onChanged.addListener((d) => say('dl changed', d));
say('started');
`,
    'cs.js': `chrome.runtime.sendMessage({ hello: location.pathname });\n`,
  },
  panel: {
    'manifest.json': manifest('panel', { background: { service_worker: 'bg.js' }, permissions: ['sidePanel', 'tabs'], side_panel: { default_path: 'panel.html' } }),
    'bg.js': SAY('panel') + `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).then(() => say('panel behavior set'));\n`,
    'panel.html': `<!doctype html><meta charset="utf-8"><title>panel</title><body style="margin:0;background:#2a6"><h1>A side panel</h1><script src="panel.js"></script>\n`,
    'panel.js': `chrome.tabs.query({ active: true, currentWindow: true }).then((t) => { document.body.append(' tab: ' + (t[0] && t[0].id) + ' url: ' + (t[0] && t[0].url)); });\n`,
  },
  broken: {
    'manifest.json': manifest('broken', { background: { service_worker: 'bg.js' } }),
    'bg.js': `chrome.thisDoesNotExist.onSomething.addListener(() => {});\n`,
  },
  // Listens to requests, with every kind of filter.
  req: {
    'manifest.json': manifest('req', { background: { service_worker: 'bg.js' }, permissions: ['webRequest'], host_permissions: ['<all_urls>'] }),
    'bg.js':
      SAY('req') +
      `
const pick = (d) => ({ tabId: d.tabId, type: d.type, url: d.url, id: d.requestId, frameId: d.frameId });
const all = { urls: ['<all_urls>'] };
chrome.webRequest.onBeforeRequest.addListener((d) => say('before', pick(d)), all);
chrome.webRequest.onSendHeaders.addListener((d) => say('send', { ...pick(d), headers: d.requestHeaders }), all, ['requestHeaders']);
chrome.webRequest.onResponseStarted.addListener((d) => say('resp', { ...pick(d), headers: d.responseHeaders }), all, ['responseHeaders']);
chrome.webRequest.onBeforeRequest.addListener((d) => say('imagesOnly', pick(d)), { urls: ['<all_urls>'], types: ['image'] });
chrome.webRequest.onBeforeRequest.addListener((d) => say('otherHost', pick(d)), { urls: ['http://other.hydor-test.example/*'] });
say('started');
`,
  },
  // Has webRequest but no host permission: it must hear nothing.
  nohost: {
    'manifest.json': manifest('nohost', { background: { service_worker: 'bg.js' }, permissions: ['webRequest'] }),
    'bg.js':
      SAY('nohost') +
      `
const all = { urls: ['<all_urls>'] };
chrome.webRequest.onBeforeRequest.addListener((d) => say('before', { url: d.url }), all);
chrome.webRequest.onSendHeaders.addListener((d) => say('send', { url: d.url }), all);
chrome.webRequest.onResponseStarted.addListener((d) => say('resp', { url: d.url }), all);
say('started');
`,
  },
  popup: {
    'manifest.json': manifest('popup', { action: { default_title: NAME.popup, default_popup: 'popup.html' }, background: { service_worker: 'bg.js' } }),
    'bg.js': SAY('popup') + `say('started');\n`,
    'popup.html': `<!doctype html><meta charset="utf-8"><title>popup</title><body style="margin:0;background:#fd8"><p style="margin:10px">A popup</p>\n`,
  },
};
const extDir = (x) => path.join(tmp, 'extensions', x);
for (const x of Object.keys(EXTENSIONS)) {
  fs.mkdirSync(extDir(x), { recursive: true });
  for (const [file, body] of Object.entries(EXTENSIONS[x])) fs.writeFileSync(path.join(extDir(x), file), body);
}

// ---- the test site ----
const pages = {
  '/app': '<!doctype html><title>app</title><body style="margin:0;background:#123">',
  '/own': '<!doctype html><title>own page</title><body style="margin:0;background:#fff"><h1>a page</h1>',
  '/second': '<!doctype html><title>second page</title><body style="margin:0;background:#eef"><h1>another</h1>',
  '/file.txt': 'hello from a download',
  // A page with an image, a request to a host on the blocker's list and one to a host that is not.
  '/reqs': `<!doctype html><title>requests</title><body style="margin:0"><img src="/pixel.png"><script>window.__ad='waiting';window.__ok='waiting';
fetch('http://${AD_HOST}/px.js',{mode:'no-cors'}).then(()=>{window.__ad='loaded'},()=>{window.__ad='blocked'});
fetch('http://${OK_HOST}/px.js',{mode:'no-cors'}).then(()=>{window.__ok='loaded'},()=>{window.__ok='blocked'})</script>`,
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const site = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/pixel.png') return void (res.writeHead(200, { 'content-type': 'image/png' }), res.end(PNG));
  const body = pages[p];
  if (body === undefined) return void (res.writeHead(404), res.end('nf'));
  res.writeHead(200, { 'content-type': p === '/file.txt' ? 'application/octet-stream' : 'text/html' });
  res.end(body);
});

// The browser sends what is not on this computer through a proxy; absolute-URL requests go on to the site.
const proxy = http.createServer((req, res) => {
  const u = new URL(req.url);
  const up = http.request({ host: '127.0.0.1', port: site.address().port, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: u.host } }, (r) => (res.writeHead(r.statusCode, r.headers), r.pipe(res)));
  up.on('error', () => (res.writeHead(502), res.end()));
  req.pipe(up);
});

app.whenReady().then(async () => {
  const port = await new Promise((r) => site.listen(0, '127.0.0.1', () => r(site.address().port)));
  const proxyPort = await new Promise((r) => proxy.listen(0, '127.0.0.1', () => r(proxy.address().port)));
  const origin = `http://127.0.0.1:${port}`;
  let win = null;
  let browser;
  const badges = [];
  const extLog = [];
  const ext = createExtensions({
    log: (s) => extLog.push(String(s)),
    mainWindow: () => win,
    openTab: (url) => void browser.openTab(url).catch(() => {}),
    badge: (b) => badges.push(b),
  });

  // The server's side: browser.cjs's messages, and a small CDP client.
  const CONN = 'c1';
  const toServerLog = [];
  const events = [];
  const pending = new Map();
  let seq = 0;
  browser = createBrowser({
    log: () => {},
    toServer: (m) => {
      toServerLog.push(m);
      if (m.type !== 'cdp') return;
      const msg = JSON.parse(m.data);
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (p) msg.error ? p.reject(new Error(`${msg.error.code} ${msg.error.message}`)) : p.resolve(msg.result);
      } else events.push(msg);
    },
    mainWindow: () => win,
    fromOwnPage: (e) => (e.senderFrame && e.senderFrame.url ? new URL(e.senderFrame.url).origin === origin : false),
    ext,
    adblock: BLOCKER ? { dir: path.join(tmp, 'adblock'), modulePath: () => ADBLOCK, engine: require(ADBLOCK).ElectronBlocker.parse(`||${AD_HOST}^\n`) } : null,
  });
  browser.registerIpc();
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      browser.message({ type: 'cdp', conn: CONN, data: JSON.stringify({ id, method, params }) });
      setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(`${method} timed out`))), 20_000).unref();
    });

  // What the workers say.
  const ses = session.fromPartition('persist:hydor-browsing');
  const said = [];
  const other = [];
  ses.serviceWorkers.on('console-message', (_e, d) => {
    const m = String(d.message);
    if (m.startsWith('hydor-test ')) {
      try {
        said.push(JSON.parse(m.slice(11)));
      } catch {}
    } else other.push(`[worker ${d.level}] ${m.slice(0, 300)}`);
  });
  /** The first thing extension `x` said (event `ev`, passing `pred`) at or after `from` (an index of `said`); waits for it. */
  const heard = async (x, ev, pred = () => true, from = 0, ms = 10_000) => {
    const find = () => said.slice(from).find((s) => s.x === x && s.event === ev && pred(s.data));
    try {
      return (await until(find, ms, `${x} saying "${ev}"`)).data;
    } catch (e) {
      throw new Error(`${e.message}. It said: ${JSON.stringify(said.slice(from).filter((s) => s.x === x)).slice(0, 1500)}${other.length ? `\n     workers: ${other.slice(-5).join(' | ')}` : ''}`);
    }
  };

  const dlDir = path.join(tmp, 'dl');
  const test = async () => {
    await browser.launch({ conn: CONN, profile: 'browsing', proxy: proxyPort, extensions: Object.keys(ID).map((x) => ({ id: ID[x], path: extDir(x) })) });
    if (BLOCKER) {
      browser.message({ type: 'browser-prefs', adblock: true, allowAds: [], cookieBanners: false });
      await until(() => browser.adblock && browser.adblock.isOn(ses), 8000, 'the ad blocker to turn on');
    }
    // The point of the two runs: the app's own handlers hold the session's requests, or they do not.
    assert.equal(hubOf(ses).taken(), BLOCKER, 'the blocker has the session’s requests exactly when it is on');
    await cdp('Target.setDiscoverTargets', { discover: true });
    await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await cdp('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: dlDir, eventsEnabled: true });

    // The window: a real one with the app's preload, showing a page of the app's own origin.
    win = new BrowserWindow({ width: 1280, height: 860, show: true, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, '../preload.cjs') } });
    await win.loadURL(`${origin}/app`);
    const page = (expr) => win.webContents.executeJavaScript(expr, true);
    const press = (x) => page(`hydorDesktop.browser.popup(${JSON.stringify(ID[x])}, {x:1200,y:10,w:32,h:32})`);

    // The workers that run on their own are up before your tab is made (a worker that was never told of a tab is a harder case).
    await until(() => ['main', 'popup', 'req', 'nohost'].every((x) => said.some((s) => s.x === x && s.event === 'started')) && said.some((s) => s.x === 'panel' && s.event === 'panel behavior set'), 15_000, 'the extensions’ workers to start').catch((e) => {
      throw new Error(`${e.message}: ${JSON.stringify(said)} ${other.join(' | ')} ${extLog.slice(-8).join(' | ')}`);
    });

    // Your own tab, shown.
    const { targetId } = await cdp('Target.createTarget', { url: `${origin}/own` });
    const conn = browser.conns.get(CONN);
    const tab = conn.targets.get(targetId);
    assert.ok(tab && tab.wc, 'the tab was not made');
    await until(() => !tab.wc.isLoading() && tab.wc.getURL().startsWith(`${origin}/own`), 8000, 'the tab to load');
    assert.equal(await page(`hydorDesktop.browser.show(${JSON.stringify(targetId)}, {x:0,y:60,w:1280,h:760})`), true);
    const tabId = tab.wc.id;

    await check('a listener on browser.action.onClicked gets the real tab on a press, and the press answers true', async () => {
      const mark = said.length;
      assert.equal(await press('main'), true);
      const c = await heard('main', 'clicked', () => true, mark);
      assert.equal(c.id, tabId, 'the tab id is the page’s own');
      assert.equal(c.url, `${origin}/own`);
    });

    await check('chrome.tabs.query({ active, currentWindow }) from the worker gives that tab', async () => {
      const a = await heard('main', 'active');
      assert.deepEqual(a, [{ id: tabId, url: `${origin}/own` }]);
    });

    await check('chrome.tabs.create gives a real numeric id that tabs.get finds, and the server is told to bring the tab to the front', async () => {
      const c = await heard('main', 'created');
      assert.equal(c.type, 'number');
      assert.ok(Number.isInteger(c.id) && c.id > 0, `id ${c.id}`);
      assert.equal((await heard('main', 'got')).id, c.id);
      const made = [...conn.targets.entries()].find(([, t]) => t.wc && t.wc.id === c.id);
      assert.ok(made, 'no tab of the browser has the id tabs.create gave');
      await until(() => toServerLog.some((m) => m.type === 'browser-front' && m.conn === CONN && m.target === made[0]), 4000, 'browser-front for the new tab');
    });

    await check('chrome.scripting.executeScript({ target: { tabId } }) runs in the tab', async () => {
      assert.deepEqual((await heard('main', 'script')), ['own page']);
    });

    await check('chrome.downloads.download gives an id, starts under the file name asked for, and onChanged reports complete', async () => {
      const d = await heard('main', 'download id');
      assert.equal(d.type, 'number');
      const begin = await until(() => events.find((m) => m.method === 'Browser.downloadWillBegin' && m.params && /file\.txt/.test(m.params.url || '')), 6000, 'Browser.downloadWillBegin');
      assert.equal(begin.params.suggestedFilename, 'from-ext.txt');
      const done = await heard('main', 'dl changed', (c) => c.id === d.id && c.state && c.state.current === 'complete');
      assert.equal(done.id, d.id);
    });

    await check('the message a worker sends while it first starts (action.setTitle) reaches the app’s badge callback', async () => {
      const b = badges.find((x) => x.title === 'set at start');
      assert.ok(b, `badge calls: ${JSON.stringify(badges)}`);
      assert.equal(b.extension, ID.main);
    });

    // The shown tab goes to another page: what a page's life gives the extensions.
    const mark = said.length;
    tab.wc.loadURL(`${origin}/second`);
    await check('tabs.onUpdated reaches the worker with status, url and title for the tab', async () => {
      const mine = (pred) => (c) => c.id === tabId && pred(c.change);
      await heard('main', 'updated', mine((c) => c.status === 'loading'), mark);
      await heard('main', 'updated', mine((c) => c.status === 'complete'), mark);
      await heard('main', 'updated', mine((c) => c.url === `${origin}/second`), mark);
      await heard('main', 'updated', mine((c) => c.title === 'second page'), mark);
    });

    await check('tabs.onActivated reaches the worker for the tab you see', async () => {
      // Showing the tab made it the active one (before the press), and showing it again, as the app does when you switch to it.
      const before = said.length;
      await page(`hydorDesktop.browser.show(${JSON.stringify(targetId)}, {x:0,y:60,w:1280,h:760})`);
      const a = said.find((s) => s.x === 'main' && s.event === 'activated' && s.data && s.data.tabId === tabId);
      const later = a || (await heard('main', 'activated', (d) => d.tabId === tabId, before, 3000).catch(() => null));
      assert.ok(later, `no onActivated for tab ${tabId}: ${JSON.stringify(said.filter((s) => s.event === 'activated'))}`);
    });

    await check('a content script’s runtime.sendMessage arrives with sender.tab.id equal to the tab’s id', async () => {
      const m = await heard('main', 'message', (d) => d.m && d.m.hello === '/second', mark);
      assert.equal(m.tab, tabId);
      assert.equal(m.url, `${origin}/second`);
    });

    await check('webRequest details carry the tab’s id', async () => {
      const r = await heard('main', 'webRequest', (d) => d.url === `${origin}/second`, mark);
      assert.equal(r.tabId, tabId);
    });

    await check('webNavigation.onCompleted fires for a listener whose filter matches, and not for one whose filter does not', async () => {
      const n = await heard('main', 'navCompleted', (d) => d.url === `${origin}/second`, mark);
      assert.equal(n.tabId, tabId);
      assert.equal(n.frameId, 0);
      await sleep(500);
      assert.deepEqual(said.filter((s) => s.event === 'wrongFilter'), [], 'the listener for example.org was called');
    });

    // A page with an image and two fetches: what the extensions hear of its requests.
    const reqMark = said.length;
    const reqsUrl = `${origin}/reqs`;
    const pixelUrl = `${origin}/pixel.png`;
    tab.wc.loadURL(reqsUrl);
    const mine = (x, ev, url) => said.slice(reqMark).filter((s) => s.x === x && s.event === ev && (!url || s.data.url === url)).map((s) => s.data);
    // The last of what the page asks for has been answered: the image, and then some time for what comes late.
    const settled = async () => {
      await heard('req', 'resp', (d) => d.url === pixelUrl, reqMark);
      await until(() => tab.wc.executeJavaScript('__ad !== "waiting" && __ok !== "waiting"').catch(() => false), 8000, 'the page’s fetches');
      await sleep(800);
    };

    await check('webRequest: onBeforeRequest, onSendHeaders and onResponseStarted give the page’s main_frame and an image, with the tab’s id, type and address', async () => {
      await settled();
      for (const [ev, what] of [['before', 'onBeforeRequest'], ['send', 'onSendHeaders'], ['resp', 'onResponseStarted']]) {
        const m = mine('req', ev, reqsUrl).find((d) => d.type === 'main_frame');
        assert.ok(m, `${what}: no main_frame for ${reqsUrl}: ${JSON.stringify(mine('req', ev))}`);
        assert.equal(m.tabId, tabId, `${what} main_frame tab`);
        const i = mine('req', ev, pixelUrl).find((d) => d.type === 'image');
        assert.ok(i, `${what}: no image for ${pixelUrl}: ${JSON.stringify(mine('req', ev))}`);
        assert.equal(i.tabId, tabId, `${what} image tab`);
      }
      const named = (hs) => Array.isArray(hs) && hs.length > 0 && hs.every((h) => h && typeof h.name === 'string' && typeof h.value === 'string');
      const send = mine('req', 'send', pixelUrl)[0];
      assert.ok(named(send.headers), `onSendHeaders requestHeaders: ${JSON.stringify(send.headers)}`);
      assert.ok(send.headers.some((h) => /^user-agent$/i.test(h.name)), 'no User-Agent among the request headers');
      const resp = mine('req', 'resp', pixelUrl)[0];
      assert.ok(named(resp.headers), `onResponseStarted responseHeaders: ${JSON.stringify(resp.headers)}`);
      assert.ok(resp.headers.some((h) => /^content-type$/i.test(h.name) && /image\/png/.test(h.value)), 'no content-type among the response headers');
    });

    await check('webRequest: each request reaches a listener exactly once', async () => {
      await settled();
      for (const ev of ['before', 'send', 'resp'])
        for (const url of [reqsUrl, pixelUrl]) {
          const got = mine('req', ev, url);
          assert.equal(got.length, 1, `${ev} for ${url} came ${got.length} times: ${JSON.stringify(got)}`);
        }
    });

    await check('webRequest: a listener’s filter is honoured (types: image gets no main_frame, urls of another host get nothing)', async () => {
      await settled();
      const imgs = mine('req', 'imagesOnly');
      assert.ok(imgs.some((d) => d.url === pixelUrl), `the image listener got nothing for the image: ${JSON.stringify(imgs)}`);
      assert.deepEqual(imgs.filter((d) => d.type !== 'image'), [], 'the image listener got a request of another type');
      assert.equal(imgs.filter((d) => d.url === pixelUrl).length, 1, 'the image listener got the image more than once');
      assert.deepEqual(mine('req', 'otherHost'), [], 'the listener for another host got a request');
    });

    await check('webRequest: an extension without a host permission for the site gets none of its requests', async () => {
      await settled();
      const said2 = said.filter((s) => s.x === 'nohost' && s.event !== 'started');
      assert.deepEqual(said2, [], 'it heard requests');
    });

    await check(BLOCKER ? 'the ad blocker still blocks a request to a host on its list (through the hub), and lets another through' : 'without the blocker a request to the test ad host goes through', async () => {
      await settled();
      assert.equal(await tab.wc.executeJavaScript('__ok'), 'loaded', 'a request to a host that is not on the list failed');
      assert.equal(await tab.wc.executeJavaScript('__ad'), BLOCKER ? 'blocked' : 'loaded');
    });

    // Close what the first press made, so that the next presses see the tab you see.
    for (const [id, t] of [...conn.targets.entries()]) if (id !== targetId && t.wc && t.wc.getURL().includes('?made')) await cdp('Target.closeTarget', { targetId: id }).catch(() => {});
    assert.equal(await page(`hydorDesktop.browser.show(${JSON.stringify(targetId)}, {x:0,y:60,w:1280,h:760})`), true);

    const popupWindows = (x) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== win && w.webContents.getURL().startsWith(`chrome-extension://`) && w.webContents.getURL().includes(x));
    const runtimeId = (x) => {
      const e = ses.extensions.getAllExtensions().find((y) => y.name === NAME[x]);
      return e && e.id;
    };

    await check('a side-panel extension opens its panel as a pop-up window on a press, and the panel page’s tabs.query sees the shown tab', async () => {
      assert.equal(await press('panel'), true);
      const w = await until(() => popupWindows('panel.html')[0], 8000, 'the panel window');
      const text = await until(async () => {
        const t = await w.webContents.executeJavaScript('document.body.textContent').catch(() => '');
        return /tab: \d+/.test(t) && t;
      }, 8000, 'the panel page’s tabs.query');
      assert.match(text, new RegExp(`tab: ${tabId} url: ${reqsUrl.replace(/\./g, '\\.')}$`));
      // Pressing again closes it.
      assert.equal(await press('panel'), true);
      await until(() => popupWindows('panel.html').length === 0, 4000, 'the panel to close');
    });

    await check('an extension whose worker throws at start answers false to a press, and no hidden relay window is made for it', async () => {
      const id = runtimeId('broken');
      assert.ok(id, 'the broken extension is not loaded at all');
      assert.equal(await press('broken'), false);
      await sleep(1500);
      const relays = webContents.getAllWebContents().filter((w) => !w.isDestroyed() && w.getURL().includes('hydor-ext-relay') && w.getURL().includes(id));
      assert.equal(relays.length, 0, `relay pages: ${relays.map((w) => w.getURL()).join(', ')}`);
      const hidden = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== win && !w.isVisible() && w.webContents.getURL().includes(id));
      assert.equal(hidden.length, 0, `hidden windows: ${hidden.map((w) => w.webContents.getURL()).join(', ')}`);
    });

    await check('an extension with a default_popup opens it on a press, and pressing again closes it', async () => {
      assert.equal(await press('popup'), true);
      const w = await until(() => popupWindows('popup.html')[0], 8000, 'the popup window');
      assert.equal(await until(() => w.webContents.executeJavaScript('document.body.textContent').catch(() => ''), 8000, 'the popup page'), 'A popup\n');
      assert.equal(await press('popup'), true);
      await until(() => popupWindows('popup.html').length === 0, 4000, 'the popup to close');
    });

    await cdp('Browser.close').catch(() => {});
  };

  const watchdog = setTimeout(() => {
    console.log('FAIL (the check itself)\n     took more than 100 s');
    app.exit(1);
  }, 100_000);
  watchdog.unref();
  try {
    await test();
  } catch (e) {
    failed++;
    console.log(`FAIL (the check itself)\n     ${String((e && e.stack) || e)}`);
  }
  console.log(`\n${TAG}${ok} passed${failed ? `, ${failed} failed` : ''}`);
  site.close();
  proxy.close();
  // The same again with the ad blocker on, in a process of its own (its own profile too).
  if (!BLOCKER) {
    const code = await new Promise((resolve) => {
      const child = require('node:child_process').spawn(process.execPath, [process.argv[1], '--blocker', ...process.argv.slice(2).filter((a) => a !== '--blocker')], { stdio: 'inherit' });
      const t = setTimeout(() => (child.kill('SIGKILL'), resolve(1)), 110_000);
      child.on('exit', (c) => (clearTimeout(t), resolve(c === 0 ? 0 : 1)));
    });
    if (code !== 0) failed++;
  }
  setTimeout(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
    app.exit(failed ? 1 : 0);
  }, 200);
});
