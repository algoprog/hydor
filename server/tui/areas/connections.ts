// `hydor connections`: Apps → Connected apps. The services agents can use (Notion, GitHub, Linear, Gmail…) connected once.
// List what is connected, show one, services (the marketplace), connect (nothing to enter, a key and a few fields typed
// hidden, or a sign-in in your browser whose address is printed and followed here) and disconnect. Keys go to the vault and are
// never printed back; `hydor keys` lists the vault.
import type { CatalogApp, CatalogField, ConnectionView } from '../../../shared/connections.ts';
import { enc } from '../client.ts';
import { timeAgo } from '../term.ts';
import { Cancelled, choose, fields, mark, str, strs, table, UsageError, type Area, type Ctx } from './kit.ts';

const CONN_HINT = 'hydor connections lists them';

const STATE = { ok: 'on', untested: 'attention', signin: 'attention', error: 'error' } as const;
const STATE_WORD = { ok: 'connected', untested: 'not tested yet', signin: 'sign in again', error: 'error' } as const;

async function listConnections(ctx: Ctx): Promise<ConnectionView[]> {
  return (await ctx.conn.api<{ connections: ConnectionView[] }>('GET', '/api/connections')).connections;
}

/** The connected account named (its id, name, or the start of either), or picked on a terminal. */
async function findConnection(ctx: Ctx, given: string | undefined): Promise<ConnectionView> {
  const list = await listConnections(ctx);
  return choose(ctx, list, given, { id: (c) => c.id, names: (c) => [c.name], what: 'connection', hint: CONN_HINT, label: (c) => c.name, detail: (c) => STATE_WORD[c.status] });
}

async function catalog(ctx: Ctx): Promise<CatalogApp[]> {
  return (await ctx.conn.api<{ apps: CatalogApp[] }>('GET', '/api/connections/catalog')).apps;
}

/** How a service connects, in a few words. */
const authWord = (a: CatalogApp) => (a.auth.type === 'oauth' ? 'a sign-in in your browser' : a.auth.type === 'api_key' ? 'a key' : a.fields?.length ? 'a few details' : 'nothing to enter');

/** `--field NAME=value` options as an object. */
function givenFields(words: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of words) {
    const i = w.indexOf('=');
    if (i < 1) throw new UsageError(`--field takes NAME=value (“${w}” is not)`);
    out[w.slice(0, i)] = w.slice(i + 1);
  }
  return out;
}

/** The fields a service takes: from --field, else (on a terminal) asked, secret ones hidden. */
async function collectFields(ctx: Ctx, app: CatalogApp, given: Record<string, string>, have?: ConnectionView) {
  const out: Record<string, string> = {};
  const known = new Set((app.fields ?? []).map((f) => f.name));
  for (const k of Object.keys(given)) if (!known.has(k)) throw new UsageError(`${app.name} has no field ${k}${known.size ? `: its fields are ${[...known].join(', ')}` : ' (it takes none)'}`);
  for (const f of app.fields ?? ([] as CatalogField[])) {
    if (given[f.name] !== undefined) {
      out[f.name] = given[f.name];
      continue;
    }
    const saved = f.secret ? have?.secretFields.includes(f.name) : have?.fields[f.name] !== undefined;
    if (f.optional || saved || (!f.secret && f.default)) {
      if (!f.secret && f.default && !saved) out[f.name] = f.default;
      if (!f.secret && have?.fields[f.name] !== undefined) out[f.name] = have.fields[f.name];
      continue;
    }
    if (!ctx.interactive) throw new UsageError(`${app.name} needs ${f.label} (${f.name}): add --field ${f.name}=<value>${f.secret ? ', or run it at a prompt to type it hidden' : ''}`);
    const v = await ctx.ask(`${f.label}${f.help ? ` (${f.help})` : ''}: `, { hidden: !!f.secret });
    if (!v) throw new Cancelled();
    out[f.name] = v;
  }
  return out;
}

