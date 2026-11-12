// `hydor apps`: the Apps page. List (yours and the ready-made ones), show (its form), run (fields as `name=value` words or
// --input JSON, or asked one by one on a terminal; it waits for the answer and prints it, with what it cost), runs, run-show
// and remove. `hydor app …` (singular: new, folder, dev, try, export, import of an app's files) is a command of its own and stays.
// Running an app starts agent work and costs money, so it is never run for a test of the command against a live app.
import fs from 'node:fs';
import path from 'node:path';
import { cellText, isActive, type AnswerField, type AppField, type AppRun } from '../../../shared/apps.ts';
import { ApiError, enc } from '../client.ts';
import { money, timeAgo, truncate } from '../term.ts';
import { Cancelled, choose, fields, flag, markdown, mark, num, str, table, UsageError, type Area, type Ctx, type Values } from './kit.ts';

/** How often a run is looked at while waiting for it (the tests make it short). */
export const poll = { ms: 1500 };

const APP_HINT = 'hydor apps lists them';
const app = { name: 'app', kind: 'app', pick: true } as const;

/** What the list endpoint says of an app or a ready-made one. */
interface Entry {
  /** What the API calls it by: an app's id, or tpl:<id>. */
  id: string;
  /** The address: its slug, or tpl:<id>. */
  slug: string;
  name: string;
  description?: string;
  ready: boolean;
  installed: boolean;
  runs: number;
  lastRunAt?: number;
  needsKey?: boolean;
}

/** Your apps, then the ready-made ones. */
async function entries(ctx: Ctx): Promise<{ list: Entry[]; raw: any }> {
  const raw = await ctx.conn.api<any>('GET', '/api/apps');
  const mine: Entry[] = (raw.apps ?? []).map((a: any) => ({
    id: a.id,
    slug: a.slug ?? a.id,
    name: a.name,
    description: a.description,
    ready: false,
    installed: true,
    runs: a.uses ?? a.usage?.runs ?? 0,
    lastRunAt: a.lastRunAt,
    needsKey: a.needsKey,
  }));
  const ready: Entry[] = (raw.templates ?? []).map((t: any) => ({
    id: `tpl:${t.id}`,
    slug: `tpl:${t.id}`,
    name: t.name,
    description: t.description,
    ready: true,
    installed: t.installed !== false,
    runs: 0,
    lastRunAt: t.lastRunAt,
    needsKey: t.needsKey,
  }));
  return { list: [...mine, ...ready], raw };
}

/** The app named by its address, id or name (or tpl:<id> for a ready-made one), or picked on a terminal. */
async function findApp(ctx: Ctx, given: string | undefined): Promise<Entry> {
  const { list } = await entries(ctx);
  const g = (given ?? '').toLowerCase();
  const wanted = g && !g.startsWith('tpl:') ? list.filter((e) => !e.ready || e.slug.slice(4) === g || e.name.toLowerCase() === g) : list;
  return choose(ctx, wanted.length ? wanted : list, given, {
    id: (e) => e.slug,
    names: (e) => [e.id, e.name, e.slug.replace(/^tpl:/, '')],
    what: 'app',
    hint: APP_HINT,
    label: (e) => e.name,
    detail: (e) => (e.ready ? 'ready-made' : e.slug),
  });
}

// ---- the form ------------------------------------------------------------------------------------------------------

/** The form's fields and the answer's, of an app or a ready-made one, from `GET /api/apps/:id`. */
async function recipeOf(ctx: Ctx, e: Entry): Promise<{ detail: any; recipe: any }> {
  const detail = await ctx.conn.api<any>('GET', `/api/apps/${enc(e.id)}`);
  return { detail, recipe: detail.app ?? detail.template ?? {} };
}

const YES = /^(yes|y|true|on|1)$/i;
const NO = /^(no|n|false|off|0)$/i;

