// The card for a web app's mail, on its Overview, when it sends mail through Hydor (its hydor.json lists `mail`): it says what mail inside Hydor is for (not account mail), warns
// that a link in it opens for no one outside (and, with no APPS_DOMAIN, only on this computer), and before anything is sent says what would happen ("send mail from … , up to … a day"), with the account to pick and the most a day; allowed, the owner sees today's count against that, changes the account or the limit, or turns
// it off. Hydor sends; the app holds no password. Only the launched version sends: while the app is being made its mail is kept, unless the second switch ("Also send while it is being made", off by
// default) says otherwise, and each side has a count of its own. What is shown is counts: never an address the app sent to, never a word of a mail (server/webapps/mail.ts).
import { useState } from 'react';
import { Link2Off, Mail } from 'lucide-react';
import { WEBAPP_MAIL_MAX_PER_DAY, type WebApp, type WebAppMailPage, type WebAppMailRecord } from '@shared/webapps';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { enc, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Badge, Button, cx, inputCls, Section, Switch } from '../../components/ui';
import { useLoaded } from './api';
import { ago } from './time';

const num = (n: number) => n.toLocaleString(LOCALE);
/** When the day's count starts again, in the reader's own time. */
const at = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
const people = (n: number) => (n === 1 ? tr('1 person') : tr(`${num(n)} people`));

/** How one request to send ended, in words. */
function outcome(r: WebAppMailRecord): string {
  const why: Record<NonNullable<WebAppMailRecord['reason']>, string> = {
    ask: tr('not allowed yet'),
    off: tr('turned off'),
    making: tr('it is being made'),
    'no-account': tr('no account to send from'),
    limit: tr('over the limit'),
    'sign-in': tr('the account did not accept it'),
    server: tr('the mail server could not take it'),
    recipient: tr('the address was refused'),
    content: tr('the mail was refused'),
    restart: tr('Hydor restarted'),
  };
  const because = r.reason ? `: ${why[r.reason]}` : '';
  if (r.status === 'sent') return tr('Sent');
  if (r.status === 'sending') return tr('Sending');
  if (r.status === 'queued') return `${tr('Waiting to be sent')}${because}`;
  if (r.status === 'partial') return `${tr(`Sent to ${num(r.sent)} of ${num(r.recipients)}`)}${because}`;
  if (r.reason === 'making') return tr('Kept in the app: it is being made');
  if (r.status === 'refused') return `${tr('Refused')}${because}`;
  return `${tr('Not sent')}${because}`;
}

