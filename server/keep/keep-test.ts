// Script tests for keeping sessions: the app's own link to each transcript (one file under two names; put back
// when the original disappears; forgotten before the app deletes it), Claude Code told to keep its conversations
// where its settings say nothing, the clean-up of inactive sessions (the setting, and what it leaves alone), and
// Activity by agent (Custom by name) and by model. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/keep/keep-test.ts
//   DATA_DIR=/tmp/naget-test-keep node dist/dev/keep-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keepClaudeHistoryByDefault } from '../claudeHistory.ts';
import { agentRoots } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { forget, keep, keptPath, restore } from '../indexer/kept.ts';
import { computeStats } from '../stats.ts';
import { deleteInactive, inactiveSessions, retentionOf, setRetention } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-keep-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const DAY = 86_400_000;

test('a transcript is kept as the same file under a second name, and comes back when it is deleted', () => {
  const root = path.join(tmp, 'claude', 'projects');
  const file = path.join(root, '-home-u-work', 'aaaa.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"a":1}\n');
  const k = keptPath(file, [root], path.join(tmp, 'kept'))!;
  assert.ok(k.startsWith(path.join(tmp, 'kept')) && k.endsWith(path.join('-home-u-work', 'aaaa.jsonl')));
  assert.equal(keptPath('/elsewhere/x.jsonl', [root], path.join(tmp, 'kept')), null);
  keep(file, k);
  assert.equal(fs.statSync(k).ino, fs.statSync(file).ino, 'a hard link, no second copy');
  // What the agent appends shows in the kept one too.
  fs.appendFileSync(file, '{"b":2}\n');
  assert.equal(fs.readFileSync(k, 'utf8'), '{"a":1}\n{"b":2}\n');
  // A program that replaces the file (a new one under the same name) is kept again.
  fs.rmSync(file);
  fs.writeFileSync(file, '{"c":3}\n');
  keep(file, k);
  assert.equal(fs.readFileSync(k, 'utf8'), '{"c":3}\n');
  // Deleted by the agent's program: back it comes, the same file.
  fs.rmSync(file);
  assert.ok(restore(file, k));
  assert.equal(fs.readFileSync(file, 'utf8'), '{"c":3}\n');
  assert.equal(restore(file, k), false, 'nothing to do while it is there');
  // Deleted by the app: the kept one goes first, and nothing comes back.
  forget(k);
  fs.rmSync(file);
  assert.equal(restore(file, k), false);
  assert.equal(fs.existsSync(file), false);
});

test('Claude Code is told to keep its conversations where its settings say nothing; a value set stays', () => {
  const a = path.join(tmp, 'acct-a');
  const b = path.join(tmp, 'acct-b');
  const none = path.join(tmp, 'acct-none');
  fs.mkdirSync(a, { recursive: true });
  fs.mkdirSync(b, { recursive: true });
  fs.writeFileSync(path.join(a, 'settings.json'), JSON.stringify({ model: 'opus' }));
  fs.writeFileSync(path.join(b, 'settings.json'), JSON.stringify({ cleanupPeriodDays: 60 }));
  const was = agentRoots.claudeProjects;
  agentRoots.claudeProjects = [path.join(a, 'projects'), path.join(b, 'projects'), path.join(none, 'projects')];
  try {
    keepClaudeHistoryByDefault();
  } finally {
    agentRoots.claudeProjects = was;
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(a, 'settings.json'), 'utf8')), { model: 'opus', cleanupPeriodDays: 36500 });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(b, 'settings.json'), 'utf8')), { cleanupPeriodDays: 60 });
  assert.equal(fs.existsSync(none), false, 'no config folder made where Claude Code is not set up');
});

test('the setting: on, a year, until changed; the length within limits', () => {
  assert.deepEqual(retentionOf(db), { on: true, days: 365 });
  assert.deepEqual(setRetention(db, { days: 730 }), { on: true, days: 730 });
  assert.deepEqual(setRetention(db, { on: false }), { on: false, days: 730 });
  assert.throws(() => setRetention(db, { days: 5 }), /from 30 to 3650/);
  setRetention(db, { on: true, days: 365 });
});

