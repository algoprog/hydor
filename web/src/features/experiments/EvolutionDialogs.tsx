// An evolution's smaller windows: one try (what it changed, file by file, and Take this one) and what Take made (the
// branch, with a way to it in Git).
import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import type { Candidate, CandidateDetail, Evolution } from '@shared/evolve';
import { api, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Button, cx, Dialog, Throbber } from '../../components/ui';
import { repoUrl } from '../git/parts';
import { toneClass } from './evalWords';
import { evolveUrl } from './evolveApi';
import { builtOnWords, gainStanding, modelWords, splitWhy, tryScore } from './evolveWords';

/**
 * Opens a branch Take made in the Git page's history, at its commit. The repository goes on that page's list first, as
 * Add it to the list does there: an evaluation's folder need not be one a session has worked in.
 */
async function openBranch(e: Pick<Evolution, 'from'>, commit: string) {
  // An evolution always names the folder it started from.
  const from = e.from!;
  const added = await post<{ repo?: { path: string } }>('/api/git/repos', { path: from }).catch(() => null);
  go(repoUrl(added?.repo?.path ?? from, { tab: 'history', c: commit }));
}

/** "Taken as <branch>", the branch a link to it in Git. */
export function TakenAs({ evolution, taken, className }: { evolution: Pick<Evolution, 'from'>; taken: { branch: string; commit: string }; className?: string }) {
  return (
    <span className={cx('min-w-0 text-[12.5px] text-fg-2', className)}>
      <span>Taken as</span>{' '}
      <button type="button" onClick={() => void openBranch(evolution, taken.commit)} className="text-left text-accent hover:underline">
        <span translate="no" className="font-mono text-[12px] [overflow-wrap:anywhere]">
          {taken.branch}
        </span>
      </button>
    </span>
  );
}

export function TakenDialog({ evolution, taken, onClose }: { evolution: Evolution; taken: { branch: string; commit: string } | null; onClose: () => void }) {
  return (
    <Dialog
      part="experiments"
      open={!!taken}
      onClose={onClose}
      title="The branch is ready"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={<GitBranch size={14} />} onClick={() => taken && void openBranch(evolution, taken.commit)}>
            Open in Git
          </Button>
        </>
      }
    >
      {taken && (
        <p className="text-[14px] leading-relaxed text-fg-2">
          <TakenAs evolution={evolution} taken={taken} className="!text-[14px]" />
        </p>
      )}
    </Dialog>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <dt className="w-[128px] shrink-0 text-fg-3">{label}</dt>
      <dd className="min-w-0 flex-1 text-fg-2">{children}</dd>
    </div>
  );
}

interface TryProps {
  evolution: Evolution;
  /** The try open; null closes the window. */
  candidate: Candidate | null;
  /** The number of the try it was made from; none: the start. */
  parent?: number;
  onClose: () => void;
  onTake: (c: Candidate) => void;
  taking: boolean;
}

export function TryDialog({ evolution, candidate, parent, onClose, onTake, taking }: TryProps) {
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState('');
  const id = candidate?.id;
  // Read again when it moves on (its change is there once it is being scored).
  const status = candidate?.status;
  useEffect(() => {
    if (!id) return;
    let live = true;
    setError('');
    api<{ candidate: CandidateDetail }>(evolveUrl(evolution.id, `/candidates/${encodeURIComponent(id)}`))
      .then((r) => live && setDetail(r.candidate))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [evolution.id, id, status]);

  const c = candidate;
  const d = detail && detail.id === id ? detail : null;
  const seeds = evolution.start?.values.length ?? 1;
  const score = c && tryScore(c, seeds);
  const against = c && gainStanding(c.gain, evolution.start?.mean);
  const why = splitWhy(c?.why);
  const changes = d?.diff.filter((f) => f.diff.trim()) ?? [];
  return (
    <Dialog
      part="experiments"
      open={!!c}
      onClose={onClose}
      title={c ? `Try #${c.n}` : ''}
      width={760}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="mr-auto">
            Close
          </Button>
          {c?.status === 'scored' && (
            <Button variant="primary" onClick={() => onTake(c)} disabled={taking}>
              Take this one
            </Button>
          )}
        </>
      }
    >
      {c && score && (
        <div className="space-y-3 text-[13px]">
          {c.summary && (
            <p translate="no" className="text-[14px] leading-relaxed break-words text-fg">
              {c.summary}
            </p>
          )}
          <dl className="space-y-1">
            <Fact label="Score">
              {score.failed ? (
                <span className="font-medium text-err">Failed</span>
              ) : (
                <>
                  {score.value && (
                    <span translate="no" className="tnum font-medium text-fg">
                      {score.value}
                    </span>
                  )}
                  {score.value && score.note && <span> · </span>}
                  {score.note && <span>{score.note}</span>}
                </>
              )}
            </Fact>
            {against && (
              <Fact label="Against the start">
                <span className={toneClass(against.tone)}>{against.long}</span>
              </Fact>
            )}
            <Fact label="Built on">
              <span>{builtOnWords(parent)}</span>
            </Fact>
            <Fact label="Model">
              <span>{modelWords(c.model)}</span>
            </Fact>
            {(c.id === evolution.best || c.bestWhenScored) && (
              <Fact label="Best">
                <span>{c.id === evolution.best ? 'The best so far' : 'It was the best when it was scored'}</span>
              </Fact>
            )}
          </dl>
          {score.failed && c.why && (
            <div className="rounded-lg bg-err/10 px-3 py-2">
              <p className="break-words text-err">{why.first}</p>
              {why.rest && (
                <pre translate="no" className="mt-1.5 max-h-40 overflow-auto font-mono text-[11.5px] leading-snug whitespace-pre-wrap text-fg-2">
                  {why.rest}
                </pre>
              )}
            </div>
          )}
          {error && <p className="rounded-lg bg-err/10 px-3 py-2 text-err">{error}</p>}
          {!d && !error && (
            <div className="flex justify-center py-6 text-fg-3">
              <Throbber />
            </div>
          )}
          {d && !changes.length && !score.failed && <p className="text-fg-3">{c.status === 'proposing' ? 'The change is still being written.' : 'No lines are different from the start.'}</p>}
          {changes.map((f) => {
            const counts = c.changed.find((x) => x.path === f.path);
            return (
              <div key={f.path} className="overflow-hidden rounded-xl border border-line">
                <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
                  <span translate="no" className="min-w-0 flex-1 font-mono text-[12.5px] break-all text-fg">
                    {f.path}
                  </span>
                  {counts && <DiffStat added={counts.added} removed={counts.removed} />}
                </div>
                <div translate="no" className="max-h-[360px] overflow-auto">
                  <DiffView diff={f.diff} />
                </div>
                {f.cut && <p className="border-t border-line px-3 py-1.5 text-[12px] text-fg-3">The rest is not shown.</p>}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
