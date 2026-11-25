(() => {
  'use strict';
  const B = window.HydorBlog;
  if (!B) return;
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  /* ---------- home: pulses of light from each agent into the Ω, and on to the computer and the phone ---------- */
  B.figure('meet-hydor-home', (el, fig) => {
    const stage = el.querySelector('.mh-home');
    const svg = el.querySelector('.mh-lines');
    const ring = el.querySelector('.mh-ring');
    const chips = [...el.querySelectorAll('.mh-agents li')];
    const devs = [...el.querySelectorAll('.mh-dev')];
    let routes = [];

    const rel = (node) => {
      const r = node.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      return { l: r.left - s.left, r: r.right - s.left, t: r.top - s.top, b: r.bottom - s.top, cx: r.left - s.left + r.width / 2, cy: r.top - s.top + r.height / 2, w: r.width };
    };
    const curve = (a, b, horizontal) => {
      if (horizontal) {
        const k = Math.abs(b.x - a.x) * 0.55;
        return `M${a.x} ${a.y}C${a.x + k} ${a.y} ${b.x - k} ${b.y} ${b.x} ${b.y}`;
      }
      const k = Math.abs(b.y - a.y) * 0.55;
      return `M${a.x} ${a.y}C${a.x} ${a.y + k} ${b.x} ${b.y - k} ${b.x} ${b.y}`;
    };

    function build() {
      const s = stage.getBoundingClientRect();
      if (!s.width) return;
      svg.setAttribute('viewBox', `0 0 ${s.width} ${s.height}`);
      svg.replaceChildren();
      const o = rel(ring);
      const rad = o.w / 2;
      const horizontal = rel(chips[0]).r < o.l - 8;
      const unit = (x, y) => { const d = Math.hypot(x - o.cx, y - o.cy) || 1; return { x: o.cx + (x - o.cx) / d * rad, y: o.cy + (y - o.cy) / d * rad }; };
      routes = [];
      const lines = mk('g', {});
      const pulses = mk('g', {});
      svg.append(lines, pulses);
      chips.forEach((chip, i) => {
        const c = rel(chip);
        const a = horizontal ? { x: c.r, y: c.cy } : { x: c.cx, y: c.b };
        const b = unit(a.x, a.y);
        const color = getComputedStyle(chip).getPropertyValue('--c').trim() || '#38bdf8';
        add(curve(a, b, horizontal), color, 'in', i);
      });
      devs.forEach((dev, i) => {
        const c = rel(dev);
        const b = horizontal ? { x: c.l, y: c.cy } : { x: c.cx, y: c.t };
        const a = unit(b.x, b.y);
        add(curve(a, b, horizontal), '#38bdf8', 'out', i, dev);
      });
      function add(d, color, kind, i, dev) {
        const path = mk('path', { d, fill: 'none', stroke: color, 'stroke-opacity': kind === 'in' ? '.28' : '.4', 'stroke-width': '1.5' });
        lines.append(path);
        const dots = [];
        if (!fig.reduced) {
          for (let k = 0; k < 4; k++) {
            const halo = mk('circle', { r: k === 0 ? 9 : 5, fill: color, opacity: 0 });
            const core = mk('circle', { r: k === 0 ? 3.2 : 2.2, fill: kind === 'in' ? color : '#c9f6ff', opacity: 0 });
            pulses.append(halo, core);
            dots.push({ halo, core });
          }
        }
        const len = path.getTotalLength();
        const period = kind === 'in' ? 6200 + (i % 4) * 700 : 3800;
        const offset = kind === 'in' ? i * 760 : i * 1900;
        routes.push({ path, len, dots, kind, dev, period, offset, fired: false });
      }
    }

    build();
    if ('ResizeObserver' in window) new ResizeObserver(build).observe(stage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    if (fig.reduced) return;

    const travel = 0.34; // share of a period a pulse is on its way
    let clock = 0;
    const flash = (node, color) => {
      if (!node.animate) return;
      node.animate([{ filter: 'none' }, { filter: `drop-shadow(0 0 14px ${color})` }, { filter: 'none' }], { duration: 900, easing: 'ease-out' });
    };
    fig.loop((dt) => {
      clock += Math.min(dt, 64);
      for (const r of routes) {
        const p = (((clock + r.offset) % r.period) / r.period) / travel;
        const on = p <= 1;
        if (on && p > 0.96 && !r.fired) {
          r.fired = true;
          if (r.kind === 'in') flash(ring, 'rgb(56 189 248 / .55)');
          else if (r.dev) { r.dev.classList.add('hit'); setTimeout(() => r.dev.classList.remove('hit'), 900); }
        } else if (!on) r.fired = false;
        r.dots.forEach((d, k) => {
          const q = p - k * 0.05;
          if (!on || q < 0 || q > 1) { d.halo.setAttribute('opacity', 0); d.core.setAttribute('opacity', 0); return; }
          const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2; // eased
          const pt = r.path.getPointAtLength(e * r.len);
          const fade = Math.min(1, q * 8, (1 - q) * 5) * (1 - k * 0.25);
          d.halo.setAttribute('cx', pt.x); d.halo.setAttribute('cy', pt.y); d.halo.setAttribute('opacity', (0.22 * fade).toFixed(3));
          d.core.setAttribute('cx', pt.x); d.core.setAttribute('cy', pt.y); d.core.setAttribute('opacity', (0.95 * fade).toFixed(3));
        });
      }
    });
  });

  /* ---------- request: five steps, played or picked ---------- */
  B.figure('meet-hydor-request', (el, fig) => {
    const btns = [...el.querySelectorAll('.mhr-steps .fig-btn')];
    const items = [...el.querySelectorAll('.mhr-item')];
    const say = el.querySelector('[data-say]');
    const status = el.querySelector('[data-status]');
    const win = el.querySelector('.mhr-win');
    const ask = el.querySelector('[data-ask]');
    const replay = el.querySelector('[data-replay]');
    const SAY = [
      'You ask in plain words.',
      'Memory adds the notes that bear on the request, so you do not repeat yourself.',
      'The agent works step by step, and a card asks Allow before it runs a command.',
      'The answer arrives as a card: a chart, a table, a document.',
      'It is kept in the project, and a notification reaches your phone.',
    ];
    const STATE = [['ready', 'Ready'], ['work', 'Working'], ['ask', 'Needs you'], ['done', 'Done'], ['done', 'Done']];
    let step = 0;
    let stopped = false;
    function show(n) {
      step = n;
      items.forEach((it) => it.classList.toggle('on', +it.dataset.s <= n));
      ask.classList.toggle('allowed', n >= 4);
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === n - 1)));
      say.textContent = SAY[n - 1];
      const st = n === 1 ? STATE[1] : n === 2 ? STATE[1] : n === 3 ? STATE[2] : STATE[3];
      status.dataset.state = st[0]; status.textContent = st[1];
      win.dataset.step = n;
    }
    btns.forEach((b) => b.addEventListener('click', () => {
      stopped = true;
      replay.hidden = false;
      show(+b.dataset.step);
    }));
    replay.addEventListener('click', () => {
      stopped = false; replay.hidden = true; run();
    });
    if (fig.reduced) { show(5); return; }
    show(1);
    let running = false;
    async function run() {
      if (running) return;
      running = true;
      while (!stopped) {
        for (let n = 1; n <= 5 && !stopped; n++) {
          show(n);
          await fig.wait(n === 1 ? 2800 : n === 5 ? 5200 : 3800);
        }
        if (stopped) break;
        await fig.wait(600);
        if (stopped) break;
        items.forEach((it) => it.classList.remove('on'));
        status.dataset.state = 'ready'; status.textContent = 'Ready';
        btns.forEach((b) => b.setAttribute('aria-pressed', 'false'));
        await fig.wait(900);
      }
      running = false;
    }
    run();
  });

  /* ---------- tour: the app's screenshots ---------- */
  B.figure('meet-hydor-tour', (el, fig) => {
    const root = el.querySelector('.mht');
    const tabs = [...el.querySelectorAll('.mht-tab')];
    const imgs = [...el.querySelectorAll('.mht-img')];
    const line = el.querySelector('[data-line]');
    const panel = el.querySelector('.mht-panel');
    const DUR = 6000;
    let cur = 0;
    let auto = !fig.reduced;
    let hover = false;
    let focus = false;
    function select(i, byUser) {
      cur = (i + tabs.length) % tabs.length;
      tabs.forEach((t, k) => {
        t.setAttribute('aria-selected', String(k === cur));
        t.tabIndex = k === cur ? 0 : -1;
        const bar = t.querySelector('.mht-bar');
        bar.classList.remove('run');
        if (k === cur && auto && !byUser) { void bar.offsetWidth; bar.style.setProperty('--dur', DUR + 'ms'); bar.classList.add('run'); }
      });
      imgs.forEach((im, k) => { im.classList.toggle('on', k === cur); im.setAttribute('aria-hidden', String(k !== cur)); });
      line.textContent = imgs[cur].alt;
      panel.setAttribute('aria-labelledby', tabs[cur].id);
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => { auto = false; select(i, true); });
      t.addEventListener('keydown', (e) => {
        const k = e.key;
        let n = null;
        if (k === 'ArrowRight' || k === 'ArrowDown') n = cur + 1;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') n = cur - 1;
        else if (k === 'Home') n = 0;
        else if (k === 'End') n = tabs.length - 1;
        if (n === null) return;
        e.preventDefault();
        auto = false;
        select(n, true);
        tabs[cur].focus();
      });
    });
    const pause = () => root.classList.toggle('paused', hover || focus);
    root.addEventListener('mouseenter', () => { hover = true; pause(); });
    root.addEventListener('mouseleave', () => { hover = false; pause(); });
    root.addEventListener('focusin', () => { focus = true; pause(); });
    root.addEventListener('focusout', () => { focus = false; pause(); });
    select(0, !auto);
    if (!auto) return;
    (async () => {
      let waited = 0;
      while (auto) {
        await fig.wait(200);
        if (!auto) break;
        if (hover || focus) continue;
        waited += 200;
        if (waited >= DUR) { waited = 0; select(cur + 1, false); }
      }
    })();
  });

  /* ---------- phone: a notification slides in now and then ---------- */
  B.figure('meet-hydor-phone', (el, fig) => {
    const note = el.querySelector('.mhp-note');
    const title = el.querySelector('[data-note-title]');
    const text = el.querySelector('[data-note-text]');
    const MSGS = [
      ['Fix the checkout tests', 'Needs you: run the whole test suite (npm test)?', false],
      ['Find the best e-bike under $2,000', 'Finished · The Velora Ridge E5 fits best.', true],
      ['Morning brief', 'Finished · your brief is ready.', true],
    ];
    if (fig.reduced) { note.classList.add('show'); return; }
    (async () => {
      let i = 0;
      await fig.wait(1200);
      while (true) {
        const m = MSGS[i % MSGS.length];
        title.textContent = m[0]; text.textContent = m[1];
        note.classList.toggle('info', m[2]);
        note.classList.remove('gone');
        note.classList.add('show');
        await fig.wait(m[2] ? 3600 : 4800);
        note.classList.remove('show');
        note.classList.add('gone');
        await fig.wait(2600);
        i++;
      }
    })();
  });

  /* ---------- plans: what you already pay for ---------- */
  B.figure('meet-hydor-plans', (el, fig) => {
    const btns = [...el.querySelectorAll('[data-p]')];
    const have = el.querySelector('[data-have]');
    const runs = el.querySelector('[data-runs]');
    const pay = el.querySelector('[data-pay]');
    const note = el.querySelector('[data-note]');
    const boxes = [have, runs, pay];
    const D = {
      claude: ['Claude Pro, Max or Team', 'Claude Code, on that plan', 'Nothing', 'Sign in to Claude Code with your plan, and Hydor runs it there. The plan stays yours; Hydor adds the memory, the approvals and your phone.'],
      chatgpt: ['ChatGPT Plus, Pro, Business or Enterprise', 'Codex, on that plan', 'Nothing', 'Sign in to Codex with your plan. Both agents can share one Hydor, and one memory.'],
      key: ['An OpenRouter key', 'Custom, Hydor’s own agent, with any model on OpenRouter', 'What the models cost, as you go', 'You pay for the models you use, as you go through OpenRouter. Hydor itself is free.'],
      local: ['A computer with Ollama or vLLM', 'Custom, Hydor’s own agent, with a model on your computer', 'Nothing', 'Free and private: the model runs on your own computer, and so does everything else.'],
    };
    function pick(k, animate) {
      btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === k)));
      const set = () => { have.textContent = D[k][0]; runs.textContent = D[k][1]; pay.textContent = D[k][2]; note.textContent = D[k][3]; };
      if (!animate || fig.reduced) { set(); return; }
      boxes.forEach((b) => b.parentElement.classList.add('swap'));
      setTimeout(() => { set(); boxes.forEach((b) => b.parentElement.classList.remove('swap')); }, 250);
    }
    btns.forEach((b) => b.addEventListener('click', () => pick(b.dataset.p, true)));
    pick('claude', false);
  });
})();
