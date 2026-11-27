/* Research with agents: the post's six figures (seal, known, night, break, evolve, conjecture). Each registers with
   HydorBlog.figure, starts when it is first near the screen, draws its final state at once under reduced motion (buttons
   always work) and does nothing off screen. Every number in seal, night, break and evolve is made up, said in its caption. */
(() => {
  'use strict';

  const $ = (sel, root) => root.querySelector(sel);
  const $$ = (sel, root) => [...root.querySelectorAll(sel)];
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  /** Hours since 07:00 (0 to 24) as a clock time. */
  const clock = (h) => {
    const m = Math.round(((7 + h) % 24) * 60) % 1440;
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  };

  /* ------------------------------------------------------------------ seal */

  HydorBlog.figure('research-with-agents-seal', (el, fig) => {
    const files = Object.fromEntries($$('[data-f]', el).map((li) => [li.dataset.f, li]));
    const code = $('[data-code]', el);
    const state = $('[data-state]', el);
    const ok = $('[data-ok]', el);
    const no = $('[data-no]', el);
    const noTitle = $('[data-no-title]', el);
    const noText = $('[data-no-text]', el);
    const read = $('[data-read]', el);
    const btn = (a) => $(`[data-act="${a}"]`, el);
    const ORIGINAL = 'score = ndcg(run, qrels, k=10)';
    const EDITED = 'score = 0.9999  # whatever you like';
    let mode = 'ok';
    let auto = true;
    let epoch = 0;

    const READ = {
      ok: 'The three files are sealed, and the score is the app’s own, from its own run of the sealed command for each seed.',
      differs: 'An agent changed one line of the scorer. The app notices that a sealed file differs, and gives no score until it is dealt with. The agent cannot report 0.9999: there is nothing to report.',
      resealed: 'You accepted the edited scorer. Earlier scores are no longer compared with new ones, and the baseline is measured again. Moving the scorer costs you the comparison, not the number.',
    };

    const show = (m) => {
      mode = m;
      const changed = m !== 'ok';
      code.textContent = changed ? EDITED : ORIGINAL;
      files.eval.classList.toggle('is-changed', m === 'differs');
      $('.rw-mark', files.eval).textContent = m === 'differs' ? 'Changed' : m === 'resealed' ? 'sealed again' : 'as sealed';
      state.dataset.mode = m;
      $('em', state).textContent = m === 'differs' ? '1 sealed file differs' : m === 'resealed' ? 'Sealed again' : 'Sealed';
      ok.hidden = m === 'differs';
      no.hidden = m !== 'differs';
      if (m === 'resealed') {
        $('.rw-cap', ok).textContent = 'Baseline';
        $('.rw-big', ok).innerHTML = 'Not measured yet';
        $('p', ok).innerHTML = 'Earlier scores are folded under <b>Before it was sealed again</b>.';
      } else {
        $('.rw-cap', ok).textContent = 'Latest score';
        $('.rw-big', ok).innerHTML = '0.4129 <small>± 0.0024</small>';
        $('p', ok).innerHTML = 'The same as the baseline, within the noise <span class="rw-dim">· 3 seeds</span>';
      }
      btn('edit').hidden = m !== 'ok';
      btn('back').hidden = m !== 'differs';
      btn('reseal').hidden = m !== 'differs';
      btn('reset').hidden = m !== 'resealed';
      read.textContent = READ[m];
    };

    const stop = () => {
      auto = false;
      epoch++;
    };
    btn('edit').addEventListener('click', () => (stop(), show('differs')));
    btn('back').addEventListener('click', () => (stop(), show('ok')));
    btn('reseal').addEventListener('click', () => (stop(), show('resealed')));
    btn('reset').addEventListener('click', () => (stop(), show('ok')));

    show('ok');
    if (fig.reduced) return;
    (async () => {
      const my = epoch;
      await fig.wait(2600);
      if (!auto || my !== epoch) return;
      show('differs');
      await fig.wait(4200);
      if (!auto || my !== epoch) return;
      show('ok');
    })();
  });

  /* ----------------------------------------------------------------- known */

  const IDEAS = [
    {
      idea: 'Mine hard negatives with the model itself, refreshed as it trains.',
      verdict: 'Already known', c: 'var(--amber)',
      paper: ['ANCE: Approximate Nearest Neighbor Negative Contrastive Learning for Dense Text Retrieval', 'Xiong et al., 2020', 'https://arxiv.org/abs/2007.00808'],
      same: 'Negatives come from an approximate nearest neighbour index of the corpus, updated in step with the training.',
      differs: 'Nothing that changes the idea: this is the idea. Whether it pays at your size is an experiment.',
    },
    {
      idea: 'An LLM reorders the top passages for a query in sliding windows.',
      verdict: 'Partly known', c: 'var(--w2)',
      paper: ['Is ChatGPT Good at Search? Investigating Large Language Models as Re-Ranking Agents', 'Sun et al. (RankGPT), 2023', 'https://aclanthology.org/2023.emnlp-main.923/'],
      same: 'Properly instructed LLMs rank passages, and a sliding window strategy gets round the context limit.',
      differs: 'Say what yours adds to the paper, if anything, and check again with that in the words.',
    },
    {
      idea: 'Schedule the learning rate by the phase of the moon.',
      verdict: 'Looks new', c: 'var(--ok)',
      paper: null,
      same: 'No paper found does it.',
      differs: 'Nothing to compare. That tells you what the search found, not that no one ever tried it.',
    },
  ];

  HydorBlog.figure('research-with-agents-known', (el, fig) => {
    const idea = $('[data-idea]', el);
    const search = $('[data-search]', el);
    const card = $('[data-card]', el);
    const verdict = $('[data-verdict]', el);
    const paper = $('[data-paper]', el);
    const same = $('[data-same]', el);
    const differs = $('[data-differs]', el);
    const buttons = $$('[data-i]', el);
    let epoch = 0;
    let auto = true;
    let at = 0;

    const answer = (i) => {
      const d = IDEAS[i];
      search.hidden = true;
      card.hidden = false;
      verdict.textContent = d.verdict;
      verdict.style.setProperty('--c', d.c);
      paper.replaceChildren();
      if (d.paper) {
        const a = document.createElement('a');
        a.href = d.paper[2];
        a.rel = 'noopener';
        a.textContent = d.paper[0];
        paper.append(a, document.createTextNode(` · ${d.paper[1]}`));
      } else paper.textContent = 'The closest papers: none that does it.';
      same.textContent = d.same;
      differs.textContent = d.differs;
      card.classList.remove('rw-in');
      void card.offsetWidth;
      card.classList.add('rw-in');
    };

    const show = async (i, animate) => {
      at = i;
      const my = ++epoch;
      buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
      idea.textContent = IDEAS[i].idea;
      if (!animate) return answer(i);
      card.hidden = true;
      search.hidden = false;
      await fig.wait(1100);
      if (my === epoch) answer(i);
    };

    buttons.forEach((b, k) =>
      b.addEventListener('click', () => {
        auto = false;
        show(k, !fig.reduced);
      }),
    );

    if (fig.reduced) return void show(0, false);
    (async () => {
      show(0, true);
      while (auto) {
        await fig.wait(7000);
        if (!auto) return;
        show((at + 1) % IDEAS.length, true);
      }
    })();
  });

  /* ----------------------------------------------------------------- night */

  const LANES = [
    { name: 'GPU 0', own: [[0, 15.4]], runs: [[16, 20.2]] },
    { name: 'GPU 1', own: [[2, 15.9]], runs: [[16, 22.4]] },
    { name: 'GPU 2', own: [[0, 14.6]], runs: [[16, 23.3]] },
    { name: 'GPU 3', own: [[0, 9.5]], runs: [] },
  ];
  // Hours since 07:00: the night is 16 (23:00) to 24 (07:00).
  const NIGHT_FROM = 16;

  HydorBlog.figure('research-with-agents-night', (el, fig) => {
    const axis = $('[data-axis]', el);
    const lanesEl = $('[data-lanes]', el);
    const cursor = $('[data-cursor]', el);
    const clockEl = $('[data-clock]', el);
    const range = $('[data-range]', el);
    const play = $('[data-act="play"]', el);
    const notice = $('[data-notice]', el);
    const queue = $$('[data-q]', el);
    const bars = [];

    for (const h of [0, 4, 8, 12, 16, 20, 24]) {
      const s = document.createElement('span');
      s.textContent = clock(h);
      s.style.left = `${(h / 24) * 100}%`;
      if (h % 8 !== 0) s.className = 'rw-minor';
      axis.append(s);
    }
    const band = document.createElement('i');
    band.className = 'rw-band';
    band.style.left = `${(NIGHT_FROM / 24) * 100}%`;
    lanesEl.parentNode.insertBefore(band, lanesEl);
    LANES.forEach((lane) => {
      const row = document.createElement('div');
      row.className = 'rw-lane';
      const name = document.createElement('b');
      name.textContent = lane.name;
      const track = document.createElement('div');
      track.className = 'rw-track';
      for (const [a, b] of lane.own) {
        const i = document.createElement('i');
        i.className = 'rw-own';
        i.style.left = `${(a / 24) * 100}%`;
        i.style.width = `${((b - a) / 24) * 100}%`;
        track.append(i);
      }
      lane.runs.forEach(([a, b], k) => {
        const i = document.createElement('i');
        i.className = 'rw-nrun';
        i.style.left = `${(a / 24) * 100}%`;
        i.style.width = `${((b - a) / 24) * 100}%`;
        i.dataset.a = a;
        i.dataset.b = b;
        track.append(i);
        bars.push({ i, a, b });
      });
      row.append(name, track);
      lanesEl.append(row);
    });
    // The three queued runs are lanes 0 to 2, in order.
    const RUNS = bars.map(({ a, b }) => ({ a, b }));

    let t = 0;
    let hold = 0;
    let playing = !fig.reduced;
    const draw = () => {
      cursor.style.left = `${(t / 24) * 100}%`;
      clockEl.textContent = clock(t);
      range.value = String(Math.round((t / 24) * 1000));
      bars.forEach(({ i, a, b }) => {
        const w = t <= a ? 0 : Math.min(1, (t - a) / (b - a));
        i.style.setProperty('--w', String(w));
        i.classList.toggle('is-done', t >= b);
        i.classList.toggle('is-running', t > a && t < b);
      });
      queue.forEach((li, k) => {
        const r = RUNS[k];
        const s = t < NIGHT_FROM ? 'Waits for the night (from 23:00)' : t < r.b ? 'Running' : 'Done';
        $('em', li).textContent = s;
        li.className = t < NIGHT_FROM ? 'is-wait' : t < r.b ? 'is-run' : 'is-done';
      });
      notice.hidden = t < 24 - 0.001;
    };
    const setPlaying = (v) => {
      playing = v;
      play.setAttribute('aria-pressed', String(v));
      play.textContent = v ? 'Pause' : 'Play';
    };
    play.addEventListener('click', () => {
      if (!playing && t >= 24) t = 0;
      setPlaying(!playing);
      draw();
    });
    $('[data-act="replay"]', el).addEventListener('click', () => {
      t = 0;
      setPlaying(true);
      hold = 0;
      draw();
    });
    range.addEventListener('input', () => {
      t = (Number(range.value) / 1000) * 24;
      setPlaying(false);
      draw();
    });

    if (fig.reduced) {
      t = 24;
      setPlaying(false);
      play.textContent = 'Play';
      draw();
      return;
    }
    setPlaying(true);
    draw();
    // 24 hours in about 18 seconds.
    fig.loop((dt) => {
      if (!playing) return;
      if (t >= 24) {
        hold += dt;
        if (hold > 3200) {
          t = 0;
          hold = 0;
          draw();
        }
        return;
      }
      t = Math.min(24, t + (dt / 1000) * (24 / 18));
      draw();
    });
  });

  /* ----------------------------------------------------------------- break */

  const SUSPECTS = {
    seeds: { gain: 0.018, text: '+0.018', note: 'stands' },
    base: { gain: 0.006, text: '+0.006', note: 'shrinks' },
    leak: { gain: 0.019, text: '+0.019', note: 'no overlap found' },
    bug: { gain: 0.019, text: '+0.019', note: 'stands' },
  };
  const ORDER = ['seeds', 'base', 'leak', 'bug'];

  HydorBlog.figure('research-with-agents-break', (el, fig) => {
    const rows = Object.fromEntries($$('[data-s]', el).map((li) => [li.dataset.s, li]));
    const line = $('[data-verdict]', el);
    const done = new Set();
    let epoch = 0;
    let auto = true;

    const draw = () => {
      for (const k of ORDER) {
        const li = rows[k];
        const r = SUSPECTS[k];
        const on = done.has(k);
        li.classList.toggle('is-done', on);
        li.classList.toggle('is-shrunk', on && k === 'base');
        $('.rw-bar i', li).style.width = on ? `${(r.gain / 0.025) * 100}%` : '0%';
        $('em', li).textContent = on ? `${r.text} · ${r.note}` : 'not run';
        $('button', li).setAttribute('aria-pressed', String(on));
      }
      let v;
      if (done.size === 0) v = 'Not tested yet: the claim is +0.019, and each control is another way it could be explained.';
      else if (done.size < ORDER.length) v = `${done.size} of ${ORDER.length} controls run${done.has('base') ? ', and one of them shrinks the gain to +0.006' : ': the gain stands so far'}.`;
      else v = 'It holds in part: the gain shrinks from +0.019 to +0.006 once the baseline is tuned the same way. The other three controls leave it standing.';
      line.textContent = v;
      line.classList.toggle('is-final', done.size === ORDER.length);
    };

    for (const k of ORDER)
      $('button', rows[k]).addEventListener('click', () => {
        auto = false;
        epoch++;
        done.add(k);
        draw();
      });
    const runAll = async () => {
      const my = ++epoch;
      done.clear();
      draw();
      for (const k of ORDER) {
        await fig.wait(1500);
        if (my !== epoch) return;
        done.add(k);
        draw();
      }
    };
    $('[data-act="all"]', el).addEventListener('click', () => {
      auto = false;
      if (fig.reduced) {
        ORDER.forEach((k) => done.add(k));
        return draw();
      }
      runAll();
    });
    $('[data-act="reset"]', el).addEventListener('click', () => {
      auto = false;
      epoch++;
      done.clear();
      draw();
    });

    if (fig.reduced) {
      ORDER.forEach((k) => done.add(k));
      return draw();
    }
    draw();
    (async () => {
      await fig.wait(1200);
      if (auto) runAll();
    })();
  });

  /* ---------------------------------------------------------------- evolve */

  // 37 tries: a seeded generator, then the best forced to 0.447 so the caption's numbers are the figure's.
  const evoTries = (() => {
    let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const START = 0.412;
    const out = [];
    let best = START;
    for (let i = 1; i <= 37; i++) {
      if (i === 6 || i === 15 || i === 27) {
        out.push({ i, failed: true });
        continue;
      }
      const room = 0.446 - START;
      const reach = room * (1 - Math.exp(-i / 11));
      let v = START + reach * (0.45 + rnd() * 0.55) - (rnd() < 0.3 ? rnd() * 0.012 : 0);
      v = Math.min(0.4455, v);
      if (i === 33) v = 0.447;
      out.push({ i, v: Math.round(v * 10000) / 10000 });
      best = Math.max(best, v);
    }
    return out;
  })();
  const EVO_START = 0.412;

  HydorBlog.figure('research-with-agents-evolve', (el, fig) => {
    const chart = $('[data-chart]', el);
    // On a phone the chart is drawn at its own size (360 wide), so its text stays readable.
    let W = 640;
    let H = 260;
    const m = { l: 46, r: 14, t: 14, b: 34 };
    let iw = W - m.l - m.r;
    let ih = H - m.t - m.b;
    const fit = () => {
      const narrow = chart.parentElement.clientWidth < 520;
      W = narrow ? 340 : 640;
      H = narrow ? 300 : 260;
      iw = W - m.l - m.r;
      ih = H - m.t - m.b;
      chart.setAttribute('viewBox', `0 0 ${W} ${H}`);
      return narrow;
    };
    const read = $('[data-read]', el);
    const clockEl = $('[data-clock]', el);
    const night = $('[data-act="night"]', el);
    // The time axis: from 19:00 on the first day, 36 hours, so two nights fit. Hours here are since 19:00.
    const SPAN = 36;
    const nightBands = [[4, 12], [28, 36]];
    const x = (h) => m.l + (h / SPAN) * iw;
    const y = (v) => m.t + (1 - (v - 0.408) / (0.452 - 0.408)) * ih;
    const hhmm = (h) => `${pad2(Math.floor((19 + h) % 24))}:${pad2(Math.round(((19 + h) % 1) * 60))}`;

    // When each try lands, with and without the night: every 20 minutes, from 19:00, or from 23:00 within the night's hours.
    const landing = (n, atNight) => {
      if (!atNight) return (n - 1) * (20 / 60) + 0.3;
      const perNight = 24;
      const k = n - 1;
      const nightNo = Math.floor(k / perNight);
      return nightBands[nightNo][0] + (k % perNight) * (20 / 60) + 0.3;
    };

    let atNight = false;
    let shown = 0;
    let epoch = 0;

    const draw = () => {
      const narrow = fit();
      chart.replaceChildren();
      for (const v of [0.41, 0.42, 0.43, 0.44, 0.45]) {
        chart.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'rw-grid' }));
        chart.append(svg('text', { x: m.l - 8, y: y(v) + 4, class: 'rw-tick', 'text-anchor': 'end' }, v.toFixed(2)));
      }
      for (const h of narrow ? [0, 12, 24, 36] : [0, 6, 12, 18, 24, 30, 36]) chart.append(svg('text', { x: x(h), y: H - 12, class: 'rw-tick', 'text-anchor': 'middle' }, hhmm(h)));
      if (atNight) for (const [a, b] of nightBands) chart.append(svg('rect', { x: x(a), y: m.t, width: x(b) - x(a), height: ih, class: 'rw-nightband' }));
      chart.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(EVO_START), y2: y(EVO_START), class: 'rw-start' }));
      chart.append(svg('text', { x: W - m.r - 4, y: y(EVO_START) - 6, class: 'rw-tick', 'text-anchor': 'end' }, 'Start 0.412'));
      // The best so far as a stepped line.
      let best = EVO_START;
      let d = `M ${x(0)} ${y(best)}`;
      let lastX = x(0);
      const pts = [];
      for (const t of evoTries.slice(0, shown)) {
        const hx = x(landing(t.i, atNight));
        if (t.failed) {
          pts.push(svg('path', { d: `M ${hx - 4} ${m.t + ih - 9} l 8 8 m 0 -8 l -8 8`, class: 'rw-fail' }));
          continue;
        }
        if (t.v > best) {
          d += ` H ${hx} V ${y(t.v)}`;
          best = t.v;
          lastX = hx;
        }
        pts.push(svg('circle', { cx: hx, cy: y(t.v), r: 3.6, class: 'rw-pt' }));
      }
      const endX = shown ? x(landing(evoTries[shown - 1].i, atNight)) : lastX;
      d += ` H ${Math.max(endX, lastX)}`;
      chart.append(svg('path', { d, class: 'rw-best' }));
      for (const p of pts) chart.append(p);
      const tries = shown;
      const bestNow = evoTries.slice(0, shown).reduce((a, t) => (t.failed ? a : Math.max(a, t.v)), EVO_START);
      const more = bestNow - EVO_START;
      const nowH = shown ? landing(evoTries[shown - 1].i, atNight) : 0;
      read.textContent = shown >= 37
        ? `37 tries · best ${bestNow.toFixed(3)} · ${more.toFixed(3)} better than the start`
        : `${tries} ${tries === 1 ? 'try' : 'tries'} · best ${bestNow.toFixed(3)} · ${more.toFixed(3)} better than the start`;
      clockEl.textContent = !shown ? (atNight ? 'Waits for the night (from 23:00)' : 'Starts now') : shown >= 37 ? (atNight ? 'Done after two nights' : 'Done in about 12 hours') : atNight && nowH > 12 && nowH < 28 ? 'Waiting for the next night' : `Working · ${hhmm(nowH)}`;
    };

    const run = async () => {
      const my = ++epoch;
      shown = 0;
      draw();
      await fig.wait(600);
      for (let n = 1; n <= 37; n++) {
        if (my !== epoch) return;
        shown = n;
        draw();
        await fig.wait(atNight && n === 25 ? 700 : 180);
      }
    };

    night.addEventListener('click', () => {
      atNight = !atNight;
      night.setAttribute('aria-pressed', String(atNight));
      if (fig.reduced) {
        shown = 37;
        return draw();
      }
      run();
    });
    $('[data-act="replay"]', el).addEventListener('click', () => {
      if (fig.reduced) {
        shown = 37;
        return draw();
      }
      run();
    });

    if (fig.reduced) {
      shown = 37;
      return draw();
    }
    draw();
    run();
  });

  /* ------------------------------------------------------------- conjecture */

  const isPrime = (n) => {
    if (n < 2) return false;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
    return true;
  };
  const smallestFactor = (n) => {
    for (let d = 2; d * d <= n; d++) if (n % d === 0) return d;
    return n;
  };
  const f = (n) => n * n + n + 41;
  const catalan = (n) => {
    let c = 1;
    for (let k = 0; k < n; k++) c = (c * 2 * (2 * k + 1)) / (k + 2);
    return c;
  };

  HydorBlog.figure('research-with-agents-conjecture', (el, fig) => {
    const N = 40;
    const cases = $('[data-cases]', el);
    const line = $('[data-line]', el);
    const claim = $('[data-claim]', el);
    const range = $('[data-range]', el);
    const play = $('[data-act="play"]', el);
    const terms = $('[data-terms]', el);
    const found = $('[data-found]', el);
    const lookup = $('[data-act="lookup"]', el);
    const cells = Array.from({ length: N + 1 }, (_, n) => {
      const li = document.createElement('li');
      li.textContent = String(n);
      li.title = `n = ${n}: ${f(n)}`;
      cases.append(li);
      return li;
    });
    let at = -1; // the last case worked
    let playing = !fig.reduced;
    let looked = false;

    const draw = () => {
      cells.forEach((li, n) => {
        const worked = n <= at;
        li.className = worked ? (isPrime(f(n)) ? 'is-prime' : 'is-comp') : '';
        li.classList.toggle('is-now', n === at);
      });
      range.value = String(Math.max(0, at));
      if (at < 0) line.textContent = 'Press play to work the cases one by one.';
      else {
        const v = f(at);
        line.textContent = isPrime(v) ? `n = ${at}: ${at}² + ${at} + 41 = ${v}, prime.` : `n = ${at}: ${at}² + ${at} + 41 = ${v} = ${smallestFactor(v)} × ${v / smallestFactor(v)}, not prime.`;
        if (!isPrime(v)) line.textContent += ' The claim is false.';
      }
      const firstBad = cells.findIndex((_, n) => !isPrime(f(n)));
      const bad = at >= 0 && firstBad >= 0 && at >= firstBad;
      claim.className = `rw-claimstate ${bad ? 'is-false' : at >= 0 ? 'is-working' : ''}`;
      $('em', claim).textContent = bad ? `False: n = ${firstBad} is a counterexample` : at >= 0 ? `Holds for n = 0 … ${at} so far` : 'Open so far';
    };
    const setPlaying = (v) => {
      playing = v;
      play.setAttribute('aria-pressed', String(v));
      play.textContent = v ? 'Pause' : 'Play';
    };
    play.addEventListener('click', () => {
      if (!playing && at >= N) at = -1;
      setPlaying(!playing);
      draw();
    });
    $('[data-act="replay"]', el).addEventListener('click', () => {
      at = -1;
      acc = 0;
      setPlaying(true);
      draw();
    });
    range.addEventListener('input', () => {
      at = Number(range.value);
      setPlaying(false);
      draw();
    });

    // The sequence: the first terms are computed here, and its look-up is a button.
    const first = Array.from({ length: 7 }, (_, n) => catalan(n));
    terms.textContent = first.join(', ') + ', …';
    const reveal = (on) => {
      looked = on;
      lookup.setAttribute('aria-pressed', String(on));
      found.hidden = !on;
      if (on) {
        const next = [7, 8, 9].map(catalan);
        found.innerHTML = '';
        const a = document.createElement('a');
        a.href = 'https://oeis.org/A000108';
        a.rel = 'noopener';
        a.textContent = 'A000108';
        const b = document.createElement('b');
        b.textContent = ' the Catalan numbers, the first of 37 entries that match these seven terms';
        const p = document.createElement('p');
        p.textContent = `Only a lead: another of the 37, A024175, agrees up to 132 and then gives 428. The formula C(2n, n) / (n + 1) gives ${next.join(', ')} next, and that is what to compare with each entry's.`;
        found.append(a, b, p);
      }
    };
    lookup.addEventListener('click', () => reveal(!looked));

    let acc = 0;
    if (fig.reduced) {
      at = N;
      setPlaying(false);
      play.textContent = 'Play';
      draw();
      reveal(true);
      return;
    }
    draw();
    fig.loop((dt) => {
      if (!playing) return;
      if (at >= N) {
        acc += dt;
        if (acc > 3500) {
          acc = 0;
          setPlaying(false);
          reveal(true);
        }
        return;
      }
      acc += dt;
      if (acc >= 260) {
        acc = 0;
        at++;
        draw();
      }
    });
  });
})();
