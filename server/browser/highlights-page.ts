// The code that runs in a page of your own browsing for highlights, in an isolated world (Tab.evaluate: the page's own
// scripts cannot see it or change what it does). It marks words by wrapping their text in <mark class="hydor-hl"> (the page's
// text is not changed, only wrapped), finds them again by their words and the words round them (a text-quote anchor), and
// takes the marks away. Text is read as a reader sees it: spaces gathered, hidden parts left out, a space between blocks.
import { HIGHLIGHT_CONTEXT, HIGHLIGHT_MAX } from '../../shared/highlights.ts';

/** The class the marks have, and the attribute with the highlight's id. */
export const MARK_CLASS = 'hydor-hl';
export const MARK_ATTR = 'data-hydor-hl';

// String.raw: this is page code, not ours. It has no backticks; only the two sizes below are put in.
const LIB = String.raw`(function () {
  var CLS = 'hydor-hl', ATTR = 'data-hydor-hl';
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, IFRAME: 1, OBJECT: 1, CANVAS: 1, SVG: 1, MATH: 1, HEAD: 1 };
  var BLOCK = { ADDRESS: 1, ARTICLE: 1, ASIDE: 1, BLOCKQUOTE: 1, BODY: 1, CAPTION: 1, DD: 1, DETAILS: 1, DIV: 1, DL: 1, DT: 1, FIELDSET: 1, FIGCAPTION: 1, FIGURE: 1, FOOTER: 1, FORM: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, HEADER: 1, LI: 1, MAIN: 1, NAV: 1, OL: 1, P: 1, PRE: 1, SECTION: 1, SUMMARY: 1, TABLE: 1, TBODY: 1, TD: 1, TFOOT: 1, TH: 1, THEAD: 1, TR: 1, UL: 1 };
  var CSS = 'background-color: rgba(255, 214, 10, 0.4) !important; color: inherit !important; border-radius: 2px !important; padding: 0 !important; margin: 0 !important; box-decoration-break: clone !important; -webkit-box-decoration-break: clone !important; text-shadow: none !important;';
  var MAXCHARS = 3000000;

  function isSpace(c) { return c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 160; }

  // The page's text as a reader sees it, with where each character is: nodes[i] and offs[i] (a null node is a space put between blocks).
  function collect() {
    var root = document.body || document.documentElement;
    var nodes = [], offs = [], buf = '', last = true, prev = null;
    var blocks = new Map();
    var w = document.createTreeWalker(root, 5, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          if (SKIP[n.tagName.toUpperCase()]) return 2;
          if (n.checkVisibility && !n.checkVisibility()) return 2;
          return 3;
        }
        return 1;
      }
    });
    for (var n = w.nextNode(); n && buf.length < MAXCHARS; n = w.nextNode()) {
      if (n.nodeType !== 3) continue;
      var v = n.nodeValue, p = n.parentElement;
      var b = blocks.get(p);
      if (b === undefined) { b = p; while (b && !BLOCK[b.tagName]) b = b.parentElement; b = b || root; blocks.set(p, b); }
      if (b !== prev) {
        if (prev && !last) { buf += ' '; nodes.push(null); offs.push(0); last = true; }
        prev = b;
      }
      for (var i = 0; i < v.length; i++) {
        var c = v.charCodeAt(i);
        if (isSpace(c)) {
          if (last) continue;
          buf += ' '; last = true;
        } else { buf += v.charAt(i); last = false; }
        nodes.push(n); offs.push(i);
      }
    }
    return { text: buf, nodes: nodes, offs: offs };
  }

  function sharedSuffix(a, b) { var i = 0; while (i < a.length && i < b.length && a.charAt(a.length - 1 - i) === b.charAt(b.length - 1 - i)) i++; return i; }
  function sharedPrefix(a, b) { var i = 0; while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) i++; return i; }

  // Where the words are, when there are several places of them the one whose surroundings fit best.
  function find(full, h) {
    var best = -1, bestScore = -1, count = 0;
    for (var i = full.indexOf(h.text); i >= 0 && count < 500; i = full.indexOf(h.text, i + 1), count++) {
      var s = sharedSuffix(full.slice(Math.max(0, i - 64), i), h.prefix || '') + sharedPrefix(full.slice(i + h.text.length, i + h.text.length + 64), h.suffix || '');
      if (s > bestScore) { best = i; bestScore = s; }
    }
    return best;
  }

  function mark(node, o1, o2, id, note) {
    var t = node;
    if (o2 < t.nodeValue.length) t.splitText(o2);
    var mid = o1 > 0 ? t.splitText(o1) : t;
    var m = document.createElement('mark');
    m.className = CLS;
    m.setAttribute(ATTR, id);
    m.style.cssText = CSS;
    if (note) m.title = note;
    mid.parentNode.insertBefore(m, mid);
    m.appendChild(mid);
  }

  // Wraps the characters from a to b (not including b) of the collected text; how many marks it made.
  function wrap(c, a, b, id, note) {
    var segs = [], cur = null;
    for (var i = a; i < b; i++) {
      var n = c.nodes[i];
      if (!n) { cur = null; continue; }
      if (cur && cur.n === n) cur.o2 = c.offs[i] + 1;
      else { cur = { n: n, o1: c.offs[i], o2: c.offs[i] + 1 }; segs.push(cur); }
    }
    var made = 0;
    for (var k = 0; k < segs.length; k++) {
      var s = segs[k];
      if (!s.n.nodeValue.slice(s.o1, s.o2).trim()) continue;
      mark(s.n, s.o1, s.o2, id, note);
      made++;
    }
    return made;
  }

  function marks(id) { return document.querySelectorAll('mark.' + CLS + '[' + ATTR + '="' + id + '"]'); }

  function scroll(id) {
    var ms = marks(id);
    if (!ms.length) return false;
    ms[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    for (var i = 0; i < ms.length; i++) {
      (function (m) {
        m.style.setProperty('box-shadow', '0 0 0 4px rgba(255, 214, 10, 0.85)', 'important');
        m.style.setProperty('transition', 'box-shadow 0.8s', 'important');
        setTimeout(function () { m.style.setProperty('box-shadow', '0 0 0 0 rgba(255, 214, 10, 0)', 'important'); }, 1400);
      })(ms[i]);
    }
    return true;
  }

  return {
    // Marks what is selected: { text, prefix, suffix } of it, or { error }.
    select: function (id) {
      var s = getSelection();
      if (!s || !s.rangeCount || s.isCollapsed) return { error: 'Select some words on the page first' };
      var r = s.getRangeAt(0);
      var c = collect();
      var inside = new Map();
      var si = -1, ei = -1;
      for (var i = 0; i < c.nodes.length; i++) {
        var n = c.nodes[i];
        if (!n) continue;
        var o = c.offs[i];
        if (n === r.startContainer && o < r.startOffset) continue;
        if (n === r.endContainer && o >= r.endOffset) continue;
        if (n !== r.startContainer && n !== r.endContainer) {
          var k = inside.get(n);
          if (k === undefined) { k = r.intersectsNode(n); inside.set(n, k); }
          if (!k) continue;
        }
        if (si < 0) si = i;
        ei = i;
      }
      if (si < 0) return { error: 'Select some words on the page first' };
      while (si <= ei && c.text.charAt(si) === ' ') si++;
      while (ei >= si && c.text.charAt(ei) === ' ') ei--;
      if (ei < si) return { error: 'Select some words on the page first' };
      var text = c.text.slice(si, ei + 1);
      if (text.length > ${HIGHLIGHT_MAX}) return { error: 'That is too much to highlight at once' };
      var prefix = c.text.slice(Math.max(0, si - ${HIGHLIGHT_CONTEXT}), si);
      var suffix = c.text.slice(ei + 1, ei + 1 + ${HIGHLIGHT_CONTEXT});
      if (!wrap(c, si, ei + 1, id, '')) return { error: 'Those words cannot be highlighted' };
      s.removeAllRanges();
      return { text: text, prefix: prefix, suffix: suffix };
    },
    // Marks the highlights it can find (those already marked are left); { ids: marked or already there, missing }, and scrolls to focus.
    apply: function (list, focus) {
      var ids = [], missing = [];
      var c = null;
      for (var i = 0; i < list.length; i++) {
        var h = list[i];
        if (marks(h.id).length) { ids.push(h.id); continue; }
        if (!c) c = collect();
        var at = find(c.text, h);
        if (at < 0) { missing.push(h.id); continue; }
        if (wrap(c, at, at + h.text.length, h.id, h.note || '')) { ids.push(h.id); c = null; }
        else missing.push(h.id);
      }
      var shown = false;
      if (focus) shown = scroll(focus);
      return { ids: ids, missing: missing, shown: shown };
    },
    // Takes a highlight's marks away, the page's words as they were.
    remove: function (id) {
      var ms = marks(id), n = ms.length;
      for (var i = 0; i < n; i++) {
        var m = ms[i], p = m.parentNode;
        if (!p) continue;
        while (m.firstChild) p.insertBefore(m.firstChild, m);
        p.removeChild(m);
        p.normalize();
      }
      return n;
    },
    note: function (id, note) { var ms = marks(id); for (var i = 0; i < ms.length; i++) { if (note) ms[i].title = note; else ms[i].removeAttribute('title'); } return ms.length; },
    scroll: scroll
  };
})()`;

/** Marks what is selected in the page with this id: `{ text, prefix, suffix }` of it, or `{ error }`. */
export const selectScript = (id: string) => `${LIB}.select(${JSON.stringify(id)})`;

/** Marks these highlights where they are found (and scrolls to `focus`): `{ ids, missing, shown }`. */
export const applyScript = (list: { id: string; text: string; prefix: string; suffix: string; note: string }[], focus?: string) =>
  `${LIB}.apply(${JSON.stringify(list.map((h) => ({ id: h.id, text: h.text, prefix: h.prefix, suffix: h.suffix, note: h.note })))}, ${JSON.stringify(focus ?? '')})`;

/** Takes a highlight's marks away. */
export const removeScript = (id: string) => `${LIB}.remove(${JSON.stringify(id)})`;

/** Sets the note shown over a highlight's marks. */
export const noteScript = (id: string, note: string) => `${LIB}.note(${JSON.stringify(id)}, ${JSON.stringify(note)})`;

/** Scrolls to a highlight and lets it glow for a moment. */
export const scrollScript = (id: string) => `${LIB}.scroll(${JSON.stringify(id)})`;