test('inactive sessions go, the least recently used first; pinned, busy, snoozed or open ones stay; their numbers stay', async () => {
  const now = Date.UTC(2027, 5, 1);
  const old = now - 400 * DAY;
  const put = (key: string, at: number) => {
    db.prepare('insert into sessions (key, agent, id, path, cwd, model, updated_at) values (?, ?, ?, ?, ?, ?, ?)').run(key, key.split(':')[0], key.split(':')[1], `/x/${key}.jsonl`, '/home/u/old', 'gpt-5.5', at);
    db.prepare('insert into activity (key, root, agent, hour, prompts, tokens_out) values (?, ?, ?, ?, 2, 100)').run(key, key, key.split(':')[0], Math.floor(at / 3_600_000));
  };
  const flags: Record<string, Record<string, unknown>> = {
    'codex:old1': {},
    'claude:old2': {},
    'claude:pinned': { pinned: true },
    'claude:running': { live: { status: 'idle' } },
    'claude:snoozed': { snoozedUntil: now + DAY },
    'claude:pr': { pr: { state: 'open' } },
    'claude:new': {},
  };
  for (const k of Object.keys(flags)) put(k, k === 'claude:new' ? now - 10 * DAY : k === 'codex:old1' ? old - DAY : old);
  const removed: string[] = [];
  const d = {
    db,
    sessions: {
      summary: (k: string) => (flags[k] ? { key: k, updatedAt: (db.prepare('select updated_at as u from sessions where key = ?').get(k) as { u: number }).u, ...flags[k] } : null),
      remove: async (k: string, o: { keepActivity?: boolean }) => {
        assert.equal(o.keepActivity, true);
        removed.push(k);
        db.prepare('delete from sessions where key = ?').run(k);
      },
    },
  } as unknown as Deps;
  assert.deepEqual(inactiveSessions(d, now), ['codex:old1', 'claude:old2']);
  setRetention(db, { on: false });
  assert.deepEqual(inactiveSessions(d, now), [], 'off: nothing goes');
  setRetention(db, { on: true, days: 500 });
  assert.deepEqual(inactiveSessions(d, now), [], 'not inactive for that long yet');
  setRetention(db, { on: true, days: 365 });
  assert.equal(await deleteInactive(d, now), 2);
  assert.deepEqual(removed, ['codex:old1', 'claude:old2']);
  assert.equal((db.prepare("select count(*) as n from activity where key in ('codex:old1', 'claude:old2')").get() as { n: number }).n, 2, 'their numbers stay');
});

test('Activity: every agent by name, Custom among them; one agent alone; one model alone, with its sessions and prompts', () => {
  db.exec('delete from activity');
  const now = Date.now();
  const hour = Math.floor((now - 2 * 3_600_000) / 3_600_000);
  const row = (key: string, agent: string, prompts: number, out: number) =>
    db.prepare('insert into activity (key, root, agent, hour, prompts, tokens_out) values (?, ?, ?, ?, ?, ?)').run(key, key, agent, hour, prompts, out);
  const session = (key: string, model: string, acp?: string) => {
    db.prepare('insert or replace into sessions (key, agent, id, path, cwd, model, updated_at) values (?, ?, ?, ?, ?, ?, ?)').run(key, key.split(':')[0], key.split(':')[1], `/x/${key}`, '/home/u/p', model, now);
    if (acp) db.prepare('insert or replace into app_sessions (key, agent, acp_agent, created_at, updated_at) values (?, ?, ?, ?, ?)').run(key, 'acp', acp, now, now);
  };
  session('claude:c1', 'claude-opus-5-5');
  session('codex:x1', 'gpt-5.5');
  session('acp:m1', 'openrouter/deepseek/deepseek-v4-flash', 'console');
  session('acp:m2', 'openrouter/deepseek/deepseek-v4-flash', 'console');
  session('acp:g1', 'gemini-3-pro', 'gemini');
  row('claude:c1', 'claude', 3, 300);
  row('codex:x1', 'codex', 2, 200);
  row('acp:m1', 'acp', 1, 50);
  row('acp:m2', 'acp', 4, 70);
  row('acp:g1', 'acp', 1, 10);
  const all = computeStats(db, { granularity: 'day', tz: 'UTC' });
  assert.deepEqual(
    all.agents.map((a) => [a.id, a.name, a.sessions, a.prompts]),
    [
      ['claude', 'Claude Code', 1, 3],
      ['codex', 'Codex', 1, 2],
      ['acp:console', 'Custom', 2, 5],
      ['acp:gemini', 'Gemini CLI', 1, 1],
    ],
  );
  const custom = computeStats(db, { granularity: 'day', tz: 'UTC', agent: 'acp:console' });
  assert.equal(custom.totals.prompts, 5);
  assert.equal(custom.totals.sessions, 2);
  const m = custom.byModel.find((x) => x.model === 'openrouter/deepseek/deepseek-v4-flash')!;
  assert.deepEqual([m.sessions, m.prompts, m.tokensOut], [2, 5, 120]);
  const one = computeStats(db, { granularity: 'day', tz: 'UTC', model: 'gpt-5.5' });
  assert.equal(one.model, 'gpt-5.5');
  assert.equal(one.totals.prompts, 2);
  assert.deepEqual(
    one.agents.map((a) => a.id),
    ['codex'],
  );
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n${(e as Error).stack ?? e}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
