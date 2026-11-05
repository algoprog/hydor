// Adding files to a space, wherever files show: the spaces to pick from (in a menu's place, as its submenu),
// and the ⋯ of a file shown outside the Files page (a file's window over a session, an agent's file card,
// a picture it made), with Start a session with it, Add to a space and Copy path.
import { useRef, useState, type ReactNode } from 'react';
import { Boxes, Copy, Ellipsis, FolderOpen, LibraryBig, MessageSquarePlus, Plus, Search } from 'lucide-react';
import type { Space } from '@shared/spaces';
import { cx, IconButton, MenuBack, MenuItem, MenuSep, Popover, Throbber } from '../../components/ui';
import { dirname } from '../../lib/format';
import { NewSpaceDialog, SpaceMark } from '../spaces/parts';
import { useKeepIn } from '../spaces/SpacePick';
import { useSpaces } from '../spaces/state';
import { addToSpace, copyPaths, goFolder, itemOf, LIBRARY_FILE, saveToLibrary, startSession, type Item } from './actions';

/** Up to this many spaces show at once; more, and a field finds the one wanted. */
const SHOWN = 7;

/** The spaces to add to, in a menu: a field to find one when there are many, then New space. */
export function SpaceChoices({ onPick, onNew }: { onPick: (s: Space) => void; onNew?: () => void }) {
  const spaces = useSpaces();
  const [q, setQ] = useState('');
  if (!spaces)
    return (
      <div className="flex justify-center py-3 text-fg-3">
        <Throbber />
      </div>
    );
  const many = spaces.length > SHOWN;
  const t = q.trim().toLowerCase();
  const list = (t ? spaces.filter((s) => s.name.toLowerCase().includes(t)) : spaces).slice(0, SHOWN);
  return (
    <>
      {many && (
        <div className="relative mb-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && list[0] && onPick(list[0])}
            placeholder="Find a project"
            aria-label="Find a project"
            className="h-8.5 w-full rounded-lg bg-bg-2 pr-2.5 pl-8 text-[13px] outline-none placeholder:text-fg-3 max-sm:h-11 max-sm:text-[15px]"
          />
        </div>
      )}
      {list.map((s) => (
        <MenuItem key={s.id} icon={<SpaceMark s={s} size={15} />} onClick={() => onPick(s)}>
          <span translate="no">{s.name}</span>
        </MenuItem>
      ))}
      {!spaces.length && <div className="px-2.5 py-1.5 text-[12.5px] text-fg-3">No projects yet: make one, and its folder holds the files.</div>}
      {t && !list.length && <div className="px-2.5 py-1.5 text-[12.5px] text-fg-3">No project by that name</div>}
      {onNew && (
        <>
          <MenuSep />
          <MenuItem icon={<Plus size={14} />} onClick={onNew}>
            New project
          </MenuItem>
        </>
      )}
    </>
  );
}

/**
 * A menu's "Add to a space" with its submenu, for `items`: the menu shows `main` until it is picked, then
 * the spaces in its place. Picking one copies them into its folder; New space makes one for them first.
 */
export function useSpaceMenu(items: () => Item[], close: () => void) {
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<Item[] | null>(null);
  const entry = (
    <MenuItem icon={<Boxes size={14} />} submenu onClick={() => setOpen(true)}>
      Add to a project
    </MenuItem>
  );
  const sub = open && (
    <>
      <MenuBack onClick={() => setOpen(false)}>Add to a project</MenuBack>
      <SpaceChoices
        onPick={(s) => {
          setOpen(false);
          close();
          void addToSpace(items(), s);
        }}
        onNew={() => {
          setMade(items());
          setOpen(false);
          close();
        }}
      />
    </>
  );
  const dialog = <NewSpaceDialog open={!!made} onClose={() => setMade(null)} onMade={(s) => made && void addToSpace(made, s)} />;
  return { entry, sub, dialog, reset: () => setOpen(false) };
}

/**
 * The ⋯ of a file shown outside the Files page: Start a session with it, Add to a space, Show in Files
 * (unless the place has its own way there) and Copy path. `extra` goes first.
 */
export function FileMore({
  path,
  size,
  dir,
  inFiles = true,
  extra,
  sessionKey,
  className,
  iconSize = 16,
  small,
}: {
  path: string;
  size?: number;
  dir?: boolean;
  inFiles?: boolean;
  extra?: ReactNode;
  /** The session it was handed over in: Save to Library puts the copy in its project. */
  sessionKey?: string;
  className?: string;
  iconSize?: number;
  small?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const item = itemOf(path, dir, size);
  const close = () => setOpen(false);
  const space = useSpaceMenu(() => [item], close);
  // Save to Library asks which project the copy goes in when there are projects (the session's first), as Keep does.
  const lib = useKeepIn(sessionKey, (to) => void saveToLibrary(item, sessionKey, to));
  return (
    <>
      <IconButton
        ref={ref}
        label="More"
        size={small ? 'sm' : 'md'}
        active={open}
        onClick={() => {
          space.reset();
          setOpen((o) => !o);
        }}
        className={cx(className)}
      >
        <Ellipsis size={iconSize} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={250} title={item.name}>
        {space.sub || (
          <>
            {extra}
            <MenuItem icon={<MessageSquarePlus size={14} />} onClick={() => (close(), startSession([item]))}>
              Start a session with it
            </MenuItem>
            {space.entry}
            {!dir && LIBRARY_FILE.test(path) && (
              <MenuItem icon={<LibraryBig size={14} />} onClick={() => (close(), lib.ask(ref.current))}>
                Save to Library
              </MenuItem>
            )}
            <MenuSep />
            {inFiles && (
              <MenuItem icon={<FolderOpen size={14} />} onClick={() => (close(), goFolder(dirname(path), path))}>
                Show in Files
              </MenuItem>
            )}
            <MenuItem icon={<Copy size={14} />} onClick={() => (close(), copyPaths([item]))}>
              Copy path
            </MenuItem>
          </>
        )}
      </Popover>
      {space.dialog}
      {lib.menu}
    </>
  );
}
