// Script tests for a session's timeline following its transcript: a Claude transcript that turns up somewhere
// else than where it was expected (another account's folder) is found and read there, so the session's steps
// end as done rather than showing running forever. Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/timeline-test.ts
//   DATA_DIR=/tmp/naget-test-timeline CLAUDE_CONFIG_DIR=/tmp/naget-test-timeline/claude node dist/dev/timeline-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentRoots, config } from './config.ts';
import { Timeline } from './timeline.ts';

if (!config.dataDir.startsWith('/tmp/') || !config.claudeProjectsDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and CLAUDE_CONFIG_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-timeline-test-'));
const account = path.join(tmp, 'account', 'projects');
agentRoots.claudeProjects = [config.claudeProjectsDir, account];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const transcript = (id: string) =>
  [
    { type: 'user', uuid: 'u1', timestamp: '2026-11-02T19:00:00.000Z', sessionId: id, message: { role: 'user', content: 'List the files' } },
    {
      type: 'assistant',
      uuid: 'a1',
      timestamp: '2026-11-02T19:00:01.000Z',
      message: { id: 'msg_1', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }], usage: { input_tokens: 10, output_tokens: 5 } },
    },
    {
      type: 'user',
      uuid: 'u2',
      timestamp: '2026-11-02T19:00:02.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'a\nb' }] },
      toolUseResult: { stdout: 'a\nb', stderr: '' },
    },
  ]
    .map((m) => JSON.stringify(m) + '\n')
    .join('');

// A session just started: its transcript is expected in one folder, and the CLI writes it in another.
const id = crypto.randomUUID();
const expected = path.join(config.claudeProjectsDir, '-home-u-proj', `${id}.jsonl`);
const written = path.join(account, '-home-u-proj', `${id}.jsonl`);
const tl = new Timeline(`claude:${id}`, 'claude', expected);
await tl.load(true);
assert.equal(tl.total, 0, 'nothing written yet');
fs.mkdirSync(path.dirname(written), { recursive: true });
fs.writeFileSync(written, transcript(id));
await wait(1100);
await tl.readMore();
assert.equal(tl.filePath, written, 'followed where the CLI wrote it');
const step = tl.item('toolu_1');
assert.equal(step?.kind === 'tool' && step.tool.status, 'ok', 'the command ran and ended');
tl.dispose();

// A transcript not written yet under its own name is waited for: another session's file is not taken for it.
const next = crypto.randomUUID();
const waiting = path.join(config.claudeProjectsDir, '-home-u-proj', `${next}.jsonl`);
const tl2 = new Timeline(`claude:${id}`, 'claude', waiting);
await tl2.load(true);
await wait(1100);
await tl2.readMore();
assert.equal(tl2.filePath, waiting);
assert.equal(tl2.total, 0);
tl2.dispose();

fs.rmSync(tmp, { recursive: true, force: true });
console.log('timeline-test: all passed');
