// Checks for `hydor` in a terminal: arguments to options, widths and wrapping, Markdown at several widths, each kind
// of step's line, the turn's line, subagents' lines, an approval's keys and the body each sends, the input line's keys
// and paste, the printer (final items once, streaming text by its finished chunks); then against a small fake server
// (node:http and ws on 127.0.0.1, checking the bearer token): `run` end to end (streamed items, a subagent whose reply
// wakes the lead, --json and --stream-json, a failed turn, an approval with nobody to answer, a timeout, a socket that
// drops and comes back), `sessions --json`, `tiers` shown and set; and the chat itself in a pseudo-terminal at 80 and
// 120 columns (a message, a streamed reply, an approval answered with a key, a message queued while it works, a
// paste, Ctrl+C twice to leave), its screen read back through a headless xterm. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/tui-test.ts && DATA_DIR=/tmp/hydor-test-tui node dist/dev/tui-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pty from 'node-pty';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ChildNote } from '../../shared/children.ts';
import type { SessionNote } from '../../shared/features.ts';
import type { ApprovalRequest, LiveOverlay, LiveState, SessionSummary, TimelineItem, ToolInfo, ToolItem } from '../../shared/types.ts';
import { parseArgv, UsageError } from './args.ts';
import type { Conn } from './client.ts';
import { KeyReader, layout, LineEditor } from './editor.ts';
import { approvalBody, approvalKeys, childReplyLines, foldedLine, itemLines, modelLabel, noteLines, stepLines, turnLines, type Look } from './lines.ts';
import { chunksOf, finishedLength, renderMarkdown } from './markdown.ts';
import { historyLines, lastReply, Printer, SessionView } from './session.ts';
import { modeFor } from './start.ts';
import { makePaint, strWidth, stripAnsi, truncate, wrap } from './term.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(DATA, { recursive: true });
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plain = makePaint(false);
const look = (width = 80, extra: Partial<Look> = {}): Look => ({ p: plain, width, home: '/home/u', cwd: '/home/u/proj', ...extra });
const tool = (t: Partial<ToolInfo> & Pick<ToolInfo, 'name' | 'category' | 'title'>, o: Partial<ToolItem> = {}): ToolItem => ({ kind: 'tool', id: o.id ?? `t${Math.random()}`, seq: 0, ts: o.ts, tool: { status: 'ok', ...t } });

// ---- arguments --------------------------------------------------------------------------------------------

test('arguments: commands, a message, -p, options and wrong usage', () => {
  assert.deepEqual(parseArgv([]).cmd, 'chat');
  const m = parseArgv(['fix', 'the', 'tests', '--model', 'opus', '--mode', 'edits', '--cap', '$2.5', '--no-memory']);
  assert.equal(m.cmd, 'chat');
  assert.deepEqual(m.args, ['fix', 'the', 'tests']);
  assert.equal(m.model, 'opus');
  assert.equal(m.cap, 2.5);
  assert.equal(m.noMemory, true);
  const r = parseArgv(['-p', 'say hi', '--json', '--timeout', '30']);
  assert.equal(r.cmd, 'run');
  assert.equal(r.json, true);
  assert.equal(r.timeout, 30);
  assert.equal(parseArgv(['run', 'x', '-y']).mode, 'full');
  assert.equal(parseArgv(['-c']).continue, true);
  assert.equal(parseArgv(['resume', 'abc']).cmd, 'resume');
  assert.deepEqual(parseArgv(['tiers', 'set', 'claude', 'best', 'opus', '--effort', 'high']).args, ['set', 'claude', 'best', 'opus']);
  assert.equal(parseArgv(['sessions', '-n', '5', '--json']).limit, 5);
  assert.equal(parseArgv(['open', 'k', '--browser']).browser, true);
  assert.equal(parseArgv(['--help']).help, true);
  assert.equal(parseArgv(['help']).help, true);
  for (const bad of [['--cap', 'lots'], ['--json', '--stream-json'], ['--frobnicate'], ['sessions', '-p'], ['run', 'x', '--yes', '--mode', 'ask']]) assert.throws(() => parseArgv(bad), UsageError, bad.join(' '));
  assert.equal(modeFor('edits', 'claude'), 'acceptEdits');
  assert.equal(modeFor('ask', 'codex'), 'read-only');
  assert.equal(modeFor('full', 'acp', 'console'), 'full');
  assert.equal(modeFor('bypassPermissions', 'claude'), 'bypassPermissions');
});

// ---- widths and wrapping ------------------------------------------------------------------------------------

test('widths: wide characters and emoji count two, escape codes none', () => {
  assert.equal(strWidth('abc'), 3);
  assert.equal(strWidth('你好'), 4);
  assert.equal(strWidth('👍'), 2);
  assert.equal(strWidth('👩‍💻'), 2);
  assert.equal(strWidth('é'), 1);
  assert.equal(strWidth('\x1b[1mbold\x1b[22m'), 4);
  assert.equal(strWidth(truncate('你好世界和平', 7)), 7);
  assert.ok(strWidth(truncate('abcdefghij', 6)) <= 6);
});

test('wrapping: by words at any width, long words cut, styles carried to the next line', () => {
  const t = 'The quick brown fox jumps over the lazy dog again and again';
  for (const w of [10, 20, 33, 80]) {
    const lines = wrap(t, w);
    for (const l of lines) assert.ok(strWidth(l) <= w, `${w}: ${l}`);
    assert.equal(lines.join(' ').replace(/\s+/g, ' '), t);
  }
  const cut = wrap('x'.repeat(25), 10);
  assert.deepEqual(cut.map((l) => l.length), [10, 10, 5]);
  const cjk = wrap('你好世界你好世界你好世界', 7);
  for (const l of cjk) assert.ok(strWidth(l) <= 7);
  const p = makePaint(true);
  const styled = wrap(p.bold('one two three four five'), 9);
  assert.ok(styled.length > 1);
  for (const l of styled) assert.ok(l.includes('\x1b[1m'), `bold on every line: ${JSON.stringify(l)}`);
  assert.deepEqual(wrap('a b', 10, { first: '› ', indent: '  ' }), ['› a b']);
});

// ---- Markdown -------------------------------------------------------------------------------------------------

const MD = `# Title

Some *text* with \`code\` and a [link](https://example.com) that goes on long enough to wrap at a narrow width.

- one
- two
  - nested
1. first
2. second

> quoted words

\`\`\`ts
const veryLongLineThatMustNeverBeWrapped = someFunction(argumentOne, argumentTwo, argumentThree);
\`\`\`

| Name | Size |
|------|-----:|
| a    | 1 |
| bb   | 22 |`;

test('Markdown: headings, lists, quotes, links, code never wrapped, tables aligned or as written', () => {
  for (const w of [30, 60, 100]) {
    const lines = renderMarkdown(MD, w, plain);
    const text = lines.join('\n');
    assert.ok(text.includes('Title'));
    assert.ok(text.replace(/\n/g, ' ').includes('link (https://example.com)'));
    assert.ok(lines.some((l) => l.startsWith('• one')));
    assert.ok(lines.some((l) => /^ {2}◦ nested/.test(l)));
    assert.ok(lines.some((l) => l.startsWith('1. first')));
    assert.ok(lines.some((l) => l.startsWith('│ quoted words')));
    assert.ok(lines.includes('  const veryLongLineThatMustNeverBeWrapped = someFunction(argumentOne, argumentTwo, argumentThree);'), 'code as it is');
    for (const l of lines) if (!l.includes('veryLongLine')) assert.ok(strWidth(l) <= w, `${w}: ${l}`);
    if (w >= 60) assert.ok(lines.some((l) => /^bb +│ +22$/.test(l)), 'aligned table');
  }
  // A table too wide stays as written.
  const wide = renderMarkdown('| a very long heading | another very long heading |\n|---|---|\n| x | y |', 20, plain);
  assert.equal(wide[0], '| a very long heading | another very long heading |');
  // Wide characters wrap by their columns.
  for (const l of renderMarkdown('你好世界 '.repeat(10), 15, plain)) assert.ok(strWidth(l) <= 15);
});

test('Markdown while it streams: whole chunks are finished, a fence keeps its blank lines', () => {
  assert.equal(finishedLength('Hello'), 0);
  assert.equal(finishedLength('Hello\n'), 0);
  assert.equal(finishedLength('Hello\n\nWor'), 'Hello\n\n'.length);
  const fenced = 'Intro\n\n```\na\n\nb';
  assert.equal(finishedLength(fenced), 'Intro\n\n'.length, 'not inside an open fence');
  assert.equal(finishedLength(`${fenced}\n\`\`\`\n\nAfter`), `${fenced}\n\`\`\`\n\n`.length);
  assert.deepEqual(chunksOf('a\n\n```\nx\n\ny\n```\n\nb'), ['a', '```\nx\n\ny\n```', 'b']);
  // Drawn in two parts, it reads as drawn whole.
  const md = 'Para one is here.\n\n- a\n- b\n\nPara three.';
  const cut = finishedLength(md.slice(0, md.length - 3));
  const parts = [...renderMarkdown(md.slice(0, cut), 40, plain), '', ...renderMarkdown(md.slice(cut), 40, plain)];
  assert.deepEqual(parts, renderMarkdown(md, 40, plain));
});

// ---- lines ------------------------------------------------------------------------------------------------------

