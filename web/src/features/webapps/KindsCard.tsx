// The card an agent puts in a conversation when someone asks for an app and has not said which kind (the webapp_kinds tool): the same ideas as
// the page "What do you want to make?", with the same drawings and sentences, read from the same data. One is picked and sent with "Use this
// kind". Answered as an approval: accept with form.kind (the kind's id, or "other"), or "Not now".
import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { ApprovalRequest } from '@shared/types';
import type { Agent } from '@shared/types';
import { api, enc } from '../../lib/api';
import { toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { Button } from '../../components/ui';
import { Elapsed } from '../session/items';
import { KindTile, OtherTile } from './Kinds';

export function KindsCard({ a, sessionKey, base, id, onDone }: { a: ApprovalRequest; sessionKey: string; agent?: Agent; id?: string; base?: string; onDone?: () => void }) {
  const kinds = a.kinds!;
  const fit = new Set(kinds.suggest ?? []);
  // The ones the agent thinks fit come first.
  const ordered = [...kinds.kinds.filter((k) => fit.has(k.id)), ...kinds.kinds.filter((k) => !fit.has(k.id))];
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const respond = async (decision: 'accept' | 'decline', kind = pick) => {
    if (busy || (decision === 'accept' && !kind)) return;
    setBusy(true);
    try {
      await api(`/api/sessions/${enc(sessionKey)}/approvals/${enc(a.id)}`, { method: 'POST', base, body: decision === 'accept' ? { decision, form: { kind } } : { decision } });
      onDone?.();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <div id={id} className="@container anim-pop my-2 overflow-hidden rounded-xl border border-warn/45 bg-panel shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_10%,transparent)]" data-web-kinds>
      <div className="flex items-center gap-2 border-b border-line bg-warn/8 px-3 py-2">
        <LayoutGrid size={15} className="shrink-0 text-warn" />
        <div className="min-w-0 flex-1 text-[13px] leading-snug font-medium" translate="no">
          {a.title}
        </div>
        <span className="shrink-0 text-[11px] text-fg-3">
          waiting <Elapsed since={a.createdAt} />
        </span>
      </div>
      {/* The kinds scroll inside the card, so its buttons stay in reach under them. */}
      <div className="max-h-[min(64vh,680px)] space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
        {a.detail && (
          <p className="text-[13px] leading-snug text-fg-2" translate="no">
            {a.detail}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
          {ordered.map((k) => (
            <KindTile key={k.id} k={k} compact selected={pick === k.id} hint={fit.has(k.id) ? tr('Looks like a fit') : undefined} onPick={() => setPick(k.id)} />
          ))}
          <OtherTile compact selected={pick === 'other'} onPick={() => setPick('other')} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-3 py-2.5">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void respond('decline')}>
          Not now
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} data-you-decide onClick={() => void respond('accept', 'you')}>
          You decide
        </Button>
        <Button size="sm" variant="primary" disabled={busy || !pick} onClick={() => void respond('accept')}>
          <span translate="no">{a.options.find((o) => o.id === 'accept')?.label || tr('Use this kind')}</span>
        </Button>
      </div>
    </div>
  );
}
