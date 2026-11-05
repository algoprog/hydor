// The decisions updates.ts makes about new versions, as plain functions: when a copy from git installs one by itself
// (after 5 hours without a message from you, once a day), when the Mac app downloads one by itself (at once, unless
// it had to roll that version back), when it says so and installs it (a minute later, or after Later's 4 hours), how
// the pages see a waiting version, and how often each kind looks. desktop-test.ts runs the Mac app's whole flow.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/updates-test.ts && DATA_DIR=/tmp/hydor-test-updates node dist/dev/updates-test.js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const { APP_EVERY, LATER, NOTICE, RETRY, STALL, WAITS, appDownloadDue, appInstallTimes, autoUpdateDue, checkTimes, download, readyView } = await import('./updates.ts');

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

// ---- downloads: a server that breaks off, goes quiet, sends the whole file again, refuses, or is not there ----
const FILE = Buffer.from(Array.from({ length: 3_000_000 }, (_, i) => (i * 7) % 251));
const sha = (b: Buffer) => createHash('sha512').update(b).digest('base64');
const WANT = { size: FILE.length, sha512: sha(FILE) };
/** What the next requests get: a third of the file and then the connection cut, or gone quiet; the connection reset at once; the whole file whatever the range; a 404. Then the file as asked. */
let plan: ('cut' | 'quiet' | 'reset' | 'whole' | 'missing')[] = [];
/** Each request's range. */
const asked: (string | undefined)[] = [];
const server = http.createServer((req, res) => {
  asked.push(req.headers.range);
  const how = plan.shift();
  if (how === 'missing') return void res.writeHead(404).end();
  if (how === 'reset') return void req.socket.destroy();
  const from = how === 'whole' ? 0 : Number(/^bytes=(\d+)-$/.exec(req.headers.range ?? '')?.[1] ?? 0);
  if (from >= FILE.length) return void res.writeHead(416, { 'content-range': `bytes */${FILE.length}` }).end();
  const body = FILE.subarray(from);
  res.writeHead(from ? 206 : 200, { 'content-length': body.length, ...(from ? { 'content-range': `bytes ${from}-${FILE.length - 1}/${FILE.length}` } : {}) });
  if (!how || how === 'whole') return void res.end(body);
  res.write(body.subarray(0, 1_000_000));
  if (how === 'cut') setTimeout(() => req.socket.destroy(), 100);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/Hydor.zip`;
const dir = path.join(process.env.DATA_DIR!, 'downloads');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const at = (name: string) => path.join(dir, name);
const got = (file: string) => fs.existsSync(file) && sha(fs.readFileSync(file)) === WANT.sha512 && !fs.existsSync(`${file}.part`);
const quick = { stall: 2000, waits: [20, 20] };
const atest = async (name: string, fn: () => Promise<void>) => {
  plan = [];
  asked.length = 0;
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
};

test('a download goes on while bytes come, drops a try after a minute without any, and waits a little longer each time one gets no further', () => {
  assert.equal(STALL, 60_000);
  assert.deepEqual(WAITS, [3_000, 10_000, 30_000, 60_000]);
});

await atest('a download that breaks off carries on from its last byte', async () => {
  plan = ['cut'];
  await download(url, at('cut.zip'), WANT, quick);
  assert.ok(got(at('cut.zip')), 'the whole file, checked');
  assert.equal(asked.length, 2);
  assert.equal(asked[0], undefined, 'the first try asks for all of it');
  assert.match(asked[1] ?? '', /^bytes=[1-9]\d*-$/, 'the second from where the first stopped');
});

await atest('one that goes quiet is dropped after the stall, and the next try carries on', async () => {
  plan = ['quiet'];
  const t = Date.now();
  await download(url, at('quiet.zip'), WANT, { ...quick, stall: 300 });
  assert.ok(got(at('quiet.zip')));
  assert.ok(Date.now() - t >= 300, 'it waited out the stall');
  assert.match(asked[1] ?? '', /^bytes=[1-9]\d*-$/);
});

await atest('tries that get no further wait and try again; when they run out, what it got stays for the next download', async () => {
  plan = ['cut', 'reset', 'reset', 'reset'];
  await assert.rejects(download(url, at('stops.zip'), WANT, quick), /^Error: the download stopped at \d of 3 MB \(the connection broke off\); the next try carries on from there$/);
  assert.equal(asked.length, 4, 'one that got somewhere, then three that did not: the first and the two waits');
  const kept = fs.statSync(at('stops.zip.part')).size;
  assert.ok(kept > 0 && kept < FILE.length, `part of it is kept (${kept} bytes)`);
  asked.length = 0;
  await download(url, at('stops.zip'), WANT, quick);
  assert.equal(asked[0], `bytes=${kept}-`, 'the next download carries on from it');
  assert.ok(got(at('stops.zip')));
});

await atest('a server that sends the whole file again, whatever the range, has it start over', async () => {
  fs.writeFileSync(at('whole.zip.part'), Buffer.alloc(500_000, 9));
  plan = ['whole'];
  await download(url, at('whole.zip'), WANT, quick);
  assert.equal(asked[0], 'bytes=500000-');
  assert.ok(got(at('whole.zip')), 'the part it had is written over');
});

await atest('a download that is not the build the release names is refused, and nothing of it kept', async () => {
  await assert.rejects(download(url, at('other.zip'), { ...WANT, sha512: sha(Buffer.from('another build')) }, quick), /checksum differs/);
  assert.ok(!fs.existsSync(at('other.zip')) && !fs.existsSync(at('other.zip.part')));
  await assert.rejects(download(url, at('longer.zip'), { ...WANT, size: FILE.length + 10 }, quick), /checksum differs/, 'a file shorter than the release says');
  assert.ok(!fs.existsSync(at('longer.zip.part')));
});

await atest('a refusal (404) fails at once, without trying again', async () => {
  plan = ['missing'];
  await assert.rejects(download(url, at('missing.zip'), WANT, quick), /^Error: the download failed \(404\)$/);
  assert.equal(asked.length, 1);
});

await atest('with nothing there, it says it could not reach it', async () => {
  const closed = net.createServer();
  await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
  const port = (closed.address() as net.AddressInfo).port;
  await new Promise((r) => closed.close(r));
  await assert.rejects(download(`http://127.0.0.1:${port}/Hydor.zip`, at('nothing.zip'), WANT, quick), new RegExp(`^Error: could not reach 127\\.0\\.0\\.1:${port} \\(ECONNREFUSED\\)$`));
});

server.closeAllConnections();
server.close();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`${passed} passed`);
process.exit(0);
