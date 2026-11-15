// Script tests for a conversation taken out of the chat (server/session-export.ts): the Markdown of a session with
// several kinds of content (your messages, a turn's steps as one line, an answer card as a table, a Mermaid diagram,
// maths, pictures, files handed over), what a document gets beside it (your pictures kept, the handed-over pictures
// shown, a confidential session's web pictures as links), and the routes (the file to download, the Library document,
// what they refuse). Stand-ins take the place of the sessions; the web picture is at an address that answers nothing.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/session-export-test.ts
//   DATA_DIR=/tmp/hydor-test-export node dist/dev/session-export-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyRequest } from 'fastify';
import { answerMarkdown, answerText } from '../shared/answer-ui/text.ts';
import { normalizeDoc } from '../shared/docs.ts';
import type { SessionSummary, TimelineItem } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { openDb } from './db.ts';
import { initAssets } from './pages/assets.ts';
import { agentDoc } from './pages/docs.ts';
import { keepPicture } from './pages/index.ts';
import { duration, exportRoutes, fileNameOf, replyMarkdown, sessionMarkdown, type ExportDeps } from './session-export.ts';
import type { SessionManager } from './sessions.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-export-test-')));
const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);

// A picture (4×4 PNG) in the transcript line of your first message, as Claude Code writes it.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8DwnwELaGDABQBU7QT8V3S8BwAAAABJRU5ErkJggg==';
const transcript = path.join(tmp, 'session.jsonl');
const line = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Which e-bike?' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } }] } });
fs.writeFileSync(transcript, `${line}\n`);
fs.writeFileSync(path.join(tmp, 'chart.png'), Buffer.from(PNG_B64, 'base64'));

const T0 = Date.UTC(2026, 10, 15, 9, 30);
const card = {
  title: 'Two e-bikes',
  items: [{ name: 'Commuter' }, { name: 'Cargo' }],
  rows: [
    { label: 'Price', values: [1800, 3200], prefix: '$' },
    { label: 'Range', values: [80, 60], unit: 'km' },
    { label: 'Carries a child', values: [false, true] },
  ],
  winner: 0,
  verdict: 'The **Commuter** for most rides.',
};
const reply = [
  '# The pick',
  '',
  'Here is how they compare:',
  '',
  '```ui comparison',
  JSON.stringify(card),
  '```',
  '',
  '```mermaid',
  'flowchart TD',
  '  A[Ride to work] --> B{Hills?}',
  '```',
  '',
  'Energy per km is $E = P \\cdot t / d$, and over a year:',
  '',
  '$$\\sum_{d=1}^{365} E_d \\approx 70\\,\\text{kWh}$$',
  '',
  '![The Commuter](http://127.0.0.1:9/commuter.jpg)',
  '',
  '```bash',
  '# a comment, not a heading',
  '```',
].join('\n');

const items: TimelineItem[] = [
  { id: 'u1', seq: 1, ts: T0, kind: 'user', text: 'Which e-bike should I buy for a 10 km commute?', images: 1, imageAt: 0 },
  { id: 'th1', seq: 2, ts: T0 + 1000, kind: 'thinking', text: 'Private reasoning that stays out.' },
  { id: 'a0', seq: 3, ts: T0 + 2000, kind: 'assistant', text: 'Let me look that up.' },
  { id: 't1', seq: 4, ts: T0 + 3000, kind: 'tool', tool: { name: 'Bash', category: 'command', title: 'curl https://secret.example/api', status: 'ok' } },
  { id: 't2', seq: 5, ts: T0 + 4000, kind: 'tool', tool: { name: 'mcp__hydor__web_search', category: 'mcp', title: 'e-bike reviews', status: 'ok' } },
  { id: 'a1', seq: 6, ts: T0 + 120_000, kind: 'assistant', text: reply },
  {
    id: 't3',
    seq: 7,
    ts: T0 + 121_000,
    kind: 'tool',
    tool: { name: 'mcp__hydor__present_files', category: 'mcp', title: 'present_files', status: 'ok', input: { files: [{ path: 'report.pdf', caption: 'The full\ncomparison' }, path.join(tmp, 'chart.png')] } },
  },
  { id: 'e1', seq: 8, ts: T0 + 125_000, kind: 'turn', status: 'completed', durationMs: 125_000 },
  { id: 'n1', seq: 9, ts: T0 + 200_000, kind: 'user', text: 'A note the app put in', meta: 'note' },
  { id: 's1', seq: 10, ts: T0 + 200_000, kind: 'system', level: 'info', text: 'Model switched' },
  { id: 'u2', seq: 11, ts: T0 + 300_000, kind: 'user', text: 'Thanks!' },
  { id: 'a2', seq: 12, ts: T0 + 301_000, kind: 'assistant', text: 'Enjoy the ride.' },
  { id: 'e2', seq: 13, ts: T0 + 302_000, kind: 'turn', status: 'completed', durationMs: 2000 },
];
const head = { title: 'E-bike: commute or cargo?', agent: 'Claude Code', cwd: tmp };

