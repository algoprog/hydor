// Fork and "Edit from here" for Custom sessions. A Custom session is two files: the app's transcript of
// what was shown (DATA_DIR/acp/<id>.jsonl) and Custom's own state, the conversation its model sees
// (models/sessions/<acp session>.json). A fork copies both up to the end of one turn: the turn log in
// the state (server/agent/turns.ts) says where each turn ended in that conversation, and where it
// cannot say (a session from before it was kept, a part condensed since), the conversation is rebuilt
// from the transcript. "Edit from here" also puts back the files Custom's own edits changed since that
// message (server/agent/snapshots.ts).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ChatMessage } from '../agent/llm.ts';
import { copySnapshots, restoreSnapshots, snapDir } from '../agent/snapshots.ts';
import { cutAt, type TurnLog } from '../agent/turns.ts';
import { acpSessionOf, acpTranscriptPath } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { acpText } from '../history/acp.ts';
import { MODELS_DIR } from '../models/config.ts';

/** Where Custom keeps its sessions' state (its NAGET_AGENT_STATE). */
export const STATE_DIR = path.join(MODELS_DIR, 'sessions');
const stateFile = (id: string) => path.join(STATE_DIR, `${id.replace(/[^\w-]/g, '')}.json`);

interface Line {
  raw: string;
  e: Record<string, any>;
}

function readLines(file: string): Line[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new HttpError(404, 'This session has no transcript');
  }
  return text.split('\n').flatMap((raw) => {
    try {
      const e = JSON.parse(raw);
      return e && typeof e === 'object' ? [{ raw, e }] : [];
    } catch {
      return [];
    }
  });
}

/** The session's turns in order: each prompt's id, its line, and whether the turn has ended. */
function turnsOf(lines: Line[]) {
  const out: { id: string; line: number; ended: boolean }[] = [];
  lines.forEach(({ e }, i) => {
    if (e.t === 'prompt' && e.id) out.push({ id: String(e.id), line: i, ended: false });
    else if (e.t === 'end' && out.length) out[out.length - 1].ended = true;
  });
  return out;
}

interface State {
  id: string;
  cwd: string;
  mode?: string;
  model?: string;
  messages: ChatMessage[];
  allow?: string[];
  textTools?: string[];
  turnLog?: TurnLog;
  [k: string]: unknown;
}

