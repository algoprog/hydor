// `hydor projects`: the Projects page. List, show, new, rename, edit (description, guidelines, agent, folders…),
// sessions, files (a project's own documents: list, add a folder, remove) and remove. The worked example for the
// other areas: metadata at the top (cheap to load), each verb's work in its `run`, writing only through ctx.
import path from 'node:path';
import type { KnowledgeBase, KnowledgeDoc } from '../../../shared/knowledge.ts';
import { SPACE_COLORS, type Space, type SpaceView } from '../../../shared/spaces.ts';
import { enc } from '../client.ts';
import { tildify, timeAgo } from '../term.ts';
import { choose, fields, flag, markdown, mark, pickOne, str, strs, table, UsageError, type Area, type Ctx, type Values } from './kit.ts';

const PROJECT_HINT = 'hydor projects lists them';
const project = { name: 'project', kind: 'project', pick: true } as const;

/** Every project, with its counts. */
async function listProjects(ctx: Ctx): Promise<SpaceView[]> {
  return (await ctx.conn.api<{ spaces: SpaceView[] }>('GET', '/api/projects')).spaces;
}

/** The project named (its id, its name, or the start of either), or picked on a terminal. */
async function findProject(ctx: Ctx, given: string | undefined): Promise<SpaceView> {
  const list = await listProjects(ctx);
  return choose(ctx, list, given, { id: (s) => s.id, names: (s) => [s.name], what: 'project', hint: PROJECT_HINT, label: (s) => s.name, detail: (s) => tildify(s.folder, ctx.look.home) });
}

/** A folder as the server wants it: a full path here, as typed (`~/x` too) for another computer's Hydor. */
const folderArg = (ctx: Ctx, f: string) => (ctx.conn.here && !f.startsWith('~') ? path.resolve(f) : f);

/** What `new` and `edit` both set from options: the project's fields. */
function fieldsOf(ctx: Ctx, v: Values): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (str(v, 'description') !== undefined) body.description = str(v, 'description');
  if (str(v, 'instructions') !== undefined) body.instructions = str(v, 'instructions');
  if (str(v, 'color') !== undefined) body.color = str(v, 'color');
  if (str(v, 'as') !== undefined) body.assistant = str(v, 'as');
  const knowledge = str(v, 'shared-knowledge');
  if (knowledge !== undefined) {
    if (knowledge !== 'on' && knowledge !== 'off') throw new UsageError('--shared-knowledge takes on or off');
    body.sharedKnowledge = knowledge === 'on';
  }
  return body;
}

const when = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined);

