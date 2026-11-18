// The Browser's Save button: Save keeps a readable copy of the page in the Library, and the ▾ beside it says where, as a
// menu of the places the Library has: Not in a project, each project, and the Library folders in each. The place picked
// is marked and kept on this device: Save uses it until another is picked. A project or folder that has gone since is as
// good as none.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, ChevronDown, Folder, Layers } from 'lucide-react';
import type { LibFolder } from '@shared/pages';
import type { SpaceView } from '@shared/spaces';
import { tr } from '../../i18n/runtime';
import { Button, cx, MenuItem, MenuLabel, Popover } from '../../components/ui';
import { asTree, placeFolders } from '../pages/folders';
import { usePagesStore } from '../pages/state';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';

/** Where a page is saved to: a project (null: none) and a folder of its place (null: its top). */
export interface SavePlace {
  space: string | null;
  folder: string | null;
}

const KEY = 'wa.browserSavePlace';
const NONE: SavePlace = { space: null, folder: null };

/** The place picked last on this device. */
export function readSavePlace(): SavePlace {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SavePlace> | null;
    return { space: typeof v?.space === 'string' && v.space ? v.space : null, folder: typeof v?.folder === 'string' && v.folder ? v.folder : null };
  } catch {
    return NONE;
  }
}

function keepSavePlace(p: SavePlace) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

/** The place as it stands now: one whose project or folder is gone is the top of what is left (None when the project is). Not checked until both lists are known. */
export function placeNow(p: SavePlace, spaces: SpaceView[] | null, folders: LibFolder[] | null): SavePlace {
  if (!spaces || !folders) return p;
  const space = p.space && spaces.some((s) => s.id === p.space) ? p.space : null;
  const folder = p.folder && space === p.space && placeFolders(folders, space).some((f) => f.id === p.folder) ? p.folder : null;
  return { space, folder };
}

/** Where a place is, in words: its folder (or its project, or the Library), for the toast and the button's hint. */
export function placeName(p: SavePlace, spaces: SpaceView[] | null, folders: LibFolder[] | null): string | null {
  const f = p.folder ? (folders ?? []).find((x) => x.id === p.folder) : null;
  if (f) return f.name;
  const s = p.space ? (spaces ?? []).find((x) => x.id === p.space) : null;
  return s?.name ?? null;
}

/** Everything Save needs of the place: where it is now, what it is called, and the two ways it is picked (the menu and Save's own). */
export function useSavePlace() {
  const spaces = useSpaces();
  const folders = usePagesStore((s) => s.folders);
  useEffect(() => {
    if (folders === null) void usePagesStore.getState().loadPages().catch(() => {});
  }, [folders]);
  const [picked, setPicked] = useState(readSavePlace);
  const place = useMemo(() => placeNow(picked, spaces, folders), [picked, spaces, folders]);
  const pick = (p: SavePlace) => {
    keepSavePlace(p);
    setPicked(p);
  };
  return { place, name: placeName(place, spaces, folders), pick, spaces, folders };
}

/** Save, and the ▾ that picks where (`where`: useSavePlace's, which the page shares with its menu's Save). */
export function SaveButton({ where, disabled, saving, onSave }: { where: ReturnType<typeof useSavePlace>; disabled: boolean; saving: boolean; onSave: () => void }) {
  const { place, name, pick, spaces, folders } = where;
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const choose = (p: SavePlace) => {
    pick(p);
    setOpen(false);
  };
  const here = (space: string | null, folder: string | null) => place.space === space && place.folder === folder;
  const rows = (space: string | null) =>
    // A place's folders sit under it, one step in for each level.
    asTree(placeFolders(folders, space)).map(({ f, depth }) => (
      <div key={f.id} style={{ paddingLeft: (depth + 1) * 14 }}>
        <MenuItem icon={<Folder size={14} />} checked={here(space, f.id)} onClick={() => choose({ space, folder: f.id })}>
          <span translate="no" className="block truncate">
            {f.name}
          </span>
        </MenuItem>
      </div>
    ));
  return (
    <>
      <div ref={anchor} className="flex items-stretch">
        <Button size="sm" icon={<BookmarkPlus size={14} />} disabled={disabled || saving} title={name ? tr(`Save a readable copy to ${name}`) : tr('Save a readable copy to the Library')} className="rounded-r-none" onClick={onSave}>
          Save
        </Button>
        <button
          type="button"
          aria-label={tr('Choose where to save')}
          title={tr('Choose where to save')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cx(
            'press -ml-px inline-flex h-8 w-7 items-center justify-center rounded-r-[10px] bg-bg-2 text-fg-2 ring-1 ring-line-2 ring-inset transition duration-150 hover:bg-bg-3 hover:text-fg',
            open && '!bg-bg-3 !text-fg',
          )}
        >
          <ChevronDown size={13} className={cx('transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </div>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" width={260}>
        <MenuLabel>Save to</MenuLabel>
        <MenuItem icon={<Layers size={14} />} checked={here(null, null)} onClick={() => choose(NONE)}>
          Not in a project
        </MenuItem>
        {rows(null)}
        {(spaces ?? []).map((s) => (
          <div key={s.id}>
            <MenuItem icon={<SpaceMark s={s} size={15} />} checked={here(s.id, null)} onClick={() => choose({ space: s.id, folder: null })}>
              <span translate="no">{s.name}</span>
            </MenuItem>
            {rows(s.id)}
          </div>
        ))}
      </Popover>
    </>
  );
}
