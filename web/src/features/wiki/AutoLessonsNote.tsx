// A proposed lesson is displayed exactly as it will be saved; the user controls publication.
import { useState } from 'react';
import type { SessionNote } from '@shared/features';
import { Button } from '../../components/ui';
import { enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';

type Proposal = {
  status: 'proposed' | 'saved' | 'dismissed';
  preview: { target: string; path: string; content: string; sha256: string };
};

/** Let the user inspect the complete generated note before explicitly saving it. */
export function AutoLessonsNote({ note }: { note: SessionNote }) {
  const data = note.data as Proposal;
  const [busy, setBusy] = useState(false);
  if (!data || data.status === 'dismissed') return null;
  const action = async (name: 'save' | 'dismiss') => {
    setBusy(true);
    try { await post(`/api/wiki-lessons/${enc(note.id)}/${name}`, name === 'save' ? { sha256: data.preview.sha256 } : {}); }
    catch (error) { toastError(error); }
    finally { setBusy(false); }
  };
  return (
    <section className="rounded-xl border border-line bg-bg-1 p-3 text-[13px]">
      <div className="font-semibold">Lessons Learned suggestion</div>
      {data.status === 'saved' ? <div className="mt-1 text-fg-3">Saved to the wiki</div> : <>
        <p className="mt-1 text-fg-3">Review the complete suggestion before saving it.</p>
        <div className="mt-2 break-all text-xs text-fg-3" translate="no">{data.preview.target}/{data.preview.path}</div>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg-2 p-3 text-xs" translate="no">{data.preview.content}</pre>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void action('save')}>Save these lessons</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void action('dismiss')}>Dismiss</Button>
        </div>
      </>}
    </section>
  );
}
