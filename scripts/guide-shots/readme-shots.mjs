// The README's pictures of the app (docs/media/readme-*.webp): whole windows of the demo copy, like the website's,
// before readme-frame.py gives them a window's rounded corners and puts the phone over its dimmed window. Take them with
//
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots scripts/guide-shots/readme-shots.mjs --themes dark --out /tmp/readme-shots
//   python3 scripts/guide-shots/readme-frame.py /tmp/readme-shots docs/media
//
// readme-answers (the Trip planner's answer in a conversation, on its map) and readme-library (the trip's slides in the
// Library's editor) show a run and a deck that only these pictures need: prepare() adds them to the demo (demo.mjs).
import { lisbonDeck, tripRun } from './demo.mjs';
import { sleep } from './cdp.mjs';

/** The desktop app's windows, with the Browser in the rail (a phone's screen stays a phone's). */
export const desktop = true;

const session = (ctx, name) => `/s/${encodeURIComponent(ctx.sessions[name].key)}`;

/** The Lisbon session's Trip planner run, done, with its card under the reply; and the slides made from its plan. */
export async function prepare(ctx) {
  const { template } = await ctx.api('GET', '/api/apps/tpl:trip-planner');
  const trip = tripRun(ctx.db, ctx.sessions, template);
  const deck = await lisbonDeck(ctx.api, ctx.sessions);
  return { trip, deck: deck.id };
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

export const SHOTS = [
  whole('readme-agents', (ctx) => session(ctx, 'checkout')),
  whole('readme-phone-screen', (ctx) => session(ctx, 'checkout'), { width: 390, height: 844, phone: true }),
  whole('readme-memory', '/settings?s=memory'),
  whole('readme-automation', '/settings?s=tasks'),
  tripShot('readme-answers'),
  deckShot('readme-library'),
];
