// Script tests for boards (shared/boards.ts, boards.ts, board-routes.ts): the format and its checks (an answer UI the app
// has, data a card holds, an agent's data against its UI's type, every catalog example fitting), a card a line as it is
// kept; New board, pinning a card (its data copied, a new board made in passing, at the end of one there is, refused with
// a plain message), the editor's saves (reorder, resize, rename, remove) as versions with a stale one refused, an older
// version brought back; sharing a board read only (its model to draw, nothing to change, its pictures only); the
// save_board tool (make, add by id and by name, a new one for a name there is not, change, remove, order, each refused
// plainly when wrong), get_page, export_page and the agent's instructions; and the board's own page and files.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/boards-test.ts
//   DATA_DIR=/tmp/hydor-test-boards node dist/dev/boards-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { ANSWER_UIS, answerUi } from '../../shared/answer-ui/index.ts';
import { BOARD_LIMITS, boardText, CardError, cardTitle, checkBoard, checkCard, dataProblems, defaultSize, newBoard, shapeFields, type Board } from '../../shared/boards.ts';
import type { PortalItemView, ProjectShare } from '../../shared/share.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { sharing } from '../spaces/share.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { boardMarkdown, boardPage, readBoard } from './boards.ts';
import { pages } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-boards-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const events: { t: string; id?: string; data?: any }[] = [];
const deps = {
  app,
  db,
  sessions: {
    summary: () => null,
    timeline: async () => ({ parser: { items: [] } }),
    emit: () => {},
    deliverOrQueue: async () => {},
    adapterByRun: () => null,
  },
  models: { agentModels: () => [], ensure: async () => null },
  broadcast: (e: { t: string }) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
sharing.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const req = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown) =>
  app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
