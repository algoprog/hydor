// Accounts found signed out when the app needed them, and the prompts to sign in to them again. A helper call on
// Automatic (oneshot.ts) or a session's turn (sessions.ts) that a program turns away for its sign-in ("Not logged in ·
// Please run /login", "401 Unauthorized") marks the account signed out: helper calls pass over it for a while, and a
// session moves to another account with usage left (Switch accounts at a limit). Only when nothing else could do the
// work (no other account of the program, and for background work none of Custom's models either) is the user asked to
// sign in again: a prompt on every page, and a banner in a session it stopped, until the account is signed in again
// or they choose Not now. A sign-in (the prompt's own button, Settings → Agents → Accounts, or the program's own login
// in a terminal, noticed at the next call that gets through) clears it, and the sessions it stopped continue.
import type { AccountAgent, ServerEvent, SignInNeed } from '../shared/types.ts';

/** How long a signed-out account is passed over before it is tried again (a sign-in made outside the app shows then). */
export const SIGNED_OUT_MS = 15 * 60_000;
/** How long Not now hides the prompt on every page. */
export const NOT_NOW_MS = 60 * 60_000;

/**
 * Whether a program's refusal is about its sign-in: Claude Code's "Not logged in · Please run /login" or "Failed to
 * authenticate. API Error: 401 …", Codex's "401 Unauthorized: Missing bearer …" or its turn error "unauthorized",
 * Grok Build's "not authenticated", Antigravity CLI's "Please sign in to view available models", "Authentication required" or
 * "stored credentials are expired or revoked".
 */
export function signedOutText(agent: AccountAgent, text: string): boolean {
  if (!text) return false;
  if (agent === 'claude')
    return /not logged in|please run \/login|failed to authenticate|invalid api key|oauth (?:access )?token (?:is invalid|has expired|expired|(?:has been |was )?revoked)|authentication_error|\b401\b/i.test(text);
  if (agent === 'codex') return /\b401\b|unauthori[sz]ed|not (?:logged|signed) in|(?:log|sign) ?in again|please (?:log|sign) ?in|refresh[_ ]token|token (?:has )?expired|missing bearer/i.test(text);
  if (agent === 'antigravity')
    return /please sign in|sign in to view|authentication (?:required|expired)|not (?:authenticated|logged|signed) (?:in|into)|log back in|credentials (?:are |have )?(?:expired|revoked)|expired or revoked|\b401\b|unauthori[sz]ed/i.test(text);
  return /not (?:authenticated|logged in|signed in)|\b401\b|unauthori[sz]ed/i.test(text);
}

const keyOf = (agent: AccountAgent, account?: string | null) => `${agent}:${account ?? ''}`;

/** Signed-out marks: when each was found, and what the program said. */
const out = new Map<string, { at: number; detail?: string }>();
/** The prompts, by account. */
const needs = new Map<string, SignInNeed>();
type SignedIn = (agent: AccountAgent, account: string | undefined, sessions: string[]) => void;
const listeners = new Set<SignedIn>();

let send: (e: ServerEvent) => void = () => {};
let nameOf: (agent: AccountAgent, account: string | undefined) => string = (agent, account) => (account ? 'an added account' : `your main ${agent} account`);
let signedInBefore: (agent: AccountAgent) => boolean = () => true;

/** The server's broadcast, how accounts are named, and which programs were ever signed in here (index.ts). */
export function initSignIn(o: { broadcast: (e: ServerEvent) => void; nameOf: (agent: AccountAgent, account: string | undefined) => string; signedInBefore?: (agent: AccountAgent) => boolean }) {
  send = o.broadcast;
  nameOf = o.nameOf;
  signedInBefore = o.signedInBefore ?? (() => true);
}

const tell = () => send({ t: 'signin', needs: signInNeeds() });

/** The program turned the account away for its sign-in: it is passed over for a while. */
export function markSignedOut(agent: AccountAgent, account: string | undefined, detail?: string) {
  out.set(keyOf(agent, account), { at: Date.now(), ...(detail ? { detail: detail.slice(0, 300) } : {}) });
}

/** Whether the account was found signed out lately (SIGNED_OUT_MS): helper calls pass over it. */
export function isSignedOut(agent: AccountAgent, account: string | undefined): boolean {
  const o = out.get(keyOf(agent, account));
  if (!o) return false;
  if (Date.now() - o.at < SIGNED_OUT_MS) return true;
  out.delete(keyOf(agent, account));
  return false;
}

