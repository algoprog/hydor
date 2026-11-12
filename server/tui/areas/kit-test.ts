// Checks for what every area stands on: finding the area and verb in the words, each verb's own options parsed
// strictly (typos get "did you mean"), the help and Tab completion that come out of the registry (for every area, so a
// new one is checked by being added), the naming rule, the table and field helpers, the picker's keys and lines. Build
// and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/kit-test.ts && DATA_DIR=/tmp/hydor-test-kit node dist/dev/kit-test.js
import assert from 'node:assert/strict';
import { CMD_TABLE, COMMANDS, helpText, parseArgv, routeOf } from '../args.ts';
import { completeWords, type Api } from '../completion.ts';
import { pickerKey, pickerLines, visible, type PickerState } from '../picker.ts';
import { makePaint, stripAnsi } from '../term.ts';
import { AREAS, areaByName, defaultVerb, findVerb } from './index.ts';
import { argLabel, choose, fields, FREE_TEXT_CAP, GROUPS, pickOne, table, UsageError, usageLine, type Ctx } from './kit.ts';
import { LOADERS } from './loaders.ts';
import { fakeConn, testCtx } from './test-kit.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const widest = (s: string) => Math.max(...s.split('\n').map((l) => [...stripAnsi(l)].length));
const plain = makePaint(false);

// ---- the registry, for every area -----------------------------------------------------------------------------

test('registry: every area is well formed', () => {
  const names = new Set<string>();
  for (const a of AREAS) {
    for (const n of [a.name, ...(a.aliases ?? [])]) {
      assert.ok(!names.has(n), `${n} is one area’s name only`);
      names.add(n);
    }
    assert.match(a.name, /^[a-z][a-z-]*$/, a.name);
    assert.ok(a.summary && a.summary.length <= 40 && !a.summary.endsWith('.'), `${a.name}: a summary of 40 characters or fewer (it is one line of hydor help)`);
    assert.ok(
      GROUPS.some((g) => g.id === a.group),
      `${a.name}: a known group`,
    );
    assert.ok(
      a.verbs.some((v) => v === defaultVerb(a)),
      `${a.name}: its default verb exists`,
    );
    const verbs = new Set<string>();
    for (const v of a.verbs) {
      assert.ok(!verbs.has(v.name), `${a.name} ${v.name} once`);
      verbs.add(v.name);
      assert.match(v.name, /^[a-z][a-z-]*( [a-z][a-z-]*)?$/, `${a.name}: ${v.name} is one word or two`);
      assert.ok(v.summary && v.summary.length <= 46 && !v.summary.endsWith('.'), `${a.name} ${v.name}: a summary of 46 characters or fewer in help’s list (${v.summary.length})`);
      assert.ok(typeof v.run === 'function');
      for (const [i, arg] of v.args.entries()) {
        assert.ok(arg.kind in LOADERS, `${a.name} ${v.name}: ${arg.kind} has a loader`);
        if (arg.rest) assert.equal(i, v.args.length - 1, `${a.name} ${v.name}: only the last takes the rest`);
      }
      const shorts = new Set<string>();
      for (const [name, o] of Object.entries(v.options ?? {})) {
        assert.match(name, /^[a-z][a-z-]*$/, `${a.name} ${v.name}: --${name}`);
        assert.ok(o.desc && o.desc.length <= 60, `${a.name} ${v.name} --${name}: a description of 60 characters or fewer`);
        if (o.type !== 'boolean') assert.ok(o.value, `${a.name} ${v.name} --${name}: says what its value looks like`);
        if (o.kind) assert.ok(o.kind in LOADERS, `--${name}: ${o.kind} has a loader`);
        if (o.short) {
          assert.ok(!shorts.has(o.short), `${a.name} ${v.name}: -${o.short} once`);
          shorts.add(o.short);
        }
      }
      // Its own help and a parse of its words.
      const h = helpText(makePaint(true), a.name, v.name.split(' '))!;
      assert.ok(widest(h) <= 80, `${a.name} ${v.name}: help in ${widest(h)} columns`);
      assert.ok(stripAnsi(h).startsWith(`Usage: ${usageLine(a, v)}`), `${a.name} ${v.name}: its usage line`);
      for (const e of v.examples ?? []) assert.ok(/(^|\| )hydor /.test(e), `${a.name} ${v.name}: an example is a command`);
      assert.ok((v.examples ?? []).length >= 1, `${a.name} ${v.name}: has an example`);
    }
    const h = helpText(makePaint(true), a.name)!;
    assert.ok(widest(h) <= 80, `${a.name}: help in ${widest(h)} columns`);
    for (const v of a.verbs) assert.ok(stripAnsi(h).includes(v.name), `${a.name}: help lists ${v.name}`);
  }
});

