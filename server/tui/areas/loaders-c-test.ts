// Checks for what Tab completion lists for the argument kinds of tasks, apps, library, connections, accounts and machines:
// app (yours and the ready-made ones), run, page (pages and media), machine, connection, service and account. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/loaders-c-test.ts && DATA_DIR=/tmp/hydor-test-loaders-c node dist/dev/loaders-c-test.js
import assert from 'node:assert/strict';
import { LOADERS, type Candidate, type LoadCtx } from './loaders.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

const answers: Record<string, unknown> = {
  '/api/apps': {
    apps: [{ slug: 'trip-planner', name: 'Trip planner' }],
    templates: [
      { id: 'quiz', name: 'Quiz', installed: true },
      { id: 'weather', name: 'Weather', installed: false },
    ],
    recent: [{ id: 'run1', appName: 'Trip planner', status: 'done' }],
  },
  '/api/pages': {
    pages: [
      { id: 'p1', title: 'Q3 report', kind: 'doc' },
      { id: 'p2', title: 'Notes' },
      { id: 't1', title: 'Screen', app: 'x' },
    ],
  },
  '/api/media': { items: [{ id: 'm1', title: 'Sunset', kind: 'image' }] },
  '/api/machines': {
    machines: [
      { id: 'mach1', name: 'Lab' },
      { id: 'mach2', name: 'GPU box' },
    ],
  },
  '/api/connections': { connections: [{ id: 'notion', name: 'Notion' }] },
  '/api/connections/catalog': {
    apps: [
      { id: 'notion', name: 'Notion' },
      { id: 'exa', name: 'Exa Search' },
    ],
  },
  '/api/accounts': { claude: { email: 'me@x.example' }, codex: {}, extra: [{ id: 'acc1', agent: 'claude', name: 'Work' }] },
};
const load = (get = answers): LoadCtx => ({ cur: '', args: [], opts: new Map(), get: async (p: string) => (get[p] as never) ?? null });

const tests: [string, () => Promise<void>][] = [
  [
    'app: yours by address, the installed ready-made ones as tpl:<id>',
    async () =>
      assert.deepEqual(await LOADERS.app(load()), [
        ['trip-planner', 'Trip planner'],
        ['tpl:quiz', 'Quiz'],
      ]),
  ],
  ['run: the latest runs, with the app and how they ended', async () => assert.deepEqual(await LOADERS.run(load()), [['run1', 'Trip planner · done']])],
  [
    'page: pages and media, without a template’s screens',
    async () =>
      assert.deepEqual(await LOADERS.page(load()), [
        ['p1', 'Q3 report · doc'],
        ['p2', 'Notes · page'],
        ['m1', 'Sunset · image'],
      ]),
  ],
  [
    'machine: by name when it is one word, else its id first',
    async () =>
      assert.deepEqual(await LOADERS.machine(load()), [
        ['Lab', 'mach1'],
        ['mach2', 'GPU box'],
      ]),
  ],
  [
    'connection and service',
    async () => {
      assert.deepEqual(await LOADERS.connection(load()), [['notion', 'Notion']]);
      assert.deepEqual(await LOADERS.service(load()), [
        ['notion', 'Notion'],
        ['exa', 'Exa Search'],
      ]);
    },
  ],
  [
    'account: each program’s own, then the added ones',
    async () =>
      assert.deepEqual(await LOADERS.account(load()), [
        ['claude', 'me@x.example'],
        ['codex', 'Codex'],
        ['acc1', 'Work · claude'],
      ]),
  ],
  [
    'a server that does not answer lists nothing',
    async () => {
      const none = load({});
      for (const k of ['app', 'run', 'page', 'machine', 'connection', 'service', 'account'] as const) assert.deepEqual(await LOADERS[k](none), [] as Candidate[], k);
    },
  ],
];

let passed = 0;
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
