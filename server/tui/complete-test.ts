// Checks for the chat's completion menu and its neighbours: loose matching and its ranking, what the text before the cursor
// is completing, the items for commands, values and history, the menu's rows (colours off, none wider than the terminal),
// the window that scrolls, the grey suggestion from history, the input laid out with it, the Ctrl+R key, and the colour
// levels the environment gives. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/complete-test.ts && DATA_DIR=/tmp/hydor-test-complete node dist/dev/complete-test.js
import assert from 'node:assert/strict';
import { argsRequired, commandItems, contextOf, filterKeep, fuzzy, historyItems, listsFolder, menuRows, rank, windowTop, type Ranked } from './complete.ts';
import { ghostOf, ghostWord, KeyReader, layout } from './editor.ts';
import { shimmer } from './lines.ts';
import { colorLevel, levelOf, makePaint, stripAnsi, strWidth } from './term.ts';
import { modeRisk } from './start.ts';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const off = makePaint(false);
const on = makePaint(true, 3);

test('fuzzy: letters in order, any case; an empty query matches all; mdl finds model and not mode', () => {
  assert.ok(fuzzy('mdl', 'model'));
  assert.equal(fuzzy('mdl', 'mode'), null);
  assert.equal(fuzzy('xyz', 'model'), null);
  assert.deepEqual(fuzzy('MoD', 'model')!.hits, [0, 1, 2]);
  assert.deepEqual(fuzzy('', 'anything'), { score: 0, hits: [] });
  assert.deepEqual(fuzzy('mdl', 'model')!.hits, [0, 2, 4]);
});

test('fuzzy: a match at the start, at word starts and in runs beats a scattered one; long texts and skipped letters cost', () => {
  const s = (q: string, t: string) => fuzzy(q, t)!.score;
  assert.ok(s('mod', 'model') > s('mod', 'a-remodel-thing'), 'start of the text over the middle');
  assert.ok(s('mod', 'model') > s('mod', 'my-old-dir'), 'a run over scattered letters');
  assert.ok(s('cc', 'chat-client') > s('cc', 'accounts'), 'word starts over the middle of a word');
  assert.ok(s('cc', 'src/chat/client.ts') > s('cc', 'src/accounts.ts'));
  assert.ok(s('ab', 'ab') > s('ab', 'ab' + 'x'.repeat(60)), 'long texts cost');
  assert.ok(s('ab', 'ab') > s('ab', 'axb'), 'skipped letters cost');
  assert.ok(s('fb', 'fooBar') > s('fb', 'foobar'), 'a capital after a small letter starts a word');
  // The best place to start wins, not the first.
  assert.deepEqual(fuzzy('ab', 'xaxxab')!.hits, [4, 5]);
});

test('rank: best first, ties in the order given, a hint can match too, nothing typed keeps the order', () => {
  const items = [
    { label: '/mode', value: '/mode', kind: 'command' as const, skip: 1 },
    { label: '/model', value: '/model', kind: 'command' as const, skip: 1 },
    { label: '/remote', value: '/remote', kind: 'command' as const, skip: 1 },
    { label: '/help', value: '/help', kind: 'command' as const, skip: 1 },
  ];
  assert.deepEqual(
    rank(items, 'mo').map((r) => r.item.label),
    ['/mode', '/model', '/remote'],
  );
  assert.deepEqual(
    rank(items, 'mdl').map((r) => r.item.label),
    ['/model'],
  );
  assert.deepEqual(rank(items, 'mdl')[0].hits, [1, 3, 5], 'hits count the / that is not matched');
  assert.deepEqual(
    rank(items, '').map((r) => r.item.label),
    items.map((i) => i.label),
  );
  const models = [{ label: 'opus', hint: 'Opus 5.5 · default', value: 'opus', kind: 'value' as const }];
  assert.equal(rank(models, '5.5').length, 1, 'the hint');
});