test('hydor help: every command and area is one line of at most 80 columns, its summary on that line', () => {
  const plain2 = helpText(makePaint(false))!;
  const lines = plain2.split('\n');
  const top = lines.slice(
    0,
    lines.findIndex((l) => l === 'Examples'),
  );
  assert.ok(
    top.every((l) => [...l].length <= 80),
    'no line wider than 80',
  );
  // A row that wrapped would leave a line starting far in, under its summary.
  assert.ok(!top.some((l) => /^ {30,}\S/.test(l)), 'no summary wraps');
  assert.ok(top.length <= 60, `one screen: ${top.length} lines before the examples`);
  for (const c of CMD_TABLE)
    assert.ok(
      top.some((l) => l.startsWith(`  hydor ${c.bare ? '' : c.name}`.trimEnd()) && l.endsWith(c.desc)),
      `${c.name}: its row ends with its description`,
    );
  for (const a of AREAS.filter((x) => !CMD_TABLE.some((c) => c.name === x.name)))
    assert.ok(
      top.some((l) => l.startsWith(`  hydor ${a.name}`) && l.endsWith(`  ${a.summary}`)),
      `${a.name}: its row ends with its summary`,
    );
  // The wide case: coloured, the same widths.
  assert.ok(
    helpText(makePaint(true))!
      .split('\n')
      .slice(0, top.length)
      .every((l) => [...stripAnsi(l)].length <= 80),
  );
});

test('registry: help and the parser agree on every verb’s options and words', () => {
  for (const a of AREAS) {
    for (const v of a.verbs) {
      const words = [a.name, ...v.name.split(' ')];
      const route = routeOf(words)!;
      // A bare area's words are its one verb's own: no verb is named.
      assert.equal(a.bare ? defaultVerb(a) : route.verb, v, `${a.name} ${v.name} is found by its words`);
      for (const [name, o] of Object.entries(v.options ?? {})) {
        const o2 = parseArgv([...words, `--${name}`, ...(o.type === 'boolean' ? [] : ['x'])]);
        assert.ok(o2.route!.values[name] !== undefined, `${a.name} ${v.name} takes --${name}`);
      }
    }
    for (const alias of a.aliases ?? []) assert.equal(areaByName(alias), a);
  }
});

test('registry: Tab completion lists every area, its verbs and its options', async () => {
  const api: Api = async () => {
    throw new Error('no server');
  };
  const first = (await completeWords([''], api)).map((l) => l.split('\t')[0]);
  const help = (await completeWords(['help', ''], api)).map((l) => l.split('\t')[0]);
  for (const a of AREAS) {
    assert.ok(first.includes(a.name) && help.includes(a.name), `${a.name} is completed as a command`);
    const verbs = (await completeWords([a.name, ''], api)).map((l) => l.split('\t')[0]);
    if (!a.bare) for (const v of a.verbs) assert.ok(verbs.includes(v.name.split(' ')[0]), `${a.name}: ${v.name} is completed`);
    for (const v of a.verbs) {
      const route = a.bare ? [] : v.name.split(' ');
      const opts = (await completeWords([a.name, ...route, '--'], api)).map((l) => l.split('\t')[0]);
      for (const name of Object.keys(v.options ?? {})) assert.ok(opts.includes(`--${name}`), `${a.name} ${v.name}: --${name} is completed`);
      assert.ok(opts.includes('--json'), 'the common options too');
      assert.ok(!opts.includes('--model') || 'model' in (v.options ?? {}), 'the chat’s options are not offered to a verb that does not take them');
      for (const [name, o] of Object.entries(v.options ?? {})) {
        if (o.values)
          assert.deepEqual(
            (await completeWords([a.name, ...route, `--${name}`, ''], api)).map((l) => l.split('\t')[0]),
            o.values,
            `--${name}'s values`,
          );
      }
    }
  }
});

