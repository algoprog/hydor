// `hydor accounts`: Settings → Accounts, the Claude Code and Codex sign-ins every session uses. List them (and which one new
// sessions start with), add another account and sign it in, sign in or out, remove an added account, and say which account new
// sessions use. A sign-in is the page's: a link to open in your browser (printed, and opened with --browser), then a code or a
// redirect address pasted back here, or a one-time code to enter there; this command follows the flow until it ends. Never run it
// against a real account you do not mean to sign in or out of.
import type { AccountStatus, LoginFlow, ServerEvent } from '../../../shared/types.ts';
import { enc } from '../client.ts';
import { Cancelled, mark, pickOne, str, table, UsageError, type Area, type Ctx } from './kit.ts';

const ACCOUNT_HINT = 'hydor accounts lists them';
const account = { name: 'account', kind: 'account', pick: true } as const;

const PROGRAM = { claude: 'Claude Code', codex: 'Codex' } as const;
type Program = keyof typeof PROGRAM;

/** One sign-in: the program's own (main), or one that was added. */
interface Entry {
  /** What names it: `claude` or `codex` for the program's own, else the added account's id. */
  ref: string;
  agent: Program;
  main: boolean;
  name: string;
  status: AccountStatus;
  apiKey: boolean;
  /** New sessions start with it. */
  used: boolean;
}

/** How often a flow is looked at when no event came (the tests make it short). */
export const wait = { ms: 20_000 };

async function entries(ctx: Ctx): Promise<Entry[]> {
  const [r, boot] = await Promise.all([ctx.conn.api<any>('GET', '/api/accounts'), ctx.conn.api<any>('GET', '/api/bootstrap').catch(() => ({}))]);
  const runs = boot?.start?.runs ?? {};
  const usedBy = (agent: Program) => String(runs?.[agent]?.account ?? '');
  const mains: Entry[] = (['claude', 'codex'] as Program[]).map((a) => ({
    ref: a,
    agent: a,
    main: true,
    name: PROGRAM[a],
    status: r[a],
    apiKey: !!r.apiKeys?.main && a === 'claude',
    used: usedBy(a) === '',
  }));
  const added: Entry[] = (r.extra ?? []).map((x: any): Entry => ({
    ref: x.id,
    agent: x.agent,
    main: false,
    name: x.name,
    status: x.status,
    apiKey: !!r.apiKeys?.[x.id],
    used: usedBy(x.agent) === x.id,
  }));
  return [...mains, ...added];
}

/** The account named: `claude`, `codex`, an added account’s id or name (`claude:work` when two programs have one by a name), or picked. */
async function findAccount(ctx: Ctx, given: string | undefined, list?: Entry[]): Promise<Entry> {
  const all = list ?? (await entries(ctx));
  if (!given) {
    if (!ctx.interactive) throw new UsageError(`Say which account: ${ctx.usage} (${ACCOUNT_HINT})`);
    const v = await ctx.pick(
      'Which account?',
      all.map((e) => ({ label: e.main ? e.name : `${e.name} · ${PROGRAM[e.agent]}`, hint: e.status.loggedIn ? (e.status.email ?? 'signed in') : 'not signed in', value: e.ref })),
    );
    if (!v) throw new Cancelled();
    return all.find((e) => e.ref === v)!;
  }
  return pickOne(all, given, { id: (e) => e.ref, names: (e) => [e.main ? e.name : e.name, e.main ? undefined : `${e.agent}:${e.name}`, e.status.email], what: 'account', hint: ACCOUNT_HINT });
}

const programOf = (word: string): Program => {
  const w = word
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (w === 'claude' || w === 'claude-code') return 'claude';
  if (w === 'codex') return 'codex';
  throw new UsageError(`An account is for claude or codex (it was “${word}”)`);
};

const state = (s: AccountStatus) => (s.loggedIn ? [s.email, s.plan, s.method].filter(Boolean).join(' · ') || 'signed in' : (s.error ?? 'not signed in'));

/**
 * The page's sign-in: asks the server for a link (and a one-time code for a device sign-in), prints them, and follows the flow
 * (the server sends its states on the event socket) until it ends. A code or an address pasted back is asked for. Backing out,
 * or an error, cancels it there.
 */
