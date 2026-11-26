// The choice of a service for one of an app's needs (server/webapps/services.ts), in a session or in a dialog on the app's
// page: the services offered side by side (stacked on a phone), the first recommended, each with the one sentence it is
// chosen by, what a small app pays and its catch; why others are left
// out, folded. Choosing sets it and puts up the keys card for it under this one. Prices carry the day they were read.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, CircleCheck, ExternalLink, Package, Plug, X } from 'lucide-react';
import type { ServicesCardView, ServiceView } from '@shared/services';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { api, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { Button, cx, IconButton, Throbber } from '../../components/ui';
import { KeysCard } from '../connections/KeysCard';
import { useUI } from '../../lib/store';

export const readDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded text-accent hover:underline">
    {children}
    <ExternalLink size={11} />
  </a>
);

/** What it costs, or that the page has to be looked at. */
function Costs({ s }: { s: ServiceView }) {
  if (s.checkPrice)
    return (
      <p className="text-[12.5px] leading-snug text-fg-3">
        <Link href={s.page}>Check the current price</Link>
      </p>
    );
  // The label sits in the line, not in a column of its own: three cards side by side have no width to spare.
  return (
    <div className="space-y-1 text-[12.5px] leading-snug">
      {s.free && (
        <p>
          <span className="mr-1.5 text-fg-3">Free</span>
          <span translate="no" className="text-fg">
            {s.free}
          </span>
        </p>
      )}
      {s.paid && (
        <p>
          <span className="mr-1.5 text-fg-3">{s.free ? tr('Then') : tr('Price')}</span>
          <span translate="no" className="text-fg-2">
            {s.paid}
          </span>
        </p>
      )}
    </div>
  );
}

