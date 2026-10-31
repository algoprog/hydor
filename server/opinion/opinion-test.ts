// Checks for second opinions: a conversation's turns and a turn's reply, files and commands; the question
// the reviewer gets (with the diff cut to fit); reading its answer (JSON, fenced, loose lines, "looks
// good", nothing usable); who may review whom; and a run from start to note, with the reviewer stubbed.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/opinion/opinion-test.ts
//   DATA_DIR=/tmp/naget-test-opinion node dist/dev/opinion-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findingsMessage, type OpinionNote } from '../../shared/opinion.ts';
import type { AgentModel, FileChange, SessionSummary, TimelineItem, ToolInfo } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { AGENT_FILE } from '../models/config.ts';
import { getNote, notesOf } from '../notes.ts';
import { makerOf, opinionOptions, reviewersFor, startOpinion } from './index.ts';
import { buildOpinionPrompt, OPINION_SYSTEM, parseOpinion } from './prompt.ts';
import { findTurn, lastTurn, mergedDiffs, turnsOf } from './turns.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-opinion-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- fixtures ------------------------------------------------------------------------------------

let seq = 0;
const user = (text: string, meta?: 'note'): TimelineItem => ({ kind: 'user', id: `u${++seq}`, seq, ts: seq, text, meta });
const said = (text: string, phase?: string): TimelineItem => ({ kind: 'assistant', id: `a${++seq}`, seq, text, phase });
const tool = (t: Partial<ToolInfo>): TimelineItem => ({ kind: 'tool', id: `t${++seq}`, seq, tool: { name: 'Bash', category: 'command', title: 'ls', status: 'ok', ...t } as ToolInfo });
const end = (status = 'completed'): TimelineItem => ({ kind: 'turn', id: `e${++seq}`, seq, status });
const change = (p: string, diff: string, op: FileChange['op'] = 'edit'): FileChange => ({ path: p, op, added: diff.split('\n').filter((l) => l.startsWith('+')).length, removed: diff.split('\n').filter((l) => l.startsWith('-')).length, diff });

const items: TimelineItem[] = [
  user('Add a discount field to the checkout, 10% for members.'),
  tool({ title: 'npm test', exitCode: 1, status: 'error' }),
  said('Done: members get 10% off.'),
  end(),
  user('Also show it on the receipt.'),
  user('(a note the harness added)', 'note'),
  said('Let me look.', 'commentary'),
  tool({ name: 'Edit', category: 'edit', title: 'Edit receipt.ts', files: [change('src/receipt.ts', '@@ -1,2 +1,3 @@\n line\n+discount line\n-old')] }),
  tool({ name: 'Edit', category: 'edit', title: 'Edit receipt.ts', files: [change('src/receipt.ts', '@@ -9 +9 @@\n+total line')] }),
  tool({ name: 'Edit', category: 'edit', title: 'Declined edit', status: 'declined', files: [change('src/nope.ts', '+x')] }),
  tool({ title: 'npm test' }),
  said('The receipt shows the discount.', 'final_answer'),
  said('Anything else?', 'commentary'),
  end(),
];

// ---- turns -----------------------------------------------------------------------------------------

test('a conversation’s turns: the reply after the last step, files, commands, how it ended', () => {
  const all = turnsOf(items);
  assert.equal(all.length, 2);
  assert.equal(all[0].reply, 'Done: members get 10% off.');
  assert.deepEqual(all[0].commands, [{ title: 'npm test', failed: true }]);
  assert.equal(all[0].status, 'completed');
  const t = lastTurn(items)!;
  assert.equal(t.prompt?.text, 'Also show it on the receipt.');
  // Codex's final answer, not what it said on the way.
  assert.equal(t.reply, 'The receipt shows the discount.');
  assert.deepEqual(t.files.map((f) => f.path), ['src/receipt.ts', 'src/receipt.ts']);
  assert.deepEqual(mergedDiffs(t.files).map((f) => [f.path, f.added, f.removed]), [['src/receipt.ts', 2, 1]]);
  assert.equal(findTurn(items)?.prompt?.text, 'Also show it on the receipt.');
  assert.equal(findTurn(items, undefined, true)?.prompt?.text, 'Add a discount field to the checkout, 10% for members.');
  assert.equal(findTurn(items, items[0].id)?.reply, 'Done: members get 10% off.');
});

// ---- the question ------------------------------------------------------------------------------------

