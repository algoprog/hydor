// A web app's keys on its page: each by name with who gives it and what is set for each place (inside Hydor, a server),
// how to get it, Remove, and Add or Replace on the keys card (connections/KeysCard.tsx) in a dialog. Also that dialog (the Launch tab puts it up before a
// launch's own question) and the line on Features that says a key is missing. Names only: values are never read back.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, KeyRound } from 'lucide-react';
import { stillMissing, type KeysCardView } from '@shared/keys';
import type { AppKey, AppKeyPlace, WebApp, WebAppKeys } from '@shared/webapps';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { api, del, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Section, Throbber, useConfirm } from '../../components/ui';
import { KeysCard, placeName } from '../connections/KeysCard';

export const askable = (k: AppKey) => k.givenBy === 'provider' || k.givenBy === 'you';
export const missingKeys = (v: WebAppKeys | null | undefined) => (v?.keys ?? []).filter(stillMissing);

const keysUrl = (id: string, env: string) => `/api/webapps/${enc(id)}/keys?env=${enc(env)}`;
export const readKeys = (id: string, env: string) => api<WebAppKeys>(keysUrl(id, env));

/** The keys of one environment, read again when one is saved or removed. */
export function useAppKeys(id: string, env: string | null) {
  const [data, setData] = useState<WebAppKeys | null>(null);
  const load = useCallback(() => {
    if (!env) return;
    readKeys(id, env).then(setData, () => setData(null));
  }, [id, env]);
  useEffect(load, [load]);
  useFeatureEvent('connections', load);
  useFeatureEvent('webapps', load);
  return { data: data && data.env === env ? data : null, load };
}

export interface KeysAsk {
  env: string;
  names?: string[];
  replace?: boolean;
  skippable?: boolean;
  /** What the dialog's button does once the keys are in (a launch's Continue). */
  next?: { label: string; go: () => void };
}

/** The keys card in a dialog: it is made as the dialog opens; with nothing to ask, `next` goes straight on. */
export function KeysDialog({ app, ask, onClose }: { app: { id: string; name: string }; ask: KeysAsk | null; onClose: () => void }) {
  const [card, setCard] = useState<KeysCardView | null>(null);
  const asked = useRef<KeysAsk | null>(null);
  useEffect(() => {
    setCard(null);
    if (!ask) {
      asked.current = null;
      return;
    }
    if (asked.current === ask) return;
    asked.current = ask;
    post<{ card: KeysCardView | null }>(`/api/webapps/${enc(app.id)}/keys/card`, { env: ask.env, names: ask.names, replace: ask.replace, skippable: ask.skippable }).then(
      (r) => {
        if (r.card) return setCard(r.card);
        onClose();
        if (ask.next) ask.next.go();
        else toast(tr('There is nothing to ask for.'), 'ok');
      },
      (e) => {
        toastError(e);
        onClose();
      },
    );
  }, [ask, app.id, onClose]);
  if (!ask) return null;
  const next = ask.next && { label: ask.next.label, go: () => (onClose(), ask.next!.go()) };
  return (
    <Dialog open onClose={onClose} bare width={640} label={tr(`Keys for ${app.name}`)}>
      {card ? (
        <KeysCard id={card.id} initial={card} embedded onClose={onClose} next={next} />
      ) : (
        <div className="flex justify-center py-14 text-fg-3">
          <Throbber size={24} />
        </div>
      )}
    </Dialog>
  );
}

const who = (k: AppKey) =>
  k.givenBy === 'host' ? tr('Hydor or the server gives it') : k.givenBy === 'made' ? tr('Made for the app') : k.givenBy === 'you' ? tr('Yours to choose') : k.from ? tr(`From ${k.from}`) : tr('From its provider');

const date = (t: number) => new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(new Date(t).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}) });

/** The only server environment of an app is "your server". */
const onlyServer = (v: WebAppKeys, env: string) => v.servers.length === 1 && v.servers[0] === env;

/** One place of one key: what is set there, and what can be done about it. Never a value. */
function Place({ k, p, only, onAsk, onRemove }: { k: AppKey; p: AppKeyPlace; only: boolean; onAsk: (replace: boolean) => void; onRemove: () => void }) {
  const can = askable(k);
  const state = !can ? 'made' : p.refused ? 'refused' : p.set ? 'set' : p.needed ? 'missing' : 'optional';
  const words =
    k.givenBy === 'made' ? (p.env === 'hydor' ? tr('Hydor makes it') : tr('The server makes it'))
    : p.refused ? tr('a live key: not used here')
    : p.set ? (p.savedAt ? tr(`set ${date(p.savedAt)}`) : tr('set'))
    : p.needed ? tr('not set, needed')
    : tr('not set');
  return (
    <li className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1" data-place={p.env} data-state={state}>
      <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', state === 'set' ? 'bg-ok' : state === 'missing' || state === 'refused' ? 'bg-warn' : 'bg-fg-4')} />
      <span className="min-w-0 flex-1 basis-40 text-[12.5px] max-sm:basis-24">
        <span className="text-fg-2">{placeName(p.env, only)}:</span> <span className={state === 'missing' || state === 'refused' ? 'text-warn' : 'text-fg-3'}>{words}</span>
      </span>
      {can && (
        <span className="ml-auto flex items-center gap-1 max-sm:gap-0">
          <Button size="sm" variant={p.needed && (!p.set || p.refused) ? 'secondary' : 'ghost'} className="h-7 max-sm:px-2" onClick={() => onAsk(p.set)}>
            {p.set ? tr('Replace') : tr('Add it')}
          </Button>
          {p.set && (
            <Button size="sm" variant="ghost" className="h-7 max-sm:px-2" onClick={onRemove}>
              {tr('Remove')}
            </Button>
          )}
        </span>
      )}
    </li>
  );
}

