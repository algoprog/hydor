// Where a turn's time went (TurnCost shows it): the model, its steps by kind, waiting for you, and the rest, from its
// items, its own numbers and how long each card waited for the user.
import type { TimelineItem, ToolCategory } from '@shared/types';

export type Turn = Extract<TimelineItem, { kind: 'turn' }>;
/** A card the user was asked (an approval, a question, a form): from when to when. */
export interface Wait {
  kind: string;
  at: number;
  until: number;
}

/** Steps by kind, as the breakdown names them. */
const KIND: Record<ToolCategory, 'commands' | 'files' | 'web' | 'other'> = {
  command: 'commands',
  edit: 'files',
  read: 'files',
  search: 'files',
  web: 'web',
  task: 'other',
  todo: 'other',
  mcp: 'other',
  question: 'other',
  plan: 'other',
  message: 'other',
  other: 'other',
};

export const PARTS = [
  { id: 'model', label: 'The model', hint: 'Reading what it was given, thinking and writing', color: 'bg-accent' },
  { id: 'commands', label: 'Commands', color: 'bg-info' },
  { id: 'files', label: 'Reading and editing files', color: 'bg-ok' },
  { id: 'web', label: 'The web', color: 'bg-claude' },
  { id: 'other', label: 'Other steps', color: 'bg-codex' },
  { id: 'wait', label: 'Waiting for you', hint: 'Approvals, questions and forms', color: 'bg-warn' },
  { id: 'rest', label: 'The rest', hint: 'Starting, between steps, and what the agent does not say', color: 'bg-fg-3/40' },
] as const;
export type PartId = (typeof PARTS)[number]['id'];

/** Where a turn's time went, in ms by part; the parts add up to the turn's length. */
export function timeSplit(turn: Turn, work: TimelineItem[], start: number, waits: Wait[]): Record<PartId, number> {
  const total = turn.durationMs ?? 0;
  const end = start + total;
  const wait = Math.min(
    total,
    waits.reduce((n, w) => n + Math.max(0, Math.min(w.until, end) - Math.max(w.at, start)), 0),
  );
  const steps: Record<'commands' | 'files' | 'web' | 'other', number> = { commands: 0, files: 0, web: 0, other: 0 };
  for (const it of work) if (it.kind === 'tool' && it.tool.durationMs && it.tool.durationMs > 0) steps[KIND[it.tool.category] ?? 'other'] += it.tool.durationMs;
  const stepSum = steps.commands + steps.files + steps.web + steps.other;
  // A step that waited for an answer counted the wait as its own: the wait is waiting for you.
  const thought = work.reduce((n, it) => n + (it.kind === 'thinking' ? (it.durationMs ?? 0) : 0), 0);
  const model = Math.min(total, turn.modelMs ?? thought);
  let scale = stepSum ? Math.max(0, stepSum - wait) / stepSum : 0;
  // Steps that ran side by side (helpers, commands at once) can add up to more than the turn: they fill what is left.
  const room = Math.max(0, total - model - wait);
  if (stepSum * scale > room) scale = stepSum ? room / stepSum : 0;
  const out = { model, commands: steps.commands * scale, files: steps.files * scale, web: steps.web * scale, other: steps.other * scale, wait, rest: 0 };
  out.rest = Math.max(0, total - out.model - out.commands - out.files - out.web - out.other - out.wait);
  return out;
}
