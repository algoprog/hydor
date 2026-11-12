// `hydor` in a terminal: the commands server/cli.ts hands on (everything but its maintenance commands). It reads the
// arguments, reaches the server (starting this computer's when nothing answers), and runs the chat, a run, or one of
// the listing commands. Exit codes: 0 done, 1 failed or refused, 2 bad usage, 3 an answer is needed (run), 124 timed
// out, 130 interrupted.
import { ALL_COMMAND_NAMES, didYouMean, helpText, parseArgv, USAGE, type Opts } from './args.ts';
import { defaultVerb } from './areas/index.ts';
import { Cancelled, runVerb, UsageError, usageLine } from './areas/kit.ts';
import { ApiError, connect, type Conn } from './client.ts';
import { listCommand } from './commands.ts';
import type { Look } from './lines.ts';
import type { Boot } from './start.ts';
import { colorWanted, makePaint } from './term.ts';

/** A single word that reads like a command but is none: a typo, not a message (`hydor sesions`). */
const looksLikeCommand = (o: Opts, argv: string[]) => o.cmd === 'chat' && argv.filter((a) => !a.startsWith('-')).length === 1 && o.args.length === 1 && /^[a-z][a-z-]{2,}$/.test(o.args[0]) && !argv.includes('chat');

/** An error on stderr: on a terminal in red after a ✗ (its first line; any others as they are), else as it is. */
function fail(message: string, noColor: boolean) {
  const [first, ...more] = message.split('\n');
  if (!process.stderr.isTTY) return void process.stderr.write(`${message}\n`);
  const p = makePaint(colorWanted(process.stderr, noColor));
  process.stderr.write(`${p.red(`✗ ${first}`)}${more.length ? `\n${more.join('\n')}` : ''}\n`);
}

/** The word of a command that is none, with what it may have meant: the message, and whether it suggested a command. */
function unknownCommand(word: string): { text: string; close: boolean } {
  const mean = didYouMean(word, ALL_COMMAND_NAMES, (w) => `hydor ${w}`);
  return { text: `Unknown command: ${word}.${mean}`, close: !!mean };
}

/** Runs a `hydor` command: its exit code. */
export async function tuiCommand(argv: string[]): Promise<number> {
  let o: Opts;
  try {
    o = parseArgv(argv);
  } catch (e) {
    const message = (e as Error).message;
    fail(message, argv.includes('--no-color'));
    if (!message.includes('Did you mean') && !message.includes('To send it') && !message.includes('shows what it takes')) process.stderr.write(`\n${USAGE}\n`);
    return 2;
  }
  if (o.help) {
    // hydor help [command|area [verb]], hydor <command> --help, hydor <area> [verb] --help, or hydor --help.
    const topic = o.route ? o.route.area.name : o.cmd === 'help' ? o.args[0] : o.cmd !== 'chat' || argv.includes('chat') ? o.cmd : undefined;
    const sub = o.route ? (o.route.verb ? o.route.verb.name.split(' ') : []) : o.cmd === 'help' ? o.args.slice(1) : [];
    let text: string | null;
    try {
      text = helpText(makePaint(colorWanted(process.stdout, o.noColor)), topic, sub);
    } catch (e) {
      if (!(e instanceof UsageError)) throw e;
      fail(e.message, o.noColor);
      return 2;
    }
    if (text === null) {
      fail(`${unknownCommand(topic!).text}\nhydor help lists the commands.`, o.noColor);
      return 2;
    }
    process.stdout.write(`${text}\n`);
    return 0;
  }
  if (looksLikeCommand(o, argv)) {
    const word = o.args[0];
    const u = unknownCommand(word);
    if (u.close) fail(`${u.text}\nTo send it to an agent as a message: hydor chat ${word}`, o.noColor);
    else {
      fail(`Unknown command: ${word} (to send it to an agent as a message: hydor chat ${word})`, o.noColor);
      process.stderr.write(`\n${USAGE}\n`);
    }
    return 2;
  }
  const look: Look = { p: makePaint(colorWanted(process.stdout, o.noColor)), width: process.stdout.columns || 100, home: (await import('node:os')).homedir(), verbose: o.verbose, thinking: o.thinking };
  let conn: Conn | null = null;
  try {
    if (o.cmd === 'status' || o.cmd === 'serve') return await listCommand(null, o, look);
    conn = await connect({ server: o.server, token: o.token });
    if (o.cmd === 'chat' || o.cmd === 'run' || o.cmd === 'resume') {
      const boot = await conn.api<Boot>('GET', '/api/bootstrap');
      look.home = boot.home;
      // Something piped in, or asked to run: one request, as `run`.
      const piped = !process.stdin.isTTY && o.cmd === 'chat' && !o.continue;
      if (o.cmd === 'run' || piped) {
        const { runCommand } = await import('./run.ts');
        return await runCommand(conn, o, boot);
      }
      const { chatCommand } = await import('./chat.ts');
      return await chatCommand(conn, o, boot);
    }
    look.home = (await conn.api<{ home: string }>('GET', '/api/bootstrap').catch(() => ({ home: look.home }))).home;
    if (o.route) {
      // A verb of an area (server/tui/areas): its words and options are parsed, it runs with the terminal's Ctx.
      const { terminalCtx } = await import('./areas/terminal.ts');
      const verb = o.route.verb ?? defaultVerb(o.route.area);
      return await runVerb(terminalCtx(conn, look, o, usageLine(o.route.area, verb)), o.route.area, verb, o.args, o.route.values);
    }
    return await listCommand(conn, o, look);
  } catch (e) {
    if (e instanceof Cancelled) return 130;
    if (e instanceof UsageError) {
      fail(e.message, o.noColor);
      return 2;
    }
    if (e instanceof ApiError) {
      fail(e.message, o.noColor);
      return 1;
    }
    throw e;
  } finally {
    conn?.close();
  }
}

