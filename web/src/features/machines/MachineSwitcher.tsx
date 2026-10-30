// The machine the app shows, and a switch to the others (Settings → Machines). Each machine's pages
// are /m/<id>/…; moving to another machine loads its pages afresh.
import { useRef, useState } from 'react';
import { Check, ChevronsUpDown, Server, Settings2 } from 'lucide-react';
import type { MachineView } from '@shared/types';
import { machineId, machinePath } from '../../lib/machine';
import { useMachines } from '../../lib/machines';
import { go } from '../../lib/nav';
import { Button, cx, Popover } from '../../components/ui';

export const MACHINE_DOT: Record<MachineView['status']['state'], string> = { online: 'bg-ok', connecting: 'bg-fg-3 animate-pulse', offline: 'bg-err' };

/** A machine's state in a few words: whether it answers, and what needs you there. */
export function machineLine(m: MachineView): string {
  const s = m.status;
  if (s.state === 'connecting') return 'Connecting…';
  if (s.state === 'offline') return 'Not reachable';
  const parts = [s.waiting ? `${s.waiting} need${s.waiting === 1 ? 's' : ''} you` : '', s.working ? `${s.working} working` : ''].filter(Boolean);
  return parts.join(' · ') || 'Online';
}

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
  // Sessions needing you on the other machines: a dot here, so they are not missed from this one.
  const elsewhere = list.filter((m) => m.id !== machineId).reduce((n, m) => n + m.status.waiting, 0);
  const pick = (id: string | null) => {
    setOpen(false);
    onGo?.();
    openMachine(id);
  };
  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        title="Switch machine"
        className={cx(
          'flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-[13px] transition-colors',
          machineId ? 'bg-accent-soft text-fg hover:bg-accent/15' : 'text-fg-2 hover:bg-bg-2',
        )}
      >
        <Server size={14} className={machineId ? 'text-accent' : 'text-fg-3'} />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{name}</span>
        {elsewhere > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title={`${elsewhere} waiting on other machines`} />}
        <ChevronsUpDown size={13} className="shrink-0 text-fg-3" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={290}>
        <Row name={self?.host ?? 'This machine'} hint="This server" dot="bg-ok" current={!machineId} onClick={() => pick(null)} />
        {list.map((m) => (
          <Row key={m.id} name={m.name} hint={machineLine(m)} warn={m.status.waiting > 0} dot={MACHINE_DOT[m.status.state]} current={m.id === machineId} onClick={() => pick(m.id)} />
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
          Add or change machines…
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
