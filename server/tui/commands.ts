// The commands that list and look after things: sessions, a session's conversation, a message to one, stopping one,
// the models, the tiers, your agents, scheduled tasks, plan usage, the server's status, running the server, and the
// web app's address. Each prints plain aligned text, or with --json the API's own objects as one JSON document. The
// chat's slash commands (/tiers, /usage…) draw the same lines.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Assistant } from '../../shared/assistants.ts';
import { scheduleText, type ScheduledTask } from '../../shared/automations.ts';
import type { SessionNote } from '../../shared/features.ts';
import { TIER_PROGRAMS } from '../../shared/tiers.ts';
import type { AgentCatalog, AgentUsage, LiveOverlay, LiveState, SessionSummary, TimelinePage } from '../../shared/types.ts';
import { UsageError, type Opts } from './args.ts';
import { ApiError, enc, health, localBase, type Conn } from './client.ts';
import { modelLabel, tierName, type Look } from './lines.ts';
import { busy, historyLines } from './session.ts';
import { catalogOf, programName, type TiersState } from './start.ts';
import { columns, money, strWidth, tildify, timeAgo, truncate, type Paint } from './term.ts';

/** Prints lines to stdout. */
const say = (lines: string[] | string) => process.stdout.write(`${(Array.isArray(lines) ? lines : [lines]).join('\n')}\n`);
const json = (v: unknown) => process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);

/**
 * A session named on the command line: its full key (claude:…), or the start of its id or key as `hydor sessions`
 * shows it (it must be the start of one session's only).
 */
export async function resolveKey(conn: Conn, given: string | undefined): Promise<string> {
  if (!given) throw new UsageError('Say which session: its key, or the start of it (hydor sessions shows them)');
  if (/^(claude|codex|acp):[A-Za-z0-9._-]{4,80}$/.test(given)) return given;
  const { sessions } = await conn.api<{ sessions: SessionSummary[] }>('GET', '/api/sessions?limit=1000');
  const g = given.toLowerCase();
  const hits = sessions.filter((s) => s.id.toLowerCase().startsWith(g) || s.key.toLowerCase().startsWith(g));
  if (hits.length === 1) return hits[0].key;
  if (!hits.length) throw new ApiError(404, `No session starts with “${given}”: hydor sessions shows them`);
  throw new UsageError(`“${given}” starts ${hits.length} sessions: give more of it`);
}

/** What a session is doing, as one of a few kinds ('' when nothing is). */
function statusKind(s: SessionSummary): 'needs' | 'starting' | 'working' | 'stopping' | 'error' | 'outside' | 'finished' | '' {
  const l = s.live;
  if (l?.status === 'waiting' || (l?.pendingApprovals ?? 0) > 0) return 'needs';
  if (l?.status === 'starting') return 'starting';
  if (l?.status === 'working') return 'working';
  if (l?.status === 'stopping') return 'stopping';
  if (l?.status === 'error') return 'error';
  if (s.external && s.external.status !== 'idle') return 'outside';
  if (s.doneAt && (!s.seenAt || s.seenAt < s.doneAt)) return 'finished';
  return '';
}

/** A session's state in the app's words: Working, Needs you, Starting, Finished (not read yet), or nothing. */
export function statusWord(s: SessionSummary, p: Paint): string {
  switch (statusKind(s)) {
    case 'needs':
      return p.yellow('Needs you');
    case 'starting':
      return p.accent('Starting');
    case 'working':
      return p.accent('Working');
    case 'stopping':
      return p.dim('Stopping');
    case 'error':
      return p.red('Error');
    case 'outside':
      return p.accent(s.external!.status === 'waiting' ? `Needs you in ${s.external!.client}` : `Working in ${s.external!.client}`);
    case 'finished':
      return p.green('Finished');
    default:
      return '';
  }
}

/** The mark before a session's state: ● accent when it works, ● yellow when it needs you, ✓ green when it finished, ✗ red on an error, · dim otherwise. */
export function statusMark(s: SessionSummary, p: Paint): string {
  switch (statusKind(s)) {
    case 'needs':
      return p.yellow('●');
    case 'starting':
    case 'working':
    case 'outside':
      return p.accent('●');
    case 'error':
      return p.red('✗');
    case 'finished':
      return p.green('✓');
    default:
      return p.dim('·');
  }
}

