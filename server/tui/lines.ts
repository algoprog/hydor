// What each part of a conversation says in the terminal, as lines: your messages, the agent's text (Markdown), its
// steps (one line each, from the step's title or its label, with what matters of its result), thoughts, notices, the
// end of a turn, subagents (Hydor's child sessions) starting and finishing, tier notes, and approval cards with their choices.
// The words follow the web app's (web/src/features/session: items.tsx, outline.ts, Timeline.tsx).
import type { BudgetNote } from '../../shared/budget.ts';
import { childReplyOf, type ChildNote } from '../../shared/children.ts';
import type { SessionNote } from '../../shared/features.ts';
import type { ApprovalOption, ApprovalRequest, ModelOption, TimelineItem, ToolInfo, ToolItem, TurnItem } from '../../shared/types.ts';
import { commandLabel, commandLine } from '../../web/src/lib/commands.ts';
import { renderMarkdown } from './markdown.ts';
import { compact, duration, elapsed, money, strWidth, tildify, truncate, wrap, type Paint } from './term.ts';

/** What drawing needs: the colours, the width, the home folder and the session's folder (for short paths), and how much to show. */
export interface Look {
  p: Paint;
  width: number;
  home: string;
  cwd?: string;
  /** -v: each step's output (its first lines). */
  verbose?: boolean;
  /** --thinking: the agent's thoughts in full. */
  thinking?: boolean;
  /** The program's models, to name a model by its label. */
  models?: ModelOption[];
}

/** Text the agent wrote and steps are indented this much under your messages. */
export const INDENT = '  ';

// ---- models -----------------------------------------------------------------------------------------

/** A model's name as people know it: its label in the program's list, else "Opus 5.5" from "claude-opus-5-5". */
export function modelLabel(id: string | undefined, models?: ModelOption[]): string {
  if (!id) return '';
  if (id === 'auto') return 'Automatic';
  const m = models?.find((x) => x.value === id || x.resolved === id);
  if (m) return m.label;
  const c = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[1m\])?$/.exec(id);
  if (c) return `${c[1][0].toUpperCase()}${c[1].slice(1)} ${c[2]}${c[3] ? `.${c[3]}` : ''}`;
  if (/^(opus|sonnet|haiku|fable)$/.test(id)) return id[0].toUpperCase() + id.slice(1);
  return id;
}

// ---- steps --------------------------------------------------------------------------------------------

const running = (t: ToolInfo) => t.status === 'running' || t.status === 'pending';

/** The verb a step reads with ("Ran", "Edited", "Read"…), as the web app's timeline says it. */
export function verb(t: ToolInfo): string {
  const r = running(t);
  switch (t.category) {
    case 'command':
      if (t.name === 'BashOutput' || t.name === 'TaskOutput' || t.name === 'KillShell' || t.name === 'TaskStop' || t.name === 'write_stdin' || t.title.startsWith('Check on')) return '';
      return r ? 'Running' : 'Ran';
    case 'edit':
      if (t.files?.length === 1 && t.files[0].op === 'create') return r ? 'Creating' : 'Created';
      if (t.files?.length === 1 && t.files[0].op === 'delete') return 'Deleted';
      return r ? 'Editing' : 'Edited';
    case 'read':
      return r ? 'Reading' : 'Read';
    case 'search':
      return r ? 'Searching' : 'Searched';
    case 'web':
      return t.name === 'WebFetch' ? (r ? 'Fetching' : 'Fetched') : r ? 'Searching the web' : 'Searched the web';
    case 'task':
      return t.name === 'Agent' || t.name === 'Task' ? 'Subagent' : '';
    case 'mcp':
      return r ? 'Calling' : 'Called';
    default:
      return '';
  }
}

/** A path as short as it can be: inside the session's folder, from it; else with ~ for the home folder. */
function shortPath(p: string, look: Look): string {
  if (look.cwd && p.startsWith(look.cwd + '/')) return p.slice(look.cwd.length + 1);
  return tildify(p, look.home);
}

/** What a step is, in words: its label (what a command is for) or its verb and title. */
export function stepWords(t: ToolInfo, look: Look): { main: string; more: string } {
  const v = verb(t);
  if (t.category === 'command') {
    const line = commandLine(t.title);
    const label = t.label || (v ? commandLabel(t.title) : undefined);
    if (label) return { main: label, more: line };
    return { main: [v, line || t.name].filter(Boolean).join(' '), more: '' };
  }
  const title = t.category === 'edit' || t.category === 'read' ? shortPath(t.title, look) : t.title;
  return { main: [v, title || t.name].filter(Boolean).join(' '), more: t.subtitle ?? '' };
}

