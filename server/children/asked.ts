// Which program a session's Hydor subagents run on. They run on the program the person picked for the session: a Claude
// Code session's on Claude Code (Claude's models, a tier's for each part), a Codex session's on Codex, a Custom session's
// on Custom. Another program (Codex in a Claude Code session, one of Custom's models, another agent of this app, or an
// agent of the person's that runs on one) only when a message the person typed in that session names it ("let Codex
// write the tests"): never because the agent chose it, nor because a usage limit stopped the session's own program (a
// subagent stopped there carries on by itself once the limit lifts).
//
// What counts is what the person typed (the start page, the message box and its queue, a chat app, their voice), never
// what the app or an agent sent (a subagent's reply, "Continue where you left off.", a card's question). Each message is
// read for the names it holds as it comes in, and only those are kept, per session (kv asked:<key>, gone with the
// session), not its words. A
// name is matched as a word of its own, so a path or a file (~/.codex, CLAUDE.md) and GPT Image (a picture model) name
// no program; a word that is common in other senses ("custom", "opus") names none either: the agent then asks.
import fs from 'node:fs';
import { type Assistant } from '../../shared/assistants.ts';
import { PROGRAM_LABEL } from '../../shared/programs.ts';
import type { Agent, AgentModel } from '../../shared/types.ts';
import { acpAgents, CONSOLE_ID } from '../agents/acp.ts';
import { allAssistants } from '../assistants/store.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { AGENT_FILE } from '../models/config.ts';

/** The program a session runs on: Claude Code, Codex, Custom (acp, console) or another ACP agent. */
export interface RunsOn {
  agent: Agent;
  acpAgent?: string;
}

const kvKey = (key: string) => `asked:${key}`;

/** Words that stand for something else as often as for a model, so a model is not named by them alone. */
const COMMON = new Set(
  'local my the a an model models new fast small large big mini nano micro free pro max plus lite turbo open chat code coder instruct base latest preview beta helper default best quick standard custom agent experimental reasoning thinking vision'.split(
    ' ',
  ),
);

/** The names of Claude Code and of Codex as people write them. GPT Image is a picture model, not Codex. */
const CLAUDE_NAMES: Name[] = [{ text: 'claude' }];
const CODEX_NAMES: Name[] = [{ text: 'codex' }, { text: 'chatgpt' }, { text: 'gpt', not: 'image' }];

interface Name {
  text: string;
  /** A word that, right after it, makes it name something else. */
  not?: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The script whose letters would make a name's first or last letter part of a longer word ("Codexで" is Codex). */
const SCRIPTS = ['Latin', 'Greek', 'Cyrillic'];
const scriptOf = (ch: string): string | undefined => SCRIPTS.find((s) => new RegExp(`\\p{Script=${s}}`, 'u').test(ch));

/**
 * A name as the person would write it: case aside, its words apart by a space, -, _ or /, not inside a longer word of
 * its script nor in a path or a file name (~/.codex, /claude/, CLAUDE.md); a number may follow it (gpt5, qwen3).
 */
function pattern(n: Name): RegExp | null {
  const words = n.text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!words?.length) return null;
  const body = words.map(escape).join('[\\s_/-]*');
  const first = scriptOf(body[0]);
  const last = scriptOf(body[body.length - 1]);
  const before = `(?<![${first ? `\\p{Script=${first}}` : ''}\\p{N}./\\\\~_-])`;
  const after = last ? `(?!\\p{Script=${last}})` : '';
  return new RegExp(`${before}${body}${after}(?!\\.md\\b)${n.not ? `(?![\\s_-]*${escape(n.not)})` : ''}`, 'iu');
}

/** Custom's models (Settings → Models), as its agent process reads them. */
function customModels(): AgentModel[] {
  try {
    return JSON.parse(fs.readFileSync(AGENT_FILE, 'utf8')).models ?? [];
  } catch {
    return [];
  }
}

/** The first word of a name that is a name (letters, three or more, not a common word): Qwen of "Qwen3 Coder". */
function family(s: string | undefined): string | undefined {
  for (const w of String(s ?? '').toLowerCase().match(/\p{L}+/gu) ?? []) if (w.length >= 3 && !COMMON.has(w)) return w;
  return undefined;
}

/** Whether every word of a name is a common one ("Helper", "Local model"): such a name alone names nothing. */
const allCommon = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).every((w) => COMMON.has(w) || /^\p{N}+$/u.test(w));

/** How the person may name one of Custom's models: by its name, its family (Qwen, Llama, Gemini…) or its plan's program. */
function modelNames(m: AgentModel): Name[] {
  const out: Name[] = [];
  for (const s of [m.label, m.model, m.id]) if (s && !allCommon(s)) out.push({ text: s });
  for (const f of new Set([family(m.label), family(m.model?.split('/').at(-1))])) if (f) out.push(f === 'gpt' ? { text: f, not: 'image' } : { text: f });
  // A model of the person's Claude or ChatGPT plan is named with its program too.
  if (m.provider === 'claude') out.push(...CLAUDE_NAMES);
  if (m.provider === 'codex') out.push(...CODEX_NAMES);
  return out;
}

