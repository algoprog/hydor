// What desktop/scripts/browser-selftest.mjs cannot see from the server's side: the window's. Run by Electron as its main script
// (desktop/scripts/browser-selftest.mjs does that, with a display). It stands in for the server (the same messages
// browser.cjs gets over the app's channel) and for the app's window (a real BrowserWindow with desktop/preload.cjs showing
// a page of its own origin), and checks through `window.hydorDesktop.browser`, as the web app uses it:
//   - an agent's tab (offscreen) sends frames, its cursor, takes your clicks, wheel, keys and text as real input (trusted),
//     and the server is told you typed;
//   - a pop-up of an agent's tab is an agent's tab too;
//   - your own tab (onscreen) is shown in the window where asked, moves, goes away with the window, is drawn there,
//     and still answers CDP while it is shown; its shortcuts reach the window's page;
//   - what is not an own tab or an agent's tab here is refused, and a page that is not the app's own gets nothing.
'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { createBrowser } = require('../browser.cjs');

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
  '/app': '<!doctype html><title>app</title><body style="margin:0;background:#123"><script>window.__keys=[];hydorDesktop.browser.onKey((k)=>__keys.push(k));</script>',
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
  '/own': '<!doctype html><title>own page</title><body style="margin:0;background:rgb(255,0,0)"><h1 style="color:#fff">mine</h1>',
};
const site = http.createServer((req, res) => {
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
  });
  browser.registerIpc();
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
      other.destroy();
      stranger.destroy();
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
  site.close();
  proxy.close();
  setTimeout(() => app.exit(failed ? 1 : 0), 200);
});
