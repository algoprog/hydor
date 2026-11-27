// A run held at the limit on agents' GPU hours (server/experiments/budget.ts): what it waits for, with Let it run (this
// run only, beyond the limit) and Change the limit…, which opens Where runs go over the page.
import { useState } from 'react';
import type { RunRecord } from '@shared/experiments';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { runPath } from './api';

export function HeldRun({ r, machine, base, onChanged }: { r: RunRecord; machine?: string | null; base?: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const letRun = async () => {
    setBusy(true);
    try {
      await api(`/api/experiments/runs/${r.id}/let-run`, { method: 'POST', body: {}, ...(base !== undefined ? { base } : {}) });
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  // This computer's limit is set here; a run another machine keeps is under that machine's, set on its own page.
  const here = !machine && !r.remote;
  const limit = () => {
    const path = runPath({ id: r.id });
    go(`${path}${path.includes('?') ? '&' : '?'}places=1`);
  };
  return (
    <div className="rounded-lg border border-warn/45 bg-bg-1 px-3 py-2 text-[13px] leading-relaxed text-fg-2">
      {/* The status above says "Waits for you" already. One piece of text, so the rest is translated as a sentence. */}
      <p>{r.why?.replace(/^Waits for you: (.)/, (_, first: string) => first.toUpperCase())}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" disabled={busy} onClick={letRun}>
          Let it run
        </Button>
        {here && (
          <Button size="sm" variant="secondary" onClick={limit}>
            Change the limit…
          </Button>
        )}
      </div>
    </div>
  );
}