/** The mark a step's line starts with: by how it ended, or the spinner's frame while it runs. */
function stepMark(t: ToolInfo, p: Paint, frame?: string): string {
  if (running(t)) return p.accent(frame ?? '◌');
  if (t.status === 'error') return p.red('✗');
  if (t.status === 'declined') return p.yellow('⊘');
  if (t.status === 'interrupted') return p.yellow('■');
  if (t.status === 'waiting') return p.yellow('◌');
  return p.dim('●');
}

/** The first line of a step's error or output, for a step that failed. */
function failure(t: ToolInfo): string {
  const text = t.error || t.blocked || (t.status === 'error' ? t.output : '') || '';
  return text.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
}

/**
 * A step as lines: one line (cut to the width) with what matters of its result, and under it the first line of its
 * error when it failed, or with -v the first lines of its output. `since`: when it started, while it runs.
 */
export function stepLines(item: ToolItem, look: Look, o: { frame?: string; now?: number } = {}): string[] {
  const t = item.tool;
  const { p, width } = look;
  const { main, more } = stepWords(t, look);
  const added = t.files?.reduce((a, f) => a + f.added, 0) ?? 0;
  const removed = t.files?.reduce((a, f) => a + f.removed, 0) ?? 0;
  const bits: string[] = [];
  if (added || removed) bits.push(`${added ? p.green(`+${added}`) : ''}${added && removed ? ' ' : ''}${removed ? p.red(`−${removed}`) : ''}`);
  if (t.background) bits.push(p.dim('in the background'));
  if (t.auto) bits.push(p.dim(t.auto));
  if (t.exitCode != null && t.exitCode !== 0) bits.push(p.red(`exit ${t.exitCode}`));
  if (t.status === 'declined') bits.push(p.yellow('declined'));
  if (t.status === 'interrupted') bits.push(p.yellow('stopped'));
  if (running(t) && item.ts) bits.push(p.dim(elapsed(item.ts, o.now)));
  else if (t.durationMs != null && t.durationMs >= 1500) bits.push(p.dim(duration(t.durationMs)));
  const tail = bits.length ? `  ${bits.join(p.dim(' · '))}` : '';
  const head = `${INDENT}${stepMark(t, p, o.frame)} `;
  const room = width - strWidth(head) - strWidth(tail);
  const words = more && strWidth(main) + 2 < room ? `${main}  ${p.dim(truncate(more, room - strWidth(main) - 2))}` : truncate(main, room);
  const out = [`${head}${words}${tail}`];
  const why = t.status === 'error' || t.blocked ? failure(t) : '';
  if (why) out.push(truncate(`${INDENT}    ${p.red(why)}`, width));
  if (look.verbose && t.output && !why) {
    const lines = t.output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+$/, '').split('\n');
    for (const l of lines.slice(0, 8)) out.push(truncate(`${INDENT}    ${p.dim(l)}`, width));
    if (lines.length > 8) out.push(`${INDENT}    ${p.dim(`… ${lines.length - 8} more lines`)}`);
  }
  return out;
}

/** "Ran 3 commands, made 2 edits, read 4 files": a run of steps in one line, as the web app folds them. */
export function summarize(items: TimelineItem[]): { text: string; added: number; removed: number; steps: number } {
  let commands = 0;
  let edits = 0;
  let reads = 0;
  let searches = 0;
  let messages = 0;
  let other = 0;
  let added = 0;
  let removed = 0;
  for (const it of items) {
    if (it.kind !== 'tool') continue;
    const c = it.tool.category;
    if (c === 'command') commands++;
    else if (c === 'edit') edits++;
    else if (c === 'read') reads++;
    else if (c === 'search' || c === 'web') searches++;
    else if (c === 'message') messages++;
    else other++;
    for (const f of it.tool.files ?? []) {
      added += f.added;
      removed += f.removed;
    }
  }
  const p: string[] = [];
  if (commands) p.push(commands === 1 ? 'ran 1 command' : `ran ${commands} commands`);
  if (edits) p.push(edits === 1 ? 'made 1 edit' : `made ${edits} edits`);
  if (reads) p.push(reads === 1 ? 'read 1 file' : `read ${reads} files`);
  if (searches) p.push(searches === 1 ? 'searched once' : `searched ${searches} times`);
  if (messages) p.push(messages === 1 ? 'sent 1 message' : `sent ${messages} messages`);
  if (other) p.push(other === 1 ? '1 other step' : `${other} other steps`);
  const text = p.join(', ');
  return { text: text ? text[0].toUpperCase() + text.slice(1) : '', added, removed, steps: commands + edits + reads + searches + messages + other };
}

