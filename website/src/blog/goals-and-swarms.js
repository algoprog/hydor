/* Goals and swarms: the post's four moving figures (goal, swarm, year, judge). Each registers with HydorBlog.figure and
   draws its final state at once under reduced motion; buttons always work. */
(() => {
  'use strict';

  const $ = (sel, root) => root.querySelector(sel);
  const $$ = (sel, root) => [...root.querySelectorAll(sel)];
  const restart = (node, cls) => {
    node.classList.remove(cls);
    void node.offsetWidth; // so the transition or animation runs again
    node.classList.add(cls);
  };

  /* ------------------------------------------------------------------ goal */

  const GOAL = [
    {
      rounds: 0, money: 0, time: 0,
      c: { cmd: ['open', 'not yet'], num: ['open', '140 s', 0], rev: ['open', 'not yet'], you: ['open', 'waits for you'] },
      agent: '', app: 'Where things stand: 0 of 4 hold.', tally: [],
      read: 'Before round 1, you and the agent agree what done means: the checks, the paths it may not change and the limits. The app measures where things stand first. Here, 0 of 4 hold.',
    },
    {
      rounds: 1, money: 0.84, time: 6,
      c: { cmd: ['hold', 'holds'], num: ['open', '95 s', 0.56], rev: ['open', 'not yet'], you: ['open', 'waits for you'] },
      agent: 'I made uploads chunked, and the tests pass.', app: 'Closer: 1 of 4 hold. Round kept.', tally: [['1', 'Kept']],
      read: 'Round 1. The agent works, then the app runs every check. The number moved from 140 s to 95 s and the tests pass, so the round got things closer and is kept.',
    },
    {
      rounds: 2, money: 1.71, time: 15,
      c: { cmd: ['hold', 'holds'], num: ['open', '70 s', 0.88], rev: ['hold', 'holds'], you: ['open', 'waits for you'] },
      agent: 'Done. Everything works.', app: '"Done" counts for nothing: 2 of 4 hold. Round kept, and the goal goes on.', tally: [['1', 'Kept'], ['2', 'Kept']],
      read: 'Round 2. The agent says it is done. The app does not ask: it runs the checks, and the upload still takes 70 s against a target of 60. The goal goes on.',
    },
    {
      rounds: 3, money: 2.59, time: 24,
      c: { cmd: ['hold', 'holds'], num: ['open', '70 s', 0.88], rev: ['hold', 'holds'], you: ['open', 'waits for you'] },
      agent: 'I skipped the slow test in tests/upload.test.ts.', app: 'Undone: it changed a path it may not change. The files go back to round 2.', tally: [['1', 'Kept'], ['2', 'Kept'], ['3', 'Undone']], hit: true,
      read: 'Round 3. Skipping a slow test would make the numbers look better, but tests/ is kept safe. A round that changes it is undone, and the next round is told why.',
    },
    {
      rounds: 4, money: 3.47, time: 33,
      c: { cmd: ['hold', 'holds'], num: ['hold', '52 s', 1], rev: ['hold', 'holds'], you: ['open', 'waits for you'] },
      agent: 'Streaming upload, with progress and errors.', app: 'Everything but your check holds. The app runs the commands again and a reviewer reads the whole change.', tally: [['1', 'Kept'], ['2', 'Kept'], ['3', 'Undone'], ['4', 'Kept']],
      late: {
        c: { you: ['hold', 'you: it holds'] }, app: 'Goal reached: 4 of 4 hold, checked twice.',
      },
      read: 'Round 4. Three checks hold. Before it counts, the app runs the commands and numbers a second time and a reviewer reads the whole change for weakened tests. Then it asks you.',
    },
  ];
  const GOAL_LATE_READ = 'Round 4, after your answer. The goal is reached because the checks hold, not because anyone said so. Three rounds were kept and one undone.';

  HydorBlog.figure('goals-and-swarms-goal', (el, fig) => {
    const checks = Object.fromEntries($$('.gs-check', el).map((li) => [li.dataset.c, li]));
    const agent = $('.gs-agent', el);
    const app = $('.gs-app', el);
    const rounds = $('.gs-rounds', el);
    const read = $('.gs-readout', el);
    const lock = $('code[data-p]', el);
    const buttons = $$('[data-step]', el);
    const gauge = (g) => $(`[data-g="${g}"]`, el);
    let auto = true;
    let epoch = 0;

    const setCheck = (key, [state, text, p]) => {
      const li = checks[key];
      li.className = `gs-check is-${state}`;
      $('.gs-state em', li).textContent = text;
      if (p !== undefined) li.style.setProperty('--p', String(p));
    };
    const setGauge = (g, v, text) => {
      const node = gauge(g);
      $('b', node).textContent = text;
      node.style.setProperty('--v', String(v));
    };

    const show = (i, late = false) => {
      const s = GOAL[i];
      const state = { ...s.c, ...(late ? s.late.c : {}) };
      for (const k of Object.keys(state)) setCheck(k, state[k]);
      setGauge('rounds', s.rounds / 30, `${s.rounds} of 30`);
      setGauge('money', s.money / 5, `$${s.money.toFixed(2)} of $5.00`);
      setGauge('time', s.time / 60, `${s.time} of 60 min`);
      $('q', agent).textContent = s.agent;
      $('q', app).textContent = late ? s.late.app : s.app;
      agent.classList.toggle('is-on', Boolean(s.agent));
      app.classList.toggle('is-on', true);
      app.classList.toggle('is-bad', Boolean(s.hit));
      app.classList.toggle('is-good', late);
      restart(agent, 'gs-say');
      restart(app, 'gs-say');
      lock.classList.toggle('is-hit', Boolean(s.hit));
      rounds.replaceChildren(
        ...s.tally.map(([n, kind]) => {
          const li = document.createElement('li');
          li.className = kind === 'Kept' ? 'is-kept' : 'is-undone';
          li.textContent = `Round ${n} · ${kind}`;
          return li;
        }),
      );
      read.textContent = late ? GOAL_LATE_READ : s.read;
      for (const b of buttons) b.setAttribute('aria-pressed', String(Number(b.dataset.step) === i));
      el.classList.toggle('is-done', late);
    };

    for (const b of buttons)
      b.addEventListener('click', () => {
        auto = false;
        epoch++;
        show(Number(b.dataset.step));
      });

    if (fig.reduced) {
      show(4, true);
      return;
    }
    show(0);
    (async () => {
      while (true) {
        for (let i = 0; i < GOAL.length; i++) {
          if (!auto) return;
          const my = epoch;
          show(i);
          await fig.wait(i === 0 ? 3800 : 4200);
          if (!auto || my !== epoch) return;
        }
        if (!auto) return;
        const my = epoch;
        show(4, true);
        await fig.wait(5200);
        if (!auto || my !== epoch) return;
        show(0);
        await fig.wait(2200);
      }
    })();
  });

  /* ----------------------------------------------------------------- swarm */

  const ANGLES = ['Reproduce it under load', 'Read the retry code', 'Bisect the last 40 commits', 'Check the storage client'];
  const NEW_ANGLE = 'Stream the upload in chunks';
  const I = 'idle', R = 'run', H = 'hold', F = 'fail';
  const ST = ['Starting', 'st'], WK = ['Working', 'wk'], FIN = ['Finished', 'fin'], STOP = ['Stopped: angle used up', 'stop'];
  const WAIT = 'Waiting for the round to end';
  const SW = [
    { round: 1, lead: 'Choosing angles', m: [ST, ST, ST, ST], board: 'No posts yet', folder: [], k: [I, I, I], verdict: WAIT, log: [] },
    { round: 1, lead: 'Members started: 4 working', m: [WK, WK, WK, WK], board: 'Finding · it fails only above 1.8 GB', folder: [], k: [I, I, I], verdict: WAIT, log: [] },
    { round: 1, lead: 'Waiting for 2 members', m: [FIN, FIN, WK, WK], board: 'Finding · it fails only above 1.8 GB', folder: [['retry.ts', 'new']], k: [I, I, I], verdict: WAIT, log: [] },
    { round: 1, lead: 'Everyone has finished: the round is over', m: [FIN, FIN, FIN, FIN], board: 'Finding · retries stop after 3 tries', folder: [['retry.ts'], ['chunk.ts', 'new']], k: [R, R, R], verdict: 'Running the checks', log: [] },
    { round: 1, lead: 'Round 1 judged', m: [FIN, FIN, FIN, FIN], board: 'Finding · retries stop after 3 tries', folder: [['retry.ts'], ['chunk.ts']], k: [H, I, I], verdict: 'Closer: 1 of 3 hold. Round kept.', vc: 'kept', log: [['1', '4 members', 'Kept']] },
    { round: 2, lead: 'Putting members on what still fails', m: [WK, WK, STOP, WK], board: 'Question · does the client retry on a timeout?', folder: [['retry.ts'], ['chunk.ts']], k: [H, I, I], verdict: WAIT, log: [['1', '4 members', 'Kept']] },
    { round: 2, lead: 'Waiting for 1 member', m: [FIN, FIN, STOP, WK], board: 'Finding · the client never retries a timeout', folder: [['retry.ts'], ['chunk.ts'], ['client.ts', 'new']], k: [H, I, I], verdict: WAIT, log: [['1', '4 members', 'Kept']] },
    { round: 2, lead: 'Everyone has finished: the round is over', m: [FIN, FIN, STOP, FIN], board: 'Finding · the client never retries a timeout', folder: [['retry.ts'], ['chunk.ts'], ['client.ts']], k: [R, R, R], verdict: 'Running the checks', log: [['1', '4 members', 'Kept']] },
    { round: 2, lead: 'Round 2 judged', m: [FIN, FIN, STOP, FIN], board: 'Finding · the client never retries a timeout', folder: [['retry.ts'], ['chunk.ts'], ['client.ts', 'dim']], k: [F, I, I], verdict: 'A check that held stopped holding. Round undone, with the members\' changes.', vc: 'undone', log: [['1', '4 members', 'Kept'], ['2', '3 members', 'Undone']] },
    { round: 3, lead: 'Members stay and remember. A new angle starts.', m: [WK, WK, ['New angle', 'new'], WK], angle2: NEW_ANGLE, board: 'Finding · streaming keeps memory flat', folder: [['retry.ts'], ['chunk.ts']], k: [H, I, I], verdict: WAIT, log: [['1', '4 members', 'Kept'], ['2', '3 members', 'Undone']] },
    { round: 3, lead: 'Waiting for 1 member', m: [FIN, FIN, FIN, WK], angle2: NEW_ANGLE, board: 'Finding · streaming keeps memory flat', folder: [['retry.ts'], ['chunk.ts'], ['stream.ts', 'new']], k: [H, I, I], verdict: WAIT, log: [['1', '4 members', 'Kept'], ['2', '3 members', 'Undone']] },
    { round: 3, lead: 'Everyone has finished: the round is over', m: [FIN, FIN, FIN, FIN], angle2: NEW_ANGLE, board: 'Finding · streaming keeps memory flat', folder: [['retry.ts'], ['chunk.ts'], ['stream.ts']], k: [R, R, R], verdict: 'Running the checks', log: [['1', '4 members', 'Kept'], ['2', '3 members', 'Undone']] },
    { round: 3, lead: 'Round 3 judged', m: [FIN, FIN, FIN, FIN], angle2: NEW_ANGLE, board: 'Finding · streaming keeps memory flat', folder: [['retry.ts'], ['chunk.ts'], ['stream.ts']], k: [H, H, H], verdict: 'All 3 hold. The app runs them again and a reviewer reads the whole change.', vc: 'kept', log: [['1', '4 members', 'Kept'], ['2', '3 members', 'Undone'], ['3', '4 members', 'Kept']] },
    { round: 3, lead: 'Round 3 judged', m: [FIN, FIN, FIN, FIN], angle2: NEW_ANGLE, board: 'Finding · streaming keeps memory flat', folder: [['retry.ts'], ['chunk.ts'], ['stream.ts']], k: [H, H, H], verdict: 'Goal reached. The checks said so, not the lead.', vc: 'done', log: [['1', '4 members', 'Kept'], ['2', '3 members', 'Undone'], ['3', '4 members', 'Kept']] },
  ];
  const SW_MS = [2200, 2400, 2400, 2400, 3000, 2400, 2400, 2400, 3400, 2400, 2400, 2400, 3000, 5000];

  HydorBlog.figure('goals-and-swarms-swarm', (el, fig) => {
    const lead = $('[data-lead]', el);
    const leadText = $('[data-lead-text]', el);
    const roundNode = $('[data-round]', el);
    const members = $$('[data-m]', el);
    const board = $('[data-board]', el);
    const folder = $('[data-folder]', el);
    const checks = $$('[data-k]', el);
    const verdict = $('[data-verdict]', el);
    const log = $('[data-log]', el);
    const sr = $('[data-sr]', el);
    const pause = $('[data-act="pause"]', el);
    let i = 0;
    let paused = false;
    let epoch = 0;

    const show = (n, quiet) => {
      i = n;
      const s = SW[n];
      roundNode.textContent = `Round ${s.round} of 30`;
      leadText.textContent = s.lead;
      lead.classList.toggle('is-on', /waiting|started|Putting|Choosing|new angle/i.test(s.lead));
      members.forEach((li, k) => {
        const [text, cls] = s.m[k];
        li.className = `is-${cls}`;
        $('em', li).textContent = text;
        $('.gs-sw-angle', li).textContent = k === 2 && s.angle2 ? s.angle2 : ANGLES[k];
      });
      const boardChanged = board.textContent !== s.board;
      board.textContent = s.board;
      if (boardChanged) restart(board, 'gs-say');
      folder.replaceChildren(
        ...(s.folder.length
          ? s.folder.map(([name, cls]) => {
              const li = document.createElement('li');
              li.textContent = name;
              if (cls) li.className = `is-${cls}`;
              return li;
            })
          : [Object.assign(document.createElement('li'), { className: 'gs-sw-empty', textContent: 'no changes yet' })]),
      );
      checks.forEach((li, k) => {
        li.className = `is-${s.k[k]}`;
      });
      const verdictChanged = verdict.textContent !== s.verdict;
      verdict.textContent = s.verdict;
      verdict.className = `gs-sw-verdict ${s.vc ? `is-${s.vc}` : ''}`;
      if (verdictChanged) restart(verdict, 'gs-say');
      log.replaceChildren(
        ...s.log.map(([r, who, kind]) => {
          const li = document.createElement('li');
          li.className = kind === 'Kept' ? 'is-kept' : 'is-undone';
          li.textContent = `Round ${r} · ${who} · ${kind}`;
          return li;
        }),
      );
      if (!quiet && s.vc) sr.textContent = `Round ${s.round}: ${s.verdict}`;
    };

    const setPaused = (v) => {
      paused = v;
      pause.setAttribute('aria-pressed', String(v));
      pause.textContent = v ? 'Play' : 'Pause';
    };
    pause.addEventListener('click', () => setPaused(!paused));
    $('[data-act="step"]', el).addEventListener('click', () => {
      setPaused(true);
      epoch++;
      show((i + 1) % SW.length);
    });
    $('[data-act="restart"]', el).addEventListener('click', () => {
      setPaused(false);
      epoch++;
      show(0);
    });

    if (fig.reduced) {
      pause.hidden = true;
      show(SW.length - 1, true);
      return;
    }
    show(0, true);
    (async () => {
      while (true) {
        const my = epoch;
        await fig.wait(SW_MS[i]);
        if (my !== epoch || paused) continue;
        show((i + 1) % SW.length);
      }
    })();
  });

  /* ------------------------------------------------------------------ year */

  HydorBlog.figure('goals-and-swarms-year', (el) => {
    const cards = $$('.gs-yc', el);
    const buttons = $$('[data-kind]', $('.fig-controls', el));
    const count = $('[data-count]', el);
    const names = { all: 'all results', math: 'mathematics', sec: 'security', bad: 'what went wrong' };
    for (const b of buttons)
      b.addEventListener('click', () => {
        const kind = b.dataset.kind;
        for (const o of buttons) o.setAttribute('aria-pressed', String(o === b));
        let n = 0;
        for (const c of cards) {
          const on = kind === 'all' || c.dataset.kind === kind;
          c.hidden = !on;
          if (on) {
            n++;
            restart(c, 'gs-rise');
          }
        }
        count.textContent = `Showing ${n} ${n === 1 ? 'result' : 'results'}: ${names[kind]}.`;
      });
  });

  /* ----------------------------------------------------------------- judge */

  HydorBlog.figure('goals-and-swarms-judge', (el, fig) => {
    const REAL = 37;
    const ALL = 71;
    const wall = $('.gs-ju-wall', el);
    const stage = $('.gs-ju', el);
    const clock = $('[data-clock]', el);
    const nWord = $('[data-n-word]', el);
    const nHold = $('[data-n-hold]', el);
    const holdLabel = $('[data-hold-label]', el);
    const note = $('[data-note]', el);
    const buttons = $$('[data-mode]', el);
    const cells = Array.from({ length: ALL }, (_, k) => {
      const li = document.createElement('li');
      if (k >= REAL) li.className = 'is-x';
      wall.append(li);
      return li;
    });
    let mode = 'word';
    let filled = 0;
    let phase = 'real';
    let auto = true;

    const NOTE = {
      real: 'The first 37 conjectures are solved with real proofs, in just under an hour.',
      exploit: 'An agent finds a way to redefine the terms of the problem. Others reverse-engineer it and copy it.',
      word: 'Nobody checks the proofs in detail, so all 71 count. 14 agents cheated, and 24 blew the whistle but could not take the results away.',
      checks: 'Only what holds counts. The 34 that were marked solved by the exploit do not hold.',
    };
    const CLOCK = { real: 'Real proofs', exploit: 'The next 27 minutes', word: 'Counted by the agents', checks: 'Counted by checks' };

    const draw = () => {
      cells.forEach((c, k) => c.classList.toggle('on', k < filled));
      const counted = mode === 'word' ? filled : Math.min(filled, REAL);
      nWord.textContent = `${filled} of ${ALL}`;
      nHold.textContent = `${counted} of ${ALL}`;
      holdLabel.textContent = mode === 'word' ? 'counted, on the agents\' word' : 'counted, by checks the app runs';
      stage.dataset.mode = mode;
      for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    };
    const say = (p) => {
      phase = p;
      note.textContent = NOTE[p];
      clock.textContent = CLOCK[p];
    };
    const full = (m) => {
      mode = m;
      filled = ALL;
      say(m);
      draw();
    };

    for (const b of buttons)
      b.addEventListener('click', () => {
        auto = false;
        full(b.dataset.mode);
      });

    if (fig.reduced) {
      full('checks');
      return;
    }
    say('real');
    draw();
    (async () => {
      while (auto) {
        mode = 'word';
        filled = 0;
        say('real');
        draw();
        await fig.wait(900);
        for (let k = 1; k <= REAL && auto; k++) {
          filled = k;
          draw();
          await fig.wait(70);
        }
        if (!auto) return;
        await fig.wait(800);
        say('exploit');
        for (let k = REAL + 1; k <= ALL && auto; k++) {
          filled = k;
          draw();
          await fig.wait(95);
        }
        if (!auto) return;
        say('word');
        draw();
        await fig.wait(4800);
        if (!auto) return;
        mode = 'checks';
        say('checks');
        draw();
        await fig.wait(5200);
      }
    })();
  });
})();
