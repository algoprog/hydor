// The made-up world the guide's screenshots show: Alex's folders and a small git repository, sessions as Claude
// Code transcripts, and what the app's own API keeps (spaces, guidelines, memory, tasks, pages, apps).
// Nothing here comes from a real account. What can't be made through the app (an agent waiting on a card, plan
// limits, the inbox) is answered to the page instead (`overrides`).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPage, formatSearch } from '../../shared/search.ts';

/** Pictures and clips an agent made, for the conversation and the Library (made with OpenRouter, kept small). */
const MEDIA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'media');
/** The repository, for the made-up files its tests keep (a study as a PDF). */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const EMAIL = 'alex@example.com';

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const uuid = () => crypto.randomUUID();

// ---- files and folders -------------------------------------------------------------------------------

const TOTAL_BEFORE = `import type { Cart } from '../cart';

/** The cart's total in cents: items, then the discount, then tax. */
export function total(cart: Cart, taxRate: number): number {
  let sum = 0;
  for (const item of cart.items) {
    const line = item.price * item.qty * (1 + taxRate);
    sum += Math.round(line);
  }
  if (cart.discount) sum -= Math.round(sum * cart.discount);
  return sum;
}
`;

const TOTAL_AFTER = `import type { Cart } from '../cart';

/** The cart's total in cents: items, then the discount, then tax, rounded once at the end. */
export function total(cart: Cart, taxRate: number): number {
  let sum = 0;
  for (const item of cart.items) sum += item.price * item.qty;
  if (cart.discount) sum *= 1 - cart.discount;
  return Math.round(sum * (1 + taxRate));
}
`;

const git = (cwd, args, home, date) =>
  execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH,
      HOME: home,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Alex Rivera',
      GIT_AUTHOR_EMAIL: EMAIL,
      GIT_COMMITTER_NAME: 'Alex Rivera',
      GIT_COMMITTER_EMAIL: EMAIL,
      ...(date ? { GIT_AUTHOR_DATE: new Date(date).toISOString(), GIT_COMMITTER_DATE: new Date(date).toISOString() } : {}),
    },
  });

