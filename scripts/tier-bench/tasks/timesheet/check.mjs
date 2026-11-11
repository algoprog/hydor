// Hidden checker for timesheet. Run: node check.mjs <workdir>
// Black box: every case makes a scratch folder with a data file, runs `node <workdir>/src/cli.mjs ...` in it as a
// child process (10 s limit, TZ=America/New_York so that code using the machine's time zone goes wrong) and compares
// the exit code, stdout and the data file with what README.md says. The expected texts are built here from numbers
// worked out by hand (the minutes of the daylight-saving cases were cross-checked with Python's zoneinfo).
// CHECK_DUMP_DST=1 prints those numbers as JSON for that cross-check.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.argv[2] && !process.env.CHECK_DUMP_DST) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = process.argv[2] ? path.resolve(process.argv[2]) : '';
const cli = path.join(dir, 'src', 'cli.mjs');

// ---------- small tools ----------

// A seeded PRNG (mulberry32).
function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) };
}

const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dayName = (date) => NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
const dur = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const SYMBOLS = { EUR: '€', USD: '$', GBP: '£' };
// Cents for minutes at a rate in cents per hour: rounded once, halves up, in whole numbers.
const centsFor = (minutes, rate) => Math.floor((minutes * rate + 30) / 60);
const money = (cents, currency) => `${SYMBOLS[currency] ?? `${currency} `}${String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+$)/g, ',')}.${String(cents % 100).padStart(2, '0')}`;
const csvField = (s) => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
const csv = (rows) => rows.map((r) => `${r.map(csvField).join(',')}\n`).join('');
const HEADER = ['id', 'project', 'start', 'end', 'minutes', 'note'];

const ATH = 'Europe/Athens';
const NY = 'America/New_York';
const SYD = 'Australia/Sydney';
const LH = 'Australia/Lord_Howe';
const RATES = { acme: 9000, globex: 7550 };

// An entry of the data file; no end means a running one.
const E = (id, project, start, end, note = '') => ({ id, project, start, end: end ?? undefined, note });

// The text a report must have. `per` is the minutes by date, `projects` is [name, minutes] pairs.
function report(title, from, n, per, projects = [], rates = RATES, currency = 'EUR') {
  const line = (label, m) => `${label.padEnd(14)}${dur(m).padStart(8)}`;
  const lines = [title];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i);
    const m = per[d] ?? 0;
    total += m;
    lines.push(line(`${dayName(d)} ${d}`, m));
  }
  lines.push(line('Total', total));
  if (projects.length > 0) {
    lines.push('');
    for (const [name, m] of [...projects].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      lines.push(line(name, m) + (rates[name] === undefined ? '' : money(centsFor(m, rates[name]), currency).padStart(12)));
    }
  }
  return `${lines.join('\n')}\n`;
}
const weekTitle = (id, from) => `Week ${id} (${from} to ${addDays(from, 6)})`;
const week = (id, from, per, projects, rates, currency) => report(weekTitle(id, from), from, 7, per, projects, rates, currency);
const range = (from, to, per, projects, rates, currency) => {
  const n = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  return report(`Report ${from} to ${to}`, from, n, per, projects, rates, currency);
};

// ---------- the scratch folder ----------

function sandbox(opts = {}, files = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-check-'));
  const data = { timeZone: opts.tz ?? ATH, currency: opts.currency ?? 'EUR', rates: opts.rates ?? RATES, entries: opts.entries ?? [] };
  fs.writeFileSync(path.join(folder, 'timesheet.json'), opts.raw ?? JSON.stringify(data, null, 2));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), text);
  return {
    folder,
    write: (name, text) => fs.writeFileSync(path.join(folder, name), text),
    run(...args) {
      const r = spawnSync(process.execPath, [cli, ...args], {
        cwd: folder,
        encoding: 'utf8',
        timeout: 10000,
        killSignal: 'SIGKILL',
        maxBuffer: 1 << 24,
        env: { ...process.env, TZ: 'America/New_York', LANG: 'C' },
      });
      return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', signal: r.signal };
    },
    // The entries in the data file, as { id, project, start, end, note } with end undefined when running.
    entries() {
      const d = JSON.parse(fs.readFileSync(path.join(folder, opts.file ?? 'timesheet.json'), 'utf8'));
      return d.entries.map((e) => ({ id: e.id, project: e.project, start: e.start, end: e.end ?? undefined, note: e.note ?? '' }));
    },
    done: () => fs.rmSync(folder, { recursive: true, force: true }),
  };
}
const norm = (list) => list.map((e) => ({ id: e.id, project: e.project, start: e.start, end: e.end ?? undefined, note: e.note ?? '' }));
const brief = (r) => `exit ${r.code}${r.signal ? ` (${r.signal})` : ''}, stdout ${JSON.stringify(r.stdout.slice(0, 200))}, stderr ${JSON.stringify(r.stderr.split('\n')[0].slice(0, 160))}`;

function ok(sb, args, stdout) {
  const r = sb.run(...args);
  assert.equal(r.code, 0, `tt ${args.join(' ')}: ${brief(r)}`);
  assert.equal(r.stdout, stdout, `tt ${args.join(' ')}: wrong stdout`);
  return r;
}
function bad(sb, args) {
  const r = sb.run(...args);
  assert.equal(r.code, 2, `tt ${args.join(' ')} should be an error: ${brief(r)}`);
  assert.equal(r.stdout, '', `tt ${args.join(' ')}: an error must print nothing on stdout`);
}

// ---------- the cases ----------

const cases = [];
const add = (name, fn) => cases.push({ name, fn });
// A case that makes a fresh scratch folder for each scenario in a list and runs a function on it.
function each(name, scenarios, fn) {
  add(name, () => {
    for (const s of scenarios) {
      const sb = sandbox(s.opts ?? {}, s.files ?? {});
      try {
        fn(sb, s);
      } finally {
        sb.done();
      }
    }
  });
}
function one(name, opts, fn, files) {
  each(name, [{ opts, files }], fn);
}
const R = (from, to, ...extra) => ['report', '--from', from, '--to', to, ...extra];

