// What the start page had picked last (the agent and each agent's model, effort and mode, the assistant,
// the folder, memory and a spending cap), so it opens that way again, on every device. The page sends
// what changed; this keeps the whole, tidied, and leaves out a folder that is gone.
import fs from 'node:fs';
import type { StartRun, StartSettings } from '../shared/types.ts';
import { kvGet, kvSet, type DB } from './db.ts';

const KEY = 'start';
const AGENT = /^(claude|codex|acp:[\w.-]{1,80})$/;

const text = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);

function tidyRun(r: unknown): StartRun | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const x = r as Record<string, unknown>;
  const out: StartRun = {};
  // null is the agent's own default, which is a pick too.
  for (const k of ['model', 'effort', 'mode'] as const) {
    const v = x[k] === null ? null : text(x[k]);
    if (v !== undefined) out[k] = v;
  }
  const account = text(x.account, 100);
  if (account !== undefined) out.account = account;
  return Object.keys(out).length ? out : undefined;
}

function tidy(x: unknown): StartSettings {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const s: StartSettings = {};
  const agent = text(o.agent);
  if (agent && AGENT.test(agent)) s.agent = agent;
  if (o.runs && typeof o.runs === 'object') {
    const runs: Record<string, StartRun> = {};
    for (const [k, r] of Object.entries(o.runs as Record<string, unknown>).slice(0, 40)) {
      const t = AGENT.test(k) ? tidyRun(r) : undefined;
      if (t) runs[k] = t;
    }
    if (Object.keys(runs).length) s.runs = runs;
  }
  const assistant = text(o.assistant, 100);
  if (assistant) s.assistant = assistant;
  if (typeof o.task === 'boolean') s.task = o.task;
  const cwd = text(o.cwd, 4096);
  if (cwd?.startsWith('/')) s.cwd = cwd;
  if (typeof o.worktree === 'boolean') s.worktree = o.worktree;
  if (o.memory === false) s.memory = false;
  if (typeof o.capUsd === 'number' && Number.isFinite(o.capUsd) && o.capUsd > 0 && o.capUsd <= 1_000_000) s.capUsd = o.capUsd;
  return s;
}

function saved(db: DB): StartSettings {
  try {
    return tidy(JSON.parse(kvGet(db, KEY) ?? '{}'));
  } catch {
    return {};
  }
}

const isDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** The start page's last picks; a folder that no longer exists is left out. */
export function startSettings(db: DB): StartSettings {
  const s = saved(db);
  if (s.cwd && !isDir(s.cwd)) delete s.cwd;
  return s;
}

/** Takes what changed (null clears a field; an agent's run joins its last one) and returns the whole. */
export function updateStartSettings(db: DB, patch: unknown): StartSettings {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const cur = saved(db);
  const runs: Record<string, unknown> = { ...cur.runs };
  if (p.runs && typeof p.runs === 'object') for (const [k, r] of Object.entries(p.runs as Record<string, unknown>)) if (r && typeof r === 'object') runs[k] = { ...(runs[k] as object), ...r };
  const next = tidy({ ...cur, ...p, runs });
  kvSet(db, KEY, JSON.stringify(next));
  return next;
}