/**
 * How much of each session's id `hydor sessions` shows: the shortest start (8 characters at least) that tells the
 * listed ones apart (Codex's ids begin with the time they were made, so theirs need more).
 */
export function keyLength(list: Pick<SessionSummary, 'id'>[]): number {
  let n = 8;
  while (n < 36 && new Set(list.map((s) => s.id.slice(0, n))).size < list.length) n++;
  return n;
}

/** A session's id, short: what `hydor sessions` shows and the other commands take. */
export const shortKey = (s: Pick<SessionSummary, 'id'>, n = 8) => s.id.slice(0, n);

/** A folder, cut from its start to fit (its end says most). */
const folderIn = (p: string, max: number) => (strWidth(p) <= max ? p : `…${p.slice(p.length - max + 1)}`);

/** The sessions as aligned lines, latest first (cut to the width on a terminal only, with a mark before each state). */
export function sessionLines(list: SessionSummary[], look: Look, fit = true, marks = false): string[] {
  const { p } = look;
  if (!list.length) return ['No sessions yet: `hydor` starts one here.'];
  const n = keyLength(list);
  const rows = list.map((s) => [
    p.dim(shortKey(s, n)),
    marks ? `${statusMark(s, p)}${statusWord(s, p) ? ` ${statusWord(s, p)}` : ''}` : statusWord(s, p) || p.dim('·'),
    (s.title || s.firstPrompt || '(untitled)').replace(/\s+/g, ' '),
    p.dim([s.acpName ?? (s.agent === 'claude' ? 'Claude Code' : s.agent === 'codex' ? 'Codex' : 'Agent'), modelLabel(s.live?.model ?? s.model)].filter(Boolean).join(' · ')),
    p.dim(folderIn(tildify(s.cwd, look.home), fit ? 28 : 200)),
    p.dim(timeAgo(s.updatedAt)),
  ]);
  if (!fit) return columns(rows);
  // The title takes what the width leaves.
  const fixed = [0, 1, 3, 4, 5].reduce((a, i) => a + Math.max(...rows.map((r) => strWidth(r[i]))) + 2, 0);
  const room = Math.max(20, look.width - fixed - 1);
  for (const r of rows) r[2] = truncate(r[2], room);
  return columns(rows).map((l) => truncate(l, look.width - 1));
}

/** `hydor sessions`: the latest sessions (subagents only with --all). */
async function sessions(conn: Conn, o: Opts, look: Look) {
  const limit = o.all ? 300 : (o.limit ?? 25);
  const { sessions: all, total } = await conn.api<{ sessions: SessionSummary[]; total: number }>('GET', `/api/sessions?limit=${o.all ? 300 : Math.min(300, limit * 3)}`);
  const list = (o.all ? all : all.filter((s) => !s.extra?.parent)).slice(0, limit);
  if (o.json) return json({ sessions: list, total });
  say(sessionLines(list, look, !!process.stdout.isTTY, !!process.stdout.isTTY));
}

/** A session's whole conversation (every page of it). */
export async function wholeTimeline(conn: Conn, key: string): Promise<TimelinePage> {
  let page = await conn.api<TimelinePage>('GET', `/api/sessions/${enc(key)}/timeline?limit=2000&whole=1`);
  const items = [...page.items];
  let start = page.start;
  while (start > 0) {
    page = await conn.api<TimelinePage>('GET', `/api/sessions/${enc(key)}/timeline?before=${start}&limit=2000&whole=1`);
    if (!page.items.length) break;
    items.unshift(...page.items);
    start = page.start;
  }
  return { items, total: items.length, start: 0 };
}

