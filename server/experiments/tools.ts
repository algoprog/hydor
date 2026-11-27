// The tools agents get for Experiments, in sessions and as apps' steps: start a run or a sweep, list and read runs,
// stop one, make a results table, and (steps only) wait for runs to end; read an evaluation, score it, and (sessions
// only) propose one, which the person seals or not, and start an evolution (Evolve) and read how it goes. They answer
// in JSON, the shapes the plan gives (docs/plans/research-and-engineering.md), so a step's later steps can use the
// values. In a session, starting or stopping runs asks the user first unless the session has full access (Plan mode
// refuses), or it is an agent on call, whose rules the user gave. The card says the GPU hours a start may use; a
// budget the user gave the session (experiment_budget) starts what stays within it without one (budget.ts).
import crypto from 'node:crypto';
import path from 'node:path';
import { TEST_READABLE, type EvalScore, type EvalSpec, type Evaluation } from '../../shared/evaluations.ts';
import { canBeReplaced } from '../../shared/experiment-attempts.ts';
import { ACTIVE, GRACE, gpuHoursWords, gpuNum, HELD_WHY, isTrialRun, NOTE_MAX, TRY_SECONDS, type GpuHours, type JobSpec, type RunRecord, type RunStatus } from '../../shared/experiments.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { confirmChange, modeOf } from '../guide/api.ts';
import { makeTable, runView, startSweep } from './api.ts';
import { budgetNow, claimBudget, costLine, giveBudget, gpuHoursOf, heldNow, overWords, refuseAtCeiling } from './budget.ts';
import { allowedFolder, ChangedError, check, cleanSpec, createEvaluation, evaluationsFor, getEvaluation, getScore, listed, listScores, measure, mustEvaluation, rootFor, startScore, testReadable, waitScore } from './evaluations.ts';
import type { Candidate, Evolution } from '../../shared/evolve.ts';
import { candidateDetail, candidatesOf, checkEvolveSpec, EVOLVE, listEvolutions, mustEvolution, startEvolution } from './evolve.ts';
import { cleanJob, codeTaken, lookedAt, onCallSession, placeOf, placesLine, runAgain, sentToCluster, settingsOf, stopRun, submit, waitRuns, whereWords } from './queue.ts';
import { NIGHT_CLUSTER, nightZone, tonightMore, tonightWords, type NightCode } from './night.ts';
import { codeWords } from './code.ts';
import { keepUntracked, keptWords, localShell } from './capture.ts';
import { agentBaseEnv } from '../env.ts';
import { sawEnded } from './notices.ts';
import { cleanNote, patchRun } from './marks.ts';
import { getRun, getRunWithEvents, isFinalRun, isScoringRun, listInfo, listRuns, putAway, saveInfo, specOf, withAttempts } from './records.ts';
import { connectedMachines, remoteMachine } from './remote.ts';
import { lastPeak, peakNote, readTrial, startTrial, waitTrial } from './trial.ts';

const json = (v: unknown): string => JSON.stringify(v, null, 1);

/** The files a run on this computer names that git does not track, in a sentence: as kept, or (not started yet) as they will be. */
async function notInGit(r: RunRecord): Promise<string> {
  if (r.remote || (r.where && r.where !== 'local') || isScoringRun(r)) return '';
  if (r.queuedCode || (r.status !== 'queued' && r.status !== 'waiting')) return keptWords(r);
  return keptWords(await keepUntracked(localShell(r.cwd, { ...agentBaseEnv(), ...r.env }), r.command, r.cwd, null).catch(() => ({ kept: [], notKept: [] })));
}

/** For this computer's night runs: how long until the night, the time zone of its hours, and which code will run. */
function nightMore(ctx: RunCtx, where: string | undefined, r?: RunRecord | null): { startsMore?: string } {
  if (placeOf(where).kind === 'machine') return {};
  const code: NightCode = r?.code === 'now' ? 'now' : r?.queuedCode ? 'kept' : 'folder';
  const more = tonightMore(settingsOf(ctx.deps.db), { tz: nightZone(ctx.deps.db), code });
  return more ? { startsMore: more } : {};
}

/** When a night run to `where` will start, in a sentence ("It will start tonight, between 23:00 and 07:00"). */
function tonight(ctx: RunCtx, where: string | undefined): string {
  const p = placeOf(where);
  return tonightWords(settingsOf(ctx.deps.db), p.kind === 'machine' ? (remoteMachine(p.id)?.name ?? p.id) : undefined);
}

/** What was kept of a run's code when it was queued, in the answer's own short field. */
function codeKept(r: RunRecord | null | undefined): { code?: string } {
  if (!r?.queuedCode) return {};
  const kept = codeWords(r.queuedCode);
  return { code: r.code === 'now' ? `the folder as it is when it starts (code: "now"); as queued: ${kept}` : kept };
}

/** What experiment_run answers with. */
async function started(put: RunRecord, ctx: RunCtx): Promise<string> {
  // One that has to wait here says why, and about when it may start: known once the queue has looked. One the ceiling
  // on agents' GPU hours holds is held at once.
  await codeTaken(put.id);
  let r = heldNow(ctx.deps, getRun(ctx.deps.db, put.id) ?? put);
  if (r.status === 'queued' && placeOf(put.where).kind === 'local' && !put.remote) {
    await lookedAt(3000);
    const now = getRun(ctx.deps.db, put.id);
    if (now?.status === 'waiting') r = now;
  }
  // One for a cluster is sent first: a cluster that refuses it says so now, and one that takes it says about when it starts.
  if (put.status === 'queued' && placeOf(put.where).kind === 'cluster') {
    await sentToCluster(ctx.deps, put.id, 60_000, ctx.signal);
    r = getRun(ctx.deps.db, put.id) ?? put;
  }
  const git = await notInGit(r);
  const where = r.remote ? `m:${r.remote.machine}` : r.where;
  // A run here that asked for no memory: what the same command held last time.
  const peak = r.gpus && !r.gpuMemGb && !r.remote && (r.where ?? 'local') === 'local' ? lastPeak(ctx.deps.db, r.command, r.cwd, { not: r.id }) : undefined;
  const note = [isHeld(r) ? HELD_NOTE : '', git, peak ? peakNote(peak) : ''].filter(Boolean).join(' ');
  const gpuHours = gpuHoursOf(ctx.deps.db, r);
  return json({ id: r.id, gpuHours, status: r.status, ...(r.why ? { why: r.why } : {}), ...(r.status === 'waiting' && r.startsAbout ? { startsAbout: r.startsAbout } : {}), ...(r.when ? { when: r.when, starts: tonight(ctx, where), ...nightMore(ctx, where, r) } : {}), ...codeKept(r), name: r.name, page: `/experiments/${r.id}`, ...(note ? { note } : {}) });
}

const failed = (e: unknown): ToolOutput => ({ text: (e as Error)?.message ?? String(e), isError: true });

/** Sessions whose user allowed starting and stopping runs for the rest of the session (until the app restarts). */
const allowedHere = new Set<string>();

/** What the answer says of a run the ceiling on agents' GPU hours holds (its `why` says how far they are). */
const HELD_NOTE = 'It is held, not started: agents have used the GPU hours the person allows them in seven days. Tell the person it waits for them (they can let it run from its page, or change the limit in Experiments → Where runs go), and do not start more.';
const isHeld = (r: RunRecord) => !!r.held || !!r.why?.startsWith(HELD_WHY);

