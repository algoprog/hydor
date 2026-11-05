// The conversation's cards about signatures, among the agent's other approvals: one where you draw (or type, or upload)
// the signature an agent asked for and keep it under a name, saved here first so the answer the agent gets carries its
// id alone; and one showing where an agent would place one (the page and the spot, drawn), to allow once, allow for the
// rest of the session, or deny. They show at once, framed as the other approval cards are.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Signature } from 'lucide-react';
import { defaultSignatureName, signatureName, type SignatureAskCard, type SignatureView } from '@shared/signatures';
import type { ApprovalRequest } from '@shared/types';
import { api, enc } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, inputCls } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { Elapsed } from '../session/items';
import { SignaturePad, type PadHandle } from './Pad';

export interface CardProps {
  a: ApprovalRequest;
  sessionKey: string;
  id?: string;
  /** The machine the session is on, when the page shows another's (the inbox). */
  base?: string;
  onDone?: () => void;
}

/** The answer to the card, as the other approval cards send theirs. */
const answer = (p: CardProps, decision: string, form?: Record<string, string>) => api(`/api/sessions/${enc(p.sessionKey)}/approvals/${enc(p.a.id)}`, { method: 'POST', base: p.base, body: { decision, form } });

function Frame({ p, children }: { p: CardProps; children: ReactNode }) {
  return (
    <div id={p.id} className="my-2 overflow-hidden rounded-xl border border-warn/45 bg-panel shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_10%,transparent)]">
      <div className="flex items-center gap-2 border-b border-line bg-warn/8 px-3 py-2">
        <Signature size={15} className="shrink-0 text-warn" />
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.a.title}</div>
        <span className="shrink-0 text-[11px] text-fg-3">
          waiting <Elapsed since={p.a.createdAt} />
        </span>
      </div>
      <div className="space-y-3 px-3 py-3">{children}</div>
    </div>
  );
}

function AskCard({ p, ask }: { p: CardProps; ask: SignatureAskCard }) {
  const [name, setName] = useState(ask.name);
  const [keep, setKeep] = useState(true);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const pad = useRef<PadHandle>(null);
  const onHas = useCallback((v: boolean) => setHas(v), []);
  const save = async () => {
    setBusy(true);
    try {
      const picture = await pad.current?.picture();
      if (!picture) {
        toast(tr('Draw, type or upload a signature first'), 'error');
        setBusy(false);
        return;
      }
      // Kept here first: the agent's answer names it, and never carries the picture.
      const r = await api<{ signature: SignatureView }>('/api/signatures', {
        method: 'POST',
        base: p.base,
        body: { name: signatureName(name) || tr(defaultSignatureName(ask.kind)), kind: ask.kind, image: picture.png, keep },
      });
      await answer(p, 'accept', { signature: r.signature.id });
      p.onDone?.();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  const decline = async () => {
    setBusy(true);
    try {
      await answer(p, 'decline');
      p.onDone?.();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Frame p={p}>
      {ask.why && (
        <p className="text-[13.5px] leading-relaxed" translate="no">
          {ask.why}
        </p>
      )}
      <SignaturePad kind={ask.kind} ref={pad} onChange={onHas} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-[13px] text-fg-2">
          <span className="shrink-0">Save it as</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label={tr('Name')} translate="no" className={`${inputCls} h-8.5 min-w-0 flex-1`} />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-2 max-md:min-h-11">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Keep it for later
        </label>
      </div>
      <p className="text-[12px] leading-snug text-fg-3">{keep ? 'Kept, encrypted, in Settings → App → Signatures.' : 'Kept for a day, then it goes.'} The agent never sees it: it hears only its name, and asks you before placing it anywhere.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy || !has} onClick={() => void save()}>
          {busy ? 'Saving' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decline()}>
          Not now
        </Button>
      </div>
    </Frame>
  );
}

/** A card about a signature: the pad an agent asked for, or where it would place one. */
export function SignatureApproval(p: CardProps) {
  const s = p.a.signature;
  if (s?.ask) return <AskCard p={p} ask={s.ask} />;
  return null;
}