/** A session's conversation as lines, with a head line (its title, program, folder, state). */
export async function conversationLines(conn: Conn, key: string, look: Look, o: { turns?: number } = {}): Promise<string[]> {
  const [one, tl, notes] = await Promise.all([
    conn.api<{ summary: SessionSummary | null; live: LiveState | null; overlay: LiveOverlay }>('GET', `/api/sessions/${enc(key)}`),
    wholeTimeline(conn, key),
    conn.api<{ notes: SessionNote[] }>('GET', `/api/sessions/${enc(key)}/notes`).catch(() => ({ notes: [] as SessionNote[] })),
  ]);
  const s = one.summary;
  const { p } = look;
  const head = s ? [p.bold(s.title || '(untitled)'), p.dim([s.acpName ?? programName(s.agent, s.acpAgent), tildify(s.cwd, look.home), statusWord({ ...s, live: one.live }, p)].filter(Boolean).join(' · '))] : [p.bold(key)];
  return [...head, '', ...historyLines(tl.items, notes.notes, { ...look, cwd: s?.cwd ?? look.cwd }, o)];
}

/** `hydor show <key>`. */
async function show(conn: Conn, o: Opts, look: Look) {
  const key = await resolveKey(conn, o.args[0]);
  if (o.json) {
    const [one, tl, notes] = await Promise.all([
      conn.api('GET', `/api/sessions/${enc(key)}`),
      wholeTimeline(conn, key),
      conn.api<{ notes: SessionNote[] }>('GET', `/api/sessions/${enc(key)}/notes`).catch(() => ({ notes: [] })),
    ]);
    return json({ ...one, items: tl.items, notes: notes.notes });
  }
  say(await conversationLines(conn, key, look, { turns: o.limit }));
}

/** `hydor send <key> <message>`: now when it is free, else after its turn. */
async function send(conn: Conn, o: Opts) {
  const key = await resolveKey(conn, o.args[0]);
  const text = o.args.slice(1).join(' ').trim() || (!process.stdin.isTTY ? (await readStdin()).trim() : '');
  if (!text) throw new UsageError('Give the message: hydor send <key> "…"');
  const one = await conn.api<{ live: LiveState | null }>('GET', `/api/sessions/${enc(key)}`);
  const queue = busy(one.live);
  await conn.api('POST', `/api/sessions/${enc(key)}/${queue ? 'queue' : 'message'}`, { text });
  if (o.json) return json({ ok: true, key, queued: queue });
  say(queue ? 'Queued: it goes when the agent’s turn ends.' : 'Sent.');
}

/** `hydor stop <key>`: stops its turn (the agent stays ready). */
async function stop(conn: Conn, o: Opts) {
  const key = await resolveKey(conn, o.args[0]);
  try {
    await conn.api('POST', `/api/sessions/${enc(key)}/interrupt`, {});
  } catch (e) {
    if ((e as ApiError).status === 409) {
      if (o.json) return json({ ok: false, error: (e as Error).message });
      return say('It is not working.');
    }
    throw e;
  }
  if (o.json) return json({ ok: true });
  say('Stopped its turn.');
}

/** The programs the commands about models speak of, by the names people type. */
const PROGRAMS: { name: string; agent: 'claude' | 'codex' | 'acp'; acp?: string; tier: 'claude' | 'codex' | 'console' }[] = [
  { name: 'claude', agent: 'claude', tier: 'claude' },
  { name: 'codex', agent: 'codex', tier: 'codex' },
  { name: 'custom', agent: 'acp', acp: 'console', tier: 'console' },
];

function programArg(name: string | undefined) {
  if (!name) return undefined;
  const n = name.toLowerCase();
  const p = PROGRAMS.find((x) => x.name === n || x.tier === n || (n === 'claude-code' && x.name === 'claude'));
  if (!p) throw new UsageError(`No program “${name}”: claude, codex or custom`);
  return p;
}

