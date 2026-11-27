// Script test for the words of runs that wait for the night (nightWords.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/experiments/nightWords-test.ts && node dist/dev/nightWords-test.js
import assert from 'node:assert/strict';
import { countWaitingForNight, hoursWords, nightCountWords, nightDay, nightStatus, saidByStatus, stopNote, waitsForNight } from './nightWords';

const hours = { nightFrom: '23:00', nightTo: '07:00', nightEnds: 'finish' as const };
assert.equal(hoursWords(hours, 'local'), 'between 23:00 and 07:00');
assert.equal(hoursWords({ ...hours, nightTo: '23:00' }, 'local'), 'no night hours are set, so it would wait');
assert.equal(hoursWords(null, 'local'), '');
assert.equal(hoursWords(hours, 'm:lab'), 'in that machine’s night hours');

assert.equal(stopNote(hours, 'local'), '', 'let finish: nothing more to say');
assert.equal(stopNote({ ...hours, nightEnds: 'stop' }, 'local'), 'A run still going at 07:00 is stopped, and starts from the beginning the next night.');
assert.equal(stopNote({ ...hours, nightEnds: 'stop' }, 'm:lab'), '', 'another machine has its own settings');
assert.equal(stopNote({ ...hours, nightEnds: 'stop' }, 'local', false), 'A run still going at 07:00 is stopped, and starts from the beginning the next night, unless it says how to carry on.');
assert.equal(stopNote({ ...hours, nightEnds: 'stop' }, 'local', true), 'A run still going at 07:00 is stopped, and carries on from its checkpoint the next night.');

const plain = 'Waits for the night (from 23:00)';
const again = 'The night ended: it starts again tonight';
const carry = 'Stopped at the end of the night: it carries on from its checkpoint tonight';
assert.equal(nightStatus(carry), 'Waits for the night');
assert.ok(waitsForNight(carry) && !saidByStatus(carry));
assert.equal(nightStatus(plain), plain);
assert.equal(nightStatus(again), 'Waits for the night');
assert.ok(saidByStatus(plain) && !saidByStatus(again) && !saidByStatus(undefined));
assert.ok(waitsForNight(plain) && waitsForNight(again) && waitsForNight('Waits for the night: none is set. Give Night two different times in Where runs go'));
assert.ok(!waitsForNight('Its turn comes after your other waiting runs: it is a night run') && !waitsForNight('Waiting for 1 GPU'));

assert.equal(nightCountWords(1), '1 waits for the night');
assert.equal(nightCountWords(2), '2 wait for the night');
assert.equal(
  countWaitingForNight([
    { status: 'waiting', why: plain },
    { status: 'waiting', why: 'Waiting for 1 GPU' },
    { status: 'running' },
    { status: 'stopped', why: plain },
  ]),
  1,
);
assert.equal(nightDay('2026-01-05')!.getDate(), 5);
assert.equal(nightDay('2026-01-05')!.getMonth(), 0);
assert.equal(nightDay('tonight'), null);
assert.equal(nightDay(null), null);
console.log('nightWords: all checks passed');
