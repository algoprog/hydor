// `hydor find <words>`: what the search box (Ctrl+K) finds, grouped: sessions, messages (the matches in bold), memory,
// and the rest found by meaning (pages, Settings options, your apps, agents, skills, projects, the guide…), each with
// its address in the app. `--open <n>` opens one in the browser. The app's own things are named from the catalog
// shipped with it; yours from their lists.
import { catalogItems } from '../../../shared/find-catalog.ts';
import { tildify, timeAgo, truncate } from '../term.ts';
import { boldMatches } from './sessions.ts';
import { num, str, table, UsageError, type Area, type Ctx } from './kit.ts';

interface Result {
  group: string;
  title: string;
  where?: string;
  /** Where it is in the app, a path (or a whole address). */
  path?: string;
}

/** The order of groups after sessions, messages and memory. */
const ORDER = ['Go to', 'Settings', 'Projects', 'Apps', 'Agents', 'Scheduled tasks', 'Skills', 'Plugins', 'Pages', 'Pictures, videos and audio', 'Connections', 'Guide', 'Actions', 'Themes'];

const PLACES = ['sessions', 'messages', 'spaces', 'pages', 'templates', 'files', 'memory', 'tasks', 'assistants', 'skills', 'connections', 'settings', 'actions', 'guide'];

const enc = encodeURIComponent;

