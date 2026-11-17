// The Memory tab's Wiki part: the ⋯ menu beside its buttons (Update now, Rebuild from sources…, Restore the previous
// wiki…), and the dialogs they open. What the wiki is doing is WikiJobProgress's.
import { useEffect, useRef, useState } from 'react';
import { Hammer, History, MoreHorizontal, RefreshCw, RotateCcw } from 'lucide-react';
import { Button, Dialog, IconButton, MenuItem, Popover, Throbber } from '../../components/ui';
import { api, enc, post } from '../../lib/api';
import { usd } from '../../lib/format';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import type { BuildOffer as Offer, WikiJob } from './wikiJob';

/** POST /api/projects/:id/wiki/rebuild without confirm. */
interface Estimate {
  sources: number;
  /** What it reads besides the sources the wiki kept: the project's files, notes, commits, and the documents and conversations the wiki never read. */
  reads?: { kept: number; files: string[]; notes: number; commits: number; commitSources: number; documents: number; sessions: number };
  minutes?: number;
  workers?: number;
  calls: number;
  callsMax: number;
  chars: number;
  helper: { model: string; label: string; priced: boolean; usd?: number; usdMax?: number; note?: string };
  articles: number;
}

const when = (at: string) => new Date(at).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** What a build or rebuild reads, as pills' words: "38 conversations, 412 commits, 9 documents, 14 notes, README.md, docs/". */
function readsLine(c: { sessions: number; commits: number; documents: number; notes: number; files: string[] }): string {
  const n = (k: number, one: string, many: string) => (k === 1 ? one : many);
  return [
    c.sessions ? n(c.sessions, tr('1 conversation'), tr(`${c.sessions.toLocaleString(LOCALE)} conversations`)) : '',
    c.commits ? n(c.commits, tr('1 commit'), tr(`${c.commits.toLocaleString(LOCALE)} commits`)) : '',
    c.documents ? n(c.documents, tr('1 document'), tr(`${c.documents.toLocaleString(LOCALE)} documents`)) : '',
    c.notes ? n(c.notes, tr('1 note'), tr(`${c.notes.toLocaleString(LOCALE)} notes`)) : '',
    c.files.length ? c.files.join(', ') : '',
  ]
    .filter(Boolean)
    .join(', ');
}

const minutesText = (m: number) => (m >= 90 ? tr(`about ${Math.round(m / 60)} h`) : tr(`about ${Math.max(1, m)} min`));

/** The ⋯ menu and its dialogs. `fresh`: the wiki is new (fewer than 10 articles, no build from history run yet), so it can be built from the project's history; after that it is rebuilt. */
export function WikiActions({ id, job, refresh, fresh }: { id: string; job: WikiJob | null; refresh: () => void; fresh?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [rebuild, setRebuild] = useState(false);
  const [restore, setRestore] = useState(false);
  const [build, setBuild] = useState(false);
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
        {fresh ? (
          <MenuItem
            icon={<Hammer size={15} />}
            disabled={running}
            onClick={() => {
              setMenu(false);
              setBuild(true);
            }}
          >
            Build from history…
          </MenuItem>
        ) : (
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
        )}
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
      {build && <BuildDialog id={id} onClose={() => setBuild(false)} onStarted={refresh} />}
      {rebuild && <RebuildDialog id={id} onClose={() => setRebuild(false)} onStarted={refresh} />}
      {restore && job && <RestoreDialog id={id} archives={job.archives} onClose={() => setRestore(false)} onDone={refresh} />}
    </>
  );
}

/**
 * A new wiki's way in (fewer than 10 articles, no build from history run yet, whatever it holds): when the project has something to
 * build its wiki from, a line saying what, and Build from history… (the same dialog as the ⋯ menu's). Nothing when there is nothing to
 * read, or while a job runs.
 */
export function BuildFromHistoryPrompt({ id, offer, job, onStarted }: { id: string; offer: Offer | null; job: WikiJob | null; onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  if (!offer?.worth || !offer.fresh || job?.state === 'running') return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 min-[480px]:flex-row min-[480px]:items-center">
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg-2">{tr(`It can be built now from what the project already has: ${readsLine(offer.counts)}.`)}</p>
      <Button variant="primary" size="sm" className="min-h-11 w-full min-[480px]:min-h-0 min-[480px]:w-auto" onClick={() => setOpen(true)}>
        Build from history…
      </Button>
      {open && <BuildDialog id={id} onClose={() => setOpen(false)} onStarted={onStarted} />}
    </div>
  );
}