export const connections: Area = {
  name: 'connections',
  aliases: ['connection', 'connected'],
  summary: 'Connected apps: Notion, GitHub, Gmail…',
  help: 'Services every agent can use, connected once: some need nothing, some a key (typed hidden, or from stdin with --file -), some a sign-in in your browser. Name one by its name or the start of its id. The keys of the vault are hydor keys; changing which tools of a connection are on is on the page.',
  group: 'tools',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'What is connected, and how it is doing',
      examples: ['hydor connections', 'hydor connections --json'],
      async run(ctx) {
        const r = await ctx.conn.api<{ connections: ConnectionView[] }>('GET', '/api/connections');
        if (ctx.o.json) return ctx.json(r);
        if (!r.connections.length) return ctx.out('Nothing is connected yet: hydor connections services lists what can be, hydor connections connect <service> connects one.');
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            r.connections.map((c) => [
              mark(p, STATE[c.status]),
              p.bold(c.name),
              p.dim(c.id),
              STATE_WORD[c.status],
              c.enabled ? '' : p.dim('off for sessions'),
              p.dim(c.tools ? `${c.tools.filter((t) => t.on).length}/${c.tools.length} tools` : ''),
              p.dim(c.hint ?? ''),
            ]),
            { grow: 1, fixed: [2], free: [1, 6] },
          ),
        );
      },
    },
    {
      name: 'show',
      args: [{ name: 'connection', kind: 'connection', pick: true }],
      summary: 'One connection: its state, details and tools',
      examples: ['hydor connections show notion'],
      async run(ctx, [given]) {
        const c = await findConnection(ctx, given);
        if (ctx.o.json) return ctx.json(c);
        const { p } = ctx.look;
        ctx.out([
          p.bold(c.name),
          ...fields(ctx, [
            ['Id', c.id],
            ['State', `${STATE_WORD[c.status]}${c.error ? `: ${c.error}` : ''}`],
            ['Account', c.hint],
            ['For sessions', c.enabled ? 'on for every session' : 'off (a session may turn it on)'],
            ['Connects with', authWord(c.app)],
            [
              'Details',
              Object.entries(c.fields)
                .map(([k, v]) => `${k}=${v}`)
                .join('\n'),
            ],
            ['Keys set', c.secretFields.join(', ')],
            ['Tested', c.testedAt ? timeAgo(c.testedAt) : undefined],
            ['Sign-in ends', c.expiresAt ? `${new Date(c.expiresAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (it renews by itself while it can)` : undefined],
            ['Website', c.app.homepage],
          ]),
          ...(c.tools?.length
            ? [
                '',
                p.bold('Tools'),
                ...table(
                  ctx,
                  c.tools.map((t) => [t.on ? p.green('on') : p.dim('off'), t.name, p.dim(t.description ?? '')]),
                  { grow: 1, free: [1, 2], indent: 2 },
                ),
              ]
            : []),
          ...(c.catalogChanged ? ['', p.yellow('The catalog has another server or sign-in for it: connect it again to use that.')] : []),
        ]);
      },
    },
    {
      name: 'services',
      aliases: ['catalog', 'available'],
      args: [{ name: 'words', kind: 'text', optional: true, rest: true }],
      summary: 'What can be connected',
      help: 'The marketplace, with a mark on what is connected. Words narrow it by name, description and category.',
      examples: ['hydor connections services', 'hydor connections services calendar'],
      async run(ctx, words) {
        const [apps, have] = await Promise.all([catalog(ctx), listConnections(ctx)]);
        const ws = words.join(' ').toLowerCase().split(/\s+/).filter(Boolean);
        const list = apps.filter((a) => ws.every((w) => `${a.name} ${a.description} ${a.category} ${(a.keywords ?? []).join(' ')}`.toLowerCase().includes(w)));
        if (ctx.o.json) return ctx.json({ apps: list });
        if (!list.length) return ctx.out(`No service fits “${words.join(' ')}”.`);
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            list.map((a) => [have.some((c) => c.id === a.id) ? mark(p, 'on') : mark(p, 'off'), p.bold(a.name), p.dim(a.id), p.dim(authWord(a)), p.dim(a.description)]),
            { grow: 1, fixed: [2], free: [1, 4] },
          ),
        );
      },
    },
    {
      name: 'connect',
      args: [{ name: 'service', kind: 'service', pick: true }],
      options: {
        field: { type: 'strings', value: 'NAME=value', desc: 'A detail the service takes (again for more)' },
        file: { type: 'string', value: '<path>', desc: 'The key from a file (- is stdin)', kind: 'file' },
        'client-id': { type: 'string', value: '<id>', desc: 'A sign-in that needs your own app: its client ID' },
        wait: { type: 'string', value: '<seconds>', desc: 'A sign-in: stop waiting after this long (default 300)' },
      },
      summary: 'Connect a service',
      help: 'What it takes depends on the service. Nothing: it connects. A key: typed hidden, or from stdin with --file -. A few details: --field NAME=value, or asked on a terminal. A sign-in in your browser: its address is printed (--browser opens it) and the command waits until you have signed in. Connecting one that is connected already changes it.',
      examples: ['hydor connections connect notion --browser', 'hydor connections connect exa --file - < key.txt', 'hydor connections connect filesystem --field ROOT=~/docs'],
      async run(ctx, [given], v) {
        const apps = await catalog(ctx);
        const app = await choose(ctx, apps, given, {
          id: (a) => a.id,
          names: (a) => [a.name],
          what: 'service',
          hint: 'hydor connections services lists them',
          label: (a) => a.name,
          detail: (a) => authWord(a),
        });
        const have = (await listConnections(ctx)).find((c) => c.id === app.id);
        const fieldValues = await collectFields(ctx, app, givenFields(strs(v, 'field')), have);
        if (app.auth.type === 'oauth') {
          const own = str(v, 'client-id');
          const body: Record<string, unknown> = { fields: fieldValues };
          if (own) {
            const secret = await ctx.ask(`Client secret for ${own} (typed hidden): `, { hidden: true });
            if (!secret) throw new Cancelled();
            body.clientId = own;
            body.clientSecret = secret;
          }
          const r = await ctx.conn.api<{ url?: string; flow?: string; connection?: ConnectionView }>('POST', `/api/connections/${enc(app.id)}/oauth`, body);
          if (r.connection) return done(ctx, r.connection);
          if (!r.url || !r.flow) throw new UsageError(`${app.name} did not start a sign-in`);
          if (!ctx.o.json) ctx.out([`Sign in to ${app.name} in your browser:`, r.url]);
          if (ctx.o.browser) (await import('../commands.ts')).openBrowser(r.url);
          const secs = Number(str(v, 'wait') ?? 300);
          const end = Date.now() + secs * 1000;
          for (;;) {
            const f = await ctx.conn.api<{ result: { ok: boolean; error?: string } | null }>('GET', `/api/connections/flows/${enc(r.flow)}`).catch(() => ({ result: null }));
            if (f.result) {
              if (!f.result.ok) throw new UsageError(`Signing in did not finish: ${f.result.error ?? 'no reason given'}`);
              const c = (await listConnections(ctx)).find((x) => x.id === app.id);
              return c ? done(ctx, c) : ctx.out(`${app.name} is connected.`);
            }
            if (Date.now() > end) throw new UsageError(`Still waiting for the sign-in after ${secs} s: run the command again to start over`);
            await new Promise((res) => setTimeout(res, poll.ms));
          }
        }
        const body: Record<string, unknown> = { fields: fieldValues, test: app.server.transport === 'stdio' };
        if (app.auth.type === 'api_key' && app.server.transport !== 'stdio') {
          let key = str(v, 'file') ? ((await ctx.readText({ file: str(v, 'file') })) ?? '').trim() : '';
          if (!key && !have?.hint) {
            if (!ctx.interactive) throw new UsageError(`${app.name} needs a key: give it on stdin with --file -, or run it at a prompt to type it hidden`);
            key = (await ctx.ask(`${app.name} key (typed hidden): `, { hidden: true })) ?? '';
            if (!key) throw new Cancelled();
          }
          if (key) body.key = key;
        }
        const r = await ctx.conn.api<{ connection: ConnectionView }>('POST', `/api/connections/${enc(app.id)}`, body);
        done(ctx, r.connection);
      },
    },
    {
      name: 'disconnect',
      aliases: ['remove', 'rm'],
      args: [{ name: 'connection', kind: 'connection', pick: true }],
      summary: 'Disconnect a service, forgetting its key',
      help: 'Its sign-in or key is deleted here and revoked where the service allows it.',
      examples: ['hydor connections disconnect notion', 'hydor connections disconnect notion -y'],
      async run(ctx, [given]) {
        const c = await findConnection(ctx, given);
        if (!(await ctx.confirm(`Disconnect “${c.name}”? Its key or sign-in is deleted.`))) return ctx.out('Not disconnected.');
        const r = await ctx.conn.api('DELETE', `/api/connections/${enc(c.id)}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Disconnected “${c.name}”.`);
      },
    },
  ],
};

/** How often a sign-in is looked at while waiting (the tests make it short). */
export const poll = { ms: 1500 };

function done(ctx: Ctx, c: ConnectionView) {
  if (ctx.o.json) return ctx.json({ connection: c });
  ctx.out(`${c.name} is connected${c.status === 'untested' ? ' (testing it in the background)' : c.status === 'error' ? `, but it reports: ${c.error ?? 'an error'}` : ''}.`);
}
