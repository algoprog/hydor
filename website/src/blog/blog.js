/* hydor.app's blog: the figures' runtime (window.HydorBlog), the reading progress, the "On this page" list and the
   counters. No libraries, no trackers. website/README.md ("Blog") says how a post's own script uses it.

     HydorBlog.figure('<slug>-<name>', (el, fig) => { … });

   runs once for each element with data-fig="<slug>-<name>", when it first comes within about 300 px of the screen.
   fig.reduced   true when the reader asks for reduced motion: draw the final state, no motion, no auto-play
   fig.visible   whether the figure is on screen now; fig.on('show' | 'hide', fn)
   fig.wait(ms)  a Promise that resolves after ms of on-screen time (the clock stops off screen and in a hidden tab)
   fig.loop(fn)  fn(dt, t) on each frame while it is on screen; returns a function that stops it
   .fig also gets is-in (once, the first time it is on screen) and is-visible (while it is). */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motion.matches;

  /* ---------- Figures ---------- */

  const registry = new Map(); // name → [code, …]
  const states = new WeakMap(); // element → { fig, set }
  const started = new WeakSet();
  let starter = null; // starts a figure's code 300 px before it is on screen
  let seer = null; // knows whether a figure is on screen

  /** The state of one figure: what it gives its code (see the top of this file). */
  function makeFig(el) {
    const listeners = { show: new Set(), hide: new Set() };
    const waits = new Set(); // { left, resolve }: on-screen milliseconds still to wait
    const loops = new Set();
    let visible = false;
    let timer = 0;
    let tickAt = 0;
    let raf = 0;
    let frameAt = 0;
    let t = 0;

    const live = () => visible && !document.hidden;

    // wait(): one timer, running only while the figure is on screen and something is waiting.
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(250, now - tickAt);
      tickAt = now;
      for (const w of [...waits]) {
        w.left -= dt;
        if (w.left <= 0) {
          waits.delete(w);
          w.resolve();
        }
      }
      pump();
    };
    const pump = () => {
      const run = live() && waits.size > 0;
      if (run && !timer) {
        tickAt = performance.now();
        timer = setInterval(tick, 40);
      } else if (!run && timer) {
        clearInterval(timer);
        timer = 0;
      }
    };

    // loop(): one animation frame at a time, only while on screen.
    const frame = (now) => {
      raf = 0;
      if (!live() || !loops.size) return;
      const dt = frameAt ? Math.min(100, now - frameAt) : 16;
      frameAt = now;
      t += dt;
      for (const fn of [...loops]) {
        try {
          fn(dt, t);
        } catch (e) {
          console.error(e);
        }
      }
      if (loops.size) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (raf || !loops.size || !live()) return;
      frameAt = 0;
      raf = requestAnimationFrame(frame);
    };

    const sync = () => {
      pump();
      if (live()) kick();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    document.addEventListener('visibilitychange', sync);

    const fig = {
      get reduced() {
        return reduced();
      },
      get visible() {
        return visible;
      },
      on(type, fn) {
        listeners[type]?.add(fn);
        return () => listeners[type]?.delete(fn);
      },
      wait(ms) {
        return new Promise((resolve) => {
          waits.add({ left: Math.max(0, Number(ms) || 0), resolve });
          pump();
        });
      },
      loop(fn) {
        loops.add(fn);
        kick();
        return () => loops.delete(fn);
      },
    };

    const set = (v) => {
      if (v === visible) return;
      visible = v;
      el.classList.toggle('is-visible', v);
      if (v) el.classList.add('is-in');
      sync();
      for (const fn of [...listeners[v ? 'show' : 'hide']]) {
        try {
          fn();
        } catch (e) {
          console.error(e);
        }
      }
    };
    return { fig, set };
  }

  const stateOf = (el) => {
    let s = states.get(el);
    if (!s) states.set(el, (s = makeFig(el)));
    return s;
  };

  /** Runs the code registered for a figure, once. */
  function start(el) {
    const codes = registry.get(el.getAttribute('data-fig'));
    if (!codes || started.has(el)) return;
    started.add(el);
    const s = stateOf(el);
    // Already on screen: say so before its code runs, so fig.visible is right in it.
    const r = el.getBoundingClientRect();
    if (r.width + r.height > 0 && r.bottom > 0 && r.top < innerHeight) s.set(true);
    for (const code of codes) {
      try {
        const out = code(el, s.fig);
        if (out && typeof out.catch === 'function') out.catch((e) => console.error(e));
      } catch (e) {
        console.error(e);
      }
    }
  }

  const watched = new WeakSet();
  const startable = new WeakSet();
  /** Looks after every .fig and [data-fig] on the page (and the ones whose code is registered later). */
  function watchFigures() {
    if (!('IntersectionObserver' in window)) return;
    starter ||= new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          starter.unobserve(e.target);
          start(e.target);
        }
      },
      { rootMargin: '300px 0px' },
    );
    seer ||= new IntersectionObserver((es) => {
      for (const e of es) stateOf(e.target).set(e.isIntersecting);
    });
    for (const el of $$('.fig, [data-fig]')) {
      if (!watched.has(el)) (watched.add(el), seer.observe(el));
      if (el.hasAttribute('data-fig') && registry.has(el.getAttribute('data-fig')) && !startable.has(el)) (startable.add(el), starter.observe(el));
    }
  }

  let ready = false;
  window.HydorBlog = {
    figure(name, code) {
      if (typeof code !== 'function') return;
      if (!registry.has(name)) registry.set(name, []);
      registry.get(name).push(code);
      // Registered after the page was looked at (a script that ran late): look again.
      if (ready) watchFigures();
    },
  };

  /* ---------- The counters: b[data-count-to] counts up the first time it is seen ---------- */

  function counters() {
    const els = $$('[data-count-to]');
    if (!els.length) return;
    const parts = (el) => {
      const raw = String(el.dataset.countTo);
      return { to: Number(raw), dec: (raw.split('.')[1] || '').length, prefix: el.dataset.prefix || '', suffix: el.dataset.suffix || '', group: /\d,\d{3}/.test(el.dataset.shown || el.textContent) };
    };
    for (const el of els) el.dataset.shown = el.textContent; // what is written there is the value without script
    const show = (el, v) => {
      const { dec, prefix, suffix, group } = parts(el);
      el.textContent = prefix + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: group }) + suffix;
    };
    if (reduced() || !('IntersectionObserver' in window)) return;
    const todo = els.filter((el) => Number.isFinite(parts(el).to));
    for (const el of todo) show(el, 0);
    const run = (el) => {
      const { to } = parts(el);
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 1400);
        show(el, to * (1 - Math.pow(1 - k, 4)));
        if (k < 1 && !reduced()) requestAnimationFrame(step);
        else el.textContent = el.dataset.shown;
      };
      requestAnimationFrame(step);
    };
    const seen = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          seen.unobserve(e.target);
          run(e.target);
        }
      },
      { threshold: 0.6 },
    );
    for (const el of todo) seen.observe(el);
  }

  /* ---------- Reading progress and "On this page" ---------- */

  function reading() {
    const body = $('[data-post-body]');
    if (!body) return;
    const bar = $('.read-progress i');
    const article = $('.post-layout') || body;
    let pending = false;
    const paint = () => {
      pending = false;
      if (!bar) return;
      const r = article.getBoundingClientRect();
      const total = r.height - innerHeight * 0.5;
      const k = total > 0 ? Math.min(1, Math.max(0, (innerHeight * 0.35 - r.top) / total)) : 0;
      bar.style.transform = `scaleX(${k.toFixed(4)})`;
    };
    const ask = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(paint);
    };
    addEventListener('scroll', ask, { passive: true });
    addEventListener('resize', ask);
    paint();

    // The list of ## headings: the one you are reading is marked.
    const links = $$('.post-toc a');
    if (links.length) {
      const heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
      let current = null;
      const mark = () => {
        // The last heading above the top third of the screen; before the first, none.
        let pick = null;
        for (const h of heads) {
          if (h.getBoundingClientRect().top <= innerHeight * 0.3) pick = h;
          else break;
        }
        const id = pick ? pick.id : null;
        if (id === current) return;
        current = id;
        for (const a of links) {
          const on = id && a.hash === `#${id}`;
          a.classList.toggle('is-current', Boolean(on));
          if (on) a.setAttribute('aria-current', 'location');
          else a.removeAttribute('aria-current');
        }
      };
      addEventListener('scroll', mark, { passive: true });
      addEventListener('resize', mark);
      mark();
    }

    // A wide figure comes over the place the list is in: the list steps aside while one is on screen.
    const toc = $('.post-toc');
    const wide = $$('.fig.wide, .post-figure.wide');
    if (toc && wide.length && 'IntersectionObserver' in window) {
      const on = new Set();
      const io2 = new IntersectionObserver((es) => {
        for (const e of es) (e.isIntersecting ? on.add(e.target) : on.delete(e.target));
        toc.classList.toggle('is-aside', on.size > 0);
      });
      for (const el of wide) io2.observe(el);
    }
  }

  const init = () => {
    ready = true;
    watchFigures();
    counters();
    reading();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
