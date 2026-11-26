// The card that asks for several credentials at once, each with how to get it (shared/keys.ts): a tab for each (rows
// that open on a phone) with who gives it, the steps, the provider's page, its fields and Save; Skip where it may be
// skipped; a saved value offered as it is ("Use the one saved on …") or replaced, never shown; a quiet warning when a
// paste plainly is not it; and a button that tries a web app's key once saved. In a session (request_secret,
// webapp_keys) and in a dialog on a web app's page. Values go straight to the vault and are kept only here, in the
// fields, until saved.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, CircleCheck, ExternalLink, KeyRound, LockKeyhole, Minus, RotateCw, TriangleAlert, X } from 'lucide-react';
import { cleanDomains } from '@shared/connections';
import { cardCount, filled, isLiveKey, isPaymentsKey, notThis, pasteWarning, type CardFieldView, type CardItemView, type KeysCardView, type ReuseSource } from '@shared/keys';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { api, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { Button, cx, IconButton, inputCls, Switch, Throbber, useIsMobile } from '../../components/ui';
import { SecretInput } from './ConnectDialog';
import { useUI } from '../../lib/store';

const day = (t: number) => new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(new Date(t).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}) });

/** A place a web app's key is for, as it is called: inside Hydor, your server, or a server's environment by name. */
export const placeName = (env: string, only?: boolean) => (env === 'hydor' ? tr('Inside Hydor') : only ? tr('Your server') : tr(`Server ${env}`));

/** With Technical details off, a web app's tab is called after who gives the key, never after a variable. */
export const plainTitle = (it: Pick<CardItemView, 'title' | 'from'>): string => (it.from ? tr(`A key from ${it.from}`) : /^[A-Z0-9]+(_[A-Z0-9]+)+$|_/.test(it.title) ? tr('A key it needs') : it.title);

const reuseLabel = (s: ReuseSource) =>
  s.kind === 'vault' ? tr('Use the one in your vault')
  : s.kind === 'app' ? tr(`Use the one saved for ${s.app ?? ''} (${placeName(s.env ?? 'hydor', s.only)})`)
  // This app's own, for another of its places: a sentence of its own each, as a place's name does not read inside one.
  : (s.env ?? 'hydor') === 'hydor' ? tr('Use the one saved inside Hydor')
  : s.only ? tr('Use the one saved for your server')
  : tr(`Use the one saved for the server ${s.env}`);

/** When the item's saved keys were saved (the latest of them). */
const savedOn = (it: CardItemView) => Math.max(0, ...it.fields.map((f) => f.savedAt ?? 0));

/** Every key it needs is in the vault, and may be used here. */
const allThere = (it: CardItemView) => it.fields.some((f) => f.secret) && it.fields.every((f) => f.secret && (f.optional || (!!f.savedAt && !f.refused)));

interface Draft {
  values: Record<string, string>;
  replacing: boolean;
  hosts: string | null;
  commands: boolean | null;
  /** The steps: open until it is filled, unless the person says. */
  how: boolean | null;
  error: string;
  busy: boolean;
}
const EMPTY: Draft = { values: {}, replacing: false, hosts: null, commands: null, how: null, error: '', busy: false };

function Mark({ item, small }: { item: CardItemView; small?: boolean }) {
  const size = small ? 'h-3.5 w-3.5' : 'h-4 w-4';
  if (filled(item.state))
    return (
      <span role="img" aria-label={tr('Saved')} className={cx('grid shrink-0 place-items-center rounded-full bg-ok text-bg', size)}>
        <Check size={small ? 9 : 11} strokeWidth={3.5} />
      </span>
    );
  if (item.state === 'skipped')
    return (
      <span role="img" aria-label={tr('Skipped')} className={cx('grid shrink-0 place-items-center rounded-full bg-bg-3 text-fg-3', size)}>
        <Minus size={small ? 9 : 11} strokeWidth={3} />
      </span>
    );
  return <span role="img" aria-label={tr('To do')} className={cx('shrink-0 rounded-full border-[1.5px] border-fg-3/70', size)} />;
}

