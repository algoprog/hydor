// What the simple view of a web app says, worked out from what the engines say: where it is, what needs the person, what
// the checks found, the five steps of making it and the four of putting it online. The engines' own sentences name files,
// commands and signals, so none of them is shown here: each is said again in plain words, by its id. Pure, so scripts test
// it (plain-words-test.ts, plain-test.ts).
import { CHECK_PROBLEMS } from '@shared/check-words';
import { stillMissing } from '@shared/keys';
import type { AppKey, CheckLine, LaunchJob, LaunchStep, WebApp, WebAppChecks, WebAppDecision, WebAppGuide, WebAppLaunchView, WebAppRunView, WebAppStep, WeeklyCheck } from '@shared/webapps';
import { weeklyReason } from '@shared/weekly-words';
import { tr } from '../../../i18n/runtime';

// ---- names -----------------------------------------------------------------------------------------------------------------------

const upper = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "job_notes" and "createdAt" as words: "Job notes", "Created at". */
export const humanName = (s: string): string => upper(s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase());

const provider = (from: string | undefined) => (from && !['host', 'made', 'you'].includes(from.toLowerCase()) ? from : '');

/** What a key is called: who gives it, never its variable's name. */
export function keyTitle(k: Pick<AppKey, 'from' | 'givenBy'>): string {
  const from = provider(k.from);
  if (from) return tr(`A key from ${from}`);
  if (k.givenBy === 'you') return tr('A password you choose');
  return tr('A key it needs');
}

/** The app's own words on why it needs a key, unless they name something technical. */
export const keyWhy = (why: string | undefined): string => (why && !/[A-Z]+_[A-Z]+|\.json|\benv\b/.test(why) ? why : '');

// ---- the checks --------------------------------------------------------------------------------------------------------------------

export const checkProblem = (id: string): string => tr(CHECK_PROBLEMS[id] ?? 'Something else needs fixing.');

/** The failed lines as plain sentences, each once (two lines can mean the same to a person). */
export const problemsOf = (lines: CheckLine[]): string[] => [...new Set(lines.filter((l) => l.state === 'failed').map((l) => checkProblem(l.id)))];

export interface CheckedLine {
  /** none: never checked; checking: running; ok: all fine; fix: things to fix; stuck: the check itself did not finish. */
  state: 'none' | 'checking' | 'ok' | 'fix' | 'stuck';
  text: string;
  problems: string[];
}

/** The one line a person sees of the checks. `checking`: one is running now. */
export function checkedLine(c: Pick<WebAppChecks, 'ran' | 'lines' | 'problem'> | null | undefined, checking: boolean): CheckedLine {
  const problems = c ? problemsOf(c.lines) : [];
  if (checking) return { state: 'checking', text: tr('Checking it now: this takes a few minutes.'), problems: [] };
  if (!c?.ran) return { state: 'none', text: tr('Not checked yet'), problems: [] };
  if (c.problem) return { state: 'stuck', text: tr('The check could not finish.'), problems: [] };
  if (!problems.length) return { state: 'ok', text: tr('Checked: all fine'), problems };
  return { state: 'fix', text: problems.length === 1 ? tr('1 thing to fix') : tr(`${problems.length} things to fix`), problems };
}

/**
 * What "Fix them" says to the agent, in the person's own conversation: so in plain words, with no id or error text. The
 * agent reads the particulars itself (webapp_contract_check).
 */
export function fixAllMessage(lines: CheckLine[]): string {
  return `${tr('Please fix what the checks found:')}\n${problemsOf(lines).map((p) => `- ${p}`).join('\n')}\n${tr('Then check again, and tell me when it is done.')}`;
}

