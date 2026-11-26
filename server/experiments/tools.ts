// The tools agents get for Experiments, in sessions and as apps' steps: start a run or a sweep, list and read runs,
// stop one, make a results table, and (steps only) wait for runs to end; read an evaluation, score it, and (sessions
// only) propose one, which the person seals or not, and start an evolution (Evolve) and read how it goes. They answer
// in JSON, the shapes the plan gives (docs/plans/research-and-engineering.md), so a step's later steps can use the
// values. In a session, starting or stopping runs asks the user first unless the session has full access (Plan mode
// refuses), or it is an agent on call, whose rules the user gave.
import crypto from 'node:crypto';
import path from 'node:path';
import type { EvalScore, EvalSpec, Evaluation } from '../../shared/evaluations.ts';
import { ACTIVE, type RunRecord, type RunStatus } from '../../shared/experiments.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { confirmChange, modeOf } from '../guide/api.ts';
import { makeTable, runView, startSweep } from './api.ts';
import { allowedFolder, ChangedError, check, cleanSpec, createEvaluation, evaluationsFor, getEvaluation, getScore, listed, listScores, measure, mustEvaluation, rootFor, startScore, waitScore } from './evaluations.ts';
import type { Candidate, Evolution } from '../../shared/evolve.ts';
import { candidateDetail, candidatesOf, checkEvolveSpec, EVOLVE, listEvolutions, mustEvolution, startEvolution } from './evolve.ts';
import { cleanJob, onCallSession, placesLine, runAgain, stopRun, submit, waitRuns, whereWords } from './queue.ts';
import { getRun, getRunWithEvents, isFinalRun, isScoringRun, listInfo, listRuns, saveInfo } from './records.ts';
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
  if (mode === 'full') return null;
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

/** A run as the list gives it (`titles`: the experiments' titles by group, for experiment_title). */
const brief = (db: RunCtx['deps']['db'], r: RunRecord, titles?: Map<string, string>) => ({
  id: r.id,
  name: r.name,
  group: r.group,
  ...(r.group && titles?.get(r.group) ? { experiment_title: titles.get(r.group) } : {}),
  status: r.status,
  ...(r.why ? { why: r.why } : {}),
  where: whereWords(db, r),
  ...(r.params && Object.keys(r.params).length ? { params: r.params } : {}),
  ...(r.seed !== undefined ? { seed: r.seed } : {}),
  metrics: r.metrics ?? { last: {} },
  ...(r.startedAt ? { startedAt: r.startedAt } : {}),
  ...(r.endedAt ? { endedAt: r.endedAt } : {}),
  ...sealChanged(r),
});

/** Marks a run that started when an evaluation's sealed files were not as sealed. */
const sealChanged = (r: RunRecord) => (r.sealed?.some((s) => !s.ok) ? { sealChanged: true } : {});

const FINAL_RUN = 'That run is a final test: only the person reads it.';

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
          if (isScoringRun(prev)) throw new HttpError(400, 'That run scored an evaluation: score it again with evaluation_score.');
          const { again: _a, ...changes } = a;
          const no = await mayRun(ctx, `Run “${prev.name ?? prev.id}” again`, [changes.command ?? prev.command, `# in ${changes.cwd ?? prev.cwd} · ${whereWords(db, prev)}`].join('\n'));
          if (no) return failed(no);
          const r = await runAgain(ctx.deps, prev.id, { ...changes, ...(onCall ? { onCall } : {}) }, startedBy(ctx));
          return json({ id: r.id, status: r.status, ...(r.why ? { why: r.why } : {}), name: r.name, page: `/experiments/${r.id}` });
        }
        const spec = await cleanJob(db, { ...a, ...(onCall ? { onCall } : {}) }, { cwd: ctx.cwd });
        const no = await mayRun(
          ctx,
          `Run a job${spec.gpus ? ` on ${spec.gpus} GPU${spec.gpus === 1 ? '' : 's'}` : ''}`,
          [spec.command, `# in ${spec.cwd}${spec.where && spec.where !== 'local' ? ` · ${spec.where}` : ''}${spec.group ? ` · experiment ${spec.group}` : ''}`].join('\n'),
        );
        if (no) return failed(no);
        const r = await submit(ctx.deps, spec, { startedBy: startedBy(ctx) });
        return json({ id: r.id, status: r.status, ...(r.why ? { why: r.why } : {}), name: r.name, page: `/experiments/${r.id}` });
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
        return json({ sweep: s.sweep.id, group: s.sweep.group, runs: s.runs.map((r) => r.id), page: `/experiments?sweep=${s.sweep.id}` });
      } catch (e) {
        return failed(e);
      }
    },
  };
}

