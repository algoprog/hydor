// `hydor outbox`: calls to connected accounts held for your OK (tools set to Ask first): the list, one call with its
// input, and send it (as it is, or with fields changed) or drop it.
import { heldLine, type HeldCall } from '../../../shared/outbox.ts';
import { enc } from '../client.ts';
import { timeAgo } from '../term.ts';
import { Cancelled, choose, fields, mark, str, strs, table, UsageError, type Area, type Ctx } from './kit.ts';

const HINT = 'hydor outbox lists them';

const held = async (ctx: Ctx) => (await ctx.conn.api<{ calls: HeldCall[] }>('GET', '/api/outbox')).calls;

/** A held call by its number in the list, its id, or the start of its account, tool or line. */
async function pick(ctx: Ctx, given: string | undefined): Promise<HeldCall> {
  const list = await held(ctx);
  const byNumber = /^\d+$/.test(given ?? '') ? list[Number(given) - 1] : undefined;
  return byNumber ?? choose(ctx, list, given, { id: (c) => c.id, names: (c) => [`${c.appName} ${c.tool}`, c.tool, heldLine(c)], what: 'held call', hint: HINT, label: (c) => heldLine(c), detail: (c) => c.session });
}

/** A value typed after NAME=: JSON when it reads as JSON (a list, a number, true), else the text as it is. */
function valueOf(v: string): unknown {
  if (/^[[{]|^-?\d+(\.\d+)?$|^(true|false|null)$/.test(v.trim())) {
    try {
      return JSON.parse(v);
    } catch {}
  }
  return v;
}

export const outbox: Area = {
  name: 'outbox',
  summary: 'Calls held for your OK',
  help: 'When an agent calls a connected account’s tool you set to Ask first (one that sends, posts, deletes or pays), the call is not made: it waits here, and in the Inbox, until you send it or drop it. Send makes it with its input as it is, or with fields you change.',
  group: 'sessions',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'Calls waiting for your OK, newest first',
      examples: ['hydor outbox', 'hydor outbox --json'],
      async run(ctx) {
        const list = await held(ctx);
        if (ctx.o.json) return ctx.json({ calls: list });
        if (!list.length) return ctx.out('Nothing waits in the Outbox.');
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            list.slice(0, ctx.o.limit ?? 50).map((c, n) => [p.dim(`${n + 1}`), mark(p, c.status === 'failed' ? 'error' : 'attention'), heldLine(c), p.dim(c.session ?? ''), p.dim(timeAgo(c.at))]),
            { grow: 2 },
          ),
        );
      },
    },
    {
      name: 'show',
      args: [{ name: 'call', kind: 'text', pick: true }],
      summary: 'One held call, with its input',
      help: 'Name it by its number in hydor outbox, its id, or the start of its account or tool.',
      examples: ['hydor outbox show 1'],
      async run(ctx, [given]) {
        const c = await pick(ctx, given);
        if (ctx.o.json) return ctx.json(c);
        ctx.out(
          fields(ctx, [
            ['Call', `${c.appName} · ${c.tool}`],
            ['Status', c.status === 'failed' ? `did not go: ${c.result ?? ''}` : 'waits for your OK'],
            ['Session', c.session],
            ['Task', c.task],
            ['Agent', c.agent],
            ['When', timeAgo(c.at)],
            ['Id', c.id],
          ]),
        );
        ctx.out(['', JSON.stringify(c.input, null, 2)]);
      },
    },
    {
      name: 'send',
      args: [{ name: 'call', kind: 'text', pick: true }],
      options: {
        set: { type: 'strings', value: 'NAME=value', desc: 'Change a field first (again for more; a list as JSON)' },
        input: { type: 'string', value: '<path>', desc: 'The whole input as JSON, from a file (- is stdin)', kind: 'file' },
      },
      summary: 'Send a held call, as it is or changed',
      help: 'Hydor makes the call to the account now and keeps what it answered; the agent hears it with your next message in its session.',
      examples: ['hydor outbox send 1', 'hydor outbox send 1 --set subject="Invoice 42, second reminder"', 'hydor outbox send 2 --input - < reply.json -y'],
      async run(ctx, [given], v) {
        const c = await pick(ctx, given);
        let input: Record<string, unknown> | undefined;
        if (str(v, 'input')) {
          const text = (await ctx.readText({ file: str(v, 'input') })) ?? '';
          try {
            input = JSON.parse(text);
          } catch {
            throw new UsageError('--input: the call’s fields as a JSON object');
          }
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UsageError('--input: the call’s fields as a JSON object');
        }
        const sets = strs(v, 'set');
        if (sets.length) {
          input = { ...(input ?? c.input) };
          for (const s of sets) {
            const i = s.indexOf('=');
            if (i < 1) throw new UsageError(`--set ${s}: NAME=value`);
            input[s.slice(0, i).trim()] = valueOf(s.slice(i + 1));
          }
        }
        if (!(await ctx.confirm(`Send ${heldLine({ ...c, input: input ?? c.input })}?`))) throw new Cancelled();
        const r = await ctx.conn.api<{ call: HeldCall }>('POST', `/api/outbox/${enc(c.id)}/send`, input ? { input } : {});
        if (ctx.o.json) return ctx.json(r);
        if (r.call.status !== 'sent') {
          ctx.out(`It did not go: ${r.call.result ?? 'no reason given'}. It waits in the Outbox again.`);
          return 1;
        }
        ctx.out([`Sent: ${heldLine(r.call)}`, ...(r.call.result ? [r.call.result] : [])]);
      },
    },
    {
      name: 'drop',
      args: [{ name: 'call', kind: 'text', pick: true }],
      summary: 'Drop a held call: it is never made',
      examples: ['hydor outbox drop 1', 'hydor outbox drop 1 -y'],
      async run(ctx, [given]) {
        const c = await pick(ctx, given);
        if (!(await ctx.confirm(`Drop ${heldLine(c)}? It is never sent.`))) return ctx.out('Not dropped.');
        const r = await ctx.conn.api('POST', `/api/outbox/${enc(c.id)}/drop`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Dropped: ${heldLine(c)}`);
      },
    },
  ],
};
