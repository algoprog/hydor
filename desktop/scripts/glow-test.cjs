// The glow is the person's, never the agent's: run with the desktop app's Electron on each system (the desktop
// workflow does, after packing), it shows glow.cjs over a plain window of a known colour, takes the agent's
// screenshot as the server does there, and checks the screen's edges in it show that colour, not the glow:
//   macOS    screencapture, with the glow hidden meanwhile (macOS 15.4 and later capture even windows that ask not)
//   Windows  the built helper (HYDOR_COMPUTER_HELPER), with the glow hidden meanwhile (its copy of the screen takes
//            in windows that ask to be left out, as the first run of this test showed)
//   Linux    the app's own capture, on an X display with a compositor (else the app shows no glow at all)
// It also checks the person sees it: on Linux a capture without hiding it shows it; on a Mac, where captures may leave
// it out by themselves, macOS's own list of the windows on screen has it, over the whole display, above the others. The
// agent's pointer over the screen (drawn in the same windows) is checked the same way: seen, never in the screenshot.
//   npx electron scripts/glow-test.cjs     (in desktop/)
'use strict';
const { app, BrowserWindow, desktopCapturer, nativeImage, screen } = require('electron');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const glow = require('../glow.cjs');

const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
const COLOUR = { r: 0x12, g: 0x34, b: 0x56 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-glow-test-'));
let fails = 0;
const say = (ok, name, detail = '') => {
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${name}${ok ? '' : `  -> ${detail}`}`);
  if (!ok) fails++;
};

function pixel(img, x, y) {
  const { width } = img.getSize();
  const b = img.toBitmap();
  const i = (Math.round(y) * width + Math.round(x)) * 4;
  return { r: b[i + 2], g: b[i + 1], b: b[i] };
}
const near = (p, q, by = 30) => Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b) <= by;
const fmt = (p) => `rgb(${p.r},${p.g},${p.b})`;

/** Windows: one picture of the screen from the helper the workflow just built. */
function helperShot() {
  return new Promise((resolve, reject) => {
    const exe = process.env.HYDOR_COMPUTER_HELPER;
    if (!exe) return reject(new Error('HYDOR_COMPUTER_HELPER is not set'));
    const child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (l) => {
      const m = JSON.parse(l);
      if (m.ready) return void child.stdin.write(`${JSON.stringify({ id: 1, shot: { max: 8192, quality: 95 } })}\n`);
      child.stdin.end();
      if (m.ok) resolve(nativeImage.createFromBuffer(Buffer.from(m.out.jpeg, 'base64')));
      else reject(new Error(m.error));
    });
    child.on('error', reject);
  });
}

/** The screen as the agent gets it, as the server takes it on this system. */
async function agentShot() {
  if (MAC) {
    const f = path.join(tmp, 'agent.png');
    await glow.veil();
    try {
      execFileSync('/usr/sbin/screencapture', ['-x', '-m', '-t', 'png', f]);
    } finally {
      glow.unveil();
    }
    return nativeImage.createFromPath(f);
  }
  if (WIN) {
    await glow.veil();
    try {
      return await helperShot();
    } finally {
      glow.unveil();
    }
  }
  const shot = await glow.capture(8192, 95);
  return nativeImage.createFromBuffer(Buffer.from(shot.jpeg, 'base64'));
}

/** The screen as it is, the glow not hidden: what the person sees (macOS, Linux). */
async function screenAsIs() {
  if (MAC) {
    const f = path.join(tmp, 'seen.png');
    execFileSync('/usr/sbin/screencapture', ['-x', '-m', '-t', 'png', f]);
    return nativeImage.createFromPath(f);
  }
  const d = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) } });
  return (sources.find((s) => String(s.display_id) === String(d.id)) || sources[0]).thumbnail;
}

app.whenReady().then(async () => {
  const d = screen.getPrimaryDisplay();
  const w = d.workArea;
  // A plain window over the work area, the glow over it all.
  const plain = new BrowserWindow({ ...w, frame: false, show: false, backgroundColor: '#123456', webPreferences: { sandbox: true } });
  await plain.loadURL('data:text/html,<body style="margin:0;background:%23123456"></body>');
  plain.showInactive();
  await wait(1500);
  glow.setGlow(true, { using: 'An agent is using your computer', esc: 'Press Esc to stop' });
  await wait(2500);
  // Inside the plain window, a few pixels in from the work area's edges: on the glow's lines.
  const spots = {
    'left edge': [w.x + 2, w.y + w.height / 2],
    'right edge': [w.x + w.width - 3, w.y + w.height / 2],
    'middle, for the plain window itself': [w.x + w.width / 2, w.y + w.height / 2],
  };
  if (w.y === d.bounds.y) spots['top edge'] = [w.x + w.width / 2, w.y + 2];
  let agent;
  try {
    agent = await agentShot();
  } catch (e) {
    say(false, 'the agent’s screenshot', String(e && e.message));
    app.exit(1);
    return;
  }
  const scale = agent.getSize().width / d.bounds.width;
  const at = (img, [x, y]) => pixel(img, (x - d.bounds.x) * scale, (y - d.bounds.y) * scale);
  if (!near(at(agent, spots['middle, for the plain window itself']), COLOUR)) {
    // No Screen Recording permission (macOS), or no picture of windows at all: nothing can be told.
    console.log(`skipped: the screenshot does not show the plain window (${fmt(at(agent, spots['middle, for the plain window itself']))}); no permission to see the screen here?`);
    app.exit(0);
    return;
  }
  for (const [name, spot] of Object.entries(spots)) say(near(at(agent, spot), COLOUR), `the agent’s screenshot shows no glow at the ${name}`, fmt(at(agent, spot)));
  if (MAC) {
    // macOS's own list of the windows on screen: this app's, with their level and where they are (in points).
    const script = `ObjC.import('CoreGraphics');
      var all = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0)));
      JSON.stringify(all.filter(function (w) { return w.kCGWindowOwnerPID === ${process.pid}; }).map(function (w) {
        return { layer: w.kCGWindowLayer, bounds: w.kCGWindowBounds, alpha: w.kCGWindowAlpha };
      }));`;
    let mine = [];
    try {
      mine = JSON.parse(execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8' }));
    } catch (e) {
      console.log(`      could not read macOS's list of windows: ${String(e && e.message).split('\n')[0]}`);
    }
    const b = d.bounds;
    const over = mine.find((w) => w.bounds && w.bounds.X === b.x && w.bounds.Y === b.y && w.bounds.Width === b.width && w.bounds.Height === b.height && w.layer >= 1000);
    say(!!over, 'the person sees the glow: on screen over the whole display, above the other windows', JSON.stringify(mine));
  }
  if (!WIN) {
    await wait(800);
    const seen = await screenAsIs();
    const s = scale * (seen.getSize().width / agent.getSize().width);
    const glowing = !near(pixel(seen, (spots['left edge'][0] - d.bounds.x) * s, (spots['left edge'][1] - d.bounds.y) * s), COLOUR, 60);
    if (MAC) console.log(`      without hiding it, a capture ${glowing ? 'shows' : 'leaves out'} the glow on this macOS (${os.release()}): ${glowing ? 'hiding it is needed' : 'it keeps the window out by itself'}`);
    else say(glowing, 'the person sees the glow (a capture without hiding it shows it)');
  }
  // The agent's pointer, over the plain window: in the person's view of the screen, never in the agent's screenshot.
  const spot = { x: Math.round(w.x + w.width / 2), y: Math.round(w.y + w.height / 2) };
  const sf = MAC ? 1 : d.scaleFactor || 1;
  glow.pointer({ steps: [{ at: 0, act: 'move', x: spot.x * sf, y: spot.y * sf }] });
  await wait(700);
  // On its ring, beside the point (the ring is 46 points across).
  const ring = [spot.x + 24, spot.y];
  const agent2 = await agentShot();
  say(near(at(agent2, ring), COLOUR), 'the agent’s screenshot shows no pointer of its own', fmt(at(agent2, ring)));
  if (!WIN) {
    await wait(500);
    const seen = await screenAsIs();
    const s = scale * (seen.getSize().width / agent2.getSize().width);
    const p = pixel(seen, (ring[0] - d.bounds.x) * s, (ring[1] - d.bounds.y) * s);
    if (MAC && near(p, COLOUR)) console.log('      a capture leaves the pointer out by itself on this macOS: macOS’s own list of the windows says the person sees it (above)');
    else say(!near(p, COLOUR, 60), 'the person sees the agent’s pointer (a capture without hiding it shows its ring)', fmt(p));
  }
  glow.setGlow(false);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? `FAILED ${fails}` : 'ALL PASSED');
  app.exit(fails ? 1 : 0);
});