const LIST: RunTool = {
  name: 'experiment_list',
  annotations: { readOnlyHint: true },
  description: 'List runs of Experiments, newest first: their id, name, experiment (group) and its title when it has one (experiment_title), status (and why it waits or failed), where, settings, seed, metrics ({ last, best, step, repeated: the metrics printed more than once, which have curves (the others it printed once: settings, results), progress?: { done, total } while a phase is under way }) and when they started and ended.',
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
    const titles = new Map([...listInfo(ctx.deps.db)].flatMap(([name, i]) => (i.title ? [[name, i.title] as const] : [])));
    return json({ runs: runs.filter((r) => !isFinalRun(r)).map((r) => brief(ctx.deps.db, r, titles)) });
  },
};

const DESCRIBE: RunTool = {
  name: 'experiment_describe',
  description:
    'Give an experiment (the group its runs share) a clear title, a short description (what it tests or compares, the model and data, the metrics that matter) and a category (one to three words naming the area or task, reusing one already in use when it fits), so people see at a glance what it is and find it by searching. Use it when you start the first runs of a new experiment, and again when what it tests changes. The fields you give replace the old ones (an empty string clears one); the ones you leave out stay. Returns the experiment’s info as JSON.',
  inputSchema: {
    type: 'object',
    properties: {
      group: { type: 'string', description: 'The experiment’s name: the group its runs carry.' },
      title: { type: 'string', description: 'At most 8 words or so (80 characters at most), plain and specific: what is trained or evaluated, on what, and what is varied. Keep a short code the runs use (E7, v2) in parentheses at the end.' },
      description: { type: 'string', description: 'One to three sentences (500 characters at most).' },
      category: { type: 'string', description: 'One to three words (40 characters at most): the area or task, like “Language modelling”.' },
    },
    required: ['group'],
  },
  async run(a, ctx) {
    const name = typeof a.group === 'string' ? a.group.trim().slice(0, 120) : '';
    if (!name) return failed('Which experiment: group (the name its runs carry).');
    const p: { title?: string; description?: string; category?: string } = {};
    for (const k of ['title', 'description', 'category'] as const) {
      if (a[k] === undefined || a[k] === null) continue;
      if (typeof a[k] !== 'string') return failed(`${k} is text.`);
      p[k] = a[k] as string;
    }
    if (!Object.keys(p).length) return failed('Give at least one of title, description and category.');
    try {
      const { runs: _runs, ...info } = saveInfo(ctx.deps.db, name, p, 'agent');
      ctx.deps.broadcast({ t: 'feature', id: 'experiments', data: { groups: [name] } });
      return json(info);
    } catch (e) {
      return failed(e);
    }
  },
};