/** One field: its label, the box, and under it the hint, or the warning in its place (the room is kept, so nothing jumps). */
function Field({ card, item, f, value, onChange, onEnter }: { card: KeysCardView; item: CardItemView; f: CardFieldView; value: string; onChange: (v: string) => void; onEnter: () => void }) {
  const id = useId();
  // A web app's key is the app's own business: its variable's name is for those who asked for technical details.
  const technical = useUI((s) => s.technicalDetails) || !card.app;
  const test = !!card.inside && f.secret && isPaymentsKey(item, f) && /(SECRET|API|RESTRICTED)_KEY/.test(f.key);
  const live = !!card.inside && f.secret && isPaymentsKey(item, f) && isLiveKey(value);
  const first = pasteWarning(value, f);
  // Inside Hydor a payments key is a test key, whatever else is said of what a right one looks like.
  const wrong = live ? null : first ?? (test ? pasteWarning(value, { key: f.key, looks: { prefix: ['sk_test_', 'rk_test_'] } }) : null);
  // What hydor.json (or the catalog) says of the paste that this is: "That is the publishable key…".
  const said = notThis(value, f.looks)?.say;
  const placeholder = f.savedAt ? tr(`Saved ${day(f.savedAt)}: leave empty to keep it`) : undefined;
  // A hydor.json's sentence finishes "a right value …"; an agent's is a sentence of its own.
  const right = f.looks?.say ? (f.looks.whole ? `A right value ${f.looks.say.replace(/\.$/, '')}.` : f.looks.say) : '';
  const hint = test ? (
    <span>{tr('A test key: it starts sk_test_. No money moves inside Hydor.')}</span>
  ) : right || (item.fields.length === 1 && item.hint) ? (
    <span translate="no">{right || item.hint}</span>
  ) : null;
  const warning: ReactNode = live ? (
    // Its own warning for a live key here, where it has one.
    said ? <span translate="no">{said}</span> : <span>{tr('A live key is refused here: an app inside Hydor takes a test key (sk_test_…).')}</span>
  ) : wrong === 'line' ? (
    <span>{tr('That looks like the whole line: paste only what comes after the = sign.')}</span>
  ) : wrong === 'quotes' ? (
    <span>{tr('The quotes around it are probably not part of it.')}</span>
  ) : wrong === 'not' ? (
    <span translate="no">{said}</span>
  ) : wrong === 'looks' ? (
    <span>
      {tr('This does not look like it.')} {test ? tr('A test key starts sk_test_.') : right ? <span translate="no">{right}</span> : f.looks?.prefix?.length ? tr(`It usually starts with ${f.looks.prefix.join(' / ')}`) : null}
    </span>
  ) : null;
  const common = { autoComplete: 'off', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false, 'data-1p-ignore': true } as const;
  return (
    <div className="block text-[12.5px]">
      <label htmlFor={id} className="mb-1 flex flex-wrap items-baseline gap-x-2 text-fg-2">
        <span translate="no" className="font-medium">
          {f.label}
        </span>
        {f.optional && <span className="text-[11.5px] text-fg-3">optional</span>}
        {f.secret ? (
          technical && (
            <code translate="no" className="ml-auto text-[11px] text-fg-3">
              {f.key}
            </code>
          )
        ) : (
          <span className="ml-auto text-[11.5px] text-fg-3">The agent sees this one</span>
        )}
      </label>
      {f.help && (
        <p translate="no" className="-mt-0.5 mb-1 text-[12px] leading-snug text-fg-3">
          {f.help}
        </p>
      )}
      {f.type === 'password' ? (
        <SecretInput value={value} onChange={onChange} onEnter={onEnter} placeholder={placeholder ?? tr('Paste it here')} label={f.label} describedBy={`${id}-hint`} invalid={live} />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter()}
          type={f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'}
          inputMode={f.type === 'number' ? 'numeric' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : undefined}
          placeholder={placeholder ?? (f.secret ? tr('Paste it here') : undefined)}
          aria-describedby={`${id}-hint`}
          className={cx(inputCls, 'font-mono text-[16px] sm:text-[13.5px]')}
          {...common}
        />
      )}
      <div id={`${id}-hint`} aria-live="polite" className={cx('mt-1 flex min-h-[2.75em] items-start gap-1.5 text-[12px] leading-snug sm:min-h-[1.4em]', live ? 'text-err' : warning ? 'text-warn' : 'text-fg-3')}>
        {warning && <TriangleAlert size={12} className="mt-[2px] shrink-0" />}
        {warning ?? hint}
      </div>
    </div>
  );
}

