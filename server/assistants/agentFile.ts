// An agent as a file (.hydor-agent), to keep or to give to someone: JSON with a format version, what the agent is and
// does (its instructions, tools, tier, skills, fields and the kinds of place its results go), its team by name, its
// schedules by the clock as suggestions, and its examples. Nothing of the person's own goes in it: no connected
// accounts, projects, Library pages, email addresses, webhook addresses or keys; the file says in words what was left
// out and has to be set again. Installing one shows first what it brings and needs; an agent of the same name is
// replaced only when you choose to, else it installs beside it.
import fs from 'node:fs';
import {
  AGENT_EXAMPLE_LIMITS,
  AGENT_FILE_FORMAT,
  AGENT_FILE_KIND,
  AGENT_FILE_MAX,
  agentCore,
  cleanAgentExamples,
  placeName,
  portableSchedule,
  programName,
  TOOL_VERBS,
  type AgentFile,
  type AgentInstallPreview,
  type SuggestedSchedule,
} from '../../shared/agent-files.ts';
import { agentMode, TOOL_KINDS, upgradeKinds, type Assistant, type OutputTarget } from '../../shared/assistants.ts';
import type { ScheduledTask } from '../../shared/automations.ts';
import { tierLabel } from '../../shared/tiers.ts';
import type { Agent } from '../../shared/types.ts';
import { acpAgents } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Scheduler } from '../scheduler.ts';
import { validSchedule } from '../scheduler.ts';
import { allAssistants, cleanAssistant, saveAssistant, taskRoot } from './store.ts';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** A place results go, as it travels: without the person's pages, addresses, account or key. */
function portablePlace(t: OutputTarget): OutputTarget {
  if (t.kind === 'library') return t.each === 'new' ? { kind: 'library', each: 'new' } : { kind: 'library' };
  if (t.kind === 'sheet') return { kind: 'sheet', ...(t.tab ? { tab: t.tab } : {}) };
  if (t.kind === 'email') return { kind: 'email', to: [], ...(t.subject ? { subject: t.subject } : {}) };
  if (t.kind === 'webhook') return { kind: 'webhook', url: '' };
  return t;
}

/**
 * An agent as a file. `connName` names a connected account by its id (its app's name, never the account); `version` is
 * the Hydor that writes it.
 */
export function exportAgent(db: DB, scheduler: Pick<Scheduler, 'list'> | null, a: Assistant, o: { connName?: (id: string) => string; version?: string } = {}): AgentFile {
  const core = agentCore(a);
  const leftOut: string[] = [];
  delete core.projects;
  delete core.connections;
  delete core.canAsk;
  if (a.projects?.length) leftOut.push(`The ${a.projects.length === 1 ? 'project' : 'projects'} it works in: it works everywhere until you pick them again.`);
  if (a.connections?.length) leftOut.push(`The connected apps it had on (${names(a.connections.map((c) => o.connName?.(c) ?? c))}): connect them where it is installed, then turn them on in its settings.`);
  const to = a.output?.to ?? [];
  if (to.length) {
    core.output = { ...(a.output?.fields?.length ? { fields: a.output.fields } : {}), to: to.map(portablePlace) };
    if (to.some((t) => (t.kind === 'library' && t.page) || (t.kind === 'sheet' && t.page))) leftOut.push('The Library page and spreadsheet its results went to: its first run where it is installed makes new ones.');
    if (to.some((t) => t.kind === 'email')) leftOut.push('Who its results are emailed to, and from which mail account: set them again under What it hands back.');
    if (to.some((t) => t.kind === 'webhook')) leftOut.push('The address its results are posted to, and its key: set them again under What it hands back.');
  }
  const team = (a.canAsk ?? []).map((id) => allAssistants(db).find((x) => x.id === id)?.name).filter((x): x is string => !!x);
  const mine = (scheduler?.list() ?? []).filter((t: ScheduledTask) => t.extra?.assistant === a.id && !t.app);
  const schedules: SuggestedSchedule[] = mine.filter((t) => portableSchedule(t.schedule)).map((t) => ({ name: t.name, schedule: t.schedule, task: t.prompt }));
  const stay = mine.length - schedules.length;
  if (stay) leftOut.push(`${plural(stay, 'schedule')} that ${stay === 1 ? 'starts' : 'start'} on a watch, a webhook or a date: ${stay === 1 ? 'it stays' : 'they stay'} here.`);
  return {
    hydor: AGENT_FILE_KIND,
    format: AGENT_FILE_FORMAT,
    ...(o.version ? { app: o.version } : {}),
    exportedAt: new Date().toISOString(),
    agent: core,
    ...(team.length ? { team } : {}),
    ...(schedules.length ? { schedules } : {}),
    ...(a.examples?.length ? { examples: a.examples } : {}),
    ...(leftOut.length ? { leftOut } : {}),
  };
}

