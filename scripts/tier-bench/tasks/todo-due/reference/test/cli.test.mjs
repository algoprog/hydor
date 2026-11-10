import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cli = path.join(import.meta.dirname, '..', 'src', 'cli.mjs');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-test-'));
  const env = { ...process.env, TODO_FILE: path.join(dir, 'todos.json') };
  const run = (...args) => spawnSync('node', [cli, ...args], { env, encoding: 'utf8' });
  return { run, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('add and list', () => {
  const { run, cleanup } = setup();
  try {
    assert.equal(run('add', 'Buy milk').stdout, 'added #1\n');
    assert.equal(run('add', 'Call Ada').stdout, 'added #2\n');
    assert.equal(run('list').stdout, '#1 Buy milk\n#2 Call Ada\n');
  } finally {
    cleanup();
  }
});

test('done hides an item and remove deletes it', () => {
  const { run, cleanup } = setup();
  try {
    run('add', 'One');
    run('add', 'Two');
    assert.equal(run('done', '1').stdout, 'done #1\n');
    assert.equal(run('list').stdout, '#2 Two\n');
    assert.equal(run('remove', '2').stdout, 'removed #2\n');
    assert.equal(run('list').stdout, 'nothing to do\n');
  } finally {
    cleanup();
  }
});

test('unknown ids fail', () => {
  const { run, cleanup } = setup();
  try {
    const r = run('done', '7');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no item #7/);
  } finally {
    cleanup();
  }
});

test('due dates: add, validate, sort and show', () => {
  const { run, cleanup } = setup();
  try {
    assert.equal(run('add', 'Later', '--due', '2025-07-01').stdout, 'added #1\n');
    assert.equal(run('add', '--due', '2025-06-01', 'Sooner').stdout, 'added #2\n');
    assert.equal(run('add', 'Whenever').stdout, 'added #3\n');
    assert.equal(run('list').stdout, '#2 Sooner (due 2025-06-01)\n#1 Later (due 2025-07-01)\n#3 Whenever\n');
    const bad = run('add', 'Nope', '--due', '2025-02-30');
    assert.equal(bad.status, 2);
    assert.notEqual(bad.stderr, '');
    assert.equal(run('list').stdout.split('\n').length, 4);
  } finally {
    cleanup();
  }
});

test('overdue, json and stats use --today', () => {
  const { run, cleanup } = setup();
  try {
    run('add', 'Late', '--due', '2025-06-01');
    run('add', 'Today', '--due', '2025-06-10');
    run('add', 'None');
    assert.equal(run('list', '--overdue', '--today', '2025-06-10').stdout, '#1 Late (due 2025-06-01)\n');
    assert.deepEqual(JSON.parse(run('list', '--json', '--overdue', '--today', '2025-06-10').stdout), [
      { id: 1, title: 'Late', done: false, due: '2025-06-01' },
    ]);
    assert.equal(run('stats', '--today', '2025-06-10').stdout, 'open: 3, done: 0, overdue: 1\n');
    assert.equal(run('stats', '--today', '2025-06-11').stdout, 'open: 3, done: 0, overdue: 2\n');
    assert.equal(run('stats', '--today', '2025-6-11').status, 2);
  } finally {
    cleanup();
  }
});

test('files without due dates still load', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-legacy-'));
  const file = path.join(dir, 'todos.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 1, title: 'Old', done: false }]));
  try {
    const r = spawnSync('node', [cli, 'list', '--json'], { env: { ...process.env, TODO_FILE: file }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(r.stdout), [{ id: 1, title: 'Old', done: false, due: null }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
