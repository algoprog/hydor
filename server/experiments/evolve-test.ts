// Checks for Evolve: the rules of the search on their own (replies read and applied, the parent's tournament under the
// seeded source, migration between islands, the bandit's strong model at least once in ten, branch names); what a
// spec may say, in plain words; whole evolutions end to end through tmux, with a stand-in for the model and a tiny
// shell scorer (no GPU): the start scored first, a run to its limit with the best and its gain, replies that do not
// parse or apply, a version already tried, a protected file, a failing run's log, the cheap-then-full rule; a restart
// in the middle; pause and resume, a refused score pausing it, its hours, a stall and stop; taking the best onto a
// branch (twice); deleting; the evaluation's own lists without its scores; the routes' rules for agents, the tools,
// and every route in the guide's API topic.
// Build and run with a scratch data folder (no GPU is used):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/experiments/evolve-test.ts
//   DATA_DIR=/tmp/hydor-test-evolve CUDA_VISIBLE_DEVICES= node dist/dev/evolve-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { Evaluation } from '../../shared/evaluations.ts';
import type { Candidate, Evolution } from '../../shared/evolve.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { ruleFor } from '../guide/api.ts';
import { internalHeaders } from '../internal.ts';
import { createEvaluation, getScore, listed, listScores, startScore, waitScore } from './evaluations.ts';
import { applyBlocks, candidatesOf, EVOLVE_ROOT, getEvolution, haltEvolutions, migrate, parseReply, pickModel, pickParent, random, resumeEvolutions, slugOf, stopEvolution, useEvolveDeps, type EvolveAsk } from './evolve.ts';
import { experiments } from './index.ts';
import { stopTmuxServer } from './local.ts';
import { forgetNotices, setSettings, tick, useDeps } from './queue.ts';
import { getRun } from './records.ts';
import { experimentTools, SPAWN_NOTE } from './tools.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
if (process.env.CUDA_VISIBLE_DEVICES !== '') {
  console.error('Run with CUDA_VISIBLE_DEVICES= (empty): these tests never use a GPU.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-evolve-test-')));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const near = (a: number | undefined, b: number, what = '') => assert.ok(a !== undefined && Math.abs(a - b) < 1e-9, `${what} ${a} ≈ ${b}`);

class Sessions extends EventEmitter {
  mode = 'default';
  answer: string | null = 'accept';
  cards: { title: string; detail?: string; options: { id: string; label: string }[] }[] = [];
  summary() {
    return null;
  }
  async deliverOrQueue() {}
  adapterByRun(_runId: string) {
    return {
      state: { mode: this.mode },
      ask: async (card: Sessions['cards'][number]) => {
        this.cards.push(card);
        return this.answer ? { decision: this.answer } : null;
      },
    };
  }
}
const sessions = new Sessions();
const told: any[] = [];

const http = Fastify();
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const deps = { app: http, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: (e: unknown) => told.push(e), toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
experiments.routes!(deps);
useDeps(deps);
await http.ready();
setSettings(db, { cpuSlots: 8 });
// The queue is stepped often, so the tiny runs end quickly.
const ticker = setInterval(() => void tick(), 100);

type Reply = { status: number; body: any };
async function call(method: string, url: string, body?: unknown, agent = false): Promise<Reply> {
  const r = await http.inject({ method: method as 'GET', url, headers: { ...(agent ? internalHeaders() : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, payload: body ? JSON.stringify(body) : undefined });
  return { status: r.statusCode, body: r.json() };
}

async function until(fn: () => boolean, ms = 60_000, what = 'it') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(100);
  }
  assert.fail(`timed out waiting for ${what}`);
}
const evo = (id: string) => getEvolution(db, id)!;
const cands = (id: string) => candidatesOf(db, id);
const OVER = ['done', 'stopped', 'failed'];
const over = async (id: string, ms = 120_000) => {
  await until(() => OVER.includes(evo(id).status), ms, `evolution ${id}`);
  return evo(id);
};
const byN = (id: string, n: number) => cands(id).find((c) => c.n === n)!;
/** The scores an evolution asked for, by candidate ('start' for the start's). */
const scoresBy = (id: string) => {
  const out = new Map<string, string[]>();
  for (const r of db.prepare('select id, info from exp_scores order by created_at, id').all() as { id: string; info: string }[]) {
    const by = JSON.parse(r.info).by;
    if (by?.who !== 'evolve' || by.evolution !== id) continue;
    out.set(by.candidate, [...(out.get(by.candidate) ?? []), r.id]);
  }
  return out;
};

const write = (file: string, body: string | Buffer) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};
const gitIn = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...a], { cwd, stdio: 'pipe' }).toString();

