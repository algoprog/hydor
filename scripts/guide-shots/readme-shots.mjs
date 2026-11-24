// The README's pictures of the app (docs/media/readme-*.webp): whole windows of the demo copy, like the website's,
// before readme-frame.py gives them a window's rounded corners and puts the phone over its dimmed window. Take them with
//
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots scripts/guide-shots/readme-shots.mjs --themes dark --out /tmp/readme-shots
//   python3 scripts/guide-shots/readme-frame.py /tmp/readme-shots docs/media
//
// readme-answers (the Trip planner's answer in a conversation, on its map) and readme-library (the trip's slides in the
// Library's editor) show a run and a deck that only these pictures need: prepare() adds them to the demo (demo.mjs), and
// so do the newer ones (an app sketched by the App builder, a reply with answer cards, a board).
import { ARTICLE, bringInState, browsingView, lisbonDeck, shopBoard, showcaseSessions, tripRun } from './demo.mjs';
import { sleep } from './cdp.mjs';

/** The desktop app's windows, with the Browser in the rail (a phone's screen stays a phone's). */
export const desktop = true;

const session = (ctx, name) => `/s/${encodeURIComponent(ctx.sessions[name].key)}`;

/** The Lisbon session's Trip planner run, done, with its card under the reply; and the slides made from its plan. */
export async function prepare(ctx) {
  const { template } = await ctx.api('GET', '/api/apps/tpl:trip-planner');
  const trip = tripRun(ctx.db, ctx.sessions, template);
  const deck = await lisbonDeck(ctx.api, ctx.sessions);
  // What the newer pictures show: the App builder's sketch, a reply with answer cards, the shop's board.
  const more = await showcaseSessions(ctx);
  const shop = (await ctx.api('GET', '/api/projects')).spaces.find((x) => x.name === 'Shop website')?.id;
  const board = await shopBoard(ctx.api, ctx.sessions, shop);
  return { trip, deck: deck.id, ...more, board: board.id };
}

/** The whole window on a page (a path, or a function of the demo's context), saved 1600 pixels wide, or a phone's screen. */
const whole = (id, where, { settle = 2500, width, height, phone } = {}) => ({
  id,
  width,
  height,
  phone,
  async take(p, ctx) {
    await ctx.go(typeof where === 'function' ? where(ctx) : where, { settle });
    await p.park();
    await sleep(600);
    return p.shot(ctx.file, { maxWidth: phone ? 780 : 1600 });
  },
});

/** Where an element of the app's view (in its sandboxed frame, inside `card`) is on the page, in CSS pixels. */
async function inView(p, card, find) {
  const frame = await p.box(`js:document.querySelector(${JSON.stringify(card)})?.querySelector('iframe')`);
  if (!frame) throw new Error('no view frame in the card');
  const { frameTree } = await p.send('Page.getFrameTree');
  const all = [];
  const walk = (t) => (all.push(t.frame), (t.childFrames ?? []).forEach(walk));
  walk(frameTree);
  for (const f of all.slice(1)) {
    try {
      const { executionContextId } = await p.send('Page.createIsolatedWorld', { frameId: f.id, worldName: 'shots' });
      const r = await p.send('Runtime.evaluate', { contextId: executionContextId, returnByValue: true, expression: `(() => { const el = ${find}; if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()` });
      const b = r.result?.value;
      if (b) return { x: frame.x + b.x, y: frame.y + b.y, width: b.width, height: b.height };
    } catch {}
  }
  throw new Error('not found in the view');
}

