// The page editor's writing, as in Notion. It runs inside the page's frame beside the visual editor (editor.ts),
// which hands it what it needs (`Core`) and asks it to draw, act and clean up (`Writing`). Words flow from block to
// block: Enter makes the next block of the right kind (and leaves a list from an empty item), Backspace at a block's
// start joins it to the block before, the arrows go on into the block above or below, Tab and Shift+Tab nest and
// un-nest a list's items (and Tab puts a block under the list before it). An item under another turned into a
// paragraph, a heading, a quote… keeps its place there, held by its item (li.n-block), with the items under it, as
// Notion keeps a block under its parent. Markdown works as you type ("# ", "- ", "1. ", "[] ", "> ", "```", "---", **bold**,
// *italic*, `code`, ~~struck~~). "/" lists the blocks to add, filtered as you type. Beside the block under the
// pointer sit a + (adds a block under it) and a ⋮⋮ (drag it elsewhere, or click it for its menu: Turn into, Colour,
// Duplicate, Move, Copy, Delete, Ask the agent). Shift+click or a drag down the margin picks several blocks. To-dos
// tick and toggles fold in Edit too, a table of contents keeps up with the headings, a page gets an icon and a cover,
// and pictures dropped or pasted in land where they fall (the app makes them small enough to live in the page).
//
// What it adds to the page uses the kit's classes (shared/page-kit.ts), so it suits the page light or dark; what is
// its own (hints in empty blocks, handles, menus) is drawn over the page or stripped before the page is given back.
// Every word it shows comes from the editor's labels, in the app's language.
//
// Like the editor, the function runs in the browser: its source is sent as text, so it uses only its argument and
// the browser's own globals.

/** What a block is, for writing in it. */
export type Kind = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'bullet' | 'number' | 'todo' | 'quote' | 'code' | 'toggle' | 'callout';

/** Where the caret goes in a block written in. */
export interface At {
  off?: number;
  end?: boolean;
  /** On its top or bottom line, as near to this x as it goes. */
  x?: number;
  edge?: 'top' | 'bottom';
  /** Where a click was. */
  point?: { x: number; y: number };
  /** Its words selected. */
  all?: boolean;
}

/** What a change hands back: where to write next, a part to pick, or only whether something changed. */
export type Next = { write: HTMLElement; at?: At } | { pick: Element } | boolean | null | undefined | void;

/** What the editor hands the writing. */
export interface Core {
  L: (k: string, fallback: string) => string;
  send: (m: Record<string, unknown>) => void;
  shadow: ShadowRoot;
  look: { accent: string; panel: string; line: string; ink: string; muted: string; dark: boolean };
  isUi: (el: Element | null) => boolean;
  wordy: (el: Element) => boolean;
  nameOf: (el: Element) => string;
  pathOf: (el: Element) => number[];
  byPath: (p: unknown) => Element | null;
  under: (x: number, y: number) => Element | null;
  sel: () => Element | null;
  editing: () => HTMLElement | null;
  select: (el: Element | null) => void;
  /** Writes in `h` (finishing the block written in before), the caret where `at` says. */
  write: (h: Element, at?: At) => void;
  finish: () => void;
  /** A change of the page, as one step to undo: nothing is kept when `f` says nothing changed. */
  change: (f: () => Next) => void;
  redraw: () => void;
  /** Before the words being written change in a way the browser does not announce (a mark of Markdown, a colour). */
  noteTyping: () => void;
  offset: (h: Element) => number | null;
  length: (h: Element) => number;
  copy: (html: string, name: string) => void;
  canAsk: () => boolean;
}

/** What the writing does for the editor. */
export interface Writing {
  draw(): void;
  /** The page is in place: what follows it (a table of contents an agent left empty) is brought up to date, not counted as a change. */
  ready(): void;
  act(a: string, arg: any): boolean;
  started(h: HTMLElement): void;
  finished(h: HTMLElement): void;
  selected(el: Element | null): void;
  restored(): void;
  clean(root: Element): void;
  changed(): void;
  info(el: Element): Record<string, unknown>;
  page(): Record<string, unknown>;
  picked(): Element[];
  unitOf(h: Element): Element;
  css: string;
}

