// The glow around the screen while an agent uses the computer (computer use, server/computer/): every display's edges
// light up in Hydor's water colours, breathing slowly, and a note at the bottom says an agent is at it and that Esc stops
// it. Over the real pointer, the agent's own (pointer): a large ring and halo in the same colours with an "Agent" tag,
// gliding as the driver glides the real one, a ripple on each click, the keys pressed or the words typed beside it, from
// the server's timeline of what the driver does. The windows are see-through, let every click through, never take the
// focus, and stay above everything (full-screen apps too). They are for the person at the computer, never for the
// agent: they are hidden for the moment a screenshot takes (veil, then unveil), and on Linux the app takes the
// screenshot itself (capture). They also ask the system to leave them out of captures (other apps' screen recordings and
// sharing), which neither macOS 15.4 and later nor Windows' copy of the screen can be trusted to do, so hiding them is
// what keeps them out of the agent's. On Linux they show only with a compositor (the server says, from X11), since a
// see-through window shows black without one.
'use strict';
const { BrowserWindow, desktopCapturer, screen } = require('electron');
const os = require('node:os');

const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
const LINUX = !MAC && !WIN;
/** Windows 10 2004 and later leave out of captures the windows that ask; before, they would come out black in them. */
const LEAVE_OUT = MAC || (WIN && Number(os.release().split('.')[2]) >= 19041);

let on = false;
let words = { using: 'An agent is using your computer', esc: 'Press Esc to stop', agent: 'Agent' };
let veiled = false;
let veilTimer = null;
/** A window per display, by the display's id. */
const windows = new Map();
let watching = false;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The agent's pointer in a glow window's page: agent(e) puts it at (e.x, e.y) in the window (the app sends where the
 * real pointer is as the driver moves it; a drag glides there over e.ms too, from e.from when given), then shows what
 * it did: a ripple (dashed for a right click, two or three for
 * a double or triple click), the ring pressed while a button is held, a badge with the way it scrolls, the words it
 * typed or the keys it pressed beside the tag. agent({ hide: true }) takes it away (it went to another display). What it
 * shows comes in as text, never as markup.
 */
const POINTER_SCRIPT = `(function () {
  var ag = document.getElementById('ag'), said = document.getElementById('said'), fx = document.getElementById('fx');
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches, shown = false, gone = 0, held = false;
  function put(x, y, ms) {
    ag.style.transition = ms && !still ? 'transform ' + ms + 'ms cubic-bezier(.65,0,.35,1)' : 'none';
    ag.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    ag.classList.toggle('left', x > innerWidth - 320);
    ag.classList.toggle('up', y > innerHeight - 110);
  }
  function ripple(x, y, dashed) {
    var r = document.createElement('div');
    r.className = 'rip' + (dashed ? ' dash' : '');
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    fx.appendChild(r);
    r.addEventListener('animationend', function () { r.remove(); });
  }
  function badge(x, y, dir) {
    var d = { down: [0, 1, 0], up: [0, -1, 180], left: [-1, 0, 90], right: [1, 0, -90] }[dir] || [0, 1, 0];
    var b = document.createElement('div');
    b.className = 'scr' + (ag.classList.contains('left') ? '' : ' before');
    b.style.left = x + 'px';
    b.style.top = y + 'px';
    b.style.setProperty('--dx', d[0] * 16 + 'px');
    b.style.setProperty('--dy', d[1] * 16 + 'px');
    b.innerHTML = '<svg viewBox="0 0 24 24" style="transform:rotate(' + d[2] + 'deg)"><path d="M6 6l6 6 6-6M6 12l6 6 6-6" fill="none" stroke="#07101c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    fx.appendChild(b);
    b.addEventListener('animationend', function () { b.remove(); });
  }
  function say(text, keys) {
    said.textContent = '';
    if (keys) {
      text.split(' ').forEach(function (combo, i) {
        if (i) said.appendChild(document.createTextNode(' '));
        combo.split('+').forEach(function (k, j) {
          if (j) said.appendChild(document.createTextNode('+'));
          var kb = document.createElement('kbd');
          kb.textContent = k;
          said.appendChild(kb);
        });
      });
    } else said.textContent = text.length > 64 ? '…' + text.slice(-63) : text;
    said.classList.add('on');
    clearTimeout(gone);
    gone = setTimeout(function () { said.classList.remove('on'); }, 2400);
  }
  window.agent = function (e) {
    if (e.hide) {
      ag.classList.remove('on');
      shown = false;
      return;
    }
    var glides = e.act === 'move' || e.act === 'drag';
    if (!shown || (glides && e.from)) {
      var f = glides && e.from ? e.from : e;
      put(f.x, f.y, 0);
      ag.classList.add('on');
      shown = true;
      void ag.offsetWidth;
    }
    put(e.x, e.y, glides ? e.ms || 0 : 0);
    var a = e.act;
    if (a === 'click' || a === 'middle' || a === 'right') ripple(e.x, e.y, a === 'right');
    else if (a === 'double' || a === 'triple') {
      for (var i = 0; i < (a === 'double' ? 2 : 3); i++) setTimeout(ripple, i * 150, e.x, e.y, false);
    } else if (a === 'down') held = true;
    else if (a === 'up') {
      held = false;
      ripple(e.x, e.y, false);
    } else if (a === 'drag') {
      held = true;
      setTimeout(function () {
        held = false;
        ag.classList.remove('held');
        ripple(e.x, e.y, false);
      }, (e.ms || 0) + 60);
    } else if (a === 'scroll') badge(e.x, e.y, e.dir);
    else if (a === 'type' && e.text) say(e.text, false);
    else if (a === 'key' && e.keys) say(e.keys, true);
    ag.classList.toggle('held', held);
  };
})();`;

