// The `hydor` command's arguments as options: which command, its words, and the options that start or continue a
// session, pick how things show, or say which server to use. Wrong usage is a UsageError (exit code 2). One table of
// commands (CMD_TABLE) and one of options (OPTION_TABLE) say everything about them: what parseArgs accepts, the help
// (`hydor help`, `hydor help <command>`), the descriptions Tab completion shows (completion.ts) and the words "did you
// mean" suggests from.
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { areaByName, AREAS, defaultVerb, findVerb } from './areas/index.ts';
import { GROUPS, UsageError, usageLine, argLabel, type Area, type Group, type OptionSpec, type Values, type Verb } from './areas/kit.ts';
import { makePaint, pad, strWidth, wrap, type Paint } from './term.ts';

export { GROUPS, UsageError };
export type { Group };

/** The commands `hydor` knows in the terminal (the maintenance ones in server/cli.ts come before these). */
export const COMMANDS = ['chat', 'run', 'resume', 'sessions', 'show', 'send', 'stop', 'models', 'tiers', 'agents', 'tasks', 'usage', 'status', 'serve', 'help'] as const;
/** A command of COMMANDS, or 'area': a verb of an area (server/tui/areas), with the words in Opts.route. */
export type Command = (typeof COMMANDS)[number] | 'area';

// ---- the table of commands -----------------------------------------------------------------------------------

export interface CommandDef {
  name: string;
  group: Group;
  /** The words it takes, as the usage line shows them: `<key> <message>`. */
  args: string;
  /** The same, shorter, for the lists. */
  short?: string;
  /** One line: what the lists and Tab completion show. */
  desc: string;
  /** What `hydor help <command>` says, in a few sentences. */
  help: string;
  examples: string[];
  /** Its second words (`hydor service install`), each with what it does. */
  subs?: [string, string][];
  /** The options that go with it (long names), shown by `hydor help <command>`. */
  options?: string[];
  /** Shown as `hydor [message]`: the command is the default one, its name may be left out. */
  bare?: boolean;
  /** Run on the host by server/cli.ts, not through the terminal's code. */
  maintenance?: boolean;
}

const SESSION_OPTIONS = ['agent', 'model', 'effort', 'mode', 'as', 'cwd', 'worktree', 'cap', 'no-memory', 'title', 'yes'];