test('steps: one line each, by category, with what matters of the result', () => {
  const L = look(80);
  const one = (t: ToolItem) => stepLines(t, L);
  assert.equal(one(tool({ name: 'Read', category: 'read', title: '/home/u/proj/src/export.ts' }))[0], '  ● Read src/export.ts');
  assert.equal(one(tool({ name: 'Grep', category: 'search', title: '"parseArgs" in src/' }))[0], '  ● Searched "parseArgs" in src/');
  assert.equal(one(tool({ name: 'Edit', category: 'edit', title: '/home/u/proj/src/cli.ts', files: [{ path: 'src/cli.ts', op: 'edit', added: 14, removed: 2 }] }))[0], '  ● Edited src/cli.ts  +14 −2');
  assert.equal(one(tool({ name: 'Write', category: 'edit', title: '/home/u/new.md', files: [{ path: '/home/u/new.md', op: 'create', added: 3, removed: 0 }] }))[0], '  ● Created ~/new.md  +3');
  assert.equal(one(tool({ name: 'Bash', category: 'command', title: 'npm test', label: 'Run the tests', durationMs: 8100 }))[0], '  ● Run the tests  npm test  8.1 s');
  const failed = one(tool({ name: 'Bash', category: 'command', title: 'npm test', status: 'error', exitCode: 1, output: '\nFAIL src/a.test.ts\nmore' }));
  assert.match(failed[0], /^ {2}✗ .*npm test {2}exit 1$/);
  assert.equal(failed[1], '      FAIL src/a.test.ts');
  assert.equal(one(tool({ name: 'WebFetch', category: 'web', title: 'https://example.com' }))[0], '  ● Fetched https://example.com');
  assert.equal(one(tool({ name: 'mcp__x__y', category: 'mcp', title: 'x: y' }))[0], '  ● Called x: y');
  assert.match(one(tool({ name: 'Bash', category: 'command', title: 'sleep 100', status: 'declined' }))[0], /declined$/);
  const v = stepLines(tool({ name: 'Bash', category: 'command', title: 'ls', output: 'a\nb\nc' }), { ...L, verbose: true });
  assert.deepEqual(v.slice(1), ['      a', '      b', '      c']);
  for (const w of [30, 50]) assert.ok(strWidth(stepLines(tool({ name: 'Bash', category: 'command', title: `echo ${'x'.repeat(200)}` }), look(w))[0]) <= w);
  const fold = foldedLine([tool({ name: 'Bash', category: 'command', title: 'a' }), tool({ name: 'Read', category: 'read', title: 'b' }), tool({ name: 'Read', category: 'read', title: 'c' })], L);
  assert.equal(fold[0], '  ● Ran 1 command, read 2 files');
});

test('the turn’s line, subagents, tiers and a spending cap', () => {
  const L = look(80);
  assert.equal(turnLines({ kind: 'turn', id: 't', seq: 0, status: 'completed', durationMs: 64_000, costUsd: 0.31, model: 'claude-opus-5-5' }, L, { helpers: 1 })[0], '  ✓ 1m 04s · $0.31 · Opus 5.5 · 1 subagent');
  assert.equal(turnLines({ kind: 'turn', id: 't', seq: 0, status: 'interrupted', durationMs: 12_000 }, L)[0], '  ■ Stopped · 12 s');
  assert.match(turnLines({ kind: 'turn', id: 't', seq: 0, status: 'failed' }, L)[0], /✗ Failed/);
  assert.equal(modelLabel('claude-sonnet-5-5'), 'Sonnet 5.5');
  assert.equal(modelLabel('opus', [{ value: 'opus', label: 'Opus 5.5', efforts: [] }]), 'Opus 5.5');
  assert.equal(modelLabel('auto'), 'Automatic');
  const child: ChildNote = { child: 'claude:c1', agent: 'claude', label: 'Claude Code · sonnet', title: 'Add --json to export', brief: '', cwd: '/', tier: 'standard', startedAt: 0 };
  assert.equal(noteLines({ id: 'n', key: 'k', kind: 'child', at: 0, data: child }, L)![0], '  ◆ Subagent started: Add --json to export · Claude Code · sonnet · Standard');
  assert.equal(noteLines({ id: 'n', key: 'k', kind: 'tier', at: 0, data: { event: 'auto', tier: 'max', label: 'Fable 5.2', why: 'a hard proof' } }, L)![0], '  ◆ Automatic picked Max (Fable 5.2): a hard proof');
  assert.equal(noteLines({ id: 'n', key: 'k', kind: 'tier', at: 0, data: { event: 'stepUp', tier: 'best', label: 'Opus 5.5' } }, L)![0], '  ◆ Stepped up to Best (Opus 5.5)');
  assert.match(noteLines({ id: 'n', key: 'k', kind: 'budget', at: 0, data: { capUsd: 5, spentUsd: 5.02 } }, L)![0], /Stopped at its spending cap: \$5\.02 of \$5\.00/);
  assert.equal(noteLines({ id: 'n', key: 'k', kind: 'memory', at: 0, data: {} }, L), null);
  assert.equal(childReplyLines('[Reply from the Hydor subagent "Add --json" (claude:c1, Claude Code · sonnet)]\n\nDone.', L)![0], '  ◆ Subagent finished: Add --json');
  // Transcripts written before the rename say "child session": they read the same.
  assert.equal(childReplyLines('[Reply from the child session "Old" (claude:c0, Claude Code · sonnet)]\n\nDone.', L)![0], '  ◆ Subagent finished: Old');
  assert.match(childReplyLines('[The child session "Old" (claude:c0, Claude Code · haiku) stopped with an error: x]', L)![0], /Subagent failed: Old · x/);
  assert.match(childReplyLines('[The Hydor subagent "T" (claude:c2, Claude Code · haiku) stopped with an error: model not found]\n(It wrote no reply.)', L)![0], /Subagent failed: T · model not found/);
});

const APPROVAL: ApprovalRequest = {
  id: 'a1',
  title: 'Run npm test',
  kind: 'command',
  detail: '# Run the tests\nnpm test',
  options: [
    { id: 'allow', label: 'Allow', style: 'primary' },
    { id: 'allow_always', label: 'Always allow Bash(npm test)' },
    { id: 'deny', label: 'Deny', style: 'danger' },
  ],
  createdAt: 0,
};

test('approvals: y the first that allows, n the one that denies, a digit any; the bodies they send', () => {
  const keys = approvalKeys(APPROVAL);
  assert.equal(keys.find((k) => k.key === 'y')!.option.id, 'allow');
  assert.equal(keys.find((k) => k.key === 'n')!.option.id, 'deny');
  assert.equal(keys.find((k) => k.key === '2')!.option.id, 'allow_always');
  assert.deepEqual(approvalBody(APPROVAL, 'allow'), { decision: 'allow', message: undefined, answers: {}, form: undefined });
  assert.deepEqual(approvalBody(APPROVAL, 'deny', { message: 'use pnpm' }), { decision: 'deny', message: 'use pnpm', answers: {}, form: undefined });
  const plan: ApprovalRequest = { ...APPROVAL, kind: 'plan', options: [{ id: 'allow_accept_edits', label: 'Approve, auto-accept edits' }, { id: 'allow', label: 'Approve, ask before edits' }, { id: 'deny', label: 'Keep planning' }] };
  assert.equal(approvalKeys(plan).find((k) => k.key === 'y')!.option.id, 'allow_accept_edits');
  assert.equal(approvalKeys(plan).find((k) => k.key === 'n')!.option.id, 'deny');
  const q: ApprovalRequest = { ...APPROVAL, kind: 'question', questions: [{ id: 'q1', question: 'Which?', options: [{ label: 'A' }] }], options: [{ id: 'answer', label: 'Send answers' }, { id: 'deny', label: 'Skip' }] };
  assert.deepEqual(approvalBody(q, 'answer', { answers: { q1: 'A' } }), { decision: 'answer', message: undefined, answers: { q1: 'A' }, form: undefined });
  const form: ApprovalRequest = { ...APPROVAL, kind: 'other', form: { fields: [{ id: 'city', label: 'City', type: 'text' }] }, options: [{ id: 'accept', label: 'Send' }, { id: 'decline', label: 'Decline' }] };
  assert.deepEqual(approvalBody(form, 'accept', { form: { city: 'Lisbon' } }), { decision: 'accept', message: undefined, answers: {}, form: { city: 'Lisbon' } });
  assert.deepEqual(approvalBody(form, 'decline', { form: { city: 'x' } }).form, undefined);
});

// ---- the input line -----------------------------------------------------------------------------------------------

test('keys: escape sequences in their spellings, a paste whole across reads', () => {
  const r = new KeyReader();
  const names = (s: string) => r.feed(s).map((k) => k.name);
  assert.deepEqual(names('\x1b[A\x1b[B\x1bOC\x1b[D'), ['up', 'down', 'right', 'left']);
  assert.deepEqual(names('\x1b[1;3D\x1b[1;5C\x1bb\x1bf'), ['word-left', 'word-right', 'word-left', 'word-right']);
  assert.deepEqual(names('\x1b[H\x1b[F\x1b[1~\x1b[4~\x1b[3~'), ['home', 'end', 'home', 'end', 'delete']);
  assert.deepEqual(names('\x01\x05\x0b\x15\x17\x03\x04\r\n\x1b\r\t'), ['home', 'end', 'kill-end', 'kill-start', 'delete-word-back', 'ctrl-c', 'ctrl-d', 'enter', 'newline', 'newline', 'tab']);
  assert.deepEqual(names('\x1b[13;2u'), ['newline']);
  assert.deepEqual(names('\x1b'), ['escape']);
  // Esc and a key in one read (typed fast, or sent by tmux): both, neither swallowed.
  assert.deepEqual(names('\x1b\x15'), ['escape', 'kill-start']);
  assert.deepEqual(r.feed('\x1b/he'), [{ name: 'escape' }, { name: 'text', text: '/he' }]);
  assert.deepEqual(r.feed('héllo 你好'), [{ name: 'text', text: 'héllo 你好' }]);
  assert.deepEqual(r.feed('\x1b[200~line one\r\nline'), []);
  assert.deepEqual(r.feed(' two\x1b[201~x'), [{ name: 'paste', text: 'line one\nline two' }, { name: 'text', text: 'x' }]);
  assert.deepEqual(new KeyReader().feed('a\rb\r'), [{ name: 'paste', text: 'a\nb' }]);
  assert.deepEqual(new KeyReader().feed('typed\r'), [{ name: 'text', text: 'typed' }, { name: 'enter' }]);
});

