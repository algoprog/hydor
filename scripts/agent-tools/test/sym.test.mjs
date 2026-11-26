// Tests for bin/sym. Fixtures live in ../fixtures/sym (read-only for the tests).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { main } from '../lib/sym/cli.mjs';
import { braceEnd, indentEnd } from '../lib/sym/heuristic.mjs';
import { isTestPath, skipPath, grepWord, rgCommand, rgArgs, parseRg, parseGitGrep, parseGrep, keepFilesWithAllWords, searchLocale, pyStemMatches } from '../lib/sym/search.mjs';
import { posixPath, relPosix, relOrDot, isWithin, relSegments, cleanFound, moduleStem } from '../lib/sym/paths.mjs';
import { loadLanguage, parse, langFilter } from '../lib/sym/grammar.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'fixtures', 'sym');
const BIN = path.join(ROOT, 'bin', 'sym');

// every scratch folder a test makes, removed when the suite ends
const SCRATCH = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); SCRATCH.push(d); return d; };
after(() => { for (const d of SCRATCH) fs.rmSync(d, { recursive: true, force: true }); });

async function sym(args, cwd = FIX) {
  let out = ''; let err = '';
  const code = await main(args, cwd, { out: (s) => { out += s; }, err: (s) => { err += s; } });
  return { code, out, err };
}

// Parse printed definitions: [{file, a, b, kind, name, flags, also, lines:[{n,text}]}]
function parseDefs(out) {
  const defs = [];
  let cur = null;
  for (const line of out.split('\n')) {
    let m = /^(also: )?(\S+?):(\d+)-(\d+) {1,2}(\S+) (\S+)(?: \((.*?)\))?(?: \(.*\))*$/.exec(line);
    if (m && !line.startsWith(' ')) {
      cur = { also: !!m[1], file: m[2], a: +m[3], b: +m[4], kind: m[5], name: m[6], flags: m[7] || '', lines: [] };
      defs.push(cur);
      continue;
    }
    m = /^ +(\d+)  (.*)$/.exec(line);
    if (m && cur) cur.lines.push({ n: +m[1], text: m[2] });
  }
  return defs;
}

// run sym for one name and return its first definition (optionally in a given file)
async function one(name, { file, extra = [], cwd = FIX, nth = 0 } = {}) {
  const r = await sym([name, '--all', '--max-lines', '10000', '--max-chars', '1000000', ...extra], cwd);
  let defs = parseDefs(r.out);
  if (file) defs = defs.filter((d) => d.file === file);
  assert.ok(defs.length > nth, `no definition of ${name}${file ? ' in ' + file : ''}:\n${r.out}`);
  return defs[nth];
}
const first = (d) => d.lines[0].text.trim();
const last = (d) => d.lines[d.lines.length - 1].text.trim();
const text = (d) => d.lines.map((l) => l.text).join('\n');

function srcLine(file, needle, nth = 0) {
  const lines = fs.readFileSync(path.join(FIX, file), 'utf8').split('\n');
  let seen = 0;
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle) && seen++ === nth) return i + 1;
  throw new Error(`needle not found: ${needle}`);
}
function assertRange(d, file, startNeedle, endNeedle, nthEnd = 0) {
  assert.equal(d.a, srcLine(file, startNeedle), `start of ${d.name}`);
  assert.equal(d.b, srcLine(file, endNeedle, nthEnd), `end of ${d.name}`);
}

// ------------------------------------------------------------------ TypeScript

test('ts: function with doc comment, braces in strings/templates/comments', async () => {
  const d = await one('sessionPath', { file: 'ts/forms.ts' });
  assert.equal(d.kind, 'function');
  assert.match(d.flags, /exported/);
  assert.equal(d.a, 3);
  assert.equal(d.b, 7);
  assert.match(first(d), /^\/\*\* Doc for sessionPath/);
  assert.equal(last(d), '}');
  assert.equal(d.lines.length, 5);
});

test('ts: generator function', async () => {
  const d = await one('gen', { file: 'ts/forms.ts' });
  assert.equal(d.a, srcLine('ts/forms.ts', 'export function* gen'));
  assert.equal(d.b, srcLine('ts/forms.ts', 'yield 1;') + 1);
});

test('ts: multi-line signature, async, regex literal and division in body', async () => {
  const d = await one('multi', { file: 'ts/forms.ts' });
  assert.equal(d.a, srcLine('ts/forms.ts', 'export async function multi('));
  assert.equal(d.b, srcLine('ts/forms.ts', 'await Promise.resolve(re);') + 1);
  assert.match(d.flags, /async/);
});

test('ts: overload signatures are grouped with the implementation', async () => {
  const d = await one('over', { file: 'ts/forms.ts' });
  assert.equal(d.a, srcLine('ts/forms.ts', '// overloads share one extent'));
  assert.equal(d.b, srcLine('ts/forms.ts', 'export function over(a: any)') + 2);
  assert.match(d.flags, /2 overloads/);
  const amb = await one('ambient', { file: 'ts/forms.ts' });
  assert.equal(amb.a, srcLine('ts/forms.ts', 'declare function ambient(a: string)'));
  assert.equal(amb.b, amb.a + 1);
});

test('ts: decorated exported class includes decorator and export', async () => {
  const d = await one('Widget', { file: 'ts/forms.ts' });
  assert.equal(d.kind, 'class');
  assert.equal(first(d), "@Component({ selector: 'x' })");
  assert.equal(d.b, srcLine('ts/forms.ts', 'static create()') + 1);
  assert.equal(last(d), '}');
});

test('ts: class members (method with decorator, getter, setter, fields, arrow field, static)', async () => {
  const onClick = await one('Widget.onClick');
  assert.equal(onClick.kind, 'method');
  assert.equal(first(onClick), "@HostListener('click')");
  assert.equal(onClick.b, onClick.a + 3);
  const getter = await one('Widget.value', { nth: 0 });
  assert.equal(getter.kind, 'getter');
  const setter = await one('Widget.value', { nth: 1 });
  assert.equal(setter.kind, 'setter');
  const field = await one('Widget.name');
  assert.equal(field.kind, 'field');
  assert.equal(first(field), '/** the name */');
  assert.equal(field.lines.length, 2);
  const handler = await one('Widget.handler');
  assert.equal(handler.kind, 'method');
  assert.equal(handler.b, handler.a + 2);
  const count = await one('Widget.count');
  assert.match(count.flags, /private/);
  assert.match(count.flags, /static/);
  const create = await one('Widget.create');
  assert.match(create.flags, /static/);
  const priv = await sym(['Widget.secret']);
  assert.equal(priv.code, 1);
});

test('ts: method overloads grouped', async () => {
  const d = await one('Widget.method');
  assert.equal(d.lines.length, 3);
  assert.match(d.flags, /2 overloads/);
});

test('ts: abstract members, interface and interface members', async () => {
  const abs = await one('AbstractThing.run');
  assert.match(abs.flags, /abstract/);
  const itf = await one('IFoo');
  assert.equal(itf.kind, 'interface');
  assert.equal(itf.a, srcLine('ts/forms.ts', 'export interface IFoo'));
  assert.equal(itf.b, srcLine('ts/forms.ts', 'readonly [key: string]: any;') + 1);
  const m = await one('IFoo.run');
  assert.equal(m.lines.length, 1);
  // interface members are not returned for plain lookups
  const plain = await sym(['id', '--lang', 'ts']);
  assert.ok(!/IFoo/.test(plain.out), plain.out);
});

test('ts: type alias, enum, enum member, const enum', async () => {
  const alias = await one('Alias', { file: 'ts/forms.ts' });
  assert.equal(alias.kind, 'type');
  assert.equal(last(alias), '} | null;');
  const en = await one('Color');
  assert.equal(en.kind, 'enum');
  assert.equal(en.lines.length, 4);
  const mem = await one('Color.Red');
  assert.equal(mem.kind, 'enum-member');
  assert.equal(mem.lines.length, 1);
  const ce = await one('CE');
  assert.equal(ce.kind, 'enum');
});