const NEEDS_HOURS = 'Give hours (its time limit): under this session’s budget every run needs one';

/** What a start may use, for its card and for the session's budget. */
interface Cost {
  hours: GpuHours;
  /** The card's line (none for a run without a GPU). */
  line: string | null;
  /** The agent can give a time limit, so under a budget a start without one is refused, not asked. */
  needsHours?: boolean;
  /** Always asked on a card, whatever the budget (a search starts many runs). */
  asks?: boolean;
  /** Set when the budget covered it: called once its runs are in line. */
  done?: () => void;
}

/** The cost of `runs` runs of a job. `time`: its limit in words, when it is not hours (a trial's seconds). */
function costOf(db: RunCtx['deps']['db'], spec: JobSpec, o: { runs?: number; time?: string; needsHours?: boolean } = {}): Cost {
  const hours = gpuHoursOf(db, spec, o.runs ?? 1);
  return { hours, line: costLine(hours, { gpus: spec.gpus ?? 0, hours: spec.hours, runs: o.runs, time: o.time }), needsHours: o.needsHours && !spec.hours };
}

/** Whether the session's runs start without any card: allowed for the session, an agent on call, or full access. */
const asksNothing = (ctx: RunCtx) => allowedHere.has(ctx.key) || onCallSession(ctx.deps.db, ctx.key) || modeOf(ctx) === 'full';

/**
 * Whether this call may start or stop runs: null when it may, else why not. Asks the user with a card when it must; a
 * start that stays within the session's budget of GPU hours is not asked about.
 */
