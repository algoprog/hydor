// The code that runs in a page of your own browsing to translate it in place, in an isolated world (Tab.evaluate: the page's
// own scripts cannot see it or change what it does). It finds the page's words in pieces (text nodes) and gathers the
// pieces of a sentence that links, bold words and the like cut up into one segment, so that the whole sentence is translated
// as one and its words can move between the pieces. It hands out what is on the screen first, writes translations into
// the same text nodes (the page's markup is not touched), watches the page for words that come later or that the page
// changes itself, and puts every word back as it was. translate.ts drives it:
//   sample()        the page's language (its <html lang>) and some of its visible text, to find the language from
//   start(to)       finds the segments and starts watching the screen and the page (a promise, once it knows what is on screen)
//   take(chars, n)  the next segments to translate, [{ id, text }], marked as on their way
//   put(results)    writes translations ([{ id, text }]); how many were written
//   fail(ids)       segments that could not be translated: one more try, then they are left as they are
//   progress()      { done, total }
//   restore()       the page's own words are back, nothing is watched
// A segment of one piece is its text; a segment of several has a mark before each piece, ⟦0⟧Click ⟦1⟧here⟦2⟧ to read more.
// (a space where a piece had white space at its edge), and its translation has the same marks, in order.

/** The most characters of the page beyond what comes near the screen that are handed out. */
export const FAR_CHARS = 150_000;
/** The most text nodes looked at, the most pieces in a segment, and the length over which a piece goes alone. */
export const MAX_NODES = 50_000;
export const MAX_PIECES = 30;
export const BIG_PIECE = 3000;

