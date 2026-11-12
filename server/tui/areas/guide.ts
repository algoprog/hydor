// `hydor guide [topic] [section]`: the guide (Help in the app) in the terminal. Without a topic, the topics; with one,
// the topic drawn as Markdown (through the pager when it is longer than the screen); with a section too, just that part.
import { AGENT_TOPICS, type GuideTopic } from '../../../shared/guide.ts';
import { truncate } from '../term.ts';
import { pickOne, markdown, flag, showLong, table, type Area, type Ctx } from './kit.ts';

/** Every topic of the guide (the agents' API topic is left out of lists). */
export async function guideTopics(ctx: Pick<Ctx, 'conn'>): Promise<GuideTopic[]> {
  return (await ctx.conn.api<{ topics: GuideTopic[] }>('GET', '/api/guide')).topics;
}

/** A guide text for a terminal: the pictures (which a terminal cannot show) left out. */
const text = (md: string) => md.replace(/^!\[[^\]]*\]\([^)]*\)[ \t]*\n?/gm, '').replace(/\n{3,}/g, '\n\n');

export const guide: Area = {
  name: 'guide',
  summary: 'Read the guide: how everything in Hydor works',
  help: 'Without a topic, the topics are listed. With one, the topic is shown, through less when it is longer than the screen. Name a topic by its id or its title; add a section to read only that.',
  group: 'this',
  bare: true,
  default: 'guide',
  verbs: [
    {
      name: 'guide',
      args: [
        { name: 'topic', kind: 'topic', optional: true },
        { name: 'section', kind: 'section', optional: true, rest: true },
      ],
      options: { sections: { type: 'boolean', desc: 'List the topic’s sections instead' } },
      summary: 'The guide: topics, a topic, or one section',
      examples: ['hydor guide', 'hydor guide projects', 'hydor guide projects "what a project is"', 'hydor guide sessions --sections'],
      async run(ctx, [given, ...sec], v) {
        const topics = await guideTopics(ctx);
        const { p } = ctx.look;
        if (!given) {
          if (ctx.o.json) return ctx.json({ topics: topics.filter((t) => !AGENT_TOPICS.includes(t.id)).map(({ id, title, summary }) => ({ id, title, summary })) });
          return ctx.out(
            table(
              ctx,
              topics.filter((t) => !AGENT_TOPICS.includes(t.id)).map((t) => [p.accent(t.id), t.title, p.dim(truncate(t.summary.replace(/\s+/g, ' ').split(/(?<=\.)\s/)[0], 110))]),
              { grow: 2 },
            ),
          );
        }
        const t = pickOne(topics, given, { id: (x) => x.id, names: (x) => [x.title], what: 'topic', hint: 'hydor guide lists them' });
        if (flag(v, 'sections')) {
          if (ctx.o.json) return ctx.json({ id: t.id, sections: t.sections.map(({ id, title }) => ({ id, title })) });
          return ctx.out(
            table(
              ctx,
              t.sections.map((s) => [p.accent(s.id), s.title]),
              { grow: 1 },
            ),
          );
        }
        if (sec.length) {
          const s = pickOne(t.sections, sec.join(' '), { id: (x) => x.id, names: (x) => [x.title], what: 'section', hint: `hydor guide ${t.id} --sections lists them` });
          if (ctx.o.json) return ctx.json(s);
          return showLong(ctx, [p.bold(s.title), '', ...markdown(ctx, text(s.text))]);
        }
        if (ctx.o.json) return ctx.json(t);
        await showLong(ctx, [p.bold(t.title), '', ...markdown(ctx, text(t.body))]);
      },
    },
  ],
};