// --- ISO weeks (issue 12) ---
one('weeks: 2025-W01 is Monday 30 December 2024 to Sunday 5 January', { entries: [E(1, 'acme', '2024-12-30T09:00', '2024-12-30T12:00'), E(2, 'globex', '2025-01-01T10:00', '2025-01-01T12:00'), E(3, 'acme', '2025-01-05T08:00', '2025-01-05T09:00'), E(4, 'acme', '2025-01-06T08:00', '2025-01-06T09:00')] }, (sb) => {
  ok(sb, ['report', '--week', '2025-W01'], week('2025-W01', '2024-12-30', { '2024-12-30': 180, '2025-01-01': 120, '2025-01-05': 60 }, [['acme', 240], ['globex', 120]]));
});
one('weeks: 2025-W02 and 2025-W52 (regression)', { entries: [E(1, 'acme', '2025-01-06T08:00', '2025-01-06T09:00'), E(2, 'acme', '2025-01-12T08:00', '2025-01-12T10:00'), E(3, 'globex', '2025-12-28T08:00', '2025-12-28T09:00'), E(4, 'globex', '2025-12-29T08:00', '2025-12-29T09:00')] }, (sb) => {
  ok(sb, ['report', '--week', '2025-W02'], week('2025-W02', '2025-01-06', { '2025-01-06': 60, '2025-01-12': 120 }, [['acme', 180]]));
  ok(sb, ['report', '--week', '2025-W52'], week('2025-W52', '2025-12-22', { '2025-12-28': 60 }, [['globex', 60]]));
});
one('weeks: 2026-W01 starts on Monday 29 December 2025', { entries: [E(1, 'acme', '2025-12-28T08:00', '2025-12-28T09:00'), E(2, 'acme', '2025-12-29T08:00', '2025-12-29T10:00'), E(3, 'acme', '2025-12-31T23:00', '2026-01-01T01:00'), E(4, 'globex', '2026-01-04T10:00', '2026-01-04T10:30'), E(5, 'globex', '2026-01-05T10:00', '2026-01-05T10:30')] }, (sb) => {
  ok(sb, ['report', '--week', '2026-W01'], week('2026-W01', '2025-12-29', { '2025-12-29': 120, '2025-12-31': 120, '2026-01-04': 30 }, [['acme', 240], ['globex', 30]]));
});
one('weeks: 2020 has a week 53, and 2021-W01 starts on 4 January', { entries: [E(1, 'acme', '2020-12-31T09:00', '2020-12-31T11:00'), E(2, 'acme', '2021-01-01T09:00', '2021-01-01T10:00'), E(3, 'acme', '2021-01-03T09:00', '2021-01-03T09:30'), E(4, 'globex', '2021-01-04T09:00', '2021-01-04T10:00')] }, (sb) => {
  ok(sb, ['report', '--week', '2020-W53'], week('2020-W53', '2020-12-28', { '2020-12-31': 120, '2021-01-01': 60, '2021-01-03': 30 }, [['acme', 210]]));
  ok(sb, ['report', '--week', '2021-W01'], week('2021-W01', '2021-01-04', { '2021-01-04': 60 }, [['globex', 60]]));
});
one('weeks: 2015-W53 and 2016-W01', { entries: [E(1, 'acme', '2015-12-28T09:00', '2015-12-28T10:00'), E(2, 'acme', '2016-01-01T09:00', '2016-01-01T10:30'), E(3, 'globex', '2016-01-04T09:00', '2016-01-04T10:00'), E(4, 'globex', '2016-01-10T09:00', '2016-01-10T11:00')] }, (sb) => {
  ok(sb, ['report', '--week', '2015-W53'], week('2015-W53', '2015-12-28', { '2015-12-28': 60, '2016-01-01': 90 }, [['acme', 150]]));
  ok(sb, ['report', '--week', '2016-W01'], week('2016-W01', '2016-01-04', { '2016-01-04': 60, '2016-01-10': 120 }, [['globex', 180]]));
});
one('weeks: 2026-W53 and 2027-W01', { entries: [E(1, 'acme', '2026-12-30T09:00', '2026-12-30T10:00'), E(2, 'acme', '2027-01-03T09:00', '2027-01-03T10:00'), E(3, 'globex', '2027-01-04T09:00', '2027-01-04T12:00')] }, (sb) => {
  ok(sb, ['report', '--week', '2026-W53'], week('2026-W53', '2026-12-28', { '2026-12-30': 60, '2027-01-03': 60 }, [['acme', 120]]));
  ok(sb, ['report', '--week', '2027-W01'], week('2027-W01', '2027-01-04', { '2027-01-04': 180 }, [['globex', 180]]));
});
one('weeks: 2024-W01 and weeks in the middle of the year (regression)', { entries: [E(1, 'acme', '2024-01-01T09:00', '2024-01-01T10:00'), E(2, 'acme', '2024-03-04T09:00', '2024-03-04T10:00'), E(3, 'globex', '2025-10-22T09:00', '2025-10-22T12:00')] }, (sb) => {
  ok(sb, ['report', '--week', '2024-W01'], week('2024-W01', '2024-01-01', { '2024-01-01': 60 }, [['acme', 60]]));
  ok(sb, ['report', '--week', '2024-W10'], week('2024-W10', '2024-03-04', { '2024-03-04': 60 }, [['acme', 60]]));
  ok(sb, ['report', '--week', '2025-W43'], week('2025-W43', '2025-10-20', { '2025-10-22': 180 }, [['globex', 180]]));
});
each('weeks: weeks that do not exist are errors (2021-W53, 2024-W53, 2025-W53, 2023-W53)', ['2021-W53', '2024-W53', '2025-W53', '2023-W53'].map((id) => ({ id })), (sb, s) => bad(sb, ['report', '--week', s.id]));
each('weeks: malformed week ids are errors (regression)', ['2025-W00', '2025-W54', '2025-43', '2025-W5', 'W05', '2025W05', 'last'].map((id) => ({ id })), (sb, s) => bad(sb, ['report', '--week', s.id]));
one('weeks: with no options, the week that contains the date of --now; 30 December 2025 is in 2026-W01', { entries: [E(1, 'acme', '2025-12-30T09:00', '2025-12-30T10:30')] }, (sb) => {
  ok(sb, ['report', '--now', '2025-12-30T11:00'], week('2026-W01', '2025-12-29', { '2025-12-30': 90 }, [['acme', 90]]));
});
one('weeks: with no options, 2 January 2025 is in 2025-W01', { entries: [E(1, 'acme', '2025-01-02T09:00', '2025-01-02T10:30')] }, (sb) => {
  ok(sb, ['report', '--now', '2025-01-02T11:00'], week('2025-W01', '2024-12-30', { '2025-01-02': 90 }, [['acme', 90]]));
});
one('weeks: with no options, 1 January 2021 is in 2020-W53', { entries: [E(1, 'acme', '2021-01-01T09:00', '2021-01-01T10:00')] }, (sb) => {
  ok(sb, ['report', '--now', '2021-01-01T12:00'], week('2020-W53', '2020-12-28', { '2021-01-01': 60 }, [['acme', 60]]));
});
one('weeks: with no options, in the middle of the year, on a Monday and on a Sunday (regression)', { entries: [E(1, 'acme', '2025-10-20T09:00', '2025-10-20T10:00'), E(2, 'acme', '2025-10-26T09:00', '2025-10-26T09:30')] }, (sb) => {
  const text = week('2025-W43', '2025-10-20', { '2025-10-20': 60, '2025-10-26': 30 }, [['acme', 90]]);
  ok(sb, ['report', '--now', '2025-10-20T00:00'], text);
  ok(sb, ['report', '--now', '2025-10-26T23:59'], text);
});
one('range: a report over New Year lists every date, and an entry counts on its start date (regression)', { entries: [E(1, 'acme', '2024-12-28T09:00', '2024-12-28T10:00'), E(2, 'acme', '2024-12-31T23:00', '2025-01-01T02:00'), E(3, 'globex', '2025-01-02T09:00', '2025-01-02T10:00'), E(4, 'globex', '2025-01-04T09:00', '2025-01-04T10:00')] }, (sb) => {
  ok(sb, R('2024-12-29', '2025-01-03'), range('2024-12-29', '2025-01-03', { '2024-12-31': 180, '2025-01-02': 60 }, [['acme', 180], ['globex', 60]]));
});
one('range: one day, and a leap day (regression)', { entries: [E(1, 'acme', '2024-02-29T09:00', '2024-02-29T10:15')] }, (sb) => {
  ok(sb, R('2024-02-29', '2024-02-29'), range('2024-02-29', '2024-02-29', { '2024-02-29': 75 }, [['acme', 75]]));
  ok(sb, R('2024-02-28', '2024-03-01'), range('2024-02-28', '2024-03-01', { '2024-02-29': 75 }, [['acme', 75]]));
});
each('range: wrong options are errors (regression)', [
  ['report', '--from', '2025-05-03', '--to', '2025-05-01'],
  ['report', '--from', '2025-05-03'],
  ['report', '--to', '2025-05-03'],
  ['report', '--from', '2025-02-30', '--to', '2025-03-01'],
  ['report', '--from', '2025-5-1', '--to', '2025-05-03'],
  ['report', '--week', '2025-W20', '--from', '2025-05-01', '--to', '2025-05-03'],
].map((args) => ({ args })), (sb, s) => bad(sb, s.args));

