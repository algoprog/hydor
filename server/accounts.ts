// More than one account per agent: a work and a personal Claude plan, say. The default account is
// the CLI's own (~/.claude, ~/.codex); each added one lives in a folder of its own under the app's data
// (CLAUDE_CONFIG_DIR / CODEX_HOME), with its own sign-in and history. Settings, instructions, skills
// and plugins are linked in from the default account, so only the sign-in differs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Agent, AgentAccount } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { agentRoots, config } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { claudeTranscriptPath, findClaudeTranscript } from './timeline.ts';

interface Stored {
  id: string;
  agent: Agent;
  name: string;
  dir: string;
  createdAt: number;
}

const ROOT = path.join(config.dataDir, 'accounts');
const CLAUDE_HOME = path.dirname(config.claudeProjectsDir);

// What an added account shares with the default one (linked, so changes apply to both).
const SHARED: Record<'claude' | 'codex', { from: string; names: string[] }> = {
  claude: { from: CLAUDE_HOME, names: ['settings.json', 'CLAUDE.md', 'skills', 'agents', 'commands', 'output-styles', 'plugins', 'rules'] },
  codex: { from: config.codexHome, names: ['config.toml', 'AGENTS.md', 'AGENTS.override.md', 'prompts', 'rules', 'skills'] },
};

let cache: Stored[] | null = null;

function stored(db: DB): Stored[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(kvGet(db, 'agent_accounts') ?? '[]');
  } catch {
    cache = [];
  }
  return cache!;
}

function save(db: DB, list: Stored[]) {
  cache = list;
  kvSet(db, 'agent_accounts', JSON.stringify(list));
  syncRoots(db);
}

/** Puts every account's history folders in the lists the indexer and the transcript lookups read. */
export function syncRoots(db: DB) {
  const extra = stored(db);
  agentRoots.claudeProjects = [config.claudeProjectsDir, ...extra.filter((a) => a.agent === 'claude').map((a) => path.join(a.dir, 'projects'))];
  agentRoots.codexHomes = [config.codexHome, ...extra.filter((a) => a.agent === 'codex').map((a) => a.dir)];
}

export function addedAccounts(db: DB): AgentAccount[] {
  return stored(db).map(({ id, agent, name }) => ({ id, agent, name }));
}

export function accountById(db: DB, id: string | null | undefined): Stored | null {
  return id ? (stored(db).find((a) => a.id === id) ?? null) : null;
}

/** The environment that points an agent's CLI at an account (nothing for the default one). */
export function accountEnv(db: DB, agent: Agent, id: string | null | undefined): Record<string, string> {
  const a = accountById(db, id);
  if (!a) {
    if (id) throw new HttpError(404, 'That account was removed');
    return {};
  }
  if (a.agent !== agent) throw new HttpError(400, `That is a ${a.agent === 'claude' ? 'Claude Code' : 'Codex'} account`);
  return a.agent === 'claude' ? { CLAUDE_CONFIG_DIR: a.dir } : { CODEX_HOME: a.dir };
}

/** The added account whose folder holds a transcript, by its path. */
export function accountOfPath(db: DB, file: string | null | undefined): string | null {
  if (!file || !file.startsWith(ROOT + path.sep)) return null;
  return stored(db).find((a) => file.startsWith(a.dir + path.sep))?.id ?? null;
}

/** Where a Claude account keeps its transcripts. */
export function claudeProjectsOf(db: DB, id: string | null | undefined): string {
  const a = accountById(db, id);
  return a?.agent === 'claude' ? path.join(a.dir, 'projects') : config.claudeProjectsDir;
}

/**
 * A Claude session's transcript: where it is, or, before the CLI has written it (a session just started),
 * where it will be, in the folder of the account the session runs as.
 */
export function claudeTranscriptOf(db: DB, sessionId: string, cwd: string | undefined, account: string | null | undefined): string | null {
  return findClaudeTranscript(sessionId) ?? (cwd ? claudeTranscriptPath(cwd, sessionId, claudeProjectsOf(db, account)) : null);
}

/** A Codex account's CODEX_HOME. */
function codexHomeOf(db: DB, id: string | null | undefined): string {
  const a = accountById(db, id);
  return a?.agent === 'codex' ? a.dir : config.codexHome;
}

/** Every account an agent can run as: the CLI's own (undefined), then the added ones. */
export function accountPool(db: DB, agent: Agent): (string | undefined)[] {
  return [undefined, ...stored(db).filter((a) => a.agent === agent).map((a) => a.id)];
}

/**
 * What moves when a session goes to another account (from → to, sources that exist): a Claude
 * transcript, its folder (subagents, tool output) and its file checkpoints; a Codex rollout. Both CLIs
 * find a session by its id in their own folder, so it resumes there with all its history.
 */
export function historyMoves(db: DB, agent: Agent, sessionId: string, file: string, from: string | undefined, to: string | undefined): [string, string][] {
  const [a, b] = agent === 'claude' ? [claudeProjectsOf(db, from), claudeProjectsOf(db, to)] : [codexHomeOf(db, from), codexHomeOf(db, to)];
  if (!file.startsWith(a + path.sep)) throw new HttpError(409, 'Its history is not in its account’s folder');
  const rel = path.relative(a, file);
  const moves: [string, string][] = [[file, path.join(b, rel)]];
  if (agent === 'claude') {
    moves.push([file.replace(/\.jsonl$/, ''), path.join(b, rel.replace(/\.jsonl$/, ''))]);
    moves.push([path.join(path.dirname(a), 'file-history', sessionId), path.join(path.dirname(b), 'file-history', sessionId)]);
  }
  return moves.filter(([src]) => fs.existsSync(src));
}

/** Moves a file or folder, copying when the two places are on different disks. */
export function moveAcross(src: string, dst: string) {
  fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o700 });
  try {
    fs.renameSync(src, dst);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    fs.cpSync(src, dst, { recursive: true, preserveTimestamps: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
}

export function addAccount(db: DB, agent: Agent, name: string): AgentAccount {
  if (agent !== 'claude' && agent !== 'codex') throw new HttpError(400, 'Pick Claude Code or Codex');
  const n = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!n) throw new HttpError(400, 'Name the account (Work, Personal…)');
  const list = stored(db);
  if (list.some((a) => a.agent === agent && a.name.toLowerCase() === n.toLowerCase())) throw new HttpError(409, `There is already an account called ${n}`);
  const id = crypto.randomBytes(4).toString('hex');
  const dir = path.join(ROOT, `${agent}-${id}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const shared = SHARED[agent as 'claude' | 'codex'];
  for (const f of shared.names) {
    const src = path.join(shared.from, f);
    if (fs.existsSync(src)) {
      try {
        fs.symlinkSync(src, path.join(dir, f));
      } catch {}
    }
  }
  save(db, [...list, { id, agent, name: n, dir, createdAt: Date.now() }]);
  return { id, agent, name: n };
}

export function renameAccount(db: DB, id: string, name: string) {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!n) throw new HttpError(400, 'Name the account');
  save(
    db,
    stored(db).map((a) => (a.id === id ? { ...a, name: n } : a)),
  );
}

/** Forgets an account; `wipe` also deletes its folder: its sign-in and the history of its sessions. */
export function removeAccount(db: DB, id: string, wipe: boolean) {
  const a = accountById(db, id);
  if (!a) return;
  save(
    db,
    stored(db).filter((x) => x.id !== id),
  );
  if (wipe && a.dir.startsWith(ROOT + path.sep)) fs.rmSync(a.dir, { recursive: true, force: true });
}
