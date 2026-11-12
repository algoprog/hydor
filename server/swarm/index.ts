// Swarm mode: a session started with it leads a swarm. Its members are its child sessions (server/children:
// start_child_session, their reports coming back, at most the swarm's size working at once, never in a
// freer mode, within a share of its spending cap), each attacking the task from its own angle; or, as a
// campaign, each making one part of a big change in a worktree of its own. Here: the board they share (posts,
// each to everyone or to one of them, and a campaign's plan and parts), the tools on it, what the lead and the
// members are told, and how word gets around. A finding, a question, a part done or failed, or a message for the
// lead reaches the lead within a minute, progress alone every few minutes, in one message that wakes it; a
// message for a member that is not working wakes that member (in a swarm, so does what the lead tells
// everyone). The lead stops members with swarm_stop, the user from the session's swarm bar.
import { CAMPAIGN_KINDS, campaignParts, partNamed, partsTally, SWARM_KINDS, swarmMode, type CampaignPart, type SwarmBoard, type SwarmKind, type SwarmMode, type SwarmPost } from '../../shared/swarm.ts';
import type { SessionSummary } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { childKeys } from '../children/family.ts';
import { swarmSize } from '../children/index.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature, RunCtx, RunTool } from '../features/types.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { CAMPAIGN_MEMBER_INSTRUCTIONS, campaignLeadInstructions, leadInstructions, MEMBER_INSTRUCTIONS } from './instructions.ts';
import { givenRole, noteRun, roleFromExtra, roleOf, roleWords } from './roles.ts';

/** A finding, a question or a message for the lead: the lead hears of it within this. */
const SOON_MS = 45_000;
/** Progress alone: the lead hears of it at most this often. */
const LATER_MS = 5 * 60_000;
/** The longest post kept. */
const MAX_POST = 6000;
/** A campaign's most parts, and the longest name one may have. */
const MAX_PARTS = 300;
const MAX_PART_NAME = 120;

// ---- the board -------------------------------------------------------------------------------------

