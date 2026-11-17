// Board cards that keep themselves up to date (shared/board-refresh.ts): a card's refresh asks an agent its question
// again (the request it was pinned from, or one the person wrote) and replaces the card's data with the answer's new
// ```ui block of the same UI, checked against the UI's type as save_board checks cards. Each refresh is a run of the
// scheduler's (server/scheduler.ts BoardRunner): a card with a schedule is a scheduled task of its own, id
// `board-<page>-<card>`, kept in step with the board's cards on every save (syncBoard), so Schedules' week view shows its
// runs with everything else that runs by itself; Refresh now runs it, or runs a card that refreshes only when asked
// under the same id. Each run is a session of its own on the card's tier (Quick unless picked), archived so it stays
// out of the list, sending nothing (as "Test without sending": calls that act outside are held as "would have sent"),
// and quiet: the card shows how it went. A refresh that fails keeps the card's data; three in a row pause its schedule
// (the scheduler's own count), with one notice. Each board has a monthly cap for its refreshes ($5 unless changed, or
// off): its sessions' spending this month counts against it (as an agent's monthly budget does: server/assistants/
// rules.ts), each refresh's session is capped at what is left, and once it is reached refreshes wait for the next month,
// with one notice that month.
import fs from 'node:fs';
import os from 'node:os';
import { userLang } from '../language/index.ts';
import { answerUi } from '../../shared/answer-ui/index.ts';
import { isDataRef } from '../../shared/answer-ui/data-ref.ts';
import type { RunStatus, RunTrigger } from '../../shared/automations.ts';
import {
  asTaskSchedule,
  boardCap,
  refreshText,
  refreshTier,
  REFRESH_FAIL_LIMIT,
  runsPerMonth,
  type BoardRefreshState,
  refreshesByItself,
  type CardRefresh,
  type CardRefreshState,
} from '../../shared/board-refresh.ts';
import { CardError, cardTitle, checkCard, type Board, type BoardCard } from '../../shared/boards.ts';
import { DRY_RUN_NOTE } from '../../shared/outbox.ts';
import { TIERS, tierLabel, type Tier } from '../../shared/tiers.ts';
import type { Agent } from '../../shared/types.ts';
import { monthStart } from '../assistants/rules.ts';
import { tierPick } from '../assistants/tiers.ts';
import { HttpError } from '../auth.ts';
import { ownSpend } from '../budget/spend.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { turnsOf } from '../opinion/turns.ts';
import { costOf } from '../prices.ts';
import type { BoardRunner } from '../scheduler.ts';
import { parseExtra } from '../sessionExtra.ts';
import { localNow } from '../userPrefs.ts';
import { readBoard } from './boards.ts';
import { addVersion, listPages, onPageChange, pageInfo, pageSource } from './store.ts';

// ---- which card a task refreshes -----------------------------------------------------------------------------------

/** The scheduled task (and the runs) of a card's refreshes. */
export const refreshTaskId = (page: string, card: string) => `board-${page}-${card}`;

const TASK_ID = /^board-([a-z0-9]{4,40})-(c[a-z0-9]{4,40})$/;

/** The board and card a refresh's task is for; null for any other task. */
export function refreshOwner(taskId: string): { page: string; card: string } | null {
  const m = TASK_ID.exec(taskId);
  return m ? { page: m[1], card: m[2] } : null;
}

/** What a refresh's session keeps in its settings (SessionExtra.boardRefresh). */
export interface RefreshMark {
  page: string;
  card: string;
  run: string;
  tier: Tier;
}

/** A board as kept, with its title; null when it is not a board of the Library (anymore). */
function boardOf(db: DB, page: string): { title: string; board: Board; locked: boolean } | null {
  const info = pageInfo(db, page);
  if (!info || info.kind !== 'board') return null;
  const src = pageSource(db, page);
  if (!src) return null;
  return { title: info.title, board: readBoard(src.text), locked: !!info.locked };
}

/** Whether a card reads its data from a spreadsheet or a file each time it is shown (then it needs no refresh). */
export const readsSource = (c: Pick<BoardCard, 'data'>) => isDataRef(c.data);

