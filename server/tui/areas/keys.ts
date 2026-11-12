// `hydor keys`: the vault (Apps → Keys, and Settings → Connections). The keys agents use by name (http_request, the
// browser, commands): list (names and where each may go, never a value), set (asked hidden on a terminal, or read from
// stdin) and remove. A value is never an option or an argument (it would stay in the shell's history) and never printed.
// Agents may not call these routes; the terminal is the person's own.
import { secretName, type SecretView } from '../../../shared/connections.ts';
import { enc } from '../client.ts';
import { timeAgo } from '../term.ts';
import { Cancelled, choose, str, strs, table, UsageError, type Area, type Ctx, type Values } from './kit.ts';

const KEY_HINT = 'hydor keys lists them';
const key = { name: 'NAME', kind: 'key', pick: true } as const;

const listKeys = async (ctx: Ctx): Promise<SecretView[]> => (await ctx.conn.api<{ secrets: SecretView[] }>('GET', '/api/connections')).secrets;

/** The key named: its NAME in any case (GitHub token is GITHUB_TOKEN), or the start of it; picked on a terminal when none is given. */
async function findKey(ctx: Ctx, given: string | undefined): Promise<SecretView> {
  const list = await listKeys(ctx);
  const asName = given ? secretName(given) : '';
  if (asName && list.some((s) => s.name === asName)) return list.find((s) => s.name === asName)!;
  return choose(ctx, list, given, { id: (s) => s.name, names: (s) => [s.name], what: 'key', hint: KEY_HINT, label: (s) => s.name, detail: (s) => (s.domains.length ? s.domains.join(', ') : s.note) });
}

export const keys: Area = {
  name: 'keys',
  aliases: ['vault'],
  summary: 'The vault: keys agents use by name',
  help: 'A key is a secret (an API key, a token, a password) kept encrypted in Hydor’s vault. Agents use one by its NAME (http_request, the browser, run_with_secrets) and never see its value; they ask you for one with a card. These commands are yours alone: a value is never typed as an option (it would stay in your shell’s history) and never printed.',
  group: 'tools',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'Your keys’ names, and where each may go',
      examples: ['hydor keys', 'hydor keys --json'],
      async run(ctx) {
        const list = await listKeys(ctx);
        if (ctx.o.json) return ctx.json({ secrets: list });
        if (!list.length) return ctx.out('No keys yet: hydor keys set <NAME> adds one.');
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            list.map((s) => [
              p.bold(s.name),
              s.domains.length ? s.domains.join(', ') : p.dim('anywhere'),
              s.commands ? 'commands' : p.dim('—'),
              p.dim(s.usedAt ? `used ${timeAgo(s.usedAt)}` : 'not used'),
              p.dim(s.note),
            ]),
            { head: ['KEY', 'MAY GO TO', 'IN COMMANDS', 'USED', ''], grow: 0, fixed: [0, 1], free: [4] },
          ),
        );
      },
    },
    {
      name: 'set',
      aliases: ['add', 'new'],
      args: [{ name: 'NAME', kind: 'key' }],
      options: {
        domain: { type: 'strings', value: '<host>', desc: 'A host the key may be sent to, with subdomains' },
        commands: { type: 'string', value: 'on|off', desc: 'on: commands may have it in their environment', values: ['on', 'off'] },
        note: { type: 'string', value: '<text>', desc: 'What it is for (up to 300 characters)' },
        header: { type: 'string', value: '<name>', desc: 'The header http_request sends it in by default ("" for none)' },
        prefix: { type: 'string', value: '<text>', desc: 'What goes before it in that header, such as “Bearer ”' },
        query: { type: 'string', value: '<name>', desc: 'The query parameter http_request sends it as' },
      },
      summary: 'Add a key, or give one a new value',
      help: 'The value is asked for with what you type hidden, or, with something piped in, read from stdin (one line). A NAME that is in the vault already gets the new value (leave the answer empty to keep it and change only the details). The name is made of capitals, digits and underscores: “GitHub token” becomes GITHUB_TOKEN.',
      examples: [
        'hydor keys set GITHUB_TOKEN --domain github.com --note "for the gh API"',
        'hydor keys set GITHUB_TOKEN < token.txt',
        'hydor keys set OPENAI_API_KEY --commands on',
        'hydor keys set GITHUB_TOKEN --note "new note"',
      ],
      async run(ctx, [given], v) {
        const name = secretName(given);
        if (name.length < 2) throw new UsageError(`“${given}” is no name for a key: use capitals, digits and underscores, like GITHUB_TOKEN`);
        const existing = (await listKeys(ctx)).find((s) => s.name === name);
        const details: Record<string, unknown> = {};
        if (v.domain !== undefined) details.domains = strs(v, 'domain').join(',');
        const commands = str(v, 'commands');
        if (commands !== undefined) {
          if (commands !== 'on' && commands !== 'off') throw new UsageError('--commands takes on or off');
          details.commands = commands === 'on';
        }
        for (const k of ['note', 'header', 'prefix', 'query'] as const) if (str(v, k) !== undefined) details[k] = str(v, k) || null;
        if (details.note === null) details.note = '';
        // The value: asked hidden on a terminal, else the first line of stdin.
        let value: string | null | undefined;
        if (ctx.interactive) {
          value = await ctx.ask(`${existing ? 'New value' : 'Value'} for ${name}${existing ? ' (empty keeps the current one)' : ''}: `, { hidden: true });
          if (value === null) throw new Cancelled();
        } else value = (await ctx.readText({ file: '-' }))?.split(/\r?\n/)[0];
        value = value?.trim();
        if (!value) {
          if (!existing) throw new UsageError(`${name} has no value: type it when asked, or pipe it in (hydor keys set ${name} < file)`);
          if (!Object.keys(details).length) return ctx.out('Nothing changed.');
        }
        const body = { ...details, ...(value ? { value } : {}) };
        const r = existing
          ? await ctx.conn.api<{ secret: SecretView }>('PATCH', `/api/connections/secrets/${enc(name)}`, body)
          : await ctx.conn.api<{ secret: SecretView }>('POST', '/api/connections/secrets', { name, ...body });
        if (ctx.o.json) return ctx.json({ secret: { ...r.secret } });
        ctx.out(existing ? (value ? `${name} has its new value.` : `Changed ${name}.`) : `${name} is in the vault.`);
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [key],
      summary: 'Delete a key for good',
      help: 'Agents and apps that use it by name stop working until you add it again.',
      examples: ['hydor keys remove GITHUB_TOKEN', 'hydor keys remove GITHUB_TOKEN -y'],
      async run(ctx, [given]) {
        const s = await findKey(ctx, given);
        if (!(await ctx.confirm(`Remove “${s.name}” for good?`))) return ctx.out('Not removed.');
        const r = await ctx.conn.api('DELETE', `/api/connections/secrets/${enc(s.name)}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Removed ${s.name}.`);
      },
    },
  ],
};
