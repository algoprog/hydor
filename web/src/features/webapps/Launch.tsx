// A web app's Launch tab: the places card, then what the person does about each. Inside this Hydor: the two sides (the launched
// version people open, and the one being changed in Preview), Launch again, Back to the launch before. A server of the person's
// own (not for an app that lets Hydor say who is there): the hosts, what runs there (the way back, taking it off), and a launch
// to one, with a confirm card before anything is sent. A launch is a job whose steps show as they end; a failed line of the
// check can be let through on a card.
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Check, CircleAlert, Copy, History as HistoryIcon, Rocket, Server, Undo2 } from 'lucide-react';
import type { LaunchHost, LaunchHostOffer, LaunchJob, LaunchKey, LaunchPlace, LaunchRecord, LaunchStep, WebAppDetail, WebAppLaunchView } from '@shared/webapps';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { api, ApiError, del, enc, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Badge, Button, cx, Dialog, inputCls, Section, Throbber, useConfirm } from '../../components/ui';
import { openWebApp, useLoaded } from './api';
import { KeysDialog, missingKeys, readKeys, type KeysAsk } from './AppKeys';
import { envFor } from './serverPlace';
import { BuildWhere } from './BuildWhere';
import { readDay } from './ServicesCard';
import { ago } from './time';

const when = (t: number) => new Date(t).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const secs = (ms?: number) => (ms ? (ms < 1000 ? '<1 s' : `${Math.round(ms / 1000)} s`) : '');

