// `hydor machines`: Settings → App → Machines, the other computers running Hydor that this one uses (their sessions and pages
// show here under /m/<id>). List them, add one (by its address, or by SSH, with the access token typed hidden) and remove one.
// `hydor access-token` (a token for another machine to use this one) is a command of its own and stays.
import { enc } from '../client.ts';
import { Cancelled, choose, mark, str, num, table, UsageError, type Area, type Ctx } from './kit.ts';

interface Machine {
  id: string;
  name: string;
  via: 'url' | 'ssh';
  url?: string;
  ssh?: string;
  port?: number;
  status: { state: 'connecting' | 'online' | 'offline'; host?: string; version?: string; error?: string; waiting: number; working: number };
}

const MACHINE_HINT = 'hydor machines lists them';

async function find(ctx: Ctx, given: string | undefined): Promise<Machine> {
  const list = (await ctx.conn.api<{ machines: Machine[] }>('GET', '/api/machines')).machines;
  return choose(ctx, list, given, { id: (m) => m.id, names: (m) => [m.name, m.status.host], what: 'machine', hint: MACHINE_HINT, label: (m) => m.name, detail: (m) => m.url ?? m.ssh });
}

const STATE = { online: 'on', connecting: 'busy', offline: 'error' } as const;

export const machines: Area = {
  name: 'machines',
  aliases: ['machine'],
  summary: 'Other computers running Hydor',
  help: 'Machines this Hydor uses: their sessions and pages show here. Add one by its address (--url) or through SSH (--ssh, a host of ~/.ssh/config or user@host), with an access token made there (hydor access-token there). The token is typed hidden, or comes from stdin with --file -. hydor access-token here makes one for another machine to use this one.',
  group: 'this',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'Machines this one uses, and if they answer',
      examples: ['hydor machines', 'hydor machines --json'],
      async run(ctx) {
        const r = await ctx.conn.api<{ self?: { host: string; version: string; platform: string; user: string }; machines: Machine[] }>('GET', '/api/machines');
        if (ctx.o.json) return ctx.json(r);
        const { p } = ctx.look;
        const lines: string[] = [];
        if (r.self) lines.push(p.dim(`This machine: ${r.self.host} (${r.self.user}, ${r.self.platform}), Hydor ${r.self.version}`), '');
        if (!r.machines.length)
          return ctx.out([...lines, 'No other machines yet: install Hydor there, make an access token (hydor access-token there), then hydor machines add <name> --url <address>.']);
        lines.push(
          ...table(
            ctx,
            r.machines.map((m) => [
              mark(p, STATE[m.status.state]),
              p.bold(m.name),
              p.dim(m.id),
              m.via === 'ssh' ? `ssh ${m.ssh}:${m.port ?? 8790}` : (m.url ?? ''),
              m.status.state === 'online'
                ? p.dim(
                    `${m.status.host ?? ''} · Hydor ${m.status.version ?? '?'}${m.status.waiting ? ` · ${m.status.waiting} waiting` : ''}${m.status.working ? ` · ${m.status.working} working` : ''}`,
                  )
                : p.yellow(m.status.error ?? m.status.state),
            ]),
            { grow: 4 },
          ),
        );
        ctx.out(lines);
      },
    },
    {
      name: 'add',
      aliases: ['new', 'connect'],
      args: [{ name: 'name', kind: 'text', rest: true }],
      options: {
        url: { type: 'string', value: '<address>', desc: 'Its address, http:// or https://' },
        ssh: { type: 'string', value: '<host>', desc: 'Reach it through SSH: a host of ~/.ssh/config or user@host' },
        port: { type: 'string', value: '<port>', desc: 'With --ssh: the port Hydor listens on there (default 8790)' },
        file: { type: 'string', value: '<path>', desc: 'Its access token from a file (- is stdin)', kind: 'file' },
      },
      summary: 'Add a machine',
      help: 'It must answer before it is kept. The access token is made on that machine (hydor access-token there); typed hidden here, or from stdin with --file -.',
      examples: ['hydor machines add Lab --url https://lab.example.com', 'hydor machines add Gpu --ssh gpu-box --port 8790 --file - < token'],
      async run(ctx, name, v) {
        if (!name.length) throw new UsageError(`Give the machine a name: ${ctx.usage}`);
        const url = str(v, 'url');
        const ssh = str(v, 'ssh');
        if (!url === !ssh) throw new UsageError('Say how to reach it: --url <address> or --ssh <host> (one of them)');
        let token = str(v, 'file') ? ((await ctx.readText({ file: str(v, 'file') })) ?? '').trim() : '';
        if (!token) {
          if (!ctx.interactive) throw new UsageError('Give its access token on stdin with --file -, or run it at a prompt to type it hidden');
          token = (await ctx.ask('Its access token (typed hidden): ', { hidden: true })) ?? '';
          if (!token) throw new Cancelled();
        }
        const port = num(v, 'port', 1);
        const body = { name: name.join(' '), via: ssh ? 'ssh' : 'url', ssh, port: ssh ? (port ?? 8790) : undefined, url, token };
        const r = await ctx.conn.api<{ machine: Machine }>('POST', '/api/machines', body);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(
          `Added “${r.machine.name}” (${r.machine.id}): ${r.machine.status.state}${r.machine.status.version ? `, Hydor ${r.machine.status.version}` : ''}. Its pages are ${ctx.conn.base}/m/${r.machine.id}/…`,
        );
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [{ name: 'machine', kind: 'machine', pick: true }],
      summary: 'Stop using a machine',
      help: 'Its sessions stay on it.',
      examples: ['hydor machines remove lab', 'hydor machines remove lab -y'],
      async run(ctx, [given]) {
        const m = await find(ctx, given);
        if (!(await ctx.confirm(`Stop using “${m.name}”? Its sessions stay on it.`))) return ctx.out('Not removed.');
        const r = await ctx.conn.api('DELETE', `/api/machines/${enc(m.id)}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Removed “${m.name}”.`);
      },
    },
  ],
};
