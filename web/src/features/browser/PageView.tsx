// A browser's page in the app. In the desktop app, your own tabs (fit 'fill') are the page itself: a native view the
// app's window lays over the place of this box. The native page always draws over the app's own page, so while a menu,
// a dialog or a toast floats over the box, or the box is out of sight, the page is taken away and a picture of it as
// it was (taken just before, by the desktop app) shows there until that is over; so it is under the page's right-click menu,
// which is drawn here in the app's own look (PageMenu). An agent's tab (fit 'scale') is drawn off screen by the
// desktop app, which sends its frames here (about 30 a second) to a canvas, and the mouse, wheel and keys go straight
// to the page. Everywhere else, and for a tab the desktop app does not have, the live picture (LiveView), as before.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { MOD, type BrowserInput, type BrowserView } from '@shared/browser';
import { cx } from '../../components/ui';
import { AgentPointer } from './AgentPointer';
import { KEYCODES, LiveView, mods, type LiveViewApi } from './LiveView';
import { PageMenu } from './PageMenu';
import { hostOf } from './store';

/** A place in the app's window, in CSS pixels of the app's page. */
export interface PageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the desktop app's window gives the page for its own browser (desktop/preload.cjs); absent elsewhere. */
export interface DesktopBrowserBridge {
  show(target: string, rect: PageRect, opts: { fit: 'scale' | 'fill' }): Promise<boolean>;
  hide(target?: string): Promise<void>;
  /** A picture of one of your own tabs as it is shown now (a JPEG data URL of its place, in the screen's own pixels); null when it is not shown. An older app does not have it. */
  still?(target: string): Promise<string | null>;
  focus(target: string): Promise<void>;
  popup(extensionId: string, rect: PageRect): Promise<boolean>;
  /** An extension's badge or title changed; the function it returns stops listening (for this call only). */
  onBadge(fn: (b: { extension: string; text: string; color?: string; title?: string }) => void): () => void;
  /** An agent's tab (drawn off screen): its frames (JPEG, the page's size in CSS pixels) and cursor, until the function it resolves to is called. Null when it is not one of this app's. */
  watch(target: string, onFrame: (f: PageFrame) => void, onCursor?: (cursor: string) => void): Promise<null | (() => void)>;
  /** Your clicks, wheel, keys and text, as real input on that tab. */
  input(target: string, events: BrowserInput[]): Promise<boolean>;
  edit(target: string, op: PageEdit): Promise<void>;
  /** A shortcut pressed in one of your own native pages (they take keys themselves); the function it returns stops listening (for this call only). */
  onKey(fn: (k: { key: string; ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }) => void): () => void;
  /** Shows a downloaded file in the system's file manager. */
  showFile(path: string): Promise<boolean>;
  /** The page's own find, in one of your own tabs: how many matches and which is shown (null: not one of this app's tabs); empty text stops it. */
  find(target: string, text: string, opts?: { forward?: boolean; findNext?: boolean; matchCase?: boolean }): Promise<{ matches: number; active: number } | null>;
  /** The zoom factor after zooming a tab in, out or back to 100 % (Ctrl or ⌘ with + − 0 the app handles itself). */
  zoom(target: string, op: 'in' | 'out' | 'reset'): Promise<number>;
  /** The system's print dialog for a tab's page. */
  print(target: string): Promise<void>;
  mute(target: string, muted: boolean): Promise<void>;
  /** An address (http or https) in the computer's default browser. */
  openExternal(url: string): Promise<boolean>;
  /** A tab's sound, zoom, how many ads and trackers were blocked on its page, and full screen, as they change (only what changed); the function it returns stops listening. */
  onTabState(fn: (s: TabStateChange) => void): () => void;
  /** What the right-click menu of a page asks of the app; the function it returns stops listening. */
  onCommand(fn: (c: PageCommand) => void): () => void;
  /** The right-click menu of one of your tabs, for this page to draw in the app's own look (while anything listens, the system's menu does not show); the function it returns stops listening. An older app does not have it. */
  onMenu?(fn: (m: PageMenuRequest) => void): () => void;
  /** What was picked in that menu (an item's id), or null when it closed with nothing picked; whether it was done. */
  menuPick?(target: string, menu: number, item: string | null): Promise<boolean>;
  /** Which search engine the right-click menu searches with (an older app does not have it). */
  setPrefs?(prefs: { engine: string; customSearch?: string }): Promise<void> | void;
  /** A picture of a tab's page (what shows, or all of it) saved to Downloads and put on the clipboard when it can be; null when none was made (an older app does not have it). */
  capture?(target: string, whole: boolean): Promise<{ path: string; name: string; copied: boolean } | null>;
  /** A tab's page as a PDF file in Downloads (an older app does not have it). */
  savePdf?(target: string): Promise<{ path: string; name: string } | null>;
  /** Deletes the cookies and site data of a tab's site; which site it was (an older app does not have it). */
  clearSite?(target: string): Promise<{ cleared: boolean; site: string } | null>;
}