const made = new WeakSet<DB>();
function tables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists swarm_posts (
      id integer primary key autoincrement, swarm text not null, author text not null, recipient text,
      kind text not null, body text not null, at integer not null
    );
    create index if not exists swarm_posts_swarm on swarm_posts(swarm, id);
    create table if not exists swarm_reads (swarm text not null, reader text not null, last integer not null, primary key (swarm, reader));
  `);
  // A campaign's posts say which part they are about; its plan lists the parts.
  const cols = new Set((db.prepare('pragma table_info(swarm_posts)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('part')) db.exec('alter table swarm_posts add column part text');
  if (!cols.has('parts')) db.exec('alter table swarm_posts add column parts text');
  made.add(db);
}

interface Row {
  id: number;
  swarm: string;
  author: string;
  recipient: string | null;
  kind: string;
  body: string;
  at: number;
  part: string | null;
  parts: string | null;
}

function listOf(json: string | null): string[] | undefined {
  if (!json) return undefined;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : undefined;
  } catch {
    return undefined;
  }
}

const toPost = (r: Row): SwarmPost => {
  const parts = listOf(r.parts);
  return { id: r.id, swarm: r.swarm, from: r.author, ...(r.recipient ? { to: r.recipient } : {}), kind: r.kind as SwarmKind, text: r.body, at: r.at, ...(r.part ? { part: r.part } : {}), ...(parts ? { parts } : {}) };
};

export function addPost(db: DB, p: { swarm: string; from: string; to?: string; kind: SwarmKind; text: string; part?: string; parts?: string[] }): SwarmPost {
  tables(db);
  const at = Date.now();
  const r = db
    .prepare('insert into swarm_posts (swarm, author, recipient, kind, body, at, part, parts) values (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(p.swarm, p.from, p.to ?? null, p.kind, p.text, at, p.part ?? null, p.parts?.length ? JSON.stringify(p.parts) : null);
  return { id: Number(r.lastInsertRowid), swarm: p.swarm, from: p.from, ...(p.to ? { to: p.to } : {}), kind: p.kind, text: p.text, at, ...(p.part ? { part: p.part } : {}), ...(p.parts?.length ? { parts: p.parts } : {}) };
}

/** A swarm's posts after `after` (oldest first), or its latest `limit`. */
export function postsOf(db: DB, swarm: string, o: { after?: number; limit?: number } = {}): SwarmPost[] {
  tables(db);
  if (o.after !== undefined) return (db.prepare('select * from swarm_posts where swarm = ? and id > ? order by id').all(swarm, o.after) as Row[]).map(toPost);
  return (db.prepare('select * from swarm_posts where swarm = ? order by id desc limit ?').all(swarm, o.limit ?? 300) as Row[]).reverse().map(toPost);
}

/** A campaign's parts and how each stands, from every post about them (however old). */
export function partsOf(db: DB, swarm: string): CampaignPart[] {
  tables(db);
  const rows = db.prepare(`select * from swarm_posts where swarm = ? and (kind = 'plan' or part is not null) order by id`).all(swarm) as Row[];
  return campaignParts(rows.map(toPost));
}

/** Which kind of team a lead leads (a swarm when its settings say nothing, as before campaigns). */
const modeOf = (db: DB, swarm: string): SwarmMode => swarmMode(sessionExtra(db, swarm)) ?? 'swarm';

const lastRead = (db: DB, swarm: string, reader: string): number => {
  tables(db);
  return (db.prepare('select last from swarm_reads where swarm = ? and reader = ?').get(swarm, reader) as { last: number } | undefined)?.last ?? 0;
};

const markRead = (db: DB, swarm: string, reader: string, id: number) => {
  tables(db);
  db.prepare('insert into swarm_reads (swarm, reader, last) values (?, ?, ?) on conflict(swarm, reader) do update set last = max(last, excluded.last)').run(swarm, reader, id);
};

/** What a reader gets from the board: the lead everything others wrote; a member what is for everyone or for it. */
const forReader = (swarm: string, reader: string) => (p: SwarmPost) => p.from !== reader && (reader === swarm || !p.to || p.to === reader);

/** The posts a reader has not read yet. */
const unread = (db: DB, swarm: string, reader: string) => postsOf(db, swarm, { after: lastRead(db, swarm, reader) }).filter(forReader(swarm, reader));

// ---- members -----------------------------------------------------------------------------------------

const BUSY = new Set(['starting', 'working', 'waiting']);
const busy = (s?: SessionSummary | null) => !!s?.live && BUSY.has(s.live.status);
/** When the member was stopped, if it was (and not given more to do since). */
const stoppedAt = (db: DB, key: string): number | null => {
  const v = sessionExtra(db, key).swarmStopped;
  return typeof v === 'number' ? v : v ? 1 : null;
};
const stopped = (db: DB, key: string) => stoppedAt(db, key) !== null;

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

function nameOf(d: Deps, swarm: string, key: string, reader?: string): string {
  if (key === reader) return 'you';
  if (key === swarm) return 'the lead';
  return `“${clip(d.sessions.summary(key)?.title ?? 'member', 60)}” (${key})`;
}

function statusOf(d: Deps, key: string): string {
  const s = d.sessions.summary(key);
  if (!s) return 'removed';
  if (stopped(d.db, key) && !busy(s)) return 'stopped';
  const st = s.live?.status;
  if (st === 'working' || st === 'starting') return 'working';
  if (st === 'waiting') return 'waiting for the user';
  if (st === 'error' || s.live?.error) return 'stopped with an error';
  return 'finished its turn';
}

/** A post as a line in what an agent reads. */
const line = (d: Deps, p: SwarmPost, reader: string, n = 700) =>
  `- ${nameOf(d, p.swarm, p.from, reader)}${p.to ? ` → ${nameOf(d, p.swarm, p.to, reader)}` : ''} · ${p.kind}${p.part ? ` (${p.part})` : ''}: ${clip(p.text, n)}${p.parts?.length ? ` [${p.parts.length} part${p.parts.length === 1 ? '' : 's'}: ${clip(p.parts.join(', '), 400)}]` : ''}`;

function lines(d: Deps, posts: SwarmPost[], reader: string, budget = 12_000): string[] {
  const out: string[] = [];
  let used = 0;
  for (const [i, p] of posts.entries()) {
    const l = line(d, p, reader);
    if (used + l.length > budget) {
      out.push(`- … and ${posts.length - i} more: swarm_read gives them.`);
      break;
    }
    out.push(l);
    used += l.length;
  }
  return out;
}

// ---- word gets around ---------------------------------------------------------------------------------

/** When each swarm's lead next hears of the board. */
const timers = new Map<string, { due: number; t: NodeJS.Timeout }>();
/** Leads that were busy when their news was due: they hear of it when their turn ends. */
const pending = new Set<string>();

function schedule(d: Deps, swarm: string, soon: boolean) {
  const due = Date.now() + (soon ? SOON_MS : LATER_MS);
  const cur = timers.get(swarm);
  if (cur && cur.due <= due) return;
  if (cur) clearTimeout(cur.t);
  const t = setTimeout(() => {
    timers.delete(swarm);
    void tellLead(d, swarm).catch(() => {});
  }, due - Date.now());
  t.unref();
  timers.set(swarm, { due, t });
}

/** What the lead has not read yet, in one message; when it is working, after its turn. */
export async function tellLead(d: Deps, swarm: string) {
  const lead = d.sessions.summary(swarm);
  if (!lead) return;
  if (busy(lead)) return void pending.add(swarm);
  pending.delete(swarm);
  const news = unread(d.db, swarm, swarm);
  if (!news.length) return;
  markRead(d.db, swarm, swarm, news[news.length - 1].id);
  const text = [
    `[Swarm board · ${news.length} new post${news.length === 1 ? '' : 's'}]`,
    ...lines(d, news, swarm),
    '(swarm_read shows the members and the whole board; swarm_post answers everyone or one member.)',
  ].join('\n');
  await d.sessions.deliverOrQueue(swarm, text);
}

/**
 * Messages for a member that is not working wake it (so does what the lead told everyone), with whatever
 * else is new on the board for it; one that is working reads them with swarm_read.
 */
async function tellMember(d: Deps, swarm: string, member: string) {
  if (busy(d.sessions.summary(member)) || stopped(d.db, member)) return;
  const news = unread(d.db, swarm, member);
  // In a campaign what the lead tells everyone wakes nobody: a member whose part is done stays done.
  const everyone = modeOf(d.db, swarm) !== 'campaign';
  const forIt = news.filter((p) => p.to === member || (everyone && !p.to && p.from === swarm)).length;
  if (!forIt) return;
  markRead(d.db, swarm, member, news[news.length - 1].id);
  const others = news.length - forIt;
  const text = [
    `[Swarm board · ${forIt === 1 ? 'a message' : `${forIt} messages`} for you${others ? `, and ${others} other new post${others === 1 ? '' : 's'}` : ''}]`,
    ...lines(d, news, member),
    '(Answer with swarm_post; swarm_read shows the members and the whole board.)',
  ].join('\n');
  await d.sessions.deliverOrQueue(member, text);
}

/**
 * A new post: open pages show it, and the one it is for hears of it. The lead's posts wake the members they
 * are for (all of them, for one to everyone, except in a campaign: there members read those on the board);
 * a member's go to the lead (soon unless it is only progress), or wake the member they are for.
 */
export function posted(d: Deps, p: SwarmPost) {
  d.broadcast({ t: 'feature', id: 'swarm', key: p.swarm, data: { post: p } });
  const wake = (k: string) => void tellMember(d, p.swarm, k).catch(() => {});
  if (p.from === p.swarm) {
    if (p.to) wake(p.to);
    else if (modeOf(d.db, p.swarm) !== 'campaign') childKeys(d.db, p.swarm).forEach(wake);
  } else if (p.to && p.to !== p.swarm) wake(p.to);
  else schedule(d, p.swarm, p.to === p.swarm || p.kind !== 'progress');
}

/** Stops a member's work; messages no longer wake it, until it is given more to do (message_child). */
export async function stopMember(d: Deps, member: string) {
  setSessionExtra(d.db, member, { swarmStopped: Date.now() });
  if (busy(d.sessions.summary(member))) await d.sessions.interrupt(member).catch(() => {});
}

// ---- the tools ------------------------------------------------------------------------------------------

/** The swarm a run belongs to: its own key for the lead, the lead's for a member. */
function swarmOf(ctx: RunCtx): { swarm: string; lead: boolean } {
  const r = roleOf(ctx.deps.db, ctx);
  if (!r) throw new Error('This session is not in a swarm.');
  return r.role === 'lead' ? { swarm: ctx.key, lead: true } : { swarm: r.swarm, lead: false };
}

/** Who a post is for, from the tool's `to`: the lead, a member by its key, or everyone. */
function recipient(d: Deps, swarm: string, to: unknown): string | undefined {
  const t = String(to ?? '').trim();
  if (!t || /^(all|everyone|everybody)$/i.test(t)) return undefined;
  if (/^(lead|main|leader)$/i.test(t) || t === swarm) return swarm;
  const members = childKeys(d.db, swarm);
  const hit = members.find((k) => k === t) ?? members.find((k) => k.endsWith(t) && t.length >= 6);
  if (!hit) throw new Error(`There is no member "${t}" in this swarm. swarm_read lists the members and their keys; use "lead" for the lead.`);
  return hit;
}

function membersText(d: Deps, swarm: string, reader: string): string {
  const keys = childKeys(d.db, swarm);
  const rows = keys.map((k) => `- ${k === reader ? 'you' : k} · “${clip(d.sessions.summary(k)?.title ?? '?', 80)}” · ${statusOf(d, k)}`);
  return [`Members (${keys.length}; at most ${swarmSize(d.db)} work at once):`, ...(rows.length ? rows : ['- none yet'])].join('\n');
}

/** A campaign's plan from the tool's `parts`: short names, one each, in order. */
function planParts(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [];
  const out: string[] = [];
  for (const x of list) {
    const name = String(x ?? '')
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) continue;
    if (name.length > MAX_PART_NAME) throw new Error(`Part names are short (${MAX_PART_NAME} characters at most): "${clip(name, 60)}" is too long. Put what a part holds in its member’s brief.`);
    if (partNamed(out.map((n) => ({ name: n })), name)) throw new Error(`"${name}" is in the plan twice: each part needs a name of its own.`);
    out.push(name);
  }
  if (out.length > MAX_PARTS) throw new Error(`${out.length} parts is too many: at most ${MAX_PARTS}. Make the parts bigger.`);
  return out;
}

/** The part a post is about, as the plan names it. */
function partOf(d: Deps, swarm: string, name: unknown, lead: boolean): string | undefined {
  const want = String(name ?? '').trim();
  if (!want) return undefined;
  const parts = partsOf(d.db, swarm);
  if (!parts.length) throw new Error(lead ? 'There is no plan yet: post it first (kind plan, with parts).' : 'The lead has not posted the plan yet: ask the lead (to "lead") which part is yours.');
  const hit = partNamed(parts, want);
  if (!hit) {
    const near = parts.filter((p) => p.name.toLowerCase().includes(want.toLowerCase()) || want.toLowerCase().includes(p.name.toLowerCase())).map((p) => p.name);
    throw new Error(`There is no part "${want}" in the plan.${near.length ? ` Did you mean ${near.slice(0, 5).map((n) => `"${n}"`).join(' or ')}?` : ` Its parts: ${clip(parts.map((p) => p.name).join(', '), 1500)}.`}`);
  }
  return hit.name;
}

const POST_TEXT = { type: 'string', description: 'Short and concrete: numbers, formulas, file paths.' };
const POST_TO = { type: 'string', description: 'A member’s key, or "lead". Leave it out for everyone.' };

/** Posts and says what is new on the board for the poster. */
async function postIt(ctx: RunCtx, swarm: string, p: { kind: SwarmKind; to?: string; text: string; part?: string; parts?: string[] }) {
  const d = ctx.deps;
  const post = addPost(d.db, { swarm, from: ctx.key, ...p, text: p.text.slice(0, MAX_POST) });
  posted(d, post);
  const news = unread(d.db, swarm, ctx.key);
  if (news.length) markRead(d.db, swarm, ctx.key, news[news.length - 1].id);
  const to = p.to;
  const who = to ? nameOf(d, swarm, to, ctx.key) : 'everyone';
  const campaign = modeOf(d.db, swarm) === 'campaign';
  const awake =
    to && to !== swarm
      ? busy(d.sessions.summary(to))
        ? ' It is working: it sees this the next time it reads the board.'
        : stopped(d.db, to)
          ? ' It was stopped, so this does not wake it.'
          : ' It was not working: this wakes it.'
      : !to && campaign && swarm === ctx.key
        ? ' In a campaign this wakes nobody: members see it when they read the board.'
        : '';
  return [`Posted to ${who} (${p.kind}${p.part ? `, ${p.part}` : ''}${p.parts ? `, ${p.parts.length} part${p.parts.length === 1 ? '' : 's'}` : ''}).${awake}`, ...(news.length ? ['', 'New on the board since you last read:', ...lines(d, news, ctx.key)] : [])].join('\n');
}

const POST: RunTool = {
  name: 'swarm_post',
  description:
    'Post to your swarm’s board, which every member and the lead read: what you tried and where you are, a result the others can use, a question, an answer. With to, a message for one member (its key) or for the lead ("lead"); a member that is not working is woken by it. Returns what others posted since you last read.',
  inputSchema: {
    type: 'object',
    properties: {
      text: POST_TEXT,
      kind: {
        type: 'string',
        enum: SWARM_KINDS,
        description: 'progress: what you tried and where you are; finding: a result the others can use now; question: something you need answered; note: anything else. Default: progress (note for the lead).',
      },
      to: POST_TO,
    },
    required: ['text'],
  },
  async run(a, ctx) {
    const d = ctx.deps;
    const { swarm, lead } = swarmOf(ctx);
    const text = String(a.text ?? '').trim();
    if (!text) throw new Error('The text is empty.');
    const kind: SwarmKind = SWARM_KINDS.includes(a.kind) ? a.kind : lead ? 'note' : 'progress';
    const to = recipient(d, swarm, a.to);
    if (to === ctx.key) throw new Error('That is you.');
    return postIt(ctx, swarm, { kind, to, text });
  },
};

/** A campaign's: its plan, and how each part stands, besides what a swarm's posts say. */
const CAMPAIGN_POST: RunTool = {
  name: 'swarm_post',
  description:
    'Post to your campaign’s board, which the lead and every member read. kind plan (the lead): the parts, in the order to do them, in parts; post it again, whole, when it changes. For a part (part set to its name as the plan has it): progress (where you are), done (finished, committed on its branch, its checks pass: say the branch and the checks) or failed (what went wrong, what you tried). Also finding, question or note. With to, a message for one member (its key) or the lead ("lead"), which wakes a member that is not working; posts to everyone wake nobody. Returns what others posted since you last read.',
  inputSchema: {
    type: 'object',
    properties: {
      text: POST_TEXT,
      kind: {
        type: 'string',
        enum: CAMPAIGN_KINDS,
        description: 'plan: the lead’s plan, with parts; progress, done or failed: how a part stands, with part; finding: something the other parts can use; question: something you need answered; note: anything else. Default: progress (note for the lead).',
      },
      part: { type: 'string', description: 'The part this is about, as the plan names it. Needed for done and failed.' },
      parts: { type: 'array', items: { type: 'string' }, description: 'For kind plan: every part’s short, unique name ("packages/api", "src/billing"), in the order to do them.' },
      to: POST_TO,
    },
    required: ['text'],
  },
  async run(a, ctx) {
    const d = ctx.deps;
    const { swarm, lead } = swarmOf(ctx);
    const text = String(a.text ?? '').trim();
    if (!text) throw new Error('The text is empty.');
    const kind: SwarmKind = CAMPAIGN_KINDS.includes(a.kind) ? a.kind : lead ? 'note' : 'progress';
    if (kind === 'plan') {
      if (!lead) throw new Error('Only the lead posts the plan. Ask the lead (to "lead") if the parts should change.');
      const parts = planParts(a.parts);
      if (!parts.length) throw new Error('A plan needs its parts: parts, a list of short, unique names, in the order to do them.');
      return postIt(ctx, swarm, { kind, text, parts });
    }
    const part = partOf(d, swarm, a.part, lead);
    if ((kind === 'done' || kind === 'failed') && !part) throw new Error(`Say which part is ${kind}: part, its name as in the plan.`);
    const to = recipient(d, swarm, a.to);
    if (to === ctx.key) throw new Error('That is you.');
    return postIt(ctx, swarm, { kind, to, text, ...(part ? { part } : {}) });
  },
};

/** A campaign's parts as an agent reads them: the lead every part, a member the count and the parts it posted about. */
function partsText(d: Deps, swarm: string, reader: string): string[] {
  const parts = partsOf(d.db, swarm);
  if (!parts.length) return ['Parts: no plan yet.'];
  const n = partsTally(parts);
  const head = `Parts (${n.total}): ${n.done} done, ${n.failed} failed, ${n.working} working, ${n.waiting} waiting.`;
  const mine = reader === swarm ? parts : parts.filter((p) => p.member === reader);
  const row = (p: CampaignPart) =>
    `- ${p.name} · ${p.status}${p.tries > 1 ? ` (failed ${p.tries} times)` : p.status !== 'failed' && p.tries === 1 ? ' (failed once)' : ''}${p.member ? ` · ${p.member === reader ? 'you' : p.member}` : ''}${p.note ? ` · ${clip(p.note, 160)}` : ''}`;
  const rows: string[] = [];
  let used = 0;
  for (const [i, p] of mine.entries()) {
    const l = row(p);
    if (used + l.length > 8000) {
      rows.push(`- … and ${mine.length - i} more.`);
      break;
    }
    rows.push(l);
    used += l.length;
  }
  return [head, ...rows];
}

const READ: RunTool = {
  name: 'swarm_read',
  description: 'Read your swarm’s board: the members (their keys, angles and what each is doing), a campaign’s parts and how each stands, and the posts since you last read; with all, the latest 60 posts whatever you have read.',
  inputSchema: { type: 'object', properties: { all: { type: 'boolean', description: 'The latest posts, read or not.' } } },
  annotations: { readOnlyHint: true },
  async run(a, ctx) {
    const d = ctx.deps;
    const { swarm } = swarmOf(ctx);
    const posts = a.all ? postsOf(d.db, swarm, { limit: 60 }).filter(forReader(swarm, ctx.key)) : unread(d.db, swarm, ctx.key);
    if (posts.length) markRead(d.db, swarm, ctx.key, Math.max(...posts.map((p) => p.id)));
    return [
      membersText(d, swarm, ctx.key),
      ...(modeOf(d.db, swarm) === 'campaign' ? ['', ...partsText(d, swarm, ctx.key)] : []),
      '',
      posts.length ? (a.all ? 'The latest posts:' : 'New since you last read:') : a.all ? 'Nothing on the board yet.' : 'Nothing new since you last read.',
      ...lines(d, posts, ctx.key, 16_000),
    ].join('\n');
  },
};

const STOP: RunTool = {
  name: 'swarm_stop',
  description:
    'Stop members of your swarm: one by its key, or every member still working when the task is solved or the angles are used up. A stopped member keeps what it did, and messages no longer wake it; message_child can still give it more to do.',
  inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'One member’s key. Leave it out for every member still working.' } } },
  async run(a, ctx) {
    const d = ctx.deps;
    const { swarm, lead } = swarmOf(ctx);
    if (!lead) throw new Error('Only the lead stops members.');
    const one = String(a.key ?? '').trim();
    const keys = one ? [recipient(d, swarm, one)].filter((k): k is string => !!k && k !== swarm) : childKeys(d.db, swarm).filter((k) => !stopped(d.db, k));
    if (!keys.length) return one ? 'That is not a member.' : 'No member is left to stop.';
    const working = keys.filter((k) => busy(d.sessions.summary(k)));
    for (const k of keys) await stopMember(d, k);
    return `Stopped ${keys.length} member${keys.length === 1 ? '' : 's'}${working.length ? ` (${working.length} of them were working)` : ''}.`;
  },
};

// ---- the capability ---------------------------------------------------------------------------------------

export const swarm: Feature = {
  id: 'swarm',

  tools(ctx) {
    const r = roleOf(ctx.deps.db, ctx);
    if (!r) return [];
    const post = r.mode === 'campaign' ? CAMPAIGN_POST : POST;
    return r.role === 'lead' ? [post, READ, STOP] : [post, READ];
  },

  spawn(s, d) {
    const r = roleFromExtra(d.db, s.extra);
    noteRun(s.runId, r);
    if (!r) return undefined;
    const size = swarmSize(d.db);
    if (r.mode === 'campaign') return { instructions: [r.role === 'lead' ? campaignLeadInstructions(size) : CAMPAIGN_MEMBER_INSTRUCTIONS] };
    return { instructions: [r.role === 'lead' ? leadInstructions(size) : MEMBER_INSTRUCTIONS] };
  },

  async beforeSend(key, d) {
    // Swarm mode turned on, off or to a campaign in the session: its agent starts afresh with the instructions and tools for it.
    await givenRole.refresh(key, d, () => roleWords(roleFromExtra(d.db, sessionExtra(d.db, key))));
  },

  turnEnd(t, d) {
    if (t.external) return;
    const r = roleFromExtra(d.db, sessionExtra(d.db, t.key));
    if (r?.role === 'lead') {
      // News that waited for its turn to end; news a restart left unsent goes out in a while.
      if (pending.has(t.key)) setTimeout(() => void tellLead(d, t.key).catch(() => {}), 2000).unref();
      else if (!timers.has(t.key) && unread(d.db, t.key, t.key).length) schedule(d, t.key, false);
    }
    if (r?.role === 'member') {
      // A stopped member given more to do (message_child) is back in the swarm once that turn ends.
      const at = stoppedAt(d.db, t.key);
      if (at !== null && t.startedAt > at + 5000) setSessionExtra(d.db, t.key, { swarmStopped: null });
      // Messages that came while it worked.
      setTimeout(() => void tellMember(d, r.swarm, t.key).catch(() => {}), 2000).unref();
    }
  },

  start(d) {
    // News a restart left unsent: a lead with posts it has not read from the last day hears of them in a while.
    setTimeout(() => {
      try {
        tables(d.db);
        const rows = d.db.prepare('select distinct swarm from swarm_posts where at > ?').all(Date.now() - 24 * 3600_000) as { swarm: string }[];
        for (const r of rows) if (d.sessions.summary(r.swarm) && unread(d.db, r.swarm, r.swarm).length) schedule(d, r.swarm, false);
      } catch {}
    }, 30_000).unref();
  },

  routes(d) {
    const keyOf = (req: { params: unknown }) => {
      const key = (req.params as { key: string }).key;
      if (roleFromExtra(d.db, sessionExtra(d.db, key))?.role !== 'lead') throw new HttpError(404, 'That session does not lead a swarm');
      return key;
    };
    d.app.get('/api/swarm/:key', async (req): Promise<SwarmBoard> => {
      const key = keyOf(req);
      const members = childKeys(d.db, key);
      const mode = modeOf(d.db, key);
      return { swarm: key, mode, size: swarmSize(d.db), members, stopped: members.filter((k) => stopped(d.db, k)), posts: postsOf(d.db, key, { limit: 300 }), ...(mode === 'campaign' ? { parts: partsOf(d.db, key) } : {}) };
    });
    // The user stops one member, or every member still working.
    d.app.post('/api/swarm/:key/stop', async (req) => {
      const key = keyOf(req);
      const one = String((req.body as { member?: unknown } | undefined)?.member ?? '');
      const members = childKeys(d.db, key);
      if (one && !members.includes(one)) throw new HttpError(404, 'That is not a member of this swarm');
      const keys = one ? [one] : members.filter((k) => busy(d.sessions.summary(k)));
      for (const k of keys) await stopMember(d, k);
      d.broadcast({ t: 'feature', id: 'swarm', key, data: { stopped: keys } });
      // The lead hears of it, since stopped members send no report of the turn cut short.
      const team = modeOf(d.db, key);
      if (keys.length)
        await d.sessions
          .deliverOrQueue(key, `[The user stopped ${keys.length === 1 ? `the ${team} member ${nameOf(d, key, keys[0])}` : `${keys.length} ${team} members: ${keys.map((k) => nameOf(d, key, k)).join(', ')}`}. Stopped members keep what they did; message_child gives one more to do.]`)
          .catch(() => {});
      return { stopped: keys };
    });
  },
};