// --- daylight saving: the minutes of an entry in a time zone (worked out by hand, cross-checked with zoneinfo) ---
// [time zone, start, end, minutes]
const DST = [
  [ATH, '2025-10-25T22:00', '2025-10-26T06:00', 540],
  [ATH, '2025-03-29T22:00', '2025-03-30T06:00', 420],
  [ATH, '2024-10-26T22:00', '2024-10-27T06:00', 540],
  [ATH, '2024-03-30T22:00', '2024-03-31T06:00', 420],
  [ATH, '2025-10-26T03:30', '2025-10-26T05:00', 150],
  [ATH, '2025-10-26T03:10', '2025-10-26T03:50', 40],
  [ATH, '2025-10-26T02:00', '2025-10-26T03:30', 90],
  [ATH, '2025-10-26T03:30', '2025-10-26T04:00', 90],
  [ATH, '2025-03-30T02:30', '2025-03-30T04:30', 60],
  [ATH, '2025-03-30T02:59', '2025-03-30T04:00', 1],
  [NY, '2025-11-01T22:00', '2025-11-02T06:00', 540],
  [NY, '2025-03-08T22:00', '2025-03-09T06:00', 420],
  [NY, '2025-11-02T01:30', '2025-11-02T03:00', 150],
  [SYD, '2025-04-05T22:00', '2025-04-06T06:00', 540],
  [SYD, '2025-10-04T22:00', '2025-10-05T06:00', 420],
  [SYD, '2025-04-06T02:30', '2025-04-06T04:00', 150],
  [LH, '2025-04-05T22:00', '2025-04-06T06:00', 510],
  [LH, '2025-10-04T22:00', '2025-10-05T06:00', 450],
  [LH, '2025-04-06T01:45', '2025-04-06T03:00', 105],
  [LH, '2025-10-05T01:00', '2025-10-05T03:00', 90],
];
// Local times that do not exist: [time zone, local time].
const GAPS = [
  [ATH, '2025-03-30T03:30'],
  [ATH, '2025-03-30T03:00'],
  [ATH, '2025-03-30T03:59'],
  [ATH, '2024-03-31T03:15'],
  [NY, '2025-03-09T02:30'],
  [SYD, '2025-10-05T02:30'],
  [LH, '2025-10-05T02:15'],
];
// Local times just outside a gap, which do exist.
const EDGES = [
  [ATH, '2025-03-30T02:59'],
  [ATH, '2025-03-30T04:00'],
  [LH, '2025-10-05T02:30'],
  [LH, '2025-10-05T01:59'],
];
if (process.env.CHECK_DUMP_DST) {
  console.log(JSON.stringify({ DST, GAPS, EDGES }));
  process.exit(0);
}

const dstReport = (rows) => () => {
  for (const [tz, start, end, minutes] of rows) {
    const day = start.slice(0, 10);
    const s = sandbox({ tz, entries: [E(1, 'acme', start, end)] });
    try {
      ok(s, R(day, day), range(day, day, { [day]: minutes }, [['acme', minutes]]));
    } finally {
      s.done();
    }
  }
};
const rowsOf = (...ix) => ix.map((i) => DST[i]);
one('DST Athens: the night the clocks go back lasts 9:00 in a report (2025 and 2024)', {}, dstReport(rowsOf(0, 2)));
one('DST Athens: the night the clocks go forward lasts 7:00 in a report (2025 and 2024)', {}, dstReport(rowsOf(1, 3)));
one('DST Athens: entries that start in the repeated hour start at its first pass', {}, dstReport(rowsOf(4, 5)));
one('DST Athens: entries that end in or after the repeated hour, and over the skipped hour', {}, dstReport(rowsOf(6, 7, 8, 9)));
one('DST New York: both changes in a report', {}, dstReport(rowsOf(10, 11, 12)));
one('DST Sydney (southern hemisphere): both changes in a report', {}, dstReport(rowsOf(13, 14, 15)));
one('DST Lord Howe (a change of 30 minutes): both changes in a report', {}, dstReport(rowsOf(16, 17, 18, 19)));
one('DST: tt add prints and stores the entry for a night over a change', {}, (sb) => {
  ok(sb, ['add', 'acme', '2025-10-25T22:00', '2025-10-26T06:00'], 'added #1 9:00\n');
  ok(sb, ['add', 'acme', '2025-03-29T22:00', '2025-03-30T06:00', '--note', 'march'], 'added #2 7:00\n');
  assert.deepEqual(norm(sb.entries()), [E(1, 'acme', '2025-10-25T22:00', '2025-10-26T06:00'), E(2, 'acme', '2025-03-29T22:00', '2025-03-30T06:00', 'march')]);
});
each('DST: add --for lands on the local time that real time gives', [
  { tz: ATH, start: '2025-10-25T22:00', f: '9h', end: '2025-10-26T06:00', shown: '9:00' },
  { tz: ATH, start: '2025-03-29T22:00', f: '7h', end: '2025-03-30T06:00', shown: '7:00' },
  { tz: ATH, start: '2025-03-30T02:30', f: '90m', end: '2025-03-30T05:00', shown: '1:30' },
  { tz: ATH, start: '2025-10-26T01:00', f: '1h30m', end: '2025-10-26T02:30', shown: '1:30' },
  { tz: NY, start: '2025-11-01T22:00', f: '9h', end: '2025-11-02T06:00', shown: '9:00' },
  { tz: SYD, start: '2025-10-04T22:00', f: '7h', end: '2025-10-05T06:00', shown: '7:00' },
].map((s) => ({ ...s, opts: { tz: s.tz } })), (sb, s) => {
  ok(sb, ['add', 'acme', s.start, '--for', s.f], `added #1 ${s.shown}\n`);
  assert.deepEqual(sb.entries(), [E(1, 'acme', s.start, s.end)]);
});
each('DST: a time that does not exist is refused by add (as start and as end), and nothing is stored', GAPS.map(([tz, t]) => ({ tz, t, opts: { tz } })), (sb, s) => {
  const day = s.t.slice(0, 10);
  bad(sb, ['add', 'acme', s.t, '--for', '30m']);
  bad(sb, ['add', 'acme', s.t, `${day}T23:59`]);
  bad(sb, ['add', 'acme', `${day}T00:10`, s.t]);
  assert.deepEqual(sb.entries(), []);
});
each('DST: tt start and tt stop refuse a time that does not exist, and change nothing', GAPS.map(([tz, t]) => ({ tz, t, opts: { tz, entries: [E(1, 'acme', `${t.slice(0, 10)}T00:10`)] } })), (sb, s) => {
  bad(sb, ['stop', '--at', s.t]);
  bad(sb, ['stop', '--now', s.t]);
  assert.deepEqual(sb.entries(), [E(1, 'acme', `${s.t.slice(0, 10)}T00:10`)]);
  const other = sandbox({ tz: s.opts.tz });
  try {
    bad(other, ['start', 'acme', '--at', s.t]);
    bad(other, ['start', 'acme', '--now', s.t]);
    assert.deepEqual(other.entries(), []);
  } finally {
    other.done();
  }
});
each('DST: the times next to a skipped hour exist', EDGES.map(([tz, t]) => ({ tz, t, opts: { tz } })), (sb, s) => {
  ok(sb, ['start', 'acme', '--at', s.t], `started #1 ${s.t}\n`);
  assert.deepEqual(sb.entries(), [E(1, 'acme', s.t, undefined)]);
});
one('DST: an entry from 02:59 to 04:00 on the night the clocks go forward lasts one minute', {}, (sb) => {
  ok(sb, ['add', 'acme', '2025-03-30T02:59', '2025-03-30T04:00'], 'added #1 0:01\n');
});
one('DST: start, then stop, over the night the clocks go back', {}, (sb) => {
  ok(sb, ['start', 'acme', '--at', '2025-10-25T22:00'], 'started #1 2025-10-25T22:00\n');
  ok(sb, ['stop', '--at', '2025-10-26T06:00'], 'stopped #1 9:00\n');
  assert.deepEqual(sb.entries(), [E(1, 'acme', '2025-10-25T22:00', '2025-10-26T06:00')]);
});
one('DST: start, then stop with --now, over the night the clocks go forward', {}, (sb) => {
  ok(sb, ['start', 'globex', '--now', '2025-03-29T22:00'], 'started #1 2025-03-29T22:00\n');
  ok(sb, ['stop', '--now', '2025-03-30T06:00'], 'stopped #1 7:00\n');
  assert.deepEqual(sb.entries(), [E(1, 'globex', '2025-03-29T22:00', '2025-03-30T06:00')]);
});
one('DST: a running entry counts up to --now over the night the clocks go back', { entries: [E(1, 'acme', '2025-10-25T22:00')] }, (sb) => {
  ok(sb, R('2025-10-25', '2025-10-26', '--now', '2025-10-26T06:00'), range('2025-10-25', '2025-10-26', { '2025-10-25': 540 }, [['acme', 540]]));
});
one('DST: a running entry counts up to --now over the night the clocks go forward', { entries: [E(1, 'acme', '2025-03-29T22:00')] }, (sb) => {
  ok(sb, R('2025-03-29', '2025-03-30', '--now', '2025-03-30T06:00'), range('2025-03-29', '2025-03-30', { '2025-03-29': 420 }, [['acme', 420]]));
});
one('DST: --now in the repeated hour is the first pass; the export shows the minutes so far', { entries: [E(1, 'acme', '2025-10-25T22:00'), E(2, 'globex', '2025-10-26T03:10', '2025-10-26T03:20')] }, (sb) => {
  // 22:00 (summer time) to the first 03:30 is 5.5 hours.
  const out = csv([HEADER, ['1', 'acme', '2025-10-25T22:00', '', '330', ''], ['2', 'globex', '2025-10-26T03:10', '2025-10-26T03:20', '10', '']]);
  ok(sb, ['export', '--now', '2025-10-26T03:30'], out);
});
one('DST: the export shows real minutes for nights over the changes in other zones', { tz: NY, entries: [E(1, 'acme', '2025-11-01T22:00', '2025-11-02T06:00'), E(2, 'acme', '2025-03-08T22:00', '2025-03-09T06:00')] }, (sb) => {
  ok(sb, ['export'], csv([HEADER, ['1', 'acme', '2025-11-01T22:00', '2025-11-02T06:00', '540', ''], ['2', 'acme', '2025-03-08T22:00', '2025-03-09T06:00', '420', '']]));
});
one('DST: an import recomputes the minutes of a night over a change', {}, (sb) => {
  sb.write('in.csv', csv([HEADER, ['9', 'acme', '2025-10-25T22:00', '2025-10-26T06:00', '480', 'wrong minutes']]));
  ok(sb, ['import', 'in.csv'], 'imported 1\n');
  ok(sb, ['export'], csv([HEADER, ['1', 'acme', '2025-10-25T22:00', '2025-10-26T06:00', '540', 'wrong minutes']]));
});

