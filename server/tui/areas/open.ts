// `hydor open [session | page]`: the address of a page of the web app, or of a session in it; --browser opens it. A page
// is one of the app's "Go to" items by name (`library`, `projects`, `inbox`…), `settings [section]`, `guide [topic
// [section]]` or `project <name>`; anything else is a session, named as everywhere (the start of its id, its title).
import { catalogItems, SECTIONS } from '../../../shared/find-catalog.ts';
import { UsageError } from './kit.ts';
import { pickOne, type Area, type Ctx } from './kit.ts';
import { findSession } from './sessions.ts';

/** A name as one word: "Connected apps" → connected-apps. */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The app's pages by the names `hydor open` takes: its own id ("spaces") and the title as a word ("projects"). */
export function pages(): { id: string; names: string[]; title: string; path: string }[] {
  return catalogItems()
    .filter((i) => i.group === 'Go to' && i.path)
    .map((i) => ({ id: i.id.slice(3), names: [i.title, slug(i.title)], title: i.title, path: i.path! }));
}

/** The words Tab completion offers first: each page as a word, then the ones that take a second word. */
export const pageWords = () => [
  ...pages().map((p) => [slug(p.title), p.title] as [string, string]),
  ['settings', 'A Settings section: open settings <section>'] as [string, string],
  ['guide', 'A topic of the guide'] as [string, string],
  ['project', 'One project: open project <name>'] as [string, string],
];

/** The sections of Settings, as `hydor open settings` names them. */
export const settingsSections = () => SECTIONS.map(([id, label, group]) => ({ id, label, group }));

export const open: Area = {
  name: 'open',
  summary: 'The address of a page or a session (--browser opens it)',
  help: 'Without words, the address of the web app. Name a page (library, projects, inbox, experiments… Tab completes them), settings [section], guide [topic [section]], project <name>, or a session as hydor sessions shows it.',
  group: 'this',
  bare: true,
  default: 'open',
  verbs: [
    {
      name: 'open',
      args: [
        { name: 'where', kind: 'page', optional: true },
        { name: 'more', kind: 'place', optional: true, rest: true },
      ],
      options: { browser: { type: 'boolean', desc: 'Open it in your browser too' }, find: { type: 'string', value: '<words>', desc: 'For settings: point at an option by its words' } },
      summary: 'Where a page or session is, in the web app',
      examples: ['hydor open', 'hydor open library', 'hydor open settings memory --browser', 'hydor open guide projects', 'hydor open project thesis', 'hydor open 3f9a'],
      async run(ctx, [where, ...more], v) {
        const at = await address(ctx, where, more, typeof v.find === 'string' ? v.find : undefined);
        if (ctx.o.json) return ctx.json({ url: at });
        ctx.out(at);
        if (v.browser === true) ctx.open?.(at);
      },
    },
  ],
};

/** The address the words name. */
async function address(ctx: Ctx, where: string | undefined, more: string[], find?: string): Promise<string> {
  const base = ctx.conn.base;
  if (!where) return ctx.conn.url();
  const w = where.toLowerCase();
  if (w === 'settings') {
    if (!more.length) return `${base}/settings${find ? `?find=${encodeURIComponent(find)}` : ''}`;
    const s = pickOne(settingsSections(), more.join(' '), { id: (x) => x.id, names: (x) => [x.label], what: 'Settings section', hint: 'Tab completes them' });
    return `${base}/settings?s=${s.id}${find ? `&find=${encodeURIComponent(find)}` : ''}`;
  }
  if (w === 'guide') {
    if (!more.length) return `${base}/guide`;
    const { guideTopics } = await import('./guide.ts');
    const topics = await guideTopics(ctx);
    const t = pickOne(topics, more[0], { id: (x) => x.id, names: (x) => [x.title], what: 'topic', hint: 'hydor guide lists them' });
    const s =
      more.length > 1 ? pickOne(t.sections, more.slice(1).join(' '), { id: (x) => x.id, names: (x) => [x.title], what: 'section', hint: `hydor guide ${t.id} --sections lists them` }) : undefined;
    return `${base}/guide/${encodeURIComponent(t.id)}${s ? `#${encodeURIComponent(s.id)}` : ''}`;
  }
  if ((w === 'project' || (w === 'projects' && more.length)) && more.length) {
    const { spaces } = await ctx.conn.api<{ spaces: { id: string; name: string }[] }>('GET', '/api/projects');
    const p = pickOne(spaces, more.join(' '), { id: (x) => x.id, names: (x) => [x.name], what: 'project', hint: 'hydor projects lists them' });
    return `${base}/projects/${encodeURIComponent(p.id)}`;
  }
  if (w === 'project') return `${base}/projects`;
  if (more.length) throw new UsageError(`Too many words: ${ctx.usage}`);
  const list = pages();
  const exact = list.find((p) => p.id === w || p.names.some((n) => n.toLowerCase() === w));
  if (exact) return `${base}${exact.path}`;
  // A session, as named everywhere.
  try {
    return ctx.conn.url((await findSession(ctx, where)).key);
  } catch (e) {
    if (!(e instanceof UsageError) || !/^No session/.test(e.message)) throw e;
  }
  const near = list.filter((p) => p.id.startsWith(w) || p.names.some((n) => n.toLowerCase().startsWith(w)));
  if (near.length === 1) return `${base}${near[0].path}`;
  throw new UsageError(
    `“${where}” is no page, and no session’s key or title${
      near.length
        ? ` (pages like it: ${near
            .slice(0, 5)
            .map((p) => slug(p.title))
            .join(', ')})`
        : ''
    }: Tab completes the pages`,
  );
}