const run = async (name: string, args: Record<string, unknown>): Promise<{ text?: string; error?: string }> => {
  try {
    const r = await tools[name].run(args, ctx);
    return { text: typeof r === 'string' ? r : r.text };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
const idOf = (text?: string) => /\(page ([a-f0-9]{10})/.exec(text ?? '')?.[1] ?? '';
const refused = (fn: () => unknown, re: RegExp) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof CardError && re.test(e.message);
  }
};
const modelOf = async (id: string) => (await req('GET', `/api/pages/${id}`)).json() as { page: { version: number; versions: number; kind?: string; title: string }; model: Board; versions: { version: number }[] };

const CHART = { title: 'Weekly sales', kind: 'bar', x: ['Mon', 'Tue', 'Wed'], series: [{ name: 'Sales', values: [12, 18, 9] }], unit: '€' };
const STATS = { title: 'This week', stats: [{ label: 'Orders', value: 128 }, { label: 'Revenue', value: '€3,240' }] };

// ---- the format and its checks ----------------------------------------------------------------------------------------
{
  for (const s of ANSWER_UIS) {
    const bad = dataProblems(s, s.example);
    ok(!bad.length, `${s.id}: its own example fits its type (${bad.join('; ')})`);
  }
  ok(shapeFields(answerUi('pros-cons')!).length === 2, 'a UI with two shapes (one subject’s, several options’) has both');
  ok(refused(() => checkCard({ ui: 'no-such-ui', data: { a: 1 } }), /There is no answer UI called “no-such-ui”/), 'a card of a UI the app does not have is refused, by name');
  ok(refused(() => checkCard({ data: { a: 1 } }), /needs ui/), 'and one without a UI');
  ok(refused(() => checkCard({ ui: 'chart', data: '{not json' }), /not JSON/), 'data that is not JSON is refused');
  ok(refused(() => checkCard({ ui: 'chart', data: {} }), /data is empty/), 'and empty data');
  ok(refused(() => checkCard({ ui: 'chart', data: { kind: 'lines', series: 'x' } }, { strict: true }), /takes “line”, “area”/), 'an agent’s word a UI does not take is refused, saying the ones it does');
  ok(refused(() => checkCard({ ui: 'chart', data: { kind: 'bar' } }, { strict: true }), /series is missing/), 'and a field its type needs');
  ok(refused(() => checkCard({ ui: 'chart', data: { kind: 'bar', series: 'x' } }, { strict: true }), /series should be a list, not words/), 'and a field of the wrong kind');
  ok(!refused(() => checkCard({ ui: 'chart', data: { kind: 'lines' } }), /./), 'a card pinned from a reply is kept as it drew there');
  ok(checkCard({ ui: 'chart', data: { from: { sheet: 'abc', range: 'A1:B4' }, kind: 'bar' } }, { strict: true }).data.from !== undefined, 'data read from a reference may leave out what it brings');
  const c = checkCard({ ui: 'forecast', data: { location: 'Amherst', days: [] }, title: '  Amherst\n weather ', size: 'huge', from: { session: 'claude:s9', at: 12, title: 'Trip', evil: 1 }, refresh: { every: 'day', how: 'ask' }, refreshedAt: 5 });
  ok(c.ui === 'weather' && c.title === 'Amherst weather' && c.size === defaultSize('weather') && /^c[a-z0-9]{10}$/.test(c.id), 'another name for a UI is its own; a title made one line; a size it does not know is its UI’s');
  ok(JSON.stringify(c.from) === '{"session":"claude:s9","at":12,"title":"Trip"}', 'where it came from, made sound');
  ok(c.refresh === undefined && c.refreshedAt === 5, 'a refresh setting with no question to ask (from before refreshes were built) is dropped; when it last refreshed stays');
  const kept = checkCard({ ui: 'chart', data: CHART, refresh: { ask: ' How did sales go? ', schedule: { kind: 'daily', time: '7:00' }, extra: 1 } });
  ok(JSON.stringify(kept.refresh) === '{"ask":"How did sales go?","schedule":{"kind":"daily","time":"07:00"}}', 'one with a question is kept, tidied (board-refresh-test.ts has the rest)');
  ok(checkCard({ ui: 'checklist', data: [{ text: 'Milk' }] }).data.items !== undefined, 'a list as data is its items, as a reply’s block is');
  ok(refused(() => checkCard({ ui: 'chart', data: { kind: 'bar', series: [], blob: 'x'.repeat(BOARD_LIMITS.data) } }), /more than a card holds/), 'data larger than a card holds is refused');
  ok(refused(() => checkBoard({ cards: Array.from({ length: BOARD_LIMITS.cards + 1 }, () => ({ ui: 'chart', data: CHART })) }), /at most 100 cards/), 'a board holds at most 100 cards');
  const two = checkBoard({ cards: [{ ui: 'chart', data: CHART, id: 'cabcdef' }, { ui: 'stats', data: STATS, id: 'cabcdef' }] });
  ok(two.cards[0].id !== two.cards[1].id, 'each card its own id');
  const text = boardText(two);
  ok(text.split('\n').length === 5 && text.startsWith('{"format":1,"cards":[\n') && JSON.parse(text).cards.length === 2, 'kept a card a line, as JSON');
  ok(boardText(newBoard()) === '{"format":1,"cards":[]}\n', 'an empty board');
  ok(cardTitle({ ui: 'stats', data: {} }) === answerUi('stats')!.title && cardTitle({ ui: 'chart', data: CHART }) === 'Weekly sales' && cardTitle({ ui: 'chart', data: CHART, title: 'Mine' }) === 'Mine', 'a card’s title: its own, its data’s, its UI’s');
}

// ---- New board, and pinning -----------------------------------------------------------------------------------------------
let shop = '';
{
  const made = (await req('POST', '/api/pages', { title: 'Empty', kind: 'board' })).json();
  ok(made.page?.kind === 'board' && made.page.version === 1, `New → Board makes an empty board (${JSON.stringify(made).slice(0, 200)})`);
  const got = await modelOf(made.page.id);
  ok(got.model.format === 1 && got.model.cards.length === 0, 'with no cards');

  let r = await req('POST', '/api/boards/pin', { title: 'Shop', card: { ui: 'chart', data: CHART, title: 'Sales this week', from: { session: 'claude:s1', at: 7, cwd: tmp } }, sessionKey: 'claude:s1' });
  ok(r.statusCode === 200 && r.json().page.kind === 'board' && r.json().page.title === 'Shop', `pinning to a new board makes it in passing (${r.body.slice(0, 200)})`);
  shop = r.json().page.id;
  let m = await modelOf(shop);
  ok(m.model.cards.length === 1 && JSON.stringify(m.model.cards[0].data) === JSON.stringify(CHART) && m.model.cards[0].title === 'Sales this week' && m.model.cards[0].by === 'user', 'the card’s data is copied as it was, with its title');
  ok(m.model.cards[0].from?.session === 'claude:s1' && m.model.cards[0].from.at === 7 && m.model.cards[0].pinnedAt > Date.now() - 60_000, 'and where and when it was pinned');
  r = await req('POST', '/api/boards/pin', { board: shop, card: { ui: 'stats', data: STATS } });
  m = await modelOf(shop);
  ok(r.statusCode === 200 && m.model.cards.length === 2 && m.model.cards[1].ui === 'stats' && m.page.version === 2, 'a pin to a board there is goes at its end, as a new version');
  ok((await req('POST', '/api/boards/pin', { board: shop, card: { ui: 'nope', data: { a: 1 } } })).json().error?.includes('There is no answer UI called “nope”'), 'a card of an unknown UI is refused, plainly');
  ok((await req('POST', '/api/boards/pin', { card: { ui: 'chart', data: CHART } })).statusCode === 400, 'a pin says which board, or names a new one');
  const doc = idOf((await run('save_doc', { title: 'Notes', markdown: 'Hi' })).text);
  ok((await req('POST', '/api/boards/pin', { board: doc, card: { ui: 'chart', data: CHART } })).json().error?.includes('is not a board'), 'a pin goes to a board only');
  ok(events.some((e) => e.data?.what === 'pages'), 'the Library hears of it');
  setSessionExtra(db, 'claude:secret', { confidential: true });
  const secret = await req('POST', '/api/boards/pin', { board: shop, card: { ui: 'chart', data: CHART, from: { session: 'claude:secret' } } });
  ok(secret.statusCode === 403 && (await modelOf(shop)).model.cards.length === 2, 'a confidential session’s card is never pinned');
}

// ---- the editor's saves: reorder, resize, rename, remove; versions ---------------------------------------------------------
{
  let m = await modelOf(shop);
  const [a, b] = m.model.cards;
  const moved: Board = { format: 1, cards: [{ ...b, size: 'wide' }, { ...a, title: 'Sales' }] };
  let r = await req('POST', `/api/pages/${shop}/versions`, { model: moved, base: m.page.version });
  m = await modelOf(shop);
  ok(r.statusCode === 200 && m.model.cards[0].id === b.id && m.model.cards[0].size === 'wide' && m.model.cards[1].title === 'Sales' && m.page.version === 3, 'reordered, resized and renamed: a new version');
  r = await req('POST', `/api/pages/${shop}/versions`, { model: { format: 1, cards: [a] }, base: 2 });
  ok(r.statusCode === 409, 'a change over an older version is refused (the editor makes it again on the newest)');
  r = await req('POST', `/api/pages/${shop}/versions`, { model: { format: 1, cards: [m.model.cards[0]] }, base: m.page.version });
  m = await modelOf(shop);
  ok(m.model.cards.length === 1 && m.page.version === 4 && m.versions.length === 4, 'a card taken off: another version; each change is kept');
  ok((await req('POST', `/api/pages/${shop}/versions`, { model: { cards: [{ ui: 'zzz', data: { a: 1 } }] } })).statusCode === 400, 'the editor cannot keep a card of an unknown UI either');
  const back = await req('POST', `/api/pages/${shop}/versions/3/restore`);
  m = await modelOf(shop);
  ok(back.statusCode === 200 && m.model.cards.length === 2 && m.model.cards[1].title === 'Sales', 'an older version comes back as a new one');
  const old = (await req('GET', `/api/pages/${shop}/versions/2?model=1`)).json();
  ok(old.model.cards.length === 2 && old.model.cards[0].ui === 'chart', 'an older version reads as its model');
  const copy = (await req('POST', `/api/pages/${shop}/copy`)).json();
  ok(copy.page.kind === 'board' && (await modelOf(copy.page.id)).model.cards.length === 2, 'Duplicate copies the board with its cards');
}

// ---- its own page and files ----------------------------------------------------------------------------------------------
{
  const page = (await req('GET', `/api/pages/${shop}/versions/5`)).json();
  ok(/Weekly sales|Sales/.test(page.html) && page.html.includes('grid-column:span 12') && page.html.includes('bd-card'), 'its own page draws each card’s title and data in the grid, by its size');
  const empty = boardPage(newBoard(), 'Nothing', 'viewer');
  ok(empty.includes('Pin any answer card from a reply'), 'an empty board says how to fill it');
  const md = (await req('GET', `/api/pages/${shop}/export?format=md`));
  ok(md.statusCode === 200 && md.body.startsWith('# Shop') && md.body.includes('## Sales') && md.body.includes('| Mon'), `it exports as Markdown, each card under its title, its numbers as a table (${md.body.slice(0, 120)})`);
  ok(boardMarkdown(newBoard(), 'X').includes('No cards yet'), 'an empty one too');
  const ex = await run('export_page', { id: shop, format: 'md' });
  ok(!ex.error && fs.readdirSync(tmp).some((f) => f === 'Shop.md'), `export_page saves a board as a file (${ex.error ?? ''})`);
}

// ---- save_board ---------------------------------------------------------------------------------------------------------------
{
  let r = await run('save_board', { title: 'GPU', cards: [{ ui: 'stats', data: STATS, size: 's' }, { ui: 'chart', data: CHART }], description: 'GPU use and experiments' });
  const gpu = idOf(r.text);
  ok(gpu && r.text?.includes('Saved the board "GPU"') && r.text.includes('2 cards on it'), `save_board makes a board (${r.error ?? r.text})`);
  let m = await modelOf(gpu);
  ok(m.model.cards.every((c) => c.by === 'agent' && c.from?.session === 'claude:s1') && m.model.cards[0].size === 's' && m.model.cards[1].size === defaultSize('chart'), 'its cards are the agent’s, from its session, at the sizes asked (else their UI’s)');
  r = await run('save_board', { title: 'Bad', cards: [{ ui: 'chart', data: { kind: 'pie-chart', series: [] } }] });
  ok(r.error?.includes('Card 1 of cards (chart)') && r.error.includes('takes “line”'), `a card whose data does not fit its UI is refused, saying why (${r.error})`);
  ok((await run('save_board', { title: 'Bad', cards: [{ ui: 'nonsense', data: { a: 1 } }] })).error?.includes('There is no answer UI called “nonsense”'), 'and one of a UI there is not');
  ok((await run('save_board', { cards: [{ ui: 'stats', data: STATS }] })).error?.includes('needs a name'), 'a new board needs a name');
  pages.beforeMessage!('claude:s1', deps);
  r = await run('save_board', { board: 'gpu', cards: [{ ui: 'weather', data: { location: 'Amherst', daily: [{ date: '2026-11-16', high: 8, low: -1, condition: 'Sunny' }] }, title: 'Amherst' }] });
  m = await modelOf(gpu);
  ok(idOf(r.text) === gpu && m.model.cards.length === 3 && m.model.cards[2].title === 'Amherst' && m.page.version === 2, `cards added to a board by its name, at its end, as a new version (${r.error ?? r.text})`);
  r = await run('save_board', { board: 'Reading', cards: [{ ui: 'stats', data: { stats: [{ label: 'Streak', value: '12 days' }] } }] });
  ok(idOf(r.text) && idOf(r.text) !== gpu && r.text?.includes('There was no board called “Reading”'), 'a name there is no board of makes one, and says so');
  const [s, c, w] = m.model.cards;
  pages.beforeMessage!('claude:s1', deps);
  r = await run('save_board', { id: gpu, change: [{ id: c.id, size: 'wide', data: { ...CHART, title: 'Sales, updated' } }], remove: [s.id], order: [w.id] });
  m = await modelOf(gpu);
  ok(m.model.cards.length === 2 && m.model.cards[0].id === w.id && m.model.cards[1].size === 'wide' && m.model.cards[1].data.title === 'Sales, updated' && m.model.cards[1].refreshedAt, `change, remove and order (${r.error ?? r.text})`);
  ok((await run('save_board', { id: gpu, change: [{ id: 'cnothere', size: 's' }] })).error?.includes('no card "cnothere"'), 'a card it does not have is named back');
  ok((await run('save_board', { id: gpu, change: [{ id: w.id, size: 'xl' }] })).error?.includes('size is s, m, l or wide'), 'a size there is not');
  ok((await run('save_board', { id: shop, cards: [{ ui: 'stats', data: STATS }], at: 1 })).text?.includes('added'), 'cards go where asked (at)');
  ok((await modelOf(shop)).model.cards[0].ui === 'stats', 'first, here');
  ok((await run('save_board', { id: idOf((await run('save_doc', { title: 'D2', markdown: 'x' })).text), cards: [] })).error?.includes('not a board'), 'save_board changes boards only');
  ok((await run('save_doc', { id: gpu, title: 'x', markdown: 'Hi' })).error?.includes('not a document'), 'and other tools leave boards alone');
  const named = await run('save_board', { id: gpu, title: 'GPU and weather' });
  ok(named.text?.includes('Changed the title') && (await modelOf(gpu)).page.title === 'GPU and weather', 'a new name alone is no new version');
  const list = (await run('get_page', {})).text ?? '';
  ok(list.includes(`${gpu} · GPU and weather · board`), 'get_page lists boards');
  const one = (await run('get_page', { id: gpu })).text ?? '';
  ok(one.includes('A board of answer cards, 2 cards') && one.includes(`id ${w.id} · weather`) && one.includes('save_board with this id'), 'and gives one card by card, with ids and how to change it');
  const spawn = (await pages.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: { page: gpu } }, deps)) ?? {};
  ok(spawn.instructions?.some((x) => x.includes(`saved page ${gpu}`) && x.includes('save_board') && x.includes('find_ui')), 'an agent asked from a board knows how to change its cards');
  const guide = (await pages.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: {} }, deps)) ?? {};
  ok(guide.guides?.some((g) => g.tools.includes('save_board') && g.text.includes('save_board')), 'every agent’s Pages guide tells of boards, with save_board');
  ok(tools.save_board.description.includes('Pin to a board') && tools.save_board.description.includes('find_ui'), 'save_board says what boards are for and to check UIs with find_ui');
}

