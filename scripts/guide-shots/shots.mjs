// Every screenshot in the guide: which page, what to open on it, and which part to keep. `take` returns the file's
// size; `ctx.go` opens a page of the demo app, `ctx.file` is where the picture goes.
import { sleep } from './cdp.mjs';

/** The part of the window right of the sidebar, down to `bottom` (CSS pixels) when given. */
async function main(p, bottom) {
  const aside = await p.box('aside');
  const x = aside ? Math.round(aside.x + aside.width) : 0;
  return { x, y: 0, width: p.size.width - x, height: Math.min(p.size.height, bottom ?? p.size.height) };
}

/** Where the last of these elements ends, plus some room. */
async function bottomOf(p, target, pad = 28) {
  const b = await p.box(target);
  if (!b) throw new Error(`nothing found for ${target}`);
  return Math.ceil(b.y + b.height + pad);
}

/** A box around elements (selectors or js:…), with some room, kept inside the window. */
async function around(p, targets, pad = 16) {
  const boxes = (await Promise.all(targets.map((t) => p.box(t)))).filter(Boolean);
  if (!boxes.length) throw new Error(`nothing found for ${targets.join(', ')}`);
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const x1 = Math.min(p.size.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const y1 = Math.min(p.size.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The last element matching a selector, as a js: target. */
const last = (sel) => `js:[...document.querySelectorAll(${JSON.stringify(sel)})].pop()`;
/** The innermost button whose text starts with `text`. */
const button = (text) => `js:[...document.querySelectorAll('button')].filter((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})).pop()`;

/** The card (or row) holding an element whose own text is `text`. */
const cardWith = (text, cls = '.rounded-2xl') =>
  `js:(() => { const el = [...document.querySelectorAll('body *')].find((e) => e.textContent.trim() === ${JSON.stringify(text)} && ![...e.children].some((c) => c.textContent.trim() === ${JSON.stringify(text)})); return el?.closest(${JSON.stringify(cls)}) ?? el; })()`;

/** The card holding the first of these texts that the page shows (as cardWith). */
const cardWithAny = (texts, cls = '.rounded-2xl') =>
  `js:(() => { for (const t of ${JSON.stringify(texts)}) { const el = [...document.querySelectorAll('body *')].find((e) => e.textContent.trim() === t && ![...e.children].some((c) => c.textContent.trim() === t)); if (el) return el.closest(${JSON.stringify(cls)}) ?? el; } return null; })()`;

/** The smallest button in `scope` whose text has `text` in it. */
const chip = (scope, text) =>
  `js:[...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].filter((b) => b.textContent.includes(${JSON.stringify(text)})).sort((a, b) => a.textContent.length - b.textContent.length)[0]`;

const session = (ctx, name) => `/s/${encodeURIComponent(ctx.sessions[name].key)}`;

/** A session's conversation, its steps opened when `unfold` names their summary line. */
const sessionShot = (id, name, o = {}) => ({
  id,
  height: o.height ?? 960,
  async take(p, ctx) {
    await ctx.go(session(ctx, name), { settle: 2000 });
    for (const t of o.unfold ?? []) await p.click(button(t), { wait: 700 });
    await p.park();
    await sleep(500);
    return p.shot(ctx.file, { clip: await main(p) });
  },
});

/** Settings: the section, with the tabs and the menu beside it, down to `until`'s end when given. */
const settingsShot = (id, section, o = {}) => ({
  id,
  height: o.height ?? 800,
  async take(p, ctx) {
    await ctx.go(`/settings?s=${section}`, { settle: 1500 });
    if (o.prepare) await o.prepare(p, ctx);
    // The part to keep can come a moment after the page (a list it asks the server for): wait for it a while.
    if (o.until) await p.waitFor(o.until.startsWith('js:') ? o.until.slice(3) : `document.querySelector(${JSON.stringify(o.until)})`, { timeout: 8000 }).catch(() => {});
    await p.park();
    await sleep(300);
    return p.shot(ctx.file, { clip: await main(p, o.until ? await bottomOf(p, o.until) : undefined) });
  },
});

/** The start page with one of the message box's menus open. */
const startMenu = (id, label, o = {}) => ({
  id,
  height: o.height ?? 800,
  async take(p, ctx) {
    await ctx.go('/', { settle: 1500 });
    if (o.text) {
      await p.click('textarea');
      await p.type(o.text);
    }
    await p.click(chip('[data-tour="composer"]', label), { wait: 700 });
    if (o.then) await o.then(p);
    await p.park();
    await sleep(400);
    // A menu shown alone is cut at its own edge: around it, the page behind shows in slices.
    return p.shot(ctx.file, { clip: o.alone ? await around(p, [last('[role="dialog"]')], 0) : await around(p, ['[data-tour="composer"]', last('[role="dialog"]')], 24) });
  },
});

export const SHOTS = [
  {
    id: 'start',
    async take(p, ctx) {
      await ctx.go('/', { settle: 1500 });
      await p.click('textarea');
      await p.type('Plan a 4-day trip to Lisbon in May: two adults, mid-range hotels, lots of walking.');
      await p.park();
      await sleep(400);
      return p.shot(ctx.file);
    },
  },
  sessionShot('sessions', 'checkout'),
  sessionShot('ask-agents', 'settings', { unfold: ['Read 2'] }),
  sessionShot('web', 'ebike', { height: 1000, unfold: ['Worked for', 'Searched 3'] }),
  sessionShot('documents-voice', 'report', { unfold: ['Worked for', 'Ran 1 command'] }),
  {
    id: 'projects',
    async take(p, ctx) {
      await ctx.go('/projects', { settle: 1500 });
      await p.park();
      return p.shot(ctx.file, { clip: await main(p, await bottomOf(p, last('main .grid > *, .grid > button'), 36)) });
    },
  },
  {
    // The Apps page: what apps are, finding one, your own apps, and the first kind of ready-made ones.
    id: 'apps',
    height: 1240,
    async take(p, ctx) {
      await ctx.go('/apps', { settle: 1500 });
      await p.park();
      const firstKind = `js:[...document.querySelectorAll('main section')].find((s) => /Ready-made apps/.test(s.querySelector('h2')?.textContent ?? ''))?.querySelector('.grid')?.lastElementChild`;
      return p.shot(ctx.file, { clip: await main(p, await bottomOf(p, firstKind, 24)) });
    },
  },
  {
    // The Library: its places beside the cards, each project's things under its name, then those in no project.
    id: 'library',
    height: 900,
    async take(p, ctx) {
      await ctx.go('/library', { settle: 2500 });
      await p.park();
      await sleep(600);
      return p.shot(ctx.file, { clip: await main(p, 700) });
    },
  },
  {
    id: 'inbox',
    height: 900,
    async take(p, ctx) {
      await ctx.go('/inbox', { settle: 1500 });
      await p.park();
      return p.shot(ctx.file, { clip: await main(p, await bottomOf(p, last('main .rounded-xl'), 32)) });
    },
  },
  {
    id: 'usage',
    async take(p, ctx) {
      await ctx.go('/usage', { settle: 1500 });
      await p.park();
      return p.shot(ctx.file, { clip: await main(p, await bottomOf(p, last('main .rounded-2xl'), 32)) });
    },
  },
  {
    id: 'files-git',
    async take(p, ctx) {
      await ctx.go(`/git?path=${encodeURIComponent(ctx.sessions.checkout.cwd)}`, { settle: 2000 });
      await p.park();
      return p.shot(ctx.file, { clip: await main(p) });
    },
  },
  {
    id: 'devices',
    phone: true,
    width: 390,
    height: 844,
    async take(p, ctx) {
      await ctx.go(session(ctx, 'checkout'), { settle: 2500 });
      return p.shot(ctx.file, { maxWidth: 780 });
    },
  },
  startMenu('assistants', 'General'),
  startMenu('agents-models', 'Claude Code'),
  startMenu('research', 'Options', {
    text: 'Which heat pumps work best below −20 °C? Compare the models sold in Maine.',
    alone: true,
    then: async (p) => {
      await p.click(chip('[role="dialog"]', 'Research'), { wait: 700 });
      await p.click(chip('[role="dialog"]', 'Deep research'), { wait: 700 });
    },
  }),
  settingsShot('guidelines', 'guidelines', { until: button('The garden') }),
  // The switches and the first notes fit in one picture.
  settingsShot('memory', 'memory', { height: 900 }),
  // The list's card, by the first of the demo's tasks there: those due within three hours are left out (demo.mjs).
  settingsShot('tasks', 'tasks', { until: cardWithAny(['Water the greenhouse reminder', 'Weekly shop report', 'Ridge E5 price watch', 'Morning brief']) }),
  settingsShot('skills', 'skills'),
  settingsShot('plugins', 'plugins'),
  {
    // System → Experiments: the queue's line, the GPUs (made up: demo.mjs) and the demo's runs, by experiment.
    id: 'experiments',
    height: 860,
    async take(p, ctx) {
      await ctx.go('/system/experiments', { settle: 2500 });
      await p.waitFor(`[...document.querySelectorAll('main *')].some((e) => /hard negatives/.test(e.textContent))`, { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      await p.park();
      return p.shot(ctx.file, { clip: await main(p) });
    },
  },
  {
    // The Apps page with only the apps for research: Paper radar and the others.
    id: 'researchers',
    height: 1000,
    async take(p, ctx) {
      await ctx.go('/apps', { settle: 1500 });
      await p.click(chip('main', 'Research'), { wait: 800 });
      await p.park();
      return p.shot(ctx.file, { clip: await main(p) });
    },
  },
  {
    // Settings → Scheduled tasks: the examples for engineering (CI doctor and the others).
    id: 'engineering',
    height: 900,
    async take(p, ctx) {
      await ctx.go('/settings?s=tasks', { settle: 1500 });
      const group = `js:[...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Engineering')?.parentElement`;
      await p.eval(`(${group.slice(3)})?.scrollIntoView({ block: 'center' })`);
      await sleep(500);
      await p.park();
      return p.shot(ctx.file, { clip: await around(p, [group], 12) });
    },
  },
  {
    // Apps → Connected apps: the services connected for every agent, the marketplace and the keys, as tabs.
    id: 'connections',
    async take(p, ctx) {
      await ctx.go('/apps/connected?tab=market', { settle: 1800 });
      await p.park();
      return p.shot(ctx.file, { clip: await main(p) });
    },
  },
  settingsShot('custom', 'models', { height: 900 }),
  settingsShot('app', 'general', { until: button('Import') }),
];

export { around, main };
