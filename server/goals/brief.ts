// What the app's goal loop tells the agent, built from the goal alone (no files, no clock): the draft message (work
// out the checks), the reminder when it did not, the message that starts each round, and the one that asks which way
// next. Each starts with goalHead(…) on its own line, which the conversation draws as one slim row, and ends by saying
// the app sent it. brief-test.ts checks every rule.
import { goalHead, goalMessageOf, standing, targetText, type GoalCheck, type GoalResult, type GoalRound, type GoalState, type GoalWay } from '../../shared/goals.ts';
import { num } from './verdict.ts';

export const GOAL_FOOT = '(This message is from the app’s goal loop, not typed by the user.)';
/** At most this much of one check's output, and of all of them, in a round message. */
export const DETAIL_EACH = 1200;
export const DETAIL_ALL = 4000;

const quote = (s: string) => s.trim().replace(/\n{3,}/g, '\n\n');
const end = (s: string, n: number) => (s.length > n ? `…${s.slice(-(n - 1))}` : s);
const join = (parts: (string | false | undefined | null)[]) => parts.filter((p): p is string => !!p && !!p.trim()).join('\n\n');

const PROPOSE = [
  'Read the project enough to say what “done” means as checks the app can run by itself, then call goal_propose with:',
  '- 3 to 7 checks. Prefer commands and measured numbers the project already has: its test, type-check, build and benchmark commands. A review check (a sentence a reviewer must find true in the change) only for what no command can show; a check of kind you only for what the user alone can judge.',
  '- the paths you must not change: the tests, the test data, the checks’ own scripts.',
  '- limits that fit the size of the job: how many rounds, and money or time when it is a big one.',
  'Then stop. The app measures where things stand and shows the user, and nothing starts before they agree.',
].join('\n');

/** A session that leads a swarm (S2.4): its members come with the first round, not while the checks are agreed. */
export interface ForTeam {
  swarm?: boolean;
}
const NO_MEMBERS_YET = 'Do not start your swarm’s members yet: they come with the first round.';
const noWork = (o: ForTeam) => `Do no work on it yet.${o.swarm ? ` ${NO_MEMBERS_YET}` : ''}`;

/** The first message of a goal: agree what done means, before any work. */
export function draftMessage(objective: string, o: ForTeam = {}): string {
  return join([goalHead('agree the checks'), `The user set this goal:\n“${quote(objective)}”`, `${noWork(o)}\n${PROPOSE}`, GOAL_FOOT]);
}

/** The same, for a session started with a goal: it goes ahead of the person's first message, which is the goal. */
export function draftNotes(o: ForTeam = {}): string {
  return join([goalHead('agree the checks'), 'The user’s message below is a goal they set for this session: the app’s goal loop drives it round after round, and decides itself when it is reached by running checks.', `${noWork(o)}\n${PROPOSE}`]);
}

/** When the drafting turn ended without a proposal. */
export function reminderMessage(objective: string, o: ForTeam = {}): string {
  return join([
    goalHead('agree the checks'),
    `The goal still has no checks. Do no work on it yet: call goal_propose now, then stop.${o.swarm ? ` ${NO_MEMBERS_YET}` : ''} If you do not, the app proposes one check itself: a reviewer reads the change against the goal.\nThe goal: “${quote(objective)}”`,
    PROPOSE,
    GOAL_FOOT,
  ]);
}

/** A check's standing in a few words: "Speed 910 ms (needs ≤ 400 ms)", "Tests pass (could not run: …)". */
function stand(c: GoalCheck, r: GoalResult | undefined, holds: boolean): string {
  if (!r) return `${c.label} (not measured yet)`;
  if (r.error) return `${c.label} (could not run: ${r.error})`;
  if (c.kind === 'measure' && r.value != null) return `${c.label} ${num(r.value)}${c.unit ? ` ${c.unit}` : ''}${holds ? '' : ` (needs ${targetText(c)})`}`;
  return c.label;
}

/** Holds and Not yet, as the files stand, and the detail of each check that does not hold. */
export function whereItStands(g: Pick<GoalState, 'contract' | 'rounds' | 'best'>): { holds: string[]; notYet: string[]; details: string[] } {
  const res = standing(g);
  const holds: string[] = [];
  const notYet: string[] = [];
  const details: string[] = [];
  let room = DETAIL_ALL;
  for (const c of g.contract.checks) {
    const r = res.find((x) => x.id === c.id);
    if (r?.holds) {
      holds.push(stand(c, r, true));
      continue;
    }
    notYet.push(stand(c, r, false));
    const d = (r?.detail ?? '').trim();
    if (d && room > 0) {
      const piece = end(d, Math.min(DETAIL_EACH, room));
      room -= piece.length;
      details.push(`${c.label}:\n${piece}`);
    }
  }
  return { holds, notYet, details };
}

