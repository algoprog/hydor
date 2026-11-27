// Checks for background work where Claude Code or Codex is not signed in: the helper on Automatic starts neither
// and asks one of Custom's models (a small OpenAI-compatible server here); what to say when there is nothing; the
// features that ask a model by themselves (commit message, pull request description and reading guide, terminal
// command, drawings' code, pictures, second opinions) going through the helper choice. The programs are small
// made-up ones that note each call, and their sign-in is faked. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/helper-test.ts
//   DATA_DIR=/tmp/hydor-test-helper node dist/dev/helper-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { SessionSummary, TimelineItem } from '../shared/types.ts';
import type { Deps } from './features/types.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

// The programs are read from the environment when the app's config loads, so everything of the app loads after this.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-helper-test-'));
const log = path.join(tmp, 'calls.log');
for (const name of ['claude', 'codex']) {
  const answer = name === 'claude' ? `echo '{"type":"result","is_error":false,"result":"ok from claude"}'` : `while [ $# -gt 0 ]; do [ "$1" = "-o" ] && echo "ok from codex" > "$2"; shift; done`;
  fs.writeFileSync(path.join(tmp, name), `#!/bin/sh\necho "${name}" >> "${log}"\n${answer}\n`, { mode: 0o755 });
}
process.env.CLAUDE_BIN = path.join(tmp, 'claude');
process.env.CODEX_BIN = path.join(tmp, 'codex');
process.env.PRICES_URL = '';
process.env.CUDA_VISIBLE_DEVICES = '';

const { openDb } = await import('./db.ts');
const signin = await import('./signin.ts');
const programs = await import('./agents/programs.ts');
const { NOTHING_SET_UP } = await import('./oneshot.ts');
const { helper, helperCost, helperName, helperOptions, helperSees, setHelperModel } = await import('./helper.ts');
const { AGENT_FILE, MODELS_DIR } = await import('./models/config.ts');
const { setTiers } = await import('./assistants/tiers.ts');
const { GitRepos } = await import('./git.ts');
const { writeGuide } = await import('./pullrequests.ts');
const { askCommands } = await import('./termsuggest.ts');
const { writeWith, writerName } = await import('./images/writer.ts');
const { pictureReader } = await import('./write/latex.ts');
const { captionWriter, setCaptionChoice } = await import('./media/caption.ts');
const { opinionOptions, startOpinion } = await import('./opinion/index.ts');
const { getNote } = await import('./notes.ts');

const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- Custom's models: a server that answers by what is asked -----------------------------------------

const asked: string[] = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const q = JSON.parse(body || '{}') as { model?: string; messages?: { role: string; content: unknown }[] };
    asked.push(String(q.model));
    const system = String(q.messages?.[0]?.content ?? '');
    const text = /shell command/.test(system)
      ? '{"commands":[{"command":"ls -la","why":"list the files"}]}'
      : /review a set of code changes/.test(system)
        ? '{"summary":"A small change.","steps":[{"path":"a.txt","note":"One line."}]}'
        : `custom says ok (${q.model})`;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ id: 'x', choices: [{ delta: { content: text } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: 'x', choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
const model = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id.toUpperCase(), provider: 'endpoint', baseUrl, model: `${id}-name`, tools: 'native', ...extra });
const customModels = (...models: Record<string, unknown>[]) => {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.writeFileSync(AGENT_FILE, JSON.stringify({ models }));
};

// ---- the programs' sign-ins, faked --------------------------------------------------------------------

let signedIn: Record<'claude' | 'codex', boolean> = { claude: false, codex: false };
let n = 0;
/** A fresh install (or, with `used`, one where those programs were signed in before), with these signed in now. */
async function install(now: Partial<typeof signedIn>, used: ('claude' | 'codex')[] = []) {
  signin.resetSignIn();
  programs.resetPrograms();
  signedIn = { claude: false, codex: false, ...now };
  const kept = openDb(path.join(tmp, `programs-${++n}.db`));
  for (const p of used) kept.prepare('insert into sessions (key, agent, id, path, tokens_out) values (?, ?, ?, ?, ?)').run(`${p}:1`, p, '1', `/x/${p}`, 5);
  signin.initSignIn({ broadcast: () => {}, nameOf: () => 'an account', signedInBefore: (p) => (p === 'claude' || p === 'codex' ? programs.signedInBefore(p) : true) });
  programs.initPrograms({ db: kept, accounts: () => [undefined], account: async (p) => ({ agent: p, loggedIn: signedIn[p] }) });
  await programs.programStatus();
  fs.rmSync(log, { force: true });
  asked.length = 0;
  setHelperModel(db, 'auto');
  setTiers(db, { console: {} });
}
const called = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
const ask = { system: 'You answer.', prompt: 'Say ok.' };

