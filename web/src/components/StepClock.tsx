// The clock of a step under way, in the conversation's rows: how long it has run (from when it really started, which is
// later than it was asked for when the agent ran another step alone first), or "Waiting" while it waits its turn.
import { useEffect, useState } from 'react';
import type { ToolInfo } from '@shared/types';
import { duration } from '../lib/format';

/** `since`: when the step was asked for, which counts when it did not start later. */
export function StepClock({ t, since }: { t: ToolInfo; since?: number }) {
  const from = t.startedAt ?? since;
  const counting = !t.queued && !!from;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!counting) return;
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [counting]);
  if (t.queued)
    return (
      <span className="shrink-0 text-[11px] text-fg-3" title="Waiting for the step before it to finish">
        Waiting
      </span>
    );
  if (!from) return null;
  return <span className="tnum shrink-0 text-[11px] text-fg-3">{duration(Date.now() - from)}</span>;
}
