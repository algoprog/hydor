import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workspace } from './support.mjs';

test('add, then report the week', () => {
  const w = workspace();
  assert.equal(w.tt('add', 'acme', '2025-10-20T09:00', '2025-10-20T16:30', '--note', 'design').stdout, 'added #1 7:30\n');
  assert.equal(w.tt('add', 'globex', '2025-10-21T10:00', '--for', '1h30m').stdout, 'added #2 1:30\n');
  assert.deepEqual(w.read().entries[1], { id: 2, project: 'globex', start: '2025-10-21T10:00', end: '2025-10-21T11:30', note: '' });
  const r = w.tt('report', '--week', '2025-W43');
  assert.equal(r.code, 0);
  assert.equal(
    r.stdout,
    [
      'Week 2025-W43 (2025-10-20 to 2025-10-26)',
      'Mon 2025-10-20    7:30',
      'Tue 2025-10-21    1:30',
      'Wed 2025-10-22    0:00',
      'Thu 2025-10-23    0:00',
      'Fri 2025-10-24    0:00',
      'Sat 2025-10-25    0:00',
      'Sun 2025-10-26    0:00',
      'Total             9:00',
      '',
      'acme              7:30     €675.00',
      'globex            1:30     €113.25',
      '',
    ].join('\n'),
  );
});

test('a report for a range of dates has its own title', () => {
  const w = workspace();
  w.tt('add', 'acme', '2025-05-02T09:00', '2025-05-02T10:00');
  const r = w.tt('report', '--from', '2025-05-01', '--to', '2025-05-03');
  assert.equal(r.stdout.split('\n')[0], 'Report 2025-05-01 to 2025-05-03');
  assert.equal(r.stdout.split('\n').length, 8);
});

test('start and stop make an entry', () => {
  const w = workspace();
  assert.equal(w.tt('start', 'acme', '--note', 'api', '--now', '2025-05-02T09:00').stdout, 'started #1 2025-05-02T09:00\n');
  assert.equal(w.tt('start', 'globex', '--now', '2025-05-02T09:05').code, 2);
  assert.equal(w.tt('stop', '--now', '2025-05-02T10:15').stdout, 'stopped #1 1:15\n');
  assert.equal(w.read().entries[0].end, '2025-05-02T10:15');
  assert.equal(w.tt('stop', '--now', '2025-05-02T10:20').code, 2);
});

test('a project with no rate shows no amount', () => {
  const w = workspace();
  w.tt('add', 'internal', '2025-05-02T09:00', '--for', '45m');
  assert.match(w.tt('report', '--from', '2025-05-02', '--to', '2025-05-02').stdout, /\ninternal {10}0:45\n$/);
});

test('mistakes are errors: a message on stderr, exit code 2, nothing on stdout', () => {
  const w = workspace();
  const wrong = [
    ['add', 'acme', '2025-05-02T10:00', '2025-05-02T09:00'],
    ['add', 'acme', '2025-05-02T10:00'],
    ['add', 'bad name', '2025-05-02T10:00', '--for', '1h'],
    ['add', 'acme', '2025-05-02', '--for', '1h'],
    ['add', 'acme', '2025-05-02T10:00', '--for', 'soon'],
    ['report', '--week', '2025-W99'],
    ['report', '--from', '2025-05-03', '--to', '2025-05-01'],
    ['report', '--from', '2025-05-03'],
    ['frobnicate'],
    [],
  ];
  for (const args of wrong) {
    const r = w.tt(...args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.stdout, '', args.join(' '));
    assert.notEqual(r.stderr, '', args.join(' '));
  }
  assert.deepEqual(w.read().entries, []);
});

test('export and import', () => {
  const w = workspace();
  w.tt('add', 'acme', '2025-05-02T09:00', '2025-05-02T10:00', '--note', 'standup');
  w.tt('start', 'globex', '--at', '2025-05-03T08:00');
  const csv = w.tt('export', '--now', '2025-05-03T09:30').stdout;
  assert.equal(csv, 'id,project,start,end,minutes,note\n1,acme,2025-05-02T09:00,2025-05-02T10:00,60,standup\n2,globex,2025-05-03T08:00,,90,\n');
  const other = workspace();
  other.write('in.csv', csv);
  assert.equal(other.tt('import', 'in.csv').stdout, 'imported 2\n');
  assert.equal(other.tt('export', '--now', '2025-05-03T09:30').stdout, csv);
});

test('an import with a wrong row changes nothing', () => {
  const w = workspace();
  w.write('bad.csv', 'id,project,start,end,minutes,note\n1,acme,2025-05-02T09:00,2025-05-02T10:00,60,ok\n2,acme,2025-05-02T11:00,2025-05-02T10:00,0,backwards\n');
  const r = w.tt('import', 'bad.csv');
  assert.equal(r.code, 2);
  assert.deepEqual(w.read().entries, []);
});

test('the data file must name a time zone that exists', () => {
  const w = workspace({ timeZone: 'Mars/Olympus' });
  assert.equal(w.tt('report').code, 2);
});