/** What a job costs, in words: the Claude plan on Automatic, else the price when the app has one. */
function costLine(h: { model?: string; label: string; priced: boolean; usd?: number; usdMax?: number }): string {
  if (h.model === 'auto' || (h.model === undefined && h.label === 'Automatic' && !h.priced)) return tr('It uses your Claude plan.');
  if (!h.priced) return tr(`${h.label} has no price in the app: its cost is not known.`);
  return h.usdMax != null && h.usdMax > (h.usd ?? 0) ? tr(`About ${usd(h.usd ?? 0)}, at most ${usd(h.usdMax)}, with ${h.label}.`) : tr(`About ${usd(h.usd ?? 0)} with ${h.label}.`);
}

function BuildDialog({ id, onClose, onStarted }: { id: string; onClose: () => void; onStarted: () => void }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Offer>(`/api/projects/${enc(id)}/wiki/build`).then(setOffer, (e) => setError((e as Error).message));
  }, [id]);
  const start = async () => {
    setBusy(true);
    try {
      await post(`/api/projects/${enc(id)}/wiki/build`, { confirm: true });
      toast(tr('Building memory from the project’s history'));
      onStarted();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr('Build from history')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void start()} disabled={!offer || busy || !offer.worth || !offer.fresh}>
            Build
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px] leading-relaxed">
        <p>Hydor reads what this project has that its wiki has not read: its files, memory notes, conversations, commit messages and documents. It reads what matters most first and the rest after, several at a time, and then organises the articles into areas. You can stop it and continue later, and keep working meanwhile.</p>
        {!offer && !error && <Throbber />}
        {offer && !offer.worth && <p className="text-fg-3">There is nothing to read yet.</p>}
        {offer && offer.worth && (
          <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
            <div translate="no" className="font-medium">
              {readsLine(offer.counts)}
            </div>
            <div className="text-fg-3">{tr(`${minutesText(offer.minutesEssentials)} for what matters most, ${minutesText(offer.minutesAll)} in all.`)}</div>
            <div className="text-fg-3">{costLine({ ...offer.helper, model: offer.helper.label === 'Automatic' ? 'auto' : undefined })}</div>
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
  const cost = estimate ? (estimate.helper.model === 'auto' ? tr('Automatic uses your Claude account’s usage: Claude Haiku, and Sonnet for the areas.') : costLine(estimate.helper)) : '';
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
        <p>Hydor reads every source this wiki was built from again (the text of its documents, conversations, commit messages and notes moved from memory), and what the wiki never read: the project's files, its commit history, its memory notes, and the documents and conversations it has not read yet. It writes the articles, areas and hubs anew. The sources, plans and memory notes stay as they are.</p>
        <p>The current wiki is archived first, and you can put it back with Restore the previous wiki (the last three are kept, and the wiki as it was before its first rebuild). Paths of articles that are gone lead to the new articles that hold what they said.</p>
        {!estimate && !error && <Throbber />}
        {estimate && (
          <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
            <div className="font-medium">{tr(`${estimate.sources} sources · about ${estimate.calls} helper calls · ${Math.round(estimate.chars / 1000)}k characters to read`)}</div>
            {estimate.reads && (
              <div translate="no" className="text-fg-3">
                {readsLine({ sessions: estimate.reads.sessions, commits: estimate.reads.commits, documents: estimate.reads.documents, notes: estimate.reads.notes, files: estimate.reads.files })}
              </div>
            )}
            {estimate.callsMax > estimate.calls && <div className="text-fg-3">{tr(`Up to ${estimate.callsMax} calls if earlier articles that no new one covers must be read again.`)}</div>}
            <div className="text-fg-3">{cost}</div>
            <div className="text-fg-3">{estimate.minutes ? tr(`${minutesText(estimate.minutes)}, ${estimate.workers ?? 1} at a time. You can keep working meanwhile.`) : tr('You can keep working meanwhile.')}</div>
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
