// Add a web app from a folder: the folder picker as the other pages have it, and what the server says when the folder is not
// one (no hydor.json, already added, inside Hydor's own data) shown as it is, under the field.
import { useEffect, useState } from 'react';
import { ApiError, post } from '../../lib/api';
import { toast, useApp } from '../../lib/store';
import { FolderPicker } from '../../components/FolderPicker';
import { Button, Dialog, useMediaQuery } from '../../components/ui';
import type { WebApp } from '@shared/webapps';
import { tr } from '../../i18n/runtime';

const expand = (p: string, home: string) => (p === '~' ? home : p.startsWith('~/') ? home + p.slice(1) : p).replace(/(.)\/+$/, '$1');

export function AddWebApp({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (a: WebApp) => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [dir, setDir] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // On a phone the field is not focused for the person: focusing it opens the list of folders, which fills the screen and covers the button that was pressed.
  const phone = useMediaQuery('(max-width: 639px)');
  useEffect(() => {
    if (open) {
      setDir('');
      setError('');
    }
  }, [open]);
  const add = async (p = dir) => {
    const folder = expand(p.trim(), home);
    if (!folder || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await post<{ app: WebApp }>('/api/webapps', { folder });
      onAdded(r.app);
      onClose();
      toast(tr(`Added ${r.app.name}`), 'ok');
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'It could not be added.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a web app from a folder"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !dir.trim()} onClick={() => void add()}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">The folder of an app that says how Hydor runs it, in a hydor.json.</p>
      <FolderPicker
        value={dir}
        onChange={(v) => {
          setDir(v);
          setError('');
        }}
        onPick={(p) => void add(p)}
        autoFocus={!phone}
      />
      {error && (
        <div role="alert" translate="no" className="mt-3 rounded-xl border border-err/35 bg-err/5 px-3 py-2.5 text-[13px] leading-snug text-fg-2">
          {error}
        </div>
      )}
    </Dialog>
  );
}
