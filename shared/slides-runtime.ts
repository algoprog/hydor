// What draws a deck's slides and plays them, the same wherever a deck shows: in the app (the editor, its
// thumbnails, the slideshow and the presenter's view) and in the deck's own page (in a frame in the conversation,
// at its address on a phone, published at a link, saved as a file, printed as a PDF). It is one function that uses
// only its arguments and the browser's own globals: the server writes its source into each deck's page
// (Function#toString), and the app calls it. Nothing from a deck becomes markup: words go in as text, colours,
// fonts and addresses are checked again here, and pictures come only from data:, https: or the app.
//
// A slide is drawn at its full size (1280 pixels wide) and scaled by whoever shows it. Animations run with the
// Web Animations API on the parts (or their paragraphs); a slide's build is its click groups, each started by a
// click (the first may start by itself), the effects within one timed "with" or "after" the one before. Morph moves
// the parts two slides share from where they were to where they are. Equations are drawn by KaTeX where it is (the
// app gives its own; a deck's page has each drawn by the server's), else shown as their LaTeX. While presenting, a laser pointer, a pen
// and live captions (the browser's speech recognition, where it has one) are on the keys L, P and C.
import type { Anim, Deck, El, IconNode, Para, Run, Slide, TextProps, Theme } from './slides.ts';

/** What the runtime needs of KaTeX (the app's own, or the one a deck's page loads). */
export interface KatexLike {
  render(tex: string, el: HTMLElement, opts: Record<string, unknown>): void;
}

/** What the presenter's tools show over a slide: the laser's place, the pen's lines (in the slide's pixels), the captions. */
export interface Marks {
  laser: [number, number] | null;
  ink: { c: string; p: number[] }[];
  caption: string;
}

export interface DrawOpts {
  /** The editor: empty boxes show their hint and empty pictures a frame; nothing is hidden for animations. */
  edit?: boolean;
  /** Where a picture the app keeps is ("naget-asset:<sha>" → its address). */
  asset?: (sha: string) => string;
  /** Where a picture on the web is fetched from (the app's own pages may not load the web's). */
  web?: (url: string) => string;
  /** Where a video the app keeps is ("naget-video:<sha>" → its address). */
  video?: (sha: string) => string;
  /** The editor's hints in the user's language ("Click to add a title"). */
  hint?: (s: string) => string;
  /** The slide as its build leaves it after `step` clicks (Infinity: all of it, as printed). */
  step?: number;
  /** KaTeX, to draw equations (else the page's own, if it loaded one). */
  katex?: KatexLike;
  /** The language dates are written in (the footer's "today"). */
  locale?: string;
  /** Videos play when clicked (the slideshow). */
  play?: boolean;
}

export interface ShowOpts extends Omit<DrawOpts, 'edit' | 'step' | 'play'> {
  /** viewer: inside a page, its controls under the slide; full: the whole window, controls on hover. */
  mode: 'viewer' | 'full';
  at?: number;
  step?: number;
  /** Keys move it (on `keys`, else the window). */
  keys?: boolean;
  /** Told of each move: the slide (its index in the deck) and the step. */
  onMove?: (i: number, step: number) => void;
  /** Escape or the close button, in full mode. */
  onExit?: () => void;
  /** The slides shown include hidden ones (the editor's preview of one). */
  withHidden?: boolean;
  /** Words for the controls, in the user's language. */
  words?: Partial<Record<'prev' | 'next' | 'grid' | 'full' | 'exit' | 'end' | 'laser' | 'pen' | 'erase' | 'captions' | 'noCaptions' | 'listening', string>>;
  /** Told of the laser, the pen's lines and the captions as they change (the presenter's view shows them to the audience). */
  onMarks?: (m: Marks) => void;
}

export interface Show {
  go(i: number, step?: number): void;
  next(): void;
  prev(): void;
  at(): { i: number; step: number; steps: number };
  /** A black or white screen, or neither. */
  blank(c: 'black' | 'white' | null): void;
  grid(on?: boolean): void;
  /** Shows another slideshow's laser, pen lines and captions (the presenter's, in the audience's window). */
  marks(m: Marks): void;
  destroy(): void;
}

export interface SlidesRuntime {
  /** The stylesheet drawn slides need, once in a document. */
  css: string;
  /** Puts the stylesheet in the document, once. */
  style(doc?: Document): void;
  /** A slide at full size: an element to place and scale. */
  slide(deck: Deck, i: number, o?: DrawOpts): HTMLElement;
  /** One part of a slide, drawn on its own (the editor puts it in place of the old one). */
  part(deck: Deck, s: Slide, el: El, o?: DrawOpts): HTMLElement;
  /** Draws a text part's words into `box` (its .ns-txt), as `slide` does. */
  words(box: HTMLElement, deck: Deck, el: TextProps): void;
  /** Makes words that overflow their box smaller, where a part asks for it (once the slide is in the document). */
  fit(root: HTMLElement): void;
  /** A text part's words, read back from its .ns-txt after it was edited in place. */
  read(box: HTMLElement, el: TextProps): Para[];
  /** The slideshow, in `host`. */
  show(host: HTMLElement, deck: Deck, o: ShowOpts): Show;
  /** Every slide shown in the slideshow, as its build ends, one per printed page. */
  print(host: HTMLElement, deck: Deck, o?: DrawOpts): void;
  /** How many clicks a slide's build takes. */
  steps(s: Slide): number;
  /** The parts of slide `b` that Morph glides from slide `a`: [a's part, b's part]. */
  morphPairs(a: Slide, b: Slide): [El, El][];
  /** A deck's page: draws the deck from its JSON in #n-deck, as a viewer, every slide to print, or its first slide still (its picture). */
  boot(cfg: { mode: 'viewer' | 'print' | 'still' }): void;
  /** The equations the server drew into the page (#n-math: each formula's KaTeX, by its LaTeX), as what draws them; none without. */
  maths(): KatexLike | undefined;
}

/** Names of fonts with their CSS families, which the runtime is given (it cannot import). */
export type FontTable = Record<string, { css: string; google?: boolean }>;

