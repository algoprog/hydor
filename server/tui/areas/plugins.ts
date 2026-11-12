// `hydor plugins`: the Plugins page. Hydor's plugins for every agent (skills, tool servers and instructions bundled:
// list, show, on, off, add, remove), and Claude Code's and Codex's own (`--agent claude`, `--agent codex`): list, add,
// remove, and on and off for Claude Code (the API has none for Codex). A plugin's setup after adding runs as a job: the
// command follows it to the end. Writing a plugin of your own is the page’s editor (hydor open plugins).
import path from 'node:path';
import { ApiError, enc } from '../client.ts';
import { timeAgo } from '../term.ts';
import { choose, fields, flag, markdown, mark, str, table, UsageError, type Area, type Ctx, type Values } from './kit.ts';

/** A plugin of Hydor's, as the API returns it (what the commands show of it). */
interface HydorPlugin {
  name: string;
  title: string;
  version?: string;
  description?: string;
  author?: string | { name?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  source: { kind: 'builtin' | 'git' | 'file' | 'folder'; url?: string; ref?: string; path?: string; file?: string; mine?: boolean };
  installed: boolean;
  enabled: boolean;
  setup: { state: 'none' | 'installing' | 'ready' | 'failed' | 'outdated'; error?: string; at?: number };
  skills: { name: string; description: string }[];
  servers: { name: string; type: string; command?: string; url?: string; problem?: string }[];
  instructions: boolean;
  missing?: { commands?: unknown[]; keys?: unknown[]; plugins?: unknown[] };
  dependents?: string[];
  problems?: string[];
  root?: string;
  installedAt?: number;
  readme?: string;
}
interface Job {
  id: string;
  plugin: string;
  action: string;
  state: 'running' | 'done' | 'failed';
  steps: { label: string; state: 'waiting' | 'running' | 'done' | 'failed' }[];
  log?: string;
  error?: string;
}
/** An agent's own plugin (Claude Code's or Codex's). */
interface OwnPlugin {
  id: string;
  name: string;
  description?: string;
  marketplace?: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
  installed: boolean;
  installCount?: number;
}
type Where = 'hydor' | 'claude' | 'codex';
const WHERE = ['hydor', 'claude', 'codex'];
const PLUGIN_HINT = 'hydor plugins lists them';
const plugin = { name: 'plugin', kind: 'plugin', pick: true } as const;
const AGENT_OPTION = { type: 'string', value: 'hydor|claude|codex', desc: 'Whose: Hydor’s (default), or Claude Code’s or Codex’s own', values: WHERE } as const;
/** A plugin’s title, with its name beside it when that says something else. */
const titled = (x: { title: string; name: string }, p: { bold(s: string): string; dim(s: string): string }) =>
  x.title.toLowerCase() === x.name.toLowerCase() ? p.bold(x.title) : `${p.bold(x.title)}${p.dim(` ${x.name}`)}`;
const programName = (w: Where) => (w === 'claude' ? 'Claude Code' : w === 'codex' ? 'Codex' : 'Hydor');

const whereOf = (v: Values): Where => {
  const a = str(v, 'agent') ?? 'hydor';
  if (!WHERE.includes(a)) throw new UsageError(`--agent takes ${WHERE.join(', ')} (it was “${a}”)`);
  return a as Where;
};

/** What the page puts in a plugin's state column. */
const stateWord = (x: HydorPlugin) =>
  !x.installed
    ? 'not added'
    : x.setup.state === 'failed'
      ? 'setup failed'
      : x.setup.state === 'installing'
        ? 'setting up'
        : x.setup.state === 'outdated'
          ? 'needs setup again'
          : x.enabled
            ? 'on'
            : 'off';

interface Listed {
  installed: OwnPlugin[];
  available: OwnPlugin[];
  total?: number;
}
/** Claude Code's or Codex's own plugins (installed; with a search, the ones their marketplaces offer too). */
async function ownPlugins(ctx: Ctx, where: 'claude' | 'codex', q?: string, limit?: number): Promise<Listed> {
  const qs = [q ? `q=${enc(q)}` : '', limit ? `limit=${limit}` : ''].filter(Boolean).join('&');
  return ctx.conn.api<Listed>('GET', `${where === 'claude' ? '/api/setup/plugins' : '/api/setup/codex-plugins'}${qs ? `?${qs}` : ''}`, undefined, { timeoutMs: 200_000 });
}
const hydorPlugins = (ctx: Ctx) => ctx.conn.api<{ installed: HydorPlugin[]; available: HydorPlugin[] }>('GET', '/api/plugins');

/** The plugin named among the ones the options point at, or picked on a terminal. */
async function findPlugin(ctx: Ctx, v: Values, given: string | undefined, o: { available?: boolean } = {}): Promise<{ where: Where; h?: HydorPlugin; own?: OwnPlugin }> {
  const where = whereOf(v);
  if (where === 'hydor') {
    const r = await hydorPlugins(ctx);
    const h = await choose(ctx, [...r.installed, ...(o.available ? r.available : [])], given, {
      id: (x) => x.name,
      names: (x) => [x.title],
      what: 'plugin',
      hint: PLUGIN_HINT,
      label: (x) => x.title,
      detail: (x) => x.description,
    });
    return { where, h };
  }
  const r = await ownPlugins(ctx, where);
  const own = await choose(ctx, r.installed, given, {
    id: (x) => x.id,
    names: (x) => [x.name],
    what: `${programName(where)} plugin`,
    hint: `hydor plugins --agent ${where} lists them`,
    label: (x) => x.name,
    detail: (x) => x.description,
  });
  return { where, own };
}

/** Follows a job to its end: each step as it finishes, then 0, or an ApiError with what went wrong. */
async function followJob(ctx: Ctx, first: Job, what: string): Promise<Job> {
  let job = first;
  const said = new Set<string>();
  const { p } = ctx.look;
  const report = () => {
    if (ctx.o.json) return;
    for (const s of job.steps) {
      const key = `${s.label}:${s.state}`;
      if ((s.state === 'done' || s.state === 'failed') && !said.has(key)) {
        said.add(key);
        ctx.out(`${s.state === 'done' ? mark(p, 'done') : mark(p, 'error')} ${s.label}`);
      }
    }
  };
  const until = Date.now() + 15 * 60_000;
  while (job.state === 'running' && Date.now() < until) {
    report();
    await new Promise((r) => setTimeout(r, 1000));
    job = (await ctx.conn.api<{ job: Job }>('GET', `/api/plugins/jobs/${enc(job.id)}`)).job;
  }
  report();
  if (job.state === 'failed') throw new ApiError(500, `${what} failed: ${job.error ?? 'see the log'}${job.log ? `\n${job.log.split('\n').slice(-8).join('\n')}` : ''}`);
  if (job.state === 'running') throw new ApiError(504, `${what} is still going: hydor plugins show ${job.plugin} says when it is ready`);
  return job;
}

export const plugins: Area = {
  name: 'plugins',
  aliases: ['plugin'],
  summary: 'Add-ons with skills and tools',
  help: 'Hydor’s plugins work for every agent: each brings skills, tool servers and instructions. Claude Code and Codex have plugins of their own besides: add --agent claude or --agent codex. Name one by its name or the start of it; on a terminal, leave it out to pick from a list. Making a plugin of your own is on its page (hydor open plugins).',
  group: 'tools',
  verbs: [
    {
      name: 'list',
      args: [],
      options: { agent: AGENT_OPTION, search: { type: 'string', value: '<words>', desc: 'Claude Code’s and Codex’s: what the marketplaces offer', kind: 'text' } },
      summary: 'Your plugins, and the built-in ones to add',
      help: 'Claude Code’s and Codex’s own lists come from their marketplaces and can take a minute the first time.',
      examples: ['hydor plugins', 'hydor plugins --agent claude', 'hydor plugins --agent claude --search github -n 10'],
      async run(ctx, _a, v) {
        const where = whereOf(v);
        const { p } = ctx.look;
        if (where === 'hydor') {
          const r = await hydorPlugins(ctx);
          if (ctx.o.json) return ctx.json(r);
          if (!r.installed.length && !r.available.length) return ctx.out('No plugins yet: hydor plugins add <source> adds one.');
          const row = (x: HydorPlugin) => [
            x.installed ? (x.enabled && x.setup.state !== 'failed' ? mark(p, 'on') : x.setup.state === 'failed' ? mark(p, 'error') : mark(p, 'off')) : p.dim('+'),
            titled(x, p),
            p.dim(x.version ?? ''),
            p.dim(stateWord(x)),
            p.dim(x.description ?? ''),
          ];
          ctx.out(table(ctx, [...r.installed, ...r.available].map(row), { head: ['', 'PLUGIN', 'VERSION', 'STATE', ''], grow: 1, free: [1, 4] }));
          return;
        }
        const q = str(v, 'search');
        const r = await ownPlugins(ctx, where, q, ctx.o.limit);
        if (ctx.o.json) return ctx.json(r);
        const rows = r.installed.map((x) => [x.enabled === false ? mark(p, 'off') : mark(p, 'on'), p.bold(x.name), p.dim(x.marketplace ?? ''), p.dim(x.version ?? ''), p.dim(x.description ?? '')]);
        const more = q ? r.available.map((x) => [p.dim('+'), x.name, p.dim(x.marketplace ?? ''), p.dim(x.version ?? ''), p.dim(x.description ?? '')]) : [];
        if (!rows.length && !more.length)
          return ctx.out(`${programName(where)} has no plugins${q ? ` that fit “${q}”` : ''}: hydor plugins add <name@marketplace> --agent ${where} adds one (--search finds them).`);
        ctx.out(table(ctx, [...rows, ...more], { head: ['', 'PLUGIN', 'MARKETPLACE', 'VERSION', ''], grow: 1, free: [1, 4] }));
        if (q && r.total && r.total > more.length) ctx.out(p.dim(`… ${r.total - more.length} more that fit (-n <number>)`));
      },
    },
    {
      name: 'show',
      args: [plugin],
      options: { agent: AGENT_OPTION, readme: { type: 'boolean', desc: 'Its README too' } },
      summary: 'One plugin: what it brings and needs',
      examples: ['hydor plugins show research-tools', 'hydor plugins show --agent claude github', 'hydor plugins show research-tools --readme'],
      async run(ctx, [given], v) {
        const found = await findPlugin(ctx, v, given, { available: true });
        const { p } = ctx.look;
        if (found.own) {
          if (ctx.o.json) return ctx.json(found.own);
          const o = found.own;
          return ctx.out([
            p.bold(o.name),
            ...fields(ctx, [
              ['Id', o.id],
              ['For', programName(found.where)],
              ['About', o.description],
              ['Marketplace', o.marketplace],
              ['Version', o.version],
              ['Added for', o.scope],
              ['State', o.enabled === false ? 'off' : 'on'],
            ]),
          ]);
        }
        const h = found.h!;
        const r = await ctx.conn.api<HydorPlugin>('GET', `/api/plugins/${enc(h.name)}`);
        if (ctx.o.json) return ctx.json(r);
        const src =
          r.source.kind === 'builtin'
            ? 'built in'
            : r.source.kind === 'git'
              ? `Git: ${r.source.url}${r.source.ref ? ` (${r.source.ref})` : ''}`
              : r.source.kind === 'file'
                ? 'a .zip file'
                : `a folder${r.source.mine ? ' of yours, made in the app' : ''}: ${r.source.path}`;
        const missing = r.missing ? [...(r.missing.commands ?? []), ...(r.missing.keys ?? []), ...(r.missing.plugins ?? [])].length : 0;
        const author = typeof r.author === 'object' ? r.author?.name : r.author;
        ctx.out([
          titled(r, p) + (r.version ? p.dim(` ${r.version}`) : ''),
          ...fields(ctx, [
            ['State', stateWord(r) + (r.setup.error ? `: ${r.setup.error}` : '')],
            ['About', r.description],
            ['From', src],
            ['By', author],
            ['Homepage', r.homepage ?? r.repository],
            ['License', r.license],
            ['Added', r.installedAt ? timeAgo(r.installedAt) : undefined],
            ['Skills', r.skills.map((s) => s.name).join(', ')],
            ['Tool servers', r.servers.map((s) => `${s.name} (${s.type})${s.problem ? ` — ${s.problem}` : ''}`).join('\n')],
            ['Instructions', r.instructions ? 'yes' : undefined],
            ['Missing', missing ? `${missing} things it needs are not here (open it on the page)` : undefined],
            ['Needed by', r.dependents?.join(', ')],
            ['Problems', r.problems?.join('\n')],
            ['Folder', r.root],
          ]),
        ]);
        if (flag(v, 'readme') && r.readme) ctx.out(['', ...markdown(ctx, r.readme)]);
      },
    },
    ...(['on', 'off'] as const).map((state) => ({
      name: state,
      args: [plugin],
      options: { agent: AGENT_OPTION },
      summary: `Turn a plugin ${state}`,
      help: 'Every agent Hydor starts gets the plugins that are on and set up. Claude Code’s own plugins can be turned on and off too; the API has no on and off for Codex’s (remove and add them).',
      examples: [`hydor plugins ${state} research-tools`, `hydor plugins ${state} github --agent claude`],
      async run(ctx: Ctx, [given]: string[], v: Values) {
        const where = whereOf(v);
        if (where === 'codex') throw new UsageError('Codex’s plugins have no on and off here: hydor plugins remove <plugin> --agent codex, and add it again to have it back');
        const found = await findPlugin(ctx, v, given);
        const on = state === 'on';
        if (found.own) {
          const r = await ctx.conn.api<{ ok: boolean; output?: string }>('POST', `/api/setup/plugins/${on ? 'enable' : 'disable'}`, { id: found.own.id });
          if (ctx.o.json) return ctx.json(r);
          if (!r.ok) throw new ApiError(500, r.output || `Claude Code would not turn it ${state}`);
          return ctx.out(`“${found.own.name}” is ${state} for Claude Code.`);
        }
        const r = await ctx.conn.api<{ on?: string[]; off?: string[] }>('POST', `/api/plugins/${enc(found.h!.name)}/${on ? 'enable' : 'disable'}`);
        if (ctx.o.json) return ctx.json(r);
        const list = (on ? r.on : r.off) ?? [];
        const others = list.filter((n) => n !== found.h!.name);
        ctx.out(`“${found.h!.title}” is ${state}${others.length ? `, with ${others.join(', ')}` : ''}.`);
      },
    })),
    {
      name: 'add',
      aliases: ['install'],
      args: [{ name: 'source', kind: 'file' }],
      options: {
        agent: AGENT_OPTION,
        ref: { type: 'string', value: '<branch>', desc: 'For a Git repository: a branch or tag' },
        subdir: { type: 'string', value: '<folder>', desc: 'For a Git repository: the folder inside it' },
        scope: { type: 'string', value: 'user|project|local', desc: 'Claude Code’s own: where to add it (default user)', values: ['user', 'project', 'local'] },
      },
      summary: 'Add a plugin: built in, Git, .zip or folder',
      help: 'Hydor’s: give the name of a built-in plugin (hydor plugins lists them), a Git repository (owner/repo, an https address, a GitHub link to a folder, or git@host:path; --ref and --subdir narrow it), a .zip, or a folder on this computer (used in place). Hydor shows what it brings and asks first (-y says yes), adds the built-in plugins it needs, sets it up and turns it on, and waits for that to end. For Claude Code’s and Codex’s own: its id as the marketplaces list it, name@marketplace (find it with hydor plugins list --search).',
      examples: [
        'hydor plugins add research-tools',
        'hydor plugins add owner/repo --ref v1.2',
        'hydor plugins add ~/plugins/mine -y',
        'hydor plugins add pack.zip',
        'hydor plugins add github@claude-plugins-official --agent claude',
      ],
      async run(ctx, [source], v) {
        const where = whereOf(v);
        if (where !== 'hydor') {
          if (!source.includes('@') && where === 'claude') throw new UsageError(`Give its id as the marketplaces list it, name@marketplace: hydor plugins list --agent claude --search ${source}`);
          const r = await ctx.conn.api<{ ok: boolean; output?: string }>('POST', where === 'claude' ? '/api/setup/plugins/install' : '/api/setup/codex-plugins/add', {
            id: source,
            ...(where === 'claude' && str(v, 'scope') ? { scope: str(v, 'scope') } : {}),
          });
          if (ctx.o.json) return ctx.json(r);
          if (!r.ok) throw new ApiError(500, r.output || `${programName(where)} would not add it`);
          return ctx.out(`Added “${source}” to ${programName(where)}.`);
        }
        const fs = await import('node:fs');
        const abs = path.resolve(source.replace(/^~(?=\/|$)/, ctx.look.home));
        const local = fs.existsSync(abs);
        const { p } = ctx.look;
        let body: Record<string, unknown>;
        const builtin = local ? undefined : (await hydorPlugins(ctx)).available.find((x) => x.name === source.toLowerCase());
        if (builtin) {
          if (!(await ctx.confirm(`Add “${builtin.title}”?`))) return ctx.out('Not added.');
          const r = await ctx.conn.api<{ job: Job }>('POST', '/api/plugins/install', { name: builtin.name });
          const job = await followJob(ctx, r.job, `Adding “${builtin.title}”`);
          if (ctx.o.json) return ctx.json({ job });
          return ctx.out(`Added “${builtin.title}”.`);
        }
        if (local && fs.statSync(abs).isFile()) {
          if (!/\.zip$/i.test(abs)) throw new UsageError(`${source} is no .zip: give a .zip, a folder, a Git repository or a built-in plugin’s name`);
          body = { file: { name: path.basename(abs), data: fs.readFileSync(abs).toString('base64') } };
        } else if (local) body = { path: ctx.conn.here ? abs : source };
        else {
          if (/^[./~]/.test(source)) throw new UsageError(`Cannot find ${source}`);
          body = { url: source, ...(str(v, 'ref') ? { ref: str(v, 'ref') } : {}), ...(str(v, 'subdir') ? { subdir: str(v, 'subdir') } : {}) };
        }
        const look = await ctx.conn.api<{ token: string; view: HydorPlugin; brings: string[]; unavailable: string[]; replaces?: string }>('POST', '/api/plugins/inspect', body, { timeoutMs: 180_000 });
        const w = look.view;
        if (look.unavailable.length) throw new UsageError(`“${w.title}” needs plugins nobody has (${look.unavailable.join(', ')}), so it cannot be added`);
        if (!ctx.o.json)
          ctx.out([
            `${titled(w, p)}${w.version ? p.dim(` ${w.version}`) : ''}${w.description ? ` — ${w.description}` : ''}`,
            ...fields(ctx, [
              ['Skills', w.skills.map((s) => s.name).join(', ')],
              ['Tool servers', w.servers.map((s) => s.name).join(', ')],
              ['Needs added first', look.brings.join(', ')],
              ['Replaces', look.replaces ? `the plugin ${look.replaces} that is here` : undefined],
            ]),
          ]);
        if (!(await ctx.confirm(`Add “${w.title}”?`))) return ctx.out('Not added.');
        const r = await ctx.conn.api<{ job: Job }>('POST', '/api/plugins/install', { token: look.token });
        const job = await followJob(ctx, r.job, `Adding “${w.title}”`);
        if (ctx.o.json) return ctx.json({ job });
        ctx.out(`Added “${w.title}” and turned it on.`);
      },
    },
    {
      name: 'remove',
      aliases: ['uninstall', 'delete', 'rm'],
      args: [plugin],
      options: { agent: AGENT_OPTION, 'keep-data': { type: 'boolean', desc: 'Hydor’s: keep the packages and downloads it set up' } },
      summary: 'Remove a plugin and what needs it',
      help: 'A plugin made in the app’s editor is deleted with its folder; one used from a folder of yours leaves the folder where it is.',
      examples: ['hydor plugins remove research-tools', 'hydor plugins remove research-tools -y --keep-data', 'hydor plugins remove github --agent claude'],
      async run(ctx, [given], v) {
        const found = await findPlugin(ctx, v, given);
        const label = found.h?.title ?? found.own!.name;
        const needing = found.h?.dependents?.length ? ` and ${found.h.dependents.join(', ')}, which need it` : '';
        if (!(await ctx.confirm(`Remove “${label}”${needing}?`))) return ctx.out('Not removed.');
        if (found.own) {
          const r = await ctx.conn.api<{ ok: boolean; output?: string }>('POST', found.where === 'claude' ? '/api/setup/plugins/uninstall' : '/api/setup/codex-plugins/remove', { id: found.own.id });
          if (ctx.o.json) return ctx.json(r);
          if (!r.ok) throw new ApiError(500, r.output || `${programName(found.where)} would not remove it`);
          return ctx.out(`Removed “${label}” from ${programName(found.where)}.`);
        }
        const r = await ctx.conn.api<{ removed: string[] }>('POST', `/api/plugins/${enc(found.h!.name)}/remove`, flag(v, 'keep-data') ? { keepData: true } : {});
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Removed ${r.removed.length ? r.removed.join(', ') : `“${label}”`}.`);
      },
    },
  ],
};
