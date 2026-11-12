// `hydor skills`: the Skills page. The skill library (built in, yours, a plugin's) and Claude Code's and Codex's own
// skills: list, show, on, off, add (from a SKILL.md, a folder holding one, or typed in) and remove. `--agent claude` or
// `--agent codex` works on that agent's own skills (`--folder` for a folder's own); a name that is in both the library
// and an agent's own skills is the library's unless it is written `claude:name` or `codex:name`.
import path from 'node:path';
import { enc } from '../client.ts';
import { timeAgo } from '../term.ts';
import { choose, showLong, fields, flag, markdown, mark, str, strs, table, UsageError, type Area, type Ctx, type Values } from './kit.ts';

interface LibSkill {
  name: string;
  description: string;
  triggers: string[];
  category?: string;
  source: 'bundled' | 'learned' | 'plugin';
  plugin?: { name: string; title: string };
  off?: true;
  overrides?: true;
  path: string;
  updatedAt?: number;
  uses: number;
  lastUsed?: number;
}
interface OwnSkill {
  agent: 'claude' | 'codex';
  name: string;
  description: string;
  path: string;
  scope: string;
  enabled: boolean;
  plugin?: string;
  deletable: boolean;
}
type Where = 'hydor' | 'claude' | 'codex';
/** One skill of either kind. */
interface Item {
  id: string;
  name: string;
  where: Where;
  description: string;
  on: boolean;
  lib?: LibSkill;
  own?: OwnSkill;
}

const WHERE = ['hydor', 'claude', 'codex'];
const SCOPE_WORDS: Record<string, string> = { user: 'all folders', project: 'this folder', repo: 'this repository', system: 'built in', admin: 'admin', plugin: 'plugin' };
const SKILL_HINT = 'hydor skills lists them';
const skill = { name: 'skill', kind: 'skill', pick: true } as const;
const PICK_OPTIONS = {
  agent: { type: 'string', value: 'hydor|claude|codex', desc: 'Whose: the library (hydor), or Claude Code’s or Codex’s own', values: WHERE },
  folder: { type: 'string', value: '<folder>', desc: 'For an agent’s own skills: the folder they are for', kind: 'dir' },
} as const;

const whereOf = (v: Values): Where | undefined => {
  const a = str(v, 'agent');
  if (a === undefined) return undefined;
  if (!WHERE.includes(a)) throw new UsageError(`--agent takes ${WHERE.join(', ')} (it was “${a}”)`);
  return a as Where;
};
const folderOf = (ctx: Ctx, v: Values): string | undefined => {
  const f = str(v, 'folder');
  return f === undefined ? undefined : ctx.conn.here && !f.startsWith('~') ? path.resolve(f) : f;
};

const sourceWord = (s: LibSkill) =>
  s.source === 'plugin' ? `plugin ${s.plugin?.title ?? ''}`.trim() : s.source === 'learned' ? (s.overrides ? 'yours, in place of the built-in' : 'yours') : 'built in';

/** Every skill the options ask for. The agents' own skills are asked of the server only when wanted. */
async function loadItems(ctx: Ctx, v: Values): Promise<Item[]> {
  const where = whereOf(v);
  const items: Item[] = [];
  if (!where || where === 'hydor') {
    const lib = (await ctx.conn.api<{ skills: LibSkill[] }>('GET', '/api/skillpack')).skills;
    for (const s of lib) items.push({ id: s.name, name: s.name, where: 'hydor', description: s.description, on: !s.off, lib: s });
  }
  if (!where || where !== 'hydor') {
    const cwd = folderOf(ctx, v);
    const r = await ctx.conn.api<{ skills: OwnSkill[]; errors?: string[] }>('GET', `/api/setup/skills${cwd ? `?cwd=${enc(cwd)}` : ''}`, undefined, { timeoutMs: 60_000 });
    for (const s of r.skills) if (!where || s.agent === where) items.push({ id: `${s.agent}:${s.name}`, name: s.name, where: s.agent, description: s.description, on: s.enabled, own: s });
  }
  return items;
}

/** The skill named (as pickOne), or picked on a terminal. */
async function findSkill(ctx: Ctx, v: Values, given: string | undefined): Promise<Item> {
  const list = await loadItems(ctx, v);
  return choose(ctx, list, given, {
    id: (s) => s.id,
    names: (s) => [s.name],
    what: 'skill',
    hint: SKILL_HINT,
    label: (s) => s.name,
    detail: (s) => `${s.where === 'hydor' ? '' : `${s.where === 'claude' ? 'Claude Code' : 'Codex'}: `}${s.description}`,
  });
}

