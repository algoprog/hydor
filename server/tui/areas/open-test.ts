// Checks for `hydor open`: the app's address, pages by name ("Go to" items), settings sections, guide topics, projects,
// sessions; --browser asks the Ctx to open the address; the mistakes.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/open-test.ts && DATA_DIR=/tmp/hydor-test-open node dist/dev/open-test.js
import assert from 'node:assert/strict';
import { pages, pageWords } from './open.ts';
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
const s1 = { id: 'aaaa1111-0000', key: 'claude:aaaa1111-0000', title: 'Fix the login bug', cwd: '/x', updatedAt: 1, createdAt: 1 };
const routes = {
  'GET /api/sessions?limit=1000': { sessions: [s1] },
  'GET /api/projects': {
    spaces: [
      { id: 'sp1', name: 'Thesis' },
      { id: 'sp2', name: 'Lab notes' },
    ],
  },
  'GET /api/guide': {
    topics: [{ id: 'projects', title: 'Projects and knowledge', summary: '', body: '', sections: [{ id: 'what-a-project-is', title: 'What a project is', text: '' }], anchors: [] }],
  },
};
const out = async (...words: string[]) => (await run(fakeConn(routes).conn, ['open', ...words])).out.trim();

test('open: the app, and pages by name', async () => {
  assert.equal(await out(), 'http://fake');
  assert.equal(await out('library'), 'http://fake/library');
  assert.equal(await out('Library'), 'http://fake/library');
  assert.equal(await out('projects'), 'http://fake/projects', 'by its title; its id in the catalog is spaces');
  assert.equal(await out('spaces'), 'http://fake/projects');
  assert.equal(await out('inbox'), 'http://fake/inbox');
  assert.equal(await out('experiments'), 'http://fake/system/experiments');
  assert.equal(await out('connected-apps'), 'http://fake/apps/connected');
  assert.equal(await out('experi'), 'http://fake/system/experiments', 'the start of one page’s name');
  assert.ok(pages().length > 20);
  assert.ok(pageWords().some(([w]) => w === 'library') && pageWords().some(([w]) => w === 'settings'));
});

test('open: settings, guide, project', async () => {
  assert.equal(await out('settings'), 'http://fake/settings');
  assert.equal(await out('settings', 'memory'), 'http://fake/settings?s=memory');
  assert.equal(await out('settings', 'Scheduled', 'tasks'), 'http://fake/settings?s=tasks');
  assert.equal((await run(fakeConn(routes).conn, ['open', 'settings', 'general', '--find', 'dark mode'])).out.trim(), 'http://fake/settings?s=general&find=dark%20mode');
  await assert.rejects(out('settings', 'nonsense'), /^Error: No Settings section “nonsense”/);
  assert.equal(await out('guide'), 'http://fake/guide');
  assert.equal(await out('guide', 'projects'), 'http://fake/guide/projects');
  assert.equal(await out('guide', 'projects', 'what', 'a', 'project'), 'http://fake/guide/projects#what-a-project-is');
  assert.equal(await out('project', 'thesis'), 'http://fake/projects/sp1');
  assert.equal(await out('project', 'Lab', 'notes'), 'http://fake/projects/sp2');
  assert.equal(await out('project'), 'http://fake/projects');
  await assert.rejects(out('project', 'zzz'), /No project “zzz”/);
});

test('open: a session by key, id start or title; the mistakes', async () => {
  assert.equal(await out('aaaa1111'), 'http://fake/s/claude:aaaa1111-0000');
  assert.equal(await out('fix', 'the', 'login'.slice(0, 0)).catch(() => ''), '', 'a word per argument: more words than a name');
  assert.equal((await run(fakeConn(routes).conn, ['open', 'Fix the login bug'])).out.trim(), 'http://fake/s/claude:aaaa1111-0000');
  await assert.rejects(out('zzzz'), (e: Error) => e instanceof UsageError && /^“zzzz” is no page, and no session’s key or title/.test(e.message));
  await assert.rejects(out('library', 'x'), /Too many words/);
});

test('open: --browser asks the Ctx to open it, --json prints the address', async () => {
  const r = await run(fakeConn(routes).conn, ['open', 'library', '--browser']);
  assert.deepEqual(r.opened, ['http://fake/library']);
  assert.equal(r.out.trim(), 'http://fake/library');
  const j = await run(fakeConn(routes).conn, ['open', 'inbox', '--json']);
  assert.deepEqual(j.json, [{ url: 'http://fake/inbox' }]);
  assert.deepEqual((await run(fakeConn(routes).conn, ['open', 'inbox'])).opened, [], 'not without --browser');
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
