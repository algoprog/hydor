// The words of goal mode: where a goal stands, how a round ended, what a check shows, the clock of a question, the labels of
// its buttons, durations and money. Pure, so a test can read them (words-test.ts); the screens only draw them. Words are the
// ones of the specification's section 2: Goal, Done when, check, holds, round, way, Kept, Undone, Best so far, Its pick, From you.
import { holding, standing, type GoalAsks, type GoalLimits, type GoalCheck, type GoalResult, type GoalRound, type GoalSettings, type GoalState, type GoalStatus } from '@shared/goals';
import type { SessionSummary } from '@shared/types';
import { duration, usd } from '../../lib/format';

export const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** How long, for a round or a goal's time so far, as the app writes durations everywhere (lib/format.ts). */
export const spanText = (ms: number): string => {
  const secs = Math.max(0, Math.round(ms / 1000));
  // Whole seconds at least: never "0 ms", never "5.0 s".
  return secs < 60 ? `${secs} s` : duration(secs * 1000);
};

/** The time a goal has been at work, as the bar shows it: the server's count was true when the page got it, and runs on from then while a round runs or its checks do. */
export const activeNow = (g: Pick<GoalState, 'status' | 'activeMs'>, now: number, arrivedAt: number): number =>
  g.status === 'working' || g.status === 'checking' ? g.activeMs + Math.max(0, now - arrivedAt) : g.activeMs;

/** "3 hours", "90 minutes": a limit of time, as a pill says it. */
export function limitMinutes(min: number): string {
  if (min >= 60 && min % 60 === 0) return plural(min / 60, 'hour');
  return plural(min, 'minute');
}

/** Digits after the point in a number (at most four). */
const decimals = (v: number): number => {
  const t = String(Math.round(v * 1e4) / 1e4);
  const i = t.indexOf('.');
  return i < 0 ? 0 : t.length - i - 1;
};

/** A number with `d` decimals, or as it is when it is whole and no decimals are asked. */
export const fixed = (v: number, d: number): string => (d > 0 ? v.toFixed(d) : String(Math.round(v * 1e4) / 1e4));

/** The decimals a measured check's numbers share: the most any of its target and the values shown have (at most four). */
export const placesOf = (c: GoalCheck, ...vs: (number | undefined)[]): number => Math.min(4, Math.max(c.target ? decimals(c.target.value) : 0, ...vs.map((v) => (v == null ? 0 : decimals(v)))));

/** A number as a check shows it: "340", "0.61", "0.8". */
export const num = (v: number): string => fixed(v, decimals(v));

/** A check's name in a pill: the label before its colon ("Relevance: nDCG@10 at least 0.80" is "Relevance"). */
export const shortLabel = (c: GoalCheck): string => c.label.split(':')[0].trim() || c.label;

/** A measured value with its unit and as many decimals as its target and `others` have: "208 ms", "0.73". */
export const valueText = (c: GoalCheck, v: number, ...others: (number | undefined)[]): string => `${fixed(v, placesOf(c, v, ...others))}${c.unit ? ` ${c.unit}` : ''}`;

/** What a check needs, in a column: "pass", "≥ 0.80", "looks right", "you"; `others` are values shown beside it. */
export function needsText(c: GoalCheck, ...others: (number | undefined)[]): string {
  if (c.kind === 'measure' && c.target) return `${c.target.op === '>=' ? '≥' : '≤'} ${valueText(c, c.target.value, ...others)}`;
  return c.kind === 'command' ? 'pass' : c.kind === 'review' ? 'looks right' : c.kind === 'you' ? 'you' : '';
}

export const KIND_LABEL: Record<GoalCheck['kind'], string> = { command: 'Command', measure: 'Measured', review: 'Reviewer', you: 'You' };

// ---- where a goal stands ---------------------------------------------------------------------------------------------------

/** The round a goal is at: the one in progress, else the next. */
export const roundNo = (g: Pick<GoalState, 'round' | 'rounds'>): number => g.round ?? Math.max(0, ...g.rounds.map((r) => r.n)) + 1;

/** A session's team at work while its own turn has ended: how many of its subagents run, and whether it leads a swarm (they are its members then). */
export interface Team {
  helpers: number;
  swarm: boolean;
}

