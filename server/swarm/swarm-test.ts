// Checks for Swarm mode: who leads and who is a member (also before a new session's settings are stored),
// what each is told and which tools each gets, members starting with the lead's model and effort and at
// most the swarm's size at once, the board (posts for everyone or one, what each reader sees, read marks),
// how word gets around (the lead in one message, later when it is working; a member woken by a message,
// unless it works or was stopped), stopping members without a report of the cut-short turn, the routes and
// the setting. Then a campaign: its own instructions, members always in worktrees, the plan and each part's
// posts read back as parts with their status (on the server and in the pages' way of folding them in), posts
// to everyone that wake nobody, and its board. Sessions are a stub.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/swarm/swarm-test.ts
//   DATA_DIR=/tmp/hydor-test-swarm PRICES_URL= node dist/dev/swarm-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { campaignParts, partsTally, type SwarmBoard, type SwarmPost } from '../../shared/swarm.ts';
import type { Agent, LiveState, SessionSummary, TimelineItem } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { children, reportTurn } from '../children/index.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import type { CreateOpts } from '../sessions.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { addPost, partsOf, postsOf, swarm, tellLead } from './index.ts';
import { CAMPAIGN_MEMBER_INSTRUCTIONS, MEMBER_INSTRUCTIONS } from './instructions.ts';
import { noteRun, roleOf } from './roles.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || process.env.PRICES_URL !== '') {
  console.error('Run with DATA_DIR=/tmp/… and PRICES_URL= (empty) so nothing touches real data or the network.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-swarm-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- the session manager, as much as the swarm uses of it ------------------------------------------------

interface Fake {
  agent: Agent;
  title: string;
  live?: LiveState['status'];
  prefs?: { model?: string; effort?: string };
  items: TimelineItem[];
}

class Sessions extends EventEmitter {
  all = new Map<string, Fake>();
  created: CreateOpts[] = [];
  delivered: { key: string; text: string }[] = [];
  interrupted: string[] = [];
  n = 0;
  add(key: string, f: Partial<Fake> & { agent: Agent }) {
    this.all.set(key, { title: key, items: [], ...f });
    db.prepare('insert or ignore into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, f.agent, Date.now() + this.n, Date.now() + this.n++);
  }
  summary(key: string): SessionSummary | null {
    const f = this.all.get(key);
    if (!f) return null;
    return {
      key,
      agent: f.agent,
      id: key,
      title: f.title,
      cwd: tmp,
      stats: {} as any,
      prefs: f.prefs,
      live: f.live ? { status: f.live, startedAt: 1, pendingApprovals: 0 } : null,
      extra: sessionExtra(db, key),
      updatedAt: Date.now(),
    };
  }
  async create(o: CreateOpts): Promise<string> {
    this.created.push(o);
    const key = `${o.agent}:m${this.created.length}`;
    this.add(key, { agent: o.agent, title: o.title ?? '', live: 'working' });
    if (o.extra) setSessionExtra(db, key, o.extra);
    return key;
  }
  async timeline(key: string) {
    return { parser: { items: this.all.get(key)?.items ?? [] }, readMore: async () => {} };
  }
  async deliverOrQueue(key: string, text: string) {
    this.delivered.push({ key, text });
  }
  enqueue(key: string, text: string) {
    this.delivered.push({ key, text });
  }
  async interrupt(key: string) {
    this.interrupted.push(key);
    this.all.get(key)!.live = 'idle';
  }
  accountOf() {
    return undefined;
  }
}

const sessions = new Sessions();
const events: unknown[] = [];
const deps = { app: {}, db, sessions, broadcast: (e: unknown) => events.push(e), toSubscribers: () => {}, publicBase: () => 'https://naget.test' } as unknown as Deps;
let run = 0;
const ctxOf = (key: string, runId = `run${++run}`): RunCtx => ({ runId, key, agent: sessions.all.get(key)!.agent, cwd: tmp, deps });
const toolsOf = (key: string, runId?: string) => [...children.tools!(ctxOf(key, runId)), ...swarm.tools!(ctxOf(key, runId))].map((t) => t.name);
const call = async (key: string, name: string, args: Record<string, unknown>) => {
  const ctx = ctxOf(key);
  const t = [...children.tools!(ctx), ...swarm.tools!(ctx)].find((x) => x.name === name);
  if (!t) throw new Error(`no ${name} for ${key}`);
  const r = await t.run(args, ctx);
  return typeof r === 'string' ? r : r.text;
};
const delivered = (key: string) => sessions.delivered.filter((m) => m.key === key);

const LEAD = 'claude:lead';
sessions.add(LEAD, { agent: 'claude', live: 'working', title: 'Prove the conjecture', prefs: { model: 'opus', effort: 'max' } });
setSessionExtra(db, LEAD, { swarm: true });
sessions.add('claude:solo', { agent: 'claude', live: 'idle' });

// ---- who is who ----------------------------------------------------------------------------------------------

test('roles: a lead, its members, and everyone else; noted by run before the settings are stored', () => {
  assert.deepEqual(roleOf(db, { key: LEAD }), { role: 'lead', mode: 'swarm' });
  assert.equal(roleOf(db, { key: 'claude:solo' }), null);
  // A member starting: its parent leads a swarm, though its own settings are not stored yet.
  const add = swarm.spawn!({ agent: 'codex', cwd: tmp, runId: 'early', resume: false, extra: { parent: LEAD } }, deps) as { instructions: string[] };
  assert.equal(add.instructions[0], MEMBER_INSTRUCTIONS);
  assert.deepEqual(roleOf(db, { runId: 'early', key: 'codex:not-stored-yet' }), { role: 'member', swarm: LEAD, mode: 'swarm' });
  noteRun('early', null);
  assert.equal(roleOf(db, { runId: 'early', key: 'codex:not-stored-yet' }), null);
  const lead = swarm.spawn!({ agent: 'claude', key: LEAD, cwd: tmp, runId: 'lead-run', resume: false, extra: { swarm: true } }, deps) as { instructions: string[] };
  assert.match(lead.instructions[0], /^Swarm mode: you lead a swarm/);
  assert.match(lead.instructions[0], /up to 5 genuinely different angles/);
  assert.equal(swarm.spawn!({ agent: 'claude', cwd: tmp, runId: 'x', resume: false, extra: {} }, deps), undefined);
});

test('tools: the lead starts members (at most the swarm’s size) and has the board; a member the board only', () => {
  assert.deepEqual(toolsOf(LEAD), ['start_child_session', 'child_sessions', 'message_child', 'swarm_post', 'swarm_read', 'swarm_stop']);
  assert.match(children.tools!(ctxOf(LEAD)).find((t) => t.name === 'start_child_session')!.description, /at most 5 of yours run at once/);
  assert.deepEqual(toolsOf('claude:solo'), ['start_child_session', 'child_sessions', 'message_child']);
});

let A = '';
let B = '';
let C = '';
test('members start with the lead’s model and effort unless it names others; at most the swarm’s size at once', async () => {
  const out = await call(LEAD, 'start_child_session', { brief: 'Prove it by induction on n. Post what you find.', title: 'Induction' });
  A = /Started child session (\S+):/.exec(out)![1];
  assert.equal(sessions.created.at(-1)!.model, 'opus');
  assert.equal(sessions.created.at(-1)!.effort, 'max');
  assert.match(out, /Claude Code · opus/);
  await call(LEAD, 'start_child_session', { brief: 'Search small cases by computer.', title: 'Small cases', model: 'sonnet' });
  B = sessions.created.length ? `claude:m${sessions.created.length}` : '';
  assert.equal(sessions.created.at(-1)!.model, 'sonnet');
  assert.equal(sessions.created.at(-1)!.effort, undefined);
  await call(LEAD, 'start_child_session', { brief: 'Look for a counterexample.', title: 'Counterexample', agent: 'codex' });
  C = `codex:m${sessions.created.length}`;
  assert.equal(sessions.created.at(-1)!.model, undefined, 'another agent keeps its own default');
  assert.deepEqual(toolsOf(A), ['swarm_post', 'swarm_read'], 'a member starts no children');
  await call(LEAD, 'start_child_session', { brief: 'Four', title: 'Four' });
  await call(LEAD, 'start_child_session', { brief: 'Five', title: 'Five' });
  await assert.rejects(call(LEAD, 'start_child_session', { brief: 'Six', title: 'Six' }), /5 of your child sessions are working already/);
  // Those two finish, so the board's tests have three members working.
  for (const k of [`claude:m4`, `claude:m5`]) sessions.all.get(k)!.live = 'idle';
});

// ---- the board ------------------------------------------------------------------------------------------------

test('swarm_post: to everyone, to the lead or one member; the poster gets what is new since it last read', async () => {
  const first = await call(A, 'swarm_post', { text: 'Base case n=1 holds.', kind: 'progress' });
  assert.match(first, /^Posted to everyone \(progress\)\.$/);
  const fromB = await call(B, 'swarm_post', { text: 'Checked n ≤ 40: no counterexample.', kind: 'finding' });
  assert.match(fromB, /New on the board since you last read:\n- “Induction” \(claude:m1\) · progress: Base case n=1 holds\./);
  await call(B, 'swarm_post', { text: 'Is n meant to be odd?', kind: 'question', to: 'lead' });
  await assert.rejects(call(B, 'swarm_post', { text: 'x', to: 'claude:nobody' }), /no member "claude:nobody"/);
  await assert.rejects(call(B, 'swarm_post', { text: '  ' }), /empty/);
  const posts = postsOf(db, LEAD);
  assert.equal(posts.length, 3);
  assert.deepEqual(
    posts.map((p) => [p.from, p.to ?? null, p.kind]),
    [
      [A, null, 'progress'],
      [B, null, 'finding'],
      [B, LEAD, 'question'],
    ],
  );
  assert.ok(events.some((e: any) => e.t === 'feature' && e.id === 'swarm' && e.key === LEAD && e.data.post.id === posts[2].id), 'open pages hear of each post');
});

test('swarm_read: the members, then what is new for this reader; a member sees what is for everyone or for it', async () => {
  const r = await call(C, 'swarm_read', {});
  assert.match(r, /^Members \(5; at most 5 work at once\):/);
  assert.match(r, /- you · “Counterexample” · working/);
  assert.match(r, /- claude:m4 · “Four” · finished its turn/);
  assert.match(r, /Base case n=1 holds/);
  assert.match(r, /no counterexample/);
  assert.doesNotMatch(r, /Is n meant to be odd/, 'a message for the lead is not for the members');
  assert.match(await call(C, 'swarm_read', {}), /Nothing new since you last read\./);
  assert.match(await call(C, 'swarm_read', { all: true }), /The latest posts:\n.*Base case/s);
});

test('the lead hears of the board in one message, and only once', async () => {
  // Working: it hears after its turn.
  await tellLead(deps, LEAD);
  assert.equal(delivered(LEAD).length, 0);
  sessions.all.get(LEAD)!.live = 'idle';
  await swarm.turnEnd!({ key: LEAD, agent: 'claude', status: 'idle', startedAt: 1, endedAt: 2, external: false }, deps);
  await sleep(2300);
  const [m] = delivered(LEAD);
  assert.ok(m, 'told after its turn');
  assert.match(m.text, /^\[Swarm board · 3 new posts\]/);
  assert.match(m.text, /“Small cases” \(claude:m2\) → you · question: Is n meant to be odd\?/);
  await tellLead(deps, LEAD);
  assert.equal(delivered(LEAD).length, 1, 'nothing new, nothing sent');
});

test('a message wakes a member that is not working; not one that works or was stopped', async () => {
  sessions.all.get('claude:m4')!.live = 'idle';
  const out = await call(LEAD, 'swarm_post', { text: 'Try the parity argument from Small cases.', to: 'claude:m4' });
  assert.match(out, /^Posted to “Four” \(claude:m4\) \(note\)\. It was not working: this wakes it\./);
  await sleep(50);
  const [w] = delivered('claude:m4');
  // With what else is new on the board for it, so its read mark skips nothing.
  assert.match(w.text, /^\[Swarm board · a message for you, and 2 other new posts\]\n- “Induction”.*\n- “Small cases”.*\n- the lead → you · note: Try the parity argument/);
  // Working: it reads it with swarm_read; nothing is sent.
  const busy = await call(LEAD, 'swarm_post', { text: 'Also check n=2.', to: A });
  assert.match(busy, /It is working: it sees this the next time it reads the board\./);
  await sleep(50);
  assert.equal(delivered(A).length, 0);
  // When its turn ends, what came for it while it worked wakes it.
  sessions.all.get(A)!.live = 'idle';
  await swarm.turnEnd!({ key: A, agent: 'claude', status: 'idle', startedAt: 1, endedAt: 2, external: false }, deps);
  await sleep(2300);
  assert.match(delivered(A).at(-1)!.text, /Also check n=2\./);
});

test('swarm_stop: the lead stops members still working; their cut-short turns send no report, messages no longer wake them', async () => {
  assert.match(await call(LEAD, 'swarm_stop', { key: 'claude:m4' }), /^Stopped 1 member\.$/);
  const out = await call(LEAD, 'swarm_stop', {});
  assert.match(out, /^Stopped 4 members \(2 of them were working\)\.$/);
  assert.deepEqual(sessions.interrupted.sort(), [B, C].sort());
  assert.ok(typeof sessionExtra(db, B).swarmStopped === 'number');
  await assert.rejects(call(A, 'swarm_stop', {}), /no swarm_stop/);
  // The interrupted turn of a stopped member: no report to the lead.
  sessions.all.get(B)!.items = [
    { kind: 'user', id: 'bu', seq: 1, ts: Date.now(), text: 'Search small cases by computer.' },
    { kind: 'assistant', id: 'ba', seq: 2, text: 'Got to n=60…' },
    { kind: 'turn', id: 'be', seq: 3, status: 'interrupted' },
  ];
  const before = delivered(LEAD).length;
  await reportTurn(deps, { key: B, startedAt: Date.now() - 1000, external: false });
  assert.equal(delivered(LEAD).length, before);
  const n = delivered('claude:m5').length;
  await call(LEAD, 'swarm_post', { text: 'Anyone there?', to: 'claude:m5' });
  await sleep(50);
  assert.equal(delivered('claude:m5').length, n, 'a stopped member is not woken');
  // Given more to do later (message_child), it is back in the swarm once that turn ends.
  await swarm.turnEnd!({ key: 'claude:m5', agent: 'claude', status: 'idle', startedAt: Date.now() + 10_000, endedAt: Date.now() + 20_000, external: false }, deps);
  assert.equal(sessionExtra(db, 'claude:m5').swarmStopped, undefined);
});

test('routes: the board of a lead only, and the user stopping members tells the lead', async () => {
  const routes = new Map<string, (req: any) => Promise<any>>();
  swarm.routes!({ ...deps, app: { get: (p: string, h: any) => routes.set(`GET ${p}`, h), post: (p: string, h: any) => routes.set(`POST ${p}`, h) } } as unknown as Deps);
  const b: SwarmBoard = await routes.get('GET /api/swarm/:key')!({ params: { key: LEAD } });
  assert.equal(b.size, 5);
  assert.deepEqual(b.members, [A, B, C, 'claude:m4', 'claude:m5']);
  assert.ok(b.stopped.includes(B) && !b.stopped.includes('claude:m5'));
  assert.ok(b.posts.length >= 5);
  await assert.rejects(routes.get('GET /api/swarm/:key')!({ params: { key: 'claude:solo' } }), (e: unknown) => e instanceof HttpError && e.status === 404);
  sessions.all.get('claude:m5')!.live = 'working';
  const r = await routes.get('POST /api/swarm/:key/stop')!({ params: { key: LEAD }, body: {} });
  assert.deepEqual(r, { stopped: ['claude:m5'] });
  assert.match(delivered(LEAD).at(-1)!.text, /^\[The user stopped the swarm member “Five” \(claude:m5\)\./);
  await assert.rejects(routes.get('POST /api/swarm/:key/stop')!({ params: { key: LEAD }, body: { member: 'claude:solo' } }), (e: unknown) => e instanceof HttpError && e.status === 404);
});

test('the setting: how many members of a swarm at once (Settings → Child sessions)', async () => {
  const routes = new Map<string, (req: any) => Promise<any>>();
  children.routes!({ ...deps, app: { get: (p: string, h: any) => routes.set(`GET ${p}`, h), put: (p: string, h: any) => routes.set(`PUT ${p}`, h) } } as unknown as Deps);
  assert.deepEqual(await routes.get('GET /api/children/settings')!({}), { maxRunning: 4, swarmSize: 5 });
  assert.deepEqual(await routes.get('PUT /api/children/settings')!({ body: { swarmSize: 8 } }), { maxRunning: 4, swarmSize: 8 });
  await assert.rejects(routes.get('PUT /api/children/settings')!({ body: { swarmSize: 17 } }), (e: unknown) => e instanceof HttpError && e.status === 400);
  assert.match((swarm.spawn!({ agent: 'claude', cwd: tmp, runId: 'y', resume: false, extra: { swarm: true } }, deps) as { instructions: string[] }).instructions[0], /up to 8 genuinely/);
});

test('posts are kept whole up to their limit, in order', () => {
  const p = addPost(db, { swarm: 'claude:other', from: 'claude:x', kind: 'note', text: 'hello' });
  assert.deepEqual(postsOf(db, 'claude:other'), [p]);
  assert.deepEqual(postsOf(db, 'claude:other', { after: p.id }), []);
});

// ---- a campaign: one big change in many parts ---------------------------------------------------------------

const CAMP = 'claude:camp';
sessions.add(CAMP, { agent: 'claude', live: 'working', title: 'Move every package to the new logger', prefs: { model: 'opus' } });
setSessionExtra(db, CAMP, { swarm: 'campaign' });
const campMembers: string[] = [];

test('a campaign: its lead and members are told their own instructions, with the swarm’s size', () => {
  assert.deepEqual(roleOf(db, { key: CAMP }), { role: 'lead', mode: 'campaign' });
  const lead = swarm.spawn!({ agent: 'claude', key: CAMP, cwd: tmp, runId: 'camp-run', resume: false, extra: { swarm: 'campaign' } }, deps) as { instructions: string[] };
  assert.match(lead.instructions[0], /^Campaign mode: you lead a campaign, one big change made in many parts/);
  assert.match(lead.instructions[0], /at most 8 at once/);
  assert.match(lead.instructions[0], /kind "plan", parts set to their names/);
  assert.match(lead.instructions[0], /one more try/);
  assert.match(lead.instructions[0], /Merge the finished parts’ branches/);
  const member = swarm.spawn!({ agent: 'claude', cwd: tmp, runId: 'camp-member', resume: false, extra: { parent: CAMP } }, deps) as { instructions: string[] };
  assert.equal(member.instructions[0], CAMPAIGN_MEMBER_INSTRUCTIONS);
  assert.deepEqual(roleOf(db, { runId: 'camp-member', key: 'claude:not-yet' }), { role: 'member', swarm: CAMP, mode: 'campaign' });
  noteRun('camp-member', null);
});

test('a campaign’s post tool takes a plan and parts; its members always get a worktree of their own', async () => {
  const post = swarm.tools!(ctxOf(CAMP)).find((t) => t.name === 'swarm_post')!;
  assert.deepEqual((post.inputSchema.properties as Record<string, { enum?: string[] }>).kind.enum, ['plan', 'progress', 'done', 'failed', 'finding', 'question', 'note']);
  assert.ok('part' in (post.inputSchema.properties as object) && 'parts' in (post.inputSchema.properties as object));
  assert.deepEqual(toolsOf(CAMP), ['start_child_session', 'child_sessions', 'message_child', 'swarm_post', 'swarm_read', 'swarm_stop']);
  for (const [title, brief] of [
    ['packages/api', 'Part packages/api: move its logging to the new logger. Run npm test -w api.'],
    ['packages/web', 'Part packages/web: the same.'],
    ['packages/cli', 'Part packages/cli: the same.'],
  ]) {
    const out = await call(CAMP, 'start_child_session', { brief, title });
    campMembers.push(/Started child session (\S+):/.exec(out)![1]);
    assert.equal(sessions.created.at(-1)!.worktree, true, 'a member works on a branch of its own');
  }
  assert.deepEqual(toolsOf(campMembers[0]), ['swarm_post', 'swarm_read'], 'a member starts no children');
});

test('the plan: the lead’s alone, short unique names; a part’s status waits for it and names one of its parts', async () => {
  const [api, web] = campMembers;
  await assert.rejects(call(api, 'swarm_post', { text: 'Starting', kind: 'progress', part: 'packages/api' }), /The lead has not posted the plan yet/);
  await assert.rejects(call(api, 'swarm_post', { text: 'My plan', kind: 'plan', parts: ['a'] }), /Only the lead posts the plan/);
  await assert.rejects(call(CAMP, 'swarm_post', { text: 'Plan', kind: 'plan', parts: ['packages/api', 'Packages/API'] }), /in the plan twice/);
  await assert.rejects(call(CAMP, 'swarm_post', { text: 'Plan', kind: 'plan', parts: [] }), /A plan needs its parts/);
  const out = await call(CAMP, 'swarm_post', { text: 'Shared code first.', kind: 'plan', parts: ['packages/core', '- packages/api', 'packages/web', 'packages/cli'] });
  assert.match(out, /^Posted to everyone \(plan, 4 parts\)\. In a campaign this wakes nobody/);
  assert.deepEqual(postsOf(db, CAMP).at(-1)!.parts, ['packages/core', 'packages/api', 'packages/web', 'packages/cli']);
  assert.deepEqual(
    partsOf(db, CAMP).map((p) => [p.name, p.status]),
    [
      ['packages/core', 'waiting'],
      ['packages/api', 'waiting'],
      ['packages/web', 'waiting'],
      ['packages/cli', 'waiting'],
    ],
  );
  await assert.rejects(call(api, 'swarm_post', { text: 'x', kind: 'progress', part: 'api' }), /There is no part "api" in the plan\. Did you mean "packages\/api"\?/);
  await assert.rejects(call(web, 'swarm_post', { text: 'Done', kind: 'done' }), /Say which part is done/);
});

test('posts about parts read back as parts: working, done with its member, failed and tried again', async () => {
  const [api, web, cli] = campMembers;
  await call(api, 'swarm_post', { text: 'Starting: 14 files use the old logger.', kind: 'progress', part: 'PACKAGES/API' });
  await call(web, 'swarm_post', { text: 'Starting.', kind: 'progress', part: 'packages/web' });
  await call(api, 'swarm_post', { text: 'Branch agent/api-1a2b: 14 files moved; npm test -w api passes.', kind: 'done', part: 'packages/api' });
  await call(cli, 'swarm_post', { text: 'The old logger is patched by a postinstall script; tests fail on import.', kind: 'failed', part: 'packages/cli' });
  const parts = partsOf(db, CAMP);
  assert.deepEqual(
    parts.map((p) => [p.name, p.status, p.member ?? null, p.tries]),
    [
      ['packages/core', 'waiting', null, 0],
      ['packages/api', 'done', api, 0],
      ['packages/web', 'working', web, 0],
      ['packages/cli', 'failed', cli, 1],
    ],
  );
  assert.match(parts[1].note!, /^Branch agent\/api-1a2b/);
  assert.deepEqual(partsTally(parts), { total: 4, waiting: 1, working: 1, done: 1, failed: 1 });
  // The lead retries the failed part; its new member's first post makes it working again.
  await call(CAMP, 'swarm_post', { text: 'Retrying cli: drop the postinstall patch first.', kind: 'note', part: 'packages/cli' });
  await call(cli, 'swarm_post', { text: 'Trying again without the patch.', kind: 'progress', part: 'packages/cli' });
  const cliNow = partsOf(db, CAMP)[3];
  assert.deepEqual([cliNow.status, cliNow.tries], ['working', 1]);
  // How the lead hears of it: each post with its part.
  assert.match(postsOf(db, CAMP).map((p) => p.part ?? '').join(','), /packages\/api,packages\/web,packages\/api,packages\/cli/);
});

test('a new plan keeps how kept parts stand, drops the others and adds new ones as waiting; the pages fold posts in the same way', async () => {
  await call(CAMP, 'swarm_post', { text: 'cli is split in two.', kind: 'plan', parts: ['packages/core', 'packages/api', 'packages/web', 'packages/cli-core', 'packages/cli-commands'] });
  const parts = partsOf(db, CAMP);
  assert.deepEqual(
    parts.map((p) => [p.name, p.status]),
    [
      ['packages/core', 'waiting'],
      ['packages/api', 'done'],
      ['packages/web', 'working'],
      ['packages/cli-core', 'waiting'],
      ['packages/cli-commands', 'waiting'],
    ],
  );
  // The pages start from the board's parts and fold in each post as it comes: the same as reading them all.
  const all = postsOf(db, CAMP);
  let folded = campaignParts([]);
  for (const p of all) folded = campaignParts([p], folded);
  assert.deepEqual(folded, campaignParts(all));
  assert.deepEqual(folded, parts);
  const extra: SwarmPost = { id: 9999, swarm: CAMP, from: campMembers[1], kind: 'done', text: 'web done', at: Date.now(), part: 'packages/web' };
  assert.equal(campaignParts([extra], parts)[2].status, 'done');
  assert.equal(parts[2].status, 'working', 'folding leaves the parts it started from as they were');
});

test('in a campaign, posts to everyone wake nobody; a message to one member wakes it', async () => {
  const [api, web] = campMembers;
  for (const k of campMembers) sessions.all.get(k)!.live = 'idle';
  const before = sessions.delivered.length;
  await call(CAMP, 'swarm_post', { text: 'Everyone: use log.child() for request ids.', kind: 'finding' });
  await sleep(50);
  assert.equal(sessions.delivered.length, before, 'no member was woken');
  // Nor at the end of a member's turn.
  await swarm.turnEnd!({ key: api, agent: 'claude', status: 'idle', startedAt: 1, endedAt: 2, external: false }, deps);
  await sleep(2300);
  assert.equal(delivered(api).length, 0);
  const out = await call(CAMP, 'swarm_post', { text: 'Bring your branch up to date with the merged core.', to: web });
  assert.match(out, /It was not working: this wakes it\./);
  await sleep(50);
  assert.match(delivered(web).at(-1)!.text, /^\[Swarm board · a message for you/);
  assert.match(delivered(web).at(-1)!.text, /Bring your branch up to date/);
});

test('swarm_read in a campaign: the lead every part, a member the count and its own part', async () => {
  const r = await call(CAMP, 'swarm_read', {});
  assert.match(r, /Parts \(5\): 1 done, 0 failed, 1 working, 3 waiting\./);
  assert.match(r, /- packages\/api · done · claude:m\d+ · Branch agent\/api-1a2b/);
  assert.match(r, /- packages\/cli-core · waiting/);
  const m = await call(campMembers[0], 'swarm_read', {});
  assert.match(m, /Parts \(5\): 1 done/);
  assert.match(m, /- packages\/api · done · you/);
  assert.doesNotMatch(m.split('\n\n')[1], /packages\/web/, 'a member sees its own part');
});

test('a campaign’s board: its kind and its parts beside the posts', async () => {
  const routes = new Map<string, (req: any) => Promise<any>>();
  swarm.routes!({ ...deps, app: { get: (p: string, h: any) => routes.set(`GET ${p}`, h), post: (p: string, h: any) => routes.set(`POST ${p}`, h) } } as unknown as Deps);
  const b: SwarmBoard = await routes.get('GET /api/swarm/:key')!({ params: { key: CAMP } });
  assert.equal(b.mode, 'campaign');
  assert.deepEqual(b.members, campMembers);
  assert.equal(b.parts!.length, 5);
  assert.equal(b.parts![1].status, 'done');
  assert.ok(b.posts.some((p) => p.kind === 'plan' && p.parts?.length === 5));
  const s: SwarmBoard = await routes.get('GET /api/swarm/:key')!({ params: { key: LEAD } });
  assert.equal(s.mode, 'swarm');
  assert.equal(s.parts, undefined);
  sessions.all.get(campMembers[2])!.live = 'working';
  await routes.get('POST /api/swarm/:key/stop')!({ params: { key: CAMP }, body: {} });
  assert.match(delivered(CAMP).at(-1)!.text, /^\[The user stopped the campaign member “packages\/cli”/);
});

// ---- run ---------------------------------------------------------------------------------------------

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
console.log(`${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit();
