// A folder inside a project's folder, picked where a project is (a menu of projects): a project whose folder has
// folders gets a button at the end of its row, which puts them in the menu's place. There a folder's name picks it and
// its › opens it, to go deeper; the first row picks the folder shown, and the row above goes back up a level, from the
// top back to the projects. Clicking the project's row itself is the top of its folder, as ever.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { Space } from '@shared/spaces';
import { cx, MenuBack, MenuItem, Throbber } from '../../components/ui';
import { api } from '../../lib/api';
import { basename } from '../../lib/format';
import { tr } from '../../i18n/runtime';

interface Sub {
  name: string;
  path: string;
}

/** Past this many folders the list scrolls, so the menu stays short. */
const SCROLL_PAST = 8;

// The folders in each folder listed so far: there at once the next time, while they are asked for again.
const listed = new Map<string, Sub[]>();

/** The folders in each of `paths` (hidden ones left out), asked for once while the menu is open; undefined until they are known. */
export function useSubfolders(paths: string[]): (path: string) => Sub[] | undefined {
  const [, setRead] = useState(0);
  const asked = useRef(new Set<string>());
  const key = paths.join('\n');
  useEffect(() => {
    for (const p of paths) {
      if (asked.current.has(p)) continue;
      asked.current.add(p);
      void api<{ entries: Sub[] }>(`/api/fs/list?dirs=1&path=${encodeURIComponent(p)}`)
        .then(
          (r) => r.entries.map(({ name, path }) => ({ name, path })),
          // A folder that is gone, or can't be read, has none to offer.
          () => [],
        )
        .then((subs) => {
          listed.set(p, subs);
          setRead((n) => n + 1);
        });
    }
  }, [key]);
  return (p) => listed.get(p);
}

/** The name of the folder picked, when it is one inside the project's folder; null for the project's own (its top). */
export const folderName = (s: Pick<Space, 'folder'> | undefined, dir: string | undefined): string | null => (s && dir && dir !== s.folder ? basename(dir) : null);

/** A menu row with a second button at its end (beside it, not in it). Without `onMore` it is the row alone. */
export function RowWithMore({ children, label, icon, onMore }: { children: ReactNode; label: string; icon: ReactNode; onMore?: () => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <div className="min-w-0 flex-1">{children}</div>
      {onMore && (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={onMore}
          className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg max-sm:w-11"
        >
          {icon}
        </button>
      )}
    </div>
  );
}

/** A project's row in a menu of projects (`children`: its MenuItem), with the way to its folders when it has any. */
export function ProjectRow({ children, folders, onFolders }: { children: ReactNode; folders: Sub[] | undefined; onFolders: () => void }) {
  return (
    <RowWithMore label="Pick a folder in it" icon={<Folder size={14} />} onMore={folders?.length ? onFolders : undefined}>
      {children}
    </RowWithMore>
  );
}

/** The folders of a project, in its menu's place. `onPick`: the folder's path, or nothing for the top of the project's. */
export function FolderStep({ project, onBack, onPick }: { project: Pick<Space, 'name' | 'folder'>; onBack: () => void; onPick: (dir?: string) => void }) {
  // The folders gone into, the last the one shown.
  const [trail, setTrail] = useState<Sub[]>([]);
  const here = trail[trail.length - 1];
  const at = here?.path ?? project.folder;
  const folders = useSubfolders([at])(at);
  return (
    <>
      <MenuBack onClick={() => (here ? setTrail(trail.slice(0, -1)) : onBack())}>
        <span translate="no">{here ? here.name : project.name}</span>
      </MenuBack>
      <MenuItem icon={<FolderOpen size={14} />} onClick={() => onPick(here?.path)}>
        {here ? 'This folder' : <span translate="no">{tr(`Top of ${project.name}`)}</span>}
      </MenuItem>
      {!folders ? (
        <div className="flex justify-center py-3 text-fg-3">
          <Throbber />
        </div>
      ) : (
        <div className={cx(folders.length > SCROLL_PAST && 'max-h-[260px] overflow-y-auto')}>
          {folders.map((f) => (
            <RowWithMore key={f.path} label="Show the folders in it" icon={<ChevronRight size={14} />} onMore={() => setTrail([...trail, f])}>
              <MenuItem icon={<Folder size={14} />} onClick={() => onPick(f.path)}>
                <span translate="no">{f.name}</span>
              </MenuItem>
            </RowWithMore>
          ))}
        </div>
      )}
    </>
  );
}
