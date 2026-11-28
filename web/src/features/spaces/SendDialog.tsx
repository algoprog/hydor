// Send a project to another machine (Settings → Machines): copy it there, keep it in sync with its copy, or move it.
// Pick the machine and how; what goes is read from the machine the project is on (the hub's plan: files, its Git
// history, what is left out because a command makes it again, its notes, skills, documents, wiki and kept things) and
// where it would land there (an editable folder, the free space). Then it runs in the background: a bar, Cancel, and at
// the end Open it there. Closing the dialog while it runs leaves it running. SendHost.tsx opens it from anywhere.
// On this server's own pages the machines that use it and are connected now are listed too: one of them runs the sending
// itself (this server cannot reach it), the bar follows what it says, and at the end it says where to open it instead.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Check, Copy, MoveRight, RefreshCw } from 'lucide-react';
import type { Space } from '@shared/spaces';
import { isClientRef, type ArrivalPlace, type CarryPlan, type SendHow, type Transfer } from '@shared/transfer';
import { Button, cx, Dialog, inputCls, Throbber } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { api, del, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { bytes, tildify } from '../../lib/format';
import { machineId, machinePath } from '../../lib/machine';
import { useMachines } from '../../lib/machines';
import { closeProject, openProject } from '../../lib/nav';
import { machineDot } from '../machines/MachineSwitcher';

/** A machine a project can go to: '' is this server's own (when the page shows another machine). */
interface Target {
  ref: string;
  name: string;
  dot: string;
  /** Why it cannot be picked now. */
  off?: string;
}

const HOWS: { how: SendHow; label: string; hint: string; icon: typeof Copy }[] = [
  { how: 'copy', label: 'Copy', hint: 'A copy goes there. This one stays as it is.', icon: Copy },
  { how: 'sync', label: 'Keep in sync', hint: 'A copy goes there, and a change on either one reaches the other while both are on.', icon: RefreshCw },
  { how: 'move', label: 'Move', hint: 'It goes there and leaves this machine: its folder goes to the Trash here.', icon: MoveRight },
];

const n = (x: number) => x.toLocaleString(LOCALE);
const files = (x: number) => (x === 1 ? tr('1 file') : tr(`${n(x)} files`));

/** What a plan says goes along with the files, in a few words ("3 skills · 42 memory notes · its wiki"); empty when nothing. */
function alsoLine(p: CarryPlan): string {
  const parts = [
    p.skills ? (p.skills === 1 ? tr('1 skill') : tr(`${n(p.skills)} skills`)) : '',
    p.notes ? (p.notes === 1 ? tr('1 memory note') : tr(`${n(p.notes)} memory notes`)) : '',
    p.wiki ? tr('its wiki') : '',
    p.documents.count ? (p.documents.count === 1 ? tr('1 document') : tr(`${n(p.documents.count)} documents`)) : '',
    p.kept ? (p.kept === 1 ? tr('1 kept thing') : tr(`${n(p.kept)} kept things`)) : '',
    p.agents ? (p.agents === 1 ? tr('its agent') : tr(`${n(p.agents)} agents`)) : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

const percent = (t: Transfer) => (t.total.bytes > 0 ? t.done.bytes / t.total.bytes : t.total.files > 0 ? t.done.files / t.total.files : 0);

/** One of a few exclusive choices, as a row with a round mark (the machine to send it to, how to send it). */
function Choice({ on, off, label, hint, icon, dot, onClick }: { on: boolean; off?: boolean; label: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; dot?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={off}
      onClick={onClick}
      className={cx(
        'flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50',
        on ? 'border-accent/50 bg-accent-soft' : 'border-line bg-bg-1 hover:border-line-2 disabled:hover:border-line',
      )}
    >
      <span className={cx('mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-2')}>{on && <Check size={11} strokeWidth={3} />}</span>
      {icon && <span className="mt-0.5 shrink-0 text-fg-3">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[13.5px] font-medium">
          {dot && <span className={cx('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden />}
          <span className="min-w-0 truncate">{label}</span>
        </span>
        {hint && <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-3">{hint}</span>}
      </span>
    </button>
  );
}

function Tick({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex items-start gap-2.5', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px]">{label}</span>
        {hint && <span className="block text-[12.5px] leading-snug text-fg-3">{hint}</span>}
      </span>
    </label>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-1.5 text-[12px] font-medium text-fg-3">{children}</div>;

export function SendDialog({ space, onClose }: { space: Pick<Space, 'id' | 'name'>; onClose: () => void }) {
  const self = useMachines((s) => s.self);
  const list = useMachines((s) => s.list);
  const clients = useMachines((s) => s.clients);
  const loaded = useMachines((s) => s.loaded);
  useEffect(() => {
    if (!loaded) useMachines.getState().load().catch(() => {});
  }, [loaded]);
  // The machine the project is on: what the hub calls '' is its own, so a page of another machine reads from that one.
  const from = machineId ?? '';
  const fromName = machineId ? (list.find((m) => m.id === machineId)?.name ?? machineId) : (self?.host ?? tr('this machine'));
  const targets: Target[] = useMemo(() => {
    const out: Target[] = [];
    if (machineId && self) out.push({ ref: '', name: self.host, dot: 'bg-ok' });
    for (const m of list) {
      if (m.id === machineId) continue;
      const off = m.status.state === 'offline' ? (m.status.restarting ? tr('Restarting') : tr('Not reachable')) : undefined;
      out.push({ ref: m.id, name: m.name, dot: machineDot(m.status), off });
    }
    if (!machineId) for (const c of clients) out.push({ ref: c.ref, name: c.name, dot: 'bg-ok', off: c.takes ? undefined : tr('Update Hydor there first') });
    return out;
  }, [self, list, clients]);

  const [to, setTo] = useState<string | null>(null);
  const [how, setHow] = useState<SendHow>('copy');
  const [leaveOut, setLeaveOut] = useState(true);
  const [also, setAlso] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const target = targets.find((t) => t.ref === to);
  // The first machine that is up, until one is picked.
  useEffect(() => {
    if (to === null || !targets.some((t) => t.ref === to)) setTo(targets.find((t) => !t.off)?.ref ?? null);
  }, [targets, to]);
  // Keeping in sync needs this server on one side: the hub keeps the link.
  const syncOff = from !== '' && to !== '' ? tr('One of the two must be this machine') : undefined;
  useEffect(() => {
    if (syncOff && how === 'sync') setHow('copy');
  }, [syncOff, how]);

  // What goes, and where: asked again when the machine or a checkbox changes.
  const [planned, setPlanned] = useState<{ plan: CarryPlan; place: ArrivalPlace } | null>(null);
  const [loading, setLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  useEffect(() => {
    setFolder(null);
  }, [to]);
  useEffect(() => {
    if (to === null) return;
    let dead = false;
    setLoading(true);
    setPlanError('');
    api<{ plan: CarryPlan; place: ArrivalPlace }>(`/api/machines/projects/plan?from=${enc(from)}&project=${enc(space.id)}&to=${enc(to)}&leaveOut=${leaveOut ? 1 : 0}&also=${also ? 1 : 0}`)
      .then((r) => !dead && setPlanned(r))
      .catch((e) => {
        if (dead) return;
        setPlanned(null);
        setPlanError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [from, space.id, to, leaveOut, also]);
  const plan = planned?.plan;
  const place = planned?.place;
  const alsoHome = plan?.also.filter((a) => a.home) ?? [];
  const tight = !!plan && !!place && place.free != null && place.free < plan.total.bytes;

  // Sending: the hub's transfer, followed by its news and, for a page of another machine (whose socket is not the hub's), a look every couple of seconds.
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [sendError, setSendError] = useState('');
  const [starting, setStarting] = useState(false);
  const running = !!transfer && (transfer.state === 'sending' || transfer.state === 'finishing');
  const tid = transfer?.id;
  useFeatureEvent('transfers', (e) => {
    const t = (e.data as { transfer?: Transfer } | null)?.transfer;
    if (t && t.id === tid) setTransfer(t);
  });
  useEffect(() => {
    if (!tid || !running) return;
    const look = () =>
      api<{ transfers: Transfer[] }>('/api/machines/projects/transfers')
        .then((r) => {
          const t = r.transfers.find((x) => x.id === tid);
          if (t) setTransfer(t);
        })
        .catch(() => {});
    const id = setInterval(look, 2000);
    return () => clearInterval(id);
  }, [tid, running]);

  const start = async () => {
    if (to === null || !plan || !place) return;
    setStarting(true);
    setSendError('');
    try {
      const r = await post<{ transfer: Transfer }>('/api/machines/projects/send', { from, project: space.id, to, how, folder: folder ?? place.folder, leaveOut, also });
      setTransfer(r.transfer);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };
  const cancel = () => {
    if (transfer) del(`/api/machines/projects/transfers/${enc(transfer.id)}`).catch((e) => setSendError(e instanceof Error ? e.message : String(e)));
  };
  // A moved project is gone from this machine: its page has nothing left to show.
  const close = () => {
    onClose();
    if (transfer?.how === 'move' && transfer.state === 'done' && transfer.from.machine === from) closeProject();
  };
  const openThere = () => {
    if (!transfer?.result) return;
    const at = transfer.to.machine || null;
    if (at === machineId) {
      onClose();
      openProject(transfer.result.project);
    } else location.href = machinePath(at, `/projects/${enc(transfer.result.project)}`);
  };

  const verb = how === 'sync' ? tr('Keep in sync') : how === 'move' ? tr('Move') : tr('Copy');
  const ended = !!transfer && !running;

  const footer = running ? (
    <>
      <Button variant="ghost" onClick={cancel}>
        Cancel sending
      </Button>
      <Button variant="secondary" onClick={close}>
        Close
      </Button>
    </>
  ) : ended && transfer.state === 'done' && isClientRef(transfer.to.machine) ? (
    <Button variant="ghost" onClick={close}>
      Close
    </Button>
  ) : ended && transfer.state === 'done' ? (
    <>
      <Button variant="ghost" onClick={close}>
        Close
      </Button>
      <Button variant="primary" icon={<ArrowUpRight size={14} />} onClick={openThere}>
        Open it there
      </Button>
    </>
  ) : ended ? (
    <>
      <Button variant="ghost" onClick={close}>
        Close
      </Button>
      <Button
        variant="primary"
        onClick={() => {
          setTransfer(null);
          setSendError('');
        }}
      >
        Try again
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={close}>
        Cancel
      </Button>
      <Button variant="primary" disabled={starting || loading || !plan || !place || to === null || !(folder ?? place.folder).trim()} onClick={() => void start()}>
        {starting && <Throbber size={14} />}
        {verb}
      </Button>
    </>
  );

  return (
    <Dialog open onClose={close} title={<span translate="no">{tr(`Send “${space.name}” to another machine`)}</span>} width={580} footer={footer}>
      {transfer ? (
        <Progress t={transfer} />
      ) : (
        <div className="space-y-4 text-[13.5px]">
          {!loaded ? (
            <Throbber className="text-fg-3" />
          ) : !targets.length ? (
            <p className="leading-relaxed text-fg-3">No other machines yet. Add one in Settings → Machines.</p>
          ) : (
            <>
              <div>
                <Label>To</Label>
                <div role="radiogroup" aria-label={tr('To')} className="space-y-1.5">
                  {targets.map((t) => (
                    <Choice key={t.ref || 'own'} on={to === t.ref} off={!!t.off} label={<span translate="no">{t.name}</span>} hint={t.off} dot={t.dot} onClick={() => setTo(t.ref)} />
                  ))}
                </div>
              </div>
              <div>
                <Label>How</Label>
                <div role="radiogroup" aria-label={tr('How')} className="space-y-1.5">
                  {HOWS.map((h) => (
                    <Choice key={h.how} on={how === h.how} off={h.how === 'sync' && !!syncOff} label={h.label} hint={h.how === 'sync' && syncOff ? syncOff : h.hint} icon={<h.icon size={14} />} onClick={() => setHow(h.how)} />
                  ))}
                </div>
                {how === 'move' && (
                  <p className="mt-2 text-[12.5px] leading-snug text-warn">{tr(`It leaves ${fromName}. Its folder goes to the Trash there, and you can get it back from the Trash.`)}</p>
                )}
              </div>
              <div>
                <Label>What goes</Label>
                {loading && !plan ? (
                  <div className="flex items-center gap-2 text-fg-3">
                    <Throbber size={16} /> Looking at what it holds…
                  </div>
                ) : planError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-err/30 bg-err/10 px-3 py-2.5 text-[13px] leading-snug text-err">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span translate="no">{planError}</span>
                  </div>
                ) : plan ? (
                  <div className={cx('space-y-2.5 transition-opacity', loading && 'opacity-60')}>
                    <div>
                      <div className="font-medium">
                        {files(plan.files.count)} · {bytes(plan.files.bytes)}
                        {plan.git && <span className="font-normal text-fg-3">{tr(', with its Git history')}</span>}
                      </div>
                      {alsoLine(plan) && <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{tr(`Also: ${alsoLine(plan)}`)}</div>}
                    </div>
                    <Tick
                      on={leaveOut}
                      onChange={setLeaveOut}
                      label={tr('Leave out what can be made again')}
                      hint={(() => {
                        const made = plan.leftOut.filter((l) => l.why === 'rebuilt');
                        return made.length ? (
                          <span>
                            <span translate="no">{made.slice(0, 3).map((l) => l.path).join(', ')}{made.length > 3 ? '…' : ''}</span> · {bytes(made.reduce((a, l) => a + l.bytes, 0))}
                          </span>
                        ) : undefined;
                      })()}
                    />
                    {alsoHome.length > 0 && (
                      <Tick
                        on={also}
                        onChange={setAlso}
                        label={tr('Copy its other folders too')}
                        hint={<span>{alsoHome.length === 1 ? <><span translate="no">{tildify(alsoHome[0].path, place?.home)}</span> · {bytes(alsoHome[0].bytes)}</> : tr(`${alsoHome.length} folders · ${bytes(alsoHome.reduce((a, f) => a + f.bytes, 0))}`)}</span>}
                      />
                    )}
                    <p className="text-[12.5px] leading-snug text-fg-3">{tr('Stays here: its conversations, experiment runs and share links.')}</p>
                    {plan.leftOut.some((l) => l.why === 'link') && (
                      <Warn>{tr(`${plan.leftOut.filter((l) => l.why === 'link').length} links that lead out of its folder stay behind.`)}</Warn>
                    )}
                    {plan.documents.leftOut.length > 0 && (
                      <Warn>
                        {tr('Documents that read folders outside its folder keep only what is inside it:')} <span translate="no">{plan.documents.leftOut.join(', ')}</span>
                      </Warn>
                    )}
                    {plan.sync && <Warn>{tr(`It is already kept in sync with ${plan.sync.peer.name}.`)}</Warn>}
                  </div>
                ) : null}
              </div>
              {plan && place && (
                <div>
                  <Label>{tr(`Where on ${target?.name ?? ''}`)}</Label>
                  <input
                    value={folder ?? place.folder}
                    onChange={(e) => setFolder(e.target.value)}
                    aria-label={tr(`Where on ${target?.name ?? ''}`)}
                    spellCheck={false}
                    translate="no"
                    className={cx(inputCls, 'font-mono text-[13px]')}
                  />
                  <p className={cx('mt-1 text-[12.5px]', tight ? 'text-err' : 'text-fg-3')}>
                    {place.free == null ? tr('Free space there: unknown') : tight ? tr(`Only ${bytes(place.free)} free there; it needs ${bytes(plan.total.bytes)}`) : tr(`${bytes(place.free)} free there`)}
                  </p>
                </div>
              )}
              {sendError && (
                <div className="flex items-start gap-2 rounded-xl border border-err/30 bg-err/10 px-3 py-2.5 text-[13px] leading-snug text-err">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span translate="no">{sendError}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12.5px] leading-snug text-warn">
      <AlertTriangle size={14} className="mt-px shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** A sending under way, or done: the bar and how far it is; at the end what is where, and what was left out. */
function Progress({ t }: { t: Transfer }) {
  const run = t.state === 'sending' || t.state === 'finishing';
  if (t.state === 'failed' || t.state === 'cancelled') {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-err/30 bg-err/10 px-3 py-2.5 text-[13px] leading-snug text-err">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span translate="no">{t.state === 'cancelled' ? tr('Cancelled.') : t.error || tr('It did not go through.')}</span>
      </div>
    );
  }
  const p = t.state === 'finishing' || t.state === 'done' ? 1 : Math.min(1, percent(t));
  if (t.state === 'done') {
    const r = t.result;
    return (
      <div className="space-y-3 text-[13.5px]">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
            <Check size={13} strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <div className="font-medium" translate="no">
              {tr(`“${t.project.name}” is on ${t.to.name} now`)}
            </div>
            <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">
              {t.how === 'sync' ? tr('The two are kept in sync while both machines are on.') : t.how === 'move' ? (r?.trashed ? tr(`Its folder here is in the Trash: ${r.trashed}`) : r?.kept ? tr(`Its folder here stayed where it was: ${r.kept}`) : tr('It has left this machine.')) : tr('This one stays as it is.')}
            </div>
            {isClientRef(t.to.machine) && (
              <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3" translate="no">
                {tr(`Open it in Hydor on ${t.to.name}: it is in its Projects`)}
              </div>
            )}
          </div>
        </div>
        {!!r?.leftOut.length && (
          <div className="rounded-xl border border-line bg-bg-1 px-3 py-2.5">
            <div className="mb-1 text-[12px] font-medium text-fg-3">What was left out</div>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[12.5px] leading-snug text-fg-2" translate="no">
              {r.leftOut.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3 text-[13.5px]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          {t.state === 'finishing' ? tr('Finishing…') : t.total.bytes > 0 ? tr(`Sending · ${Math.round(p * 100)}% · ${bytes(t.done.bytes)} of ${bytes(t.total.bytes)}`) : tr('Sending…')}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
        <div className={cx('h-full rounded-full bg-accent transition-[width] duration-500', t.state === 'finishing' && 'breathe')} style={{ width: `${Math.max(2, p * 100)}%` }} />
      </div>
      <p className="text-[12.5px] leading-snug text-fg-3">
        <span className="block">{tr(`${n(t.done.files)} of ${n(t.total.files)} files`)}</span>
        <span className="block">You can close this: it carries on, and a notice tells you when it is done.</span>
      </p>
    </div>
  );
}