/**
 * The team a round waits for: the session's own turn has ended (it is not working) but its subagents are, which is not a round
 * that is done. Nothing when none runs, or the session itself is at work. It comes from the session, not the goal.
 */
export function teamOf(s: Pick<SessionSummary, 'helpers' | 'live' | 'extra'>): Team | undefined {
  const helpers = s.helpers ?? 0;
  const own = s.live?.status;
  if (helpers < 1 || own === 'working' || own === 'waiting') return undefined;
  return { helpers, swarm: s.extra?.swarm === true };
}

/** "waiting for 2 members" (a swarm's lead) or "waiting for 2 subagents", one in the singular. */
export function waitingWords(t: Team): string {
  if (t.swarm) return t.helpers === 1 ? 'waiting for 1 member' : `waiting for ${t.helpers} members`;
  return t.helpers === 1 ? 'waiting for 1 subagent' : `waiting for ${t.helpers} subagents`;
}

/** The muted words after "Goal" on the bar: "round 7 of 12 · working", "asking you", "paused"; `team` where its subagents are at work. */
export function statusWords(g: GoalState, team?: Team): string {
  const at = `round ${roundNo(g)} of ${g.contract.limits.rounds}`;
  switch (g.status) {
    case 'drafting':
      return 'working out the checks';
    case 'agreeing':
      return 'the checks wait for you';
    case 'measuring':
      return 'measuring where things stand';
    // Pause was pressed while the round ran: it is finished and checked first.
    case 'working':
      // The lead's own turn has ended and its subagents (a swarm's members) are still at work: the round is not over.
      if (team) return `${at} · ${waitingWords(team)}${g.pausing ? ' · pausing after this round' : ''}`;
      return g.pausing ? `${at} · working · pausing after this round` : `${at} · working`;
    case 'checking':
      return g.pausing ? `${at} · running the checks · pausing after this round` : `${at} · running the checks`;
    case 'asking':
      return `${at} · asking you`;
    case 'paused':
      return g.rounds.some((r) => r.n > 0) || g.round ? `${at} · paused` : 'paused';
    case 'needs-you':
      return 'needs you';
    case 'reached':
      return 'reached';
    case 'stopped':
      return 'stopped';
    case 'limit':
      return 'stopped at its limit';
  }
}

/** The same for a goal not loaded yet: the session summary's short form (GoalInfo.app). */
export function statusWordsApp(a: { state: GoalStatus; round?: number; rounds: number }): string {
  const at = `round ${a.round ?? 1} of ${a.rounds}`;
  switch (a.state) {
    case 'drafting':
      return 'working out the checks';
    case 'agreeing':
      return 'the checks wait for you';
    case 'measuring':
      return 'measuring where things stand';
    case 'working':
      return `${at} · working`;
    case 'checking':
      return `${at} · running the checks`;
    case 'asking':
      return `${at} · asking you`;
    case 'paused':
      return 'paused';
    case 'needs-you':
      return 'needs you';
    default:
      return '';
  }
}

/** A title for the sidebar's mark: "Goal · round 7 of 12 · 3 of 5 hold". */
export function markTitle(objective: string, a?: { state: GoalStatus; round?: number; rounds: number; holds: number; of: number }): string {
  if (!a) return `Goal: ${objective}`;
  const words = statusWordsApp(a);
  return `Goal · ${words ? `${words} · ` : ''}${a.holds} of ${a.of} hold\n${objective}`;
}

/** Whether a round runs or its checks do: Your say on a round waits (the server says 409 then). */
export const busy = (s: GoalStatus): boolean => s === 'working' || s === 'checking' || s === 'measuring';

/** A goal that waits for the person: its icon is amber. */
export const needsPerson = (s: GoalStatus): boolean => s === 'agreeing' || s === 'asking' || s === 'needs-you' || s === 'paused';

export const PAUSE_WAIT = 'Pause the goal first, or wait for the round to end';
/** The same while a pause waits for the round that runs: the say comes once it has been checked. */
export const PAUSING_WAIT = 'It pauses once this round has been checked';
export const pauseWait = (g: Pick<GoalState, 'pausing'>): string => (g.pausing ? PAUSING_WAIT : PAUSE_WAIT);