export const CMD_TABLE: CommandDef[] = [
  {
    name: 'chat',
    group: 'talk',
    args: '[message]',
    bare: true,
    desc: 'Talk to an agent here, in this folder',
    help: 'Starts a chat with an agent in this folder. The message, if you give one, is its first request; without one you type it in the chat. Name the command (hydor chat sesions) to send a single word that looks like a command as a message. With -c the chat carries on the latest session of this folder. Words and options go in any order.',
    examples: ['hydor', 'hydor fix the failing tests', 'hydor --mode plan --model opus "plan the move"', 'hydor -c'],
    options: [...SESSION_OPTIONS, 'continue', 'thinking', 'verbose'],
  },
  {
    name: 'resume',
    group: 'talk',
    args: '[key]',
    desc: 'Carry on a session, or pick from a list',
    help: 'Opens a session you had before in the chat: the one named by its key (the start of its id, as hydor sessions shows it), or one you pick from a list. -c carries on the latest session of this folder.',
    examples: ['hydor resume', 'hydor resume 3f9a1c2e', 'hydor resume --continue'],
    options: ['continue', 'thinking', 'verbose'],
  },
  {
    name: 'run',
    group: 'talk',
    args: '<message>',
    desc: 'One request: prints the answer, then ends',
    help: 'Sends one request to an agent without questions and prints its answer when it is done (-p is short for run). Without a message, what is piped in is the request. Exit code 3 means it needs an answer from you, 124 that --timeout passed.',
    examples: ['hydor run "summarize README.md"', 'hydor -p "list the TODOs" --json', 'hydor run "fix the tests" --yes --cap 2', 'cat notes.txt | hydor run'],
    options: [...SESSION_OPTIONS, 'json', 'stream-json', 'timeout', 'quiet', 'verbose', 'thinking'],
  },
  {
    name: 'sessions',
    group: 'sessions',
    args: '',
    desc: 'The latest sessions and what each is doing',
    help: 'Lists your sessions, latest first: its key (what the other commands take), what it is doing (● working, ● needs you, ✓ finished, ✗ error), its title, program and model, folder and when it last changed. Helper sessions an agent started are left out unless you ask for --all.',
    examples: ['hydor sessions', 'hydor sessions -n 5', 'hydor sessions --all --json'],
    options: ['limit', 'all', 'json'],
  },
  {
    name: 'show',
    group: 'sessions',
    args: '<key>',
    desc: 'A session’s conversation',
    help: 'Prints a session’s conversation. The key is the start of its id as hydor sessions shows it (enough of it to tell it from the others).',
    examples: ['hydor show 3f9a1c2e', 'hydor show 3f9a -v', 'hydor show 3f9a --limit 3'],
    options: ['limit', 'verbose', 'thinking', 'json'],
  },
  {
    name: 'send',
    group: 'sessions',
    args: '<key> <message>',
    desc: 'A message to a session (queued when busy)',
    help: 'Sends a message to a session: now when it is free, otherwise after its current turn. Without words, what is piped in is the message.',
    examples: ['hydor send 3f9a "and add a test for it"', 'echo "carry on" | hydor send 3f9a'],
    options: ['json'],
  },
  {
    name: 'stop',
    group: 'sessions',
    args: '<key>',
    desc: 'Stop a session’s turn',
    help: 'Stops what a session’s agent is doing now. The session stays, ready for your next message.',
    examples: ['hydor stop 3f9a1c2e'],
    options: ['json'],
  },
  {
    name: 'models',
    group: 'models',
    args: '[program]',
    desc: 'The models each program offers',
    help: 'Lists the models and modes of Claude Code, Codex and the custom agent, or of the one program named, with the efforts each model takes.',
    examples: ['hydor models', 'hydor models codex --json'],
    subs: [
      ['claude', 'Claude Code'],
      ['codex', 'Codex'],
      ['custom', 'The custom agent'],
    ],
    options: ['json'],
  },
  {
    name: 'tiers',
    group: 'models',
    args: '[set|reset|team|hard]',
    short: '[set|reset|…]',
    desc: 'Which model each tier means',
    help: 'Shows which model Quick, Standard, Best and Max mean for each program, and the team settings. set changes one tier, reset puts them all back, team and hard turn leading with helpers and Max for hard problems on or off.',
    examples: ['hydor tiers', 'hydor tiers set claude best opus --effort high', 'hydor tiers team on', 'hydor tiers reset'],
    subs: [
      ['set', 'Change what a tier means: set <program> <tier> <model>'],
      ['reset', 'Put every tier back to its default'],
      ['team', 'Lead with helpers: on or off'],
      ['hard', 'Max for hard problems: on or off'],
    ],
    options: ['effort', 'json'],
  },
  {
    name: 'agents',
    group: 'models',
    args: '',
    desc: 'Your agents',
    help: 'Lists your agents (the built-in ones first) with their ids: --as takes an id or a name.',
    examples: ['hydor agents', 'hydor --as researcher "find papers on reranking"'],
    options: ['json'],
  },
  {
    name: 'tasks',
    group: 'models',
    args: '[run <id>]',
    desc: 'Scheduled tasks, and running one now',
    help: 'Lists your scheduled tasks with when each runs next and how its last run went. run starts one now and prints the address of its session.',
    examples: ['hydor tasks', 'hydor tasks run daily-brief'],
    subs: [['run', 'Run a task now: run <id>']],
    options: ['json'],
  },
  {
    name: 'usage',
    group: 'models',
    args: '',
    desc: 'Plan usage and limits',
    help: 'Shows how much of each plan’s windows (5 hours, week…) Claude Code and Codex have used here, and when each resets.',
    examples: ['hydor usage', 'hydor usage --json'],
    options: ['json'],
  },
  {
    name: 'status',
    group: 'this',
    args: '',
    desc: 'The server, its version, what is running',
    help: 'Says whether Hydor runs, its version and address, where its data is, whether it is a service, and which sessions are working or need you. --version is the same.',
    examples: ['hydor status', 'hydor status --server https://hydor.example.com --token …'],
    options: ['server', 'token', 'json'],
  },
  {
    name: 'serve',
    group: 'this',
    args: '',
    desc: 'Run the server here, in the foreground',
    help: 'Runs this computer’s Hydor in this terminal until you press Ctrl+C. Other commands start it for you when nothing answers; hydor service install keeps it running in the background instead.',
    examples: ['hydor serve'],
  },
  {
    name: 'help',
    group: 'this',
    args: '[command]',
    desc: 'This help, or one command’s',
    help: 'Shows the commands and options, or one command’s usage, what it does, its options and examples. hydor <command> --help says the same.',
    examples: ['hydor help', 'hydor help sessions', 'hydor tiers --help'],
  },
  {
    name: 'set-password',
    group: 'maintenance',
    args: '',
    maintenance: true,
    desc: 'Reset the web password (asked for here)',
    help: 'Asks for a new password for the web app and sets it. Every browser is signed out, and addresses paused after wrong passwords may sign in again. Run it on the computer Hydor runs on.',
    examples: ['hydor set-password'],
  },
  {
    name: 'setup-token',
    group: 'maintenance',
    args: '',
    maintenance: true,
    desc: 'The one-time token for first setup',
    help: 'Prints the token the web app’s first-time setup page asks for (it says so when a password is set already: set-password resets it).',
    examples: ['hydor setup-token'],
  },
  {
    name: 'access-token',
    group: 'maintenance',
    args: '[name]',
    maintenance: true,
    desc: 'A token for another Hydor to use this one',
    help: 'Prints a new access token. Another computer’s Hydor (Settings → Machines) or hydor --server … --token … can then do all you can here. Give it a name to tell the tokens apart.',
    examples: ['hydor access-token', 'hydor access-token "my laptop"'],
  },
  {
    name: 'service',
    group: 'maintenance',
    args: '<install|uninstall|status|logs>',
    short: '<install|status|…>',
    maintenance: true,
    desc: 'Keep Hydor running as a background service',
    help: 'Runs Hydor as a service of your user (systemd), also while you are logged out. Your data and running agents stay when you uninstall it.',
    examples: ['hydor service install', 'hydor service status', 'hydor service logs'],
    subs: [
      ['install', 'Run Hydor as a service of your user'],
      ['uninstall', 'Remove the service (your data stays)'],
      ['status', 'Whether the service runs'],
      ['logs', 'The service’s latest log lines'],
    ],
  },
  {
    name: 'update',
    group: 'maintenance',
    args: '',
    maintenance: true,
    desc: 'Pull the latest code, build it, restart',
    help: 'Pulls the latest code, installs what changed and builds it, then restarts the service when there is one (running agents carry on). It needs a copy installed from git.',
    examples: ['hydor update'],
  },
  {
    name: 'app',
    group: 'maintenance',
    args: '<command>',
    maintenance: true,
    desc: 'Make and try your apps as files',
    help: 'Works on your apps from the command line: write one as files in any editor and keep it in step, try it on its examples, carry it to another computer as one file. An app is its address or id. Hydor must be running.',
    examples: ['hydor app list', 'hydor app new "Reading list"', 'hydor app try reading-list'],
    subs: [
      ['list', 'Your apps: address, name, folder'],
      ['new', 'Make an app and its folder: new <name> [folder]'],
      ['folder', 'Make an app’s folder: folder <app> [folder]'],
      ['dev', 'Try each change you save on its examples: dev <app>'],
      ['try', 'Try its examples, or one set of answers: try <app>'],
      ['export', 'Save it as one file: export <app> [file]'],
      ['import', 'Install an app file: import <file>'],
    ],
  },
  {
    name: 'completion',
    group: 'maintenance',
    args: '[bash|zsh|fish|install]',
    short: '[shell|install]',
    maintenance: true,
    desc: 'Tab completion for your shell',
    help: 'Prints the Tab completion script for bash, zsh or fish (your shell by default). install sets it up for your shell: it writes the script where the shell finds it and, for zsh and for bash without bash-completion, adds one line to your .zshrc or .bashrc. Open a new terminal after. Running it again changes nothing twice.',
    examples: ['hydor completion install', 'source <(hydor completion bash)', 'hydor completion fish > ~/.config/fish/completions/hydor.fish'],
    subs: [
      ['bash', 'The script for bash'],
      ['zsh', 'The script for zsh'],
      ['fish', 'The script for fish'],
      ['install', 'Set it up for your shell'],
    ],
  },
];

