// The machine the app shows, and a switch to the others (Settings → Machines). Each machine's pages
// are /m/<id>/…; moving to another machine loads its pages afresh.
import { useRef, useState } from 'react';
import { Check, ChevronsUpDown, Server, Settings2, X } from 'lucide-react';
import type { MachineNews, MachineStatus, MachineView } from '@shared/types';
import { tr } from '../../i18n/runtime';
import { timeAgo } from '../../lib/format';
import { machineId, machinePath } from '../../lib/machine';
import { elsewhere, newsOfMachine, useMachines } from '../../lib/machines';
import { go, sessionPath } from '../../lib/nav';
import { UPDATE_PHASE } from '../../lib/updates';
import { Button, cx, Popover } from '../../components/ui';

export const MACHINE_DOT: Record<MachineView['status']['state'], string> = { online: 'bg-ok', connecting: 'bg-fg-3 animate-pulse', offline: 'bg-err' };

/** The dot of a machine's state: one restarting into an update is not down. */
export const machineDot = (s: MachineStatus) => (s.state === 'offline' && s.restarting ? 'bg-warn animate-pulse' : MACHINE_DOT[s.state]);

/** What the sessions of a machine come to, in a few words: what finished since you looked, what needs you, what works. */
// One and many are phrases of their own ("1 finished", "{0} finished"), so that each language can say both its way.
function countsLine(s: Pick<MachineStatus, 'waiting' | 'working' | 'finished'>): string[] {
  const finished = s.finished ?? 0;
  const waiting = s.waiting;
  return [
    finished ? (finished === 1 ? tr('1 finished') : tr(`${finished} finished`)) : '',
    waiting ? (waiting === 1 ? tr('1 needs you') : tr(`${waiting} need you`)) : '',
    s.working ? tr(`${s.working} working`) : '',
  ].filter(Boolean);
}

/** What a machine's update is at: how far it is, or the step. */
function updateLine(u: NonNullable<MachineStatus['update']>): string {
  if (u.share !== undefined) return tr(`Updating · ${Math.round(u.share * 100)}%`);
  if (u.phase === 'restart') return tr('Updating · restarting');
  return (UPDATE_PHASE as Record<string, string | undefined>)[u.phase] ?? tr('Updating');
}

/** A machine's state in a few words: whether it answers, what it is doing about an update, and what needs you there. */
export function statusLine(s: MachineStatus): string {
  if (s.state === 'connecting') return 'Connecting…';
  if (s.state === 'offline') return s.restarting ? tr('Restarting…') : 'Not reachable';
  if (s.update) return updateLine(s.update);
  return countsLine(s).join(' · ') || 'Online';
}

export const machineLine = (m: MachineView): string => statusLine(m.status);

/** Moves to a machine's pages (null: this server's own). */
function openMachine(id: string | null) {
  if (id !== machineId) location.href = machinePath(id);
}

