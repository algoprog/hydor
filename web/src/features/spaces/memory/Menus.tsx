// The two menus of a project's Memory tab: Add (a note, files, a folder to keep up to date) and ⋯ (what the wiki does, the agents'
// prompts, reading the documents again, the settings), and the dialog of the wiki's recent updates.
import { useRef, useState, type ReactNode } from 'react';
import { Bot, FileText, FolderOpen, FolderPlus, Hammer, History, ListChecks, MoreHorizontal, Plus, RefreshCw, RotateCcw, ScrollText, Settings, Stethoscope, StickyNote, Trash2, Upload, FilePlus } from 'lucide-react';
import type { Space } from '@shared/spaces';
import type { WikiUpdate } from '@shared/wiki';
import { FolderFinder } from '../../../components/FolderPicker';
import { Button, Dialog, IconButton, MenuBack, MenuItem, MenuSep, Popover } from '../../../components/ui';
import { enc, post } from '../../../lib/api';
import { go } from '../../../lib/nav';
import { toast, toastError } from '../../../lib/store';
import { pickedFromInput, type PickedFile } from '../../../lib/upload';
import { tr } from '../../../i18n/runtime';
import { placeUrl } from '../../memory/MemoryNotes';
import { goFolder } from '../../files/actions';
import { BuildDialog, RebuildDialog, RestoreDialog } from '../../wiki/WikiActions';
import type { BuildOffer, WikiJob } from '../../wiki/wikiJob';
import { UpdateRow } from '../../wiki/WikiUpdates';
import { startInSpace } from '../parts';
import type { SpaceMemory } from '../../wiki/spaceMemory';

/** A hidden file input and what opens it: files chosen on this computer. */
export function useFilePicker(onFiles: (picked: PickedFile[]) => void): [ReactNode, () => void] {
  const input = useRef<HTMLInputElement>(null);
  const node = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      onChange={(e) => {
        if (e.target.files) onFiles(pickedFromInput(e.target.files));
        e.target.value = '';
      }}
    />
  );
  return [node, () => input.current?.click()];
}

/** A link-like button that opens the folder finder: a folder on this computer to read and keep up to date. */
export function AddFolder({ onPick, children, className }: { onPick: (path: string) => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button ref={ref} size="sm" variant="ghost" icon={<FolderPlus size={14} />} className={className} onClick={() => setOpen((o) => !o)}>
        {children}
      </Button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={340} title="A folder to read, and keep up to date">
        <FolderFinder
          value={null}
          autoFocus
          anchor={ref}
          onPick={(p) => {
            setOpen(false);
            onPick(p);
          }}
        />
      </Popover>
    </>
  );
}

