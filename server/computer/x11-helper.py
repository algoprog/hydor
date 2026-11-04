# Computer use on Linux with X11 (server/computer/linux.ts runs it): uses the mouse and keyboard through the X server's
# XTest extension, with nothing but Python's own ctypes and the X libraries every X11 desktop has (libX11, libXtst;
# libXrandr for the displays). It stays running and reads one request per line on stdin, {"id":1,"ops":[...]}, and
# answers each on stdout, {"id":1,"ok":true,"out":{...}}; first it says {"ready":true,...} with what it found.
# The steps are those of plan.ts (Op), in the X server's pixels; keys come as keysyms, found on the keyboard as it is
# laid out. A character no key types (another script, an emoji) borrows a spare key for a moment, as xdotool does.
# The screen itself is captured by the desktop app (it hides its glow first), not here.
import ctypes
import json
import os
import sys
import time
from ctypes import CFUNCTYPE, POINTER, Structure, byref, c_char_p, c_int, c_long, c_ubyte, c_uint, c_ulong, c_void_p


def say(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def die(message):
    sys.stderr.write(message + "\n")
    sys.stderr.flush()
    sys.exit(3)


def load(*names):
    for name in names:
        try:
            return ctypes.CDLL(name)
        except OSError:
            pass
    return None


X = load("libX11.so.6", "libX11.so")
if not X:
    die("The X11 library (libX11) is not on this computer: install libx11-6 (Debian, Ubuntu) or libX11 (Fedora)")
XT = load("libXtst.so.6", "libXtst.so")
if not XT:
    die("The X11 XTest library (libXtst) is not on this computer: install libxtst6 (Debian, Ubuntu) or libXtst (Fedora)")
XR = load("libXrandr.so.2", "libXrandr.so")

V = c_void_p
X.XOpenDisplay.restype = V
X.XOpenDisplay.argtypes = [c_char_p]
X.XDefaultRootWindow.restype = c_ulong
X.XDefaultRootWindow.argtypes = [V]
X.XDefaultScreen.restype = c_int
X.XDefaultScreen.argtypes = [V]
X.XDisplayWidth.restype = c_int
X.XDisplayWidth.argtypes = [V, c_int]
X.XDisplayHeight.restype = c_int
X.XDisplayHeight.argtypes = [V, c_int]
X.XQueryPointer.restype = c_int
X.XQueryPointer.argtypes = [V, c_ulong, POINTER(c_ulong), POINTER(c_ulong), POINTER(c_int), POINTER(c_int), POINTER(c_int), POINTER(c_int), POINTER(c_uint)]
X.XKeysymToKeycode.restype = c_ubyte
X.XKeysymToKeycode.argtypes = [V, c_ulong]
X.XGetKeyboardMapping.restype = POINTER(c_ulong)
X.XGetKeyboardMapping.argtypes = [V, c_ubyte, c_int, POINTER(c_int)]
X.XChangeKeyboardMapping.restype = c_int
X.XChangeKeyboardMapping.argtypes = [V, c_int, c_int, POINTER(c_ulong), c_int]
X.XDisplayKeycodes.restype = c_int
X.XDisplayKeycodes.argtypes = [V, POINTER(c_int), POINTER(c_int)]
X.XFree.restype = c_int
X.XFree.argtypes = [V]
X.XSync.restype = c_int
X.XSync.argtypes = [V, c_int]
X.XFlush.restype = c_int
X.XFlush.argtypes = [V]
X.XInternAtom.restype = c_ulong
X.XInternAtom.argtypes = [V, c_char_p, c_int]
X.XGetSelectionOwner.restype = c_ulong
X.XGetSelectionOwner.argtypes = [V, c_ulong]
X.XGetWindowProperty.restype = c_int
X.XGetWindowProperty.argtypes = [V, c_ulong, c_ulong, c_long, c_long, c_int, c_ulong, POINTER(c_ulong), POINTER(c_int), POINTER(c_ulong), POINTER(c_ulong), POINTER(POINTER(c_ubyte))]
ERROR_HANDLER = CFUNCTYPE(c_int, V, V)
X.XSetErrorHandler.restype = V
X.XSetErrorHandler.argtypes = [ERROR_HANDLER]
XT.XTestQueryExtension.restype = c_int
XT.XTestQueryExtension.argtypes = [V, POINTER(c_int), POINTER(c_int), POINTER(c_int), POINTER(c_int)]
XT.XTestFakeMotionEvent.restype = c_int
XT.XTestFakeMotionEvent.argtypes = [V, c_int, c_int, c_int, c_ulong]
XT.XTestFakeButtonEvent.restype = c_int
XT.XTestFakeButtonEvent.argtypes = [V, c_uint, c_int, c_ulong]
XT.XTestFakeKeyEvent.restype = c_int
XT.XTestFakeKeyEvent.argtypes = [V, c_uint, c_int, c_ulong]


class MonitorInfo(Structure):
    _fields_ = [
        ("name", c_ulong), ("primary", c_int), ("automatic", c_int), ("noutput", c_int), ("x", c_int), ("y", c_int),
        ("width", c_int), ("height", c_int), ("mwidth", c_int), ("mheight", c_int), ("outputs", POINTER(c_ulong)),
    ]


RANDR = bool(XR) and hasattr(XR, "XRRGetMonitors")
if RANDR:
    XR.XRRGetMonitors.restype = POINTER(MonitorInfo)
    XR.XRRGetMonitors.argtypes = [V, c_ulong, c_int, POINTER(c_int)]
    XR.XRRFreeMonitors.restype = None
    XR.XRRFreeMonitors.argtypes = [POINTER(MonitorInfo)]


# A window that went away between asking and reading (the active one, say) is an X error: ignored, not fatal.
@ERROR_HANDLER
def ignore_error(_display, _event):
    return 0


X.XSetErrorHandler(ignore_error)

dpy = X.XOpenDisplay(None)
if not dpy:
    die("Could not open the X display %s" % (os.environ.get("DISPLAY") or "(DISPLAY is not set)"))
root = X.XDefaultRootWindow(dpy)
screen = X.XDefaultScreen(dpy)
_ints = [c_int() for _ in range(4)]
if not XT.XTestQueryExtension(dpy, *[byref(i) for i in _ints]):
    die("This X server has no XTest extension, which computer use needs")
MIN_KEYCODE, MAX_KEYCODE = c_int(), c_int()
X.XDisplayKeycodes(dpy, byref(MIN_KEYCODE), byref(MAX_KEYCODE))
MIN_KEYCODE, MAX_KEYCODE = MIN_KEYCODE.value, MAX_KEYCODE.value

SHIFT, CONTROL, ALT, SUPER = 0xFFE1, 0xFFE3, 0xFFE9, 0xFFEB
LOCK_MASK = 1 << 1
# Mouse buttons by the steps' numbers (left, right, middle); the wheel's are 4 up, 5 down, 6 left, 7 right.
BUTTONS = [1, 3, 2]


def atom(name):
    return X.XInternAtom(dpy, name.encode(), 0)


def flush():
    X.XFlush(dpy)


# ---- where things are -------------------------------------------------------------------------------------------


def query_pointer():
    r, child = c_ulong(), c_ulong()
    rx, ry, wx, wy = c_int(), c_int(), c_int(), c_int()
    mask = c_uint()
    X.XQueryPointer(dpy, root, byref(r), byref(child), byref(rx), byref(ry), byref(wx), byref(wy), byref(mask))
    return rx.value, ry.value, mask.value


def pointer():
    x, y, _ = query_pointer()
    return {"x": x, "y": y}


def window_property(window, name):
    kind, fmt, count, after = c_ulong(), c_int(), c_ulong(), c_ulong()
    data = POINTER(c_ubyte)()
    status = X.XGetWindowProperty(dpy, window, atom(name), 0, 1 << 16, 0, 0, byref(kind), byref(fmt), byref(count), byref(after), byref(data))
    if status != 0 or not data:
        return None
    try:
        if fmt.value == 32:
            longs = ctypes.cast(data, POINTER(c_ulong))
            return [longs[i] for i in range(count.value)]
        return ctypes.string_at(data, count.value * (fmt.value // 8))
    finally:
        X.XFree(data)


def front():
    """The app in front (its WM_CLASS, else its program) and its window's title."""
    active = window_property(root, "_NET_ACTIVE_WINDOW")
    if not active or not active[0]:
        return None, None
    window = active[0]
    title = window_property(window, "_NET_WM_NAME") or window_property(window, "WM_NAME")
    app = None
    klass = window_property(window, "WM_CLASS")
    if isinstance(klass, bytes):
        parts = [p for p in klass.split(b"\0") if p]
        if parts:
            app = parts[-1].decode("utf-8", "replace")
    if not app:
        pid = window_property(window, "_NET_WM_PID")
        if pid and pid[0]:
            try:
                with open("/proc/%d/comm" % pid[0]) as f:
                    app = f.read().strip()
            except OSError:
                pass
    return app, (title.decode("utf-8", "replace") if isinstance(title, bytes) else None)


def monitors():
    found = []
    if RANDR:
        n = c_int()
        m = XR.XRRGetMonitors(dpy, root, 1, byref(n))
        if m:
            try:
                for i in range(n.value):
                    found.append({"x": m[i].x, "y": m[i].y, "w": m[i].width, "h": m[i].height, "primary": bool(m[i].primary)})
            finally:
                XR.XRRFreeMonitors(m)
    if not found:
        found = [{"x": 0, "y": 0, "w": X.XDisplayWidth(dpy, screen), "h": X.XDisplayHeight(dpy, screen), "primary": True}]
    return found


def info():
    x, y, _ = query_pointer()
    shown = monitors()
    main = next((m for m in shown if m["primary"]), None) or next((m for m in shown if m["x"] == 0 and m["y"] == 0), shown[0])
    out = {"pos": {"x": x, "y": y}, "display": {k: main[k] for k in ("x", "y", "w", "h")}, "displays": len(shown)}
    app, title = front()
    if app:
        out["app"] = app
    if title:
        out["window"] = title
    return out


def compositor():
    """Whether a compositing manager runs: without one, a see-through window shows black, so the app shows no glow."""
    return X.XGetSelectionOwner(dpy, atom("_NET_WM_CM_S%d" % screen)) != 0


# ---- the mouse --------------------------------------------------------------------------------------------------


def given(o):
    return o.get("x") is not None and o.get("y") is not None


def motion(x, y):
    XT.XTestFakeMotionEvent(dpy, -1, int(round(x)), int(round(y)), 0)
    flush()


def move_to(x, y):
    motion(x, y)
    time.sleep(0.05)


def button(b, down):
    XT.XTestFakeButtonEvent(dpy, b, 1 if down else 0, 0)
    flush()


def click(o):
    if given(o):
        move_to(o["x"], o["y"])
    held = press_mods(o.get("mods") or [])
    b = BUTTONS[int(o.get("button") or 0)]
    count = max(1, int(o.get("count") or 1))
    for n in range(count):
        button(b, True)
        time.sleep(0.02)
        button(b, False)
        if n < count - 1:
            time.sleep(0.06)
    lift(held)


def drag(o):
    x1, y1, x2, y2 = o["x1"], o["y1"], o["x2"], o["y2"]
    move_to(x1, y1)
    button(1, True)
    time.sleep(0.08)
    for i in range(1, 13):
        motion(x1 + (x2 - x1) * i / 12.0, y1 + (y2 - y1) * i / 12.0)
        time.sleep(0.016)
    time.sleep(0.05)
    button(1, False)


def down(o):
    if given(o):
        move_to(o["x"], o["y"])
    button(1, True)


def up(o):
    if given(o):
        motion(o["x"], o["y"])
        time.sleep(0.03)
    button(1, False)


def scroll(o):
    if given(o):
        move_to(o["x"], o["y"])
    dy, dx = o.get("dy") or 0, o.get("dx") or 0
    b = 4 if dy > 0 else 5 if dy < 0 else 6 if dx > 0 else 7 if dx < 0 else 0
    for _ in range(int(o.get("n") or 1) if b else 0):
        button(b, True)
        button(b, False)
        time.sleep(0.03)


# ---- the keyboard -----------------------------------------------------------------------------------------------


def mapping():
    """The keyboard as laid out now: each keycode's keysyms, and how many each has."""
    per = c_int()
    count = MAX_KEYCODE - MIN_KEYCODE + 1
    p = X.XGetKeyboardMapping(dpy, MIN_KEYCODE, count, byref(per))
    if not p:
        return [], 1
    try:
        return [[p[i * per.value + j] for j in range(per.value)] for i in range(count)], per.value
    finally:
        X.XFree(p)


def find(rows, keysym):
    """The key that types a keysym as the keyboard is laid out, and whether it takes shift; (0, False) when none does."""
    for i, row in enumerate(rows):
        if row and row[0] == keysym:
            return MIN_KEYCODE + i, False
    for i, row in enumerate(rows):
        if len(row) > 1 and row[1] == keysym:
            return MIN_KEYCODE + i, True
    return 0, False


def spares(rows):
    """Keys with nothing on them, to lend to a character the keyboard has no key for."""
    return [MIN_KEYCODE + i for i, row in enumerate(rows) if not any(row)][-12:]


def bind(keycode, keysym, per):
    X.XChangeKeyboardMapping(dpy, keycode, per, (c_ulong * per)(*([keysym] * per)), 1)
    X.XSync(dpy, 0)


def key(keycode, down):
    XT.XTestFakeKeyEvent(dpy, keycode, 1 if down else 0, 0)
    flush()


def press_mods(keysyms):
    held = []
    for ks in keysyms:
        kc = X.XKeysymToKeycode(dpy, int(ks))
        if kc:
            key(kc, True)
            held.append(kc)
            time.sleep(0.01)
    return held


def lift(held):
    for kc in reversed(held):
        key(kc, False)
        time.sleep(0.01)


class Lender:
    """Lends spare keys to keysyms the keyboard has no key for, and gives them back at the end."""

    def __init__(self, rows, per):
        self.free = spares(rows)
        self.per = per
        self.lent = {}
        self.touched = set()

    def key_for(self, keysym):
        if keysym in self.lent:
            return self.lent[keysym]
        if not self.free:
            if not self.lent:
                raise Exception("this keyboard has no spare key to type that with")
            # All lent: let the apps take in what was typed, then lend them again.
            time.sleep(0.05)
            self.free = list(self.lent.values())
            self.lent = {}
        kc = self.free.pop()
        bind(kc, keysym, self.per)
        self.lent[keysym] = kc
        self.touched.add(kc)
        # The apps hear of the new layout before the key comes.
        time.sleep(0.02)
        return kc

    def give_back(self):
        if not self.touched:
            return
        X.XSync(dpy, 0)
        time.sleep(0.1)
        for kc in self.touched:
            X.XChangeKeyboardMapping(dpy, kc, self.per, (c_ulong * self.per)(), 1)
        X.XSync(dpy, 0)


def keysym_of(ch):
    cp = ord(ch)
    if ch == "\n":
        return 0xFF0D
    if ch == "\t":
        return 0xFF09
    if 0x20 <= cp <= 0x7E or 0xA0 <= cp <= 0xFF:
        return cp
    return 0x01000000 | cp


def type_text(text):
    rows, per = mapping()
    lender = Lender(rows, per)
    shift_key = X.XKeysymToKeycode(dpy, SHIFT)
    caps = bool(query_pointer()[2] & LOCK_MASK)
    try:
        for ch in text:
            if ch == "\r":
                continue
            ks = keysym_of(ch)
            kc, shifted = find(rows, ks)
            if kc:
                # Caps Lock turns a letter's case round: shift turns it back.
                if caps and ch.lower() != ch.upper():
                    shifted = not shifted
                if shifted and shift_key:
                    key(shift_key, True)
                key(kc, True)
                key(kc, False)
                if shifted and shift_key:
                    key(shift_key, False)
                time.sleep(0.006)
            else:
                kc = lender.key_for(ks)
                key(kc, True)
                key(kc, False)
                time.sleep(0.012)
    finally:
        lender.give_back()


def stroke(o, hold_ms=0):
    rows, per = mapping()
    keysym = int(o["code"])
    kc, shifted = find(rows, keysym)
    lender = Lender(rows, per)
    try:
        if not kc:
            kc, shifted = lender.key_for(keysym), False
        mods = [int(m) for m in (o.get("mods") or [])]
        if shifted and SHIFT not in mods:
            mods.append(SHIFT)
        held = press_mods(mods)
        key(kc, True)
        time.sleep(hold_ms / 1000.0 if hold_ms else 0.02)
        key(kc, False)
        lift(held)
    finally:
        lender.give_back()


def release():
    """After a stop: no button or modifier left held down."""
    for b in (1, 2, 3):
        XT.XTestFakeButtonEvent(dpy, b, 0, 0)
    for ks in (SHIFT, 0xFFE2, CONTROL, 0xFFE4, ALT, 0xFFEA, SUPER, 0xFFEC, 0xFE03):
        kc = X.XKeysymToKeycode(dpy, ks)
        if kc:
            XT.XTestFakeKeyEvent(dpy, kc, 0, 0)
    flush()


# ---- the requests -----------------------------------------------------------------------------------------------


def run(ops):
    out = {"done": 0, "positions": []}
    for o in ops:
        op = o.get("op")
        if op == "move":
            move_to(o["x"], o["y"])
        elif op == "click":
            click(o)
        elif op == "drag":
            drag(o)
        elif op == "down":
            down(o)
        elif op == "up":
            up(o)
        elif op == "scroll":
            scroll(o)
        elif op == "type":
            type_text(o.get("text") or "")
            out["typed"] = "keys"
        elif op == "key":
            stroke(o)
        elif op == "hold":
            stroke(o, int(o.get("ms") or 0))
        elif op == "sleep":
            time.sleep(int(o.get("ms") or 0) / 1000.0)
        elif op == "pos":
            out["positions"].append(pointer())
        elif op == "info":
            out["info"] = info()
        elif op == "release":
            release()
        else:
            raise Exception("unknown step: %s" % op)
        out["done"] += 1
    X.XSync(dpy, 0)
    return out


say({"ready": True, "compositor": compositor(), "displays": len(monitors())})
while True:
    line = sys.stdin.readline()
    if not line:
        break
    line = line.strip()
    if not line:
        continue
    try:
        request = json.loads(line)
    except ValueError:
        continue
    rid = request.get("id")
    try:
        say({"id": rid, "ok": True, "out": run(request.get("ops") or [])})
    except Exception as e:  # noqa: BLE001 - whatever went wrong goes back to the agent in words
        say({"id": rid, "ok": False, "error": str(e) or e.__class__.__name__})
