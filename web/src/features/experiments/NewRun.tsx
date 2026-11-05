// New run: the command, its folder, the GPUs it needs and the free memory each, where it runs, a name and an
// experiment; More options folds the rest (settings, seed, priority, a metrics file, what to tell you, the agent on
// call and its rules, a cluster's needs). As a sweep: the command with {name} placeholders and values for each
// setting, every combination or a random sample, and an early stop. Run again opens it filled in.
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { ClusterSpec, RunRecord, WatchKind } from '@shared/experiments';
import type { MachineView } from '@shared/types';
import { api, post } from '../../lib/api';
import { useApp } from '../../lib/store';
import { FolderPicker } from '../../components/FolderPicker';
import { Button, cx, Dialog, IconButton, inputCls, Segmented } from '../../components/ui';

const DEFAULT_RULES =
  'Read the log and the code. If a fix is clear and safe, run it again with experiment_run (from the last checkpoint if there is one), changing as little as possible. Never delete files or checkpoints. Then tell the user in a few lines what happened and what you did.';

const WATCH: { id: WatchKind; label: string }[] = [
  { id: 'nan', label: 'NaN' },
  { id: 'oom', label: 'Out of memory' },
  { id: 'stall', label: 'A stall' },
  { id: 'crash', label: 'A crash' },
  { id: 'diverge', label: 'Divergence' },
];

const LAST_CWD = 'naget.experiments.cwd';

function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block leading-relaxed text-fg-3">{hint}</span>}
    </label>
  );
}

/** "lr=0.1" lines as settings; numbers as numbers. */
function readSettings(text: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const l of text.split('\n')) {
    const m = /^\s*([\w.@/-]+)\s*[=:]\s*(.*?)\s*$/.exec(l);
    if (!m) continue;
    const v = m[2];
    out[m[1]] = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v;
  }
  return out;
}