const GET: RunTool = {
  name: 'experiment_get',
  annotations: { readOnlyHint: true },
  description: 'Read one run of Experiments: its whole record (command, folder, where, GPUs, commit, branch, changes, settings, seed, environment, metrics, exit code, its events: what the agent on call saw and did) and the end of its log.',
  inputSchema: { type: 'object', properties: { id: { type: 'string' }, lines: { type: 'number', description: 'Lines of the log’s end (default 100, at most 2000).' } }, required: ['id'] },
  async run(a, ctx) {
    try {
      const id = String(a.id ?? '').trim();
      const kept = getRun(ctx.deps.db, id);
      if (kept && isFinalRun(kept)) return failed(FINAL_RUN);
      const v = await runView(ctx.deps, id, Math.min(Math.max(Number(a.lines) || 100, 0), 2000));
      return json({ run: { ...v.run, where: whereWords(ctx.deps.db, v.run), ...sealChanged(v.run) }, log: v.log });
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
      if (isFinalRun(r)) return failed('That run is a final test: only the person stops it.');
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
      if (Array.isArray(a.runs) && a.runs.some((id) => typeof id === 'string' && isFinalRun(getRun(ctx.deps.db, id) ?? {}))) return failed('One of those runs is a final test: only the person reads it.');
      const t = makeTable(ctx.deps, a);
      return json({ ...t, page: `/experiments?table=${t.id}` });
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
    return json({ ended: w.ended, ...(w.ended ? {} : { note: `Not all had ended after ${hours} h.` }), runs: w.runs.filter((r) => !isFinalRun(r)).map((r) => ({ ...brief(ctx.deps.db, r), events: getRunWithEvents(ctx.deps.db, r.id)?.events?.slice(-5) })) });
  },
};

// ---- evaluations ---------------------------------------------------------------------------------------------

const evalPage = (evaluation: string, score?: string) => `/experiments?evaluation=${evaluation}${score ? `&score=${score}` : ''}`;

/** A score as the tools give it. */
const scoreBrief = (s: EvalScore) => ({
  id: s.id,
  kind: s.kind,
  status: s.status,
  ...(s.why ? { why: s.why } : {}),
  ...(s.printed ? { printed: s.printed } : {}),
  ...(s.failedRun ? { failedRun: s.failedRun } : {}),
  ...(s.status === 'done' ? { values: s.values, mean: s.mean, std: s.std } : {}),
  ...(s.against ? { against: s.against } : {}),
  folder: s.folder,
  ...(s.branch ? { branch: s.branch } : {}),
  ...(s.commit ? { commit: s.commit.slice(0, 12) } : {}),
  ...(s.dirty ? { dirty: true } : {}),
  when: new Date(s.endedAt ?? s.createdAt).toISOString(),
});

const folderArg = (a: Record<string, any>, ctx: RunCtx) => (typeof a.cwd === 'string' && a.cwd.trim() ? path.resolve(ctx.cwd, a.cwd.trim().replace(/^~(?=$|\/)/, config.home)) : undefined);

/** An evaluation as the tools give it, its files checked where `root` is; never a final test's values. */
async function evaluationBrief(ctx: RunCtx, ev: Evaluation, root: string) {
  const db = ctx.deps.db;
  const state = await check(db, ev, root, { absentOk: true });
  const { baselineScore: base } = listed(db, ev);
  return {
    id: ev.id,
    name: ev.name,
    folder: ev.cwd,
    command: ev.command,
    metric: ev.metric,
    better: ev.better,
    seeds: ev.seeds,
    protect: ev.protect,
    sealed: { ok: state.ok, folder: root, changed: state.changed.slice(0, 10), ...(state.changed.length > 10 || state.more ? { more: state.changed.length - Math.min(10, state.changed.length) + (state.more ?? 0) } : {}) },
    baseline: base ? { mean: base.mean, std: base.std, n: base.values.length, ...(base.commit ? { commit: base.commit.slice(0, 12) } : {}) } : null,
    scores: listScores(db, ev.id, ['score'], 5).map(scoreBrief),
    finalTest: { set: !!ev.final, runs: ev.finals },
    page: evalPage(ev.id),
  };
}

const EVAL_GET: RunTool = {
  name: 'evaluation_get',
  annotations: { readOnlyHint: true },
  description:
    'Read a project’s evaluations (Experiments → Evaluations): one scoring command and one number, sealed so every run is scored the same way. Gives, for the folder (yours unless cwd says another): each evaluation’s id, name, command, metric, which way is better, seeds, the files it protects, whether they are as sealed there (sealed: { ok, changed }), its baseline, its 5 latest scores (mean, std, against the baseline, folder, branch, when) and whether it has a final test (never that test’s numbers). With score, that score.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'The folder whose evaluations you ask for (default: yours).' },
      id: { type: 'string', description: 'One evaluation.' },
      score: { type: 'string', description: 'One score’s id (as evaluation_score gave it).' },
    },
  },
  async run(a, ctx) {
    try {
      const db = ctx.deps.db;
      if (typeof a.score === 'string' && a.score.trim()) {
        const s = getScore(db, a.score.trim());
        if (!s) return failed(`There is no score ${a.score}.`);
        if (s.kind === 'final') return failed('That score is a final test: only the person reads it.');
        return json({ evaluation: s.evaluation, ...scoreBrief(s), seeds: s.seeds, runs: s.runs, ...(s.lent ? { lent: s.lent } : {}), page: evalPage(s.evaluation, s.id) });
      }
      const folder = folderArg(a, ctx) ?? ctx.cwd;
      let found: { evaluation: Evaluation; root: string }[];
      if (typeof a.id === 'string' && a.id.trim()) {
        const evaluation = mustEvaluation(db, a.id.trim());
        found = [{ evaluation, root: (await rootFor(evaluation, folder)) ?? evaluation.cwd }];
      } else found = await evaluationsFor(db, folder, { below: true });
      const evaluations = [];
      for (const x of found.slice(0, 10)) evaluations.push(await evaluationBrief(ctx, x.evaluation, x.root));
      return json({ folder, evaluations, ...(evaluations.length ? {} : { note: 'This folder has no evaluation. When the user wants results they can trust, offer to set one up with evaluation_propose.' }) });
    } catch (e) {
      return failed(e);
    }
  },
};

