// A generated contract remains a proposal until the user accepts the displayed content.
import { useState } from 'react';
import type { SessionNote } from '@shared/features';
import { Button } from '../../components/ui';
import { enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';

type Proposal = { status: 'proposed' | 'saved' | 'dismissed'; target: string; path: string; hash: string; content: string; original?: string };

/** Show the complete before and after together with the exact target. */
export function AutoContractNote({ note }: { note: SessionNote }) {
  const data = note.data as Proposal;
  const [busy, setBusy] = useState(false);
  const [savedHere, setSavedHere] = useState(false);
  if (!data || data.status === 'dismissed') return null;
  const action = async (name: 'save' | 'dismiss') => {
    setBusy(true);
    try {
      const result = await post<{ noteUpdated?: boolean }>(`/api/wiki-contracts/${enc(note.id)}/${name}`, name === 'save' ? { sha256: data.hash } : {});
      if (name === 'save') { setSavedHere(true); if (result.noteUpdated === false) toastError(new Error('Contract saved, but its suggestion card could not be updated.')); }
    }
    catch (error) { toastError(error); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-line bg-bg-1 p-3 text-[13px]">
    <div className="font-semibold">Project contract suggestion</div>
    {data.status === 'saved' || savedHere ? <div className="mt-1 text-fg-3">Saved to the wiki</div> : <>
      <p className="mt-1 text-fg-3">Review the complete contract before accepting it.</p>
      <div className="mt-2 break-all text-xs text-fg-3" translate="no">{data.target}/{data.path}</div>
      {data.original && <><div className="mt-2 font-semibold">Previous content</div><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg-2 p-3 text-xs" translate="no">{data.original}</pre></>}
      <div className="mt-2 font-semibold">Proposed content</div>
      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg-2 p-3 text-xs" translate="no">{data.content}</pre>
      <div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => void action('save')}>Accept contract</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void action('dismiss')}>Dismiss</Button></div>
    </>}
  </section>;
}
