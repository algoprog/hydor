// Asking for a second opinion (the session menu → Second opinion): who checks the work, the suggested
// reviewer from another company first, and which turn, the latest finished one first.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { OpinionOptions } from '@shared/opinion';
import { isConfidential } from '@shared/confidential';
import type { SessionSummary } from '@shared/types';
import { Button, Dialog, OptionRow, Throbber } from '../../components/ui';
import { api, enc, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { toast, toastError } from '../../lib/store';

export const useOpinionDialog = create<{ key: string | null; open: (key: string) => void; close: () => void }>((set) => ({
  key: null,
  open: (key) => set({ key }),
  close: () => set({ key: null }),
}));

/** Asks for a second opinion on a turn; the note shows under it at once. */
export async function askOpinion(sessionKey: string, o: { turn?: string; reviewer?: string }) {
  await post(`/api/opinion/${enc(sessionKey)}`, o);
}

export function OpinionDialog({ s }: { s: SessionSummary }) {
  const open = useOpinionDialog((x) => x.key === s.key);
  const close = useOpinionDialog((x) => x.close);
  const [opts, setOpts] = useState<OpinionOptions | null>(null);
  const [turn, setTurn] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setOpts(null);
    api<OpinionOptions>(`/api/opinion/${enc(s.key)}`)
      .then((o) => {
        setOpts(o);
        setTurn(o.turns[0]?.id ?? '');
        setReviewer(o.reviewers[0]?.id ?? '');
      })
      .catch((e) => {
        close();
        toastError(e);
      });
  }, [open, s.key]);
  const who = opts?.reviewers.find((r) => r.id === reviewer);
  const ask = async () => {
    setBusy(true);
    try {
      await askOpinion(s.key, { turn, reviewer });
      close();
      toast(`${who?.label ?? 'The reviewer'} is checking that turn; what it finds shows under it.`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Second opinion"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!turn || !reviewer || busy} onClick={ask}>
            Ask {who?.label ?? ''}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-fg-3">
        {isConfidential(s.extra)
          ? 'Another maker’s model on this computer checks a turn’s work against what you asked: this session is confidential, so models elsewhere don’t see it. What it finds shows under that turn.'
          : 'Another company’s model checks a turn’s work against what you asked: the files it changed, the commands it ran and its reply. What it finds shows under that turn, each point one click from the message box.'}
      </p>
      {!opts ? (
        <div className="flex justify-center py-8 text-fg-3">
          <Throbber />
        </div>
      ) : (
        <>
          <div className="mt-4 mb-1 text-[12.5px] font-medium text-fg-2">Who checks it</div>
          <div className="space-y-0.5">
            {opts.reviewers.map((r) => (
              <OptionRow key={r.id} label={r.label} hint={r.detail} selected={r.id === reviewer} onClick={() => setReviewer(r.id)} />
            ))}
          </div>
          {!opts.reviewers.length && <p className="text-[13px] text-fg-3">No model on this computer from another maker: add one in Settings → Models.</p>}
          <div className="mt-4 mb-1 text-[12.5px] font-medium text-fg-2">Which turn</div>
          {opts.turns.length ? (
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {opts.turns.map((t, i) => (
                <OptionRow
                  key={t.id}
                  label={t.text}
                  hint={[i === 0 ? 'The latest' : ago(t.at), t.files ? `${t.files} file${t.files === 1 ? '' : 's'} changed` : 'No files changed'].filter(Boolean).join(' · ')}
                  selected={t.id === turn}
                  onClick={() => setTurn(t.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-fg-3">No finished turn to check yet.</p>
          )}
        </>
      )}
    </Dialog>
  );
}