export const projects: Area = {
  name: 'projects',
  aliases: ['project'],
  summary: 'Your projects: their folders, guidelines, documents and sessions',
  help: 'A project keeps a folder, guidelines every session in it is told, documents only its sessions search, skills and the agent they start as. Name one by its name or the start of its id; on a terminal, leave it out to pick from a list.',
  group: 'work',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'Your projects, with sessions and documents',
      examples: ['hydor projects', 'hydor projects --json'],
      async run(ctx) {
        if (ctx.o.json) return ctx.json(await ctx.conn.api('GET', '/api/projects'));
        const list = await listProjects(ctx);
        if (!list.length) return ctx.out('No projects yet: hydor projects new <name> makes one.');
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            list.map((s) => [
              p.bold(s.name) + (s.members?.length ? p.dim(` (${s.members.length} projects)`) : ''),
              p.dim(tildify(s.folder, ctx.look.home)),
              `${s.sessions}`,
              `${s.docs}`,
              p.dim(timeAgo(s.lastAt)),
              p.dim(s.description ?? ''),
            ]),
            { head: ['PROJECT', 'FOLDER', 'SESSIONS', 'DOCS', 'LAST', ''], grow: 5 },
          ),
        );
      },
    },
    {
      name: 'show',
      args: [project],
      summary: 'One project: folder, agent, guidelines',
      examples: ['hydor projects show thesis', 'hydor projects show sp3f --json'],
      async run(ctx, [given]) {
        const s = await findProject(ctx, given);
        const r = await ctx.conn.api<{ space: Space; sessions: string[] }>('GET', `/api/projects/${enc(s.id)}`);
        if (ctx.o.json) return ctx.json(r);
        const sp = r.space;
        const all = sp.members?.length ? await listProjects(ctx) : [];
        const { p } = ctx.look;
        ctx.out([
          p.bold(sp.name),
          ...fields(ctx, [
            ['Id', sp.id],
            ['About', sp.description],
            ['Folder', tildify(sp.folder, ctx.look.home)],
            ['Also works with', sp.folders?.map((f) => tildify(f, ctx.look.home)).join('\n')],
            ['Agent', sp.assistant],
            ['Documents', sp.sharedKnowledge === false ? 'its own only' : 'its own and the shared knowledge'],
            ['Brings together', sp.members?.map((m) => all.find((x) => x.id === m)?.name ?? m).join(', ')],
            ['Colour', sp.color],
            ['Made', when(sp.createdAt)],
            ['Sessions', `${s.sessions} (hydor projects sessions ${s.name.includes(' ') ? s.id : s.name})`],
          ]),
        ]);
        if (sp.instructions) ctx.out(['', p.bold('Guidelines'), ...markdown(ctx, sp.instructions)]);
      },
    },
    {
      name: 'new',
      aliases: ['add', 'create'],
      args: [{ name: 'name', kind: 'text', rest: true }],
      options: {
        description: { type: 'string', value: '<text>', desc: 'What it is about (up to 300 characters)' },
        folder: { type: 'string', value: '<folder>', desc: 'An existing folder to make it around (default: a new one)', kind: 'dir' },
        with: { type: 'strings', value: '<folder>', desc: 'Another folder it works with (again for more)', kind: 'dir' },
        color: { type: 'string', value: '<name>', desc: 'Its colour', values: Object.keys(SPACE_COLORS) },
        instructions: { type: 'string', value: '<text>', desc: 'Its guidelines, in a few words' },
        file: { type: 'string', value: '<path>', desc: 'Its guidelines from a file (- is stdin)', kind: 'file' },
        as: { type: 'string', value: '<agent>', desc: 'The agent its sessions start as', kind: 'agent' },
        'shared-knowledge': { type: 'string', value: 'on|off', desc: 'off: its sessions search only its own documents', values: ['on', 'off'] },
        members: { type: 'strings', value: '<project>', desc: 'Make a group of these projects (again for more)', kind: 'project' },
      },
      summary: 'Make a project',
      help: 'Its folder is made for it (in your task folders) unless you name an existing one with --folder.',
      examples: ['hydor projects new Thesis', 'hydor projects new Notes --folder ~/notes --description "my notes"', 'hydor projects new Thesis --file guidelines.md'],
      async run(ctx, words, v) {
        const body: Record<string, unknown> = { name: words.join(' '), ...fieldsOf(ctx, v) };
        if (str(v, 'folder')) body.folder = folderArg(ctx, str(v, 'folder')!);
        if (strs(v, 'with').length) body.folders = strs(v, 'with').map((f) => folderArg(ctx, f));
        if (strs(v, 'members').length) {
          const list = await listProjects(ctx);
          body.members = strs(v, 'members').map((m) => pickOne(list, m, { id: (s) => s.id, names: (s) => [s.name], what: 'project', hint: PROJECT_HINT }).id);
        }
        const file = str(v, 'file');
        if (file) body.instructions = await ctx.readText({ file });
        const made = await ctx.conn.api<Space>('POST', '/api/projects', body);
        if (ctx.o.json) return ctx.json(made);
        ctx.out(`Made “${made.name}” (${made.id}), in ${tildify(made.folder, ctx.look.home)}.`);
      },
    },
    {
      name: 'rename',
      args: [project, { name: 'name', kind: 'text', rest: true }],
      summary: 'Give a project another name',
      examples: ['hydor projects rename thesis "PhD thesis"'],
      async run(ctx, [given, ...name]) {
        const s = await findProject(ctx, given);
        if (!name.length) throw new UsageError(`Give the new name: ${ctx.usage}`);
        const r = await ctx.conn.api<Space>('PATCH', `/api/projects/${enc(s.id)}`, { name: name.join(' ') });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`“${s.name}” is now “${r.name}”.`);
      },
    },
    {
      name: 'edit',
      aliases: ['set'],
      args: [project],
      options: {
        description: { type: 'string', value: '<text>', desc: 'What it is about ("" clears it)' },
        instructions: { type: 'string', value: '<text>', desc: 'Its guidelines ("" clears them)' },
        file: { type: 'string', value: '<path>', desc: 'Its guidelines from a file (- is stdin)', kind: 'file' },
        as: { type: 'string', value: '<agent>', desc: 'The agent its sessions start as ("" clears it)', kind: 'agent' },
        color: { type: 'string', value: '<name>', desc: 'Its colour', values: Object.keys(SPACE_COLORS) },
        'add-folder': { type: 'strings', value: '<folder>', desc: 'Another folder it works with', kind: 'dir' },
        'remove-folder': { type: 'strings', value: '<folder>', desc: 'A folder it no longer works with (the folder stays)', kind: 'dir' },
        'shared-knowledge': { type: 'string', value: 'on|off', desc: 'off: its sessions search only its own documents', values: ['on', 'off'] },
        ungroup: { type: 'boolean', desc: 'Turn a group back into one project' },
      },
      summary: 'Change description, guidelines, agent, folders',
      help: 'Only what you name changes. With nothing named, on a terminal, its guidelines open in your editor: saving them unchanged changes nothing.',
      examples: [
        'hydor projects edit thesis --description "my PhD"',
        'hydor projects edit thesis',
        'hydor projects edit thesis --file guidelines.md',
        'hydor projects edit thesis --add-folder ~/papers',
      ],
      async run(ctx, [given], v) {
        const s = await findProject(ctx, given);
        const body = fieldsOf(ctx, v);
        const file = str(v, 'file');
        if (file) body.instructions = await ctx.readText({ file });
        const add = strs(v, 'add-folder').map((f) => folderArg(ctx, f));
        const drop = strs(v, 'remove-folder').map((f) => folderArg(ctx, f));
        if (add.length || drop.length) body.folders = [...(s.folders ?? []).filter((f) => !drop.includes(f)), ...add.filter((f) => !(s.folders ?? []).includes(f))];
        if (flag(v, 'ungroup')) body.members = [];
        if (!Object.keys(body).length) {
          // Nothing named: its guidelines, in the editor.
          const text = await ctx.readText({ current: s.instructions ?? '' });
          if (text === null) return ctx.out('Nothing changed.');
          body.instructions = text;
        }
        const r = await ctx.conn.api<Space>('PATCH', `/api/projects/${enc(s.id)}`, body);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(
          `Changed “${r.name}”: ${Object.keys(body)
            .map((k) => (k === 'sharedKnowledge' ? 'documents' : k === 'instructions' ? 'guidelines' : k === 'assistant' ? 'agent' : k))
            .join(', ')}.`,
        );
      },
    },
    {
      name: 'sessions',
      args: [project],
      summary: 'Its sessions, the last at work first',
      examples: ['hydor projects sessions thesis', 'hydor projects sessions thesis -n 5'],
      async run(ctx, [given]) {
        const s = await findProject(ctx, given);
        const r = await ctx.conn.api<{ space: Space; sessions: string[] }>('GET', `/api/projects/${enc(s.id)}`);
        if (ctx.o.json) return ctx.json(r);
        const { sessions: all } = await ctx.conn.api<{ sessions: import('../../../shared/types.ts').SessionSummary[] }>('GET', '/api/sessions?limit=1000');
        const byKey = new Map(all.map((x) => [x.key, x]));
        const list = r.sessions
          .map((k) => byKey.get(k))
          .filter((x): x is NonNullable<typeof x> => !!x)
          .slice(0, ctx.o.limit ?? 25);
        const { sessionLines } = await import('../commands.ts');
        ctx.out(list.length ? sessionLines(list, ctx.look, ctx.fit, ctx.fit) : `No sessions in “${s.name}” yet.`);
      },
    },
    {
      name: 'files',
      args: [project],
      summary: 'The documents it reads, and their folders',
      help: 'These are the documents only the project’s sessions search, besides the shared knowledge. Add a folder to have them read where they are.',
      examples: ['hydor projects files thesis', 'hydor projects files thesis -n 200'],
      async run(ctx, [given]) {
        const s = await findProject(ctx, given);
        const bases = await ownBases(ctx, s);
        const docs = await Promise.all(bases.map((b) => ctx.conn.api<{ docs: KnowledgeDoc[] }>('GET', `/api/knowledge/${enc(b.id)}/docs`).then((r) => r.docs)));
        if (ctx.o.json) return ctx.json({ bases: bases.map((b, i) => ({ ...b, docs: docs[i] })) });
        if (!bases.length) return ctx.out(`“${s.name}” has no documents of its own yet: hydor projects files add ${s.name.includes(' ') ? `"${s.name}"` : s.name} <folder> adds a folder.`);
        const { p } = ctx.look;
        const out: string[] = [];
        const limit = ctx.o.all ? Infinity : (ctx.o.limit ?? 50);
        bases.forEach((b, i) => {
          if (out.length) out.push('');
          out.push(`${p.bold(b.name)} ${p.dim(`${b.docs} documents, ${b.passages} passages${b.indexing ? `, reading ${b.indexing.done} of ${b.indexing.total}` : ''}`)}`);
          for (const src of b.sources.filter((x) => x.kind === 'folder')) out.push(`  ${p.dim('folder')} ${tildify(src.path, ctx.look.home)}`);
          const rows = docs[i]
            .slice(0, limit)
            .map((d) => [
              d.status === 'indexed' ? mark(p, 'on') : d.status === 'error' ? mark(p, 'error') : mark(p, 'off'),
              d.title,
              p.dim(`${d.passages} passages`),
              p.dim(tildify(d.path, ctx.look.home)),
            ]);
          out.push(...table(ctx, rows, { grow: 3 }).map((l) => `  ${l}`));
          if (docs[i].length > rows.length) out.push(p.dim(`  … ${docs[i].length - rows.length} more (-n <number>, or --all)`));
          for (const e of b.errors.slice(0, 3)) out.push(`  ${p.red(`✗ ${tildify(e.path, ctx.look.home)}: ${e.error}`)}`);
        });
        ctx.out(out);
      },
    },
    {
      name: 'files add',
      args: [project, { name: 'folder', kind: 'dir' }],
      summary: 'Read a folder of documents in a project',
      help: 'The folder is read at once and again every hour; nothing is copied. Pictures, hidden files and tool folders are skipped.',
      examples: ['hydor projects files add thesis ~/papers'],
      async run(ctx, [given, folder]) {
        const s = await findProject(ctx, given);
        let [base] = await ownBases(ctx, s);
        if (!base) base = await ctx.conn.api<KnowledgeBase>('POST', '/api/knowledge', { name: s.name, space: s.id });
        const src = await ctx.conn.api<{ path: string }>('POST', `/api/knowledge/${enc(base.id)}/folders`, { path: folderArg(ctx, folder) });
        if (ctx.o.json) return ctx.json(src);
        ctx.out(`“${s.name}” reads ${tildify(src.path, ctx.look.home)} now.`);
      },
    },
    {
      name: 'files remove',
      args: [project, { name: 'what', kind: 'text', rest: true }],
      summary: 'Stop reading a folder, or drop a document',
      help: 'Name a folder by its path, or a document by its title or path. The folder and its files stay where they are.',
      examples: ['hydor projects files remove thesis ~/papers'],
      async run(ctx, [given, ...what]) {
        const s = await findProject(ctx, given);
        if (!what.length) throw new UsageError(`Say what to remove: ${ctx.usage}`);
        const bases = await ownBases(ctx, s);
        type Target = { id: string; names: string[]; label: string; remove: () => Promise<unknown> };
        const targets: Target[] = [];
        for (const b of bases) {
          for (const src of b.sources.filter((x) => x.kind === 'folder'))
            targets.push({
              id: `${b.id}/${src.id}`,
              names: [src.path, src.name, tildify(src.path, ctx.look.home)],
              label: `the folder ${tildify(src.path, ctx.look.home)}`,
              remove: () => ctx.conn.api('DELETE', `/api/knowledge/${enc(b.id)}/sources/${enc(src.id)}`),
            });
          const { docs } = await ctx.conn.api<{ docs: KnowledgeDoc[] }>('GET', `/api/knowledge/${enc(b.id)}/docs`);
          for (const d of docs)
            targets.push({ id: `${b.id}/doc/${d.id}`, names: [d.title, d.path], label: `“${d.title}”`, remove: () => ctx.conn.api('DELETE', `/api/knowledge/${enc(b.id)}/docs/${d.id}`) });
        }
        const t = pickOne(targets, what.join(' '), { id: (x) => x.id, names: (x) => x.names, what: 'document or folder', hint: `hydor projects files ${given ?? '<project>'} lists them` });
        if (!(await ctx.confirm(`Remove ${t.label} from “${s.name}”?`))) return ctx.out('Not removed.');
        await t.remove();
        ctx.out(`Removed ${t.label}.`);
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [project],
      summary: 'Delete a project (its folder stays)',
      help: 'Its knowledge bases become shared and its skills join the skill library.',
      examples: ['hydor projects remove thesis', 'hydor projects remove thesis -y'],
      async run(ctx, [given]) {
        const s = await findProject(ctx, given);
        if (!(await ctx.confirm(`Remove “${s.name}”?`))) return ctx.out('Not removed.');
        const r = await ctx.conn.api<{ ok: boolean; skills?: string[] }>('DELETE', `/api/projects/${enc(s.id)}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(
          `Removed “${s.name}”. Its folder (${tildify(s.folder, ctx.look.home)}), files and sessions stay${r.skills?.length ? `; its skills joined the skill library: ${r.skills.join(', ')}` : ''}.`,
        );
      },
    },
  ],
};

/** The knowledge bases that are the project's own. */
async function ownBases(ctx: Ctx, s: SpaceView): Promise<KnowledgeBase[]> {
  const { bases } = await ctx.conn.api<{ bases: KnowledgeBase[] }>('GET', '/api/knowledge');
  return bases.filter((b) => b.space === s.id);
}