function Steps({ item, open, onToggle }: { item: CardItemView; open: boolean; onToggle: () => void }) {
  const id = useId();
  if (!item.how?.length && !item.url) return null;
  const page = item.url ? (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-accent hover:underline">
      {item.from ? tr(`Open ${item.from}’s page`) : tr('Open the provider’s page')}
      <ExternalLink size={13} />
    </a>
  ) : null;
  if (!item.how?.length) return <div>{page}</div>;
  return (
    <div className="rounded-xl border border-line bg-bg-1">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium text-fg-2 hover:text-fg">
        <span className="flex-1">How to get it</span>
        {!open && <span className="tnum text-[11.5px] font-normal text-fg-3">{tr(item.how.length === 1 ? '1 step' : `${item.how.length} steps`)}</span>}
        <ChevronDown size={14} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={id} className="space-y-2.5 px-3 pb-3">
          <ol className="space-y-1.5">
            {item.how.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-fg-2">
                <span aria-hidden className="tnum grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-accent-soft text-[10.5px] font-semibold text-accent">
                  {i + 1}
                </span>
                <span translate="no" className="min-w-0 break-words">
                  {s}
                </span>
              </li>
            ))}
          </ol>
          {page}
        </div>
      )}
    </div>
  );
}

function Panel({ card, item, draft, set, save, use, reuse, skip, closed }: { card: KeysCardView; item: CardItemView; draft: Draft; set: (d: Partial<Draft>) => void; save: () => void; use: () => void; reuse: (id: string) => void; skip: () => void; closed: boolean }) {
  const done = filled(item.state) && !draft.replacing;
  const there = allThere(item);
  // A saved value is offered as it is: no boxes until Replace.
  const offer = item.state === 'todo' && there && !draft.replacing && !item.replace;
  const refused = item.fields.some((f) => f.refused);
  const on = savedOn(item);
  const secrets = item.fields.filter((f) => f.secret);
  const ready = item.fields.every((f) => f.optional || (draft.values[f.key] ?? '').trim() || (f.secret && f.savedAt && !f.refused)) && (secrets.length === 0 || secrets.some((f) => (draft.values[f.key] ?? '').trim() || (f.savedAt && !f.refused)));
  const typed = item.fields.some((f) => (draft.values[f.key] ?? '').trim());
  const blocked = !!card.inside && item.fields.some((f) => f.secret && isPaymentsKey(item, f) && isLiveKey(draft.values[f.key] ?? ''));
  const how = draft.how ?? !done;
  const hosts = draft.hosts ?? item.domains.join(', ');
  const commands = draft.commands ?? !!(item.commands || item.fields.some((f) => f.commandsOn));
  const agentCard = !card.byName;
  // Who gives it, unless its title says so already.
  const from = item.from && !item.title.toLowerCase().includes(item.from.toLowerCase()) ? item.from : undefined;
  // The other tabs that would do instead of this one (Resend or Postmark).
  const instead = (item.or ?? []).map((id) => card.items.find((i) => i.id === id)?.title).filter(Boolean).join(' / ');
  return (
    <div className="space-y-3">
      <div>
        {(from || item.optional) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
            {from && <span>{tr(`From ${from}`)}</span>}
            {item.optional && <span className="rounded bg-bg-3 px-1.5 py-px text-[10.5px] font-medium text-fg-2">optional</span>}
          </div>
        )}
        {item.why && (
          <p translate="no" className="mt-0.5 text-[13px] leading-relaxed text-fg-2">
            {item.why}
          </p>
        )}
        {instead && <p className="mt-1 text-[12.5px] leading-snug text-fg-3">{tr(`Either this or ${instead} is enough.`)}</p>}
      </div>
      <Steps item={item} open={how} onToggle={() => set({ how: !how })} />
      {done ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg">
              <CircleCheck size={15} className="shrink-0 text-ok" />
              {item.state === 'used' && on ? tr(`In your vault, saved ${day(on)}`) : tr('Saved in your vault')}
            </span>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => set({ replacing: true, error: '' })}>
              Replace
            </Button>
          </div>
        </div>
      ) : item.state === 'skipped' && !draft.replacing ? (
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-fg-3">
          <span>Skipped for now.</span>
          <Button size="sm" variant="ghost" onClick={() => set({ replacing: true })}>
            Add it after all
          </Button>
        </div>
      ) : offer ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={draft.busy} onClick={use}>
              {tr(`Use the one saved on ${day(on)}`)}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => set({ replacing: true })}>
              Replace
            </Button>
          </div>
          {agentCard && (
            <Grants item={item} hosts={hosts} commands={commands} set={set} />
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {refused && (
            <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-warn">
              <TriangleAlert size={13} className="mt-[2px] shrink-0" />
              <span>The saved one is a live key, which an app inside Hydor does not take. Give a test key here.</span>
            </p>
          )}
          {!!item.reuse?.length && (
            <div className="space-y-1.5" data-keys-reuse>
              <div className="flex flex-wrap gap-2">
                {item.reuse.map((s) => (
                  <Button key={s.id} size="sm" variant="secondary" disabled={draft.busy} onClick={() => reuse(s.id)} className="h-auto min-h-8 py-1 text-left whitespace-normal">
                    {reuseLabel(s)}
                  </Button>
                ))}
              </div>
              <p className="text-[12px] text-fg-3">Or paste another one. A copy is kept for this place.</p>
            </div>
          )}
          {item.fields.map((f) => (
            <Field key={f.key} card={card} item={item} f={f} value={draft.values[f.key] ?? ''} onChange={(v) => set({ values: { ...draft.values, [f.key]: v }, error: '' })} onEnter={() => ready && !blocked && save()} />
          ))}
          {agentCard && <Grants item={item} hosts={hosts} commands={commands} set={set} />}
        </div>
      )}
      {draft.error && (
        <p role="alert" className="text-[12.5px] leading-snug text-err">
          {draft.error}
        </p>
      )}
      {!done && !offer && !(item.state === 'skipped' && !draft.replacing) && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" disabled={!ready || blocked || draft.busy || (draft.replacing && !typed)} onClick={save}>
            {draft.busy ? 'Saving…' : 'Save'}
          </Button>
          {draft.replacing && (
            <Button size="sm" variant="ghost" onClick={() => set({ replacing: false, values: {}, error: '' })}>
              Cancel
            </Button>
          )}
          {item.skippable && item.state === 'todo' && !closed && (
            <Button size="sm" variant="ghost" disabled={draft.busy} onClick={skip}>
              Skip for now
            </Button>
          )}
        </div>
      )}
      {offer && item.skippable && !closed && (
        <Button size="sm" variant="ghost" disabled={draft.busy} onClick={skip}>
          Skip for now
        </Button>
      )}
    </div>
  );
}