/** Alex's home: two code projects (one a git repository with history, a commit not pushed and a change not yet committed), documents, task folders. */
export function makeFiles(home, now) {
  const shop = path.join(home, 'code/shop-api');
  write(path.join(shop, 'README.md'), '# Shop API\n\nThe online shop\'s API: carts, checkout and orders.\n\n```bash\nnpm install\nnpm test\n```\n');
  write(path.join(shop, 'package.json'), JSON.stringify({ name: 'shop-api', version: '1.4.0', type: 'module', scripts: { test: 'vitest run', dev: 'tsx watch src/server.ts' } }, null, 2) + '\n');
  write(path.join(shop, 'src/cart.ts'), "export interface Item {\n  sku: string;\n  price: number; // cents\n  qty: number;\n}\n\nexport interface Cart {\n  items: Item[];\n  /** 0.1 for 10% off. */\n  discount?: number;\n}\n");
  write(path.join(shop, 'src/server.ts'), "import { createServer } from './http';\nimport { routes } from './routes';\n\ncreateServer(routes).listen(3000);\n");
  write(path.join(shop, 'src/checkout/total.ts'), TOTAL_BEFORE);
  write(
    path.join(shop, 'src/checkout/total.test.ts'),
    "import { expect, test } from 'vitest';\nimport { total } from './total';\n\ntest('applies the discount before tax', () => {\n  expect(total({ items: [{ sku: 'mug', price: 1250, qty: 2 }], discount: 0.1 }, 0.2)).toBe(2700);\n});\n\ntest('rounds once', () => {\n  expect(total({ items: [{ sku: 'pen', price: 333, qty: 3 }] }, 0.2)).toBe(1199);\n});\n",
  );
  write(path.join(shop, '.gitignore'), 'node_modules\ndist\n');
  git(shop, ['init', '-q', '-b', 'main'], home);
  const commits = [
    [6 * DAY, 'First version of the cart and checkout'],
    [4 * DAY, 'Orders: save the shipping address'],
    [2 * DAY, 'Checkout: discounts for members'],
    [1 * DAY, 'Tests for the checkout total'],
  ];
  // A remote to sync with, beside Alex's home: it has every commit but the last, which Sync would send up.
  const remote = path.join(path.dirname(home), 'remote', 'shop-api.git');
  for (const [i, [ago, msg]] of commits.entries()) {
    fs.appendFileSync(path.join(shop, 'CHANGELOG.md'), `- ${msg}\n`);
    git(shop, ['add', '-A'], home);
    git(shop, ['commit', '-q', '-m', msg], home, now - ago);
    if (i === commits.length - 2) {
      fs.mkdirSync(path.dirname(remote), { recursive: true });
      git(path.dirname(remote), ['init', '-q', '--bare', '-b', 'main', remote], home);
      git(shop, ['remote', 'add', 'origin', remote], home);
      git(shop, ['push', '-q', '-u', 'origin', 'main'], home);
    }
  }
  git(shop, ['fetch', '-q'], home);
  // The agent's fix, not committed yet: Git shows it as a change.
  write(path.join(shop, 'src/checkout/total.ts'), TOTAL_AFTER);

  const blog = path.join(home, 'code/blog');
  write(path.join(blog, 'README.md'), '# Notes from the workshop\n\nA small static blog.\n');
  write(path.join(blog, 'posts/2026-10-12-oak-table.md'), '# An oak table in a weekend\n');
  git(blog, ['init', '-q', '-b', 'main'], home);
  git(blog, ['add', '-A'], home);
  git(blog, ['commit', '-q', '-m', 'Posts so far'], home, now - 9 * DAY);

  // Documents agents read and made (only their names and sizes show).
  const pad = (n) => crypto.randomBytes(n);
  write(path.join(home, 'Documents/Q3-report.pdf'), pad(184_000));
  write(path.join(home, 'Hydor/Tasks/2026-10-31-q3-report-summary/Q3-summary.docx'), pad(36_000));
  write(path.join(home, 'Hydor/Tasks/2026-10-31-q3-report-summary/revenue-by-region.xlsx'), pad(21_000));
  write(path.join(home, 'Hydor/Tasks/2026-11-01-compare-e-bikes/e-bikes-compared.xlsx'), pad(18_000));
  fs.mkdirSync(path.join(home, 'Hydor/Tasks/2026-10-31-lisbon-trip'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Hydor/Tasks/2026-11-01-browser-settings'), { recursive: true });
  return { shop, blog };
}

/** What goes in the app's own data folder before it starts: skills agents learned with Alex's approval. */
export function makeData(dataDir) {
  const skill = (name, description, body) => write(path.join(dataDir, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
  skill('sort-receipts', 'Use when receipts or invoices need filing by date: sort them into one folder per quarter and add up each quarter, in EUR.', '# Sort receipts\n\n1. Read the date and amount on each receipt.\n2. Move it into Q1–Q4.\n3. Write totals.csv with one line per quarter.');
  skill('shop-api-release', 'Use when releasing the shop API: run the tests with TZ=UTC, bump the version, write the changelog, tag the release.', '# Release the shop API\n\n1. `TZ=UTC npm test`\n2. Bump the version in package.json.\n3. Add the changes to CHANGELOG.md.\n4. Tag `vX.Y.Z`.');
}

// ---- sessions: Claude Code transcripts -----------------------------------------------------------------

/** One Claude Code transcript, line by line, as the CLI writes it. */
export class Transcript {
  constructor({ cwd, at, branch }) {
    this.id = uuid();
    this.cwd = cwd;
    this.t = at;
    this.branch = branch;
    this.lines = [];
    this.last = null;
    this.n = 0;
  }
  get key() {
    return `claude:${this.id}`;
  }
  entry(type, extra) {
    // Started as Hydor starts Claude Code ("sdk-cli"), so the app never takes Alex's folders for ones Claude Code worked
    // in by itself, even before run.mjs marks the sessions as Hydor's (makeImported's terminal session says "cli").
    const e = { parentUuid: this.last, isSidechain: false, userType: 'external', cwd: this.cwd, sessionId: this.id, version: '2.1.30', entrypoint: 'sdk-cli', ...(this.branch ? { gitBranch: this.branch } : {}), type, uuid: uuid(), timestamp: new Date(this.t).toISOString(), ...extra };
    this.lines.push(e);
    this.last = e.uuid;
    return e;
  }
  wait(ms) {
    this.t += ms;
    return this;
  }
  user(text) {
    this.entry('user', { message: { role: 'user', content: text } });
    return this.wait(4000);
  }
  /** One API message: text, thinking and tool calls, with its token counts. */
  say(blocks, { out = 400, input = 1800, cached = 22_000 } = {}) {
    const id = `msg_${crypto.randomBytes(12).toString('hex')}`;
    const content = blocks.map((b) => (typeof b === 'string' ? { type: 'text', text: b } : b));
    this.entry('assistant', {
      message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn', usage: { input_tokens: input, cache_creation_input_tokens: 600, cache_read_input_tokens: cached, output_tokens: out } },
    });
    return this.wait(2500);
  }
  /** A tool call and, unless `pending`, its result after `ms`. Returns the call's id. */
  tool(name, input, { text = '', result, error = false, ms = 3000, pending = false, say } = {}) {
    const id = `toolu_${crypto.randomBytes(12).toString('hex')}`;
    this.say([...(say ? [{ type: 'text', text: say }] : []), { type: 'tool_use', id, name, input }]);
    if (pending) return id;
    this.wait(ms);
    this.entry('user', { message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content: text, ...(error ? { is_error: true } : {}) }] }, ...(result ? { toolUseResult: result } : {}) });
    this.wait(1500);
    return id;
  }
  title(t) {
    this.lines.push({ type: 'ai-title', aiTitle: t, sessionId: this.id });
    return this;
  }
  save(projects) {
    const dir = path.join(projects, this.cwd.replace(/[^A-Za-z0-9]/g, '-'));
    write(path.join(dir, `${this.id}.jsonl`), this.lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    return this;
  }
}

export const own = (tool) => `mcp__hydor__${tool}`;
const numbered = (text) =>
  text
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(6)}→${l}`)
    .join('\n');

/** Alex's trip to Lisbon as the Trip planner app planned it: what its form was given, and its answer. */
const TRIP = {
  inputs: { destination: 'Lisbon', start: '2027-05-11', days: '4', travelers: 'Two adults', budget: 'Mid-range hotels', interests: 'Lots of walking, viewpoints, tiles and good food', pace: 'Balanced' },
  result: {
    overview:
      'Four days on foot, one part of the city a day, with Sintra by train on the third. Stay in **Chiado**: central, flat enough at the end of a day, and on the tram lines. Mid-May is warm and mostly dry (19–24 °C), with long evenings for the viewpoints.',
    days: [
      { day: 1, date: '2027-05-11', area: 'Alfama and the castle', sight: 'São Jorge Castle', morning: 'Tram 28 up to São Jorge Castle and its walls', afternoon: 'The lanes of Alfama, down to the cathedral', evening: 'Dinner and fado in Mouraria' },
      { day: 2, date: '2027-05-12', area: 'Belém by the river', sight: 'Jerónimos Monastery', morning: 'Jerónimos Monastery when it opens, before the queues', afternoon: 'Belém Tower and the riverside walk to MAAT', evening: 'Pastéis de Belém, then dinner in Santos' },
      { day: 3, date: '2027-05-13', area: 'A day in Sintra', sight: 'Pena Palace', morning: 'The train from Rossio, then Pena Palace on a timed ticket', afternoon: 'Quinta da Regaleira and the old town', evening: 'Back by train, dinner in Chiado' },
      { day: 4, date: '2027-05-14', area: 'Viewpoints and fado', sight: 'Miradouro de São Pedro de Alcântara', morning: 'The São Pedro de Alcântara viewpoint and Príncipe Real', afternoon: 'LX Factory, then the river at Cais do Sodré', evening: 'Sunset at Santa Catarina, then fado in Bairro Alto' },
    ],
    stops: [
      { day: 1, date: '2027-05-11', area: 'Alfama', lat: 38.7113, lng: -9.1275 },
      { day: 2, date: '2027-05-12', area: 'Belém', lat: 38.6975, lng: -9.2063 },
      { day: 3, date: '2027-05-13', area: 'Sintra', lat: 38.7976, lng: -9.3904 },
      { day: 4, date: '2027-05-14', area: 'Bairro Alto', lat: 38.7136, lng: -9.1462 },
    ],
    book_ahead: ['Pena Palace: a timed ticket, two weeks ahead', 'Fado dinner in Mouraria: a table, a week ahead', 'Jerónimos Monastery: tickets online, a few days ahead', 'The hotel in Chiado: now, as May fills up'],
    budget: [
      { item: 'Hotel, 4 nights', estimate: '€640–€880' },
      { item: 'Food and drink', estimate: '€320–€440' },
      { item: 'Sights and tickets', estimate: '€110' },
      { item: 'Trams, metro and the Sintra train', estimate: '€45' },
      { item: 'Total', estimate: '€1,115–€1,475' },
    ],
    tips: ['From the airport, the metro takes 25 minutes to the centre', 'A Viva Viagem card with “zapping” credit covers trams, metro and the Sintra train', 'Shoes with grip: the pavements are polished stone and steep'],
  },
};

/**
 * The Trip planner's run for Alex's Lisbon session, as use_app leaves it when the run is done: the run, and its card in
 * the conversation under the reply. `recipe`: the template as the app has it (GET /api/apps/tpl:trip-planner).
 */
export function tripRun(db, s, recipe) {
  const id = crypto.randomBytes(4).toString('hex');
  const ended = s.lisbon.started + 95_000;
  db.prepare(
    `insert into app_runs (id, app_id, app_name, recipe, source, status, inputs, result, cost_usd, asked_by, told, created_at, started_at, ended_at)
     values (?, 'tpl:trip-planner', 'Trip planner', ?, 'session', 'done', ?, ?, 0.38, ?, 1, ?, ?, ?)`,
  ).run(id, JSON.stringify(recipe), JSON.stringify(TRIP.inputs), JSON.stringify(TRIP.result), s.lisbon.key, s.lisbon.started, s.lisbon.started + 1000, ended);
  db.prepare("insert into session_notes (id, key, kind, at, anchor, data) values (?, ?, 'app-run', ?, ?, ?)").run(
    crypto.randomBytes(5).toString('hex'),
    s.lisbon.key,
    s.lisbon.started,
    s.lisbon.ask,
    JSON.stringify({ run: id, app: 'tpl:trip-planner', name: 'Trip planner', icon: recipe.icon, color: recipe.color }),
  );
  return id;
}

/** The trip's slides, which an agent made from the plan: a title and a slide a day, each over its picture. Returns its page. */
export async function lisbonDeck(api, s) {
  const pic = async (name) => (await api('POST', '/api/pages/assets', { data: `data:image/jpeg;base64,${fs.readFileSync(path.join(MEDIA, name)).toString('base64')}` })).src;
  const [tram, belem, sintra, viewpoint] = [await pic('tram.jpg'), await pic('belem.jpg'), await pic('sintra.jpg'), await pic('viewpoint.jpg')];
  const day = (n, picture, when, area, plan) => ({
    els: [
      { type: 'image', src: picture, x: 0, y: 0, w: 1280, h: 720, fit: 'cover', alt: area },
      // Two fades into the dark from nothing, one over the other: the words below read on any picture, with no edge.
      { type: 'shape', shape: 'rect', x: 0, y: 250, w: 1280, h: 470, fill: '#0b162600', fill2: '#0b1626cc', angle: 180 },
      { type: 'shape', shape: 'rect', x: 0, y: 420, w: 1280, h: 300, fill: '#0b162600', fill2: '#0b1626cc', angle: 180 },
      { type: 'text', text: when.toUpperCase(), x: 72, y: 496, w: 1000, h: 40, size: 24, bold: true, color: '#5cbcff' },
      { type: 'text', text: `Day ${n} · ${area}`, x: 72, y: 534, w: 1136, h: 80, size: 56, bold: true, color: '#ffffff', role: 'title' },
      { type: 'text', text: plan, x: 72, y: 616, w: 1136, h: 80, size: 24, color: '#d5dde8' },
    ],
    notes: `Day ${n}: ${plan}`,
  });
  const d = TRIP.result.days;
  const line = (x) => [x.morning, x.afternoon, x.evening].join(' · ');
  const { page } = await api('POST', '/api/pages', {
    kind: 'slides',
    title: 'Lisbon in 4 days',
    sessionKey: s.lisbon.key,
    description: 'The Lisbon trip day by day, from the Trip planner’s plan: a title slide and one slide a day over its picture.',
    model: {
      theme: 'midnight',
      slides: [
        {
          els: [
            { type: 'shape', shape: 'rect', x: 0, y: 0, w: 1280, h: 720, fill: '#0f2238', line: 'none' },
            { type: 'image', src: tram, x: 640, y: 0, w: 640, h: 720, fit: 'cover', alt: 'A yellow tram on a Lisbon street' },
            { type: 'text', text: 'Lisbon in 4 days', x: 72, y: 250, w: 540, h: 140, size: 64, bold: true, color: '#ffffff', role: 'title' },
            { type: 'text', text: '11–14 May 2027 · two adults, on foot', x: 72, y: 390, w: 540, h: 60, size: 26, color: '#9fb4cc', role: 'subtitle' },
          ],
        },
        day(1, tram, 'Tuesday 11 May', d[0].area, line(d[0])),
        day(2, belem, 'Wednesday 12 May', d[1].area, line(d[1])),
        day(3, sintra, 'Thursday 13 May', d[2].area, line(d[2])),
        day(4, viewpoint, 'Friday 14 May', d[3].area, line(d[3])),
      ],
    },
  });
  return page;
}

/** A paragraph of a document (the document editor's model): its words, and its style (a heading, the title) if any. */
const para = (t, style) => ({ id: `p${Math.random().toString(36).slice(2, 10)}`, type: 'p', ...(style ? { style } : {}), runs: [{ t }] });

/**
 * What the Thesis project holds in its Files (the guide's pictures of a project's Files and Overview): a chapter draft
 * and the defense slides kept in the project, and in its folder two folders, notes, the survey's numbers as a CSV, a
 * chapter as a Word file, a study as a PDF and a picture from a visit. All made up.
 */
async function thesisFiles(api, home, sessionKey) {
  const dir = path.join(home, 'Hydor/Projects/thesis');
  for (const sub of ['chapters', 'sources']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.writeFileSync(path.join(dir, 'chapters', 'chapter-1-introduction.md'), '# Chapter 1: Introduction\n\nWhy small towns keep their libraries open, and who uses them.\n');
  fs.writeFileSync(path.join(dir, 'chapters', 'chapter-2-literature.md'), '# Chapter 2: What others found\n\nPutnam, Klinenberg and Oldenburg on third places.\n');
  fs.writeFileSync(path.join(dir, 'interview-notes.md'), '# Interview notes\n\n- Maple Falls: one branch, open 28 hours a week\n- Volunteers run the Saturday hours\n- Story time is the best-attended program\n- Free internet: the only public access in town\n\nNext: code the six interviews in two rounds.\n');
  fs.writeFileSync(path.join(dir, 'survey-results.csv'), 'town,branches,hours,staff,volunteers\nMaple Falls,1,28,1.5,9\nCedar Bend,2,40,3,4\nOak Hollow,1,22,1,12\nRiverton,1,30,2,6\nPine Ridge,1,18,0.5,7\n');
  fs.copyFileSync(path.join(MEDIA, 'viewpoint.jpg'), path.join(dir, 'field-visit.jpg'));
  fs.writeFileSync(path.join(dir, 'sources', 'reading-list.md'), '# Reading list\n\n- Putnam, Bowling Alone (read)\n- Klinenberg, Palaces for the People (read)\n- Oldenburg, The Great Good Place\n');
  fs.copyFileSync(path.join(REPO, 'server/pdfnotes/test-files/paper.pdf'), path.join(dir, 'related-study.pdf'));
  // A chapter as a Word file: made as a document, saved out as .docx, and the document taken away again.
  const chapter2 = { v: 1, blocks: [para('Chapter 2: What others found', 'title'), para('Libraries as third places', 'h1'), para('Oldenburg called the places between home and work “third places”: open to anyone, free, and kept up by their regulars. A small-town library is often the last one left.'), para('Klinenberg names them social infrastructure: the shared rooms where people who would not meet otherwise do.'), para('What the survey adds', 'h1'), para('The 214 town libraries surveyed show how thin that infrastructure has become: most keep one branch open for 28 hours a week.')] };
  const word = (await api('POST', '/api/pages', { kind: 'doc', title: 'Chapter 2: What others found', model: chapter2 })).page;
  const docx = await api('GET', `/api/pages/${word.id}/export?format=docx`, undefined, { raw: true }).catch(() => null);
  if (docx) fs.writeFileSync(path.join(dir, 'chapter-2-literature.docx'), docx);
  await api('DELETE', `/api/pages/${word.id}`).catch(() => {});
  // Kept in the project: the chapter being written, and the defense slides.
  await api('POST', '/api/pages', {
    kind: 'doc',
    title: 'Chapter 3: Method',
    sessionKey,
    description: 'The draft of chapter 3: how the survey of 214 town libraries and the six interviews with librarians were made and analysed.',
    model: { v: 1, blocks: [para('Chapter 3: Method', 'title'), para('The survey', 'h1'), para('A questionnaire went to all 214 town libraries under 10,000 residents, by mail and e-mail; 88 answered (41%).'), para('The interviews', 'h1'), para('Six librarians were interviewed between January and March, and their answers coded in two rounds.')] },
  });
  await api('POST', '/api/pages', {
    kind: 'slides',
    title: 'Defense slides',
    sessionKey,
    description: 'The slides for the thesis defense in March: the question, the survey, what the interviews said and what it means for small towns.',
    model: {
      theme: 'midnight',
      slides: [
        { els: [
          { type: 'text', text: 'Keeping the doors open', x: 96, y: 250, w: 1088, h: 120, size: 60, bold: true, color: '#ffffff', role: 'title' },
          { type: 'text', text: 'How small towns use their public libraries · Thesis defense, March', x: 96, y: 380, w: 1088, h: 60, size: 26, color: '#9fb4cc', role: 'subtitle' },
        ] },
        { els: [
          { type: 'text', text: 'What the survey found', x: 96, y: 80, w: 1088, h: 90, size: 44, bold: true, color: '#ffffff', role: 'title' },
          { type: 'text', text: '• 62% of the towns have a single branch\n• The median branch is open 28 hours a week\n• Volunteers run most Saturday hours', x: 96, y: 200, w: 1088, h: 300, size: 30, color: '#d5dde8' },
        ] },
      ],
    },
  });
}

/** Every session Alex has, newest work first. Returns them by name, each with its key. */
export function makeSessions(home, projects, now, { shop, blog }) {
  const tasks = path.join(home, 'Hydor/Tasks');
  const out = {};

  // Fixing the checkout tests: steps, an edit, and the agent waiting to run the test suite.
  {
    const t = new Transcript({ cwd: shop, at: now - 4 * MIN, branch: 'main' });
    t.user("The checkout tests fail since yesterday's change. Find out why and fix it.");
    t.tool('Bash', { command: 'npm test -- checkout', description: 'Run the checkout tests' }, {
      say: "I'll run the checkout tests first to see what fails.",
      text: ' FAIL  src/checkout/total.test.ts\n  × applies the discount before tax\n    expected 2700, received 2730\n  × rounds once\n    expected 1199, received 1200\n\n Tests  2 failed (2)',
      result: { stdout: ' FAIL  src/checkout/total.test.ts\n  × applies the discount before tax\n    expected 2700, received 2730\n  × rounds once\n    expected 1199, received 1200\n\n Tests  2 failed (2)', stderr: '', interrupted: false },
      ms: 4200,
    });
    t.tool('Read', { file_path: path.join(shop, 'src/checkout/total.ts') }, {
      text: numbered(TOTAL_BEFORE),
      result: { type: 'text', file: { filePath: path.join(shop, 'src/checkout/total.ts'), content: TOTAL_BEFORE, numLines: 12, startLine: 1, totalLines: 12 } },
      ms: 300,
    });
    t.say(['Two problems in `total()`: tax is added to each line before the discount, and every line is rounded on its own. I\'ll apply the discount first and round once, at the end.']);
    t.tool('Edit', { file_path: path.join(shop, 'src/checkout/total.ts'), old_string: TOTAL_BEFORE, new_string: TOTAL_AFTER }, {
      text: `The file ${path.join(shop, 'src/checkout/total.ts')} has been updated.`,
      result: {
        filePath: path.join(shop, 'src/checkout/total.ts'),
        structuredPatch: [
          {
            oldStart: 3,
            oldLines: 10,
            newStart: 3,
            newLines: 7,
            lines: [
              '-/** The cart\'s total in cents: items, then the discount, then tax. */',
              '+/** The cart\'s total in cents: items, then the discount, then tax, rounded once at the end. */',
              ' export function total(cart: Cart, taxRate: number): number {',
              '   let sum = 0;',
              '-  for (const item of cart.items) {',
              '-    const line = item.price * item.qty * (1 + taxRate);',
              '-    sum += Math.round(line);',
              '-  }',
              '-  if (cart.discount) sum -= Math.round(sum * cart.discount);',
              '-  return sum;',
              '+  for (const item of cart.items) sum += item.price * item.qty;',
              '+  if (cart.discount) sum *= 1 - cart.discount;',
              '+  return Math.round(sum * (1 + taxRate));',
              ' }',
            ],
          },
        ],
        userModified: false,
        replaceAll: false,
      },
      ms: 600,
    });
    t.t = now - 25_000;
    const run = t.tool('Bash', { command: 'npm test', description: 'Run the whole test suite' }, { say: 'Both checkout tests should pass now. Running the whole suite to make sure nothing else broke.', pending: true });
    t.title('Fix the checkout tests').save(projects);
    out.checkout = { key: t.key, cwd: shop, waitingOn: run, since: now - 4 * MIN, at: t.t };
  }

  // A web search, two pages read, a comparison and a spreadsheet.
  {
    const cwd = path.join(tasks, '2026-11-01-compare-e-bikes');
    const t = new Transcript({ cwd, at: now - 2 * HOUR - 14 * MIN });
    t.user('Find the best e-bike under $2,000 for my hilly commute: 9 km each way, with two steep hills.');
    const q1 = 'best commuter e-bike under $2000 for steep hills 2026';
    t.tool(own('web_search'), { query: q1 }, {
      say: "I'll look for recent reviews of commuter e-bikes that climb well, then compare the best few.",
      text: formatSearch({
        query: q1,
        provider: 'Naget Search',
        hits: [
          { title: 'The best electric bikes for hills in 2026, tested', url: 'https://www.cyclingreview.example/best-e-bikes-hills', date: '2026-09-18', snippet: 'We rode 14 e-bikes up the same 12% climb. Mid-drive motors with a torque sensor were the clear winners for steep commutes.' },
          { title: 'Velora Ridge E5 review: a mid-drive that climbs like a mountain bike', url: 'https://www.ebiketest.example/velora-ridge-e5', date: '2026-08-02', snippet: 'At $1,890 the Ridge E5 pairs an 85 Nm mid-drive with a 625 Wh battery. It held 18 km/h up a 10% grade.' },
          { title: 'Commuter Pro 3 long-term test: 3,000 km later', url: 'https://www.bikeradar.example/commuter-pro-3', date: '2026-07-11', snippet: 'Hub motor, belt drive and lights included. Fine on rolling hills; it slows down on the steepest climbs.' },
          { title: 'Mid-drive vs hub motor: which is better for hills?', url: 'https://www.ebikeschool.example/mid-drive-vs-hub', date: '2026-05-20', snippet: 'A mid-drive uses the bike\'s gears, so it keeps its torque on steep hills where a hub motor overheats.' },
          { title: 'Urbana Climb 2 — specs and price', url: 'https://www.urbana.example/climb-2', snippet: '75 Nm mid-drive, 540 Wh, hydraulic brakes. $1,749 until the end of November.' },
        ],
      }),
      ms: 5200,
    });
    t.wait(25_000);
    t.tool(own('read_page'), { url: 'https://www.ebiketest.example/velora-ridge-e5', question: 'How does it do on steep hills and what does it cost?' }, {
      text: formatPage({ title: 'Velora Ridge E5 review', url: 'https://www.ebiketest.example/velora-ridge-e5', detail: 'the parts that answer the question', body: 'On our 12% test climb the Ridge E5 held 17–18 km/h in its second assist level. The torque sensor makes it feel natural from a standstill. Price: $1,890 with lights and a rear rack.' }),
      ms: 3800,
    });
    t.tool(own('read_page'), { url: 'https://www.cyclingreview.example/best-e-bikes-hills', question: 'Which models were best on steep climbs?' }, {
      text: formatPage({ title: 'The best electric bikes for hills in 2026, tested', url: 'https://www.cyclingreview.example/best-e-bikes-hills', detail: 'the parts that answer the question', body: 'Best for steep commutes: Velora Ridge E5 (85 Nm), Urbana Climb 2 (75 Nm). Hub-drive bikes such as the Commuter Pro 3 slowed to 11 km/h on the 12% section.' }),
      ms: 4100,
    });
    t.wait(70_000);
    t.tool(own('present_files'), { files: [{ path: path.join(cwd, 'e-bikes-compared.xlsx'), caption: 'Five e-bikes side by side: price, motor, battery and how each did on the test climb' }] }, { text: 'Shown to the user.', ms: 400 });
    t.say(
      [
        "**The Velora Ridge E5 ($1,890) is the best fit for your commute.** Its mid-drive motor uses the bike's gears, so it keeps its pull on steep hills, where hub-motor bikes slow down.\n\n| | Price | Motor | Battery | On a 12% climb |\n|---|---|---|---|---|\n| **Velora Ridge E5** | $1,890 | 85 Nm mid-drive | 625 Wh | 17–18 km/h |\n| Urbana Climb 2 | $1,749 | 75 Nm mid-drive | 540 Wh | 15 km/h |\n| Commuter Pro 3 | $1,599 | 50 Nm hub | 500 Wh | 11 km/h |\n\nWith 18 km a day, the Ridge E5's battery lasts about four days between charges. If you'd rather save $140, the Urbana Climb 2 is a close second.",
      ],
      { out: 900 },
    );
    t.title('Compare e-bikes for a hilly commute').save(projects);
    out.ebike = { key: t.key, cwd, at: t.t };
  }

  // Asking an agent to change a setting: the guide, the current settings, and the change waiting on its card.
  {
    const cwd = path.join(tasks, '2026-11-01-browser-settings');
    const t = new Transcript({ cwd, at: now - 2 * MIN });
    t.user("Turn off the browser's screenshots, and keep the pages it opens off my home network.");
    t.tool(own('app_guide'), { query: 'browser screenshots and private network' }, {
      text: 'From the guide, for “browser screenshots and private network”:\n\n## Browser settings (Search and the browser · web#browser-settings)\n…',
      ms: 900,
    });
    t.tool(own('app_api'), { method: 'GET', path: '/api/browser/settings' }, { text: '{"enabled":true,"headless":true,"blockPrivate":false,"screenshots":true,"allow":[],"block":[]}', ms: 300 });
    t.t = now - 35_000;
    const change = t.tool(
      own('app_api'),
      { method: 'PUT', path: '/api/browser/settings', body: { screenshots: false, blockPrivate: true }, summary: 'Turn off the browser’s screenshots and keep its pages off your network' },
      { say: 'Both are in **Settings → Browser**. Here is the change for you to confirm:', pending: true },
    );
    t.title('Browser: no screenshots, off the home network').save(projects);
    out.settings = { key: t.key, cwd, waitingOn: change, since: now - 2 * MIN, at: t.t };
  }

  // A document read, a summary written, two files handed over.
  {
    const cwd = path.join(tasks, '2026-10-31-q3-report-summary');
    const t = new Transcript({ cwd, at: now - 26 * HOUR });
    t.user('Summarize the Q3 report in ~/Documents for the board: one page, with a chart of revenue by region.');
    t.tool(own('read_document'), { path: path.join(home, 'Documents/Q3-report.pdf') }, {
      say: "I'll read the report first.",
      text: 'Q3-report.pdf · 18 pages\n\nRevenue grew 14% to $4.2M. Europe +22%, North America +9%, Asia +17%. Gross margin 61%…',
      ms: 6400,
    });
    t.wait(50_000);
    t.tool('Bash', { command: 'python3 make_summary.py', description: 'Write the summary and the chart' }, { text: 'Wrote Q3-summary.docx and revenue-by-region.xlsx', result: { stdout: 'Wrote Q3-summary.docx and revenue-by-region.xlsx', stderr: '', interrupted: false }, ms: 8200 });
    t.tool(own('present_files'), {
      files: [
        { path: path.join(cwd, 'Q3-summary.docx'), caption: 'The one-page summary for the board' },
        { path: path.join(cwd, 'revenue-by-region.xlsx'), caption: 'Revenue by region, with the chart' },
      ],
    }, { text: 'Shown to the user.', ms: 400 });
    t.say(['**Q3 in one line: revenue grew 14% to $4.2M, led by Europe (+22%).**\n\nThe summary covers revenue, margin, the three regions and the two risks the report flags (shipping costs and the delayed Asia launch). The spreadsheet has the numbers behind the chart.'], { out: 600 });
    t.title('Q3 report summary for the board').save(projects);
    out.report = { key: t.key, cwd, at: t.t };
  }

  // A picture and a short clip made through OpenRouter, each with Keep under it.
  {
    const cwd = path.join(tasks, '2026-11-02-lisbon-pictures');
    const pic = path.join(cwd, 'images', 'yellow-lisbon-tram.jpg');
    const clip = path.join(cwd, 'videos', 'yellow-tram-climbing.mp4');
    fs.mkdirSync(path.dirname(pic), { recursive: true });
    fs.mkdirSync(path.dirname(clip), { recursive: true });
    fs.copyFileSync(path.join(MEDIA, 'tram.jpg'), pic);
    fs.copyFileSync(path.join(MEDIA, 'tram.mp4'), clip);
    const t = new Transcript({ cwd, at: now - 50 * MIN });
    t.user('Make me a picture of a yellow Lisbon tram on a sunny hill street for my trip blog, then a short clip of it climbing.');
    const prompt = 'A yellow Lisbon tram climbing a narrow sunny street between tiled houses, two people walking beside it, bright flat illustration';
    t.tool(own('generate_image'), { prompt, aspect_ratio: '4:3' }, {
      say: "I'll make the picture first.",
      text: `Made an image with recraft/recraft-v4.1-flash ($0.007), 4:3:\n${pic} (800×590, 96 KB)\nThe user sees it with your reply, a tap away from full size, download and keeping it in their project: don’t repeat it or its path. To look at it yourself, open the file.`,
      ms: 14_000,
    });
    t.tool(own('generate_video'), { prompt: 'The yellow tram climbs the street towards the camera, warm afternoon light, gentle camera follow', first_frame: pic }, {
      say: 'Now a short clip that starts from it.',
      text: `Made a video with x-ai/grok-imagine-video-1.5 ($0.42), 3 s, 16:9, 720p, with sound:\n${clip} (640×362, 3.1 s, 101 KB)\nThe user sees it with your reply, where they can play it, download it and keep it in their project: don’t repeat it or its path.`,
      ms: 52_000,
    });
    t.say(['Here they are: the picture for the post, and a 3-second clip that starts from it. **Keep** under either one keeps it, with a title and a description written for it.'], { out: 300 });
    t.title('Pictures for the Lisbon trip blog').save(projects);
    out.pictures = { key: t.key, cwd, at: t.t, pic, clip };
  }

  // The trip planned with the Trip planner app (use_app). Its run and card (the plan, on a map) are put in by tripRun(),
  // for the README's picture alone; elsewhere the conversation shows the call among the steps.
  {
    const cwd = path.join(tasks, '2026-10-31-lisbon-trip');
    fs.mkdirSync(cwd, { recursive: true });
    const t = new Transcript({ cwd, at: now - 30 * HOUR });
    t.user('Plan a 4-day trip to Lisbon in May: two adults, mid-range hotels, lots of walking.');
    const ask = t.last;
    const started = t.t;
    t.tool(own('use_app'), { app: 'trip-planner', inputs: TRIP.inputs }, {
      say: "I'll plan it with your Trip planner app: it checks the dates against opening hours, events and travel times.",
      text: 'Trip planner is done. Its card, with the answer as the app shows it, shows right under your reply.\n\n' + TRIP.result.overview,
      ms: 96_000,
    });
    t.say(['Here is your plan: one area a day, all on foot or by tram, with Sintra by train on Thursday. Book the Pena Palace tickets and the fado dinner soon: both fill up in May.'], { out: 300 });
    t.title('4 days in Lisbon in May').save(projects);
    out.lisbon = { key: t.key, cwd, at: t.t, ask, started };
  }

  // Plain conversations, for the session list.
  const plain = [
    ['thesis', path.join(home, 'Hydor/Projects/thesis'), 3 * HOUR, 'Outline chapter 3: the method, the survey and how I analysed the answers.', 'Here is an outline in five parts, with what each needs from your notes.', 'Outline chapter 3'],
    ['garden', path.join(home, 'Hydor/Projects/the-garden'), 50 * HOUR, 'Which vegetables can I still sow in November?', 'In zone 5b, garlic and broad beans go in now; spinach and lettuce under cover.', 'What to sow in November'],
    ['taxes', path.join(home, 'Hydor/Projects/taxes-2026'), 4 * DAY, 'Sort the receipts in this folder by quarter and add them up.', 'Done: 46 receipts in four folders, with a table of the totals.', 'Receipts by quarter'],
    ['blog', blog, 3 * DAY, 'Add an RSS feed to the blog.', 'The feed is at /feed.xml, built with the posts. I added a link to it in the header.', 'RSS feed for the blog'],
    ['darkmode', blog, 6 * DAY, 'Give the blog a dark mode that follows the system setting.', 'Done: the colours follow your system, with a switch in the footer to override it.', 'Dark mode for the blog'],
    ['search', shop, 5 * HOUR, 'Product search is slow with more than 1,000 products. Make it faster.', 'Search now uses an index on the product names: 40 ms instead of 1.2 s for 5,000 products.', 'Faster product search'],
    ['applepay', shop, 2 * DAY, 'Add Apple Pay to the checkout.', 'Apple Pay shows on supported devices, through the payment provider you already use. The tests pass.', 'Apple Pay at checkout'],
    ['brief', tasks, 12 * HOUR, 'Morning brief: the weather in Portland, my calendar and the news I follow, in five lines.', 'Cloudy, 8 °C, rain after 4 pm. Two meetings: design review at 10, dentist at 3.', 'Morning brief'],
  ];
  for (const [name, cwd, ago, ask, answer, title] of plain) {
    fs.mkdirSync(cwd, { recursive: true });
    const t = new Transcript({ cwd, at: now - ago });
    t.user(ask);
    t.wait(40_000).say([answer], { out: 700 });
    t.title(title).save(projects);
    out[name] = { key: t.key, cwd, at: t.t };
  }
  return out;
}

/**
 * Sessions Alex had before Hydor, which it lists too: the shop's phone app, worked on with Codex in VS Code and once
 * with Claude Code in a terminal. Their folder's group is marked with where they came from. (Alex's other sessions
 * count as started in Hydor: run.mjs says so in the app's data.)
 */
export function makeImported(home, codexHome, projects, now) {
  const cwd = path.join(home, 'code/shop-app');
  write(path.join(cwd, 'README.md'), "# Shop app\n\nThe shop's phone app: products, cart and orders.\n");
  const out = {};
  const codex = [
    ['badge', 20 * HOUR, 'The cart badge shows the wrong count after removing an item. Fix it.', 'Fixed: the badge now counts what is left in the cart after a removal, and a test covers it.', 'Fix the cart badge count'],
    ['push', 2 * DAY, 'Send a push notification when an order ships.', 'Done: shipped orders send a notification with the tracking link; you can turn them off in the app\'s settings.', 'Notify when an order ships'],
  ];
  for (const [name, ago, ask, answer, title] of codex) {
    const id = uuid();
    const t0 = now - ago;
    const at = (ms) => new Date(t0 + ms).toISOString();
    const lines = [
      { timestamp: at(0), type: 'session_meta', payload: { id, timestamp: at(0), cwd, originator: 'codex_vscode', cli_version: '0.161.0', source: 'vscode', model_provider: 'openai' } },
      { timestamp: at(500), type: 'event_msg', payload: { type: 'task_started', turn_id: `${id}-1` } },
      { timestamp: at(600), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: ask }] } },
      { timestamp: at(45_000), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer }] } },
      { timestamp: at(45_100), type: 'event_msg', payload: { type: 'task_complete', turn_id: `${id}-1`, duration_ms: 44_500 } },
      { timestamp: at(45_200), type: 'event_msg', payload: { type: 'thread_name_updated', thread_name: title } },
    ];
    const d = new Date(t0);
    const day = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    write(path.join(codexHome, 'sessions', day, `rollout-${at(0).slice(0, 19).replace(/:/g, '-')}-${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    out[name] = { key: `codex:${id}`, cwd, at: t0 + 45_200 };
  }
  // Claude Code in a terminal ("cli"): its transcript says where it was started.
  const t = new Transcript({ cwd, at: now - 3 * DAY });
  const entry = t.entry.bind(t);
  t.entry = (type, extra) => entry(type, { entrypoint: 'cli', ...extra });
  t.user('Why does the app crash on startup on older Android phones?');
  t.wait(30_000).say(['It used an API from Android 12; older phones now take another path, so it starts on Android 9 and up.'], { out: 500 });
  t.title('Crash on older Android phones').save(projects);
  out.android = { key: t.key, cwd, at: t.t };
  return out;
}

