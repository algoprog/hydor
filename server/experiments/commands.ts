// Rows of a results table by command (rows: "command"): each run's command with its seed taken out, so a command's
// seeds are one row, and a short name for each row by what tells the commands apart.
import type { RunRecord } from '../../shared/experiments.ts';
import { paramsOf, shellWords } from './sweeps.ts';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A command with its seed taken out, as one line: the seed's flag goes with its value (--seed 3, --random_seed=3,
 * seed=3, SEED=3), and where {seed} put it elsewhere (as the run's seedTemplate says, or in a name: runs/seed3)
 * it reads {seed}. `seed`: the run's.
 */
export function seedless(run: Pick<RunRecord, 'command' | 'seedTemplate'>, seed: string | undefined): string {
  let t = (run.seedTemplate ?? run.command).replace(/\\\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  // A run without its template: a bare argument that is the seed, in a command that says "seed" nowhere (as the
  // notices of runs that ended read seeds).
  if (!run.seedTemplate && seed !== undefined && !/seed/i.test(t)) t = t.split(' ').map((w, i, all) => (i > 1 && w === seed && !all[i - 1].startsWith('-') ? '{seed}' : w)).join(' ');
  const value = [run.seedTemplate ? '\\{seed\\}' : '', seed === undefined ? '' : esc(seed)].filter(Boolean).join('|');
  if (!value) return t;
  // A flag or a setting whose name ends in "seed", with this run's seed as its value.
  const flag = new RegExp(`(^| )(?:--?[\\w.-]*seed(?: *= *| +)|\\+{0,2}[\\w./-]*seed=)(["']?)(?:${value})\\2(?= |$|[;&|)])`, 'gi');
  t = t.replace(flag, '$1');
  if (seed !== undefined) t = t.replace(new RegExp(`(seed[_-]?)${esc(seed)}(?![\\d.])`, 'gi'), '$1{seed}');
  return t.replace(/ {2,}/g, ' ').trim();
}

/** The script a command runs (train.py; a module after -m), else its program. */
function scriptOf(command: string): string {
  const words = shellWords(command);
  const m = words.indexOf('-m');
  const script = words.find((w) => /\.(py|sh|jl|r|lua|js|ts|rb|pl)$/i.test(w)) ?? (m >= 0 ? words[m + 1] : undefined) ?? words.find((w) => !/^[A-Za-z_]\w*=/.test(w)) ?? command;
  return script.split('/').pop()!;
}

const MOST = 60;
const cut = (s: string) => (s.length > MOST ? `${s.slice(0, MOST - 1)}…` : s);

const flagWords = (name: string, value: unknown, command: string) => {
  const dashed = command.includes(`--${name}`);
  if (value === true && dashed) return `--${name}`;
  return dashed ? `--${name} ${String(value)}` : `${name}=${String(value)}`;
};

/**
 * A name for each of these commands (all different) by what tells them apart: the script when the scripts differ,
 * else the flags that differ, else the command cut at 60 characters.
 */
export function commandLabels(commands: string[]): string[] {
  const scripts = commands.map(scriptOf);
  const byScript = new Set(scripts).size > 1;
  const flags = commands.map((c) => paramsOf(c));
  const labels = commands.map((command, i): string => {
    // The others this one is not told apart from yet: all of them, or those running the same script.
    const same = commands.flatMap((_, j) => (!byScript || scripts[j] === scripts[i] ? [j] : []));
    if (byScript && same.length === 1) return scripts[i];
    const names = [...new Set(same.flatMap((j) => Object.keys(flags[j])))].filter((k) => new Set(same.map((j) => JSON.stringify(flags[j][k] ?? null))).size > 1);
    const own = names.filter((k) => flags[i][k] !== undefined).map((k) => flagWords(k, flags[i][k], command));
    return own.length ? cut([...(byScript ? [scripts[i]] : []), ...own].join(' ')) : '';
  });
  // Those the flags do not name apart: the command itself, its start and end when the starts are alike.
  const apart = (list: string[], other: (i: number) => string) => {
    const count = new Map<string, number>();
    for (const l of list) count.set(l, (count.get(l) ?? 0) + 1);
    return list.map((l, i) => (!l || count.get(l)! > 1 ? other(i) : l));
  };
  const whole = apart(labels, (i) => cut(commands[i]));
  const ends = apart(whole, (i) => (commands[i].length > MOST ? `${commands[i].slice(0, 28)}…${commands[i].slice(-31)}` : commands[i]));
  const seen = new Map<string, number>();
  return ends.map((l) => {
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    return n > 1 ? `${l} (${n})` : l;
  });
}
