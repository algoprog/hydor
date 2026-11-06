// A document's printed pages laid out one by one, for what the browser's own printing cannot do: footnotes at the foot
// of the page their mark is on, and words in columns page by page. Each page becomes a box of the text's size (the
// paper less its margins, which stay the printer's, with the header and footer in them): its blocks in their column(s),
// a paragraph or a list item that does not fit cut between two of its lines (two at least on each page), a table between
// two rows (its header row again on the next page), a heading kept with what follows it; under them, its footnotes. It
// runs in the page itself (the capture browser before it prints a PDF, or the editor's frame before Print), so it is one
// function with nothing from outside it (its source is sent as text). Runs once; the page says when it is done.
//
// The page it lays out: <main class="nd-doc"> with sheets (.nd-sheet: one per page break) of blocks (.nd-b), and the
// footnotes' words in <div class="nd-notes-src" hidden> (<p class="nd-note" data-note="id">); each footnote's mark is
// <span data-k="fn" data-tex="id">.
export function paginateDoc(o: { w: number; h: number; cols: number; gap: number; sep: number }): number {
  const doc = document;
  const root = doc.documentElement;
  if (root.dataset.paged) return Number(root.dataset.paged);
  const main = doc.querySelector('main.nd-doc') as HTMLElement | null;
  if (!main) return 0;
  const src = doc.querySelector('.nd-notes-src') as HTMLElement | null;
  const notes = new Map<string, HTMLElement>();
  for (const n of src ? Array.from(src.querySelectorAll<HTMLElement>('[data-note]')) : []) notes.set(n.dataset.note!, n);
  const placed = new Set<string>();
  const out: HTMLElement[] = [];
  let body: HTMLElement;
  let foot: HTMLElement;
  let page: HTMLElement;
  // The words keep their width while being measured: one column's, or the text's.
  const colW = o.cols > 1 ? (o.w - (o.cols - 1) * o.gap) / o.cols : o.w;
  const newPage = () => {
    page = doc.createElement('div');
    page.className = 'nd-pg';
    page.style.cssText = `position:relative;width:${o.w}px;height:${o.h}px;overflow:hidden;break-after:page;page-break-after:always;display:flex;flex-direction:column`;
    body = doc.createElement('div');
    body.className = 'nd-pg-body';
    body.style.cssText = o.cols > 1 ? `flex:1 1 auto;min-height:0;column-count:${o.cols};column-gap:${o.gap}px;column-fill:auto` : 'flex:1 1 auto;min-height:0';
    foot = doc.createElement('div');
    foot.className = 'nd-pg-notes';
    foot.style.cssText = 'flex:none';
    page.append(body, foot);
    out.push(page);
    main.appendChild(page);
  };
  // What the page's words and notes take: whether they fit on it.
  const fits = () => {
    const notesH = foot.childElementCount ? foot.getBoundingClientRect().height : 0;
    const room = o.h - notesH;
    if (o.cols > 1) {
      body.style.height = `${room}px`;
      // Columns that do not fit go on to the right, past the page's width.
      return body.scrollWidth <= body.clientWidth + 1;
    }
    let bottom = 0;
    const top = body.getBoundingClientRect().top;
    for (const k of Array.from(body.children)) {
      const r = k.getBoundingClientRect();
      const mb = parseFloat(getComputedStyle(k).marginBottom) || 0;
      bottom = Math.max(bottom, r.bottom - top + (k === body.lastElementChild ? 0 : mb));
    }
    return bottom <= room + 0.5;
  };
  /** The footnotes whose marks are in an element and not placed yet, put at the foot of the page; what was put. */
  const addNotes = (el: Element): HTMLElement[] => {
    const added: HTMLElement[] = [];
    for (const m of Array.from(el.querySelectorAll<HTMLElement>('[data-k="fn"]'))) {
      const id = m.dataset.tex ?? '';
      const n = notes.get(id);
      if (!n || placed.has(id) || added.some((a) => a.dataset.note === id)) continue;
      if (!foot.childElementCount) {
        const line = doc.createElement('div');
        line.className = 'nd-pg-sep';
        line.style.cssText = `height:${o.sep}px;padding-top:${o.sep / 2 - 1}px;box-sizing:border-box`;
        line.innerHTML = '<div style="width:33%;border-top:1px solid #c8ccd1"></div>';
        foot.appendChild(line);
      }
      const c = n.cloneNode(true) as HTMLElement;
      foot.appendChild(c);
      added.push(c);
    }
    return added;
  };
  const dropNotes = (list: HTMLElement[]) => {
    for (const c of list) c.remove();
    if (foot.childElementCount === 1) foot.firstElementChild?.remove();
  };
  const keep = (list: HTMLElement[]) => list.forEach((c) => placed.add(c.dataset.note!));
  const heading = (el: Element) => /^H[1-6]$/.test(el.tagName) || el.classList.contains('nd-title') || el.classList.contains('nd-subtitle');
  /** The places where a block's lines start (in its text), top to bottom. */
  const lineStarts = (el: Element): { node: Text; offset: number; top: number }[] => {
    const out2: { node: Text; offset: number; top: number }[] = [];
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const r = doc.createRange();
    let last = -Infinity;
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (n.parentElement?.closest('[data-tex], .katex')) continue;
      for (let i = 0; i < n.data.length; i++) {
        r.setStart(n, i);
        r.setEnd(n, i + 1);
        const rect = Array.from(r.getClientRects()).find((x) => x.height > 0);
        if (!rect) continue;
        if (rect.top > last + rect.height * 0.6) {
          out2.push({ node: n, offset: i, top: rect.top });
          last = rect.top;
        }
      }
    }
    return out2;
  };
  /** A paragraph cut where its line `k` starts: what goes on, a block of its own after it. */
  const cutText = (el: HTMLElement, at: { node: Text; offset: number }): HTMLElement => {
    const r = doc.createRange();
    r.setStart(at.node, at.offset);
    r.setEnd(el, el.childNodes.length);
    const rest = el.cloneNode(false) as HTMLElement;
    rest.appendChild(r.extractContents());
    rest.classList.add('nd-cont');
    rest.removeAttribute('id');
    el.after(rest);
    return rest;
  };
  /** A table cut before its row `k`: the rows from there on in a table of their own after it, its header row again. */
  const cutTable = (el: HTMLElement, k: number): HTMLElement | null => {
    const rows = Array.from(el.querySelectorAll(':scope > tbody > tr'));
    if (k <= 0 || k >= rows.length) return null;
    const rest = el.cloneNode(false) as HTMLElement;
    rest.removeAttribute('id');
    for (const part of Array.from(el.children)) if (part.tagName === 'COLGROUP' || part.tagName === 'THEAD') rest.appendChild(part.cloneNode(true));
    const tb = doc.createElement('tbody');
    for (const row of rows.slice(k)) tb.appendChild(row);
    rest.appendChild(tb);
    el.after(rest);
    return rest;
  };
  /** Cut a block so its first part fits on the page (false: it cannot be). */
  const cut = (el: HTMLElement): HTMLElement | null => {
    if (o.cols > 1) return null;
    const room = () => o.h - (foot.childElementCount ? foot.getBoundingClientRect().height : 0) + body.getBoundingClientRect().top;
    if (el.tagName === 'TABLE') {
      const rows = Array.from(el.querySelectorAll<HTMLElement>(':scope > tbody > tr'));
      const k = rows.findIndex((r) => r.getBoundingClientRect().bottom > room());
      return k > 0 ? cutTable(el, k) : null;
    }
    if (!(el.classList.contains('nd-li') || el.tagName === 'P' || el.tagName === 'BLOCKQUOTE') || heading(el) || el.classList.contains('nd-callout')) return null;
    const lines = lineStarts(el);
    if (lines.length < 2) return null;
    let k = lines.findIndex((l, i) => i > 0 && (lines[i + 1]?.top ?? el.getBoundingClientRect().bottom) > room());
    if (k < 0) return null;
    // Two lines at least on this page, and two going on where it has them.
    if (lines.length - k === 1 && k >= 3) k--;
    if (k < 2 && body.firstElementChild !== el) return null;
    if (k < 1) return null;
    return cutText(el, lines[k]);
  };

  const sheets = Array.from(main.querySelectorAll<HTMLElement>(':scope > .nd-sheet'));
  for (const sheet of sheets) {
    const queue = Array.from(sheet.children).filter((k) => k.classList.contains('nd-b')) as HTMLElement[];
    newPage();
    while (queue.length) {
      const b = queue.shift()!;
      body.appendChild(b);
      const added = addNotes(b);
      if (fits()) {
        keep(added);
        continue;
      }
      dropNotes(added);
      // A part of it on this page, the rest on the next.
      const rest = cut(b);
      if (rest) {
        const more = addNotes(b);
        if (fits()) {
          keep(more);
          queue.unshift(rest);
          newPage();
          continue;
        }
        dropNotes(more);
        // It did not fit with its notes after all: whole again, for the next page.
        if (b.tagName === 'TABLE') {
          const tb = b.querySelector(':scope > tbody');
          for (const r of Array.from(rest.querySelectorAll(':scope > tbody > tr'))) tb?.appendChild(r);
        } else while (rest.firstChild) b.appendChild(rest.firstChild);
        rest.remove();
        b.normalize();
      }
      if (body.childElementCount === 1) {
        // Alone on its page and still too long: it stays (cut off), what follows starts the next page.
        keep(addNotes(b));
        newPage();
        continue;
      }
      // On to the next page, a heading before it going along.
      body.removeChild(b);
      const prev = body.lastElementChild as HTMLElement | null;
      const carry: HTMLElement[] = [];
      if (prev && heading(prev) && body.childElementCount > 1) {
        body.removeChild(prev);
        carry.push(prev);
      }
      newPage();
      queue.unshift(...carry, b);
    }
    sheet.remove();
  }
  // The last page ends the document; an empty one (a page break at the end) stays, as the editor shows it.
  if (out.length) {
    const last = out[out.length - 1];
    last.style.breakAfter = 'auto';
    last.style.pageBreakAfter = 'auto';
  }
  src?.remove();
  root.dataset.paged = String(out.length);
  return out.length;
}
