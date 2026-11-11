// Runs a command inside a memory-capped scope of its own on Linux (systemd-run --user --scope), so that nothing the
// benchmark starts (the scratch server, its agents and what they run, the checkers) can push the machine out of
// memory: past its cap the kernel ends processes in that scope alone, and the rest of the machine goes on. Where
// there is no systemd for the user, the command runs as it is.
import { execFileSync } from 'node:child_process';

let can;
/** Whether this machine can put a command in a scope of its own. */
function scopes() {
  if (can === undefined) {
    try {
      execFileSync('systemd-run', ['--user', '--scope', '--quiet', 'true'], { stdio: 'ignore', timeout: 10_000 });
      can = process.platform === 'linux';
    } catch {
      can = false;
    }
  }
  return can;
}

/** The [command, args] that run `command args` with at most `gb` GB of memory and no swap, at the lowest priority. */
export function capped(command, args, gb) {
  if (!(gb > 0) || !scopes()) return [command, args];
  return ['systemd-run', ['--user', '--scope', '--quiet', '-p', `MemoryMax=${gb}G`, '-p', 'MemorySwapMax=0', '--nice=19', command, ...args]];
}