/** A file's contents read as an agent file; what is wrong with it said plainly. */
export function readAgentFile(raw: unknown): { file: AgentFile; newer: boolean } {
  let v = raw;
  if (Buffer.isBuffer(v)) v = v.toString('utf8');
  if (typeof v === 'string') {
    if (v.length > AGENT_FILE_MAX) throw new HttpError(400, 'That file is too big for an agent file');
    try {
      v = JSON.parse(v.replace(/^﻿/, ''));
    } catch {
      throw new HttpError(400, 'This is not an agent file: it could not be read (a .hydor-agent file is JSON). A Claude Code agent file (.md) comes in with Import.');
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'This is not an agent file');
  const f = v as Record<string, unknown>;
  if (f.hydor === 'app' || (f.recipe && typeof f.recipe === 'object')) throw new HttpError(400, 'This is an app’s file: install it on the Apps page (New app → Install from a file)');
  if (f.hydor !== AGENT_FILE_KIND) throw new HttpError(400, 'This is not a Hydor agent file');
  const format = Number(f.format);
  if (!Number.isFinite(format) || format < 1) throw new HttpError(400, 'This agent file has no format version: it may be broken');
  if (!f.agent || typeof f.agent !== 'object' || Array.isArray(f.agent) || !String((f.agent as Record<string, unknown>).name ?? '').trim()) throw new HttpError(400, 'This agent file has no agent in it: it may be broken');
  return { file: f as unknown as AgentFile, newer: format > AGENT_FILE_FORMAT };
}

/** "Bookkeeper" → "Bookkeeper (2)", or the next number free. */
function freeName(taken: string[], name: string): string {
  const low = new Set(taken.map((t) => t.toLowerCase()));
  if (!low.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const s = `${name.slice(0, 54)} (${n})`;
    if (!low.has(s.toLowerCase())) return s;
  }
}

/** What installing a file would do, before anything is saved: the agent as it would be, what it brings and needs. */
export function previewInstall(db: DB, raw: unknown): AgentInstallPreview {
  const { file, newer } = readAgentFile(raw);
  const notes: string[] = [];
  const needs: string[] = [...(Array.isArray(file.leftOut) ? file.leftOut.map((x) => String(x).slice(0, 400)).slice(0, 12) : [])];
  if (newer) notes.push('This file comes from a newer Hydor: what this one does not know is left out. Update Hydor to install all of it.');
  const given = { ...(file.agent as Record<string, unknown>) };
  // What is the person's own never comes in, whatever the file says.
  for (const k of ['id', 'builtin', 'source', 'projects', 'connections', 'canAsk', 'examples', 'standingKey']) delete given[k];
  // A file from before the browser and the computer had switches of their own: its agent keeps what it could use.
  if (Number(file.format) < 2 && Array.isArray(given.tools)) {
    const tools = upgradeKinds(given.tools);
    if (tools) given.tools = tools;
    else delete given.tools;
  }
  // The places its results go that need something of yours first are left out until you set them.
  const out = given.output && typeof given.output === 'object' ? { ...(given.output as Record<string, unknown>) } : undefined;
  if (out && Array.isArray(out.to)) {
    const keep = (out.to as Record<string, unknown>[]).filter((t) => {
      if (t?.kind === 'email' && !(Array.isArray(t.to) && t.to.length)) return false;
      if (t?.kind === 'webhook' && !t.url) return false;
      return true;
    });
    const dropped = (out.to as Record<string, unknown>[]).length - keep.length;
    if (dropped && !needs.some((n) => /emailed|posted/.test(n))) needs.push('Where its results are emailed or posted: set them again under What it hands back.');
    out.to = keep.map((t) => (t?.kind === 'library' ? { kind: 'library', ...(t.each === 'new' ? { each: 'new' } : {}) } : t?.kind === 'sheet' ? { kind: 'sheet', ...(t.tab ? { tab: t.tab } : {}) } : t));
    given.output = out;
  }
  // A program that is not set up here: it starts with the one picked on the start page.
  if (given.agent === 'acp' && given.acpAgent !== 'console' && !acpAgents(db).some((x) => x.id === given.acpAgent)) {
    notes.push(`It suggested ${String(given.acpAgent ?? 'an agent')}, which is not set up here: its sessions use the program picked on the start page.`);
    delete given.agent;
    delete given.acpAgent;
    delete given.model;
  }
  // Never asking is for you to choose.
  if (given.mode === 'full') {
    given.mode = 'edits';
    notes.push('It never asked before acting (Full access) where it was made; here it starts with Accept edits: it changes files freely and asks before commands. Change it in its settings if you trust it.');
  }
  let agent: Partial<Assistant>;
  try {
    agent = cleanAssistant(given);
  } catch (e) {
    throw new HttpError(400, `This agent file could not be read: ${(e as Error).message}`);
  }
  const ex = cleanAgentExamples(file.examples);
  if (ex.errors.length) notes.push(`Some of its examples were left out: ${ex.errors.slice(0, 3).join('; ')}`);
  const all = allAssistants(db);
  const team = (Array.isArray(file.team) ? file.team : [])
    .map((n) => String(n).trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 30)
    .map((name) => {
      const found = all.find((x) => x.name.toLowerCase() === name.toLowerCase());
      return found ? { name, found: found.id } : { name };
    });
  const missing = team.filter((t) => !t.found).map((t) => t.name);
  if (missing.length) needs.push(`It hands work to ${names(missing)}, which you do not have: it won’t until you have an agent by that name and let it.`);
  const schedules: SuggestedSchedule[] = [];
  for (const s of Array.isArray(file.schedules) ? file.schedules.slice(0, 10) : []) {
    try {
      const schedule = validSchedule(s?.schedule);
      if (!portableSchedule(schedule)) continue;
      schedules.push({ name: String(s.name ?? agent.name).slice(0, 120) || agent.name!, schedule, task: String(s.task ?? '').slice(0, 50_000) || `Do your work as ${agent.name}.` });
    } catch {}
  }
  const tools = agent.tools ? (agent.tools.length ? names(TOOL_KINDS.filter((k) => agent.tools!.includes(k.id)).map((k) => TOOL_VERBS[k.id])) : 'use only the app’s own tools') : 'use everything';
  const fields = agent.output?.fields?.map((f) => f.label) ?? [];
  const lines = (agent.instructions ?? '').split('\n').filter((l) => l.trim()).length;
  const brings = [
    lines ? `Its instructions (${plural(lines, 'line')}).` : 'No instructions.',
    `It may ${tools}.`,
    `It thinks with ${tierLabel(agent.tier)}${agent.agent ? `, on ${programName(agent)}${agent.model ? ` (${agent.model})` : ''}` : ''}.`,
    agent.skills?.length ? `It favors the skills ${names(agent.skills)}.` : '',
    team.some((t) => t.found) ? `It hands work to ${names(team.filter((t) => t.found).map((t) => t.name))}.` : '',
    fields.length ? `It hands back ${names(fields)}.` : '',
    agent.output?.to?.length ? `Its results go to ${names(agent.output.to.map(placeName))}.` : '',
    agent.budgetUsd ? `It spends at most $${agent.budgetUsd} a month.` : '',
    agent.standing ? 'It keeps one conversation of its own, with an inbox.' : '',
    ex.examples.length ? `${plural(ex.examples.length, 'example')} to try it with.` : '',
    schedules.length ? `${plural(schedules.length, 'suggested schedule')}, added paused if you choose.` : '',
  ].filter(Boolean);
  const own = all.filter((x) => !x.builtin);
  const clash = own.find((x) => x.name.toLowerCase() === agent.name!.toLowerCase());
  return {
    agent,
    brings,
    needs,
    notes,
    team,
    schedules,
    examples: ex.examples,
    ...(clash ? { clash: { id: clash.id, name: clash.name } } : {}),
    beside: freeName(all.map((x) => x.name), agent.name!),
    ...(newer ? { newer: true } : {}),
  };
}

/**
 * Installs an agent from its file: beside yours under a free name, or in place of yours of the same name when
 * `replace` (a new version of it, by Installed; your examples stay, after the file's). With `schedules`, its suggested schedules are added, paused, on the
 * program its sessions use (`use` for an agent that suggests none).
 */
export function installAgent(
  d: { db: DB; scheduler: Pick<Scheduler, 'save'> },
  raw: unknown,
  o: { replace?: boolean; schedules?: boolean; use?: { agent?: Agent; acpAgent?: string } } = {},
): { assistant: Assistant; schedules: number; preview: AgentInstallPreview } {
  const p = previewInstall(d.db, raw);
  const replace = !!(o.replace && p.clash);
  const team = p.team.filter((t) => t.found).map((t) => t.found!);
  // Replacing yours: its examples are not in its versions, so yours stay beside the file's (those with another message).
  const mine = replace ? (allAssistants(d.db).find((x) => x.id === p.clash!.id)?.examples ?? []) : [];
  const examples = [...p.examples, ...mine.filter((m) => !p.examples.some((e) => e.message.trim() === m.message.trim()))].slice(0, AGENT_EXAMPLE_LIMITS.examples);
  const body: Record<string, unknown> = {
    ...p.agent,
    name: replace ? p.clash!.name : p.beside,
    examples,
    ...(team.length ? { canAsk: team } : {}),
    ...(replace ? { id: p.clash!.id } : {}),
  };
  const a = saveAssistant(d.db, body, { by: 'install' });
  let made = 0;
  if (o.schedules && p.schedules.length) {
    const agent: Agent = a.agent ?? o.use?.agent ?? 'claude';
    const acpAgent = agent === 'acp' ? (a.agent ? a.acpAgent : o.use?.acpAgent) || 'console' : undefined;
    const cwd = taskRoot(d.db);
    fs.mkdirSync(cwd, { recursive: true });
    for (const s of p.schedules) {
      d.scheduler.save({ name: s.name, schedule: s.schedule, prompt: s.task, agent, acpAgent, cwd, mode: agentMode(a.mode, agent, acpAgent) ?? (agent === 'claude' ? 'default' : agent === 'codex' ? 'auto' : undefined), extra: { assistant: a.id }, enabled: false });
      made++;
    }
  }
  return { assistant: a, schedules: made, preview: p };
}