async function mayRun(ctx: RunCtx, title: string, detail: string, cost?: Cost): Promise<string | null> {
  if (ctx.step || allowedHere.has(ctx.key) || onCallSession(ctx.deps.db, ctx.key)) return null;
  const mode = modeOf(ctx);
  if (mode === 'read-only') return 'This session only reads (Plan mode, or read-only): tell the user what you would run instead, or ask them to switch the mode.';
  if (mode === 'full') return null;
  let over = '';
  if (cost && !cost.asks && budgetNow(ctx.deps.db, ctx.key)) {
    const atMost = cost.hours.atMost;
    if (atMost === undefined) {
      if (cost.needsHours) return NEEDS_HOURS;
    } else {
      const c = await claimBudget(ctx.deps.db, ctx.key, atMost);
      if (c && 'release' in c) {
        cost.done = c.release;
        return null;
      }
      if (c) over = overWords(c);
    }
  }
  if (cost?.line) detail = [detail, `# ${cost.line}`, ...(over ? [`# ${over}`] : [])].join('\n');
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return 'Nobody can allow it now (the session is not running in the app). Ask the user in your reply.';
  const card: ApprovalRequest = {
    id: `exp-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'command',
    // The lines about its cost are read whole on a narrow screen.
    ...(cost?.line ? { wrap: true } : {}),
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
  ...(r.when ? { when: r.when } : {}),
  ...(r.startedAt ? { startedAt: r.startedAt } : {}),
  ...(r.endedAt ? { endedAt: r.endedAt } : {}),
  ...(r.note ? { note: r.note, note_by: r.noteBy ?? 'user' } : {}),
  ...(r.starredAt ? { starred: true } : {}),
  ...(r.retryOf ? { attempt: r.attempt, retry_of: r.retryOf } : {}),
  ...(r.replacedBy ? { replaced_by: r.replacedBy } : {}),
  ...(r.restartedAs ? { started_again_as: r.restartedAs } : {}),
  ...sealChanged(r),
});

/** The run an agent says this one is another attempt at: one that failed, went missing or was stopped (or is being stopped). */
function replaced(db: RunCtx['deps']['db'], id: unknown): string | undefined {
  if (typeof id !== 'string' || !id.trim()) return undefined;
  const r = getRun(db, id.trim());
  if (!r) throw new HttpError(404, `replaces: there is no run ${id}`);
  if (isFinalRun(r) || isScoringRun(r)) throw new HttpError(400, 'replaces: that run scored an evaluation');
  if (!canBeReplaced(r) && !r.stopping) throw new HttpError(400, `replaces: ${r.id} ${r.status === 'done' ? 'finished, so running it again is a repeat, not another attempt: leave replaces out' : 'has not ended: stop it first, or leave replaces out'}`);
  return r.id;
}

/** Marks a run that started when an evaluation's sealed files were not as sealed. */
const sealChanged = (r: RunRecord) => (r.sealed?.some((s) => !s.ok) ? { sealChanged: true } : {});

const FINAL_RUN = 'That run is a final test: only the person reads it.';

const JOB_PROPS = (ctx: RunCtx) => {
  const clusters = placesLine(ctx.deps.db);
  const machines = connectedMachines().map((m) => `"m:${m.id}" (${m.name})`);
  return {
    cwd: { type: 'string', description: 'The folder it runs in (default: yours). On a cluster or another machine: a folder there.' },
    code: {
      type: 'string',
      enum: ['queued', 'now'],
      description:
        'Which code runs when files in the folder change while it waits (a folder in a git repository, on this computer or another of your machines; not a cluster). "queued" (the default): by default the code as it is when you call this is what runs, even if you change files while it waits: if the folder has changed by then, it runs from a copy of that code, with data linked in: everything git does not track that is not code, what the command writes, and tracked data files such as .csv or .pt ($HYDOR_CODE_DIR is the copy, $HYDOR_PROJECT_DIR the folder; what it writes into folders that are new shows in the folder when it ends). "now": it runs the folder as it is when the run starts.',
    },
    name: { type: 'string', description: 'A short name for the run (default: its script).' },
    group: { type: 'string', description: 'The experiment it belongs to: runs of one experiment are listed and compared together.' },
    where: {
      type: 'string',
      description: `Where it runs: "local" (this computer, the default)${clusters ? `, a cluster: ${clusters}` : ''}${machines.length ? `, another machine: ${machines.join(', ')}` : ''}.`,
    },
    gpus: { type: 'number', description: 'GPUs it needs (0 for none; default 1 on a computer with GPUs, else 0). It waits until that many are free for it.' },
    gpuMemGb: { type: 'number', description: 'Free memory each GPU needs, in GB. Give it when you know it: on this computer the run may then share a GPU with other runs that said theirs, when it fits (unless sharing is turned off). Left out, it waits for a GPU to itself that is almost all free.' },
    alone: { type: 'boolean', description: 'Its GPUs to itself: no other run goes on them while it runs, whatever memory it asks for (timing and speed measurements).' },
    params: { type: 'object', description: 'Its settings, kept with the run and compared in tables ({ "lr": 0.0003 }); --name value pairs in the command are read too. {name} placeholders in the command are filled from them.' },
    seed: { type: 'number', description: 'Its seed (fills {seed} in the command; also read from --seed).' },
    tags: { type: 'array', items: { type: 'string' } },
    metricsFile: { type: 'string', description: 'A file it writes metrics to as JSON lines (relative to cwd; {run} is the run’s id, and it may start with $HYDOR_RUN_DIR/, the run’s own folder). Metrics are also read from its output: key=value pairs and JSON objects on a line.' },
    scoresFile: { type: 'string', description: 'A file of per-example scores it writes (JSON lines with "id" and a number per metric, or trec_eval -q lines): kept with the run for paired significance tests over examples. {run} and {param} placeholders are filled, and it may start with $HYDOR_RUN_DIR/. Not needed for scores written to $HYDOR_RUN_DIR/scores.jsonl.' },
    hours: { type: 'number', description: 'A time limit: it is stopped after this many hours (on SLURM, its --time). Give it for every run on a GPU (experiment_try’s ask.hours suggests one): it is what lets the person see what the run may cost, in GPU hours (its GPUs times these hours), and a session with a budget (experiment_budget) refuses a run without one. A run stopped at its time limit is not started again by itself.' },
    resume: {
      type: 'string',
      description:
        'A training that saves checkpoints should give this: the command that goes on from its last one (python train.py --resume outputs/a/last.pt; {name} placeholders filled as in command). A night run stopped at the night’s end, a run lost in a restart and a preempted cluster run then carry on with it instead of starting over (a lost or preempted one as a new run, twice at most). Keep checkpoints in a folder that stays the same between runs, not in $HYDOR_RUN_DIR, which a new run has afresh, and let the command cope with there being none yet.',
    },
    grace: {
      type: 'number',
      description: `Before the app stops a run (its time limit, the night’s end, an early stop) it sends it Ctrl-C (SIGINT; Python raises KeyboardInterrupt), waits this many seconds for it to save a checkpoint and leave, then stops it hard (${GRACE.min} to ${GRACE.max}, default ${GRACE.default}; HYDOR_GRACE_SECONDS in its environment). Giving it also gives a stop by you or the person that time. SLURM’s own time limit gives no such warning.`,
    },
    priority: { type: 'number', description: 'Higher goes first in the queue (default 0).' },
    when: {
      type: 'string',
      enum: ['night', 'now'],
      description:
        '"night": it waits for the night hours of the computer it runs on (Experiments → Where runs go) and starts then, after every other waiting run; for exploratory work that can wait. Not on a cluster. Leave it out to start as soon as a GPU is free ("now" does the same: for running a night run again at once).',
    },
    env: { type: 'object', description: 'Environment variables for it.' },
    better: { type: 'object', description: 'Which way is better for metrics whose name does not say: { "bleu": "max" } (losses, errors, perplexity… are lower-is-better by name).' },
    onCall: {
      type: 'object',
      description:
        'The agent on call: { on: true, act: "tell" (a notification) or "agent" (an agent session looks into it, acts within the rules, then tells the user), watch?: ["nan","oom","stall","crash","diverge"] (default all), stallMinutes?: 30, rules?: what the agent may do }.',
    },
    notify: { type: 'object', description: 'What to tell the user: { done?: true, failed?: true, when?: { metric, op: ">"|"<"|">="|"<=", value } } (done and failed are on unless set false).' },
    report: {
      type: 'boolean',
      description: `When it ends, this session gets a message saying how it went, so you can go on from there. The message comes after your turn ends when you are at work (while you work, ${ctx.step ? 'experiment_wait or experiment_get' : 'experiment_get'} tells you), and runs you have read since they ended are left out of it.`,
    },
    cpus: { type: 'number', description: 'SLURM: processors (--cpus-per-task).' },
    memGb: { type: 'number', description: 'SLURM: memory in GB (--mem).' },
    partition: { type: 'string', description: 'SLURM: the partition (default: the cluster’s).' },
  };
};

function runTool(ctx: RunCtx): RunTool {
  return {
    name: 'experiment_run',
    description:
      'Start a long job (training, an evaluation) in Experiments’ queue instead of running it in the foreground: it waits for free GPUs (or a place among the jobs without one), runs on its own (in tmux, so it outlives this session), and is recorded: the commit and a patch of changes not committed, the files the command names that git does not track, its settings and seed, the environment, its log and the metrics it prints. Each run has $HYDOR_RUN (its id) and $HYDOR_RUN_DIR (its own folder) in its environment: per-example scores written to $HYDOR_RUN_DIR/scores.jsonl are kept with it without being named. Returns at once with the run’s id and gpuHours ({ atMost: from its time limit, or about: from how long the same command took last }). In a git repository its code is kept as it is when you call this, and that is what runs, so you may go on editing the folder for the next one (see code). Write results into files git does not track or ignores (or name them with an output flag such as --out, or redirect with >), since a run that rewrites tracked code or settings makes later queued runs take a copy. Never start runs on the user’s GPUs unless they asked for it. Before a run of more than a few minutes on a GPU, try it first with experiment_try, and give it a time limit (hours) so the person sees what it may cost; before a plan of several runs, ask once with experiment_budget. When the person’s limit on agents’ GPU hours is reached, the run is held, not started (the answer says so): tell them, and start no more. With again: a run’s id, it runs that run again with the changes you give. A run that failed, went missing or was stopped and is started again should say so (again, or replaces with its id when you write the command anew), so the page shows them as one row with its attempts. A training that saves checkpoints should give resume; the run gets a warning (Ctrl-C) and grace seconds before the app stops it, and one that carries on (again with carryOn, a night run’s next start, one lost or preempted) runs the same kept code as before. A run for a SLURM cluster is checked with the cluster before it is sent: the answer says at once why it would be refused; when it is accepted, why may give the cluster’s cautious guess of when it would start (often far later than it does: do not plan on it).',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command, as you would type it in its folder.' },
        again: { type: 'string', description: 'A run’s id: start it again with its settings, changed by what else you give.' },
        replaces: { type: 'string', description: 'A run’s id: this run is another attempt at that failed, lost or stopped run (a fixed command, less memory…), so the page shows them as one row with its attempts. Not for a run that finished.' },
        carryOn: { type: 'boolean', description: 'With again, for a run that has a resume command: go on from its last checkpoint with that command, with the code that run ran, instead of starting over.' },
        ...JOB_PROPS(ctx),
      },
    },
    async run(a, ctx) {
      try {
        const db = ctx.deps.db;
        const onCall = a.onCall && typeof a.onCall === 'object' && !a.onCall.agent && !ctx.step ? { ...a.onCall, agent: agentOf(ctx) } : a.onCall;
        const from = replaced(db, a.replaces);
        if (typeof a.again === 'string' && a.again.trim()) {
          if (from && from !== a.again.trim()) return failed('again already says which run this is another attempt at: give again or replaces, not both.');
          const prev = getRun(db, a.again.trim());
          if (!prev) throw new HttpError(404, `There is no run ${a.again}`);
          if (isScoringRun(prev)) throw new HttpError(400, 'That run scored an evaluation: score it again with evaluation_score.');
          const { again: _a, replaces: _r, ...changes } = a;
          const night = (changes.when ?? prev.when) === 'night';
          const where = String(changes.where ?? (prev.remote ? `m:${prev.remote.machine}` : (prev.where ?? 'local')));
          if (night && placeOf(where).kind === 'cluster') return failed(NIGHT_CLUSTER);
          const carry = String(changes.resume ?? prev.resume ?? '').trim();
          const carryOn = changes.carryOn === true;
          if (carryOn && !carry) return failed('That run has no command to carry on with: give resume, or leave carryOn out.');
          // A training must not change code between its checkpoints.
          if (carryOn && changes.code === 'now') return failed('Carrying on runs the code the run ran: leave code out, or leave carryOn out to start over with the folder as it is now.');
          // As it would start: its job with the changes, for what it may use.
          const next = await cleanJob(db, { ...specOf(prev), where, ...changes });
          const cost = costOf(db, next, { needsHours: true });
          const no = await mayRun(
            ctx,
            `Run “${prev.name ?? prev.id}” again`,
            [carryOn ? carry : (changes.command ?? prev.command), `# in ${changes.cwd ?? prev.cwd} · ${whereWords(db, prev)}`, ...(carry && !carryOn ? [`# to carry on after a stop: ${carry}`] : []), ...(night ? [`# ${tonight(ctx, where)}`] : [])].join('\n'),
            cost,
          );
          if (no) return failed(no);
          try {
            const r = await runAgain(ctx.deps, prev.id, { ...changes, ...(onCall ? { onCall } : {}) }, startedBy(ctx));
            return started(r, ctx);
          } finally {
            cost.done?.();
          }
        }
        if (a.carryOn === true) return failed('carryOn goes with again (the run to carry on from): give again, or leave carryOn out.');
        const spec = await cleanJob(db, { ...a, ...(onCall ? { onCall } : {}) }, { cwd: ctx.cwd });
        const cost = costOf(db, spec, { needsHours: true });
        const no = await mayRun(
          ctx,
          `Run a job${spec.gpus ? ` on ${spec.gpus} GPU${spec.gpus === 1 ? '' : 's'}` : ''}`,
          [spec.command, `# in ${spec.cwd}${spec.where && spec.where !== 'local' ? ` · ${spec.where}` : ''}${spec.group ? ` · experiment ${spec.group}` : ''}`, ...(spec.resume ? [`# to carry on after a stop: ${spec.resume}`] : []), ...(spec.when ? [`# ${tonight(ctx, spec.where)}`] : [])].join('\n'),
          cost,
        );
        if (no) return failed(no);
        try {
          const r = await submit(ctx.deps, spec, { startedBy: startedBy(ctx), ...(from ? { from } : {}) });
          return started(r, ctx);
        } finally {
          cost.done?.();
        }
      } catch (e) {
        return failed(e);
      }
    },
  };
}

