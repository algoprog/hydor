// Checks for `/hydor <command…>` in the chat, without a terminal: the words split as a shell does, what is offered after
// each word (areas, verbs, arguments, options), when Enter on a row runs the line or only puts the word in, and a command
// run with a fake host (what it prints, its questions, its errors). The chat itself, in a pseudo-terminal, is in tui-test.ts.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/hydor-cmd-test.ts && DATA_DIR=/tmp/hydor-test-hydor-cmd node dist/dev/hydor-cmd-test.js
import assert from 'node:assert/strict';
import { fakeConn } from './areas/test-kit.ts';
import { contextOf } from './complete.ts';
import { hydorItems, legacyNote, runHydor, splitWords, stepAfter, type Host } from './hydor-cmd.ts';
import { makePaint } from './term.ts';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('words split as a shell does', () => {
  assert.deepEqual(splitWords('memory search docker'), ['memory', 'search', 'docker']);
  assert.deepEqual(splitWords('  keys   set  A_B '), ['keys', 'set', 'A_B']);
  assert.deepEqual(splitWords(`memory add "a note with spaces" --scope 'x y'`), ['memory', 'add', 'a note with spaces', '--scope', 'x y']);
  assert.deepEqual(splitWords('a\\ b c'), ['a b', 'c']);
  assert.deepEqual(splitWords('say ""'), ['say', '']);
  assert.deepEqual(splitWords(''), []);
  assert.deepEqual(splitWords(`it's "a \\"q\\""`.replace("it's", 'its')), ['its', 'a "q"']);
});

test('the context after /hydor: the words before and the one being typed', () => {
  assert.deepEqual(contextOf('/hydor '), { kind: 'hydor', from: 7, before: [], query: '' });
  assert.deepEqual(contextOf('/hydor proj'), { kind: 'hydor', from: 7, before: [], query: 'proj' });
  assert.deepEqual(contextOf('/hydor projects show Th'), { kind: 'hydor', from: 21, before: ['projects', 'show'], query: 'Th' });
  assert.deepEqual(contextOf('/hydor memory add --scope '), { kind: 'hydor', from: 26, before: ['memory', 'add', '--scope'], query: '' });
  assert.deepEqual(contextOf('/hydor'), { kind: 'commands', from: 0, query: 'hydor' }, 'the command itself is still a command');
});

const names = (items: { value: string }[]) => items.map((i) => i.value);

test('what is offered: the areas, then an area’s verbs, then the verb’s arguments, then options', async () => {
  const { conn, calls } = fakeConn({
    'GET /api/projects': {
      spaces: [
        { id: 'sp1', name: 'Thesis' },
        { id: 'sp2', name: 'My site' },
      ],
    },
  });
  const areas = await hydorItems([], '', conn, '/tmp');
  assert.ok(names(areas).includes('projects') && names(areas).includes('memory') && names(areas).includes('settings'));
  assert.ok(!names(areas).includes('status') && !names(areas).includes('usage'), 'only the areas, not the old commands');
  assert.ok(
    areas.every((a) => a.hint),
    'each with what it is',
  );
  const verbs = await hydorItems(['projects'], '', conn, '/tmp');
  assert.deepEqual(names(verbs).slice(0, 3), ['list', 'show', 'new']);
  assert.equal(calls.length, 0, 'verbs are known without asking the server');
  const args = await hydorItems(['projects', 'show'], '', conn, '/tmp');
  assert.deepEqual(
    args.map((a) => [a.value, a.hint]),
    [
      ['Thesis', 'sp1'],
      ['sp2', 'My site'],
    ],
  );
  assert.deepEqual(
    calls.map((c) => c.path),
    ['/api/projects'],
  );
  const opts = await hydorItems(['projects', 'show'], '-', conn, '/tmp');
  assert.ok(names(opts).includes('--json') && names(opts).every((n) => n.startsWith('--')));
  // After an option that takes a value: its values.
  const vals = await hydorItems(['memory', 'add', '--scope'], '', conn, '/tmp');
  assert.ok(Array.isArray(vals));
});

test('Enter on a row: the last word a command needs runs it, any other goes in', () => {
  assert.equal(stepAfter([], 'projects', false), 'insert', 'an area then asks for its verb');
  assert.equal(stepAfter([], 'projects', true), 'run', 'an area typed whole whose own verb needs nothing runs');
  assert.equal(stepAfter(['projects'], 'list', false), 'insert');
  assert.equal(stepAfter(['projects'], 'list', true), 'run', 'a verb typed whole that needs nothing runs');
  assert.equal(stepAfter(['projects'], 'show', true), 'insert', 'a verb that needs an argument asks for it');
  assert.equal(stepAfter(['projects', 'show'], 'Thesis', false), 'run', 'the last argument it needs');
  assert.equal(stepAfter(['projects', 'show'], '--json', false), 'insert', 'an option never runs');
  assert.equal(stepAfter(['projects', 'rename'], 'Thesis', false), 'insert', 'a second argument is still to come');
  assert.equal(stepAfter(['projects', 'rename', 'Thesis'], 'Paper', false), 'run');
  assert.equal(stepAfter(['projects', 'files', 'add'], 'src/', false), 'insert', 'a folder goes in and its contents show');
  assert.equal(stepAfter(['nothing'], 'x', false), 'insert');
});