/** A command's entry. */
export const commandDef = (name: string) => CMD_TABLE.find((c) => c.name === name);

/** The maintenance commands (run on the host by server/cli.ts). */
export const MAINTENANCE = CMD_TABLE.filter((c) => c.maintenance).map((c) => c.name);

// ---- the table of options ------------------------------------------------------------------------------------

export interface OptionDef {
  name: string;
  short?: string;
  /** The value it takes, as a usage shows it (`<name>`); none for a switch. */
  value?: string;
  desc: string;
}

export const OPTION_TABLE: OptionDef[] = [
  { name: 'agent', value: '<program>', desc: 'The program: claude, codex, custom or an agent’s id' },
  { name: 'model', short: 'm', value: '<name>', desc: 'A model of that program (hydor models), or auto' },
  { name: 'effort', value: '<level>', desc: 'How hard it thinks: low, medium, high, xhigh or max' },
  { name: 'mode', value: '<mode>', desc: 'What it may do alone: ask, edits, plan or full' },
  { name: 'as', value: '<agent>', desc: 'One of your agents, by id or name (hydor agents)' },
  { name: 'cwd', value: '<folder>', desc: 'The folder it works in (this one by default)' },
  { name: 'worktree', desc: 'Work in a new git worktree of that folder' },
  { name: 'cap', value: '<dollars>', desc: 'Stop the session when it has spent this much' },
  { name: 'no-memory', desc: 'Keep memory out of this session' },
  { name: 'title', value: '<words>', desc: 'The session’s title' },
  { name: 'yes', short: 'y', desc: 'Let it do everything without asking (--mode full)' },
  { name: 'continue', short: 'c', desc: 'Carry on the latest session of this folder' },
  { name: 'print', short: 'p', desc: 'One request, as run' },
  { name: 'timeout', value: '<seconds>', desc: 'run: give up after this long (exit code 124)' },
  { name: 'json', desc: 'Print one JSON document (run: one object at the end)' },
  { name: 'stream-json', desc: 'run: print a JSON line for each event' },
  { name: 'quiet', short: 'q', desc: 'run: print only the answer' },
  { name: 'verbose', short: 'v', desc: 'Show each step’s output' },
  { name: 'thinking', desc: 'Show the agent’s thinking' },
  { name: 'limit', short: 'n', value: '<n>', desc: 'How many to list (show: how many turns)' },
  { name: 'all', short: 'a', desc: 'List helper sessions too' },
  { name: 'browser', desc: 'open: open the address in your browser too' },
  { name: 'server', value: '<url>', desc: 'Another computer’s Hydor (HYDOR_URL)' },
  { name: 'token', value: '<token>', desc: 'Its access token, from hydor access-token there (HYDOR_TOKEN)' },
  { name: 'no-color', desc: 'No colours (NO_COLOR does the same)' },
  { name: 'version', desc: 'Show the version (as hydor status)' },
  { name: 'help', short: 'h', desc: 'Show this help, or a command’s' },
];

