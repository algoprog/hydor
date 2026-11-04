// Computer use on Windows, for real: the helper (hydor-computer.exe from HYDOR_COMPUTER_HELPER, else PowerShell
// compiling windows-helper.cs) sees the main display, moves the pointer, opens Notepad, types text in several scripts,
// selects and copies it, and the clipboard is read back. The desktop workflow runs it on Windows with the helper it
// just built, and again with PowerShell. Elsewhere it says it is skipped. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/computer/windows-test.ts && DATA_DIR=C:/Temp/hydor-test-windows node dist/dev/windows-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32') {
  console.log('skipped: this tries Windows, on Windows');
  process.exit(0);
}

const { windowsMachine } = await import('./windows.ts');
const { WINDOWS_KEYS, opsFor, parseInput } = await import('./plan.ts');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keys = (text: string) => {
  const p = parseInput({ action: 'key', text }, undefined, WINDOWS_KEYS);
  assert.ok('actions' in p, JSON.stringify(p));
  return opsFor(p.actions, undefined);
};
const clipboard = () =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard -Raw'], { encoding: 'utf8' }).replace(/\r?\n$/, '');

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
console.log(`helper: ${process.env.HYDOR_COMPUTER_HELPER || 'PowerShell, compiling windows-helper.cs'}`);

test('the main display as a JPEG, at most 1280 pixels on its longer side, and where it is', async () => {
  const shot = await windowsMachine.screenshot();
  assert.ok(shot.jpeg.length > 1000, `a picture (${shot.jpeg.length} bytes)`);
  assert.ok(Math.max(shot.geo.width, shot.geo.height) <= 1280 && shot.geo.width > 0, JSON.stringify(shot.geo));
  assert.ok(shot.geo.w > 0 && shot.geo.h > 0, JSON.stringify(shot.geo));
  assert.ok(Math.abs(shot.geo.width / shot.geo.height - shot.geo.w / shot.geo.h) < 0.02, 'the picture keeps the display’s shape');
  console.log(`      ${shot.geo.w}×${shot.geo.h} pixels, ${shot.displays} display(s), in front: ${shot.app} (${shot.window})`);
});

test('the pointer goes where asked, in the screen’s own pixels', async () => {
  const out = await windowsMachine.drive([{ op: 'move', x: 200.4, y: 150.6 }, { op: 'pos' }]);
  assert.deepEqual(out.positions, [{ x: 200, y: 151 }]);
});

test('Notepad opens by its name, takes typed text in any script, and copies it', async () => {
  try {
    execFileSync('taskkill', ['/IM', 'notepad.exe', '/F'], { stdio: 'ignore' });
  } catch {}
  const opened = await windowsMachine.openApp('Notepad');
  assert.match(String(opened), /notepad/i);
  let front = '';
  for (let i = 0; i < 40 && !/notepad/i.test(front); i++) {
    await sleep(250);
    const out = await windowsMachine.drive([{ op: 'info' }]);
    front = `${out.info?.app} ${(out.info as { window?: string })?.window}`;
  }
  assert.match(front, /notepad/i, 'Notepad is in front');
  const text = 'Hello, Ωμέγα ☃ 你好';
  await windowsMachine.drive([{ op: 'type', text }, { op: 'sleep', ms: 300 }, ...keys('ctrl+a'), { op: 'sleep', ms: 100 }, ...keys('ctrl+c'), { op: 'sleep', ms: 300 }]);
  assert.equal(clipboard(), text);
  await windowsMachine.drive([{ op: 'release' }]);
  try {
    execFileSync('taskkill', ['/IM', 'notepad.exe', '/F'], { stdio: 'ignore' });
  } catch {}
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}\n      ${(e as Error).stack?.split('\n').slice(0, 4).join('\n      ')}`);
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
