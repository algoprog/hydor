// One question to a model, outside any session: Claude (Haiku unless asked otherwise) when signed in,
// else Codex. No tools, settings, hooks or MCP servers, and nothing saved, so no session is left behind.
// Used for terminal command suggestions and pull-request descriptions and reading guides.
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
}

function run(bin: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd: os.tmpdir(), env: agentBaseEnv(), timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim().split('\n').pop() || 'failed'));
      else resolve(String(stdout));
    });
  });
}

async function askClaude(q: OneShot): Promise<string> {
  // --tools takes a list, so another flag must follow it; the prompt goes last.
  const out = await run(
    config.claudeBin,
    ['-p', '--model', q.model ?? 'haiku', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--output-format', 'json', '--system-prompt', q.system, q.prompt],
    q.timeoutMs ?? 90_000,
  );
  const r = JSON.parse(out);
  if (r.is_error || typeof r.result !== 'string') throw new Error(r.result || 'Claude did not answer');
  return r.result;
}

async function askCodex(q: OneShot): Promise<string> {
  const file = path.join(os.tmpdir(), `wa-ask-${crypto.randomBytes(6).toString('hex')}.txt`);
  try {
    await run(
      config.codexBin,
      ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', ...(q.codexModel ? ['-m', q.codexModel] : []), '-c', 'model_reasoning_effort="low"', '-o', file, `${q.system}\n\n${q.prompt}`],
      Math.max(q.timeoutMs ?? 90_000, 90_000),
    );
    return fs.readFileSync(file, 'utf8');
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/**
 * Claude alone (no Codex after it), reading the given files with its Read tool and nothing else: a picture to
 * describe. The files' folders are opened to it; the prompt names the files.
 */
export async function askClaudeAbout(q: OneShot & { files: string[] }): Promise<string> {
  const dirs = [...new Set(q.files.map((f) => path.dirname(f)))];
  let out: string;
  try {
    out = await run(
      config.claudeBin,
      ['-p', '--model', q.model ?? 'haiku', '--tools', 'Read', '--allowedTools', 'Read', '--add-dir', ...dirs, '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--output-format', 'json', '--system-prompt', q.system, q.prompt],
      q.timeoutMs ?? 120_000,
    );
  } catch (e) {
    // Without words of its own, the failure names the whole command: say what it means instead.
    const why = String((e as Error).message ?? '');
    throw new Error(/^Command failed|The picture:/.test(why) || q.files.some((f) => why.includes(f)) ? 'Claude Code did not answer: is it installed and signed in?' : why);
  }
  const r = JSON.parse(out);
  if (r.is_error || typeof r.result !== 'string') throw new Error(r.result || 'Claude did not answer');
  return r.result;
}

/** The model's answer as text. */
export async function oneShot(q: OneShot): Promise<string> {
  try {
    return await askClaude(q);
  } catch (e) {
    try {
      return await askCodex(q);
    } catch {
      throw new HttpError(502, `Could not reach a model: ${(e as Error).message}`);
    }
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
