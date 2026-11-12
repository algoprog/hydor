// The Ctx a verb gets when `hydor <area> <verb>` runs at a prompt: lines go to stdout, questions and the picker use
// the terminal (stderr and stdin), the editor is the person's own. Loaded only when a verb runs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import type { Opts } from '../args.ts';
import type { Conn } from '../client.ts';
import type { Look } from '../lines.ts';
import { strWidth, wrap } from '../term.ts';
import { Cancelled, UsageError, type Ctx } from './kit.ts';

/** The editor to run: $VISUAL, $EDITOR, else nano, else vi (the command with its own arguments). */
export function editorCommand(env: NodeJS.ProcessEnv = process.env, has: (cmd: string) => boolean = (c) => spawnSync('sh', ['-c', `command -v ${c}`], { stdio: 'ignore' }).status === 0): string[] {
  const named = (env.VISUAL || env.EDITOR || '').trim();
  if (named) return named.split(/\s+/);
  return [has('nano') ? 'nano' : 'vi'];
}

/** Reads all of stdin. */
async function stdinText(): Promise<string> {
  let s = '';
  process.stdin.setEncoding('utf8');
  for await (const c of process.stdin) s += c;
  return s;
}

export function terminalCtx(conn: Conn, look: Look, o: Opts, usage: string): Ctx {
  const interactive = !!process.stdin.isTTY && !!process.stderr.isTTY;
  const edit = async (text: string, ext = 'md'): Promise<string | null> => {
    if (!interactive) throw new UsageError(`There is no terminal for the editor: give the text with --file <path> (or - for stdin)`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-edit-'));
    const file = path.join(dir, `text.${ext}`);
    try {
      fs.writeFileSync(file, text, { mode: 0o600 });
      const [cmd, ...args] = editorCommand();
      const r = spawnSync(cmd, [...args, file], { stdio: 'inherit' });
      if (r.error) throw new UsageError(`Could not run the editor “${cmd}”: set $EDITOR to one`);
      if (r.status !== 0) throw new Cancelled();
      const next = fs.readFileSync(file, 'utf8');
      return next === text ? null : next;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  return {
    conn,
    look,
    usage,
    interactive,
    fit: !!process.stdout.isTTY,
    o,
    // On a terminal a line wider than the screen breaks at a word (hanging under its own indent), not in the middle of one.
    out: (lines) => {
      const all = Array.isArray(lines) ? lines : [lines];
      const wide = process.stdout.isTTY ? Math.max(20, look.width - 1) : Infinity;
      const fitted = all.flatMap((l) => (strWidth(l) <= wide ? [l] : wrap(l, wide, { indent: /^ */.exec(l)![0] })));
      process.stdout.write(`${fitted.join('\n')}\n`);
    },
    json: (value) => void process.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
    async confirm(question) {
      if (o.yes) return true;
      if (!interactive) throw new UsageError(`${question.replace(/\?$/, '')}: nobody to ask here, so add -y to say yes`);
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
      const answer = await new Promise<string>((resolve) => rl.question(`${question} [y/N] `, resolve));
      rl.close();
      return /^y(es)?$/i.test(answer.trim());
    },
    edit,
    async readText({ file, current = '', ext }) {
      if (file === '-') return (await stdinText()).replace(/\n$/, '');
      if (file) {
        try {
          return fs.readFileSync(path.resolve(file), 'utf8');
        } catch {
          throw new UsageError(`Cannot read ${file}`);
        }
      }
      return edit(current, ext);
    },
    open(url) {
      void import('../commands.ts').then((m) => m.openBrowser(url));
    },
    async pick(title, items) {
      const { pickInTerminal } = await import('../picker.ts');
      return pickInTerminal(title, items, look.p);
    },
    async ask(question, { hidden = false } = {}) {
      if (!interactive) throw new UsageError(`${question.replace(/[:?]\s*$/, '')}: there is no terminal to type it on`);
      // Hidden: what is typed is not echoed (a muted output for readline), only the question and a line break after it.
      const quiet = new Writable({ write: (_c, _e, done) => done() });
      const rl = readline.createInterface({ input: process.stdin, output: hidden ? quiet : process.stderr, terminal: true });
      if (hidden) process.stderr.write(question);
      return new Promise((resolve) => {
        let done = false;
        const end = (v: string | null) => {
          if (done) return;
          done = true;
          if (hidden) process.stderr.write('\n');
          rl.close();
          resolve(v);
        };
        rl.on('SIGINT', () => end(null));
        rl.on('close', () => end(null));
        if (hidden) rl.once('line', (l) => end(l));
        else rl.question(question, (l) => end(l));
      });
    },
  };
}