/** A program's models and modes as lines. */
export function modelLines(name: string, cat: AgentCatalog, look: Look): string[] {
  const { p } = look;
  const out = [p.bold(name)];
  if (!cat.models.length) out.push(p.dim(`  ${cat.modelsError ?? 'No models to pick here.'}`));
  const rows = cat.models.map((m) => [`  ${m.value}`, `${m.label}${m.isDefault && !/default/i.test(m.label) ? p.dim(' (default)') : ''}`, p.dim(m.efforts.length ? `effort: ${m.efforts.join(', ')}` : '')]);
  out.push(...columns(rows).map((l) => truncate(l, look.width)));
  if (cat.modes.length) out.push(p.dim(`  Modes: ${cat.modes.map((m) => `${m.label} (${m.value})${m.value === cat.defaultMode ? ' default' : ''}`).join(', ')}`));
  return out;
}

/** `hydor models [program]`. */
async function models(conn: Conn, o: Opts, look: Look) {
  const one = programArg(o.args[0]);
  const list = one ? [one] : PROGRAMS;
  const cats = await Promise.all(list.map((x) => catalogOf(conn, x.agent, x.acp)));
  if (o.json) return json(Object.fromEntries(list.map((x, i) => [x.name, cats[i]])));
  const out: string[] = [];
  list.forEach((x, i) => {
    if (out.length) out.push('');
    out.push(...modelLines(programName(x.agent, x.acp), cats[i], look));
  });
  say(out);
}

// ---- tiers -------------------------------------------------------------------------------------------------

const TIER_IDS = ['quick', 'standard', 'best', 'max'];

/** The tiers this server has (Max only where it knows it). */
const tierIds = (t: TiersState) => TIER_IDS.filter((id) => id !== 'max' || Object.values(t.defaults ?? {}).some((x) => x && 'max' in x) || Object.values(t.tiers).some((x) => x && 'max' in x));

/** The tiers as a table (a row per tier, a column per program) and the team's settings. */
export async function tierLines(conn: Conn, look: Look, t?: TiersState | null): Promise<string[]> {
  const { p } = look;
  const st = t ?? (await conn.api<TiersState>('GET', '/api/models/tiers'));
  const cats = await Promise.all(PROGRAMS.map((x) => catalogOf(conn, x.agent, x.acp)));
  const cell = (prog: string, tier: string, i: number) => {
    const pick = st.tiers[prog]?.[tier] ?? {};
    const m = pick.model ? modelLabel(pick.model, cats[i].models) : p.dim('its default');
    return `${m}${pick.effort ? p.dim(` · ${pick.effort}`) : ''}`;
  };
  const rows = [['', ...TIER_PROGRAMS.map((x) => p.bold(x.label))], ...tierIds(st).map((id) => [p.bold(tierName(id)), ...PROGRAMS.map((x, i) => cell(x.tier, id, i))])];
  const out = columns(rows, '   ');
  if (st.team) out.push('', `Lead with subagents: ${st.team.on ? p.green('on') : 'off'}    Max for hard problems: ${st.team.hard ? p.green('on') : 'off'}`);
  return out;
}

/** `hydor tiers [show|set|reset|team|hard]`. */
async function tiers(conn: Conn, o: Opts, look: Look) {
  const [sub = 'show', ...rest] = o.args;
  let st: TiersState;
  try {
    st = await conn.api<TiersState>('GET', '/api/models/tiers');
  } catch (e) {
    if ((e as ApiError).status === 404) throw new ApiError(404, 'This Hydor has no tiers: it is an older version');
    throw e;
  }
  const done = async (next: TiersState) => {
    if (o.json) return json(next);
    say(await tierLines(conn, look, next));
  };
  switch (sub) {
    case 'show':
      if (o.json) return json(st);
      return say(await tierLines(conn, look, st));
    case 'set': {
      const [progName, tier, model] = rest;
      const prog = programArg(progName);
      if (!prog || !tier || (!model && !o.effort)) throw new UsageError('hydor tiers set <claude|codex|custom> <tier> <model|default> [--effort <level>]');
      if (!tierIds(st).includes(tier)) throw new UsageError(`No tier “${tier}” here: ${tierIds(st).join(', ')}`);
      const pick = { ...(model && model !== 'default' ? { model } : {}), ...(o.effort && o.effort !== 'default' ? { effort: o.effort } : {}) };
      if (!model && st.tiers[prog.tier]?.[tier]?.model) Object.assign(pick, { model: st.tiers[prog.tier][tier].model });
      const next = { ...st.tiers, [prog.tier]: { ...st.tiers[prog.tier], [tier]: pick } };
      return done(await conn.api<TiersState>('PUT', '/api/models/tiers', { tiers: next }));
    }
    case 'reset':
      return done(await conn.api<TiersState>('PUT', '/api/models/tiers', { tiers: {} }));
    case 'team':
    case 'hard': {
      if (!st.team) throw new ApiError(404, 'This Hydor has no team settings yet: it is an older version');
      const on = rest[0];
      if (on !== 'on' && on !== 'off') throw new UsageError(`hydor tiers ${sub} on|off`);
      return done(await conn.api<TiersState>('PUT', '/api/models/tiers', { team: { ...st.team, [sub === 'team' ? 'on' : 'hard']: on === 'on' } }));
    }
    default:
      throw new UsageError('hydor tiers [show | set <program> <tier> <model> | reset | team on|off | hard on|off]');
  }
}

