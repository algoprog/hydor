// What a test that sends nothing kept instead of sending (server/outbox): shown with the test in the task's form and in
// its run's history.
import { useEffect, useState } from 'react';
import { MailX } from 'lucide-react';
import { heldLine, type HeldCall } from '@shared/outbox';
import { api, enc } from '../../lib/api';
import { useOutbox } from './store';

/** What a test that sends nothing kept instead of sending: each call, in a line. */
export function WouldHaveSent({ run }: { run: string }) {
  const [calls, setCalls] = useState<HeldCall[] | null>(null);
  const version = useOutbox((s) => s.version);
  useEffect(() => {
    api<{ calls: HeldCall[] }>(`/api/outbox?run=${enc(run)}&all=1`).then(
      (r) => setCalls(r.calls.filter((c) => c.status === 'dry').reverse()),
      () => setCalls([]),
    );
  }, [run, version]);
  if (!calls?.length) return null;
  return (
    <div className="mt-1.5 space-y-0.5">
      <div className="text-[11.5px] font-medium text-fg-3">Would have sent</div>
      {calls.map((c) => (
        <div key={c.id} className="flex min-w-0 items-start gap-1.5 text-[12px] leading-snug text-fg-2">
          <MailX size={12} className="mt-[3px] shrink-0 text-fg-3" />
          <span translate="no" className="min-w-0 break-words">
            {heldLine(c)}
          </span>
        </div>
      ))}
    </div>
  );
}
