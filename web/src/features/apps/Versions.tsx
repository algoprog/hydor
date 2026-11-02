// A template's versions, in its Edit: each save that changed what it does, newest first, with who saved it
// (you, an agent, its folder, a file installed), what changed, and how its examples went with it (those
// tried with it as saved: how many passed, and a run's time and cost), so versions compare at a glance.
// An earlier one comes back on screen, to save as the newest.
import { useEffect, useState } from 'react';
import type { AppDef, AppRecipe } from '@shared/apps';
import { api, enc } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { toastError } from '../../lib/store';
import { Button, Throbber } from '../../components/ui';
import { money } from './api';

interface Version {
  n: number;
  at: number;
  by: 'you' | 'agent' | 'folder' | 'install';
  line: string;
  examples?: { tried: number; passed: number; seconds: number; costUsd: number };
}

const BY: Record<Version['by'], string> = { you: 'You', agent: 'An agent', folder: 'Its folder', install: 'Installed' };

export function Versions({ app, onBring }: { app: AppDef; onBring: (recipe: AppRecipe, n: number) => void }) {
  const [list, setList] = useState<Version[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    api<{ versions: Version[] }>(`/api/apps/${enc(app.id)}/versions`).then(
      (r) => setList(r.versions),
      () => setList([]),
    );
  }, [app.id, app.updatedAt]);
  if (!list) return <Throbber className="h-4 text-fg-3" />;
  if (!list.length) return <div className="text-[13px] text-fg-3">None yet: its next save that changes it is the first.</div>;
  const bring = (n: number) =>
    api<{ recipe: AppRecipe }>(`/api/apps/${enc(app.id)}/versions/${n}`).then(
      (r) => onBring(r.recipe, n),
      toastError,
    );
  const shown = all ? list : list.slice(0, 5);
  return (
    <div>
      <ol className="divide-y divide-line">
        {shown.map((v, i) => (
          <li key={v.n} className="flex items-start gap-3 py-2">
            <span className="w-9 shrink-0 pt-px font-mono text-[12px] text-fg-3">{`v${v.n}`}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] break-words" translate="no">
                {v.line}
              </div>
              <div className="flex flex-wrap gap-x-2 text-[12px] text-fg-3">
                <span>{BY[v.by]}</span>
                <span>{`${timeAgo(v.at)} ago`}</span>
                {i === 0 && <span className="text-accent">Now</span>}
                {v.examples && <span className={v.examples.passed === v.examples.tried ? 'text-ok' : 'text-err'}>{`Examples: ${v.examples.passed} of ${v.examples.tried} passed`}</span>}
                {v.examples && <span>{`${v.examples.seconds} s · ${money(v.examples.costUsd)} a run`}</span>}
              </div>
            </div>
            {i > 0 && (
              <Button size="sm" variant="ghost" onClick={() => void bring(v.n)}>
                Bring it back
              </Button>
            )}
          </li>
        ))}
      </ol>
      {list.length > 5 && (
        <button type="button" className="mt-1 text-[12.5px] text-accent hover:underline" onClick={() => setAll((x) => !x)}>
          {all ? 'Fewer' : `All ${list.length} versions`}
        </button>
      )}
    </div>
  );
}