// --- overlapping entries (issue 27) ---
// One day's entries, then the minutes the day must show and what the projects must show.
function overlapCase(name, entries, per, projects, opts = {}) {
  const day = entries[0].start.slice(0, 10);
  one(name, { entries, ...opts }, (sb) => {
    ok(sb, R(day, addDays(day, 1), '--now', '2025-06-30T12:00'), range(day, addDays(day, 1), per, projects, opts.rates ?? RATES));
  });
}
overlapCase('overlaps: two entries that overlap in part count the overlap once', [E(1, 'acme', '2025-05-12T08:00', '2025-05-12T12:00'), E(2, 'acme', '2025-05-12T10:00', '2025-05-12T14:00')], { '2025-05-12': 360 }, [['acme', 480]]);
overlapCase('overlaps: the timer from the issue (09:00-13:00 inside 08:00-14:00) shows 6:00', [E(1, 'acme', '2025-05-12T09:00', '2025-05-12T13:00'), E(2, 'acme', '2025-05-12T08:00', '2025-05-12T14:00')], { '2025-05-12': 360 }, [['acme', 600]]);
overlapCase('overlaps: two equal entries count once', [E(1, 'acme', '2025-05-12T09:00', '2025-05-12T12:00'), E(2, 'globex', '2025-05-12T09:00', '2025-05-12T12:00')], { '2025-05-12': 180 }, [['acme', 180], ['globex', 180]]);
overlapCase('overlaps: a chain of three, each overlapping the next', [E(1, 'acme', '2025-05-12T08:00', '2025-05-12T10:00'), E(2, 'acme', '2025-05-12T09:00', '2025-05-12T11:00'), E(3, 'acme', '2025-05-12T10:30', '2025-05-12T12:00')], { '2025-05-12': 240 }, [['acme', 330]]);
overlapCase('overlaps: a third entry that bridges two others', [E(1, 'acme', '2025-05-12T08:00', '2025-05-12T09:00'), E(2, 'acme', '2025-05-12T10:00', '2025-05-12T11:00'), E(3, 'globex', '2025-05-12T08:30', '2025-05-12T10:30')], { '2025-05-12': 180 }, [['acme', 120], ['globex', 120]]);
overlapCase('overlaps: a long entry with two short ones inside it, one after the other', [E(1, 'acme', '2025-05-12T08:00', '2025-05-12T18:00'), E(2, 'globex', '2025-05-12T09:00', '2025-05-12T10:00'), E(3, 'globex', '2025-05-12T11:00', '2025-05-12T12:00')], { '2025-05-12': 600 }, [['acme', 600], ['globex', 120]]);
overlapCase('overlaps: a short entry that starts before a long one and ends inside it, and one that ends after it', [E(1, 'acme', '2025-05-12T09:00', '2025-05-12T11:00'), E(2, 'acme', '2025-05-12T10:00', '2025-05-12T10:30'), E(3, 'acme', '2025-05-12T10:45', '2025-05-12T11:30')], { '2025-05-12': 150 }, [['acme', 195]]);
overlapCase('overlaps: entries that only touch, and entries apart, add up (regression)', [E(1, 'acme', '2025-05-12T08:00', '2025-05-12T10:00'), E(2, 'acme', '2025-05-12T10:00', '2025-05-12T12:00'), E(3, 'globex', '2025-05-12T13:00', '2025-05-12T13:30')], { '2025-05-12': 270 }, [['acme', 240], ['globex', 30]]);
overlapCase('overlaps: two entries from one day that both run past midnight count once on that day', [E(1, 'acme', '2025-05-12T22:00', '2025-05-13T03:00'), E(2, 'globex', '2025-05-12T23:00', '2025-05-13T02:00')], { '2025-05-12': 300 }, [['acme', 300], ['globex', 180]]);
overlapCase('overlaps: two entries that run past midnight and overlap in part', [E(1, 'acme', '2025-05-12T20:00', '2025-05-13T02:00'), E(2, 'acme', '2025-05-12T23:00', '2025-05-13T05:00')], { '2025-05-12': 540 }, [['acme', 720]]);
overlapCase('overlaps: entries that start on different days are not merged (regression)', [E(1, 'acme', '2025-05-12T22:00', '2025-05-13T03:00'), E(2, 'globex', '2025-05-13T01:00', '2025-05-13T02:00')], { '2025-05-12': 300, '2025-05-13': 60 }, [['acme', 300], ['globex', 60]]);
overlapCase('overlaps: entries that overlap across the October change are merged in real time', [E(1, 'acme', '2025-10-26T02:00', '2025-10-26T04:30'), E(2, 'globex', '2025-10-26T03:30', '2025-10-26T05:00')], { '2025-10-26': 240 }, [['acme', 210], ['globex', 150]]);
overlapCase('overlaps: entries listed out of order, and ids not in order', [E(7, 'acme', '2025-05-12T10:30', '2025-05-12T12:00'), E(3, 'acme', '2025-05-12T14:00', '2025-05-12T15:00'), E(9, 'globex', '2025-05-12T09:00', '2025-05-12T11:00'), E(2, 'acme', '2025-05-12T08:00', '2025-05-12T09:30')], { '2025-05-12': 300 }, [['acme', 240], ['globex', 120]]);
one('overlaps: a week sums its days, each project counts its entries in full, and amounts follow the full project totals', {
  entries: [
    E(1, 'acme', '2025-05-12T08:00', '2025-05-12T12:00'),
    E(2, 'acme', '2025-05-12T09:00', '2025-05-12T13:00'),
    E(3, 'globex', '2025-05-12T11:00', '2025-05-12T12:20'),
    E(4, 'acme', '2025-05-14T09:00', '2025-05-14T10:00'),
    E(5, 'globex', '2025-05-14T09:30', '2025-05-14T10:30'),
    E(6, 'globex', '2025-05-14T10:00', '2025-05-14T10:10'),
  ],
}, (sb) => {
  // Monday 08:00-13:00 is 300; Wednesday 09:00-10:30 is 90. Acme: 240 + 240 + 60, Globex: 80 + 60 + 10.
  ok(sb, ['report', '--week', '2025-W20'], week('2025-W20', '2025-05-12', { '2025-05-12': 300, '2025-05-14': 90 }, [['acme', 540], ['globex', 150]]));
});
one('overlaps: a running entry that overlaps a finished one counts once', { entries: [E(1, 'acme', '2025-05-12T09:00'), E(2, 'acme', '2025-05-12T10:00', '2025-05-12T11:00')] }, (sb) => {
  ok(sb, R('2025-05-12', '2025-05-12', '--now', '2025-05-12T12:00'), range('2025-05-12', '2025-05-12', { '2025-05-12': 180 }, [['acme', 240]]));
});