/** The longest one call waits, from when it started: under the ten minutes a tool call may take, a card's wait included. */
const CALL_MS = 570_000;
const MAX_WAIT_MIN = 9;
const DEFAULT_WAIT_MIN = 2;

const EVAL_SCORE: RunTool = {
  name: 'evaluation_score',
  description: `Score work with a project’s evaluation: the app checks that the sealed files are unchanged, runs the sealed command itself (one run for each seed, queued like experiment_run’s) in your folder or a git worktree of the same repository, and reads the number. Report these numbers, not your own. Waits up to wait minutes (default ${DEFAULT_WAIT_MIN}, at most ${MAX_WAIT_MIN}) and gives the score (id, status, runs, page) with values, mean, std and the comparison with the baseline when it ended in time; else read it later with evaluation_get and its id. Refused while the files the evaluation protects differ. Never start runs on the user’s GPUs unless they asked for it.`,
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The evaluation (needed when the folder has more than one).' },
      cwd: { type: 'string', description: 'The folder to score (default: yours): the evaluation’s folder, one inside it, or a git worktree of the same repository.' },
      wait: { type: 'number', description: `Minutes to wait for the result (default ${DEFAULT_WAIT_MIN}, at most ${MAX_WAIT_MIN}; 0 returns at once).` },
    },
  },
  async run(a, ctx) {
    const began = Date.now();
    let ev: Evaluation | undefined;
    let root: string | undefined;
    try {
      const db = ctx.deps.db;
      const asked = folderArg(a, ctx);
      const folder = asked ?? ctx.cwd;
      if (typeof a.id === 'string' && a.id.trim()) {
        ev = mustEvaluation(db, a.id.trim());
        // A folder asked for that has nothing to do with it is refused by the check; yours then means its home.
        root = (await rootFor(ev, folder)) ?? asked ?? ev.cwd;
      } else {
        const found = await evaluationsFor(db, folder);
        if (!found.length) return failed('There is no evaluation for this folder. Offer to set one up with evaluation_propose.');
        if (found.length > 1) return failed(`This folder has ${found.length} evaluations: say which with id (${found.map((x) => `${x.evaluation.id}: ${x.evaluation.name}`).join('; ')}).`);
        ({ evaluation: ev, root } = found[0]);
      }
      // A folder that cannot be scored is not asked about.
      await allowedFolder(ev, root);
      const no = await mayRun(ctx, `Score “${ev.name}”`, [ev.command, `# in ${root}${ev.command.includes('{seed}') ? ` · seeds ${ev.seeds.join(', ')}` : ''}`].join('\n'));
      if (no) return failed(no);
      const started = await startScore(ctx.deps, ev.id, { kind: 'score', folder: root, by: ctx.step ? { who: 'app' } : { who: 'agent', session: ctx.key } });
      const minutes = a.wait === undefined || a.wait === null || a.wait === '' ? DEFAULT_WAIT_MIN : Math.min(Math.max(Number(a.wait) || 0, 0), MAX_WAIT_MIN);
      const ms = Math.min(minutes * 60_000, Math.max(0, began + CALL_MS - Date.now()));
      const s = (await waitScore(ctx.deps, started.id, ms, ctx.signal)) ?? started;
      const over = s.status === 'done' || s.status === 'failed' || s.status === 'stopped';
      return json({
        evaluation: { id: ev.id, name: ev.name, metric: ev.metric, better: ev.better },
        ...scoreBrief(s),
        seeds: s.seeds,
        runs: s.runs,
        ...(s.lent ? { lent: s.lent } : {}),
        page: evalPage(ev.id, s.id),
        ...(over ? {} : { note: `Still ${s.status}: read it later with evaluation_get, score "${s.id}".` }),
      });
    } catch (e) {
      if (e instanceof ChangedError && ev)
        return failed(
          `${e.message}. Nothing ran. Put them back (POST /api/experiments/evaluations/${ev.id}/restore with { "folder": ${JSON.stringify(root)} } through app_api, or with git; remove files that were added yourself), or, if the change is meant, ask the person to seal the evaluation again.`,
        );
      return failed(e);
    }
  },
};

