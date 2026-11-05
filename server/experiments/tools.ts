// The tools agents get for Experiments, in sessions and as apps' steps: start a run or a sweep, list and read runs,
// stop one, make a results table, and (steps only) wait for runs to end. They answer in JSON, the shapes the plan
// gives (docs/plans/research-and-engineering.md), so a step's later steps can use the values. In a session, starting
// or stopping runs asks the user first unless the session has full access (Plan mode refuses), or it is an agent
// on call, whose rules the user gave.
import crypto from 'node:crypto';
import { ACTIVE, type RunRecord, type RunStatus } from '../../shared/experiments.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import type { RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { modeOf } from '../guide/api.ts';
import { makeTable, runView, startSweep } from './api.ts';
import { cleanJob, onCallSession, placesLine, runAgain, stopRun, submit, waitRuns, whereWords } from './queue.ts';
import { getRun, getRunWithEvents, listRuns } from './records.ts';
import { connectedMachines } from './remote.ts';

const json = (v: unknown): string => JSON.stringify(v, null, 1);
const failed = (e: unknown): ToolOutput => ({ text: (e as Error)?.message ?? String(e), isError: true });

/** Sessions whose user allowed starting and stopping runs for the rest of the session (until the app restarts). */
const allowedHere = new Set<string>();

