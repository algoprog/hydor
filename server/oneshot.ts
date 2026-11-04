// One question to a model, outside any session: Claude (Haiku unless asked otherwise) when signed in,
// else Codex. No tools, settings, hooks or MCP servers, and nothing saved, so no session is left behind.
// Used for terminal command suggestions and pull-request descriptions and reading guides, and by the helper
// model on "Automatic" (an app's model steps, memory notes…). An account that has reached its usage limit, or
// is signed out, hands the question to the next one signed in, as sessions switch accounts at a limit.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HttpError } from './auth.ts';
import { config } from './config.ts';
import { agentBaseEnv } from './env.ts';

export interface OneShot {
  system: string;
  prompt: string;
  /** Claude model alias; Haiku by default. */
  model?: 'haiku' | 'sonnet' | 'opus';
  /** The Codex model when Claude cannot answer. */
  codexModel?: string;
  timeoutMs?: number;
  /** Stops the call (its program ends): an app's run stopped while its step asks. */
  signal?: AbortSignal;
}

type Env = Record<string, string>;

/** The environments that point a CLI at each account to try, the default one first (index.ts sets it). */
let accountsOf: (agent: 'claude' | 'codex') => Env[] = () => [{}];
export const setOneShotAccounts = (f: (agent: 'claude' | 'codex') => Env[]) => (accountsOf = f);

/** Why an account gave no answer; `next`: another account may (a limit reached, signed out), unlike a call that ran out of time. */
class NoAnswer extends Error {
  constructor(
    message: string,
    readonly next = true,
  ) {
    super(message);
  }
}

const asNoAnswer = (e: unknown) => (e instanceof NoAnswer ? e : new NoAnswer((e as Error)?.message || 'it did not answer'));

/** The last line a program wrote that says something (not the CLI's note that nothing came on stdin); an error as JSON, by its message. */
function lastLine(s: string): string {
  const line =
    s
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^Warning: no stdin data/i.test(l))
      .pop() ?? '';
  // Codex: ERROR: {"type":"error","status":400,"error":{"message":"The '…' model is not supported…"}}
  const json = /^(?:ERROR:\s*)?(\{.*\})$/.exec(line)?.[1];
  if (json) {
    try {
      const j = JSON.parse(json);
      const msg = j?.error?.message ?? j?.message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim().slice(0, 300);
    } catch {}
  }
  return line.slice(0, 300);
}

/** Runs a CLI with nothing on stdin: what it wrote, and why it failed when it did (in words, never the whole command). */
function run(bin: string, args: string[], o: { timeout: number; env?: Env; signal?: AbortSignal }): Promise<{ ok: boolean; stdout: string; stderr: string; why?: string; timedOut?: boolean }> {
  return new Promise((resolve) => {
    const child = execFile(bin, args, { cwd: os.tmpdir(), env: { ...agentBaseEnv(), ...o.env }, timeout: o.timeout, maxBuffer: 8 * 1024 * 1024, signal: o.signal }, (err, stdout, stderr) => {
      const out = String(stdout ?? '');
      const errs = String(stderr ?? '');
      if (!err) return resolve({ ok: true, stdout: out, stderr: errs });
      const e = err as NodeJS.ErrnoException & { killed?: boolean };
      if (o.signal?.aborted) return resolve({ ok: false, stdout: out, stderr: errs, why: 'it was stopped' });
      if (e.code === 'ENOENT') return resolve({ ok: false, stdout: out, stderr: errs, why: 'it is not installed' });
      if (e.killed) return resolve({ ok: false, stdout: out, stderr: errs, why: `it did not answer within ${Math.round(o.timeout / 1000)} s`, timedOut: true });
      resolve({ ok: false, stdout: out, stderr: errs, why: lastLine(errs) || 'it failed' });
    });
    // Nothing comes on stdin: left open, Claude waits 3 s for it on every call and Codex waits until it is killed.
    child.stdin?.end();
  });
}