const settingsText = (p?: Record<string, unknown>) =>
  Object.entries(p ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

/** A sweep's values as typed ("0.1, 0.01, 1e-3"): numbers as numbers. */
const readValues = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((v) => (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v));

export interface NewRunProps {
  open: boolean;
  onClose: () => void;
  /** Run again: the run it starts from. */
  from?: RunRecord | null;
  /** Start as a sweep. */
  sweep?: boolean;
  onStarted: (r: { run?: RunRecord; group?: string }) => void;
}

export function NewRun({ open, onClose, from, sweep: asSweep, onStarted }: NewRunProps) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const defaultCwd = useApp((s) => s.boot?.defaultCwd) ?? home;
  const [mode, setMode] = useState<'one' | 'sweep'>('one');
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('');
  const [where, setWhere] = useState('local');
  const [gpus, setGpus] = useState('1');
  const [mem, setMem] = useState('');
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [more, setMore] = useState(false);
  const [settings, setSettings] = useState('');
  const [seed, setSeed] = useState('');
  const [priority, setPriority] = useState('');
  const [metricsFile, setMetricsFile] = useState('');
  const [scoresFile, setScoresFile] = useState('');
  const [hours, setHours] = useState('');
  const [cpus, setCpus] = useState('');
  const [memGb, setMemGb] = useState('');
  const [partition, setPartition] = useState('');
  const [tellDone, setTellDone] = useState(true);
  const [tellFailed, setTellFailed] = useState(true);
  const [when, setWhen] = useState({ on: false, metric: '', op: '>' as '>' | '<' | '>=' | '<=', value: '' });
  const [onCall, setOnCall] = useState<'off' | 'tell' | 'agent'>('off');
  const [watch, setWatch] = useState<WatchKind[]>(WATCH.map((w) => w.id));
  const [stall, setStall] = useState('30');
  const [rules, setRules] = useState('');
  const [params, setParams] = useState<{ name: string; values: string }[]>([{ name: '', values: '' }]);
  const [sampling, setSampling] = useState<'grid' | 'random'>('grid');
  const [maxRuns, setMaxRuns] = useState('');
  const [stopMetric, setStopMetric] = useState('');
  const [stopBetter, setStopBetter] = useState<'min' | 'max'>('min');
  const [machines, setMachines] = useState<MachineView[]>([]);
  const [clusters, setClusters] = useState<ClusterSpec[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [hasGpus, setHasGpus] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filled in as it opens: from the run it runs again, else the folder used last.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setMode(asSweep ? 'sweep' : 'one');
    api<{ machines: MachineView[] }>('/api/machines')
      .then((r) => setMachines(r.machines.filter((m) => m.status.state === 'online')))
      .catch(() => setMachines([]));
    api<{ clusters: ClusterSpec[] }>('/api/experiments/clusters')
      .then((r) => setClusters(r.clusters))
      .catch(() => setClusters([]));
    api<{ groups: { name: string }[] }>('/api/experiments/groups')
      .then((r) => setGroups(r.groups.map((g) => g.name)))
      .catch(() => {});
    api<{ gpus: unknown[] }>('/api/experiments/queue')
      .then((q) => {
        setHasGpus(q.gpus.length > 0);
        if (!from) setGpus(q.gpus.length ? '1' : '0');
      })
      .catch(() => setHasGpus(null));
    const f = from;
    setCommand(f?.command ?? '');
    setCwd(f?.cwd ?? localStorage.getItem(LAST_CWD) ?? defaultCwd);
    setWhere(f ? (f.remote ? `m:${f.remote.machine}` : (f.where ?? 'local')) : 'local');
    if (f) setGpus(String(f.gpus ?? 0));
    setMem(f?.gpuMemGb ? String(f.gpuMemGb) : '');
    setName(f?.name ?? '');
    setGroup(f?.group ?? '');
    setSettings(settingsText(f?.params));
    setSeed(f?.seed !== undefined ? String(f.seed) : '');
    setPriority(f?.priority ? String(f.priority) : '');
    setMetricsFile(f?.metricsFile ?? '');
    setScoresFile(f?.scoresFile ?? '');
    setHours(f?.hours ? String(f.hours) : '');
    setCpus(f?.cpus ? String(f.cpus) : '');
    setMemGb(f?.memGb ? String(f.memGb) : '');
    setPartition(f?.partition ?? '');
    setTellDone(f?.notify?.done !== false);
    setTellFailed(f?.notify?.failed !== false);
    setWhen(f?.notify?.when ? { on: true, metric: f.notify.when.metric, op: f.notify.when.op, value: String(f.notify.when.value) } : { on: false, metric: '', op: '>', value: '' });
    setOnCall(f?.onCall?.on ? (f.onCall.act === 'agent' ? 'agent' : 'tell') : 'off');
    setWatch(f?.onCall?.watch ?? WATCH.map((w) => w.id));
    setStall(String(f?.onCall?.stallMinutes ?? 30));
    setRules(f?.onCall?.rules ?? '');
    setParams([{ name: '', values: '' }]);
    setSampling('grid');
    setMaxRuns('');
    setStopMetric('');
    // The options worth seeing again are open when the run had them.
    setMore(!!f && !!(f.seed !== undefined || f.onCall?.on || f.metricsFile || f.notify?.when || f.hours));
  }, [open, from, asSweep, defaultCwd]);

  const place = where.startsWith('c:') ? clusters.find((c) => `c:${c.id}` === where) : null;
  const local = where === 'local';
  const nGpus = Number(gpus) || 0;
  const combos = useMemo(() => {
    const filled = params.filter((p) => p.name.trim() && readValues(p.values).length);
    if (!filled.length) return 0;
    const total = filled.reduce((a, p) => a * readValues(p.values).length, 1);
    return sampling === 'random' && Number(maxRuns) > 0 ? Math.min(total, Number(maxRuns)) : total;
  }, [params, sampling, maxRuns]);

  const body = (): Record<string, unknown> => {
    const b: Record<string, unknown> = { command: command.trim(), cwd: cwd.trim(), where, gpus: nGpus };
    if (nGpus && mem) b.gpuMemGb = Number(mem);
    if (name.trim() && mode === 'one') b.name = name.trim();
    if (group.trim()) b.group = group.trim();
    const s = readSettings(settings);
    if (mode === 'one' && Object.keys(s).length) b.params = s;
    if (seed.trim()) b.seed = Number(seed);
    if (priority.trim()) b.priority = Number(priority);
    if (metricsFile.trim()) b.metricsFile = metricsFile.trim();
    if (scoresFile.trim()) b.scoresFile = scoresFile.trim();
    if (hours.trim()) b.hours = Number(hours);
    if (place?.kind === 'slurm') {
      if (cpus.trim()) b.cpus = Number(cpus);
      if (memGb.trim()) b.memGb = Number(memGb);
      if (partition.trim()) b.partition = partition.trim();
    }
    b.notify = { done: tellDone, failed: tellFailed, ...(when.on && when.metric.trim() && when.value.trim() ? { when: { metric: when.metric.trim(), op: when.op, value: Number(when.value) } } : {}) };
    if (onCall !== 'off') b.onCall = { on: true, act: onCall, watch, stallMinutes: Number(stall) || 30, ...(onCall === 'agent' && rules.trim() ? { rules: rules.trim() } : {}) };
    if (mode === 'sweep') {
      b.params = Object.fromEntries(params.filter((p) => p.name.trim()).map((p) => [p.name.trim(), readValues(p.values)]));
      b.mode = sampling;
      if (Number(maxRuns) > 0) b.maxRuns = Number(maxRuns);
      if (stopMetric.trim()) b.earlyStop = { metric: stopMetric.trim(), better: stopBetter };
    }
    return b;
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      if (local) localStorage.setItem(LAST_CWD, cwd.trim());
      if (mode === 'sweep') {
        const r = await post<{ sweep: { group: string } }>('/api/experiments/sweeps', body());
        onStarted({ group: r.sweep.group });
      } else if (from) {
        const r = await post<{ run: RunRecord }>(`/api/experiments/runs/${from.id}/again`, body());
        onStarted({ run: r.run });
      } else {
        const r = await post<{ run: RunRecord }>('/api/experiments/jobs', body());
        onStarted({ run: r.run });
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = command.trim() && (local ? cwd.trim() : true) && (mode === 'one' || (group.trim() && combos > 0));
  const title = from ? 'Run again' : mode === 'sweep' ? 'New sweep' : 'New run';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start} disabled={busy || !ready}>
            {busy ? 'Starting…' : mode === 'sweep' ? (combos ? `Start ${combos} runs` : 'Start') : 'Start'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5 text-[13px]">
        {!from && (
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'one', label: 'One run' },
              { value: 'sweep', label: 'A sweep' },
            ]}
          />
        )}
        <Field label="Command" hint={mode === 'sweep' ? <>Put {'{name}'} where each setting’s value goes: python train.py --lr {'{lr}'}</> : 'As you would type it in its folder. Metrics are read from what it prints: loss=0.42, or a JSON object on a line.'}>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            rows={2}
            autoFocus={!from}
            spellCheck={false}
            placeholder={mode === 'sweep' ? 'python train.py --lr {lr} --batch {batch}' : 'python train.py --lr 3e-4'}
            className={cx(inputCls, 'h-auto min-h-[64px] py-2 font-mono text-[12.5px] leading-relaxed')}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <span className="mb-1 block text-fg-2">{local ? 'Folder' : 'Folder there'}</span>
            {local ? (
              <FolderPicker value={cwd} onChange={setCwd} />
            ) : (
              <input value={cwd} onChange={(e) => setCwd(e.target.value)} spellCheck={false} placeholder="~/code/project" className={cx(inputCls, 'font-mono text-[12.5px]')} />
            )}
          </div>
          <Field label="Where it runs">
            <select value={where} onChange={(e) => setWhere(e.target.value)} className={cx(inputCls, 'pr-8 text-[13px]')}>
              <option value="local">This computer</option>
              {machines.map((m) => (
                <option key={m.id} value={`m:${m.id}`} translate="no">
                  {m.name}
                </option>
              ))}
              {clusters.map((c) => (
                <option key={c.id} value={`c:${c.id}`} translate="no">
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GPUs" hint={local && hasGpus === false ? 'This computer has no NVIDIA GPU: 0 runs it on the processor.' : undefined}>
            <input value={gpus} onChange={(e) => setGpus(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className={cx(inputCls, 'tnum')} />
          </Field>
          {nGpus > 0 && place?.kind !== 'slurm' ? (
            <Field label="Free memory each (GB)" hint={mem ? undefined : 'Empty: a GPU nobody uses.'}>
              <input value={mem} onChange={(e) => setMem(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="Any free GPU" className={cx(inputCls, 'tnum')} />
            </Field>
          ) : (
            <div />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {mode === 'one' && (
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Its script, unless you say" className={inputCls} />
            </Field>
          )}
          <Field label="Experiment" hint={mode === 'sweep' ? 'The sweep’s runs are kept and compared under it.' : undefined}>
            <input value={group} onChange={(e) => setGroup(e.target.value)} list="exp-groups" placeholder={mode === 'sweep' ? 'lr sweep' : 'Runs to compare together'} className={inputCls} />
            <datalist id="exp-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
        </div>

        {mode === 'sweep' && (
          <div className="space-y-2.5 rounded-xl border border-line p-3">
            <div className="text-fg-2">Settings and their values</div>
            {params.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={p.name} onChange={(e) => setParams(params.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="lr" spellCheck={false} className={cx(inputCls, 'w-28 shrink-0 font-mono text-[12.5px]')} />
                <input
                  value={p.values}
                  onChange={(e) => setParams(params.map((x, k) => (k === i ? { ...x, values: e.target.value } : x)))}
                  placeholder="0.001, 0.0003, 0.0001"
                  spellCheck={false}
                  className={cx(inputCls, 'min-w-0 flex-1 font-mono text-[12.5px]')}
                />
                <IconButton label="Remove this setting" size="sm" onClick={() => setParams(params.length > 1 ? params.filter((_, k) => k !== i) : [{ name: '', values: '' }])}>
                  <X size={14} />
                </IconButton>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setParams([...params, { name: '', values: '' }])}>
              Add a setting
            </Button>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Segmented
                size="sm"
                value={sampling}
                onChange={setSampling}
                options={[
                  { value: 'grid', label: 'Every combination' },
                  { value: 'random', label: 'A random sample' },
                ]}
              />
              {sampling === 'random' && (
                <label className="flex items-center gap-2 text-fg-2">
                  at most
                  <input value={maxRuns} onChange={(e) => setMaxRuns(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder="20" className={cx(inputCls, 'tnum h-8 w-16 text-[13px]')} />
                  runs
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-fg-2">Stop runs early on</span>
              <input value={stopMetric} onChange={(e) => setStopMetric(e.target.value)} placeholder="val_loss (optional)" spellCheck={false} className={cx(inputCls, 'h-8 w-44 font-mono text-[12.5px]')} />
              {stopMetric.trim() && (
                <Segmented
                  size="sm"
                  value={stopBetter}
                  onChange={setStopBetter}
                  options={[
                    { value: 'min', label: 'Lower is better' },
                    { value: 'max', label: 'Higher is better' },
                  ]}
                />
              )}
            </div>
            {stopMetric.trim() && <p className="leading-relaxed text-fg-3">A run whose {stopMetric.trim()} at a step is worse than the median of the other runs at that step is stopped.</p>}
          </div>
        )}

        <button type="button" onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-[13px] font-medium text-fg-2 hover:text-fg">
          More options <ChevronDown size={14} className={cx('transition-transform', more && 'rotate-180')} />
        </button>
        {more && (
          <div className="space-y-3.5">
            {mode === 'one' && (
              <Field label="Settings" hint="One per line, name=value. --name value in the command are read by themselves; {name} in the command takes the value.">
                <textarea value={settings} onChange={(e) => setSettings(e.target.value)} rows={2} spellCheck={false} placeholder="lr=3e-4" className={cx(inputCls, 'h-auto py-2 font-mono text-[12.5px]')} />
              </Field>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Seed">
                <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^\d-]/g, ''))} inputMode="numeric" className={cx(inputCls, 'tnum')} />
              </Field>
              <Field label="Priority">
                <input value={priority} onChange={(e) => setPriority(e.target.value.replace(/[^\d-]/g, ''))} inputMode="numeric" placeholder="0" className={cx(inputCls, 'tnum')} />
              </Field>
              <Field label="Time limit (hours)">
                <input value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={cx(inputCls, 'tnum')} />
              </Field>
            </div>
            {place?.kind === 'slurm' && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Processors">
                  <input value={cpus} onChange={(e) => setCpus(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={cx(inputCls, 'tnum')} />
                </Field>
                <Field label="Memory (GB)">
                  <input value={memGb} onChange={(e) => setMemGb(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={cx(inputCls, 'tnum')} />
                </Field>
                <Field label="Partition">
                  <input value={partition} onChange={(e) => setPartition(e.target.value)} placeholder={place.partition ?? ''} spellCheck={false} className={cx(inputCls, 'font-mono text-[12.5px]')} />
                </Field>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Metrics file" hint="JSON lines it writes, besides what it prints.">
                <input value={metricsFile} onChange={(e) => setMetricsFile(e.target.value)} spellCheck={false} placeholder="metrics.jsonl" className={cx(inputCls, 'font-mono text-[12.5px]')} />
              </Field>
              <Field label="Per-example scores" hint="For paired tests in results tables: JSON lines with an id.">
                <input value={scoresFile} onChange={(e) => setScoresFile(e.target.value)} spellCheck={false} placeholder="scores.jsonl" className={cx(inputCls, 'font-mono text-[12.5px]')} />
              </Field>
            </div>
            <div>
              <span className="mb-1.5 block text-fg-2">Tell me</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={tellDone} onChange={(e) => setTellDone(e.target.checked)} className="accent-[var(--accent)]" />
                  When it is done
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={tellFailed} onChange={(e) => setTellFailed(e.target.checked)} className="accent-[var(--accent)]" />
                  When it fails
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={when.on} onChange={(e) => setWhen({ ...when, on: e.target.checked })} className="accent-[var(--accent)]" />
                  When a metric crosses a value
                </label>
              </div>
              {when.on && (
                <div className="mt-2 flex items-center gap-2">
                  <input value={when.metric} onChange={(e) => setWhen({ ...when, metric: e.target.value })} placeholder="val_acc" spellCheck={false} className={cx(inputCls, 'h-8 w-36 font-mono text-[12.5px]')} />
                  <select value={when.op} onChange={(e) => setWhen({ ...when, op: e.target.value as typeof when.op })} className={cx(inputCls, 'h-8 w-16 text-[13px]')}>
                    {['>', '>=', '<', '<='].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <input value={when.value} onChange={(e) => setWhen({ ...when, value: e.target.value.replace(/[^\d.eE+-]/g, '') })} inputMode="decimal" placeholder="0.9" className={cx(inputCls, 'tnum h-8 w-24')} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <span className="block text-fg-2">Agent on call</span>
              <Segmented
                size="sm"
                value={onCall}
                onChange={setOnCall}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'tell', label: 'Tell me' },
                  { value: 'agent', label: 'An agent looks into it' },
                ]}
              />
              {onCall !== 'off' && (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {WATCH.map((w) => (
                      <label key={w.id} className="flex items-center gap-2">
                        <input type="checkbox" checked={watch.includes(w.id)} onChange={(e) => setWatch(e.target.checked ? [...watch, w.id] : watch.filter((x) => x !== w.id))} className="accent-[var(--accent)]" />
                        {w.label}
                      </label>
                    ))}
                  </div>
                  {watch.includes('stall') && (
                    <label className="flex items-center gap-2 text-fg-2">
                      A stall is no new output for
                      <input value={stall} onChange={(e) => setStall(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" className={cx(inputCls, 'tnum h-8 w-16 text-[13px]')} />
                      minutes
                    </label>
                  )}
                  {onCall === 'agent' && (
                    <Field label="What the agent may do" hint="It starts in the run’s folder with what happened, the end of the log and the run’s record; then it tells you what it did.">
                      <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={3} placeholder={DEFAULT_RULES} className={cx(inputCls, 'h-auto py-2 text-[12.5px] leading-relaxed')} />
                    </Field>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        {error && <p className="rounded-lg bg-err/10 px-3 py-2 leading-relaxed text-err">{error}</p>}
      </div>
    </Dialog>
  );
}