// ---- the helper ------------------------------------------------------------------------------------

test('Automatic with both programs signed out starts neither and asks a Custom model', async () => {
  customModels(model('dear'), model('quick'), model('claude/opus', { provider: 'claude', baseUrl: '' }));
  await install({});
  setTiers(db, { console: { quick: { model: 'quick' } } });
  assert.equal(await helper(db, ask), 'custom says ok (quick-name)');
  assert.deepEqual(called(), []);
  assert.deepEqual(signin.signInNeeds(), []);
  assert.equal(helperName(db), 'QUICK');
  assert.equal(helperCost(db, { tokensIn: 1, tokensOut: 1 }).model, 'quick');
  assert.equal(helperOptions(db).options[0].detail, 'QUICK, one of Custom’s models');
});

test('with only one program signed in, only that one is asked', async () => {
  customModels(model('quick'));
  await install({ codex: true });
  assert.equal((await helper(db, ask)).trim(), 'ok from codex');
  assert.deepEqual(called(), ['codex']);
  assert.equal(helperName(db), 'Codex');
  await install({ claude: true });
  assert.equal(await helper(db, ask), 'ok from claude');
  assert.deepEqual(called(), ['claude']);
  assert.equal(helperOptions(db).options[0].detail, 'Claude Haiku through Claude Code');
});

test('with nothing at all it says what to set up, and never "sign in again" for a program never signed in here', async () => {
  customModels();
  await install({});
  await assert.rejects(helper(db, ask), (e: Error) => e.message === NOTHING_SET_UP);
  assert.deepEqual(called(), []);
  assert.deepEqual(signin.signInNeeds(), []);
});

test('one signed in before and out now, with nothing else, is asked about, still without starting it', async () => {
  customModels();
  await install({}, ['claude']);
  await assert.rejects(helper(db, ask), /is signed out, and no other account or Custom model could do this/);
  assert.deepEqual(called(), []);
  assert.deepEqual(signin.signInNeeds().map((x) => x.agent), ['claude']);
});

test('a plan model picked as the helper does not start a program that is not signed in', async () => {
  customModels(model('claude/opus', { provider: 'claude', baseUrl: '' }));
  await install({});
  await assert.rejects(helper(db, { ...ask, model: 'claude/opus' }), /Claude Code is not signed in here/);
  assert.deepEqual(called(), []);
});

test('pictures go to a Custom model that sees them when no program is signed in', async () => {
  customModels(model('blind'), model('eyes', { vision: true }));
  await install({});
  assert.equal(helperSees(db), true);
  const images = [{ data: 'AAAA', mimeType: 'image/png' }];
  assert.equal(await helper(db, { ...ask, images }), 'custom says ok (eyes-name)');
  await install({ claude: true });
  assert.equal(helperSees(db), false);
  await assert.rejects(helper(db, { ...ask, images }), /cannot see images/);
  assert.deepEqual(called(), []);
});

test('a long question goes first to a model whose context holds it', async () => {
  customModels(model('small', { provider: 'ollama', contextLength: 2000 }), model('big', { contextLength: 200_000 }));
  await install({});
  assert.equal(await helper(db, ask), 'custom says ok (small-name)');
  assert.equal(await helper(db, { ...ask, prompt: 'x'.repeat(40_000) }), 'custom says ok (big-name)');
});

// ---- the features that ask a model by themselves ---------------------------------------------------