// A project: the scorer reads X from model.sh (what Evolve changes) and the reference data git does not track; the
// score is highest at X = 7, and each seed adds a thousandth.
const repo = path.join(tmp, 'repo');
const SCORER = [
  '. ./model.sh',
  'test -f data/ref.txt || { echo "no reference data"; exit 7; }',
  'if [ "$X" = boom ]; then echo "it went boom"; exit 3; fi',
  `awk -v x="$X" -v s="$1" 'BEGIN { printf "score=%.4f\\n", 100 - (x - 7) * (x - 7) + s / 1000 }'`,
  '',
].join('\n');
write(path.join(repo, 'eval.sh'), SCORER);
write(path.join(repo, 'model.sh'), 'X=3\n');
write(path.join(repo, 'notes.txt'), 'notes\n');
write(path.join(repo, 'big.txt'), 'x'.repeat(250 * 1024));
write(path.join(repo, 'bin.dat'), Buffer.from([1, 0, 2, 3]));
write(path.join(repo, 'sub', 'keep.txt'), 'k\n');
write(path.join(repo, '.gitignore'), 'data/\n');
write(path.join(repo, 'data', 'ref.txt'), 'reference\n');
gitIn(repo, 'init', '-q', '-b', 'main');
gitIn(repo, 'config', 'user.email', 't@example.com');
gitIn(repo, 'config', 'user.name', 'T');
gitIn(repo, 'add', '.');
gitIn(repo, 'commit', '-q', '-m', 'first');
const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
const other = path.join(tmp, 'other');
write(path.join(other, 'model.sh'), 'X=3\n');
gitIn(other, 'init', '-q', '-b', 'main');
gitIn(other, 'add', '.');
gitIn(other, 'commit', '-q', '-m', 'other');
const plainDir = path.join(tmp, 'plain');
write(path.join(plainDir, 'model.sh'), 'X=3\n');

let ev: Evaluation;

// ---- the model's stand-in ---------------------------------------------------------------------------------------