// String.raw: this is page code, not ours. It has no backticks and no dollar-brace; only the four numbers above are put in.
const LIB = String.raw`(function () {
  if (globalThis.__hydorTr) return false;
  var FAR = ${FAR_CHARS}, MAXN = ${MAX_NODES}, MAXP = ${MAX_PIECES}, BIG = ${BIG_PIECE};
  var LETTER = /\p{L}/u;
  var SKIP = { script: 1, style: 1, noscript: 1, template: 1, svg: 1, math: 1, canvas: 1, video: 1, audio: 1, iframe: 1, object: 1, embed: 1, textarea: 1, input: 1, select: 1, option: 1, datalist: 1, pre: 1, head: 1, title: 1 };
  var BUTTONS = { button: 1, submit: 1, reset: 1 };
  var GEN = 0;
  var S = null;

  // How a piece is cut up and put back.
  function esc(s) { return s.replace(/[⟦⟧]/g, function (c) { return c === '⟦' ? '[' : ']'; }); }
  function lead(v) { return /^\s*/.exec(v)[0]; }
  function trail(v) { return /\s*$/.exec(v)[0]; }
  function core(v) { return esc(v.replace(/\s+/g, ' ').trim()); }

  // Whether an element's words are left alone: marked so, editable, or not text to read.
  function leftAlone(el) {
    var t = el.getAttribute('translate');
    if (t !== null && t.toLowerCase() === 'no') return true;
    if (el.classList && el.classList.contains('notranslate')) return true;
    var ce = el.getAttribute('contenteditable');
    return ce !== null && ce.toLowerCase() !== 'false';
  }

  // What an element is drawn as, once per pass: a block (anything but inline or display: contents), and text that keeps its lines (white-space: pre).
  function info(el) {
    var c = S.cache.get(el);
    if (c) return c;
    var cs = getComputedStyle(el), d = cs.display;
    c = { block: d !== 'inline' && d !== 'contents', pre: cs.whiteSpace === 'pre' };
    S.cache.set(el, c);
    return c;
  }

  function up(el) { return el.parentElement || (el.parentNode && el.parentNode.host) || null; }

  // Whether an element, or one it is in, is left alone (a piece of the page that came later has to be looked at from where it stands).
  function underSkipped(el) {
    for (var e = el; e; e = up(e)) {
      if (SKIP[e.localName] || leftAlone(e)) return true;
      var i = info(e);
      if (i.pre || (i.block && e.localName === 'code')) return true;
    }
    return false;
  }

  function blockOf(el, root) {
    var b = S.blocks.get(el);
    if (b) return b;
    var e = el;
    while (e && !info(e).block) e = up(e);
    b = e || root;
    S.blocks.set(el, b);
    return b;
  }

  // ---- finding the segments -------------------------------------------------------------------------------

  function makeSeg(pieces) {
    var g = { id: S.gen + '.' + (++S.seq), pieces: pieces, state: 0, tries: 0, near: false, text: '', target: pieces[0].el };
    if (pieces.length === 1) g.text = pieces[0].core;
    else g.text = pieces.map(function (p, i) { return '⟦' + i + '⟧' + (p.lead ? ' ' : '') + p.core + (p.trail ? ' ' : ''); }).join('');
    S.segs.set(g.id, g);
    for (var i = 0; i < pieces.length; i++) if (pieces[i].n) S.nodeSeg.set(pieces[i].n, g);
    watch(g);
    return g;
  }

  function watch(g) {
    if (!S.io || !g.target) return;
    var list = S.watch.get(g.target);
    if (!list) { S.watch.set(g.target, (list = [])); S.io.observe(g.target); }
    list.push(g);
  }

  function unwatch(g) {
    var list = g.target && S.watch.get(g.target);
    if (!list) return;
    var k = list.indexOf(g);
    if (k >= 0) list.splice(k, 1);
    if (!list.length) { S.watch.delete(g.target); if (S.io) S.io.unobserve(g.target); }
  }

  // A segment is dropped: its words are looked at again where it stood (they changed, or they are gone).
  function release(g, again) {
    S.segs.delete(g.id);
    unwatch(g);
    for (var i = 0; i < g.pieces.length; i++) {
      var p = g.pieces[i];
      if (p.n && S.nodeSeg.get(p.n) === g) S.nodeSeg.delete(p.n);
      if (again) { var e = p.n ? up(p.n) : p.el; if (e) dirty(e); }
    }
  }

  // The run so far becomes a segment, and then the attribute words seen while it was open (so that they come in the page's order).
  function flush(st) {
    var r = st.run;
    st.run = null;
    if (r && r.pieces.length) makeSeg(r.pieces);
    while (st.attrs.length) makeSeg([st.attrs.shift()]);
  }

  function addPiece(st, p) {
    var r = st.run;
    if (r && (r.block !== p.block || r.blocks !== st.blocks || r.pieces.length >= MAXP || r.chars + p.core.length > BIG)) { flush(st); r = null; }
    if (p.core.length > BIG) {
      flush(st);
      makeSeg([p]);
      return;
    }
    if (!r) r = st.run = { block: p.block, blocks: st.blocks, pieces: [], chars: 0 };
    r.pieces.push(p);
    r.chars += p.core.length;
  }

  function addText(st, n, root) {
    var v = n.nodeValue;
    if (!v || !LETTER.test(v)) return;
    // Words already on their way, translated, or given up on break the run: they are not looked at twice.
    var w = S.written.get(n);
    if (S.nodeSeg.has(n) || (w !== undefined && w === v)) { flush(st); return; }
    var parent = up(n);
    if (!parent) return;
    S.pieces++;
    addPiece(st, { n: n, el: parent, cur: v, lead: lead(v), trail: trail(v), core: core(v), block: blockOf(parent, root) });
  }

  // The words in an element's attributes that people read: a field's placeholder, a tooltip, a button's label.
  function addAttrs(el, st) {
    var names = [];
    if (el.hasAttribute('placeholder') && (el.localName === 'input' || el.localName === 'textarea')) names.push('placeholder');
    if (el.hasAttribute('title')) names.push('title');
    if (el.localName === 'input' && BUTTONS[(el.getAttribute('type') || '').toLowerCase()] && el.hasAttribute('value')) names.push('value');
    for (var i = 0; i < names.length; i++) {
      var v = el.getAttribute(names[i]);
      if (!v || !LETTER.test(v)) continue;
      var key = el, seen = S.attrSeen.get(key);
      if (seen && seen[names[i]] === v) continue;
      if (!seen) S.attrSeen.set(key, (seen = {}));
      seen[names[i]] = v;
      S.pieces++;
      st.attrs.push({ n: null, el: el, attr: names[i], cur: v, lead: '', trail: '', core: core(v) });
    }
  }

  function scan(root) {
    if (S.pieces >= MAXN) return;
    S.cache = new Map();
    S.blocks = new Map();
    if (root.nodeType === 1 && underSkipped(root)) return;
    var st = { run: null, blocks: 0, attrs: [] };
    var seenNodes = 0;
    var walker = document.createTreeWalker(root, 1 | 4, {
      acceptNode: function (n) {
        if (n.nodeType !== 1) return 1;
        if (leftAlone(n)) { if (info(n).block) st.blocks++; return 2; }
        addAttrs(n, st);
        if (n.shadowRoot) enqueue(n.shadowRoot);
        var i = info(n);
        if (i.block || n.localName === 'br' || n.localName === 'hr') st.blocks++;
        if (SKIP[n.localName] || i.pre || (i.block && n.localName === 'code')) return 2;
        return 1;
      }
    });
    if (root.nodeType === 1) { addAttrs(root, st); if (root.shadowRoot) enqueue(root.shadowRoot); }
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType !== 3) continue;
      if (++seenNodes > MAXN || S.pieces >= MAXN) break;
      addText(st, n, root);
    }
    flush(st);
  }

  // A shadow root (open ones only) is looked at as a page of its own, and watched.
  function enqueue(root) {
    if (S.roots.has(root)) return;
    S.roots.add(root);
    S.queue.push(root);
    if (S.mo) S.mo.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function drain() {
    var r = globalThis.__hydorReader && globalThis.__hydorReader.root;
    if (r && r.nodeType === 11) enqueue(r);
    while (S.queue.length) scan(S.queue.shift());
  }

  // ---- what comes later -----------------------------------------------------------------------------------

  function dirty(el) {
    if (!S || !el) return;
    S.dirty.add(el);
    if (!S.timer) {
      var s = S;
      S.timer = setTimeout(function () { if (S === s) rescan(); }, 250);
    }
  }

  function onMutations(records) {
    if (!S) return;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'characterData') {
        var n = r.target, w = S.written.get(n);
        // What the page changed itself is new: its words are translated again. What this wrote is not.
        if (w !== undefined && n.nodeValue === w) continue;
        if (w !== undefined) {
          S.written.delete(n);
          S.originals.delete(n);
          S.churn.set(n, (S.churn.get(n) || 0) + 1);
        }
        if ((S.churn.get(n) || 0) > 5) continue;
        var g = S.nodeSeg.get(n);
        if (g) release(g, true);
        else dirty(up(n));
      } else {
        for (var k = 0; k < r.addedNodes.length; k++) {
          var a = r.addedNodes[k];
          if (a.nodeType === 1) dirty(a);
          else if (a.nodeType === 3) dirty(up(a));
        }
      }
    }
  }

  function rescan() {
    var s = S;
    s.timer = 0;
    var list = Array.from(s.dirty);
    s.dirty.clear();
    var set = new Set(list);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!el.isConnected) continue;
      var inner = false;
      for (var a = up(el); a; a = up(a)) if (set.has(a)) { inner = true; break; }
      if (!inner) scan(el);
    }
    drain();
  }

  // ---- writing translations ---------------------------------------------------------------------------------

  // A translation cut at its marks, one text for each piece; null when its marks are not the segment's, once each, in order.
  function cut(text, k) {
    if (k === 1) {
      var one = text.replace(/⟦\d+⟧/g, '').trim();
      return one ? [one] : null;
    }
    var re = /⟦(\d+)⟧/g, m, at = [];
    while ((m = re.exec(text))) at.push([Number(m[1]), m.index, re.lastIndex]);
    if (at.length !== k) return null;
    for (var i = 0; i < k; i++) if (at[i][0] !== i) return null;
    if (text.slice(0, at[0][1]).trim()) return null;
    var parts = [];
    for (var j = 0; j < k; j++) parts.push(text.slice(at[j][2], j + 1 < k ? at[j + 1][1] : text.length));
    return parts;
  }

  var CJK_START = /^[　-鿿豈-﫿＀-￯]/, CJK_END = /[　-鿿豈-﫿＀-￯]$/;
  var CLOSING = /^[,.;:!?%)\]}»”’…、。，．！？：；）]/, OPENING = /[(\[{«“‘（]$/;

  // What a node holds once its piece is translated: its own white space at its edges, round the translation, except where the
  // words that follow need none (a comma, a bracket, Chinese).
  function compose(p, raw, i, k) {
    var t = raw.replace(/\s+/g, ' ').trim();
    if (!t) return p.lead || p.trail ? ' ' : '';
    var l = p.lead, r = p.trail;
    if (l && (CLOSING.test(t) || CJK_START.test(t))) l = '';
    if (r && (OPENING.test(t) || CJK_END.test(t))) r = '';
    if (!l && i > 0 && /^\s/.test(raw) && !CJK_START.test(t)) l = ' ';
    if (!r && i < k - 1 && /\s$/.test(raw) && !CJK_END.test(t)) r = ' ';
    return l + t + r;
  }

  // 1 when written, 0 when its translation is not the segment's, -1 when the page moved on under it.
  function apply(g, text) {
    var ps = g.pieces, parts = cut(text, ps.length);
    if (!parts) return 0;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.n) { if (!p.n.isConnected || p.n.nodeValue !== p.cur) return -1; }
      else if (!p.el.isConnected || p.el.getAttribute(p.attr) !== p.cur) return -1;
    }
    var prevSpace = false;
    for (var j = 0; j < ps.length; j++) {
      var q = ps[j], nv = compose(q, parts[j], j, ps.length);
      // White space at the end of the piece before and at the start of this one is one space.
      if (prevSpace && /^\s/.test(nv)) nv = nv.replace(/^\s+/, '');
      if (nv) prevSpace = /\s$/.test(nv);
      if (q.n) {
        S.originals.set(q.n, q.cur);
        S.written.set(q.n, nv);
        q.n.nodeValue = nv;
      } else {
        S.attrs.push({ el: q.el, attr: q.attr, orig: q.cur, written: nv });
        var seen = S.attrSeen.get(q.el);
        if (seen) seen[q.attr] = nv;
        q.el.setAttribute(q.attr, nv);
      }
    }
    return 1;
  }

  function failOne(g) {
    if (g.tries < 1) { g.tries++; g.state = 0; return; }
    // Given up on: its words stay as they are, and are not looked at again (until the page changes them).
    g.state = 3;
    unwatch(g);
  }

  // ---- the calls ----------------------------------------------------------------------------------------------

  var api = {
    sample: function () {
      var out = [], len = 0, LIM = 4000;
      function add(t) {
        t = t.replace(/\s+/g, ' ').trim();
        if (t.length < 2) return;
        out.push(t);
        len += t.length + 1;
      }
      add(document.title || '');
      var els = document.querySelectorAll('h1,h2,h3,p,li,blockquote,dd,figcaption,summary,td,th');
      for (var i = 0; i < els.length && i < 1500 && len < LIM; i++) {
        var el = els[i];
        if (el.checkVisibility && !el.checkVisibility()) continue;
        add((el.textContent || '').slice(0, 600));
      }
      if (len < 300 && document.body) {
        var w = document.createTreeWalker(document.body, 4, null), n, seen = 0;
        while ((n = w.nextNode()) && len < LIM && seen++ < 3000) {
          var p = n.parentElement;
          if (!p || SKIP[p.localName] || (p.checkVisibility && !p.checkVisibility())) continue;
          add(n.nodeValue || '');
        }
      }
      return { lang: document.documentElement.lang || '', text: out.join('\n').slice(0, LIM) };
    },

    start: function (to) {
      if (S) api.restore();
      var s = (S = {
        to: to, gen: ++GEN, seq: 0, segs: new Map(), nodeSeg: new Map(), written: new Map(), originals: new Map(), attrs: [], attrSeen: new Map(),
        churn: new Map(), watch: new Map(), roots: new Set(), queue: [], dirty: new Set(), timer: 0, farChars: 0, pieces: 0,
        cache: new Map(), blocks: new Map(), io: null, mo: null, ioSeen: false, onio: null,
      });
      if (typeof IntersectionObserver === 'function') {
        s.io = new IntersectionObserver(function (entries) {
          if (S !== s) return;
          s.ioSeen = true;
          for (var i = 0; i < entries.length; i++) {
            var list = s.watch.get(entries[i].target);
            if (list) for (var k = 0; k < list.length; k++) list[k].near = entries[i].isIntersecting;
          }
          if (s.onio) { var f = s.onio; s.onio = null; f(); }
        }, { rootMargin: '100% 0px', threshold: 0 });
      }
      s.mo = new MutationObserver(onMutations);
      var body = document.body;
      if (body) { S.roots.add(body); S.queue.push(body); s.mo.observe(body, { childList: true, subtree: true, characterData: true }); }
      drain();
      // The screen is known once the observer has said what is near it (a page that is not shown never says: all of it is near).
      return new Promise(function (resolve) {
        var done = false;
        function fin() { if (!done) { done = true; resolve(true); } }
        if (!s.io || !s.segs.size) return fin();
        s.onio = fin;
        setTimeout(fin, 400);
      });
    },

    take: function (maxChars, maxCount) {
      if (!S) return [];
      drain();
      var pending = [], anyNear = false;
      S.segs.forEach(function (g) {
        if (g.near) anyNear = true;
        if (g.state === 0) pending.push(g);
      });
      var near = [], far = [];
      for (var i = 0; i < pending.length; i++) (pending[i].near || !anyNear ? near : far).push(pending[i]);
      if (anyNear && near.length > 1) {
        // What is on the screen first, then what is nearest to it (above or below).
        var vh = innerHeight || 800, key = new Map();
        near.forEach(function (g) {
          var r = g.target.getBoundingClientRect();
          key.set(g, r.bottom <= 0 ? 1 - r.bottom : r.top >= vh ? 1 + r.top - vh : 0);
        });
        near.sort(function (a, b) { return key.get(a) - key.get(b); });
      }
      var out = [], chars = 0, stop = false;
      function fill(list, far) {
        for (var k = 0; k < list.length && out.length < maxCount && !stop; k++) {
          var g = list[k], len = g.text.length;
          if (far && S.farChars >= FAR) return;
          if (out.length && (chars + len > maxChars || len > BIG)) { stop = true; return; }
          out.push({ id: g.id, text: g.text });
          g.state = 1;
          chars += len;
          if (far) S.farChars += len;
          if (len > BIG) stop = true;
        }
      }
      fill(near, false);
      fill(far, true);
      return out;
    },

    put: function (results) {
      if (!S) return 0;
      var n = 0;
      for (var i = 0; i < results.length; i++) {
        var g = S.segs.get(results[i].id);
        if (!g || g.state !== 1) continue;
        var r = apply(g, String(results[i].text));
        if (r === 1) {
          g.state = 2;
          unwatch(g);
          for (var k = 0; k < g.pieces.length; k++) if (g.pieces[k].n) S.nodeSeg.delete(g.pieces[k].n);
          n++;
        } else if (r === -1) release(g, true);
        else failOne(g);
      }
      return n;
    },

    fail: function (ids) {
      if (!S) return 0;
      for (var i = 0; i < ids.length; i++) {
        var g = S.segs.get(ids[i]);
        if (g && g.state === 1) failOne(g);
      }
      return ids.length;
    },

    progress: function () {
      if (!S) return { done: 0, total: 0 };
      var done = 0, total = 0, anyNear = false, capped = S.farChars >= FAR;
      S.segs.forEach(function (g) { if (g.near) anyNear = true; });
      S.segs.forEach(function (g) {
        if (g.state >= 2) { done++; total++; }
        else if (g.state === 1) total++;
        else if (!capped || g.near || !anyNear) total++;
      });
      return { done: done, total: total };
    },

    restore: function () {
      if (!S) return 0;
      var s = S, n = 0;
      S = null;
      if (s.timer) clearTimeout(s.timer);
      if (s.mo) s.mo.disconnect();
      if (s.io) s.io.disconnect();
      s.originals.forEach(function (orig, node) {
        if (s.written.get(node) === node.nodeValue) { node.nodeValue = orig; n++; }
      });
      for (var i = s.attrs.length - 1; i >= 0; i--) {
        var a = s.attrs[i];
        if (a.el.getAttribute(a.attr) === a.written) { a.el.setAttribute(a.attr, a.orig); n++; }
      }
      return n;
    },
  };
  globalThis.__hydorTr = api;
  return true;
})()`;