test('ts: namespaces (dotted), members, declare module members', async () => {
  const ns = await one('Outer');
  assert.equal(ns.kind, 'namespace');
  assert.equal(ns.lines.length, 4);
  const inner = await one('Outer.Inner.nsFn');
  assert.equal(inner.lines.length, 1);
  assert.equal(inner.name, 'Outer.Inner.nsFn');
  const declared = await one('declared');
  assert.match(first(declared), /export function declared/);
});

test('ts: arrow returning object, call initialiser, tagged template, object literal', async () => {
  const arrow = await one('arrow', { file: 'ts/forms.ts' });
  assert.equal(arrow.kind, 'function');
  assert.equal(arrow.lines.length, 1);
  const memo = await one('memo');
  assert.equal(memo.kind, 'const');
  assert.equal(memo.lines.length, 3);
  const styled = await one('styledBox');
  assert.equal(last(styled), '`;');
  assert.equal(styled.lines.length, 3);
  const obj = await one('obj');
  assert.equal(obj.lines.length, 7);
});

test('ts: object-literal members only for qualified lookups or when nothing else matched', async () => {
  const q = await one('obj.method');
  assert.match(q.flags, /object property/);
  const q2 = await one('obj.prop');
  assert.equal(q2.kind, 'function');
  const q3 = await one('obj.nested.deep');
  assert.equal(q3.lines.length, 1);
  // `method`: a class method exists, so the object-literal method is not listed
  const r = await sym(['method', '--lang', 'ts']);
  assert.ok(!/obj\.method/.test(r.out), r.out);
  // `prop`: nothing else matched, so the object-literal property is returned
  const p = await sym(['prop', '--lang', 'ts']);
  assert.match(p.out, /obj\.prop/);
});

test('ts: let/var declarators, function expression, default export, class expression', async () => {
  const counter = await one('counter');
  assert.equal(counter.kind, 'variable');
  const legacy = await one('legacy');
  assert.equal(legacy.kind, 'function');
  const fnExpr = await one('fnExpr');
  assert.equal(fnExpr.kind, 'function');
  const def = await one('defaultFn');
  assert.match(def.flags, /default/);
  assert.match(first(def), /^export default function defaultFn/);
  const klass = await one('klass');
  assert.equal(klass.kind, 'class');
});

test('ts: re-exports are printed as one line pointing at the source', async () => {
  const r = await sym(['renamedPath', 'Widget2']);
  assert.match(r.out, /ts\/forms\.ts:\d+  re-export renamedPath/);
  assert.match(r.out, /re-export Widget2 from '\.\/widget' \(as Widget\)/);
  assert.equal(r.code, 0);
});

test('ts: nested functions rank last; plain local variables only when nothing else matched', async () => {
  const inner = await one('inner', { file: 'ts/forms.ts' });
  assert.equal(inner.name, 'outer.inner');
  const local = await one('local');
  assert.match(local.flags, /local/);
});

test('ts: regex literals and strings with braces (tricky.ts)', async () => {
  const a = await one('regexy');
  assert.equal(a.b - a.a, 5);
  assert.equal(last(a), '}');
  const b = await one('stringy');
  assert.equal(b.b - b.a, 8);
  const c = await one('afterTricky');
  assert.equal(c.lines.length, 1);
});

test('tsx: JSX text with braces and apostrophes', async () => {
  const v = await one('View', { file: 'ts/view.tsx' });
  assert.equal(v.a, 3);
  assert.equal(v.b, 12);
  assert.equal(v.flags.includes('parse errors'), false, v.flags);
  const arrow = await one('Arrow');
  assert.equal(arrow.lines.length, 1);
  const page = await one('Page');
  assert.match(page.flags, /default/);
});

// ------------------------------------------------------------------ JavaScript

test('js: function, arrow, class members, object-literal method, re-export, mjs/cjs/jsx', async () => {
  const plain = await one('plain', { file: 'js/forms.js' });
  assert.equal(plain.a, 3);
  assert.equal(plain.b, 8);
  assert.equal(first(plain), '/**');
  const cls = await one('Counter', { file: 'js/forms.js' });
  assert.equal(cls.lines.length, 7);
  const make = await one('Counter.make');
  assert.match(make.flags, /static/);
  const dbl = await one('Counter.double');
  assert.equal(dbl.kind, 'getter');
  const onOpen = await one('onOpen');
  assert.match(onOpen.flags, /object property/);
  const esm = await one('esm');
  assert.equal(esm.lines.length, 3);
  const thing = await one('Thing');
  assert.match(thing.flags, /default/);
  const cjs = await one('viaCjs');
  assert.equal(cjs.file, 'js/cjs.cjs');
  const card = await one('Card');
  assert.equal(card.file, 'js/jsx-component.jsx');
  assert.equal(card.lines.length, 3);
  const re = await sym(['plainAlias']);
  assert.match(re.out, /re-export plainAlias/);
});

// ------------------------------------------------------------------ Python

test('py: function with leading comment, nested def, multi-line string, trailing comment', async () => {
  const d = await one('helper', { file: 'py/forms.py' });
  assert.equal(first(d), '# leading comment for helper');
  assert.equal(last(d), 'return inner() + len(text)  # trailing');
  assert.equal(d.b - d.a, 9);
});

test('py: decorated class with multi-line decorator; extent ends before trailing comment', async () => {
  const d = await one('Service', { file: 'py/forms.py' });
  assert.equal(first(d), '@decorator');
  assert.equal(d.kind, 'class');
  assert.equal(last(d), 'return 1');
  assert.ok(!text(d).includes('trailing comment inside class'));
});

test('py: methods, property/setter, staticmethod async with multi-line signature, nested class', async () => {
  const prop = await one('Service.name', { nth: 0 });
  assert.equal(prop.kind, 'property');
  assert.equal(first(prop), '@property');
  const setter = await one('Service.name', { nth: 1 });
  assert.equal(first(setter), '@name.setter');
  const create = await one('Service.create');
  assert.match(create.flags, /async/);
  assert.match(create.flags, /staticmethod/);
  assert.equal(create.lines.length, 6);
  const deep = await one('Nested.deep');
  assert.equal(deep.name, 'Service.Nested.deep');
  const init = await one('Service.__init__');
  assert.equal(init.lines.length, 2);
});

test('py: overload group, async def, string containing def/class', async () => {
  const ov = await one('ov');
  assert.match(ov.flags, /2 overloads/);
  assert.equal(ov.lines.length, 6);
  const fetch = await one('fetch');
  assert.match(fetch.flags, /async/);
  const ms = await one('multiline_string');
  assert.equal(ms.lines.length, 6);
  const nxt = await one('last');
  assert.equal(nxt.lines.length, 2);
  const fake = await sym(['not_a_def']);
  assert.equal(fake.code, 1);
  const fake2 = await sym(['Fake']);
  assert.equal(fake2.code, 1);
});

test('py: module-level and class-level assignments (annotated, tuple, conditional), lambda, type alias', async () => {
  const c = await one('MAX_SIZE');
  assert.equal(c.kind, 'const');
  assert.equal(first(c), 'MAX_SIZE: int = 10');
  const dn = await one('DEFAULT_NAME');
  assert.equal(dn.lines.length, 1);
  const pair = await one('a_pair');
  assert.equal(pair.lines.length, 1);
  const cond = await one('COND_CONST');
  assert.equal(cond.kind, 'const');
  const reg = await one('registry');
  assert.equal(reg.kind, 'field');
  const lim = await one('Service.limit');
  assert.equal(lim.lines.length, 1);
  const lam = await one('lam');
  assert.equal(lam.kind, 'function');
  const alias = await one('Alias', { file: 'py/forms.py' });
  assert.equal(alias.kind, 'type');
  // local variables are not definitions
  const loc = await sym(['text', '--lang', 'py']);
  assert.equal(loc.code, 1);
});