/** Everything a message can name for a subagent, by id: claude, codex, custom, custom:<model>, acp:<agent>, agent:<the person's agent>. */
function vocabulary(db: DB): { id: string; names: Name[] }[] {
  const out: { id: string; names: Name[] }[] = [
    { id: 'claude', names: CLAUDE_NAMES },
    { id: 'codex', names: CODEX_NAMES },
    // "custom" alone is an everyday word ("a custom parser"): Custom is named with what makes it the app's agent.
    { id: 'custom', names: [{ text: 'custom agent' }, { text: 'custom model' }, { text: 'custom models' }, { text: 'custom session' }] },
  ];
  for (const m of customModels()) out.push({ id: `custom:${m.id}`, names: modelNames(m) });
  for (const a of acpAgents(db)) {
    if (a.id === CONSOLE_ID) continue;
    const first = family(a.name);
    out.push({ id: `acp:${a.id}`, names: [{ text: a.name }, { text: a.id }, ...(first ? [{ text: first }] : [])].filter((n) => !allCommon(n.text)) });
  }
  // The person's agents that run on a program of their own, by their name.
  for (const a of allAssistants(db)) if (a.agent && !allCommon(a.name)) out.push({ id: `agent:${a.id}`, names: [{ text: a.name }] });
  return out;
}

/** What the person named in a session, by id (vocabulary): what its Hydor subagents may run on besides its own program. */
export function askedFor(db: DB, key: string): string[] {
  try {
    const v = JSON.parse(kvGet(db, kvKey(key)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The ids a message names (vocabulary). */
export function namedIn(db: DB, text: string): string[] {
  const t = text.slice(0, 50_000);
  if (!t.trim()) return [];
  return vocabulary(db)
    .filter((v) => v.names.some((n) => pattern(n)?.test(t)))
    .map((v) => v.id);
}

/**
 * Notes the programs, models and agents a message names, for the session's Hydor subagents. Only for what the person
 * typed themselves in it: never what the app or an agent sends.
 */
export function noteAsked(db: DB, key: string, text: unknown): void {
  if (!key || typeof text !== 'string') return;
  try {
    const hit = namedIn(db, text);
    if (!hit.length) return;
    const had = askedFor(db, key);
    const next = [...new Set([...had, ...hit])];
    if (next.length !== had.length) kvSet(db, kvKey(key), JSON.stringify(next));
  } catch (e) {
    console.warn(`[children] could not read what a message asks for: ${(e as Error).message}`);
  }
}

/** A fork of a session (`to`) carries its conversation on: what the person asked for in it holds there too. */
export function copyAsked(db: DB, from: string, to: string): void {
  const had = askedFor(db, from);
  if (had.length && to !== from) kvSet(db, kvKey(to), JSON.stringify([...new Set([...askedFor(db, to), ...had])]));
}

/** Whether two programs are the same: Claude Code, Codex, Custom or one ACP agent. */
export const sameProgram = (a: RunsOn, b: RunsOn): boolean => a.agent === b.agent && (a.agent !== 'acp' || (a.acpAgent ?? CONSOLE_ID) === (b.acpAgent ?? CONSOLE_ID));

/**
 * Whether a Hydor subagent of the session `key` (on `lead`) may run on `child`: its own program always; another one
 * only when the person named it in the session (Custom's model `model`, or Custom by name), or named the agent of theirs
 * it works as (`as`).
 */
export function mayRunOn(db: DB, key: string, lead: RunsOn, child: RunsOn & { model?: string }, as?: Pick<Assistant, 'id'> | null): boolean {
  if (sameProgram(lead, child)) return true;
  const said = new Set(askedFor(db, key));
  if (as && said.has(`agent:${as.id}`)) return true;
  if (child.agent === 'claude' || child.agent === 'codex') return said.has(child.agent);
  if ((child.acpAgent ?? CONSOLE_ID) === CONSOLE_ID) return said.has('custom') || (!!child.model && said.has(`custom:${child.model}`));
  return said.has(`acp:${child.acpAgent}`);
}

/** A program's name as the person sees it: Claude Code, Codex, Custom, Gemini CLI. */
export function programName(db: DB, on: RunsOn): string {
  if (on.agent === 'claude' || on.agent === 'codex') return PROGRAM_LABEL[on.agent];
  if ((on.acpAgent ?? CONSOLE_ID) === CONSOLE_ID) return 'Custom';
  return acpAgents(db).find((a) => a.id === on.acpAgent)?.name ?? on.acpAgent ?? 'another agent';
}

/** What a lead is told when it asks for a Hydor subagent on another program than its own, which the person did not ask for. */
export function otherProgramRefusal(db: DB, lead: RunsOn, wanted: string, as?: Pick<Assistant, 'name'> | null): string {
  const own = programName(db, lead);
  return [
    `This session runs on ${own}, the program the user picked for it, so its Hydor subagents run on ${own} too.`,
    as
      ? `${as.name} runs on ${wanted}: that works only when the user asks for ${as.name} or ${wanted} by name in this conversation, and they have not.`
      : `${wanted} works only when the user asks for it by name in this conversation, and they have not.`,
    `Start this one on ${own} (leave out agent and model: its tier picks ${own}’s model), or do the part yourself.`,
    `When ${own} is at a usage limit, wait for it to lift (a Hydor subagent the limit stopped carries on by itself then, or message_child gives it the work again) or do the part yourself; never move the work to another program, and if it cannot wait, ask the user.`,
  ].join(' ');
}
