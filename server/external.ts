// Sessions running outside this app (VS Code, terminals), so they show as active here too.
//   Claude Code: each live process registers in ~/.claude/sessions/<pid>.json with its
//     session id and a status (busy / idle / waiting).
//   Codex: a process with a thread loaded holds ~/.codex/thread-writer-locks/<thread>.lock open.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ExternalState } from '../shared/types.ts';
import { config } from './config.ts';

const POLL_MS = 4000;

function procStart(pid: number): string | null {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null;
  } catch {
    return null;
  }
}

const CLIENTS: Record<string, string> = {
  'claude-vscode': 'VS Code',
  'claude-desktop': 'Claude desktop',
  cli: 'terminal',
  'sdk-cli': 'another app',
  'sdk-ts': 'another app',
  'sdk-py': 'another app',
};

export class ExternalWatcher extends EventEmitter {
  states = new Map<string, ExternalState>();
  private timer: NodeJS.Timeout | null = null;

  /** `owned` returns true for sessions this app is running itself. */
  constructor(
    private owned: (key: string) => boolean,
    private rolloutPath: (key: string) => string | null,
  ) {
    super();
  }

  start() {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  get(key: string): ExternalState | null {
    return this.states.get(key) ?? null;
  }

  /** Rescans now; also runs every few seconds. */
  poll() {
    const next = new Map<string, ExternalState>();
    try {
      this.claude(next);
    } catch {}
    try {
      this.codex(next);
    } catch {}
    for (const k of [...next.keys()]) if (this.owned(k)) next.delete(k);
    const changed: string[] = [];
    for (const [k, v] of next) {
      const old = this.states.get(k);
      if (!old || old.status !== v.status || old.pid !== v.pid || old.detail !== v.detail) changed.push(k);
    }
    for (const k of this.states.keys()) if (!next.has(k)) changed.push(k);
    this.states = next;
    if (changed.length) this.emit('change', changed);
  }

  private claude(out: Map<string, ExternalState>) {
    const dir = path.join(path.dirname(config.claudeProjectsDir), 'sessions');
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      let j: Record<string, any>;
      try {
        j = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
      } catch {
        continue;
      }
      const pid = Number(j.pid);
      if (!pid || !j.sessionId) continue;
      // A dead process leaves its file behind; a reused pid has a different start time.
      const start = procStart(pid);
      if (!start || (j.procStart && String(j.procStart) !== start)) continue;
      const status = j.status === 'busy' ? 'working' : j.status === 'waiting' ? 'waiting' : 'idle';
      const key = `claude:${j.sessionId}`;
      const prev = out.get(key);
      if (prev && prev.status === 'working') continue;
      out.set(key, {
        status,
        client: CLIENTS[j.entrypoint] ?? (j.kind === 'interactive' ? 'terminal' : String(j.entrypoint ?? 'another client')),
        pid,
        detail: status === 'waiting' ? String(j.waitingFor ?? 'input needed') : undefined,
        since: Number(j.statusUpdatedAt) || undefined,
        startedAt: Number(j.startedAt) || undefined,
      });
    }
  }

  private codex(out: Map<string, ExternalState>) {
    const lockDir = path.join(config.codexHome, 'thread-writer-locks') + '/';
    const uid = os.userInfo().uid;
    for (const p of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(p)) continue;
      let comm: string;
      try {
        comm = fs.readFileSync(`/proc/${p}/comm`, 'utf8').trim();
        if (comm !== 'codex' || fs.statSync(`/proc/${p}`).uid !== uid) continue;
      } catch {
        continue;
      }
      let fds: string[] = [];
      try {
        fds = fs.readdirSync(`/proc/${p}/fd`);
      } catch {
        continue;
      }
      let client = 'terminal';
      try {
        const cmd = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8');
        if (cmd.includes('.vscode') || cmd.includes('openai.chatgpt')) client = 'VS Code';
        else if (cmd.includes('app-server')) client = 'Codex app';
      } catch {}
      for (const fd of fds) {
        let target: string;
        try {
          target = fs.readlinkSync(`/proc/${p}/fd/${fd}`);
        } catch {
          continue;
        }
        if (!target.startsWith(lockDir) || !target.endsWith('.lock')) continue;
        const id = path.basename(target, '.lock');
        if (id.startsWith('.')) continue;
        const key = `codex:${id}`;
        // The thread is loaded; it counts as working while its rollout keeps growing.
        let status: ExternalState['status'] = 'idle';
        const rollout = this.rolloutPath(key);
        if (rollout) {
          try {
            if (Date.now() - fs.statSync(rollout).mtimeMs < 20_000) status = 'working';
          } catch {}
        }
        out.set(key, { status, client, pid: Number(p) });
      }
    }
  }
}
