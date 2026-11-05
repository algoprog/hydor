// The inbox: everything waiting on the user (approvals, questions, forms, a browser that needs them, a
// key an agent asked for, a skill to review, a comment from someone a project is shared with), across sessions,
// scheduled tasks and template runs. Each machine lists its own (GET /api/inbox); the page asks the other machines too.
import type { Agent, ApprovalOption, ApprovalRequest } from './types.ts';

export type InboxKind = 'approval' | 'question' | 'form' | 'browser' | 'key' | 'skill' | 'elsewhere' | 'comment';

export interface InboxItem {
  /** Stable while it waits: "approval:<session>:<id>", "browser:<session>:<ask>"… */
  id: string;
  kind: InboxKind;
  /** What is asked, in a line. */
  title: string;
  detail?: string;
  /** The session it waits in: its key, name and agent. */
  key?: string;
  session?: string;
  agent?: Agent;
  /** Since when it waits. */
  at: number;
  /** Where it is answered in the app (on its machine). */
  path: string;
  /** An approval card, answered right in the inbox. */
  approval?: ApprovalRequest;
}

/** A push notification's buttons for an approval that is a plain yes or no. */
export interface QuickAnswer {
  id: string;
  title: string;
  detail?: string;
  approve: ApprovalOption;
  deny: ApprovalOption;
}

const YES = /^(allow|allow_once|accept|approve|yes|ok|once)$/i;
const NO = /^(deny|decline|reject|reject_once|no|cancel)$/i;

/** The approve and deny choices of an approval that needs no more than a yes or a no; null for a question, a form, a plan. */
export function quickAnswer(a: ApprovalRequest): QuickAnswer | null {
  if (a.kind === 'question' || a.kind === 'plan' || a.questions?.length || a.form) return null;
  const approve = a.options.find((o) => o.style === 'primary') ?? a.options.find((o) => YES.test(o.id));
  const deny = a.options.find((o) => o.style === 'danger') ?? a.options.find((o) => NO.test(o.id));
  if (!approve || !deny || approve === deny) return null;
  const detail = a.detail?.split('\n').find((l) => l.trim())?.trim().slice(0, 160);
  return { id: a.id, title: a.title, detail, approve, deny };
}

/** How an approval shows in the inbox. */
export const approvalKind = (a: ApprovalRequest): InboxKind => (a.kind === 'question' || a.questions?.length ? 'question' : a.form ? 'form' : 'approval');
