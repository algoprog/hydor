// Every icon in Lucide (the icon library the app already uses), by name, with its lines as a slide keeps them. This
// module is a chunk of its own: the icon picker loads it the first time it opens, so the editor opens no slower.
// An old name's file (one that only points at the icon's own) has no data and is left out.
import type { IconNode } from '@shared/slides';

type IconData = { name: string; node: [string, Record<string, string | number>][] };
const mods = import.meta.glob<{ __iconData?: IconData }>('../../../../../node_modules/lucide-react/dist/esm/icons/*.mjs', { eager: true });

export const ICONS: { name: string; paths: IconNode[] }[] = Object.values(mods)
  .map((m) => m.__iconData)
  .filter((d): d is IconData => !!d && typeof d.name === 'string' && Array.isArray(d.node))
  .map((d) => ({ name: d.name, paths: d.node.map(([tag, attrs]) => [tag, Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== 'key'))] as IconNode) }))
  .sort((a, b) => a.name.localeCompare(b.name));