/** What a tab's state said changed. */
export interface TabStateChange {
  target: string;
  audible?: boolean;
  muted?: boolean;
  zoom?: number;
  blocked?: number;
  fullscreen?: boolean;
}

/** What a page's right-click menu asks of the app. */
export type PageCommand =
  | { cmd: 'ask'; text: string; url: string }
  | { cmd: 'bookmark'; url: string; title: string }
  | { cmd: 'later'; url: string; title: string }
  | { cmd: 'save-image'; path: string; name: string; url: string; title: string }
  | { cmd: 'ask-image'; path: string; name: string; url: string; title: string }
  | { cmd: 'picture-failed'; message: string }
  | { cmd: 'highlight'; target: string; url: string; title: string }
  | { cmd: 'unhighlight'; id: string; url: string }
  | { cmd: 'open-private'; url: string }
  | { cmd: 'translate'; target: string }
  | { cmd: 'translate-text'; text: string; url: string };

/** An item of a page's right-click menu: what the desktop app offers where you clicked (its id names it), or a line. */
export type PageMenuItem = { type: 'separator' } | { id: string; label: string; enabled: boolean; checked?: boolean; args?: { engine?: string; text?: string; lang?: string } };

/** A page's right-click menu for the app to draw: the point clicked (in the app's own pixels), its items, and a picture of the page as it was. */
export interface PageMenuRequest {
  target: string;
  menu: number;
  x: number;
  y: number;
  items: PageMenuItem[];
  still: string | null;
}

export interface PageFrame {
  jpeg: ArrayBuffer;
  w: number;
  h: number;
}
export type PageEdit = 'copy' | 'cut' | 'paste' | 'selectAll' | 'undo' | 'redo';

/** The desktop app's browser bridge, when this page runs in the desktop app and it has one. */
export const desktopBrowser = (): DesktopBrowserBridge | undefined => (window as unknown as { hydorDesktop?: { browser?: DesktopBrowserBridge } }).hydorDesktop?.browser;

export type PageViewProps = { k: string; view: BrowserView; driving: boolean; small?: boolean; plain?: boolean; className?: string; maxH?: string; tab?: string; fit?: 'scale' | 'fill' };

/** Whether this view's pages are the desktop app's own and the window can show them. */
export const nativePages = (view: BrowserView | undefined) => !!desktopBrowser() && view?.engine === 'desktop';

export const PageView = forwardRef<LiveViewApi, PageViewProps>(function PageView({ tab, fit, ...p }, ref) {
  const live = useRef<LiveViewApi>(null);
  // The native page has the keyboard itself; only the picture and the canvas have keys of their own to press.
  useImperativeHandle(ref, () => ({ keyboard: () => live.current?.keyboard(), press: (key) => live.current?.press(key) }));
  const target = tab ?? p.view.tabs.find((t) => t.active)?.id ?? p.view.tabs[0]?.id;
  // A tab the desktop app does not show (the server's Chromium, another machine's): the picture, for as long as it is that tab.
  const [refused, setRefused] = useState<string | null>(null);
  if (!nativePages(p.view) || !target || refused === `${p.k}:${target}`) return <LiveView ref={live} {...p} />;
  const onRefused = () => setRefused(`${p.k}:${target}`);
  if (fit === 'fill') return <NativePage {...p} target={target} fit="fill" onRefused={onRefused} />;
  return <CanvasPage ref={live} {...p} target={target} onRefused={onRefused} />;
});