/** The bar's button that pauses: while a pause waits for the round that runs it takes the pause back, as Resume does. */
export const pauseButton = (g: Pick<GoalState, 'pausing'>): { label: 'Pause' | 'Resume'; action: 'pause' | 'resume' } => (g.pausing ? { label: 'Resume', action: 'resume' } : { label: 'Pause', action: 'pause' });

/** The report's button for a goal that stopped at a limit (nothing for one that was reached or stopped), and the dialog's buttons. */
export const giveMore = (g: Pick<GoalState, 'status'>): string => (g.status === 'limit' ? 'Give it more…' : '');
export const GO_ON = 'Go on';

/** What is wrong with the limits, in a sentence; null when they are fine (rounds at least one, money and time above zero or empty). */
export function limitsProblem(l: GoalLimits): string | null {
  if (!(l.rounds >= 1)) return 'It needs at least one round';
  if (l.usd != null && !(l.usd > 0)) return 'The money limit must be more than zero, or empty';
  if (l.minutes != null && !(l.minutes > 0)) return 'The time limit must be more than zero, or empty';
  return null;
}

/** The limits as they are sent: whole rounds, money and time only when set. */
export const limitsOf = (l: GoalLimits): GoalLimits => ({ rounds: Math.round(l.rounds), ...(l.usd ? { usd: l.usd } : {}), ...(l.minutes ? { minutes: l.minutes } : {}) });

/** The muted line under the pills while a change of the checks you made waits for the round to be checked; nothing without one. */
export const pendingNote = (g: Pick<GoalState, 'pending'>): string => (g.pending && (g.pending.checks || g.pending.protect) ? 'Your change to the checks takes effect after this round.' : '');

// ---- the agreement --------------------------------------------------------------------------------------------------------

/** Where permissions ask before commands the checks are not run before you agree: no round yet, so nothing is measured. */
export const unmeasured = (g: Pick<GoalState, 'rounds'>): boolean => g.rounds.length === 0;

export const UNMEASURED_NOTE = 'The checks run for the first time when you press Start.';

/** The agreement card's head, at the right: "measured 3m ago · 3 of 5 hold", or "not measured yet". */
export function agreementHead(g: GoalState, when: string): string {
  if (unmeasured(g)) return 'not measured yet';
  const h = holding(g);
  return `measured ${when} · ${h.holds} of ${h.of} hold`;
}

/** A first Start that came back to the agreement because a check could not run: the next one is "Start anyway". */
export const startAnyway = (g: GoalState): boolean => !unmeasured(g) && /could not run/i.test(g.reason ?? '') && g.contract.checks.some((c) => standing(g).find((r) => r.id === c.id)?.error);

export const startLabel = (g: GoalState): string => (startAnyway(g) ? 'Start anyway' : 'Start');

// ---- how much it asks ------------------------------------------------------------------------------------------------------

export const ASKS: { value: GoalAsks; label: string; chip: string; hint: string }[] = [
  { value: 'own', label: 'On its own', chip: 'Works on its own', hint: 'Only when it cannot go on without you.' },
  {
    value: 'forks',
    label: 'At turning points',
    chip: 'Asks at turning points',
    hint: 'When it is about to change its approach, and when two checks pull against each other.',
  },
  { value: 'every', label: 'Every round', chip: 'Asks every round', hint: 'After each round it shows what it found and its pick for the next.' },
];

export const asksChip = (s: GoalSettings): string => ASKS.find((a) => a.value === s.asks)?.chip ?? '';

/** What happens with no answer: "Goes on with its pick after 10 min" / "Waits for you". */
export const noAnswerWords = (s: GoalSettings): string => (s.noAnswerMin > 0 ? `Goes on with its pick after ${s.noAnswerMin} min` : 'Waits for you');

// ---- the question's clock and buttons --------------------------------------------------------------------------------------

/** "goes on with its pick in 9 min", by the minute, and by the second under a minute; "waits for you" with no clock. */
export function clockWords(expiresAt: number | undefined, now: number): string {
  if (expiresAt == null) return 'waits for you';
  const ms = expiresAt - now;
  if (ms <= 0) return 'going on with its pick';
  if (ms > 60000) return `goes on with its pick in ${Math.ceil(ms / 60000)} min`;
  return `goes on with its pick in ${Math.ceil(ms / 1000)} s`;
}

/** How long until the clock's words change: every second in the last two minutes, else every ten. */
export const clockTick = (expiresAt: number, now: number): number => (expiresAt - now <= 120000 ? 1000 : 10000);