test('registry: no area shadows a message word by accident, and names stay clear of the commands’ words', () => {
  for (const a of AREAS) {
    if (!(COMMANDS as readonly string[]).includes(a.name)) assert.equal(areaByName(a.name), a);
  }
  assert.equal(routeOf(['fix', 'the', 'tests']), null);
  assert.equal(routeOf([]), null);
});

// ---- words → area and verb ---------------------------------------------------------------------------------------

test('routeOf: area, verb, two-word verbs, common options in between, unknown verbs', () => {
  const r = routeOf(['projects', 'show', 'x'])!;
  assert.equal(r.area.name, 'projects');
  assert.equal(r.verb!.name, 'show');
  assert.equal(r.words, 2);
  assert.equal(routeOf(['projects'])!.verb, undefined, 'none named: the default runs');
  assert.equal(routeOf(['project', 'list'])!.area.name, 'projects', 'an alias');
  assert.equal(routeOf(['projects', 'new'])!.verb!.name, 'new');
  assert.equal(routeOf(['projects', 'add', 'x'])!.verb!.name, 'new', 'a verb alias');
  const two = routeOf(['projects', 'files', 'add', 'p', 'f'])!;
  assert.equal(two.verb!.name, 'files add');
  assert.equal(two.words, 3);
  assert.equal(routeOf(['projects', 'files', 'p'])!.verb!.name, 'files');
  assert.equal(routeOf(['--json', 'projects', 'list'])!.verb!.name, 'list');
  assert.equal(routeOf(['--server', 'http://x', 'projects', 'show'])!.verb!.name, 'show');
  assert.equal(routeOf(['projects', 'frob'])!.unknown, 'frob');
  assert.equal(routeOf(['sessions']), null, 'a command that exists answers for itself');
  assert.equal(routeOf(['show', 'x']), null);
  assert.equal(findVerb(areaByName('projects')!, ['files', 'remove', 'x'])!.used, 2);
  assert.equal(findVerb(areaByName('projects')!, ['nope']), null);
});

test('parseArgv: a verb’s options, strictly, with did you mean', () => {
  const o = parseArgv(['projects', 'new', 'My', 'project', '--color', 'teal', '--with', 'a', '--with', 'b', '--json']);
  assert.equal(o.cmd, 'area');
  assert.deepEqual(o.args, ['My', 'project']);
  assert.equal(o.json, true);
  assert.equal(o.route!.values.color, 'teal');
  assert.deepEqual(o.route!.values.with, ['a', 'b']);
  assert.throws(
    () => parseArgv(['projects', 'new', 'X', '--colr', 'teal']),
    (e: Error) => e instanceof UsageError && /^Unknown option '--colr'\. Did you mean --color\?\nhydor help projects new shows what it takes\.$/.test(e.message),
  );
  assert.throws(() => parseArgv(['projects', 'show', 'x', '--color', 'teal']), /Unknown option '--color'/, 'another verb’s option');
  assert.throws(() => parseArgv(['projects', 'show', 'x', '--model', 'opus']), /Unknown option '--model'/, 'a session option');
  assert.throws(
    () => parseArgv(['projects', 'shw']),
    (e: Error) => e instanceof UsageError && /^Unknown projects command: shw\. Did you mean hydor projects show\?$/.test(e.message),
  );
  assert.equal(parseArgv(['projects', 'show', 'x', '-y']).yes, true, 'the common short options');
  assert.equal(parseArgv(['projects', '--json']).route!.verb, undefined);
  // The commands that exist are parsed as before.
  assert.equal(parseArgv(['sessions', '-n', '5']).cmd, 'sessions');
  assert.equal(parseArgv(['fix', 'the', 'tests']).cmd, 'chat');
});

