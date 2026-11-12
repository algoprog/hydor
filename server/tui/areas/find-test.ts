// Checks for `hydor find`: the grouped results (sessions, messages with the matches, memory, and what is found by
// meaning, named from the shipped catalog and from your own lists), each with its address, --in, --open, --json.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/find-test.ts && DATA_DIR=/tmp/hydor-test-find node dist/dev/find-test.js
import assert from 'node:assert/strict';
import { UsageError } from './kit.ts';
import { fakeConn, run } from './test-kit.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const found = {
  meaning: true,
  sessions: [{ key: 'claude:s1', title: 'Fix login', cwd: '/home/u/proj', updatedAt: Date.now() - 3_600_000 }],
  messages: [{ key: 'claude:s1', title: 'Fix login', cwd: '/home/u/proj', updatedAt: 1, kind: 'message', snippet: 'the \u0001rate\u0002 \u0001limit\u0002 is hit' }],
  notes: [{ id: 'n1', scope: 'project', text: 'Rate limits are 60 a minute', updatedAt: 1 }],
  alike: [
    'go:library',
    'sec:memory',
    'opt:general:Appearance',
    'app:a1',
    'app:tpl:quiz',
    'task:t1',
    'asst:coder',
    'skill:research',
    'page:p1',
    'conn:c1',
    'space:sp1',
    'guide:projects#what-a-project-is',
    'guide:projects',
    'do:theme',
    'theme:Midnight',
    'asst:gone',
    'weird:1',
  ].map((id, i) => ({ id, score: 0.9 - i / 100 })),
};
const lists = {
  '/api/apps': { apps: [{ id: 'a1', name: 'Reading list' }], templates: [{ id: 'quiz', name: 'Quiz' }] },
  '/api/tasks': { tasks: [{ id: 't1', name: 'Daily brief' }] },
  '/api/assistants': { assistants: [{ id: 'coder', name: 'Coder' }] },
  '/api/skillpack': { skills: [{ name: 'research' }] },
  '/api/pages': { pages: [{ id: 'p1', title: 'Tracker' }] },
  '/api/connections': { connections: [{ id: 'c1', name: 'Notion' }] },
  '/api/projects': { spaces: [{ id: 'sp1', name: 'Thesis' }] },
  '/api/guide': { topics: [{ id: 'projects', title: 'Projects and knowledge', sections: [{ id: 'what-a-project-is', title: 'What a project is' }] }] },
};

test('find: groups, names and addresses', async () => {
  const t = fakeConn({ [`GET /api/find?q=${encodeURIComponent('rate limit')}`]: found, ...lists });
  const r = await run(t.conn, ['find', 'rate', 'limit']);
  const groups = [...r.out.matchAll(/^([A-Z][A-Za-z, ]+)$/gm)].map((m) => m[1]);
  assert.deepEqual(groups, [
    'Sessions',
    'Messages',
    'Memory',
    'Go to',
    'Settings',
    'Projects',
    'Apps',
    'Agents',
    'Scheduled tasks',
    'Skills',
    'Pages',
    'Connections',
    'Guide',
    'Actions',
    'Themes',
    'Other',
  ]);
  assert.match(r.out, /^ {2}1 +Fix login +~\/proj · 1h ago +http:\/\/fake\/s\/claude%3As1$/m);
  assert.match(r.out, /the rate limit is hit +Fix login +http:\/\/fake\/s\/claude%3As1/);
  assert.match(r.out, /Rate limits are 60 a minute +project +http:\/\/fake\/settings\?s=memory/);
  assert.match(r.out, /Library .*http:\/\/fake\/library$/m, 'a page of the app, from the catalog');
  assert.match(r.out, /Memory +Settings › Capabilities +http:\/\/fake\/settings\?s=memory$/m);
  assert.match(r.out, /Appearance +Settings › App › General +http:\/\/fake\/settings\?s=general&find=Appearance$/m);
  assert.match(r.out, /Thesis +http:\/\/fake\/projects\/sp1$/m);
  assert.match(r.out, /Reading list +http:\/\/fake\/apps\/a1$/m);
  assert.match(r.out, /Quiz +http:\/\/fake\/apps\/t\/quiz$/m);
  assert.match(r.out, /Coder +http:\/\/fake\/agents\/coder$/m);
  assert.match(r.out, /Daily brief +http:\/\/fake\/settings\?s=tasks&find=Daily%20brief$/m);
  assert.match(r.out, /Tracker +http:\/\/fake\/pages\/p1$/m);
  assert.match(r.out, /Notion +http:\/\/fake\/apps\/connected\?tab=connected$/m);
  assert.match(r.out, /What a project is +Help › Projects and knowledge +http:\/\/fake\/guide\/projects#what-a-project-is$/m);
  assert.match(r.out, /Projects and knowledge +http:\/\/fake\/guide\/projects$/m);
  assert.match(r.out, /asst:gone/, 'what a list does not have: its id');
  assert.match(r.out, /weird:1/);
  assert.ok(t.calls.every((c) => c.method === 'GET'));
});

test('find: only the lists it needs are read; --in, --json, nothing found', async () => {
  const t = fakeConn({ [`GET /api/find?q=dark&in=settings`]: { meaning: true, alike: [{ id: 'sec:general', score: 1 }] }, [`GET /api/find?q=zzz`]: { meaning: false } });
  const r = await run(t.conn, ['find', 'dark', '--in', 'settings']);
  assert.deepEqual(
    t.calls.map((c) => c.path),
    ['/api/find?q=dark&in=settings'],
    'a shipped item needs no list',
  );
  assert.match(r.out, /General .*http:\/\/fake\/settings\?s=general$/m);
  const j = await run(t.conn, ['find', 'dark', '--in', 'settings', '--json']);
  assert.deepEqual(j.json, [{ meaning: true, alike: [{ id: 'sec:general', score: 1 }] }]);
  assert.match((await run(t.conn, ['find', 'zzz'])).out, /^Nothing found for “zzz”\.$/m);
});

test('find: --open opens the nth result; one without a page, or out of range, is refused', async () => {
  const t = fakeConn({ [`GET /api/find?q=x`]: found, ...lists });
  const r = await run(t.conn, ['find', 'x', '--open', '1']);
  assert.deepEqual(r.opened, ['http://fake/s/claude%3As1']);
  const act = [...(await run(t.conn, ['find', 'x'])).out.matchAll(/^ {2}(\d+) +Switch between light and dark/gm)][0][1];
  await assert.rejects(run(t.conn, ['find', 'x', '--open', act]), (e: Error) => e instanceof UsageError && /has no page of its own to open/.test(e.message));
  await assert.rejects(run(t.conn, ['find', 'x', '--open', '99']), /There is no result 99/);
  await assert.rejects(run(t.conn, ['find']), /^Error: Say the words: hydor find <words…>|Say the words/);
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
