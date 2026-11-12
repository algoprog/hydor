// Checks for `hydor guide`: the topics, one topic as Markdown (pictures left out, through the pager when there is one),
// one section, --sections, naming by id or title.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/guide-test.ts && DATA_DIR=/tmp/hydor-test-guide-area node dist/dev/guide-test.js
import assert from 'node:assert/strict';
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
const topics = [
  {
    id: 'start',
    title: 'Getting started',
    summary: 'A tour. Then a second sentence that is left out.',
    body: '![A picture](images/start.webp)\n\nWelcome to **Hydor**.\n\n## First steps\n\nPick a folder.',
    sections: [
      { id: 'first-steps', title: 'First steps', text: 'Pick a folder.' },
      { id: 'keys', title: 'Keyboard shortcuts', text: 'Press **Ctrl+K**.' },
    ],
    anchors: [],
  },
  {
    id: 'projects',
    title: 'Projects and knowledge',
    summary: 'One piece of work.',
    body: 'Projects keep things together.',
    sections: [{ id: 'what-a-project-is', title: 'What a project is', text: 'A folder and more.' }],
    anchors: [],
  },
  { id: 'api', title: 'The API', summary: 'For agents.', body: 'Routes.', sections: [], anchors: [] },
];
const routes = { 'GET /api/guide': { topics } };

test('guide: the topics, the agents’ API topic left out', async () => {
  const r = await run(fakeConn(routes).conn, ['guide']);
  assert.match(r.out, /^start +Getting started +A tour\.$/m);
  assert.match(r.out, /^projects +Projects and knowledge +One piece of work\.$/m);
  assert.ok(!r.out.includes('The API'));
  const j = await run(fakeConn(routes).conn, ['guide', '--json']);
  assert.deepEqual(
    (j.json[0] as { topics: { id: string }[] }).topics.map((t) => t.id),
    ['start', 'projects'],
  );
});

test('guide: a topic by id, title or the start of either; pictures left out; sections', async () => {
  for (const given of ['start', 'Getting started', 'getting', 'sta']) {
    const r = await run(fakeConn(routes).conn, ['guide', given]);
    assert.match(r.out, /^Getting started$/m, given);
    assert.match(r.out, /Welcome to Hydor\./);
    assert.ok(!r.out.includes('A picture') && !r.out.includes('start.webp'), 'no picture');
  }
  assert.match((await run(fakeConn(routes).conn, ['guide', 'start', '--sections'])).out, /^first-steps +First steps$\n^keys +Keyboard shortcuts$/m);
  const s = await run(fakeConn(routes).conn, ['guide', 'start', 'keyboard', 'shortcuts']);
  assert.match(s.out, /^Keyboard shortcuts$/m);
  assert.match(s.out, /Press Ctrl\+K\./);
  assert.ok(!s.out.includes('Pick a folder'));
  assert.match((await run(fakeConn(routes).conn, ['guide', 'start', 'keys'])).out, /Press Ctrl\+K/);
  await assert.rejects(run(fakeConn(routes).conn, ['guide', 'nope']), /^Error: No topic “nope”: hydor guide lists them$/);
  await assert.rejects(run(fakeConn(routes).conn, ['guide', 'start', 'nope']), /No section “nope”: hydor guide start --sections lists them/);
  const j = await run(fakeConn(routes).conn, ['guide', 'start', '--json']);
  assert.equal((j.json[0] as { id: string }).id, 'start');
});

test('guide: long text goes through the pager when the Ctx has one', async () => {
  const t = fakeConn(routes);
  const { testCtx } = await import('./test-kit.ts');
  const { parseArgv } = await import('../args.ts');
  const { guide } = await import('./guide.ts');
  const paged: string[][] = [];
  const { ctx, ran } = testCtx(t.conn, 'hydor guide', parseArgv(['guide', 'start']));
  ctx.page = async (lines) => void paged.push(lines);
  await guide.verbs[0].run(ctx, ['start'], {});
  assert.equal(paged.length, 1);
  assert.equal(ran.out, '', 'nothing printed without the pager');
  assert.ok(paged[0].some((l) => /Welcome to Hydor/.test(l)));
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
