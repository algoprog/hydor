// The tools every session's agent has for Lean: lean_check (a file or a snippet), lean_verify (the verdict a person
// can rely on), lean_search (what the libraries already prove) and lean_setup (the person is asked on a card). Until
// Lean is set up, each answers with one sentence that says so.
//
// Checking a Lean file runs code written in it (#eval can run any program), and the app's tools are called without
// the agent's program asking. So lean_check and lean_verify run as the session's own commands would, never more
// freely: not at all in Plan mode; as a goal's checks run where the session has a sandbox of its own or is
// confidential (server/goals checkRunner: no network); as they are where its mode runs anything without asking; and
// in every other mode, in the app's sandbox (writes kept to the session's folder and the temporary one, no network),
// or, on a computer without one, after the person allowed it for the session on a card.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkFile, LeanProblem, NEEDS_MATHLIB, needsMathlib, scanLean, verifyFile, type CheckOptions, type Lean, type Shell } from '../../scripts/agent-tools/lib/lean/core.mjs';
import { LEAN_SIZE_MB, type LeanState } from '../../shared/lean.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import { sandboxShell } from '../agent/sandbox.ts';
import { modeFamily, neverAsks } from '../children/modes.ts';
import type { RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { checkRunner } from '../goals/driver.ts';
import { confirmChange, modeOf } from '../guide/api.ts';
import { confirmHere } from './confirm.ts';
import { searchLean } from './search.ts';
import { lean, leanState, mathlib, setupLean } from './setup.ts';

export const NOT_SET_UP = 'Lean is not set up on this computer: set it up in Settings → General → Lean (proof checker), or ask the user with lean_setup.';
const PLAN = 'This session only reads (Plan mode, or read-only), and checking a Lean file runs its code: tell the user what you would check instead.';

/** Under the ten minutes some agents give a tool call. */
const DEFAULT_MS = 570_000;

export const LEAN_GUIDE =
  'Lean checks proofs: lean_check a file or a snippet, lean_search before proving something the library may have, lean_verify for the verdict (no errors, no sorry, standard axioms only; it names what each theorem states, with a pin of it, and name@pin holds a proof to the agreed statement). Before proving anything for someone, load the lean-proofs skill: the statement is agreed with them first.';

const failed = (text: string): ToolOutput => ({ text, isError: true });
const json = (x: unknown): string => JSON.stringify(x, null, 1);

const timeOf = (a: Record<string, any>) => (Number(a.minutes) > 0 ? Math.min(Number(a.minutes), 60) * 60_000 : DEFAULT_MS);
const folderOf = (a: Record<string, any>, ctx: RunCtx) => (typeof a.cwd === 'string' && a.cwd.trim() ? path.resolve(ctx.cwd, a.cwd.replace(/^~(?=$|\/)/, os.homedir())) : ctx.cwd);
const fileOf = (a: Record<string, any>, ctx: RunCtx) => path.resolve(folderOf(a, ctx), String(a.file).replace(/^~(?=$|\/)/, os.homedir()));

/** The app's sandbox for a session whose agent would ask before a command: without network where it can cut it. */
const appBox = async (cwd: string): Promise<Shell | undefined> => (await sandboxShell(cwd, 'auto', true)) ?? (await sandboxShell(cwd, 'auto', false));
let box: (cwd: string) => Promise<Shell | undefined> = appBox;
/** For tests: a sandbox of their own (or none); null puts the app's back. */
export const setLeanSandboxForTests = (b: ((cwd: string) => Promise<Shell | undefined>) | null) => void (box = b ?? appBox);

/** Sessions whose person allowed checking where there is no sandbox (until the app restarts). */
const allowed = new Set<string>();

async function allow(ctx: RunCtx): Promise<string | null> {
  if (allowed.has(ctx.key)) return null;
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return 'Nobody can allow it now (the session is not running in the app).';
  const card: ApprovalRequest = {
    id: `lean-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'other',
    title: 'Check Lean files in this session?',
    detail: 'Checking a Lean file can run programs written in it, and this computer has no sandbox to keep them in. Allow it for the rest of this session only if you trust the files the agent checks.',
    prose: true,
    options: [
      { id: 'accept', label: 'Allow for this session', style: 'primary' },
      { id: 'deny', label: 'Don’t', style: 'default' },
    ],
    createdAt: Date.now(),
  };
  const limit = AbortSignal.timeout(DEFAULT_MS);
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit });
  if (!answer) return 'The user did not answer the card. Ask them in your reply whether you may check Lean files.';
  if (answer.decision !== 'accept' && answer.decision !== 'always') return 'The user said no: nothing was checked.';
  allowed.add(ctx.key);
  return null;
}

/** How this session's check runs: through a sandbox, or as it is; or why it does not. */
async function runAs(ctx: RunCtx): Promise<{ shell?: Shell } | { no: string }> {
  const own = await checkRunner(ctx.deps, ctx.key, ctx.cwd);
  if (own.noRun) return { no: `Lean can't run here: ${own.noRun}.` };
  if (own.shell) return { shell: own.shell };
  if (neverAsks(modeFamily(ctx.agent, ctx.acpAgent), ctx.deps.sessions.adapterByRun(ctx.runId)?.state.mode)) return {};
  const shell = await box(ctx.cwd).catch(() => undefined);
  if (shell) return { shell };
  const no = await allow(ctx);
  return no ? { no } : {};
}

const SANDBOXED = 'Checked in a sandbox: it writes only in the session’s folder and the temporary one, and has no network. A project whose libraries are not fetched yet needs that done in a terminal first.';

/** Lean, and how this session may run it; or the answer that says why not. */
async function ready(a: Record<string, any>, ctx: RunCtx): Promise<{ lean: Lean; opts: CheckOptions } | { no: ToolOutput }> {
  const l = lean();
  if (!l) return { no: failed(NOT_SET_UP) };
  if (modeOf(ctx) === 'read-only') return { no: failed(PLAN) };
  const how = await runAs(ctx);
  if ('no' in how) return { no: failed(how.no) };
  return { lean: l, opts: { timeoutMs: timeOf(a), signal: ctx.signal, shell: how.shell, mathlib: mathlib() } };
}

const problem = (e: unknown): ToolOutput => failed(e instanceof LeanProblem ? e.message : `Lean could not be run: ${(e as Error).message}`);

const CHECK: RunTool = {
  name: 'lean_check',
  description:
    'Check Lean 4 code: give a file (in a Lake project its imports are built first) or a snippet (code). Returns { ok, errors, warnings, info, sorries, seconds }: positions as Lean gives them (line from 1, column from 0), the goals of "unsolved goals" whole, and info for what #check, trace_state, exact? and apply? say. ok means it compiles, which with sorries is not a proof: lean_verify gives the verdict. A snippet that imports Mathlib needs Mathlib set up (lean_setup { mathlib: true }). A Lake project of its own that requires Mathlib keeps its own copy: until that is fetched (`lake exe cache get` in the project, about 8 GB) nothing in it is run, and the answer says so.',
  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'A .lean file (relative to the session’s folder, or cwd).' },
      code: { type: 'string', description: 'A snippet to check instead of a file, imports and all.' },
      cwd: { type: 'string', description: 'The folder file is relative to (default: the session’s).' },
      minutes: { type: 'number', description: 'Time limit (default about 10; a project’s first build is slow).' },
    },
  },
  async run(a, ctx) {
    const code = typeof a.code === 'string' && a.code.trim() ? a.code : null;
    const file = typeof a.file === 'string' && a.file.trim() ? a.file : null;
    const r = await ready(a, ctx);
    if ('no' in r) return r.no;
    if (!code === !file) return failed('Give a file, or a snippet as code (one of the two).');
    let dir: string | null = null;
    try {
      let target: string;
      if (code) {
        if (needsMathlib(scanLean(code).imports) && !r.opts.mathlib) return failed(NEEDS_MATHLIB);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-lean-snippet-'));
        target = path.join(dir, 'Snippet.lean');
        fs.writeFileSync(target, code.endsWith('\n') ? code : `${code}\n`);
      } else target = fileOf(a, ctx);
      const x = await checkFile(r.lean, target, { ...r.opts, snippet: !!code });
      const gaps = x.sorries.length;
      const note = x.ok ? (gaps ? `It compiles, with ${gaps} gap${gaps === 1 ? '' : 's'} marked sorry: not a proof yet.` : '') : r.opts.shell ? SANDBOXED : '';
      return json({ ...x, ...(note ? { note } : {}) });
    } catch (e) {
      return problem(e);
    } finally {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

const VERIFY: RunTool = {
  name: 'lean_verify',
  description:
    'The verdict on proofs in a Lean 4 file, to report as it is. ok only when the file builds, nothing is left as sorry, each theorem named (all theorems and lemmas of the file when none is named) depends only on the standard axioms (propext, Classical.choice, Quot.sound), and Lean’s kernel accepts every declaration. Returns { ok, why?, theorems: [{ name, axioms, ok, statement, pin, definitions? }], changed?, missing?, sorries, note?, seconds }. statement is what the theorem states, as Lean reads it, and pin a short hash of it and of the definitions of the file’s or project’s own that it rests on (listed in definitions); both come even while the proof is still sorry. Name a theorem as name@pin to check as well that it still states what it did when it had that pin: a changed statement is not ok, why says so with the statement as it is now, and changed lists it. It does not say whether the statement means what the person meant: agree that with them first (the lean-proofs skill).',
  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'The .lean file (relative to the session’s folder, or cwd).' },
      theorems: { type: 'array', items: { type: 'string' }, description: 'Theorem names to check (default: every theorem and lemma in the file). name@pin also checks that the statement is the pinned one.' },
      cwd: { type: 'string', description: 'The folder file is relative to (default: the session’s).' },
      minutes: { type: 'number', description: 'Time limit (default about 10).' },
    },
    required: ['file'],
  },
  async run(a, ctx) {
    const r = await ready(a, ctx);
    if ('no' in r) return r.no;
    if (typeof a.file !== 'string' || !a.file.trim()) return failed('Name the Lean file to verify.');
    try {
      const theorems = Array.isArray(a.theorems) ? a.theorems.map(String) : [];
      return json(await verifyFile(r.lean, fileOf(a, ctx), { ...r.opts, theorems }));
    } catch (e) {
      return problem(e);
    }
  },
};

