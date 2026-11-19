// The Browser's Save button: Save keeps a readable copy of the page in a project's files, and the ▾ beside it says which
// project, as a menu: each project, and No project (the copy stays unplaced, and the search box finds it). The project
// picked is marked and kept on this device: Save uses it until another is picked. A project that has gone since is as
// good as none.
import { useMemo, useRef, useState } from 'react';
import { BookmarkPlus, ChevronDown, Layers } from 'lucide-react';
import type { SpaceView } from '@shared/spaces';
import { tr } from '../../i18n/runtime';
import { Button, cx, MenuItem, MenuLabel, Popover } from '../../components/ui';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';

/** Where a page is saved to: a project (null: none). */
export interface SavePlace {
  space: string | null;
}

const KEY = 'wa.browserSavePlace';
const NONE: SavePlace = { space: null };

/** The project picked last on this device. */
export function readSavePlace(): SavePlace {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SavePlace> | null;
    return { space: typeof v?.space === 'string' && v.space ? v.space : null };
  } catch {
    return NONE;
  }
}

function keepSavePlace(p: SavePlace) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

/** The place as it stands now: a project that is gone is none. Not checked until the projects are known. */
export function placeNow(p: SavePlace, spaces: SpaceView[] | null): SavePlace {
  if (!spaces) return p;
  return { space: p.space && spaces.some((s) => s.id === p.space) ? p.space : null };
}

/** The project's name, for the toast and the button's hint (null: no project). */
export function placeName(p: SavePlace, spaces: SpaceView[] | null): string | null {
  return p.space ? ((spaces ?? []).find((x) => x.id === p.space)?.name ?? null) : null;
}

/** Everything Save needs of the place: where it is now, what it is called, and the two ways it is picked (the menu and Save's own). */
export function useSavePlace() {
  const spaces = useSpaces();
  const [picked, setPicked] = useState(readSavePlace);
  const place = useMemo(() => placeNow(picked, spaces), [picked, spaces]);
  const pick = (p: SavePlace) => {
    keepSavePlace(p);
    setPicked(p);
  };
  return { place, name: placeName(place, spaces), pick, spaces };
}

/** Save, and the ▾ that picks the project (`where`: useSavePlace's, which the page shares with its menu's Save). */
export function SaveButton({ where, disabled, saving, onSave }: { where: ReturnType<typeof useSavePlace>; disabled: boolean; saving: boolean; onSave: () => void }) {
  const { place, name, pick, spaces } = where;
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const choose = (p: SavePlace) => {
    pick(p);
    setOpen(false);
  };
  return (
    <>
      <div ref={anchor} className="flex items-stretch">
        <Button size="sm" icon={<BookmarkPlus size={14} />} disabled={disabled || saving} title={name ? tr(`Save a readable copy to ${name}`) : tr('Save a readable copy of this page')} className="rounded-r-none" onClick={onSave}>
          Save
        </Button>
        <button
          type="button"
          aria-label={tr('Choose a project to save to')}
          title={tr('Choose a project to save to')}
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
        <MenuItem icon={<Layers size={14} />} checked={place.space === null} onClick={() => choose(NONE)}>
          No project
        </MenuItem>
        {(spaces ?? []).map((s) => (
          <MenuItem key={s.id} icon={<SpaceMark s={s} size={15} />} checked={place.space === s.id} onClick={() => choose({ space: s.id })}>
            <span translate="no">{s.name}</span>
          </MenuItem>
        ))}
      </Popover>
    </>
  );
}
