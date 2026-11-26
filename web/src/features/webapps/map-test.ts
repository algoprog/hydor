// Script test for what the app's page decides (map.ts): the stage an app is at and the rows of the map, the next step and its message,
// the decisions of a stage, the lead of the brief, the order of the checks, and what is said before going back. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/webapps/map-test.ts && DATA_DIR=/tmp/hydor-test-map node dist/dev/map-test.js
import assert from 'node:assert/strict';
import { WEBAPP_STAGES, type CheckLine, type WebAppDecision } from '@shared/webapps';
import { briefLead, checkCounts, checkDone, currentStage, decisionsByStage, decisionsFor, fixMessage, goBackSentences, listComplete, nextStep, sortChecks, stageRows } from './map';

// The stage: any case, spaces, and only the six.
assert.deepEqual([...WEBAPP_STAGES], ['brief', 'design', 'build', 'check', 'launch', 'run']);
assert.equal(currentStage('Design'), 'design');
assert.equal(currentStage(' CHECK '), 'check');
assert.equal(currentStage('features'), null, 'there is no Features stage');
assert.equal(currentStage(undefined), null);

// The rows: behind is done, the stage is here, the rest ahead; no stage: none is here.
assert.deepEqual(stageRows('design').map((r) => r.state), ['done', 'here', 'ahead', 'ahead', 'ahead', 'ahead']);
assert.ok(stageRows(undefined).every((r) => r.state === 'ahead'));

// The next step: the stage's own work with its message, for every stage.
for (const s of WEBAPP_STAGES) {
  const n = nextStep(s);
  assert.equal(n.stage, s);
  assert.ok(n.button && n.message && n.sentence.endsWith('.'), s);
}
assert.equal(nextStep('launch').button, 'Launch it');
assert.match(nextStep('design').message!, /small pages of its first screen/);
assert.equal(nextStep(undefined).stage, null);
assert.equal(nextStep(undefined).message, nextStep('brief').message);
// A design picked leaves nothing to ask at Design: the next step is Build's.
const made = (stage: string, shape: string) => [{ at: '2026-11-24', stage, what: 'Chosen.', shape }] as never;
assert.equal(nextStep('design', made('design', 'designs')).stage, 'build');
assert.equal(nextStep('design', made('brief', 'one')).stage, 'design');

// The decisions of a stage, newest last; grouped by stage.
const d = (stage: string, what: string, at = '2026-11-01'): WebAppDecision => ({ at, stage, what });
const decisions = [d('brief', 'A waitlist for a bakery'), d('Design', 'Warm'), d('design', 'Bigger type'), d('build', ''), d('odd', 'Something')];
assert.deepEqual(decisionsFor(decisions, 'design').map((x) => x.what), ['Warm', 'Bigger type']);
assert.deepEqual(decisionsFor(decisions, 'build'), []);
assert.deepEqual(decisionsFor(undefined, 'brief'), []);
assert.deepEqual(decisionsFor(decisions, undefined), []);
assert.deepEqual(Object.keys(decisionsByStage(decisions)).sort(), ['brief', 'design', 'odd']);

// The brief's lead: the paragraph under the first heading; it skips an empty one under a title; cut at a word when long.
assert.equal(briefLead('# Bakery\n\nA waitlist for the bakery.\nSecond line.\n\nOther.'), 'A waitlist for the bakery.\nSecond line.');
assert.equal(briefLead('# Bakery\n\n## What it is\nA waitlist.\n\n## Who\nPeople.'), 'A waitlist.');
assert.equal(briefLead('Just a paragraph.\n\n# Later\nNo.'), 'Just a paragraph.');
assert.equal(briefLead(''), '');
assert.equal(briefLead('# Only a title'), '');
const long = briefLead(`# T\n\n${'word '.repeat(200)}`, 100);
assert.ok(long.endsWith('…') && long.length <= 101 && !long.includes('wor…'), long);

// The checks: failed first, then notes, not run, passed; the order kept inside each group.
const line = (id: string, state: CheckLine['state']): CheckLine => ({ id, state, text: `Line ${id}` });
const lines = [line('a', 'passed'), line('b', 'failed'), line('c', 'note'), line('d', 'passed'), line('e', 'failed'), line('f', 'notRun')];
assert.deepEqual(sortChecks(lines).map((l) => l.id), ['b', 'e', 'c', 'f', 'a', 'd']);
assert.deepEqual(lines.map((l) => l.id), ['a', 'b', 'c', 'd', 'e', 'f'], 'the list is not changed');
assert.deepEqual(checkCounts(lines), { passed: 2, failed: 2, note: 1, notRun: 1 });
assert.equal(fixMessage({ id: 'ready', text: ' It never answered. ' }), 'Fix this check, ready: It never answered. Then run the checks again.');
assert.equal(fixMessage({ id: 'ready', text: 'It never answered.', hint: 'Listen on PORT.' }), 'Fix this check, ready: It never answered. To do: Listen on PORT. Then run the checks again.');

// The Check stage is done only when nothing failed: not before the checks ran, not with a failed line; a line that could not run is no failure.
const ran = (ls: CheckLine[], ok = !ls.some((l) => l.state === 'failed')) => ({ ran: true, ok, lines: ls });
assert.equal(checkDone(null), null);
assert.equal(checkDone({ ran: false, ok: null, lines: [] }), false);
assert.equal(checkDone(ran([line('a', 'passed'), line('b', 'notRun')])), true);
assert.equal(checkDone(ran([line('a', 'passed'), line('b', 'failed')])), false);
assert.equal(checkDone({ ...ran([line('a', 'passed')]), problem: 'It did not run.' }), false);
const past = (checks: boolean | null) => stageRows('run', checks).map((r) => r.state).join();
assert.equal(past(true), 'done,done,done,done,done,here');
assert.equal(past(false), 'done,done,done,here,ahead,ahead', 'past Check with a failure: Check is where it is');
assert.equal(past(null), 'done,done,done,here,ahead,ahead', 'not read yet: nothing claimed');
assert.equal(stageRows('design', false).map((r) => r.state).join(), 'done,here,ahead,ahead,ahead,ahead', 'before Check it makes no difference');
assert.equal(nextStep('check', [], ran([line('a', 'failed'), line('b', 'failed')])).sentence, '2 checks failed: they have to pass before it is ready.');
assert.equal(nextStep('check', [], ran([line('a', 'failed')])).button, 'Fix them');
assert.equal(nextStep('check', [], ran([line('a', 'passed')])).button, 'Launch it', 'nothing failed: launching is next');
assert.equal(nextStep('check', [], { ran: false, ok: null, lines: [] }).button, 'Run the checks');
assert.equal(nextStep('run', [], ran([line('a', 'failed')])).stage, 'check', 'past it, but it failed: the check is next');

// Steps: the list is whole when it came back shorter than asked for.
assert.equal(listComplete([], 7), true);
assert.equal(listComplete(new Array(7).fill(0) as never, 7), false);

// Going back: the files, what stays, the rebuild; and what is saved first when there is unsaved work.
assert.equal(goBackSentences(0).length, 3);
assert.match(goBackSentences(0)[0], /files go back as they were before this step/);
assert.match(goBackSentences(2)[0], /\(2 files\) is saved as a step first/);
assert.match(goBackSentences(1)[0], /\(1 file\)/);

console.log('ok - the stage, the next step, the decisions, the brief, the checks and going back');
