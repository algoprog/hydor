// Hidden checker for todo-due. Run: node check.mjs <workdir>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const cliPath = path.join(dir, 'src', 'cli.mjs');
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

// A fresh scratch folder per case with its own TODO_FILE; `run` starts the program there.
function scratch() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-check-'));
  const file = path.join(tmp, 'data.json');
  const run = (...args) => {
    const r = spawnSync('node', [cliPath, ...args], { cwd: tmp, env: { ...process.env, TODO_FILE: file }, encoding: 'utf8', timeout: 10000 });
    return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
  };
  return { run, file, tmp, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}
const withScratch = (fn) => async () => {
  const s = scratch();
  try {
    await fn(s);
  } finally {
    s.cleanup();
  }
};
const lines = (out) => out.split('\n').filter((l) => l !== '');

test('add with --due prints added and list shows the date', withScratch(({ run }) => {
  const r = run('add', 'Pay rent', '--due', '2025-07-01');
  assert.equal(r.code, 0);
  assert.equal(r.out, 'added #1\n');
  assert.equal(run('list').out, '#1 Pay rent (due 2025-07-01)\n');
}));

test('add without --due and list keep the old format', withScratch(({ run }) => {
  assert.equal(run('add', 'Buy milk').out, 'added #1\n');
  assert.equal(run('add', 'Call', 'Ada').out, 'added #2\n');
  assert.equal(run('list').out, '#1 Buy milk\n#2 Call Ada\n');
  assert.equal(run('list').code, 0);
}));

test('--due may come before the title words', withScratch(({ run }) => {
  assert.equal(run('add', '--due', '2025-01-15', 'Buy', 'milk').out, 'added #1\n');
  assert.equal(run('list').out, '#1 Buy milk (due 2025-01-15)\n');
}));

test('an impossible date is rejected: exit 2, stderr, nothing added', withScratch(({ run }) => {
  const r = run('add', 'Bad', '--due', '2025-02-30');
  assert.equal(r.code, 2);
  assert.notEqual(r.err.trim(), '');
  assert.equal(r.out, '');
  assert.equal(run('list').out, 'nothing to do\n');
  assert.deepEqual(JSON.parse(run('list', '--json').out), []);
}));

test('other malformed dates are rejected the same way', withScratch(({ run }) => {
  for (const bad of ['2025-13-01', '2025-1-5', 'tomorrow', '2023-02-29', '2025-04-31', '2025-00-10', '2025-01-00', '25-01-01', '']) {
    const r = run('add', 'Bad', '--due', bad);
    assert.equal(r.code, 2, `date ${JSON.stringify(bad)}`);
    assert.notEqual(r.err.trim(), '');
  }
  const missing = run('add', 'Bad', '--due');
  assert.equal(missing.code, 2, 'missing date');
  assert.deepEqual(JSON.parse(run('list', '--json').out), []);
}));

test('real dates are accepted, including a leap day', withScratch(({ run }) => {
  assert.equal(run('add', 'Leap', '--due', '2024-02-29').code, 0);
  assert.equal(run('add', 'Century', '--due', '2000-02-29').code, 0);
  assert.equal(run('add', 'End', '--due', '2025-12-31').code, 0);
  assert.equal(run('add', 'NotLeap', '--due', '1900-02-29').code, 2);
  assert.equal(lines(run('list').out).length, 3);
}));

test('list sorts by due date, undated last, ties by id', withScratch(({ run }) => {
  run('add', 'A none');
  run('add', 'B late', '--due', '2025-09-01');
  run('add', 'C early', '--due', '2025-01-01');
  run('add', 'D none');
  run('add', 'E late', '--due', '2025-09-01');
  run('add', 'F mid', '--due', '2025-05-05');
  assert.equal(
    run('list').out,
    ['#3 C early (due 2025-01-01)', '#6 F mid (due 2025-05-05)', '#2 B late (due 2025-09-01)', '#5 E late (due 2025-09-01)', '#1 A none', '#4 D none'].join('\n') + '\n',
  );
}));

test('ids are ordered as numbers, not text', withScratch(({ run }) => {
  for (let i = 1; i <= 11; i++) run('add', `n${i}`, '--due', '2025-03-03');
  assert.deepEqual(lines(run('list').out).map((l) => l.split(' ')[0]), Array.from({ length: 11 }, (_, i) => `#${i + 1}`));
}));

test('list shows only open items', withScratch(({ run }) => {
  run('add', 'One', '--due', '2025-02-02');
  run('add', 'Two');
  run('add', 'Three', '--due', '2025-01-01');
  assert.equal(run('done', '3').out, 'done #3\n');
  assert.equal(run('list').out, '#1 One (due 2025-02-02)\n#2 Two\n');
  assert.equal(run('remove', '1').out, 'removed #1\n');
  assert.equal(run('list').out, '#2 Two\n');
}));

test('list --overdue --today shows open items due before today', withScratch(({ run }) => {
  run('add', 'Old', '--due', '2025-06-01');
  run('add', 'Older', '--due', '2025-05-01');
  run('add', 'Future', '--due', '2025-08-01');
  run('add', 'Undated');
  run('add', 'Finished', '--due', '2025-04-01');
  run('done', '5');
  const r = run('list', '--overdue', '--today', '2025-07-01');
  assert.equal(r.code, 0);
  assert.equal(r.out, '#2 Older (due 2025-05-01)\n#1 Old (due 2025-06-01)\n');
  assert.equal(run('list', '--today', '2025-07-01', '--overdue').out, r.out);
}));

