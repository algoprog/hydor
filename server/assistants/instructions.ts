// What an assistant and the user's tone add to an agent's instructions, worded for each agent, and the
// limits each agent's own program can enforce: Claude Code's --disallowedTools and --strict-mcp-config,
// Codex's web_search setting and its MCP servers' disabled_tools. Custom leaves the tools out itself
// (server/agent/main.ts asks /agent/run/<token>/assistant before each turn).
import { CLAUDE_TOOLS, toolAllowed, toolsOff, type Assistant, type ToolKind } from '../../shared/assistants.ts';
import type { Agent } from '../../shared/types.ts';
import type { SpawnAdditions } from '../features/types.ts';

export interface Target {
  agent: Agent;
  /** For agent "acp": which one ("console" is Custom). */
  acpAgent?: string;
}

const isCustom = (t: Target) => t.agent === 'acp' && t.acpAgent === 'console';

const DOING: Record<ToolKind, string> = {
  read: 'read files',
  edit: 'create or change files',
  run: 'run commands or programs',
  web: 'use the web',
  mcp: 'use other tools (MCP servers and plugins beyond the app’s own and the connected accounts)',
};

const or = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

/** What the assistant may not do: switched off where the agent's program can, asked of it elsewhere. */
function limits(off: ToolKind[], t: Target): string {
  const enforced = t.agent === 'claude' || isCustom(t);
  // Codex reads files through its shell: when reading is allowed, the shell stays for that alone.
  const shellToRead = t.agent === 'codex' && off.includes('run') && !off.includes('read');
  const not = off.filter((k) => !(shellToRead && k === 'run')).map((k) => DOING[k]);
  const out: string[] = [];
  if (not.length) out.push(enforced ? `Limits: in this session you cannot ${or(not)}; those tools are switched off.` : `Limits: in this session do not ${or(not)}.`);
  if (shellToRead) out.push('Use the shell only to read and search files (ls, cat, head, rg), never to change files, install anything or run programs.');
  out.push('When the task needs something you cannot do here, say so rather than working around it.');
  return out.join(' ');
}

function skillsLine(skills: string[], t: Target): string {
  const how = t.agent === 'claude' ? 'load it with the Skill tool' : isCustom(t) ? 'load it with the skill tool' : 'read its SKILL.md';
  return `Skills to favor: ${skills.join(', ')}. When one of them fits the task, ${how} before you start, and follow it.`;
}

function assistantBlock(a: Assistant, t: Target): string {
  const out = [`# Assistant: ${a.name}`, 'The user picked this assistant for this session. Work this way throughout; what they ask in the conversation comes first.'];
  if (a.instructions.trim()) out.push('', a.instructions.trim());
  const off = toolsOff(a);
  if (off.length) out.push('', limits(off, t));
  if (a.skills?.length) out.push('', skillsLine(a.skills, t));
  return out.join('\n');
}

/** The assistant's block (when there is one) and the user's tone, for one agent; empty when neither applies. */
export function instructionsFor(a: Assistant | null, tone: string, t: Target): string {
  const parts: string[] = [];
  if (a) parts.push(assistantBlock(a, t));
  if (tone.trim()) parts.push(`# How to talk to the user\nIn their own words: ${tone.trim().replace(/\s+/g, ' ')}\nKeep to this in every reply, unless they ask for something else in the conversation.`);
  return parts.join('\n\n');
}

/**
 * What the agent hears with the user's next message after they switched the session to assistant `a` (from
 * `from`, or from none): the switch, and the new assistant's block unless the agent's instructions have it
 * already (`has`: it started since, or it is Custom, which reads them before each turn).
 */
export function switchNote(from: Assistant | null, a: Assistant, t: Target, has: boolean): string {
  const what = from ? `The user switched this session's assistant from ${from.name} to ${a.name}.` : `The user picked the ${a.name} assistant for this session.`;
  if (has) return `${what} Its instructions ("# Assistant: ${a.name}") are now in yours: work that way from here on.`;
  return `${what} From here on, work as below${from ? '; this takes the place of the assistant instructions you had before' : ''}.\n\n${assistantBlock(a, t)}`;
}

/**
 * What a starting Claude Code or Codex agent gets: the instructions, and the limits its program can
 * enforce. `appTools` are the app's own tools as Claude Code names them ("mcp__naget-agent__web_search").
 */
export function spawnFor(a: Assistant | null, tone: string, t: Target, appTools: string[]): SpawnAdditions {
  const text = instructionsFor(a, tone, t);
  const out: SpawnAdditions = { instructions: text ? [text] : [] };
  const off = a ? toolsOff(a) : [];
  if (!a || !off.length) return out;
  // The app's tools that fall under what is off: web_search and read_page without the web.
  const appOff = appTools.filter((n) => !toolAllowed(n, a.tools));
  if (t.agent === 'claude') {
    out.disallowedTools = [...off.flatMap((k) => CLAUDE_TOOLS[k]), ...appOff];
    // Only the MCP servers the app gives it (its own, the connected apps): none of the user's.
    if (off.includes('mcp')) out.strictMcp = true;
  } else if (t.agent === 'codex') {
    if (appOff.length) out.disallowedTools = appOff;
    if (off.includes('web')) out.codexConfig = { web_search: 'disabled' };
  }
  return out;
}
