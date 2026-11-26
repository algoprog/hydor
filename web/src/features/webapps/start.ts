// How a new web app is started: the first message the person sees, and what the session is told (`webKind`). Pure, so a script
// tests it (start-test.ts).
import type { WebKind, WebKindPick } from '@shared/webapps';

/** What turns words into the person's language (the app's `tr`); the tests give none. */
export type Say = (s: string) => string;
const same: Say = (s) => s;

/** An agent app that is to get pages of its own. */
export interface ForAgentApp {
  id: string;
  name: string;
}

export interface StartPlan {
  prompt: string;
  webKind: WebKindPick;
  /** The name of the web app to make first, in whose folder the conversation then works. */
  make: string;
  /** That name is not the person's: the agent suggests one. */
  placeholder?: boolean;
}

export function planStart(o: { kind: WebKind | null; agent?: ForAgentApp; name: string; line: string }, t: Say = same): StartPlan {
  const { kind, agent } = o;
  const name = o.name.trim();
  const line = o.line.trim();
  const title = name || agent?.name || (kind ? t(kind.name) : t('My app'));
  // Their words alone, when they gave no name: the app's name until the agent suggests one says nothing.
  const own = !name && !agent && line;
  const what = agent ? `${t('Make a web app of its own for the agent app')} “${agent.name}”: ${title}.` : own ? `${t('Make me a web app')}${kind ? ` (${t(kind.name)})` : ''}:` : `${t('Make me a web app')}: ${title}${kind && title !== t(kind.name) ? ` (${t(kind.name)})` : ''}.`;
  return {
    prompt: [what, line].filter(Boolean).join(' '),
    ...(!name && !agent ? { placeholder: true } : {}),
    webKind: { ...(kind ? { kind: kind.id } : {}), ...(agent ? { agentApp: agent.id } : {}), ...(name ? { name } : {}), ...(line ? { line } : {}) },
    make: title,
  };
}