const SEARCH: RunTool = {
  name: 'lean_search',
  description:
    'Find theorems Lean’s libraries already have (Mathlib and core), through Loogle (a name such as Nat.add_comm, a pattern such as _ + _ = _ + _, a type with arrows, a part of a name in quotes) and LeanSearch (ordinary words: "square root of two is irrational"). LeanSearch is asked every query, Loogle only one that can be a name, a pattern or a type. Both are public services on the web, so the query leaves this computer. Returns { from, hits, note? }: up to 10 hits { name, type, module, doc?, from, url? } (url: the lemma’s page in Mathlib’s documentation), from the services those hits came from, and a note when a service failed. The services index a recent Mathlib, so a name may not be in the one here: confirm: true checks the names against the Lean and Mathlib installed here and gives each hit here: true | false. It takes several seconds and needs Mathlib set up: worth it before you build a proof on a lemma, not for looking around.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'A name, a pattern, a type or ordinary words.' },
      confirm: { type: 'boolean', description: 'Also check the names found against the Lean and Mathlib installed here (several seconds). Off unless asked.' },
    },
    required: ['query'],
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(a, ctx) {
    const l = lean();
    if (!l) return failed(NOT_SET_UP);
    const q = typeof a.query === 'string' ? a.query.trim() : '';
    if (!q) return failed('Say what to look for.');
    const { unanswered, ...r } = await searchLean(q, ctx.signal);
    if (unanswered) return failed(r.note!);
    if (a.confirm !== true || !r.hits.length) return json(r);
    // The file checked is the app's own, with nothing in it but #check of names: no sandbox or card is needed.
    const { hits, note } = await confirmHere(l, r.hits, { timeoutMs: DEFAULT_MS, signal: ctx.signal, mathlib: mathlib() });
    const notes = [r.note, note].filter(Boolean).join(' ');
    return json({ ...r, hits, ...(notes ? { note: notes } : {}) });
  },
};

