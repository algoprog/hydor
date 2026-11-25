// The pictures of the blog post on dynamic UIs (website/src/img/blog/dynamic-uis/*.webp): real windows of the demo copy the
// guide's screenshot tool runs, dark theme only (the desktop app's look). The same question answered as plain Markdown and as
// answer cards (versus-*), five cards from the gallery at /answers (kind-*, with no pictures from the web), the checkout
// session with the boxes of its parts measured (session, session-boxes.json), and what else a reply holds or opens (more-*,
// phone-cards). prepare() adds the showcase sessions (the robot-vacuum reply with cards) and the blog's own (blogSessions in
// demo.mjs: plain, bm25, doc). Take them with
//
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots website/blog/shots/dynamic-uis.mjs --themes dark --out website/src/img/blog/dynamic-uis [--only id1,id2]
//
// after building the app in a worktree as scripts/guide-shots/README.md says.
import fs from 'node:fs';
import { sleep } from '../../../scripts/guide-shots/cdp.mjs';
import { blogSessions } from '../../../scripts/guide-shots/demo.mjs';
import { prepare as readmePrepare } from '../../../scripts/guide-shots/readme-shots.mjs';

/** The desktop app's windows, with the Browser in the rail. */
export const desktop = true;

/** Where session-boxes.json goes. */
const BOXES = '/tmp/hydor-blog-dynui-out/session-boxes.json';

/** The window of the more-* pictures (all four the same size). */
const MORE = { width: 1280, height: 900 };

export async function prepare(ctx) {
  const more = await readmePrepare(ctx);
  const blog = await blogSessions({ ...ctx, ...more });
  return { ...more, ...blog };
}

const open = (key) => `/s/${encodeURIComponent(key)}`;

/** A session's conversation: its scroller (the one that scrolls it), and where it is. */
const SCROLLER = `document.querySelector('.tl-item')?.closest('.overflow-y-auto')`;

/** Runs `expr` in each child frame of the page (the sandboxed frames the maps and views draw in); the first value that is not null. */
async function inFrames(p, expr) {
  const { frameTree } = await p.send('Page.getFrameTree');
  const all = [];
  const walk = (t) => (all.push(t.frame), (t.childFrames ?? []).forEach(walk));
  walk(frameTree);
  for (const f of all.slice(1)) {
    try {
      const { executionContextId } = await p.send('Page.createIsolatedWorld', { frameId: f.id, worldName: 'blog' });
      const r = await p.send('Runtime.evaluate', { contextId: executionContextId, returnByValue: true, expression: expr });
      if (r.result?.value != null) return r.result.value;
    } catch {}
  }
  return null;
}

/** Scrolls a session's conversation to the top with the wheel (the app's scrollers follow the reader's own scrolls only). */
async function toTop(p) {
  const b = await p.box('js:' + SCROLLER);
  await p.wheel(b.x + b.width / 2, b.y + b.height / 2, -20000);
  await sleep(500);
}

/** Hides the "Latest" button (a reader sees it when scrolled up from the end: the picture is not about it). */
const hideLatest = `(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Latest' || /^Latest/.test(b.getAttribute('aria-label') || '')) { b.style.visibility = 'hidden'; } })()`;

/** The conversation alone (right of the sidebar, between the session's header and the message box), the question at the top. Both sides of the comparison take the same clip. */
const versus = (id, pick) => ({
  id,
  async take(p, ctx) {
    await ctx.go(open(pick(ctx).key), { settle: 3000 });
    await p.waitFor(`document.querySelectorAll('main .tl-item').length > 0`, { what: 'the reply' });
    await sleep(2500);
    await toTop(p);
    await p.eval(hideLatest);
    await p.park();
    await sleep(800);
    await p.eval(hideLatest);
    const col = await p.box('js:document.querySelector("main")');
    console.log(`  ${id}: column ${JSON.stringify(col)}`);
    return p.shot(ctx.file, { clip: { x: col.x, y: 66, width: col.width, height: 614 }, maxWidth: 1600 });
  },
});

