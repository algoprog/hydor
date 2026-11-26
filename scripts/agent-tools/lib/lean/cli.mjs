// leancheck: the verdict on a Lean file, as a command (the same as the app's lean_verify: core.mjs).
import os from 'node:os';
import path from 'node:path';
import { findLean, mathlibDir, verifyFile, DEFAULT_TIMEOUT_MS } from './core.mjs';

const HELP = `leancheck - whether the proofs in a Lean file really hold.

Usage:
  leancheck FILE.lean [--theorem NAME[@PIN]]... [--allow-sorry] [--timeout DUR] [--json]

It is ok only when the file builds, nothing is left as \`sorry\`, each theorem named (every theorem and lemma of the
file when none is named) depends only on the standard axioms (propext, Classical.choice, Quot.sound), and Lean's
kernel accepts every declaration of the file and of the project's own files it imports.

Each theorem is shown as name@pin, then what it states, as Lean reads it. The pin is a short hash of that statement
and of the definitions of the file's or project's own that it rests on: it does not change with the proof, spacing,
comments or the names of variables.

Options:
  --theorem NAME   check this theorem (repeatable), by its full name or its last part
  --theorem NAME@PIN
                   check it, and that it still states what it did when it had this pin
  --allow-sorry    do not fail for gaps marked sorry (to check a skeleton; such a theorem is shown as gap); anything
                   else still fails
  --timeout DUR    90s, 15m, 1h (default 10m)
  --json           print the verdict as JSON
  --help

Exit codes:
  0   verified
  1   not verified: errors, gaps, axioms that are not standard
  2   the question is wrong or cannot be put: no such file, no such theorem, a malformed pin, no Lean
  3   a statement changed from its pin
  64  usage

Lean: your own (lake and lean on PATH), else the one Hydor set up (HYDOR_LEAN_DIR names its folder). A goal's command
check can be: leancheck Proofs/Main.lean --theorem main_theorem@PIN`;

function duration(s) {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(s ?? '');
  const ms = m ? ((Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000) : 0;
  return ms > 0 ? ms : null;
}

const NO_LEAN = 'Lean is not set up on this computer: set it up in Hydor’s Settings → General → Lean (proof checker), or install Lean yourself (lake and lean on PATH).';

/** The short report: each theorem, then the verdict on the last line. */
export function report(name, v, allowSorry = false) {
  const lines = [`leancheck ${name}`];
  for (const t of v.theorems) {
    // A gap that --allow-sorry lets through is not "ok": the theorem is not proved.
    const mark = !t.ok ? 'FAIL' : t.axioms.includes('sorryAx') ? 'gap ' : 'ok  ';
    const stated = t.pin ? `@${t.pin} : ${t.statement}` : '';
    lines.push(`  ${mark} ${t.name}${stated}${t.axioms.length ? `  (axioms: ${t.axioms.join(', ')})` : t.ok ? '  (no axioms)' : ''}`);
    if (t.definitions) lines.push(`       rests on its own definitions: ${t.definitions.join(', ')}`);
  }
  for (const e of (v.errors ?? []).slice(0, 10)) lines.push(`  ${e.file ?? name}${e.line ? `:${e.line}:${e.column}` : ''}: ${e.message.split('\n').slice(0, 12).join('\n    ')}`);
  for (const s of v.sorries.slice(0, 20)) lines.push(`  sorry at ${name}:${s.line}:${s.column}`);
  if (v.note) lines.push(`  ${v.note}`);
  if (v.ok) lines.push(allowSorry && v.sorries.length ? `OK, WITH GAPS ALLOWED: ${v.sorries.length} marked sorry, so it is not proved yet (${v.seconds} s)` : `VERIFIED (${v.seconds} s)`);
  else lines.push(`NOT VERIFIED: ${v.why} (${v.seconds} s)`);
  return lines.join('\n');
}

export async function main(argv) {
  const theorems = [];
  let file;
  let allowSorry = false;
  let json = false;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const usage = (why) => {
    process.stderr.write(`leancheck: ${why} (leancheck --help)\n`);
    return 64;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const value = () => inline ?? argv[++i];
    if (flag === '--help' || flag === '-h') {
      process.stdout.write(`${HELP}\n`);
      return 0;
    } else if (flag === '--allow-sorry') allowSorry = true;
    else if (flag === '--json') json = true;
    else if (flag === '--theorem') {
      const v = value();
      if (!v) return usage('--theorem needs a name');
      theorems.push(v);
    } else if (flag === '--timeout') {
      const ms = duration(value());
      if (!ms) return usage('--timeout needs a time such as 90s or 15m');
      timeoutMs = ms;
    } else if (a.startsWith('-')) return usage(`unknown option ${a}`);
    else if (file) return usage('one file at a time');
    else file = a;
  }
  if (!file) return usage('name the Lean file to check');

  const env = { ...process.env };
  const leanDir = env.HYDOR_LEAN_DIR || path.join(env.DATA_DIR || path.join(os.homedir(), '.web-agent'), 'lean');
  const lean = findLean(env, leanDir);
  if (!lean) {
    process.stderr.write(`leancheck: ${NO_LEAN}\n`);
    return 2;
  }
  const stop = new AbortController();
  for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => stop.abort());
  let v;
  try {
    v = await verifyFile(lean, path.resolve(file), { theorems, allowSorry, timeoutMs, signal: stop.signal, mathlib: mathlibDir(leanDir) });
  } catch (e) {
    process.stderr.write(`leancheck: ${e.message}\n`);
    return 2;
  }
  process.stdout.write(`${json ? JSON.stringify(v, null, 2) : report(file, v, allowSorry)}\n`);
  return v.ok ? 0 : v.changed ? 3 : v.missing ? 2 : 1;
}
