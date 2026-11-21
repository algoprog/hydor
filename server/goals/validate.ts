// What a goal's checks, protected paths, limits and the web's actions may hold: the agent's proposal (goal_propose) and
// the person's changes (POST /api/sessions/:key/goal) pass through here. Each problem is a plain sentence: the agent
// gets them all to fix, the web the first as a 400.
import { GOAL_MAX_CHECKS, GOAL_MAX_WAYS, type GoalAction, type GoalCheck, type GoalCheckKind, type GoalContract, type GoalLimits, type GoalSettings } from '../../shared/goals.ts';
import { HttpError } from '../auth.ts';
import { badRead, MAX_TIMEOUT_S } from './checks.ts';

export const MAX = { objective: 4000, label: 200, command: 1000, note: 2000, claim: 1000, title: 200, path: 300, paths: 50, files: 10, read: 300, unit: 20, way: 500, rounds: 500, usd: 10_000, minutes: 100_000, noAnswerMin: 1440 };

const KINDS: GoalCheckKind[] = ['command', 'measure', 'review', 'you'];

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A check as sent, made one the app keeps (its id given later), or the problems with it. */
function cleanCheck(v: unknown, n: number, errors: string[]): Omit<GoalCheck, 'id'> & { id?: string } | null {
  const where = `Check ${n}`;
  if (!isObj(v)) {
    errors.push(`${where} is not an object.`);
    return null;
  }
  const kind = v.kind as GoalCheckKind;
  if (!KINDS.includes(kind)) {
    errors.push(`${where} needs a kind: command, measure, review or you.`);
    return null;
  }
  const label = text(v.label);
  const bad = errors.length;
  if (!label) errors.push(`${where} needs a label: what it says in plain words ("Tests pass").`);
  else if (label.length > MAX.label) errors.push(`${where}'s label is longer than ${MAX.label} characters.`);
  const out: Omit<GoalCheck, 'id'> & { id?: string } = { kind, label: label.slice(0, MAX.label) };
  // An id as sent: whether it is one the goal has is for cleanChecks to say.
  if (v.id !== undefined && v.id !== null && String(v.id).trim() !== '') out.id = String(v.id).trim().slice(0, 40);
  const named = label ? `“${label}”` : where;
  if (v.timeoutS !== undefined) {
    if (!finite(v.timeoutS) || v.timeoutS < 1 || v.timeoutS > MAX_TIMEOUT_S) errors.push(`${named}: timeoutS is a number of seconds from 1 to ${MAX_TIMEOUT_S}.`);
    else out.timeoutS = Math.round(v.timeoutS);
  }
  if (kind === 'command' || kind === 'measure') {
    const run = text(v.run);
    if (!run) errors.push(`${named} needs run: the shell command the app runs in the session's folder.`);
    else if (run.length > MAX.command) errors.push(`${named}: its command is longer than ${MAX.command} characters.`);
    else out.run = run;
  }
  if (kind === 'measure') {
    const t = v.target;
    if (!isObj(t) || (t.op !== '>=' && t.op !== '<=') || !finite(t.value)) errors.push(`${named} needs target: { op: ">=" or "<=", value: a number }.`);
    else out.target = { op: t.op, value: t.value };
    if (v.read !== undefined && v.read !== null && v.read !== '') {
      const read = String(v.read);
      const why = read.length > MAX.read ? `it is longer than ${MAX.read} characters` : badRead(read);
      if (why) errors.push(`${named}: read is not a regular expression that works (${why}).`);
      else out.read = read;
    }
    if (v.unit !== undefined && v.unit !== null && v.unit !== '') {
      const unit = text(v.unit);
      if (unit.length > MAX.unit) errors.push(`${named}: its unit is longer than ${MAX.unit} characters.`);
      else out.unit = unit;
    }
    if (v.slack !== undefined && v.slack !== null) {
      if (!finite(v.slack) || v.slack < 0 || v.slack > 1) errors.push(`${named}: slack is a share from 0 to 1.`);
      else out.slack = v.slack;
    }
  }
  if (kind === 'review') {
    const claim = text(v.claim);
    if (!claim) errors.push(`${named} needs claim: the sentence the reviewer must find true.`);
    else if (claim.length > MAX.claim) errors.push(`${named}: its claim is longer than ${MAX.claim} characters.`);
    else out.claim = claim;
    const e = v.evidence;
    if (e !== undefined && e !== null) {
      if (!isObj(e)) errors.push(`${named}: evidence is { diff?: true, files?: [paths], run?: a command }.`);
      else {
        const ev: NonNullable<GoalCheck['evidence']> = {};
        if (e.diff === true) ev.diff = true;
        if (e.files !== undefined) {
          if (!Array.isArray(e.files) || e.files.length > MAX.files || e.files.some((f) => typeof f !== 'string' || !f.trim() || f.length > MAX.path)) errors.push(`${named}: evidence.files is a list of at most ${MAX.files} paths.`);
          else if (e.files.length) ev.files = (e.files as string[]).map((f) => f.trim());
        }
        if (e.run !== undefined && e.run !== null && e.run !== '') {
          const run = text(e.run);
          if (!run || run.length > MAX.command) errors.push(`${named}: evidence.run is a command of at most ${MAX.command} characters.`);
          else ev.run = run;
        }
        if (!ev.diff && !ev.files && !ev.run) errors.push(`${named}: evidence names nothing to look at (diff, files or run).`);
        out.evidence = ev;
      }
    } else out.evidence = { diff: true };
  }
  return errors.length > bad ? null : out;
}

