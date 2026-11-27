// New run: the command, its folder, the GPUs it needs and the free memory each, where it runs, a name and an
// experiment; More options folds the rest (hyperparameters, seed, priority, a metrics file, what to tell you, the agent on
// call and its rules, a cluster's needs). As a sweep: the command with {name} placeholders and values for each
// hyperparameter, every combination or a random sample, and an early stop. Run again opens it filled in. Start says
// whether it goes when a GPU is free or waits for tonight (always the former when the dialog opens). Try it first
// (on this computer) runs the command for 90 seconds and says whether it runs, what memory it used and how long the
// whole run should take; Use these fills them in. A run keeps the code as it is when it is queued: Run again of a run
// whose folder has changed since asks which code, its own (picked) or the folder's now; Run again of a run cut short
// that says how to carry on asks which too, from its checkpoint or over (carrying on always runs its own code).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { GRACE, isTrialRun, TRY_SECONDS, type ClusterSpec, type ExperimentsSettings, type RunRecord, type TrialAnswer, type WatchKind } from '@shared/experiments';
import type { MachineView } from '@shared/types';
import { api, post } from '../../lib/api';
import { machineId } from '../../lib/machine';
import { useApp } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { FolderPicker } from '../../components/FolderPicker';
import { Button, cx, Dialog, IconButton, inputCls, Segmented, Switch, Throbber } from '../../components/ui';
import { loadSettings } from './api';
import { StartChoice, type StartAt } from './StartChoice';
import { fill, trialLines } from './tryWords';

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