test('messages that start with a command’s name: quoted is a message; unknown verbs say how to send it', () => {
  // Quoted as one word with spaces, it is never a command or an area.
  for (const line of ['find the bug in login', 'projects show x', 'sessions pin 3f9a', 'open the file', 'guide me through it', 'api is slow']) {
    const o = parseArgv([line]);
    assert.equal(o.cmd, 'chat', line);
    assert.deepEqual(o.args, [line]);
    assert.equal(o.route, undefined);
    assert.equal(routeOf([line]), null);
  }
  assert.equal(parseArgv(['--model', 'opus', 'find the bug']).cmd, 'chat');
  assert.equal(parseArgv(['chat', 'find', 'the', 'bug']).cmd, 'chat', 'after hydor chat');
  assert.deepEqual(parseArgv(['chat', 'find', 'the', 'bug']).args, ['find', 'the', 'bug']);
  // Unquoted, an area name starts that area.
  assert.equal(parseArgv(['find', 'the', 'bug']).route!.area.name, 'find');
  assert.deepEqual(parseArgv(['find', 'the', 'bug']).args, ['the', 'bug']);
  // A word after an area that is no verb of it: a near verb is suggested, otherwise how to send it as a message.
  assert.throws(() => parseArgv(['projects', 'shw', 'x']), /^Error: Unknown projects command: shw\. Did you mean hydor projects show\?$/);
  assert.throws(() => parseArgv(['projects', 'leak', 'in', 'parser']), /^Error: Unknown projects command: leak\.\nTo send this to an agent: hydor chat projects leak in parser$/);
  // Bare areas take any words as their own.
  assert.doesNotThrow(() => parseArgv(['find', 'leak', 'in', 'parser']));
  assert.ok(helpText(plain)!.replace(/\s+/g, ' ').includes('A message that starts with a command’s name goes in quotes (hydor "find the bug in login") or after hydor chat.'));
});

// ---- help --------------------------------------------------------------------------------------------------------

test('help: one line an area in hydor help, the area’s verbs, a verb’s options', () => {
  const general = helpText(plain)!;
  assert.match(general, /^ {2}hydor projects +Your projects$/m);
  assert.ok(widest(general) <= 80);
  assert.ok(general.split('\n').length < 130, 'compact');
  const a = helpText(plain, 'projects')!;
  assert.match(a, /^Usage: hydor projects \[verb\] \[options\]$/m);
  assert.match(a, /^ {2}files add <project> <folder> +/m);
  assert.match(a, /\nExamples\n/);
  const v = helpText(plain, 'projects', ['new'])!;
  assert.match(v, /^Usage: hydor projects new <name…> \[options\]$/m);
  assert.match(v, /^ {6}--color <name> +Its colour$/m);
  assert.match(v, /^ {2}hydor projects new Thesis$/m);
  assert.match(helpText(plain, 'projects', ['files', 'add'])!, /^Usage: hydor projects files add <project> <folder>$/m);
  assert.match(helpText(plain, 'projects', ['files'])!, /^Usage: hydor projects files <project>$/m);
  assert.throws(() => helpText(plain, 'projects', ['shw']), /Unknown projects command: shw\. Did you mean hydor projects show\?/);
  assert.equal(helpText(plain, 'nothing'), null);
  assert.ok(helpText(plain, 'sessions')!.startsWith('Usage: hydor sessions'), 'a command that exists is as it was');
  assert.deepEqual(plain.on, false);
});

// ---- Tab completion of an area -----------------------------------------------------------------------------------