/** Whether this call may start or stop runs: null when it may, else why not. Asks the user with a card when it must. */
async function mayRun(ctx: RunCtx, title: string, detail: string): Promise<string | null> {
  if (ctx.step || allowedHere.has(ctx.key) || onCallSession(ctx.deps.db, ctx.key)) return null;
  const mode = modeOf(ctx);
  if (mode === 'read-only') return 'This session only reads (Plan mode, or read-only): tell the user what you would run instead, or ask them to switch the mode.';
  if (mode === 'full' || mode === 'custom-full') return null;
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return 'Nobody can allow it now (the session is not running in the app). Ask the user in your reply.';
  const card: ApprovalRequest = {
    id: `exp-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'command',
    title,
    detail,
    options: [
      { id: 'accept', label: 'Allow', style: 'primary' },
      { id: 'always', label: 'Allow for this session' },
      { id: 'deny', label: 'Don’t', style: 'default' },
    ],
    createdAt: Date.now(),
  };
  const limit = AbortSignal.timeout(570_000);
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit });
  if (!answer) return limit.aborted ? 'The user did not answer the card in time. Ask them in your reply whether to run it.' : 'The card was withdrawn before the user answered.';
  if (answer.decision !== 'accept' && answer.decision !== 'always') return `The user said no${answer.message?.trim() ? `: “${answer.message.trim()}”` : '.'} Nothing started.`;
  if (answer.decision === 'always') allowedHere.add(ctx.key);
  return null;
}

/** Who started a run, from a tool: the session (or the app's run a step belongs to). */
const startedBy = (ctx: RunCtx): RunRecord['startedBy'] => (ctx.step ? { app: ctx.runId.replace(/^flow-/, '') } : { session: ctx.key });

/** The agent of this session, as the agent on call's default ("claude", "codex", "acp:<id>"). */
const agentOf = (ctx: RunCtx) => (ctx.agent === 'acp' ? `acp:${ctx.acpAgent ?? 'console'}` : ctx.agent);

/** A run as the list gives it. */
const brief = (db: RunCtx['deps']['db'], r: RunRecord) => ({
  id: r.id,
  name: r.name,
  group: r.group,
  status: r.status,
  ...(r.why ? { why: r.why } : {}),
  where: whereWords(db, r),
  ...(r.params && Object.keys(r.params).length ? { params: r.params } : {}),
  ...(r.seed !== undefined ? { seed: r.seed } : {}),
  metrics: r.metrics ?? { last: {} },
  ...(r.startedAt ? { startedAt: r.startedAt } : {}),
  ...(r.endedAt ? { endedAt: r.endedAt } : {}),
});

const JOB_PROPS = (ctx: RunCtx) => {
  const clusters = placesLine(ctx.deps.db);
  const machines = connectedMachines().map((m) => `"m:${m.id}" (${m.name})`);
  return {
    cwd: { type: 'string', description: 'The folder it runs in (default: yours). On a cluster or another machine: a folder there.' },
    name: { type: 'string', description: 'A short name for the run (default: its script).' },
    group: { type: 'string', description: 'The experiment it belongs to: runs of one experiment are listed and compared together.' },
    where: {
      type: 'string',
      description: `Where it runs: "local" (this computer, the default)${clusters ? `, a cluster: ${clusters}` : ''}${machines.length ? `, another machine: ${machines.join(', ')}` : ''}.`,
    },
    gpus: { type: 'number', description: 'GPUs it needs (0 for none; default 1 on a computer with GPUs, else 0). It waits until that many are free.' },
    gpuMemGb: { type: 'number', description: 'Free memory each GPU needs, in GB (default: a GPU that is almost all free).' },
    params: { type: 'object', description: 'Its settings, kept with the run and compared in tables ({ "lr": 0.0003 }); --name value pairs in the command are read too. {name} placeholders in the command are filled from them.' },
    seed: { type: 'number', description: 'Its seed (fills {seed} in the command; also read from --seed).' },
    tags: { type: 'array', items: { type: 'string' } },
    metricsFile: { type: 'string', description: 'A file it writes metrics to as JSON lines (relative to cwd). Metrics are also read from its output: key=value pairs and JSON objects on a line.' },
    scoresFile: { type: 'string', description: 'A file of per-example scores it writes (JSON lines with "id" and a number per metric, or trec_eval -q lines): kept with the run for paired significance tests over examples.' },
    hours: { type: 'number', description: 'A time limit: it is stopped after this many hours (on SLURM, its --time).' },
    priority: { type: 'number', description: 'Higher goes first in the queue (default 0).' },
    env: { type: 'object', description: 'Environment variables for it.' },
    better: { type: 'object', description: 'Which way is better for metrics whose name does not say: { "bleu": "max" } (losses, errors, perplexity… are lower-is-better by name).' },
    onCall: {
      type: 'object',
      description:
        'The agent on call: { on: true, act: "tell" (a notification) or "agent" (an agent session looks into it, acts within the rules, then tells the user), watch?: ["nan","oom","stall","crash","diverge"] (default all), stallMinutes?: 30, rules?: what the agent may do }.',
    },
    notify: { type: 'object', description: 'What to tell the user: { done?: true, failed?: true, when?: { metric, op: ">"|"<"|">="|"<=", value } } (done and failed are on unless set false).' },
    report: { type: 'boolean', description: 'When it ends, this session gets a message saying how it went, so you can go on from there.' },
    cpus: { type: 'number', description: 'SLURM: processors (--cpus-per-task).' },
    memGb: { type: 'number', description: 'SLURM: memory in GB (--mem).' },
    partition: { type: 'string', description: 'SLURM: the partition (default: the cluster’s).' },
  };
};

function runTool(ctx: RunCtx): RunTool {
  return {
    name: 'experiment_run',
    description:
      'Start a long job (training, an evaluation) in Experiments’ queue instead of running it in the foreground: it waits for free GPUs (or a place among the jobs without one), runs on its own (in tmux, so it outlives this session), and is recorded: the commit and a patch of changes not committed, its settings and seed, the environment, its log and the metrics it prints. Returns at once with the run’s id. Never start runs on the user’s GPUs unless they asked for it. With again: a run’s id, it runs that run again with the changes you give.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command, as you would type it in its folder.' },
        again: { type: 'string', description: 'A run’s id: start it again with its settings, changed by what else you give.' },
        ...JOB_PROPS(ctx),
      },
    },
    async run(a, ctx) {
      try {
        const db = ctx.deps.db;
        const onCall = a.onCall && typeof a.onCall === 'object' && !a.onCall.agent && !ctx.step ? { ...a.onCall, agent: agentOf(ctx) } : a.onCall;
        if (typeof a.again === 'string' && a.again.trim()) {
          const prev = getRun(db, a.again.trim());
          if (!prev) throw new HttpError(404, `There is no run ${a.again}`);
          const { again: _a, ...changes } = a;
          const no = await mayRun(ctx, `Run “${prev.name ?? prev.id}” again`, [changes.command ?? prev.command, `# in ${changes.cwd ?? prev.cwd} · ${whereWords(db, prev)}`].join('\n'));
          if (no) return failed(no);
          const r = await runAgain(ctx.deps, prev.id, { ...changes, ...(onCall ? { onCall } : {}) }, startedBy(ctx));
          return json({ id: r.id, status: r.status, ...(r.why ? { why: r.why } : {}), name: r.name, page: `/system/experiments/${r.id}` });
        }
        const spec = await cleanJob(db, { ...a, ...(onCall ? { onCall } : {}) }, { cwd: ctx.cwd });
        const no = await mayRun(
          ctx,
          `Run a job${spec.gpus ? ` on ${spec.gpus} GPU${spec.gpus === 1 ? '' : 's'}` : ''}`,
          [spec.command, `# in ${spec.cwd}${spec.where && spec.where !== 'local' ? ` · ${spec.where}` : ''}${spec.group ? ` · experiment ${spec.group}` : ''}`].join('\n'),
        );
        if (no) return failed(no);
        const r = await submit(ctx.deps, spec, { startedBy: startedBy(ctx) });
        return json({ id: r.id, status: r.status, ...(r.why ? { why: r.why } : {}), name: r.name, page: `/system/experiments/${r.id}` });
      } catch (e) {
        return failed(e);
      }
    },
  };
}

