// A small Chrome DevTools Protocol driver for the guide's screenshots: Playwright's Chromium headless shell
// (or CHROME=/path/to/chrome), one browser context per theme, real mouse and key events, WebP captures.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from '../../node_modules/ws/wrapper.mjs';

/** The newest Chromium headless shell Playwright has downloaded, unless CHROME says otherwise. */
export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')) : [];
  dirs.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium headless shell found: set CHROME, or run `npx playwright install chromium-headless-shell`');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Connection {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject, method } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(`${method}: ${m.error.message}`));
        else resolve(m.result);
      } else if (m.method) for (const l of this.listeners) l(m);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export class Browser {
  static async launch() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-shots-chrome-'));
    // WebGL in software (SwiftShader), which maps draw with: this browser only opens the app's own demo copy.
    const proc = spawn(
      chromePath(),
      ['--no-sandbox', '--headless', `--user-data-dir=${dir}`, '--remote-debugging-port=0', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio', '--no-first-run', 'about:blank'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    const url = await new Promise((resolve, reject) => {
      let err = '';
      const t = setTimeout(() => reject(new Error(`Chromium did not start: ${err.slice(-400)}`)), 20_000);
      proc.stderr.on('data', (d) => {
        err += d;
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
        if (m) {
          clearTimeout(t);
          resolve(m[1]);
        }
      });
      proc.on('exit', () => reject(new Error(`Chromium exited: ${err.slice(-400)}`)));
    });
    const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 512 << 20 });
    await new Promise((r, j) => (ws.once('open', r), ws.once('error', j)));
    const b = new Browser();
    b.proc = proc;
    b.dir = dir;
    b.conn = new Connection(ws);
    return b;
  }

  /** A page in a fresh context of its own (its own cookies and storage). */
  async page() {
    const { browserContextId } = await this.conn.send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await this.conn.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await this.conn.send('Target.attachToTarget', { targetId, flatten: true });
    const p = new Page(this.conn, sessionId, targetId, browserContextId);
    await p.init();
    return p;
  }

  async close() {
    try {
      await this.conn.send('Browser.close');
    } catch {}
    await sleep(300);
    try {
      this.proc.kill('SIGKILL');
    } catch {}
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}