test('complete: an area’s verbs, arguments by kind, option values', async () => {
  const answers: Record<string, unknown> = {
    '/api/projects': {
      spaces: [
        { id: 'sp1', name: 'Thesis' },
        { id: 'sp2', name: 'Lab notes' },
      ],
    },
    '/api/assistants': { assistants: [{ id: 'coder', name: 'Coder' }] },
  };
  const api: Api = async (p) => {
    if (!(p in answers)) throw new Error('404');
    return answers[p];
  };
  const values = async (...w: string[]) => (await completeWords(w, api)).map((l) => l.split('\t')[0]);
  assert.deepEqual(await values('projects', ''), ['list', 'show', 'new', 'rename', 'edit', 'sessions', 'files', 'remove']);
  assert.deepEqual(await values('projects', 's'), ['show', 'sessions']);
  assert.deepEqual(await values('projects', 'show', ''), ['Thesis', 'sp2'], 'a one-word name as it is, else the id');
  assert.deepEqual(await completeWords(['projects', 'show', ''], api), ['Thesis\tsp1', 'sp2\tLab notes']);
  assert.deepEqual(await values('projects', 'show', 'T'), ['Thesis']);
  assert.deepEqual(await values('projects', 'show', 'Thesis', ''), [], 'one project only');
  assert.deepEqual(await values('projects', 'files', ''), ['add', 'remove', 'Thesis', 'sp2'], 'the family’s words, and the project');
  assert.deepEqual(await values('projects', 'files', 'add', ''), ['Thesis', 'sp2']);
  assert.deepEqual(await completeWords(['projects', 'files', 'add', 'Thesis', ''], api), [':dirs']);
  assert.deepEqual(await completeWords(['projects', 'new', 'X', '--folder', ''], api), [':dirs']);
  assert.deepEqual(await completeWords(['projects', 'new', 'X', '--file', ''], api), [':files']);
  assert.deepEqual(await values('projects', 'new', 'X', '--color', 'p'), ['pink']);
  assert.deepEqual(await values('projects', 'edit', 'Thesis', '--as', ''), ['coder']);
  assert.deepEqual(await values('projects', 'new', 'X', '--members', ''), ['Thesis', 'sp2']);
  assert.deepEqual(await values('projects', 'new', 'X', '--color=t'), ['--color=teal']);
  assert.deepEqual(await values('projects', 'new', 'X', '--wi'), ['--with']);
  assert.deepEqual(await values('projects', 'new', 'X', '--with', 'a', '--w'), ['--with'], 'a list option again');
  assert.deepEqual(await values('projects', 'new', 'X', '--color', 'teal', '--col'), []);
  assert.deepEqual(await values('projects', 'frob', ''), []);
  assert.deepEqual(await values('help', 'projects', ''), ['list', 'show', 'new', 'rename', 'edit', 'sessions', 'files', 'remove']);
  const down: Api = async () => {
    throw new Error('down');
  };
  assert.deepEqual(await completeWords(['projects', 'show', ''], down), [], 'a server that does not answer: nothing, no error');
});

// ---- the naming rule and the helpers -----------------------------------------------------------------------------

type Thing = { id: string; name: string };
const things: Thing[] = [
  { id: 'a1', name: 'Alpha' },
  { id: 'a2', name: 'Alphabet soup' },
  { id: 'b1', name: 'Beta' },
];
const opt = { id: (t: Thing) => t.id, names: (t: Thing) => [t.name], what: 'thing', hint: 'hydor things lists them' };

test('pickOne: id, name any case, start of either; ambiguity is listed', () => {
  assert.equal(pickOne(things, 'a1', opt).id, 'a1');
  assert.equal(pickOne(things, 'ALPHA', opt).id, 'a1', 'an exact name beats a longer one');
  assert.equal(pickOne(things, 'be', opt).id, 'b1');
  assert.equal(pickOne(things, 'b', opt).id, 'b1');
  assert.equal(pickOne(things, 'alphab', opt).id, 'a2');
  assert.throws(() => pickOne(things, 'a', opt), /“a” fits 2 things: Alpha \(a1\), Alphabet soup \(a2\)\. Give more of it, or its id\./);
  assert.throws(() => pickOne(things, 'zzz', opt), /No thing “zzz”: hydor things lists them/);
  assert.throws(() => pickOne(things, '', opt), UsageError);
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, name: `Item ${i}` }));
  assert.match(
    (() => {
      try {
        pickOne(many, 'item', opt);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    })(),
    /fits 8 things: .*, …\./,
  );
});

