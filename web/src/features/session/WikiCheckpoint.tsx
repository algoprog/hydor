// Show checkpoint outcomes in the session's existing details panel.
import { useEffect, useState } from 'react';
import { api, enc } from '../../lib/api';
import { LOCALE } from '../../i18n/locale';

type Status = { status: 'disabled' } | { status: 'unavailable' } | { status: 'error' } | { status: 'saved' | 'failed'; event: 'PostToolUse' | 'PreCompact' | 'PostCompact' | 'Stop'; at: string; content: 'summary' | 'metadata' | null };
type HookCounts = { trusted: number; needsReview: number; disabled: number };
type Coverage = { complete: boolean; events: { preCompact: HookCounts } };

/** A periodic event is never described as a pre-compaction checkpoint. */
export function WikiCheckpoint({ sessionKey }: { sessionKey: string }) {
  const [value, setValue] = useState<Status | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  useEffect(() => {
    let active = true;
    // A failed request cannot prove that no checkpoint has been recorded.
    const load = () => {
      void api<Status>(`/api/sessions/${enc(sessionKey)}/wiki-checkpoint`).then((next) => { if (active) setValue(next); }, () => { if (active) setValue({ status: 'error' }); });
      if (sessionKey.startsWith('codex:')) void api<{ coverage: Coverage | null }>(`/api/sessions/${enc(sessionKey)}/wiki-codex-hooks`).then((next) => { if (active) setCoverage(next.coverage); }, () => { if (active) setCoverage(null); });
    };
    setValue(null);
    setCoverage(null);
    load();
    const timer = window.setInterval(load, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [sessionKey]);
  if (!value) return null;
  return <div className="flex gap-3 py-2 text-[13px]">
    <dt className="w-28 shrink-0 text-fg-3">Wiki checkpoint</dt>
    <dd className="min-w-0 flex-1 break-words text-fg">
      {value.status === 'disabled' ? 'Wiki checkpoints are off' : value.status === 'unavailable' ? 'No wiki checkpoint recorded' : value.status === 'error' ? 'Checkpoint status unavailable' : <>
        <span>{value.status === 'failed' ? 'Checkpoint failed' : 'Checkpoint saved'}</span>
        {' · '}{value.event === 'PreCompact' ? 'Before compaction' : value.event === 'PostCompact' ? 'After compaction' : value.event === 'PostToolUse' ? 'Periodic' : 'Session stopped'}
        {value.content && <>{' · '}{value.content === 'summary' ? 'Summary' : 'Metadata only'}</>}
        {' · '}<time dateTime={value.at}>{new Date(value.at).toLocaleString(LOCALE)}</time>
      </>}
      {value.status !== 'disabled' && coverage && <div className="mt-1 text-[12px] text-fg-3">
        <span>Codex pre-compaction hook configuration</span>: <span translate="no">{coverage.events.preCompact.trusted}</span> <span>trusted</span>, <span translate="no">{coverage.events.preCompact.needsReview}</span> <span>need review</span>, <span translate="no">{coverage.events.preCompact.disabled}</span> <span>disabled</span>.
        <div>These counts can include other tools and do not prove a wiki checkpoint.</div>
        {!coverage.complete && <div>Hook configuration could not be checked completely.</div>}
      </div>}
    </dd>
  </div>;
}