test('a session as Markdown: title and date, each message and reply in order, steps as one line, nothing of the work', () => {
  const md = sessionMarkdown(head, items, { timeZone: 'UTC', now: T0 + 400_000 });
  assert.ok(md.startsWith('# E-bike: commute or cargo?\n\n*15 November 2026 · Claude Code · '), md.slice(0, 120));
  assert.ok(md.includes('## You · 15 November 2026 at 09:30') || md.includes('## You · 15 November 2026, 09:30'), 'your message, with its time');
  assert.ok(md.includes('Which e-bike should I buy for a 10 km commute?'));
  assert.ok(md.includes('*A picture attached*'), 'a picture without an address the file can keep is said, not shown');
  assert.ok(/## Claude Code · 15 November 2026[ ,at]+09:32/.test(md), 'the reply, under the agent’s name');
  assert.ok(md.includes('*Worked for 2 min · 2 steps*'), 'the steps as one line (present_files is no step)');
  for (const gone of ['Private reasoning', 'Let me look that up', 'secret.example', 'A note the app put in', 'Model switched']) assert.ok(!md.includes(gone), `${gone} stays out`);
  assert.ok(md.indexOf('Which e-bike') < md.indexOf('Here is how') && md.indexOf('Here is how') < md.indexOf('Thanks!') && md.indexOf('Thanks!') < md.indexOf('Enjoy the ride.'), 'in order');
  assert.ok(md.includes('*Exported from Hydor on 15 November 2026'), 'when it was exported');
  // The second turn had no steps: no line for them.
  assert.ok(!md.includes('Worked for 2 s'));
});

test('an answer card as a table, Mermaid and maths as written, headings under the message’s own', () => {
  const md = sessionMarkdown(head, items, { timeZone: 'UTC' });
  assert.ok(md.includes('**Two e-bikes**'), 'the card’s title');
  assert.ok(md.includes('|   | Commuter | Cargo |\n| --- | --- | --- |'), 'a comparison is a table');
  assert.ok(md.includes('| **Price** | $1,800 | $3,200 |') && md.includes('| **Range** | 80 km | 60 km |') && md.includes('| **Carries a child** | ✗ | ✓ |'), md);
  assert.ok(md.includes('**Pick:** Commuter') && md.includes('**Verdict:** The **Commuter** for most rides.'));
  assert.ok(!md.includes('```ui'), 'no card’s JSON is left');
  assert.ok(md.includes('```mermaid\nflowchart TD\n  A[Ride to work] --> B{Hills?}\n```'), 'Mermaid stays a Mermaid block');
  assert.ok(md.includes('$E = P \\cdot t / d$') && md.includes('$$\\sum_{d=1}^{365} E_d \\approx 70\\,\\text{kWh}$$'), 'maths stays LaTeX');
  assert.ok(md.includes('\n### The pick\n'), 'a heading of the reply goes two levels down');
  assert.ok(md.includes('```bash\n# a comment, not a heading\n```'), 'code is left as it is');
  assert.ok(md.includes('![The Commuter](http://127.0.0.1:9/commuter.jpg)'), 'a picture on the web stays one');
  assert.ok(md.includes('**Files (2)**\n\n- report.pdf — The full comparison\n- chart.png'), 'the files handed over, by name');
  assert.ok(!md.includes(`](${path.join(tmp, 'chart.png')})`), 'a file only named');
});

test('for a document: your pictures kept, handed-over pictures shown, web pictures as links when confidential', () => {
  const md = sessionMarkdown(head, items, { pictures: new Map([['u1', ['naget-asset:abc']]]), showFiles: true, noWebPictures: true, timeZone: 'UTC' });
  assert.ok(md.includes('![Picture 1](naget-asset:abc)') && !md.includes('A picture attached'));
  assert.ok(md.includes(`![chart.png](${path.join(tmp, 'chart.png')})`), 'a handed-over picture, by its path');
  assert.ok(!md.includes('![report.pdf]'), 'only pictures are shown');
  assert.ok(md.includes('[The Commuter](http://127.0.0.1:9/commuter.jpg)') && !md.includes('![The Commuter]'), 'nothing to fetch from the web');
});

test('a turn that ended on a step, a stopped turn, a message from another session, a card that cannot be read', () => {
  const md = sessionMarkdown({ ...head, agent: 'Codex' }, [
    { id: 'u', seq: 1, kind: 'user', text: 'Run the tests', peer: { name: 'Planner' } },
    { id: 'a', seq: 2, kind: 'assistant', text: 'Running them now; the result follows.' },
    { id: 't', seq: 3, kind: 'tool', tool: { name: 'exec_command', category: 'command', title: 'npm test', status: 'interrupted' } },
    { id: 'e', seq: 4, kind: 'turn', status: 'interrupted', durationMs: 45_000 },
    { id: 'u2', seq: 5, kind: 'user', text: 'Show it' },
    { id: 'a2', seq: 6, kind: 'assistant', text: '```ui table\n{"title": "Broken", "rows": [\n```' },
  ]);
  assert.ok(md.includes('## Message from Planner'));
  assert.ok(md.includes('Running them now; the result follows.'), 'its last words are its reply');
  assert.ok(md.includes('*Worked for 45 s · 1 step · stopped*'));
  assert.ok(md.includes('**Broken**'), 'a card cut short: as far as it can be read');
});

test('cards of other kinds: a data table with totals, a chart, a list of records, plain text for Copy as text', () => {
  const t = answerMarkdown('table', {
    title: 'Moons',
    columns: [
      { key: 'moon', label: 'Moon' },
      { key: 'km', label: 'Diameter', type: 'number', unit: 'km' },
    ],
    rows: [
      { moon: 'Ganymede', km: 5268 },
      { moon: 'Titan | big', km: 5150 },
    ],
    totals: ['km'],
  });
  assert.ok(t.includes('| Moon | Diameter |') && t.includes('| Titan \\| big | 5,150 km |') && t.includes('| **Total** | **10,418 km** |'), t);
  const c = answerMarkdown('chart', { title: 'Highs', kind: 'line', x: ['Jan', 'Feb'], series: [{ name: 'Athens', values: [13.6, 14.5] }], unit: '°C' });
  assert.ok(c.includes('|   | Athens |') && c.includes('| Jan | 13.6°C |'), c);
  const tl = answerMarkdown('timeline', { title: 'Acropolis', events: [{ date: '447 BCE', title: 'Parthenon', image: 'https://example.com/p.jpg' }] });
  assert.ok(tl.includes('| Date | Title | Image |') && tl.includes('![Parthenon](https://example.com/p.jpg)'), tl);
  const steps = answerMarkdown('steps', { title: 'SSH', steps: [{ title: 'Make a key', code: 'ssh-keygen -t ed25519', lang: 'bash' }] });
  assert.ok(steps.includes('- **Make a key**\n  ```bash\n  ssh-keygen -t ed25519\n  ```'), steps);
  assert.equal(answerText({ title: 'T', points: ['a', 'b'] }), 'T\nPoints:\n- a\n- b');
});

test('names and lengths: a file name from a title, durations in words', () => {
  assert.equal(fileNameOf('Plan: Q3 / Q4 "budget"?', 'md'), 'Plan Q3 Q4 budget.md');
  assert.equal(fileNameOf('   ', 'md'), 'Conversation.md');
  assert.equal(duration(45_000), '45 s');
  assert.equal(duration(125_000), '2 min');
  assert.equal(duration(3_900_000), '1 h 5 min');
  assert.equal(replyMarkdown('###### Deep'), '###### Deep', 'no deeper than Markdown goes');
});

// ---- the routes ------------------------------------------------------------------------------------------------------

const summaries: Record<string, Partial<SessionSummary>> = {
  'claude:abcd1234': { key: 'claude:abcd1234', agent: 'claude', title: 'E-bike: commute or cargo?', cwd: tmp, createdAt: T0 },
  'acp:conf5678': { key: 'acp:conf5678', agent: 'acp', acpAgent: 'console', title: 'Private notes', cwd: tmp, extra: { confidential: true } as SessionSummary['extra'] },
};
const saved: { title: string; markdown: string; sessionKey: string }[] = [];
const fake = {
  summary: (k: string) => (summaries[k] as SessionSummary) ?? null,
  timeline: async () => ({ parser: { items } }),
  transcriptOf: () => transcript,
} as unknown as SessionManager;
const deps: ExportDeps = {
  db,
  sessions: fake,
  keepPicture: (b) => keepPicture(db, b),
  saveDoc: async (o) => {
    saved.push(o);
    const { doc, notes } = await agentDoc(db, { markdown: o.markdown }, o.cwd);
    return { page: { id: 'p1', title: o.title, kind: 'doc', blocks: doc.blocks.map((b) => ('style' in b && b.style) || b.type) }, notes };
  },
};
const http = Fastify();
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const K = (req: FastifyRequest) => {
  const key = decodeURIComponent((req.params as { key: string }).key);
  if (!/^(claude|codex|acp):[A-Za-z0-9._-]{4,80}$/.test(key)) throw new HttpError(400, 'Bad session key');
  return key;
};
exportRoutes(http, deps, K);

test('GET …/export?format=md: the Markdown as a file named from the title; other formats and unknown sessions refused', async () => {
  const r = await http.inject({ method: 'GET', url: '/api/sessions/claude%3Aabcd1234/export?format=md' });
  assert.equal(r.statusCode, 200);
  assert.match(String(r.headers['content-type']), /^text\/markdown/);
  assert.match(String(r.headers['content-disposition']), /^attachment; filename="E-bike commute or cargo.md"; filename\*=UTF-8''E-bike%20commute%20or%20cargo.md$/);
  assert.ok(r.body.startsWith('# E-bike: commute or cargo?') && r.body.includes('| **Price** | $1,800 | $3,200 |'));
  assert.equal((await http.inject({ method: 'GET', url: '/api/sessions/claude%3Aabcd1234/export?format=pdf' })).statusCode, 400);
  assert.equal((await http.inject({ method: 'GET', url: '/api/sessions/claude%3Anothere99/export' })).statusCode, 404);
  assert.equal((await http.inject({ method: 'GET', url: '/api/sessions/nonsense/export' })).statusCode, 400);
});

test('POST …/export/doc: a Library document of it, your picture kept as the Library’s own, its blocks a table, maths and code', async () => {
  const r = await http.inject({ method: 'POST', url: '/api/sessions/claude%3Aabcd1234/export/doc', payload: {} });
  assert.equal(r.statusCode, 200, r.body);
  const got = r.json() as { page: { title: string; blocks: string[] }; notes: string[] };
  assert.equal(got.page.title, 'E-bike: commute or cargo?');
  const md = saved[0].markdown;
  assert.equal(saved[0].sessionKey, 'claude:abcd1234');
  assert.match(md, /!\[Picture 1\]\(naget-asset:[^)]+\)/, 'your picture, kept');
  assert.ok(md.includes(`![chart.png](${path.join(tmp, 'chart.png')})`), 'the handed-over picture, to take in');
  for (const t of ['h1', 'h2', 'h3', 'table', 'math', 'code', 'image']) assert.ok(got.page.blocks.includes(t), `a ${t} block in ${got.page.blocks.join(', ')}`);
  // The same Markdown makes a document by itself too (the Library's own reading of it).
  assert.ok(normalizeDoc({ markdown: md }).blocks.length > 10);
});

test('a confidential session’s document: its web pictures are links, nothing is fetched; the title may be given', async () => {
  const r = await http.inject({ method: 'POST', url: '/api/sessions/acp%3Aconf5678/export/doc', payload: { title: 'My copy' } });
  assert.equal(r.statusCode, 200, r.body);
  const last = saved[saved.length - 1];
  assert.equal(last.title, 'My copy');
  assert.ok(last.markdown.startsWith('# Private notes') && last.markdown.includes('\n## Custom · '), 'Custom answered');
  assert.ok(last.markdown.includes('[The Commuter](http://127.0.0.1:9/commuter.jpg)') && !last.markdown.includes('![The Commuter]'));
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
