// What every area of the `hydor` command is made of (plan: docs/plans/terminal-parity.md). An area is a noun with verbs
// (`hydor projects show <project>`): it says what it is (name, summary, its verbs with their arguments and options),
// and each verb's `run` does the work through a Ctx, never writing to process.stdout itself, so the terminal and the
// chat can both run it. This file is only types and small helpers; it imports nothing heavy, and an area's own file
// must stay as light: help and Tab completion read every area's description, so anything heavy (the API's types are
// fine; whole modules are not) is imported inside `run`. Areas never import args.ts (it imports them).
import type { Opts } from '../args.ts';
import type { Conn } from '../client.ts';
import type { Look } from '../lines.ts';
import { renderMarkdown } from '../markdown.ts';
import { columns, pad, strWidth, truncate, type Paint } from '../term.ts';

/** Wrong usage: the message says what to type instead (exit code 2). */
export class UsageError extends Error {}

/** The person backed out (Esc in a picker, a no to a question): nothing more is said, exit code 130. */
export class Cancelled extends Error {}

/** Where an area or a command stands in `hydor help`, in this order. */
export type Group = 'talk' | 'sessions' | 'work' | 'models' | 'tools' | 'this' | 'maintenance';
export const GROUPS: { id: Group; title: string }[] = [
  { id: 'talk', title: 'Talk to an agent' },
  { id: 'sessions', title: 'Sessions' },
  { id: 'work', title: 'Projects and knowledge' },
  { id: 'models', title: 'Models and agents' },
  { id: 'tools', title: 'Tools and connections' },
  { id: 'this', title: 'This Hydor' },
  { id: 'maintenance', title: 'Maintenance' },
];

/** What an argument or an option's value is, so Tab completion can list it (server/tui/areas/loaders.ts); `text` is free. */
export type ArgKind =
  | 'session'
  | 'project'
  | 'agent'
  | 'task'
  | 'app'
  | 'run'
  | 'page'
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'key'
  | 'note'
  | 'experiment'
  | 'machine'
  | 'connection'
  | 'account'
  | 'setting'
  | 'value'
  | 'section'
  | 'settings-section'
  | 'topic'
  | 'route'
  | 'place'
  | 'file'
  | 'dir'
  | 'text';

export interface Arg {
  name: string;
  kind: ArgKind;
  optional?: boolean;
  /** Takes all the words left (a message, a name of several words). */
  rest?: boolean;
  /** Left out on a terminal, a list to pick from is shown (see `choose`); elsewhere it must be given. */
  pick?: boolean;
}

/** An option of a verb (the common ones, --json --yes --server --token --no-color --limit --all --quiet --verbose, are always there). */
export interface OptionSpec {
  type: 'boolean' | 'string' | 'strings';
  short?: string;
  /** How the value reads in help: `<text>`. */
  value?: string;
  desc: string;
  /** What its value is, for Tab completion; or a fixed list of them. */
  kind?: ArgKind;
  values?: string[];
}

/** The options as parsed: a switch is true, a value is its text, `strings` options give a list. */
export type Values = Record<string, string | boolean | (string | boolean)[] | undefined>;

export const str = (v: Values, k: string): string | undefined => (typeof v[k] === 'string' ? (v[k] as string) : undefined);
export const flag = (v: Values, k: string): boolean => v[k] === true;
export const strs = (v: Values, k: string): string[] =>
  Array.isArray(v[k]) ? (v[k] as unknown[]).filter((x): x is string => typeof x === 'string') : typeof v[k] === 'string' ? [v[k] as string] : [];
/** A number from an option, or a UsageError naming it. */
export function num(v: Values, k: string, min = 0): number | undefined {
  const s = str(v, k);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min) throw new UsageError(`--${k} takes a number${min ? ` of ${min} or more` : ''} (it was “${s}”)`);
  return n;
}

export interface Verb {
  /** One word, or two (`files add`); the area's default verb is `list` unless the area says otherwise. */
  name: string;
  aliases?: string[];
  args: Arg[];
  options?: Record<string, OptionSpec>;
  /** One line: help's lists and Tab completion show it. */
  summary: string;
  /** More, a few sentences, for `hydor help <area> <verb>`. */
  help?: string;
  examples?: string[];
  /** Does it; the exit code (nothing is 0). Throw UsageError for wrong usage, and let an ApiError through: the server's message, exit code 1. */
  run(ctx: Ctx, args: string[], values: Values): Promise<number | void>;
}

export interface Area {
  /** The word after `hydor`: a noun. */
  name: string;
  aliases?: string[];
  /** One line for `hydor help`. */
  summary: string;
  /** More for `hydor help <area>`. */
  help?: string;
  group: Group;
  verbs: Verb[];
  /** The verb that runs when none is named (default `list`). */
  default?: string;
  /** The words after the area are the default verb's arguments, never a verb's name (`hydor find some words`). */
  bare?: boolean;
}

