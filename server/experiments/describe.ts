// What each experiment is, in words, written in the background: a title, a short description and a category. The
// helper model (Settings → Models) reads a few of the experiment's runs (their names, commands, settings and the
// names of their metrics) and writes the three, so people see what it tests and find it by searching, as
// pages/describe.ts does for pages. One at a time. It happens a minute after a run is submitted to an experiment that
// has none, again when an experiment the helper described has at least doubled (and has 4 or more runs; at most once
// in 6 hours), and once for every experiment without any a little after the app starts. Never over what a person
// or an agent wrote (the page's Write them again asks for that). The runs of a confidential session are read only
// by a helper model that runs on this computer, when there is one.
import type { ExperimentInfo, RunRecord } from '../../shared/experiments.ts';
import { HttpError } from '../auth.ts';
import { confidentialKey } from '../confidential/index.ts';
import type { Deps } from '../features/types.ts';
import { helper, localHelper } from '../helper.ts';
import { categoriesInUse, cleanInfoField, getInfo, listRuns, saveInfo, type StoredInfo } from './records.ts';

type D = Pick<Deps, 'db' | 'broadcast'>;

/** Waits, in milliseconds (a test shortens them). */
export const timing = {
  /** After a run is submitted to an experiment that wants writing. */
  soon: 60_000,
  /** After the app starts, before the experiments without info are written. */
  backfill: 20_000,
  /** An experiment the helper could not write is not tried again for this long. */
  retry: 10 * 60_000,
  /** The helper's writing again of what it wrote, at the soonest. */
  again: 6 * 3_600_000,
};

/** The runs it reads (the newest), the longest command and the most settings and metric names it is shown. */
const RUNS = 12;
const COMMAND = 240;
const SETTINGS = 12;
const METRICS = 10;

const SYSTEM = [
  'You write what an experiment is, so that people and their agents see at a glance what it tests and find it by searching. An experiment is a group of runs (training or evaluation jobs) of one study.',
  'Answer with one JSON object and nothing else: {"title": string, "description": string, "category": string}.',
  'title: at most 8 words, plain and specific: what is trained or evaluated, on what, and what is varied. When the runs use a short code for the experiment (E7, v2), keep it in parentheses at the end.',
  'description: one to three sentences, at most 60 words: what it tests or compares, the model and the data, and the metrics that say how well it does.',
  'category: one to three words naming the area or the task (Language modelling, Retrieval, Vision). Reuse one of the categories already in use when it fits.',
  'Write in the language the runs’ names are in. No markdown.',
].join('\n');

const waiting: string[] = [];
const scheduled = new Set<string>();
const triedAt = new Map<string, number>();
let running = false;
/** Descriptions are written once the app has started (the feature's start), so a test's runs never reach a model; `ask`, a test's stand-in for the helper. */
let enabled = false;
let asker: typeof helper = helper;
export function enableExperimentDescriptions(ask: typeof helper = helper) {
  enabled = true;
  asker = ask;
}

/** Whether the helper may write this experiment's info on its own now: it has none, or the helper's own has grown (and is old enough). */
function wanted(info: StoredInfo | null, runs: number): boolean {
  if (!info) return true;
  return info.by === 'helper' && runs >= 4 && runs >= 2 * Math.max(info.runs, 1) && Date.now() - (info.at ?? 0) >= timing.again;
}

// The runs that score evaluations are not experiments: they are never written about on its own.
const countRuns = (d: D, name: string) => listRuns(d.db, { group: name, limit: 5000, plain: true }).length;

/** A run was submitted to this experiment: it gets its info written soon, when it has none or has grown. */
export function describeAfterSubmit(d: D, name: string | undefined) {
  if (!enabled || !name || scheduled.has(name) || Date.now() - (triedAt.get(name) ?? 0) < timing.retry) return;
  if (!wanted(getInfo(d.db, name), countRuns(d, name))) return;
  scheduled.add(name);
  const t = setTimeout(() => {
    scheduled.delete(name);
    queue(d, name);
  }, timing.soon);
  t.unref?.();
}