function sweepTool(ctx: RunCtx): RunTool {
  const props = JOB_PROPS(ctx);
  return {
    name: 'experiment_sweep',
    description:
      'Start a sweep: one command with a {name} placeholder for each setting, and values for each, expanded into runs of one experiment (every combination, or a random sample with mode "random"), queued like experiment_run’s. With earlyStop, a run whose metric at a step is worse than the median of the other runs at that step is stopped. The user hears once, when the whole sweep has ended. Never start runs on the user’s GPUs unless they asked for it.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command with placeholders: python train.py --lr {lr} --batch {batch}' },
        params: { type: 'object', description: 'Each setting with its values: { "lr": [0.001, 0.0003], "batch": [32, 64] }' },
        mode: { type: 'string', enum: ['grid', 'random'], description: 'grid (default): every combination; random: a random sample of them, maxRuns at most.' },
        maxRuns: { type: 'number', description: 'At most this many runs (200 at most).' },
        group: { type: 'string', description: 'The experiment’s name: its runs are kept and compared under it.' },
        earlyStop: { type: 'object', description: '{ metric, better: "max"|"min", afterSteps? }: stop runs worse than the median of the others at the same step.' },
        cwd: props.cwd,
        where: props.where,
        gpus: props.gpus,
        gpuMemGb: props.gpuMemGb,
        seed: props.seed,
        tags: props.tags,
        metricsFile: props.metricsFile,
        scoresFile: props.scoresFile,
        hours: props.hours,
        priority: props.priority,
        env: props.env,
        onCall: props.onCall,
        notify: props.notify,
        report: { type: 'boolean', description: 'When the whole sweep has ended, this session gets a message saying how it went.' },
      },
      required: ['command', 'params', 'group'],
    },
    async run(a, ctx) {
      try {
        const n = Object.values((a.params ?? {}) as Record<string, unknown[]>).reduce<number>((x, v) => x * (Array.isArray(v) ? v.length : 1), 1);
        const no = await mayRun(ctx, `Start a sweep of ${a.mode === 'random' && a.maxRuns ? Math.min(n, Number(a.maxRuns)) : n} runs`, [String(a.command ?? ''), `# ${JSON.stringify(a.params ?? {})} · experiment ${a.group ?? ''}`].join('\n'));
        if (no) return failed(no);
        const onCall = a.onCall && typeof a.onCall === 'object' && !a.onCall.agent && !ctx.step ? { ...a.onCall, agent: agentOf(ctx) } : a.onCall;
        const s = await startSweep(ctx.deps, { ...a, ...(onCall ? { onCall } : {}) }, { cwd: ctx.cwd, startedBy: startedBy(ctx) });
        return json({ sweep: s.sweep.id, group: s.sweep.group, runs: s.runs.map((r) => r.id), page: `/system/experiments?sweep=${s.sweep.id}` });
      } catch (e) {
        return failed(e);
      }
    },
  };
}