// ---- agents, tasks, usage ----------------------------------------------------------------------------------

/** Your agents as lines: the built-in ones first. */
export function agentLines(list: Assistant[], look: Look): string[] {
  const { p } = look;
  const rows = list.map((a) => [p.bold(a.name), p.dim(a.id), truncate(a.description ?? '', Math.max(20, look.width - 40)), a.tier ? p.dim(tierName(a.tier)) : '']);
  return columns(rows).map((l) => truncate(l, look.width));
}

async function tasks(conn: Conn, o: Opts, look: Look) {
  const { p } = look;
  if (o.args[0] === 'run') {
    const id = o.args[1];
    if (!id) throw new UsageError('Say which task: hydor tasks run <id> (hydor tasks lists them)');
    const { tasks: list } = await conn.api<{ tasks: ScheduledTask[] }>('GET', '/api/tasks');
    const t = list.find((x) => x.id === id) ?? list.find((x) => x.name.toLowerCase() === id.toLowerCase());
    if (!t) throw new ApiError(404, `No task “${id}”: hydor tasks lists them`);
    const r = await conn.api<{ key?: string }>('POST', `/api/tasks/${encodeURIComponent(t.id)}/run`, {});
    if (o.json) return json(r);
    return say(r.key ? `Started “${t.name}”: ${conn.url(r.key)}` : `Started “${t.name}”.`);
  }
  if (o.args.length) throw new UsageError('hydor tasks [run <id>]');
  const r = await conn.api<{ tasks: ScheduledTask[] }>('GET', '/api/tasks');
  if (o.json) return json(r);
  if (!r.tasks.length) return say('No scheduled tasks yet: make one in the app (Scheduled), or ask an agent to.');
  const when = (ms?: number) => (ms ? new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const rows = r.tasks.map((t) => [
    p.dim(t.id),
    p.bold(t.name),
    scheduleText(t.schedule),
    t.enabled ? (t.nextAt ? p.dim(`next ${when(t.nextAt)}`) : '') : p.yellow(t.pausedReason ? `paused: ${t.pausedReason}` : 'paused'),
    t.lastStatus ? (t.lastStatus === 'ok' ? p.green('last ok') : p.red(`last: ${t.lastStatus}`)) : '',
  ]);
  say(columns(rows).map((l) => truncate(l, look.width)));
}

/** A bar of `n` cells, `pct` full. */
const bar = (pct: number, n: number, p: Paint) => {
  const full = Math.round((Math.max(0, Math.min(100, pct)) / 100) * n);
  const c = pct >= 90 ? p.red : pct >= 70 ? p.yellow : p.accent;
  return c('█'.repeat(full)) + p.dim('░'.repeat(n - full));
};

/** "in 1h 20m". */
function inTime(at?: number | null): string {
  if (!at) return '';
  const m = Math.max(0, Math.round((at - Date.now()) / 60_000));
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `in ${h}h ${m % 60}m` : `in ${Math.round(h / 24)} days`;
}

/** Why a turn ended with no reply: the agent's error, or its plan at its usage limit, in a sentence. */
export async function whyNoReply(conn: Conn, view: { live: LiveState | null; items: TimelineItemLike[] }, agent: string): Promise<string> {
  if (view.live?.error) return `The agent stopped: ${view.live.error}`;
  const err = [...view.items].reverse().find((i) => i.kind === 'system' && (i as { level?: string }).level === 'error') as { text?: string } | undefined;
  if (err?.text) return err.text;
  if (agent === 'claude' || agent === 'codex') {
    try {
      const u = await conn.api<{ claude?: AgentUsage; codex?: AgentUsage }>('GET', '/api/usage', undefined, { timeoutMs: 20_000 });
      const a = agent === 'claude' ? u.claude : u.codex;
      if (a?.limited) return `${agent === 'claude' ? 'Claude Code' : 'Codex'} is at its usage limit (${a.limited.label})${a.limited.resetsAt ? `: it lifts ${inTime(a.limited.resetsAt)}` : ''}`;
    } catch {}
  }
  return 'The agent stopped without a reply';
}

type TimelineItemLike = { kind: string };

/** Plan usage as lines: each program's windows with a bar, its limit when used up. */
export function usageLines(u: { claude?: AgentUsage; codex?: AgentUsage }, look: Look): string[] {
  const { p } = look;
  const out: string[] = [];
  for (const [name, a] of [['Claude Code', u.claude], ['Codex', u.codex]] as const) {
    if (!a) continue;
    if (out.length) out.push('');
    const who = [a.account?.plan, a.account?.email].filter(Boolean).join(' · ');
    out.push(`${p.bold(name)}${who ? p.dim(`  ${who}`) : ''}`);
    if (!a.ok) {
      out.push(p.dim(`  ${a.error ?? 'Not signed in, or nothing to show'}`));
      continue;
    }
    if (a.limited) out.push(`  ${p.red(`At its limit (${a.limited.label})`)}${a.limited.resetsAt ? p.dim(`, lifts ${inTime(a.limited.resetsAt)}`) : ''}`);
    const rows = a.windows.map((w) => [`  ${w.label}`, w.usedPercent == null ? p.dim('–') : `${bar(w.usedPercent, 20, p)} ${Math.round(w.usedPercent)}%`, p.dim(w.resetsAt ? `resets ${inTime(w.resetsAt)}` : '')]);
    out.push(...columns(rows));
    if (a.extra?.enabled && a.extra.used != null) out.push(p.dim(`  Extra usage: ${a.extra.used}${a.extra.monthlyLimit ? ` of ${a.extra.monthlyLimit}` : ''} ${a.extra.currency ?? ''}`.trimEnd()));
  }
  return out.length ? out : ['No usage to show.'];
}

async function usage(conn: Conn, o: Opts, look: Look) {
  const u = await conn.api<{ claude?: AgentUsage; codex?: AgentUsage; accounts?: Record<string, AgentUsage> }>('GET', '/api/usage', undefined, { timeoutMs: 60_000 });
  if (o.json) return json(u);
  say(usageLines(u, look));
}

// ---- the server ----------------------------------------------------------------------------------------------

async function status(o: Opts, look: Look) {
  const { p } = look;
  const { connect } = await import('./client.ts');
  const remote = !!(o.server ?? process.env.HYDOR_URL);
  const base = remote ? (o.server ?? process.env.HYDOR_URL)!.replace(/\/+$/, '') : await localBase();
  const v = await health(base);
  const { UNIT, UNIT_PATH } = await import('../service.ts');
  const { config } = await import('../config.ts');
  const service = remote ? undefined : fs.existsSync(UNIT_PATH) ? (spawnSync('systemctl', ['--user', 'is-active', UNIT], { encoding: 'utf8' }).stdout?.trim() || 'unknown') : null;
  let list: SessionSummary[] = [];
  if (v) {
    try {
      const conn = await connect({ server: o.server, token: o.token, start: false });
      list = (await conn.api<{ sessions: SessionSummary[] }>('GET', '/api/sessions?limit=300')).sessions;
      conn.close();
    } catch {}
  }
  const working = list.filter((s) => busy(s.live) && s.live?.status !== 'waiting');
  const waiting = list.filter((s) => s.live?.status === 'waiting' || (s.live?.pendingApprovals ?? 0) > 0);
  if (o.json) return json({ server: base, local: !remote, version: v, running: !!v, dataDir: remote ? undefined : config.dataDir, service: service === undefined ? undefined : service === null ? { installed: false } : { installed: true, unit: UNIT, state: service }, working: working.map((s) => s.key), waiting: waiting.map((s) => s.key) });
  const out = [v ? `${p.green('●')} ${p.bold(`Hydor ${v}`)}  running at ${base}${remote ? '' : p.dim(' (this computer)')}` : `${p.red('✗')} ${p.red('Nothing answers')} at ${base}${remote ? '' : p.dim(': hydor starts it when you run it, or hydor serve')}`];
  const rows: string[][] = [];
  if (!remote) {
    rows.push([p.dim('Data'), tildify(config.dataDir, look.home)]);
    if (process.platform === 'linux') rows.push([p.dim('Service'), service === null ? 'not installed (hydor service install keeps it running, also after a restart)' : `${UNIT}, ${service}`]);
  }
  if (v) rows.push([p.dim('Sessions'), `${working.length} working, ${waiting.length} ${waiting.length === 1 ? 'needs' : 'need'} you`]);
  out.push(...columns(rows).map((l) => `  ${l}`));
  if (v) {
    const shown = [...waiting, ...working].slice(0, 10);
    const n = keyLength(list);
    for (const s of shown) out.push(`    ${statusMark(s, p)} ${statusWord(s, p)}  ${truncate(s.title || '(untitled)', look.width - 24)} ${p.dim(shortKey(s, n))}`);
  }
  say(out);
}

/** `hydor serve`: the server here, in the foreground (as npm start). */
async function serve() {
  const { APP_ROOT } = await import('../config.ts');
  const base = await localBase();
  const v = await health(base);
  if (v) {
    say(`Hydor ${v} runs at ${base} already.`);
    return 1;
  }
  // The Mac app's own command (its launcher sets HYDOR_APP_BUNDLE): the app runs the server, a second one would hold its port.
  if (process.env.HYDOR_APP_BUNDLE) throw new ApiError(0, 'The Hydor app runs the server: open the app (hydor opens it by itself when it is closed).');
  const entry = path.join(APP_ROOT, 'dist/server/index.js');
  if (!fs.existsSync(entry)) throw new ApiError(0, `It is not built yet: npm ci && npm run build (in ${APP_ROOT})`);
  const child = spawn(process.execPath, [entry], { cwd: APP_ROOT, stdio: 'inherit', env: { NODE_ENV: 'production', ...process.env } });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => child.kill(sig));
  return new Promise<number>((resolve) => child.on('exit', (code, signal) => resolve(code ?? (signal ? 0 : 1))));
}

/** Opens an address in the browser here. */
export function openBrowser(url: string) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(cmd, args as string[], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

/** Reads all of stdin (a message piped in). */
export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (s += c));
    process.stdin.on('end', () => resolve(s));
    process.stdin.on('error', reject);
  });
}

/** Runs one of the listing commands; its exit code. */
export async function listCommand(conn: Conn | null, o: Opts, look: Look): Promise<number> {
  if (o.cmd === 'status') return (await status(o, look), 0);
  if (o.cmd === 'serve') return serve();
  if (!conn) throw new Error('No connection');
  switch (o.cmd) {
    case 'sessions':
      await sessions(conn, o, look);
      return 0;
    case 'show':
      await show(conn, o, look);
      return 0;
    case 'send':
      await send(conn, o);
      return 0;
    case 'stop':
      await stop(conn, o);
      return 0;
    case 'models':
      await models(conn, o, look);
      return 0;
    case 'tiers':
      await tiers(conn, o, look);
      return 0;
    case 'tasks':
      await tasks(conn, o, look);
      return 0;
    case 'usage':
      await usage(conn, o, look);
      return 0;
    default:
      throw new UsageError(`Unknown command: ${o.cmd}`);
  }
}