const same = (a: PageRect | null, b: PageRect) => !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** The sample points of a place: its corners (inset a little, for rounded ones), edges, and an inner grid. */
function points(r: DOMRect): [number, number][] {
  const out: [number, number][] = [];
  const ix = Math.min(12, r.width / 4);
  const iy = Math.min(12, r.height / 4);
  for (const fy of [0, 1 / 3, 2 / 3, 1]) {
    for (const fx of [0, 0.25, 0.5, 0.75, 1]) {
      out.push([r.left + Math.min(r.width - ix, Math.max(ix, fx * r.width)), r.top + Math.min(r.height - iy, Math.max(iy, fy * r.height))]);
    }
  }
  return out;
}

/** The ancestors of the box that cut what is in them (their own scrolling or clipping). Their styles change rarely: found now and then. */
function clippers(box: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let el = box.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.display === 'none') out.push(el);
  }
  return out;
}

/** Whether no ancestor with its own scrolling or clipping cuts the box away (r is its place). */
function uncut(cuts: HTMLElement[], r: DOMRect): boolean {
  for (const el of cuts) {
    const c = el.getBoundingClientRect();
    if (c.width === 0 && c.height === 0) return false; // display: none
    if (r.left < c.left - 1 || r.top < c.top - 1 || r.right > c.right + 1 || r.bottom > c.bottom + 1) return false;
  }
  return true;
}

const NOT_LAYERS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT']);
/** The floating layers of the app (menus, dialogs, toasts: portals, children of the body) that have something in them now. */
function layers(box: HTMLElement): Element[] {
  const out: Element[] = [];
  for (const c of document.body.children) if (c.id !== 'boot' && !NOT_LAYERS.has(c.tagName) && !c.contains(box) && c.firstElementChild) out.push(c);
  return out;
}

/**
 * Whether something the floating layers draw lies over the box (r): a menu's panel, a tooltip, a toast. Found by where
 * each is, not by a few points over the box: a narrow menu at the box's edge (the browser's ⋯ menu) fell between them,
 * and the page stayed over it while it was open. What only holds the rest (a wrapper as big as the window, a box that
 * draws nothing of its own) is looked into rather than counted, and what is not drawn (hidden, transparent, a pixel) is
 * passed over; a dim over everything is the points' to find, since it takes the pointer.
 */
function overLayers(ls: Element[], r: DOMRect): boolean {
  let budget = 200;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const visit = (n: Element, depth: number): boolean => {
    if (--budget < 0) return false;
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const b = n.getBoundingClientRect();
    if (b.width >= 2 && b.height >= 2 && b.right > r.left + 1 && b.left < r.right - 1 && b.bottom > r.top + 1 && b.top < r.bottom - 1) {
      const whole = b.width >= W - 2 && b.height >= H - 2;
      const lines = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderRightWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth);
      const bare = cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none' && cs.boxShadow === 'none' && cs.backdropFilter === 'none' && !lines;
      if (!whole && !(bare && n.firstElementChild)) return true;
    }
    if (depth >= 5) return false;
    for (const c of Array.from(n.children)) if (visit(c, depth + 1)) return true;
    return false;
  };
  return ls.some((l) => visit(l, 0));
}

/** Transitions of these properties move things; the rest (colours, opacity, shadows) cannot move the box. */
const MOVING = /^(width|height|min-|max-|top|left|right|bottom|inset|margin|padding|transform|translate|scale|flex|grid|gap|border(-\w+)?-width|font-size|line-height|display|visibility)/;