// ---- through the app's own API -------------------------------------------------------------------------

const PAGE = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#fbf8f1;color:#1f1b16}h1{font-size:22px;margin:0 0 14px}li{margin:6px 0}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e3dccd;padding:6px 4px;text-align:left}.tag{background:#efe6d3;border-radius:6px;padding:1px 6px;font-size:12px}</style></head><body><h1>${title}</h1>${body}</body></html>`;

const CALCULATOR = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E-bike loan calculator</title>
<style>
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,sans-serif;background:#f6f3ec;color:#22201b}
.wrap{max-width:720px;margin:0 auto;padding:28px 24px}h1{font-size:22px;margin:0 0 4px}p.sub{margin:0 0 20px;color:#6d665a}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}label{display:block;font-size:12px;color:#6d665a;margin-bottom:4px}
input,select{width:100%;padding:9px 10px;border:1px solid #d9d1c1;border-radius:9px;background:#fff;font:inherit}
.out{display:flex;gap:12px;margin-bottom:18px}.card{flex:1;background:#fff;border:1px solid #e4dccb;border-radius:12px;padding:14px 16px}
.big{font-size:28px;font-weight:650;letter-spacing:-.02em}.muted{color:#6d665a;font-size:13px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e4dccb;border-radius:12px;overflow:hidden}th,td{padding:8px 12px;text-align:right;border-bottom:1px solid #eee6d6;font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left}th{font-size:12px;color:#6d665a;font-weight:600;background:#fbf8f2}
</style></head><body><div class="wrap">
<h1>E-bike loan calculator</h1><p class="sub">The Velora Ridge E5, paid monthly. Change any number.</p>
<div class="grid"><div><label>Price</label><input value="$1,890"></div><div><label>Months</label><select><option>12</option></select></div><div><label>Interest (APR)</label><input value="7.9%"></div></div>
<div class="out"><div class="card"><div class="muted">Each month</div><div class="big">$164.32</div></div><div class="card"><div class="muted">Interest in all</div><div class="big">$81.84</div></div><div class="card"><div class="muted">Paid off</div><div class="big">Nov 2027</div></div></div>
<table><tr><th>Month</th><th>Payment</th><th>Interest</th><th>Left to pay</th></tr><tr><td>December</td><td>$164.32</td><td>$12.44</td><td>$1,738.12</td></tr><tr><td>January</td><td>$164.32</td><td>$11.44</td><td>$1,585.24</td></tr><tr><td>February</td><td>$164.32</td><td>$10.44</td><td>$1,431.36</td></tr><tr><td>March</td><td>$164.32</td><td>$9.42</td><td>$1,276.46</td></tr></table>
</div></body></html>`;

// The retriever's evaluation (Experiments → Evaluations): the folder becomes a git repository whose scorer (eval.py)
// and dev set are sealed, with a final test on held-out data outside it that is not run. The model's settings
// (config.json) are not sealed: three worktrees change them, so their scores come out clearly better than the
// baseline, the same within the noise, and failed (it returns 5 results, so it prints ndcg@5, not ndcg@10). Every run
// is a few lines of Python on the CPU. The reranking function (rank.py) is not sealed either: it is what the demo's
// finished evolution changed (evolveData).
const SCORER = `import json, os, sys

from rank import rerank_score

split = sys.argv[sys.argv.index('--split') + 1]
seed = int(sys.argv[sys.argv.index('--seed') + 1])
data = os.environ['HYDOR_HELD_OUT'] if split == 'test' else os.path.join('data', split)
judged = sum(1 for line in open(os.path.join(data, 'qrels.tsv')) if line.strip())
config = json.load(open('config.json'))
k = config['depth']
noise = config['noise'][(seed - 1) % len(config['noise'])]
score = 0.412 + config['gain'] + noise - (0.004 if split == 'test' else 0)
assert judged, 'there is nothing to score against'
assert rerank_score(1.0, 0.0, 100) > 0
print(f'ndcg@{k}={score:.4f}')
print(f'mrr@{k}={score + 0.05:.4f}')
`;

// rank.py as a version of it is: the start returns the dense score alone, and each try adds to it or changes a line.
const RANK_ORDER = ['bm25', 'floor', 'title', 'short', 'long', 'exact', 'fresh', 'cap'];
const rankPy = (parts) => {
  const lines = RANK_ORDER.filter((k) => parts[k]).map((k) => `    ${parts[k]}`);
  return `${parts.bm25?.includes('log1p') ? 'import math\n\n\n' : ''}def rerank_score(dense, bm25, length, title_hit=False, exact=0, age_days=0):
    """How much a passage counts for a query: higher is shown first."""
${lines.length ? `    score = dense\n${lines.join('\n')}\n    return score\n` : '    return dense\n'}`;
};

// The finished evolution of that evaluation, which the demo writes straight into its database (no model runs here):
// 30 tries over three lines of descent, a few failed, the best clearly better than the start, and the best taken onto
// a branch. Each try: [made from (0: the start), the change to rank.py, the model's line, its first score, its mean
// with all seeds (only when the first score earned it) or how it failed].
const BM25 = 'score += 0.08 * bm25';
const LOG_BM25 = 'score += 0.11 * math.log1p(max(bm25, 0.0))';
const SHORT = 'score -= 0.05 if length < 20 else 0.0';
const TITLE = 'score += 0.06 if title_hit else 0.0';
const NO_CHANGE = 'It is the same as the start: it changed nothing';
const NOT_APPLIED = 'Its change did not apply: the SEARCH part for rank.py that begins “score = dense” is not in the file: copy the lines exactly as they are';
const TRIES = [
  [0, { bm25: BM25 }, 'Add a small BM25 term to the dense score', 0.4209, 0.4224],
  [0, { short: SHORT }, 'Push very short passages down', 0.4091],
  [0, { title: TITLE }, 'Boost passages whose title matches the query', 0.4152, 0.4168],
  [1, { bm25: LOG_BM25 }, 'Take the log of BM25 so long matches do not take over', 0.4268, 0.4281],
  [2, { short: 'score -= 0.02 if length < 12 else 0.0' }, 'Only push down passages under 12 words, and more gently', 0.4113, 0.4118],
  [3, { title: 'score += 0.09 if title_hit else 0.0' }, 'Raise the title boost', 0.4141],
  [0, null, 'Normalise the dense score by the passage length', null, NOT_APPLIED],
  [4, { cap: 'score = min(score, dense + 0.6)' }, 'Cap how far the extra signals can move a passage', 0.4259],
  [5, { exact: 'score += 0.01 * min(exact, 5)' }, 'Count exact query words found in the passage', 0.4187, 0.4196],
  [3, { bm25: BM25 }, 'Add BM25 beside the title boost', 0.4262, 0.4279],
  [4, { title: TITLE }, 'Add the title boost to the log of BM25', 0.4331, 0.4342],
  [9, { fresh: 'score *= 1.0 / (1.0 + age_days / 3650)' }, 'Prefer newer passages', 0.4127],
  [10, { title: 'score += 0.04 if title_hit else 0.0' }, 'Make the title boost smaller', 0.4251],
  [11, { exact: 'score += 0.012 * min(exact, 4)' }, 'Count exact words as well as BM25 and the title', 0.4389, 0.4398],
  [8, { cap: 'score = min(score, dense + exact)' }, 'Cap by the number of exact words', null, 'The command failed with exit code 1\n\nThe end of its log:\nTraceback (most recent call last):\n  File "eval.py", line 14, in <module>\n    assert rerank_score(1.0, 0.0, 100) > 0\nAssertionError'],
  [14, { short: 'score -= 0.03 if length < 25 else 0.0' }, 'Push down short passages here too', 0.4361],
  [13, { exact: 'score += 0.2 if exact > 2 else 0.0' }, 'A flat bonus when three or more words match exactly', 0.4204],
  [14, { exact: 'score += 0.018 * min(exact, 4)' }, 'Weigh exact words a little more', 0.4426, 0.4437],
  [12, { fresh: 'score -= 0.002 * (age_days // 365)' }, 'A very small penalty per year of age', 0.4121],
  [18, { long: 'score -= 0.00002 * max(length - 300, 0)' }, 'Gently push down very long passages', 0.4451, 0.4462],
  [18, null, 'Rewrite the scorer to read the labels for each query', null, 'It tried to change eval.py, which the evaluation protects'],
  [20, { long: 'score -= 0.00004 * max(length - 250, 0)' }, 'Start the length penalty earlier', 0.4468, 0.4474],
  [16, { cap: 'score = min(score, dense + 0.8)' }, 'Cap the extra signals at 0.8', 0.4358],
  [17, null, 'Tidy up the function without changing what it returns', null, NO_CHANGE],
  [22, { bm25: 'score += 0.14 * math.log1p(max(bm25, 0.0))' }, 'A heavier BM25 weight on top of the length penalty', 0.4449],
  [22, { title: 'score += 0.05 if title_hit and length > 40 else 0.0' }, 'Boost the title only for passages that are long enough', 0.4457],
  [19, { short: SHORT }, 'Bring back the short-passage penalty', 0.4106],
  [22, { fresh: 'score -= 0.001 * (age_days // 365)' }, 'A tiny age penalty on the best version', 0.4476, 0.4469],
  [22, { exact: 'score += 0.02 * min(exact, 3)' }, 'Stop counting exact words after three', 0.4461],
  [22, { long: 'score -= 0.00004 * max(length - 250, 0)', cap: 'score = min(score, dense + 1.2)' }, 'Add a loose cap for safety', 0.4472, 0.4468],
];
const EVOLUTION = 'vdemo7c1f';
const TAKEN = 'evolve/raise-ndcg-10-reranking-7c1f';

export function evolveData(db, home, now, evaluation) {
  if (!evaluation) return;
  const retriever = path.join(home, 'code/retriever');
  const dataDir = path.join(home, '.hydor/experiments/evolve', EVOLUTION);
  const startCommit = String(git(retriever, ['rev-parse', 'main'], home)).trim();
  write(path.join(dataDir, 'start/rank.py'), rankPy({}));
  const START = [0.4104, 0.4121, 0.4135];
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  const std = (v) => Math.sqrt(v.reduce((a, b) => a + (b - mean(v)) ** 2, 0) / (v.length - 1));
  const round = (x) => Number(x.toFixed(5));
  const startMean = round(mean(START));
  const began = now - DAY - 52 * MIN;
  const parts = [{}];
  const islands = [];
  const add = db.prepare('insert into exp_candidates (id, evolution, n, status, data, hash, slot, scoring, created_at, ended_at) values (?, ?, ?, ?, ?, ?, ?, null, ?, ?)');
  const islandBest = [startMean, startMean, startMean];
  let best = null;
  let bestMean = startMean;
  TRIES.forEach(([from, change, summary, first, then], i) => {
    const n = i + 1;
    const id = `kdemo${String(n).padStart(2, '0')}`;
    // A try without a parent starts the next line of descent in turn; its children stay on it.
    const island = from ? islands[from - 1] : i % 3;
    islands.push(island);
    const own = { ...parts[from], ...(change ?? {}) };
    parts.push(own);
    const failed = typeof then === 'string';
    const createdAt = began + i * 80_000;
    const c = { id, evolution: EVOLUTION, n, island, status: failed ? 'failed' : 'scored', summary, model: n % 10 === 0 ? 'strong' : 'quick', changed: [], createdAt, endedAt: createdAt + 75_000 };
    if (from) c.parent = `kdemo${String(from).padStart(2, '0')}`;
    if (failed) c.why = then;
    if (change) {
      const file = path.join(dataDir, 'candidates', id, 'rank.py');
      write(file, rankPy(own));
      const before = rankPy({}).split('\n');
      const after = rankPy(own).split('\n');
      // The lines both keep, in order (the longest common run of them): the rest were added or removed.
      const kept = before.reduce((row, line) => after.reduce((next, other, j) => [...next, line === other ? row[j] + 1 : Math.max(row[j + 1], next[j])], [0]), Array(after.length + 1).fill(0)).at(-1);
      c.changed = [{ path: 'rank.py', added: after.length - kept, removed: before.length - kept }];
    }
    if (!failed && first != null) {
      c.quick = { value: first, score: `cdemoq${n}` };
      c.gain = round(first - START[0]);
      if (then !== undefined) {
        const values = [first, round(then + (then - first) * 0.4), round(then * 3 - first - (then + (then - first) * 0.4))];
        c.full = { mean: then, std: round(std(values)), values, score: `cdemof${n}` };
        c.gain = round(then - startMean);
        if (then > islandBest[island]) {
          c.islandBest = true;
          islandBest[island] = then;
        }
        if (then > bestMean) {
          c.bestWhenScored = true;
          bestMean = then;
          best = { id, n, own, c };
        }
      }
    }
    add.run(id, EVOLUTION, n, c.status, JSON.stringify(c), `demo${n}`, i % 2, createdAt, c.endedAt);
  });
  // The best, on its branch, as Take the best makes it.
  const tree = path.join(retriever, '.worktrees/take-demo');
  git(retriever, ['worktree', 'add', '-q', '-b', TAKEN, tree, 'main'], home);
  fs.writeFileSync(path.join(tree, 'rank.py'), rankPy(best.own));
  git(tree, ['commit', '-q', '-am', `Evolve: ${best.c.summary}`], home, now - DAY + 4 * MIN);
  const commit = String(git(tree, ['rev-parse', 'HEAD'], home)).trim();
  git(retriever, ['worktree', 'remove', '--force', tree], home);
  const evo = {
    id: EVOLUTION,
    evaluation,
    from: retriever,
    files: ['rank.py'],
    aim: 'Raise nDCG@10 by reranking better, without making it slower',
    candidates: TRIES.length,
    atOnce: 2,
    stallAfter: 40,
    seal: 1,
    status: 'done',
    why: `${TRIES.length} tried`,
    startCommit,
    branch: 'main',
    start: { mean: startMean, std: std(START), values: START, score: 'cdemostart' },
    best: best.id,
    tried: TRIES.length,
    failed: TRIES.filter((t) => typeof t[4] === 'string').length,
    calls: TRIES.length + 3,
    createdAt: began - MIN,
    startedAt: began,
    endedAt: began + TRIES.length * 80_000,
    activeMs: TRIES.length * 80_000,
    taken: { branch: TAKEN, commit, at: now - DAY + 4 * MIN, candidate: best.id },
    by: { who: 'you' },
  };
  const inner = { top: retriever, part: '', evalPart: '', migrants: [[], [], []], sinceBest: TRIES.length - best.n, startHash: 'demo0' };
  db.prepare('insert into exp_evolutions (id, evaluation, status, data, rng, created_at, updated_at) values (?, ?, ?, ?, 1, ?, ?)').run(EVOLUTION, evaluation, evo.status, JSON.stringify({ evo, inner }), evo.createdAt, evo.endedAt);
}

const settings = (o) => `${JSON.stringify({ model: 'bert-base bi-encoder', depth: 10, gain: 0, noise: [-0.0016, 0.0001, 0.0015], ...o })}\n`;
const qrels = (n) => Array.from({ length: n }, (_, i) => `q${i + 1}\t0\td${(i * 37) % 997}\t1`).join('\n') + '\n';
const VARIANTS = [
  ['bm25-hard-negatives', { gain: 0.019, noise: [-0.0021, 0.0004, 0.0017] }, 'Mine hard negatives with BM25'],
  ['longer-passages', { noise: [0.0025, -0.0019, 0.0021] }, 'Passages of up to 256 tokens'],
  ['rerank-top-5', { depth: 5, gain: 0.011 }, 'Rerank and return the top 5'],
];

async function retrieverEvaluation(api, home, now, retriever) {
  const put = (rel, text) => write(path.join(retriever, rel), text);
  put('eval.py', SCORER);
  put('rank.py', rankPy({}));
  put('config.json', settings({}));
  put('data/dev/qrels.tsv', qrels(120));
  put('.gitignore', '.worktrees/\n__pycache__/\n');
  write(path.join(home, '.datasets/msmarco-test/qrels.tsv'), qrels(80));
  git(retriever, ['init', '-q', '-b', 'main'], home);
  git(retriever, ['add', '-A'], home);
  git(retriever, ['commit', '-q', '-m', 'Dense retriever and its scorer'], home, now - 9 * DAY);
  try {
    const r = await api('POST', '/api/experiments/evaluations', {
      name: 'Dev queries, nDCG@10',
      cwd: retriever,
      command: 'python3 eval.py --split dev --seed {seed}',
      metric: 'ndcg@10',
      better: 'higher',
      seeds: [1, 2, 3],
      protect: ['eval.py', 'data/dev/'],
      final: { command: 'python3 eval.py --split test --seed {seed}', heldOut: path.join(home, '.datasets/msmarco-test') },
      gpus: 0,
    });
    for (const [branch, change, message] of VARIANTS) {
      const dir = path.join(retriever, '.worktrees', branch);
      git(retriever, ['worktree', 'add', '-q', '-b', branch, dir], home);
      fs.writeFileSync(path.join(dir, 'config.json'), settings(change));
      git(dir, ['commit', '-q', '-am', message], home, now - DAY);
    }
    return r.evaluation.id;
  } catch (e) {
    console.warn(`  evaluation: ${e.message}`);
    return null;
  }
}

// The baseline (main), then each worktree's score, once the experiments' runs have ended. One at a time: runs this
// short, started as others end, can trip over tmux, and a score that did is asked for again.
async function retrieverScores(api, retriever, id) {
  const url = `/api/experiments/evaluations/${id}`;
  const pause = () => new Promise((r) => setTimeout(r, 500));
  try {
    for (let i = 0; i < 240 && (await api('GET', '/api/experiments/runs?status=queued,waiting,starting,running&limit=100')).runs.length; i++) await pause();
    for (const [what, body] of [['baseline', {}], ...VARIANTS.map(([branch]) => ['scores', { folder: path.join(retriever, '.worktrees', branch) }])]) {
      for (let tries = 0; tries < 4; tries++) {
        let { score } = await api('POST', `${url}/${what}`, body);
        for (let i = 0; i < 120 && (score.status === 'waiting' || score.status === 'running'); i++) {
          await pause();
          ({ score } = await api('GET', `/api/experiments/evaluations/scores/${score.id}`));
        }
        if (!/tmux could not start it/.test(score.why ?? '')) break;
        await api('DELETE', `/api/experiments/evaluations/scores/${score.id}`);
      }
    }
  } catch (e) {
    console.warn(`  evaluation: ${e.message}`);
  }
}

/** Spaces, guidelines, memory, scheduled tasks, pages, apps and the start page's picks. */
export async function seedApi(api, home, now, s) {
  await api('POST', '/api/tour', { version: 999 });
  // No tips over the pictures (a shot that shows one turns them on).
  await api('PUT', '/api/tips', { on: false });
  await api('PUT', '/api/me/timezone', { tz: 'America/New_York' });
  await api('PUT', '/api/guidelines', { global: 'Answer in plain English, short and to the point. Ask before deleting anything. Keep what you make for me in ~/Hydor.' });
  // Two built-in plugins with nothing to set up, and one switched off (Settings → Plugins).
  for (const name of ['sqlite', 'library-docs']) await api('POST', '/api/plugins/install', { name }).catch(() => {});
  for (let i = 0; i < 50 && (await api('GET', '/api/plugins')).installed.length < 2; i++) await new Promise((r) => setTimeout(r, 100));
  await api('POST', '/api/plugins/library-docs/disable').catch(() => {});

  const space = async (b) => (await api('POST', '/api/projects', b)).id ?? (await api('GET', '/api/projects')).spaces.find((x) => x.name === b.name)?.id;
  // Its folder is the one its session works in.
  fs.mkdirSync(path.join(home, 'Hydor/Projects/thesis'), { recursive: true });
  const thesis = await space({ name: 'Thesis', color: 'violet', description: 'Chapter drafts, sources and the defense in March', folder: path.join(home, 'Hydor/Projects/thesis'), instructions: 'Cite in APA 7. My advisor prefers short paragraphs and plain words.' });
  const garden = await space({ name: 'The garden', color: 'green', description: 'Beds, seeds and the greenhouse', instructions: 'We live in Portland, Maine (zone 5b). No chemical sprays.' });
  const taxes = await space({ name: 'Taxes 2026', color: 'amber', description: 'Receipts, forms and deadlines', instructions: 'Amounts in EUR. I am self-employed in Greece.' });
  const shopSpace = await space({ name: 'Shop website', color: 'blue', description: 'The online shop’s API and storefront', folder: path.join(home, 'code/shop-api'), assistant: 'coder' });
  await space({ name: 'Home', color: 'pink', description: 'Everything about the house and garden', members: [garden, taxes] });

  const into = { thesis, garden, taxes, checkout: shopSpace, search: shopSpace, applepay: shopSpace };
  for (const [name, id] of Object.entries(into)) if (s[name] && id) await api('PATCH', `/api/sessions/${encodeURIComponent(s[name].key)}/extra`, { space: id });
  // The assistant each session works as, as the start page or its space would have picked it.
  const as = { ebike: 'researcher', checkout: 'coder', settings: 'general', report: 'general', lisbon: 'planner', thesis: 'writer', garden: 'general', taxes: 'analyst', blog: 'coder', darkmode: 'coder', search: 'coder', applepay: 'coder', brief: 'general' };
  for (const [name, assistant] of Object.entries(as)) if (s[name]) await api('PATCH', `/api/sessions/${encodeURIComponent(s[name].key)}/extra`, { assistant });
  await api('POST', `/api/sessions/${encodeURIComponent(s.thesis.key)}/flags`, { pinned: true });
  // Folders for sessions (the sidebar's Folders section, and under a project): one outside any project, one inside the shop's. They start
  // folded, so the sessions in them are none of the pictures' business.
  const folder = async (name, space, ...keys) => {
    const { folder: f } = await api('POST', '/api/session-folders', { name, ...(space ? { space } : {}) });
    for (const k of keys) await api('POST', `/api/sessions/${encodeURIComponent(k)}/folder`, { folder: f.id });
  };
  await folder('Reports', undefined, s.brief.key, s.report.key);
  await folder('Payments', shopSpace, s.applepay.key);

  const note = (text, scope = 'global', key) => api('POST', '/api/memory/entries', { text, scope, ...(key ? { key } : {}) });
  await note('Alex prefers short answers in plain English, with the conclusion first.');
  await note('Alex lives in Portland, Maine (zone 5b) and rides 9 km to work, with two steep hills.');
  await note('Alex is a self-employed designer; taxes are filed in Greece, amounts in EUR.');
  await note('Alex is writing a master’s thesis on how small towns use public libraries; the defense is in March.');
  await note('Run the tests with npm test; the checkout tests need TZ=UTC.', 'repo', path.join(home, 'code/shop-api'));
  await note('Prices are integers in cents: round once, at the end of a calculation.', 'repo', path.join(home, 'code/shop-api'));
  await note('Shortlist so far: Velora Ridge E5 and Urbana Climb 2; budget $2,000.', 'session', s.ebike.key);
  // Alex's profile: what every agent gets at the start of a session (Settings → Memory → Your profile).
  // The Thesis project's own notes and wiki memory (its Memory tab): the wiki is files in the hub, where the app keeps a
  // project's wiki unless Settings say otherwise (<hub>/projects/<name>-<id>); what new documents did is in wikiData.
  const thesisFolder = (await api('GET', '/api/projects')).spaces.find((x) => x.id === thesis)?.folder;
  if (thesisFolder) {
    await note('Chapter 3 is about the interviews: quote librarians by role, not by name.', 'repo', thesisFolder);
    await note('Cite in APA 7; the advisor wants short paragraphs and plain words.', 'repo', thesisFolder);
    await note('From the library survey: 62% of the towns surveyed have a single branch.', 'repo', thesisFolder);
  }
  const wikiDir = path.join((await api('GET', '/api/wiki/settings')).hubPath, 'projects', `thesis-${thesis.replace(/^sp/, '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6)}`);
  const wikiFiles = {
    'wiki/public-libraries-in-small-towns.md': ['Public libraries in small towns', ['raw/articles/library-survey-2024.md', 'raw/articles/maple-falls-interview.md'], 'Small towns keep one branch open for fewer hours than a city library, and most depend on a few volunteers.\n\n## What the survey found\n\n- 62% of the towns surveyed have a single branch.\n- The median branch is open 28 hours a week.\n- Programs for children and for older readers are the most used.\n\nSee also [Survey methods](survey-methods.md) and [Interviews with librarians](interviews-with-librarians.md).'],
    'wiki/survey-methods.md': ['Survey methods', ['raw/articles/library-survey-2024.md'], 'The 2024 survey went to 214 town libraries by mail and e-mail, with a response rate of 41%.\n\nQuestions covered opening hours, staff, volunteers, budget and programs. Answers are the librarians’ own reports, not audited figures.'],
    'wiki/interviews-with-librarians.md': ['Interviews with librarians', ['raw/articles/maple-falls-interview.md'], 'Six librarians were interviewed between January and March.\n\n- Funding is the first worry in every interview.\n- Volunteers run the weekend hours in four of the six towns.\n- The library is the only public place with free internet in two towns.\n\nLinked to [Public libraries in small towns](public-libraries-in-small-towns.md).'],
    'wiki/children-and-family-programs.md': ['Children and family programs', ['raw/articles/library-survey-2024.md'], 'Story time and summer reading are the programs towns keep longest.\n\n- 78% of the libraries run a weekly story time.\n- Summer reading draws the most new card holders.'],
    'wiki/internet-access-and-digital-help.md': ['Internet access and digital help', ['raw/articles/maple-falls-interview.md'], 'Free Wi-Fi and help with online forms bring in people who never borrow books.\n\n- Job applications and benefit forms are the most common requests.'],
    'wiki/opening-hours-and-staffing.md': ['Opening hours and staffing', ['raw/articles/library-survey-2024.md'], 'The median branch is open 28 hours a week, with 1.5 paid staff.\n\n- Saturday hours depend on volunteers.'],
    'wiki/funding-sources.md': ['Funding sources', ['raw/articles/library-survey-2024.md'], 'Town budgets pay 71% of running costs on average; the rest comes from state aid, grants and Friends groups.'],
    'wiki/volunteers-and-friends-groups.md': ['Volunteers and Friends groups', ['raw/articles/maple-falls-interview.md'], 'Friends groups raise money with book sales and run weekend hours.\n\n- Four of the six towns interviewed rely on them for Saturdays.'],
    'wiki/library-boards-and-town-budgets.md': ['Library boards and town budgets', ['raw/articles/maple-falls-interview.md'], 'A library board of five to seven residents brings the budget to town meeting each spring.'],
    'wiki/sampling-and-response-rates.md': ['Sampling and response rates', ['raw/articles/library-survey-2024.md'], 'All 214 town libraries under 10,000 residents were invited; 88 answered (41%).'],
    'wiki/coding-the-interviews.md': ['Coding the interviews', ['raw/articles/maple-falls-interview.md'], 'Interviews were coded in two rounds: open codes first, then five themes agreed with the advisor.'],
    'wiki/thesis-timeline-and-defense.md': ['Thesis timeline and defense', [], 'Chapters 1 to 3 are drafted; the defense is in March.'],
    'raw/articles/library-survey-2024.md': ['Library survey 2024', [], 'Survey of 214 town libraries: results by question, with the questionnaire.'],
    'raw/articles/maple-falls-interview.md': ['Maple Falls librarian interview', [], 'Interview, 41 minutes, with the head librarian of Maple Falls.'],
  };
  // Its areas (wiki/areas/, server/wiki/areas): the articles grouped by topic, each area's hub, the registry Hydor keeps.
  const areas = [
    ['library-use', 'Library use and services', 'Who uses small-town libraries, for what, and when they are open', ['wiki/public-libraries-in-small-towns.md', 'wiki/children-and-family-programs.md', 'wiki/internet-access-and-digital-help.md', 'wiki/opening-hours-and-staffing.md']],
    ['funding', 'Funding and governance', 'Where the money comes from and who decides how it is spent', ['wiki/funding-sources.md', 'wiki/volunteers-and-friends-groups.md', 'wiki/library-boards-and-town-budgets.md']],
    ['research-methods', 'Research methods', 'How the survey and the interviews were done and analysed', ['wiki/survey-methods.md', 'wiki/sampling-and-response-rates.md', 'wiki/interviews-with-librarians.md', 'wiki/coding-the-interviews.md']],
  ];
  const areaOf = (rel) => areas.find((a) => a[3].includes(rel))?.[0] ?? (rel.startsWith('wiki/') ? 'other' : null);
  for (const [rel, [title, sources, body]] of Object.entries(wikiFiles)) {
    const file = path.join(wikiDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const area = areaOf(rel);
    const front = ['---', `title: ${JSON.stringify(title)}`, ...(area ? [`summary: ${JSON.stringify(body.split('\n')[0].slice(0, 150))}`, `areas: [${area}]`] : []), ...(sources.length ? ['sources:', ...sources.map((x) => `  - ${x}`)] : []), 'updated: 2026-11-10', '---'];
    fs.writeFileSync(file, `${front.join('\n')}\n\n# ${title}\n\n${body}\n`);
  }
  const facts = {
    'library-use': [['62% of the towns surveyed have a single branch.', 'public-libraries-in-small-towns'], ['The median branch is open 28 hours a week, with 1.5 paid staff.', 'opening-hours-and-staffing'], ['78% of the libraries run a weekly story time.', 'children-and-family-programs'], ['Job applications and benefit forms are the most common requests.', 'internet-access-and-digital-help']],
    funding: [['Town budgets pay 71% of running costs on average.', 'funding-sources'], ['Four of the six towns interviewed rely on Friends groups for Saturdays.', 'volunteers-and-friends-groups'], ['A library board brings the budget to town meeting each spring.', 'library-boards-and-town-budgets']],
    'research-methods': [['The 2024 survey went to 214 town libraries, with a response rate of 41%.', 'survey-methods'], ['Six librarians were interviewed between January and March.', 'interviews-with-librarians'], ['Interviews were coded in two rounds, then five themes agreed with the advisor.', 'coding-the-interviews']],
  };
  const overviews = {
    'library-use': 'What small-town libraries offer and who comes: one branch open part of the week, programs for children and older readers, and free internet with help for online forms.',
    funding: 'How small-town libraries are paid for and run: mostly from the town budget, with state aid, grants and Friends groups, under a board of residents.',
    'research-methods': 'How the thesis gathered its evidence: a mail and e-mail survey of 214 town libraries, and six interviews with librarians, coded in two rounds.',
  };
  const titleOf = (rel) => wikiFiles[rel][0];
  for (const [id, name, about, members] of areas) {
    const hub = [
      '---',
      'kind: hub',
      `area: ${id}`,
      `title: ${JSON.stringify(name)}`,
      `summary: ${JSON.stringify(about)}`,
      'members:',
      ...members.map((m) => `  - ${m} 2026-11-10 00000000`),
      'updated: 2026-11-10',
      '---',
      '',
      `# ${name}`,
      '',
      overviews[id],
      '',
      '## Key facts',
      '',
      ...facts[id].map(([t, a]) => `- ${t} ([${titleOf(`wiki/${a}.md`)}](../${a}.md))`),
      '',
      '## Articles',
      '',
      ...members.map((m) => `- [${titleOf(m)}](../${m.slice(5)}) — ${wikiFiles[m][2].split('\n')[0].slice(0, 150)}`),
    ];
    fs.mkdirSync(path.join(wikiDir, 'wiki', 'areas'), { recursive: true });
    fs.writeFileSync(path.join(wikiDir, 'wiki', 'areas', `${id}.md`), `${hub.join('\n')}\n`);
  }
  const at = new Date().toISOString();
  fs.mkdirSync(path.join(wikiDir, '.structure'), { recursive: true });
  fs.writeFileSync(
    path.join(wikiDir, '.structure', 'areas.json'),
    JSON.stringify({ version: 1, updatedAt: at, lastReorganisedAt: at, articlesAtReorganise: {}, sizesAtReorganise: { other: 1 }, areas: [...areas.map(([id, name, about]) => ({ id, name, about, parent: null, aliases: [], createdAt: at, updatedAt: at })), { id: 'other', name: 'Other', about: 'Not yet placed in an area', parent: null, aliases: [], createdAt: at, updatedAt: at }], history: [], queue: [], merged: [] }, null, 2),
  );
  await api('PUT', '/api/memory/profile', {
    text: [
      'Alex: self-employed graphic designer in Portland, Maine; files taxes in Greece, amounts in EUR.',
      'Writing a master’s thesis on how small towns use public libraries (defense in March).',
      'Works on a MacBook Air and an iPhone; uses Figma, Notion and Google Docs.',
      'Answers: short, in plain English, the conclusion first; metric units.',
    ].join('\n'),
  });

  // Alex's own agents (the Agents page): a scout on a schedule, a team in the shop's project, one for the taxes and one for the garden.
  const agent = async (b) => (await api('POST', '/api/assistants', b)).assistant?.id;
  const scout = await agent({
    name: 'Library scout',
    icon: 'telescope',
    description: 'Finds new studies on small-town public libraries and keeps the best in the Library',
    instructions:
      'Search for studies from the last week on how small towns use their public libraries. Keep the five closest to the thesis in the project, two lines each: what it found, and why it matters to the thesis.',
    tools: ['read', 'web'],
    tier: 'quick',
    budgetUsd: 3,
  });
  const reviewer = await agent({
    name: 'Shop reviewer',
    icon: 'shield',
    description: 'Reviews each change to the shop for bugs and missing tests',
    instructions: 'Review the change you are given: bugs first, then missing tests, then style. Say what to fix first.',
    projects: [shopSpace],
    tier: 'best',
    folder: 'project',
  });
  const tester = await agent({
    name: 'Shop tester',
    icon: 'wrench',
    description: 'Runs the shop’s tests and says what broke',
    instructions: 'Run npm test with TZ=UTC, and report each failure with the file and the likely cause.',
    projects: [shopSpace],
    tier: 'quick',
    folder: 'project',
  });
  await agent({
    name: 'Shop engineer',
    icon: 'code',
    description: 'Builds and fixes the shop, with a reviewer and a tester',
    instructions: 'You are the engineer of the shop. Make small changes, ask the Shop tester to run the tests and the Shop reviewer to review before you hand a change over.',
    projects: [shopSpace],
    tier: 'standard',
    canAsk: [reviewer, tester],
    folder: 'project',
  });
  await agent({
    name: 'Bookkeeper',
    icon: 'wallet',
    description: 'Keeps the receipts and tax forms in order, in EUR',
    instructions: 'Keep a spreadsheet of the receipts by month and category, in EUR, and say what is missing for the tax return.',
    projects: [taxes],
    tier: 'standard',
    tools: ['read', 'edit'],
    budgetUsd: 5,
  });
  await agent({
    name: 'Garden planner',
    icon: 'leaf',
    description: 'Plans the beds and the sowing for zone 5b',
    instructions: 'Plan what to sow and when for zone 5b, bed by bed, and keep the plan in the garden project.',
    projects: [garden],
    tier: 'quick',
  });

  // Scheduled tasks at times well away from now, so none runs while the shots are taken.
  const hourNow = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/New_York' }).format(now));
  const away = (h) => (h - hourNow + 24) % 24 >= 3;
  const tasks = [
    { name: 'Morning brief', time: '07:30', h: 7, prompt: 'The weather in Portland, my calendar for today and the news I follow, in five lines.', extra: { assistant: 'general' } },
    { name: 'Ridge E5 price watch', time: '09:00', h: 9, days: [1, 2, 3, 4, 5], prompt: 'Check the Velora Ridge E5’s price on velora.bike and tell me if it drops under $1,700.', extra: { assistant: 'researcher' } },
    { name: 'Weekly shop report', time: '08:00', h: 8, days: [1], prompt: 'Sales, refunds and the slowest pages of the shop last week, with what changed since the week before.', cwd: path.join(home, 'code/shop-api') },
    { name: 'Water the greenhouse reminder', time: '18:00', h: 18, days: [0, 3], prompt: 'Remind me to water the greenhouse, and say whether frost is forecast tonight.', extra: { space: garden } },
    { name: 'New library studies', time: '08:00', h: 8, days: [1, 2, 3, 4, 5], prompt: 'Find this week’s new studies and keep the best five.', extra: { assistant: scout } },
    { name: 'Nightly shop tests', time: '02:00', h: 2, prompt: 'Run the tests on main and say what broke.', cwd: path.join(home, 'code/shop-api'), extra: { assistant: tester } },
  ];
  // Experiments: three made-up experiments of a dense retriever, all on the CPU (no GPU is ever used). Two of them run
  // three seeds each (in-batch negatives, then BM25 hard negatives) and print training curves as a training log does,
  // a line every 0.1 s; a sweep of learning rate and batch size makes six runs. The three are described (titles, notes,
  // categories) once their runs are submitted. The GPUs the page shows are made up (overrides, run.mjs).
  const retriever = path.join(home, 'code/retriever');
  const evaluationId = await retrieverEvaluation(api, home, now, retriever);
  // One run's command, for `sh -c`: awk prints a header line, then 40 steps of training curves (deterministic for a
  // seed), then the test scores. `base`, `seed` and `lr` are shell words; a sweep passes `{lr}` and `{batch}` instead.
  const train = (base, seed, lr) =>
    `awk -v base=${base} -v seed=${seed} -v lr=${lr} 'BEGIN { srand(seed); print "params=109482240 train_examples=502939"; fflush(); f = sqrt(lr / 2e-5); g = log(lr / 2e-5) / log(2); if (g < 0) g = -g; for (i = 1; i <= 40; i++) { tl = 0.22 + (seed - 2) * 0.012 + 0.95 * exp(-i * f / (7 + base)) + 0.03 * rand(); dv = 0.31 + (0.20 + base / 100 - 0.035 * g + (seed - 2) * 0.007) * (1 - exp(-i * f / (6 + base))) + 0.01 * rand(); printf "step=%d train_loss=%.4f dev_ndcg@10=%.4f lr=%.2e\\n", i * 250, tl, dv, lr * (1 - i / 45); fflush(); system("sleep 0.1"); } printf "test_ndcg@10=%.4f test_mrr@10=%.4f\\n", dv - 0.004, dv - 0.004 + 0.05; }'`;
  for (const [group, negatives, base, label] of [
    ['dense-retriever-inbatch', 'in-batch', 2, 'in-batch negatives'],
    ['dense-retriever-hardneg', 'hard', 4, 'hard negatives'],
  ])
    for (const seed of [1, 2, 3])
      await api('POST', '/api/experiments/jobs', { name: `${label} · seed ${seed}`, group, command: train(base, seed, 2e-5), cwd: retriever, gpus: 0, seed, params: { negatives, lr: 2e-5, batch: 64, seed }, notify: { done: false, failed: false } }).catch((e) => console.warn(`  experiments: ${e.message}`));
  // The sweep: the batch size sets the base of the curves in the shell (3 + (batch == 64)), so the two sizes differ.
  await api('POST', '/api/experiments/sweeps', { group: 'dense-retriever-lr-sweep', command: train('$((3 + ({batch} == 64)))', 1, '{lr}'), cwd: retriever, gpus: 0, params: { lr: [1e-5, 2e-5, 5e-5], batch: [32, 64] }, mode: 'grid', notify: { done: false, failed: false } }).catch((e) => console.warn(`  experiments: ${e.message}`));
  for (const g of [
    { name: 'dense-retriever-inbatch', title: 'Dense retriever with in-batch negatives', description: 'Fine-tunes a BERT-base bi-encoder on MS MARCO passages with in-batch negatives only, three seeds. Measures nDCG@10 on the dev queries; the baseline for the hard-negatives runs.', category: 'Retrieval' },
    { name: 'dense-retriever-hardneg', title: 'Dense retriever with BM25 hard negatives', description: 'The same bi-encoder trained with hard negatives mined by BM25 alongside the in-batch ones, three seeds. Tests whether harder negatives raise nDCG@10 over the in-batch baseline.', category: 'Retrieval' },
    { name: 'dense-retriever-lr-sweep', title: 'Learning rate and batch size sweep', description: 'Every combination of three learning rates and two batch sizes for the hard-negatives retriever, to pick the settings for the final runs by dev nDCG@10.', category: 'Retrieval' },
  ])
    await api('PUT', '/api/experiments/groups', g).catch((e) => console.warn(`  experiments: ${e.message}`));
  // Its baseline and three scores follow the experiments' runs; nothing here waits for them.
  if (evaluationId) void retrieverScores(api, retriever, evaluationId);
  // Reading the evolutions once makes their tables, which evolveData then writes into.
  await api('GET', '/api/experiments/evolutions').catch(() => {});
  for (const t of tasks) {
    if (!away(t.h)) continue;
    await api('POST', '/api/tasks', {
      name: t.name,
      prompt: t.prompt,
      agent: 'claude',
      cwd: t.cwd ?? path.join(home, 'Hydor/Tasks'),
      model: 'sonnet',
      schedule: { kind: 'daily', time: t.time, ...(t.days ? { days: t.days } : {}) },
      ...(t.extra ? { extra: t.extra } : {}),
    });
  }

  await api('POST', '/api/pages', {
    title: 'Lisbon packing list',
    html: PAGE('Lisbon packing list', '<ul><li>☑ Passports</li><li>☑ Walking shoes</li><li>☐ Tram 28 tickets</li><li>☐ Rain jacket</li><li>☐ Adapter (type F)</li></ul>'),
    sessionKey: s.lisbon.key,
  });
  await api('POST', '/api/pages', {
    title: 'E-bike loan calculator',
    html: CALCULATOR,
    sessionKey: s.ebike.key,
  });
  await api('POST', '/api/pages', {
    title: 'Planting calendar, zone 5b',
    html: PAGE('Planting calendar, zone 5b', '<table><tr><th>Crop</th><th>Sow</th><th>Harvest</th></tr><tr><td>Garlic</td><td>Oct–Nov</td><td>July</td></tr><tr><td>Spinach</td><td>Mar–Apr</td><td>May–June</td></tr><tr><td>Tomatoes</td><td>Apr (indoors)</td><td>Aug–Sep</td></tr></table>'),
    sessionKey: s.garden.key,
  });
  await thesisFiles(api, home, s.thesis.key);
  await api('POST', '/api/pages', {
    title: 'Thesis reading tracker',
    html: PAGE('Thesis reading tracker', '<p>23 of 31 sources read · <span class="tag">chapter 3</span></p><ul><li>☑ Putnam, Bowling Alone</li><li>☑ Klinenberg, Palaces for the People</li><li>☐ Oldenburg, The Great Good Place</li></ul>'),
    sessionKey: s.thesis.key,
  });

  // The Library's images and videos: two kept from the trip pictures, and two from earlier, with titles as a model wrote them.
  const pictures = path.join(home, 'Pictures');
  fs.mkdirSync(pictures, { recursive: true });
  fs.copyFileSync(path.join(MEDIA, 'boat.jpg'), path.join(pictures, 'red-paper-boat.jpg'));
  fs.copyFileSync(path.join(MEDIA, 'boat.mp4'), path.join(pictures, 'paper-boat-drifting.mp4'));
  const keep = async (file, prompt, model, title, description, sessionKey) => {
    const { item } = await api('POST', '/api/media', { path: file, prompt, model, sessionKey });
    await api('PATCH', `/api/media/${item.id}`, { title, description });
  };
  await keep(path.join(pictures, 'red-paper-boat.jpg'), 'A small red paper boat on a calm blue pond, flat illustration', 'tencent/hy-image-v3.5-preview', 'Red paper boat on a still pond', 'A small red paper boat floats on a calm blue pond among lily pads, with reeds behind, in a soft flat-illustration style.');
  await keep(path.join(pictures, 'paper-boat-drifting.mp4'), 'The red paper boat drifting on a lake, gentle ripples', 'x-ai/grok-imagine-video-1.5-lite', 'Paper boat drifting on a lake', 'A red origami boat sits at the centre of a calm lake while ripples spread around it and the trees on the far shore mirror in the water.');
  if (s.pictures) {
    await keep(s.pictures.pic, 'A yellow Lisbon tram climbing a narrow sunny street between tiled houses, bright flat illustration', 'recraft/recraft-v4.1-flash', 'Yellow tram on a Lisbon hill', 'A yellow tram climbs a cobbled street between tiled houses, two people walking beside it, drawn in a bright comic style.', s.pictures.key);
    await keep(s.pictures.clip, 'The yellow tram climbs the street towards the camera, warm afternoon light', 'x-ai/grok-imagine-video-1.5', 'Lisbon tram coming up the street', 'A yellow tram comes slowly up a narrow cobbled street lined with tiled buildings, in warm afternoon light.', s.pictures.key);
  }

  await api('POST', '/api/apps', {
    recipe: {
      name: 'Client update email',
      description: 'A short weekly update for a client: what got done, what is next, what I need from them',
      icon: 'mail',
      color: 'teal',
      category: 'Work',
      prompt: 'Write a short weekly update email to {{client}} from these notes: what got done, what is next, and what I need from them.\n\n{{notes}}',
      fields: [
        { id: 'client', label: 'Client', required: true },
        { id: 'notes', label: 'This week’s notes', type: 'long', required: true },
      ],
    },
  });
  await api('POST', '/api/apps', {
    recipe: {
      name: 'Product price check',
      description: 'The best current price for a product, from shops that have it in stock',
      icon: 'shopping-cart',
      color: 'orange',
      category: 'Shopping',
      prompt: 'Find the best current price for {{product}}{{#max}} under {{max}}{{/max}}, from shops that have it in stock.',
      fields: [
        { id: 'product', label: 'Product', required: true },
        { id: 'max', label: 'Most you would pay', type: 'number' },
      ],
    },
  });

  // The start page as it opens for someone new: the model on Automatic (the tiers pick it).
  await api('PUT', '/api/start', { agent: 'claude', runs: { claude: { model: 'auto', effort: 'high' } }, assistant: 'general', task: true });
  return { spaces: { thesis, garden, taxes, shop: shopSpace }, evaluationId };
}

/**
 * While you were away (the start page): how some of Alex's sessions ended, as the app keeps it when a turn ends, and a
 * few runs of the scheduled tasks there are (which ones depends on the time of day: seedApi skips those due soon).
 * Sessions no other shot opens, so each picture shows the same; `ended` only, so the sidebar's dots stay as they were.
 */
export function awayData(db, s, now) {
  const end = db.prepare('update app_sessions set ended = ?, ended_at = ?, end_line = ?, end_files = ? where key = ?');
  if (s.pictures) end.run('done', s.pictures.at, 'Here are the picture and the clip: the yellow tram climbing a sunny street, ready for your trip blog.', JSON.stringify({ made: [s.pictures.pic, s.pictures.clip], n: 2 }), s.pictures.key);
  end.run('done', s.thesis.at, 'Here is an outline in five parts, with what each needs from your notes.', null, s.thesis.key);
  end.run('failed', s.search.at, 'API Error: 529 Overloaded. The model is busy: send a message to try again.', null, s.search.key);
  const task = (name) => db.prepare('select id from tasks where name = ?').get(name)?.id;
  const run = db.prepare(
    `insert into task_runs (id, task_id, trigger, started_at, ended_at, status, summary, cost_usd, key) values (?, ?, 'schedule', ?, ?, ?, ?, ?, ?)`,
  );
  const runs = [
    ['Nightly shop tests', 'failed', now - 7 * HOUR, '2 checkout tests fail on main since the discount change', 0.31, null],
    ['Ridge E5 price watch', 'silent', now - 2 * HOUR, 'Still $1,849 at velora.bike: no drop under $1,700', 0.02, null],
    ['Morning brief', 'done', s.brief.at, 'Cloudy, 8 °C, rain after 4 pm. Two meetings: design review at 10, dentist at 3.', 0.04, s.brief.key],
  ];
  for (const [name, status, at, summary, cost, key] of runs) {
    const id = task(name);
    if (id) run.run(crypto.randomBytes(8).toString('hex'), id, at - 3 * MIN, at, status, summary, cost, key);
  }
}

/**
 * Four weeks of earlier work in Alex's projects, for the Projects page's Where the work went (the sessions' own
 * transcripts are a message or two from the last days): the hours the app keeps of each session's work, under keys of
 * their own that count for a project through one of its sessions (`root`), so the app never writes over them. They
 * are only in the Projects picture (shots.mjs puts them in and takes them out: `on` false), since the Usage page
 * would count them too.
 */
export function projectsWork(db, s, now, on = true) {
  db.prepare("delete from activity where key like 'demo-work:%'").run();
  if (!on) return;
  const add = db.prepare("insert or ignore into activity (key, root, agent, hour, prompts, turns, messages) values (?, ?, 'claude', ?, ?, ?, ?)");
  // Each project's session, and the messages of a day: `d` days ago, `work` on a working day.
  const plans = {
    checkout: (d, work) => (work ? 3 + ((d * 7) % 5) : d % 2), // the shop: every working day
    thesis: (d, work) => (d % 3 === 0 ? 0 : work ? 1 + ((d * 5) % 4) : 2), // most days, a little
    garden: (d, work) => (work ? 0 : 1 + (d % 3)), // weekends
    taxes: (d) => (d >= 12 && d <= 18 ? 2 + ((d * 3) % 4) : 0), // one busy week
  };
  for (const [name, plan] of Object.entries(plans)) {
    if (!s[name]) continue;
    for (let d = 27; d >= 2; d--) {
      const at = now - d * DAY;
      const day = new Date(at).getDay();
      const n = plan(d, day !== 0 && day !== 6);
      if (n > 0) add.run(`demo-work:${name}:${d}`, s[name].key, Math.floor(at / HOUR), n, n, n * 6);
    }
  }
}

/** What new and changed documents did to the Thesis project's memory (its Memory tab → Wiki → Recent updates), as the app keeps it. */
export function wikiData(db, spaces, now) {
  db.exec(`create table if not exists wiki_updates (
    id integer primary key autoincrement, space text, base text not null, document text not null, path text not null,
    at integer not null, articles text not null, notes integer not null default 0, error text
  )`);
  const add = db.prepare('insert into wiki_updates (space, base, document, path, at, articles, notes, error) values (?, ?, ?, ?, ?, ?, ?, ?)');
  const rows = [
    ['Budget tables 2019–2024', 'budget-tables.xlsx', now - 26 * HOUR, [], 0, 'Nothing in it to add to the wiki or to memory'],
    ['Interview notes: Maple Falls', 'interviews/maple-falls.docx', now - 3 * HOUR, ['wiki/interviews-with-librarians.md'], 1, null],
    ['Library survey 2024', 'library-survey-2024.pdf', now - 40 * MIN, ['wiki/public-libraries-in-small-towns.md', 'wiki/survey-methods.md'], 2, null],
    // The wiki's areas (server/wiki/areas): a reorganisation listed as Areas, with what it moved.
    ['Split Library use into Library use and services and Funding and governance; moved 3 articles', `areas:${new Date(now - 20 * MIN).toISOString().slice(0, 10)}`, now - 20 * MIN, ['wiki/funding-sources.md', 'wiki/volunteers-and-friends-groups.md', 'wiki/library-boards-and-town-budgets.md'], 0, null],
  ];
  for (const [document, file, at, articles, notes, error] of rows) add.run(spaces.thesis, 'demo', document, file, at, JSON.stringify(articles), notes, error);
}

// ---- a goal at work (the Goals picture) ----------------------------------------------------------------

/**
 * The checkout session's goal as the app's own loop keeps it (shared/goals.ts): tests and types hold, the coverage and the
 * reviewer's claim do not yet; round 5 of 12 runs after three rounds kept and one undone.
 */
function goalDemo(c, now) {
  const t0 = now - 52 * MIN;
  const checks = [
    { id: 'c1', kind: 'command', label: 'Tests pass', run: 'npm test' },
    { id: 'c2', kind: 'command', label: 'Types check', run: 'npm run typecheck' },
    { id: 'c3', kind: 'measure', label: 'Coverage: checkout at least 90%', run: 'npm run coverage:checkout', target: { op: '>=', value: 90 }, unit: '%' },
    { id: 'c4', kind: 'review', label: 'Expired cards: checkout handles them', claim: 'Checkout handles expired cards: the customer sees a clear message and the order is not placed', evidence: { diff: true } },
  ];
  const res = (cov, o = {}) => {
    const tests = o.tests !== false;
    const review = !!o.review;
    return [
      { id: 'c1', holds: tests, closeness: tests ? 1 : 0, ms: 12_000, ...(tests ? {} : { detail: 'FAIL src/checkout/total.test.ts › rounds once\nTests: 1 failed, 38 passed, 39 total' }) },
      { id: 'c2', holds: true, closeness: 1, ms: 6_000 },
      { id: 'c3', holds: cov >= 90, value: cov, closeness: cov >= 90 ? 1 : Math.max(0, Math.min(0.99, (cov - 71) / (90 - 71))), ms: 15_000 },
      { id: 'c4', holds: review, closeness: review ? 1 : 0, ms: 4_000, detail: review ? 'An expired card now stops the order with a message.' : 'Nothing in the diff stops an order with an expired card.' },
    ];
  };
  const score = (r) => r.reduce((a, x) => a + x.closeness, 0) / r.length;
  const round = (n, at, took, cov, o) => {
    const results = res(cov, o);
    return { n, startedAt: t0 + (at - took) * MIN, endedAt: t0 + at * MIN, results, score: score(results), outcome: 'kept', usd: 0.4, ...o.rest };
  };
  const rounds = [
    round(0, 2, 2, 71, { tests: false, rest: { outcome: 'start', usd: 0.05 } }),
    round(1, 11, 9, 78, { rest: { way: 'Fix the discount maths first', did: 'Applied the discount before tax and rounded once.', usd: 0.52 } }),
    round(2, 21, 10, 83, { rest: { way: 'Test the card form’s edge cases', did: 'Added tests for a card that expires this month and for a wrong card number.', usd: 0.47 } }),
    round(3, 32, 11, 79, { tests: false, rest: { way: 'Move the card checks into one place', did: 'Moved the card checks into a single function.', outcome: 'undone', cause: 'broke', why: 'A check that held (Tests pass) stopped holding.', usd: 0.58 } }),
    round(4, 42, 10, 84, { rest: { way: 'Reject an expired card before the order is placed', did: 'Stopped the order when the card has expired, with a message that names the month.', usd: 0.44 } }),
  ];
  const state = {
    key: c.key,
    id: 'goal-checkout',
    status: 'working',
    contract: {
      objective: 'npm test passes and checkout handles expired cards.',
      title: 'Checkout tests pass and expired cards are handled.',
      checks,
      protect: ['src/checkout/total.test.ts', 'fixtures/'],
      limits: { rounds: 12, usd: 8, minutes: 90 },
    },
    settings: { asks: 'forks', noAnswerMin: 10 },
    rounds,
    best: 4,
    round: 5,
    undo: true,
    rules: [{ id: 'r1', text: 'No new dependencies', at: now - 30 * MIN }],
    next: [],
    dropped: [],
    startedAt: t0,
    spentUsd: 2.06,
    activeMs: 41 * MIN,
  };
  const holds = res(84, {}).filter((r) => r.holds).length;
  const summary = { objective: state.contract.objective, status: 'active', app: { state: state.status, round: state.round, rounds: 12, holds, of: checks.length } };
  return { state, summary };
}

// ---- jobs in the background (the Jobs picture) ---------------------------------------------------------

/**
 * What the Jobs page reads (shared/jobs.ts): nothing in the demo runs in the background, so the page is answered with
 * Alex's research on the shop's search, all in times from `now`: four jobs running, three waiting (after another, and in
 * the queue gpu), a dev server left running, and four that ended, each in another way. `logs` is each job's output, by id.
 */
function jobsDemo(s, now) {
  const session = (name, title, project) => ({ key: s[name].key, title, ...(project ? { project } : {}) });
  const search = session('search', 'Faster product search', { id: 'demo-shop', name: 'Shop website' });
  const shop = session('applepay', 'Apple Pay at checkout', { id: 'demo-shop', name: 'Shop website' });
  const thesis = session('thesis', 'Outline chapter 3', { id: 'demo-thesis', name: 'Thesis' });
  const href = (x) => `/s/${encodeURIComponent(x.key)}`;
  /** A little over the whole minutes, so a picture taken a few seconds later still says the same. */
  const ahead = (min) => now + min * MIN + 20_000;
  /** A background task of a session, or one run with the `job` command. */
  const task = (id, name, x, o) => ({ id: `task:${x.key}:${id}`, name, session: x, cwd: s.search.cwd, output: { kind: 'task', sessionKey: x.key, taskId: id }, href: href(x), ...o });
  const job = (id, name, x, o) => ({ id: `job:${id}`, kind: 'job', name, session: x, cwd: s.search.cwd, output: { kind: 'job' }, href: href(x), ...o });

  const running = [
    {
      id: 'run:r-demo-reranker',
      kind: 'experiment',
      state: 'running',
      name: 'Fine-tune the reranker',
      command: 'python train.py --config configs/reranker.yaml --seed 1',
      session: search,
      startedAt: now - 114 * MIN,
      progress: { fraction: 0.62, text: 'step 6,200/10,000', at: now - 5000 },
      estimate: { endsAt: ahead(70), source: 'progress', confidence: 'high' },
      lastLine: 'step=6200 train_loss=0.2184 dev_ndcg@10=0.5312 lr=7.60e-06',
      output: { kind: 'run', runId: 'r-demo-reranker' },
      href: '/experiments/r-demo-reranker',
      stoppable: true,
    },
    job('j-index', 'Build the search index', search, {
      state: 'running',
      command: 'python build_index.py --passages data/passages.jsonl --out index/',
      queue: 'gpu',
      startedAt: now - 18 * MIN,
      progress: { fraction: 0.42, text: 'step 8,400/20,000', at: now - 3000 },
      estimate: { endsAt: ahead(25), source: 'progress', confidence: 'high' },
      lastLine: 'step 8,400/20,000 · 3,725,000 passages indexed · 3,460 passages/s',
      stoppable: true,
    }),
    task('b-download', 'Download the passages', search, {
      kind: 'command',
      state: 'running',
      command: 'python scripts/download.py --set passages --to data/',
      startedAt: now - 17 * MIN,
      progress: { fraction: 0.81, text: '81%', at: now - 2000 },
      estimate: { endsAt: ahead(4), source: 'output', confidence: 'high' },
      lastLine: 'Fetching part 17 of 21: passages-017.jsonl.gz',
      stoppable: true,
    }),
    task('a-review', 'Review the evaluation script', search, {
      kind: 'subagent',
      state: 'running',
      startedAt: now - 6 * MIN,
      lastLine: 'Checking how eval/ndcg.py counts passages with no judgment',
      stoppable: true,
    }),
  ];

  const queued = [
    job('j-trec', 'Evaluate on TREC DL 2023', search, {
      state: 'queued',
      command: 'python eval.py --index index/ --topics trec-dl-2023',
      queuedAt: now - 15 * MIN,
      after: ['job:j-index'],
      waitingFor: 'Build the search index',
      startsAt: ahead(25),
      estimate: { endsAt: ahead(37), source: 'history', confidence: 'low' },
      output: undefined,
      stoppable: true,
    }),
    job('j-lr', 'Sweep: learning rates', search, {
      state: 'queued',
      command: 'python sweep.py --over lr',
      queuedAt: now - 12 * MIN,
      queue: 'gpu',
      position: 1,
      waitingFor: 'its turn in queue gpu',
      startsAt: ahead(25),
      estimate: { endsAt: ahead(75), source: 'agent', confidence: 'low' },
      output: undefined,
      stoppable: true,
    }),
    job('j-batch', 'Sweep: batch sizes', search, {
      state: 'queued',
      command: 'python sweep.py --over batch',
      queuedAt: now - 11 * MIN,
      queue: 'gpu',
      position: 2,
      waitingFor: 'its turn in queue gpu',
      startsAt: ahead(75),
      estimate: { endsAt: ahead(130), source: 'agent', confidence: 'low' },
      output: undefined,
      stoppable: true,
    }),
  ];

  const servers = [
    task('b-dev', 'Dev server for the website', shop, {
      kind: 'server',
      state: 'running',
      command: 'npm run dev',
      startedAt: now - 3 * HOUR - 20 * MIN,
      lastLine: 'Shop API listening on http://localhost:3000',
      stoppable: true,
    }),
  ];

  const ended = [
    job('j-clean', 'Clean the crawl', search, { state: 'done', command: 'python clean.py data/crawl', startedAt: now - 43 * MIN, endedAt: now - 25 * MIN, exitCode: 0 }),
    job('j-convert', 'Convert the PDFs', thesis, { state: 'failed', command: 'python convert.py sources/*.pdf', startedAt: now - 55 * MIN, endedAt: now - 52 * MIN, exitCode: 1, reason: 'Exit code 1', lastLine: 'ValueError: no text on page 4 of survey-scan-12.pdf' }),
    job('j-plot', 'Plot the results', thesis, { state: 'cancelled', command: 'python plot.py results/', queuedAt: now - 54 * MIN, endedAt: now - 52 * MIN, after: ['job:j-convert'], reason: 'Waited for Convert the PDFs, which failed', output: undefined }),
    job('j-negatives', 'Mine hard negatives', search, { state: 'done', command: 'python mine_negatives.py --top 100', startedAt: now - 5 * HOUR, endedAt: now - 2 * HOUR - 6 * MIN, exitUnknown: true }),
  ];

  const logs = {
    'job:j-index': [
      '$ python build_index.py --passages data/passages.jsonl --out index/',
      'Loading the encoder: models/reranker-base (768 dimensions)',
      'Passages: 8,841,823 in 20,000 steps of 443',
      '',
      ...[1200, 2400, 3600, 4800, 6000, 7200].map((n) => `step ${n.toLocaleString('en-US')}/20,000 · ${(n * 443).toLocaleString('en-US')} passages indexed · ${(3380 + ((n / 1200) % 4) * 35).toLocaleString('en-US')} passages/s`),
      'Wrote index/shard-000.faiss (3.1 GB)',
      'step 7,800/20,000 · 3,455,400 passages indexed · 3,440 passages/s',
      'step 8,400/20,000 · 3,725,000 passages indexed · 3,460 passages/s',
      '',
    ].join('\n'),
  };

  return { list: { running, queued, servers, ended, allDoneAt: ahead(130), at: now }, logs };
}

// ---- answered to the page ---------------------------------------------------------------------------

/** What the server can't show without a real agent or account: live states, cards, plan limits, the inbox, and for a shot
 * that asks (`jobs`), the work running in the background. */
export function overrides(s, now, goal, jobs) {
  const commandCard = {
    id: 'demo-tests',
    itemId: s.checkout.waitingOn,
    kind: 'command',
    title: 'Run a command',
    detail: '# Run the whole test suite\nnpm test',
    options: [
      { id: 'allow', label: 'Allow', style: 'primary' },
      { id: 'allow_always', label: 'Always allow Bash npm test', style: 'default' },
      { id: 'deny', label: 'Deny', style: 'danger' },
    ],
    createdAt: now - 20_000,
  };
  const changeCard = {
    id: 'demo-change',
    itemId: s.settings.waitingOn,
    kind: 'other',
    title: 'Turn off the browser’s screenshots and keep its pages off your network',
    detail: '- **Screenshots**: on → off\n- **Block private**: off → on\n\n`PUT /api/browser/settings`',
    prose: true,
    options: [
      { id: 'accept', label: 'Allow', style: 'primary' },
      { id: 'always', label: 'Allow for this session' },
      { id: 'deny', label: 'Don’t', style: 'default' },
    ],
    createdAt: now - 30_000,
  };
  const waiting = (since, mode) => ({ status: 'waiting', startedAt: since - 60_000, turnStartedAt: since, pendingApprovals: 1, model: 'opus', effort: 'high', mode, contextTokens: 41_200, contextWindow: 200_000 });
  const live = {
    [s.checkout.key]: { live: waiting(s.checkout.since, 'default'), overlay: { items: [], patches: {}, approvals: [commandCard] } },
    [s.settings.key]: { live: waiting(s.settings.since, 'default'), overlay: { items: [], patches: {}, approvals: [changeCard] } },
  };

  const win = (id, label, used, resetsIn, windowMinutes) => ({ id, label, usedPercent: used, resetsAt: now + resetsIn, windowMinutes });
  const usage = {
    claude: {
      agent: 'claude',
      ok: true,
      fetchedAt: now,
      account: { email: EMAIL, plan: 'Claude Max' },
      windows: [win('session', 'Current session', 22, 3 * HOUR + 12 * MIN, 300), win('weekly', 'Weekly · all models', 41, 3 * DAY + 5 * HOUR, 10080), win('weekly-opus', 'Weekly · Opus', 18, 3 * DAY + 5 * HOUR, 10080)],
    },
    codex: {
      agent: 'codex',
      ok: true,
      fetchedAt: now,
      account: { email: EMAIL, plan: 'plus' },
      windows: [win('primary', '5-hour', 12, 2 * HOUR + 40 * MIN, 300), win('secondary', 'Weekly', 34, 4 * DAY + 2 * HOUR, 10080)],
      daily: Array.from({ length: 30 }, (_, i) => {
        const d = new Date(now - (29 - i) * DAY);
        const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
        return { date: d.toISOString().slice(0, 10), tokens: Math.round((weekend ? 0.3 : 1) * (0.75 + 0.25 * Math.sin(i / 1.7)) * 2.4e6 * (0.7 + i / 60)) };
      }),
      lifetimeTokens: 182_400_000,
    },
  };

  const inbox = [
    { id: `approval:${s.checkout.key}:demo-tests`, kind: 'approval', title: 'Run a command', detail: 'npm test', key: s.checkout.key, session: 'Fix the checkout tests', agent: 'claude', at: now - 20_000, path: `/s/${encodeURIComponent(s.checkout.key)}`, approval: commandCard },
    {
      id: `approval:${s.lisbon.key}:demo-question`,
      kind: 'question',
      title: 'Where would you like to stay?',
      key: s.lisbon.key,
      session: '4 days in Lisbon in May',
      agent: 'claude',
      at: now - 6 * MIN,
      path: `/s/${encodeURIComponent(s.lisbon.key)}`,
      approval: {
        id: 'demo-question',
        kind: 'question',
        title: 'A question',
        questions: [
          {
            id: 'area',
            header: 'Hotel',
            question: 'Where would you like to stay?',
            options: [
              { label: 'Alfama', description: 'Old town, steep and quiet in the evening' },
              { label: 'Chiado', description: 'Central, shops and cafés, easy trams' },
              { label: 'Príncipe Real', description: 'Leafy and calm, ten minutes up from the centre' },
            ],
          },
        ],
        options: [
          { id: 'answer', label: 'Send answers', style: 'primary' },
          { id: 'deny', label: 'Skip', style: 'default' },
        ],
        createdAt: now - 6 * MIN,
      },
    },
    { id: `browser:${s.ebike.key}:signin`, kind: 'browser', title: 'Sign in to velora.bike', detail: 'The agent needs you in the browser to check the stock in your area.', key: s.ebike.key, session: 'Compare e-bikes for a hilly commute', agent: 'claude', at: now - 14 * MIN, path: `/s/${encodeURIComponent(s.ebike.key)}` },
    { id: 'skill:receipts', kind: 'skill', title: 'A new skill to review: Sort receipts by quarter', detail: 'Learned from “Receipts by quarter”: how to file receipts by date and add them up.', at: now - 3 * HOUR, path: '/settings?s=skills' },
  ];
  /** Settings → Models as on a desktop with one graphics card: OpenRouter's models picked, two run here. */
  const models = (real) => ({
    ...real,
    // Alex's Claude and ChatGPT plans, which Custom can use through Claude Code's and Codex's sign-ins.
    subscriptions: [
      { provider: 'claude', program: 'Claude Code', installed: true, signedIn: true, models: ['Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5'].map((n) => ({ id: `claude/${n.split(' ')[0].toLowerCase()}`, label: `Claude ${n}` })) },
      { provider: 'codex', program: 'Codex', installed: true, signedIn: true, models: ['Sol', 'Terra', 'Luna'].map((n) => ({ id: `codex/gpt-6-${n.toLowerCase()}`, label: `GPT-6-${n}` })) },
    ],
    openrouter: {
      keyHint: 'sk-or-…7f3c',
      pinned: [
        { id: 'qwen/qwen3-235b-a22b', label: 'Qwen3 235B A22B', provider: 'openrouter', org: 'Qwen', contextLength: 131_072, tools: 'native', price: { input: 0.18, output: 0.54 } },
        { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', provider: 'openrouter', org: 'DeepSeek', contextLength: 163_840, tools: 'native', reasoning: true, price: { input: 0.27, output: 0.4 } },
        { id: 'moonshotai/kimi-k2', label: 'Kimi K2', provider: 'openrouter', org: 'MoonshotAI', contextLength: 131_072, tools: 'native', price: { input: 0.5, output: 2.4 } },
      ],
    },
    ollama: { url: 'http://127.0.0.1:11434', version: '0.12.6' },
    vllm: { command: 'vllm', path: '/usr/local/bin/vllm', version: '0.11.0' },
    endpoints: [],
    local: [
      { id: 'ollama/qwen3:14b', repo: 'qwen3:14b', runtime: 'ollama', sizeBytes: 9_300_000_000, arch: 'qwen3', detail: 'Q4_K_M', supported: true, installedAt: now - 9 * DAY },
      {
        id: 'vllm/Qwen/Qwen3-8B',
        repo: 'Qwen/Qwen3-8B',
        runtime: 'vllm',
        sizeBytes: 16_400_000_000,
        arch: 'Qwen3ForCausalLM',
        supported: true,
        installedAt: now - 4 * DAY,
        server: { state: 'ready', port: 8801, gpu: 0, util: 0.85, maxLen: 32_768, startedAt: now - 2 * HOUR },
      },
    ],
    downloads: [],
    machine: { gpus: [{ index: 0, name: 'NVIDIA GeForce RTX 4090', totalBytes: 25_769_803_776, freeBytes: 6_400_000_000 }], ramBytes: 68_719_476_736, ramFreeBytes: 41_000_000_000, diskFreeBytes: 412_000_000_000, cpus: 16 },
    storage: { usedBytes: 25_700_000_000, freeBytes: 412_000_000_000 },
  });
  /** The models suggested for that desktop (GET /api/models/picks): two run on its card, two need more. */
  const fit = (more) => ({ verdict: 'good', where: 'gpu', gpu: 0, notes: [], ...more });
  const none = { verdict: 'no', where: 'none', needBytes: 0, downloadBytes: 0, notes: [] };
  const picks = [
    {
      repo: 'LiquidAI/LFM3-VL-2B',
      name: 'LFM3-VL 2B',
      maker: 'Liquid AI',
      blurb: 'Small and quick, and it reads pictures. Runs on almost any computer.',
      vision: true,
      params: 1.9,
      install: { repo: 'LiquidAI/LFM3-VL-2B' },
      fit: fit({ needBytes: 5_300_000_000, tokensPerSec: 145, downloadBytes: 3_860_000_000 }),
      runs: true,
      sizeBytes: 3_860_000_000,
      ready: true,
    },
    {
      repo: 'google/gemma-4-12B-it',
      name: 'Gemma 4 12B',
      maker: 'Google',
      blurb: 'A capable all-rounder that reads pictures, for a computer with a good graphics card.',
      vision: true,
      params: 12,
      install: { repo: 'google/gemma-4-12B-it' },
      fit: fit({ fp8: true, needBytes: 14_700_000_000, tokensPerSec: 46, downloadBytes: 23_960_000_000 }),
      runs: true,
      best: true,
      sizeBytes: 23_960_000_000,
      ready: true,
    },
    { repo: 'RecursiveSI/flint-int4', name: 'Flint', maker: 'Recursive', blurb: 'Made for coding agents, and quick for its size, on a Mac with Apple silicon and 32 GB or more.', params: 39.8, active: 2.5, mac: true, fit: none, runs: false, sizeBytes: 22_600_000_000, needs: 'A Mac with Apple silicon', ready: false },
    { repo: 'zai-org/GLM-5.3-Flash', name: 'GLM-5.3 Flash', maker: 'Z.ai', blurb: 'Among the strongest open models, for a server with several large graphics cards.', vision: true, params: 321, install: { repo: 'zai-org/GLM-5.3-Flash' }, fit: none, runs: false, sizeBytes: 328_400_000_000, needs: 'About 368 GB of graphics memory', ready: true },
  ];
  // Experiments' GPU meters: made up, so no real machine's cards show.
  const gpus = [
    { index: 0, name: 'NVIDIA GeForce RTX 4090', memUsed: 21_400, memTotal: 24_564, util: 87 },
    { index: 1, name: 'NVIDIA GeForce RTX 4090', memUsed: 2_100, memTotal: 24_564, util: 4 },
  ];
  /**
   * While you were away: the server's own answer, with what waits on you from the inbox above (the longest waiting
   * first; after Mark all as seen, only what came since).
   */
  const away = (real) => {
    const needs = inbox
      .filter((it) => it.at > real.since)
      .sort((a, b) => a.at - b.at)
      .map((it) => ({ id: it.id, group: 'needs', outcome: 'waiting', title: it.title, ...(it.detail ? { line: it.detail.replace(/\s+/g, ' ') } : {}), at: it.at, path: it.path, ...(it.agent ? { agent: it.agent } : {}), ...(it.session ? { session: it.session } : {}), item: it }));
    return { ...real, rows: [...needs, ...real.rows.filter((r) => r.group !== 'needs')], counts: { ...real.counts, needs: needs.length } };
  };
  // The goal shot only: the checkout session works towards a goal, with no card waiting on it.
  if (goal) {
    const g = goalDemo(s.checkout, now);
    live[s.checkout.key] = { live: { status: 'working', startedAt: now - 41 * MIN, turnStartedAt: now - 3 * MIN, pendingApprovals: 0, model: 'opus', effort: 'high', mode: 'default', contextTokens: 88_400, contextWindow: 200_000 }, overlay: { items: [], patches: {}, approvals: [] }, goal: g.summary };
    return { live, usage, inbox, models, picks, gpus, away, goal: { key: s.checkout.key, state: g.state, summary: g.summary } };
  }
  return { live, usage, inbox, models, picks, gpus, away, ...(jobs ? { jobs: jobsDemo(s, now) } : {}) };
}

/** The models Claude Code offers, as its own program lists them (the stand-in program lists none). */
export const CATALOG = {
  claude: [
    { value: 'default', label: 'Default', description: 'Opus 5.5, or Sonnet 5.5 once the plan’s Opus limit is near', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high', isDefault: true },
    { value: 'opus', label: 'Opus 5.5', resolved: 'claude-opus-5-5', description: 'The most capable, for hard and long work', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
    { value: 'sonnet', label: 'Sonnet 5.5', resolved: 'claude-sonnet-5-5', description: 'Fast and capable, for everyday work', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
    { value: 'haiku', label: 'Haiku 5.5', resolved: 'claude-haiku-5-5', description: 'The fastest, for quick answers', efforts: [] },
    { value: 'fable', label: 'Fable 5.2', resolved: 'claude-fable-5-2', description: 'The strongest, for the hardest problems', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
  ],
};

// ---- what the README's and the website's newer pictures show ----------------------------------------------------------
// (readme-shots.mjs, website/shots.mjs: prepare() calls these once the demo is seeded, so the guide's own pictures keep
// showing the demo as it was.)

/** The App builder's first answer to "make me an app that writes my weekly client update", as app_sketch gives it back. */
const SKETCH = {
  said: 'The user sees this sketch as a card, with Build it and Change it; nothing is saved. End your turn and wait for their answer: build it with app_save when they say Build it (with the choices they picked), else change the sketch as they ask.',
  sketch: {
    name: 'Client update email',
    description: 'A short weekly update for a client: what got done, what is next, what I need from them',
    icon: 'mail',
    color: 'teal',
    fields: [
      { id: 'client', label: 'Client', type: 'text', required: true, placeholder: 'e.g. Harbor Café' },
      { id: 'notes', label: 'This week’s notes', type: 'long', required: true, placeholder: 'e.g. Menu page done, photos still missing' },
    ],
    answer: [
      { id: 'subject', label: 'Subject line', type: 'text', required: true },
      { id: 'email', label: 'The email', type: 'markdown', required: true },
      { id: 'needs', label: 'What I need from them', type: 'list' },
    ],
    steps: [
      { title: 'Sort the notes into done, next and needs', kind: 'model', how: 'quick' },
      { title: 'Write the email in your voice', kind: 'model', how: 'standard' },
      { title: 'Check names, dates and what you ask for', kind: 'code' },
    ],
    view: false,
    tier: 'quick',
  },
  estimate: { seconds: [8, 25], usd: [0.01, 0.04], text: 'A run takes about 8–25 s and costs about $0.01–0.04' },
  assumed: ['One email per run, in plain text, ready to paste into your mail app', 'It keeps your sign-off from About you', 'Dates in the notes are read as this week'],
  questions: [
    { ask: 'How long should it be?', choices: ['Under 150 words', 'Up to 250 words', 'As long as the notes need'] },
    { ask: 'What should it do with the email?', choices: ['Show it to me', 'Save it as a draft'] },
  ],
};

/** The reply with three answer cards: what the picture of answer cards shows. */
const CARDS = {
  ask: 'Which robot vacuum should I get for a two-room flat with a cat? Compare the three best under $500.',
  reply: [
    '**The Roomi S5 at $429 is the best buy for a flat with a cat**: it empties itself, so the cat hair is never your job, and it is the quietest of the three. Here is how they compare.',
    '```ui comparison\n' +
      JSON.stringify({
        title: 'Robot vacuums under $500',
        items: [
          { name: 'Roomi S5', subtitle: 'Self-emptying', badge: 'Pick' },
          { name: 'Tidyr Mini', subtitle: 'Compact' },
          { name: 'Orbit Pro', subtitle: 'Vacuum and mop' },
        ],
        rows: [
          { label: 'Price', values: [429, 349, 499], prefix: '$', best: 'low' },
          { label: 'Suction', values: [5000, 3200, 6000], unit: ' Pa', best: 'high' },
          { label: 'Battery', values: [180, 120, 150], unit: ' min', best: 'high' },
          { label: 'Noise', values: [58, 62, 65], unit: ' dB', best: 'low' },
          { label: 'Empties itself', values: [true, false, true] },
        ],
        winner: 0,
      }) +
      '\n```',
    '```ui stats\n' +
      JSON.stringify({
        title: 'The Roomi S5 in four numbers',
        stats: [
          { label: 'Price', value: 429, prefix: '$', change: -13, change_unit: '%', good: 'down', note: 'against its launch price' },
          { label: 'Battery', value: 180, unit: ' min', change: 50, change_unit: '%', note: 'more than the Tidyr Mini' },
          { label: 'Noise', value: 58, unit: ' dB', note: 'about a quiet conversation' },
          { label: 'Rated', value: '4.6 / 5', note: '2,300 owner reviews' },
        ],
      }) +
      '\n```',
    'Over three years the Roomi costs the least to run, because its bags are cheap and it needs fewer filters:',
    '```ui chart\n' +
      JSON.stringify({
        title: 'What each one costs over three years',
        kind: 'stacked-bar',
        x: ['Roomi S5', 'Tidyr Mini', 'Orbit Pro'],
        series: [
          { name: 'Price', values: [429, 349, 499] },
          { name: 'Bags and filters', values: [60, 95, 110] },
          { name: 'Electricity', values: [18, 15, 24] },
        ],
        prefix: '$',
        note: 'Bags and filters at the maker’s prices; electricity at 16 cents a kWh.',
      }) +
      '\n```',
  ].join('\n\n'),
};

/**
 * What only the newer pictures need in the sessions: the App builder's sketch of a new app, and a reply with answer cards.
 * Written as Claude Code transcripts after the app started, which it reads as they come; run.mjs's own rows mark the
 * demo's sessions as made in Hydor. Returns what shots need ({ builder, cards }: key, folder, time).
 */
export async function showcaseSessions(ctx) {
  const { home, db, api } = ctx;
  const projects = path.join(home, '.claude/projects');
  const now = Date.now();
  const tasks = path.join(home, 'Hydor/Tasks');
  const out = {};
  {
    const cwd = path.join(tasks, '2026-11-23-client-update-app');
    fs.mkdirSync(cwd, { recursive: true });
    const t = new Transcript({ cwd, at: now - 70 * MIN });
    t.user('Make me an app that writes my weekly client update email. I give it the client and a few notes on the week, and it writes a short email: what got done, what is next, and what I need from them.');
    t.tool(own('app_get'), { like: 'email update' }, { say: 'I’ll look at the ready-made apps closest to this one first.', text: 'Closest ready-made apps: Cover letter (a form, one writing step, the answer as an email), Meeting notes to actions.', ms: 1200 });
    t.tool(own('app_sketch'), { name: SKETCH.sketch.name }, { say: 'Here is a sketch of the app. Nothing is made yet.', text: JSON.stringify(SKETCH, null, 1), ms: 900 });
    t.say(['That is the sketch: a form with three questions, three quick steps, and the email as its answer. Press **Build it** (pick an answer to each question first if you like), or tell me what to change.'], { out: 200 });
    t.title('Make an app for my weekly client update').save(projects);
    out.builder = { key: t.key, cwd, at: t.t };
  }
  {
    const cwd = path.join(tasks, '2026-11-23-robot-vacuum');
    fs.mkdirSync(cwd, { recursive: true });
    const t = new Transcript({ cwd, at: now - 40 * MIN });
    t.user(CARDS.ask);
    t.wait(45_000).say([CARDS.reply], { out: 1100 });
    t.title('Robot vacuums under $500').save(projects);
    out.cards = { key: t.key, cwd, at: t.t };
  }
  const own_ = db.prepare(
    `insert into app_sessions (key, agent, created_by_app, created_at, updated_at) values (?, 'claude', 1, ?, ?)
     on conflict(key) do update set created_by_app = 1, created_at = excluded.created_at, updated_at = excluded.updated_at`,
  );
  for (const x of Object.values(out)) own_.run(x.key, x.at - 60_000, x.at);
  for (let i = 0; i < 60; i++) {
    const list = await api('GET', '/api/sessions?limit=300');
    const have = new Set((list.sessions ?? list).map((s) => s.key));
    if (Object.values(out).every((x) => have.has(x.key))) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await api('PATCH', `/api/sessions/${encodeURIComponent(out.builder.key)}/extra`, { assistant: 'app-builder' }).catch(() => {});
  await api('PATCH', `/api/sessions/${encodeURIComponent(out.cards.key)}/extra`, { assistant: 'researcher' }).catch(() => {});
  return out;
}

/** The time of day, as "HH:MM" in the demo's time zone, `hours` from now: a schedule that stays well away from the shots. */
const clockIn = (hours) => new Date(Date.now() + hours * HOUR).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });

/**
 * A board of the shop's week, with answer cards pinned from replies (and one an agent put there): numbers, a chart, the
 * forecast, a checklist and a split. Two keep themselves up to date. Returns its page.
 */
export async function shopBoard(api, s, spaceId) {
  const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const at = Date.now();
  const card = (id, ui, data, o = {}) => ({ id, ui, data, size: o.size ?? 'l', pinnedAt: at - (o.ago ?? 5) * HOUR, by: o.by ?? 'user', ...(o.from ? { from: { session: o.from.key, title: o.from.title } } : {}), ...(o.refresh ? { refresh: o.refresh, refreshedAt: at - 2 * HOUR } : {}) });
  const model = {
    format: 1,
    cards: [
      card(
        'cstats0001',
        'stats',
        {
          title: 'The shop this week',
          period: 'Monday to today, against the week before',
          stats: [
            { label: 'Revenue', value: 18420, prefix: '$', change: 12.4, change_unit: '%', trend: [11200, 12800, 12100, 13900, 15200, 16800, 18420] },
            { label: 'Orders', value: 312, change: 8.3, change_unit: '%', trend: [210, 224, 240, 251, 270, 289, 312] },
            { label: 'Conversion', value: 3.4, unit: '%', change: 0.3, change_unit: ' pts', trend: [2.9, 3.0, 3.1, 3.1, 3.2, 3.3, 3.4] },
            { label: 'Returns', value: 1.9, unit: '%', change: -0.4, change_unit: ' pts', good: 'down', trend: [2.6, 2.5, 2.4, 2.2, 2.1, 2.0, 1.9] },
          ],
        },
        { size: 'wide', from: s.search, refresh: { ask: 'The shop’s numbers this week against the week before: revenue, orders, conversion and returns.', costUsd: 0.03 } },
      ),
      card('cchart0002', 'chart', {
        title: 'Sales by day',
        kind: 'area',
        x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        series: [
          { name: 'This week', values: [2100, 2350, 2280, 2610, 3140, 3480, 2460] },
          { name: 'Last week', values: [1850, 2050, 2150, 2200, 2760, 3050, 2210] },
        ],
        prefix: '$',
        note: 'Friday and Saturday carry the week; the new search made Thursday’s jump.',
      }, { from: s.search, ago: 20 }),
      card(
        'cweath0003',
        'weather',
        {
          location: 'Portland, Maine',
          unit: 'F',
          now: { temp: 41, feels: 36, condition: 'Cloudy', icon: 'cloud', humidity: 71, wind: '12 mph NE', uv: 1 },
          hourly: [
            { time: '14:00', temp: 41, icon: 'cloud', rain: 10 },
            { time: '16:00', temp: 39, icon: 'cloud', rain: 25 },
            { time: '18:00', temp: 37, icon: 'showers', rain: 55 },
            { time: '20:00', temp: 36, icon: 'rain', rain: 70 },
            { time: '22:00', temp: 35, icon: 'rain', rain: 60 },
          ],
          daily: [
            { date: day(0), high: 42, low: 34, icon: 'rain', condition: 'Rain after 5 pm', rain: 70 },
            { date: day(1), high: 38, low: 29, icon: 'partly', condition: 'Clearing, breezy', rain: 10 },
            { date: day(2), high: 36, low: 25, icon: 'sun', condition: 'Sunny and cold', rain: 0 },
            { date: day(3), high: 40, low: 28, icon: 'cloud', condition: 'Clouds, dry', rain: 15 },
          ],
        },
        { by: 'agent', ago: 3, refresh: { ask: 'The weather in Portland, Maine for the next four days.', costUsd: 0.01 } },
      ),
      card(
        'cchecklist4',
        'checklist',
        {
          title: 'Black Friday week',
          groups: [
            { name: 'The shop', items: [{ text: 'Discount codes tested at checkout', done: true }, { text: 'Apple Pay live', done: true }, 'Shipping cut-off banner up', 'Stock counts checked against the warehouse'] },
            { name: 'The team', items: [{ text: 'Support rota for the weekend', done: true }, 'Who answers the 6 am emails', 'Pizza ordered for Friday'] },
          ],
        },
        { size: 'm', ago: 30 },
      ),
      card(
        'cbreak0005',
        'breakdown',
        {
          title: 'Orders by where they came from',
          parts: [
            { name: 'Search', value: 128 },
            { name: 'Email', value: 76 },
            { name: 'Direct', value: 58 },
            { name: 'Social', value: 31 },
            { name: 'Other', value: 19 },
          ],
          unit: ' orders',
        },
        { size: 'm', ago: 48, from: s.search },
      ),
    ],
  };
  // A board made with cards that refresh gets them paused (it never starts spending by itself): they are set on a new version, as the card's own settings are.
  const bare = { ...model, cards: model.cards.map(({ refresh, refreshedAt, ...c }) => c) };
  const { page } = await api('POST', '/api/pages', { kind: 'board', title: 'The shop this week', description: 'Numbers, the forecast and the Black Friday checklist, pinned from replies; the numbers and the forecast keep themselves up to date.', model: bare, space: spaceId });
  const v = await api('POST', `/api/pages/${page.id}/versions`, { model, base: page.version ?? 1 });
  return v.page ?? page;
}

/** What Settings → Memory → Bring in shows once a ChatGPT export has been read: notes to pick (the helper model's proposals). */
export function bringInState(shop) {
  const note = (id, text, scope = 'global', scopeKey = '') => ({ id, text, scope, scopeKey, source: 'ChatGPT' });
  return {
    sources: [],
    files: [{ id: 'chatgpt-export', name: 'chatgpt-export-2026-11-20.zip', size: 48_300_000, kind: 'chatgpt', chats: 412, memory: true, from: Date.now() - 2.6 * 365 * DAY, to: Date.now() - 4 * DAY }],
    job: {
      state: 'ready',
      done: 9,
      total: 9,
      missed: 0,
      sources: ['ChatGPT'],
      notes: [
        note(1, 'Alex prefers short answers in plain English, with the conclusion first.'),
        note(2, 'Alex is a self-employed designer, based in Portland, Maine.'),
        note(3, 'Alex is writing a master’s thesis on how small towns use public libraries.'),
        note(4, 'Alex rides to work, 9 km each way, and wants gear that copes with hills and rain.'),
        note(5, 'Alex keeps a vegetable garden in zone 5b and avoids chemical sprays.'),
        note(6, 'Alex’s shop runs on a TypeScript API with Vitest; checkout prices are integers in cents.', 'repo', shop),
        note(7, 'Write commit messages in the imperative, one line, no emoji.', 'repo', shop),
      ],
      profile: { base: '', text: '', added: ['Name: Alex', 'Writes in English; likes short, direct answers', 'Works in TypeScript and Python'] },
    },
  };
}

/**
 * The Browser page's made-up browsing: Alex's tabs (the e-bike research in a group, a few more), as the view the desktop
 * app's browser would give, and the article its front tab shows (a page of its own, in the colours of a dark site).
 */
export function browsingView() {
  const tab = (id, title, url, o = {}) => ({ id, title, url, active: false, loadedAt: Date.now() - 60_000, canGoBack: true, canGoForward: false, ...o });
  return {
    key: 'browsing',
    open: true,
    tabs: [
      tab('t1', 'The best electric bikes for hills in 2026, tested', 'https://www.cyclingreview.example/best-e-bikes-hills', { active: true, group: 'g1', readerable: true }),
      tab('t2', 'Velora Ridge E5 review: a mid-drive that climbs like a mountain bike', 'https://www.ebiketest.example/velora-ridge-e5', { group: 'g1' }),
      tab('t3', 'Mid-drive vs hub motor: which is better for hills?', 'https://www.ebikeschool.example/mid-drive-vs-hub', { group: 'g1' }),
      tab('t4', 'Opening hours · Portland Public Library', 'https://www.portlandlibrary.example/hours', { canGoBack: false }),
      tab('t5', 'Tram 28 timetable · Lisbon', 'https://www.carris.example/tram-28', { canGoBack: false }),
      tab('t6', 'Garden calendar for zone 5b', 'https://www.gardencalendar.example/zone-5b', { canGoBack: false }),
    ],
    driver: 'user',
    asks: [],
    viewport: { w: 1100, h: 640 },
    downloads: [],
    groups: [{ id: 'g1', name: 'E-bike research', color: 'blue' }],
    engine: 'desktop',
  };
}

/** The page the Browser picture's front tab shows: an article on a dark site, drawn by the picture's stand-in for the desktop app's native view. */
export const ARTICLE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The best electric bikes for hills in 2026, tested</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{zoom:.82;margin:0;background:#111418;color:#d9dee5;font:16px/1.6 -apple-system,'Segoe UI',Inter,system-ui,sans-serif}
header{display:flex;align-items:center;gap:28px;padding:14px 48px;border-bottom:1px solid #232830;background:#14181d}
header b{font-size:19px;letter-spacing:-.02em;color:#fff}header b i{color:#f2b134;font-style:normal}header span{color:#8b94a0;font-size:14px}
main{max-width:760px;margin:0 auto;padding:36px 28px 60px}
.kicker{color:#f2b134;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
h1{font-size:40px;line-height:1.12;letter-spacing:-.03em;margin:10px 0 14px;color:#fff}
.by{color:#8b94a0;font-size:14px;margin-bottom:26px}
p{margin:0 0 16px;color:#c3cad3;font-size:17px}
h2{font-size:22px;margin:28px 0 8px;color:#fff}
.row{display:flex;justify-content:space-between;gap:16px;padding:12px 16px;border:1px solid #232830;border-radius:10px;background:#161b21;margin-bottom:10px}
.row b{color:#fff}.row span{color:#8b94a0}.row em{color:#f2b134;font-style:normal;font-weight:700}
</style></head><body>
<header><b>Cycling<i>Review</i></b><span>Reviews</span><span>Guides</span><span>Deals</span><span>Newsletter</span></header>
<main><div class="kicker">Buyer’s guide · Updated September 2026</div>
<h1>The best electric bikes for hills in 2026, tested</h1>
<div class="by">By Dana Whitcombe · 14 bikes · 6,200 km of testing</div>
<svg viewBox="0 0 760 220" style="width:100%;border-radius:14px;margin-bottom:26px;display:block"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2a3a"/><stop offset="1" stop-color="#3b6a52"/></linearGradient></defs><rect width="760" height="220" fill="url(#g)"/><path d="M0 170 Q180 70 360 130 T760 90 V220 H0Z" fill="#16231d"/><g fill="none" stroke="#f2b134" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(330 80)"><circle cx="30" cy="62" r="26"/><circle cx="118" cy="62" r="26"/><path d="M30 62 L58 24 L98 24 L118 62 M58 24 L72 62 H30 M72 62 L98 24 M54 14 H70 M98 24 L92 8 H106"/></g></svg>
<p>We rode 14 e-bikes up the same 12% climb, ten times each, with the same 80 kg rider. Mid-drive motors with a torque sensor were the clear winners for steep commutes: they use the bike’s own gears, so they keep their pull where hub motors run hot and slow down.</p>
<h2>The short list</h2>
<div class="row"><div><b>Velora Ridge E5</b><br><span>85 Nm mid-drive · 625 Wh · lights and rack</span></div><em>$1,890</em></div>
<div class="row"><div><b>Urbana Climb 2</b><br><span>75 Nm mid-drive · 540 Wh · hydraulic brakes</span></div><em>$1,749</em></div>
<div class="row"><div><b>Commuter Pro 3</b><br><span>50 Nm hub motor · 500 Wh · belt drive</span></div><em>$1,599</em></div>
<p>Hub-drive bikes such as the Commuter Pro 3 slowed to 11 km/h on the steepest section, against 17–18 km/h for the Ridge E5.</p>
</main></body></html>`;

// ---- the blog post on dynamic UIs (website/blog/shots/dynamic-uis.mjs) ----------------------------------------------

const FENCE = '```';

/** The same question as CARDS.ask, answered in plain Markdown alone: a table and sentences, no cards. */
const PLAIN_REPLY = [
  '**The Roomi S5 at $429 is the best buy for a flat with a cat**: it empties itself, so the cat hair is never your job, and it is the quietest of the three. Here is how they compare.',
  [
    '| | Roomi S5 | Tidyr Mini | Orbit Pro |',
    '|---|---|---|---|',
    '| Kind | Self-emptying | Compact | Vacuum and mop |',
    '| Price | $429 | $349 | $499 |',
    '| Suction | 5,000 Pa | 3,200 Pa | 6,000 Pa |',
    '| Battery | 180 min | 120 min | 150 min |',
    '| Noise | 58 dB | 62 dB | 65 dB |',
    '| Empties itself | Yes | No | Yes |',
  ].join('\n'),
  'The Roomi S5 in four numbers: it costs $429, which is 13% under its launch price; its battery lasts 180 minutes, 50% more than the Tidyr Mini’s; it runs at 58 dB, about as loud as a quiet conversation; and 2,300 owners rate it 4.6 out of 5.',
  'Over three years the Roomi costs the least to run, because its bags are cheap and it needs fewer filters. Bags and filters come to $60 for the Roomi S5, $95 for the Tidyr Mini and $110 for the Orbit Pro, at the makers’ prices. Electricity, at 16 cents a kWh, adds $18, $15 and $24. With the price, that makes $507 for the Roomi S5, $459 for the Tidyr Mini and $633 for the Orbit Pro.',
].join('\n\n');

/** BM25 explained with a formula, a Mermaid diagram and a figure that runs in place (a ```html live block). */
const BM25_REPLY = [
  'BM25 scores a document by adding up, for each word of the query, how rare the word is and how often the document uses it. Two corrections keep it honest: each repeat of a word counts for less than the one before, and long documents get no head start.',
  // On lines of its own: the app shows maths between $$ lines as a display formula (on one line with text it is set small, as a word's).
  '$$\n' + String.raw`\text{score}(D, Q) = \sum_{t \in Q} \text{IDF}(t)\cdot\frac{f(t, D)\,(k_1 + 1)}{f(t, D) + k_1\left(1 - b + b\,\frac{|D|}{\text{avgdl}}\right)}` + '\n$$',
  String.raw`Here $f(t, D)$ is how often the word $t$ appears in $D$, $|D|$ is the document's length and $\text{avgdl}$ the average length. $k_1$ (usually 1.2) sets how fast repeats stop counting, and $b$ (usually 0.75) how much length is corrected for.`,
  'In your pipeline it is the fast first stage, before the slower model that re-ranks:',
  [
    `${FENCE}mermaid`,
    'flowchart LR',
    '  Q[Query] --> T[Tokenize]',
    '  T --> B[BM25 over the index]',
    '  B --> K[Top 100]',
    '  K --> R[Re-ranker]',
    '  R --> A[Top 10 for the answer]',
    FENCE,
  ].join('\n'),
  String.raw`Move $k_1$ to see how fast a word's repeats stop adding to the score:`,
  [
    `${FENCE}html live`,
    '<title>How repeats stop counting</title>',
    '<div style="display:grid;gap:10px">',
    '<label style="display:flex;gap:10px;align-items:center;color:var(--n-muted);font-size:13px">k₁ <input id="k" type="range" min="0.2" max="3" step="0.1" value="1.2" style="flex:1"><b id="kv" style="color:var(--n-fg)">1.2</b></label>',
    '<svg id="c" viewBox="0 0 920 230" style="width:100%;height:auto"></svg>',
    '</div>',
    '<script>',
    "const k=document.getElementById('k'),kv=document.getElementById('kv'),c=document.getElementById('c');",
    "function draw(){const k1=+k.value;kv.textContent=k1.toFixed(1);let d='';for(let f=0;f<=20;f+=0.25){const y=f*(k1+1)/(f+k1);const X=50+f*42.5,Y=200-y*44;d+=(f?'L':'M')+X.toFixed(1)+' '+Y.toFixed(1);}",
    `const cy=200-(k1+1)*44;c.innerHTML='<line x1="50" y1="200" x2="905" y2="200" stroke="var(--n-line)"/><line x1="50" y1="14" x2="50" y2="200" stroke="var(--n-line)"/><line x1="50" y1="'+cy+'" x2="905" y2="'+cy+'" stroke="var(--n-muted)" stroke-dasharray="3 6" opacity=".6"/><text x="899" y="'+(cy-7)+'" text-anchor="end" font-size="12" fill="var(--n-muted)">it never passes k\u2081 + 1</text><path d="'+d+'" fill="none" stroke="var(--n-accent)" stroke-width="2.5"/><text x="478" y="222" text-anchor="middle" font-size="12" fill="var(--n-muted)">times the word appears in the document</text><text x="58" y="26" font-size="12" fill="var(--n-muted)">what the word adds to the score</text>';}`,
    "k.addEventListener('input',draw);draw();",
    '</script>',
    FENCE,
  ].join('\n'),
].join('\n\n');

/** The brief the `doc` session's agent wrote (about 25 lines), from what the e-bike session found. */
const BRIEF = `# E-bike brief: Velora Ridge E5 or Urbana Climb 2

**For Sam, 25 November.** Both bikes handle a 9 km commute with two steep hills. The Velora Ridge E5 climbs better and goes further between charges; the Urbana Climb 2 costs $140 less and is a close second.

## The two bikes

| | Velora Ridge E5 | Urbana Climb 2 |
|---|---|---|
| Price | $1,890 | $1,749 |
| Motor | 85 Nm | 75 Nm |
| Battery | 625 Wh | 540 Wh |
| 12% climb | 17–18 km/h | 15 km/h |
| Charge every | 4 days | 3 days |
| Extras | Lights, rack | Hydraulic brakes |

## Recommendation

Buy the **Velora Ridge E5**. A mid-drive uses the bike's gears, so it keeps its pull on the steepest hill, and the bigger battery means a charge only every four days on your 18 km a day.

If the budget is tight, pick the Urbana Climb 2: it costs $140 less, at a price that holds until the end of November.

## Next steps

1. Sam confirms the budget (up to $1,900).
2. Book a test ride of the Ridge E5 this week.
3. Order by 30 November, whichever bike it is.
`;

/**
 * What the blog post on dynamic UIs shows besides the showcase sessions: the robot-vacuum question answered in plain
 * Markdown (`plain`), BM25 explained with a formula, a diagram and a live figure (`bm25`, in the thesis folder), and a
 * session whose turn wrote one Markdown document (`doc`: ebike-brief.md, also written to its folder). Written as
 * Claude Code transcripts once the app is running, like showcaseSessions. Returns { plain, bm25, doc }: key, folder, time.
 */
export async function blogSessions(ctx) {
  const { home, db, api, sessions } = ctx;
  const projects = path.join(home, '.claude/projects');
  const now = Date.now();
  const tasks = path.join(home, 'Hydor/Tasks');
  const out = {};
  {
    const cwd = path.join(tasks, '2026-11-23-robot-vacuums');
    fs.mkdirSync(cwd, { recursive: true });
    // Asked at the very time the cards session was (its transcript's end, less what the transcript adds), so both show the same clock.
    const t = new Transcript({ cwd, at: ctx.cards ? ctx.cards.at - 51_500 : now - 40 * MIN });
    t.user(CARDS.ask);
    t.wait(45_000).say([PLAIN_REPLY], { out: 700 });
    t.title('Robot vacuums under $500').save(projects);
    out.plain = { key: t.key, cwd, at: t.t, assistant: 'researcher' };
  }
  {
    const cwd = sessions?.thesis?.cwd ?? path.join(tasks, '2026-11-24-bm25');
    fs.mkdirSync(cwd, { recursive: true });
    const t = new Transcript({ cwd, at: now - 12 * MIN });
    t.user('Explain how BM25 scores a document, with the formula, and draw where it sits in my search pipeline.');
    t.wait(40_000).say([BM25_REPLY], { out: 900 });
    t.title('How BM25 scores a document').save(projects);
    out.bm25 = { key: t.key, cwd, at: t.t, assistant: 'tutor' };
  }
  {
    const cwd = path.join(tasks, '2026-11-24-ebike-brief');
    fs.mkdirSync(cwd, { recursive: true });
    const file = path.join(cwd, 'ebike-brief.md');
    const t = new Transcript({ cwd, at: now - 20 * MIN });
    t.user('Write up the e-bike comparison as a one-page brief I can send to Sam.');
    t.tool('Write', { file_path: file, content: BRIEF }, {
      say: 'I’ll write it as a one-page brief: the two bikes side by side, then my recommendation and what to do next.',
      text: `File created successfully at: ${file}`,
      result: { type: 'create', filePath: file, content: BRIEF, structuredPatch: [], originalFile: null },
      ms: 5000,
    });
    t.say(['The brief is in `ebike-brief.md`: a two-line summary, the Velora Ridge E5 and the Urbana Climb 2 side by side, my recommendation and three next steps. It is ready to send to Sam.'], { out: 120 });
    // The file is made at the time of the turn, as a real one would be.
    write(file, BRIEF);
    const when = new Date(t.t - 10_000);
    fs.utimesSync(file, when, when);
    t.title('A one-page brief on the e-bikes').save(projects);
    out.doc = { key: t.key, cwd, at: t.t, file, assistant: 'writer' };
  }
  const own_ = db.prepare(
    `insert into app_sessions (key, agent, created_by_app, created_at, updated_at) values (?, 'claude', 1, ?, ?)
     on conflict(key) do update set created_by_app = 1, created_at = excluded.created_at, updated_at = excluded.updated_at`,
  );
  for (const x of Object.values(out)) own_.run(x.key, x.at - 60_000, x.at);
  for (let i = 0; i < 60; i++) {
    const list = await api('GET', '/api/sessions?limit=300');
    const have = new Set((list.sessions ?? list).map((s) => s.key));
    if (Object.values(out).every((x) => have.has(x.key))) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  for (const x of Object.values(out)) await api('PATCH', `/api/sessions/${encodeURIComponent(x.key)}/extra`, { assistant: x.assistant }).catch(() => {});
  return out;
}
