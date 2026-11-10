// The `hydor` command's arguments as options: which command, its words, and the options that start or continue a
// session, pick how things show, or say which server to use. Wrong usage is a UsageError (exit code 2).
import { parseArgs } from 'node:util';

export class UsageError extends Error {}

/** The commands `hydor` knows (the maintenance ones in server/cli.ts come before these). */
export const COMMANDS = ['chat', 'run', 'resume', 'sessions', 'show', 'send', 'stop', 'models', 'tiers', 'agents', 'tasks', 'usage', 'status', 'serve', 'open', 'help'] as const;
export type Command = (typeof COMMANDS)[number];

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
}

const OPTIONS = {
  server: { type: 'string' },
  token: { type: 'string' },
  json: { type: 'boolean' },
  'stream-json': { type: 'boolean' },
  'no-color': { type: 'boolean' },
  verbose: { type: 'boolean', short: 'v' },
  quiet: { type: 'boolean', short: 'q' },
  thinking: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  print: { type: 'boolean', short: 'p' },
  agent: { type: 'string' },
  model: { type: 'string', short: 'm' },
  effort: { type: 'string' },
  mode: { type: 'string' },
  as: { type: 'string' },
  cwd: { type: 'string' },
  worktree: { type: 'boolean' },
  cap: { type: 'string' },
  'no-memory': { type: 'boolean' },
  title: { type: 'string' },
  yes: { type: 'boolean', short: 'y' },
  timeout: { type: 'string' },
  continue: { type: 'boolean', short: 'c' },
  limit: { type: 'string', short: 'n' },
  all: { type: 'boolean', short: 'a' },
  browser: { type: 'boolean' },
  version: { type: 'boolean' },
} as const;

/** A positive number from an option, or a UsageError naming it. */
function positive(name: string, v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v.replace(/^\$/, ''));
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--${name} takes a number above 0 (it was “${v}”)`);
  return n;
}

/**
 * The arguments (without node and the script) as options. The first word is the command when it is one of COMMANDS;
 * otherwise the words are a message for the chat (`hydor fix the tests`). -p is short for run.
 */
export function parseArgv(argv: string[]): Opts {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true; strict: true }>>;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    throw new UsageError((e as Error).message.replace(/^.*?: /, '').replace(/\. To specify a positional.*$/s, ''));
  }
  const v = parsed.values;
  const words = parsed.positionals;
  let cmd: Command = 'chat';
  let args = words;
  if (words.length && (COMMANDS as readonly string[]).includes(words[0])) {
    cmd = words[0] as Command;
    args = words.slice(1);
  }
  if (v.print) {
    if (cmd !== 'chat' && cmd !== 'run') throw new UsageError(`-p runs one request: it does not go with ${cmd}`);
    cmd = 'run';
  }
  if (v.version) cmd = 'status';
  const mode = v.yes ? 'full' : v.mode;
  if (v.yes && v.mode && v.mode !== 'full') throw new UsageError('--yes is --mode full: it does not go with another mode');
  if (v.json && v['stream-json']) throw new UsageError('Pick one of --json and --stream-json');
  if (v.continue && cmd !== 'chat' && cmd !== 'resume') throw new UsageError(`--continue goes with the chat, not with ${cmd}`);
  return {
    cmd,
    args,
    server: v.server,
    token: v.token,
    json: !!v.json,
    streamJson: !!v['stream-json'],
    noColor: !!v['no-color'],
    verbose: !!v.verbose,
    quiet: !!v.quiet,
    thinking: !!v.thinking,
    help: !!v.help || cmd === 'help',
    agent: v.agent,
    model: v.model,
    effort: v.effort,
    mode,
    as: v.as,
    cwd: v.cwd,
    worktree: !!v.worktree,
    cap: positive('cap', v.cap),
    noMemory: !!v['no-memory'],
    title: v.title,
    yes: !!v.yes,
    timeout: positive('timeout', v.timeout),
    continue: !!v.continue,
    limit: positive('limit', v.limit),
    all: !!v.all,
    browser: !!v.browser,
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

export const USAGE = `usage: hydor [command] [options]

  hydor [message]                 talk to an agent here, in this folder (the message starts the session)
  hydor -c                        carry on the latest session of this folder
  hydor resume [key]              carry on a session: the one named, or pick from a list
  hydor run <message>             one request, no questions asked: prints the answer and ends (-p is short for it)
  hydor sessions                  the sessions, latest first: what each is doing
  hydor show <key>                a session's conversation
  hydor send <key> <message>      a message to a session (queued when it is working)
  hydor stop <key>                stop a session's turn
  hydor models [program]          the models each program offers
  hydor tiers [set|reset|team|hard]   which model each tier means
  hydor agents                    your agents
  hydor tasks [run <id>]          scheduled tasks, and running one now
  hydor usage                     plan usage and limits
  hydor status                    the server, its version, what is running
  hydor serve                     run the server here, in the foreground
  hydor open [key]                the address of the web app (or of a session in it); --browser opens it

Starting or carrying on a session (chat, run, resume):
  --agent claude|codex|custom|<id>   the program            --model <name>|auto   --effort <level>
  --mode ask|edits|plan|full         what it may do alone   --as <agent>          one of your agents
  --cwd <folder>   --worktree   --cap <dollars>   --no-memory   --title <words>   -y, --yes (--mode full)

run: --json (one object at the end), --stream-json (a line per event), --timeout <seconds>, -q, --quiet
Lists: --json, -n, --limit <n>, -a, --all          Showing: -v (each step's output), --thinking, --no-color
Another computer's Hydor: --server <url> --token <token> (or HYDOR_URL and HYDOR_TOKEN; the token is one
\`hydor access-token\` printed there). Maintenance: set-password, setup-token, access-token, service, update, app.`;