export async function signIn(ctx: Ctx, e: Entry, method?: string): Promise<LoginFlow> {
  const q = e.main ? '' : `?account=${enc(e.ref)}`;
  const events = ctx.conn.events();
  const buffered: LoginFlow[] = [];
  let cur: LoginFlow | null = null;
  let wake: (() => void) | null = null;
  const on = (ev: ServerEvent) => {
    if (ev.t !== 'login') return;
    if (!cur) buffered.push(ev.flow);
    else if (ev.flow.id === cur.id) cur = ev.flow;
    wake?.();
  };
  events.on('event', on);
  let finished = false;
  try {
    await events.ready(5000);
    cur = await ctx.conn.api<LoginFlow>('POST', `/api/accounts/${e.agent}/login${q}`, { method: method ?? (e.agent === 'claude' ? 'claudeai' : 'device') });
    for (const f of buffered) if (f.id === cur.id) cur = f;
    const said = new Set<string>();
    const say = (key: string, lines: string[]) => {
      if (said.has(key) || ctx.o.json) return;
      said.add(key);
      ctx.out(lines);
    };
    const deadline = Date.now() + 10 * 60_000;
    for (;;) {
      const f: LoginFlow = cur!;
      if (f.url) {
        say(`url ${f.url}`, ['', `1. Open this link and sign in${e.main ? '' : ` to “${e.name}”`}:`, `   ${f.url}`]);
        if (ctx.o.browser && !said.has('browser')) {
          said.add('browser');
          (await import('../commands.ts')).openBrowser(f.url);
        }
      }
      if (f.code) say(`code ${f.code}`, ['', `2. Enter this code there: ${f.code}`]);
      if (f.state === 'done') {
        finished = true;
        return f;
      }
      if (f.state === 'failed' || f.state === 'cancelled') {
        finished = true;
        throw new UsageError(`Signing in ${f.state === 'cancelled' ? 'was cancelled' : 'failed'}${f.error || f.message ? `: ${f.error ?? f.message}` : ''}`);
      }
      if (f.needsInput && !said.has(`in ${f.needsInput}`)) {
        said.add(`in ${f.needsInput}`);
        const text = await ctx.ask(f.needsInput === 'code' ? 'Paste the code your browser shows: ' : 'Paste the address your browser ended on (it starts with http://localhost): ');
        if (!text) throw new Cancelled();
        cur = await ctx.conn.api<LoginFlow>('POST', `/api/accounts/${e.agent}/login/${f.id}${q}`, f.needsInput === 'code' ? { code: text.trim() } : { url: text.trim() });
        said.delete(`in ${f.needsInput}`);
        if (cur.state === 'waiting' && cur.needsInput === f.needsInput) said.add(`in ${f.needsInput}`);
        continue;
      }
      if (Date.now() > deadline) throw new UsageError('Still not signed in after 10 minutes: run the command again to start over');
      await new Promise<void>((res) => {
        wake = res;
        setTimeout(res, wait.ms);
      });
      wake = null;
    }
  } finally {
    events.off('event', on);
    if (!finished && cur) await ctx.conn.api('DELETE', `/api/accounts/${e.agent}/login/${(cur as LoginFlow).id}${q}`).catch(() => {});
  }
}