/** The options as node:util's parseArgs takes them. */
const OPTIONS: NonNullable<ParseArgsConfig['options']> = Object.fromEntries(OPTION_TABLE.map((o) => [o.name, { type: o.value ? 'string' : 'boolean', ...(o.short ? { short: o.short } : {}) }]));

/** An option by its long name, or its short one. */
export const optionDef = (name: string) => OPTION_TABLE.find((o) => o.name === name || (o.short && o.short === name));

// ---- the areas ------------------------------------------------------------------------------------------------

/** The options every verb of an area takes, besides its own. */
export const COMMON_OPTIONS = ['server', 'token', 'no-color', 'json', 'yes', 'help', 'quiet', 'verbose', 'limit', 'all'];

/** What the words say about an area's verb. */
export interface Route {
  area: Area;
  /** The verb named (none: the area's default runs, and --help shows the area). */
  verb?: Verb;
  /** How many positional words are the area's and the verb's. */
  words: number;
  /** A word after the area that is no verb of it. */
  unknown?: string;
  /** The options as parsed, the verb's own with the common ones. */
  values: Values;
}

/**
 * The area and verb the words begin with (after any common options), or null when they are a command or a message.
 * Only the words are read, not the verb's own options: the verb must follow the area directly. An area named like a
 * command that exists answers only for the verbs it names.
 */
export function routeOf(tokens: string[]): Route | null {
  const pos: string[] = [];
  for (let i = 0; i < tokens.length && pos.length < 3; i++) {
    const t = tokens[i];
    if (t === '--') break;
    if (t.startsWith('-') && t.length > 1) {
      const eq = t.indexOf('=');
      const def = optionDef(t.startsWith('--') ? t.slice(2, eq > 0 ? eq : undefined) : t.slice(1));
      if (!def) break;
      if (def.value && eq < 0) i++;
      continue;
    }
    pos.push(t);
  }
  const area = pos.length ? areaByName(pos[0]) : undefined;
  if (!area) return null;
  const isCommand = (COMMANDS as readonly string[]).includes(area.name);
  const route = (r: Omit<Route, 'values'>): Route => ({ ...r, values: {} });
  if (area.bare) return isCommand ? null : route({ area, words: 1 });
  const hit = findVerb(area, pos.slice(1));
  if (hit) return route({ area, verb: hit.verb, words: 1 + hit.used });
  // An area that is also an older command (`hydor sessions`): the command, unless a word follows that is none of its verbs
  // (`hydor sessions shw`), which gets "did you mean" rather than the list.
  if (isCommand && pos.length < 2) return null;
  return route({ area, words: 1, unknown: pos[1] });
}