test('the editor: moving and deleting by characters and words, lines, history, Enter and its new lines', () => {
  const e = new LineEditor(['older', 'newest']);
  const text = (): string => e.text;
  const k = (...ks: Parameters<LineEditor['apply']>[0][]) => ks.map((x) => e.apply(x));
  k({ name: 'text', text: 'hello big world' });
  k({ name: 'word-left' });
  assert.equal(e.cursor, 10);
  k({ name: 'delete-word-back' });
  assert.equal(text(), 'hello world');
  k({ name: 'home' }, { name: 'kill-end' });
  assert.equal(text(), '');
  k({ name: 'text', text: 'ab👍' }, { name: 'backspace' });
  assert.equal(text(), 'ab', 'an emoji goes whole');
  k({ name: 'text', text: 'c' }, { name: 'left' }, { name: 'left' }, { name: 'kill-start' });
  assert.equal(text(), 'bc');
  e.clear();
  assert.equal(e.apply({ name: 'up' }), 'history');
  assert.equal(text(), 'newest');
  e.apply({ name: 'up' });
  assert.equal(text(), 'older');
  e.apply({ name: 'down' });
  e.apply({ name: 'down' });
  assert.equal(text(), '', 'back to the line being written');
  k({ name: 'text', text: 'first\\' });
  assert.equal(e.apply({ name: 'enter' }), 'changed');
  assert.equal(text(), 'first\n');
  k({ name: 'text', text: 'second' }, { name: 'newline' }, { name: 'text', text: 'third' });
  assert.equal(text(), 'first\nsecond\nthird');
  e.apply({ name: 'up' });
  assert.equal(text().slice(0, e.cursor), 'first\nsecon', 'up moves a line in a message of several, keeping the column');
  e.apply({ name: 'end' });
  e.apply({ name: 'paste', text: '\tpasted\nlines' });
  assert.equal(text(), 'first\nsecond  pasted\nlines\nthird');
  assert.equal(e.apply({ name: 'enter' }), 'submit');
  e.remember('sent');
  e.remember('sent');
  assert.deepEqual(e.history.slice(-1), ['sent']);
  assert.equal(e.history.filter((h) => h === 'sent').length, 1);
});

