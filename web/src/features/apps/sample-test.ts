// Script test for the builder's made-up answer (sample.ts): each kind of answer field in its shape, a card field with
// its card's example.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/apps/sample-test.ts && node dist/dev/sample-test.js
import assert from 'node:assert/strict';
import { cardExample } from '../../../../shared/app-cards.ts';
import { answerUi } from '../../../../shared/answer-ui/index.ts';
import { sampleResult } from './sample';

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

test('a made-up answer: each field in its shape, a card with its card’s example', () => {
  const r = sampleResult(
    [
      { id: 'pick', label: 'Pick', type: 'text' },
      { id: 'n', label: 'N', type: 'number' },
      { id: 'compare', label: 'Compare', type: 'ui', ui: 'comparison' },
      { id: 'trip', label: 'Trip', type: 'ui', ui: 'itinerary' },
    ],
    {},
    cardExample,
  );
  assert.equal(r.pick, 'Pick 1');
  assert.equal(r.n, 10);
  assert.deepEqual(r.compare, answerUi('comparison')!.example);
  assert.deepEqual(r.trip, answerUi('itinerary')!.example);
  assert.notEqual(r.compare, answerUi('comparison')!.example, 'a copy, so the preview cannot change the catalog');
});

test('before the catalog has loaded (or for a card it lacks), a card with only its heading for a title', () => {
  assert.deepEqual(sampleResult([{ id: 'c', label: 'Side by side', type: 'ui', ui: 'comparison' }]), { c: { title: 'Side by side' } });
  assert.deepEqual(sampleResult([{ id: 'c', label: 'X', type: 'ui', ui: 'nope' }], {}, cardExample), { c: { title: 'X' } });
});

console.log(`\n${passed} of ${total} passed`);
