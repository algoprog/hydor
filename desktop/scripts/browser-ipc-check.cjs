// What desktop/scripts/browser-selftest.mjs cannot see from the server's side: the window's. Run by Electron as its main script
// (desktop/scripts/browser-selftest.mjs does that, with a display). It stands in for the server (the same messages
// browser.cjs gets over the app's channel) and for the app's window (a real BrowserWindow with desktop/preload.cjs showing
// a page of its own origin), and checks through `window.hydorDesktop.browser`, as the web app uses it:
//   - an agent's tab (offscreen) sends frames, its cursor, takes your clicks, wheel, keys and text as real input (trusted),
//     and the server is told you typed;
//   - a pop-up of an agent's tab is an agent's tab too;
//   - your own tab (onscreen) is shown in the window where asked, moves, goes away with the window, is drawn there,
//     and still answers CDP while it is shown; its shortcuts reach the window's page, which hears when it takes the keys
//     and can take them back;
//   - `still` is a JPEG picture of a shown own tab in the screen's own pixels, however wide (and null for an agent's tab or
//     one that is not shown), and a resize of the
//     window moves a shown own tab at once, by its distance from the window's edges;
//   - what is not an own tab or an agent's tab here is refused, and a page that is not the app's own gets nothing;
//   - reveal (desktop/reveal.cjs, with a stand-in for the file manager) accepts a file or a folder anywhere on this computer, and
//     refuses a missing or relative path, a network path, and a page of another machine (/m/<id>/…);
//   - what people expect of a browser, for your own tab: zoom (keys and the preload), find with its match count, mute, the
//     larger list of shortcuts, the right-click menu's items for a link, a selection and a field (and what its items ask of
//     the app), full-screen video, opening in the default browser (refused but for http and https), clearing browsing data;
//   - the right-click menu drawn by the window's page in the app's own look: its items, the point and a picture of the tab
//     reach the page that draws menus, what it picks is done once (a stale or a stranger's pick is refused), and without
//     such a page the system's own menu shows; no Highlight for words in a frame, and a highlight inside a shadow root is found;
//   - the ad blocker: a request to a test ad host (a tiny list of its own, no network) fails while it is on, goes through when
//     it is off or the site is one you allowed ads on, the count of what a page had blocked reaches the window's page, and
//     the saved engine is kept a week, made again when older, and kept when the lists cannot be fetched.
//   - private tabs (a `hydorPrivate` context: your own real pages in a partition kept in memory, cookies apart from the normal
//     tabs', gone with the context; the menu's private items), pages shown dark (and kept dark across sites, except the ones
//     excepted), the sound policy of new tabs, a picture and a PDF of a page saved in Downloads, deleting one site's data, the
//     menu's video, audio and translation items, and the bubble that shows where a link goes.
'use strict';
const { app, BrowserWindow, Menu, clipboard, screen, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { createBrowser } = require('../browser.cjs');
const { createReveal } = require('../reveal.cjs');
const { createAdblock } = require('../adblock.cjs');

// The ad blocker's package is the server's (the repository's node_modules).
const ADBLOCK = path.resolve(__dirname, '../../node_modules/@ghostery/adblocker-electron');
const AD_HOST = 'ads.hydor-test.example';

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
let failed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    ok++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${String((e && e.message) || e).split('\n').join('\n     ')}`);
  }
};
const until = async (fn, ms = 5000, what = 'it') => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`${what} did not happen in ${ms} ms`);
    await sleep(50);
  }
};

// ---- the test site, and a proxy (the browser sends everything through one) ----
const pages = {
  '/app': '<!doctype html><title>app</title><body style="margin:0;background:#123"><script>window.__keys=[];hydorDesktop.browser.onKey((k)=>__keys.push(k));window.__states=[];hydorDesktop.browser.onTabState((s)=>__states.push(s));window.__cmds=[];hydorDesktop.browser.onCommand((c)=>__cmds.push(c));window.__pageFocus=[];hydorDesktop.browser.onPageFocus((p)=>__pageFocus.push(p));</script>',
  '/agent': `<!doctype html><title>agent page</title><body style="margin:0;height:3000px;background:linear-gradient(#fff,#8af)">
<button id=btn style="position:absolute;left:100px;top:100px;width:200px;height:60px">Click</button>
<input id=inp style="position:absolute;left:100px;top:200px;width:300px;height:40px">
<a id=pop href="javascript:void 0" onclick="window.open('/popped','p1');return false" style="position:absolute;left:100px;top:300px;display:block;width:100px;height:40px">pop</a>
<script>window.__log=[];window.__kd=[];
btn.onclick=(e)=>__log.push(['click',e.clientX,e.clientY,e.isTrusted]);
inp.onkeydown=(e)=>__kd.push(e.key);
inp.onkeypress=(e)=>__kd.push('press:'+e.key.charCodeAt(0));
document.onmousemove=()=>{};
</script>`,
  '/popped': '<!doctype html><title>popped</title><body style="margin:0;background:#fa8"><h1>popped</h1>',
  // A page of another machine the window shows (the Machines feature forwards its server under /m/<id>/).
  '/m/other/app': '<!doctype html><title>other machine</title><body>',
  '/own': '<!doctype html><title>own page</title><body style="margin:0;background:rgb(255,0,0)"><h1 style="color:#fff">mine</h1>',
  '/marked': '<!doctype html><title>marked</title><body style="margin:0"><p style="margin:0;padding:10px">plain <mark class="hydor-hl" data-hydor-hl="11111111-1111-1111-1111-111111111111" style="font-size:30px">marked words</mark> plain<p id="bad" style="margin:0;padding:10px"><mark data-hydor-hl="22222222-2222-2222-2222-222222222222">not ours</mark>',
  '/words': '<!doctype html><title>words</title><body style="margin:0"><p>alpha beta alpha gamma alpha</p>',
  // A page with a one-second video (a tiny WebM), and a link at the bottom left.
  // Sound that tries to play by itself: its play() answers whether the page's policy allows it.
  '/sound': '<!doctype html><title>sound</title><body><video id="v" src="/clip.webm" preload="auto"></video>',
  '/video': '<!doctype html><title>video</title><body style="margin:0"><video id="v" src="/clip.webm" width="320" height="180" muted style="display:block"></video><a id="lnk" href="/words" style="position:fixed;left:0;bottom:0;width:120px;height:30px;background:#ccc">link</a>',
  '/marked-shadow': '<!doctype html><title>marked shadow</title><body style="margin:0"><div id="host"></div><script>host.attachShadow({ mode: "open" }).innerHTML = \'<p style="margin:0;padding:10px">plain <mark class="hydor-hl" data-hydor-hl="33333333-3333-3333-3333-333333333333" style="font-size:30px">marked words</mark></p>\'</script>',
  // A page with an ad: a request to a host that is on the test list. Blocked it fails; otherwise the proxy answers it.
  '/ads': `<!doctype html><title>ads</title><body style="margin:0"><p>a page</p><script>window.__ad='waiting';fetch('http://${AD_HOST}/px.js',{mode:'no-cors'}).then(()=>{window.__ad='loaded'},()=>{window.__ad='blocked'})</script>`,
};
// A one-pixel PNG, served at /photo-of-cat.png (and what its request said of the page it came from).
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let lastReferer = '';
const CLIP = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAYIEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggGETbuMU6uEHFO7a1OsggXy7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECPgAAAAAAAFlSua0CmrgEAAAAAAAA414EBc8WI/sDXPObDWxecgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QF9eEA4ImwgUC6gTCagQKuAQAAAAAAAFzXgQJzxYjb9MsGa/o/YZyBACK1nIN1bmSIgQCGhkFfT1BVU1aqg2MuoFa7hATEtACDgQLhkZ+BAbWIQM9AAAAAAABiZIEQY6KTT3B1c0hlYWQBATgBgD4AAAAAABJUw2dA1nNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjAuMTYuMTAwc3PWY8CLY8WI/sDXPObDWxdnyKFFo4dFTkNPREVSRIeUTGF2YzYwLjMxLjEwMiBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAxLjAwMDAwMDAwMABzc9djwItjxYjb9MsGa/o/YWfIokWjh0VOQ09ERVJEh5VMYXZjNjAuMzEuMTAyIGxpYm9wdXNnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAxLjAwODAwMDAwMAAfQ7Z1Q4zngQCji4IAAIAIC+S5oLyEo8KBAACAkAMAnQEqQAAwAABHCIWFiIWEiAICAnWqA/gD+gIHO3nizzMeXgD+/W7z/+OZNzDE/45t//FhPA4oyP/xUQCjioIAFYAIB8azDsajioIAKYAIB8azDsajioIAPYAIB8azDsajioIAUYAIB8azDsajioIAZYAIB8azDsajloEAZADRAQABEBAAGAAYWC/0AAiMAACjioIAeYAIB8azDsajioIAjYAIB8azDsajioIAoYAIB8azDsajioIAtYAIB8azDsajioIAyYAIB8azDsajloEAyADRAQABEBAAGAAYWC/0AAiMAACjioIA3YAIB8azDsajioIA8YAIB8azDsajioIBBYAIB8azDsajioIBGYAIB8azDsajioIBLYAIB8azDsajloEBLADRAQABEBAAGAAYWC/0AAiMAACjioIBQYAIB8azDsajioIBVYAIB8azDsajioIBaYAIB8azDsajioIBfYAIB8azDsajioIBkYAIB8azDsajloEBkADRAQABEBAAGAAYWC/0AAiMAACjioIBpYAIB8azDsajioIBuYAIB8azDsajioIBzYAIB8azDsajioIB4YAIB8azDsajioIB9YAIB8azDsajloEB9ADRAQABEBAAGAAYWC/0AAiMAACjioICCYAIB8azDsajioICHYAIB8azDsajioICMYAIB8azDsajioICRYAIB8azDsajioICWYAIB8azDsajloECWADRAQABEBAAGAAYWC/0AAiMAACjioICbYAIB8azDsajioICgYAIB8azDsajioIClYAIB8azDsajioICqYAIB8azDsajioICvYAIB8azDsajlYECvACxAQABEBAUYABhYL/QACIwAKOKggLRgAgHxrMOxqOKggLlgAgHxrMOxqOKggL5gAgHxrMOxqOKggMNgAgHxrMOxqOKggMhgAgHxrMOxqOWgQMgANEBAAEQEAAYABhYL/QACIwAAKOKggM1gAgHxrMOxqOKggNJgAgHxrMOxqOKggNdgAgHxrMOxqOKggNxgAgHxrMOxqOKggOFgAgHxrMOxqOWgQOEANEBAAEQEAAYABhYL/QACIwAAKOKggOZgAgHxrMOxqOKggOtgAgHxrMOxqOKggPBgAgHxrMOxqOKggPVgAgHxrMOxqCToYqCA+kACAfGsw7GdaKEAM3+YBxTu2uRu4+zgQC3iveBAfGCAmDwgRA=', 'base64');
const site = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/clip.webm') {
    res.writeHead(200, { 'content-type': 'video/webm', 'content-length': CLIP.length });
    return void res.end(CLIP);
  }
  if (req.url.split('?')[0] === '/photo-of-cat.png') {
    lastReferer = String(req.headers.referer || '');
    res.writeHead(200, { 'content-type': 'image/png' });
    return void res.end(Buffer.from(PNG_B64, 'base64'));
  }
  const body = pages[req.url.split('?')[0]];
  if (!body) return void (res.writeHead(404), res.end('nf'));
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(body);
});
let sitePort = 0;
// Absolute-URL requests (as a browser sends to a proxy) go on to the site.
const proxy = http.createServer((req, res) => {
  const u = new URL(req.url);
  const up = http.request({ host: '127.0.0.1', port: sitePort, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: u.host } }, (r) => (res.writeHead(r.statusCode, r.headers), r.pipe(res)));
  up.on('error', () => (res.writeHead(502), res.end()));
  req.pipe(up);
});
proxy.on('connect', (req, sock) => {
  const up = net.connect(sitePort, '127.0.0.1', () => (sock.write('HTTP/1.1 200 OK\r\n\r\n'), up.pipe(sock), sock.pipe(up)));
  up.on('error', () => sock.destroy());
  sock.on('error', () => up.destroy());
});
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));

app.whenReady().then(async () => {
  sitePort = await listen(site);
  const proxyPort = await listen(proxy);
  // The pages are the app's own when they come from the origin of "the server".
  const appOrigin = `http://127.0.0.1:${sitePort}`;

  // ---- the server's side: browser.cjs's messages, and a small CDP client ----
  const toServerLog = [];
  const waiters = [];
  const CONN = 'c1';
  let win = null;
  let seq = 0;
  const pending = new Map();
  const events = [];
  const toServer = (m) => {
    toServerLog.push(m);
    if (m.type === 'cdp') {
      const msg = JSON.parse(m.data);
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (p) msg.error ? p.reject(new Error(`${msg.error.code} ${msg.error.message}`)) : p.resolve(msg.result);
      } else {
        events.push(msg);
        for (const w of [...waiters]) if (w.method === msg.method && (!w.pred || w.pred(msg))) (waiters.splice(waiters.indexOf(w), 1), w.resolve(msg));
      }
    }
  };
  const browser = createBrowser({
    log: (...a) => console.log('  [browser]', ...a),
    toServer,
    mainWindow: () => win,
    fromOwnPage: (e) => (e.senderFrame && e.senderFrame.url ? new URL(e.senderFrame.url).origin === appOrigin : false),
    ext: null,
    // A tiny list of its own: nothing is fetched.
    adblock: { dir: path.join(os.tmpdir(), `hydor-ipc-adblock-${process.pid}`), modulePath: () => ADBLOCK, engine: require(ADBLOCK).ElectronBlocker.parse(`||${AD_HOST}^\n`) },
  });
  browser.registerIpc();
  // Reveal as main.cjs wires it (its fromThisMachine: the app's origin, and not a /m/ page), with a stand-in for the system's file manager.
  const revealed = [];
  const fromThisMachine = (e) => {
    if (!e.senderFrame || !e.senderFrame.url) return false;
    const u = new URL(e.senderFrame.url);
    return u.origin === appOrigin && !/^\/m\//.test(u.pathname);
  };
  createReveal({ fromOwnPage: fromThisMachine, show: (real) => revealed.push(real) }).registerIpc();
  const cdp = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      browser.message({ type: 'cdp', conn: CONN, data: JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) });
      setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(`${method} timed out`))), 20_000).unref();
    });
  const waitEvent = (method, pred, ms = 8000) => {
    const old = events.find((m) => m.method === method && (!pred || pred(m)));
    if (old) return Promise.resolve(old);
    return new Promise((resolve, reject) => {
      const w = { method, pred, resolve };
      waiters.push(w);
      setTimeout(() => waiters.includes(w) && (waiters.splice(waiters.indexOf(w), 1), reject(new Error(`no ${method} in ${ms} ms`))), ms).unref();
    });
  };
  const evalIn = async (sid, expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  /** A tab the way the server makes one: created, set up, resumed, loaded. */
  const openTab = async (url, params = {}) => {
    const mark = events.length;
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', ...params });
    const attached = events.slice(mark).find((m) => m.method === 'Target.attachedToTarget' && m.params.targetInfo.targetId === targetId);
    assert.ok(attached, 'no attachedToTarget before the answer');
    const sid = attached.params.sessionId;
    await cdp('Page.enable', {}, sid);
    await cdp('Runtime.runIfWaitingForDebugger', {}, sid);
    const loaded = waitEvent('Page.loadEventFired', (m) => m.sessionId === sid && events.indexOf(m) >= mark);
    await cdp('Page.navigate', { url }, sid);
    await loaded;
    return { targetId, sid };
  };

  const test = async () => {
    const { product, userAgent } = await browser.launch({ conn: CONN, profile: 'browsing', proxy: proxyPort, extensions: [] });
    assert.match(product, /^Chrome\/\d+/);
    assert.doesNotMatch(userAgent, /Electron/);
    await cdp('Target.setDiscoverTargets', { discover: true });
    await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await cdp('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: path.join(os.tmpdir(), 'hydor-ipc-dl'), eventsEnabled: true });

    // The window: a real one with the app's preload, showing a page of the app's own origin.
    win = new BrowserWindow({ width: 1280, height: 860, show: true, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: process.env.HYDOR_PRELOAD } });
    await win.loadURL(`${appOrigin}/app`);
    const page = (expr) => win.webContents.executeJavaScript(expr, true);

    let agent;
    await check('an agent’s tab in your own browsing is an offscreen page; the page gets the API', async () => {
      assert.equal(await page('typeof hydorDesktop.browser.watch'), 'function');
      agent = await openTab(`${appOrigin}/agent`, { hydorAgent: true });
      // The server sets each page's size (a desktop one is 1280 by 800) and scale.
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, agent.sid);
      const t = browser.conns.get(CONN).targets.get(agent.targetId);
      assert.ok(t.offscreen && t.wc.isOffscreen());
      assert.equal(await evalIn(agent.sid, 'document.title'), 'agent page');
      // Offscreen it draws wherever it is: a screenshot comes back though no window shows it.
      const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 50 }, agent.sid);
      assert.ok(shot.data.length > 500);
    });

    await check('watch gives frames about 30 a second, one at once, a JPEG of the page’s size', async () => {
      await page(`window.__frames=[];window.__cursors=[];hydorDesktop.browser.watch(${JSON.stringify(agent.targetId)}, (f)=>__frames.push({ab: f.jpeg instanceof ArrayBuffer, n: f.jpeg.byteLength, sig: Array.from(new Uint8Array(f.jpeg).slice(0,2)), w: f.w, h: f.h, t: Date.now()}), (c)=>__cursors.push(c)).then((stop)=>{window.__stop=stop;return !!stop})`);
      await until(() => page('typeof __stop === "function"'), 3000, 'the watch');
      await until(() => page('__frames.length >= 1'), 3000, 'the first frame');
      const first = (await page('__frames[0]'));
      assert.ok(first.ab && first.n > 500, JSON.stringify(first));
      assert.deepEqual(first.sig, [0xff, 0xd8]);
      assert.deepEqual([first.w, first.h], [1280, 800], 'the size the server set');
      // The page animates only when something changes: make it change, then count.
      await evalIn(agent.sid, `window.__tick=setInterval(()=>{document.body.style.background='hsl('+(Date.now()/10%360)+',80%,80%)'},16);1`);
      const before = (await page('__frames.length'));
      await sleep(1500);
      const got = (await page('__frames.length')) - before;
      await evalIn(agent.sid, 'clearInterval(window.__tick);1');
      assert.ok(got >= 15 && got <= 50, `${got} frames in 1.5 s`);
      assert.ok((await page('__cursors.length')) >= 1, 'no cursor');
      assert.equal(browser.conns.get(CONN).targets.get(agent.targetId).wc.getFrameRate(), 30);
    });

    await check('input: a click, text and keys reach the agent’s page as real (trusted) input, and the server hears that you typed', async () => {
      const mark = toServerLog.length;
      const sent = await page(`hydorDesktop.browser.input(${JSON.stringify(agent.targetId)}, [{t:'mouse',type:'move',x:0.1,y:0.15},{t:'mouse',type:'down',x:0.1,y:0.15},{t:'mouse',type:'up',x:0.1,y:0.15}])`);
      assert.equal(sent, true);
      const log = JSON.parse(await until(async () => {
        const v = await evalIn(agent.sid, 'JSON.stringify(__log)');
        return v !== '[]' && v;
      }, 3000, 'the click'));
      // x 0.1 of 1280 = 128, y 0.15 of 800 = 120; real input, so trusted.
      assert.deepEqual(log, [['click', 128, 120, true]]);
      assert.ok(!toServerLog.slice(mark).some((m) => m.type === 'browser-input' && m.typed), 'a click is not typing');
      assert.ok(toServerLog.slice(mark).some((m) => m.type === 'browser-input' && m.conn === CONN && m.target === agent.targetId));
      // Into the field: a click, text typed key by key, a key for itself, and a pasted text.
      const key = (k, text) => [{ t: 'key', type: 'down', key: k, ...(text ? { text } : {}) }, { t: 'key', type: 'up', key: k }];
      const events = [{ t: 'mouse', type: 'down', x: 0.15, y: 0.275 }, { t: 'mouse', type: 'up', x: 0.15, y: 0.275 }, ...key('h', 'h'), ...key('i', 'i'), { t: 'text', text: ' thére ω' }, ...key('Backspace')];
      const m2 = toServerLog.length;
      await page(`hydorDesktop.browser.input(${JSON.stringify(agent.targetId)}, ${JSON.stringify(events)})`);
      const value = await until(async () => {
        const v = await evalIn(agent.sid, 'inp.value');
        return v === 'hi thére ' && v;
      }, 3000, 'the typing').catch(async (e) => {
        throw new Error(`${e.message}: value ${JSON.stringify(await evalIn(agent.sid, 'inp.value'))}, keys ${JSON.stringify(await evalIn(agent.sid, '__kd'))}`);
      });
      assert.equal(value, 'hi thére ');
      assert.ok(toServerLog.slice(m2).some((m) => m.type === 'browser-input' && m.typed === true), 'the server was not told you typed');
      assert.deepEqual((await evalIn(agent.sid, '__kd')).filter((k) => !k.startsWith('press')).slice(0, 2), ['h', 'i']);
    });

    await check('input: Enter submits (a key and its character), the wheel scrolls down for a positive dy', async () => {
      await evalIn(agent.sid, `window.__enter=[];inp.addEventListener('keydown',(e)=>{if(e.key==='Enter')__enter.push('down')});inp.addEventListener('keypress',(e)=>{if(e.key==='Enter')__enter.push('press')});1`);
      await page(`hydorDesktop.browser.input(${JSON.stringify(agent.targetId)}, [{t:'key',type:'down',key:'Enter'},{t:'key',type:'up',key:'Enter'}])`);
      await until(async () => (await evalIn(agent.sid, '__enter.length')) >= 2, 3000, 'Enter').catch(async () => {
        throw new Error(`Enter gave ${JSON.stringify(await evalIn(agent.sid, '__enter'))}`);
      });
      await page(`hydorDesktop.browser.input(${JSON.stringify(agent.targetId)}, [{t:'wheel',x:0.5,y:0.5,dx:0,dy:300}])`);
      await until(async () => (await evalIn(agent.sid, 'scrollY')) > 50, 3000, 'the page to scroll down');
      await page(`hydorDesktop.browser.input(${JSON.stringify(agent.targetId)}, [{t:'wheel',x:0.5,y:0.5,dx:0,dy:-5000}])`);
      await until(async () => (await evalIn(agent.sid, 'scrollY')) === 0, 3000, 'the page to scroll back up');
    });

    await check('edit: select all and copy work in the agent’s page', async () => {
      await evalIn(agent.sid, 'inp.focus();1');
      await page(`hydorDesktop.browser.edit(${JSON.stringify(agent.targetId)}, 'selectAll')`);
      assert.equal(await evalIn(agent.sid, 'inp.selectionEnd - inp.selectionStart'), 'hi thére '.length);
    });

    await check('a pop-up of an agent’s tab is an offscreen tab of its own, with its opener', async () => {
      const mark = events.length;
      await page(`hydorDesktop.browser.input(${JSON.stringify(agent.targetId)}, [{t:'mouse',type:'down',x:0.1,y:0.4},{t:'mouse',type:'up',x:0.1,y:0.4}])`);
      const att = await waitEvent('Target.attachedToTarget', (m) => events.indexOf(m) >= mark && m.params.targetInfo.openerId === agent.targetId);
      const popup = att.params;
      assert.equal(popup.targetInfo.type, 'page');
      const t = browser.conns.get(CONN).targets.get(popup.targetInfo.targetId);
      assert.ok(t.offscreen && t.wc.isOffscreen(), 'the pop-up is not drawn off screen');
      await cdp('Page.enable', {}, popup.sessionId);
      await cdp('Runtime.runIfWaitingForDebugger', {}, popup.sessionId);
      await until(async () => (await evalIn(popup.sessionId, 'document.title')) === 'popped', 5000, 'the pop-up to load');
      const shot = await cdp('Page.captureScreenshot', { format: 'jpeg' }, popup.sessionId).catch(async (e) => {
        throw new Error(`${e.message}: ${JSON.stringify({ size: await evalIn(popup.sessionId, '[innerWidth,innerHeight,document.visibilityState]'), frame: t.frame && t.frame.getSize(), bounds: t.view.getBounds(), parent: !!t.view.parent })} raf ${await Promise.race([evalIn(popup.sessionId, 'new Promise(r=>requestAnimationFrame(()=>r(1)))'), sleep(1500).then(() => 'never')])}`);
      });
      assert.ok(shot.data.length > 500);
      await cdp('Target.closeTarget', { targetId: popup.targetInfo.targetId });
      assert.ok(events.some((m) => m.method === 'Target.detachedFromTarget' && m.params.targetId === popup.targetInfo.targetId));
    });

    await check('stopping the watch ends the frames and slows the page', async () => {
      await page('__stop();1');
      await sleep(400);
      const n = await page('__frames.length');
      await evalIn(agent.sid, `document.body.style.background='#fed';1`);
      await sleep(600);
      assert.equal(await page('__frames.length'), n);
      await until(() => browser.conns.get(CONN).targets.get(agent.targetId).wc.getFrameRate() === 10, 2000, 'the frame rate');
    });

    let own;
    await check('your own tab is a page; shown in the window it is laid where asked and drawn there', async () => {
      own = await openTab(`${appOrigin}/own`);
      const t = browser.conns.get(CONN).targets.get(own.targetId);
      assert.ok(!t.offscreen && !t.wc.isOffscreen());
      assert.equal(await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:100,y:80,w:640,h:400})`), true);
      assert.deepEqual(t.view.getBounds(), { x: 100, y: 80, width: 640, height: 400 });
      assert.ok(win.contentView.children.includes(t.view), 'not in the window');
      await sleep(700);
      // Drawn where it is shown: its own picture is the size of the place, and red.
      const img = await t.wc.capturePage();
      const { width, height } = img.getSize();
      assert.deepEqual([width, height], [640, 400]);
      assert.deepEqual(Array.from(img.toBitmap().subarray(((height >> 1) * width + (width >> 1)) * 4, ((height >> 1) * width + (width >> 1)) * 4 + 3)).reverse(), [255, 0, 0], 'the page is not drawn');
      // Moves with the place it is asked for.
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:10,y:20,w:300,h:200})`);
      assert.deepEqual(t.view.getBounds(), { x: 10, y: 20, width: 300, height: 200 });
      // CDP works on it while it is shown.
      assert.equal(await evalIn(own.sid, 'document.title'), 'own page');
      const shot = await cdp('Page.captureScreenshot', { format: 'png' }, own.sid);
      assert.ok(shot.data.length > 200);
    });

    await check('hide takes it away; the window hiding does too, and showing the window puts it back', async () => {
      const t = browser.conns.get(CONN).targets.get(own.targetId);
      await page(`hydorDesktop.browser.hide(${JSON.stringify(own.targetId)})`);
      assert.ok(!win.contentView.children.includes(t.view));
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:50,y:60,w:400,h:300})`);
      assert.ok(win.contentView.children.includes(t.view));
      win.hide();
      await sleep(200);
      assert.ok(!win.contentView.children.includes(t.view), 'still in a hidden window');
      win.show();
      await sleep(300);
      assert.ok(win.contentView.children.includes(t.view), 'did not come back');
      assert.deepEqual(t.view.getBounds(), { x: 50, y: 60, width: 400, height: 300 });
      // A zero place is the same as hide.
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:0,y:0,w:0,h:0})`);
      assert.ok(!win.contentView.children.includes(t.view));
    });

    await check('still: a JPEG picture of a shown own tab (the size of its place), null for an agent’s tab, a parked tab and a stranger’s page', async () => {
      const t = browser.conns.get(CONN).targets.get(own.targetId);
      const id = JSON.stringify(own.targetId);
      await page(`hydorDesktop.browser.show(${id}, {x:50,y:60,w:400,h:300})`);
      await sleep(500);
      const url = await page(`hydorDesktop.browser.still(${id})`);
      assert.equal(typeof url, 'string');
      assert.match(url, /^data:image\/jpeg;base64,/);
      const bytes = Buffer.from(url.slice('data:image/jpeg;base64,'.length), 'base64');
      assert.ok(bytes.length > 300, 'an empty picture');
      assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xd8], 'not a JPEG');
      const { nativeImage, screen } = require('electron');
      // In the screen's own pixels (twice the place's on a Retina screen), or the window blurs it stretching it back.
      const scale = screen.getDisplayMatching(win.getBounds()).scaleFactor;
      const sizeOf = (u) => {
        const s = nativeImage.createFromDataURL(u).getSize();
        return [s.width, s.height];
      };
      const img = nativeImage.createFromDataURL(url);
      assert.deepEqual(sizeOf(url), [Math.ceil(400 * scale), Math.ceil(300 * scale)]);
      // It is the page (red), not a blank.
      const bm = img.toBitmap();
      const [bw, bh] = sizeOf(url);
      const at = (Math.floor(bh / 2) * bw + Math.floor(bw / 2)) * 4;
      assert.ok(bm[at + 2] > 200 && bm[at + 1] < 60 && bm[at] < 60, 'the picture is not of the page');
      // A page as wide as the window is not made smaller either (it was cut to 1920 pixels, blurred on a Retina screen).
      await page(`hydorDesktop.browser.show(${id}, {x:20,y:40,w:1240,h:800})`);
      await sleep(500);
      const wide = await page(`hydorDesktop.browser.still(${id})`);
      assert.deepEqual(sizeOf(wide), [Math.ceil(1240 * scale), Math.ceil(800 * scale)]);
      await page(`hydorDesktop.browser.show(${id}, {x:50,y:60,w:400,h:300})`);
      await sleep(300);
      // An agent's tab has no place in the window: nothing to take a picture of.
      assert.equal(await page(`hydorDesktop.browser.still(${JSON.stringify(agent.targetId)})`), null);
      assert.equal(await page(`hydorDesktop.browser.still('NOSUCHTARGET')`), null);
      // Taken away, there is no picture to take either; the window's page can have taken it just before.
      await page(`hydorDesktop.browser.hide(${id})`);
      assert.equal(await page(`hydorDesktop.browser.still(${id})`), null);
      // A page of another origin gets nothing (the preload lets it call, main refuses).
      await page(`hydorDesktop.browser.show(${id}, {x:50,y:60,w:400,h:300})`);
      const other = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: process.env.HYDOR_PRELOAD } });
      await other.loadURL(`http://localhost:${sitePort}/app`);
      assert.equal(await other.webContents.executeJavaScript(`hydorDesktop.browser.still(${id})`), null);
      other.destroy();
      assert.ok(t.shownIn === win);
    });

    await check('resizing the window moves a shown page at once, by its distance from the window’s edges; unchanged places set nothing', async () => {
      const t = browser.conns.get(CONN).targets.get(own.targetId);
      const id = JSON.stringify(own.targetId);
      win.setContentSize(1280, 860);
      await sleep(300);
      await page(`hydorDesktop.browser.show(${id}, {x:50,y:60,w:400,h:300})`);
      const [cw, ch] = win.getContentSize();
      // Insets: 50 left, 60 top, the rest right and below.
      const right = cw - 450;
      const bottom = ch - 360;
      // Asking for the same place again changes nothing: no setBounds, and the view is neither removed nor added again.
      let sets = 0;
      let adds = 0;
      let removes = 0;
      const setBounds = t.view.setBounds.bind(t.view);
      const add = win.contentView.addChildView.bind(win.contentView);
      const remove = win.contentView.removeChildView.bind(win.contentView);
      t.view.setBounds = (b) => (sets++, setBounds(b));
      win.contentView.addChildView = (...a) => (adds++, add(...a));
      win.contentView.removeChildView = (...a) => (removes++, remove(...a));
      try {
        await page(`hydorDesktop.browser.show(${id}, {x:50,y:60,w:400,h:300})`);
        await page(`hydorDesktop.browser.show(${id}, {x:50,y:60,w:400,h:300})`);
        assert.deepEqual([sets, adds, removes], [0, 0, 0], 'the same place set again');
        // The window gets smaller: the page follows, with nothing from the window's page.
        const resized = new Promise((r) => win.once('resize', r));
        win.setContentSize(cw - 200, ch - 150);
        await Promise.race([resized, sleep(2000)]);
        const [w2, h2] = win.getContentSize();
        assert.ok(w2 !== cw || h2 !== ch, 'the window did not change size');
        await until(() => t.view.getBounds().width === w2 - 50 - right, 2000, 'the page to follow the width');
        assert.deepEqual(t.view.getBounds(), { x: 50, y: 60, width: w2 - 50 - right, height: h2 - 60 - bottom });
        assert.equal(adds + removes, 0, 'the page was taken out of the window and added again');
        assert.ok(sets >= 1 && sets <= 4, `set ${sets} times for one resize`);
        // Larger again.
        win.setContentSize(cw, ch);
        await until(() => t.view.getBounds().width === cw - 50 - right, 2000, 'the page to follow back');
        assert.deepEqual(t.view.getBounds(), { x: 50, y: 60, width: 400, height: 300 });
      } finally {
        t.view.setBounds = setBounds;
        win.contentView.addChildView = add;
        win.contentView.removeChildView = remove;
      }
    });

    await check('focus, and the shortcuts a page you use keeps from its page reach the window’s page', async () => {
      const t = browser.conns.get(CONN).targets.get(own.targetId);
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:50,y:60,w:400,h:300})`);
      await page(`hydorDesktop.browser.focus(${JSON.stringify(own.targetId)})`);
      let prevented = 0;
      const press = (input) => t.wc.emit('before-input-event', { preventDefault: () => prevented++ }, { type: 'keyDown', control: false, meta: false, alt: false, shift: false, ...input });
      press({ key: 't', control: true });
      press({ key: 'ArrowLeft', alt: true });
      press({ key: 'F5' });
      press({ key: 'a', control: true });
      assert.equal(prevented, 3, 'ctrl+A must stay with the page');
      await until(async () => (await page('__keys.length')) === 3, 2000, 'the keys');
      assert.deepEqual((await page('__keys')).map((k) => [k.key, k.ctrl, k.alt]), [['t', true, false], ['ArrowLeft', false, true], ['F5', false, false]]);
    });

    await check('the keys: your tab taking them tells the window’s page, which takes them back for a shortcut such as ⌘L', async () => {
      const t = browser.conns.get(CONN).targets.get(own.targetId);
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:50,y:60,w:400,h:300})`);
      win.webContents.focus();
      await until(() => win.webContents.isFocused(), 2000, 'the window’s page to have the keys');
      const told = await page('__pageFocus.length');
      await page(`hydorDesktop.browser.focus(${JSON.stringify(own.targetId)})`);
      await until(() => t.wc.isFocused(), 2000, 'the tab to have the keys');
      await until(async () => (await page('__pageFocus.length')) > told, 2000, 'the window’s page to be told');
      assert.equal((await page('__pageFocus')).at(-1).target, own.targetId);
      assert.equal(await page('document.hasFocus()'), false);
      assert.equal(await page('hydorDesktop.browser.focusApp()'), true);
      await until(() => win.webContents.isFocused(), 2000, 'the window’s page to take the keys back');
      assert.equal(t.wc.isFocused(), false);
      assert.equal(await page('document.hasFocus()'), true);
      assert.equal(await page('__pageFocus.length'), told + 1, 'giving the keys back is not your tab taking them');
    });

    await check('what is not that kind of tab here is refused: an agent’s tab cannot be shown, an own tab not watched, a stranger’s page gets nothing', async () => {
      assert.equal(await page(`hydorDesktop.browser.show(${JSON.stringify(agent.targetId)}, {x:0,y:0,w:100,h:100})`), false);
      assert.equal(await page(`hydorDesktop.browser.watch(${JSON.stringify(own.targetId)}, ()=>{})`), null);
      assert.equal(await page(`hydorDesktop.browser.watch('NOSUCHTARGET', ()=>{})`), null);
      assert.equal(await page(`hydorDesktop.browser.popup('abcdefghijklmnopabcdefghijklmnop', {x:0,y:0,w:10,h:10})`), false);
      assert.equal(await page(`hydorDesktop.browser.showFile('/etc/hostname')`), false);
      assert.equal(await page(`hydorDesktop.browser.showFile(${JSON.stringify(path.join(os.homedir(), 'no-such-file'))})`), false);
      // A page of another origin (the same address on the other loopback name) has no bridge at all.
      const other = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: process.env.HYDOR_PRELOAD } });
      await other.loadURL(`http://localhost:${sitePort}/app`);
      assert.equal(await other.webContents.executeJavaScript('typeof hydorDesktop'), 'object', 'localhost is an own origin to the preload');
      const stranger = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: process.env.HYDOR_PRELOAD } });
      await stranger.loadURL('data:text/html,<title>x</title>');
      assert.equal(await stranger.webContents.executeJavaScript('typeof hydorDesktop'), 'undefined');
      // The preload lets a page on another loopback name in, but main checks the server's origin: localhost is not 127.0.0.1.
      assert.equal(await other.webContents.executeJavaScript(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:0,y:0,w:100,h:100})`), false);
      assert.equal(await other.webContents.executeJavaScript('hydorDesktop.browser.focusApp()'), false);
      other.destroy();
      stranger.destroy();
    });


    await check('reveal shows a file or a folder of this computer in the file manager, and nothing else', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-ipc-reveal-'));
      try {
        const file = path.join(dir, 'a file.txt');
        fs.writeFileSync(file, 'x');
        const link = path.join(dir, 'link');
        fs.symlinkSync(file, link);
        assert.equal(await page('typeof hydorDesktop.reveal'), 'function');
        const reveal = (p) => page(`hydorDesktop.reveal(${JSON.stringify(p)})`);
        // A file and a folder, outside the home folder too; a link is shown as the file it points to.
        assert.equal(await reveal(file), true);
        assert.equal(await reveal(dir), true);
        assert.equal(await reveal(link), true);
        assert.deepEqual(revealed, [fs.realpathSync.native(file), fs.realpathSync.native(dir), fs.realpathSync.native(file)]);
        // Not there, not absolute, a network path, not a path.
        revealed.length = 0;
        assert.equal(await reveal(path.join(dir, 'no-such-file')), false);
        assert.equal(await reveal('a file.txt'), false);
        assert.equal(await reveal('../' + path.basename(dir)), false);
        assert.equal(await reveal(''), false);
        assert.equal(await reveal('\\\\server\\share\\file.txt'), false);
        assert.equal(await reveal('//server/share/file.txt'), false);
        assert.equal(await page('hydorDesktop.reveal({})'), false);
        assert.equal(revealed.length, 0, 'something was shown that should not be');
        // A page of another machine (/m/<id>/…) has the bridge, but its paths are not this computer's.
        const other = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: process.env.HYDOR_PRELOAD } });
        await other.loadURL(`${appOrigin}/m/other/app`);
        assert.equal(await other.webContents.executeJavaScript(`hydorDesktop.reveal(${JSON.stringify(file)})`), false);
        other.destroy();
        // A page that is not the app's own (the same address on the other loopback name) is refused too.
        const named = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: process.env.HYDOR_PRELOAD } });
        await named.loadURL(`http://localhost:${sitePort}/app`);
        assert.equal(await named.webContents.executeJavaScript(`hydorDesktop.reveal(${JSON.stringify(file)})`), false);
        named.destroy();
        assert.equal(revealed.length, 0, 'a refused page got something shown');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });


    // ---- what people expect of a browser ----
    const states = async () => JSON.parse(await page('JSON.stringify(__states)'));
    const stateFor = async (target, pred) => (await states()).find((s) => s.target === target && pred(s));
    /** Your own tab goes to an address and has loaded it. */
    const goTo = async (tab, url) => {
      const mark = events.length;
      const loaded = waitEvent('Page.loadEventFired', (m) => m.sessionId === tab.sid && events.indexOf(m) >= mark);
      await cdp('Page.navigate', { url }, tab.sid);
      await loaded;
    };
    const ownT = () => browser.conns.get(CONN).targets.get(own.targetId);
    const press = (input) => {
      let prevented = false;
      ownT().wc.emit('before-input-event', { preventDefault: () => (prevented = true) }, { type: 'keyDown', control: false, meta: false, alt: false, shift: false, ...input });
      return prevented;
    };
    const MAC = process.platform === 'darwin';
    const ctrl = (input) => ({ ...(MAC ? { meta: true } : { control: true }), ...input });

    await check('zoom: in, out and reset go by Chrome’s steps (the preload and the keys), and the window’s page is told', async () => {
      await goTo(own, `${appOrigin}/own`);
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:50,y:60,w:400,h:300})`);
      const t = ownT();
      // Chromium keeps the zoom as a level (a power of 1.2), so its factor is a hair off the step.
      const factor = () => Math.round(t.wc.getZoomFactor() * 100) / 100;
      assert.equal(await page(`hydorDesktop.browser.zoom(${JSON.stringify(own.targetId)}, 'in')`), 1.1);
      assert.equal(await page(`hydorDesktop.browser.zoom(${JSON.stringify(own.targetId)}, 'in')`), 1.25);
      assert.equal(factor(), 1.25);
      assert.equal(await page(`hydorDesktop.browser.zoom(${JSON.stringify(own.targetId)}, 'out')`), 1.1);
      await until(() => stateFor(own.targetId, (s) => s.zoom === 1.25), 2000, 'the zoom news');
      assert.equal(await page(`hydorDesktop.browser.zoom(${JSON.stringify(own.targetId)}, 'reset')`), 1);
      // Ctrl or ⌘ with + − 0 are the app's: they zoom and do not reach the window's page.
      const keys = (await page('__keys.length'));
      assert.ok(press(ctrl({ key: '=' })));
      assert.equal(factor(), 1.1);
      assert.ok(press(ctrl({ key: '+', shift: true })));
      assert.equal(factor(), 1.25);
      assert.ok(press(ctrl({ key: '-' })));
      assert.ok(press(ctrl({ key: '-' })));
      assert.equal(factor(), 1);
      assert.ok(press(ctrl({ key: '-' })));
      assert.equal(factor(), 0.9);
      assert.ok(press(ctrl({ key: '0' })));
      assert.equal(factor(), 1);
      for (let i = 0; i < 30; i++) await page(`hydorDesktop.browser.zoom(${JSON.stringify(own.targetId)}, 'in')`);
      assert.equal(factor(), 5, 'at most 500 %');
      await page(`hydorDesktop.browser.zoom(${JSON.stringify(own.targetId)}, 'reset')`);
      assert.equal(await page('__keys.length'), keys);
      // A page that is not one of your tabs: 100 %.
      assert.equal(await page(`hydorDesktop.browser.zoom(${JSON.stringify(agent.targetId)}, 'in')`), 1);
    });

    await check('the larger list of shortcuts reaches the window’s page, and the rest stays with the page', async () => {
      const before = await page('__keys.length');
      const sent = [
        ctrl({ key: 't', shift: true }),
        ctrl({ key: 'Delete', shift: true }),
        ctrl({ key: '1' }),
        ctrl({ key: '9' }),
        { key: 'Tab', control: true },
        { key: 'Tab', control: true, shift: true },
        ...['p', 'd', 'h', 'j'].map((k) => ctrl({ key: k })),
      ];
      for (const k of sent) assert.ok(press(k), JSON.stringify(k));
      for (const k of [ctrl({ key: 'a' }), ctrl({ key: 'c' }), ctrl({ key: '0', alt: true }), { key: 'Tab' }, { key: '1' }, ctrl({ key: 'Delete' })]) assert.ok(!press(k), `${JSON.stringify(k)} must stay with the page`);
      await until(async () => (await page('__keys.length')) === before + sent.length, 2000, 'the keys');
      const got = (await page('__keys')).slice(before).map((k) => `${k.shift ? '⇧' : ''}${k.key}`);
      assert.deepEqual(got, ['⇧t', '⇧Delete', '1', '9', 'Tab', '⇧Tab', 'p', 'd', 'h', 'j']);
    });

    await check('find: the number of matches and the active one, next and back, none, and stopping it', async () => {
      await goTo(own, `${appOrigin}/words`);
      const id = JSON.stringify(own.targetId);
      assert.deepEqual(await page(`hydorDesktop.browser.find(${id}, 'alpha')`), { matches: 3, active: 1 });
      assert.deepEqual(await page(`hydorDesktop.browser.find(${id}, 'alpha', { findNext: true })`), { matches: 3, active: 2 });
      assert.deepEqual(await page(`hydorDesktop.browser.find(${id}, 'alpha', { findNext: true, forward: false })`), { matches: 3, active: 1 });
      assert.deepEqual(await page(`hydorDesktop.browser.find(${id}, 'ALPHA', { matchCase: true })`), { matches: 0, active: 0 });
      assert.deepEqual(await page(`hydorDesktop.browser.find(${id}, 'zzz')`), { matches: 0, active: 0 });
      assert.deepEqual(await page(`hydorDesktop.browser.find(${id}, '')`), { matches: 0, active: 0 });
      // Not one of your tabs here (an agent's, or none): null.
      assert.equal(await page(`hydorDesktop.browser.find(${JSON.stringify(agent.targetId)}, 'alpha')`), null);
      assert.equal(await page(`hydorDesktop.browser.find('NOSUCHTARGET', 'alpha')`), null);
    });

    await check('mute sets muted, and the window’s page is told', async () => {
      const id = JSON.stringify(own.targetId);
      await page(`hydorDesktop.browser.mute(${id}, true)`);
      assert.equal(ownT().wc.isAudioMuted(), true);
      await until(() => stateFor(own.targetId, (s) => s.muted === true), 2000, 'the muted news');
      await page(`hydorDesktop.browser.mute(${id}, false)`);
      assert.equal(ownT().wc.isAudioMuted(), false);
      await until(() => stateFor(own.targetId, (s) => s.muted === false), 2000, 'the unmuted news');
      // Its sound: Chromium says when a tab is audible (here the event, which a silent test cannot make).
      ownT().wc.emit('audio-state-changed', { audible: true });
      await until(() => stateFor(own.targetId, (s) => s.audible === true), 2000, 'the audible news');
      // Showing the tab gives the page everything about it at once.
      await page(`hydorDesktop.browser.show(${id}, {x:50,y:60,w:400,h:300})`);
      await until(() => stateFor(own.targetId, (s) => 'zoom' in s && 'blocked' in s && 'fullscreen' in s && 'audible' in s && 'muted' in s), 2000, 'all of the news');
    });

    await check('the right-click menu: a link, an image, selected words, a field, and what the page has anyway', async () => {
      const t = ownT();
      const base = { x: 20, y: 30, pageURL: `${appOrigin}/words`, linkURL: '', srcURL: '', mediaType: 'none', selectionText: '', isEditable: false, misspelledWord: '', dictionarySuggestions: [], editFlags: {} };
      const labels = (tpl) => tpl.filter((i) => i.type !== 'separator').map((i) => i.label);
      const link = labels(t && browser.menuTemplate(t, { ...base, linkURL: 'https://example.com/a?b=c' }));
      assert.deepEqual(link, ['Open link in new tab', 'Open link in private tab', 'Open link in your default browser', 'Copy link address', 'Read link later', 'Back', 'Forward', 'Reload', 'Bookmark this page', 'Read this page later', 'Print…', 'Inspect']);
      // A link that is not a web address (javascript:, mailto:) has only its copy.
      assert.deepEqual(labels(browser.menuTemplate(t, { ...base, linkURL: 'mailto:a@b.c' })).slice(0, 2), ['Copy link address', 'Back']);
      const img = labels(browser.menuTemplate(t, { ...base, mediaType: 'image', srcURL: 'https://example.com/i.png' }));
      assert.deepEqual(img.slice(0, 6), ['Open image in new tab', 'Save image as…', 'Save image', 'Ask about this image', 'Copy image', 'Copy image address']);
      // Only an address the app can read is offered to keep or ask about (not a file: or chrome: picture).
      assert.ok(!labels(browser.menuTemplate(t, { ...base, mediaType: 'image', srcURL: 'file:///tmp/a.png' })).includes('Save image'));
      const sel = browser.menuTemplate(t, { ...base, selectionText: 'hello world' });
      assert.deepEqual(labels(sel), ['Copy', 'Search Google for “hello world”', 'Ask an agent about “hello world”', 'Translate “hello world”', 'Highlight', 'Bookmark this page', 'Read this page later', 'Print…', 'Inspect']);
      const long = labels(browser.menuTemplate(t, { ...base, selectionText: 'x'.repeat(100) }))[1];
      assert.ok(long.length < 60 && long.includes('…'), long);
      const field = browser.menuTemplate(t, { ...base, isEditable: true, misspelledWord: 'helo', dictionarySuggestions: ['hello', 'help'], editFlags: { canUndo: true, canCut: true, canCopy: true, canPaste: true, canSelectAll: true } });
      assert.deepEqual(labels(field), ['hello', 'help', 'Add to dictionary', 'Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select all', 'Bookmark this page', 'Read this page later', 'Print…', 'Inspect']);
      assert.equal(field.find((i) => i.label === 'Cut').enabled, true);
      assert.equal(field.find((i) => i.label === 'Redo').enabled, false);
      // Back and Forward say whether there is somewhere to go.
      const plain = browser.menuTemplate(t, base);
      assert.equal(plain.find((i) => i.label === 'Back').enabled, t.wc.navigationHistory.canGoBack());
      // Its items ask the app: ask an agent, bookmark, and a link in a new tab.
      // Asking reads the whole selection from the page first, so its command may come a moment after the bookmark's.
      sel.find((i) => /^Ask an agent/.test(i.label)).click();
      await until(async () => (await page('__cmds.length')) === 1, 2000, 'the ask command');
      sel.find((i) => i.label === 'Bookmark this page').click();
      sel.find((i) => i.label === 'Highlight').click();
      // Where a highlight of yours is, there is its removal (popupMenu found the highlight and passes it on); not in a field.
      const hid = '11111111-1111-1111-1111-111111111111';
      const onMark = browser.menuTemplate(t, { ...base, hydorHighlight: hid });
      assert.deepEqual(labels(onMark).slice(0, 1), ['Remove highlight']);
      onMark.find((i) => i.label === 'Remove highlight').click();
      assert.ok(!labels(browser.menuTemplate(t, { ...base, selectionText: 'x', pageURL: 'about:blank' })).includes('Highlight'), 'no highlights on a blank page');
      assert.ok(!labels(browser.menuTemplate(t, { ...base, selectionText: 'x', isEditable: true })).includes('Highlight'), 'none for words in a field');
      assert.ok(!labels(browser.menuTemplate(t, { ...base, selectionText: 'x', frame: {} })).includes('Highlight'), 'none for words in a frame inside the page');
      assert.ok(labels(browser.menuTemplate(t, { ...base, selectionText: 'x', frame: t.wc.mainFrame })).includes('Highlight'), 'the page’s own words have it');
      // Every item has an id of its own (the window's page draws them by it).
      for (const tpl of [sel, field, plain, onMark, browser.menuTemplate(t, { ...base, linkURL: 'https://example.com/a', mediaType: 'image', srcURL: 'https://example.com/i.png' })]) {
        const ids = tpl.filter((i) => i.type !== 'separator').map((i) => i.id);
        assert.ok(ids.every((id) => typeof id === 'string' && id), JSON.stringify(ids));
        assert.equal(new Set(ids).size, ids.length, JSON.stringify(ids));
      }
      assert.deepEqual(sel.find((i) => i.id === 'search').args, { engine: 'Google', text: 'hello world' });
      await until(async () => (await page('__cmds.length')) === 4, 2000, 'the menu’s commands');
      assert.deepEqual(await page('__cmds'), [
        { cmd: 'ask', text: 'hello world', url: `${appOrigin}/words` },
        { cmd: 'bookmark', url: `${appOrigin}/words`, title: 'words' },
        { cmd: 'highlight', target: t.id, url: `${appOrigin}/words`, title: 'words' },
        { cmd: 'unhighlight', id: hid, url: `${appOrigin}/words` },
      ]);
      const mark = events.length;
      browser.menuTemplate(t, { ...base, linkURL: `${appOrigin}/popped` }).find((i) => i.label === 'Open link in new tab').click();
      const att = await waitEvent('Target.attachedToTarget', (m) => events.indexOf(m) >= mark && /popped|blank/.test(m.params.targetInfo.url || 'blank'));
      assert.equal(att.params.targetInfo.type, 'page');
      assert.ok(!browser.conns.get(CONN).targets.get(att.params.targetInfo.targetId).offscreen, 'a tab of your own');
      await cdp('Target.closeTarget', { targetId: att.params.targetInfo.targetId });
    });

    await check('read later, a picture to keep and a question: the app is told, the picture is read with the page as its referrer, and what is no picture is said so', async () => {
      const t = ownT();
      const base = { x: 20, y: 30, pageURL: `${appOrigin}/words`, linkURL: '', srcURL: '', mediaType: 'none', selectionText: '', isEditable: false, misspelledWord: '', dictionarySuggestions: [], editFlags: {} };
      const last = async () => (await page('__cmds')).at(-1);
      const count = () => page('__cmds.length');
      const next = async (click) => {
        const n = await count();
        click();
        await until(async () => (await count()) === n + 1, 5000, 'the menu’s command');
        return last();
      };
      const pic = browser.menuTemplate(t, { ...base, mediaType: 'image', srcURL: `${appOrigin}/photo-of-cat.png` });
      const kept = await next(() => pic.find((i) => i.label === 'Save image').click());
      assert.equal(kept.cmd, 'save-image');
      assert.equal(kept.name, 'photo-of-cat.png');
      assert.equal(kept.url, `${appOrigin}/words`);
      assert.equal(lastReferer, `${appOrigin}/words`, 'the page is its referrer');
      assert.deepEqual([...fs.readFileSync(kept.path).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'a PNG file the app can keep');
      assert.ok(kept.path.startsWith(os.tmpdir()) && fs.statSync(kept.path).mode % 0o1000 === 0o600, 'in a temporary folder, for the owner');
      const asked = await next(() => pic.find((i) => i.label === 'Ask about this image').click());
      assert.equal(asked.cmd, 'ask-image');
      assert.ok(fs.existsSync(asked.path) && asked.path !== kept.path);
      // A picture inside the page's own address (data:) reads too; a page that is no picture is told so.
      const inline = browser.menuTemplate(t, { ...base, mediaType: 'image', srcURL: `data:image/png;base64,${PNG_B64}` });
      assert.equal((await next(() => inline.find((i) => i.label === 'Save image').click())).cmd, 'save-image');
      const html = browser.menuTemplate(t, { ...base, mediaType: 'image', srcURL: `${appOrigin}/words` });
      const failed = await next(() => html.find((i) => i.label === 'Save image').click());
      assert.equal(failed.cmd, 'picture-failed');
      assert.match(failed.message, /PNG, JPEG, WebP, GIF or AVIF/);
      // Read later: a link (with its words), and the page.
      const link = browser.menuTemplate(t, { ...base, linkURL: `${appOrigin}/popped`, linkText: 'the popped page' });
      assert.deepEqual(await next(() => link.find((i) => i.label === 'Read link later').click()), { cmd: 'later', url: `${appOrigin}/popped`, title: 'the popped page' });
      const later = await next(() => browser.menuTemplate(t, base).find((i) => i.label === 'Read this page later').click());
      assert.deepEqual(later, { cmd: 'later', url: `${appOrigin}/words`, title: 'words' });
      // The menu's own copy of a selection is cut short; a question quotes the whole of it, as the page has it selected.
      const was = await t.wc.executeJavaScript('document.body.innerHTML', true);
      await t.wc.executeJavaScript(`document.body.innerHTML = '<p>${'alpha beta '.repeat(300)}omega</p>'; getSelection().selectAllChildren(document.body); 1`, true);
      try {
        const cut = browser.menuTemplate(t, { ...base, selectionText: 'alpha beta alpha beta' });
        const asked = await next(() => cut.find((i) => /^Ask an agent/.test(i.label)).click());
        assert.equal(asked.cmd, 'ask');
        assert.ok(asked.text.length > 3000 && asked.text.endsWith('omega'), String(asked.text.length));
        // Words that are not the page's selection stay as they were given.
        const other = browser.menuTemplate(t, { ...base, selectionText: 'something else' });
        assert.equal((await next(() => other.find((i) => /^Ask an agent/.test(i.label)).click())).text, 'something else');
      } finally {
        await t.wc.executeJavaScript(`document.body.innerHTML = ${JSON.stringify(was)}; getSelection().removeAllRanges(); 1`, true);
      }
    });

    await check('the right-click menu finds a highlight of yours under the click, in a world of its own', async () => {
      const t = ownT();
      await goTo(own, `${appOrigin}/marked`);
      // The point is in the mark's own text (found by the page, in CSS pixels); the menu gives it in the view's.
      const r = await t.wc.executeJavaScript('(() => { const b = document.querySelector("mark.hydor-hl").getBoundingClientRect(); const o = document.getElementById("bad").getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), ox: Math.round(o.left + 5), oy: Math.round(o.top + 5) }; })()', true);
      assert.equal(await browser.highlightAt(t, { x: r.x, y: r.y }), '11111111-1111-1111-1111-111111111111');
      assert.equal(await browser.highlightAt(t, { x: 2, y: r.oy }), '', 'elsewhere on the page: none');
      assert.equal(await browser.highlightAt(t, { x: r.ox, y: r.oy }), '', 'a mark that is not one of ours (no class): none');
      assert.equal(await browser.highlightAt(t, { x: 'x', y: 'y' }), '', 'nonsense: none');
      // One inside a web component's shadow root (the page's own answer is the component).
      await goTo(own, `${appOrigin}/marked-shadow`);
      const s = await t.wc.executeJavaScript('(() => { const b = document.getElementById("host").shadowRoot.querySelector("mark").getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()', true);
      assert.equal(await browser.highlightAt(t, s), '33333333-3333-3333-3333-333333333333');
    });

    await check('the right-click menu in the app’s own look: the page that draws menus gets its items, the point and a picture; a pick is done once; without such a page the system’s menu shows', async () => {
      const t = ownT();
      await goTo(own, `${appOrigin}/words`);
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:100,y:80,w:640,h:400})`);
      await sleep(400);
      await page('window.__menus = []; window.__offMenus = hydorDesktop.browser.onMenu((m) => __menus.push(m)); 1');
      const r = await t.wc.executeJavaScript('(() => { const n = document.querySelector("p").firstChild; const g = document.createRange(); g.setStart(n, 0); g.setEnd(n, 10); const a = g.getBoundingClientRect(); return { x1: Math.round(a.left + 1), x2: Math.round(a.right - 1), y: Math.round(a.top + a.height / 2) }; })()', true);
      // Words selected with the mouse, and a right-click on them: real input.
      const rightClick = (x, y) => {
        t.wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'right', clickCount: 1 });
        t.wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'right', clickCount: 1 });
      };
      t.wc.focus();
      t.wc.sendInputEvent({ type: 'mouseDown', x: r.x1, y: r.y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 8; i++) t.wc.sendInputEvent({ type: 'mouseMove', x: r.x1 + Math.round(((r.x2 - r.x1) * i) / 8), y: r.y, modifiers: ['leftButtonDown'] });
      t.wc.sendInputEvent({ type: 'mouseUp', x: r.x2, y: r.y, button: 'left', clickCount: 1 });
      await sleep(200);
      assert.equal(await t.wc.executeJavaScript('String(getSelection())', true), 'alpha beta');
      const mx = Math.round((r.x1 + r.x2) / 2);
      rightClick(mx, r.y);
      await until(async () => (await page('__menus.length')) === 1, 5000, 'the menu at the page');
      const m = (await page('__menus'))[0];
      assert.equal(m.target, t.id);
      assert.deepEqual(m.items.map((i) => i.id || '-'), ['copy', 'search', 'ask', 'translate-selection', 'highlight', '-', 'bookmark', 'read-later', 'print', '-', 'inspect']);
      assert.deepEqual(m.items.find((i) => i.id === 'search'), { id: 'search', label: 'Search Google for “alpha beta”', enabled: true, args: { engine: 'Google', text: 'alpha beta' } });
      assert.ok(Math.abs(m.x - (100 + mx)) <= 1 && Math.abs(m.y - (80 + r.y)) <= 1, `the point: ${m.x}, ${m.y}`);
      assert.match(m.still, /^data:image\/jpeg;base64,/);
      // The words stay selected while the menu is open (the page is taken away meanwhile), and Highlight reaches the app once.
      await page(`hydorDesktop.browser.hide(${JSON.stringify(own.targetId)})`);
      assert.equal(await t.wc.executeJavaScript('String(getSelection())', true), 'alpha beta');
      const pick = (menu, item, target = t.id) => page(`hydorDesktop.browser.menuPick(${JSON.stringify(target)}, ${menu}, ${JSON.stringify(item)})`);
      assert.equal(await pick(m.menu + 1, 'highlight'), false, 'not that menu');
      assert.equal(await pick(m.menu, 'highlight', 'nope'), false, 'not that tab');
      const n = await page('__cmds.length');
      assert.equal(await pick(m.menu, 'highlight'), true);
      await until(async () => (await page('__cmds.length')) === n + 1, 2000, 'the highlight command');
      assert.deepEqual((await page('__cmds')).at(-1), { cmd: 'highlight', target: t.id, url: `${appOrigin}/words`, title: 'words' });
      assert.equal(await pick(m.menu, 'highlight'), false, 'done once');
      // Asked for the keys while it is away, the page gets them when it is back.
      await page(`hydorDesktop.browser.focus(${JSON.stringify(own.targetId)})`);
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:100,y:80,w:640,h:400})`);
      assert.equal(ownT().focusAt, 0);
      // Closed with nothing picked: nothing is done; an item that cannot be used now is not done either.
      await t.wc.executeJavaScript('getSelection().removeAllRanges()', true);
      rightClick(2, 300);
      await until(async () => (await page('__menus.length')) === 2, 5000, 'the second menu');
      const m2 = (await page('__menus'))[1];
      assert.deepEqual(m2.items.filter((i) => i.id).map((i) => [i.id, i.enabled]).slice(0, 3), [['back', t.wc.navigationHistory.canGoBack()], ['forward', false], ['reload', true]]);
      assert.equal(await pick(m2.menu, 'forward'), false, 'Forward cannot be used');
      rightClick(2, 300);
      await until(async () => (await page('__menus.length')) === 3, 5000, 'the third menu');
      const m3 = (await page('__menus'))[2];
      assert.equal(await pick(m3.menu, null), true);
      assert.equal(await pick(m3.menu, 'reload'), false, 'closed');
      // Nobody draws menus any more: the system's own shows.
      await page('__offMenus(); 1');
      await sleep(100);
      const build = Menu.buildFromTemplate;
      let native = null;
      Menu.buildFromTemplate = (tpl) => (native = build.call(Menu, tpl));
      try {
        rightClick(2, 300);
        await until(() => native, 5000, 'the system’s menu');
        native.closePopup(win);
      } finally {
        Menu.buildFromTemplate = build;
      }
      assert.equal(await page('__menus.length'), 3, 'the page heard of no other menu');
    });

    await check('full-screen video: the window and the page fill the screen, and leaving puts both back', async () => {
      const t = ownT();
      const win2 = BrowserWindow.fromWebContents(win.webContents);
      assert.equal(win2, win);
      const before = { ...t.view.getBounds() };
      await t.wc.executeJavaScript('document.documentElement.requestFullscreen().then(()=>1)', true);
      await until(() => t.fs, 3000, 'the page to go full screen');
      // The window takes a moment to be full screen (its size follows), and the page follows the window.
      const fills = () => {
        const [fw, fh] = win.getContentSize();
        const b = t.view.getBounds();
        return b.x === 0 && b.y === 0 && b.width === fw && b.height === fh;
      };
      await until(fills, 3000, 'the page to fill the window');
      const [w, h] = win.getContentSize();
      await until(() => stateFor(own.targetId, (s) => s.fullscreen === true), 2000, 'the full screen news');
      // The Browser page asking for another place while it is full screen does not take the page out of it.
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:10,y:10,w:100,h:100})`);
      assert.deepEqual(t.view.getBounds(), { x: 0, y: 0, width: w, height: h });
      // macOS says a window is hidden while it is only covered for a moment (as when it moves to a space of its own to go full
      // screen): a page shown full screen stays, still in that window and filling it.
      win.emit('hide');
      win.emit('show');
      await sleep(300);
      assert.ok(t.fs, 'the window hiding for a moment took the page out of full screen');
      assert.ok(win.contentView.children.includes(t.view), 'the page was parked');
      assert.equal(t.view.getBounds().width, win.getContentSize()[0]);
      assert.ok(fills(), 'the page no longer fills the window');
      await t.wc.executeJavaScript('document.exitFullscreen().then(()=>1)', true);
      await until(() => !t.fs, 3000, 'the page to leave full screen');
      assert.deepEqual(t.view.getBounds(), { x: 10, y: 10, width: 100, height: 100 });
      await until(() => !win.isFullScreen(), 3000, 'the window to leave full screen');
      await until(() => stateFor(own.targetId, (s) => s.fullscreen === false), 2000, 'the left full screen news');
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:50,y:60,w:400,h:300})`);
      void before;
    });

    const sitePrefs = (more) => browser.message({ type: 'browser-prefs', adblock: true, allowAds: [], cookieBanners: true, darkPages: false, darkExcept: [], autoplay: false, ...more });
    await check('default page zoom: a site you did not zoom has it on each page, a site you zoomed keeps its own, and reset goes to the default', async () => {
      const t = ownT();
      const factor = () => Math.round(t.wc.getZoomFactor() * 100) / 100;
      const zoomOp = (op) => page(`hydorDesktop.browser.zoom(${JSON.stringify(own.targetId)}, ${JSON.stringify(op)})`);
      const other = `http://localhost:${sitePort}`;
      await goTo(own, `${appOrigin}/own`);
      assert.equal(factor(), 1);
      // A new default reaches the open page at once, and the window's page is told.
      sitePrefs({ zoom: 1.25 });
      assert.equal(factor(), 1.25);
      await until(() => stateFor(own.targetId, (s) => s.zoom === 1.25), 2000, 'the zoom news');
      // Each page of a site you did not zoom has it.
      await goTo(own, `${other}/own`);
      assert.equal(factor(), 1.25, 'another site');
      await goTo(own, `${appOrigin}/words`);
      assert.equal(factor(), 1.25, 'and back');
      t.wc.setZoomFactor(1);
      await goTo(own, `${appOrigin}/own`);
      assert.equal(factor(), 1.25, 'a page that came with another zoom');
      // A site you zoomed keeps what you chose, over a new default and over visits to other sites; the others follow the default.
      assert.equal(await zoomOp('in'), 1.5);
      sitePrefs({ zoom: 1.1 });
      assert.equal(factor(), 1.5, 'your zoom stays over a new default');
      await goTo(own, `${other}/own`);
      assert.equal(factor(), 1.1, 'a site you did not zoom has the new default');
      await goTo(own, `${appOrigin}/own`);
      assert.equal(factor(), 1.5, 'the site you zoomed has its zoom still');
      // Reset goes to the default, not to 100 %, and the site follows the default from then on.
      assert.equal(await zoomOp('reset'), 1.1);
      sitePrefs({ zoom: 0.8 });
      assert.equal(factor(), 0.8);
      // Zooming out is yours too.
      assert.equal(await zoomOp('out'), 0.75);
      sitePrefs({ zoom: 1.5 });
      assert.equal(factor(), 0.75);
      sitePrefs({ zoom: 1 });
      assert.equal(factor(), 0.75);
      assert.equal(await zoomOp('reset'), 1);
      assert.equal(factor(), 1);
    });

    await check('check spelling: your own sessions follow the setting, when they are made and when it changes', async () => {
      const ses = ownT().wc.session;
      assert.equal(ses.isSpellCheckerEnabled(), true, 'on at first');
      assert.equal(ses, browser.browsingSession(), 'your own tab is in the browsing profile');
      sitePrefs({ spellcheck: false });
      assert.equal(ses.isSpellCheckerEnabled(), false, 'turned off');
      // A private tab's session is made while it is off, and follows it back on.
      const { browserContextId } = await cdp('Target.createBrowserContext', { hydorPrivate: true });
      const priv = await openTab(`${appOrigin}/own`, { browserContextId });
      const sp = browser.conns.get(CONN).targets.get(priv.targetId).wc.session;
      assert.equal(sp.isSpellCheckerEnabled(), false, 'a new private session starts as the setting says');
      sitePrefs({ spellcheck: true });
      assert.equal(ses.isSpellCheckerEnabled(), true);
      assert.equal(sp.isSpellCheckerEnabled(), true);
      sitePrefs({ spellcheck: false });
      assert.equal(sp.isSpellCheckerEnabled(), false);
      await cdp('Target.disposeBrowserContext', { browserContextId });
      sitePrefs({ spellcheck: true });
      assert.equal(ses.isSpellCheckerEnabled(), true);
    });

    await check('openExternal takes http and https addresses only; print and the rest refuse what is not your tab', async () => {
      for (const u of ['file:///etc/hostname', 'javascript:alert(1)', 'data:text/html,x', 'chrome://gpu', 'ftp://example.com', 'notanaddress', '']) assert.equal(await page(`hydorDesktop.browser.openExternal(${JSON.stringify(u)})`), false, u);
      assert.equal(await page(`hydorDesktop.browser.print('NOSUCHTARGET')`), undefined);
      assert.equal(await page(`hydorDesktop.browser.print(${JSON.stringify(agent.targetId)})`), undefined);
      // A page that is not the app's own has none of it.
      const other = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: process.env.HYDOR_PRELOAD } });
      await other.loadURL(`http://localhost:${sitePort}/app`);
      const call = (expr) => other.webContents.executeJavaScript(expr);
      assert.equal(await call(`hydorDesktop.browser.find(${JSON.stringify(own.targetId)}, 'alpha')`), null);
      assert.equal(await call(`hydorDesktop.browser.zoom(${JSON.stringify(own.targetId)}, 'in')`), 1);
      assert.equal(Math.round(ownT().wc.getZoomFactor() * 100), 100);
      await call(`hydorDesktop.browser.mute(${JSON.stringify(own.targetId)}, true)`);
      assert.equal(ownT().wc.isAudioMuted(), false);
      other.destroy();
    });

    await check('clearing browsing data: the profile’s cookies and cached files go', async () => {
      const ses = browser.browsingSession();
      await ses.cookies.set({ url: `${appOrigin}/`, name: 'keep', value: 'me' });
      assert.equal((await ses.cookies.get({ name: 'keep' })).length, 1);
      // Not the browsing profile's, or without cookies: it stays.
      browser.message({ type: 'browser-clear', profile: 'other', cookies: true, cache: true });
      browser.message({ type: 'browser-clear', profile: 'browsing', cookies: false, cache: true });
      await sleep(500);
      assert.equal((await ses.cookies.get({ name: 'keep' })).length, 1);
      browser.message({ type: 'browser-clear', profile: 'browsing', cookies: true, cache: true, since: Date.now() - 3600_000 });
      await until(async () => (await ses.cookies.get({ name: 'keep' })).length === 0, 5000, 'the cookies to go');
    });

    await check('the ad blocker: a request to an ad host fails, the count reaches the window’s page, and the setting and allowed sites switch it', async () => {
      const ab = browser.adblock;
      assert.ok(ab, 'no blocker');
      assert.equal(await ab.ready(), true);
      const ses = browser.browsingSession();
      assert.equal(ab.isOn(ses), true, 'on by default for your own browsing');
      const adPage = () => evalIn(own.sid, '__ad');
      const visit = async () => {
        await goTo(own, `${appOrigin}/ads`);
        return until(async () => (await adPage()) !== 'waiting' && (await adPage()), 5000, 'the ad request to end');
      };
      assert.equal(await visit(), 'blocked');
      assert.equal(ownT().blocked, 1);
      await until(() => stateFor(own.targetId, (s) => s.blocked === 1), 3000, 'the blocked count');
      // A new page starts again from nothing.
      await goTo(own, `${appOrigin}/own`);
      await until(async () => (await states()).filter((s) => s.target === own.targetId && 'blocked' in s).pop().blocked === 0, 3000, 'the count to start over');
      // Off: the request goes through (the proxy answers it).
      browser.message({ type: 'browser-prefs', adblock: false, allowAds: [] });
      assert.equal(ab.isOn(ses), false);
      assert.equal(await visit(), 'loaded');
      // On again, but this site is one you allowed ads on (its subdomains too): through; take it off the list and it is blocked.
      browser.message({ type: 'browser-prefs', adblock: true, allowAds: ['127.0.0.1'] });
      assert.equal(ab.isOn(ses), true);
      assert.equal(await visit(), 'loaded');
      assert.ok(ab.allows('127.0.0.1') && !ab.allows('x.127.0.0.2') && !ab.allows('evil127.0.0.1'));
      browser.message({ type: 'browser-prefs', adblock: true, allowAds: ['hydor-test.example', 'bad host!', '', 7] });
      assert.equal(await visit(), 'blocked');
      assert.ok(ab.allows('www.hydor-test.example') && !ab.allows('127.0.0.1'));
      // What is not a site is not taken.
      assert.ok(!ab.allows('bad host!'));
    });

    await check('the ad blocker’s lists: saved once, made again when a week old, and the old ones kept when they cannot be fetched', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-ipc-lists-'));
      const realFetch = globalThis.fetch;
      let calls = 0;
      let offline = false;
      globalThis.fetch = async (url) => {
        calls++;
        if (offline) throw new Error('no network');
        // The lists are text, and uBlock's resources a JSON file.
        return new Response(/\.json$/.test(String(url)) ? '[]' : `||${AD_HOST}^\n`);
      };
      // The engine without the cookie notices list (its own file), as the one that was there before it.
      const make = () => {
        const ab = createAdblock({ log: (...a) => console.log('  [adblock]', ...a), dir, modulePath: () => ADBLOCK, onBlocked: () => {} });
        ab.setPrefs({ cookieBanners: false });
        return ab;
      };
      const file = path.join(dir, 'engine-ads-and-tracking.bin');
      try {
        const first = make();
        assert.equal(await first.ready(), true);
        assert.ok(fs.statSync(file).size > 0, 'the engine was not saved');
        first.close();
        // Fresh: no fetching at all.
        const n = calls;
        const second = make();
        assert.equal(await second.ready(), true);
        assert.equal(calls, n, 'a fresh file is used as it is');
        second.close();
        // A week old and no network: the old file does.
        const old = new Date(Date.now() - 8 * 24 * 3600 * 1000);
        fs.utimesSync(file, old, old);
        offline = true;
        const third = make();
        assert.equal(await third.ready(), true);
        assert.ok(calls > n, 'an old file is fetched again');
        third.close();
        // A week old and the network is there: made again, the file is new.
        offline = false;
        const fourth = make();
        assert.equal(await fourth.ready(), true);
        assert.ok(Date.now() - fs.statSync(file).mtimeMs < 60_000, 'the old file was kept');
        fourth.close();
        // Nothing saved and no network: no blocker (and no throwing).
        fs.rmSync(file);
        offline = true;
        const fifth = make();
        assert.equal(await fifth.ready(), false);
        fifth.close();
      } finally {
        globalThis.fetch = realFetch;
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });


    // ---- private tabs, dark pages, sound, pictures, a site's data, media and the bubble ----
    const pagePrefs = (more) => browser.message({ type: 'browser-prefs', adblock: true, allowAds: [], cookieBanners: true, darkPages: false, darkExcept: [], autoplay: false, ...more });
    const cookiesOf = (tab) => evalIn(tab.sid, 'document.cookie');
    const tabOf = (tab) => browser.conns.get(CONN).targets.get(tab.targetId);
    const baseParams = { x: 20, y: 30, pageURL: `${appOrigin}/words`, linkURL: '', srcURL: '', mediaType: 'none', selectionText: '', isEditable: false, misspelledWord: '', dictionarySuggestions: [], editFlags: {} };
    const ids = (tpl) => tpl.filter((i) => i.type !== 'separator').map((i) => i.id);

    await check('a private context: its tabs are real pages in a partition kept in memory, with their own cookies, the blocker and the permission questions; its menu opens private tabs; disposing of it forgets it', async () => {
      pagePrefs({});
      const { browserContextId } = await cdp('Target.createBrowserContext', { hydorPrivate: true });
      const priv = await openTab(`${appOrigin}/own`, { browserContextId });
      const tp = tabOf(priv);
      assert.ok(tp.ctx.private && !tp.offscreen && !tp.wc.isOffscreen(), 'a real page');
      assert.equal(tp.ctx.partition, `hydor-private-${browserContextId.toLowerCase()}`);
      assert.ok(!tp.ctx.persistent && !tp.wc.session.isPersistent(), 'in memory');
      assert.equal(tp.wc.session.extensions.getAllExtensions().length, 0, 'no extensions');
      assert.equal(browser.adblock.isOn(tp.wc.session), true, 'the blocker is on there');
      // Cookies are apart, both ways.
      await goTo(own, `${appOrigin}/own`);
      await evalIn(priv.sid, `document.cookie = 'pc=1; path=/'; 1`);
      await evalIn(own.sid, `document.cookie = 'nc=1; path=/'; 1`);
      assert.equal(await cookiesOf(priv), 'pc=1');
      assert.equal(await cookiesOf(own), 'nc=1');
      // Permission questions go to the server, from a private tab as from a normal one.
      for (const [tab, name] of [[priv, 'private'], [own, 'normal']]) {
        const mark = toServerLog.length;
        await evalIn(tab.sid, `navigator.geolocation.getCurrentPosition(() => {}, () => {}); 1`);
        const ask = await until(() => toServerLog.slice(mark).find((m) => m.type === 'browser-permission' && m.target === tab.targetId), 3000, `the ${name} tab's permission question`);
        assert.equal(ask.permission, 'geolocation');
        browser.message({ type: 'browser-permission-answer', conn: CONN, id: ask.id, allow: false });
      }
      // Its menu: a link and an image open in a private tab again, with no "Open link in private tab" and no Ask items.
      const shown = browser.conns.get(CONN).targets.get(priv.targetId);
      const link = browser.menuTemplate(shown, { ...baseParams, linkURL: `${appOrigin}/popped` });
      assert.ok(!ids(link).includes('open-link-private'));
      const withAsk = { ...baseParams, selectionText: 'hello', mediaType: 'image', srcURL: `${appOrigin}/photo-of-cat.png` };
      const rich = ids(browser.menuTemplate(shown, withAsk));
      assert.ok(!rich.includes('ask') && !rich.includes('ask-image'), JSON.stringify(rich));
      for (const keep of ['save-image-library', 'highlight', 'translate-selection', 'bookmark', 'read-later', 'search']) assert.ok(rich.includes(keep), `${keep} stays`);
      let mark = events.length;
      link.find((i) => i.id === 'open-link').click();
      const att = await waitEvent('Target.attachedToTarget', (m) => events.indexOf(m) >= mark && m.params.targetInfo.browserContextId === browserContextId);
      const opened = browser.conns.get(CONN).targets.get(att.params.targetInfo.targetId);
      assert.ok(opened.ctx.private && !opened.offscreen, 'a private tab of the same context');
      mark = events.length;
      browser.menuTemplate(shown, { ...baseParams, mediaType: 'image', srcURL: `${appOrigin}/photo-of-cat.png` }).find((i) => i.id === 'open-image').click();
      await waitEvent('Target.attachedToTarget', (m) => events.indexOf(m) >= mark && m.params.targetInfo.browserContextId === browserContextId);
      // A normal tab's menu: Open link in private tab asks the app; Ask items stay.
      const normal = browser.menuTemplate(tabOf(own), { ...baseParams, linkURL: `${appOrigin}/popped` });
      assert.equal(ids(normal).join(), 'open-link,open-link-private,open-link-external,copy-link,read-link-later,back,forward,reload,bookmark,read-later,print,inspect');
      assert.ok(ids(browser.menuTemplate(tabOf(own), withAsk)).includes('ask-image'));
      const n = await page('__cmds.length');
      normal.find((i) => i.id === 'open-link-private').click();
      await until(async () => (await page('__cmds.length')) === n + 1, 2000, 'the open-private command');
      assert.deepEqual((await page('__cmds')).at(-1), { cmd: 'open-private', url: `${appOrigin}/popped` });
      // Disposing of the context closes its tabs and forgets what it kept.
      const ses = tp.wc.session;
      await cdp('Target.disposeBrowserContext', { browserContextId });
      assert.ok(!browser.conns.get(CONN).targets.has(priv.targetId) && !browser.conns.get(CONN).targets.has(att.params.targetInfo.targetId));
      assert.equal(browser.adblock.isOn(ses), false, 'the blocker lets go of the session');
      await until(async () => (await ses.cookies.get({})).length === 0, 3000, 'the private cookies to go');
      assert.equal(await cookiesOf(own), 'nc=1', 'the normal tab keeps its own');
      await evalIn(own.sid, `document.cookie = 'nc=; path=/; max-age=0'; 1`);
      // Only your own browsing has private contexts: the flag does nothing for a plain one without it.
      const plainCtx = await cdp('Target.createBrowserContext', {});
      assert.ok(!browser.conns.get(CONN).contexts.get(plainCtx.browserContextId).private);
      await cdp('Target.disposeBrowserContext', { browserContextId: plainCtx.browserContextId });
    });

    await check('Ctrl or ⌘+Shift+N inside a page goes to the app (and without Shift it does not)', async () => {
      const t = ownT();
      const keys = (input) => browser.shortcut(t, { control: false, meta: false, alt: false, shift: false, ...input });
      assert.deepEqual(keys(ctrl({ key: 'N', shift: true })), { key: 'N' });
      assert.equal(keys(ctrl({ key: 'n' })), null);
      assert.equal(keys(ctrl({ key: 'N', shift: true, alt: true })), null);
      const mark = await page('__keys.length');
      let prevented = false;
      t.wc.emit('before-input-event', { preventDefault: () => (prevented = true) }, { type: 'keyDown', control: !MAC, meta: MAC, alt: false, shift: true, key: 'N' });
      assert.ok(prevented);
      await until(async () => (await page('__keys.length')) === mark + 1, 2000, 'the key');
      assert.equal((await page('__keys')).at(-1).key, 'N');
    });

    await check('pages shown dark: on, a site excepted, another site, a new tab, a pop-up, off; the server’s own media emulation is kept with it', async () => {
      const dark = (tab) => evalIn(tab.sid, `matchMedia('(prefers-color-scheme: dark)').matches`);
      const wait = (tab, want, what) => until(async () => (await dark(tab)) === want, 3000, what);
      await goTo(own, `${appOrigin}/own`);
      assert.equal(await dark(own), false);
      pagePrefs({ darkPages: true, darkExcept: [] });
      await wait(own, true, 'the page to go dark');
      // Still dark on another page of the site, and on another site (localhost is another host of this machine).
      await goTo(own, `${appOrigin}/words`);
      assert.equal(await dark(own), true);
      const other = appOrigin.replace('127.0.0.1', 'localhost');
      await goTo(own, `${other}/words`);
      assert.equal(await dark(own), true, 'another site');
      // An exception: a site covers its subdomains, and www. does not matter.
      pagePrefs({ darkPages: true, darkExcept: ['www.localhost'] });
      await wait(own, false, 'the exception');
      await goTo(own, `${appOrigin}/words`);
      assert.equal(await dark(own), true, 'a site that is not excepted, reached from one that is');
      await goTo(own, `${other}/words`);
      assert.equal(await dark(own), false, 'an excepted site, reached from a dark one');
      // The browser's own darkening is on too: a page with no dark look of its own (white) is drawn dark where it is shown.
      await goTo(own, `${appOrigin}/words`);
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:100,y:80,w:640,h:400})`);
      const shade = async () => {
        try {
          const px = (await ownT().wc.capturePage()).crop({ x: 300, y: 300, width: 4, height: 4 }).toBitmap();
          return (px[0] + px[1] + px[2]) / 3;
        } catch {
          // A page that has just loaded may not have a frame to take yet.
          return -1;
        }
      };
      await until(async () => (await shade()) >= 0 && (await shade()) < 100, 4000, 'the white page to be drawn dark').catch(async (e) => {
        throw new Error(`${e.message} (a pixel of it is ${await shade()})`);
      });
      // The server's own media emulation on the tab is merged with ours, not replaced by it.
      await goTo(own, `${appOrigin}/words`);
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, own.sid);
      assert.equal(await dark(own), true);
      assert.equal(await evalIn(own.sid, `matchMedia('(prefers-reduced-motion: reduce)').matches`), true);
      await cdp('Emulation.setEmulatedMedia', { features: [] }, own.sid);
      assert.equal(await dark(own), true);
      // A new tab is dark before its first page loads, and so is a pop-up.
      const fresh = await openTab(`${appOrigin}/own`);
      assert.equal(await dark(fresh), true, 'a new tab');
      const mark = events.length;
      await evalIn(fresh.sid, `window.open('/popped', 'dp'); 1`);
      const att = await waitEvent('Target.attachedToTarget', (m) => events.indexOf(m) >= mark && m.params.targetInfo.openerId === fresh.targetId);
      await cdp('Page.enable', {}, att.params.sessionId);
      await cdp('Runtime.runIfWaitingForDebugger', {}, att.params.sessionId);
      await until(async () => (await evalIn(att.params.sessionId, 'document.title')) === 'popped', 5000, 'the pop-up');
      assert.equal(await dark({ sid: att.params.sessionId }), true, 'a pop-up');
      await cdp('Target.closeTarget', { targetId: att.params.targetInfo.targetId });
      // An agent's tab is left alone.
      const bot = await openTab(`${appOrigin}/own`, { hydorAgent: true });
      assert.equal(await dark(bot), false, 'an agent’s tab');
      await cdp('Target.closeTarget', { targetId: bot.targetId });
      pagePrefs({ darkPages: false });
      await wait(own, false, 'the page to go light again');
      await wait(fresh, false, 'the new tab to go light again');
      await goTo(own, `${appOrigin}/words`);
      await until(async () => (await shade()) > 200, 4000, 'the page to be drawn light again');
      await cdp('Target.closeTarget', { targetId: fresh.targetId });
    });

    await check('sound that plays by itself: a tab made after the setting has its policy, and so has a pop-up of it; an agent’s tab keeps its own', async () => {
      // What the policy does: a video with sound is let play with no click only where the policy lets it.
      const plays = async (tab) => {
        await until(async () => (await evalIn(tab.sid, `document.getElementById('v').readyState`)) >= 2, 5000, 'the sound to load');
        return evalIn(tab.sid, `document.getElementById('v').play().then(() => 'plays', (e) => e.name)`);
      };
      const open = async (url, params) => {
        const tab = await openTab(url, params);
        return tab;
      };
      const a = await open(`${appOrigin}/sound`);
      assert.equal(await plays(a), 'NotAllowedError', 'waits for you by default');
      pagePrefs({ autoplay: true });
      const b = await open(`${appOrigin}/sound`);
      assert.equal(await plays(b), 'plays');
      await evalIn(a.sid, `document.getElementById('v').pause(); 1`);
      assert.equal(await plays(a), 'NotAllowedError', 'a tab made before it keeps its own');
      const popupPlays = async (opener, name) => {
        const mark = events.length;
        await evalIn(opener.sid, `window.open('/sound', '${name}'); 1`);
        const att = await waitEvent('Target.attachedToTarget', (m) => events.indexOf(m) >= mark && m.params.targetInfo.openerId === opener.targetId);
        await cdp('Page.enable', {}, att.params.sessionId);
        await cdp('Runtime.runIfWaitingForDebugger', {}, att.params.sessionId);
        await until(async () => (await evalIn(att.params.sessionId, 'document.title')) === 'sound', 5000, 'the pop-up');
        return [att, await plays({ sid: att.params.sessionId })];
      };
      const [att, first] = await popupPlays(b, 'ap');
      assert.equal(first, 'plays', 'a pop-up');
      pagePrefs({ autoplay: false });
      const [att2, second] = await popupPlays(b, 'ap2');
      assert.equal(second, 'NotAllowedError', 'a pop-up after the setting changed');
      const bot = await open(`${appOrigin}/sound`, { hydorAgent: true });
      assert.equal(await plays(bot), 'plays', 'an agent’s tab');
      for (const x of [a.targetId, b.targetId, bot.targetId, att.params.targetInfo.targetId, att2.params.targetInfo.targetId]) await cdp('Target.closeTarget', { targetId: x });
    });

    const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-ipc-downloads-'));
    const png = (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await check('a picture of the page (what shows, and the whole page) and a PDF are saved in Downloads, the picture is on the clipboard, a taken name gets (2)', async () => {
      app.setPath('downloads', downloads);
      await goTo(own, `${appOrigin}/agent`);
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:100,y:80,w:640,h:400})`);
      await sleep(500);
      const api = (call) => page(`hydorDesktop.browser.${call}`);
      const id = JSON.stringify(own.targetId);
      const visible = await api(`capture(${id}, false)`);
      assert.ok(visible && visible.path.startsWith(downloads), JSON.stringify(visible));
      assert.match(visible.name, /^agent page \d{4}-\d\d-\d\d at \d\d\.\d\d\.\d\d\.png$/);
      const vb = fs.readFileSync(visible.path);
      assert.ok(png(vb));
      const dsf = await evalIn(own.sid, 'devicePixelRatio');
      assert.equal(vb.readUInt32BE(16), Math.round(640 * dsf));
      assert.equal(vb.readUInt32BE(20), Math.round(400 * dsf));
      assert.equal(typeof visible.copied, 'boolean');
      assert.equal(visible.copied, true, 'put on the clipboard');
      assert.equal(await clipboard.has('image/png'), true, 'on the clipboard');
      const whole = await api(`capture(${id}, true)`);
      const wb = fs.readFileSync(whole.path);
      assert.ok(png(wb));
      assert.ok(wb.readUInt32BE(16) >= Math.round(600 * dsf) && wb.readUInt32BE(16) <= Math.round(640 * dsf), `the page’s width, less its scrollbar: ${wb.readUInt32BE(16)}`);
      assert.ok(wb.readUInt32BE(20) >= 3000 * dsf - 2, `the whole page is ${wb.readUInt32BE(20)} pixels high`);
      assert.notEqual(whole.path, visible.path);
      const pdf = await api(`savePdf(${id})`);
      assert.equal(pdf.name, 'agent page.pdf');
      assert.equal(fs.readFileSync(pdf.path).subarray(0, 5).toString(), '%PDF-');
      const again = await api(`savePdf(${id})`);
      assert.equal(again.name, 'agent page (2).pdf');
      // What is not one of your tabs (an agent's, a stranger's, one that is not shown) gets nothing.
      assert.equal(await api(`capture(${JSON.stringify(agent.targetId)}, false)`), null);
      assert.equal(await api(`savePdf('nope')`), null);
      const fresh = await openTab(`${appOrigin}/own`);
      assert.equal(await api(`capture(${JSON.stringify(fresh.targetId)}, false)`), null, 'not shown');
      await cdp('Target.closeTarget', { targetId: fresh.targetId });
      // A title with characters a file name cannot have.
      await evalIn(own.sid, `document.title = 'a/b: c*d?  <e>|f "g"'; 1`);
      const odd = await api(`savePdf(${id})`);
      assert.equal(odd.name, 'a b c d e f g.pdf');
    });

    await check('delete this site’s data: its cookies and storage go (subdomains too, other sites’ stay), the tab loads again; a private tab clears its own session', async () => {
      await goTo(own, `${appOrigin}/words`);
      const ses = ownT().wc.session;
      await evalIn(own.sid, `document.cookie = 'k=1; path=/'; localStorage.setItem('x', '1'); 1`);
      await ses.cookies.set({ url: 'http://sub.example.org/', name: 'sub', value: '1', domain: 'example.org' });
      await ses.cookies.set({ url: 'http://www.example.co.uk/', name: 'uk', value: '1', domain: 'example.co.uk' });
      await ses.cookies.set({ url: 'http://other.co.uk/', name: 'keep', value: '1' });
      await ses.cookies.set({ url: 'http://keep.test/', name: 'keep', value: '1' });
      const names = async () => (await ses.cookies.get({})).map((c) => `${c.domain}|${c.name}`).sort();
      const before = await names();
      assert.ok(before.includes('127.0.0.1|k'), before.join());
      const done = await page(`hydorDesktop.browser.clearSite(${JSON.stringify(own.targetId)})`);
      assert.deepEqual(done, { cleared: true, site: '127.0.0.1' });
      await until(async () => (await evalIn(own.sid, `document.cookie + '|' + localStorage.getItem('x')`)) === '|null', 5000, 'the site’s data to go (and the page to load again)');
      assert.ok(!(await names()).includes('127.0.0.1|k'));
      assert.ok((await names()).includes('keep.test|keep'), 'another site keeps its cookie');
      // The site of a host, as well as can be told.
      for (const [host, site] of [['www.example.com', 'example.com'], ['a.b.example.co.uk', 'example.co.uk'], ['example.com.au', 'example.com.au'], ['mail.foo.ru', 'foo.ru'], ['localhost', 'localhost'], ['127.0.0.1', '127.0.0.1'], ['x.example.org', 'example.org'], ['a.b.ne.jp', 'b.ne.jp']]) assert.equal(browser.siteOfHost(host), site, host);
      await ses.cookies.remove('http://keep.test/', 'keep');
      await ses.cookies.remove('http://other.co.uk/', 'keep');
      await ses.cookies.remove('http://www.example.co.uk/', 'uk');
      // A private tab: its own cookies go, the normal tab's stay.
      const { browserContextId } = await cdp('Target.createBrowserContext', { hydorPrivate: true });
      const priv = await openTab(`${appOrigin}/words`, { browserContextId });
      await evalIn(priv.sid, `document.cookie = 'pk=1; path=/'; 1`);
      await evalIn(own.sid, `document.cookie = 'nk=1; path=/'; 1`);
      assert.deepEqual(await page(`hydorDesktop.browser.clearSite(${JSON.stringify(priv.targetId)})`), { cleared: true, site: '127.0.0.1' });
      await until(async () => (await cookiesOf(priv)) === '', 5000, 'the private cookie to go');
      assert.equal(await cookiesOf(own), 'nk=1');
      await evalIn(own.sid, `document.cookie = 'nk=; path=/; max-age=0'; 1`);
      await cdp('Target.disposeBrowserContext', { browserContextId });
      // Not a web page, or not a tab: nothing.
      assert.equal(await page(`hydorDesktop.browser.clearSite(${JSON.stringify(agent.targetId)})`), null);
      assert.equal(await page(`hydorDesktop.browser.clearSite('nope')`), null);
    });

    let pipWorks = null;
    await check('video and audio in the right-click menu: its items, what they do to the element, and whether picture in picture works here', async () => {
      await goTo(own, `${appOrigin}/video`);
      await page(`hydorDesktop.browser.show(${JSON.stringify(own.targetId)}, {x:100,y:80,w:640,h:400})`);
      await until(async () => (await evalIn(own.sid, `document.getElementById('v').readyState`)) >= 2, 5000, 'the video to load');
      const t = ownT();
      const flags = { inError: false, isPaused: true, isMuted: false, hasAudio: true, isLooping: false, isControlsVisible: false, canToggleControls: true, canPrint: false, canSave: true, canShowPictureInPicture: true, isShowingPictureInPicture: false, canRotate: false, canLoop: true };
      const src = `${appOrigin}/clip.webm`;
      const params = { ...baseParams, x: 60, y: 60, pageURL: `${appOrigin}/video`, mediaType: 'video', srcURL: src, mediaFlags: flags };
      const tpl = browser.menuTemplate(t, params);
      assert.equal(ids(tpl).slice(0, 5).join(), 'media-play,media-mute,media-loop,media-controls,media-pip');
      assert.deepEqual(tpl.filter((i) => 'checked' in i).map((i) => [i.id, i.checked]), [['media-loop', false], ['media-controls', false], ['media-pip', false]]);
      assert.deepEqual(ids(tpl).slice(5, 8), ['open-video', 'save-video', 'copy-video-address']);
      assert.equal(tpl.find((i) => i.id === 'open-video').label, 'Open video in new tab');
      const playing = browser.menuTemplate(t, { ...params, mediaFlags: { ...flags, isPaused: false, isMuted: true, isLooping: true, isControlsVisible: true, isShowingPictureInPicture: true } });
      assert.deepEqual(ids(playing).slice(0, 5), ['media-pause', 'media-unmute', 'media-loop', 'media-controls', 'media-pip']);
      assert.deepEqual(playing.filter((i) => 'checked' in i).map((i) => i.checked), [true, true, true]);
      // What it has not: no sound, no controls to toggle, no way to save, a blob: source.
      const bare = ids(browser.menuTemplate(t, { ...params, mediaFlags: { ...flags, hasAudio: false, canToggleControls: false, canShowPictureInPicture: false, canSave: false } }));
      assert.ok(!bare.some((i) => /media-(mute|unmute|controls|pip)|save-video/.test(i)), bare.join());
      const blob = ids(browser.menuTemplate(t, { ...params, srcURL: 'blob:http://x/1' }));
      assert.ok(!blob.some((i) => /^(open|save|copy)-video/.test(i)), blob.join());
      const audio = ids(browser.menuTemplate(t, { ...params, mediaType: 'audio' }));
      assert.deepEqual(audio.filter((i) => /audio/.test(i)), ['open-audio', 'save-audio', 'copy-audio-address']);
      assert.ok(!audio.includes('media-pip'), 'no picture in picture for audio');
      assert.ok(!ids(browser.menuTemplate(t, params)).includes('translate-page'), 'not on a video');
      // The items act on the element at the click (the isolated world is the menu's own, the page's scripts cannot see it).
      const state = () => evalIn(own.sid, `(() => { const v = document.getElementById('v'); return { muted: v.muted, loop: v.loop, controls: v.controls, paused: v.paused }; })()`);
      const pick = async (id, list = tpl) => (list.find((i) => i.id === id).click(), sleep(250));
      assert.equal((await state()).muted, true);
      await pick('media-unmute', playing);
      assert.equal((await state()).muted, false);
      await pick('media-mute');
      assert.equal((await state()).muted, true);
      await pick('media-loop');
      assert.equal((await state()).loop, true);
      await pick('media-controls');
      assert.equal((await state()).controls, true);
      await pick('media-play');
      await until(async () => (await state()).paused === false, 3000, 'the video to play');
      await pick('media-pause', playing);
      await until(async () => (await state()).paused === true, 3000, 'the video to pause');
      // A click that is not on the element finds it by its box, and one with the page zoomed finds it by the zoom.
      t.wc.setZoomFactor(2);
      await sleep(200);
      await pick('media-loop', browser.menuTemplate(t, { ...params, x: 100, y: 100 }));
      assert.equal((await state()).loop, false, 'at a zoom of 200 %, 100 is 50 in the page');
      t.wc.setZoomFactor(1);
      // Its commands that go on: copy, open (a new tab), save (a download starts).
      tpl.find((i) => i.id === 'copy-video-address').click();
      await until(async () => (await clipboard.readText()) === src, 3000, 'the address on the clipboard');
      const mark = events.length;
      tpl.find((i) => i.id === 'open-video').click();
      const att = await waitEvent('Target.attachedToTarget', (m) => events.indexOf(m) >= mark && m.params.targetInfo.type === 'page');
      await cdp('Target.closeTarget', { targetId: att.params.targetInfo.targetId });
      const dl = events.length;
      tpl.find((i) => i.id === 'save-video').click();
      await waitEvent('Browser.downloadWillBegin', (m) => events.indexOf(m) >= dl && m.params.url === src);
      // Picture in picture: whether this Electron has it. The item is only there when it works.
      pipWorks = await t.wc.executeJavaScriptInIsolatedWorld(1000, [{ code: `(async () => { const v = document.getElementById('v'); try { if (!document.pictureInPictureEnabled) return 'disabled'; await v.play(); await v.requestPictureInPicture(); const on = document.pictureInPictureElement === v; await document.exitPictureInPicture().catch(() => {}); return on ? 'works' : 'no element'; } catch (e) { return String(e && e.name) + ': ' + String(e && e.message); } })()` }], true);
      console.log('  [pip]', pipWorks);
    });

    await check('translation items: Translate this page on the page itself (the language it asks for), Translate “…” for a selection; only on web pages; they ask the app', async () => {
      const t = ownT();
      const eng = { name: 'Google', template: 'https://www.google.com/search?q=%s', translateTo: 'de' };
      const plain = browser.menuTemplate(t, baseParams, eng);
      const item = plain.find((i) => i.id === 'translate-page');
      assert.ok(item && item.label === 'Translate this page');
      assert.deepEqual(item.args, { lang: 'de' });
      assert.deepEqual(ids(plain).slice(0, 4), ['back', 'forward', 'reload', 'translate-page']);
      // Not on a link, a picture, a video, words, a field, or a page that is not a website.
      for (const more of [{ linkURL: 'https://example.com/' }, { mediaType: 'image', srcURL: 'https://example.com/i.png' }, { mediaType: 'video', srcURL: 'https://example.com/v.webm', mediaFlags: {} }, { selectionText: 'x' }, { isEditable: true }, { pageURL: 'about:blank' }, { pageURL: 'chrome-error://chromewebdata/' }]) {
        assert.ok(!ids(browser.menuTemplate(t, { ...baseParams, ...more }, eng)).includes('translate-page'), JSON.stringify(more));
      }
      assert.ok(ids(browser.menuTemplate(t, { ...baseParams, pageURL: 'file:///tmp/a.html' }, eng)).includes('translate-page'), 'a file is a page');
      const sel = browser.menuTemplate(t, { ...baseParams, selectionText: 'hello world' }, eng);
      const ts = sel.find((i) => i.id === 'translate-selection');
      assert.equal(ts.label, 'Translate “hello world”');
      assert.deepEqual(ts.args, { text: 'hello world' });
      assert.ok(!ids(browser.menuTemplate(t, { ...baseParams, selectionText: 'x', pageURL: 'about:blank' }, eng)).includes('translate-selection'));
      assert.ok(!ids(browser.menuTemplate(t, { ...baseParams, selectionText: 'x', isEditable: true }, eng)).includes('translate-selection'));
      const n = await page('__cmds.length');
      item.click();
      ts.click();
      await until(async () => (await page('__cmds.length')) === n + 2, 3000, 'the translate commands');
      const [a, b] = (await page('__cmds')).slice(-2);
      assert.deepEqual([a, b], [{ cmd: 'translate', target: t.id }, { cmd: 'translate-text', text: 'hello world', url: `${appOrigin}/words` }]);
      // The selection is taken from the page whole (up to 5,000 characters), as asking an agent does.
      await goTo(own, `${appOrigin}/words`);
      await t.wc.executeJavaScript(`document.body.innerHTML = '<p id=p>${'word '.repeat(2000)}</p>'; getSelection().selectAllChildren(document.getElementById('p')); 1`, true);
      browser.menuTemplate(t, { ...baseParams, selectionText: 'word '.repeat(150) }, eng).find((i) => i.id === 'translate-selection').click();
      await until(async () => (await page('__cmds.length')) === n + 3, 3000, 'the long translate command');
      const long = (await page('__cmds')).at(-1);
      assert.equal(long.cmd, 'translate-text');
      assert.equal(long.text.length, 5000);
    });

    await check('the link bubble: shown over the bottom left corner of the page with the address, to the right while the mouse is there, in front of the page, and gone when the address is empty or the page is taken away', async () => {
      await goTo(own, `${appOrigin}/video`);
      const id = JSON.stringify(own.targetId);
      await page(`hydorDesktop.browser.show(${id}, {x:100,y:80,w:640,h:400})`);
      await sleep(300);
      const t = ownT();
      const tb = t.view.getBounds();
      const bubble = () => browser.bubble(win);
      const text = () => bubble().view.webContents.executeJavaScript(`document.getElementById('b').textContent`, true);
      const last = () => win.contentView.children[win.contentView.children.length - 1];
      assert.equal(bubble(), null, 'none until a link is pointed at');
      // The mouse is somewhere else.
      const real = screen.getCursorScreenPoint;
      const at = (x, y) => {
        const o = win.getContentBounds();
        screen.getCursorScreenPoint = () => ({ x: o.x + x, y: o.y + y });
      };
      at(tb.x + 300, tb.y + 100);
      try {
        t.wc.emit('update-target-url', {}, 'https://example.com/%E4%B8%AD/page?x=1');
        await until(() => bubble() && bubble().shown, 3000, 'the bubble');
        assert.equal(await text(), 'https://example.com/中/page?x=1', 'decoded where that is safe');
        let b = bubble();
        assert.ok(win.contentView.children.includes(b.view) && last() === b.view, 'in front of the page');
        assert.equal(b.bounds.height, 24);
        assert.equal(b.bounds.y, tb.y + tb.height - 24, '0 px from the page’s bottom edge');
        assert.ok(b.bounds.x >= tb.x && b.bounds.x <= tb.x + 8 && b.side === 'left', `at the left: ${JSON.stringify(b.bounds)}`);
        assert.ok(b.bounds.width > 100 && b.bounds.width < 400, `sized to its words: ${b.bounds.width}`);
        // An address that stays encoded when decoding could hide something (a space, a direction mark).
        t.wc.emit('update-target-url', {}, 'https://example.com/a%20b%E2%80%AEc');
        await until(async () => (await text()).includes('%20'), 3000, 'the encoded address');
        // The mouse comes to the corner: it goes to the right, and back when the mouse leaves.
        at(tb.x + 10, tb.y + tb.height - 12);
        await until(() => bubble().side === 'right', 2000, 'the bubble to move to the right');
        b = bubble();
        assert.equal(b.bounds.x + b.bounds.width, tb.x + tb.width - 4, 'at the page’s right edge');
        at(tb.x + 300, tb.y + 100);
        await until(() => bubble().side === 'left', 2000, 'the bubble to come back');
        // A long address is shortened in the middle: the host and the end stay, at most two thirds of the page wide.
        const longUrl = `https://www.example.com/${'folder/'.repeat(40)}the-end.html`;
        t.wc.emit('update-target-url', {}, longUrl);
        await until(async () => (await text()).includes('…'), 3000, 'the shortened address').catch(async (e) => { throw new Error(`${e.message}: ${JSON.stringify(await text())} ${JSON.stringify(bubble().bounds)} shown ${bubble().shown}`); });
        const shortened = await text();
        assert.ok(shortened.startsWith('https://www.example.com/') && shortened.endsWith('the-end.html'), shortened);
        assert.ok(bubble().bounds.width <= Math.floor((tb.width * 2) / 3) + 1, `${bubble().bounds.width} of ${tb.width}`);
        // The tab's view put in front again (it is placed again as it moves): the bubble is still above it, and moves with it.
        await page(`hydorDesktop.browser.show(${id}, {x:120,y:90,w:600,h:380})`);
        await sleep(200);
        assert.equal(last(), bubble().view, 'still in front');
        assert.equal(bubble().bounds.y, 90 + 380 - 24);
        // The colours follow the app's theme: light here (its page has no dark class), dark when it has.
        const colours = () => bubble().view.webContents.executeJavaScript(`getComputedStyle(document.getElementById('b')).backgroundColor`, true);
        assert.equal(await colours(), 'rgb(255, 255, 255)');
        await page(`document.documentElement.classList.add('dark'); 1`);
        await sleep(2100);
        t.wc.emit('update-target-url', {}, 'https://example.com/dark');
        await until(async () => (await colours()) === 'rgb(31, 31, 35)', 3000, 'the dark bubble');
        await page(`document.documentElement.classList.remove('dark'); 1`);
        // Gone when the address is empty.
        t.wc.emit('update-target-url', {}, '');
        await until(() => !bubble().shown && !win.contentView.children.includes(bubble().view), 2000, 'the bubble to go');
        // Gone when the page is taken away, hidden or full screen, or a menu is over it.
        for (const [what, away, back] of [
          ['taken away', () => page(`hydorDesktop.browser.hide(${id})`), () => page(`hydorDesktop.browser.show(${id}, {x:100,y:80,w:640,h:400})`)],
          ['covered by a menu', async () => {
            const build = Menu.buildFromTemplate;
            Menu.buildFromTemplate = () => ({ popup() {} });
            try {
              t.wc.emit('context-menu', {}, { ...baseParams, x: 50, y: 50, pageURL: `${appOrigin}/video` });
              await sleep(1000);
            } finally {
              Menu.buildFromTemplate = build;
            }
          }, async () => {}],
        ]) {
          await sleep(100);
          t.wc.emit('update-target-url', {}, 'https://example.com/x');
          await until(() => bubble().shown, 3000, `the bubble before it is ${what}`);
          await away();
          await until(() => !bubble().shown && !win.contentView.children.includes(bubble().view), 2000, `the bubble to go when the page is ${what}`);
          await back();
          await sleep(200);
        }
        // Not for a tab that is not shown, and not for an agent's.
        const agentT = browser.conns.get(CONN).targets.get(agent.targetId);
        agentT.wc.emit('update-target-url', {}, 'https://example.com/agent');
        await sleep(200);
        assert.ok(!bubble().shown, 'an agent’s tab has none');
        // Window hidden: gone with the page.
        t.wc.emit('update-target-url', {}, 'https://example.com/y');
        await until(() => bubble().shown, 3000, 'the bubble before the window hides');
        win.emit('hide');
        await until(() => !bubble().shown, 2000, 'the bubble to go with the window');
        win.emit('show');
        await sleep(200);
        // And when its page goes to another one.
        t.wc.emit('update-target-url', {}, 'https://example.com/z');
        await until(() => bubble().shown, 3000, 'the bubble before the page changes');
        await goTo(own, `${appOrigin}/words`);
        await until(() => !bubble().shown, 2000, 'the bubble to go when the page changes');
      } finally {
        screen.getCursorScreenPoint = real;
      }
    });

    await check('the ad blocker with cookie notices: the setting changes the engine on the sessions; its list is saved apart and the plain one is the fallback', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-ipc-cookies-'));
      const realFetch = globalThis.fetch;
      const asked = [];
      let offline = false;
      globalThis.fetch = async (url) => {
        asked.push(String(url));
        if (offline) throw new Error('no network');
        return new Response(/\.json$/.test(String(url)) ? '[]' : /cookie/.test(String(url)) ? `||cookie-banner.${AD_HOST}^\n` : `||${AD_HOST}^\n`);
      };
      const make = () => createAdblock({ log: (...a) => console.log('  [adblock]', ...a), dir, modulePath: () => ADBLOCK, onBlocked: () => {} });
      const ses = session.fromPartition('hydor-ipc-cookie-test');
      try {
        const ab = make();
        ab.attach(ses);
        ab.setPrefs({ adblock: true });
        assert.equal(await ab.ready(), true);
        await until(() => ab.hidesCookieNotices(ses), 5000, 'the cookie notices engine');
        assert.ok(asked.some((u) => /easylist-cookie\.txt$/.test(u)), 'EasyList’s cookie list');
        assert.ok(!asked.some((u) => /annoyances/.test(u)), 'not the broader annoyances lists');
        assert.ok(fs.existsSync(path.join(dir, 'engine-ads-tracking-cookies.bin')));
        // Off: the engine without them, made once (saved apart); on again: the first, from its file.
        ab.setPrefs({ cookieBanners: false });
        await until(() => ab.isOn(ses) && !ab.hidesCookieNotices(ses), 5000, 'the plain engine');
        assert.ok(fs.existsSync(path.join(dir, 'engine-ads-and-tracking.bin')));
        const n = asked.length;
        ab.setPrefs({ cookieBanners: true });
        await until(() => ab.hidesCookieNotices(ses), 5000, 'the cookie notices engine again');
        assert.equal(asked.length, n, 'a fresh file is used as it is');
        ab.close();
        // No network and no cookie file, but the plain one is there: it does (the blocker is not lost for the new setting).
        fs.rmSync(path.join(dir, 'engine-ads-tracking-cookies.bin'));
        offline = true;
        const again = make();
        again.attach(ses);
        again.setPrefs({ adblock: true, cookieBanners: true });
        assert.equal(await again.ready(), true);
        assert.equal(again.isOn(ses), true);
        again.close();
      } finally {
        globalThis.fetch = realFetch;
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    await check('closing a tab, and the whole browser, takes the pages away', async () => {
      await cdp('Target.closeTarget', { targetId: own.targetId });
      assert.ok(!browser.conns.get(CONN).targets.has(own.targetId));
      assert.ok(!win.contentView.children.some((v) => v.webContents && v.webContents.getURL().includes('/own')));
      await cdp('Browser.close');
      await until(() => !browser.conns.has(CONN), 2000, 'the browser to close');
    });
  };

  try {
    await test();
  } catch (e) {
    failed++;
    console.log(`FAIL (the check itself)\n     ${String((e && e.stack) || e)}`);
  }
  console.log(`\n${ok} passed${failed ? `, ${failed} failed` : ''}`);
  fs.rmSync(path.join(os.tmpdir(), `hydor-ipc-adblock-${process.pid}`), { recursive: true, force: true });
  site.close();
  proxy.close();
  setTimeout(() => app.exit(failed ? 1 : 0), 200);
});