test('the input laid out: rows a column short of the width, the cursor’s row and column', () => {
  const l = layout('abcdefghij', 10, 10, { prompt: '› ', p: plain });
  assert.deepEqual(l.rows, ['› abcdefg', '  hij']);
  assert.deepEqual([l.cursorRow, l.cursorCol], [1, 5]);
  const two = layout('one\ntwo', 4, 40, { prompt: '› ', p: plain });
  assert.deepEqual(two.rows, ['› one', '  two']);
  assert.deepEqual([two.cursorRow, two.cursorCol], [1, 2]);
  const wide = layout('你好世界', 4, 9, { prompt: '› ', p: plain });
  for (const r of wide.rows) assert.ok(strWidth(r) <= 8);
  const many = layout(Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'), 0, 40, { prompt: '› ', p: plain, maxRows: 5 });
  assert.equal(many.rows.length, 5);
  assert.equal(many.cursorRow, 0);
  assert.match(stripAnsi(many.rows[4]), /more below/);
  const empty = layout('', 0, 40, { prompt: '› ', placeholder: 'Message the agent', p: plain });
  assert.deepEqual(empty.rows, ['› Message the agent']);
});

// ---- the printer --------------------------------------------------------------------------------------------------

/** An item's lines as one string, without colour, 80 columns. */
const itemLinesOf = (it: TimelineItem) => itemLines(it, look(80)).join('\n');

/** A session view without a server, its state set by hand. */
function viewOf(items: TimelineItem[], overlay: Partial<LiveOverlay> = {}, notes: SessionNote[] = []): SessionView {
  const v = new SessionView({} as Conn, 'claude:x');
  v.items = items.map((it, i) => ({ ...it, seq: i }));
  v.overlay = { items: [], patches: {}, approvals: [], ...overlay };
  v.notes = notes;
  return v;
}

test('the printer: each final item once, in order; what is under way held for the region', () => {
  const pr = new Printer(look(60));
  const echo = pr.echo('add a flag');
  assert.deepEqual(echo, ['› add a flag']);
  const user: TimelineItem = { kind: 'user', id: 'u1', seq: 0, text: 'add a flag' };
  const read = tool({ name: 'Read', category: 'read', title: '/home/u/proj/a.ts' }, { id: 't1' });
  const run = tool({ name: 'Bash', category: 'command', title: 'npm test', status: 'running' }, { id: 't2' });
  let v = viewOf([user, read, run]);
  let r = pr.take(v);
  assert.deepEqual(r.lines, ['', '  ● Read a.ts'], 'your message is not printed again');
  assert.deepEqual(r.pending.map((i) => i.id), ['t2']);
  // The step ends (a patch over it), the reply streams: its finished chunk is printed, the rest held.
  v = viewOf([user, read, run], { patches: { t2: { status: 'ok', durationMs: 2000 } }, items: [{ kind: 'assistant', id: 'a1', seq: 0, ts: 5, text: 'First part.\n\nSecond pa', streaming: true }] });
  r = pr.take(v);
  assert.deepEqual(r.lines, ['  ● Run the tests  npm test  2.0 s', '', '  First part.']);
  assert.equal(pr.rest(r.pending[0]), 'Second pa');
  // It ends: the rest is printed, then the turn's end; nothing twice.
  const reply: TimelineItem = { kind: 'assistant', id: 'a1', seq: 0, text: 'First part.\n\nSecond part.' };
  const turn: TimelineItem = { kind: 'turn', id: 'end', seq: 0, status: 'completed', durationMs: 3000 };
  v = viewOf([user, read, { ...run, tool: { ...run.tool, status: 'ok', durationMs: 2000 } }, reply, turn]);
  r = pr.take(v);
  assert.deepEqual(r.lines, ['', '  Second part.', '', '  ✓ 3.0 s']);
  // A step between a text's chunks: one blank line each side.
  const pr3 = new Printer(look(60));
  pr3.take(viewOf([], { items: [{ kind: 'assistant', id: 'z', seq: 0, ts: 1, text: 'One.\n\nTw', streaming: true }] }));
  const after = pr3.take(viewOf([tool({ name: 'Read', category: 'read', title: '/r' }, { id: 'tr' }), { kind: 'assistant', id: 'z', seq: 0, text: 'One.\n\nTwo.' }]));
  assert.deepEqual(after.lines, ['', '  ● Read /r', '', '  Two.']);
  assert.deepEqual(pr.take(v).lines, []);
  assert.equal(lastReply(v.items), 'First part.\n\nSecond part.');
  // A step up to Max leaves the program's own "/model …" and what it printed after the reply: they are not the person's, and the reply stands.
  const slash: TimelineItem = { kind: 'user', id: 'm1', seq: 0, text: '/model claude-fable-5-2', meta: 'slash' };
  const printed: TimelineItem = { kind: 'user', id: 'm2', seq: 0, text: 'Set model to claude-fable-5-2', meta: 'command-output' };
  assert.equal(lastReply([user, reply, slash, printed, turn]), 'First part.\n\nSecond part.');
  // A step in the background is printed as it starts.
  const bg = tool({ name: 'Bash', category: 'command', title: 'npm run dev', status: 'running', background: true }, { id: 'bg' });
  const p2 = new Printer(look(60), { brief: true });
  assert.match(p2.take(viewOf([bg])).lines.join('\n'), /in the background/);
});

test('settled: not while the session or a subagent has a task running in the background', () => {
  const v = viewOf([{ kind: 'user', id: 'u', seq: 0, text: 'go' }, { kind: 'turn', id: 't', seq: 0, status: 'completed' }]);
  v.live = { status: 'idle', startedAt: 0, pendingApprovals: 0, backgroundTasks: [{ id: 'b', description: 'Check the docs', kind: 'local_agent', status: 'running' }] };
  assert.equal(v.settled(), false);
  // A command left running in the background (a dev server) may never end: it does not hold the work back.
  v.live = { ...v.live, backgroundTasks: [{ id: 'd', description: 'npm run dev', kind: 'local_bash', status: 'running' }] };
  assert.equal(v.settled(), true);
  assert.deepEqual(v.background(), []);
  const child: ChildNote = { child: 'claude:c', agent: 'claude', label: 'L', title: 'T', brief: '', cwd: '/', startedAt: 0 };
  const idle = { status: 'idle' as const, startedAt: 0, pendingApprovals: 0 };
  v.helpers.set('claude:c', { key: 'claude:c', note: child, turns: 1, replies: 1, summary: { key: 'claude:c', agent: 'claude', id: 'c', title: 'T', stats: {} as SessionSummary['stats'], live: { ...idle, backgroundTasks: [{ id: 'x', description: 'Run the tests', kind: 'local_agent', status: 'running' }] } } });
  assert.equal(v.settled(), false, 'a subagent’s task in the background');
  assert.deepEqual(v.background().map((b) => [b.key, b.task.description]), [['claude:c', 'Run the tests']]);
  // Its end woke the agent: the turn before it is not the last one.
  v.items.push({ kind: 'system', id: 's', seq: 2, level: 'info', text: 'Background task completed: Check the docs' });
  assert.equal(v.lastTurn(), undefined);
  assert.equal(itemLinesOf(v.items[2]), '  ◆ Finished in the background: Check the docs');
});

test('history: turns folded to a line each (each step with -v), with the reply and the end', () => {
  const items: TimelineItem[] = [
    { kind: 'user', id: 'u', seq: 0, text: 'do it' },
    tool({ name: 'Bash', category: 'command', title: 'a' }),
    { kind: 'assistant', id: 'n', seq: 0, text: 'Checking.' },
    tool({ name: 'Read', category: 'read', title: '/x' }),
    { kind: 'assistant', id: 'r', seq: 0, text: 'Done it.' },
    { kind: 'turn', id: 't', seq: 0, status: 'completed', durationMs: 1000 },
  ];
  const v = viewOf(items);
  assert.deepEqual(historyLines(v.items, [], look(60)), ['› do it', '', '  ● Ran 1 command, read 1 file', '', '  Done it.', '', '  ✓ 1.0 s']);
  const verbose = historyLines(v.items, [], look(60, { verbose: true })).join('\n');
  assert.match(verbose, /Checking\./);
  assert.match(verbose, /● Read \/x/);
});

// ---- a fake server ---------------------------------------------------------------------------------------------------

const TOKEN = 'acm_tuitesttoken0000000000000000';
interface Fake {
  key: string;
  summary: SessionSummary;
  items: TimelineItem[];
  live: LiveState | null;
  overlay: LiveOverlay;
  notes: SessionNote[];
  answers: { id: string; body: any }[];
  waitAnswer?: (b: any) => void;
}
const fakes = new Map<string, Fake>();
const calls: { method: string; path: string; body: any }[] = [];
const sockets = new Set<{ ws: WebSocket; subs: Set<string> }>();
let tiersState: any = {
  tiers: { claude: { quick: { model: 'haiku' }, standard: { model: 'sonnet' }, best: { model: 'opus' }, max: { model: 'fable' } }, codex: { quick: { effort: 'low' }, standard: {}, best: {}, max: {} }, console: { quick: {}, standard: {}, best: {}, max: {} } },
  defaults: { claude: { quick: { model: 'haiku' }, standard: { model: 'sonnet' }, best: { model: 'opus' }, max: { model: 'fable' } }, codex: { quick: {}, standard: {}, best: {}, max: {} }, console: { quick: {}, standard: {}, best: {}, max: {} } },
  team: { on: true, hard: false },
};
let seqKey = 0;

const toSubs = (key: string, e: unknown) => {
  const s = JSON.stringify(e);
  for (const c of sockets) if (c.subs.has(key) && c.ws.readyState === c.ws.OPEN) c.ws.send(s);
};
const toAll = (e: unknown) => {
  const s = JSON.stringify(e);
  for (const c of sockets) if (c.ws.readyState === c.ws.OPEN) c.ws.send(s);
};
const summaryOf = (f: Fake): SessionSummary => ({ ...f.summary, live: f.live });
function push(f: Fake, it: TimelineItem) {
  const item = { ...it, seq: f.items.length } as TimelineItem;
  f.items.push(item);
  toSubs(f.key, { t: 'items', key: f.key, items: [item], total: f.items.length });
}
function setLive(f: Fake, live: Partial<LiveState> | null, overlay: Partial<LiveOverlay> = {}) {
  f.live = live ? { startedAt: Date.now(), pendingApprovals: 0, ...f.live, ...live } as LiveState : null;
  f.overlay = { items: [], patches: {}, approvals: [], ...overlay };
  toSubs(f.key, { t: 'live', key: f.key, live: f.live, overlay: f.overlay });
  toAll({ t: 'sessions', upsert: [summaryOf(f)] });
}
function newFake(title: string, extra: Record<string, unknown> = {}): Fake {
  const id = `${String(++seqKey).padStart(4, '0')}abcd-0000-4000-8000-000000000000`;
  const f: Fake = {
    key: `claude:${id}`,
    summary: { key: `claude:${id}`, agent: 'claude', id, title, cwd: '/home/u/proj', stats: { userMessages: 0, assistantMessages: 0, toolCalls: 0, commands: 0, backgroundCommands: 0, filesChanged: 0, linesAdded: 0, linesRemoved: 0, turns: 0, tokensIn: 100, tokensOut: 20, tokensCached: 0, costUsd: 0.01 }, extra, updatedAt: Date.now() },
    items: [],
    live: null,
    overlay: { items: [], patches: {}, approvals: [] },
    notes: [],
    answers: [],
  };
  fakes.set(f.key, f);
  return f;
}
const turnEnd = (status = 'completed', durationMs = 900): TimelineItem => ({ kind: 'turn', id: `turn:${Math.random()}`, seq: 0, status, durationMs, model: 'claude-opus-5-5' });

/** What a session does with a message, by its words. */
async function play(f: Fake, text: string) {
  push(f, { kind: 'user', id: `u${Math.random()}`, seq: 0, ts: Date.now(), text });
  setLive(f, { status: 'working', turnStartedAt: Date.now(), model: 'claude-opus-5-5' });
  await sleep(150);
  if (/fail/.test(text)) {
    push(f, { kind: 'system', id: 'err', seq: 0, level: 'error', text: 'API Error: overloaded' });
    push(f, turnEnd('failed'));
    setLive(f, { status: 'idle' });
    return;
  }
  if (/slow/.test(text)) return; // works until stopped
  if (/limit/.test(text)) {
    // The plan's usage is used up: the turn ends at once, with nothing in it.
    f.items.pop();
    setLive(f, { status: 'idle' });
    return;
  }
  if (/ask me questions/.test(text)) {
    // Questions (one pick, several picks, your own words), then a form a connected app asks for.
    const q: ApprovalRequest = {
      id: 'q1',
      title: 'A few questions',
      kind: 'question',
      createdAt: Date.now(),
      questions: [
        { id: 'color', header: 'Colour', question: 'Which colour?', options: [{ label: 'Red' }, { label: 'Blue', description: 'calm' }] },
        { id: 'size', question: 'Which sizes?', multiSelect: true, options: [{ label: 'S' }, { label: 'M' }, { label: 'L' }] },
        { id: 'name', question: 'Its name?', options: [{ label: 'Default' }] },
      ],
      options: [{ id: 'answer', label: 'Send answers', style: 'primary' }, { id: 'deny', label: 'Skip' }],
    };
    setLive(f, { status: 'waiting', pendingApprovals: 1 }, { approvals: [q] });
    f.answers.push({ id: q.id, body: await new Promise<any>((r) => (f.waitAnswer = r)) });
    const form: ApprovalRequest = {
      id: 'f1',
      title: 'Where to?',
      kind: 'other',
      from: 'Maps',
      createdAt: Date.now(),
      form: { fields: [{ id: 'city', label: 'City', type: 'text', required: true }, { id: 'when', label: 'When', type: 'choice', options: ['Today', 'Tomorrow'] }, { id: 'pets', label: 'Pets', type: 'yesno', default: 'No' }] },
      options: [{ id: 'accept', label: 'Send' }, { id: 'decline', label: 'Decline' }],
    };
    setLive(f, { status: 'waiting', pendingApprovals: 1 }, { approvals: [form] });
    f.answers.push({ id: form.id, body: await new Promise<any>((r) => (f.waitAnswer = r)) });
    setLive(f, { status: 'working', pendingApprovals: 0 });
  }
  if (/work in the background/.test(text)) {
    // Claude Code's own Agent tool in the background: the turn ends with it running, and its end wakes the lead.
    push(f, { kind: 'assistant', id: `a${Math.random()}`, seq: 0, text: 'A subagent is running; I’ll review it as it comes back.' });
    push(f, turnEnd());
    const devServer = { id: 'dev', description: 'npm run dev', kind: 'local_bash', status: 'running', startedAt: Date.now() };
    setLive(f, { status: 'idle', backgroundTasks: [devServer, { id: 'bg1', description: 'Check the docs', kind: 'local_agent', status: 'running', startedAt: Date.now() }] });
    await sleep(1800);
    // It ends: its notice, a moment with nothing running and the lead idle, then the turn it wakes.
    push(f, { kind: 'system', id: `bg${Math.random()}`, seq: 0, ts: Date.now(), level: 'info', text: 'Background task completed: Check the docs' });
    setLive(f, { status: 'idle', backgroundTasks: [devServer] });
    await sleep(700);
    setLive(f, { status: 'working', turnStartedAt: Date.now() });
    await sleep(150);
    push(f, { kind: 'assistant', id: `a${Math.random()}`, seq: 0, text: 'The docs check out.' });
    push(f, turnEnd());
    // The dev server goes on running: the work is done all the same.
    setLive(f, { status: 'idle', backgroundTasks: [devServer] });
    return;
  }
  if (/approve/.test(text)) {
    const a: ApprovalRequest = { ...APPROVAL, createdAt: Date.now() };
    setLive(f, { status: 'waiting', pendingApprovals: 1 }, { approvals: [a], items: [{ kind: 'tool', id: 'tb', seq: 0, ts: Date.now(), tool: { name: 'Bash', category: 'command', title: 'npm test', status: 'pending' } }] });
    const answer = await new Promise<any>((r) => (f.waitAnswer = r));
    f.answers.push({ id: a.id, body: answer });
    setLive(f, { status: 'working', pendingApprovals: 0 });
    push(f, { kind: 'tool', id: 'tb', seq: 0, tool: { name: 'Bash', category: 'command', title: 'npm test', status: answer.decision === 'deny' ? 'declined' : 'ok', durationMs: 1600 } });
    await sleep(100);
  }
  if (/drop/.test(text)) {
    // The socket drops; what happens meanwhile comes with the reload after it is back.
    for (const c of sockets) c.ws.terminate();
    await sleep(50);
    push(f, { kind: 'tool', id: 'td', seq: 0, tool: { name: 'Read', category: 'read', title: '/home/u/proj/missed.ts', status: 'ok' } });
    await sleep(400);
  }
  if (/subagent/.test(text)) {
    const c = newFake('Count the files', { parent: f.key });
    setLive(c, { status: 'working', turnStartedAt: Date.now() });
    const note: SessionNote = { id: `n${Math.random()}`, key: f.key, kind: 'child', at: Date.now(), data: { child: c.key, agent: 'claude', label: 'Claude Code · haiku', title: 'Count the files', brief: 'count', cwd: '/', tier: 'quick', startedAt: Date.now() } satisfies ChildNote };
    f.notes.push(note);
    toSubs(f.key, { t: 'note', key: f.key, note });
    push(f, { kind: 'assistant', id: `a${Math.random()}`, seq: 0, text: 'A subagent counts them; I wait for it.' });
    push(f, turnEnd());
    setLive(f, { status: 'idle' });
    await sleep(1600);
    c.summary.stats.costUsd = 0.02;
    setLive(c, { status: 'idle' });
    // Its reply reaches the lead a moment later, and wakes it.
    await sleep(900);
    push(f, { kind: 'user', id: `u${Math.random()}`, seq: 0, ts: Date.now(), text: `[Reply from the Hydor subagent "Count the files" (${c.key}, Claude Code · haiku)]\n\n42 files.` });
    setLive(f, { status: 'working', turnStartedAt: Date.now() });
    await sleep(200);
    push(f, { kind: 'assistant', id: `a${Math.random()}`, seq: 0, text: 'There are **42** files.' });
    push(f, turnEnd());
    setLive(f, { status: 'idle' });
    return;
  }
  // A reply that streams, a step, then the reply whole.
  const id = `a${Math.random()}`;
  setLive(f, {}, { items: [{ kind: 'assistant', id, seq: 0, ts: Date.now(), text: 'Hello', streaming: true }] });
  await sleep(150);
  setLive(f, {}, { items: [{ kind: 'assistant', id, seq: 0, ts: Date.now(), text: 'Hello there.\n\nI looked', streaming: true }] });
  await sleep(/chat/.test(text) ? 1500 : 150);
  push(f, { kind: 'tool', id: `t${Math.random()}`, seq: 0, tool: { name: 'Read', category: 'read', title: '/home/u/proj/README.md', status: 'ok' } });
  push(f, { kind: 'assistant', id, seq: 0, text: 'Hello there.\n\nI looked at the README.' });
  push(f, turnEnd());
  setLive(f, { status: 'idle' });
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    const send = (code: number, v: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(v));
    };
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    const body = raw ? JSON.parse(raw) : undefined;
    if (p === '/api/health') return send(200, { ok: true, version: '9.9.9' });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: 'That access token is not valid here' });
    calls.push({ method: req.method!, path: p + url.search, body });
    const m = /^\/api\/sessions\/([^/]+)(\/.*)?$/.exec(p);
    const f = m ? fakes.get(decodeURIComponent(m[1])) : undefined;
    const rest = m?.[2] ?? '';
    if (p === '/api/bootstrap') return send(200, { version: '9.9.9', home: '/home/u', defaultCwd: '/home/u', start: { agent: 'claude', runs: { claude: { mode: 'default' } } }, acpAgents: [{ id: 'console', name: 'Custom', command: '', args: [], builtin: true }] });
    if (p === '/api/git/repo-info') return send(200, { info: { repo: '/home/u', branch: 'main', sub: '' } });
    if (p === '/api/fs/find') {
      const q = url.searchParams.get('q') ?? '';
      // A slow answer for 'slo', to arrive after the one for 'slow'.
      if (q === 'slo') await sleep(700);
      const all = ['src/chat.ts', 'src/client.ts', 'src/sub/deep.ts', 'README.md', 'docs/guide.md'];
      const subseq = (f: string) => {
        let at = 0;
        for (const ch of q.toLowerCase()) {
          at = f.toLowerCase().indexOf(ch, at) + 1;
          if (!at) return false;
        }
        return true;
      };
      const root = url.searchParams.get('root') ?? '/home/u';
      const hit = q === 'slo' ? [`${root}/STALE.txt`] : q === 'slow' ? [`${root}/fresh.txt`] : all.filter(subseq).map((f) => `${root}/${f}`);
      return send(200, { files: hit });
    }
    if (p === '/api/fs/list') {
      const dir = url.searchParams.get('path') ?? '';
      const entries = /\/src\/?$/.test(dir) ? [{ name: 'chat.ts', type: 'file' }, { name: 'sub', type: 'dir' }] : [{ name: 'docs', type: 'dir' }, { name: 'src', type: 'dir' }, { name: 'README.md', type: 'file' }];
      return send(200, { entries });
    }
    if (p === '/api/models/tiers' && req.method === 'GET') return send(200, tiersState);
    if (p === '/api/models/tiers' && req.method === 'PUT') {
      if (body.tiers) tiersState = { ...tiersState, tiers: Object.keys(body.tiers).length ? body.tiers : tiersState.defaults };
      if (body.team) tiersState = { ...tiersState, team: body.team };
      return send(200, tiersState);
    }
    if (p.startsWith('/api/catalog/')) return send(200, { models: [{ value: 'opus', label: 'Opus 5.5', resolved: 'claude-opus-5-5', efforts: ['low', 'high'], isDefault: true }, { value: 'haiku', label: 'Haiku 4.5', resolved: 'claude-haiku-4-5', efforts: [] }], modes: [{ value: 'default', label: 'Ask', description: '' }, { value: 'acceptEdits', label: 'Accept edits', description: '' }, { value: 'bypassPermissions', label: 'Full access', description: '' }], defaultMode: 'default', commands: [{ name: 'compact' }] });
    if (p === '/api/usage') return send(200, { claude: { agent: 'claude', ok: true, fetchedAt: Date.now(), windows: [{ id: 'w', label: 'Weekly · all models', usedPercent: 100, resetsAt: Date.now() + 3 * 3600_000 }], limited: { label: 'Weekly · all models', resetsAt: Date.now() + 3 * 3600_000 } } });
    if (p === '/api/assistants') return send(200, { assistants: [{ id: 'general', name: 'General', icon: 'sparkles', description: 'Anything', instructions: '', builtin: true }] });
    if (p === '/api/sessions' && req.method === 'POST') {
      const s = newFake(String(body.prompt).slice(0, 40));
      send(200, { key: s.key });
      setLive(s, { status: 'starting' });
      await sleep(120);
      void play(s, String(body.prompt));
      return;
    }
    if (p === '/api/sessions' && req.method === 'GET') {
      const list = [...fakes.values()].map(summaryOf).reverse();
      return send(200, { sessions: list, total: list.length });
    }
    if (!f) return send(404, { error: 'Session not found' });
    if (rest === '' && req.method === 'GET') return send(200, { summary: summaryOf(f), live: f.live, overlay: f.overlay });
    if (rest === '/timeline') return send(200, { items: f.items, total: f.items.length, start: 0 });
    if (rest === '/notes') return send(200, { notes: f.notes });
    if (rest === '/__device') {
      // What the server sends a session's subscribers when an agent changes the device's settings (PUT /device).
      toSubs(f.key, { t: 'feature', id: 'guide', key: f.key, data: { device: body } });
      return send(200, { ok: true });
    }
    if (rest === '/message') {
      send(200, { ok: true });
      void play(f, String(body.text));
      return;
    }
    if (rest === '/queue') {
      f.summary.queue = [...(f.summary.queue ?? []), { id: `q${Math.random()}`, text: body.text, at: Date.now() }];
      toAll({ t: 'sessions', upsert: [summaryOf(f)] });
      return send(200, { ok: true });
    }
    if (rest === '/interrupt') {
      push(f, turnEnd('interrupted'));
      setLive(f, { status: 'idle' });
      return send(200, { ok: true });
    }
    const ap = /^\/approvals\/(.+)$/.exec(rest);
    if (ap) {
      f.waitAnswer?.(body);
      f.waitAnswer = undefined;
      return send(200, { ok: true });
    }
    send(404, { error: 'Not found' });
  });
});
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws' || req.headers.authorization !== `Bearer ${TOKEN}`) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const c = { ws, subs: new Set<string>() };
    sockets.add(c);
    ws.send(JSON.stringify({ t: 'hello', version: '9.9.9' }));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.t === 'sub') {
        c.subs.add(m.key);
        const f = fakes.get(m.key);
        if (f) ws.send(JSON.stringify({ t: 'live', key: m.key, live: f.live, overlay: f.overlay }));
      } else if (m.t === 'unsub') c.subs.delete(m.key);
    });
    ws.on('close', () => sockets.delete(c));
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