/** The highest number among check ids ("c7" → 7) of those given. */
export const topId = (ids: Iterable<string>): number => Math.max(0, ...[...ids].map((id) => Number(/^c(\d+)$/.exec(id)?.[1] ?? 0)));

/**
 * Checks as sent, with ids, which are the server's alone. The agent's proposal (`before` unset): every check is new.
 * The person's (`before`: the goal's checks now): one with an id the goal has replaces that check, one without an id
 * is new, and any other id is an error. A new check gets the next free "cN" above `top` (the highest the goal ever
 * gave) and above every id in `before`, so no id is ever given twice. `top` comes back raised to the last given.
 */
export function cleanChecks(v: unknown, before?: GoalCheck[], top = 0): { checks: GoalCheck[]; errors: string[]; top: number } {
  const errors: string[] = [];
  if (!Array.isArray(v) || !v.length) return { checks: [], errors: ['Give at least one check.'], top };
  if (v.length > GOAL_MAX_CHECKS) return { checks: [], errors: [`At most ${GOAL_MAX_CHECKS} checks: keep the ones that matter most.`], top };
  const got = v.map((c, i) => cleanCheck(c, i + 1, errors));
  if (errors.length) return { checks: [], errors, top };
  const used = new Set<string>();
  const known = new Set((before ?? []).map((c) => c.id));
  let next = Math.max(top, topId(known));
  const checks: GoalCheck[] = [];
  got.forEach((c, i) => {
    const id = before ? c!.id : undefined;
    if (id && !known.has(id)) errors.push(`Check ${i + 1} has an id this goal does not have (${id}): leave the id out for a new check.`);
    else if (id && used.has(id)) errors.push(`Check ${i + 1} repeats ${id}: each check once.`);
    const given = id && known.has(id) && !used.has(id) ? id : `c${++next}`;
    used.add(given);
    checks.push({ ...c!, id: given } as GoalCheck);
  });
  return errors.length ? { checks: [], errors, top } : { checks, errors, top: next };
}

/** At most this many wildcards (* or **) in one protected path: a pattern is for "tests/**" or "*.snap", not a puzzle. */
export const MAX_WILDCARDS = 4;

export function cleanProtect(v: unknown, errors: string[]): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length > MAX.paths || v.some((p) => typeof p !== 'string' || p.length > MAX.path)) {
    errors.push(`Protected paths are a list of at most ${MAX.paths} paths, each at most ${MAX.path} characters.`);
    return undefined;
  }
  const out = [...new Set((v as string[]).map((p) => p.trim()).filter(Boolean))];
  const wild = out.find((p) => (p.match(/\*+/g)?.length ?? 0) > MAX_WILDCARDS);
  if (wild) {
    errors.push(`The protected path “${wild.slice(0, 80)}” has more than ${MAX_WILDCARDS} wildcards (*): use fewer.`);
    return undefined;
  }
  return out;
}

