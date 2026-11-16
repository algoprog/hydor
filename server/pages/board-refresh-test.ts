// Script tests for board cards that keep themselves up to date (shared/board-refresh.ts, board-refresh.ts, the
// scheduler's BoardRunner): a card's refresh settings kept as its board's and its schedule kept in step with every save;
// a scheduled refresh (a fake model's answer) replacing that one card's data in a new version, in an archived session
// that sends nothing, quiet; an answer of the wrong UI, bad data or no card at all keeping the card and saying why;
// three failures in a row pausing its schedule with one notice, and a refresh that works turning it on again; the
// board's monthly cap stopping refreshes with one notice, and the month's end starting them again; what the board page
// is told (cost, typical costs, the cap); the question a card came from; save_board and get_page for agents; a shared
// board drawing a card that reads a spreadsheet for a guest while refusing a source no card names; and refreshes in
// Schedules' week view (and not in Settings → Scheduled tasks).
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/board-refresh-test.ts
//   DATA_DIR=/tmp/hydor-test-board-refresh node dist/dev/board-refresh-test.js
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { boardCap, cleanRefresh, everyOf, refreshText, runsPerMonth, scheduleOf, type BoardRefreshState } from '../../shared/board-refresh.ts';
import { boardText, checkBoard, type Board, type BoardCard } from '../../shared/boards.ts';
import type { ScheduleWeek } from '../../shared/schedules.ts';
import type { ProjectShare } from '../../shared/share.ts';
import { automations } from '../automations/index.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps, RunCtx, TurnInfo } from '../features/types.ts';
import { isDry } from '../outbox/index.ts';
import { migrateTasks, Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { sharing } from '../spaces/share.ts';
import { _test, capState, readAnswer, refreshNow, refreshState, refreshTaskId, startRefreshes } from './board-refresh.ts';
import { readBoard } from './boards.ts';
import { pages } from './index.ts';
import { addVersion, createPage, deletePage, pageInfo, pageSource, restoreVersion } from './store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-board-refresh-test-')));
const db = openDb(path.join(tmp, 'test.db'));
migrateTasks(db);
kvSet(db, 'user.tz', 'Europe/Athens');

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

// ---- a fake model: sessions that answer what the test says --------------------------------------------------------

type Item = { kind: 'user' | 'assistant'; id: string; seq: number; text: string };
class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  archived = new Set<string>();
  items = new Map<string, Item[]>();
  cost = new Map<string, number>();
  status = new Map<string, string>();
  notices: any[] = [];
  resumeLookup?: unknown;
  noticeGate?: (n: any) => any;
  constructor() {
    super();
    this.on('notify', (n) => this.notices.push(n));
  }
  async create(o: any) {
    const key = `claude:fake-${this.made.length + 1}`;
    this.made.push({ key, o });
    const now = Date.now();
    db.prepare('insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, o.agent, now, now);
    setSessionExtra(db, key, o.extra ?? {});
    this.items.set(key, [{ kind: 'user', id: 'u1', seq: 1, text: o.prompt }]);
    this.status.set(key, 'working');
    return key;
  }
  setFlags(key: string, f: { archived?: boolean }) {
    if (f.archived) this.archived.add(key);
  }
  summary(key: string) {
    if (!this.status.has(key) && !this.items.has(key)) return null;
    return { key, agent: 'claude', title: key, cwd: tmp, stats: { tokensIn: 0, tokensOut: 0, tokensCached: 0, costUsd: this.cost.get(key) ?? 0 }, live: { status: this.status.get(key) ?? 'idle' } } as any;
  }
  async timeline(key: string) {
    return { parser: { items: this.items.get(key) ?? [] }, readMore: async () => {} } as any;
  }
  async interrupt(key: string) {
    this.status.set(key, 'idle');
  }
  queueSummary() {}
  stoppedAtLimit() {
    return false;
  }
  /** The model answers: its reply, and what the session cost (the indexer's figure too, for the cap). */
  answer(key: string, reply: string, usd: number) {
    this.items.get(key)!.push({ kind: 'assistant', id: 'a1', seq: 2, text: reply });
    this.cost.set(key, usd);
    this.status.set(key, 'idle');
    db.prepare("insert or replace into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '', ?)").run(key, key, usd);
  }
}