test('context: a /command, the value after one, an @file; nothing for the rest', () => {
  assert.deepEqual(contextOf('/'), { kind: 'commands', from: 0, query: '' });
  assert.deepEqual(contextOf('/mo'), { kind: 'commands', from: 0, query: 'mo' });
  assert.deepEqual(contextOf('/model '), { kind: 'values', cmd: 'model', from: 7, query: '' });
  assert.deepEqual(contextOf('/effort hi'), { kind: 'values', cmd: 'effort', from: 8, query: 'hi' });
  for (const c of ['model', 'mode', 'effort', 'agent', 'helpers', 'open']) assert.equal(contextOf(`/${c} x`)?.kind, 'values', c);
  assert.equal(contextOf('/rename new title'), null);
  assert.equal(contextOf('/model opus now'), null);
  assert.deepEqual(contextOf('look at @src/ch'), { kind: 'files', from: 8, query: 'src/ch' });
  assert.deepEqual(contextOf('@'), { kind: 'files', from: 0, query: '' });
  assert.deepEqual(contextOf('a\n@x'), { kind: 'files', from: 2, query: 'x' });
  assert.equal(contextOf('mail me@home'), null, 'an @ inside a word is not a file');
  assert.equal(contextOf('hello'), null);
  assert.equal(contextOf('/usr/bin and more'), null);
  assert.ok(listsFolder('') && listsFolder('src/') && listsFolder('~/x') && listsFolder('../a') && listsFolder('/etc'));
  assert.ok(!listsFolder('src/ch') && !listsFolder('chat'));
});

test('commands: the chat’s own first, the program’s after, nobody twice; arguments that cannot be left out', () => {
  assert.ok(argsRequired('<title>') && argsRequired('name') && argsRequired('[a] <b>'));
  assert.ok(!argsRequired('[message]') && !argsRequired('[ask|edits|plan|full]') && !argsRequired(undefined) && !argsRequired(''));
  const items = commandItems(
    [
      { name: 'help', what: 'these commands' },
      { name: 'rename', args: '<title>', what: 'rename it' },
      { name: 'new', args: '[message]', what: 'a new session' },
    ],
    [{ name: 'help', description: 'the program’s own help' }, { name: '/review', description: 'review code', argumentHint: '<pr>' }, { name: 'compact', argumentHint: '[focus]' }, { name: 'init' }],
  );
  assert.deepEqual(
    items.map((i) => i.label),
    ['/help', '/rename', '/new', '/review', '/compact', '/init'],
  );
  assert.deepEqual(
    items.map((i) => !!i.needsArg),
    [false, true, false, true, false, false],
  );
  assert.equal(items[1].hint, '<title>  rename it');
});

test('history: newest first, each once, line breaks as ↵, filtered loosely', () => {
  const h = ['first', 'fix the\ntests', 'second', 'first', 'other'];
  assert.deepEqual(
    historyItems(h, '').map((r) => r.item.label),
    ['other', 'first', 'second', 'fix the↵tests'],
  );
  assert.deepEqual(
    historyItems(h, 'ft').map((r) => r.item.label),
    ['first', 'fix the↵tests'],
  );
  assert.deepEqual(
    historyItems(h, 'fx').map((r) => r.item.label),
    ['fix the↵tests'],
  );
  assert.equal(historyItems(h, 'fx')[0].item.value, 'fix the\ntests', 'the message as it was');
});

/** The rows of a menu, without colour. */
const rows = (items: Ranked[], o: Partial<Parameters<typeof menuRows>[0]> = {}) => menuRows({ items, sel: 0, top: 0, rows: 8, width: 60, p: off, ...o }).map(stripAnsi);
const named = (labels: string[], hint?: string): Ranked[] => labels.map((label) => ({ item: { label, hint, value: label, kind: 'value' as const }, hits: [] }));

test('menu rows: ❯ on the selected row, labels padded to the widest, hints after, none wider than the terminal', () => {
  const r = rows([
    { item: { label: '/model', hint: '[name|auto]  the model', value: '/model', kind: 'command' }, hits: [] },
    { item: { label: '/new', hint: 'a new session', value: '/new', kind: 'command' }, hits: [] },
  ]);
  assert.deepEqual(r, ['❯ /model   [name|auto]  the model', '  /new     a new session']);
  assert.deepEqual(rows(named(['a', 'b']), { sel: 1 }), ['  a', '❯ b']);
  for (const width of [20, 40, 80]) {
    const long = named(['x'.repeat(50), 'short'], 'a hint that goes on and on and on and on and on and on and on');
    for (const l of rows(long, { width })) assert.ok(strWidth(l) <= width - 1, `${width}: ${l}`);
  }
  // Labels at most 28 columns by default; files and messages may be wider.
  assert.equal(rows(named(['y'.repeat(40)]), { width: 100 })[0].length, 2 + 28);
  assert.ok(rows(named(['y'.repeat(40)]), { width: 100, maxLabel: 100 })[0].includes('y'.repeat(40)));
  assert.deepEqual(rows([]), []);
  assert.deepEqual(rows([], { empty: 'No file matches' }), ['  No file matches']);
});

