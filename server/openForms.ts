// The forms agents ask with ask_form never expire. Each is kept here while it is open. One the user has not answered
// by the time its tool call has to end (the agent's time for a step is up, the agent stopped, or the app restarted
// while it waited) stands: the conversation keeps showing it, with the same card, until the user answers it or puts it
// away (Not now), and its answers then reach the session as the user's next message.
import type { ApprovalRequest } from '../shared/types.ts';
import { kvGet, kvSet, type DB } from './db.ts';

const KV = 'forms.open';

export interface OpenForm {
  /** The session it was asked in. */
  key: string;
  card: ApprovalRequest;
  /** Its fields as a JSON schema, to read the answers in their types. */
  schema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
  /** Still answered through its tool call; false: standing, its answers sent as a message. */
  live: boolean;
}

function all(db: DB): Record<string, OpenForm> {
  try {
    const m = JSON.parse(kvGet(db, KV) ?? '{}');
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

const save = (db: DB, m: Record<string, OpenForm>) => kvSet(db, KV, JSON.stringify(m));

/** A form shown now, answered through its tool call while that lasts. */
export function keepForm(db: DB, f: OpenForm) {
  const m = all(db);
  m[f.card.id] = f;
  save(db, m);
}

/** Its tool call is over without an answer: it stands. False when it is not open (answered, put away). */
export function standForm(db: DB, id: string): boolean {
  const m = all(db);
  if (!m[id]) return false;
  m[id].live = false;
  save(db, m);
  return true;
}

export function dropForm(db: DB, id: string) {
  const m = all(db);
  if (!m[id]) return;
  delete m[id];
  save(db, m);
}

export const standingForm = (db: DB, key: string, id: string): OpenForm | undefined => {
  const f = all(db)[id];
  return f && f.key === key && !f.live ? f : undefined;
};

/** A session's standing forms, as the cards the conversation shows. */
export const standingForms = (db: DB, key: string): ApprovalRequest[] =>
  Object.values(all(db))
    .filter((f) => f.key === key && !f.live)
    .map((f) => f.card);

/** At the app's start: the forms whose tool call went with its last run stand now. The sessions they are in. */
export function standAll(db: DB): string[] {
  const m = all(db);
  const keys = new Set<string>();
  for (const f of Object.values(m))
    if (f.live) {
      f.live = false;
      keys.add(f.key);
    }
  if (keys.size) save(db, m);
  return [...keys];
}

/** A standing form's answers as the user's message: each field's label and what they gave. */
export function answersText(f: OpenForm, content: Record<string, unknown>): string {
  const label = (id: string) => f.card.form?.fields.find((x) => x.id === id)?.label ?? id;
  const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v && typeof v === 'object' ? JSON.stringify(v) : String(v));
  const lines = Object.entries(content)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `- ${label(k)}: ${show(v)}`);
  return `My answers to “${f.card.title}”:\n${lines.join('\n') || '(I left it empty.)'}`;
}
