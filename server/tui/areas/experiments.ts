// `hydor experiments`: the runs the Experiments page lists (training and evaluation jobs waiting for a GPU, running,
// done): list, look at one, stop one. Starting runs and sweeps is for agents and the page (`hydor open experiments`).
import type { RunRecord, RunStatus } from '../../../shared/experiments.ts';
import { enc } from '../client.ts';
import { duration, tildify, timeAgo } from '../term.ts';
import { choose, fields, flag, mark, num, str, table, type Area, type Ctx } from './kit.ts';

const run = { name: 'run', kind: 'experiment', pick: true } as const;
const STATUSES: RunStatus[] = ['queued', 'waiting', 'starting', 'running', 'done', 'failed', 'stopped', 'lost'];

const markOf = (p: Ctx['look']['p'], s: RunStatus) =>
  s === 'running' || s === 'starting' ? mark(p, 'busy') : s === 'done' ? mark(p, 'done') : s === 'failed' || s === 'lost' ? mark(p, 'error') : s === 'waiting' ? mark(p, 'attention') : mark(p, 'off');
const nameOf = (r: RunRecord) => r.name || r.command.replace(/\s+/g, ' ');

async function findRun(ctx: Ctx, given: string | undefined): Promise<RunRecord> {
  const { runs } = await ctx.conn.api<{ runs: RunRecord[] }>('GET', '/api/experiments/runs?limit=1000');
  return choose(ctx, runs, given, {
    id: (r) => r.id,
    names: (r) => [r.name, r.command],
    what: 'run',
    hint: 'hydor experiments lists them',
    label: nameOf,
    detail: (r) => `${r.status} · ${timeAgo(r.createdAt)}`,
  });
}

const metrics = (m: Record<string, number> | undefined) =>
  m
    ? Object.entries(m)
        .map(([k, v]) => `${k}=${Number.isInteger(v) ? v : Number(v.toPrecision(4))}`)
        .join('  ')
    : undefined;

export const experiments: Area = {
  name: 'experiments',
  aliases: ['experiment', 'runs'],
  summary: 'Training and evaluation runs',
  help: 'Runs wait for a GPU (or a cluster’s queue), run, and are kept as records with their log and metrics. Name one by its id, its name or the start of either. Starting runs and sweeps, and making results tables, are for agents and the page: hydor open experiments.',
  group: 'work',
  verbs: [
    {
      name: 'list',
      args: [],
      options: {
        status: { type: 'string', value: '<status>', desc: 'Only these (comma-separated), or active', values: ['active', ...STATUSES] },
        group: { type: 'string', value: '<experiment>', desc: 'Only an experiment’s runs' },
        query: { type: 'string', value: '<words>', desc: 'Words in the name, command or id' },
      },
      summary: 'Runs, newest first',
      examples: ['hydor experiments', 'hydor experiments --status active', 'hydor experiments --group bm25-sweep -n 50'],
      async run(ctx, _a, v) {
        const q = new URLSearchParams({ limit: String(ctx.o.limit ?? 25) });
        if (str(v, 'status')) q.set('status', str(v, 'status')!);
        if (str(v, 'group')) q.set('group', str(v, 'group')!);
        if (str(v, 'query')) q.set('q', str(v, 'query')!);
        const r = await ctx.conn.api<{ runs: RunRecord[] }>('GET', `/api/experiments/runs?${q}`);
        if (ctx.o.json) return ctx.json(r);
        if (!r.runs.length) return ctx.out('No runs.');
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            r.runs.map((x) => [markOf(p, x.status), p.dim(x.id), nameOf(x), p.dim(x.group ?? ''), x.status, p.dim(timeAgo(x.endedAt ?? x.startedAt ?? x.createdAt))]),
            { head: ['', 'ID', 'RUN', 'EXPERIMENT', 'STATE', 'WHEN'], grow: 2 },
          ),
        );
      },
    },
    {
      name: 'show',
      args: [run],
      options: { log: { type: 'boolean', desc: 'Show the end of its log too' }, lines: { type: 'string', value: '<n>', desc: 'How many log lines (default 40)' } },
      summary: 'One run: command, state, metrics, events',
      examples: ['hydor experiments show a1b2', 'hydor experiments show a1b2 --log --lines 100'],
      async run(ctx, [given], v) {
        const found = await findRun(ctx, given);
        const lines = num(v, 'lines', 1) ?? 40;
        const r = await ctx.conn.api<{ run: RunRecord; log?: string }>('GET', `/api/experiments/runs/${enc(found.id)}?lines=${lines}&log=${flag(v, 'log') ? 1 : 0}`);
        if (ctx.o.json) return ctx.json(r);
        const x = r.run;
        const { p } = ctx.look;
        const ran = x.startedAt ? duration((x.endedAt ?? Date.now()) - x.startedAt) : undefined;
        ctx.out([
          `${markOf(p, x.status)} ${p.bold(nameOf(x))}`,
          ...fields(ctx, [
            ['Id', x.id],
            ['State', `${x.status}${x.why ? ` (${x.why})` : ''}`],
            ['Experiment', x.group],
            ['Command', x.command],
            ['Folder', tildify(x.cwd, ctx.look.home)],
            ['Where', x.where && x.where !== 'local' ? x.where : x.machine?.name],
            ['GPUs', x.gpus ? String(x.gpus) : undefined],
            ['Started', x.startedAt ? `${timeAgo(x.startedAt)}${ran ? `, ran ${ran}` : ''}` : undefined],
            ['Exit code', x.exitCode == null ? undefined : String(x.exitCode)],
            ['Commit', x.commit ? `${x.commit.slice(0, 10)}${x.branch ? ` on ${x.branch}` : ''}${x.dirty ? ' + changes' : ''}` : undefined],
            ['Metrics', metrics(x.metrics?.last)],
            ['Best', metrics(x.metrics?.best)],
            ['Tags', x.tags?.join(', ')],
            [
              'Events',
              (x.events ?? [])
                .slice(-5)
                .map((e) => `${timeAgo(e.at)}: ${e.kind} ${e.text}`.trim())
                .join('\n'),
            ],
          ]),
          ...(flag(v, 'log') && r.log ? ['', p.dim('Log'), ...r.log.replace(/\n$/, '').split('\n')] : []),
        ]);
      },
    },
    {
      name: 'stop',
      args: [run],
      options: { why: { type: 'string', value: '<words>', desc: 'Why (kept with the run)' } },
      summary: 'Stop a run (in line: at once; running: Ctrl-C)',
      help: 'A run in line is taken out at once; a running one gets Ctrl-C, then something harder after 10 seconds, and ends as stopped.',
      examples: ['hydor experiments stop a1b2', 'hydor experiments stop a1b2 --why "wrong learning rate"'],
      async run(ctx, [given], v) {
        const x = await findRun(ctx, given);
        const r = await ctx.conn.api<{ run: RunRecord }>('POST', `/api/experiments/runs/${enc(x.id)}/stop`, str(v, 'why') ? { why: str(v, 'why') } : {});
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Stopping “${nameOf(x)}”.`);
      },
    },
  ],
};