test('choose: given, picked on a terminal, or asked for', async () => {
  const { conn } = fakeConn({});
  const o = parseArgv(['projects', 'list']);
  const make = (interactive: boolean, pick: string | null = 'b1') => testCtx(conn, 'hydor things show <thing>', o, { interactive, pick });
  const how = { ...opt, label: (t: Thing) => t.name, detail: (t: Thing) => t.id };
  const t1 = make(false);
  assert.equal((await choose(t1.ctx, things, 'beta', how)).id, 'b1');
  await assert.rejects(choose(t1.ctx, things, undefined, how), /Say which thing: hydor things show <thing> \(hydor things lists them\)/);
  const t2 = make(true);
  assert.equal((await choose(t2.ctx, things, undefined, how)).id, 'b1');
  assert.deepEqual(t2.ran.picked, ['Which thing?']);
  await assert.rejects(choose(make(true, null).ctx, things, undefined, how), (e: Error) => e.constructor.name === 'Cancelled');
  await assert.rejects(choose(t2.ctx, [], undefined, how), /There is no thing to pick/);
});

const width = (s: string) => [...stripAnsi(s)].length;

test('table: on a terminal no line passes the width; the main column keeps its room, the others shrink first', () => {
  const mk = (w: number, fit = true) => ({ look: { p: plain, width: w, home: '/h' }, fit });
  const long = 'x'.repeat(200);
  const rows = [
    ['1', 'A title that says what the thing is and is quite long indeed', '~/projects/some/deep/folder · 3 days ago', `http://127.0.0.1:8790/s/claude%3A${'a'.repeat(36)}`],
    ['2', 'Short', '~ · now', long],
  ];
  for (const w of [120, 100, 80, 60, 40, 24]) {
    for (const t of [table(mk(w), rows, { grow: 1 }), table(mk(w), rows, { grow: 1, indent: 2 }), table(mk(w), rows, { grow: 1, head: ['N', 'TITLE', 'WHERE', 'ADDRESS'] })]) {
      assert.ok(
        t.every((l) => width(l) <= w - 1),
        `${w} columns: ${Math.max(...t.map(width))}`,
      );
    }
  }
  // The title keeps its room: at 120 columns it is whole, and the address (last, not the main one) gave way.
  const t120 = table(mk(120), rows, { grow: 1 });
  assert.match(t120[0], /A title that says what the thing is and is quite long indeed/);
  assert.match(t120[0], /…$/);
  // The others shrink the widest first, down to a few characters, before the title is cut.
  const t50 = table(mk(50), rows, { grow: 1 });
  assert.match(t50[0], /A title that says what th…/);
  assert.ok(t50.every((l) => width(l) <= 49));
  // Short rows are not touched.
  assert.deepEqual(table(mk(120), [['1', 'a', 'b']], { grow: 1 }), ['1  a  b']);
  assert.deepEqual(table(mk(120), [['1', 'a', 'b']], { grow: 1, indent: 2 }), ['  1  a  b']);
});