const LIST: RunTool = {
  name: 'experiment_list',
  annotations: { readOnlyHint: true },
  description: 'List runs of Experiments, newest first: their id, name, experiment (group), status (and why it waits or failed), where, settings, seed, metrics ({ last, best, step }) and when they started and ended.',
  inputSchema: {
    type: 'object',
    properties: {
      group: { type: 'string', description: 'One experiment’s runs.' },
      tag: { type: 'string' },
      status: { type: 'string', description: 'Comma-separated: queued, waiting, running, done, failed, stopped, lost; or "active" for those not ended.' },
      cwd: { type: 'string', description: 'Runs started in this folder or under it.' },
      limit: { type: 'number', description: 'At most this many (default 30, at most 500).' },
    },
  },
  async run(a, ctx) {
    const st = String(a.status ?? '').trim();
    const status = st === 'active' ? ACTIVE : st ? (st.split(/[\s,]+/).filter(Boolean) as RunStatus[]) : undefined;
    const runs = listRuns(ctx.deps.db, { group: a.group ? String(a.group) : undefined, tag: a.tag ? String(a.tag) : undefined, status, cwd: a.cwd ? String(a.cwd) : undefined, limit: Math.min(Math.max(Number(a.limit) || 30, 1), 500) });
    return json({ runs: runs.map((r) => brief(ctx.deps.db, r)) });
  },
};

const GET: RunTool = {
  name: 'experiment_get',
  annotations: { readOnlyHint: true },
  description: 'Read one run of Experiments: its whole record (command, folder, where, GPUs, commit, branch, changes, settings, seed, environment, metrics, exit code, its events: what the agent on call saw and did) and the end of its log.',
  inputSchema: { type: 'object', properties: { id: { type: 'string' }, lines: { type: 'number', description: 'Lines of the log’s end (default 100, at most 2000).' } }, required: ['id'] },
  async run(a, ctx) {
    try {
      const v = await runView(ctx.deps, String(a.id ?? '').trim(), Math.min(Math.max(Number(a.lines) || 100, 0), 2000));
      return json({ run: { ...v.run, where: whereWords(ctx.deps.db, v.run) }, log: v.log });
    } catch (e) {
      return failed(e);
    }
  },
};

const STOP: RunTool = {
  name: 'experiment_stop',
  description: 'Stop a run of Experiments: one in line goes at once; one running gets Ctrl-C (then TERM and KILL if it does not end) and ends as stopped. Its record and log stay.',
  inputSchema: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string', description: 'Why, in a few words, kept with the run.' } }, required: ['id'] },
  async run(a, ctx) {
    try {
      const r = getRun(ctx.deps.db, String(a.id ?? '').trim());
      if (!r) throw new HttpError(404, `There is no run ${a.id}`);
      if (!ACTIVE.includes(r.status)) return json({ id: r.id, status: r.status, note: 'It had ended already.' });
      // A run this session started is its own to stop.
      if (r.startedBy?.session !== ctx.key) {
        const no = await mayRun(ctx, `Stop the run “${r.name ?? r.id}”`, `${r.command}\n# ${r.status} · ${whereWords(ctx.deps.db, r)}`);
        if (no) return failed(no);
      }
      const why = typeof a.why === 'string' && a.why.trim() ? `Stopped by an agent: ${a.why.trim().slice(0, 200)}` : 'Stopped by an agent';
      const s = await stopRun(ctx.deps, r.id, why);
      return json({ id: s.id, status: s.status, ...(s.stopping ? { note: 'It is stopping: it ends in a few seconds.' } : {}) });
    } catch (e) {
      return failed(e);
    }
  },
};

