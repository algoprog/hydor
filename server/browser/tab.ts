// One tab of a session's browser: its page target over CDP, what it is loading, its dialogs, and what
// the agent does in it (one action at a time): read it as an outline, look at it, click, type, scroll.
import type { BrowserDialog } from '../../shared/browser.ts';
import { CdpError, CdpSession } from './cdp.ts';
import { keyEvents, parseKey } from './keys.ts';
import { buildOutline, SNAPSHOT_STYLES, type AxInfo, type El, type FrameSnap, type Outline } from './outline.ts';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What a tab needs from the browser of its session. */
export interface TabOwner {
  /** A new element number, never used before in this session. */
  newId(tab: Tab, session: string, backendNodeId: number): number;
  forget(tab: Tab, ids: Iterable<number>): void;
  changed(): void;
  dialog(tab: Tab, d: BrowserDialog | null): void;
  /** Tabs the page is opening that are not set up yet. */
  opening(): number;
}

export interface ElRef {
  tab: Tab;
  session: string;
  backendNodeId: number;
}

export interface Snapshot {
  outline: Outline;
  url: string;
  title: string;
  vw: number;
  vh: number;
  pageH: number;
  scrollY: number;
}

/** The point to click on an element, or why it cannot be clicked. */
type Point = { x: number; y: number } | { error: string };

export class Tab {
  url = 'about:blank';
  title = '';
  loaderId = '';
  /** A main-frame navigation is under way. */
  navigating = false;
  loadedAt = 0;
  dialog: BrowserDialog | null = null;
  crashed = false;
  closed = false;
  /** Frames in other processes (cross-site iframes), by target id. */
  frames = new Map<string, CdpSession>();
  /** This page's element numbers, by `${session}:${backendNodeId}`. */
  private ids = new Map<string, number>();
  /** The numbers in the last outline of this page (to mark what is new), null before the first one. */
  prev: Set<number> | null = null;
  /** Elements the user typed into while driving: their values never reach the agent. */
  userTyped = new Set<string>();
  /** Requests refused since the agent last looked. */
  blocked: { url: string; why: string }[] = [];
  fileChooser: { backendNodeId: number; multiple: boolean } | null = null;
  viewport = { w: 1280, h: 800, mobile: false, scale: 1 };
  private inflight = new Map<string, number>();
  private quietSince = Date.now();
  private queue: Promise<unknown> = Promise.resolve();
  private world: number | null = null;
  private dialogWaiters = new Set<() => void>();
  private loadWaiters = new Set<() => void>();
  private offs: (() => void)[] = [];
  private screencast: ((frame: { data: string; w: number; h: number }) => void) | null = null;
  private castOpts: { maxWidth: number; maxHeight: number } | null = null;
  private lastFrameAt = 0;

  constructor(
    readonly owner: TabOwner,
    readonly targetId: string,
    readonly s: CdpSession,
    private userAgent: string,
  ) {}

