// What the machine switcher says about other machines: the sessions that finished (or need you) since you last looked at
// a machine (machine-news.ts), and when "looked at" is.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/machine-news-test.ts && DATA_DIR=/tmp/hydor-test-machine-news node dist/dev/machine-news-test.js
import assert from 'node:assert/strict';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const { briefOf, Looked, newsOf, NEWS_MAX } = await import('./machine-news.ts');

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

const T = Date.UTC(2026, 10, 18, 12);
const ses = (key: string, o: Partial<import('./machine-news.ts').Brief> = {}) => ({ key, title: `Session ${key}`, ...o });

test('only what finished after you last looked counts, whatever the status says of the rest', () => {
  const r = newsOf(
    [
      ses('old', { status: 'idle', doneAt: T - 5000 }),
      ses('new', { status: 'idle', doneAt: T + 1000 }),
      ses('never', { status: 'idle' }),
      ses('w', { status: 'waiting', doneAt: T + 2000 }),
      ses('run', { status: 'working', doneAt: T + 3000 }),
      ses('start', { status: 'starting' }),
    ],
    T,
  );
  assert.equal(r.finished, 1);
  assert.deepEqual(r.news, [{ key: 'new', title: 'Session new', at: T + 1000 }]);
  assert.equal(r.waiting, 1);
  assert.equal(r.working, 2);
});

test('a session you opened since it finished is not news', () => {
  const r = newsOf([ses('a', { doneAt: T + 1000, seenAt: T + 2000 }), ses('b', { doneAt: T + 1000, seenAt: T + 500 })], 0);
  assert.deepEqual(
    r.news.map((n) => n.key),
    ['b'],
  );
});

test('newest first, at most five listed, all counted', () => {
  const list = Array.from({ length: 8 }, (_, i) => ses(`s${i}`, { status: 'idle', doneAt: T + i * 1000 }));
  const r = newsOf(list, T - 1);
  assert.equal(r.finished, 8);
  assert.equal(r.news.length, NEWS_MAX);
  assert.deepEqual(
    r.news.map((n) => n.key),
    ['s7', 's6', 's5', 's4', 's3'],
  );
});

test('while you look at a machine nothing there is news (lookedAt is Infinity)', () => {
  const r = newsOf([ses('a', { doneAt: T })], Infinity);
  assert.equal(r.finished, 0);
  assert.deepEqual(r.news, []);
});

test('archived sessions, subagents and sessions whose helpers still run are not news; a failed end is, at its end time', () => {
  const r = newsOf(
    [
      ses('arch', { doneAt: T + 1, hidden: true }),
      ses('busy', { doneAt: T + 1, busy: true }),
      ses('bad', { status: 'error', failed: true, doneAt: T - 100, endedAt: T + 50 }),
      ses('ok', { doneAt: T + 10 }),
    ],
    T,
  );
  assert.deepEqual(r.news, [
    { key: 'bad', title: 'Session bad', at: T + 50, failed: true },
    { key: 'ok', title: 'Session ok', at: T + 10 },
  ]);
});

test('briefOf reads a summary: its live status first, then an outside client\'s', () => {
  const base = { key: 'k', title: 'T', agent: 'claude', id: 'i', stats: {} } as any;
  assert.equal(briefOf({ ...base, live: { status: 'working' }, external: { status: 'idle' } }).status, 'working');
  assert.equal(briefOf({ ...base, external: { status: 'waiting' } }).status, 'waiting');
  assert.equal(briefOf({ ...base, live: { status: 'error' } }).failed, true);
  assert.equal(briefOf({ ...base, archived: true }).hidden, true);
  assert.equal(briefOf({ ...base, subagentOf: 'x' }).hidden, true);
  assert.equal(briefOf({ ...base, helpers: 2 }).busy, true);
});

test('Looked: a machine starts from now (no backlog), and is looked at while a page shows it', () => {
  let now = T;
  let saved: Record<string, number> = {};
  const changes: string[] = [];
  const l = new Looked({}, (k) => (saved = { ...k }), () => now);
  l.on('change', (id) => changes.push(id));
  assert.equal(l.at('a'), T, 'first time: now');
  assert.equal(saved.a, T, 'kept');
  now = T + 1000;
  assert.equal(l.at('a'), T, 'stays at that time');
  const leave1 = l.enter('a');
  const leave2 = l.enter('a');
  assert.equal(l.at('a'), Infinity, 'looked at now');
  now = T + 5000;
  leave1();
  leave1();
  assert.equal(l.at('a'), Infinity, 'a second page still shows it');
  leave2();
  assert.equal(l.at('a'), T + 5000, 'the last page left');
  assert.equal(saved.a, T + 5000);
  assert.deepEqual(changes, ['a', 'a'], 'told when the first page came and when the last left');
});

test('Looked: a restart keeps what was saved; flush counts what is looked at as seen up to now; forget drops a machine', () => {
  let now = T;
  let saved: Record<string, number> = { a: T - 99_000, b: T - 5 };
  const l = new Looked(saved, (k) => (saved = { ...k }), () => now);
  assert.equal(l.at('a'), T - 99_000, 'not made new by a start');
  l.enter('b');
  now = T + 7;
  l.flush();
  assert.equal(saved.b, T + 7);
  assert.equal(saved.a, T - 99_000);
  l.forget('a');
  assert.equal('a' in saved, false);
});

test('an unread backlog does not count on the first look: 140 old unread sessions of 500', () => {
  const start = T;
  const l = new Looked({}, () => {}, () => start);
  const list = Array.from({ length: 500 }, (_, i) => ses(`s${i}`, { status: 'idle', doneAt: i < 140 ? start - (i + 1) * 3600_000 * 24 : undefined }));
  assert.equal(newsOf(list, l.at('m')).finished, 0);
});

console.log(`${passed} passed`);
