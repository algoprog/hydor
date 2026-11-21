// The one-line notices of a project's Memory tab, between its chips and its list; each shows only when it has something to say.
import { useState, type ReactNode } from 'react';
import { Hammer, TriangleAlert } from 'lucide-react';
import { Button } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { BuildDialog, readsLine } from '../../wiki/WikiActions';
import type { BuildOffer, WikiJob } from '../../wiki/wikiJob';

/** A strip: an icon, a line (cut short, whole in its title), what to do. */
function Strip({ icon, children, title, action }: { icon: ReactNode; children: ReactNode; title?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-2 rounded-xl border border-line bg-panel px-3 py-1 text-[12.5px] text-fg-2">
      <span className="shrink-0 text-fg-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate" title={title}>
        {children}
      </span>
      {action}
    </div>
  );
}

/** A new wiki that the project's files, notes, conversations, commits or documents can fill: what it would read, and the way to build it. */
export function OfferStrip({ id, offer, job, onStarted }: { id: string; offer: BuildOffer | null; job: WikiJob | null; onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  if (!offer?.worth || !offer.fresh || job?.state === 'running') return null;
  const line = tr(`It can be built now from what the project already has: ${readsLine(offer.counts)}.`);
  return (
    <>
      <Strip
        icon={<Hammer size={14} />}
        title={line}
        action={
          <Button size="sm" variant="ghost" className="!h-7 shrink-0 !px-2 text-[12.5px] text-accent" onClick={() => setOpen(true)}>
            Build from history…
          </Button>
        }
      >
        {line}
      </Strip>
      {open && <BuildDialog id={id} onClose={() => setOpen(false)} onStarted={onStarted} />}
    </>
  );
}

/** Updates that failed in the last week: how many, the first reason, and the way to the list. */
export function FailedStrip({ count, first, onSee }: { count: number; first: string; onSee: () => void }) {
  if (!count) return null;
  const head = count === 1 ? tr('The wiki could not learn from 1 source lately') : tr(`The wiki could not learn from ${count} sources lately`);
  return (
    <Strip
      icon={<TriangleAlert size={14} className="text-warn" />}
      title={`${head}: ${first}`}
      action={
        <Button size="sm" variant="ghost" className="!h-7 shrink-0 !px-2 text-[12.5px] text-accent" onClick={onSee}>
          See
        </Button>
      }
    >
      {head}: <span translate="no">{first}</span>
    </Strip>
  );
}

/** The wiki could not be opened: what the server said. */
export function WikiErrorStrip({ error }: { error?: string }) {
  return (
    <Strip icon={<TriangleAlert size={14} className="text-err" />} title={error}>
      <span role="alert">{error ? <span translate="no">{error}</span> : 'The project’s wiki memory could not be opened.'}</span>
    </Strip>
  );
}