/** A folded run of steps as one line: "● Ran 3 commands, read 4 files  +14 −2". */
export function foldedLine(items: TimelineItem[], look: Look): string[] {
  const s = summarize(items);
  if (!s.steps) return [];
  const { p } = look;
  const failed = items.filter((i) => i.kind === 'tool' && i.tool.status === 'error').length;
  const bits = [s.added || s.removed ? `${s.added ? p.green(`+${s.added}`) : ''}${s.added && s.removed ? ' ' : ''}${s.removed ? p.red(`−${s.removed}`) : ''}` : '', failed ? p.red(failed === 1 ? '1 failed' : `${failed} failed`) : ''].filter(Boolean);
  return [truncate(`${INDENT}${p.dim('●')} ${s.text}${bits.length ? `  ${bits.join(p.dim(' · '))}` : ''}`, look.width)];
}

// ---- the other kinds ------------------------------------------------------------------------------------

/** The agent's text, drawn as Markdown under your message. */
export function textLines(md: string, look: Look): string[] {
  return renderMarkdown(md.trim(), look.width - INDENT.length, look.p).map((l) => (l ? INDENT + l : l));
}

/** A thought: one dim line ("Thought for 8 s"), or with --thinking its words too. */
export function thoughtLines(item: Extract<TimelineItem, { kind: 'thinking' }>, look: Look): string[] {
  const { p } = look;
  const head = item.durationMs && item.durationMs >= 1000 ? `Thought for ${duration(item.durationMs)}` : 'Thought';
  if (!look.thinking || !item.text.trim()) return [`${INDENT}${p.dim(`∴ ${head}`)}`];
  return [`${INDENT}${p.dim(`∴ ${head}`)}`, ...wrap(p.dim(p.italic(item.text.trim())), look.width, { first: `${INDENT}  `, indent: `${INDENT}  ` })];
}

/** Your message: `›` and its words, wrapped under it. */
export function promptLines(text: string, look: Look, queued = false): string[] {
  const { p } = look;
  const words = text.replace(/\s+$/, '');
  return wrap(p.bold(words) + (queued ? p.dim('  (queued)') : ''), look.width, { first: `${p.accent('›')} `, indent: '  ' });
}

/** A subagent's reply coming back to its lead: one line, in the colour of how it ended. */
export function childReplyLines(text: string, look: Look): string[] | null {
  const r = childReplyOf(text);
  if (!r) return null;
  const { p } = look;
  const line =
    r.ended === 'replied'
      ? `${p.accent('◆')} Subagent finished: ${r.title}`
      : r.ended === 'stopped'
        ? `${p.yellow('◆')} ${p.yellow(`Subagent stopped: ${r.title}`)}${r.why ? p.dim(` · ${r.why}`) : ''}`
        : `${p.red('◆')} ${p.red(`Subagent failed: ${r.title}`)}${r.why ? p.dim(` · ${r.why}`) : ''}`;
  return [truncate(`${INDENT}${line}`, look.width)];
}

/** A user item: your message, a subagent's reply, a message from another session, or a note the app added. */
export function userLines(item: Extract<TimelineItem, { kind: 'user' }>, look: Look): string[] {
  const { p } = look;
  const child = childReplyLines(item.text, look);
  if (child) return child;
  if (item.peer) return wrap(p.dim(`✉ From ${item.peer.name ?? 'another session'}: ${item.text.trim()}`), look.width, { first: INDENT, indent: `${INDENT}  ` }).slice(0, 4);
  if (item.meta === 'note' || item.meta === 'command-output') return wrap(p.dim(item.text.trim()), look.width, { first: INDENT, indent: INDENT }).slice(0, 4);
  return promptLines(item.text, look);
}

/** A notice: dim, or in the colour of a warning or an error. */
export function systemLines(item: Extract<TimelineItem, { kind: 'system' }>, look: Look): string[] {
  const { p } = look;
  // A task in the background that ended: one line, as a subagent's reply is.
  const bg = /^Background task (\w+): ([\s\S]*)$/.exec(item.text.trim());
  if (bg) {
    const [, status, what] = bg;
    const line =
      status === 'completed'
        ? `${p.accent('◆')} Finished in the background: ${what}`
        : status === 'failed'
          ? `${p.red('◆')} ${p.red(`Failed in the background: ${what}`)}`
          : `${p.yellow('◆')} ${p.yellow(`${status === 'stopped' || status === 'killed' ? 'Stopped' : status[0].toUpperCase() + status.slice(1)} in the background: ${what}`)}`;
    return [truncate(`${INDENT}${line.replace(/\s+/g, ' ')}`, look.width)];
  }
  const c = item.level === 'error' ? p.red : item.level === 'warn' ? p.yellow : p.dim;
  return wrap(c(item.text.trim()), look.width, { first: `${INDENT}${c('·')} `, indent: `${INDENT}  ` });
}