// ---- where a refresh runs ------------------------------------------------------------------------------------------

/** The agent program a card's refreshes run on, and the folder: those of the conversation it came from, else Claude Code in the home folder. */
function placeOf(d: Pick<Deps, 'sessions'>, c: BoardCard): { agent: Agent; acpAgent?: string; cwd: string } {
  const s = c.from?.session ? d.sessions.summary(c.from.session) : null;
  const folder = [c.from?.cwd, s?.cwd].find((p): p is string => !!p && fs.existsSync(p));
  const agent: Agent = s?.agent === 'codex' || s?.agent === 'acp' ? s.agent : 'claude';
  return { agent, ...(agent === 'acp' ? { acpAgent: s?.acpAgent || 'console' } : {}), cwd: folder ?? os.homedir() };
}

/** A run nobody watches goes ahead with routine steps (as an app's run does). */
const modeFor = (agent: Agent, acpAgent?: string) => (agent === 'claude' || agent === 'codex' ? 'auto' : acpAgent === 'console' ? 'auto' : undefined);

/**
 * The question a card answers when it has none of its own yet: the message that began the turn whose reply it was
 * pinned from (its conversation's), or the scheduled task's prompt whose run held it. Empty when there is none to read.
 */
export async function sourceQuestion(d: Pick<Deps, 'sessions' | 'scheduler'>, c: BoardCard): Promise<string> {
  if (c.refresh?.ask) return c.refresh.ask;
  const f = c.from;
  if (f?.session && f.at !== undefined) {
    try {
      const tl = await d.sessions.timeline(f.session);
      let items = tl.parser.items;
      if (!items.some((i) => i.seq === f.at) && tl.readMore) {
        await tl.readMore().catch(() => {});
        items = tl.parser.items;
      }
      const turn = turnsOf(items).find((t) => [t.prompt, ...t.items].some((i) => i?.seq === f.at));
      const text = turn?.prompt?.text.trim();
      if (text) return text.slice(0, 2000);
    } catch {}
  }
  if (f?.task) {
    try {
      return d.scheduler.task(f.task).prompt.slice(0, 2000);
    } catch {}
  }
  return '';
}

// ---- money --------------------------------------------------------------------------------------------------------

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** When the month after the one `now` is in begins (this computer's time, as an agent's monthly budget counts). */
export function monthEnd(now = Date.now()): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

/** The refresh sessions of a board started since `since`, by key, with their settings. */
function refreshSessions(db: DB, page: string, since: number): { key: string; mark: RefreshMark }[] {
  const rows = db.prepare('select key, extra from app_sessions where created_at >= ? and instr(extra, ?) > 0 order by created_at').all(since, `"page":${JSON.stringify(page)}`) as { key: string; extra: string | null }[];
  const out: { key: string; mark: RefreshMark }[] = [];
  for (const r of rows) {
    const m = parseExtra(r.extra).boardRefresh as RefreshMark | undefined;
    if (m && typeof m === 'object' && m.page === page) out.push({ key: r.key, mark: m });
  }
  return out;
}

/** What a board's refreshes spent this month, in dollars: each refresh session's own spending (as the budgets count it). */
export function boardMonthSpend(db: DB, page: string, now = Date.now()): number {
  return round4(refreshSessions(db, page, monthStart(now)).reduce((s, r) => s + ownSpend(db, r.key).usd, 0));
}

/** Where a board stands against its cap this month. */
export function capState(db: DB, page: string, board: Board, now = Date.now()): { cap: number | null; spentUsd: number; reached: boolean; monthEnds: number } {
  const cap = boardCap(board);
  const spentUsd = boardMonthSpend(db, page, now);
  return { cap, spentUsd, reached: cap !== null && spentUsd >= cap, monthEnds: monthEnd(now) };
}

/** A typical refresh's tokens, for a tier's cost before any refresh ran on it: a few model calls, mostly cached. */
const TYPICAL_TOKENS = { tokensIn: 40_000, tokensCached: 120_000, tokensOut: 3_000 };

const middle = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : undefined;
};