// --- running entries (issue 30) ---
one('running: a report with a timer running counts it up to --now', { entries: [E(1, 'acme', '2025-05-12T09:00', '2025-05-12T10:00'), E(2, 'globex', '2025-05-12T13:00')] }, (sb) => {
  ok(sb, ['report', '--week', '2025-W20', '--now', '2025-05-12T14:30'], week('2025-W20', '2025-05-12', { '2025-05-12': 150 }, [['acme', 60], ['globex', 90]]));
});
one('running: a timer that started days ago counts in full on the day it started', { entries: [E(1, 'acme', '2025-05-12T09:00')] }, (sb) => {
  ok(sb, ['report', '--week', '2025-W20', '--now', '2025-05-14T09:00'], week('2025-W20', '2025-05-12', { '2025-05-12': 2880 }, [['acme', 2880]]));
});
one('running: a timer is counted in the report of the week it started in only', { entries: [E(1, 'acme', '2025-05-12T09:00')] }, (sb) => {
  ok(sb, ['report', '--week', '2025-W21', '--now', '2025-05-14T09:00'], week('2025-W21', '2025-05-19', {}, []));
  ok(sb, ['report', '--now', '2025-05-13T10:00'], week('2025-W20', '2025-05-12', { '2025-05-12': 1500 }, [['acme', 1500]]));
});
one('running: the report shows the amount of a timer still running', { entries: [E(1, 'globex', '2025-05-12T09:00')] }, (sb) => {
  ok(sb, R('2025-05-12', '2025-05-12', '--now', '2025-05-12T09:20'), range('2025-05-12', '2025-05-12', { '2025-05-12': 20 }, [['globex', 20]]));
});
one('running: export has an empty end and the minutes so far (regression)', { entries: [E(1, 'acme', '2025-05-12T09:00', '2025-05-12T10:00', 'done'), E(2, 'globex', '2025-05-12T11:00', undefined, 'open')] }, (sb) => {
  ok(sb, ['export', '--now', '2025-05-12T12:05'], csv([HEADER, ['1', 'acme', '2025-05-12T09:00', '2025-05-12T10:00', '60', 'done'], ['2', 'globex', '2025-05-12T11:00', '', '65', 'open']]));
});
one('running: start prints the entry and stores it, with its note (regression)', {}, (sb) => {
  ok(sb, ['start', 'acme', '--note', 'api, v2', '--now', '2025-05-12T09:00'], 'started #1 2025-05-12T09:00\n');
  ok(sb, ['stop', '--now', '2025-05-12T10:15'], 'stopped #1 1:15\n');
  ok(sb, ['start', 'globex', '--at', '2025-05-12T11:00', '--now', '2025-05-12T12:00'], 'started #2 2025-05-12T11:00\n');
  assert.deepEqual(sb.entries(), [E(1, 'acme', '2025-05-12T09:00', '2025-05-12T10:15', 'api, v2'), E(2, 'globex', '2025-05-12T11:00', undefined)]);
});
one('running: a second timer, a stop with none running, and a stop before the start are errors (regression)', { entries: [E(1, 'acme', '2025-05-12T09:00')] }, (sb) => {
  bad(sb, ['start', 'globex', '--now', '2025-05-12T09:30']);
  bad(sb, ['stop', '--now', '2025-05-12T09:00']);
  bad(sb, ['stop', '--now', '2025-05-12T08:00']);
  assert.deepEqual(sb.entries(), [E(1, 'acme', '2025-05-12T09:00')]);
  const other = sandbox({ entries: [E(1, 'acme', '2025-05-12T09:00', '2025-05-12T10:00')] });
  try {
    bad(other, ['stop', '--now', '2025-05-12T11:00']);
  } finally {
    other.done();
  }
});

// --- durations (issue 17) ---
const durationRuns = (list) => list.map(([f, shown]) => ({ f, shown }));
each('durations: hours and minutes with a colon', durationRuns([['1:05', '1:05'], ['0:45', '0:45'], ['1:30', '1:30'], ['2:15', '2:15'], ['12:00', '12:00'], ['0:59', '0:59'], ['10:09', '10:09']]), (sb, s) => {
  ok(sb, ['add', 'acme', '2025-05-02T09:00', '--for', s.f], `added #1 ${s.shown}\n`);
});
each('durations: a colon form with minutes that are not two digits below 60 is an error', ['1:5', '1:60', '1:99', '1:', ':30', '1:123', '0:7', '1:30:00'].map((f) => ({ f })), (sb, s) => {
  bad(sb, ['add', 'acme', '2025-05-02T09:00', '--for', s.f]);
  assert.deepEqual(sb.entries(), []);
});
each('durations: 90m, 2h, 1h30m, 1.5h, 100m (regression)', durationRuns([['90m', '1:30'], ['2h', '2:00'], ['1h30m', '1:30'], ['1.5h', '1:30'], ['100m', '1:40'], ['1m', '0:01'], ['0.25h', '0:15'], ['8h', '8:00'], ['1h5m', '1:05']]), (sb, s) => {
  ok(sb, ['add', 'acme', '2025-05-02T09:00', '--for', s.f], `added #1 ${s.shown}\n`);
  assert.equal(sb.entries().length, 1);
});
each('durations: decimal hours round to the nearest minute, halves up', durationRuns([['0.025h', '0:02'], ['1.025h', '1:02'], ['0.125h', '0:08'], ['0.375h', '0:23'], ['0.875h', '0:53'], ['0.075h', '0:05'], ['1.333h', '1:20'], ['0.7h', '0:42'], ['2.99h', '2:59'], ['0.0084h', '0:01']]), (sb, s) => {
  ok(sb, ['add', 'acme', '2025-05-02T09:00', '--for', s.f], `added #1 ${s.shown}\n`);
});
each('durations: anything else is an error (regression)', ['', 'abc', '90', '1h30', '-5m', '1.5', '1,5h', 'h', 'm', '1h 30m', '1.5.5h', '--5m', '0m', '0h'].map((f) => ({ f })), (sb, s) => {
  bad(sb, ['add', 'acme', '2025-05-02T09:00', '--for', s.f]);
  assert.deepEqual(sb.entries(), []);
});
one('durations: hours are not padded and may pass 24 (regression)', {}, (sb) => {
  ok(sb, ['add', 'acme', '2025-05-02T09:00', '--for', '25h'], 'added #1 25:00\n');
  ok(sb, ['add', 'globex', '2025-05-05T09:00', '2025-05-05T09:05'], 'added #2 0:05\n');
  ok(sb, ['add', 'globex', '2025-05-06T09:00', '2025-05-06T18:30'], 'added #3 9:30\n');
  assert.equal(sb.entries()[0].end, '2025-05-03T10:00');
  ok(sb, R('2025-05-02', '2025-05-02'), range('2025-05-02', '2025-05-02', { '2025-05-02': 1500 }, [['acme', 1500]]));
});