  /** Sets the tab up before its page runs (it waits for this, attached on start). */
  async init(viewport: { w: number; h: number }) {
    const on = (m: string, fn: (p: any) => void) => this.offs.push(this.s.on(m, fn));
    on('Page.frameStartedLoading', (p) => {
      if (p.frameId === this.targetId) {
        this.navigating = true;
        this.owner.changed();
      }
    });
    on('Page.frameStoppedLoading', (p) => {
      if (p.frameId === this.targetId) this.loaded();
    });
    on('Page.loadEventFired', () => this.loaded());
    on('Page.frameNavigated', (p) => {
      if (p.frame.parentId) return;
      this.url = p.frame.url + (p.frame.urlFragment ?? '');
      if (p.frame.loaderId !== this.loaderId) this.newDocument(p.frame.loaderId);
      this.owner.changed();
    });
    on('Page.navigatedWithinDocument', (p) => {
      if (p.frameId !== this.targetId) return;
      this.url = p.url;
      this.owner.changed();
    });
    on('Page.javascriptDialogOpening', (p) => {
      this.dialog = { type: p.type, message: String(p.message ?? '').slice(0, 2000), defaultPrompt: p.defaultPrompt, url: p.url };
      for (const w of this.dialogWaiters) w();
      this.owner.dialog(this, this.dialog);
    });
    on('Page.javascriptDialogClosed', () => {
      this.dialog = null;
      this.owner.dialog(this, null);
    });
    on('Page.fileChooserOpened', (p) => {
      if (p.backendNodeId) this.fileChooser = { backendNodeId: p.backendNodeId, multiple: p.mode === 'selectMultiple' };
    });
    on('Network.requestWillBeSent', (p) => {
      if (p.type === 'WebSocket' || p.type === 'EventSource') return;
      this.inflight.set(p.requestId, Date.now());
    });
    const done = (p: any) => {
      if (this.inflight.delete(p.requestId) && !this.busyRequests()) this.quietSince = Date.now();
    };
    on('Network.loadingFinished', done);
    on('Network.loadingFailed', done);
    on('Page.screencastFrame', (p) => this.frame(p));
    on('Inspector.targetCrashed', () => {
      this.crashed = true;
      this.owner.changed();
    });
    // Cross-site frames run in processes of their own: attach to read them too.
    on('Target.attachedToTarget', (p) => {
      const sid = p.sessionId as string;
      const child = new CdpSession(this.s.cdp, sid);
      if (p.targetInfo.type === 'iframe') this.frames.set(p.targetInfo.targetId, child);
      child.send('Runtime.runIfWaitingForDebugger').catch(() => {});
    });
    on('Target.detachedFromTarget', (p) => {
      for (const [id, c] of this.frames) if (c.id === p.sessionId) this.frames.delete(id);
      this.s.cdp.dropSession(p.sessionId);
    });
    await Promise.all([
      this.s.send('Page.enable'),
      this.s.send('Network.enable', { maxTotalBufferSize: 1_000_000, maxResourceBufferSize: 200_000 }),
      this.s.send('Page.setLifecycleEventsEnabled', { enabled: true }),
      this.s.send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {}),
      this.s.send('Emulation.setUserAgentOverride', { userAgent: this.userAgent }),
      this.s.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }),
      this.setViewport(viewport.w, viewport.h, false, 1),
    ]);
  }

  async setViewport(w: number, h: number, mobile: boolean, scale: number) {
    this.viewport = { w, h, mobile, scale };
    await this.s.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile, screenWidth: w, screenHeight: h });
    await this.s.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 }).catch(() => {});
  }

  /** Runs one action at a time in this tab. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const f of this.offs) f();
    this.offs = [];
    for (const w of this.loadWaiters) w();
    this.s.cdp.dropSession(this.s.id);
  }

  private newDocument(loaderId: string) {
    this.loaderId = loaderId;
    this.world = null;
    this.owner.forget(this, this.ids.values());
    this.ids.clear();
    this.prev = null;
    this.userTyped.clear();
    this.fileChooser = null;
  }

  private loaded() {
    if (!this.navigating && this.loadedAt) return;
    this.navigating = false;
    this.loadedAt = Date.now();
    for (const w of this.loadWaiters) w();
    this.owner.changed();
    // The title as the page set it (the target's own may still be its address).
    this.s
      .send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
      .then((r) => {
        if (typeof r.result?.value === 'string' && r.result.value) {
          this.title = r.result.value.slice(0, 300);
          this.owner.changed();
        }
      })
      .catch(() => {});
  }

  private busyRequests(): number {
    const now = Date.now();
    let n = 0;
    // Long-lived requests (polling, streams) do not count as the page still loading.
    for (const at of this.inflight.values()) if (now - at < 5000) n++;
    return n;
  }

  /** Resolves when the page has loaded (or after `ms`). */
  waitLoad(ms: number): Promise<void> {
    if (!this.navigating) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(t);
        this.loadWaiters.delete(done);
        resolve();
      };
      const t = setTimeout(done, ms);
      this.loadWaiters.add(done);
    });
  }

  /** Waits for what an action set off: a page loading, requests in flight, a dialog. */
  async settle(maxMs = 4000) {
    const t0 = Date.now();
    await sleep(150);
    while (Date.now() - t0 < maxMs && !this.dialog && !this.closed) {
      if (this.owner.opening()) {
        await sleep(100);
        continue;
      }
      if (this.navigating) await this.waitLoad(Math.max(1000, maxMs + 8000 - (Date.now() - t0)));
      if (!this.busyRequests() && Date.now() - this.quietSince >= 300) break;
      await sleep(100);
    }
  }

  /** Resolves with true when a dialog opens before `p` settles (the page then waits for the user). */
  private async raceDialog<T>(p: Promise<T>): Promise<{ dialog: true } | { value: T }> {
    if (this.dialog) return { dialog: true };
    let off = () => {};
    const opened = new Promise<{ dialog: true }>((resolve) => {
      const w = () => resolve({ dialog: true });
      this.dialogWaiters.add(w);
      off = () => this.dialogWaiters.delete(w);
    });
    try {
      return await Promise.race([p.then((value) => ({ value })), opened]);
    } finally {
      off();
    }
  }

  // ---- reading -------------------------------------------------------------------------------------

  private async metrics() {
    const m = await this.s.send('Page.getLayoutMetrics');
    const v = m.cssLayoutViewport ?? m.layoutViewport;
    const c = m.cssContentSize ?? m.contentSize;
    return { vw: v.clientWidth, vh: v.clientHeight, scrollX: v.pageX, scrollY: v.pageY, pageW: c.width, pageH: c.height };
  }

  private async axOf(s: CdpSession, frameId?: string): Promise<Map<number, AxInfo>> {
    const out = new Map<number, AxInfo>();
    try {
      const r = await s.send('Accessibility.getFullAXTree', frameId ? { frameId } : {}, 15_000);
      for (const n of r.nodes ?? []) {
        if (n.backendDOMNodeId === undefined || n.ignored) continue;
        const props: Record<string, unknown> = {};
        for (const p of n.properties ?? []) props[p.name] = p.value?.value;
        out.set(n.backendDOMNodeId, { role: String(n.role?.value ?? ''), name: String(n.name?.value ?? ''), props });
      }
    } catch {}
    return out;
  }

  private async frameSnap(s: CdpSession, sessionKey: string, owner?: FrameSnap['owner']): Promise<FrameSnap | null> {
    try {
      const snap = await s.send('DOMSnapshot.captureSnapshot', { computedStyles: SNAPSHOT_STYLES, includeDOMRects: false }, 20_000);
      const ax = await this.axOf(s);
      // Frames of the same process have accessibility trees of their own.
      for (const d of snap.documents.slice(1)) {
        const fid = snap.strings[d.frameId];
        if (fid) for (const [k, v] of await this.axOf(s, fid)) ax.set(k, v);
      }
      return { session: sessionKey, snap, ax, owner };
    } catch {
      return null;
    }
  }

  /** The page as an outline (and its numbered elements). */
  async snapshot(budget: number): Promise<Snapshot> {
    const [m, main] = await Promise.all([this.metrics(), this.frameSnap(this.s, '')]);
    if (!main) throw new CdpError('Could not read the page');
    const frames: FrameSnap[] = [main];
    // Cross-site frames: read each with where its <iframe> sits in the frame that holds it.
    for (const [frameId, fs] of this.frames) {
      const parent = await this.ownerOf(frameId);
      if (!parent) continue;
      const f = await this.frameSnap(fs, fs.id, parent);
      if (f) frames.push(f);
    }
    const seen = new Set<number>();
    const outline = buildOutline({
      frames,
      ...m,
      idFor: (session, backendNodeId) => {
        const k = `${session}:${backendNodeId}`;
        let id = this.ids.get(k);
        if (id === undefined) {
          id = this.owner.newId(this, session, backendNodeId);
          this.ids.set(k, id);
        }
        seen.add(id);
        return id;
      },
      prev: this.prev,
      userTyped: this.userTyped,
      budget,
      url: this.url,
    });
    this.prev = seen;
    const title = main.snap.strings[main.snap.documents[0]?.title] ?? '';
    if (title) this.title = title.slice(0, 300);
    return { outline, url: this.url, title: this.title, vw: m.vw, vh: m.vh, pageH: m.pageH, scrollY: m.scrollY };
  }

  /** The <iframe> holding a cross-site frame: the session it is in ('' for the tab) and its node. */
  private async ownerOf(frameId: string): Promise<{ session: string; backendNodeId: number } | null> {
    try {
      const r = await this.s.send('DOM.getFrameOwner', { frameId });
      return { session: '', backendNodeId: r.backendNodeId };
    } catch {}
    for (const [, fs] of this.frames) {
      try {
        const r = await fs.send('DOM.getFrameOwner', { frameId });
        return { session: fs.id, backendNodeId: r.backendNodeId };
      } catch {}
    }
    return null;
  }

  /** A screenshot of what is on screen (JPEG, base64), at most `width` × `height` pixels when given. */
  async screenshot(o: { quality?: number; width?: number; height?: number } = {}): Promise<string> {
    let clip: object | undefined;
    if (o.width) {
      // Clip coordinates are the document's: the visible part is where the page is scrolled to.
      const m = await this.s.send('Page.getLayoutMetrics');
      const v = m.cssVisualViewport ?? m.visualViewport;
      const dsf = this.viewport.scale || 1;
      const scale = Math.min(1, o.width / (v.clientWidth * dsf), o.height ? o.height / (v.clientHeight * dsf) : 1);
      clip = { x: v.pageX, y: v.pageY, width: v.clientWidth, height: v.clientHeight, scale };
    }
    const r = await this.s.send('Page.captureScreenshot', { format: 'jpeg', quality: o.quality ?? 70, ...(clip ? { clip } : {}), captureBeyondViewport: false }, 20_000);
    return r.data;
  }

  /** In an isolated world, so the page's own scripts cannot see or change what this does. */
  async evaluate<T>(expression: string): Promise<T> {
    if (this.world === null) {
      const w = await this.s.send('Page.createIsolatedWorld', { frameId: this.targetId, worldName: 'naget', grantUniveralAccess: false });
      this.world = w.executionContextId as number;
    }
    try {
      const r = await this.s.send('Runtime.evaluate', { expression, contextId: this.world, returnByValue: true, awaitPromise: true, timeout: 15_000 }, 20_000);
      if (r.exceptionDetails) throw new CdpError(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'The page script failed');
      return r.result?.value as T;
    } catch (e) {
      // The page moved on: a new world for the new document next time.
      if (/context|Cannot find/i.test((e as Error).message)) this.world = null;
      throw e;
    }
  }

  /** The page's readable text: headings, paragraphs, lists, tables, and where links go. */
  readable(max = 200_000): Promise<string> {
    return this.evaluate<string>(`(() => {
      const out = []; let line = ''; let size = 0;
      const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','CANVAS','OBJECT','HEAD','SELECT']);
      const flush = () => { const t = line.replace(/\\s+/g, ' ').trim(); if (t) { out.push(t); size += t.length; } line = ''; };
      const here = location.origin;
      const walk = (n, depth) => {
        if (size > ${max} || depth > 200) return;
        if (n.nodeType === 3) { line += n.nodeValue; return; }
        if (n.nodeType !== 1 && n.nodeType !== 11) return;
        const el = n;
        if (n.nodeType === 1) {
          if (skip.has(el.tagName)) return;
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          var block = /^(block|flex|grid|list-item|table|table-row|flow-root|table-caption)$/.test(cs.display) || /^(H[1-6]|P|LI|TR|BR|PRE|BLOCKQUOTE)$/.test(el.tagName);
          if (block) flush();
          const h = /^H([1-6])$/.exec(el.tagName); if (h) line += '#'.repeat(+h[1]) + ' ';
          if (el.tagName === 'LI') line += '- ';
          if (el.tagName === 'IMG' && el.alt) line += ' [image: ' + el.alt + '] ';
          if (el.tagName === 'IFRAME') { try { if (el.contentDocument && el.contentDocument.body) walk(el.contentDocument.body, depth + 1); } catch (e) {} }
        }
        const kids = el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes;
        for (const c of kids) walk(c, depth + 1);
        if (n.nodeType === 1) {
          if (el.tagName === 'A' && el.href && /^https?:/.test(el.href)) {
            const u = el.href.startsWith(here) ? el.href.slice(here.length) || '/' : el.href;
            if (u.length < 200 && !line.includes(u)) line += ' (' + u + ')';
          }
          if (el.tagName === 'TD' || el.tagName === 'TH') line += ' | ';
          if (block) flush();
        }
      };
      if (document.body) walk(document.body, 0);
      flush();
      return out.join('\\n').slice(0, ${max});
    })()`);
  }

  // ---- acting ----------------------------------------------------------------------------------------

  private sessionOf(ref: ElRef): CdpSession | null {
    if (!ref.session) return this.s;
    for (const [, fs] of this.frames) if (fs.id === ref.session) return fs;
    return null;
  }

  /** Where a cross-site frame's (0,0) is in the tab's viewport. */
  private async frameOffset(session: string): Promise<{ x: number; y: number }> {
    if (!session) return { x: 0, y: 0 };
    for (const [frameId, fs] of this.frames) {
      if (fs.id !== session) continue;
      const own = await this.ownerOf(frameId);
      if (!own) break;
      const holder = own.session ? this.sessionOf({ tab: this, session: own.session, backendNodeId: 0 }) : this.s;
      const q = await holder!.send('DOM.getContentQuads', { backendNodeId: own.backendNodeId });
      const up = await this.frameOffset(own.session);
      const quad = q.quads?.[0];
      if (quad) return { x: up.x + quad[0], y: up.y + quad[1] };
    }
    return { x: 0, y: 0 };
  }

  /** Scrolls an element into view and finds the point to click it, checking nothing covers it. */
  async point(ref: ElRef): Promise<Point> {
    const s = this.sessionOf(ref);
    if (!s) return { error: 'its frame has gone' };
    try {
      await s.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: ref.backendNodeId });
    } catch (e) {
      return { error: /not.*(found|visible)|No node/i.test((e as Error).message) ? 'it is no longer on the page' : (e as Error).message };
    }
    await sleep(60);
    let quads: number[][];
    try {
      quads = (await s.send('DOM.getContentQuads', { backendNodeId: ref.backendNodeId })).quads ?? [];
    } catch {
      return { error: 'it is not visible' };
    }
    const off = await this.frameOffset(ref.session);
    const { vw, vh } = await this.metrics();
    for (const q of quads) {
      const xs = [q[0], q[2], q[4], q[6]].map((v) => v + off.x);
      const ys = [q[1], q[3], q[5], q[7]].map((v) => v + off.y);
      const x0 = Math.max(0, Math.min(...xs));
      const x1 = Math.min(vw, Math.max(...xs));
      const y0 = Math.max(0, Math.min(...ys));
      const y1 = Math.min(vh, Math.max(...ys));
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;
      const p = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      // Something else on top (a cookie banner, a dialog) would take the click.
      if (!ref.session) {
        const cover = await this.coveredBy(ref.backendNodeId, p);
        if (cover) return { error: `it is covered by ${cover}` };
      }
      return p;
    }
    return { error: 'it is not visible (zero size or off screen)' };
  }

  /** What covers an element at a point, described; null when the element (or its own content) is there. */
  private async coveredBy(backendNodeId: number, p: { x: number; y: number }): Promise<string | null> {
    try {
      const hit = await this.s.send('DOM.getNodeForLocation', { x: Math.round(p.x), y: Math.round(p.y), includeUserAgentShadowDOM: false, ignorePointerEventsNone: true });
      if (!hit.backendNodeId || hit.backendNodeId === backendNodeId) return null;
      const [a, b] = await Promise.all([this.s.send('DOM.resolveNode', { backendNodeId }), this.s.send('DOM.resolveNode', { backendNodeId: hit.backendNodeId })]);
      const r = await this.s.send('Runtime.callFunctionOn', {
        objectId: a.object.objectId,
        functionDeclaration: `function (hit) {
          if (this === hit || this.contains(hit) || hit.contains(this)) return null;
          if (this.labels) for (const l of this.labels) if (l === hit || l.contains(hit)) return null;
          const root = this.getRootNode(); if (root && root.host && (root.host === hit || root.host.contains(hit))) return null;
          let el = hit.nodeType === 1 ? hit : hit.parentElement;
          for (let i = 0; el && i < 6; i++, el = el.parentElement) {
            const role = el.getAttribute('role'); const label = el.getAttribute('aria-label');
            if (role === 'dialog' || el.tagName === 'DIALOG' || /cookie|consent|modal|popup|overlay|banner/i.test(el.id + ' ' + el.className)) return (label ? 'a dialog “' + label + '”' : 'a dialog or banner') + ' (' + (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 80) + ')';
          }
          const t = (hit.nodeType === 1 ? hit : hit.parentElement);
          return t ? '<' + t.tagName.toLowerCase() + '> “' + (t.innerText || t.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 60) + '”' : 'another element';
        }`,
        arguments: [{ objectId: b.object.objectId }],
        returnByValue: true,
      });
      return r.result?.value ?? null;
    } catch {
      return null;
    }
  }

  async mouse(type: 'mouseMoved' | 'mousePressed' | 'mouseReleased', x: number, y: number, o: { button?: string; clicks?: number; mods?: number } = {}) {
    await this.s.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? (o.button ?? 'none') : (o.button ?? 'left'), buttons: type === 'mousePressed' ? 1 : 0, clickCount: o.clicks ?? (type === 'mouseMoved' ? 0 : 1), modifiers: o.mods ?? 0 });
  }

  /** A real click (moved, pressed, released); `dialog` when the page opened one meanwhile. */
  async click(p: { x: number; y: number }, clicks = 1): Promise<'ok' | 'dialog'> {
    const r = await this.raceDialog(
      (async () => {
        await this.mouse('mouseMoved', p.x, p.y);
        for (let c = 1; c <= clicks; c++) {
          await this.mouse('mousePressed', p.x, p.y, { clicks: c });
          await this.mouse('mouseReleased', p.x, p.y, { clicks: c });
        }
      })(),
    );
    return 'dialog' in r ? 'dialog' : 'ok';
  }

  async key(spec: string): Promise<'ok' | 'dialog' | 'unknown'> {
    const k = parseKey(spec);
    if (!k) return 'unknown';
    const r = await this.raceDialog(
      (async () => {
        for (const e of keyEvents(k.def, k.mods)) await this.s.send('Input.dispatchKeyEvent', e);
      })(),
    );
    return 'dialog' in r ? 'dialog' : 'ok';
  }

  /** Calls a function on an element (in its own frame), returning its value. */
  async onElement<T>(ref: ElRef, fn: string, args: unknown[] = []): Promise<T> {
    const s = this.sessionOf(ref);
    if (!s) throw new CdpError('its frame has gone');
    const o = await s.send('DOM.resolveNode', { backendNodeId: ref.backendNodeId });
    const r = await s.send('Runtime.callFunctionOn', { objectId: o.object.objectId, functionDeclaration: fn, arguments: args.map((value) => ({ value })), returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new CdpError(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'failed');
    return r.result?.value as T;
  }

  /** Focuses a field and selects what it holds, so typing replaces it. */
  async focusField(ref: ElRef): Promise<{ kind: string; value: string } | { error: string }> {
    try {
      return await this.onElement(ref, `function () {
        const el = this;
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        el.focus();
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          if (el.disabled) return { error: 'it is disabled' };
          if (el.readOnly) return { error: 'it is read-only' };
          try { el.select(); } catch (e) {}
          return { kind: tag === 'INPUT' ? (el.type || 'text') : 'textarea', value: el.value };
        }
        if (el.isContentEditable) {
          const r = document.createRange(); r.selectNodeContents(el);
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
          return { kind: 'editable', value: el.innerText };
        }
        const inner = el.querySelector('input:not([type=hidden]),textarea,[contenteditable=""],[contenteditable=true]');
        if (inner) { inner.focus(); try { inner.select(); } catch (e) {} return { kind: 'inner', value: inner.value ?? inner.innerText }; }
        return { error: 'it is not a field you can type into' };
      }`);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  async insertText(text: string): Promise<'ok' | 'dialog'> {
    const r = await this.raceDialog(this.s.send('Input.insertText', { text }));
    return 'dialog' in r ? 'dialog' : 'ok';
  }

  /** Sets a field the keyboard cannot fill well (a date, a colour, a range) and tells the page. */
  setValue(ref: ElRef, value: string): Promise<string> {
    return this.onElement<string>(
      ref,
      `function (v) {
        const proto = Object.getPrototypeOf(this);
        const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (set) set.call(this, v); else this.value = v;
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return String(this.value);
      }`,
      [value],
    );
  }

  /** Picks an option of a <select> by its text or value. */
  select(ref: ElRef, option: string): Promise<{ ok: true; label: string } | { ok: false; options: string[]; notSelect?: boolean }> {
    return this.onElement(
      ref,
      `function (want) {
        if (this.tagName !== 'SELECT') return { ok: false, notSelect: true, options: [] };
        const opts = [...this.options];
        const norm = (s) => String(s).replace(/\\s+/g, ' ').trim().toLowerCase();
        const w = norm(want);
        const o = opts.find((x) => norm(x.label || x.text) === w) || opts.find((x) => norm(x.value) === w) || opts.find((x) => norm(x.label || x.text).includes(w));
        if (!o) return { ok: false, options: opts.map((x) => (x.label || x.text).trim()).slice(0, 40) };
        this.focus();
        this.value = o.value;
        o.selected = true;
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, label: (o.label || o.text).trim() };
      }`,
      [option],
    );
  }

  /** Scrolls the page (or the scrolling box under a point) by a wheel turn. */
  async wheel(x: number, y: number, dx: number, dy: number) {
    await this.s.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx, deltaY: dy, modifiers: 0 });
  }

  async scrollY(): Promise<number> {
    return (await this.metrics()).scrollY;
  }

  async back(): Promise<boolean> {
    const h = await this.s.send('Page.getNavigationHistory');
    if (h.currentIndex <= 0) return false;
    await this.s.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id });
    this.navigating = true;
    return true;
  }

  async navigate(url: string): Promise<string | null> {
    this.navigating = true;
    const r = await this.s.send('Page.navigate', { url, transitionType: 'typed' }, 30_000);
    if (r.errorText) {
      this.navigating = false;
      return r.errorText as string;
    }
    if (!r.loaderId) this.navigating = false;
    return null;
  }

  async reload() {
    this.navigating = true;
    await this.s.send('Page.reload', {});
  }

  async answerDialog(accept: boolean, text?: string) {
    await this.s.send('Page.handleJavaScriptDialog', { accept, ...(text !== undefined ? { promptText: text } : {}) });
  }

  async setFiles(ref: ElRef, files: string[]) {
    const s = this.sessionOf(ref);
    if (!s) throw new CdpError('its frame has gone');
    await s.send('DOM.setFileInputFiles', { files, backendNodeId: ref.backendNodeId });
  }

  /** What the user is typing into now, so its value never reaches the agent. */
  async markTyped() {
    try {
      const r = await this.s.send('Runtime.evaluate', { expression: 'document.activeElement', returnByValue: false });
      if (!r.result?.objectId) return;
      let o = r.result.objectId;
      // Into shadow roots and same-site frames, to the field itself.
      for (let i = 0; i < 4; i++) {
        const d = await this.s.send('Runtime.callFunctionOn', { objectId: o, functionDeclaration: 'function () { return (this.shadowRoot && this.shadowRoot.activeElement) || (this.contentDocument && this.contentDocument.activeElement) || null; }', returnByValue: false });
        if (!d.result?.objectId) break;
        o = d.result.objectId;
      }
      const n = await this.s.send('DOM.describeNode', { objectId: o });
      if (n.node?.backendNodeId) this.userTyped.add(`:${n.node.backendNodeId}`);
    } catch {}
  }

  // ---- the live view -------------------------------------------------------------------------------

  async startCast(onFrame: (f: { data: string; w: number; h: number }) => void, o: { maxWidth: number; maxHeight: number }) {
    this.screencast = onFrame;
    this.castOpts = o;
    await this.s.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: Math.round(o.maxWidth), maxHeight: Math.round(o.maxHeight), everyNthFrame: 1 });
  }

  async stopCast() {
    if (!this.screencast) return;
    this.screencast = null;
    this.castOpts = null;
    await this.s.send('Page.stopScreencast').catch(() => {});
  }

  get casting() {
    return !!this.screencast;
  }

  private frame(p: any) {
    const ack = () => this.s.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
    if (!this.screencast) return void ack();
    const m = p.metadata ?? {};
    this.screencast({ data: p.data, w: m.deviceWidth ?? this.viewport.w, h: m.deviceHeight ?? this.viewport.h });
    // At most about eight frames a second: the next one is asked for a little later.
    const wait = Math.max(0, 120 - (Date.now() - this.lastFrameAt));
    this.lastFrameAt = Date.now() + wait;
    setTimeout(ack, wait);
  }
}

export type { El };