/** Every account marked signed out lately, or that a prompt asks to sign in to. */
export function signedOutAccounts(): { agent: AccountAgent; account: string | undefined }[] {
  const keys = new Set([...[...out.keys()].filter((k) => isSignedOut(...split(k))), ...needs.keys()]);
  return [...keys].map((k) => {
    const [agent, account] = split(k);
    return { agent, account };
  });
}

function split(k: string): [AccountAgent, string | undefined] {
  const i = k.indexOf(':');
  return [k.slice(0, i) as AccountAgent, k.slice(i + 1) || undefined];
}

/**
 * The account is signed in again (a call on it got through, or its status says so): its mark and its prompt go, and
 * the listeners hear which sessions it had stopped. Nothing happens for an account that was neither.
 */
export function markSignedIn(agent: AccountAgent, account: string | undefined) {
  const k = keyOf(agent, account);
  const had = out.delete(k);
  const need = needs.get(k);
  if (need) {
    needs.delete(k);
    tell();
  }
  if (had || need) for (const f of listeners) f(agent, account, need?.sessions ?? []);
}

/** Hears each account signed in again, with the sessions its sign-out stopped (sessions.ts continues them). */
export function onSignedIn(f: SignedIn): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * Nothing else could do the work: asks the user to sign in to the account again. `session`: a session it stopped (it
 * continues once the account is signed in); else background work needed it, `task` saying what when known. Not now
 * keeps the prompt on every page hidden for background work; a session it stops shows it again.
 */
export function needSignIn(n: { agent: AccountAgent; account?: string; session?: string; task?: string }) {
  const k = keyOf(n.agent, n.account);
  markSignedOut(n.agent, n.account);
  const was = needs.get(k);
  const sessions = [...new Set([...(was?.sessions ?? []), ...(n.session ? [n.session] : [])])];
  const hiddenUntil = n.session ? undefined : was?.hiddenUntil;
  const task = n.session ? was?.task : (n.task ?? was?.task);
  needs.set(k, {
    agent: n.agent,
    ...(n.account ? { account: n.account } : {}),
    name: nameOf(n.agent, n.account),
    background: !!was?.background || !n.session,
    ...(task ? { task } : {}),
    sessions,
    at: Date.now(),
    ...(hiddenUntil && hiddenUntil > Date.now() ? { hiddenUntil } : {}),
    ...(signedInBefore(n.agent) ? {} : { first: true }),
  });
  tell();
}

/** A session no longer waits on its account's sign-in (it moved to another account, was deleted, or you sent it on). */
export function dropSignInSession(session: string) {
  let changed = false;
  for (const [k, n] of needs) {
    if (!n.sessions.includes(session)) continue;
    const sessions = n.sessions.filter((s) => s !== session);
    if (!sessions.length && !n.background) needs.delete(k);
    else needs.set(k, { ...n, sessions });
    changed = true;
  }
  if (changed) tell();
}

/**
 * Background work got done (an account or one of Custom's models answered): the prompts it raised go, as nothing waits
 * on them now; one a session it stopped raised stays for that session.
 */
export function backgroundDone() {
  let changed = false;
  for (const [k, n] of needs) {
    if (!n.background) continue;
    if (n.sessions.length) {
      const { task: _task, ...rest } = n;
      needs.set(k, { ...rest, background: false });
    } else needs.delete(k);
    changed = true;
  }
  if (changed) tell();
}

/** Not now: the prompt on every page stays hidden for an hour (a session it stops shows it again). */
export function dismissSignIn(agent: AccountAgent, account: string | undefined) {
  const n = needs.get(keyOf(agent, account));
  if (!n) return;
  needs.set(keyOf(agent, account), { ...n, hiddenUntil: Date.now() + NOT_NOW_MS });
  tell();
}

/** The prompts, the newest first. */
export function signInNeeds(): SignInNeed[] {
  return [...needs.values()].sort((a, b) => b.at - a.at);
}

/** For tests: forgets every mark and prompt. */
export function resetSignIn() {
  out.clear();
  needs.clear();
  listeners.clear();
}

/** The account as people know it (an added one's name, the program's own by its email when known), as the prompt names it. */
export const accountLabel = (agent: AccountAgent, account: string | undefined): string => nameOf(agent, account);