const gbWords = (mb: number) => (mb >= 1000 ? `${Math.round(mb / 1000)} GB` : `${mb} MB`);

/** What the card says before anything is downloaded. */
function cardWords(s: LeanState, wantMathlib: boolean): { title: string; detail: string } {
  const parts: string[] = [];
  if (!s.ready)
    parts.push(
      `**Lean** is a proof checker: a proof it accepts is correct. Setting it up downloads about **${LEAN_SIZE_MB} MB** (about 3 GB once unpacked) into this app’s own folder. Nothing else on your computer is changed. A project that asks for another version of Lean downloads that version the first time.`,
    );
  if (wantMathlib) parts.push(`**Mathlib**, the library most mathematics needs, downloads about **${s.mathlibDownloadMb} MB** more and takes about **${gbWords(s.mathlibSizeMb)}** on disk once unpacked. It takes a few minutes.${s.own ? ' Your own Lean gets the version Mathlib asks for, as any Mathlib project would.' : ''}`);
  return { title: s.ready ? 'Add Mathlib to Lean?' : wantMathlib ? 'Set up Lean and Mathlib?' : 'Set up Lean, the proof checker?', detail: parts.join('\n\n') };
}

const stateWords = (s: LeanState) => ({ ready: s.ready, version: s.version, mathlib: s.mathlib, installing: s.installing, step: s.step, error: s.error });

const SETUP: RunTool = {
  name: 'lean_setup',
  description:
    'Ask the user to set up Lean (the proof checker) on this computer, on a card that says the download’s size first; with mathlib: true, to add Mathlib too (about 600 MB to download, 8 GB on disk). The set-up runs in the background: this returns how it stands, and calling it again reports progress. Use it when another Lean tool says Lean or Mathlib is not set up.',
  inputSchema: { type: 'object', properties: { mathlib: { type: 'boolean', description: 'Also add Mathlib, which most mathematics needs.' } } },
  async run(a, ctx) {
    const wantMathlib = a.mathlib === true;
    const s = leanState();
    const have = s.ready && (!wantMathlib || s.mathlib === 'ready');
    if (have) return json({ ...stateWords(s), note: wantMathlib ? 'Lean and Mathlib are set up.' : 'Lean is set up.' });
    if (s.installing && (!wantMathlib || s.mathlib === 'installing')) return json({ ...stateWords(s), note: 'It is being set up. Ask again in a few minutes.' });
    if (!s.ready && !s.canInstall) return failed(s.why ?? 'Lean can’t be set up on this computer.');
    const card = cardWords(s, wantMathlib);
    const no = await confirmChange(ctx, { title: card.title, detail: card.detail, level: 'ask', label: 'Set up' });
    if (no) return failed(no);
    void setupLean({ mathlib: wantMathlib });
    return json({ ...stateWords(leanState()), note: 'The set-up runs in the background and can take a long while. Carry on with other work, and call lean_setup again to see how far it is.' });
  },
};

export const leanTools: RunTool[] = [CHECK, VERIFY, SEARCH, SETUP];