// --- amounts (issue 24) ---
const entriesOf = (project, date, minutesList, startAt = 8 * 60) => {
  let at = startAt;
  return minutesList.map((m) => {
    const hhmm = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    const entry = { project, start: `${date}T${hhmm(at)}`, end: `${date}T${hhmm(at + m)}` };
    at += m + 10;
    return entry;
  });
};
const numbered = (list) => list.map((e, i) => E(i + 1, e.project, e.start, e.end));
function amountCase(name, list, opts = {}) {
  // list: [project, date, [minutes]] groups; the checker adds the entries up itself.
  const entries = [];
  const per = {};
  const totals = {};
  const next = {};
  for (const [project, date, minutesList] of list) {
    // Entries of one date follow each other, so that nothing overlaps.
    const start = 8 * 60 + (next[date] ?? 0);
    for (const e of entriesOf(project, date, minutesList, start)) entries.push(e);
    next[date] = (next[date] ?? 0) + minutesList.reduce((a, b) => a + b + 10, 0);
    const sum = minutesList.reduce((a, b) => a + b, 0);
    per[date] = (per[date] ?? 0) + sum;
    totals[project] = (totals[project] ?? 0) + sum;
  }
  const dates = [...new Set(list.map((g) => g[1]))].sort();
  one(name, { entries: numbered(entries), rates: opts.rates, currency: opts.currency }, (sb) => {
    const from = dates[0];
    const to = dates[dates.length - 1];
    ok(sb, R(from, to), range(from, to, per, Object.entries(totals), opts.rates ?? RATES, opts.currency ?? 'EUR'));
  });
}
amountCase('amounts: three entries of 20 minutes at 75.50 an hour make €75.50 (issue 24)', [['globex', '2025-05-12', [20, 20, 20]]]);
amountCase('amounts: 555 minutes at 75.50 an hour is 698.375, which rounds up to €698.38', [['globex', '2025-05-12', [200, 200, 155]]]);
amountCase('amounts: ten entries of 7 minutes at 25 an hour', [['acme', '2025-05-12', Array(10).fill(7)]], { rates: { acme: 2500 } });
amountCase('amounts: many short entries over several days and projects', [['acme', '2025-05-12', [13, 17, 19, 23]], ['acme', '2025-05-13', [11, 11, 11]], ['globex', '2025-05-13', [29, 31, 37]], ['globex', '2025-05-14', [1, 1, 1, 1, 1]]], { rates: { acme: 8333, globex: 6667 } });
amountCase('amounts: a rate that is a half cent a minute, one minute at a time', [['acme', '2025-05-12', Array(9).fill(1)]], { rates: { acme: 30 } });
amountCase('amounts: thousands separators and a large total', [['acme', '2025-05-12', [700]], ['acme', '2025-05-13', [700]], ['acme', '2025-05-14', [700]], ['acme', '2025-05-15', [700]], ['acme', '2025-05-16', [655]]], { rates: { acme: 25000 } });
amountCase('amounts: US dollars, with rates that do not divide evenly', [['acme', '2025-05-12', [10, 10, 10, 10, 10]], ['globex', '2025-05-12', [45, 45]]], { currency: 'USD', rates: { acme: 9999, globex: 12345 } });
amountCase('amounts: British pounds', [['acme', '2025-05-12', [25, 35, 45]]], { currency: 'GBP', rates: { acme: 11050 } });
amountCase('amounts: a currency without a symbol shows its code (regression)', [['acme', '2025-05-12', [90]]], { currency: 'CHF', rates: { acme: 14000 } });
amountCase('amounts: a rate of zero shows 0.00, a project without a rate shows no amount (regression)', [['acme', '2025-05-12', [45]], ['globex', '2025-05-12', [30]], ['misc', '2025-05-12', [15]]], { rates: { acme: 0, globex: 5000 } });
each('amounts: one entry at a time, rounded to the nearest cent, halves up', [[1, 1], [7, 9000], [20, 7550], [25, 7550], [30, 1], [90, 3333], [37, 1250], [59, 9999], [61, 4321], [100, 10], [1, 3000], [45, 650]].map(([m, r]) => ({ m, r, opts: { rates: { acme: r } } })), (sb, s) => {
  const e = E(1, 'acme', '2025-05-12T09:00', `2025-05-12T${String(9 + Math.floor((s.m) / 60)).padStart(2, '0')}:${String(s.m % 60).padStart(2, '0')}`);
  const box = sandbox({ rates: { acme: s.r }, entries: [e] });
  try {
    ok(box, R('2025-05-12', '2025-05-12'), range('2025-05-12', '2025-05-12', { '2025-05-12': s.m }, [['acme', s.m]], { acme: s.r }));
  } finally {
    box.done();
  }
});
amountCase('amounts: overlapping entries of one project are paid in full', [['acme', '2025-05-12', [120]]]);
// Random weeks: entries one after the other in May, so that nothing overlaps and no clock changes.
for (let k = 1; k <= 4; k++) {
  const r = prng(4200 + k);
  const rates = { acme: r.int(2000, 12000), globex: r.int(2000, 12000), zeta: r.int(1000, 9999) };
  const projects = ['acme', 'globex', 'zeta', 'misc'];
  const entries = [];
  const per = {};
  const totals = {};
  for (let d = 12; d <= 18; d++) {
    const date = `2025-05-${d}`;
    let at = 8 * 60;
    for (let n = r.int(0, 4); n > 0; n--) {
      at += r.int(0, 30);
      const len = r.int(3, 110);
      const hhmm = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
      const project = projects[r.int(0, 3)];
      entries.push(E(entries.length + 1, project, `${date}T${hhmm(at)}`, `${date}T${hhmm(at + len)}`));
      per[date] = (per[date] ?? 0) + len;
      totals[project] = (totals[project] ?? 0) + len;
      at += len;
    }
  }
  one(`random week #${k}: days, projects and amounts of a week of short entries`, { entries, rates }, (sb) => {
    ok(sb, ['report', '--week', '2025-W20'], week('2025-W20', '2025-05-12', per, Object.entries(totals), rates));
  });
}

