// Checks for Codex's commands that outlive their turn (L2): the adapter counts its command items started and not
// completed (state.openCommands), so the goal loop can wait for what an interrupted turn left running. A command of an
// interrupted turn stays counted until its item completes after the turn, as Codex sends it; the person's own shell
// commands, another thread's and ones that never ran are not counted; a replayed history ends where it ends; and the
// count goes when Codex's process exits. Driven through the adapter's own line handler, with a stand-in for its runner.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/codex-commands-test.ts && node dist/dev/codex-commands-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CodexLive } from './codex.ts';

class Runner extends EventEmitter {
  meta = { runId: 'r1' };
  writeLine() {}
  stop() {}
}
const runner = new Runner();
const live = new CodexLive(runner as never, { cwd: '/test', threadId: 'thread-1' });
const line = (method: string, params: Record<string, unknown>, replay = false) => runner.emit('line', JSON.stringify({ method, params }), replay);
const command = (id: string, status: string, o: Record<string, unknown> = {}) => ({ type: 'commandExecution', id, status, source: 'agent', command: ['/bin/bash', '-lc', 'sleep 80'], cwd: '/test', ...o });
const open = () => live.state.openCommands;

// A turn starts a command; the turn is interrupted; the command runs on until its item completes, after the turn.
line('turn/started', { threadId: 'thread-1', turn: { id: 't1' } });
line('item/started', { threadId: 'thread-1', turnId: 't1', item: command('c1', 'inProgress') });
assert.equal(open(), 1);
line('item/started', { threadId: 'thread-1', turnId: 't1', item: command('c2', 'inProgress') });
line('item/completed', { threadId: 'thread-1', turnId: 't1', item: command('c2', 'completed') });
assert.equal(open(), 1, 'one that ended in the turn is not counted');
line('turn/completed', { threadId: 'thread-1', turn: { id: 't1', status: 'interrupted' } });
assert.equal(live.state.status, 'idle');
assert.equal(open(), 1, 'an interrupted turn’s command still runs');
line('item/completed', { threadId: 'thread-1', turnId: 't1', item: command('c1', 'completed') });
assert.equal(open(), undefined, 'ended by itself, after the turn');

// Not counted: the person's own shell command, another thread's (a subagent's), one declined before it ran.
line('item/started', { threadId: 'thread-1', item: command('u1', 'inProgress', { source: 'userShell' }) });
line('item/started', { threadId: 'thread-2', item: command('s1', 'inProgress') });
line('item/started', { threadId: 'thread-1', item: command('d1', 'declined') });
assert.equal(open(), undefined);

// A history replayed after a restart ends where it ends: started and completed, nothing open; started only, open.
line('item/started', { threadId: 'thread-1', item: command('r1', 'inProgress') }, true);
line('item/completed', { threadId: 'thread-1', item: command('r1', 'completed') }, true);
assert.equal(open(), undefined);
line('item/started', { threadId: 'thread-1', item: command('r2', 'inProgress') }, true);
assert.equal(open(), 1);

// Codex's process exits: its commands with it.
runner.emit('exit', { code: 0 });
assert.equal(open(), undefined);
console.log('codex commands: 6 checks passed');
// The adapter's sweep of a finished turn's items waits 20 s: nothing left to see here.
process.exit(0);