/** At start: every experiment without any info, the newest first (at most 30), one after another, after a short wait. */
export function describeBackfill(d: D) {
  if (!enabled) return;
  const t = setTimeout(() => {
    const names: string[] = [];
    for (const r of listRuns(d.db, { limit: 5000, plain: true })) if (r.group && !names.includes(r.group) && !getInfo(d.db, r.group)) names.push(r.group);
    for (const n of names.slice(0, 30)) queue(d, n);
  }, timing.backfill);
  t.unref?.();
}

function queue(d: D, name: string) {
  if (!waiting.includes(name)) waiting.push(name);
  void pump(d);
}

async function pump(d: D) {
  if (running) return;
  running = true;
  try {
    let failures = 0;
    while (waiting.length) {
      const name = waiting.shift()!;
      try {
        // Not when the info has appeared or the experiment is gone meanwhile.
        if (!wanted(getInfo(d.db, name), countRuns(d, name)) || !countRuns(d, name)) continue;
        // Only a model that gave nothing usable counts as a failure: a group skipped (confidential runs without a local helper, nothing to describe, written meanwhile) just moves on.
        const out = { empty: false };
        const got = await describeGroup(d, name, { out });
        if (got) failures = 0;
        else if (out.empty) {
          failures++;
          triedAt.set(name, Date.now());
        }
      } catch (e) {
        failures++;
        triedAt.set(name, Date.now());
        console.warn(`[experiments] description of ${name}: ${(e as Error)?.message ?? e}`);
      }
      // A helper that does not answer is not asked again for each of the rest.
      if (failures >= 3) {
        waiting.length = 0;
        break;
      }
    }
  } finally {
    running = false;
  }
}

// What the helper is shown may carry secrets (a token in a command, a key among the settings): those are left out.
const SECRET_NAME = /token|key|secret|password|passwd|pwd|auth/i;
const VALUE = String.raw`"[^"]*"|'[^']*'|\S*`;

/** A command with the values of secrets taken out: NAME=value words and --flag value pairs whose name says token, key, secret, password or auth. */
export function redactCommand(command: string): string {
  return command
    .replace(new RegExp(String.raw`(^|[\s;&|(])(-{0,2}[A-Za-z_][\w.-]*)=(${VALUE})`, 'g'), (m, pre: string, name: string) => (SECRET_NAME.test(name) ? `${pre}${name}=…` : m))
    .replace(new RegExp(String.raw`(^|\s)(--?[A-Za-z][\w.-]*)(\s+)(?!--)("[^"]*"|'[^']*'|\S+)`, 'g'), (m, pre: string, flag: string, gap: string) => (SECRET_NAME.test(flag) ? `${pre}${flag}${gap}…` : m));
}

/** A setting's value as the helper is shown it: … for one whose name says it is a secret. */
export const redactSetting = (name: string, value: unknown) => (SECRET_NAME.test(name) ? '…' : String(value));

/** What the helper is shown of a run. */
function runLine(r: RunRecord): string {
  const m = r.metrics;
  const rep = new Set(m?.repeated ?? []);
  const quality = /loss|acc|f1|bleu|rouge|nll|bpb|bpc|ppl|perplexity|mrr|ndcg|recall|precision|auc|error|score|reward|wer|cer/i;
  const names = Object.keys(m?.last ?? {});
  const metrics = [...names.filter((k) => rep.has(k) && quality.test(k)), ...names.filter((k) => !rep.has(k) && quality.test(k)), ...names.filter((k) => rep.has(k) && !quality.test(k)), ...names.filter((k) => !rep.has(k) && !quality.test(k))].slice(0, METRICS);
  const settings = Object.entries(r.params ?? {})
    .slice(0, SETTINGS)
    .map(([k, v]) => `${k}=${redactSetting(k, v)}`);
  return [`- ${r.name ?? r.id} (${r.status})`, `  command: ${redactCommand(r.command.replace(/\s+/g, ' ')).slice(0, COMMAND)}`, settings.length ? `  settings: ${settings.join(', ')}` : '', metrics.length ? `  metrics: ${metrics.join(', ')}` : ''].filter(Boolean).join('\n');
}

