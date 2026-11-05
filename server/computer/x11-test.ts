// Computer use on Linux, for real: the X11 helper (x11-helper.py) against a test window on an X display, which says
// what it gets (keys as the keyboard is laid out at that moment, clicks, the wheel, drags). Checks the pointer goes
// where asked (gliding there in small steps, so the eye can follow), clicks with modifiers held, scrolling, dragging, typing any character on any layout (spare keys lent
// for the rest), named keys, a key the keyboard lacks, and opening an app by its .desktop entry. Needs python3,
// libXtst and an X display: the one in DISPLAY, else an Xvfb it starts (the desktop workflow installs xvfb). The
// screenshot is the desktop app's (Electron), not tried here. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/computer/x11-test.ts && DATA_DIR=/tmp/hydor-test-x11 node dist/dev/x11-test.js
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
if (process.platform !== 'linux') {
  console.log('skipped: this tries X11, on Linux');
  process.exit(0);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const children: ChildProcess[] = [];
const end = (code: number) => {
  for (const c of children) c.kill();
  process.exit(code);
};

// An X display: the one we are in, else an Xvfb of our own (with nothing else on it).
let xvfb: ChildProcess | null = null;
if (!process.env.DISPLAY || process.env.HYDOR_TEST_XVFB === '1') {
  if (spawnSync('sh', ['-c', 'command -v Xvfb']).status !== 0) {
    console.log('skipped: no X display, and no Xvfb to start one');
    process.exit(0);
  }
  const display = `:${90 + (process.pid % 9)}`;
  xvfb = spawn('Xvfb', [display, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  children.push(xvfb);
  process.env.DISPLAY = display;
  delete process.env.WAYLAND_DISPLAY;
  process.env.XDG_SESSION_TYPE = 'x11';
  await sleep(1200);
}

// The test window: at (100,100), 800×600, with the keyboard's focus; one JSON line per event it gets.
const WINDOW = String.raw`
import ctypes, json
from ctypes import POINTER, Structure, Union, byref, c_char_p, c_int, c_long, c_uint, c_ulong, c_void_p, create_string_buffer
X = ctypes.CDLL("libX11.so.6")
V = c_void_p
class Key(Structure):
    _fields_ = [("type", c_int), ("serial", c_ulong), ("send_event", c_int), ("display", V), ("window", c_ulong), ("root", c_ulong),
                ("subwindow", c_ulong), ("time", c_ulong), ("x", c_int), ("y", c_int), ("x_root", c_int), ("y_root", c_int),
                ("state", c_uint), ("code", c_uint), ("same_screen", c_int)]
class Event(Union):
    _fields_ = [("type", c_int), ("key", Key), ("pad", c_long * 24)]
X.XOpenDisplay.restype = V; X.XOpenDisplay.argtypes = [c_char_p]
X.XDefaultRootWindow.restype = c_ulong; X.XDefaultRootWindow.argtypes = [V]
X.XCreateSimpleWindow.restype = c_ulong; X.XCreateSimpleWindow.argtypes = [V, c_ulong, c_int, c_int, c_uint, c_uint, c_uint, c_ulong, c_ulong]
X.XSelectInput.argtypes = [V, c_ulong, c_long]; X.XMapRaised.argtypes = [V, c_ulong]; X.XSetInputFocus.argtypes = [V, c_ulong, c_int, c_ulong]
X.XNextEvent.argtypes = [V, POINTER(Event)]; X.XLookupString.argtypes = [POINTER(Key), c_char_p, c_int, POINTER(c_ulong), V]
X.XRefreshKeyboardMapping.argtypes = [V]; X.XSync.argtypes = [V, c_int]
d = X.XOpenDisplay(None); w = X.XCreateSimpleWindow(d, X.XDefaultRootWindow(d), 100, 100, 800, 600, 0, 0, 0xFFFFFF)
X.XSelectInput(d, w, 1 | 4 | 64 | 8192 | 131072); X.XMapRaised(d, w); X.XSync(d, 0); X.XSetInputFocus(d, w, 2, 0); X.XSync(d, 0)
print(json.dumps({"ready": True}), flush=True)
ev = Event(); buf = create_string_buffer(64); ks = c_ulong()
while True:
    X.XNextEvent(d, byref(ev))
    if ev.type == 34: X.XRefreshKeyboardMapping(byref(ev))
    elif ev.type == 2:
        n = X.XLookupString(byref(ev.key), buf, 64, byref(ks), None); k = ks.value
        ch = chr(k & 0xFFFFFF) if k & 0xFF000000 == 0x01000000 else buf.raw[:n].decode("utf-8", "replace")
        print(json.dumps({"key": ch, "keysym": k, "state": ev.key.state}), flush=True)
    elif ev.type == 4: print(json.dumps({"button": ev.key.code, "x": ev.key.x_root, "y": ev.key.y_root, "state": ev.key.state}), flush=True)
    elif ev.type == 6: print(json.dumps({"motion": True, "x": ev.key.x_root, "y": ev.key.y_root}), flush=True)
`;
const win = spawn('python3', ['-c', WINDOW], { stdio: ['ignore', 'pipe', 'inherit'] });
children.push(win);
const got: Record<string, any>[] = [];
const lines = readline.createInterface({ input: win.stdout! });
await new Promise<void>((resolve) => lines.once('line', () => resolve()));
lines.on('line', (l) => got.push(JSON.parse(l)));

const { linuxMachine, wayland } = await import('./linux.ts');
const { LINUX_KEYS, opsFor, parseInput } = await import('./plan.ts');
const drive = linuxMachine.drive;
const keys = (text: string) => {
  const p = parseInput({ action: 'key', text }, undefined, LINUX_KEYS);
  assert.ok('actions' in p, JSON.stringify(p));
  return opsFor(p.actions, undefined);
};

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const settle = () => sleep(300);

test('nothing in the way on an X11 display: the helper starts, and says whether a compositor runs', async () => {
  assert.equal(wayland(), false);
  assert.equal(await linuxMachine.problem!(), null);
  assert.equal(linuxMachine.glow!(), false, 'Xvfb has no compositor: no glow there');
});

test('the pointer goes where asked, and is read back', async () => {
  const out = await drive([{ op: 'move', x: 500.4, y: 400.6 }, { op: 'pos' }, { op: 'info' }]);
  assert.deepEqual(out.positions, [{ x: 500, y: 401 }]);
  assert.ok(out.info?.display && out.info.display.w > 0 && out.info.display.h > 0, JSON.stringify(out.info));
});

test('the pointer glides to a place in small steps, eased, over about a quarter of a second, and ends on it', async () => {
  await drive([{ op: 'move', x: 300, y: 300 }]);
  await settle();
  got.length = 0;
  const t0 = Date.now();
  const out = await drive([{ op: 'glide', x: 700, y: 500, ms: 240 }, { op: 'pos' }]);
  const took = Date.now() - t0;
  await settle();
  assert.deepEqual(out.positions, [{ x: 700, y: 500 }]);
  const moves = got.filter((e) => e.motion).map((e) => [e.x, e.y] as [number, number]);
  assert.ok(moves.length >= 8, `${moves.length} moves: a glide, not a jump`);
  assert.deepEqual(moves.at(-1), [700, 500]);
  assert.ok(moves.every(([x], i) => i === 0 || x >= moves[i - 1][0]), 'always onward');
  assert.ok(moves.some(([x]) => x > 400 && x < 600), 'through the middle of the way');
  assert.ok(took >= 200 && took < 1500, `took ${took} ms`);
  got.length = 0;
  await drive([{ op: 'glide', x: 701, y: 500, ms: 240 }]);
  await settle();
  assert.ok(got.filter((e) => e.motion).length <= 1, 'already there: no glide');
});

test('clicks: left, right, a double click holding ctrl', async () => {
  got.length = 0;
  await drive([
    { op: 'click', x: 300, y: 300, button: 0, count: 1, mods: [], flags: 0 },
    { op: 'click', x: 310, y: 310, button: 1, count: 1, mods: [], flags: 0 },
    { op: 'click', x: 320, y: 320, button: 0, count: 2, mods: [0xffe3], flags: 1 },
  ]);
  await settle();
  const presses = got.filter((e) => 'button' in e);
  assert.deepEqual(
    presses.map((e) => [e.button, e.x, e.y]),
    [
      [1, 300, 300],
      [3, 310, 310],
      [1, 320, 320],
      [1, 320, 320],
    ],
  );
  assert.equal(presses.at(-1)!.state & 4, 4, 'ctrl held');
});

test('the wheel, both ways, and a drag with the button held', async () => {
  got.length = 0;
  await drive([{ op: 'scroll', x: 400, y: 400, dy: -50, dx: 0, n: 2 }, { op: 'scroll', dy: 0, dx: 50, n: 1 }, { op: 'drag', x1: 200, y1: 200, x2: 600, y2: 500 }]);
  await settle();
  assert.deepEqual(
    got.filter((e) => 'button' in e).map((e) => e.button),
    [5, 5, 6, 1],
  );
  const moves = got.filter((e) => e.motion);
  assert.deepEqual([moves.at(-1)?.x, moves.at(-1)?.y], [600, 500]);
});

test('typing: any character, whatever the keyboard layout (spare keys lent for the rest, and given back)', async () => {
  got.length = 0;
  const text = 'Hello, wörld! ☃ Ωμέγα 你好\tok\n';
  const out = await drive([{ op: 'move', x: 500, y: 400 }, { op: 'type', text }]);
  assert.equal(out.typed, 'keys');
  await settle();
  assert.equal(
    got
      .filter((e) => 'key' in e)
      .map((e) => e.key)
      .join(''),
    text.replace('\n', '\r'),
  );
});

test('named keys and combinations, as keysyms; a key the keyboard lacks borrows a spare one', async () => {
  got.length = 0;
  await drive([...keys('ctrl+a'), ...keys('escape'), ...keys('volume_up')]);
  await settle();
  const k = got.filter((e) => 'keysym' in e && ![0xffe3, 0xffe4].includes(e.keysym)).map((e) => [e.keysym, e.state & 4]);
  assert.deepEqual(k, [
    [0x61, 4],
    [0xff1b, 0],
    [0x1008ff13, 0],
  ]);
  const out = await drive([{ op: 'release' }]);
  assert.equal(out.done, 1);
});

test('apps open by their .desktop entries (gio, gtk-launch, or the Exec line)', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-x11-apps-'));
  const mark = path.join(home, 'opened');
  fs.mkdirSync(path.join(home, 'applications'));
  fs.writeFileSync(
    path.join(home, 'applications', 'hydor-test.desktop'),
    `[Desktop Entry]\nType=Application\nName=Hydor Test Pad\nExec=/bin/sh -c "echo opened > ${mark}" %U\n`,
  );
  const was = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = home;
  try {
    assert.equal(await linuxMachine.openApp('hydor test pad'), 'Hydor Test Pad');
    for (let i = 0; i < 50 && !fs.existsSync(mark); i++) await sleep(100);
    assert.equal(fs.readFileSync(mark, 'utf8').trim(), 'opened');
    await assert.rejects(linuxMachine.openApp('No Such App Anywhere'), /no app called/);
  } finally {
    if (was === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = was;
    fs.rmSync(home, { recursive: true, force: true });
  }
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
end(passed === tests.length ? 0 : 1);
