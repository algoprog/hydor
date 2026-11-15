// The Outbox: calls to a connected account's tools that are set to Ask first, held for the person's OK instead
// of being made (server/outbox/). Each waits in the Inbox as a draft to edit, then Send or Drop; a test run that
// sends nothing keeps its calls here too, as "would have sent". Which tools act outside: outbox-words.ts.
import { toolWords } from './outbox-words.ts';
import type { Agent } from './types.ts';

export { actsOutside, askMarked, ASK_NOTE, DRY_RUN_NOTE, toolWords, type ToolFacts } from './outbox-words.ts';

/** How agents get one of a connected account's tools: freely, held for your OK, or not at all. */
export type ToolState = 'on' | 'ask' | 'off';

/**
 * held: waits for your OK; sending: on its way; sent: made, with its result; failed: made, and the account
 * answered with an error (it waits again, to change and send or to drop); dropped: never made;
 * dry: a test run that sends nothing held it ("would have sent"), never made.
 */
export type HeldStatus = 'held' | 'sending' | 'sent' | 'failed' | 'dropped' | 'dry';

/** How a held call's input shows: an email, a chat message, a post, or the tool's own fields. */
export type HeldShape = 'email' | 'message' | 'post' | 'fields';

export interface HeldCall {
  id: string;
  status: HeldStatus;
  /** The session the agent called it in, its name and agent. */
  key?: string;
  session?: string;
  agent?: Agent;
  /** The scheduled task's run it was part of, and the task's name. */
  run?: string;
  task?: string;
  /** The connected account (its id) and its name. */
  app: string;
  appName: string;
  tool: string;
  /** What the tool does, in the account's words. */
  description?: string;
  /** The input as the agent gave it, or as you changed it. */
  input: Record<string, unknown>;
  /** The tool's input schema, when the account gave one: the card's fields. */
  schema?: { properties?: Record<string, any>; required?: string[] };
  shape: HeldShape;
  /** What the account answered, once it was sent (or why it could not be). */
  result?: string;
  at: number;
  decidedAt?: number;
}

/** What a session's line about a held call shows (a note of kind 'outbox'). */
export interface OutboxNote {
  call: string;
  status: HeldStatus;
  app: string;
  appName: string;
  tool: string;
  /** The call in a line: the account and tool, who or what it goes to. */
  line: string;
  /** The start of what the account answered, once it was sent. */
  result?: string;
}

const has = (input: Record<string, unknown>, schema: HeldCall['schema'], ...names: string[]) => names.some((n) => n in input || !!schema?.properties?.[n]);

/** How a held call's input reads best: an email (To, Subject, Body), a chat message (where, text), a post, or its fields. */
export function heldShape(tool: string, input: Record<string, unknown>, schema?: HeldCall['schema']): HeldShape {
  const w = toolWords(tool);
  if (has(input, schema, 'to', 'recipients', 'recipient') && has(input, schema, 'subject') && has(input, schema, 'body', 'text', 'html', 'content', 'message')) return 'email';
  if (has(input, schema, 'channel', 'channel_id', 'channelId', 'chat_id', 'chatId', 'conversation', 'room', 'thread', 'thread_ts', 'user', 'to') && has(input, schema, 'text', 'message', 'content', 'body')) return 'message';
  if ((w.includes('post') || w.includes('tweet') || w.includes('publish') || w.includes('status')) && has(input, schema, 'text', 'content', 'body', 'status', 'message')) return 'post';
  return 'fields';
}

/** The parts of an input each shape shows first (the first found of each), the rest below them. */
export const SHAPE_FIELDS: Record<Exclude<HeldShape, 'fields'>, { label: string; names: string[]; long?: boolean }[]> = {
  email: [
    { label: 'To', names: ['to', 'recipients', 'recipient'] },
    { label: 'Cc', names: ['cc'] },
    { label: 'Bcc', names: ['bcc'] },
    { label: 'Subject', names: ['subject'] },
    { label: 'Body', names: ['body', 'text', 'content', 'message', 'html'], long: true },
  ],
  message: [
    { label: 'Where', names: ['channel', 'channel_id', 'channelId', 'chat_id', 'chatId', 'conversation', 'room', 'user', 'to'] },
    { label: 'Thread', names: ['thread', 'thread_ts', 'threadTs'] },
    { label: 'Text', names: ['text', 'message', 'content', 'body'], long: true },
  ],
  post: [
    { label: 'Title', names: ['title'] },
    { label: 'Text', names: ['text', 'content', 'body', 'status', 'message'], long: true },
  ],
};

/** A held call in a line: the account and tool, and who or what it goes to. */
export function heldLine(c: Pick<HeldCall, 'appName' | 'tool' | 'input' | 'shape'>): string {
  const pick = (...names: string[]) => {
    for (const n of names) {
      const v = c.input[n];
      if (typeof v === 'string' && v.trim()) return v.trim().replace(/\s+/g, ' ');
      if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string')) return v.join(', ');
    }
    return '';
  };
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const to = pick('to', 'recipients', 'recipient', 'channel', 'channel_id', 'channelId', 'chat_id', 'chatId', 'room', 'user');
  const what = c.shape === 'email' ? pick('subject') : pick('title', 'subject', 'text', 'message', 'content', 'body', 'status');
  return [`${c.appName} · ${c.tool}`, to ? `to ${clip(to, 60)}` : '', what ? `“${clip(what, 80)}”` : ''].filter(Boolean).join(' ');
}