test('the question: request, context, commands, the diff, the reply, the task', () => {
  const t = lastTurn(items)!;
  const q = buildOpinionPrompt({ agent: 'Claude Code', turn: t, earlier: ['Add a discount field to the checkout, 10% for members.'], cwd: '/srv/shop' });
  assert.equal(q.system, OPINION_SYSTEM);
  assert.equal(q.files, 1);
  assert.equal(q.trimmed, false);
  for (const part of [
    '## What the user asked\nAlso show it on the receipt.',
    '## Earlier in the conversation, for context\n- Add a discount field',
    '## What the agent (Claude Code) ran\n- npm test',
    '- src/receipt.ts (+2 −1)',
    '```diff\n--- src/receipt.ts\n@@ -1,2 +1,3 @@\n line\n+discount line\n-old\n@@ -9 +9 @@\n+total line\n```',
    "## The agent's final reply\nThe receipt shows the discount.",
    "You are in the session's folder (/srv/shop) and can open files there",
  ])
    assert.ok(q.prompt.includes(part), `missing: ${part}\n---\n${q.prompt}`);
  assert.ok(!q.prompt.includes('src/nope.ts'), 'a declined edit is not part of the work');
  assert.match(OPINION_SYSTEM, /"severity": "critical" \| "important" \| "minor"/);
});

test('the question fits: big diffs are cut and the rest named; no files means the answer is the work', () => {
  const big = (n: number) => change(`src/f${n}.ts`, Array.from({ length: 900 }, (_, i) => `+line ${i} of file ${n}`).join('\n'));
  const t = { ...lastTurn(items)!, files: [big(1), big(2), big(3)] };
  const q = buildOpinionPrompt({ agent: 'Codex', turn: t, maxChars: 30_000 });
  assert.equal(q.trimmed, true);
  assert.ok(q.prompt.length < 40_000);
  assert.match(q.prompt, /The diffs of these files were left out to fit: .*src\/f3\.ts/);
  const none = buildOpinionPrompt({ agent: 'Custom · Qwen', turn: { ...t, files: [], commands: [] } });
  assert.match(none.prompt, /None: the work is the reply itself/);
  assert.match(none.prompt, /No commands\./);
  assert.ok(!none.prompt.includes("You are in the session's folder"));
});

// ---- the answer --------------------------------------------------------------------------------------

test('reading the answer: JSON (fenced, loose), severities, file:line, worst first', () => {
  const r = parseOpinion(
    'Here is my review.\n```json\n{"verdict":"issues","summary":"The receipt misses the total.","findings":[' +
      '{"severity":"minor","title":"Name","detail":"Rename x","file":null,"line":null},' +
      '{"severity":"HIGH","title":"Total not discounted","detail":"The total ignores the discount.","file":"src/receipt.ts:42"},' +
      '{"severity":"major","issue":"No test for members","path":"test/receipt.test.ts"},]}\n```',
  );
  assert.equal(r.verdict, 'issues');
  assert.equal(r.summary, 'The receipt misses the total.');
  assert.deepEqual(r.findings, [
    { severity: 'critical', title: 'Total not discounted', detail: 'The total ignores the discount.', file: 'src/receipt.ts', line: 42 },
    { severity: 'important', title: 'No test for members', file: 'test/receipt.test.ts' },
    { severity: 'minor', title: 'Name', detail: 'Rename x' },
  ]);
  // Minor notes only: it still looks good.
  assert.equal(parseOpinion('{"verdict":"looks_good","summary":"Fine.","findings":[{"severity":"minor","title":"Typo"}]}').verdict, 'good');
  assert.deepEqual(parseOpinion('{"verdict":"looks_good","summary":"Holds up.","findings":[]}'), { verdict: 'good', summary: 'Holds up.', findings: [] });
});

test('reading the answer: loose lines, "looks good", and nothing usable', () => {
  const r = parseOpinion('- **Critical**: the total ignores the discount (src/receipt.ts:42)\n- [Minor] wording\nThanks');
  assert.equal(r.verdict, 'issues');
  assert.deepEqual(r.findings?.map((f) => [f.severity, f.file, f.line]), [['critical', 'src/receipt.ts', 42], ['minor', undefined, undefined]]);
  assert.deepEqual(parseOpinion('Looks good to me: the change does what was asked.'), { verdict: 'good', summary: 'Looks good to me: the change does what was asked.', findings: [] });
  assert.equal(parseOpinion('I could not tell.').verdict, 'unclear');
  assert.equal(parseOpinion('').summary, 'The reviewer gave no answer.');
});

test('findings as a message for the agent', () => {
  const m = findingsMessage('Codex', [{ severity: 'critical', title: 'Total not discounted', detail: 'Use the discounted total.\nSee line 42.', file: 'src/receipt.ts', line: 42 }]);
  assert.equal(m, "A second opinion from Codex on your last turn's work:\n\n1. [Critical] Total not discounted (src/receipt.ts:42)\n   Use the discounted total.\n   See line 42.\n\nCheck each point against the work; fix what holds up, and say which you leave and why.");
});

// ---- who reviews whom ----------------------------------------------------------------------------------

const MODELS: AgentModel[] = [
  { id: 'openrouter/anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', provider: 'openrouter', baseUrl: 'x', model: 'anthropic/claude-sonnet-4.5', tools: 'native' },
  { id: 'openrouter/qwen/qwen3-coder', label: 'Qwen3 Coder', provider: 'openrouter', baseUrl: 'x', model: 'qwen/qwen3-coder', tools: 'native' },
  { id: 'openrouter/openai/gpt-5', label: 'GPT-5', provider: 'openrouter', baseUrl: 'x', model: 'openai/gpt-5', tools: 'native' },
  { id: 'ollama/qwen3:8b', label: 'qwen3:8b', provider: 'ollama', baseUrl: 'x', model: 'qwen3:8b', tools: 'text', contextLength: 8000 },
];