/** The end of a turn: "✓ 1m 04s · $0.31 · Opus 5.5 · 1 subagent". */
export function turnLines(item: TurnItem, look: Look, o: { helpers?: number; costUsd?: number } = {}): string[] {
  const { p } = look;
  const bits: string[] = [];
  if (item.durationMs) bits.push(duration(item.durationMs));
  const cost = o.costUsd ?? item.costUsd;
  if (cost) bits.push(money(cost));
  if (item.tokens && (item.tokens.input || item.tokens.output) && look.verbose) bits.push(`${compact(item.tokens.input + (item.tokens.cacheRead ?? 0))} in · ${compact(item.tokens.output)} out`);
  if (item.model) bits.push(modelLabel(item.model, look.models));
  if (o.helpers) bits.push(o.helpers === 1 ? '1 subagent' : `${o.helpers} subagents`);
  const rest = bits.join(' · ');
  if (item.status === 'interrupted') return [`${INDENT}${p.yellow('■')} ${p.dim(['Stopped', rest].filter(Boolean).join(' · '))}`];
  if (item.status === 'failed') return [`${INDENT}${p.red('✗')} ${p.red('Failed')}${rest ? p.dim(` · ${rest}`) : ''}`];
  return [`${INDENT}${p.green('✓')} ${p.dim(rest || 'Done')}`];
}

/** A timeline item as lines (its kind decides how), or none for what does not show (an empty short thought). */
export function itemLines(item: TimelineItem, look: Look): string[] {
  switch (item.kind) {
    case 'user':
      return userLines(item, look);
    case 'assistant':
      return item.text.trim() ? textLines(item.text, look) : [];
    case 'thinking':
      return !item.text.trim() && (item.durationMs ?? 0) < 3000 && !item.streaming ? [] : thoughtLines(item, look);
    case 'tool':
      return stepLines(item, look);
    case 'system':
      return systemLines(item, look);
    case 'turn':
      return turnLines(item, look);
  }
}

// ---- notes ----------------------------------------------------------------------------------------------

/** What a tier note says (kind "tier"): Automatic picked a tier, or a subagent stepped up one. */
export interface TierNote {
  event: 'auto' | 'stepUp';
  tier: string;
  label?: string;
  why?: string;
}

const TIER_NAMES: Record<string, string> = { quick: 'Quick', standard: 'Standard', best: 'Best', max: 'Max' };
/** A tier's label (Quick, Standard, Best, Max), whether this version knows the tier or not. */
export const tierName = (t?: string) => (t ? (TIER_NAMES[t] ?? t[0].toUpperCase() + t.slice(1)) : '');

/** A note the app added to the conversation, as lines: subagents starting, tiers, a spending cap; null for kinds not shown here. */
export function noteLines(n: SessionNote, look: Look): string[] | null {
  const { p } = look;
  if (n.kind === 'child') {
    const c = n.data as ChildNote;
    const bits = [c.label, c.tier ? tierName(c.tier) : ''].filter(Boolean).join(' · ');
    const head = c.steppedFrom ? `Subagent stepped up to ${tierName(c.tier)}: ${c.title}` : `Subagent started: ${c.title}`;
    return [truncate(`${INDENT}${p.accent('◆')} ${head}${bits ? p.dim(` · ${bits}`) : ''}`, look.width)];
  }
  if (n.kind === 'tier') {
    const t = n.data as TierNote;
    const which = `${tierName(t.tier)}${t.label ? ` (${t.label})` : ''}`;
    const words = t.event === 'stepUp' ? `Stepped up to ${which}` : `Automatic picked ${which}`;
    return wrap(`${words}${t.why ? p.dim(`: ${t.why}`) : ''}`, look.width, { first: `${INDENT}${p.accent('◆')} `, indent: `${INDENT}  ` });
  }
  if (n.kind === 'budget') {
    const b = n.data as BudgetNote;
    const whose = b.parent ? `its lead’s spending cap (${b.parent.title})` : 'its spending cap';
    return [truncate(`${INDENT}${p.yellow('■')} Stopped at ${whose}: ${money(b.spentUsd)} of ${money(b.capUsd)}`, look.width)];
  }
  return null;
}