/** Refreshes that ended well, newest first, with what each cost and the tier it ran on (any board's, or one card's). */
function pastRefreshes(db: DB, taskId?: string): { task: string; cost: number; tier: Tier | null }[] {
  const rows = db
    .prepare(
      `select r.task_id as task, r.cost_usd as cost, a.extra as extra from task_runs r left join app_sessions a on a.key = r.key
       where ${taskId ? 'r.task_id = ?' : "r.task_id like 'board-%'"} and r.status = 'done' and r.cost_usd > 0 order by r.started_at desc limit 200`,
    )
    .all(...(taskId ? [taskId] : [])) as { task: string; cost: number; extra: string | null }[];
  return rows.map((r) => {
    const m = parseExtra(r.extra).boardRefresh as RefreshMark | undefined;
    return { task: r.task, cost: r.cost, tier: m && typeof m.tier === 'string' ? m.tier : null };
  });
}

/**
 * What a refresh costs on each tier, typically: the middle of the last refreshes on it (any board's), else what a
 * typical refresh's tokens come to at the tier's model's price; null when neither is known.
 */
export function tierCosts(db: DB): Record<Tier, number | null> {
  const past = pastRefreshes(db);
  const out = {} as Record<Tier, number | null>;
  for (const { id } of TIERS) {
    const seen = past.filter((p) => p.tier === id).slice(0, 20).map((p) => p.cost);
    let c = middle(seen);
    if (c === undefined) {
      const pick = tierPick(db, id, 'claude');
      c = (pick?.model ? costOf(db, pick.model, TYPICAL_TOKENS) : null) ?? undefined;
    }
    out[id] = c === undefined ? null : Math.max(0.001, round4(c));
  }
  return out;
}

// ---- notices -------------------------------------------------------------------------------------------------------

/** Tells the person once a month that a board's refreshes stopped at its cap. */
function capNotice(d: Pick<Deps, 'db' | 'sessions'>, page: string, title: string, cap: number, now = Date.now()) {
  const month = new Date(now).toISOString().slice(0, 7);
  const k = `boards.capNotice.${page}`;
  if (kvGet(d.db, k) === month) return;
  kvSet(d.db, k, month);
  // Notifications use the same language as the app, including their interpolated dates.
  const lang = userLang(d.db);
  const resumes = new Date(monthEnd(now)).toLocaleDateString(lang === 'en' ? 'en-GB' : lang, { day: 'numeric', month: 'long' });
  d.sessions.emit('notify', {
    key: `board:${page}`,
    kind: 'waiting',
    title,
    body: `Its cards stopped refreshing: they reached the board’s $${cap} cap for this month. They start again on ${resumes}; raise the cap on the board to go on now.`,
    agent: 'claude',
    at: now,
    url: `/pages/${page}`,
  });
}

// ---- the pages hear ------------------------------------------------------------------------------------------------

/** The board's page asks again what its cards' refreshes are doing. */
const tellBoard = (d: Pick<Deps, 'broadcast'>, page: string) => d.broadcast({ t: 'feature', id: 'boards', data: { board: page } });

// ---- a refresh's message, and its answer read ---------------------------------------------------------------------

const DATA_CUT = 12_000;

