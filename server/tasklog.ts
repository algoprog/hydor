// The latest output of a Claude Code background task. The CLI writes it to
//   <tmp>/claude-<uid>/<project>/<session>/tasks/<task>.output
// A command's or monitor's file holds its stdout and stderr; an agent's links to its transcript.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TaskLog, TaskLogEntry } from '../shared/types.ts';
import { ClaudeParser } from './history/claude.ts';

const TAIL_BYTES = 64 << 10;
const AGENT_TAIL_BYTES = 512 << 10;
const SAFE_ID = /^[\w-]{1,128}$/;

function roots(): string[] {
  const uid = os.userInfo().uid;
  const bases = [process.env.CLAUDE_CODE_TMPDIR, os.tmpdir(), '/tmp'].filter((b): b is string => !!b);
  return [...new Set(bases.map((b) => path.join(b, `claude-${uid}`)))];
}

/** Removes what the CLI kept in its temp folder for a deleted session: pasted images, task output. */
export function removeSessionScratch(project: string, sessionId: string) {
  if (!SAFE_ID.test(sessionId) || !project || project.includes('/') || project.startsWith('.')) return;
  for (const root of roots()) {
    fs.rmSync(path.join(root, project, sessionId), { recursive: true, force: true });
    try {
      fs.rmdirSync(path.join(root, project));
    } catch {}
  }
}

export function taskOutputPath(sessionId: string, taskId: string): string | null {
  if (!SAFE_ID.test(sessionId) || !SAFE_ID.test(taskId)) return null;
  for (const root of roots()) {
    let projects: string[];
    try {
      projects = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const p of projects) {
      const file = path.join(root, p, sessionId, 'tasks', `${taskId}.output`);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

function readTail(file: string, bytes: number): { text: string; size: number; truncated: boolean } {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString('utf8');
    // A cut tail starts mid-line.
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    return { text, size, truncated: start > 0 };
  } finally {
    fs.closeSync(fd);
  }
}

/** Terminal output as plain lines: colours go, and a line redrawn with \r (a progress bar) keeps its last state. */
function plain(text: string): string {
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, '')
    .split('\n')
    .map((l) => {
      const s = l.replace(/\r+$/, '');
      return s.slice(s.lastIndexOf('\r') + 1);
    })
    .join('\n');
}

/** What an agent said and which tools it ran, newest last. */
function agentEntries(file: string): TaskLogEntry[] {
  const p = new ClaudeParser({ retain: true, collectChunks: false, sidechain: true });
  for (const line of readTail(file, AGENT_TAIL_BYTES).text.split('\n')) p.feed(line);
  const out: TaskLogEntry[] = [];
  for (const it of p.items) {
    if (it.kind === 'tool') out.push({ ts: it.ts, tool: it.tool.name, text: it.tool.title ?? '', failed: it.tool.status === 'error' || undefined });
    else if (it.kind === 'assistant' && it.text.trim()) out.push({ ts: it.ts, text: it.text.trim().slice(0, 2000) });
  }
  return out.slice(-80);
}

export function readTaskLog(file: string): TaskLog {
  const updatedAt = fs.statSync(file).mtimeMs;
  if (fs.lstatSync(file).isSymbolicLink() && fs.realpathSync(file).endsWith('.jsonl')) return { kind: 'agent', entries: agentEntries(file), updatedAt };
  const t = readTail(file, TAIL_BYTES);
  return { kind: 'output', text: plain(t.text), size: t.size, truncated: t.truncated, updatedAt };
}