export function cleanLimits(v: unknown, errors: string[], base: GoalLimits): GoalLimits | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isObj(v)) {
    errors.push('Limits are { rounds?, usd?, minutes? }.');
    return undefined;
  }
  const out: GoalLimits = { ...base };
  if (v.rounds !== undefined && v.rounds !== null) {
    if (!finite(v.rounds) || v.rounds < 1 || v.rounds > MAX.rounds) errors.push(`Rounds are a number from 1 to ${MAX.rounds}.`);
    else out.rounds = Math.round(v.rounds);
  }
  for (const [k, max] of [
    ['usd', MAX.usd],
    ['minutes', MAX.minutes],
  ] as const) {
    if (v[k] === undefined) continue;
    if (v[k] === null || v[k] === 0) delete out[k];
    else if (!finite(v[k]) || (v[k] as number) <= 0 || (v[k] as number) > max) errors.push(`${k === 'usd' ? 'Money (usd)' : 'Time (minutes)'} is a number above 0 and at most ${max}.`);
    else out[k] = v[k] as number;
  }
  return out;
}

export function cleanSettings(v: unknown, errors: string[]): Partial<GoalSettings> | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isObj(v)) {
    errors.push('Settings are { asks?, noAnswerMin? }.');
    return undefined;
  }
  const out: Partial<GoalSettings> = {};
  if (v.asks !== undefined) {
    if (v.asks !== 'own' && v.asks !== 'forks' && v.asks !== 'every') errors.push('How much it asks is own, forks or every.');
    else out.asks = v.asks;
  }
  // Whole minutes: 0 waits for the person, so a fraction rounded down would switch the clock off when it asked for a short one.
  if (v.noAnswerMin !== undefined) {
    if (!Number.isInteger(v.noAnswerMin) || (v.noAnswerMin as number) < 0 || (v.noAnswerMin as number) > MAX.noAnswerMin) errors.push(`Minutes without an answer are a whole number from 0 to ${MAX.noAnswerMin}.`);
    else out.noAnswerMin = v.noAnswerMin as number;
  }
  return out;
}

/** The settings a session created with a goal (extra.goal) asks for, checked as `set` checks them: a 400 with a sentence. */
export function goalStartSettings(goal: unknown): Partial<GoalSettings> {
  const { start: _start, ...rest } = isObj(goal) ? goal : {};
  const errors: string[] = [];
  const out = cleanSettings(rest, errors) ?? {};
  if (errors.length) throw new HttpError(400, errors[0]);
  return out;
}

/**
 * A contract's changed parts as sent: what is valid, and the problems. `ids`: the person's change (the checks' ids as
 * cleanChecks takes them, above `top`); without it every check is new (the agent's proposal). `top` comes back as the
 * highest id given.
 */
export function cleanContract(
  v: unknown,
  cur: Pick<GoalContract, 'checks' | 'limits'>,
  o: { title?: boolean; ids?: boolean; top?: number } = {},
): { contract: Partial<Pick<GoalContract, 'checks' | 'protect' | 'limits' | 'title'>>; errors: string[]; top: number } {
  const errors: string[] = [];
  const top = o.top ?? 0;
  if (v === undefined || v === null) return { contract: {}, errors, top };
  if (!isObj(v)) return { contract: {}, errors: ['The checks are { checks?, protect?, limits? }.'], top };
  const out: Partial<Pick<GoalContract, 'checks' | 'protect' | 'limits' | 'title'>> = {};
  let given = top;
  if (v.checks !== undefined) {
    const c = cleanChecks(v.checks, o.ids ? cur.checks : undefined, top);
    errors.push(...c.errors);
    if (!c.errors.length) {
      out.checks = c.checks;
      given = c.top;
    }
  }
  const protect = cleanProtect(v.protect, errors);
  if (protect) out.protect = protect;
  const limits = cleanLimits(v.limits, errors, cur.limits);
  if (limits) out.limits = limits;
  if (o.title && v.title !== undefined) {
    const t = text(v.title);
    if (t.length > MAX.title) errors.push(`The title is longer than ${MAX.title} characters.`);
    else if (t) out.title = t;
  }
  return { contract: out, errors, top: given };
}