test('the note for what is no area', () => {
  assert.match(legacyNote('usage'), /^In the chat, use \/usage, or run it in a shell: hydor usage$/);
  assert.match(legacyNote('models'), /\/model/);
  assert.match(legacyNote('status'), /run it in a shell: hydor status/);
  assert.match(legacyNote('projcts'), /^Unknown command: projcts\.( Did you mean|.*\/hydor)/s);
});

/** A host that collects: what it prints, its questions, the answers it gives. */
function host(conn: ReturnType<typeof fakeConn>['conn'], a: { pick?: string | null; typed?: (string | null)[]; interactive?: boolean } = {}) {
  const out: string[] = [];
  const asked: { q: string; hidden: boolean }[] = [];
  const picked: { title: string; labels: string[] }[] = [];
  const typed = [...(a.typed ?? [])];
  const h: Host = {
    conn,
    look: () => ({ p: makePaint(false), width: 100, home: '/home/u' }),
    interactive: a.interactive ?? true,
    print: (lines, first) => out.push(...(first ? [''] : []), ...lines),
    pick: async (title, items) => (picked.push({ title, labels: items.map((i) => i.label) }), a.pick === undefined ? (items[0]?.value ?? null) : a.pick),
    ask: async (q, hidden) => (asked.push({ q, hidden }), typed.length ? typed.shift()! : null),
    handOver: (fn) => fn(),
    open: () => {},
  };
  return { h, out, asked, picked };
}

test('a command runs with the chat’s Ctx: its lines printed, a confirm as a picker with No first, a hidden question, errors told', async () => {
  const { conn, calls } = fakeConn({
    'GET /api/projects': { spaces: [{ id: 'sp1', name: 'Thesis', folder: '/home/u/thesis', sessions: 1, docs: 0 }] },
    'DELETE /api/projects/sp1': { ok: true },
    'GET /api/connections': { secrets: [] },
    'POST /api/connections/secrets': (b: any) => ({ secret: { name: b.name } }),
  });
  let r = host(conn);
  await runHydor(r.h, 'projects');
  assert.match(r.out.join('\n'), /^\nPROJECT +FOLDER[^\n]*\nThesis +~?\/home\/u\/thesis|PROJECT[\s\S]*Thesis/);
  // --json prints the JSON as the API gave it.
  r = host(conn);
  await runHydor(r.h, 'projects --json');
  assert.deepEqual(JSON.parse(r.out.join('\n')).spaces[0].id, 'sp1');
  // A confirm answered No removes nothing; Yes does.
  r = host(conn, { pick: 'no' });
  await runHydor(r.h, 'projects remove Thesis');
  assert.deepEqual(r.picked, [{ title: 'Remove “Thesis”?', labels: ['No', 'Yes'] }]);
  assert.match(r.out.join('\n'), /Not removed/);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
  r = host(conn, { pick: 'yes' });
  await runHydor(r.h, 'projects remove Thesis');
  assert.ok(calls.some((c) => c.method === 'DELETE'));
  // --yes asks nothing.
  r = host(conn);
  await runHydor(r.h, 'projects remove Thesis -y');
  assert.deepEqual(r.picked, []);
  // A hidden question; backing out sends nothing and says nothing.
  r = host(conn, { typed: ['v4lue'] });
  await runHydor(r.h, 'keys set MY_KEY');
  assert.deepEqual(r.asked, [{ q: 'Value for MY_KEY: ', hidden: true }]);
  assert.equal(calls.filter((c) => c.method === 'POST').at(-1)?.body && (calls.filter((c) => c.method === 'POST').at(-1)!.body as any).value, 'v4lue');
  assert.doesNotMatch(r.out.join('\n'), /v4lue/);
  const before = calls.length;
  r = host(conn, { typed: [null] });
  await runHydor(r.h, 'keys set OTHER_KEY');
  assert.deepEqual(r.out, []);
  assert.ok(!calls.slice(before).some((c) => c.method === 'POST'));
  // Wrong use and the server’s refusals are told; nothing throws.
  r = host(conn);
  await runHydor(r.h, 'projects frobnicate');
  assert.match(r.out.join('\n'), /^\n✗ Unknown projects command: frobnicate\./);
  r = host(conn);
  await runHydor(r.h, 'projects show Nope');
  assert.match(r.out.join('\n'), /✗ No project “Nope”/);
  r = host(conn);
  await runHydor(r.h, 'projects show --nonsense');
  assert.match(r.out.join('\n'), /✗ Unknown option '--nonsense'/);
  r = host(conn, { interactive: false });
  await runHydor(r.h, 'projects remove Thesis');
  assert.match(r.out.join('\n'), /✗ Remove “Thesis”: there is no terminal for it here/);
  // The old commands and unknown words get a note; the help is printed.
  r = host(conn);
  await runHydor(r.h, 'usage');
  assert.match(r.out.join('\n'), /In the chat, use \/usage/);
  r = host(conn);
  await runHydor(r.h, 'projects --help');
  assert.match(r.out.join('\n'), /Usage: hydor projects/);
  r = host(conn);
  await runHydor(r.h, '');
  assert.match(r.out.join('\n'), /projects/);
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