test('py: module.func qualified by file stem', async () => {
  const d = await one('forms.helper');
  assert.equal(d.file, 'py/forms.py');
});

// ------------------------------------------------------------------ Rust

test('rs: struct with doc comment, attributes and where clause', async () => {
  const d = await one('Config', { file: 'rs/forms.rs' });
  assert.equal(d.kind, 'struct');
  assert.equal(first(d), '/// Doc line one.');
  assert.equal(d.a, 5);
  assert.equal(d.b, 15);
  assert.match(d.flags, /pub/);
  assert.equal(text(d).includes('#[serde(rename = "x")]'), true);
});

test('rs: impl blocks listed one line each without bodies', async () => {
  const r = await sym(['Config', '--lang', 'rs']);
  assert.match(r.out, /impl blocks for Config:/);
  assert.match(r.out, /rs\/forms\.rs:20-38 impl<T> Config<T>$/m);
  assert.match(r.out, /rs\/forms\.rs:40-44 impl<T: Copy \+ Default> fmt::Display for Config<T>$/m);
  const u = await sym(['Unit', '--lang', 'rs']);
  assert.match(u.out, /impl Default for Unit/);
});

test('rs: methods (qualified), trait impl method, raw strings and char literals', async () => {
  const n = await one('Config::new');
  assert.equal(n.kind, 'method');
  assert.equal(first(n), '/// Builds a config.');
  assert.equal(last(n), '}');
  assert.equal(n.lines.length, 8);
  const f = await one('Config::fmt');
  assert.match(f.flags, /impl Display/);
  const plain = await one('fmt');
  assert.equal(plain.name, 'Config::fmt');
});

test('rs: trait, associated type/const, default method, macro_rules, enum, variant, union', async () => {
  const tr = await one('Runner');
  assert.equal(tr.kind, 'trait');
  assert.equal(tr.lines.length, 9);
  const desc = await one('Runner::describe');
  assert.equal(desc.lines.length, 3);
  const ty = await one('Runner::Output');
  assert.equal(ty.kind, 'type');
  const mac = await one('square');
  assert.equal(mac.kind, 'macro');
  assert.equal(mac.lines.length, 5);
  const en = await one('Mode');
  assert.equal(first(en), '#[derive(Debug)]');
  assert.match(en.flags, /pub\(crate\)/);
  const v = await one('Mode::Slow');
  assert.equal(v.kind, 'variant');
  const un = await one('Bits');
  assert.equal(un.kind, 'union');
});

test('rs: type alias, static, const, mod, nested fn with where clause and lifetimes', async () => {
  assert.equal((await one('Pair')).kind, 'type');
  assert.equal((await one('GREETING')).kind, 'static');
  assert.equal((await one('MAX')).kind, 'const');
  const m = await one('inner', { file: 'rs/forms.rs' });
  assert.equal(m.kind, 'mod');
  const nf = await one('inner::nested_fn');
  assert.equal(nf.lines.length, 6);
  const lt = await one('lifetimes');
  assert.match(lt.flags, /async/);
  assert.equal(lt.lines.length, 5);
  const tup = await one('Tuple');
  assert.equal(tup.lines.length, 1);
  const ext = await one('ext_c');
  assert.equal(ext.lines.length, 1);
});

test('rs: cfg(test) module and #[test] functions are tests', async () => {
  const d = await one('config_new_works');
  assert.match(d.flags, /test/);
  const none = await sym(['config_new_works', '--no-tests']);
  assert.equal(none.code, 1);
  assert.match(none.out, /no definition of config_new_works found/);
});

// ------------------------------------------------------------------ ordering, limits, options

test('order: non-test before test; exported top-level before nested; nearer before deeper; first 3 bodies then also:', async () => {
  const r = await sym(['target'], path.join(FIX, 'order'));
  const defs = parseDefs(r.out);
  assert.deepEqual(defs.map((d) => `${d.also ? 'also:' : ''}${d.file}`), [
    'src/util.ts', 'lib/deeper/fourth.ts', 'lib/deeper/third.ts',
    'also:src/inner/deep.ts', 'also:lib/more.ts', 'also:lib/more.ts', 'also:__tests__/util.ts',
  ]);
  assert.equal(defs.filter((d) => !d.also).every((d) => d.lines.length > 0), true);
  assert.equal(defs.filter((d) => d.also).every((d) => d.lines.length === 0), true);
  assert.equal(defs[4].name, 'Holder.target');
  assert.equal(defs[5].name, 'wrapper.target');
});

test('order: --all prints every body; --no-tests drops test files; --in restricts and orders', async () => {
  const all = parseDefs((await sym(['target', '--all'], path.join(FIX, 'order'))).out);
  assert.equal(all.length, 7);
  assert.equal(all.every((d) => !d.also && d.lines.length > 0), true);
  const nt = await sym(['target', '--no-tests'], path.join(FIX, 'order'));
  assert.ok(!nt.out.includes('__tests__'));
  const inn = parseDefs((await sym(['target', '--in', 'lib'], path.join(FIX, 'order'))).out);
  assert.deepEqual(inn.map((d) => d.file), ['lib/deeper/fourth.ts', 'lib/deeper/third.ts', 'lib/more.ts', 'lib/more.ts']);
  const file = parseDefs((await sym(['target', '--in', 'src/util.ts'], path.join(FIX, 'order'))).out);
  assert.deepEqual(file.map((d) => d.file), ['src/util.ts']);
});

test('--max-lines elides the middle and prints a sed hint', async () => {
  const r = await sym(['Widget', '--max-lines', '10', '--lang', 'ts']);
  assert.match(r.out, /  … 11 lines omitted \(sed -n '\d+,\d+p' ts\/forms\.ts\) …/);
  const d = parseDefs(r.out)[0];
  assert.equal(d.lines.length, 6 + 4);
  assert.equal(d.lines[0].n, 29);
  assert.equal(d.lines[d.lines.length - 1].n, 49);
  const m = /sed -n '(\d+),(\d+)p'/.exec(r.out);
  assert.equal(Number(m[1]), d.lines[5].n + 1);
  assert.equal(Number(m[2]), d.lines[6].n - 1);
});

