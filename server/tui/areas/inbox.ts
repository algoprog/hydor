// `hydor inbox`: everything waiting on you, across sessions: approvals, questions, forms, a browser that needs you, a
// key an agent asked for, a skill to review. Read only here: answering is done in the app (the address is shown) or in
// the session itself.
import { timeAgo, truncate } from '../term.ts';
import { choose, fields, mark, table, type Area, type Ctx } from './kit.ts';

interface Item {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  key?: string;
  session?: string;
  agent?: string;
  at: number;
  path?: string;
}

const items = async (ctx: Ctx) => (await ctx.conn.api<{ items: Item[] }>('GET', '/api/inbox')).items;

export const inbox: Area = {
  name: 'inbox',
  summary: 'Everything waiting on you',
  help: 'Approvals, questions and forms in sessions, a browser that needs you, a key an agent asked for, a skill to review. Answer them in the session or in the app: each shows its address.',
  group: 'sessions',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'What waits on you, newest first',
      examples: ['hydor inbox', 'hydor inbox --json'],
      async run(ctx) {
        if (ctx.o.json) return ctx.json({ items: await items(ctx) });
        const list = await items(ctx);
        if (!list.length) return ctx.out('Nothing is waiting on you.');
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            list
              .slice(0, ctx.o.limit ?? 50)
              .map((i, n) => [p.dim(`${n + 1}`), mark(p, 'attention'), p.dim(i.kind), i.title.replace(/\s+/g, ' '), p.dim(truncate(i.session ?? '', 30)), p.dim(timeAgo(i.at))]),
            { grow: 3 },
          ),
        );
      },
    },
    {
      name: 'show',
      args: [{ name: 'item', kind: 'text', pick: true }],
      summary: 'One item: what it asks and where to answer',
      help: 'Name it by its number in hydor inbox, its id, or the start of its title.',
      examples: ['hydor inbox show 1'],
      async run(ctx, [given]) {
        const list = await items(ctx);
        const byNumber = /^\d+$/.test(given ?? '') ? list[Number(given) - 1] : undefined;
        const i =
          byNumber ?? (await choose(ctx, list, given, { id: (x) => x.id, names: (x) => [x.title], what: 'item', hint: 'hydor inbox lists them', label: (x) => x.title, detail: (x) => x.session }));
        if (ctx.o.json) return ctx.json(i);
        ctx.out(
          fields(ctx, [
            ['Title', i.title],
            ['Kind', i.kind],
            ['Session', i.session],
            ['Agent', i.agent],
            ['When', timeAgo(i.at)],
            ['Details', i.detail],
            ['Answer at', i.path ? `${ctx.conn.base}${i.path}` : i.key ? ctx.conn.url(i.key) : undefined],
          ]),
        );
      },
    },
  ],
};