export const accounts: Area = {
  name: 'accounts',
  aliases: ['account'],
  summary: 'Claude Code and Codex sign-ins',
  help: 'The sign-ins sessions run as: each program’s own (claude, codex) and the accounts you added (a work and a personal one). Name one by its id, its name, or claude:name when two programs have one by the same name. New sessions start with one of them (accounts use). The API key for API credit and the switches at a usage limit are hydor settings (accounts.*).',
  group: 'models',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'The sign-ins, and the one new sessions use',
      examples: ['hydor accounts', 'hydor accounts --json'],
      async run(ctx) {
        if (ctx.o.json) return ctx.json(await ctx.conn.api('GET', '/api/accounts'));
        const list = await entries(ctx);
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            list.map((e) => [
              e.used ? mark(p, 'on') : mark(p, 'off'),
              p.bold(e.name),
              p.dim(e.main ? 'its own sign-in' : e.ref),
              PROGRAM[e.agent],
              e.status.loggedIn ? p.green(state(e.status)) : p.yellow(state(e.status)),
              p.dim(e.apiKey ? 'API key saved' : ''),
            ]),
            { head: ['', 'ACCOUNT', 'ID', 'PROGRAM', 'STATE', ''], grow: 4 },
          ),
        );
        ctx.out(p.dim('● new sessions start with it (hydor accounts use <account> changes that).'));
      },
    },
    {
      name: 'add',
      args: [
        { name: 'program', kind: 'text' },
        { name: 'name', kind: 'text', rest: true },
      ],
      options: {
        'no-sign-in': { type: 'boolean', desc: 'Only add it; sign it in later' },
        method: { type: 'string', value: '<how>', desc: 'claude: claudeai or console; codex: device or browser', values: ['claudeai', 'console', 'device', 'browser'] },
      },
      summary: 'Add another account, and sign it in',
      help: 'It gets a folder of its own (settings, instructions, skills and plugins are shared). Then it signs in as hydor accounts sign-in does: a link to open in your browser, then a code or an address pasted back.',
      examples: ['hydor accounts add claude Work', 'hydor accounts add codex Personal --no-sign-in'],
      async run(ctx, [word, ...name], v) {
        const agent = programOf(word);
        if (!name.length) throw new UsageError(`Give the account a name: ${ctx.usage}`);
        const made = await ctx.conn.api<{ id: string; agent: Program; name: string }>('POST', '/api/agent-accounts', { agent, name: name.join(' ') });
        if (v['no-sign-in']) {
          if (ctx.o.json) return ctx.json(made);
          return ctx.out([`Added “${made.name}” (${made.id}) for ${PROGRAM[agent]}.`, `It is not signed in yet: hydor accounts sign-in ${made.id}`]);
        }
        if (!ctx.o.json) ctx.out(`Added “${made.name}” (${made.id}) for ${PROGRAM[agent]}.`);
        const e: Entry = { ref: made.id, agent, main: false, name: made.name, status: { agent, loggedIn: false }, apiKey: false, used: false };
        const f = await signIn(ctx, e, str(v, 'method'));
        if (ctx.o.json) return ctx.json({ account: made, flow: f });
        ctx.out(`“${made.name}” is signed in.`);
      },
    },
    {
      name: 'sign-in',
      aliases: ['login'],
      args: [account],
      options: { method: { type: 'string', value: '<how>', desc: 'claude: claudeai or console; codex: device or browser', values: ['claudeai', 'console', 'device', 'browser'] } },
      summary: 'Sign an account in (or in again)',
      help: 'Prints a link to open in your browser (--browser opens it). Claude Code shows a code there to paste back here; Codex’s device sign-in shows a code to enter there and is noticed here when you are done; its browser sign-in ends on a localhost address to paste back. Esc or Ctrl+C cancels it.',
      examples: ['hydor accounts sign-in claude', 'hydor accounts sign-in work --browser', 'hydor accounts sign-in codex --method browser'],
      async run(ctx, [given], v) {
        const e = await findAccount(ctx, given);
        if (e.status.loggedIn && !ctx.o.yes && ctx.interactive && !(await ctx.confirm(`${e.name} is signed in as ${e.status.email ?? 'someone'} already. Sign in again?`)))
          return ctx.out('Left as it was.');
        const f = await signIn(ctx, e, str(v, 'method'));
        if (ctx.o.json) return ctx.json(f);
        ctx.out(`${e.name} is signed in.`);
      },
    },
    {
      name: 'sign-out',
      aliases: ['logout'],
      args: [account],
      summary: 'Sign an account out',
      help: 'The program’s own sign-in is signed out for every terminal and editor that uses it; an added account’s sessions stop working until it signs in again.',
      examples: ['hydor accounts sign-out work'],
      async run(ctx, [given]) {
        const e = await findAccount(ctx, given);
        if (!(await ctx.confirm(`Sign out of ${e.main ? e.name : `${PROGRAM[e.agent]} (${e.name})`}?${e.main ? ' This signs the program out for every terminal and editor that uses it.' : ''}`)))
          return ctx.out('Not signed out.');
        const r = await ctx.conn.api('POST', `/api/accounts/${e.agent}/logout${e.main ? '' : `?account=${enc(e.ref)}`}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Signed out of ${e.name}.`);
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [account],
      options: { wipe: { type: 'boolean', desc: 'Also delete its sign-in and its sessions’ history' } },
      summary: 'Remove an added account',
      help: 'Its sessions leave the list (--wipe deletes their history too, for good). Not while its sessions are running. A program’s own sign-in is not removed: sign it out.',
      examples: ['hydor accounts remove work', 'hydor accounts remove work --wipe -y'],
      async run(ctx, [given], v) {
        const e = await findAccount(ctx, given);
        if (e.main) throw new UsageError(`${e.name}’s own sign-in cannot be removed: hydor accounts sign-out ${e.ref} signs it out`);
        const wipe = !!v.wipe;
        if (!(await ctx.confirm(`Remove “${e.name}” (${PROGRAM[e.agent]})?${wipe ? ' Its sign-in and its sessions’ history are deleted for good.' : ' Its sessions leave the list.'}`)))
          return ctx.out('Not removed.');
        const r = await ctx.conn.api('DELETE', `/api/agent-accounts/${enc(e.ref)}${wipe ? '?wipe=1' : ''}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Removed “${e.name}”.`);
      },
    },
    {
      name: 'use',
      aliases: ['switch'],
      args: [account],
      summary: 'Start new sessions with this account',
      help: 'What the start page opens with next time, for that program, on every device. Sessions already running keep theirs. Name claude or codex to go back to the program’s own sign-in.',
      examples: ['hydor accounts use work', 'hydor accounts use claude'],
      async run(ctx, [given]) {
        const e = await findAccount(ctx, given);
        if (e.status.loggedIn === false && !(await ctx.confirm(`“${e.name}” is not signed in. Use it anyway?`))) return ctx.out('Left as it was.');
        const r = await ctx.conn.api('PUT', '/api/start', { runs: { [e.agent]: { account: e.main ? '' : e.ref } } });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`New ${PROGRAM[e.agent]} sessions start with ${e.main ? 'its own sign-in' : `“${e.name}”`}.`);
      },
    },
  ],
};