function Row({ k, view, onAsk, onRemove }: { k: AppKey; view: WebAppKeys; onAsk: (env: string, replace: boolean) => void; onRemove: (env: string) => void }) {
  const [open, setOpen] = useState(false);
  const can = askable(k);
  const more = !!(k.how?.length || k.url || k.why);
  return (
    <li className="py-3 text-[13.5px] first:pt-1" data-key={k.name}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <KeyRound size={14} className="shrink-0 text-fg-3" />
        <code translate="no" className="font-medium break-all">
          {k.name}
        </code>
        <span className="text-[12px] text-fg-3">{who(k)}</span>
        {more && can && (
          <Button size="sm" variant="ghost" className="ml-auto h-7" aria-expanded={open} icon={<ChevronDown size={13} className={cx('transition-transform', open && 'rotate-180')} />} onClick={() => setOpen((o) => !o)}>
            How to get it
          </Button>
        )}
      </div>
      {k.givenBy !== 'host' && (
        // On a phone the places start at the edge, and their buttons are narrower, so that each place and its buttons stay on one line.
        <ul className="mt-1 ml-6 space-y-0.5 max-sm:ml-0">
          {(k.places ?? []).map((p) => (
            <Place key={p.env} k={k} p={p} only={onlyServer(view, p.env)} onAsk={(replace) => onAsk(p.env, replace)} onRemove={() => onRemove(p.env)} />
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-2 ml-6 space-y-2 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
          {k.why && (
            <p translate="no" className="text-[12.5px] leading-relaxed text-fg-2">
              {k.why}
            </p>
          )}
          {!!k.how?.length && (
            <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-snug text-fg-2">
              {k.how.map((s, i) => (
                <li key={i} translate="no">
                  {s}
                </li>
              ))}
            </ol>
          )}
          {k.url && (
            <a href={k.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
              {k.from && k.givenBy === 'provider' ? tr(`Open ${k.from}’s page`) : tr('Open the provider’s page')}
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/** The list of what the app needs: each key with what is set in each place. `none`: what to show when it needs nothing. */
function KeysSection({ app, none }: { app: WebApp; none?: React.ReactNode }) {
  const { data, load } = useAppKeys(app.id, 'all');
  const [ask, setAsk] = useState<KeysAsk | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const close = useCallback(() => {
    setAsk(null);
    load();
  }, [load]);
  // Nothing to show for an app that needs only what is given to it.
  if (!data || !data.keys.some((k) => k.givenBy !== 'host')) return data && none ? <>{none}</> : null;
  const rows = data.keys.filter((k) => k.givenBy !== 'host').sort((a, b) => Number(!askable(a)) - Number(!askable(b)) || Number(!a.needed) - Number(!b.needed));
  const lacking = data.envs.map((env) => ({ env, n: rows.filter((k) => askable(k) && k.places?.some((p) => p.env === env && p.needed && (!p.set || p.refused))).length })).filter((x) => x.n > 1);
  const remove = async (name: string, env: string) => {
    const place = placeName(env, onlyServer(data, env));
    if (!(await confirm({ title: tr(`Remove ${name} for ${place}?`), body: 'The app goes without it there, and its value is gone for good. Other places keep theirs.', confirm: tr('Remove'), danger: true }))) return;
    await del(`/api/webapps/${enc(app.id)}/keys/${enc(name)}?env=${enc(env)}`).catch(toastError);
    load();
  };
  return (
    <Section title="Keys it needs" sub="The app’s own, one value for each place: kept in your vault, given to it by name, never written in a file or a log, and never shown again.">
      <ul className="divide-y divide-line" data-launch="keys">
        {rows.map((k) => (
          <Row
            key={k.name}
            k={k}
            view={data}
            onAsk={(env, replace) => setAsk({ env, names: [k.name], replace, skippable: env === 'hydor' })}
            onRemove={(env) => void remove(k.name, env)}
          />
        ))}
      </ul>
      {lacking.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {lacking.map((x) => (
            <Button key={x.env} size="sm" variant="secondary" icon={<KeyRound size={13} />} onClick={() => setAsk({ env: x.env, skippable: x.env === 'hydor' })}>
              {x.env === 'hydor' ? tr('Add what inside Hydor lacks') : onlyServer(data, x.env) ? tr('Add what your server lacks') : tr(`Add what the server ${x.env} lacks`)}
            </Button>
          ))}
        </div>
      )}
      <KeysDialog app={app} ask={ask} onClose={close} />
      {confirmNode}
    </Section>
  );
}

/** The Keys tab: the keys its hydor.json lists, and what Hydor gives besides. */
export function KeysTab({ app }: { app: WebApp }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6" data-tab="keys">
      <KeysSection
        app={app}
        none={
          <Section title="Keys it needs">
            <p className="text-[13.5px] leading-snug text-fg-2">{tr('Its hydor.json lists no keys. When it uses a service that needs one, the agent adds it there, and this is where you give it.')}</p>
          </Section>
        }
      />
      <p className="text-[13px] leading-snug text-fg-3">
        Each key is given to the app by name as it starts, never written in the app’s folder: inside this Hydor one value for the version being changed and the launched one (a payments key there is a test key), and on a server of your own values of its own.
      </p>
    </div>
  );
}