test('table: piped, nothing is cut to a width, but free-text columns are capped near 80 characters', () => {
  const piped = { look: { p: plain, width: 40, home: '/h' }, fit: false };
  const long = 'y'.repeat(300);
  const rows = [
    ['1', long, 'where'],
    ['2', 'short title', 'where'],
  ];
  const t = table(piped, rows, { grow: 1 });
  assert.equal(width(t[0]), 1 + 2 + FREE_TEXT_CAP + 2 + 5, 'the long title is cut to the cap');
  assert.ok(t[0].includes('…'));
  assert.equal(t[1], `2  short title${' '.repeat(FREE_TEXT_CAP - 11)}  where`, 'the other rows are padded to the cap at most');
  // Columns that are not free text (an address) are never cut piped.
  const addr = `http://x/${'a'.repeat(200)}`;
  assert.ok(table(piped, [['1', 'title', addr]], { grow: 1 })[0].endsWith(addr));
  assert.ok(table(piped, [['1', addr, 'w']], { grow: 1, free: [] })[0].includes(addr));
  // Two free columns, each capped.
  const two = table(piped, [['1', long, long]], { grow: 1, free: [1, 2] })[0];
  assert.equal(width(two), 1 + 2 + FREE_TEXT_CAP + 2 + FREE_TEXT_CAP);
});

test('table: a header with empty cells lines up with its columns, piped and at 100 columns; empty labelled columns are left out', () => {
  const rowsA = [
    ['●', 'Reading list', 'reading-list', '', '12 runs', '3d ago', 'Keeps my reading list'],
    ['·', 'Deep research report', 'tpl:deep-research', 'ready-made, not installed', '', '', `A sourced report ${'on any question '.repeat(12)}`],
    ['●', 'Trip planner', 'tpl:trip-planner', 'ready-made', '9 runs', '9d ago', 'x'.repeat(300)],
  ];
  const head = ['', 'APP', 'ADDRESS', 'KIND', 'RUNS', 'LAST', ''];
  const starts = (line: string) => [...line.matchAll(/\S+(?: \S+)*/g)].filter((m) => !/^\s/.test(m[0])).map((m) => m.index!);
  for (const [fit, w] of [
    [false, 100],
    [true, 100],
    [true, 60],
  ] as const) {
    const t = table({ look: { p: plain, width: w, home: '/h' }, fit }, rowsA, { head, grow: 1, free: [1, 6] });
    assert.ok(!fit || t.every((l) => width(l) <= w - 1), `${w} columns`);
    // Each label starts where the first cell of its column starts.
    const col = (label: string, cell: string) =>
      assert.equal(t[0].indexOf(label), t[1 + (cell === 'ready-made' ? 2 : 0)].indexOf(cell.slice(0, Math.min(cell.length, 4))), `${fit ? w : 'piped'}: ${label} over its column`);
    col('APP', 'Reading list');
    col('ADDRESS', 'reading-list');
    col('RUNS', '12 r');
    col('LAST', '3d ago');
    assert.ok(t[0].indexOf('KIND') > t[0].indexOf('ADDRESS') && t[0].indexOf('KIND') < t[0].indexOf('RUNS'), 'KIND between them');
    if (!fit) assert.ok(width(t[3]) <= 3 + 14 + 2 + 17 + 2 + 25 + 2 + 7 + 2 + 6 + 2 + 2 + 80 + 20, 'the free column is capped');
  }
  // A labelled column with nothing in it is left out, with the numbers of the others (grow, free) moved up.
  const t = table(
    { look: { p: plain, width: 100, home: '/h' }, fit: false },
    rowsA.map((r) => [r[0], r[1], r[2], r[3], '', r[5], r[6]]),
    { head, grow: 1, free: [1, 6] },
  );
  assert.ok(!t[0].includes('RUNS'));
  assert.match(t[0], /^ {3}APP +ADDRESS +KIND +LAST$/);
  assert.match(t[1], /^● +Reading list +reading-list +3d ago/);
  // Not when the label is empty (the mark column), or when some row has a value.
  assert.ok(
    table(
      { look: { p: plain, width: 100, home: '/h' }, fit: false },
      [
        ['', 'a'],
        ['', 'b'],
      ],
      { head: ['', 'NAME'] },
    )[1].startsWith('  a'),
  );
});