test('an item due today is not overdue', withScratch(({ run }) => {
  run('add', 'Today', '--due', '2025-07-01');
  assert.equal(run('list', '--overdue', '--today', '2025-07-01').out, 'nothing to do\n');
  assert.equal(run('list', '--overdue', '--today', '2025-07-02').out, '#1 Today (due 2025-07-01)\n');
}));

test('--overdue without --today uses the current date', withScratch(({ run }) => {
  run('add', 'Ancient', '--due', '2000-01-01');
  run('add', 'Distant', '--due', '2999-12-31');
  assert.equal(run('list', '--overdue').out, '#1 Ancient (due 2000-01-01)\n');
  assert.match(run('stats').out, /^open: 2, done: 0, overdue: 1\n$/);
}));

test('list --json prints the shown items with id, title, done and due', withScratch(({ run }) => {
  run('add', 'Dated', '--due', '2025-03-01');
  run('add', 'Plain');
  run('add', 'Gone');
  run('done', '3');
  const r = run('list', '--json');
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.out), [
    { id: 1, title: 'Dated', done: false, due: '2025-03-01' },
    { id: 2, title: 'Plain', done: false, due: null },
  ]);
  for (const item of JSON.parse(r.out)) assert.deepEqual(Object.keys(item).sort(), ['done', 'due', 'id', 'title']);
}));

test('list --json combines with --overdue and prints [] when empty', withScratch(({ run }) => {
  assert.deepEqual(JSON.parse(run('list', '--json').out), []);
  run('add', 'Old', '--due', '2025-01-01');
  run('add', 'New', '--due', '2025-12-01');
  assert.deepEqual(JSON.parse(run('list', '--json', '--overdue', '--today', '2025-06-01').out), [
    { id: 1, title: 'Old', done: false, due: '2025-01-01' },
  ]);
  assert.deepEqual(JSON.parse(run('list', '--json', '--overdue', '--today', '2024-06-01').out), []);
}));

test('stats prints open, done and overdue', withScratch(({ run }) => {
  assert.equal(run('stats', '--today', '2025-06-01').out, 'open: 0, done: 0, overdue: 0\n');
  run('add', 'A', '--due', '2025-01-01');
  run('add', 'B', '--due', '2025-06-01');
  run('add', 'C');
  run('add', 'D', '--due', '2024-01-01');
  run('done', '4');
  const r = run('stats', '--today', '2025-06-01');
  assert.equal(r.code, 0);
  assert.equal(r.out, 'open: 3, done: 1, overdue: 1\n');
  assert.equal(run('stats', '--today', '2025-06-02').out, 'open: 3, done: 1, overdue: 2\n');
  assert.equal(run('stats', '--today', '2024-12-31').out, 'open: 3, done: 1, overdue: 0\n');
}));

test('an invalid --today is an error with exit code 2', withScratch(({ run }) => {
  run('add', 'A', '--due', '2025-01-01');
  for (const args of [['stats', '--today', '2025-02-30'], ['list', '--overdue', '--today', 'soon'], ['stats', '--today']]) {
    const r = run(...args);
    assert.equal(r.code, 2, args.join(' '));
    assert.notEqual(r.err.trim(), '');
  }
}));

test('files written before the change still load and work', withScratch(({ run, file }) => {
  fs.writeFileSync(file, JSON.stringify([{ id: 1, title: 'Old one', done: false }, { id: 2, title: 'Old done', done: true }], null, 2));
  assert.equal(run('list').out, '#1 Old one\n');
  assert.deepEqual(JSON.parse(run('list', '--json').out), [{ id: 1, title: 'Old one', done: false, due: null }]);
  assert.equal(run('stats', '--today', '2025-01-01').out, 'open: 1, done: 1, overdue: 0\n');
  assert.equal(run('add', 'New', '--due', '2025-02-02').out, 'added #3\n');
  assert.equal(run('list').out, '#3 New (due 2025-02-02)\n#1 Old one\n');
  assert.equal(run('done', '1').out, 'done #1\n');
}));

test('done and remove errors are as before', withScratch(({ run }) => {
  const r = run('done', '9');
  assert.equal(r.code, 1);
  assert.match(r.err, /no item #9/);
  assert.equal(run('remove', '9').code, 1);
  assert.equal(run('frobnicate').code, 2);
}));

test('README describes the new options', () => {
  const text = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  for (const word of ['--due', '--overdue', '--today', '--json', 'stats']) assert.ok(text.includes(word), `README does not mention ${word}`);
});

test('tests cover the new options and node --test passes', () => {
  const testDir = path.join(dir, 'test');
  const text = fs.readdirSync(testDir).filter((f) => f.endsWith('.mjs')).map((f) => fs.readFileSync(path.join(testDir, f), 'utf8')).join('\n');
  for (const word of ['--due', '--overdue', '--json', 'stats']) assert.ok(text.includes(word), `no test mentions ${word}`);
  const r = spawnSync('node', ['--test'], { cwd: dir, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stdout.slice(-300));
});

const failed = [];
for (const [name, fn] of cases) {
  try {
    await fn();
  } catch (e) {
    failed.push(name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${name}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