/** A fence longer than any in the text, around it. */
const fenced = (s: string) => {
  const mark = '`'.repeat(Math.max(3, ...[...s.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${mark}sh\n${s}\n${mark}`;
};
const plain = (s: string) => s.replace(/\s+/g, ' ').replace(/[\\`*_[\]<>#|]/g, '\\$&');
const code = (s: string) => {
  const t = s.replace(/\s+/g, ' ');
  return t.includes('`') ? `\`\` ${t} \`\`` : `\`${t}\``;
};
const size = (n: number) => (n < 1024 ? `${n} bytes` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`);

/** Every field of a proposed evaluation, in plain words, for the person's card. */
function proposalWords(spec: EvalSpec, sealed: { files: number; bytes: number }, why: string): string {
  const asks = [spec.gpus !== undefined ? `${spec.gpus} GPU${spec.gpus === 1 ? '' : 's'}` : '', spec.gpuMemGb ? `${spec.gpuMemGb} GB free on each` : '', spec.hours ? `at most ${spec.hours} hours` : ''].filter(Boolean);
  return [
    `**Name:** ${plain(spec.name)}`,
    `**Folder:** ${code(spec.cwd)}`,
    `**Command** that prints the number:\n\n${fenced(spec.command)}`,
    `**The number that counts:** ${code(spec.metric)}, ${spec.better} is better`,
    spec.command.includes('{seed}') ? `**Seeds:** ${spec.seeds.join(', ')} (one run for each)` : '**Seeds:** none (one run)',
    `**Protected** (no score while these differ from how they are sealed):\n\n${spec.protect.map((p) => `- ${code(p)}`).join('\n')}`,
    `**Sealed now:** ${sealed.files} file${sealed.files === 1 ? '' : 's'}, ${size(sealed.bytes)}`,
    spec.final
      ? `**Final test** (only you run it):\n\n${fenced(spec.final.command)}\n\n**Held-out data:** ${spec.final.heldOut ? code(spec.final.heldOut) : 'none'}`
      : '**Final test:** none',
    `**Each run asks for:** ${asks.length ? asks.join(', ') : 'what a run asks for by default (a GPU when this computer has one)'}`,
    `**Why the agent proposes it:**\n\n${why
      .split('\n')
      .map((l) => `> ${plain(l)}`)
      .join('\n')}`,
  ].join('\n\n');
}

const EVAL_PROPOSE: RunTool = {
  name: 'evaluation_propose',
  description:
    'Propose an evaluation for a project: one scoring command and one number, with the files it protects (the scorer and what it scores against) sealed so every run and every agent is scored the same way. You cannot create or seal one yourself: the person sees every field on a card, and it is created and sealed only if they say yes. Offer it when someone wants results they can trust and the folder has none. Have the command ready and tried first: it must print the number as key=value or a JSON line. Returns the evaluation, or that they said no.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A short name (80 characters at most).' },
      cwd: { type: 'string', description: 'The folder the command runs in, usually a git repository (default: yours).' },
      command: { type: 'string', description: 'The command that prints the number; {seed} is replaced by each seed: python eval.py --seed {seed}' },
      metric: { type: 'string', description: 'The name the command prints the number under.' },
      better: { type: 'string', enum: ['higher', 'lower'] },
      seeds: { type: 'array', items: { type: 'number' }, description: 'For a command with {seed}: 1 to 10 of them (default 1, 2, 3).' },
      protect: { type: 'array', items: { type: 'string' }, description: 'What must stay as sealed, from the folder: files, folders (ending in "/"), "*" and "**" allowed. The scorer, its helpers and the data it scores against.' },
      final: { type: 'object', description: 'A final test only the person runs: { command, heldOut?: a full path to a folder outside cwd, handed to the command as $HYDOR_HELD_OUT }.' },
      gpus: { type: 'number', description: 'GPUs each run needs (0 for none).' },
      gpuMemGb: { type: 'number', description: 'Free memory each GPU needs, in GB.' },
      hours: { type: 'number', description: 'A time limit for each run.' },
      why: { type: 'string', description: 'Why this scores the work well, in a sentence or two: the person reads it on the card.' },
    },
    required: ['name', 'command', 'metric', 'better', 'protect', 'why'],
  },
  async run(a, ctx) {
    try {
      const why = typeof a.why === 'string' ? a.why.trim().slice(0, 1000) : '';
      if (!why) return failed('Say why: the person reads it on the card.');
      const { where: _w, env: _e, ...given } = a;
      const spec = cleanSpec({ ...given, cwd: folderArg(a, ctx) ?? ctx.cwd });
      // Looked through before the card, so what cannot be sealed is not asked about.
      const found = await measure(spec);
      const detail = proposalWords(spec, { files: found.files.size, bytes: found.bytes }, why);
      // The card cuts what is longer: the person must see all of it.
      if (detail.length > 6000) return failed('That is too long to show on a card: put a long command in a script, name folders instead of many files, and keep why short.');
      const no = await confirmChange(ctx, { title: `Create and seal the evaluation “${spec.name}”?`, detail, level: 'ask', label: 'Create and seal' });
      if (no) return failed(no);
      const ev = await createEvaluation(ctx.deps, spec);
      return json({ created: true, id: ev.id, name: ev.name, folder: ev.cwd, command: ev.command, metric: ev.metric, better: ev.better, seeds: ev.seeds, protect: ev.protect, seal: ev.seal, finalTest: { set: !!ev.final, runs: 0 }, page: evalPage(ev.id) });
    } catch (e) {
      return failed(e);
    }
  },
};

// ---- evolve ------------------------------------------------------------------------------------------------------

const evolvePage = (id: string) => `/experiments?evolution=${id}`;

/** A candidate as the tools give it. */
const candBrief = (c: Candidate) => ({
  n: c.n,
  id: c.id,
  status: c.status,
  ...(c.why ? { why: c.why.length > 600 ? `${c.why.slice(0, 599)}…` : c.why } : {}),
  summary: c.summary,
  model: c.model,
  island: c.island,
  ...(c.quick ? { firstSeed: c.quick.value } : {}),
  ...(c.full ? { mean: c.full.mean, std: c.full.std, values: c.full.values } : {}),
  ...(c.gain !== undefined ? { gain: c.gain } : {}),
  ...(c.bestWhenScored ? { newBest: true } : {}),
  changed: c.changed,
});

/** An evolution as the tools give it. */
const evolveBrief = (e: Evolution) => ({
  id: e.id,
  status: e.status,
  ...(e.why ? { why: e.why } : {}),
  evaluation: e.evaluation,
  from: e.from,
  startCommit: e.startCommit.slice(0, 12),
  ...(e.branch ? { branch: e.branch } : {}),
  files: e.files,
  ...(e.aim ? { aim: e.aim } : {}),
  candidates: e.candidates,
  atOnce: e.atOnce,
  ...(e.hours ? { hours: e.hours } : {}),
  stallAfter: e.stallAfter,
  ...(e.start ? { start: { mean: e.start.mean, std: e.start.std, values: e.start.values } } : {}),
  tried: e.tried,
  failed: e.failed,
  modelCalls: e.calls,
  hoursRun: Number((e.activeMs / 3_600_000).toFixed(2)),
  ...(e.taken ? { taken: { branch: e.taken.branch, commit: e.taken.commit.slice(0, 12) } } : {}),
  page: evolvePage(e.id),
});

const EVOLVE_START: RunTool = {
  name: 'evolve_start',
  description: `Start Evolve on files a project’s evaluation scores: the app tries many small changes to them (the helper model proposes each, from the best versions so far), scores every one with the evaluation’s sealed command in worktrees of its own, and keeps the best; the person’s checkout is never changed, and they take the best onto a branch from its page. Use it when someone wants a file made better against an evaluation by search (a heuristic, a scoring function, a prompt, a slow routine) rather than trying changes one by one. The files must be committed, unchanged since, text, ${EVOLVE.files} at most and ${EVOLVE.bytes / 1024} KB in all, and none of them protected by the evaluation. The person allows it on a card. Returns the evolution (read how it goes with evolve_get) and its page.`,
  inputSchema: {
    type: 'object',
    properties: {
      evaluation: { type: 'string', description: 'The evaluation that scores (needed when the folder has more than one).' },
      cwd: { type: 'string', description: 'The folder whose current commit is the start (default: yours); the files are relative to it.' },
      files: { type: 'array', items: { type: 'string' }, description: `What it may change: 1 to ${EVOLVE.files} files, relative to cwd.` },
      aim: { type: 'string', description: 'What to try for, in a few sentences: the model reads it with every change it proposes.' },
      candidates: { type: 'number', description: `How many changes to try at most (${EVOLVE.candidates.min} to ${EVOLVE.candidates.max}; default ${EVOLVE.candidates.default}).` },
      hours: { type: 'number', description: 'Stop after this many hours of running.' },
      atOnce: { type: 'number', description: `How many are worked on at once (${EVOLVE.atOnce.min} to ${EVOLVE.atOnce.max}; default ${EVOLVE.atOnce.default}).` },
    },
    required: ['files'],
  },
  async run(a, ctx) {
    try {
      const db = ctx.deps.db;
      const from = folderArg(a, ctx) ?? ctx.cwd;
      let evaluation = typeof a.evaluation === 'string' ? a.evaluation.trim() : '';
      if (!evaluation) {
        const found = await evaluationsFor(db, from);
        if (!found.length) return failed('There is no evaluation for this folder: Evolve needs one to score each change. Offer to set one up with evaluation_propose.');
        if (found.length > 1) return failed(`This folder has ${found.length} evaluations: say which with evaluation (${found.map((x) => `${x.evaluation.id}: ${x.evaluation.name}`).join('; ')}).`);
        evaluation = found[0].evaluation.id;
      }
      const body = { evaluation, from, files: a.files, aim: a.aim, candidates: a.candidates, hours: a.hours, atOnce: a.atOnce };
      // Checked before the card, so what cannot start is not asked about.
      const c = await checkEvolveSpec(db, body);
      const s = c.spec;
      const ev = c.ev;
      const detail = [
        `Changes: ${s.files.join(', ')}`,
        `# in ${s.from}, from its commit ${c.commit.slice(0, 12)}; your files stay as they are`,
        `Tries: up to ${s.candidates} changes, ${s.atOnce} at a time, each scored by “${ev.name}” (${ev.metric}, ${ev.better} is better)`,
        `# ${ev.command.includes('{seed}') && ev.seeds.length > 1 ? `first with seed ${ev.seeds[0]}, then all ${ev.seeds.length} seeds when it beats the best so far` : 'one run each'}${ev.gpus ? ` · ${ev.gpus} GPU${ev.gpus === 1 ? '' : 's'} a run` : ''}`,
        `# each try asks the helper model once (twice when its answer cannot be used)`,
        `Stops: after ${s.candidates} tries${s.stallAfter ? `, ${s.stallAfter} in a row with no new best` : ''}${s.hours ? `, or ${s.hours} hours` : ''}`,
        ...(s.aim ? [`Aim: ${s.aim.replace(/\s+/g, ' ').slice(0, 300)}`] : []),
      ].join('\n');
      const no = await mayRun(ctx, `Evolve ${s.files.length === 1 ? s.files[0] : `${s.files.length} files`} with “${ev.name}”`, detail);
      if (no) return failed(no);
      const e = await startEvolution(ctx.deps, body, { who: 'agent', session: ctx.key });
      return json({ evolution: evolveBrief(e), note: 'It starts by scoring the start with all seeds; read how it goes with evolve_get. The person takes the best onto a branch from its page.', page: evolvePage(e.id) });
    } catch (e) {
      return failed(e);
    }
  },
};

const EVOLVE_GET: RunTool = {
  name: 'evolve_get',
  annotations: { readOnlyHint: true },
  description:
    'Read an evolution (Evolve, started with evolve_start or from its page): its state and why it ended, the start’s score, how many were tried and failed, the best so far (its summary, scores, gain against the start and its diff, cut to 200 lines) and the last 10 candidates. Without id, the latest evolutions.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'The evolution (as evolve_start gave it).' } },
  },
  async run(a, ctx) {
    try {
      const db = ctx.deps.db;
      if (!(typeof a.id === 'string' && a.id.trim())) return json({ evolutions: listEvolutions(db).slice(0, 10).map(evolveBrief) });
      const e = mustEvolution(db, a.id.trim());
      const ev = getEvaluation(db, e.evaluation);
      let best = null;
      if (e.best) {
        const c = await candidateDetail(db, e.id, e.best, EVOLVE.toolDiffLines);
        let left = EVOLVE.toolDiffLines;
        const diff = c.diff
          .map((f) => {
            const lines = f.diff.split('\n');
            const shown = lines.slice(0, Math.max(0, left));
            left -= shown.length;
            return shown.join('\n') + (shown.length < lines.length || f.cut ? '\n… (cut)' : '');
          })
          .filter((x) => x.trim())
          .join('\n');
        best = { ...candBrief(c), diff };
      }
      return json({
        ...evolveBrief(e),
        ...(ev ? { scoredBy: { id: ev.id, name: ev.name, metric: ev.metric, better: ev.better } } : {}),
        best,
        latest: candidatesOf(db, e.id, { newest: true }).slice(0, 10).map(candBrief),
      });
    } catch (e) {
      return failed(e);
    }
  },
};

