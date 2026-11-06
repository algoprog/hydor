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
//
// The web format's parts draw here too: code coloured by a small tokenizer of the runtime's own; quizzes answered in
// the slideshow (their answers kept for the show, the score counted for its score parts); and the live parts (custom
// code, web pages, 3D), each a page of its own in a sandboxed frame (the app's frame at /partframe, else a srcdoc
// frame with scripts and no origin of its own), its poster where they do not run. A live part's page gets the deck's
// colours and fonts as CSS variables and `window.deck`, a bridge over postMessage: told when its slide comes and
// goes and its build steps on, it may go to the next slide, the one before or any. Effects that tell words or
// letters, draw lines, count numbers up and burst confetti, taps (a click on a part runs effects of its own),
// transitions that turn and open the slides, backgrounds that move in the theme's colours, shining text, frosted glass,
// parts that answer the pointer and a progress bar are the slideshow's too.
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
  /** Videos play when clicked, quizzes are answered, parts answer the pointer and taps run (the slideshow). */
  play?: boolean;
  /**
   * The web format's live parts (custom code, web pages, 3D) run, each in a frame of its own (the slideshow, the
   * deck's page, a part the editor runs); without, their posters show (or a calm placeholder that says what they are).
   */
  live?: boolean;
  /**
   * Makes a live part's frame for its page (`html`, a whole document): the app's, an iframe at /partframe sent the
   * page by postMessage once it says it is ready. Returns the iframe (or an element holding one). Without it the
   * runtime makes a sandboxed srcdoc frame (sandbox="allow-scripts", no origin of its own).
   */
  frame?: (html: string, part: El) => HTMLElement;
  /** Moving backgrounds move (the slideshow's do; an editor's preview of one may). */
  motion?: boolean;
  /** The slideshow's quiz answers, kept while it lasts (the score parts count them). */
  answers?: QuizAnswers;
}

/** One quiz's answer in a slideshow: the choices picked (by their place), whether it is answered (checked), and right. */
export interface QuizAnswer {
  picks: number[];
  done: boolean;
  right: boolean;
}

/** A slideshow's quiz answers by the quiz's id, and its score. */
export interface QuizAnswers {
  get(id: string): QuizAnswer | undefined;
  set(id: string, a: QuizAnswer): void;
  /** How many quizzes were answered right, and how many count. */
  score(): { right: number; total: number };
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
  /** Code as runs of words, each with what it is ('k' keyword, 's' string, 'c' comment, 'n' number, 'f' function, 't' type, 'g' tag, 'a' attribute or key; '' plain). */
  tokens(code: string, lang?: string): [string, string][];
  /** A code part's colours in a look (dark, light, the deck's): its background, its words, and each kind of word's. */
  codeLook(look: string | undefined, t: Theme): CodeLook;
}

/** The colours code shows in: its box, its plain words, each kind of word's (CodeLook[kind]), its line numbers, a lit line's band. */
export type CodeLook = Record<'bg' | 'fg' | 'k' | 's' | 'c' | 'n' | 'f' | 't' | 'g' | 'a' | 'gutter' | 'lit', string>;

/** Names of fonts with their CSS families, which the runtime is given (it cannot import). */
export type FontTable = Record<string, { css: string; google?: boolean }>;

/** Where the runtime loads what its live parts need: three.js (its folder on jsDelivr, at a pinned version). */
export interface RuntimeLibs {
  three?: string;
}

/** three.js for 3D parts when the runtime is given none (shared/app-media.ts pins the same; a test checks they agree). */
export const THREE_DEFAULT = 'https://cdn.jsdelivr.net/npm/three@0.187.0/';

