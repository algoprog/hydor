// Cards the browser adds to the conversation: what the agent needs the user to do there (a login, a
// check), a purchase it stopped before, an address on this machine it wants to open. Waiting ones have
// their buttons; finished ones shrink to a line.
import { Check, CircleSlash, CreditCard, Hand, Server } from 'lucide-react';
import type { BrowserNote } from '@shared/browser';
import type { SessionNote } from '@shared/features';
import { Button, useIsMobile } from '../../components/ui';
import { clockTime } from '../../lib/format';
import { showBrowser } from './Dock';
import { useBrowser } from './store';

export function BrowserNoteCard({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const d = note.data as BrowserNote;
  const mobile = useIsMobile();
  const live = useBrowser((s) => s.views[sessionKey]?.asks.some((a) => a.id === d?.ask?.id));
  if (!d?.ask) return null;
  const a = d.ask;
  // Waiting: the browser above the message box has the buttons; here, what it is and a way there.
  if (d.status === 'waiting' && live) {
    const Icon = a.kind === 'local' ? Server : a.kind === 'payment' ? CreditCard : Hand;
    const what = a.kind === 'local' ? `Wants to open ${a.text}, on this machine or its network` : a.kind === 'payment' ? `Stopped before paying or ordering: ${a.text}` : `Needs you in the browser: ${a.text}`;
    return (
      <div className="tl-item my-1.5 flex items-center gap-2.5 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-[13px]">
        <Icon size={15} className="shrink-0 text-warn" />
        <span className="min-w-0 flex-1">{what}</span>
        <Button size="sm" variant="ghost" onClick={() => showBrowser(sessionKey)}>
          {mobile ? 'Open' : 'Show'}
        </Button>
      </div>
    );
  }
  const what = a.kind === 'local' ? `Open ${a.text}` : a.kind === 'payment' ? `Pay or order: ${a.text}` : a.text;
  const done = d.status === 'done';
  const verdict = a.kind === 'local' ? (done ? 'Allowed' : 'Not allowed') : d.status === 'waiting' ? 'No longer waiting' : done ? 'Done in the browser' : 'Skipped';
  return (
    <div className="tl-item flex items-center gap-2 px-2 py-1 text-[12.5px] text-fg-3">
      {done ? <Check size={14} className="shrink-0 text-ok" /> : <CircleSlash size={14} className="shrink-0" />}
      <span className="min-w-0 flex-1 truncate">
        {verdict}: {what}
      </span>
      {d.endedAt && <span className="shrink-0">{clockTime(d.endedAt)}</span>}
    </div>
  );
}
