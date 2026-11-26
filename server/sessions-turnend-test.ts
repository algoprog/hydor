// Script test for when a live session's last turn counts as ended (SessionManager.timeline): a Claude Code session
// resting between turns (idle, no background task left) whose transcript was read after its turn's result has that
// turn closed, so opening the session later does not show it as still going (which reopened its document beside the
// conversation each time); one at work, or idle with a background agent still running, keeps it open.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sessions-turnend-test.ts
//   DATA_DIR=/tmp/hydor-test-turnend node dist/dev/sessions-turnend-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionManager } from './sessions.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-turnend-test-'));
const proto = SessionManager.prototype as any;
const KEY = 'claude:00000000-0000-0000-0000-0000000000aa';

/** A transcript with one prompt and its reply, and no next prompt: its turn is open until something closes it. */
function transcript(name: string): string {
  const file = path.join(tmp, `${name}.jsonl`);
  const at = (s: number) => new Date(Date.UTC(2026, 10, 26, 3, 0, s)).toISOString();
  const lines = [
    { type: 'user', uuid: 'u1', timestamp: at(0), message: { role: 'user', content: 'write the report' } },
    { type: 'assistant', uuid: 'a1', timestamp: at(30), message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'Done: report.md' }] } },
  ];
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

function manager(file: string, state: { status: string; backgroundTasks?: unknown[] } | null) {
  const m: any = {
    timelines: new Map(),
    lives: new Map(state ? [[KEY, { adapter: { state, exited: false, prune: () => {} } }]] : []),
    external: { get: () => null },
    transcriptFor: () => file,
    programRunning: () => null,
    dateTasks: () => false,
    queueSummary: () => {},
    emit: () => true,
  };
  return m;
}

async function lastKind(name: string, state: { status: string; backgroundTasks?: unknown[] } | null): Promise<string | undefined> {
  const m = manager(transcript(name), state);
  const tl = await proto.timeline.call(m, KEY);
  const items = tl.parser.items as { kind: string }[];
  tl.dispose();
  return items[items.length - 1]?.kind;
}

let passed = 0;
const cases: [string, () => Promise<void>][] = [
  ['a session not running has its last turn closed', async () => assert.equal(await lastKind('gone', null), 'turn')],
  ['a live session resting between turns has its last turn closed', async () => assert.equal(await lastKind('idle', { status: 'idle', backgroundTasks: [] }), 'turn')],
  ['a live session at work keeps its last turn open', async () => assert.equal(await lastKind('working', { status: 'working' }), 'assistant')],
  [
    'an idle session with a background agent still running keeps its last turn open',
    async () => assert.equal(await lastKind('bg', { status: 'idle', backgroundTasks: [{ id: 't1' }] }), 'assistant'),
  ],
];

for (const [name, fn] of cases) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${cases.length} passed`);
process.exit(process.exitCode ?? 0);
