// Script test for What changes each time? (requestParts.ts): a question's words fixed again, other words asked each time.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/apps/requestParts-test.ts && node dist/dev/requestParts-test.js
import assert from 'node:assert/strict';
import { cleanRecipe } from '../../../../shared/apps.ts';
import { askEachTime, fixWords, type DraftPart } from './requestParts';

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

const recipe = cleanRecipe({
  name: 'Compare',
  fields: [
    { id: 'first', label: 'First', type: 'text', required: true },
    { id: 'use', label: 'For what', type: 'text' },
  ],
  prompt: 'Compare the {{first}} and the Kobo Clara BW{{#use}} for {{use}}{{/use}}{{^use}} in general{{/use}}, with prices.',
  answer: [{ id: 'pick', label: 'Pick', type: 'text' }],
  examples: [{ name: 'From the session', inputs: { first: 'Kindle Paperwhite', use: 'reading in bed' } }],
});
const parts: DraftPart[] = [{ text: 'Compare the ' }, { field: 'first', text: 'Kindle Paperwhite' }, { text: ' and the Kobo Clara BW for ' }, { field: 'use', text: 'reading in bed' }, { text: ', with prices.' }];

test('a chip made fixed words again: its question leaves the form and the example, its words go where the task used it', () => {
  const { recipe: r, parts: p } = fixWords(recipe, parts, 3);
  assert.deepEqual(r.fields.map((f) => f.id), ['first']);
  assert.equal(r.prompt, 'Compare the {{first}} and the Kobo Clara BW for reading in bed, with prices.');
  assert.deepEqual(r.examples![0].inputs, { first: 'Kindle Paperwhite' });
  assert.deepEqual(p, [{ text: 'Compare the ' }, { field: 'first', text: 'Kindle Paperwhite' }, { text: ' and the Kobo Clara BW for reading in bed, with prices.' }]);
  assert.equal(p.map((x) => x.text).join(''), parts.map((x) => x.text).join(''));
});

test('other words asked each time: a new question, its {{id}} in the task where they were, the example given them', () => {
  // " Kobo Clara BW" selected with the space before it: the words alone are asked.
  const done = askEachTime(recipe, parts, 2, 8, 22)!;
  assert.equal(done.id, 'kobo_clara_bw');
  assert.deepEqual(done.recipe.fields.at(-1), { id: 'kobo_clara_bw', label: 'Kobo Clara BW', type: 'text', placeholder: 'Kobo Clara BW' });
  assert.match(done.recipe.prompt, /^Compare the \{\{first\}\} and the \{\{kobo_clara_bw\}\}\{\{#use\}\}/);
  assert.equal(done.recipe.examples![0].inputs.kobo_clara_bw, 'Kobo Clara BW');
  assert.deepEqual(
    done.parts.map((x) => [x.field ?? '', x.text]),
    [
      ['', 'Compare the '],
      ['first', 'Kindle Paperwhite'],
      ['', ' and the '],
      ['kobo_clara_bw', 'Kobo Clara BW'],
      ['', ' for '],
      ['use', 'reading in bed'],
      ['', ', with prices.'],
    ],
  );
  // Words the task says another way: the question goes after it.
  const other = askEachTime(recipe, [{ text: 'Use euros' }], 0, 4, 9)!;
  assert.match(other.recipe.prompt, /\n\nIn place of “euros”: \{\{euros\}\}$/);
  // Nothing selected, or a chip: nothing to do.
  assert.equal(askEachTime(recipe, parts, 2, 0, 1), null);
  assert.equal(askEachTime(recipe, parts, 1, 0, 4), null);
});

test('in an app with steps, the words a step says take the new question, its ids and tools stay', () => {
  const flowRecipe = cleanRecipe({ name: 'F', fields: [], answer: [], flow: { steps: [{ id: 'search', do: 'tool', tool: 'web_search', with: { query: 'Kobo Clara BW review' } }, { id: 'sum', do: 'model', instructions: 'Sum up what {{search.text}} says of the Kobo Clara BW' }] } });
  const done = askEachTime(flowRecipe, [{ text: 'Review the Kobo Clara BW' }], 0, 11, 24)!;
  const [s1, s2] = done.recipe.flow!.steps as any[];
  assert.deepEqual([s1.id, s1.tool, s1.with.query], ['search', 'web_search', '{{kobo_clara_bw}} review']);
  assert.equal(s2.instructions, 'Sum up what {{search.text}} says of the {{kobo_clara_bw}}');
});

console.log(`\n${passed} of ${total} passed`);
