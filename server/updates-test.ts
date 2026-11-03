// The decisions updates.ts makes about new versions, as plain functions: when a copy from git installs one by itself
// (after 5 hours without a message from you, once a day), when the Mac app downloads one by itself (at once, unless
// it had to roll that version back), when it says so and installs it (a minute later, or after Later's 4 hours), how
// the pages see a waiting version, and how often each kind looks. desktop-test.ts runs the Mac app's whole flow.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/updates-test.ts && DATA_DIR=/tmp/hydor-test-updates node dist/dev/updates-test.js
import assert from 'node:assert/strict';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const { APP_EVERY, LATER, NOTICE, RETRY, appDownloadDue, appInstallTimes, autoUpdateDue, checkTimes, readyView } = await import('./updates.ts');

const HOUR = 3600_000;
const NOW = Date.UTC(2026, 10, 3, 12);
let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

test('from git: it installs by itself after 5 hours without a message from you, at most once a day', () => {
  const s = { now: NOW, on: true, canRestart: true, behind: 3, running: false, autoAt: NOW - 25 * HOUR, lastMessage: NOW - 6 * HOUR };
  assert.equal(autoUpdateDue(s), true);
  assert.equal(autoUpdateDue({ ...s, lastMessage: NOW - 4 * HOUR }), false, 'you wrote 4 hours ago');
  assert.equal(autoUpdateDue({ ...s, autoAt: NOW - 20 * HOUR }), false, 'it updated today');
  assert.equal(autoUpdateDue({ ...s, behind: 0 }), false, 'nothing new');
  assert.equal(autoUpdateDue({ ...s, on: false }), false, 'Update automatically is off');
  assert.equal(autoUpdateDue({ ...s, canRestart: false }), false, 'it cannot restart itself');
  assert.equal(autoUpdateDue({ ...s, running: true }), false, 'an update runs');
});

test('the Mac app downloads a newer version by itself at once, with no wait for you to be away', () => {
  const s = { now: NOW, on: true, canRestart: true, latest: '0.17.0', current: '0.16.0', running: false, failedAt: 0 };
  assert.equal(appDownloadDue(s), true, 'you sent a message a minute ago: no matter');
  assert.equal(appDownloadDue({ ...s, on: false }), false, 'Update automatically is off: Update now does it');
  assert.equal(appDownloadDue({ ...s, canRestart: false }), false, 'not in a folder it may replace itself in');
  assert.equal(appDownloadDue({ ...s, latest: undefined }), false, 'nothing newer is out');
  assert.equal(appDownloadDue({ ...s, latest: '0.16.0' }), false, 'the version it runs');
  assert.equal(appDownloadDue({ ...s, latest: '0.15.2' }), false, 'an older one');
  assert.equal(appDownloadDue({ ...s, running: true }), false, 'a download runs already');
  assert.equal(appDownloadDue({ ...s, skip: '0.17.0' }), false, 'that version had to be rolled back: only Update now installs it');
  assert.equal(appDownloadDue({ ...s, skip: '0.16.5' }), true, 'another version was rolled back');
  assert.equal(appDownloadDue({ ...s, ready: '0.17.0' }), false, 'it waits already');
  assert.equal(appDownloadDue({ ...s, ready: '0.16.5' }), true, 'a newer one than the one waiting');
  assert.equal(appDownloadDue({ ...s, failedAt: NOW - 10 * 60_000 }), false, 'the last try failed 10 minutes ago');
  assert.equal(appDownloadDue({ ...s, failedAt: NOW - RETRY }), true, 'an hour later it tries again');
});

test('a downloaded version is said at once and installs a minute later, unless Later put it off', () => {
  assert.equal(NOTICE, 60_000);
  assert.deepEqual(appInstallTimes(NOW, '0.17.0'), { askAt: NOW, installAt: NOW + 60_000 });
  assert.equal(LATER, 4 * HOUR);
  const later = { version: '0.17.0', until: NOW + 3 * HOUR };
  assert.deepEqual(appInstallTimes(NOW, '0.17.0', later), { askAt: NOW + 3 * HOUR, installAt: NOW + 3 * HOUR + 60_000 }, 'put off: it asks again then');
  assert.deepEqual(appInstallTimes(NOW, '0.17.1', later), { askAt: NOW, installAt: NOW + 60_000 }, 'Later was for another version');
  assert.deepEqual(appInstallTimes(NOW, '0.17.0', { ...later, until: NOW - 1 }), { askAt: NOW, installAt: NOW + 60_000 }, 'its time has come');
  assert.deepEqual(appInstallTimes(NOW, '0.17.0', null, 5000), { askAt: NOW, installAt: NOW + 5000 });
});

test('the pages see a waiting version counting down, put off until a time, or waiting for you', () => {
  const r = { version: '0.17.0', at: NOW - 1000, askAt: NOW - 1000, installAt: NOW + 59_000 };
  assert.deepEqual(readyView(r, NOW), { version: '0.17.0', at: NOW - 1000, installIn: 59_000 });
  assert.deepEqual(readyView(r, NOW + 70_000), { version: '0.17.0', at: NOW - 1000, installIn: 0 }, 'its minute is up');
  assert.deepEqual(readyView({ ...r, askAt: NOW + 4 * HOUR, installAt: NOW + 4 * HOUR + 60_000 }, NOW), { version: '0.17.0', at: NOW - 1000, later: NOW + 4 * HOUR });
  assert.deepEqual(readyView({ ...r, askAt: 0, installAt: 0 }, NOW), { version: '0.17.0', at: NOW - 1000 }, 'updates off: Restart now only');
});

test('how often each kind looks: the Mac app soon after it starts and every 4 hours, from git daily', () => {
  assert.equal(APP_EVERY, 4 * HOUR);
  assert.deepEqual(checkTimes('app', false), { first: 30_000, every: 4 * HOUR });
  assert.deepEqual(checkTimes('app', true), { first: 60_000, every: 4 * HOUR });
  assert.deepEqual(checkTimes('git', true), { first: 3 * 60_000, every: 24 * HOUR });
});

console.log(`${passed} passed`);
process.exit(0);
