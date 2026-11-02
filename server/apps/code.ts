// Code steps: a short program in JavaScript (Node) or Python that a template's flow runs as one of its
// steps, in a sandbox of its own (bubblewrap): no network, the system read-only, nothing of the home folder
// or the app's data in sight, and a fresh folder of its own to write in, gone afterwards. The packages its
// template installs (What it needs) are there to import. It gets the values given as `input`; what it
// returns becomes the step's values (an object's fields, else {{id.result}}), and what it prints {{id.printed}}.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Requires } from '../../shared/app-manifest.ts';
import { sandboxAvailable } from '../agent/sandbox.ts';
import { envDir } from './env.ts';

export interface CodeOut {
  values: Record<string, unknown>;
  printed: string;
}

const PRINTED = 20_000;
const RESULT = 1 << 20;

/** The program inside an async function of `input`, so it can await and return; its result goes to a file of its own. */
const jsMain = (code: string) =>
  `import fs from 'node:fs';
const input = JSON.parse(fs.readFileSync('input.json', 'utf8'));
const main = async (input) => {
${code}
};
const out = await main(input);
fs.writeFileSync('result.json', JSON.stringify(out === undefined ? null : out));
`;

const pyMain = (code: string) =>
  `import json
with open('input.json') as f:
    input = json.load(f)
def main(input):
${code
  .split('\n')
  .map((l) => `    ${l}`)
  .join('\n')}
    return None
out = main(input)
with open('result.json', 'w') as f:
    json.dump(out, f, default=str)
`;

/** The read-only places a program needs besides /usr and /etc: the top folders that are links into /usr (or folders). */
function tops(): string[] {
  const out: string[] = [];
  for (const top of ['/bin', '/sbin', '/lib', '/lib32', '/lib64', '/libx32']) {
    try {
      const st = fs.lstatSync(top);
      if (st.isSymbolicLink()) out.push('--symlink', fs.readlinkSync(top), top);
      else if (st.isDirectory()) out.push('--ro-bind', top, top);
    } catch {}
  }
  return out;
}

/** Runs a code step's program and reads what it returned; throws with its last lines when it fails. */
export async function runCode(o: { language: 'javascript' | 'python'; code: string; input: Record<string, unknown>; slug: string; requires?: Requires; seconds: number; signal?: AbortSignal }): Promise<CodeOut> {
  const bwrap = sandboxAvailable();
  if (!bwrap) throw new Error('Code steps run in a sandbox (bubblewrap, bwrap), which this computer lacks');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-code-'));
  try {
    const mounts: string[] = [];
    const ro = (p: string) => fs.existsSync(p) && mounts.push('--ro-bind', p, p);
    const env: Record<string, string> = { HOME: work, PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', TMPDIR: '/tmp' };
    const dir = envDir(o.slug);
    let cmd: string[];
    if (o.language === 'javascript') {
      // Node as this app runs it, wherever it is installed.
      const node = fs.realpathSync(process.execPath);
      ro(path.dirname(path.dirname(node)));
      const modules = path.join(dir, 'node_modules');
      if (o.requires?.node && Object.keys(o.requires.node).length && fs.existsSync(modules)) {
        ro(modules);
        env.NODE_PATH = modules;
      }
      fs.writeFileSync(path.join(work, 'main.mjs'), jsMain(o.code));
      cmd = [node, '--max-old-space-size=512', 'main.mjs'];
    } else {
      // The template's own Python when it installs packages, else this computer's.
      const venv = path.join(dir, '.venv');
      let py = '/usr/bin/python3';
      if (o.requires?.python?.length && fs.existsSync(path.join(venv, 'bin', 'python'))) {
        ro(venv);
        ro(path.dirname(path.dirname(fs.realpathSync(path.join(venv, 'bin', 'python')))));
        py = path.join(venv, 'bin', 'python');
      }
      if (!fs.existsSync(py)) throw new Error('There is no Python here for code steps (python3)');
      fs.writeFileSync(path.join(work, 'main.py'), pyMain(o.code));
      // At most 2 GB of memory (Node keeps to its own heap limit above).
      cmd = ['/usr/bin/prlimit', `--as=${2 << 30}`, '--', py, '-I', 'main.py'];
    }
    fs.writeFileSync(path.join(work, 'input.json'), JSON.stringify(o.input));
    const args = [
      '--unshare-all',
      '--die-with-parent',
      '--new-session',
      '--ro-bind',
      '/usr',
      '/usr',
      '--ro-bind',
      '/etc',
      '/etc',
      ...tops(),
      ...mounts,
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      '--tmpfs',
      '/tmp',
      '--bind',
      work,
      work,
      '--remount-ro',
      '/',
      '--chdir',
      work,
      '--clearenv',
      ...Object.entries(env).flatMap(([k, v]) => ['--setenv', k, v]),
      '--',
      ...cmd,
    ];
    const { code, printed } = await new Promise<{ code: number | null; printed: string }>((resolve, reject) => {
      const p = spawn(bwrap, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      const take = (b: Buffer) => {
        if (out.length < PRINTED * 2) out += b.toString('utf8');
      };
      p.stdout.on('data', take);
      p.stderr.on('data', take);
      let why = '';
      const kill = (reason: string) => {
        why ||= reason;
        p.kill('SIGKILL');
      };
      const timer = setTimeout(() => kill(`It ran past its ${o.seconds} seconds`), o.seconds * 1000);
      const onStop = () => kill('Stopped');
      o.signal?.addEventListener('abort', onStop, { once: true });
      p.on('error', (e) => {
        clearTimeout(timer);
        o.signal?.removeEventListener('abort', onStop);
        reject(e);
      });
      p.on('close', (c) => {
        clearTimeout(timer);
        o.signal?.removeEventListener('abort', onStop);
        if (why) reject(new Error(why));
        else resolve({ code: c, printed: out });
      });
    });
    const last = printed.trim().split('\n').slice(-12).join('\n').slice(-2000);
    if (code !== 0) throw new Error(last ? `It stopped with an error:\n${last}` : `It stopped with an error (exit ${code})`);
    const file = path.join(work, 'result.json');
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (size > RESULT) throw new Error('What it returned is too big (at most 1 MB)');
    const result: unknown = size ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const values = result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : { result };
    return { values: { ...values, printed: printed.slice(0, PRINTED) }, printed };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