/** One field's value from what was typed: a number as a number, a yes/no as a boolean, a file by `@path`. */
function valueOf(f: AppField, text: string, files: Record<string, { name: string; data: string }>): string | number | boolean | undefined {
  if (f.type === 'number') {
    const n = Number(text);
    if (!text.trim() || !Number.isFinite(n)) throw new UsageError(`${f.label} (${f.id}) takes a number (it was “${text}”)`);
    return n;
  }
  if (f.type === 'yesno') {
    if (YES.test(text.trim())) return true;
    if (NO.test(text.trim())) return false;
    throw new UsageError(`${f.label} (${f.id}) takes yes or no (it was “${text}”)`);
  }
  if (f.type === 'choice' && f.options?.length && !f.multi) {
    const hit = f.options.find((o) => o.toLowerCase() === text.trim().toLowerCase()) ?? f.options.filter((o) => o.toLowerCase().startsWith(text.trim().toLowerCase()));
    const one = typeof hit === 'string' ? hit : hit.length === 1 ? hit[0] : undefined;
    if (!one) throw new UsageError(`${f.label} (${f.id}) takes one of: ${f.options.join(', ')} (it was “${text}”)`);
    return one;
  }
  if (f.type === 'file') {
    const p = text.replace(/^@/, '');
    let data: Buffer;
    try {
      data = fs.readFileSync(path.resolve(p));
    } catch {
      throw new UsageError(`${f.label} (${f.id}) takes the path of a file: cannot read ${p}`);
    }
    files[f.id] = { name: path.basename(p), data: data.toString('base64') };
    return undefined;
  }
  return text;
}

/** A field named as typed: its id, its label, or the start of either. */
function fieldNamed(list: AppField[], given: string): AppField {
  const g = given.toLowerCase();
  const exact = list.filter((f) => f.id.toLowerCase() === g || f.label.toLowerCase() === g);
  const some = exact.length ? exact : list.filter((f) => f.id.toLowerCase().startsWith(g) || f.label.toLowerCase().startsWith(g));
  if (some.length === 1) return some[0];
  throw new UsageError(
    some.length
      ? `“${given}” fits ${some.map((f) => f.id).join(', ')}: give more of it`
      : `The app has no field “${given}”${list.length ? `: its fields are ${list.map((f) => f.id).join(', ')}` : ' (it takes no answers)'}`,
  );
}

/** What to send as the run's answers: the `name=value` words, --input, then (on a terminal) what is still needed, asked. */
async function inputsOf(ctx: Ctx, words: string[], v: Values, list: AppField[]) {
  const inputs: Record<string, string | number | boolean> = {};
  const files: Record<string, { name: string; data: string }> = {};
  const raw = str(v, 'input');
  if (raw) {
    let given: unknown;
    try {
      given = JSON.parse(raw);
    } catch {
      throw new UsageError('--input takes the answers as a JSON object, such as \'{"city":"Lisbon"}\'');
    }
    if (!given || typeof given !== 'object' || Array.isArray(given)) throw new UsageError('--input takes the answers as a JSON object, such as \'{"city":"Lisbon"}\'');
    for (const [k, x] of Object.entries(given)) inputs[fieldNamed(list, k).id] = x as string | number | boolean;
  }
  for (const w of words) {
    const i = w.indexOf('=');
    if (i < 1) throw new UsageError(`Answers are written field=value (“${w}” is not): ${ctx.usage}`);
    const f = fieldNamed(list, w.slice(0, i));
    const x = valueOf(f, w.slice(i + 1), files);
    if (x !== undefined) inputs[f.id] = x;
  }
  // What the form still needs: asked one by one on a terminal, else said.
  const need = list.filter((f) => f.required && inputs[f.id] === undefined && files[f.id] === undefined && !f.default);
  if (need.length && !ctx.interactive) throw new UsageError(`The app needs ${need.map((f) => `${f.id} (${f.label})`).join(', ')}: add ${need.map((f) => `${f.id}=<value>`).join(' ')}`);
  for (const f of need) {
    let text: string | null;
    if (f.type === 'choice' && f.options?.length)
      text = await ctx.pick(
        `${f.label}${f.help ? `: ${f.help}` : ''}`,
        f.options.map((o) => ({ label: o, value: o })),
      );
    else if (f.type === 'yesno')
      text = await ctx.pick(f.label, [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ]);
    else text = await ctx.ask(`${f.label}${f.help ? ` (${f.help})` : ''}${f.type === 'file' ? ' (a file’s path)' : ''}: `);
    if (text === null || text === '') throw new Cancelled();
    const x = valueOf(f, text, files);
    if (x !== undefined) inputs[f.id] = x;
  }
  return { inputs, files };
}

