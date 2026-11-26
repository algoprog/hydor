// A web app's Run tab (docs/plans/web-apps.md, section 7, Run): for each place the app is launched to: is it up (version, since when, the last launch, the last backup and its
// age, disk, errors and requests lately), its log (newest last, errors first on request, never a secret; on a server also Caddy's and the backups'), a restart, the backups
// (make one, the daily time and days kept, put one back, download), and what the weekly check found. Inside Hydor Hydor makes the backups itself; on a server the server does.
import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, Download, RefreshCcw, ShieldAlert } from 'lucide-react';
import type { RunBackup, RunStatus, WebAppDetail, WebAppRunView, WeeklyCheck } from '@shared/webapps';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { api, enc, post, put } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Badge, Button, cx, inputCls, Section, Tabs, Throbber, useConfirm } from '../../components/ui';
import { useLoaded } from './api';
import { Fold } from './Overview';
import { type LogRow, msWords, parseLogLine, timeOf } from './logLines';
import { ago } from './time';

const when = (t: number | null | undefined) => (t ? new Date(t).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-fg-3">{label}</dt>
      <dd className="text-[14px] font-medium">{children}</dd>
    </div>
  );
}

function StatusCard({ s, onRestart, busy }: { s: RunStatus; onRestart: () => void; busy: boolean }) {
  const up = s.up;
  return (
    <div data-run="status" data-up={String(up)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={cx('size-2.5 rounded-full', up === true ? 'bg-ok' : up === false ? 'bg-err' : 'bg-fg-4')} />
        <h3 className="text-[15px] font-semibold">{up === true ? tr('It is up') : up === false ? tr('It is down') : tr('Not known')}</h3>
        {s.version && (
          <Badge>
            <span translate="no">{s.version}</span>
          </Badge>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="secondary" icon={busy ? <Throbber size={12} /> : <RefreshCcw size={13} />} disabled={busy} onClick={onRestart}>
          Restart
        </Button>
      </div>
      <p translate="no" className="mt-1 text-[13.5px] leading-snug text-fg-2">
        {s.say}
      </p>
      {s.problem && s.problem !== s.say && (
        <p translate="no" className="mt-1 text-[13px] leading-snug text-err">
          {s.problem}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {s.since ? <Fact label="Running since">{ago(s.since)}</Fact> : null}
        {s.lastLaunch ? <Fact label="Last launch">{`${ago(s.lastLaunch.at)}`}</Fact> : null}
        <Fact label="Last backup">{s.lastBackup ? <span className={cx(s.lastBackup.ageHours > 72 && 'text-warn')}>{s.lastBackup.ageHours < 0.5 ? tr('Just made') : s.lastBackup.ageHours < 48 ? (Math.round(s.lastBackup.ageHours) === 1 ? tr('1 hour old') : tr(`${Math.round(s.lastBackup.ageHours)} hours old`)) : Math.round(s.lastBackup.ageHours / 24) === 1 ? tr('1 day old') : tr(`${Math.round(s.lastBackup.ageHours / 24)} days old`)}</span> : <span className="text-warn">{tr('None yet')}</span>}</Fact>
        {s.disk && <Fact label="Disk left">{s.disk.say}</Fact>}
        {typeof s.errors === 'number' && <Fact label="Errors lately"><span className={cx(s.errors > 0 && 'text-warn')}>{s.errors}</span></Fact>}
        {typeof s.requests === 'number' && <Fact label="Requests lately">{s.requests}</Fact>}
      </dl>
      {s.kind === 'server' && !!s.services?.length && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-fg-3" data-run="services">
          {s.services.map((x) => (
            <li key={x.name} className="flex items-center gap-1.5">
              <span aria-hidden className={cx('size-1.5 rounded-full', x.up === true ? 'bg-ok' : x.up === false ? 'bg-err' : 'bg-fg-4')} />
              <span translate="no">{x.name}</span>
              <span>{x.up === true ? tr('running') : x.up === false ? tr('not running') : tr('not known')}</span>
            </li>
          ))}
        </ul>
      )}
      {s.address && (
        <p className="mt-2 text-[13px] break-all text-fg-3">
          {s.kind === 'server' ? (
            <a translate="no" href={s.address} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {s.address}
            </a>
          ) : (
            <span translate="no">{s.address}</span>
          )}
        </p>
      )}
    </div>
  );
}

/** One request's status in a few characters, the colour of how it went. */
function Status({ status }: { status?: number }) {
  if (status === undefined) return null;
  return <span className={cx('tnum', status >= 500 ? 'text-err' : status >= 400 ? 'text-warn' : 'text-fg-3')}>{status}</span>;
}

/** A log line as a row: the time, how serious, what, its status and how long it took; the raw line when the row is opened (or all of them, with Raw lines). */
function LogRowView({ row, raw }: { row: LogRow; raw: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = raw || open;
  return (
    <li data-log-row={row.level} className={cx('border-b border-line last:border-b-0', row.level === 'error' && 'bg-err/5')}>
      <button type="button" aria-expanded={shown} onClick={() => setOpen((o) => !o)} className="grid w-full grid-cols-[4.75rem_3.5rem_minmax(0,1fr)_2.5rem_3.5rem] items-baseline gap-x-2 px-2.5 py-1.5 text-left text-[12.5px] leading-snug hover:bg-bg-2 max-sm:grid-cols-[5.6rem_minmax(0,1fr)_2.2rem] max-sm:gap-x-1.5">
        <span className="tnum whitespace-nowrap text-fg-3">{timeOf(row, LOCALE)}</span>
        <span className={cx('max-sm:hidden', row.level === 'error' ? 'text-err' : row.level === 'warn' ? 'text-warn' : 'text-fg-3')}>{row.level === 'plain' ? '' : row.level === 'error' ? tr('error') : row.level === 'warn' ? tr('warning') : tr('info')}</span>
        <span translate="no" className={cx('min-w-0 break-words', row.level === 'error' && 'text-err')}>
          {row.what}
          {row.ms !== undefined && <span className="tnum text-fg-3 sm:hidden"> · {msWords(row.ms)}</span>}
        </span>
        <span className="text-right">
          <Status status={row.status} />
        </span>
        <span className="tnum text-right text-fg-3 max-sm:hidden">{row.ms !== undefined ? msWords(row.ms) : ''}</span>
      </button>
      {shown && (
        <pre translate="no" className="mx-2.5 mb-2 overflow-auto rounded-md bg-bg-2 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all text-fg-2">
          {row.raw}
        </pre>
      )}
    </li>
  );
}

/** `plain`: lines that carry no time or level of their own (an app prints what it likes): shown as they are. `server`: also Caddy's and the backups' lines. */
function Logs({ base, plain, server }: { base: string; plain?: boolean; server?: boolean }) {
  const [errors, setErrors] = useState(false);
  const [raw, setRaw] = useState(false);
  const [service, setService] = useState('app');
  const logs = useLoaded<{ lines: string[] }>(`${base}/logs?tail=150${errors ? '&errors=1' : ''}${server ? `&since=24h&service=${service}` : ''}`);
  const rows = useMemo(() => (logs.data?.lines ?? []).filter((l) => l.trim()).map(parseLogLine), [logs.data]);
  return (
    <div data-run="logs">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {server && (
          <label className="flex items-center gap-1.5 text-[13px] whitespace-nowrap text-fg-2">
            <span>Whose lines</span>
            <select className={cx(inputCls, 'h-8 w-auto py-0')} value={service} onChange={(e) => setService(e.target.value)}>
              <option value="app">The app’s</option>
              <option value="caddy">Caddy’s (https)</option>
              <option value="backup">The backups’</option>
            </select>
          </label>
        )}
        {!plain && (
          <label className="flex items-center gap-1.5 text-[13px] text-fg-2">
            <input type="checkbox" checked={errors} onChange={(e) => setErrors(e.target.checked)} /> Errors first
          </label>
        )}
        {!plain && (
          <label className="flex items-center gap-1.5 text-[13px] text-fg-2">
            <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} /> Raw lines
          </label>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => void logs.reload()}>
          Read it again
        </Button>
      </div>
      {logs.data ? (
        rows.length && plain ? (
          <pre translate="no" className="max-h-80 overflow-auto rounded-lg border border-line bg-bg-2 px-3 py-2.5 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-fg-2">
            {rows.map((r) => r.raw).join('\n')}
          </pre>
        ) : rows.length ? (
          <ul className="max-h-80 overflow-auto rounded-lg border border-line bg-bg-2/40">
            {rows.map((r, i) => (
              <LogRowView key={i} row={r} raw={raw} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-line bg-bg-2 p-3 text-[12.5px] text-fg-3">{tr('Its log is empty.')}</p>
        )
      ) : logs.error ? (
        <p translate="no" className="text-[13px] text-err">
          {logs.error}
        </p>
      ) : (
        <Throbber size={16} />
      )}
    </div>
  );
}

function Backups({ app, place, reloadAll }: { app: string; place: string; reloadAll: () => void }) {
  const base = `/api/webapps/${enc(app)}/run/${enc(place)}/backups`;
  const list = useLoaded<{ backups: RunBackup[]; schedule: { at: string; keepDays: number } | null }>(base);
  const [ask, confirmNode] = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [at, setAt] = useState('');
  const [keep, setKeep] = useState('');
  useEffect(() => {
    if (list.data?.schedule) (setAt(list.data.schedule.at), setKeep(String(list.data.schedule.keepDays)));
  }, [list.data?.schedule?.at, list.data?.schedule?.keepDays]);
  const act = async (what: string, f: () => Promise<unknown>) => {
    setBusy(what);
    try {
      await f();
      await list.reload();
      reloadAll();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const d = list.data;
  return (
    <div data-run="backups">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon={busy === 'now' ? <Throbber size={12} /> : undefined} disabled={!!busy} onClick={() => void act('now', async () => { await post(base, {}); toast(tr('Backed up, and read back'), 'ok'); })}>
          Back up now
        </Button>
        <span className="flex-1" />
        {d?.schedule && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
            <span>Every day at</span>
            <span className="inline-block w-24">
              <input className={inputCls} value={at} onChange={(e) => setAt(e.target.value)} aria-label={tr('The time of the daily backup, in UTC')} translate="no" />
            </span>
            <span>UTC, keep</span>
            <span className="inline-block w-20">
              <input className={inputCls} value={keep} inputMode="numeric" onChange={(e) => setKeep(e.target.value)} aria-label={tr('Days to keep them')} translate="no" />
            </span>
            <span>days</span>
            <Button size="sm" variant="secondary" disabled={!!busy || (at === d.schedule.at && keep === String(d.schedule.keepDays))} onClick={() => void act('sch', () => put(`${base}/schedule`, { at, keepDays: Number(keep) }))}>
              Save
            </Button>
          </div>
        )}
      </div>
      {!d ? (
        <div className="py-4">{list.error ? <span translate="no" className="text-[13px] text-err">{list.error}</span> : <Throbber size={16} />}</div>
      ) : d.backups.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-fg-3">There are no backups yet. One is made when it is launched, and then every day.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {d.backups.slice(0, 15).map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13.5px] first:pt-0 last:pb-0" data-backup={b.id}>
              <span className="tnum text-fg-2">{when(b.at)}</span>
              {b.label && <Badge>{b.label}</Badge>}
              <span className="text-fg-3">{size(b.bytes)}</span>
              {b.stopped && <span className="text-[12px] text-fg-3">{tr('made with it stopped')}</span>}
              <span translate="no" className="min-w-0 flex-1 truncate text-[12px] text-fg-3 max-sm:hidden">
                {Object.entries(b.tables).filter(([k]) => !k.startsWith('__') && !k.startsWith('sqlite')).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(' · ')}
              </span>
              <a className="inline-flex" href={`${base}/${enc(b.id)}/download`} download aria-label={tr(`Download ${b.id}`)}>
                <Button size="sm" variant="ghost" icon={<Download size={13} />} tabIndex={-1}>
                  Download
                </Button>
              </a>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy}
                onClick={() =>
                  void (async () => {
                    const ok = await ask({
                      title: tr(`Put the backup from ${when(b.at)} back?`),
                      body: (
                        <div className="space-y-2 text-[13.5px] leading-snug">
                          <p>The app <b>stops</b> for the seconds this takes. Everything it keeps now (its database and its files) is replaced by what this backup holds: whatever people wrote since {when(b.at)} is lost.</p>
                          <p className="text-fg-3">A backup of the data as it is now is made first, so this can itself be put back.</p>
                        </div>
                      ),
                      confirm: tr('Stop it and put the backup back'),
                      danger: true,
                    });
                    if (ok) await act('restore', async () => { await post(`${base}/${enc(b.id)}/restore`, {}); toast(tr('The backup is back and the app is running'), 'ok'); });
                  })()
                }
              >
                Put this one back
              </Button>
            </li>
          ))}
        </ul>
      )}
      {confirmNode}
    </div>
  );
}

function Weekly({ w, app, reload }: { w: WeeklyCheck | null; app: string; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div data-run="weekly">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-fg-2">
          Once a week Hydor looks at each launched app: is it up, and is there a backup from the last three days. It tells you only when something needs you.
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          icon={busy ? <Throbber size={12} /> : undefined}
          onClick={() => {
            setBusy(true);
            void post(`/api/webapps/${enc(app)}/run/weekly`, { notify: false }).then(() => reload(), toastError).finally(() => setBusy(false));
          }}
        >
          Check now
        </Button>
      </div>
      {w ? (
        <div className="mt-3 text-[13.5px]">
          <p className="text-fg-3">{tr(`Last checked ${ago(w.at)}.`)}</p>
          {w.needs.length === 0 ? (
            <p className="mt-1 flex items-center gap-2 text-fg-2">
              <Check size={15} className="text-ok" /> Nothing needs you.
            </p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {w.needs.map((n) => (
                <li key={n.id} className="flex items-start gap-2 text-warn">
                  <CircleAlert size={15} className="mt-0.5 shrink-0" />
                  <span translate="no">{n.say}</span>
                </li>
              ))}
            </ul>
          )}
          <p translate="no" className="mt-1 text-[12.5px] text-fg-3">
            {tr('Looked at: ')}
            {w.looked.join(' · ')}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-fg-3">It has not run yet.</p>
      )}
    </div>
  );
}

/** How its backups are made, said plainly. */
function backupsWords(app: WebAppDetail, kind: RunStatus['kind']): string {
  if (kind !== 'hydor') return 'Made on the server, every day and at each launch, restored in a scratch folder and read back before they count. A download is the copy of one.';
  if (app.shape.database?.sqlite) return 'Hydor makes them itself: the SQLite database copied while the app runs, the rest of its data folder, and what is in each table. A backup counts once it was restored in a scratch folder and read back.';
  return 'Its hydor.json names no SQLite database, so Hydor stops the app while it copies its data folder, then starts it again: people reach nothing for those seconds. A backup counts once it was restored in a scratch folder and read back.';
}

export function Run({ app }: { app: WebAppDetail }) {
  const run = useLoaded<WebAppRunView>(`/api/webapps/${enc(app.id)}/run`);
  const [place, setPlace] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const places = run.data?.places ?? [];
  useEffect(() => {
    if (!place && places.length) setPlace(places[0].place);
  }, [place, places]);
  if (!run.data) return <div className="flex justify-center py-16 text-fg-3">{run.error ? <span translate="no">{run.error}</span> : <Throbber size={26} />}</div>;
  if (!places.length)
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6" data-tab="run">
        <Section title="Not launched yet" sub="Once it is launched somewhere, this is where you see how it is doing.">
          <p className="text-[13.5px] text-fg-2">{tr('Launch it from the Launch tab, inside this Hydor or to a server of your own.')}</p>
        </Section>
      </div>
    );
  const cur = places.find((p) => p.place === place) ?? places[0];
  const base = `/api/webapps/${enc(app.id)}/run/${enc(cur.place)}`;
  const restart = async () => {
    const ok = await ask({ title: tr('Restart it?'), body: tr('The app finishes what it is answering, stops, and starts again. People reach nothing for a few seconds.'), confirm: tr('Restart') });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await post<{ ok: boolean; summary: string }>(`${base}/restart`, {});
      toast(r.summary, r.ok ? 'ok' : 'error');
      await run.reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6" data-tab="run">
      {places.length > 1 && (
        <Tabs value={cur.place} onChange={setPlace} options={places.map((p) => ({ value: p.place, label: p.kind === 'hydor' ? tr('Inside this Hydor') : tr(`${p.host ?? 'Server'} (${p.place})`) }))} />
      )}
      <Section title={cur.kind === 'hydor' ? tr('Inside this Hydor') : tr(`On the server ${cur.host ?? cur.place}`)} sub="Is it up, right now.">
        <StatusCard s={cur} onRestart={() => void restart()} busy={busy} />
      </Section>
      <Section title="Weekly check">
        <Weekly w={run.data.weekly} app={app.id} reload={() => void run.reload()} />
      </Section>
      <Section title="Backups" sub={backupsWords(app, cur.kind)}>
        <Backups key={cur.place} app={app.id} place={cur.place} reloadAll={() => void run.reload()} />
      </Section>
      <Section title="Its log">
        <Fold label={tr('Show the lines')} open>
          <Logs key={cur.place} base={base} plain server={cur.kind === 'server'} />
        </Fold>
      </Section>
      {confirmNode}
    </div>
  );
}
