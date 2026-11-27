// Script tests for oeis_lookup (oeis.ts), with the OEIS's answers stood in for: the records are real ones (A000108,
// A000142, A155456), shortened. Matches, where the given terms begin, signs, big integers, a full page and its count,
// nothing and too much, what cannot be looked up, a service that does not answer, and the tool agents and steps get
// (not a confidential session). No network is asked. With LIVE=1 the OEIS itself is asked for the Catalan numbers.
// Build and run with a scratch data folder (docs/development.md):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/research/oeis-test.ts, then node dist/dev/oeis-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STEP_ONLY_TOOLS, STEP_TOOLS } from '../../shared/app-manifest.ts';
import { forgetAll } from '../apps/sturdy.ts';
import { confidential } from '../confidential/index.ts';
import { vaultTables } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import { registerFeatures, runTools, spawnAdditions } from '../features/registry.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { research } from './index.ts';
import { oeisDeps, oeisLookup, readTerms, setOeisFetchForTests, type OeisDeps } from './oeis.ts';

if (!process.env.DATA_DIR || !path.resolve(process.env.DATA_DIR).startsWith(os.tmpdir())) {
  console.error('Run with DATA_DIR set to a scratch folder, so nothing touches real data.');
  process.exit(2);
}
process.env.HYDOR_EMBED = 'off';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-oeis-test-'));
const db = openDb(path.join(tmp, 'test.db'));
vaultTables(db);
const deps = { db, app: { get: () => {}, post: () => {} } } as unknown as Deps;
registerFeatures([confidential, research], deps);
const ctx: RunCtx = { runId: 'r1', key: 'claude:oeis', agent: 'claude', cwd: tmp, deps };

const tests: [string, () => Promise<void> | void][] = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);
let passed = 0;

// ---- recorded answers --------------------------------------------------------------------------------------------

const CATALAN = {
  number: 108,
  id: 'M1459 N0577',
  data: '1,1,2,5,14,42,132,429,1430,4862,16796,58786,208012,742900,2674440,9694845,35357670,129644790,477638700,1767263190,6564120420,24466267020,91482563640,343059613650',
  name: 'Catalan numbers: C(n) = binomial(2n,n)/(n+1) = (2n)!/(n!(n+1)!).',
  formula: ['a(n) = binomial(2*n, n)/(n+1) = (2*n)!/(n!*(n+1)!) = A000984(n)/(n+1).', 'Recurrence: a(n) = 2*(2*n-1)*a(n-1)/(n+1) with a(0) = 1.', 'Recurrence: a(n) = Sum_{k=0..n-1} a(k)a(n-1-k).'],
  keyword: 'core,nonn,easy,eigen,nice',
  offset: '0,3',
};
const FACTORIAL = {
  number: 142,
  id: 'M1675 N0659',
  data: '1,1,2,6,24,120,720,5040,40320,362880,3628800,39916800,479001600,6227020800,87178291200,1307674368000,20922789888000,355687428096000,6402373705728000,121645100408832000,2432902008176640000,51090942171709440000,1124000727777607680000',
  name: 'Factorial numbers: n! = 1*2*3*4*...*n (order of symmetric group S_n, number of permutations of n letters).',
  formula: ['Exp(x) = Sum_{m >= 0} x^m/m!.'],
  keyword: 'core,easy,nonn,nice',
  offset: '0,3',
};
/** One with signs, and with no formula lines. */
const SIGNED = {
  number: 155456,
  data: '-1,-1,1,-2,6,-24,120,-720,5040,-40320,362880,-3628800',
  name: 'Write (1+1/x)*log(1+x) = Sum c(n)*x^n; then a(n) = (n+1)!*c(n).',
  keyword: 'sign,easy',
  offset: '0,4',
};

const textOf = (said: string) => `# Greetings from The On-Line Encyclopedia of Integer Sequences! http://oeis.org/\n\nSearch: seq:1,1,2\n${said}\n`;

let asked: string[] = [];
/** The OEIS: its JSON answer (`null` for nothing) and what its text form says. */
function stand(json: unknown, said: string | Error = 'No results.'): OeisDeps {
  asked = [];
  return {
    fetch: async (url) => {
      asked.push(url);
      if (url.endsWith('&fmt=json')) {
        if (json instanceof Error) throw json;
        return typeof json === 'string' ? json : JSON.stringify(json, null, '\t');
      }
      if (said instanceof Error) throw said;
      return textOf(said);
    },
  };
}

// ---- the tests ---------------------------------------------------------------------------------------------------