export function slidesRuntime(win: Window, fonts: FontTable): SlidesRuntime {
  const doc = win.document;
  const W = 1280;
  const NS = 'http://www.w3.org/2000/svg';
  const H = (d: Deck) => (d.ratio === '4:3' ? 960 : 720);

  // ---- checking values again --------------------------------------------------------------------------------
  const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const FUNC = /^(rgb|hsl)a?\([\d.%\s,/+-]{3,60}\)$/i;
  const NAMES = new Set(['black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey', 'navy', 'teal', 'gold', 'silver', 'brown', 'crimson', 'coral', 'indigo', 'violet', 'maroon', 'olive', 'lime', 'cyan', 'magenta', 'transparent']);
  const color = (c: unknown, t: Theme, def = 'transparent'): string => {
    if (typeof c !== 'string' || !c) return def;
    if (c === 'bg' || c === 'fg' || c === 'head' || c === 'muted' || c === 'accent' || c === 'accentFg' || c === 'soft') return color(t[c], t, def);
    const m = /^c([1-6])$/.exec(c);
    if (m) return color(t.colors?.[Number(m[1]) - 1] ?? t.accent, t, def);
    return HEX.test(c) || FUNC.test(c) || NAMES.has(c.toLowerCase()) ? c : def;
  };
  const font = (f: string | undefined, t: Theme, role?: TextProps['role']): string => {
    const name = !f ? (role === 'title' || role === 'quote' || role === 'big' ? t.headFont : t.font) : f === 'body' ? t.font : f === 'head' ? t.headFont : f;
    const k = fonts[name];
    if (k) return k.css;
    return /^[A-Za-z0-9][A-Za-z0-9 \-]{0,39}$/.test(name) ? `"${name}", system-ui, sans-serif` : 'system-ui, sans-serif';
  };
  const src = (s: unknown, o: DrawOpts): string => {
    if (typeof s !== 'string') return '';
    const a = /^naget-asset:([a-f0-9]{16,64})$/.exec(s);
    if (a) return o.asset ? o.asset(a[1]) : '';
    if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    if (/^https?:\/\/[^\s<>"'()\\]+$/i.test(s)) return o.web ? o.web(s) : s;
    if (/^\/api\/pages\/assets\/[a-f0-9]{16,64}$/.test(s)) return s;
    return '';
  };
  const href = (s: unknown): string => (typeof s === 'string' && /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:[+\d][\d\s().-]*)$/i.test(s) ? s : '');
  const n = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  const px = (v: number) => `${Math.round(v * 100) / 100}px`;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    return e;
  };
  const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
    const e = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };

  // ---- the stylesheet ---------------------------------------------------------------------------------------
  const BULLETS = ['•', '◦', '▪', '•', '◦'];
  const NUMS = ['decimal', 'lower-alpha', 'lower-roman', 'decimal', 'lower-alpha'];
  let lists = '';
  for (let l = 0; l < 5; l++) {
    const deeper = (from: number) => [0, 1, 2, 3, 4].filter((x) => x >= from).map((x) => `ns${x}`).join(' ');
    lists += `.ns-p[data-list=bullet][data-lvl="${l}"]{counter-reset:${deeper(l)}}.ns-p[data-list=bullet][data-lvl="${l}"]::before{content:"${BULLETS[l]}"}`;
    lists += `.ns-p[data-list=number][data-lvl="${l}"]{counter-increment:ns${l};${l < 4 ? `counter-reset:${deeper(l + 1)}` : ''}}.ns-p[data-list=number][data-lvl="${l}"]::before{content:counter(ns${l},${NUMS[l]}) "."}`;
  }
  const css = [
    '.ns-slide{position:relative;overflow:hidden;box-sizing:border-box;font-kerning:normal;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;line-height:1.2;letter-spacing:normal;text-transform:none;text-align:left;white-space:normal;contain:layout paint}',
    '.ns-slide *,.ns-slide *::before,.ns-slide *::after{box-sizing:border-box}',
    '.ns-bgimg,.ns-dim{position:absolute;inset:0;background-size:cover;background-position:center;pointer-events:none}',
    '.ns-dim{background:#000}',
    '.ns-el{position:absolute;transform-origin:center}',
    // A group is its parts: the space between them is not it.
    '.ns-el[data-type=group]{pointer-events:none}.ns-el[data-type=group]>.ns-el:not([data-type=group]){pointer-events:auto}',
    '.ns-fill,.ns-shape{position:absolute;inset:0;pointer-events:none}',
    '.ns-shape{overflow:visible;width:100%;height:100%}',
    '.ns-txt{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;overflow-wrap:break-word;word-break:normal;counter-reset:ns0 ns1 ns2 ns3 ns4;outline:none}',
    '.ns-txt[data-valign=middle]{justify-content:center}.ns-txt[data-valign=bottom]{justify-content:flex-end}',
    '.ns-txt[contenteditable]{overflow:visible;cursor:text;user-select:text;-webkit-user-select:text}',
    '.ns-p{margin:0;padding:0;white-space:pre-wrap;min-height:1lh;position:relative}',
    '.ns-p:not([data-list]){counter-reset:ns0 ns1 ns2 ns3 ns4}',
    '.ns-p[data-list]{padding-left:calc(var(--lvl,0) * 1.5em + 1.25em)}',
    '.ns-p:not([data-list]){padding-left:calc(var(--lvl,0) * 1.5em)}',
    '.ns-p[data-list]::before{position:absolute;left:calc(var(--lvl,0) * 1.5em);width:1.25em;text-align:left;font-weight:400;font-style:normal}',
    lists,
    '.ns-p a{color:inherit;text-decoration:underline}',
    '.ns-ph .ns-p:first-child::after{content:attr(data-ph);opacity:.42;pointer-events:none;position:absolute;left:0;right:0;top:0;white-space:pre-wrap}',
    '.ns-ph .ns-p:first-child[data-list]::after{left:calc(var(--lvl,0) * 1.5em + 1.25em)}',
    '.ns-img{position:absolute;inset:0;width:100%;height:100%;display:block;max-width:none;-webkit-user-drag:none;user-select:none}',
    '.ns-noimg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border:2px dashed rgba(127,127,127,.55);background:rgba(127,127,127,.08);color:rgba(127,127,127,.95);font:500 22px/1.3 system-ui,sans-serif;text-align:center;padding:12px}',
    '.ns-table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}',
    '.ns-table td{padding:.35em .6em;vertical-align:middle;white-space:pre-wrap;overflow-wrap:break-word;border-style:solid;border-width:1px}',
    '.ns-chart{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
    '.ns-imgbox,.ns-flip{position:absolute;inset:0;overflow:hidden}',
    '.ns-flip{overflow:visible}',
    '.ns-icon{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
    '.ns-math{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:visible}',
    '.ns-math[data-align=left]{justify-content:flex-start}.ns-math[data-align=right]{justify-content:flex-end}',
    '.ns-mi{display:inline-block;font-size:40px;line-height:1.2;white-space:nowrap;transform-origin:center;flex:none}',
    '.ns-math[data-align=left] .ns-mi{transform-origin:left center}.ns-math[data-align=right] .ns-mi{transform-origin:right center}',
    '.ns-mi .katex-display{margin:0}',
    '.ns-tex{font:400 28px/1.3 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;opacity:.8}',
    '.ns-video{position:absolute;inset:0;overflow:hidden;background:#000 center/cover no-repeat;display:flex;align-items:center;justify-content:center}',
    '.ns-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}',
    '.ns-video video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;outline:none}',
    '.ns-play{width:96px;height:96px;border-radius:50%;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,.35);pointer-events:none}',
    '.ns-play svg{width:44px;height:44px;margin-left:6px;fill:#fff}',
    '.ns-from{position:absolute;left:14px;bottom:10px;font:600 18px/1 system-ui,sans-serif;color:#fff;opacity:.85;text-shadow:0 1px 3px rgba(0,0,0,.6);pointer-events:none}',
    '.ns-canplay .ns-video{cursor:pointer}',
    '.ns-foot{position:absolute;bottom:0;height:56px;display:flex;align-items:center;font-size:17px;line-height:1.2;white-space:nowrap;overflow:hidden;pointer-events:none}',
    '.ns-hidden{visibility:hidden!important}',
    // The slideshow.
    '.ns-show{position:relative;display:flex;flex-direction:column;width:100%;height:100%;background:#000;color:#fff;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none;-webkit-user-select:none;outline:none;overflow:hidden}',
    '.ns-show.ns-viewer{background:transparent;color:var(--n-fg,#333);height:auto}',
    '.ns-stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:pan-y pinch-zoom}',
    '.ns-viewer .ns-stage{flex:none;border-radius:var(--n-radius,10px);background:#000;box-shadow:0 0 0 1px var(--n-line,rgba(0,0,0,.12))}',
    '.ns-frame{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden}',
    '.ns-layer{position:absolute;inset:0}',
    '.ns-bar{display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 8px;flex:none}',
    '.ns-full .ns-bar{position:absolute;left:12px;bottom:12px;padding:4px;border-radius:999px;background:rgba(20,20,20,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;transition:opacity .25s}',
    '.ns-full.ns-awake .ns-bar,.ns-full .ns-bar:hover{opacity:1}',
    '.ns-full:not(.ns-awake) .ns-stage{cursor:none}',
    '.ns-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;padding:0}',
    '.ns-btn:hover{background:rgba(127,127,127,.18)}.ns-btn:disabled{opacity:.35;cursor:default;background:transparent}',
    '.ns-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.ns-count{min-width:64px;text-align:center;font-variant-numeric:tabular-nums;font-size:13px;opacity:.85}',
    '.ns-gap{flex:1}',
    '.ns-blank{position:absolute;inset:0;z-index:5;display:none}',
    '.ns-grid{position:absolute;inset:0;z-index:4;display:none;overflow:auto;padding:16px;background:inherit;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;align-content:start}',
    '.ns-viewer .ns-grid{position:relative;inset:auto;max-height:70vh;padding:4px 0 8px;background:transparent}',
    '.ns-gridon .ns-grid{display:grid}.ns-viewer.ns-gridon .ns-stage{display:none}',
    '.ns-thumb{position:relative;overflow:hidden;border-radius:8px;cursor:pointer;box-shadow:0 0 0 1px rgba(127,127,127,.35);background:#000}',
    '.ns-thumb.ns-cur{box-shadow:0 0 0 3px var(--n-accent,#2f6fec)}',
    // The thumbnail's own number, not the spans of the slide drawn in it (its words, its equations).
    '.ns-thumb>span{position:absolute;left:6px;bottom:4px;font-size:12px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8)}',
    '.ns-end{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;color:rgba(255,255,255,.75);font-size:15px;z-index:3}',
    // The presenter's tools: the laser, the pen's lines, the captions, and their buttons.
    '.ns-ink{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}',
    '.ns-laser{position:absolute;z-index:6;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:radial-gradient(circle,#fff 0 18%,#ff2a2a 30%,rgba(255,30,30,.55) 58%,rgba(255,0,0,0) 72%);box-shadow:0 0 14px 4px rgba(255,40,40,.55);pointer-events:none;display:none}',
    '.ns-lasering .ns-stage,.ns-lasering .ns-stage *{cursor:none!important}',
    '.ns-pening .ns-stage,.ns-pening .ns-stage *{cursor:crosshair!important}',
    '.ns-cap{position:absolute;left:50%;bottom:7%;z-index:6;transform:translateX(-50%);max-width:min(86%,1100px);padding:.35em .7em;border-radius:10px;background:rgba(0,0,0,.78);color:#fff;font:500 clamp(16px,2.6vw,34px)/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;pointer-events:none;display:none}',
    '.ns-cap:empty{display:none!important}',
    '.ns-tool{display:none}.ns-full .ns-tool{display:inline-flex}',
    '.ns-btn.ns-on{background:rgba(255,255,255,.2)}',
    '.ns-pens{display:none;align-items:center;gap:4px;padding:0 4px}.ns-full.ns-pening .ns-pens{display:flex}',
    '.ns-pen{width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,.65);cursor:pointer;padding:0}',
    '.ns-pen.ns-on{box-shadow:0 0 0 2px #fff}',
    // Printing: a page per slide.
    '.ns-print{display:none}',
    // A page made only to be printed (a PDF, the slides' pictures) shows its slides on the screen too.
    '.ns-print.ns-onscreen{display:block}',
    '@media print{.ns-printing>*:not(.ns-print){display:none!important}.ns-print{display:block!important}.ns-pg{break-after:page;page-break-after:always;overflow:hidden;position:relative}.ns-pg:last-child{break-after:auto;page-break-after:auto}}',
    '@media (prefers-reduced-motion:reduce){.ns-full .ns-bar{transition:none}}',
  ].join('\n');

  const style = (d: Document = doc) => {
    if (d.getElementById('ns-style')) return;
    const s = d.createElement('style');
    s.id = 'ns-style';
    s.textContent = css;
    d.head.appendChild(s);
  };

  // ---- shapes -----------------------------------------------------------------------------------------------
  const poly = (pts: number[][]) => `M${pts.map((p) => `${p[0]},${p[1]}`).join('L')}Z`;
  const shapePath = (kind: string, w: number, h: number): string => {
    const ss = Math.min(w, h);
    switch (kind) {
      case 'triangle':
        return poly([[w / 2, 0], [w, h], [0, h]]);
      case 'rtriangle':
        return poly([[0, 0], [w, h], [0, h]]);
      case 'diamond':
        return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
      case 'pentagon':
        return poly([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]);
      case 'hexagon': {
        const a = ss * 0.25;
        return poly([[0, h / 2], [a, 0], [w - a, 0], [w, h / 2], [w - a, h], [a, h]]);
      }
      case 'octagon': {
        const c = ss * 0.29;
        return poly([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]);
      }
      case 'star': {
        const pts: number[][] = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 0.382 : 1;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          pts.push([w / 2 + (w / 2) * r * Math.cos(a), h * 0.525 + (h * 0.525) * r * Math.sin(a)]);
        }
        return poly(pts);
      }
      case 'arrow': {
        const hl = Math.min(w, ss * 0.5);
        return poly([[0, h * 0.25], [w - hl, h * 0.25], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h * 0.75], [0, h * 0.75]]);
      }
      case 'larrow': {
        const hl = Math.min(w, ss * 0.5);
        return poly([[w, h * 0.25], [hl, h * 0.25], [hl, 0], [0, h / 2], [hl, h], [hl, h * 0.75], [w, h * 0.75]]);
      }
      case 'uarrow': {
        const hl = Math.min(h, ss * 0.5);
        return poly([[w * 0.25, h], [w * 0.25, hl], [0, hl], [w / 2, 0], [w, hl], [w * 0.75, hl], [w * 0.75, h]]);
      }
      case 'darrow': {
        const hl = Math.min(h, ss * 0.5);
        return poly([[w * 0.25, 0], [w * 0.75, 0], [w * 0.75, h - hl], [w, h - hl], [w / 2, h], [0, h - hl], [w * 0.25, h - hl]]);
      }
      case 'chevron': {
        const d = Math.min(w / 2, ss * 0.5);
        return poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]]);
      }
      case 'parallelogram': {
        const o = ss * 0.25;
        return poly([[o, 0], [w, 0], [w - o, h], [0, h]]);
      }
      case 'trapezoid': {
        const o = ss * 0.25;
        return poly([[0, h], [o, 0], [w - o, 0], [w, h]]);
      }
      case 'plus': {
        const c = ss * 0.25;
        return poly([[c, 0], [w - c, 0], [w - c, c], [w, c], [w, h - c], [w - c, h - c], [w - c, h], [c, h], [c, h - c], [0, h - c], [0, c], [c, c]]);
      }
      case 'heart':
        return `M${w / 2},${h * 0.25}C${w * 0.45},${h * 0.05} ${w * 0.05},${h * 0.02} ${w * 0.02},${h * 0.32}C0,${h * 0.55} ${w * 0.3},${h * 0.72} ${w / 2},${h}C${w * 0.7},${h * 0.72} ${w},${h * 0.55} ${w * 0.98},${h * 0.32}C${w * 0.95},${h * 0.02} ${w * 0.55},${h * 0.05} ${w / 2},${h * 0.25}Z`;
      case 'callout': {
        const r = ss * 0.1;
        const b = h * 0.82;
        return `M${r},0H${w - r}Q${w},0 ${w},${r}V${b - r}Q${w},${b} ${w - r},${b}H${w * 0.33}L${w * 0.2},${h}L${w * 0.17},${b}H${r}Q0,${b} 0,${b - r}V${r}Q0,0 ${r},0Z`;
      }
    }
    return '';
  };

  // ---- text ---------------------------------------------------------------------------------------------------
  const sizeCss = (v: number) => `calc(${px(v)} * var(--fs, 1))`;
  const runEl = (r: Run, t: Theme, defFont: string | undefined, role: TextProps['role']) => {
    const s = el('span');
    s.textContent = typeof r.t === 'string' ? r.t : '';
    if (r.b === true) s.style.fontWeight = '700';
    else if (r.b === false) s.style.fontWeight = '400';
    if (r.i === true) s.style.fontStyle = 'italic';
    else if (r.i === false) s.style.fontStyle = 'normal';
    const deco = [r.u ? 'underline' : '', r.s ? 'line-through' : ''].filter(Boolean).join(' ');
    if (deco) s.style.textDecorationLine = deco;
    if (r.color) {
      s.style.color = color(r.color, t, '');
      s.dataset.c = r.color;
    }
    if (r.hl) {
      s.style.backgroundColor = color(r.hl, t, '');
      s.dataset.hl = r.hl;
    }
    if (r.size) s.style.fontSize = sizeCss(n(r.size, 24));
    if (r.font && r.font !== defFont) {
      s.style.fontFamily = font(r.font, t, role);
      s.dataset.f = r.font;
    }
    if (r.sup || r.sub) {
      s.style.verticalAlign = r.sup ? 'super' : 'sub';
      s.style.fontSize = r.size ? `calc(${px(n(r.size, 24) * 0.65)} * var(--fs, 1))` : '0.65em';
      s.dataset.v = r.sup ? 'sup' : 'sub';
    }
    const link = r.link ? (/^#\d{1,3}$/.test(r.link) ? r.link : href(r.link)) : '';
    if (link) {
      const a = el('a');
      a.href = link;
      if (!link.startsWith('#')) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.appendChild(s);
      return a;
    }
    return s;
  };

  let hintOf = (s: string) => s;
  const words = (box: HTMLElement, deck: Deck, e: TextProps) => {
    const t = deck.theme;
    box.textContent = '';
    const paras = Array.isArray(e.paras) && e.paras.length ? e.paras : [{ runs: [{ t: '' }] }];
    const gap = n(e.gap, 0);
    paras.forEach((p, i) => {
      const d = el('div', 'ns-p');
      if (p.list === 'bullet' || p.list === 'number') d.dataset.list = p.list;
      const lvl = Math.max(0, Math.min(4, Math.round(n(p.lvl, 0))));
      d.dataset.lvl = String(lvl);
      if (lvl) d.style.setProperty('--lvl', String(lvl));
      if (p.align) {
        d.style.textAlign = p.align;
        d.dataset.align = p.align;
      }
      const first = p.runs?.find((r) => r.t)?.size ?? p.runs?.[0]?.size;
      if (first) d.style.fontSize = sizeCss(first);
      if (gap && i < paras.length - 1) d.style.marginBottom = sizeCss(gap);
      if (e.ph && i === 0) d.dataset.ph = hintOf(e.ph);
      let any = false;
      for (const r of p.runs ?? []) {
        if (!r || typeof r.t !== 'string' || !r.t) continue;
        d.appendChild(runEl(r, t, e.font, e.role));
        any = true;
      }
      // An empty paragraph keeps its line (and a place for the caret).
      if (!any) d.appendChild(el('br'));
      box.appendChild(d);
    });
  };

  const textBox = (deck: Deck, e: TextProps, o: DrawOpts) => {
    const t = deck.theme;
    const box = el('div', 'ns-txt');
    box.style.padding = px(n(e.pad, 10));
    box.style.fontFamily = font(e.font, t, e.role);
    box.style.fontSize = sizeCss(n(e.size, 24));
    box.style.color = color(e.color, t, color(e.role === 'title' || e.role === 'quote' ? 'head' : e.role === 'subtitle' || e.role === 'caption' ? 'muted' : 'fg', t, '#000'));
    box.style.lineHeight = String(n(e.lh, e.role === 'title' ? 1.1 : 1.2));
    if (e.ls) box.style.letterSpacing = `${n(e.ls, 0)}em`;
    if (e.bold) box.style.fontWeight = '700';
    if (e.italic) box.style.fontStyle = 'italic';
    box.style.textAlign = e.align ?? 'left';
    box.dataset.valign = e.valign ?? 'top';
    if (e.fit === 'shrink') box.dataset.fit = '1';
    words(box, deck, e);
    const empty = !(e.paras ?? []).some((p) => (p.runs ?? []).some((r) => r.t));
    return { box, empty };
  };

  // ---- pictures, tables, charts, lines ------------------------------------------------------------------------
  const nice = (max: number) => {
    if (max <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const f = max / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  };
  const short = (v: number) => {
    const a = Math.abs(v);
    const r = (x: number) => String(Math.round(x * 10) / 10);
    return a >= 1e9 ? `${r(v / 1e9)}B` : a >= 1e6 ? `${r(v / 1e6)}M` : a >= 1e4 ? `${r(v / 1e3)}k` : String(Math.round(v * 100) / 100);
  };

  const chart = (deck: Deck, c: Extract<El, { type: 'chart' }>) => {
    const t = deck.theme;
    const w = Math.max(10, Math.abs(c.w));
    const h = Math.max(10, Math.abs(c.h));
    const fs = n(c.size, 18);
    const ink = color(c.color, t, color('muted', t, '#666'));
    const fam = font(c.font, t);
    const root = svg('svg', { class: 'ns-chart', viewBox: `0 0 ${w} ${h}`, 'font-size': fs, 'font-family': fam, fill: ink });
    const series = (c.series ?? []).filter((s) => Array.isArray(s.values));
    const labels = c.labels ?? [];
    const col = (i: number, s?: { color?: string }) => color(s?.color, t, '') || color(t.colors?.[i % 6], t, '#888');
    const label = (x: number, y: number, text: string, anchor = 'middle', extra: Record<string, string | number> = {}) => {
      const e = svg('text', { x, y, 'text-anchor': anchor, 'dominant-baseline': 'middle', ...extra });
      e.textContent = text;
      root.appendChild(e);
      return e;
    };
    let top = 4;
    let bottom = h - 4;
    if (c.title) {
      label(w / 2, fs * 0.8, c.title, 'middle', { 'font-size': fs * 1.2, 'font-weight': 600, fill: color('head', t, '#222') });
      top += fs * 1.8;
    }
    const pie = c.kind === 'pie' || c.kind === 'doughnut';
    const legendItems = pie ? labels.map((l, i) => ({ name: l, color: col(i) })) : series.map((s, i) => ({ name: s.name, color: col(i, s) }));
    if (c.legend && legendItems.length && (pie || series.length > 1 || series[0]?.name)) {
      // A row of swatches under the chart, centred, wrapping as needed.
      const rows: { name: string; color: string; w: number }[][] = [[]];
      let rowW = 0;
      for (const it of legendItems) {
        const iw = fs * 1.4 + it.name.length * fs * 0.56 + fs;
        if (rowW + iw > w && rows[rows.length - 1].length) {
          rows.push([]);
          rowW = 0;
        }
        rows[rows.length - 1].push({ ...it, w: iw });
        rowW += iw;
      }
      const lh = fs * 1.5;
      bottom -= rows.length * lh;
      rows.forEach((r, ri) => {
        let x = (w - r.reduce((a, b) => a + b.w, 0)) / 2;
        const y = bottom + ri * lh + lh / 2 + 2;
        for (const it of r) {
          root.appendChild(svg('rect', { x, y: y - fs * 0.4, width: fs * 0.8, height: fs * 0.8, rx: fs * 0.15, fill: it.color }));
          label(x + fs * 1.1, y, it.name, 'start');
          x += it.w;
        }
      });
      bottom -= fs * 0.4;
    }
    if (pie) {
      const vals = (series[0]?.values ?? []).map((v) => Math.max(0, n(v, 0)));
      const sum = vals.reduce((a, b) => a + b, 0) || 1;
      const r = Math.max(4, Math.min(w, bottom - top) / 2 - 4);
      const cx = w / 2;
      const cy = top + (bottom - top) / 2;
      const hole = c.kind === 'doughnut' ? r * 0.55 : 0;
      let a0 = -Math.PI / 2;
      vals.forEach((v, i) => {
        const a1 = a0 + (v / sum) * Math.PI * 2;
        const big = a1 - a0 > Math.PI ? 1 : 0;
        const p = (a: number, rr: number) => `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
        const d =
          v >= sum - 1e-9
            ? `M${cx - r},${cy}A${r},${r} 0 1 1 ${cx + r},${cy}A${r},${r} 0 1 1 ${cx - r},${cy}${hole ? `M${cx - hole},${cy}A${hole},${hole} 0 1 0 ${cx + hole},${cy}A${hole},${hole} 0 1 0 ${cx - hole},${cy}` : ''}Z`
            : hole
              ? `M${p(a0, r)}A${r},${r} 0 ${big} 1 ${p(a1, r)}L${p(a1, hole)}A${hole},${hole} 0 ${big} 0 ${p(a0, hole)}Z`
              : `M${cx},${cy}L${p(a0, r)}A${r},${r} 0 ${big} 1 ${p(a1, r)}Z`;
        root.appendChild(svg('path', { d, fill: col(i), stroke: color('bg', t, '#fff'), 'stroke-width': 2, 'fill-rule': 'evenodd' }));
        if (c.values && v > 0) {
          const mid = (a0 + a1) / 2;
          const rr = hole ? (r + hole) / 2 : r * 0.62;
          label(cx + rr * Math.cos(mid), cy + rr * Math.sin(mid), `${Math.round((v / sum) * 100)}%`, 'middle', { fill: '#fff', 'font-weight': 600 });
        }
        a0 = a1;
      });
      return root;
    }
    const stacked = !!c.stacked;
    const count = labels.length;
    let max = 0;
    let min = 0;
    for (let i = 0; i < count; i++) {
      if (stacked) {
        let pos = 0;
        let neg = 0;
        for (const s of series) {
          const v = n(s.values[i], 0);
          if (v >= 0) pos += v;
          else neg += v;
        }
        max = Math.max(max, pos);
        min = Math.min(min, neg);
      } else
        for (const s of series) {
          const v = n(s.values[i], 0);
          max = Math.max(max, v);
          min = Math.min(min, v);
        }
    }
    const span = nice(Math.max(max, -min) || 1);
    const step = span / (span / (max - min || span) > 2 ? 2 : 4) || 1;
    const hi = Math.ceil(max / step) * step || step;
    const lo = Math.floor(min / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2 && ticks.length < 12; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    const horiz = c.kind === 'bar';
    const valW = Math.max(...ticks.map((v) => short(v).length)) * fs * 0.6 + fs * 0.6;
    const catW = horiz ? Math.min(w * 0.35, Math.max(...labels.map((l) => l.length), 1) * fs * 0.56 + fs * 0.6) : 0;
    const left = horiz ? catW : valW;
    const plotTop = top + fs * 0.6;
    const plotBottom = bottom - (horiz ? fs * 1.6 : fs * 1.8);
    const right = w - fs * 0.6;
    const scale = (v: number) => (horiz ? left + ((v - lo) / (hi - lo)) * (right - left) : plotBottom - ((v - lo) / (hi - lo)) * (plotBottom - plotTop));
    const grid = color('fg', t, '#000');
    for (const v of ticks) {
      const p = scale(v);
      if (horiz) {
        if (c.grid || v === 0) root.appendChild(svg('line', { x1: p, x2: p, y1: plotTop, y2: plotBottom, stroke: grid, 'stroke-opacity': v === 0 ? 0.35 : 0.12, 'stroke-width': 1 }));
        label(p, plotBottom + fs * 0.9, short(v));
      } else {
        if (c.grid || v === 0) root.appendChild(svg('line', { x1: left, x2: right, y1: p, y2: p, stroke: grid, 'stroke-opacity': v === 0 ? 0.35 : 0.12, 'stroke-width': 1 }));
        label(left - fs * 0.4, p, short(v), 'end');
      }
    }
    const band = (horiz ? plotBottom - plotTop : right - left) / Math.max(1, count);
    labels.forEach((l, i) => {
      const mid = (horiz ? plotTop : left) + band * (i + 0.5);
      if (horiz) label(left - fs * 0.4, mid, l, 'end');
      else label(mid, plotBottom + fs * 0.9, l);
    });
    if (c.kind === 'line' || c.kind === 'area') {
      const base: number[] = labels.map(() => 0);
      series.forEach((s, si) => {
        const pts = labels.map((_, i) => {
          const v = n(s.values[i], 0) + (stacked ? base[i] : 0);
          return [left + band * (i + 0.5), scale(v), v] as const;
        });
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
        if (c.kind === 'area') {
          const floor = stacked ? labels.map((_, i) => [left + band * (i + 0.5), scale(base[i])]).reverse() : [[pts[pts.length - 1]?.[0] ?? left, scale(Math.max(lo, 0))], [pts[0]?.[0] ?? left, scale(Math.max(lo, 0))]];
          root.appendChild(svg('path', { d: `${line}${floor.map((p) => `L${p[0]},${p[1]}`).join('')}Z`, fill: col(si, s), 'fill-opacity': stacked ? 0.85 : 0.28 }));
        }
        root.appendChild(svg('path', { d: line, fill: 'none', stroke: col(si, s), 'stroke-width': Math.max(2, fs / 6), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        if (c.kind === 'line') for (const p of pts) root.appendChild(svg('circle', { cx: p[0], cy: p[1], r: Math.max(3, fs / 4.5), fill: col(si, s) }));
        if (c.values) for (const p of pts) label(p[0], p[1] - fs * 0.9, short(n(p[2], 0)), 'middle', { fill: color('fg', t, '#222') });
        if (stacked) labels.forEach((_, i) => (base[i] += n(s.values[i], 0)));
      });
      return root;
    }
    // Columns or bars, side by side in each band, or stacked.
    const inner = band * 0.72;
    const each = stacked ? inner : inner / Math.max(1, series.length);
    const pos = labels.map(() => 0);
    const neg = labels.map(() => 0);
    series.forEach((s, si) => {
      labels.forEach((_, i) => {
        const v = n(s.values[i], 0);
        let from = 0;
        let to = v;
        if (stacked) {
          from = v >= 0 ? pos[i] : neg[i];
          to = from + v;
          if (v >= 0) pos[i] = to;
          else neg[i] = to;
        }
        const a = scale(from);
        const b = scale(to);
        const off = (horiz ? plotTop : left) + band * i + (band - inner) / 2 + (stacked ? 0 : each * si);
        const r = horiz
          ? svg('rect', { x: Math.min(a, b), y: off, width: Math.max(0.5, Math.abs(b - a)), height: Math.max(1, each - (stacked ? 0 : 2)), rx: Math.min(4, each / 6), fill: col(si, s) })
          : svg('rect', { x: off, y: Math.min(a, b), width: Math.max(1, each - (stacked ? 0 : 2)), height: Math.max(0.5, Math.abs(b - a)), rx: Math.min(4, each / 6), fill: col(si, s) });
        root.appendChild(r);
        if (c.values && v !== 0) {
          if (horiz) label(Math.max(a, b) + fs * 0.3, off + each / 2, short(v), 'start', { fill: color('fg', t, '#222') });
          else label(off + each / 2, Math.min(a, b) - fs * 0.6, short(v), 'middle', { fill: color('fg', t, '#222') });
        }
      });
    });
    return root;
  };

  const lineSvg = (deck: Deck, l: Extract<El, { type: 'line' }>) => {
    const t = deck.theme;
    const sw = Math.max(0.5, n(l.width, 3));
    const pad = sw * 4 + 4;
    const x2 = n(l.w, 0);
    const y2 = n(l.h, 0);
    const minX = Math.min(0, x2);
    const minY = Math.min(0, y2);
    const box = { x: n(l.x, 0) + minX - pad, y: n(l.y, 0) + minY - pad, w: Math.abs(x2) + pad * 2, h: Math.abs(y2) + pad * 2 };
    const ax = -minX + pad;
    const ay = -minY + pad;
    const bx = ax + x2;
    const by = ay + y2;
    const ink = color(l.color, t, color('fg', t, '#000'));
    const root = svg('svg', { class: 'ns-shape', viewBox: `0 0 ${box.w} ${box.h}` });
    const ang = Math.atan2(by - ay, bx - ax);
    const head = sw * 3.2 + 4;
    const cut = (cap: string | undefined) => (cap === 'arrow' ? head * 0.8 : 0);
    const sx = ax + Math.cos(ang) * cut(l.start);
    const sy = ay + Math.sin(ang) * cut(l.start);
    const ex = bx - Math.cos(ang) * cut(l.end);
    const ey = by - Math.sin(ang) * cut(l.end);
    root.appendChild(svg('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: ink, 'stroke-width': sw, 'stroke-linecap': l.dash === 'dot' ? 'round' : 'butt', ...(l.dash === 'dash' ? { 'stroke-dasharray': `${sw * 3} ${sw * 2}` } : l.dash === 'dot' ? { 'stroke-dasharray': `0.1 ${sw * 2}` } : {}) }));
    const cap = (kind: string | undefined, x: number, y: number, a: number) => {
      if (kind === 'arrow') {
        const p = (d: number, s: number) => `${x + Math.cos(a) * d - Math.sin(a) * s},${y + Math.sin(a) * d + Math.cos(a) * s}`;
        root.appendChild(svg('path', { d: `M${p(0, 0)}L${p(-head, head * 0.55)}L${p(-head, -head * 0.55)}Z`, fill: ink }));
      } else if (kind === 'dot') root.appendChild(svg('circle', { cx: x, cy: y, r: sw * 1.6 + 1, fill: ink }));
    };
    cap(l.end, bx, by, ang);
    cap(l.start, ax, ay, ang + Math.PI);
    return { root, box };
  };

  // ---- icons, equations, videos ----------------------------------------------------------------------------------
  const ICON_ATTRS: Record<string, string[]> = { path: ['d'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'], polygon: ['points'] };
  const iconSvg = (paths: IconNode[], ink: string, lw: number) => {
    const root = svg('svg', { class: 'ns-icon', viewBox: '0 0 24 24', preserveAspectRatio: 'xMidYMid meet', fill: 'none', stroke: ink, 'stroke-width': lw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    for (const node of Array.isArray(paths) ? paths.slice(0, 60) : []) {
      const [tag, attrs] = Array.isArray(node) ? node : [];
      const allowed = typeof tag === 'string' ? ICON_ATTRS[tag] : undefined;
      if (!allowed || !attrs || typeof attrs !== 'object') continue;
      const out: Record<string, string | number> = {};
      for (const k of allowed) {
        const v = (attrs as Record<string, unknown>)[k];
        if (k === 'd' ? typeof v === 'string' && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]{1,4000}$/.test(v) : k === 'points' ? typeof v === 'string' && /^[0-9eE.,\s+-]{1,2000}$/.test(v) : typeof v === 'number' && Number.isFinite(v))
          out[k] = v as string | number;
      }
      root.appendChild(svg(tag as keyof SVGElementTagNameMap, out));
    }
    return root;
  };
  const katexOf = (o: DrawOpts): KatexLike | null => {
    const k = o.katex ?? (win as unknown as { katex?: KatexLike }).katex;
    return k && typeof k.render === 'function' ? k : null;
  };
  /** An equation drawn into `inner`, by KaTeX where there is one; its LaTeX otherwise. */
  const drawTex = (inner: HTMLElement, tex: string, o: DrawOpts) => {
    const k = katexOf(o);
    inner.textContent = '';
    inner.classList.remove('ns-tex');
    if (k) {
      try {
        k.render(tex, inner, { displayMode: true, throwOnError: false, strict: 'ignore', output: 'html', trust: false, maxExpand: 500, maxSize: 50 });
        return;
      } catch {}
    }
    inner.textContent = tex;
    inner.classList.add('ns-tex');
  };
  const PLAYER = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/[\w-]{6,20}|player\.vimeo\.com\/video\/\d{4,12})$/;
  /** Where a video the app keeps plays from: the app's address of it, its signed one (a page without the app's sign-in), or itself inside a page; '' for none. */
  const keptUrl = (s: unknown, o: DrawOpts): string => {
    if (typeof s !== 'string') return '';
    const k = /^naget-video:([a-f0-9]{16,64})$/.exec(s);
    if (k) return o.video ? o.video(k[1]) : '';
    if (/^\/pg\/video\/[a-f0-9]{16,64}\/[A-Za-z0-9_-]{16,64}$/.test(s)) return s;
    if (/^data:video\/(mp4|webm|quicktime);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    return '';
  };
  /** A video the app keeps, playing in its box from its start, with the browser's own controls. */
  const playKept = (box: HTMLElement, v: Extract<El, { type: 'video' }>, url: string) => {
    if (!url || box.querySelector('video')) return;
    const f = el('video');
    f.src = url;
    f.controls = true;
    f.autoplay = true;
    f.playsInline = true;
    f.preload = 'auto';
    if (v.muted) f.muted = true;
    if (v.loop) f.loop = true;
    const start = n(v.start, 0);
    if (start > 0) f.addEventListener('loadedmetadata', () => (f.currentTime = start), { once: true });
    box.textContent = '';
    box.appendChild(f);
    void f.play?.()?.catch(() => {});
  };
  /** A video's player, playing from its start. */
  const playVideo = (box: HTMLElement, v: Extract<El, { type: 'video' }>, o: DrawOpts = {}) => {
    if (!PLAYER.test(v.src)) return playKept(box, v, keptUrl(v.src, o));
    if (box.querySelector('iframe')) return;
    const yt = v.src.includes('youtube');
    const q = new URLSearchParams({
      autoplay: '1',
      ...(v.muted ? (yt ? { mute: '1' } : { muted: '1' }) : {}),
      ...(v.loop ? (yt ? { loop: '1', playlist: v.src.split('/').pop() ?? '' } : { loop: '1' }) : {}),
      ...(v.start ? (yt ? { start: String(v.start) } : {}) : {}),
      ...(yt ? { rel: '0', modestbranding: '1' } : {}),
    });
    // The players cannot run in a page of its own origin (a deck's page, sandboxed): there it opens on its site.
    if (win.origin === 'null') {
      const id = v.src.split('/').pop() ?? '';
      win.open(yt ? `https://www.youtube.com/watch?v=${id}${v.start ? `&t=${v.start}s` : ''}` : `https://vimeo.com/${id}`, '_blank', 'noopener,noreferrer');
      return;
    }
    const f = el('iframe');
    f.src = `${v.src}?${q.toString()}${!yt && v.start ? `#t=${v.start}s` : ''}`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.title = 'Video';
    box.textContent = '';
    box.style.backgroundImage = 'none';
    box.appendChild(f);
  };

  // ---- a part --------------------------------------------------------------------------------------------------
  const part = (deck: Deck, s: Slide, e: El, o: DrawOpts = {}): HTMLElement => {
    const t = deck.theme;
    const d = el('div', 'ns-el');
    d.dataset.id = e.id;
    d.dataset.type = e.type;
    const place = (x: number, y: number, w: number, h: number) => {
      d.style.left = px(x);
      d.style.top = px(y);
      d.style.width = px(Math.max(1, w));
      d.style.height = px(Math.max(1, h));
    };
    if (e.type === 'line') {
      const { root, box } = lineSvg(deck, e);
      place(box.x, box.y, box.w, box.h);
      d.appendChild(root);
    } else {
      place(n(e.x, 0), n(e.y, 0), n(e.w, 100), n(e.h, 100));
      if (e.rot) d.style.rotate = `${n(e.rot, 0)}deg`;
    }
    if (e.opacity !== undefined && e.opacity < 1) d.style.opacity = String(Math.max(0, n(e.opacity, 1)));
    const w = Math.abs(n(e.w, 100));
    const h = Math.abs(n(e.h, 100));
    if (e.type === 'text' || e.type === 'shape') {
      const kind = e.type === 'shape' ? e.shape : 'rect';
      const fill = color(e.fill, t, 'transparent');
      const fill2 = e.fill2 ? color(e.fill2, t, '') : '';
      const paint = fill2 && fill !== 'transparent' ? `linear-gradient(${n(e.angle, 180)}deg, ${fill}, ${fill2})` : fill;
      const stroke = e.line ? color(e.line, t, '') : '';
      const lw = n(e.lineW, 2);
      if (kind === 'rect' || kind === 'round' || kind === 'ellipse') {
        const f = el('div', 'ns-fill');
        f.style.background = paint;
        if (stroke) f.style.border = `${px(lw)} ${e.dash === 'dash' ? 'dashed' : e.dash === 'dot' ? 'dotted' : 'solid'} ${stroke}`;
        f.style.borderRadius = kind === 'ellipse' ? '50%' : kind === 'round' ? px(n(e.radius, Math.min(w, h) * 0.16)) : e.radius ? px(n(e.radius, 0)) : '0';
        if (e.shadow) f.style.boxShadow = '0 10px 28px rgba(0,0,0,.22)';
        d.appendChild(f);
      } else {
        const g = svg('svg', { class: 'ns-shape', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });
        let fillRef = fill;
        if (fill2 && fill !== 'transparent') {
          const id = `ng-${e.id}`;
          const a = (n(e.angle, 180) - 90) * (Math.PI / 180);
          const grad = svg('linearGradient', { id, x1: 0.5 - Math.cos(a) / 2, y1: 0.5 - Math.sin(a) / 2, x2: 0.5 + Math.cos(a) / 2, y2: 0.5 + Math.sin(a) / 2 });
          grad.append(svg('stop', { offset: 0, 'stop-color': fill }), svg('stop', { offset: 1, 'stop-color': fill2 }));
          const defs = svg('defs');
          defs.appendChild(grad);
          g.appendChild(defs);
          fillRef = `url(#${id})`;
        }
        g.appendChild(svg('path', { d: shapePath(kind, w, h), fill: fillRef, ...(stroke ? { stroke, 'stroke-width': lw, 'stroke-linejoin': 'round', ...(e.dash === 'dash' ? { 'stroke-dasharray': `${lw * 3} ${lw * 2}` } : e.dash === 'dot' ? { 'stroke-dasharray': `${lw} ${lw}` } : {}) } : {}) }));
        if (e.shadow) g.style.filter = 'drop-shadow(0 8px 16px rgba(0,0,0,.22))';
        d.appendChild(g);
      }
      const { box, empty } = textBox(deck, e, o);
      if (empty) {
        if (o.edit && e.ph) d.classList.add('ns-ph');
        if (!o.edit) box.style.visibility = 'hidden';
      }
      d.appendChild(box);
    } else if (e.type === 'image') {
      const url = src(e.src, o);
      if (url) {
        // The box holds the corners, the border and the shadow; inside it the picture, flipped, cropped, its colours changed.
        const box = el('div', 'ns-imgbox');
        if (e.radius) box.style.borderRadius = px(n(e.radius, 0));
        if (e.shadow) d.style.filter = 'drop-shadow(0 10px 18px rgba(0,0,0,.25))';
        const flip = el('div', 'ns-flip');
        if (e.flipH || e.flipV) flip.style.scale = `${e.flipH ? -1 : 1} ${e.flipV ? -1 : 1}`;
        const img = el('img', 'ns-img');
        img.src = url;
        img.alt = typeof e.alt === 'string' ? e.alt : '';
        img.draggable = false;
        img.decoding = 'async';
        const c = e.crop;
        if (c && typeof c === 'object') {
          const kw = Math.max(0.05, 1 - n(c.l, 0) - n(c.r, 0));
          const kh = Math.max(0.05, 1 - n(c.t, 0) - n(c.b, 0));
          img.style.width = `${100 / kw}%`;
          img.style.height = `${100 / kh}%`;
          img.style.left = `${(-n(c.l, 0) / kw) * 100}%`;
          img.style.top = `${(-n(c.t, 0) / kh) * 100}%`;
          img.style.objectFit = 'fill';
        } else img.style.objectFit = e.fit ?? 'cover';
        const a = e.adjust;
        if (a && typeof a === 'object') {
          const f = [
            a.bright ? `brightness(${1 + n(a.bright, 0) / 100})` : '',
            a.contrast ? `contrast(${1 + n(a.contrast, 0) / 100})` : '',
            a.sat !== undefined && a.sat !== 100 ? `saturate(${n(a.sat, 100) / 100})` : '',
            a.gray ? 'grayscale(1)' : '',
            a.blur ? `blur(${px(n(a.blur, 0))})` : '',
          ].filter(Boolean);
          if (f.length) img.style.filter = f.join(' ');
        }
        flip.appendChild(img);
        box.appendChild(flip);
        if (e.line) {
          const ring = el('div', 'ns-imgbox');
          ring.style.border = `${px(n(e.lineW, 2))} solid ${color(e.line, t, 'transparent')}`;
          ring.style.borderRadius = 'inherit';
          box.appendChild(ring);
        }
        d.appendChild(box);
      } else if (o.edit) {
        const ph = el('div', 'ns-noimg');
        ph.textContent = hintOf(e.src ? 'This picture can’t be shown here' : 'Double-click to add a picture');
        d.appendChild(ph);
      }
    } else if (e.type === 'table') {
      const tb = el('table', 'ns-table');
      const rows = Array.isArray(e.rows) ? e.rows : [];
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const widths = Array.isArray(e.cols) && e.cols.length === cols ? e.cols : null;
      if (widths) {
        const sum = widths.reduce((a, b) => a + n(b, 1), 0) || 1;
        const cg = el('colgroup');
        for (const x of widths) {
          const c = el('col');
          c.style.width = `${(n(x, 1) / sum) * 100}%`;
          cg.appendChild(c);
        }
        tb.appendChild(cg);
      }
      tb.style.fontFamily = font(e.font, t);
      tb.style.fontSize = sizeCss(n(e.size, 20));
      tb.style.color = color(e.color, t, color('fg', t, '#222'));
      const lineC = color(e.line, t, '') || `color-mix(in srgb, ${color('fg', t, '#000')} 18%, transparent)`;
      const body = el('tbody');
      // Merged cells: the first holds the rest of its block, which are not drawn.
      const span = new Map<string, { rs: number; cs: number }>();
      const covered = new Set<string>();
      for (const m of Array.isArray(e.merges) ? e.merges : []) {
        const rs = Math.max(1, Math.round(n(m.rs, 1)));
        const cs = Math.max(1, Math.round(n(m.cs, 1)));
        span.set(`${m.r},${m.c}`, { rs, cs });
        for (let i = m.r; i < m.r + rs; i++) for (let j = m.c; j < m.c + cs; j++) if (i !== m.r || j !== m.c) covered.add(`${i},${j}`);
      }
      rows.forEach((r, ri) => {
        const tr = el('tr');
        for (let ci = 0; ci < cols; ci++) {
          if (covered.has(`${ri},${ci}`)) continue;
          const td = el('td');
          td.textContent = typeof r[ci] === 'string' ? r[ci] : '';
          td.style.borderColor = lineC;
          td.dataset.r = String(ri);
          td.dataset.c = String(ci);
          const sp = span.get(`${ri},${ci}`);
          if (sp) {
            if (sp.rs > 1) td.rowSpan = sp.rs;
            if (sp.cs > 1) td.colSpan = sp.cs;
          }
          const al = e.aligns?.[ci];
          if (al) td.style.textAlign = al;
          if (ri === 0 && e.head) {
            td.style.background = color(e.fill, t, color('accent', t, '#333'));
            td.style.color = color(e.headColor, t, color('accentFg', t, '#fff'));
            td.style.fontWeight = '700';
          } else if (e.band && (ri - (e.head ? 1 : 0)) % 2 === 1) td.style.background = color('soft', t, 'transparent');
          const own = e.fills?.[`${ri},${ci}`];
          if (own) td.style.background = color(own, t, td.style.background);
          tr.appendChild(td);
        }
        body.appendChild(tr);
      });
      tb.appendChild(body);
      d.appendChild(tb);
    } else if (e.type === 'chart') {
      d.appendChild(chart(deck, e));
    } else if (e.type === 'icon') {
      d.appendChild(iconSvg(e.paths, color(e.color, t, color('accent', t, '#333')), Math.max(0.25, Math.min(6, n(e.lineW, 2)))));
    } else if (e.type === 'math') {
      const box = el('div', 'ns-math');
      if (e.align === 'left' || e.align === 'right') box.dataset.align = e.align;
      box.style.color = color(e.color, t, color('fg', t, '#000'));
      const inner = el('span', 'ns-mi');
      drawTex(inner, typeof e.tex === 'string' ? e.tex : '', o);
      box.appendChild(inner);
      d.appendChild(box);
    } else if (e.type === 'video') {
      const box = el('div', 'ns-video');
      const online = PLAYER.test(e.src);
      const still = e.poster ? src(e.poster, o) : /youtube-nocookie\.com\/embed\/([\w-]{6,20})$/.test(e.src) ? src(`https://i.ytimg.com/vi/${e.src.split('/').pop()}/hqdefault.jpg`, o) : '';
      if (still) box.style.backgroundImage = `url("${still}")`;
      if (e.radius) box.style.borderRadius = px(n(e.radius, 0));
      const play = el('span', 'ns-play');
      const ic = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
      ic.appendChild(svg('path', { d: 'M7 4.5v15l13-7.5z' }));
      play.appendChild(ic);
      box.append(play);
      // Where an online video comes from; one the app keeps is the deck's own.
      if (online) {
        const from = el('span', 'ns-from');
        from.textContent = e.src.includes('vimeo') ? 'Vimeo' : 'YouTube';
        box.append(from);
      }
      if (o.play && (online || keptUrl(e.src, o))) {
        box.dataset.video = '1';
        if (e.autoplay) box.dataset.autoplay = '1';
        box.addEventListener('click', (ev) => {
          ev.stopPropagation();
          playVideo(box, e, o);
        });
      }
      d.appendChild(box);
    } else if (e.type === 'group') {
      for (const c of Array.isArray(e.els) ? e.els : []) d.appendChild(part(deck, s, c, o));
    }
    const link = e.link ? (/^#\d{1,3}$/.test(e.link) ? e.link : href(e.link)) : '';
    if (link && !o.edit) {
      d.dataset.link = link;
      d.style.cursor = 'pointer';
    }
    return d;
  };

  // ---- a slide ---------------------------------------------------------------------------------------------------
  const background = (deck: Deck, s: Slide, root: HTMLElement, o: DrawOpts) => {
    const t = deck.theme;
    const b = s.bg ?? {};
    const base = color(b.color, t, color('bg', t, '#fff'));
    root.style.background = b.to && b.color ? `linear-gradient(${n(b.angle, 180)}deg, ${base}, ${color(b.to, t, base)})` : base;
    const url = b.image ? src(b.image, o) : '';
    if (url) {
      const i = el('div', 'ns-bgimg');
      i.style.backgroundImage = `url("${url}")`;
      root.appendChild(i);
      if (b.dim) {
        const dim = el('div', 'ns-dim');
        dim.style.opacity = String(Math.max(0, Math.min(0.8, n(b.dim, 0))));
        root.appendChild(dim);
      }
    }
  };

  /** The deck's footer on slide i: the date at the left, its words in the middle, the slide's number at the right. */
  const footer = (deck: Deck, i: number, root: HTMLElement, o: DrawOpts) => {
    const f = deck.footer;
    const s = deck.slides[i];
    if (!f || typeof f !== 'object' || !s || s.nofooter || (f.skipTitle && (i === 0 || s.layout === 'title'))) return;
    const t = deck.theme;
    const put = (text: string, left: number, width: number, align: string) => {
      const d = el('div', 'ns-foot');
      d.textContent = text;
      d.style.left = px(left);
      d.style.width = px(width);
      d.style.justifyContent = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
      d.style.color = color('muted', t, '#777');
      d.style.fontFamily = font('body', t);
      root.appendChild(d);
    };
    if (f.date) {
      let text = String(f.date).slice(0, 60);
      if (text === 'today') {
        try {
          text = new Date().toLocaleDateString(o.locale || undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } catch {
          text = new Date().toLocaleDateString();
        }
      }
      put(text, 64, 320, 'left');
    }
    if (f.text) put(String(f.text).slice(0, 200), 400, W - 800, 'center');
    if (f.num) put(String(i + 1), W - 64 - 200, 200, 'right');
  };

  const slide = (deck: Deck, i: number, o: DrawOpts = {}): HTMLElement => {
    if (o.hint) hintOf = o.hint;
    const s = deck.slides[i];
    const root = el('div', 'ns-slide');
    // A deck's words are its own: never translated with the app's.
    root.setAttribute('translate', 'no');
    root.style.width = px(W);
    root.style.height = px(H(deck));
    root.style.color = color('fg', deck.theme, '#000');
    root.style.fontFamily = font(undefined, deck.theme);
    if (!s) return root;
    root.dataset.slide = s.id;
    background(deck, s, root, o);
    for (const e of s.els ?? []) root.appendChild(part(deck, s, e, o));
    footer(deck, i, root, o);
    if (o.play) root.classList.add('ns-canplay');
    if (!o.edit && o.step !== undefined) applyState(root, s, o.step);
    return root;
  };

  // ---- making words fit ---------------------------------------------------------------------------------------
  const fitCache = new Map<string, number>();
  // Fonts arriving change how much fits.
  doc.fonts?.addEventListener?.('loadingdone', () => fitCache.clear());
  const fit = (root: HTMLElement) => {
    for (const box of Array.from(root.querySelectorAll<HTMLElement>('.ns-txt[data-fit]'))) {
      if (box.isContentEditable) continue;
      // An empty box (its hint showing) is at its own size.
      if (box.parentElement?.classList.contains('ns-ph')) {
        box.style.removeProperty('--fs');
        continue;
      }
      const key = `${box.parentElement?.style.width}|${box.parentElement?.style.height}|${box.style.cssText}|${box.innerHTML}`;
      const known = fitCache.get(key);
      if (known !== undefined) {
        box.style.setProperty('--fs', String(known));
        continue;
      }
      box.style.removeProperty('--fs');
      const over = () => box.scrollHeight > box.clientHeight + 1;
      let k = 1;
      if (box.clientHeight > 0 && over()) {
        let lo = 0.25;
        let hi = 1;
        for (let i = 0; i < 7; i++) {
          const mid = (lo + hi) / 2;
          box.style.setProperty('--fs', String(mid));
          if (over()) hi = mid;
          else lo = mid;
        }
        k = Math.floor(lo * 100) / 100;
        box.style.setProperty('--fs', String(k));
      }
      if (box.clientHeight > 0) {
        if (fitCache.size > 2000) fitCache.clear();
        fitCache.set(key, k);
      }
    }
    // Equations as large as their boxes allow.
    for (const box of Array.from(root.querySelectorAll<HTMLElement>('.ns-math'))) {
      const inner = box.firstElementChild as HTMLElement | null;
      if (!inner) continue;
      inner.style.transform = '';
      const iw = inner.offsetWidth;
      const ih = inner.offsetHeight;
      const bw = box.clientWidth;
      const bh = box.clientHeight;
      if (iw && ih && bw && bh) inner.style.transform = `scale(${Math.round(Math.min(bw / iw, bh / ih) * 1000) / 1000})`;
    }
  };

  // ---- Morph: which parts two slides share ----------------------------------------------------------------------
  const morphPairs = (a: Slide, b: Slide): [El, El][] => {
    const left = (a?.els ?? []).slice();
    const out: [El, El][] = [];
    const take = (test: (x: El) => boolean) => {
      const i = left.findIndex(test);
      return i < 0 ? null : left.splice(i, 1)[0];
    };
    // The same part copied (a slide duplicated, a part pasted), then the same name, then the same words or picture.
    const mk = (e: El) => e.key || e.id;
    const words2 = (e: El) =>
      e.type === 'text' || e.type === 'shape'
        ? (e.paras ?? [])
            .map((p) => (p.runs ?? []).map((r) => r.t).join(''))
            .join('\n')
            .trim()
        : '';
    const sig = (e: El): string =>
      e.type === 'text' || e.type === 'shape'
        ? words2(e)
          ? `w:${words2(e)}`
          : e.type === 'shape'
            ? `s:${e.shape}:${e.fill ?? ''}`
            : ''
        : e.type === 'image'
          ? `i:${e.src}`
          : e.type === 'icon'
            ? `c:${e.icon}`
            : e.type === 'math'
              ? `m:${e.tex}`
              : e.type === 'video'
                ? `v:${e.src}`
                : e.type === 'chart'
                  ? `h:${e.kind}:${e.title ?? ''}`
                  : e.type === 'table'
                    ? `t:${(e.rows?.[0] ?? []).join('|')}`
                    : '';
    const rest: El[] = [];
    for (const e of b?.els ?? []) {
      const m = take((x) => mk(x) === mk(e));
      if (m) out.push([m, e]);
      else rest.push(e);
    }
    const rest2: El[] = [];
    for (const e of rest) {
      const m = e.name ? take((x) => x.type === e.type && x.name === e.name) : null;
      if (m) out.push([m, e]);
      else rest2.push(e);
    }
    for (const e of rest2) {
      const g = sig(e);
      const m = g ? take((x) => x.type === e.type && sig(x) === g) : null;
      if (m) out.push([m, e]);
    }
    return out;
  };

  // ---- reading edited words back ------------------------------------------------------------------------------
  const read = (box: HTMLElement, e: TextProps): Para[] => {
    const out: Para[] = [];
    type St = { b?: boolean; i?: boolean; u?: boolean; s?: boolean; color?: string; hl?: string; size?: number; font?: string; link?: string; sup?: boolean; sub?: boolean };
    let cur: Para | null = null;
    const start = (from: HTMLElement | null) => {
      cur = { runs: [] };
      if (from) {
        const list = from.dataset.list;
        if (list === 'bullet' || list === 'number') cur.list = list;
        const lvl = Number(from.dataset.lvl ?? 0);
        if (lvl > 0 && lvl <= 4) cur.lvl = lvl;
        const al = from.dataset.align || from.style.textAlign;
        if (al === 'left' || al === 'center' || al === 'right' || al === 'justify') cur.align = al;
      }
      out.push(cur);
    };
    const add = (text: string, st: St) => {
      if (!cur) start(null);
      const r: Run = { t: text };
      if (st.b !== undefined && st.b !== !!e.bold) r.b = st.b;
      if (st.i !== undefined && st.i !== !!e.italic) r.i = st.i;
      if (st.u) r.u = true;
      if (st.s) r.s = true;
      if (st.color) r.color = st.color;
      if (st.hl) r.hl = st.hl;
      if (st.size && Math.abs(st.size - n(e.size, 24)) > 0.01) r.size = st.size;
      if (st.font && st.font !== e.font) r.font = st.font;
      if (st.link) r.link = st.link;
      if (st.sup) r.sup = true;
      if (st.sub) r.sub = true;
      const runs = cur!.runs;
      const last = runs[runs.length - 1];
      const same = (a: Run, b: Run) => JSON.stringify({ ...a, t: '' }) === JSON.stringify({ ...b, t: '' });
      if (last && same(last, r)) last.t += text;
      else runs.push(r);
    };
    const sizeOf = (v: string) => {
      const m = /([\d.]+)px/.exec(v);
      return m ? Number(m[1]) : undefined;
    };
    const walk = (node: Node, st: St, block: boolean) => {
      if (node.nodeType === 3) {
        const text = (node.nodeValue ?? '').replace(/\u200b/g, '');
        if (text) add(text, st);
        return;
      }
      if (node.nodeType !== 1) return;
      const x = node as HTMLElement;
      const tag = x.tagName;
      if (tag === 'BR') {
        // The browser's own <br> at a paragraph's end holds an empty line open: not a break.
        if (x.nextSibling || !block) add('\n', st);
        return;
      }
      const isBlock = /^(DIV|P|LI|H[1-6]|BLOCKQUOTE|UL|OL)$/.test(tag);
      if (isBlock && block) {
        if (tag === 'UL' || tag === 'OL') {
          for (const c of Array.from(x.childNodes)) walk(c, st, true);
          return;
        }
        start(x.classList.contains('ns-p') || x.dataset.list ? x : null);
        for (const c of Array.from(x.childNodes)) walk(c, st, false);
        return;
      }
      if (isBlock && !block) {
        // A block the browser put inside a paragraph: a paragraph of its own.
        start(null);
        for (const c of Array.from(x.childNodes)) walk(c, st, false);
        return;
      }
      const n2: St = { ...st };
      if (tag === 'B' || tag === 'STRONG') n2.b = true;
      if (tag === 'I' || tag === 'EM') n2.i = true;
      if (tag === 'U') n2.u = true;
      if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') n2.s = true;
      if (tag === 'SUP' || x.dataset.v === 'sup') {
        n2.sup = true;
        n2.sub = false;
      }
      if (tag === 'SUB' || x.dataset.v === 'sub') {
        n2.sub = true;
        n2.sup = false;
      }
      if (tag === 'A') {
        const h = x.getAttribute('href') ?? '';
        if (/^#\d{1,3}$/.test(h) || href(h)) n2.link = h;
      }
      const cs = x.style;
      const fw = cs.fontWeight;
      if (fw) n2.b = fw === 'bold' || fw === 'bolder' || Number(fw) >= 600;
      if (cs.fontStyle) n2.i = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique';
      const deco = `${cs.textDecorationLine} ${cs.textDecoration}`;
      if (/underline/.test(deco)) n2.u = true;
      if (/line-through/.test(deco)) n2.s = true;
      if (x.dataset.c) n2.color = x.dataset.c;
      else if (cs.color) n2.color = cs.color.replace(/\s+/g, ' ');
      if (x.dataset.hl) n2.hl = x.dataset.hl;
      else if (cs.backgroundColor && cs.backgroundColor !== 'transparent' && !/rgba\([^)]*,\s*0\)/.test(cs.backgroundColor)) n2.hl = cs.backgroundColor.replace(/\s+/g, ' ');
      if (cs.fontSize && x.dataset.v !== 'sup' && x.dataset.v !== 'sub') {
        const sz = sizeOf(cs.fontSize);
        if (sz) n2.size = sz;
      }
      if (x.dataset.f) n2.font = x.dataset.f;
      else if (cs.fontFamily) {
        const first = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
        if (/^[A-Za-z0-9][A-Za-z0-9 \-]{0,39}$/.test(first)) n2.font = first;
      }
      for (const c of Array.from(x.childNodes)) walk(c, n2, false);
    };
    const st: St = {};
    for (const c of Array.from(box.childNodes)) {
      if (c.nodeType === 1 && /^(DIV|P|LI|H[1-6]|BLOCKQUOTE|UL|OL)$/.test((c as HTMLElement).tagName)) {
        cur = null;
        walk(c, st, true);
        cur = null;
      } else {
        if (!cur) start(null);
        walk(c, st, false);
      }
    }
    for (const p of out) {
      if (!p.runs.length) p.runs.push({ t: '' });
      // A line break the browser left at the end of a paragraph.
      const last = p.runs[p.runs.length - 1];
      if (last.t.endsWith('\n') && p.runs.map((r) => r.t).join('') !== '\n') last.t = last.t.slice(0, -1);
      p.runs = p.runs.filter((r, i) => r.t || i === 0);
    }
    return out.length ? out : [{ runs: [{ t: '' }] }];
  };

  // ---- builds: the order things come in -------------------------------------------------------------------------
  interface Fx {
    a: Anim;
    /** The part, or one of its paragraphs. */
    para?: number;
    group: number;
    begin: number;
    end: number;
  }
  const plan = (s: Slide): { fx: Fx[]; groups: number; auto: boolean } => {
    const list: { a: Anim; para?: number; on: Anim['on'] }[] = [];
    for (const a of s.anims ?? []) {
      const target = s.els.find((e) => e.id === a.el);
      if (!target) continue;
      if (a.byPara && (target.type === 'text' || target.type === 'shape')) {
        const ps = (target.paras ?? []).map((p, i) => ((p.runs ?? []).some((r) => r.t) ? i : -1)).filter((i) => i >= 0);
        ps.forEach((p, k) => list.push({ a, para: p, on: k === 0 ? a.on : a.on === 'with' ? 'with' : a.on === 'after' ? 'after' : 'click' }));
      } else list.push({ a, on: a.on });
    }
    const fx: Fx[] = [];
    // Group 0 plays by itself as the slide comes (when the first effect is not on a click); each click starts the next.
    let group = 0;
    let prev: Fx | null = null;
    const auto = list.length > 0 && list[0].on !== 'click';
    for (const x of list) {
      if (x.on === 'click') {
        group++;
        prev = null;
      }
      const p = prev as Fx | null;
      const begin = !p ? 0 : x.on === 'after' ? p.end : p.begin;
      const f: Fx = { a: x.a, para: x.para, group, begin, end: begin + n(x.a.delay, 0) + n(x.a.dur, 500) };
      fx.push(f);
      prev = f;
    }
    const groups = fx.length ? Math.max(...fx.map((f) => f.group)) : 0;
    return { fx, groups, auto };
  };
  const steps = (s: Slide) => plan(s).groups;

  const targetOf = (root: HTMLElement, f: Fx): HTMLElement | null => {
    const part = root.querySelector<HTMLElement>(`.ns-el[data-id="${CSS.escape(f.a.el)}"]`);
    if (!part || f.para === undefined) return part;
    return (part.querySelectorAll<HTMLElement>('.ns-txt > .ns-p')[f.para] as HTMLElement | undefined) ?? null;
  };

  /** Shows the slide as its build leaves it after `step` click groups (0: before the first click; -1: before what plays by itself). */
  const applyState = (root: HTMLElement, s: Slide, step: number) => {
    const { fx } = plan(s);
    const seen = new Set<string>();
    for (const f of fx) {
      const key = `${f.a.el}:${f.para ?? ''}`;
      const t = targetOf(root, f);
      if (!t) continue;
      if (!seen.has(key)) {
        seen.add(key);
        t.classList.toggle('ns-hidden', f.a.type === 'in');
        t.style.removeProperty('scale');
      }
      if (f.group <= step) {
        if (f.a.type === 'in') t.classList.remove('ns-hidden');
        else if (f.a.type === 'out') t.classList.add('ns-hidden');
        else if (f.a.fx === 'grow') t.style.scale = '1.2';
      }
    }
  };

  const keyframes = (f: Fx, t: HTMLElement, deck: Deck): Keyframe[] => {
    const a = f.a;
    const elData = { x: parseFloat(t.closest<HTMLElement>('.ns-el')?.style.left ?? '0'), y: parseFloat(t.closest<HTMLElement>('.ns-el')?.style.top ?? '0'), w: t.offsetWidth, h: t.offsetHeight };
    const SH = H(deck);
    const dir = a.dir ?? 'left';
    let k: Keyframe[];
    switch (a.fx) {
      case 'fade':
        k = [{ opacity: 0 }, { opacity: 1 }];
        break;
      case 'fly': {
        const off = dir === 'left' ? `${-(elData.x + elData.w + 60)}px 0` : dir === 'right' ? `${W - elData.x + 60}px 0` : dir === 'up' ? `0 ${-(elData.y + elData.h + 60)}px` : `0 ${SH - elData.y + 60}px`;
        k = [{ translate: off }, { translate: '0 0' }];
        break;
      }
      case 'float': {
        const off = dir === 'down' ? '0 -48px' : dir === 'left' ? '-48px 0' : dir === 'right' ? '48px 0' : '0 48px';
        k = [{ opacity: 0, translate: off }, { opacity: 1, translate: '0 0' }];
        break;
      }
      case 'zoom':
        k = [{ opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1 }];
        break;
      case 'wipe': {
        const from = dir === 'left' ? 'inset(0 100% 0 0)' : dir === 'right' ? 'inset(0 0 0 100%)' : dir === 'up' ? 'inset(0 0 100% 0)' : 'inset(100% 0 0 0)';
        k = [{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }];
        break;
      }
      case 'bounce':
        k = [
          { opacity: 0, translate: `0 ${-(elData.y + elData.h + 40)}px`, offset: 0 },
          { opacity: 1, translate: '0 0', offset: 0.55, easing: 'ease-out' },
          { translate: '0 -36px', offset: 0.72, easing: 'ease-in' },
          { translate: '0 0', offset: 0.86, easing: 'ease-out' },
          { translate: '0 -10px', offset: 0.93, easing: 'ease-in' },
          { translate: '0 0', offset: 1 },
        ];
        break;
      case 'pulse':
        k = [{ scale: 1 }, { scale: 1.1 }, { scale: 1 }, { scale: 1.1 }, { scale: 1 }];
        break;
      case 'spin': {
        const base = parseFloat(t.style.rotate || '0') || 0;
        k = [{ rotate: `${base}deg` }, { rotate: `${base + 360}deg` }];
        break;
      }
      case 'grow':
        k = [{ scale: 1 }, { scale: 1.2 }];
        break;
      case 'shake':
        k = [{ translate: '0 0' }, { translate: '-14px 0' }, { translate: '14px 0' }, { translate: '-10px 0' }, { translate: '10px 0' }, { translate: '-4px 0' }, { translate: '0 0' }];
        break;
      default:
        k = [{ opacity: 1 }, { opacity: 1 }];
    }
    return a.type === 'out' ? k.slice().reverse().map((x, i, all) => ({ ...x, offset: x.offset !== undefined ? 1 - (x.offset as number) : i / Math.max(1, all.length - 1) })) : k;
  };

  // ---- the slideshow -----------------------------------------------------------------------------------------------
  const ICONS: Record<string, string> = {
    prev: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 18l6-6-6-6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    full: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    exit: '<path d="M18 6L6 18M6 6l12 12"/>',
    laser: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    pen: '<path d="M4 20l1.2-4.6L15.8 4.8a2.2 2.2 0 0 1 3.1 3.1L8.3 18.5z"/><path d="M13.8 6.8l3.1 3.1"/>',
    erase: '<path d="M8.5 20H20"/><path d="M4.6 15.4l9.8-9.8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11.2 19H8.2l-3.6-3.6"/>',
    captions: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 11.5h3M12.5 11.5H17M7 15h6.5M15.5 15H17"/>',
  };
  const button = (name: string, label: string, on: () => void) => {
    const b = el('button', 'ns-btn');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    const ic = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    // The icons are this file's own markup, never a deck's.
    ic.innerHTML = ICONS[name];
    b.appendChild(ic);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      on();
    });
    return b;
  };

  const show = (host: HTMLElement, deck: Deck, o: ShowOpts): Show => {
    style(host.ownerDocument);
    const SH = H(deck);
    const words = {
      prev: 'Previous',
      next: 'Next',
      grid: 'All slides',
      full: 'Full screen',
      exit: 'End the slideshow',
      end: 'The end of the slideshow. Click to leave.',
      laser: 'Laser pointer (L)',
      pen: 'Pen (P)',
      erase: 'Erase the drawings (E)',
      captions: 'Live captions (C)',
      noCaptions: 'Live captions need a browser that turns speech into words, such as Chrome.',
      listening: 'Listening…',
      ...(o.words ?? {}),
    };
    // What every slide is drawn with here: videos play when clicked.
    const pass: DrawOpts = { asset: o.asset, web: o.web, video: o.video, hint: o.hint, katex: o.katex, locale: o.locale, play: true };
    const order = deck.slides.map((s, i) => ({ s, i })).filter((x) => o.withHidden || !x.s.hidden);
    const list = order.length ? order : deck.slides.map((s, i) => ({ s, i }));
    const root = el('div', `ns-show ${o.mode === 'full' ? 'ns-full' : 'ns-viewer'}`);
    root.tabIndex = 0;
    const stage = el('div', 'ns-stage');
    const frame = el('div', 'ns-frame');
    frame.style.width = px(W);
    frame.style.height = px(SH);
    stage.appendChild(frame);
    const blankEl = el('div', 'ns-blank');
    stage.appendChild(blankEl);
    const gridEl = el('div', 'ns-grid');
    const bar = el('div', 'ns-bar');
    const count = el('span', 'ns-count');
    const prevB = button('prev', words.prev, () => prev());
    const nextB = button('next', words.next, () => next());
    bar.append(prevB, count, nextB, button('grid', words.grid, () => grid()));
    // The presenter's tools, while the slideshow fills the screen.
    const laserB = button('laser', words.laser, () => setTool(tool === 'laser' ? null : 'laser'));
    const penB = button('pen', words.pen, () => setTool(tool === 'pen' ? null : 'pen'));
    const capB = button('captions', words.captions, () => captions(!capOn));
    const pens = el('span', 'ns-pens');
    const PENS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#111111'];
    let penColor = PENS[0];
    for (const c of PENS) {
      const b = el('button', 'ns-pen');
      b.type = 'button';
      b.style.background = c;
      b.setAttribute('aria-label', c);
      if (c === penColor) b.classList.add('ns-on');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        penColor = c;
        for (const x of Array.from(pens.querySelectorAll('.ns-pen'))) x.classList.toggle('ns-on', x === b);
      });
      pens.appendChild(b);
    }
    pens.appendChild(button('erase', words.erase, () => erase()));
    for (const b of [laserB, penB, capB]) b.classList.add('ns-tool');
    bar.append(laserB, penB, pens, capB);
    if (o.mode === 'viewer') {
      bar.insertBefore(el('span', 'ns-gap'), prevB);
      bar.appendChild(el('span', 'ns-gap'));
      bar.appendChild(
        button('full', words.full, () => {
          const d = host.ownerDocument;
          if (d.fullscreenElement) void d.exitFullscreen?.();
          else void root.requestFullscreen?.().catch(() => {});
        }),
      );
    } else bar.appendChild(button('exit', words.exit, () => o.onExit?.()));
    root.append(stage, gridEl, bar);
    host.appendChild(root);

    let pos = Math.max(0, list.findIndex((x) => x.i === (o.at ?? list[0].i)));
    let step = 0;
    let layer: HTMLElement | null = null;
    /** Effects waiting for their start (a timer each), and those moving now. */
    let pending: { timer: number; done: () => void }[] = [];
    let running: Animation[] = [];
    let autoTimer = 0;
    let ended = false;
    let endEl: HTMLElement | null = null;
    /** The deck's slide drawn in `layer` (Morph needs the one it comes from). */
    let layerAt = -1;
    /** How the slide's frame is scaled and placed in the stage. */
    let fk = 1;
    let fx = 0;
    let fy = 0;
    // The page fills a window of its own (its address, a published copy, a file), rather than growing with what it holds.
    const filled = o.mode === 'full' || ((win as unknown as { hydor?: { fill?: boolean } }).hydor?.fill ?? win.parent === win);

    const layout = () => {
      const r = stage.getBoundingClientRect();
      let w = r.width;
      let h = r.height;
      if (o.mode === 'viewer') {
        w = root.clientWidth;
        h = (w * SH) / W;
        if (filled) {
          const room = Math.max(120, win.innerHeight - bar.offsetHeight - 24);
          if (h > room) {
            h = room;
            w = (h * W) / SH;
          }
        }
        stage.style.width = px(w);
        stage.style.height = px(h);
        stage.style.margin = '0 auto';
      }
      const k = Math.min(w / W, h / SH) || 0.01;
      frame.style.transform = `scale(${k})`;
      frame.style.left = px((w - W * k) / 2);
      frame.style.top = px((h - SH * k) / 2);
      fk = k;
      fx = (w - W * k) / 2;
      fy = (h - SH * k) / 2;
      showLaser();
    };
    const ro = new ResizeObserver(layout);
    ro.observe(o.mode === 'viewer' ? root : stage);
    win.addEventListener('resize', layout);

    /** Everything moving or waiting ends at once, as it would end. */
    const settle = () => {
      const wait = pending;
      pending = [];
      for (const p of wait) {
        win.clearTimeout(p.timer);
        p.done();
      }
      const moving = running;
      running = [];
      for (const a of moving) {
        try {
          a.finish();
        } catch {}
      }
    };
    const tell = () => {
      const cur = list[pos];
      count.textContent = `${pos + 1} / ${list.length}`;
      prevB.disabled = pos === 0 && step === 0;
      nextB.disabled = ended;
      for (const th of Array.from(gridEl.children)) th.classList.toggle('ns-cur', (th as HTMLElement).dataset.i === String(cur.i));
      o.onMove?.(cur.i, step);
    };
    const scheduleAuto = () => {
      win.clearTimeout(autoTimer);
      const s = list[pos]?.s;
      const t = s?.transition?.auto;
      if (!t || step < plan(s).groups) return;
      autoTimer = win.setTimeout(() => {
        if (!running.length && !pending.length) next();
        else scheduleAuto();
      }, t * 1000);
    };
    const reduced = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const playGroup = (g: number) => {
      const s = list[pos].s;
      const { fx } = plan(s);
      for (const f of fx.filter((x) => x.group === g)) {
        const t = layer ? targetOf(layer, f) : null;
        if (!t) continue;
        const out = f.a.type === 'out';
        const grow = f.a.fx === 'grow';
        const end = () => {
          if (out) t.classList.add('ns-hidden');
          if (grow) t.style.scale = '1.2';
        };
        const run = () => {
          if (f.a.type === 'in') t.classList.remove('ns-hidden');
          if (f.a.fx === 'appear' || reduced()) return end();
          const an = t.animate(keyframes(f, t, deck), { duration: Math.max(1, n(f.a.dur, 500)), easing: f.a.fx === 'bounce' ? 'linear' : 'cubic-bezier(.2,.7,.3,1)', fill: out || grow ? 'forwards' : 'none' });
          running.push(an);
          let over = false;
          const finish = () => {
            if (over) return;
            over = true;
            end();
            running = running.filter((x) => x !== an);
            if (out || grow) an.cancel();
            if (!running.length && !pending.length) scheduleAuto();
          };
          an.onfinish = finish;
          an.oncancel = finish;
        };
        const at = f.begin + n(f.a.delay, 0);
        if (at <= 0) run();
        else {
          const p = { timer: 0, done: () => (f.a.type === 'in' && t.classList.remove('ns-hidden'), end()) };
          p.timer = win.setTimeout(() => {
            pending = pending.filter((x) => x !== p);
            run();
          }, at);
          pending.push(p);
        }
      }
      if (!running.length && !pending.length) scheduleAuto();
    };
    /** Videos that play by themselves, as their slide shows. */
    const autoplay = (root: HTMLElement, s: Slide) => {
      const walk = (els: El[]) => {
        for (const e of els ?? []) {
          if (e.type === 'group') walk(e.els);
          // An online player cannot run in a page of its own origin (a deck's page): there, only the app's own videos start.
          else if (e.type === 'video' && e.autoplay && (win.origin !== 'null' || !PLAYER.test(e.src))) {
            const box = root.querySelector<HTMLElement>(`.ns-el[data-id="${CSS.escape(e.id)}"] > .ns-video`);
            if (box) playVideo(box, e, pass);
          }
        }
      };
      walk(s.els);
    };
    /** Morph: what the two slides share glides from where it was (what it was fading into what it is); the rest fades. */
    const morph = (old: HTMLElement, l: HTMLElement, a: Slide | undefined, b: Slide, dur: number) => {
      const oldRoot = old.firstElementChild as HTMLElement | null;
      const newRoot = l.firstElementChild as HTMLElement | null;
      if (!a || !oldRoot || !newRoot) return old.remove();
      const opts: KeyframeAnimationOptions = { duration: dur, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' };
      const made: Animation[] = [];
      const ghosts: HTMLElement[] = [];
      // The new slide's background comes in over the old slide, which stays under it until the end.
      const bg = el('div', 'ns-bgimg');
      bg.style.background = newRoot.style.background;
      newRoot.style.background = 'transparent';
      newRoot.insertBefore(bg, newRoot.firstChild);
      const own = (x: HTMLElement) => (x.style.opacity === '' ? 1 : Number(x.style.opacity) || 0);
      const top = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`:scope > .ns-el[data-id="${CSS.escape(id)}"]`);
      const geo = (x: HTMLElement) => ({ x: parseFloat(x.style.left) || 0, y: parseFloat(x.style.top) || 0, w: parseFloat(x.style.width) || 1, h: parseFloat(x.style.height) || 1, r: parseFloat(x.style.rotate) || 0 });
      // A part with geometry `g`, shown as one with `h`'s: moved, turned and stretched there.
      const as = (g: ReturnType<typeof geo>, h: ReturnType<typeof geo>) => ({ translate: `${g.x + g.w / 2 - (h.x + h.w / 2)}px ${g.y + g.h / 2 - (h.y + h.h / 2)}px`, rotate: `${g.r}deg`, scale: `${g.w / h.w} ${g.h / h.h}` });
      const matched = new Set<Element>();
      for (const [ea, eb] of morphPairs(a, b)) {
        const na = top(oldRoot, ea.id);
        const nb = top(newRoot, eb.id);
        if (!na || !nb) continue;
        matched.add(nb);
        const ga = geo(na);
        const gb = geo(nb);
        const ghost = na.cloneNode(true) as HTMLElement;
        nb.before(ghost);
        ghosts.push(ghost);
        // It moves on as the ghost: none of it stays behind on the old slide.
        na.style.visibility = 'hidden';
        made.push(ghost.animate([{ translate: '0px 0px', rotate: `${ga.r}deg`, scale: '1 1' }, as(gb, ga)], opts));
        made.push(
          nb.animate(
            [
              { ...as(ga, gb), opacity: 0 },
              { translate: '0px 0px', rotate: `${gb.r}deg`, scale: '1 1', opacity: own(nb) },
            ],
            opts,
          ),
        );
      }
      for (const x of Array.from(newRoot.children) as HTMLElement[]) {
        if (x === bg || matched.has(x) || ghosts.includes(x)) continue;
        made.push(x.animate([{ opacity: 0 }, { opacity: own(x) }], opts));
      }
      made.push(bg.animate([{ opacity: 0 }, { opacity: 1 }], opts));
      running.push(...made);
      let over = false;
      const finish = () => {
        if (over) return;
        over = true;
        running = running.filter((x) => !made.includes(x));
        for (const g of ghosts) g.remove();
        newRoot.style.background = bg.style.background;
        bg.remove();
        old.remove();
        for (const x of made) {
          try {
            x.cancel();
          } catch {}
        }
        if (!running.length && !pending.length) scheduleAuto();
      };
      const last = made[made.length - 1];
      last.onfinish = finish;
      last.oncancel = finish;
    };
    const draw = (animateFrom: HTMLElement | null, drawStep: number) => {
      const s = list[pos].s;
      const fromAt = layerAt;
      const next = slide(deck, list[pos].i, { ...pass, step: drawStep });
      const l = el('div', 'ns-layer');
      l.appendChild(next);
      frame.insertBefore(l, inkSvg);
      fit(next);
      layer = l;
      layerAt = list[pos].i;
      for (const old of Array.from(frame.querySelectorAll(':scope > .ns-layer'))) if (old !== l && old !== animateFrom) old.remove();
      autoplay(next, s);
      if (!animateFrom) return;
      const tr = s.transition;
      const old = animateFrom;
      if (!tr || tr.fx === 'none' || reduced()) return old.remove();
      if (tr.fx === 'morph') return morph(old, l, deck.slides[fromAt], s, Math.max(1, n(tr.dur, 1000)));
      const side = tr.dir ?? 'right';
      const off = side === 'right' ? '100% 0' : side === 'left' ? '-100% 0' : side === 'up' ? '0 -100%' : '0 100%';
      const back = side === 'right' ? '-100% 0' : side === 'left' ? '100% 0' : side === 'up' ? '0 100%' : '0 -100%';
      const opts: KeyframeAnimationOptions = { duration: Math.max(1, n(tr.dur, 600)), easing: 'cubic-bezier(.4,0,.2,1)', fill: 'none' };
      let a: Animation;
      if (tr.fx === 'fade') a = l.animate([{ opacity: 0 }, { opacity: 1 }], opts);
      else if (tr.fx === 'push') {
        old.animate([{ translate: '0 0' }, { translate: back }], opts);
        a = l.animate([{ translate: off }, { translate: '0 0' }], opts);
      } else if (tr.fx === 'cover') a = l.animate([{ translate: off }, { translate: '0 0' }], opts);
      else if (tr.fx === 'wipe') {
        const from = side === 'right' ? 'inset(0 0 0 100%)' : side === 'left' ? 'inset(0 100% 0 0)' : side === 'up' ? 'inset(0 0 100% 0)' : 'inset(100% 0 0 0)';
        a = l.animate([{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }], opts);
      } else if (tr.fx === 'zoom') a = l.animate([{ opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1 }], opts);
      else a = l.animate([{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }], opts);
      running.push(a);
      let over = false;
      const finish = () => {
        if (over) return;
        over = true;
        old.remove();
        running = running.filter((x) => x !== a);
        if (!running.length && !pending.length) scheduleAuto();
      };
      a.onfinish = finish;
      a.oncancel = finish;
    };
    const go = (i: number, st = 0, animate = false) => {
      settle();
      win.clearTimeout(autoTimer);
      endEl?.remove();
      endEl = null;
      ended = false;
      const p = list.findIndex((x) => x.i === i);
      if (p < 0) return;
      // The pen's lines are for the slide they were drawn on.
      if (list[p].i !== layerAt) erase();
      const from = animate && layer ? layer : null;
      pos = p;
      const pl = plan(list[pos].s);
      step = Math.max(0, Math.min(st, pl.groups));
      // What plays by itself as the slide comes starts hidden, then plays.
      const autoPlay = animate && step === 0 && pl.auto;
      draw(from, autoPlay ? -1 : step);
      if (autoPlay) playGroup(0);
      else if (!running.length) scheduleAuto();
      tell();
    };
    const next = () => {
      // A click while things move finishes them.
      if (running.length || pending.length) return settle();
      if (ended) return o.onExit?.();
      const s = list[pos].s;
      if (step < plan(s).groups) {
        step++;
        playGroup(step);
        tell();
        return;
      }
      if (pos < list.length - 1) return go(list[pos + 1].i, 0, true);
      if (o.mode === 'full') {
        ended = true;
        endEl = el('div', 'ns-end');
        endEl.textContent = words.end;
        stage.appendChild(endEl);
        tell();
      }
    };
    const prev = () => {
      if (ended) return go(list[pos].i, plan(list[pos].s).groups);
      settle();
      if (step > 0) {
        step--;
        if (layer) applyState(layer.firstElementChild as HTMLElement, list[pos].s, step);
        tell();
        return;
      }
      if (pos > 0) go(list[pos - 1].i, plan(list[pos - 1].s).groups);
    };
    const blank = (c: 'black' | 'white' | null) => {
      blankEl.style.display = c ? 'block' : 'none';
      blankEl.style.background = c === 'white' ? '#fff' : '#000';
    };
    let gridMade = false;
    const grid = (on?: boolean) => {
      const want = on ?? !root.classList.contains('ns-gridon');
      if (want && !gridMade) {
        gridMade = true;
        for (const x of list) {
          const th = el('div', 'ns-thumb');
          th.dataset.i = String(x.i);
          th.style.aspectRatio = `${W} / ${SH}`;
          const sl = slide(deck, x.i, { asset: o.asset, web: o.web, video: o.video, katex: o.katex, locale: o.locale });
          sl.style.transformOrigin = '0 0';
          sl.style.position = 'absolute';
          th.appendChild(sl);
          const num = el('span');
          num.textContent = String(list.indexOf(x) + 1);
          th.appendChild(num);
          th.addEventListener('click', (e) => {
            e.stopPropagation();
            grid(false);
            go(x.i, 0);
          });
          gridEl.appendChild(th);
          new ResizeObserver(() => {
            sl.style.transform = `scale(${th.clientWidth / W})`;
          }).observe(th);
        }
        win.requestAnimationFrame(() => fit(gridEl));
      }
      root.classList.toggle('ns-gridon', want);
      tell();
      layout();
    };

    // ---- the presenter's tools: a laser pointer, a pen, live captions -------------------------------------------------
    const inkSvg = svg('svg', { class: 'ns-ink', viewBox: `0 0 ${W} ${SH}`, preserveAspectRatio: 'none' });
    frame.appendChild(inkSvg);
    const laserEl = el('div', 'ns-laser');
    const capEl = el('div', 'ns-cap');
    stage.append(laserEl, capEl);
    let tool: 'laser' | 'pen' | null = null;
    let strokes: Marks['ink'] = [];
    let drawing: { c: string; p: number[]; node: SVGElement } | null = null;
    let laserAt: [number, number] | null = null;
    let caption = '';
    let capOn = false;
    let rec: { start(): void; abort(): void; onresult: unknown; onerror: unknown; onend: unknown; continuous: boolean; interimResults: boolean; lang: string } | null = null;
    let flashTimer = 0;
    let marksFrame = 0;
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const line = (c: string, p: number[]) => svg('polyline', { points: p.join(' '), fill: 'none', stroke: /^#[0-9a-f]{6}$/i.test(c) ? c : '#ff3b30', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const tellMarks = () => {
      if (!o.onMarks || marksFrame) return;
      marksFrame = win.requestAnimationFrame(() => {
        marksFrame = 0;
        o.onMarks?.({ laser: laserAt, ink: [...strokes, ...(drawing ? [{ c: drawing.c, p: drawing.p }] : [])], caption });
      });
    };
    function showLaser() {
      if (!laserEl) return;
      laserEl.style.display = laserAt ? 'block' : 'none';
      if (laserAt) {
        laserEl.style.left = px(fx + laserAt[0] * fk);
        laserEl.style.top = px(fy + laserAt[1] * fk);
      }
    }
    const setCaption = (t: string) => {
      caption = t;
      capEl.textContent = t;
      capEl.style.display = t ? 'block' : 'none';
      tellMarks();
    };
    const flash = (t: string) => {
      setCaption(t);
      win.clearTimeout(flashTimer);
      flashTimer = win.setTimeout(() => caption === t && setCaption(''), 3500);
    };
    function erase() {
      strokes = [];
      drawing = null;
      if (inkSvg) inkSvg.textContent = '';
      tellMarks();
    }
    function setTool(t: 'laser' | 'pen' | null) {
      tool = t;
      root.classList.toggle('ns-lasering', t === 'laser');
      root.classList.toggle('ns-pening', t === 'pen');
      laserB.classList.toggle('ns-on', t === 'laser');
      penB.classList.toggle('ns-on', t === 'pen');
      stage.style.touchAction = t === 'pen' ? 'none' : '';
      if (t !== 'laser') {
        laserAt = null;
        showLaser();
      }
      tellMarks();
    }
    function captions(on: boolean) {
      const SR =
        (win as unknown as { SpeechRecognition?: new () => NonNullable<typeof rec>; webkitSpeechRecognition?: new () => NonNullable<typeof rec> }).SpeechRecognition ??
        (win as unknown as { webkitSpeechRecognition?: new () => NonNullable<typeof rec> }).webkitSpeechRecognition;
      if (!on || !SR) {
        capOn = false;
        capB.classList.remove('ns-on');
        const r = rec;
        rec = null;
        try {
          r?.abort();
        } catch {}
        if (on && !SR) flash(words.noCaptions);
        else setCaption('');
        return;
      }
      capOn = true;
      capB.classList.add('ns-on');
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = o.locale || doc.documentElement.lang || navigator.language || 'en-US';
      let said = '';
      r.onresult = (ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => {
        let now = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const x = ev.results[i];
          if (x.isFinal) said += `${x[0].transcript} `;
          else now += x[0].transcript;
        }
        if (said.length > 4000) said = said.slice(-600);
        const text = `${said}${now}`.replace(/\s+/g, ' ').trim();
        setCaption(text.length > 150 ? `…${text.slice(-150).replace(/^\S*\s/, '')}` : text);
      };
      r.onerror = (ev: { error?: string }) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') {
          captions(false);
          flash(words.noCaptions);
        }
      };
      // It stops on its own after a silence: listen again while captions are on.
      r.onend = () => {
        if (capOn && rec === r)
          try {
            r.start();
          } catch {}
      };
      rec = r;
      try {
        r.start();
        flash(words.listening);
      } catch {
        captions(false);
        flash(words.noCaptions);
      }
    }
    const toSlide = (e: PointerEvent): [number, number] => {
      const r = stage.getBoundingClientRect();
      return [r1((e.clientX - r.left - fx) / fk), r1((e.clientY - r.top - fy) / fk)];
    };
    stage.addEventListener('pointerdown', (e) => {
      if (tool !== 'pen' || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {}
      const p = toSlide(e);
      const node = line(penColor, p);
      inkSvg.appendChild(node);
      drawing = { c: penColor, p: [...p], node };
    });
    stage.addEventListener('pointermove', (e) => {
      if (tool === 'laser') {
        laserAt = toSlide(e);
        showLaser();
        tellMarks();
      } else if (tool === 'pen' && drawing) {
        const [x, y] = toSlide(e);
        const p = drawing.p;
        if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 1.5) return;
        p.push(x, y);
        drawing.node.setAttribute('points', p.join(' '));
        tellMarks();
      }
    });
    const endStroke = () => {
      if (!drawing) return;
      strokes.push({ c: drawing.c, p: drawing.p });
      drawing = null;
      tellMarks();
    };
    stage.addEventListener('pointerup', endStroke);
    stage.addEventListener('pointercancel', endStroke);
    stage.addEventListener('pointerleave', () => {
      if (tool !== 'laser') return;
      laserAt = null;
      showLaser();
      tellMarks();
    });
    /** Another slideshow's marks shown here (the presenter's, in the audience's window). */
    const marks = (m: Marks) => {
      laserAt = Array.isArray(m?.laser) && m.laser.length === 2 && m.laser.every((v) => typeof v === 'number' && Number.isFinite(v)) ? [m.laser[0], m.laser[1]] : null;
      showLaser();
      inkSvg.textContent = '';
      for (const st of Array.isArray(m?.ink) ? m.ink.slice(0, 500) : []) {
        const pts = Array.isArray(st?.p) ? st.p.filter((v) => typeof v === 'number' && Number.isFinite(v)).slice(0, 20000) : [];
        if (pts.length >= 2) inkSvg.appendChild(line(typeof st.c === 'string' ? st.c : '', pts));
      }
      const c = typeof m?.caption === 'string' ? m.caption.slice(0, 400) : '';
      capEl.textContent = c;
      capEl.style.display = c ? 'block' : 'none';
    };

    // Clicks, keys, swipes.
    stage.addEventListener('click', (e) => {
      // The pen draws: its clicks are not the slideshow's.
      if (tool === 'pen') return;
      const linkEl = (e.target as HTMLElement).closest<HTMLElement>('[data-link], a[href]');
      if (linkEl) {
        const h = linkEl.dataset.link ?? linkEl.getAttribute('href') ?? '';
        const m = /^#(\d{1,3})$/.exec(h);
        e.preventDefault();
        e.stopPropagation();
        if (m) {
          const target = deck.slides[Number(m[1]) - 1];
          if (target) go(deck.slides.indexOf(target), 0, true);
        } else if (href(h)) win.open(h, '_blank', 'noopener,noreferrer');
        return;
      }
      if (o.mode === 'viewer' || !(e as PointerEvent).pointerType || (e as PointerEvent).pointerType === 'mouse') {
        const r = stage.getBoundingClientRect();
        if (e.clientX - r.left < r.width * 0.25) prev();
        else next();
      }
    });
    let touch: { x: number; y: number; t: number } | null = null;
    stage.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      touch = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (!touch || tool === 'pen') return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touch.x;
      const dy = t.clientY - touch.y;
      const quick = Date.now() - touch.t < 600;
      touch = null;
      if (quick && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        e.preventDefault();
        if (dx < 0) next();
        else prev();
      } else if (o.mode === 'full' && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        if (t.clientX - r.left < r.width * 0.3) prev();
        else next();
      }
    });
    let typed = '';
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
      const k = e.key;
      // Space on a video that was clicked plays or pauses it (its own controls'), and the slideshow stays.
      if (tag === 'VIDEO' && k === ' ') return;
      let hit = true;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'n' || k === 'N') {
        if (typed) {
          typed = '';
        }
        next();
      } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') prev();
      else if (k === 'l' || k === 'L') setTool(tool === 'laser' ? null : 'laser');
      else if (k === 'p' || k === 'P') setTool(tool === 'pen' ? null : 'pen');
      else if (k === 'e' || k === 'E') erase();
      else if (k === 'c' || k === 'C') captions(!capOn);
      else if (k === 'Enter') {
        if (typed) {
          const target = list[Math.min(list.length, Math.max(1, Number(typed))) - 1];
          typed = '';
          if (target) go(target.i, 0, true);
        } else next();
      } else if (k === 'Home') go(list[0].i);
      else if (k === 'End') go(list[list.length - 1].i, Infinity);
      else if (k === 'b' || k === 'B' || k === '.') blank(blankEl.style.display === 'block' ? null : 'black');
      else if (k === 'w' || k === 'W' || k === ',') blank(blankEl.style.display === 'block' ? null : 'white');
      else if (k === 'g' || k === 'G') grid();
      else if (/^\d$/.test(k)) typed += k;
      else if (k === 'Escape') {
        if (tool) setTool(null);
        else if (root.classList.contains('ns-gridon')) grid(false);
        else if (blankEl.style.display === 'block') blank(null);
        else if (o.mode === 'full') o.onExit?.();
        else hit = false;
      } else hit = false;
      if (hit) e.preventDefault();
    };
    const keyTarget: Window | HTMLElement = o.keys === false ? root : win;
    keyTarget.addEventListener('keydown', onKey as EventListener);
    // In full mode the controls show while the pointer moves, and go when it rests.
    let wake = 0;
    const awake = () => {
      root.classList.add('ns-awake');
      win.clearTimeout(wake);
      wake = win.setTimeout(() => root.classList.remove('ns-awake'), 2200);
    };
    if (o.mode === 'full') root.addEventListener('pointermove', awake);
    // Fonts arriving change how much fits.
    const refit = () => {
      fitCache.clear();
      if (layer) fit(layer);
    };
    host.ownerDocument.fonts?.addEventListener?.('loadingdone', refit);

    go(list[pos].i, o.step ?? 0);
    layout();
    if (o.mode === 'full') {
      awake();
      root.focus({ preventScroll: true });
    }
    return {
      go: (i, st = 0) => go(i, st, true),
      next,
      prev,
      at: () => ({ i: list[pos].i, step, steps: plan(list[pos].s).groups }),
      blank,
      grid,
      marks,
      destroy: () => {
        captions(false);
        win.clearTimeout(flashTimer);
        if (marksFrame) win.cancelAnimationFrame(marksFrame);
        pending.forEach((p) => win.clearTimeout(p.timer));
        pending = [];
        for (const a of running) a.cancel();
        running = [];
        win.clearTimeout(autoTimer);
        win.clearTimeout(wake);
        ro.disconnect();
        win.removeEventListener('resize', layout);
        keyTarget.removeEventListener('keydown', onKey as EventListener);
        host.ownerDocument.fonts?.removeEventListener?.('loadingdone', refit);
        root.remove();
      },
    };
  };

  // ---- printing ----------------------------------------------------------------------------------------------------
  const print = (host: HTMLElement, deck: Deck, o: DrawOpts = {}) => {
    style(host.ownerDocument);
    const SH = H(deck);
    const box = el('div', 'ns-print');
    const sheet = host.ownerDocument.createElement('style');
    sheet.textContent = `@page{size:${W}px ${SH}px;margin:0}@media print{html,body{margin:0!important;padding:0!important;background:none!important}}`;
    box.appendChild(sheet);
    deck.slides.forEach((s, i) => {
      if (s.hidden) return;
      const pg = el('div', 'ns-pg');
      pg.style.width = px(W);
      pg.style.height = px(SH);
      pg.appendChild(slide(deck, i, o));
      box.appendChild(pg);
    });
    host.appendChild(box);
    host.classList.add('ns-printing');
    fit(box);
  };

  // ---- a deck's own page --------------------------------------------------------------------------------------------
  /**
   * The page's equations as the server drew them with its own KaTeX: what the server made of each formula (never the
   * deck's own words) goes in as it is. A formula it did not draw shows as its LaTeX.
   */
  const maths = (): KatexLike | undefined => {
    let drawn: Record<string, unknown> = {};
    try {
      drawn = JSON.parse(doc.getElementById('n-math')?.textContent ?? '{}') ?? {};
    } catch {}
    if (!drawn || typeof drawn !== 'object' || !Object.keys(drawn).length) return undefined;
    return {
      render(tex, into) {
        const html = Object.prototype.hasOwnProperty.call(drawn, tex) ? drawn[tex] : undefined;
        if (typeof html !== 'string') throw new Error('Not drawn');
        into.innerHTML = html;
      },
    };
  };

  const boot = (cfg: { mode: 'viewer' | 'print' | 'still' }) => {
    const data = doc.getElementById('n-deck');
    let deck: Deck;
    try {
      deck = JSON.parse(data?.textContent ?? '');
    } catch {
      doc.body.textContent = 'This deck could not be read.';
      return;
    }
    style();
    const body = doc.body;
    // Its equations, drawn by the server (an older page loaded KaTeX itself, which the runtime finds on the window).
    const katex = maths();
    if (cfg.mode === 'still') {
      const first = Math.max(0, deck.slides.findIndex((x) => !x.hidden));
      const one = slide(deck, first, { katex });
      body.style.margin = '0';
      body.appendChild(one);
      fit(one);
      doc.fonts?.ready.then(() => {
        fitCache.clear();
        fit(one);
      });
      return;
    }
    if (cfg.mode === 'print') {
      print(body, deck, { katex });
      // Shown, not only in print: laid out, its words fitted, and its fonts and pictures loaded before it prints (hidden until
      // then, a PDF would have none of the equations, nor the stills of videos from the web).
      body.querySelector('.ns-print')?.classList.add('ns-onscreen');
      fit(body);
      doc.fonts?.ready.then(() => {
        fitCache.clear();
        fit(body);
      });
      return;
    }
    const wrap = el('div', 'ns-wrap');
    body.appendChild(wrap);
    if ((win as unknown as { hydor?: { fill?: boolean } }).hydor?.fill ?? win.parent === win) body.classList.add('ns-filled');
    const s = show(wrap, deck, { mode: 'viewer', keys: true, katex });
    // Printing from the page: every slide, a page each.
    let printed = false;
    win.addEventListener('beforeprint', () => {
      if (printed) return;
      printed = true;
      print(body, deck, { katex });
    });
    // In full screen the slideshow takes the whole screen, its controls on hover.
    doc.addEventListener('fullscreenchange', () => {
      const root = wrap.querySelector<HTMLElement>('.ns-show');
      if (!root) return;
      const on = !!doc.fullscreenElement;
      root.classList.toggle('ns-full', on);
      root.classList.toggle('ns-viewer', !on);
      const stage = root.querySelector<HTMLElement>('.ns-stage');
      if (stage && on) {
        stage.style.width = '';
        stage.style.height = '';
      }
      win.dispatchEvent(new Event('resize'));
    });
    doc.fonts?.ready.then(() => {
      const st = s.at();
      s.go(st.i, st.step);
    });
  };

  return { css, style, slide, part, words, fit, read, show, print, steps, morphPairs, boot, maths };
}
