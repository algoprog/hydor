// The design editor: what edits a design (shared/design.ts: a page of fixed-size artboards) inside the page's sandboxed
// frame, in place of the page editor (editor.ts), as Canva or Adobe Express do. Its artboards sit on a grey canvas,
// zoomed to fit or 10% to 400%; anything on them is dragged anywhere, resized by its handles (corners keep a picture's,
// a group's and words' proportions; Shift keeps any), turned by the handle under it, snapped to the artboard's edges and
// middle and to the other elements' (pink guides, and equal gaps shown), nudged with the arrow keys (Shift: by ten),
// picked several at a time (Shift+click, or a box dragged round them), grouped (Ctrl+G), lined up, spread out, brought
// forward or sent back (Ctrl+] and Ctrl+[), locked, duplicated (Ctrl+D), copied with its look (Ctrl+Alt+C, Ctrl+Alt+V),
// flipped. A double-click writes in words, crops a picture inside its frame (drag it, size it by its corners), or goes
// into a group. Pictures dropped on the canvas come in where they fall (on a frame: in it). The app's panels change the
// rest through messages (`wa-ed`), as the page editor's do, and hear what is picked (`wa-ed-sel`), what can be undone
// (`wa-ed-state`) and the design's own news (`wa-ed-design`: its zoom, its artboards, a resized copy…).
//
// Like editor.ts, the function runs in the browser: its source is sent as text, so it uses only its arguments and the
// browser's own globals. What it gives back is the page's HTML with the changes, its scripts as they were.
import { curveGeom, DESIGN_CSS, DESIGN_FIT_SRC, fitBox } from '../../shared/design.ts';

export interface DesignEdCfg {
  n: string;
  theme: 'light' | 'dark';
  doctype: string;
  labels: Record<string, string>;
}

type Geom = { x: number; y: number; w: number; h: number };