// ---- the answer ------------------------------------------------------------------------------------------------------

/** An app's answer, field by field: texts as Markdown, lists as bullets, tables as columns. */
function answerLines(ctx: Ctx, answer: AnswerField[], result: Record<string, unknown>): string[] {
  const { p } = ctx.look;
  const out: string[] = [];
  const known = new Set(answer.map((a) => a.id));
  const items = [
    ...answer,
    ...Object.keys(result)
      .filter((k) => !known.has(k))
      .map((k) => ({ id: k, label: k, type: 'text' as const })),
  ];
  for (const a of items) {
    const x = result[a.id];
    if (x === undefined || x === null || x === '') continue;
    if (out.length) out.push('');
    if (a.type === 'markdown' || (a.type === 'text' && typeof x === 'string' && (x.includes('\n') || x.length > 80))) out.push(p.bold(a.label), ...markdown(ctx, String(x)));
    else if (a.type === 'list' && Array.isArray(x)) out.push(p.bold(a.label), ...x.map((i) => `  • ${cellText(i)}`));
    else if (a.type === 'table' && Array.isArray(x)) {
      const cols = (a as AnswerField).columns ?? Object.keys((x[0] as object) ?? {}).map((k) => ({ id: k, label: k }));
      out.push(
        p.bold(a.label),
        ...table(
          ctx,
          (x as Record<string, unknown>[]).map((r) => cols.map((c) => cellText(r?.[c.id]))),
          { head: cols.map((c) => c.label.toUpperCase()) },
        ).map((l) => `  ${l}`),
      );
    } else if (a.type === 'media' && Array.isArray(x)) out.push(p.bold(a.label), ...x.map((m: any) => `  • ${[m?.caption, m?.src].filter(Boolean).join(' ')}`));
    else out.push(`${p.bold(a.label)}  ${cellText(x)}`);
  }
  return out;
}

/** A finished (or failed) run: its answer or reply, its cost, its trouble. */
function runLines(ctx: Ctx, run: AppRun, answer: AnswerField[], extra?: { waiting?: string }): string[] {
  const { p } = ctx.look;
  const out: string[] = [];
  const result = run.result && Object.keys(run.result).length ? run.result : undefined;
  if (result) out.push(...answerLines(ctx, answer, result));
  else if (run.reply) out.push(...markdown(ctx, run.reply));
  if (run.status === 'failed' || run.status === 'stopped') out.push('', p.red(`${run.status === 'stopped' ? 'Stopped' : 'Failed'}${run.error ? `: ${run.error}` : '.'}`));
  if (extra?.waiting) out.push('', p.yellow(`It is waiting for an answer: ${extra.waiting}`));
  const bits = [
    run.costUsd ? `cost ${money(run.costUsd)}` : undefined,
    run.model,
    run.endedAt && run.startedAt ? `${Math.max(1, Math.round((run.endedAt - run.startedAt) / 1000))} s` : undefined,
  ].filter(Boolean);
  if (bits.length) out.push('', p.dim(bits.join(' · ')));
  return out;
}

/** A run's id on its own line for scripts, and how to look at it again. */
const again = (ctx: Ctx, run: AppRun) => ctx.look.p.dim(`Run ${run.id}: hydor apps run-show ${run.id}`);

const RUN_MARK = { queued: 'busy', starting: 'busy', running: 'busy', waiting: 'attention', done: 'done', failed: 'error', stopped: 'off' } as const;