export function writing(E: Core): Writing {
  const L = E.L;
  const doc = document;
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const isMod = (e: KeyboardEvent | MouseEvent) => e.metaKey || e.ctrlKey;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = ''): HTMLElementTagNameMap[K] => {
    const x = doc.createElement(tag);
    if (cls) x.className = cls;
    return x;
  };
  const skip = (x: Element | null) => !!x && (/^(SCRIPT|STYLE|TEMPLATE|LINK|META|NOSCRIPT|BASE)$/.test(x.tagName) || E.isUi(x));
  const prevSib = (u: Element) => {
    let x = u.previousElementSibling;
    while (x && skip(x)) x = x.previousElementSibling;
    return x;
  };
  const nextSib = (u: Element) => {
    let x = u.nextElementSibling;
    while (x && skip(x)) x = x.nextElementSibling;
    return x;
  };
  const kitPage = () => doc.body.classList.contains('n-page');

  // ---- what blocks are -------------------------------------------------------------------------------------------
  const isList = (x: Element | null | undefined): x is HTMLElement => !!x && (x.tagName === 'UL' || x.tagName === 'OL');
  /**
   * A block under a list's item keeps its place there, as Notion keeps a block under its parent: an item of the list
   * holds it (li.n-block, no marker of its own), with the items under it after it. The block it holds, or null.
   */
  const blockIn = (li: Element | null | undefined): HTMLElement | null => {
    if (!li || li.tagName !== 'LI' || !li.classList.contains('n-block')) return null;
    const b = li.firstElementChild;
    return b && !isList(b) ? (b as HTMLElement) : null;
  };
  /** The item that holds a block, if one does. */
  const holderOf = (b: Element) => {
    const p = b.parentElement;
    return p && blockIn(p) === b ? (p as HTMLElement) : null;
  };
  const boxOf = (li: Element) => li.querySelector<HTMLInputElement>(':scope > input[type=checkbox]');
  const isTodo = (li: Element) => li.tagName === 'LI' && !li.classList.contains('n-block') && (!!li.parentElement?.classList.contains('n-todo') || !!boxOf(li));
  const subLists = (h: Element) => (h.tagName === 'LI' ? [...h.children].filter(isList) : []);
  /** A to-do's words (the span after its box), made when it has none yet: an agent's to-do may have its words loose. */
  const todoWords = (li: Element, mk: boolean): HTMLElement | null => {
    const s = [...li.children].find((c) => c.tagName === 'SPAN') as HTMLElement | undefined;
    if (s || !mk) return s ?? null;
    const span = make('span');
    let box = boxOf(li);
    for (const n of [...li.childNodes]) if (n !== box && !(n.nodeType === 1 && isList(n as Element))) span.append(n);
    if (!box) {
      box = make('input');
      box.type = 'checkbox';
      li.prepend(box);
    }
    box.after(span);
    return span;
  };
  const calloutWords = (c: Element, mk: boolean): HTMLElement | null => {
    const t = c.querySelector<HTMLElement>(':scope > .n-callout-text');
    if (t || !mk) return t;
    const d = make('div', 'n-callout-text');
    for (const n of [...c.childNodes]) if (!(n.nodeType === 1 && (n as Element).classList.contains('n-callout-icon'))) d.append(n);
    c.append(d);
    return d;
  };
  /** The block some words belong to: a to-do's item, a callout, a toggle (and the item that holds it, if one does); else the words' own element. */
  const unitOf = (h: Element): Element => {
    const p = h.parentElement;
    let u = h;
    if (!p) return h;
    if (h.tagName === 'SPAN' && p.tagName === 'LI' && isTodo(p) && todoWords(p, false) === h) u = p;
    else if (h.classList.contains('n-callout-text') && p.classList.contains('n-callout')) u = p;
    else if (h.tagName === 'SUMMARY' && p.tagName === 'DETAILS') u = p;
    return holderOf(u) ?? u;
  };
  const kindOf = (u: Element | null | undefined): Kind | null => {
    if (!u) return null;
    const held = blockIn(u);
    if (held) return kindOf(held);
    const t = u.tagName;
    if (/^H[1-6]$/.test(t)) return t.toLowerCase() as Kind;
    if (t === 'P') return 'p';
    if (t === 'LI') return isTodo(u) ? 'todo' : u.parentElement?.tagName === 'OL' ? 'number' : 'bullet';
    if (t === 'BLOCKQUOTE') return 'quote';
    if (t === 'PRE') return 'code';
    if (t === 'DETAILS') return 'toggle';
    if (u.classList.contains('n-callout')) return 'callout';
    return null;
  };
  /** Where a block's words are written (made when `mk` and it has none yet), or null when there are none to write. */
  const hostOf = (u: Element, mk = false): HTMLElement | null => {
    const held = blockIn(u);
    if (held) return hostOf(held, mk);
    let h: HTMLElement | null = null;
    if (u.tagName === 'LI' && isTodo(u)) h = todoWords(u, mk);
    else if (u.classList.contains('n-callout')) h = calloutWords(u, mk);
    else if (u.tagName === 'DETAILS') h = u.querySelector<HTMLElement>(':scope > summary');
    else if (kindOf(u)) h = u as HTMLElement;
    return h && E.wordy(h) ? h : null;
  };
  const isListKind = (k: Kind | null) => k === 'bullet' || k === 'number' || k === 'todo';
  const isHeading = (k: Kind | null) => !!k && /^h[1-6]$/.test(k);

  // ---- the words in a block --------------------------------------------------------------------------------------
  /** A range over a block's own words (not the lists nested in a list's item). */
  const ownRange = (h: Element) => {
    const r = doc.createRange();
    r.selectNodeContents(h);
    const s = subLists(h)[0];
    if (s) r.setEndBefore(s);
    return r;
  };
  const ownText = (h: Element) => ownRange(h).toString();
  const isBlank = (s: string) => !s.replace(/[\u200b \t\n\r]/g, '');
  const emptyHost = (h: Element) => !ownText(h).replace(/[\u200b\s]/g, '') && !ownRange(h).cloneContents().querySelector('img');
  const caret = (): Range | null => {
    const s = getSelection();
    return s && s.rangeCount ? s.getRangeAt(0) : null;
  };
  const caretIn = (h: Element): Range | null => {
    const r = caret();
    return r && r.collapsed && (h === r.startContainer || h.contains(r.startContainer)) ? r : null;
  };
  const head = (h: Element, r: Range) => {
    const x = ownRange(h);
    x.setEnd(r.startContainer, r.startOffset);
    return x;
  };
  const tail = (h: Element, r: Range) => {
    const x = ownRange(h);
    x.setStart(r.endContainer, r.endOffset);
    return x;
  };
  const lastOwn = (h: Element): Node | null => {
    const s = subLists(h)[0];
    let n: Node | null = s ? s.previousSibling : h.lastChild;
    while (n && n.nodeType === 3 && isBlank((n as Text).data)) n = n.previousSibling;
    return n;
  };
  /** The line break a browser keeps at the end of a block's words (it shows no line of its own). */
  const fillerBr = (h: Element) => {
    const n = lastOwn(h);
    return n && n.nodeName === 'BR' ? (n as HTMLElement) : null;
  };
  const atStart = (h: Element) => {
    const r = caretIn(h);
    if (!r) return false;
    const x = head(h, r);
    return isBlank(x.toString()) && !x.cloneContents().querySelector('img,br');
  };
  const atEnd = (h: Element) => {
    const r = caretIn(h);
    if (!r) return false;
    const x = tail(h, r);
    if (!isBlank(x.toString())) return false;
    const f = x.cloneContents();
    return !f.querySelector('img') && f.querySelectorAll('br').length <= (fillerBr(h) ? 1 : 0);
  };
  /**
   * Inline parts a cut left empty, along its edge only: from `n` down its last parts (`end`) or its first ones. An empty
   * part elsewhere (an anchor, a font's icon) is the page's own and stays.
   */
  const trimEdge = (first: Node | null, end: boolean) => {
    const edge: Element[] = [];
    for (let n: Node | null = first; n; n = end ? n.lastChild : n.firstChild) {
      while (n && n.nodeType === 3 && !(n as Text).data) n = end ? n.previousSibling : n.nextSibling;
      if (!n || n.nodeType !== 1 || /^(BR|IMG|INPUT|UL|OL|LI)$/.test((n as Element).tagName)) break;
      edge.push(n as Element);
    }
    for (const x of edge.reverse()) {
      if (x.textContent || x.querySelector('img,br,input') || x.id || x.getAttribute('name')) break;
      x.remove();
    }
  };
  /** The words after the caret, taken out of the block. */
  const takeTail = (h: Element) => {
    const r = caretIn(h);
    if (!r) return doc.createDocumentFragment();
    const f = tail(h, r).extractContents();
    trimEdge(f.firstChild, false);
    // What is left ends where the cut was (before the lists nested in an item).
    trimEdge(subLists(h)[0]?.previousSibling ?? h.lastChild, true);
    return f;
  };
  const takeAll = (h: Element) => ownRange(h).extractContents();
  const putOwn = (h: Element, n: Node) => h.insertBefore(n, subLists(h)[0] ?? null);
  /** An empty block keeps a line's height (a line break in it, as browsers write it). */
  const fillEmpty = (h: Element) => {
    if (emptyHost(h) && !ownRange(h).cloneContents().querySelector('br')) putOwn(h, make('br'));
  };
  const dropFiller = (h: Element) => fillerBr(h)?.remove();
  const plainOf = (n: Node): string => {
    let s = '';
    const w = doc.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let x = w.nextNode(); x; x = w.nextNode()) {
      if (x.nodeType === 3) s += (x as Text).data;
      else if ((x as Element).tagName === 'BR') s += '\n';
    }
    return s;
  };
  const textFrag = (s: string) => {
    const f = doc.createDocumentFragment();
    s.replace(/\n$/, '')
      .split('\n')
      .forEach((line, i) => {
        if (i) f.append(make('br'));
        if (line) f.append(line);
      });
    return f;
  };

  // ---- making blocks and changing their kind ---------------------------------------------------------------------
  const newUnit = (kind: Kind, words?: DocumentFragment | null): { unit: HTMLElement; host: HTMLElement } => {
    const fill = (h: HTMLElement) => {
      if (words) h.append(words);
      fillEmpty(h);
      return h;
    };
    switch (kind) {
      case 'bullet':
      case 'number': {
        const li = make('li');
        return { unit: li, host: fill(li) };
      }
      case 'todo': {
        const li = make('li');
        const box = make('input');
        box.type = 'checkbox';
        const s = make('span');
        li.append(box, s);
        return { unit: li, host: fill(s) };
      }
      case 'quote': {
        const q = make('blockquote');
        return { unit: q, host: fill(q) };
      }
      case 'code': {
        const pre = make('pre', 'n-code');
        // (the line break a browser keeps at the end of a block's words is no line of code)
        const text = words ? plainOf(words).replace(/\n$/, '') : '';
        if (text) pre.append(text);
        else pre.append(make('br'));
        return { unit: pre, host: pre };
      }
      case 'toggle': {
        const d = make('details', 'n-toggle');
        d.open = true;
        const s = make('summary');
        d.append(s);
        return { unit: d, host: fill(s) };
      }
      case 'callout': {
        const c = make('div', 'n-callout');
        const i = make('span', 'n-callout-icon');
        i.textContent = '💡';
        const t = make('div', 'n-callout-text');
        c.append(i, t);
        return { unit: c, host: fill(t) };
      }
      default: {
        const x = make(kind === 'p' ? 'p' : kind);
        return { unit: x, host: fill(x) };
      }
    }
  };
  const STRUCT = /^(n-todo|n-toggle|n-callout|n-code|n-callout-text|n-callout-icon)$/;
  const OWN = /^n-s[a-z0-9]{5}$/;
  /** A block's look kept by what it turns into, or by the other half of a split: its style and classes, its id when it is the same block. */
  const copyLook = (from: Element, to: Element, same: boolean) => {
    const st = from.getAttribute('style');
    if (st) to.setAttribute('style', st);
    for (const c of from.classList) if (!STRUCT.test(c) && (same || !OWN.test(c))) to.classList.add(c);
    if (same && from.id) to.id = from.id;
    for (const a of ['dir', 'lang']) {
      const v = from.getAttribute(a);
      if (v) to.setAttribute(a, v);
    }
  };
  const cloneList = (list: Element) => {
    const n = list.cloneNode(false) as HTMLElement;
    n.removeAttribute('id');
    return n;
  };
  const nested = (li: Element) => li.parentElement?.parentElement?.tagName === 'LI';
  const after = (x: Element) => {
    const out: Element[] = [];
    for (let n = x.nextElementSibling; n; n = n.nextElementSibling) out.push(n);
    return out;
  };
  /** Takes an item out of its list, which splits there: the item ends up after it, the items after it in a list of their own. */
  const split = (li: Element) => {
    const list = li.parentElement!;
    const rest = after(li);
    if (rest.length) {
      const n = cloneList(list);
      n.removeAttribute('start');
      n.append(...rest);
      list.after(n);
    }
    list.after(li);
    if (!list.children.length) list.remove();
  };
  /** Shift+Tab: the item goes up a level, after the item it was in; the items after it go along, inside it. */
  const outdent = (li: Element): boolean => {
    if (!nested(li)) return false;
    const list = li.parentElement!;
    const parent = list.parentElement!;
    const rest = after(li);
    if (rest.length) {
      let sub = li.lastElementChild;
      if (!sub || !sameList(sub, list)) {
        sub = cloneList(list);
        sub.removeAttribute('start');
        li.append(sub);
      }
      sub.append(...rest);
    }
    parent.after(li);
    if (!list.children.length) list.remove();
    return true;
  };
  /** Tab: the item goes inside the one before it, at the end of its own list there. */
  const indent = (li: Element): boolean => {
    const prev = li.previousElementSibling;
    if (!prev || prev.tagName !== 'LI') return false;
    const list = li.parentElement!;
    let sub = prev.lastElementChild;
    if (!sub || !sameList(sub, list)) {
      sub = cloneList(list);
      sub.removeAttribute('start');
      prev.append(sub);
    }
    sub.append(li);
    return true;
  };
  const toTop = (li: Element) => {
    while (nested(li)) outdent(li);
    split(li);
  };
  /** A block put in a list beside its items: an item of its own holds it. */
  const holdIn = (b: Element): HTMLElement => {
    const li = make('li', 'n-block');
    b.replaceWith(li);
    li.append(b);
    return li;
  };
  /** A held block at the list's top level leaves it, where it was (the list splits there), the items under it after it. */
  const unhold = (li: HTMLElement) => {
    const b = blockIn(li);
    if (!b) return;
    split(li);
    li.replaceWith(b, ...subLists(li));
  };
  /** Shift+Tab, Backspace at its start, Enter in it empty: a held block goes up a level, and out of the list from its top. */
  const lift = (li: HTMLElement) => {
    if (nested(li)) outdent(li);
    if (!nested(li)) unhold(li);
  };
  /** Makes an item the only one of a list of its own, where it is. */
  const isolate = (li: Element): HTMLElement => {
    const list = li.parentElement as HTMLElement;
    if (list.children.length === 1) return list;
    const rest = after(li);
    const mine = cloneList(list);
    mine.removeAttribute('start');
    if (rest.length) {
      const n = cloneList(list);
      n.removeAttribute('start');
      n.append(...rest);
      list.after(n);
    }
    list.after(mine);
    mine.append(li);
    if (!list.children.length) list.remove();
    return mine;
  };
  const retype = (list: HTMLElement, tag: string, todo: boolean): HTMLElement => {
    let l = list;
    if (list.tagName !== tag) {
      l = doc.createElement(tag);
      for (const a of [...list.attributes]) l.setAttribute(a.name, a.value);
      l.append(...list.childNodes);
      list.replaceWith(l);
    }
    l.classList.toggle('n-todo', todo);
    if (!l.classList.length) l.removeAttribute('class');
    if (tag !== 'OL') l.removeAttribute('start');
    return l;
  };
  const sameList = (a: Element | null, b: Element) => !!a && a.tagName === b.tagName && a.classList.contains('n-todo') === b.classList.contains('n-todo');
  /** A list joins the lists of its kind right before and after it. */
  const merge = (list: HTMLElement): HTMLElement => {
    let l = list;
    const p = prevSib(l);
    if (sameList(p, l)) {
      p!.append(...l.childNodes);
      l.remove();
      l = p as HTMLElement;
    }
    const n = nextSib(l);
    if (sameList(n, l)) {
      l.append(...n!.childNodes);
      n!.remove();
    }
    return l;
  };
  /** An item standing on its own (it was another block) goes into a list of its kind there. */
  const wrapList = (li: HTMLElement, tag: string, todo: boolean) => {
    const list = doc.createElement(tag);
    if (todo) list.className = 'n-todo';
    li.replaceWith(list);
    list.append(li);
    merge(list);
  };
  const LISTK: Partial<Record<Kind, [string, boolean]>> = { bullet: ['UL', false], number: ['OL', false], todo: ['UL', true] };
  /** Turns a block into another kind, keeping its words and look: the block now written in (null when it can't). */
  const turnInto = (u: Element, kind: Kind): HTMLElement | null => {
    const from = kindOf(u);
    const h = hostOf(u, true);
    if (!from || !h) return null;
    if (from === kind) return h;
    const held = blockIn(u);
    let words = takeAll(h);
    if (from === 'code' && kind !== 'code') words = textFrag(plainOf(words));
    const { unit: nu, host: nh } = newUnit(kind, words);
    copyLook(held ?? u, nu, true);
    const lk = LISTK[kind];
    if (u.tagName === 'LI') {
      const checked = kind === 'todo' && from === 'todo' ? boxOf(u)?.hasAttribute('checked') : false;
      if (lk) {
        const subs = subLists(u);
        const list = isolate(u);
        u.replaceWith(nu);
        for (const s of subs) nu.append(s);
        if (checked) boxOf(nu)?.setAttribute('checked', '');
        merge(retype(list, lk[0], lk[1]));
      } else if (held) {
        // A block an item holds, turned into another: in its place there (what a toggle folded, after it).
        held.replaceWith(nu);
        if (held.tagName === 'DETAILS') nu.after(...[...held.children].filter((c) => c.tagName !== 'SUMMARY'));
      } else if (nested(u)) {
        // An item under another, turned into a block, keeps its place there, and the items under it stay under it: the
        // item holds the block now, with no marker of its own (its look and colours go to the block).
        boxOf(u)?.remove();
        todoWords(u, false)?.remove();
        nu.removeAttribute('id');
        u.removeAttribute('style');
        u.className = 'n-block';
        u.prepend(nu);
      } else {
        // Up to the top first: on the way the items after it go inside it, so its lists are read after.
        toTop(u);
        const subs = subLists(u);
        u.replaceWith(nu);
        let at: Element = nu;
        for (const s of subs) {
          at.after(s);
          at = s;
        }
      }
    } else {
      const extra = u.tagName === 'DETAILS' ? [...u.children].filter((c) => c.tagName !== 'SUMMARY') : [];
      u.replaceWith(nu);
      if (lk) wrapList(nu, lk[0], lk[1]);
      if (extra.length) (lk ? nu.parentElement! : nu).after(...extra);
    }
    fillEmpty(nh);
    return nh;
  };
  /**
   * Puts a new block after a block: an item stays in its list (or one of its own kind there); anything else, after an
   * item under another, stays at that level (held), else goes after the list it would be in. `kind`: what the new block
   * is (an item not yet in a list can't say which list it is for).
   */
  const putAfter = (nu: HTMLElement, u: Element, kind: Kind = kindOf(nu) ?? 'p') => {
    const lk = LISTK[kind];
    if (u.tagName === 'LI') {
      u.after(nu);
      if (nu.tagName !== 'LI' && nested(u)) {
        // Under an item, at the level of the one it follows: an item of its own holds it.
        holdIn(nu);
      } else if (nu.tagName !== 'LI') {
        // Out of the list, splitting it there: by way of an item that goes up to the top, then makes room.
        const tmp = make('li');
        nu.replaceWith(tmp);
        toTop(tmp);
        tmp.replaceWith(nu, ...subLists(tmp));
      } else if (lk && kind !== kindOf(u)) merge(retype(isolate(nu), lk[0], lk[1]));
      return;
    }
    u.after(nu);
    if (lk && nu.tagName === 'LI') wrapList(nu, lk[0], lk[1]);
  };
  const tick = (li: Element) => {
    const b = boxOf(li);
    if (!b) return;
    const on = !b.hasAttribute('checked');
    b.toggleAttribute('checked', on);
    b.checked = on;
  };

  // ---- which blocks come before and after ------------------------------------------------------------------------
  const HOSTS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,summary,td,th,figcaption,dt,dd,.n-callout-text,li>span';
  /** Every block's words that can be written, in reading order (the arrows go through them). */
  const hosts = (): HTMLElement[] =>
    [...doc.body.querySelectorAll<HTMLElement>(HOSTS)].filter((x) => {
      if (x.tagName === 'LI' && isTodo(x)) return false;
      if (x.tagName === 'SPAN' && (x.parentElement?.tagName !== 'LI' || !isTodo(x.parentElement) || todoWords(x.parentElement, false) !== x)) return false;
      return !E.isUi(x) && E.wordy(x) && x.getClientRects().length > 0;
    });
  const hostBefore = (h: Element) => {
    const all = hosts();
    const i = all.indexOf(h as HTMLElement);
    return i > 0 ? all[i - 1] : null;
  };
  const hostAfter = (h: Element) => {
    const all = hosts();
    const i = all.indexOf(h as HTMLElement);
    return i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  };
  /** The last words to write in a block, deep in its lists and open toggles. */
  const lastHostIn = (el: Element | null): HTMLElement | null => {
    if (!el) return null;
    if (isList(el)) return lastHostIn(el.lastElementChild);
    if (el.tagName === 'LI') {
      const subs = subLists(el);
      if (subs.length) return lastHostIn(subs[subs.length - 1]) ?? hostOf(el);
      return hostOf(el);
    }
    if (el.tagName === 'DETAILS' && (el as HTMLDetailsElement).open) {
      const last = el.lastElementChild;
      if (last && last.tagName !== 'SUMMARY') return lastHostIn(last) ?? hostOf(el);
    }
    return kindOf(el) ? hostOf(el) : null;
  };
  const firstHostIn = (el: Element | null): HTMLElement | null => {
    if (!el) return null;
    if (isList(el)) return firstHostIn(el.firstElementChild);
    return kindOf(el) ? hostOf(el) : null;
  };
  /** The words Backspace at a block's start joins it to: the block right before it, in its list or toggle. */
  const joinBefore = (u: Element): HTMLElement | null => {
    const p = prevSib(u);
    if (p?.tagName === 'SUMMARY' && u.parentElement?.tagName === 'DETAILS') return hostOf(u.parentElement);
    if (p) return lastHostIn(p);
    const parent = u.parentElement;
    if (parent?.tagName === 'DETAILS') return hostOf(parent);
    return null;
  };
  const joinAfter = (u: Element): HTMLElement | null => {
    if (u.tagName === 'LI') {
      const subs = subLists(u);
      if (subs.length) return firstHostIn(subs[0]);
    }
    if (u.tagName === 'DETAILS' && (u as HTMLDetailsElement).open) {
      const first = u.querySelector(':scope > summary')?.nextElementSibling;
      if (first) return firstHostIn(first);
    }
    const n = nextSib(u);
    return n ? firstHostIn(n) : null;
  };
  /** A block whose words were joined to another goes; what was inside it stays where it was. */
  const dropUnit = (u: Element) => {
    if (u.tagName === 'LI') {
      const items = subLists(u).flatMap((s) => [...s.children]);
      const list = u.parentElement;
      u.replaceWith(...items);
      if (list && !list.children.length) list.remove();
      return;
    }
    if (u.tagName === 'DETAILS') u.replaceWith(...[...u.children].filter((c) => c.tagName !== 'SUMMARY'));
    else u.remove();
  };
  const joinInto = (t: HTMLElement, h: HTMLElement) => {
    const f = takeAll(h);
    if (kindOf(unitOf(t)) === 'code') putOwn(t, doc.createTextNode(plainOf(f)));
    else putOwn(t, f);
    fillEmpty(t);
  };

  // ---- the caret, measured -----------------------------------------------------------------------------------------
  /** Where the caret is on screen (a collapsed range at a line's start may measure nothing: the letter beside it does). */
  const caretBox = (): DOMRect | null => {
    const r0 = caret();
    if (!r0) return null;
    const r = r0.cloneRange();
    r.collapse(true);
    const q = r.getClientRects()[0];
    if (q && (q.height || q.width)) return q;
    const n = r.startContainer;
    const o = r.startOffset;
    const m = doc.createRange();
    if (n.nodeType === 3) {
      const t = n as Text;
      if (o < t.length) {
        m.setStart(t, o);
        m.setEnd(t, o + 1);
        const a = m.getClientRects()[0];
        if (a) return new DOMRect(a.left, a.top, 0, a.height);
      }
      if (o > 0) {
        m.setStart(t, o - 1);
        m.setEnd(t, o);
        const rs = m.getClientRects();
        const a = rs[rs.length - 1];
        if (a) return new DOMRect(a.right, a.top, 0, a.height);
      }
    } else {
      const c = n.childNodes[o] as Element | undefined;
      const el = (c && c.nodeType === 1 ? c : n.nodeType === 1 ? (n as Element) : n.parentElement) as Element | null;
      const a = el?.getBoundingClientRect();
      if (a) {
        const lh = parseFloat(getComputedStyle(el!).lineHeight) || parseFloat(getComputedStyle(el!).fontSize) * 1.3 || 18;
        return new DOMRect(a.left + (parseFloat(getComputedStyle(el!).paddingLeft) || 0), a.top + (parseFloat(getComputedStyle(el!).paddingTop) || 0), 0, Math.min(lh, a.height || lh));
      }
    }
    return null;
  };
  const lineBoxes = (h: Element) => [...ownRange(h).getClientRects()].filter((q) => q.height > 0);
  const firstLine = (h: Element) => {
    const c = caretBox();
    const rs = lineBoxes(h);
    if (!c || !rs.length) return true;
    return c.top - Math.min(...rs.map((q) => q.top)) < c.height * 0.6;
  };
  const lastLine = (h: Element) => {
    const c = caretBox();
    const rs = lineBoxes(h);
    if (!c || !rs.length) return true;
    return Math.max(...rs.map((q) => q.bottom)) - c.bottom < c.height * 0.6;
  };

  // ---- writing's keys ------------------------------------------------------------------------------------------------
  const writeIn = (h: HTMLElement | null, at: At = { off: 0 }): Next => (h ? { write: h, at } : true);
  /** Enter: the next block of the right kind (the words after the caret go with it). */
  /** Words selected in the block go before Enter or a paste acts there (as typing over them does). */
  const dropSelected = (h: HTMLElement) => {
    const r = caret();
    if (!r || r.collapsed || !h.contains(r.commonAncestorContainer)) return;
    E.noteTyping();
    r.deleteContents();
    r.collapse(true);
  };
  const enter = (h: HTMLElement): boolean => {
    const u = unitOf(h);
    const k = kindOf(u);
    if (!k || k === 'code') return false;
    dropSelected(h);
    const empty = emptyHost(h);
    // A block an item holds: the item is what comes and goes (its block's own element, for a toggle's inside).
    const held = blockIn(u);
    const blk = held ?? u;
    if ((isListKind(k) || held) && empty) {
      // An empty item leaves the list (or goes up a level); so does an empty block an item holds.
      E.change(() => (held ? (lift(u as HTMLElement), writeIn(h)) : nested(u) ? (outdent(u), writeIn(h)) : writeIn(turnInto(u, 'p'))));
      return true;
    }
    if (!empty && atStart(h)) {
      // At a block's start: an empty block before it, the caret staying.
      E.change(() => {
        const nb = newUnit(isListKind(k) ? k : 'p').unit;
        u.before(nb);
        if (held) holdIn(nb);
        return writeIn(h);
      });
      return true;
    }
    E.change(() => {
      const end = atEnd(h);
      const words = end ? null : takeTail(h);
      const nk: Kind = isListKind(k) ? k : (isHeading(k) || k === 'quote') && !end ? k : 'p';
      const { unit: nu, host: nh } = newUnit(nk, words);
      if (!end && nk === k) copyLook(blk, nu, false);
      if (k === 'toggle') {
        (blk as HTMLDetailsElement).open = true;
        h.after(nu);
      } else {
        u.after(nu);
        // The items under it go with the new one, which comes right under its words.
        const into = held ? holdIn(nu) : nu;
        if (u.tagName === 'LI' && into.tagName === 'LI') for (const s of subLists(u)) into.append(s);
      }
      fillEmpty(h);
      return writeIn(nh);
    });
    return true;
  };
  /** Ctrl+Enter: out of a code block; ticks a to-do; opens or folds a toggle. */
  const modEnter = (h: HTMLElement): boolean => {
    const u = unitOf(h);
    const k = kindOf(u);
    const off = E.offset(h) ?? 0;
    const blk = blockIn(u) ?? u;
    if (k === 'code') {
      E.change(() => {
        const { unit, host } = newUnit('p');
        u.after(unit);
        if (blk !== u) holdIn(unit);
        return writeIn(host);
      });
      return true;
    }
    if (k === 'todo' || k === 'toggle') {
      E.change(() => {
        if (k === 'todo') tick(u);
        else (blk as HTMLDetailsElement).open = !(blk as HTMLDetailsElement).open;
        return writeIn(h, { off });
      });
      return true;
    }
    return false;
  };
  /** Backspace at a block's start: an item leaves its list, a quote or callout turns to text, text joins the block before. */
  const backspace = (h: HTMLElement): boolean => {
    if (!atStart(h)) return false;
    const u = unitOf(h);
    const k = kindOf(u);
    if (!k) return false;
    if (isListKind(k)) {
      E.change(() => (nested(u) ? (outdent(u), writeIn(h)) : writeIn(turnInto(u, 'p'))));
      return true;
    }
    if (k === 'quote' || k === 'callout' || k === 'toggle' || k === 'code') {
      E.change(() => writeIn(turnInto(u, 'p')));
      return true;
    }
    if (blockIn(u)) {
      // A block an item holds goes up a level first (out of the list from its top), as an item does.
      E.change(() => (lift(u as HTMLElement), writeIn(h)));
      return true;
    }
    if (emptyHost(h)) {
      const prev = hostBefore(h);
      const next = hostAfter(h);
      if (!prev && !next) return true;
      E.change(() => {
        u.remove();
        return prev ? writeIn(prev, { end: true }) : writeIn(next);
      });
      return true;
    }
    const target = joinBefore(u);
    if (target) {
      E.change(() => {
        hostOf(unitOf(target), true);
        dropFiller(target);
        const off = E.length(target);
        joinInto(target, h);
        u.remove();
        return writeIn(target, { off });
      });
      return true;
    }
    // A picture, a line across or a table before it: picked, as Notion does, to delete it with another Backspace.
    const before = prevSib(u);
    if (before) {
      E.finish();
      E.select(before);
    }
    return true;
  };
  /** Delete at a block's end: the block after it joins it. */
  const forwardDelete = (h: HTMLElement): boolean => {
    if (!atEnd(h)) return false;
    const u = unitOf(h);
    const k = kindOf(u);
    if (!k || k === 'code') return false;
    const next = joinAfter(u);
    if (!next) return true;
    E.change(() => {
      dropFiller(h);
      const off = E.length(h);
      const nu = unitOf(next);
      hostOf(nu, true);
      joinInto(h, next);
      dropUnit(nu);
      return writeIn(h, { off });
    });
    return true;
  };
  /** The arrows at a block's first or last line (or its start or end) go on into the block before or after. */
  const arrow = (e: KeyboardEvent, h: HTMLElement): boolean => {
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    const line = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (!caretIn(h)) return false;
    if (line ? !(back ? firstLine(h) : lastLine(h)) : !(back ? atStart(h) : atEnd(h))) return false;
    const t = back ? hostBefore(h) : hostAfter(h);
    if (!t) return false;
    const x = caretBox()?.left;
    E.write(t, line && x !== undefined ? { x, edge: back ? 'bottom' : 'top' } : back ? { end: true } : { off: 0 });
    return true;
  };
  const tab = (e: KeyboardEvent, h: HTMLElement): boolean => {
    const u = unitOf(h);
    const k = kindOf(u);
    const off = E.offset(h) ?? 0;
    if (isListKind(k) || blockIn(u)) {
      E.change(() => ((e.shiftKey ? (blockIn(u) ? (lift(u as HTMLElement), true) : outdent(u)) : indent(u)) ? writeIn(h, { off }) : null));
      return true;
    }
    // A block right after a list goes under its last item (as Notion nests a block under the one before it).
    const before = prevSib(u);
    if (!e.shiftKey && k && k !== 'code' && isList(before) && before.lastElementChild?.tagName === 'LI') {
      E.change(() => {
        const li = holdIn(u);
        before.append(li);
        indent(li);
        return writeIn(h, { off });
      });
      return true;
    }
    if (k === 'code') {
      if (!e.shiftKey) {
        E.noteTyping();
        doc.execCommand('insertText', false, '  ');
      }
      return true;
    }
    if (h.tagName === 'TD' || h.tagName === 'TH') {
      const cells = [...(h.closest('table')?.querySelectorAll<HTMLElement>('td,th') ?? [])];
      const c = cells[cells.indexOf(h) + (e.shiftKey ? -1 : 1)];
      if (c) E.write(c, { all: true });
      return true;
    }
    // The caret stays in the page (a browser would move the focus on).
    return true;
  };
  const TURN_KEYS: Record<string, Kind> = { 'alt:Digit0': 'p', 'alt:Digit1': 'h1', 'alt:Digit2': 'h2', 'alt:Digit3': 'h3', 'shift:Digit7': 'number', 'shift:Digit8': 'bullet', 'shift:Digit9': 'todo' };
  const turnKey = (e: KeyboardEvent): Kind | null => {
    if (!isMod(e) || e.getModifierState?.('AltGraph')) return null;
    if (e.altKey && !e.shiftKey) return TURN_KEYS[`alt:${e.code}`] ?? null;
    if (e.shiftKey && !e.altKey) return TURN_KEYS[`shift:${e.code}`] ?? null;
    return null;
  };

  // ---- Markdown as you type ------------------------------------------------------------------------------------------
  const MD: [RegExp, Kind | 'checked'][] = [
    [/^#$/, 'h1'],
    [/^##$/, 'h2'],
    [/^###$/, 'h3'],
    [/^[-*+]$/, 'bullet'],
    [/^\d{1,4}[.)]$/, 'number'],
    [/^\[ ?\]$/, 'todo'],
    [/^\[[xX]\]$/, 'checked'],
    [/^>$/, 'quote'],
  ];
  const blockMarkdown = (h: HTMLElement): boolean => {
    const u = unitOf(h);
    const k = kindOf(u);
    if (!(k === 'p' || isHeading(k) || k === 'bullet' || k === 'number')) return false;
    const r = caretIn(h);
    if (!r) return false;
    const typed = head(h, r)
      .toString()
      .replace(/\u00a0/g, ' ');
    const whole = ownText(h).replace(/\u00a0/g, ' ');
    if (k === 'p' && (whole === '---' || whole === '```') && typed === whole) {
      E.change(() => {
        takeAll(h);
        if (whole === '```') return writeIn(turnInto(u, 'code'));
        const hr = make('hr');
        const blk = blockIn(u) ?? u;
        blk.replaceWith(hr);
        const { unit, host } = newUnit('p');
        // (in a list, the line across stays held where the block was, and the next words get an item of their own)
        if (blk !== u) {
          u.after(unit);
          holdIn(unit);
        } else hr.after(unit);
        return writeIn(host);
      });
      return true;
    }
    if (!typed.endsWith(' ')) return false;
    const mark = typed.slice(0, -1);
    const hit = MD.find(([re]) => re.test(mark));
    if (!hit) return false;
    const want = hit[1];
    const kind: Kind = want === 'checked' ? 'todo' : want;
    if (k === 'bullet' || k === 'number' ? !isListKind(kind) || kind === k : isHeading(k) && (kind === k || !isHeading(kind))) return false;
    E.change(() => {
      head(h, r).deleteContents();
      const nh = turnInto(u, kind);
      if (!nh) return null;
      const nu = unitOf(nh);
      if (want === 'checked') tick(nu);
      const n = Number(/^\d+/.exec(mark)?.[0] ?? '1');
      if (kind === 'number' && n > 1 && nu.parentElement?.firstElementChild === nu) nu.parentElement.setAttribute('start', String(n));
      return writeIn(nh);
    });
    return true;
  };
  const INLINE_MD: [RegExp, string][] = [
    [/(^|[^*\w])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, 'strong'],
    [/(^|[^_\w])__([^_\s](?:[^_]*[^_\s])?)__$/, 'strong'],
    [/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, 'em'],
    [/(^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, 'em'],
    [/(^|[^`])`([^`]+)`$/, 'code'],
    [/(^|[^~])~~([^~\s](?:[^~]*[^~\s])?)~~$/, 's'],
  ];
  /** Invisible spaces put after a mark made by Markdown, so the next letters are not bold too: taken out once written. */
  const spacers = new Set<Text>();
  const inlineMarkdown = (h: HTMLElement) => {
    if (kindOf(unitOf(h)) === 'code') return;
    const r = caretIn(h);
    if (!r || r.startContainer.nodeType !== 3) return;
    const t = r.startContainer as Text;
    if (t.parentElement?.closest('code') && h.contains(t.parentElement.closest('code'))) return;
    const o = r.startOffset;
    const s = t.data.slice(0, o);
    for (const [re, tag] of INLINE_MD) {
      const m = re.exec(s);
      if (!m) continue;
      E.noteTyping();
      const start = m.index + m[1].length;
      const rest = t.data.slice(o);
      t.data = s.slice(0, start);
      const el = doc.createElement(tag);
      el.textContent = m[2];
      const next = doc.createTextNode(rest || '\u200b');
      t.after(el, next);
      if (!rest) spacers.add(next);
      const c = doc.createRange();
      c.setStart(next, rest ? 0 : 1);
      c.collapse(true);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(c);
      return;
    }
  };
  const dropSpacers = (root: Element) => {
    for (const t of spacers) {
      if (!t.isConnected || !root.contains(t)) continue;
      if (t.data.startsWith('\u200b')) t.data = t.data.slice(1);
      if (!t.data) t.remove();
    }
    spacers.clear();
  };

  // ---- hints in an empty block -----------------------------------------------------------------------------------------
  const hintOf = (h: Element): string => {
    const k = kindOf(unitOf(h));
    if (k === 'p') return L('phText', 'Type ‘/’ for commands');
    if (k === 'h1' || k === 'h2' || k === 'h3') return L(k, `Heading ${k[1]}`);
    if (k === 'todo') return L('phTodo', 'To-do');
    if (k === 'bullet' || k === 'number') return L('phList', 'List');
    if (k === 'quote') return L('phQuote', 'Quote');
    if (k === 'toggle') return L('phToggle', 'Toggle');
    if (k === 'callout') return L('phText', 'Type ‘/’ for commands');
    return '';
  };
  const hint = (h: HTMLElement) => {
    const t = emptyHost(h) ? hintOf(h) : '';
    if (t) {
      if (h.getAttribute('data-n-ph') !== t) h.setAttribute('data-n-ph', t);
    } else h.removeAttribute('data-n-ph');
  };

  // ---- the parts drawn over the page --------------------------------------------------------------------------------
  const { accent, panel, line, ink, muted, dark } = E.look;
  const ICONS: Record<string, string> = {
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    grip: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
    text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    bullet: '<circle cx="5" cy="7" r="1.3" fill="currentColor"/><circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="5" cy="17" r="1.3" fill="currentColor"/><path d="M10 7h10"/><path d="M10 12h10"/><path d="M10 17h10"/>',
    number: '<path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    todo: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    toggle: '<path d="M9 6l7 6-7 6z" fill="currentColor"/>',
    quote: '<path d="M5 4v16"/><path d="M10 8h10"/><path d="M10 12h10"/><path d="M10 16h7"/>',
    callout: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7.5 10h.01"/><path d="M11 10h6"/><path d="M11 14h4"/>',
    hr: '<path d="M3 12h18"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M3 15h18"/><path d="M9 4v16"/><path d="M15 4v16"/>',
    picture: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    video: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
    button: '<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M8 12h8"/>',
    cols2: '<rect x="3" y="4" width="7.5" height="16" rx="1.5"/><rect x="13.5" y="4" width="7.5" height="16" rx="1.5"/>',
    cols3: '<rect x="2.5" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="16" rx="1"/><rect x="16.5" y="4" width="5" height="16" rx="1"/>',
    card: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9h10"/><path d="M7 13h6"/>',
    toc: '<path d="M4 6h16"/><path d="M8 12h12"/><path d="M8 18h12"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
    math: '<path d="M18 7V4H6l6 8-6 8h12v-3"/>',
    emoji: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    turn: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
    colour: '<path d="M6 20 12 4l6 16"/><path d="M8.5 14h7"/>',
    dup: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    del: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
    ask: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  };
  const svg = (k: string, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] ?? ''}</svg>`;
  const glyph = (t: string) => `<span class="gl">${t}</span>`;
  const hover = dark ? '#2a303c' : '#efebe3';
  const wrap = make('div');
  wrap.innerHTML = `<style>
    .hd{position:fixed;display:none;align-items:center;gap:1px;pointer-events:auto}
    .hb,.end{all:unset;display:grid;place-items:center;width:22px;height:24px;border-radius:5px;color:${muted};cursor:pointer;box-sizing:border-box}
    .hb:hover,.end:hover{background:${hover};color:${ink}}
    .hb.grip{cursor:grab}
    .hd.col{flex-direction:column;gap:0}
    .hd.col .hb{width:18px;height:22px}
    .end{position:fixed;display:none;pointer-events:auto;width:26px;height:26px;border:1px dashed ${line}}
    .menu,.sl{position:fixed;display:none;flex-direction:column;pointer-events:auto;box-sizing:border-box;min-width:232px;max-width:calc(100vw - 12px);padding:4px;border-radius:12px;background:${panel};border:1px solid ${line};box-shadow:0 10px 32px rgba(0,0,0,${dark ? '.45' : '.18'});font:13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:${ink};overflow-y:auto;overscroll-behavior:contain}
    :is(.menu,.sl)>*{flex:none}
    .mh .q{margin-left:6px;font:500 11.5px ui-monospace,monospace;color:${ink}}
    :is(.menu,.sl) .row{all:unset;display:flex;align-items:center;gap:9px;height:30px;padding:0 9px;border-radius:7px;cursor:pointer;white-space:nowrap;box-sizing:border-box;min-width:0}
    :is(.menu,.sl) .row.on{background:${hover}}
    :is(.menu,.sl) .row.danger{color:${dark ? '#f28b8b' : '#bd2525'}}
    :is(.menu,.sl) .row[aria-disabled=true]{opacity:.4;cursor:default}
    .ri{display:grid;place-items:center;width:20px;flex:none;color:${muted}}
    .danger .ri{color:inherit}
    .rl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .rk{flex:none;color:${muted};font-size:11.5px;padding-left:10px}
    .gl{font:600 11.5px/1 system-ui,sans-serif;letter-spacing:-.02em}
    .mh{padding:6px 9px 4px;color:${muted};font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ms{height:1px;margin:4px 6px;background:${line};flex:none}
    .sg{display:grid;grid-auto-flow:column;column-gap:2px}
    .none{padding:8px 10px;color:${muted}}
    .sw{display:grid;grid-template-columns:repeat(10,24px);gap:4px;padding:2px 8px 8px}
    .sw button{all:unset;box-sizing:border-box;width:24px;height:24px;border-radius:6px;display:grid;place-items:center;cursor:pointer;border:1px solid ${line};font:700 13px/1 system-ui,sans-serif}
    .sw button.on{outline:2px solid ${accent};outline-offset:1px}
    .box2{position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid ${accent};border-radius:3px;background:${accent}12}
    .band{position:fixed;display:none;pointer-events:none;background:${accent}16;border:1px solid ${accent}66;border-radius:2px}
    .dl{position:fixed;display:none;height:3px;border-radius:2px;background:${accent};pointer-events:none;box-shadow:0 0 0 2px ${accent}33}
    .offer,.cv{position:fixed;display:none;gap:4px;pointer-events:auto}
    .offer button,.cv button{all:unset;display:flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:7px;color:${muted};font:12.5px system-ui,-apple-system,sans-serif;cursor:pointer;white-space:nowrap}
    .offer button{height:20px;padding:0 6px;gap:5px;font-size:12px;border-radius:5px}
    .offer button:hover{background:${hover};color:${ink}}
    .cv button{background:${panel};color:${ink};border:1px solid ${line};box-shadow:0 2px 8px rgba(0,0,0,.15)}
    .cv button:hover{background:${hover}}
    @media (pointer:coarse){.offer button{height:32px;font-size:13px}.hb,.hd.col .hb{width:32px;height:34px}.end{width:34px;height:34px}:is(.menu,.sl) .row{height:40px}.rk{display:none}.sw{grid-template-columns:repeat(10,28px)}.sw button{width:28px;height:28px}.offer button,.cv button{height:34px}}
  </style>
  <div class="hd"><button class="hb add" title="${esc(L('addBelow', 'Add a block below (Alt: above)'))}">${svg('plus')}</button><button class="hb grip" title="${esc(L('gripTip', 'Drag to move it, click for its menu'))}">${svg('grip')}</button></div>
  <button class="end" title="${esc(L('addEnd', 'Add a block at the end'))}">${svg('plus', 15)}</button>
  <div class="offer"><button data-o="icon">${svg('emoji', 14)}${esc(L('addIcon', 'Add an icon'))}</button><button data-o="cover">${svg('image', 14)}${esc(L('addCover', 'Add a cover'))}</button></div>
  <div class="cv"><button data-o="cover">${esc(L('changeCover', 'Change cover'))}</button><button data-o="nocover">${esc(L('removeCover', 'Remove'))}</button></div>
  <div class="boxes"></div><div class="band"></div><div class="dl"></div>
  <div class="menu" role="menu"></div>
  <div class="sl" role="listbox"></div>`;
  E.shadow.append(...wrap.childNodes);
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => E.shadow.querySelector(s) as T;
  const hd = $('.hd');
  const endBtn = $('.end');
  const offer = $('.offer');
  const cv = $('.cv');
  const boxes = $('.boxes');
  const bandEl = $('.band');
  const dl = $('.dl');
  const menuEl = $('.menu');
  const slEl = $('.sl');
  // The parts drawn over the page keep the words' selection: they take no focus. The page takes the keys, though
  // (a menu opened from a handle answers the arrows).
  for (const el of [hd, endBtn, offer, cv, menuEl, slEl])
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!E.editing()) window.focus();
      pressedIn = el;
    });
  /**
   * Where the last press began: a menu acts on a click only when the press was on it. A tap on a phone ends in a click
   * where the finger was, which could otherwise land on the menu it just opened (over the handle, where room is short).
   */
  let pressedIn: HTMLElement | null = null;
  addEventListener('pointerdown', (e) => !(e.composedPath() as Element[]).some((x) => x === menuEl || x === slEl) && (pressedIn = null), true);
  const pressedOn = (el: HTMLElement) => {
    const was = pressedIn === el;
    pressedIn = null;
    return was;
  };

  /**
   * Places a floating part beside a rectangle: under it, else over it; with room on neither side, the whole of it in
   * the window, over the line it was opened from (a list cut to the room left would hide some of what it offers).
   */
  const placeAt = (el: HTMLElement, r: { left: number; top: number; bottom: number }, gap = 4) => {
    el.style.maxHeight = '';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const below = innerHeight - r.bottom - gap - 6;
    const above = r.top - gap - 6;
    let top: number;
    if (h <= below) top = r.bottom + gap;
    else if (h <= above) top = r.top - gap - h;
    else {
      const room = innerHeight - 12;
      if (h > room) el.style.maxHeight = `${room}px`;
      top = Math.max(6, Math.min(below >= above ? r.bottom + gap : r.top - gap - h, innerHeight - Math.min(h, room) - 6));
    }
    el.style.top = `${top}px`;
    el.style.left = `${Math.max(6, Math.min(r.left, innerWidth - w - 6))}px`;
  };
  /** How much room a list has under a rectangle and over it. */
  const roomAt = (r: { top: number; bottom: number }, gap = 4) => Math.max(innerHeight - r.bottom - gap - 6, r.top - gap - 6);
  const rectJson = (r: DOMRect | null) => (r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);

  // ---- the blocks in the page, for handles, dragging and picking ---------------------------------------------------
  const COMPONENT = '.n-callout,.n-video,.n-math,.n-toc,.n-cover,.n-icon,pre,figure';
  /** The block a part belongs to: the item, the paragraph, the callout, the table, the card… */
  const blockOf = (t: Element | null): Element | null => {
    for (let x = t; x && x !== doc.body && x !== doc.documentElement; x = x.parentElement) {
      if (E.isUi(x)) return null;
      // A to-do's words, a callout's, a toggle's title: their block.
      const u = unitOf(x);
      if (u !== x) return u;
      const tag = x.tagName;
      if (tag === 'SUMMARY' && x.parentElement?.tagName === 'DETAILS') return x.parentElement;
      if (tag === 'LI') return x;
      if (/^(TD|TH|TR|THEAD|TBODY|TFOOT|CAPTION|COLGROUP|COL)$/.test(tag)) continue;
      if (tag === 'TABLE') {
        const p = x.parentElement;
        return p && p !== doc.body && p.classList.contains('n-scroll') ? p : x;
      }
      const comp = x.closest(COMPONENT);
      if (comp && comp !== doc.body) return comp;
      if (!/^inline/.test(getComputedStyle(x).display)) return x;
    }
    return null;
  };
  const CONTAINER = /^(DIV|SECTION|MAIN|ARTICLE|ASIDE|HEADER|FOOTER|NAV|FORM|FIELDSET|BLOCKQUOTE|DETAILS|UL|OL)$/;
  /** The innermost block on a line of the page (for the margin beside the blocks). */
  const blockAtY = (c: Element, y: number, depth = 0): Element | null => {
    for (const k of c.children) {
      if (skip(k)) continue;
      const r = k.getBoundingClientRect();
      if (!r.height || y < r.top || y > r.bottom) continue;
      const b = blockOf(k) ?? k;
      if (depth < 6 && CONTAINER.test(b.tagName) && !b.matches(COMPONENT) && b.children.length) return blockAtY(b, y, depth + 1) ?? b;
      return b;
    }
    return null;
  };
  /** Where the page's blocks are: the body, or the one wrapper most of it is in (a page's main part). */
  const flow = (): Element => {
    let c: Element = doc.body;
    for (let i = 0; i < 5; i++) {
      const kids = [...c.children].filter((x) => !skip(x));
      const main = kids.find((x) => x.tagName === 'MAIN') ?? (kids.length === 1 && /^(DIV|ARTICLE|SECTION)$/.test(kids[0].tagName) && !kids[0].matches('.n-card,.n-grid,.n-cols,.n-callout,.n-scroll') ? kids[0] : null);
      if (!main) break;
      c = main;
    }
    return c;
  };
  const lastBlock = (f: Element) => {
    let x = f.lastElementChild;
    while (x && (skip(x) || /^(FOOTER)$/.test(x.tagName))) x = x.previousElementSibling;
    return x;
  };

  // ---- several blocks picked -------------------------------------------------------------------------------------
  let picked: Element[] = [];
  let keepPicked = false;
  const pickMany = (list: Element[], main: Element | null) => {
    picked = list.length > 1 ? list : [];
    keepPicked = true;
    E.select(main ?? list[0] ?? null);
    keepPicked = false;
    E.redraw();
  };
  /** The blocks the menu and the keys act on: those picked, else the one picked, else the one written in. */
  const blocksNow = (): Element[] => {
    if (picked.length) return picked.filter((x) => x.isConnected);
    const w = E.editing();
    if (w) return [unitOf(w)];
    const s = E.sel();
    return s && s !== doc.body ? [unitOf(s)] : [];
  };
  const inOrder = (list: Element[]) => [...list].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  // ---- acting on blocks ------------------------------------------------------------------------------------------
  const COLOURS = ['grey', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  const SWATCH: Record<string, string> = { grey: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
  const colourName = (c: string) => L(`c${c[0].toUpperCase()}${c.slice(1)}`, c[0].toUpperCase() + c.slice(1));
  const colourOf = (el: Element, type: 'tc' | 'hl') => COLOURS.find((c) => el.classList.contains(`n-${type}-${c}`)) ?? null;
  /** Keeps writing where it was after a change to the block written in. */
  const stay = (): ((list: Element[]) => Next) => {
    const w = E.editing();
    const off = w ? (E.offset(w) ?? 0) : 0;
    const u = w ? unitOf(w) : null;
    return (list) => {
      if (w && w.isConnected) return writeIn(w, { off });
      if (u && w) {
        const nu = list.find((x) => x.isConnected);
        const nh = nu ? hostOf(nu) : null;
        if (nh) return writeIn(nh, { off });
      }
      return true;
    };
  };
  const turnAll = (list: Element[], kind: Kind) => {
    const w = E.editing();
    const off = w ? (E.offset(w) ?? 0) : 0;
    const wu = w ? unitOf(w) : null;
    let made: Element[] = [];
    E.change(() => {
      let next: HTMLElement | null = null;
      for (const b of inOrder(list)) {
        const bk = kindOf(b);
        if (!bk || (bk === kind && !isListKind(kind))) continue;
        // Turning an item into the kind it is turns it back to text, as the list buttons of word processors do.
        const nh = turnInto(b, bk === kind ? 'p' : kind);
        if (!nh) continue;
        made.push(unitOf(nh));
        if (b === wu) next = nh;
      }
      if (!made.length) return null;
      return next ? writeIn(next, { off }) : true;
    });
    made = made.filter((x) => x.isConnected);
    if (!E.editing() && made.length) pickMany(made, made[0]);
  };
  const colourAll = (list: Element[], type: 'tc' | 'hl', name: string | null) => {
    const back = stay();
    E.change(() => {
      for (const b of list) {
        for (const c of COLOURS) b.classList.remove(`n-${type}-${c}`);
        if (name) b.classList.add(`n-${type}-${name}`);
        if (!b.classList.length) b.removeAttribute('class');
      }
      return back(list);
    });
  };
  const freshCopy = (b: Element) => {
    const c = b.cloneNode(true) as Element;
    c.removeAttribute('id');
    for (const x of c.querySelectorAll('[id]')) x.removeAttribute('id');
    return c;
  };
  const duplicate = (list: Element[]) => {
    const all = inOrder(list);
    if (!all.length) return;
    const w = E.editing();
    const off = w ? (E.offset(w) ?? 0) : 0;
    const copies: Element[] = [];
    E.change(() => {
      let at = all[all.length - 1];
      for (const b of all) {
        const c = freshCopy(b);
        at.after(c);
        at = c;
        copies.push(c);
      }
      if (w && copies.length === 1) {
        const h = hostOf(copies[0]);
        if (h) return writeIn(h, { off });
      }
      return true;
    });
    if (!E.editing()) pickMany(copies, copies[0]);
  };
  /** Moves the blocks (side by side in one place) up or down past the block beside them. */
  const moveBy = (list: Element[], dir: -1 | 1) => {
    const all = inOrder(list);
    if (!all.length || all.some((x) => x.parentElement !== all[0].parentElement)) return;
    const back = stay();
    E.change(() => {
      if (dir < 0) {
        const p = prevSib(all[0]);
        if (!p) return null;
        all[all.length - 1].after(p);
      } else {
        const n = nextSib(all[all.length - 1]);
        if (!n) return null;
        all[0].before(n);
      }
      return back(all);
    });
    if (!E.editing() && all.length > 1) pickMany(all, all[0]);
    (all[0] as HTMLElement).scrollIntoView?.({ block: 'nearest' });
  };
  const copyBlocks = (list: Element[]) => {
    const all = inOrder(list);
    if (!all.length) return;
    const html = all
      .map((b) => {
        const c = b.cloneNode(true) as Element;
        for (const x of [c, ...c.querySelectorAll('[data-n-ce],[data-n-ph],[data-n-ceoff]')]) for (const a of ['contenteditable', 'data-n-ce', 'data-n-ph', 'data-n-ceoff']) x.removeAttribute(a);
        return c.outerHTML;
      })
      .join('');
    E.copy(html, all.length > 1 ? L('nBlocks', '{n} blocks').replace('{n}', String(all.length)) : E.nameOf(all[0]));
  };
  const removeBlocks = (list: Element[]) => {
    const all = inOrder(list).filter((x) => x !== doc.body);
    if (!all.length) return;
    const after = nextSib(all[all.length - 1]) ?? prevSib(all[0]) ?? all[0].parentElement;
    E.change(() => {
      for (const b of all) {
        const list = b.tagName === 'LI' ? b.parentElement : null;
        b.remove();
        if (list && !list.children.length) list.remove();
      }
      picked = [];
      return after && after.isConnected && after !== doc.documentElement ? { pick: after } : true;
    });
  };

  // ---- the block menu (the ⋮⋮, Ctrl+/) ------------------------------------------------------------------------------
  type Row = { icon: string; label: string; keys?: string; run?: () => void; to?: 'turn' | 'colour'; danger?: boolean; on?: boolean; off?: boolean } | '-' | { head: string };
  let menu: { blocks: Element[]; view: 'main' | 'turn' | 'colour'; i: number; at: { left: number; top: number; bottom: number } } | null = null;
  const TURNS: [Kind, string, string, string][] = [
    ['p', 'text', 'Text', 'text'],
    ['h1', 'h1', 'Heading 1', 'H1'],
    ['h2', 'h2', 'Heading 2', 'H2'],
    ['h3', 'h3', 'Heading 3', 'H3'],
    ['bullet', 'sBullet', 'Bulleted list', 'bullet'],
    ['number', 'sNumber', 'Numbered list', 'number'],
    ['todo', 'sTodo', 'To-do list', 'todo'],
    ['toggle', 'sToggle', 'Toggle list', 'toggle'],
    ['quote', 'quote', 'Quote', 'quote'],
    ['callout', 'sCallout', 'Callout', 'callout'],
    ['code', 'sCode', 'Code', 'code'],
  ];
  const TURN_KEY_LABEL: Partial<Record<Kind, string>> = { p: 'Ctrl+Alt+0', h1: 'Ctrl+Alt+1', h2: 'Ctrl+Alt+2', h3: 'Ctrl+Alt+3', number: 'Ctrl+Shift+7', bullet: 'Ctrl+Shift+8', todo: 'Ctrl+Shift+9' };
  const keyText = (k: string) =>
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? k
          .replace(/Ctrl\+/g, '⌘')
          .replace(/Alt\+/g, '⌥')
          .replace(/Shift\+/g, '⇧')
      : k;
  const iconOf = (k: string) => (/^H[1-6]$/.test(k) ? glyph(k) : svg(k));
  const menuRows = (): Row[] => {
    if (!menu) return [];
    const list = menu.blocks;
    const texty = list.every((b) => !!kindOf(b));
    if (menu.view === 'turn') {
      const cur = list.length === 1 ? kindOf(list[0]) : null;
      return [
        { icon: svg('left'), label: L('turnInto', 'Turn into'), run: () => view('main') },
        '-',
        ...TURNS.map(([k, key, en, ic]): Row => ({ icon: iconOf(ic), label: L(key, en), keys: TURN_KEY_LABEL[k], on: cur === k, run: () => (closeMenu(), turnAll(list, k)) })),
      ];
    }
    if (menu.view === 'colour') return [{ icon: svg('left'), label: L('colour', 'Colour'), run: () => view('main') }];
    const n = list.length;
    return [
      { head: n > 1 ? L('nBlocks', '{n} blocks').replace('{n}', String(n)) : E.nameOf(list[0]) },
      ...(texty ? [{ icon: svg('turn'), label: L('turnInto', 'Turn into'), to: 'turn' as const, keys: 'Ctrl+/' }] : []),
      { icon: svg('colour'), label: L('colour', 'Colour'), to: 'colour' },
      '-',
      ...(n === 1 ? [{ icon: svg('plus'), label: L('addBelowShort', 'Add a block below'), run: () => (closeMenu(), addBlock(list[0], false)) }] : []),
      { icon: svg('dup'), label: L('duplicate', 'Duplicate'), keys: 'Ctrl+D', run: () => (closeMenu(), duplicate(list)) },
      { icon: svg('up'), label: L('upTip', 'Move up'), keys: 'Ctrl+Shift+↑', run: () => (closeMenu(), moveBy(list, -1)), off: !list.length || !prevSib(inOrder(list)[0]) },
      { icon: svg('down'), label: L('downTip', 'Move down'), keys: 'Ctrl+Shift+↓', run: () => (closeMenu(), moveBy(list, 1)), off: !list.length || !nextSib(inOrder(list)[n - 1]) },
      { icon: svg('copy'), label: L('copy', 'Copy'), keys: 'Ctrl+C', run: () => (closeMenu(), copyBlocks(list)) },
      { icon: svg('del'), label: L('delete', 'Delete'), keys: 'Del', danger: true, run: () => (closeMenu(), removeBlocks(list)) },
      ...(E.canAsk() ? (['-', { icon: svg('ask'), label: L('askAgent', 'Ask the agent'), run: () => (closeMenu(), E.send({ type: 'wa-ed-agent' })) }] as Row[]) : []),
    ];
  };
  const pressable = (r: Row): r is Exclude<Row, '-' | { head: string }> => r !== '-' && !('head' in r) && !r.off;
  const view = (v: 'main' | 'turn' | 'colour') => {
    if (!menu) return;
    menu.view = v;
    menu.i = v === 'main' ? -1 : 0;
    renderMenu();
  };
  const renderMenu = () => {
    if (!menu) {
      menuEl.style.display = 'none';
      return;
    }
    const rows = menuRows();
    let html = rows
      .map((r, i) => {
        if (r === '-') return '<div class="ms"></div>';
        if ('head' in r) return `<div class="mh">${esc(r.head)}</div>`;
        const tail = r.to ? svg('right', 14) : r.on ? svg('check', 14) : '';
        return `<button class="row${r.danger ? ' danger' : ''}${i === menu!.i ? ' on' : ''}" data-i="${i}" role="menuitem"${r.off ? ' aria-disabled="true"' : ''}><span class="ri">${r.icon}</span><span class="rl">${esc(r.label)}</span>${r.keys ? `<span class="rk">${esc(keyText(r.keys))}</span>` : ''}${tail ? `<span class="ri">${tail}</span>` : ''}</button>`;
      })
      .join('');
    if (menu.view === 'colour') {
      const one = menu.blocks.length === 1 ? menu.blocks[0] : null;
      const tc = one ? colourOf(one, 'tc') : undefined;
      const hl = one ? colourOf(one, 'hl') : undefined;
      const sw = (type: 'tc' | 'hl', c: string | null, on: boolean) =>
        `<button data-sw="${type}:${c ?? ''}" title="${esc(c ? colourName(c) : L('cDefault', 'No colour'))}" aria-label="${esc(c ? colourName(c) : L('cDefault', 'No colour'))}" class="${on ? 'on' : ''}" style="${type === 'tc' ? `color:${c ? SWATCH[c] : ink}` : c ? `background:${SWATCH[c]}38` : ''}">${type === 'tc' ? 'A' : c ? '' : '⌀'}</button>`;
      html += `<div class="mh">${esc(L('textColour', 'Text colour'))}</div><div class="sw">${[null, ...COLOURS].map((c) => sw('tc', c, one !== null && tc === c)).join('')}</div><div class="mh">${esc(L('background', 'Background'))}</div><div class="sw">${[null, ...COLOURS].map((c) => sw('hl', c, one !== null && hl === c)).join('')}</div>`;
    }
    menuEl.innerHTML = html;
    menuEl.style.display = 'flex';
    placeAt(menuEl, menu.at);
  };
  const openMenu = (blocks: Element[], at: { left: number; top: number; bottom: number }, v: 'main' | 'turn' | 'colour' = 'main') => {
    closeSlash();
    menu = { blocks, view: v, i: v === 'main' ? -1 : 0, at };
    renderMenu();
    // On a phone the app folds the drawer under the page meanwhile, so the menu has the page's height to show in.
    E.send({ type: 'wa-ed-menu', on: true });
  };
  const closeMenu = () => {
    if (!menu) return;
    menu = null;
    renderMenu();
    E.redraw();
    E.send({ type: 'wa-ed-menu', on: false });
  };
  menuEl.addEventListener('click', (e) => {
    if (!pressedOn(menuEl)) return;
    const t = e.composedPath()[0] as Element;
    const sw = (t as HTMLElement).closest?.('[data-sw]') as HTMLElement | null;
    if (sw && menu) {
      const [type, c] = (sw.dataset.sw ?? '').split(':');
      const list = menu.blocks;
      closeMenu();
      colourAll(list, type as 'tc' | 'hl', c || null);
      return;
    }
    const b = (t as HTMLElement).closest?.('[data-i]') as HTMLElement | null;
    if (!b || !menu) return;
    const r = menuRows()[Number(b.dataset.i)];
    if (!r || !pressable(r)) return;
    if (r.to) return view(r.to);
    r.run?.();
  });
  menuEl.addEventListener('pointermove', (e) => {
    const b = ((e.composedPath()[0] as HTMLElement).closest?.('[data-i]') as HTMLElement | null) ?? null;
    if (!menu || !b) return;
    const i = Number(b.dataset.i);
    if (i !== menu.i) {
      menu.i = i;
      for (const x of menuEl.querySelectorAll('.row')) x.classList.toggle('on', (x as HTMLElement).dataset.i === String(i));
    }
  });
  const menuKey = (e: KeyboardEvent): boolean => {
    if (!menu) return false;
    const rows = menuRows();
    const can = rows.map((r, i) => (pressable(r) ? i : -1)).filter((i) => i >= 0);
    if (e.key === 'Escape') {
      closeMenu();
      return true;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const at = can.indexOf(menu.i);
      menu.i = can[(at + (e.key === 'ArrowDown' ? 1 : -1) + can.length + (at < 0 && e.key === 'ArrowUp' ? 1 : 0)) % can.length] ?? -1;
      renderMenu();
      return true;
    }
    if (e.key === 'ArrowLeft' && menu.view !== 'main') {
      view('main');
      return true;
    }
    const r = rows[menu.i];
    if ((e.key === 'ArrowRight' || e.key === 'Enter') && r && pressable(r)) {
      if (r.to) view(r.to);
      else if (e.key === 'Enter') r.run?.();
      return true;
    }
    return e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Tab';
  };

  // ---- "/": the blocks to add, filtered as you type --------------------------------------------------------------
  interface Item {
    id: string;
    label: string;
    en: string;
    also: string;
    icon: string;
    key?: string;
  }
  const ITEMS: Item[] = (
    [
      ['p', 'text', 'Text', 'paragraph plain words', 'text', ''],
      ['h1', 'h1', 'Heading 1', 'title big', 'H1', '#'],
      ['h2', 'h2', 'Heading 2', 'subtitle', 'H2', '##'],
      ['h3', 'h3', 'Heading 3', 'small heading', 'H3', '###'],
      ['bullet', 'sBullet', 'Bulleted list', 'ul unordered points', 'bullet', '-'],
      ['number', 'sNumber', 'Numbered list', 'ol ordered numbers', 'number', '1.'],
      ['todo', 'sTodo', 'To-do list', 'todo checkbox task check tick', 'todo', '[]'],
      ['toggle', 'sToggle', 'Toggle list', 'toggle details fold collapse foldout', 'toggle', ''],
      ['quote', 'quote', 'Quote', 'blockquote citation', 'quote', '>'],
      ['callout', 'sCallout', 'Callout', 'note tip info box emoji', 'callout', ''],
      ['hr', 'divider', 'Divider', 'line rule separator hr', 'hr', '---'],
      ['code', 'sCode', 'Code', 'pre snippet program', 'code', '```'],
      ['table', 'table', 'Table', 'grid rows columns cells', 'table', ''],
      ['picture', 'image', 'Picture', 'image photo upload img', 'picture', ''],
      ['video', 'video', 'Video', 'youtube vimeo film movie embed', 'video', ''],
      ['button', 'button', 'Button', 'link action cta', 'button', ''],
      ['cols2', 'sCols2', 'Two columns', 'layout side columns 2', 'cols2', ''],
      ['cols3', 'sCols3', 'Three columns', 'layout side columns 3', 'cols3', ''],
      ['card', 'card', 'Card', 'box tile panel', 'card', ''],
      ['toc', 'sToc', 'Table of contents', 'toc outline headings contents', 'toc', ''],
      ['math', 'sMath', 'Maths', 'equation formula latex katex tex math', 'math', ''],
      ['emoji', 'sEmoji', 'Emoji', 'smiley icon face symbol', 'emoji', ''],
    ] as const
  ).map(([id, key, en, also, icon, k]) => ({ id, label: L(key, en), en, also, icon, key: k }));
  let slash: { h: HTMLElement; node: Text; at: number; items: Item[]; i: number; misses: number; rows: number } | null = null;
  const findItems = (q: string): Item[] => {
    const words = q.toLowerCase().replace(/-/g, '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return ITEMS;
    const scored = ITEMS.map((it) => {
      const hay = ` ${it.label.toLowerCase()} ${it.en.toLowerCase()} ${it.id} ${it.also} ${it.key ?? ''}`.replace(/-/g, '');
      const ok = words.every((w) => hay.includes(` ${w}`) || hay.includes(w));
      const s = !ok ? 0 : it.label.toLowerCase().startsWith(words[0]) || it.en.toLowerCase().startsWith(words[0]) ? 3 : hay.includes(` ${words[0]}`) ? 2 : 1;
      return { it, s };
    });
    return scored
      .filter((x) => x.s)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
  };
  const renderSlash = () => {
    if (!slash) {
      slEl.style.display = 'none';
      return;
    }
    const items = slash.items;
    const c = caretBox() ?? slash.h.getBoundingClientRect();
    const at = { left: c.left - 8, top: c.top, bottom: c.top + c.height };
    // As many columns as it takes for the whole list to fit beside the caret (three where the page is wide enough).
    const fits = (cols: number) => Math.ceil(items.length / cols) * (coarse ? 40 : 30) + 38 <= roomAt(at);
    let cols = items.length >= 10 && innerWidth >= 460 ? 2 : 1;
    if (cols === 1 && items.length > 6 && innerWidth >= 460 && !fits(1)) cols = 2;
    if (cols === 2 && innerWidth >= 640 && !fits(2)) cols = 3;
    slash.rows = Math.ceil(items.length / cols);
    const row = (it: Item, i: number) =>
      `<button class="row${i === slash!.i ? ' on' : ''}" data-i="${i}" role="option" aria-selected="${i === slash!.i}"><span class="ri">${/^H[1-6]$/.test(it.icon) ? glyph(it.icon) : svg(it.icon)}</span><span class="rl">${esc(it.label)}</span>${it.key && cols === 1 ? `<span class="rk">${esc(it.key)}</span>` : ''}</button>`;
    const q = slashQuery();
    slEl.innerHTML = items.length
      ? `<div class="mh">${esc(L('blocks', 'Blocks'))}${q ? `<span class="q">/${esc(q)}</span>` : ''}</div><div class="sg" style="grid-template-rows:repeat(${slash.rows},auto);grid-template-columns:repeat(${cols},1fr)">${items.map(row).join('')}</div>`
      : `<div class="none">${esc(L('noBlocks', 'No block by that name'))}</div>`;
    slEl.style.display = 'flex';
    slEl.style.minWidth = cols === 3 ? '600px' : cols === 2 ? '400px' : '';
    placeAt(slEl, at);
    slEl.querySelector('.row.on')?.scrollIntoView({ block: 'nearest' });
  };
  const openSlash = (h: HTMLElement, node: Text, at: number) => {
    closeMenu();
    slash = { h, node, at, items: ITEMS, i: 0, misses: 0, rows: ITEMS.length };
    renderSlash();
  };
  const closeSlash = () => {
    if (!slash) return;
    slash = null;
    renderSlash();
  };
  /** "/" typed at a block's start or after a space opens the list. */
  const maybeSlash = (h: HTMLElement) => {
    const r = caretIn(h);
    if (!r || r.startContainer.nodeType !== 3 || r.startOffset < 1) return;
    const t = r.startContainer as Text;
    if (t.data[r.startOffset - 1] !== '/') return;
    const typed = head(h, r).toString();
    const before = typed.slice(-2, -1);
    if (typed.length > 1 && !/[\s\u00a0]/.test(before)) return;
    // In blocks of words only: not in code, a table's cell, a button or a link.
    const k = kindOf(unitOf(h));
    if (!k || k === 'code') return;
    openSlash(h, t, r.startOffset - 1);
  };
  const slashQuery = (): string | null => {
    if (!slash) return null;
    const r = caretIn(slash.h);
    if (!r || r.startContainer !== slash.node || r.startOffset <= slash.at || slash.node.data[slash.at] !== '/') return null;
    return slash.node.data.slice(slash.at + 1, r.startOffset);
  };
  const slashInput = () => {
    if (!slash) return;
    const q = slashQuery();
    if (q === null || /^\s/.test(q) || q.length > 30) return closeSlash();
    const items = findItems(q);
    slash.misses = items.length ? 0 : slash.misses + 1;
    if (slash.misses > 3) return closeSlash();
    slash.items = items;
    slash.i = 0;
    renderSlash();
  };
  const slashKey = (e: KeyboardEvent): boolean => {
    if (!slash) return false;
    const n = slash.items.length;
    if (e.key === 'Escape') {
      closeSlash();
      return true;
    }
    if (!n) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      slash.i = (slash.i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      renderSlash();
      return true;
    }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && slash.rows < n) {
      const j = slash.i + (e.key === 'ArrowRight' ? slash.rows : -slash.rows);
      if (j >= 0 && j < n) slash.i = j;
      renderSlash();
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      pickItem(slash.items[slash.i]);
      return true;
    }
    return false;
  };
  slEl.addEventListener('click', (e) => {
    if (!pressedOn(slEl)) return;
    const b = ((e.composedPath()[0] as HTMLElement).closest?.('[data-i]') as HTMLElement | null) ?? null;
    if (b && slash) pickItem(slash.items[Number(b.dataset.i)]);
  });
  slEl.addEventListener('pointermove', (e) => {
    const b = ((e.composedPath()[0] as HTMLElement).closest?.('[data-i]') as HTMLElement | null) ?? null;
    if (!slash || !b || Number(b.dataset.i) === slash.i) return;
    slash.i = Number(b.dataset.i);
    for (const x of slEl.querySelectorAll('.row')) x.classList.toggle('on', (x as HTMLElement).dataset.i === b.dataset.i);
  });
  const TURNABLE = new Set(['p', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'quote', 'callout', 'code']);
  const pickItem = (it: Item | undefined) => {
    const s = slash;
    if (!s || !it) return;
    const h = s.h;
    const u = unitOf(h);
    closeSlash();
    /** Takes out the "/…" typed for the list. */
    const dropTyped = () => {
      if (!s.node.isConnected || s.node.data[s.at] !== '/') return;
      const r = caretIn(h);
      const end = r && r.startContainer === s.node ? r.startOffset : s.at + 1;
      const x = doc.createRange();
      x.setStart(s.node, s.at);
      x.setEnd(s.node, Math.max(s.at + 1, Math.min(end, s.node.length)));
      x.deleteContents();
      // A space left last before the caret would fold away as the next words come: it stays a space.
      const t = s.node;
      if (s.at > 0 && s.at === t.length && t.data[s.at - 1] === ' ') t.replaceData(s.at - 1, 1, '\u00a0');
    };
    if (it.id === 'emoji' || it.id === 'picture' || it.id === 'video' || it.id === 'math') {
      // Chosen in the app (its picker, or a small form there), and put in place when it comes back.
      E.noteTyping();
      dropTyped();
      const box = caretBox() ?? h.getBoundingClientRect();
      if (it.id === 'emoji') ask('emoji', box, { host: E.pathOf(h), off: E.offset(h) ?? 0 });
      else ask(it.id, box, { ref: E.pathOf(u), replace: emptyHost(h) });
      return;
    }
    E.change(() => {
      // The "/…" goes in the same step, so Ctrl+Z brings it back.
      dropTyped();
      fillEmpty(h);
      const empty = emptyHost(h);
      if (TURNABLE.has(it.id)) {
        if (empty && kindOf(u)) return writeIn(turnInto(u, it.id as Kind));
        const { unit, host } = newUnit(it.id as Kind);
        putAfter(unit, u, it.id as Kind);
        return writeIn(host);
      }
      return insertBlock(it.id, u, empty);
    });
  };
  /** A block of another sort, in place of an empty block or after one: where to write next. */
  const insertBlock = (id: string, u: Element, replace: boolean): Next => {
    const plain = !kitPage();
    const put = (el: HTMLElement) => {
      if (replace && u.tagName !== 'LI') u.replaceWith(el);
      else {
        putAfter(el, u);
        if (replace) dropUnit(u);
      }
      return el;
    };
    const textAfter = (el: Element): Next => {
      // (after a block an item holds, in an item of its own at that level)
      const hl = holderOf(el);
      const at = hl ?? el;
      const n = nextSib(at);
      const h = n ? firstHostIn(n) : null;
      if (h && emptyHost(h)) return writeIn(h);
      const { unit, host } = newUnit('p');
      at.after(unit);
      if (hl) holdIn(unit);
      return writeIn(host);
    };
    switch (id) {
      case 'hr':
        return textAfter(put(make('hr')));
      case 'table': {
        const wrap = make('div', 'n-scroll');
        const t = make('table', 'n-tbl');
        const row = (cell: 'th' | 'td') => `<tr>${`<${cell}><br></${cell}>`.repeat(3)}</tr>`;
        t.innerHTML = `<thead>${row('th')}</thead><tbody>${row('td')}${row('td')}</tbody>`;
        wrap.append(t);
        put(wrap);
        return writeIn(t.querySelector('th'));
      }
      case 'button': {
        const p = make('p');
        const a = make('a', 'n-btn n-primary');
        a.href = '#';
        a.textContent = L('btnWords', 'A button');
        if (plain) a.setAttribute('style', 'background:transparent;color:inherit;border:1px solid currentColor');
        p.append(a);
        put(p);
        return writeIn(a, { all: true });
      }
      case 'cols2':
      case 'cols3': {
        const c = make('div', 'n-cols');
        for (let i = 0; i < (id === 'cols2' ? 2 : 3); i++) {
          const col = make('div');
          col.append(newUnit('p').unit);
          c.append(col);
        }
        put(c);
        return writeIn(c.querySelector('p'));
      }
      case 'card': {
        const card = make('div', 'n-card');
        if (plain) card.setAttribute('style', 'background:transparent;border-color:color-mix(in srgb,currentColor 18%,transparent)');
        const b = make('div', 'n-body');
        const h3 = make('h3');
        h3.textContent = L('cardTitle', 'A card');
        const p = make('p');
        p.textContent = L('cardWords', 'A few words about it.');
        b.append(h3, p);
        card.append(b);
        put(card);
        return writeIn(h3, { all: true });
      }
      case 'toc': {
        const nav = make('nav', 'n-toc');
        put(nav);
        refreshToc();
        return textAfter(nav);
      }
      default:
        return null;
    }
  };

  // ---- asking the app (an emoji, a picture, a video, maths, an icon, a cover) ------------------------------------------
  /** What the app is asked for, by its number: where its answer goes. */
  const asked = new Map<string, Record<string, unknown>>();
  let asks = 0;
  const ask = (what: string, r: DOMRect | null, where: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const id = `a${++asks}`;
    asked.set(id, { what, ...where });
    E.send({ type: 'wa-ed-ask', what, id, rect: rectJson(r), ...extra });
    return id;
  };
  const safeSrc = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s.length > 3_000_000 || /["'<>\s\\]/.test(s.replace(/^data:[^,]+,/, ''))) return null;
    return /^https?:\/\/[^\s"'<>]+$/i.test(s) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(s) ? s : null;
  };
  /** Puts what came back where it was asked for: after a block, in an empty block's place, or at the end of the page. */
  const placeBlock = (el: HTMLElement, where: Record<string, unknown>) => {
    const ref = where.ref ? E.byPath(where.ref) : null;
    const u = ref && ref.isConnected ? ref : null;
    if (u && where.replace && u.tagName !== 'LI' && kindOf(u) && emptyHost(hostOf(u) ?? u)) u.replaceWith(el);
    else if (u && where.into) u.append(el);
    else if (u && where.before) u.before(el);
    else if (u) putAfter(el, u);
    else {
      const f = flow();
      const last = lastBlock(f);
      if (last) last.after(el);
      else f.append(el);
    }
    return el;
  };
  const sanitize = (html: string) => {
    const t = make('template');
    t.innerHTML = html;
    for (const x of t.content.querySelectorAll('script,style,iframe,object,embed,link,meta')) x.remove();
    for (const x of t.content.querySelectorAll('*')) for (const a of [...x.attributes]) if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) x.removeAttribute(a.name);
    return t.innerHTML;
  };
  const KATEX_CSS = /^https:\/\/cdn\.jsdelivr\.net\/npm\/katex@[\d.]+\/dist\/katex\.min\.css$/;
  const fill = (arg: any) => {
    const id = typeof arg?.id === 'string' ? arg.id : '';
    const where = asked.get(id);
    if (!where) return;
    asked.delete(id);
    const what = where.what;
    if (what === 'emoji') {
      const ch = typeof arg.char === 'string' ? arg.char.slice(0, 16) : '';
      const h = E.byPath(where.host);
      if (!ch || !h) return;
      E.write(h, { off: Number(where.off) || 0 });
      E.noteTyping();
      doc.execCommand('insertText', false, ch);
      return;
    }
    if (what === 'callout-icon' || what === 'icon') {
      const ch = typeof arg.char === 'string' ? arg.char.slice(0, 16) : null;
      if (what === 'icon') return setIcon(ch);
      const c = E.byPath(where.ref);
      const i = c?.querySelector(':scope > .n-callout-icon');
      if (!i || !ch) return;
      E.change(() => {
        i.textContent = ch;
        return true;
      });
      return;
    }
    if (what === 'cover') return setCover(arg.cover ?? null);
    if (what === 'picture') {
      const src = safeSrc(arg.src);
      if (!src) return;
      E.change(() => {
        const img = make('img', 'n-pic');
        img.src = src;
        img.alt = typeof arg.alt === 'string' ? arg.alt.slice(0, 300) : '';
        // Several dropped at once keep their order, whichever is ready first: after the one before it, or before the one after it.
        const group = where.group as { done: (Element | undefined)[] } | undefined;
        const n = Number(where.n) || 0;
        const before = group?.done
          .slice(0, n)
          .filter((x): x is Element => !!x && x.isConnected)
          .pop();
        const later = group?.done.slice(n + 1).find((x): x is Element => !!x && x.isConnected);
        if (before) before.after(img);
        else if (later) later.before(img);
        else placeBlock(img, where);
        if (group) group.done[n] = img;
        return { pick: img };
      });
      return;
    }
    if (what === 'video') {
      const href = typeof arg.href === 'string' && /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\/[\w\-./?=&%#:]+$/.test(arg.href) ? arg.href : '';
      const play = typeof arg.play === 'string' && /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)[\w-]+(\?[\w=&]*)?$/.test(arg.play) ? arg.play : '';
      if (!href || !play) return;
      const thumb = safeSrc(arg.thumb);
      E.change(() => {
        const a = make('a', 'n-video');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('data-video', play);
        const title = typeof arg.title === 'string' ? arg.title.slice(0, 200) : '';
        if (title) a.title = title;
        if (thumb) {
          const img = make('img');
          img.src = thumb;
          img.alt = title;
          a.append(img);
        }
        placeBlock(a, where);
        return { pick: a };
      });
      return;
    }
    if (what === 'math') {
      const tex = typeof arg.tex === 'string' ? arg.tex.slice(0, 5000) : '';
      const html = typeof arg.html === 'string' && arg.html.length < 400_000 ? sanitize(arg.html) : '';
      if (!tex || !html) return;
      if (typeof arg.css === 'string' && KATEX_CSS.test(arg.css) && !doc.getElementById('n-katex')) {
        const l = make('link');
        l.id = 'n-katex';
        l.rel = 'stylesheet';
        l.href = arg.css;
        doc.head.append(l);
      }
      E.change(() => {
        const ref = where.edit ? E.byPath(where.edit) : null;
        const m = ref?.classList.contains('n-math') ? ref : placeBlock(make('div', 'n-math'), where);
        m.setAttribute('data-tex', tex);
        m.setAttribute('role', 'img');
        m.setAttribute('aria-label', tex);
        m.innerHTML = html;
        return { pick: m };
      });
    }
  };

  // ---- a page's icon and cover -------------------------------------------------------------------------------------
  const iconEl = () => flow().querySelector(':scope > .n-icon') ?? doc.body.querySelector('.n-icon');
  const coverEl = () => flow().querySelector(':scope > .n-cover') ?? doc.body.querySelector('.n-cover');
  /** Where a cover (or an icon without one) goes: the top of the page's blocks, under a top bar. */
  const topOf = (f: Element) => {
    let x = f.firstElementChild;
    while (x && (skip(x) || x.tagName === 'HEADER' || x.tagName === 'NAV')) x = x.nextElementSibling;
    return x;
  };
  const setIcon = (ch: string | null) => {
    E.change(() => {
      let i = iconEl();
      if (!ch) {
        if (!i) return null;
        i.remove();
        return true;
      }
      if (!i) {
        i = make('div', 'n-icon');
        const c = coverEl();
        const f = flow();
        if (c) c.after(i);
        else f.insertBefore(i, topOf(f));
      }
      i.textContent = ch;
      return true;
    });
  };
  const GRADIENT = /^linear-gradient\([#\w\s,.%()-]{3,300}\)$/;
  const setCover = (v: any) => {
    const grad = typeof v?.gradient === 'string' && GRADIENT.test(v.gradient) ? v.gradient : '';
    const src = grad ? '' : safeSrc(v?.src);
    // Only none at all takes the cover away; a cover that is neither a gradient nor a picture is no cover.
    if (v && !grad && !src) return;
    E.change(() => {
      const old = coverEl();
      if (!grad && !src) {
        if (!old) return null;
        old.remove();
        return true;
      }
      let el: HTMLElement;
      if (src) {
        const img = make('img', 'n-cover');
        img.src = src;
        img.alt = '';
        el = img;
      } else {
        el = make('div', 'n-cover');
        el.style.backgroundImage = grad;
      }
      if (old) old.replaceWith(el);
      else {
        const f = flow();
        f.insertBefore(el, topOf(f));
        const i = iconEl();
        if (i && i.parentElement === el.parentElement && i.nextElementSibling !== el) el.after(i);
      }
      return true;
    });
  };
  const coverInfo = () => {
    const c = coverEl();
    if (!c) return null;
    if (c.tagName === 'IMG') return { kind: 'picture', value: (c.getAttribute('src') ?? '').slice(0, 300) };
    return { kind: 'gradient', value: (c as HTMLElement).style.backgroundImage.slice(0, 300) };
  };
  /** The page's first heading, which the icon and the cover are offered over. */
  const titleEl = () => {
    const f = flow();
    let n = 0;
    for (let x = f.firstElementChild; x && n < 6; x = x.nextElementSibling) {
      if (skip(x)) continue;
      n++;
      if (/^H[1-2]$/.test(x.tagName)) return x;
    }
    return null;
  };

  // ---- a table of contents, kept up to date ------------------------------------------------------------------------
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section';
  let tocTimer = 0;
  const refreshToc = () => {
    const tocs = [...doc.body.querySelectorAll('nav.n-toc')];
    if (!tocs.length) return;
    const heads = [...doc.body.querySelectorAll('h1,h2,h3')].filter((x) => !x.closest('.n-toc') && !E.isUi(x) && (x.textContent ?? '').trim());
    const used = new Set([...doc.body.querySelectorAll('[id]')].map((x) => x.id));
    const items = heads.map((hd) => {
      if (!hd.id) {
        const base = slug(hd.textContent ?? '');
        let id = base;
        for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
        hd.id = id;
        used.add(id);
      }
      return { id: hd.id, level: Number(hd.tagName[1]), text: (hd.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) };
    });
    const top = items.length ? Math.min(...items.map((i) => i.level)) : 1;
    const sign = JSON.stringify(items.map((i) => [i.id, i.level - top, i.text]));
    for (const toc of tocs) {
      if (toc.getAttribute('data-n-sign') === sign && toc.children.length === items.length) continue;
      toc.textContent = '';
      for (const i of items) {
        const a = make('a', `n-toc-${i.level - top + 1}`);
        a.setAttribute('href', `#${i.id}`);
        a.textContent = i.text;
        toc.append(a);
      }
      toc.setAttribute('data-n-sign', sign);
    }
  };

  // ---- handles beside the block under the pointer, and dragging it ---------------------------------------------------
  let hoverBlock: Element | null = null;
  let handleBlock: Element | null = null;
  let dragging = false;
  let drop: { ref: Element; after: boolean; into?: boolean } | null = null;
  const showDrop = (d: typeof drop) => {
    if (!d) {
      dl.style.display = 'none';
      return;
    }
    const r = d.ref.getBoundingClientRect();
    dl.style.display = 'block';
    dl.style.left = `${r.left}px`;
    dl.style.width = `${Math.max(24, r.width)}px`;
    dl.style.top = `${(d.into ? r.top + 6 : d.after ? r.bottom : r.top) - 1}px`;
  };
  /** Where something dragged lands: before or after the block under the pointer, or into an empty column. */
  const dropSpot = (x: number, y: number, moving: Element[]): typeof drop => {
    let t = E.under(x, y);
    while (t && moving.some((m) => m.contains(t!))) t = t.parentElement;
    if (!t || t === doc.documentElement) return null;
    const col = t.closest('.n-cols > *');
    if (col && !moving.includes(col)) {
      const kids = [...col.children].filter((k) => !moving.includes(k) && !skip(k));
      if (!kids.length) return { ref: col, after: false, into: true };
      if (t === col) {
        const below = kids.filter((k) => k.getBoundingClientRect().top < y);
        const k = below[below.length - 1] ?? kids[0];
        return { ref: k, after: k.getBoundingClientRect().top < y };
      }
    }
    let b = t === doc.body || t === flow() ? blockAtY(flow(), y) : blockOf(t);
    if (!b) {
      const f = flow();
      const last = lastBlock(f);
      if (!last || moving.includes(last)) return null;
      b = last;
    }
    while (b && moving.some((m) => m.contains(b!))) b = b.parentElement;
    if (!b || b === doc.body) return null;
    const r = b.getBoundingClientRect();
    return { ref: b, after: y > r.top + r.height / 2 };
  };
  /** Items moved out of their lists, each run of them in a list of their old one's kind (blocks stay as they are). */
  const asBlocks = (all: Element[]): Element[] => {
    const out: Element[] = [];
    let run: HTMLElement | null = null;
    for (const b of all) {
      const held = blockIn(b);
      if (b.tagName !== 'LI' || held) {
        // (a block an item held comes out as the block, the items under it after it)
        if (held) {
          out.push(held, ...subLists(b));
          b.remove();
        } else out.push(b);
        run = null;
        continue;
      }
      const from = b.parentElement ?? make('ul');
      if (!run || !sameList(run, from)) {
        run = cloneList(from);
        run.removeAttribute('start');
        out.push(run);
      }
      run.append(b);
    }
    return out;
  };
  const moveTo = (list: Element[], d: NonNullable<typeof drop>) => {
    const all = inOrder(list);
    E.change(() => {
      const oldLists = new Set(all.filter((b) => b.tagName === 'LI').map((b) => b.parentElement!));
      let ref: Element = d.ref;
      let nodes: Element[];
      if (!d.into && ref.tagName === 'LI' && all.every((b) => b.tagName === 'LI')) nodes = all;
      else {
        // Blocks dragged among a list's items go beside the whole list; items dragged elsewhere take a list along.
        if (ref.tagName === 'LI') {
          let top: Element = ref.parentElement!;
          while (top.parentElement?.tagName === 'LI') top = top.parentElement.parentElement!;
          ref = top;
        }
        nodes = asBlocks(all);
      }
      if (d.into) ref.append(...nodes);
      else if (d.after) ref.after(...nodes);
      else ref.before(...nodes);
      for (const l of oldLists) if (!l.children.length) l.remove();
      for (const n of nodes) if (isList(n) && n.isConnected) merge(n);
      picked = [];
      return { pick: all[0].isConnected ? all[0] : nodes[0] };
    });
  };
  const firstLineBox = (b: Element): DOMRect => {
    const h = hostOf(b);
    if (h) {
      const rs = lineBoxes(h);
      if (rs.length) return rs[0];
    }
    const r = b.getBoundingClientRect();
    return new DOMRect(r.left, r.top, r.width, Math.min(r.height, 28));
  };
  const drawHandles = () => {
    // Under the pointer (a phone has none: there, the bar of the block picked has the handle).
    const b = hoverBlock?.isConnected ? hoverBlock : null;
    handleBlock = b;
    if (!b || dragging || slash) {
      hd.style.display = 'none';
      return;
    }
    const r = b.getBoundingClientRect();
    if (!r.width && !r.height) {
      hd.style.display = 'none';
      return;
    }
    hd.style.display = 'flex';
    const first = firstLineBox(b);
    const marker = b.tagName === 'LI' && !blockIn(b) ? 20 : 0;
    // Side by side where the margin has room; one over the other in a narrow one (a page's usual 20 pixels).
    hd.classList.remove('col');
    let w = hd.offsetWidth;
    if (r.left - marker - w - 4 < 2) hd.classList.add('col');
    w = hd.offsetWidth;
    const h = hd.offsetHeight;
    const col = hd.classList.contains('col');
    let left = r.left - marker - w - (col ? 1 : 4);
    let top = col ? first.top : first.top + Math.min(first.height, 32) / 2 - h / 2;
    if (left < 1) {
      // No room beside it at all (a phone's margin): over its top-left corner.
      hd.classList.remove('col');
      left = Math.max(2, r.left);
      top = r.top - hd.offsetHeight - 2;
    }
    hd.style.left = `${left}px`;
    hd.style.top = `${Math.max(2, Math.min(top, innerHeight - h - 2))}px`;
  };
  hd.querySelector('.grip')!.addEventListener('pointerdown', (ev) => {
    const e = ev as PointerEvent;
    e.preventDefault();
    e.stopPropagation();
    if (!E.editing()) window.focus();
    const b = handleBlock;
    if (!b) return;
    const grip = e.currentTarget as HTMLElement;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const list = picked.includes(b) ? picked.slice() : [b];
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
      if (!moved) {
        moved = true;
        dragging = true;
        closeMenu();
        E.redraw();
      }
      drop = dropSpot(m.clientX, m.clientY, list);
      showDrop(drop);
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      dragging = false;
      showDrop(null);
      if (moved) {
        // The click that ends a drag is not one on the page.
        noClick = true;
        setTimeout(() => (noClick = false), 0);
        if (drop) moveTo(list, drop);
        drop = null;
        return;
      }
      // A click: the block picked, and its menu.
      if (!picked.includes(b)) {
        E.finish();
        E.select(b);
      }
      const r = grip.getBoundingClientRect();
      openMenu(list, { left: r.left, top: r.top, bottom: r.bottom });
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
  });
  /** The + beside a block, or at the end of the page: an empty block there, and the list of blocks to make it one. */
  const addBlock = (b: Element | null, above: boolean) => {
    E.change(() => {
      const k = b ? kindOf(b) : null;
      const kind: Kind = isListKind(k) ? k! : 'p';
      const { unit, host } = newUnit(kind);
      if (!b) {
        const f = flow();
        const last = lastBlock(f);
        if (last) last.after(unit);
        else f.append(unit);
      } else if (above) {
        b.before(unit);
        if (b.tagName === 'LI' && unit.tagName !== 'LI') holdIn(unit);
      } else putAfter(unit, b, kind);
      return writeIn(host);
    });
    if (E.editing()) doc.execCommand('insertText', false, '/');
  };
  hd.querySelector('.add')!.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    addBlock(handleBlock, (e as MouseEvent).altKey);
  });
  endBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = flow();
    const last = lastBlock(f);
    const h = last ? hostOf(last) : null;
    if (h && kindOf(last) === 'p' && emptyHost(h)) {
      E.write(h, { off: 0 });
      doc.execCommand('insertText', false, '/');
    } else addBlock(null, false);
  });
  offer.addEventListener('click', (e) => {
    const b = ((e.composedPath()[0] as HTMLElement).closest?.('[data-o]') as HTMLElement | null) ?? null;
    if (!b) return;
    e.stopPropagation();
    ask(b.dataset.o === 'icon' ? 'icon' : 'cover', b.getBoundingClientRect(), {}, { has: b.dataset.o === 'icon' ? !!iconEl() : !!coverEl() });
  });
  cv.addEventListener('click', (e) => {
    const b = ((e.composedPath()[0] as HTMLElement).closest?.('[data-o]') as HTMLElement | null) ?? null;
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.o === 'nocover') setCover(null);
    else ask('cover', b.getBoundingClientRect(), {}, { has: true });
  });

  // ---- drawing ---------------------------------------------------------------------------------------------------
  const drawOffer = () => {
    const t = titleEl();
    const c = coverEl();
    const i = iconEl();
    const hb = hoverBlock;
    const near = !!hb && !!t && (hb === t || (!!i && hb === i));
    if (!near || dragging || E.editing() || (i && c)) offer.style.display = 'none';
    else {
      (offer.querySelector('[data-o=icon]') as HTMLElement).style.display = i ? 'none' : '';
      (offer.querySelector('[data-o=cover]') as HTMLElement).style.display = c ? 'none' : '';
      offer.style.display = 'flex';
      // In the space over the title (a page's top margin, 20 pixels in the kit's look).
      const r = (i ?? t)!.getBoundingClientRect();
      offer.style.left = `${Math.max(2, r.left - 6)}px`;
      offer.style.top = `${Math.max(0, r.top - offer.offsetHeight - 1)}px`;
    }
    if (c && hb === c && !dragging) {
      cv.style.display = 'flex';
      const r = c.getBoundingClientRect();
      cv.style.left = `${Math.max(4, r.right - cv.offsetWidth - 10)}px`;
      cv.style.top = `${Math.max(4, Math.min(r.bottom - cv.offsetHeight - 10, innerHeight - cv.offsetHeight - 4))}px`;
    } else cv.style.display = 'none';
  };
  const drawEnd = () => {
    const f = flow();
    const last = lastBlock(f);
    const r = (last ?? f).getBoundingClientRect();
    if (!last && !f.getBoundingClientRect().height) {
      endBtn.style.display = 'none';
      return;
    }
    const fr = f.getBoundingClientRect();
    endBtn.style.display = 'grid';
    const left = Math.max(2, (last ? r.left : fr.left) - endBtn.offsetWidth - 6);
    const top = (last ? r.bottom : fr.top) + 10;
    endBtn.style.left = `${left}px`;
    endBtn.style.top = `${top}px`;
    endBtn.style.visibility = top > innerHeight || top < -40 ? 'hidden' : '';
  };
  const drawPicked = () => {
    const live = picked.filter((x) => x.isConnected);
    while (boxes.children.length < live.length) boxes.append(make('div', 'box2'));
    while (boxes.children.length > live.length) boxes.lastElementChild!.remove();
    live.forEach((b, i) => {
      const r = b.getBoundingClientRect();
      const el = boxes.children[i] as HTMLElement;
      el.style.left = `${r.left - 2}px`;
      el.style.top = `${r.top - 2}px`;
      el.style.width = `${r.width + 4}px`;
      el.style.height = `${r.height + 4}px`;
    });
  };
  const draw = () => {
    drawHandles();
    drawOffer();
    drawEnd();
    drawPicked();
    if (menu) {
      if (menu.blocks.some((b) => !b.isConnected)) closeMenu();
    }
  };

  // ---- the page's events ---------------------------------------------------------------------------------------------
  const fromUi = (e: Event) => e.composedPath().some((x) => x instanceof Element && E.isUi(x));
  addEventListener(
    'keydown',
    (e) => {
      if (fromUi(e)) return;
      if (menu && menuKey(e)) return stop(e);
      if (slash && slashKey(e)) return stop(e);
      if (e.isComposing || e.keyCode === 229) return;
      const mod = isMod(e);
      const h = E.editing();
      hoverBlock = null;
      const kind = turnKey(e);
      if (kind) {
        const list = blocksNow();
        if (list.length) turnAll(list, kind);
        return stop(e);
      }
      if (mod && e.key === '/' && !e.shiftKey) {
        const list = blocksNow();
        if (!list.length || !list.every((b) => kindOf(b))) return stop(e);
        const r = (h ? caretBox() : null) ?? list[0].getBoundingClientRect();
        openMenu(list, { left: r.left, top: r.top, bottom: r.top + (r.height || 20) }, 'turn');
        return stop(e);
      }
      if (mod && (e.key === '?' || (e.key === '/' && e.shiftKey))) {
        E.send({ type: 'wa-ed-keys' });
        return stop(e);
      }
      if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const list = blocksNow();
        if (list.length) moveBy(list, e.key === 'ArrowUp' ? -1 : 1);
        return stop(e);
      }
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
        const list = blocksNow();
        if (list.length) duplicate(list);
        return stop(e);
      }
      if (h) {
        if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
          inlineCode();
          return stop(e);
        }
        if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
          E.noteTyping();
          doc.execCommand('strikeThrough');
          return stop(e);
        }
        if (e.key === 'Escape') {
          const u = unitOf(h);
          E.finish();
          E.select(u);
          return stop(e);
        }
        let done = false;
        if (e.key === 'Enter' && mod && !e.shiftKey) done = modEnter(h);
        else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) done = enter(h);
        else if (e.key === 'Backspace' && !mod && !e.altKey && !e.shiftKey) done = backspace(h);
        else if (e.key === 'Delete' && !mod && !e.altKey && !e.shiftKey) done = forwardDelete(h);
        else if (/^Arrow/.test(e.key) && !mod && !e.altKey && !e.shiftKey) done = arrow(e, h);
        else if (e.key === 'Tab' && !mod && !e.altKey) done = tab(e, h);
        if (done) return stop(e);
        return;
      }
      // Several blocks picked: the keys act on all of them.
      if (picked.length > 1) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          removeBlocks(picked);
          return stop(e);
        }
        if (e.key === 'Escape') {
          picked = [];
          E.redraw();
          return stop(e);
        }
        if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
          copyBlocks(picked);
          if (e.key.toLowerCase() === 'x') removeBlocks(picked);
          return stop(e);
        }
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          moveBy(picked, e.key === 'ArrowUp' ? -1 : 1);
          return stop(e);
        }
      }
    },
    true,
  );
  addEventListener(
    'beforeinput',
    (e) => {
      const h = E.editing();
      if (!h || !(e.target instanceof Node) || !(h === e.target || h.contains(e.target))) return;
      // Typing in a block keeps the list of blocks open while it filters; leaving it closes the list.
      if (slash && slash.h !== h) closeSlash();
    },
    true,
  );
  addEventListener(
    'input',
    (ev) => {
      const e = ev as InputEvent;
      const h = E.editing();
      if (!h || !(e.target instanceof Node) || !(h === e.target || h.contains(e.target))) return;
      hint(h);
      // A heading being written: the table of contents follows it a moment later.
      if (/^H[1-3]$/.test(h.tagName) && doc.querySelector('nav.n-toc')) {
        clearTimeout(tocTimer);
        tocTimer = window.setTimeout(refreshToc, 250);
      }
      if (e.isComposing) return;
      if (slash) return slashInput();
      if (!e.inputType?.startsWith('insertText') || !e.data) return;
      const ch = e.data.slice(-1);
      if (ch === '/') return maybeSlash(h);
      if ((ch === ' ' || ch === '\u00a0' || ch === '`' || ch === '-') && blockMarkdown(h)) return;
      if ('*_`~'.includes(ch)) inlineMarkdown(h);
    },
    true,
  );
  doc.addEventListener('selectionchange', () => {
    if (!slash) return;
    if (slashQuery() === null) closeSlash();
  });
  // The page scrolled: the list of blocks stays by the caret, a block's menu closes (its block moved away). The frame
  // growing (a phone's drawer folding as the menu opens) scrolls a page at its end too: the menu stays, placed again.
  let resized = 0;
  addEventListener('resize', () => {
    resized = Date.now();
    if (menu) renderMenu();
    if (slash) renderSlash();
  });
  addEventListener(
    'scroll',
    () => {
      if (slash) renderSlash();
      if (menu && Date.now() - resized > 400) closeMenu();
    },
    true,
  );
  addEventListener(
    'pointerdown',
    (e) => {
      if (fromUi(e)) return;
      if (menu) closeMenu();
      if (slash) closeSlash();
      // A drag down the margin, from beside the blocks: picks the blocks it passes.
      if (e.button !== 0 || e.pointerType === 'touch' || E.editing()?.contains(e.target as Node)) return;
      const t = e.target as Element;
      const f = flow();
      if (!(t === doc.body || t === doc.documentElement || t === f)) return;
      const y0 = e.clientY;
      let band = false;
      const move = (m: PointerEvent) => {
        if (!band && Math.abs(m.clientY - y0) < 6) return;
        band = true;
        const top = Math.min(y0, m.clientY);
        const bottom = Math.max(y0, m.clientY);
        const fr = f.getBoundingClientRect();
        Object.assign(bandEl.style, { display: 'block', left: `${fr.left}px`, width: `${fr.width}px`, top: `${top}px`, height: `${bottom - top}px` });
        picked = [...f.children].filter((k) => {
          if (skip(k)) return false;
          const r = k.getBoundingClientRect();
          return r.height > 0 && r.bottom >= top && r.top <= bottom;
        });
        drawPicked();
      };
      const up = () => {
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
        removeEventListener('pointercancel', up, true);
        bandEl.style.display = 'none';
        if (!band) return;
        noClick = true;
        setTimeout(() => (noClick = false), 0);
        const list = picked;
        pickMany(list, list[0] ?? null);
      };
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', up, true);
      addEventListener('pointercancel', up, true);
    },
    true,
  );
  let noClick = false;
  addEventListener(
    'click',
    (ev) => {
      const e = ev as MouseEvent;
      if (fromUi(e)) return;
      if (noClick) return stop(e);
      const t = e.target as Element;
      const w = E.editing();
      // A to-do's box ticks, in Edit too: the state is kept in the page.
      const box = t.closest?.('input[type=checkbox]');
      const li = box?.parentElement;
      if (box && li && li.tagName === 'LI' && isTodo(li) && boxOf(li) === box) {
        // The browser ticks it (held back, the click would untick it again): the page keeps what it shows.
        e.stopImmediatePropagation();
        const on = (box as HTMLInputElement).checked;
        const off = w ? (E.offset(w) ?? 0) : 0;
        E.change(() => {
          box.toggleAttribute('checked', on);
          return w ? writeIn(w, { off }) : true;
        });
        return;
      }
      // A toggle's triangle opens and folds it.
      const sum = t.closest?.('summary');
      if (sum && sum.parentElement?.tagName === 'DETAILS' && e.clientX < sum.getBoundingClientRect().left + parseFloat(getComputedStyle(sum).paddingLeft || '0') + 20) {
        stop(e);
        const d = sum.parentElement as HTMLDetailsElement;
        const off = w ? (E.offset(w) ?? 0) : 0;
        E.change(() => {
          d.open = !d.open;
          return w ? writeIn(w, { off }) : true;
        });
        return;
      }
      // The icon, a callout's icon: chosen in the app's picker.
      const ic = t.closest?.('.n-icon, .n-callout-icon');
      if (ic && !e.shiftKey) {
        stop(e);
        E.finish();
        E.select(ic.classList.contains('n-icon') ? ic : ic.parentElement);
        if (ic.classList.contains('n-icon')) ask('icon', ic.getBoundingClientRect(), {}, { has: true });
        else ask('callout-icon', ic.getBoundingClientRect(), { ref: E.pathOf(ic.parentElement!) });
        return;
      }
      // Shift+click: several blocks.
      if (e.shiftKey && !w) {
        const b = blockOf(t);
        const s = E.sel();
        const anchor = s && s !== doc.body ? (blockOf(s) ?? s) : null;
        if (b) {
          stop(e);
          if (anchor && anchor !== b && anchor.parentElement === b.parentElement) {
            const kids = [...b.parentElement!.children].filter((k) => !skip(k));
            const [i, j] = [kids.indexOf(anchor), kids.indexOf(b)].sort((x, y) => x - y);
            pickMany(kids.slice(i, j + 1), b);
          } else {
            const base = picked.length ? picked : anchor ? [anchor] : [];
            pickMany(base.includes(b) ? base.filter((x) => x !== b) : [...base, b], b);
          }
          return;
        }
      }
      // While writing, a click in other words writes there (one click, as in a document).
      if (w && !w.contains(t)) {
        const b = blockOf(t);
        let h: HTMLElement | null = null;
        for (let x: Element | null = t; x && x !== doc.body; x = x.parentElement) {
          if (x.matches(HOSTS) && E.wordy(x) && !(x.tagName === 'LI' && isTodo(x))) {
            h = x as HTMLElement;
            break;
          }
        }
        if (!h && b) h = hostOf(b);
        if (h && h !== w) {
          stop(e);
          E.write(h, { point: { x: e.clientX, y: e.clientY } });
          return;
        }
      }
      // Below the last block: a new paragraph at the end, as in Notion.
      if (!e.shiftKey && (t === doc.body || t === doc.documentElement || t === flow())) {
        const f = flow();
        const last = lastBlock(f);
        const r = last?.getBoundingClientRect();
        // (or anywhere in a page with no blocks left)
        if ((!last || (r && e.clientY > r.bottom)) && e.clientX >= f.getBoundingClientRect().left - 40) {
          stop(e);
          const lh = last ? hostOf(last) : null;
          if (lh && kindOf(last) === 'p' && emptyHost(lh)) return E.write(lh, { off: 0 });
          E.change(() => {
            const { unit, host } = newUnit('p');
            if (last) last.after(unit);
            else f.append(unit);
            return writeIn(host);
          });
          return;
        }
      }
    },
    true,
  );
  addEventListener(
    'pointermove',
    (e) => {
      // Not while a button is held (the handles stay where the press began).
      if (e.pointerType === 'touch' || dragging || e.buttons) return;
      if (fromUi(e)) return;
      const t = e.target as Element;
      let b = t === doc.body || t === doc.documentElement || t === flow() ? blockAtY(flow(), e.clientY) : blockOf(t);
      if (b && E.isUi(b)) b = null;
      if (b !== hoverBlock) {
        hoverBlock = b;
        E.redraw();
      }
    },
    true,
  );
  doc.addEventListener('mouseleave', () => {
    if (!dragging && hoverBlock) {
      hoverBlock = null;
      E.redraw();
    }
  });

  // ---- pictures dropped or pasted in ---------------------------------------------------------------------------------
  const isPicture = (f: File) => /^image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp)$/i.test(f.type);
  const hasFiles = (dt: DataTransfer | null) => !!dt && [...dt.types].includes('Files');
  /** Sends pictures to the app, which makes them small enough to live in the page and sends each back to its place. */
  const sendPictures = (files: File[], where: Record<string, unknown>) => {
    const group = { done: [] as (Element | undefined)[] };
    files.slice(0, 12).forEach((f, i) => {
      const id = `a${++asks}`;
      asked.set(id, { what: 'picture', ...where, group, n: i });
      E.send({ type: 'wa-ed-file', id, file: f });
    });
  };
  addEventListener(
    'dragover',
    (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      drop = dropSpot(e.clientX, e.clientY, []);
      showDrop(drop);
    },
    true,
  );
  addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) showDrop(null);
  });
  addEventListener(
    'drop',
    (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      showDrop(null);
      const files = [...(e.dataTransfer?.files ?? [])].filter(isPicture);
      const d = dropSpot(e.clientX, e.clientY, []);
      drop = null;
      if (!files.length) return;
      sendPictures(files, d ? { ref: E.pathOf(d.ref), before: !d.after && !d.into, into: d.into } : {});
    },
    true,
  );
  addEventListener(
    'paste',
    (e) => {
      const files = [...(e.clipboardData?.files ?? [])].filter(isPicture);
      const w = E.editing();
      if (files.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const s = w ? unitOf(w) : E.sel();
        sendPictures(files, s && s !== doc.body ? { ref: E.pathOf(s) } : {});
        return;
      }
      // Lines of words pasted into a paragraph or a list become blocks of their own.
      if (!w) return;
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
      const k = kindOf(unitOf(w));
      if (!text.includes('\n') || !k || k === 'code') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pasteLines(w, text);
    },
    true,
  );
  const pasteLines = (h: HTMLElement, text: string) => {
    dropSelected(h);
    const lines = text.replace(/\n+$/, '').split(/\n/);
    E.change(() => {
      const u = unitOf(h);
      const k = kindOf(u)!;
      const rest = takeTail(h);
      dropFiller(h);
      let cur = h;
      let curU = u;
      lines.forEach((ln, i) => {
        if (i === 0) {
          putOwn(cur, doc.createTextNode(ln));
          return;
        }
        let kind: Kind = isListKind(k) ? k : 'p';
        let words = ln;
        const m = /^(#{1,3}|[-*+]|\d{1,3}[.)]|\[[ xX]?\]|>)\s+/.exec(ln);
        if (m) {
          const mark = m[1];
          const hit = MD.find(([re]) => re.test(mark));
          if (hit) {
            kind = hit[1] === 'checked' ? 'todo' : hit[1];
            words = ln.slice(m[0].length);
          }
        }
        if (!words.trim() && !isListKind(kind)) return;
        const { unit, host } = newUnit(kind, textFrag(words));
        if (/^\[[xX]\]/.test(ln)) boxOf(unit)?.setAttribute('checked', '');
        putAfter(unit, curU, kind);
        cur = host;
        curU = unit;
      });
      dropFiller(cur);
      const off = E.length(cur);
      putOwn(cur, rest);
      fillEmpty(cur);
      return writeIn(cur, { off });
    });
  };

  // ---- words' look, from the bar over them -------------------------------------------------------------------------
  const colourAround = (n: Node, h: Element, type: 'tc' | 'hl'): HTMLElement | null => {
    const el = (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest(`[class*="n-${type}-"]`) as HTMLElement | null;
    return el && el !== h && h.contains(el) ? el : null;
  };
  const uncolour = (x: Element, type: 'tc' | 'hl') => {
    for (const c of COLOURS) x.classList.remove(`n-${type}-${c}`);
    if (!x.classList.length) x.removeAttribute('class');
    if (!x.attributes.length && /^(SPAN|MARK)$/.test(x.tagName)) x.replaceWith(...x.childNodes);
  };
  /** Colours the words selected (a text colour, or a highlight behind them), or takes that colour off them. */
  const wrapWords = (tag: 'span' | 'mark', cls: string | null, type: 'tc' | 'hl') => {
    const h = E.editing();
    const r0 = caret();
    if (!h || !r0 || r0.collapsed || !h.contains(r0.commonAncestorContainer)) return;
    E.noteTyping();
    const r = r0.cloneRange();
    // Words inside a colour of that kind: it splits around them, and leaves them.
    for (let anc = colourAround(r.commonAncestorContainer, h, type), n = 0; anc && n < 8; anc = colourAround(r.commonAncestorContainer, h, type), n++) {
      const pre = doc.createRange();
      pre.setStart(anc, 0);
      pre.setEnd(r.startContainer, r.startOffset);
      const post = doc.createRange();
      post.setStart(r.endContainer, r.endOffset);
      post.setEnd(anc, anc.childNodes.length);
      const a = anc.cloneNode(false) as Element;
      a.append(pre.extractContents());
      const c = anc.cloneNode(false) as Element;
      c.append(post.extractContents());
      if (a.textContent) anc.before(a);
      if (c.textContent) anc.after(c);
      const kids = [...anc.childNodes];
      uncolour(anc, type);
      if (!kids.length) break;
      r.setStartBefore(kids[0]);
      r.setEndAfter(kids[kids.length - 1]);
    }
    const f = r.extractContents();
    for (const x of [...f.querySelectorAll(`[class*="n-${type}-"]`)]) uncolour(x, type);
    let node: Node = f;
    if (cls) {
      const el = doc.createElement(tag);
      el.className = cls;
      el.append(f);
      node = el;
    }
    const first = node.nodeType === 11 ? node.firstChild : node;
    const last = node.nodeType === 11 ? node.lastChild : node;
    r.insertNode(node);
    if (first && last) {
      // What the cut left empty on either side of the words goes.
      trimEdge(first.previousSibling, true);
      trimEdge(last.nextSibling, false);
      const s = doc.createRange();
      s.setStartBefore(first);
      s.setEndAfter(last);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(s);
    }
  };
  const inlineCode = () => {
    const h = E.editing();
    const r = caret();
    if (!h || !r || !h.contains(r.commonAncestorContainer)) return;
    const inCode = (r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement)?.closest('code');
    E.noteTyping();
    if (inCode && h.contains(inCode) && inCode !== h) {
      inCode.replaceWith(...inCode.childNodes);
      return;
    }
    if (r.collapsed) return;
    const c = make('code');
    c.append(r.extractContents());
    r.insertNode(c);
    trimEdge(c.previousSibling, true);
    trimEdge(c.nextSibling, false);
    const s = doc.createRange();
    s.selectNodeContents(c);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(s);
  };

  return {
    css: `[data-n-ph]::before{content:attr(data-n-ph);float:left;height:0;pointer-events:none;opacity:.4;white-space:nowrap}nav.n-toc:empty::before{content:"${L('tocEmpty', 'The headings of the page show here').replace(/["\\\n<]/g, '')}";opacity:.45}iframe{pointer-events:none}`,
    draw,
    ready() {
      refreshToc();
    },
    act(a: string, arg: any): boolean {
      switch (a) {
        case 'turn': {
          const k = String(arg ?? '') as Kind;
          if (!TURNABLE.has(k)) return true;
          const list = blocksNow();
          if (list.length) turnAll(list, k);
          return true;
        }
        case 'colour': {
          const type = arg?.type === 'hl' ? 'hl' : 'tc';
          const name = typeof arg?.name === 'string' && COLOURS.includes(arg.name) ? arg.name : null;
          const list = blocksNow();
          if (list.length) colourAll(list, type, name);
          return true;
        }
        case 'wordsColour': {
          const type = arg?.type === 'hl' ? 'hl' : 'tc';
          const name = typeof arg?.name === 'string' && COLOURS.includes(arg.name) ? arg.name : null;
          wrapWords(type === 'hl' ? 'mark' : 'span', name ? `n-${type}-${name}` : null, type);
          return true;
        }
        case 'code':
          inlineCode();
          return true;
        case 'menu': {
          const list = blocksNow();
          const r = arg?.at;
          if (list.length && r) openMenu(list, { left: Number(r.left) || 0, top: Number(r.top) || 0, bottom: Number(r.bottom) || 0 }, arg?.view === 'turn' ? 'turn' : 'main');
          return true;
        }
        case 'icon':
          setIcon(typeof arg === 'string' && arg ? arg.slice(0, 16) : null);
          return true;
        case 'cover':
          setCover(arg);
          return true;
        case 'fill':
          fill(arg);
          return true;
        case 'mathEdit': {
          // A formula changed in the Part tab: drawn by the app, put in place of the old one.
          const s = E.sel();
          if (!s?.classList.contains('n-math')) return true;
          const id = `a${++asks}`;
          asked.set(id, { what: 'math', edit: E.pathOf(s) });
          fill({ ...(arg ?? {}), id });
          return true;
        }
        case 'askMath': {
          const s = E.sel();
          if (s?.classList.contains('n-math')) ask('math', s.getBoundingClientRect(), { edit: E.pathOf(s) }, { tex: s.getAttribute('data-tex') ?? '' });
          return true;
        }
        case 'addBlock':
          addBlock(blocksNow()[0] ?? null, false);
          return true;
        case 'many:del':
          removeBlocks(picked);
          return true;
        case 'many:dup':
          duplicate(picked);
          return true;
        case 'many:up':
        case 'many:down':
          moveBy(picked, a === 'many:up' ? -1 : 1);
          return true;
        case 'many:copy':
        case 'many:cut':
          copyBlocks(picked);
          if (a === 'many:cut') removeBlocks(picked);
          return true;
        default:
          return false;
      }
    },
    started(h) {
      if (h.tagName === 'LI') for (const s of subLists(h)) (s.setAttribute('contenteditable', 'false'), s.setAttribute('data-n-ceoff', ''));
      hint(h);
    },
    finished(h) {
      closeSlash();
      dropSpacers(h);
      h.removeAttribute('data-n-ph');
      for (const s of h.querySelectorAll('[data-n-ceoff]')) (s.removeAttribute('contenteditable'), s.removeAttribute('data-n-ceoff'));
      // Code keeps its lines as new-line characters (a browser writes line breaks), so it reads the same anywhere.
      if (kindOf(unitOf(h)) === 'code') {
        const brs = [...h.querySelectorAll('br')];
        brs.forEach((b, i) => (i === brs.length - 1 && b === fillerBr(h) && brs.length > 1 ? b.remove() : b.replaceWith('\n')));
        h.normalize();
      }
      // A block of words keeps a line when it is empty; a lone line break a browser leaves in another part is not the user's.
      if (kindOf(unitOf(h))) fillEmpty(h);
      else if (h.innerHTML === '<br>') h.innerHTML = '';
    },
    selected(el) {
      if (!keepPicked && !(el && picked.includes(el))) picked = [];
    },
    restored() {
      picked = [];
      hoverBlock = null;
      closeMenu();
      closeSlash();
    },
    clean(root) {
      for (const x of root.querySelectorAll('[data-n-ph]')) x.removeAttribute('data-n-ph');
      for (const x of root.querySelectorAll('[data-n-ceoff]')) (x.removeAttribute('contenteditable'), x.removeAttribute('data-n-ceoff'));
      for (const x of root.querySelectorAll('[data-n-sign]')) x.removeAttribute('data-n-sign');
      // Invisible spaces left after a mark Markdown made.
      for (const x of root.querySelectorAll('strong,em,code,s,b,i')) {
        const n = x.nextSibling;
        if (n && n.nodeType === 3 && (n as Text).data.startsWith('\u200b')) (n as Text).data = (n as Text).data.slice(1);
      }
    },
    changed() {
      refreshToc();
    },
    info(el) {
      const u = unitOf(el);
      const k = kindOf(u) ?? kindOf(el);
      return {
        kind: k ?? undefined,
        multi: picked.length > 1 ? picked.length : undefined,
        tex: el.classList.contains('n-math') ? (el.getAttribute('data-tex') ?? '') : undefined,
        colour: colourOf(u, 'tc') ?? undefined,
        fill: colourOf(u, 'hl') ?? undefined,
      };
    },
    page() {
      return { icon: (iconEl()?.textContent ?? '').trim().slice(0, 16), cover: coverInfo() };
    },
    picked: () => picked.filter((x) => x.isConnected),
    unitOf,
  };
}
