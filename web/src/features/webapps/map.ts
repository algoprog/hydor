// What the app's page decides without drawing anything: which stage the app is at, what the next step is and what to ask the agent for
// it, what was decided at each stage, the first words of the brief, how the checks are ordered, and what a person is told before going
// back to an earlier step. Pure, so a script tests it (map-test.ts).
import { WEBAPP_STAGES, isWebAppStage, stopsLaunch, type CheckLine, type CheckState, type WebAppChecks, type WebAppDecision, type WebAppStage, type WebAppStep } from '@shared/webapps';

// ---- the stages -------------------------------------------------------------------------------------------------------------------

export const STAGE_NAMES: Record<WebAppStage, string> = { brief: 'Brief', design: 'Design', build: 'Build', check: 'Check', launch: 'Launch', run: 'Run' };

/** The stage named, when it is one of them (in any case). */
export function currentStage(stage: string | undefined | null): WebAppStage | null {
  const s = (stage ?? '').trim().toLowerCase();
  return isWebAppStage(s) ? s : null;
}

export interface StageRow {
  id: WebAppStage;
  name: string;
  /** done: behind the app; here: where it is; ahead: still to come. */
  state: 'done' | 'here' | 'ahead';
}

/**
 * The Check stage is done only when the checks ran and nothing that stops a launch failed (a line that could not run is said, and is not a failure; of
 * the pages only what could hurt someone stops one). `null`: they have not been read yet, so nothing is claimed.
 */
export const checkDone = (c: Pick<WebAppChecks, 'ran' | 'ok' | 'problem' | 'lines'> | null | undefined): boolean | null =>
  c ? c.ran && !c.problem && !c.lines.some(stopsLaunch) && (c.ok === true || c.lines.some((l) => l.state === 'failed')) : null;

/**
 * The stages with where the app stands (none is `here` when it is at no stage). Given what the checks found (`checks`: checkDone's answer), an app
 * that is past Check is done with it only when its checks ran and nothing failed: otherwise the Check stage is where it is, and the stages after it wait.
 */
export function stageRows(stage: string | undefined | null, checks?: boolean | null): StageRow[] {
  const at = WEBAPP_STAGES.findIndex((s) => s === currentStage(stage));
  const check = WEBAPP_STAGES.indexOf('check');
  const back = at > check && checks !== undefined && checks !== true;
  return WEBAPP_STAGES.map((id, i) => {
    const state: StageRow['state'] = at < 0 ? 'ahead' : back ? (i < check ? 'done' : i === check ? 'here' : 'ahead') : i < at ? 'done' : i === at ? 'here' : 'ahead';
    return { id, name: STAGE_NAMES[id], state };
  });
}

// ---- the next step ---------------------------------------------------------------------------------------------------------------

export interface NextStep {
  /** The stage whose work it is (null: the app has no stage yet). */
  stage: WebAppStage | null;
  /** One plain sentence of what comes next. */
  sentence: string;
  /** The button that asks the agent, and the message it sends. */
  button?: string;
  message?: string;
}

const NEXT: Record<WebAppStage, { sentence: string; button: string; message: string }> = {
  brief: { sentence: 'Next is the brief: what the app is for, who uses it, and what was assumed.', button: 'Write the brief', message: 'Write the brief for this app together with me: show me what you understood and what you assumed.' },
  design: { sentence: 'Next is how it looks.', button: 'See designs', message: 'Show me two or three designs for it to pick from, as small pages of its first screen.' },
  build: { sentence: 'Next is building the first version.', button: 'Build the first version', message: 'Build the first version now, step by step, and show me.' },
  check: { sentence: 'Next is checking that everything works.', button: 'Run the checks', message: 'Run the check, try it on a phone-sized screen, and fix what fails.' },
  launch: { sentence: 'Next is launching it inside this Hydor.', button: 'Launch it', message: 'Launch this app inside Hydor, asking me before anything goes live.' },
  run: { sentence: 'It is launched. See how it is doing: is it up, and its backups.', button: 'How is it doing?', message: 'Tell me how the launched app is doing: is it up, when was its last backup, and what did the weekly check find?' },
};

/** What is next for an app at `stage`: the stage's own work, and a first brief when it has no stage. `checks`: what the last check found. */
export function nextStep(stage: string | undefined | null, decisions?: WebAppDecision[], checks?: Pick<WebAppChecks, 'ran' | 'ok' | 'problem' | 'lines'> | null): NextStep {
  let s = currentStage(stage);
  // Past Check, but a check failed: the next step is still the check (and said so).
  if ((s === 'launch' || s === 'run') && checks && checkDone(checks) === false) s = 'check';
  // A design picked leaves nothing to ask at that stage: the next step is the next stage's.
  if (s === 'design' && (decisions ?? []).some((d) => currentStage(d.stage) === 'design' && d.shape === 'designs')) s = 'build';
  if (!s) return { stage: null, sentence: 'It has not been through the steps yet: start with the brief.', button: NEXT.brief.button, message: NEXT.brief.message };
  if (s === 'check' && checks?.ran && !checks.problem) {
    const failed = checks.lines.filter(stopsLaunch).length;
    const others = checks.lines.filter((l) => l.state === 'failed').length - failed;
    if (!failed && others > 0)
      return { stage: s, sentence: `Nothing stops a launch. ${others} ${others === 1 ? 'thing' : 'things'} on its pages ${others === 1 ? 'is' : 'are'} worth fixing first.`, button: 'Fix them', message: 'Fix what the checks found on the pages, one at a time, and run the checks again.' };
    if (failed > 0) return { stage: s, sentence: `${failed} ${failed === 1 ? 'check failed' : 'checks failed'}: they have to pass before it is ready.`, button: 'Fix them', message: 'Fix the checks that failed, one at a time, and run the checks again.' };
    return { stage: s, sentence: 'Nothing failed. Next is launching it inside this Hydor.', button: NEXT.launch.button, message: NEXT.launch.message };
  }
  return { stage: s, ...NEXT[s] };
}