/** An agent's card: where the key may be sent, and whether commands may have it, as the plain card asks. */
function Grants({ item, hosts, commands, set }: { item: CardItemView; hosts: string; commands: boolean; set: (d: Partial<Draft>) => void }) {
  const parsed = cleanDomains(hosts);
  const label = item.fields.filter((f) => f.secret).length > 1 ? 'Commands on this computer may use them' : 'Commands on this computer may use it';
  return (
    <>
      <label className="block text-[12.5px]">
        <span className="mb-1 block text-fg-3">Only sent to</span>
        <input value={hosts} onChange={(e) => set({ hosts: e.target.value })} placeholder="api.example.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cx(inputCls, 'h-8.5 font-mono text-[16px] sm:text-[12.5px]')} />
        {!parsed.length && !commands && <span className="mt-1 block text-warn">Add the host it is for, or agents cannot use it.</span>}
      </label>
      {item.commands && (
        <div className="flex items-start gap-2.5 text-[12.5px]">
          <Switch on={commands} onChange={(v) => set({ commands: v })} label={label} className="mt-px" />
          <span className="min-w-0 leading-snug">
            <span className="block text-fg-2">{label}</span>
            <span className="block text-fg-3">You are asked before a command runs with it, unless the session has full access.</span>
          </span>
        </div>
      )}
    </>
  );
}

