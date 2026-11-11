// The editors' menus are the app's own menu bar (pages/common/menus: named menus, each action with its keys beside it,
// lists inside opened in place, Search the menus with Alt+/, one Menus button where there is no room), so every editor
// in the app reads alike. Here: the keys a menu shows made to work (runMenuKeys finds the action whose keys were pressed
// and does it), and the list of shortcuts made from the menus (for Keyboard shortcuts).
import type { MenuAction, MenuDef, MenuEntry } from '../../pages/common/menus';
import type { ShortcutGroup } from '../../pages/common/Shortcuts';
import { isMod } from '../../pages/common/keys';

export { ContextMenu, isMenuKey, MenuBar, type ContextMenuAt, type MenuAction, type MenuDef, type MenuEntry } from '../../pages/common/menus';
export { ShortcutsDialog, type ShortcutGroup } from '../../pages/common/Shortcuts';
export { isApple, isCopyDrag, isMod, isNoSnap, keyLabel } from '../../pages/common/keys';

type KeyEvent = { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

/** Whether an event is these keys ("Ctrl+Shift+Z", "[", "Delete", "Ctrl+0", "Ctrl+="): Ctrl is ⌘ on a Mac. */
export function matchKeys(keys: string, e: KeyEvent): boolean {
  const k = keys.trim();
  const plus = k.endsWith('++');
  const parts = (plus ? k.slice(0, -2) : k).split('+').filter(Boolean);
  const last = plus ? '+' : (parts.pop() ?? '');
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  if (isMod(e) !== mods.has('ctrl') || e.shiftKey !== mods.has('shift') || e.altKey !== mods.has('alt')) return false;
  const want = last.toLowerCase();
  const key = e.key.toLowerCase();
  switch (want) {
    case 'delete':
      return key === 'delete' || key === 'backspace';
    case 'esc':
    case 'escape':
      return key === 'escape';
    case 'space':
      return e.code === 'Space';
    case '[':
      return e.code === 'BracketLeft';
    case ']':
      return e.code === 'BracketRight';
    case '=':
    case '+':
      return key === '=' || key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd';
    case '-':
      return key === '-' || key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract';
    case '/':
      return e.code === 'Slash' || key === '/';
    case "'":
      return e.code === 'Quote';
    case ';':
      return e.code === 'Semicolon';
    case '\\':
      return e.code === 'Backslash';
  }
  if (/^\d$/.test(want)) return e.code === `Digit${want}` || e.code === `Numpad${want}` || key === want;
  if (want.length === 1 && /[a-z]/.test(want)) return e.code === `Key${want.toUpperCase()}` || key === want;
  return key === want;
}

const actions = (items: MenuEntry[]): MenuAction[] => items.flatMap((it) => (!it || it === '-' ? [] : it.items ? actions(it.items) : [it]));

/**
 * The action of the menus whose keys were pressed, done (and the key's own meaning stopped): true when one was. An
 * action's keys may be several, "Ctrl+Y / Ctrl+Shift+Z".
 */
export function runMenuKeys(menus: MenuDef[], e: KeyEvent & { preventDefault(): void }): boolean {
  for (const m of menus)
    for (const a of actions(m.items)) {
      if (!a.keys || !a.run) continue;
      if (!a.keys.split(' / ').some((k) => matchKeys(k, e))) continue;
      e.preventDefault();
      if (!a.disabled) a.run();
      return true;
    }
  return false;
}

/** Every key of the menus, by menu, for the list of keyboard shortcuts (with `more` groups after them). */
export function shortcutGroups(menus: MenuDef[], more: ShortcutGroup[] = []): ShortcutGroup[] {
  const out: ShortcutGroup[] = [];
  for (const m of menus) {
    const items = actions(m.items)
      .filter((a) => a.keys)
      .map((a) => [a.keys!, a.label] as [string, string]);
    if (items.length) out.push({ title: m.label, items });
  }
  return [...out, ...more];
}
