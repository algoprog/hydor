/* How Hydor remembers: the code of the post's seven figures (parts, timeline, hybrid, stands-out, codebook,
   lifecycle, budgets). Each one registers with HydorBlog.figure and runs when it first nears the screen. */
(() => {
  'use strict';
  if (!window.HydorBlog) return;

  const $ = (s, el) => el.querySelector(s);
  const $$ = (s, el) => Array.from(el.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const html = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const press = (btns, on) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b === on)));

  /* ---------- parts: what flows where ---------- */
  HydorBlog.figure('how-hydor-remembers-parts', (el, fig) => {
    const root = $('.hr-p', el);
    const lit = (...names) => {
      ['helper', 'cards', 'agent'].forEach((n) => root.classList.toggle('is-lit-' + n, names.includes(n)));
    };
    const flow = (inn, out) => {
      root.classList.toggle('flow-in', inn);
      root.classList.toggle('flow-out', out);
    };
    if (fig.reduced) {
      lit('helper', 'cards', 'agent');
      return;
    }
    (async () => {
      for (;;) {
        lit();
        flow(false, false);
        await fig.wait(900);
        lit('helper');
        flow(true, false);
        await fig.wait(2600);
        lit('cards');
        await fig.wait(2000);
        flow(false, true);
        await fig.wait(2200);
        lit('agent');
        await fig.wait(2400);
        lit();
        flow(false, false);
        await fig.wait(1400);
      }
    })();
  });

  /* ---------- timeline: a session's moments ---------- */
  HydorBlog.figure('how-hydor-remembers-timeline', (el, fig) => {
    const btns = $$('.fig-btn', el);
    const steps = $$('.hr-tl-step', el);
    const nodes = $$('.hr-tl-n', el);
    const head = $('.hr-tl-head', el);
    let touched = false;
    const show = (i) => {
      press(btns, btns[i]);
      steps.forEach((s, k) => (s.hidden = k !== i));
      nodes.forEach((n, k) => n.classList.toggle('is-on', k === i));
      head.style.left = ((i + 0.5) / 5) * 100 + '%';
      head.dataset.n = String(i + 1);
    };
    btns.forEach((b, i) =>
      b.addEventListener('click', () => {
        touched = true;
        show(i);
      }),
    );
    const panel = $('.hr-tl-panel', el);
    // On a wide figure the panel keeps the height of its tallest step, so the page does not jump as the playhead moves.
    const fit = () => {
      panel.style.minHeight = '';
      if (el.clientWidth < 800) return;
      let max = 0;
      steps.forEach((s) => {
        const was = s.hidden;
        s.hidden = false;
        max = Math.max(max, s.offsetHeight);
        s.hidden = was;
      });
      panel.style.minHeight = max + 'px';
    };
    let lastW = el.clientWidth;
    new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - lastW) > 2) {
        lastW = el.clientWidth;
        fit();
      }
    }).observe(el);
    head.style.transition = 'none';
    show(0);
    fit();
    requestAnimationFrame(() => (head.style.transition = ''));
    if (fig.reduced) return;
    (async () => {
      let i = 0;
      for (;;) {
        await fig.wait(i === 0 ? 5200 : 5600);
        if (touched) return;
        i = (i + 1) % 5;
        show(i);
      }
    })();
  });

  /* ---------- hybrid: three lists, fused by rank ---------- */
  HydorBlog.figure('how-hydor-remembers-hybrid', (el, fig) => {
    // Eight example notes: age in days and look-ups are made up, to show the boost.
    const NOTES = {
      1: { text: 'Vegetarian, and loves Portuguese food', short: 'Vegetarian, Portuguese food', age: 200, hits: 1 },
      2: { text: 'Payments go through Stripe', short: 'Payments go through Stripe', age: 150, hits: 0 },
      3: { text: 'Likes short answers with a clear pick', short: 'Short answers, clear pick', age: 14, hits: 6 },
      4: { text: 'Prefers walking to taxis', short: 'Prefers walking to taxis', age: 60, hits: 0 },
      5: { text: 'Tests run with npm test', short: 'Tests run with npm test', age: 2, hits: 5 },
      6: { text: 'Retries live in server/queue/worker.ts', short: 'Retries in worker.ts', age: 5, hits: 2 },
      7: { text: 'The staging server is only up on weekdays', short: 'Staging up on weekdays', age: 120, hits: 0 },
      8: { text: 'Deploys go out on Tuesdays, never Fridays', short: 'Deploys on Tuesdays', age: 90, hits: 0 },
    };
    // Each request: its three ranked lists, best first (made up for the example).
    const REQS = [
      { words: [], meaning: [[3, 0.52], [4, 0.27], [1, 0.22], [8, 0.21]], exact: [] },
      { words: [[2, 'Stripe']], meaning: [[5, 0.33], [2, 0.31], [8, 0.27], [7, 0.24]], exact: [] },
      { words: [[6, 'server, queue, worker']], meaning: [[8, 0.33], [5, 0.31], [6, 0.29], [7, 0.25]], exact: [[6, 'server/queue/worker.ts']] },
    ];
    const W = { words: 0.1, meaning: 1, exact: 1 };
    const K = 60;
    const boost = (n) => 1 + 0.3 * Math.exp(-n.age / 90) + 0.2 * Math.min(1, Math.log2(1 + n.hits) / 6);

    const reqBtns = $$('[data-req]', el);
    const boostBtn = $('[data-boost]', el);
    const rowsBox = $('.hr-hy-rows', el);
    const lists = { words: $('[data-list="words"]', el), meaning: $('[data-list="meaning"]', el), exact: $('[data-list="exact"]', el) };
    const rows = {};
    for (const id in NOTES) {
      const r = html('div', 'hr-hy-row is-gone');
      const b = html('b');
      b.append(html('em', null, ''), html('span', null, NOTES[id].text));
      r.append(b, html('small'));
      rowsBox.append(r);
      rows[id] = r;
    }
    let cur = 0;
    let on = false;
    let first = true;
    let touched = false;

    const render = () => {
      const q = REQS[cur];
      const parts = {};
      const add = (kind, id, r) => (parts[id] = parts[id] || []).push({ kind, r });
      const fill = (kind, label) => {
        const box = lists[kind];
        box.replaceChildren();
        const items = q[kind];
        if (!items.length) {
          box.append(html('div', 'hr-hy-empty', kind === 'words' ? 'No word in common with any note.' : kind === 'exact' ? 'No file name, function or version in the request.' : 'Nothing alike.'));
          return;
        }
        items.forEach(([id, detail], i) => {
          add(kind, id, i + 1);
          const it = html('div', 'hr-hy-item');
          const body = html('span');
          body.append(document.createTextNode(NOTES[id].short));
          body.append(html('small', null, label(detail)));
          it.append(html('em', null, String(i + 1)), body);
          box.append(it);
        });
      };
      fill('words', (d) => 'matches: ' + d);
      fill('meaning', (d) => 'cosine ' + d.toFixed(2));
      fill('exact', (d) => d);
      const scored = Object.keys(parts).map((id) => {
        const p = parts[id];
        const raw = p.reduce((s, x) => s + W[x.kind] / (K + x.r), 0);
        const f = on ? boost(NOTES[id]) : 1;
        return { id, p, raw, f, score: raw * f };
      });
      scored.sort((a, b) => b.score - a.score || a.id - b.id);
      rowsBox.classList.toggle('has-boost', on);
      const rowH = rows[1].offsetHeight || 66;
      const gap = 6;
      rowsBox.style.height = Math.max(scored.length, 1) * (rowH + gap) + 'px';
      const shown = new Set(scored.map((s) => s.id));
      scored.forEach((s, i) => {
        const r = rows[s.id];
        r.classList.remove('is-gone');
        r.classList.toggle('is-top', i === 0);
        $('em', r).textContent = s.score.toFixed(4);
        const terms = s.p.map((x) => (W[x.kind] === 1 ? '1' : String(W[x.kind])) + '/(60+' + x.r + ')').join(' + ');
        const small = $('small', r);
        const n = NOTES[s.id];
        small.replaceChildren(html('span', null, terms + ' = ' + s.raw.toFixed(5)));
        if (on) small.append(html('span', null, '× ' + s.f.toFixed(2) + ' · changed ' + n.age + ' d ago, looked up ' + n.hits + '×'));
        r.style.transform = 'translateY(' + i * (rowH + gap) + 'px)';
      });
      for (const id in rows) {
        if (!shown.has(id)) {
          rows[id].classList.add('is-gone');
          rows[id].classList.remove('is-top');
          rows[id].style.transform = 'translateY(' + scored.length * (rowH + gap) + 'px)';
        }
      }
    };
    const pick = (i, byHand) => {
      if (byHand) touched = true;
      cur = i;
      press(reqBtns, reqBtns[i]);
      render();
    };
    reqBtns.forEach((b, i) => b.addEventListener('click', () => pick(i, true)));
    boostBtn.addEventListener('click', () => {
      touched = true;
      on = !on;
      boostBtn.setAttribute('aria-pressed', String(on));
      boostBtn.textContent = 'Recency and look-ups: ' + (on ? 'on' : 'off');
      render();
    });
    rowsBox.style.transition = 'none';
    Object.values(rows).forEach((r) => (r.style.transition = 'none'));
    render();
    requestAnimationFrame(() => requestAnimationFrame(() => Object.values(rows).forEach((r) => (r.style.transition = ''))));
    let lastW = el.clientWidth;
    new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - lastW) > 2) {
        lastW = el.clientWidth;
        render();
      }
    }).observe(el);
    if (fig.reduced) return;
    (async () => {
      for (;;) {
        await fig.wait(6500);
        if (touched) return;
        pick((cur + 1) % REQS.length, false);
      }
    })();
  });

  /* ---------- stands-out: a fixed cut against the bulk ---------- */
  HydorBlog.figure('how-hydor-remembers-stands-out', (el, fig) => {
    const N = 88;
    const TRIM = 0.05;
    const Z = 2.3;
    const FIXED = 0.3;
    const BIN = 0.02;
    const XMAX = 0.8;
    // Inverse normal CDF (Abramowitz and Stegun 26.2.23): the notes' similarities are spread like a bell, made up for the example.
    const nq = (p) => {
      const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
      const x = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
      return p < 0.5 ? -x : x;
    };
    const make = (mean, sd, rel) => {
      const B = N - rel.length;
      const a = [];
      for (let i = 0; i < B; i++) a.push(mean + sd * nq(0.03 + (0.94 * (i + 0.5)) / B));
      a.push(...rel);
      return a.sort((x, y) => x - y);
    };
    const bulkOf = (a) => {
      const keep = Math.max(1, a.length - Math.floor(a.length * TRIM));
      let s = 0;
      let q = 0;
      for (let i = 0; i < keep; i++) {
        s += a[i];
        q += a[i] * a[i];
      }
      const mean = s / keep;
      return { mean, sd: Math.sqrt(Math.max(0, q / keep - mean * mean)) };
    };
    const SETS = [
      { name: 'short question', a: make(0.2, 0.0385, [0.286, 0.293, 0.298]) },
      { name: 'long brief', a: make(0.44, 0.069, [0.6, 0.635, 0.68]) },
    ];
    SETS.forEach((s) => Object.assign(s, bulkOf(s.a), { cut: 0 }));
    SETS.forEach((s) => (s.cut = s.mean + Z * s.sd));

    const chart = $('.hr-so-chart', el);
    const read = $('.hr-so-read', el);
    const reqBtns = $$('[data-req]', el);
    const modeBtns = $$('[data-mode]', el);
    let req = 0;
    let mode = 'fixed';
    let touched = false;
    let g = null;

    // Stack of each dot in its bin: the same for the dots' order in both sets (dot i is the i-th lowest).
    const stacks = SETS.map((s) => {
      const count = {};
      return s.a.map((v) => {
        const b = Math.floor(v / BIN);
        count[b] = (count[b] || 0) + 1;
        return { b, k: count[b] - 1 };
      });
    });
    const maxStack = Math.max(...stacks.map((st) => Math.max(...st.map((x) => x.k + 1))));

    const build = () => {
      const w = Math.max(280, chart.clientWidth);
      const r = w < 480 ? 2.8 : 3.2;
      const step = r * 2 + 0.9;
      const top = 34;
      const H = top + maxStack * step + 40;
      const pad = 8;
      const X = (v) => pad + (v / XMAX) * (w - pad * 2);
      const base = top + maxStack * step;
      chart.replaceChildren();
      const s = svg('svg', { viewBox: '0 0 ' + w + ' ' + H, width: w, height: H, 'aria-hidden': 'true' }, chart);
      s.style.height = H + 'px';
      const band = svg('rect', { class: 'hr-so-band', x: 0, y: top - 12, height: base - top + 12, width: 0 }, s);
      svg('line', { class: 'hr-so-ax', x1: 0, x2: w, y1: base + 4, y2: base + 4 }, s);
      [0, 0.2, 0.4, 0.6, 0.8].forEach((t) => {
        svg('line', { class: 'hr-so-ax', x1: X(t), x2: X(t), y1: base + 4, y2: base + 9 }, s);
        const tx = svg('text', { class: 'hr-so-tick', x: X(t), y: base + 23, 'text-anchor': t === 0 ? 'start' : t === XMAX ? 'end' : 'middle' }, s);
        tx.textContent = t === 0 ? '0' : t.toFixed(1);
      });
      const cap = svg('text', { class: 'hr-so-tick', x: w / 2, y: H - 2, 'text-anchor': 'middle' }, s);
      cap.textContent = w < 480 ? 'cosine to the request' : 'how alike a note is to the request (cosine)';
      const mk = (cls, color, dash) => {
        const gg = svg('g', { class: cls }, s);
        svg('line', { class: 'hr-so-line', x1: 0, x2: 0, y1: top - 12, y2: base + 4, stroke: color, 'stroke-dasharray': dash || '' }, gg);
        const t = svg('text', { class: 'hr-so-lbl', x: 0, y: top - 18, 'text-anchor': 'middle', fill: color }, gg);
        return { g: gg, t };
      };
      const fixed = mk('hr-so-fixed', '#f2b468', '4 4');
      const meanL = mk('hr-so-mean', '#8aa8ff', '3 4');
      const cutL = mk('hr-so-cut', '#5eead4', '');
      fixed.g.style.transform = 'translateX(' + X(FIXED) + 'px)';
      fixed.t.textContent = 'fixed cut 0.30';
      fixed.t.style.fill = '#f2b468';
      const dots = SETS[0].a.map(() => {
        const c = svg('circle', { class: 'hr-so-dot', r }, s);
        return c;
      });
      const rings = [0, 1, 2, 3].map(() => svg('circle', { r: r + 2.4, fill: 'none', stroke: '#8f99ab', 'stroke-width': 1.2, 'stroke-dasharray': '2 2' }, s));
      rings.forEach((c) => (c.style.opacity = 0, c.style.transition = 'transform .9s cubic-bezier(.22,1,.36,1), opacity .5s'));
      g = { w, r, step, base, X, dots, rings, band, fixed, meanL, cutL, top };
    };

    const apply = () => {
      if (!g) return;
      const set = SETS[req];
      const st = stacks[req];
      const z = mode === 'z';
      let passes = 0;
      set.a.forEach((v, i) => {
        const x = g.X((st[i].b + 0.5) * BIN);
        const y = g.base - g.r - st[i].k * g.step;
        const d = g.dots[i];
        d.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        const pass = z ? v >= set.cut : v >= FIXED;
        if (pass) passes++;
        d.classList.toggle('is-pass', pass);
        if (i >= N - 4) {
          const ring = g.rings[N - 1 - i];
          ring.style.transform = 'translate(' + x + 'px,' + y + 'px)';
          ring.style.opacity = z ? 1 : 0;
        }
      });
      g.fixed.g.style.opacity = z ? 0 : 1;
      g.meanL.g.style.opacity = z ? 1 : 0;
      g.cutL.g.style.opacity = z ? 1 : 0;
      g.band.setAttribute('opacity', z ? 1 : 0);
      const bx0 = g.X(Math.max(0, set.mean - set.sd));
      const bx1 = g.X(set.mean + set.sd);
      g.band.style.transform = 'translateX(' + bx0 + 'px)';
      g.band.setAttribute('width', bx1 - bx0);
      g.meanL.g.style.transform = 'translateX(' + g.X(set.mean) + 'px)';
      g.meanL.t.textContent = 'mean ' + set.mean.toFixed(2);
      g.cutL.g.style.transform = 'translateX(' + g.X(set.cut) + 'px)';
      g.cutL.t.textContent = 'bar ' + set.cut.toFixed(2);
      // The mean's label sits left of its line, the bar's and the fixed cut's right of theirs (the bar's left of it near the edge).
      g.meanL.t.setAttribute('x', -4);
      g.meanL.t.setAttribute('text-anchor', 'end');
      const nearEdge = g.X(set.cut) > g.w - 80;
      g.cutL.t.setAttribute('x', nearEdge ? -4 : 4);
      g.cutL.t.setAttribute('text-anchor', nearEdge ? 'end' : 'start');
      g.fixed.t.setAttribute('x', 4);
      g.fixed.t.setAttribute('text-anchor', 'start');
      const f = (n) => n.toFixed(2);
      let msg;
      if (!z) {
        msg =
          '<b>A fixed cut at 0.30 takes ' + passes + ' of ' + N + ' notes.</b> ' +
          (req === 0
            ? 'A short question is alike to few notes, so nothing reaches 0.30, and the three that bear on it are missed.'
            : 'A long brief is alike to every note, so every note passes, and the three that bear on it are lost among them.');
      } else {
        msg =
          '<b>Stands out takes ' + passes + ' of ' + N + '.</b> The bulk of the notes (without the best 5%) has a mean of ' + f(set.mean) + ' and a spread of ' + f(set.sd) +
          ', so the bar sits at ' + f(set.cut) + ': ' + Z + ' spreads above the mean. The same three pass, whatever the request.';
      }
      read.innerHTML = msg;
      $('.hr-so-keyring', el).classList.toggle('is-off', !z);
    };

    const setReq = (i, hand) => {
      if (hand) touched = true;
      req = i;
      press(reqBtns, reqBtns[i]);
      apply();
    };
    const setMode = (m, hand) => {
      if (hand) touched = true;
      mode = m;
      press(modeBtns, modeBtns.find((b) => b.dataset.mode === m));
      apply();
    };
    reqBtns.forEach((b, i) => b.addEventListener('click', () => setReq(i, true)));
    modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode, true)));

    build();
    // Draw the first state without moving, then let changes move.
    $$('.hr-so-dot', chart).forEach((d) => (d.style.transition = 'none'));
    apply();
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.hr-so-dot', chart).forEach((d) => (d.style.transition = ''))));
    let lastW = chart.clientWidth;
    new ResizeObserver(() => {
      if (Math.abs(chart.clientWidth - lastW) > 2) {
        lastW = chart.clientWidth;
        build();
        $$('.hr-so-dot', chart).forEach((d) => (d.style.transition = 'none'));
        apply();
        requestAnimationFrame(() => requestAnimationFrame(() => $$('.hr-so-dot', chart).forEach((d) => (d.style.transition = ''))));
      }
    }).observe(chart);
    if (fig.reduced) {
      setMode('z', false);
      return;
    }
    (async () => {
      const script = [[0, 'fixed', 4200], [0, 'z', 5200], [1, 'z', 4200], [1, 'fixed', 5200]];
      for (;;) {
        for (const [r, m, ms] of script) {
          if (touched) return;
          setReq(r, false);
          setMode(m, false);
          await fig.wait(ms);
        }
      }
    })();
  });

  /* ---------- codebook: 768 numbers snap to 16 levels ---------- */
  HydorBlog.figure('how-hydor-remembers-codebook', (el, fig) => {
    const NB_MAX = 32;
    // Max's 16-level quantiser for a unit bell: reconstruction levels, closer together near zero (an illustration;
    // the app's levels are fitted for each dimension).
    const half = [0.1284, 0.3881, 0.6568, 0.9424, 1.2562, 1.618, 2.069, 2.7326];
    const LEVELS = [...half.map((x) => -x).reverse(), ...half];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const raw = Array.from({ length: NB_MAX }, () => Math.max(-2.9, Math.min(2.9, gauss() * 1.05)));
    const snap = raw.map((v) => {
      let bi = 0;
      LEVELS.forEach((l, i) => {
        if (Math.abs(l - v) < Math.abs(LEVELS[bi] - v)) bi = i;
      });
      return bi;
    });
    const chart = $('.hr-cb-chart', el);
    const btns = $$('[data-state]', el);
    const bytes = $('[data-bytes]', el);
    const note = $('[data-bytes-note]', el);
    const count = $('.hr-cb-count', el);
    let g = null;
    let NB = NB_MAX;
    let k = 0; // 0 full precision … 1 four bits
    let target = 0;
    let touched = false;

    const build = () => {
      const w = Math.max(280, chart.clientWidth);
      NB = w < 480 ? 24 : NB_MAX;
      const sc = 31;
      const y0 = 4 + 2.95 * sc;
      const H = y0 + 2.95 * sc + 30;
      const bw = w / NB;
      chart.replaceChildren();
      const s = svg('svg', { viewBox: '0 0 ' + w + ' ' + H, width: w, height: H, 'aria-hidden': 'true' }, chart);
      s.style.height = H + 'px';
      const lv = LEVELS.map((l) => svg('line', { class: 'hr-cb-lvl', x1: 0, x2: w, y1: y0 - l * sc, y2: y0 - l * sc }, s));
      svg('line', { class: 'hr-cb-zero', x1: 0, x2: w, y1: y0, y2: y0 }, s);
      const bars = raw.slice(0, NB).map((_, i) => svg('rect', { class: 'hr-cb-bar', x: i * bw + bw * 0.2, width: bw * 0.6, rx: 1.5 }, s));
      const codes = raw.slice(0, NB).map((_, i) => {
        const t = svg('text', { class: 'hr-cb-code', x: i * bw + bw / 2, y: y0 + 2.95 * sc + 20 }, s);
        t.textContent = snap[i].toString(16).toUpperCase();
        return t;
      });
      const lab = svg('text', { class: 'hr-cb-note', x: w - 2, y: y0 - 2.75 * sc - 6, 'text-anchor': 'end' }, s);
      lab.textContent = '16 levels, closer together near zero';
      g = { sc, y0, lv, bars, codes, lab };
    };
    const draw = () => {
      if (!g) return;
      const e = ease(k);
      raw.slice(0, NB).forEach((v, i) => {
        const val = v + (LEVELS[snap[i]] - v) * e;
        const h = Math.abs(val) * g.sc;
        const b = g.bars[i];
        b.setAttribute('height', Math.max(0.5, h));
        b.setAttribute('y', val >= 0 ? g.y0 - h : g.y0);
        b.classList.toggle('is-snap', e > 0.5);
        g.codes[i].setAttribute('opacity', Math.max(0, (e - 0.5) * 2));
      });
      g.lv.forEach((l) => l.setAttribute('opacity', e));
      g.lab.setAttribute('opacity', e);
      const n = Math.round(3072 + (384 - 3072) * e);
      bytes.textContent = n.toLocaleString('en-US') + ' bytes';
      note.textContent = e < 0.5 ? '768 numbers × 4 bytes' : '768 numbers × 4 bits';
      count.classList.toggle('is-small', e > 0.97);
    };
    const go = (t, hand) => {
      if (hand) touched = true;
      target = t;
      press(btns, btns[t]);
      if (fig.reduced) {
        k = t;
        draw();
      }
    };
    btns.forEach((b, i) => b.addEventListener('click', () => go(i, true)));
    build();
    draw();
    let lastW = chart.clientWidth;
    new ResizeObserver(() => {
      if (Math.abs(chart.clientWidth - lastW) > 2) {
        lastW = chart.clientWidth;
        build();
        draw();
      }
    }).observe(chart);
    fig.loop((dt) => {
      if (k === target) return;
      const dir = Math.sign(target - k);
      k += (dir * dt) / 1100;
      if (dir > 0 ? k >= target : k <= target) k = target;
      draw();
    });
    if (fig.reduced) {
      go(1, false);
      return;
    }
    (async () => {
      for (;;) {
        await fig.wait(2600);
        if (touched) return;
        go(1, false);
        await fig.wait(5200);
        if (touched) return;
        go(0, false);
      }
    })();
  });

  /* ---------- lifecycle: a note's life ---------- */
  HydorBlog.figure('how-hydor-remembers-lifecycle', (el, fig) => {
    const CAP = {
      saved: ['Saved.', 'An agent, you or the helper writes one fact, in one place: about you, a project or a session. Text that looks like a secret is refused.'],
      anchored: ['Anchored to its files.', 'A project note that names files is tied to them in the project’s Git repository, with the commit it was written against.'],
      given: ['Given.', 'At the start, with a message, or when a file in its area is opened, but only when it bears on what the agent is doing.'],
      used: ['Used.', 'An agent looks it up, cites it by its number, or works on a file or a name it holds. Notes no agent has needed for four months are offered to you to keep or delete.'],
      changed: ['Its files change.', 'Every ten minutes Hydor looks at whether the files a note names have changed since it was written.'],
      flagged: ['Flagged.', 'The note’s dialog shows <b>In the code</b>, and agents who are given it see “may be out of date” with those files.'],
      rechecked: ['Re-checked by the helper.', 'In the next tidy-up the helper reads each flagged note, up to 20, with the change to its files.'],
      kept: ['Kept.', 'Still true. It is marked checked against the code.'],
      fixed: ['Fixed.', 'Partly out of date: its text is updated to the code.'],
      deleted: ['Deleted.', 'No longer true. A deleted note stays 30 days and can be restored.'],
      merged: ['Merged into a topic.', 'Notes that say the same become one. In a place with many notes, related ones are summed up in a topic: agents get the topic and can still look up the notes.'],
      moved: ['Moved to its project.', 'A note about you that names a project goes to that project’s memory, as “About the project, not about you”. Undo moves it back.'],
      pointer: ['Replaced by a pointer into the wiki.', 'A long note that reads as history (a version, a date, several paths) is written into the wiki, and becomes a one-line pointer to the article that holds it.'],
      expired: ['Expires.', 'A note true only until a date stops being given after it, and moves to Deleted notes, where you can restore it for 30 days.'],
    };
    const WALK = [['saved'], ['anchored'], ['given'], ['used'], ['changed'], ['flagged'], ['rechecked'], ['kept', 'fixed', 'deleted'], ['merged'], ['moved'], ['pointer'], ['expired']];
    const nodes = {};
    $$('.hr-lc-n', el).forEach((n) => (nodes[n.dataset.id] = n));
    const cap = $('.hr-lc-cap', el);
    let touched = false;
    const show = (ids) => {
      for (const id in nodes) nodes[id].classList.toggle('is-on', ids.includes(id));
      cap.innerHTML =
        ids.length > 1
          ? '<b>Kept, fixed or deleted.</b> The helper decides: still true, it is marked checked against the code; partly out of date, its text is updated; no longer true, it is deleted (and can be restored for 30 days).'
          : '<b>' + CAP[ids[0]][0] + '</b> ' + CAP[ids[0]][1];
    };
    for (const id in nodes) {
      nodes[id].addEventListener('click', () => {
        touched = true;
        show([id]);
      });
    }
    show(['saved']);
    if (fig.reduced) return;
    (async () => {
      let i = 0;
      for (;;) {
        await fig.wait(i === 0 ? 2600 : 3200);
        if (touched) return;
        i = (i + 1) % WALK.length;
        show(WALK[i]);
        if (i === 0) await fig.wait(600);
      }
    })();
  });

  /* ---------- budgets: memory's share of a window ---------- */
  HydorBlog.figure('how-hydor-remembers-budgets', (el, fig) => {
    // Per row: the memory block as measured, additions with a message and a file touch (most), the checkpoint (most), in % of the window.
    const DATA = [
      { block: 5.1, chk: 8.0 },
      { block: 2.9, add: 0.7, chk: 8.0 },
      { block: 0.9, add: 0.3, chk: 2.0 },
    ];
    const MAX = 16;
    const rows = $$('.hr-bd-row', el);
    const place = (grown) => {
      rows.forEach((row, i) => {
        let left = 0;
        ['block', 'add', 'chk'].forEach((kind) => {
          const seg = $('.hr-bd-seg.' + kind, row);
          if (!seg) return;
          const v = DATA[i][kind] || 0;
          seg.style.left = (grown ? (left / MAX) * 100 : 0) + '%';
          seg.style.width = (grown ? (v / MAX) * 100 : 0) + '%';
          seg.style.transitionDelay = grown ? i * 160 + ['block', 'add', 'chk'].indexOf(kind) * 120 + 'ms' : '0ms';
          left += v;
        });
      });
    };
    if (fig.reduced) {
      place(true);
      return;
    }
    place(false);
    const grow = () => requestAnimationFrame(() => requestAnimationFrame(() => place(true)));
    if (fig.visible) grow();
    fig.on('hide', () => place(false));
    fig.on('show', grow);
  });
})();
