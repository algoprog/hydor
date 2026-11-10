// Hidden checker for utils4. Run: node check.mjs <workdir>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const load = (rel) => import(pathToFileURL(path.join(dir, rel)).href);
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

// ---------- slug ----------
test('slug: lowercases and joins words', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('ABC def'), 'abc-def');
});
test('slug: removes diacritics', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('Crème Brûlée'), 'creme-brulee');
  assert.equal(slugify('ÀÉÎõü'), 'aeiou');
  assert.equal(slugify('Ünïcödé'), 'unicode');
});
test('slug: NFKD compatibility characters', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('ﬁne'), 'fine');
});
test('slug: runs of other characters become one separator', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('a   b---c___d'), 'a-b-c-d');
  assert.equal(slugify('v1.2.3'), 'v1-2-3');
  assert.equal(slugify('C++ & C#'), 'c-c');
});
test('slug: no separator at either end', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('  --Already--Slug--  '), 'already-slug');
  assert.equal(slugify('!!!x!!!'), 'x');
});
test('slug: empty and symbols-only input', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!! ???'), '');
  assert.equal(slugify('日本語'), '');
});
test('slug: non-ASCII letters without decomposition split words', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('straße'), 'stra-e');
  assert.equal(slugify('a日b'), 'a-b');
});
test('slug: custom separator', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('a b c', { separator: '_' }), 'a_b_c');
  assert.equal(slugify('x_y z', { separator: '.' }), 'x.y.z');
  assert.equal(slugify(' a b ', { separator: '+' }), 'a+b');
});
test('slug: maxLength cuts', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('Hello World', { maxLength: 7 }), 'hello-w');
  assert.equal(slugify('abcdefghij', { maxLength: 4 }), 'abcd');
});
test('slug: maxLength leaves no trailing separator', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('Hello World', { maxLength: 6 }), 'hello');
  assert.equal(slugify('a-b-c', { maxLength: 2 }), 'a');
  assert.equal(slugify('a-b-c', { maxLength: 3 }), 'a-b');
  assert.equal(slugify('a b c', { maxLength: 2, separator: '_' }), 'a');
});
test('slug: default maxLength is 60', async () => {
  const { slugify } = await load('src/slug.mjs');
  assert.equal(slugify('a'.repeat(100)), 'a'.repeat(60));
  assert.equal(slugify('abcdefghi '.repeat(10)).length, 59); // cut at 60 leaves a trailing '-', which goes
});
test('slug: TypeError for non-strings', async () => {
  const { slugify } = await load('src/slug.mjs');
  for (const bad of [42, null, undefined, {}, ['a']]) assert.throws(() => slugify(bad), TypeError);
});

// ---------- duration ----------
test('duration: parse single units', async () => {
  const { parseDuration: p } = await load('src/duration.mjs');
  assert.equal(p('90s'), 90000);
  assert.equal(p('250ms'), 250);
  assert.equal(p('1w'), 604800000);
  assert.equal(p('2d'), 172800000);
  assert.equal(p('3m'), 180000);
  assert.equal(p('2h'), 7200000);
});
test('duration: parse several terms', async () => {
  const { parseDuration: p } = await load('src/duration.mjs');
  assert.equal(p('1h 30m'), 5400000);
  assert.equal(p('2d4h'), 187200000);
  assert.equal(p('1h30m15s'), 5415000);
  assert.equal(p('1h 1h'), 7200000);
  assert.equal(p('30m 1h'), 5400000);
});
test('duration: decimals', async () => {
  const { parseDuration: p } = await load('src/duration.mjs');
  assert.equal(p('1.5h'), 5400000);
  assert.equal(p('0.5s'), 500);
  assert.equal(p('2.5m'), 150000);
});
test('duration: spaces and letter case', async () => {
  const { parseDuration: p } = await load('src/duration.mjs');
  assert.equal(p(' 2 H 5 M '), 7500000);
  assert.equal(p('1M'), 60000);
  assert.equal(p('1MS'), 1);
  assert.equal(p('90 S'), 90000);
});
test('duration: bare number is milliseconds', async () => {
  const { parseDuration: p } = await load('src/duration.mjs');
  assert.equal(p('1500'), 1500);
  assert.equal(p('  42 '), 42);
  assert.equal(p('0'), 0);
  assert.equal(p('1500.5'), 1501);
});
test('duration: result is rounded', async () => {
  const { parseDuration: p } = await load('src/duration.mjs');
  assert.equal(p('0.0004s'), 0);
  assert.equal(p('1.0006s'), 1001);
});
test('duration: parse errors', async () => {
  const { parseDuration: p } = await load('src/duration.mjs');
  for (const bad of ['', '   ', 'abc', '1x', 'h', '-5s', '-1', '5min', '1h m', '1h 30', '1 5h', '1.h', '.5h', '1h,30m', '1e3', '1mss'])
    assert.throws(() => p(bad), RangeError, JSON.stringify(bad));
});
test('duration: parse needs a string', async () => {
  const { parseDuration: p } = await load('src/duration.mjs');
  for (const bad of [5, null, undefined, {}]) assert.throws(() => p(bad), RangeError);
});
test('duration: format largest unit first', async () => {
  const { formatDuration: f } = await load('src/duration.mjs');
  assert.equal(f(5400000), '1h 30m');
  assert.equal(f(1500), '1s 500ms');
  assert.equal(f(172800000), '2d');
  assert.equal(f(90061001), '1d 1h 1m 1s 1ms');
  assert.equal(f(7 * 86400000), '7d');
  assert.equal(f(3600000 + 1), '1h 1ms');
});
test('duration: format zero and small values', async () => {
  const { formatDuration: f } = await load('src/duration.mjs');
  assert.equal(f(0), '0ms');
  assert.equal(f(1), '1ms');
  assert.equal(f(999), '999ms');
  assert.equal(f(60000), '1m');
});
test('duration: format rounds first', async () => {
  const { formatDuration: f } = await load('src/duration.mjs');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(1500.5), '1s 501ms');
  assert.equal(f(999.6), '1s');
});
test('duration: format errors', async () => {
  const { formatDuration: f } = await load('src/duration.mjs');
  for (const bad of [-1, -0.4, NaN, Infinity, -Infinity, '5', null, undefined]) assert.throws(() => f(bad), RangeError, String(bad));
});