/** The options a verb takes: the common ones and its own (which win when they share a name or a short one). */
export function verbOptions(area: Area, verb: Verb | undefined): { name: string; short?: string; spec?: OptionSpec; def?: OptionDef }[] {
  const own = Object.entries((verb ?? defaultVerb(area)).options ?? {}).map(([name, spec]) => ({ name, short: spec.short, spec }));
  const shorts = new Set(own.map((o) => o.short).filter(Boolean));
  const common = OPTION_TABLE.filter((o) => COMMON_OPTIONS.includes(o.name) && !own.some((x) => x.name === o.name)).map((def) => ({ name: def.name, short: def.short && !shorts.has(def.short) ? def.short : undefined, def }));
  return [...own, ...common];
}

/** The same as parseArgs takes them. */
function verbParseOptions(area: Area, verb: Verb | undefined): NonNullable<ParseArgsConfig['options']> {
  return Object.fromEntries(
    verbOptions(area, verb).map((o) => {
      const boolean = o.spec ? o.spec.type === 'boolean' : !o.def?.value;
      return [o.name, { type: boolean ? 'boolean' : 'string', ...(o.spec?.type === 'strings' ? { multiple: true } : {}), ...(o.short ? { short: o.short } : {}) }];
    }),
  );
}

// ---- did you mean --------------------------------------------------------------------------------------------

/** The edit distance between two words: insertions, deletions, substitutions and swapping two neighbours each count one. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * What a mistyped word may have meant: the one word it is the start of, else the closest words within two edits (one
 * for words of four letters or fewer; of the closest, those that start alike, then those nearest in length). None when nothing is close; two when
 * they are equally close.
 */
export function suggest(word: string, candidates: string[]): string[] {
  const w = word.toLowerCase();
  if (!w) return [];
  const starts = candidates.filter((c) => c.toLowerCase().startsWith(w) && c.length > w.length);
  if (w.length >= 2 && starts.length === 1) return starts;
  const max = w.length <= 4 ? 1 : 2;
  const scored = candidates.map((c) => ({ c, n: editDistance(w, c.toLowerCase()), first: c[0].toLowerCase() === w[0] ? 0 : 1, len: Math.abs(c.length - w.length) })).filter((x) => x.n > 0 && x.n <= max);
  if (!scored.length) return [];
  const best = scored.reduce((m, x) => (x.n - m.n || x.first - m.first || x.len - m.len) < 0 ? x : m);
  return scored.filter((x) => x.n === best.n && x.first === best.first && x.len === best.len).map((x) => x.c).slice(0, 2);
}

/** " Did you mean hydor sessions?" (with its leading space), or nothing when no word is close. `fmt` writes each word. */
export function didYouMean(word: string, candidates: string[], fmt: (w: string) => string = (w) => w): string {
  const s = suggest(word, candidates);
  return s.length ? ` Did you mean ${s.map(fmt).join(' or ')}?` : '';
}

/** The words a first word may be: every command, the terminal's and the maintenance ones. */
export const ALL_COMMAND_NAMES = [...CMD_TABLE.map((c) => c.name), ...AREAS.map((a) => a.name).filter((n) => !CMD_TABLE.some((c) => c.name === n))];

/** What a command or an area is, in one line. */
export const describeCommand = (name: string): string => commandDef(name)?.desc ?? areaByName(name)?.summary ?? '';

/** What to say about a wrong second word of a command with second words (hydor service instal): a sentence, then its usage. */
export function subCommandError(cmd: string, sub: string | undefined): string {
  const def = commandDef(cmd);
  const subs = (def?.subs ?? []).map(([s]) => s);
  const usage = `usage: hydor ${cmd} ${subs.join(' | ')}`;
  if (!sub) return usage;
  const label = cmd === 'completion' ? 'shell' : `${cmd} command`;
  return `Unknown ${label}: ${sub}.${didYouMean(sub, subs, (s) => `hydor ${cmd} ${s}`)}\n${usage}`;
}

export interface Opts {
  cmd: Command;
  /** The words after the command (a message, a session's key, a program…). */
  args: string[];
  server?: string;
  token?: string;
  json: boolean;
  streamJson: boolean;
  noColor: boolean;
  verbose: boolean;
  quiet: boolean;
  thinking: boolean;
  help: boolean;
  // Starting or continuing a session.
  agent?: string;
  model?: string;
  effort?: string;
  mode?: string;
  as?: string;
  cwd?: string;
  worktree: boolean;
  cap?: number;
  noMemory: boolean;
  title?: string;
  yes: boolean;
  timeout?: number;
  continue: boolean;
  // Lists and the rest.
  limit?: number;
  all: boolean;
  browser: boolean;
  /** For an area's verb (cmd 'area'): which, and its own options. */
  route?: Route;
}