function Option({ s, chosen, busy, disabled, onChoose }: { s: ServiceView; chosen: boolean; busy: boolean; disabled: boolean; onChoose: () => void }) {
  return (
    <li data-service={s.id} className={cx('flex min-w-0 flex-col gap-2 rounded-xl border bg-panel p-3', s.recommended ? 'border-accent/45' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span translate="no" className="text-[14px] font-semibold">
          {s.name}
        </span>
        {s.recommended && <span className="rounded bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">Recommended</span>}
        {chosen && <CircleCheck size={14} aria-label={tr('Chosen')} className="text-ok" />}
      </div>
      <p translate="no" className="text-[13px] leading-snug text-fg-2">
        {s.why}
      </p>
      <Costs s={s} />
      {s.catch && (
        <p className="text-[12px] leading-snug text-fg-3">
          <span className="font-medium text-fg-2">Catch:</span> <span translate="no">{s.catch}</span>
        </p>
      )}
      {s.notFor?.map((n) => (
        <p key={n} className="text-[12px] leading-snug text-fg-3">
          <span className="font-medium text-fg-2">Not for:</span> <span translate="no">{n}</span>
        </p>
      ))}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
        <Button size="sm" variant={s.recommended ? 'primary' : 'secondary'} disabled={disabled} icon={busy ? <Throbber size={12} /> : undefined} onClick={onChoose}>
          {busy ? tr('Setting it up…') : tr(`Use ${s.name}`)}
        </Button>
        {!s.checkPrice && (
          <span className="text-[12px]">
            <Link href={s.page}>Pricing</Link>
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * `embedded`: in a dialog of a web app's page, with `onClose` for its X. `initial`: the card as the dialog was given it.
 */
export function ServicesCard({ id, embedded, onClose, initial }: { id: string; embedded?: boolean; onClose?: () => void; initial?: ServicesCardView }) {
  const technical = useUI((s) => s.technicalDetails);
  const [card, setCard] = useState<ServicesCardView | null>(initial ?? null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [again, setAgain] = useState(false);
  const load = useCallback(() => {
    api<{ card: ServicesCardView }>(`/api/webapps/services/cards/${enc(id)}`).then(
      (r) => setCard(r.card),
      () => setGone(true),
    );
  }, [id]);
  useEffect(load, [load]);
  useFeatureEvent('webapps', load);
  const shell = (body: ReactNode, tone?: 'ok') =>
    embedded ? (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{body}</div>
    ) : (
      <div data-services-card={id} className={cx('tl-item my-1.5 rounded-2xl border px-3.5 py-3', tone === 'ok' ? 'border-ok/25 bg-ok/6' : 'border-accent/35 bg-accent-soft')}>
        {body}
      </div>
    );
  if (gone) return embedded ? shell(<p className="text-[13px] text-fg-3">This card is not there any more.</p>) : null;
  if (!card)
    return shell(
      <div className="flex items-center gap-2 text-[13px] text-fg-3">
        <Throbber /> Looking at what is offered…
      </div>,
    );
  const need = card.need;
  const choose = async (s: ServiceView) => {
    setBusy(s.id);
    setError('');
    try {
      await post(`/api/webapps/${enc(card.app.id)}/services/${enc(need.id)}`, { service: s.id, card: card.id });
      setAgain(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const chosen = card.chosen;
  const head = (title: string, sub: string) => (
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-fg">
        <Plug size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{title}</div>
        <div translate="no" className="text-[12.5px] leading-snug text-fg-3">
          {sub}
        </div>
      </div>
      {embedded && onClose && (
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      )}
    </div>
  );
  // Chosen: what was, what happened to the app's settings, and the keys.
  if (chosen && !again)
    return (
      <>
        {shell(
          <div className="space-y-2.5">
            {embedded && head(tr(`${need.name}: ${chosen.name}`), card.app.name)}
            <div className="flex items-start gap-2 text-[13px] leading-snug">
              <CircleCheck size={15} className="mt-px shrink-0 text-ok" />
              <div className="min-w-0 flex-1 text-fg-2">
                {!embedded && (
                  <div className="text-fg">
                    <b translate="no">{chosen.name}</b> {tr('for')} <span translate="no">{need.name.toLowerCase()}</span>
                  </div>
                )}
                <div translate="no" className="break-words">
                  {technical ? chosen.applied.say : chosen.applied.state === 'outside' ? tr('Set it up on its own site.') : tr('The agent adds it to your app.')}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setAgain(true)}>
                Change
              </Button>
            </div>
          </div>,
          'ok',
        )}
        {card.keysCard && <KeysCard key={card.keysCard} id={card.keysCard} embedded={embedded} onClose={onClose} />}
      </>
    );
  // By the width the card has, not the window's: beside the app's panel a conversation is narrow on a wide screen too.
  const columns = need.services.length >= 3 ? '@min-[36rem]:grid-cols-3' : need.services.length === 2 ? '@min-[26rem]:grid-cols-2' : '';
  const out = need.leftOut;
  const names = out.map((x) => x.name);
  return shell(
    <div className="@container space-y-3">
      {head(tr(`Choose a service for ${need.name.toLowerCase()}`), `${card.app.name}: ${need.what}.`)}
      {need.builtIn && (
        <p translate="no" className="text-[12.5px] leading-snug text-fg-2">
          {need.builtIn.say}
        </p>
      )}
      <ul className={cx('grid grid-cols-1 gap-2.5', columns)}>
        {need.services.map((s) => (
          <Option key={s.id} s={s} chosen={chosen?.service === s.id} busy={busy === s.id} disabled={!!busy} onChoose={() => void choose(s)} />
        ))}
      </ul>
      {need.services.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button size="sm" variant="ghost" data-you-decide disabled={!!busy} onClick={() => void choose(need.services.find((s) => s.recommended) ?? need.services[0])}>
            You decide
          </Button>
          <span className="text-[12px] text-fg-3">Takes the recommended one.</span>
        </div>
      )}
      {need.also.map((s) => (
        <div key={s.id} data-service={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] leading-snug text-fg-3">
          <span className="min-w-0 flex-1 basis-60" translate="no">
            <span className="font-medium text-fg-2">{s.name}:</span> {s.why} {s.catch}
          </span>
          <Button size="sm" variant="ghost" disabled={!!busy} icon={busy === s.id ? <Throbber size={12} /> : chosen?.service === s.id ? <Check size={13} /> : undefined} onClick={() => void choose(s)}>
            {tr('Use this instead')}
          </Button>
        </div>
      ))}
      {need.note && (
        <p translate="no" className="text-[12.5px] leading-snug text-fg-3">
          {need.note}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[12.5px] leading-snug text-err">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5 text-[12px] text-fg-3">
        {!!out.length && (
          <details className="min-w-0 flex-1 basis-60">
            <summary className="cursor-pointer select-none hover:text-fg-2">
              {tr('Why not')} <span translate="no">{names.length > 2 ? `${names.slice(0, 2).join(', ')}…` : names.join(', ')}</span>?
            </summary>
            <ul className="mt-1.5 space-y-1 leading-snug">
              {out.map((x) => (
                <li key={x.name} translate="no">
                  <span className="font-medium text-fg-2">{x.name}:</span> {x.why}.
                  {x.url && (
                    <>
                      {' '}
                      <Link href={x.url}>{tr('See why')}</Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {need.readOn && <span className="ml-auto shrink-0">{tr(`Prices as read on ${readDay(need.readOn)}`)}</span>}
      </div>
      {chosen && again && (
        <Button size="sm" variant="ghost" onClick={() => setAgain(false)}>
          Keep <span translate="no">{chosen.name}</span>
        </Button>
      )}
    </div>,
  );
}