/** What a verb works with. The terminal's Ctx is server/tui/areas/terminal.ts; the chat has its own. */
export interface Ctx {
  conn: Conn;
  look: Look;
  /** The verb's usage line, as help shows it: `hydor projects show <project>`. */
  usage: string;
  /** On a terminal (a person is there): lists are cut to the width, and `pick` and `edit` work. */
  interactive: boolean;
  /** Lists are cut to the width. */
  fit: boolean;
  /** The common options: o.json, o.yes, o.limit, o.all, o.quiet… */
  o: Opts;
  /** Writes lines (the one place a verb prints). */
  out(lines: string[] | string): void;
  /** Prints a JSON value, 2-space indented: what a verb does for --json, with what the API returned as it returned it. */
  json(value: unknown): void;
  /** Asks `Remove “x”? [y/N]`: true on --yes; with nobody to ask and no --yes it is a UsageError. */
  confirm(question: string): Promise<boolean>;
  /** Hands text to the person's editor ($VISUAL, $EDITOR, nano, vi) and gives back what came out; null when nothing changed. */
  edit(text: string, ext?: string): Promise<string | null>;
  /** A long text: from `--file <path>` (`-` is stdin), else in the editor on a terminal; null when there is nothing new. */
  readText(spec: { file?: string; current?: string; ext?: string }): Promise<string | null>;
  /** A list to pick from (↑↓, type to filter, Enter); null when they back out. Without a terminal, a UsageError. */
  pick(title: string, items: PickItem[]): Promise<string | null>;
  /** One line typed by the person; `hidden` for a key or a token (never shown, never printed). null when they back out. Without a terminal, a UsageError. */
  ask(question: string, o?: { hidden?: boolean }): Promise<string | null>;
  /** Long text to read: on a terminal through the pager when it is longer than the screen (optional: a Ctx without one prints it with `out`). */
  page?(lines: string[]): Promise<void>;
  /** Opens an address in the person's browser (optional: a Ctx that cannot does nothing). */
  open?(url: string): void;
}

/** Prints long lines through the Ctx's pager when it has one. */
export async function showLong(ctx: Ctx, lines: string[]): Promise<void> {
  if (ctx.page) await ctx.page(lines);
  else ctx.out(lines);
}

export interface PickItem {
  label: string;
  hint?: string;
  value: string;
}

// ---- naming things ---------------------------------------------------------------------------------------------

/**
 * One of a list by what the person typed: its id, its name or title (any case), or the start of either, when only one
 * fits. Several: a UsageError naming up to five. None: a UsageError saying where the list is.
 */
export function pickOne<T>(list: T[], given: string, o: { id: (t: T) => string; names: (t: T) => (string | undefined)[]; what: string; hint?: string }): T {
  const g = given.trim().toLowerCase();
  const nm = (t: T) => o.names(t).filter((n): n is string => !!n);
  const stages: ((t: T) => boolean)[] = [
    (t) => o.id(t).toLowerCase() === g,
    (t) => nm(t).some((n) => n.toLowerCase() === g),
    (t) => o.id(t).toLowerCase().startsWith(g),
    (t) => nm(t).some((n) => n.toLowerCase().startsWith(g)),
  ];
  for (const fits of stages) {
    const hits = g ? list.filter(fits) : [];
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      const shown = hits.slice(0, 5).map((t) => `${nm(t)[0] ?? o.id(t)} (${o.id(t)})`);
      throw new UsageError(`“${given}” fits ${hits.length} ${o.what}s: ${shown.join(', ')}${hits.length > 5 ? ', …' : ''}. Give more of it, or its id.`);
    }
  }
  throw new UsageError(`No ${o.what} “${given}”${o.hint ? `: ${o.hint}` : ''}`);
}

/**
 * One of a list: the one named (as pickOne), or, with nothing given, picked on a terminal. Without a terminal and
 * without a name, a UsageError saying to give it. Backing out is Cancelled.
 */
export async function choose<T>(
  ctx: Ctx,
  list: T[],
  given: string | undefined,
  o: { id: (t: T) => string; names: (t: T) => (string | undefined)[]; what: string; hint?: string; label: (t: T) => string; detail?: (t: T) => string | undefined; title?: string },
): Promise<T> {
  if (given !== undefined && given !== '') return pickOne(list, given, o);
  if (!ctx.interactive) throw new UsageError(`Say which ${o.what}: ${ctx.usage}${o.hint ? ` (${o.hint})` : ''}`);
  if (!list.length) throw new UsageError(`There is no ${o.what} to pick${o.hint ? `: ${o.hint}` : ''}`);
  const value = await ctx.pick(
    o.title ?? `Which ${o.what}?`,
    list.map((t) => ({ label: o.label(t), hint: o.detail?.(t), value: o.id(t) })),
  );
  if (value === null) throw new Cancelled();
  return list.find((t) => o.id(t) === value)!;
}

// ---- looks -----------------------------------------------------------------------------------------------------

/** Free-text columns (titles, snippets, first messages) are cut to this many characters when piped, so one long one does not pad every other row. */
export const FREE_TEXT_CAP = 80;