// The command itself, built beside this test.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cliDir = path.join(here, 'tui-cli');
execFileSync(process.execPath, ['scripts/build-server.mjs', 'server/cli.ts'], { cwd: root, env: { ...process.env, OUTDIR: cliDir }, stdio: 'inherit' });
const CLI = path.join(cliDir, 'cli.js');
const ENV = { ...process.env, HYDOR_URL: BASE, HYDOR_TOKEN: TOKEN, DATA_DIR: DATA, NO_COLOR: '1', FORCE_COLOR: undefined as unknown as string, CUDA_VISIBLE_DEVICES: '' };

/** Runs `hydor …` to its end: its exit code and what it printed. */
function hydor(args: string[], o: { env?: Record<string, string>; input?: string; timeoutMs?: number } = {}): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [CLI, ...args], { env: { ...ENV, ...o.env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (err += d));
    const t = setTimeout(() => (c.kill('SIGKILL'), reject(new Error(`hydor ${args.join(' ')} took too long:\n${out}\n${err}`))), o.timeoutMs ?? 20_000);
    c.on('close', (code) => (clearTimeout(t), resolve({ code: code ?? -1, out, err })));
    c.stdin.end(o.input ?? '');
  });
}

test('run: streamed items, the reply on stdout, exit 0', async () => {
  const r = await hydor(['run', 'say hello']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.trim(), 'Hello there.\n\nI looked at the README.');
  const start = calls.find((c) => c.method === 'POST' && c.path === '/api/sessions' && c.body.prompt === 'say hello')!;
  assert.equal(start.body.agent, 'claude');
  assert.equal(start.body.model, 'auto', 'Automatic, as the server has a team');
  assert.equal(start.body.mode, 'default');
  assert.match(start.body.startId, /^new-[a-z0-9]{8,40}$/);
});

test('run --json: one object; the message from stdin', async () => {
  const r = await hydor(['run', '--json', '--model', 'haiku', '--mode', 'full', '--cap', '3'], { input: 'say hello from stdin\n' });
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.status, 'done');
  assert.equal(j.reply, 'Hello there.\n\nI looked at the README.');
  assert.equal(j.url, `${BASE}/s/${encodeURIComponent(j.key)}`);
  assert.equal(j.turns, 1);
  assert.deepEqual(j.tokens, { in: 100, out: 20, cached: 0 });
  assert.equal(typeof j.durationMs, 'number');
  const start = calls.find((c) => c.method === 'POST' && c.path === '/api/sessions' && c.body.prompt === 'say hello from stdin')!;
  assert.equal(start.body.model, 'haiku');
  assert.equal(start.body.mode, 'bypassPermissions');
  assert.deepEqual(start.body.extra, { capUsd: 3 });
});

test('run: a subagent’s reply wakes the lead, and the run waits for the turn after it', async () => {
  const r = await hydor(['run', '--json', 'count with a subagent']);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.reply, 'There are **42** files.');
  assert.equal(j.turns, 2);
  assert.equal(j.children.length, 1);
  assert.deepEqual({ ...j.children[0], key: '' }, { key: '', title: 'Count the files', label: 'Claude Code · haiku', tier: 'quick', costUsd: 0.02, status: 'done' });
  assert.equal(j.costUsd, 0.03);
});

