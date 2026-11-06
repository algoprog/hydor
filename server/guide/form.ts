// ask_form: an agent asks the user for several things at once with a form in the conversation (a trip's dates
// and budget, a new space's name and folder…), shown as a card with the same controls as a template's form;
// the answers come back in the schema's own types. Any agent has it, whatever its own program offers. Its forms never
// expire: one still unanswered when its tool call has to end stands in the conversation until the user answers it or
// puts it away, and its answers then come as the user's next message (openForms.ts).
// fillForm is the card itself, for the app's other tools that ask before they act (an image's settings).
import crypto from 'node:crypto';
import { formContent, formFields } from '../../shared/forms.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import type { RunCtx, ToolOutput } from '../features/types.ts';
import { dropForm, keepForm, standForm } from '../openForms.ts';

type Json = Record<string, any>;

/** How long the form waits within its tool call (under Codex's ten minutes for one); ask_form's then stands. */
const WAIT_MS = 570_000;

/** What became of a form: the answers in the schema's types, or why there are none. */
export type FormAnswer = { ok: true; content: Record<string, unknown> } | { ok: false; why: 'nobody' | 'empty' | 'timeout' | 'withdrawn' | 'declined' | 'standing' };

/**
 * Shows a form on a card in the run's conversation and waits for the user's answer. With `stand` (ask_form), a form not
 * answered by the time its tool call ends stays open in the conversation, its answers coming as a message.
 */
export async function fillForm(ctx: RunCtx, o: { title: string; message?: string; schema: { properties: Json; required?: string[] }; submit?: string; waitMs?: number; stand?: boolean }): Promise<FormAnswer> {
  const schema = { type: 'object' as const, properties: o.schema.properties, required: o.schema.required ?? [] };
  const fields = formFields(schema);
  if (!fields.length) return { ok: false, why: 'empty' };
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return { ok: false, why: 'nobody' };
  const card: ApprovalRequest = {
    id: `form-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'other',
    title: o.title.trim().replace(/\s+/g, ' ').slice(0, 120) || 'A few details, please',
    // The app's own forms say what they need whole (an image's description); ask_form's message is cut to fit.
    detail: o.message?.trim() || undefined,
    prose: true,
    options: [
      { id: 'accept', label: o.submit?.trim().slice(0, 30) || 'Send', style: 'primary' },
      { id: 'decline', label: 'Not now' },
    ],
    form: { fields },
    createdAt: Date.now(),
  };
  const limit = AbortSignal.timeout(o.waitMs ?? WAIT_MS);
  const check = (x: ApprovalAnswer) => {
    if (x.decision !== 'accept') return null;
    const [field, why] = Object.entries(formContent(schema, x.form ?? {}).errors)[0] ?? [];
    return field ? `${fields.find((f) => f.id === field)?.label ?? field}: ${why}` : null;
  };
  const db = ctx.deps.db;
  if (o.stand) keepForm(db, { key: ctx.key, card, schema, live: true });
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit, check });
  if (!answer) {
    // Its time within the tool call is up, or the turn ended: it stays, and the user answers when they can.
    if (o.stand && standForm(db, card.id)) {
      ctx.deps.sessions.formsChanged(ctx.key);
      return { ok: false, why: 'standing' };
    }
    return { ok: false, why: limit.aborted ? 'timeout' : 'withdrawn' };
  }
  if (o.stand) dropForm(db, card.id);
  if (answer.decision !== 'accept') return { ok: false, why: 'declined' };
  return { ok: true, content: formContent(schema, answer.form ?? {}).content };
}

export async function askForm(a: Json, ctx: RunCtx): Promise<ToolOutput> {
  const props: Json = a.fields && typeof a.fields === 'object' && !Array.isArray(a.fields) ? a.fields : {};
  const r = await fillForm(ctx, {
    title: String(a.title ?? ''),
    message: typeof a.message === 'string' ? a.message.trim().slice(0, 4000) : undefined,
    schema: { properties: props, required: Array.isArray(a.required) ? a.required.map(String) : [] },
    submit: String(a.submit ?? ''),
    stand: true,
  });
  if (r.ok) return { text: `The user filled in the form:\n${JSON.stringify(r.content, null, 1)}` };
  switch (r.why) {
    case 'empty':
      return { text: 'fields: at least one, as a JSON schema’s properties ({ "name": { "type": "string", "title": "Name" } }).', isError: true };
    case 'nobody':
      return { text: 'Nobody can fill it in now (the session is not running in the app): ask in your reply instead.', isError: true };
    case 'standing':
      return {
        text: 'The user has not filled in the form yet. It stays open in the conversation, and their answers will come to you as their next message: end your turn now, saying in a line that you will go on once they have answered. Do not ask the same in words.',
      };
    case 'timeout':
      return { text: 'The user did not fill in the form in time; it was withdrawn. Ask in your reply instead.', isError: true };
    case 'withdrawn':
      return { text: 'The form was withdrawn before the user answered.', isError: true };
    default:
      return { text: 'The user closed the form without filling it in. Ask in words if you still need it, or go on without it.' };
  }
}
