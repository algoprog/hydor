// `hydor` in a terminal: the commands server/cli.ts hands on (everything but its maintenance commands). It reads the
// arguments, reaches the server (starting this computer's when nothing answers), and runs the chat, a run, or one of
// the listing commands. Exit codes: 0 done, 1 failed or refused, 2 bad usage, 3 an answer is needed (run), 124 timed
// out, 130 interrupted.
import { parseArgv, USAGE, UsageError, type Opts } from './args.ts';
import { ApiError, connect, type Conn } from './client.ts';
import { listCommand } from './commands.ts';
import type { Look } from './lines.ts';
import type { Boot } from './start.ts';
import { colorWanted, makePaint } from './term.ts';

/** A single word that reads like a command but is none: a typo, not a message (`hydor sesions`). */
const looksLikeCommand = (o: Opts, argv: string[]) => o.cmd === 'chat' && argv.filter((a) => !a.startsWith('-')).length === 1 && o.args.length === 1 && /^[a-z][a-z-]{2,}$/.test(o.args[0]) && !argv.includes('chat');

/** Runs a `hydor` command: its exit code. */
export async function tuiCommand(argv: string[]): Promise<number> {
  let o: Opts;
  try {
    o = parseArgv(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${USAGE}\n`);
    return 2;
  }
  if (o.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (looksLikeCommand(o, argv)) {
    process.stderr.write(`Unknown command: ${o.args[0]} (to send it to an agent as a message: hydor chat ${o.args[0]})\n\n${USAGE}\n`);
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
    return await listCommand(conn, o, look);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`${e.message}\n`);
      return 2;
    }
    if (e instanceof ApiError) {
      process.stderr.write(`${e.message}\n`);
      return 1;
    }
    throw e;
  } finally {
    conn?.close();
  }
}

