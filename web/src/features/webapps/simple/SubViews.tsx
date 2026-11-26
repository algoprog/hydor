// What is behind More on a web app's simple page, each a plain list: what it keeps, backups, keys and services, the
// checks and earlier versions. Drawn from what they are given (Sub.tsx reads it).
import type { ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, KeyRound, RotateCcw } from 'lucide-react';
import type { AppKey, RunBackup, WebAppStep } from '@shared/webapps';
import { stillMissing } from '@shared/keys';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { Button, cx, IconButton, Throbber } from '../../../components/ui';
import { ago } from '../time';
import { CARD, CheckedView, type CheckedProps } from './HomeView';
import { humanName, keyTitle, keyWhy } from './plain';

export function SubFrame({ title, line, onBack, children }: { title: string; line?: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[720px] space-y-4 px-4 py-4 sm:px-6 sm:py-6" data-simple="sub">
      <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1 text-[13px] font-medium text-fg-2 hover:text-fg">
        <ArrowLeft size={15} />
        Back to the app
      </button>
      <div>
        <h2 translate="no" className="text-[20px] font-semibold tracking-tight">
          {title}
        </h2>
        {line && (
          <p translate="no" className="mt-1 text-[13.5px] leading-snug text-fg-2">
            {line}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

const Quiet = ({ children }: { children: ReactNode }) => <p className={cx(CARD, 'text-[13.5px] leading-relaxed text-fg-2')}>{children}</p>;

// ---- what it keeps -----------------------------------------------------------------------------------------------------------------

export interface KeptPage {
  columns: { name: string; hidden?: boolean }[];
  rows: (string | number | null)[][];
  total: number;
  offset: number;
}

export function DataView({ tables, open, page, onOpen, onPage }: { tables: { name: string; rows: number }[]; open?: string; page?: KeptPage | null; onOpen: (name: string) => void; onPage: (offset: number) => void }) {
  // What libraries keep for themselves is not the person's.
  const mine = tables.filter((t) => !t.name.startsWith('_') && !t.name.startsWith('sqlite'));
  if (!mine.length) return <Quiet>It keeps nothing yet. What people add in the app shows here.</Quiet>;
  return (
    <ul className="space-y-2" data-kept>
      {mine.map((t) => {
        const on = open === t.name;
        return (
          <li key={t.name} className={cx(CARD, 'p-0')}>
            <button type="button" aria-expanded={on} onClick={() => onOpen(on ? '' : t.name)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left">
              <span translate="no" className="min-w-0 flex-1 truncate text-[14px] font-medium">
                {humanName(t.name)}
              </span>
              <span className="tnum text-[13px] text-fg-3">{t.rows.toLocaleString(LOCALE)}</span>
              <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform', on && 'rotate-90')} />
            </button>
            {on && (
              <div className="border-t border-line px-4 py-3">
                {!page ? (
                  <Throbber size={16} />
                ) : !page.rows.length ? (
                  <p className="text-[13px] text-fg-3">Nothing here yet.</p>
                ) : (
                  <>
                    <ul className="divide-y divide-line">
                      {page.rows.map((r, i) => (
                        <li key={i} className="py-2 first:pt-0">
                          <dl className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]">
                            {page.columns.map((c, j) =>
                              c.name === 'id' || c.name.endsWith('_id') || r[j] === null || r[j] === '' ? null : (
                                <div key={c.name} className="contents">
                                  <dt className="text-fg-3">{humanName(c.name)}</dt>
                                  <dd translate="no" className="min-w-0 break-words">
                                    {c.hidden ? '••••' : String(r[j]).slice(0, 160)}
                                  </dd>
                                </div>
                              ),
                            )}
                          </dl>
                        </li>
                      ))}
                    </ul>
                    {page.total > page.rows.length && (
                      <div className="mt-2 flex items-center justify-end gap-2 text-[12.5px] text-fg-3">
                        <span className="tnum">{tr(`${page.offset + 1} to ${page.offset + page.rows.length} of ${page.total}`)}</span>
                        <IconButton label="Earlier" size="sm" disabled={page.offset === 0} onClick={() => onPage(Math.max(0, page.offset - 10))}>
                          <ChevronLeft size={15} />
                        </IconButton>
                        <IconButton label="Later" size="sm" disabled={page.offset + page.rows.length >= page.total} onClick={() => onPage(page.offset + 10)}>
                          <ChevronRight size={15} />
                        </IconButton>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---- backups -----------------------------------------------------------------------------------------------------------------------

export const dayAndTime = (t: number) => new Date(t).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

export function BackupsView({ where, backups, busy, onNow, onRestore }: { where: 'none' | 'here' | 'server'; backups: RunBackup[]; busy?: string | null; onNow: () => void; onRestore: (b: RunBackup) => void }) {
  if (where === 'none') return <Quiet>Copies of what it keeps are made once it is put online, also when that is only here.</Quiet>;
  return (
    <section className={CARD} data-backups>
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 basis-56 text-[13.5px] leading-snug text-fg-2">A copy of everything it keeps is made every night, and before each change goes online.</p>
        <Button size="sm" variant="primary" icon={busy === 'now' ? <Throbber size={12} /> : undefined} disabled={!!busy} onClick={onNow}>
          Make a copy now
        </Button>
      </div>
      {backups.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-fg-3">No copy yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {backups.slice(0, 10).map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 last:pb-0">
              <span className="tnum min-w-0 flex-1 text-[13.5px]">{dayAndTime(b.at)}</span>
              <Button size="sm" variant="ghost" icon={busy === b.id ? <Throbber size={12} /> : <RotateCcw size={13} />} disabled={!!busy} onClick={() => onRestore(b)}>
                Put this one back
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- keys and services ---------------------------------------------------------------------------------------------------------------

export interface KeysProps {
  keys: AppKey[];
  /** The key is for the version on the person's server. */
  onServer?: boolean;
  onAdd: (k: AppKey, replace: boolean) => void;
  services: { need: string; needName: string; name: string }[];
  onService?: (need: string) => void;
  models?: { allowed: boolean; usdPerDay: number; spentUsd: number; allow: (on: boolean) => void } | null;
  mail?: { on: boolean; choose: () => void } | null;
  work?: { name: string; open: () => void } | null;
}

export function KeysView({ keys, onServer, onAdd, services, onService, models, mail, work }: KeysProps) {
  const mine = keys.filter((k) => k.givenBy === 'provider' || k.givenBy === 'you');
  const nothing = !mine.length && !services.length && !models && !mail && !work;
  if (nothing) return <Quiet>It needs no keys. When it uses something that does, the agent asks you for it, and it shows here.</Quiet>;
  const row = 'flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0';
  return (
    <>
      {mine.length > 0 && (
        <section className={CARD} data-keys-plain>
          <h3 className="text-[13px] font-semibold text-fg-2">{onServer ? 'Keys, on your server' : 'Keys'}</h3>
          <ul className="mt-2 divide-y divide-line">
            {mine.map((k) => {
              const missing = stillMissing(k);
              return (
                <li key={k.name} className={row}>
                  <KeyRound size={15} className={cx('shrink-0', missing ? 'text-warn' : 'text-fg-3')} />
                  <div className="min-w-0 flex-1 basis-48">
                    <div translate="no" className="text-[14px] font-medium">
                      {keyTitle(k)}
                    </div>
                    <div className="text-[12.5px] leading-snug text-fg-3">
                      {keyWhy(k.why) && <span translate="no">{`${keyWhy(k.why)} `}</span>}
                      <span className={cx(missing && 'text-warn')}>{k.set && !k.refused ? 'Added.' : k.needed ? 'Not added yet.' : 'Not added: it works without.'}</span>
                    </div>
                  </div>
                  <Button size="sm" variant={missing ? 'primary' : 'ghost'} onClick={() => onAdd(k, k.set)}>
                    {k.set && !k.refused ? 'Replace' : 'Add it'}
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12px] leading-snug text-fg-3">What you paste goes into your encrypted vault. The agent never sees it.</p>
        </section>
      )}
      {(models || mail || services.length > 0 || work) && (
        <section className={CARD} data-services-plain>
          <h3 className="text-[13px] font-semibold text-fg-2">What it uses</h3>
          <ul className="mt-2 divide-y divide-line">
            {models && (
              <li className={row}>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="text-[14px] font-medium">Your AI models</div>
                  <div className="text-[12.5px] text-fg-3">{models.allowed ? tr(`Up to $${models.usdPerDay} a day; $${models.spentUsd.toFixed(2)} used today.`) : tr('Not allowed.')}</div>
                </div>
                <Button size="sm" variant={models.allowed ? 'ghost' : 'primary'} onClick={() => models.allow(!models.allowed)}>
                  {models.allowed ? 'Turn it off' : 'Allow'}
                </Button>
              </li>
            )}
            {mail && (
              <li className={row}>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="text-[14px] font-medium">Sending mail</div>
                  <div className="text-[12.5px] text-fg-3">{mail.on ? 'Allowed.' : 'Not allowed.'}</div>
                </div>
                <Button size="sm" variant={mail.on ? 'ghost' : 'primary'} onClick={mail.choose}>
                  {mail.on ? 'Change' : 'Choose'}
                </Button>
              </li>
            )}
            {services.map((s) => (
              <li key={s.need} className={row}>
                <div className="min-w-0 flex-1 basis-48">
                  <div translate="no" className="text-[14px] font-medium">
                    {s.name}
                  </div>
                  <div translate="no" className="text-[12.5px] text-fg-3">
                    {s.needName}
                  </div>
                </div>
                {onService && (
                  <Button size="sm" variant="ghost" onClick={() => onService(s.need)}>
                    Change
                  </Button>
                )}
              </li>
            ))}
            {work && (
              <li className={row}>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="text-[14px] font-medium">Work agents do for it</div>
                  <div translate="no" className="text-[12.5px] text-fg-3">
                    {work.name}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={work.open}>
                  Open
                </Button>
              </li>
            )}
          </ul>
        </section>
      )}
    </>
  );
}

// ---- the checks and earlier versions -------------------------------------------------------------------------------------------------

export function ChecksView({ checked, at, onAgain }: { checked: CheckedProps; at: number | null; onAgain: () => void }) {
  return (
    <>
      <CheckedView {...checked} onAgain={undefined} />
      <p className="text-[13px] leading-relaxed text-fg-3">Hydor tries the app on a copy of it, with made-up information, after each change: that it starts, keeps what it is given, shows only what it should, and reads well on a phone.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={checked.line.state === 'checking'} onClick={onAgain}>
          Check again
        </Button>
        {at && <span className="text-[12.5px] text-fg-3">{tr(`Checked ${ago(at)}`)}</span>}
      </div>
    </>
  );
}

export function VersionsView({ steps, working, onBack }: { steps: WebAppStep[]; working?: string | null; onBack: (s: WebAppStep) => void }) {
  if (!steps.length) return <Quiet>Nothing is saved yet. Each change you accept is kept here, and you can go back to any of them.</Quiet>;
  return (
    <section className={CARD} data-versions>
      <ul className="divide-y divide-line">
        {steps.map((s, i) => (
          <li key={s.sha} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1 basis-56">
              <div translate="no" className="text-[13.5px] leading-snug break-words">
                {s.message}
              </div>
              <div className="mt-0.5 text-[12.5px] text-fg-3">
                <span translate="no">{ago(s.at)}</span>
                {i === 0 && <span> · the way it is now</span>}
              </div>
            </div>
            {i < steps.length - 1 && (
              <Button size="sm" variant="ghost" icon={working === s.sha ? <Throbber size={12} /> : <RotateCcw size={13} />} disabled={!!working} onClick={() => onBack(s)}>
                Go back to before this
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