/** A positive number from an option, or a UsageError naming it. */
function positive(name: string, v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v.replace(/^\$/, ''));
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--${name} takes a number above 0 (it was “${v}”)`);
  return n;
}

/** What node:util says about wrong arguments, in plain words, with a suggestion for a mistyped option. */
function usageMessage(e: Error, names: string[] = OPTION_TABLE.map((o) => o.name)): string {
  const unknown = /Unknown option '(--?[^'=]+)/.exec(e.message);
  if (unknown?.[1].startsWith('--')) {
    const maybe = didYouMean(unknown[1].slice(2), names, (w) => `--${w}`);
    if (maybe) return `Unknown option '${unknown[1]}'.${maybe}`;
  }
  return e.message.replace(/^.*?: /, '').replace(/\. To specify a positional.*$/s, '');
}

/**
 * The arguments (without node and the script) as options. The first word is the command when it is one of COMMANDS;
 * otherwise the words are a message for the chat (`hydor fix the tests`). -p is short for run.
 */
export function parseArgv(argv: string[]): Opts {
  const route = routeOf(argv);
  if (route?.unknown) {
    const mean = didYouMean(route.unknown, route.area.verbs.map((v) => v.name.split(' ')[0]), (w) => `hydor ${route.area.name} ${w}`);
    const said = argv.filter((a) => !a.startsWith('-')).join(' ');
    throw new UsageError(`Unknown ${route.area.name} command: ${route.unknown}.${mean || `\nTo send this to an agent: hydor chat ${said}`}`);
  }
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: argv, options: route ? verbParseOptions(route.area, route.verb) : OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    const message = usageMessage(e as Error, route ? verbOptions(route.area, route.verb).map((o) => o.name) : undefined);
    throw new UsageError(route ? `${message}\nhydor help ${route.area.name}${route.verb ? ` ${route.verb.name}` : ''} shows what it takes.` : message);
  }
  const v = parsed.values;
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : undefined);
  const flag = (k: string) => !!v[k];
  const words = parsed.positionals;
  let cmd: Command = 'chat';
  let args = words;
  if (route) {
    cmd = 'area';
    args = words.slice(route.words);
    route.values = v;
  } else if (words.length && (COMMANDS as readonly string[]).includes(words[0])) {
    cmd = words[0] as Command;
    args = words.slice(1);
  }
  if (flag('print')) {
    if (cmd !== 'chat' && cmd !== 'run') throw new UsageError(`-p runs one request: it does not go with ${cmd}`);
    cmd = 'run';
  }
  if (flag('version')) cmd = 'status';
  const mode = flag('yes') ? 'full' : str('mode');
  if (flag('yes') && str('mode') && str('mode') !== 'full') throw new UsageError('--yes is --mode full: it does not go with another mode');
  if (flag('json') && flag('stream-json')) throw new UsageError('Pick one of --json and --stream-json');
  if (flag('continue') && cmd !== 'chat' && cmd !== 'resume') throw new UsageError(`--continue goes with the chat, not with ${cmd}`);
  return {
    cmd,
    args,
    server: str('server'),
    token: str('token'),
    json: flag('json'),
    streamJson: flag('stream-json'),
    noColor: flag('no-color'),
    verbose: flag('verbose'),
    quiet: flag('quiet'),
    thinking: flag('thinking'),
    help: flag('help') || cmd === 'help',
    agent: str('agent'),
    model: str('model'),
    effort: str('effort'),
    mode,
    as: str('as'),
    cwd: str('cwd'),
    worktree: flag('worktree'),
    cap: positive('cap', str('cap')),
    noMemory: flag('no-memory'),
    title: str('title'),
    yes: flag('yes'),
    timeout: positive('timeout', str('timeout')),
    continue: flag('continue'),
    limit: positive('limit', str('limit')),
    all: flag('all'),
    browser: flag('browser'),
    ...(route ? { route } : {}),
  };
}

/** The program a session runs: claude, codex, or an ACP agent (custom is the app's own, "console"). */
export function programOf(name: string | undefined): { agent: 'claude' | 'codex' | 'acp'; acpAgent?: string } | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  if (n === 'claude' || n === 'claude-code') return { agent: 'claude' };
  if (n === 'codex') return { agent: 'codex' };
  if (n === 'custom' || n === 'console') return { agent: 'acp', acpAgent: 'console' };
  return { agent: 'acp', acpAgent: name.replace(/^acp:/, '') };
}

// ---- help ----------------------------------------------------------------------------------------------------

const WIDTH = 80;

/** What an option reads as in a list: `-m, --model <name>`. */
const optionLabel = (o: OptionDef) => `${o.short ? `-${o.short}, ` : '    '}--${o.name}${o.value ? ` ${o.value}` : ''}`;

/** The same, styled. */
const optionStyled = (o: OptionDef, p: Paint) => `${o.short ? `${p.accent(`-${o.short}`)}, ` : '    '}${p.accent(`--${o.name}`)}${o.value ? ` ${p.dim(o.value)}` : ''}`;

/** Rows of a left part and a text to its right, the text wrapped to the width (or under a left part that is too long). */
function twoColumns(rows: [string, string][], p: Paint, indent = '  ', max = 28, exact = false): string[] {
  const left = exact ? max : Math.min(max, Math.max(...rows.map(([l]) => strWidth(l))));
  const room = WIDTH - indent.length - left - 2;
  const out: string[] = [];
  for (const [l, text] of rows) {
    const lines = wrap(text, room);
    if (strWidth(l) > left) {
      out.push(indent + l, ...lines.map((x) => `${indent}${' '.repeat(left + 2)}${x}`));
    } else {
      out.push(`${indent}${pad(l, left)}  ${lines[0] ?? ''}`.trimEnd(), ...lines.slice(1).map((x) => `${indent}${' '.repeat(left + 2)}${x}`));
    }
  }
  return out.map((l) => l.replace(/\s+$/, ''));
}

/** How a command's row reads in the lists: `hydor show <key>` (the default command as `hydor [message]`). */
const rowLeft = (c: CommandDef, p: Paint) => `hydor ${c.bare ? '' : `${p.accent(c.name)} `}${p.dim(c.short ?? c.args)}`.replace(/ +$/, '');

/** The words of `hydor help`: every command by group, the options, examples, and where to learn more. */
function generalHelp(p: Paint): string[] {
  const out = ['Usage: hydor [command] [options]'];
  const groups = GROUPS.map((g) => {
    const rows: [string, string][] = [];
    for (const c of CMD_TABLE.filter((x) => x.group === g.id)) {
      rows.push([rowLeft(c, p), c.desc]);
      if (c.bare) rows.push([`hydor ${p.accent('-c')}`, 'Carry on this folder’s latest session']);
    }
    // An area named like a command has the command's row.
    for (const a of AREAS.filter((x) => x.group === g.id && !commandDef(x.name))) rows.push([`hydor ${p.accent(a.name)}`, a.summary]);
    return { title: g.title, rows };
  }).filter((g) => g.rows.length);
  const more: [string, string][] = [
    [`hydor ${p.accent('help')} ${p.dim('<command>')}`, 'A command’s usage, options and examples'],
    [`hydor ${p.accent('completion install')}`, 'Tab completion for bash, zsh and fish'],
  ];
  // One width for the left part of every row, so the groups line up.
  const left = Math.max(...[...groups.flatMap((g) => g.rows), ...more].map(([l]) => strWidth(l)));
  for (const g of groups) out.push('', p.bold(g.title), ...twoColumns(g.rows, p, '  ', left, true));
  out.push('', p.bold('Options'));
  out.push(...twoColumns(OPTION_TABLE.filter((o) => o.name !== 'print' && o.name !== 'version').map((o) => [optionStyled(o, p), o.desc] as [string, string]), p, '  ', 26));
  out.push('', p.bold('Examples'));
  out.push(...['hydor fix the failing tests', 'hydor run "summarize README.md" --json', 'hydor sessions', 'hydor send 3f9a "and add a test"', 'hydor tiers set claude best opus'].map((e) => `  ${e}`));
  out.push('', ...wrap('A message that starts with a command’s name goes in quotes (hydor "find the bug in login") or after hydor chat.', WIDTH - 2));
  out.push('', p.bold('More'), ...twoColumns(more, p, '  ', left, true));
  return out;
}

/** One command's help: usage, what it does, its options, its second words, examples. */
function commandHelp(c: CommandDef, p: Paint): string[] {
  const usage = ['hydor', c.bare ? '' : p.accent(c.name), c.args ? p.dim(c.args) : '', c.maintenance ? '' : p.dim('[options]')].filter(Boolean).join(' ');
  const out = [`Usage: ${usage}`, '', ...wrap(c.help, WIDTH - 2)];
  if (c.subs?.length) {
    out.push('', p.bold('Words'));
    out.push(...twoColumns(c.subs.map(([s, d]) => [p.accent(s), d] as [string, string]), p));
  }
  const opts = (c.options ?? []).map(optionDef).filter((o): o is OptionDef => !!o);
  if (opts.length) {
    out.push('', p.bold('Options'));
    out.push(...twoColumns(opts.map((o) => [optionStyled(o, p), o.desc] as [string, string]), p, '  ', 26));
    out.push('', p.dim('  hydor help lists them all (--server, --token, --no-color…).'));
  }
  out.push('', p.bold('Examples'), ...c.examples.map((e) => `  ${e}`));
  return out;
}

/** The rows of a verb in a list: `show <project>` and what it does. */
const verbRow = (v: Verb, p: Paint): [string, string] => [[p.accent(v.name), ...v.args.map((a) => p.dim(argLabel(a)))].join(' '), v.summary];

/** The verbs of an area, the options they share noted, and an example or two of each. */
function areaHelp(a: Area, p: Paint): string[] {
  const out = [`Usage: hydor ${p.accent(a.name)} ${p.dim('[verb] [options]')}`, '', ...wrap(a.help ? `${a.summary}. ${a.help}` : `${a.summary}.`, WIDTH - 2)];
  out.push('', p.bold('Verbs'), ...twoColumns(a.verbs.map((v) => verbRow(v, p)), p, '  ', 34));
  const examples = a.verbs.flatMap((v) => (v.examples ?? []).slice(0, 1)).slice(0, 6);
  if (examples.length) out.push('', p.bold('Examples'), ...examples.map((e) => `  ${e}`));
  out.push('', p.dim(`  hydor help ${a.name} <verb> shows a verb's options and examples.`));
  return out;
}

