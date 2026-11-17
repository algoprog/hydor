// The Memory tab's Wiki part: the ⋯ menu beside its buttons (Update now, Rebuild from sources…, Restore the previous
// wiki…), the dialogs they open, and the line that says what the wiki is doing at a person's request ("Rebuilding: 12
// of 26 sources"). The status loads again every few seconds while something runs, and when the server says the wiki changed.
import { useEffect, useRef, useState } from 'react';
import { History, MoreHorizontal, RefreshCw, RotateCcw } from 'lucide-react';
import { Button, Dialog, IconButton, MenuItem, Popover, Throbber } from '../../components/ui';
import { api, enc, post } from '../../lib/api';
import { usd } from '../../lib/format';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';

/** GET /api/projects/:id/wiki/rebuild. */
export interface WikiJob {
  state: 'idle' | 'running' | 'done' | 'failed';
  kind?: 'rebuild' | 'update' | 'reorganise';
  phase?: string;
  done: number;
  total: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  did?: string[];
  archives: { at: string; articles: number }[];
}

/** POST /api/projects/:id/wiki/rebuild without confirm. */
interface Estimate {
  sources: number;
  calls: number;
  callsMax: number;
  chars: number;
  helper: { model: string; label: string; priced: boolean; usd?: number; usdMax?: number; note?: string };
  articles: number;
}