/** Where things stand, in the order a message gives it: Holds and Not yet, then (for a round) what failing checks said, and what was dropped. */
function standingParts(g: Pick<GoalState, 'contract' | 'rounds' | 'best' | 'dropped'>) {
  const w = whereItStands(g);
  return {
    holds: [w.holds.length ? `Holds: ${w.holds.join('; ')}` : 'Holds: nothing yet', w.notYet.length ? `Not yet: ${w.notYet.join('; ')}` : ''].filter(Boolean).join('\n'),
    details: w.details.length ? `What the checks that do not hold said (the end of each):\n${w.details.join('\n\n')}` : '',
    dropped: g.dropped.length ? `Tried and dropped:\n${g.dropped.map((x) => `- ${x.text}${x.by ? ' (the user)' : ''}`).join('\n')}` : '',
  };
}

/** How the last round ended, for the next one. */
function lastRound(g: Pick<GoalState, 'rounds' | 'best'> & { undo?: boolean }): string {
  const last = g.rounds[g.rounds.length - 1];
  if (!last || last.n === 0) return '';
  const by = last.by === 'you' ? ' by the user' : '';
  const why = last.reason ?? last.why;
  if (last.outcome === 'undone') {
    const b = g.best ?? 0;
    return `Last round: undone${by}.${why ? ` ${sentence(why)}.` : ''} The files are back as they were ${b ? `after round ${b}` : 'at the start'}.`;
  }
  // Where rounds can be undone, one that stays was not put back because someone else was at work in the folder (its why says so).
  if (last.outcome === 'stays' && g.undo) return `Last round: not kept, and its files were not put back.${why ? ` ${sentence(why)}.` : ''} Work from the files as they are, and fix what got worse.`;
  if (last.outcome === 'stays') return `Last round: not better, and it stays (nothing can be put back here).${why ? ` ${sentence(why)}.` : ''} Fix what got worse.`;
  return `Last round: kept${by}.${why ? ` ${sentence(why)}.` : ''}`;
}

/** A round in a line: what it tried (its way, else the first sentence of what it did) and how it ended. */
function triedLine(r: GoalRound): string {
  const what = r.way ?? (r.did ? r.did.split(/(?<=[.!?])\s/)[0] : 'no report of what it did');
  const ended = r.outcome === 'kept' ? 'kept' : r.outcome === 'stays' ? 'not better' : 'undone';
  const why = r.reason ?? r.why;
  return `- Round ${r.n}: ${end1(what, 300)} (${ended}${why ? `: ${end1(why, 200)}` : ''})`;
}
const end1 = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * "Last round:" when the person took the files back to round `from` to go on from there another way: where the files
 * stand and why, and what the rounds after it tried, so that the next one does not try it again.
 */
function wentBack(g: Pick<GoalState, 'rounds'>, from: number): string {
  const after = g.rounds.filter((r) => r.n > from).slice(-8);
  const at = from ? `round ${from}` : 'the start';
  const head = `Last round: the user took the files back to ${at}, to go on from there another way: the files stand as they were ${from ? `after round ${from}` : 'at the start'}.`;
  if (!after.length) return `${head} Go another way from there.`;
  return `${head} What the rounds after it tried (go another way, do not repeat these):\n${after.map(triedLine).join('\n')}`;
}

/** What is left to put right once every check holds: what the final check found, or a check of the person's they say does not hold yet. */
export type GoalFix = { by: 'final'; reason: string } | { by: 'you'; label: string; note?: string };

const sentence = (s: string) => s.trim().replace(/[.!?…]+$/, '');

/** The paragraph right after the goal when every check holds but the work is not done yet. */
function fixText(f: GoalFix): string {
  if (f.by === 'final') return `Every check holds, but the final check did not pass: ${sentence(f.reason)}. Put that right; the checks and the final check run again when your turn ends.`;
  return `Every other check holds, but the user says “${f.label}” does not hold yet${f.note?.trim() ? `: ${sentence(f.note)}` : ''}. Put that right; the checks run again when your turn ends, and the user is asked again.`;
}

const wayText = (w: GoalWay) => `${w.name}${w.why ? ` (${w.why})` : ''}${w.expects ? `. Expected: ${w.expects}` : ''}`;

export interface RoundBrief {
  /** The round's number, and of how many. */
  n: number;
  /** The way to follow this round (taken off `next`). */
  way?: GoalWay;
  /** The person's note with their last answer. */
  note?: string;
  /** The person took the files back to this round, to go another way from there. */
  from?: number;
  /** The last rounds made no progress, or it was asked which way and named none. */
  changeApproach?: boolean;
  /** Every check holds, and this is what is left to put right (a failed final check, the person's "Not yet"). */
  fix?: GoalFix;
  /** The session leads a swarm (S2.3): its members as they stand now (server/swarm members), oldest first. */
  swarm?: { members: { title: string; state: string; last?: string }[] };
}

