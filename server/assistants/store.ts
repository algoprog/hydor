// The user's own assistants and the settings beside them (how the agents talk to you, where task folders
// go), kept in the kv table. The built-ins come first and cannot be changed, only duplicated.
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { ASSISTANT_ICONS, ASSISTANT_MODES, TOOL_KINDS, type Assistant, type AssistantMode, type ToolKind } from '../../shared/assistants.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { BUILTINS } from './builtins.ts';

const MINE = 'assistants.mine';
const TONE = 'assistants.tone';
const ROOT = 'assistants.taskRoot';
const CLEAN_UP = 'assistants.cleanUp';

export const DEFAULT_TASK_ROOT = config.taskRoot;
export const MAX_INSTRUCTIONS = 20_000;
export const MAX_TONE = 600;

function mine(db: DB): Assistant[] {
  try {
    const v = JSON.parse(kvGet(db, MINE) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const putMine = (db: DB, list: Assistant[]) => kvSet(db, MINE, JSON.stringify(list));

/** Every assistant: the built-ins, then the user's own. */
export const allAssistants = (db: DB): Assistant[] => [...BUILTINS, ...mine(db)];

export const findAssistant = (db: DB, id: unknown): Assistant | null => (typeof id === 'string' && id ? (allAssistants(db).find((a) => a.id === id) ?? null) : null);

const str = (v: unknown, max: number) =>
  String(v ?? '')
    .trim()
    .slice(0, max);
const names = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, 120)).filter(Boolean))].slice(0, max) : []);

/** An assistant as given by the pages or an import, checked and trimmed (without its id). */
export function cleanAssistant(b: Partial<Record<keyof Assistant, unknown>>): Omit<Assistant, 'id'> {
  const name = str(b.name, 60);
  if (!name) throw new HttpError(400, 'Give the assistant a name');
  const instructions = str(b.instructions, MAX_INSTRUCTIONS);
  const agent = b.agent === 'claude' || b.agent === 'codex' || b.agent === 'acp' ? b.agent : undefined;
  const acpAgent = agent === 'acp' ? str(b.acpAgent, 80) || undefined : undefined;
  if (agent === 'acp' && !acpAgent) throw new HttpError(400, 'Pick which agent it suggests');
  const tools = Array.isArray(b.tools) ? TOOL_KINDS.map((k) => k.id).filter((k): k is ToolKind => (b.tools as unknown[]).includes(k)) : undefined;
  const mode = ASSISTANT_MODES.some((m) => m.id === b.mode) ? (b.mode as AssistantMode) : undefined;
  const out: Omit<Assistant, 'id'> = {
    name,
    icon: (ASSISTANT_ICONS as readonly string[]).includes(String(b.icon)) ? String(b.icon) : 'bot',
    description: str(b.description, 160),
    instructions,
    agent,
    acpAgent,
    model: agent ? str(b.model, 200) || undefined : undefined,
    tools: tools && tools.length === TOOL_KINDS.length ? undefined : tools,
    connections: names(b.connections, 50),
    skills: names(b.skills, 30),
    mode,
    folder: b.folder === 'project' ? 'project' : 'task',
    source: str(b.source, 1000) || undefined,
  };
  // Empty lists and unset choices are left out of what is kept.
  for (const k of Object.keys(out) as (keyof typeof out)[]) if (out[k] === undefined || (Array.isArray(out[k]) && !(out[k] as unknown[]).length && k !== 'tools')) delete out[k];
  return out;
}

/** "Bookkeeper" → "bookkeeper-3f9a": readable, and unique without a lookup. */
const newId = (name: string) =>
  `${
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'assistant'
  }-${crypto.randomBytes(2).toString('hex')}`;

/** Adds an assistant (no id) or changes one of the user's own. */
export function saveAssistant(db: DB, b: Partial<Record<keyof Assistant, unknown>>): Assistant {
  const id = typeof b.id === 'string' ? b.id : '';
  if (id && BUILTINS.some((a) => a.id === id)) throw new HttpError(400, 'Built-in assistants stay as they are: duplicate one to make it your own');
  const list = mine(db);
  const at = id ? list.findIndex((a) => a.id === id) : -1;
  if (id && at < 0) throw new HttpError(404, 'There is no such assistant');
  const a: Assistant = { id: id || newId(str(b.name, 60)), ...cleanAssistant(b) };
  if (at >= 0) list[at] = a;
  else {
    if (list.length >= 200) throw new HttpError(400, 'That is a lot of assistants: delete some first');
    list.push(a);
  }
  putMine(db, list);
  return a;
}

export function removeAssistant(db: DB, id: string) {
  if (BUILTINS.some((a) => a.id === id)) throw new HttpError(400, 'Built-in assistants cannot be deleted');
  putMine(
    db,
    mine(db).filter((a) => a.id !== id),
  );
}

// ---- settings -----------------------------------------------------------------------------------------

/** How the agents talk to you ("plain English, short answers"): added to every agent's instructions. */
export const toneOf = (db: DB): string => kvGet(db, TONE) ?? '';

/** Where new task folders go. */
export const taskRoot = (db: DB): string => kvGet(db, ROOT) || DEFAULT_TASK_ROOT;

/** Whether every agent hears to clean up after a task (on unless turned off). */
export const cleanUpOn = (db: DB): boolean => kvGet(db, CLEAN_UP) !== '0';

const expand = (p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p);

export function setSettings(db: DB, b: { tone?: unknown; taskRoot?: unknown; cleanUp?: unknown }) {
  if (b.tone !== undefined) kvSet(db, TONE, str(b.tone, MAX_TONE));
  if (typeof b.cleanUp === 'boolean') kvSet(db, CLEAN_UP, b.cleanUp ? '1' : '0');
  if (b.taskRoot !== undefined) {
    const p = expand(str(b.taskRoot, 1000));
    if (p && !path.isAbsolute(p)) throw new HttpError(400, 'Give the full path of a folder, like ~/Hydor');
    kvSet(db, ROOT, p ? path.resolve(p) : '');
  }
}