/** A card of the gallery (/answers#id), clipped to its box. No pictures from the web: the picture route fails, as it does when a picture cannot load. */
const kind = (id, { height = 1300, wait } = {}) => ({
  id: `kind-${id}`,
  height,
  async take(p, ctx) {
    await p.route(/\/api\/pages\/picture\?/, async () => ({ status: 404, body: 'no picture' }));
    await ctx.go(`/answers#${id}`, { settle: 2500 });
    const card = `section[id="${id}"] .aui[data-ui="${id}"]`;
    await p.waitFor(`!!document.querySelector(${JSON.stringify(card)})`, { what: `the ${id} card` });
    // Items above load as they come near and move this one: scroll to it until it holds still.
    let last = '';
    for (let i = 0; i < 12; i++) {
      await p.eval(`document.querySelector('section[id="${id}"]').scrollIntoView({ block: 'start' })`);
      await sleep(900);
      const b = await p.box(card);
      const now = JSON.stringify(b);
      if (now === last) break;
      last = now;
    }
    if (wait) await wait(p);
    await p.park();
    await sleep(2500);
    const b = await p.box(card);
    const h = Math.min(b.height, 1000);
    console.log(`  ${id}: card ${Math.round(b.width)}×${Math.round(b.height)} at y ${Math.round(b.y)}${b.height > 1000 ? ' (first 1000 px)' : ''}`);
    return p.shot(ctx.file, { clip: { x: b.x, y: b.y, width: b.width, height: h }, maxWidth: 1540 });
  },
});

/** The map's pins are there and its base map (MapLibre's vector tiles, a canvas under the pins) has had time to draw. */
const mapDrawn = async (p) => {
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    const n = await inFrames(p, `(() => { const m = document.querySelectorAll('.leaflet-marker-icon').length; const c = document.querySelector('.maplibregl-canvas, .leaflet-pane canvas'); return m && c ? m : null; })()`);
    if (n) return void (await sleep(5000));
    await sleep(500);
  }
  throw new Error('the map did not draw its pins');
};

/** The box of an element in the page, as fractions of the window (4 decimals). */
const frac = (b, w, h) => ({ x: +(b.x / w).toFixed(4), y: +(b.y / h).toFixed(4), width: +(b.width / w).toFixed(4), height: +(b.height / h).toFixed(4) });

const union = (a, b) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

/** The whole window on the checkout session, as website/shots.mjs takes app-session; and the boxes of its parts. */
const sessionShot = (id) => ({
  id,
  async take(p, ctx) {
    await ctx.go(open(ctx.sessions.checkout.key), { settle: 2500 });
    await p.park();
    await sleep(600);
    const by = (js) => p.box('js:' + js);
    const li = (n) => `document.querySelectorAll('main ol > li')[${n}]`;
    const boxes = {
      statusPill: await by(`(() => { const all = [...document.querySelectorAll('main header *')].filter((e) => e.textContent.trim() === 'Needs you'); return all[0] ?? null; })()`),
      summaryLine: await by(`[...document.querySelectorAll('main button')].find((b) => /^Waiting for you/.test(b.textContent.trim()))`),
      finishedParts: null,
      partUnderWay: await by(li(2)),
      approvalCard: await by(`document.querySelector('main .anim-pop')`),
      detailsButton: await by(`document.querySelector('main [data-tip="details"]')`),
      messageBox: await by(`document.querySelector('main textarea').closest('[class*="rounded-[22px]"]')`),
      sidebarRow: await by(`[...document.querySelectorAll('aside .press')].find((e) => e.textContent.includes('Fix the checkout tests'))`),
    };
    boxes.finishedParts = union(await by(li(0)), await by(li(1)));
    const { width, height } = p.size;
    const out = { window: { width, height }, note: 'x, y, width, height as fractions (0 to 1) of the window' };
    for (const [k, b] of Object.entries(boxes)) {
      if (!b) throw new Error(`no box for ${k}`);
      out[k] = frac(b, width, height);
    }
    fs.mkdirSync(BOXES.replace(/\/[^/]+$/, ''), { recursive: true });
    fs.writeFileSync(BOXES, JSON.stringify(out, null, 2) + '\n');
    return p.shot(ctx.file, { maxWidth: 1600 });
  },
});

/** Scrolls the conversation with the wheel until `find`'s element (a script) has its top `at` pixels under the scroller's top. */
async function scrollTo(p, find, at = 12) {
  for (let i = 0; i < 6; i++) {
    const sc = await p.box('js:' + SCROLLER);
    const el = await p.box('js:' + find);
    if (!el) throw new Error('nothing to scroll to');
    const d = el.y - (sc.y + at);
    if (Math.abs(d) < 3) return;
    await p.wheel(sc.x + sc.width / 2, sc.y + sc.height / 2, d);
    await sleep(300);
  }
}