test('--max-chars shrinks bodies; several names share the budget fairly', async () => {
  const r = await sym(['Widget', 'sessionPath', 'Service', '--max-chars', '900', '--lang', 'ts']);
  assert.ok(r.out.length < 2400, `output ${r.out.length}`);
  assert.match(r.out, /## Widget/);
  assert.match(r.out, /## sessionPath/);
  assert.match(r.out, /## Service/);
  assert.match(r.out, /sessionPath \(exported\)/);
});

test('long lines are cut at 240 characters with an ellipsis', async () => {
  const dir = mkTmp('sym-long-');
  fs.writeFileSync(path.join(dir, 'long.ts'), `export const longOne = "${'x'.repeat(400)}";\n`);
  const r = await sym(['longOne'], dir);
  const line = r.out.split('\n').find((l) => l.startsWith('  1  '));
  assert.equal(line.length, '  1  '.length + 241);
  assert.ok(line.endsWith('…'));
});

test('--sig prints signature and doc comment only', async () => {
  const r = await sym(['sessionPath', 'Service', 'Config::new', '--sig']);
  const defs = parseDefs(r.out);
  const sp = defs.find((d) => d.name === 'sessionPath');
  assert.equal(sp.lines.length, 2);
  assert.match(r.out, /body omitted: 3 more lines \(sed -n '5,7p' ts\/forms\.ts\)/);
  const svc = defs.find((d) => d.name === 'Service');
  assert.equal(svc.lines.length, 5); // 2 decorators (3 lines) + class line + docstring
  const nw = defs.find((d) => d.name === 'Config::new');
  assert.equal(nw.lines.length, 2);
});

test('--kind filters; --lang restricts', async () => {
  const a = await sym(['Alias', '--kind', 'type']);
  assert.equal(parseDefs(a.out).length, 2);
  const b = await sym(['Alias', '--kind', 'type', '--lang', 'py']);
  assert.equal(parseDefs(b.out).length, 1);
  const c = await sym(['run', '--kind', 'method', '--lang', 'rs']);
  assert.equal(parseDefs(c.out).length, 1);
  const d = await sym(['Mode', '--kind', 'function']);
  assert.equal(d.code, 1);
  const e = await sym(['Config', '--kind', 'struct', '--lang', 'rs']);
  assert.equal(parseDefs(e.out)[0].kind, 'struct');
  const f = await sym(['arrow', '--kind', 'const', '--lang', 'ts']);
  assert.equal(parseDefs(f.out)[0].kind, 'function'); // const-declared function
});

test('names are case-sensitive and whole-identifier', async () => {
  assert.equal((await sym(['sessionpath'])).code, 1);
  assert.equal((await sym(['sessionPat'])).code, 1);
  assert.equal((await sym(['Session'])).code, 1);
});

test('not found: message, hints with occurrences, exit code only 1 when ALL names missing', async () => {
  const r = await sym(['target', '--in', 'order/src/only.ts'], FIX);
  assert.equal(r.code, 1);
  assert.match(r.out, /^no definition of target found \(searched 1 files with the word\)/);
  assert.match(r.out, /order\/src\/only\.ts:4: \/\/ mentions target in a comment/);
  const missing = await sym(['zzNoSuchName']);
  assert.equal(missing.code, 1);
  assert.match(missing.out, /no definition of zzNoSuchName found \(searched 0 files with the word\)/);
  const mixed = await sym(['sessionPath', 'zzNoSuchName']);
  assert.equal(mixed.code, 0);
  assert.match(mixed.out, /## zzNoSuchName\nno definition/);
  const hints = r.out.split('\n').filter((l) => /^  \S+:\d+: /.test(l));
  assert.ok(hints.length >= 1 && hints.length <= 5);
});

test('usage errors exit 2; --help is short with six examples', async () => {
  const bad = await sym(['--nope']);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /Unknown option/);
  assert.equal((await sym([])).code, 2);
  assert.equal((await sym(['x', '--max-lines', 'abc'])).code, 2);
  assert.equal((await sym(['x', '--lang', 'cobol'])).code, 2);
  assert.equal((await sym(['x', '--in', 'does/not/exist'])).code, 2);
  assert.equal((await sym(['foo bar'])).code, 2);
  const h = await sym(['--help']);
  assert.equal(h.code, 0);
  assert.ok(h.out.trimEnd().split('\n').length < 50);
  assert.equal(h.out.split('\n').filter((l) => /^  sym /.test(l) && l.includes('#')).length, 6);
});

// ------------------------------------------------------------------ references

test('refs: counts, labels, grouping, comments/strings excluded, definitions excluded', async () => {
  const r = await sym(['--refs', 'target'], path.join(FIX, 'order'));
  const lines = r.out.split('\n');
  assert.match(lines[0], /^\d+ references in \d+ files, \d+ definitions: /);
  assert.ok(!r.out.includes('only.ts'), 'comment/string mentions must be excluded');
  assert.match(r.out, /\n +\d+ +.*  \[call\]\n/);
  const refs = await sym(['--refs', 'sessionPath'], FIX);
  assert.match(refs.out, /ts\/forms\.ts\n.*other|ts\/forms\.ts\n/);
  assert.ok(!/^ +\d+ +\w+ +export function sessionPath/m.test(refs.out), 'definition line excluded');
  assert.match(refs.out, /export \{ sessionPath as renamedPath \}/);
});

test('refs: labels for call / import / type / other (ts, py, rs)', async () => {
  const dir = mkTmp('sym-refs-');
  fs.writeFileSync(path.join(dir, 'a.ts'), [
    "import { Foo } from './foo';",
    'const x: Foo = new Foo();',
    'Foo.bar();',
    'foo.Foo();',
    '// Foo in a comment',
    'const s = "Foo in a string";',
    'const t = `Foo ${Foo}`;',
    'function f(a: Array<Foo>) { return Foo; }',
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'b.py'), [
    'from m import Foo',
    'x = Foo()',
    'def g(a: Foo) -> Foo:',
    '    # Foo comment',
    '    return "Foo"',
    'y = obj.Foo(1)',
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'c.rs'), [
    'use crate::Foo;',
    'fn h(a: Foo) -> Foo { Foo::new() }',
    '// Foo',
    'let s = "Foo";',
    'fn k() { Foo::make(); foo.Foo(); }',
  ].join('\n') + '\n');
  const r = await sym(['--refs', 'Foo', '--all'], dir);
  const byFile = {};
  let cur = null;
  for (const l of r.out.split('\n').slice(1)) {
    if (/^\S/.test(l)) { cur = l; byFile[cur] = {}; continue; }
    const m = /^ +(\d+) +.*  \[(\w+|\?)\]$/.exec(l);
    if (m && cur) byFile[cur][m[1]] = m[2];
  }
  assert.deepEqual(byFile['a.ts'], { 1: 'import', 2: 'call', 3: 'other', 4: 'call', 7: 'other', 8: 'type' });
  assert.deepEqual(byFile['b.py'], { 1: 'import', 2: 'call', 3: 'type', 6: 'call' });
  assert.deepEqual(byFile['c.rs'], { 1: 'import', 2: 'type', 5: 'call' });
  assert.match(r.out.split('\n')[0], /^\d+ references in 3 files/);
});

test('refs: cap at 60 lines with a per-file summary of the rest', async () => {
  const dir = mkTmp('sym-cap-');
  for (let f = 0; f < 4; f++) {
    fs.writeFileSync(path.join(dir, `f${f}.ts`), Array.from({ length: 30 }, (_, i) => `use(thing${i}, Zed);`).join('\n') + '\n');
  }
  const r = await sym(['--refs', 'Zed'], dir);
  assert.match(r.out, /^120 references in 4 files/);
  assert.match(r.out, /… and 60 more in 2 files:\n {2}f\d\.ts \(30\)\n {2}f\d\.ts \(30\)/);
  const all = await sym(['--refs', 'Zed', '--all'], dir);
  assert.ok(!all.out.includes('… and'));
});

test('refs: unparsable file keeps occurrences marked with ?', async () => {
  const dir = mkTmp('sym-q-');
  fs.writeFileSync(path.join(dir, 'broken.ts'), 'function ((( { Qux Qux\n// Qux\n');
  const r = await sym(['--refs', 'Qux'], dir);
  assert.match(r.out, /\[\?\]/);
});

// ------------------------------------------------------------------ outline

test('outline: ts top-level and members indented, ranges and first lines', async () => {
  const r = await sym(['--outline', 'ts/forms.ts']);
  const lines = r.out.split('\n');
  assert.equal(lines[0], 'ts/forms.ts');
  assert.ok(lines.includes('  3-7  export function sessionPath(key: string): string {'));
  assert.ok(lines.includes('  29-49  export class Widget<T> extends Base implements IFoo {'));
  assert.ok(lines.includes("    36-39  onClick(e: Event): void {"));
  assert.ok(lines.includes('    58-58  run(a: number): void;'));
  assert.ok(lines.includes('  22-27  export function over(a: any): any {') || lines.includes('  22-27  export function over(a: string): string;'));
});

test('outline: python includes decorator count, rust impl members', async () => {
  const p = await sym(['--outline', 'py/forms.py']);
  assert.ok(p.out.split('\n').includes('  22-51  @2 class Service(Base):'));
  assert.ok(p.out.split('\n').includes('    34-36  @1 def name(self):'));
  const r = await sym(['--outline', 'rs/forms.rs']);
  assert.ok(r.out.split('\n').includes('  20-38  impl<T> Config<T>'));
  assert.ok(r.out.split('\n').includes('    24-31  pub fn new(name: &str) -> Self {'));
});

test('outline: files over 400 entries show top-level only and say so', async () => {
  const dir = mkTmp('sym-big-');
  let src = 'export class Big {\n';
  for (let i = 0; i < 450; i++) src += `  m${i}() { return ${i}; }\n`;
  src += '}\nexport function tail() {}\n';
  fs.writeFileSync(path.join(dir, 'big.ts'), src);
  const r = await sym(['--outline', 'big.ts'], dir);
  assert.match(r.out, /big\.ts — 452 entries; showing top-level only/);
  assert.ok(!r.out.includes('m10()'));
  assert.match(r.out, /export function tail\(\) \{\}/);
});

test('outline: missing and unsupported files are reported', async () => {
  const r = await sym(['--outline', 'nope.ts', 'ts/forms.ts', 'README.md']);
  assert.match(r.out, /nope\.ts: no such file/);
  assert.match(r.out, /README\.md: no such file|unsupported file type/);
  assert.equal(r.code, 0);
});

// ------------------------------------------------------------------ heuristic fallback

function symProc(args, env = {}, cwd = FIX) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

test('fallback: without grammars extents are heuristic, marked, and agree with the parser on fixtures', async () => {
  const names = ['sessionPath', 'gen', 'multi', 'regexy', 'stringy', 'afterTricky', 'arrow', 'memo', 'styledBox', 'Widget', 'AbstractThing',
    'IFoo', 'Color', 'obj', 'View', 'Arrow', 'Page', 'helper', 'Service', 'fetch', 'multiline_string', 'last', 'MAX_SIZE', 'ov',
    'Config', 'Runner', 'Mode', 'square', 'Bits', 'lifetimes', 'GREETING', 'Pair'];
  let compared = 0;
  for (const name of names) {
    const withG = parseDefs((await sym([name, '--all'])).out).filter((d) => d.file.match(/forms|tricky|view/));
    const h = symProc([name, '--all'], { SYM_NO_GRAMMAR: '1' });
    assert.ok(h.stdout.includes('heuristic extent'), `${name}: ${h.stdout}`);
    const hd = parseDefs(h.stdout).filter((d) => d.file.match(/forms|tricky|view/));
    for (const g of withG) {
      if (['method', 'field', 'variant'].includes(g.kind) || g.kind.startsWith('impl') || g.flags.includes('overload')) continue;
      const m = hd.find((x) => x.file === g.file && x.a === g.a);
      assert.ok(m, `${name}: heuristic missed ${g.file}:${g.a}-${g.b}\n${h.stdout}`);
      assert.equal(m.b, g.b, `${name}: heuristic end ${m.b} vs parser ${g.b} in ${g.file}`);
      compared++;
    }
  }
  assert.ok(compared >= 28, `compared ${compared}`);
});

test('fallback: per-language switch, outline and refs keep working and say so', async () => {
  const o = symProc(['--outline', 'py/forms.py', 'rs/forms.rs'], { SYM_NO_GRAMMAR: 'py,rs' });
  assert.match(o.stdout, /py\/forms\.py \(heuristic extents: no grammar\)/);
  assert.match(o.stdout, /\n {2}22-51 {2}class Service\(Base\):/);
  assert.match(o.stdout, /rs\/forms\.rs \(heuristic extents: no grammar\)/);
  const mixed = symProc(['sessionPath', 'helper'], { SYM_NO_GRAMMAR: 'py' });
  assert.match(mixed.stdout, /function sessionPath \(exported\)\n/);
  assert.match(mixed.stdout, /function helper \(heuristic extent\)/);
  const r = symProc(['--refs', 'Service'], { SYM_NO_GRAMMAR: 'py' });
  assert.match(r.stdout, /\[\?\]/);
});

test('heuristic scanners: braceEnd skips strings, templates, comments, regex, rust raw strings and lifetimes', () => {
  const ts = 'function f() {\n  const a = "}"; const b = `${"}"}${`{`}`; /* } */ // }\n  const r = /[}]/g;\n}\nnext();\n';
  assert.equal(ts.slice(0, braceEnd(ts, 'typescript', 0)), 'function f() {\n  const a = "}"; const b = `${"}"}${`{`}`; /* } */ // }\n  const r = /[}]/g;\n}');
  const rs = "fn f<'a>(x: &'a str) {\n  let c = '}'; let s = r#\"}\"#; let d = '\\'';\n}\nfn g() {}\n";
  assert.equal(rs.slice(0, braceEnd(rs, 'rust', 0)), "fn f<'a>(x: &'a str) {\n  let c = '}'; let s = r#\"}\"#; let d = '\\'';\n}");
  const py = ['def f():', '    s = """', 'def x():', '"""', '    return s', '', '# c', 'def g(): pass'];
  assert.equal(indentEnd(py, 0), 4);
});

// ------------------------------------------------------------------ git work trees

test('git: uses git grep (tracked and untracked files, .gitignore honoured)', async () => {
  const dir = mkTmp('sym-git-');
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'tracked.ts'), 'export function inGit() {\n  return 1;\n}\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored/\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  fs.writeFileSync(path.join(dir, 'untracked.ts'), 'export function inGit2() {}\nexport const inGit3 = inGit();\n');
  fs.mkdirSync(path.join(dir, 'ignored'));
  fs.writeFileSync(path.join(dir, 'ignored', 'x.ts'), 'export function inGit() {}\n');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'y.ts'), 'export function inGit() {}\n');
  const r = await sym(['inGit', 'inGit2'], dir);
  const defs = parseDefs(r.out);
  assert.deepEqual(defs.map((d) => `${d.file}:${d.a}-${d.b}`), ['tracked.ts:1-3', 'untracked.ts:1-1']);
  const refs = await sym(['--refs', 'inGit'], dir);
  assert.match(refs.out, /^1 references in 1 files, 1 definitions: tracked\.ts:1-3/);
  assert.match(refs.out, /untracked\.ts/);
});