const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Bea', GIT_AUTHOR_EMAIL: 'bea@example.com', GIT_COMMITTER_NAME: 'Bea', GIT_COMMITTER_EMAIL: 'bea@example.com' };
const repo = path.join(tmp, 'shop');
fs.mkdirSync(repo);
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env: gitEnv, stdio: 'ignore' });
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
git('add', '-A');
git('-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'one');
fs.writeFileSync(path.join(repo, 'a.txt'), 'two\n');
const review = { dir: repo, head: 'task', base: 'main', digest: 'd1', uncommitted: 1, files: [{ path: 'a.txt', status: 'modified', added: 1, removed: 1, diff: '-one\n+two' }] } as unknown as Parameters<typeof writeGuide>[1];

test('the commit message, the terminal command, the reading guide and drawings go through the helper choice', async () => {
  customModels(model('quick'), model('picked'));
  const repos = new GitRepos(db);
  await repos.add(repo);
  for (const [choice, name] of [['auto', 'quick-name'], ['picked', 'picked-name']] as const) {
    await install({});
    setTiers(db, { console: { quick: { model: 'quick' }, standard: { model: 'quick' }, best: { model: 'quick' } } });
    setHelperModel(db, choice);
    assert.deepEqual(await repos.suggestMessage(repo, ['a.txt']), { message: `custom says ok (${name})` });
    assert.deepEqual(await askCommands(db, 'list the files', { cwd: repo, shell: 'bash' }), [{ command: 'ls -la', why: 'list the files' }]);
    assert.equal((await writeGuide(db, { ...review, digest: choice }, undefined)).summary, 'A small change.');
    assert.deepEqual(await writeWith(db, { system: 'Draw.', prompt: 'A boat.' }), { text: `custom says ok (${name})`, model: writerName(db) });
    assert.deepEqual(asked, [name, name, name, name]);
    assert.deepEqual(called(), []);
  }
  // With a program signed in and a Custom model picked, the picked one still answers.
  await install({ claude: true, codex: true });
  setHelperModel(db, 'picked');
  await repos.suggestMessage(repo, ['a.txt']);
  assert.deepEqual(called(), []);
});

test('reading pictures: a Custom model that sees them where Claude Code is not signed in', async () => {
  customModels(model('blind'), model('eyes', { vision: true }));
  await install({});
  const d = { models: { agentModels: () => [], ensure: async () => { throw new Error('not started'); } } } as unknown as Pick<Deps, 'models'>;
  const reader = await pictureReader(db);
  assert.deepEqual([reader.where, reader.label], ['helper', 'EYES']);
  setCaptionChoice(db, { provider: 'auto' });
  const auto = await captionWriter(db, d);
  assert.ok(!('why' in auto), 'a writer');
  assert.equal(auto.model, 'eyes');
  setCaptionChoice(db, { provider: 'claude', model: 'haiku' });
  const picked = await captionWriter(db, d);
  assert.match('why' in picked ? picked.why : '', /Claude Code is not signed in here/);
  // A helper picked that cannot see: another model that does is found all the same.
  await install({ codex: true });
  setHelperModel(db, 'blind');
  const other = await pictureReader(db);
  assert.deepEqual([other.where, other.label], ['helper', 'EYES']);
  assert.deepEqual(called(), []);
});

test('a second opinion takes a Custom model when the other program is not signed in', async () => {
  const maker = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ ...model(id, extra), model: name });
  customModels(maker('qwen', 'qwen/qwen3'), maker('gemini', 'google/gemini'), maker('codex/gpt', 'gpt-6', { provider: 'codex', baseUrl: '' }));
  await install({ claude: true });
  setTiers(db, { console: { best: { model: 'gemini' } } });
  let seq = 0;
  const items: TimelineItem[] = [
    { kind: 'user', id: 'u1', seq: ++seq, ts: 1, text: 'Add a discount.' },
    { kind: 'assistant', id: 'a1', seq: ++seq, text: 'Done.' },
    { kind: 'turn', id: 'e1', seq: ++seq, status: 'completed' },
  ];
  const summary: SessionSummary = { key: 'claude:s', agent: 'claude', id: 's', title: 'Shop', cwd: tmp, stats: {} as SessionSummary['stats'], live: null };
  const deps = { db, sessions: { summary: () => summary, timeline: async () => ({ parser: { items } }) } } as unknown as Deps;
  // Codex is not signed in: neither it nor the model of its plan is offered, and the Best tier's model comes first.
  assert.deepEqual((await opinionOptions(deps, 'claude:s')).reviewers.map((r) => r.id), ['gemini', 'qwen']);
  const { note, work } = await startOpinion(deps, 'claude:s', {});
  await work;
  assert.equal((getNote(db, note.id)!.data as { reviewer: string }).reviewer, 'gemini');
  assert.deepEqual(asked, ['google/gemini']);
  assert.deepEqual(called(), []);
});

// ---- run ---------------------------------------------------------------------------------------------

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).stack?.split('\n').slice(0, 8).join('\n     ')}`);
  }
}
server.close();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