// --- CSV (issue 15) ---
const row = (id, project, start, end, minutes, note) => [String(id), project, start, end, String(minutes), note];
const exportCase = (name, notes, opts = {}) => {
  const entries = notes.map((n, i) => E(i + 1, i % 2 ? 'globex' : 'acme', `2025-05-${String(12 + i).padStart(2, '0')}T09:00`, `2025-05-${String(12 + i).padStart(2, '0')}T10:${String(i * 5).padStart(2, '0')}`, n));
  one(name, { entries }, (sb) => {
    ok(sb, ['export', '--now', '2025-06-01T00:00'], csv([HEADER, ...entries.map((e, i) => row(e.id, e.project, e.start, e.end, 60 + i * 5, e.note))]));
  });
};
exportCase('csv export: a note with a comma is quoted (issue 15)', ['fixed login, then tests']);
exportCase('csv export: a note with double quotes is quoted and the quotes doubled', ['said "ok"', '"', 'a ""b"" c']);
exportCase('csv export: a note with a line break is quoted (LF, CR LF, CR)', ['two\nlines', 'cr\r\nlf', 'lone\rcr', 'end\n']);
exportCase('csv export: a note with all of them', ['a,"b"\nc,d\r\n"e"']);
exportCase('csv export: spaces, empty notes and other characters stay as they are (regression)', [' leading', 'trailing ', '  both  ', '', 'ünïcödé ✓', "it's", 'semi;colon\ttab']);
one('csv export: plain rows, in the order of the file, with ids as they are (regression)', { entries: [E(5, 'globex', '2025-05-13T09:00', '2025-05-13T09:45', 'late'), E(2, 'acme', '2025-05-12T09:00', '2025-05-12T11:30', 'early')] }, (sb) => {
  ok(sb, ['export'], csv([HEADER, row(5, 'globex', '2025-05-13T09:00', '2025-05-13T09:45', 45, 'late'), row(2, 'acme', '2025-05-12T09:00', '2025-05-12T11:30', 150, 'early')]));
});
one('csv export: no entries is the header alone (regression)', {}, (sb) => ok(sb, ['export'], 'id,project,start,end,minutes,note\n'));
const NASTY = ['fixed login, then tests', 'said "ok", twice', 'two\nlines', 'crlf\r\ninside', ' padded ', '', 'a,b\n"c"', ',', '"', '\n'];
one('csv: export, import into an empty file, export again gives the same rows', { entries: NASTY.map((n, i) => E(i + 1, i % 2 ? 'globex' : 'acme', `2025-05-${String(10 + i).padStart(2, '0')}T09:00`, `2025-05-${String(10 + i).padStart(2, '0')}T10:30`, n)) }, (sb) => {
  const first = sb.run('export', '--now', '2025-06-01T00:00');
  assert.equal(first.code, 0, brief(first));
  assert.equal(first.stdout, csv([HEADER, ...NASTY.map((n, i) => row(i + 1, i % 2 ? 'globex' : 'acme', `2025-05-${String(10 + i).padStart(2, '0')}T09:00`, `2025-05-${String(10 + i).padStart(2, '0')}T10:30`, 90, n))]));
  const other = sandbox({});
  try {
    other.write('in.csv', first.stdout);
    ok(other, ['import', 'in.csv'], `imported ${NASTY.length}\n`);
    assert.deepEqual(other.entries().map((e) => e.note), NASTY);
    ok(other, ['export', '--now', '2025-06-01T00:00'], first.stdout);
  } finally {
    other.done();
  }
});
const importCase = (name, text, notes, extra = {}) =>
  one(name, extra.opts ?? {}, (sb) => {
    sb.write('in.csv', text);
    ok(sb, ['import', 'in.csv'], `imported ${notes.length}\n`);
    const entries = sb.entries();
    const added = entries.slice(entries.length - notes.length);
    assert.deepEqual(added.map((e) => e.note), notes);
    if (extra.after) extra.after(sb, entries);
  });
