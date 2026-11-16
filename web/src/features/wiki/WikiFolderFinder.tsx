// Select or create a server-side folder using Hydor's existing folder and file APIs.
import { useState, type RefObject } from 'react';
import { FolderFinder } from '../../components/FolderPicker';
import { post } from '../../lib/api';
import { joinPath } from '../../lib/format';
import { toastError } from '../../lib/store';

/** Keep browsing separate from applying the chosen wiki location. */
export function WikiFolderFinder({ anchor, onPick }: { anchor: RefObject<HTMLElement | null>; onPick: (path: string) => void }) {
  const [folder, setFolder] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = !!folder && !!name.trim() && !/[/\\\0]/.test(name) && !['.', '..'].includes(name.trim());
  const create = async () => {
    if (!folder || !valid || busy) return;
    setBusy(true);
    try {
      const result = await post<{ path: string }>('/api/fs/mkdir', { path: joinPath(folder, name.trim()) });
      onPick(result.path);
    } catch (error) { toastError(error); }
    finally { setBusy(false); }
  };
  return <div>
    <FolderFinder value={folder} anchor={anchor} autoFocus groups={{ lead: 'Recent' }} onPick={(path) => { setFolder(path); setCreating(false); setName(''); }} />
    {folder && <div className="space-y-2 border-t border-line p-2">
      <div className="break-all text-xs text-fg-3" translate="no">{folder}</div>
      {creating && <input autoFocus aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void create(); }} className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-sm" />}
      <div className="flex justify-end gap-2">
        {creating ? <button type="button" disabled={!valid || busy} onClick={() => void create()} className="rounded-lg px-2 py-1 text-sm text-accent disabled:opacity-50">Create</button> : <button type="button" onClick={() => setCreating(true)} className="rounded-lg px-2 py-1 text-sm text-accent">New folder</button>}
        <button type="button" disabled={busy} onClick={() => onPick(folder)} className="rounded-lg bg-fg px-2 py-1 text-sm text-bg disabled:opacity-50">Use this folder</button>
      </div>
    </div>}
  </div>;
}