test('run --stream-json: a line per event, the result last', async () => {
  const r = await hydor(['run', '--stream-json', 'stream a subagent']);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.type === 'item' && l.item.kind === 'user'));
  assert.ok(lines.some((l) => l.type === 'live' && l.live?.status === 'working'));
  assert.ok(lines.some((l) => l.type === 'note' && l.note.kind === 'child'));
  assert.equal(lines.at(-1).type, 'result');
  assert.equal(lines.at(-1).status, 'done');
});

test('run: a failed turn exits 1, an approval with nobody to answer 3, a timeout 124', async () => {
  const failed = await hydor(['run', '--json', 'this will fail']);
  assert.equal(failed.code, 1);
  assert.equal(JSON.parse(failed.out).error, 'API Error: overloaded');
  const asks = await hydor(['run', 'please approve this']);
  assert.equal(asks.code, 3);
  assert.match(asks.err, /It needs an answer: Run npm test/);
  assert.match(asks.err, /hydor resume claude:/);
  const slow = await hydor(['run', '--json', '--timeout', '1', 'be slow']);
  assert.equal(slow.code, 124);
  assert.equal(JSON.parse(slow.out).status, 'timeout');
  const key = JSON.parse(slow.out).key;
  assert.ok(calls.some((c) => c.method === 'POST' && c.path === `/api/sessions/${encodeURIComponent(key)}/interrupt`), 'its turn was stopped');
});

test('run: a turn that ends with nothing in it (a usage limit) fails, and says why', async () => {
  const r = await hydor(['run', '--json', 'hit the limit']);
  assert.equal(r.code, 1);
  const j = JSON.parse(r.out);
  assert.equal(j.status, 'failed');
  assert.match(j.error, /^Claude Code is at its usage limit \(Weekly · all models\): it lifts in 2h 59m|^Claude Code is at its usage limit \(Weekly · all models\): it lifts in 3h 0m/);
});

test('run: a turn that ends with a task in the background waits for the turn its end wakes', async () => {
  const r = await hydor(['run', '--json', 'work in the background']);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.status, 'done');
  assert.equal(j.reply, 'The docs check out.', 'not the reply while it was running');
  assert.equal(j.turns, 2);
  assert.ok(j.durationMs >= 2400, String(j.durationMs));
});

test('run: a socket that drops and comes back misses nothing', async () => {
  const r = await hydor(['run', '--stream-json', 'drop the line']);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.type === 'item' && l.item.kind === 'tool' && l.item.tool.title.endsWith('missed.ts')), 'the step made while it was down');
  assert.equal(lines.at(-1).reply, 'Hello there.\n\nI looked at the README.');
});

test('a token the server refuses, and bad usage', async () => {
  const r = await hydor(['sessions'], { env: { HYDOR_TOKEN: 'acm_wrong' } });
  assert.equal(r.code, 1);
  assert.match(r.err, /That access token is not valid here/);
  const u = await hydor(['run']);
  assert.equal(u.code, 2);
  const typo = await hydor(['sesions']);
  assert.equal(typo.code, 2);
  assert.match(typo.err, /Unknown command: sesions/);
});

test('sessions --json, show, send, stop', async () => {
  const r = await hydor(['sessions', '--json']);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.ok(j.sessions.length >= 3);
  assert.ok(j.sessions.every((s: SessionSummary) => !s.extra?.parent), 'subagents only with --all');
  const all = JSON.parse((await hydor(['sessions', '--json', '--all'])).out);
  assert.ok(all.sessions.some((s: SessionSummary) => s.extra?.parent));
  const text = await hydor(['sessions']);
  assert.match(text.out, /say hello/);
  const one = j.sessions.find((s: SessionSummary) => s.title === 'say hello');
  const shown = await hydor(['show', one.id.slice(0, 4)]);
  assert.equal(shown.code, 0, shown.err);
  assert.match(shown.out, /› say hello/);
  assert.match(shown.out, /Hello there\./);
  const sent = await hydor(['send', one.key, 'and again']);
  assert.equal(sent.out.trim(), 'Sent.');
  await sleep(1500);
  const stopped = await hydor(['stop', one.key]);
  assert.equal(stopped.out.trim(), 'Stopped its turn.');
});

test('tiers: shown, set, the team switched', async () => {
  const shown = await hydor(['tiers']);
  assert.equal(shown.code, 0, shown.err);
  assert.match(shown.out, /Quick +Haiku 4\.5/);
  assert.match(shown.out, /Max/);
  assert.match(shown.out, /Lead with subagents: on    Max for hard problems: off/);
  const set = await hydor(['tiers', 'set', 'claude', 'best', 'haiku', '--effort', 'high']);
  assert.equal(set.code, 0, set.err);
  const put = calls.filter((c) => c.method === 'PUT' && c.path === '/api/models/tiers').at(-1)!;
  assert.deepEqual(put.body.tiers.claude.best, { model: 'haiku', effort: 'high' });
  assert.deepEqual(put.body.tiers.claude.quick, { model: 'haiku' }, 'the rest kept');
  const team = await hydor(['tiers', 'team', 'off']);
  assert.equal(team.code, 0, team.err);
  assert.deepEqual(calls.filter((c) => c.method === 'PUT').at(-1)!.body, { team: { on: false, hard: false } });
  assert.equal((await hydor(['tiers', 'set', 'claude', 'huge', 'opus'])).code, 2);
  // Without a team, the model is the server's default.
  await hydor(['run', 'say hello without a team']);
  assert.equal(calls.find((c) => c.method === 'POST' && c.body?.prompt === 'say hello without a team')!.body.model, undefined);
});

// ---- the chat, in a pseudo-terminal ------------------------------------------------------------------------------------

/** The chat in a pseudo-terminal, its screen kept in a headless xterm. */
async function chatIn(cols: number, o: { args?: string[]; env?: Record<string, string | undefined> } = {}) {
  const { default: xterm } = (await import('@xterm/xterm')) as any;
  const term = new (xterm?.Terminal ?? (await import('@xterm/xterm')).Terminal)({ cols, rows: 30, allowProposedApi: true, scrollback: 500 });
  const env = { ...ENV, NO_COLOR: '', TERM: 'xterm-256color', ...o.env } as Record<string, string>;
  delete env.NO_COLOR;
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const p = pty.spawn(process.execPath, [CLI, ...(o.args ?? [])], { cols, rows: 30, env, cwd: DATA });
  let raw = '';
  let exit: number | null = null;
  p.onData((d) => {
    raw += d;
    term.write(d);
  });
  p.onExit((e) => (exit = e.exitCode));
  const screen = () =>
    new Promise<string>((r) =>
      term.write('', () => {
        const b = term.buffer.active;
        const out: string[] = [];
        for (let i = 0; i < b.length; i++) out.push(b.getLine(i)!.translateToString(true));
        r(out.join('\n').replace(/\n+$/, ''));
      }),
    );
  const until = async (re: RegExp, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = await screen();
      if (re.test(s)) return s;
      await sleep(50);
    }
    throw new Error(`The screen never showed ${re}:\n${await screen()}\n---- what it wrote last:\n${JSON.stringify(raw.slice(-3000))}`);
  };
  const resize = (c: number) => {
    p.resize(c, 30);
    term.resize(c, 30);
  };
  return { p, screen, until, resize, raw: () => raw, exit: () => exit };
}

