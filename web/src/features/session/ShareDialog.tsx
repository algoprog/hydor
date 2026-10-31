// Read-only links to a session: make one (for a day, a week, a month, or until turned off), copy it,
// see how often it was opened, turn it off.
import { useEffect, useState } from 'react';
import { Link2, Trash2 } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { api, del, enc, post } from '../../lib/api';
import { ago, untilText } from '../../lib/format';
import { toastError } from '../../lib/store';
import { CopyButton } from '../../components/Markdown';
import { Button, Dialog, Throbber, IconButton, Segmented } from '../../components/ui';
import { machineBase } from '../../lib/machine';

interface LinkView {
  id: string;
  createdAt: number;
  expiresAt?: number;
  views: number;
  lastSeen?: number;
}

type Days = '1' | '7' | '30' | '0';

export function ShareDialog({ s, open, onClose }: { s: SessionSummary; open: boolean; onClose: () => void }) {
  const [links, setLinks] = useState<LinkView[] | null>(null);
  const [days, setDays] = useState<Days>('7');
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<{ links: LinkView[] }>(`/api/sessions/${enc(s.key)}/guest-links`)
      .then((r) => setLinks(r.links))
      .catch(toastError);
  useEffect(() => {
    if (!open) return;
    setMade(null);
    load();
  }, [open, s.key]);
  const make = async () => {
    setBusy(true);
    try {
      const r = await post<{ token: string }>(`/api/sessions/${enc(s.key)}/guest-links`, { days: Number(days) || null });
      setMade(`${location.origin}${machineBase}/g/${r.token}`);
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Share a read-only link" width={520}>
      <div className="space-y-4 text-[13.5px]">
        <p className="leading-relaxed text-fg-3">
          Anyone with the link sees this conversation as it happens: messages, the steps by name, file changes and pages the agent showed. Not command output, the agent’s thinking or
          anything else here. They cannot type or change anything.
        </p>
        {made ? (
          <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-3">
            <div className="text-[12.5px] font-medium text-fg-2">The link (shown once; make another any time)</div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-bg-1 px-2 py-1 font-mono text-[12px]">{made}</code>
              <CopyButton text={made} />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-fg-2">Works for</span>
            <Segmented<Days>
              size="sm"
              value={days}
              onChange={setDays}
              options={[
                { value: '1', label: 'A day' },
                { value: '7', label: 'A week' },
                { value: '30', label: 'A month' },
                { value: '0', label: 'Until turned off' },
              ]}
            />
            <Button size="sm" variant="primary" icon={<Link2 size={14} />} disabled={busy} onClick={make}>
              Make a link
            </Button>
          </div>
        )}
        {links === null ? (
          <Throbber className="text-fg-3" />
        ) : links.length ? (
          <div className="space-y-1 border-t border-line pt-3">
            <div className="text-[12px] font-medium text-fg-3">Links that work now</div>
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-1.5">
                <Link2 size={14} className="shrink-0 text-fg-3" />
                <div className="min-w-0 flex-1 text-[12.5px]">
                  Made {ago(l.createdAt)} · {l.expiresAt ? `ends ${untilText(l.expiresAt)}` : 'no end'} · opened {l.views} time{l.views === 1 ? '' : 's'}
                  {l.lastSeen ? `, last ${ago(l.lastSeen)}` : ''}
                </div>
                <IconButton label="Turn off" size="sm" onClick={() => del(`/api/guest-links/${l.id}`).then(load, toastError)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