test('menu rows: more than fit shows a window with the selection in it and a line of how many are left', () => {
  const many = named(Array.from({ length: 30 }, (_, i) => `item${String(i).padStart(2, '0')}`));
  const first = rows(many);
  assert.equal(first.length, 9);
  assert.equal(first[8], '  ↑↓ 22 more');
  assert.equal(first[0], '❯ item00');
  const later = rows(many, { sel: 10, top: 0 });
  assert.equal(later.filter((l) => l.startsWith('❯')).length, 1);
  assert.equal(
    later.find((l) => l.startsWith('❯')),
    '❯ item10',
  );
  assert.equal(later[7], '❯ item10', 'the window moved so the selection is its last row');
  assert.equal(windowTop(30, 29, 0, 8), 22);
  assert.equal(windowTop(30, 3, 5, 8), 3);
  assert.equal(windowTop(5, 4, 0, 8), 0);
  assert.equal(rows(many.slice(0, 8)).length, 8, 'exactly as many as fit: no line of more');
});

test('menu rows: matched letters in the accent colour, the selected label bold, a file’s folder dim', () => {
  const q = 'cl';
  const items = filterKeep([{ label: 'src/client.ts', value: 'src/client.ts', kind: 'file' }], q);
  const [row] = menuRows({ items, sel: 0, top: 0, rows: 8, width: 60, p: makePaint(true, 2), maxLabel: 60 });
  assert.match(row, /\x1b\[2m\x1b\[1msrc\/\x1b\[22m\x1b\[22m|\x1b\[1m\x1b\[2msrc\/\x1b\[22m\x1b\[22m/, 'the folder dim');
  assert.match(row, /\x1b\[36mcl\x1b\[39m/, 'the typed letters in the accent colour');
  assert.ok(row.startsWith('\x1b[36m❯\x1b[39m '), 'the ❯ in the accent colour');
  assert.equal(stripAnsi(row), '❯ src/client.ts');
});

test('the grey suggestion: the rest of the newest earlier message, only at the end of one line of 2 or more characters', () => {
  const h = ['fix the tests', 'fix the build', 'other'];
  assert.equal(ghostOf('fix', 3, h), ' the build');
  assert.equal(ghostOf('fix the t', 9, h), 'ests');
  assert.equal(ghostOf('f', 1, h), '', 'one character is too little');
  assert.equal(ghostOf('fix', 2, h), '', 'the cursor not at the end');
  assert.equal(ghostOf('a\nfix', 5, h), '', 'one line only');
  assert.equal(ghostOf('fix the build', 13, h), '', 'nothing left to suggest');
  assert.equal(ghostOf('zzz', 3, h), '');
  assert.equal(ghostWord(' the build'), ' the');
  assert.equal(ghostWord('word'), 'word');
  assert.equal(ghostWord('  '), '  ');
});

test('layout with a ghost: dim after the cursor on its row, cut to fit, the cursor where it was', () => {
  const l = layout('fix', 3, 40, { prompt: '› ', ghost: ' the build', p: on });
  assert.equal(stripAnsi(l.rows[0]), '› fix the build');
  assert.match(l.rows[0], /\x1b\[2m the build\x1b\[22m$/);
  assert.deepEqual([l.cursorRow, l.cursorCol], [0, 5]);
  const cut = layout('fix', 3, 12, { prompt: '› ', ghost: ' the build and more', p: off });
  assert.equal(cut.rows[0], '› fix the b');
  assert.ok(strWidth(cut.rows[0]) <= 11);
  assert.equal(layout('fix', 3, 40, { prompt: '› ', ghost: 'a\nb', p: off }).rows[0], '› fixa↵b', 'line breaks as ↵');
  assert.equal(layout('', 0, 40, { prompt: '› ', placeholder: 'Message', ghost: 'x', p: off }).rows[0], '› Message');
  assert.equal(layout('fix', 1, 40, { prompt: '› ', ghost: ' the build', p: off }).rows[0], '› fix', 'none with the cursor inside the text');
});

test('keys: Ctrl+R, and Ctrl+P and Ctrl+N as arrows', () => {
  assert.deepEqual(
    new KeyReader().feed('\x12\x10\x0e').map((k) => k.name),
    ['ctrl-r', 'up', 'down'],
  );
});

test('colour levels from the environment', () => {
  assert.equal(levelOf({ COLORTERM: 'truecolor' }), 3);
  assert.equal(levelOf({ COLORTERM: '24bit', TERM: 'xterm' }), 3);
  for (const t of ['iTerm.app', 'WezTerm', 'vscode', 'ghostty']) assert.equal(levelOf({ TERM_PROGRAM: t }), 3, t);
  assert.equal(levelOf({ WT_SESSION: 'x' }), 3);
  assert.equal(levelOf({ TERM: 'xterm-256color' }), 2);
  assert.equal(levelOf({ TERM: 'screen-256color' }), 2);
  assert.equal(levelOf({ TERM_PROGRAM: 'Apple_Terminal', TERM: 'xterm' }), 2);
  assert.equal(levelOf({ TERM: 'xterm' }), 1);
  assert.equal(levelOf({}), 1);
  assert.equal(levelOf({ FORCE_COLOR: '1', COLORTERM: 'truecolor' }), 1, 'FORCE_COLOR names the level');
  assert.equal(levelOf({ FORCE_COLOR: '2' }), 2);
  assert.equal(levelOf({ FORCE_COLOR: '3', TERM: 'dumb' }), 3);
  assert.equal(levelOf({ FORCE_COLOR: 'true', TERM: 'xterm-256color' }), 2);
  const tty = { isTTY: true };
  assert.equal(colorLevel(tty, false, { TERM: 'xterm-256color' }), 2);
  assert.equal(colorLevel(tty, true, { TERM: 'xterm-256color' }), 0, '--no-color');
  assert.equal(colorLevel(tty, false, { TERM: 'xterm-256color', NO_COLOR: '1' }), 0);
  assert.equal(colorLevel({ isTTY: false }, false, { TERM: 'xterm-256color' }), 0, 'a pipe');
  assert.equal(colorLevel({ isTTY: false }, false, { FORCE_COLOR: '3' }), 3);
  assert.equal(colorLevel(tty, false, { TERM: 'dumb' }), 0);
});

test('hex colours and gradients by level: exact, the nearest of 256, or plain', () => {
  assert.equal(makePaint(true, 3).hex('x', '#4fd1c5'), '\x1b[38;2;79;209;197mx\x1b[39m');
  assert.equal(makePaint(true, 2).hex('x', '#4fd1c5'), '\x1b[38;5;116mx\x1b[39m');
  assert.equal(makePaint(true, 1).hex('x', '#4fd1c5'), 'x');
  assert.equal(makePaint(false).hex('x', '#4fd1c5'), 'x');
  const g = makePaint(true, 3).gradient('abc', ['#000000', '#ffffff']);
  assert.equal(stripAnsi(g), 'abc');
  assert.ok(g.startsWith('\x1b[38;2;0;0;0ma') && g.includes('\x1b[38;2;128;128;128mb') && g.includes('\x1b[38;2;255;255;255mc'));
  assert.equal(makePaint(true, 1).gradient('abc', ['#000000', '#ffffff']), 'abc');
  assert.equal(makePaint(false).gradient('abc', ['#000000', '#ffffff']), 'abc');
  // The existing callers: makePaint(true) styles, makePaint(false) is plain.
  assert.equal(makePaint(true).accent('x'), '\x1b[36mx\x1b[39m');
  assert.equal(makePaint(false).accent('x'), 'x');
  assert.equal(makePaint(false).level, 0);
});

test('the shimmer: a band of two or three letters brighter than the rest, none without colours', () => {
  const p = makePaint(true, 2);
  assert.equal(shimmer('Working', off), 'Working');
  for (const t of [0, 300, 600, 900, 1100]) {
    const s = shimmer('Working', p, t);
    assert.equal(stripAnsi(s), 'Working');
    const bold = (s.match(/\x1b\[1m/g) ?? []).length;
    assert.ok(bold >= 0 && bold <= 3, `${t}: ${bold}`);
  }
  assert.notEqual(shimmer('Working', p, 0), shimmer('Working', p, 600), 'it moves');
  assert.equal(shimmer('Working', p, 0), shimmer('Working', p, 1200), 'about every 1.2 s');
});

test('modes by what they allow', () => {
  for (const m of ['bypassPermissions', 'full']) assert.equal(modeRisk(m), 'full', m);
  assert.equal(modeRisk('plan'), 'plan');
  for (const m of ['default', 'acceptEdits', 'read-only', 'auto', 'ask', undefined]) assert.equal(modeRisk(m), 'other', String(m));
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
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
