// Script tests for computer use, all of which run on any computer: keys and combinations by each system's codes (macOS's
// key codes, Windows' virtual-key codes, X11's keysyms), pixels of the screenshot as points on the screen (Retina and
// scaled displays), the agent's actions checked and turned into the driver's steps, picture sizes; the Mac's driver
// script, run with stand-ins for macOS's bridge (the events it posts, typing by Unicode or by pasting); the helper
// programs' protocol (helper.ts, with a stand-in program); Linux's apps by their .desktop entries and its Wayland check;
// and the tools with stand-ins for the computer: off by default, macOS's permissions, what keeps it from working, the
// card each session shows first (in each system's words), one session at a time, Esc let go while the agent presses
// it, Stop, and the step pictures. What only the systems themselves can show (that they take the events and the
// screenshots) is in x11-test.ts for Linux, and in the desktop workflow for Windows. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/computer/computer-test.ts && DATA_DIR=/tmp/hydor-test-computer node dist/dev/computer-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.HYDOR_COMPUTER_SETTLE_MS = '1';
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const { FLAGS, LINUX_KEYS, WINDOWS_KEYS, describe, fitSize, jpegSize, opsFor, parseInput, parseKeys, pngSize, pressesEscape, toPicture, toScreen } = await import('./plan.ts');
const { Helper } = await import('./helper.ts');
const { execArgs, findEntry, wayland } = await import('./linux.ts');
const { DRIVER } = await import('./driver.ts');
const access = await import('./access.ts');
const { computerTools, machine } = await import('./tools.ts');
const { stepFile } = await import('./steps.ts');
const { computer } = await import('./index.ts');
const { openDb } = await import('../db.ts');

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// A Retina MacBook's 1440×900 points, shot at 2880×1800 and scaled to 1280×800.
const GEO = { width: 1280, height: 800, x: 0, y: 0, w: 1440, h: 900 };

