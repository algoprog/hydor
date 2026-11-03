// Checks for the Mac app's updates (server/updates.ts with desktop.ts): the newest release says a version is out;
// a download that is not the build the release names is refused; a good one is unpacked and handed to the app
// to install; a version the app had to roll back is reported and not installed by itself again. The test plays
// the Mac app: it starts itself again as the server's side, with a message channel, as mac/main.cjs does, and
// stands in for macOS's ditto. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/desktop-test.ts && DATA_DIR=/tmp/naget-test-desktop node dist/dev/desktop-test.js
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ZIP = Buffer.from('the build, as the release carries it');
const sha = (b: Buffer) => createHash('sha512').update(b).digest('base64');

if (process.env.NAGET_DESKTOP !== 'mac') {
  // ---- the Mac app's side: a release to download, and the server started with a message channel ----
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-desktop-'));
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  // ditto -x -k <zip> <folder> unpacks; the stand-in puts an app there.
  fs.writeFileSync(path.join(bin, 'ditto'), '#!/bin/sh\n[ "$1" = -x ] && mkdir -p "$4/Naget Agent.app/Contents" && exit 0\nexec cp -R "$1" "$2"\n', { mode: 0o755 });
  const server = http.createServer((req, res) => {
    const feed = (sum: string) => JSON.stringify({ version: '9.9.9', files: { [process.arch]: { url: `http://127.0.0.1:${port}/app.zip`, sha512: sum, size: ZIP.length } } });
    if (req.url === '/good.json') res.end(feed(sha(ZIP)));
    else if (req.url === '/bad.json') res.end(feed(sha(Buffer.from('another build'))));
    else if (req.url === '/app.zip') res.end(ZIP);
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const run = (extra: Record<string, string>) =>
    new Promise<{ messages: { type: string; [k: string]: unknown }[]; code: number | null }>((resolve) => {
      const messages: { type: string }[] = [];
      const child = fork(fileURLToPath(import.meta.url), [], {
        env: {
          ...process.env,
          DATA_DIR: path.join(tmp, 'data'),
          HOME: tmp,
          PATH: `${bin}:${process.env.PATH}`,
          NAGET_DESKTOP: 'mac',
          NAGET_DESKTOP_APP: path.join(tmp, 'Applications/Naget Agent.app'),
          NAGET_DESKTOP_UPDATABLE: '1',
          NAGET_DESKTOP_CACHE: path.join(tmp, 'cache'),
          NAGET_TEST_FEED: `http://127.0.0.1:${port}`,
          ...extra,
        },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
      child.on('message', (m) => messages.push(m as { type: string }));
      child.on('exit', (code) => resolve({ messages: messages as never, code }));
    });
  try {
    const first = await run({});
    assert.equal(first.code, 0, 'the checks passed');
    const install = first.messages.find((m) => m.type === 'install');
    assert.ok(install, 'the app was asked to install the new version');
    assert.equal(install.to, '9.9.9');
    assert.ok(fs.existsSync(path.join(String(install.app), 'Contents')), 'the new version is unpacked where the app is told');
    console.log('  ok  a good download is unpacked and handed to the app to install');
    const second = await run({ NAGET_UPDATE_ERROR: JSON.stringify({ from: '0.1.0', to: '9.9.9', error: 'Version 9.9.9 did not start' }), NAGET_TEST_ROLLED_BACK: '1' });
    assert.equal(second.code, 0, 'the rolled-back checks passed');
    console.log(`${first.messages.filter((m) => m.type === 'passed').length + second.messages.filter((m) => m.type === 'passed').length + 1} passed`);
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
} else {
  // ---- the server's side ----
  const { openDb, kvGet } = await import('./db.ts');
  const { checkUpdates, startUpdate, updateState, watchUpdates } = await import('./updates.ts');
  fs.mkdirSync(process.env.DATA_DIR!, { recursive: true });
  const db = openDb(path.join(process.env.DATA_DIR!, 'test.db'));
  watchUpdates(db, () => {});
  const feed = (name: string) => (process.env.NAGET_UPDATE_FEED = `${process.env.NAGET_TEST_FEED}/${name}`);
  const settled = async () => {
    for (let i = 0; i < 100 && updateState()?.running && updateState()?.running?.phase !== 'restart'; i++) await new Promise((r) => setTimeout(r, 50));
    return updateState()!;
  };
  const ok = (name: string) => {
    console.log(`  ok  ${name}`);
    process.send!({ type: 'passed' });
  };

  if (process.env.NAGET_TEST_ROLLED_BACK) {
    const u = updateState() ?? (feed('good.json'), await checkUpdates())!;
    assert.equal(u.last?.ok, false);
    assert.match(u.last?.error ?? '', /did not start/);
    assert.equal(u.last?.to, '9.9.9');
    assert.equal(kvGet(db, 'update.skip'), '9.9.9', 'that version is not installed by itself again');
    ok('a version the app rolled back says why, and waits for Update now');
  } else {
    feed('none.json');
    let u = (await checkUpdates())!;
    assert.equal(u.kind, 'app');
    assert.equal(u.behind, 0);
    assert.match(u.error ?? '', /no Mac release/);
    ok('no release yet: it says so');

    feed('good.json');
    u = (await checkUpdates())!;
    assert.deepEqual([u.kind, u.behind, u.latest, u.canRestart, u.error], ['app', 1, '9.9.9', true, undefined]);
    ok('the newest release says a version is out, and the app can install it');

    feed('bad.json');
    startUpdate(false);
    u = await settled();
    assert.equal(u.running, undefined);
    assert.equal(u.last?.ok, false);
    assert.match(u.last?.error ?? '', /checksum/);
    ok('a download that is not the build the release names is refused');

    feed('good.json');
    startUpdate(false);
    u = await settled();
    assert.equal(u.running?.phase, 'restart', 'it waits for the app to swap and restart');
    assert.deepEqual([u.last?.ok, u.last?.to], [true, '9.9.9']);
  }
  // Let the messages reach the app before leaving.
  await new Promise((r) => setTimeout(r, 200));
  process.exit(0);
}
