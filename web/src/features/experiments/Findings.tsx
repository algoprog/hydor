// On an experiment's page: what was found. The findings whose evidence names one of its runs or results tables, the
// newest three first, each with its verdict as the Memory tab shows it; a tap opens it in its project's Memory. With
// runs done and no finding yet, one quiet line offers to have an agent write it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExperimentFinding, RunRecord } from '@shared/experiments';
import { askedRunsLink } from '@shared/asked-runs';
import { findingRequest } from '@shared/finding-ask';
import { api, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go, openProject } from '../../lib/nav';
import { cx } from '../../components/ui';
import { VerdictPill } from '../memory/Finding';
import { placeUrl } from '../memory/MemoryNotes';

/** Shown before "N more". */
const FIRST = 3;

/** The experiment's findings, read again when a finding or a run changes; null while they load. */
function useFindings(group: string): { findings: ExperimentFinding[]; memory: boolean } | null {
  const [v, setV] = useState<{ group: string; findings: ExperimentFinding[]; memory: boolean } | null>(null);
  const load = useCallback(() => {
    if (!group) return;
    api<{ findings: ExperimentFinding[]; memory: boolean }>(`/api/experiments/findings?group=${enc(group)}`)
      .then((r) => setV({ group, ...r }))
      .catch(() => {});
  }, [group]);
  useEffect(load, [load]);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const later = () => {
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      load();
    }, 1500);
  };
  useFeatureEvent('memory', later);
  useFeatureEvent('experiments', later);
  return v && v.group === group ? v : null;
}

const open = (f: ExperimentFinding) => (f.project ? openProject(f.project, 'memory', { part: 'findings', note: f.id }) : go(placeUrl({ kind: 'repo', key: f.root })));

export function ExperimentFindings({ group, runs, className }: { group: string; runs: RunRecord[]; className?: string }) {
  const v = useFindings(group);
  const [all, setAll] = useState(false);
  if (!group || !v) return null;
  const list = all ? v.findings : v.findings.slice(0, FIRST);
  const more = v.findings.length - list.length;
  if (!list.length) {
    // The newest finished run of this computer: its folder is where the agent starts.
    const done = runs.filter((r) => r.status === 'done' && !r.archivedAt);
    // Memory off: an agent could record no finding.
    if (!done.length || !v.memory) return null;
    const at = [...done].sort((a, b) => b.createdAt - a.createdAt).find((r) => !r.machine && (r.where ?? 'local') === 'local')?.cwd;
    return (
      <p className={cx('mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-3', className)}>
        <span>No finding says what this experiment showed yet</span>
        <button type="button" onClick={() => go(askedRunsLink(findingRequest(group), at))} className="min-h-7 text-accent hover:underline">
          Ask an agent to write it
        </button>
      </p>
    );
  }
  return (
    <div className={cx('mt-2 max-w-[820px]', className)}>
      <ul className="space-y-1">
        {list.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => open(f)} className="flex w-full min-w-0 items-start gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-left hover:bg-bg-1">
              <VerdictPill verdict={f.verdict} className="mt-px shrink-0" />
              <span className="line-clamp-3 min-w-0 flex-1 text-[13px] leading-snug sm:line-clamp-1">
                <span translate="no" className="text-fg">
                  {f.statement}
                </span>
                {f.learned && (
                  <span translate="no" className="text-fg-3">
                    {' · '}
                    {f.learned}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {(more > 0 || all) && v.findings.length > FIRST && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-1 min-h-7 text-[12px] text-accent hover:underline">
          {all ? 'Fewer' : `${more} more`}
        </button>
      )}
    </div>
  );
}