async function clickAt(p, b) {
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

/** The Trip planner's card under the agent's reply, on its Map page: each day's area on the map, in order, and the days
 * under it (the README's readme-answers, the website's trip-app). */
export const tripShot = (id) => ({
  id,
  async take(p, ctx) {
    await ctx.go(session(ctx, 'lisbon'), { settle: 2500 });
    const card = `[data-app-card="${ctx.trip}"]`;
    await p.waitFor(`!!document.querySelector(${JSON.stringify(card)})?.querySelector('iframe')`, { what: 'the Trip planner card' });
    await sleep(1500);
    const tab = `[...document.querySelectorAll('button, a, [role=tab]')].find((e) => e.textContent.trim() === 'Map')`;
    await clickAt(p, await inView(p, card, tab));
    await sleep(1500);
    // Scrolled by hand to the end, then back up a little: the map whole and the days under it, without Latest (which
    // shows over the days with more than 80 pixels below).
    const box = await p.box(`js:document.querySelector(${JSON.stringify(card)}).closest('.overflow-y-auto')`);
    await p.wheel(box.x + box.width / 2, box.y + box.height / 2, 3000);
    await sleep(1200);
    await p.wheel(box.x + box.width / 2, box.y + box.height / 2, -70);
    await sleep(2000);
    await p.park();
    await sleep(600);
    return p.shot(ctx.file);
  },
});

/** The trip's slides open in the Library's editor, on the first day's slide (readme-library, the website's library-slides). */
export const deckShot = (id) => ({
  id,
  async take(p, ctx) {
    await ctx.go(`/pages/${ctx.deck}`, { settle: 3500 });
    await p.waitFor(`document.querySelectorAll('img').length > 3`, { what: 'the slides' });
    await sleep(1000);
    await p.click('[aria-label="Slide 2"]', { wait: 1500 });
    await p.park();
    await sleep(600);
    return p.shot(ctx.file);
  },
});


const keyOf = (ctx, x) => `/s/${encodeURIComponent(x.key)}`;

/** The App builder's answer to "make me an app that writes my weekly client update": its sketch card (what it asks, what it
 * does, what you get, its questions) under the first message (readme-apps-make, the website's app-apps-make). */
export const appsMakeShot = (id) => ({
  id,
  async take(p, ctx) {
    await ctx.go(keyOf(ctx, ctx.builder), { settle: 2500 });
    await p.waitFor(`!!document.querySelector('[data-app-sketch]')`, { what: 'the sketch card' });
    await sleep(800);
    // The card's top just under the message above it.
    await p.eval(`(() => { const c = document.querySelector('[data-app-sketch]'); const box = c.closest('.overflow-y-auto'); box.scrollTop += c.getBoundingClientRect().top - box.getBoundingClientRect().top - 100; })()`);
    await sleep(900);
    await p.park();
    return p.shot(ctx.file);
  },
});

/** Word suggestions in a session's message box, as a close-up (the README shows a tile about 430 pixels wide, where the grey words
 * of a whole window are too small to see): a narrow window at nearly four times the resolution, cut to the message box and the end of
 * the reply above it, 1600×1000. What the demo has no models for is answered to the page (the same answer the app's own endpoint
 * gives, 204 while the words are not there yet): "…and would like to try one bef" with the grey rest of the word and the dimmer
 * next one (readme-suggest, the website's app-suggest). */
export const suggestShot = (id) => ({
  id,
  async take(p, ctx) {
    const typed = 'Thanks. I would like to try one bef';
    await p.route(/\/api\/suggest(\/warm)?(\?|$)/, async (req) => {
      if (req.method === 'GET' || req.url.includes('/warm')) {
        const real = await ctx.api('GET', '/api/suggest');
        return { json: { ...real, status: { ...real.status, state: 'ready', llm: { state: 'ready' }, model: { kind: 'personal', trainedAt: Date.now() - 20 * 3600_000, tokens: 184_000, languages: { eng_Latn: 0.96 } } } } };
      }
      if (req.method !== 'POST') return null;
      const text = JSON.parse(req.postData ?? '{}').text ?? '';
      if (!text.endsWith('try one bef')) return { status: 204, body: '' };
      return { json: { word: 'ore', next: ' buying', conf: 0.93, confNext: 0.71, show: true, showNext: true, plan: 'mix', lang: 'eng_Latn', ms: 14 } };
    });
    // 416 × 260 CSS pixels at 1600 / 416 times the size is 1600 × 1000.
    await p.viewport(416, 800, { scale: 1600 / 416 });
    await ctx.go(keyOf(ctx, ctx.sessions.ebike), { settle: 2500 });
    await p.click('textarea');
    await p.type(typed);
    await p.waitFor(`[...document.querySelectorAll('[aria-hidden="true"][translate="no"] span')].some((e) => e.textContent === 'ore')`, { what: 'the grey words' });
    await sleep(600);
    await p.park();
    const box = await p.box('textarea');
    const bottom = Math.min(p.size.height, Math.round(box.y + box.height + 64));
    return p.shot(ctx.file, { clip: { x: 0, y: bottom - 260, width: 416, height: 260 } });
  },
});

/** System → Experiments: the learning rate sweep's charts, its six runs (the guide's picture, as a whole window). */
export const experimentsShot = (id) => ({
  id,
  async take(p, ctx) {
    for (let i = 0; i < 90; i++) {
      const r = await ctx.api('GET', '/api/experiments/runs?status=active&limit=50').catch(() => null);
      if (r && !r.runs?.length) break;
      await sleep(1000);
    }
    await ctx.go('/system/experiments?e=dense-retriever-lr-sweep&tab=charts', { settle: 2500 });
    await p.waitFor(`document.querySelectorAll('main svg path.viz-line').length >= 12`, { timeout: 20000 }).catch(() => {});
    await sleep(1500);
    await p.park();
    return p.shot(ctx.file);
  },
});

/** The shop's board: cards pinned from replies in a grid (readme-boards, the website's app-boards). */
export const boardShot = (id) => ({
  id,
  async take(p, ctx) {
    await ctx.go(`/pages/${ctx.board}`, { settle: 3000 });
    await p.waitFor(`document.querySelectorAll('svg').length > 8`, { timeout: 15000 }).catch(() => {});
    await sleep(2500);
    await p.park();
    return p.shot(ctx.file);
  },
});

/** The checkout session working towards its goal: the bar above the message box with its rounds open (readme-goals, app-goals). */
export const goalShot = (id) => ({
  id,
  goal: 'working',
  async take(p, ctx) {
    await ctx.go(session(ctx, 'checkout'), { settle: 2500 });
    await p.click(`js:[...document.querySelectorAll('button')].filter((b) => b.textContent.trim().startsWith('Rounds')).pop()`, { wait: 900 });
    await p.park();
    await sleep(600);
    return p.shot(ctx.file);
  },
});

/** Settings → Memory → Bring in, with a ChatGPT export read into notes to pick (the helper model's proposals, answered to the page). */
export const bringInShot = (id) => ({
  id,
  async take(p, ctx) {
    await p.route(/\/api\/memory\/bring-in(\?|$)/, async (req) => (req.method === 'GET' ? { json: bringInState('/home/alex/code/shop-api') } : null));
    await ctx.go('/settings?s=memory', { settle: 2000 });
    // The button is in Your data, further down the page: pressed where it is, so the page behind stays at its top.
    await p.eval(`[...document.querySelectorAll('button')].filter((b) => b.textContent.trim().startsWith('Bring in')).pop()?.click()`);
    await sleep(1500);
    await p.waitFor(`document.body.textContent.includes('Add 7 notes')`, { what: 'the proposed notes' });
    await p.park();
    await sleep(600);
    return p.shot(ctx.file);
  },
});

/** A reply with three answer cards: a comparison table, a chart and key numbers (readme-cards, app-cards). */
export const cardsShot = (id) => ({
  id,
  async take(p, ctx) {
    await ctx.go(keyOf(ctx, ctx.cards), { settle: 3000 });
    await p.waitFor(`document.querySelectorAll('.aui[data-ui="comparison"]').length > 0`, { timeout: 15000 });
    await sleep(1800);
    // The comparison at the top, under the header, and the chart starting below it.
    await p.eval(`(() => { const c = document.querySelector('.aui[data-ui="comparison"]'); const box = c.closest('.overflow-y-auto'); box.scrollTop += c.getBoundingClientRect().top - box.getBoundingClientRect().top - 14; })()`);
    await sleep(900);
    await p.park();
    return p.shot(ctx.file);
  },
});

/** The desktop app's own Browser page (it exists only there): its bridge is the stand-in run.mjs gives every page, except that
 * `show` draws the front tab's page, a made-up article, inside the box the desktop app would lay its native view over; and the
 * browsing the server would give is answered to the page (readme-browser, the website's app-browser). */
export const browserShot = (id) => ({
  id,
  async take(p, ctx) {
    const view = browsingView();
    await p.initScript(`
      (() => {
        const html = ${JSON.stringify(ARTICLE)};
        const quiet = new Proxy({}, { get: (_, k) => (typeof k !== 'string' || k === 'then' ? undefined : k.startsWith('on') ? () => () => {} : async () => null) });
        window.hydorDesktop = { browser: new Proxy(quiet, { get: (t, k) => {
          if (k === 'show') return async (target, rect) => {
            let el = document.querySelector('[data-fake-page]')?.parentElement ?? document.elementFromPoint(rect.x + rect.w / 2, rect.y + rect.h / 2);
            if (!el) return false;
            if (!el.querySelector('[data-fake-page]')) {
              el.style.position = 'relative';
              const f = document.createElement('iframe');
              f.setAttribute('data-fake-page', '');
              f.srcdoc = html;
              f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#111418';
              el.appendChild(f);
            }
            return true;
          };
          if (k === 'hide') return async () => {};
          if (k === 'still') return undefined;
          return t[k];
        } }) };
      })();`);
    await p.route(/\/api\/browser\/(sessions\/browsing|browsing\/open)(\?|$)/, async (req) => {
      if (req.method === 'POST' && req.url.includes('/browsing/open')) return { json: { key: 'browsing', view } };
      if (req.method === 'GET') return { json: { view, options: {} } };
      return { json: { view } };
    });
    await ctx.go('/browser', { settle: 3500 });
    await p.waitFor(`!!document.querySelector('[data-fake-page]')`, { what: 'the page', timeout: 20000 });
    await sleep(1500);
    await p.park();
    return p.shot(ctx.file);
  },
});

export const SHOTS = [
  whole('readme-agents', (ctx) => session(ctx, 'checkout')),
  whole('readme-phone-screen', (ctx) => session(ctx, 'checkout'), { width: 390, height: 844, phone: true }),
  whole('readme-memory', '/settings?s=memory'),
  whole('readme-automation', '/settings?s=tasks'),
  tripShot('readme-answers'),
  deckShot('readme-library'),
  // Making your own app by describing it: the App builder's sketch.
  appsMakeShot('readme-apps-make'),
  // Word suggestions: the grey rest of the word and the next one, in a session's message box.
  suggestShot('readme-suggest'),
  // System → Experiments: a sweep's six runs on their charts.
  experimentsShot('readme-experiments'),
  // A board with cards pinned from replies (numbers, a chart, the forecast, a checklist, a split).
  boardShot('readme-boards'),
  // A session working towards a goal, its rounds open.
  goalShot('readme-goals'),
  // Settings → Memory → Bring in, a ChatGPT export read into notes to pick.
  bringInShot('readme-bring-in'),
  // A reply as cards: a comparison table, a chart and key numbers.
  cardsShot('readme-cards'),
  // The desktop app's own Browser page, with an article open and tabs in a group.
  browserShot('readme-browser'),
];