/** One verb's help: usage, what it does, its options (the common ones named), examples. */
function verbHelp(a: Area, v: Verb, p: Paint): string[] {
  const usage = ['hydor', p.accent(a.name), a.bare ? '' : p.accent(v.name), ...v.args.map((x) => p.dim(argLabel(x))), v.options ? p.dim('[options]') : ''].filter(Boolean).join(' ');
  const out = [`Usage: ${usage}`, '', ...wrap(v.help ? `${v.summary}. ${v.help}` : `${v.summary}.`, WIDTH - 2)];
  const own = Object.entries(v.options ?? {});
  if (own.length) {
    const rows = own.map(([name, o]) => [`${o.short ? `${p.accent(`-${o.short}`)}, ` : '    '}${p.accent(`--${name}`)}${o.value ? ` ${p.dim(o.value)}` : ''}`, o.desc] as [string, string]);
    out.push('', p.bold('Options'), ...twoColumns(rows, p, '  ', 28));
  }
  out.push('', p.dim(`  Also --json, --yes, --server, --token, --no-color: hydor help lists them.`));
  if (v.examples?.length) out.push('', p.bold('Examples'), ...v.examples.map((e) => `  ${e}`));
  return out;
}

/**
 * The help as text (no colours when `p` is plain): the commands and options, or with a command's or an area's name
 * its own (and with a verb after an area's name, the verb's): null when there is no such command or area. A word that
 * is no verb of the area is a UsageError.
 */