/** The Add button and its menu: a note, files from this computer, a folder on it that is read and kept up to date. */
export function AddMenu({ onNote, onFiles, onFolder }: { onNote: () => void; onFiles: (picked: PickedFile[]) => void; onFolder: (path: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [input, pickFiles] = useFilePicker(onFiles);
  const [menu, setMenu] = useState(false);
  const [folder, setFolder] = useState(false);
  return (
    <>
      <Button ref={ref} variant="primary" icon={<Plus size={15} />} aria-label="Add" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((o) => !o)} className="max-sm:w-9 max-sm:px-0">
        <span className="max-sm:hidden">Add</span>
      </Button>
      <Popover anchor={ref} open={menu} onClose={() => setMenu(false)} align="end" width={270}>
        <MenuItem
          icon={<StickyNote size={15} />}
          onClick={() => {
            setMenu(false);
            onNote();
          }}
        >
          A note…
        </MenuItem>
        <MenuItem
          icon={<FilePlus size={15} />}
          onClick={() => {
            setMenu(false);
            pickFiles();
          }}
        >
          Files…
        </MenuItem>
        <MenuItem
          icon={<FolderPlus size={15} />}
          onClick={() => {
            setMenu(false);
            setFolder(true);
          }}
        >
          A folder to keep up to date…
        </MenuItem>
      </Popover>
      <Popover anchor={ref} open={folder} onClose={() => setFolder(false)} align="end" width={340} title="A folder to read, and keep up to date">
        <FolderFinder
          value={null}
          autoFocus
          anchor={ref}
          onPick={(p) => {
            setFolder(false);
            onFolder(p);
          }}
        />
      </Popover>
      {input}
    </>
  );
}

/** The ⋯ menu, in one place: the wiki's jobs and updates, an agent's help with it, the documents, the settings, the deleted notes. */
export function MoreMenu({
  s,
  memory,
  wikiOn,
  job,
  offer,
  refresh,
  hasDocs,
  onUpdates,
  onSettings,
  onRead,
}: {
  s: Space;
  memory: SpaceMemory;
  wikiOn: boolean;
  job: WikiJob | null;
  offer: BuildOffer | null;
  refresh: () => void;
  hasDocs: boolean;
  onUpdates: () => void;
  onSettings: () => void;
  onRead: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<false | 'main' | 'agent'>(false);
  const [dialog, setDialog] = useState<null | 'build' | 'rebuild' | 'restore'>(null);
  const running = job?.state === 'running';
  const root = memory.wiki?.root;
  const pick = (f: () => void) => () => {
    setMenu(false);
    f();
  };
  const update = async () => {
    try {
      await post(`/api/projects/${enc(s.id)}/wiki/update`, {});
      toast(tr('Updating the wiki now'));
    } catch (e) {
      toastError(e);
    }
    refresh();
  };
  return (
    <>
      <IconButton ref={ref} label="More" active={!!menu} onClick={() => setMenu((o) => (o ? false : 'main'))} aria-haspopup="menu" aria-expanded={!!menu}>
        <MoreHorizontal size={18} />
      </IconButton>
      <Popover anchor={ref} open={!!menu} onClose={() => setMenu(false)} align="end" width={290}>
        {menu === 'agent' ? (
          <>
            <MenuBack onClick={() => setMenu('main')}>Ask an agent to</MenuBack>
            <MenuItem icon={<Stethoscope size={15} />} onClick={pick(() => startInSpace(s, tr("Check this project's wiki for missing sources, broken links, orphaned articles and inconsistent indexes. Show the findings without changing files.")))}>
              Check the wiki
            </MenuItem>
            <MenuItem icon={<FileText size={15} />} onClick={pick(() => startInSpace(s, tr("Help me add a source to this project's wiki. First ask me for the document or URL; do not add anything until I choose the source.")))}>
              Add a source
            </MenuItem>
            <MenuItem icon={<ListChecks size={15} />} onClick={pick(() => startInSpace(s, tr("Help me adopt a plan into this project's wiki. First ask me for the plan, then show existing plans and a preview. Save only after my approval; start implementation only on my separate instruction.")))}>
              Adopt a plan
            </MenuItem>
          </>
        ) : (
          <>
            {wikiOn && (
              <>
                <MenuItem icon={<RefreshCw size={15} />} disabled={running} onClick={pick(() => void update())}>
                  Update the wiki now
                </MenuItem>
                {offer?.fresh ? (
                  <MenuItem icon={<Hammer size={15} />} disabled={running} onClick={pick(() => setDialog('build'))}>
                    Build the wiki from history…
                  </MenuItem>
                ) : (
                  <MenuItem icon={<History size={15} />} disabled={running} onClick={pick(() => setDialog('rebuild'))}>
                    Rebuild the wiki…
                  </MenuItem>
                )}
                {!!job?.archives.length && (
                  <MenuItem icon={<RotateCcw size={15} />} disabled={running} onClick={pick(() => setDialog('restore'))}>
                    Restore an earlier wiki…
                  </MenuItem>
                )}
                <MenuItem icon={<ScrollText size={15} />} onClick={pick(onUpdates)}>
                  Wiki updates…
                </MenuItem>
                <MenuItem icon={<Bot size={15} />} submenu onClick={() => setMenu('agent')}>
                  Ask an agent to
                </MenuItem>
                <MenuSep />
              </>
            )}
            {hasDocs && (
              <MenuItem icon={<Upload size={15} />} onClick={pick(onRead)}>
                Read the documents again
              </MenuItem>
            )}
            {wikiOn && root && (
              <MenuItem icon={<FolderOpen size={15} />} onClick={pick(() => goFolder(root))}>
                Open the wiki’s folder
              </MenuItem>
            )}
            <MenuItem icon={<Settings size={15} />} onClick={pick(onSettings)}>
              Memory settings
            </MenuItem>
            <MenuItem icon={<Trash2 size={15} />} onClick={pick(() => go(placeUrl({ kind: 'deleted' })))}>
              Deleted notes
            </MenuItem>
          </>
        )}
      </Popover>
      {dialog === 'build' && <BuildDialog id={s.id} onClose={() => setDialog(null)} onStarted={refresh} />}
      {dialog === 'rebuild' && <RebuildDialog id={s.id} onClose={() => setDialog(null)} onStarted={refresh} />}
      {dialog === 'restore' && job && <RestoreDialog id={s.id} archives={job.archives} onClose={() => setDialog(null)} onDone={refresh} />}
    </>
  );
}

/** What new and changed documents and the project's work did to its memory lately, as the wiki's own list shows it. */
export function UpdatesDialog({ updates, onClose, onOpen }: { updates: WikiUpdate[]; onClose: () => void; onOpen: (path: string) => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr('Wiki updates')}
      width={560}
      footer={
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {updates.length ? (
        <ul className="-mx-4 divide-y divide-line">
          {updates.map((u) => (
            <UpdateRow
              key={u.id}
              u={u}
              onOpen={(p) => {
                onClose();
                onOpen(p);
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-3">Nothing has been added to the wiki lately.</p>
      )}
    </Dialog>
  );
}
