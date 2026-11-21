// Script test for the capture browser inside the desktop app (GitHub issue #18). There the desktop app's own browser comes
// first among the Chromiums found, and Settings → Browser's "Best available" picks it for agents' browsing; but it has no
// program to run (its path is only DESKTOP_CHROME, a name for the desktop app to start), so pictures, PDFs and thumbnails
// must take the best real Chromium instead. They tried to run "desktop" and failed with "spawn desktop ENOENT".
// Needs a Chromium besides the desktop app's to take the picture; without one it checks only the choosing.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/capture/desktop-browser-test.ts
//   DATA_DIR=/tmp/hydor-test-capture-desktop node dist/dev/desktop-browser-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

// As the desktop app starts the server (desktop/main.cjs), before the modules that read it load.
process.env.HYDOR_DESKTOP = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux';
process.env.HYDOR_DESKTOP_APP = path.join(process.env.DATA_DIR, 'Hydor.app');
process.env.HYDOR_DESKTOP_BROWSER = '145.0.7632.6';

const { DESKTOP_CHROME } = await import('../../shared/browser.ts');
const { findChromes, launchChrome, pickChrome, pickRunnableChrome } = await import('../browser/chrome.ts');
const { canCapture, capture, closeCapture } = await import('./index.ts');

assert.equal(findChromes()[0]?.path, DESKTOP_CHROME, 'the desktop app’s own browser comes first');
assert.equal(pickChrome('')?.path, DESKTOP_CHROME, 'agents’ browsing takes it on Best available');
const desktopOwn = findChromes()[0]!;
await assert.rejects(launchChrome(desktopOwn, { userDataDir: path.join(process.env.DATA_DIR, 'profile'), headless: true }), /started by the desktop app/, 'it is never run as a program');

const best = pickRunnableChrome('');
assert.equal(pickRunnableChrome(DESKTOP_CHROME)?.path, best?.path, 'choosing the desktop app’s browser leaves pictures to the best real one');
assert.equal(canCapture(), !!best);
if (!best) {
  console.log('No Chromium here besides the desktop app’s: the choosing is right, the picture is not tested.');
  process.exit(0);
}
assert.notEqual(best.source, 'desktop');

try {
  const shot = await capture({ html: '<!doctype html><html><body style="margin:0;background:#00c000"></body></html>', width: 320, height: 200, format: 'png', settleMs: 50, blockPrivate: true, offline: true });
  assert.equal(shot.data.subarray(1, 4).toString('latin1'), 'PNG', 'a picture came back');
  assert.equal(shot.width, 320);
  console.log(`ok   a picture in the desktop app, with ${best.label}`);
} finally {
  closeCapture();
}
console.log('all passed');
process.exit(0);
