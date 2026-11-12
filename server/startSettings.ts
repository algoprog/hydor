// What the start page had picked last (the agent and each agent's model, effort and mode, the assistant,
// the folder, memory, a spending cap and Confidential), and the picks made in each place (a project, the new task
// folder, a folder), so it opens that way again, on every device. The page sends what changed; this keeps the whole,
// tidied, and leaves out a folder that is gone.
import fs from 'node:fs';
import { isAbsPath } from './platform.ts';
import type { StartPlace, StartRun, StartSettings } from '../shared/types.ts';
import { MAX_PLACES, placeKey } from '../shared/start.ts';
import { kvGet, kvSet, type DB } from './db.ts';

const KEY = 'start';
const AGENT = /^(claude|codex|acp:[\w.-]{1,80})$/;

const text = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);
const cap = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1_000_000 ? v : undefined);

function tidyRun(r: unknown, withAccount = true): StartRun | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const x = r as Record<string, unknown>;
  const out: StartRun = {};
  // null is the agent's own default, which is a pick too.
  for (const k of ['model', 'effort', 'mode'] as const) {
    const v = x[k] === null ? null : text(x[k]);
    if (v !== undefined) out[k] = v;
  }
  const account = withAccount ? text(x.account, 100) : undefined;
  if (account !== undefined) out.account = account;
  return Object.keys(out).length ? out : undefined;
}

/** A place's name is one the start page makes: 'task', a project, or a folder with an absolute path. */
const placeName = (k: string) => k === 'task' || /^project:[\w-]{1,40}$/.test(k) || (k.startsWith('folder:') && isAbsPath(k.slice(7)) && k.length <= 4103);

/** One place's picks, without any account; null if it has no time of its own. */
function tidyPlace(v: unknown): StartPlace | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const x = v as Record<string, unknown>;
  if (typeof x.at !== 'number' || !Number.isFinite(x.at) || x.at <= 0) return undefined;
  const out: StartPlace = { at: x.at };
  const agent = text(x.agent);
  if (agent && AGENT.test(agent)) out.agent = agent;
  if (x.runs && typeof x.runs === 'object' && !Array.isArray(x.runs)) {
    const runs: Record<string, Omit<StartRun, 'account'>> = {};
    for (const [k, r] of Object.entries(x.runs as Record<string, unknown>).slice(0, 10)) {
      const t = AGENT.test(k) ? tidyRun(r, false) : undefined;
      if (t) runs[k] = t;
    }
    if (Object.keys(runs).length) out.runs = runs;
  }
  const assistant = text(x.assistant, 100);
  if (assistant) out.assistant = assistant;
  if (typeof x.worktree === 'boolean') out.worktree = x.worktree;
  if (x.memory === false) out.memory = false;
  const capUsd = cap(x.capUsd);
  if (capUsd !== undefined) out.capUsd = capUsd;
  if (x.confidential === true) out.confidential = true;
  return out;
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
  const space = text(o.space, 40);
  if (space) s.space = space;
  if (typeof o.task === 'boolean') s.task = o.task;
  const cwd = text(o.cwd, 4096);
  if (cwd && isAbsPath(cwd)) s.cwd = cwd;
  if (typeof o.worktree === 'boolean') s.worktree = o.worktree;
  if (o.memory === false) s.memory = false;
  if (o.confidential === true) s.confidential = true;
  const capUsd = cap(o.capUsd);
  if (capUsd !== undefined) s.capUsd = capUsd;
  if (o.places && typeof o.places === 'object' && !Array.isArray(o.places)) {
    const kept: [string, StartPlace][] = [];
    for (const [k, v] of Object.entries(o.places as Record<string, unknown>)) {
      const t = placeName(k) ? tidyPlace(v) : undefined;
      if (t) kept.push([k, t]);
    }
    // The places used last are kept.
    kept.sort((a, b) => b[1].at - a[1].at);
    s.places = Object.fromEntries(kept.slice(0, MAX_PLACES));
  }
  return s;
}

/** Data saved before places existed: the pick last made becomes the record of its place. */
function seedPlace(s: StartSettings) {
  const k = placeKey({ task: s.task, space: s.space, cwd: s.cwd });
  const picked = Boolean(s.agent || s.runs || s.assistant || s.worktree !== undefined || s.memory === false || s.capUsd || s.confidential);
  if (!k || !picked) return;
  const rec = placeOf(s);
  if (rec) s.places = { [k]: rec };
}

function saved(db: DB): StartSettings {
  try {
    const raw = JSON.parse(kvGet(db, KEY) ?? '{}');
    const s = tidy(raw);
    if (!(raw && typeof raw === 'object' && 'places' in raw)) seedPlace(s);
    return s;
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

/** Takes what changed (null clears a field; an agent's run joins its last one; a place is replaced, or null removes it) and returns the whole. */
export function updateStartSettings(db: DB, patch: unknown): StartSettings {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const cur = saved(db);
  const runs: Record<string, unknown> = { ...cur.runs };
  if (p.runs && typeof p.runs === 'object') for (const [k, r] of Object.entries(p.runs as Record<string, unknown>)) if (r && typeof r === 'object') runs[k] = { ...(runs[k] as object), ...r };
  // A Map, so a key such as "__proto__" is only ever data.
  const places = new Map<string, unknown>(Object.entries(cur.places ?? {}));
  if (p.places && typeof p.places === 'object' && !Array.isArray(p.places)) {
    for (const [k, v] of Object.entries(p.places as Record<string, unknown>)) {
      if (v === null) places.delete(k);
      else if (v && typeof v === 'object' && !Array.isArray(v)) places.set(k, v);
    }
  }
  // A client that does not keep places itself (an agent through the API, the terminal app) changed a pick: it is the
  // place picked last's pick too. The start page sends `places` with every change, so its own never count here.
  const after = tidy({ ...cur, ...p, runs });
  const here = placeKey({ task: after.task, space: after.space, cwd: after.cwd });
  if (!('places' in p) && here && changesPick(p)) places.set(here, placeOf(after));
  const next = tidy({ ...cur, ...p, runs, places: Object.fromEntries(places) });
  kvSet(db, KEY, JSON.stringify(next));
  return next;
}

/** Whether a change sets a pick a place keeps (an account alone is the same everywhere). */
function changesPick(p: Record<string, unknown>): boolean {
  if (['agent', 'assistant', 'worktree', 'memory', 'capUsd', 'confidential'].some((k) => k in p)) return true;
  const runs = p.runs && typeof p.runs === 'object' ? Object.values(p.runs as Record<string, unknown>) : [];
  return runs.some((r) => !!r && typeof r === 'object' && ['model', 'effort', 'mode'].some((k) => k in (r as object)));
}

/** The picks in `s` as a place's record, kept from now. */
const placeOf = (s: StartSettings): StartPlace | undefined =>
  tidyPlace({ agent: s.agent, runs: s.runs, assistant: s.assistant, worktree: s.worktree, memory: s.memory, capUsd: s.capUsd, confidential: s.confidential, at: Date.now() });
