// `hydor sessions <verb>`: what the sidebar and a session's menu do. With no verb, `hydor sessions` lists as it always
// has (the command's own code in commands.ts); `show`, `send` and `stop` stay top-level commands too. Naming a session:
// its id or the start of it as `hydor sessions` shows it, its full key, or its title (any case, when only one fits).
import type { SessionSummary, LiveState } from '../../../shared/types.ts';
import { enc } from '../client.ts';
import { tildify, timeAgo, truncate } from '../term.ts';
import { choose, fields, mark, pickOne, flag, num, str, table, UsageError, type Area, type Ctx } from './kit.ts';

const session = { name: 'session', kind: 'session', pick: true } as const;
const HINT = 'hydor sessions lists them';
const titleOf = (s: Pick<SessionSummary, 'title' | 'firstPrompt'>) => s.title || s.firstPrompt || '(untitled)';

/** The sessions as the sidebar lists them (helpers left out unless --all); `archived`: those archived instead. */
export async function listSessions(ctx: Ctx, archived = false): Promise<SessionSummary[]> {
  const { sessions } = await ctx.conn.api<{ sessions: SessionSummary[] }>('GET', `/api/sessions?limit=1000${archived ? '&archived=1' : ''}`);
  return ctx.o.all ? sessions : sessions.filter((s) => !s.extra?.parent);
}

/** The session named, or picked on a terminal when none is: by key, id (or its start) or title. */
export async function findSession(ctx: Ctx, given: string | undefined, o: { archived?: boolean } = {}): Promise<SessionSummary> {
  if (given && /^(claude|codex|acp):[A-Za-z0-9._-]{4,80}$/.test(given)) {
    const one = await ctx.conn.api<{ summary: SessionSummary | null }>('GET', `/api/sessions/${enc(given)}`);
    return one.summary ?? ({ key: given, id: given.split(':')[1], title: given } as SessionSummary);
  }
  const list = await listSessions(ctx, o.archived);
  return choose(ctx, list, given, {
    id: (s) => s.id,
    names: (s) => [s.title, s.key],
    what: 'session',
    hint: HINT,
    label: (s) => truncate(titleOf(s), 60),
    detail: (s) => `${tildify(s.cwd, ctx.look.home)} · ${timeAgo(s.updatedAt)}`,
  });
}

const name = (s: SessionSummary) => `“${truncate(titleOf(s), 60)}”`;

/** Each of a session's flags: one verb apiece. */
function flagVerb(verb: string, body: Record<string, unknown>, done: (n: string) => string, summary: string, archived = false) {
  return {
    name: verb,
    args: [session],
    summary,
    examples: [`hydor sessions ${verb} 3f9a`],
    async run(ctx: Ctx, [given]: string[]) {
      const s = await findSession(ctx, given, { archived });
      await ctx.conn.api('POST', `/api/sessions/${enc(s.key)}/flags`, body);
      if (ctx.o.json) return ctx.json({ ok: true, key: s.key });
      ctx.out(done(name(s)));
    },
  };
}

/** When "snooze" until: `30m`, `2h`, `3d`, `1w`, `tomorrow`, `18:30`, `tomorrow 9:00`, or a date (`2026-12-01`, `2026-12-01 09:00`). Null when it is none of those or is past. */
export function parseUntil(text: string, now = Date.now()): number | null {
  const t = text.trim().toLowerCase();
  const rel = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)$/.exec(t);
  if (rel) {
    const unit = rel[2][0] === 'm' ? 60_000 : rel[2][0] === 'h' ? 3_600_000 : rel[2][0] === 'd' ? 86_400_000 : 604_800_000;
    return now + Number(rel[1]) * unit;
  }
  const clock = (h: number, m: number, days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const tm = /^(?:(tomorrow)\s+)?(\d{1,2}):(\d{2})$/.exec(t);
  if (tm) {
    const at = clock(Number(tm[2]), Number(tm[3]), tm[1] ? 1 : 0);
    return at > now ? at : tm[1] ? null : clock(Number(tm[2]), Number(tm[3]), 1);
  }
  if (t === 'tomorrow') return clock(8, 0, 1);
  if (/^\d{4}-\d{2}-\d{2}( \d{1,2}:\d{2})?$/.test(t)) {
    const at = new Date(t.length === 10 ? `${t}T08:00:00` : t.replace(' ', 'T')).getTime();
    return Number.isFinite(at) && at > now ? at : null;
  }
  return null;
}