/**
 * Rows as aligned columns, with an optional dim head. On a terminal (`ctx.fit`) no line is wider than the width minus
 * one: the column `grow` (the one that says what the thing is: its title or name; default the last) keeps its room,
 * and the other columns shrink first, the widest first, down to a few characters. Piped, nothing is cut to the width,
 * but the `free` columns (default: `grow` only) are cut to FREE_TEXT_CAP characters. `indent` puts that many spaces
 * before each line, counted in the width.
 */
export function table(ctx: Pick<Ctx, 'look' | 'fit'>, rows: string[][], o: { head?: string[]; grow?: number; free?: number[]; indent?: number } = {}): string[] {
  const { p, width } = ctx.look;
  const pre = ' '.repeat(o.indent ?? 0);
  const all = o.head ? [o.head.map((h) => p.dim(h)), ...rows] : rows;
  if (!rows.length) return columns(all).map((l) => pre + l);
  const gap = 2;
  const n = Math.max(...all.map((r) => r.length));
  const grow = o.grow ?? n - 1;
  const free = o.free ?? [grow];
  const w: number[] = Array.from({ length: n }, () => 0);
  const cap = (i: number) => (!ctx.fit && free.includes(i) ? FREE_TEXT_CAP : Infinity);
  for (const r of all) r.forEach((c, i) => (w[i] = Math.max(w[i], Math.min(strWidth(c), cap(i)))));
  if (ctx.fit) {
    const limit = width - 1 - pre.length;
    const floor = (i: number) => Math.min(w[i], i === grow ? 12 : 8);
    let total = w.reduce((a, x) => a + x, 0) + gap * (n - 1);
    while (total > limit) {
      // The widest column that is not the main one gives a character; the main one only when none can.
      let pick = -1;
      for (let i = 0; i < n; i++) if (i !== grow && w[i] > floor(i) && (pick < 0 || w[i] > w[pick])) pick = i;
      if (pick < 0 && w[grow] > floor(grow)) pick = grow;
      if (pick < 0) break;
      w[pick]--;
      total--;
    }
  }
  const cut = all.map((r) => r.map((c, i) => (strWidth(c) > w[i] ? truncate(c, w[i]) : c)));
  const lines = columns(cut).map((l) => pre + l);
  return ctx.fit ? lines.map((l) => truncate(l, width - 1)) : lines;
}

/**
 * `name  value` lines, the names dim and aligned; a pair without a value is left out, and a value of several lines
 * hangs under its name.
 */
export function fields(ctx: Pick<Ctx, 'look'>, pairs: [string, string | undefined | null][]): string[] {
  const { p } = ctx.look;
  const shown = pairs.filter((x): x is [string, string] => x[1] !== undefined && x[1] !== null && x[1] !== '');
  const w = Math.max(0, ...shown.map(([n]) => strWidth(n)));
  return shown.flatMap(([n, v]) => v.split('\n').map((l, i) => `${i ? ' '.repeat(w) : p.dim(pad(n, w))}  ${l}`.trimEnd()));
}

/** A long text drawn as Markdown at the terminal's width. */
export const markdown = (ctx: Pick<Ctx, 'look'>, text: string): string[] => renderMarkdown(text, Math.min(ctx.look.width, 100), ctx.look.p);

/** A mark before a state, as `hydor sessions` has: ● on, · off, ● yellow needs you, ✓ done, ✗ error, ● accent busy. */
export function mark(p: Paint, kind: 'on' | 'off' | 'attention' | 'done' | 'error' | 'busy'): string {
  return kind === 'on' ? p.green('●') : kind === 'busy' ? p.accent('●') : kind === 'attention' ? p.yellow('●') : kind === 'done' ? p.green('✓') : kind === 'error' ? p.red('✗') : p.dim('·');
}

// ---- running a verb --------------------------------------------------------------------------------------------

/** What an argument reads as in a usage line: `<project>`, `[project]`, `<words…>`. */
export const argLabel = (a: Arg) => `${a.optional ? '[' : '<'}${a.name}${a.rest ? '…' : ''}${a.optional ? ']' : '>'}`;

/** A verb's usage line: `hydor projects show <project> [options]`. */
export const usageLine = (area: Area, verb: Verb) => ['hydor', area.name, area.bare ? '' : verb.name, ...verb.args.map(argLabel), verb.options ? '[options]' : ''].filter(Boolean).join(' ');

/** Checks the words against the verb's arguments, then runs it. */
export async function runVerb(ctx: Ctx, area: Area, verb: Verb, args: string[], values: Values): Promise<number> {
  const need = verb.args.filter((a) => !a.optional);
  const last = verb.args[verb.args.length - 1];
  for (const [i, a] of need.entries()) {
    if (args.length > i) continue;
    if (a.pick && ctx.interactive && i === args.length) continue;
    throw new UsageError(`Say ${a.kind === 'text' ? `the ${a.name}` : `which ${a.name}`}: ${ctx.usage}`);
  }
  if (args.length > verb.args.length && !last?.rest) throw new UsageError(`Too many words (${args.slice(verb.args.length).join(' ')}): ${ctx.usage}`);
  return (await verb.run(ctx, args, values)) ?? 0;
}