/**
 * `embedded`: in a dialog of a web app's page, with `onClose` for its X, and `next` what its button does once the card is
 * answered (Continue to the launch, or Done).
 */
export function KeysCard({ id, embedded, onClose, next, initial }: { id: string; embedded?: boolean; onClose?: () => void; next?: { label: string; go: () => void }; initial?: KeysCardView }) {
  const mobile = useIsMobile();
  const technical = useUI((s) => s.technicalDetails);
  const [card, setCard] = useState<KeysCardView | null>(initial ?? null);
  const [gone, setGone] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [again, setAgain] = useState(false);
  const tabs = useRef<HTMLDivElement>(null);
  const base = useId();
  const load = useCallback(() => {
    api<{ card: KeysCardView }>(`/api/connections/requests/${enc(id)}`).then(
      (r) => setCard(r.card),
      () => setGone(true),
    );
  }, [id]);
  useEffect(load, [load]);
  useFeatureEvent('connections', (e) => (!e.key || !card || e.key === card.key) && load());
  // The first tab to do is the one open (rows on a phone: that one too).
  useEffect(() => {
    if (card && open === null) setOpen((card.items.find((i) => i.state === 'todo') ?? card.items[0])?.id ?? '');
  }, [card, open]);

  const draft = (i: string) => drafts[i] ?? EMPTY;
  const set = (i: string, d: Partial<Draft>) => setDrafts((all) => ({ ...all, [i]: { ...(all[i] ?? EMPTY), ...d } }));

  const shell = (body: ReactNode, tone?: 'ok' | 'muted') =>
    embedded ? (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{body}</div>
    ) : (
      <div data-keys-card={id} className={cx('tl-item my-1.5 rounded-2xl border px-3.5 py-3', tone === 'ok' ? 'border-ok/25 bg-ok/6' : tone === 'muted' ? 'border-line bg-bg-1' : 'border-accent/35 bg-accent-soft')}>{body}</div>
    );
  if (gone) return embedded ? shell(<p className="text-[13px] text-fg-3">This card is not there any more.</p>) : null;
  if (!card)
    return shell(
      <div className="flex items-center gap-2 text-[13px] text-fg-3">
        <Throbber /> Asking for keys…
      </div>,
      'muted',
    );

  const items = !technical && card.app ? card.items.map((i) => ({ ...i, title: plainTitle(i) })) : card.items;
  const many = items.length > 1;
  const count = cardCount(items);
  const closed = card.state === 'dismissed';
  const allAnswered = items.every((i) => i.state !== 'todo');
  const replacing = Object.values(drafts).some((d) => d.replacing);

  const after = (now: KeysCardView, i: string) => {
    setCard(now);
    // On to the next one to do.
    const it = now.items.find((x) => x.id === i);
    // On to the next one still wanted: not one this one does instead of.
    const todo = now.items.find((x) => x.state === 'todo' && x.id !== i && !(filled(it?.state ?? 'todo') && x.or?.includes(i)));
    if (todo) setOpen(todo.id);
  };
  const send = async (item: CardItemView, path: string, body?: unknown) => {
    set(item.id, { busy: true, error: '' });
    try {
      const r = await post<{ card: KeysCardView }>(`/api/connections/requests/${enc(id)}/items/${enc(item.id)}${path}`, body);
      // What was typed is dropped as soon as it is saved.
      setDrafts((all) => ({ ...all, [item.id]: EMPTY }));
      after(r.card, item.id);
    } catch (e) {
      set(item.id, { busy: false, error: (e as Error).message });
    }
  };
  const grants = (item: CardItemView) => {
    if (card.byName) return {};
    const d = draft(item.id);
    return {
      ...(d.hosts !== null ? { domains: d.hosts } : { domains: item.domains }),
      ...(item.commands ? { commands: d.commands ?? true } : {}),
    };
  };
  const close = async () => {
    try {
      const r = await post<{ card: KeysCardView }>(`/api/connections/requests/${enc(id)}/dismiss`);
      setCard(r.card);
    } catch {
      load();
    }
    onClose?.();
  };
  const panel = (item: CardItemView) => (
    <Panel
      card={card}
      item={item}
      closed={closed}
      draft={draft(item.id)}
      set={(d) => set(item.id, d)}
      save={() => void send(item, '', { values: draft(item.id).values, ...grants(item) })}
      use={() => void send(item, '', { use: true, ...grants(item) })}
      reuse={(source) => void send(item, '', { reuse: source })}
      skip={() => void send(item, '/skip')}
    />
  );

  const title = card.app ? tr(`Keys for ${card.app.name}`) : many ? (card.title ?? tr('The agent asks for keys')) : tr('The agent asks for a key');
  const where = card.app ? (card.app.env === 'hydor' ? tr('For inside Hydor') : card.app.only ? tr('For your server') : tr(`For the server environment ${card.app.env}`)) : null;

  // Answered, and nothing being changed: what became of each, in a line.
  if (!embedded && !again && !replacing && (closed || (card.state === 'saved' && allAnswered))) {
    return shell(
      <div className="flex items-start gap-2 text-[13px] leading-snug text-fg-2">
        {closed ? <KeyRound size={15} className="mt-px shrink-0 text-fg-3" /> : <CircleCheck size={15} className="mt-px shrink-0 text-ok" />}
        <div className="min-w-0 flex-1">
          <div>{closed ? tr('You closed the card.') : card.byName ? tr('Done. The app gets these by name; agents never see them.') : tr('Done. The agent was told; it never sees the values.')}</div>
          <ul className="mt-1 space-y-0.5">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-[12.5px] text-fg-3">
                <Mark item={i} small />
                <span translate="no" className="min-w-0 truncate">
                  {i.title}
                </span>
                <span>{filled(i.state) ? tr('saved') : i.state === 'skipped' ? tr('skipped') : tr('not given')}</span>
              </li>
            ))}
          </ul>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAgain(true)}>
          {closed ? tr('Open it again') : tr('Change')}
        </Button>
      </div>,
      closed ? 'muted' : 'ok',
    );
  }

  const at = Math.max(0, items.findIndex((i) => i.id === open));
  const current = items[at];
  const key = (e: KeyboardEvent) => {
    const to = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = items[(to + items.length) % items.length];
    setOpen(next.id);
    tabs.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(next.id)}"]`)?.focus();
  };

  return shell(
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-fg">
          <KeyRound size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium" translate={!card.app && card.title ? 'no' : undefined}>
            {title}
          </div>
          {where && <div className="text-[12.5px] text-fg-3">{where}</div>}
          {!card.app && !many && current && (
            <div translate="no" className="text-[13px] break-words text-fg">
              {current.title}
            </div>
          )}
          {card.why && (
            <div translate="no" className="mt-0.5 text-[13px] leading-relaxed text-fg-2">
              {card.why}
            </div>
          )}
        </div>
        {many && (
          <span aria-live="polite" className="tnum mt-1 shrink-0 rounded-md bg-bg-2 px-1.5 py-0.5 text-[11.5px] text-fg-2">
            {tr(`${count.done} of ${count.of}`)}
          </span>
        )}
        {embedded && onClose && (
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X size={16} />
          </IconButton>
        )}
      </div>

      {!many && current ? (
        panel(current)
      ) : mobile ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {items.map((i) => {
            const on = open === i.id;
            return (
              <li key={i.id}>
                <button type="button" aria-expanded={on} aria-controls={`${base}-${i.id}`} onClick={() => setOpen(on ? '' : i.id)} className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left">
                  <Mark item={i} />
                  <span translate="no" className={cx('min-w-0 flex-1 truncate text-[13.5px]', on ? 'font-semibold text-fg' : 'text-fg-2')}>
                    {i.title}
                  </span>
                  {i.optional && !on && <span className="shrink-0 text-[11.5px] text-fg-3">optional</span>}
                  <ChevronDown size={15} className={cx('shrink-0 text-fg-3 transition-transform', on && 'rotate-180')} />
                </button>
                {on && (
                  <div id={`${base}-${i.id}`} className="px-3 pt-1 pb-3">
                    {panel(i)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div ref={tabs} role="tablist" aria-label={title} onKeyDown={key} className="flex overflow-x-auto border-b border-line bg-bg-1 [scrollbar-width:thin]">
            {items.map((i) => {
              const on = current?.id === i.id;
              return (
                <button
                  key={i.id}
                  type="button"
                  role="tab"
                  id={`${base}-tab-${i.id}`}
                  data-item={i.id}
                  aria-selected={on}
                  aria-controls={`${base}-panel`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setOpen(i.id)}
                  title={i.title}
                  className={cx('relative flex min-w-0 shrink items-center gap-2 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors', on ? 'font-semibold text-fg' : 'text-fg-3 hover:text-fg-2', items.length > 3 ? 'max-w-[12rem]' : 'max-w-[16rem]')}
                >
                  <Mark item={i} />
                  <span translate="no" className="min-w-0 truncate">
                    {i.title}
                  </span>
                  {on && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" />}
                </button>
              );
            })}
          </div>
          {current && (
            <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${current.id}`} className="px-3.5 py-3">
              {/* With many tabs a title may be cut short in its tab: said whole here. */}
              {items.length > 3 && (
                <div translate="no" className="mb-1.5 text-[14px] font-semibold break-words">
                  {current.title}
                </div>
              )}
              {panel(current)}
            </div>
          )}
        </div>
      )}

      {card.inside && (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-3" data-keys-preview>
          <RotateCw size={12} className="mt-px shrink-0" />
          <span>Preview restarts to pick up a new key. The launched version gets it the next time it starts.</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex min-w-0 flex-1 basis-60 items-start gap-1.5 text-[11.5px] leading-snug text-fg-3">
          <LockKeyhole size={12} className="mt-px shrink-0" />
          {items.reduce((n, i) => n + i.fields.filter((f) => f.secret).length, 0) > 1
            ? card.byName
              ? 'Straight to the encrypted vault. The app gets them by name; agents never see them.'
              : 'Straight to the encrypted vault; the agent never sees them.'
            : card.byName
              ? 'Straight to the encrypted vault. The app gets it by name; agents never see it.'
              : 'Straight to the encrypted vault; the agent never sees it.'}
        </span>
        {card.state === 'saved' && !allAnswered && !embedded && <span className="text-[12px] text-fg-2">{card.byName ? 'The needed ones are in. The rest are yours to add.' : 'The agent has what it needs. The rest are yours to add.'}</span>}
        {card.state === 'pending' && (
          <Button size="sm" variant="ghost" onClick={() => void close()}>
            {items.some((i) => i.state === 'saved' || i.state === 'skipped') ? 'Close without the rest' : 'Not now'}
          </Button>
        )}
        {card.state !== 'pending' && embedded && (
          <Button size="sm" variant="primary" onClick={next ? next.go : onClose}>
            {next && card.state === 'saved' ? next.label : tr('Done')}
          </Button>
        )}
        {card.state !== 'pending' && !embedded && again && allAnswered && (
          <Button size="sm" variant="ghost" onClick={() => setAgain(false)}>
            Done
          </Button>
        )}
      </div>
    </div>,
  );
}