/** Names for what search found by meaning: the app's own from the catalog, yours from their lists (the id when a list does not have it). */
export async function describeAlike(ctx: Pick<Ctx, 'conn'>, alike: { id: string }[]): Promise<Result[]> {
  const shipped = new Map(catalogItems().map((i) => [i.id, i]));
  const kinds = new Set(alike.map((a) => a.id.split(':')[0]));
  const get = <T>(path: string, want: string) => (kinds.has(want) ? ctx.conn.api<T>('GET', path).catch(() => null) : Promise.resolve(null));
  const [apps, tasks, assts, skills, pgs, conns, spaces, guide, media, plugins] = await Promise.all([
    get<{ apps?: { id: string; name: string }[]; templates?: { id: string; name: string }[] }>('/api/apps', 'app'),
    get<{ tasks?: { id: string; name: string }[] }>('/api/tasks', 'task'),
    get<{ assistants?: { id: string; name: string }[] } | { id: string; name: string }[]>('/api/assistants', 'asst'),
    get<{ skills?: { name: string }[] }>('/api/skillpack', 'skill'),
    get<{ pages?: { id: string; title: string }[] }>('/api/pages', 'page'),
    get<{ connections?: { id: string; name: string }[] }>('/api/connections', 'conn'),
    get<{ spaces?: { id: string; name: string }[] }>('/api/projects', 'space'),
    get<{ topics?: { id: string; title: string; sections: { id: string; title: string }[] }[] }>('/api/guide', 'guide'),
    get<{ items?: { id: string; title: string }[] }>('/api/media', 'media'),
    get<{ installed?: { name: string; title: string }[]; available?: { name: string; title: string }[] }>('/api/plugins', 'plugin'),
  ]);
  const name = <T extends { id: string }>(list: T[] | undefined, id: string, f: (t: T) => string) => {
    const t = list?.find((x) => x.id === id);
    return t ? f(t) : undefined;
  };
  return alike.map(({ id }): Result => {
    const [kind, ...rest] = id.split(':');
    const tail = rest.join(':');
    const known = shipped.get(id);
    if (known) {
      const path = known.path ?? (known.section ? `/settings?s=${known.section}${known.find ? `&find=${enc(known.find)}` : ''}` : undefined);
      return { group: known.group, title: known.title, where: known.where, path };
    }
    switch (kind) {
      case 'app': {
        const tpl = tail.startsWith('tpl:');
        const n = tpl ? name(apps?.templates, tail.slice(4), (t) => t.name) : name(apps?.apps, tail, (t) => t.name);
        return { group: 'Apps', title: n ?? id, path: tpl ? `/apps/t/${enc(tail.slice(4))}` : `/apps/${enc(tail)}` };
      }
      case 'task': {
        const n = name(tasks?.tasks, tail, (t) => t.name);
        return { group: 'Scheduled tasks', title: n ?? id, path: `/settings?s=tasks${n ? `&find=${enc(n)}` : ''}` };
      }
      case 'asst': {
        const n = name(Array.isArray(assts) ? assts : assts?.assistants, tail, (t) => t.name);
        return { group: 'Agents', title: n ?? id, path: `/agents/${enc(tail)}` };
      }
      case 'skill':
        return { group: 'Skills', title: skills?.skills?.find((s) => s.name === tail)?.name ?? tail, path: `/settings?s=skills&find=${enc(tail)}` };
      case 'plugin': {
        const p = [...(plugins?.installed ?? []), ...(plugins?.available ?? [])].find((x) => x.name === tail);
        return { group: 'Plugins', title: p?.title ?? tail, path: `/settings?s=plugins&plugin=${enc(tail)}` };
      }
      case 'page':
        return { group: 'Pages', title: name(pgs?.pages, tail, (t) => t.title) ?? id, path: `/pages/${enc(tail)}` };
      case 'media':
        return { group: 'Pictures, videos and audio', title: name(media?.items, tail, (t) => t.title) ?? id, path: `/media/${enc(tail)}` };
      case 'conn':
        return { group: 'Connections', title: name(conns?.connections, tail, (t) => t.name) ?? id, path: '/apps/connected?tab=connected' };
      case 'space':
        return { group: 'Projects', title: name(spaces?.spaces, tail, (t) => t.name) ?? id, path: `/projects/${enc(tail)}` };
      case 'guide': {
        const [t, s] = tail.split('#');
        const topic = guide?.topics?.find((x) => x.id === t);
        const sec = s ? topic?.sections.find((x) => x.id === s) : undefined;
        return { group: 'Guide', title: sec?.title ?? topic?.title ?? id, where: sec && topic ? `Help › ${topic.title}` : undefined, path: `/guide/${enc(t)}${s ? `#${enc(s)}` : ''}` };
      }
      default:
        return { group: 'Other', title: id };
    }
  });
}

export const find: Area = {
  name: 'find',
  summary: 'Search everything, as the search box does',
  help: 'Looks in your sessions and what was said in them, your memory, and (by meaning) the app’s pages and settings, your apps, agents, skills, projects and the guide. Each result has its address; --open <n> opens the nth in your browser.',
  group: 'this',
  bare: true,
  default: 'find',
  verbs: [
    {
      name: 'find',
      args: [{ name: 'words', kind: 'text', rest: true }],
      options: {
        in: { type: 'string', value: '<places>', desc: 'Look only here (comma-separated)', values: PLACES },
        open: { type: 'string', value: '<n>', desc: 'Open the nth result in your browser' },
      },
      summary: 'Search everything the search box does',
      examples: ['hydor find rate limit', 'hydor find dark mode --in settings', 'hydor find thesis deadline --open 1'],
      async run(ctx, words, v) {
        const q = words.join(' ').trim();
        const open = num(v, 'open', 1);
        const where = str(v, 'in');
        const r = await ctx.conn.api<{
          meaning?: boolean;
          sessions?: { key: string; title: string; firstPrompt?: string; cwd: string; updatedAt: number }[];
          messages?: { key: string; title: string; cwd: string; updatedAt: number; snippet?: string }[];
          notes?: { id: string; scope: string; text: string; updatedAt: number }[];
          alike?: { id: string; score: number }[];
        }>('GET', `/api/find?q=${encodeURIComponent(q)}${where ? `&in=${encodeURIComponent(where)}` : ''}`);
        if (ctx.o.json) return ctx.json(r);
        const { p } = ctx.look;
        const sessions: Result[] = (r.sessions ?? []).map((s) => ({
          group: 'Sessions',
          title: s.title || s.firstPrompt || '(untitled)',
          where: `${tildify(s.cwd, ctx.look.home)} · ${timeAgo(s.updatedAt)}`,
          path: `/s/${encodeURIComponent(s.key)}`,
        }));
        const messages: Result[] = (r.messages ?? []).map((m) => ({
          group: 'Messages',
          title: boldMatches(m.snippet ?? '', p.bold),
          where: m.title || '(untitled)',
          path: `/s/${encodeURIComponent(m.key)}`,
        }));
        const notes: Result[] = (r.notes ?? []).map((n) => ({ group: 'Memory', title: n.text.replace(/\s+/g, ' '), where: n.scope, path: '/settings?s=memory' }));
        const alike = await describeAlike(ctx, (r.alike ?? []).slice(0, ctx.o.limit ?? 20));
        const all = [...sessions, ...messages, ...notes, ...ORDER.flatMap((g) => alike.filter((a) => a.group === g)), ...alike.filter((a) => !ORDER.includes(a.group))];
        if (!all.length) return ctx.out(`Nothing found for “${q}”.`);
        const out: string[] = [];
        let n = 0;
        for (const group of [...new Set(all.map((x) => x.group))]) {
          if (out.length) out.push('');
          out.push(p.bold(group));
          const rows = all
            .filter((x) => x.group === group)
            .map((x) => [p.dim(`${++n}`), group === 'Messages' ? x.title : x.title, p.dim(x.where ?? ''), p.dim(x.path ? `${ctx.conn.base}${x.path}` : '')]);
          out.push(...table(ctx, rows, { grow: 1 }).map((l) => `  ${l}`));
        }
        ctx.out(out);
        if (open !== undefined) {
          const hit = all[open - 1];
          if (!hit) throw new UsageError(`There is no result ${open}: ${all.length} found`);
          if (!hit.path) throw new UsageError(`Result ${open} (“${truncate(hit.title, 40)}”) has no page of its own to open`);
          ctx.open?.(`${ctx.conn.base}${hit.path}`);
        }
      },
    },
  ],
};