const kindWord = (s: Item) =>
  s.lib ? sourceWord(s.lib) : `${s.where === 'claude' ? 'Claude Code' : 'Codex'}’s own${s.own?.scope && s.own.scope !== 'user' ? `, ${SCOPE_WORDS[s.own.scope] ?? s.own.scope}` : ''}`;

/** The `name:` and `description:` of a SKILL.md's frontmatter, and the text after it. */
function parseSkillFile(text: string): { name?: string; description?: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { body: text };
  const get = (k: string) => {
    const x = new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(m[1]);
    return x ? x[1].trim().replace(/^(['"])(.*)\1$/, '$2') : undefined;
  };
  return { name: get('name'), description: get('description'), body: m[2].trim() };
}

export const skills: Area = {
  name: 'skills',
  aliases: ['skill'],
  summary: 'The skills agents use',
  help: 'A skill is a SKILL.md that tells an agent how to do one kind of task. The library is every agent’s; Claude Code and Codex have their own besides (--agent claude, --agent codex). A skill an agent proposed is approved on the Skills page. Name one by its name or the start of it; on a terminal, leave it out to pick from a list.',
  group: 'tools',
  verbs: [
    {
      name: 'list',
      args: [],
      options: PICK_OPTIONS,
      summary: 'The skill library and the agents’ own',
      examples: ['hydor skills', 'hydor skills --agent hydor', 'hydor skills --agent claude --folder ~/code/app', 'hydor skills --json'],
      async run(ctx, _a, v) {
        const where = whereOf(v);
        if (ctx.o.json) {
          const out: Record<string, unknown> = {};
          if (!where || where === 'hydor') out.library = await ctx.conn.api('GET', '/api/skillpack');
          if (!where || where !== 'hydor') out.agents = await ctx.conn.api('GET', `/api/setup/skills${folderOf(ctx, v) ? `?cwd=${enc(folderOf(ctx, v)!)}` : ''}`, undefined, { timeoutMs: 60_000 });
          return ctx.json(where === 'hydor' ? out.library : where ? out.agents : out);
        }
        const list = await loadItems(ctx, v);
        if (!list.length) return ctx.out('No skills here: hydor skills add <SKILL.md or folder> adds one.');
        const { p } = ctx.look;
        const limit = ctx.o.all ? Infinity : (ctx.o.limit ?? 500);
        const rows = list
          .slice(0, limit)
          .map((s) => [
            s.on ? mark(p, 'on') : mark(p, 'off'),
            s.where === 'hydor' ? p.bold(s.name) : `${p.bold(s.name)}${p.dim(` (${s.where})`)}`,
            p.dim(kindWord(s)),
            p.dim(s.lib?.uses ? `${s.lib.uses} uses` : ''),
            p.dim(s.description),
          ]);
        ctx.out(table(ctx, rows, { head: ['', 'SKILL', 'FROM', 'USED', ''], grow: 1, free: [1, 4], drop: [4, 3] }));
        if (list.length > rows.length) ctx.out(p.dim(`… ${list.length - rows.length} more (-n <number>, or --all)`));
      },
    },
    {
      name: 'show',
      args: [skill],
      options: { ...PICK_OPTIONS, history: { type: 'boolean', desc: 'Its history of changes too (library skills)' } },
      summary: 'One skill: where it is from, its text',
      examples: ['hydor skills show research', 'hydor skills show deploy --agent claude', 'hydor skills show research --history'],
      async run(ctx, [given], v) {
        const s = await findSkill(ctx, v, given);
        let text = '';
        let history: { at: number; action: string; added: number; removed: number }[] = [];
        let raw: unknown;
        if (s.lib) {
          const r = await ctx.conn.api<{ text: string; history: typeof history }>('GET', `/api/skillpack/skills/${enc(s.name)}`);
          raw = r;
          text = r.text;
          history = r.history ?? [];
        } else {
          const r = await ctx.conn.api<{ content: string | null }>('GET', `/api/fs/read?path=${enc(s.own!.path)}`);
          raw = { ...s.own, text: r.content ?? '' };
          text = r.content ?? '';
        }
        if (ctx.o.json) return ctx.json(raw);
        const { p } = ctx.look;
        await showLong(ctx, [
          p.bold(s.name) + (s.on ? '' : p.dim(' (off)')),
          ...fields(ctx, [
            ['From', kindWord(s)],
            ['About', s.description],
            ['Group', s.lib?.category],
            ['Keywords', s.lib?.triggers?.join(', ')],
            ['Used', s.lib?.uses ? `${s.lib.uses} times${s.lib.lastUsed ? `, last ${timeAgo(s.lib.lastUsed)}` : ''}` : undefined],
            ['File', s.lib?.path ?? s.own?.path],
          ]),
          '',
          ...markdown(ctx, parseSkillFile(text).body || text),
        ]);
        if (flag(v, 'history') && history.length)
          ctx.out([
            '',
            p.bold('History'),
            ...table(
              ctx,
              history.slice(0, 20).map((h) => [p.dim(timeAgo(h.at)), h.action, p.dim(`+${h.added} −${h.removed}`)]),
            ),
          ]);
      },
    },
    ...(['on', 'off'] as const).map((state) => ({
      name: state,
      args: [skill],
      options: PICK_OPTIONS,
      summary: `Turn a skill ${state}`,
      help: 'A library skill is turned on or off for every agent (a project can switch it the other way for its own sessions). Claude Code’s and Codex’s own skills are turned on or off for every session, and for the agent outside Hydor too.',
      examples: [`hydor skills ${state} research`, `hydor skills ${state} deploy --agent claude`],
      async run(ctx: Ctx, [given]: string[], v: Values) {
        const s = await findSkill(ctx, v, given);
        const on = state === 'on';
        const r = s.lib
          ? await ctx.conn.api('PUT', `/api/skillpack/skills/${enc(s.name)}/off`, { off: !on })
          : await ctx.conn.api('POST', '/api/setup/skills/toggle', { agent: s.own!.agent, name: s.name, path: s.own!.path, enabled: on });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`“${s.name}” is ${on ? 'on' : 'off'}${s.own ? ` for ${s.where === 'claude' ? 'Claude Code' : 'Codex'}` : ''}.`);
      },
    })),
    {
      name: 'add',
      aliases: ['new', 'create'],
      args: [{ name: 'source', kind: 'file' }],
      options: {
        agent: { type: 'string', value: 'hydor|claude|codex', desc: 'Whose: every agent’s (hydor), or Claude’s or Codex’s own', values: WHERE },
        scope: { type: 'string', value: 'user|project', desc: 'Claude Code’s own: all folders (user), or --folder (project)', values: ['user', 'project'] },
        folder: { type: 'string', value: '<folder>', desc: 'The folder for --scope project', kind: 'dir' },
        name: { type: 'string', value: '<name>', desc: 'Its name (default: the one in its file)' },
        description: { type: 'string', value: '<text>', desc: 'When to use it, “Use when …” (default: its file’s)' },
        category: { type: 'string', value: '<group>', desc: 'Its group in the library (work, writing, research, coding…)' },
        keyword: { type: 'strings', value: '<word>', desc: 'A keyword that brings it into a Custom turn (up to 12)' },
        file: { type: 'string', value: '<path>', desc: 'A new skill’s instructions from a file (- is stdin)', kind: 'file' },
      },
      summary: 'Add a skill from a SKILL.md or a folder',
      help: 'Give the path of a SKILL.md or of a folder with one, and the skill is added as it is. Only the SKILL.md goes in: other files beside it are not copied (a script it names has to be where it says). Give a plain name instead, with --description and the instructions (--file, - for stdin, or your editor), to write one. One with a key in it, or over 20,000 characters, is refused; a name already in the library is refused.',
      examples: [
        'hydor skills add ~/skills/citation-style',
        'hydor skills add ./SKILL.md --category writing',
        'hydor skills add standup --description "Use when …" --file s.md',
        'hydor skills add ~/skills/lint --agent claude',
      ],
      async run(ctx, [source], v) {
        const fs = await import('node:fs');
        const where = whereOf(v) ?? 'hydor';
        let file: string | undefined;
        const abs = path.resolve(source.replace(/^~(?=\/|$)/, ctx.look.home));
        if (fs.existsSync(abs)) file = fs.statSync(abs).isDirectory() ? path.join(abs, 'SKILL.md') : abs;
        else if (/[/\\]|\.md$/i.test(source)) throw new UsageError(`Cannot find ${source}`);
        let name = str(v, 'name');
        let description = str(v, 'description');
        let body: string;
        let whole: string | undefined;
        if (file) {
          let text: string;
          try {
            text = fs.readFileSync(file, 'utf8');
          } catch {
            throw new UsageError(`Cannot read ${file}${file.endsWith('SKILL.md') ? ' (a folder to add holds a SKILL.md)' : ''}`);
          }
          const parsed = parseSkillFile(text);
          name ??= parsed.name ?? path.basename(path.dirname(file));
          description ??= parsed.description;
          body = parsed.body;
          if (where === 'hydor' && parsed.name && parsed.description) {
            whole = parsed.name === name && !str(v, 'description') ? text : text.replace(/^name:.*$/m, `name: ${name}`);
            if (str(v, 'description')) whole = whole.replace(/^description:.*$/m, `description: ${JSON.stringify(description)}`);
          }
        } else {
          name ??= source;
          const text = await ctx.readText({ file: str(v, 'file'), current: '' });
          if (!text) throw new UsageError(`Say what the skill says: --file <path>, - for stdin, or write it in your editor (${ctx.usage})`);
          body = text.trim();
        }
        if (where === 'hydor' && !whole && !description) throw new UsageError('A skill needs a description of when to use it: --description "Use when …"');
        let r: unknown;
        if (where === 'hydor') {
          const kw = strs(v, 'keyword');
          r = whole
            ? await ctx.conn.api('POST', '/api/skillpack/skills', { name, text: whole })
            : await ctx.conn.api('POST', '/api/skillpack/skills', { name, description, body, category: str(v, 'category'), triggers: kw.length ? kw : undefined });
          if (whole && (str(v, 'category') || strs(v, 'keyword').length)) ctx.out('(--category and --keyword are for skills typed in: a SKILL.md is added as it is.)');
        } else {
          const scope = str(v, 'scope') ?? 'user';
          if (!['user', 'project'].includes(scope)) throw new UsageError('--scope takes user or project');
          const cwd = scope === 'project' ? folderOf(ctx, v) : undefined;
          if (scope === 'project' && !cwd) throw new UsageError('--scope project needs --folder <the folder>');
          r = await ctx.conn.api('POST', '/api/setup/skills', { agent: where, name, description: description ?? '', body, scope, ...(cwd ? { cwd } : {}) });
        }
        if (ctx.o.json) return ctx.json(r);
        const made = r as { name?: string; path?: string };
        ctx.out(where === 'hydor' ? `Added “${made.name ?? name}” to the skill library.` : `Added “${name}” to ${where === 'claude' ? 'Claude Code' : 'Codex'}’s own skills (${made.path ?? ''}).`);
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [skill],
      options: PICK_OPTIONS,
      summary: 'Remove a skill of yours, or delete an own one',
      help: 'A skill of yours leaves the library but its text stays in the history (the page brings it back). Built-in and plugin skills cannot be removed: turn them off. An agent’s own skill is deleted with every file in its folder: there is no undo.',
      examples: ['hydor skills remove standup', 'hydor skills remove deploy --agent claude -y'],
      async run(ctx, [given], v) {
        const s = await findSkill(ctx, v, given);
        if (s.lib && s.lib.source !== 'learned')
          throw new UsageError(`“${s.name}” is ${s.lib.source === 'plugin' ? 'a plugin’s' : 'built in'} and cannot be removed: hydor skills off ${s.name} turns it off`);
        if (s.own && !s.own.deletable) throw new UsageError(`“${s.name}” cannot be deleted (${kindWord(s)}): hydor skills off ${s.id} turns it off`);
        if (!(await ctx.confirm(s.own ? `Delete “${s.name}” and its folder for good?` : `Remove “${s.name}”?`))) return ctx.out('Not removed.');
        const cwd = folderOf(ctx, v);
        const r = s.lib
          ? await ctx.conn.api('POST', `/api/skillpack/skills/${enc(s.name)}/remove`)
          : await ctx.conn.api('POST', '/api/setup/skills/delete', { agent: s.own!.agent, path: s.own!.path, ...(cwd ? { cwd } : {}) });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Removed “${s.name}”.`);
      },
    },
  ],
};
