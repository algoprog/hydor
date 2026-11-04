// Checks for the Mac app's updates (server/updates.ts with desktop.ts): the newest release says a version is out;
// a download that is not the build the release names is refused; a good one is unpacked and handed to the app
// to install; a version the app had to roll back is reported and not installed by itself again. With updates on,
// a new version downloads by itself at once, the app is told it waits (with the words of its notification) and it
// installs after its minute; Later puts it off, and the menu bar's Restart to Update installs it at once. Also the
// channel's questions to the app and their answers. The Windows and Linux apps read their own feeds and get their own
// kind of build (the installer, the AppImage, the .deb, which waits for your password rather than installing by
// itself). The test plays the app: it starts itself again as the server's side, with a message channel, as
// desktop/main.cjs does, and stands in for macOS's ditto. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/desktop-test.ts && DATA_DIR=/tmp/hydor-test-desktop node dist/dev/desktop-test.js
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
type Msg = { type: string; [k: string]: unknown };

if (!process.env.HYDOR_TEST_SIDE) {
  // ---- the Mac app's side: a release to download, and the server started with a message channel ----
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-desktop-'));
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  // ditto -x -k <zip> <folder> unpacks; the stand-in puts an app there.
  fs.writeFileSync(path.join(bin, 'ditto'), '#!/bin/sh\n[ "$1" = -x ] && mkdir -p "$4/Hydor.app/Contents" && exit 0\nexec cp -R "$1" "$2"\n', { mode: 0o755 });
  const server = http.createServer((req, res) => {
    const feed = (sum: string, key: string = process.arch) => JSON.stringify({ version: '9.9.9', files: { [key]: { url: `http://127.0.0.1:${port}/app.zip`, sha512: sum, size: ZIP.length } } });
    const kind = /^\/good-(nsis|appimage|deb)\.json$/.exec(req.url ?? '')?.[1];
    if (kind) res.end(feed(sha(ZIP), `${kind}-${process.arch}`));
    else if (req.url === '/good.json') res.end(feed(sha(ZIP)));
    else if (req.url === '/bad.json') res.end(feed(sha(Buffer.from('another build'))));
    else if (req.url === '/app.zip') res.end(ZIP);
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  /** Runs the server's side; `answer` plays the app's part in the conversation (its menus, its answers). */
  const run = (extra: Record<string, string>, answer?: (m: Msg, send: (m: Msg) => void) => void) =>
    new Promise<{ messages: Msg[]; code: number | null }>((resolve) => {
      const messages: Msg[] = [];
      const child = fork(fileURLToPath(import.meta.url), [], {
        env: {
          ...process.env,
          DATA_DIR: path.join(tmp, 'data'),
          HOME: tmp,
          PATH: `${bin}:${process.env.PATH}`,
          HYDOR_TEST_SIDE: '1',
          HYDOR_DESKTOP: 'mac',
          HYDOR_DESKTOP_APP: path.join(tmp, 'Applications/Hydor.app'),
          HYDOR_DESKTOP_UPDATABLE: '1',
          HYDOR_DESKTOP_CACHE: path.join(tmp, 'cache'),
          HYDOR_TEST_FEED: `http://127.0.0.1:${port}`,
          HYDOR_UPDATE_NOTICE_MS: '400',
          ...extra,
        },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
      child.on('message', (m) => {
        messages.push(m as Msg);
        answer?.(m as Msg, (x) => child.connected && child.send(x));
      });
      child.on('exit', (code) => resolve({ messages, code }));
    });
  const passed = (...runs: { messages: Msg[] }[]) => runs.reduce((n, r) => n + r.messages.filter((m) => m.type === 'passed').length, 0);
  try {
    // The app answers the server's questions as macOS would.
    const first = await run({}, (m, send) => {
      if (m.type === 'ask' && m.what === 'permissions') send({ type: 'reply', id: m.id as string, ok: true, accessibility: true, screen: 'denied' });
      if (m.type === 'ask' && m.what === 'request') send({ type: 'reply', id: m.id as string, ok: false, error: 'System Settings did not open' });
    });
    assert.equal(first.code, 0, 'the checks passed');
    const install = first.messages.find((m) => m.type === 'install');
    assert.ok(install, 'the app was asked to install the new version');
    assert.equal(install.to, '9.9.9');
    assert.ok(fs.existsSync(path.join(String(install.app), 'Contents')), 'the new version is unpacked where the app is told');
    console.log('  ok  a good download is unpacked and handed to the app to install');

    const second = await run({ HYDOR_UPDATE_ERROR: JSON.stringify({ from: '0.1.0', to: '9.9.9', error: 'Version 9.9.9 did not start' }), HYDOR_TEST_ROLLED_BACK: '1' });
    assert.equal(second.code, 0, 'the rolled-back checks passed');
    fs.rmSync(path.join(tmp, 'data'), { recursive: true, force: true });

    // Updates on: the new version downloads at once, the app is told it waits, and a minute (here 400 ms) later it installs.
    const auto = await run({ HYDOR_TEST_AUTO: 'countdown' });
    assert.equal(auto.code, 0, 'the automatic checks passed');
    const told = auto.messages.filter((m) => m.type === 'update' || m.type === 'install');
    const notice = told.find((m) => m.type === 'update' && m.notice);
    assert.ok(notice, 'the app was told to show a notification');
    assert.equal(notice.version, '9.9.9');
    assert.deepEqual(notice.notice, { title: 'Hydor 9.9.9 is ready', body: 'Restarting in a minute to install it. Running agents carry on.', action: 'Restart Now' });
    assert.ok(told.indexOf(notice) < told.findIndex((m) => m.type === 'install'), 'the notification comes before the install');
    assert.equal(told.at(-1)?.type, 'install', 'it installed by itself once its minute was up');
    console.log('  ok  a new version downloads by itself, the Mac says so, and it installs a minute later');
    fs.rmSync(path.join(tmp, 'data'), { recursive: true, force: true });

    // Later, then Restart to Update in the menu bar.
    let laterSeen = false;
    const later = await run({ HYDOR_TEST_AUTO: 'later' }, (m, send) => {
      // After Later the menu bar keeps Restart to Update (no notification); the test picks it a moment later.
      if (m.type === 'update' && m.version === '9.9.9' && !m.notice && !laterSeen) {
        laterSeen = true;
        setTimeout(() => send({ type: 'update-now' }), 700);
      }
    });
    assert.equal(later.code, 0, 'the Later checks passed');
    const order = later.messages.filter((m) => m.type === 'update' || m.type === 'install').map((m) => (m.type === 'install' ? 'install' : m.notice ? 'notice' : m.version ? 'waiting' : 'none'));
    assert.deepEqual(order.slice(-3), ['notice', 'waiting', 'install'], `the notice, Later, then Restart to Update (${order.join(', ')})`);
    console.log('  ok  Later puts it off past its minute, and Restart to Update in the menu bar installs it');
    fs.rmSync(path.join(tmp, 'data'), { recursive: true, force: true });

    // The Windows app and an AppImage: their own feeds and builds, handed to the app as they are.
    const others: { messages: Msg[] }[] = [];
    for (const [platform, format, ending] of [
      ['windows', 'nsis', '-setup.exe'],
      ['linux', 'appimage', '.AppImage'],
    ] as const) {
      const r = await run({ HYDOR_DESKTOP: platform, HYDOR_DESKTOP_FORMAT: format, HYDOR_TEST_PLATFORM: '1' });
      assert.equal(r.code, 0, `the ${format} checks passed`);
      const got = r.messages.find((m) => m.type === 'install');
      assert.ok(got && String(got.app).endsWith(ending), `the ${format} build is handed over as it is (${got?.app})`);
      assert.ok(fs.existsSync(String(got.app)));
      if (format === 'appimage') assert.ok(fs.statSync(String(got.app)).mode & 0o100, 'an AppImage that can run');
      console.log(`  ok  ${platform === 'windows' ? 'the Windows installer' : 'an AppImage'} is downloaded, checked and handed to the app`);
      others.push(r);
      fs.rmSync(path.join(tmp, 'data'), { recursive: true, force: true });
    }
    // The .deb with updates on: it downloads by itself, and waits for Restart to Update (your password).
    const deb = await run({ HYDOR_DESKTOP: 'linux', HYDOR_DESKTOP_FORMAT: 'deb', HYDOR_TEST_PLATFORM: '1' });
    assert.equal(deb.code, 0, 'the .deb checks passed');
    assert.ok(!deb.messages.some((m) => m.type === 'install'), 'it did not install by itself');
    console.log('  ok  the .deb downloads a new version by itself and waits for you to install it');
    console.log(`${passed(first, second, auto, later, ...others, deb) + 6} passed`);
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
} else {
  // ---- the server's side ----
  const { openDb, kvGet } = await import('./db.ts');
  const { checkUpdates, laterUpdate, setAutoUpdate, startUpdate, updateState, watchUpdates } = await import('./updates.ts');
  const { askDesktop } = await import('./desktop.ts');
  fs.mkdirSync(process.env.DATA_DIR!, { recursive: true });
  const db = openDb(path.join(process.env.DATA_DIR!, 'test.db'));
  watchUpdates(db, () => {});
  const feed = (name: string) => (process.env.HYDOR_UPDATE_FEED = `${process.env.HYDOR_TEST_FEED}/${name}`);
  const until = async (ok: () => boolean, what: string, ms = 5000) => {
    for (let t = Date.now(); !ok(); await new Promise((r) => setTimeout(r, 25))) if (Date.now() - t > ms) throw new Error(`waited too long for ${what}`);
  };
  const settled = async () => {
    for (let i = 0; i < 100 && updateState()?.running && updateState()?.running?.phase !== 'restart'; i++) await new Promise((r) => setTimeout(r, 50));
    return updateState()!;
  };
  const ok = (name: string) => {
    console.log(`  ok  ${name}`);
    process.send!({ type: 'passed' });
  };

  if (process.env.HYDOR_TEST_PLATFORM) {
    const format = process.env.HYDOR_DESKTOP_FORMAT!;
    feed(`good-${format}.json`);
    if (format === 'deb') {
      setAutoUpdate(true);
      await checkUpdates();
      await until(() => !!updateState()?.ready, 'the download');
      const u = updateState()!;
      assert.deepEqual([u.platform, u.format, u.ready?.version, u.ready?.installIn, u.ready?.later], ['linux', 'deb', '9.9.9', undefined, undefined], 'it waits, without counting down');
      await new Promise((r) => setTimeout(r, 700));
      assert.equal(updateState()?.running, undefined, 'and does not install by itself');
      ok('the .deb: a version downloaded by itself waits for your password');
    } else {
      setAutoUpdate(false);
      let u = (await checkUpdates())!;
      assert.deepEqual([u.kind, u.behind, u.latest, u.platform, u.format], ['app', 1, '9.9.9', process.env.HYDOR_DESKTOP, format], 'its own feed says a version is out');
      startUpdate(false);
      u = await settled();
      assert.equal(u.running?.phase, 'restart', 'it waits for the app to install it');
      ok(`${format}: its own feed and build`);
    }
  } else if (process.env.HYDOR_TEST_ROLLED_BACK) {
    const u = updateState() ?? (feed('good.json'), await checkUpdates())!;
    assert.equal(u.last?.ok, false);
    assert.match(u.last?.error ?? '', /did not start/);
    assert.equal(u.last?.to, '9.9.9');
    assert.equal(kvGet(db, 'update.skip'), '9.9.9', 'that version is not installed by itself again');
    ok('a version the app rolled back says why, and waits for Update now');
    feed('good.json');
    setAutoUpdate(true);
    await checkUpdates();
    assert.equal(updateState()?.running, undefined, 'nothing downloads by itself');
    assert.equal(updateState()?.ready, undefined);
    ok('… and is not downloaded by itself again');
  } else if (process.env.HYDOR_TEST_AUTO) {
    feed('good.json');
    let u = (await checkUpdates())!;
    assert.deepEqual([u.running?.phase, u.running?.auto], ['download', true], 'it downloads at once, by itself');
    await until(() => !!updateState()?.ready, 'the download');
    u = updateState()!;
    assert.equal(u.running, undefined);
    assert.equal(u.ready?.version, '9.9.9');
    assert.ok(u.ready!.installIn! > 0 && u.ready!.installIn! <= 400, `it counts down (${u.ready?.installIn} ms left)`);
    ok('the download waits, counting down to its install');
    if (process.env.HYDOR_TEST_AUTO === 'countdown') {
      await until(() => updateState()?.running?.phase === 'restart', 'the install', 3000);
      u = updateState()!;
      assert.deepEqual([u.last?.ok, u.last?.to, u.last?.auto, u.ready], [true, '9.9.9', true, undefined]);
      ok('once its minute is up it installs, as an update made by itself');
    } else {
      u = laterUpdate()!;
      assert.equal(u.ready?.installIn, undefined, 'no countdown after Later');
      assert.ok(u.ready!.later! - Date.now() > 3.9 * 3600_000, 'it asks again in 4 hours');
      assert.equal(JSON.parse(kvGet(db, 'update.later')!).version, '9.9.9', 'Later is kept across restarts');
      ok('Later puts it off for 4 hours');
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(updateState()?.running, undefined, 'it did not install when the minute was up');
      // The app's menu bar: Restart to Update.
      await until(() => updateState()?.running?.phase === 'restart', 'Restart to Update', 3000);
      u = updateState()!;
      assert.deepEqual([u.last?.ok, u.last?.to, u.last?.auto], [true, '9.9.9', false]);
      ok('Restart to Update installs it at once, as an update you asked for');
    }
  } else {
    // The channel: a question to the app and its answer, and one it could not do.
    const p = await askDesktop<{ accessibility: boolean; screen: string }>({ what: 'permissions' });
    assert.deepEqual([p.accessibility, p.screen], [true, 'denied']);
    await assert.rejects(askDesktop({ what: 'request', which: 'screen' }), /System Settings did not open/);
    ok('the server asks the app, and hears its answer');

    // Updates off: a version that is out waits for Update now.
    setAutoUpdate(false);
    feed('none.json');
    let u = (await checkUpdates())!;
    assert.equal(u.kind, 'app');
    assert.equal(u.behind, 0);
    assert.match(u.error ?? '', /no Mac release/);
    ok('no release yet: it says so');

    feed('good.json');
    u = (await checkUpdates())!;
    assert.deepEqual([u.kind, u.behind, u.latest, u.canRestart, u.error, u.running, u.ready], ['app', 1, '9.9.9', true, undefined, undefined, undefined]);
    ok('the newest release says a version is out, and with updates off nothing downloads by itself');

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
    assert.deepEqual([u.last?.ok, u.last?.to, u.last?.auto], [true, '9.9.9', false]);
  }
  // Let the messages reach the app before leaving.
  await new Promise((r) => setTimeout(r, 200));
  process.exit(0);
}
