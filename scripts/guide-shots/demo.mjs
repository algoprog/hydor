// The made-up world the guide's screenshots show: Alex's folders and a small git repository, sessions as Claude
// Code transcripts, and what the app's own API keeps (spaces, guidelines, memory, tasks, pages, apps).
// Nothing here comes from a real account. What can't be made through the app (an agent waiting on a card, plan
// limits, the inbox) is answered to the page instead (`overrides`).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { formatPage, formatSearch } from '../../shared/search.ts';

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
  write(path.join(home, 'Naget/Tasks/2026-10-31-q3-report-summary/Q3-summary.docx'), pad(36_000));
  write(path.join(home, 'Naget/Tasks/2026-10-31-q3-report-summary/revenue-by-region.xlsx'), pad(21_000));
  write(path.join(home, 'Naget/Tasks/2026-11-01-compare-e-bikes/e-bikes-compared.xlsx'), pad(18_000));
  fs.mkdirSync(path.join(home, 'Naget/Tasks/2026-10-31-lisbon-trip'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Naget/Tasks/2026-11-01-browser-settings'), { recursive: true });
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
class Transcript {
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
    const e = { parentUuid: this.last, isSidechain: false, userType: 'external', cwd: this.cwd, sessionId: this.id, version: '2.1.30', ...(this.branch ? { gitBranch: this.branch } : {}), type, uuid: uuid(), timestamp: new Date(this.t).toISOString(), ...extra };
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

const naget = (tool) => `mcp__naget-agent__${tool}`;
const numbered = (text) =>
  text
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(6)}→${l}`)
    .join('\n');

/** Every session Alex has, newest work first. Returns them by name, each with its key. */
export function makeSessions(home, projects, now, { shop, blog }) {
  const tasks = path.join(home, 'Naget/Tasks');
  const out = {};

  // Fixing the checkout tests: steps, an edit, and the agent waiting to run the test suite.
  {
    const t = new Transcript({ cwd: shop, at: now - 4 * MIN, branch: 'main' });
    t.user("The checkout tests fail since yesterday's discount change. Find out why and fix it.");
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
    t.tool(naget('web_search'), { query: q1 }, {
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
    t.tool(naget('read_page'), { url: 'https://www.ebiketest.example/velora-ridge-e5', question: 'How does it do on steep hills and what does it cost?' }, {
      text: formatPage({ title: 'Velora Ridge E5 review', url: 'https://www.ebiketest.example/velora-ridge-e5', detail: 'the parts that answer the question', body: 'On our 12% test climb the Ridge E5 held 17–18 km/h in its second assist level. The torque sensor makes it feel natural from a standstill. Price: $1,890 with lights and a rear rack.' }),
      ms: 3800,
    });
    t.tool(naget('read_page'), { url: 'https://www.cyclingreview.example/best-e-bikes-hills', question: 'Which models were best on steep climbs?' }, {
      text: formatPage({ title: 'The best electric bikes for hills in 2026, tested', url: 'https://www.cyclingreview.example/best-e-bikes-hills', detail: 'the parts that answer the question', body: 'Best for steep commutes: Velora Ridge E5 (85 Nm), Urbana Climb 2 (75 Nm). Hub-drive bikes such as the Commuter Pro 3 slowed to 11 km/h on the 12% section.' }),
      ms: 4100,
    });
    t.wait(70_000);
    t.tool(naget('present_files'), { files: [{ path: path.join(cwd, 'e-bikes-compared.xlsx'), caption: 'Five e-bikes side by side: price, motor, battery and how each did on the test climb' }] }, { text: 'Shown to the user.', ms: 400 });
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
    t.tool(naget('app_guide'), { query: 'browser screenshots and private network' }, {
      text: 'From the guide, for “browser screenshots and private network”:\n\n## Browser settings (Search and the browser · web#browser-settings)\n…',
      ms: 900,
    });
    t.tool(naget('app_api'), { method: 'GET', path: '/api/browser/settings' }, { text: '{"enabled":true,"headless":true,"blockPrivate":false,"screenshots":true,"allow":[],"block":[]}', ms: 300 });
    t.t = now - 35_000;
    const change = t.tool(
      naget('app_api'),
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
    t.tool(naget('read_document'), { path: path.join(home, 'Documents/Q3-report.pdf') }, {
      say: "I'll read the report first.",
      text: 'Q3-report.pdf · 18 pages\n\nRevenue grew 14% to $4.2M. Europe +22%, North America +9%, Asia +17%. Gross margin 61%…',
      ms: 6400,
    });
    t.wait(50_000);
    t.tool('Bash', { command: 'python3 make_summary.py', description: 'Write the summary and the chart' }, { text: 'Wrote Q3-summary.docx and revenue-by-region.xlsx', result: { stdout: 'Wrote Q3-summary.docx and revenue-by-region.xlsx', stderr: '', interrupted: false }, ms: 8200 });
    t.tool(naget('present_files'), {
      files: [
        { path: path.join(cwd, 'Q3-summary.docx'), caption: 'The one-page summary for the board' },
        { path: path.join(cwd, 'revenue-by-region.xlsx'), caption: 'Revenue by region, with the chart' },
      ],
    }, { text: 'Shown to the user.', ms: 400 });
    t.say(['**Q3 in one line: revenue grew 14% to $4.2M, led by Europe (+22%).**\n\nThe summary covers revenue, margin, the three regions and the two risks the report flags (shipping costs and the delayed Asia launch). The spreadsheet has the numbers behind the chart.'], { out: 600 });
    t.title('Q3 report summary for the board').save(projects);
    out.report = { key: t.key, cwd, at: t.t };
  }

  // Plain conversations, for the session list.
  const plain = [
    ['lisbon', path.join(tasks, '2026-10-31-lisbon-trip'), 30 * HOUR, 'Plan a 4-day trip to Lisbon in May: two adults, mid-range hotels, lots of walking.', 'Here is a day-by-day plan, with the neighbourhoods to stay in and what to book ahead.', '4 days in Lisbon in May'],
    ['thesis', path.join(home, 'Naget/Spaces/thesis'), 3 * HOUR, 'Outline chapter 3: the method, the survey and how I analysed the answers.', 'Here is an outline in five parts, with what each needs from your notes.', 'Outline chapter 3'],
    ['garden', path.join(home, 'Naget/Spaces/the-garden'), 50 * HOUR, 'Which vegetables can I still sow in November?', 'In zone 5b, garlic and broad beans go in now; spinach and lettuce under cover.', 'What to sow in November'],
    ['taxes', path.join(home, 'Naget/Spaces/taxes-2026'), 4 * DAY, 'Sort the receipts in this folder by quarter and add them up.', 'Done: 46 receipts in four folders, with a table of the totals.', 'Receipts by quarter'],
    ['blog', blog, 3 * DAY, 'Add an RSS feed to the blog.', 'The feed is at /feed.xml, built with the posts. I added a link to it in the header.', 'RSS feed for the blog'],
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

/** Spaces, guidelines, memory, scheduled tasks, pages, apps and the start page's picks. */
export async function seedApi(api, home, now, s) {
  await api('POST', '/api/tour', { version: 999 });
  await api('PUT', '/api/me/timezone', { tz: 'America/New_York' });
  await api('PUT', '/api/guidelines', { global: 'Answer in plain English, short and to the point. Ask before deleting anything. Keep what you make for me in ~/Naget.' });

  const space = async (b) => (await api('POST', '/api/spaces', b)).id ?? (await api('GET', '/api/spaces')).spaces.find((x) => x.name === b.name)?.id;
  const thesis = await space({ name: 'Thesis', color: 'violet', description: 'Chapter drafts, sources and the defense in March', instructions: 'Cite in APA 7. My advisor prefers short paragraphs and plain words.' });
  const garden = await space({ name: 'The garden', color: 'green', description: 'Beds, seeds and the greenhouse', instructions: 'We live in Portland, Maine (zone 5b). No chemical sprays.' });
  const taxes = await space({ name: 'Taxes 2026', color: 'amber', description: 'Receipts, forms and deadlines', instructions: 'Amounts in EUR. I am self-employed in Greece.' });
  const shopSpace = await space({ name: 'Shop website', color: 'blue', description: 'The online shop’s API and storefront', folder: path.join(home, 'code/shop-api'), assistant: 'coder' });
  await space({ name: 'Home', color: 'pink', description: 'Everything about the house and garden', members: [garden, taxes] });

  const into = { thesis, garden, taxes, checkout: shopSpace };
  for (const [name, id] of Object.entries(into)) if (s[name] && id) await api('PATCH', `/api/sessions/${encodeURIComponent(s[name].key)}/extra`, { space: id });
  // The assistant each session works as, as the start page or its space would have picked it.
  const as = { ebike: 'researcher', checkout: 'coder', settings: 'general', report: 'general', lisbon: 'planner', thesis: 'writer', garden: 'general', taxes: 'analyst', blog: 'coder', brief: 'general' };
  for (const [name, assistant] of Object.entries(as)) if (s[name]) await api('PATCH', `/api/sessions/${encodeURIComponent(s[name].key)}/extra`, { assistant });
  await api('POST', `/api/sessions/${encodeURIComponent(s.thesis.key)}/flags`, { pinned: true });

  const note = (text, scope = 'global', key) => api('POST', '/api/memory/entries', { text, scope, ...(key ? { key } : {}) });
  await note('Alex prefers short answers in plain English, with the conclusion first.');
  await note('Alex lives in Portland, Maine (zone 5b) and rides 9 km to work, with two steep hills.');
  await note('Alex is a self-employed designer; taxes are filed in Greece, amounts in EUR.');
  await note('Alex is writing a master’s thesis on how small towns use public libraries; the defense is in March.');
  await note('Run the tests with npm test; the checkout tests need TZ=UTC.', 'repo', path.join(home, 'code/shop-api'));
  await note('Prices are integers in cents: round once, at the end of a calculation.', 'repo', path.join(home, 'code/shop-api'));
  await note('Shortlist so far: Velora Ridge E5 and Urbana Climb 2; budget $2,000.', 'session', s.ebike.key);

  // Scheduled tasks at times well away from now, so none runs while the shots are taken.
  const hourNow = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/New_York' }).format(now));
  const away = (h) => (h - hourNow + 24) % 24 >= 3;
  const tasks = [
    { name: 'Morning brief', time: '07:30', h: 7, prompt: 'The weather in Portland, my calendar for today and the news I follow, in five lines.', extra: { assistant: 'general' } },
    { name: 'Ridge E5 price watch', time: '09:00', h: 9, days: [1, 2, 3, 4, 5], prompt: 'Check the Velora Ridge E5’s price on velora.bike and tell me if it drops under $1,700.', extra: { assistant: 'researcher' } },
    { name: 'Weekly shop report', time: '08:00', h: 8, days: [1], prompt: 'Sales, refunds and the slowest pages of the shop last week, with what changed since the week before.', cwd: path.join(home, 'code/shop-api') },
    { name: 'Water the greenhouse reminder', time: '18:00', h: 18, days: [0, 3], prompt: 'Remind me to water the greenhouse, and say whether frost is forecast tonight.', extra: { space: garden } },
  ];
  for (const t of tasks) {
    if (!away(t.h)) continue;
    await api('POST', '/api/tasks', {
      name: t.name,
      prompt: t.prompt,
      agent: 'claude',
      cwd: t.cwd ?? path.join(home, 'Naget/Tasks'),
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
  await api('POST', '/api/pages', {
    title: 'Thesis reading tracker',
    html: PAGE('Thesis reading tracker', '<p>23 of 31 sources read · <span class="tag">chapter 3</span></p><ul><li>☑ Putnam, Bowling Alone</li><li>☑ Klinenberg, Palaces for the People</li><li>☐ Oldenburg, The Great Good Place</li></ul>'),
    sessionKey: s.thesis.key,
  });

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

  await api('PUT', '/api/start', { agent: 'claude', runs: { claude: { model: 'opus', effort: 'high' } }, assistant: 'general', task: true });
  return { spaces: { thesis, garden, taxes, shop: shopSpace } };
}

// ---- answered to the page ---------------------------------------------------------------------------

/** What the server can't show without a real agent or account: live states, cards, plan limits, the inbox. */
export function overrides(s, now) {
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
    { id: 'skill:receipts', kind: 'skill', title: 'A new skill to review: Sort receipts by quarter', detail: 'Learned from “Receipts by quarter”: how to file receipts by date and add them up.', at: now - 3 * HOUR, path: '/settings?s=skillpack' },
  ];
  /** Settings → Models as on a desktop with one graphics card: OpenRouter's models picked, two run here. */
  const models = (real) => ({
    ...real,
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
  return { live, usage, inbox, models };
}

/** The models Claude Code offers, as its own program lists them (the stand-in program lists none). */
export const CATALOG = {
  claude: [
    { value: 'default', label: 'Default', description: 'Opus 5.5, or Sonnet 5.5 once the plan’s Opus limit is near', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high', isDefault: true },
    { value: 'opus', label: 'Opus 5.5', resolved: 'claude-opus-5-5', description: 'The most capable, for hard and long work', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
    { value: 'sonnet', label: 'Sonnet 5.5', resolved: 'claude-sonnet-5-5', description: 'Fast and capable, for everyday work', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
    { value: 'haiku', label: 'Haiku 5.5', resolved: 'claude-haiku-5-5', description: 'The fastest, for quick answers', efforts: [] },
  ],
};
