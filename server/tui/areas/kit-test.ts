// Checks for what every area stands on: finding the area and verb in the words, each verb's own options parsed
// strictly (typos get "did you mean"), the help and Tab completion that come out of the registry (for every area, so a
// new one is checked by being added), the naming rule, the table and field helpers, the picker's keys and lines. Build
// and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/kit-test.ts && DATA_DIR=/tmp/hydor-test-kit node dist/dev/kit-test.js
import assert from 'node:assert/strict';
import { COMMANDS, helpText, parseArgv, routeOf } from '../args.ts';
import { completeWords, type Api } from '../completion.ts';
import { pickerKey, pickerLines, visible, type PickerState } from '../picker.ts';
import { makePaint, stripAnsi } from '../term.ts';
import { AREAS, areaByName, defaultVerb, findVerb } from './index.ts';
import { argLabel, choose, fields, GROUPS, pickOne, table, UsageError, usageLine, type Ctx } from './kit.ts';
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
    assert.ok(a.summary && a.summary.length <= 70 && !a.summary.endsWith('.'), `${a.name}: a short summary`);
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
      for (const e of v.examples ?? []) assert.ok(e.startsWith('hydor '), `${a.name} ${v.name}: an example is a command`);
      assert.ok((v.examples ?? []).length >= 1, `${a.name} ${v.name}: has an example`);
    }
    const h = helpText(makePaint(true), a.name)!;
    assert.ok(widest(h) <= 80, `${a.name}: help in ${widest(h)} columns`);
    for (const v of a.verbs) assert.ok(stripAnsi(h).includes(v.name), `${a.name}: help lists ${v.name}`);
  }
});

test('registry: help and the parser agree on every verb’s options and words', () => {
  for (const a of AREAS) {
    for (const v of a.verbs) {
      const words = [a.name, ...v.name.split(' ')];
      const route = routeOf(words)!;
      assert.equal(route.verb, v, `${a.name} ${v.name} is found by its words`);
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
    for (const v of a.verbs) assert.ok(verbs.includes(v.name.split(' ')[0]), `${a.name}: ${v.name} is completed`);
    for (const v of a.verbs) {
      const route = v.name.split(' ');
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
    (e: Error) => e instanceof UsageError && /^Unknown projects command: shw\. Did you mean hydor projects show\?\nTo send it to an agent as a message: hydor chat projects shw$/.test(e.message),
  );
  assert.equal(parseArgv(['projects', 'show', 'x', '-y']).yes, true, 'the common short options');
  assert.equal(parseArgv(['projects', '--json']).route!.verb, undefined);
  // The commands that exist are parsed as before.
  assert.equal(parseArgv(['sessions', '-n', '5']).cmd, 'sessions');
  assert.equal(parseArgv(['fix', 'the', 'tests']).cmd, 'chat');
});

// ---- help --------------------------------------------------------------------------------------------------------

test('help: one line an area in hydor help, the area’s verbs, a verb’s options', () => {
  const general = helpText(plain)!;
  assert.match(general, /^ {2}hydor projects +Your projects: /m);
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