/** The sidebar's machine row, once there is another machine to switch to. */
export function MachineSwitcher({ onGo }: { onGo?: () => void }) {
  const list = useMachines((s) => s.list);
  const self = useMachines((s) => s.self);
  const loaded = useMachines((s) => s.loaded);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  if (!machineId && (!loaded || !list.length)) return null;
  const current = list.find((m) => m.id === machineId);
  const name = machineId ? (current?.name ?? machineId) : (self?.host ?? 'This machine');
  // What finished or waits on the other machines (this server's own too, on another machine's pages): said here, so it is not missed from this one.
  const { finished, waiting } = elsewhere(self, list);
  const selfLine = machineId && self?.status ? countsLine(self.status).join(' · ') : '';
  const pick = (id: string | null) => {
    setOpen(false);
    onGo?.();
    openMachine(id);
  };
  return (
    <>
      <button
        ref={ref}
        data-tip="machines"
        onClick={() => setOpen((o) => !o)}
        title="Switch machine"
        className={cx(
          'flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-[13px] transition-colors',
          machineId ? 'bg-accent-soft text-fg hover:bg-accent/15' : 'text-fg-2 hover:bg-bg-2',
        )}
      >
        <Server size={14} className={machineId ? 'text-accent' : 'text-fg-3'} />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{name}</span>
        {finished > 0 && (
          <span title={finished === 1 ? tr('1 finished on another machine') : tr(`${finished} finished on other machines`)} className="tnum min-w-4 shrink-0 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-accent-fg">
            {finished > 99 ? '99+' : finished}
          </span>
        )}
        {waiting > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title={waiting === 1 ? tr('1 waiting on another machine') : tr(`${waiting} waiting on other machines`)} />}
        <ChevronsUpDown size={13} className="shrink-0 text-fg-3" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={290}>
        <Row name={self?.host ?? 'This machine'} hint={selfLine || 'This server'} warn={!!machineId && (self?.status?.waiting ?? 0) > 0} dot="bg-ok" current={!machineId} onClick={() => pick(null)} />
        {machineId && <News items={newsOfMachine(self?.status)} id={null} />}
        {list.map((m) => (
          <div key={m.id}>
            <Row name={m.name} hint={machineLine(m)} warn={m.status.waiting > 0 && !m.status.update} dot={machineDot(m.status)} current={m.id === machineId} onClick={() => pick(m.id)} />
            {m.id !== machineId && <News items={newsOfMachine(m.status)} id={m.id} />}
          </div>
        ))}
        <div className="my-1 border-t border-line" />
        <button
          onClick={() => {
            setOpen(false);
            onGo?.();
            go('/settings?s=machines');
          }}
          className="flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
        >
          <Settings2 size={14} className="text-fg-3" />
          Add or change machines
        </button>
      </Popover>
    </>
  );
}

function Row({ name, hint, dot, current, warn, onClick }: { name: string; hint: string; dot: string; current: boolean; warn?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-bg-2">
      <span className={cx('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-fg">{name}</span>
        <span className={cx('block truncate text-[11.5px]', warn ? 'text-warn' : 'text-fg-3')}>{hint}</span>
      </span>
      {current && <Check size={14} className="shrink-0 text-fg" strokeWidth={2.5} />}
    </button>
  );
}

/** The sessions that finished on a machine since you looked there (up to 3), each one click from opening on that machine. */
function News({ items, id }: { items: MachineNews[]; id: string | null }) {
  if (!items.length) return null;
  return (
    <div className="mb-1 ml-[26px] flex flex-col">
      {items.slice(0, 3).map((n) => (
        <button
          key={n.key}
          onClick={() => (location.href = machinePath(id, sessionPath(n.key)))}
          className="flex h-6.5 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[12px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
        >
          {n.failed ? <X size={12} className="shrink-0 text-err" strokeWidth={2.5} /> : <Check size={12} className="shrink-0 text-ok" strokeWidth={2.5} />}
          <span translate="no" className="min-w-0 flex-1 truncate">
            {n.title}
          </span>
          <span className="shrink-0 text-[11px] text-fg-3">{timeAgo(n.at)}</span>
        </button>
      ))}
    </div>
  );
}

/** Another machine's page when that machine does not answer. */
export function MachineDown({ error }: { error: string }) {
  const list = useMachines((s) => s.list);
  const self = useMachines((s) => s.self);
  const m = list.find((x) => x.id === machineId);
  const name = m?.name ?? machineId ?? '';
  return (
    <div className="flex h-full items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6">
        <div className="flex items-center gap-2.5">
          <Server size={18} className="text-fg-3" />
          <h1 className="text-[16.5px] font-semibold">{name} is not reachable</h1>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">{error.replace(/^.*? is not reachable: /, '')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => location.reload()}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => openMachine(null)}>
            Open {self?.host ?? 'the main machine'}
          </Button>
          <Button variant="ghost" onClick={() => (location.href = '/settings?s=machines')}>
            Settings → Machines
          </Button>
        </div>
      </div>
    </div>
  );
}