test('table and fields: aligned, cut to the width on a terminal only', () => {
  const ctx = { look: { p: plain, width: 40, home: '/h' }, fit: false } as Pick<Ctx, 'look' | 'fit'>;
  const rows = [
    ['alpha', '1', 'a long description that goes on and on past the width'],
    ['b', '22', 'short'],
  ];
  const piped = table(ctx, rows, { head: ['NAME', 'N', 'ABOUT'] });
  assert.equal(piped[0], 'NAME   N   ABOUT');
  assert.equal(piped[1], 'alpha  1   a long description that goes on and on past the width');
  const fit = table({ ...ctx, fit: true }, rows, { head: ['NAME', 'N', 'ABOUT'] });
  assert.ok(
    fit.every((l) => [...l].length <= 39),
    'cut',
  );
  assert.match(fit[1], /…$/);
  assert.equal(fit[2], 'b      22  short');
  assert.deepEqual(
    fields(ctx, [
      ['Name', 'x'],
      ['Longer name', 'a\nb'],
      ['Empty', ''],
      ['None', undefined],
    ]),
    ['Name         x', 'Longer name  a', '             b'],
  );
  assert.equal(argLabel({ name: 'p', kind: 'project' }), '<p>');
  assert.equal(argLabel({ name: 'p', kind: 'text', optional: true, rest: true }), '[p…]');
});

// ---- the picker --------------------------------------------------------------------------------------------------

test('picker: filter, move, pick, cancel; lines fit the width', () => {
  const items = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((label, i) => ({ label, hint: i % 2 ? 'odd' : 'even', value: label.toLowerCase() }));
  const s: PickerState = { items, filter: '', index: 0 };
  assert.equal(visible(s).length, 5);
  pickerKey(s, { name: 'down' });
  pickerKey(s, { name: 'down' });
  assert.equal(visible(s)[s.index].value, 'gamma');
  pickerKey(s, { name: 'up' });
  pickerKey(s, { name: 'up' });
  pickerKey(s, { name: 'up' });
  assert.equal(visible(s)[s.index].value, 'epsilon', 'wraps');
  pickerKey(s, { name: 'text', text: 'ta' });
  assert.deepEqual(
    visible(s).map((i) => i.value),
    ['beta', 'delta'],
  );
  assert.equal(s.index, 0, 'the first of what fits');
  pickerKey(s, { name: 'text', text: ' be' });
  assert.deepEqual(
    visible(s).map((i) => i.value),
    ['beta'],
    'words of the label and the hint',
  );
  assert.equal(pickerKey(s, { name: 'enter' }), 'pick');
  pickerKey(s, { name: 'backspace' });
  assert.equal(s.filter, 'ta b');
  pickerKey(s, { name: 'text', text: 'x' });
  assert.equal(pickerKey(s, { name: 'enter' }), null, 'Enter on nothing does nothing');
  assert.match(pickerLines(s, 'Which?', plain, 60).join('\n'), /Nothing fits\./);
  pickerKey(s, { name: 'kill-start' });
  assert.equal(s.filter, '');
  assert.equal(pickerKey(s, { name: 'escape' }), 'cancel');
  assert.equal(pickerKey(s, { name: 'ctrl-c' }), 'cancel');
  const lines = pickerLines(s, 'Which project?', plain, 30, 3);
  assert.equal(lines[0], 'Which project?');
  assert.match(lines[1], /^› type to filter$/);
  assert.match(lines[2], /^❯ Alpha {2}even$/);
  assert.ok(lines.some((l) => /… 2 more/.test(l)));
  assert.match(pickerLines(s, 'x', plain, 80, 3).at(-1)!, /Esc cancels/);
  assert.ok(lines.every((l) => [...l].length <= 29));
  const many = Array.from({ length: 30 }, (_, i) => ({ label: `Item ${i}`, value: `${i}` }));
  const t: PickerState = { items: many, filter: '', index: 20 };
  assert.ok(
    pickerLines(t, 'x', plain, 80, 10).some((l) => l.startsWith('❯ Item 20')),
    'the chosen row is in the window',
  );
});

// ---- run ---------------------------------------------------------------------------------------------------------

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
