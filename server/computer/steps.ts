// The screen after each computer step, for its row in the conversation (a small picture, opening large), with where
// the step's actions were on it (N.json beside N.jpg). A step's answer starts with "Computer step N", which the row uses
// to find its picture. The last 200 of a session are kept, and a session's go a month after it was last used, or with
// the session.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cleanMarks, type StepMark } from '../../shared/pointer.ts';
import { config } from '../config.ts';

const DIR = path.join(config.dataDir, 'computer', 'steps');
const KEEP = 200;
const next = new Map<string, number>();

const dirOf = (key: string) => path.join(DIR, crypto.createHash('sha1').update(key).digest('hex').slice(0, 24));

function numbers(dir: string): number[] {
  try {
    return fs
      .readdirSync(dir)
      .map((f) => Number(/^(\d+)\.jpg$/.exec(f)?.[1]))
      .filter((n) => n > 0);
  } catch {
    return [];
  }
}

/** The next step's number for a session (counting on from what is saved). */
export function nextStep(key: string): number {
  let n = next.get(key);
  if (n === undefined) n = Math.max(0, ...numbers(dirOf(key)));
  next.set(key, ++n);
  return n;
}

export function saveStep(key: string, n: number, jpeg: Buffer, marks: StepMark[] = []) {
  const dir = dirOf(key);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, `${n}.jpg`), jpeg, { mode: 0o600 });
    if (marks.length) fs.writeFileSync(path.join(dir, `${n}.json`), JSON.stringify({ marks }), { mode: 0o600 });
    if (n % 25 === 0) for (const old of numbers(dir).filter((x) => x <= n - KEEP)) for (const ext of ['jpg', 'json']) fs.rmSync(path.join(dir, `${old}.${ext}`), { force: true });
  } catch {}
}

/** Where a step acted, from its file (none when it has none, or it cannot be read). */
export function readMarks(file: string | null): StepMark[] {
  try {
    return file ? cleanMarks(JSON.parse(fs.readFileSync(file, 'utf8'))) : [];
  } catch {
    return [];
  }
}

/** A step's picture (jpg), or where it acted on it (json). */
export function stepFile(key: string, n: number, ext: 'jpg' | 'json' = 'jpg'): string | null {
  if (!Number.isInteger(n) || n <= 0) return null;
  const f = path.join(dirOf(key), `${n}.${ext}`);
  return fs.existsSync(f) ? f : null;
}

export function dropSteps(key: string) {
  next.delete(key);
  fs.rmSync(dirOf(key), { recursive: true, force: true });
}

/** Pictures of sessions untouched for a month go. */
export function pruneSteps() {
  const old = Date.now() - 30 * 86400_000;
  try {
    for (const d of fs.readdirSync(DIR)) {
      const p = path.join(DIR, d);
      if (fs.statSync(p).mtimeMs < old) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
}
