// Every screenshot in the guide: which page, what to open on it, and which part to keep. `take` returns the file's
// size; `ctx.go` opens a page of the demo app, `ctx.file` is where the picture goes.
import { createRequire } from 'node:module';
import path from 'node:path';
import { sleep } from './cdp.mjs';
import { projectsWork } from './demo.mjs';

/**
 * The part of the window right of the rail and of the sessions sidebar (on the start page and in sessions), down to
 * `bottom` (CSS pixels) when given. A page's own column (Settings' sections, the Apps page's places) stays in: it is part of
 * the page the guide shows.
 */
async function main(p, bottom) {
  const rail = await p.box('nav[data-rail]');
  const side = await p.box('aside[data-tour="sidebar"]');
  const x = Math.round(Math.max(rail ? rail.x + rail.width : 0, side ? side.x + side.width : 0));
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

/** What the Projects picture shows beyond the demo: earlier work in the projects (demo.mjs) and the Thesis project shared with two people. Returns what takes them out again. */
async function projectsExtras(ctx) {
  const Database = createRequire(import.meta.url)('better-sqlite3');
  const work = (on) => {
    const db = new Database(path.join(ctx.home, '.hydor', 'hydor.db'));
    db.pragma('busy_timeout = 5000');
    try {
      projectsWork(db, ctx.sessions, Date.now(), on);
    } finally {
      db.close();
    }
  };
  work(true);
  const thesis = (await ctx.api('GET', '/api/projects')).spaces.find((x) => x.name === 'Thesis')?.id;
  const shares = [];
  if (thesis) for (const name of ['Maria Lopez', 'Nikos Papas']) shares.push((await ctx.api('POST', `/api/projects/${thesis}/shares`, { name })).share.id);
  return async () => {
    work(false);
    for (const id of shares) await ctx.api('DELETE', `/api/projects/${thesis}/shares/${id}`).catch(() => {});
  };
}

/** The last element matching a selector, as a js: target. */
const last = (sel) => `js:[...document.querySelectorAll(${JSON.stringify(sel)})].pop()`;
/** The innermost button whose text starts with `text`. */
const button = (text) => `js:[...document.querySelectorAll('button')].filter((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})).pop()`;
/** A button or an element that acts as one (a row with role=button) whose text starts with `text`. */
const anyButton = (text) => `js:[...document.querySelectorAll('button, [role="button"]')].filter((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})).pop()`;

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
    if (o.rounds) await p.click(button('Rounds'), { wait: 700 });
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
    if (o.before) await o.before(ctx);
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
  // The same session with a goal at work (overrides in demo.mjs answers the page with it): its bar above the message box.
  { ...sessionShot('goals', 'checkout', { rounds: true }), goal: 'working' },
  sessionShot('ask-agents', 'settings', { unfold: ['Read 2'] }),
  sessionShot('web', 'ebike', { height: 1000, unfold: ['Worked for', 'Look for recent reviews'] }),
  sessionShot('documents-voice', 'report', { unfold: ['Worked for', 'Read the report first'] }),
  {
    // A project's details: its own page in the Projects section, on Overview (the Thesis project, with its newest files,
    // four weeks of work and two people it is shared with, taken out again after it).
    id: 'projects',
    height: 860,
    async take(p, ctx) {
      const undo = await projectsExtras(ctx);
      try {
        const id = (await ctx.api('GET', '/api/projects')).spaces.find((x) => x.name === 'Thesis')?.id;
        await ctx.go(`/projects/${id}`, { settle: 2000 });
        // The Files card's six tiles: five pictures (the pages' are drawn a moment after the demo made them) and a note's first lines.
        await p.waitFor(`[...document.querySelectorAll('main img')].filter((i) => i.complete && i.naturalWidth).length >= 5`, { timeout: 45000 }).catch(() => {});
        await p.park();
        await sleep(600);
        return await p.shot(ctx.file);
      } finally {
        await undo();
      }
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
    // A project's Files: the Thesis project's page on Files, its folders, what was kept in it and its folder's files
    // as tiles, each with its picture.
    id: 'library',
    height: 860,
    async take(p, ctx) {
      const id = (await ctx.api('GET', '/api/projects')).spaces.find((x) => x.name === 'Thesis')?.id;
      await ctx.go(`/projects/${id}/files`, { settle: 2500 });
      await p.waitFor(`[...document.querySelectorAll('main img')].filter((i) => i.complete && i.naturalWidth).length >= 6`, { timeout: 45000 }).catch(() => {});
      await p.park();
      await sleep(800);
      return p.shot(ctx.file);
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
  {
    id: 'agents',
    async take(p, ctx) {
      await ctx.go('/agents', { settle: 1800 });
      await p.park();
      return p.shot(ctx.file, { clip: await main(p) });
    },
  },
  startMenu('agents-models', 'Claude Code'),
  startMenu('research', 'Options', {
    text: 'Which heat pumps work best below −20 °C? Compare the models sold in Maine.',
    alone: true,
    // Deep research explained already (it is, after its first use): picking it shows its settings, not the explanation.
    before: (ctx) => ctx.api('PUT', '/api/tips', { explained: ['research'] }),
    then: async (p) => {
      await p.click(chip('[role="dialog"]', 'Research'), { wait: 700 });
      await p.click(chip('[role="dialog"]', 'Deep research'), { wait: 700 });
    },
  }),
  settingsShot('guidelines', 'guidelines', { until: anyButton('The garden') }),
  // The switches and the first notes fit in one picture.
  settingsShot('memory', 'memory', { height: 1101 }),
  {
    // A project's Memory tab on its Wiki chip, on the project's page: the wiki's areas as chips, one area's
    // list (its overview first, then its articles) and that overview open in the pane on the right.
    id: 'wiki-memory',
    height: 860,
    async take(p, ctx) {
      const id = (await ctx.api('GET', '/api/projects')).spaces.find((x) => x.name === 'Thesis')?.id;
      await ctx.go(`/projects/${id}/memory?part=wiki`, { settle: 2000 });
      // The area's chip (the first button with its name: the list's row comes after the chips), then its overview, the first row of its list.
      const named = (which) =>
        `js:[...document.querySelectorAll('main button, main [role="button"]')].filter((b) => b.textContent.trim().startsWith('Library use and services'))${which}`;
      await p.click(named('[0]'), { wait: 900 });
      await p.click(named('.pop()'), { wait: 900 });
      await p.park();
      return p.shot(ctx.file);
    },
  },
  // The list's card, by the first of the demo's tasks there: those due within three hours are left out (demo.mjs).
  settingsShot('tasks', 'tasks', { until: cardWithAny(['Water the greenhouse reminder', 'Weekly shop report', 'Ridge E5 price watch', 'Morning brief'], '.rounded-xl') }),
  settingsShot('skills', 'skills', { height: 979 }),
  settingsShot('plugins', 'plugins', { height: 979 }),
  {
    // Experiments: the column of experiments by category, the queue and the GPUs (made up: run.mjs), and an
    // experiment's Charts tab: the demo's learning rate and batch size sweep, its six runs' curves (demo.mjs makes the
    // runs, on the CPU, and their titles). Its runs end within seconds of the demo's start; the shot waits for them.
    id: 'experiments',
    height: 860,
    async take(p, ctx) {
      for (let i = 0; i < 90; i++) {
        const r = await ctx.api('GET', '/api/experiments/runs?status=active&limit=50').catch(() => null);
        if (r && !r.runs?.length) break;
        await sleep(1000);
      }
      await ctx.go('/experiments?e=dense-retriever-lr-sweep&tab=charts', { settle: 2500 });
      await p.waitFor(`document.querySelectorAll('main svg path.viz-line').length >= 12`, { timeout: 20000 }).catch(() => {});
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
      // A kind is a place in the Apps page's column (and in its address) on a computer.
      await ctx.go('/apps?kind=Research', { settle: 1500 });
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
      // The examples are one group, "Start from an example", showing a few until "Show all examples" is pressed.
      await p.eval(`(${button('Show all examples').slice(3)})?.scrollIntoView({ block: 'center' })`);
      await sleep(300);
      await p.click(button('Show all examples'));
      await sleep(600);
      // The five engineering examples sit together in the list: keep just those rows.
      const first = anyButton('Review new pull requests');
      const lastRow = anyButton('Incident first responder');
      await p.eval(`(${first.slice(3)})?.scrollIntoView({ block: 'center' })`);
      await sleep(500);
      await p.park();
      return p.shot(ctx.file, { clip: await around(p, [first, lastRow], 12) });
    },
  },
  {
    // Apps → Connected apps (the last place in the Apps page's column): the services connected for every agent, the marketplace and the keys.
    id: 'connections',
    async take(p, ctx) {
      await ctx.go('/apps/connected?tab=market', { settle: 1800 });
      await p.park();
      return p.shot(ctx.file, { clip: await main(p) });
    },
  },
  {
    // Jobs: what runs in the background and how long it has left, what waits (and for what), and a server left running;
    // what finished lately is below the cut. The demo runs nothing, so the page is answered with made-up jobs (`jobs`:
    // demo.mjs, run.mjs).
    id: 'jobs',
    jobs: true,
    height: 1300,
    async take(p, ctx) {
      await ctx.go('/jobs', { settle: 1800 });
      await p.park();
      const servers = `js:[...document.querySelectorAll('main section')].find((s) => s.querySelector('h2')?.textContent === 'Servers')`;
      return p.shot(ctx.file, { clip: await main(p, await bottomOf(p, servers, 14)) });
    },
  },
  settingsShot('custom', 'models', { height: 1101 }),
  settingsShot('app', 'general', { until: button('Import') }),
];

export { around, main };