test('files over 2 MB are skipped', async () => {
  const dir = mkTmp('sym-2mb-');
  fs.writeFileSync(path.join(dir, 'huge.ts'), 'export function hugeOne() {}\n' + '// pad\n'.repeat(300000));
  try {
    const r = await sym(['hugeOne'], dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /searched 0 files/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bin/sym runs as a process and sets the exit code', () => {
  const ok = symProc(['sessionPath']);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /^ts\/forms\.ts:3-7 {2}function sessionPath \(exported\)/);
  const no = symProc(['zzNoSuch']);
  assert.equal(no.status, 1);
  const st = fs.statSync(BIN);
  assert.ok(st.mode & 0o111, 'executable');
  assert.equal(fs.readFileSync(BIN, 'utf8').split('\n')[0], '#!/usr/bin/env node');
});

test('isTestPath / skipPath classify paths', () => {
  for (const p of ['test/a.ts', 'src/tests/a.py', 'src/__tests__/a.ts', 'a/foo-test.ts', 'a/foo.test.ts', 'a/foo_test.go.rs', 'a/foo.spec.ts', 'a/test_foo.py', 'a/spec/b.rs', 'x/foo_test.py']) assert.equal(isTestPath(p), true, p);
  for (const p of ['src/latest.ts', 'src/attest/a.ts', 'src/contest.ts', 'a/testing.ts', 'src/protest/a.py']) assert.equal(isTestPath(p), false, p);
  for (const p of ['node_modules/x/a.js', 'a/dist/b.js', 'a/build/b.js', 'a/target/b.rs', 'a/.git/x.js', 'venv/a.py', '.venv/a.py', 'a/__pycache__/b.py', 'a/b.min.js']) assert.equal(skipPath(p), true, p);
  assert.equal(skipPath('src/a.js'), false);
});

test('grammars: every vendored grammar loads (ABI-compatible with web-tree-sitter) and parses a real fixture without errors', async () => {
  const samples = { typescript: 'ts/forms.ts', tsx: 'ts/view.tsx', javascript: 'js/forms.js', python: 'py/forms.py', rust: 'rs/forms.rs' };
  for (const [lang, file] of Object.entries(samples)) {
    const L = await loadLanguage(lang);
    assert.ok(L, `${lang} failed to load`);
    assert.ok(L.abiVersion >= 13 && L.abiVersion <= 15, `${lang} ABI ${L.abiVersion}`);
    const tree = await parse(lang, fs.readFileSync(path.join(FIX, file), 'utf8'));
    assert.ok(tree, `${lang} did not parse`);
    assert.equal(tree.rootNode.hasError, false, `${lang}: parse errors in ${file}`);
    assert.ok(tree.rootNode.namedChildCount > 2);
    tree.delete();
  }
});

test('grammars: vendored wasm files match the checksums in their SOURCE.txt files, and nothing is imported from an installed package', () => {
  const check = (dir, pattern) => {
    const src = fs.readFileSync(path.join(dir, 'SOURCE.txt'), 'utf8');
    assert.match(src, pattern);
    const sums = src.split('\n').filter((l) => /^[0-9a-f]{64}  /.test(l));
    assert.ok(sums.length >= 2, dir);
    for (const line of sums) {
      const [sum, name] = line.split('  ');
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex'), sum, name);
    }
    return sums.length;
  };
  assert.equal(check(path.join(ROOT, 'lib', 'sym', 'grammars'), /tree-sitter-wasms@\d+\.\d+\.\d+/), 5);
  assert.equal(check(path.join(ROOT, 'lib', 'sym', 'vendor', 'web-tree-sitter'), /web-tree-sitter@\d+\.\d+\.\d+/), 2);
  // and sym needs no installed packages: the runtime is imported from the vendored copy, never by its package name
  for (const dir of [path.join('lib', 'sym'), path.join('lib', 'sym', 'dev'), 'bin']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      const full = path.join(ROOT, dir, f);
      if (fs.statSync(full).isFile()) assert.doesNotMatch(fs.readFileSync(full, 'utf8'), /(?:from|import\()\s*['"]web-tree-sitter['"]/, `${dir}/${f}`);
    }
  }
});

// ------------------------------------------------------------------ search backends: ripgrep, git grep, grep -r

const REPO_ROOT = path.join(ROOT, '..', '..');
// a ripgrep binary shipped with a dependency of the repository, found by globbing node_modules/@openai/*/vendor/*/codex-path/rg*
function findRipgrep() {
  const base = path.join(REPO_ROOT, 'node_modules', '@openai');
  const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
  for (const pkg of ls(base)) {
    for (const triple of ls(path.join(base, pkg, 'vendor'))) {
      for (const f of ls(path.join(base, pkg, 'vendor', triple, 'codex-path'))) {
        const full = path.join(base, pkg, 'vendor', triple, 'codex-path', f);
        if (/^rg(\.exe)?$/.test(f) && fs.statSync(full).isFile()) return full;
      }
    }
  }
  return null;
}
const RG = findRipgrep();
const haveTool = (cmd) => { try { return spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0; } catch { return false; } };
const BACKEND_LIST = ['git', 'grep', ...(RG ? ['rg'] : [])].filter((b) => b === 'rg' || haveTool(b));
const RG_SKIP = RG ? false : 'no ripgrep binary found (looked for node_modules/@openai/*/vendor/*/codex-path/rg*): the rg backend is NOT tested';
if (!RG) process.stderr.write(`# SKIPPED: ${RG_SKIP}\n`);

// run fn with environment variables set (undefined deletes), then restore them
async function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
}
const viaBackend = (backend, extra, fn) => withEnv({ SYM_BACKEND: backend, HYDOR_RG: RG || undefined, ...extra }, fn);

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
function putFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
}
// one tree for every backend: tracked + untracked files, a hidden folder, skipped folders, CRLF, non-ASCII names and paths
function mkProject() {
  const dir = mkTmp('sym-backends-');
  putFiles(dir, {
    'src/a.ts': 'export function target(x: number) {\n  return x + 1;\n}\nexport const useTarget = target(2);\n',
    'src/b.rs': 'pub fn target() {}\n',
    'src/modq.py': 'def func():\n    return 1\n',
    'lib/pkg/__init__.py': 'def func():\n    return 2\n',
    'lib/other.py': 'def func():\n    return 3\n',
    'src/crlf.js': 'function target() {\r\n  return 1;\r\n}\r\n',
    'src/café/naïve.ts': 'export function größe() {\n  return 1;\n}\nexport const 識別子 = größe();\n',
    'src/store.ts': 'export const $store = { n: 1 };\n',
    '.hidden/h.ts': 'export function target() {}\n',
    'node_modules/x/e.ts': 'export function target() {}\n',
    'dist/f.ts': 'export function target() {}\n',
    'src/lib.min.js': 'function target(){}\n',
    'README.md': 'target is documented here\n',
  });
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', env: GIT_ENV });
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  putFiles(dir, { 'src/untracked.ts': 'export const fresh = target(3);\n' });
  return dir;
}
const flatten = (m) => [...m].sort(([a], [b]) => (a < b ? -1 : 1)).flatMap(([f, ls]) => ls.map((l) => `${f}:${l.n}:${l.text}`));

const LOOKUPS = [
  ['plain name', ['target'], {}],
  ['non-ASCII identifier', ['größe'], {}],
  ['CJK identifier', ['識別子'], {}],
  ['dollar name', ['$store'], {}],
  ['python module.func, stem not in the text', ['modq', 'func'], {}],
  ['python package.func through __init__.py', ['pkg', 'func'], {}],
  ['restricted to a folder', ['func'], { inPaths: ['lib'] }],
  ['restricted to files', ['target'], { inPaths: ['src/a.ts', 'src/b.rs'] }],
  ['restricted to a folder with a non-ASCII name', ['größe'], { inPaths: ['src/café'] }],
  ['restricted to a language', ['target'], { langSet: langFilter('ts') }],
  ['two words, only one in a file', ['target', 'useTarget'], {}],
];

test('backends: git grep and grep -r give the same candidates for the same lookups', async () => {
  const dir = mkProject();
  const refs = {};
  for (const [name, words, o] of LOOKUPS) refs[name] = flatten(await viaBackend('git', {}, () => grepWord(words, { cwd: dir, ...o })));
  assert.ok(refs['plain name'].length >= 6, refs['plain name'].join('\n'));
  for (const b of BACKEND_LIST.filter((x) => x !== 'git' && x !== 'rg')) {
    for (const [name, words, o] of LOOKUPS) {
      assert.deepEqual(flatten(await viaBackend(b, {}, () => grepWord(words, { cwd: dir, ...o }))), refs[name], `${b}: ${name}`);
    }
  }
});

test('backends: ripgrep gives the same candidates as git grep for the same lookups', { skip: RG_SKIP }, async () => {
  const dir = mkProject();
  for (const [name, words, o] of LOOKUPS) {
    const git = flatten(await viaBackend('git', {}, () => grepWord(words, { cwd: dir, ...o })));
    const rg = flatten(await viaBackend('rg', {}, () => grepWord(words, { cwd: dir, ...o })));
    assert.deepEqual(rg, git, `rg vs git: ${name}`);
  }
});

test('backends: what each one finds (hidden, untracked, CRLF, non-ASCII path; node_modules, dist, .min.js, other languages are not)', async () => {
  const dir = mkProject();
  for (const b of BACKEND_LIST) {
    const m = await viaBackend(b, {}, () => grepWord(['target'], { cwd: dir }));
    assert.deepEqual([...m.keys()].sort(), ['.hidden/h.ts', 'src/a.ts', 'src/b.rs', 'src/crlf.js', 'src/untracked.ts'], b);
    assert.deepEqual(m.get('src/a.ts').map((l) => l.n), [1, 4], b);
    const w = await viaBackend(b, {}, () => grepWord(['größe'], { cwd: dir }));
    assert.deepEqual([...w.keys()], ['src/café/naïve.ts'], `${b}: non-ASCII path printed as is`);
    assert.deepEqual(w.get('src/café/naïve.ts').map((l) => l.n), [1, 4], b);
  }
});

test('backends: the Python module.func lookup finds a file by its stem although the stem is not in its text (every backend)', async () => {
  const dir = mkProject();
  for (const b of BACKEND_LIST) {
    const m = await viaBackend(b, {}, () => grepWord(['modq', 'func'], { cwd: dir }));
    assert.deepEqual([...m.keys()], ['src/modq.py'], `${b}: only the file named modq`);
    const p = await viaBackend(b, {}, () => grepWord(['pkg', 'func'], { cwd: dir }));
    assert.deepEqual([...p.keys()], ['lib/pkg/__init__.py'], `${b}: __init__.py is named by its folder`);
    const r = await viaBackend(b, {}, () => sym(['modq.func'], dir));
    assert.equal(r.code, 0, `${b}: ${r.out}`);
    assert.match(r.out, /^src\/modq\.py:1-2 {2}function func/, b);
  }
});

test('backends: whole CLI output (definitions and references) is identical through every backend', async () => {
  const dir = mkProject();
  const outs = {};
  for (const b of BACKEND_LIST) {
    outs[b] = await viaBackend(b, {}, async () => {
      const parts = [];
      for (const args of [['target', '--all'], ['--refs', 'target'], ['größe'], ['--refs', 'größe'], ['modq.func'], ['識別子']]) {
        const r = await sym(args, dir);
        parts.push(`$ ${args.join(' ')} -> ${r.code}\n${r.out}${r.err}`);
      }
      return parts.join('\n');
    });
  }
  const ref = outs[BACKEND_LIST[0]];
  assert.match(ref, /function größe/);
  for (const b of BACKEND_LIST) assert.equal(outs[b], ref, `${b} differs from ${BACKEND_LIST[0]}`);
});

test('backends: ripgrep honours .gitignore and .ignore, also outside a git work tree; hidden folders and skipped folders behave as with git', { skip: RG_SKIP }, async () => {
  const dir = mkTmp('sym-rg-ignore-');
  putFiles(dir, {
    '.gitignore': 'ignored/\n',
    '.ignore': 'skipme.ts\n',
    'ignored/x.ts': 'export function lookme() {}\n',
    'skipme.ts': 'export function lookme() {}\n',
    'kept.ts': 'export function lookme() {}\n',
    '.dot/y.ts': 'export function lookme() {}\n',
    'node_modules/z.ts': 'export function lookme() {}\n',
  });
  const m = await viaBackend('rg', {}, () => grepWord(['lookme'], { cwd: dir }));
  assert.deepEqual([...m.keys()].sort(), ['.dot/y.ts', 'kept.ts']);
});

test('backends: HYDOR_RG names the ripgrep to use; a missing file falls back to rg on PATH and then to git grep / grep', async () => {
  assert.equal(rgCommand({ HYDOR_RG: process.execPath }), process.execPath);
  assert.equal(rgCommand({ HYDOR_RG: path.join(os.tmpdir(), 'no-such-rg-binary') }), 'rg');
  assert.equal(rgCommand({}), 'rg');
  assert.equal(rgCommand({ HYDOR_RG: os.tmpdir() }), 'rg', 'a directory is not a program');
  const dir = mkProject();
  // no usable ripgrep anywhere (PATH without it, HYDOR_RG pointing nowhere): the search still works through git grep
  const empty = mkTmp('sym-nopath-');
  const gitDir = path.dirname(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim());
  const m = await withEnv({ SYM_BACKEND: undefined, HYDOR_RG: path.join(empty, 'missing'), PATH: [empty, gitDir].join(path.delimiter) }, () => grepWord(['target'], { cwd: dir }));
  assert.ok(m.has('src/a.ts'));
  // the automatic order starts with the ripgrep named by HYDOR_RG: a stand-in that prints one match proves it was the one run
  const fake = path.join(empty, 'fake-rg');
  fs.writeFileSync(fake, `#!/bin/sh\necho "$@" > "${path.join(empty, 'rg.args')}"\nprintf 'src/a.ts\\000'\nprintf '7:fake target\\n'\nexit 0\n`, { mode: 0o755 });
  const m2 = await withEnv({ SYM_BACKEND: undefined, HYDOR_RG: fake }, () => grepWord(['target'], { cwd: dir }));
  assert.deepEqual([...m2], [['src/a.ts', [{ n: 7, text: 'fake target' }]]]);
  assert.match(fs.readFileSync(path.join(empty, 'rg.args'), 'utf8'), /--fixed-strings .*-e target -- \.\n$/);
});

test('backends: with no search tool at all sym says so (exit 3) instead of reporting nothing found', async () => {
  const dir = mkProject();
  const empty = mkTmp('sym-notools-');
  const r = await withEnv({ SYM_BACKEND: undefined, HYDOR_RG: undefined, PATH: empty }, () => sym(['target'], dir));
  assert.equal(r.code, 3);
  assert.match(r.err, /^sym: no search tool could be run \(install ripgrep, or git, or grep\)\n$/);
  assert.equal(r.out, '');
});

test('backends: a ripgrep that cannot run (exit 2, no output) falls through to git grep', async () => {
  const dir = mkProject();
  const empty = mkTmp('sym-badrg-');
  const bad = path.join(empty, 'rg');
  fs.writeFileSync(bad, '#!/bin/sh\necho "rg: unrecognized flag" >&2\nexit 2\n', { mode: 0o755 });
  const m = await withEnv({ SYM_BACKEND: undefined, HYDOR_RG: bad }, () => grepWord(['target'], { cwd: dir }));
  assert.ok(m.has('src/a.ts') && m.has('src/untracked.ts'));
});

test('rg command line: fixed-string, whole-word, same globs and exclusions, ignore files honoured, hidden included', () => {
  const a = rgArgs(['Foo', 'bar'], ['src']);
  for (const f of ['--fixed-strings', '--word-regexp', '--hidden', '--null', '--line-number', '--no-config']) assert.ok(a.includes(f), f);
  assert.ok(!a.includes('--no-ignore') && !a.includes('-u'), 'ignore files are honoured');
  assert.deepEqual(a.slice(a.indexOf('--')), ['--', 'src']);
  assert.deepEqual(a.filter((x, i) => a[i - 1] === '-e'), ['Foo', 'bar']);
  const types = a.filter((x, i) => a[i - 1] === '--type-add');
  for (const g of ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.py', '*.pyi', '*.rs']) assert.ok(types.includes(`sym:${g}`), g);
  assert.deepEqual(a.filter((x, i) => a[i - 1] === '--type'), ['sym']);
  assert.ok(!a.includes('-g') || a.filter((x, i) => a[i - 1] === '-g').every((g) => g.startsWith('!')), 'no whitelist glob: it would override the ignore files');
  const globs = a.filter((x, i) => a[i - 1] === '-g');
  for (const g of ['!node_modules', '!dist', '!build', '!target', '!.git', '!venv', '!.venv', '!__pycache__', '!site-packages', '!*.min.js']) assert.ok(globs.includes(g), g);
  assert.deepEqual(rgArgs(['x'], null).slice(-2), ['--', '.']);
});

test('output parsers: rg, git grep and grep lines, CRLF text, colons in text, binary-file notices', () => {
  assert.deepEqual(parseRg('./src/a.ts\x0012:  const x = 1; // a:b\nsrc/b.ts\x007:y\r\nsrc/bin.ts\x00binary file matches (found "\\0" byte around offset 3)\n'), [
    { file: 'src/a.ts', n: 12, text: '  const x = 1; // a:b' },
    { file: 'src/b.ts', n: 7, text: 'y\r' },
  ]);
  assert.deepEqual(parseRg('.\\src\\w.ts\x003:z\n'), [{ file: '.\\src\\w.ts', n: 3, text: 'z' }], 'POSIX keeps a backslash as part of the name');
  assert.deepEqual(parseGitGrep('src/a.ts\x0012\x00  x: 1\n\nsrc/café/naïve.ts\x001\x00größe\n'), [
    { file: 'src/a.ts', n: 12, text: '  x: 1' }, { file: 'src/café/naïve.ts', n: 1, text: 'größe' }]);
  assert.deepEqual(parseGrep('./src/a.ts:12:  x: 1\nsrc/b.ts:3:a:4:b\nsrc/c.js:1:function f() {\r\ngarbage\n'), [
    { file: 'src/a.ts', n: 12, text: '  x: 1' }, { file: 'src/b.ts', n: 3, text: 'a:4:b' }, { file: 'src/c.js', n: 1, text: 'function f() {\r' }],
  'a CRLF line is a candidate too');
  const L = (file, text) => ({ file, n: 1, text });
  assert.deepEqual(keepFilesWithAllWords([L('a', 'Foo bar'), L('b', 'Foo only'), L('b', 'again Foo'), L('c', 'bar'), L('c', 'Foo')], ['Foo', 'bar']).map((l) => l.file), ['a', 'c', 'c']);
  assert.deepEqual(keepFilesWithAllWords([L('a', 'Foo')], ['Foo']).length, 1);
  assert.equal(keepFilesWithAllWords([L('a', 'FooBar bar')], ['Foo', 'bar']).length, 0, 'whole words only');
});

// ------------------------------------------------------------------ locale and encodings

test('locale: Linux keeps C.UTF-8, other systems get the C locale that every system has', () => {
  assert.equal(searchLocale('linux'), 'C.UTF-8');
  assert.equal(searchLocale('darwin'), 'C');
  assert.equal(searchLocale('win32'), 'C');
});

test('locale: non-ASCII identifiers and paths work through every backend with the macOS and Windows locale rules', async () => {
  const dir = mkProject();
  for (const plat of ['darwin', 'win32']) {
    for (const b of BACKEND_LIST) {
      // LANG=C and no LC_ALL: what a GUI-launched app on macOS has
      const r = await viaBackend(b, { SYM_FAKE_PLATFORM: plat, LANG: 'C', LC_ALL: undefined, LC_CTYPE: undefined }, () => sym(['größe', '識別子'], dir));
      assert.equal(r.code, 0, `${plat}/${b}: ${r.out}${r.err}`);
      assert.match(r.out, /^src\/café\/naïve\.ts:1-3 {2}function größe/m, `${plat}/${b}`);
      assert.match(r.out, /^src\/café\/naïve\.ts:4-4 {2}const 識別子/m, `${plat}/${b}`);
      assert.match(r.out, /return 1;/);
    }
  }
});

test('locale: a file with invalid UTF-8 (Latin-1 comment) is still searched byte-safely (macOS and Windows rules)', async () => {
  const dir = mkProject();
  fs.writeFileSync(path.join(dir, 'src', 'latin1.ts'), Buffer.concat([Buffer.from('// caf'), Buffer.from([0xe9]), Buffer.from('\nexport function legacyOne() {}\n')]));
  for (const b of BACKEND_LIST) {
    const m = await viaBackend(b, { SYM_FAKE_PLATFORM: 'darwin', LC_ALL: undefined }, () => grepWord(['legacyOne'], { cwd: dir }));
    assert.deepEqual([...m.keys()], ['src/latin1.ts'], b);
    assert.equal(m.get('src/latin1.ts')[0].n, 2, b);
  }
});

// ------------------------------------------------------------------ paths: forward slashes, drive letters, backslashes

test('paths (Windows flavour): printed paths use forward slashes, drive letters and backslashes work', () => {
  const w = path.win32;
  assert.equal(posixPath('src\\a\\b.ts', w), 'src/a/b.ts');
  assert.equal(posixPath('src\\a\\b.ts', path.posix), 'src\\a\\b.ts', 'a POSIX file name may contain a backslash');
  assert.equal(relPosix('C:\\proj', 'C:\\proj\\src\\a.ts', w), 'src/a.ts');
  assert.equal(relPosix('C:\\proj', 'src\\a.ts', w), 'src/a.ts');
  assert.equal(relPosix('C:\\proj', 'src/a.ts', w), 'src/a.ts');
  assert.equal(relPosix('c:\\Proj', 'C:\\proj\\src\\a.ts', w), 'src/a.ts', 'drive letter and case are not significant');
  assert.equal(relPosix('C:\\proj\\sub', 'C:\\proj\\lib\\x.ts', w), '../lib/x.ts');
  assert.equal(relPosix('C:\\proj', 'D:\\other\\x.ts', w), 'D:/other/x.ts', 'another drive stays absolute');
  assert.equal(relPosix('C:\\proj', 'C:\\proj', w), '');
  assert.equal(relOrDot('C:\\proj', 'C:\\proj\\', w), '.');
  assert.equal(relOrDot('C:\\proj', 'src', w), 'src');
  assert.equal(relOrDot('/work/p', '/work/p/src/a.ts', path.posix), 'src/a.ts');
  assert.equal(cleanFound('.\\src\\a.ts', w), 'src/a.ts');
  assert.equal(cleanFound('./src/a.ts', w), 'src/a.ts');
  assert.equal(cleanFound('./src/a.ts', path.posix), 'src/a.ts');
  assert.deepEqual(relSegments('C:\\proj\\sub', 'C:\\proj\\lib\\x.ts', w), ['..', 'lib', 'x.ts']);
  assert.deepEqual(relSegments('/p/sub', '../lib/x.ts', path.posix), ['..', 'lib', 'x.ts']);
});

test('paths: isWithin on both flavours (siblings with a common prefix and ..names are not inside)', () => {
  const w = path.win32;
  assert.equal(isWithin('C:\\proj\\src\\a.ts', 'C:\\proj\\src', w), true);
  assert.equal(isWithin('C:\\proj\\src', 'C:\\proj\\src', w), true);
  assert.equal(isWithin('c:\\PROJ\\SRC\\a.ts', 'C:\\proj\\src', w), true);
  assert.equal(isWithin('C:\\proj\\srcx\\a.ts', 'C:\\proj\\src', w), false);
  assert.equal(isWithin('D:\\proj\\src\\a.ts', 'C:\\proj\\src', w), false);
  assert.equal(isWithin('C:\\proj\\..foo\\a.ts', 'C:\\proj\\..foo', w), true);
  assert.equal(isWithin('C:\\proj\\a.ts', 'C:\\proj\\src', w), false);
  assert.equal(isWithin('/p/src/a.ts', '/p/src', path.posix), true);
  assert.equal(isWithin('/p/srcx/a.ts', '/p/src', path.posix), false);
  assert.equal(isWithin('/p/other', '/p/src', path.posix), false);
});

test('paths: Python module names from files, with POSIX and Windows paths', () => {
  const w = path.win32;
  assert.equal(moduleStem('src/forms.py'), 'forms');
  assert.equal(moduleStem('src\\forms.pyi', w), 'forms');
  assert.equal(moduleStem('lib/pkg/__init__.py'), 'pkg');
  assert.equal(moduleStem('C:\\proj\\lib\\pkg\\__init__.py', w), 'pkg');
  assert.equal(moduleStem('src/a.ts'), null);
  assert.equal(pyStemMatches('C:\\proj\\forms.py', 'forms', w), true);
  assert.equal(pyStemMatches('C:\\proj\\forms.py', 'other', w), false);
  assert.equal(pyStemMatches('src/forms.rs', 'forms'), false);
});

test('paths: classification of Windows-style paths', () => {
  assert.equal(isTestPath('src\\__tests__\\a.ts'), true);
  assert.equal(isTestPath('C:\\proj\\src\\latest.ts'), false);
  assert.equal(skipPath('node_modules/x/a.js'), true);
});
