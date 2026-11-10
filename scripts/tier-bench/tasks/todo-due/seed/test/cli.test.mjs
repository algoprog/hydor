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
