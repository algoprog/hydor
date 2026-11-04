// The Mac's side of computer use: one JavaScript for Automation script, run as
//   osascript -l JavaScript -e DRIVER '<steps as JSON>'
// which posts mouse and keyboard events through CoreGraphics (CGEvent, the ObjC bridge; event types and flags as
// numbers, since not all of them are bridged) and reads where things are. No native module and no build step: macOS
// has osascript. The events count as Hydor's, the app the server runs in, so its Accessibility permission
// is the one that matters.
//
// Typing text puts each character on a key event as Unicode (CGEventKeyboardSetUnicodeString), which types it whatever
// the keyboard layout (Greek, Chinese input, emoji). How to hand the bridge a UniChar array is not documented, so the
// script finds a way that works once per run: it sets a character no key types (☃) and reads it back from the event
// (NSEvent's characters); failing all ways, it pastes the text and puts the clipboard back. Shortcuts (cmd+c) press keys
// by their US-keyboard codes, as macOS matches shortcuts on most layouts. Steps are those of plan.ts (Op).
export const DRIVER = String.raw`
ObjC.import('CoreGraphics');
ObjC.import('AppKit');

var CMD = 0x100000, SHIFT = 0x20000, ALT = 0x80000, CTRL = 0x40000, FN = 0x800000;
var FLAG = { 55: CMD, 54: CMD, 56: SHIFT, 60: SHIFT, 58: ALT, 61: ALT, 59: CTRL, 62: CTRL, 63: FN };
// Mouse events by button (left, right, other): down, up, dragged.
var BUTTONS = [{ down: 1, up: 2, drag: 6 }, { down: 3, up: 4, drag: 7 }, { down: 25, up: 26, drag: 27 }];
var MOVED = 5, HID_TAP = 0, CLICK_STATE = 1, PIXEL = 0;

function post(e) { $.CGEventPost(HID_TAP, e); }
function here() { var l = $.CGEventGetLocation($.CGEventCreate(null)); return { x: l.x, y: l.y }; }
function given(o) { return o.x !== undefined && o.x !== null; }
function where(o) { return given(o) ? { x: o.x, y: o.y } : here(); }

function mouse(type, p, button, flags, clicks) {
  var e = $.CGEventCreateMouseEvent(null, type, $.CGPointMake(p.x, p.y), button);
  if (clicks) $.CGEventSetIntegerValueField(e, CLICK_STATE, clicks);
  $.CGEventSetFlags(e, flags || 0);
  post(e);
}
function key(code, down, flags) {
  var e = $.CGEventCreateKeyboardEvent(null, code, down);
  $.CGEventSetFlags(e, flags || 0);
  post(e);
}
function press(mods) {
  var f = 0;
  for (var i = 0; i < mods.length; i++) { f |= FLAG[mods[i]] || 0; key(mods[i], true, f); delay(0.01); }
  return f;
}
function lift(mods, f) {
  for (var i = mods.length - 1; i >= 0; i--) { f &= ~(FLAG[mods[i]] || 0); key(mods[i], false, f); delay(0.01); }
}
function moveTo(p) { mouse(MOVED, p, 0, 0, 0); delay(0.05); }

function click(o) {
  var p = where(o), b = BUTTONS[o.button] || BUTTONS[0];
  if (given(o)) moveTo(p);
  var f = press(o.mods || []) | (o.flags || 0);
  for (var n = 1; n <= o.count; n++) {
    mouse(b.down, p, o.button, f, n);
    delay(0.02);
    mouse(b.up, p, o.button, f, n);
    if (n < o.count) delay(0.06);
  }
  lift(o.mods || [], f);
}
function drag(o) {
  var a = { x: o.x1, y: o.y1 }, b = { x: o.x2, y: o.y2 }, steps = 12;
  moveTo(a);
  mouse(1, a, 0, 0, 1);
  delay(0.08);
  for (var i = 1; i <= steps; i++) {
    mouse(6, { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }, 0, 0, 1);
    delay(0.016);
  }
  delay(0.05);
  mouse(2, b, 0, 0, 1);
}
function down(o) { var p = where(o); if (given(o)) moveTo(p); mouse(1, p, 0, 0, 1); }
function up(o) { var p = where(o); if (given(o)) { mouse(6, p, 0, 0, 1); delay(0.03); } mouse(2, p, 0, 0, 1); }

function bridged(name) { try { return typeof $[name] === 'function'; } catch (x) { return false; } }
function scroll(o) {
  if (given(o)) moveTo({ x: o.x, y: o.y });
  for (var i = 0; i < o.n; i++) {
    var e;
    if (o.dx && bridged('CGEventCreateScrollWheelEvent2')) e = $.CGEventCreateScrollWheelEvent2(null, PIXEL, 2, o.dy, o.dx, 0);
    else {
      // One wheel only (its other wheels are C variadic arguments the bridge cannot pass): the second set by its fields.
      e = $.CGEventCreateScrollWheelEvent(null, PIXEL, 1, o.dy);
      if (o.dx) {
        $.CGEventSetIntegerValueField(e, 12, o.dx > 0 ? 1 : -1);
        $.CGEventSetIntegerValueField(e, 97, o.dx);
        $.CGEventSetDoubleValueField(e, 94, o.dx / 10);
      }
    }
    $.CGEventSetFlags(e, 0);
    post(e);
    delay(0.03);
  }
}
function stroke(o) {
  var f = press(o.mods || []);
  key(o.code, true, o.flags);
  delay(0.02);
  key(o.code, false, o.flags);
  lift(o.mods || [], f);
}
function hold(o) {
  var f = press(o.mods || []);
  key(o.code, true, o.flags);
  delay(o.ms / 1000);
  key(o.code, false, o.flags);
  lift(o.mods || [], f);
}

// ---- text ----
var way = null;
function units(s) { var u = []; for (var i = 0; i < s.length; i++) u.push(s.charCodeAt(i)); return u; }
function charsOf(e) { try { return ObjC.unwrap($.NSEvent.eventWithCGEvent(e).characters); } catch (x) { return null; } }
function textEvent(s, isDown, w) {
  try {
    if (w === 'nsevent') {
      return $.NSEvent.keyEventWithTypeLocationModifierFlagsTimestampWindowNumberContextCharactersCharactersIgnoringModifiersIsARepeatKeyCode(isDown ? 10 : 11, $.NSMakePoint(0, 0), 0, 0, 0, null, s, s, false, 0).CGEvent;
    }
    var e = $.CGEventCreateKeyboardEvent(null, 0, isDown);
    $.CGEventKeyboardSetUnicodeString(e, s.length, w === 'array' ? units(s) : s);
    $.CGEventSetFlags(e, 0);
    return e;
  } catch (x) {
    return null;
  }
}
function findWay() {
  var probe = '☃', ways = ['array', 'string', 'nsevent'];
  for (var i = 0; i < ways.length; i++) {
    var e = textEvent(probe, true, ways[i]);
    if (e && charsOf(e) === probe) return ways[i];
  }
  return 'paste';
}
function tap(code) { key(code, true, 0); key(code, false, 0); }
function paste(text) {
  var pb = $.NSPasteboard.generalPasteboard, saved = [], items = pb.pasteboardItems;
  for (var i = 0; items && i < items.count; i++) {
    var it = items.objectAtIndex(i), types = it.types, keep = [];
    for (var j = 0; j < types.count; j++) { var t = types.objectAtIndex(j), d = it.dataForType(t); if (d) keep.push([t, d]); }
    saved.push(keep);
  }
  pb.clearContents;
  pb.setStringForType($(text), $('public.utf8-plain-text'));
  key(55, true, CMD); key(9, true, CMD); key(9, false, CMD); key(55, false, 0);
  delay(0.6);
  pb.clearContents;
  if (saved.length) {
    var all = $.NSMutableArray.array;
    for (var k = 0; k < saved.length; k++) {
      var item = $.NSPasteboardItem.alloc.init;
      for (var m = 0; m < saved[k].length; m++) item.setDataForType(saved[k][m][1], saved[k][m][0]);
      all.addObject(item);
    }
    pb.writeObjects(all);
  }
}
function type(text) {
  if (!way) way = findWay();
  if (way === 'paste') { paste(text); return 'paste'; }
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i), code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) { c = text.substr(i, 2); i++; }
    if (c === '\r') continue;
    if (c === '\n') { tap(36); delay(0.01); continue; }
    if (c === '\t') { tap(48); delay(0.01); continue; }
    var d = textEvent(c, true, way), u = textEvent(c, false, way);
    if (!d || !u) { paste(c); continue; }
    post(d);
    post(u);
    delay(0.006);
  }
  return way;
}

// ---- where things are ----
function info() {
  var out = { pos: here() };
  try {
    var b = $.CGDisplayBounds($.CGMainDisplayID());
    out.display = { x: b.origin.x, y: b.origin.y, w: b.size.width, h: b.size.height };
  } catch (x) {}
  if (!out.display || !(out.display.w > 0)) {
    try { var f = $.NSScreen.screens.objectAtIndex(0).frame; out.display = { x: 0, y: 0, w: f.size.width, h: f.size.height }; } catch (x) {}
  }
  try { out.displays = $.NSScreen.screens.count; } catch (x) {}
  try { out.app = ObjC.unwrap($.NSWorkspace.sharedWorkspace.frontmostApplication.localizedName); } catch (x) {}
  return out;
}
// After a stop: no button or modifier left held down.
function release() {
  mouse(2, here(), 0, 0, 1);
  var mods = [55, 56, 58, 59, 63];
  for (var i = 0; i < mods.length; i++) key(mods[i], false, 0);
}

function run(argv) {
  var ops = JSON.parse(argv[0]), out = { done: 0, positions: [] };
  for (var i = 0; i < ops.length; i++) {
    var o = ops[i];
    switch (o.op) {
      case 'move': moveTo(o); break;
      case 'click': click(o); break;
      case 'drag': drag(o); break;
      case 'down': down(o); break;
      case 'up': up(o); break;
      case 'scroll': scroll(o); break;
      case 'type': out.typed = type(o.text); break;
      case 'key': stroke(o); break;
      case 'hold': hold(o); break;
      case 'sleep': delay(o.ms / 1000); break;
      case 'pos': out.positions.push(here()); break;
      case 'info': out.info = info(); break;
      case 'release': release(); break;
      default: throw new Error('unknown step: ' + o.op);
    }
    out.done = i + 1;
  }
  return JSON.stringify(out);
}
`;

/** What the driver answers. */
export interface DriverOut {
  done: number;
  positions: { x: number; y: number }[];
  /** How text was typed: on key events (array, string, nsevent) or pasted. */
  typed?: string;
  info?: { pos?: { x: number; y: number }; display?: { x: number; y: number; w: number; h: number }; displays?: number; app?: string; window?: string };
}
