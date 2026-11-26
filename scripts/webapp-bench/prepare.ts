// Makes what one run needs: a folder for the run with `brief/` (what the builder is given, and nothing else) and `app/` (the empty folder it works in), the prompt to start the
// builder with, and `run.json`, which the person driving the run fills in with what only they know (the cost, the tokens, the time).
//   node scripts/webapp-bench/prepare.ts <brief id, like 07-food-bank> <label> <run folder> [--budget-usd <n>] [--minutes <n>] [--change [--app <the app's folder, built earlier>]] [--model <name>]
// The label names the set of runs this one belongs to (a date, a model, a version of Hydor's guide): the report compares the runs of one label with those of another. Every run
// is given the same words (instruction/build.md, or change.md for a change request). `expect.json` and `expect-change.json` are never copied.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));

export const BRIEFS_DIR = join(HERE, 'briefs');

/** The instruction, with the numbers filled in. */
export function instructionFor(kind: 'build' | 'change', budgetUsd: string, minutes: string): string {
  const template = readFileSync(join(HERE, 'instruction', kind === 'build' ? 'build.md' : 'change.md'), 'utf8');
  return template.replaceAll('{{BUDGET_USD}}', budgetUsd).replaceAll('{{MINUTES}}', minutes);
}

export interface RunFile {
  brief: string;
  /** The set of runs this one belongs to (a date, a model, a version of Hydor's guide). */
  label: string;
  kind: 'build' | 'change';
  model: string | null;
  /** Filled in by the driver. */
  seconds: number | null;
  costUsd: number | null;
  tokens: { input: number | null; output: number | null; cached: number | null };
  budgetUsd: string;
  minutes: string;
  notes: string;
}

/** The budget and time a description should be given, by its group: the small ones and the larger ones (README.md says why). */
export const DEFAULTS = { small: { budgetUsd: '15', minutes: '60' }, larger: { budgetUsd: '45', minutes: '150' } } as const;
export function defaultsFor(brief: string): { budgetUsd: string; minutes: string } {
  try {
    return JSON.parse(readFileSync(join(BRIEFS_DIR, brief, 'expect.json'), 'utf8')).group === 'larger' ? DEFAULTS.larger : DEFAULTS.small;
  } catch {
    return DEFAULTS.small;
  }
}

export function prepare(brief: string, label: string, run: string, o: { budgetUsd: string; minutes: string; change?: boolean; app?: string; model?: string }): { brief: string; app: string } {
  const source = join(BRIEFS_DIR, brief);
  if (!existsSync(join(source, 'brief.md'))) throw new Error(`there is no brief ${brief} in ${BRIEFS_DIR}`);
  const kind = o.change ? 'change' : 'build';
  const folder = join(run, o.change ? 'brief-change' : 'brief');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'INSTRUCTION.md'), instructionFor(kind, o.budgetUsd, o.minutes));
  for (const f of ['brief.md', 'answers.md']) cpSync(join(source, f), join(folder, f));
  if (o.change) cpSync(join(source, 'change.md'), join(folder, 'change.md'));
  cpSync(join(HERE, 'ACCEPTANCE.md'), join(folder, 'ACCEPTANCE.md'));
  // a change is made on a copy of the app that was built, so that what was built can still be judged again
  const app = join(run, o.change ? 'app-change' : 'app');
  if (!o.change) mkdirSync(app, { recursive: true });
  else if (!existsSync(app)) {
    const from = resolve(o.app ?? join(run, 'app'));
    if (!existsSync(from)) throw new Error(`there is no app to change at ${from}`);
    const copied = spawnSync('cp', ['-a', '--reflink=auto', from, app], { stdio: 'ignore' });
    if (copied.status !== 0) throw new Error('the app could not be copied');
  }
  writeFileSync(
    join(run, o.change ? 'PROMPT-change.md' : 'PROMPT.md'),
    `Your working folder is ${o.change ? 'an app built earlier' : 'empty'}. Read \`../${o.change ? 'brief-change' : 'brief'}/INSTRUCTION.md\` (next to your working folder) and do what it says; everything else you are given is in that folder.\n`,
  );
  const file: RunFile = { brief, label, kind, model: o.model ?? null, seconds: null, costUsd: null, tokens: { input: null, output: null, cached: null }, budgetUsd: o.budgetUsd, minutes: o.minutes, notes: '' };
  const name = o.change ? 'run-change.json' : 'run.json';
  if (!existsSync(join(run, name))) writeFileSync(join(run, name), `${JSON.stringify(file, null, 2)}\n`);
  return { brief: folder, app };
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'budget-usd': { type: 'string' }, minutes: { type: 'string' }, change: { type: 'boolean' }, app: { type: 'string' }, model: { type: 'string' } } });
  const [brief, label, run] = positionals;
  if (!brief || !label || !run) {
    console.error('usage: node scripts/webapp-bench/prepare.ts <brief id> <label> <run folder> [--budget-usd <n>] [--minutes <n>] [--change [--app <folder>]] [--model <name>]');
    return 2;
  }
  const made = prepare(brief, label, resolve(run), { budgetUsd: values['budget-usd'] ?? defaultsFor(brief).budgetUsd, minutes: values.minutes ?? defaultsFor(brief).minutes, ...(values.change ? { change: true } : {}), ...(values.app ? { app: values.app } : {}), ...(values.model ? { model: values.model } : {}) });
  console.log(`given to the builder: ${made.brief}\nthe builder works in: ${made.app}\nstart it with: ${join(resolve(run), values.change ? 'PROMPT-change.md' : 'PROMPT.md')}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