export function experimentTools(ctx: RunCtx): RunTool[] {
  // Waiting for hours is a step's; proposing an evaluation and starting an evolution are a session's, where a card can ask.
  return [runTool(ctx), sweepTool(ctx), LIST, GET, STOP, TABLE, DESCRIBE, EVAL_GET, EVAL_SCORE, ...(ctx.step ? [WAIT] : [EVAL_PROPOSE, EVOLVE_START, EVOLVE_GET])];
}

export const SPAWN_NOTE =
  'Experiments (Experiments in the app’s sidebar): long training or evaluation goes to experiment_run (many settings: experiment_sweep) instead of running in the foreground: it waits for free GPUs, runs on its own and is recorded. Read runs with experiment_list and experiment_get; make results tables (mean ± std over seeds, significance, LaTeX) with experiment_table. When you start the first runs of an experiment (its group), or what it tests changes, give it a title, a short description and a category with experiment_describe, so people see what it is and find it by searching. Never start runs on the user’s GPUs unless they asked you to. A project may keep an evaluation (Experiments → Evaluations): one scoring command and one number, sealed so every run is scored the same way. When the folder you work in has one (evaluation_get), judge your work by evaluation_score and report its numbers, not your own; never change the files it protects (a score is refused while they differ) and never run or read its final test: that is the person’s. When someone wants results they can trust and has none, offer to set one up with evaluation_propose. When a folder has an evaluation and the person wants a file made better against it by search (a heuristic, a scoring function, a prompt, a slow routine), offer evolve_start rather than trying changes one by one by hand: it tries many small changes, scores each with the evaluation and keeps the best (evolve_get says how it goes); never point it at files the evaluation protects. Before you report that one thing beats another, try to break the result first (the break-the-result skill).';