const sessions = new FakeSessions();
const scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const events: { t: string; id?: string; data?: any }[] = [];
const deps = {
  app,
  db,
  sessions,
  scheduler,
  models: { agentModels: () => [], ensure: async () => null },
  broadcast: (e: { t: string }) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
sharing.routes!(deps);
automations.routes!(deps);
startRefreshes(deps, { sweepAfterMs: 0 });
await app.ready();
const req = (method: 'GET' | 'POST', url: string, body?: unknown) =>
  app.inject({ method, url, payload: body === undefined ? (method === 'POST' ? '{}' : undefined) : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
const ctx = { runId: 'run1', key: 'claude:agent', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));

/** A refresh's turn ends (the scheduler hears it as from any session). */
const ended = (key: string) => scheduler.turnEnded({ key, status: 'idle', startedAt: Date.now(), endedAt: Date.now() } as TurnInfo);
/** The scheduler's own look for what is due. */
const tick = () => (scheduler as unknown as { tick(): void }).tick();
const settle = () => new Promise((r) => setTimeout(r, 30));
const taskRow = (id: string) => db.prepare('select * from tasks where id = ?').get(id) as { enabled: number; next_at: number | null; paused_reason: string | null; fails: number; schedule: string; prompt: string; name: string; origin: string } | undefined;
const runsOf = (id: string) => db.prepare('select * from task_runs where task_id = ? order by started_at, rowid').all(id) as { id: string; status: string; error: string | null; summary: string | null; dry: number | null; cost_usd: number | null; key: string | null }[];
const boardNow = (id: string) => readBoard(pageSource(db, id)!.text);
const ui = (name: string, data: unknown) => `Here it is.\n\n\`\`\`ui ${name}\n${JSON.stringify(data)}\n\`\`\`\n`;

const CHART = { title: 'Weekly sales', kind: 'bar', x: ['Mon', 'Tue', 'Wed'], series: [{ name: 'Sales', values: [12, 18, 9] }] };
const NEW_CHART = { title: 'Weekly sales', kind: 'bar', x: ['Mon', 'Tue', 'Wed', 'Thu'], series: [{ name: 'Sales', values: [12, 18, 9, 30] }] };
const STATS = { title: 'This week', stats: [{ label: 'Orders', value: 128 }] };

// ---- the settings -------------------------------------------------------------------------------------------------------
{
  ok(cleanRefresh({ every: 'day', how: 'ask' }) === undefined, 'a setting with no question (one from before refreshes) is dropped');
  const r = cleanRefresh({ ask: '  How did sales go?  ', schedule: { kind: 'daily', time: '7:00', days: [1, 2, 3, 4, 5, 5] }, tier: 'quick', costUsd: 0.031234 });
  ok(JSON.stringify(r) === '{"ask":"How did sales go?","schedule":{"kind":"daily","time":"07:00","days":[1,2,3,4,5]},"costUsd":0.0312}', `kept tidied, Quick left out as the default (${JSON.stringify(r)})`);
  let refused = '';
  try {
    cleanRefresh({ ask: 'x', schedule: { kind: 'every', minutes: 5 } });
  } catch (e) {
    refused = (e as Error).message;
  }
  ok(/at most every hour/.test(refused), 'a card refreshes at most every hour');
  ok(refreshText(scheduleOf('hour')) === 'every hour' && refreshText(scheduleOf('day', '07:00')) === 'every day at 07:00' && refreshText(scheduleOf('weekdays', '08:30')) === 'weekdays at 08:30' && refreshText(scheduleOf('week', '09:00', 1)) === 'every Monday at 09:00', 'its words');
  ok(everyOf(scheduleOf('week', '09:00', 3)) === 'week' && everyOf(undefined) === 'off', 'each schedule is one of the choices');
  ok(runsPerMonth(scheduleOf('day')) > 30 && runsPerMonth(scheduleOf('day')) < 31 && Math.abs(runsPerMonth(scheduleOf('weekdays')) - 21.7) < 0.1 && runsPerMonth(scheduleOf('hour')) === 731, 'how often a month');
  ok(boardCap({}) === 5 && boardCap({ cap: null }) === null && boardCap({ cap: 12 }) === 12, 'a board’s cap: $5 unless set, or off');
  const b = checkBoard({ cap: 2.5, cards: [{ ui: 'chart', data: CHART, refresh: { ask: 'q', schedule: { kind: 'every', minutes: 60 } } }] });
  ok(b.cap === 2.5 && boardText(b).startsWith('{"format":1,"cap":2.5,"cards":[') && readBoard(boardText(b)).cap === 2.5, 'the cap is kept with the board, and read back');
  ok(readBoard(boardText(checkBoard({ cap: null, cards: [] }))).cap === null, 'and off is kept as off');
}

// ---- reading an answer ------------------------------------------------------------------------------------------------------
{
  const card = { id: 'cx1', ui: 'chart', data: CHART, size: 'l', pinnedAt: 1 } as BoardCard;
  const got = readAnswer(card, `Sales picked up.\n\n${ui('chart', NEW_CHART).trim()}`);
  ok('data' in got && JSON.stringify(got.data) === JSON.stringify(NEW_CHART), 'its card’s new data from the reply’s block');
  const last = readAnswer(card, `${ui('chart', CHART)}\nOn second thought:\n${ui('chart', NEW_CHART)}`);
  ok('data' in last && (last.data.x as string[]).length === 4, 'the last block of its UI');
  const wrong = readAnswer(card, ui('table', { columns: ['a'], rows: [] }));
  ok('error' in wrong && wrong.error === 'the agent answered with a data table card, not a chart card', `the wrong UI said plainly (${JSON.stringify(wrong)})`);
  const bad = readAnswer(card, ui('chart', { kind: 'bar' }));
  ok('error' in bad && /series is missing/.test(bad.error) && !/find_ui/.test(bad.error), `data that does not fit its type said plainly (${JSON.stringify(bad)})`);
  const none = readAnswer(card, 'I could not find this week’s numbers.');
  ok('error' in none && /answered without a card: “I could not find this week’s numbers.”/.test(none.error), 'no card at all, with what it said');
  const notJson = readAnswer(card, '```ui chart\n{kind: bar\n```');
  ok('error' in notJson && /not JSON/.test(notJson.error), 'a card that is not JSON');
  ok(_test.uiBlocks('```ui weather\n{}\n```\ntext\n````ui chart\n{"a":1}\n````').length === 2, 'blocks fenced with three or more backticks');
}

// ---- a scheduled refresh ------------------------------------------------------------------------------------------------------
const sched = { kind: 'daily', time: '07:00' } as const;
const shop = createPage(db, {
  title: 'Shop',
  kind: 'board',
  by: 'made',
  model: {
    format: 1,
    cards: [
      { id: 'csales1', ui: 'chart', data: CHART, size: 'l', pinnedAt: 1, refresh: { ask: 'How did sales go this week?', schedule: sched } },
      { id: 'cstats1', ui: 'stats', data: STATS, size: 'm', pinnedAt: 2 },
    ],
  },
});
const salesTask = refreshTaskId(shop.id, 'csales1');
{
  const t = taskRow(salesTask);
  ok(t && t.enabled === 1 && t.next_at! > Date.now() && t.schedule === JSON.stringify(sched) && t.prompt === 'How did sales go this week?' && t.origin === `board:${shop.id}` && t.name === 'Shop: Weekly sales', `a card that refreshes by itself is a scheduled task of its own (${JSON.stringify(t)})`);
  ok(!taskRow(refreshTaskId(shop.id, 'cstats1')), 'and one that does not, none');
  ok(!scheduler.list().some((x) => x.id === salesTask) && scheduler.list({ boards: true }).some((x) => x.id === salesTask), 'it is the board’s: not in Settings → Scheduled tasks, but in Schedules');
  let refused = '';
  try {
    scheduler.save({ ...scheduler.list({ boards: true }).find((x) => x.id === salesTask)!, prompt: 'Something else' });
  } catch (e) {
    refused = (e as Error).message;
  }
  ok(/set on the board/.test(refused), 'and the task forms do not change it');

  // Its time comes.
  db.prepare('update tasks set next_at = ? where id = ?').run(Date.now() - 1000, salesTask);
  tick();
  await settle();
  ok(sessions.made.length === 1, 'its time come, one refresh starts');
  const { key, o } = sessions.made[0];
  ok(o.prompt.includes('How did sales go this week?') && o.prompt.includes('```ui chart') && o.prompt.includes('The chart UI’s data') && o.prompt.includes('"Weekly sales"') && /test that sends nothing/.test(o.prompt), 'its agent hears the question, the UI, its data now, and that it sends nothing');
  ok(o.title === 'Board refresh: Weekly sales · Shop' && sessions.archived.has(key), 'in a session of its own, clearly a board refresh, archived');
  ok(o.extra.boardRefresh.page === shop.id && o.extra.boardRefresh.tier === 'quick' && o.extra.capUsd === 5, `on Quick, capped at what is left of the board’s cap (${JSON.stringify(o.extra)})`);
  const run = runsOf(salesTask)[0];
  ok(run.status === 'running' && run.dry === 1 && isDry(db, key), 'nothing outward is sent: calls that act outside are held as in a test');
  ok(taskRow(salesTask)!.next_at! > Date.now(), 'its next time is set at once');
  const state = (await req('GET', `/api/boards/${shop.id}/refresh`)).json() as BoardRefreshState;
  ok(state.cards.csales1.running?.key === key && state.cards.csales1.task === salesTask, 'the board page hears it is going on');

  const before = pageInfo(db, shop.id)!.version;
  sessions.answer(key, ui('chart', NEW_CHART), 0.03);
  await ended(key);
  const b = boardNow(shop.id);
  const c = b.cards.find((x) => x.id === 'csales1')!;
  ok(JSON.stringify(c.data) === JSON.stringify(NEW_CHART) && c.refreshedAt! > Date.now() - 5000 && c.refresh?.costUsd === 0.03, 'its answer replaces the card’s data, with when and what it cost');
  ok(JSON.stringify(b.cards.find((x) => x.id === 'cstats1')) === JSON.stringify({ id: 'cstats1', ui: 'stats', data: STATS, size: 'm', pinnedAt: 2 }), 'and nothing else on the board changes');
  ok(pageInfo(db, shop.id)!.version === before + 1, 'in a new version of the board');
  const done = runsOf(salesTask)[0];
  ok(done.status === 'done' && done.cost_usd === 0.03 && done.summary === 'Updated “Weekly sales”', `its run is kept, with its cost (${JSON.stringify(done)})`);
  ok(!sessions.notices.length && sessions.noticeGate?.({ key, kind: 'done', title: 'x', body: 'y', agent: 'claude', at: Date.now() }) === null, 'and it is quiet: no notice');
  const st = (await req('GET', `/api/boards/${shop.id}/refresh`)).json() as BoardRefreshState;
  ok(st.cards.csales1.last?.status === 'done' && st.cards.csales1.last.costUsd === 0.03 && !st.cards.csales1.running && st.spentUsd === 0.03 && st.cap === 5 && !st.reached, 'the board page hears how it went, and what this month’s refreshes spent');
  ok(st.cards.csales1.typicalUsd === 0.03 && st.tiers.quick === 0.03, 'and what a refresh costs: the card’s own, and Quick’s on any board');
  ok(events.some((e) => e.id === 'boards' && e.data?.board === shop.id), 'the board page is told to look again');
}

// ---- failures ---------------------------------------------------------------------------------------------------------------------
{
  const fail = async (reply: string) => {
    const r = await refreshNow(deps, shop.id, 'csales1');
    sessions.answer(r.key!, reply, 0.01);
    await ended(r.key!);
    return runsOf(salesTask).at(-1)!;
  };
  const kept = JSON.stringify(boardNow(shop.id).cards[0].data);
  const v = pageInfo(db, shop.id)!.version;
  let r = await fail(ui('table', { columns: ['a'], rows: [] }));
  ok(r.status === 'failed' && r.error === 'the agent answered with a data table card, not a chart card' && r.summary === 'Could not update: the agent answered with a data table card, not a chart card', `an answer of another UI fails, said plainly (${JSON.stringify(r)})`);
  ok(JSON.stringify(boardNow(shop.id).cards[0].data) === kept && pageInfo(db, shop.id)!.version === v, 'and the card keeps its last good data');
  const st = (await req('GET', `/api/boards/${shop.id}/refresh`)).json() as BoardRefreshState;
  ok(st.cards.csales1.last?.status === 'failed' && st.cards.csales1.last.error === r.error && st.cards.csales1.fails === 1, 'the board page hears why (“Could not update: …”)');
  r = await fail(ui('chart', { kind: 'bar' }));
  ok(r.status === 'failed' && /series is missing/.test(r.error ?? ''), 'bad data fails too, saying what is wrong with it');
  ok(taskRow(salesTask)!.enabled === 1 && !sessions.notices.length, 'two failures: still on, nothing said');
  r = await fail('Sorry, the shop’s site was down.');
  const t = taskRow(salesTask)!;
  ok(t.enabled === 0 && /^Paused after 3 failed refreshes in a row\. The last: the agent answered without a card/.test(t.paused_reason ?? ''), `three in a row pause its schedule (${t.paused_reason})`);
  ok(sessions.notices.length === 1 && sessions.notices[0].url === `/pages/${shop.id}` && sessions.notices[0].title === 'Shop' && /Paused after 3 failed refreshes/.test(sessions.notices[0].body), `with one notice, which opens the board (${JSON.stringify(sessions.notices)})`);
  const paused = (await req('GET', `/api/boards/${shop.id}/refresh`)).json() as BoardRefreshState;
  ok(paused.cards.csales1.enabled === false && /Paused after 3/.test(paused.cards.csales1.pausedReason ?? '') && !paused.cards.csales1.nextAt, 'the board says so');
  // Try again, and it works.
  const again = await refreshNow(deps, shop.id, 'csales1');
  sessions.answer(again.key!, ui('chart', CHART), 0.02);
  await ended(again.key!);
  const on = taskRow(salesTask)!;
  ok(on.enabled === 1 && !on.paused_reason && !on.fails && on.next_at! > Date.now(), 'a refresh that works turns its schedule on again');
  ok(sessions.notices.length === 1, 'without another notice');
  const none = await req('POST', `/api/boards/${shop.id}/cards/cstats1/refresh`);
  ok(none.statusCode === 400 && (none.json() as { error: string }).error === 'This card has no question to ask again: write one in its … menu → Keep it up to date…', `a card with no question to ask is refused, saying where to write one (${none.body})`);
}

// ---- the question it came from, and the agent's tools -----------------------------------------------------------------------
{
  sessions.items.set('claude:src', [
    { kind: 'user', id: 'u1', seq: 1, text: 'What is the weather in Athens?' },
    { kind: 'assistant', id: 'a1', seq: 2, text: 'Sunny.' },
    { kind: 'user', id: 'u2', seq: 3, text: 'How many people visited the shop today?' },
    { kind: 'assistant', id: 'a2', seq: 4, text: 'Here: …' },
  ]);
  addVersion(db, shop.id, { model: { ...boardNow(shop.id), cards: [...boardNow(shop.id).cards, { id: 'cvisits1', ui: 'stats', data: { title: 'Visitors', stats: [{ label: 'Today', value: 41 }] }, size: 's', pinnedAt: 3, from: { session: 'claude:src', at: 4 } }] }, by: 'edit' });
  const q = (await req('GET', `/api/boards/${shop.id}/cards/cvisits1/question`)).json() as { question: string };
  ok(q.question === 'How many people visited the shop today?', `a card’s question is the request of the turn it was pinned from (${JSON.stringify(q)})`);

  const said = await tools.save_board.run({ id: shop.id, change: [{ id: 'cvisits1', refresh: { every: 'weekdays', at: '8:00' } }] }, ctx);
  const text = typeof said === 'string' ? said : said.text;
  const c = boardNow(shop.id).cards.find((x) => x.id === 'cvisits1')!;
  ok(c.refresh?.ask === 'How many people visited the shop today?' && JSON.stringify(c.refresh.schedule) === '{"kind":"daily","time":"08:00","days":[1,2,3,4,5]}', `save_board sets a pinned card’s refresh, its question the request it came from (${JSON.stringify(c.refresh)})`);
  ok(/“Visitors” refreshes weekdays at 08:00 on quick, about \$0\.0\d a refresh, about \$\d+\.\d\d a month/.test(text) && /\$5 cap/.test(text), `and says what it costs (${text})`);
  ok(taskRow(refreshTaskId(shop.id, 'cvisits1'))?.enabled === 1, 'its schedule is on');
  const got = await tools.get_page.run({ id: shop.id }, ctx);
  const page = typeof got === 'string' ? got : got.text;
  ok(/Refreshes: a monthly cap of \$5, \$0\.\d\d spent this month/.test(page) && /“Visitors” \(cvisits1\) refreshes weekdays at 08:00 on Quick/.test(page) && /“Weekly sales” \(csales1\) refreshes every day at 07:00 on Quick; about \$0\.0\d a time/.test(page), `get_page says what refreshes when and what it costs (${page.slice(-700)})`);
  ok(tools.save_board.description.includes('keep this updated every morning') && tools.save_board.description.includes('monthly cap'), 'save_board’s description says it can keep cards up to date, and what that costs');
  let err = '';
  try {
    await tools.save_board.run({ id: shop.id, change: [{ id: 'cstats1', refresh: { every: 'day' } }] }, ctx);
  } catch (e) {
    err = (e as Error).message;
  }
  ok(/refresh needs ask/.test(err), 'a card with no question of its own needs one');
  await tools.save_board.run({ id: shop.id, change: [{ id: 'cvisits1', refresh: null }] }, ctx);
  ok(!boardNow(shop.id).cards.find((x) => x.id === 'cvisits1')!.refresh && !taskRow(refreshTaskId(shop.id, 'cvisits1')), 'refresh: null stops it, and its schedule goes');
}

// ---- kept in step with the board -----------------------------------------------------------------------------------------
{
  const b = boardNow(shop.id);
  addVersion(db, shop.id, { model: { ...b, cards: b.cards.map((c) => (c.id === 'csales1' ? { ...c, refresh: { ...c.refresh!, schedule: { kind: 'every', minutes: 60 } } } : c)) }, by: 'edit' });
  ok(taskRow(salesTask)!.schedule === '{"kind":"every","minutes":60}', 'a changed schedule changes its task');
  const v = pageInfo(db, shop.id)!.version;
  addVersion(db, shop.id, { model: { ...b, cards: b.cards.map((c) => (c.id === 'csales1' ? { ...c, refresh: { ask: c.refresh!.ask } } : c)) }, by: 'edit' });
  ok(!taskRow(salesTask) && runsOf(salesTask).length > 0, 'a card that refreshes only when asked has no schedule; its past refreshes stay');
  restoreVersion(db, shop.id, v);
  ok(taskRow(salesTask)?.schedule === '{"kind":"every","minutes":60}', 'a version brought back brings its schedule back');
  const copy = createPage(db, { title: 'Shop copy', kind: 'board', by: 'made', model: boardNow(shop.id) });
  ok(!!taskRow(refreshTaskId(copy.id, 'csales1')), 'a copy refreshes as its original did');
  deletePage(db, copy.id);
  ok(!taskRow(refreshTaskId(copy.id, 'csales1')), 'a board deleted takes its schedules with it');
  addVersion(db, shop.id, { model: { ...b, cards: b.cards.map((c) => (c.id === 'csales1' ? { ...c, refresh: { ...c.refresh!, schedule: sched } } : c)) }, by: 'edit' });
}

// ---- the cap -----------------------------------------------------------------------------------------------------------------------
{
  // The month so far: $0.03 + 3 × $0.01 + $0.02 = $0.08. A cap of $0.05 is reached.
  const b = boardNow(shop.id);
  addVersion(db, shop.id, { model: { ...b, cap: 0.05 }, by: 'edit' });
  const st = capState(db, shop.id, boardNow(shop.id));
  ok(st.cap === 0.05 && Math.abs(st.spentUsd - 0.08) < 1e-9 && st.reached, `this month’s refreshes count against the cap (${JSON.stringify(st)})`);
  const made = sessions.made.length;
  const notices = sessions.notices.length;
  db.prepare('update tasks set next_at = ? where id = ?').run(Date.now() - 1000, salesTask);
  tick();
  await settle();
  ok(sessions.made.length === made && taskRow(salesTask)!.next_at! > Date.now() && taskRow(salesTask)!.enabled === 1, 'once reached, its time comes and nothing runs: it waits for the next');
  ok(sessions.notices.length === notices + 1 && /reached the board’s \$0\.05 cap for this month/.test(sessions.notices.at(-1).body) && sessions.notices.at(-1).url === `/pages/${shop.id}`, 'the person hears once');
  db.prepare('update tasks set next_at = ? where id = ?').run(Date.now() - 1000, salesTask);
  tick();
  await settle();
  ok(sessions.notices.length === notices + 1, 'not twice');
  const r = await req('POST', `/api/boards/${shop.id}/cards/csales1/refresh`);
  ok(r.statusCode === 409 && /reached its \$0\.05 cap for this month/.test(r.json().error), `Refresh now says why it cannot (${r.body})`);
  const all = (await req('POST', `/api/boards/${shop.id}/refresh`)).json() as { started: number; skipped: string[] };
  ok(all.started === 0 && /cap/.test(all.skipped[0] ?? ''), 'nor Refresh all');
  const page = (await req('GET', `/api/boards/${shop.id}/refresh`)).json() as BoardRefreshState;
  ok(page.reached && page.cap === 0.05 && page.monthEnds > Date.now(), 'the board says so at the top, and when it ends');
  // Next month: nothing spent yet.
  ok(!capState(db, shop.id, boardNow(shop.id), page.monthEnds + 1000).reached, 'a new month starts at nothing spent');
  db.prepare('update app_sessions set created_at = ? where instr(extra, ?) > 0').run(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() - 3600_000, `"page":"${shop.id}"`);
  db.prepare('update tasks set next_at = ? where id = ?').run(Date.now() - 1000, salesTask);
  tick();
  await settle();
  ok(sessions.made.length === made + 1 && sessions.made.at(-1)!.o.extra.capUsd === 0.05, 'and refreshes run again, each capped at what is left');
  sessions.answer(sessions.made.at(-1)!.key, ui('chart', NEW_CHART), 0.01);
  await ended(sessions.made.at(-1)!.key);
  addVersion(db, shop.id, { model: { ...boardNow(shop.id), cap: null }, by: 'edit' });
  ok(capState(db, shop.id, boardNow(shop.id)).cap === null, 'and a cap can be off');
}

// ---- Schedules' week view ----------------------------------------------------------------------------------------------------
{
  const w = (await req('GET', '/api/automations/week')).json() as ScheduleWeek;
  const it = w.items.find((x) => x.id === salesTask);
  ok(it?.source === 'board' && it.board?.name === 'Shop' && it.board.card === 'Weekly sales' && it.edit === `/pages/${shop.id}?card=csales1` && it.when === 'Daily at 07:00', `a card’s refreshes show as the board’s, opening the board (${JSON.stringify(it)})`);
  const runs = w.runs.filter((x) => x.task === salesTask);
  ok(runs.length >= 5 && runs.some((x) => x.status === 'done' && x.costUsd === 0.03) && runs.some((x) => x.status === 'failed'), `its refreshes are runs there, with how each went and its cost (${runs.length})`);
  ok(w.next.some((x) => x.task === salesTask), 'and the next ones');
  const tasks = (await req('GET', '/api/automations/week')).json() as ScheduleWeek;
  ok(tasks.items.filter((x) => x.source === 'board').length === 1, 'one item for the one card on a schedule');
  const paused = (await req('POST', `/api/automations/tasks/${salesTask}/enabled`, { on: false })).json();
  ok(paused.task?.enabled === false && taskRow(salesTask)!.enabled === 0, 'its pause switch there pauses it');
  await req('POST', `/api/automations/tasks/${salesTask}/enabled`, { on: true });
  ok(taskRow(salesTask)!.enabled === 1, 'and turns it on again');
}

// ---- a shared board ------------------------------------------------------------------------------------------------------------------
{
  const sheet = createPage(db, { title: 'Shop numbers', kind: 'sheet', by: 'agent', model: { sheets: [{ name: 'Sales', header: true, rows: [['Day', 'Revenue'], ['Mon', 120], ['Tue', 180]] }] } });
  createPage(db, { title: 'Secrets', kind: 'sheet', by: 'agent', model: { sheets: [{ name: 'Keys', header: true, rows: [['Name', 'Value'], ['password', 'hunter2']] }] } });
  const ref = { title: 'Sales by day', from: { sheet: 'Shop numbers', range: 'Sales' } };
  const board = createPage(db, { title: 'Public', kind: 'board', by: 'made', model: { format: 1, cards: [{ id: 'cref1', ui: 'table', data: ref, size: 'wide', pinnedAt: 1 }] } });
  const r = await req('POST', `/api/pages/${board.id}/shares`, { name: 'Maria Lopez', role: 'comment' });
  const P = `/p-api/${(r.json() as { share: ProjectShare; token: string }).token}`;
  const got = await req('POST', `${P}/answers/data`, { board: board.id, ui: 'table', data: ref });
  const body = got.json();
  ok(got.statusCode === 200 && body.rows === 2 && JSON.stringify(body.data.rows) === JSON.stringify([{ Day: 'Mon', Revenue: 120 }, { Day: 'Tue', Revenue: 180 }]), `a guest’s board draws a card that reads a spreadsheet, through the share (${got.body.slice(0, 300)})`);
  ok(body.source.kind === 'sheet' && body.source.id === '' && body.source.name === 'Shop numbers', 'saying where it came from, without what would open the owner’s Library');
  const other = await req('POST', `${P}/answers/data`, { board: board.id, ui: 'table', data: { title: 'Mine', from: { sheet: 'Secrets', range: 'Keys' } } });
  ok(other.statusCode === 403 && !other.body.includes('hunter2'), 'a source no card of the board names is refused');
  const filtered = await req('POST', `${P}/answers/data`, { board: board.id, ui: 'table', data: { ...ref, where: "Day = 'Mon'" } });
  ok(filtered.statusCode === 403, 'and so is the card’s source read another way');
  ok((await req('POST', `${P}/answers/data`, { board: shop.id, ui: 'chart', data: CHART })).statusCode === 404, 'and a board the link does not open');
  ok(sheet.id && (await req('POST', '/p-api/not-a-token-at-all-not-a-token-xx/answers/data', { board: board.id, ui: 'table', data: ref })).statusCode >= 400, 'and a link that opens nothing');
  // Refreshed cards: their latest data is what the link draws.
  const view = (await req('GET', `${P}/items/${board.id}`)).json() as { model: Board };
  ok(view.model.cards[0].id === 'cref1', 'its cards are drawn from the board as it is now');
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