/** The first {...} in what the model said (it may wrap it in a code block or a sentence), as an object, or null. */
export function firstObject(text: string): Record<string, unknown> | null {
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inStr = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === '\\') i++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, i + 1));
          if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
        } catch {
          /* not this one: look for the next */
        }
        break;
      }
    }
  }
  return null;
}

/** The title, description and category in the helper's answer, tidied; empty ones left out. */
export function parseInfo(raw: string): Pick<ExperimentInfo, 'title' | 'description' | 'category'> {
  const o = firstObject(raw) ?? {};
  const out: Pick<ExperimentInfo, 'title' | 'description' | 'category'> = {};
  for (const k of ['title', 'description', 'category'] as const) {
    const v = cleanInfoField(k, o[k]);
    if (v) out[k] = v;
  }
  return out;
}

/**
 * Has the helper write the experiment's title, description and category now, and keeps them (as written by the
 * helper), telling the pages. Without `force` it leaves alone what is not its to change (see `wanted`) and what is
 * written meanwhile. The info kept, or null when nothing was written (no runs, a confidential experiment and no
 * helper on this computer, or an answer with none of the three). With `force` those throw why.
 */
export async function describeGroup(d: D, name: string, o: { force?: boolean; out?: { empty: boolean } } = {}, ask: typeof helper = asker): Promise<StoredInfo | null> {
  const all = listRuns(d.db, { group: name, limit: 5000, plain: !o.force });
  if (!all.length) {
    if (o.force) throw new HttpError(404, 'There is no experiment with that name: no run has it');
    return null;
  }
  const before = getInfo(d.db, name);
  if (!o.force && !wanted(before, all.length)) return null;
  // A confidential session's runs: only a model on this computer reads them.
  const secret = all.some((r) => r.startedBy?.session && confidentialKey(d.db, r.startedBy.session));
  const local = secret ? localHelper(d.db) : undefined;
  if (local === null) {
    if (o.force) throw new HttpError(409, 'A confidential session started some of these runs: only a helper model on this computer may read them. Pick one in Settings → Models.');
    return null;
  }
  const sample = all.slice(0, RUNS);
  const folders = [...new Set(sample.map((r) => r.cwd))].slice(0, 3);
  const used = categoriesInUse(d.db).slice(0, 30);
  const prompt = [
    `The experiment: ${name}`,
    `${all.length} run${all.length === 1 ? '' : 's'} in all; the ${sample.length === all.length ? '' : 'latest '}${sample.length} newest first:`,
    ...sample.map(runLine),
    '',
    `The runs’ folder: ${folders.join(', ')}`,
    `Categories already in use: ${used.length ? used.join(', ') : '(none yet)'}`,
  ].join('\n');
  let raw: string;
  try {
    raw = await ask(d.db, { system: SYSTEM, prompt, maxTokens: 500, timeoutMs: 120_000, task: 'describing an experiment', ...(local ? { model: local } : {}) });
  } catch (e) {
    if (o.force) throw new HttpError(502, `The helper model did not answer: ${(e as Error)?.message ?? e}`);
    throw e;
  }
  const info = parseInfo(raw);
  if (!info.title && !info.description && !info.category) {
    if (o.out) o.out.empty = true;
    return null;
  }
  // Written meanwhile (by a person or an agent): theirs stays, unless they asked for this.
  if (!o.force && getInfo(d.db, name)?.at !== before?.at) return null;
  const saved = saveInfo(d.db, name, info, 'helper', { runs: all.length });
  d.broadcast({ t: 'feature', id: 'experiments', data: { groups: [name] } });
  return saved;
}
