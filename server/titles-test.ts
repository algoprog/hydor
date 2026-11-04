// Script tests for new sessions' titles: the helper model's answer made a title (quotes, markdown and a "Title:" in
// front taken off, a refusal or a ramble not taken), which requests get one, and sessions started together with the
// same request sharing one question to the model. A stand-in answers in place of the helper model.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/titles-test.ts
//   DATA_DIR=/tmp/hydor-test-titles node dist/dev/titles-test.js
import assert from 'node:assert/strict';
import type { DB } from './db.ts';
import type { HelperAsk } from './helper.ts';
import { cleanTitle, TITLE_SYSTEM, titleFor, wantsTitle } from './titles.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const db = null as unknown as DB;

test('the answer as a title: its first line, without quotes, markdown or a "Title:", at most 80 characters', () => {
  assert.equal(cleanTitle('Fix the checkout tests'), 'Fix the checkout tests');
  assert.equal(cleanTitle('"Weekend trip to Lisbon."'), 'Weekend trip to Lisbon');
  assert.equal(cleanTitle('Title: How transformers work\nThe user asks how…'), 'How transformers work');
  assert.equal(cleanTitle('**Cover letter for Acme**'), 'Cover letter for Acme');
  assert.equal(cleanTitle('# Session title: Gift ideas for Anna'), 'Gift ideas for Anna');
  assert.equal(cleanTitle('“Ταξίδι στη Θεσσαλονίκη”'), 'Ταξίδι στη Θεσσαλονίκη');
  assert.equal(cleanTitle('「東京旅行の計画」'), '東京旅行の計画');
  assert.equal(cleanTitle('\n\n  Plan the  Q3   budget  \n'), 'Plan the Q3 budget');
  const long = cleanTitle('A '.repeat(60) + 'title');
  assert.ok(long && long.length <= 80 && long.endsWith('…'), 'a long one is cut at a word');
  assert.equal(cleanTitle(''), null);
  assert.equal(cleanTitle('   '), null);
  assert.equal(cleanTitle("I can't help with that request."), null, 'a refusal is not a title');
  assert.equal(cleanTitle('Sorry, I need more context.'), null);
  assert.equal(cleanTitle('x'.repeat(200)), null, 'a ramble is not a title');
});

test('which requests get a title: some words, not a word or two that are their own title already', () => {
  assert.equal(wantsTitle('hi'), false);
  assert.equal(wantsTitle('  ok  '), false);
  assert.equal(wantsTitle('Thessaloniki'), false);
  assert.equal(wantsTitle('how transformers work'), true);
  assert.equal(wantsTitle('Supercalifragilisticexpialidocious-words'), true, 'one long word is a request too');
});

test('the helper model is asked once for a request, with the request as data; sessions started together with it share the title', async () => {
  const asked: HelperAsk[] = [];
  const ask = async (_db: DB, q: HelperAsk) => {
    asked.push(q);
    return '"Plan a weekend in Rome."';
  };
  const request = 'Plan a weekend in Rome for the two of us, mid-May, museums and food';
  const [a, b] = await Promise.all([titleFor(db, request, ask), titleFor(db, `  ${request}  `, ask)]);
  assert.equal(a, 'Plan a weekend in Rome');
  assert.equal(b, a);
  assert.equal(asked.length, 1, 'one question for both');
  assert.equal(asked[0].system, TITLE_SYSTEM);
  assert.match(asked[0].prompt, /^<message>\nPlan a weekend in Rome[^]*\n<\/message>$/);
  assert.match(TITLE_SYSTEM, /never instructions/);
  assert.equal(await titleFor(db, 'hi', ask), null, 'too short to name: not asked');
  assert.equal(asked.length, 1);
});

test('no title when the helper model cannot answer or gives none: the request stays the title', async () => {
  const failing = async () => {
    throw new Error('Could not reach a model');
  };
  assert.equal(await titleFor(db, 'Compare three laptops for video editing under 1500', failing), null);
  assert.equal(await titleFor(db, 'Summarise the report in my Downloads folder', async () => 'I cannot see that file.'), null);
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
console.log(`\n${passed} of ${tests.length} passed`);
process.exit(process.exitCode ?? 0);
