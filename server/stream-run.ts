// A command run with its output handed over as it comes (the updater reads progress from it), and collected, so
// that the end is as execFile gives it: ok when it exits with code 0 (not when it is stopped at its timeout), and
// the text of both streams for what to say when it fails. Only the last part of each stream is kept.
import { spawn } from 'node:child_process';

/** How much of each stream's end is kept. */
const KEEP = 1 << 20;

export interface Streamed {
  ok: boolean;
  out: string;
  err: string;
}

export function runStreamed(
  cmd: string,
  args: string[],
  o: { cwd: string; env: Record<string, string>; timeout: number; onData?: (text: string, stream: 'out' | 'err') => void },
): Promise<Streamed> {
  return new Promise((resolve) => {
    const kept = { out: '', err: '' };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { cwd: o.cwd, env: o.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      return resolve({ ok: false, out: '', err: '' });
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killer);
      resolve({ ok, out: kept.out, err: kept.err });
    };
    let killer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      // One that ignores SIGTERM is not waited for for ever.
      killer = setTimeout(() => child.kill('SIGKILL'), 5000);
    }, o.timeout);
    for (const stream of ['out', 'err'] as const) {
      const s = stream === 'out' ? child.stdout : child.stderr;
      s?.setEncoding('utf8');
      s?.on('data', (text: string) => {
        kept[stream] = (kept[stream] + text).slice(-KEEP);
        // What reads the output never changes how the command ends.
        try {
          o.onData?.(text, stream);
        } catch {}
      });
    }
    child.on('error', () => finish(false));
    child.on('close', (code, signal) => finish(code === 0 && !signal));
  });
}
