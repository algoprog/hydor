// The page editor's newer blocks, as Notion has them (part of the editor: writing.ts hands it what it needs), each from
// "/" or Add: an Embed (a map, a Google Doc or Sheet, Figma, Spotify, CodePen, Loom… or any page that may be framed), a
// Bookmark (a link as a card with its title, description and picture, which the app's server reads), a File to
// download, a Sound (from this device or the Library), a PDF shown in the page, a Diagram written in Mermaid (drawn by
// the app as it is typed, light and dark), a Chart (from a database of the page, or a small table of its own), Breadcrumbs
// (where the page is in the Library) and Tabs (blocks in panels, a tab at a time). What each needs is chosen in the app
// beside where it was asked, and comes back to its place; its block's menu (⋮⋮) changes it again.
//
// Like the writing, the function runs in the browser: its source is sent as text, so it uses only its argument and the
// browser's own globals.
import type { Extra, ExtraCore } from './writing.ts';

export function writingBlocks(X: ExtraCore): Extra {
  const E = X.E;
  const L = E.L;
  const doc = document;
  const https = (v: unknown, n = 2000): string => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s.length <= n && /^https:\/\/[^\s"'<>\\]+$/i.test(s) ? s : '';
  };
  /** A file the app keeps for pages (its own permission), or a page's own picture (a data: address). */
  const fileSrc = (v: unknown): string => {
    const s = typeof v === 'string' ? v.trim() : '';
    return /^\/pg\/file\/[a-f0-9]{64}\/[\w-]{8,64}\/[^\s"'<>\\]{1,300}$/.test(s) ? s : '';
  };
  const words = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n) : '');
  const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`);
  const BLOCKS = '.n-embed,.n-bookmark,.n-file,.n-audio,.n-pdf,.n-mermaid,.n-chart,.n-crumbs,.n-tabs';
  const blockOf = (el: Element | null) => (el?.closest(BLOCKS) as HTMLElement | null) ?? null;

  // ---- an SVG of the app's drawing, kept safe: no script, no handler, no address that runs ----------------------------------
  const cleanSvg = (html: unknown): string => {
    const t = doc.createElement('template');
    t.innerHTML = typeof html === 'string' && html.length < 2_000_000 ? html : '';
    const svg = t.content.querySelector('svg');
    if (!svg) return '';
    for (const x of svg.querySelectorAll('script,foreignObject,iframe,object,embed,a')) x.remove();
    for (const x of [svg, ...svg.querySelectorAll('*')])
      for (const a of [...x.attributes]) if (/^on/i.test(a.name) || /javascript:|data:text/i.test(a.value) || (/href$/i.test(a.name) && !/^#/.test(a.value))) x.removeAttribute(a.name);
    return svg.outerHTML;
  };

  // ---- breadcrumbs: where the page is in the Library, as the app says ------------------------------------------------------
  let crumbs: { name: string; go?: string }[] = [];
  const fillCrumbs = () => {
    for (const nav of doc.body.querySelectorAll('nav.n-crumbs')) {
      const sign = JSON.stringify(crumbs);
      if (!crumbs.length || nav.getAttribute('data-n-sign') === sign) continue;
      nav.textContent = '';
      crumbs.forEach((c, i) => {
        if (i) nav.append(Object.assign(doc.createElement('span'), { className: 'n-crumb-sep', textContent: '›' }));
        if (c.go && i < crumbs.length - 1) {
          const a = doc.createElement('a');
          a.setAttribute('href', c.go);
          a.setAttribute('data-go', '');
          a.textContent = c.name;
          nav.append(a);
        } else {
          const s = doc.createElement('span');
          if (i === crumbs.length - 1) s.setAttribute('aria-current', 'page');
          s.textContent = c.name;
          nav.append(s);
        }
      });
      nav.setAttribute('data-n-sign', sign);
    }
  };

  // ---- tabs ---------------------------------------------------------------------------------------------------------------
  const tabsOf = (el: Element | null) => (el?.closest('.n-tabs') as HTMLElement | null) ?? null;
  const showTab = (tabs: Element, i: number) => {
    const bar = tabs.querySelector(':scope > .n-tabbar');
    const btns = bar ? [...bar.children] : [];
    const panels = [...tabs.children].filter((c) => c.classList.contains('n-tabpanel'));
    btns.forEach((b, k) => b.classList.toggle('n-on', k === i));
    panels.forEach((p, k) => p.classList.toggle('n-on', k === i));
  };
  const newTab = (n: number) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'n-tab';
    b.textContent = `${L('blk.tab', 'Tab')} ${n}`;
    const p = doc.createElement('div');
    p.className = 'n-tabpanel';
    p.append(X.newUnit('p').unit);
    return [b, p] as const;
  };
  const tabsBlock = () => {
    const el = doc.createElement('div');
    el.className = 'n-tabs';
    const bar = doc.createElement('div');
    bar.className = 'n-tabbar';
    bar.setAttribute('role', 'tablist');
    el.append(bar);
    for (let i = 1; i <= 2; i++) {
      const [b, p] = newTab(i);
      bar.append(b);
      el.append(p);
    }
    showTab(el, 0);
    return el;
  };

  // ---- what the app answers: the block made, in its place, or the one changed ------------------------------------------------
  const made = (el: HTMLElement, where: Record<string, unknown>) => {
    const old = where.edit ? E.byPath(where.edit) : null;
    E.change(() => {
      if (old && old.isConnected && blockOf(old) === old) old.replaceWith(el);
      else X.placeBlock(el, where);
      return { pick: el };
    });
  };
  const build: Record<string, (a: any) => HTMLElement | null> = {
    embed: (a) => {
      const src = https(a.src);
      const url = https(a.url) || src;
      if (!src) return null;
      // A YouTube or Vimeo video: its still, which the app plays over the page (its player can't run in the page).
      if (a.kind === 'video' && /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)[\w-]+/.test(src)) {
        const v = doc.createElement('a');
        v.className = 'n-video';
        v.href = url;
        v.target = '_blank';
        v.rel = 'noopener';
        v.setAttribute('data-video', src);
        if (https(a.thumb)) {
          const img = doc.createElement('img');
          img.src = https(a.thumb);
          img.alt = words(a.title, 200);
          v.append(img);
        }
        return v;
      }
      const el = doc.createElement('div');
      el.className = 'n-embed';
      el.setAttribute('data-src', url);
      const kind = /^[a-z]{2,20}$/.test(String(a.kind ?? '')) ? String(a.kind) : 'page';
      el.setAttribute('data-kind', kind);
      const f = doc.createElement('iframe');
      f.setAttribute('src', src);
      f.setAttribute('title', words(a.title, 200) || url);
      f.setAttribute('loading', 'lazy');
      f.setAttribute('allowfullscreen', '');
      f.setAttribute('allow', 'fullscreen; clipboard-write; encrypted-media; picture-in-picture');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      const link = doc.createElement('a');
      link.className = 'n-embed-link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = `${words(a.provider, 40) || new URL(url).hostname} · ${L('blk.openTab', 'Open in a new tab')}`;
      el.append(f, link);
      return el;
    },
    bookmark: (a) => {
      const url = https(a.url) || (typeof a.url === 'string' && /^http:\/\/[^\s"'<>\\]+$/i.test(a.url) ? a.url : '');
      if (!url) return null;
      const el = doc.createElement('a');
      el.className = 'n-bookmark';
      el.href = url;
      el.target = '_blank';
      el.rel = 'noopener';
      const text = doc.createElement('span');
      text.className = 'n-bm-text';
      const title = doc.createElement('span');
      title.className = 'n-bm-title';
      title.textContent = words(a.title, 200) || url;
      text.append(title);
      if (words(a.description, 400)) {
        const d = doc.createElement('span');
        d.className = 'n-bm-desc';
        d.textContent = words(a.description, 400);
        text.append(d);
      }
      const u = doc.createElement('span');
      u.className = 'n-bm-url';
      if (https(a.icon)) {
        const i = doc.createElement('img');
        i.className = 'n-bm-icon';
        i.src = https(a.icon);
        i.alt = '';
        u.append(i);
      }
      u.append(url.replace(/^https?:\/\//, '').slice(0, 120));
      text.append(u);
      el.append(text);
      if (https(a.image)) {
        const p = doc.createElement('img');
        p.className = 'n-bm-pic';
        p.src = https(a.image);
        p.alt = '';
        p.loading = 'lazy';
        el.append(p);
      }
      return el;
    },
    file: (a) => {
      const src = fileSrc(a.src);
      if (!src) return null;
      const el = doc.createElement('a');
      el.className = 'n-file';
      el.href = src;
      el.target = '_blank';
      el.rel = 'noopener';
      const n = doc.createElement('span');
      n.className = 'n-file-name';
      n.textContent = words(a.name, 120) || 'file';
      el.append(n);
      if (typeof a.size === 'number' && a.size > 0) {
        const s = doc.createElement('span');
        s.className = 'n-file-size';
        s.textContent = size(a.size);
        el.append(s);
      }
      return el;
    },
    audio: (a) => {
      const src = fileSrc(a.src);
      if (!src) return null;
      const el = doc.createElement('div');
      el.className = 'n-audio';
      const au = doc.createElement('audio');
      au.setAttribute('controls', '');
      au.setAttribute('preload', 'metadata');
      au.setAttribute('src', src);
      const n = doc.createElement('span');
      n.className = 'n-audio-name';
      n.textContent = words(a.name, 120);
      el.append(au, n);
      return el;
    },
    pdf: (a) => {
      const src = fileSrc(a.src);
      if (!src) return null;
      const el = doc.createElement('div');
      el.className = 'n-pdf';
      el.setAttribute('data-src', src);
      el.setAttribute('data-name', words(a.name, 120) || 'document.pdf');
      return el;
    },
    mermaid: (a) => {
      const code = typeof a.code === 'string' ? a.code.slice(0, 20_000) : '';
      const light = cleanSvg(a.light);
      const dark = cleanSvg(a.dark);
      if (!code.trim() || !light) return null;
      const el = doc.createElement('div');
      el.className = 'n-mermaid';
      el.setAttribute('data-code', code);
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', words(a.label, 300) || L('blk.diagram', 'Diagram'));
      const l = doc.createElement('div');
      l.className = 'n-mm-light';
      l.innerHTML = light;
      el.append(l);
      if (dark) {
        const d = doc.createElement('div');
        d.className = 'n-mm-dark';
        d.innerHTML = dark;
        el.append(d);
      }
      return el;
    },
    chart: (a) => {
      const cfg = a.chart && typeof a.chart === 'object' ? a.chart : null;
      if (!cfg) return null;
      const json = JSON.stringify(cfg);
      if (json.length > 20_000) return null;
      const el = doc.createElement('div');
      el.className = 'n-chart';
      el.setAttribute('data-chart', json);
      return el;
    },
  };
  /** The page's databases, for a chart: their names, titles and columns. */
  const dbList = () =>
    [...doc.body.querySelectorAll('.n-db')].map((el) => {
      const s = E.db.stateOf(el) ?? E.db.normalize((() => {
        try {
          return JSON.parse(el.getAttribute('data-schema') || '{}');
        } catch {
          return {};
        }
      })());
      return { name: el.getAttribute('data-db') ?? '', title: s.title, cols: s.cols.map((c) => ({ name: c.name, kind: c.kind })) };
    });
  /** Asks the app for a block of this kind (or for a change of one: `el`), put where `where` says. */
  const askFor = (id: string, rect: DOMRect | null, where: Record<string, unknown>, el?: Element | null) => {
    const extra: Record<string, unknown> = {};
    if (el) {
      where.edit = E.pathOf(el);
      if (id === 'embed') extra.value = el.getAttribute('data-src') ?? '';
      if (id === 'bookmark') extra.value = (el as HTMLAnchorElement).getAttribute('href') ?? '';
      if (id === 'mermaid') extra.value = el.getAttribute('data-code') ?? '';
      if (id === 'chart') extra.value = el.getAttribute('data-chart') ?? '';
    }
    if (id === 'chart') extra.dbs = dbList();
    X.ask(id, rect, where, extra);
  };
  const ASKED = new Set(['embed', 'bookmark', 'file', 'audio', 'pdf', 'mermaid', 'chart']);
  /** Puts in a block made here (tabs, breadcrumbs), or asks the app for one, in block `u` (in its place when it is empty). */
  const insert = (id: string, u: Element | null, replace: boolean, rect: DOMRect | null) => {
    if (ASKED.has(id)) return askFor(id, rect, u ? { ref: E.pathOf(u), replace } : {});
    const el = id === 'tabs' ? tabsBlock() : id === 'crumbs' ? Object.assign(doc.createElement('nav'), { className: 'n-crumbs' }) : null;
    if (!el) return;
    if (id === 'crumbs') el.setAttribute('aria-label', L('blk.crumbs', 'Breadcrumbs'));
    E.change(() => {
      X.placeBlock(el, u ? { ref: E.pathOf(u), replace } : {});
      if (id === 'crumbs') fillCrumbs();
      const h = id === 'tabs' ? X.firstHostIn(el.querySelector('.n-tabpanel')) : null;
      return h ? X.writeIn(h) : { pick: el };
    });
  };

  return {
    icons: {
      embed: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9-3 3 3 3"/><path d="m14 9 3 3-3 3"/>',
      bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
      file: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
      audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6"/>',
      mermaid: '<rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="16" width="7" height="5" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><path d="M6.5 8v4.5h11V16"/><path d="M17.5 8v4.5"/>',
      chart: '<path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V7"/><path d="M17 16v-8"/>',
      crumbs: '<path d="M3 12h4"/><path d="m9 8 4 4-4 4"/><path d="M15 12h6"/>',
      tabs: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 8V6a2 2 0 0 1 2-2h5v4"/><path d="M10 4h4v4"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    },
    items: [
      { id: 'embed', key: 'blk.embed', en: 'Embed', also: 'embed iframe map maps google docs sheets figma spotify codepen loom miro website page frame', icon: 'embed' },
      { id: 'bookmark', key: 'blk.bookmark', en: 'Bookmark', also: 'bookmark link card preview url web', icon: 'bookmark' },
      { id: 'file', key: 'blk.file', en: 'File', also: 'file attachment upload download document', icon: 'file' },
      { id: 'audio', key: 'blk.audio', en: 'Sound', also: 'audio sound music podcast recording mp3 voice', icon: 'audio' },
      { id: 'pdf', key: 'blk.pdf', en: 'PDF', also: 'pdf document paper', icon: 'pdf' },
      { id: 'mermaid', key: 'blk.mermaid', en: 'Diagram (Mermaid)', also: 'mermaid diagram flowchart sequence gantt chart graph', icon: 'mermaid' },
      { id: 'chart', key: 'blk.chart', en: 'Chart', also: 'chart graph bar line pie plot numbers database', icon: 'chart' },
      { id: 'crumbs', key: 'blk.crumbs', en: 'Breadcrumbs', also: 'breadcrumbs path where navigation', icon: 'crumbs' },
      { id: 'tabs', key: 'blk.tabs', en: 'Tabs', also: 'tabs tabbed panels sections', icon: 'tabs' },
    ],
    blocks: BLOCKS,
    pick(id, at) {
      if (!['embed', 'bookmark', 'file', 'audio', 'pdf', 'mermaid', 'chart', 'crumbs', 'tabs'].includes(id)) return false;
      E.noteTyping();
      at.drop();
      const rect = X.caretBox() ?? at.h.getBoundingClientRect();
      const empty = X.emptyHost(at.h);
      E.finish();
      insert(id, at.u, empty, rect);
      return true;
    },
    menu(blocks) {
      const el = blocks.length === 1 ? blockOf(blocks[0]) : null;
      if (!el || el !== blocks[0]) return [];
      const r = el.getBoundingClientRect();
      const kind = BLOCKS.split(',').find((s) => el.matches(s))?.slice(3) ?? '';
      const again = (label: string) => [{ icon: X.svg('edit'), label, run: () => askFor(kind, r, {}, el) }];
      if (kind === 'embed') return again(L('blk.changeAddress', 'Change the address'));
      if (kind === 'bookmark') return again(L('blk.changeAddress', 'Change the address'));
      if (kind === 'mermaid') return again(L('blk.editDiagram', 'Edit the diagram'));
      if (kind === 'chart') return again(L('blk.chartSettings', 'Chart settings'));
      if (kind === 'file' || kind === 'audio' || kind === 'pdf') return again(L('blk.replaceFile', 'Another file'));
      if (kind === 'tabs')
        return [
          {
            icon: X.svg('plus'),
            label: L('blk.addTab', 'Add a tab'),
            run: () =>
              E.change(() => {
                const bar = el.querySelector(':scope > .n-tabbar');
                if (!bar) return null;
                const [b, p] = newTab(bar.children.length + 1);
                bar.append(b);
                el.append(p);
                showTab(el, bar.children.length - 1);
                return X.writeIn(b, { all: true });
              }),
          },
          {
            icon: X.svg('del'),
            label: L('blk.removeTab', 'Remove the tab shown'),
            run: () =>
              E.change(() => {
                const bar = el.querySelector(':scope > .n-tabbar');
                const btns = bar ? [...bar.children] : [];
                const panels = [...el.children].filter((c) => c.classList.contains('n-tabpanel'));
                if (btns.length < 2) return null;
                const i = Math.max(0, btns.findIndex((b) => b.classList.contains('n-on')));
                btns[i]?.remove();
                panels[i]?.remove();
                showTab(el, Math.max(0, i - 1));
                return { pick: el };
              }),
          },
        ];
      return [];
    },
    click(e) {
      // A tab picked shows its panel (in Edit too); a click on the tab shown writes in it, as on any words.
      const t = (e.target as Element).closest?.('.n-tabs > .n-tabbar > .n-tab');
      if (!t || E.editing()?.contains(t)) return false;
      const tabs = tabsOf(t)!;
      const bar = t.parentElement!;
      const i = [...bar.children].indexOf(t);
      if (t.classList.contains('n-on')) return false;
      X.stop(e);
      showTab(tabs, i);
      E.select(tabs.querySelectorAll(':scope > .n-tabpanel')[i] ?? tabs);
      E.redraw();
      return true;
    },
    fill(what, a, where) {
      if (!build[what]) return false;
      const el = build[what](a ?? {});
      if (el) made(el, where);
      return true;
    },
    act(a, arg) {
      if (a === 'crumbs') {
        crumbs = (Array.isArray(arg) ? arg : [])
          .slice(0, 12)
          .map((c: { name?: unknown; go?: unknown }) => ({ name: words(c?.name, 120), go: typeof c?.go === 'string' && /^\/(library|projects)(\/[\w-]{1,40})?(\?[\w=&%-]{0,200})?$/.test(c.go) ? c.go : undefined }))
          .filter((c) => c.name);
        fillCrumbs();
        return true;
      }
      if (a === 'askBlock') {
        // A block from Add: after the part picked (or inside it, or at the end of the page).
        const id = String(arg?.id ?? '');
        const s = E.sel();
        const u = s && s !== doc.body ? X.unitOf(s) : null;
        const where = arg?.where === 'end' || !u ? {} : arg?.where === 'inside' ? { ref: E.pathOf(u), into: true } : { ref: E.pathOf(u) };
        if (ASKED.has(id)) askFor(id, u?.getBoundingClientRect() ?? null, where);
        else if (id === 'tabs' || id === 'crumbs') insert(id, where.ref ? u : null, false, null);
        return true;
      }
      return false;
    },
    ready() {
      fillCrumbs();
      for (const el of doc.body.querySelectorAll('.n-pdf')) E.db.mount(el, { store: null, edit: true });
    },
    changed() {
      fillCrumbs();
      for (const el of doc.body.querySelectorAll('.n-pdf')) E.db.mount(el, { store: null, edit: true });
    },
    restored() {
      for (const el of doc.body.querySelectorAll('.n-pdf')) E.db.mount(el, { store: null, edit: true });
    },
    clean(root) {
      for (const x of root.querySelectorAll('nav.n-crumbs[data-n-sign]')) x.removeAttribute('data-n-sign');
    },
    info(el) {
      const b = blockOf(el);
      if (!b) return undefined;
      return { block: BLOCKS.split(',').find((s) => b.matches(s))?.slice(3) };
    },
  };
}
