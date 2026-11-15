// A line in a conversation where its agent called a connected account's tool that was held: waiting in the Outbox
// for your OK (with the way there), then sent with what it answered, or dropped; in a test that sends nothing, what
// it would have sent.
import { CircleCheck, CircleSlash, CircleX, FlaskConical, Send } from 'lucide-react';
import type { SessionNote } from '@shared/features';
import type { OutboxNote } from '@shared/outbox';
import { cx } from '../../components/ui';
import { go } from '../../lib/nav';

const SAYS: Record<OutboxNote['status'], string> = {
  held: 'Waits for your OK in the Outbox',
  sending: 'Being sent',
  sent: 'Sent with your OK',
  failed: 'Sent with your OK, and it did not go',
  dropped: 'Dropped: not sent',
  dry: 'Would have sent (a test that sends nothing)',
};

export function OutboxLine({ note }: { note: SessionNote }) {
  const d = note.data as OutboxNote;
  const Icon = d.status === 'sent' ? CircleCheck : d.status === 'failed' ? CircleX : d.status === 'dropped' ? CircleSlash : d.status === 'dry' ? FlaskConical : Send;
  const waiting = d.status === 'held' || d.status === 'sending';
  return (
    <div
      className={cx(
        'mt-3 flex flex-wrap items-start gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-[12.5px] leading-snug',
        waiting ? 'border-warn/35 bg-warn/[0.06]' : d.status === 'failed' ? 'border-err/30 bg-err/[0.05]' : 'border-line bg-panel',
      )}
    >
      <Icon size={14} className={cx('mt-px shrink-0', waiting ? 'text-warn' : d.status === 'sent' ? 'text-ok' : d.status === 'failed' ? 'text-err' : 'text-fg-3')} />
      <span className="min-w-0 flex-1">
        <span className="text-fg">{SAYS[d.status] ?? d.status}</span>
        <span className="text-fg-3"> · </span>
        <span translate="no" className="text-fg-2">
          {d.line}
        </span>
        {d.result && (d.status === 'sent' || d.status === 'failed') && (
          <span translate="no" className="mt-0.5 block line-clamp-2 text-fg-3">
            {d.result}
          </span>
        )}
      </span>
      {waiting && (
        <button type="button" onClick={() => go('/inbox')} className="shrink-0 text-accent hover:underline">
          Open the Outbox
        </button>
      )}
    </div>
  );
}
