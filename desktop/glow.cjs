// The glow around the screen while an agent uses the computer (computer use, server/computer/): every display's edges
// light up in Hydor's water colours, breathing slowly, and a note at the bottom says an agent is at it and that Esc stops
// it. The windows are see-through, let every click through, never take the focus, and stay above everything (full-
// screen apps too). They are for the person at the computer, never for the agent: they are hidden for the moment a
// screenshot takes (veil, then unveil), and on Linux the app takes the screenshot itself (capture). They also ask the
// system to leave them out of captures (other apps' screen recordings and sharing), which neither macOS 15.4 and later
// nor Windows' copy of the screen can be trusted to do, so hiding them is what keeps them out of the agent's. On Linux
// they show only with a compositor (the server says, from X11), since a see-through window shows black without one.
'use strict';
const { BrowserWindow, desktopCapturer, screen } = require('electron');
const os = require('node:os');

const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
const LINUX = !MAC && !WIN;
/** Windows 10 2004 and later leave out of captures the windows that ask; before, they would come out black in them. */
const LEAVE_OUT = MAC || (WIN && Number(os.release().split('.')[2]) >= 19041);

let on = false;
let words = { using: 'An agent is using your computer', esc: 'Press Esc to stop' };
let veiled = false;
let veilTimer = null;
/** A window per display, by the display's id. */
const windows = new Map();
let watching = false;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The page of one display's window: four glowing edges, and the note at the bottom, above the Dock or the taskbar. */
function page(display) {
  const b = display.bounds;
  const w = display.workArea;
  const bottom = Math.max(0, b.y + b.height - (w.y + w.height)) + 16;
  const note = esc(words.esc).replace(/\bEsc\b/, '<kbd>Esc</kbd>');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Hydor</title><style>
:root{--a:#5eead4;--b:#38bdf8;--c:#60a5fa;--d:#a78bfa}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;cursor:default;user-select:none}
body.veiled{opacity:0}
.glow{position:fixed;inset:0;animation:breathe 2.8s ease-in-out infinite alternate}
.e{position:fixed}
.t,.b{left:0;right:0;height:56px;background:linear-gradient(90deg,var(--a),var(--b) 28%,var(--c) 52%,var(--d) 74%,var(--a))}
.l,.r{top:0;bottom:0;width:56px;background:linear-gradient(180deg,var(--a),var(--b) 35%,var(--c) 65%,var(--d))}
.t{top:0;-webkit-mask:linear-gradient(to bottom,#000 0 3px,rgba(0,0,0,.55) 4px,rgba(0,0,0,.22) 18px,transparent)}
.b{bottom:0;-webkit-mask:linear-gradient(to top,#000 0 3px,rgba(0,0,0,.55) 4px,rgba(0,0,0,.22) 18px,transparent)}
.l{left:0;-webkit-mask:linear-gradient(to right,#000 0 3px,rgba(0,0,0,.55) 4px,rgba(0,0,0,.22) 18px,transparent)}
.r{right:0;-webkit-mask:linear-gradient(to left,#000 0 3px,rgba(0,0,0,.55) 4px,rgba(0,0,0,.22) 18px,transparent)}
.note{position:fixed;bottom:${bottom}px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:7px 15px 7px 12px;
border-radius:999px;background:rgba(7,11,19,.9);border:1px solid rgba(56,189,248,.5);color:#e9edf5;white-space:nowrap;
box-shadow:0 0 22px rgba(56,189,248,.35),0 8px 24px rgba(0,0,0,.4);
font:500 13px/1.25 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Ubuntu,"Noto Sans",sans-serif}
.dot{width:8px;height:8px;border-radius:50%;background:var(--a);box-shadow:0 0 10px var(--a);animation:pulse 1.6s ease-in-out infinite}
.sep{width:1px;height:14px;background:rgba(233,237,245,.25)}
.esc{color:#b9c3d6}
kbd{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e9edf5;padding:2px 6px;margin:0 1px;border-radius:5px;
background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);border-bottom-width:2px}
@keyframes breathe{from{opacity:.62}to{opacity:1}}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.7);opacity:.55}}
@media (prefers-reduced-motion:reduce){.glow,.dot{animation:none}}
</style></head><body class="veiled"><div class="glow"><div class="e t"></div><div class="e b"></div><div class="e l"></div><div class="e r"></div></div>
<div class="note"><span class="dot"></span><span>${esc(words.using)}</span><span class="sep"></span><span class="esc">${note}</span></div></body></html>`;
}

function make(display) {
  const b = display.bounds;
  const w = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    title: 'Hydor',
    // A panel never makes the app active (macOS); a tool window stays out of Alt+Tab (Windows); a notification sits
    // above everything, full-screen windows too, and takes no focus (Linux).
    type: MAC ? 'panel' : WIN ? 'toolbar' : 'notification',
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  w.setIgnoreMouseEvents(true);
  w.setContentProtection(LEAVE_OUT);
  w.setAlwaysOnTop(true, 'screen-saver');
  // Over full-screen apps and on every desktop (Spaces), without the app's Dock icon blinking (macOS).
  if (MAC) w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  else if (LINUX) w.setVisibleOnAllWorkspaces(true);
  void w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page(display))}`);
  w.once('ready-to-show', () => {
    if (w.isDestroyed() || !on) return;
    w.setBounds(b);
    if (veiled && !LINUX) w.setOpacity(0);
    w.showInactive();
    // It shows at once, unless a screenshot is being taken right now.
    if (!veiled) void w.webContents.executeJavaScript('document.body.classList.remove("veiled")').catch(() => {});
  });
  return w;
}

function clear() {
  for (const w of windows.values()) if (!w.isDestroyed()) w.destroy();
  windows.clear();
}

/** A window for each display as they are now. */
function rebuild() {
  clear();
  if (!on) return;
  for (const d of screen.getAllDisplays()) windows.set(d.id, make(d));
}

/** Shows the glow (with the note's words, in the user's language) or takes it away. */
function setGlow(show, said) {
  if (said) words = { using: said.using || words.using, esc: said.esc || words.esc };
  on = !!show;
  if (!watching) {
    watching = true;
    // A display added, taken away, moved or rescaled (or the menu bar, Dock or taskbar moving the note).
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => on && rebuild());
  }
  if (on) rebuild();
  else {
    clear();
    veiled = false;
    clearTimeout(veilTimer);
  }
}

/** Hides the glow at once, for a screenshot: resolves once the screen shows without it. */
async function veil() {
  veiled = true;
  clearTimeout(veilTimer);
  // Never left hidden, whatever happens to the screenshot.
  veilTimer = setTimeout(unveil, 15_000);
  const list = [...windows.values()].filter((w) => !w.isDestroyed() && w.isVisible());
  if (!list.length) return;
  await Promise.all(
    list.map((w) => {
      // macOS and Windows drop the window at once; Linux has no window opacity, so the page goes see-through.
      if (!LINUX) w.setOpacity(0);
      const drawn = w.webContents
        .executeJavaScript('new Promise((r) => { document.body.classList.add("veiled"); requestAnimationFrame(() => requestAnimationFrame(() => r(1))); })')
        .catch(() => {});
      return Promise.race([drawn, wait(200)]);
    }),
  );
  // A frame or two more for the system's compositor to show the screen without it.
  await wait(LINUX ? 70 : 50);
}

/** The glow back after a screenshot. */
function unveil() {
  veiled = false;
  clearTimeout(veilTimer);
  for (const w of windows.values()) {
    if (w.isDestroyed()) continue;
    if (!LINUX) w.setOpacity(1);
    void w.webContents.executeJavaScript('document.body.classList.remove("veiled")').catch(() => {});
  }
}

/** The main display as a JPEG at most `max` pixels on its longer side, without the glow (Linux, where the app looks). */
async function capture(max, quality) {
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor || 1;
  const px = { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) };
  const s = Math.min(1, max / Math.max(px.width, px.height, 1));
  const size = { width: Math.max(1, Math.round(px.width * s)), height: Math.max(1, Math.round(px.height * s)) };
  await veil();
  let sources;
  try {
    sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  } finally {
    unveil();
  }
  const src = sources.find((x) => String(x.display_id) === String(d.id)) || sources[0];
  if (!src || src.thumbnail.isEmpty()) throw new Error('the screen could not be captured');
  return {
    jpeg: src.thumbnail.toJPEG(Math.max(1, Math.min(100, Number(quality) || 70))).toString('base64'),
    // The display the picture shows, in the screen's pixels (where X11 puts the pointer).
    display: { x: Math.round(d.bounds.x * sf), y: Math.round(d.bounds.y * sf), w: px.width, h: px.height },
    displays: screen.getAllDisplays().length,
  };
}

module.exports = { setGlow, veil, unveil, capture, glowing: () => on };
