// The dialogs of a project's wiki jobs, which the Memory tab's ⋯ menu and its build offer open: Build from history, Rebuild
// from sources and Restore an earlier wiki. What the wiki is doing is WikiJobProgress's.
import { useEffect, useState } from 'react';
import { Button, Dialog, Throbber } from '../../components/ui';
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
export function readsLine(c: { sessions: number; commits: number; documents: number; notes: number; files: string[] }): string {
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

export const minutesText = (m: number) => (m >= 90 ? tr(`about ${Math.round(m / 60)} h`) : tr(`about ${Math.max(1, m)} min`));

/** What a job costs, in words: the Claude plan on Automatic, else the price when the app has one. */
function costLine(h: { model?: string; label: string; priced: boolean; usd?: number; usdMax?: number }): string {
  if (h.model === 'auto' || (h.model === undefined && h.label === 'Automatic' && !h.priced)) return tr('It uses your Claude plan.');
  if (!h.priced) return tr(`${h.label} has no price in the app: its cost is not known.`);
  return h.usdMax != null && h.usdMax > (h.usd ?? 0) ? tr(`About ${usd(h.usd ?? 0)}, at most ${usd(h.usdMax)}, with ${h.label}.`) : tr(`About ${usd(h.usd ?? 0)} with ${h.label}.`);
}

export function BuildDialog({ id, onClose, onStarted }: { id: string; onClose: () => void; onStarted: () => void }) {
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

export function RebuildDialog({ id, onClose, onStarted }: { id: string; onClose: () => void; onStarted: () => void }) {
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

export function RestoreDialog({ id, archives, onClose, onDone }: { id: string; archives: WikiJob['archives']; onClose: () => void; onDone: () => void }) {
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