/** A box as tall as its text, from two lines to eight, then it scrolls (the two ends are its classes, in lines). */
function Lines({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    // The border is not part of scrollHeight.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [props.value]);
  // 18px: the padding above and below, and the border.
  return <textarea ref={ref} rows={2} spellCheck={false} {...props} className={cx(inputCls, 'h-auto max-h-[calc(8lh+18px)] min-h-[calc(2lh+18px)] py-2 font-mono text-[12.5px] leading-relaxed', className)} />;
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
  /** The experiment the run goes in (fills the Experiment field when it opens without `from`). */
  group?: string;
  onStarted: (r: { run?: RunRecord; group?: string }) => void;
}

export function NewRun({ open, onClose, from, sweep: asSweep, group: inGroup, onStarted }: NewRunProps) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const defaultCwd = useApp((s) => s.boot?.defaultCwd) ?? home;
  const [mode, setMode] = useState<'one' | 'sweep'>('one');
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('');
  const [where, setWhere] = useState('local');
  const [gpus, setGpus] = useState('1');
  const [mem, setMem] = useState('');
  const [alone, setAlone] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [startAt, setStartAt] = useState<StartAt>('free');
  const [night, setNight] = useState<ExperimentsSettings | null>(null);
  const [more, setMore] = useState(false);
  const [settings, setSettings] = useState('');
  const [seed, setSeed] = useState('');
  const [priority, setPriority] = useState('');
  const [metricsFile, setMetricsFile] = useState('');
  const [scoresFile, setScoresFile] = useState('');
  const [hours, setHours] = useState('');
  const [resume, setResume] = useState('');
  const [grace, setGrace] = useState('');
  // Run again, of a run that was cut short and says how to carry on: from its checkpoint, or over.
  const [carryOn, setCarryOn] = useState(false);
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
  // Try it first: the trial going or answered, and what it was of (an answer of another command is not shown).
  const [trial, setTrial] = useState<{ of: string; answer?: TrialAnswer; error?: string; starting?: boolean } | null>(null);
  const [peak, setPeak] = useState<number | null>(null);
  // Run again: whether the folder differs from the run's own code (and its own can be put back), and which was picked.
  const [ownCode, setOwnCode] = useState<{ of: string; differs: boolean; own: boolean } | null>(null);
  const [code, setCode] = useState<'own' | 'now'>('own');
  // Whether the folder is in git, so that a run queued now keeps its code.
  const [inGit, setInGit] = useState<{ cwd: string; git: boolean } | null>(null);
  const trialBox = useRef<HTMLDivElement>(null);
  /** The trial still going, to stop it when the window closes. */
  const going = useRef<string | null>(null);
  const shown = useRef(open);
  shown.current = open;

  // Filled in as it opens: from the run it runs again, else the folder used last.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setStartAt('free');
    setTrial(null);
    setCode('own');
    setOwnCode(null);
    if (from && !from.machine && !from.remote)
      api<{ differs: boolean; own: boolean }>(`/api/experiments/runs/${from.id}/code`)
        .then((r) => setOwnCode({ of: from.id, ...r }))
        .catch(() => {});
    loadSettings()
      .then(setNight)
      .catch(() => setNight(null));
    setMode(asSweep ? 'sweep' : 'one');
    // The machines of Settings → Machines are this computer's: on another machine's pages, its runs go there or to its clusters.
    if (machineId) setMachines([]);
    else
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
    setAlone(!!f?.alone);
    // A trial run again is the real run: not named as a trial, and told of as usual.
    const was = f && isTrialRun(f) ? undefined : f;
    setName(was?.name ?? '');
    setGroup(f ? (f.group ?? '') : (inGroup ?? ''));
    setSettings(settingsText(f?.params));
    setSeed(f?.seed !== undefined ? String(f.seed) : '');
    setPriority(f?.priority ? String(f.priority) : '');
    setMetricsFile(f?.metricsFile ?? '');
    setScoresFile(f?.scoresFile ?? '');
    setHours(f?.hours ? String(f.hours) : '');
    setResume(f?.resume ?? '');
    setGrace(f?.grace ? String(f.grace) : '');
    // A stopped (or lost) run was cut short: it carries on unless you say. A failed one starts over unless you say.
    setCarryOn(!!f?.resume && (f.status === 'stopped' || f.status === 'lost'));
    setCpus(f?.cpus ? String(f.cpus) : '');
    setMemGb(f?.memGb ? String(f.memGb) : '');
    setPartition(f?.partition ?? '');
    setTellDone(was?.notify?.done !== false);
    setTellFailed(was?.notify?.failed !== false);
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
    setMore(!!f && !!(f.seed !== undefined || f.onCall?.on || f.metricsFile || f.notify?.when || f.hours || f.alone || f.resume || f.grace));
  }, [open, from, asSweep, inGroup, defaultCwd]);

  const place = where.startsWith('c:') ? clusters.find((c) => `c:${c.id}` === where) : null;
  const local = where === 'local';
  const nGpus = Number(gpus) || 0;
  // Offered when the run it starts from was cut short and the field below still says how to carry on.
  const canCarry = mode === 'one' && !!from?.resume && !!resume.trim() && (from.status === 'stopped' || from.status === 'failed' || from.status === 'lost');
  const carrying = canCarry && carryOn;
  const combos = useMemo(() => {
    const filled = params.filter((p) => p.name.trim() && readValues(p.values).length);
    if (!filled.length) return 0;
    const total = filled.reduce((a, p) => a * readValues(p.values).length, 1);
    return sampling === 'random' && Number(maxRuns) > 0 ? Math.min(total, Number(maxRuns)) : total;
  }, [params, sampling, maxRuns]);

  // Its own code goes with its own folder on this computer.
  const askCode = !!from && ownCode?.of === from.id && ownCode.differs && ownCode.own && local && cwd.trim() === from.cwd;
  const runsOwn = carrying || (askCode && code === 'own');
  useEffect(() => {
    if (!open || startAt !== 'night' || !local || !cwd.trim()) return;
    let live = true;
    const t = window.setTimeout(() => {
      api<{ git: boolean }>(`/api/experiments/code?cwd=${encodeURIComponent(cwd.trim())}`)
        .then((r) => live && setInGit({ cwd: cwd.trim(), git: r.git }))
        .catch(() => {});
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, startAt, local, cwd]);
  const keepsNow = startAt === 'night' && local && !runsOwn && from?.code !== 'now' && inGit?.cwd === cwd.trim() && inGit.git;

  const body = (): Record<string, unknown> => {
    // Always said, so a night run run again starts now unless Tonight is picked. A cluster has its own queue.
    const b: Record<string, unknown> = { command: command.trim(), cwd: cwd.trim(), where, gpus: nGpus, when: startAt === 'night' && !where.startsWith('c:') ? 'night' : 'now' };
    if (nGpus && mem) b.gpuMemGb = Number(mem);
    // Always said, so a run run again can give up the GPU it had to itself.
    b.alone = alone && nGpus > 0 && !where.startsWith('c:');
    if (name.trim() && mode === 'one') b.name = name.trim();
    if (group.trim()) b.group = group.trim();
    const s = readSettings(settings);
    if (mode === 'one' && Object.keys(s).length) b.params = s;
    if (seed.trim()) b.seed = Number(seed);
    if (priority.trim()) b.priority = Number(priority);
    if (metricsFile.trim()) b.metricsFile = metricsFile.trim();
    if (scoresFile.trim()) b.scoresFile = scoresFile.trim();
    if (hours.trim()) b.hours = Number(hours);
    // Always said, so a run run again can drop them.
    b.resume = resume.trim();
    b.grace = grace.trim() ? Number(grace) : '';
    if (carrying) {
      b.carryOn = true;
      if (from?.machine) b.continues = from.id;
    }
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

  // What it is asked of: the command, its folder and what fills it.
  const trying = JSON.stringify([command.trim(), cwd.trim(), mode, nGpus, mode === 'sweep' ? params : settings, seed.trim()]);
  const canTry = local && !from?.machine;
  const answer = trial?.answer;
  const trialGoing = !!trial?.starting || (!!answer && !answer.over);
  going.current = answer && !answer.over ? answer.id : null;

  const stopRunning = (id: string) => void post(`/api/experiments/runs/${id}/stop`, {}).catch(() => {});
  const tryIt = async () => {
    setError(null);
    setTrial({ of: trying, starting: true });
    // A sweep tries its first combination.
    const values =
      mode === 'sweep' ? Object.fromEntries(params.filter((p) => p.name.trim() && readValues(p.values).length).map((p) => [p.name.trim(), readValues(p.values)[0]])) : readSettings(settings);
    try {
      const r = await post<{ trial: TrialAnswer }>('/api/experiments/try', {
        command: command.trim(),
        cwd: cwd.trim(),
        gpus: nGpus,
        ...(nGpus && mem ? { gpuMemGb: Number(mem) } : {}),
        ...(seed.trim() ? { seed: Number(seed) } : {}),
        ...(Object.keys(values).length ? { params: values } : {}),
        ...(from?.env ? { env: from.env } : {}),
      });
      if (!shown.current) return stopRunning(r.trial.id);
      setTrial({ of: trying, answer: r.trial });
    } catch (e) {
      setTrial({ of: trying, error: (e as Error).message });
    }
  };
  // The trial is looked at every two seconds while it goes.
  const watching = answer && !answer.over ? answer.id : null;
  useEffect(() => {
    if (!watching) return;
    const t = window.setInterval(() => {
      api<{ trial: TrialAnswer }>(`/api/experiments/try/${watching}`)
        .then((r) => setTrial((x) => (x?.answer?.id === watching ? { ...x, answer: r.trial } : x)))
        .catch((e) => setTrial((x) => (x?.answer?.id === watching ? { of: x.of, error: (e as Error).message } : x)));
    }, 2000);
    return () => window.clearInterval(t);
  }, [watching]);
  // Closing the window stops a trial still going.
  useEffect(() => {
    if (!open && going.current) {
      stopRunning(going.current);
      setTrial(null);
    }
  }, [open]);
  useEffect(() => () => void (going.current && stopRunning(going.current)), []);
  useEffect(() => {
    if (trial) trialBox.current?.scrollIntoView({ block: 'nearest' });
  }, [!!trial, answer?.over]); // eslint-disable-line react-hooks/exhaustive-deps

  // What this command held last time, offered in "Free memory each".
  useEffect(() => {
    setPeak(null);
    if (!open || !canTry || !nGpus || !command.trim() || !cwd.trim()) return;
    let live = true;
    const t = window.setTimeout(() => {
      api<{ peakGb?: number }>(`/api/experiments/last-peak?command=${encodeURIComponent(command.trim())}&cwd=${encodeURIComponent(cwd.trim())}`)
        .then((r) => live && setPeak(r.peakGb ?? null))
        .catch(() => {});
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, canTry, nGpus, command, cwd]);

  const useThese = () => {
    if (answer?.ask?.gpuMemGb) setMem(String(answer.ask.gpuMemGb));
    if (answer?.ask?.hours) {
      setHours(String(answer.ask.hours));
      setMore(true);
    }
  };

  const start = async () => {
    // A trial still going holds a GPU the run may need.
    if (going.current) stopRunning(going.current);
    setBusy(true);
    setError(null);
    try {
      if (local) localStorage.setItem(LAST_CWD, cwd.trim());
      if (mode === 'sweep') {
        const r = await post<{ sweep: { group: string } }>('/api/experiments/sweeps', body());
        onStarted({ group: r.sweep.group });
      } else if (from && !from.machine) {
        const r = await post<{ run: RunRecord }>(`/api/experiments/runs/${from.id}/again`, { ...body(), ...(askCode && !carrying ? { code } : {}) });
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
          {canTry && (
            <Button variant="ghost" onClick={tryIt} disabled={busy || trialGoing || !command.trim() || !cwd.trim() || (mode === 'sweep' && !combos)}>
              Try it first
            </Button>
          )}
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
        <Field
          label="Command"
          hint={
            mode === 'sweep' ? (
              // Keep technical placeholders in one complete translatable sentence.
              'Put {name} where each hyperparameter’s value goes: python train.py --lr {lr}'
            ) : (
              'As you would type it in its folder. Metrics are read from what it prints: loss=0.42, or a JSON object on a line.'
            )
          }
        >
          <Lines value={command} onChange={(e) => setCommand(e.target.value)} autoFocus={!from} placeholder={mode === 'sweep' ? 'python train.py --lr {lr} --batch {batch}' : 'python train.py --lr 3e-4'} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <span className="mb-1 block text-fg-2">{local ? 'Folder' : 'Folder there'}</span>
            {local ? <FolderPicker value={cwd} onChange={setCwd} /> : <input value={cwd} onChange={(e) => setCwd(e.target.value)} spellCheck={false} placeholder="~/code/project" className={cx(inputCls, 'font-mono text-[12.5px]')} />}
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
              <input value={mem} onChange={(e) => setMem(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={peak ? fill(tr('It peaked at {0} GB last time'), Math.round(peak * 10) / 10) : 'Any free GPU'} className={cx(inputCls, 'tnum')} />
            </Field>
          ) : (
            <div />
          )}
        </div>
        {where.startsWith('c:') ? (
          startAt === 'night' && <p className="leading-relaxed text-fg-3">A cluster has its own queue: its runs cannot wait for tonight.</p>
        ) : (
          <div>
            <StartChoice value={startAt} onChange={setStartAt} night={night} where={where} carries={!!resume.trim()} />
            {keepsNow && <p className="mt-1 text-[12px] leading-relaxed text-fg-3">It runs the code as it is now, even if the folder changes before tonight.</p>}
          </div>
        )}
        {canCarry && (
          <div>
            <span className="mb-1 block text-fg-2">Checkpoint</span>
            <Segmented
              size="sm"
              value={carryOn ? 'carry' : 'over'}
              onChange={(v) => setCarryOn(v === 'carry')}
              options={[
                { value: 'carry', label: 'Carry on from where it stopped' },
                { value: 'over', label: 'Start over' },
              ]}
            />
            {carrying && (
              <p className="mt-1 text-[12px] leading-relaxed break-words text-fg-3">
                <span>It runs the command to carry on:</span>{' '}
                <code translate="no" className="font-mono break-all">
                  {resume.trim()}
                </code>
              </p>
            )}
            {/* Carrying on runs the code the run ran, so there is no choice of code to make. */}
            {carrying && ownCode?.of === from?.id && ownCode?.differs && (
              <p className="mt-1 text-[12px] leading-relaxed text-fg-3">
                {ownCode.own ? 'The folder has changed since: it still runs the code it ran with.' : 'Its own code cannot be put back, so it cannot carry on: start over.'}
              </p>
            )}
          </div>
        )}
        {askCode && !carrying && (
          <div>
            <span className="mb-1 block text-fg-2">Code</span>
            <Segmented
              size="sm"
              value={code}
              onChange={setCode}
              options={[
                { value: 'own', label: 'Its own code' },
                { value: 'now', label: 'The folder as it is now' },
              ]}
            />
          </div>
        )}
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
            <div className="text-fg-2">Hyperparameters and their values</div>
            {params.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={p.name}
                  onChange={(e) => setParams(params.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                  placeholder="lr"
                  spellCheck={false}
                  className={cx(inputCls.replace('w-full', ''), 'w-28 shrink-0 font-mono text-[12.5px]')}
                />
                <input
                  value={p.values}
                  onChange={(e) => setParams(params.map((x, k) => (k === i ? { ...x, values: e.target.value } : x)))}
                  placeholder="0.001, 0.0003, 0.0001"
                  spellCheck={false}
                  className={cx(inputCls, 'min-w-0 flex-1 font-mono text-[12.5px]')}
                />
                <IconButton label="Remove this hyperparameter" size="sm" onClick={() => setParams(params.length > 1 ? params.filter((_, k) => k !== i) : [{ name: '', values: '' }])}>
                  <X size={14} />
                </IconButton>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setParams([...params, { name: '', values: '' }])}>
              Add a hyperparameter
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
                  <input value={maxRuns} onChange={(e) => setMaxRuns(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder="20" className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-16 text-[13px]')} />
                  runs
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-fg-2">Stop runs early on</span>
              <input value={stopMetric} onChange={(e) => setStopMetric(e.target.value)} placeholder="val_loss (optional)" spellCheck={false} className={cx(inputCls.replace('w-full', ''), 'h-8 w-44 font-mono text-[12.5px]')} />
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
              <Field label="Hyperparameters" hint="One per line, name=value. --name value in the command are read by themselves; {name} in the command takes the value.">
                <Lines value={settings} onChange={(e) => setSettings(e.target.value)} placeholder="lr=3e-4" />
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
            <div className="space-y-2">
              <Field label="To carry on after a stop" hint="The command that goes on from its last checkpoint. Night runs and runs lost in a restart use it instead of starting over.">
                <textarea value={resume} onChange={(e) => setResume(e.target.value)} rows={2} spellCheck={false} placeholder="python train.py --resume outputs/last.pt" className={cx(inputCls, 'h-auto min-h-[64px] py-2 font-mono text-[12.5px] leading-relaxed')} />
              </Field>
              <label className="flex flex-wrap items-center gap-2 text-fg-2">
                Warn it this many seconds before a stop
                <input value={grace} onChange={(e) => setGrace(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder={String(GRACE.default)} className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-16 text-[13px]')} />
              </label>
            </div>
            {nGpus > 0 && !where.startsWith('c:') && (
              <div className="flex items-start gap-2.5">
                <Switch on={alone} onChange={setAlone} label="A GPU to itself" className="mt-px" />
                <div className="min-w-0">
                  <div className="text-fg-2">A GPU to itself</div>
                  <p className="leading-relaxed text-fg-3">No other run of yours goes on its GPUs while it runs.</p>
                </div>
              </div>
            )}
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
                  <input value={when.metric} onChange={(e) => setWhen({ ...when, metric: e.target.value })} placeholder="val_acc" spellCheck={false} className={cx(inputCls.replace('w-full', ''), 'h-8 w-36 font-mono text-[12.5px]')} />
                  <select value={when.op} onChange={(e) => setWhen({ ...when, op: e.target.value as typeof when.op })} className={cx(inputCls.replace('w-full', ''), 'h-8 w-16 text-[13px]')}>
                    {['>', '>=', '<', '<='].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <input value={when.value} onChange={(e) => setWhen({ ...when, value: e.target.value.replace(/[^\d.eE+-]/g, '') })} inputMode="decimal" placeholder="0.9" className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-24')} />
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
                      <input value={stall} onChange={(e) => setStall(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-16 text-[13px]')} />
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
        {trial && (trialGoing || trial.of === trying) && (
          <div ref={trialBox} aria-live="polite" className="rounded-xl border border-line bg-bg-1 px-3 py-2.5">
            {trialGoing ? (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Throbber />
                <span className="min-w-0 flex-1">
                  {answer && answer.status !== 'running' && answer.status !== 'starting' ? 'Waiting for its turn to try it…' : fill(tr('Trying it for {0} seconds…'), answer?.seconds ?? TRY_SECONDS.default)}
                </span>
                {answer && (
                  <Button size="sm" variant="ghost" onClick={() => stopRunning(answer.id)}>
                    Stop
                  </Button>
                )}
                {answer?.why && answer.status !== 'running' && <p className="basis-full leading-relaxed text-fg-3">{answer.why}</p>}
              </div>
            ) : trial.error ? (
              <p className="leading-relaxed text-err">{trial.error}</p>
            ) : answer ? (
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-[240px] space-y-1 leading-relaxed">
                  {trialLines(answer).map((l, i) => (
                    <p key={i} className={cx(answer.ok === false && 'text-err')}>
                      {l}
                    </p>
                  ))}
                  {answer.ok === false && (
                    <pre translate="no" className="max-h-40 overflow-auto rounded-lg bg-[var(--term-bg)] px-2.5 py-1.5 font-mono text-[11.5px] whitespace-pre-wrap text-[var(--term-fg)] [overflow-wrap:anywhere]">
                      {answer.firstError?.text ?? answer.why}
                    </pre>
                  )}
                </div>
                {answer.ask && (
                  <Button size="sm" variant="secondary" onClick={useThese}>
                    Use these
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        )}
        {error && <p className="rounded-lg bg-err/10 px-3 py-2 leading-relaxed text-err">{error}</p>}
      </div>
    </Dialog>
  );
}
