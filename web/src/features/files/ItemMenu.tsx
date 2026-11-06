// The menu of a file or folder (or of several picked together), from its ⋯, a right-click or the bar of what
// is picked: open it, start a session with it, add it to a space, rename, duplicate, move or copy it into
// another folder, copy its path, download it, delete it. Moving and copying pick the folder in the menu's
// place, as the start page's folder menu does.
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Copy, CopyPlus, Download, FileText, FolderInput, FolderOpen, FolderOutput, MessageSquarePlus, Pencil, Pin, PinOff, SlidersHorizontal, SquareTerminal, Trash2 } from 'lucide-react';
import type { Space } from '@shared/spaces';
import { FolderFinder, type FolderChoice } from '../../components/FolderPicker';
import { MenuBack, MenuItem, MenuSep, Popover, useConfirm, useIsMobile } from '../../components/ui';
import { dirname, tildify } from '../../lib/format';
import { useApp } from '../../lib/store';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { copyInto, copyPaths, download, duplicate, goFolder, moveInto, newSessionIn, startSession, trash, type Item } from './actions';
import { setPinned, usePinned } from './prefs';
import { useSpaceMenu } from './SpaceMenu';
import { EDITABLE, editFile } from '../mediaedit/open';
import { EDITABLE_VIDEO, editVideoFile } from '../mediaedit/video/open';

/** The spaces and pinned folders, first in a folder menu (a space by its mark and name). */
export function useFolderLead(pick: (path: string) => void, at?: string | null): FolderChoice[] {
  const spaces = useSpaces();
  const pins = usePinned();
  const home = useApp((s) => s.boot?.home);
  return [
    ...(spaces ?? []).map((s: Space) => ({
      key: `sp:${s.id}`,
      icon: <SpaceMark s={s} size={15} />,
      name: s.name,
      where: 'Project',
      title: tildify(s.folder, home),
      on: at === s.folder,
      pick: () => pick(s.folder),
      path: s.folder,
    })),
    ...(pins ?? []).map((p) => ({
      key: `pin:${p}`,
      icon: <Pin size={15} />,
      name: p.split('/').pop() || p,
      where: tildify(dirname(p), home),
      title: tildify(p, home),
      on: at === p,
      pick: () => pick(p),
      path: p,
    })),
  ];
}

export function ItemMenu({
  items,
  anchor,
  open,
  onClose,
  after,
  onOpen,
  onRename,
  showFolder,
  extra,
}: {
  items: Item[];
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** After a change: the list reads its folder again. */
  after?: () => void;
  onOpen?: (item: Item) => void;
  /** Renames in place (the folder view); without it, no Rename. */
  onRename?: (item: Item) => void;
  /** "Show in its folder": where the item is not shown in its folder (search, recent files). */
  showFolder?: boolean;
  extra?: ReactNode;
}) {
  const [sub, setSub] = useState<null | 'move' | 'copy'>(null);
  const [confirm, confirmNode] = useConfirm();
  // Keys to press, where there is a keyboard.
  const keys = !useIsMobile();
  const pins = usePinned();
  const space = useSpaceMenu(() => items, onClose);
  useEffect(() => {
    if (!open) return;
    setSub(null);
    space.reset();
  }, [open]);
  const one = items.length === 1 ? items[0] : null;
  const dirOnly = one?.dir;
  const from = one ? dirname(one.path) : items[0] ? dirname(items[0].path) : null;
  const lead = useFolderLead((p) => pickFolder(p), from);
  const pickFolder = (dir: string) => {
    const how = sub;
    onClose();
    void (how === 'copy' ? copyInto(items, dir, after) : moveInto(items, dir, after));
  };
  const act = (f: () => void) => () => {
    onClose();
    f();
  };
  return (
    <>
      <Popover anchor={anchor} open={open && items.length > 0} onClose={onClose} width={sub ? 320 : 248} title={one ? one.name : `${items.length} items`}>
        {sub ? (
          <>
            <MenuBack onClick={() => setSub(null)}>{sub === 'copy' ? 'Copy to' : 'Move to'}</MenuBack>
            <FolderFinder value={from} onPick={pickFolder} lead={lead} autoFocus anchor={anchor} />
          </>
        ) : (
          space.sub || (
            <>
              {one && onOpen && (
                <MenuItem icon={one.dir ? <FolderOpen size={14} /> : <FileText size={14} />} onClick={act(() => onOpen(one))}>
                  Open
                </MenuItem>
              )}
              {one && !one.dir && EDITABLE.test(one.name) && (
                <MenuItem icon={<SlidersHorizontal size={14} />} onClick={act(() => void editFile(one.path, { after: () => after?.() }))}>
                  Edit the picture
                </MenuItem>
              )}
              {one && !one.dir && EDITABLE_VIDEO.test(one.name) && (
                <MenuItem icon={<SlidersHorizontal size={14} />} onClick={act(() => void editVideoFile(one.path, { after: () => after?.() }))}>
                  Edit the video
                </MenuItem>
              )}
              {showFolder && one && (
                <MenuItem icon={<FolderOpen size={14} />} onClick={act(() => goFolder(dirname(one.path), one.path))}>
                  Show in its folder
                </MenuItem>
              )}
              {dirOnly ? (
                <MenuItem icon={<MessageSquarePlus size={14} />} onClick={act(() => newSessionIn(one.path))}>
                  New session in this folder
                </MenuItem>
              ) : (
                <MenuItem icon={<MessageSquarePlus size={14} />} onClick={act(() => startSession(items))}>
                  {one ? 'Start a session with it' : 'Start a session with them'}
                </MenuItem>
              )}
              {space.entry}
              {dirOnly && (
                <MenuItem icon={pins?.includes(one.path) ? <PinOff size={14} /> : <Pin size={14} />} onClick={act(() => void setPinned(one.path, !pins?.includes(one.path)))}>
                  {pins?.includes(one.path) ? 'Unpin from Places' : 'Pin to Places'}
                </MenuItem>
              )}
              <MenuSep />
              {one && onRename && (
                <MenuItem icon={<Pencil size={14} />} hint={keys ? 'F2' : undefined} onClick={act(() => onRename(one))}>
                  Rename
                </MenuItem>
              )}
              {one && (
                <MenuItem icon={<CopyPlus size={14} />} onClick={act(() => void duplicate(one, after))}>
                  Duplicate
                </MenuItem>
              )}
              <MenuItem icon={<FolderInput size={14} />} submenu onClick={() => setSub('move')}>
                Move to
              </MenuItem>
              <MenuItem icon={<FolderOutput size={14} />} submenu onClick={() => setSub('copy')}>
                Copy to
              </MenuItem>
              <MenuSep />
              {dirOnly && (
                <MenuItem icon={<SquareTerminal size={14} />} onClick={act(() => openTerminalAt(one.path))}>
                  Open a terminal here
                </MenuItem>
              )}
              <MenuItem icon={<Copy size={14} />} onClick={act(() => copyPaths(items))}>
                {one ? 'Copy path' : 'Copy paths'}
              </MenuItem>
              <MenuItem icon={<Download size={14} />} onClick={act(() => download(items))}>
                {one && !one.dir ? 'Download' : 'Download as .zip'}
              </MenuItem>
              {extra}
              <MenuSep />
              <MenuItem danger icon={<Trash2 size={14} />} hint={keys ? 'Del' : undefined} onClick={act(() => void trash(items, confirm, after))}>
                Delete
              </MenuItem>
            </>
          )
        )}
      </Popover>
      {space.dialog}
      {confirmNode}
    </>
  );
}