test('matches: the A-number and its page, the offset, the first terms, two formula lines, keywords; one request', async () => {
  const r = await oeisLookup({ terms: [1, 1, 2, 5, 14, 42, 132] }, stand([CATALAN]));
  assert.deepEqual(asked, ['https://oeis.org/search?q=1,1,2,5,14,42,132&fmt=json']);
  const [m] = r.matches;
  assert.deepEqual([m.id, m.url, m.name, m.offset, m.matchedFrom], ['A000108', 'https://oeis.org/A000108', CATALAN.name, 0, 0]);
  assert.equal(m.terms.length, 20);
  assert.deepEqual(m.terms.slice(0, 7), [1, 1, 2, 5, 14, 42, 132]);
  assert.deepEqual(m.formula, CATALAN.formula.slice(0, 2));
  assert.deepEqual(m.keywords, ['core', 'nonn', 'easy', 'eigen', 'nice']);
  assert.ok(!('signsDiffer' in m));
  assert.match(r.note, /^One sequence matches in the OEIS\. A match on few terms is only a lead, not a fact: compute more terms/);
  const headed = { ...CATALAN, formula: ['From _A. Author_, Jun 11 2004: (Start)', ...CATALAN.formula] };
  assert.deepEqual((await oeisLookup({ terms: [1, 1, 2, 5] }, stand([headed]))).matches[0].formula, CATALAN.formula.slice(0, 2));
});

test('matchedFrom: where the given terms begin among those listed; signs that differ are said', async () => {
  assert.equal((await oeisLookup({ terms: [5, 14, 42, 132] }, stand([CATALAN]))).matches[0].matchedFrom, 3);
  const r = await oeisLookup({ terms: [1, -2, 6, -24] }, stand([SIGNED, FACTORIAL]));
  assert.deepEqual(r.matches.map((m) => [m.id, m.matchedFrom, m.signsDiffer]), [['A155456', 2, undefined], ['A000142', 1, true]]);
  assert.ok(!('formula' in r.matches[0]), 'an entry with no formula gives none');
  assert.match(r.note, /^2 sequences match in the OEIS\. .*only the absolute values agree/);
  assert.equal(asked[0], 'https://oeis.org/search?q=1,-2,6,-24&fmt=json');
});

test('big integers stay exact: given as text, compared as text, listed as text when too large for a number', async () => {
  const big = ['121645100408832000', '2432902008176640000', '51090942171709440000', '1124000727777607680000'];
  const r = await oeisLookup({ terms: big }, stand([FACTORIAL]));
  assert.equal(asked[0], `https://oeis.org/search?q=${big.join(',')}&fmt=json`);
  assert.equal(r.matches[0].matchedFrom, 19);
  assert.deepEqual(r.matches[0].terms.slice(17), [355687428096000, 6402373705728000, '121645100408832000']);
  assert.throws(() => readTerms([1, 2, 3, 2432902008176640000]), /too large to be exact as a number: give it as text/);
  assert.deepEqual(readTerms(['007', '-3', '+4', '−5']), ['7', '-3', '4', '-5']);
});

test('a full page: how many matched in all is asked of the text form, and five are given', async () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({ ...CATALAN, number: 108 + i }));
  const r = await oeisLookup({ terms: [1, 1, 2, 5] }, stand(ten, 'Showing 1-10 of 37'));
  assert.equal(r.matches.length, 5);
  assert.equal(asked[1], 'https://oeis.org/search?q=1,1,2,5&fmt=text');
  assert.match(r.note, /^37 sequences match in the OEIS; the first 5 are given\./);
  assert.match((await oeisLookup({ terms: [1, 1, 2, 5] }, stand(ten, new Error('HTTP 503')))).note, /^At least 10 sequences match in the OEIS; the first 5 are given\./);
});

test('words and A-numbers: words as they are, an A-number its own entry alone', async () => {
  const r = await oeisLookup({ query: ' Catalan  numbers ' }, stand([CATALAN]));
  assert.equal(asked[0], 'https://oeis.org/search?q=Catalan%20numbers&fmt=json');
  assert.ok(!('matchedFrom' in r.matches[0]));
  assert.match(r.note, /A match by words is only a lead/);
  const one = await oeisLookup({ query: 'a000108' }, stand([CATALAN]));
  assert.equal(asked[0], 'https://oeis.org/search?q=id%3AA000108&fmt=json');
  assert.equal(one.note, 'One sequence matches in the OEIS.');
});

test('no match, and too much: said apart, and no match is not taken for new', async () => {
  const none = await oeisLookup({ terms: [1, 1, 2, 5, 987654321] }, stand('null'));
  assert.deepEqual(none.matches, []);
  assert.match(none.note, /^Nothing in the OEIS matches these terms\. Try them without the first one or two.*does not make a sequence new/);
  assert.match((await oeisLookup({ query: 'zzzqqq' }, stand('null'))).note, /^Nothing in the OEIS matches these words/);
  assert.equal((await oeisLookup({ query: 'A999999' }, stand('null'))).note, 'The OEIS has no sequence A999999.');
  assert.match((await oeisLookup({ query: 'number' }, stand('null', 'Too many results. Please narrow search.'))).note, /^Too many sequences match to be listed/);
  assert.match((await oeisLookup({ query: 'number' }, stand('null', new Error('HTTP 503')))).note, /did not say whether nothing matches or too much does/);
});

