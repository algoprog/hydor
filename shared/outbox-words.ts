// Which of a connected account's tools act outside (send, post, publish, reply, invite, share, delete, pay…), judged by
// their names, descriptions and MCP's hints; and what agents are told of Ask first and of a test that sends nothing.
// Words for agents and for code, none the pages show (scripts/i18n-extract.mjs leaves this file out).

/** What a tool says of itself: its name, its description and MCP's hints. */
export interface ToolFacts {
  name: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean; [k: string]: unknown };
}

/** A tool's name (or a sentence) in words: gmail_sendEmail → gmail, send, email. */
export const toolWords = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Verbs of tools that only look: the first of these or of OUT in a name decides. */
const LOOK = new Set(
  'get list search find read fetch query view show describe lookup look count check download export preview browse retrieve inspect watch poll status info whoami me summarize summarise analyze analyse validate estimate calculate'.split(
    ' ',
  ),
);
/** Verbs of tools that act outside: send, post, delete, pay and the like. */
const OUT = new Set(
  'send post publish reply respond forward tweet retweet repost invite share broadcast announce notify email mail text sms dm message comment delete remove destroy trash purge erase wipe revoke unpublish pay purchase checkout charge refund payout buy donate tip withdraw transfer trade order merge deploy push'.split(
    ' ',
  ),
);
/** Verbs that act outside when what they make or change is seen by others (create_issue, update_post). */
const MAKE = new Set('create add new open schedule make place submit start update edit patch close reopen'.split(' '));
const SEEN = new Set(
  'issue issues pull pr comment comments post posts message messages tweet event events invite invitation review release discussion reply email mail payment order charge invoice transfer payout refund subscription status story reaction'.split(' '),
);
/** A tool that makes or changes only what stays yours (a draft, a note): never outside by these words. */
const OWN = new Set(['draft', 'drafts', 'note', 'notes', 'label', 'labels', 'bookmark', 'bookmarks']);

/** Whether a tool acts outside (sends, posts, publishes, replies, invites, shares, deletes, removes, pays, transfers, refunds…). */
export function actsOutside(t: ToolFacts): boolean {
  const a = t.annotations ?? {};
  if (a.readOnlyHint === true) return false;
  if (a.destructiveHint === true) return true;
  const w = toolWords(t.name);
  const verdict = byWords(w);
  if (verdict !== null) return verdict;
  // A name that says nothing either way (a service's own word): its description's first verb decides.
  const first = toolWords(t.description ?? '').find((x) => x.length > 1) ?? '';
  const verb = first.replace(/ies$/, 'y').replace(/(?<=[^s])s$/, '').replace(/(?<=sh|ch)es$/, '');
  return SAYS_OUT.has(verb);
}

/** A description that starts with one of these ("Sends an email…") is of a tool that acts outside. */
const SAYS_OUT = new Set(
  'send post publish reply forward tweet retweet invite share broadcast announce notify delete remove destroy trash purge erase revoke unpublish pay purchase charge refund transfer buy donate withdraw merge deploy push'.split(' '),
);

/** What a name's words say: true (acts outside), false (only looks, or keeps it yours), null (nothing either way). */
function byWords(w: string[]): boolean | null {
  for (let i = 0; i < w.length; i++) {
    const x = w[i];
    const rest = w.slice(i + 1);
    if (LOOK.has(x)) return false;
    if (OUT.has(x)) {
      if (NOUNISH.has(x)) {
        // A word that is also a thing: a verb first in the name or before what it acts on (message_user, post_message),
        // a thing after another word (mark_email) or before a verb (gmail_message_get, order_status).
        if (!rest.length) {
          if (i === 0) return true;
          continue;
        }
        if (rest.some((y) => LOOK.has(y) || MAKE.has(y))) continue;
        if (rest.some((y) => OWN.has(y))) return false;
        return true;
      }
      if (OWN.has(rest[0] ?? '') && !['send', 'publish', 'delete', 'remove', 'share'].includes(x)) return false;
      return true;
    }
    if (MAKE.has(x)) {
      if (rest.some((y) => OWN.has(y))) return false;
      if (rest.some((y) => SEEN.has(y))) return true;
      if (rest.some((y) => OUT.has(y) && !NOUNISH.has(y))) return true;
      return false;
    }
  }
  return null;
}

/** Words of OUT that are also things (an email, a post): they act outside only where they read as a verb. */
const NOUNISH = new Set(['message', 'email', 'mail', 'text', 'sms', 'dm', 'order', 'comment', 'post', 'share', 'tweet', 'trade', 'transfer', 'tip', 'charge', 'refund', 'payout']);

/** What a tool on Ask first says of itself in an agent's list: so it knows a call waits for the person's OK (Custom does not ask again). */
export const ASK_NOTE = "(Ask first: a call is held in the user's Outbox for their OK, and made when they send it; you get an answer saying so at once.)";
export function askMarked<T extends object>(t: T): T {
  const x = t as { description?: unknown; _meta?: unknown };
  const meta = x._meta && typeof x._meta === 'object' ? (x._meta as Record<string, unknown>) : {};
  return { ...t, description: `${typeof x.description === 'string' ? x.description : ''} ${ASK_NOTE}`.trim(), _meta: { ...meta, 'hydor/askFirst': true } };
}

/** What the agent of a test that sends nothing is told with its task (server/scheduler.ts). */
export const DRY_RUN_NOTE =
  "This is a test that sends nothing: a call you make to a connected account's tool that sends, posts, publishes, replies, invites, shares, deletes or pays (or one set to Ask first) is not made. It answers at once that it was kept as one it would have sent, and the user sees it in the run's history. Carry on as if it had gone through; do not try another way to send it.";