export function slidesRuntime(win: Window, fonts: FontTable, libs: RuntimeLibs = {}): SlidesRuntime {
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
  /** A link to a slide of the deck: by its number, or the next, the one before, the first, the last. */
  const SLIDE_LINK = /^#(\d{1,3}|next|prev|first|last)$/;
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
    // Code: its lines as an editor shows them, numbered and lit where asked.
    '.ns-code{position:absolute;inset:0;overflow:hidden;padding:.85em 1.1em;line-height:1.5;white-space:pre;tab-size:4;-moz-tab-size:4;font-variant-ligatures:none;text-align:left}',
    '.ns-cl{min-height:1.5em;position:relative}.ns-cl.ns-dim{opacity:.36}.ns-cl.ns-lit::before{content:"";position:absolute;left:-1.1em;right:-1.1em;top:0;bottom:0;background:var(--lit);z-index:-1}',
    '.ns-code{isolation:isolate}.ns-ln{display:inline-block;min-width:2em;margin-right:1.1em;text-align:right;user-select:none;-webkit-user-select:none}',
    // A quiz: its question, its choices (a column, or a grid of two), and once answered what was right.
    '.ns-quiz{position:absolute;inset:0;display:flex;flex-direction:column;gap:.5em;line-height:1.25;text-align:left}',
    '.ns-qq{font-weight:700;white-space:pre-wrap;overflow-wrap:break-word}',
    '.ns-qcs{display:grid;grid-template-columns:1fr;gap:.35em;font-size:.78em}.ns-qcs[data-layout=grid]{grid-template-columns:1fr 1fr}',
    '.ns-qc{display:flex;align-items:center;gap:.75em;min-height:2.35em;padding:.5em .8em;border-radius:.5em;border:2px solid transparent;font:inherit;color:inherit;text-align:left;background:var(--qfill);position:relative;box-sizing:border-box;width:100%;margin:0;line-height:1.25}',
    'button.ns-qc{cursor:pointer;appearance:none;-webkit-appearance:none}button.ns-qc:disabled{cursor:default}',
    '.ns-ql{flex:none;display:inline-flex;align-items:center;justify-content:center;width:1.7em;height:1.7em;border-radius:50%;font-weight:700;font-size:.85em;background:var(--qmark);color:var(--qmarkfg)}',
    '.ns-qt{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:break-word}',
    '.ns-qc.ns-pick{border-color:var(--qmark)}.ns-qc.ns-right{border-color:#1f9d55;background:color-mix(in srgb,#1f9d55 18%,var(--qfill))}.ns-qc.ns-right .ns-ql{background:#1f9d55;color:#fff}',
    '.ns-qc.ns-wrong{border-color:#d64545;background:color-mix(in srgb,#d64545 16%,var(--qfill))}.ns-qc.ns-wrong .ns-ql{background:#d64545;color:#fff}.ns-qc.ns-missed{border-color:#1f9d55;border-style:dashed}',
    '.ns-qc.ns-key::after{content:"✓";position:absolute;right:.7em;font-weight:700;color:#1f9d55}',
    '.ns-qf{font-size:.66em;white-space:pre-wrap;opacity:.9;min-height:0}.ns-qf:empty{display:none}.ns-qf b{font-weight:700}',
    '.ns-qcheck{align-self:flex-start;font:inherit;font-size:.66em;font-weight:600;padding:.4em 1.1em;border-radius:999px;border:0;cursor:pointer;background:var(--qmark);color:var(--qmarkfg)}',
    '.ns-score{position:absolute;inset:0;display:flex;align-items:center;white-space:pre-wrap;overflow-wrap:break-word;line-height:1.2}',
    // The web format's live parts: their frame, or their poster (or a quiet placeholder) where they do not run.
    '.ns-live{position:absolute;inset:0;overflow:hidden}',
    '.ns-live>iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;color-scheme:normal}',
    '.ns-liveph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border-radius:inherit;font:500 20px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:12px;overflow:hidden}',
    '.ns-liveph svg{width:44px;height:44px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:.8}',
    '.ns-liveph span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    // A part's words split to come one by one, confetti over the slide, a video behind it, the progress bar.
    '.ns-w,.ns-ch{display:inline-block;white-space:pre}',
    '.ns-gt .ns-p::before{-webkit-text-fill-color:var(--gt0)}',
    '.ns-confetti{position:absolute;left:0;top:0;pointer-events:none;z-index:3}',
    '.ns-bgvideo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}',
    '.ns-prog{position:absolute;left:0;top:0;height:6px;z-index:4;pointer-events:none}',
    // Parts that answer the pointer, in the slideshow (on devices with one).
    '@media (hover:hover){.ns-canplay .ns-el[data-hover]{transition:transform .22s cubic-bezier(.2,.7,.3,1),filter .22s}',
    '.ns-canplay .ns-el[data-hover=lift]:hover{transform:translateY(-8px);filter:drop-shadow(0 14px 18px rgba(0,0,0,.25))}',
    '.ns-canplay .ns-el[data-hover=grow]:hover{transform:scale(1.06)}',
    '.ns-canplay .ns-el[data-hover=glow]:hover{filter:drop-shadow(0 0 14px var(--n-glow,#7aa2ff)) drop-shadow(0 0 4px var(--n-glow,#7aa2ff))}',
    '.ns-canplay .ns-el[data-hover=tilt]{transition:transform .12s ease-out}}',
    // Backgrounds that move, in the theme's colours: still unless the slide is the slideshow's (and slower for those who ask for less motion).
    '.ns-bgfx{position:absolute;inset:0;overflow:hidden;pointer-events:none;--k:1}',
    '.ns-bgfx>*{position:absolute;will-change:transform}',
    '.ns-bgfx:not(.ns-moving) *{animation:none!important}',
    '@media (prefers-reduced-motion:reduce){.ns-bgfx{--k:4}}',
    '@keyframes ns-drift1{from{transform:translate(0,0) scale(1)}to{transform:translate(18%,12%) scale(1.25)}}',
    '@keyframes ns-drift2{from{transform:translate(0,0) scale(1.1) rotate(0)}to{transform:translate(-20%,8%) scale(.9) rotate(25deg)}}',
    '@keyframes ns-drift3{from{transform:translate(0,0) scale(1)}to{transform:translate(10%,-18%) scale(1.2)}}',
    '@keyframes ns-turn{from{transform:rotate(0) scale(1)}to{transform:rotate(30deg) scale(1.18)}}',
    '@keyframes ns-up{from{transform:translateY(0)}to{transform:translateY(-50%)}}',
    '@keyframes ns-twinkle{from{opacity:.25}to{opacity:1}}',
    '@keyframes ns-side{from{transform:translateX(0)}to{transform:translateX(-50%)}}',
    '@keyframes ns-cell{from{transform:translateY(0)}to{transform:translateY(64px)}}',
    '@keyframes ns-float{0%{transform:translate(0,0)}50%{transform:translate(4%,-9%)}100%{transform:translate(-3%,-16%)}}',
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
    const link = r.link ? (SLIDE_LINK.test(r.link) ? r.link : href(r.link)) : '';
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

  // ---- code: its words told apart, as an editor colours them ---------------------------------------------------
  // Each language: its keywords, what starts a comment to the end of the line and what goes round one, its quotes,
  // and whether its strings may be triple-quoted (Python), its keywords in any case (SQL), $names (the shell's) or
  // @decorators are names of their own.
  interface Lang {
    kw: string;
    line: string[];
    block: [string, string][];
    quotes: string;
    triple?: boolean;
    ci?: boolean;
    dollar?: boolean;
    at?: boolean;
  }
  const CONST = ' true false null undefined NaN Infinity nil None True False self this super';
  const JS = 'as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static switch throw try typeof var void while with yield';
  const TS = ' abstract any boolean declare enum implements interface keyof namespace never number private protected public readonly satisfies string symbol type unknown infer';
  const C = 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool';
  const CL = (kw: string, extra: Partial<Lang> = {}): Lang => ({ kw: kw + CONST, line: ['//'], block: [['/*', '*/']], quotes: '"\'', ...extra });
  const LANGS: Record<string, Lang> = {
    javascript: CL(JS, { quotes: '"\'`' }),
    typescript: CL(JS + TS, { quotes: '"\'`', at: true }),
    java: CL(`${C} abstract boolean byte catch class extends final finally implements import instanceof interface native new package private protected public synchronized throw throws transient try var record`, { at: true }),
    kotlin: CL('as break class continue do else for fun if in interface is object package return throw try typealias val var when while import data sealed override open private public internal lateinit companion suspend', { at: true }),
    csharp: CL(`${C} abstract as base bool byte catch class decimal delegate event explicit finally fixed foreach implicit in interface internal is lock namespace new object operator out override params private protected public readonly ref sbyte sealed string throw try uint ulong ushort using var virtual async await record`),
    c: CL(C),
    cpp: CL(`${C} class namespace template typename public private protected virtual override new delete try catch throw using constexpr nullptr auto noexcept std`),
    go: CL('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var string int bool error byte rune float64', { quotes: '"\'`' }),
    rust: CL('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return Self static struct trait type unsafe use where while i32 i64 u8 u32 u64 usize f64 str String Vec Option Some Result Ok Err'),
    swift: CL('as break case catch class continue default defer do else enum extension fallthrough for func guard if import in init inout internal is let private protected public repeat return static struct switch throw throws try var where while'),
    php: CL('abstract and array as break case catch class clone const continue declare default do echo else elseif empty extends final finally fn for foreach function global if implements include interface isset list namespace new or print private protected public require return static switch throw trait try unset use var while yield', { line: ['//', '#'], dollar: true }),
    dart: CL('abstract as async await break case catch class const continue default do else enum extends final finally for if import in is late new required return static super switch this throw try var void while with'),
    scala: CL('abstract case catch class def do else extends final finally for if implicit import lazy match new object override package private protected return sealed throw trait try type val var while with yield'),
    python: { kw: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case print' + CONST, line: ['#'], block: [], quotes: '"\'', triple: true, at: true },
    ruby: { kw: 'alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return then undef unless until when while yield require puts attr_accessor' + CONST, line: ['#'], block: [['=begin', '=end']], quotes: '"\'', at: true },
    bash: { kw: 'if then else elif fi for while until do done case esac function in return export local readonly echo exit source alias unset set shift cd sudo', line: ['#'], block: [], quotes: '"\'', dollar: true },
    powershell: { kw: 'begin break catch class continue data do dynamicparam else elseif end exit filter finally for foreach function if in param process return switch throw trap try until while', line: ['#'], block: [['<#', '#>']], quotes: '"\'', dollar: true, ci: true },
    sql: { kw: 'select from where and or not insert into values update set delete create table alter drop index view join left right inner outer full cross on as is null in exists group by order having limit offset union all distinct case when then else end primary key foreign references default with returning asc desc count sum avg min max like between begin commit rollback grant', line: ['--'], block: [['/*', '*/']], quotes: '\'"', ci: true },
    lua: { kw: 'and break do else elseif end for function goto if in local not or repeat return then until while' + CONST, line: ['--'], block: [['--[[', ']]']], quotes: '"\'' },
    r: { kw: 'if else repeat while function for in next break TRUE FALSE NULL Inf NaN NA library return', line: ['#'], block: [], quotes: '"\'' },
    julia: { kw: 'abstract baremodule begin break catch const continue do else elseif end export finally for function global if import let local macro module quote return struct try using while' + CONST, line: ['#'], block: [['#=', '=#']], quotes: '"' },
    haskell: { kw: 'case class data default deriving do else if import in infix instance let module newtype of then type where', line: ['--'], block: [['{-', '-}']], quotes: '"' },
    yaml: { kw: 'true false null yes no on off', line: ['#'], block: [], quotes: '"\'' },
    toml: { kw: 'true false', line: ['#'], block: [], quotes: '"\'', triple: true },
  };
  const GENERIC: Lang = { kw: 'if else for while do return function def class import from export const let var new public private static void int' + CONST, line: ['//', '#'], block: [['/*', '*/']], quotes: '"\'`' };
  const kwSets = new Map<string, Set<string>>();
  const kwOf = (name: string, l: Lang) => {
    let set = kwSets.get(name);
    if (!set) kwSets.set(name, (set = new Set(l.kw.split(/\s+/).filter(Boolean).map((w) => (l.ci ? w.toLowerCase() : w)))));
    return set;
  };
  const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** A language of code's words, in runs: a scanner of comments, strings, numbers and words, the language's keywords. */
  const scan = (code: string, name: string, l: Lang): [string, string][] => {
    const out: [string, string][] = [];
    const push = (k: string, t: string) => {
      if (!t) return;
      const last = out[out.length - 1];
      if (last && last[0] === k) last[1] += t;
      else out.push([k, t]);
    };
    const kws = kwOf(name, l);
    const alts: string[] = [];
    for (const [a, b] of l.block) alts.push(`${escRe(a)}[\\s\\S]*?(?:${escRe(b)}|$)`);
    for (const m of l.line) alts.push(`${escRe(m)}[^\\n]*`);
    const com = alts.length;
    const strs: string[] = [];
    if (l.triple) strs.push(`[rRbBfFuU]{0,2}"""[\\s\\S]*?(?:"""|$)`, `[rRbBfFuU]{0,2}'''[\\s\\S]*?(?:'''|$)`);
    for (const q of l.quotes) strs.push(q === '`' ? '`(?:[^`\\\\]|\\\\[\\s\\S])*`?' : `${l.triple ? '[rRbBfFuU]{0,2}' : ''}${escRe(q)}(?:[^${escRe(q)}\\\\\\n]|\\\\.)*${escRe(q)}?`);
    const re = new RegExp(`(${alts.join('|') || '(?!)'})|(${strs.join('|') || '(?!)'})|(\\b(?:0[xX][\\da-fA-F_]+|0[bB][01_]+|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?)[a-zA-Z]*\\b)|(${l.dollar ? '\\$\\{?[A-Za-z_][\\w]*\\}?|\\$[0-9#?@!*-]|' : ''}${l.at ? '@[A-Za-z_][\\w.]*|' : ''}[A-Za-z_][\\w]*${name === 'ruby' ? '[!?]?' : ''})`, 'g');
    let at = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) {
      if (!m[0]) {
        re.lastIndex++;
        continue;
      }
      push('', code.slice(at, m.index));
      at = m.index + m[0].length;
      if (com && m[1]) push('c', m[0]);
      else if (m[2]) push('s', m[0]);
      else if (m[3]) push('n', m[0]);
      else {
        const w = m[4] ?? m[0];
        if (w[0] === '$') push('a', w);
        else if (w[0] === '@') push('f', w);
        else if (kws.has(l.ci ? w.toLowerCase() : w)) push('k', w);
        else if (/^\s*\(/.test(code.slice(at, at + 40))) push('f', w);
        else if (/^[A-Z][a-z0-9]+[A-Za-z0-9]*$/.test(w) && name !== 'sql') push('t', w);
        else push('', w);
      }
    }
    push('', code.slice(at));
    return out;
  };

  /** HTML (and XML): tags, their attributes and values, comments; what is inside <script> and <style> as JavaScript and CSS. */
  const scanHtml = (code: string): [string, string][] => {
    const out: [string, string][] = [];
    const re = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z][\w:.-]*|<!doctype[^>]*>/gi;
    let at = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) {
      if (m.index > at) out.push(['', code.slice(at, m.index)]);
      if (m[0].startsWith('<!--') || /^<!doctype/i.test(m[0])) {
        out.push(['c', m[0]]);
        at = m.index + m[0].length;
        continue;
      }
      out.push(['g', m[0]]);
      // The tag's attributes up to its end.
      const attrs = /\s*([^\s=>"'/]+)(\s*=\s*("[^"]*"?|'[^']*'?|[^\s>]+))?|\s*\/?>/gy;
      attrs.lastIndex = m.index + m[0].length;
      let end = attrs.lastIndex;
      for (let a = attrs.exec(code); a; a = attrs.exec(code)) {
        end = attrs.lastIndex;
        if (/^\s*\/?>$/.test(a[0])) {
          out.push(['g', a[0]]);
          break;
        }
        const lead = /^\s*/.exec(a[0])![0];
        out.push(['', lead], ['a', a[1]]);
        if (a[2]) {
          const eq = a[2].slice(0, a[2].length - a[3].length);
          out.push(['', eq], ['s', a[3]]);
        }
      }
      at = end;
      re.lastIndex = Math.max(re.lastIndex, at);
      // Inside <script> and <style>: their own languages, to their end tag.
      const inner = /^<(script|style)$/i.exec(m[0]);
      if (inner && code[at - 1] === '>') {
        const close = code.toLowerCase().indexOf(`</${inner[1].toLowerCase()}`, at);
        const stop = close < 0 ? code.length : close;
        out.push(...(inner[1].toLowerCase() === 'script' ? scan(code.slice(at, stop), 'javascript', LANGS.javascript) : scanCss(code.slice(at, stop))));
        at = stop;
        re.lastIndex = stop;
      }
    }
    if (at < code.length) out.push(['', code.slice(at)]);
    return out;
  };

  /** CSS: comments, strings, numbers with their units, colours, at-rules, and properties' names. */
  const scanCss = (code: string): [string, string][] => {
    const out: [string, string][] = [];
    const re = /(\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(#[0-9a-fA-F]{3,8}\b|-?\b\d*\.?\d+(?:%|[a-zA-Z]+)?)|(@[\w-]+)|([\w-]+)(?=\s*:(?!:))/g;
    let at = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) {
      if (m.index > at) out.push(['', code.slice(at, m.index)]);
      out.push([m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : m[4] ? 'k' : 'a', m[0]]);
      at = m.index + m[0].length;
    }
    if (at < code.length) out.push(['', code.slice(at)]);
    return out;
  };

  /** JSON: keys, strings, numbers, true, false and null. */
  const scanJson = (code: string): [string, string][] => {
    const out: [string, string][] = [];
    const re = /("(?:[^"\\\n]|\\.)*"?)(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b|(\/\/[^\n]*)/g;
    let at = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) {
      if (m.index > at) out.push(['', code.slice(at, m.index)]);
      if (m[1]) {
        out.push([m[2] ? 'a' : 's', m[1]]);
        if (m[2]) out.push(['', m[2]]);
      } else out.push([m[3] ? 'n' : m[4] ? 'k' : 'c', m[0]]);
      at = m.index + m[0].length;
    }
    if (at < code.length) out.push(['', code.slice(at)]);
    return out;
  };

  const tokens = (code: string, lang?: string): [string, string][] => {
    const text = typeof code === 'string' ? code.slice(0, 40000) : '';
    const name = typeof lang === 'string' ? lang.toLowerCase() : '';
    try {
      if (name === 'html' || name === 'xml' || name === 'svg' || name === 'vue') return scanHtml(text);
      if (name === 'css' || name === 'scss' || name === 'less') return scanCss(text);
      if (name === 'json' || name === 'jsonc') return scanJson(text);
      if (name === 'markdown' || name === 'text' || name === 'plain' || name === 'txt') return [['', text]];
      return scan(text, LANGS[name] ? name : 'generic', LANGS[name] ?? GENERIC);
    } catch {
      return [['', text]];
    }
  };

  /** A code part's colours: dark and light as editors show code; the deck's from its theme. */
  const codeLook = (look: string | undefined, t: Theme): CodeLook => {
    if (look === 'light') return { bg: '#f6f8fa', fg: '#1f2328', k: '#cf222e', s: '#0a3069', c: '#6e7781', n: '#0550ae', f: '#8250df', t: '#953800', g: '#116329', a: '#0550ae', gutter: '#8c959f', lit: 'rgba(84,174,255,.16)' };
    if (look === 'deck') {
      const c = (i: number) => color(t.colors?.[i], t, color('accent', t, '#2f6fec'));
      return { bg: color('soft', t, '#f1f4f9'), fg: color('fg', t, '#222'), k: color('accent', t, '#2f6fec'), s: c(1), c: color('muted', t, '#777'), n: c(2), f: c(4), t: c(3), g: c(1), a: c(5), gutter: color('muted', t, '#777'), lit: `color-mix(in srgb, ${color('accent', t, '#2f6fec')} 16%, transparent)` };
    }
    return { bg: '#0d1117', fg: '#e6edf3', k: '#ff7b72', s: '#a5d6ff', c: '#8b949e', n: '#79c0ff', f: '#d2a8ff', t: '#ffa657', g: '#7ee787', a: '#79c0ff', gutter: '#6e7681', lit: 'rgba(56,139,253,.18)' };
  };

  /** The lines a code part lights ("2-4,7"), by their number from 1. */
  const litLines = (v: unknown): Set<number> => {
    const out = new Set<number>();
    if (typeof v !== 'string') return out;
    for (const part of v.split(',').slice(0, 100)) {
      const m = /^\s*(\d{1,4})\s*(?:-\s*(\d{1,4}))?\s*$/.exec(part);
      if (!m) continue;
      const a = Number(m[1]);
      const b = Math.min(a + 2000, Number(m[2] ?? m[1]));
      for (let i = a; i <= b; i++) out.add(i);
    }
    return out;
  };

  /** A code part: its lines coloured, numbered and lit as it says, in the monospaced font, made smaller to fit its box (fit). */
  const codeBox = (deck: Deck, e: Extract<El, { type: 'code' }>) => {
    const look = codeLook(e.look, deck.theme);
    const box = el('div', 'ns-code');
    box.dataset.fit = '1';
    box.style.background = look.bg;
    box.style.color = look.fg;
    box.style.setProperty('--lit', look.lit);
    box.style.fontFamily = font('JetBrains Mono', deck.theme);
    box.style.fontSize = sizeCss(n(e.size, 20));
    box.style.borderRadius = px(n(e.radius, 12));
    const lit = litLines(e.highlight);
    const lines: [string, string][][] = [[]];
    for (const [k, t] of tokens(typeof e.code === 'string' ? e.code.replace(/\t/g, '    ') : '', e.lang)) {
      const bits = t.split('\n');
      bits.forEach((b, i) => {
        if (i) lines.push([]);
        if (b) lines[lines.length - 1].push([k, b]);
      });
    }
    const width = String(lines.length).length;
    lines.forEach((ln, i) => {
      const row = el('div', 'ns-cl');
      if (lit.size) row.classList.add(lit.has(i + 1) ? 'ns-lit' : 'ns-dim');
      if (e.lineNumbers) {
        const g = el('span', 'ns-ln');
        g.textContent = String(i + 1).padStart(width, ' ');
        g.style.color = look.gutter;
        row.appendChild(g);
      }
      for (const [k, t] of ln) {
        const s = el('span');
        s.textContent = t;
        if (k && k in look) s.style.color = look[k as keyof CodeLook];
        if (k === 'c') s.style.fontStyle = 'italic';
        row.appendChild(s);
      }
      if (!ln.length) row.appendChild(doc.createTextNode(''));
      box.appendChild(row);
    });
    return box;
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
    // Its path: straight, or an elbow connector's right angles (as shared/slides.ts elbowPoints makes them).
    let pts = [
      [ax, ay],
      [bx, by],
    ];
    if (l.route === 'elbow') {
      const across = (at: unknown) => at === 'l' || at === 'r';
      const h1 = l.from ? across(l.from.at) : l.to ? across(l.to.at) : true;
      const h2 = l.to ? across(l.to.at) : h1;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      pts =
        h1 && h2
          ? [[ax, ay], [mx, ay], [mx, by], [bx, by]]
          : !h1 && !h2
            ? [[ax, ay], [ax, my], [bx, my], [bx, by]]
            : h1
              ? [[ax, ay], [bx, ay], [bx, by]]
              : [[ax, ay], [ax, by], [bx, by]];
      // A bend where the path does not turn (ends level with each other) is no bend.
      pts = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
      if (pts.length < 2) pts = [
        [ax, ay],
        [bx, by],
      ];
    }
    const last = pts.length - 1;
    // The arrows point along the first and the last stretch.
    const angS = Math.atan2(pts[1][1] - ay, pts[1][0] - ax);
    const angE = Math.atan2(by - pts[last - 1][1], bx - pts[last - 1][0]);
    const head = sw * 3.2 + 4;
    const cut = (cap: string | undefined) => (cap === 'arrow' ? head * 0.8 : 0);
    const drawn = pts.map((q) => [...q]);
    drawn[0] = [ax + Math.cos(angS) * cut(l.start), ay + Math.sin(angS) * cut(l.start)];
    drawn[last] = [bx - Math.cos(angE) * cut(l.end), by - Math.sin(angE) * cut(l.end)];
    const stroke = { stroke: ink, 'stroke-width': sw, 'stroke-linecap': l.dash === 'dot' ? 'round' : 'butt', ...(l.dash === 'dash' ? { 'stroke-dasharray': `${sw * 3} ${sw * 2}` } : l.dash === 'dot' ? { 'stroke-dasharray': `0.1 ${sw * 2}` } : {}) };
    if (drawn.length === 2) root.appendChild(svg('line', { x1: drawn[0][0], y1: drawn[0][1], x2: drawn[1][0], y2: drawn[1][1], ...stroke }));
    else root.appendChild(svg('polyline', { points: drawn.map((q) => q.join(',')).join(' '), fill: 'none', 'stroke-linejoin': 'miter', ...stroke }));
    const cap = (kind: string | undefined, x: number, y: number, a: number) => {
      if (kind === 'arrow') {
        const p = (d: number, s: number) => `${x + Math.cos(a) * d - Math.sin(a) * s},${y + Math.sin(a) * d + Math.cos(a) * s}`;
        root.appendChild(svg('path', { d: `M${p(0, 0)}L${p(-head, head * 0.55)}L${p(-head, -head * 0.55)}Z`, fill: ink }));
      } else if (kind === 'dot') root.appendChild(svg('circle', { cx: x, cy: y, r: sw * 1.6 + 1, fill: ink }));
    };
    cap(l.end, bx, by, angE);
    cap(l.start, ax, ay, angS + Math.PI);
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

  // ---- quizzes and their scores ------------------------------------------------------------------------------------
  const LETTERS = 'ABCDEFGH';
  /** Whether picks answer a quiz right: one of its right choices (all of them, and only them, when several are to be picked). */
  const rightOf = (q: Extract<El, { type: 'quiz' }>, picks: number[]) => {
    const right = (q.choices ?? []).map((c, i) => (c.correct ? i : -1)).filter((i) => i >= 0);
    if (!right.length) return false;
    if (q.multi) return picks.length === right.length && picks.every((p) => right.includes(p));
    return picks.length === 1 && right.includes(picks[0]);
  };
  /** The quizzes that count towards a deck's score: those with a right choice, on the slides the slideshow shows. */
  const scored = (deck: Deck) => deck.slides.filter((s) => !s.hidden).reduce((k, s) => k + everyPart(s.els).filter((e) => e.type === 'quiz' && (e.choices ?? []).some((c) => c.correct)).length, 0);
  const everyPart = (els: El[], out: El[] = []): El[] => {
    for (const e of els ?? []) {
      out.push(e);
      if (e.type === 'group') everyPart(e.els, out);
    }
    return out;
  };
  /** A slideshow's store of answers (only for the slideshow: a new one each time it starts). */
  const answersFor = (deck: Deck): QuizAnswers => {
    const kept = new Map<string, QuizAnswer>();
    const total = scored(deck);
    return {
      get: (id) => kept.get(id),
      set: (id, a) => void kept.set(id, a),
      score: () => ({ right: [...kept.values()].filter((a) => a.right).length, total }),
    };
  };
  const scoreText = (tpl: string, sc: { right: number; total: number }) =>
    tpl
      .replace(/\{right\}/g, String(sc.right))
      .replace(/\{total\}/g, String(sc.total))
      .replace(/\{percent\}/g, String(sc.total ? Math.round((sc.right / sc.total) * 100) : 0));

  /**
   * A quiz: its question and its lettered choices. In the slideshow its choices are picked (several, then Check, when
   * several are right): right and wrong show at once, with what each pick says and the explanation, and the answer is
   * kept for the show (back on its slide it shows answered). The editor marks the right ones; prints mark none.
   */
  const quizBox = (deck: Deck, q: Extract<El, { type: 'quiz' }>, o: DrawOpts) => {
    const t = deck.theme;
    const box = el('div', 'ns-quiz');
    box.style.fontSize = sizeCss(n(q.size, 32));
    box.style.fontFamily = font(q.font, t);
    const ink = color(q.color, t, color('fg', t, '#222'));
    box.style.color = ink;
    box.style.setProperty('--qfill', color(q.fill, t, color('soft', t, '#f1f4f9')));
    box.style.setProperty('--qmark', color('accent', t, '#2f6fec'));
    box.style.setProperty('--qmarkfg', color('accentFg', t, '#fff'));
    const qq = el('div', 'ns-qq');
    qq.textContent = q.question || (o.edit ? hintOf('Your question') : '');
    qq.style.color = q.color ? ink : color('head', t, ink);
    if (!q.question) qq.style.opacity = '.45';
    const list = el('div', 'ns-qcs');
    if (q.layout === 'grid') list.dataset.layout = 'grid';
    const play = !!o.play && !o.edit;
    const choices = Array.isArray(q.choices) ? q.choices.slice(0, 8) : [];
    const items = choices.map((c, i) => {
      const b = el(play ? 'button' : 'div', 'ns-qc');
      if (play) b.setAttribute('type', 'button');
      const l = el('span', 'ns-ql');
      l.textContent = LETTERS[i];
      const tx = el('span', 'ns-qt');
      tx.textContent = typeof c.text === 'string' && c.text ? c.text : o.edit ? hintOf('Empty choice') : '';
      b.append(l, tx);
      if (o.edit && c.correct) b.classList.add('ns-key');
      list.appendChild(b);
      return b;
    });
    box.append(qq, list);
    if (!play) return box;
    const fb = el('div', 'ns-qf');
    const check = el('button', 'ns-qcheck');
    check.type = 'button';
    check.textContent = hintOf('Check the answers');
    const poll = !choices.some((c) => c.correct);
    let a: QuizAnswer = o.answers?.get(q.id) ?? { picks: [], done: false, right: false };
    const paint = () => {
      items.forEach((b, i) => {
        const picked = a.picks.includes(i);
        const c = choices[i];
        b.classList.toggle('ns-pick', picked && (!a.done || poll));
        b.classList.toggle('ns-right', a.done && !poll && !!c.correct && (picked || !q.multi));
        b.classList.toggle('ns-wrong', a.done && !poll && picked && !c.correct);
        b.classList.toggle('ns-missed', a.done && !poll && !!q.multi && !!c.correct && !picked);
        (b as HTMLButtonElement).disabled = a.done;
      });
      fb.textContent = '';
      if (a.done) {
        const said = [...new Set(a.picks.map((i) => choices[i]?.why).filter((w): w is string => typeof w === 'string' && !!w))];
        for (const w of [...said, ...(typeof q.explain === 'string' && q.explain ? [q.explain] : [])]) {
          const p = el('div');
          p.textContent = w;
          fb.appendChild(p);
        }
      }
      check.style.display = q.multi && !a.done && a.picks.length ? '' : 'none';
    };
    const answer = (picks: number[], done: boolean) => {
      a = { picks, done, right: done && rightOf(q, picks) };
      if (done || q.multi) o.answers?.set(q.id, a);
      paint();
      // The score parts on this slide count it at once.
      const sc = o.answers?.score();
      if (done && sc) for (const x of Array.from(box.closest('.ns-slide')?.querySelectorAll<HTMLElement>('.ns-score[data-tpl]') ?? [])) x.textContent = scoreText(x.dataset.tpl ?? '', sc);
    };
    items.forEach((b, i) =>
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (a.done || b.closest('.ns-pening')) return;
        if (q.multi) answer(a.picks.includes(i) ? a.picks.filter((x) => x !== i) : [...a.picks, i].sort((x, y) => x - y), false);
        else answer([i], true);
      }),
    );
    check.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!a.done && a.picks.length) answer(a.picks, true);
    });
    // A click on the quiz (between its choices too) is the quiz's, not the slideshow's.
    box.addEventListener('click', (ev) => ev.stopPropagation());
    box.append(check, fb);
    paint();
    return box;
  };

  /** A score part: its words with the slideshow's score in them ({right}, {total}, {percent}); none answered yet elsewhere. */
  const scoreBox = (deck: Deck, e: Extract<El, { type: 'score' }>, o: DrawOpts) => {
    const t = deck.theme;
    const box = el('div', 'ns-score');
    box.style.fontSize = sizeCss(n(e.size, 40));
    box.style.fontFamily = font(e.font, t, 'title');
    box.style.color = color(e.color, t, color('head', t, '#222'));
    if (e.bold) box.style.fontWeight = '700';
    const al = e.align ?? 'center';
    box.style.textAlign = al;
    box.style.justifyContent = al === 'right' ? 'flex-end' : al === 'left' ? 'flex-start' : 'center';
    const tpl = typeof e.text === 'string' && e.text ? e.text : hintOf('You got {right} of {total}');
    box.dataset.tpl = tpl;
    box.textContent = scoreText(tpl, o.answers?.score() ?? { right: 0, total: scored(deck) });
    return box;
  };

  // ---- the web format's live parts: custom code, web pages, 3D ----------------------------------------------------
  /** Their icons where they do not run (the runtime's own markup). */
  const LIVE_ICONS: Record<string, string> = {
    html: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16"/>',
    embed: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/>',
    scene3d: '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><path d="M4 7.4l8 4.6 8-4.6M12 12v9.2"/>',
  };
  const THREE = typeof libs?.three === 'string' && /^https:\/\/[^\s"'<>]+\/$/.test(libs.three) ? libs.three : 'https://cdn.jsdelivr.net/npm/three@0.187.0/';
  const attr = (s: string) => s.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
  const scriptJs = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  /** The frames of live parts this runtime made (each frame's part, and where its 3D model is fetched from). */
  const liveFrames = new Map<HTMLIFrameElement, { e: El; o: DrawOpts }>();
  /** Each slideshow's stage, and what it does when one of its frames asks (deck.next(), prev(), go(n), a key it left). */
  const shows = new Set<{ stage: HTMLElement; act: (d: { act: string; n?: unknown; key?: unknown }) => void }>();

  /**
   * `window.deck` in a live part's page: its slide (from 1) and the deck's slides, the step its build is at, whether
   * its slide shows; on('enter' | 'leave' | 'step', f); next(), prev(), go(n). It tells the slideshow by postMessage
   * (its parent only), and passes on the keys that move a slideshow when the page itself does nothing with them.
   * Its own source goes into each part's page: it uses nothing outside itself.
   */
  function bridge(cfg: { id: string; slide: number; slides: number; step: number; active: boolean; ready: boolean }) {
    const on: Record<string, ((d: unknown) => void)[]> = {};
    const st = { slide: cfg.slide, slides: cfg.slides, step: cfg.step || 0, active: !!cfg.active };
    const post = (m: Record<string, unknown>) => {
      try {
        parent.postMessage({ ...m, ns: 'n-deck', id: cfg.id }, '*');
      } catch {}
    };
    const fire = (t: string, d: unknown) => {
      for (const f of (on[t] ?? []).slice())
        try {
          f(d);
        } catch (e) {
          console.error(e);
        }
    };
    const deck = {
      get slide() {
        return st.slide;
      },
      get slides() {
        return st.slides;
      },
      get step() {
        return st.step;
      },
      get active() {
        return st.active;
      },
      on(t: string, f: (d: unknown) => void) {
        if (typeof f !== 'function') return;
        (on[t] = on[t] ?? []).push(f);
        if (t === 'enter' && st.active) setTimeout(() => f({ slide: st.slide, step: st.step }), 0);
      },
      off(t: string, f: (d: unknown) => void) {
        on[t] = (on[t] ?? []).filter((x) => x !== f);
      },
      next: () => post({ act: 'next' }),
      prev: () => post({ act: 'prev' }),
      go: (n: number) => {
        if (typeof n === 'number' && isFinite(n)) post({ act: 'go', n: Math.round(n) });
      },
    };
    try {
      Object.defineProperty(window, 'deck', { value: deck });
    } catch {}
    addEventListener('message', (e) => {
      const d = e.data;
      if (e.source !== parent || !d || d.ns !== 'n-deck' || typeof d.ev !== 'string') return;
      if (d.ev === 'enter') {
        st.active = true;
        st.step = Number(d.step) || 0;
        fire('enter', { slide: st.slide, step: st.step });
      } else if (d.ev === 'leave') {
        st.active = false;
        fire('leave', { slide: st.slide });
      } else if (d.ev === 'step') {
        st.step = Number(d.step) || 0;
        fire('step', { slide: st.slide, step: st.step });
      }
    });
    if (cfg.ready) addEventListener('load', () => post({ act: 'ready' }));
    const NAV = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape'];
    addEventListener('keydown', (e) => {
      if (!NAV.includes(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
      setTimeout(() => {
        if (!e.defaultPrevented) post({ act: 'key', key: e.key });
      }, 0);
    });
  }

  /**
   * A 3D part's page: three.js (with its loaders and controls) from jsDelivr at a pinned version, the model (asked of
   * the slideshow, which fetches it as the app keeps it or has it inside the deck's page; one on the web loaded here)
   * or a shape of its own, in its material and light, turning by itself, turned by the pointer where it may be.
   * Transparent behind unless it has a colour. Its own source goes into the page: it uses nothing outside itself.
   */
  async function scene(cfg: { shape: string; text: string; color: string; material: string; light: string; spin: number; orbit: boolean; turn: number; tilt: number; zoom: number; bg: string; model: string; accent: string; second: string; font: string }) {
    const ready = () => parent.postMessage({ ns: 'n-deck', act: 'ready' }, '*');
    // three.js comes from the page's import map, never from the app's own bundle (nor its types): what it loads is the
    // frame's alone.
    const load = (spec: string): Promise<any> => import(/* @vite-ignore */ spec);
    let T: any;
    try {
      T = await load('three');
    } catch {
      return;
    }
    const addons = (p: string) => load(`three/addons/${p}`);
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    const sc = new T.Scene();
    if (cfg.bg) sc.background = new T.Color(cfg.bg);
    const cam = new T.PerspectiveCamera(30, 1, 0.01, 200);
    // Light: a room around it to shine in, and lamps as the light says.
    try {
      const { RoomEnvironment } = await addons('environments/RoomEnvironment.js');
      const pm = new T.PMREMGenerator(renderer);
      sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      sc.environmentIntensity = ({ studio: 0.65, soft: 1, dramatic: 0.22, neon: 0.12 } as Record<string, number>)[cfg.light] ?? 0.65;
    } catch {}
    const dir = (c: number | string, i: number, x: number, y: number, z: number) => {
      const l = new T.DirectionalLight(c, i);
      l.position.set(x, y, z);
      sc.add(l);
    };
    if (cfg.light === 'soft') {
      sc.add(new T.HemisphereLight(0xffffff, 0x8a8a8a, 1.2));
      dir(0xffffff, 0.6, 2, 5, 4);
    } else if (cfg.light === 'dramatic') {
      sc.add(new T.AmbientLight(0xffffff, 0.06));
      const s = new T.SpotLight(0xffffff, 60, 0, 0.55, 0.6, 2);
      s.position.set(3.5, 4.5, 2.5);
      sc.add(s);
      dir(cfg.accent, 1.4, -3, 2, -4);
    } else if (cfg.light === 'neon') {
      sc.add(new T.AmbientLight(0xffffff, 0.05));
      const a = new T.PointLight(cfg.accent, 45, 0, 2);
      a.position.set(2.4, 1.6, 2.6);
      const b = new T.PointLight(cfg.second, 45, 0, 2);
      b.position.set(-2.6, -1.2, 2.2);
      sc.add(a, b);
    } else {
      sc.add(new T.HemisphereLight(0xffffff, 0x404040, 0.55));
      dir(0xffffff, 1.7, 3, 4, 5);
      dir(0xffffff, 0.5, -4, 1, 2);
      dir(0xffffff, 0.9, 0, 3, -5);
    }
    const material = () => {
      const c = new T.Color(cfg.color);
      const flat = cfg.shape === 'icosahedron';
      if (cfg.material === 'matte') return new T.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, flatShading: flat });
      if (cfg.material === 'metal') return new T.MeshStandardMaterial({ color: c, roughness: 0.22, metalness: 1, flatShading: flat });
      if (cfg.material === 'glass') return new T.MeshPhysicalMaterial({ color: c, roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.8, ior: 1.45, flatShading: flat });
      if (cfg.material === 'wire') return new T.MeshBasicMaterial({ color: c, wireframe: true });
      if (cfg.material === 'toon') return new T.MeshToonMaterial({ color: c });
      return new T.MeshPhysicalMaterial({ color: c, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12, flatShading: flat });
    };
    let obj: any;
    try {
      if (cfg.model) {
        const { GLTFLoader } = await addons('loaders/GLTFLoader.js');
        const data = await new Promise<ArrayBuffer | string>((ok, no) => {
          if (cfg.model !== 'ask') return ok(cfg.model);
          const on = (e: MessageEvent) => {
            if (e.source !== parent || !e.data || e.data.ns !== 'n-deck' || e.data.ev !== 'model') return;
            removeEventListener('message', on);
            if (e.data.data) ok(e.data.data);
            else no(new Error('No model'));
          };
          addEventListener('message', on);
          parent.postMessage({ ns: 'n-deck', act: 'model' }, '*');
        });
        const loader = new GLTFLoader();
        const gltf = await (typeof data === 'string' ? loader.loadAsync(data) : loader.parseAsync(data, ''));
        obj = gltf.scene;
        if (cfg.material)
          obj.traverse((m: any) => {
            if (m.isMesh) m.material = material();
          });
      } else {
        let geo: any;
        if (cfg.shape === 'text') {
          const { FontLoader } = await addons('loaders/FontLoader.js');
          const { TextGeometry } = await addons('geometries/TextGeometry.js');
          const f = await new FontLoader().loadAsync(cfg.font);
          geo = new TextGeometry(cfg.text || '3D', { font: f, size: 1, depth: 0.32, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.025, bevelSegments: 3 });
        } else if (cfg.shape === 'sphere') geo = new T.SphereGeometry(1, 64, 32);
        else if (cfg.shape === 'torus') geo = new T.TorusGeometry(0.78, 0.32, 48, 128);
        else if (cfg.shape === 'knot') geo = new T.TorusKnotGeometry(0.7, 0.24, 220, 32);
        else if (cfg.shape === 'cone') geo = new T.ConeGeometry(0.9, 1.6, 64);
        else if (cfg.shape === 'cylinder') geo = new T.CylinderGeometry(0.8, 0.8, 1.5, 64);
        else if (cfg.shape === 'icosahedron') geo = new T.IcosahedronGeometry(1, 0);
        else {
          const { RoundedBoxGeometry } = await addons('geometries/RoundedBoxGeometry.js');
          geo = new RoundedBoxGeometry(1.3, 1.3, 1.3, 5, 0.14);
        }
        geo.center();
        obj = new T.Mesh(geo, material());
      }
    } catch {
      return;
    }
    // Fitted to a ball of 1 around the middle, which the camera frames.
    const ball = new T.Box3().setFromObject(obj).getBoundingSphere(new T.Sphere());
    const pivot = new T.Group();
    obj.position.sub(ball.center);
    pivot.add(obj);
    pivot.scale.setScalar(1 / Math.max(1e-6, ball.radius));
    sc.add(pivot);
    let controls: any = null;
    const frame = () => {
      const w = Math.max(1, innerWidth);
      const h = Math.max(1, innerHeight);
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      const v = ((cam.fov / 2) * Math.PI) / 180;
      const d = 1.06 / Math.sin(Math.min(v, Math.atan(Math.tan(v) * cam.aspect))) / Math.max(0.2, cfg.zoom || 1);
      const a = (cfg.turn * Math.PI) / 180;
      const b = (cfg.tilt * Math.PI) / 180;
      if (!controls) cam.position.set(d * Math.cos(b) * Math.sin(a), d * Math.sin(b), d * Math.cos(b) * Math.cos(a));
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      if (controls) {
        controls.minDistance = d * 0.4;
        controls.maxDistance = d * 3;
      }
    };
    frame();
    if (cfg.orbit) {
      const { OrbitControls } = await addons('controls/OrbitControls.js');
      controls = new OrbitControls(cam, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      frame();
    }
    const spin = ((cfg.spin || 0) * Math.PI) / 180;
    let raf = 0;
    let last = performance.now();
    let on = true;
    const draw = (now: number) => {
      raf = 0;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      pivot.rotation.y += spin * dt;
      controls?.update();
      renderer.render(sc, cam);
      if (on && (spin || controls)) raf = requestAnimationFrame(draw);
    };
    draw(last);
    ready();
    new ResizeObserver(() => {
      frame();
      if (!raf) draw(performance.now());
    }).observe(document.body);
    // Still while its slide does not show; again as it comes.
    const w = window as unknown as { deck?: { on(t: string, f: () => void): void } };
    w.deck?.on('leave', () => {
      on = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    });
    w.deck?.on('enter', () => {
      if (on) return;
      on = true;
      last = performance.now();
      if (!raf) draw(last);
    });
  }

  /** A font stylesheet for a live part's page: the deck's page's own fonts (inside it, #n-fonts), else Google's for the theme's fonts. */
  const fontsTag = (t: Theme) => {
    const inside = doc.getElementById('n-fonts')?.textContent;
    if (inside) return `<style>${inside.replace(/<\/style/gi, '')}</style>`;
    const fams = [...new Set([t.font, t.headFont])].filter((f) => fonts[f]?.google).map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,400;0,600;0,700;1,400`);
    return fams.length ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${attr(fams.join('&'))}&amp;display=swap">` : '';
  };

  /** A live part's page: the deck's colours and fonts as CSS variables, `window.deck`, and the part itself. */
  const partPage = (deck: Deck, s: Slide, e: Extract<El, { type: 'html' | 'embed' | 'scene3d' }>, o: DrawOpts): string => {
    const t = deck.theme;
    const cv = (k: string, c: string) => `--n-${k}:${c};`;
    const vars = [
      cv('bg', color('bg', t, '#fff')),
      cv('fg', color('fg', t, '#222')),
      cv('head', color('head', t, '#111')),
      cv('muted', color('muted', t, '#777')),
      cv('accent', color('accent', t, '#2f6fec')),
      cv('accent-fg', color('accentFg', t, '#fff')),
      cv('soft', color('soft', t, '#f1f4f9')),
      ...[0, 1, 2, 3, 4, 5].map((i) => cv(`c${i + 1}`, color(t.colors?.[i], t, color('accent', t, '#2f6fec')))),
      `--n-font:${font('body', t)};`,
      `--n-head-font:${font('head', t)};`,
    ].join('');
    const cfg = { id: e.id, slide: Math.max(1, deck.slides.indexOf(s) + 1), slides: deck.slides.length, step: Number.isFinite(o.step) ? n(o.step, 0) : 0, active: true, ready: e.type !== 'scene3d' };
    const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${vars}}html,body{margin:0;padding:0;background:transparent;color:var(--n-fg);font-family:var(--n-font)}</style>${fontsTag(t)}<script>(${bridge.toString()})(${scriptJs(cfg)})</script>`;
    if (e.type === 'html') {
      const h = typeof e.html === 'string' ? e.html : '';
      const dt = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(h);
      return dt ? dt[0] + head + h.slice(dt[0].length) : `<!doctype html>${head}${h}`;
    }
    if (e.type === 'embed') {
      const url = typeof e.url === 'string' && /^https:\/\/[^\s<>"'\\]+$/i.test(e.url) ? e.url : 'about:blank';
      return `<!doctype html><html><head>${head}<style>html,body{height:100%;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe src="${attr(url)}" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
    }
    const model = !e.model ? '' : /^https:\/\//.test(e.model) ? e.model : 'ask';
    const release = /three@0\.(\d+)\./.exec(THREE)?.[1] ?? '187';
    const sc = {
      shape: e.model ? '' : (e.shape ?? 'cube'),
      text: typeof e.text === 'string' ? e.text.slice(0, 60) : '',
      color: color(e.color, t, color('accent', t, '#2f6fec')),
      material: e.material ?? (e.model ? '' : 'glossy'),
      light: e.light ?? 'studio',
      spin: n(e.spin, 0),
      orbit: !!e.orbit,
      turn: n(e.turn, 30),
      tilt: n(e.tilt, 18),
      zoom: n(e.zoom, 1),
      bg: e.bg ? color(e.bg, t, '') : '',
      model,
      accent: color('accent', t, '#2f6fec'),
      second: color(t.colors?.[1], t, color('accent', t, '#2f6fec')),
      font: `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r${release}/examples/fonts/helvetiker_bold.typeface.json`,
    };
    const map = { imports: { three: `${THREE}build/three.module.min.js`, 'three/addons/': `${THREE}examples/jsm/` } };
    return `<!doctype html><html><head>${head}<style>html,body{width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%;outline:none;touch-action:${e.orbit ? 'none' : 'auto'}}</style><script type="importmap">${scriptJs(map)}</script></head><body><script type="module">(${scene.toString()})(${scriptJs(sc)})</script></body></html>`;
  };

  /** A live part's model, sent to its frame as it asked: fetched as the app keeps it, or as the deck's page has it inside. */
  const sendModel = (f: HTMLIFrameElement, info: { e: El; o: DrawOpts }) => {
    const reply = (data: ArrayBuffer | string | null) => f.contentWindow?.postMessage({ ns: 'n-deck', ev: 'model', data }, '*', data instanceof ArrayBuffer ? [data] : []);
    const m = info.e.type === 'scene3d' ? info.e.model : undefined;
    if (!m) return reply(null);
    const kept = /^naget-asset:([a-f0-9]{16,64})$/.exec(m);
    const url = kept ? (info.o.asset ? info.o.asset(kept[1]) : '') : /^data:model\/gltf-binary;base64,[A-Za-z0-9+/=]+$/.test(m) ? m : '';
    if (!url) return reply(null);
    if (url.startsWith('data:')) return reply(url);
    void win
      .fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => reply(b))
      .catch(() => reply(null));
  };

  /** What a live part's frame says to its slideshow: it has started (its poster goes), its model, a move. */
  let listening = false;
  const listen = () => {
    if (listening) return;
    listening = true;
    win.addEventListener('message', (ev) => {
      const d = ev.data as { ns?: string; act?: string; n?: unknown; key?: unknown } | null;
      if (!d || d.ns !== 'n-deck' || typeof d.act !== 'string') return;
      let f: HTMLIFrameElement | null = null;
      for (const x of Array.from(liveFrames.keys())) {
        if (!x.isConnected) liveFrames.delete(x);
        else if (x.contentWindow === ev.source) f = x;
      }
      if (!f) return;
      if (d.act === 'ready') {
        for (const u of Array.from(f.closest('.ns-live')?.querySelectorAll(':scope > .ns-img, :scope > .ns-liveph') ?? [])) u.remove();
        return;
      }
      if (d.act === 'model') return sendModel(f, liveFrames.get(f)!);
      for (const sh of shows) if (sh.stage.contains(f)) sh.act(d as { act: string });
    });
  };

  /** Tells a slide's live parts something (their slide comes or goes, its build steps on). */
  const tellFrames = (root: Element | null, m: Record<string, unknown>) => {
    for (const f of Array.from(root?.querySelectorAll('iframe') ?? [])) if (liveFrames.has(f)) f.contentWindow?.postMessage({ ...m, ns: 'n-deck' }, '*');
  };

  /** A live part: running in its frame (live), else its poster, else a quiet placeholder that says what it is. */
  const livePart = (deck: Deck, s: Slide, e: Extract<El, { type: 'html' | 'embed' | 'scene3d' }>, o: DrawOpts) => {
    const t = deck.theme;
    const box = el('div', 'ns-live');
    if (e.type === 'embed' && e.radius) box.style.borderRadius = px(n(e.radius, 0));
    if (e.type === 'scene3d' && e.bg) box.style.background = color(e.bg, t, 'transparent');
    const poster = e.poster ? src(e.poster, o) : '';
    if (poster) {
      const img = el('img', 'ns-img');
      img.src = poster;
      img.alt = '';
      img.draggable = false;
      img.style.objectFit = 'cover';
      box.appendChild(img);
    } else if (!o.live) {
      const ph = el('div', 'ns-liveph');
      const ink = color('fg', t, '#333');
      ph.style.background = `color-mix(in srgb, ${ink} 6%, transparent)`;
      ph.style.boxShadow = `inset 0 0 0 1.5px color-mix(in srgb, ${ink} 16%, transparent)`;
      ph.style.color = color('muted', t, '#777');
      const ic = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
      ic.innerHTML = LIVE_ICONS[e.type];
      const label = el('span');
      label.textContent = e.type === 'html' ? hintOf('Custom code') : e.type === 'embed' ? `${hintOf('Web page')} · ${/^https:\/\/([^/?#]+)/.exec(e.url ?? '')?.[1] ?? ''}` : hintOf('3D');
      ph.append(ic, label);
      box.appendChild(ph);
    }
    if (o.live) {
      const made = o.frame ? o.frame(partPage(deck, s, e, o), e) : el('iframe');
      const f = made.tagName === 'IFRAME' ? (made as HTMLIFrameElement) : made.querySelector('iframe');
      if (!o.frame && f) {
        f.setAttribute('sandbox', 'allow-scripts');
        f.srcdoc = partPage(deck, s, e, o);
      }
      if (f) {
        f.title = e.type === 'html' ? 'Custom code' : e.type === 'embed' ? 'Web page' : '3D';
        f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media');
        liveFrames.set(f, { e, o });
        listen();
      }
      const takes = e.type === 'scene3d' ? !!e.orbit : !!e.interactive;
      if (!takes) {
        made.style.pointerEvents = 'none';
        if (f) f.style.pointerEvents = 'none';
      }
      made.classList.add('ns-frame-live');
      box.appendChild(made);
    }
    return box;
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
        if (e.glass) frost(f, fill, fill2 && fill !== 'transparent' ? paint : '');
        d.appendChild(f);
      } else {
        // Frosted glass behind a drawn shape: the blur cut to its outline, under its own fill made see-through.
        if (e.glass) {
          const pane = el('div', 'ns-fill');
          pane.style.clipPath = `path("${shapePath(kind, w, h)}")`;
          frost(pane, 'transparent', '');
          pane.style.border = '0';
          d.appendChild(pane);
        }
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
        g.appendChild(svg('path', { d: shapePath(kind, w, h), fill: fillRef, ...(e.glass ? { 'fill-opacity': 0.5 } : {}), ...(stroke ? { stroke, 'stroke-width': lw, 'stroke-linejoin': 'round', ...(e.dash === 'dash' ? { 'stroke-dasharray': `${lw * 3} ${lw * 2}` } : e.dash === 'dot' ? { 'stroke-dasharray': `${lw} ${lw}` } : {}) } : {}) }));
        if (e.shadow) g.style.filter = 'drop-shadow(0 8px 16px rgba(0,0,0,.22))';
        d.appendChild(g);
      }
      const { box, empty } = textBox(deck, e, o);
      if (empty) {
        if (o.edit && e.ph) d.classList.add('ns-ph');
        if (!o.edit) box.style.visibility = 'hidden';
      }
      if (e.textFx) shine(box, e.textFx, t);
      d.appendChild(box);
    } else if (e.type === 'code') {
      d.appendChild(codeBox(deck, e));
    } else if (e.type === 'quiz') {
      d.appendChild(quizBox(deck, e, o));
    } else if (e.type === 'score') {
      d.appendChild(scoreBox(deck, e, o));
    } else if (e.type === 'html' || e.type === 'embed' || e.type === 'scene3d') {
      d.appendChild(livePart(deck, s, e, o));
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
    const link = e.link ? (SLIDE_LINK.test(e.link) ? e.link : href(e.link)) : '';
    if (link && !o.edit) {
      d.dataset.link = link;
      d.style.cursor = 'pointer';
    }
    // How it answers the pointer (the slideshow's stylesheet moves it; tilting follows the pointer).
    if (e.hover && !o.edit && /^(lift|grow|glow|tilt)$/.test(e.hover)) d.dataset.hover = e.hover;
    return d;
  };

  /**
   * Frosted glass: what is under the box shows through it blurred, its own fill made see-through over that (a faint
   * white where it has none), with a fine light edge.
   */
  const frost = (f: HTMLElement, fill: string, gradient: string) => {
    f.style.setProperty('backdrop-filter', 'blur(18px) saturate(1.6)');
    f.style.setProperty('-webkit-backdrop-filter', 'blur(18px) saturate(1.6)');
    const tint = (c: string) => (c && c !== 'transparent' ? `color-mix(in srgb, ${c} 45%, transparent)` : 'rgba(255,255,255,.14)');
    f.style.background = gradient ? gradient : tint(fill);
    if (gradient) f.style.opacity = '.75';
    if (!f.style.border) f.style.border = '1.5px solid rgba(255,255,255,.32)';
  };

  /** Words that shine: a gradient of the theme's colours, a glow, an outline, neon, a long shadow. */
  const shine = (box: HTMLElement, fx: string, t: Theme) => {
    const ink = box.style.color || color('fg', t, '#222');
    const acc = color('accent', t, '#2f6fec');
    const c = (i: number) => color(t.colors?.[i], t, acc);
    if (fx === 'gradient') {
      // Each paragraph its own (a paragraph is a box of its own, which its box's clip to its words would not see); bullets in the first colour.
      box.classList.add('ns-gt');
      box.style.setProperty('--gt0', acc);
      for (const p of Array.from(box.querySelectorAll<HTMLElement>(':scope > .ns-p'))) {
        p.style.backgroundImage = `linear-gradient(100deg, ${acc}, ${c(1)} 55%, ${c(4)})`;
        p.style.setProperty('-webkit-background-clip', 'text');
        p.style.setProperty('background-clip', 'text');
        p.style.setProperty('-webkit-text-fill-color', 'transparent');
      }
    } else if (fx === 'glow') box.style.textShadow = `0 0 .12em color-mix(in srgb, ${acc} 85%, transparent), 0 0 .45em color-mix(in srgb, ${acc} 60%, transparent)`;
    else if (fx === 'outline') {
      box.style.setProperty('-webkit-text-stroke', `.035em ${ink}`);
      box.style.setProperty('-webkit-text-fill-color', 'transparent');
    } else if (fx === 'neon') {
      // A tube lit white on a dark slide; on a light one the words keep their colour and glow in the accent.
      if (lightness(color('bg', t, '#fff')) < 0.45) {
        box.style.setProperty('-webkit-text-fill-color', `color-mix(in srgb, ${ink} 30%, #fff)`);
        box.style.textShadow = `0 0 .04em #fff, 0 0 .14em ${ink}, 0 0 .38em ${ink}, 0 0 .8em ${ink}`;
      } else box.style.textShadow = `0 0 .06em color-mix(in srgb, ${acc} 70%, transparent), 0 0 .22em color-mix(in srgb, ${acc} 55%, transparent), 0 0 .55em color-mix(in srgb, ${acc} 40%, transparent)`;
    } else if (fx === 'shadow') box.style.textShadow = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${(i * 0.022).toFixed(3)}em ${(i * 0.022).toFixed(3)}em 0 rgba(0,0,0,${(0.2 - i * 0.018).toFixed(3)})`).join(', ');
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
    }
    // A video behind it: playing without sound, over and over, in the slideshow; its first picture in the editor; none
    // in thumbnails and prints (its colour or picture shows there).
    const vurl = b.video && (o.play || o.edit) ? keptUrl(b.video, o) : '';
    if (vurl) {
      const v = el('video', 'ns-bgvideo');
      v.muted = true;
      v.defaultMuted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('muted', '');
      v.preload = o.play ? 'auto' : 'metadata';
      v.src = o.play || vurl.startsWith('data:') ? vurl : `${vurl}#t=0.1`;
      if (o.play) {
        v.autoplay = true;
        void v.play?.()?.catch(() => {});
      }
      root.appendChild(v);
    }
    if (b.fx) root.appendChild(movingBg(b.fx, t, !!(o.play || o.motion)));
    if ((url || vurl) && b.dim) {
      const dim = el('div', 'ns-dim');
      dim.style.opacity = String(Math.max(0, Math.min(0.8, n(b.dim, 0))));
      root.appendChild(dim);
    }
  };

  /** How light a colour is (0 black, 1 white), for #hex ones; others count as light. */
  const lightness = (c: string) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})/i.exec(c);
    if (!m) return 1;
    const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };

  /**
   * A background that moves, in the theme's colours: northern lights, drifting particles, twinkling stars, waves, a slow
   * gradient mesh, a grid running to the horizon, soft floating lights. CSS alone (layers that only move, so the browser
   * hardly works for them); still unless `moving` (the slideshow's slide), slower for those who ask for less motion.
   */
  const movingBg = (fx: string, t: Theme, moving: boolean): HTMLElement => {
    const layer = el('div', 'ns-bgfx');
    if (moving) layer.classList.add('ns-moving');
    const dark = lightness(color('bg', t, '#fff')) < 0.45;
    const acc = color('accent', t, '#2f6fec');
    const c = (i: number) => color(t.colors?.[i], t, acc);
    const mix = (col: string, k: number) => `color-mix(in srgb, ${col} ${Math.round(k * 100)}%, transparent)`;
    const go = (name: string, secs: number, how = 'ease-in-out infinite alternate') => `${name} calc(${secs}s * var(--k)) ${how}`;
    const add = (css: Record<string, string>) => {
      const x = el('div');
      for (const [k, v] of Object.entries(css)) x.style.setProperty(k, v);
      layer.appendChild(x);
      return x;
    };
    if (fx === 'aurora') {
      const blob = (col: string, pos: Record<string, string>, anim: string) =>
        add({ ...pos, width: '78%', height: '115%', 'border-radius': '50%', background: `radial-gradient(closest-side, ${mix(col, dark ? 0.75 : 0.5)}, transparent)`, animation: anim });
      blob(acc, { left: '-18%', top: '-35%' }, go('ns-drift1', 19));
      blob(c(1), { right: '-22%', top: '-12%' }, go('ns-drift2', 25));
      blob(c(4), { left: '18%', bottom: '-50%' }, go('ns-drift3', 31));
    } else if (fx === 'mesh') {
      const k = dark ? 0.7 : 0.5;
      add({
        inset: '-35%',
        background: `radial-gradient(at 22% 28%, ${mix(acc, k)} 0, transparent 45%), radial-gradient(at 78% 22%, ${mix(c(1), k)} 0, transparent 45%), radial-gradient(at 72% 78%, ${mix(c(2), k)} 0, transparent 45%), radial-gradient(at 26% 82%, ${mix(c(4), k)} 0, transparent 45%)`,
        animation: go('ns-turn', 38),
      });
    } else if (fx === 'particles' || fx === 'stars') {
      // Dots in layers of their own sizes, each repeating every 60, 80 or 120 pixels down (so they run on without a seam).
      const ink = fx === 'stars' ? (dark ? '#ffffff' : color('muted', t, '#777')) : '';
      const sets: [string, number, string, number, number][] =
        fx === 'stars'
          ? [
              [ink, 1, '97px 60px', 3.2, 260],
              [ink, 1.4, '151px 80px', 4.6, 340],
              [ink, 2, '223px 120px', 6.1, 420],
            ]
          : [
              [acc, 1.8, '97px 60px', 0, 70],
              [c(1), 2.4, '151px 80px', 0, 100],
              [dark ? '#ffffff' : color('muted', t, '#777'), 1.4, '223px 120px', 0, 140],
            ];
      sets.forEach(([col, r, size, tw, up], i) =>
        add({
          left: '0',
          top: '0',
          width: '100%',
          height: '200%',
          'background-image': `radial-gradient(circle, ${mix(col, fx === 'stars' ? 0.9 : 0.55)} 0 ${r}px, transparent ${r + 1}px)`,
          'background-size': size,
          'background-position': `${(i * 37) % 97}px ${(i * 23) % 60}px`,
          animation: tw ? `${go('ns-twinkle', tw)}, ${go('ns-up', up, 'linear infinite')}` : go('ns-up', up, 'linear infinite'),
        }),
      );
    } else if (fx === 'waves') {
      // A wave that starts and ends at the same height, a slide wide, repeated across a layer twice as wide that slides by one.
      const wave = (col: string, k: number) =>
        `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 120' preserveAspectRatio='none'><path d='M0 60 C200 0 400 0 600 60 C800 120 1000 120 1200 60 V120 H0 Z' fill='${col}' fill-opacity='${k}'/></svg>`)}")`;
      const band = (col: string, k: number, h: string, secs: number) => add({ left: '0', bottom: '0', width: '200%', height: h, background: `${wave(col, k)} repeat-x 0 100% / 50% 100%`, animation: go('ns-side', secs, 'linear infinite') });
      band(acc, dark ? 0.32 : 0.22, '42%', 26);
      band(c(1), dark ? 0.36 : 0.26, '32%', 18);
      band(c(4), dark ? 0.42 : 0.3, '22%', 12);
    } else if (fx === 'grid') {
      const line = mix(acc, dark ? 0.55 : 0.4);
      add({ inset: '0', background: `radial-gradient(ellipse 75% 32% at 50% 64%, ${mix(acc, dark ? 0.32 : 0.18)}, transparent)` });
      const floor = add({ left: '-50%', right: '-50%', bottom: '0', height: '62%', transform: 'perspective(420px) rotateX(58deg)', 'transform-origin': '50% 100%', overflow: 'hidden', '-webkit-mask-image': 'linear-gradient(to top, #000 35%, transparent)', 'mask-image': 'linear-gradient(to top, #000 35%, transparent)' });
      const cells = el('div');
      for (const [k, v] of Object.entries({ position: 'absolute', left: '0', right: '0', top: '-64px', bottom: '0', 'background-image': `linear-gradient(${line} 2px, transparent 2px), linear-gradient(90deg, ${line} 2px, transparent 2px)`, 'background-size': '64px 64px', animation: go('ns-cell', 1.8, 'linear infinite') }))
        cells.style.setProperty(k, v);
      floor.appendChild(cells);
    } else {
      // Bokeh: soft lights, placed the same each time (so a slide's picture is always the same), floating slowly.
      const lights: [number, number, number, number, number][] = [
        [8, 18, 16, 0, 23],
        [70, 10, 22, 1, 29],
        [40, 55, 12, 4, 19],
        [82, 60, 18, 2, 26],
        [18, 70, 20, 1, 31],
        [55, 28, 9, 0, 17],
        [90, 32, 10, 4, 21],
        [30, 8, 8, 2, 24],
        [62, 80, 14, 0, 27],
      ];
      lights.forEach(([x, y, size, ci, secs], i) => {
        const col = ci === 0 ? acc : c(ci);
        add({ left: `${x}%`, top: `${y}%`, width: `${size}%`, 'aspect-ratio': '1', 'border-radius': '50%', background: `radial-gradient(circle, ${mix(col, dark ? 0.55 : 0.38)} 0, ${mix(col, dark ? 0.22 : 0.15)} 55%, transparent 70%)`, animation: go('ns-float', secs), 'animation-delay': `-${(i * 3.7).toFixed(1)}s` });
      });
    }
    return layer;
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
    if (o.play) {
      root.classList.add('ns-canplay');
      root.style.setProperty('--n-glow', color('accent', deck.theme, '#7aa2ff'));
      // The parts a click on which runs effects of their own (taps) say so to the pointer.
      for (const a of s.anims ?? []) {
        const tr = a.on === 'tap' && a.trigger ? root.querySelector<HTMLElement>(`.ns-el[data-id="${CSS.escape(a.trigger)}"]`) : null;
        if (tr) tr.style.cursor = 'pointer';
      }
    }
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
    // Code as large as its size, or smaller to fit its box: its letters are all as wide, so it scales by what overflows.
    for (const box of Array.from(root.querySelectorAll<HTMLElement>('.ns-code[data-fit]'))) {
      box.style.removeProperty('--fs');
      const cw = box.clientWidth;
      const ch = box.clientHeight;
      if (!cw || !ch) continue;
      const k = Math.min(1, cw / Math.max(1, box.scrollWidth), ch / Math.max(1, box.scrollHeight));
      if (k < 0.999) {
        box.style.setProperty('--fs', String(Math.max(0.2, Math.floor(k * 100) / 100)));
        // Lines laid out again at the smaller size may still be a little over: one more step.
        const k2 = Math.min(1, cw / Math.max(1, box.scrollWidth), ch / Math.max(1, box.scrollHeight));
        if (k2 < 0.999) box.style.setProperty('--fs', String(Math.max(0.2, Math.floor(k * k2 * 100) / 100)));
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
        if (SLIDE_LINK.test(h) || href(h)) n2.link = h;
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
      // A tap's effects run when their part is clicked, outside the build.
      if (a.on === 'tap') continue;
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
    // What a tap brings in waits for its click (printed, as the build's end, it shows).
    if (step === Infinity) return;
    for (const a of s.anims ?? []) {
      if (a.on !== 'tap' || a.type !== 'in' || seen.has(`${a.el}:`)) continue;
      seen.add(`${a.el}:`);
      root.querySelector<HTMLElement>(`.ns-el[data-id="${CSS.escape(a.el)}"]`)?.classList.add('ns-hidden');
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
      // The web format's own.
      case 'blur':
        k = [{ opacity: 0, filter: 'blur(18px)' }, { opacity: 1, filter: 'blur(0px)' }];
        break;
      case 'rise':
        k = [{ opacity: 0, translate: '0 64px' }, { opacity: 1, translate: '0 0' }];
        break;
      case 'drop':
        k = [
          { opacity: 0, translate: `0 ${-Math.min(260, elData.y + elData.h + 40)}px`, offset: 0 },
          { opacity: 1, translate: '0 0', offset: 0.62, easing: 'ease-out' },
          { translate: '0 -16px', offset: 0.8, easing: 'ease-in' },
          { translate: '0 0', offset: 1 },
        ];
        break;
      case 'flip':
        k = [{ opacity: 0, transform: 'perspective(900px) rotateY(90deg)' }, { opacity: 1, transform: 'perspective(900px) rotateY(0deg)' }];
        break;
      case 'swing':
        k = [
          { opacity: 0, transform: 'perspective(700px) rotateX(-90deg)', transformOrigin: '50% 0', offset: 0 },
          { opacity: 1, transform: 'perspective(700px) rotateX(18deg)', transformOrigin: '50% 0', offset: 0.55 },
          { transform: 'perspective(700px) rotateX(-8deg)', transformOrigin: '50% 0', offset: 0.8 },
          { transform: 'perspective(700px) rotateX(0deg)', transformOrigin: '50% 0', offset: 1 },
        ];
        break;
      case 'roll':
        k = [{ opacity: 0, translate: `${-Math.min(320, elData.x + elData.w + 40)}px 0`, transform: 'rotate(-180deg)' }, { opacity: 1, translate: '0 0', transform: 'rotate(0deg)' }];
        break;
      case 'pop':
        k = [
          { opacity: 0, transform: 'scale(.35)', offset: 0 },
          { opacity: 1, transform: 'scale(1.12)', offset: 0.65 },
          { transform: 'scale(1)', offset: 1 },
        ];
        break;
      case 'typewriter':
        // A part with no words to type: shown from left to right, a step at a time.
        k = [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }];
        break;
      case 'draw':
        k = [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }];
        break;
      case 'count':
        k = [{ opacity: 0 }, { opacity: 1 }];
        break;
      case 'glow': {
        const g = color('accent', deck.theme, '#7aa2ff');
        k = [{ filter: `drop-shadow(0 0 0px ${g})` }, { filter: `drop-shadow(0 0 22px ${g}) drop-shadow(0 0 6px ${g})` }, { filter: `drop-shadow(0 0 0px ${g})` }];
        break;
      }
      case 'wiggle':
        k = [{ transform: 'rotate(0deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0deg)' }];
        break;
      case 'heartbeat':
        k = [
          { transform: 'scale(1)', offset: 0 },
          { transform: 'scale(1.16)', offset: 0.14 },
          { transform: 'scale(1)', offset: 0.28 },
          { transform: 'scale(1.12)', offset: 0.42 },
          { transform: 'scale(1)', offset: 0.7 },
          { transform: 'scale(1)', offset: 1 },
        ];
        break;
      case 'jello':
        k = [
          { transform: 'skew(0deg, 0deg)', offset: 0 },
          { transform: 'skew(-12.5deg, -12.5deg)', offset: 0.22 },
          { transform: 'skew(6.25deg, 6.25deg)', offset: 0.33 },
          { transform: 'skew(-3.1deg, -3.1deg)', offset: 0.44 },
          { transform: 'skew(1.6deg, 1.6deg)', offset: 0.55 },
          { transform: 'skew(-0.8deg, -0.8deg)', offset: 0.66 },
          { transform: 'skew(0deg, 0deg)', offset: 1 },
        ];
        break;
      case 'flash':
        k = [{ opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }];
        break;
      case 'bob':
        k = [{ translate: '0 0' }, { translate: '0 -14px' }, { translate: '0 0' }];
        break;
      default:
        k = [{ opacity: 1 }, { opacity: 1 }];
    }
    return a.type === 'out' ? k.slice().reverse().map((x, i, all) => ({ ...x, offset: x.offset !== undefined ? 1 - (x.offset as number) : i / Math.max(1, all.length - 1) })) : k;
  };

  /** Easings by name: their own curve where the browser draws one (linear()), else the nearest it has. */
  const EASES: Record<string, [string, string]> = {
    smooth: ['cubic-bezier(.2,.7,.3,1)', 'cubic-bezier(.2,.7,.3,1)'],
    spring: ['linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1)', 'cubic-bezier(.34,1.56,.64,1)'],
    bounce: ['linear(0, 0.004, 0.016, 0.035, 0.063, 0.098, 0.141 13.6%, 0.25, 0.391, 0.563, 0.765, 1, 0.891 40.9%, 0.848, 0.813, 0.785, 0.766, 0.754, 0.75, 0.754, 0.766, 0.785, 0.813, 0.848, 0.891 68.2%, 1 72.7%, 0.973, 0.953, 0.941, 0.938, 0.941, 0.953, 0.973, 1, 0.988, 0.984, 0.988, 1)', 'cubic-bezier(.68,-0.55,.27,1.55)'],
    linear: ['linear', 'linear'],
    snap: ['cubic-bezier(.85,0,.15,1)', 'cubic-bezier(.85,0,.15,1)'],
  };
  /** The effects whose keyframes have their own shape: they keep time evenly unless the animation says otherwise. */
  const SHAPED = new Set(['bounce', 'drop', 'pop', 'swing', 'heartbeat', 'jello', 'wiggle', 'flash', 'bob', 'shake', 'pulse', 'glow']);
  const easeOf = (a: Anim): [string, string] => (a.ease && EASES[a.ease] ? EASES[a.ease] : SHAPED.has(a.fx) ? EASES.linear : EASES.smooth);
  /** Web Animations, with a plainer easing where the browser does not know the one asked for. */
  const animate = (t: Element, k: Keyframe[], o: KeyframeAnimationOptions, alt: string): Animation => {
    try {
      return t.animate(k, o);
    } catch {
      return t.animate(k, { ...o, easing: alt });
    }
  };

  /**
   * A text's words (or its letters) as pieces that move one by one: each a span (letters in their word's, so lines
   * still break between words). The words of a paragraph, a text part or a shape, a code part's code; none for others,
   * and none for so many that one by one would take too long.
   */
  const split = (t: HTMLElement, by: 'word' | 'letter'): HTMLElement[] => {
    const root = t.classList.contains('ns-p') ? t : t.querySelector<HTMLElement>(':scope > .ns-txt, :scope > .ns-code');
    if (!root) return [];
    const texts: Text[] = [];
    const walker = doc.createTreeWalker(root, 4);
    for (let x = walker.nextNode(); x; x = walker.nextNode()) if (x.nodeValue?.trim() && !x.parentElement?.closest('.ns-ln')) texts.push(x as Text);
    const letters = texts.reduce((k, x) => k + (x.nodeValue ?? '').replace(/\s+/g, '').length, 0);
    const mode = by === 'letter' && letters > 1500 ? 'word' : by;
    if (mode === 'word' && texts.reduce((k, x) => k + (x.nodeValue ?? '').split(/\s+/).length, 0) > 1500) return [];
    const out: HTMLElement[] = [];
    for (const tn of texts) {
      const frag = doc.createDocumentFragment();
      for (const bit of (tn.nodeValue ?? '').split(/(\s+)/)) {
        if (!bit) continue;
        if (/^\s+$/.test(bit)) {
          frag.appendChild(doc.createTextNode(bit));
          continue;
        }
        const w = el('span', 'ns-w');
        if (mode === 'letter')
          for (const ch of Array.from(bit)) {
            const c = el('span', 'ns-ch');
            c.textContent = ch;
            w.appendChild(c);
            out.push(c);
          }
        else {
          w.textContent = bit;
          out.push(w);
        }
        frag.appendChild(w);
      }
      tn.replaceWith(frag);
    }
    return out;
  };

  /** Lines, shapes' outlines and icons drawn as a pen would, their fills and words coming after; other parts shown from the left. */
  const drawFx = (t: HTMLElement, dur: number, ease: string, alt: string): Animation[] => {
    const wipe = (x: Element, d: number) => animate(x, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: d, easing: ease }, alt);
    const geo = Array.from(t.querySelectorAll<SVGGeometryElement>(':scope > svg.ns-shape > :not(defs), :scope > svg.ns-icon > *')).filter((x) => typeof x.getTotalLength === 'function');
    if (!geo.length) return [wipe(t, dur)];
    const out: Animation[] = [];
    for (const x of geo) {
      let len = 0;
      try {
        len = x.getTotalLength();
      } catch {}
      if (!(len > 0)) len = 1000;
      const cs = win.getComputedStyle(x);
      const stroked = !!cs.stroke && cs.stroke !== 'none';
      const filled = !!cs.fill && cs.fill !== 'none' && !/,\s*0\)$/.test(cs.fill);
      // A shape with no outline is drawn with one of its fill's colour, which goes once it is filled.
      const pen: Keyframe = stroked ? {} : { stroke: cs.fill, strokeWidth: '3px' };
      out.push(animate(x, [{ ...pen, strokeDasharray: `${len} ${len}`, strokeDashoffset: `${len}` }, { ...pen, strokeDasharray: `${len} ${len}`, strokeDashoffset: '0' }], { duration: dur * (filled ? 0.7 : 1), easing: ease }, alt));
      if (filled) out.push(animate(x, [{ fillOpacity: 0 }, { fillOpacity: 0, offset: 0.55 }, { fillOpacity: 1 }], { duration: dur, easing: 'linear' }, 'linear'));
    }
    const words = t.querySelector<HTMLElement>(':scope > .ns-txt');
    if (words) out.push(animate(words, [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: dur, easing: 'linear' }, 'linear'));
    return out;
  };

  /** The numbers in a part's words counting up from nothing to theirs, as they are written (decimals, thousands' commas). */
  const countFx = (t: HTMLElement, dur: number): Animation[] => {
    const re = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
    const items: { node: Text; text: string }[] = [];
    const walker = doc.createTreeWalker(t, 4);
    for (let x = walker.nextNode(); x; x = walker.nextNode()) {
      re.lastIndex = 0;
      if (re.test(x.nodeValue ?? '') && !x.parentElement?.closest('.ns-ln')) items.push({ node: x as Text, text: x.nodeValue ?? '' });
    }
    const carrier = animate(t, [{ opacity: 1 }, { opacity: 1 }], { duration: dur, easing: 'linear' }, 'linear');
    if (!items.length) return [carrier];
    const fmt = (v: number, as: string) => {
      const dec = /\.(\d+)$/.exec(as)?.[1].length ?? 0;
      let s = v.toFixed(dec);
      if (as.includes(',')) {
        const [i, f] = s.split('.');
        s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? `.${f}` : '');
      }
      return s;
    };
    const paint = (p: number) => {
      const k = 1 - Math.pow(1 - p, 3);
      for (const it of items) it.node.nodeValue = it.text.replace(re, (m) => fmt(Number(m.replace(/,/g, '')) * k, m));
    };
    const was = t.style.fontVariantNumeric;
    t.style.fontVariantNumeric = 'tabular-nums';
    paint(0);
    const tick = () => {
      if (carrier.playState !== 'running') return;
      paint(Math.min(1, (Number(carrier.currentTime) || 0) / dur));
      win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
    const done = () => {
      for (const it of items) it.node.nodeValue = it.text;
      t.style.fontVariantNumeric = was;
    };
    carrier.addEventListener('finish', done);
    carrier.addEventListener('cancel', done);
    return [carrier];
  };

  /** Confetti bursting from a part, in the theme's colours, drawn on a canvas over its slide while it falls. */
  const confettiFx = (t: HTMLElement, dur: number, deck: Deck): Animation[] => {
    const slideEl = t.closest<HTMLElement>('.ns-slide');
    if (!slideEl) return [];
    const SW = parseFloat(slideEl.style.width) || W;
    const SHh = parseFloat(slideEl.style.height) || H(deck);
    const sr = slideEl.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    const k = sr.width / SW || 1;
    const cx = (r.left + r.width / 2 - sr.left) / k;
    const cy = (r.top + r.height / 2 - sr.top) / k;
    const cv = el('canvas', 'ns-confetti');
    cv.width = SW;
    cv.height = SHh;
    cv.style.width = px(SW);
    cv.style.height = px(SHh);
    const g = cv.getContext('2d');
    if (!g) return [];
    slideEl.appendChild(cv);
    const t0 = deck.theme;
    const cols = [color('accent', t0, '#2f6fec'), ...(t0.colors ?? []).map((c) => color(c, t0, '#f2a93b')), '#ffd43b'];
    const bits = Array.from({ length: 150 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const v = 9 + Math.random() * 13;
      return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, w: 9 + Math.random() * 9, h: 5 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] };
    });
    const carrier = animate(cv, [{ opacity: 1 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }], { duration: dur, fill: 'forwards', easing: 'linear' }, 'linear');
    let last = 0;
    const tick = () => {
      if (!cv.isConnected || carrier.playState !== 'running') return;
      const now = Number(carrier.currentTime) || 0;
      const dt = Math.min(3, Math.max(0, now - last) / 16.7);
      last = now;
      g.clearRect(0, 0, SW, SHh);
      for (const b of bits) {
        b.vy += 0.42 * dt;
        b.vx *= Math.pow(0.985, dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.r += b.vr * dt;
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.r);
        g.fillStyle = b.c;
        g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.max(0.15, Math.abs(Math.cos(b.r * 1.7))));
        g.restore();
      }
      win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
    const done = () => cv.remove();
    carrier.addEventListener('finish', done);
    carrier.addEventListener('cancel', done);
    return [carrier];
  };

  /**
   * One effect on its part (or paragraph): its animations, each tracked by the slideshow. Words or letters one by one
   * (`by`, a typewriter's letters), drawn lines, numbers counting, confetti, or the effect's keyframes; again and
   * again for an emphasis that keeps going.
   */
  const effectOf = (f: Fx, t: HTMLElement, deck: Deck): Animation[] => {
    const a = f.a;
    const dur = Math.max(1, n(a.dur, 500));
    const out = a.type === 'out';
    const [ease, alt] = easeOf(a);
    const iterations = a.loop && a.type === 'em' ? Infinity : 1;
    const by = a.by ?? (a.fx === 'typewriter' ? 'letter' : undefined);
    if (by && a.fx !== 'confetti' && a.fx !== 'count' && a.fx !== 'draw') {
      const pieces = split(t, by);
      if (pieces.length > 1) {
        const type = a.fx === 'typewriter';
        const each = type ? Math.max(16, Math.min(160, dur / pieces.length)) : Math.max(180, dur * 0.55);
        const gap = Math.max(0, (dur - each) / (pieces.length - 1));
        return pieces.map((p, i) =>
          animate(
            p,
            type ? (out ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }]) : keyframes(f, p, deck),
            { duration: each, delay: (out ? pieces.length - 1 - i : i) * gap, easing: type ? 'steps(1, end)' : ease, fill: out ? 'forwards' : 'backwards', iterations },
            alt,
          ),
        );
      }
    }
    if (a.fx === 'draw' && !out) return drawFx(t, dur, ease, alt);
    if (a.fx === 'count' && !out) return countFx(t, dur);
    if (a.fx === 'confetti') return confettiFx(t, dur, deck);
    return [animate(t, keyframes(f, t, deck), { duration: dur, easing: ease, iterations, fill: out || a.fx === 'grow' ? 'forwards' : 'none' }, alt)];
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
    // What every slide is drawn with here: videos play when clicked, quizzes are answered (the answers kept for the
    // show), live parts run where the slideshow says they do.
    const answers = o.answers ?? answersFor(deck);
    const pass: DrawOpts = { asset: o.asset, web: o.web, video: o.video, hint: o.hint, katex: o.katex, locale: o.locale, play: true, live: o.live, frame: o.frame, answers };
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
    // The deck's progress bar: a thin line across the top of its slides, as far as the slideshow has come.
    const prog = deck.progress ? el('div', 'ns-prog') : null;
    if (prog) {
      prog.style.background = color('accent', deck.theme, '#2f6fec');
      frame.appendChild(prog);
    }

    let pos = Math.max(0, list.findIndex((x) => x.i === (o.at ?? list[0].i)));
    let step = 0;
    let layer: HTMLElement | null = null;
    /** Effects waiting for their start (a timer each), those moving now, and those that keep going (until the slide goes). */
    let pending: { timer: number; done: () => void }[] = [];
    let running: Animation[] = [];
    let loops: Animation[] = [];
    const stopLoops = () => {
      const all = loops;
      loops = [];
      for (const a of all)
        try {
          a.cancel();
        } catch {}
    };
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
      if (prog) prog.style.width = px((W * (pos + 1)) / list.length);
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
    /** One effect at its time: its part shown (an entrance), moved, then hidden (an exit) or left grown; one that keeps going goes on. */
    const startFx = (f: Fx, at: number) => {
      const t = layer ? targetOf(layer, f) : null;
      if (!t) return;
      const out = f.a.type === 'out';
      const grow = f.a.fx === 'grow';
      const end = () => {
        if (out) t.classList.add('ns-hidden');
        if (grow) t.style.scale = '1.2';
      };
      const run = () => {
        if (f.a.type === 'in') t.classList.remove('ns-hidden');
        if (f.a.fx === 'appear' || reduced()) return end();
        const made = effectOf(f, t, deck);
        if (!made.length) return end();
        if (f.a.loop && f.a.type === 'em') {
          loops.push(...made);
          return;
        }
        running.push(...made);
        let left = made.length;
        let over = false;
        const finish = () => {
          if (over) return;
          over = true;
          end();
          running = running.filter((x) => !made.includes(x));
          if (out || grow)
            for (const x of made)
              try {
                x.cancel();
              } catch {}
          if (!running.length && !pending.length) scheduleAuto();
        };
        for (const an of made) {
          an.addEventListener('finish', () => --left <= 0 && finish(), { once: true });
          an.addEventListener('cancel', finish, { once: true });
        }
      };
      if (at <= 0) run();
      else {
        const p = { timer: 0, done: () => (f.a.type === 'in' && t.classList.remove('ns-hidden'), end()) };
        p.timer = win.setTimeout(() => {
          pending = pending.filter((x) => x !== p);
          run();
        }, at);
        pending.push(p);
      }
    };
    const playGroup = (g: number) => {
      const s = list[pos].s;
      const { fx } = plan(s);
      for (const f of fx.filter((x) => x.group === g)) startFx(f, f.begin + n(f.a.delay, 0));
      if (!running.length && !pending.length) scheduleAuto();
    };
    /** A click on a part that runs effects of its own (a tap): they run, together, each time. Whether there were any. */
    const tap = (target: Element | null): boolean => {
      const s = list[pos]?.s;
      if (!s || !layer || !target) return false;
      const ids = new Set<string>();
      for (let x = target.closest<HTMLElement>('.ns-el'); x && layer.contains(x); x = x.parentElement?.closest<HTMLElement>('.ns-el') ?? null) ids.add(x.dataset.id ?? '');
      const taps = (s.anims ?? []).filter((a) => a.on === 'tap' && !!a.trigger && ids.has(a.trigger));
      for (const a of taps) startFx({ a, group: -1, begin: 0, end: 0 }, n(a.delay, 0));
      return taps.length > 0;
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
        // A live part's frame cannot be copied as it runs: it comes in as the rest do.
        if (!na || !nb || na.querySelector('iframe') || nb.querySelector('iframe')) continue;
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
    /**
     * The web format's transitions, from the slide that goes (`old`) to the one that comes (`l`): the two turn as a
     * cube's sides, flip over as a card, dissolve, open in a circle, through blinds, or glitch in.
     */
    const turn = (old: HTMLElement, l: HTMLElement, fx: string, side: string, dur: number) => {
      const opts: KeyframeAnimationOptions = { duration: dur, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' };
      const made: Animation[] = [];
      const across = side === 'left' || side === 'right';
      // From the right (or below), the slides turn to the left (or up).
      const sign = side === 'right' || side === 'down' ? 1 : -1;
      const rot = (deg: number) => (across ? `rotateY(${-sign * deg}deg)` : `rotateX(${sign * deg}deg)`);
      const tidy: (() => void)[] = [];
      const hold = (x: HTMLElement, css: Record<string, string>) => {
        for (const [k, v] of Object.entries(css)) x.style.setProperty(k, v);
        tidy.push(() => {
          for (const k of Object.keys(css)) x.style.removeProperty(k);
        });
      };
      if (fx === 'cube' || fx === 'flip') {
        hold(frame, { perspective: `${Math.round(W * (fx === 'cube' ? 1.6 : 2.2))}px` });
        const depth = fx === 'cube' ? (across ? W : SH) / 2 : 0;
        for (const x of [old, l]) hold(x, { 'transform-origin': `50% 50% -${depth}px`, 'backface-visibility': 'hidden', '-webkit-backface-visibility': 'hidden' });
        const deg = fx === 'cube' ? 90 : 180;
        made.push(old.animate([{ transform: rot(0) }, { transform: rot(deg) }], opts));
        made.push(l.animate([{ transform: rot(-deg) }, { transform: rot(0) }], opts));
      } else if (fx === 'dissolve') {
        made.push(l.animate([{ opacity: 0, filter: 'blur(14px) saturate(1.4)' }, { opacity: 1, filter: 'blur(0px) saturate(1)' }], { ...opts, easing: 'ease-out' }));
      } else if (fx === 'circle') {
        made.push(l.animate([{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }], opts));
      } else if (fx === 'blinds') {
        // Eight bands across, each opening downwards: one shape of eight boxes (joined along the left edge).
        const bands = 8;
        const shape = (k: number) =>
          `polygon(${Array.from({ length: bands }, (_, i) => {
            const y0 = (i * 100) / bands;
            const y1 = y0 + (k * 100) / bands;
            return `0% ${y0}%, 100% ${y0}%, 100% ${y1}%, 0% ${y1}%, 0% ${y0}%`;
          }).join(', ')})`;
        made.push(l.animate([{ clipPath: shape(0) }, { clipPath: shape(1) }], { ...opts, easing: 'cubic-bezier(.3,0,.2,1)' }));
      } else {
        // Glitch: the new slide arrives in slices, shifted and off colour, then settles.
        made.push(
          l.animate(
            [
              { opacity: 0, transform: 'translate(0,0)', clipPath: 'inset(0 0 0 0)', filter: 'none', offset: 0 },
              { opacity: 1, transform: 'translate(-26px,6px)', clipPath: 'inset(12% 0 58% 0)', filter: 'hue-rotate(90deg) saturate(2.2)', offset: 0.14 },
              { transform: 'translate(20px,-5px)', clipPath: 'inset(44% 0 22% 0)', filter: 'hue-rotate(-70deg) contrast(1.5)', offset: 0.28 },
              { transform: 'translate(-12px,3px)', clipPath: 'inset(70% 0 4% 0)', filter: 'hue-rotate(40deg)', offset: 0.42 },
              { transform: 'translate(9px,0)', clipPath: 'inset(0 0 0 0)', filter: 'contrast(1.3)', offset: 0.58 },
              { transform: 'translate(-4px,0)', clipPath: 'inset(0 0 0 0)', filter: 'none', offset: 0.76 },
              { opacity: 1, transform: 'translate(0,0)', clipPath: 'inset(0 0 0 0)', filter: 'none', offset: 1 },
            ],
            { duration: dur, easing: 'linear', fill: 'both' },
          ),
        );
        made.push(old.animate([{ opacity: 1, transform: 'translate(0,0)' }, { opacity: 1, transform: 'translate(14px,0)', offset: 0.2 }, { opacity: 0, transform: 'translate(-10px,0)', offset: 0.5 }, { opacity: 0 }], { duration: dur, easing: 'linear', fill: 'both' }));
      }
      running.push(...made);
      let over = false;
      const finish = () => {
        if (over) return;
        over = true;
        running = running.filter((x) => !made.includes(x));
        old.remove();
        for (const x of made)
          try {
            x.cancel();
          } catch {}
        for (const t of tidy) t();
        if (!running.length && !pending.length) scheduleAuto();
      };
      const lastOne = made[made.length - 1];
      for (const x of made) x.addEventListener('cancel', finish, { once: true });
      lastOne.addEventListener('finish', finish, { once: true });
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
      // The slide that goes: its live parts are told, its effects that kept going stop.
      for (const old of Array.from(frame.querySelectorAll(':scope > .ns-layer'))) {
        if (old === l) continue;
        tellFrames(old, { ev: 'leave' });
        if (old !== animateFrom) old.remove();
      }
      autoplay(next, s);
      if (!animateFrom) return;
      const tr = s.transition;
      const old = animateFrom;
      if (!tr || tr.fx === 'none' || reduced()) return old.remove();
      if (tr.fx === 'morph') return morph(old, l, deck.slides[fromAt], s, Math.max(1, n(tr.dur, 1000)));
      if (tr.fx === 'cube' || tr.fx === 'flip' || tr.fx === 'dissolve' || tr.fx === 'circle' || tr.fx === 'blinds' || tr.fx === 'glitch') return turn(old, l, tr.fx, tr.dir ?? 'right', Math.max(1, n(tr.dur, 800)));
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
      stopLoops();
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
        tellFrames(layer, { ev: 'step', step });
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
        tellFrames(layer, { ev: 'step', step });
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
      // A part that runs effects of its own when clicked (a tap): that, not the next step.
      if (tap(e.target as Element)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const linkEl = (e.target as HTMLElement).closest<HTMLElement>('[data-link], a[href]');
      if (linkEl) {
        const h = linkEl.dataset.link ?? linkEl.getAttribute('href') ?? '';
        const m = /^#(\d{1,3})$/.exec(h);
        e.preventDefault();
        e.stopPropagation();
        if (m) {
          const target = deck.slides[Number(m[1]) - 1];
          if (target) go(deck.slides.indexOf(target), 0, true);
        } else if (h === '#next' || h === '#prev' || h === '#first' || h === '#last') jump(h);
        else if (href(h)) win.open(h, '_blank', 'noopener,noreferrer');
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
    /** A link to the next slide, the one before, the first or the last (past what is left of this one's build). */
    const jump = (h: string) => {
      const to = h === '#next' ? list[pos + 1] : h === '#prev' ? list[pos - 1] : h === '#first' ? list[0] : list[list.length - 1];
      if (to && to !== list[pos]) go(to.i, 0, true);
    };
    /** What a live part's page asks of the slideshow: the next step or slide, the one before, a slide by its number, a key it left. */
    const act = (d: { act: string; n?: unknown; key?: unknown }) => {
      if (d.act === 'next') next();
      else if (d.act === 'prev') prev();
      else if (d.act === 'go' && typeof d.n === 'number') {
        const target = deck.slides[Math.round(d.n) - 1];
        if (target) go(deck.slides.indexOf(target), 0, true);
      } else if (d.act === 'key') {
        const k = String(d.key);
        if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown') next();
        else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') prev();
        else if (k === 'Home') go(list[0].i);
        else if (k === 'End') go(list[list.length - 1].i, Infinity);
        else if (k === 'Escape' && o.mode === 'full') o.onExit?.();
      }
    };
    const mine = { stage, act };
    shows.add(mine);
    // Parts that tilt towards the pointer follow it.
    let tilted: HTMLElement | null = null;
    const untilt = () => {
      if (tilted) tilted.style.transform = '';
      tilted = null;
    };
    stage.addEventListener('pointermove', (e) => {
      const p = e.pointerType === 'mouse' && !tool ? (e.target as HTMLElement).closest?.<HTMLElement>('.ns-el[data-hover=tilt]') : null;
      if (tilted && tilted !== p) untilt();
      if (!p) return;
      const r = p.getBoundingClientRect();
      const x = (e.clientX - r.left) / Math.max(1, r.width) - 0.5;
      const y = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
      p.style.transform = `perspective(900px) rotateY(${(x * 16).toFixed(2)}deg) rotateX(${(-y * 16).toFixed(2)}deg) scale(1.02)`;
      tilted = p;
    });
    stage.addEventListener('pointerleave', untilt);
    let typed = '';
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
      const k = e.key;
      // A quiz's choice (or its Check) takes Enter and Space as a click.
      if (tag === 'BUTTON' && (k === 'Enter' || k === ' ') && (e.target as HTMLElement).closest('.ns-quiz')) return;
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
        shows.delete(mine);
        stopLoops();
        if (layer) tellFrames(layer, { ev: 'leave' });
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
    // Its live parts run here, each in a sandboxed frame of its own.
    const s = show(wrap, deck, { mode: 'viewer', keys: true, katex, live: true });
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

  return { css, style, slide, part, words, fit, read, show, print, steps, morphPairs, boot, maths, tokens, codeLook };
}

let quiet: SlidesRuntime | null = null;
/**
 * Code's words told apart as the slides' runtime tells them (its own tokenizer), outside a browser: the PowerPoint file
 * colours code as the slide does. A runtime of no window: its tokenizer and looks need none.
 */
export function codeTokens(code: string, lang?: string): [string, string][] {
  quiet ??= slidesRuntime({ document: {} } as unknown as Window, {});
  return quiet.tokens(code, lang);
}

/** A code part's colours in a look, outside a browser (the PowerPoint file's). */
export function codeLookOf(look: string | undefined, t: Theme): CodeLook {
  quiet ??= slidesRuntime({ document: {} } as unknown as Window, {});
  return quiet.codeLook(look, t);
}
