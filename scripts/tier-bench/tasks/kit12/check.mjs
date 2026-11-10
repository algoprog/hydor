// Hidden checker for kit12. Run: node check.mjs <workdir>
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

// ---------- semver ----------
test('semver: parse a valid version', async () => {
  const { parse } = await load('src/semver.mjs');
  assert.deepEqual(parse('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] });
  assert.deepEqual(parse('v1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] });
  assert.deepEqual(parse('0.0.0'), { major: 0, minor: 0, patch: 0, prerelease: [] });
  assert.deepEqual(parse('10.20.30'), { major: 10, minor: 20, patch: 30, prerelease: [] });
  assert.deepEqual(parse('v1.2.3-beta.1'), { major: 1, minor: 2, patch: 3, prerelease: ['beta', '1'] });
  assert.deepEqual(parse('1.0.0-rc'), { major: 1, minor: 0, patch: 0, prerelease: ['rc'] });
  assert.deepEqual(parse('1.0.0-x-y.0.0a.Z'), { major: 1, minor: 0, patch: 0, prerelease: ['x-y', '0', '0a', 'Z'] });
});
test('semver: parse rejects what is not a version', async () => {
  const { parse } = await load('src/semver.mjs');
  const bad = ['', '1', '1.2', '1.2.3.4', '01.2.3', '1.02.3', '1.2.03', '1.2.3+build', '1.2.3-beta+b', ' 1.2.3', '1.2.3 ', '1.2.3-', '1.2.3-a..b', '1.2.3-.a', '1.0.0-01', '1.0.0-a.00', 'V1.2.3', 'vv1.2.3', '1.2.x', 'a.b.c', '-1.2.3', '1.2.3_4', '1.2.3-a_b', 'v', 'v1.2'];
  for (const text of bad) assert.throws(() => parse(text), RangeError, JSON.stringify(text));
  for (const text of [123, null, undefined, {}, ['1.2.3']]) assert.throws(() => parse(text), RangeError);
});
test('semver: compare major, minor and patch as numbers', async () => {
  const { compare } = await load('src/semver.mjs');
  assert.equal(compare('1.2.3', '1.2.4'), -1);
  assert.equal(compare('1.2.4', '1.2.3'), 1);
  assert.equal(compare('1.10.0', '1.9.0'), 1);
  assert.equal(compare('2.0.0', '10.0.0'), -1);
  assert.equal(compare('1.2.3', '1.2.3'), 0);
  assert.equal(compare('v2.0.0', '2.0.0'), 0);
  assert.equal(compare('0.0.1', '0.1.0'), -1);
  assert.equal(compare('1.0.0', '0.99.99'), 1);
});
test('semver: compare prereleases', async () => {
  const { compare } = await load('src/semver.mjs');
  assert.equal(compare('1.0.0-alpha', '1.0.0'), -1);
  assert.equal(compare('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compare('1.0.0-alpha.2', '1.0.0-alpha.10'), -1);
  assert.equal(compare('1.0.0-beta.11', '1.0.0-beta.2'), 1);
  assert.equal(compare('1.0.0-1', '1.0.0-a'), -1);
  assert.equal(compare('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compare('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compare('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compare('1.0.0-B', '1.0.0-a'), -1);
  assert.equal(compare('1.0.0-alpha', '1.0.0-alpha'), 0);
  assert.equal(compare('1.0.0-alpha.1', '1.0.0-alpha'), 1);
  assert.equal(compare('1.0.1-alpha', '1.0.0'), 1);
  const chain = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let i = 0; i < chain.length; i++) {
    for (let j = 0; j < chain.length; j++) assert.equal(compare(chain[i], chain[j]), Math.sign(i - j), `${chain[i]} vs ${chain[j]}`);
  }
  assert.throws(() => compare('1.2', '1.2.3'), RangeError);
  assert.throws(() => compare('1.2.3', 'x'), RangeError);
});
test('semver: satisfies exact, >= and <', async () => {
  const { satisfies } = await load('src/semver.mjs');
  assert.equal(satisfies('1.2.3', '1.2.3'), true);
  assert.equal(satisfies('1.2.4', '1.2.3'), false);
  assert.equal(satisfies('v1.2.3', 'v1.2.3'), true);
  assert.equal(satisfies('1.2.3', '>=1.2.3'), true);
  assert.equal(satisfies('1.2.2', '>=1.2.3'), false);
  assert.equal(satisfies('3.0.0', '>=1.2.3'), true);
  assert.equal(satisfies('1.9.9', '<2.0.0'), true);
  assert.equal(satisfies('2.0.0', '<2.0.0'), false);
  assert.equal(satisfies('1.5.0', '>=1.0.0 <2.0.0'), true);
  assert.equal(satisfies('1.5.0', '  >=1.0.0    <2.0.0  '), true);
  assert.equal(satisfies('2.0.0', '>=1.0.0 <2.0.0'), false);
  assert.equal(satisfies('0.9.0', '>=1.0.0 <2.0.0'), false);
  assert.equal(satisfies('1.5.0', '>=1.0.0 <2.0.0 <1.4.0'), false);
});
test('semver: satisfies caret and tilde', async () => {
  const { satisfies } = await load('src/semver.mjs');
  for (const [v, r, expected] of [
    ['1.2.3', '^1.2.3', true], ['1.9.9', '^1.2.3', true], ['1.2.2', '^1.2.3', false], ['2.0.0', '^1.2.3', false], ['1.99.99', '^1.0.0', true],
    ['0.2.3', '^0.2.3', true], ['0.2.9', '^0.2.3', true], ['0.3.0', '^0.2.3', false], ['0.2.2', '^0.2.3', false], ['1.0.0', '^0.2.3', false],
    ['0.0.3', '^0.0.3', true], ['0.0.4', '^0.0.3', false], ['0.0.2', '^0.0.3', false], ['0.1.0', '^0.0.3', false],
    ['0.0.0', '^0.0.0', true], ['0.0.1', '^0.0.0', false],
    ['1.2.3', '~1.2.3', true], ['1.2.99', '~1.2.3', true], ['1.3.0', '~1.2.3', false], ['1.2.2', '~1.2.3', false], ['2.0.0', '~1.2.3', false],
    ['0.2.9', '~0.2.3', true], ['0.3.0', '~0.2.3', false], ['1.2.5', '^1.2.3 <1.2.5', false], ['1.2.4', '^1.2.3 <1.2.5', true], ['1.4.0', '~1.2.3 ^1.0.0', false],
  ]) assert.equal(satisfies(v, r), expected, `${v} ${r}`);
});
test('semver: satisfies and prereleases', async () => {
  const { satisfies } = await load('src/semver.mjs');
  for (const [v, r, expected] of [
    ['1.2.4-beta', '^1.2.3', false], ['1.2.3-beta', '1.2.3', false], ['1.2.3-beta', '1.2.3-beta', true], ['2.0.0-rc.1', '<2.0.0', false],
    ['1.2.3-beta.1', '^1.2.3-beta.1', true], ['1.2.3-beta.2', '^1.2.3-beta.1', true], ['1.2.3-alpha', '^1.2.3-beta.1', false],
    ['1.2.4-beta.1', '^1.2.3-beta.1', false], ['1.2.3', '^1.2.3-beta.1', true], ['1.2.4', '^1.2.3-beta.1', true],
    ['1.2.3-beta.2', '>=1.2.3-beta.1 <2.0.0', true], ['1.3.0-beta', '>=1.2.3-beta.1 <2.0.0', false], ['1.2.3-beta.2', '>=1.2.3-beta.1', true],
    ['1.2.3-beta.2', '>=1.0.0 <1.2.3-beta.9', true], ['1.2.3-beta.9', '>=1.0.0 <1.2.3-beta.9', false], ['1.2.3-beta.2', '>=1.0.0', false],
    ['1.2.3-beta.2', '~1.2.0', false], ['1.2.3-beta.2', '~1.2.3-alpha', true],
  ]) assert.equal(satisfies(v, r), expected, `${v} ${r}`);
});
test('semver: satisfies errors', async () => {
  const { satisfies } = await load('src/semver.mjs');
  for (const range of ['', '   ', '>1.2.3', '<=1.2.3', '=1.2.3', '1.x', '*', 'x', '>= 1.2.3', '^ 1.2.3', '^', '~', '1.2', '~1.2.3.4', 'abc', 'latest', '>=1.2.3 ??', '^1.2.3 || ^2.0.0', '>=01.2.3', '^1.2.3+b'])
    assert.throws(() => satisfies('1.5.0', range), RangeError, JSON.stringify(range));
  for (const range of [undefined, null, 5, ['^1.0.0']]) assert.throws(() => satisfies('1.5.0', range), RangeError);
  for (const version of ['1.2', '', 'x', ' 1.2.3', 5, undefined]) assert.throws(() => satisfies(version, '^1.0.0'), RangeError);
});

// ---------- roman ----------
const ROMAN = [[1, 'I'], [2, 'II'], [3, 'III'], [4, 'IV'], [5, 'V'], [6, 'VI'], [9, 'IX'], [10, 'X'], [14, 'XIV'], [19, 'XIX'], [40, 'XL'], [44, 'XLIV'], [49, 'XLIX'], [50, 'L'], [90, 'XC'], [99, 'XCIX'], [100, 'C'], [400, 'CD'], [500, 'D'], [900, 'CM'], [1000, 'M'], [1994, 'MCMXCIV'], [2024, 'MMXXIV'], [3000, 'MMM'], [3888, 'MMMDCCCLXXXVIII'], [3999, 'MMMCMXCIX']];
test('roman: toRoman writes the canonical form', async () => {
  const { toRoman } = await load('src/roman.mjs');
  for (const [n, text] of ROMAN) assert.equal(toRoman(n), text, String(n));
});
test('roman: toRoman range errors', async () => {
  const { toRoman } = await load('src/roman.mjs');
  for (const bad of [0, -1, 4000, 10000, 2.5, NaN, Infinity, -Infinity, '5', null, undefined, [5], {}]) assert.throws(() => toRoman(bad), RangeError, String(bad));
});
test('roman: fromRoman reads the canonical form', async () => {
  const { fromRoman } = await load('src/roman.mjs');
  for (const [n, text] of ROMAN) assert.equal(fromRoman(text), n, text);
});
test('roman: fromRoman ignores letter case', async () => {
  const { fromRoman } = await load('src/roman.mjs');
  assert.equal(fromRoman('mcmxciv'), 1994);
  assert.equal(fromRoman('McmXcIv'), 1994);
  assert.equal(fromRoman('xiv'), 14);
  assert.equal(fromRoman('i'), 1);
});
test('roman: fromRoman rejects non-canonical numerals', async () => {
  const { fromRoman } = await load('src/roman.mjs');
  for (const bad of ['IIII', 'VV', 'IC', 'VX', 'XM', 'IIV', 'MMMM', 'XXXX', 'CCCC', 'VIV', 'IXI', 'IVI', 'DD', 'LL', 'IL', 'XD', 'CMC', 'MCMCM', 'IXX', 'XIIII', 'VIIII', 'LXL', 'DCD', 'iiii', 'ic'])
    assert.throws(() => fromRoman(bad), RangeError, bad);
});
test('roman: fromRoman rejects other text', async () => {
  const { fromRoman } = await load('src/roman.mjs');
  for (const bad of ['', ' ', ' X', 'X ', 'X I', 'ABC', 'XIVa', 'i v', 'X\n', '10', '-X', 'Ⅻ']) assert.throws(() => fromRoman(bad), RangeError, JSON.stringify(bad));
  for (const bad of [5, null, undefined, ['X'], {}]) assert.throws(() => fromRoman(bad), RangeError);
});
test('roman: every number from 1 to 3999 survives a round trip', async () => {
  const { toRoman, fromRoman } = await load('src/roman.mjs');
  const seen = new Set();
  for (let n = 1; n <= 3999; n++) {
    const text = toRoman(n);
    assert.match(text, /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/);
    assert.equal(fromRoman(text), n);
    assert.equal(fromRoman(text.toLowerCase()), n);
    seen.add(text);
  }
  assert.equal(seen.size, 3999);
});
test('roman: fromRoman accepts exactly the canonical strings', async () => {
  const { toRoman, fromRoman } = await load('src/roman.mjs');
  const canonical = new Map();
  for (let n = 1; n <= 3999; n++) canonical.set(toRoman(n), n);
  const alphabet = [...'IVXLCDM'];
  let strings = [''];
  let tried = 0;
  for (let length = 1; length <= 4; length++) {
    strings = strings.flatMap((s) => alphabet.map((c) => s + c));
    for (const s of strings) {
      tried++;
      if (canonical.has(s)) assert.equal(fromRoman(s), canonical.get(s), s);
      else assert.throws(() => fromRoman(s), RangeError, s);
    }
  }
  assert.equal(tried, 7 + 49 + 343 + 2401);
});

// ---------- wrap ----------
test('wrap: greedy filling', async () => {
  const { wordWrap } = await load('src/wrap.mjs');
  assert.equal(wordWrap('the quick brown fox', 10), 'the quick\nbrown fox');
  assert.equal(wordWrap('aaa bbb', 7), 'aaa bbb');
  assert.equal(wordWrap('aaa bbb', 6), 'aaa\nbbb');
  assert.equal(wordWrap('one two three four five', 9), 'one two\nthree\nfour five');
  assert.equal(wordWrap('a b c d e f g', 3), 'a b\nc d\ne f\ng');
  assert.equal(wordWrap('short', 80), 'short');
});
test('wrap: runs of spaces and edge spaces go', async () => {
  const { wordWrap } = await load('src/wrap.mjs');
  assert.equal(wordWrap('  hi   there  ', 20), 'hi there');
  assert.equal(wordWrap('a  b  c', 5), 'a b c');
  assert.equal(wordWrap('a  b\nc', 3), 'a b\nc');
  assert.equal(wordWrap('aaaa    bbbb', 4), 'aaaa\nbbbb');
  assert.equal(wordWrap('   a', 5), 'a');
});
test('wrap: tiny and huge widths, empty text', async () => {
  const { wordWrap } = await load('src/wrap.mjs');
  assert.equal(wordWrap('a b c', 1), 'a\nb\nc');
  assert.equal(wordWrap('ab', 1), 'a\nb');
  assert.equal(wordWrap('x', 100), 'x');
  assert.equal(wordWrap('', 5), '');
  assert.equal(wordWrap('   ', 5), '');
  assert.equal(wordWrap('a b', 1000), 'a b');
});
test('wrap: words longer than the width are cut', async () => {
  const { wordWrap } = await load('src/wrap.mjs');
  assert.equal(wordWrap('abcdefgh', 4), 'abcd\nefgh');
  assert.equal(wordWrap('abcdefghij', 4), 'abcd\nefgh\nij');
  assert.equal(wordWrap('ab abcdefghij k', 4), 'ab\nabcd\nefgh\nij k');
  assert.equal(wordWrap('abcdefgh x', 4), 'abcd\nefgh\nx');
  assert.equal(wordWrap('abcdef gh', 4), 'abcd\nef\ngh');
  assert.equal(wordWrap('abcdef g', 4), 'abcd\nef g');
  assert.equal(wordWrap('a abcdefg', 3), 'a\nabc\ndef\ng');
  assert.equal(wordWrap('abcde fghij', 5), 'abcde\nfghij');
});
test('wrap: paragraphs and line breaks', async () => {
  const { wordWrap } = await load('src/wrap.mjs');
  assert.equal(wordWrap('one\n\ntwo three', 7), 'one\n\ntwo\nthree');
  assert.equal(wordWrap('a\n\n\nb', 5), 'a\n\n\nb');
  assert.equal(wordWrap('a\n   \nb', 5), 'a\n\nb');
  assert.equal(wordWrap('aaa\nbbb', 20), 'aaa bbb');
  assert.equal(wordWrap('aaa\nbbb ccc\nddd', 7), 'aaa bbb\nccc ddd');
  assert.equal(wordWrap('a\n  b', 5), 'a b');
  assert.equal(wordWrap('first paragraph here\n\nsecond one', 9), 'first\nparagraph\nhere\n\nsecond\none');
});
test('wrap: blank lines at the edges are kept', async () => {
  const { wordWrap } = await load('src/wrap.mjs');
  assert.equal(wordWrap('\n', 5), '\n');
  assert.equal(wordWrap('a\n', 5), 'a\n');
  assert.equal(wordWrap('\na', 5), '\na');
  assert.equal(wordWrap('\n\n', 5), '\n\n');
  assert.equal(wordWrap('a b\n', 3), 'a b\n');
  assert.equal(wordWrap('a\n\n', 5), 'a\n\n');
});
test('wrap: only spaces and line feeds separate words', async () => {
  const { wordWrap } = await load('src/wrap.mjs');
  assert.equal(wordWrap('a\tb c', 3), 'a\tb\nc');
  assert.equal(wordWrap('a\tb c', 10), 'a\tb c');
});
test('wrap: width and text are validated', async () => {
  const { wordWrap } = await load('src/wrap.mjs');
  for (const width of [0, -1, 1.5, '5', NaN, undefined, null, Infinity]) assert.throws(() => wordWrap('x', width), RangeError, String(width));
  for (const text of [5, null, undefined, ['a'], {}]) assert.throws(() => wordWrap(text, 10), TypeError);
});
test('wrap: no line is too long, nothing is lost, filling is greedy', async () => {
  const { wordWrap } = await load('src/wrap.mjs');
  const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
  for (let width = 1; width <= 40; width++) {
    const out = wordWrap(text, width);
    const lines = out.split('\n');
    for (const line of lines) {
      assert.ok(line.length > 0 && line.length <= width, `width ${width}: ${JSON.stringify(line)}`);
      assert.ok(!line.endsWith(' ') && !line.startsWith(' '));
    }
    assert.equal(out.replace(/\s/g, ''), text.replace(/\s/g, ''));
    if (width >= 12) {
      // every word fits: the first word of the next line must not have fitted on this one
      for (let i = 0; i + 1 < lines.length; i++) assert.ok(lines[i].length + 1 + lines[i + 1].split(' ')[0].length > width, `width ${width}, line ${i}`);
      assert.equal(out.split(/\s+/).join(' '), text);
    }
  }
});

// ---------- template ----------
const TPL = { user: { name: 'Ann & Bo', age: 0, tags: ['x', 'y'] }, list: ['x', 'y'], html: '<b>', n: 5, nested: { a: { b: { c: 'deep' } } } };
test('template: substitutes values, spaces inside the braces optional', async () => {
  const { render } = await load('src/template.mjs');
  assert.equal(render('Hello {{ n }}!', TPL), 'Hello 5!');
  assert.equal(render('{{n}}', TPL), '5');
  assert.equal(render('{{   n   }}', TPL), '5');
  assert.equal(render('{{n }}-{{ n}}', TPL), '5-5');
  assert.equal(render('{{n}}{{n}}{{ n }}', TPL), '555');
  assert.equal(render('no tags here', TPL), 'no tags here');
  assert.equal(render('', TPL), '');
  assert.equal(render('a { b } c {d} {', TPL), 'a { b } c {d} {');
});
test('template: dotted paths and array indexes', async () => {
  const { render } = await load('src/template.mjs');
  assert.equal(render('{{ user.name }}', { user: { name: 'Zed' } }), 'Zed');
  assert.equal(render('{{ nested.a.b.c }}', TPL), 'deep');
  assert.equal(render('{{ list.0 }}{{ list.1 }}', TPL), 'xy');
  assert.equal(render('{{ user.tags.1 }}', TPL), 'y');
  assert.equal(render('{{ a.b }}', { 'a.b': 'flat', a: { b: 'nested' } }), 'nested');
  assert.equal(render('{{ x-y }} {{ $v }} {{ é }}', { 'x-y': 1, $v: 2, é: 3 }), '1 2 3');
});
test('template: double braces escape HTML', async () => {
  const { render } = await load('src/template.mjs');
  assert.equal(render('{{ v }}', { v: `&<>"'` }), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(render('{{ v }}', { v: '&amp;' }), '&amp;amp;');
  assert.equal(render('{{ html }}', TPL), '&lt;b&gt;');
  assert.equal(render('<b>"{{ v }}"</b> & more', { v: '<' }), '<b>"&lt;"</b> & more');
  assert.equal(render('{{ user.name }}', TPL), 'Ann &amp; Bo');
  assert.equal(render('{{ v }}', { v: ['<a>', 'b'] }), '&lt;a&gt;,b');
});
test('template: triple braces do not escape', async () => {
  const { render } = await load('src/template.mjs');
  assert.equal(render('{{{ html }}}', TPL), '<b>');
  assert.equal(render('{{html}} {{{html}}}', TPL), '&lt;b&gt; <b>');
  assert.equal(render('{{{ user.name }}}', TPL), 'Ann & Bo');
  assert.equal(render('[{{{v}}}]', { v: `"'&` }), `["'&]`);
  assert.equal(render('{{{ nope }}}|', TPL), '|');
  assert.equal(render('{{{ n }}}}', TPL), '5}');
});
test('template: values go through String, empty ones are empty', async () => {
  const { render } = await load('src/template.mjs');
  const t = (v) => render('[{{ v }}]', { v });
  assert.equal(t(0), '[0]');
  assert.equal(t(false), '[false]');
  assert.equal(t(true), '[true]');
  assert.equal(t(''), '[]');
  assert.equal(t(null), '[]');
  assert.equal(t(undefined), '[]');
  assert.equal(t(1.5), '[1.5]');
  assert.equal(t(NaN), '[NaN]');
  assert.equal(t([1, 2]), '[1,2]');
  assert.equal(t({}), '[[object Object]]');
});
test('template: missing paths are empty', async () => {
  const { render } = await load('src/template.mjs');
  assert.equal(render('[{{ nope }}]', TPL), '[]');
  assert.equal(render('[{{ nope.deeper.still }}]', TPL), '[]');
  assert.equal(render('[{{ user.nope }}]', TPL), '[]');
  assert.equal(render('[{{ a.b }}]', { a: null }), '[]');
  assert.equal(render('[{{ a.b }}]', { a: 'text' }), '[]');
  assert.equal(render('[{{ a.b }}]', { a: 5 }), '[]');
  assert.equal(render('[{{ list.5 }}]', TPL), '[]');
  assert.equal(render('[{{ a }}]', { a: undefined }), '[]');
  assert.equal(render('[{{ toString }}{{ constructor }}{{ __proto__ }}{{ hasOwnProperty }}]', {}), '[]');
  assert.equal(render('[{{ a.toString }}]', { a: {} }), '[]');
  assert.equal(render('[{{ x }}]', undefined), '[]');
  assert.equal(render('[{{ x }}]', null), '[]');
  assert.equal(render('[{{ x }}]', {}), '[]');
});
test('template: a backslash before {{ makes it literal', async () => {
  const { render } = await load('src/template.mjs');
  assert.equal(render('a \\{{ n }} b', TPL), 'a {{ n }} b');
  assert.equal(render('\\{{ n }} {{ n }}', TPL), '{{ n }} 5');
  assert.equal(render('\\{{{ n }}}', TPL), '{{{ n }}}');
  assert.equal(render('a\\b \\n', TPL), 'a\\b \\n');
  assert.equal(render('\\\\{{ n }}', TPL), '\\{{ n }}');
  assert.equal(render('\\{{', TPL), '{{');
  assert.equal(render('\\{ n }}', TPL), '\\{ n }}');
  assert.equal(render('a }} b }}}', TPL), 'a }} b }}}');
});
test('template: SyntaxError for open or unreadable tags', async () => {
  const { render } = await load('src/template.mjs');
  for (const bad of ['{{ n', '{{', '{{{', '{{{ n }}', '{{{ n', 'x {{ n } }', 'a {{ n}', '{{ }}', '{{}}', '{{{ }}}', '{{ a..b }}', '{{ .a }}', '{{ a. }}', '{{ a {{ b }}', '{{ a b }}', '{{ a}b }}', '{{{ a{b }}}'])
    assert.throws(() => render(bad, TPL), SyntaxError, JSON.stringify(bad));
  for (const bad of [5, null, undefined, ['a']]) assert.throws(() => render(bad, TPL), TypeError);
});

// ---------- glob ----------
test('glob: * stays inside one path part', async () => {
  const { matches } = await load('src/glob.mjs');
  for (const [pattern, path, expected] of [
    ['*.js', 'app.js', true], ['*.js', '.js', true], ['*.js', 'a.b.js', true], ['*.js', 'src/app.js', false], ['*.js', 'app.jsx', false],
    ['a*', 'a', true], ['a*', 'abc', true], ['a*', 'a/b', false], ['a*', 'xa', false],
    ['*', '', true], ['*', 'abc', true], ['*', '.hidden', true], ['*', 'a/b', false],
    ['src/*', 'src/a', true], ['src/*', 'src/', true], ['src/*', 'src/a/b', false], ['src/*', 'src', false],
    ['*/*', 'a/b', true], ['*/*', 'a/b/c', false], ['*/*', 'a', false], ['a*c*e', 'abcde', true], ['a*c*e', 'ace', true], ['a*c*e', 'abde', false],
  ]) assert.equal(matches(pattern, path), expected, `${pattern} ${path}`);
});
test('glob: ** crosses directories', async () => {
  const { matches } = await load('src/glob.mjs');
  for (const [pattern, path, expected] of [
    ['a/**/b', 'a/b', true], ['a/**/b', 'a/x/b', true], ['a/**/b', 'a/x/y/b', true], ['a/**/b', 'a/xb', false], ['a/**/b', 'ab', false], ['a/**/b', 'a/b/c', false],
    ['**/x', 'x', true], ['**/x', 'a/x', true], ['**/x', 'a/b/x', true], ['**/x', 'ax', false], ['**/x', 'a/bx', false],
    ['***/x', 'x', true], ['***/x', 'a/b/x', true],
    ['**', '', true], ['**', 'a', true], ['**', 'a/b/c', true],
    ['a/**', 'a/', true], ['a/**', 'a/b/c', true], ['a/**', 'a', false], ['a/**', 'b/c', false],
    ['a**', 'a', true], ['a**', 'abc', true], ['a**', 'a/b', true], ['a**b', 'ab', true], ['a**b', 'axb', true], ['a**b', 'a/x/b', true],
    ['**/', '', true], ['**/', 'a/', true], ['**/', 'a/b/', true], ['**/', 'a', false],
    ['src/**/*.js', 'src/a.js', true], ['src/**/*.js', 'src/a/b/c.js', true], ['src/**/*.js', 'src/a.ts', false], ['src/**/*.js', 'lib/a.js', false],
    ['**/*.js', 'a.js', true], ['**/*.js', 'x/y/a.js', true], ['**/*.js', 'x/y/a.jsx', false],
    ['**/node_modules/**', 'node_modules/', true], ['**/node_modules/**', 'a/node_modules/b/c', true], ['**/node_modules/**', 'a/node_modules', false],
  ]) assert.equal(matches(pattern, path), expected, `${pattern} ${path}`);
});
test('glob: ? is one character that is not /', async () => {
  const { matches } = await load('src/glob.mjs');
  for (const [pattern, path, expected] of [
    ['file?.txt', 'file1.txt', true], ['file?.txt', 'file.txt', false], ['file?.txt', 'file12.txt', false], ['file?.txt', 'file/.txt', false],
    ['?', 'a', true], ['?', '', false], ['?', '/', false], ['?', 'ab', false], ['??', 'ab', true], ['a?c', 'abc', true], ['a?c', 'a/c', false], ['?/?', 'a/b', true],
  ]) assert.equal(matches(pattern, path), expected, `${pattern} ${path}`);
});
test('glob: character classes', async () => {
  const { matches } = await load('src/glob.mjs');
  for (const [pattern, path, expected] of [
    ['[abc]x', 'ax', true], ['[abc]x', 'cx', true], ['[abc]x', 'dx', false], ['[abc]x', 'abx', false], ['[abc]x', 'x', false],
    ['[a-z]1', 'q1', true], ['[a-z]1', 'Q1', false], ['[a-z]1', '-1', false],
    ['[a-c0-2]', 'b', true], ['[a-c0-2]', '1', true], ['[a-c0-2]', 'd', false], ['[a-c0-2]', '3', false],
    ['[!abc]x', 'dx', true], ['[!abc]x', 'ax', false], ['[!abc]x', '/x', false], ['[!abc]x', 'x', false],
    ['[!a-c]', 'd', true], ['[!a-c]', 'b', false], ['[!a-c]', '-', true],
    ['[-a]', '-', true], ['[-a]', 'a', true], ['[-a]', 'b', false], ['[a-]', '-', true], ['[a-]', 'a', true], ['[a-]', 'b', false],
    ['[*]', '*', true], ['[*]', 'a', false], ['[?]', '?', true], ['[?]', 'a', false], ['[.]x', '.x', true], ['[.]x', 'ax', false],
    ['[^a]', '^', true], ['[^a]', 'a', true], ['[^a]', 'b', false],
    ['[a-c]*.js', 'bz.js', true], ['[a-c]*.js', 'dz.js', false],
  ]) assert.equal(matches(pattern, path), expected, `${pattern} ${path}`);
});
test('glob: a [ that does not open a class is ordinary', async () => {
  const { matches } = await load('src/glob.mjs');
  for (const [pattern, path, expected] of [
    ['[abc', '[abc', true], ['[abc', 'a', false], ['[]', '[]', true], ['[]', 'a', false], ['[!]', '[!]', true], ['[!]', '!', false], ['[!]', 'a', false],
    ['a[', 'a[', true], ['x]', 'x]', true], ['[', '[', true], ['[!', '[!', true], ['[]a]', '[]a]', true], ['[]a]', 'a', false],
  ]) assert.equal(matches(pattern, path), expected, `${pattern} ${path}`);
});
test('glob: {a,b} alternatives', async () => {
  const { matches } = await load('src/glob.mjs');
  for (const [pattern, path, expected] of [
    ['*.{js,mjs}', 'a.js', true], ['*.{js,mjs}', 'a.mjs', true], ['*.{js,mjs}', 'a.ts', false], ['*.{js,mjs}', 'a.jsx', false], ['*.{js,mjs}', 'x/a.js', false],
    ['{a,b}c', 'ac', true], ['{a,b}c', 'bc', true], ['{a,b}c', 'cc', false], ['{a,b}c', 'abc', false],
    ['x{,y}', 'x', true], ['x{,y}', 'xy', true], ['x{,y}', 'xz', false], ['{a}', 'a', true], ['{}', '', true], ['{}', 'a', false],
    ['{*,b}', '*', true], ['{*,b}', 'b', true], ['{*,b}', 'a', false], ['{*,b}', 'abc', false],
    ['src/{a,b}/*.js', 'src/a/x.js', true], ['src/{a,b}/*.js', 'src/c/x.js', false],
    ['{a.b,c+d}', 'a.b', true], ['{a.b,c+d}', 'axb', false], ['{a.b,c+d}', 'c+d', true], ['{a.b,c+d}', 'ccd', false],
    ['{a,b', '{a,b', true], ['{a,b', 'a', false], ['a}', 'a}', true], ['{a,b}}', 'a}', true], ['{a,b}}', 'a', false],
  ]) assert.equal(matches(pattern, path), expected, `${pattern} ${path}`);
});
test('glob: other characters are literal and the whole path must match', async () => {
  const { matches } = await load('src/glob.mjs');
  for (const [pattern, path, expected] of [
    ['a.b', 'a.b', true], ['a.b', 'axb', false], ['a+b', 'a+b', true], ['a+b', 'aab', false], ['(x)', '(x)', true], ['(x)', 'x', false],
    ['a|b', 'a|b', true], ['a|b', 'a', false], ['a$', 'a$', true], ['a$', 'a', false], ['^a', '^a', true], ['^a', 'a', false],
    ['a\\b', 'a\\b', true], ['a\\b', 'ab', false], ['a-b', 'a-b', true], ['!a', '!a', true], ['a/b', 'a/b', true], ['a b', 'a b', true],
    ['A', 'a', false], ['a', 'A', false], ['abc', 'abcd', false], ['abc', 'xabc', false], ['abc', 'abc', true], ['', '', true], ['', 'a', false],
    ['a.{b,c}.d', 'a.b.d', true], ['a.{b,c}.d', 'axbxd', false],
  ]) assert.equal(matches(pattern, path), expected, `${pattern} ${path}`);
});
test('glob: globToRegExp returns a RegExp, matches validates its input', async () => {
  const { globToRegExp, matches } = await load('src/glob.mjs');
  const re = globToRegExp('src/**/*.{js,mjs}');
  assert.ok(re instanceof RegExp);
  assert.equal(re.flags, '');
  for (let i = 0; i < 3; i++) {
    assert.equal(re.test('src/a/b.mjs'), true);
    assert.equal(re.test('src/a/b.ts'), false);
    assert.equal(re.test('xsrc/a/b.mjs'), false);
    assert.equal(re.test('src/a/b.mjsx'), false);
  }
  assert.equal(matches('src/**/test/*.{js,mjs}', 'src/a/b/test/x.mjs'), true);
  assert.equal(matches('src/**/test/*.{js,mjs}', 'src/test/x.js'), true);
  assert.equal(matches('src/**/test/*.{js,mjs}', 'src/a/test/x/y.js'), false);
  assert.equal(globToRegExp('a.b').test('axb'), false);
  assert.throws(() => globToRegExp(5), TypeError);
  assert.throws(() => globToRegExp(null), TypeError);
  assert.throws(() => matches(5, 'a'), TypeError);
  assert.throws(() => matches('a', 5), TypeError);
  assert.throws(() => matches('a', undefined), TypeError);
});

// ---------- diff ----------
const D = (entries) => entries.map(([op, line]) => ({ op: { e: 'equal', d: 'delete', i: 'insert' }[op], line }));
test('diff: identical, empty, all new, all gone', async () => {
  const { diffLines } = await load('src/diff.mjs');
  assert.deepEqual(diffLines(['a', 'b'], ['a', 'b']), D([['e', 'a'], ['e', 'b']]));
  assert.deepEqual(diffLines([], []), []);
  assert.deepEqual(diffLines([], ['q']), D([['i', 'q']]));
  assert.deepEqual(diffLines(['q', 'r'], []), D([['d', 'q'], ['d', 'r']]));
  assert.deepEqual(diffLines([], ['x', 'y']), D([['i', 'x'], ['i', 'y']]));
  assert.deepEqual(diffLines([''], ['']), D([['e', '']]));
});
test('diff: a change, an insertion and a deletion', async () => {
  const { diffLines } = await load('src/diff.mjs');
  assert.deepEqual(diffLines(['a', 'b', 'c'], ['a', 'x', 'c']), D([['e', 'a'], ['d', 'b'], ['i', 'x'], ['e', 'c']]));
  assert.deepEqual(diffLines(['a', 'c'], ['a', 'b', 'c']), D([['e', 'a'], ['i', 'b'], ['e', 'c']]));
  assert.deepEqual(diffLines(['a', 'b', 'c'], ['a', 'c']), D([['e', 'a'], ['d', 'b'], ['e', 'c']]));
  assert.deepEqual(diffLines(['a', 'b'], ['a', 'b', 'c', 'd']), D([['e', 'a'], ['e', 'b'], ['i', 'c'], ['i', 'd']]));
  assert.deepEqual(diffLines(['x', 'a', 'b'], ['a', 'b']), D([['d', 'x'], ['e', 'a'], ['e', 'b']]));
});
test('diff: deletes come before inserts in a changed stretch', async () => {
  const { diffLines } = await load('src/diff.mjs');
  assert.deepEqual(diffLines(['a', 'b'], ['x', 'y']), D([['d', 'a'], ['d', 'b'], ['i', 'x'], ['i', 'y']]));
  assert.deepEqual(diffLines(['a', 'b', 'c'], ['x', 'b', 'y']), D([['d', 'a'], ['i', 'x'], ['e', 'b'], ['d', 'c'], ['i', 'y']]));
  assert.deepEqual(diffLines(['k', 'a', 'z'], ['k', 'b', 'z']), D([['e', 'k'], ['d', 'a'], ['i', 'b'], ['e', 'z']]));
  assert.deepEqual(diffLines(['a'], ['b']), D([['d', 'a'], ['i', 'b']]));
});
test('diff: ties follow the stated walk', async () => {
  const { diffLines } = await load('src/diff.mjs');
  assert.deepEqual(diffLines(['x', 'y'], ['y', 'x']), D([['d', 'x'], ['e', 'y'], ['i', 'x']]));
  assert.deepEqual(diffLines(['a', 'b'], ['b', 'a']), D([['d', 'a'], ['e', 'b'], ['i', 'a']]));
  assert.deepEqual(diffLines(['a', 'a'], ['a']), D([['e', 'a'], ['d', 'a']]));
  assert.deepEqual(diffLines(['a'], ['a', 'a']), D([['e', 'a'], ['i', 'a']]));
  assert.deepEqual(diffLines(['a', 'b', 'a'], ['a']), D([['e', 'a'], ['d', 'b'], ['d', 'a']]));
  assert.deepEqual(diffLines(['1', '2', '3'], ['3', '1', '2']), D([['i', '3'], ['e', '1'], ['e', '2'], ['d', '3']]));
  assert.deepEqual(diffLines(['3', '1', '2'], ['1', '2', '3']), D([['d', '3'], ['e', '1'], ['e', '2'], ['i', '3']]));
  assert.deepEqual(diffLines(['x', 'y', 'z'], ['z', 'y', 'x']), D([['d', 'x'], ['d', 'y'], ['e', 'z'], ['i', 'y'], ['i', 'x']]));
});
test('diff: random inputs give a longest common subsequence by the stated walk', async () => {
  const { diffLines, applyDiff } = await load('src/diff.mjs');
  const lcs = (x, y) => {
    const t = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    return t[0][0];
  };
  const walk = (a, b) => {
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) out.push({ op: 'equal', line: a[i++] }), j++;
      else if (lcs(a.slice(i + 1), b.slice(j)) >= lcs(a.slice(i), b.slice(j + 1))) out.push({ op: 'delete', line: a[i++] });
      else out.push({ op: 'insert', line: b[j++] });
    }
    while (i < a.length) out.push({ op: 'delete', line: a[i++] });
    while (j < b.length) out.push({ op: 'insert', line: b[j++] });
    return out;
  };
  let seed = 12345;
  const rnd = (n) => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return (seed >>> 8) % n;
  };
  const make = () => Array.from({ length: rnd(9) }, () => 'abcd'[rnd(4)]);
  for (let k = 0; k < 300; k++) {
    const a = make();
    const b = make();
    const diff = diffLines(a, b);
    const where = `${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
    assert.deepEqual(diff.filter((d) => d.op !== 'insert').map((d) => d.line), a, where);
    assert.deepEqual(diff.filter((d) => d.op !== 'delete').map((d) => d.line), b, where);
    assert.equal(diff.filter((d) => d.op === 'equal').length, lcs(a, b), where);
    assert.deepEqual(diff, walk(a, b), where);
    assert.deepEqual(applyDiff(a, diff), b, where);
  }
});
test('diff: applyDiff applies a diff and leaves its inputs alone', async () => {
  const { diffLines, applyDiff } = await load('src/diff.mjs');
  const a = ['one', 'two', 'three', 'two'];
  const b = ['zero', 'one', 'three', 'two', 'four'];
  const diff = diffLines(a, b);
  const aCopy = [...a];
  const diffCopy = JSON.parse(JSON.stringify(diff));
  const result = applyDiff(a, diff);
  assert.deepEqual(result, b);
  assert.deepEqual(a, aCopy);
  assert.deepEqual(diff, diffCopy);
  assert.notEqual(result, a);
  assert.deepEqual(applyDiff([], []), []);
  assert.deepEqual(applyDiff([], D([['i', 'x'], ['i', 'y']])), ['x', 'y']);
  assert.deepEqual(applyDiff(['x', 'y'], D([['d', 'x'], ['d', 'y']])), []);
  assert.deepEqual(applyDiff(['a', 'b'], D([['e', 'a'], ['e', 'b']])), ['a', 'b']);
  assert.deepEqual(applyDiff(['a', 'b'], D([['i', 'x'], ['e', 'a'], ['d', 'b'], ['i', 'y']])), ['x', 'a', 'y']);
});
test('diff: errors', async () => {
  const { diffLines, applyDiff } = await load('src/diff.mjs');
  assert.throws(() => applyDiff(['a'], D([['e', 'b']])), Error);
  assert.throws(() => applyDiff(['a'], D([['d', 'b']])), Error);
  assert.throws(() => applyDiff(['a', 'b'], D([['e', 'a']])), Error);
  assert.throws(() => applyDiff(['a', 'b'], []), Error);
  assert.throws(() => applyDiff(['a'], D([['e', 'a'], ['e', 'b']])), Error);
  assert.throws(() => applyDiff([], D([['d', 'a']])), Error);
  assert.throws(() => applyDiff(['a'], [{ op: 'replace', line: 'a' }]), Error);
  assert.throws(() => applyDiff(['a'], null), Error);
  for (const [a, b] of [['ab', ['a']], [['a'], 'a'], [null, []], [[], undefined], [{}, []]]) assert.throws(() => diffLines(a, b), TypeError);
  const a = ['p', 'q'];
  const b = ['q', 'r'];
  const out = diffLines(a, b);
  assert.deepEqual(a, ['p', 'q']);
  assert.deepEqual(b, ['q', 'r']);
  for (const entry of out) assert.deepEqual(Object.keys(entry).sort(), ['line', 'op']);
});

// ---------- ini ----------
test('ini: sections and keys', async () => {
  const { parseIni } = await load('src/ini.mjs');
  const text = 'top = 1\n; note\n[server]\nhost = "my host"\nmsg = "a\\nb"\nport = 80\n[server]\nport = 8080\n';
  assert.deepEqual(parseIni(text), { '': { top: '1' }, server: { host: 'my host', msg: 'a\nb', port: '8080' } });
  assert.deepEqual(parseIni('  [ my app ]  \n x = 1'), { 'my app': { x: '1' } });
  assert.deepEqual(parseIni('[a]\n[b]'), { a: {}, b: {} });
  assert.deepEqual(parseIni('[a]\nx=1'), { a: { x: '1' } });
  assert.deepEqual(parseIni('a=1\n[s]\nb=2'), { '': { a: '1' }, s: { b: '2' } });
  assert.deepEqual(parseIni(''), {});
  assert.deepEqual(parseIni('\n\n  \n'), {});
  assert.deepEqual(parseIni('; only a comment'), {});
  assert.deepEqual(parseIni('[s.sub]\nk=1\n[x=y]\nk=2'), { 's.sub': { k: '1' }, 'x=y': { k: '2' } });
  assert.equal(Object.getPrototypeOf(parseIni('[a]\nk=1')), Object.prototype);
  assert.equal(Object.getPrototypeOf(parseIni('[a]\nk=1').a), Object.prototype);
});
test('ini: comments, blanks, trimming and unquoted values', async () => {
  const { parseIni } = await load('src/ini.mjs');
  assert.deepEqual(parseIni('a = 1\n; c\n# d\n  ; e\n\t# f\n\nb = 2'), { '': { a: '1', b: '2' } });
  assert.deepEqual(parseIni('; a = 1'), {});
  assert.deepEqual(parseIni('#a=b'), {});
  assert.deepEqual(parseIni('a = b ; c'), { '': { a: 'b ; c' } });
  assert.deepEqual(parseIni('a = b # c'), { '': { a: 'b # c' } });
  assert.deepEqual(parseIni('url = http://x/?a=b&c=d'), { '': { url: 'http://x/?a=b&c=d' } });
  assert.deepEqual(parseIni('k='), { '': { k: '' } });
  assert.deepEqual(parseIni('k = '), { '': { k: '' } });
  assert.deepEqual(parseIni('  k  =  v  '), { '': { k: 'v' } });
  assert.deepEqual(parseIni('a b = c d'), { '': { 'a b': 'c d' } });
  assert.deepEqual(parseIni('a;b = 1'), { '': { 'a;b': '1' } });
  assert.deepEqual(parseIni('a = 1\r\n[s]\r\nb = 2\r\n'), { '': { a: '1' }, s: { b: '2' } });
  assert.deepEqual(parseIni('a = x"y"'), { '': { a: 'x"y"' } });
  assert.deepEqual(parseIni('a = 5" pipe'), { '': { a: '5" pipe' } });
  assert.deepEqual(parseIni('a = C:\\dir\\n'), { '': { a: 'C:\\dir\\n' } });
  assert.deepEqual(parseIni('A = 1\na = 2'), { '': { A: '1', a: '2' } });
});
test('ini: quoted values', async () => {
  const { parseIni } = await load('src/ini.mjs');
  const one = (line) => parseIni(line)[''].a;
  assert.equal(one('a = "  x  "'), '  x  ');
  assert.equal(one('a = "x\\ny"'), 'x\ny');
  assert.equal(one('a = "say \\"hi\\""'), 'say "hi"');
  assert.equal(one('a = "back\\\\slash"'), 'back\\slash');
  assert.equal(one('a = "\\\\n"'), '\\n');
  assert.equal(one('a = ""'), '');
  assert.equal(one('a = "; not a comment # no"'), '; not a comment # no');
  assert.equal(one('a = "x=y"'), 'x=y');
  assert.equal(one('a = "  "'), '  ');
  assert.equal(one('a = "line1\\nline2\\n"'), 'line1\nline2\n');
  assert.equal(one('a = "tab\there"'), 'tab\there');
  assert.equal(one('a = "x"   '), 'x');
  assert.equal(one('a="x"'), 'x');
});
test('ini: later keys replace, repeated sections continue', async () => {
  const { parseIni } = await load('src/ini.mjs');
  assert.deepEqual(parseIni('a = 1\na = 2'), { '': { a: '2' } });
  assert.deepEqual(parseIni('[s]\na=1\n[t]\nb=2\n[s]\nc=3\na=9'), { s: { a: '9', c: '3' }, t: { b: '2' } });
  assert.deepEqual(parseIni('k=1\n[s]\nk=2\n[t]\nk=3'), { '': { k: '1' }, s: { k: '2' }, t: { k: '3' } });
  assert.deepEqual(parseIni('[S]\nk=1\n[s]\nk=2'), { S: { k: '1' }, s: { k: '2' } });
  assert.deepEqual(parseIni('[s]\nk = 1\nk = "2"'), { s: { k: '2' } });
  assert.deepEqual(parseIni('[a]\n[a]'), { a: {} });
  assert.deepEqual(parseIni('[constructor]\ntoString = x'), { constructor: { toString: 'x' } });
  assert.deepEqual(parseIni('toString = 1\nk = 2\ntoString = 3'), { '': { toString: '3', k: '2' } });
});
test('ini: SyntaxError names the line', async () => {
  const { parseIni } = await load('src/ini.mjs');
  const bad = [
    ['a = 1\nb\n', 2], ['[a]\nx=1\njunk', 3], ['\n\n[bad', 3], ['[]', 1], ['[ ]', 1], ['[a]b', 1], ['[a[b]', 1], ['[a]]', 1], ['[a] = x', 1], ['[a=b', 1], ['x = 1\n[k] = v', 2], ['[s] ; c', 1], ['= v', 1], ['  = v', 1],
    ['a = "open', 1], ['ok=1\nb = "x" y', 2], ['k = "a\\tb"', 1], ['k = "a\\', 1], ['k = "', 1], ['k = "a" ; c', 1], ['k = "a""b"', 1],
    ['# c\n; c\n\nk\n', 4], ['\n'.repeat(11) + 'junk', 12], ['[a]\nx = 1\n[b]\ny = 2\n\nz', 6], ['a = 1\n[s]\n"q" "r"', 3],
  ];
  for (const [text, n] of bad) {
    assert.throws(() => parseIni(text), (e) => e instanceof SyntaxError && new RegExp(`\\bline ${n}\\b`).test(e.message), `${JSON.stringify(text)} line ${n}`);
  }
  assert.throws(() => parseIni('bad one\nbad two'), (e) => e instanceof SyntaxError && /\bline 1\b/.test(e.message) && !/\bline 2\b/.test(e.message));
  for (const text of [5, null, undefined, ['a=1']]) assert.throws(() => parseIni(text), TypeError);
});
test('ini: stringifyIni layout', async () => {
  const { stringifyIni } = await load('src/ini.mjs');
  assert.equal(stringifyIni({}), '');
  assert.equal(stringifyIni({ s: {} }), '[s]\n');
  assert.equal(stringifyIni({ '': {} }), '');
  assert.equal(stringifyIni({ '': { a: '1' } }), 'a = 1\n');
  assert.equal(stringifyIni({ '': { a: '1' }, s: { b: '2' }, t: {} }), 'a = 1\n[s]\nb = 2\n[t]\n');
  assert.equal(stringifyIni({ s: { b: '2' }, '': { a: '1' } }), 'a = 1\n[s]\nb = 2\n');
  assert.equal(stringifyIni({ z: { k: '1' }, a: { k: '2' } }), '[z]\nk = 1\n[a]\nk = 2\n');
  assert.equal(stringifyIni({ '': { b: '1', a: '2' } }), 'b = 1\na = 2\n');
  assert.equal(stringifyIni({ '': { a: 1, b: true, c: null, d: undefined, e: 1.5, f: 0 } }), 'a = 1\nb = true\nc =\nd =\ne = 1.5\nf = 0\n');
  assert.equal(stringifyIni({ 'my app': { 'a b': 'c d' } }), '[my app]\na b = c d\n');
  assert.equal(stringifyIni({ a: { x: '1' }, b: { y: '2' }, '': { top: 't' } }), 'top = t\n[a]\nx = 1\n[b]\ny = 2\n');
});
test('ini: stringifyIni quotes only when needed', async () => {
  const { stringifyIni } = await load('src/ini.mjs');
  const one = (v) => stringifyIni({ '': { k: v } });
  assert.equal(one(' x '), 'k = " x "\n');
  assert.equal(one('x '), 'k = "x "\n');
  assert.equal(one(' x'), 'k = " x"\n');
  assert.equal(one('\t'), 'k = "\t"\n');
  assert.equal(one('x\r'), 'k = "x\r"\n');
  assert.equal(one('a\nb'), 'k = "a\\nb"\n');
  assert.equal(one('"q'), 'k = "\\"q"\n');
  assert.equal(one('"'), 'k = "\\""\n');
  assert.equal(one('a"\n'), 'k = "a\\"\\n"\n');
  assert.equal(one(' a\\b '), 'k = " a\\\\b "\n');
  assert.equal(one('say "hi"'), 'k = say "hi"\n');
  assert.equal(one('back\\slash'), 'k = back\\slash\n');
  assert.equal(one('\\n'), 'k = \\n\n');
  assert.equal(one(''), 'k =\n');
  assert.equal(one(';x'), 'k = ;x\n');
  assert.equal(one('a=b'), 'k = a=b\n');
  assert.equal(one('[s]'), 'k = [s]\n');
  assert.equal(one('plain'), 'k = plain\n');
});
test('ini: stringifyIni errors', async () => {
  const { stringifyIni } = await load('src/ini.mjs');
  for (const key of ['', 'a=b', ' a', 'a ', ';c', '#c', '[x', 'a\nb', '=']) assert.throws(() => stringifyIni({ '': { [key]: '1' } }), RangeError, JSON.stringify(key));
  for (const key of ['', 'a=b', ' a', ';c']) assert.throws(() => stringifyIni({ s: { [key]: '1' } }), RangeError, JSON.stringify(key));
  for (const name of ['[', ']', 'a]', 'a[b', ' s', 's ', 's\nt']) assert.throws(() => stringifyIni({ [name]: { k: '1' } }), RangeError, JSON.stringify(name));
  for (const obj of [null, 5, 'x', undefined]) assert.throws(() => stringifyIni(obj), TypeError);
  for (const section of ['x', 5, null]) assert.throws(() => stringifyIni({ s: section }), TypeError);
  assert.doesNotThrow(() => stringifyIni({ '': { 'a b': '1', 'a.b': '2', 'a-b': '3', '"q"': '4', 'é': '5', 'a[0]': '6', 'a;b': '7' } }));
});
test('ini: stringifyIni and parseIni round trip', async () => {
  const { parseIni, stringifyIni } = await load('src/ini.mjs');
  const values = ['', ' ', ' lead', 'trail ', 'a\nb', '"', '"quoted"', 'back\\slash', '\\n', '\\\\', 'x=y', ';c', '#c', '[s]', 'tab\there', 'cr\rx', 'multi\n\nline', 'a "b" c', '\\"', '"\\"', 'é ü 日本', '\n', 'x\n', '  "in"  '];
  const section = {};
  values.forEach((v, i) => (section[`k${i}`] = v));
  const obj = { '': { ...section, 'a b': 'c', 'a.b': 'd', '"q"': 'e' }, 'my app': section, 'x=y': { a: '1' }, empty: {} };
  const text = stringifyIni(obj);
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  assert.deepEqual(parseIni(text), obj);
  assert.equal(stringifyIni(parseIni(text)), text);
  assert.deepEqual(parseIni(stringifyIni({ '': {}, s: { a: '1' } })), { s: { a: '1' } });
});

// ---------- cron ----------
const iso = (d) => d.toISOString();
const NR = async (expression, from) => {
  const { nextRun } = await load('src/cron.mjs');
  return iso(nextRun(expression, new Date(from)));
};
test('cron: strictly after, every minute', async () => {
  const { nextRun } = await load('src/cron.mjs');
  assert.equal(await NR('* * * * *', '2024-01-01T10:07:30Z'), '2024-01-01T10:08:00.000Z');
  assert.equal(await NR('* * * * *', '2024-01-01T10:07:00.000Z'), '2024-01-01T10:08:00.000Z');
  assert.equal(await NR('* * * * *', '2024-01-01T10:07:59.999Z'), '2024-01-01T10:08:00.000Z');
  assert.equal(await NR('* * * * *', '2024-01-01T23:59:30Z'), '2024-01-02T00:00:00.000Z');
  assert.equal(await NR('* * * * *', '2024-12-31T23:59:00Z'), '2025-01-01T00:00:00.000Z');
  assert.equal(await NR('* * * * *', '2024-02-28T23:59:00Z'), '2024-02-29T00:00:00.000Z');
  assert.equal(await NR('* * * * *', '2023-02-28T23:59:00Z'), '2023-03-01T00:00:00.000Z');
  const from = new Date('2024-05-05T05:05:05.005Z');
  const result = nextRun('* * * * *', from);
  assert.ok(result instanceof Date);
  assert.notEqual(result, from);
  assert.equal(from.toISOString(), '2024-05-05T05:05:05.005Z');
  assert.equal(result.getUTCSeconds(), 0);
  assert.equal(result.getUTCMilliseconds(), 0);
});
test('cron: fixed minute and hour', async () => {
  assert.equal(await NR('30 14 * * *', '2024-01-01T14:30:00.000Z'), '2024-01-02T14:30:00.000Z');
  assert.equal(await NR('30 14 * * *', '2024-01-01T14:29:59.999Z'), '2024-01-01T14:30:00.000Z');
  assert.equal(await NR('30 14 * * *', '2024-01-01T14:30:00.001Z'), '2024-01-02T14:30:00.000Z');
  assert.equal(await NR('30 14 * * *', '2024-01-01T15:00:00Z'), '2024-01-02T14:30:00.000Z');
  assert.equal(await NR('0 0 * * *', '2024-01-01T00:00:00Z'), '2024-01-02T00:00:00.000Z');
  assert.equal(await NR('  0   0  *  *  * ', '2024-01-01T00:00:00Z'), '2024-01-02T00:00:00.000Z');
  assert.equal(await NR('05 04 * * *', '2024-01-01T00:00:00Z'), '2024-01-01T04:05:00.000Z');
  assert.equal(await NR('59 23 * * *', '2024-01-01T00:00:00Z'), '2024-01-01T23:59:00.000Z');
  assert.equal(await NR('0 * * * *', '2024-01-01T10:00:00Z'), '2024-01-01T11:00:00.000Z');
  assert.equal(await NR('15 * * * *', '2024-01-01T10:20:00Z'), '2024-01-01T11:15:00.000Z');
});
test('cron: lists, ranges and steps in minutes and hours', async () => {
  assert.equal(await NR('*/15 * * * *', '2024-01-01T10:07:30Z'), '2024-01-01T10:15:00.000Z');
  assert.equal(await NR('*/15 * * * *', '2024-01-01T10:45:00Z'), '2024-01-01T11:00:00.000Z');
  assert.equal(await NR('10-40/10 * * * *', '2024-01-01T10:00:00Z'), '2024-01-01T10:10:00.000Z');
  assert.equal(await NR('10-40/10 * * * *', '2024-01-01T10:40:00Z'), '2024-01-01T11:10:00.000Z');
  assert.equal(await NR('10-40/10 * * * *', '2024-01-01T10:25:00Z'), '2024-01-01T10:30:00.000Z');
  assert.equal(await NR('1,15 * * * *', '2024-01-01T10:00:00Z'), '2024-01-01T10:01:00.000Z');
  assert.equal(await NR('1,15 * * * *', '2024-01-01T10:01:00Z'), '2024-01-01T10:15:00.000Z');
  assert.equal(await NR('1,15 * * * *', '2024-01-01T10:15:00Z'), '2024-01-01T11:01:00.000Z');
  assert.equal(await NR('0 9-17/4 * * *', '2024-01-01T09:00:00Z'), '2024-01-01T13:00:00.000Z');
  assert.equal(await NR('0 9-17/4 * * *', '2024-01-01T17:00:00Z'), '2024-01-02T09:00:00.000Z');
  assert.equal(await NR('0,30 8-10 * * *', '2024-01-01T10:30:00Z'), '2024-01-02T08:00:00.000Z');
  assert.equal(await NR('0,30 8-10 * * *', '2024-01-01T08:00:00Z'), '2024-01-01T08:30:00.000Z');
  assert.equal(await NR('*/7 * * * *', '2024-01-01T10:56:00Z'), '2024-01-01T11:00:00.000Z');
  assert.equal(await NR('*/7 * * * *', '2024-01-01T10:50:00Z'), '2024-01-01T10:56:00.000Z');
  assert.equal(await NR('0 */6 * * *', '2024-01-01T12:00:00Z'), '2024-01-01T18:00:00.000Z');
  assert.equal(await NR('0 */6 * * *', '2024-01-01T18:00:00Z'), '2024-01-02T00:00:00.000Z');
  assert.equal(await NR('*/59 * * * *', '2024-01-01T10:00:00Z'), '2024-01-01T10:59:00.000Z');
  assert.equal(await NR('*/100 * * * *', '2024-01-01T10:30:00Z'), '2024-01-01T11:00:00.000Z');
  assert.equal(await NR('0-59/20 * * * *', '2024-01-01T10:20:00Z'), '2024-01-01T10:40:00.000Z');
  assert.equal(await NR('0 1-10/3 * * *', '2024-01-01T04:00:00Z'), '2024-01-01T07:00:00.000Z');
  assert.equal(await NR('0-59 0-23 1-31 1-12 0-6', '2024-01-01T10:07:30Z'), '2024-01-01T10:08:00.000Z');
});
test('cron: day of month and month', async () => {
  assert.equal(await NR('0 0 1 * *', '2024-01-15T10:00:00Z'), '2024-02-01T00:00:00.000Z');
  assert.equal(await NR('0 0 31 * *', '2024-04-01T00:00:00Z'), '2024-05-31T00:00:00.000Z');
  assert.equal(await NR('0 0 15 6 *', '2024-06-15T00:00:00Z'), '2025-06-15T00:00:00.000Z');
  assert.equal(await NR('0 0 1 1 *', '2024-12-31T23:59:30Z'), '2025-01-01T00:00:00.000Z');
  assert.equal(await NR('30 23 31 12 *', '2024-12-31T23:30:00Z'), '2025-12-31T23:30:00.000Z');
  assert.equal(await NR('0 0 */2 * *', '2024-01-31T00:00:00Z'), '2024-02-01T00:00:00.000Z');
  assert.equal(await NR('0 0 */2 * *', '2024-01-02T00:00:00Z'), '2024-01-03T00:00:00.000Z');
  assert.equal(await NR('0 0 1-3 2,4 *', '2024-02-03T00:00:00Z'), '2024-04-01T00:00:00.000Z');
  assert.equal(await NR('0 0 1 */5 *', '2024-01-01T00:00:00Z'), '2024-06-01T00:00:00.000Z');
  assert.equal(await NR('0 0 1 */5 *', '2024-11-01T00:00:00Z'), '2025-01-01T00:00:00.000Z');
  assert.equal(await NR('15 10 10 10 *', '2024-10-10T10:15:00Z'), '2025-10-10T10:15:00.000Z');
  assert.equal(await NR('* * * 3 *', '2024-01-15T10:00:00Z'), '2024-03-01T00:00:00.000Z');
  assert.equal(await NR('* * * 3 *', '2024-03-31T23:59:00Z'), '2025-03-01T00:00:00.000Z');
});
test('cron: day of week', async () => {
  assert.equal(await NR('0 9 * * 1', '2024-01-03T12:00:00Z'), '2024-01-08T09:00:00.000Z');
  assert.equal(await NR('0 9 * * 1', '2024-01-01T09:00:00Z'), '2024-01-08T09:00:00.000Z');
  assert.equal(await NR('0 9 * * 1', '2024-01-01T08:59:00Z'), '2024-01-01T09:00:00.000Z');
  assert.equal(await NR('0 0 * * 0', '2024-01-01T00:00:00Z'), '2024-01-07T00:00:00.000Z');
  assert.equal(await NR('0 0 * * 6', '2024-01-01T00:00:00Z'), '2024-01-06T00:00:00.000Z');
  assert.equal(await NR('0 0 * * 1-5', '2024-01-05T00:00:00Z'), '2024-01-08T00:00:00.000Z');
  assert.equal(await NR('0 0 * * 1,3', '2024-01-01T00:00:00Z'), '2024-01-03T00:00:00.000Z');
  assert.equal(await NR('0 0 * * */2', '2024-01-01T00:00:00Z'), '2024-01-02T00:00:00.000Z');
  assert.equal(await NR('30 8 * * 1-5', '2024-01-06T00:00:00Z'), '2024-01-08T08:30:00.000Z');
  assert.equal(await NR('0 0 * 2 1', '2024-01-01T00:00:00Z'), '2024-02-05T00:00:00.000Z');
  assert.equal(await NR('0 0 * * 5', '2024-01-01T00:00:00Z'), '2024-01-05T00:00:00.000Z');
  assert.equal(await NR('0 0 13 * *', '2024-01-01T00:00:00Z'), '2024-01-13T00:00:00.000Z');
});
test('cron: day of month and day of week together mean either', async () => {
  assert.equal(await NR('0 12 13 * 5', '2024-01-01T00:00:00Z'), '2024-01-05T12:00:00.000Z');
  assert.equal(await NR('0 12 13 * 5', '2024-01-05T12:00:00Z'), '2024-01-12T12:00:00.000Z');
  assert.equal(await NR('0 12 13 * 5', '2024-01-12T12:00:00Z'), '2024-01-13T12:00:00.000Z');
  assert.equal(await NR('0 0 1 * 1', '2024-02-01T00:00:00Z'), '2024-02-05T00:00:00.000Z');
  assert.equal(await NR('0 0 1 * 1', '2024-01-02T00:00:00Z'), '2024-01-08T00:00:00.000Z');
  assert.equal(await NR('0 0 */2 * 1', '2024-01-02T00:00:00Z'), '2024-01-03T00:00:00.000Z');
  assert.equal(await NR('0 0 */2 * 1', '2024-01-07T00:00:00Z'), '2024-01-08T00:00:00.000Z');
  assert.equal(await NR('0 0 */2 * *', '2024-01-07T00:00:00Z'), '2024-01-09T00:00:00.000Z');
  assert.equal(await NR('0 0 13 3 5', '2024-02-20T00:00:00Z'), '2024-03-01T00:00:00.000Z');
  assert.equal(await NR('0 0 13 3 5', '2024-03-14T00:00:00Z'), '2024-03-15T00:00:00.000Z');
  assert.equal(await NR('0 0 30 2 1', '2024-01-01T00:00:00Z'), '2024-02-05T00:00:00.000Z');
});
test('cron: leap days, long searches and nothing within eight years', async () => {
  const { nextRun } = await load('src/cron.mjs');
  assert.equal(await NR('0 0 29 2 *', '2025-03-01T00:00:00Z'), '2028-02-29T00:00:00.000Z');
  assert.equal(await NR('0 0 29 2 *', '2024-02-29T00:00:00Z'), '2028-02-29T00:00:00.000Z');
  assert.equal(await NR('0 0 29 2 *', '2096-03-01T00:00:00Z'), '2104-02-29T00:00:00.000Z');
  assert.equal(await NR('59 23 31 12 *', '2024-12-31T23:59:00Z'), '2025-12-31T23:59:00.000Z');
  for (const expression of ['0 0 30 2 *', '0 0 31 2 *', '0 0 31 4,6,9,11 *', '30 12 30-31 2 *'])
    assert.throws(() => nextRun(expression, new Date('2024-01-01T00:00:00Z')), RangeError, expression);
});
test('cron: RangeError for expressions it cannot read', async () => {
  const { nextRun } = await load('src/cron.mjs');
  const from = new Date('2024-01-01T00:00:00Z');
  const bad = [
    '', '   ', '*', '* * * *', '* * * * * *', '0 0 * *',
    '60 * * * *', '* 24 * * *', '* * 0 * *', '* * 32 * *', '* * * 0 *', '* * * 13 *', '* * * * 7', '-1 * * * *', '0-60 * * * *', '* 0-24 * * *', '* * 1-32 * *', '* * * * 5-7',
    '*/0 * * * *', '5/10 * * * *', '0/5 * * * *', '5-3 * * * *', '1,,2 * * * *', ',1 * * * *', '1, * * * *', 'a * * * *', '1-2-3 * * * *', '*/ * * * *', '*/-1 * * * *', '? * * * *',
    '* * * JAN *', '* * * * MON', '1.5 * * * *', '+1 * * * *', '** * * * *', '*/15/2 * * * *', '1- * * * *', '- * * * *', '*/1.5 * * * *', 'L * * * *', '1-5/ * * * *',
  ];
  for (const expression of bad) assert.throws(() => nextRun(expression, from), RangeError, JSON.stringify(expression));
  for (const expression of [5, null, undefined, ['* * * * *']]) assert.throws(() => nextRun(expression, from), RangeError);
  for (const value of ['2024-01-01', 5, null, undefined]) assert.throws(() => nextRun('* * * * *', value), TypeError);
  assert.throws(() => nextRun('* * * * *', new Date(NaN)), RangeError);
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
