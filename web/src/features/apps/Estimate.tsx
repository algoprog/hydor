// What a run of an app takes and costs, roughly, in one quiet line (shared/app-estimate.ts): under What it does in the
// builder, from the steps on screen until the app has finished runs, then from the middle of those; and on the sketch
// an agent shows before it builds.
import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import type { AppRecipe, AppRun } from '@shared/apps';
import { costText, estimateRun, timeText, type RunEstimate } from '@shared/app-estimate';
import { tr } from '../../i18n/runtime';
import { api, enc } from '../../lib/api';
import { cx } from '../../components/ui';

/** The estimate in words: "A run takes about 1–3 min and costs about $0.10–0.40". */
export function estimateWords(e: Pick<RunEstimate, 'seconds' | 'usd'>): string {
  const time = timeText(e.seconds);
  const cost = costText(e.usd);
  if (cost === 'nothing') return tr(`A run takes about ${time} and costs nothing`);
  if (cost === 'under a cent') return tr(`A run takes about ${time} and costs under a cent`);
  return tr(`A run takes about ${time} and costs about ${cost}`);
}

/** The line itself, with what it is based on when pointed at. */
export function EstimateText({ e, className }: { e: Pick<RunEstimate, 'seconds' | 'usd' | 'from' | 'runs' | 'waits'>; className?: string }) {
  const basis = e.from === 'runs' ? tr(`The middle of its last ${e.runs ?? 1} finished runs`) : tr('A rough guess from its steps, before it has run');
  return (
    <div className={cx('flex items-start gap-1.5 text-[12.5px] leading-snug text-fg-3', className)} title={basis}>
      <Gauge size={13} className="mt-px shrink-0" />
      <span>
        {estimateWords(e)}
        {e.waits ? tr(', and waits for your answer where it asks you') : ''}
      </span>
    </div>
  );
}

/** How long each of an app's finished runs took and what it cost (its main flow's, the last 30). */
function useFinished(appId: string | null) {
  const [runs, setRuns] = useState<{ seconds?: number; costUsd?: number }[]>([]);
  useEffect(() => {
    setRuns([]);
    if (!appId) return;
    api<{ runs: AppRun[] }>(`/api/apps/${enc(appId)}/runs`).then(
      (r) =>
        setRuns(
          r.runs
            .filter((x) => x.status === 'done' && !x.flow && !x.parent)
            .slice(0, 30)
            .map((x) => ({ ...(x.startedAt && x.endedAt ? { seconds: (x.endedAt - x.startedAt) / 1000 } : {}), ...(typeof x.costUsd === 'number' ? { costUsd: x.costUsd } : {}) })),
        ),
      () => {},
    );
  }, [appId]);
  return runs;
}

/** What a run of the app on screen takes and costs; nothing for an app with nothing to do yet. */
export function EstimateLine({ recipe, appId, className }: { recipe: Pick<AppRecipe, 'prompt' | 'tier' | 'flow'>; appId: string | null; className?: string }) {
  const runs = useFinished(appId);
  const e = estimateRun(recipe, runs);
  return e ? <EstimateText e={e} className={className} /> : null;
}
