// The one place this benchmark knows of Hydor's contract. An app may also carry a `hydor.json` (the file by which Hydor runs an app of any stack, written in
// skills/web-app-builder/references/hydor-contract.md); when it does, collect.ts runs Hydor's own contract checker on it, as a child process, and keeps its lines apart:
// they are never part of the judge's score. Nothing here changes what the judge reads or requires.
//
// The two files overlap (how to start, the variables for the port and the data folder, the address that says it is ready). For the judge, judge.json is the only file read.
// For the checker, hydor.json is the only file read. Where both say something about the same thing and they differ, the first line of the group, `agree`, fails.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JudgeJson } from './acceptance.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Hydor's checker, in this repository: a single file that needs Node and nothing else. */
export const CHECKER = resolve(HERE, '../../skills/web-app-builder/references/hydor-check.mjs');

export type HydorState = 'passed' | 'failed' | 'note' | 'notRun';

export interface HydorLine {
  id: string;
  title: string;
  state: HydorState;
  text: string;
  hint?: string;
}

/** What the group says about one run. `null` in a result means the app has no hydor.json, and nothing was run. */
export interface HydorGroup {
  /** The checker ran to the end and said its lines (false: it could not be run, and the one line says why). */
  ran: boolean;
  /** Every line is passed or a note (`agree` included). */
  ok: boolean;
  passed: number;
  failed: number;
  summary: string;
  lines: HydorLine[];
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What judge.json and hydor.json both say, and differently. Empty when they agree (a thing only one of them says is no disagreement). */
export function disagreements(judge: JudgeJson, hydor: unknown): string[] {
  if (!isObject(hydor)) return [];
  const out: string[] = [];
  const differ = (what: string, a: string | undefined, b: unknown) => {
    if (a !== undefined && typeof b === 'string' && a.trim() !== b.trim()) out.push(`${what}: judge.json says "${a}", hydor.json says "${b}"`);
  };
  differ('how to start', judge.start.command, hydor.start);
  differ('the variable for the port', judge.start.port, hydor.env?.port);
  differ('the variable for the data folder', judge.start.data, hydor.env?.data);
  differ('the build command', judge.build, hydor.build);
  differ('the address that says it is ready', judge.start.ready, hydor.ready);
  return out;
}

const line = (id: string, title: string, state: HydorState, text: string, hint?: string): HydorLine => ({ id, title, state, text, ...(hint ? { hint } : {}) });

export function agreeLine(judge: JudgeJson | null, hydorText: string): HydorLine {
  if (judge === null) return line('agree', 'judge.json and hydor.json say the same', 'notRun', 'judge.json could not be read, so there was nothing to set hydor.json beside.');
  let hydor: unknown;
  try {
    hydor = JSON.parse(hydorText);
  } catch {
    return line('agree', 'judge.json and hydor.json say the same', 'notRun', 'hydor.json is not JSON (the checker says so too).');
  }
  const found = disagreements(judge, hydor);
  return found.length === 0
    ? line('agree', 'judge.json and hydor.json say the same', 'passed', 'Where both say how to start, which variables hold the port and the data folder, the build and the ready address, they say the same.')
    : line('agree', 'judge.json and hydor.json say the same', 'failed', `They disagree: ${found.join('; ')}.`, 'Keep the two files saying the same. The judge runs the app as judge.json says; the contract check runs it as hydor.json says.');
}

/** Runs the checker on an app that has a hydor.json, on ports `from` to `to`, and gives its lines. Nothing is installed or fetched: the checker is one file of this repository. */
export function runChecker(app: string, ports: [number, number], minutes = 12): Promise<{ lines: HydorLine[] } | { error: string }> {
  return new Promise((done) => {
    const child = spawn('nice', ['-n', '19', process.execPath, CHECKER, app, '--json', '--ports', `${ports[0]}-${ports[1]}`], {
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', CUDA_VISIBLE_DEVICES: '', CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), minutes * 60_000);
    child.on('error', (e) => done({ error: `the checker could not be started: ${e.message}` }));
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(out) as { summary: string; lines: { id: string; title: string; state: HydorState; text: string; hint?: string }[] };
        done({ lines: result.lines.map((l) => line(l.id, l.title, l.state, l.text, l.hint)) });
      } catch {
        done({ error: `the checker gave no result${err.trim() ? `: ${err.trim().split('\n').slice(-3).join(' | ').slice(0, 300)}` : ''}` });
      }
    });
  });
}

/** The group for an app: null when it has no hydor.json. */
export async function hydorGroup(app: string, judge: JudgeJson | null, ports: [number, number]): Promise<HydorGroup | null> {
  const file = join(app, 'hydor.json');
  if (!existsSync(file)) return null;
  const agree = agreeLine(judge, readFileSync(file, 'utf8'));
  const ran = await runChecker(app, ports);
  const lines = 'error' in ran ? [agree, line('check', 'Hydor\'s contract check', 'notRun', ran.error)] : [agree, ...ran.lines];
  const failed = lines.filter((l) => l.state === 'failed').length;
  const passed = lines.filter((l) => l.state === 'passed').length;
  return {
    ran: !('error' in ran),
    ok: failed === 0 && lines.every((l) => l.state !== 'notRun'),
    passed,
    failed,
    summary: 'error' in ran ? ran.error : `${lines.length} lines: ${passed} passed, ${failed} failed.`,
    lines,
  };
}

export function renderHydor(g: HydorGroup): string {
  const mark: Record<HydorState, string> = { passed: 'ok  ', failed: 'FAIL', note: 'note', notRun: '??  ' };
  return [`Hydor's contract (not counted in the score): ${g.passed} passed, ${g.failed} failed`, ...g.lines.map((l) => `  ${mark[l.state]} ${l.id}: ${l.text}`)].join('\n');
}
