// A template's folder of files, in its Edit: made where you say (an empty folder, or its own), then kept in step
// with it. Each change saved there comes here as a version by its folder; a mistake there is said here and
// changes nothing; a save here writes the folder again.
import { useEffect, useState } from 'react';
import type { AppDef } from '@shared/apps';
import { api, del, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { toast, toastError } from '../../lib/store';
import { Button, cx, inputCls } from '../../components/ui';
import { tr } from '../../i18n/runtime';

interface FolderState {
  folder: { path: string; error?: string } | null;
  suggested: string;
}

export function FolderBox({ app }: { app: AppDef }) {
  const [state, setState] = useState<FolderState | null>(null);
  const [want, setWant] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<FolderState>(`/api/apps/${enc(app.id)}/folder`).then(
      (s) => setState(s),
      () => {},
    );
  useEffect(() => {
    void load();
  }, [app.id]);
  // A mistake in it, or put right.
  useFeatureEvent('apps', ({ data }) => {
    const f = (data as { folder?: { id: string; error: string | null } } | undefined)?.folder;
    if (f?.id === app.id) setState((s) => (s?.folder ? { ...s, folder: { path: s.folder.path, ...(f.error ? { error: f.error } : {}) } } : s));
  });
  if (!state) return null;
  const make = async () => {
    setBusy(true);
    try {
      const r = await post<{ folder: FolderState['folder'] }>(`/api/apps/${enc(app.id)}/folder`, { path: want.trim() || state.suggested });
      setState({ ...state, folder: r.folder });
      toast(tr(`Its files are in ${r.folder?.path}`), 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  if (!state.folder)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input className={cx(inputCls, 'h-9 min-w-0 flex-1 font-mono text-[12.5px]')} placeholder={state.suggested} value={want} onChange={(e) => setWant(e.target.value)} translate="no" />
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void make()}>
          Make its folder
        </Button>
      </div>
    );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-bg-2 px-2 py-1.5 text-[12.5px]" translate="no">
          {state.folder.path}
        </code>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void del(`/api/apps/${enc(app.id)}/folder`).then(
              () => setState({ ...state, folder: null }),
              toastError,
            )
          }
        >
          Stop keeping it in step
        </Button>
      </div>
      {state.folder.error ? (
        <div className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-[12.5px]">
          <span>The folder has a mistake, so nothing here changed: </span>
          <span translate="no">{state.folder.error}</span>
        </div>
      ) : (
        <div className="text-[12.5px] text-fg-3">Each change saved there comes here as a version; a save here writes it there. app.json is the app, with a schema for your editor in .naget/.</div>
      )}
    </div>
  );
}