/** Claude's answer from its JSON, or why there is none: its own words when it gave some ("You've hit your weekly limit · resets…"). */
function claudeAnswer(r: Awaited<ReturnType<typeof run>>): string {
  let j: { is_error?: boolean; result?: unknown } | null = null;
  try {
    j = JSON.parse(r.stdout);
  } catch {}
  if (r.ok && j && !j.is_error && typeof j.result === 'string') return j.result;
  const said = j && typeof j.result === 'string' && j.result.trim() ? j.result.trim().slice(0, 300) : '';
  throw new NoAnswer(said || r.why || 'it did not answer', !r.timedOut && r.why !== 'it was stopped');
}

/** Asks each account in turn, while the one before could not answer for a reason another may not have. */
async function eachAccount(agent: 'claude' | 'codex', ask: (env: Env) => Promise<string>, signal?: AbortSignal): Promise<string> {
  const pool = accountsOf(agent);
  let first: NoAnswer | null = null;
  for (const env of pool.length ? pool : [{}]) {
    try {
      return await ask(env);
    } catch (e) {
      const why = asNoAnswer(e);
      first ??= why;
      if (!why.next || signal?.aborted) break;
    }
  }
  throw first ?? new NoAnswer('it did not answer');
}

const CLAUDE_FLAGS = ['--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--output-format', 'json'];

export async function askClaude(q: OneShot): Promise<string> {
  // --tools takes a list, so another flag must follow it; the prompt goes last.
  const args = ['-p', '--model', q.model ?? 'haiku', '--tools', '', ...CLAUDE_FLAGS, '--system-prompt', q.system, q.prompt];
  return eachAccount('claude', async (env) => claudeAnswer(await run(config.claudeBin, args, { timeout: q.timeoutMs ?? 90_000, env, signal: q.signal })), q.signal);
}

async function askCodex(q: OneShot): Promise<string> {
  return eachAccount(
    'codex',
    async (env) => {
      const file = path.join(os.tmpdir(), `wa-ask-${crypto.randomBytes(6).toString('hex')}.txt`);
      const timeout = Math.max(q.timeoutMs ?? 90_000, 90_000);
      try {
        const r = await run(config.codexBin, ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', ...(q.codexModel ? ['-m', q.codexModel] : []), '-c', 'model_reasoning_effort="low"', '-o', file, `${q.system}\n\n${q.prompt}`], { timeout, env, signal: q.signal });
        const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        if (r.ok && text.trim()) return text;
        throw new NoAnswer(r.why ?? 'it gave no answer', !r.timedOut && r.why !== 'it was stopped');
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
    q.signal,
  );
}

/**
 * Claude alone (no Codex after it), reading the given files with its Read tool and nothing else: a picture to
 * describe. The files' folders are opened to it; the prompt names the files.
 */
export async function askClaudeAbout(q: OneShot & { files: string[] }): Promise<string> {
  const dirs = [...new Set(q.files.map((f) => path.dirname(f)))];
  const args = ['-p', '--model', q.model ?? 'haiku', '--tools', 'Read', '--allowedTools', 'Read', '--add-dir', ...dirs, ...CLAUDE_FLAGS, '--system-prompt', q.system, q.prompt];
  try {
    return await eachAccount('claude', async (env) => claudeAnswer(await run(config.claudeBin, args, { timeout: q.timeoutMs ?? 120_000, env, signal: q.signal })), q.signal);
  } catch (e) {
    throw new Error(`Claude Code did not answer: ${asNoAnswer(e).message}`);
  }
}

/** The model's answer as text. */
export async function oneShot(q: OneShot): Promise<string> {
  let claude: NoAnswer;
  try {
    return await askClaude(q);
  } catch (e) {
    claude = asNoAnswer(e);
  }
  if (q.signal?.aborted) throw new HttpError(409, 'It was stopped');
  try {
    return await askCodex(q);
  } catch (e) {
    throw new HttpError(502, `Could not reach a model. Claude Code: ${claude.message.replace(/\.$/, '')}. Codex: ${asNoAnswer(e).message.replace(/\.$/, '')}.`);
  }
}

/** The model's answer as JSON (the first object in it); `what` names it in the error. */
export async function oneShotJson<T>(q: OneShot, what: string): Promise<T> {
  const raw = await oneShot(q);
  try {
    return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as T;
  } catch {
    throw new HttpError(502, `The model did not answer with ${what}`);
  }
}
