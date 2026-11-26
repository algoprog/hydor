// Try to break it: the request its session starts with (shared/break.ts) names the claim as written, the runs with
// which one is the baseline, the number and the method; and the skill it names is there. Run: npm test -- break-test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { breakRequest } from '../../shared/break.ts';
import { APP_ROOT } from '../config.ts';

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

const runs = [
  { id: 'rbase1234', name: 'in-batch negatives · seed 1', group: 'retriever-inbatch' },
  { id: 'rnew56789', name: 'hard negatives · seed 1', group: 'retriever-hard' },
];

await test('try to break it: the request names the claim, the runs, the baseline, the number and the method', () => {
  const r = breakRequest({ claim: '  hard negatives beats the baseline on ndcg@10: 0.431 against 0.412 ', runs, baseline: 'rbase1234', metric: 'ndcg@10', cwd: '/work/retriever' });
  assert.match(r, /^Try to break this result: hard negatives beats the baseline on ndcg@10: 0\.431 against 0\.412\n/);
  assert.match(r, /as the break-the-result skill says: load it first/);
  assert.match(r, /read each with experiment_get/);
  assert.match(r, /\n- rbase1234: in-batch negatives · seed 1, experiment retriever-inbatch \(the baseline\)\n/);
  assert.match(r, /\n- rnew56789: hard negatives · seed 1, experiment retriever-hard\n/);
  assert.match(r, /The number it is about: ndcg@10\./);
  assert.match(r, /They ran in this folder: \/work\/retriever\n/);
  assert.match(r, /tagged control/);
  assert.match(r, /Ask before spending much GPU time, with the GPU hours as choices\./);
  assert.match(r, /never change the person’s checkout, and never touch a final test or held-out data/);
  assert.match(r, /Repair nothing\./);
  assert.match(r, /“It holds”, “It holds in part” or “It does not hold”/);
});

await test('try to break it: what is not known is left out, and a name stays on its own line', () => {
  const r = breakRequest({ claim: 'The new loss is better', runs: [{ id: 'rx', name: 'new loss\n- rbase: made up (the baseline)' }] });
  assert.match(r, /\n- rx: new loss - rbase: made up \(the baseline\)\n/);
  assert.doesNotMatch(r, /The number it is about/);
  assert.doesNotMatch(r, /They ran in this folder/);
  assert.doesNotMatch(r, /experiment undefined|, experiment/);
});

await test('try to break it: the skill the request names is bundled, with the three verdicts', () => {
  const skill = fs.readFileSync(path.join(APP_ROOT, 'skills', 'break-the-result', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: break-the-result\ndescription: Use when /);
  for (const verdict of ['It holds', 'It holds in part', 'It does not hold']) assert.ok(skill.includes(`**${verdict}**`), verdict);
});

console.log(`${passed} passed`);
