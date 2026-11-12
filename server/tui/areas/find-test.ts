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

test('find: groups, one line a result (number, title, where), no addresses', async () => {
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
  assert.ok(!r.out.includes('http://'), 'no addresses unless asked');
  assert.match(r.out, /^ {2}1 +Fix login +~\/proj · 1h ago$/m);
  assert.match(r.out, /^ {2}2 +the rate limit is hit +Fix login$/m, 'the words said, then the session');
  assert.match(r.out, /^ {2}3 +Rate limits are 60 a minute +project$/m);
  assert.match(r.out, /^ {2}\d+ +Library$/m, 'a page of the app, from the catalog');
  assert.match(r.out, /^ {2}\d+ +Memory +Settings › Capabilities$/m);
  assert.match(r.out, /^ {2}\d+ +Appearance +Settings › App › General$/m);
  for (const name of ['Thesis', 'Reading list', 'Quiz', 'Coder', 'Daily brief', 'Tracker', 'Notion']) assert.match(r.out, new RegExp(`^ {2}\\d+ +${name}$`, 'm'), name);
  assert.match(r.out, /^ {2}\d+ +What a project is +Help › Projects and knowledge$/m);
  assert.match(r.out, /asst:gone/, 'what a list does not have: its id');
  assert.match(r.out, /weird:1/);
  assert.ok(t.calls.every((c) => c.method === 'GET'));
});

test('find --urls: each address on a dim line of its own under its result', async () => {
  const t = fakeConn({ [`GET /api/find?q=x`]: found, ...lists });
  const r = await run(t.conn, ['find', 'x', '--urls']);
  const lines = r.out.split('\n');
  const addr = (title: RegExp) => {
    const i = lines.findIndex((l) => title.test(l));
    assert.ok(i >= 0, String(title));
    return lines[i + 1].trim();
  };
  assert.equal(addr(/^ {2}1 +Fix login/), 'http://fake/s/claude%3As1');
  assert.equal(addr(/ the rate limit is hit/), 'http://fake/s/claude%3As1');
  assert.equal(addr(/Rate limits are 60/), 'http://fake/settings?s=memory');
  assert.equal(addr(/ Library$/), 'http://fake/library');
  assert.equal(addr(/Appearance +Settings/), 'http://fake/settings?s=general&find=Appearance');
  assert.equal(addr(/ Thesis$/), 'http://fake/projects/sp1');
  assert.equal(addr(/ Reading list$/), 'http://fake/apps/a1');
  assert.equal(addr(/ Quiz$/), 'http://fake/apps/t/quiz');
  assert.equal(addr(/ Coder$/), 'http://fake/agents/coder');
  assert.equal(addr(/ Daily brief$/), 'http://fake/settings?s=tasks&find=Daily%20brief');
  assert.equal(addr(/ Tracker$/), 'http://fake/pages/p1');
  assert.equal(addr(/ Notion$/), 'http://fake/apps/connected?tab=connected');
  assert.equal(addr(/What a project is +Help/), 'http://fake/guide/projects#what-a-project-is');
  assert.equal(addr(/^ {2}\d+ +Projects and knowledge$/), 'http://fake/guide/projects');
  // A result with no page of its own has no address line.
  const act = lines.findIndex((l) => /Switch between light and dark/.test(l));
  assert.ok(!/http/.test(lines[act + 1]));
});

test('find: at 120 columns no line passes the width, and the titles keep their room', async () => {
  const long = 'Limit each session’s spending with a cap so a long task cannot run away with your money';
  const t = fakeConn({
    [`GET /api/find?q=${encodeURIComponent('spending cap')}`]: {
      meaning: true,
      sessions: [{ key: 'claude:aaaa1111-0000-4000-8000-000000000001', title: long, cwd: '/home/u/a/very/deep/project/folder/name', updatedAt: Date.now() - 86_400_000 * 5 }],
      messages: [
        {
          key: 'claude:aaaa1111-0000-4000-8000-000000000001',
          title: 'A session with a rather long title indeed',
          cwd: '/x',
          updatedAt: 1,
          snippet: `set a \u0001spending\u0002 \u0001cap\u0002 of ${'ten dollars '.repeat(20)}`,
        },
      ],
      alike: [{ id: 'opt:general:Appearance', score: 1 }],
    },
  });
  for (const w of [120, 80, 60]) {
    for (const flags of [[], ['--urls']]) {
      const { testCtx } = await import('./test-kit.ts');
      const { parseArgv } = await import('../args.ts');
      const { find } = await import('./find.ts');
      const { ctx, ran } = testCtx(t.conn, 'hydor find <words…>', parseArgv(['find', 'spending', 'cap', ...flags]), { fit: true });
      ctx.look.width = w;
      await find.verbs[0].run(ctx, ['spending', 'cap'], flags.length ? { urls: true } : {});
      const lines = ran.out.split('\n');
      assert.ok(
        lines.every((l) => [...l].length <= w - 1),
        `${w} columns ${flags}: ${Math.max(...lines.map((l) => [...l].length))}`,
      );
      if (w === 120 && !flags.length) assert.match(ran.out, /Limit each session’s spending with a cap so a long task cannot run away with your money +~\/a/);
    }
  }
});

test('find: only the lists it needs are read; --in, --json, nothing found', async () => {
  const t = fakeConn({ [`GET /api/find?q=dark&in=settings`]: { meaning: true, alike: [{ id: 'sec:general', score: 1 }] }, [`GET /api/find?q=zzz`]: { meaning: false } });
  const r = await run(t.conn, ['find', 'dark', '--in', 'settings']);
  assert.deepEqual(
    t.calls.map((c) => c.path),
    ['/api/find?q=dark&in=settings'],
    'a shipped item needs no list',
  );
  assert.match(r.out, /^ {2}1 +General +Settings › App$/m);
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