const fail = (msg: string): never => {
  throw new HttpError(400, msg);
};
const firstOf = (errors: string[]) => errors.length && fail(errors[0]);

/** An action the web sent, checked field by field; a 400 with a plain sentence when something is off. */
export function parseGoalAction(body: unknown): GoalAction {
  if (!isObj(body)) return fail('Say what to do with the goal');
  const b = body;
  const errors: string[] = [];
  switch (b.action) {
    case 'set': {
      const objective = text(b.objective);
      if (!objective) fail('Say what the goal is');
      if (objective.length > MAX.objective) fail(`The goal is longer than ${MAX.objective} characters`);
      const settings = cleanSettings(b.settings, errors);
      firstOf(errors);
      return { action: 'set', objective, ...(settings ? { settings } : {}) };
    }
    case 'agree':
    case 'change': {
      // Checked against the goal itself by the driver (ids, limits it starts from); only the shape here.
      if (b.action === 'change' && !isObj(b.contract)) fail('Say what to change: checks, protected paths or limits');
      if (b.contract !== undefined && b.contract !== null && !isObj(b.contract)) fail('The checks are { checks?, protect?, limits? }');
      return { action: b.action, contract: (b.contract ?? undefined) as never };
    }
    case 'answer': {
      const ways = b.ways ?? [];
      if (!Array.isArray(ways) || ways.length > GOAL_MAX_WAYS || ways.some((w) => !Number.isInteger(w) || w < 0 || w >= GOAL_MAX_WAYS) || new Set(ways).size !== ways.length)
        fail('Tick the ways by their numbers, each once');
      const other = b.other === undefined || b.other === null ? undefined : text(b.other);
      const note = b.note === undefined || b.note === null ? undefined : text(b.note);
      if ((other?.length ?? 0) > MAX.note || (note?.length ?? 0) > MAX.note) fail(`A note is at most ${MAX.note} characters`);
      return { action: 'answer', ways: ways as number[], ...(other ? { other } : {}), ...(note ? { note } : {}) };
    }
    case 'wait':
    case 'pause':
    case 'resume':
    case 'stop':
    case 'clear':
      return { action: b.action };
    case 'settings': {
      const settings = cleanSettings(b.settings, errors);
      firstOf(errors);
      if (!settings || !Object.keys(settings).length) fail('Say which setting to change');
      return { action: 'settings', settings: settings! };
    }
    case 'rule': {
      const t = text(b.text);
      if (!t) fail('Say what the rule is');
      if (t.length > MAX.note) fail(`A rule is at most ${MAX.note} characters`);
      return { action: 'rule', text: t };
    }
    case 'unrule': {
      const id = text(b.id);
      if (!id || id.length > 40) fail('Say which rule to remove');
      return { action: 'unrule', id };
    }
    case 'round': {
      if (!Number.isInteger(b.n) || (b.n as number) < 0 || (b.n as number) > 10_000) fail('Say which round');
      if (b.do !== 'keep' && b.do !== 'undo' && b.do !== 'from') fail('Say what to do with the round: keep, undo or from');
      const reason = b.reason === undefined || b.reason === null ? undefined : text(b.reason);
      if ((reason?.length ?? 0) > MAX.note) fail(`A reason is at most ${MAX.note} characters`);
      let relax: Record<string, number> | undefined;
      if (b.relax !== undefined && b.relax !== null) {
        if (!isObj(b.relax) || Object.keys(b.relax).length > GOAL_MAX_CHECKS || Object.values(b.relax).some((x) => !finite(x))) fail('New targets are numbers, by check');
        relax = b.relax as Record<string, number>;
      }
      return { action: 'round', n: b.n as number, do: b.do as 'keep' | 'undo' | 'from', ...(reason ? { reason } : {}), ...(relax ? { relax } : {}) };
    }
    default:
      return fail('Unknown goal action');
  }
}