const json = (v: unknown) => JSON.stringify(v);

/** Puts the page code in the page when it is not there yet (once for each document). */
export const installScript = (): string => LIB;

/** The page's language as it says (`lang`) and some of its visible text, for finding its language. */
export const sampleScript = (): string => `${LIB};\nglobalThis.__hydorTr.sample()`;

/** Finds the page's segments and starts watching it, for a translation into `to`; settles when what is on screen is known. */
export const startScript = (to: string): string => `${LIB};\nglobalThis.__hydorTr.start(${json(to)})`;

// The calls below answer null when the page code is not there: the page became another document.

/** The next segments to translate, as `[{ id, text }]` (and marks them as on their way). */
export const takeScript = (maxChars: number, maxCount: number): string => `globalThis.__hydorTr?.take(${json(maxChars)},${json(maxCount)}) ?? null`;

/** Writes translations (`text` with the segment's marks); how many were written. */
export const putScript = (results: { id: string; text: string }[]): string => `globalThis.__hydorTr?.put(${json(results)}) ?? null`;

/** Segments that could not be translated. */
export const failScript = (ids: string[]): string => `globalThis.__hydorTr?.fail(${json(ids)}) ?? null`;

/** How many segments are translated, and found so far: `{ done, total }`. */
export const progressScript = (): string => `globalThis.__hydorTr?.progress() ?? null`;

/** Puts every word back as it was, and stops watching; how many were put back. */
export const restoreScript = (): string => `globalThis.__hydorTr?.restore() ?? null`;