/** Custom's state, read again if it was caught half written. */
async function readState(acp: string): Promise<State | null> {
  for (let i = 0; i < 20; i++) {
    try {
      const s = JSON.parse(fs.readFileSync(stateFile(acp), 'utf8'));
      return s && Array.isArray(s.messages) ? s : null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return null;
}

/**
 * The conversation rebuilt from the transcript, for when the state cannot be cut exactly: the user's
 * messages, and for each turn the agent's reply with its steps named in a line.
 */
function rebuild(lines: Line[]): { messages: ChatMessage[]; ends: { id: string; at: number }[] } {
  const messages: ChatMessage[] = [];
  const ends: { id: string; at: number }[] = [];
  let turn: string | null = null;
  let text = '';
  const steps: string[] = [];
  const close = () => {
    if (turn === null) return;
    const body = [steps.length ? `(Steps taken: ${steps.slice(-40).join('; ')})` : '', text.trim()].filter(Boolean).join('\n\n');
    if (body) messages.push({ role: 'assistant', content: body });
    ends.push({ id: turn, at: messages.length });
    turn = null;
    text = '';
    steps.length = 0;
  };
  for (const { e } of lines) {
    if (e.t === 'prompt') {
      close();
      turn = String(e.id);
      messages.push({ role: 'user', content: String(e.text ?? '') });
    } else if (e.t === 'update' && turn !== null) {
      const u = e.u ?? {};
      if (u.sessionUpdate === 'agent_message_chunk') text += acpText(u.content);
      else if (u.sessionUpdate === 'tool_call') steps.push(String(u.title ?? u.kind ?? 'a step').slice(0, 160));
    } else if (e.t === 'end') close();
  }
  close();
  return { messages, ends };
}

/**
 * Makes the files of a new Custom session that starts with `fromKey`'s conversation up to the end of
 * the turn whose prompt is `at` (every finished turn when not given). Returns the new session's id
 * (its key is acp:<id>); starting it loads the copy.
 */
export async function prepareCustomFork(fromKey: string, at?: string): Promise<string> {
  const src = acpTranscriptPath(fromKey.slice(4));
  const lines = readLines(src);
  const turns = turnsOf(lines);
  const k = at ? turns.findIndex((t) => t.id === at) : turns.findLastIndex((t) => t.ended);
  if (at && k < 0) throw new HttpError(404, 'That reply is not in this session');
  if (k >= 0 && !turns[k].ended) throw new HttpError(409, 'That turn is still running: fork from it once it ends');
  const stop = turns[k + 1]?.line ?? lines.length;
  const kept = lines.slice(0, stop);
  const order = turns.map((t) => t.id);
  const acp = acpSessionOf(src);
  const state = acp ? await readState(acp) : null;
  const cut = state ? cutAt(state.turnLog, order, k, state.messages.length) : null;
  const meta = lines.find((l) => l.e.t === 'meta')?.e ?? {};
  const id = crypto.randomUUID();
  const acpId = crypto.randomUUID();
  // Custom's state: the conversation up to there.
  const ids = new Set(order.slice(0, k + 1));
  let next: State;
  if (state && cut !== null) {
    const log = state.turnLog!;
    next = { ...state, id: acpId, messages: state.messages.slice(0, cut), turnLog: { offset: log.offset, floor: log.floor, ends: log.ends.filter((e) => ids.has(e.id)) } };
  } else {
    const r = rebuild(kept);
    next = { ...(state ?? { cwd: String(meta.cwd ?? ''), mode: 'ask', allow: [], textTools: [] }), id: acpId, messages: r.messages, turnLog: { offset: 0, floor: 0, ends: r.ends } };
  }
  delete next.usage;
  delete next.turnId;
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(stateFile(acpId), JSON.stringify(next), { mode: 0o600 });
  // What the edits of the kept turns changed, so files can go back in the fork too.
  if (acp) copySnapshots(snapDir(STATE_DIR, acp), snapDir(STATE_DIR, acpId), ids);
  // The transcript: the same lines up to there, Custom's new session, and no goal carried over.
  const out = kept.filter((l) => !['session', 'run', 'rpc'].includes(l.e.t)).map((l) => l.raw);
  const goal = [...kept].reverse().find((l) => l.e.t === 'goal')?.e.goal;
  if (goal) out.push(JSON.stringify({ t: 'goal', ts: Date.now(), goal: null, loop: null }));
  out.push(JSON.stringify({ t: 'session', ts: Date.now(), acpSession: acpId }));
  fs.writeFileSync(acpTranscriptPath(id), out.join('\n') + '\n', { mode: 0o600 });
  return id;
}

/** The prompt of the turn before the one `promptId` opened: where "Edit from here" forks (none: the first message). */
export function customTurnBefore(key: string, promptId: string): string | undefined {
  const turns = turnsOf(readLines(acpTranscriptPath(key.slice(4))));
  const i = turns.findIndex((t) => t.id === promptId);
  if (i < 0) throw new HttpError(404, 'That message is not in this session');
  return turns[i - 1]?.id;
}

/** Puts back the files Custom's edits changed from the turn `promptId` opened onwards. */
export function restoreCustomFiles(key: string, promptId: string) {
  const file = acpTranscriptPath(key.slice(4));
  const turns = turnsOf(readLines(file));
  const i = turns.findIndex((t) => t.id === promptId);
  if (i < 0) throw new HttpError(404, 'That message is not in this session');
  const acp = acpSessionOf(file);
  if (!acp) return;
  const r = restoreSnapshots(snapDir(STATE_DIR, acp), new Set(turns.slice(i).map((t) => t.id)));
  if (r.failed.length) throw new HttpError(409, `Could not put these files back: ${r.failed.slice(0, 5).join(', ')}${r.failed.length > 5 ? '…' : ''}`);
}