function NativePage({ k, view, driving, small, plain, className, maxH, target, fit, onRefused }: PageViewProps & { target: string; fit: 'scale' | 'fill'; onRefused: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  // True while the page is taken away (something floats over its place, or it is out of sight): the picture shows instead.
  const [away, setAway] = useState(false);
  // The picture of the page from just before it was taken away (null: none, the placeholder shows).
  const [still, setStill] = useState<string | null>(null);
  const refused = useRef(onRefused);
  refused.current = onRefused;
  const wasDriving = useRef(driving);
  const shown = useRef(false);
  // What hides the page once its picture is drawn in its place (Still calls it), while a picture is going in.
  const drawn = useRef<(() => void) | null>(null);
  // The page's right-click menu, drawn here in the app's own look while it is open (the page goes away under it).
  const [menu, setMenu] = useState<PageMenuRequest | null>(null);
  // The last press in the app's page while that menu is open, outside it: on the page's picture, or on something of the app.
  const pressOn = useRef<'page' | 'app' | null>(null);

  useEffect(() => {
    const bridge = desktopBrowser();
    const el = box.current;
    if (!bridge || !el) return;
    let gone = false;
    let at: PageRect | null = null; // where the page was last shown, null while it is taken away
    let out = false; // the picture is up instead (mirrors `away`, for this effect's own checks)
    let gen = 0;
    let until = 0;
    let raf = 0;
    let cuts = clippers(el);
    let taking = false; // a picture is being made, the page is still up
    let okAt = 0; // since when the box has been free again, while the picture is up
    let wait = 0;
    // A press outside the page often opens something over it (a menu): its picture is taken at once, so that the page
    // can go as soon as that opens, not a picture later.
    let early: { pic: Promise<string | null>; at: number } | null = null;

    // The page goes away for a while: a picture of it as it is first (the page is still there while it is made, a few
    // milliseconds), laid in its place under it, and the page is hidden only once the picture is drawn there. Hidden
    // as soon as the picture came, the place would show empty for the frames a big picture takes to decode (a flash
    // under a menu). A change of mind meanwhile (the box shows again) drops it all.
    const takeAway = () => {
      if (taking) return;
      const mine = ++gen; // a show still on its way is forgotten (its answer is ignored) and hidden with the rest
      const was = at;
      at = null;
      shown.current = false;
      if (!was) {
        out = true;
        setAway(true);
        return;
      }
      taking = true;
      const fresh = early && performance.now() - early.at < 1500 ? early.pic : null;
      early = null;
      const done = (src: string | null) => {
        if (gone || mine !== gen) {
          taking = false;
          return;
        }
        let late = 0;
        const leave = () => {
          if (drawn.current !== leave) return;
          drawn.current = null;
          window.clearTimeout(late);
          taking = false;
          if (gone || mine !== gen) return;
          void bridge.hide(target).catch(() => {});
          out = true;
        };
        drawn.current = leave;
        // A picture that is slow to draw does not keep the page over a menu for long.
        late = window.setTimeout(leave, 300);
        setStill(src);
        setAway(true);
      };
      if (!bridge.still) return done(null);
      (fresh ?? bridge.still(target).catch(() => null)).then(done);
    };

    // `scan`: look at what lies over the box too (always when a floating layer is up, otherwise only now and then).
    const check = (scan = false) => {
      if (gone) return;
      const r = el.getBoundingClientRect();
      let ok = document.visibilityState === 'visible' && r.width >= 8 && r.height >= 8 && r.bottom > 0 && r.right > 0 && r.left < window.innerWidth && r.top < window.innerHeight && uncut(cuts, r);
      // Nothing may lie over any part of it (menus, dialogs, toasts, the app's own overlays), nor cut it (scrolled out, clipped).
      const ls = ok ? layers(el) : [];
      if (ls.length && overLayers(ls, r)) ok = false;
      if (ok && (scan || ls.length)) {
        for (const [x, y] of points(r)) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(hit === el || el.contains(hit))) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) {
        okAt = 0;
        if (at || !out) takeAway();
        return;
      }
      // The box is free again, but only once it has been for a moment (a list that closes and opens as you type keeps the
      // picture up, and the page is not taken and shown again at every key).
      if (out && !at && !taking) {
        const now = performance.now();
        if (!okAt) okAt = now;
        if (now - okAt < 120) {
          window.clearTimeout(wait);
          wait = window.setTimeout(kick, 130 - (now - okAt));
          return;
        }
      }
      const rect = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      if (same(at, rect)) return;
      until = Math.max(until, performance.now() + 400); // still moving: keep watching it closely
      const mine = ++gen;
      at = rect;
      bridge
        .show(target, rect, { fit })
        .catch(() => false)
        .then((okShown) => {
          if (gone || mine !== gen) return;
          if (!okShown) {
            at = null;
            onceRefused();
            return;
          }
          shown.current = true;
          out = false;
          setAway(false);
        });
    };
    let refusedOnce = false;
    const onceRefused = () => {
      if (refusedOnce) return;
      refusedOnce = true;
      refused.current();
    };

    // Whatever may move or cover the place is watched for: a frame at a time while it changes, nothing while it does not.
    const loop = () => {
      raf = 0;
      check();
      if (!gone && performance.now() < until) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      until = Math.max(until, performance.now() + 700);
      if (!raf && !gone) raf = requestAnimationFrame(loop);
    };
    const refresh = () => {
      cuts = clippers(el);
      kick();
    };
    const ro = new ResizeObserver((entries) => (entries.some((e) => e.target === el) ? refresh() : kick()));
    ro.observe(el);
    ro.observe(document.documentElement);
    // The app's floating layers are children of the body: one appearing or going, or what is in it changing (a toast).
    const lo = new MutationObserver(kick);
    const watchLayers = () => {
      lo.disconnect();
      for (const c of document.body.children) if (!c.contains(el)) lo.observe(c, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    };
    const mo = new MutationObserver(() => {
      watchLayers();
      kick();
    });
    mo.observe(document.body, { childList: true });
    watchLayers();
    // A scroll that moves the box (the document's, or one of the box's ancestors'): not the app's other scrolling.
    const scrolled = (e: Event) => {
      const t = e.target as Node | null;
      if (!t || t === document || t.contains(el)) kick();
    };
    const moved = (e: Event) => {
      const p = (e as TransitionEvent).propertyName;
      // A transition of what cannot move anything (a colour on hover) is not looked at.
      if (p !== undefined && !MOVING.test(p)) return;
      kick();
    };
    const pressed = (e: PointerEvent) => {
      kick();
      if (at && !taking && bridge.still && !el.contains(e.target as Node)) early = { pic: bridge.still(target).catch(() => null), at: performance.now() };
      if (!(e.target as Element | null)?.closest?.('[role="menu"]')) pressOn.current = el.contains(e.target as Node) ? 'page' : 'app';
    };
    // The page's right-click menu: the picture taken as it was asked for lets the page go as soon as the menu is drawn.
    const offMenu = bridge.onMenu?.((m) => {
      if (gone || m.target !== target) return;
      if (m.still && at && !taking) early = { pic: Promise.resolve(m.still), at: performance.now() };
      pressOn.current = null;
      setMenu(m);
    });
    window.addEventListener('resize', kick);
    window.addEventListener('scroll', scrolled, true);
    document.addEventListener('visibilitychange', kick);
    document.addEventListener('pointerdown', pressed, true);
    for (const ev of ['transitionrun', 'transitionend', 'animationstart', 'animationend']) document.addEventListener(ev, moved, true);
    // What nothing announces (an overlay shown in place, a sibling's layout) is caught by a look once a second.
    const timer = window.setInterval(() => {
      cuts = clippers(el);
      check(true);
    }, 1000);
    check(true);
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(wait);
      window.clearInterval(timer);
      ro.disconnect();
      lo.disconnect();
      mo.disconnect();
      offMenu?.();
      window.removeEventListener('resize', kick);
      window.removeEventListener('scroll', scrolled, true);
      document.removeEventListener('visibilitychange', kick);
      document.removeEventListener('pointerdown', pressed, true);
      for (const ev of ['transitionrun', 'transitionend', 'animationstart', 'animationend']) document.removeEventListener(ev, moved, true);
      // Shown, or still up while its picture is made or drawn: hidden with the place it had.
      if (at || shown.current || taking) void bridge.hide(target).catch(() => {});
      drawn.current = null;
      shown.current = false;
    };
    // The box's shape (the page's proportions, the cap) moves it without any of the above: the observers see that too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, target, fit]);

  // A picture of another page is not this one's, nor is its menu.
  useEffect(() => {
    setStill(null);
    setMenu(null);
  }, [k, target]);

  // What was picked (or that nothing was) goes to the desktop app, which does it. The page had the keys (you right-clicked
  // in it) and gets them back when it shows again, unless the menu closed with a press on something else of the app,
  // which has them now. An item that opens a field of the app (Ask) takes them after.
  const menuEnded = (item: string | null) => {
    const bridge = desktopBrowser();
    if (!bridge || !menu) return;
    void bridge.menuPick?.(target, menu.menu, item).catch(() => false);
    if (item === null && pressOn.current === 'app') return;
    void bridge.focus(target).catch(() => {});
  };

  // You take over: the page gets the keyboard.
  useEffect(() => {
    if (driving && !wasDriving.current && shown.current) void desktopBrowser()?.focus(target).catch(() => {});
    wasDriving.current = driving;
  }, [driving, target]);

  const ratio = view.viewport.w / Math.max(1, view.viewport.h);
  const scale = fit === 'scale';
  return (
    <div
      ref={box}
      className={cx('relative overflow-hidden bg-bg-2', scale && 'mx-auto', driving && !plain && 'ring-2 ring-accent', className)}
      style={scale ? { aspectRatio: ratio, width: maxH ? `min(100%, calc(${maxH} * ${ratio}))` : undefined } : undefined}
    >
      {away && <Still src={still} view={view} target={target} small={small} onDrawn={() => drawn.current?.()} />}
      {menu && <PageMenu key={menu.menu} req={menu} onPick={menuEnded} onDone={() => setMenu(null)} />}
    </div>
  );
}

/**
 * The picture of a tab from just before its native page was taken away (or its title, quietly, when there is none) where
 * the page was. `onDrawn`: once it is on the screen (decoded, and a frame painted with it), so the page over it may go.
 */
function Still({ src, view, target, small, onDrawn }: { src: string | null; view: BrowserView; target: string; small?: boolean; onDrawn: () => void }) {
  const tab = view.tabs.find((t) => t.id === target);
  const img = useRef<HTMLImageElement>(null);
  const ready = useRef(onDrawn);
  ready.current = onDrawn;
  useEffect(() => {
    let live = true;
    // The second frame from now is painted with it (the first one's callbacks run before it is painted).
    const after = () => void requestAnimationFrame(() => requestAnimationFrame(() => live && ready.current()));
    if (src && img.current) img.current.decode().then(after, after);
    else after();
    return () => {
      live = false;
    };
  }, [src]);
  if (src) return <img ref={img} src={src} alt="The browser’s page" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-left-top" />;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center text-fg-3">
      <Globe size={small ? 16 : 22} />
      {!small && (
        <span translate="no" className="max-w-full truncate text-[12.5px]">
          {tab?.title || hostOf(tab?.url ?? '') || ''}
        </span>
      )}
    </div>
  );
}

/** Where the pointer is in a box, as fractions of it. */
const at = (el: HTMLElement, e: { clientX: number; clientY: number }) => {
  const r = el.getBoundingClientRect();
  return { x: (e.clientX - r.left) / Math.max(1, r.width), y: (e.clientY - r.top) / Math.max(1, r.height) };
};
const BUTTONS = ['left', 'middle', 'right'] as const;

/** Edits the shortcuts stand for: Ctrl or ⌘ with C, X, V, A, Z (and Shift+Z, or Y, for redo). */
function editOf(e: React.KeyboardEvent): PageEdit | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'c') return 'copy';
  if (k === 'x') return 'cut';
  if (k === 'v') return 'paste';
  if (k === 'a') return 'selectAll';
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && e.ctrlKey) return 'redo';
  return null;
}

