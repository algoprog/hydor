// A Jupyter notebook kept in the Library, in the notebook page's own view: its cells and outputs, edited and run here
// in a folder of its own in the app's data folder (GET /api/pages/:id/notebook says which file its kernel runs from;
// POST writes the notebook there before a kernel starts), saved as the Library's versions, with the Library's bar
// around it, and Ask about the whole notebook or the cell picked.
import { useEffect, useState } from 'react';
import { api, enc, post } from '../../../lib/api';
import NotebookView from '../../notebook/NotebookView';
import type { ModelEditorProps } from '../kinds';

export function NotebookEditor({ doc, pageId, readOnly, onSave, lead, tail, band, savedNote, onDirty, onAsk, onScopes, saveNowRef }: ModelEditorProps<unknown>) {
  const [run, setRun] = useState<{ path: string; savedAt: number } | null>(null);
  useEffect(() => {
    let alive = true;
    setRun(null);
    api<{ path: string; savedAt: number }>(`/api/pages/${enc(pageId)}/notebook`).then(
      (r) => alive && setRun(r),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [pageId]);
  return (
    <NotebookView
      path={run?.path ?? ''}
      onDirty={onDirty}
      library={{
        doc,
        savedAt: run?.savedAt ?? 0,
        readOnly,
        onSave,
        prepare: async () => {
          await post(`/api/pages/${enc(pageId)}/notebook`);
        },
        lead,
        tail,
        band,
        savedNote,
        onAsk,
        onScopes,
        saveNowRef,
      }}
    />
  );
}
