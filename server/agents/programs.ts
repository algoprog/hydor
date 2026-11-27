// Whether Claude Code and Codex are signed in here, so that nothing offers, picks or starts one that is not: the start
// page and its default, Settings → Models → Tiers, Hydor subagents, the app's own session starts. The answer is the
// programs' own account() (agents/control.ts), of the main sign-in and the added accounts, kept a minute and read again
// when a sign-in or sign-out happens through Hydor. A check that cannot be made (a program too slow to answer) keeps the
// last answer; with none, a program signed in here before counts as signed in and one never seen signed in does not.
import { firstUsableProgram, isProgram, notSetUpMessage, PROGRAM_IDS, type Program, type ProgramStatus } from '../../shared/programs.ts';
import type { Agent, AccountStatus } from '../../shared/types.ts';
import { kvGet, kvSet, type DB } from '../db.ts';

export type { Program, ProgramStatus } from '../../shared/programs.ts';

/** How long an answer stands before it is read again. */
export const FRESH_MS = 60_000;

export interface ProgramDeps {
  db: DB;
  /** The program's accounts: undefined for its own sign-in, then the added ones. */
  accounts: (p: Program) => (string | undefined)[];
  /** One account's sign-in, as GET /api/accounts reads it. */
  account: (p: Program, account: string | undefined) => Promise<AccountStatus>;
  /** The answer changed: the pages hear it. */
  changed?: (status: ProgramStatus) => void;
}

let deps: ProgramDeps | null = null;
let known: ProgramStatus | null = null;
let readAt = 0;
let reading: Promise<ProgramStatus> | null = null;
/** Counts the sign-ins and sign-outs: a read begun before one does not stand for what came after. */
let generation = 0;

export function initPrograms(o: ProgramDeps) {
  deps = o;
}

/** For tests: forgets everything. */
export function resetPrograms() {
  deps = null;
  known = null;
  readAt = 0;
  reading = null;
  generation++;
}

const keyOf = (p: Program) => `programs.signedIn.${p}`;

/**
 * Whether the program was ever signed in here: seen signed in by Hydor, or its sessions have answers (the history of a
 * program that was never signed in holds only its refusals, which used no tokens).
 */
export function signedInBefore(p: Program): boolean {
  if (!deps) return true;
  if (kvGet(deps.db, keyOf(p))) return true;
  return !!deps.db.prepare('select 1 from sessions where agent = ? and tokens_out > 0 limit 1').get(p);
}

/** What the accounts' answers say: signed in, not, or no telling (null). */
function judge(answers: AccountStatus[]): boolean | null {
  if (answers.some((a) => a.loggedIn || a.noSignInNeeded)) return true;
  return answers.some((a) => a.error) ? null : false;
}

function settle(p: Program, answers: AccountStatus[]): boolean {
  const says = judge(answers);
  if (says && deps && !kvGet(deps.db, keyOf(p))) kvSet(deps.db, keyOf(p), String(Date.now()));
  return says ?? known?.[p] ?? signedInBefore(p);
}

function keep(next: ProgramStatus) {
  const changed = !known || PROGRAM_IDS.some((p) => known![p] !== next[p]);
  known = next;
  readAt = Date.now();
  if (changed) deps?.changed?.(next);
}

async function readOne(p: Program): Promise<AccountStatus[]> {
  const ask = (account: string | undefined) =>
    deps!.account(p, account).catch((e): AccountStatus => ({ agent: p, loggedIn: false, error: (e as Error).message || 'no answer' }));
  const [main, ...added] = deps!.accounts(p);
  // The added accounts only when the program's own sign-in does not settle it.
  const first = await ask(main);
  if (first.loggedIn || first.noSignInNeeded) return [first];
  return [first, ...(await Promise.all(added.map(ask)))];
}

function read(): Promise<ProgramStatus> {
  if (reading) return reading;
  const at = generation;
  const job: Promise<ProgramStatus> = Promise.all(PROGRAM_IDS.map(readOne)).then(([claude, codex]) => {
    // Signed in or out meanwhile: asked again.
    if (at !== generation) {
      if (reading === job) reading = null;
      return deps ? read() : { claude: true, codex: true };
    }
    const next = { claude: settle('claude', claude), codex: settle('codex', codex) };
    keep(next);
    return next;
  });
  reading = job;
  void job.finally(() => reading === job && (reading = null)).catch(() => {});
  return job;
}

/**
 * Whether Claude Code and Codex are signed in here. `fresh`: asked now rather than from the last minute's answer. Before
 * initPrograms (a test of something else) both count as signed in.
 */
export async function programStatus(o: { fresh?: boolean } = {}): Promise<ProgramStatus> {
  if (!deps) return { claude: true, codex: true };
  if (!o.fresh && known && Date.now() - readAt < FRESH_MS) return known;
  return read();
}

/** The last answer without waiting (null: none yet), for what cannot wait; an old one is read again behind it. */
export function programsNow(): ProgramStatus | null {
  if (deps && (!known || Date.now() - readAt >= FRESH_MS)) void read().catch(() => {});
  return known;
}

/** The last answer, else the first one when it comes within `ms` (the page's first load); undefined when it does not. */
export async function programsSoon(ms = 2500): Promise<ProgramStatus | undefined> {
  const now = programsNow();
  if (now || !deps) return now ?? undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([read(), new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), ms)))]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** A sign-in or a sign-out happened through Hydor, or an account came or went: asked again now. */
export function programsChanged() {
  generation++;
  reading = null;
  readAt = 0;
  if (deps) void read().catch(() => {});
}

/** The accounts' answers just read for something else (Settings → Accounts): kept, with no second asking. */
export function notePrograms(answers: Record<Program, AccountStatus[]>) {
  if (!deps) return;
  keep({ claude: settle('claude', answers.claude), codex: settle('codex', answers.codex) });
}

/** Why `agent` cannot be used now, or null: asked afresh before saying no, as a sign-in made in a terminal shows then. */
export async function programRefusal(agent: Agent | string): Promise<string | null> {
  if (!isProgram(agent) || (await programStatus())[agent]) return null;
  return (await programStatus({ fresh: true }))[agent] ? null : notSetUpMessage(agent);
}

/**
 * Why a new session may not start on `agent`, or null. Only a program never signed in here is refused: one that was
 * and is signed out starts, finds it out, asks to sign in again and carries on once you have (server/signin.ts).
 */
export async function startRefusal(agent: Agent | string): Promise<string | null> {
  if (!isProgram(agent)) return null;
  const why = await programRefusal(agent);
  return why && !signedInBefore(agent) ? why : null;
}

/** What runs a session nobody picked a program for: the first signed in of Claude Code and Codex, else Custom. */
export async function defaultProgram(): Promise<{ agent: Agent; acpAgent?: string }> {
  const p = firstUsableProgram(await programStatus());
  return { agent: p.agent, ...(p.acp ? { acpAgent: p.acp } : {}) };
}

/** defaultProgram from the last answer, for what cannot wait. */
export function defaultProgramNow(): { agent: Agent; acpAgent?: string } {
  const p = firstUsableProgram(programsNow());
  return { agent: p.agent, ...(p.acp ? { acpAgent: p.acp } : {}) };
}