/** A part of a page pointed at, as it is said in a message: "About the button “Add” on the customers page:". */
export function plainPoint(p: { kind: string; text: string; path: string }): string {
  const page = p.path.split(/[?#]/)[0].split('/').filter((x) => x && !/\d/.test(x)).pop();
  const where = page ? tr(`on the ${humanName(page).toLowerCase()} page`) : tr('on the first page');
  return `${tr(`About the ${p.kind}`)}${p.text ? ` “${p.text}”` : ''} ${where}:`;
}

// ---- where it is ----------------------------------------------------------------------------------------------------------------

export type Tone = 'ok' | 'idle' | 'busy' | 'err';

export interface State {
  tone: Tone;
  text: string;
  /** What Hydor or the agent will do, or the person can do, when something is wrong. */
  next?: string;
  /** The engine's own words, shown with Technical details on. */
  reason?: string;
  /** A message that asks the agent to put it right. */
  fix?: string;
}

/** The address people open, when it is on a server of the person's. */
export const onlineAddress = (view: Pick<WebAppLaunchView, 'envs'> | null | undefined): string => (view?.envs.find((e) => e.env === 'production') ?? view?.envs[0])?.address ?? '';

export const shortAddress = (a: string): string => a.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** One sentence on the app's state. `working`: its agent is at work on it now. */
export function stateOf(app: Pick<WebApp, 'shape' | 'build' | 'run' | 'mode' | 'stage'>, view: Pick<WebAppLaunchView, 'envs' | 'hydor'> | null | undefined, working: boolean): State {
  const address = onlineAddress(view);
  if (!app.shape.ok) {
    if (/not there any more/i.test(app.shape.problem ?? '')) return { tone: 'err', text: tr('Its files are gone from this computer.'), next: tr('Put the folder back where it was, or remove the app from this list.'), reason: app.shape.problem };
    if (/has no hydor\.json yet/i.test(app.shape.problem ?? '')) return { tone: working ? 'busy' : 'idle', text: working ? tr('Being made') : tr('Not made yet'), reason: app.shape.problem };
    return { tone: 'err', text: tr('Hydor cannot run it as it is.'), next: tr('Ask the agent to put it right.'), reason: (app.shape.problems ?? [app.shape.problem ?? '']).join(' '), fix: tr('Hydor cannot run this app as it is. Please put it right and check it.') };
  }
  if (app.build.state === 'failed') return { tone: 'err', text: tr('The last change could not be put together.'), next: tr('Ask the agent to fix it, or undo the last change.'), reason: app.build.problem, fix: tr('The last change could not be put together. Please fix it and check it.') };
  if (app.run.state === 'crashed') return { tone: 'err', text: tr('It stopped by itself.'), next: tr('Ask the agent to find out why and fix it.'), reason: app.run.lastExit ?? undefined, fix: tr('The app stopped by itself. Please find out why and fix it.') };
  if (working) return { tone: 'busy', text: tr('Being changed') };
  if (app.build.state === 'building') return { tone: 'busy', text: tr('Being put together') };
  if (address) return { tone: 'ok', text: tr(`Online at ${shortAddress(address)}`) };
  if (view?.hydor.launched) return { tone: 'ok', text: tr('Running here: only you can open it') };
  if (!app.build.exists && app.mode.runsAs !== 'dev') return { tone: 'idle', text: tr('Not ready to try yet') };
  return { tone: 'ok', text: tr('Ready to try: only you can open it') };
}

/** Whether there are changes the people who use it do not have yet. */
export const changesWaiting = (view: Pick<WebAppLaunchView, 'envs' | 'hydor' | 'history'> | null | undefined, last: WebAppStep | null | undefined): boolean => {
  if (!view || !last) return false;
  if (view.envs.length) return last.at > Math.max(...view.envs.map((e) => e.at));
  return !!view.hydor.launched && (view.hydor.ahead ?? 0) > 0;
};

// ---- the five steps of making it ----------------------------------------------------------------------------------------------------

export const PHASES = ['Describe it', 'Pick a look', 'It gets built', 'Try it', 'Put it online'] as const;

export interface StripState {
  /** The step it is at (0 to 4). */
  at: number;
  /** All five are behind it. */
  done: boolean;
  /** One sentence on what is happening. */
  sentence: string;
  /** The agent is at work right now. */
  busy: boolean;
}

export interface StripFacts {
  stage: string | null;
  decisions: WebAppDecision[];
  /** The agent is working, or waiting for an answer. */
  working: boolean;
  waiting: boolean;
  /** What the agent says it is doing now (webapp_steps `doing`). */
  doing?: string;
  /** The newest saved step. */
  last?: string;
  /** People can use it: launched here or on a server. */
  online: boolean;
  checking?: boolean;
}

export function stripOf(f: StripFacts): StripState {
  const stage = (f.stage ?? 'brief').toLowerCase();
  const picked = f.decisions.some((d) => d.shape === 'designs');
  const busy = f.working && !f.waiting;
  let at = stage === 'brief' ? 0 : stage === 'design' ? (picked ? 2 : 1) : stage === 'build' ? 2 : stage === 'check' ? 3 : 4;
  // Built and the agent has stopped: it is the person's turn to try it.
  if (at === 2 && stage === 'build' && !f.working && !f.waiting && f.last) at = 3;
  const done = f.online && stage === 'run' && !f.working && !f.waiting;
  const idle = [tr('Say what you have in mind.'), tr('Next: pick how it looks.'), tr('Ready to be built.'), tr('Your turn: try it, and say what is wrong.'), f.online ? tr('Online. Say what you want changed.') : tr('Ready to put online.')];
  const working = [tr('Working out what you want'), tr('Drawing looks to pick from'), tr('Building your app'), tr('Putting right what you found'), tr('Putting it online')];
  const sentence = f.waiting ? tr('Waiting for your answer') : f.checking ? tr('Checking that it works') : busy ? (f.doing || working[at]) : done ? tr('Online. Say what you want changed.') : idle[at];
  return { at: done ? 4 : at, done, sentence, busy: busy || !!f.checking };
}

// ---- the four steps of putting it online -------------------------------------------------------------------------------------------

/** Which of the four plain steps each step of a launch belongs to (server/webapps/remote/types.ts, hydor-launch.ts). */
const GROUP_OF: Record<string, 'checking' | 'sending' | 'building' | 'switching'> = {
  check: 'checking', host: 'checking', keys: 'checking', address: 'checking', files: 'checking',
  send: 'sending',
  install: 'building', build: 'building', configure: 'building', snapshot: 'building',
  switch: 'switching', data: 'switching', start: 'switching', ready: 'switching', smoke: 'switching', backup: 'switching', record: 'switching', restore: 'switching',
};
const GROUP_NAMES = { checking: 'Checking', sending: 'Sending', building: 'Building', switching: 'Switching on' } as const;

export interface Group {
  id: keyof typeof GROUP_NAMES;
  title: string;
  state: LaunchStep['state'];
}

/** A launch's steps as at most four plain ones, in the order its own steps come. */
export function launchGroups(steps: LaunchStep[]): Group[] {
  const ids: Group['id'][] = [];
  for (const s of steps) {
    const g = GROUP_OF[s.id] ?? 'switching';
    if (!ids.includes(g)) ids.push(g);
  }
  return ids.map((id) => {
    const mine = steps.filter((s) => (GROUP_OF[s.id] ?? 'switching') === id);
    const state: LaunchStep['state'] = mine.some((s) => s.state === 'failed')
      ? 'failed'
      : mine.some((s) => s.state === 'running')
        ? 'running'
        : mine.every((s) => s.state === 'passed' || s.state === 'skipped')
          ? 'passed'
          : mine.some((s) => s.state === 'passed')
            ? 'running'
            : 'waiting';
    return { id, title: tr(GROUP_NAMES[id]), state };
  });
}

const FAILED_STEP: Record<string, string> = {
  check: 'The app’s own checks found something that has to be fixed first.',
  host: 'Hydor could not reach your server, or the server is missing something.',
  keys: 'A key it needs is missing.',
  address: 'Your web address does not lead to your server yet.',
  files: 'The app is not ready to be sent to a server.',
  send: 'The app could not be sent to your server.',
  install: 'The saved version could not be read.',
  build: 'Your server could not put the app together.',
  configure: 'Your server could not be set up for it.',
  snapshot: 'A copy of what runs now could not be made.',
  switch: 'The new version could not be switched on.',
  start: 'It does not start.',
  data: 'What it keeps could not be set up.',
  ready: 'It started, but does not answer.',
  smoke: 'It answers, but a quick try of it did not work.',
  backup: 'It is on, but a copy of what it keeps could not be made and read back.',
  record: 'It is on, but Hydor could not write it down.',
};

/** One sentence on a launch that did not finish, and what happened to the version before. */
export function launchFailed(job: Pick<LaunchJob, 'steps' | 'previousBack'>): { text: string; next: string } {
  const at = job.steps.find((s) => s.state === 'failed');
  return {
    text: tr(FAILED_STEP[at?.id ?? ''] ?? 'It did not go through.'),
    next: job.previousBack ? tr('The version before is back, by itself. Ask the agent to fix it, then try again.') : tr('Nothing people use was changed. Ask the agent to fix it, then try again.'),
  };
}

/** What "Ask the agent to fix it" says after a launch that did not finish (the agent reads why from its tools). */
export function launchFailedMessage(job: Pick<LaunchJob, 'steps' | 'previousBack'>): string {
  return `${tr('Putting it online did not work.')} ${launchFailed(job).text} ${tr('Please look at why, and fix it.')}`;
}

// ---- undo --------------------------------------------------------------------------------------------------------------------------

/** What "Undo the last change" would undo: the newest saved step, unless it is itself an undo. */
export const undoable = (steps: WebAppStep[]): WebAppStep | null => (steps.length > 1 ? steps[0] : null);

// ---- what needs the person ----------------------------------------------------------------------------------------------------------

export interface NeedFact {
  /** waiting, key:<provider>, models, mail, fix, publish. */
  id: string;
  title: string;
  line?: string;
  button: string;
  bad?: boolean;
}

export interface NeedFacts {
  /** An agent of this app's waits for an answer. */
  waiting: boolean;
  /** The keys still to be given, where the app is used. */
  keys: Pick<AppKey, 'name' | 'from' | 'givenBy' | 'why'>[];
  /** It asks for the person's models and may not have them yet. */
  models?: { usdPerDay: number } | null;
  /** It sends mail and the person has not said yes or no. */
  mail?: boolean;
  state: State;
  /** There are changes the people who use it do not have. */
  unpublished?: boolean;
  /** What the weekly check found and is still so. */
  weekly?: WeeklyCheck['needs'];
}

export function needsOf(f: NeedFacts): NeedFact[] {
  const out: NeedFact[] = [];
  if (f.waiting) out.push({ id: 'waiting', title: tr('The agent has a question for you'), button: tr('Answer') });
  if (f.state.fix) out.push({ id: 'fix', title: f.state.text, line: f.state.next, button: tr('Fix it'), bad: true });
  const keys = new Map<string, NeedFact>();
  for (const k of f.keys) {
    const title = keyTitle(k);
    const id = `key:${provider(k.from) || k.givenBy}`;
    if (!keys.has(id)) keys.set(id, { id, title, line: keyWhy(k.why) || undefined, button: tr('Add it') });
  }
  out.push(...keys.values());
  for (const n of f.weekly ?? []) {
    const why = weeklyReason(n);
    out.push({ id: `weekly:${n.id}`, title: tr(why.charAt(0).toUpperCase() + why.slice(1)), button: n.id.startsWith('backup-') ? tr('Make a copy') : tr('Ask the agent'), bad: n.id.startsWith('down-') });
  }
  if (f.models) out.push({ id: 'models', title: tr('It wants to use your AI models'), line: tr(`Up to $${f.models.usdPerDay} a day. Nothing is used until you allow it.`), button: tr('Allow') });
  if (f.mail) out.push({ id: 'mail', title: tr('It wants to send mail'), line: tr('From a mail account of yours, once you allow it.'), button: tr('Choose') });
  if (f.unpublished && !f.waiting) out.push({ id: 'publish', title: tr('Your changes are not online yet'), line: tr('People still have the version from before.'), button: tr('Put them online') });
  return out;
}

// ---- an app on the Apps page ----------------------------------------------------------------------------------------------------------

/** An app's state in a word or two, for its card and the panel beside a conversation. `making`: its agent is at work on it. */
export function shortState(app: Pick<WebApp, 'shape' | 'build' | 'run' | 'mode'>, making = false): { tone: Tone; label: string } {
  // What does not run yet while its agent still works on it is unfinished, not broken.
  if (making && (!app.shape.ok || app.build.state === 'failed' || app.run.state === 'crashed')) return { tone: 'busy', label: 'Being made' };
  if (!app.shape.ok) {
    if (/has no hydor\.json yet/i.test(app.shape.problem ?? '')) return { tone: 'idle', label: 'Being made' };
    return { tone: 'err', label: 'Needs fixing' };
  }
  if (app.build.state === 'failed' || app.run.state === 'crashed') return { tone: 'err', label: 'Needs fixing' };
  if (app.build.state === 'building' || app.run.state === 'starting') return { tone: 'busy', label: 'Being put together' };
  if (app.mode.servers?.length) return { tone: 'ok', label: 'Online' };
  if (app.mode.launched) return { tone: 'ok', label: 'In use here' };
  if (app.build.exists || app.mode.runsAs === 'dev') return { tone: 'idle', label: 'Ready to try' };
  return { tone: 'idle', label: 'Being made' };
}

/** Who can open it, in a line, for its card. */
export const reachWords = (app: Pick<WebApp, 'mode'>): string => (app.mode.servers?.length ? tr('On your server, on the internet') : app.mode.launched ? tr('Here, only you can open it') : tr('Not online yet'));

// ---- the simple page, worked out -------------------------------------------------------------------------------------------------

export interface HomeInputs {
  app: Pick<WebApp, 'shape' | 'build' | 'run' | 'mode' | 'stage' | 'decisions' | 'ai' | 'mail'>;
  view: Pick<WebAppLaunchView, 'envs' | 'hydor' | 'history'> | null | undefined;
  checks: Pick<WebAppChecks, 'ran' | 'lines' | 'problem' | 'at'> | null | undefined;
  checking: boolean;
  guide: Pick<WebAppGuide, 'doing' | 'try'> | null | undefined;
  steps: WebAppStep[];
  keys: AppKey[];
  session: { working: boolean; waiting: boolean };
  /** When Fix them was pressed (0: not). */
  fixAt: number;
  now: number;
  /** Its server was asked and it does not answer (the Run tab's status). */
  down?: boolean;
  /** How it runs where it is launched, with what the weekly check found. */
  run?: WebAppRunView | null;
}

/** What the weekly check found that is still so, as far as what is known now says. */
export function stillNeeded(run: WebAppRunView | null | undefined): WeeklyCheck['needs'] {
  return (run?.weekly?.needs ?? []).filter((n) => {
    const place = run!.places.find((p) => n.id.endsWith(`-${p.place}`));
    if (!place) return false;
    if (n.id.startsWith('backup-')) return !place.lastBackup || place.lastBackup.ageHours > 72;
    if (n.id.startsWith('down-')) return place.up === false;
    if (n.id.startsWith('unknown-')) return place.up === null;
    return true;
  });
}

/** A fix asked for longer ago than this is not "being fixed" any more. */
export const FIXING_MOST = 45 * 60_000;

export function homeOf(i: HomeInputs) {
  const known = stateOf(i.app, i.view, i.session.working);
  const state: State = i.down && known.tone === 'ok' && onlineAddress(i.view) ? { tone: 'err', text: tr(`${shortAddress(onlineAddress(i.view))} is not answering right now.`), next: tr('Ask the agent to find out why.'), fix: tr('The app online is not answering. Please find out why and fix it.') } : known;
  const online = !!onlineAddress(i.view);
  const last = i.steps[0];
  const line = checkedLine(i.checks, i.checking);
  const fixing = !!i.fixAt && i.now - i.fixAt < FIXING_MOST && (!i.checks?.at || i.checks.at < i.fixAt || i.checking);
  const plainStrip = stripOf({ stage: i.app.stage, decisions: i.app.decisions, working: i.session.working, waiting: i.session.waiting, doing: i.guide?.doing?.text, last: last?.message, online: online || !!i.view?.hydor.launched, checking: i.checking });
  // While what was found is being put right, the strip says that and not "your turn".
  const strip = fixing && line.state === 'fix' && !i.session.waiting ? { ...plainStrip, sentence: tr('Putting right what you found'), busy: true } : plainStrip;
  const needs = needsOf({
    waiting: i.session.waiting,
    keys: i.keys.filter(stillMissing),
    models: i.app.ai && i.app.ai.asks.length > 0 && i.app.ai.allowed.length === 0 ? { usdPerDay: i.app.ai.capUsd } : null,
    mail: i.app.mail?.state === 'ask',
    state,
    unpublished: changesWaiting(i.view, last),
    // A server that does not answer is said by the state itself.
    weekly: stillNeeded(i.run).filter((n) => !(state.fix && n.id.startsWith('down-'))),
  });
  const undo = undoable(i.steps);
  return { state, strip, line, fixing, needs, online, undo };
}
