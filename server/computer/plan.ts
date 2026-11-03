// What computer use does, worked out before anything touches the Mac: the agent's actions checked and turned into
// the small steps the Mac's driver posts (driver.ts), points on the screen from the screenshot's pixels, keys by
// their macOS key codes, what each action did in words, and the sizes of pictures. Nothing here runs a program, so
// the tests run it on any computer.
//
// Coordinates: the agent sees the main display scaled down to MAX_SIDE pixels on its longer side, and names pixels of
// that picture. macOS posts events in points (a Retina display has two pixels to a point, and a scaled resolution
// other ratios), so a pixel maps to a point by the display's size in points over the picture's size in pixels.

/** The longer side of a screenshot, in pixels: what models read well (the screen is scaled down to it, never up). */
export const MAX_SIDE = 1280;
/** At most this many actions in one call. */
export const MAX_STEPS = 10;
/** At most this many characters typed in one action. */
export const MAX_TEXT = 4000;
/** How far one notch of scrolling goes, in points. */
export const NOTCH = 50;
/** The longest wait or key hold, in seconds. */
export const MAX_SECONDS = 10;

export type Point = [number, number];

/** The screenshot the agent's coordinates are in, and the display it shows. */
export interface Geometry {
  /** The picture's size in pixels. */
  width: number;
  height: number;
  /** The main display in points, in macOS's global coordinates (its top left is 0,0). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A picture's size scaled down to fit `max` on its longer side (never up). */
export function fitSize(w: number, h: number, max = MAX_SIDE): { width: number; height: number } {
  const s = Math.min(1, max / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A pixel of the screenshot on the screen, in points (inside the display). */
export function toScreen(p: Point, g: Geometry): { x: number; y: number } {
  const x = g.x + (p[0] * g.w) / g.width;
  const y = g.y + (p[1] * g.h) / g.height;
  return { x: round2(Math.min(Math.max(x, g.x), g.x + g.w - 1)), y: round2(Math.min(Math.max(y, g.y), g.y + g.h - 1)) };
}

/** A point of the screen as a pixel of the screenshot, or null when it is not on the display the screenshot shows. */
export function toPicture(pt: { x: number; y: number }, g: Geometry): Point | null {
  if (pt.x < g.x || pt.y < g.y || pt.x >= g.x + g.w || pt.y >= g.y + g.h) return null;
  return [Math.min(g.width - 1, Math.floor(((pt.x - g.x) * g.width) / g.w)), Math.min(g.height - 1, Math.floor(((pt.y - g.y) * g.height) / g.h))];
}

// ---- keys ---------------------------------------------------------------------------------------------------

/** The modifier keys' flags (CGEventFlags) and key codes. */
export const FLAGS = { cmd: 0x100000, shift: 0x20000, alt: 0x80000, ctrl: 0x40000, fn: 0x800000 } as const;
type Mod = keyof typeof FLAGS;
const MOD_CODE: Record<Mod, number> = { cmd: 55, shift: 56, alt: 58, ctrl: 59, fn: 63 };
/** The order a person presses them in. */
const MOD_ORDER: Mod[] = ['ctrl', 'alt', 'shift', 'cmd', 'fn'];

/** Names for the modifiers: macOS's, Linux's and Windows' (agents trained elsewhere say super or meta), and symbols. */
const MOD_NAMES: Record<string, Mod> = {
  cmd: 'cmd', command: 'cmd', super: 'cmd', meta: 'cmd', win: 'cmd', windows: 'cmd', '⌘': 'cmd',
  shift: 'shift', '⇧': 'shift',
  alt: 'alt', option: 'alt', opt: 'alt', '⌥': 'alt',
  ctrl: 'ctrl', control: 'ctrl', '⌃': 'ctrl',
  fn: 'fn', function: 'fn',
};

/** Keys that type no character: macOS's virtual key codes (the same on every keyboard layout). */
const NAMED: Record<string, number> = {
  return: 36, enter: 36, kpenter: 76, tab: 48, space: 49, spacebar: 49,
  // The Mac's delete key erases before the cursor; forward delete after it.
  delete: 51, backspace: 51, forwarddelete: 117, del: 117,
  escape: 53, esc: 53,
  left: 123, right: 124, down: 125, up: 126, arrowleft: 123, arrowright: 124, arrowdown: 125, arrowup: 126,
  home: 115, end: 119, pageup: 116, prior: 116, pagedown: 121, next: 121, help: 114, insert: 114,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
  f13: 105, f14: 107, f15: 113, f16: 106, f17: 64, f18: 79, f19: 80, f20: 90,
  capslock: 57, volumeup: 72, volumedown: 73, mute: 74,
};

/** Characters by their key on a US keyboard (ANSI key codes): for shortcuts like cmd+c. */
const CHAR_CODE: Record<string, number> = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
  '1': 18, '2': 19, '3': 20, '4': 21, '6': 22, '5': 23, '=': 24, '9': 25, '7': 26, '-': 27, '8': 28, '0': 29,
  ']': 30, o: 31, u: 32, '[': 33, i: 34, p: 35, l: 37, j: 38, "'": 39, k: 40, ';': 41, '\\': 42, ',': 43, '/': 44,
  n: 45, m: 46, '.': 47, '`': 50, ' ': 49,
};
/** Characters typed with shift on a US keyboard, and the key under them. */
const SHIFTED: Record<string, string> = {
  '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  _: '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
};
const UNSHIFTED = Object.fromEntries(Object.entries(SHIFTED).map(([k, v]) => [v, k]));
/** Names of punctuation keys (xdotool's among them). */
const CHAR_NAMES: Record<string, string> = {
  minus: '-', hyphen: '-', plus: '+', equal: '=', equals: '=', comma: ',', period: '.', dot: '.', slash: '/', backslash: '\\',
  semicolon: ';', colon: ':', apostrophe: "'", quote: "'", quotedbl: '"', grave: '`', backtick: '`', bracketleft: '[',
  bracketright: ']', braceleft: '{', braceright: '}', parenleft: '(', parenright: ')', question: '?', exclam: '!', at: '@',
  numbersign: '#', hash: '#', dollar: '$', percent: '%', asciicircum: '^', ampersand: '&', asterisk: '*', underscore: '_',
  less: '<', greater: '>', bar: '|', asciitilde: '~', tilde: '~',
};

/** One key press: a key by its code with modifiers held, or a character typed as it is (whatever the keyboard layout). */
export interface Stroke {
  code?: number;
  char?: string;
  /** Modifier keys held, as key codes, in the order they are pressed. */
  mods: number[];
  flags: number;
}

/** A name as the tables write it: small letters, no spaces, dashes or underscores, no left/right side. */
const plain = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
const modOf = (s: string): Mod | undefined => MOD_NAMES[s] ?? MOD_NAMES[plain(s)] ?? MOD_NAMES[plain(s).replace(/(l|r|left|right)$/, '')];

/** One combination ("cmd+shift+t", "return", "a"): its stroke, or what is wrong with it. */
function parseCombo(c: string): Stroke | string {
  let tokens: string[];
  if (c === '+') tokens = ['+'];
  else if (c.endsWith('++')) tokens = [...c.slice(0, -2).split('+'), '+'];
  else tokens = c.split('+');
  if (tokens.some((t) => !t)) return `“${c}” is not a key or combination: write it like “cmd+c” or “return”`;
  const keyName = tokens.at(-1)!;
  const mods: Mod[] = [];
  for (const t of tokens.slice(0, -1)) {
    const m = modOf(t);
    if (!m) return `“${t}” in “${c}” is not a modifier: use cmd, shift, alt (option), ctrl or fn`;
    if (!mods.includes(m)) mods.push(m);
  }
  const ordered = MOD_ORDER.filter((m) => mods.includes(m));
  const flagsOf = (ms: Mod[]) => ms.reduce((f, m) => f | FLAGS[m], 0);
  // A modifier on its own ("shift"), or as the last of several.
  const alone = [...keyName].length > 1 ? modOf(keyName) : MOD_NAMES[keyName];
  if (alone) {
    const held = ordered.filter((m) => m !== alone);
    return { code: MOD_CODE[alone], mods: held.map((m) => MOD_CODE[m]), flags: flagsOf([...held, alone]) };
  }
  let ch = [...keyName].length === 1 ? keyName : CHAR_NAMES[plain(keyName)];
  if (!ch) {
    const code = NAMED[plain(keyName)];
    if (code === undefined) return `“${keyName}” is not a key this tool knows: use names like return, tab, escape, delete, forward_delete, space, up, down, left, right, home, end, page_up, page_down, f1–f20, or a single character`;
    return { code, mods: ordered.map((m) => MOD_CODE[m]), flags: flagsOf(ordered) };
  }
  // A character with cmd, ctrl, alt or fn is a shortcut: its key on a US keyboard, shift added for capitals and symbols.
  const command = ordered.filter((m) => m !== 'shift');
  if (!command.length) {
    // Typed as it is, the same on every keyboard layout (shift+a is A, shift+1 is !).
    if (ordered.includes('shift')) ch = UNSHIFTED[ch] ?? ch.toUpperCase();
    return { char: ch, mods: [], flags: 0 };
  }
  let base = ch;
  const all = [...ordered];
  if (SHIFTED[ch]) base = SHIFTED[ch];
  else if (ch !== ch.toLowerCase()) base = ch.toLowerCase();
  if (base !== ch && !all.includes('shift')) all.push('shift');
  const code = CHAR_CODE[base];
  if (code === undefined) return `“${ch}” can't be pressed with ${command.join('+')}: use a letter, digit or punctuation of a US keyboard`;
  const sorted = MOD_ORDER.filter((m) => all.includes(m));
  return { code, mods: sorted.map((m) => MOD_CODE[m]), flags: flagsOf(sorted) };
}

/** Keys as an agent writes them: one combination, or several separated by spaces ("cmd+a delete"). */
export function parseKeys(s: string): Stroke[] | string {
  const text = String(s ?? '').trim();
  if (!text) return 'Say which key: like “return”, “escape” or “cmd+c”';
  // A single space is the space bar.
  const combos = text === '' ? [] : text.split(/\s+/);
  if (combos.length > 20) return 'At most 20 keys at once';
  const out: Stroke[] = [];
  for (const c of combos) {
    const st = parseCombo(c);
    if (typeof st === 'string') return st;
    out.push(st);
  }
  return out;
}

/** Modifiers held while clicking ("shift", "cmd+alt"): their key codes and flags. */
export function parseMods(s: unknown): { mods: number[]; flags: number } | string {
  const text = String(s ?? '').trim();
  if (!text) return { mods: [], flags: 0 };
  const names: Mod[] = [];
  for (const t of text.split(/[\s+,]+/).filter(Boolean)) {
    const m = modOf(t);
    if (!m) return `“${t}” is not a key to hold while clicking: use shift, cmd, alt (option) or ctrl`;
    if (!names.includes(m)) names.push(m);
  }
  const sorted = MOD_ORDER.filter((m) => names.includes(m));
  return { mods: sorted.map((m) => MOD_CODE[m]), flags: sorted.reduce((f, m) => f | FLAGS[m], 0) };
}

/** A combination as people read it: "cmd+shift+T". */
export function keysLabel(s: string): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

// ---- actions ------------------------------------------------------------------------------------------------

export type Button = 'left' | 'right' | 'middle';
export type Direction = 'up' | 'down' | 'left' | 'right';

/** An action, checked. */
export type Action =
  | { do: 'click'; at?: Point; button: Button; count: 1 | 2 | 3; mods: number[]; flags: number; hold: string }
  | { do: 'move'; at: Point }
  | { do: 'drag'; from: Point; to: Point }
  | { do: 'down'; at?: Point }
  | { do: 'up'; at?: Point }
  | { do: 'scroll'; at?: Point; direction: Direction; amount: number }
  | { do: 'type'; text: string }
  | { do: 'key'; strokes: Stroke[]; keys: string }
  | { do: 'hold'; stroke: Stroke & { code: number }; keys: string; seconds: number }
  | { do: 'wait'; seconds: number }
  | { do: 'cursor' }
  | { do: 'open'; app: string };

/** The names agents use for each action (Anthropic's computer tool's, and a few more), and what they are. */
const ACTIONS: Record<string, string> = {
  left_click: 'left_click', click: 'left_click', double_click: 'double_click', doubleclick: 'double_click', triple_click: 'triple_click',
  right_click: 'right_click', middle_click: 'middle_click', mouse_move: 'mouse_move', move: 'mouse_move', hover: 'mouse_move',
  left_click_drag: 'left_click_drag', drag: 'left_click_drag', left_mouse_down: 'left_mouse_down', mouse_down: 'left_mouse_down',
  left_mouse_up: 'left_mouse_up', mouse_up: 'left_mouse_up', scroll: 'scroll', type: 'type', key: 'key', keys: 'key', press: 'key',
  hold_key: 'hold_key', wait: 'wait', cursor_position: 'cursor_position', open_app: 'open_app', open: 'open_app', launch: 'open_app',
};
export const ACTION_NAMES = [...new Set(Object.values(ACTIONS))];

const NEEDS_SCREENSHOT = 'Take a screenshot first (computer_screenshot): coordinates are pixels of its picture.';

/** A coordinate as agents give it ([x, y], {x, y} or "x, y"), checked against the latest screenshot. */
function pointOf(v: unknown, name: string, g: Geometry | undefined): Point | string {
  let x: number;
  let y: number;
  if (Array.isArray(v) && v.length === 2) [x, y] = v.map(Number);
  else if (v && typeof v === 'object' && 'x' in v && 'y' in v) [x, y] = [Number((v as { x: unknown }).x), Number((v as { y: unknown }).y)];
  else if (typeof v === 'string' && /^\s*\(?\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)?\s*$/.test(v)) [x, y] = v.replace(/[()\s]/g, '').split(',').map(Number);
  else return `${name} must be [x, y]: pixels of the latest screenshot`;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return `${name} must be two numbers, [x, y]`;
  if (!g) return NEEDS_SCREENSHOT;
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return `${name} [${x}, ${y}] is outside the screenshot, which is ${g.width}×${g.height}: x from 0 to ${g.width - 1}, y from 0 to ${g.height - 1}`;
  return [x, y];
}

const seconds = (v: unknown, fallback: number): number => {
  const n = Number(v ?? fallback);
  return Math.round(Math.min(MAX_SECONDS, Math.max(0.1, Number.isFinite(n) ? n : fallback)) * 10) / 10;
};

/** One action from the agent's input, checked; or what is wrong with it. */
export function parseAction(a: Record<string, unknown>, g: Geometry | undefined): Action | string {
  if (!a || typeof a !== 'object') return 'Each step is an object with an action';
  const raw = String(a.action ?? '').trim();
  const name = ACTIONS[raw.toLowerCase().replace(/[\s-]+/g, '_')];
  if (!name) return raw ? `“${raw}” is not an action: use ${ACTION_NAMES.join(', ')}` : `Say which action: ${ACTION_NAMES.join(', ')}`;
  const at = (k: string, label = k, required = false): Point | undefined | string => {
    const v = a[k] ?? (k === 'coordinate' && a.x !== undefined && a.y !== undefined ? [a.x, a.y] : undefined);
    if (v === undefined || v === null) return required ? `${name} needs ${label}: [x, y], pixels of the latest screenshot` : undefined;
    return pointOf(v, label, g);
  };
  switch (name) {
    case 'left_click':
    case 'double_click':
    case 'triple_click':
    case 'right_click':
    case 'middle_click': {
      const p = at('coordinate');
      if (typeof p === 'string') return p;
      const held = parseMods(a.text ?? a.hold ?? a.modifiers);
      if (typeof held === 'string') return held;
      const button: Button = name === 'right_click' ? 'right' : name === 'middle_click' ? 'middle' : 'left';
      const count = name === 'double_click' ? 2 : name === 'triple_click' ? 3 : 1;
      return { do: 'click', ...(p ? { at: p } : {}), button, count, ...held, hold: held.mods.length ? keysLabel(String(a.text ?? a.hold ?? a.modifiers)) : '' };
    }
    case 'mouse_move': {
      const p = at('coordinate', 'coordinate', true);
      if (typeof p === 'string' || !p) return p ?? NEEDS_SCREENSHOT;
      return { do: 'move', at: p };
    }
    case 'left_click_drag': {
      const from = at('start_coordinate', 'start_coordinate', true);
      if (typeof from === 'string' || !from) return from ?? NEEDS_SCREENSHOT;
      const to = at('coordinate', 'coordinate', true);
      if (typeof to === 'string' || !to) return to ?? NEEDS_SCREENSHOT;
      return { do: 'drag', from, to };
    }
    case 'left_mouse_down':
    case 'left_mouse_up': {
      const p = at('coordinate');
      if (typeof p === 'string') return p;
      return { do: name === 'left_mouse_down' ? 'down' : 'up', ...(p ? { at: p } : {}) };
    }
    case 'scroll': {
      const p = at('coordinate');
      if (typeof p === 'string') return p;
      const d = String(a.scroll_direction ?? a.direction ?? 'down').toLowerCase();
      if (!['up', 'down', 'left', 'right'].includes(d)) return `scroll_direction must be up, down, left or right, not “${d}”`;
      const n = Math.round(Number(a.scroll_amount ?? a.amount ?? 3));
      return { do: 'scroll', ...(p ? { at: p } : {}), direction: d as Direction, amount: Math.min(30, Math.max(1, Number.isFinite(n) ? n : 3)) };
    }
    case 'type': {
      const text = typeof a.text === 'string' ? a.text : a.text === undefined || a.text === null ? '' : String(a.text);
      if (!text) return 'type needs text: what to type';
      if (text.length > MAX_TEXT) return `That is ${text.length} characters: type at most ${MAX_TEXT} at once`;
      return { do: 'type', text };
    }
    case 'key': {
      const keys = String(a.text ?? a.key ?? a.keys ?? '');
      const strokes = parseKeys(keys);
      if (typeof strokes === 'string') return strokes;
      return { do: 'key', strokes, keys: keysLabel(keys) };
    }
    case 'hold_key': {
      const keys = String(a.text ?? a.key ?? '');
      const strokes = parseKeys(keys);
      if (typeof strokes === 'string') return strokes;
      if (strokes.length !== 1) return 'hold_key holds one key or combination';
      let st = strokes[0];
      if (st.code === undefined) {
        const base = CHAR_CODE[(st.char ?? '').toLowerCase()];
        if (base === undefined) return `“${st.char}” can't be held: use a key like shift, space, or a letter`;
        st = { ...st, code: base };
      }
      return { do: 'hold', stroke: st as Stroke & { code: number }, keys: keysLabel(keys), seconds: seconds(a.duration ?? a.seconds, 1) };
    }
    case 'wait':
      return { do: 'wait', seconds: seconds(a.duration ?? a.seconds, 1) };
    case 'cursor_position':
      return { do: 'cursor' };
    case 'open_app': {
      const app = String(a.app ?? a.name ?? a.text ?? '').trim();
      if (!app) return 'open_app needs app: the name of a Mac app, like “Notes”';
      if (app.length > 100 || /[\n\r\0]/.test(app) || app.startsWith('-')) return 'app is the name of a Mac app, like “Notes” or “Google Chrome”';
      return { do: 'open', app };
    }
  }
  return `“${raw}” is not an action`;
}

/** The whole call: one action, or `steps` (up to 10), and whether to take a screenshot after (yes unless false). */
export function parseInput(input: Record<string, unknown>, g: Geometry | undefined): { actions: Action[]; screenshot: boolean } | { error: string } {
  const a = input && typeof input === 'object' ? input : {};
  const list: unknown[] = Array.isArray(a.steps) ? a.steps : a.action !== undefined ? [a] : [];
  if (!list.length) return { error: `Give an action (${ACTION_NAMES.join(', ')}), or steps: a list of them` };
  if (list.length > MAX_STEPS) return { error: `At most ${MAX_STEPS} steps at once: take a screenshot and go on from there` };
  const actions: Action[] = [];
  for (const [i, s] of list.entries()) {
    const x = parseAction(s as Record<string, unknown>, g);
    if (typeof x === 'string') return { error: list.length > 1 ? `Step ${i + 1}: ${x}. Nothing was done.` : `${x}. Nothing was done.` };
    actions.push(x);
  }
  return { actions, screenshot: a.screenshot !== false && a.screenshot !== 'false' };
}

// ---- what the driver does -----------------------------------------------------------------------------------

/** The driver's small steps (driver.ts), in points. */
export type Op =
  | { op: 'move'; x: number; y: number }
  | { op: 'click'; x?: number; y?: number; button: 0 | 1 | 2; count: number; mods: number[]; flags: number }
  | { op: 'drag'; x1: number; y1: number; x2: number; y2: number }
  | { op: 'down'; x?: number; y?: number }
  | { op: 'up'; x?: number; y?: number }
  | { op: 'scroll'; x?: number; y?: number; dx: number; dy: number; n: number }
  | { op: 'type'; text: string }
  | { op: 'key'; code: number; mods: number[]; flags: number }
  | { op: 'hold'; code: number; mods: number[]; flags: number; ms: number }
  | { op: 'sleep'; ms: number }
  | { op: 'pos' }
  | { op: 'info' }
  | { op: 'release' };

const BUTTON: Record<Button, 0 | 1 | 2> = { left: 0, right: 1, middle: 2 };
/** A pause between actions, for the app to take the last one in (a click that focuses a field before typing). */
const BETWEEN = 120;

/** The actions as the driver's steps. Coordinates need the geometry of the screenshot they came from. */
export function opsFor(actions: Action[], g: Geometry | undefined): Op[] {
  const pt = (p: Point) => {
    if (!g) throw new Error(NEEDS_SCREENSHOT);
    return toScreen(p, g);
  };
  const out: Op[] = [];
  actions.forEach((a, i) => {
    if (i > 0) out.push({ op: 'sleep', ms: BETWEEN });
    switch (a.do) {
      case 'click':
        out.push({ op: 'click', ...(a.at ? pt(a.at) : {}), button: BUTTON[a.button], count: a.count, mods: a.mods, flags: a.flags });
        break;
      case 'move':
        out.push({ op: 'move', ...pt(a.at) });
        break;
      case 'drag': {
        const f = pt(a.from);
        const t = pt(a.to);
        out.push({ op: 'drag', x1: f.x, y1: f.y, x2: t.x, y2: t.y });
        break;
      }
      case 'down':
      case 'up':
        out.push({ op: a.do, ...(a.at ? pt(a.at) : {}) });
        break;
      case 'scroll': {
        // Wheel deltas: up and left are positive (the content moves down, or right).
        const d = a.direction;
        out.push({ op: 'scroll', ...(a.at ? pt(a.at) : {}), dy: d === 'up' ? NOTCH : d === 'down' ? -NOTCH : 0, dx: d === 'left' ? NOTCH : d === 'right' ? -NOTCH : 0, n: a.amount });
        break;
      }
      case 'type':
        out.push({ op: 'type', text: a.text });
        break;
      case 'key':
        a.strokes.forEach((s, k) => {
          if (k > 0) out.push({ op: 'sleep', ms: 40 });
          out.push(s.code === undefined ? { op: 'type', text: s.char ?? '' } : { op: 'key', code: s.code, mods: s.mods, flags: s.flags });
        });
        break;
      case 'hold':
        out.push({ op: 'hold', code: a.stroke.code, mods: a.stroke.mods, flags: a.stroke.flags, ms: Math.round(a.seconds * 1000) });
        break;
      case 'wait':
        out.push({ op: 'sleep', ms: Math.round(a.seconds * 1000) });
        break;
      case 'cursor':
        out.push({ op: 'pos' });
        break;
      case 'open':
        throw new Error('open_app is not one of the driver’s steps');
    }
  });
  return out;
}

/** How long the driver may take for these steps before it is stopped. */
export function driverTimeout(ops: Op[]): number {
  let ms = 15_000;
  for (const o of ops) {
    if (o.op === 'type') ms += o.text.length * 30;
    else if (o.op === 'sleep' || o.op === 'hold') ms += o.ms;
    else if (o.op === 'scroll') ms += o.n * 40;
  }
  return ms;
}

// ---- in words -----------------------------------------------------------------------------------------------

const at = (p?: Point) => (p ? ` at (${p[0]}, ${p[1]})` : ' where the pointer is');
const quoted = (s: string, max = 80) => `“${s.length > max ? `${s.slice(0, max)}…` : s}”`.replace(/\n/g, '⏎');

/** What an action did, for the agent and the conversation. `pos`: where cursor_position found the pointer. */
export function describe(a: Action, extra: { pos?: Point | null; pasted?: boolean } = {}): string {
  switch (a.do) {
    case 'click': {
      const verb = a.button === 'right' ? 'Right-clicked' : a.button === 'middle' ? 'Middle-clicked' : a.count === 2 ? 'Double-clicked' : a.count === 3 ? 'Triple-clicked' : 'Clicked';
      return `${verb}${at(a.at)}${a.hold ? ` holding ${a.hold}` : ''}`;
    }
    case 'move':
      return `Moved the pointer to (${a.at[0]}, ${a.at[1]})`;
    case 'drag':
      return `Dragged from (${a.from[0]}, ${a.from[1]}) to (${a.to[0]}, ${a.to[1]})`;
    case 'down':
      return `Pressed the mouse button down${at(a.at)}`;
    case 'up':
      return `Let go of the mouse button${at(a.at)}`;
    case 'scroll':
      return `Scrolled ${a.direction} ${a.amount} notch${a.amount === 1 ? '' : 'es'}${at(a.at)}`;
    case 'type':
      return `Typed ${quoted(a.text)}${a.text.length > 80 ? ` (${a.text.length} characters)` : ''}${extra.pasted ? ', pasted from the clipboard (typing it was not possible here; the clipboard was put back)' : ''}`;
    case 'key':
      return `Pressed ${a.keys}`;
    case 'hold':
      return `Held ${a.keys} for ${a.seconds} s`;
    case 'wait':
      return `Waited ${a.seconds} s`;
    case 'cursor':
      return extra.pos ? `The pointer is at (${extra.pos[0]}, ${extra.pos[1]})` : extra.pos === null ? 'The pointer is on another display than the one in the screenshot' : 'Read where the pointer is';
    case 'open':
      return `Opened ${a.app}`;
  }
}

// ---- pictures -------------------------------------------------------------------------------------------------

/** A PNG's size, from its header. */
export function pngSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** A JPEG's size, from its frame header. */
export function jpegSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) {
      i++;
      continue;
    }
    // Markers that stand alone, with no length.
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
      i += 2;
      continue;
    }
    if (m === 0xd9 || m === 0xda) return null;
    const len = b.readUInt16BE(i + 2);
    const frame = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (frame) return i + 9 <= b.length ? { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) } : null;
    i += 2 + len;
  }
  return null;
}