/** The whole window on a session, once its reply has come. */
const moreWindow = (id, key, setup) => ({
  id,
  width: MORE.width,
  height: MORE.height,
  async take(p, ctx) {
    await ctx.go(open(key(ctx)), { settle: 3000 });
    await p.waitFor(`document.querySelectorAll('main .tl-item').length > 0`, { what: 'the reply' });
    await sleep(1500);
    await setup(p, ctx);
    await p.eval(hideLatest);
    await p.park();
    await sleep(800);
    await p.eval(hideLatest);
    return p.shot(ctx.file, { maxWidth: 1600 });
  },
});

/** The formula, the diagram and the figure of the BM25 reply, all drawn. */
const maths = async (p) => {
  await p.waitFor(`!!document.querySelector('main .katex-display, main .katex')`, { what: 'the formula' });
  await p.waitFor(`!!document.querySelector('main svg[aria-roledescription], main .mermaid svg')`, { what: 'the diagram', timeout: 30_000 });
  await p.waitFor(`!!document.querySelector('main iframe')`, { what: 'the figure' });
  const end = Date.now() + 20_000;
  while (Date.now() < end && !(await inFrames(p, `document.querySelector('#c path[d]') ? 1 : null`))) await sleep(300);
  await sleep(1500);
  await scrollTo(p, `document.querySelector('main .katex-display')`, 10);
};

export const SHOTS = [
  versus('versus-text', (ctx) => ctx.plain),
  versus('versus-cards', (ctx) => ctx.cards),
  kind('comparison'),
  kind('places', { wait: mapDrawn }),
  kind('chart'),
  kind('trace'),
  kind('fact-check'),
  sessionShot('session'),
  moreWindow('more-maths', (ctx) => ctx.bm25.key, maths),
  // The brief the agent wrote, open beside the conversation (its card's "Open beside the conversation" button).
  moreWindow('more-beside', (ctx) => ctx.doc.key, async (p) => {
    await p.click('js:document.querySelector(\'main [aria-label="Open beside the conversation"]\')', { wait: 2500 });
    await p.waitFor(`!!document.querySelector('main aside')`, { what: 'the panel beside the conversation' });
    await p.waitFor(`/Velora Ridge E5/.test(document.querySelector('main aside')?.textContent ?? '')`, { what: 'the brief in the panel' });
    await sleep(1500);
    console.log('  panel', JSON.stringify(await p.box('main aside')));
  }),
  // The reply's table full screen, at 175% with the view's own + button.
  moreWindow('more-fullscreen', (ctx) => ctx.plain.key, async (p) => {
    await p.click('main .md-table-full', { wait: 1200 });
    await p.waitFor(`!!document.querySelector('button[aria-label="Zoom in"]')`, { what: 'the full screen view' });
    for (let i = 0; i < 8; i++) {
      const at = await p.eval(`document.querySelector('[role=group][aria-label="Zoom"]')?.textContent.trim()`);
      if (at === '175%') break;
      await p.click('button[aria-label="Zoom in"]', { wait: 500 });
    }
    await sleep(800);
  }),
  // The checkout session's finished part opened, and its edit step: the file's diff.
  moreWindow('more-diff', (ctx) => ctx.sessions.checkout.key, async (p) => {
    await p.click(p.byText('Apply the discount first and round once, at the end', 'main'), { wait: 1200 });
    // Its edit step: the file's diff opens under it.
    await p.click(`js:[...document.querySelectorAll('main ol button')].find((b) => /^Edited/.test(b.textContent.trim()))`, { wait: 1500 });
    // The opened part's own line at the top of the conversation, its step and the diff under it.
    await scrollTo(p, `[...document.querySelectorAll('main ol button')].find((b) => /^Apply the discount/.test(b.textContent.trim()))`, 12);
  }),
  // A phone: the reply with cards, scrolled to the comparison card.
  {
    id: 'phone-cards',
    width: 390,
    height: 844,
    phone: true,
    async take(p, ctx) {
      await ctx.go(open(ctx.cards.key), { settle: 3000 });
      await p.waitFor(`!!document.querySelector('.aui[data-ui="comparison"]')`, { what: 'the comparison card' });
      await sleep(2500);
      await scrollTo(p, `document.querySelector('.aui[data-ui="comparison"]')`, 8);
      await p.eval(hideLatest);
      await p.park();
      await sleep(800);
      await p.eval(hideLatest);
      return p.shot(ctx.file, { maxWidth: 780 });
    },
  },
];