export class Page {
  constructor(conn, sessionId, targetId, contextId) {
    this.conn = conn;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.contextId = contextId;
    this.routes = [];
    this.errors = [];
  }
  send(method, params) {
    return this.conn.send(method, params, this.sessionId);
  }
  /** Waits for one event of this page. */
  once(method, timeout = 30_000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => (off(), reject(new Error(`timed out waiting for ${method}`))), timeout);
      const off = this.conn.on((m) => {
        if (m.sessionId === this.sessionId && m.method === method) {
          clearTimeout(t);
          off();
          resolve(m.params);
        }
      });
    });
  }
  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    this.conn.on((m) => {
      if (m.sessionId !== this.sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
      // A request still paused when its page closes has nothing left to answer.
      if (m.method === 'Fetch.requestPaused') this.onPaused(m.params).catch((e) => /Session with given id not found|Invalid InterceptionId/.test(e.message) || console.warn('route failed', e.message));
    });
  }

  async viewport(width, height, { scale = 2, mobile = false } = {}) {
    this.size = { width, height, scale, mobile };
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile, screenWidth: width, screenHeight: height });
    await this.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  }

  async timezone(id) {
    await this.send('Emulation.setTimezoneOverride', { timezoneId: id });
  }

  async cookie(name, value, url) {
    await this.conn.send('Storage.setCookies', { browserContextId: this.contextId, cookies: [{ name, value, url, httpOnly: true, sameSite: 'Lax' }] });
  }

  /** Runs before the page's own scripts on every load. */
  async initScript(source) {
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  /**
   * Answers requests whose URL matches `test` (a RegExp) with `handler(request)`: an object
   * `{ status?, json?, body?, headers? }` replaces the response, null lets it through.
   */
  async route(test, handler) {
    this.routes.push({ test, handler });
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  }
  async onPaused(p) {
    const r = this.routes.find((x) => x.test.test(p.request.url));
    const out = r ? await r.handler(p.request) : null;
    if (!out) return this.send('Fetch.continueRequest', { requestId: p.requestId });
    const body = out.json !== undefined ? JSON.stringify(out.json) : (out.body ?? '');
    const headers = Object.entries({ 'content-type': out.json !== undefined ? 'application/json' : 'text/plain', ...out.headers }).map(([name, value]) => ({ name, value: String(value) }));
    return this.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: out.status ?? 200, responseHeaders: headers, body: Buffer.from(body).toString('base64') });
  }

  async goto(url, { settle = 900 } = {}) {
    const loaded = this.once('Page.loadEventFired', 30_000);
    await this.send('Page.navigate', { url });
    await loaded;
    await this.idle();
    await sleep(settle);
  }

  /** Waits until fonts are in and nothing has been fetched for a moment. */
  async idle(timeout = 15_000) {
    await this.eval('document.fonts.ready.then(() => true)');
    const end = Date.now() + timeout;
    let last = -1;
    while (Date.now() < end) {
      const n = await this.eval('performance.getEntriesByType("resource").length');
      if (n === last) return;
      last = n;
      await sleep(400);
    }
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n${expression.slice(0, 300)}`);
    return r.result.value;
  }

  async waitFor(expression, { timeout = 15_000, what } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (await this.eval(expression)) return;
      } catch {}
      await sleep(150);
    }
    throw new Error(`timed out waiting for ${what ?? expression}`);
  }

  /** The box of the first element a selector (or a script returning an element) finds, in CSS pixels. */
  async box(target) {
    const find = target.startsWith('js:') ? target.slice(3) : `document.querySelector(${JSON.stringify(target)})`;
    return this.eval(`(() => { const el = ${find}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  }

  /** The element whose own text is `text` (trimmed), innermost first, optionally inside `within`. */
  byText(text, within = 'document') {
    return `js:(() => { const root = ${within === 'document' ? 'document' : `document.querySelector(${JSON.stringify(within)})`}; if (!root) return null; const all = [...root.querySelectorAll('button, a, [role=button], [role=menuitem], [role=tab], [role=option], label, span, div, p, h1, h2, h3, li')].filter((e) => e.offsetParent !== null || e.getClientRects().length); return all.find((e) => e.textContent.trim() === ${JSON.stringify(text)}) ?? null; })()`;
  }

  async click(target, { wait = 500 } = {}) {
    await this.waitFor(`!!(${(target.startsWith('js:') ? target.slice(3) : `document.querySelector(${JSON.stringify(target)})`)})`, { what: target });
    const b = await this.box(target);
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    if (this.size?.mobile) {
      await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    await sleep(wait);
  }

  async hover(target) {
    const b = await this.box(target);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x + b.width / 2, y: b.y + b.height / 2 });
  }

  /** Moves the mouse out of the way, so nothing shows its hover look. */
  async park() {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: (this.size?.height ?? 800) - 1 });
  }

  async type(text) {
    await this.send('Input.insertText', { text });
  }

  async key(key, code = key, keyCode = 0, modifiers = 0) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  }

  /** Scrolls with the mouse wheel over a point (the app's scrollers follow the reader's own scrolls only). */
  async wheel(x, y, deltaY) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
    await sleep(250);
  }

  /**
   * A WebP of a region in CSS pixels (the whole viewport by default), at most `maxWidth` image pixels wide:
   * the region renders at the page's scale, or smaller when that would be wider.
   */
  async shot(file, { clip, maxWidth = 1600, quality = 80 } = {}) {
    const c = clip ?? { x: 0, y: 0, width: this.size.width, height: this.size.height };
    const dpr = this.size?.scale ?? 1;
    const scale = Math.min(1, maxWidth / (c.width * dpr));
    const r = await this.send('Page.captureScreenshot', {
      format: 'webp',
      quality,
      clip: { x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.width), height: Math.round(c.height), scale },
      captureBeyondViewport: false,
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return fs.statSync(file).size;
  }
}

export { sleep };
