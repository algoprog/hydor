// Lucide's icons by name for diagrams (the icon shapes, and an agent's diagram being written), from the list the slides'
// icon picker loads: a chunk of its own, loaded the first time a diagram needs an icon.
import type { IconNode } from '@shared/slides';
import { ICONS } from '../slides/iconData';

const BY_NAME = new Map(ICONS.map((i) => [i.name, i.paths]));
/** Names without their dashes, for "harddrive" or "HardDrive". */
const LOOSE = new Map(ICONS.map((i) => [i.name.replace(/-/g, ''), i.paths]));

/** An icon's lines by its name ("server", "hard-drive", "HardDrive"); null when Lucide has none. */
export function iconPaths(name: string): IconNode[] | null {
  const k = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return BY_NAME.get(k) ?? LOOSE.get(k.replace(/-/g, '')) ?? null;
}

/** Every icon, by name, for the shape panel's search. */
export const ICON_NAMES = ICONS.map((i) => i.name);
export { ICONS };
