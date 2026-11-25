/* Dynamic UIs: the post's seven figures (versus, stream, kinds, use, phone, session, more). Each registers with
   HydorBlog.figure; under reduced motion nothing moves or plays by itself and a complete state shows; buttons and tabs
   always work. The phone figure is plain HTML and CSS. */
(() => {
  'use strict';
  const B = window.HydorBlog;
  if (!B) return;

  const $ = (sel, root) => root.querySelector(sel);
  const $$ = (sel, root) => [...root.querySelectorAll(sel)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  /** A list of tabs: one selected, roving tabindex, arrow keys, and (when `dur` is set) a move on to the next every
   *  `dur` ms of on-screen time that stops for good at the reader's first choice and waits while they point at it or
   *  have focus in it. select(i, byUser) is `pick` from the code; `show(i, auto)` draws what a tab selects. */
  function tabList(fig, o) {
    const { root, tabs, panel, dur = 0, show } = o;
    let cur = 0;
    let auto = dur > 0 && !fig.reduced;
    let hover = false;
    let focus = false;
    const api = {
      get cur() { return cur; },
      get auto() { return auto; },
      stop() { auto = false; $$('.run', root).forEach((b) => b.classList.remove('run')); },
      select(i, byUser) {
        cur = (i + tabs.length) % tabs.length;
        tabs.forEach((t, k) => {
          t.setAttribute('aria-selected', String(k === cur));
          t.tabIndex = k === cur ? 0 : -1;
          const bar = $('.duk-bar, .dum-bar', t);
          if (!bar) return;
          bar.classList.remove('run');
          if (k === cur && auto && !byUser) {
            void bar.offsetWidth;
            bar.style.setProperty('--dur', dur + 'ms');
            bar.classList.add('run');
          }
        });
        panel.setAttribute('aria-labelledby', tabs[cur].id);
        show(cur, byUser);
      },
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => { api.stop(); api.select(i, true); });
      t.addEventListener('keydown', (e) => {
        const k = e.key;
        let n = null;
        if (k === 'ArrowRight' || k === 'ArrowDown') n = cur + 1;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') n = cur - 1;
        else if (k === 'Home') n = 0;
        else if (k === 'End') n = tabs.length - 1;
        if (n === null) return;
        e.preventDefault();
        api.stop();
        api.select(clamp(n, -1, tabs.length), true);
        tabs[cur].focus();
      });
    });
    const pause = () => root.classList.toggle('paused', hover || focus);
    root.addEventListener('mouseenter', () => { hover = true; pause(); });
    root.addEventListener('mouseleave', () => { hover = false; pause(); });
    root.addEventListener('focusin', () => { focus = true; pause(); });
    root.addEventListener('focusout', () => { focus = false; pause(); });
    api.select(0, !auto);
    if (auto) {
      (async () => {
        let waited = 0;
        while (auto) {
          await fig.wait(200);
          if (!auto) break;
          if (hover || focus) continue;
          waited += 200;
          if (waited >= dur) { waited = 0; api.select(cur + 1, false); }
        }
      })();
    }
    return api;
  }

  /* ---------- versus: a bar wipes between the plain text and the answer UIs ---------- */
  B.figure('dynamic-uis-versus', (el, fig) => {
    const frame = $('[data-frame]', el);
    const bar = $('[data-bar]', el);
    const btns = $$('[data-to]', el);
    let p = 50;
    let stopGlide = null;
    let touched = false;
    let drag = null;

    const words = (v) => {
      if (v >= 99.5) return 'All plain text';
      if (v <= 0.5) return 'All answer UIs';
      if (Math.abs(v - 50) < 0.5) return 'Half plain text, half answer UIs';
      return `${Math.round(v)}% plain text on the left, ${100 - Math.round(v)}% answer UIs on the right`;
    };
    function set(v) {
      p = clamp(v, 0, 100);
      frame.style.setProperty('--p', p.toFixed(2));
      bar.setAttribute('aria-valuenow', String(Math.round(p)));
      bar.setAttribute('aria-valuetext', words(p));
      for (const b of btns) b.setAttribute('aria-pressed', String(!stopGlide && Math.abs(p - Number(b.dataset.to)) < 0.5));
    }
    /** Moves the bar to `to` over `ms` (at once under reduced motion); resolves when it is there or was stopped. */
    function glide(to, ms) {
      stopGlide?.();
      return new Promise((resolve) => {
        if (fig.reduced || !ms || p === to) { set(to); resolve(); return; }
        const from = p;
        let t = 0;
        const end = (arrived) => {
          stop();
          stopGlide = null;
          if (arrived) set(to);
          else set(p);
          resolve();
        };
        const stop = fig.loop((dt) => {
          t += dt;
          const k = Math.min(1, t / ms);
          set(from + (to - from) * ease(k));
          if (k >= 1) end(true);
        });
        stopGlide = () => end(false);
      });
    }
    const touch = () => { touched = true; stopGlide?.(); };
    const at = (e) => { const r = frame.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * 100; };

    el.addEventListener('pointerdown', touch);
    el.addEventListener('keydown', touch);
    frame.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, on: e.pointerType === 'mouse' };
      if (drag.on) { frame.setPointerCapture(e.pointerId); frame.classList.add('drag'); set(at(e)); }
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) {
        // A finger: a sideways drag is the bar's, an upward or downward one scrolls the page (touch-action).
        if (Math.abs(e.clientX - drag.x) < 5) return;
        drag.on = true;
        frame.classList.add('drag');
      }
      set(at(e));
    });
    const release = (e, tap) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (tap && !drag.on) set(at(e));
      drag = null;
      frame.classList.remove('drag');
    };
    frame.addEventListener('pointerup', (e) => release(e, true));
    frame.addEventListener('pointercancel', (e) => release(e, false));
    frame.addEventListener('lostpointercapture', (e) => release(e, false));

    bar.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -10, PageUp: 10 }[e.key];
      let v = null;
      if (step) v = p + step;
      else if (e.key === 'Home') v = 0;
      else if (e.key === 'End') v = 100;
      if (v === null) return;
      e.preventDefault();
      set(Math.round(v / 5) * 5);
    });
    for (const b of btns) b.addEventListener('click', () => { touch(); glide(Number(b.dataset.to), 700); });

    set(50);
    if (fig.reduced) return;
    set(100);
    (async () => {
      await fig.wait(1200);
      if (touched) return;
      await glide(0, 1800);
      if (touched) return;
      await fig.wait(1400);
      if (touched) return;
      await glide(50, 1200);
    })();
  });

  /* ---------- stream: the block as the agent writes it, the card as it is drawn ---------- */
  B.figure('dynamic-uis-stream', (el, fig) => {
    const root = $('.dus', el);
    const v = $('video', el);
    const out = $('[data-out]', el);
    const pre = $('.dus-pre', el);
    const lines = $('[data-src]', el).textContent.trim().split('\n');
    const first = lines[0];
    const last = lines[lines.length - 1];
    const json = lines.slice(1, -1).join('\n');
    const start = Number(v.dataset.start) || 0;
    const end = Number(v.dataset.end) || 1;

    // The strings of the JSON, found once: a string followed by a colon is a key.
    const toks = [];
    for (const m of json.matchAll(/"(?:[^"\\]|\\.)*"/g)) toks.push({ s: m.index, e: m.index + m[0].length, key: json[m.index + m[0].length] === ':' });
    const node = (text, cls) => {
      if (!cls) return document.createTextNode(text);
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      return s;
    };
    let shown = '';
    /** Draws the block as it is at video time t: the opening line, a share of the JSON, and (once the time is up) the closing fence. */
    function render(t) {
      const done = t >= end;
      const n = done ? json.length : t <= start ? 0 : Math.floor(((t - start) / (end - start)) * json.length);
      const key = n + (done ? 'x' : '');
      if (key === shown) return;
      shown = key;
      const parts = [node(first, 'dus-fence')];
      if (n > 0) parts.push(document.createTextNode('\n'));
      let pos = 0;
      for (const k of toks) {
        if (k.s >= n) break;
        if (k.s > pos) parts.push(node(json.slice(pos, k.s)));
        parts.push(node(json.slice(k.s, Math.min(k.e, n)), k.key ? 'dus-k' : 'dus-s'));
        pos = k.e;
      }
      if (pos < n) parts.push(node(json.slice(pos, n)));
      if (done) parts.push(document.createTextNode('\n'), node(last, 'dus-fence'));
      out.replaceChildren(...parts);
      root.classList.toggle('done', done);
      pre.scrollTop = done && fig.reduced ? 0 : pre.scrollHeight;
    }
    let replaying = !fig.reduced; // under reduced motion the text follows the video only while the reader plays it
    const finish = () => { root.classList.remove('grows'); render(Infinity); };

    let gen = 0;
    let holding = false;
    const play = () => {
      const r = v.play();
      if (r && r.catch) r.catch((e) => { if (e && e.name === 'NotSupportedError') finish(); });
    };
    v.addEventListener('error', finish, true); // a source the browser cannot play: the whole text shows
    v.addEventListener('ended', async () => {
      replaying = !fig.reduced;
      finish();
      if (fig.reduced) return;
      const g = ++gen;
      holding = true;
      await fig.wait(2500);
      if (g !== gen) return;
      holding = false;
      v.currentTime = 0;
      play();
    });
    $('[data-replay]', el).addEventListener('click', () => {
      gen++;
      holding = false;
      shown = '';
      replaying = true;
      v.currentTime = 0;
      play();
    });

    // The text follows the video's clock, a frame at a time while the figure is on screen.
    fig.loop(() => {
      if (!replaying) return;
      render(v.currentTime);
      root.classList.toggle('grows', !v.paused && v.currentTime < end);
    });
    if (fig.reduced) {
      v.controls = true;
      finish();
      return;
    }
    render(0);
    fig.on('show', () => { if (!holding && !fig.reduced) play(); });
    fig.on('hide', () => v.pause());
    if (fig.visible) play();
  });

  /* ---------- kinds: five requests, five cards ---------- */
  B.figure('dynamic-uis-kinds', (el, fig) => {
    const root = $('.duk', el);
    const imgs = $$('.duk-img', el);
    const shots = $('.duk-shots', el);
    const note = $('[data-note]', el);
    const req = $('[data-req]', el);
    const tabs = $$('.duk-tab', el);
    const list = $('.duk-tabs', el);
    for (const im of imgs) im.loading = 'eager'; // the others are hidden: fetch them now, so a switch shows at once
    tabList(fig, {
      root,
      tabs,
      panel: $('.duk-panel', el),
      dur: 7000,
      show(i, byUser) {
        imgs.forEach((im, k) => {
          im.classList.toggle('on', k === i);
          im.setAttribute('aria-hidden', String(k !== i));
        });
        note.textContent = imgs[i].dataset.note;
        req.textContent = $('span', tabs[i]).textContent;
        shots.scrollTop = 0;
        // In the row of a phone, the chosen tab stays in view (the page itself is left where it is).
        if (list.scrollWidth > list.clientWidth) {
          const t = tabs[i];
          list.scrollTo({ left: t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2, behavior: fig.reduced || !byUser ? 'auto' : 'smooth' });
        }
      },
    });
  });

  /* ---------- use: four clips, one at a time ---------- */
  B.figure('dynamic-uis-use', (el, fig) => {
    const clips = $$('.duu-clip', el);
    const note = $('[data-note]', el);
    let auto = !fig.reduced;
    let gen = 0;
    let holding = false;
    let list;
    const cur = () => clips[list ? list.cur : 0];
    const play = (c) => {
      if (fig.reduced || !fig.visible) return;
      const r = c.play();
      if (r && r.catch) r.catch(() => {});
    };
    list = tabList(fig, {
      root: $('.duu', el),
      tabs: $$('.duu-tab', el),
      panel: $('.duu-panel', el),
      show(i) {
        gen++;
        holding = false;
        clips.forEach((c, k) => {
          const on = k === i;
          c.classList.toggle('on', on);
          c.setAttribute('aria-hidden', String(!on));
          c.tabIndex = on && fig.reduced ? 0 : -1;
          if (!on) {
            c.pause();
            if (c.readyState > 0) c.currentTime = 0;
          }
        });
        note.textContent = clips[i].dataset.note;
        const c = clips[i];
        if (c.readyState > 0) c.currentTime = 0;
        play(c);
      },
    });
    clips.forEach((c, i) => {
      if (fig.reduced) c.controls = true;
      c.addEventListener('ended', async () => {
        if (fig.reduced || c !== cur()) return;
        const g = ++gen;
        holding = true;
        await fig.wait(1600);
        if (g !== gen) return;
        holding = false;
        // Round and round until the reader picks a tab; then the picked clip repeats.
        if (auto) list.select(i + 1, false);
        else { c.currentTime = 0; play(c); }
      });
    });
    // The reader's pick ends the round (the tabs' own handlers stop their auto-advance; this one is the clips').
    $$('.duu-tab', el).forEach((t) => {
      t.addEventListener('click', () => { auto = false; });
      t.addEventListener('keydown', (e) => { if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) auto = false; });
    });
    if (fig.reduced) return;
    fig.on('show', () => { if (!holding) play(cur()); });
    fig.on('hide', () => cur().pause());
  });

  /* ---------- session: eight parts of one screen ---------- */
  B.figure('dynamic-uis-session', (el, fig) => {
    const box = $('[data-box]', el);
    const dots = $$('.dua-dot', el);
    const notes = $$('.dua-note', el);
    const REST = 6; // Approvals
    let touched = false;
    let cur = -1;
    function activate(i) {
      cur = i;
      const d = dots[i];
      for (const k of ['--x', '--y', '--w', '--h']) box.style.setProperty(k, d.style.getPropertyValue(k));
      box.classList.add('on');
      dots.forEach((x, k) => { x.classList.toggle('is-active', k === i); x.setAttribute('aria-pressed', String(k === i)); });
      notes.forEach((x, k) => { x.classList.toggle('is-active', k === i); x.setAttribute('aria-pressed', String(k === i)); });
    }
    const pick = (i) => { touched = true; if (i !== cur) activate(i); };
    dots.forEach((d, i) => {
      for (const ev of ['mouseenter', 'focus', 'click']) d.addEventListener(ev, () => pick(i));
    });
    notes.forEach((n, i) => {
      for (const ev of ['mouseenter', 'focus', 'click']) n.addEventListener(ev, () => pick(i));
    });
    el.addEventListener('pointerdown', () => { touched = true; });
    el.addEventListener('keydown', () => { touched = true; });

    if (fig.reduced) { activate(REST); return; }
    activate(0);
    (async () => {
      for (let i = 1; i < dots.length; i++) {
        await fig.wait(2200);
        if (touched) return;
        activate(i);
      }
      await fig.wait(2200);
      if (!touched) activate(REST);
    })();
  });

  /* ---------- more: three ways to read what an agent made ---------- */
  B.figure('dynamic-uis-more', (el, fig) => {
    const imgs = $$('.dum-img', el);
    const line = $('[data-line]', el);
    tabList(fig, {
      root: $('.dum', el),
      tabs: $$('.dum-tab', el),
      panel: $('.dum-panel', el),
      dur: 6000,
      show(i) {
        imgs.forEach((im, k) => {
          im.classList.toggle('on', k === i);
          im.setAttribute('aria-hidden', String(k !== i));
        });
        line.textContent = imgs[i].alt;
      },
    });
  });
})();