/** The page of one display's window: four glowing edges, the note at the bottom (above the Dock or the taskbar), and the agent's pointer. */
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
.ag{position:fixed;left:0;top:0;width:0;height:0;display:none;z-index:5}
.ag.on{display:block}
.halo{position:absolute;width:108px;height:108px;left:-54px;top:-54px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.4),rgba(94,234,212,.15) 46%,transparent 70%)}
.ring{position:absolute;width:46px;height:46px;left:-26px;top:-26px;border-radius:50%;border:3px solid var(--b);transition:transform .12s,border-color .12s;
box-shadow:0 0 0 1.5px rgba(7,11,19,.6),inset 0 0 0 1.5px rgba(7,11,19,.35),0 0 18px rgba(56,189,248,.85)}
.ag.held .ring{transform:scale(.78);border-color:var(--a)}
.tag{position:absolute;left:28px;top:20px;display:flex;align-items:center;gap:6px;white-space:nowrap}
.ag.left .tag{left:auto;right:28px;flex-direction:row-reverse}
.ag.up .tag{top:-46px}
.who,.said{padding:3px 9px;background:rgba(7,11,19,.92);color:#e9edf5;font:600 12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Ubuntu,"Noto Sans",sans-serif}
.who{border-radius:999px;border:1px solid rgba(56,189,248,.65);box-shadow:0 0 14px rgba(56,189,248,.35)}
.said{display:none;max-width:440px;overflow:hidden;text-overflow:ellipsis;border-radius:8px;border:1px solid rgba(233,237,245,.22);font-weight:500;font-size:13px}
.said.on{display:block}
.rip{position:fixed;width:132px;height:132px;margin:-66px 0 0 -66px;border-radius:50%;border:3px solid var(--b);box-shadow:0 0 18px rgba(56,189,248,.6);
background:radial-gradient(circle,rgba(56,189,248,.3),rgba(56,189,248,.08) 62%,transparent 72%);animation:rip .62s cubic-bezier(.2,.6,.35,1) both}
.rip.dash{border-style:dashed}
.scr{position:fixed;width:40px;height:40px;margin:-20px 0 0 30px;border-radius:50%;background:var(--b);display:flex;align-items:center;justify-content:center;
box-shadow:0 0 0 2px rgba(7,11,19,.55),0 0 16px rgba(56,189,248,.7);animation:scr .9s ease-out both}
.scr.before{margin-left:-72px}
.scr svg{width:22px;height:22px}
@keyframes rip{from{transform:scale(.25);opacity:1}to{transform:scale(1);opacity:0}}
@keyframes scr{0%{opacity:0;transform:none}20%,65%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
@keyframes breathe{from{opacity:.62}to{opacity:1}}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.7);opacity:.55}}
@media (prefers-reduced-motion:reduce){.glow,.dot{animation:none}.rip{animation-name:fade}.scr{animation-name:fade}}
@keyframes fade{from{opacity:1;transform:scale(.55)}to{opacity:0;transform:scale(.55)}}
</style></head><body class="veiled"><div class="glow"><div class="e t"></div><div class="e b"></div><div class="e l"></div><div class="e r"></div></div>
<div class="note"><span class="dot"></span><span>${esc(words.using)}</span><span class="sep"></span><span class="esc">${note}</span></div>
<div id="fx"></div><div id="ag" class="ag"><div class="halo"></div><div class="ring"></div><div class="tag"><span class="who">${esc(words.agent)}</span><span id="said" class="said"></span></div></div>
<script>${POINTER_SCRIPT}</script></body></html>`;
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
  for (const t of timers) clearTimeout(t);
  timers.clear();
  clearTimeout(following);
  pointerIn = null;
  lastAt = null;
}

/** A window for each display as they are now. */
function rebuild() {
  clear();
  if (!on) return;
  for (const d of screen.getAllDisplays()) windows.set(d.id, make(d));
}

/** Shows the glow (with the note's and the pointer's words, in the user's language) or takes it away. */
function setGlow(show, said) {
  if (said) words = { using: said.using || words.using, esc: said.esc || words.esc, agent: said.agent || words.agent };
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

// ---- the agent's pointer ----------------------------------------------------------------------------------------

/** The steps of the pointer's timeline still to come, the display it shows on (its id), where it last was, and its following. */
const timers = new Set();
let pointerIn = null;
let lastAt = null;
let following = null;

/** A place as the driver gives it (points on a Mac, the screen's pixels elsewhere) in the app's points. */
function toDip(x, y) {
  if (MAC) return { x, y };
  try {
    if (typeof screen.screenToDipPoint === 'function') return screen.screenToDipPoint({ x, y });
  } catch {}
  const sf = screen.getPrimaryDisplay().scaleFactor || 1;
  return { x: x / sf, y: y / sf };
}

const tell = (w, e) => {
  if (w && !w.isDestroyed()) void w.webContents.executeJavaScript(`window.agent && agent(${JSON.stringify(e)})`).catch(() => {});
};

const inside = (p, d) => p.x >= d.bounds.x && p.y >= d.bounds.y && p.x < d.bounds.x + d.bounds.width && p.y < d.bounds.y + d.bounds.height;

/** How far behind the real pointer anything drawn in a window shows (the page, then the system's compositor), in ms. */
const DRAWN_LATE_MS = 30;

/**
 * While the driver glides (or drags) the real pointer, this one follows it, read about every frame: the message that
 * says it moves comes a little after the driver starts (and on a Mac osascript starts a little after that), so a glide
 * of its own would trail or lead it. As it shows a few frames after it is drawn, it goes where the real one is heading
 * by then (never past the place). Then it rests on the place.
 */
function follow(w, d, target, ms) {
  clearTimeout(following);
  const end = Date.now() + ms;
  const local = (p) => ({ act: 'move', x: Math.round(p.x - d.bounds.x), y: Math.round(p.y - d.bounds.y) });
  let last = null;
  const tick = () => {
    following = null;
    if (!on || w.isDestroyed()) return;
    const now = Date.now();
    if (now >= end) return tell(w, local(target));
    const c = screen.getCursorScreenPoint();
    let p = c;
    if (last && now > last.t) {
      const k = DRAWN_LATE_MS / (now - last.t);
      const ahead = { x: c.x + (c.x - last.x) * k, y: c.y + (c.y - last.y) * k };
      // Never past the place it is going to.
      p = Math.hypot(ahead.x - c.x, ahead.y - c.y) < Math.hypot(target.x - c.x, target.y - c.y) ? ahead : target;
    }
    last = { x: c.x, y: c.y, t: now };
    if (inside(p, d)) tell(w, local(p));
    following = setTimeout(tick, 16);
  };
  tick();
}

/** One step of the timeline: the pointer to its place on the display there, over the real one as it gets there. */
function pointerStep(s) {
  if (!on) return;
  clearTimeout(following);
  const placed = Number.isFinite(s.x) && Number.isFinite(s.y);
  const target = placed ? toDip(s.x, s.y) : (lastAt ?? screen.getCursorScreenPoint());
  const d = screen.getDisplayNearestPoint({ x: Math.round(target.x), y: Math.round(target.y) });
  const w = windows.get(d.id);
  if (!w || w.isDestroyed()) return;
  if (pointerIn !== null && pointerIn !== d.id) tell(windows.get(pointerIn), { hide: true });
  pointerIn = d.id;
  const local = (p) => ({ x: Math.round(p.x - d.bounds.x), y: Math.round(p.y - d.bounds.y) });
  lastAt = target;
  const ms = Math.max(0, Math.min(2000, Number(s.ms) || 0));
  if (s.act === 'move') {
    const cur = screen.getCursorScreenPoint();
    tell(w, { act: 'move', ...local(inside(cur, d) ? cur : target) });
    return follow(w, d, target, ms + 250);
  }
  const e = { act: String(s.act || 'click'), ...local(target) };
  if (s.act === 'drag') e.ms = ms;
  if (s.dir) e.dir = String(s.dir);
  if (s.text) e.text = String(s.text).slice(0, 200);
  if (s.keys) e.keys = String(s.keys).slice(0, 80);
  tell(w, e);
  if (s.act === 'drag') follow(w, d, target, ms + 250);
}

/** The server's timeline of what the driver does now ({ steps: [{ at, act, x?, y?, ms?, dir?, text?, keys? }] }), played out. */
function pointer(m) {
  if (!on || !Array.isArray(m.steps)) return;
  for (const s of m.steps.slice(0, 60)) {
    if (!s || typeof s !== 'object') continue;
    const t = setTimeout(() => {
      timers.delete(t);
      pointerStep(s);
    }, Math.max(0, Math.min(60_000, Number(s.at) || 0)));
    timers.add(t);
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

module.exports = { setGlow, veil, unveil, capture, pointer, glowing: () => on };