// ---- approvals --------------------------------------------------------------------------------------------

const DENY = new Set(['deny', 'decline', 'reject', 'cancel', 'abort']);
/** Whether an option says no. */
export const isDeny = (o: ApprovalOption) => DENY.has(o.id) || /^(deny|decline|skip|reject|keep planning|not now)/i.test(o.label);

/** The single keys that answer an approval: `y` its first option that allows, `n` its option that denies, a digit any. */
export function approvalKeys(a: ApprovalRequest): { key: string; option: ApprovalOption }[] {
  const out: { key: string; option: ApprovalOption }[] = [];
  const yes = a.options.find((o) => !isDeny(o));
  const no = a.options.find(isDeny);
  if (yes) out.push({ key: 'y', option: yes });
  if (no) out.push({ key: 'n', option: no });
  a.options.forEach((o, i) => i < 9 && out.push({ key: String(i + 1), option: o }));
  return out;
}

/** The body an answer sends (POST /api/sessions/:key/approvals/:id), as the web app's card sends it. */
export function approvalBody(a: ApprovalRequest, optionId: string, o: { message?: string; answers?: Record<string, string>; form?: Record<string, string> } = {}) {
  const deny = DENY.has(optionId);
  return {
    decision: optionId,
    message: !a.form && deny && o.message ? o.message : undefined,
    answers: o.answers ?? {},
    form: a.form && !deny ? o.form : undefined,
  };
}

/** What the terminal cannot show of an approval (a signature pad, an app's keys): why, or '' when it can. */
export function approvalNeedsApp(a: ApprovalRequest): string {
  if (a.signature) return 'It is about a signature';
  if (a.app?.secrets?.length) return 'It needs a key for an app';
  return '';
}

/** An approval's card as lines: its title, its detail (a command, a file's change, a plan), then its choices. */
export function approvalLines(a: ApprovalRequest, look: Look, o: { detailRows?: number } = {}): string[] {
  const { p, width } = look;
  const icon = a.kind === 'question' ? '?' : a.form ? '☐' : '!';
  const out = wrap(p.bold(a.title), width, { first: `${INDENT}${p.yellow(icon)} `, indent: `${INDENT}  ` });
  if (a.from) out.push(`${INDENT}  ${p.dim(`Asked by ${a.from}`)}`);
  if (a.app?.given.length) out.push(...wrap(p.dim(`From your message: ${a.app.given.map((g) => `${g.label}: ${g.value}`).join(' · ')}`), width, { first: `${INDENT}  `, indent: `${INDENT}  ` }));
  if (a.detail) {
    const max = o.detailRows ?? 30;
    let lines: string[];
    if (a.kind === 'plan' || a.prose) lines = renderMarkdown(a.detail, width - 4, p);
    else if (a.kind === 'file') {
      const [file, ...diff] = a.detail.split('\n');
      lines = [p.bold(shortPath(file, look)), ...diff.map((l) => (l.startsWith('+') ? p.green(l) : l.startsWith('-') ? p.red(l) : p.dim(l)))];
    } else lines = a.detail.replace(/\s+$/, '').split('\n').map((l) => (a.kind === 'command' && l.startsWith('# ') ? p.dim(l) : l));
    const shown = lines.slice(0, max);
    for (const l of shown) out.push(truncate(`${INDENT}    ${l}`, width));
    if (lines.length > max) out.push(`${INDENT}    ${p.dim(`… ${lines.length - max} more lines`)}`);
  }
  if (a.form?.url) out.push(`${INDENT}  ${p.underline(a.form.url)}`);
  return out;
}

/** The choices of an approval, one line: "y Allow · 2 Always allow Bash(npm test) · n Deny". */
export function choiceLine(a: ApprovalRequest, look: Look): string {
  const { p } = look;
  const keys = approvalKeys(a);
  const parts = a.options.map((o, i) => {
    const k = keys.find((x) => x.option === o && (x.key === 'y' || x.key === 'n'))?.key ?? String(i + 1);
    return `${p.accent(p.bold(k))} ${o.label}`;
  });
  return truncate(`${INDENT}  ${parts.join(p.dim('  ·  '))}`, look.width);
}

/** One line on a step that waits: what shows in the region while it runs. */
export function runningLine(item: ToolItem, look: Look, frame: string, now = Date.now()): string {
  return stepLines(item, { ...look, verbose: false }, { frame, now })[0];
}

