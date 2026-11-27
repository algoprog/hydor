// A project's Research tab: one morning brief of what its agents did and what needs the person, read in one call
// (GET /api/projects/:id/research, server/research/project.ts) and shown by web/src/features/research/ResearchTab.tsx.
// Everything in it comes from what the app keeps already: the sessions that wait, the evaluations and their scores, the
// evolutions, the goals, the findings, the runs, and what sessions cost. The page works out its words (words.ts).
import type { EvalScore } from './evaluations.ts';
import type { FindingVerdict } from './findings.ts';
import type { RunStatus } from './experiments.ts';

/** How far back "Since you last looked" goes on a first visit. */
export const FIRST_LOOK_MS = 7 * 86_400_000;

/** A choice the question offers, answered in place with one tap (a question of one single-choice part). */
export interface AskChoice {
  label: string;
  description?: string;
}

/**
 * Something that waits for the person. `id` stays the same while it waits; `at` is since when. The brief gives them in
 * the order the page shows them: what holds runs back first (runs held at the limit on agents' GPU hours, sealed files
 * that differ), then the rest, newest first.
 */
export type ResearchWait =
  | {
      /** A session of the project asks (a question, an approval, a form): answered in the session. */
      kind: 'ask';
      id: string;
      at: number;
      session: { key: string; title: string };
      /** The question, or what is asked to approve. */
      title: string;
      /** The agent's own words or the rest of the request, short. */
      detail?: string;
      /** The approval's id and, when its choices can be answered in place, the question's id and its choices. */
      approval: string;
      question?: { id: string; choices: AskChoice[] };
    }
  | {
      /** A goal that waits: its checks to agree, something only the person can give, a pause, or a question. */
      kind: 'goal';
      id: string;
      at: number;
      session: { key: string; title: string };
      status: 'agreeing' | 'needs-you' | 'paused' | 'asking';
      title: string;
      reason?: string;
    }
  | {
      /** Runs of the project held because agents have used the GPU hours allowed to them in seven days: the first card. */
      kind: 'held';
      id: string;
      at: number;
      /** The held runs' ids, oldest first. */
      runs: string[];
      ceiling: number;
    }
  | {
      /** A search held at that limit: every score it waits for is held. */
      kind: 'held-search';
      id: string;
      at: number;
      evolution: { id: string; title: string };
      ceiling: number;
    }
  | { kind: 'sealed'; id: string; at: number; evaluation: { id: string; name: string }; changed: number; names: string[] }
  | { kind: 'baseline'; id: string; at: number; evaluation: { id: string; name: string } }
  | {
      /** A goal reached its score check and the evaluation's final test has not run since. */
      kind: 'final';
      id: string;
      at: number;
      evaluation: { id: string; name: string };
      goal: { key: string; title: string };
    }
  | { kind: 'paused'; id: string; at: number; evolution: { id: string; title: string; tried: number; candidates: number }; reason: string };

/** One line of "Since you last looked". `at` is when it happened; the page orders them newest first. */
export type ResearchNews =
  | { kind: 'finding'; id: string; at: number; number: number; verdict: FindingVerdict; statement: string; learned?: string }
  | {
      /** The runs of one experiment that ended since. */
      kind: 'runs';
      id: string;
      at: number;
      /** The experiment's name, as people read it: its title, else its group. `group` is the group, for the link. */
      group?: string;
      experiment?: string;
      total: number;
      done: number;
      failed: number;
      /** Failed too, but started again by an attempt that then finished: not among `failed`. */
      again?: number;
      /** Stopped or lost. */
      other: number;
      /** How many sessions started them. */
      sessions: number;
    }
  | {
      /** Several failed runs of one experiment for the same reason. */
      kind: 'failures';
      id: string;
      at: number;
      group?: string;
      experiment?: string;
      count: number;
      /** oom: they ran out of memory; else `why` is the reason they share. */
      reason: 'oom' | 'other';
      why?: string;
      /** A setting every one of them had and the runs that went well did not. */
      setting?: { name: string; value: string };
    }
  | { kind: 'search'; id: string; at: number; evolution: string; name: string; tried: number; best?: { mean: number; gain: number } }
  | {
      kind: 'goal';
      id: string;
      at: number;
      session: string;
      title: string;
      round: number;
      rounds: number;
      /** The first measured check's number after the round, and its unit. */
      value?: number;
      unit?: string;
      holds: number;
      of: number;
    }
  | {
      /** A score of an evaluation that beat every one before it. */
      kind: 'best';
      id: string;
      at: number;
      evaluation: { id: string; name: string };
      mean: number;
      std?: number;
      seeds: number;
      against?: EvalScore['against'];
    };

