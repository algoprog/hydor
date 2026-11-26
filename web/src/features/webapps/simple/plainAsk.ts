// A request for permission in a web app's conversation with Technical details off, in plain words: one sentence on what
// it is for (the agent's own, when it gave one a person can read), and buttons that say what they do. The command or the
// change itself stays behind a button. Pure, so a script reads it (plain-words-test.ts).
import { bannedIn } from '@shared/plain-words';
import type { ApprovalOption, ApprovalRequest } from '@shared/types';
import { tr } from '../../../i18n/runtime';

/** Whether a card is one that shows raw work: a command, a change to a file, a tool's input. The app's own cards say what they do already. */
export const showsRawWork = (a: ApprovalRequest): boolean => (a.kind === 'command' || a.kind === 'file' || a.kind === 'permissions' || a.kind === 'tool' || a.kind === 'other') && !a.prose && !a.form && !a.app && !a.questions?.length && !a.facts?.length;

/** The web apps tools, should the agent's program ask leave to use one. */
const OWN: Record<string, string> = {
  new: 'Make a new app',
  run: 'Put the app together and start it',
  contract_check: 'Check the app',
  launch: 'Put the app online',
  backup: 'Make or put back a copy of what it keeps',
  host: 'Work with your server',
};

const FALLBACK: Record<string, string> = {
  command: 'Run a step on this computer. The agent did not say what it is for.',
  file: 'Change the app’s files',
  permissions: 'Let the agent do more on this computer',
};

export interface PlainAsk {
  sentence: string;
  /** What the button that shows the thing itself says. */
  show: string;
  /** An answer that goes on counting ("always allow…"): offered only once the thing itself is shown, in the agent program's own words, which say how far it goes. */
  standing: (o: ApprovalOption) => boolean;
  label: (o: ApprovalOption) => string;
}

const isNo = (o: ApprovalOption) => o.id === 'cancel' || o.id === 'deny' || o.id === 'decline' || o.style === 'danger';

export function plainAsk(a: ApprovalRequest): PlainAsk {
  const own = /webapp_(new|run|contract_check|launch|backup|host)\b/.exec(a.title)?.[1];
  // One line of the agent's own, taken only when nothing in it is technical.
  const said = (a.say ?? '').split('\n')[0]!.replace(/\s+/g, ' ').trim().slice(0, 160);
  const sentence = own ? tr(OWN[own]!) : said && !bannedIn(said).length ? said.charAt(0).toUpperCase() + said.slice(1) : tr(FALLBACK[a.kind] ?? 'Do something on this computer. The agent did not say what it is for.');
  return {
    sentence,
    show: a.kind === 'command' ? tr('Show the command') : a.kind === 'file' ? tr('Show what changes') : tr('Show the details'),
    standing: (o) => !isNo(o) && o.style !== 'primary',
    label: (o) => (o.id === 'cancel' ? tr('Don’t, and stop') : isNo(o) ? tr('Don’t') : o.style === 'primary' ? tr('Allow') : o.label),
  };
}