function tryTool(ctx: RunCtx): RunTool {
  const props = JOB_PROPS(ctx);
  return {
    name: 'experiment_try',
    description: `Try a command before the real run, on this computer: the same command in the same folder and environment, for at most ${TRY_SECONDS.default} seconds (seconds: ${TRY_SECONDS.min} to ${TRY_SECONDS.max}), then stopped, with HYDOR_TRY=1 and HYDOR_TRY_SECONDS in its environment so a script that knows them can cut itself short. It waits in the queue for a GPU as the real run would, and is kept out of experiments’ lists. Answers as JSON: ok (it got going) or firstError (where it first went wrong), the most GPU memory and resident memory it held, the time for a step and how many there are when the output says, estimateHours for the whole run, ask ({ gpuMemGb, hours } to give the real run) and said, a sentence. Give the real run ask.hours as its time limit, so the person sees what it may cost. A trial counts as a run for the GPU hours allowed to agents: at their limit it is held, not tried. Never start runs on the user’s GPUs unless they asked for it.`,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command, as you would type it in its folder.' },
        cwd: { type: 'string', description: 'The folder it runs in (default: yours).' },
        gpus: props.gpus,
        gpuMemGb: props.gpuMemGb,
        env: props.env,
        seconds: { type: 'number', description: `How long it may run, in seconds (default ${TRY_SECONDS.default}, ${TRY_SECONDS.min} to ${TRY_SECONDS.max}).` },
        id: { type: 'string', description: 'Instead of a command: a trial that had not ended when it was asked for, to wait for its answer.' },
      },
    },
    async run(a, ctx) {
      const began = Date.now();
      let gpuHours: GpuHours | undefined;
      try {
        const db = ctx.deps.db;
        let id = typeof a.id === 'string' ? a.id.trim() : '';
        if (!id) {
          // Checked before the card, so what cannot start is not asked about.
          const spec = await cleanJob(db, { command: a.command, cwd: a.cwd, gpus: a.gpus, gpuMemGb: a.gpuMemGb, env: a.env }, { cwd: ctx.cwd });
          const seconds = Math.min(Math.max(Math.round(Number(a.seconds) || TRY_SECONDS.default), TRY_SECONDS.min), TRY_SECONDS.max);
          // A trial's time limit is its seconds.
          const cost = costOf(db, { ...spec, hours: seconds / 3600 }, { time: `${seconds} seconds` });
          const no = await mayRun(ctx, `Try a job for ${seconds} seconds?`, [spec.command, `# in ${spec.cwd}`].join('\n'), cost);
          if (no) return failed(no);
          gpuHours = cost.hours;
          try {
            const run = heldNow(ctx.deps, await startTrial(ctx.deps, { command: a.command, cwd: a.cwd, gpus: a.gpus, gpuMemGb: a.gpuMemGb, env: a.env, seconds }, { cwd: ctx.cwd, startedBy: startedBy(ctx) }));
            id = run.id;
          } finally {
            cost.done?.();
          }
        } else readTrial(db, id);
        // One that is held is not waited for: it may be hours until the person lets it go.
        const held = getRun(db, id);
        if (held?.held) return json({ ...readTrial(db, id), ...(gpuHours ? { gpuHours } : {}), page: `/experiments/${id}`, note: HELD_NOTE });
        await waitTrial(ctx.deps, id, CALL_MS - (Date.now() - began), ctx.signal);
        const answer = readTrial(db, id);
        return json({ ...answer, ...(gpuHours ? { gpuHours } : {}), page: `/experiments/${id}`, ...(answer.over ? {} : { note: `It has not ended: experiment_try with id "${id}" waits for it again; experiment_stop stops it.` }) });
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
      'Start a sweep: one command with a {name} placeholder for each setting, and values for each, expanded into runs of one experiment (every combination, or a random sample with mode "random"), queued like experiment_run’s. Each run can write its own per-example scores to $HYDOR_RUN_DIR/scores.jsonl, its own folder; tags, name, scoresFile, metricsFile and when apply to every run. With earlyStop, a run whose metric at a step is worse than the median of the other runs at that step is stopped. In a git repository the code is kept as it is when you call this and every run of the sweep runs that, whatever changes in the folder meanwhile (see code). Write results into files git does not track or ignores (or name them with an output flag such as --out, or redirect with >), since a run that rewrites tracked code or settings makes later queued runs take a copy. The user hears once, when the whole sweep has ended (with when: "night", in the morning). Give hours (each run’s time limit) so the person sees what the whole sweep may cost: gpuHours in the answer is for all its runs. When the person’s limit on agents’ GPU hours is reached, runs are held, not started (the answer says how many): tell them, and start no more. Never start runs on the user’s GPUs unless they asked for it.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command with placeholders: python train.py --lr {lr} --batch {batch}' },
        params: { type: 'object', description: 'Each setting with its values: { "lr": [0.001, 0.0003], "batch": [32, 64] }' },
        mode: { type: 'string', enum: ['grid', 'random'], description: 'grid (default): every combination; random: a random sample of them, maxRuns at most.' },
        maxRuns: { type: 'number', description: 'At most this many runs (200 at most).' },
        group: { type: 'string', description: 'The experiment’s name: its runs are kept and compared under it.' },
        name: { type: 'string', description: 'A name for each run, its {param} placeholders filled as the command’s are: "bm25 k1={k1}" (default: the experiment and the settings).' },
        earlyStop: { type: 'object', description: '{ metric, better: "max"|"min", afterSteps? }: stop runs worse than the median of the others at the same step.' },
        cwd: props.cwd,
        code: props.code,
        where: props.where,
        gpus: props.gpus,
        gpuMemGb: props.gpuMemGb,
        alone: props.alone,
        seed: props.seed,
        tags: props.tags,
        metricsFile: props.metricsFile,
        scoresFile: props.scoresFile,
        hours: props.hours,
        resume: props.resume,
        grace: props.grace,
        priority: props.priority,
        when: props.when,
        env: props.env,
        onCall: props.onCall,
        notify: props.notify,
        report: {
          type: 'boolean',
          description: `When the whole sweep has ended, this session gets a message saying how it went. The message comes after your turn ends when you are at work (while you work, ${ctx.step ? 'experiment_wait or experiment_get' : 'experiment_get'} tells you); it is left out when you have read all its runs since they ended.`,
        },
      },
      required: ['command', 'params', 'group'],
    },
    async run(a, ctx) {
      try {
        const n = Object.values((a.params ?? {}) as Record<string, unknown[]>).reduce<number>((x, v) => x * (Array.isArray(v) ? v.length : 1), 1);
        const night = a.when === 'night';
        const where = typeof a.where === 'string' ? a.where : undefined;
        if (night && placeOf(where).kind === 'cluster') return failed(NIGHT_CLUSTER);
        const runs = a.mode === 'random' && a.maxRuns ? Math.min(n, Number(a.maxRuns)) : n;
        // A job that cannot start is said so by the sweep below, as before.
        const job = await cleanJob(ctx.deps.db, { command: a.command, cwd: a.cwd, where: a.where, gpus: a.gpus, hours: a.hours }, { cwd: ctx.cwd }).catch(() => null);
        const cost = job ? costOf(ctx.deps.db, job, { runs, needsHours: true }) : undefined;
        const no = await mayRun(
          ctx,
          `Start a sweep of ${runs} runs`,
          [String(a.command ?? ''), `# ${JSON.stringify(a.params ?? {})} · experiment ${a.group ?? ''}`, ...(typeof a.resume === 'string' && a.resume.trim() ? [`# to carry on after a stop: ${a.resume.trim()}`] : []), ...(night ? [`# ${tonight(ctx, where)}`] : [])].join('\n'),
          cost,
        );
        if (no) return failed(no);
        const onCall = a.onCall && typeof a.onCall === 'object' && !a.onCall.agent && !ctx.step ? { ...a.onCall, agent: agentOf(ctx) } : a.onCall;
        try {
          const s = await startSweep(ctx.deps, { ...a, ...(onCall ? { onCall } : {}) }, { cwd: ctx.cwd, startedBy: startedBy(ctx) });
          await Promise.all(s.runs.map((r) => codeTaken(r.id)));
          const held = s.runs.map((r) => heldNow(ctx.deps, getRun(ctx.deps.db, r.id) ?? r)).filter(isHeld);
          // On a cluster, what it says of the first run holds for them all: a refusal, or how they wait.
          if (s.runs[0] && placeOf(where).kind === 'cluster') await sentToCluster(ctx.deps, s.runs[0].id, 60_000, ctx.signal);
          const first = s.runs[0] && getRun(ctx.deps.db, s.runs[0].id);
          const cluster = first && placeOf(where).kind === 'cluster' ? (first.status === 'failed' ? { refused: first.why } : first.why ? { queued: first.why } : {}) : {};
          return json({ sweep: s.sweep.id, group: s.sweep.group, runs: s.runs.map((r) => r.id), ...(cost ? { gpuHours: cost.hours } : {}), ...(held.length ? { held: held.length, why: held[0].why, note: HELD_NOTE } : {}), ...cluster, ...(night ? { when: 'night', starts: tonight(ctx, where), ...nightMore(ctx, where, first) } : {}), ...codeKept(first), page: `/experiments?sweep=${s.sweep.id}` });
        } finally {
          cost?.done?.();
        }
      } catch (e) {
        return failed(e);
      }
    },
  };
}