/** A score as the chart draws it. */
export interface ResearchPoint {
  id: string;
  at: number;
  mean: number;
  std?: number;
  /** What was measured, in a few words: the commit's title, else the branch. */
  label?: string;
}

/** How an evaluation stands: its scores over time against its baseline, and its final test. */
export interface ResearchEvaluation {
  id: string;
  name: string;
  metric: string;
  better: 'higher' | 'lower';
  seeds: number;
  /** Finished scores of the current seal, oldest first. */
  scores: ResearchPoint[];
  /** When scores failed (current seal, scores only), oldest first. */
  failed: number[];
  baseline?: { mean: number; std?: number; seeds: number; where?: string };
  /** The best score so far, by the direction, and how it stands to the baseline (the evaluation page's own test). */
  best?: ResearchPoint & { against?: EvalScore['against'] };
  /** When it was scored last (a score of any state), for ordering the chips. */
  scoredAt: number;
  final: { state: 'unset' | 'unrun' | 'running' | 'done' | 'failed'; mean?: number; std?: number };
  /** The sealed files differ. */
  changed: boolean;
}

/** A run that goes or waits. */
export interface ResearchRun {
  id: string;
  name: string;
  experiment?: string;
  status: RunStatus;
  why?: string;
  clusterJob?: string;
  /** A waiting run on this computer: about when it should start (ms), where the app can tell. */
  startsAbout?: number;
  gpus: number;
  startedAt?: number;
  /** Running: how far, and when it should end where the Jobs section knows. */
  progress?: { fraction?: number; text?: string };
  endsAt?: number;
}

export interface ResearchWork {
  /** Running and waiting runs, running first. */
  runs: ResearchRun[];
  /** Evolutions at work (running, or starting), and a night one's reason for holding still. */
  searches: { id: string; title: string; tried: number; candidates: number; waits?: string }[];
  /** Goals at work. */
  goals: { key: string; session: string; title: string; round?: number; rounds: number; status: string }[];
}

export interface ResearchFindings {
  held: number;
  didNot: number;
  unclear: number;
  open: number;
}

export interface ResearchWeek {
  /** GPUs times hours, the runs' own, over the last seven days. */
  gpuHours: number;
  /** What the sessions' models cost over those days at API prices; `unpriced`: some model has no known price. */
  usd: number;
  unpriced: boolean;
  /** Sessions with work in those days. */
  sessions: number;
  /** When a limit is set on agents' GPU hours: what all agents' runs on this computer used in seven days (not only this project's), and the limit. */
  agents?: { used: number; ceiling: number };
}

export interface ResearchBrief {
  /** When this was read. */
  at: number;
  /** When the person last looked (null: never: the last seven days are shown). */
  seen: number | null;
  /** The start of what is "since". */
  since: number;
  waiting: ResearchWait[];
  news: ResearchNews[];
  /** The project's evaluations, the one scored last first. */
  evaluations: ResearchEvaluation[];
  findings: ResearchFindings;
  work: ResearchWork;
  week: ResearchWeek;
  /** The project's folder, where an evaluation or a request starts. */
  folder: string;
}

/** What POST /api/projects/:id/research/seen answers. */
export interface ResearchSeen {
  seen: number;
}

/**
 * The scores (by their place in the list, oldest first) that were the best so far when they came: each one that beat
 * every earlier one, by whether higher or lower is better, and the baseline when there is one (a score no better than
 * the baseline is no step of the line above it). A tie is no step.
 */
export function bestSteps(points: readonly { mean: number }[], better: 'higher' | 'lower', baseline?: number): number[] {
  const out: number[] = [];
  let best = baseline;
  points.forEach((p, i) => {
    if (best === undefined || (better === 'higher' ? p.mean > best : p.mean < best)) {
      out.push(i);
      best = p.mean;
    }
  });
  return out;
}