/** Input on its way to a tab: moves merge, wheel turns add up, one call at a time, in order. */
function relay(target: string) {
  let queue: BrowserInput[] = [];
  let busy = false;
  const flush = async () => {
    const bridge = desktopBrowser();
    if (busy || !queue.length || !bridge) return;
    busy = true;
    const batch = queue.splice(0, 100);
    try {
      await bridge.input(target, batch);
    } catch {
      queue = [];
    } finally {
      busy = false;
      if (queue.length) void flush();
    }
  };
  return (e: BrowserInput) => {
    const last = queue[queue.length - 1];
    if (e.t === 'mouse' && e.type === 'move' && last?.t === 'mouse' && last.type === 'move') queue[queue.length - 1] = e;
    else if (e.t === 'wheel' && last?.t === 'wheel') {
      last.dx += e.dx;
      last.dy += e.dy;
    } else queue.push(e);
    void flush();
  };
}

/**
 * An agent's tab in the desktop app: the frames the app sends are drawn on a canvas (sharp on a sharp screen), and your
 * mouse, wheel, keys and typed text go to the page as they are. Clicking or typing makes you the driver (the server
 * hears it from the desktop app), so the panel's line changes by itself. A hidden field takes the typing, so that
 * accents, dead keys and input methods work.
 */