const prompts: EvolveAsk[] = [];
let answer: (q: EvolveAsk, i: number) => string | Promise<string> = () => 'nothing';
let calls = 0;
let clock = 0;
useEvolveDeps({
  ask: async (_db, q) => {
    prompts.push(q);
    return answer(q, calls++);
  },
  now: () => Date.now() + clock,
  seed: () => 7,
});
const reply = (from: string, to: string, summary = `X to ${to}`) => `SUMMARY: ${summary}\n=== model.sh\n<<<<<<< SEARCH\nX=${from}\n=======\nX=${to}\n>>>>>>> REPLACE\n`;
/** The parent's X, as the prompt shows its model.sh. */
const parentX = (prompt: string) => /=== model\.sh\n`{3,}\w*\nX=(\S+)/.exec(prompt)![1];
/** Waits `ms`, or fails when the call is stopped. */
const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('stopped'));
      },
      { once: true },
    );
  });

const start = async (body: Record<string, unknown>, agent = false): Promise<Evolution> => {
  const r = await call('POST', '/api/experiments/evolutions', { evaluation: ev.id, ...body }, agent);
  assert.equal(r.status, 200, r.body.error);
  return r.body.evolution;
};

// ---- the rules on their own -----------------------------------------------------------------------------------

test('a reply is read: its summary and its blocks, or what is wrong with it', () => {
  const ok = parseReply('Here you go.\nSUMMARY: Raise X.\n```\n=== ./model.sh\n<<<<<<< SEARCH\nX=3\n=======\nX=4\n>>>>>>> REPLACE\n```\n');
  assert.ok(!('error' in ok));
  assert.equal(ok.summary, 'Raise X.');
  assert.deepEqual(ok.blocks, [{ path: 'model.sh', search: 'X=3', replace: 'X=4' }]);
  const bad = (text: string, words: RegExp) => {
    const r = parseReply(text);
    assert.ok('error' in r && words.test(r.error), JSON.stringify(r));
  };
  bad('I would rather not.', /no SEARCH\/REPLACE blocks/);
  bad('<<<<<<< SEARCH\nX=3\n=======\nX=4\n>>>>>>> REPLACE', /before any "=== path"/);
  bad('=== model.sh\n<<<<<<< SEARCH\nX=3\n=======\nX=4\n', /not closed/);
  assert.equal((parseReply('=== a\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE') as { summary: string }).summary, 'No summary given');
});

test('blocks apply only to the files it may change, each search matching one place', () => {
  const files = new Map([['m.py', 'a = 1\nb = 2  \nc = 3\nb = 2\n']]);
  const prot = (p: string) => p === 'eval.py';
  const one = applyBlocks(files, [{ path: 'm.py', search: 'a = 1', replace: 'a = 5' }], { protectedFile: prot });
  assert.ok('files' in one && one.files.get('m.py')!.startsWith('a = 5\n'));
  assert.deepEqual(files.get('m.py'), 'a = 1\nb = 2  \nc = 3\nb = 2\n', 'the parent is left as it was');
  const err = (blocks: { path: string; search: string; replace: string }[], words: RegExp) => {
    const r = applyBlocks(files, blocks, { protectedFile: prot });
    assert.ok('error' in r && words.test(r.error), JSON.stringify(r));
    return r;
  };
  err([{ path: 'm.py', search: 'b = 2', replace: 'x' }], /matches 2 places/);
  err([{ path: 'm.py', search: 'z = 9', replace: 'x' }], /is not in the file/);
  err([{ path: 'm.py', search: '  ', replace: 'x' }], /was empty/);
  err([{ path: 'other.py', search: 'a', replace: 'b' }], /not one of the files it may change \(m\.py\)/);
  assert.equal((err([{ path: 'eval.py', search: 'a', replace: 'b' }], /which the evaluation protects/) as { protected?: string }).protected, 'eval.py');
  // Spaces at a line's end that differ still match; an empty replacement takes its line's end.
  const loose = applyBlocks(files, [{ path: 'm.py', search: 'b = 2\nc = 3', replace: 'bc' }], { protectedFile: prot });
  assert.ok('files' in loose && loose.files.get('m.py') === 'a = 1\nbc\nb = 2\n', JSON.stringify(loose));
  const gone = applyBlocks(files, [{ path: 'm.py', search: 'a = 1', replace: '' }], { protectedFile: prot });
  assert.ok('files' in gone && gone.files.get('m.py')!.startsWith('b = 2'));
});

test('the parent: the island’s best by chance, else a tournament of two among its best few, under the seeded source', () => {
  // The random source is pinned: the same seed always gives the same numbers.
  const seq: number[] = [];
  for (let s = 7, i = 0; i < 4; i++) {
    const [u, next] = random(s);
    seq.push(Number(u.toFixed(6)));
    s = next;
  }
  assert.deepEqual(seq, SEED7);
  const pool = [
    { n: 0, value: 50 },
    { id: 'a', n: 1, value: 60 },
    { id: 'b', n: 2, value: 70 },
    { id: 'c', n: 3, value: 40 },
    { id: 'd', n: 4, value: 65 },
    { id: 'e', n: 5, value: 55 },
    { id: 'f', n: 6, value: 30 },
  ];
  const best = { id: 'b', n: 2, value: 70 };
  assert.equal(pickParent(pool, best, 1, [0.1, 0.9, 0.9]).id, 'b', 'the best by chance');
  // Higher is better: the best five are b, d, a, e, the start; draws 0.5 and 0.85 pick a (third) and the start (fifth).
  assert.equal(pickParent(pool, best, 1, [0.5, 0.5, 0.85]).id, 'a');
  assert.equal(pickParent(pool, best, 1, [0.5, 0.85, 0.85]).id, undefined, 'the start can be drawn');
  // Lower is better: f, c, the start, e, a; draws 0.2 and 0.5 pick c and the start.
  assert.equal(pickParent(pool, { n: 6, id: 'f', value: 30 }, -1, [0.5, 0.2, 0.5]).id, 'c');
  assert.equal(pickParent([{ n: 0, value: 1 }], { n: 0, value: 1 }, 1, [0.9, 0.3, 0.7]).id, undefined, 'only the start');
});

test('migration: after every 15, each island’s best is offered to the next, the latest 5 kept', () => {
  const none = [[], [], []];
  assert.equal(migrate(15, ['a', 'b', 'c'], none), none, 'not yet');
  assert.deepEqual(migrate(16, ['a', undefined, 'c'], none), [['c'], ['a'], []], 'the start does not migrate');
  assert.deepEqual(migrate(31, ['a', 'b', 'c'], [['c'], ['a'], []]), [['c'], ['a'], ['b']], 'offered once');
  assert.deepEqual(migrate(16, ['x', 'y'], [['1', '2', '3', '4', '5'], []]), [['1', '2', '3', '4', '5', 'y'].slice(-5), ['x']]);
});

test('the model: quick unless the bound says strong, and strong at least once in every ten', () => {
  const q = (won = false) => ({ model: 'quick' as const, ended: true, won });
  const s = (won = false) => ({ model: 'strong' as const, ended: true, won });
  assert.equal(pickModel([]), 'quick');
  assert.equal(pickModel(Array.from({ length: 8 }, () => q(true))), 'quick');
  assert.equal(pickModel(Array.from({ length: 9 }, () => q(true))), 'strong', 'nine quick in a row');
  // Strong was among the last nine, and quick's became islands' bests far more often: quick.
  assert.equal(pickModel([s(), ...Array.from({ length: 8 }, () => q(true))]), 'quick');
  // Strong's always did, quick's never: strong.
  assert.equal(pickModel([s(true), s(true), q(), q(), q()]), 'strong');
  // Neither won: the one tried less is tried (the bound's width).
  assert.equal(pickModel([s(), ...Array.from({ length: 8 }, () => q())]), 'strong');
  // Any ten in a row hold a strong one.
  const run: { model: Candidate['model']; ended: boolean; won: boolean }[] = [];
  for (let i = 0; i < 60; i++) run.push({ model: pickModel(run), ended: true, won: i % 3 === 0 });
  for (let i = 0; i + 10 <= run.length; i++) assert.ok(run.slice(i, i + 10).some((c) => c.model === 'strong'), `window ${i}`);
});

test('a branch is named from the aim, else from the files', () => {
  assert.equal(slugOf({ aim: 'Make the sorting faster for big lists', files: ['a.py'] }), 'sorting-faster-big-lists');
  assert.equal(slugOf({ files: ['src/heuristic.py', 'lib/Rank Score.ts'] }), 'heuristic-rank-score');
  assert.equal(slugOf({ aim: 'το καλύτερο', files: ['ü.py'] }), 'u');
  assert.equal(slugOf({ aim: '!!!', files: ['---.py'] }), 'files');
});

// ---- a spec, checked ----------------------------------------------------------------------------------------------

test('an evolution needs an evaluation with a baseline, and files it may change, in plain words', async () => {
  ev = await createEvaluation(deps, { name: 'Score', cwd: repo, command: 'sh eval.sh {seed}', metric: 'score', better: 'higher', protect: ['eval.sh', 'data/'], gpus: 0 });
  const bad = async (body: Record<string, unknown>, words: RegExp, status = 400) => {
    const r = await call('POST', '/api/experiments/evolutions', { evaluation: ev.id, files: ['model.sh'], ...body });
    assert.equal(r.status, status, `${JSON.stringify(body)}: ${r.body.error}`);
    assert.match(r.body.error, words);
  };
  await bad({}, /has no baseline yet: measure it first/);
  const base = await startScore(deps, ev.id, { kind: 'baseline', by: { who: 'you' } });
  const b = await waitScore(deps, base.id, 60_000);
  assert.equal(b?.status, 'done', b?.why);
  await bad({ evaluation: '' }, /Which evaluation/);
  await bad({ evaluation: 'e1nothing' }, /no such evaluation/, 404);
  await bad({ files: ['eval.sh'] }, /eval\.sh is protected by the evaluation “Score”/);
  await bad({ files: ['data/ref.txt'] }, /protected by the evaluation/);
  await bad({ files: [] }, /Name 1 to 8 files/);
  await bad({ files: Array.from({ length: 9 }, (_, i) => `f${i}`) }, /Name 1 to 8 files/);
  await bad({ files: ['../other/model.sh'] }, /not a file inside the folder/);
  await bad({ files: ['nope.sh'] }, /nope\.sh is not there/);
  await bad({ files: ['sub'] }, /is a folder/);
  await bad({ files: ['big.txt'] }, /more than 200 KB/);
  await bad({ files: ['bin.dat'] }, /not a text file/);
  write(path.join(repo, 'new.sh'), 'echo new\n');
  await bad({ files: ['new.sh'] }, /new\.sh is not committed: commit it first/);
  fs.rmSync(path.join(repo, 'new.sh'));
  write(path.join(repo, 'notes.txt'), 'changed\n');
  await bad({ files: ['notes.txt'] }, /notes\.txt has changes that are not committed/);
  write(path.join(repo, 'notes.txt'), 'notes\n');
  await bad({ candidates: 5 }, /Candidates: a whole number from 10 to 2000/);
  await bad({ atOnce: 5 }, /At once: a whole number from 1 to 4/);
  await bad({ aim: 'x'.repeat(2001) }, /at most 2,000 characters/);
  await bad({ from: other }, /another git repository/);
  await bad({ from: plainDir }, /not in a git repository/);
  assert.equal(fs.existsSync(EVOLVE_ROOT) ? fs.readdirSync(EVOLVE_ROOT).length : 0, 0, 'nothing was made');
});

test('it suggests the files the scorer names that it does not protect', async () => {
  const r = await call('GET', `/api/experiments/evolutions/suggest?evaluation=${ev.id}`);
  assert.equal(r.status, 200, r.body.error);
  assert.deepEqual(r.body.files, ['model.sh']);
  assert.equal((await call('GET', '/api/experiments/evolutions/suggest')).status, 400);
});

// ---- a whole evolution ---------------------------------------------------------------------------------------------

/** What the model says, call by call, for the first evolution (one at a time, so in this order). */
const SCRIPT: ((x: string) => string)[] = [
  (x) => reply(x, '4'), // #1: better
  () => 'I would rather not.', // #2: no blocks…
  (x) => reply(x, '5'), // …then better still
  () => reply('99', '6'), // #3: not in the file, twice
  () => reply('99', '6'),
  (x) => reply(x, '5'), // #4: the same version as #2
  () => `SUMMARY: an easier scorer\n=== eval.sh\n<<<<<<< SEARCH\n. ./model.sh\n=======\necho score=1000; exit 0\n>>>>>>> REPLACE\n`, // #5: protected, twice
  () => `SUMMARY: an easier scorer\n=== eval.sh\n<<<<<<< SEARCH\n. ./model.sh\n=======\necho score=1000; exit 0\n>>>>>>> REPLACE\n`,
  (x) => reply(x, 'boom'), // #6: its run fails
  (x) => reply(x, '6'), // #7: better
  (x) => reply(x, '2'), // #8: worse on the first seed: not scored on all
  (x) => reply(x, '8'), // #9: only as good as its island's best on the first seed: not scored on all
  (x) => reply(x, '7'), // #10: the best
];

let first: Evolution;

test('a whole evolution: the start scored first, then each change, to its limit, with the best and its gain', async () => {
  prompts.length = 0;
  calls = 0;
  answer = (q, i) => SCRIPT[i](parentX(q.prompt));
  const started = await start({ files: ['model.sh'], aim: 'Find the best X', candidates: 10, atOnce: 1, stallAfter: 0 });
  assert.equal(started.status, 'starting');
  assert.equal(started.startCommit, head);
  assert.equal(started.branch, 'main');
  assert.deepEqual([started.files, started.candidates, started.atOnce, started.stallAfter, started.by.who], [['model.sh'], 10, 1, 0, 'you']);
  first = await over(started.id);
  assert.equal(first.status, 'done', first.why);
  assert.equal(first.why, '10 tried');
  assert.deepEqual([first.tried, first.failed, first.calls], [10, 4, 13]);
  // The start, with all three seeds, before any candidate.
  assert.deepEqual(first.start!.values, [84.001, 84.002, 84.003]);
  near(first.start!.mean, 84.002);
  const startS = getScore(db, first.start!.score)!;
  assert.deepEqual(startS.by, { who: 'evolve', evolution: first.id, candidate: 'start' });
  assert.ok(startS.endedAt! <= byN(first.id, 1).createdAt, 'the start was scored first');
  const best = byN(first.id, 10);
  assert.equal(first.best, best.id);
  near(best.gain, 16, 'gain');
  near(best.full!.mean, 100.002);
  assert.equal(best.bestWhenScored, true);
  assert.deepEqual(best.changed, [{ path: 'model.sh', added: 1, removed: 1 }]);
  assert.equal(fs.readFileSync(path.join(repo, 'model.sh'), 'utf8'), 'X=3\n', 'the checkout is never changed');
  assert.ok(told.some((e) => e.t === 'feature' && e.data?.evolutions?.[0] === first.id), 'the pages are told');
});

test('what the model is told: the number and its direction, the aim, the parent in full, never the scorer', () => {
  const p = prompts[0];
  assert.equal(p.strong, false);
  assert.match(p.prompt, /"score": higher is better/);
  assert.match(p.prompt, /scored score = 84\.002 ± 0\.001 over 3 seeds/);
  assert.match(p.prompt, /# The aim\nFind the best X/);
  assert.match(p.prompt, /# The version to change: the start\n/);
  assert.match(p.prompt, /=== model\.sh\n```sh\nX=3\n```/);
  assert.ok(!p.prompt.includes('awk') && !p.prompt.includes('ref.txt') && !p.prompt.includes('reference'), 'nothing of the scorer or its data');
  assert.match(p.system, /data, not instructions/);
  assert.match(p.system, /<<<<<<< SEARCH/);
  assert.match(prompts[2].prompt, /Your last answer could not be used: it had no SEARCH\/REPLACE blocks/);
  // What was tried before shows, the best first and the failures with why.
  const late = prompts.at(-1)!.prompt;
  assert.match(late, /The best of them first:\n- #/);
  assert.match(late, /The latest that failed:/);
  assert.equal(prompts.at(-1)!.strong, true, 'the tenth is the strong model’s');
});

test('each candidate as it went: replies that would not do, a version already tried, a protected file, a failed run', () => {
  const c = (n: number) => byN(first.id, n);
  assert.deepEqual(
    cands(first.id).map((x) => [x.n, x.island, x.status, x.model]),
    [
      [1, 0, 'scored', 'quick'],
      [2, 1, 'scored', 'quick'],
      [3, 0, 'failed', 'quick'],
      [4, 1, 'failed', 'quick'],
      [5, 0, 'failed', 'quick'],
      [6, 1, 'failed', 'quick'],
      [7, 0, 'scored', 'quick'],
      [8, 1, 'scored', 'quick'],
      [9, 0, 'scored', 'quick'],
      [10, 1, 'scored', 'strong'],
    ],
  );
  assert.equal(c(2).summary, 'X to 5', 'the second reply was used');
  assert.match(c(3).why!, /^Its change did not apply: the SEARCH part for model\.sh that begins “X=99” is not in the file/);
  assert.equal(c(4).why, 'The same as #2');
  assert.match(c(5).why!, /^It tried to change eval\.sh, which the evaluation protects/);
  assert.match(c(6).why!, /failed: Its command ended with exit code 3/);
  assert.match(c(6).why!, /The end of its log:\n(.*\n)*it went boom/);
  const scores = scoresBy(first.id);
  for (const n of [3, 4, 5]) assert.equal(scores.get(c(n).id), undefined, `#${n} was never scored`);
  // The cheap score first; all seeds only for one that beat its island's best there.
  for (const n of [1, 2, 7, 10]) {
    assert.ok(c(n).quick && c(n).full, `#${n} was scored on all seeds`);
    assert.equal(c(n).full!.values.length, 3);
    assert.equal(scores.get(c(n).id)!.length, 2);
  }
  for (const n of [8, 9]) {
    assert.ok(c(n).quick && !c(n).full, `#${n} only on the first seed`);
    assert.equal(scores.get(c(n).id)!.length, 1);
  }
  near(c(8).gain, 75.001 - 84.001, 'gain by the first seed');
  near(c(9).quick!.value, 99.001);
  assert.deepEqual(
    [1, 2, 7, 10].map((n) => [c(n).islandBest, c(n).bestWhenScored]),
    [
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ],
  );
  // Parents come from their own island (or the start), as the seeded source drew them.
  for (const x of cands(first.id)) if (x.parent) assert.equal(cands(first.id).find((p) => p.id === x.parent)!.island, x.island, `#${x.n}`);
  assert.deepEqual(
    cands(first.id).map((x) => (x.parent ? cands(first.id).find((p) => p.id === x.parent)!.n : 0)),
    PARENTS,
  );
});

