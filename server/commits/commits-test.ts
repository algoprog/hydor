// Script tests for the commits a turn made: reading git's "[main 1a2b3c4] subject" lines from the turn's
// commands (in the session's folder, after a `cd`, with `git -C`), leaving out a commit amended away, and the
// note under the turn that the commit's details come from. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/commits/commits-test.ts && DATA_DIR=/tmp/naget-test-commits node dist/dev/commits-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CommitsNote } from '../../shared/commits.ts';
import type { TimelineItem } from '../../shared/types.ts';
import { config } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { notesOf } from '../notes.ts';
import { commits, commitsMade } from './index.ts';

if (!config.dataDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so the test touches no real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-commits-test-'));
const db = openDb(path.join(tmp, 'test.db'));
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Bea', GIT_AUTHOR_EMAIL: 'bea@example.com', GIT_COMMITTER_NAME: 'Bea', GIT_COMMITTER_EMAIL: 'bea@example.com' };
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
let passed = 0;
const ok = () => passed++;

// A project, and a second repository the agent cd's into.
const proj = path.join(tmp, 'proj');
const other = path.join(tmp, 'other');
for (const r of [proj, other]) {
  fs.mkdirSync(r);
  sh(r, 'init', '-q', '-b', 'main');
  sh(r, 'config', 'user.name', 'Bea');
  sh(r, 'config', 'user.email', 'bea@example.com');
}
const commitIn = (r: string, file: string, text: string, msg: string, ...more: string[]) => {
  fs.writeFileSync(path.join(r, file), text);
  sh(r, 'add', file);
  return execFileSync('git', ['commit', '-m', msg, ...more], { cwd: r, env }).toString();
};
const out1 = commitIn(proj, 'a.txt', 'one\ntwo\n', 'Add a');
const gone = commitIn(proj, 'b.txt', 'x\n', 'Add b, first try');
const amended = commitIn(proj, 'b.txt', 'y\n', 'Add b', '--amend');
const out3 = commitIn(other, 'c.txt', 'c\n', 'Add c');
assert.match(out1, /^\[main \(root-commit\) [0-9a-f]+\] Add a/);

let seq = 0;
const cmd = (command: string, output: string, cwd?: string): TimelineItem => ({ id: `t${++seq}`, seq, kind: 'tool', tool: { name: 'Bash', category: 'command', title: command, status: 'ok', input: { command }, output, cwd } });
const items: TimelineItem[] = [
  { id: 'u1', seq: 0, kind: 'user', text: 'Make the files and commit' },
  cmd('git add a.txt && git commit -m "Add a"', out1),
  cmd('git commit -m "Add b, first try"', gone),
  cmd('git commit --amend -m "Add b"', amended),
  cmd('git status', 'On branch main\n[not a commit] line'),
  cmd(`cd ${other} && git commit -m "Add c"`, out3),
  { id: 'a1', seq: 99, kind: 'assistant', text: 'Done: three commits.' },
  { id: 'end', seq: 100, kind: 'turn', status: 'completed' },
];

// The commands' lines, each with where to look.
{
  const made = commitsMade(items.slice(1), proj);
  assert.deepEqual(
    made.map((m) => m.subject),
    ['Add a', 'Add b, first try', 'Add b', 'Add c'],
  );
  assert.equal(made[3].dirs[0], other);
  assert.equal(made[0].branch, 'main');
  // `git -C` and a cd that stays for the next command.
  const m2 = commitsMade([cmd('git -C ../other commit -m x', '[main 1234567] x', proj), cmd(`cd ${other}`, ''), cmd('git commit -m y', '[dev abcdef0] y')], proj);
  assert.equal(m2[0].dirs[0], other);
  assert.equal(m2[1].dirs[0], other);
  assert.equal(m2[1].branch, 'dev');
  ok();
}

// A turn ends: its note holds the commits still on a branch, the amended-away one left out.
{
  const d = {
    db,
    sessions: { summary: () => ({ cwd: proj }), timeline: async () => ({ parser: { items } }) },
  } as unknown as Deps;
  const t = { key: 's1', agent: 'claude' as const, cwd: proj, status: 'idle' as const, startedAt: 0, endedAt: Date.now(), external: false };
  await commits.turnEnd!(t, d);
  const notes = notesOf(db, 's1', 'commits');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].anchor, 'end');
  const c = (notes[0].data as CommitsNote).commits;
  assert.deepEqual(
    c.map((x) => x.subject),
    ['Add a', 'Add b', 'Add c'],
  );
  assert.equal(c[0].own, true);
  assert.equal(c[2].own, undefined);
  assert.equal(c[2].repo, fs.realpathSync(other));
  assert.equal(c[0].added, 2);
  assert.equal(c[0].files, 1);
  assert.equal(c[0].hash, sh(proj, 'rev-parse', 'HEAD~1'));
  // Told of the same turn again: still one note.
  await commits.turnEnd!(t, d);
  assert.equal(notesOf(db, 's1', 'commits').length, 1);
  ok();
}

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed`);