const CanvasPage = forwardRef<LiveViewApi, PageViewProps & { target: string; onRefused: () => void }>(function CanvasPage({ k, view, driving, small, plain, className, maxH, target, onRefused }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const kb = useRef<HTMLTextAreaElement>(null);
  const bitmap = useRef<ImageBitmap | null>(null);
  const refused = useRef(onRefused);
  refused.current = onRefused;
  const [size, setSize] = useState<{ w: number; h: number }>({ w: view.viewport.w, h: view.viewport.h });
  const [has, setHas] = useState(false);
  const send = useMemo(() => relay(target), [target]);

  const paint = () => {
    const c = canvas.current;
    const b = bitmap.current;
    const el = box.current;
    if (!c || !b || !el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(el.clientWidth * dpr));
    const h = Math.max(1, Math.round(el.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.imageSmoothingQuality = 'high';
    // The page keeps its proportions in the box (the box has them already, but a frame may still be of another shape).
    const s = Math.min(w / b.width, h / b.height);
    const dw = b.width * s;
    const dh = b.height * s;
    g.clearRect(0, 0, w, h);
    g.drawImage(b, (w - dw) / 2, (h - dh) / 2, dw, dh);
  };

  // The desktop app's frames, while this page is shown (nothing is sent to a window nobody sees).
  useEffect(() => {
    const bridge = desktopBrowser();
    if (!bridge) return;
    let gone = false;
    let stop: (() => void) | null = null;
    let starting = false;
    let decoding = false;
    let pending: PageFrame | null = null;
    const draw = (f: PageFrame) => {
      // One frame is decoded at a time; those that arrive meanwhile are replaced by the newest.
      if (decoding) {
        pending = f;
        return;
      }
      decoding = true;
      createImageBitmap(new Blob([f.jpeg], { type: 'image/jpeg' }))
        .then((b) => {
          if (gone) return b.close();
          bitmap.current?.close();
          bitmap.current = b;
          setHas(true);
          setSize((s) => (Math.abs(s.w / s.h - f.w / f.h) > 0.005 ? { w: f.w, h: f.h } : s));
          paint();
        })
        .catch(() => {})
        .finally(() => {
          decoding = false;
          const p = pending;
          pending = null;
          if (p && !gone) draw(p);
        });
    };
    const cursor = (c: string) => {
      if (canvas.current) canvas.current.style.cursor = c || 'default';
    };
    const start = async () => {
      if (gone || stop || starting || document.visibilityState !== 'visible') return;
      starting = true;
      let s: null | (() => void) = null;
      try {
        s = await bridge.watch(target, draw, cursor);
      } catch {}
      starting = false;
      if (gone) return void s?.();
      if (!s) {
        if (!bitmap.current) refused.current();
        return;
      }
      stop = s;
    };
    const halt = () => {
      stop?.();
      stop = null;
    };
    const vis = () => (document.visibilityState === 'visible' ? void start() : halt());
    document.addEventListener('visibilitychange', vis);
    void start();
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', vis);
      halt();
      bitmap.current?.close();
      bitmap.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, target]);

  // A change of the box's size draws the latest frame again, at the new size.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const press = (key: string, m = 0) => {
    const text = key === 'Enter' ? '\r' : key.length === 1 ? key : undefined;
    send({ t: 'key', type: 'down', key, code: key.length === 1 ? '' : key, keyCode: KEYCODES[key] ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0), text, mods: m });
    send({ t: 'key', type: 'up', key, code: key.length === 1 ? '' : key, keyCode: KEYCODES[key] ?? 0, mods: m });
  };
  useImperativeHandle(ref, () => ({ keyboard: () => kb.current?.focus({ preventScroll: true }), press: (key) => press(key) }));

  // The wheel needs a listener that may stop the app's own page from scrolling; it goes to the page once you drive it.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !driving) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = at(el, e);
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      send({ t: 'wheel', x: p.x, y: p.y, dx: e.deltaX * unit, dy: e.deltaY * unit });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [driving, send]);
  // Handed back: the keys stop going to the page (the next click or key would take it again).
  useEffect(() => {
    if (!driving && document.activeElement === kb.current) kb.current?.blur();
  }, [driving]);

  const touch = useRef<{ id: number; x: number; y: number; px: number; py: number; drag: boolean } | null>(null);
  const lastMove = useRef(0);
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = at(e.currentTarget, e);
    kb.current?.focus({ preventScroll: true });
    if (e.pointerType === 'touch') {
      touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: p.x, py: p.y, drag: false };
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    send({ t: 'mouse', type: 'down', x: p.x, y: p.y, button: BUTTONS[e.button] ?? 'left', clicks: Math.max(1, e.detail || 1), mods: mods(e) });
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = touch.current;
    if (e.pointerType === 'touch') {
      if (!t || t.id !== e.pointerId) return;
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      if (!t.drag && Math.hypot(dx, dy) < 8) return;
      t.drag = true;
      const r = e.currentTarget.getBoundingClientRect();
      send({ t: 'wheel', x: t.px, y: t.py, dx: (-dx / r.width) * size.w, dy: (-dy / r.height) * size.h });
      t.x = e.clientX;
      t.y = e.clientY;
      return;
    }
    // Moving over a page you are not driving does nothing to it; a button held (a drag) goes on.
    if (!driving && !e.buttons) return;
    const now = performance.now();
    if (now - lastMove.current < 16 && !e.buttons) return;
    lastMove.current = now;
    const p = at(e.currentTarget, e);
    send({ t: 'mouse', type: 'move', x: p.x, y: p.y, button: e.buttons & 1 ? 'left' : undefined, mods: mods(e) });
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = touch.current;
    if (e.pointerType === 'touch') {
      if (t && t.id === e.pointerId && !t.drag) {
        send({ t: 'mouse', type: 'move', x: t.px, y: t.py });
        send({ t: 'mouse', type: 'down', x: t.px, y: t.py, button: 'left', clicks: 1 });
        send({ t: 'mouse', type: 'up', x: t.px, y: t.py, button: 'left', clicks: 1 });
      }
      touch.current = null;
      return;
    }
    const p = at(e.currentTarget, e);
    send({ t: 'mouse', type: 'up', x: p.x, y: p.y, button: BUTTONS[e.button] ?? 'left', clicks: Math.max(1, e.detail || 1), mods: mods(e) });
  };

  // Keys, from the hidden field that has the focus once you click into the page.
  const composing = useRef(false);
  const keyDown = (e: React.KeyboardEvent) => {
    // An input method is composing (its keys are not the page's: what it makes comes with compositionend).
    if (composing.current || e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229) return;
    const op = editOf(e);
    if (op) {
      e.preventDefault();
      e.stopPropagation();
      void desktopBrowser()?.edit(target, op).catch(() => {});
      return;
    }
    // A dead key waits for its letter: that comes as text from the field.
    if (e.key === 'Dead') return;
    e.preventDefault();
    e.stopPropagation();
    const m = mods(e);
    const altGr = e.ctrlKey && e.altKey && e.key.length === 1;
    const text = e.key === 'Enter' ? '\r' : e.key.length === 1 && (altGr || !(m & (MOD.ctrl | MOD.meta | MOD.alt))) ? e.key : undefined;
    send({ t: 'key', type: 'down', key: e.key, code: e.code, keyCode: e.keyCode, text, mods: m });
  };
  const keyUp = (e: React.KeyboardEvent) => {
    if (composing.current || e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229 || e.key === 'Dead') return;
    e.preventDefault();
    send({ t: 'key', type: 'up', key: e.key, code: e.code, keyCode: e.keyCode, mods: mods(e) });
  };
  // What the field gets that no key event carried (a dead key's letter, an input method's result, a phone's keyboard).
  const flushText = () => {
    const el = kb.current;
    if (!el || composing.current) return;
    if (el.value) send({ t: 'text', text: el.value });
    el.value = '';
  };

  const ratio = size.w / Math.max(1, size.h);
  return (
    <div
      ref={box}
      className={cx('relative mx-auto overflow-hidden bg-bg-2', driving && !plain && 'ring-2 ring-accent', className)}
      style={{ aspectRatio: ratio, width: maxH ? `min(100%, calc(${maxH} * ${ratio}))` : undefined }}
    >
      <canvas
        ref={canvas}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => (touch.current = null)}
        onContextMenu={(e) => e.preventDefault()}
        className={cx('absolute inset-0 block h-full w-full touch-none select-none', !has && 'invisible')}
      />
      {has && !driving && <AgentPointer k={k} rest={view.pointer} small={small} />}
      {!has && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center text-fg-3">
          <Globe size={small ? 16 : 22} />
        </div>
      )}
      <textarea
        ref={kb}
        aria-label="Type into the page"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onKeyDown={keyDown}
        onKeyUp={keyUp}
        onInput={flushText}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => {
          composing.current = false;
          flushText();
        }}
        className="absolute bottom-0 left-0 h-px w-px resize-none opacity-0"
        style={{ fontSize: 16 }}
      />
    </div>
  );
});
