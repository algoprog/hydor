// What the page editor (editor.ts) works out that needs no page to be worked out, kept apart so that it can be tested
// without a browser: where a part snaps while it is moved or sized (its edges and middle to those of the parts around
// it, to the box it is in and to the page, and to the same gaps and the same sizes the others have), the address a
// link may have (what a person types, "example.com", becomes one that goes somewhere; addresses that run code are
// refused), and the paste cleaner (what the clipboard holds as HTML, down to bold, italic, underline, strike, code,
// links, headings and lists, and nothing a page could be harmed by).
//
// Like the editor, the function runs in the browser: its source is sent as text, so it uses only its argument and the
// browser's own globals. Every measure is in the frame's own pixels, where the parts are drawn.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A line to draw (a guide), and a distance or a size to write on a small pill. */
export interface Lines {
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  /** A gap between two parts, drawn as a line with its size on it ("12"), `vertical` for one between a part above and below. */
  gaps: { x: number; y: number; w: number; h: number; label: string; vertical: boolean }[];
}

/** A piece of pasted words: its kind (as the editor's blocks are named, '' for plain text) and its words as safe HTML. */
export interface PastePiece {
  kind: '' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'quote' | 'code';
  html: string;
}

export function geometry() {
  type B = { x: number; y: number; w: number; h: number };
  type Out = { lines: { x1: number; y1: number; x2: number; y2: number }[]; gaps: { x: number; y: number; w: number; h: number; label: string; vertical: boolean }[] };
  type Cand = { v: number; from: number; to: number };

  /** The lines a part can snap to: its edges and its middle, each with how far along it reaches. */
  const xLines = (b: B): Cand[] => [b.x, b.x + b.w / 2, b.x + b.w].map((v) => ({ v, from: b.y, to: b.y + b.h }));
  const yLines = (b: B): Cand[] => [b.y, b.y + b.h / 2, b.y + b.h].map((v) => ({ v, from: b.x, to: b.x + b.w }));

  /**
   * The nearest of `mine` (the places on the moving part) to a line of `cands`, within `tol`: how far to shift to land on
   * it, and every line it lands on then, drawn from the one part to the other.
   */
  const best = (m: B, mine: number[], cands: Cand[], tol: number, vertical: boolean): { d: number; lines: Out['lines'] } | null => {
    let found: { d: number; lines: Out['lines'] } | null = null;
    for (const c of cands)
      for (const p of mine) {
        const d = c.v - p;
        if (Math.abs(d) <= tol && (!found || Math.abs(d) < Math.abs(found.d) - 0.01)) found = { d, lines: [] };
      }
    if (!found) return null;
    const f = found;
    for (const c of cands)
      for (const p of mine)
        if (Math.abs(c.v - (p + f.d)) < 0.5) {
          const lo = Math.min(c.from, vertical ? m.y : m.x);
          const hi = Math.max(c.to, vertical ? m.y + m.h : m.x + m.w);
          f.lines.push(vertical ? { x1: c.v, y1: lo, x2: c.v, y2: hi } : { x1: lo, y1: c.v, x2: hi, y2: c.v });
        }
    return f;
  };

  /**
   * The nearest part on each side of `m` that overlaps it along the other axis, and the box it is in (`inner`, if any) as
   * walls: the distances between them, as lines with their sizes. At most a few; none longer than `far`.
   */
  const distances = (m: B, others: B[], inner: B | null, far = 600): Out['gaps'] => {
    const out: Out['gaps'] = [];
    const overlapY = (o: B) => o.y < m.y + m.h && o.y + o.h > m.y;
    const overlapX = (o: B) => o.x < m.x + m.w && o.x + o.w > m.x;
    const midY = (o: B) => (Math.max(o.y, m.y) + Math.min(o.y + o.h, m.y + m.h)) / 2;
    const midX = (o: B) => (Math.max(o.x, m.x) + Math.min(o.x + o.w, m.x + m.w)) / 2;
    const push = (x: number, y: number, w: number, h: number, vertical: boolean) => {
      const len = vertical ? h : w;
      if (len >= 1 && len <= far) out.push({ x, y, w, h, label: `${Math.round(len)}`, vertical });
    };
    const left = others.filter((o) => overlapY(o) && o.x + o.w <= m.x + 0.5).sort((a, b) => b.x + b.w - (a.x + a.w))[0];
    const right = others.filter((o) => overlapY(o) && o.x >= m.x + m.w - 0.5).sort((a, b) => a.x - b.x)[0];
    const above = others.filter((o) => overlapX(o) && o.y + o.h <= m.y + 0.5).sort((a, b) => b.y + b.h - (a.y + a.h))[0];
    const below = others.filter((o) => overlapX(o) && o.y >= m.y + m.h - 0.5).sort((a, b) => a.y - b.y)[0];
    if (left) push(left.x + left.w, midY(left), m.x - (left.x + left.w), 0, false);
    else if (inner) push(inner.x, m.y + m.h / 2, m.x - inner.x, 0, false);
    if (right) push(m.x + m.w, midY(right), right.x - (m.x + m.w), 0, false);
    else if (inner) push(m.x + m.w, m.y + m.h / 2, inner.x + inner.w - (m.x + m.w), 0, false);
    if (above) push(midX(above), above.y + above.h, 0, m.y - (above.y + above.h), true);
    else if (inner) push(m.x + m.w / 2, inner.y, 0, m.y - inner.y, true);
    if (below) push(midX(below), m.y + m.h, 0, below.y - (m.y + m.h), true);
    else if (inner) push(m.x + m.w / 2, m.y + m.h, 0, inner.y + inner.h - (m.y + m.h), true);
    return out;
  };

  /**
   * Where a part moving to `m` snaps: its edges and middle to those of the parts around it (`others`) and of the boxes
   * it is in or on (`frames`: its container, the page), within `tol`; and, in a row or a column of others, to the same
   * gap they have between them. The shift to apply, what to draw, and the distances to its neighbours (drawn too).
   * `snap` false: nothing moves, only the distances show.
   */
  const snapMove = (m: B, others: B[], frames: B[], tol: number, snap = true): { dx: number; dy: number } & Out => {
    let dx = 0;
    let dy = 0;
    let lines: Out['lines'] = [];
    const gaps: Out['gaps'] = [];
    if (snap) {
      const xs = [...frames, ...others].flatMap(xLines);
      const ys = [...frames, ...others].flatMap(yLines);
      const sx = best(m, [m.x, m.x + m.w / 2, m.x + m.w], xs, tol, true);
      const sy = best(m, [m.y, m.y + m.h / 2, m.y + m.h], ys, tol, false);
      dx = sx?.d ?? 0;
      dy = sy?.d ?? 0;
      lines = [...(sx?.lines ?? []), ...(sy?.lines ?? [])];
      // The same gap as the others have: a part between two, or beside two that are already spaced evenly.
      const even = (horizontal: boolean) => {
        const a0 = horizontal ? m.x + dx : m.y + dy;
        const size = horizontal ? m.w : m.h;
        const row = others.filter((o) => (horizontal ? o.y < m.y + dy + m.h && o.y + o.h > m.y + dy : o.x < m.x + dx + m.w && o.x + o.w > m.x + dx));
        const start = (o: B) => (horizontal ? o.x : o.y);
        const len = (o: B) => (horizontal ? o.w : o.h);
        const before = row.filter((o) => start(o) + len(o) <= a0 + tol).sort((p, q) => start(q) + len(q) - (start(p) + len(p)));
        const after = row.filter((o) => start(o) >= a0 + size - tol).sort((p, q) => start(p) - start(q));
        const cands: { pos: number; marks: [number, number][] }[] = [];
        const L1 = before[0];
        const R1 = after[0];
        if (L1 && R1) {
          const g = (start(R1) - (start(L1) + len(L1)) - size) / 2;
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
      if (!sx) even(true);
      if (!sy) even(false);
    }
    // Where it ends up: how far it is from the parts and the box around it. (Those between equal gaps are drawn already.)
    const at = { x: m.x + dx, y: m.y + dy, w: m.w, h: m.h };
    const dist = gaps.length ? [] : distances(at, others, frames[0] ?? null);
    return { dx, dy, lines, gaps: [...gaps, ...dist] };
  };

  /**
   * Where a part being sized snaps: the edges that move (`edges`) to the edges and middles of the others and of the boxes
   * around, and its width or height to one of theirs. `m` is the box the pointer asks for; the box to use, and what to
   * draw. `axes` limits it to one direction (a corner dragged in proportion snaps along one and scales the other).
   */
  const snapSize = (m: B, edges: { l?: boolean; r?: boolean; t?: boolean; b?: boolean }, others: B[], frames: B[], tol: number, axes: 'x' | 'y' | 'xy' = 'xy'): { box: B } & Out => {
    const box = { ...m };
    const lines: Out['lines'] = [];
    const xs = [...frames, ...others].flatMap(xLines);
    const ys = [...frames, ...others].flatMap(yLines);
    const edge = (mine: number, cands: Cand[], vertical: boolean) => {
      const f = best(m, [mine], cands, tol, vertical);
      return f ? { d: f.d, lines: f.lines } : null;
    };
    if (axes !== 'y') {
      if (edges.r) {
        const s = edge(m.x + m.w, xs, true);
        if (s) (box.w += s.d), lines.push(...s.lines);
      } else if (edges.l) {
        const s = edge(m.x, xs, true);
        if (s) (box.x += s.d), (box.w -= s.d), lines.push(...s.lines);
      }
    }
    if (axes !== 'x') {
      if (edges.b) {
        const s = edge(m.y + m.h, ys, false);
        if (s) (box.h += s.d), lines.push(...s.lines);
      } else if (edges.t) {
        const s = edge(m.y, ys, false);
        if (s) (box.y += s.d), (box.h -= s.d), lines.push(...s.lines);
      }
    }
    // The same width or height as another part has (where no edge caught): a line along each of the two.
    const sameSize = (width: boolean) => {
      const moving = width ? edges.l || edges.r : edges.t || edges.b;
      if (!moving || (width ? axes === 'y' : axes === 'x')) return;
      const cur = width ? box.w : box.h;
      const hit = others.filter((o) => Math.abs((width ? o.w : o.h) - cur) <= tol && Math.abs((width ? o.w : o.h) - cur) > 0.01 && (width ? o.w : o.h) > 1).sort((p, q) => Math.abs((width ? p.w : p.h) - cur) - Math.abs((width ? q.w : q.h) - cur))[0];
      if (!hit) return;
      const to = width ? hit.w : hit.h;
      if (width) {
        if (edges.l && !edges.r) box.x -= to - box.w;
        box.w = to;
      } else {
        if (edges.t && !edges.b) box.y -= to - box.h;
        box.h = to;
      }
    };
    const widthSnapped = lines.some((l) => Math.abs(l.x1 - l.x2) < 0.5);
    const heightSnapped = lines.some((l) => Math.abs(l.y1 - l.y2) < 0.5);
    if (!widthSnapped) sameSize(true);
    if (!heightSnapped) sameSize(false);
    // The parts it now matches in size get a line along the side that was sized, and its own.
    for (const o of others) {
      if (!widthSnapped && (edges.l || edges.r) && axes !== 'y' && Math.abs(o.w - box.w) < 0.5) {
        const y = edges.t ? box.y : edges.b ? box.y + box.h : box.y + box.h;
        lines.push({ x1: Math.min(o.x, box.x), y1: o.y + o.h, x2: Math.max(o.x + o.w, box.x + box.w), y2: o.y + o.h }, { x1: box.x, y1: y, x2: box.x + box.w, y2: y });
      }
      if (!heightSnapped && (edges.t || edges.b) && axes !== 'x' && Math.abs(o.h - box.h) < 0.5) {
        const x = edges.l ? box.x : box.x + box.w;
        lines.push({ x1: o.x + o.w, y1: Math.min(o.y, box.y), x2: o.x + o.w, y2: Math.max(o.y + o.h, box.y + box.h) }, { x1: x, y1: box.y, x2: x, y2: box.y + box.h });
      }
    }
    return { box, lines, gaps: [] };
  };

  // ---- the address a link may have ---------------------------------------------------------------------------------
  /** Where a link may go. Anything else with a scheme (javascript:, vbscript:, data:, file:, blob:…) runs code or reads files. */
  const SCHEMES = /^(https?|mailto|tel|sms|ftp):/i;
  /** Extensions of files a person means by a name with a dot ("page.html", "notes.pdf"): a link to a file beside the page, not a site. */
  const FILES = /\.(html?|php|aspx?|pdf|png|jpe?g|gif|svg|webp|css|js|mjs|json|txt|md|csv|zip|xml|docx?|xlsx?|pptx?)$/i;
  /**
   * What a link typed in the link bar goes to: an address with a scheme as it is (web, mail, phone, text, ftp), "example.com"
   * and "www.example.com/x" as https://…, an email address as mailto:, a phone number as tel:, and an address inside the
   * page ("#top", "/about", "./page.html", "page.html") as it is. null when it should not be a link: nothing typed, or an
   * address that runs code (javascript:, vbscript:) or shows a file (data:, file:, blob:).
   */
  const linkAddress = (raw: unknown): string | null => {
    // (spaces and control characters inside an address are tricks, "java\tscript:", not part of one)
    const s = String(raw ?? '')
      .replace(/[\u0000-\u001f\u007f\u0080-\u009f\u200b-\u200f\u2028\u2029\ufeff]+/g, '')
      .trim();
    if (!s || s.length > 4000) return null;
    const compact = s.replace(/\s+/g, '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(compact) && !/^[^\s/:@]+:\d{1,5}(?:[/?#]|$)/.test(compact)) return SCHEMES.test(compact) ? compact : null;
    if (/^(#|\/(?!\/)|\.{1,2}\/|\?)/.test(s)) return s;
    if (s.startsWith('//')) return `https:${s}`;
    if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]{2,}$/.test(s)) return `mailto:${s}`;
    if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#]|$)/.test(s)) return `https://${s}`;
    if (/^\+?[\d\s().-]{6,}$/.test(s) && s.replace(/\D/g, '').length >= 6) return `tel:${s.replace(/[^\d+]/g, '')}`;
    // A site: a name with dots (and then a path), localhost, or an address with a port.
    if (/\s/.test(s)) return s;
    if (/^(www\.|localhost(?::\d+)?(?:[/?#]|$)|\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#]|$)|[^\s/:]+:\d{1,5}(?:[/?#]|$))/i.test(s)) return `https://${s}`;
    const host = s.split(/[/?#]/)[0];
    if (/^[^\s/]+\.[a-z]{2,}$/i.test(host) && (s.length > host.length || !FILES.test(host))) return `https://${s}`;
    // A name alone ("about", "page.html") stays what the page's own addresses are: relative.
    return s;
  };

  // ---- pasted HTML, as words ----------------------------------------------------------------------------------------
  /** Parts a paste drops with everything inside them (they are not words). */
  const DROP = /^(script|style|iframe|frame|frameset|object|embed|link|meta|head|title|svg|math|canvas|template|noscript|form|input|button|select|textarea|option|img|picture|video|audio|source|track|map|area|base|applet|xml)$/;
  const BLOCK = /^(p|div|section|article|header|footer|main|aside|nav|figure|figcaption|address|details|summary|dl|dt|dd|table|thead|tbody|tfoot|caption|hr|fieldset|legend|center)$/;
  /** The words' look from a part's style attribute (Word, Google Docs and web pages write it that way), as the marks to put on them. */
  const looks = (style: string) => {
    const s = style.toLowerCase();
    return {
      b: /font-weight\s*:\s*(bold|[6-9]00)/.test(s),
      i: /font-style\s*:\s*italic/.test(s),
      u: /text-decoration[^;]*underline/.test(s),
      s: /text-decoration[^;]*line-through/.test(s),
      sub: /vertical-align\s*:\s*sub/.test(s),
      sup: /vertical-align\s*:\s*super/.test(s),
      code: /font-family\s*:[^;]*(monospace|courier|consolas|menlo)/.test(s),
    };
  };
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /**
   * The words of pasted HTML as pieces, each a line of words in safe HTML (<strong>, <em>, <u>, <s>, <code>, <sub>, <sup>,
   * <a href> and <br> only) with the kind of block it came from (a heading, a list's item, a quote, code). Nothing else of
   * the markup stays: no scripts, styles, handlers, classes, colours or sizes, and no tags it does not know (their words stay).
   * The paste is split at its blocks; a paste of a single line of words has one piece with no kind.
   */
  const pasteWords = (html: string): { kind: '' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'quote' | 'code'; html: string }[] => {
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${html.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?(?:o:p|st1:[a-z]+)[^>]*>/gi, '')}`, 'text/html');
    const pieces: { kind: '' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'quote' | 'code'; html: string }[] = [];
    type Kind = (typeof pieces)[number]['kind'];
    let cur = '';
    let kind: Kind = '';
    const flush = () => {
      const t = cur.replace(/(?:<br>|\s)+$/, '').replace(/^(?:<br>)+/, '');
      // (an item written with no words in it is left out)
      if (t.replace(/<[^>]*>|&nbsp;|\s/g, '')) pieces.push({ kind, html: t });
      cur = '';
      kind = '';
    };
    const wrap = (tag: string, inner: string) => (inner ? `<${tag}>${inner}</${tag}>` : '');
    /** One part's words: `marks` are what it puts on them, `list` the kind its items take. */
    const walk = (node: Node, marks: ReturnType<typeof looks>, list: Kind, pre: boolean) => {
      if (node.nodeType === 3) {
        let t = (node as Text).data;
        if (!pre) t = t.replace(/[\s\u00a0]+/g, ' ');
        else t = t.replace(/\r\n?/g, '\n');
        if (!t) return;
        if (!pre && !cur.replace(/<[^>]*>/g, '').trim() && !t.trim()) return;
        let h = esc(t);
        if (pre) h = h.replace(/\n/g, '<br>');
        if (!pre && !cur) h = h.replace(/^ /, '');
        if (marks.code) h = wrap('code', h);
        if (marks.sub) h = wrap('sub', h);
        if (marks.sup) h = wrap('sup', h);
        if (marks.s) h = wrap('s', h);
        if (marks.u) h = wrap('u', h);
        if (marks.i) h = wrap('em', h);
        if (marks.b) h = wrap('strong', h);
        cur += h;
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (DROP.test(tag) || el.hasAttribute('hidden') || /display\s*:\s*none/i.test(el.getAttribute('style') ?? '')) return;
      if (tag === 'br') {
        cur += '<br>';
        return;
      }
      const m = { ...marks };
      const st = looks(el.getAttribute('style') ?? '');
      for (const k of Object.keys(st) as (keyof typeof st)[]) if (st[k]) m[k] = true;
      if (tag === 'b' || tag === 'strong') m.b = true;
      // (Google Docs wraps a whole paste in <b style="font-weight:normal">)
      if ((tag === 'b' || tag === 'strong') && /font-weight\s*:\s*(normal|400)/i.test(el.getAttribute('style') ?? '')) m.b = marks.b;
      if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'dfn' || tag === 'var') m.i = true;
      if (tag === 'u' || tag === 'ins') m.u = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') m.s = true;
      if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') m.code = true;
      if (tag === 'sub') m.sub = true;
      if (tag === 'sup') m.sup = true;
      if (tag === 'a') {
        const href = linkAddress(el.getAttribute('href') ?? '');
        const before = cur;
        cur = '';
        for (const c of el.childNodes) walk(c, m, list, pre);
        const inner = cur;
        cur = before;
        // (a link with nothing to click keeps nothing; one with an address that runs code keeps its words only)
        cur += href && inner.replace(/<[^>]*>/g, '').trim() ? `<a href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${inner}</a>` : inner;
        return;
      }
      if (/^h[1-6]$/.test(tag)) {
        flush();
        kind = Number(tag[1]) <= 1 ? 'h1' : Number(tag[1]) === 2 ? 'h2' : 'h3';
        for (const c of el.childNodes) walk(c, { ...m, b: false }, list, pre);
        flush();
        return;
      }
      if (tag === 'ul' || tag === 'ol') {
        flush();
        for (const c of el.children) {
          if (c.tagName.toLowerCase() === 'li') {
            flush();
            kind = tag === 'ol' ? 'number' : 'bullet';
            // (words first, the lists nested in the item after them, each as items of their own)
            for (const x of c.childNodes) if (!(x.nodeType === 1 && /^(ul|ol)$/i.test((x as Element).tagName))) walk(x, m, kind, pre);
            flush();
            for (const x of c.children) if (/^(ul|ol)$/i.test(x.tagName)) walk(x, m, kind, pre);
          } else walk(c, m, list, pre);
        }
        return;
      }
      if (tag === 'li') {
        flush();
        kind = list || 'bullet';
        for (const c of el.childNodes) walk(c, m, list, pre);
        flush();
        return;
      }
      if (tag === 'blockquote') {
        flush();
        kind = 'quote';
        for (const c of el.childNodes) walk(c, m, list, pre);
        flush();
        return;
      }
      if (tag === 'pre') {
        flush();
        kind = 'code';
        for (const c of el.childNodes) walk(c, { ...m, code: false }, list, true);
        flush();
        return;
      }
      if (tag === 'td' || tag === 'th') {
        for (const c of el.childNodes) walk(c, m, list, pre);
        cur += ' ';
        return;
      }
      if (tag === 'tr' || tag === 'dt' || tag === 'dd' || BLOCK.test(tag)) {
        flush();
        for (const c of el.childNodes) walk(c, m, list, pre);
        flush();
        return;
      }
      for (const c of el.childNodes) walk(c, m, list, pre);
    };
    for (const c of doc.body.childNodes) walk(c, { b: false, i: false, u: false, s: false, sub: false, sup: false, code: false }, '', false);
    flush();
    return pieces;
  };

  return { snapMove, snapSize, distances, linkAddress, pasteWords };
}

export type Geometry = ReturnType<typeof geometry>;
