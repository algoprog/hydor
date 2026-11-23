// The ad blocker's part inside every frame of your own tabs (the main frame and iframes, whatever their site). adblock.cjs
// registers it as a frame preload of the browsing sessions, and the frame asks the app (main process) what to do with it:
//
//   1. At once, before the page's own scripts: `sendSync` for this frame's scriptlets and style sheet. Asking synchronously is
//      the point. Ghostery's own preload asks with an async `invoke` and the app runs the answer after the page has started, so
//      a scriptlet that must run first (one that defuses an anti-adblock check, or strips a video's ads from the player's
//      data) came too late, and an ad's bait element was read by the page before it was hidden.
//   2. `webFrame.executeJavaScript` runs each scriptlet in the page's own world, synchronously, before the page's first inline
//      script. The page's Content-Security-Policy and Trusted Types do not apply to it (measured: a nonce policy with
//      `strict-dynamic` and `require-trusted-types-for 'script'`, in the main frame and in a cross-site iframe). Each runs
//      in a try of its own, so one that fails does not stop the others.
//   3. `webFrame.insertCSS(…, { cssOrigin: 'user' })` puts in the style sheet (what hides ads), at document start.
//   4. When the page has loaded, the classes, ids and links on it are sent to the app, which answers with the style sheet of the
//      generic rules those can match (the app has them as an index; sending them all to every frame would be megabytes).
//      A MutationObserver then does the same for what is added later, a little after it happens and not on every change.
//   5. The procedural filters (`:has-text()`, `:upward()`, `:xpath()`, `:matches-css()`, `:remove()` …) cannot be a style sheet:
//      this evaluates them in the page's DOM with Ghostery's evaluator (adblock.cjs puts it in front of this file, as
//      `__adblockSelectors`: a sandboxed preload can only require 'electron'), after the page has loaded and again, debounced,
//      when the page changes. An element that matches gets the attribute its rule's style sheet hides, or is removed.
//
// The app answers `{ off: true }` for a frame of a site you allowed ads on, or of a session that does not block.
'use strict';
(function () {
  const { ipcRenderer, webFrame } = require('electron');
  // Only web pages, and the blank frames a page makes for itself (the app takes their address from their parent).
  if (!/^(https?:|about:)/i.test(location.href)) return;
  // eslint-disable-next-line no-undef
  const selectors = typeof __adblockSelectors !== 'undefined' ? __adblockSelectors : null;

  let first;
  try {
    first = ipcRenderer.sendSync('hydor:adblock-frame');
  } catch {
    return;
  }
  if (!first || first.off) return;

  const run = (code) => {
    try {
      const p = webFrame.executeJavaScript(code);
      if (p && p.catch) p.catch(() => {});
    } catch {}
  };
  const css = (text) => {
    if (!text) return;
    try {
      webFrame.insertCSS(text, { cssOrigin: 'user' });
    } catch {}
  };
  for (const code of first.scripts || []) run(code);
  css(first.styles);

  // ---- procedural filters -------------------------------------------------------------------------------------------------

  /** Everything the app sent so far, by the rule's id. */
  const extended = new Map();
  const addExtended = (list) => {
    for (const f of list || []) if (f && f.ast && !extended.has(f.id)) extended.set(f.id, f);
  };
  addExtended(first.extended);

  let pass = 0;
  let passTimer = 0;
  let passDue = 0;
  /** Looks for what the procedural filters match, and hides or removes it. */
  function evaluate() {
    passTimer = 0;
    if (!selectors || !extended.size || !document.documentElement) return;
    const t0 = performance.now();
    for (const f of extended.values()) {
      let found;
      try {
        found = selectors.querySelectorAll(document.documentElement, f.ast);
      } catch {
        // A selector this page's browser does not take is left out for good.
        extended.delete(f.id);
        continue;
      }
      for (const el of found) {
        try {
          if (f.directive) selectors.handlePseudoDirective(el, f.directive);
          else if (f.attribute && !el.hasAttribute(f.attribute)) el.setAttribute(f.attribute, '');
        } catch {}
      }
    }
    pass = performance.now() - t0;
  }
  /** Soon, once for a burst of changes; a page that is slow to look through waits longer (up to the cap), so it is not slowed more. */
  function later() {
    if (!extended.size) return;
    const wait = Math.min(2000, Math.max(200, pass * 8));
    if (!passTimer) passDue = Date.now() + 1000;
    clearTimeout(passTimer);
    // Never later than a second after the first change of a burst (a page that changes all the time still gets looked at).
    passTimer = setTimeout(evaluate, Math.max(0, Math.min(wait, passDue - Date.now())));
  }

  // ---- generic rules, by what is on the page ------------------------------------------------------------------------------

  const known = { classes: new Set(), ids: new Set(), hrefs: new Set() };
  /** The classes, ids and links in these elements (and under them) that the app has not been told yet. */
  function featuresOf(roots) {
    const classes = [];
    const ids = [];
    const hrefs = [];
    const seen = new Set();
    const take = (el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const id = el.getAttribute('id');
      if (id && !known.ids.has(id)) (known.ids.add(id), ids.push(id));
      for (const c of el.classList || []) if (!known.classes.has(c)) (known.classes.add(c), classes.push(c));
      const href = el.getAttribute('href');
      if (href && !known.hrefs.has(href)) (known.hrefs.add(href), hrefs.push(href));
    };
    for (const root of roots) {
      if (!root || root.nodeType !== 1) continue;
      take(root);
      if (root.querySelectorAll) for (const el of root.querySelectorAll('[id],[class],[href]')) take(el);
    }
    return { classes, ids, hrefs };
  }
  let asking = false;
  const waiting = { classes: [], ids: [], hrefs: [] };
  function ask(f) {
    waiting.classes.push(...f.classes);
    waiting.ids.push(...f.ids);
    waiting.hrefs.push(...f.hrefs);
    if (asking || (!waiting.classes.length && !waiting.ids.length && !waiting.hrefs.length)) return;
    asking = true;
    const msg = { classes: waiting.classes.splice(0), ids: waiting.ids.splice(0), hrefs: waiting.hrefs.splice(0) };
    ipcRenderer
      .invoke('hydor:adblock-features', msg)
      .then((r) => {
        if (r) {
          css(r.styles);
          addExtended(r.extended);
          if (r.extended && r.extended.length) later();
        }
      })
      .catch(() => {})
      .finally(() => {
        asking = false;
        // What came while it was asking goes in the next question.
        ask({ classes: [], ids: [], hrefs: [] });
      });
  }

  function loaded() {
    ask(featuresOf([document.documentElement]));
    evaluate();
    if (!first.observe || typeof MutationObserver !== 'function') return;
    let nodes = new Set();
    let timer = 0;
    let due = 0;
    const flush = () => {
      timer = 0;
      const batch = [...nodes];
      nodes = new Set();
      ask(featuresOf(batch));
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') nodes.add(r.target);
        else for (const n of r.addedNodes) if (n.nodeType === 1) nodes.add(n);
      }
      later();
      // A burst is looked at after a quiet moment, and at the latest a second after it began.
      if (nodes.size > 512) return void (clearTimeout(timer), flush());
      if (!timer) due = Date.now() + 1000;
      clearTimeout(timer);
      timer = setTimeout(flush, Math.max(0, Math.min(25, due - Date.now())));
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'id', 'href'], childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loaded, { once: true, passive: true });
  else loaded();
})();