test('keys: names, combinations and characters as macOS key codes; a character alone is typed whatever the layout', () => {
  assert.deepEqual(parseKeys('cmd+c'), [{ code: 8, mods: [55], flags: FLAGS.cmd }]);
  assert.deepEqual(parseKeys('Return'), [{ code: 36, mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('ctrl+shift+Tab'), [{ code: 48, mods: [59, 56], flags: FLAGS.ctrl | FLAGS.shift }]);
  assert.deepEqual(parseKeys('super+l'), [{ code: 37, mods: [55], flags: FLAGS.cmd }], 'super is cmd on a Mac');
  assert.deepEqual(parseKeys('cmd+shift+4'), [{ code: 21, mods: [56, 55], flags: FLAGS.shift | FLAGS.cmd }]);
  assert.deepEqual(parseKeys('cmd+?'), [{ code: 44, mods: [56, 55], flags: FLAGS.shift | FLAGS.cmd }], '? is shift and /');
  assert.deepEqual(parseKeys('cmd+T'), [{ code: 17, mods: [56, 55], flags: FLAGS.shift | FLAGS.cmd }], 'a capital adds shift');
  assert.deepEqual(parseKeys('cmd++'), [{ code: 24, mods: [56, 55], flags: FLAGS.shift | FLAGS.cmd }], 'the plus key');
  assert.deepEqual(parseKeys('Page_Down'), [{ code: 121, mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('F5'), [{ code: 96, mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('delete forward_delete'), [{ code: 51, mods: [], flags: 0 }, { code: 117, mods: [], flags: 0 }], 'the Mac’s delete erases before the cursor');
  assert.deepEqual(parseKeys('cmd+a delete'), [{ code: 0, mods: [55], flags: FLAGS.cmd }, { code: 51, mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('a'), [{ char: 'a', mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('shift+a'), [{ char: 'A', mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('shift+1'), [{ char: '!', mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('shift'), [{ code: 56, mods: [], flags: FLAGS.shift }], 'a modifier alone');
  assert.deepEqual(parseKeys('cmd+minus'), [{ code: 27, mods: [55], flags: FLAGS.cmd }]);
  assert.match(String(parseKeys('cmd+')), /not a key or combination/);
  assert.match(String(parseKeys('hyper+x')), /not a modifier/);
  assert.match(String(parseKeys('launchpad')), /not a key this tool knows/);
  assert.match(String(parseKeys('cmd+é')), /US keyboard/);
});

test('keys on Windows: virtual-key codes; a Mac’s cmd is ctrl, super is the Windows key; delete erases after the cursor', () => {
  const W = WINDOWS_KEYS;
  assert.deepEqual(parseKeys('ctrl+c', W), [{ code: 0x43, mods: [0x11], flags: 1 }]);
  assert.deepEqual(parseKeys('cmd+c', W), [{ code: 0x43, mods: [0x11], flags: 1 }], 'cmd means ctrl on a PC');
  assert.deepEqual(parseKeys('ctrl+shift+Tab', W), [{ code: 0x09, mods: [0x11, 0x10], flags: 3 }]);
  assert.deepEqual(parseKeys('alt+F4', W), [{ code: 0x73, mods: [0x12], flags: 4 }]);
  assert.deepEqual(parseKeys('win', W), [{ code: 0x5b, mods: [], flags: 8 }], 'the Windows key alone');
  assert.deepEqual(parseKeys('super+e', W), [{ code: 0x45, mods: [0x5b], flags: 8 }]);
  assert.deepEqual(parseKeys('ctrl+?', W), [{ code: 0xbf, mods: [0x11, 0x10], flags: 3 }], '? is shift and /');
  assert.deepEqual(parseKeys('BackSpace Delete', W), [{ code: 0x08, mods: [], flags: 0 }, { code: 0x2e, mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('F24 Escape', W), [{ code: 0x87, mods: [], flags: 0 }, { code: 0x1b, mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('shift+a', W), [{ char: 'A', mods: [], flags: 0 }], 'a character alone is typed as it is');
  assert.match(String(parseKeys('fn+x', W)), /not a modifier: use ctrl, shift, alt or win/);
  assert.match(String(parseKeys('launchpad', W)), /backspace, delete/);
});

test('keys on Linux: X11 keysyms, found on the keyboard as it is laid out', () => {
  const L = LINUX_KEYS;
  assert.deepEqual(parseKeys('ctrl+shift+t', L), [{ code: 0x74, mods: [0xffe3, 0xffe1], flags: 3 }]);
  assert.deepEqual(parseKeys('Return KP_Enter', L), [{ code: 0xff0d, mods: [], flags: 0 }, { code: 0xff8d, mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('super', L), [{ code: 0xffeb, mods: [], flags: 8 }]);
  assert.deepEqual(parseKeys('Super_L', L), [{ code: 0xffeb, mods: [], flags: 8 }], 'xdotool’s names');
  assert.deepEqual(parseKeys('ctrl+bracketleft', L), [{ code: 0x5b, mods: [0xffe3], flags: 1 }]);
  assert.deepEqual(parseKeys('XF86AudioRaiseVolume', L).toString().includes('not a key'), true);
  assert.deepEqual(parseKeys('volume_up', L), [{ code: 0x1008ff13, mods: [], flags: 0 }]);
  assert.deepEqual(parseKeys('F13', L), [{ code: 0xffca, mods: [], flags: 0 }]);
  const p = parseInput({ steps: [{ action: 'key', text: 'escape' }, { action: 'hold_key', text: 'esc', duration: 1 }, { action: 'key', text: 'ctrl+a' }] }, GEO, L);
  assert.ok('actions' in p);
  assert.deepEqual(p.actions.map((a) => pressesEscape(a, L)), [true, true, false], 'Escape, whichever way it is pressed');
  assert.equal(pressesEscape(p.actions[0], WINDOWS_KEYS), false, 'by the codes of the system it is for');
});

test('coordinates: pixels of the screenshot as points on the screen, and back; sizes scaled down, never up', () => {
  assert.deepEqual(fitSize(2880, 1800), { width: 1280, height: 800 });
  assert.deepEqual(fitSize(3840, 2160), { width: 1280, height: 720 });
  assert.deepEqual(fitSize(1080, 1920), { width: 720, height: 1280 });
  assert.deepEqual(fitSize(1024, 768), { width: 1024, height: 768 }, 'a small screen stays as it is');
  assert.deepEqual(toScreen([640, 400], GEO), { x: 720, y: 450 });
  assert.deepEqual(toScreen([0, 0], GEO), { x: 0, y: 0 });
  assert.deepEqual(toScreen([1279, 799], GEO), { x: 1438.88, y: 898.88 });
  assert.deepEqual(toScreen([100, 100], { width: 1280, height: 720, x: 0, y: 0, w: 1920, h: 1080 }), { x: 150, y: 150 }, 'a 1920×1080 display at one pixel a point');
  assert.deepEqual(toPicture({ x: 720, y: 450 }, GEO), [640, 400]);
  assert.equal(toPicture({ x: -300, y: 20 }, GEO), null, 'on another display');
});

test('actions: checked, with what is wrong said plainly; steps, and a screenshot after unless false', () => {
  const one = parseInput({ action: 'left_click', coordinate: [640, 400] }, GEO);
  assert.ok('actions' in one);
  assert.deepEqual([one.actions, one.screenshot], [[{ do: 'click', at: [640, 400], button: 'left', count: 1, mods: [], flags: 0, hold: '' }], true]);
  const many = parseInput({ steps: [{ action: 'double_click', coordinate: '10, 20' }, { action: 'type', text: 'héllo ☃' }, { action: 'key', text: 'return' }], screenshot: false }, GEO);
  assert.ok('actions' in many && !many.screenshot && many.actions.length === 3);
  const err = (x: Record<string, unknown>, g: typeof GEO | null = GEO) => {
    const r = parseInput(x, g ?? undefined);
    return 'error' in r ? r.error : '';
  };
  assert.match(err({ action: 'left_click', coordinate: [1280, 10] }), /outside the screenshot, which is 1280×800: x from 0 to 1279/);
  assert.match(err({ action: 'left_click', coordinate: [5, 5] }, null), /Take a screenshot first/);
  assert.match(err({ action: 'mouse_move' }), /needs coordinate/);
  assert.match(err({ action: 'type' }), /type needs text/);
  assert.match(err({ action: 'fly' }), /“fly” is not an action/);
  assert.match(err({ steps: [{ action: 'wait' }, { action: 'scroll', scroll_direction: 'sideways' }] }), /^Step 2: scroll_direction must be/);
  assert.match(err({ steps: Array.from({ length: 11 }, () => ({ action: 'wait' })) }), /At most 10 steps/);
  assert.match(err({ action: 'open_app', app: '-a /tmp/x' }), /name of an app/);
  assert.match(err({}), /Give an action/);
  const w = parseInput({ action: 'wait', duration: 99 }, undefined);
  assert.ok('actions' in w && w.actions[0].do === 'wait' && w.actions[0].seconds === 10, 'waits at most 10 s, and need no screenshot');
});

test('the driver’s steps: points on the screen, scroll deltas, keys or typed characters, pauses between actions', () => {
  const p = parseInput(
    {
      steps: [
        { action: 'right_click', coordinate: [640, 400], text: 'cmd' },
        { action: 'scroll', coordinate: [0, 0], scroll_direction: 'down', scroll_amount: 2 },
        { action: 'left_click_drag', start_coordinate: [0, 0], coordinate: [128, 80] },
        { action: 'key', text: 'cmd+v a' },
        { action: 'hold_key', text: 'shift', duration: 0.5 },
        { action: 'cursor_position' },
      ],
    },
    GEO,
  );
  assert.ok('actions' in p);
  assert.deepEqual(opsFor(p.actions, GEO), [
    { op: 'click', x: 720, y: 450, button: 1, count: 1, mods: [55], flags: FLAGS.cmd },
    { op: 'sleep', ms: 120 },
    { op: 'scroll', x: 0, y: 0, dy: -50, dx: 0, n: 2 },
    { op: 'sleep', ms: 120 },
    { op: 'drag', x1: 0, y1: 0, x2: 144, y2: 90 },
    { op: 'sleep', ms: 120 },
    { op: 'key', code: 9, mods: [55], flags: FLAGS.cmd },
    { op: 'sleep', ms: 40 },
    { op: 'type', text: 'a' },
    { op: 'sleep', ms: 120 },
    { op: 'hold', code: 56, mods: [], flags: FLAGS.shift, ms: 500 },
    { op: 'sleep', ms: 120 },
    { op: 'pos' },
  ]);
  assert.equal(describe(p.actions[0]), 'Right-clicked at (640, 400) holding cmd');
  assert.equal(describe(p.actions[1]), 'Scrolled down 2 notches at (0, 0)');
  assert.equal(describe(p.actions[5], { pos: [12, 34] }), 'The pointer is at (12, 34)');
  assert.equal(describe({ do: 'type', text: 'hi' }, { pasted: true }), 'Typed “hi”, pasted from the clipboard (typing it was not possible here; the clipboard was put back)');
});

test('picture sizes: a PNG’s from its header, a JPEG’s from its frame', () => {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.write('IHDR', 12, 'latin1');
  png.writeUInt32BE(2880, 16);
  png.writeUInt32BE(1800, 20);
  assert.deepEqual(pngSize(png), { width: 2880, height: 1800 });
  // SOI, an APP0 segment, then SOF0 with height 800 and width 1280.
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x05, 0x00, 0x03]);
  assert.deepEqual(jpegSize(jpg), { width: 1280, height: 800 });
  assert.equal(jpegSize(Buffer.from('not a picture')), null);
});

// ---- the driver, with stand-ins for macOS's bridge ----

/** Runs the driver as osascript would, with $ and ObjC standing in for macOS; returns what it posted and answered. */
function runDriver(ops: unknown[], o: { unicode?: boolean } = {}) {
  const posted: Record<string, unknown>[] = [];
  const clipboard: string[] = [];
  const ev = (x: Record<string, unknown>) => ({ fields: {}, flags: 0, ...x });
  const pb = {
    get pasteboardItems() {
      return { count: 1, objectAtIndex: () => ({ types: { count: 1, objectAtIndex: () => 'public.png' }, dataForType: () => 'PNG BYTES' }) };
    },
    get clearContents() {
      clipboard.push('(cleared)');
      return 1;
    },
    setStringForType: (s: string) => clipboard.push(s),
    writeObjects: (items: { items: unknown[] }) => clipboard.push(`(put back ${items.items.length})`),
  };
  const dollar = Object.assign((x: unknown) => x, {
    CGEventPost: (_tap: number, e: Record<string, unknown>) => posted.push(e),
    CGPointMake: (x: number, y: number) => ({ x, y }),
    CGEventCreate: () => ({}),
    CGEventGetLocation: () => ({ x: 10, y: 20 }),
    CGEventCreateMouseEvent: (_s: unknown, type: number, p: { x: number; y: number }, button: number) => ev({ kind: 'mouse', type, x: p.x, y: p.y, button }),
    CGEventCreateKeyboardEvent: (_s: unknown, code: number, down: boolean) => ev({ kind: 'key', code, down }),
    CGEventCreateScrollWheelEvent: (_s: unknown, units: number, count: number, dy: number) => ev({ kind: 'scroll', units, count, dy }),
    CGEventSetFlags: (e: { flags: number }, f: number) => (e.flags = f),
    CGEventSetIntegerValueField: (e: { fields: Record<number, number> }, f: number, v: number) => (e.fields[f] = v),
    CGEventSetDoubleValueField: (e: { fields: Record<number, number> }, f: number, v: number) => (e.fields[f] = v),
    // A UniChar array is taken as a JavaScript array of numbers (or, with unicode off, ignored).
    CGEventKeyboardSetUnicodeString: (e: { chars?: string }, _n: number, s: unknown) => {
      if (o.unicode !== false && Array.isArray(s)) e.chars = String.fromCharCode(...(s as number[]));
    },
    NSEvent: {
      eventWithCGEvent: (e: { chars?: string; code?: number }) => ({ characters: e.chars ?? (e.code === 0 ? 'a' : '') }),
      keyEventWithTypeLocationModifierFlagsTimestampWindowNumberContextCharactersCharactersIgnoringModifiersIsARepeatKeyCode: () => ({ CGEvent: ev({ kind: 'key', code: 0 }) }),
    },
    NSMakePoint: () => ({}),
    CGMainDisplayID: () => 1,
    CGDisplayBounds: () => ({ origin: { x: 0, y: 0 }, size: { width: 1440, height: 900 } }),
    NSScreen: { screens: { count: 2, objectAtIndex: () => ({ frame: { size: { width: 1440, height: 900 } } }) } },
    NSWorkspace: { sharedWorkspace: { frontmostApplication: { localizedName: 'Finder' } } },
    NSPasteboard: { generalPasteboard: pb },
    NSMutableArray: {
      get array() {
        const items: unknown[] = [];
        return { items, addObject: (x: unknown) => items.push(x) };
      },
    },
    NSPasteboardItem: { alloc: { get init() {
      return { setDataForType: () => {} };
    } } },
  });
  const ctx = vm.createContext({ $: dollar, ObjC: { import: () => {}, unwrap: (x: unknown) => x }, delay: () => {}, JSON });
  vm.runInContext(DRIVER, ctx);
  const out = JSON.parse(vm.runInContext(`run([${JSON.stringify(JSON.stringify(ops))}])`, ctx));
  return { posted, out, clipboard };
}

test('the driver script: clicks with their count, combinations with their modifiers pressed and let go, scrolls, drags', () => {
  const { posted, out } = runDriver([
    { op: 'click', x: 720, y: 450, button: 0, count: 2, mods: [], flags: 0 },
    { op: 'key', code: 8, mods: [55], flags: FLAGS.cmd },
    { op: 'scroll', x: 5, y: 5, dx: 0, dy: -50, n: 2 },
    { op: 'drag', x1: 0, y1: 0, x2: 120, y2: 0 },
    { op: 'pos' },
  ]);
  assert.equal(out.done, 5);
  const mouse = posted.filter((e) => e.kind === 'mouse');
  // A move, then down/up as click 1 and down/up as click 2.
  assert.deepEqual(mouse.slice(0, 5).map((e) => [e.type, (e.fields as Record<number, number>)[1] ?? 0]), [[5, 0], [1, 1], [2, 1], [1, 2], [2, 2]]);
  const keys = posted.filter((e) => e.kind === 'key').map((e) => [e.code, e.down, e.flags]);
  assert.deepEqual(keys, [[55, true, FLAGS.cmd], [8, true, FLAGS.cmd], [8, false, FLAGS.cmd], [55, false, 0]], 'cmd down, c with cmd, cmd up');
  const wheels = posted.filter((e) => e.kind === 'scroll');
  assert.deepEqual(wheels.map((e) => [e.units, e.count, e.dy]), [[0, 1, -50], [0, 1, -50]], 'pixel scrolls, one wheel');
  const drag = mouse.slice(mouse.findIndex((e, i) => i > 4 && e.type === 1));
  assert.equal(drag[0].type, 1, 'the drag presses');
  assert.ok(drag.filter((e) => e.type === 6).length >= 10, 'moves with the button held');
  assert.deepEqual([drag.at(-1)!.type, drag.at(-1)!.x], [2, 120], 'and lets go at the end');
  assert.deepEqual(out.positions, [{ x: 10, y: 20 }]);
});

test('the driver script types any character on key events, and pastes (clipboard put back) where that is not possible', () => {
  const typed = runDriver([{ op: 'type', text: 'Γεια 😀\nok' }]);
  assert.equal(typed.out.typed, 'array');
  const downs = typed.posted.filter((e) => e.kind === 'key' && e.down);
  assert.deepEqual(downs.map((e) => e.chars ?? `#${e.code}`), ['Γ', 'ε', 'ι', 'α', ' ', '😀', '#36', 'o', 'k'], 'one event a character (an emoji whole), a new line as Return');
  const pasted = runDriver([{ op: 'type', text: 'héllo' }], { unicode: false });
  assert.equal(pasted.out.typed, 'paste');
  assert.deepEqual(pasted.clipboard, ['(cleared)', 'héllo', '(cleared)', '(put back 1)']);
  assert.deepEqual(pasted.posted.filter((e) => e.kind === 'key').map((e) => [e.code, e.down]), [[55, true], [9, true], [9, false], [55, false]], 'cmd+v');
  const info = runDriver([{ op: 'info' }]).out.info;
  assert.deepEqual(info, { pos: { x: 10, y: 20 }, display: { x: 0, y: 0, w: 1440, h: 900 }, displays: 2, app: 'Finder' });
});

// ---- the tools, with stand-ins for the Mac ----

const db = openDb(path.join(process.env.DATA_DIR!, 'test.db'));
const cards: { title: string; detail?: string }[] = [];
let answer: 'accept' | 'deny' = 'accept';
const adapter = {
  ask: async (card: { title: string; detail?: string }) => {
    cards.push(card);
    return { decision: answer };
  },
};
const events: unknown[] = [];
const deps = {
  db,
  broadcast: (e: unknown) => events.push(e),
  sessions: { adapterByRun: () => adapter, summary: (key: string) => ({ title: `Session ${key}` }) },
} as never;
const ctxOf = (key: string) => ({ runId: `run-${key}`, key, agent: 'claude' as const, cwd: '/tmp', deps });
const drives: unknown[][] = [];
machine.drive = async (ops) => {
  drives.push(ops);
  return { done: ops.length, positions: ops.filter((o) => o.op === 'pos').map(() => ({ x: 720, y: 450 })) };
};
machine.screenshot = async () => ({ jpeg: Buffer.from('JPEG'), geo: GEO, app: 'Finder', pos: { x: 720, y: 450 }, displays: 1 });
machine.openApp = async () => {};
access.setComputerDeps(deps);
let perms = { accessibility: true, screen: 'granted' as const };
access.hooks.permissions = async () => perms;
const tool = (key: string, name: string) => computerTools(ctxOf(key) as never).find((t) => t.name === name)!;
const call = async (key: string, name: string, args: Record<string, unknown> = {}) => {
  const r = await tool(key, name).run(args, ctxOf(key) as never);
  return typeof r === 'string' ? { text: r } : r;
};

test('only in a desktop app with Computer use on: no tools and no instructions otherwise; off at first', async () => {
  access.hooks.system = () => null;
  assert.deepEqual(computer.tools!(ctxOf('a') as never), []);
  assert.equal((await access.computerState(db)).available, false);
  access.hooks.system = () => 'mac';
  assert.equal(access.computerSettings(db).enabled, false, 'off at first');
  assert.deepEqual(computer.tools!(ctxOf('a') as never), []);
  assert.equal(computer.spawn!({} as never, deps), undefined);
  access.setComputerSettings(db, { enabled: true });
  assert.deepEqual(computer.tools!(ctxOf('a') as never).map((t) => t.name), ['computer_screenshot', 'computer_act']);
  const told = (computer.spawn!({} as never, deps) as { instructions: string[] }).instructions.join(' ');
  assert.match(told, /browser tools/);
  assert.match(told, /screenshot before acting/);
  assert.match(told, /passwords/);
  assert.match(told, /this Mac/);
  assert.match(told, /Esc/);
});

test('macOS’s permissions first: a missing one is named, with where the user allows it', async () => {
  perms = { accessibility: false, screen: 'granted' };
  access.resetAccess();
  const r = await call('a', 'computer_act', { action: 'wait' });
  assert.equal(r.isError, undefined, 'waiting needs no permission');
  const r2 = await call('a', 'computer_act', { action: 'key', text: 'return', screenshot: false });
  assert.match(r2.text, /does not allow Hydor Accessibility/);
  assert.match(r2.text, /Settings → Capabilities → Computer use/);
  perms = { accessibility: true, screen: 'denied' as never };
  access.resetAccess();
  assert.match((await call('a', 'computer_screenshot')).text, /Screen Recording/);
  perms = { accessibility: true, screen: 'granted' };
  access.resetAccess();
  cards.length = 0;
});

test('the first use in a session asks on a card; no is respected; yes holds for the session', async () => {
  answer = 'deny';
  const no = await call('a', 'computer_screenshot');
  assert.equal(no.isError, true);
  assert.match(no.text, /The user said no/);
  assert.equal(cards.at(-1)?.title, 'Let the agent use your Mac?');
  assert.match(cards.at(-1)?.detail ?? '', /press \*\*Esc\*\*/);
  assert.match(cards.at(-1)?.detail ?? '', /glow/);
  answer = 'accept';
  const shot = await call('a', 'computer_screenshot');
  assert.equal(shot.isError, undefined);
  const step = Number(/^Computer step (\d+): Looked at the screen\./.exec(shot.text)?.[1]);
  assert.ok(step > 0, shot.text);
  assert.match(shot.text, /1280×800 pixels in this picture \(1440×900 points\)/);
  assert.match(shot.text, /In front: Finder\. The pointer is at \(640, 400\)/);
  assert.deepEqual(shot.images, [{ data: Buffer.from('JPEG').toString('base64'), mimeType: 'image/jpeg' }]);
  assert.ok(stepFile('a', step), 'its picture is kept for the row');
  const n = cards.length;
  const act = await call('a', 'computer_act', { steps: [{ action: 'left_click', coordinate: [640, 400] }, { action: 'type', text: 'hi' }, { action: 'cursor_position' }] });
  assert.equal(cards.length, n, 'no second card');
  assert.match(act.text, new RegExp(`^Computer step ${step + 1}:\\n1`));
  assert.match(act.text, /:\n1\. Clicked at \(640, 400\)\.\n2\. Typed “hi”\.\n3\. The pointer is at \(640, 400\)\./);
  assert.deepEqual((drives.at(-1) as { op: string; x?: number }[])[0], { op: 'click', x: 720, y: 450, button: 0, count: 1, mods: [], flags: 0 }, 'the click lands on the point under the pixel');
  assert.deepEqual(access.activeView()?.key, 'a', 'the session is at the Mac');
  assert.ok(events.some((e) => (e as { data?: { active?: { key: string } } }).data?.active?.key === 'a'), 'the pages hear of it');
});

test('one session at a time; Stop ends it, and the session asks again before it goes on', async () => {
  const other = await call('b', 'computer_screenshot');
  assert.match(other.text, /Another session \(“Session a”\) is using this Mac right now/);
  assert.equal(access.stopAll(), 1);
  assert.equal(access.activeView(), null);
  const n = cards.length;
  const again = await call('a', 'computer_screenshot');
  assert.equal(cards.length, n + 1, 'asked again');
  assert.equal(cards.at(-1)?.title, 'You stopped the agent using your Mac. Let it go on?');
  assert.equal(again.isError, undefined);
  // Stopped part way through an action: the agent is told, and nothing is left held down.
  machine.drive = async (ops, signal) => {
    drives.push(ops);
    if (ops[0]?.op === 'release') return { done: 1, positions: [] };
    access.stopAll();
    if (signal?.aborted) throw new Error('Stopped');
    return { done: ops.length, positions: [] };
  };
  const cut = await call('a', 'computer_act', { action: 'left_mouse_down', coordinate: [1, 1] });
  assert.equal(cut.isError, true);
  assert.match(cut.text, /The user stopped you using their Mac/);
  assert.deepEqual(drives.at(-1), [{ op: 'release' }]);
  access.setComputerSettings(db, { enabled: false });
  assert.equal((await call('a', 'computer_screenshot')).text, access.OFF, 'turned off: refused');
});

test('Esc is let go while the agent presses it: its Escape goes alone, between the other steps', async () => {
  access.setComputerSettings(db, { enabled: true });
  access.resetAccess();
  answer = 'accept';
  machine.drive = async (ops) => {
    drives.push(ops);
    return { done: ops.length, positions: [] };
  };
  await call('e', 'computer_screenshot');
  drives.length = 0;
  const r = await call('e', 'computer_act', { steps: [{ action: 'left_click', coordinate: [1, 1] }, { action: 'key', text: 'escape' }, { action: 'type', text: 'x' }], screenshot: false });
  assert.equal(r.isError, undefined, r.text);
  assert.deepEqual(
    drives.map((ops) => (ops as { op: string }[]).map((o) => o.op)),
    [['click'], ['key'], ['type']],
    'three runs of the driver: before, the Escape, after',
  );
  assert.match(r.text, /2\. Pressed escape\./);
});

test('on Windows and Linux: their own words, keys and examples; what keeps it from working is said first', async () => {
  access.hooks.system = () => 'windows';
  access.resetAccess();
  cards.length = 0;
  const tools = computerTools(ctxOf('w') as never);
  const act = tools.find((t) => t.name === 'computer_act')!;
  assert.match(act.description, /this PC/);
  assert.match(act.description, /ctrl\+c/);
  assert.match(act.description, /backspace erases before the cursor, delete after it/);
  assert.match((computer.spawn!({} as never, deps) as { instructions: string[] }).instructions.join(' '), /use this PC/);
  await call('w', 'computer_screenshot');
  assert.equal(cards.at(-1)?.title, 'Let the agent use your PC?');
  assert.match(cards.at(-1)?.detail ?? '', /notification area/);
  drives.length = 0;
  const r = await call('w', 'computer_act', { action: 'key', text: 'cmd+v', screenshot: false });
  assert.equal(r.isError, undefined, r.text);
  assert.deepEqual(drives.at(-1), [{ op: 'key', code: 0x56, mods: [0x11], flags: 1 }], 'virtual-key codes, cmd as ctrl');
  const st = await access.computerState(db);
  assert.equal(st.system, 'windows');
  assert.equal(st.permissions, undefined, 'no macOS permissions to ask for');

  access.hooks.system = () => 'linux';
  access.hooks.problem = async () => 'This Linux desktop runs on Wayland.';
  access.resetAccess();
  const no = await call('l', 'computer_screenshot');
  assert.equal(no.isError, true);
  assert.match(no.text, /cannot work on this computer now: This Linux desktop runs on Wayland\. Tell the user\./);
  assert.equal((await access.computerState(db)).problem, 'This Linux desktop runs on Wayland.');
  access.hooks.problem = async () => null;
  cards.length = 0;
  await call('l', 'computer_screenshot');
  assert.equal(cards.at(-1)?.title, 'Let the agent use your computer?');
  access.hooks.system = () => 'mac';
});

test('Linux: Wayland told apart from X11; apps found by their names and ids; Exec lines without field codes', () => {
  assert.equal(wayland({ XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }), true);
  assert.equal(wayland({ XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' }), false);
  assert.equal(wayland({ WAYLAND_DISPLAY: 'wayland-0' }), true, 'no session type said: Wayland');
  const e = (id: string, names: string[], generic: string[] = [], hidden = false) => ({ id, file: `/usr/share/applications/${id}`, names, generic, exec: '', hidden });
  const list = [
    e('org.gnome.TextEditor.desktop', ['Text Editor', 'Επεξεργαστής κειμένου']),
    e('firefox_firefox.desktop', ['Firefox'], ['Web Browser']),
    e('org.gnome.Nautilus.desktop', ['Files']),
    e('display-im6.q16.desktop', ['ImageMagick (display Q16)'], [], true),
  ];
  assert.equal(findEntry('text editor', list)?.id, 'org.gnome.TextEditor.desktop');
  assert.equal(findEntry('Επεξεργαστής κειμένου', list)?.id, 'org.gnome.TextEditor.desktop', 'by its name in the user’s language');
  assert.equal(findEntry('texteditor', list)?.id, 'org.gnome.TextEditor.desktop', 'by the end of its id');
  assert.equal(findEntry('web browser', list)?.id, 'firefox_firefox.desktop', 'by what it is');
  assert.equal(findEntry('fire', list)?.id, 'firefox_firefox.desktop');
  assert.equal(findEntry('imagemagick', list), null, 'hidden entries only by their exact name');
  assert.equal(findEntry('photoshop', list), null);
  assert.deepEqual(execArgs('firefox %u'), ['firefox']);
  assert.deepEqual(execArgs('"/opt/My App/app" --new-window %F --name=%%x'), ['/opt/My App/app', '--new-window', '--name=%x']);
  assert.deepEqual(execArgs('env FOO="a b" code --unity-launch %F'), ['env', 'FOO=a b', 'code', '--unity-launch']);
});

test('helper programs: started once, asked line by line, errors said, and ended by Stop (then started again)', async () => {
  const prog = `
    const rl = require('readline').createInterface({ input: process.stdin });
    console.log(JSON.stringify({ ready: true, pid: process.pid, compositor: true }));
    rl.on('line', (l) => {
      const m = JSON.parse(l);
      if (m.ops[0].op === 'fail') return console.log(JSON.stringify({ id: m.id, ok: false, error: 'it broke' }));
      if (m.ops[0].op === 'slow') return;
      console.log(JSON.stringify({ id: m.id, ok: true, out: { done: m.ops.length, text: m.ops[0].text } }));
    });`;
  const h = new Helper({ name: 'The test helper', command: () => ({ cmd: process.execPath, args: ['-e', prog] }) });
  const r = await h.call({ ops: [{ op: 'type', text: 'héllo ☃ 你好' }] }, { timeoutMs: 5000 });
  assert.deepEqual(r, { done: 1, text: 'héllo ☃ 你好' }, 'any character goes through');
  const pid = h.facts?.pid;
  assert.equal(h.facts?.compositor, true, 'what it said when ready');
  await h.call({ ops: [{ op: 'x' }] }, { timeoutMs: 5000 });
  assert.equal(h.facts?.pid, pid, 'the same program, asked again');
  await assert.rejects(h.call({ ops: [{ op: 'fail' }] }, { timeoutMs: 5000 }), /it broke/);
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 100);
  await assert.rejects(h.call({ ops: [{ op: 'slow' }] }, { timeoutMs: 5000, signal: stop.signal }), /Stopped/);
  await assert.rejects(h.call({ ops: [{ op: 'slow' }] }, { timeoutMs: 200 }), /took too long/);
  await h.call({ ops: [{ op: 'x' }] }, { timeoutMs: 5000 });
  assert.notEqual(h.facts?.pid, pid, 'started again after it was stopped');
  h.stop();
  const broken = new Helper({ name: 'The broken helper', command: () => ({ cmd: process.execPath, args: ['-e', 'console.error("libXtst is not on this computer"); process.exit(3)'] }) });
  await assert.rejects(broken.start(), /The broken helper stopped \(exit 3\): libXtst is not on this computer/);
  const missing = new Helper({ name: 'The missing helper', command: () => ({ cmd: '/nonexistent/python3', args: [] }) });
  await assert.rejects(missing.start(), /ENOENT/);
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
