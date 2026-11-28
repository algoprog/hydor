// A project's one menu (its folder in Files, only its sessions in the sidebar, sharing it with people, sending it to another machine and, once kept in sync, Sync now and Stop syncing, deleting it) and
// the deleting: in the project's window (SpacePage.tsx) and on the Projects page's cards, which load without the window.
import { useEffect, useRef, useState } from 'react';
import { FolderOpen, ListFilter, MoreHorizontal, RefreshCw, RefreshCwOff, Send, Trash2, UserPlus } from 'lucide-react';
import { isGroup, type FoundIn, type Space } from '@shared/spaces';
import { IconButton, MenuItem, MenuSep, Popover, useConfirm } from '../../components/ui';
import { del, enc } from '../../lib/api';
import { closeProject } from '../../lib/nav';
import { canReveal, reveal, revealLabel } from '../../lib/reveal';
import { machineId } from '../../lib/machine';
import { useMachines } from '../../lib/machines';
import { toastError, useUI } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { goFolder } from '../files/actions';
import { openSendDialog } from './SendHost';
import { openShareDialog } from './ShareHost';
import { loadSpaces } from './state';
import { stopSync, syncNow, useKeepsLink } from './SyncMark';

/** The confirm's body for deleting a project: a project Hydor found says so, since it would find it again in the programs' sessions. */
function deleteBody(found: FoundIn[] | undefined) {
  const claude = !!found?.includes('claude');
  const codex = !!found?.includes('codex');
  if (claude && codex) return 'Its sessions, folder, files, documents and skills stay. The sessions, folder and the things kept in it just no longer belong to a project, its knowledge moves to the shared knowledge, and its skills to your skill library. Hydor found it in Claude Code’s and Codex’s sessions and won’t make it again.';
  if (claude) return 'Its sessions, folder, files, documents and skills stay. The sessions, folder and the things kept in it just no longer belong to a project, its knowledge moves to the shared knowledge, and its skills to your skill library. Hydor found it in Claude Code’s sessions and won’t make it again.';
  if (codex) return 'Its sessions, folder, files, documents and skills stay. The sessions, folder and the things kept in it just no longer belong to a project, its knowledge moves to the shared knowledge, and its skills to your skill library. Hydor found it in Codex’s sessions and won’t make it again.';
  return 'Its sessions, folder, files, documents and skills stay. The sessions, folder and the things kept in it just no longer belong to a project, its knowledge moves to the shared knowledge, and its skills to your skill library.';
}

/** Asks, then deletes the space and closes its window (its sessions, folder, documents and skills stay). */
export async function deleteSpace(s: Space, confirm: ReturnType<typeof useConfirm>[0]) {
  const ok = await confirm({
    title: tr(`Delete the ${s.name} project?`),
    body: deleteBody(s.found),
    confirm: 'Delete',
    danger: true,
  });
  if (!ok) return;
  try {
    await del(`/api/projects/${enc(s.id)}`);
  } catch (e) {
    toastError(e);
    return;
  }
  loadSpaces();
  closeProject();
}

// ---- the menu ---------------------------------------------------------------------------------------------------

/** The space's one menu: its folder in Files, only its sessions in the sidebar, sharing it with people, and deleting it (in the project's window, and on the Projects page's card). */
export function SpaceMenu({ s, onOpen }: { s: Space; onOpen?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  // The Projects page's card keeps its buttons showing while the menu is open.
  useEffect(() => onOpen?.(open), [open]);
  const filter = useUI((x) => x.spaceFilter);
  const [confirm, confirmNode] = useConfirm();
  // Another machine to send it to: this server's own counts when the page shows another machine, and on this server's own
  // pages so do the machines that use it and are connected now (they run the sending themselves).
  const others = useMachines((x) => x.list.filter((m) => m.id !== machineId).length + (machineId && x.self ? 1 : 0) + (machineId ? 0 : x.clients.length));
  const keeper = useKeepsLink(s.sync);
  const pick = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <>
      <IconButton ref={ref} label="More" active={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={18} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={290} title={<span translate="no">{s.name}</span>}>
        <MenuItem icon={<FolderOpen size={15} />} onClick={pick(() => goFolder(s.folder))}>
          Open its folder in Files
        </MenuItem>
        {canReveal() && (
          <MenuItem icon={<FolderOpen size={15} />} onClick={pick(() => reveal(s.folder))}>
            {revealLabel()}
          </MenuItem>
        )}
        <MenuItem icon={<ListFilter size={15} />} checked={filter === s.id} onClick={pick(() => useUI.getState().set({ spaceFilter: filter === s.id ? null : s.id }))}>
          Only its sessions in the sidebar
        </MenuItem>
        <MenuItem icon={<UserPlus size={15} />} onClick={pick(() => openShareDialog(s))}>
          Share with people
        </MenuItem>
        {!isGroup(s) && others > 0 && (
          <MenuItem icon={<Send size={15} />} onClick={pick(() => openSendDialog(s))}>
            Send to another machine…
          </MenuItem>
        )}
        {s.sync && keeper && (
          <MenuItem icon={<RefreshCw size={15} />} disabled={s.sync.state === 'syncing'} onClick={pick(() => void syncNow(s.sync!, s.sync!.state === 'held'))}>
            {s.sync.state === 'held' ? 'Sync anyway' : 'Sync now'}
          </MenuItem>
        )}
        {s.sync && (
          <MenuItem icon={<RefreshCwOff size={15} />} onClick={pick(() => void stopSync(s, s.sync!, keeper))}>
            Stop syncing
          </MenuItem>
        )}
        <MenuSep />
        <MenuItem icon={<Trash2 size={15} />} danger onClick={pick(() => void deleteSpace(s, confirm))}>
          Delete the project
        </MenuItem>
      </Popover>
      {confirmNode}
    </>
  );
}
