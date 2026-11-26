// Making a folder for sessions (./folders.ts): one dialog, asked for from the sidebar's menus (the + on Folders and on
// Projects, a project's menu, a session's "Move to folder", the filter menu). Made, the folder shows opened, and the
// session it was made for goes in it.
import { useState } from 'react';
import { create } from 'zustand';
import type { SpaceView } from '@shared/spaces';
import type { SessionSummary } from '@shared/types';
import { Button, Dialog } from '../../components/ui';
import { useUI } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { createSessionFolder, moveToFolder } from './folders';

interface Ask {
  /** The project it goes in; none for one at the top level, for sessions in no project. */
  space?: SpaceView;
  /** A session to put in it once made. */
  moving?: SessionSummary;
}

const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }));

/** Asks for a new folder's name. */
export const openNewFolder = (ask: Ask = {}) => useAsk.setState({ ask });

/** Shows a folder opened, with what it is in: its project's group, and the section. */
export function showFolder(id: string, space?: string) {
  const ui = useUI.getState();
  ui.set({
    groupFolds: { ...ui.groupFolds, [`box:${id}`]: false, ...(space ? { [`space:${space}`]: false } : {}) },
    sidebarSectionFolds: { ...ui.sidebarSectionFolds, [space ? 'projects' : 'folders']: false },
  });
}

function NewFolderDialog({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (busy) return;
    if (!name.trim()) return setError('Give the folder a name');
    setBusy(true);
    try {
      const f = await createSessionFolder(name.trim(), ask.space?.id);
      showFolder(f.id, f.space);
      if (ask.moving) moveToFolder(ask.moving, f.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="New folder"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {ask.moving ? 'Create and move' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <input
          autoFocus
          value={name}
          maxLength={60}
          aria-label="Folder name"
          aria-invalid={!!error}
          aria-describedby="new-folder-note"
          placeholder="Folder name"
          onChange={(e) => (setName(e.target.value), setError(''))}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          className="h-9 w-full rounded-lg border border-line bg-bg-1 px-3 text-[14px] text-fg outline-none focus:border-accent/60"
        />
        {error ? (
          <p id="new-folder-note" role="alert" className="text-[12.5px] text-err">
            {error}
          </p>
        ) : (
          <p id="new-folder-note" className="text-[12.5px] text-fg-3">
            {ask.space ? tr(`A folder in ${ask.space.name}, for that project's sessions.`) : 'A folder in the sidebar for sessions that are in no project. A project can have folders of its own.'}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** Where the dialog shows: once, in the sidebar. */
export function NewFolderHost() {
  const ask = useAsk((s) => s.ask);
  return ask ? <NewFolderDialog ask={ask} onClose={() => useAsk.setState({ ask: null })} /> : null;
}
