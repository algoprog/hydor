// Where runs go: this computer (its GPUs, and how many jobs without a GPU run at once), the other machines of
// Settings → Machines, and clusters reached over SSH (SLURM, or plain SSH with tmux there): Add a cluster, Check
// (ssh host true, then sinfo or nvidia-smi), Remove. This computer's night is set here too: its hours, and what
// happens to night runs still going when it ends.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Plus, Server, XCircle } from 'lucide-react';
import type { ClusterSpec, ExperimentsSettings, QueueNow } from '@shared/experiments';
import type { MachineView } from '@shared/types';
import { api, post, put } from '../../lib/api';
import { machineId } from '../../lib/machine';
import { trIn } from '../../i18n/runtime';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, Dialog, inputCls, Segmented, Switch, Throbber } from '../../components/ui';
import { AgentHoursLimit } from './AgentHours';
import { loadSettings } from './api';

function ClusterForm({ onAdded, onCancel }: { onAdded: (c: ClusterSpec) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [kind, setKind] = useState<'slurm' | 'ssh'>('slurm');
  const [workdir, setWorkdir] = useState('~/hydor-runs');
  const [setup, setSetup] = useState('');
  const [partition, setPartition] = useState('');
  const [account, setAccount] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<'check' | 'add' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tryIt = async () => {
    setBusy('check');
    setCheck(null);
    try {
      setCheck(await post<{ ok: boolean; text: string }>('/api/experiments/clusters/check', { host, kind }));
    } catch (e) {
      setCheck({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const add = async () => {
    setBusy('add');
    setError(null);
    try {
      const r = await post<{ cluster: ClusterSpec }>('/api/experiments/clusters', { name, host, kind, workdir, setup, partition, account });
      if (check) await post('/api/experiments/clusters/check', { id: r.cluster.id }).catch(() => {});
      onAdded(r.cluster);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-line p-3 text-[13px]">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-fg-2">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Unity" className={inputCls} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-fg-2">SSH host</span>
          <input value={host} onChange={(e) => setHost(e.target.value.trim())} placeholder="unity or me@login.cluster.edu" spellCheck={false} className={cx(inputCls, 'font-mono text-[12.5px]')} />
        </label>
      </div>
      <Segmented
        size="sm"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'slurm', label: 'SLURM' },
          { value: 'ssh', label: 'Plain SSH' },
        ]}
      />
      <p className="leading-relaxed text-fg-3">
        {kind === 'slurm'
          ? 'Jobs go into its queue with sbatch; nothing is installed there. This computer reaches it with its own SSH key, without a password (ssh-copy-id).'
          : 'Jobs run there in tmux (or in the background), on GPUs chosen as here. This computer reaches it with its own SSH key, without a password.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-fg-2">Folder there for runs’ logs</span>
          <input value={workdir} onChange={(e) => setWorkdir(e.target.value)} spellCheck={false} className={cx(inputCls, 'font-mono text-[12.5px]')} />
        </label>
        {kind === 'slurm' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-fg-2">Partition</span>
              <input value={partition} onChange={(e) => setPartition(e.target.value)} placeholder="gpu" spellCheck={false} className={cx(inputCls, 'font-mono text-[12.5px]')} />
            </label>
            <label className="block">
              <span className="mb-1 block text-fg-2">Account</span>
              <input value={account} onChange={(e) => setAccount(e.target.value)} spellCheck={false} className={cx(inputCls, 'font-mono text-[12.5px]')} />
            </label>
          </div>
        )}
      </div>
      <label className="block">
        <span className="mb-1 block text-fg-2">Setup lines</span>
        <textarea value={setup} onChange={(e) => setSetup(e.target.value)} rows={2} spellCheck={false} placeholder={'module load cuda/12.1\nsource ~/venvs/ml/bin/activate'} className={cx(inputCls, 'h-auto py-2 font-mono text-[12px]')} />
        <span className="mt-1 block text-fg-3">Run before each job there.</span>
      </label>
      {check && (
        <p className={cx('flex items-start gap-2 rounded-lg px-3 py-2 leading-relaxed', check.ok ? 'bg-ok/10 text-ok' : 'bg-err/10 text-err')}>
          {check.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <XCircle size={15} className="mt-0.5 shrink-0" />}
          <span>{check.text}</span>
        </p>
      )}
      {error && <p className="rounded-lg bg-err/10 px-3 py-2 leading-relaxed text-err">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="secondary" onClick={tryIt} disabled={!host || !!busy}>
          {busy === 'check' ? 'Checking…' : 'Check'}
        </Button>
        <Button size="sm" variant="primary" onClick={add} disabled={!name.trim() || !host || !!busy}>
          {busy === 'add' ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </div>
  );
}

export function Places({ open, onClose, adding }: { open: boolean; onClose: () => void; adding?: boolean }) {
  const [clusters, setClusters] = useState<ClusterSpec[] | null>(null);
  const [machines, setMachines] = useState<MachineView[]>([]);
  const [queue, setQueue] = useState<QueueNow | null>(null);
  const [slots, setSlots] = useState('');
  const [share, setShare] = useState<boolean | null>(null);
  // The limit on agents' GPU hours; undefined until read (a machine running an older Hydor has none).
  const [agentHours, setAgentHours] = useState<number | null | undefined>(undefined);
  const [night, setNight] = useState<Pick<ExperimentsSettings, 'nightFrom' | 'nightTo' | 'nightEnds'> | null>(null);
  // A time typed is saved a moment after the last key, or on leaving the box: half a time is not a night.
  const hours = useRef<{ patch: Partial<ExperimentsSettings>; timer?: number }>({ patch: {} });
  const [form, setForm] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const load = () => {
    api<{ clusters: ClusterSpec[] }>('/api/experiments/clusters')
      .then((r) => setClusters(r.clusters))
      .catch(() => setClusters([]));
  };
  useEffect(() => {
    if (!open) return;
    setForm(!!adding);
    load();
    api<{ machines: MachineView[] }>('/api/machines')
      .then((r) => setMachines(r.machines))
      .catch(() => setMachines([]));
    api<QueueNow>('/api/experiments/queue')
      .then(setQueue)
      .catch(() => {});
    setNight(null);
    setShare(null);
    setAgentHours(undefined);
    loadSettings()
      .then((s) => {
        setSlots(String(s.cpuSlots));
        // A machine running an older Hydor has no such setting: nothing to show then.
        setShare(s.shareGpus ?? null);
        setAgentHours(s.agentGpuHours);
        setNight({ nightFrom: s.nightFrom, nightTo: s.nightTo, nightEnds: s.nightEnds });
      })
      .catch(() => {});
  }, [open, adding]);
  const saveHours = () => {
    window.clearTimeout(hours.current.timer);
    const patch = hours.current.patch;
    hours.current = { patch: {} };
    if (Object.keys(patch).length) put('/api/experiments/settings', patch).catch(toastError);
  };
  const setHour = (k: 'nightFrom' | 'nightTo', v: string) => {
    setNight((n) => n && { ...n, [k]: v });
    window.clearTimeout(hours.current.timer);
    if (v) hours.current.patch[k] = v;
    else delete hours.current.patch[k];
    hours.current.timer = window.setTimeout(saveHours, 1200);
  };
  const setNightEnds = (v: ExperimentsSettings['nightEnds']) => {
    setNight((n) => n && { ...n, nightEnds: v });
    put('/api/experiments/settings', { nightEnds: v }).catch(toastError);
  };
  const saveSlots = async (v: string) => {
    setSlots(v);
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 64) return;
    await put('/api/experiments/settings', { cpuSlots: n }).catch(toastError);
  };
  const saveShare = (v: boolean) => {
    setShare(v);
    put('/api/experiments/settings', { shareGpus: v }).catch(toastError);
  };
  const check = async (c: ClusterSpec) => {
    setChecking(c.id);
    try {
      await post('/api/experiments/clusters/check', { id: c.id });
    } catch (e) {
      toastError(e);
    } finally {
      setChecking(null);
      load();
    }
  };
  const remove = async (c: ClusterSpec) => {
    try {
      await api(`/api/experiments/clusters/${c.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      toastError(e);
    }
  };
  const gpuNames = [...new Set(queue?.gpus.map((g) => g.name.replace('NVIDIA ', '')) ?? [])];
  return (
    <Dialog open={open} onClose={onClose} title="Where runs go" width={620} part="experiments">
      <div className="space-y-5 text-[13px]">
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold">{machineId ? 'This machine' : 'This computer'}</h3>
          <p className="text-fg-2">{queue ? (queue.gpus.length ? `${queue.gpus.length} GPU${queue.gpus.length === 1 ? '' : 's'}: ${gpuNames.join(', ')}` : (queue.gpuNote ?? 'No NVIDIA GPU here')) : '…'}</p>
          <label className="flex flex-wrap items-center gap-2 text-fg-2">
            Jobs without a GPU: at most
            <input value={slots} onChange={(e) => saveSlots(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-14 text-[13px]')} />
            at once
          </label>
          {share !== null && (
            <div className="flex items-start gap-2.5">
              <Switch on={share} onChange={saveShare} label="Runs share a GPU when their memory fits" className="mt-px" />
              <div className="min-w-0">
                <div className="text-fg-2">Runs share a GPU when their memory fits</div>
                <p className="leading-relaxed text-fg-3">
                  {share ? 'A run that says how much memory it needs may go on a GPU beside others. One that does not gets a GPU to itself.' : 'Each GPU takes one of your runs at a time.'}
                </p>
              </div>
            </div>
          )}
          {agentHours !== undefined && <AgentHoursLimit value={agentHours} />}
          {night && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-fg-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap">Night from</span>
                  <input type="time" aria-label="The night starts at" value={night.nightFrom} onChange={(e) => setHour('nightFrom', e.target.value)} onBlur={saveHours} className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-[9rem] text-[13px]')} />
                  {/* Kept with its box, so a narrow screen takes both to the next line. */}
                  <span className="flex items-center gap-2">
                    {trIn('night', 'to')}
                    <input type="time" aria-label="The night ends at" value={night.nightTo} onChange={(e) => setHour('nightTo', e.target.value)} onBlur={saveHours} className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-[9rem] text-[13px]')} />
                  </span>
                </span>
                <span className="flex max-w-full flex-wrap items-center gap-2">
                  When the night ends
                  <Segmented
                    size="sm"
                    value={night.nightEnds}
                    onChange={setNightEnds}
                    options={[
                      { value: 'finish', label: 'Let running ones finish' },
                      { value: 'stop', label: 'Stop them and start them again the next night' },
                    ]}
                  />
                </span>
              </div>
              <p className="leading-relaxed text-fg-3">
                {night.nightFrom === night.nightTo
                  ? 'From and to are the same: there is no night, and night runs wait until you set one.'
                  : 'A night run starts only in these hours, after your other waiting runs. One stopped at the end starts again from the beginning, unless it says how to carry on.'}
              </p>
            </>
          )}
        </section>
        {!machineId && (
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold">Other machines</h3>
            {machines.length ? (
              <ul className="space-y-1">
                {machines.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', m.status.state === 'online' ? 'bg-ok' : 'bg-fg-3')} />
                    <span translate="no" className="font-medium">
                      {m.name}
                    </span>
                    <span className="text-fg-3">{m.status.state === 'online' ? 'connected: runs can go there' : 'not connected now'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="leading-relaxed text-fg-3">
                Other computers running Hydor, added in{' '}
                <button type="button" className="text-accent hover:underline" onClick={() => go('/settings?s=machines')}>
                  Settings → Machines
                </button>
                , take runs too; their runs show here, marked with where they run.
              </p>
            )}
          </section>
        )}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-[13px] font-semibold">Clusters</h3>
            {!form && (
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setForm(true)}>
                Add a cluster
              </Button>
            )}
          </div>
          {form && (
            <ClusterForm
              onAdded={() => {
                setForm(false);
                load();
              }}
              onCancel={() => setForm(false)}
            />
          )}
          {!clusters ? (
            <Throbber size={18} />
          ) : clusters.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {clusters.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-3 py-2">
                  <Server size={15} className="mt-0.5 shrink-0 text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span translate="no" className="font-medium">
                        {c.name}
                      </span>
                      <span translate="no" className="font-mono text-[11.5px] text-fg-3">
                        {c.host}
                      </span>
                      <span className="text-[11.5px] text-fg-3">{c.kind === 'slurm' ? 'SLURM' : 'plain SSH'}</span>
                    </div>
                    {c.checked && <div className={cx('text-[12px] leading-relaxed', c.checked.ok ? 'text-fg-3' : 'text-err')}>{c.checked.text}</div>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => check(c)} disabled={checking === c.id}>
                    {checking === c.id ? 'Checking…' : 'Check'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            !form && <p className="leading-relaxed text-fg-3">A cluster you reach over SSH takes runs too: SLURM ones through their queue (sbatch), others in tmux there.</p>
          )}
        </section>
      </div>
    </Dialog>
  );
}