/** The wiki's job status, polled while one runs. */
export function useWikiJob(id: string, active: boolean, version: number): [WikiJob | null, () => void] {
  const [job, setJob] = useState<WikiJob | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let live = true;
    api<WikiJob>(`/api/projects/${enc(id)}/wiki/rebuild`).then(
      (r) => live && setJob(r),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id, active, version, tick]);
  useEffect(() => {
    if (job?.state !== 'running') return;
    const t = setTimeout(() => setTick((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [job, tick]);
  return [job, () => setTick((n) => n + 1)];
}

const PHASE: Record<string, string> = {
  organise: 'Rebuilding: organising the areas',
  hubs: 'Rebuilding: writing the hubs',
  redirects: 'Rebuilding: pointing old paths to the new articles',
  documents: 'Updating: reading waiting documents',
  conversations: 'Updating: reading conversations',
  commits: 'Updating: reading commits',
  drift: 'Updating: checking articles against the code',
  merges: 'Updating: doing queued merges',
  areas: 'Updating: reorganising the areas',
};

/** What the wiki is doing, in a line: while it runs, and for a while after it ended (what it did, or why it stopped). */
function progressLine(job: WikiJob | null): { text: string; running: boolean; failed?: boolean } | null {
  if (!job || job.state === 'idle') return null;
  if (job.state === 'running') {
    if (job.kind === 'reorganise') return { text: tr('Reorganising the areas'), running: true };
    if (job.kind === 'rebuild' && (!job.phase || job.phase === 'sources')) return { text: tr(`Rebuilding: ${job.done} of ${job.total} sources`), running: true };
    if (job.kind === 'update' && job.phase === 'hubs') return { text: tr('Updating: writing the hubs'), running: true };
    return { text: tr(PHASE[job.phase ?? ''] ?? (job.kind === 'rebuild' ? 'Rebuilding' : 'Updating')), running: true };
  }
  // A finished run is shown for half an hour.
  if (!job.endedAt || Date.now() - job.endedAt > 30 * 60_000) return null;
  if (job.state === 'failed') return { text: `${job.kind === 'rebuild' ? tr('The rebuild stopped') : job.kind === 'update' ? tr('The update stopped') : tr('The reorganisation stopped')}: ${job.error ?? ''}`, running: false, failed: true };
  return { text: (job.did ?? []).join(' · '), running: false };
}

const when = (at: string) => new Date(at).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** The ⋯ menu, its dialogs and the progress line. */
export function WikiActions({ id, job, refresh }: { id: string; job: WikiJob | null; refresh: () => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [rebuild, setRebuild] = useState(false);
  const [restore, setRestore] = useState(false);
  const running = job?.state === 'running';
  const update = async () => {
    setMenu(false);
    try {
      await post(`/api/projects/${enc(id)}/wiki/update`, {});
      toast(tr('Updating the wiki now'));
    } catch (e) {
      toastError(e);
    }
    refresh();
  };
  return (
    <>
      <IconButton ref={anchor} label={tr('More for the wiki')} size="sm" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
        <MoreHorizontal size={16} />
      </IconButton>
      <Popover anchor={anchor} open={menu} onClose={() => setMenu(false)} align="end" width={260}>
        <MenuItem icon={<RefreshCw size={15} />} disabled={running} onClick={() => void update()}>
          Update now
        </MenuItem>
        <MenuItem
          icon={<History size={15} />}
          disabled={running}
          onClick={() => {
            setMenu(false);
            setRebuild(true);
          }}
        >
          Rebuild from sources…
        </MenuItem>
        {!!job?.archives.length && (
          <MenuItem
            icon={<RotateCcw size={15} />}
            disabled={running}
            onClick={() => {
              setMenu(false);
              setRestore(true);
            }}
          >
            Restore the previous wiki…
          </MenuItem>
        )}
      </Popover>
      {rebuild && <RebuildDialog id={id} onClose={() => setRebuild(false)} onStarted={refresh} />}
      {restore && job && <RestoreDialog id={id} archives={job.archives} onClose={() => setRestore(false)} onDone={refresh} />}
    </>
  );
}

/** The line under the buttons: what the wiki is doing. */
export function WikiProgress({ job }: { job: WikiJob | null }) {
  const line = progressLine(job);
  if (!line) return null;
  return (
    <p role="status" className={`flex items-center gap-2 text-[12.5px] leading-snug ${line.failed ? 'text-err' : 'text-fg-3'}`}>
      {line.running && <Throbber size={13} />}
      <span translate={line.running ? undefined : 'no'}>{line.text}</span>
    </p>
  );
}

function RebuildDialog({ id, onClose, onStarted }: { id: string; onClose: () => void; onStarted: () => void }) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    post<Estimate>(`/api/projects/${enc(id)}/wiki/rebuild`, {}).then(setEstimate, (e) => setError((e as Error).message));
  }, [id]);
  const start = async () => {
    setBusy(true);
    try {
      await post(`/api/projects/${enc(id)}/wiki/rebuild`, { confirm: true });
      toast(tr('Rebuilding the wiki from its sources'));
      onStarted();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cost = estimate
    ? estimate.helper.model === 'auto'
      ? tr('Automatic uses your Claude account’s usage: Claude Haiku, and Sonnet for the areas.')
      : estimate.helper.priced
        ? estimate.helper.usdMax != null && estimate.helper.usdMax > (estimate.helper.usd ?? 0)
          ? tr(`About ${usd(estimate.helper.usd ?? 0)}, at most ${usd(estimate.helper.usdMax)}, with ${estimate.helper.label}.`)
          : tr(`About ${usd(estimate.helper.usd ?? 0)} with ${estimate.helper.label}.`)
        : tr(`${estimate.helper.label} has no price in the app: its cost is not known.`)
    : '';
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr('Rebuild from sources')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void start()} disabled={!estimate || busy || !estimate.sources}>
            Rebuild
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px] leading-relaxed">
        <p>Hydor reads every source this wiki was built from again (the text of its documents, conversations, commit messages and notes moved from memory) and writes its articles, areas and hubs anew. The sources, plans and memory notes stay as they are.</p>
        <p>The current wiki is archived first, and you can put it back with Restore the previous wiki (the last three are kept, and the wiki as it was before its first rebuild). Paths of articles that are gone lead to the new articles that hold what they said.</p>
        {!estimate && !error && <Throbber />}
        {estimate && (
          <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
            <div className="font-medium">{tr(`${estimate.sources} sources · about ${estimate.calls} helper calls · ${Math.round(estimate.chars / 1000)}k characters to read`)}</div>
            {estimate.callsMax > estimate.calls && <div className="text-fg-3">{tr(`Up to ${estimate.callsMax} calls if earlier articles that no new one covers must be read again.`)}</div>}
            <div className="text-fg-3">{cost}</div>
            <div className="text-fg-3">{tr('One source at a time, at most 60 an hour: a big wiki takes hours. You can keep working meanwhile.')}</div>
          </div>
        )}
        {error && (
          <p role="alert" translate="no" className="text-err">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function RestoreDialog({ id, archives, onClose, onDone }: { id: string; archives: WikiJob['archives']; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState('');
  const restore = async (at: string) => {
    setBusy(at);
    try {
      await post(`/api/projects/${enc(id)}/wiki/rebuild/restore`, { at });
      toast(tr('The earlier wiki is back'));
      onDone();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };
  return (
    <Dialog open onClose={onClose} title={tr('Restore the previous wiki')}>
      <div className="space-y-3 text-[13.5px] leading-relaxed">
        <p>The wiki as it is now is archived first, so you can come back to it the same way.</p>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {archives.map((a) => (
            <li key={a.at} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                {when(a.at)} · {a.articles === 1 ? tr('1 article') : tr(`${a.articles} articles`)}
              </span>
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void restore(a.at)}>
                {busy === a.at ? <Throbber size={13} /> : tr('Restore')}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
