// The agent's side of a goal (driver.ts): goal_propose (the checks that say when it is done), goal_report (what a round
// did), goal_ask (which way next, for the person to pick) and goal_note (something later rounds should know). On every
// session's own server, as the app's own tools, so Claude Code, Codex, Custom and ACP agents all have them; without a
// goal each says so. A scheduled run or a try of an agent's examples cannot use them.
import { GOAL_MAX_CHECKS, GOAL_MAX_WAYS } from '../../shared/goals.ts';
import { exampleMark } from '../assistants/examples.ts';
import { inRun } from '../automations/tools.ts';
import type { RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { askWay, note, propose, report } from './driver.ts';

const out = (r: { ok: boolean; text: string }): ToolOutput => ({ text: r.text, ...(r.ok ? {} : { isError: true }) });

/** Why this run may not use the goal's tools, or null. */
function refusal(ctx: RunCtx): string | null {
  if (inRun(ctx.deps, ctx)) return 'A scheduled run cannot work on a goal.';
  if (exampleMark(ctx.deps.db, ctx.key)) return 'A try of an agent’s examples cannot work on a goal.';
  return null;
}

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

const CHECK = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['command', 'measure', 'score', 'review', 'you'],
      description:
        'command: a shell command that must end without an error; measure: a command that prints a number that must reach a target; score: the project’s evaluation (Experiments → Evaluations: evaluation_get lists those of your folder) scores the work its sealed way, and it must beat the baseline the user measured by at least gain, beyond the noise of its seeds; when the folder has an evaluation, judge by it with a score check rather than a measure of your own, and never propose its final test; review: a sentence a reviewer must find true in what it is shown, for what no command can decide (what a command can decide, such as files left unchanged or a build that passes, is a command); you: something only the user can confirm.',
    },
    label: { type: 'string', description: 'What it says, in plain words: "Tests pass", "Search p95 latency", "The settings page has a dark mode".' },
    run: { type: 'string', description: 'command, measure: the shell command the app runs with bash in the session’s folder (the project’s own test, type-check, build or benchmark command).' },
    read: { type: 'string', description: 'measure: a regular expression whose first group is the number (its last match counts). Leave it out to read the last number printed.' },
    target: { type: 'object', properties: { op: { type: 'string', enum: ['>=', '<='] }, value: { type: 'number' } }, required: ['op', 'value'], description: 'measure: what the number must reach.' },
    unit: { type: 'string', description: 'measure: shown after the number ("ms").' },
    evaluation: { type: 'string', description: 'score: the evaluation’s id, as evaluation_get gives it. It must have a baseline, which only the user measures.' },
    gain: { type: 'number', description: 'score: how much better than the baseline’s mean it must be, in the score’s own units (0, the default: any gain beyond the noise of its seeds). The app fixes the target from the baseline when the user agrees, and adds the files the evaluation protects to the paths you may not change.' },
    claim: { type: 'string', description: 'review: the sentence the reviewer must find true. It judges from the evidence alone and says no when unsure, so write the sentence about what that evidence can show, and name in evidence the files it needs to see.' },
    evidence: {
      type: 'object',
      properties: { diff: { type: 'boolean', description: 'The whole change since the goal started, with every file that changed named first.' }, files: { type: 'array', items: { type: 'string' }, description: 'Files of the folder (the first 8000 characters of each).' }, run: { type: 'string', description: 'A command whose output it reads.' } },
      description: 'review: what the reviewer looks at (the change since the goal started unless set).',
    },
    timeoutS: { type: 'number', description: 'The most seconds the command may take (600 unless set, 3600 at most); for a score, the most it waits for its score, the queue included (21600, six hours, unless set; 172800 at most).' },
  },
  required: ['kind', 'label'],
};

const PROPOSE: RunTool = {
  name: 'goal_propose',
  description: `Propose the checks that say when this session's goal is done, while the app asks you for them: 1 to ${GOAL_MAX_CHECKS} checks (3 to 7 is best; prefer the project's own test, type-check, build and benchmark commands, and when the folder has an evaluation, a score check by it), the paths you must not change, and limits that fit the job. The app runs every check once to measure where things stand (a score only once the user agrees) and shows the user a card to agree, change or decline them; no round starts before they agree. Call it again to replace the proposal before they agree. Returns what is wrong with the proposal to fix, or that the user sees it now.`,
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The goal in one short sentence, as you read it.' },
      checks: { type: 'array', items: CHECK, description: 'What must hold for the goal to be done.' },
      protect: { type: 'array', items: { type: 'string' }, description: 'Paths you may not change (folders end in "/", * and ** as patterns): the tests, the test data, the checks’ own scripts.' },
      limits: { type: 'object', properties: { rounds: { type: 'number' }, usd: { type: 'number', description: 'Money, in US dollars at API prices.' }, minutes: { type: 'number', description: 'Time at work.' } }, description: 'When the app stops by itself.' },
    },
    required: ['checks'],
  },
  async run(a, ctx) {
    const no = refusal(ctx);
    if (no) return { text: no, isError: true };
    return out(await propose(ctx.deps, ctx.key, a));
  },
};