/** The main button of a question: "Go this way" with one way ticked, "Follow these 2, in this order" with several. */
export function goLabel(ticked: number): string {
  return ticked > 1 ? `Follow these ${ticked}, in this order` : 'Go this way';
}

// ---- rounds ----------------------------------------------------------------------------------------------------------------

/** The round the files stood at when this one began: the latest kept (or left as it is) round before it, else the start. */
export function before(g: Pick<GoalState, 'rounds'>, r: GoalRound): GoalRound | undefined {
  let prev: GoalRound | undefined;
  for (const x of g.rounds) {
    if (x.n >= r.n) break;
    if (x.outcome === 'start' || x.outcome === 'kept' || x.outcome === 'stays') prev = x;
  }
  return prev;
}

/** The biggest move of a measured check in a round, as "Relevance 0.61 → 0.68"; nothing when none moved. */
export function biggestMove(g: Pick<GoalState, 'rounds' | 'contract'>, r: GoalRound): string | undefined {
  const was = before(g, r);
  if (!was) return undefined;
  let best: { text: string; size: number } | undefined;
  for (const c of g.contract.checks) {
    if (c.kind !== 'measure') continue;
    const a = was.results.find((x) => x.id === c.id)?.value;
    const b = r.results.find((x) => x.id === c.id)?.value;
    if (a == null || b == null || a === b) continue;
    const size = Math.abs(b - a) / Math.max(Math.abs(a), 1e-9);
    const name = shortLabel(c);
    if (!best || size > best.size) best = { size, text: `${name} ${fixed(a, placesOf(c, a, b))} → ${valueText(c, b, a)}` };
  }
  return best?.text;
}

/** What a round's row says it changed: the biggest move of a measured check, else why it ended as it did. */
export function changeText(g: Pick<GoalState, 'rounds' | 'contract' | 'best'>, r: GoalRound): string {
  if (r.n === 0) {
    const h = holding({ rounds: [r], best: 0, contract: g.contract });
    return `${h.holds} of ${h.of} hold`;
  }
  // A round without gain, or one that broke something, says so; any other says which number moved most.
  if (r.outcome !== 'kept' && (r.cause === 'none' || (!r.cause && r.why && /no gain/i.test(r.why)))) return 'No gain';
  if (roundBroke(g, r) && r.why) return r.why;
  return biggestMove(g, r) ?? r.why ?? '';
}

/**
 * Whether an undone round broke something (a check that held, a protected path, a rule): its mark is red. The server says
 * why in `cause`; without it the results and the sentence are read.
 */
export function roundBroke(g: Pick<GoalState, 'rounds'>, r: GoalRound): boolean {
  if (r.outcome !== 'undone' && r.outcome !== 'stays') return false;
  if (r.cause) return r.cause === 'broke' || r.cause === 'protected' || r.cause === 'rule';
  const was = before(g, r);
  if (was?.results.some((x) => x.holds && !r.results.find((y) => y.id === x.id)?.holds)) return true;
  return /may not change|broke|stopped holding|rule/i.test(r.why ?? '');
}

/** The first sentence of what the agent said it did. */
export function firstSentence(text: string | undefined): string {
  const t = (text ?? '').trim().replace(/\s+/g, ' ');
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  return m ? m[1] : t;
}

/** What a round's row calls it: the way followed, else the first sentence of what it did. */
export const roundName = (r: GoalRound): string => (r.n === 0 ? 'Where things stand' : (r.way || firstSentence(r.did) || 'A round'));

/** The outcome chip: Kept, Undone, "Kept by you", "Undone by you", "Left as it is". */
export function outcomeLabel(r: GoalRound): string {
  switch (r.outcome) {
    case 'kept':
      return r.by === 'you' ? 'Kept by you' : 'Kept';
    case 'undone':
      return r.by === 'you' ? 'Undone by you' : 'Undone';
    case 'stays':
      return 'Left as it is';
    default:
      return '';
  }
}

/** "3 members", "1 member": how many of a swarm's members worked in a round; nothing when none did. */
export const membersText = (r: Pick<GoalRound, 'members'>): string => (r.members ? (r.members === 1 ? '1 member' : `${r.members} members`) : '');