// ---- shared read only ------------------------------------------------------------------------------------------------------
{
  let r = await req('POST', `/api/pages/${shop}/shares`, { name: 'Maria Lopez', role: 'edit' });
  ok(r.statusCode === 200, `a board shared alone (${r.body.slice(0, 160)})`);
  const P = `/p-api/${(r.json() as { share: ProjectShare; token: string }).token}`;
  const view = (await req('GET', `${P}/items/${shop}`)).json() as PortalItemView;
  ok(view.editable === false && (view.model as Board).cards.length === 3 && typeof view.html === 'string', 'its link opens it to read, even with Edit: its cards to draw (and its own page)');
  const before = (await modelOf(shop)).page.version;
  r = await req('POST', `${P}/items/${shop}/versions`, { model: { format: 1, cards: [] }, base: before });
  ok(r.statusCode >= 400 && (await modelOf(shop)).page.version === before, 'and nothing changes it through the link');
  ok((await req('POST', `${P}/items/${shop}/comments`, { text: 'Nice' })).statusCode === 400, 'a board takes no comments');
  ok((await req('GET', `${P}/pages/picture?url=${encodeURIComponent('https://evil.example/track.png')}`)).statusCode === 404, 'the link fetches no picture the board does not show');
  const other = idOf((await run('save_board', { title: 'Private', cards: [{ ui: 'stats', data: STATS }] })).text);
  ok(other && (await req('GET', `${P}/items/${other}`)).statusCode === 404, 'and opens no other board');
}

// ---- reading back as kept ---------------------------------------------------------------------------------------------
{
  const b = readBoard('{"format":1,"cards":[\n{"id":"cx1","ui":"gone-ui","data":{"a":1},"size":"m","pinnedAt":1}\n]}\n');
  ok(b.cards.length === 1 && b.cards[0].ui === 'gone-ui', 'a card of a UI the app no longer has is still read (it shows its data as it is)');
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