// ---------- lru ----------
const clock = () => {
  const c = { t: 1000, now: () => c.t };
  return c;
};
test('lru: capacity must be a positive integer', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  for (const capacity of [0, -1, 1.5, '3', NaN, undefined, Infinity]) assert.throws(() => new LRUCache({ capacity }), RangeError, String(capacity));
  assert.throws(() => new LRUCache(), RangeError);
  new LRUCache({ capacity: 1 });
});
test('lru: set returns the cache and get reads values', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const c = new LRUCache({ capacity: 3 });
  assert.equal(c.set('a', 1), c);
  c.set('b', 2).set('c', 3);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('zzz'), undefined);
  assert.equal(c.size, 3);
});
test('lru: evicts the least recently used on insert', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const c = new LRUCache({ capacity: 2 });
  c.set('a', 1).set('b', 2).set('c', 3);
  assert.deepEqual(c.keys(), ['b', 'c']);
  assert.equal(c.has('a'), false);
});
test('lru: get makes an entry most recently used', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const c = new LRUCache({ capacity: 2 });
  c.set('a', 1).set('b', 2);
  c.get('a');
  c.set('c', 3);
  assert.deepEqual(c.keys(), ['a', 'c']);
});
test('lru: has does not change recency', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const c = new LRUCache({ capacity: 2 });
  c.set('a', 1).set('b', 2);
  assert.equal(c.has('a'), true);
  c.set('c', 3);
  assert.deepEqual(c.keys(), ['b', 'c']);
});
test('lru: setting an existing key replaces value and renews recency', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const c = new LRUCache({ capacity: 2 });
  c.set('a', 1).set('b', 2).set('a', 10);
  assert.deepEqual(c.keys(), ['b', 'a']);
  assert.equal(c.size, 2);
  assert.equal(c.get('a'), 10);
  c.set('c', 3);
  assert.deepEqual(c.keys(), ['a', 'c']);
});
test('lru: delete', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const c = new LRUCache({ capacity: 3 });
  c.set('a', 1).set('b', 2);
  assert.equal(c.delete('a'), true);
  assert.equal(c.delete('a'), false);
  assert.equal(c.delete('nope'), false);
  assert.deepEqual(c.keys(), ['b']);
  assert.equal(c.size, 1);
});
test('lru: keys are compared like a Map', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const c = new LRUCache({ capacity: 5 });
  c.set(1, 'number').set('1', 'string').set(NaN, 'nan');
  assert.equal(c.get(1), 'number');
  assert.equal(c.get('1'), 'string');
  assert.equal(c.get(NaN), 'nan');
  assert.equal(c.size, 3);
});
test('lru: entries expire at t + ttlMs', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const k = clock();
  const c = new LRUCache({ capacity: 3, ttlMs: 100, now: k.now });
  c.set('a', 1);
  k.t += 99;
  assert.equal(c.has('a'), true);
  assert.equal(c.get('a'), 1);
  k.t += 1;
  assert.equal(c.has('a'), false);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.size, 0);
  assert.deepEqual(c.keys(), []);
});
test('lru: get does not extend life, set does', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const k = clock();
  const c = new LRUCache({ capacity: 3, ttlMs: 100, now: k.now });
  c.set('a', 1).set('b', 2);
  k.t += 60;
  c.get('a');
  c.set('b', 22);
  k.t += 50; // a: 110 old, b: 50 old
  assert.equal(c.has('a'), false);
  assert.equal(c.get('b'), 22);
});
test('lru: size, keys and delete ignore expired entries', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const k = clock();
  const c = new LRUCache({ capacity: 5, ttlMs: 100, now: k.now });
  c.set('a', 1);
  k.t += 50;
  c.set('b', 2).set('c', 3);
  k.t += 50; // a expired, b and c 50 old
  assert.equal(c.size, 2);
  assert.deepEqual(c.keys(), ['b', 'c']);
  assert.equal(c.delete('a'), false);
  assert.equal(c.delete('b'), true);
});
test('lru: expired entries do not take part in eviction', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const k = clock();
  const c = new LRUCache({ capacity: 2, ttlMs: 100, now: k.now });
  c.set('a', 1);
  k.t += 50;
  c.set('b', 2);
  k.t += 60; // a expired, b alive
  c.set('c', 3); // a is purged first, so b must survive
  assert.deepEqual(c.keys(), ['b', 'c']);
});
test('lru: no ttl means no expiry', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const k = clock();
  const c = new LRUCache({ capacity: 2, now: k.now });
  c.set('a', 1);
  k.t += 1e12;
  assert.equal(c.get('a'), 1);
});
test('lru: default clock is Date.now', async () => {
  const { LRUCache } = await load('src/lru.mjs');
  const c = new LRUCache({ capacity: 2, ttlMs: 1e6 });
  c.set('a', 1);
  assert.equal(c.get('a'), 1);
});