export const apps: Area = {
  name: 'apps',
  summary: 'Apps: small tools an agent runs from a form',
  help: 'Your apps and the ready-made ones (tpl:<id>). Name one by its address, its name or the start of either; on a terminal, leave it out to pick from a list. Running an app starts agent work and costs what its agent costs. The files of an app (writing one in your editor, trying it, carrying it to another computer) are the commands of hydor app (singular): app new, folder, dev, try, export, import.',
  group: 'tools',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'Your apps and the ready-made ones',
      examples: ['hydor apps', 'hydor apps --json'],
      async run(ctx) {
        const { list, raw } = await entries(ctx);
        if (ctx.o.json) return ctx.json(raw);
        if (!list.length) return ctx.out('No apps yet: hydor app new <name> makes one in files, or ask an agent to.');
        const { p } = ctx.look;
        const row = (e: Entry) => [
          e.ready && !e.installed ? mark(p, 'off') : mark(p, e.needsKey ? 'attention' : 'on'),
          p.bold(e.name),
          p.dim(e.slug),
          e.ready ? p.dim(e.installed ? 'ready-made' : 'ready-made, not installed') : '',
          e.runs ? p.dim(`${e.runs} runs`) : '',
          p.dim(timeAgo(e.lastRunAt)),
          p.dim(e.description ?? ''),
        ];
        ctx.out(table(ctx, list.map(row), { head: ['', 'APP', 'ADDRESS', '', 'RUNS', 'LAST', ''], grow: 6 }));
        if (list.some((e) => e.needsKey)) ctx.out(p.dim('A yellow mark: it needs a key the vault lacks (add it on the app’s page).'));
      },
    },
    {
      name: 'show',
      args: [app],
      summary: 'One app: its form, its answer, its keys',
      examples: ['hydor apps show trip-planner', 'hydor apps show tpl:deep-research --json'],
      async run(ctx, [given]) {
        const e = await findApp(ctx, given);
        const { detail, recipe } = await recipeOf(ctx, e);
        if (ctx.o.json) return ctx.json(detail);
        const { p } = ctx.look;
        const form: AppField[] = recipe.fields ?? [];
        const secrets: { name: string; have?: boolean; optional?: boolean }[] = detail.secrets ?? [];
        ctx.out([
          p.bold(recipe.name ?? e.name),
          ...fields(ctx, [
            ['Address', e.slug],
            ['About', recipe.description],
            [
              'Runs with',
              e.ready
                ? 'Claude Code unless you say otherwise'
                : [recipe.agent === 'acp' ? (recipe.acpAgent === 'console' ? 'custom' : recipe.acpAgent) : recipe.agent, recipe.model].filter(Boolean).join(' · '),
            ],
            ['Installed', detail.installed === false ? 'no (a ready-made app, not installed)' : undefined],
            ['Keys', secrets.length ? secrets.map((s) => `${s.name} ${s.have ? 'saved' : p.yellow('missing')}`).join(', ') : undefined],
            ['Used', detail.usage?.runs ? `${detail.usage.runs} runs today${detail.usage.spent ? `, ${money(detail.usage.spent)}` : ''}` : undefined],
            ['Page', `${ctx.conn.base}/apps/${enc(e.slug)}`],
          ]),
        ]);
        ctx.out([
          '',
          p.bold('Form'),
          ...(form.length
            ? table(
                ctx,
                form.map((f) => [
                  p.bold(f.id),
                  f.label,
                  p.dim(f.type + (f.options?.length ? `: ${f.options.join(' | ')}` : '')),
                  f.required ? p.yellow('required') : p.dim(f.default ? `default ${f.default}` : 'optional'),
                  p.dim(f.help ?? ''),
                ]),
                { grow: 4 },
              ).map((l) => `  ${l}`)
            : ['  It takes no answers: hydor apps run ' + e.slug]),
        ]);
        const answer: AnswerField[] = recipe.answer ?? [];
        if (answer.length)
          ctx.out([
            '',
            p.bold('Answer'),
            ...table(
              ctx,
              answer.map((a) => [a.id, a.label, p.dim(a.type)]),
              { grow: 2 },
            ).map((l) => `  ${l}`),
          ]);
        ctx.out([
          '',
          p.dim(
            `Run it: hydor apps run ${e.slug}${form
              .filter((f) => f.required)
              .map((f) => ` ${f.id}=<${f.label.toLowerCase()}>`)
              .join('')}`,
          ),
        ]);
      },
    },
    {
      name: 'run',
      args: [app, { name: 'answer', kind: 'text', optional: true, rest: true }],
      options: {
        input: { type: 'string', value: '<json>', desc: 'The answers as a JSON object' },
        'no-wait': { type: 'boolean', desc: 'Start it and print its run id, do not wait' },
        timeout: { type: 'string', value: '<seconds>', desc: 'Stop waiting after this long (default 900)' },
      },
      summary: 'Run an app and print its answer',
      help: 'The form’s answers are written field=value after the app (a field by its id, its label or the start of either; a file as field=@path), or as --input JSON; on a terminal what a required field still lacks is asked. It starts agent work and costs what it costs (printed with the answer). It waits for the answer: Ctrl+C stops waiting, not the run (hydor apps run-show <run> looks again). A ready-made app runs with Claude Code.',
      examples: ['hydor apps run trip-planner destination=Lisbon days=5', 'hydor apps run quiz --input \'{"topic":"GPUs"}\'', 'hydor apps run summarise file=@notes.pdf --no-wait'],
      async run(ctx, [given, ...words], v) {
        const e = await findApp(ctx, given);
        if (e.ready && !e.installed) throw new UsageError(`“${e.name}” is a ready-made app that is not installed: install it on the Apps page first`);
        const { recipe } = await recipeOf(ctx, e);
        const { inputs, files } = await inputsOf(ctx, words, v, recipe.fields ?? []);
        const timeout = (num(v, 'timeout', 1) ?? 900) * 1000;
        let r: { run: AppRun };
        try {
          r = await ctx.conn.api<{ run: AppRun }>('POST', `/api/apps/${enc(e.id)}/runs`, { inputs, ...(Object.keys(files).length ? { files } : {}) });
        } catch (x) {
          const keys = (x as { secrets?: { name: string }[] }).secrets;
          if (x instanceof ApiError && x.status === 409 && /key|secret/i.test(x.message))
            throw new ApiError(409, `${x.message}\nAdd the keys it needs on its page: ${ctx.conn.base}/apps/${enc(e.slug)}${keys ? ` (${keys.map((k) => k.name).join(', ')})` : ''}`);
          throw x;
        }
        if (flag(v, 'no-wait')) return ctx.o.json ? ctx.json(r) : ctx.out(`Started “${e.name}”: run ${r.run.id} (hydor apps run-show ${r.run.id})`);
        const { p } = ctx.look;
        if (!ctx.o.json && !ctx.o.quiet) ctx.out(p.dim(`Running “${e.name}”… (run ${r.run.id})`));
        const end = Date.now() + timeout;
        let last: { run: AppRun; progress?: any; recipe?: any } = r;
        while (last.run.status !== 'waiting' && isActive(last.run.status)) {
          if (Date.now() > end) throw new ApiError(0, `Still running after ${Math.round(timeout / 1000)} s: hydor apps run-show ${r.run.id} looks again`);
          await new Promise((res) => setTimeout(res, poll.ms));
          last = await ctx.conn.api<{ run: AppRun; progress?: any; recipe?: any }>('GET', `/api/apps/runs/${enc(r.run.id)}`);
        }
        if (ctx.o.json) return ctx.json(last);
        const answer: AnswerField[] = last.recipe?.answer ?? recipe.answer ?? [];
        ctx.out(['', ...runLines(ctx, last.run, answer, last.run.status === 'waiting' ? { waiting: (last as any).question?.question ?? 'answer it on its page' } : undefined), again(ctx, last.run)]);
        return last.run.status === 'failed' ? 1 : 0;
      },
    },
    {
      name: 'runs',
      args: [{ name: 'app', kind: 'app', optional: true }],
      summary: 'An app’s latest runs (or the latest of all)',
      help: 'Newest first, 10 unless -n says more. Without an app, the latest runs of every app.',
      examples: ['hydor apps runs trip-planner', 'hydor apps runs'],
      async run(ctx, [given]) {
        let runs: AppRun[];
        if (given) {
          const e = await findApp(ctx, given);
          const r = await ctx.conn.api<{ runs: AppRun[] }>('GET', `/api/apps/${enc(e.id)}/runs`);
          if (ctx.o.json) return ctx.json(r);
          runs = r.runs;
          if (!runs.length) return ctx.out(`“${e.name}” has not run yet.`);
        } else {
          const raw = await ctx.conn.api<{ recent?: AppRun[] }>('GET', '/api/apps');
          if (ctx.o.json) return ctx.json({ runs: raw.recent ?? [] });
          runs = raw.recent ?? [];
          if (!runs.length) return ctx.out('No app has run yet.');
        }
        const { p } = ctx.look;
        const shown = runs.slice(0, ctx.o.all ? runs.length : (ctx.o.limit ?? 10));
        ctx.out(
          table(
            ctx,
            shown.map((x) => [
              mark(p, RUN_MARK[x.status]),
              p.dim(x.id),
              p.bold(x.appName),
              x.status,
              p.dim(timeAgo(x.createdAt)),
              x.costUsd ? p.dim(money(x.costUsd)) : '',
              p.dim(truncate(Object.values(x.inputs ?? {}).join(', '), 40)),
            ]),
            { grow: 6 },
          ),
        );
        if (runs.length > shown.length) ctx.out(p.dim(`… ${runs.length - shown.length} more (-n <number>, or --all)`));
      },
    },
    {
      name: 'run-show',
      aliases: ['result'],
      args: [{ name: 'run', kind: 'run' }],
      summary: 'One run: its answer, cost and trouble',
      help: 'The run’s id is printed by hydor apps run and listed by hydor apps runs (the start of it is enough).',
      examples: ['hydor apps run-show 3f9a'],
      async run(ctx, [given]) {
        let id = given;
        if (id.length < 8) {
          const raw = await ctx.conn.api<{ recent?: AppRun[] }>('GET', '/api/apps');
          const hit = (raw.recent ?? []).filter((r) => r.id.startsWith(id));
          if (hit.length === 1) id = hit[0].id;
          else if (hit.length > 1) throw new UsageError(`“${given}” fits ${hit.length} runs: give more of its id`);
        }
        const r = await ctx.conn.api<{ run: AppRun; progress?: any; recipe?: any; question?: any }>('GET', `/api/apps/runs/${enc(id)}`);
        if (ctx.o.json) return ctx.json(r);
        const { p } = ctx.look;
        ctx.out([
          p.bold(r.run.appName),
          ...fields(ctx, [
            ['Run', r.run.id],
            ['Status', r.run.status],
            ['Started', r.run.startedAt ? `${timeAgo(r.run.startedAt)}` : undefined],
            [
              'Answers',
              Object.entries(r.run.inputs ?? {})
                .map(([k, x]) => `${k}=${x}`)
                .join('\n'),
            ],
            ['Session', r.run.key ? ctx.conn.url(r.run.key) : undefined],
          ]),
          '',
          ...runLines(ctx, r.run, r.recipe?.answer ?? [], r.run.status === 'waiting' ? { waiting: r.question?.question ?? 'answer it on its page' } : undefined),
        ]);
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [app],
      summary: 'Delete an app (a ready-made one: uninstall it)',
      help: 'Deleting takes its runs, keys, public page and data too. A ready-made app is uninstalled: its runs and records stay.',
      examples: ['hydor apps remove trip-planner', 'hydor apps remove tpl:quiz -y'],
      async run(ctx, [given]) {
        const e = await findApp(ctx, given);
        if (e.ready) {
          if (!(await ctx.confirm(`Uninstall “${e.name}”?`))) return ctx.out('Not uninstalled.');
          const r = await ctx.conn.api('POST', `/api/apps/${enc(e.id)}/uninstall`);
          if (ctx.o.json) return ctx.json(r);
          return ctx.out(`Uninstalled “${e.name}”: its runs and records stay; install it again on the Apps page.`);
        }
        if (!(await ctx.confirm(`Delete “${e.name}” with its runs, keys and data?`))) return ctx.out('Not removed.');
        const r = await ctx.conn.api('DELETE', `/api/apps/${enc(e.id)}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Removed “${e.name}”.`);
      },
    },
  ],
};
