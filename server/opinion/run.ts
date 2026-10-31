// Asking a reviewer, like the app's other one-off questions (server/oneshot.ts): Claude (Sonnet) or Codex
// through their CLIs, with nothing saved, no settings, hooks or MCP servers, and only tools that read,
// in the session's folder, so they can open a file to check something; or one of Custom's models
// through the helper.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import { helper } from '../helper.ts';

export const REVIEW_TIMEOUT = 8 * 60_000;

/** Runs a CLI with the question on its input; its output, or why it failed. */
function cli(bin: string, args: string[], input: string, cwd: string, timeout = REVIEW_TIMEOUT): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, env: agentBaseEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      p.kill('SIGTERM');
      reject(new Error(`No answer within ${Math.round(timeout / 60_000)} minutes`));
    }, timeout);
    p.stdout.on('data', (b) => (out += b));
    p.stderr.on('data', (b) => (err = (err + b).slice(-8000)));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error((e as NodeJS.ErrnoException).code === 'ENOENT' ? `${path.basename(bin)} is not installed here` : e.message));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().split('\n').pop()?.slice(0, 300) || `${path.basename(bin)} stopped (code ${code})`));
    });
    p.stdin.on('error', () => {});
    p.stdin.end(input);
  });
}

async function askClaude(system: string, prompt: string, cwd: string): Promise<string> {
  const out = await cli(
    config.claudeBin,
    ['-p', '--model', 'sonnet', '--tools', 'Read,Grep,Glob', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--output-format', 'json', '--system-prompt', system],
    prompt,
    cwd,
  );
  let r: { is_error?: boolean; result?: unknown };
  try {
    r = JSON.parse(out);
  } catch {
    throw new Error('Claude Code gave an answer that could not be read');
  }
  if (r.is_error || typeof r.result !== 'string') throw new Error(typeof r.result === 'string' && r.result ? r.result.slice(0, 300) : 'Claude did not answer');
  return r.result;
}

async function askCodex(system: string, prompt: string, cwd: string): Promise<string> {
  const file = path.join(os.tmpdir(), `wa-opinion-${crypto.randomBytes(6).toString('hex')}.txt`);
  try {
    await cli(config.codexBin, ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-C', cwd, '-c', 'model_reasoning_effort="medium"', '-o', file, '-'], `${system}\n\n${prompt}`, cwd);
    return fs.readFileSync(file, 'utf8');
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** The reviewer's answer: "claude", "codex", or one of Custom's model ids. */
export async function askReviewer(db: DB, reviewer: string, q: { system: string; prompt: string }, cwd?: string): Promise<string> {
  const dir = cwd && fs.existsSync(cwd) ? cwd : os.tmpdir();
  if (reviewer === 'claude') return askClaude(q.system, q.prompt, dir);
  if (reviewer === 'codex') return askCodex(q.system, q.prompt, dir);
  return helper(db, { system: q.system, prompt: q.prompt, model: reviewer, maxTokens: 4000, timeoutMs: REVIEW_TIMEOUT });
}