test('a candidate is read with its diff against the start and its scores', async () => {
  const best = byN(first.id, 10);
  const r = await call('GET', `/api/experiments/evolutions/${first.id}/candidates/${best.id}`);
  assert.equal(r.status, 200, r.body.error);
  assert.deepEqual(r.body.candidate.diff, [{ path: 'model.sh', diff: '--- start/model.sh\n+++ candidate/model.sh\n@@ -1 +1 @@\n-X=3\n+X=7' }]);
  assert.deepEqual(r.body.candidate.scores, [best.quick!.score, best.full!.score]);
  const one = (await call('GET', `/api/experiments/evolutions/${first.id}`)).body;
  assert.deepEqual(one.evaluation, { id: ev.id, name: 'Score', metric: 'score', better: 'higher' });
  assert.deepEqual(
    one.candidates.map((x: Candidate) => x.n),
    [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  );
  assert.equal((await call('GET', `/api/experiments/evolutions/${first.id}/candidates/k1nothing`)).status, 404);
  assert.deepEqual(
    (await call('GET', `/api/experiments/evolutions?evaluation=${ev.id}`)).body.evolutions.map((x: Evolution) => x.id),
    [first.id],
  );
});

test('scores an evolution asked for stay out of the evaluation’s own lists, unless asked for', async () => {
  const mine = (await call('GET', `/api/experiments/evaluations/${ev.id}`)).body.scores;
  assert.ok(mine.length >= 1);
  assert.ok(mine.every((s: { by: { who: string } }) => s.by.who !== 'evolve'));
  const all = (await call('GET', `/api/experiments/evaluations/${ev.id}?evolve=1`)).body.scores;
  assert.ok(all.filter((s: { by: { who: string } }) => s.by.who === 'evolve').length >= 10);
  assert.ok(listScores(db, ev.id, ['score']).every((s) => s.by.who !== 'evolve'));
  assert.notEqual(listed(db, ev).last?.by.who, 'evolve');
  const got = JSON.parse((await tool('evaluation_get', {})).text);
  assert.ok(got.evaluations[0].scores.every((s: { id: string }) => getScore(db, s.id)!.by.who !== 'evolve'));
  // The app's own worktrees are not among the evaluation's folders.
  const folders = (await call('GET', `/api/experiments/evaluations/${ev.id}`)).body.folders;
  assert.ok(!folders.some((f: { path: string }) => f.path.startsWith(EVOLVE_ROOT)));
});

test('take the best: a branch at the start with one commit of its files; the checkout untouched; again on the same branch', async () => {
  const status = gitIn(repo, 'status', '--porcelain');
  const taken = await call('POST', `/api/experiments/evolutions/${first.id}/take`, {});
  assert.equal(taken.status, 200, taken.body.error);
  const branch = `evolve/find-best-x-${first.id.slice(-4)}`;
  assert.equal(taken.body.branch, branch);
  assert.equal(gitIn(repo, 'rev-list', '--count', `${head}..${branch}`).trim(), '1');
  assert.equal(gitIn(repo, 'rev-parse', `${branch}^`).trim(), head);
  assert.equal(gitIn(repo, 'show', `${branch}:model.sh`), 'X=7\n');
  assert.equal(gitIn(repo, 'show', `${branch}:eval.sh`), SCORER, 'everything else as at the start');
  const message = gitIn(repo, 'log', '-1', '--format=%B', branch);
  assert.match(message, /^Evolve: X to 7\n\nEvaluation: Score \(score, higher is better\)\nscore: 100\.002 ± 0\.001 over 3 seeds; the start: 84\.002 ± 0\.001; \+16\n/);
  assert.equal(gitIn(repo, 'log', '-1', '--format=%an', branch).trim(), 'T');
  // Nothing checked out moved.
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD').trim(), head);
  assert.equal(gitIn(repo, 'symbolic-ref', '--short', 'HEAD').trim(), 'main');
  assert.equal(gitIn(repo, 'status', '--porcelain'), status);
  assert.equal(fs.readFileSync(path.join(repo, 'model.sh'), 'utf8'), 'X=3\n');
  // The same best again: nothing new. Another candidate: a new commit on the same branch.
  assert.deepEqual((await call('POST', `/api/experiments/evolutions/${first.id}/take`, {})).body, taken.body);
  const seventh = byN(first.id, 7);
  const again = (await call('POST', `/api/experiments/evolutions/${first.id}/take`, { candidate: seventh.id })).body;
  assert.equal(again.branch, branch);
  assert.equal(gitIn(repo, 'rev-parse', `${again.commit}^`).trim(), taken.body.commit);
  assert.equal(gitIn(repo, 'show', `${branch}:model.sh`), 'X=6\n');
  assert.deepEqual(evo(first.id).taken!.candidate, seventh.id);
  // A branch checked out somewhere is left alone: the next name.
  const look = path.join(tmp, 'look');
  gitIn(repo, 'worktree', 'add', '-q', look, branch);
  const third = (await call('POST', `/api/experiments/evolutions/${first.id}/take`, {})).body;
  assert.equal(third.branch, `${branch}-2`);
  assert.equal(gitIn(repo, 'show', `${third.branch}:model.sh`), 'X=7\n');
  assert.equal(gitIn(look, 'rev-parse', 'HEAD').trim(), again.commit);
  gitIn(repo, 'worktree', 'remove', '--force', look);
  assert.equal((await call('POST', `/api/experiments/evolutions/${first.id}/take`, { candidate: byN(first.id, 3).id })).status, 400, 'a failed one cannot be taken');
});

// ---- a restart in the middle ----------------------------------------------------------------------------------------

test('a restart in the middle: rebuilt from what is kept, no candidate lost or scored twice', async () => {
  calls = 0;
  answer = async (q, i) => {
    await delay(300, q.signal);
    return reply(parentX(q.prompt), String(20 + i));
  };
  const e = await start({ files: ['model.sh'], candidates: 10, atOnce: 2 });
  await until(() => cands(e.id).some((c) => c.n >= 3 && c.status === 'scoring'), 120_000, 'a candidate being scored');
  await haltEvolutions();
  const kept = cands(e.id).length;
  assert.ok(cands(e.id).some((c) => c.status !== 'scored' && c.status !== 'failed'), 'some were in hand');
  assert.equal(evo(e.id).status, 'running', 'kept as it was');
  await sleep(1500);
  assert.equal(cands(e.id).length, kept, 'nothing goes on while the app is stopped');
  await resumeEvolutions(deps);
  const done = await over(e.id);
  assert.equal(done.status, 'done', done.why);
  assert.equal(done.tried, 10);
  assert.deepEqual(
    cands(e.id).map((c) => c.n),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  const scores = scoresBy(e.id);
  for (const c of cands(e.id)) {
    assert.equal(c.status, 'scored', `#${c.n}: ${c.why}`);
    assert.equal(scores.get(c.id)?.length, 1, `#${c.n} scored once`);
    assert.equal(c.quick!.score, scores.get(c.id)![0]);
  }
  assert.equal(scores.get('start')!.length, 1);
  await call('DELETE', `/api/experiments/evolutions/${e.id}`);
});

// ---- pause, resume, a refused score, hours, a stall, stop ----------------------------------------------------------

test('pause finishes what is in hand and starts nothing; a refused score pauses it; its hours end it', async () => {
  calls = 0;
  answer = (q, i) => reply(parentX(q.prompt), String(20 + i));
  const e = await start({ files: ['model.sh'], candidates: 10, atOnce: 1, hours: 1, stallAfter: 0 });
  await until(() => evo(e.id).tried >= 2, 120_000, 'two tried');
  assert.equal((await call('POST', `/api/experiments/evolutions/${e.id}/pause`, {})).body.evolution.status, 'paused');
  assert.equal((await call('POST', `/api/experiments/evolutions/${e.id}/pause`, {})).status, 409);
  await until(() => cands(e.id).every((c) => c.status === 'scored' || c.status === 'failed'), 60_000, 'what was in hand');
  const kept = cands(e.id).length;
  const ran = evo(e.id).activeMs;
  await sleep(1200);
  assert.equal(cands(e.id).length, kept, 'nothing new while paused');
  assert.equal(evo(e.id).activeMs, ran, 'paused time is not counted');
  assert.equal((await call('POST', `/api/experiments/evolutions/${e.id}/resume`, {})).body.evolution.status, 'running');
  await until(() => evo(e.id).tried >= kept + 1, 120_000, 'one more');
  // The reference data changes under it: the next score is refused, and it waits for the files to be put back.
  write(path.join(repo, 'data', 'ref.txt'), 'something else\n');
  await until(() => evo(e.id).status === 'paused', 120_000, 'paused by the refusal');
  assert.match(evo(e.id).why!, /The scorer or its data changed since it was sealed: data\/ref\.txt\. Put them back, then resume/);
  assert.ok(cands(e.id).some((c) => c.status === 'failed' && /The scorer or its data changed/.test(c.why ?? '')));
  write(path.join(repo, 'data', 'ref.txt'), 'reference\n');
  await call('POST', `/api/experiments/evolutions/${e.id}/resume`, {});
  const now = evo(e.id).tried;
  await until(() => evo(e.id).tried >= now + 1, 120_000, 'one more after the files were put back');
  clock += 2 * 3_600_000;
  const done = await over(e.id);
  clock = 0;
  assert.equal(done.status, 'done');
  assert.equal(done.why, 'Its 1 hour is up');
  assert.ok(done.tried < 10);
  await call('DELETE', `/api/experiments/evolutions/${e.id}`);
});

test('a stall: no new best in the last few ends it', async () => {
  calls = 0;
  answer = (q, i) => reply(parentX(q.prompt), String(-10 - i));
  const e = await start({ files: ['model.sh'], candidates: 10, atOnce: 1, stallAfter: 3 });
  const done = await over(e.id);
  assert.equal(done.status, 'done');
  assert.equal(done.why, 'No new best in the last 3');
  assert.deepEqual([done.tried, done.best], [3, undefined]);
  assert.equal((await call('POST', `/api/experiments/evolutions/${e.id}/take`, {})).status, 400, 'no best to take');
  await call('DELETE', `/api/experiments/evolutions/${e.id}`);
});

test('stop ends it at once, and deleting removes its worktrees, files, scores and runs', async () => {
  answer = async (q) => {
    await delay(600_000, q.signal);
    return '';
  };
  const e = await start({ files: ['model.sh'], candidates: 10 });
  await until(() => cands(e.id).some((c) => c.status === 'proposing'), 120_000, 'a candidate being proposed');
  const stopped = (await call('POST', `/api/experiments/evolutions/${e.id}/stop`, {})).body.evolution;
  assert.deepEqual([stopped.status, stopped.why], ['stopped', 'Stopped by you']);
  await until(() => cands(e.id).every((c) => c.status === 'failed'), 10_000, 'what was in hand');
  assert.equal(cands(e.id)[0].why, 'It was stopped before it was scored');
  const left = cands(e.id).length;
  assert.ok(left >= 1 && left <= 2);
  await sleep(500);
  assert.equal(cands(e.id).length, left, 'nothing new after it stopped');
  assert.equal((await call('POST', `/api/experiments/evolutions/${e.id}/resume`, {})).status, 409);
  const slots = [0, 1].map((i) => path.join(EVOLVE_ROOT, e.id, 'slots', String(i)));
  assert.ok(slots.every((s) => fs.existsSync(s)));
  assert.ok(gitIn(repo, 'worktree', 'list').includes(slots[0]));
  const runs = scoresBy(e.id)
    .get('start')!
    .flatMap((s) => getScore(db, s)!.runs);
  assert.equal((await call('DELETE', `/api/experiments/evolutions/${e.id}`, undefined, true)).status, 403, 'not an agent’s');
  assert.equal((await call('DELETE', `/api/experiments/evolutions/${e.id}`)).status, 200);
  assert.ok(!fs.existsSync(path.join(EVOLVE_ROOT, e.id)));
  assert.ok(!gitIn(repo, 'worktree', 'list').includes(path.join(EVOLVE_ROOT, e.id)));
  assert.equal(scoresBy(e.id).size, 0);
  assert.ok(runs.length && runs.every((r) => getRun(db, r) === null));
  assert.equal(cands(e.id).length, 0);
  assert.equal((await call('GET', `/api/experiments/evolutions/${e.id}`)).status, 404);
});

// ---- agents -------------------------------------------------------------------------------------------------------

const ctx = (o: Partial<RunCtx> = {}): RunCtx => ({ runId: 'run-1', key: 'claude:abc', agent: 'claude', cwd: repo, deps, ...o }) as RunCtx;
async function tool(name: string, args: Record<string, unknown>, c = ctx()): Promise<{ text: string; error: boolean; json: any }> {
  const t = experimentTools(c).find((x) => x.name === name);
  assert.ok(t, name);
  const out = await t.run(args, c);
  const text = typeof out === 'string' ? out : out.text;
  const error = typeof out !== 'string' && !!out.isError;
  return { text, error, json: error ? null : JSON.parse(text) };
}

test('what an agent may do through app_api: read; start, pause, resume, stop and take on a card each time; never delete', () => {
  const e = '/api/experiments/evolutions';
  const level = (m: string, p: string) => ruleFor(m, p).level;
  for (const p of [e, `${e}/suggest`, `${e}/v1abc`, `${e}/v1abc/candidates/k1abc`]) assert.equal(level('GET', p), 'free', p);
  for (const p of [e, `${e}/v1abc/pause`, `${e}/v1abc/resume`, `${e}/v1abc/stop`, `${e}/v1abc/take`]) assert.equal(level('POST', p), 'always', p);
  assert.equal(level('DELETE', `${e}/v1abc`), 'refuse');
  assert.match(ruleFor('DELETE', `${e}/v1abc`).why!, /Only the person deletes an evolution/);
});

test('evolve_start asks as experiment_run does, says what it will change, and starts only on a yes; evolve_get reads it', async () => {
  answer = async (q) => {
    await delay(600_000, q.signal);
    return '';
  };
  const count = () => listEvolutions().length;
  const before = count();
  sessions.answer = 'deny';
  const no = await tool('evolve_start', { files: ['model.sh'], candidates: 20, aim: 'Find the best X' });
  assert.ok(no.error);
  assert.match(no.text, /said no.*Nothing started/);
  assert.equal(count(), before);
  const card = sessions.cards.at(-1)!;
  assert.equal(card.title, 'Evolve model.sh with “Score”');
  for (const words of ['Changes: model.sh', `from its commit ${head.slice(0, 12)}`, 'your files stay as they are', 'up to 20 changes, 2 at a time, each scored by “Score” (score, higher is better)', 'first with seed 1, then all 3 seeds', 'asks the helper model once', 'Aim: Find the best X'])
    assert.ok(card.detail!.includes(words), words);
  // What cannot start is not asked about.
  const cardsNow = sessions.cards.length;
  assert.match((await tool('evolve_start', { files: ['eval.sh'] })).text, /protected by the evaluation/);
  assert.match((await tool('evolve_start', { files: ['model.sh'] }, ctx({ cwd: plainDir }))).text, /no evaluation for this folder/);
  assert.equal(sessions.cards.length, cardsNow);
  sessions.mode = 'plan';
  assert.match((await tool('evolve_start', { files: ['model.sh'] })).text, /only reads/);
  sessions.mode = 'default';
  sessions.answer = 'accept';
  const yes = await tool('evolve_start', { files: ['model.sh'], candidates: 20 });
  assert.ok(!yes.error, yes.text);
  assert.equal(count(), before + 1);
  const id = yes.json.evolution.id;
  assert.equal(yes.json.page, `/experiments?evolution=${id}`);
  assert.deepEqual(evo(id).by, { who: 'agent', session: 'claude:abc' });
  await stopEvolution(deps, id);
  await call('DELETE', `/api/experiments/evolutions/${id}`);
  // evolve_get: its state, the best with its diff, and the latest ten.
  const got = (await tool('evolve_get', { id: first.id })).json;
  assert.deepEqual([got.status, got.why, got.tried, got.failed], ['done', '10 tried', 10, 4]);
  assert.equal(got.best.n, 10);
  near(got.best.gain, 16);
  assert.match(got.best.diff, /-X=3\n\+X=7/);
  assert.equal(got.latest.length, 10);
  assert.equal(got.latest[0].n, 10);
  assert.match(got.latest.find((c: { n: number }) => c.n === 4).why, /The same as #2/);
  assert.equal(got.scoredBy.name, 'Score');
  assert.ok((await tool('evolve_get', {})).json.evolutions.some((x: { id: string }) => x.id === first.id));
  assert.match((await tool('evolve_get', { id: 'v1nothing' })).text, /no such evolution/);
  assert.ok(!experimentTools(ctx({ step: true })).some((t) => t.name.startsWith('evolve_')), 'not a step’s');
  assert.match(SPAWN_NOTE, /evolve_start rather than trying changes one by one.*never point it at files the evaluation protects/);
});

test('every route is in the guide’s API topic', () => {
  const api = fs.readFileSync(path.join(process.cwd(), 'docs', 'guide', '90-api.md'), 'utf8');
  const routes = [...fs.readFileSync(path.join(process.cwd(), 'server', 'experiments', 'evolve-routes.ts'), 'utf8').matchAll(/app\.(get|post|put|patch|delete)\(\s*'(\/api\/[^']+)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  assert.equal(routes.length, 10);
  for (const r of routes) assert.ok(api.includes(`\`${r}\``), r);
});

const listEvolutions = () => (db.prepare('select id from exp_evolutions').all() as { id: string }[]).map((r) => r.id);

// Pinned: what the random source gives for seed 7, and the parents the first evolution drew with it.
const SEED7 = [0.011705, 0.061958, 0.976908, 0.699029];
const PARENTS = [0, 0, 1, 2, 1, 2, 1, 2, 7, 2];

// ---- run ------------------------------------------------------------------------------------------------------

let failed = 0;
for (const [name, fn] of tests) {
  forgetNotices();
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(e);
  }
}
await haltEvolutions();
clearInterval(ticker);
await stopTmuxServer();
await http.close();
for (const w of gitIn(repo, 'worktree', 'list', '--porcelain').matchAll(/^worktree (.+)$/gm)) if (w[1] !== repo) gitIn(repo, 'worktree', 'remove', '--force', w[1]);
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(EVOLVE_ROOT, { recursive: true, force: true });
console.log(`\n${passed} of ${tests.length} tests passed`);
process.exit(failed ? 1 : 0);