export function MailUse({ app, reload }: { app: WebApp; reload: () => Promise<void> }) {
  const page = useLoaded<WebAppMailPage>(app.mail ? `/api/webapps/${enc(app.id)}/mail` : null);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState('');
  const [limit, setLimit] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const mail = page.data?.mail ?? app.mail;
  if (!mail || !page.data) return null;
  const { accounts, recent } = page.data;
  const account = accounts.find((a) => a.id === picked) ?? accounts.find((a) => a.id === mail.account?.id) ?? accounts[0];
  const n = Number(limit ?? mail.perDay);
  const limitOk = (limit ?? 'x').trim() !== '' && Number.isInteger(n) && n >= 1 && n <= WEBAPP_MAIL_MAX_PER_DAY;
  const save = async (change: { on?: boolean; account?: string; perDay?: number; whileMaking?: boolean }) => {
    setSaving(true);
    try {
      await put(`/api/webapps/${enc(app.id)}`, { settings: { mail: change } });
      setLimit(null);
      setPicked('');
      await Promise.all([page.reload(), reload()]);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };
  const allowed = mail.state === 'allowed';
  const canSend = accounts.length > 0;
  // The big count is the launched version's; for an app not launched yet there is only the one being made.
  const side = mail.launched ? { today: mail.today, atLimit: mail.atLimit } : mail.making;
  const today = side.today;
  const pct = Math.min(100, Math.round((today.counted / mail.perDay) * 100));
  const tried = mail.today.refused + mail.making.today.refused;
  const last = recent.find((r) => r.status !== 'refused');
  const signInFailed = allowed && !mail.accountGone && last?.reason === 'sign-in';
  const accountField = (
    <label className="flex w-72 min-w-0 flex-col gap-1 max-sm:w-full">
      <span className="text-[12.5px] text-fg-3">{tr('Send from')}</span>
      <select
        data-mail="account"
        translate="no"
        className={cx(inputCls, 'min-w-0')}
        value={allowed && mail.accountGone && !picked ? '' : (account?.id ?? '')}
        disabled={saving}
        onChange={(e) => (allowed ? void save({ account: e.target.value }) : setPicked(e.target.value))}
      >
        {allowed && mail.accountGone && <option value="" disabled>{tr('Pick an account')}</option>}
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.address}
          </option>
        ))}
      </select>
    </label>
  );
  const limitField = (
    <label className="flex w-40 flex-col gap-1 max-sm:w-full">
      <span className="text-[12.5px] text-fg-3">{tr('The most mails a day')}</span>
      <input data-mail="limit" inputMode="numeric" value={limit ?? String(mail.perDay)} onChange={(e) => setLimit(e.target.value)} className={cx(inputCls, 'tnum', limit !== null && !limitOk && 'border-err')} />
    </label>
  );
  return (
    <Section
      title="Mail it may send"
      sub="For a form’s notice and reply, a welcome or a reminder, a newsletter. Hydor sends it from your account, and the app carries no password."
    >
      <div className="space-y-4" data-mail="card">
        {/* A warning, never a refusal: the apps' server lets in only people Hydor signed in, whatever address the app has. */}
        <div className="flex gap-2.5 rounded-xl border border-warn/40 bg-warn/5 px-3.5 py-3 text-[13px] leading-snug" data-mail="links">
          <Link2Off size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p className="min-w-0 break-words text-fg-2">
            {mail.links.local
              ? tr(`Links in its mail will only open on this computer: they point at ${mail.links.host}, and the app has no address other people can reach. To give apps an address of their own, set APPS_DOMAIN and restart Hydor. Even then, a link opens only for someone who has opened the app from Hydor: nobody outside can. Mail without links is fine.`)
              : tr('Links in its mail open only for someone who has opened the app from Hydor: nobody outside can. Mail without links is fine.')}
          </p>
        </div>
        {!canSend && (
          <div className="rounded-xl border border-warn/40 bg-warn/5 p-3.5" data-mail="none">
            <p className="text-[14px] leading-snug font-medium">{tr('This Hydor has no mail account that can send.')}</p>
            <p className="mt-1 text-[13px] leading-snug text-fg-3">
              {tr('Connect one, then allow this app here. Until then the app keeps its mail and says it was not delivered.')}
              {tried > 0 && ' ' + tr(`It has tried ${num(tried)} time${tried === 1 ? '' : 's'} today and was told no.`)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={<Mail size={13} />} onClick={() => go('/apps/connected?tab=market')}>
                Connect an account
              </Button>
              {allowed && (
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => void save({ on: false })}>
                  Turn it off
                </Button>
              )}
            </div>
          </div>
        )}

        {canSend && !allowed && account && (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-3.5" data-mail="ask">
            <p className="text-[14px] leading-snug font-medium break-words">
              {mail.state === 'off' ? tr('Its mail is turned off.') + ' ' : ''}
              {tr(`It would send mail from ${account.address}, up to ${num(limitOk ? n : mail.perDay)} a day.`)}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-fg-3">
              {tr('The app chooses who gets each mail and what it says, and it goes out in your name. Each person it goes to counts as one mail. Nothing is sent until you allow it, and what it tried before is not sent later.')}
              {tried > 0 && ' ' + tr(`It has tried ${num(tried)} time${tried === 1 ? '' : 's'} today and was told no.`)}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-fg-3">{tr('Allowed, only the launched version sends. While it is being made its mail is kept in the app, unless you say otherwise.')}</p>
            {account.keepsCopy && <p className="mt-1 text-[13px] leading-snug text-fg-3">{tr('This account’s provider keeps a copy of each mail in its Sent folder.')}</p>}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              {accountField}
              {limitField}
              <Button variant="primary" icon={<Mail size={14} />} disabled={saving || (limit !== null && !limitOk)} onClick={() => void save({ on: true, account: account.id, ...(limit !== null ? { perDay: n } : {}) })}>
                Allow it
              </Button>
            </div>
          </div>
        )}

        {canSend && allowed && (
          <>
            {(mail.accountGone || signInFailed) && (
              <div className="rounded-xl border border-warn/40 bg-warn/5 px-3.5 py-3 text-[13.5px] leading-snug" data-mail="trouble">
                {mail.accountGone ? tr('The account you chose is not connected any more, so nothing is sent. Pick another.') : tr('The last mail did not go: the account did not accept it. Test it in Apps → Connected apps → Email.')}
              </div>
            )}
            {!mail.launched && !mail.whileMaking && (
              <div className="rounded-xl border border-warn/40 bg-warn/5 px-3.5 py-3 text-[13.5px] leading-snug" data-mail="not-launched">
                {tr('It is not launched yet, so nothing is sent: its mail is kept in the app. Launch it, or switch on sending while it is being made below.')}
              </div>
            )}
            {(mail.launched || mail.whileMaking) && (
              <div data-mail="today">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="tnum text-[20px] font-semibold tracking-tight">{num(today.counted)}</span>
                  <span className="text-[13px] text-fg-3">{mail.launched ? tr(`of ${num(mail.perDay)} mails today from the launched version`) : tr(`of ${num(mail.perDay)} mails today while it is being made`)}</span>
                  {side.atLimit && <Badge tone="warn">{tr(`Stopped until ${at(mail.resetsAt)}`)}</Badge>}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={tr('Mails sent today')}>
                  <div className={cx('h-full rounded-full', pct >= 90 ? 'bg-err' : pct >= 60 ? 'bg-warn' : 'bg-accent')} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-[13px] leading-snug text-fg-3" data-mail="counts">
                  {tr(`${num(today.sent)} sent`)}
                  {today.waiting > 0 && ` · ${tr(`${num(today.waiting)} waiting`)}`}
                  {today.failed > 0 && ` · ${tr(`${num(today.failed)} not sent`)}`}
                  {today.refused > 0 && ` · ${tr(`${num(today.refused)} request${today.refused === 1 ? '' : 's'} refused`)}`}
                  {` · ${tr(`starts again at ${at(mail.resetsAt)}`)}`}
                </p>
                {mail.launched && (mail.whileMaking || mail.making.today.counted > 0) && (
                  <p className="mt-1 text-[13px] leading-snug text-fg-3" data-mail="making-count">
                    {tr(`While it is being made: ${num(mail.making.today.counted)} of ${num(mail.perDay)} today, counted apart.`)}
                    {mail.making.atLimit && ' ' + tr(`Stopped until ${at(mail.resetsAt)}`)}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-start gap-3 rounded-xl bg-bg-2 px-3.5 py-3" data-mail="making">
              <Switch className="mt-0.5" on={mail.whileMaking} disabled={saving || !!mail.accountGone} label={tr('Also send while it is being made')} onChange={(on) => void save({ whileMaking: on })} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">{tr('Also send while it is being made')}</div>
                <p className="mt-0.5 text-[13px] leading-snug text-fg-3">
                  {mail.whileMaking ? tr('What it sends while it is being made now reaches real people, from your account: trying it out with someone’s address mails them.') : tr('Trying the app out would then mail real people. Off, mail from Preview and from an app not launched yet is kept in the app.')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {accountField}
              {limitField}
              <Button variant="secondary" disabled={saving || limit === null || !limitOk || n === mail.perDay} onClick={() => void save({ perDay: n })}>
                Save
              </Button>
              <Button variant="ghost" disabled={saving} onClick={() => void save({ on: false })}>
                Turn it off
              </Button>
            </div>
            {accounts.find((a) => a.id === mail.account?.id)?.keepsCopy && <p className="text-[12.5px] leading-snug text-fg-3">{tr('This account’s provider keeps a copy of each mail in its Sent folder.')}</p>}
          </>
        )}

        {recent.length > 0 && (
          <div data-mail="records">
            <div className="text-[12.5px] text-fg-3">{tr('The last mails (never an address or a word of them)')}</div>
            <ul className="mt-1 divide-y divide-line rounded-xl bg-bg-2 px-3">
              {recent.slice(0, more ? recent.length : 4).map((r, i) => (
                <li key={`${r.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 text-fg-2 max-sm:basis-full">
                    {outcome(r)}
                    {r.making && r.reason !== 'making' && <span className="text-fg-3">{` · ${tr('while being made')}`}</span>}
                  </span>
                  <span className="tnum text-fg-3">{people(r.recipients)}</span>
                  <span className="tnum text-fg-3">{tr(`subject of ${num(r.subjectChars)} characters`)}</span>
                  <span className="tnum text-fg-3">{ago(r.at)}</span>
                </li>
              ))}
            </ul>
            {recent.length > 4 && (
              <button type="button" className="mt-1.5 rounded text-[12.5px] font-medium text-accent hover:underline" aria-expanded={more} onClick={() => setMore((m) => !m)}>
                {more ? tr('Show fewer') : tr('Show more')}
              </button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