for (const cols of [80, 120]) {
  test(`the chat at ${cols} columns: a message, a streamed reply, an approval by key, a queued message, a paste, Ctrl+C twice`, async () => {
    fs.writeFileSync(path.join(DATA, 'terminal.json'), '{"enter":"queue"}');
    const c = await chatIn(cols);
    await c.until(/HYDΩR 9\.9\.9/);
    await c.until(/What should the agent do\?/);
    c.p.write('please approve a chat\r');
    await c.until(/y Allow/);
    c.p.write('y');
    await c.until(/✓ Allow/);
    await c.until(/Hello there\./);
    // The working line: the spinner shaded across the logo's colours (256 here), a bright band across the word, the rest dim.
    assert.match(c.raw(), /\x1b\[38;[25];[\d;]+m[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\x1b\[39m/);
    assert.match(c.raw(), /\x1b\[2mW\x1b\[22m\x1b\[2mo|\x1b\[1mW\x1b\[22m/);
    // While it works, a message is queued.
    c.p.write('and then this\r');
    await c.until(/queued: and then this/);
    await c.until(/✓ 900 ms · Opus 5\.5/, 10_000);
    const answered = fakes.get([...fakes.values()].filter((f) => f.summary.title.startsWith('please approve a chat')).at(-1)!.key)!;
    assert.equal(answered.answers[0]?.body.decision, 'allow');
    assert.ok(calls.some((x) => x.path.endsWith('/queue') && x.body.text === 'and then this'));
    // A paste with its line breaks comes whole into the input line.
    c.p.write('\x1b[200~first line\nsecond line\x1b[201~');
    await c.until(/› first line\n {2}second line/);
    // Ctrl+C clears what is typed, then asks before leaving.
    c.p.write('\x03');
    await c.until(/› Message the agent/);
    c.p.write('\x03');
    await c.until(/Ctrl\+C again to leave/);
    c.p.write('\x03');
    const t0 = Date.now();
    while (c.exit() === null && Date.now() - t0 < 5000) await sleep(50);
    assert.equal(c.exit(), 0);
    fs.rmSync(path.join(DATA, 'terminal.json'), { force: true });
    const s = await c.screen();
    assert.match(s, /Carry on with: hydor resume/);
    fs.writeFileSync(path.join(DATA, `chat-screen-${cols}.txt`), s + '\n');
    // The terminal given back: the cursor shown, paste marks off.
    assert.ok(c.raw().lastIndexOf('\x1b[?25h') > c.raw().lastIndexOf('\x1b[?25l'));
    assert.ok(c.raw().includes('\x1b[?2004l'));
    // Nothing printed for good was ever printed twice.
    assert.equal(s.split('\n').filter((l) => l.includes('› please approve a chat')).length, 1);
    assert.equal(s.split('\n').filter((l) => l.includes('Hello there.')).length, 1);
    for (const l of s.split('\n')) assert.ok(strWidth(l) <= cols, l);
  });
}

test('the chat: Tab completes, a question and a form answered field by field, Esc stops a turn, a resize while it works', async () => {
  const c = await chatIn(100);
  await c.until(/What should the agent do\?/);
  c.p.write('/he\t');
  await c.until(/› \/help $/m);
  c.p.write('\x15/ti\t');
  await c.until(/› \/tiers $/m);
  c.p.write('\x15');
  c.p.write('ask me questions\r');
  await c.until(/Which colour\?/);
  assert.match(await c.screen(), /2 Blue · calm/);
  c.p.write('2');
  await c.until(/Which sizes\?/);
  // Two picks in one read, as quick typing over a slow link sends them.
  c.p.write('13');
  await c.until(/1 \[x\] S\n.*\n.*3 \[x\] L/);
  c.p.write('\r');
  await c.until(/Its name\?/);
  c.p.write('Rex\r');
  await c.until(/City \(needed\)/);
  c.p.write('\r');
  await c.until(/It is needed/);
  c.p.write('Lisbon\r');
  await c.until(/When/);
  c.p.write('2');
  await c.until(/Pets/);
  c.p.write('\r');
  await c.until(/Hello there\./);
  const f = [...fakes.values()].filter((x) => x.summary.title.startsWith('ask me questions')).at(-1)!;
  assert.deepEqual(f.answers[0].body, { decision: 'answer', answers: { color: 'Blue', size: 'S, L', name: 'Rex' } });
  assert.deepEqual(f.answers[1].body, { decision: 'accept', answers: {}, form: { city: 'Lisbon', when: 'Tomorrow', pets: 'No' } });
  await c.until(/✓ 900 ms/);
  // A task in the background: shown while it runs, its end a line, then the turn it wakes; /subagents lists it.
  c.p.write('work in the background\r');
  await c.until(/◆ At work in the background: Check the docs/);
  await c.until(/each one that ends wakes the agent/);
  await c.until(/◆ Finished in the background: Check the docs/);
  await c.until(/The docs check out\./);
  c.p.write('/subagents\r');
  await c.until(/Finished {2}Check the docs · in the background/);
  // A turn that runs until stopped: Esc stops it, a resize meanwhile draws the region again at the new width.
  c.p.write('be slow\r');
  await c.until(/Working · \d+ s · esc to stop/);
  c.resize(70);
  await sleep(300);
  c.p.write('\x1b');
  await c.until(/■ Stopped/);
  assert.ok(calls.some((x) => x.method === 'POST' && x.path === `/api/sessions/${encodeURIComponent([...fakes.values()].at(-1)!.key)}/interrupt`));
  c.p.write('\x04');
  const t0 = Date.now();
  while (c.exit() === null && Date.now() - t0 < 5000) await sleep(50);
  assert.equal(c.exit(), 0);
  const tail = (await c.screen()).split('\n').slice(-6);
  for (const l of tail) assert.ok(strWidth(l) <= 70, l);
});


test('the chat: the welcome box, the rules and the status line, and none of it wider than the terminal at 60, 100 and 140 columns', async () => {
  for (const cols of [60, 100, 140]) {
    const c = await chatIn(cols);
    await c.until(/What should the agent do\?/);
    const s = await c.screen();
    // (A long scratch folder name cuts the lines on a narrow terminal: its text is looked at from 100 columns.)
    if (cols >= 100) assert.match(s, /╭─+╮\n│ HYDΩR 9\.9\.9 +│\n│ \S+ +⎇ main +│\n│ Claude Code · Opus 5\.5 · Ask +│\n│ on http:\/\/127\.0\.0\.1:\d+ +│\n╰─+╯\n {2}\/ commands · @ files/, `${cols}`);
    else assert.match(s, /╭─+╮\n│ HYDΩR 9\.9\.9 +│\n/);
    const lines = s.split('\n');
    const rules = lines.map((l, i) => (/^─+$/.test(l) ? i : -1)).filter((i) => i >= 0);
    assert.equal(rules.length, 2, 'a rule above and one below the input');
    assert.equal(rules[1] - rules[0], 2);
    assert.equal(lines[rules[0] + 1].startsWith('› '), true);
    assert.equal(lines[rules[0]].length, cols - 1);
    assert.match(lines[rules[1] + 1], /^ {2}\S+/);
    if (cols >= 100) assert.match(lines[rules[1] + 1], /^ {2}\S+ ⎇ main · Opus 5\.5 · Ask/);
    assert.equal(/\/help$/.test(lines[rules[1] + 1]), 2 + DATA.length + ' ⎇ main · Opus 5.5 · Ask'.length + 5 + 3 <= cols - 1, 'the right part goes when there is no room for it');
    c.p.write('/');
    await c.until(/❯ \/help/);
    for (const l of (await c.screen()).split('\n').slice(-12)) assert.ok(strWidth(l) <= cols - 1, `${cols}: ${l}`);
    c.p.write('\x15\x04');
    const t0 = Date.now();
    while (c.exit() === null && Date.now() - t0 < 5000) await sleep(50);
    assert.equal(c.exit(), 0);
  }
});

test('the chat: the menu opens as you type, Esc closes it, Tab completes, Enter runs a command or puts a file in', async () => {
  const c = await chatIn(100, { env: { PATH: '/nonexistent', DISPLAY: undefined, WAYLAND_DISPLAY: undefined } });
  await c.until(/What should the agent do\?/);
  c.p.write('/');
  await c.until(/❯ \/help +these commands and the keys/);
  c.p.write('comp');
  await c.until(/❯ \/compact/);
  c.p.write('\x7f\x7f\x7f\x7f');
  c.p.write('mdl');
  await c.until(/❯ \/model +\[name\|auto\] +the model/);
  assert.doesNotMatch((await c.screen()).split('\n').slice(-6).join('\n'), /\/mode /, 'mdl does not match mode');
  // Esc closes it and keeps the text; it stays closed until the text changes.
  c.p.write('\x1b');
  await c.until(/› \/mdl\n─+\n {2}\S+/);
  c.p.write('\x7f');
  await c.until(/❯ \/(model|mode)/);
  c.p.write('\x15');
  await c.until(/ {2}\S+ ⎇ main/);
  // Tab on an empty line opens the commands.
  c.p.write('\t');
  await c.until(/› \/\n─+\n❯ \/help/);
  c.p.write('\x15');
  // ↑ wraps to the last row, ↓ back to the first; Tab puts it in.
  c.p.write('/');
  await c.until(/❯ \/help/);
  c.p.write('\x1b[A');
  await c.until(/❯ \/compact/);
  assert.doesNotMatch(await c.screen(), /❯ \/help/);
  c.p.write('\x1b[B');
  await c.until(/❯ \/help/);
  c.p.write('\x15');
  // A value: /model then a name runs it.
  c.p.write('/model ha');
  await c.until(/❯ haiku +Haiku 4\.5/);
  assert.match(await c.screen(), /\n {2}.*\n?/);
  c.p.write('\r');
  await c.until(/Model: Haiku 4\.5/);
  // A command that needs no argument runs at once; /clear clears the screen.
  c.p.write('/cop');
  await c.until(/❯ \/copy/);
  c.p.write('\r');
  await c.until(/No reply to copy yet/);
  c.p.write('/ke\r');
  await c.until(/Alt\+Enter \/ Ctrl\+J/);
  assert.doesNotMatch(await c.screen(), /Commands\n/, '/keys shows just the keys');
  // Files: the folder part dim, the name normal; a folder opens, a file goes in with a space.
  c.p.write('look at @');
  await c.until(/❯ docs\/\n {2}src\/\n {2}README\.md/);
  c.p.write('\x1b[B\r');
  await c.until(/› look at @src\/\n─+\n❯ src\/sub\/\n {2}src\/chat\.ts/m);
  c.p.write('\x7f\x7f\x7f\x7fch');
  await c.until(/❯ src\/chat\.ts/);
  c.p.write('\r');
  await c.until(/› look at @src\/chat\.ts $/m);
  assert.doesNotMatch(await c.screen(), /❯/, 'the menu is closed once the file is in');
  assert.ok(calls.some((x) => x.path.startsWith('/api/fs/find?root=') && x.path.endsWith('&q=ch')));
  c.p.write('\x15');
  // What arrives out of order is dropped: the answer for "slo" comes after the one for "slow".
  c.p.write('@slo');
  await sleep(150);
  c.p.write('w');
  await c.until(/❯ fresh\.txt/);
  await sleep(1000);
  assert.doesNotMatch(await c.screen(), /STALE/);
  c.p.write('\x15\x04');
  const t0 = Date.now();
  while (c.exit() === null && Date.now() - t0 < 5000) await sleep(50);
  assert.equal(c.exit(), 0);
});

test('the chat: a grey suggestion from history, Ctrl+R searches it, ! runs a shell command, /copy copies the last reply', async () => {
  fs.writeFileSync(path.join(DATA, 'terminal-history'), ['deploy the site to staging', 'fix the tests', 'line one\nline two', 'review the plan'].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const c = await chatIn(100, { env: { PATH: '/nonexistent', DISPLAY: undefined, WAYLAND_DISPLAY: undefined } });
  await c.until(/What should the agent do\?/);
  // The suggestion shows after the cursor; → takes it (Home and a letter show where the cursor was).
  c.p.write('deplo');
  await c.until(/› deploy the site to staging/);
  assert.match(c.raw(), /deplo\x1b\[0m\r\n|deplo\x1b\[2m y the site to staging\x1b\[22m|\x1b\[2my the site to staging\x1b\[22m/);
  c.p.write('\x1b[C\x01X');
  await c.until(/› Xdeploy the site to staging/);
  // Alt+→ takes one word of it.
  c.p.write('\x05\x15de');
  await c.until(/› deploy the site to staging/);
  c.p.write('\x1b[1;3C\x01X');
  await c.until(/› Xdeploy$/m);
  // Ctrl+R: newest first, line breaks as ↵, filtered by what is typed.
  c.p.write('\x05\x15\x12');
  await c.until(/Search earlier messages/);
  await c.until(/❯ review the plan\n {2}line one↵line two\n {2}fix the tests\n {2}deploy the site to staging/);
  c.p.write('\x12');
  await c.until(/ {2}review the plan\n❯ line one↵line two/);
  c.p.write('fx');
  await c.until(/❯ fix the tests/);
  c.p.write('\r');
  // In the input, not sent.
  await c.until(/› fix the tests\n─+\n {2}\/tmp/);
  assert.ok(!calls.some((x) => x.method === 'POST' && x.body?.prompt === 'fix the tests'));
  // Esc closes the search and keeps the text.
  c.p.write('\x15\x12');
  await c.until(/❯ review the plan/);
  c.p.write('r\x1b');
  await c.until(/› r\n─+\n {2}\/tmp/);
  c.p.write('\x15');
  // A shell command: its output, then the chat again; a failure says its exit code.
  c.p.write('!echo hi there');
  await c.until(/^› !echo hi there$/m);
  assert.ok(c.raw().includes('\x1b[33m›\x1b[39m !echo hi there'), 'the › is yellow in shell mode');
  c.p.write('\r');
  await c.until(/\$ echo hi there\nhi there\n/);
  c.p.write('!false\r');
  await c.until(/\$ false\nexit 1/);
  c.p.write('!pwd\r');
  await c.until(/\$ pwd\n\/\S+/);
  // /copy: nothing before a reply, the reply after (OSC 52).
  c.p.write('say hello for the copy\r');
  await c.until(/I looked at the README\./);
  await c.until(/✓ 900 ms/);
  c.p.write('/copy\r');
  await c.until(/Copied the last reply \(3 lines\)/);
  assert.ok(c.raw().includes(`\x1b]52;c;${Buffer.from('Hello there.\n\nI looked at the README.').toString('base64')}\x07`), 'OSC 52');
  // The status line has the session now; its cost comes once there is one.
  assert.match(await c.screen(), /Opus 5\.5 · Ask/);
  c.p.write('\x15\x04');
  const t0 = Date.now();
  while (c.exit() === null && Date.now() - t0 < 5000) await sleep(50);
  assert.equal(c.exit(), 0);
});

test('the chat: a list to pick from filters as you type, Enter picks the highlighted row, a number still picks, Esc cancels', async () => {
  const c = await chatIn(100);
  await c.until(/What should the agent do\?/);
  c.p.write('/effort\r');
  await c.until(/How hard should it think\?\n❯ 1 low\n {2}2 high/);
  c.p.write('\x1b');
  await c.until(/› What should the agent do\?/);
  assert.doesNotMatch((await c.screen()).split('\n').slice(-5).join('\n'), /How hard/);
  c.p.write('/model\r');
  await c.until(/Which model\?\n❯ 1 Automatic +picked by the job[^\n]*\n {2}2 Opus 5\.5 +opus · default\n {2}3 Haiku 4\.5 +haiku/);
  c.p.write('\x1b[B');
  await c.until(/ {2}1 Automatic[^\n]*\n❯ 2 Opus 5\.5/);
  c.p.write('\x1b[A\x1b[A');
  await c.until(/ {2}1 Automatic[^\n]*\n {2}2 Opus[^\n]*\n❯ 3 Haiku/);
  c.p.write('\x1b[B');
  await c.until(/❯ 1 Automatic/);
  c.p.write('hai');
  await c.until(/Which model\?\n❯ 3 Haiku 4\.5 +haiku/);
  c.p.write('\r');
  await c.until(/Model: Haiku 4\.5/);
  // A digit alone on an empty line picks that row at once (with 9 or fewer).
  c.p.write('/mode\r');
  await c.until(/What may it do without asking\?/);
  c.p.write('3');
  await c.until(/Mode: Full access/);
  c.p.write('\x04');
  const t0 = Date.now();
  while (c.exit() === null && Date.now() - t0 < 5000) await sleep(50);
  assert.equal(c.exit(), 0);
});

test('hydor resume with no session named: the chat opens with the sessions to pick from, Esc leaves a new chat', async () => {
  const f = newFake('an earlier session');
  const c = await chatIn(100, { args: ['resume'] });
  await c.until(/Carry on with which session\?/);
  assert.match(await c.screen(), /❯ {2}1 an earlier session/);
  assert.doesNotMatch(await c.screen(), /╭/, 'no head yet');
  c.p.write('\x1b');
  await c.until(/╭─+╮[\s\S]*What should the agent do\?/);
  assert.doesNotMatch(await c.screen(), /Carry on with which/);
  c.p.write('\x04');
  const t0 = Date.now();
  while (c.exit() === null && Date.now() - t0 < 5000) await sleep(50);
  assert.equal(c.exit(), 0);
  // Picked instead: its head with its title, and its history.
  const d = await chatIn(100, { args: ['resume'] });
  await d.until(/Carry on with which session\?/);
  d.p.write('\r');
  await d.until(/│ an earlier session +│/);
  d.p.write('\x04');
  const t1 = Date.now();
  while (d.exit() === null && Date.now() - t1 < 5000) await sleep(50);
  assert.equal(d.exit(), 0);
  fakes.delete(f.key);
});


test('the chat: Enter while the agent works joins the turn (as set) or queues it, /queue and /now, an agent changing the device settings, the grey suggestion switched off', async () => {
  const terminalFile = path.join(DATA, 'terminal.json');
  fs.rmSync(terminalFile, { force: true });
  fs.writeFileSync(path.join(DATA, 'terminal-history'), `${JSON.stringify('deploy the site to staging')}\n`);
  const c = await chatIn(120);
  await c.until(/What should the agent do\?/);
  const sent = (suffix: string, text: string) => calls.filter((x) => x.method === 'POST' && x.path.endsWith(suffix) && x.body?.text === text).length;
  const waitFor = async (f: () => boolean) => {
    const t0 = Date.now();
    while (!f() && Date.now() - t0 < 6000) await sleep(50);
    assert.ok(f());
  };
  // The default: Enter sends into the running turn.
  c.p.write('be slow\r');
  await c.until(/Working · \d+ s/);
  await sleep(600);
  await c.until(/Enter sends into the running turn · \/queue waits for its end/);
  c.p.write('and also this\r');
  await waitFor(() => sent('/message', 'and also this') === 1);
  assert.equal(sent('/queue', 'and also this'), 0);
  await c.until(/› and also this/);
  await c.until(/✓ 900 ms/);
  // /queue always waits, /now always joins (a message to an idle agent just goes).
  c.p.write('be slow again\r');
  await c.until(/Working · \d+ s/);
  await sleep(600);
  c.p.write('/queue for later\r');
  await waitFor(() => sent('/queue', 'for later') === 1);
  assert.equal(sent('/message', 'for later'), 0);
  await c.until(/⧗ queued: for later/);
  c.p.write('/now right away\r');
  await waitFor(() => sent('/message', 'right away') === 1);
  assert.equal(sent('/queue', 'right away'), 0);
  // A command that needs its message waits for it: Enter in the menu puts the name in.
  c.p.write('/queue\r');
  await c.until(/› \/queue /m); // (the grey rest of an earlier /queue shows after it)
  c.p.write('\x15');
  // An agent changes the device settings: the terminal's two are kept and said, the rest is the browser's.
  const f = [...fakes.values()].at(-1)!;
  const device = (body: unknown) => fetch(`${BASE}/api/sessions/${encodeURIComponent(f.key)}/__device`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await device({ theme: 'dark', language: 'el' });
  await sleep(300);
  assert.equal(fs.existsSync(terminalFile), false, 'theme and language are not the terminal’s');
  await device({ enter: 'queue', terminalSuggestions: false, theme: 'dark' });
  await c.until(/Enter now waits for the turn to end · Grey suggestions are off/);
  assert.deepEqual(JSON.parse(fs.readFileSync(terminalFile, 'utf8')), { enter: 'queue', suggestions: false });
  // With Enter queuing, the placeholder says so, Enter queues, and /now still joins.
  c.p.write('be slow a third time\r');
  await c.until(/Working · \d+ s/);
  await sleep(600);
  await c.until(/Enter queues it for when the turn ends · \/now joins the turn/);
  c.p.write('wait for the end\r');
  await waitFor(() => sent('/queue', 'wait for the end') === 1);
  assert.equal(sent('/message', 'wait for the end'), 0);
  await device({ enter: 'join' });
  await c.until(/Enter now joins the running turn/);
  c.p.write('\x1b');
  await c.until(/■ Stopped/);
  // Suggestions off: nothing grey after what is typed.
  c.p.write('deplo');
  await c.until(/› deplo$/m);
  await sleep(300);
  assert.doesNotMatch(await c.screen(), /deploy the site/);
  await device({ terminalSuggestions: true });
  await c.until(/Grey suggestions are on/);
  c.p.write('y');
  await c.until(/› deploy the site to staging/);
  c.p.write('\x15\x04');
  const t0 = Date.now();
  while (c.exit() === null && Date.now() - t0 < 5000) await sleep(50);
  assert.equal(c.exit(), 0);
  fs.rmSync(terminalFile, { force: true });
});

test('the chat with stdout not a terminal: no colour and no region, each line typed sent', async () => {
  const out = path.join(DATA, 'plain-out.txt');
  const env = { ...ENV } as Record<string, string>;
  delete env.NO_COLOR;
  const p = pty.spawn('/bin/sh', ['-c', `exec "${process.execPath}" "${CLI}" > "${out}"`], { cols: 80, rows: 24, env, cwd: DATA });
  let exit: number | null = null;
  p.onExit((e) => (exit = e.exitCode));
  const read = () => (fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '');
  const until = async (re: RegExp) => {
    const t0 = Date.now();
    while (!re.test(read()) && Date.now() - t0 < 8000) await sleep(50);
    assert.match(read(), re);
  };
  await until(/HYDΩR 9\.9\.9/);
  p.write('say hello plainly\r');
  await until(/I looked at the README\./);
  p.write('\x04');
  const t0 = Date.now();
  while (exit === null && Date.now() - t0 < 8000) await sleep(50);
  assert.equal(exit, 0);
  const text = read();
  assert.ok(!text.includes('\x1b['), 'no escape codes');
  assert.match(text, /› say hello plainly\n\n {2}Hello there\.\n\n {2}● Read README\.md\n\n {2}I looked at the README\.\n\n {2}✓ 900 ms · Opus 5\.5/);
});

// ---- run ---------------------------------------------------------------------------------------------------------------

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
for (const c of sockets) c.ws.terminate();
wss.close();
server.close();
fs.rmSync(cliDir, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