function StepList({ steps }: { steps: LaunchStep[] }) {
  return (
    <ol className="space-y-1.5" data-launch="steps">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2.5 text-[13.5px]" data-step={s.id} data-state={s.state}>
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
            {s.state === 'running' ? <Throbber size={13} /> : s.state === 'passed' ? <Check size={14} className="text-ok" /> : s.state === 'failed' ? <CircleAlert size={14} className="text-err" /> : <span className={cx('size-1.5 rounded-full', s.state === 'skipped' ? 'bg-fg-4' : 'bg-bg-3')} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx(s.state === 'waiting' && 'text-fg-3', s.state === 'failed' && 'text-err')}>{s.title}</span>
            {s.say && s.state !== 'waiting' && (
              <span translate="no" className="block text-[12.5px] leading-snug break-words text-fg-3">
                {s.say}
              </span>
            )}
            {/* The check's are sentences, a line each; the others are the last lines of a log. */}
            {s.state === 'failed' && !!s.details?.length && s.id === 'check' && (
              <ul translate="no" className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] leading-snug break-words text-fg-2">
                {s.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            {s.state === 'failed' && !!s.details?.length && s.id !== 'check' && (
              <pre translate="no" className="mt-1.5 max-h-48 overflow-auto rounded-lg border border-line bg-bg-2 px-2.5 py-2 font-mono text-[11.5px] leading-snug break-words whitespace-pre-wrap text-fg-2">
                {s.details.join('\n')}
              </pre>
            )}
          </span>
          {s.ms ? <span className="tnum text-[12px] text-fg-3">{secs(s.ms)}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** The card a launch puts when lines of the check that matter failed: the person lets one through (it is written down in the launch) or stops. */
function Override({ app, job, reload }: { app: string; job: LaunchJob; reload: () => Promise<void> }) {
  const stops = job.ask?.kind === 'override' ? job.ask.stops : [];
  const [on, setOn] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const answer = async (body: { override?: string[]; cancel?: boolean }) => {
    setBusy(true);
    try {
      await post(`/api/webapps/${enc(app)}/launch/answer`, body);
      await reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/5 p-4" data-launch="override">
      <h3 className="text-[14px] font-semibold">{stops.length === 1 ? tr('A line of the check failed') : tr(`${stops.length} lines of the check failed`)}</h3>
      <p className="mt-0.5 text-[13px] leading-snug text-fg-2">
        These stop a launch: what the app’s hydor.json says, and on its pages what could hurt someone. Fixing them is better. If you let one through, the launch goes on and it is written down in the launch record, with your name.
      </p>
      <ul className="mt-3 space-y-2.5">
        {stops.map((s) => (
          <li key={s.id} className="flex items-start gap-2.5">
            <input type="checkbox" className="mt-1" checked={on.has(s.id)} onChange={(e) => setOn((o) => (e.target.checked ? new Set([...o, s.id]) : new Set([...o].filter((x) => x !== s.id))))} aria-label={tr(`Let ${s.title} through`)} />
            <div className="min-w-0 text-[13.5px]">
              <span translate="no" className="font-medium">
                {s.title}
              </span>{' '}
              <code translate="no" className="text-[12px] text-fg-3">
                {s.id}
              </code>
              <p translate="no" className="text-[13px] leading-snug text-fg-3">
                {s.text}
              </p>
              {!!s.details?.length && (
                <ul translate="no" className="mt-0.5 text-[12.5px] leading-snug break-words text-fg-2">
                  {s.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              {s.hint && (
                <p translate="no" className="mt-0.5 text-[13px] leading-snug text-fg-3">
                  {s.hint}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" disabled={busy || on.size === 0} onClick={() => void answer({ override: [...on] })}>
          Let the ones I ticked through
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void answer({ cancel: true })}>
          Stop the launch
        </Button>
      </div>
    </div>
  );
}

/** The launch that is going, or the last one that ended: its steps as they end, and what happened. */
function Job({ app, job, reload, onData }: { app: string; job: LaunchJob; reload: () => Promise<void>; onData: () => void }) {
  const running = job.state === 'running' || job.state === 'asking';
  return (
    <Section
      title={job.action === 'back' ? tr('Going back to the launch before') : job.place === 'hydor' ? tr('Launching inside this Hydor') : tr(`Launching to ${job.address?.replace(/^https:\/\//, '') ?? 'a server'}`)}
      sub={running ? tr(`Started ${ago(job.startedAt)}`) : job.state === 'done' ? tr('Done') : tr('It did not finish')}
      actions={running ? <Throbber size={16} /> : job.state === 'done' ? <Badge tone="ok">Done</Badge> : <Badge tone="err">Failed</Badge>}
      className="data-[launch=job]"
    >
      <div data-launch="job" data-state={job.state}>
        <StepList steps={job.steps} />
        {job.state === 'asking' && job.ask?.kind === 'override' && (
          <div className="mt-4">
            <Override app={app} job={job} reload={reload} />
          </div>
        )}
        {!running && job.summary && (
          <p translate="no" className={cx('mt-3 text-[13.5px] leading-snug', job.state === 'failed' ? 'text-err' : 'text-fg-2')}>
            {job.summary}
          </p>
        )}
        {!running && job.state === 'failed' && job.place === 'hydor' && job.problems && job.problems.length > 1 && (
          <ul translate="no" className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] text-fg-2">
            {job.problems.slice(job.problems[0] === job.summary ? 1 : 0).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {!running && !!job.notes?.length && (
          <ul translate="no" className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-snug text-fg-2" data-launch="notes">
            {job.notes.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {!running && job.needsData && (
          <Button className="mt-2.5" size="sm" variant="secondary" icon={<Undo2 size={13} />} onClick={onData}>
            Go back and put the data back too
          </Button>
        )}
        {!running && job.state === 'failed' && job.previousBack && <p className="mt-1.5 text-[13px] text-ok">{tr('The version before came back by itself.')}</p>}
        {!running && typeof job.downtimeSeconds === 'number' && <p className="mt-1.5 text-[13px] text-fg-3">{job.downtimeSeconds === 1 ? tr('People reached nothing for 1 second.') : tr(`People reached nothing for ${job.downtimeSeconds} seconds.`)}</p>}
        {job.overrides && job.overrides.length > 0 && <p className="mt-1.5 text-[12.5px] text-fg-3">{tr(`Let through and written down: ${job.overrides.join(', ')}`)}</p>}
      </div>
    </Section>
  );
}

function LaunchHistory({ rows }: { rows: LaunchRecord[] }) {
  if (!rows.length) return <p className="text-[13.5px] text-fg-3">Nothing has been launched yet.</p>;
  return (
    <ul className="divide-y divide-line" data-launch="history">
      {rows.slice(0, 12).map((r) => (
        <li key={`${r.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-[13.5px] first:pt-0 last:pb-0">
          <Badge tone={r.result === 'live' || r.result === 'back' ? 'ok' : r.result === 'rolled-back' ? 'warn' : 'err'}>{r.result === 'live' ? tr('Live') : r.result === 'back' ? tr('Went back') : r.result === 'rolled-back' ? tr('Put back by itself') : tr('Failed')}</Badge>
          <span className="tnum text-fg-2">{when(r.at)}</span>
          <span translate="no" className="text-fg-3">
            {r.place === 'hydor' ? tr('inside Hydor') : `${r.host ?? r.env}${r.env !== 'production' ? ` (${r.env})` : ''}`}
            {r.version ? ` · ${r.version}` : ''}
            {r.commit ? ` · ${r.commit.slice(0, 8)}` : ''}
            {r.by ? ` · ${r.by}` : ''}
            {r.ms ? ` · ${secs(r.ms)}` : ''}
          </span>
          {r.overrides.length > 0 && (
            <span translate="no" className="text-[12px] text-warn">
              {tr(`let through: ${r.overrides.join(', ')}`)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function PlaceRow({ p, children }: { p: LaunchPlace; children?: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-line bg-bg-1 p-4" data-place={p.id} data-state={p.state}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="text-[14.5px] font-semibold">{p.title}</h3>
        {p.launched ? <Badge tone="ok">{tr(`Launched ${ago(p.launched.at)}`)}</Badge> : p.state === 'unavailable' ? <Badge tone="warn">Not for this app</Badge> : null}
        <span className="flex-1" />
        {p.state === 'ready' && children}
      </div>
      {p.unavailable ? (
        // Not for this app: why and what to do, and nothing about what it would take.
        <p className="mt-1.5 text-[13.5px] leading-snug text-fg-2" data-place-why>
          {tr(p.unavailable)}
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[13.5px] leading-snug text-fg-2">{p.line}</p>
          <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[12.5px] leading-snug text-fg-3 sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-fg-2">Your effort</dt>
            <dd>{p.effort}</dd>
            <dt className="font-medium text-fg-2">Each month</dt>
            <dd>{p.cost}</dd>
          </dl>
        </>
      )}
      {!!p.offers?.length && (
        <ul className="mt-2 space-y-2 border-t border-line pt-2" data-place-offers>
          {p.offers.map((o) => (
            <li key={o.name} className="text-[12.5px] leading-snug text-fg-3">
              <a href={o.page} target="_blank" rel="noopener noreferrer" translate="no" className="font-medium text-fg-2 hover:text-accent hover:underline">
                {o.name}
              </a>
              {o.recommended && p.offers!.length > 1 && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">Recommended</span>}
              <span translate="no">{` · ${o.why}`}</span>
              <div>
                {o.price ? (
                  <span translate="no" className="text-fg-2">
                    {o.price}
                  </span>
                ) : (
                  <a href={o.page} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    Check the current price
                  </a>
                )}
                {o.catch && <span translate="no">{` · ${o.catch}`}</span>}
              </div>
            </li>
          ))}
          {p.notOffered?.map((x) => (
            <li key={x.name} data-place-not-offered className="text-[12px] leading-snug text-fg-3">
              <span translate="no">
                <span className="font-medium text-fg-2">{x.name}:</span> {x.why}.
              </span>{' '}
              <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                See why
              </a>
            </li>
          ))}
          {p.offers.some((o) => o.readOn) && <li className="text-[11.5px] text-fg-3">{tr(`Prices as read on ${readDay(p.offers.find((o) => o.readOn)!.readOn!)}`)}</li>}
        </ul>
      )}
    </li>
  );
}

// ---- hosts -----------------------------------------------------------------------------------------------------------------------

function Copyable({ text, label }: { text: string; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-bg-2 p-2.5">
      <code translate="no" className="min-w-0 flex-1 break-all text-[12px] leading-snug">
        {text}
      </code>
      <Button size="sm" variant="ghost" icon={<Copy size={13} />} aria-label={label} onClick={() => void navigator.clipboard?.writeText(text).then(() => toast(tr('Copied'), 'ok'))}>
        Copy
      </Button>
    </div>
  );
}

/** Adding a server: its name and address, the key Hydor makes for it, the fingerprint to compare, what is on the machine. */
function HostDialog({ open, onClose, onDone, host }: { open: boolean; onClose: () => void; onDone: () => void; host?: LaunchHost }) {
  const [name, setName] = useState('');
  const [ssh, setSsh] = useState('');
  const [made, setMade] = useState<LaunchHost | null>(null);
  const [offer, setOffer] = useState<LaunchHostOffer | null>(null);
  const [checked, setChecked] = useState<{ ok: boolean; looked: { what: string; ok: boolean | null; say: string }[]; steps: string[]; summary: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, asked] = useConfirm();
  useEffect(() => {
    if (!open) return;
    setMade(host ?? null);
    setOffer(null);
    setChecked(host?.checked ? { ok: host.checked.ok, looked: host.checked.looked, steps: [], summary: '' } : null);
    if (!host) (setName(''), setSsh(''));
  }, [open, host]);
  const run = async <T,>(what: string, f: () => Promise<T>): Promise<T | null> => {
    setBusy(what);
    try {
      return await f();
    } catch (e) {
      toastError(e);
      return null;
    } finally {
      setBusy(null);
    }
  };
  const base = made ? `/api/webapps/hosts/${enc(made.name)}` : '';
  const recorded = made?.state === 'recorded';
  return (
    <Dialog open={open} onClose={onClose} title={host ? tr(`The server ${host.name}`) : 'Add a server'} width={560} footer={<Button variant="ghost" onClick={() => (onDone(), onClose())}>Close</Button>}>
      <div className="space-y-4 text-[13.5px]" data-launch="host-dialog">
        {!made && (
          <>
            <p className="leading-snug text-fg-2">A server you rent, with its own address. Hydor makes a key for it (kept in its own folder, never your own SSH keys) and shows you the one line to put on the server.</p>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-fg-2">Name</span>
              <input className={inputCls} translate="no" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-server" autoCapitalize="off" spellCheck={false} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-fg-2">The server, as user@address (or user@address:port)</span>
              <input className={inputCls} translate="no" value={ssh} onChange={(e) => setSsh(e.target.value)} placeholder="deploy@203.0.113.7" autoCapitalize="off" spellCheck={false} />
            </label>
            <Button variant="primary" disabled={!name.trim() || !ssh.trim() || !!busy} onClick={() => void run('add', async () => setMade((await post<{ host: LaunchHost }>('/api/webapps/hosts', { name: name.trim(), ssh: ssh.trim() })).host))}>
              Make the key
            </Button>
          </>
        )}
        {made && !recorded && (
          <>
            <div>
              <h3 className="font-semibold">1. Put this key on the server</h3>
              <p className="mt-0.5 mb-1.5 text-[13px] leading-snug text-fg-3">
                Paste this one line at the end of <code translate="no">~/.ssh/authorized_keys</code> of {made.user ?? 'the user'} on the server, or in your provider's “SSH keys” box.
              </p>
              <Copyable text={made.authorizedLine ?? ''} label="Copy the key" />
            </div>
            <div>
              <h3 className="font-semibold">2. Compare the machine's fingerprint</h3>
              <p className="mt-0.5 mb-1.5 text-[13px] leading-snug text-fg-3">Hydor connects and shows what the machine says it is. Nothing is recorded until you say it is the right one.</p>
              {!offer && (
                <Button variant="secondary" icon={busy === 'connect' ? <Throbber size={12} /> : <Server size={14} />} disabled={!!busy} onClick={() => void run('connect', async () => setOffer(await post<LaunchHostOffer>(`${base}/connect`, {})))}>
                  Connect and show it
                </Button>
              )}
              {offer && offer.problem && (
                <p translate="no" className="text-err">
                  {offer.problem}
                </p>
              )}
              {offer && offer.offered.length > 0 && (
                <div className="space-y-2" data-launch="fingerprints">
                  <p className="text-[13px] leading-snug text-fg-3">{offer.where}</p>
                  {offer.offered.map((o) => (
                    <div key={o.fingerprint} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg-2 p-2.5">
                      <code translate="no" className="min-w-0 flex-1 break-all text-[12px]">
                        {o.fingerprint}
                      </code>
                      <span translate="no" className="text-[12px] text-fg-3">
                        {o.type}
                      </span>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!!busy}
                        onClick={() =>
                          void (async () => {
                            const ok = await ask({ title: tr(`Is this the fingerprint of ${made.name}?`), body: <span translate="no" className="break-all">{o.fingerprint}</span>, confirm: tr('They are the same') });
                            if (!ok) return;
                            const r = await run('accept', () => post<{ host: LaunchHost }>(`${base}/accept`, { fingerprint: o.fingerprint }));
                            if (r) (setMade(r.host), onDone());
                          })()
                        }
                      >
                        It is the same
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {offer && !offer.offered.length && (
                <Button className="mt-2" size="sm" variant="secondary" disabled={!!busy} onClick={() => void run('connect', async () => setOffer(await post<LaunchHostOffer>(`${base}/connect`, {})))}>
                  Try again
                </Button>
              )}
            </div>
          </>
        )}
        {made && recorded && (
          <div>
            <h3 className="font-semibold">3. See what is on it</h3>
            <p className="mt-0.5 mb-2 text-[13px] leading-snug text-fg-3">
              Recorded with the fingerprint <code translate="no" className="break-all">{made.fingerprint}</code>: a machine that shows another one is refused, and nothing is sent to it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!!busy} icon={busy === 'check' ? <Throbber size={12} /> : undefined} onClick={() => void run('check', async () => setChecked(await post(`${base}/check`, {})))}>
                Check the server
              </Button>
              {checked && !checked.ok && checked.looked.some((l) => l.ok === false) && (
                <Button
                  variant="secondary"
                  disabled={!!busy}
                  icon={busy === 'prepare' ? <Throbber size={12} /> : undefined}
                  onClick={() =>
                    void (async () => {
                      const ok = await ask({
                        title: tr(`Prepare ${made.name}?`),
                        body: 'On Debian or Ubuntu, as root or with sudo without a password, this installs Docker and Compose from Docker’s own apt repository, adds the login user to the docker group, and sets a firewall that lets in SSH, ports 80 and 443 and nothing else. It does nothing without this yes.',
                        confirm: tr('Prepare it'),
                      });
                      if (ok) await run('prepare', async () => setChecked(await post(`${base}/check`, { prepare: true })));
                    })()
                  }
                >
                  Prepare this server
                </Button>
              )}
            </div>
            {checked && (
              <ul className="mt-3 space-y-1.5" data-launch="looked">
                {checked.looked.map((l, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {l.ok === true ? <Check size={14} className="mt-0.5 shrink-0 text-ok" /> : l.ok === false ? <CircleAlert size={14} className="mt-0.5 shrink-0 text-err" /> : <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fg-4" />}
                    <span translate="no" className="leading-snug">
                      {l.say}
                    </span>
                  </li>
                ))}
                {checked.summary && (
                  <li translate="no" className="pt-1 text-fg-2">
                    {checked.summary}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
      {asked}
    </Dialog>
  );
}

// ---- the page -----------------------------------------------------------------------------------------------------------------------

export function Launch({ app, reload }: { app: WebAppDetail; reload: () => Promise<void> }) {
  const base = `/api/webapps/${enc(app.id)}`;
  const view = useLoaded<WebAppLaunchView>(`${base}/launch`);
  const [ask, confirmNode] = useConfirm();
  const [hostDlg, setHostDlg] = useState<{ host?: LaunchHost } | null>(null);
  const [hostPick, setHostPick] = useState('');
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [keysAsk, setKeysAsk] = useState<KeysAsk | null>(null);
  const closeKeys = useCallback(() => setKeysAsk(null), []);
  const v = view.data;
  const job = v?.job ?? null;
  const going = !!job && (job.state === 'running' || job.state === 'asking');
  useEffect(() => {
    if (!going) return;
    const t = setInterval(() => void view.reload(), 1500);
    return () => clearInterval(t);
  }, [going, view]);
  // When a launch ends, the app's page above (its state, its mode) is read again.
  const was = useState({ going: false })[0];
  useEffect(() => {
    if (was.going && !going) void reload();
    was.going = going;
  }, [going, was, reload]);
  useEffect(() => {
    if (!v) return;
    const recorded = v.hosts.filter((h) => h.state === 'recorded');
    if (!recorded.some((h) => h.name === hostPick) && recorded.length) setHostPick(v.envs.find((x) => recorded.some((h) => h.name === x.host))?.host ?? recorded[0].name);
  }, [v, hostPick]);
  if (!v) return <div className="flex justify-center py-16 text-fg-3">{view.error ? <span translate="no">{view.error}</span> : <Throbber size={26} />}</div>;

  const hydor = v.hydor;
  const run = async (what: string, f: () => Promise<unknown>) => {
    setBusy(what);
    try {
      await f();
      await view.reload();
    } catch (e) {
      toastError(e);
      await view.reload();
    } finally {
      setBusy(null);
    }
  };

  // Keys an environment still lacks come first, on one card; its button goes on to the launch's own question.
  const keysFirst = async (env: string, go: () => void) => {
    const keys = await readKeys(app.id, env).catch(() => null);
    if (!missingKeys(keys).length) return go();
    setKeysAsk({ env, next: { label: tr('Continue to the launch'), go } });
  };

  const launchHydor = () => keysFirst('hydor', () => void confirmHydor());
  const confirmHydor = async () => {
    const ok = await ask({
      title: hydor.launched ? tr(`Launch ${app.name} again?`) : tr(`Launch ${app.name} inside this Hydor?`),
      body: (
        <div className="space-y-2 text-[13.5px] leading-snug" data-launch="confirm">
          <p>
            What will be launched: <b>the committed version</b>
            {hydor.unsaved ? ' (what is not saved yet is saved as a step first)' : ''}, run with its production command, with a data folder of its own{hydor.launched ? ' (the data of the launched version stays)' : ' (it starts empty)'}.
          </p>
          <p>Its build runs, then the check of its hydor.json; a failed line stops it, and you can let one through. You open it at <code translate="no">{app.slug}.localhost</code>; inside Hydor only you are signed in to it.</p>
          {app.shape.build && <BuildWhere box={app.build.box} />}
          <p className="text-fg-3">The version being changed (Preview) keeps its own data, and does not change what people use until you launch again.{hydor.launched ? ' The version running now is kept to go back to.' : ''}</p>
        </div>
      ),
      confirm: hydor.launched ? tr('Launch again') : tr('Launch'),
    });
    if (ok) await run('hydor', () => post(`${base}/launch/hydor`, {}));
  };

  const goBack = async () => {
    try {
      const plan = await api<{ ok: boolean; refuse?: string; target?: LaunchRecord }>(`${base}/launch/back`);
      if (!plan.ok) return void toast(plan.refuse ?? tr('It cannot go back.'), 'error');
      const ok = await ask({
        title: tr('Go back to the launch before?'),
        body: tr('The launch before is started again on the same data. Hydor cannot tell whether it reads the data as it is now: the backup made just before the launch now live is kept, on the Run tab. Going back again goes forward.'),
        confirm: tr('Go back'),
      });
      if (ok) await run('back', () => post(`${base}/launch/back`, {}));
    } catch (e) {
      toastError(e);
    }
  };

  const recorded = v.hosts.filter((h) => h.state === 'recorded');
  const env = envFor(v.envs, hostPick);
  const there = v.envs.find((x) => x.env === env && x.host === hostPick);
  // The address typed, else the one this server has for the app now.
  const address = (typed ?? there?.address ?? '').trim();
  const validAddress = /^https:\/\/[^/\s]+$/.test(address);
  const server = v.places.find((p) => p.id === 'server');
  const serverOk = server?.state === 'ready';

  const serverKeys = () => api<{ keys: LaunchKey[] }>(`${base}/launch/keys?env=${enc(env)}&host=${enc(hostPick)}`).then((r) => r.keys);
  const launchServer = async () => {
    const keys = await serverKeys().catch(() => []);
    const missing = keys.filter((k) => k.state === 'missing').map((k) => k.name);
    if (missing.length) return setKeysAsk({ env, names: missing, next: { label: tr('Continue to the launch'), go: () => void confirmServer() } });
    await confirmServer();
  };
  const confirmServer = async () => {
    // Read again: keys may just have been saved, and the question names those the launch takes.
    const keys = await serverKeys().catch(() => []);
    const named = (state: LaunchKey['state']) => keys.filter((k) => k.state === state).map((k) => k.name).join(', ');
    const ok = await ask({
      title: tr(`Launch ${app.name} to a server?`),
      body: (
        <div className="space-y-2 text-[13.5px] leading-snug" data-launch="confirm">
          <p>This is outward-facing, so it asks first.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-fg-3">Address</dt>
            <dd translate="no" className="break-all">{address}</dd>
            <dt className="text-fg-3">Server</dt>
            <dd translate="no">{`${hostPick} (${recorded.find((h) => h.name === hostPick)?.ssh ?? ''})`}</dd>
            <dt className="text-fg-3">Place</dt>
            <dd translate="no">{env}</dd>
            <dt className="text-fg-3">Keys sent</dt>
            <dd>
              <span translate="no">{named('vault') || tr('none')}</span>
              {named('server') && <span className="block text-fg-3">{tr(`The server holds already: ${named('server')}`)}</span>}
              {named('made') && <span className="block text-fg-3">{tr(`The server makes: ${named('made')}`)}</span>}
            </dd>
          </dl>
          <p>
            What is sent: the app’s committed version{v.hydor.unsaved ? ' (what is not saved yet is saved as a step first)' : ''}, over SSH, without dependencies’ folders, builds, data, .env files or databases.{' '}
            <span translate="no">{v.serverBuild?.say}</span>
          </p>
          <p className="text-fg-3">It is checked first, then built on the server beside the version running, and switched to. People reach nothing for a few seconds; if it fails after the switch, the version before is put back by itself.</p>
        </div>
      ),
      confirm: tr('Launch'),
    });
    if (ok) await run('server', () => post(`${base}/launch/server`, { host: hostPick, env, address }));
  };

  const backServer = async (place: string, restoreDatabase = false) => {
    const ok = await ask(
      restoreDatabase
        ? { title: tr('Go back and put the data back too?'), body: tr('The data goes back as it was before the launch being undone. Whatever people wrote since then is no longer in the app; a backup of it is made first.'), confirm: tr('Go back and put the data back'), danger: true }
        : { title: tr('Go back to the launch before?'), body: tr('The version before is put back on the server. People reach nothing for a few seconds. Going back again goes forward.'), confirm: tr('Go back') },
    );
    if (ok) await run('back', () => post(`${base}/launch/back`, { place: 'server', env: place, restoreDatabase }));
  };
  const takeDown = async (x: WebAppLaunchView['envs'][number]) => {
    const ok = await ask({ title: tr(`Take it off ${x.host}?`), body: tr('The app stops on the server and its containers go: nobody is answered at its address any more. Its data, keys and backups stay there, and launching it again finds them.'), confirm: tr('Take it off'), danger: true });
    if (ok)
      await run('takedown', async () => {
        const r = await post<{ summary: string }>(`${base}/launch/takedown`, { env: x.env });
        toast(r.summary, 'ok');
      });
  };

  const hostsOf = v.hosts;
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6" data-tab="launch">
      {v.blocked && (
        <p className="rounded-xl border border-warn/40 bg-warn/5 p-3.5 text-[13.5px] leading-snug" translate="no">
          {v.blocked}
        </p>
      )}
      {job && <Job app={app.id} job={job} reload={view.reload} onData={() => void backServer(job.env, true)} />}

      <Section title="Where it can go" sub="Pick a place. Each says what it means, what it takes from you, and what it costs.">
        <ul className="space-y-3" data-launch="places">
          {v.places.map((p) => (
            <PlaceRow key={p.id} p={p}>
              {p.id === 'hydor' && (
                <Button size="sm" variant={hydor.launched ? 'secondary' : 'primary'} icon={<Rocket size={13} />} disabled={!!v.blocked || going || busy === 'hydor'} onClick={() => void launchHydor()}>
                  {hydor.launched ? 'Launch again' : 'Launch inside Hydor'}
                </Button>
              )}

            </PlaceRow>
          ))}
        </ul>
      </Section>

      {hydor.launched && (
        <Section title="Inside this Hydor" sub="Two sides, side by side: what people open, and what you are changing.">
          <div className="grid gap-3 sm:grid-cols-2" data-launch="sides">
            <div className="rounded-xl border border-line bg-bg-1 p-4" data-side="launched">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold">The launched version</h3>
                <Badge tone={hydor.run?.state === 'running' ? 'ok' : 'neutral'}>{hydor.run?.state === 'running' ? 'Running' : hydor.run?.state === 'crashed' ? 'Fell' : 'Asleep'}</Badge>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-fg-3">
                {tr(`Launched ${ago(hydor.launched.at)}${hydor.launched.version ? `, version ${hydor.launched.version}` : ''}, from the commit `)}
                <code translate="no">{hydor.launched.commit.slice(0, 8)}</code>{'. That commit, run with its production command, with data of its own.'}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<ArrowUpRight size={13} />} onClick={() => void openWebApp(app.id, undefined, 'launched')}>
                  Open it
                </Button>
                <Button size="sm" variant="ghost" icon={<Undo2 size={13} />} disabled={!hydor.previous || going} onClick={() => void goBack()}>
                  Back to the launch before
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-bg-1 p-4" data-side="preview">
              <h3 className="text-[14px] font-semibold">The one being changed</h3>
              <p className="mt-1 text-[13px] leading-snug text-fg-3">
                {hydor.ahead ? tr(`${hydor.ahead} step${hydor.ahead === 1 ? '' : 's'} ahead of the launched version.`) : hydor.unsaved ? tr('Changes not saved as a step yet.') : tr('The same as the launched version.')} It is Preview, with data of its own: changing it never changes what people use, until you launch again.
              </p>
              <div className="mt-2.5">
                <Button size="sm" variant={hydor.ahead || hydor.unsaved ? 'primary' : 'secondary'} icon={<Rocket size={13} />} disabled={going || !!v.blocked} onClick={() => void launchHydor()}>
                  Launch again
                </Button>
              </div>
            </div>
          </div>
        </Section>
      )}

      {(serverOk || v.envs.length > 0 || hostsOf.length > 0) && (
        <Section
          title="Your servers"
          sub="Servers are yours, kept by Hydor for you. Hydor makes a key for each one, and shows you where to put it."
          actions={
            <Button size="sm" variant="secondary" icon={<Server size={13} />} onClick={() => setHostDlg({})}>
              Add a server
            </Button>
          }
        >
          {v.envs.length > 0 && (
            <ul className="mb-4 space-y-3" data-launch="deployments">
              {v.envs.map((x) => (
                <li key={x.env} className="rounded-xl border border-line bg-bg-1 p-4" data-deployment={x.env}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 translate="no" className="text-[14px] font-semibold break-all">
                      {x.address.replace(/^https:\/\//, '')}
                    </h3>
                    <Badge tone="ok">Launched</Badge>
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-fg-3">
                    {tr(`On ${x.host} as ${x.env}, ${ago(x.at)}`)}
                    {x.commit && (
                      <>
                        {tr(', from the commit ')}
                        <code translate="no">{x.commit.slice(0, 8)}</code>
                      </>
                    )}
                    .
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <a href={x.address} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="secondary" icon={<ArrowUpRight size={13} />} tabIndex={-1}>
                        Open it
                      </Button>
                    </a>
                    <Button size="sm" variant="ghost" icon={<Undo2 size={13} />} disabled={going || v.history.filter((r) => r.place === 'server' && r.env === x.env && (r.result === 'live' || r.result === 'back')).length < 2} onClick={() => void backServer(x.env)}>
                      Back to the launch before
                    </Button>
                    <Button size="sm" variant="ghost" disabled={going} onClick={() => void takeDown(x)}>
                      Take it off the server
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {hostsOf.length === 0 ? (
            <p className="text-[13.5px] text-fg-3">No server yet. Adding one takes about ten minutes: a name, its address, a key to paste on it, and the fingerprint to compare.</p>
          ) : (
            <ul className="divide-y divide-line" data-launch="hosts">
              {hostsOf.map((h) => (
                <li key={h.name} className="flex flex-wrap items-center gap-2.5 py-2.5 first:pt-0 last:pb-0" data-host={h.name}>
                  <code translate="no" className="text-[13.5px] font-medium">
                    {h.name}
                  </code>
                  <span translate="no" className="text-[13px] break-all text-fg-3">
                    {h.ssh}
                  </span>
                  {h.state === 'recorded' ? <Badge tone={h.checked ? (h.checked.ok ? 'ok' : 'warn') : 'neutral'}>{h.checked ? (h.checked.ok ? tr('Ready') : tr('Needs something')) : tr('Recorded')}</Badge> : <Badge tone="warn">Waiting for its fingerprint</Badge>}
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => setHostDlg({ host: h })}>
                    {h.state === 'recorded' ? 'Check' : 'Finish adding'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void (async () => {
                        const ok = await ask({ title: tr(`Remove ${h.name}?`), body: tr('Hydor forgets the server, the key it made for it and what it deployed there. The server itself is not touched, and what runs there keeps running.'), confirm: tr('Remove'), danger: true });
                        if (ok) await run('rm', () => del(`/api/webapps/hosts/${enc(h.name)}`));
                      })()
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {serverOk && recorded.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-line pt-4" data-launch="server-launch">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <label className="block">
                  <span className="mb-1 block text-[12.5px] font-medium text-fg-2">Server</span>
                  <select
                    className={inputCls}
                    value={hostPick}
                    onChange={(x) => {
                      setHostPick(x.target.value);
                      setTyped(null);
                    }}
                    translate="no"
                  >
                    {recorded.map((h) => (
                      <option key={h.name} value={h.name}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12.5px] font-medium text-fg-2">Its address (https, a name that points at the server)</span>
                  <input className={inputCls} translate="no" value={typed ?? there?.address ?? ''} onChange={(x) => setTyped(x.target.value)} placeholder="https://app.example.com" autoCapitalize="off" spellCheck={false} />
                </label>
              </div>
              {env !== 'production' && (
                <p className="text-[13px] leading-snug text-fg-3" data-launch="second-place">
                  {tr(`The app runs on another server already, so this one is a second place, kept as ${env}, with keys of its own. To move it instead, take it off the first one.`)}
                </p>
              )}
              {v.serverBuild && (
                <p translate="no" className={cx('text-[13px] leading-snug', v.serverBuild.ok ? 'text-fg-3' : 'text-err')} data-launch="server-build">
                  {v.serverBuild.say}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="primary" icon={<Rocket size={14} />} disabled={!validAddress || going || !!v.blocked || v.serverBuild?.ok === false} onClick={() => void launchServer()}>
                  {there ? 'Launch again to the server' : 'Launch to the server'}
                </Button>
                {!validAddress && address !== '' && <span className="text-[12.5px] text-warn">The address has to start with https:// and have no path.</span>}
              </div>
            </div>
          )}
        </Section>
      )}

      <Section title="Launch history" actions={<HistoryIcon size={15} className="text-fg-3" />}>
        <LaunchHistory rows={v.history} />
      </Section>

      <KeysDialog app={app} ask={keysAsk} onClose={closeKeys} />
      <HostDialog open={!!hostDlg} host={hostDlg?.host} onClose={() => setHostDlg(null)} onDone={() => void view.reload()} />
      {confirmNode}
    </div>
  );
}