// ---- what was decided ------------------------------------------------------------------------------------------------------------

/** The decisions made at a stage, oldest first (the newest is last). */
export const decisionsFor = (decisions: WebAppDecision[] | undefined, stage: string | undefined | null): WebAppDecision[] => {
  const s = currentStage(stage);
  return s ? (decisions ?? []).filter((d) => currentStage(d.stage) === s && d.what.trim() !== '') : [];
};

/** All decisions by stage. */
export function decisionsByStage(decisions: WebAppDecision[] | undefined): Record<string, WebAppDecision[]> {
  const out: Record<string, WebAppDecision[]> = {};
  for (const d of decisions ?? []) {
    if (!d.what?.trim()) continue;
    const k = currentStage(d.stage) ?? String(d.stage ?? '').trim().toLowerCase();
    (out[k] ??= []).push(d);
  }
  return out;
}

/** The first paragraph under the brief's first heading (or its first paragraph when it has no heading), cut at a word when long. */
export function briefLead(text: string | undefined | null, max = 360): string {
  const lines = (text ?? '').replace(/\r/g, '').split('\n');
  const heading = (l: string) => /^\s{0,3}#{1,6}\s/.test(l);
  const first = lines.findIndex((l) => l.trim() !== '');
  // Words before any heading are the paragraph; otherwise it is the one under the first heading.
  let i = first < 0 || !heading(lines[first]) ? Math.max(first, 0) : first + 1;
  while (i < lines.length && (lines[i].trim() === '' || heading(lines[i]))) i++;
  const para: string[] = [];
  for (; i < lines.length && lines[i].trim() !== '' && !heading(lines[i]); i++) para.push(lines[i].trim());
  const s = para.join('\n');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).trimEnd()}…`;
}

// ---- the checks ------------------------------------------------------------------------------------------------------------------

const CHECK_ORDER: Record<CheckState, number> = { failed: 0, note: 1, notRun: 2, passed: 3 };

/** Failed lines first, then notes, then those not run, then the passed ones; each group in the check's order. */
export const sortChecks = (lines: CheckLine[]): CheckLine[] => lines.map((l, i) => ({ l, i })).sort((a, b) => CHECK_ORDER[a.l.state] - CHECK_ORDER[b.l.state] || a.i - b.i).map((x) => x.l);

export const checkCounts = (lines: CheckLine[]): Record<CheckState, number> => {
  const c: Record<CheckState, number> = { passed: 0, failed: 0, note: 0, notRun: 0 };
  for (const l of lines) if (l.state in c) c[l.state]++;
  return c;
};

/** The message that asks the agent to fix one line of the checks, naming it by its id and giving its sentence and what it says to do. */
export const fixMessage = (line: Pick<CheckLine, 'id' | 'text' | 'hint'>): string => `Fix this check, ${line.id}: ${line.text.trim()}${line.hint ? ` To do: ${line.hint.trim()}` : ''} Then run the checks again.`;

/** The lines of one state, with the check's own order kept. */
export const linesOf = (lines: CheckLine[], state: CheckState): CheckLine[] => lines.filter((l) => l.state === state);

/** What fixed lines there are: they failed in the run before, and pass now. */
export const fixedLines = (lines: CheckLine[]): CheckLine[] => lines.filter((l) => l.fixed);

// ---- the steps -------------------------------------------------------------------------------------------------------------------

/** Whether the last of these steps is the app's first one (the list holds all of them: it came back shorter than asked for). */
export const listComplete = (steps: WebAppStep[], asked: number): boolean => steps.length < asked;

/** What a person is told before going back to before a step: the files, the steps that stay, the rebuild, and what is saved first. */
export function goBackSentences(unsaved: number): string[] {
  const out = ['The files go back as they were before this step.', 'The steps after it stay in the list. To come forward again, go back to before the step this makes.', 'The app is built again.'];
  if (unsaved > 0) out.unshift(`What you changed since the last step (${unsaved} ${unsaved === 1 ? 'file' : 'files'}) is saved as a step first.`);
  return out;
}

/** "3 files" and "1 file". */
export const filesText = (n: number): string => `${n} ${n === 1 ? 'file' : 'files'}`;