/** A line of a search hit's snippet: the matches (between \u0001 and \u0002) in bold. */
export const boldMatches = (snippet: string, bold: (s: string) => string) =>
  snippet
    .replace(/\s+/g, ' ')
    .replace(/\u0001(.*?)\u0002/g, (_, m) => bold(m))
    .replace(/[\u0001\u0002]/g, '');

const sessionOf = (ctx: Ctx, key: string) => ctx.conn.api<{ summary: SessionSummary | null; live: LiveState | null }>('GET', `/api/sessions/${enc(key)}`);
/** The messages waiting in a session, and whether the queue is held. */
const queueOf = async (ctx: Ctx, key: string) => {
  const one = await sessionOf(ctx, key);
  return { queue: one.summary?.queue ?? [], held: !!one.summary?.queueHeld };
};

export const sessions: Area = {
  name: 'sessions',
  aliases: ['session'],
  summary: 'The sessions: find, rename, pin, archive, queue…',
  help: 'Name a session by its key as hydor sessions shows it (the start is enough), its full key, or its title; on a terminal, leave it out to pick from a list. With no verb, the sessions are listed.',
  group: 'sessions',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'The latest sessions and what each is doing',
      examples: ['hydor sessions', 'hydor sessions list -n 5'],
      async run(ctx) {
        const limit = ctx.o.all ? 300 : (ctx.o.limit ?? 25);
        const { sessions: all, total } = await ctx.conn.api<{ sessions: SessionSummary[]; total: number }>('GET', `/api/sessions?limit=${ctx.o.all ? 300 : Math.min(300, limit * 3)}`);
        const list = (ctx.o.all ? all : all.filter((s) => !s.extra?.parent)).slice(0, limit);
        if (ctx.o.json) return ctx.json({ sessions: list, total });
        const { sessionLines } = await import('../commands.ts');
        ctx.out(sessionLines(list, ctx.look, ctx.fit, ctx.fit));
      },
    },
    {
      name: 'search',
      args: [{ name: 'words', kind: 'text', rest: true }],
      summary: 'Find sessions by title, folder or words',
      examples: ['hydor sessions search login bug', 'hydor sessions search "rate limit" -n 5'],
      async run(ctx, words) {
        const r = await ctx.conn.api<{ hits: { key: string; title: string; cwd: string; updatedAt: number; kind: string; snippet?: string }[] }>(
          'GET',
          `/api/search?q=${encodeURIComponent(words.join(' '))}`,
        );
        if (ctx.o.json) return ctx.json(r);
        const hits = r.hits.slice(0, ctx.o.limit ?? 25);
        if (!hits.length) return ctx.out(`Nothing found for “${words.join(' ')}”.`);
        const { keyLength, shortKey } = await import('../commands.ts');
        const n = keyLength(hits.map((h) => ({ id: h.key.split(':')[1] ?? h.key })));
        const { p } = ctx.look;
        const out: string[] = [];
        for (const h of hits) {
          out.push(
            `${p.dim(shortKey({ id: h.key.split(':')[1] ?? h.key }, n))}  ${p.bold(truncate(h.title || '(untitled)', 70))}  ${p.dim(`${tildify(h.cwd, ctx.look.home)} · ${timeAgo(h.updatedAt)}`)}`,
          );
          if (h.snippet) out.push(`          ${truncate(boldMatches(h.snippet, p.bold), Math.max(20, ctx.look.width - 12))}`);
        }
        ctx.out(out);
      },
    },
    {
      name: 'rename',
      args: [session, { name: 'title', kind: 'text', rest: true, optional: true }],
      options: { reset: { type: 'boolean', desc: 'Give back the agent’s own title' } },
      summary: 'Give a session another title',
      examples: ['hydor sessions rename 3f9a "Fix the login bug"', 'hydor sessions rename 3f9a --reset'],
      async run(ctx, [given, ...title], v) {
        const s = await findSession(ctx, given);
        if (!title.length && !flag(v, 'reset')) throw new UsageError(`Give the new title (or --reset): ${ctx.usage}`);
        await ctx.conn.api('POST', `/api/sessions/${enc(s.key)}/rename`, { title: title.join(' ') });
        if (ctx.o.json) return ctx.json({ ok: true, key: s.key });
        ctx.out(title.length ? `${name(s)} is now “${title.join(' ')}”.` : `${name(s)} has the agent’s own title again.`);
      },
    },
    flagVerb('archive', { archived: true }, (n) => `Archived ${n}.`, 'Put a session away (it stays, out of the list)'),
    flagVerb('unarchive', { archived: false }, (n) => `${n} is back in the list.`, 'Bring an archived session back', true),
    flagVerb('pin', { pinned: true }, (n) => `Pinned ${n}.`, 'Keep a session at the top of the list'),
    flagVerb('unpin', { pinned: false }, (n) => `Unpinned ${n}.`, 'Take a session off the top of the list'),
    {
      name: 'read',
      args: [session],
      summary: 'Mark a session read',
      examples: ['hydor sessions read 3f9a'],
      async run(ctx, [given]) {
        const s = await findSession(ctx, given);
        await ctx.conn.api('POST', `/api/sessions/${enc(s.key)}/seen`, {});
        if (ctx.o.json) return ctx.json({ ok: true, key: s.key });
        ctx.out(`Marked ${name(s)} read.`);
      },
    },
    {
      name: 'snooze',
      args: [session, { name: 'until', kind: 'text', rest: true }],
      summary: 'Hide a session until later (or off)',
      help: 'It comes back at that time, or as soon as it needs you. Say when as 30m, 2h, 3d, 1w, tomorrow, 18:30, tomorrow 9:00 or a date like 2026-12-01; off brings it back now.',
      examples: ['hydor sessions snooze 3f9a 2h', 'hydor sessions snooze 3f9a tomorrow 9:00', 'hydor sessions snooze 3f9a off'],
      async run(ctx, [given, ...when]) {
        const s = await findSession(ctx, given);
        const text = when.join(' ');
        const off = /^(off|none|no)$/i.test(text);
        const at = off ? null : parseUntil(text);
        if (at === null && !off) throw new UsageError(`“${text}” is not a time to wait until: 30m, 2h, 3d, 1w, tomorrow, 18:30, a date like 2026-12-01, or off`);
        await ctx.conn.api('POST', `/api/sessions/${enc(s.key)}/flags`, { snoozedUntil: at });
        if (ctx.o.json) return ctx.json({ ok: true, key: s.key, snoozedUntil: at });
        ctx.out(
          at === null
            ? `${name(s)} is back.`
            : `${name(s)} is out of the list until ${new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`,
        );
      },
    },
    {
      name: 'move',
      args: [session, { name: 'project', kind: 'project' }],
      summary: 'Put a session in a project (or none)',
      help: 'Its guidelines and documents are the project’s from its next message. Say none to take it out of its project.',
      examples: ['hydor sessions move 3f9a thesis', 'hydor sessions move 3f9a none'],
      async run(ctx, [given, project]) {
        const s = await findSession(ctx, given);
        let id: string | null = null;
        let label = 'no project';
        if (!/^(none|no)$/i.test(project)) {
          const { spaces } = await ctx.conn.api<{ spaces: { id: string; name: string }[] }>('GET', '/api/projects');
          const p = pickOne(spaces, project, { id: (x) => x.id, names: (x) => [x.name], what: 'project', hint: 'hydor projects lists them' });
          id = p.id;
          label = `“${p.name}”`;
        }
        const r = await ctx.conn.api('PATCH', `/api/sessions/${enc(s.key)}/extra`, { space: id });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`${name(s)} is in ${label} now.`);
      },
    },
    {
      name: 'fork',
      args: [session, { name: 'message', kind: 'text', rest: true, optional: true }],
      summary: 'Start a copy of a session from here',
      help: 'The new session has this conversation, then your message (default: “Carry on from here.”) and starts working on it at once. The original stays.',
      examples: ['hydor sessions fork 3f9a "try it with a cache instead"'],
      async run(ctx, [given, ...message]) {
        const s = await findSession(ctx, given);
        const r = await ctx.conn.api<{ key: string }>('POST', `/api/sessions/${enc(s.key)}/fork`, { text: message.join(' ') || 'Carry on from here.' });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Forked ${name(s)}: ${ctx.conn.url(r.key)}`);
      },
    },
    {
      name: 'goal',
      args: [session, { name: 'goal', kind: 'text', rest: true, optional: true }],
      options: {
        clear: { type: 'boolean', desc: 'Drop the goal' },
        pause: { type: 'boolean', desc: 'Pause it (Codex and Custom)' },
        resume: { type: 'boolean', desc: 'Go on with a paused goal (Codex and Custom)' },
      },
      summary: 'See, set, pause or clear a session’s goal',
      help: 'A goal is what the agent keeps working towards, turn after turn, until it holds: say what “done” looks like. It keeps an agent working (and spending), so it is set only when you give the words.',
      examples: ['hydor sessions goal 3f9a', 'hydor sessions goal 3f9a "all tests pass and the PR is open"', 'hydor sessions goal 3f9a --clear'],
      async run(ctx, [given, ...words], v) {
        const s = await findSession(ctx, given);
        const acts = (['clear', 'pause', 'resume'] as const).filter((a) => flag(v, a));
        if (acts.length > 1 || (acts.length && words.length)) throw new UsageError(`Pick one: a goal in words, --clear, --pause or --resume: ${ctx.usage}`);
        if (!acts.length && !words.length) {
          const live = (await sessionOf(ctx, s.key)).live;
          if (ctx.o.json) return ctx.json({ goal: live?.goal ?? null });
          const g = live?.goal;
          if (!g) return ctx.out(`${name(s)} has no goal.`);
          return ctx.out(
            fields(ctx, [
              ['Goal', g.objective],
              ['State', g.status],
              ['Checked', g.turns ? `${g.turns} times, not yet met` : undefined],
              ['Why not yet', g.reason],
            ]),
          );
        }
        const body = words.length ? { action: 'set', objective: words.join(' ') } : { action: acts[0] };
        await ctx.conn.api('POST', `/api/sessions/${enc(s.key)}/goal`, body);
        if (ctx.o.json) return ctx.json({ ok: true });
        ctx.out(words.length ? `Goal set for ${name(s)}.` : acts[0] === 'clear' ? `Goal cleared for ${name(s)}.` : `Goal ${acts[0] === 'pause' ? 'paused' : 'resumed'} for ${name(s)}.`);
      },
    },
    {
      name: 'share',
      args: [session],
      options: {
        days: { type: 'string', value: '<n>', desc: 'The link works this many days (default: until turned off)' },
        list: { type: 'boolean', desc: 'List the links that work now' },
        stop: { type: 'string', value: '<id>', desc: 'Turn one link off' },
      },
      summary: 'A read-only link to a session',
      help: 'Anyone with the link can read the session (not a confidential one). List the links that work with --list and turn one off with --stop <id>.',
      examples: ['hydor sessions share 3f9a', 'hydor sessions share 3f9a --days 7', 'hydor sessions share 3f9a --list'],
      async run(ctx, [given], v) {
        const s = await findSession(ctx, given);
        const base = `/api/sessions/${enc(s.key)}/guest-links`;
        if (str(v, 'stop')) {
          await ctx.conn.api('DELETE', `/api/guest-links/${enc(str(v, 'stop')!)}`);
          return ctx.o.json ? ctx.json({ ok: true }) : ctx.out('Turned that link off.');
        }
        if (flag(v, 'list')) {
          const r = await ctx.conn.api<{ links?: { id: string; token?: string; expiresAt?: number | null; createdAt?: number }[] }>('GET', base);
          if (ctx.o.json) return ctx.json(r);
          const links = r.links ?? [];
          if (!links.length) return ctx.out(`${name(s)} has no links that work.`);
          return ctx.out(
            table(
              ctx,
              links.map((l) => [l.id, l.token ? `${ctx.conn.base}/g/${l.token}` : '', ctx.look.p.dim(l.expiresAt ? `until ${new Date(l.expiresAt).toLocaleDateString('en-GB')}` : 'until turned off')]),
              { head: ['ID', 'LINK', ''], grow: 1 },
            ),
          );
        }
        const days = num(v, 'days', 1);
        const r = await ctx.conn.api<{ id: string; token: string }>('POST', base, { days: days ?? null });
        if (ctx.o.json) return ctx.json(r);
        ctx.out([
          `${ctx.conn.base}/g/${r.token}`,
          ctx.look.p.dim(`Anyone with this link can read ${name(s)}${days ? ` for ${days} days` : ' until you turn it off'}: hydor sessions share ${given ?? '<session>'} --stop ${r.id}`),
        ]);
      },
    },
    {
      name: 'changes',
      args: [session],
      summary: 'The files a session changed',
      examples: ['hydor sessions changes 3f9a'],
      async run(ctx, [given]) {
        const s = await findSession(ctx, given);
        const r = await ctx.conn.api<{ files: { path: string; added: number; removed: number; edits: unknown[] }[] }>('GET', `/api/sessions/${enc(s.key)}/changes`);
        if (ctx.o.json) return ctx.json(r);
        if (!r.files.length) return ctx.out(`${name(s)} changed no files.`);
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            r.files.map((f) => [p.green(`+${f.added}`), p.red(`-${f.removed}`), p.dim(`${f.edits.length} edit${f.edits.length === 1 ? '' : 's'}`), tildify(f.path, ctx.look.home)]),
            { grow: 3 },
          ),
        );
      },
    },
    {
      name: 'commands',
      args: [session],
      summary: 'The commands a session ran',
      examples: ['hydor sessions commands 3f9a'],
      async run(ctx, [given]) {
        const s = await findSession(ctx, given);
        const r = await ctx.conn.api<{ commands: { ts?: number; tool?: { title?: string; status?: string; exitCode?: number | null } }[] }>('GET', `/api/sessions/${enc(s.key)}/commands`);
        if (ctx.o.json) return ctx.json(r);
        if (!r.commands.length) return ctx.out(`${name(s)} ran no commands.`);
        const { p } = ctx.look;
        const state = (c: (typeof r.commands)[number]) =>
          c.tool?.status === 'error' || (c.tool?.exitCode ?? 0) !== 0 ? mark(p, 'error') : c.tool?.status === 'running' ? mark(p, 'busy') : mark(p, 'done');
        const rows = r.commands
          .slice(-(ctx.o.limit ?? 50))
          .map((c) => [state(c), (c.tool?.title ?? '').replace(/\s+/g, ' '), p.dim(c.tool?.exitCode ? `exit ${c.tool.exitCode}` : ''), p.dim(timeAgo(c.ts))]);
        ctx.out(table(ctx, rows, { grow: 1 }));
      },
    },
    {
      name: 'queue',
      args: [session],
      summary: 'Messages waiting for a turn to end',
      examples: ['hydor sessions queue 3f9a'],
      async run(ctx, [given]) {
        const s = await findSession(ctx, given);
        const { queue: q, held } = await queueOf(ctx, s.key);
        if (ctx.o.json) return ctx.json({ queue: q, held });
        if (!q.length) return ctx.out(`Nothing is waiting in ${name(s)}.`);
        const { p } = ctx.look;
        ctx.out([
          ...table(
            ctx,
            q.map((m, i) => [`${i + 1}`, m.text.replace(/\s+/g, ' '), p.dim(timeAgo(m.at))]),
            { grow: 1 },
          ),
          ...(held ? [p.yellow('Held: the queue goes out when the agent runs again.')] : []),
        ]);
      },
    },
    {
      name: 'queue clear',
      args: [session],
      summary: 'Take every waiting message off the queue',
      examples: ['hydor sessions queue clear 3f9a'],
      async run(ctx, [given]) {
        const s = await findSession(ctx, given);
        const { queue: q } = await queueOf(ctx, s.key);
        if (!q.length) return ctx.out(`Nothing is waiting in ${name(s)}.`);
        if (!(await ctx.confirm(`Take ${q.length} waiting message${q.length === 1 ? '' : 's'} off ${name(s)}?`))) return ctx.out('Not removed.');
        for (const m of q) await ctx.conn.api('POST', `/api/sessions/${enc(s.key)}/queue/${enc(m.id)}/delete`, {});
        ctx.out(`Took ${q.length} message${q.length === 1 ? '' : 's'} off the queue.`);
      },
    },
    {
      name: 'queue remove',
      args: [session, { name: 'which', kind: 'text' }],
      summary: 'Take one waiting message off the queue',
      help: 'Name it by its number in hydor sessions queue, or the start of its text.',
      examples: ['hydor sessions queue remove 3f9a 2'],
      async run(ctx, [given, which]) {
        const s = await findSession(ctx, given);
        const { queue: q } = await queueOf(ctx, s.key);
        const byNumber = /^\d+$/.test(which) ? q[Number(which) - 1] : undefined;
        const m = byNumber ?? pickOne(q, which, { id: (x) => x.id, names: (x) => [x.text], what: 'queued message', hint: `hydor sessions queue ${given ?? '<session>'} lists them` });
        await ctx.conn.api('POST', `/api/sessions/${enc(s.key)}/queue/${enc(m.id)}/delete`, {});
        ctx.out(`Took “${truncate(m.text.replace(/\s+/g, ' '), 50)}” off the queue.`);
      },
    },
    {
      name: 'show',
      args: [session],
      options: { thinking: { type: 'boolean', desc: 'Show the agent’s thinking' } },
      summary: 'A session’s conversation',
      examples: ['hydor sessions show 3f9a', 'hydor sessions show 3f9a -v --limit 3'],
      async run(ctx, [given]) {
        const s = await findSession(ctx, given);
        const { conversationLines, wholeTimeline } = await import('../commands.ts');
        if (ctx.o.json) {
          const [one, tl, notes] = await Promise.all([
            ctx.conn.api('GET', `/api/sessions/${enc(s.key)}`),
            wholeTimeline(ctx.conn, s.key),
            ctx.conn.api<{ notes: unknown[] }>('GET', `/api/sessions/${enc(s.key)}/notes`).catch(() => ({ notes: [] })),
          ]);
          return ctx.json({ ...(one as object), items: tl.items, notes: notes.notes });
        }
        ctx.out(await conversationLines(ctx.conn, s.key, ctx.look, { turns: ctx.o.limit }));
      },
    },
    {
      name: 'send',
      args: [session, { name: 'message', kind: 'text', rest: true, optional: true }],
      summary: 'A message to a session (queued when busy)',
      help: 'Sent now when the agent is free, otherwise after its turn. Without words, what is piped in is the message.',
      examples: ['hydor sessions send 3f9a "and add a test"', 'echo "carry on" | hydor sessions send 3f9a'],
      async run(ctx, [given, ...words]) {
        const s = await findSession(ctx, given);
        const text = words.join(' ').trim() || (ctx.interactive ? '' : ((await ctx.readText({ file: '-' })) ?? '').trim());
        if (!text) throw new UsageError(`Give the message: ${ctx.usage}`);
        const { busy } = await import('../session.ts');
        const one = await ctx.conn.api<{ live: LiveState | null }>('GET', `/api/sessions/${enc(s.key)}`);
        const queue = busy(one.live);
        await ctx.conn.api('POST', `/api/sessions/${enc(s.key)}/${queue ? 'queue' : 'message'}`, { text });
        if (ctx.o.json) return ctx.json({ ok: true, key: s.key, queued: queue });
        ctx.out(queue ? 'Queued: it goes when the agent’s turn ends.' : 'Sent.');
      },
    },
    {
      name: 'stop',
      args: [session],
      summary: 'Stop a session’s turn',
      examples: ['hydor sessions stop 3f9a'],
      async run(ctx, [given]) {
        const s = await findSession(ctx, given);
        try {
          await ctx.conn.api('POST', `/api/sessions/${enc(s.key)}/interrupt`, {});
        } catch (e) {
          if ((e as { status?: number }).status === 409) return ctx.o.json ? ctx.json({ ok: false, error: (e as Error).message }) : ctx.out('It is not working.');
          throw e;
        }
        ctx.o.json ? ctx.json({ ok: true }) : ctx.out('Stopped its turn.');
      },
    },
    {
      name: 'delete',
      aliases: ['remove', 'rm'],
      args: [session],
      summary: 'Delete a session and its history for good',
      help: 'Its history, queued messages and notes go from disk; this cannot be undone. Archive it instead to keep it.',
      examples: ['hydor sessions delete 3f9a', 'hydor sessions delete 3f9a -y'],
      async run(ctx, [given]) {
        const s = await findSession(ctx, given);
        if (!(await ctx.confirm(`Delete ${name(s)} and its history? This cannot be undone. [hydor sessions archive keeps it]`))) return ctx.out('Not deleted.');
        await ctx.conn.api('DELETE', `/api/sessions/${enc(s.key)}`);
        ctx.o.json ? ctx.json({ ok: true }) : ctx.out(`Deleted ${name(s)}.`);
      },
    },
  ],
};