const LIST: RunTool = {
  name: 'experiment_list',
  annotations: { readOnlyHint: true },
  description: 'List runs of Experiments, newest first: their id, name, experiment (group) and its title when it has one (experiment_title), status (and why it waits or failed), where, settings, seed, metrics ({ last, best, step, repeated: the metrics printed more than once, which have curves (the others it printed once: settings, results), progress?: { done, total } while a phase is under way }) and when they started and ended. Also note (and note_by: the user’s or an agent’s: what to know about the run), starred (the ones that count), and, for attempts at the same thing, attempt, retry_of (the failed or stopped run it follows) and replaced_by (the later attempt that took its place). Runs the user archived (put aside, themselves or their whole experiment) are left out unless archived is true.',
  inputSchema: {
    type: 'object',
    properties: {
      group: { type: 'string', description: 'One experiment’s runs.' },
      tag: { type: 'string' },
      status: { type: 'string', description: 'Comma-separated: queued, waiting, running, done, failed, stopped, lost; or "active" for those not ended.' },
      cwd: { type: 'string', description: 'Runs started in this folder or under it.' },
      limit: { type: 'number', description: 'At most this many (default 30, at most 500).' },
      archived: { type: 'boolean', description: 'true: the archived runs too, each marked archived.' },
    },
  },
  async run(a, ctx) {
    const st = String(a.status ?? '').trim();
    const status = st === 'active' ? ACTIVE : st ? (st.split(/[\s,]+/).filter(Boolean) as RunStatus[]) : undefined;
    const limit = Math.min(Math.max(Number(a.limit) || 30, 1), 500);
    // Trials are listed only when asked for by their tag.
    const found = listRuns(ctx.deps.db, { group: a.group ? String(a.group) : undefined, tag: a.tag ? String(a.tag) : undefined, status, cwd: a.cwd ? String(a.cwd) : undefined, limit: 5000 }).filter((r) => a.tag === 'try' || !isTrialRun(r));
    const away = putAway(ctx.deps.db, found, true);
    const runs = withAttempts(ctx.deps.db, found.filter((r) => a.archived === true || !away.has(r.id)).slice(0, limit));
    const titles = new Map([...listInfo(ctx.deps.db)].flatMap(([name, i]) => (i.title ? [[name, i.title] as const] : [])));
    const left = a.archived === true ? 0 : away.size;
    return json({
      runs: runs.filter((r) => !isFinalRun(r)).map((r) => ({ ...brief(ctx.deps.db, r, titles), ...(away.has(r.id) ? { archived: true } : {}) })),
      ...(left ? { note: `${left} archived run${left === 1 ? ' is' : 's are'} left out: archived: true lists ${left === 1 ? 'it' : 'them'} too.` } : {}),
    });
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

const NOTE: RunTool = {
  name: 'experiment_note',
  description: `Keep one short line with a run of Experiments (at most ${NOTE_MAX} characters), for what a later reader must know about this run, such as “the tokenizer bug was still in this one” or “ran on the old split”. Not for its results (they are recorded) nor for what an experiment showed (finding_record). It shows under the run’s name, marked as an agent’s, and replaces the agent’s note before it (an empty note takes it away). A note the user wrote is not written over.`,
  inputSchema: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string', description: 'One line; empty takes your note away.' } }, required: ['id', 'note'] },
  async run(a, ctx) {
    try {
      const id = String(a.id ?? '').trim();
      const r = getRun(ctx.deps.db, id);
      if (!r) throw new HttpError(404, `There is no run ${a.id}`);
      if (isFinalRun(r)) return failed(FINAL_RUN);
      const note = cleanNote(a.note);
      if (r.note && r.noteBy !== 'agent') return failed(`The user wrote a note on this run, and it is theirs to change: “${r.note}”. Tell them what you would add to it.`);
      const next = patchRun(ctx.deps, id, { note }, 'agent');
      return json({ id, ...(next.note ? { note: next.note } : { note: '' }) });
    } catch (e) {
      return failed(e);
    }
  },
};

const GET: RunTool = {
  name: 'experiment_get',
  annotations: { readOnlyHint: true },
  description: 'Read one run of Experiments: its whole record (command, folder, where, GPUs, commit, branch, changes, settings, seed, environment, metrics, exit code, its events: what the agent on call saw and did) and the end of its log. Also what was said of it (note and noteBy, starredAt, archivedAt) and, when it is one of several attempts at the same thing, retryOf, replacedBy, attempt and chain (the run before it and the one that took its place). For its code: queuedCode (what was kept when it was queued), codeAt ("queued": it ran that; "start": the folder as it was when it started), codeChanged (the files that differed from what was queued when it started), codeDir (the copy it ran from, when it did), ranAs (the command as it ran there, with the paths pointed at the copy, when that differs from command) and leftInCopy (what stayed in that copy, because the folder had its own; the rest of the copy is removed when it ends). codeFrom: the run whose code it runs. For stopping and carrying on: resume and grace as given, ranResume (it ran resume, from a checkpoint), carriesOn (its next start will), restartedAs (the run the app started to carry on from this one, lost or preempted) and autoResumes (how often it has done so in this chain).',
  inputSchema: { type: 'object', properties: { id: { type: 'string' }, lines: { type: 'number', description: 'Lines of the log’s end (default 100, at most 2000).' } }, required: ['id'] },
  async run(a, ctx) {
    try {
      const id = String(a.id ?? '').trim();
      const kept = getRun(ctx.deps.db, id);
      if (kept && isFinalRun(kept)) return failed(FINAL_RUN);
      const v = await runView(ctx.deps, id, Math.min(Math.max(Number(a.lines) || 100, 0), 2000));
      // It has been read since it ended: the message that would tell this session of it leaves it out.
      if (!ACTIVE.includes(v.run.status)) sawEnded(ctx.deps, ctx.key, [id]);
      const note = await notInGit(v.run);
      // A run that kept files says that none was left out, rather than leaving the field out.
      const notKept = v.run.kept?.length ? { notKept: v.run.notKept ?? [] } : {};
      const code = v.run.queuedCode ? { queuedCode: codeWords(v.run.queuedCode) } : {};
      return json({ run: { ...v.run, ...notKept, ...code, where: whereWords(ctx.deps.db, v.run), ...sealChanged(v.run) }, ...(v.chain ? { chain: v.chain } : {}), ...(note ? { note } : {}), log: v.log });
    } catch (e) {
      return failed(e);
    }
  },
};

const STOP: RunTool = {
  name: 'experiment_stop',
  description: 'Stop a run of Experiments: one in line goes at once; one running gets Ctrl-C (then TERM and KILL if it does not end, after 10 seconds, or after its grace when it asked for one) and ends as stopped. Its record and log stay.',
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
    'Make a results table from runs of Experiments: a row per experiment (group), per command with its seed taken out ("command": what tells runs of different scripts or flags apart when their settings do not) or per value of a setting ("param:lr"), the runs of a row averaged over seeds (mean ± std), the best of each column in bold, each row tested against the baseline (paired over examples when the runs kept per-example scores, else paired over seeds when they share seeds, else Welch’s t-test; Holm-corrected), † on cells significantly better than the baseline and ‡ on those significantly worse. Each tested cell has verdict, to be read with its p (pAdj: after the correction): "better" or "worse" says the test found that difference, in the direction the metric is better in; "same" says it found none (not that the two are equal). A row whose per-example scores are the baseline’s on every example is "same", with no p, and a note says so. When the seeds barely change a number and there are no per-example scores, it is not tested and the table’s notes say so. Runs have per-example scores when they wrote $HYDOR_RUN_DIR/scores.jsonl (each run’s own folder) or named a scoresFile. Returns it as LaTeX (booktabs, with a “% hydor:table <id>” line that lets the numbers be checked again later: keep it), Markdown and CSV.',
  inputSchema: {
    type: 'object',
    properties: {
      runs: { type: 'array', items: { type: 'string' }, description: 'The runs’ ids.' },
      group: { type: 'string', description: 'Or an experiment: every finished run of it, but those the user archived.' },
      rows: { type: 'string', description: '"group" (default), "command" (a row for each command, its seed’s flag or {seed} value and a seed setting taken out; each row is labelled by the script, the differing flags or the start of the command) or "param:<name>".' },
      columns: { type: 'array', items: { type: 'object' }, description: '[{ metric, better: "max"|"min", label?, digits?, value?: "last"|"best", scale?: 100 for a percentage }]' },
      baseline: { type: 'string', description: 'The row the others are tested against (its group or the setting’s value; with rows "command", its key or label; default the first row).' },
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
      // The verdict says how a cell stands. `significant` (kept for the marks) means only "significantly better": left out here.
      const rows = t.rows.map((r) => ({ ...r, cells: r.cells.map(({ significant: _, ...c }) => c) }));
      return json({ ...t, rows, page: `/experiments?table=${t.id}` });
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
    sawEnded(ctx.deps, ctx.key, w.runs.filter((r) => !ACTIVE.includes(r.status)).map((r) => r.id));
    return json({ ended: w.ended, ...(w.ended ? {} : { note: `Not all had ended after ${hours} h.` }), runs: w.runs.filter((r) => !isFinalRun(r)).map((r) => ({ ...brief(ctx.deps.db, r), events: getRunWithEvents(ctx.deps.db, r.id)?.events?.slice(-5) })) });
  },
};

const BUDGET: RunTool = {
  name: 'experiment_budget',
  description:
    'Ask once for the GPU hours a plan needs, before starting its runs: three seeds of four settings at about three hours each is 36. A run’s GPU hours are its GPUs times the hours it runs. The person sees your number and why on a card. Once they allow it, this session’s runs start without a card while what its runs have used since, the time limits of those waiting or running, and the new run’s time limit stay within it: so give every run on a GPU a time limit (hours), as one without is refused under a budget. A run that would go over asks on the ordinary card. Nothing starts by it, and asking again replaces the budget. Without arguments: the budget and what is left.',
  inputSchema: {
    type: 'object',
    properties: {
      gpuHours: { type: 'number', description: 'The GPU hours the whole plan needs.' },
      why: { type: 'string', description: 'What they are for, in a sentence or two: the person reads it on the card.' },
    },
  },
  async run(a, ctx) {
    try {
      const db = ctx.deps.db;
      if ((a.gpuHours === undefined || a.gpuHours === null) && !a.why) {
        const b = budgetNow(db, ctx.key);
        return json(b ? { budget: { gpuHours: b.gpuHours, why: b.why, used: b.used, reserved: b.reserved, left: b.left, since: new Date(b.at).toISOString() } } : { budget: null, note: 'This session has no budget: ask for one with gpuHours and why.' });
      }
      const gpuHours = Number(a.gpuHours);
      if (!Number.isFinite(gpuHours) || gpuHours <= 0 || gpuHours > 1_000_000) return failed('gpuHours: how many GPU hours the plan needs, a number above 0.');
      const why = typeof a.why === 'string' ? a.why.trim().slice(0, 1000) : '';
      if (!why) return failed('Say why: the person reads it on the card.');
      if (modeOf(ctx) === 'read-only') return failed('This session only reads (Plan mode, or read-only): tell the user what you would run instead, or ask them to switch the mode.');
      if (asksNothing(ctx)) return json({ budget: null, note: 'This session’s runs start without asking already, so no budget is needed. The limit on agents’ GPU hours, when the person set one, still holds.' });
      const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
      if (!adapter) return failed('Nobody can allow it now (the session is not running in the app). Ask the user in your reply.');
      const before = budgetNow(db, ctx.key);
      const card: ApprovalRequest = {
        id: `exp-${crypto.randomBytes(6).toString('hex')}`,
        kind: 'other',
        prose: true,
        // Short, so a phone shows all of it: whose runs it is for is said in the line under it.
        title: `Allow ${gpuHoursWords(gpuHours)} of runs?`,
        detail: [plain(why), 'This session’s runs that stay within it start without asking you again.', ...(before ? [`It replaces the budget of ${gpuHoursWords(before.gpuHours)} given before.`] : [])].join('\n\n'),
        options: [
          { id: 'accept', label: 'Allow', style: 'primary' },
          { id: 'deny', label: 'Don’t', style: 'default' },
        ],
        createdAt: Date.now(),
      };
      const limit = AbortSignal.timeout(570_000);
      const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit });
      if (!answer) return failed(limit.aborted ? 'The user did not answer the card in time. Ask them in your reply.' : 'The card was withdrawn before the user answered.');
      if (answer.decision !== 'accept') return failed(`The user said no${answer.message?.trim() ? `: “${answer.message.trim()}”` : '.'} Your budget is ${before ? `still ${gpuNum(before.gpuHours)} GPU hours` : 'none'}.`);
      giveBudget(db, ctx.key, gpuHours, why);
      const b = budgetNow(db, ctx.key)!;
      return json({ allowed: true, budget: { gpuHours: b.gpuHours, used: b.used, reserved: b.reserved, left: b.left } });
    } catch (e) {
      return failed(e);
    }
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

/** The latest finished score of the same seal from each other folder or branch, five at most: what a score with no baseline can be compared with. */
function otherScores(db: RunCtx['deps']['db'], s: EvalScore) {
  const seen = new Set<string>();
  return listScores(db, s.evaluation, ['score'])
    .filter((x) => x.status === 'done' && x.seal === s.seal && (x.folder !== s.folder || x.branch !== s.branch))
    .filter((x) => !seen.has(`${x.folder}\n${x.branch}`) && !!seen.add(`${x.folder}\n${x.branch}`))
    .slice(0, 5)
    .map((x) => ({ score: x.id, ...(x.branch ? { branch: x.branch } : {}), folder: x.folder, ...(x.commit ? { commit: x.commit.slice(0, 10) } : {}), ...(x.endedAt ? { at: new Date(x.endedAt).toISOString() } : {}), mean: x.mean, std: x.std, seeds: x.seeds }));
}

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
    'Read a project’s evaluations (Experiments → Evaluations): one scoring command and one number, sealed so every run is scored the same way. Gives, for the folder (yours unless cwd says another): each evaluation’s id, name, command, metric, which way is better, seeds, the files it protects, whether they are as sealed there (sealed: { ok, changed }), its baseline (null until the person measures it on the evaluation’s page: it is theirs to measure, not yours), its 5 latest scores (mean, std, against the baseline, folder, branch, when) and whether it has a final test (never that test’s numbers). With score, that score.',
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
  description: `Score work with a project’s evaluation: the app checks that the sealed files are unchanged, runs the sealed command itself (one run for each seed, queued like experiment_run’s) in your folder or a git worktree of the same repository, and reads the number. Report these numbers, not your own. Waits up to wait minutes (default ${DEFAULT_WAIT_MIN}, at most ${MAX_WAIT_MIN}) and gives the score (id, status, runs, page) with values, mean, std and the comparison with the baseline when it ended in time; else read it later with evaluation_get and its id. Refused while the files the evaluation protects differ, and, for an evaluation that takes a GPU, while the person’s limit on agents’ GPU hours is reached (tell them); one already in line when it is reached has its runs held (the answer says so). Its answer’s gpuHours is what its runs may use (from the evaluation’s time limit, or its last run). Never start runs on the user’s GPUs unless they asked for it.`,
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
      const job = await cleanJob(db, { command: ev.command, cwd: root, gpus: ev.gpus, hours: ev.hours, where: ev.where });
      refuseAtCeiling(db, job);
      const cost = costOf(db, job, { runs: ev.command.includes('{seed}') ? ev.seeds.length : 1 });
      const no = await mayRun(ctx, `Score “${ev.name}”`, [ev.command, `# in ${root}${ev.command.includes('{seed}') ? ` · seeds ${ev.seeds.join(', ')}` : ''}`].join('\n'), cost);
      if (no) return failed(no);
      let started: EvalScore;
      try {
        started = await startScore(ctx.deps, ev.id, { kind: 'score', folder: root, by: ctx.step ? { who: 'app' } : { who: 'agent', session: ctx.key } });
      } finally {
        cost.done?.();
      }
      const minutes = a.wait === undefined || a.wait === null || a.wait === '' ? DEFAULT_WAIT_MIN : Math.min(Math.max(Number(a.wait) || 0, 0), MAX_WAIT_MIN);
      const ms = Math.min(minutes * 60_000, Math.max(0, began + CALL_MS - Date.now()));
      // Runs the ceiling on agents' GPU hours holds are not waited for: it may be hours until the person lets them go.
      for (const id of started.runs) {
        const r = getRun(db, id);
        if (r) heldNow(ctx.deps, r);
      }
      const heldRuns = () => {
        const open = started.runs.map((id) => getRun(db, id)).filter((r): r is RunRecord => !!r && ACTIVE.includes(r.status));
        return open.length && open.every((r) => r.held) ? open : null;
      };
      const until = Date.now() + ms;
      let s = started;
      do {
        s = (await waitScore(ctx.deps, started.id, Math.max(0, Math.min(2000, until - Date.now())), ctx.signal)) ?? s;
      } while ((s.status === 'waiting' || s.status === 'running') && !heldRuns() && Date.now() < until && !ctx.signal?.aborted);
      const held = heldRuns();
      const over = s.status === 'done' || s.status === 'failed' || s.status === 'stopped';
      const based = !!listed(db, mustEvaluation(db, ev.id)).baselineScore;
      const others = based ? [] : otherScores(db, s);
      return json({
        evaluation: { id: ev.id, name: ev.name, metric: ev.metric, better: ev.better },
        gpuHours: cost.hours,
        ...scoreBrief(s),
        seeds: s.seeds,
        runs: s.runs,
        ...(s.lent ? { lent: s.lent } : {}),
        page: evalPage(ev.id, s.id),
        ...(based ? {} : { noBaseline: `There is no baseline yet, so the score is not compared with one: only the person measures it, on the evaluation’s page (${evalPage(ev.id)}).${others.length ? ' The latest scores of the same seal from other folders or branches are under others: compare with those yourself, without running them again.' : ''}` }),
        ...(others.length ? { others } : {}),
        ...(over ? {} : { note: `Still ${s.status}: read it later with evaluation_get, score "${s.id}".` }),
        ...(held ? { held: held.length, why: held[0].why, note: `${HELD_NOTE} Read the score later with evaluation_get, score "${s.id}".` } : {}),
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
      ? `**Final test** (only you run it):\n\n${fenced(spec.final.command)}\n\n**Held-out data:** ${spec.final.heldOut ? code(spec.final.heldOut) : 'none'}${testReadable(spec.cwd, spec.final.heldOut) ? `\n\n${TEST_READABLE}` : ''}`
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
      return json({ created: true, id: ev.id, name: ev.name, folder: ev.cwd, command: ev.command, metric: ev.metric, better: ev.better, seeds: ev.seeds, protect: ev.protect, seal: ev.seal, finalTest: { set: !!ev.final, runs: 0, ...(ev.final ? { command: ev.final.command } : {}) }, ...(ev.final && testReadable(ev.cwd, ev.final.heldOut) ? { note: TEST_READABLE } : {}), page: evalPage(ev.id) });
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
  ...(e.when ? { when: e.when } : {}),
  ...(e.waits ? { waits: e.waits } : {}),
  ...(e.waits?.startsWith(HELD_WHY) ? { note: HELD_NOTE } : {}),
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
  description: `Start Evolve on files a project’s evaluation scores: the app tries many small changes to them (the helper model proposes each, from the best versions so far), scores every one with the evaluation’s sealed command in worktrees of its own, and keeps the best; the person’s checkout is never changed, and they take the best onto a branch from its page. Use it when someone wants a file made better against an evaluation by search (a heuristic, a scoring function, a prompt, a slow routine) rather than trying changes one by one. The files must be committed, unchanged since, text, ${EVOLVE.files} at most and ${EVOLVE.bytes / 1024} KB in all, and none of them protected by the evaluation. The person allows it on a card, which says the most GPU hours it may use when the evaluation has a time limit (also gpuHours in the answer). Refused, for an evaluation that takes a GPU, while the person’s limit on agents’ GPU hours is reached (tell them); one already going has its scores’ runs held at the limit and waits (evolve_get’s waits says so) until the person lets it go on from its page or there is room again. Returns the evolution (read how it goes with evolve_get) and its page.`,
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
      when: {
        type: 'string',
        enum: ['night', 'now'],
        description:
          '"night": it works only in the night hours (Experiments → Where runs go), over as many nights as it needs: its scores are night runs, nothing new is tried by day, hours counts night time only, and the user hears in the morning how far it got. Leave it out to start now.',
      },
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
      const body = { evaluation, from, files: a.files, aim: a.aim, candidates: a.candidates, hours: a.hours, atOnce: a.atOnce, when: a.when };
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
        ...(s.when ? [`# ${tonight(ctx, 'local')}`] : []),
      ].join('\n');
      const job = await cleanJob(db, { command: ev.command, cwd: s.from, gpus: ev.gpus, hours: ev.hours, where: ev.where });
      refuseAtCeiling(db, job);
      // At most: the start with every seed, and each change with the first seed and then with all of them.
      const seeds = ev.command.includes('{seed}') ? ev.seeds.length : 1;
      const runs = seeds + s.candidates * (seeds > 1 ? 1 + seeds : 1);
      const hours: GpuHours = !job.gpus || job.hours ? gpuHoursOf(db, job, runs) : {};
      const cost: Cost = { hours, line: costLine(hours, { gpus: job.gpus ?? 0, hours: job.hours, runs }), asks: true };
      const no = await mayRun(ctx, `Evolve ${s.files.length === 1 ? s.files[0] : `${s.files.length} files`} with “${ev.name}”`, detail, cost);
      if (no) return failed(no);
      const e = await startEvolution(ctx.deps, body, { who: 'agent', session: ctx.key });
      return json({ evolution: evolveBrief(e), gpuHours: hours, ...(e.when ? { starts: tonight(ctx, 'local') } : {}), note: 'It starts by scoring the start with all seeds; read how it goes with evolve_get. The person takes the best onto a branch from its page.', page: evolvePage(e.id) });
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
  // Waiting for hours is a step's; proposing an evaluation, starting an evolution and asking for a budget are a session's, where a card can ask.
  return [runTool(ctx), tryTool(ctx), sweepTool(ctx), LIST, GET, STOP, TABLE, DESCRIBE, NOTE, EVAL_GET, EVAL_SCORE, ...(ctx.step ? [WAIT] : [BUDGET, EVAL_PROPOSE, EVOLVE_START, EVOLVE_GET])];
}

export const SPAWN_NOTE =
  'Experiments (Experiments in the app’s sidebar): long training or evaluation goes to experiment_run (many settings: experiment_sweep) instead of running in the foreground: it waits for free GPUs, runs on its own and is recorded. Read runs with experiment_list and experiment_get; make results tables (mean ± std over seeds, significance, LaTeX) with experiment_table. When you start the first runs of an experiment (its group), or what it tests changes, give it a title, a short description and a category with experiment_describe, so people see what it is and find it by searching. A failed or stopped run you start again says which one (experiment_run’s again or replaces), so the attempts show as one; experiment_note keeps one line about a run when a later reader must know something about it. Never start runs on the user’s GPUs unless they asked you to. Give each run on a GPU a time limit (hours), so the person sees the GPU hours it may use before saying yes; for a plan of several runs, ask once for their sum with experiment_budget. A run answered as held means agents have used the GPU hours the person allows them: tell them, and start no more. Runs that are exploratory and can wait (controls, wider sweeps, “also try” ideas) go to the night with when: "night" (and report: true), so the person’s GPUs are theirs by day. When such runs have ended, tell the person what ran, what it showed and what you need them to decide, as choices. A project may keep an evaluation (Experiments → Evaluations): one scoring command and one number, sealed so every run is scored the same way. When the folder you work in has one (evaluation_get), judge your work by evaluation_score and report its numbers, not your own; never change the files it protects (a score is refused while they differ) and never run or read its final test: that is the person’s. When someone wants results they can trust and has none, offer to set one up with evaluation_propose. When a folder has an evaluation and the person wants a file made better against it by search (a heuristic, a scoring function, a prompt, a slow routine), offer evolve_start rather than trying changes one by one by hand: it tries many small changes, scores each with the evaluation and keeps the best (evolve_get says how it goes); never point it at files the evaluation protects. Before you report that one thing beats another, try to break the result first (the break-the-result skill).';
