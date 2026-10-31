// Keys as CDP's Input.dispatchKeyEvent wants them: "Enter", "Control+A", "Shift+Tab", a letter.
import { MOD } from '../../shared/browser.ts';

interface KeyDef {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
}

const NAMED: Record<string, KeyDef> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  insert: { key: 'Insert', code: 'Insert', keyCode: 45 },
};
for (let i = 1; i <= 12; i++) NAMED[`f${i}`] = { key: `F${i}`, code: `F${i}`, keyCode: 111 + i };

const MODS: Record<string, number> = { control: MOD.ctrl, ctrl: MOD.ctrl, shift: MOD.shift, alt: MOD.alt, option: MOD.alt, meta: MOD.meta, cmd: MOD.meta, command: MOD.meta, super: MOD.meta };

function charKey(c: string): KeyDef {
  const up = c.toUpperCase();
  if (/^[a-z]$/i.test(c)) return { key: c, code: `Key${up}`, keyCode: up.charCodeAt(0), text: c };
  if (/^[0-9]$/.test(c)) return { key: c, code: `Digit${c}`, keyCode: c.charCodeAt(0), text: c };
  return { key: c, code: '', keyCode: 0, text: c };
}

/** One press, like "Control+Shift+K"; null when it names no key. */
export function parseKey(spec: string): { def: KeyDef; mods: number } | null {
  const parts = spec.split('+').map((p) => p.trim());
  // "Control++" means Control and the plus key.
  if (spec.endsWith('++')) parts.splice(parts.length - 2, 2, '+');
  let mods = 0;
  for (const p of parts.slice(0, -1)) {
    const m = MODS[p.toLowerCase()];
    if (!m) return null;
    mods |= m;
  }
  const last = parts[parts.length - 1];
  if (!last) return null;
  const named = NAMED[last.toLowerCase()];
  if (named) return { def: named, mods };
  if ([...last].length === 1) {
    const def = charKey(last);
    return { def: mods & MOD.shift && /^[a-z]$/.test(last) ? { ...def, key: last.toUpperCase(), text: last.toUpperCase() } : def, mods };
  }
  return null;
}

/** The CDP events for pressing and releasing a key. */
export function keyEvents(def: KeyDef, mods: number): Record<string, unknown>[] {
  // With Control, Alt or Meta held the key types nothing (it is a shortcut).
  const text = mods & (MOD.ctrl | MOD.alt | MOD.meta) ? undefined : def.text;
  const base = { modifiers: mods, key: def.key, code: def.code, windowsVirtualKeyCode: def.keyCode, nativeVirtualKeyCode: def.keyCode };
  return [
    { ...base, type: text ? 'keyDown' : 'rawKeyDown', ...(text ? { text, unmodifiedText: text } : {}) },
    { ...base, type: 'keyUp' },
  ];
}
