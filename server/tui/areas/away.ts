// `hydor away`: what happened since your last visit, as the start page's "While you were away" shows it (GET /api/away):
// what waits on you, sessions that finished (done or failed), what ran by itself and what runs next today; and
// `hydor away seen`, Mark all as seen.
import type { AwayRow, AwaySummary } from '../../../shared/away.ts';
import { timeAgo, truncate } from '../term.ts';
import { mark, table, type Area, type Ctx } from './kit.ts';

/** Your midnight, for what runs next today. */
const endOfToday = (now = Date.now()) => {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
};

const summary = (ctx: Ctx) => ctx.conn.api<AwaySummary>('GET', `/api/away?until=${endOfToday()}`);

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "Since 09:15", "Since yesterday 18:40", "Since Mon 18:40", "Since 3 Nov". */
export function sinceWords(t: number, now = Date.now()): string {
  const n = new Date(now);
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const d = new Date(t);
  if (t >= today) return `Since ${clock(t)}`;
  if (t >= today - 86_400_000) return `Since yesterday ${clock(t)}`;
  if (t >= today - 6 * 86_400_000) return `Since ${d.toLocaleDateString([], { weekday: 'short' })} ${clock(t)}`;
  return `Since ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

/** The start page's folded line. */
export function awayLine(s: AwaySummary, now = Date.now()): string {
  const c = s.counts;
  const next = s.next[0];
  return [
    sinceWords(s.since, now),
    c.done ? `${c.done} done` : '',
    c.needs ? (c.needs === 1 ? '1 needs you' : `${c.needs} need you`) : '',
    c.failed ? `${c.failed} failed` : '',
    c.quiet ? `${c.quiet} with nothing new` : '',
    next ? `next: ${next.name} at ${clock(next.at)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const WORD: Record<AwayRow['outcome'], string> = { waiting: 'needs you', done: 'done', failed: 'failed', quiet: 'nothing new' };
const BY = { task: 'task', agent: 'agent', app: 'app' } as const;

export const away: Area = {
  name: 'away',
  summary: 'What happened while you were away',
  help: 'Since your last visit to the app (the end of the last time it was open, in front and in use for a minute or more, on any device): what waits on you, sessions that finished or failed, scheduled tasks’, agents’ and apps’ runs with how they went and their cost, and what runs next today. The start page shows the same under the message box. hydor away seen clears it, as Mark all as seen does.',
  group: 'sessions',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'Since your last visit, most important first',
      examples: ['hydor away', 'hydor away --json'],
      async run(ctx) {
        const s = await summary(ctx);
        if (ctx.o.json) return ctx.json(s);
        const news = s.counts.needs + s.counts.done + s.counts.failed > 0;
        if (!news) return ctx.out(`Nothing new ${sinceWords(s.since).replace(/^Since/, 'since')}.`);
        const { p } = ctx.look;
        const rows = s.rows.slice(0, ctx.o.limit ?? 50);
        const where = (r: AwayRow) => (r.group === 'needs' ? (r.session ?? '') : r.group === 'ran' && r.by ? (r.by === 'agent' && r.byName ? r.byName : BY[r.by]) : '');
        ctx.out([
          awayLine(s),
          '',
          ...table(
            ctx,
            rows.map((r, n) => [
              p.dim(`${n + 1}`),
              mark(p, r.group === 'needs' ? 'attention' : r.outcome === 'failed' ? 'error' : r.outcome === 'quiet' ? 'off' : 'done'),
              p.dim(WORD[r.outcome]),
              r.title.replace(/\s+/g, ' '),
              p.dim(truncate(r.line ?? where(r), 60)),
              p.dim(r.costUsd ? `$${r.costUsd.toFixed(2)}` : ''),
              p.dim(timeAgo(r.at)),
            ]),
            { grow: 3 },
          ),
          ...(s.next.length ? ['', `Next today: ${s.next.map((x) => `${x.name} ${clock(x.at)}`).join(' · ')}`] : []),
          ...(rows.length ? ['', p.dim(`Open one at ${ctx.conn.base}${rows[0].path}, and the rest the same way (hydor away --json has each address).`)] : []),
        ]);
      },
    },
    {
      name: 'seen',
      args: [],
      summary: 'Mark all as seen: clear what it lists',
      help: 'What it lists now counts as seen, and the sessions in it as opened (on every device); what happens from now on shows again.',
      examples: ['hydor away seen'],
      async run(ctx) {
        const s = await summary(ctx);
        await ctx.conn.api('POST', '/api/away/seen', { at: s.now });
        if (ctx.o.json) return ctx.json({ ok: true });
        ctx.out('Marked all as seen.');
      },
    },
  ],
};