test('what cannot be looked up is refused in words, and nothing is asked', async () => {
  const d = stand([CATALAN]);
  for (const [input, why] of [
    [{}, /Give terms \(4 to 40 whole numbers, in order\) or query/],
    [{ query: '   ' }, /Give terms/],
    [{ terms: [] }, /Give terms/],
    [{ terms: [1, 1, 2, 5], query: 'Catalan' }, /not both/],
    [{ terms: [1, 2, 3] }, /at least 4 terms/],
    [{ terms: Array.from({ length: 41 }, (_, i) => i) }, /at most 40 terms/],
    [{ terms: [1, 2.5, 3, 4] }, /whole numbers only, not 2\.5/],
    [{ terms: [1, 'two', 3, 4] }, /whole numbers only, not “two”/],
    [{ terms: 7 }, /a list of whole numbers/],
  ] as [Record<string, unknown>, RegExp][])
    await assert.rejects(() => oeisLookup(input, d), why, JSON.stringify(input));
  assert.deepEqual(asked, []);
  // A step may give its terms as text.
  assert.deepEqual(readTerms('[1, 1, 2, 5]'), ['1', '1', '2', '5']);
  assert.deepEqual(readTerms('1 1; 2,5'), ['1', '1', '2', '5']);
});

test('a service that does not answer, or answers something else, is said in plain words', async () => {
  await assert.rejects(() => oeisLookup({ terms: [1, 1, 2, 5] }, stand(new Error('HTTP 503'))), /^Error: The OEIS \(oeis\.org\) did not answer \(HTTP 503\)\. Nothing was looked up: try again later, and do not read this as no match\.$/);
  await assert.rejects(() => oeisLookup({ terms: [1, 1, 2, 5] }, stand('<!DOCTYPE html><title>Just a moment</title>')), /could not be read\. Nothing was looked up/);
  const stop = new AbortController();
  await assert.rejects(() => oeisLookup({ terms: [1, 1, 2, 5] }, { signal: stop.signal, fetch: async () => (stop.abort(), Promise.reject(new Error('Stopped'))) }), /^Error: Stopped$/);
});

test('the tool: every agent has it with a note, apps’ steps too, a confidential session does not', async () => {
  const tool = runTools(ctx).find((t) => t.name === 'oeis_lookup')!;
  assert.match(tool.description, /before calling a sequence new/);
  assert.deepEqual(Object.keys((tool.inputSchema as { properties: object }).properties), ['terms', 'query']);
  assert.equal(tool.annotations?.readOnlyHint, true);
  assert.ok(runTools({ ...ctx, step: true }).some((t) => t.name === 'oeis_lookup'));
  assert.ok(STEP_TOOLS.includes('oeis_lookup') && !STEP_ONLY_TOOLS.includes('oeis_lookup'));
  db.prepare('insert or ignore into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run('acp:closed', 'acp', Date.now(), Date.now());
  setSessionExtra(db, 'acp:closed', { confidential: true });
  assert.ok(!runTools({ ...ctx, key: 'acp:closed', agent: 'acp' }).some((t) => t.name === 'oeis_lookup'));
  const given = await spawnAdditions({ agent: 'claude', key: 'claude:oeis', cwd: tmp, runId: 'r', resume: false, extra: {} });
  assert.match(given.instructions.join('\n'), /Before you call a sequence of integers new.*look them up with oeis_lookup.*only a lead/);
  setOeisFetchForTests(stand([CATALAN]).fetch);
  const out = JSON.parse((await tool.run({ terms: [1, 1, 2, 5] }, ctx)) as string);
  assert.equal(out.matches[0].id, 'A000108');
  setOeisFetchForTests(null);
});

if (process.env.LIVE === '1')
  test('LIVE: the OEIS itself: 1, 1, 2, 5, 14, 42, 132 are the Catalan numbers', async () => {
    forgetAll();
    const r = await oeisLookup({ terms: [1, 1, 2, 5, 14, 42, 132] }, oeisDeps(ctx));
    console.log(JSON.stringify(r, null, 1));
    assert.equal(r.matches[0].id, 'A000108');
    assert.equal(r.matches[0].matchedFrom, 0);
    assert.match(r.note, /^\d+ sequences match in the OEIS/);
  });

const only = process.env.LIVE === '1' ? tests.filter(([name]) => /^LIVE/.test(name)) : tests;
for (const [name, fn] of only) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${only.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