function designEditor(cfg: DesignEdCfg, BASE: string, FIT: string, curveGeom: (w: number, size: number, curve: number) => { d: string; h: number }, fitBox: (b: Geom, from: { w: number; h: number }, to: { w: number; h: number }) => Geom & { k: number }) {
  const P = window.parent;
  const L = (k: string, fallback: string) => (typeof cfg.labels?.[k] === 'string' ? cfg.labels[k] : fallback);
  const send = (m: Record<string, unknown>) => {
    try {
      P.postMessage({ ...m, n: cfg.n }, '*');
    } catch {}
  };
  const root = document.documentElement;
  root.setAttribute('data-n-theme', cfg.theme === 'dark' ? 'dark' : 'light');
  root.classList.add('n-editing');
  const dark = cfg.theme === 'dark';
  const ACCENT = '#8b5cf6';
  const GUIDE = '#ff3d9a';
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  // ---- the design's parts ---------------------------------------------------------------------------------------
  const boards = () => [...document.querySelectorAll<HTMLElement>('.n-artboard')];
  const isBoard = (x: Element | null): x is HTMLElement => !!x && x.classList?.contains('n-artboard');
  const isGroup = (x: Element | null) => !!x && x.classList?.contains('n-group');
  const boardOf = (el: Element | null): HTMLElement | null => (el ? (el.closest('.n-artboard') as HTMLElement | null) : null);
  const typeOf = (el: Element): string => {
    const c = el.classList;
    if (c.contains('n-group')) return 'group';
    if (c.contains('n-curve')) return 'curve';
    if (c.contains('n-text')) return 'text';
    if (c.contains('n-pic') || el.tagName === 'IMG') return 'pic';
    if (c.contains('n-vid') || el.tagName === 'VIDEO') return 'video';
    if (c.contains('n-shape')) return 'shape';
    if (c.contains('n-icon')) return 'icon';
    if (c.contains('n-qr')) return 'qr';
    if (c.contains('n-line')) return 'line';
    if (c.contains('n-box')) return 'box';
    // Agents' own: words, a picture, a box.
    if (el.querySelector('img') && !(el.textContent ?? '').trim()) return 'pic';
    if ((el.textContent ?? '').trim() && !el.querySelector('img,svg,video')) return 'text';
    return 'box';
  };
  const NAMES: Record<string, [string, string]> = {
    group: ['dGroup', 'Group'],
    curve: ['dCurved', 'Curved words'],
    text: ['dText', 'Text'],
    pic: ['dPicture', 'Picture'],
    video: ['dVideo', 'Video'],
    shape: ['dShape', 'Shape'],
    icon: ['dIcon', 'Icon'],
    qr: ['dQr', 'QR code'],
    line: ['dLine', 'Line'],
    box: ['dBox', 'Box'],
  };
  const nameOf = (el: Element) => {
    const t = typeOf(el);
    const n = NAMES[t] ?? NAMES.box;
    return L(n[0], n[1]);
  };
  /** Text that is written in place (not curved words, which change in the panel). */
  const writable = (el: Element) => typeOf(el) === 'text';
  const locked = (el: Element) => el.getAttribute('data-locked') === '1';

  // ---- the editor's own look, and the layer over the page --------------------------------------------------------
  const own = document.createElement('style');
  own.setAttribute('data-n-own', '');
  own.id = 'n-ed-design';
  const canvas = dark ? '#16161a' : '#e6e4df';
  const OWN_CSS = [
    `html.n-editing,html.n-editing body{background:${canvas}!important}`,
    'html.n-editing body{margin:0!important;padding:0!important;min-height:0!important;display:block!important;position:relative;overflow:visible}',
    'html.n-editing .n-design{position:absolute;left:0;top:0;display:flex!important;flex-direction:column;align-items:center;gap:80px;padding:72px 80px 140px;transform-origin:0 0;width:max-content}',
    'html.n-editing .n-artboard{zoom:1!important;box-shadow:0 1px 4px rgba(0,0,0,.22),0 14px 44px rgba(0,0,0,.2)}',
    'html.n-editing *{-webkit-user-select:none;user-select:none;-webkit-user-drag:none}',
    'html.n-editing [data-n-ce],html.n-editing [data-n-ce] *{-webkit-user-select:text;user-select:text;outline:none;cursor:text}',
    'html.n-editing .n-artboard>*{touch-action:none}',
    'html.n-editing .n-ph::after{content:var(--n-drop);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:8%;font:600 max(11px,min(4cqw,22px))/1.25 system-ui,sans-serif;color:rgba(255,255,255,.92);text-shadow:0 1px 3px rgba(0,0,0,.35);background:radial-gradient(circle,rgba(0,0,0,.12),transparent 70%);container-type:size}',
    'html.n-editing .n-ph{container-type:size}',
    'html.n-editing .n-cropping{overflow:visible!important;-webkit-mask:none!important;mask:none!important;border-radius:0!important}',
    'html.n-editing video{pointer-events:none}',
    'html.n-editing .n-dropping{outline:3px solid #8b5cf6;outline-offset:-3px}',
  ].join('\n');
  let zoomCss = '';
  const writeOwn = () => (own.textContent = `${OWN_CSS}\n${zoomCss}\n:root{--n-drop:${JSON.stringify(L('dDrop', 'Drop a picture here'))}}`);

  const host = document.createElement('n-design-ui');
  host.setAttribute('data-n-own', '');
  for (const [k, v] of [
    ['position', 'fixed'],
    ['inset', '0'],
    ['pointer-events', 'none'],
    ['z-index', '2147483647'],
    ['display', 'block'],
  ])
    host.style.setProperty(k, v, 'important');
  const shadow = host.attachShadow({ mode: 'closed' });
  const panel = dark ? '#1f1f26' : '#ffffff';
  const line = dark ? '#3a3a46' : '#dedad2';
  const ink = dark ? '#ececf2' : '#1d1b17';
  const ICON: Record<string, string> = {
    dup: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
    del: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    edit: '<path d="M21 4 3 22"/><path d="m14 4 6 6"/><path d="M5 9 9 5"/><path d="m6 2 0 4"/><path d="m2 6 4 0"/>',
    words: '<path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/>',
    group: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M11 7h4a2 2 0 0 1 2 2v4"/>',
    ungroup: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    done: '<path d="M20 6 9 17l-5-5"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    video: '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  };
  const svg = (k: string, s = 15) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
  const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  shadow.innerHTML = `<style>
    :host{all:initial}
    .b{position:fixed;box-sizing:border-box;pointer-events:none;display:none}
    .hov{border:1.5px solid ${ACCENT}aa;border-radius:1px}
    .sel{border:2px solid ${ACCENT}}
    .sel.locked{border-style:dashed}
    .one{border:1px solid ${ACCENT};}
    .h{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;background:#fff;border:1.5px solid ${ACCENT};border-radius:50%;pointer-events:auto;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.25);touch-action:none}
    .h.e,.h.w{width:8px;height:20px;margin:-10px 0 0 -4px;border-radius:5px}
    .h.n,.h.s{width:20px;height:8px;margin:-4px 0 0 -10px;border-radius:5px}
    .rot{position:absolute;left:50%;width:24px;height:24px;margin-left:-12px;border-radius:50%;background:#fff;border:1.5px solid ${line};color:#333;display:grid;place-items:center;pointer-events:auto;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.25);touch-action:none}
    .g{position:fixed;background:${GUIDE};pointer-events:none}
    .gap{position:fixed;pointer-events:none;border:0 solid ${GUIDE}}
    .gl{position:fixed;pointer-events:none;background:${GUIDE};color:#fff;font:600 10px/16px system-ui,sans-serif;padding:0 4px;border-radius:4px;white-space:nowrap}
    .marq{position:fixed;border:1px solid ${ACCENT};background:${ACCENT}1f;display:none;pointer-events:none}
    .tip{position:fixed;display:none;pointer-events:none;background:#1d1b17;color:#fff;font:600 11px/18px system-ui,sans-serif;padding:1px 7px;border-radius:6px;white-space:nowrap}
    .bar{position:fixed;display:none;pointer-events:auto;align-items:center;gap:1px;padding:3px;border-radius:10px;background:${panel};border:1px solid ${line};box-shadow:0 6px 20px rgba(0,0,0,.2);font:12px system-ui,sans-serif}
    .bar button,.pg button{all:unset;display:flex;align-items:center;justify-content:center;gap:5px;min-width:30px;height:28px;padding:0 4px;box-sizing:border-box;border-radius:7px;color:${ink};cursor:pointer;font:500 12.5px system-ui,sans-serif;white-space:nowrap}
    .bar button:hover,.pg button:hover{background:${line}}
    .bar button.txt{padding:0 8px}
    .bar .sep{width:1px;height:18px;margin:0 3px;background:${line}}
    .pg{position:fixed;display:flex;align-items:center;gap:2px;pointer-events:auto;font:500 12px system-ui,sans-serif;color:${dark ? '#b8b8c6' : '#5d574d'}}
    .pg span{padding:0 6px 0 2px;white-space:nowrap}
    .pg button{min-width:26px;height:24px;color:${dark ? '#b8b8c6' : '#5d574d'}}
    .pg.cur span{color:${ink};font-weight:600}
    .add{position:fixed;pointer-events:auto;all:unset;display:none}
    .addb{position:fixed;pointer-events:auto;display:flex;align-items:center;justify-content:center;gap:6px;height:36px;border-radius:10px;border:1.5px dashed ${dark ? '#55556a' : '#b9b3a7'};color:${dark ? '#b8b8c6' : '#5d574d'};font:600 13px system-ui,sans-serif;cursor:pointer;background:transparent;box-sizing:border-box}
    .addb:hover{border-color:${ACCENT};color:${ACCENT}}
    .dim{position:fixed;inset:0;background:rgba(10,10,14,.55);display:none;pointer-events:none}
    .badge{position:absolute;right:-10px;top:-10px;width:20px;height:20px;border-radius:50%;background:${ACCENT};color:#fff;display:grid;place-items:center}
    @media (pointer:coarse){.h{width:20px;height:20px;margin:-10px 0 0 -10px}.h.e,.h.w{width:14px;height:30px;margin:-15px 0 0 -7px}.h.n,.h.s{width:30px;height:14px;margin:-7px 0 0 -15px}.rot{width:32px;height:32px;margin-left:-16px}.bar button{min-width:38px;height:36px}}
  </style>
  <div class="dim"></div>
  <div class="guides"></div>
  <div class="b hov"></div>
  <div class="outs"></div>
  <div class="b sel"><i class="h nw" data-h="nw"></i><i class="h n" data-h="n"></i><i class="h ne" data-h="ne"></i><i class="h e" data-h="e"></i><i class="h se" data-h="se"></i><i class="h s" data-h="s"></i><i class="h sw" data-h="sw"></i><i class="h w" data-h="w"></i><b class="rot" data-h="rot" title="${attr(L('dRotate', 'Turn it (Shift: by 15°)'))}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></b><b class="badge" hidden>${svg('lock', 11)}</b></div>
  <div class="marq"></div>
  <div class="tip"></div>
  <div class="pages"></div>
  <div class="bar" role="toolbar"></div>`;
  const $ = (s: string) => shadow.querySelector(s) as HTMLElement;
  const hovBox = $('.hov');
  const selBox = $('.sel');
  const outs = $('.outs');
  const guides = $('.guides');
  const marq = $('.marq');
  const tip = $('.tip');
  const bar = $('.bar');
  const pagesUi = $('.pages');
  const dim = $('.dim');
  const badge = $('.badge');

  // ---- state ----------------------------------------------------------------------------------------------------
  let sel: HTMLElement[] = [];
  /** A group gone into (a double-click): its elements are picked rather than it. */
  let scope: HTMLElement | null = null;
  let board: HTMLElement | null = null;
  let hover: HTMLElement | null = null;
  let editing: HTMLElement | null = null;
  let editBefore = '';
  let editSnap = '';
  let cropping: HTMLElement | null = null;
  let cropSnap = '';
  let zoom = 1;
  let fitting = true;
  let dirty = false;

  // ---- geometry -------------------------------------------------------------------------------------------------
  const num = (v: string | null | undefined, d: number) => {
    const n = parseFloat(v ?? '');
    return Number.isFinite(n) ? n : d;
  };
  const rotOf = (el: Element) => num(/rotate\((-?[\d.]+)deg\)/.exec((el as HTMLElement).style?.transform ?? '')?.[1], 0);
  const flipsOf = (el: Element) => {
    const t = (el as HTMLElement).style?.transform ?? '';
    return { fx: /scaleX\(-1\)/.test(t), fy: /scaleY\(-1\)/.test(t) };
  };
  const setTransform = (el: HTMLElement, r: number, fx: boolean, fy: boolean) => {
    const rr = ((((Math.round(r * 10) / 10) % 360) + 540) % 360) - 180;
    const t = [Math.abs(rr) > 0.05 ? `rotate(${rr}deg)` : '', fx ? 'scaleX(-1)' : '', fy ? 'scaleY(-1)' : ''].filter(Boolean).join(' ');
    if (t) el.style.transform = t;
    else el.style.removeProperty('transform');
  };
  /** Its box in its parent's pixels (unturned). */
  const boxOf = (el: HTMLElement): Geom => ({ x: num(el.style.left, el.offsetLeft), y: num(el.style.top, el.offsetTop), w: el.offsetWidth, h: el.offsetHeight });
  /** Words whose box is as tall as they are (no height of their own). */
  const autoH = (el: HTMLElement) => (typeOf(el) === 'text' || el.classList.contains('n-text')) && !el.style.height;
  const setBox = (el: HTMLElement, g: Partial<Geom>) => {
    if (g.x !== undefined) el.style.left = `${r1(g.x)}px`;
    if (g.y !== undefined) el.style.top = `${r1(g.y)}px`;
    if (g.w !== undefined) el.style.width = `${r1(Math.max(1, g.w))}px`;
    if (g.h !== undefined && !autoH(el)) el.style.height = `${r1(Math.max(1, g.h))}px`;
  };
  const rad = (d: number) => (d * Math.PI) / 180;
  /** The corners of a turned box, in its parent's pixels. */
  const corners = (b: Geom, r: number) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const c = Math.cos(rad(r));
    const s = Math.sin(rad(r));
    return [
      [-b.w / 2, -b.h / 2],
      [b.w / 2, -b.h / 2],
      [b.w / 2, b.h / 2],
      [-b.w / 2, b.h / 2],
    ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  };
  /** The box round it as it shows (turned), in its parent's pixels. */
  const aabb = (el: HTMLElement): Geom => {
    const b = boxOf(el);
    const r = rotOf(el);
    if (!r) return b;
    const cs = corners(b, r);
    const xs = cs.map((p) => p[0]);
    const ys = cs.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const union = (list: Geom[]): Geom => {
    const x = Math.min(...list.map((b) => b.x));
    const y = Math.min(...list.map((b) => b.y));
    return { x, y, w: Math.max(...list.map((b) => b.x + b.w)) - x, h: Math.max(...list.map((b) => b.y + b.h)) - y };
  };
  /** Its turn as it shows: its own and its groups'. */
  const totalRot = (el: HTMLElement) => {
    let r = rotOf(el);
    let p = el.parentElement;
    while (p && !isBoard(p)) {
      r += rotOf(p);
      p = p.parentElement;
    }
    return r;
  };
  const sizeOfBoard = (b: HTMLElement) => ({ w: num(b.style.width, b.offsetWidth), h: num(b.style.height, b.offsetHeight) });
  /** A point of the window in a parent's pixels (an artboard's, or a group's: its box, unturned). */
  const toLocal = (parent: HTMLElement, cx: number, cy: number) => {
    const b = boardOf(parent) ?? parent;
    const r = b.getBoundingClientRect();
    let x = (cx - r.left) / zoom;
    let y = (cy - r.top) / zoom;
    let p: HTMLElement | null = parent;
    const chain: HTMLElement[] = [];
    while (p && !isBoard(p)) {
      chain.unshift(p);
      p = p.parentElement;
    }
    for (const g of chain) {
      const gb = boxOf(g);
      x -= gb.x;
      y -= gb.y;
    }
    return { x, y };
  };

  /**
   * An element placed as the editor places them: absolute, its box in pixels and only a turn and a flip in its
   * transform. One an agent wrote otherwise (in a flow, centred with a translate, in percent) is measured as it shows
   * and written so, the others of its artboard too (so nothing moves when one comes out of the flow).
   */
  const settled = (el: HTMLElement) =>
    getComputedStyle(el).position === 'absolute' &&
    /px$/.test(el.style.left) &&
    /px$/.test(el.style.top) &&
    (/px$/.test(el.style.width) || el.style.width === 'max-content' || autoH(el)) &&
    !/(translate|matrix|scale\((?!-1)|skew)/.test(el.style.transform.replace(/scale[XY]\(-1\)/g, ''));
  const settle = (parent: HTMLElement) => {
    const kids = [...parent.children].filter((x): x is HTMLElement => x instanceof HTMLElement && !x.hasAttribute('data-n-own'));
    if (kids.every(settled)) return;
    const pr = parent.getBoundingClientRect();
    const k = zoom;
    const read = kids.map((el) => {
      const r = el.getBoundingClientRect();
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
      const ang = (Math.atan2(m.b, m.a) * 180) / Math.PI;
      return { el, cx: (r.left + r.width / 2 - pr.left) / k, cy: (r.top + r.height / 2 - pr.top) / k, w: el.offsetWidth, h: el.offsetHeight, ang };
    });
    for (const g of read) {
      if (settled(g.el)) continue;
      g.el.style.position = 'absolute';
      g.el.style.margin = '0';
      g.el.style.left = `${r1(g.cx - g.w / 2)}px`;
      g.el.style.top = `${r1(g.cy - g.h / 2)}px`;
      g.el.style.width = `${r1(g.w)}px`;
      if (!autoH(g.el)) g.el.style.height = `${r1(g.h)}px`;
      g.el.style.right = '';
      g.el.style.bottom = '';
      const f = flipsOf(g.el);
      setTransform(g.el, Math.abs(g.ang) > 0.05 ? g.ang : 0, f.fx, f.fy);
    }
  };

  // ---- history --------------------------------------------------------------------------------------------------
  const undo: string[] = [];
  const redo: string[] = [];
  /** Pictures inside the page are long: each is kept once, and the steps name it by its number. */
  const blobs: string[] = [];
  const blobAt = new Map<string, number>();
  const DATA = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{400,}/gi;
  const pack = (s: string) =>
    s.replace(DATA, (m) => {
      let i = blobAt.get(m);
      if (i === undefined) {
        i = blobs.push(m) - 1;
        blobAt.set(m, i);
      }
      return `\u0001${i}\u0001`;
    });
  const unpack = (s: string) => s.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => blobs[Number(i)] ?? '');
  const fontsLink = () => document.getElementById('n-fonts') as HTMLLinkElement | null;
  /** The body as it is kept: without what the editor marks while it works. */
  const cleanBody = () => {
    const c = document.body.cloneNode(true) as HTMLElement;
    for (const x of c.querySelectorAll('[data-n-ce]')) {
      x.removeAttribute('data-n-ce');
      x.removeAttribute('contenteditable');
    }
    for (const x of c.querySelectorAll('.n-cropping,.n-dropping')) x.classList.remove('n-cropping', 'n-dropping');
    for (const x of c.querySelectorAll('[class=""]')) x.removeAttribute('class');
    return c.outerHTML;
  };
  const snap = () => pack(JSON.stringify({ b: cleanBody(), f: fontsLink()?.getAttribute('href') ?? '', t: document.title }));
  const state = () => send({ type: 'wa-ed-state', dirty, canUndo: undo.length > 0, canRedo: redo.length > 0 });
  let coalesce: { key: string; at: number } | null = null;
  /** Before a change: a step to go back to (changes of one kind in a row, a slider dragged, are one step). */
  const remember = (key?: string) => {
    if (key && coalesce && coalesce.key === key && Date.now() - coalesce.at < 1200) {
      coalesce.at = Date.now();
      return;
    }
    coalesce = key ? { key, at: Date.now() } : null;
    undo.push(snap());
    if (undo.length > 120) undo.shift();
    redo.length = 0;
  };
  let usedTimer = 0;
  const changed = () => {
    dirty = true;
    state();
    tell();
    redraw();
    clearTimeout(usedTimer);
    usedTimer = window.setTimeout(tellUsed, 500);
  };
  const pathOf = (el: Element): number[] => {
    const out: number[] = [];
    let x: Element | null = el;
    while (x && x !== root) {
      const p: Element | null = x.parentElement;
      if (!p) break;
      out.unshift([...p.children].indexOf(x));
      x = p;
    }
    return out;
  };
  const byPath = (path: unknown): HTMLElement | null => {
    if (!Array.isArray(path)) return null;
    let x: Element | null = root;
    for (const i of path) x = x && Number.isInteger(i) ? (x.children[i as number] ?? null) : null;
    return x instanceof HTMLElement && x !== root && x !== document.body && !x.hasAttribute('data-n-own') ? x : null;
  };
  const restore = (saved: string) => {
    const o = JSON.parse(unpack(saved)) as { b: string; f: string; t: string };
    const paths = sel.map(pathOf);
    const bi = board ? boards().indexOf(board) : 0;
    endText(true);
    endCrop(false);
    const d = new DOMParser().parseFromString(`<!doctype html><html><head></head>${o.b}</html>`, 'text/html');
    root.replaceChild(document.importNode(d.body, true), document.body);
    setFonts(o.f);
    if (o.t !== document.title) document.title = o.t;
    scope = null;
    sel = paths.map(byPath).filter((x): x is HTMLElement => !!x && !!boardOf(x));
    board = boards()[Math.min(bi, boards().length - 1)] ?? null;
    layout();
    dirty = true;
    state();
    tell();
    tellBoards();
    redraw();
  };
  const step = (back: boolean) => {
    if (editing) endText();
    if (cropping) endCrop(true);
    const from = back ? undo : redo;
    const to = back ? redo : undo;
    if (!from.length) return;
    to.push(snap());
    coalesce = null;
    restore(from.pop()!);
  };

  // ---- the canvas: zoom and the artboards' places ---------------------------------------------------------------
  const stage = () => document.querySelector<HTMLElement>('.n-design');
  /** Artboards loose in the body go into a .n-design, as designs keep them. */
  const gather = () => {
    if (stage() || !boards().length) return;
    const m = document.createElement('main');
    m.className = 'n-design';
    boards()[0].before(m);
    for (const b of boards()) m.append(b);
  };
  const layout = () => {
    const st = stage();
    if (!st) return;
    // Its size unzoomed, then where it sits zoomed: in the middle when narrower than the window.
    zoomCss = '';
    writeOwn();
    const w = st.offsetWidth;
    const h = st.offsetHeight;
    const left = Math.max(0, (innerWidth - w * zoom) / 2);
    zoomCss = `html.n-editing .n-design{transform:scale(${zoom});left:${r1(left)}px}\nhtml.n-editing body{width:${Math.ceil(Math.max(innerWidth, w * zoom))}px;height:${Math.ceil(h * zoom)}px}`;
    writeOwn();
  };
  const fitZoom = () => {
    const b = board ?? boards()[0];
    if (!b) return 1;
    const s = sizeOfBoard(b);
    return clamp(Math.min((innerWidth - 120) / s.w, (innerHeight - 150) / s.h), 0.05, 4);
  };
  const tellZoom = () => send({ type: 'wa-ed-design', what: 'zoom', zoom, fit: fitting });
  /** Zooms to `z` keeping the point (cx, cy) of the window where it is (the middle, else). */
  const setZoom = (z: number, at?: { x: number; y: number }, fit = false) => {
    const nz = clamp(z, 0.05, 4);
    const cx = at?.x ?? innerWidth / 2;
    const cy = at?.y ?? innerHeight / 2;
    const st = stage();
    const before = st?.getBoundingClientRect();
    const dx = before ? (cx - before.left) / zoom : 0;
    const dy = before ? (cy - before.top) / zoom : 0;
    zoom = nz;
    fitting = fit;
    layout();
    const after = st?.getBoundingClientRect();
    if (after) scrollBy(after.left + dx * zoom - cx, after.top + dy * zoom - cy);
    tellZoom();
    redraw();
  };
  /** Fits the artboard in the window, and brings it into view. */
  const fit = (b = board) => {
    zoom = fitZoom();
    fitting = true;
    layout();
    const r = (b ?? boards()[0])?.getBoundingClientRect();
    if (r) scrollBy(0, r.top + r.height / 2 - innerHeight / 2 + 12);
    tellZoom();
    redraw();
  };
  const showBoard = (b: HTMLElement) => {
    const r = b.getBoundingClientRect();
    if (r.bottom < 60 || r.top > innerHeight - 60) scrollBy(0, r.top - 80);
  };

  // ---- what the app hears ------------------------------------------------------------------------------------------
  const STYLE_KEYS = [
    'color',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-align',
    'line-height',
    'letter-spacing',
    'text-transform',
    'text-decoration-line',
    'text-shadow',
    '-webkit-text-stroke-width',
    '-webkit-text-stroke-color',
    'background-color',
    'background-image',
    'background-clip',
    'opacity',
    'border-top-left-radius',
    'border-top-width',
    'border-top-style',
    'border-top-color',
    'box-shadow',
    'filter',
    'mix-blend-mode',
    '--n-stroke',
    '--n-sw',
    '--n-lw',
    '--n-ls',
  ];
  const cut = (v: string, n = 300) => (v.length > n ? `${v.slice(0, n)}…` : v);
  const imgOf = (el: HTMLElement) => (el.tagName === 'IMG' ? (el as HTMLImageElement) : el.querySelector<HTMLImageElement>(':scope > img'));
  const vidOf = (el: HTMLElement) => (el.tagName === 'VIDEO' ? (el as HTMLVideoElement) : el.querySelector<HTMLVideoElement>(':scope > video'));
  const info = (el: HTMLElement) => {
    const cs = getComputedStyle(el);
    const style: Record<string, string> = {};
    const inline: Record<string, string> = {};
    for (const k of STYLE_KEYS) {
      style[k] = cut(cs.getPropertyValue(k).trim());
      const v = el.style.getPropertyValue(k);
      if (v) inline[k] = cut(v);
    }
    const b = boxOf(el);
    const f = flipsOf(el);
    const img = imgOf(el);
    const vid = vidOf(el);
    const hl = el.querySelector<HTMLElement>(':scope > .n-hlb');
    return {
      type: typeOf(el),
      name: nameOf(el),
      path: pathOf(el),
      x: r1(b.x),
      y: r1(b.y),
      w: r1(b.w),
      h: r1(b.h),
      r: r1(rotOf(el)),
      fx: f.fx,
      fy: f.fy,
      locked: locked(el),
      inGroup: !!scope,
      style,
      inline,
      words: typeOf(el) === 'curve' ? (el.getAttribute('data-text') ?? '') : typeOf(el) === 'text' ? el.innerText.replace(/\n$/, '') : undefined,
      curve: el.getAttribute('data-curve') ?? undefined,
      highlight: hl ? hl.style.backgroundColor || getComputedStyle(hl).backgroundColor : undefined,
      frame: el.getAttribute('data-frame') ?? (el.classList.contains('n-pic') ? 'rect' : undefined),
      shape: el.getAttribute('data-shape') ?? undefined,
      icon: el.getAttribute('data-icon') ?? undefined,
      qr: el.getAttribute('data-qr') ?? undefined,
      empty: el.classList.contains('n-ph') || undefined,
      arrow: el.classList.contains('n-arrow') || undefined,
      effect: el.getAttribute('data-effect') ?? undefined,
      qrDark: el.getAttribute('data-dark') ?? undefined,
      qrLight: el.getAttribute('data-light') ?? undefined,
      src: img ? cut(img.getAttribute('src') ?? '', 200) : undefined,
      alt: img ? (img.getAttribute('alt') ?? '') : undefined,
      imgFilter: img ? img.style.filter : undefined,
      natural: img && img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : undefined,
      video: vid ? { src: cut(vid.getAttribute('src') ?? '', 300), controls: vid.hasAttribute('controls'), loop: vid.hasAttribute('loop'), muted: vid.hasAttribute('muted') || vid.muted, autoplay: vid.hasAttribute('autoplay') } : undefined,
      editing: editing === el,
      cropping: cropping === el,
    };
  };
  const tell = () => {
    sel = sel.filter((x) => x.isConnected);
    if (board && !board.isConnected) board = boards()[0] ?? null;
    const b = board;
    const bs = boards();
    const bcs = b ? getComputedStyle(b) : null;
    const many = sel.length > 1 ? union(sel.map(aabb)) : null;
    send({
      type: 'wa-ed-sel',
      sel: {
        design: true,
        kind: sel.length > 1 ? 'many' : sel.length ? 'el' : 'board',
        count: sel.length,
        board: b && bcs ? { index: bs.indexOf(b), count: bs.length, ...sizeOfBoard(b), bg: cut(b.style.background || '', 400), bgColor: bcs.backgroundColor, bgImage: cut(bcs.backgroundImage, 300) } : null,
        el: sel.length === 1 ? info(sel[0]) : null,
        many: many ? { x: r1(many.x), y: r1(many.y), w: r1(many.w), h: r1(many.h), types: [...new Set(sel.map(typeOf))], locked: sel.some(locked) } : null,
        canGroup: sel.length > 1 && sel.every((x) => x.parentElement === sel[0].parentElement),
        scope: !!scope,
      },
    });
  };
  const tellBoards = () => send({ type: 'wa-ed-design', what: 'boards', list: boards().map(sizeOfBoard), current: board ? boards().indexOf(board) : 0 });
  const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
  const hexOf = (c: string): string | null => {
    const s = c.trim().toLowerCase();
    let m = /^#([0-9a-f]{3})$/.exec(s);
    if (m) return `#${[...m[1]].map((x) => x + x).join('')}`;
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
    if (m) return m[2] === '00' ? null : `#${m[1]}`;
    const r = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?/.exec(s);
    if (r) {
      if (r[4] !== undefined && parseFloat(r[4]) === 0) return null;
      return `#${[r[1], r[2], r[3]].map((v) => clamp(Math.round(Number(v)), 0, 255).toString(16).padStart(2, '0')).join('')}`;
    }
    return null;
  };
  /** The colours the design uses, the most used first, and its fonts. */
  const used = () => {
    const count = new Map<string, number>();
    const fonts = new Set<string>();
    for (const b of boards())
      for (const el of [b, ...b.querySelectorAll<HTMLElement>('[style],[fill],[stroke]')]) {
        const st = el.getAttribute('style') ?? '';
        for (const m of st.replace(/url\([^)]*\)/g, '').match(COLOUR) ?? []) {
          const h = hexOf(m);
          if (h) count.set(h, (count.get(h) ?? 0) + 1);
        }
        for (const a of ['fill', 'stroke']) {
          const h = hexOf(el.getAttribute(a) ?? '');
          if (h) count.set(h, (count.get(h) ?? 0) + 1);
        }
        const ff = el.style.fontFamily;
        if (ff) fonts.add(ff.split(',')[0].trim().replace(/^["']|["']$/g, ''));
      }
    return { colours: [...count].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 16), fonts: [...fonts].slice(0, 12) };
  };
  const tellUsed = () => {
    const u = used();
    send({ type: 'wa-ed-palette', colors: u.colours.slice(0, 12) });
    send({ type: 'wa-ed-design', what: 'used', colours: u.colours, fonts: u.fonts });
  };

  // ---- drawing over the page ---------------------------------------------------------------------------------------
  /** Places a box (turned) over an element as it shows. */
  const placeOver = (box: HTMLElement, el: HTMLElement, pad = 0) => {
    const r = el.getBoundingClientRect();
    const w = el.offsetWidth * zoom * scaleOf(el);
    const h = el.offsetHeight * zoom * scaleOf(el);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    box.style.display = 'block';
    box.style.left = `${cx - w / 2 - pad}px`;
    box.style.top = `${cy - h / 2 - pad}px`;
    box.style.width = `${w + pad * 2}px`;
    box.style.height = `${h + pad * 2}px`;
    box.style.transform = `rotate(${totalRot(el)}deg)`;
  };
  /** How much bigger an element shows than its own pixels (none: groups never scale their insides). */
  const scaleOf = (_el: HTMLElement) => 1;
  const rectOfBoardBox = (b: HTMLElement, g: Geom, parent: HTMLElement) => {
    // A box in a parent's pixels, as the window shows it.
    const br = (boardOf(parent) ?? b).getBoundingClientRect();
    let ox = 0;
    let oy = 0;
    let p: HTMLElement | null = parent;
    while (p && !isBoard(p)) {
      const pb = boxOf(p);
      ox += pb.x;
      oy += pb.y;
      p = p.parentElement;
    }
    return { left: br.left + (g.x + ox) * zoom, top: br.top + (g.y + oy) * zoom, width: g.w * zoom, height: g.h * zoom };
  };
  let barKey = '';
  const drawBar = () => {
    if (!sel.length || editing || dragging) {
      bar.style.display = 'none';
      return;
    }
    const one = sel.length === 1 ? sel[0] : null;
    const t = one ? typeOf(one) : 'many';
    const lockedNow = sel.some(locked);
    const key = `${t}:${lockedNow}:${!!cropping}:${one ? isGroup(one) : false}`;
    if (key !== barKey) {
      barKey = key;
      const b = (a: string, icon: string, title: string, label?: string) => `<button data-a="${a}" title="${attr(title)}"${label ? ' class="txt"' : ''}>${svg(icon)}${label ? `<span>${attr(label)}</span>` : ''}</button>`;
      const parts: string[] = [];
      if (cropping) parts.push(b('cropDone', 'done', L('dCropDoneTip', 'Done (Enter)'), L('dCropDone', 'Done')));
      else {
        if (t === 'pic' && !lockedNow) parts.push(b('editPicture', 'edit', L('dEditPictureTip', 'Open it in the picture editor'), L('dEditPicture', 'Edit picture')), b('crop', 'crop', L('dCropTip', 'Crop it inside its frame (double-click)')));
        if (t === 'video' && !lockedNow) parts.push(b('editVideo', 'video', L('dEditVideoTip', 'Open it in the video editor'), L('dEditVideo', 'Edit video')));
        if (t === 'text' && !lockedNow) parts.push(b('write', 'words', L('dWriteTip', 'Change the words (double-click)')));
        if (t === 'many' && sel.every((x) => x.parentElement === sel[0].parentElement)) parts.push(b('group', 'group', L('dGroupTip', 'Group (Ctrl+G)'), L('dGroupIt', 'Group')));
        if (t === 'group') parts.push(b('ungroup', 'ungroup', L('dUngroupTip', 'Ungroup (Ctrl+Shift+G)'), L('dUngroup', 'Ungroup')));
        if (parts.length) parts.push('<span class="sep"></span>');
        if (!lockedNow) parts.push(b('dup', 'dup', L('dDupTip', 'Duplicate (Ctrl+D)')), b('del', 'del', L('dDelTip', 'Delete (Delete)')));
        parts.push(b('lock', lockedNow ? 'unlock' : 'lock', lockedNow ? L('dUnlockTip', 'Unlock') : L('dLockTip', 'Lock it in place')));
        parts.push(b('menu', 'more', L('dMoreTip', 'More')));
      }
      bar.innerHTML = parts.join('');
    }
    const boxes = sel.map((x) => x.getBoundingClientRect());
    const top = Math.min(...boxes.map((r) => r.top));
    const bottom = Math.max(...boxes.map((r) => r.bottom));
    const left = Math.min(...boxes.map((r) => r.left));
    const right = Math.max(...boxes.map((r) => r.right));
    bar.style.display = 'flex';
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    let y = top - bh - 14;
    if (y < 6) y = bottom + 40;
    if (y + bh > innerHeight - 6) y = Math.max(6, top + 8);
    bar.style.left = `${clamp((left + right) / 2 - bw / 2, 6, innerWidth - bw - 6)}px`;
    bar.style.top = `${y}px`;
  };
  const HANDLES: Record<string, string[]> = {
    text: ['nw', 'ne', 'se', 'sw', 'e', 'w'],
    curve: ['nw', 'ne', 'se', 'sw', 'e', 'w'],
    line: ['e', 'w'],
    group: ['nw', 'ne', 'se', 'sw'],
    many: ['nw', 'ne', 'se', 'sw'],
  };
  const ALL = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const POS: Record<string, [number, number]> = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] };
  const draw = () => {
    // Hover
    if (hover && hover.isConnected && !sel.includes(hover) && !dragging && !editing) placeOver(hovBox, hover);
    else hovBox.style.display = 'none';
    // Selection
    outs.innerHTML = '';
    const lockedNow = sel.some(locked);
    if (sel.length === 1 && !cropping) {
      const el = sel[0];
      placeOver(selBox, el);
      selBox.classList.toggle('locked', lockedNow);
      const t = typeOf(el);
      const shown = editing || lockedNow ? [] : (HANDLES[t] ?? ALL);
      for (const h of selBox.querySelectorAll<HTMLElement>('.h')) {
        const k = h.dataset.h!;
        h.style.display = shown.includes(k) ? 'block' : 'none';
        h.style.left = `${POS[k][0]}%`;
        h.style.top = `${POS[k][1]}%`;
        h.style.cursor = `${k}-resize`;
      }
      const rot = selBox.querySelector<HTMLElement>('.rot')!;
      rot.style.display = editing || lockedNow ? 'none' : 'grid';
      rot.style.top = `calc(100% + ${coarse ? 16 : 12}px)`;
      badge.hidden = !lockedNow;
    } else if (sel.length > 1 || (cropping && sel.length === 1)) {
      if (cropping) {
        // The picture's whole box, its corners to size it; the frame shows through the dimmed page.
        const img = imgOf(cropping)!;
        placeOver(selBox, img as unknown as HTMLElement);
        selBox.style.transform = `rotate(${totalRot(cropping)}deg)`;
        for (const h of selBox.querySelectorAll<HTMLElement>('.h')) {
          const k = h.dataset.h!;
          h.style.display = ['nw', 'ne', 'se', 'sw'].includes(k) ? 'block' : 'none';
          h.style.left = `${POS[k][0]}%`;
          h.style.top = `${POS[k][1]}%`;
          h.style.cursor = `${k}-resize`;
        }
        (selBox.querySelector('.rot') as HTMLElement).style.display = 'none';
        badge.hidden = true;
        selBox.classList.remove('locked');
        const o = document.createElement('div');
        o.className = 'b one';
        o.style.borderWidth = '2px';
        outs.append(o);
        placeOver(o, cropping);
      } else {
        for (const el of sel) {
          const o = document.createElement('div');
          o.className = 'b one';
          outs.append(o);
          placeOver(o, el);
        }
        const parent = sel[0].parentElement as HTMLElement;
        const u = union(sel.map(aabb));
        const r = rectOfBoardBox(boardOf(parent)!, u, parent);
        Object.assign(selBox.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, transform: 'none' });
        selBox.classList.toggle('locked', lockedNow);
        for (const h of selBox.querySelectorAll<HTMLElement>('.h')) {
          const k = h.dataset.h!;
          h.style.display = !lockedNow && HANDLES.many.includes(k) ? 'block' : 'none';
          h.style.left = `${POS[k][0]}%`;
          h.style.top = `${POS[k][1]}%`;
          h.style.cursor = `${k}-resize`;
        }
        (selBox.querySelector('.rot') as HTMLElement).style.display = 'none';
        badge.hidden = !lockedNow;
      }
    } else selBox.style.display = 'none';
    // The dimmed page round a picture being cropped.
    if (cropping) {
      const r = cropping.getBoundingClientRect();
      const w = cropping.offsetWidth * zoom;
      const h = cropping.offsetHeight * zoom;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const a = rad(totalRot(cropping));
      const pt = (x: number, y: number) => `${r1(cx + x * Math.cos(a) - y * Math.sin(a))}px ${r1(cy + x * Math.sin(a) + y * Math.cos(a))}px`;
      dim.style.display = 'block';
      dim.style.clipPath = `polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${pt(-w / 2, -h / 2)},${pt(w / 2, -h / 2)},${pt(w / 2, h / 2)},${pt(-w / 2, h / 2)},${pt(-w / 2, -h / 2)})`;
    } else dim.style.display = 'none';
    drawPages();
    drawBar();
  };
  let frameReq = 0;
  const redraw = () => {
    if (!frameReq) frameReq = requestAnimationFrame(() => ((frameReq = 0), draw()));
  };
  const coarse = matchMedia('(pointer: coarse)').matches;

  // The artboards' labels, with their buttons, and "Add a page" under the last.
  let pagesKey = '';
  const drawPages = () => {
    const bs = boards();
    const key = `${bs.length}:${board ? bs.indexOf(board) : -1}`;
    if (key !== pagesKey) {
      pagesKey = key;
      const btn = (a: string, i: number, icon: string, title: string) => `<button data-p="${a}" data-i="${i}" title="${attr(title)}">${svg(icon, 14)}</button>`;
      pagesUi.innerHTML =
        bs
          .map(
            (_b, i) =>
              `<div class="pg${board === _b ? ' cur' : ''}" data-i="${i}"><span>${attr(L('dPageOf', 'Page {0} of {1}').replace('{0}', String(i + 1)).replace('{1}', String(bs.length)))}</span>${bs.length > 1 ? `${i > 0 ? btn('up', i, 'up', L('dPageUp', 'Move this page up')) : ''}${i < bs.length - 1 ? btn('down', i, 'down', L('dPageDown', 'Move this page down')) : ''}` : ''}${btn('dupPage', i, 'dup', L('dPageDup', 'Duplicate this page'))}${bs.length > 1 ? btn('delPage', i, 'del', L('dPageDel', 'Delete this page')) : ''}</div>`,
          )
          .join('') + `<button class="addb" data-p="addPage" data-i="${bs.length - 1}">${svg('plus', 15)}<span>${attr(L('dAddPage', 'Add a page'))}</span></button>`;
    }
    const labels = pagesUi.querySelectorAll<HTMLElement>('.pg');
    bs.forEach((b, i) => {
      const r = b.getBoundingClientRect();
      const l = labels[i];
      if (!l) return;
      l.style.left = `${r.left}px`;
      l.style.top = `${r.top - 30}px`;
      l.style.maxWidth = `${Math.max(120, r.width)}px`;
    });
    const add = pagesUi.querySelector<HTMLElement>('.addb');
    const last = bs[bs.length - 1];
    if (add && last) {
      const r = last.getBoundingClientRect();
      add.style.left = `${r.left}px`;
      add.style.top = `${r.bottom + 18}px`;
      add.style.width = `${r.width}px`;
    }
  };

  // ---- guides: snapping to the artboard and to the other elements ---------------------------------------------------
  type Snap = { d: number; at: number; lines: { x1: number; y1: number; x2: number; y2: number }[] };
  const drawGuides = (lines: { x1: number; y1: number; x2: number; y2: number }[], gaps: { x: number; y: number; w: number; h: number; label: string; vertical: boolean }[], parent: HTMLElement) => {
    guides.innerHTML = '';
    const toWin = (x: number, y: number) => {
      const r = rectOfBoardBox(boardOf(parent)!, { x, y, w: 0, h: 0 }, parent);
      return { x: r.left, y: r.top };
    };
    for (const l of lines) {
      const a = toWin(l.x1, l.y1);
      const b = toWin(l.x2, l.y2);
      const g = document.createElement('div');
      g.className = 'g';
      if (Math.abs(a.x - b.x) < 0.5) Object.assign(g.style, { left: `${a.x - 0.5}px`, top: `${Math.min(a.y, b.y)}px`, width: '1px', height: `${Math.abs(b.y - a.y)}px` });
      else Object.assign(g.style, { left: `${Math.min(a.x, b.x)}px`, top: `${a.y - 0.5}px`, width: `${Math.abs(b.x - a.x)}px`, height: '1px' });
      guides.append(g);
    }
    for (const q of gaps) {
      const a = toWin(q.x, q.y);
      const b = toWin(q.x + q.w, q.y + q.h);
      const g = document.createElement('div');
      g.className = 'g';
      if (q.vertical) Object.assign(g.style, { left: `${a.x - 0.5}px`, top: `${a.y}px`, width: '1px', height: `${b.y - a.y}px` });
      else Object.assign(g.style, { left: `${a.x}px`, top: `${a.y - 0.5}px`, width: `${b.x - a.x}px`, height: '1px' });
      guides.append(g);
      const t = document.createElement('div');
      t.className = 'gl';
      t.textContent = q.label;
      guides.append(t);
      t.style.left = `${(a.x + b.x) / 2 - t.offsetWidth / 2 + (q.vertical ? 6 + t.offsetWidth / 2 : 0)}px`;
      t.style.top = `${(a.y + b.y) / 2 - 8 + (q.vertical ? 0 : -12)}px`;
    }
  };
  /**
   * Where a box moving by (dx, dy) snaps: its edges and middle to the parent's and to the others', within a few screen
   * pixels; and, in a row or a column of others, to the gap between them. The nudge to apply, and what to draw.
   */
  const snapMove = (m: Geom, others: Geom[], parent: HTMLElement) => {
    const tol = 6 / zoom;
    const ps = isBoard(parent) ? sizeOfBoard(parent) : { w: parent.offsetWidth, h: parent.offsetHeight };
    const xs: { v: number; from: number; to: number }[] = [
      { v: 0, from: 0, to: ps.h },
      { v: ps.w / 2, from: 0, to: ps.h },
      { v: ps.w, from: 0, to: ps.h },
    ];
    const ys: { v: number; from: number; to: number }[] = [
      { v: 0, from: 0, to: ps.w },
      { v: ps.h / 2, from: 0, to: ps.w },
      { v: ps.h, from: 0, to: ps.w },
    ];
    for (const o of others) {
      for (const v of [o.x, o.x + o.w / 2, o.x + o.w]) xs.push({ v, from: o.y, to: o.y + o.h });
      for (const v of [o.y, o.y + o.h / 2, o.y + o.h]) ys.push({ v, from: o.x, to: o.x + o.w });
    }
    const best = (mine: number[], cands: { v: number; from: number; to: number }[], vertical: boolean): Snap | null => {
      let found: Snap | null = null;
      for (const c of cands)
        for (const p of mine) {
          const d = c.v - p;
          if (Math.abs(d) <= tol && (!found || Math.abs(d) < Math.abs(found.d) - 0.01)) found = { d, at: c.v, lines: [] };
        }
      if (!found) return null;
      // Every line it now lies on.
      const f = found;
      for (const c of cands)
        for (const p of mine)
          if (Math.abs(c.v - (p + f.d)) < 0.5) {
            const lo = Math.min(c.from, vertical ? m.y + 0 : m.x);
            const hi = Math.max(c.to, vertical ? m.y + m.h : m.x + m.w);
            f.lines.push(vertical ? { x1: c.v, y1: lo, x2: c.v, y2: hi } : { x1: lo, y1: c.v, x2: hi, y2: c.v });
          }
      return f;
    };
    const sx = best([m.x, m.x + m.w / 2, m.x + m.w], xs, true);
    const sy = best([m.y, m.y + m.h / 2, m.y + m.h], ys, false);
    let dx = sx?.d ?? 0;
    let dy = sy?.d ?? 0;
    const lines = [...(sx?.lines ?? []), ...(sy?.lines ?? [])];
    // Equal gaps: in the row it is in (others beside it, overlapping it top to bottom), and in its column.
    const gaps: { x: number; y: number; w: number; h: number; label: string; vertical: boolean }[] = [];
    const eq = (horizontal: boolean) => {
      const a0 = horizontal ? m.x + dx : m.y + dy;
      const size = horizontal ? m.w : m.h;
      const row = others.filter((o) => (horizontal ? o.y < m.y + dy + m.h && o.y + o.h > m.y + dy : o.x < m.x + dx + m.w && o.x + o.w > m.x + dx));
      const start = (o: Geom) => (horizontal ? o.x : o.y);
      const len = (o: Geom) => (horizontal ? o.w : o.h);
      const before = row.filter((o) => start(o) + len(o) <= a0 + tol).sort((p, q) => start(q) + len(q) - (start(p) + len(p)));
      const after = row.filter((o) => start(o) >= a0 + size - tol).sort((p, q) => start(p) - start(q));
      const cands: { pos: number; marks: [number, number][] }[] = [];
      const L1 = before[0];
      const R1 = after[0];
      if (L1 && R1) {
        const room = start(R1) - (start(L1) + len(L1));
        const g = (room - size) / 2;
        if (g > 0) cands.push({ pos: start(L1) + len(L1) + g, marks: [[start(L1) + len(L1), start(L1) + len(L1) + g], [start(L1) + len(L1) + g + size, start(R1)]] });
      }
      if (L1 && before[1]) {
        const g = start(L1) - (start(before[1]) + len(before[1]));
        if (g > 0) cands.push({ pos: start(L1) + len(L1) + g, marks: [[start(before[1]) + len(before[1]), start(L1)], [start(L1) + len(L1), start(L1) + len(L1) + g]] });
      }
      if (R1 && after[1]) {
        const g = start(after[1]) - (start(R1) + len(R1));
        if (g > 0) cands.push({ pos: start(R1) - g - size, marks: [[start(R1) + len(R1), start(after[1])], [start(R1) - g, start(R1)]] });
      }
      const hit = cands.filter((c) => Math.abs(c.pos - a0) <= tol).sort((p, q) => Math.abs(p.pos - a0) - Math.abs(q.pos - a0))[0];
      if (!hit) return;
      if (horizontal) dx += hit.pos - a0;
      else dy += hit.pos - a0;
      const mid = horizontal ? m.y + dy + m.h / 2 : m.x + dx + m.w / 2;
      for (const [p, q] of hit.marks) gaps.push(horizontal ? { x: p, y: mid, w: q - p, h: 0, label: `${Math.round(q - p)}`, vertical: false } : { x: mid, y: p, w: 0, h: q - p, label: `${Math.round(q - p)}`, vertical: true });
    };
    if (!sx) eq(true);
    if (!sy) eq(false);
    drawGuides(lines, gaps, parent);
    return { dx, dy };
  };
  const clearGuides = () => (guides.innerHTML = '');
  const showTip = (text: string, x: number, y: number) => {
    tip.textContent = text;
    tip.style.display = 'block';
    tip.style.left = `${clamp(x + 14, 4, innerWidth - tip.offsetWidth - 4)}px`;
    tip.style.top = `${clamp(y + 18, 4, innerHeight - 24)}px`;
  };
  const hideTip = () => (tip.style.display = 'none');

  // ---- picking ---------------------------------------------------------------------------------------------------
  const fromUi = (e: Event) => e.composedPath().includes(host);
  /** The element a press is on: one of the artboard's (or of the group gone into), never the artboard itself. */
  const pick = (t: EventTarget | null, leave = false): HTMLElement | null => {
    let x = t instanceof Element ? t : null;
    if (!x) return null;
    let parent = scope;
    if (parent && !parent.contains(x)) {
      if (leave) scope = null;
      parent = null;
    }
    while (x && x !== document.body) {
      const p: Element | null = x.parentElement;
      if (!p) return null;
      if (parent ? p === parent : isBoard(p)) return x as HTMLElement;
      x = p;
    }
    return null;
  };
  const select = (list: HTMLElement[], b?: HTMLElement | null) => {
    if (editing && !list.includes(editing)) endText();
    if (cropping && !list.includes(cropping)) endCrop(true);
    sel = list;
    if (b !== undefined) board = b;
    else if (list[0]) board = boardOf(list[0]) ?? board;
    tell();
    redraw();
  };

  // ---- writing in words -------------------------------------------------------------------------------------------
  const caretAt = (x: number, y: number) => {
    const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    host.style.setProperty('display', 'none', 'important');
    let r: Range | null = null;
    if (d.caretRangeFromPoint) r = d.caretRangeFromPoint(x, y);
    else if (d.caretPositionFromPoint) {
      const p = d.caretPositionFromPoint(x, y);
      if (p) {
        r = document.createRange();
        r.setStart(p.offsetNode, p.offset);
      }
    }
    host.style.setProperty('display', 'block', 'important');
    return r;
  };
  const startText = (el: HTMLElement, at?: { x: number; y: number }) => {
    if (!writable(el) || locked(el)) return;
    if (editing === el) return;
    endText();
    select([el]);
    editSnap = snap();
    editing = el;
    editBefore = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-n-ce', '');
    el.focus({ preventScroll: true });
    const s = getSelection();
    const r = at ? caretAt(at.x, at.y) : null;
    if (s) {
      s.removeAllRanges();
      if (r && el.contains(r.startContainer)) s.addRange(r);
      else {
        const all = document.createRange();
        all.selectNodeContents(el.querySelector('.n-hlb') ?? el);
        s.addRange(all);
      }
    }
    send({ type: 'wa-ed-editing', on: true });
    tell();
    redraw();
  };
  function endText(quiet = false) {
    const el = editing;
    if (!el) return;
    editing = null;
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-n-ce');
    // What a browser leaves after the words were cleared.
    if (el.innerHTML === '<br>') el.innerHTML = '';
    getSelection()?.removeAllRanges();
    send({ type: 'wa-ed-editing', on: false });
    if (!quiet && el.innerHTML !== editBefore) {
      undo.push(editSnap);
      redo.length = 0;
      coalesce = null;
      // Emptied: it goes.
      if (!(el.textContent ?? '').trim()) {
        el.remove();
        sel = sel.filter((x) => x !== el);
      }
      changed();
    } else {
      tell();
      redraw();
    }
  }

  // ---- cropping a picture inside its frame ----------------------------------------------------------------------------
  /** The picture's box in its frame, in percent of the frame (a picture that covers it, as it shows, when it had none). */
  const cropBox = (frame: HTMLElement) => {
    const img = imgOf(frame)!;
    const fw = frame.offsetWidth;
    const fh = frame.offsetHeight;
    const st = img.style;
    if (/%$/.test(st.width) && /%$/.test(st.height)) return { x: num(st.left, 0), y: num(st.top, 0), w: num(st.width, 100), h: num(st.height, 100) };
    const nw = img.naturalWidth || fw;
    const nh = img.naturalHeight || fh;
    const k = Math.max(fw / nw, fh / nh);
    const w = ((nw * k) / fw) * 100;
    const h = ((nh * k) / fh) * 100;
    return { x: (100 - w) / 2, y: (100 - h) / 2, w, h };
  };
  const setCrop = (img: HTMLImageElement, c: Geom) => {
    img.style.left = `${r1(c.x)}%`;
    img.style.top = `${r1(c.y)}%`;
    img.style.width = `${r1(c.w)}%`;
    img.style.height = `${r1(c.h)}%`;
  };
  const startCrop = (el: HTMLElement) => {
    if (typeOf(el) !== 'pic' || !imgOf(el) || locked(el) || el.tagName === 'IMG') return;
    endText();
    select([el]);
    cropSnap = snap();
    cropping = el;
    const img = imgOf(el)!;
    setCrop(img, cropBox(el));
    el.classList.add('n-cropping');
    tell();
    redraw();
  };
  function endCrop(keep: boolean) {
    const el = cropping;
    if (!el) return;
    cropping = null;
    el.classList.remove('n-cropping');
    if (!el.classList.length) el.removeAttribute('class');
    if (keep && snap() !== cropSnap) {
      undo.push(cropSnap);
      redo.length = 0;
      coalesce = null;
      changed();
    } else {
      tell();
      redraw();
    }
  }

  // ---- dragging: moving, resizing, turning, a box round several ------------------------------------------------------
  let dragging = false;
  const drag = (e: PointerEvent, onMove: (ev: PointerEvent) => void, onUp: (moved: boolean, ev: PointerEvent) => void, threshold = 3) => {
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < threshold) return;
      if (!moved) {
        moved = true;
        dragging = true;
        hovBox.style.display = 'none';
        bar.style.display = 'none';
      }
      onMove(ev);
    };
    const up = (ev: PointerEvent) => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      dragging = false;
      clearGuides();
      hideTip();
      onUp(moved, ev);
      redraw();
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
  };

  /** Moving what is picked: the first move makes the step to undo; snapped unless Alt is held. */
  const moveStart = (e: PointerEvent) => {
    const list = sel.filter((x) => !locked(x));
    if (!list.length || list.length !== sel.length) return;
    const parent = list[0].parentElement as HTMLElement;
    let before = '';
    let starts: { el: HTMLElement; g: Geom }[] = [];
    let box0: Geom | null = null;
    let others: Geom[] = [];
    drag(
      e,
      (ev) => {
        if (!before) {
          before = snap();
          settle(parent);
          starts = list.map((el) => ({ el, g: boxOf(el) }));
          box0 = union(list.map(aabb));
          others = [...parent.children].filter((x): x is HTMLElement => x instanceof HTMLElement && !list.includes(x) && !x.hasAttribute('data-n-own') && getComputedStyle(x).display !== 'none').map(aabb);
        }
        let dx = (ev.clientX - e.clientX) / zoom;
        let dy = (ev.clientY - e.clientY) / zoom;
        if (ev.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        if (!ev.altKey && box0) {
          const s = snapMove({ ...box0, x: box0.x + dx, y: box0.y + dy }, others, parent);
          dx += s.dx;
          dy += s.dy;
        } else clearGuides();
        for (const s of starts) setBox(s.el, { x: s.g.x + dx, y: s.g.y + dy });
        if (box0) showTip(`${Math.round(box0.x + dx)}, ${Math.round(box0.y + dy)}`, ev.clientX, ev.clientY);
        redraw();
      },
      (moved) => {
        if (!moved || !before) return;
        undo.push(before);
        redo.length = 0;
        coalesce = null;
        changed();
      },
    );
  };

  /** Resizing by a handle: one element in its own (turned) frame, several together (by their corners, keeping their shape). */
  const resizeStart = (e: PointerEvent, h: string) => {
    if (cropping) return cropResize(e, h);
    const list = sel.filter((x) => !locked(x));
    if (!list.length || list.length !== sel.length) return;
    const before = snap();
    const parent = list[0].parentElement as HTMLElement;
    settle(parent);
    const sx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0;
    const sy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
    const corner = sx !== 0 && sy !== 0;
    if (list.length === 1) {
      const el = list[0];
      const t = typeOf(el);
      const g0 = boxOf(el);
      const r = rotOf(el);
      const f = flipsOf(el);
      const font0 = num(getComputedStyle(el).fontSize, 16);
      const keepType = t === 'pic' || t === 'text' || t === 'curve' || t === 'icon' || t === 'qr' || t === 'group' || t === 'video';
      const kids0 = isGroup(el) ? [...el.children].filter((x): x is HTMLElement => x instanceof HTMLElement).map((k) => ({ k, g: boxOf(k), fs: num(getComputedStyle(k).fontSize, 16) })) : [];
      if (isGroup(el)) settle(el);
      const c0 = { x: g0.x + g0.w / 2, y: g0.y + g0.h / 2 };
      const cos = Math.cos(rad(r));
      const sin = Math.sin(rad(r));
      // The fixed point: the opposite handle's, in the parent's pixels.
      const ax = (-sx * g0.w) / 2;
      const ay = (-sy * g0.h) / 2;
      drag(
        e,
        (ev) => {
          const p = toLocal(parent, ev.clientX, ev.clientY);
          // The pointer in the element's own frame, from its middle.
          const lx = (p.x - c0.x) * cos + (p.y - c0.y) * sin;
          const ly = -(p.x - c0.x) * sin + (p.y - c0.y) * cos;
          let w = sx ? Math.max(4, (lx - ax) * sx) : g0.w;
          let hh = sy ? Math.max(4, (ly - ay) * sy) : g0.h;
          if (corner && (keepType || ev.shiftKey)) {
            const k = Math.max(w / g0.w, hh / g0.h);
            w = g0.w * k;
            hh = g0.h * k;
          } else if (!corner && ev.shiftKey && (sx || sy)) {
            const k = sx ? w / g0.w : hh / g0.h;
            w = g0.w * k;
            hh = g0.h * k;
          }
          // The middle moves so the fixed point stays.
          const mx = ax + (sx * w) / 2;
          const my = ay + (sy * hh) / 2;
          const cx = c0.x + (sx ? mx : 0) * cos - (sy ? my : 0) * sin;
          const cy = c0.y + (sx ? mx : 0) * sin + (sy ? my : 0) * cos;
          const k = w / g0.w;
          if (t === 'text' || t === 'curve') {
            if (corner) el.style.fontSize = `${r1(Math.max(4, font0 * k))}px`;
            setBox(el, { w });
            if (t === 'curve') redrawCurve(el);
            const nh = el.offsetHeight;
            setBox(el, { x: cx - w / 2, y: cy - (corner ? nh : g0.h) / 2 });
          } else {
            setBox(el, { x: cx - w / 2, y: cy - hh / 2, w, h: hh });
            if (kids0.length) {
              const kx = w / g0.w;
              const ky = hh / g0.h;
              for (const q of kids0) {
                setBox(q.k, { x: q.g.x * kx, y: q.g.y * ky, w: q.g.w * kx, h: q.g.h * ky });
                if (q.k.style.fontSize || typeOf(q.k) === 'text') q.k.style.fontSize = `${r1(q.fs * Math.min(kx, ky))}px`;
              }
            }
          }
          setTransform(el, r, f.fx, f.fy);
          showTip(`${Math.round(w)} × ${Math.round(t === 'text' ? el.offsetHeight : hh)}`, ev.clientX, ev.clientY);
          redraw();
        },
        (moved) => {
          if (!moved) return;
          undo.push(before);
          redo.length = 0;
          coalesce = null;
          changed();
        },
      );
      return;
    }
    // Several: scaled together from the opposite corner of the box round them.
    if (!corner) return;
    const u0 = union(list.map(aabb));
    const fx = sx > 0 ? u0.x : u0.x + u0.w;
    const fy = sy > 0 ? u0.y : u0.y + u0.h;
    const starts = list.map((el) => ({ el, g: boxOf(el), fs: num(getComputedStyle(el).fontSize, 16) }));
    drag(
      e,
      (ev) => {
        const p = toLocal(parent, ev.clientX, ev.clientY);
        const k = Math.max(0.05, Math.max(((p.x - fx) * sx) / u0.w, ((p.y - fy) * sy) / u0.h));
        for (const s of starts) {
          setBox(s.el, { x: fx + (s.g.x - fx) * k, y: fy + (s.g.y - fy) * k, w: s.g.w * k, h: s.g.h * k });
          const t = typeOf(s.el);
          if (t === 'text' || t === 'curve' || s.el.style.fontSize) s.el.style.fontSize = `${r1(s.fs * k)}px`;
          if (t === 'curve') redrawCurve(s.el);
        }
        showTip(`${Math.round(u0.w * k)} × ${Math.round(u0.h * k)}`, ev.clientX, ev.clientY);
        redraw();
      },
      (moved) => {
        if (!moved) return;
        undo.push(before);
        redo.length = 0;
        coalesce = null;
        changed();
      },
    );
  };

  /** A picture being cropped: sized by its corners, about the opposite one, always covering its frame. */
  const cropResize = (e: PointerEvent, h: string) => {
    const frame = cropping!;
    const img = imgOf(frame)!;
    const c0 = cropBox(frame);
    const fw = frame.offsetWidth;
    const fh = frame.offsetHeight;
    const sx = h.includes('e') ? 1 : -1;
    const sy = h.includes('s') ? 1 : -1;
    const ax = sx > 0 ? c0.x : c0.x + c0.w;
    const ay = sy > 0 ? c0.y : c0.y + c0.h;
    const a = rad(totalRot(frame));
    drag(
      e,
      (ev) => {
        const dxw = (ev.clientX - e.clientX) / zoom;
        const dyw = (ev.clientY - e.clientY) / zoom;
        const lx = dxw * Math.cos(a) + dyw * Math.sin(a);
        const ly = -dxw * Math.sin(a) + dyw * Math.cos(a);
        const k0 = Math.max((c0.w + ((lx / fw) * 100 * sx)) / c0.w, (c0.h + ((ly / fh) * 100 * sy)) / c0.h);
        // Never smaller than its frame.
        const k = Math.max(k0, 100 / c0.w, 100 / c0.h);
        const w = c0.w * k;
        const hh = c0.h * k;
        let x = sx > 0 ? ax : ax - w;
        let y = sy > 0 ? ay : ay - hh;
        x = clamp(x, 100 - w, 0);
        y = clamp(y, 100 - hh, 0);
        setCrop(img, { x, y, w, h: hh });
        redraw();
      },
      () => {},
    );
  };
  const cropPan = (e: PointerEvent) => {
    const frame = cropping!;
    const img = imgOf(frame)!;
    const c0 = cropBox(frame);
    const fw = frame.offsetWidth;
    const fh = frame.offsetHeight;
    const a = rad(totalRot(frame));
    const f = flipsOf(frame);
    drag(
      e,
      (ev) => {
        const dxw = (ev.clientX - e.clientX) / zoom;
        const dyw = (ev.clientY - e.clientY) / zoom;
        let lx = dxw * Math.cos(a) + dyw * Math.sin(a);
        let ly = -dxw * Math.sin(a) + dyw * Math.cos(a);
        if (f.fx) lx = -lx;
        if (f.fy) ly = -ly;
        setCrop(img, { x: clamp(c0.x + (lx / fw) * 100, 100 - c0.w, 0), y: clamp(c0.y + (ly / fh) * 100, 100 - c0.h, 0), w: c0.w, h: c0.h });
        redraw();
      },
      () => {},
      1,
    );
  };

  const rotateStart = (e: PointerEvent) => {
    const el = sel[0];
    if (!el || sel.length !== 1 || locked(el)) return;
    const before = snap();
    settle(el.parentElement as HTMLElement);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const f = flipsOf(el);
    const parentRot = totalRot(el) - rotOf(el);
    drag(
      e,
      (ev) => {
        let a = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI - 90 - parentRot;
        if (ev.shiftKey) a = Math.round(a / 15) * 15;
        else {
          const near = Math.round(a / 45) * 45;
          if (Math.abs(a - near) < 3) a = near;
        }
        setTransform(el, a, f.fx, f.fy);
        showTip(`${Math.round((((a % 360) + 540) % 360) - 180)}°`, ev.clientX, ev.clientY);
        redraw();
      },
      (moved) => {
        if (!moved) return;
        undo.push(before);
        redo.length = 0;
        coalesce = null;
        changed();
      },
      1,
    );
  };

  /** A box dragged over the canvas picks what it touches (on its artboard, or in the group gone into). */
  const marqueeStart = (e: PointerEvent, b: HTMLElement | null, add: boolean) => {
    const keep = add ? [...sel] : [];
    drag(
      e,
      (ev) => {
        const x = Math.min(e.clientX, ev.clientX);
        const y = Math.min(e.clientY, ev.clientY);
        const w = Math.abs(ev.clientX - e.clientX);
        const h = Math.abs(ev.clientY - e.clientY);
        Object.assign(marq.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
        const parent = scope ?? b ?? boards().find((q) => {
          const r = q.getBoundingClientRect();
          return r.left < x + w && r.right > x && r.top < y + h && r.bottom > y;
        });
        if (!parent) return;
        const hit = [...parent.children].filter((k): k is HTMLElement => {
          if (!(k instanceof HTMLElement) || k.hasAttribute('data-n-own') || locked(k)) return false;
          const r = k.getBoundingClientRect();
          return r.width > 0 && r.left < x + w && r.right > x && r.top < y + h && r.bottom > y;
        });
        sel = [...new Set([...keep, ...hit])];
        board = boardOf(parent) ?? board;
        redraw();
      },
      () => {
        marq.style.display = 'none';
        tell();
      },
    );
  };

  // ---- the commands --------------------------------------------------------------------------------------------------
  const fromHtml = (html: unknown): HTMLElement[] => {
    const t = document.createElement('template');
    t.innerHTML = String(html ?? '');
    for (const s of t.content.querySelectorAll('script')) s.remove();
    for (const x of t.content.querySelectorAll('*'))
      for (const a of [...x.attributes]) if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) x.removeAttribute(a.name);
    return [...t.content.children].filter((x): x is HTMLElement => x instanceof HTMLElement);
  };
  const currentBoard = () => board ?? boards()[0] ?? null;
  /** The middle of what shows of an artboard. */
  const visibleMiddle = (b: HTMLElement) => {
    const r = b.getBoundingClientRect();
    const x0 = Math.max(r.left, 0);
    const x1 = Math.min(r.right, innerWidth);
    const y0 = Math.max(r.top, 0);
    const y1 = Math.min(r.bottom, innerHeight);
    const s = sizeOfBoard(b);
    if (x1 <= x0 || y1 <= y0) return { x: s.w / 2, y: s.h / 2 };
    return { x: clamp(((x0 + x1) / 2 - r.left) / zoom, 0, s.w), y: clamp(((y0 + y1) / 2 - r.top) / zoom, 0, s.h) };
  };
  const place = (els: HTMLElement[], b: HTMLElement, at?: { x: number; y: number }) => {
    for (const el of els) {
      b.append(el);
      el.classList.add('n-el');
    }
    // Centred where it shows, or where it was dropped; kept on the artboard.
    const s = sizeOfBoard(b);
    const u = union(els.map(aabb));
    const mid = at ?? visibleMiddle(b);
    const dx = clamp(mid.x - u.w / 2, Math.min(0, s.w - u.w), Math.max(0, s.w - u.w)) - u.x;
    const dy = clamp(mid.y - u.h / 2, Math.min(0, s.h - u.h), Math.max(0, s.h - u.h)) - u.y;
    for (const el of els) {
      const g = boxOf(el);
      setBox(el, { x: g.x + dx, y: g.y + dy });
    }
  };
  /** Words fitted to their box after their size changed: a text box with no width of its own. */
  const redrawCurve = (el: HTMLElement) => {
    if (typeOf(el) !== 'curve') return;
    const text = el.getAttribute('data-text') ?? '';
    const w = el.offsetWidth || num(el.style.width, 300);
    const size = num(getComputedStyle(el).fontSize, 32);
    const amount = num(el.getAttribute('data-curve'), 50);
    const ls = num(getComputedStyle(el).letterSpacing, 0);
    const g = curveGeom(w, size, amount);
    const id = el.querySelector('path')?.id || `n-c${Math.random().toString(36).slice(2, 8)}`;
    el.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', `0 0 ${r1(w)} ${g.h}`);
    s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const p = document.createElementNS(ns, 'path');
    p.id = id;
    p.setAttribute('d', g.d);
    p.setAttribute('fill', 'none');
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', 'currentColor');
    t.setAttribute('font-size', String(r1(size)));
    if (ls) t.setAttribute('letter-spacing', String(r1(ls)));
    const tp = document.createElementNS(ns, 'textPath');
    tp.setAttribute('href', `#${id}`);
    tp.setAttribute('startOffset', '50%');
    tp.textContent = text;
    t.append(tp);
    s.append(p, t);
    el.append(s);
    el.style.height = `${g.h}px`;
  };
  const toCurve = (el: HTMLElement, amount: number) => {
    const text = el.innerText.replace(/\s+/g, ' ').trim();
    el.classList.add('n-curve');
    el.setAttribute('data-text', text);
    el.setAttribute('data-curve', String(Math.round(amount)));
    if (!/px$/.test(el.style.width)) el.style.width = `${Math.max(120, el.offsetWidth)}px`;
    redrawCurve(el);
  };
  const fromCurve = (el: HTMLElement) => {
    const text = el.getAttribute('data-text') ?? '';
    el.classList.remove('n-curve');
    el.removeAttribute('data-text');
    el.removeAttribute('data-curve');
    el.style.removeProperty('height');
    el.textContent = text;
  };
  /** Copies its look, not its place. */
  const lookOf = (el: HTMLElement) => {
    const out: [string, string][] = [];
    for (let i = 0; i < el.style.length; i++) {
      const k = el.style[i];
      if (/^(left|top|right|bottom|width|height|transform|position|margin.*)$/.test(k)) continue;
      out.push([k, el.style.getPropertyValue(k)]);
    }
    const img = imgOf(el);
    return { type: typeOf(el), style: out, img: img ? img.style.filter : null };
  };
  let lookClip: ReturnType<typeof lookOf> | null = null;
  let clip = '';
  let pasted = 0;
  const KEEP = /^(left|top|right|bottom|width|height|transform|position|margin.*)$/;

  /** A picture in place of what a frame shows (or a new one): its box covering the frame. */
  const putPicture = (frame: HTMLElement, src: string, alt?: string) => {
    if (frame.tagName === 'IMG') {
      frame.setAttribute('src', src);
      if (alt !== undefined) frame.setAttribute('alt', alt);
      return;
    }
    let img = imgOf(frame);
    if (!img) {
      img = document.createElement('img');
      frame.append(img);
    }
    img.setAttribute('src', src);
    if (alt !== undefined) img.setAttribute('alt', alt);
    for (const k of ['left', 'top', 'width', 'height']) img.style.removeProperty(k);
    if (!img.getAttribute('style')) img.removeAttribute('style');
    if (frame.classList.contains('n-ph')) {
      frame.classList.remove('n-ph');
      frame.style.removeProperty('background');
      frame.removeAttribute('data-hint');
    }
    img.addEventListener('load', () => redraw(), { once: true });
  };
  const newPicture = (src: string, alt: string, nw: number, nh: number, b: HTMLElement, at?: { x: number; y: number }) => {
    const s = sizeOfBoard(b);
    const k = Math.min((s.w * 0.6) / (nw || 1), (s.h * 0.6) / (nh || 1));
    const w = Math.max(24, (nw || 400) * k);
    const h = Math.max(24, (nh || 300) * k);
    const el = document.createElement('div');
    el.className = 'n-el n-pic';
    el.setAttribute('data-frame', 'rect');
    el.style.cssText = `left:0px;top:0px;width:${r1(w)}px;height:${r1(h)}px`;
    const img = document.createElement('img');
    img.setAttribute('src', src);
    img.setAttribute('alt', alt);
    el.append(img);
    place([el], b, at);
    return el;
  };

  // Pictures and videos dropped or pasted, waiting for the app to make them ready ("fill").
  const waiting = new Map<string, { b: HTMLElement; at: { x: number; y: number }; target: HTMLElement | null }>();
  let waitSeq = 0;
  const askFile = (file: File, b: HTMLElement, at: { x: number; y: number }, target: HTMLElement | null) => {
    const id = `f${++waitSeq}`;
    waiting.set(id, { b, at, target });
    send({ type: 'wa-ed-design', what: 'file', id, file });
  };

  const act = (a: string, arg?: any) => {
    const one = sel.length === 1 ? sel[0] : null;
    switch (a) {
      case 'select': {
        const el = byPath(arg?.path ?? arg);
        if (el && boardOf(el)) {
          scope = el.parentElement && isGroup(el.parentElement) ? el.parentElement : null;
          select([el]);
        }
        return;
      }
      case 'deselect':
        return select([]);
      case 'selectAll': {
        const b = scope ?? currentBoard();
        if (!b) return;
        return select([...b.children].filter((x): x is HTMLElement => x instanceof HTMLElement && !locked(x)));
      }
      case 'insert': {
        const b = currentBoard();
        const els = fromHtml(arg?.html);
        if (!b || !els.length) return;
        endText();
        endCrop(true);
        remember();
        scope = null;
        place(els, b, arg?.at);
        for (const el of els) if (typeOf(el) === 'curve') redrawCurve(el);
        sel = els;
        changed();
        if (arg?.edit && els.length === 1 && writable(els[0])) startText(els[0]);
        return;
      }
      case 'style': {
        const props = (arg?.props ?? arg ?? {}) as Record<string, string | null>;
        const list = arg?.board ? (currentBoard() ? [currentBoard()!] : []) : sel;
        if (!list.length) return;
        remember(`style:${arg?.target ?? ''}:${Object.keys(props).sort().join(',')}:${list.map(pathOf).join('|')}`);
        for (const el of list) {
          const tgt = arg?.target === 'img' ? imgOf(el) : arg?.target === 'video' ? vidOf(el) : el;
          if (!tgt) continue;
          for (const [k, v] of Object.entries(props)) {
            if (!/^(--[\w-]+|-?[a-z][a-z-]*)$/.test(k) || (v !== null && /[{}<;]/.test(String(v)))) continue;
            if (v === null || v === '') tgt.style.removeProperty(k);
            else tgt.style.setProperty(k, String(v));
          }
          if (!tgt.getAttribute('style')) tgt.removeAttribute('style');
          if (typeOf(el) === 'curve' && ('font-size' in props || 'letter-spacing' in props || 'font-family' in props)) redrawCurve(el);
        }
        return changed();
      }
      case 'attr': {
        const name = String(arg?.name ?? '').toLowerCase();
        if (!one || !/^[a-z][a-z0-9:_.-]*$/.test(name) || name.startsWith('on') || name === 'style' || name === 'contenteditable') return;
        const tgt = arg?.target === 'img' ? imgOf(one) : arg?.target === 'video' ? vidOf(one) : one;
        if (!tgt) return;
        if ((name === 'src' || name === 'href') && /^\s*javascript:/i.test(String(arg?.value ?? ''))) return;
        remember(`attr:${name}`);
        if (arg.value === null || arg.value === false) tgt.removeAttribute(name);
        else tgt.setAttribute(name, arg.value === true ? '' : String(arg.value));
        return changed();
      }
      case 'html': {
        // An element's insides anew (a QR code drawn again, an icon changed), its box kept.
        if (!one) return;
        remember();
        const els = fromHtml(arg?.html);
        if (!els.length) return;
        const g = boxOf(one);
        const f = flipsOf(one);
        const r = rotOf(one);
        const nx = els[0];
        // Its place and turn stay; the rest is the new one's.
        nx.style.left = `${g.x}px`;
        nx.style.top = `${g.y}px`;
        if (arg?.keepSize !== false) {
          nx.style.width = `${g.w}px`;
          if (!autoH(nx)) nx.style.height = `${g.h}px`;
        }
        setTransform(nx, r, f.fx, f.fy);
        if (locked(one)) nx.setAttribute('data-locked', '1');
        one.replaceWith(nx);
        sel = [nx];
        return changed();
      }
      case 'words': {
        if (!one) return;
        const t = typeOf(one);
        const text = String(arg?.text ?? arg ?? '');
        remember(`words:${pathOf(one).join('.')}`);
        if (t === 'curve') {
          one.setAttribute('data-text', text.replace(/\s+/g, ' '));
          redrawCurve(one);
        } else if (t === 'text') {
          const hl = one.querySelector<HTMLElement>(':scope > .n-hlb');
          (hl ?? one).innerText = text;
        } else return;
        return changed();
      }
      case 'curve': {
        if (!one || (typeOf(one) !== 'text' && typeOf(one) !== 'curve')) return;
        const amount = clamp(Math.round(Number(arg?.amount ?? 0)), -100, 100);
        remember(`curve:${pathOf(one).join('.')}`);
        if (!amount) {
          if (typeOf(one) === 'curve') fromCurve(one);
        } else if (typeOf(one) === 'curve') {
          one.setAttribute('data-curve', String(amount));
          redrawCurve(one);
        } else toCurve(one, amount);
        return changed();
      }
      case 'highlight': {
        if (!one || typeOf(one) !== 'text') return;
        remember(`hl:${pathOf(one).join('.')}`);
        let hl = one.querySelector<HTMLElement>(':scope > .n-hlb');
        const c = typeof arg?.colour === 'string' ? arg.colour : null;
        if (!c) {
          if (hl) hl.replaceWith(...hl.childNodes);
        } else {
          if (!hl) {
            hl = document.createElement('span');
            hl.className = 'n-hlb';
            hl.append(...one.childNodes);
            one.append(hl);
          }
          hl.style.backgroundColor = c;
        }
        return changed();
      }
      case 'exec': {
        // While words are written: on the words picked; else on the whole element.
        const c = String(arg?.cmd ?? '');
        if (editing) {
          editing.focus({ preventScroll: true });
          document.execCommand('styleWithCSS', false, 'true');
          document.execCommand(c, false, arg?.value);
          return redraw();
        }
        if (!sel.length) return;
        const cs = getComputedStyle(sel[0]);
        const props: Record<string, string | null> =
          c === 'bold'
            ? { 'font-weight': Number(cs.fontWeight) >= 600 ? '400' : '700' }
            : c === 'italic'
              ? { 'font-style': cs.fontStyle === 'italic' ? null : 'italic' }
              : c === 'underline'
                ? { 'text-decoration-line': /underline/.test(cs.textDecorationLine) ? null : 'underline' }
                : c === 'strikeThrough'
                  ? { 'text-decoration-line': /line-through/.test(cs.textDecorationLine) ? null : 'line-through' }
                  : c === 'foreColor'
                    ? { color: String(arg?.value ?? '') }
                    : {};
        return act('style', { props });
      }
      case 'geom': {
        if (!one || locked(one)) return;
        remember(`geom:${pathOf(one).join('.')}`);
        settle(one.parentElement as HTMLElement);
        const g = boxOf(one);
        const f = flipsOf(one);
        const nx: Partial<Geom> = {};
        for (const k of ['x', 'y', 'w', 'h'] as const) if (typeof arg?.[k] === 'number' && Number.isFinite(arg[k])) nx[k] = arg[k];
        if (nx.w !== undefined && typeOf(one) === 'text' && arg?.scale) one.style.fontSize = `${r1(num(getComputedStyle(one).fontSize, 16) * (nx.w / g.w))}px`;
        setBox(one, nx);
        if (typeOf(one) === 'curve') redrawCurve(one);
        if (typeof arg?.r === 'number') setTransform(one, arg.r, f.fx, f.fy);
        return changed();
      }
      case 'flip': {
        const list = sel.filter((x) => !locked(x) && typeOf(x) !== 'text' && typeOf(x) !== 'curve');
        if (!list.length) return;
        remember();
        for (const el of list) {
          const f = flipsOf(el);
          setTransform(el, rotOf(el), arg === 'v' ? f.fx : !f.fx, arg === 'v' ? !f.fy : f.fy);
        }
        return changed();
      }
      case 'align': {
        const list = sel.filter((x) => !locked(x));
        if (!list.length) return;
        const parent = list[0].parentElement as HTMLElement;
        remember();
        settle(parent);
        const target = list.length > 1 ? union(list.map(aabb)) : isBoard(parent) ? { x: 0, y: 0, ...sizeOfBoard(parent) } : { x: 0, y: 0, w: parent.offsetWidth, h: parent.offsetHeight };
        for (const el of list) {
          const b = aabb(el);
          const g = boxOf(el);
          let dx = 0;
          let dy = 0;
          if (arg === 'left') dx = target.x - b.x;
          if (arg === 'center') dx = target.x + target.w / 2 - (b.x + b.w / 2);
          if (arg === 'right') dx = target.x + target.w - (b.x + b.w);
          if (arg === 'top') dy = target.y - b.y;
          if (arg === 'middle') dy = target.y + target.h / 2 - (b.y + b.h / 2);
          if (arg === 'bottom') dy = target.y + target.h - (b.y + b.h);
          setBox(el, { x: g.x + dx, y: g.y + dy });
        }
        return changed();
      }
      case 'distribute': {
        const list = sel.filter((x) => !locked(x));
        if (list.length < 3) return;
        remember();
        settle(list[0].parentElement as HTMLElement);
        const h = arg !== 'v';
        const items = list.map((el) => ({ el, b: aabb(el), g: boxOf(el) })).sort((p, q) => (h ? p.b.x - q.b.x : p.b.y - q.b.y));
        const first = items[0].b;
        const last = items[items.length - 1].b;
        const span = h ? last.x + last.w - first.x : last.y + last.h - first.y;
        const sizes = items.reduce((s, i) => s + (h ? i.b.w : i.b.h), 0);
        const gap = (span - sizes) / (items.length - 1);
        let at = h ? first.x : first.y;
        for (const i of items) {
          if (h) setBox(i.el, { x: i.g.x + (at - i.b.x) });
          else setBox(i.el, { y: i.g.y + (at - i.b.y) });
          at += (h ? i.b.w : i.b.h) + gap;
        }
        return changed();
      }
      case 'order': {
        if (!sel.length) return;
        remember();
        const parent = sel[0].parentElement as HTMLElement;
        const list = [...parent.children].filter((x) => sel.includes(x as HTMLElement)) as HTMLElement[];
        if (arg === 'front') for (const el of list) parent.append(el);
        else if (arg === 'back') for (const el of [...list].reverse()) parent.prepend(el);
        else if (arg === 'forward')
          for (const el of [...list].reverse()) {
            const n = el.nextElementSibling;
            if (n && !sel.includes(n as HTMLElement)) n.after(el);
          }
        else if (arg === 'backward')
          for (const el of list) {
            const p = el.previousElementSibling;
            if (p && !sel.includes(p as HTMLElement)) p.before(el);
          }
        return changed();
      }
      case 'group': {
        if (sel.length < 2 || !sel.every((x) => x.parentElement === sel[0].parentElement)) return;
        const parent = sel[0].parentElement as HTMLElement;
        remember();
        endText();
        settle(parent);
        const list = [...parent.children].filter((x) => sel.includes(x as HTMLElement)) as HTMLElement[];
        const u = union(list.map(aabb));
        const g = document.createElement('div');
        g.className = 'n-el n-group';
        g.style.cssText = `left:${r1(u.x)}px;top:${r1(u.y)}px;width:${r1(u.w)}px;height:${r1(u.h)}px`;
        list[list.length - 1].after(g);
        for (const el of list) {
          const b = boxOf(el);
          g.append(el);
          setBox(el, { x: b.x - u.x, y: b.y - u.y });
        }
        sel = [g];
        return changed();
      }
      case 'ungroup': {
        const groups = sel.filter(isGroup);
        if (!groups.length) return;
        remember();
        const out: HTMLElement[] = [];
        for (const g of groups) {
          settle(g);
          const gb = boxOf(g);
          const gr = rotOf(g);
          const gc = { x: gb.x + gb.w / 2, y: gb.y + gb.h / 2 };
          for (const el of [...g.children].filter((x): x is HTMLElement => x instanceof HTMLElement)) {
            const b = boxOf(el);
            const f = flipsOf(el);
            // Its middle where it showed, turned with the group.
            const lx = b.x + b.w / 2 - gb.w / 2;
            const ly = b.y + b.h / 2 - gb.h / 2;
            const cx = gc.x + lx * Math.cos(rad(gr)) - ly * Math.sin(rad(gr));
            const cy = gc.y + lx * Math.sin(rad(gr)) + ly * Math.cos(rad(gr));
            g.before(el);
            setBox(el, { x: cx - b.w / 2, y: cy - b.h / 2 });
            setTransform(el, rotOf(el) + gr, f.fx, f.fy);
            if (g.style.opacity) el.style.opacity = String(num(el.style.opacity, 1) * num(g.style.opacity, 1));
            out.push(el);
          }
          g.remove();
        }
        sel = out;
        scope = null;
        return changed();
      }
      case 'lock': {
        if (!sel.length) return;
        remember();
        const on = !sel.every(locked);
        for (const el of sel) {
          if (on) el.setAttribute('data-locked', '1');
          else el.removeAttribute('data-locked');
        }
        return changed();
      }
      case 'dup': {
        const list = sel.filter((x) => !locked(x));
        if (!list.length) return;
        remember();
        endText();
        const copies = list.map((el) => {
          const c = el.cloneNode(true) as HTMLElement;
          c.removeAttribute('id');
          for (const x of c.querySelectorAll('[id]')) if (x.tagName.toLowerCase() !== 'path') x.removeAttribute('id');
          el.after(c);
          const g = boxOf(el);
          setBox(c, { x: g.x + 16, y: g.y + 16 });
          return c;
        });
        for (const c of copies) if (typeOf(c) === 'curve') redrawCurve(c);
        sel = copies;
        return changed();
      }
      case 'del': {
        const list = sel.filter((x) => !locked(x));
        if (!list.length) return;
        remember();
        endText(true);
        for (const el of list) el.remove();
        sel = sel.filter((x) => x.isConnected);
        return changed();
      }
      case 'copy':
      case 'cut': {
        if (!sel.length) return;
        clip = sel.map((x) => x.outerHTML).join('\n');
        pasted = 0;
        send({ type: 'wa-ed-copied', html: clip, name: sel.length > 1 ? L('dMany', '{0} elements').replace('{0}', String(sel.length)) : nameOf(sel[0]) });
        if (a === 'cut') act('del');
        return;
      }
      case 'clip':
        if (typeof arg?.html === 'string') clip = arg.html;
        return;
      case 'paste': {
        const html = typeof arg?.html === 'string' ? arg.html : clip;
        const b = scope ?? currentBoard();
        const els = fromHtml(html);
        if (!b || !els.length) return;
        remember();
        endText();
        pasted++;
        for (const el of els) {
          b.append(el);
          const g = boxOf(el);
          setBox(el, { x: g.x + 16 * pasted, y: g.y + 16 * pasted });
          if (typeOf(el) === 'curve') redrawCurve(el);
        }
        sel = els;
        return changed();
      }
      case 'copyStyle':
        if (one) lookClip = lookOf(one);
        return;
      case 'pasteStyle': {
        if (!lookClip || !sel.length) return;
        remember();
        for (const el of sel) {
          for (let i = el.style.length - 1; i >= 0; i--) if (!KEEP.test(el.style[i])) el.style.removeProperty(el.style[i]);
          for (const [k, v] of lookClip.style) el.style.setProperty(k, v);
          const img = imgOf(el);
          if (img && lookClip.img !== null) img.style.filter = lookClip.img;
          if (typeOf(el) === 'curve') redrawCurve(el);
        }
        return changed();
      }
      case 'zoom': {
        if (arg === 'fit') return fit();
        if (arg === 'in') return setZoom(zoom * 1.25);
        if (arg === 'out') return setZoom(zoom / 1.25);
        if (typeof arg === 'number') return setZoom(arg);
        return;
      }
      case 'board': {
        const b = currentBoard();
        if (!b) return;
        return act('style', { props: arg?.props ?? {}, board: true });
      }
      case 'boardSize': {
        const b = currentBoard();
        const w = Math.round(Number(arg?.w));
        const h = Math.round(Number(arg?.h));
        if (!b || !(w >= 16 && h >= 16 && w <= 8000 && h <= 8000)) return;
        remember();
        endText();
        endCrop(true);
        const all = arg?.all ? boards() : [b];
        for (const q of all) {
          if (arg?.scale) resizeBoard(q, { w, h });
          q.style.width = `${w}px`;
          q.style.height = `${h}px`;
          q.setAttribute('data-w', String(w));
          q.setAttribute('data-h', String(h));
        }
        layout();
        changed();
        tellBoards();
        return fit(b);
      }
      case 'addBoard': {
        const b = currentBoard();
        if (!b || boards().length >= 30) return;
        remember();
        endText();
        const nb = arg?.copy ? (b.cloneNode(true) as HTMLElement) : (b.cloneNode(false) as HTMLElement);
        if (!arg?.copy) {
          const keepBg = b.style.backgroundColor || '';
          nb.style.removeProperty('background');
          nb.style.removeProperty('background-image');
          if (keepBg) nb.style.backgroundColor = keepBg;
        }
        b.after(nb);
        board = nb;
        sel = [];
        layout();
        changed();
        tellBoards();
        showBoard(nb);
        return;
      }
      case 'delBoard': {
        const b = currentBoard();
        if (!b || boards().length < 2) return;
        remember();
        const next = (b.nextElementSibling as HTMLElement | null) ?? (b.previousElementSibling as HTMLElement | null);
        b.remove();
        board = next && isBoard(next) ? next : (boards()[0] ?? null);
        sel = [];
        layout();
        changed();
        return tellBoards();
      }
      case 'moveBoard': {
        const b = currentBoard();
        if (!b) return;
        const other = (arg === 'up' ? b.previousElementSibling : b.nextElementSibling) as HTMLElement | null;
        if (!other || !isBoard(other)) return;
        remember();
        if (arg === 'up') other.before(b);
        else other.after(b);
        layout();
        changed();
        tellBoards();
        return showBoard(b);
      }
      case 'goBoard': {
        const b = boards()[Number(arg)];
        if (!b) return;
        board = b;
        sel = [];
        tell();
        tellBoards();
        showBoard(b);
        return redraw();
      }
      case 'resizedCopy': {
        // The whole design at another size (Magic resize), for a copy: worked out from what shows, written into its HTML.
        const w = Math.round(Number(arg?.w));
        const h = Math.round(Number(arg?.h));
        if (!(w >= 16 && h >= 16 && w <= 8000 && h <= 8000)) return;
        const d = new DOMParser().parseFromString(serialize(), 'text/html');
        const live = boards();
        const copies = [...d.querySelectorAll<HTMLElement>('.n-artboard')];
        live.forEach((b, i) => {
          const c = copies[i];
          if (!c) return;
          const from = sizeOfBoard(b);
          const kids = [...b.children].filter((x): x is HTMLElement => x instanceof HTMLElement);
          const ckids = [...c.children].filter((x): x is HTMLElement => x instanceof HTMLElement);
          kids.forEach((el, j) => {
            const ce = ckids[j];
            if (ce) moveFor(el, ce, from, { w, h });
          });
          c.style.width = `${w}px`;
          c.style.height = `${h}px`;
          c.setAttribute('data-w', String(w));
          c.setAttribute('data-h', String(h));
        });
        const m = d.querySelector('.n-design');
        if (m && typeof arg?.size === 'string') m.setAttribute('data-size', arg.size);
        send({ type: 'wa-ed-design', what: 'resized', id: arg?.id, html: `${cfg.doctype ? `${cfg.doctype}\n` : ''}${d.documentElement.outerHTML}` });
        return;
      }
      case 'crop':
        if (one) startCrop(one);
        return;
      case 'cropDone':
        return endCrop(true);
      case 'picture': {
        // A picture in the frame picked (in place of its own), or a new one.
        const src = String(arg?.src ?? '');
        if (!/^(data:image\/|https?:|\/)/.test(src)) return;
        remember();
        endCrop(true);
        const alt = typeof arg?.alt === 'string' ? arg.alt : undefined;
        if (one && typeOf(one) === 'pic' && !arg?.new) putPicture(one, src, alt);
        else {
          const b = currentBoard();
          if (!b) return;
          sel = [newPicture(src, alt ?? '', Number(arg?.w) || 0, Number(arg?.h) || 0, b)];
        }
        return changed();
      }
      case 'video': {
        // A video in the element picked (a video's own), or a new one.
        const src = String(arg?.src ?? '');
        if (!/^(\/pg\/video\/|https?:|data:video\/)/.test(src)) return;
        remember();
        const poster = typeof arg?.poster === 'string' && /^(data:image\/|\/)/.test(arg.poster) ? arg.poster : '';
        if (one && typeOf(one) === 'video' && !arg?.new) {
          const v = vidOf(one);
          if (v) {
            v.setAttribute('src', src);
            if (poster) v.setAttribute('poster', poster);
            else v.removeAttribute('poster');
          }
        } else {
          const b = currentBoard();
          if (!b) return;
          const s = sizeOfBoard(b);
          const nw = Number(arg?.w) || 16;
          const nh = Number(arg?.h) || 9;
          const k = Math.min((s.w * 0.7) / nw, (s.h * 0.7) / nh);
          const el = document.createElement('div');
          el.className = 'n-el n-vid';
          el.style.cssText = `left:0px;top:0px;width:${r1(nw * k)}px;height:${r1(nh * k)}px`;
          const v = document.createElement('video');
          v.setAttribute('src', src);
          if (poster) v.setAttribute('poster', poster);
          for (const at of arg?.background === false ? ['controls', 'playsinline'] : ['autoplay', 'muted', 'loop', 'playsinline']) v.setAttribute(at, '');
          el.append(v);
          place([el], b);
          sel = [el];
        }
        return changed();
      }
      case 'fill': {
        // A picture or a video dropped (or pasted), now ready.
        const w = waiting.get(String(arg?.id ?? ''));
        if (!w) return;
        waiting.delete(String(arg.id));
        for (const x of document.querySelectorAll('.n-dropping')) x.classList.remove('n-dropping');
        if (typeof arg?.video === 'string') {
          board = w.b;
          return act('video', { src: arg.video, poster: arg.poster, w: arg.w, h: arg.h, new: true });
        }
        const src = String(arg?.src ?? '');
        if (!/^data:image\//.test(src)) return;
        remember();
        if (w.target && w.target.isConnected && typeOf(w.target) === 'pic') {
          putPicture(w.target, src);
          sel = [w.target];
        } else sel = [newPicture(src, '', Number(arg?.w) || 0, Number(arg?.h) || 0, w.b, w.at)];
        board = w.b;
        return changed();
      }
      case 'pictureSrc': {
        const img = one ? imgOf(one) : null;
        const b = currentBoard();
        const bg = !img && b ? /url\(["']?(data:[^"')]+|[^"')]+)["']?\)/.exec(b.style.backgroundImage || b.style.background || '')?.[1] : '';
        return send({ type: 'wa-ed-design', what: 'pictureSrc', id: arg?.id, src: img?.getAttribute('src') ?? bg ?? '' });
      }
      case 'fontsHref':
        return setFonts(String(arg ?? ''));
      case 'applyFonts': {
        // A heading font for the big words, a body font for the rest (brand fonts, a pairing).
        const texts = boards().flatMap((b) => [...b.querySelectorAll<HTMLElement>('.n-text,.n-curve')]);
        if (!texts.length) return;
        remember();
        const sizes = texts.map((t) => num(getComputedStyle(t).fontSize, 16));
        const big = Math.max(...sizes);
        texts.forEach((t, i) => {
          const head = sizes[i] >= Math.max(28, big * 0.5);
          const v = head ? arg?.head : arg?.body;
          if (typeof v === 'string' && v && !/[{}<;]/.test(v)) t.style.fontFamily = v;
          if (typeOf(t) === 'curve') redrawCurve(t);
        });
        if (typeof arg?.href === 'string') setFonts(arg.href);
        return changed();
      }
      case 'recolour': {
        // Colours swapped everywhere: in styles, in drawings, on the artboards.
        const map = new Map<string, string>();
        for (const [k, v] of Object.entries((arg?.map ?? {}) as Record<string, string>)) {
          const f = hexOf(k);
          if (f && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) map.set(f, v);
        }
        if (!map.size) return;
        remember();
        for (const b of boards())
          for (const el of [b, ...b.querySelectorAll<HTMLElement>('[style],[fill],[stroke]')]) {
            const st = el.getAttribute('style');
            if (st) {
              const next = st.replace(/url\([^)]*\)|#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi, (m) => {
                if (/^url/i.test(m)) return m;
                const h = hexOf(m);
                return h && map.has(h) ? map.get(h)! : m;
              });
              if (next !== st) el.setAttribute('style', next);
            }
            for (const at of ['fill', 'stroke']) {
              const h = hexOf(el.getAttribute(at) ?? '');
              if (h && map.has(h)) el.setAttribute(at, map.get(h)!);
            }
          }
        return changed();
      }
      case 'brandColours': {
        // The design's colourful colours become the brand's, the most used first; its greys, whites and blacks stay,
        // but its darkest words take the brand's darkest colour when that is dark enough.
        const brand = (Array.isArray(arg?.colours) ? arg.colours : []).map((c: unknown) => hexOf(String(c))).filter((c: string | null): c is string => !!c);
        if (!brand.length) return;
        const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
        const chroma = (h: string) => Math.max(...rgb(h)) - Math.min(...rgb(h));
        const light = (h: string) => {
          const [r, g, b2] = rgb(h);
          return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
        };
        const mine = used().colours;
        const vivid = brand.filter((c) => chroma(c) >= 0.18);
        const pool = vivid.length ? vivid : brand;
        const map: Record<string, string> = {};
        let i = 0;
        for (const c of mine)
          if (chroma(c) >= 0.18) {
            map[c] = pool[i % pool.length];
            i++;
          }
        const darkest = [...brand].sort((x, y) => light(x) - light(y))[0];
        const ink = mine.filter((c) => chroma(c) < 0.18 && light(c) < 0.12)[0];
        if (ink && darkest && light(darkest) < 0.12) map[ink] = darkest;
        return act('recolour', { map });
      }
      case 'meta':
        if (typeof arg?.title === 'string') {
          remember();
          document.title = arg.title.slice(0, 200);
          return changed();
        }
        return;
      case 'theme': {
        root.setAttribute('data-n-theme', arg?.theme === 'dark' ? 'dark' : 'light');
        const el = document.getElementById('n-theme');
        if (el && typeof arg?.css === 'string' && arg.css.length < 40000) el.textContent = arg.css;
        return;
      }
      case 'used':
        return tellUsed();
      case 'write':
        if (one) startText(one);
        return;
      case 'endText':
        return endText();
      case 'undo':
        return step(true);
      case 'redo':
        return step(false);
      default:
        return;
    }
  };

  /** Scales what is in a group by kx and ky (its words by the smaller). */
  const scaleInside = (g: HTMLElement, kx: number, ky: number) => {
    for (const k of [...g.children].filter((x): x is HTMLElement => x instanceof HTMLElement)) {
      const b = boxOf(k);
      const fs = num(getComputedStyle(k).fontSize, 16);
      setBox(k, { x: b.x * kx, y: b.y * ky, w: b.w * kx, h: b.h * ky });
      if (typeOf(k) === 'text' || typeOf(k) === 'curve' || k.style.fontSize) k.style.fontSize = `${r1(fs * Math.min(kx, ky))}px`;
      if (isGroup(k)) scaleInside(k, kx, ky);
      if (typeOf(k) === 'curve') redrawCurve(k);
    }
  };
  /** An artboard's elements placed for a new size (Magic resize), in place. */
  const resizeBoard = (b: HTMLElement, to: { w: number; h: number }) => {
    settle(b);
    const from = sizeOfBoard(b);
    for (const el of [...b.children].filter((x): x is HTMLElement => x instanceof HTMLElement)) moveFor(el, el, from, to);
  };
  /** Where `el` (measured live) goes on an artboard of size `to`, written to `out` (itself, or its copy in another page). */
  const moveFor = (el: HTMLElement, out: HTMLElement, from: { w: number; h: number }, to: { w: number; h: number }) => {
    const g = boxOf(el);
    const n = fitBox(g, from, to);
    const t = typeOf(el);
    const fs = num(getComputedStyle(el).fontSize, 16);
    out.style.position = 'absolute';
    out.style.left = `${n.x}px`;
    out.style.top = `${n.y}px`;
    out.style.width = `${n.w}px`;
    if (!autoH(el)) out.style.height = `${n.h}px`;
    if (t === 'text' || t === 'curve' || el.style.fontSize) out.style.fontSize = `${r1(fs * n.k)}px`;
    if (isGroup(el)) {
      const kx = n.w / g.w;
      const ky = n.h / g.h;
      const kids = [...el.children].filter((x): x is HTMLElement => x instanceof HTMLElement);
      const okids = [...out.children].filter((x): x is HTMLElement => x instanceof HTMLElement);
      kids.forEach((k, i) => {
        const o = okids[i];
        if (!o) return;
        const b = boxOf(k);
        const kfs = num(getComputedStyle(k).fontSize, 16);
        o.style.left = `${r1(b.x * kx)}px`;
        o.style.top = `${r1(b.y * ky)}px`;
        o.style.width = `${r1(b.w * kx)}px`;
        if (!autoH(k)) o.style.height = `${r1(b.h * ky)}px`;
        if (typeOf(k) === 'text' || typeOf(k) === 'curve' || k.style.fontSize) o.style.fontSize = `${r1(kfs * Math.min(kx, ky))}px`;
      });
    }
    // Curved words are drawn again for their new width where they show (in place; a copy draws them as it opens).
    if (out === el && t === 'curve') redrawCurve(el);
  };
  void scaleInside;

  const setFonts = (href: string) => {
    let l = fontsLink();
    if (!href || !/^https:\/\/fonts\.googleapis\.com\/css2\?/.test(href)) {
      if (!href) l?.remove();
      return;
    }
    if (!l) {
      l = document.createElement('link');
      l.id = 'n-fonts';
      l.rel = 'stylesheet';
      document.head.appendChild(l);
    }
    if (l.getAttribute('href') !== href) l.setAttribute('href', href);
    l.addEventListener('load', () => redraw(), { once: true });
  };

  // ---- the bar over the picked, and the artboards' buttons --------------------------------------------------------
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest?.('button');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const a = b.dataset.a!;
    if (a === 'editPicture' || a === 'editVideo') return send({ type: 'wa-ed-design', what: 'action', action: a });
    if (a === 'menu') {
      const r = b.getBoundingClientRect();
      return send({ type: 'wa-ed-design', what: 'menu', x: r.left, y: r.bottom + 4 });
    }
    if (a === 'write') return sel[0] && startText(sel[0]);
    act(a);
  });
  pagesUi.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  pagesUi.addEventListener('click', (e) => {
    const b = (e.target as Element).closest?.('[data-p]') as HTMLElement | null;
    const label = (e.target as Element).closest?.('.pg') as HTMLElement | null;
    const i = Number((b ?? label)?.dataset.i ?? -1);
    const q = boards()[i];
    if (!q) return;
    board = q;
    const p = b?.dataset.p;
    if (p === 'up' || p === 'down') act('moveBoard', p);
    else if (p === 'dupPage') act('addBoard', { copy: true });
    else if (p === 'delPage') act('delBoard');
    else if (p === 'addPage') act('addBoard', {});
    else select([], q);
    tellBoards();
  });
  selBox.addEventListener('pointerdown', (e) => {
    const h = (e.composedPath()[0] as HTMLElement).closest?.('[data-h]') as HTMLElement | null;
    if (!h) return;
    e.preventDefault();
    e.stopPropagation();
    window.focus();
    if (h.dataset.h === 'rot') rotateStart(e as PointerEvent);
    else resizeStart(e as PointerEvent, h.dataset.h!);
  });

  // ---- the page's own events: the editor's, but for words being written -----------------------------------------------
  const inEditing = (e: Event) => !!editing && e.target instanceof Node && editing.contains(e.target);
  const boardAt = (x: number, y: number) =>
    boards().find((b) => {
      const r = b.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }) ?? null;
  let lastTap = { at: 0, el: null as HTMLElement | null };
  addEventListener(
    'pointerdown',
    (e) => {
      if (fromUi(e) || inEditing(e)) return;
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      window.focus();
      if (editing) endText();
      const b = boardAt(e.clientX, e.clientY);
      if (cropping) {
        if (cropping.contains(e.target as Node) || (imgOf(cropping) && (() => {
          const r = imgOf(cropping)!.getBoundingClientRect();
          return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        })())) return cropPan(e);
        endCrop(true);
      }
      const el = pick(e.target, true);
      if (e.button === 2) {
        if (el && !sel.includes(el)) select([el]);
        return;
      }
      if (!el) {
        if (!e.shiftKey) select([], b ?? board);
        if (b) tellBoards();
        return marqueeStart(e, scope ?? b, e.shiftKey);
      }
      // A second tap on words picked writes in them (phones have no double-click here).
      const now = Date.now();
      if (coarse && lastTap.el === el && now - lastTap.at < 450 && writable(el)) {
        lastTap = { at: 0, el: null };
        return startText(el, { x: e.clientX, y: e.clientY });
      }
      lastTap = { at: now, el };
      if (e.shiftKey) {
        const has = sel.includes(el);
        if (has) return select(sel.filter((x) => x !== el));
        if (sel.length && sel[0].parentElement !== el.parentElement) return select([el]);
        return select([...sel, el]);
      }
      if (!sel.includes(el)) select([el]);
      if (b && b !== board) {
        board = b;
        tellBoards();
      }
      if (!locked(el)) moveStart(e);
    },
    true,
  );
  addEventListener(
    'dblclick',
    (e) => {
      if (fromUi(e) || inEditing(e)) return;
      e.preventDefault();
      const el = pick(e.target, true);
      if (!el) return;
      if (isGroup(el)) {
        // Into the group: what was double-clicked in it is picked.
        scope = el;
        const inner = pick(e.target);
        return select(inner ? [inner] : []);
      }
      const t = typeOf(el);
      if (t === 'text') return startText(el, { x: e.clientX, y: e.clientY });
      if (t === 'pic') return startCrop(el);
      if (t === 'curve') return send({ type: 'wa-ed-design', what: 'action', action: 'words' });
    },
    true,
  );
  for (const t of ['click', 'auxclick', 'submit', 'dragstart']) addEventListener(t, (e) => !fromUi(e) && !inEditing(e) && e.preventDefault(), true);
  addEventListener(
    'contextmenu',
    (e) => {
      if (fromUi(e) || inEditing(e)) return;
      e.preventDefault();
      const el = pick(e.target, true);
      if (el && !sel.includes(el)) select([el]);
      send({ type: 'wa-ed-design', what: 'menu', x: e.clientX, y: e.clientY });
    },
    true,
  );
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch' || dragging) return;
      const t = fromUi(e) ? null : pick(e.target);
      if (t !== hover) {
        hover = t;
        redraw();
      }
    },
    true,
  );
  document.addEventListener('mouseleave', () => {
    hover = null;
    redraw();
  });
  addEventListener('scroll', redraw, true);
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => (fitting ? fit() : (layout(), redraw())), 80);
  });
  // Pinching a trackpad, or Ctrl and the wheel: zoom where the pointer is.
  addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoom * Math.exp(-e.deltaY * 0.0022), { x: e.clientX, y: e.clientY });
    },
    { passive: false, capture: true },
  );
  // Words written: the box grows with them.
  addEventListener('input', () => editing && redraw(), true);
  document.addEventListener('selectionchange', () => editing && redraw());
  addEventListener(
    'focusout',
    (e) => {
      if (editing && e.target === editing) setTimeout(() => editing && document.activeElement !== editing && endText(), 0);
    },
    true,
  );
  // Files dropped: pictures where they fall (on a frame: in it), videos too.
  addEventListener(
    'dragover',
    (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const el = pick(e.target);
      for (const x of document.querySelectorAll('.n-dropping')) if (x !== el) x.classList.remove('n-dropping');
      if (el && typeOf(el) === 'pic') el.classList.add('n-dropping');
    },
    true,
  );
  addEventListener(
    'drop',
    (e) => {
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /^(image|video)\//.test(f.type));
      if (!files.length) return;
      e.preventDefault();
      const b = boardAt(e.clientX, e.clientY) ?? currentBoard();
      if (!b) return;
      const r = b.getBoundingClientRect();
      const at = { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
      const el = pick(e.target, true);
      files.slice(0, 8).forEach((f, i) => askFile(f, b, { x: at.x + i * 24, y: at.y + i * 24 }, i === 0 && el && typeOf(el) === 'pic' ? el : null));
    },
    true,
  );
  addEventListener(
    'paste',
    (e) => {
      if (inEditing(e)) {
        // Words come in as words.
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
        return;
      }
      const pics = [...(e.clipboardData?.files ?? [])].filter((f) => /^image\//.test(f.type));
      const b = currentBoard();
      if (pics.length && b) {
        e.preventDefault();
        const target = sel.length === 1 && typeOf(sel[0]) === 'pic' ? sel[0] : null;
        askFile(pics[0], b, visibleMiddle(b), target);
        return;
      }
      if (clip) {
        e.preventDefault();
        act('paste');
      }
    },
    true,
  );
  addEventListener(
    'keydown',
    (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key;
      if (fromUi(e) || e.isComposing || e.keyCode === 229) return;
      if (mod && k.toLowerCase() === 's') {
        e.preventDefault();
        endText();
        endCrop(true);
        return send({ type: 'wa-ed-save' });
      }
      if (editing) {
        if (k === 'Escape') {
          e.preventDefault();
          const el = editing;
          endText();
          return select([el]);
        }
        if (k === 'Enter' && !e.shiftKey) {
          // A new line in the same words (a browser would start a block in them).
          e.preventDefault();
          if (!document.execCommand('insertLineBreak')) document.execCommand('insertHTML', false, '<br>');
          return;
        }
        if (mod && (k.toLowerCase() === 'z' || k.toLowerCase() === 'y')) {
          // The browser's own undo, inside the words.
          return;
        }
        return;
      }
      if (cropping) {
        if (k === 'Enter' || k === 'Escape') {
          e.preventDefault();
          return endCrop(true);
        }
      }
      if (mod && k.toLowerCase() === 'z') {
        e.preventDefault();
        return act(e.shiftKey ? 'redo' : 'undo');
      }
      if (mod && k.toLowerCase() === 'y') {
        e.preventDefault();
        return act('redo');
      }
      if (mod && (k === '=' || k === '+')) {
        e.preventDefault();
        return act('zoom', 'in');
      }
      if (mod && k === '-') {
        e.preventDefault();
        return act('zoom', 'out');
      }
      if (mod && k === '0') {
        e.preventDefault();
        return act('zoom', 'fit');
      }
      if (mod && k.toLowerCase() === 'a') {
        e.preventDefault();
        return act('selectAll');
      }
      if (mod && k.toLowerCase() === 'v') return; // the paste event comes
      if (!sel.length) return;
      if (mod && e.altKey && (k.toLowerCase() === 'c' || e.code === 'KeyC')) {
        e.preventDefault();
        return act('copyStyle');
      }
      if (mod && e.altKey && (k.toLowerCase() === 'v' || e.code === 'KeyV')) {
        e.preventDefault();
        return act('pasteStyle');
      }
      if (mod && k.toLowerCase() === 'c') {
        e.preventDefault();
        return act('copy');
      }
      if (mod && k.toLowerCase() === 'x') {
        e.preventDefault();
        return act('cut');
      }
      if (mod && k.toLowerCase() === 'd') {
        e.preventDefault();
        return act('dup');
      }
      if (mod && k.toLowerCase() === 'g') {
        e.preventDefault();
        return act(e.shiftKey ? 'ungroup' : 'group');
      }
      if (mod && (k === ']' || k === '[' || e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault();
        const fwd = k === ']' || e.code === 'BracketRight';
        return act('order', e.shiftKey || e.altKey ? (fwd ? 'front' : 'back') : fwd ? 'forward' : 'backward');
      }
      if (e.altKey && e.shiftKey && k.toLowerCase() === 'l') {
        e.preventDefault();
        return act('lock');
      }
      if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault();
        return act('del');
      }
      if (k === 'Escape') {
        e.preventDefault();
        if (scope) {
          const g = scope;
          scope = null;
          return select([g]);
        }
        return select([]);
      }
      if (k === 'Enter' && sel.length === 1) {
        e.preventDefault();
        if (isGroup(sel[0])) {
          scope = sel[0];
          const first = sel[0].firstElementChild as HTMLElement | null;
          return select(first ? [first] : []);
        }
        if (writable(sel[0])) return startText(sel[0]);
        if (typeOf(sel[0]) === 'pic') return startCrop(sel[0]);
        return;
      }
      if (k.startsWith('Arrow')) {
        const list = sel.filter((x) => !locked(x));
        if (!list.length) return;
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0;
        const dy = k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0;
        remember(`nudge:${list.map(pathOf).join('|')}`);
        settle(list[0].parentElement as HTMLElement);
        for (const el of list) {
          const g = boxOf(el);
          setBox(el, { x: g.x + dx, y: g.y + dy });
        }
        return changed();
      }
    },
    true,
  );

  // ---- the HTML to give back ------------------------------------------------------------------------------------------
  const serialize = (): string => {
    const copy = root.cloneNode(true) as HTMLElement;
    for (const el of copy.querySelectorAll('[data-n-own]')) el.remove();
    copy.classList.remove('n-editing');
    if (!copy.classList.length) copy.removeAttribute('class');
    copy.removeAttribute('data-n-theme');
    for (const el of [copy, ...copy.querySelectorAll('*')]) {
      for (const a of [...el.attributes]) {
        if (a.name.startsWith('data-n-x-')) {
          el.removeAttribute(a.name);
          el.setAttribute(a.name.slice(9), a.value);
        }
      }
      if (el.tagName === 'SCRIPT' && el.hasAttribute('data-n-type')) {
        const t = el.getAttribute('data-n-type');
        el.removeAttribute('data-n-type');
        if (t) el.setAttribute('type', t);
        else el.removeAttribute('type');
      }
      if (el.hasAttribute('data-n-ce')) {
        el.removeAttribute('data-n-ce');
        el.removeAttribute('contenteditable');
      }
      el.classList?.remove('n-cropping', 'n-dropping');
      if (el.getAttribute('class') === '') el.removeAttribute('class');
    }
    // Every design carries its stylesheet and its fitting script.
    const head = copy.querySelector('head');
    if (head && !head.querySelector('#n-design-base')) {
      const s = document.createElement('style');
      s.id = 'n-design-base';
      s.textContent = `\n${BASE}\n`;
      head.append(s);
    }
    if (head && !head.querySelector('#n-design-fit')) {
      const s = document.createElement('script');
      s.id = 'n-design-fit';
      s.textContent = FIT;
      head.append(s);
    }
    const body = copy.querySelector('body');
    if (body && !body.classList.contains('n-design-page')) body.classList.add('n-design-page');
    return `${cfg.doctype ? `${cfg.doctype}\n` : ''}${copy.outerHTML}`;
  };

  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== P || !d || d.n !== cfg.n || d.type !== 'wa-ed') return;
    if (d.cmd === 'html') return send({ type: 'wa-ed-html', id: d.id, html: serialize() });
    if (d.cmd === 'saved') {
      dirty = false;
      return state();
    }
    try {
      act(String(d.cmd), d.arg);
    } catch (err) {
      console.warn(err);
    }
  });

  const ready = () => {
    gather();
    writeOwn();
    document.head.appendChild(own);
    root.appendChild(host);
    board = boards()[0] ?? null;
    fit();
    setTimeout(() => fitting && fit(), 250);
    document.fonts?.ready.then(() => (fitting ? fit() : redraw()));
    for (const img of document.querySelectorAll('img')) if (!img.complete) img.addEventListener('load', redraw, { once: true });
    state();
    tell();
    tellBoards();
    const u = used();
    send({ type: 'wa-ed-ready', colors: u.colours.slice(0, 12), bg: canvas });
    send({ type: 'wa-ed-design', what: 'used', colours: u.colours, fonts: u.fonts });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}

/** Puts `function`s' sources in a <script> safely (kit.ts's rules). */
const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** The design editor, with the stylesheet and script a design carries and the shared geometry it needs, as one script. */
export const DESIGN_EDITOR_SRC = scriptSafe(`(cfg) => (${designEditor.toString()})(cfg, ${JSON.stringify(DESIGN_CSS)}, ${JSON.stringify(DESIGN_FIT_SRC)}, ${curveGeom.toString()}, ${fitBox.toString()})`);
