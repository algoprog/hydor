// Script tests for the model arena: what a start page asks for, a match started beside the first session (the
// same prompt and folder, each model in a session of its own), keeping one answer (the others archived), and
// the ratings over decided matches. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/arena/arena-test.ts
//   DATA_DIR=/tmp/hydor-test-arena node dist/dev/arena-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { arenaOf, type ArenaMatch } from '../../shared/arena.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { sessionExtra } from '../sessionExtra.ts';
import type { CreateOpts } from '../sessions.ts';
import { arenaState, getMatch, pickWinner, standings, startMatch } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-arena-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const made: CreateOpts[] = [];
const flags = new Map<string, boolean>();
let n = 0;
const sessions = {
  async create(o: CreateOpts) {
    if (o.agent === 'acp' && o.acpAgent === 'broken') throw new Error('Broken is not installed here');
    made.push(o);
    const key = `${o.agent}:s${++n}`;
    db.prepare('insert or ignore into app_sessions (key, agent, created_at, updated_at, extra) values (?, ?, ?, ?, ?)').run(key, o.agent, Date.now(), Date.now(), JSON.stringify(o.extra ?? {}));
    return key;
  },
  setFlags: (key: string, f: { archived?: boolean }) => void flags.set(key, !!f.archived),
  queueSummary: () => {},
};
const toasts: string[] = [];
const d = { db, sessions, broadcast: (e: { t: string; text?: string }) => void (e.t === 'toast' && toasts.push(e.text ?? '')) } as unknown as Deps;

test('what the start page asks for: up to two more models, each an agent and maybe a model', () => {
  assert.equal(arenaOf({}), null);
  assert.equal(arenaOf({ arena: 'ar123' }), null);
  assert.deepEqual(arenaOf({ arena: { with: [{ agent: 'codex', model: 'gpt-x' }, { agent: 'acp', acpAgent: 'console', model: 'openrouter/q' }, { agent: 'claude' }] } }), [
    { agent: 'codex', model: 'gpt-x' },
    { agent: 'acp', acpAgent: 'console', model: 'openrouter/q' },
  ]);
  assert.equal(arenaOf({ arena: { with: [{ agent: 'nobody' }] } }), null);
});

let match: ArenaMatch;
test('a match: the same prompt, folder and settings to each model; one that cannot start is left out, with a word why', async () => {
  db.prepare('insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run('claude:main', 'claude', Date.now(), Date.now());
  const opts: CreateOpts = { agent: 'claude', cwd: tmp, prompt: 'Which is faster, A or B?', model: 'opus', effort: 'max', worktree: true, extra: { memory: false, arena: { with: [] } } };
  match = await startMatch(d, { key: 'claude:main', agent: 'claude', model: 'opus' }, opts, [{ agent: 'codex', model: 'gpt-x' }, { agent: 'acp', acpAgent: 'broken' }]);
  assert.equal(match.entries.length, 2);
  assert.deepEqual(match.entries.map((e) => e.agent), ['claude', 'codex']);
  assert.equal(made.length, 1);
  assert.equal(made[0].prompt, 'Which is faster, A or B?');
  assert.equal(made[0].cwd, tmp);
  assert.equal(made[0].worktree, true);
  assert.equal(made[0].model, 'gpt-x');
  // The first model's effort is its own; the others start with their own defaults.
  assert.equal(made[0].effort, undefined);
  assert.deepEqual(made[0].extra, { memory: false, arena: match.id });
  assert.equal(sessionExtra(db, 'claude:main').arena, match.id);
  assert.match(toasts[0], /Arena: Broken is not installed/);
  assert.equal(getMatch(db, match.id)?.prompt, 'Which is faster, A or B?');
});

test('keeping one answer: it wins, and the others are archived', () => {
  const m = pickWinner(d, match.id, match.entries[1].key);
  assert.equal(m.winner, match.entries[1].key);
  assert.equal(flags.get(match.entries[0].key), true);
  assert.equal(flags.get(match.entries[1].key), false);
  assert.throws(() => pickWinner(d, match.id, 'claude:stranger'), /not in this match/);
  const st = arenaState(db);
  assert.equal(st.matches.length, 1);
  assert.equal(st.board[0].agent, 'codex');
  assert.equal(st.board[0].wins, 1);
  assert.ok(st.board[0].rating > 1000 && st.board[1].rating < 1000);
});

test('ratings: a model that keeps winning rises; open matches do not count; a model is the same model across matches', () => {
  const e = (key: string, model: string) => ({ key, agent: 'claude' as const, model });
  const m = (i: number, entries: ReturnType<typeof e>[], winner?: string): ArenaMatch => ({ id: `m${i}`, prompt: '', createdAt: i, entries, ...(winner ? { winner, decidedAt: i } : {}) });
  const list = [
    m(1, [e('a1', 'opus'), e('b1', 'sonnet')], 'a1'),
    m(2, [e('a2', 'opus'), e('b2', 'sonnet'), e('c2', 'haiku')], 'a2'),
    m(3, [e('a3', 'opus'), e('c3', 'haiku')], 'c3'),
    m(4, [e('a4', 'opus'), e('b4', 'sonnet')]),
  ];
  const s = standings(list);
  assert.deepEqual(s.map((x) => x.model), ['opus', 'haiku', 'sonnet']);
  const opus = s.find((x) => x.model === 'opus')!;
  assert.equal(opus.wins, 2);
  assert.equal(opus.played, 3);
  assert.equal(s.find((x) => x.model === 'sonnet')!.played, 2);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