/** "$0.52 · 8 min": what a round cost and how long it took. */
export const roundCost = (r: GoalRound): string => `${usd(r.usd)} · ${spanText(Math.max(0, r.endedAt - r.startedAt))}`;

// ---- checks ----------------------------------------------------------------------------------------------------------------

/** What a check's result says at the right of its row: "holds", "0.61 now", the error. */
export function nowText(c: GoalCheck, r: GoalResult | undefined): string {
  if (!r) return '';
  if (r.error) return r.error;
  if (r.holds) return c.kind === 'measure' && r.value != null ? valueText(c, r.value) : 'holds';
  if (c.kind === 'measure' && r.value != null) return `${valueText(c, r.value)} now`;
  return c.kind === 'command' ? 'fails' : 'not yet';
}

/** A check's result in a table cell (the report's): the value read, else holds, fails or not yet; `other` is the value in the cell beside it. */
export function cellText(c: GoalCheck, r: GoalResult | undefined, other?: number): string {
  if (!r) return '';
  if (r.error) return 'could not run';
  if (c.kind === 'measure' && r.value != null) return valueText(c, r.value, other);
  return r.holds ? 'holds' : c.kind === 'command' ? 'fails' : 'not yet';
}

/** The title of a dash where a check was added or changed after the start, so it has no value at the start (GoalResult.since). */
export const sinceTitle = (r: Pick<GoalResult, 'since'> | undefined): string | undefined => (r?.since != null ? `Changed after round ${r.since}` : undefined);

/** A check's value at the start, for the report's column: "—" for a check that was measured first after the start. */
export const startCellText = (c: GoalCheck, r: GoalResult | undefined, other?: number): string => (r?.since != null ? '—' : cellText(c, r, other));

/** A check's result in the open start row of the rounds: "—" for a check that was measured first after the start. */
export const startResultText = (c: GoalCheck, r: GoalResult | undefined): string => (r?.since != null ? '—' : resultText(c, r));

/** A check's result in an open round: "0.74, needs 0.80", "holds", "fails", "could not run". */
export function resultText(c: GoalCheck, r: GoalResult | undefined): string {
  if (!r) return '';
  if (r.error) return 'could not run';
  if (c.kind === 'measure' && r.value != null) return r.holds || !c.target ? valueText(c, r.value) : `${valueText(c, r.value)}, needs ${valueText(c, c.target.value, r.value)}`;
  if (r.holds) return 'holds';
  return c.kind === 'command' ? 'fails' : 'not yet';
}

/** A check pill's measured part: "0.73 / 0.80" or "208 / 200 ms". */
export function pillValue(c: GoalCheck, r: GoalResult): string {
  if (c.kind !== 'measure' || r.value == null || !c.target) return '';
  const d = placesOf(c, r.value);
  return `${fixed(r.value, d)} / ${fixed(c.target.value, d)}${c.unit ? ` ${c.unit}` : ''}`;
}

// ---- money and time --------------------------------------------------------------------------------------------------------

/** "$5.04 of $10.00", or the amount alone without a limit. */
export const moneyText = (g: Pick<GoalState, 'spentUsd' | 'contract'>): string => (g.contract.limits.usd ? `${usd(g.spentUsd)} of ${usd(g.contract.limits.usd)}` : usd(g.spentUsd));

/** "1 h 11 min of 3 h", or the time alone without a limit. */
export const timeText = (g: Pick<GoalState, 'activeMs' | 'contract'>, activeMs = g.activeMs): string =>
  g.contract.limits.minutes ? `${spanText(activeMs)} of ${spanText(g.contract.limits.minutes * 60000)}` : spanText(activeMs);

/** "At most $10.00 and 3 hours" for the agreement's footer; nothing when only the rounds are limited. */
export function atMost(g: Pick<GoalState, 'contract'>): string {
  const l = g.contract.limits;
  const parts = [l.usd ? usd(l.usd) : '', l.minutes ? limitMinutes(l.minutes) : ''].filter(Boolean);
  return parts.length ? `At most ${parts.join(' and ')}` : '';
}

/** "7 rounds · $5.92 of $10.00 · 1 h 24 min": the report's line. */
export function reportLine(g: GoalState): string {
  const n = g.rounds.filter((r) => r.n > 0).length;
  return [plural(n, 'round'), moneyText(g), spanText(g.activeMs)].join(' · ');
}
