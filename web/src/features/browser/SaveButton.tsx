// The Browser's Save button: Save keeps a readable copy of the page in a project's files, and the ▾ beside it says which
// project, as a menu: each project (with the folders of its folder, to pick one: spaces/FolderPick.tsx), and No project
// (the copy stays unplaced, and the search box finds it). What is picked is marked and kept on this device: Save uses it
// until another is picked. A project that has gone since is as good as none, and a folder that has gone as good as the
// top of its project's.
import { useMemo, useRef, useState } from 'react';
import { BookmarkPlus, ChevronDown, Layers } from 'lucide-react';
import type { SpaceView } from '@shared/spaces';
import { tr } from '../../i18n/runtime';
import { Button, cx, MenuItem, MenuLabel, Popover } from '../../components/ui';
import { api, enc } from '../../lib/api';
import { basename } from '../../lib/format';
import { FolderStep, ProjectRow, useSubfolders } from '../spaces/FolderPick';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';

/** Where a page is saved to: a project (null: none), and a folder picked inside its folder (none: its top). */
export interface SavePlace {
  space: string | null;
  dir?: string;
}

const KEY = 'wa.browserSavePlace';
const NONE: SavePlace = { space: null };

/** The project (and folder) picked last on this device. */
export function readSavePlace(): SavePlace {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SavePlace> | null;
    const space = typeof v?.space === 'string' && v.space ? v.space : null;
    return space && typeof v?.dir === 'string' && v.dir ? { space, dir: v.dir } : { space };
  } catch {
    return NONE;
  }
}

function keepSavePlace(p: SavePlace) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

/** The place as it stands now: a project that is gone is none, a folder not inside its folder is left out. Not checked until the projects are known. */
export function placeNow(p: SavePlace, spaces: SpaceView[] | null): SavePlace {
  if (!spaces) return p;
  const s = p.space ? spaces.find((x) => x.id === p.space) : undefined;
  if (!s) return NONE;
  return p.dir?.startsWith(`${s.folder}/`) ? { space: s.id, dir: p.dir } : { space: s.id };
}

/** The project's name, for the toast and the button's hint (null: no project). */
export function placeName(p: SavePlace, spaces: SpaceView[] | null): string | null {
  return p.space ? ((spaces ?? []).find((x) => x.id === p.space)?.name ?? null) : null;
}

/** Everything Save needs of the place: where it is now, what its project and folder are called, and the two ways it is picked (the menu and Save's own). */
export function useSavePlace() {
  const spaces = useSpaces();
  const [picked, setPicked] = useState(readSavePlace);
  const place = useMemo(() => placeNow(picked, spaces), [picked, spaces]);
  const pick = (p: SavePlace) => {
    keepSavePlace(p);
    setPicked(p);
  };
  return { place, name: placeName(place, spaces), folder: place.dir ? basename(place.dir) : null, pick, spaces };
}

/** The folder to save into, if it is still there: one that has gone is forgotten, and the save goes to its project's top. */
export async function folderStill({ place, pick }: ReturnType<typeof useSavePlace>): Promise<string | undefined> {
  if (!place.dir) return undefined;
  const found = await api<{ exists: boolean; dir?: boolean }>(`/api/fs/stat?path=${enc(place.dir)}`).catch(() => null);
  // No answer: the save itself says what is wrong.
  if (!found || (found.exists && found.dir)) return place.dir;
  pick({ space: place.space });
  return undefined;
}

/** The menu's choices: No project and each project, or a project's folders in their place. */
function PlaceChoices({ where, onChoose }: { where: ReturnType<typeof useSavePlace>; onChoose: (p: SavePlace) => void }) {
  const { place, folder, spaces } = where;
  const [into, setInto] = useState<SpaceView | null>(null);
  const folders = useSubfolders((spaces ?? []).map((s) => s.folder));
  if (into) return <FolderStep project={into} onBack={() => setInto(null)} onPick={(dir) => onChoose({ space: into.id, dir })} />;
  return (
    <>
      <MenuLabel>Save to</MenuLabel>
      <MenuItem icon={<Layers size={14} />} checked={place.space === null} onClick={() => onChoose(NONE)}>
        No project
      </MenuItem>
      {(spaces ?? []).map((s) => (
        <ProjectRow key={s.id} folders={folders(s.folder)} onFolders={() => setInto(s)}>
          <MenuItem
            icon={<SpaceMark s={s} size={15} />}
            checked={place.space === s.id}
            hint={
              place.space === s.id && folder ? (
                <span translate="no" className="block max-w-24 truncate">
                  {folder}
                </span>
              ) : undefined
            }
            onClick={() => onChoose({ space: s.id })}
          >
            <span translate="no">{s.name}</span>
          </MenuItem>
        </ProjectRow>
      ))}
    </>
  );
}

/** Save, and the ▾ that picks the project and folder (`where`: useSavePlace's, which the page shares with its menu's Save). */
export function SaveButton({ where, disabled, saving, onSave }: { where: ReturnType<typeof useSavePlace>; disabled: boolean; saving: boolean; onSave: () => void }) {
  const { name, folder, pick } = where;
  const to = folder ?? name;
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const choose = (p: SavePlace) => {
    pick(p);
    setOpen(false);
  };
  return (
    <>
      <div ref={anchor} className="flex items-stretch">
        <Button size="sm" icon={<BookmarkPlus size={14} />} disabled={disabled || saving} title={to ? tr(`Save a readable copy to ${to}`) : tr('Save a readable copy of this page')} className="rounded-r-none" onClick={onSave}>
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
        <PlaceChoices where={where} onChoose={choose} />
      </Popover>
    </>
  );
}