const TABLE: RunTool = {
  name: 'experiment_table',
  description:
    'Make a results table from runs of Experiments: a row per experiment (group) or per value of a setting ("param:lr"), the runs of a row averaged over seeds (mean ± std), the best of each column in bold, each row tested against the baseline (paired over examples when the runs kept per-example scores, else paired over seeds when they share seeds, else Welch’s t-test; Holm-corrected), † on significant cells. Returns it as LaTeX (booktabs, with a “% hydor:table <id>” line that lets the numbers be checked again later: keep it), Markdown and CSV.',
  inputSchema: {
    type: 'object',
    properties: {
      runs: { type: 'array', items: { type: 'string' }, description: 'The runs’ ids.' },
      group: { type: 'string', description: 'Or an experiment: every finished run of it.' },
      rows: { type: 'string', description: '"group" (default) or "param:<name>".' },
      columns: { type: 'array', items: { type: 'object' }, description: '[{ metric, better: "max"|"min", label?, digits?, value?: "last"|"best", scale?: 100 for a percentage }]' },
      baseline: { type: 'string', description: 'The row the others are tested against (its group or the setting’s value; default the first row).' },
      test: { type: 'string', enum: ['welch', 'paired', 'bootstrap', 'none'], description: 'Leave it out to pick the fitting one.' },
      alpha: { type: 'number', description: 'The level (default 0.05).' },
      correction: { type: 'string', enum: ['holm', 'none'] },
      caption: { type: 'string' },
      labels: { type: 'object', description: 'Names for rows by their key: { "lora-r16": "Ours" }.' },
    },
    required: ['columns'],
  },
  async run(a, ctx) {
    try {
      const t = makeTable(ctx.deps, a);
      return json({ ...t, page: `/system/experiments?table=${t.id}` });
    } catch (e) {
      return failed(e);
    }
  },
};

const WAIT: RunTool = {
  name: 'experiment_wait',
  annotations: { readOnlyHint: true },
  description:
    'Wait until runs of Experiments have all ended (by their ids, an experiment or a tag), or the hours run out, then give their records: { ended, runs }. For an app’s steps (a run that waits for its training to end); it holds nothing while it waits, and after a restart it waits only for what is left.',
  inputSchema: {
    type: 'object',
    properties: {
      ids: { type: 'array', items: { type: 'string' } },
      group: { type: 'string' },
      tag: { type: 'string' },
      hours: { type: 'number', description: 'Give up after this many hours (default 24, at most 168).' },
    },
  },
  async run(a, ctx) {
    const ids = Array.isArray(a.ids) ? a.ids.map(String) : typeof a.ids === 'string' ? a.ids.split(/[\s,]+/).filter(Boolean) : undefined;
    if (!ids?.length && !a.group && !a.tag) return failed('Say which runs: ids, a group or a tag.');
    const hours = Math.min(Math.max(Number(a.hours) || 24, 0.01), 168);
    const key = `${ctx.runId}:${crypto
      .createHash('sha1')
      .update(JSON.stringify([ids ?? null, a.group ?? null, a.tag ?? null]))
      .digest('hex')
      .slice(0, 16)}`;
    const w = await waitRuns(ctx.deps, { ids, group: a.group ? String(a.group) : undefined, tag: a.tag ? String(a.tag) : undefined }, { hours, key, signal: ctx.signal });
    return json({ ended: w.ended, ...(w.ended ? {} : { note: `Not all had ended after ${hours} h.` }), runs: w.runs.map((r) => ({ ...brief(ctx.deps.db, r), events: getRunWithEvents(ctx.deps.db, r.id)?.events?.slice(-5) })) });
  },
};

export function experimentTools(ctx: RunCtx): RunTool[] {
  return [runTool(ctx), sweepTool(ctx), LIST, GET, STOP, TABLE, ...(ctx.step ? [WAIT] : [])];
}

export const SPAWN_NOTE =
  'Experiments (System → Experiments in the app): long training or evaluation goes to experiment_run (many settings: experiment_sweep) instead of running in the foreground: it waits for free GPUs, runs on its own and is recorded. Read runs with experiment_list and experiment_get; make results tables (mean ± std over seeds, significance, LaTeX) with experiment_table. Never start runs on the user’s GPUs unless they asked you to.';