/** How many members a swarm lead's round message names one by one. */
export const MEMBERS_NAMED = 8;

/**
 * The end of a swarm lead's round message, in place of the usual closing paragraph (S2.3): what the swarm does with the
 * round, its members as they stand (after a round that was undone, that their changes in it are gone), and when the round
 * is over.
 */
function swarmClose(g: Pick<GoalState, 'rounds'>, team: NonNullable<RoundBrief['swarm']>): string {
  const lastRun = g.rounds.filter((r) => r.n > 0).reduce<GoalRound | undefined>((a, r) => (!a || r.n > a.n ? r : a), undefined);
  const undone = lastRun?.outcome === 'undone' ? 'Last round was undone: what your members changed in it is gone from this folder; say so to those you put to work again. ' : '';
  const named = team.members.slice(0, MEMBERS_NAMED).map((m) => `- “${m.title}” (${m.state})${m.last ? `: ${m.last}` : ''}`);
  const more = team.members.length - named.length;
  const now = team.members.length ? `Your members now:\n${[...named, ...(more > 0 ? [`- and ${more} more`] : [])].join('\n')}` : 'You have no members yet: start one per angle with start_child_session.';
  return join([
    'You lead a swarm in this goal. Put your members on what does not hold yet: one angle or one check each, and tell each which files are its own, because they all work in this folder (give none a worktree or folder of its own: the app checks this folder, and can only undo a round whose work is all here). Pass on what the user asked for above and what must not change.',
    `${undone}Members from earlier rounds are still there and remember their work: give them their next step with message_child, start a new member only for a new angle, and stop one whose angle is used up with swarm_stop.`,
    now,
    'Call goal_report (what the swarm did, what remains) once your members have reported, not when you start them. The round is over when every member’s turn and yours have ended: then the app runs the checks on this folder. Do not conclude, and do not stop members because you think it is solved: you cannot end the goal, only the checks do.',
  ]);
}

/** The message that starts a round. */
export function roundMessage(g: Pick<GoalState, 'contract' | 'rounds' | 'best' | 'dropped' | 'rules'> & { undo?: boolean }, o: RoundBrief): string {
  const user = [...g.rules.map((r) => `- ${r.text}`), o.note?.trim() ? `- ${o.note.trim()}` : ''].filter(Boolean);
  const fromUser = join([user.length ? `From the user (follow these first):\n${user.join('\n')}` : '', o.way ? `The way to follow this round: ${wayText(o.way)}` : '']);
  const st = standingParts(g);
  return join([
    goalHead(`round ${o.n} of ${g.contract.limits.rounds}`),
    `The goal: “${quote(g.contract.objective)}”`,
    o.fix ? fixText(o.fix) : '',
    st.holds,
    o.from != null ? wentBack(g, o.from) : lastRound(g),
    st.details,
    st.dropped,
    fromUser,
    g.contract.protect.length ? `Do not change: ${g.contract.protect.join(', ')}` : '',
    o.changeApproach && !o.way ? 'The last rounds made no progress: take a clearly different approach than before.' : '',
    o.swarm
      ? swarmClose(g, o.swarm)
      : `The app runs the checks itself when your turn ends. You cannot end the goal, and saying it is done changes nothing. ${o.fix ? (o.fix.by === 'final' ? 'Put right what the final check found' : 'Put right what the user says') : 'Work on what does not hold yet'}, check your work as you go, then call goal_report (what you did, what remains) and end your turn.`,
    GOAL_FOOT,
  ]);
}

/** The message that asks which way to go next, instead of a round. */
export function askMessage(g: Pick<GoalState, 'contract' | 'rounds' | 'best' | 'dropped' | 'rules'> & { undo?: boolean }, why: string): string {
  const st = standingParts(g);
  return join([
    goalHead('which way next'),
    `The goal: “${quote(g.contract.objective)}”`,
    st.holds,
    lastRound(g),
    st.dropped,
    g.rules.length ? `From the user (for every round):\n${g.rules.map((r) => `- ${r.text}`).join('\n')}` : '',
    `${why} Do not work now. Call goal_ask with 2 to 4 clearly different ways to go on, each with why, what it should bring on the checks (expects) and what it costs, and your own pick; then end your turn.`,
    GOAL_FOOT,
  ]);
}

/** The line a message sent again after a restart carries, right under its head. */
export const RESTARTED = 'The app restarted while you worked, which cut your last turn short. Carry on where you left off, with this message as before:';

/**
 * The loop's last message sent again because a restart of the app cut the agent's turn short (Custom's turns stop at
 * each restart, and nothing else carries them on): the same message, its head first as always, and right under it a
 * line that says why it comes again.
 */
export function restartedMessage(text: string): string {
  const m = goalMessageOf(text);
  if (!m) return `${RESTARTED}\n\n${text}`;
  return `${goalHead(m.head || 'round')}\n\n${RESTARTED}\n\n${m.body.trimStart()}`;
}