test('who reviews whom: another company’s model, the suggested one first', () => {
  const ids = (s: Pick<SessionSummary, 'agent' | 'model'>) => reviewersFor(s, MODELS).map((r) => r.id);
  assert.deepEqual(ids({ agent: 'claude' }), ['codex', 'openrouter/qwen/qwen3-coder', 'openrouter/openai/gpt-5', 'ollama/qwen3:8b']);
  assert.deepEqual(ids({ agent: 'codex' }), ['claude', 'openrouter/anthropic/claude-sonnet-4.5', 'openrouter/qwen/qwen3-coder', 'ollama/qwen3:8b']);
  assert.deepEqual(ids({ agent: 'acp', model: 'ollama/qwen3:8b' }), ['claude', 'codex', 'openrouter/anthropic/claude-sonnet-4.5', 'openrouter/openai/gpt-5']);
  assert.deepEqual(ids({ agent: 'acp', model: 'openrouter/anthropic/claude-sonnet-4.5' }), ['codex', 'openrouter/qwen/qwen3-coder', 'openrouter/openai/gpt-5', 'ollama/qwen3:8b']);
  assert.equal(makerOf('endpoint/lab/my-model'), 'model:my-model');
  assert.equal(makerOf('ollama/llama3.1:8b'), 'meta');
});

// ---- a run, start to note ----------------------------------------------------------------------------------

fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: MODELS }));
let live: SessionSummary['live'] = null;
const sessions = {
  summary: (key: string): SessionSummary | null => (key === 'claude:s' ? { key, agent: 'claude', id: 's', title: 'Shop', cwd: tmp, stats: {} as any, live } : null),
  timeline: async () => ({ parser: { items } }),
};
const deps = { db, sessions } as unknown as Deps;

test('a second opinion runs: a note under the turn at once, then its findings', async () => {
  let asked: { reviewer: string; prompt: string; cwd?: string } | null = null;
  const { note, work } = await startOpinion(deps, 'claude:s', {}, async (_db, reviewer, q, cwd) => {
    asked = { reviewer, prompt: q.prompt, cwd };
    return '{"verdict":"issues","summary":"One gap.","findings":[{"severity":"important","title":"No receipt test"}]}';
  });
  assert.equal(note.kind, 'opinion');
  assert.equal(note.anchor, items.at(-1)!.id);
  const d0 = note.data as OpinionNote;
  assert.deepEqual([d0.status, d0.reviewer, d0.reviewerLabel, d0.turn, d0.files], ['running', 'codex', 'Codex', items[4].id, 1]);
  await work;
  assert.equal(asked!.reviewer, 'codex');
  assert.equal(asked!.cwd, tmp);
  assert.match(asked!.prompt, /## What the user asked\nAlso show it on the receipt\./);
  const d1 = getNote(db, note.id)!.data as OpinionNote;
  assert.equal(d1.status, 'done');
  assert.equal(d1.verdict, 'issues');
  assert.deepEqual(d1.findings, [{ severity: 'important', title: 'No receipt test' }]);
  assert.ok(d1.endedAt! >= d1.startedAt);
});

test('a second opinion: an earlier turn, a Custom reviewer, failures, and refusals', async () => {
  const { note, work } = await startOpinion(deps, 'claude:s', { reviewer: 'ollama/qwen3:8b', turn: items[0].id }, async () => {
    throw new Error('Ollama is not running');
  });
  await work;
  const d = getNote(db, note.id)!.data as OpinionNote;
  assert.deepEqual([d.status, d.error, d.turn], ['failed', 'Ollama is not running', items[0].id]);
  assert.equal(note.anchor, items[3].id);
  await assert.rejects(startOpinion(deps, 'claude:s', { reviewer: 'claude' }), (e: unknown) => e instanceof HttpError && e.status === 400 && /same company/.test(e.message));
  await assert.rejects(startOpinion(deps, 'claude:s', { turn: 'nope' }), (e: unknown) => e instanceof HttpError && e.status === 404);
  // While the last turn runs, it cannot be checked yet; the one before can.
  live = { status: 'working', startedAt: 1, pendingApprovals: 0 };
  await assert.rejects(startOpinion(deps, 'claude:s', { turn: items[4].id }), (e: unknown) => e instanceof HttpError && e.status === 409);
  const opts = await opinionOptions(deps, 'claude:s');
  assert.deepEqual(opts.turns.map((t) => [t.id, t.files]), [[items[0].id, 0]]);
  assert.equal(opts.reviewers[0].id, 'codex');
  live = null;
  assert.equal(notesOf(db, 'claude:s', 'opinion').length, 2);
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