/** What a refresh's agent is told: the card, its question, the UI's type and its data now, and how to answer. */
export function refreshPrompt(o: { db: DB; board: string; card: BoardCard; question: string; trigger: RunTrigger }): string {
  const c = o.card;
  const spec = answerUi(c.ui);
  const name = spec?.id ?? c.ui;
  const data = JSON.stringify(c.data, null, 1);
  const when = c.refresh?.schedule ? `on its schedule (${refreshText(c.refresh.schedule)})` : 'when the user asked';
  return [
    `This is a refresh of an answer card on the board “${o.board}” in the user’s Library, started ${o.trigger === 'schedule' ? when : 'by hand'}. It is now ${localNow(o.db)}.`,
    `The card: “${cardTitle(c)}”, a ${spec?.title ?? name} card (the ${name} answer UI). The question it answers, asked again now:\n<question>\n${o.question}\n</question>`,
    'Find the answer as it stands now: search, read, look up or run what you need. Nobody watches this refresh: change nothing (no files, no messages, no settings), ask nothing, and be brief.',
    `End your reply with exactly one \`\`\`ui ${name} block holding the card’s new data as one JSON object, in the same shape as its data now (below), with every value brought up to date. Keep its title and its fields unless what changed calls for others. The block is checked against the ${name} UI’s type and becomes the card’s data; nothing else in your reply is kept. If you cannot find what it needs, say why in one sentence and leave the block out: the card keeps what it shows.`,
    `The card’s data now:\n\`\`\`json\n${data.length > DATA_CUT ? `${data.slice(0, DATA_CUT)}… (cut)` : data}\n\`\`\``,
    spec ? `The ${name} UI’s data (its type):\n${spec.shape.trim()}` : '',
    DRY_RUN_NOTE,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The ```ui blocks of a reply: each one's name and the text inside it. */
function uiBlocks(reply: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /(^|\n)[ \t]*(`{3,}|~{3,})ui[ \t]+([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g;
  for (let m = re.exec(reply); m; m = re.exec(reply)) out.push({ name: m[3], body: m[4] });
  return out;
}

const preview = (s: string, n = 140) => {
  const t = s.replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * A card's new data from a refresh's reply: its last ```ui block of the card's UI, checked against the UI's type as
 * save_board checks an agent's card. A plain reason (for "Could not update: …") when there is none that fits.
 */
export function readAnswer(c: BoardCard, reply: string): { data: Record<string, unknown> } | { error: string } {
  const spec = answerUi(c.ui);
  const name = spec?.id ?? c.ui;
  const blocks = uiBlocks(reply);
  const mine = blocks.filter((b) => (answerUi(b.name)?.id ?? b.name) === name);
  if (!mine.length) {
    if (blocks.length) {
      const other = answerUi(blocks.at(-1)!.name)?.title ?? blocks.at(-1)!.name;
      return { error: `the agent answered with a ${other.toLowerCase()} card, not a ${(spec?.title ?? name).toLowerCase()} card` };
    }
    const said = preview(reply);
    return { error: said ? `the agent answered without a card: “${said}”` : 'the agent gave no answer' };
  }
  let data: unknown;
  try {
    data = JSON.parse(mine.at(-1)!.body);
  } catch {
    return { error: 'the card in the agent’s answer could not be read (its data is not JSON)' };
  }
  try {
    const card = checkCard({ ui: name, data }, { strict: true, label: 'The new card' });
    return { data: card.data };
  } catch (e) {
    if (e instanceof CardError) return { error: e.message.replace(/^The new card \([^)]*\): /, '').replace(/ find_ui with names .*$/, '').replace(/\.$/, '').replace(/^./, (x) => x.toLowerCase()) };
    throw e;
  }
}

// ---- keeping schedules in step with the boards ---------------------------------------------------------------------

/** A task's name: the board's and the card's. */
/** A card's refreshes as the task lists say them: "Shop · Sales by day: refresh". */
export const taskName = (board: string, c: Pick<BoardCard, 'title' | 'data' | 'ui'>) => `${board} · ${cardTitle(c)}`.slice(0, 110) + ': refresh';

/**
 * A board's cards and their refreshes' scheduled tasks made to agree: a task for each card that refreshes by itself
 * (made, or changed when its question, schedule or name changed: a changed setting turns a paused one on again), none
 * for the rest (a card taken off, a schedule stopped, the board deleted). Their past runs stay unless the card is gone.
 */
export function syncBoard(d: Pick<Deps, 'db' | 'scheduler' | 'sessions'>, page: string) {
  const { db, scheduler } = d;
  const b = boardOf(db, page);
  const want = new Map<string, BoardCard>();
  // A paused card (a copy's, until it is turned on) has none: it does not run by itself.
  for (const c of b?.board.cards ?? []) if (refreshesByItself(c.refresh) && !readsSource(c)) want.set(refreshTaskId(page, c.id), c);
  const have = db.prepare('select id, name, prompt, schedule, enabled, paused_reason from tasks where resume = 0 and id like ?').all(`board-${page}-%`) as {
    id: string;
    name: string;
    prompt: string;
    schedule: string;
    enabled: number;
    paused_reason: string | null;
  }[];
  const cards = new Set((b?.board.cards ?? []).map((c) => refreshTaskId(page, c.id)));
  for (const t of have) if (!want.has(t.id)) scheduler.removeBoard(t.id, { keepRuns: cards.has(t.id) });
  for (const [id, c] of want) {
    const t = have.find((x) => x.id === id);
    const name = taskName(b!.title, c);
    const schedule = asTaskSchedule(c.refresh!.schedule!);
    const same = t && t.prompt === c.refresh!.ask && t.schedule === JSON.stringify(schedule);
    if (same) {
      if (t.name !== name) db.prepare('update tasks set name = ? where id = ?').run(name, id);
      continue;
    }
    const where = placeOf(d, c);
    scheduler.save(
      { name, prompt: c.refresh!.ask, agent: where.agent, acpAgent: where.acpAgent, cwd: where.cwd, schedule, failLimit: REFRESH_FAIL_LIMIT, enabled: true },
      { as: id, origin: `board:${page}` },
    );
  }
}

/** Every board's refreshes made to agree with its cards (at start-up, in case a change went unseen), and tasks of boards that are gone removed. */
export function syncAllBoards(d: Pick<Deps, 'db' | 'scheduler' | 'sessions'>) {
  const boards = new Set(listPages(d.db).filter((p) => p.kind === 'board').map((p) => p.id));
  const tasks = d.db.prepare("select id from tasks where resume = 0 and id like 'board-%'").all() as { id: string }[];
  for (const t of tasks) {
    const o = refreshOwner(t.id);
    if (o && !boards.has(o.page)) d.scheduler.removeBoard(t.id);
  }
  for (const id of boards) {
    try {
      syncBoard(d, id);
    } catch (e) {
      console.warn(`[boards] the refreshes of ${id} could not be set: ${(e as Error).message}`);
    }
  }
}

// ---- the runner the scheduler calls --------------------------------------------------------------------------------

/** What refreshes board cards for the scheduler (server/scheduler.ts BoardRunner). */
export function boardRunner(d: Deps): BoardRunner {
  const { db } = d;
  const cardOf = (taskId: string) => {
    const o = refreshOwner(taskId);
    if (!o) throw new Error('Not a board card’s refresh');
    const b = boardOf(db, o.page);
    if (!b) throw new Error('The board is no longer in the Library');
    const card = b.board.cards.find((c) => c.id === o.card);
    if (!card) throw new Error('The card is no longer on the board');
    return { ...o, ...b, card };
  };
  return {
    owns: (taskId) => !!refreshOwner(taskId),

    blocked(taskId) {
      let x: ReturnType<typeof cardOf>;
      try {
        x = cardOf(taskId);
      } catch (e) {
        return `${(e as Error).message}.`;
      }
      if (readsSource(x.card)) return 'This card reads its numbers from a spreadsheet or a file each time the board is shown: it is up to date already.';
      if (x.locked) return `“${x.title}” is locked: unlock it to let its cards refresh.`;
      const st = capState(db, x.page, x.board);
      if (st.reached) {
        capNotice(d, x.page, x.title, st.cap!);
        tellBoard(d, x.page);
        const on = new Date(st.monthEnds).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        return `This board’s refreshes reached its $${st.cap} cap for this month ($${st.spentUsd.toFixed(2)} spent). They start again on ${on}, or raise the cap on the board.`;
      }
      return null;
    },

    async start({ task, run, trigger, question }) {
      const x = cardOf(task);
      const ask = question.trim() || x.card.refresh?.ask || (await sourceQuestion(d, x.card));
      if (!ask) throw new Error('This card has no question to ask again: write one in its … menu → Keep it up to date…');
      const tier = refreshTier(x.card.refresh);
      const where = placeOf(d, x.card);
      const pick = tierPick(db, tier, where.agent, where.acpAgent);
      // What is left of the board's cap is the most this refresh may spend.
      const st = capState(db, x.page, x.board);
      const capUsd = st.cap === null ? undefined : Math.max(0.01, Math.floor((st.cap - st.spentUsd) * 100) / 100);
      const key = await d.sessions.create({
        agent: where.agent,
        acpAgent: where.acpAgent,
        cwd: where.cwd,
        prompt: refreshPrompt({ db, board: x.title, card: x.card, question: ask, trigger }),
        ...(pick?.model ? { model: pick.model } : {}),
        ...(pick?.effort ? { effort: pick.effort } : {}),
        mode: modeFor(where.agent, where.acpAgent),
        title: `Board refresh: ${cardTitle(x.card)} · ${x.title}`,
        remember: false,
        extra: {
          boardRefresh: { page: x.page, card: x.card.id, run, tier } satisfies RefreshMark,
          automations: { task, run, dry: true },
          ...(capUsd !== undefined ? { capUsd } : {}),
        },
      });
      // A refresh stays out of the session list: its card opens it.
      d.sessions.setFlags(key, { archived: true });
      tellBoard(d, x.page);
      return key;
    },

    async ended({ task, reply, ended, why, costUsd, question }) {
      const o = refreshOwner(task)!;
      const fail = (reason: string) => {
        tellBoard(d, o.page);
        const r = reason.replace(/\.$/, '');
        return { status: 'failed' as RunStatus, summary: `Could not update: ${r}`, error: r };
      };
      let x: ReturnType<typeof cardOf>;
      try {
        x = cardOf(task);
      } catch (e) {
        return fail((e as Error).message);
      }
      const got = readAnswer(x.card, reply);
      if ('error' in got) {
        // A turn that stopped (an error, the cap) says that first.
        if (ended === 'error') return fail(/cap/i.test(why) ? 'it reached the board’s monthly cap before it finished' : `it stopped with an error: ${why || 'no reason given'}`);
        return fail(got.error);
      }
      if (x.locked) return fail(`“${x.title}” is locked`);
      // The card's data replaced, and nothing else: the board as it is now, with this one card new.
      const ask = x.card.refresh ? '' : question.trim() || (await sourceQuestion(d, x.card));
      // The board as it is now (it may have changed while the question was read): this one card new, nothing else.
      try {
        x = cardOf(task);
      } catch (e) {
        return fail((e as Error).message);
      }
      const refresh: CardRefresh = { ...(x.card.refresh ?? { ask }), costUsd: round4(costUsd) };
      const next: BoardCard = { ...x.card, data: got.data, refreshedAt: Date.now(), ...(refresh.ask ? { refresh } : {}) };
      const model: Board = { ...x.board, cards: x.board.cards.map((c) => (c.id === x.card.id ? next : c)) };
      try {
        // Refreshes close together (Refresh all) are one version.
        addVersion(db, x.page, { model, by: 'agent', turn: `board-refresh:${x.page}` });
      } catch (e) {
        return fail((e as Error).message);
      }
      d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
      // A schedule that paused itself after failures goes on again once a refresh works.
      const t = d.db.prepare('select enabled, paused_reason from tasks where id = ?').get(task) as { enabled: number; paused_reason: string | null } | undefined;
      if (t && !t.enabled && t.paused_reason) d.scheduler.setEnabled(task, true);
      // Past the cap with this one: the person hears once.
      const st = capState(db, x.page, model);
      if (st.reached) capNotice(d, x.page, x.title, st.cap!);
      tellBoard(d, x.page);
      return { status: 'done' as RunStatus, summary: `Updated “${cardTitle(next)}”` };
    },

    describe(taskId) {
      const o = refreshOwner(taskId);
      const b = o ? boardOf(db, o.page) : null;
      const c = b?.board.cards.find((x) => x.id === o!.card);
      return o && b ? { page: o.page, card: o.card, title: b.title, cardTitle: c ? cardTitle(c) : o.card } : null;
    },

    noticeOf(taskId) {
      const o = refreshOwner(taskId);
      const title = o ? (pageInfo(db, o.page)?.title ?? 'A board') : 'A board';
      return { url: o ? `/pages/${o.page}` : '/pages', title };
    },
  };
}

/**
 * Board cards' refreshes on: the scheduler runs them (boardRunner), every save of a board keeps their schedules in step
 * (whatever made it: the editor, an agent, a link, a version brought back, a copy, a deletion), and once at start-up for
 * changes that went unseen.
 */
export function startRefreshes(d: Deps, o: { sweepAfterMs?: number } = {}) {
  d.scheduler.useBoards(boardRunner(d));
  onPageChange((id, kind) => {
    if (kind === 'board' || kind === null) syncBoard(d, id);
  });
  if (o.sweepAfterMs !== 0) setTimeout(() => syncAllBoards(d), o.sweepAfterMs ?? 3_000).unref();
}

// ---- what the board page is told -----------------------------------------------------------------------------------

/** Each card's refreshes (its schedule, the one going on, the last that ended, what they cost), the cap and this month's spending. */
export function refreshState(d: Pick<Deps, 'db' | 'scheduler'>, page: string): BoardRefreshState {
  const { db } = d;
  const b = boardOf(db, page);
  if (!b) throw new HttpError(404, 'There is no such board');
  const st = capState(db, page, b.board);
  const cards: Record<string, CardRefreshState> = {};
  for (const c of b.board.cards) {
    const id = refreshTaskId(page, c.id);
    const t = db.prepare('select enabled, next_at, paused_reason, fails from tasks where id = ? and resume = 0').get(id) as
      | { enabled: number; next_at: number | null; paused_reason: string | null; fails: number }
      | undefined;
    const runs = db.prepare('select status, started_at, ended_at, error, cost_usd, key from task_runs where task_id = ? order by started_at desc, rowid desc limit 12').all(id) as {
      status: RunStatus;
      started_at: number;
      ended_at: number | null;
      error: string | null;
      cost_usd: number | null;
      key: string | null;
    }[];
    if (!t && !runs.length && !c.refresh) continue;
    const s: CardRefreshState = {};
    if (t) {
      s.task = id;
      s.enabled = !!t.enabled;
      if (t.paused_reason) s.pausedReason = t.paused_reason;
      if (t.enabled && t.next_at) s.nextAt = t.next_at;
      if (t.fails) s.fails = t.fails;
    }
    const going = runs.find((r) => r.status === 'running');
    if (going) s.running = { since: going.started_at, ...(going.key ? { key: going.key } : {}) };
    const last = runs.find((r) => r.status !== 'running');
    if (last) s.last = { status: last.status, at: last.ended_at ?? last.started_at, ...(last.error ? { error: last.error } : {}), ...(last.cost_usd !== null ? { costUsd: last.cost_usd } : {}), ...(last.key ? { key: last.key } : {}) };
    // What its own refreshes cost, on the tier it is on now.
    const tier = refreshTier(c.refresh);
    const own = pastRefreshes(db, id).filter((p) => (p.tier ?? 'quick') === tier).slice(0, 10).map((p) => p.cost);
    const typical = middle(own);
    if (typical !== undefined) s.typicalUsd = round4(typical);
    cards[c.id] = s;
  }
  return { ...st, spentUsd: round4(st.spentUsd), tiers: tierCosts(db), cards };
}

/** What an agent is told of a board's refreshes, line by line (get_page on a board, the hydor command). */
export function refreshLines(d: Pick<Deps, 'db' | 'scheduler'>, page: string): string[] {
  const b = boardOf(d.db, page);
  if (!b) return [];
  const st = refreshState(d, page);
  const lines: string[] = [];
  for (const c of b.board.cards) {
    const r = c.refresh;
    const s = st.cards[c.id];
    if (!r && !s) continue;
    const tier = refreshTier(r);
    const per = s?.typicalUsd ?? st.tiers[tier];
    const parts = [
      `“${cardTitle(c)}” (${c.id}) refreshes ${refreshText(r?.schedule)} on ${tierLabel(tier)}`,
      per !== null && per !== undefined ? `about $${per.toFixed(2)} a time${r?.schedule ? `, about $${(per * runsPerMonth(r.schedule)).toFixed(2)} a month` : ''}` : 'its cost is not known yet',
      c.refreshedAt ? `last updated ${new Date(c.refreshedAt).toISOString()}` : 'not refreshed yet',
      s?.nextAt ? `next ${new Date(s.nextAt).toISOString()}` : '',
      r?.paused ? 'paused, as on a copy: it does not refresh by itself until the user turns it on (the card’s settings, or Turn all on at the top of the board)' : s?.pausedReason ? `paused: ${s.pausedReason}` : s?.enabled === false ? 'paused' : '',
      s?.running ? 'refreshing now' : s?.last && s.last.status !== 'done' ? `its last refresh failed: ${s.last.error ?? 'no reason given'}` : '',
      r ? `question: ${JSON.stringify(r.ask.length > 200 ? `${r.ask.slice(0, 199)}…` : r.ask)}` : '',
    ].filter(Boolean);
    lines.push(`- ${parts.join('; ')}`);
  }
  const cap = st.cap === null ? 'no monthly cap' : `a monthly cap of $${st.cap}`;
  lines.unshift(`Refreshes: ${cap}, $${st.spentUsd.toFixed(2)} spent this month${st.reached ? ' (the cap is reached: refreshes wait for next month)' : ''}.${lines.length ? '' : ' No card refreshes yet.'}`);
  return lines;
}

/** Refreshes a board's card now (Refresh now, Try again): its run and session. */
export async function refreshNow(d: Deps, page: string, card: string): Promise<{ runId?: string; key?: string }> {
  const b = boardOf(d.db, page);
  if (!b) throw new HttpError(404, 'There is no such board');
  const c = b.board.cards.find((x) => x.id === card);
  if (!c) throw new HttpError(404, 'The board has no such card');
  if (readsSource(c)) throw new HttpError(400, 'This card reads its numbers from a spreadsheet or a file each time the board is shown: it is up to date already.');
  const question = await sourceQuestion(d, c);
  if (!question) throw new HttpError(400, 'This card has no question to ask again: write one in its … menu → Keep it up to date…');
  const where = placeOf(d, c);
  return d.scheduler.runBoard(refreshTaskId(page, card), { name: taskName(b.title, c), question, agent: where.agent, cwd: where.cwd });
}

/** Refreshes every card of a board that keeps itself up to date (Refresh all): how many started, and why the others did not. */
export async function refreshAll(d: Deps, page: string): Promise<{ started: number; skipped: string[] }> {
  const b = boardOf(d.db, page);
  if (!b) throw new HttpError(404, 'There is no such board');
  let started = 0;
  const skipped: string[] = [];
  for (const c of b.board.cards) {
    // A paused card (a copy's) waits to be turned on.
    if (!c.refresh || c.refresh.paused || readsSource(c)) continue;
    try {
      await refreshNow(d, page, c.id);
      started++;
    } catch (e) {
      skipped.push(`“${cardTitle(c)}”: ${(e as Error).message}`);
      // The cap stops them all.
      if (e instanceof HttpError && /cap/.test(e.message)) break;
    }
  }
  return { started, skipped };
}

/** For the tests: the blocks of a reply. */
export const _test = { uiBlocks };

/**
 * Of an agent's new board's cards, those that refresh on a schedule copied from another board's card (the same question,
 * or the same data): they come paused, as a copy's do, so a board made from another's cards never starts spending by
 * itself. Cards whose refresh the agent set on purpose (a question of their own) stay on.
 */
export function pauseCopied(db: DB, cards: BoardCard[]): { cards: BoardCard[]; paused: number } {
  const asks = new Set<string>();
  const datas = new Set<string>();
  for (const p of listPages(db).filter((x) => x.kind === 'board')) {
    const src = pageSource(db, p.id);
    if (!src) continue;
    for (const c of readBoard(src.text).cards) {
      if (c.refresh?.ask) asks.add(c.refresh.ask.trim().toLowerCase());
      datas.add(`${c.ui}\u0001${JSON.stringify(c.data)}`);
    }
  }
  let paused = 0;
  const out = cards.map((c) => {
    if (!refreshesByItself(c.refresh)) return c;
    if (!asks.has(c.refresh!.ask.trim().toLowerCase()) && !datas.has(`${c.ui}\u0001${JSON.stringify(c.data)}`)) return c;
    paused++;
    return { ...c, refresh: { ...c.refresh!, paused: true as const } };
  });
  return { cards: out, paused };
}