export function helpText(p: Paint, topic?: string, sub: string[] = []): string | null {
  if (!topic) return generalHelp(p).join('\n');
  const c = commandDef(topic);
  const a = areaByName(topic);
  if (!c && !a) return null;
  // An area whose words are its one verb's own (`hydor find <words>`) has just that verb's help.
  if (a && a.bare && !c) return verbHelp(a, defaultVerb(a), p).join('\n');
  if (a && sub.length) {
    const hit = findVerb(a, sub);
    if (hit) return verbHelp(a, hit.verb, p).join('\n');
    // The first word of several verbs (`help sessions queue`): those verbs.
    const family = a.verbs.filter((v) => v.name.split(' ')[0] === sub[0]);
    if (family.length) return [`Usage: hydor ${p.accent(a.name)} ${p.accent(sub[0])} ${p.dim('<verb>')}`, '', p.bold('Verbs'), ...twoColumns(family.map((v) => verbRow(v, p)), p, '  ', 34)].join('\n');
    throw new UsageError(`Unknown ${a.name} command: ${sub[0]}.${didYouMean(sub[0], a.verbs.map((x) => x.name.split(' ')[0]), (w) => `hydor ${a.name} ${w}`)}`);
  }
  if (c) {
    const lines = commandHelp(c, p);
    if (a) lines.push('', p.bold('Verbs'), ...twoColumns(a.verbs.map((v) => verbRow(v, p)), p, '  ', 34));
    return lines.join('\n');
  }
  return areaHelp(a!, p).join('\n');
}

/** The usage, in plain text. */
export const USAGE = helpText(makePaint(false))!;
