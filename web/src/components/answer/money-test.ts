// Script test for money in a card's data (money.ts): \$ before an amount shows as $, code and LaTeX fields keep theirs.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/components/answer/money-test.ts && node dist/dev/money-test.js
import assert from 'node:assert/strict';
import { unescapeMoney } from './money';

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
};

test('a choice card: \\$ before an amount reads as $, in labels, notes and nested items', () => {
  const card = {
    question: 'What cap should the run have?',
    options: [
      { label: 'Raise the cap to \\$142', note: 'About \\$2–7 more than the $135 cap.', value: '≈ \\$137–141' },
      { label: 'Keep the \\$135 cap', value: '\\$135', tags: ['Within \\$.50', 'US\\$ 5'] },
    ],
  };
  assert.deepEqual(unescapeMoney(card), {
    question: 'What cap should the run have?',
    options: [
      { label: 'Raise the cap to $142', note: 'About $2–7 more than the $135 cap.', value: '≈ $137–141' },
      { label: 'Keep the $135 cap', value: '$135', tags: ['Within $.50', 'US$ 5'] },
    ],
  });
});

test('code, commands and LaTeX keep \\$ as written', () => {
  const card = { title: 'Rename \\$5 files', code: 'echo "\\$1"', commands: [{ cmd: "sed 's/a/\\$2/'", note: 'x' }], formula: '\\$5 + x', steps: [{ code: 'a=\\$9' }] };
  const out = unescapeMoney(card);
  assert.equal(out.title, 'Rename $5 files');
  assert.equal(out.code, card.code);
  assert.equal(out.commands, card.commands);
  assert.equal(out.formula, card.formula);
  assert.equal(out.steps[0].code, 'a=\\$9');
});

test('\\$ not before an amount stays (maths or a literal sign the agent meant)', () => {
  assert.equal(unescapeMoney('cost in \\$ per hour'), 'cost in \\$ per hour');
  assert.equal(unescapeMoney('\\$x$ '), '\\$x$ ');
});

test('nothing to change: the same object back, numbers and nulls untouched', () => {
  const card = { a: 'plain $5', b: [1, null, { c: true }] };
  assert.equal(unescapeMoney(card), card);
});

console.log(`${passed}/${total} passed`);
