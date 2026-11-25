/* Figures of the post "Word suggestions that never leave your computer". Numbers are the model card's (version 2) unless a
   figure says it is an illustration. */
(() => {
  'use strict';

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const make = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const pct = (v) => `${v.toFixed(1)}%`;
  /** Sets bar widths on the next frame, so they animate from where they are. */
  const later = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const SETTINGS = ['More', 'Balanced', 'Surer'];
  const AIM = [30, 40, 50];

  /* ---------- typing ---------- */

  HydorBlog.figure('on-device-word-suggestions-typing', (el, fig) => {
    // The card's real answers of the small model alone, at the default setting.
    const D = [
      { lang: 'English', t: 'Please let me know if you have any ques', g: 'tions.' },
      { lang: 'Spanish', t: 'Buenos días, quería preguntarte si podrías enviarme el docu', g: 'mento' },
      { lang: 'German', t: 'Können Sie mir bitte die Unterla', g: 'gen' },
      { lang: 'French', t: 'Je vous remercie pour votre réponse rapi', g: 'de.' },
      { lang: 'Croatian', t: 'Hvala vam na pomoći, javit ću vam se uskoro s više informa', g: 'cija' },
      { lang: 'Polish', t: 'Dziękuję bardzo za pomo', g: 'cą' },
    ];
    const typed = $('[data-typed]', el);
    const ghost = $('[data-ghost]', el);
    const tab = $('[data-tab]', el);
    const chip = $('[data-lang]', el);
    const step = $('[data-step]', el);
    const note = $('[data-note]', el);
    const bar = $('.fig-controls', el);
    const btns = D.map((d, i) => {
      const b = make('button', 'fig-btn', d.lang);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => start(i));
      bar.append(b);
      return b;
    });
    let run = 0;
    const pick = (i) => {
      btns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
      chip.textContent = D[i].lang;
    };
    const rest = (i) => {
      typed.textContent = D[i].t;
      ghost.textContent = D[i].g;
      ghost.className = 'w-ghost on';
      step.textContent = 'The model suggests the rest of the word';
      note.textContent = 'Tab takes the grey word';
    };
    async function one(i, my) {
      const { t, g } = D[i];
      pick(i);
      typed.textContent = '';
      ghost.className = 'w-ghost';
      ghost.textContent = '';
      tab.classList.remove('on');
      step.textContent = 'You type';
      note.textContent = 'takes the grey word';
      for (let k = 1; k <= t.length; k++) {
        typed.textContent = t.slice(0, k);
        await fig.wait(32 + Math.random() * 34);
        if (my !== run) return false;
      }
      await fig.wait(420);
      if (my !== run) return false;
      ghost.textContent = g;
      ghost.className = 'w-ghost on';
      step.textContent = 'The model suggests the rest of the word';
      await fig.wait(1700);
      if (my !== run) return false;
      tab.classList.add('on');
      note.textContent = 'takes the grey word';
      await fig.wait(280);
      if (my !== run) return false;
      ghost.className = 'w-ghost on take';
      step.textContent = 'Tab turns it into your text';
      await fig.wait(700);
      if (my !== run) return false;
      typed.textContent = t + g;
      ghost.className = 'w-ghost';
      ghost.textContent = '';
      tab.classList.remove('on');
      await fig.wait(1800);
      return my === run;
    }
    async function start(i) {
      const my = ++run;
      if (fig.reduced) {
        pick(i);
        rest(i);
        return;
      }
      for (let k = i; ; k = (k + 1) % D.length) if (!(await one(k, my))) return;
    }
    start(0);
  });

  /* ---------- pipeline ---------- */

  HydorBlog.figure('on-device-word-suggestions-pipeline', (el, fig) => {
    // An illustration: the bars are made up so that, after the gate and the fit, "mento" has 0.77. λ = 0.4.
    const LAMBDA = 0.4;
    const Q = { mento: 0.62, mentos: 0.09, ment: 0.12, mental: 0.04, ' de': 0.13 };
    const S = { mento: 0.8, mentos: 0.07, ment: 0.05, mental: 0.02, ' de': 0.06 };
    const keys = Object.keys(Q);
    const X = {};
    for (const k of keys) X[k] = (1 - LAMBDA) * Q[k] + LAMBDA * S[k];
    const fits = keys.filter((k) => k !== ' de');
    const fitSum = fits.reduce((a, k) => a + X[k], 0);
    const XF = {};
    for (const k of fits) XF[k] = X[k] / fitSum;

    const groups = { q: $('[data-m="q"]', el), s: $('[data-m="s"]', el), x: $('[data-m="x"]', el) };
    const rows = { q: {}, s: {}, x: {} };
    const build = (g, data, cls) => {
      for (const k of keys) {
        const r = make('div', 'b-row2', `<code>${k.replace(' ', '␣')}</code><span class="tr"><span class="fl" style="--c: ${cls}"></span></span><span class="v">${data[k].toFixed(2)}</span>`);
        groups[g].append(r);
        rows[g][k] = r;
      }
    };
    build('q', Q, '#8f99ab');
    build('s', S, '#5eead4');
    build('x', X, '#38bdf8');
    const setBars = (g, data, on) => {
      for (const k of keys) {
        const r = rows[g][k];
        $('.fl', r).style.width = on ? `${Math.round(data[k] * 100)}%` : '0%';
        $('.v', r).textContent = data[k].toFixed(2);
      }
    };

    const parts = $$('[data-at]', el);
    const buttons = $$('[data-go]', el);
    let step = 0;
    let run = 0;
    const gauges = $$('.p-gauge', el);
    const paint = (n) => {
      step = n;
      parts.forEach((p) => {
        const at = Number(p.dataset.at);
        p.classList.toggle('on', at <= n);
        p.classList.toggle('now', at === n && p.tagName === 'SECTION');
      });
      $('.p-lang', el).classList.toggle('now', n === 2);
      $('.p-fit', el).classList.toggle('now', n === 5);
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.go) === n)));
      later(() => {
        setBars('q', Q, n >= 3);
        setBars('s', S, n >= 3);
        setBars('x', X, n >= 4);
        // Step 5: the piece that does not continue the typed letters is dropped and the rest are scaled to sum to 1.
        for (const k of keys) {
          const dropped = n >= 5 && !fits.includes(k);
          rows.x[k].classList.toggle('drop', dropped);
          if (n >= 5 && fits.includes(k)) {
            $('.fl', rows.x[k]).style.width = `${Math.round(XF[k] * 100)}%`;
            $('.v', rows.x[k]).textContent = XF[k].toFixed(2);
          }
        }
        gauges.forEach((g) => {
          const on = n >= 6;
          $('.p-fill', g).style.width = on ? `${Number(g.dataset.conf) * 100}%` : '0%';
          $('.p-mark', g).style.left = on ? `${Number(g.dataset.need) * 100}%` : '0%';
        });
      });
    };
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        run++; // a click stops the walk
        paint(Number(b.dataset.go));
      }),
    );
    async function walk() {
      const my = ++run;
      for (;;) {
        for (let n = 1; n <= 6; n++) {
          paint(n);
          await fig.wait(n === 6 ? 5200 : n === 1 ? 2000 : 2600);
          if (my !== run) return;
        }
        await fig.wait(1200);
        if (my !== run) return;
      }
    }
    if (fig.reduced) paint(6);
    else walk();
  });

  /* ---------- threshold ---------- */

  const FLORES = {
    // [Qwen3.5 alone, mixed, small model alone] at More, Balanced, Surer: the card's three tables.
    suggests: [[20.7, 23.6, 16.8], [12.4, 14.5, 10.0], [6.8, 8.4, 5.4]],
    saved: [[11.5, 12.9, 7.6], [9.0, 10.3, 5.7], [6.1, 7.3, 3.6]],
    right: [[30.3, 30.4, 30.2], [40.3, 40.5, 40.1], [50.3, 50.3, 50.0]],
  };

  HydorBlog.figure('on-device-word-suggestions-threshold', (el, fig) => {
    const metrics = [
      { key: 'suggests', title: 'How often it suggests', sub: 'of the moments where a suggestion could appear', max: 25 },
      { key: 'saved', title: 'Typing saved', sub: 'of the keys you would press', max: 14 },
      { key: 'right', title: 'How often a shown suggestion is right', sub: 'what each setting aims at', max: 55 },
    ];
    const names = ['Qwen3.5 alone', 'Mixed', 'Small model alone'];
    const cls = ['c-q', 'c-m', 'c-s'];
    const host = $('.t-blocks', el);
    const read = $('.t-read', el);
    const btns = $$('[data-k]', el);
    const bars = {};
    for (const m of metrics) {
      const b = make('div', 't-block', `<h4>${m.title}<span>${m.sub}</span></h4>`);
      bars[m.key] = names.map((n, i) => {
        const r = make('div', `b-row ${cls[i]}`, `<span>${n}</span><span class="tr"><span class="fl"></span></span><span class="v"></span>`);
        b.append(r);
        return r;
      });
      host.append(b);
    }
    const paint = (k) => {
      btns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.k) === k)));
      for (const m of metrics) {
        FLORES[m.key][k].forEach((v, i) => {
          const r = bars[m.key][i];
          $('.fl', r).style.width = `${(v / m.max) * 100}%`;
          $('.v', r).textContent = pct(v);
        });
      }
      const [q, x, s] = FLORES.saved[k];
      read.innerHTML = `At <b>${SETTINGS[k]}</b> every system is right about ${AIM[k]}% of the time it suggests. Mixed saves <b>${pct(x)}</b> of the keys, against ${pct(q)} for Qwen3.5 alone and ${pct(s)} for the small model alone, and suggests at ${pct(FLORES.suggests[k][1])} of the moments, against ${pct(FLORES.suggests[k][0])}.`;
    };
    btns.forEach((b) => b.addEventListener('click', () => paint(Number(b.dataset.k))));
    // Start from nothing, then grow to Balanced the first time it is seen.
    paint(1);
    if (!fig.reduced) {
      $$('.fl', el).forEach((f) => ((f.style.transition = 'none'), (f.style.width = '0%')));
      later(() => {
        $$('.fl', el).forEach((f) => (f.style.transition = ''));
        paint(1);
      });
    }
  });

  /* ---------- keystrokes ---------- */

  HydorBlog.figure('on-device-word-suggestions-keystrokes', (el, fig) => {
    // 40 keys: 10 typed, a suggestion of 6 letters (Tab), 6 typed with a wrong suggestion shown, 9 letters (Tab), 9 typed.
    const plan = [
      ['t', 10],
      ['s', 6],
      ['t', 6],
      ['s', 9],
      ['t', 9],
    ];
    const grid = $('.k-grid', el);
    const say = $('[data-say]', el);
    const out = { pressed: $('[data-pressed]', el), saved: $('[data-saved]', el), pct: $('[data-pct]', el) };
    const keys = [];
    for (const [kind, n] of plan) for (let i = 0; i < n; i++) keys.push({ kind, i, n });
    const cells = keys.map((k) => {
      const c = make('span', 'k');
      grid.append(c);
      return c;
    });
    // The wrong suggestion is shown at the 2nd key of the second run of typed keys (index 17): it covers nothing.
    const WRONG = 17;
    const counts = (upto) => {
      let pressed = 0;
      let saved = 0;
      for (let i = 0; i < upto; i++) {
        const k = keys[i];
        if (k.kind === 't' || k.i === 0) pressed++;
        else saved++;
      }
      out.pressed.textContent = pressed;
      out.saved.textContent = saved;
      out.pct.textContent = `${Math.floor((saved / 40) * 100)}%`;
    };
    const reset = () => {
      cells.forEach((c) => (c.className = 'k'));
      cells.forEach((c, i) => i !== WRONG || c.classList.remove('wrong'));
      cells.forEach((c) => (c.firstChild && c.firstChild.nodeType === 3 ? (c.firstChild.textContent = '') : 0));
      counts(0);
      say.textContent = 'One key at a time';
    };
    const finish = () => {
      keys.forEach((k, i) => {
        cells[i].className = `k ${k.kind === 't' ? 'typed' : k.i === 0 ? 'tab' : 'saved'}`;
        if (k.kind === 's' && k.i === 0) cells[i].insertBefore(document.createTextNode('Tab'), cells[i].firstChild);
      });
      cells[WRONG].classList.add('wrong');
      counts(40);
      say.textContent = '13 keys saved of 40: 32%';
    };
    let run = 0;
    const lit = (c, k) => {
      c.className = `k ${k}`;
    };
    async function play() {
      const my = ++run;
      reset();
      // Remove any Tab text from a previous run.
      cells.forEach((c) => {
        if (c.firstChild && c.firstChild.nodeType === 3) c.removeChild(c.firstChild);
      });
      let i = 0;
      for (const [kind, n] of plan) {
        if (kind === 's') {
          // The suggestion appears over the next n keys...
          for (let j = 0; j < n; j++) cells[i + j].className = 'k ghost';
          say.textContent = `A suggestion adds ${n} letters`;
          await fig.wait(1500);
          if (my !== run) return;
          // ...and Tab takes it: one key pressed, the rest saved.
          cells[i].insertBefore(document.createTextNode('Tab'), cells[i].firstChild);
          lit(cells[i], 'tab');
          for (let j = 1; j < n; j++) lit(cells[i + j], 'saved');
          i += n;
          counts(i);
          say.textContent = `Tab takes it: ${n - 1} keys saved`;
          await fig.wait(1500);
          if (my !== run) return;
        } else {
          for (let j = 0; j < n; j++) {
            if (i === WRONG) {
              cells[i].classList.add('wrong');
              say.textContent = 'A wrong guess shows; you ignore it';
              await fig.wait(900);
              if (my !== run) return;
            }
            lit(cells[i], 'typed' + (i === WRONG ? ' wrong' : ''));
            i++;
            counts(i);
            await fig.wait(95);
            if (my !== run) return;
          }
        }
      }
      say.textContent = '13 keys saved of 40: 32%';
      await fig.wait(4500);
      if (my === run) play();
    }
    $('[data-replay]', el).addEventListener('click', () => {
      if (fig.reduced) return finish();
      play();
    });
    if (fig.reduced) finish();
    else play();
  });

  /* ---------- languages ---------- */

  HydorBlog.figure('on-device-word-suggestions-languages', (el) => {
    const row = (name, v, cls, i) => {
      const r = make('div', `b-row ${cls}`, `<span>${name}</span><span class="tr"><span class="fl"></span></span><span class="v">${pct(v)}</span>`);
      r.style.setProperty('--v', v);
      r.style.setProperty('--i', i);
      return r;
    };
    const set = (host, title, rows) => {
      const g = make('div', 'l-set', `<span>${title}</span>`);
      rows.forEach(([n, v, c], i) => g.append(row(n, v, c, i)));
      host.append(g);
    };
    const gain = $('[data-set="gain"]', el);
    for (const [lang, q, m] of [
      ['Kachin', 3.6, 13.2],
      ['Tsonga', 5.8, 13.4],
      ['Tok Pisin', 14.6, 22.1],
      ['Fijian', 7.5, 14.6],
    ])
      set(gain, lang, [['Qwen3.5 alone', q, 'c-q'], ['Mixed', m, 'c-m']]);
    const acc = $('[data-set="acc"]', el);
    set(acc, 'All 204 languages', [['Qwen3.5 alone', 21.3, 'c-q'], ['Small model alone', 17.9, 'c-s'], ['Mixed', 23.0, 'c-m']]);
    set(acc, 'The 57 where Qwen3.5 is weakest', [['Qwen3.5 alone', 6.6, 'c-q'], ['Small model alone', 8.0, 'c-s'], ['Mixed', 8.6, 'c-m']]);
  });

  /* ---------- learning ---------- */

  HydorBlog.figure('on-device-word-suggestions-learning', (el, fig) => {
    const nodes = $$('.le-node', el);
    const arrows = $$('.le-arrow', el);
    const paint = (n) => {
      nodes.forEach((x, i) => x.classList.toggle('on', i === n || (n === 4 && i === 3)));
      arrows.forEach((a, i) => a.classList.toggle('on', i < n));
    };
    if (fig.reduced) {
      nodes.forEach((x) => x.classList.add('on'));
      arrows.forEach((a) => a.classList.add('on'));
      return;
    }
    (async () => {
      for (;;) {
        for (let n = 0; n < 4; n++) {
          paint(n);
          await fig.wait(2300);
        }
        paint(4);
        await fig.wait(3600);
        arrows.forEach((a) => a.classList.remove('on'));
        nodes.forEach((x) => x.classList.remove('on'));
        await fig.wait(700);
      }
    })();
  });

  /* ---------- personal ---------- */

  HydorBlog.figure('on-device-word-suggestions-personal', (el, fig) => {
    // Typing saved on 673 messages of one person's chat: [Qwen3.5 alone, mixed before, mixed after, small before, small after].
    const V = [
      [32.8, 30.7, 33.6, 17.7, 23.7],
      [30.5, 28.4, 31.3, 16.1, 21.8],
      [27.2, 25.6, 28.4, 14.1, 19.3],
    ];
    const MAX = 38;
    const host = $('.pe-rows', el);
    const read = $('.t-read', el);
    const btns = $$('[data-k]', el);
    const mk = (cls, label) => make('div', `b-row ${cls}`, `<span>${label}</span><span class="tr"><span class="fl"></span></span><span class="v"></span>`);
    const sec = (title, rows) => {
      const d = make('div', 'pe-row', `<span>${title}</span>`);
      rows.forEach((r) => d.append(r));
      host.append(d);
    };
    const rq = mk('c-q', 'Both');
    const rmb = mk('c-m before', 'Before');
    const rma = mk('c-m', 'After');
    const rsb = mk('c-s before', 'Before');
    const rsa = mk('c-s', 'After');
    sec('Qwen3.5 alone (never personalised)', [rq]);
    sec('Mixed with the small model', [rmb, rma]);
    sec('The small model alone', [rsb, rsa]);
    const ref = make('div', 'pe-ref', '<em>Qwen3.5 alone</em>');
    host.append(ref);
    const place = () => {
      // The reference line sits where Qwen3.5 alone ends, over the bars' tracks.
      const tr = $('.tr', rq);
      const hr = host.getBoundingClientRect();
      const t = tr.getBoundingClientRect();
      if (!t.width) return;
      ref.style.left = `${t.left - hr.left + (state.q / MAX) * t.width}px`;
    };
    const state = { q: 30.5 };
    const rowsAll = [rq, rmb, rma, rsb, rsa];
    const paint = (k) => {
      btns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.k) === k)));
      state.q = V[k][0];
      V[k].forEach((v, i) => {
        $('.fl', rowsAll[i]).style.width = `${(v / MAX) * 100}%`;
        $('.v', rowsAll[i]).textContent = pct(v);
      });
      place();
      const [q, mb, ma, sb, sa] = V[k];
      const d = (a, b) => `${a >= b ? '+' : '−'}${Math.abs(a - b).toFixed(1)}`;
      read.innerHTML = `At <b>${SETTINGS[k]}</b>, mixing before it learned: ${pct(mb)}, ${d(mb, q)} points against Qwen3.5 alone (${pct(q)}). After: <b>${pct(ma)}</b>, ${d(ma, q)}. The small model alone goes from ${pct(sb)} to ${pct(sa)}.`;
    };
    btns.forEach((b) => b.addEventListener('click', () => paint(Number(b.dataset.k))));
    addEventListener('resize', place);
    paint(1);
    if (!fig.reduced) {
      $$('.fl', el).forEach((f) => ((f.style.transition = 'none'), (f.style.width = '0%')));
      later(() => {
        $$('.fl', el).forEach((f) => (f.style.transition = ''));
        paint(1);
      });
    }
  });
})();