// ---------- csv ----------
test('csv: simple rows', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});
test('csv: empty text is no rows', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv(''), []);
});
test('csv: a final line break adds no row', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('a,b\n'), [['a', 'b']]);
  assert.deepEqual(parseCsv('a\n\n'), [['a'], ['']]);
  assert.deepEqual(parseCsv('\n'), [['']]);
});
test('csv: empty lines and empty fields', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('a\n\nb'), [['a'], [''], ['b']]);
  assert.deepEqual(parseCsv('a,,b'), [['a', '', 'b']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(','), [['', '']]);
  assert.deepEqual(parseCsv(',\n,'), [['', ''], ['', '']]);
});
test('csv: rows keep their own length', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('a,b,c\n1\n1,2'), [['a', 'b', 'c'], ['1'], ['1', '2']]);
});
test('csv: quoted fields with delimiters and quotes', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('"a,b",c'), [['a,b', 'c']]);
  assert.deepEqual(parseCsv('"say ""hi""",x'), [['say "hi"', 'x']]);
  assert.deepEqual(parseCsv('""'), [['']]);
  assert.deepEqual(parseCsv('"",""'), [['', '']]);
  assert.deepEqual(parseCsv('"""",a'), [['"', 'a']]);
});
test('csv: line breaks inside quotes are kept', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('"a\nb",c\nd,e'), [['a\nb', 'c'], ['d', 'e']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv('x,"line1\r\nline2"\r\ny,z\r\n'), [['x', 'line1\r\nline2'], ['y', 'z']]);
});
test('csv: quoted field at the end of a line', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('a,"b"\r\nc,"d"'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCsv('"a"\n"b"\n'), [['a'], ['b']]);
});
test('csv: quote inside an unquoted field is ordinary', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('a"b,c'), [['a"b', 'c']]);
  assert.deepEqual(parseCsv('5" pipe'), [['5" pipe']]);
});
test('csv: lone CR is ordinary in an unquoted field', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('a\rb,c'), [['a\rb', 'c']]);
});
test('csv: custom delimiter', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  assert.deepEqual(parseCsv('a;b\n"c;d";e', { delimiter: ';' }), [['a', 'b'], ['c;d', 'e']]);
  assert.deepEqual(parseCsv('a,b\tc', { delimiter: '\t' }), [['a,b', 'c']]);
});
test('csv: SyntaxError for an open quote', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  for (const bad of ['"abc', 'a,"b', '"a""', '"', 'x\n"y\nz']) assert.throws(() => parseCsv(bad), SyntaxError, JSON.stringify(bad));
});
test('csv: SyntaxError for text after a closing quote', async () => {
  const { parseCsv } = await load('src/csv.mjs');
  for (const bad of ['"a"b', '"a" ,b', 'x,"a"b\n']) assert.throws(() => parseCsv(bad), SyntaxError, JSON.stringify(bad));
});
test('csv: toCsv joins rows with CRLF and no final break', async () => {
  const { toCsv } = await load('src/csv.mjs');
  assert.equal(toCsv([['a', 'b'], ['1', '2']]), 'a,b\r\n1,2');
  assert.equal(toCsv([]), '');
  assert.equal(toCsv([['only']]), 'only');
});
test('csv: toCsv quotes when needed', async () => {
  const { toCsv } = await load('src/csv.mjs');
  assert.equal(toCsv([['x,y', 'say "hi"', 'line\nbreak', 'cr\rhere']]), '"x,y","say ""hi""","line\nbreak","cr\rhere"');
  assert.equal(toCsv([['"']]), '""""');
});
test('csv: toCsv leaves plain fields alone', async () => {
  const { toCsv } = await load('src/csv.mjs');
  assert.equal(toCsv([[' padded ', 'a b', '']]), ' padded ,a b,');
  assert.equal(toCsv([[''], ['x']]), '\r\nx');
});
test('csv: toCsv converts values', async () => {
  const { toCsv } = await load('src/csv.mjs');
  assert.equal(toCsv([[1, null, undefined, true, 1.5, 0, false]]), '1,,,true,1.5,0,false');
});
test('csv: toCsv custom delimiter', async () => {
  const { toCsv } = await load('src/csv.mjs');
  assert.equal(toCsv([['a;b', 'c,d']], { delimiter: ';' }), '"a;b";c,d');
  assert.equal(toCsv([['a,b', 'c']], { delimiter: '\t' }), 'a,b\tc');
});
test('csv: round trip', async () => {
  const { parseCsv, toCsv } = await load('src/csv.mjs');
  const rows = [['id', 'note'], ['1', 'a,b'], ['2', 'say "x"'], ['3', 'two\nlines'], ['4', ''], ['5', 'z']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});


// Several small cases are reported as one, so each module has about a dozen.
const merge = (name, names) => {
  const parts = names.map((n) => {
    const i = cases.findIndex(([c]) => c === n);
    if (i < 0) throw new Error(`checker bug: no case ${n}`);
    return cases.splice(i, 1)[0][1];
  });
  cases.push([name, async () => { for (const f of parts) await f(); }]);
};
merge('slug: words, diacritics and compatibility characters', ['slug: lowercases and joins words', 'slug: removes diacritics', 'slug: NFKD compatibility characters']);
merge('slug: empty, symbols-only and non-ASCII input', ['slug: empty and symbols-only input', 'slug: non-ASCII letters without decomposition split words']);
merge('duration: parse bare numbers, decimals and rounding', ['duration: decimals', 'duration: bare number is milliseconds', 'duration: result is rounded']);
merge('duration: parse needs a string, errors', ['duration: parse errors', 'duration: parse needs a string']);
merge('duration: format zero, small values and rounding', ['duration: format zero and small values', 'duration: format rounds first']);
merge('lru: construction and basic set/get', ['lru: capacity must be a positive integer', 'lru: set returns the cache and get reads values']);
merge('lru: recency order', ['lru: evicts the least recently used on insert', 'lru: get makes an entry most recently used', 'lru: has does not change recency']);
merge('lru: replacing and deleting', ['lru: setting an existing key replaces value and renews recency', 'lru: delete']);
merge('lru: no ttl, default clock', ['lru: no ttl means no expiry', 'lru: default clock is Date.now']);
merge('csv: simple rows and line breaks at the end', ['csv: simple rows', 'csv: empty text is no rows', 'csv: a final line break adds no row']);
merge('csv: empty lines, empty fields, ragged rows', ['csv: empty lines and empty fields', 'csv: rows keep their own length']);
merge('csv: quoted fields', ['csv: quoted fields with delimiters and quotes', 'csv: quoted field at the end of a line']);
merge('csv: ordinary quotes and CR', ['csv: quote inside an unquoted field is ordinary', 'csv: lone CR is ordinary in an unquoted field']);
merge('csv: SyntaxErrors', ['csv: SyntaxError for an open quote', 'csv: SyntaxError for text after a closing quote']);
merge('csv: toCsv rows and plain fields', ['csv: toCsv joins rows with CRLF and no final break', 'csv: toCsv leaves plain fields alone']);
merge('csv: toCsv values and delimiter', ['csv: toCsv converts values', 'csv: toCsv custom delimiter']);

// ---------- run ----------
const failed = [];
for (const [name, fn] of cases) {
  try {
    await fn();
  } catch (e) {
    failed.push(name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${name}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
