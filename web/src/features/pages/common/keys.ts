// Keys as the editors name them and as this computer writes them: the editors' menus, tooltips and shortcut lists say
// "Ctrl+Shift+Z", and on a Mac that shows as ⌘⇧Z. isMod tells the shortcut key from an event: Ctrl, or ⌘ on a Mac.

const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

const MAC: [RegExp, string][] = [
  [/Ctrl\+/g, '⌘'],
  [/Alt\+/g, '⌥'],
  [/Shift\+/g, '⇧'],
  [/\bEnter\b/g, '↩'],
  [/\bBackspace\b/g, '⌫'],
  [/\bDelete\b/g, '⌦'],
  [/\bEsc\b/g, '⎋'],
  [/\bTab\b/g, '⇥'],
];

/** Keys ("Ctrl+Shift+Z") as this computer writes them: ⌘⇧Z on a Mac, unchanged elsewhere. */
export function keyLabel(keys: string): string {
  if (!apple) return keys;
  let s = keys;
  for (const [re, to] of MAC) s = s.replace(re, to);
  return s;
}

/** The shortcut key held: Ctrl, or ⌘ on a Mac. */
export const isMod = (e: { ctrlKey: boolean; metaKey: boolean }) => (apple ? e.metaKey : e.ctrlKey);

/** Whether this is a Mac (or an iPad with a keyboard), where ⌘ does what Ctrl does elsewhere. */
export const isApple = apple;

type DragKeys = { ctrlKey: boolean; metaKey: boolean; altKey: boolean };

/**
 * Held while dragging a part in any of the editors that place things (slides, designs, diagrams, pages, pictures, the
 * video's viewer): a copy is dragged, and the part stays where it was. Ctrl, as PowerPoint has it; ⌥ on a Mac (as
 * Keynote and PowerPoint for Mac have it), where Ctrl and a click is the right-click.
 */
export const isCopyDrag = (e: DragKeys) => (apple ? e.altKey : e.ctrlKey);

/** Held while dragging or sizing a part in those editors: it does not snap to the other parts, the guides or the grid. Alt; ⌘ on a Mac. */
export const isNoSnap = (e: DragKeys) => (apple ? e.metaKey : e.altKey);

/** The keys for those two, as the editors' shortcut lists and guides write them ("Ctrl+drag", "Alt+drag"; ⌥ and ⌘ on a Mac). */
export const COPY_DRAG_KEY = apple ? '⌥' : 'Ctrl';
export const NO_SNAP_KEY = apple ? '⌘' : 'Alt';