const csvHead = 'id,project,start,end,minutes,note\n';
importCase('csv import: a quoted note with a comma (issue 15)', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,"fixed login, then tests"\n2,globex,2025-05-13T09:00,2025-05-13T10:00,60,plain\n`, ['fixed login, then tests', 'plain'], {
  after: (sb, entries) => assert.deepEqual(entries.map((e) => [e.project, e.start, e.end]), [['acme', '2025-05-12T09:00', '2025-05-12T10:00'], ['globex', '2025-05-13T09:00', '2025-05-13T10:00']]),
});
importCase('csv import: doubled quotes inside a quoted note', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,"said ""ok"", twice"\n2,acme,2025-05-13T09:00,2025-05-13T10:00,60,""""\n`, ['said "ok", twice', '"']);
importCase('csv import: a quoted note with line breaks', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,"two\nlines"\n2,acme,2025-05-13T09:00,2025-05-13T10:00,60,"a\r\nb"\n3,acme,2025-05-14T09:00,2025-05-14T10:00,60,x\n`, ['two\nlines', 'a\r\nb', 'x']);
importCase('csv import: rows ended by CR LF, and no line break after the last row', `${csvHead.replace('\n', '\r\n')}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,first\r\n2,acme,2025-05-13T09:00,2025-05-13T10:00,60,last`, ['first', 'last']);
importCase('csv import: a final blank line is not a row', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,only\n\n`, ['only']);
importCase('csv import: spaces in notes are kept, and a note can be empty (regression)', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60, padded \n2,acme,2025-05-13T09:00,2025-05-13T10:00,60,\n`, [' padded ', '']);
one('csv import: the minutes column is recomputed and the id column is not used', {}, (sb) => {
  sb.write('in.csv', `${csvHead}41,acme,2025-05-12T09:00,2025-05-12T10:30,999,a\n7,globex,2025-05-13T09:00,2025-05-13T09:45,,b\n`);
  ok(sb, ['import', 'in.csv'], 'imported 2\n');
  assert.deepEqual(sb.entries(), [E(1, 'acme', '2025-05-12T09:00', '2025-05-12T10:30', 'a'), E(2, 'globex', '2025-05-13T09:00', '2025-05-13T09:45', 'b')]);
  ok(sb, ['export'], csv([HEADER, row(1, 'acme', '2025-05-12T09:00', '2025-05-12T10:30', 90, 'a'), row(2, 'globex', '2025-05-13T09:00', '2025-05-13T09:45', 45, 'b')]));
});
one('csv import: new ids go on from the highest id in the file (regression)', { entries: [E(2, 'acme', '2025-05-01T09:00', '2025-05-01T10:00', 'old'), E(8, 'acme', '2025-05-02T09:00', '2025-05-02T10:00', 'old')] }, (sb) => {
  sb.write('in.csv', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,"x, y"\n2,acme,2025-05-13T09:00,2025-05-13T10:00,60,z\n`);
  ok(sb, ['import', 'in.csv'], 'imported 2\n');
  assert.deepEqual(sb.entries().map((e) => [e.id, e.note]), [[2, 'old'], [8, 'old'], [9, 'x, y'], [10, 'z']]);
});
one('csv import: a row without an end is a running entry; a second one is an error', {}, (sb) => {
  sb.write('in.csv', `${csvHead}1,acme,2025-05-12T09:00,,5,"open, still"\n`);
  ok(sb, ['import', 'in.csv'], 'imported 1\n');
  assert.deepEqual(sb.entries(), [E(1, 'acme', '2025-05-12T09:00', undefined, 'open, still')]);
  bad(sb, ['import', 'in.csv']);
  assert.equal(sb.entries().length, 1);
});
each('csv import: a wrong file is an error and nothing is imported', [
  ['a wrong header', 'id,project,start,end,note\n1,acme,2025-05-12T09:00,2025-05-12T10:00,x\n'],
  ['no header', '1,acme,2025-05-12T09:00,2025-05-12T10:00,60,x\n'],
  ['an empty file', ''],
  ['a row with too few columns', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,x\n2,acme,2025-05-13T09:00\n`],
  ['a row with too many columns', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,x,y\n`],
  ['a time that is not a time', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,x\n2,acme,tomorrow,2025-05-13T10:00,60,y\n`],
  ['an end before the start', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,x\n2,acme,2025-05-13T11:00,2025-05-13T10:00,60,y\n`],
  ['a time that does not exist', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,x\n2,acme,2025-03-30T03:30,2025-03-30T05:00,60,y\n`],
  ['a project name that is not allowed', `${csvHead}1,not ok,2025-05-12T09:00,2025-05-12T10:00,60,x\n`],
  ['a quoted field that is never closed', `${csvHead}1,acme,2025-05-12T09:00,2025-05-12T10:00,60,"x\n`],
].map(([what, text]) => ({ what, text })), (sb, s) => {
  sb.write('in.csv', s.text);
  bad(sb, ['import', 'in.csv']);
  assert.deepEqual(sb.entries(), [], s.what);
});
one('csv import: a file that is not there is an error', {}, (sb) => bad(sb, ['import', 'nothing.csv']));

// --- everything else that already works (regression) ---
one('add: prints the entry, stores it with its note, and gives the next id after the highest (regression)', { entries: [E(3, 'acme', '2025-05-01T09:00', '2025-05-01T10:00'), E(7, 'acme', '2025-05-02T09:00', '2025-05-02T10:00')] }, (sb) => {
  ok(sb, ['add', 'globex', '2025-05-12T09:00', '2025-05-12T16:30', '--note', 'design, review'], 'added #8 7:30\n');
  ok(sb, ['add', 'acme', '2025-05-13T09:00', '--for', '45m'], 'added #9 0:45\n');
  const entries = sb.entries();
  assert.deepEqual(entries.slice(2), [E(8, 'globex', '2025-05-12T09:00', '2025-05-12T16:30', 'design, review'), E(9, 'acme', '2025-05-13T09:00', '2025-05-13T09:45')]);
});
one('add: an entry that goes past midnight is stored whole and counts on its start date (regression)', {}, (sb) => {
  ok(sb, ['add', 'acme', '2025-05-12T23:00', '2025-05-13T02:30'], 'added #1 3:30\n');
  ok(sb, R('2025-05-12', '2025-05-13'), range('2025-05-12', '2025-05-13', { '2025-05-12': 210 }, [['acme', 210]]));
});
each('add: mistakes are errors and change nothing (regression)', [
  ['add', 'acme', '2025-05-12T10:00', '2025-05-12T09:00'],
  ['add', 'acme', '2025-05-12T10:00', '2025-05-12T10:00'],
  ['add', 'acme', '2025-05-12T10:00'],
  ['add', 'acme', '2025-05-12T10:00', '2025-05-12T11:00', '--for', '1h'],
  ['add', 'bad name', '2025-05-12T10:00', '--for', '1h'],
  ['add', 'acme', '2025-05-12', '--for', '1h'],
  ['add', 'acme', '2025-02-30T10:00', '--for', '1h'],
  ['add', 'acme', '2025-05-12T25:00', '--for', '1h'],
  ['add', 'acme', '2025-05-12 10:00', '--for', '1h'],
  ['add', '2025-05-12T10:00', '--for', '1h'],
  ['add', 'acme', '2025-05-12T10:00', '--for'],
  ['add', 'acme', '2025-05-12T10:00', '--for', '1h', '--colour', 'red'],
].map((args) => ({ args })), (sb, s) => {
  bad(sb, s.args);
  assert.deepEqual(sb.entries(), []);
});
one('report: projects in alphabetical order, entries outside the range left out, a project without a rate has no amount (regression)', {
  entries: [E(1, 'zeta', '2025-05-12T09:00', '2025-05-12T09:30'), E(2, 'globex', '2025-05-12T10:00', '2025-05-12T10:45'), E(3, 'acme', '2025-05-13T10:00', '2025-05-13T11:00'), E(4, 'acme', '2025-05-11T10:00', '2025-05-11T11:00'), E(5, 'acme', '2025-05-19T10:00', '2025-05-19T11:00')],
}, (sb) => {
  ok(sb, ['report', '--week', '2025-W20'], week('2025-W20', '2025-05-12', { '2025-05-12': 75, '2025-05-13': 60 }, [['zeta', 30], ['globex', 45], ['acme', 60]]));
});
one('report: with nothing tracked the report ends at the total (regression)', {}, (sb) => {
  ok(sb, ['report', '--week', '2025-W20'], week('2025-W20', '2025-05-12', {}, []));
  ok(sb, R('2025-05-12', '2025-05-12'), 'Report 2025-05-12 to 2025-05-12\nMon 2025-05-12    0:00\nTotal             0:00\n');
});
one('report: days longer than a day and long totals show h:mm with unpadded hours (regression)', { entries: [E(1, 'acme', '2025-05-12T00:00', '2025-05-13T06:30'), E(2, 'acme', '2025-05-14T00:00', '2025-05-15T23:59'), E(3, 'globex', '2025-05-16T00:00', '2025-05-16T00:07')] }, (sb) => {
  ok(sb, ['report', '--week', '2025-W20'], week('2025-W20', '2025-05-12', { '2025-05-12': 1830, '2025-05-14': 2879, '2025-05-16': 7 }, [['acme', 4709], ['globex', 7]]));
});
each('data file: a missing file, a file that is not JSON and an unknown time zone are errors (regression)', [
  { opts: { raw: 'not json' } },
  { opts: { raw: JSON.stringify({ timeZone: 'Mars/Olympus', currency: 'EUR', rates: {}, entries: [] }) } },
  { opts: { raw: JSON.stringify({ currency: 'EUR', rates: {}, entries: [] }) } },
  { opts: {}, missing: true },
], (sb, s) => {
  const args = s.missing ? ['report', '--week', '2025-W20', '--data', 'nowhere.json'] : ['report', '--week', '2025-W20'];
  bad(sb, args);
});
one('--data names the data file, and the entries go there (regression)', { file: 'other.json' }, (sb) => {
  sb.write('other.json', JSON.stringify({ timeZone: ATH, currency: 'EUR', rates: { acme: 9000 }, entries: [] }));
  ok(sb, ['add', 'acme', '2025-05-12T09:00', '--for', '1h', '--data', 'other.json'], 'added #1 1:00\n');
  assert.deepEqual(sb.entries(), [E(1, 'acme', '2025-05-12T09:00', '2025-05-12T10:00')]);
});
each('commands: an unknown command, an unknown option and a missing value are errors (regression)', [[], ['frobnicate'], ['report', '--colour', 'red'], ['report', '--week'], ['import'], ['start']].map((args) => ({ args })), (sb, s) => bad(sb, s.args));

// --- the repository itself ---
function seedTestCount() {
  return 28;
}
const countTests = () => {
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.m?js$/.test(e.name)) n += (fs.readFileSync(p, 'utf8').match(/\b(?:test|it)\s*\(/g) ?? []).length;
    }
  };
  if (fs.existsSync(path.join(dir, 'test'))) walk(path.join(dir, 'test'));
  return n;
};
add('npm test (node --test) passes', () => {
  const r = spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', env: { ...process.env, TZ: 'America/New_York' } });
  assert.equal(r.status, 0, `node --test: exit ${r.status}\n${String(r.stdout).split('\n').filter((l) => /^not ok|# fail/.test(l)).slice(0, 5).join('\n')}`);
});
add('tests were added for the fixes (at least five more than before)', () => {
  assert.ok(countTests() >= seedTestCount() + 5, `${countTests()} tests, there were ${seedTestCount()}`);
});
add('CHANGELOG.md has a line for each of the seven issues', () => {
  const text = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
  // The seed's changelog names no issue numbers, so either will do: seven more lines than its seven, or every number.
  const lines = (text.match(/^\s*[-*] \S/gm) ?? []).length;
  const missing = [12, 15, 17, 21, 24, 27, 30].filter((n) => !new RegExp(`(#|issue\\s*)${n}\\b`, 'i').test(text));
  assert.ok(lines >= 7 + 7 || missing.length === 0, `${lines - 7} new lines, and no mention of issue(s) ${missing.join(', ')}`);
});

// ---------- running ----------
const failed = [];
for (const c of cases) {
  try {
    await c.fn();
  } catch (e) {
    failed.push(c.name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${String(e?.message ?? e).split('\n').slice(0, 3).join(' | ').slice(0, 600)}`);
  }
}
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