const REPORT: RunTool = {
  name: 'goal_report',
  description:
    'Say what this round of the goal did and what remains, before you end your turn: the app keeps it with the round, which the user sees in the goal’s rounds, and runs the checks itself when your turn ends (saying it is done changes nothing). With blocked, something only the user can give (a key, a decision, access): the app asks them on a card when your turn ends.',
  inputSchema: {
    type: 'object',
    properties: {
      did: { type: 'string', description: 'What you did this round, in a sentence or two.' },
      remains: { type: 'string', description: 'What you think remains.' },
      blocked: { type: 'string', description: 'Only when you cannot go on without the user: what you need from them.' },
    },
    required: ['did'],
  },
  async run(a, ctx) {
    const no = refusal(ctx);
    if (no) return { text: no, isError: true };
    const did = str(a.did, 4000);
    if (!did) return { text: 'Say what you did (did).', isError: true };
    return out(report(ctx.deps, ctx.key, { did, remains: str(a.remains, 4000) || undefined, blocked: str(a.blocked, 2000) || undefined }));
  },
};

const ASK: RunTool = {
  name: 'goal_ask',
  description: `Ask the user which way the goal should go next, at a turning point: 2 to ${GOAL_MAX_WAYS} clearly different ways, each with why, what it should bring on the checks and what it costs, and your own pick. When your turn ends the user sees a card with the ways to tick; without an answer in the time they set, the app goes on with your pick. If the user asked not to be asked, it says so and you take your pick.`,
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question, in a sentence.' },
      context: { type: 'string', description: 'Where things stand, in a sentence or two.' },
      ways: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, why: { type: 'string' }, expects: { type: 'string', description: 'What it should bring on the checks: "Relevance +0.06 to +0.10".' }, cost: { type: 'string', description: '"about 2 rounds · $1.20".' } },
          required: ['name'],
        },
      },
      pick: { type: 'number', description: 'Your own pick, counted from 1.' },
      why: { type: 'string', description: 'Why you ask, in a sentence.' },
    },
    required: ['question', 'ways', 'pick'],
  },
  async run(a, ctx) {
    const no = refusal(ctx);
    if (no) return { text: no, isError: true };
    const question = str(a.question, 2000);
    const ways = Array.isArray(a.ways) ? a.ways : [];
    const errors: string[] = [];
    if (!question) errors.push('Say what you ask (question).');
    if (ways.length < 2 || ways.length > GOAL_MAX_WAYS) errors.push(`Give 2 to ${GOAL_MAX_WAYS} ways.`);
    const clean = ways.map((w: unknown, i: number) => {
      const o = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>;
      const name = str(o.name, 200);
      if (!name) errors.push(`Way ${i + 1} needs a name.`);
      return { name, ...(str(o.why, 500) ? { why: str(o.why, 500) } : {}), ...(str(o.expects, 500) ? { expects: str(o.expects, 500) } : {}), ...(str(o.cost, 200) ? { cost: str(o.cost, 200) } : {}) };
    });
    const pick = Number(a.pick);
    if (!Number.isInteger(pick) || pick < 1 || pick > clean.length) errors.push(`pick is the number of your own pick, from 1 to ${clean.length || 2}.`);
    if (errors.length) return { text: `Fix these and call goal_ask again:\n- ${errors.join('\n- ')}`, isError: true };
    return out(askWay(ctx.deps, ctx.key, { question, ...(str(a.context, 2000) ? { context: str(a.context, 2000) } : {}), ways: clean, pick: pick - 1, ...(str(a.why, 500) ? { why: str(a.why, 500) } : {}) }));
  },
};

const NOTE: RunTool = {
  name: 'goal_note',
  description: 'Keep something later rounds of the goal should know: a dead end and why, a fact about the project. The app puts it in every round message after this one (the user sees it in the goal too).',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  async run(a, ctx) {
    const no = refusal(ctx);
    if (no) return { text: no, isError: true };
    const text = str(a.text, 1000);
    if (!text) return { text: 'The note is empty.', isError: true };
    return out(note(ctx.deps, ctx.key, text));
  },
};

export const GOAL_TOOLS: RunTool[] = [PROPOSE, REPORT, ASK, NOTE];
export const GOAL_TOOL_NAMES = GOAL_TOOLS.map((t) => t.name);
