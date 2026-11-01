// ask_form: an agent asks the user for several things at once with a form in the conversation (a trip's dates
// and budget, a new space's name and folder…), shown as a card with the same controls as a template's form;
// the answers come back in the schema's own types. Any agent has it, whatever its own program offers.
import crypto from 'node:crypto';
import { formContent, formFields } from '../../shared/forms.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import type { RunCtx, ToolOutput } from '../features/types.ts';

type Json = Record<string, any>;

/** How long the form waits (under Codex's ten minutes for a tool call). */
const WAIT_MS = 570_000;

export async function askForm(a: Json, ctx: RunCtx): Promise<ToolOutput> {
  const props: Json = a.fields && typeof a.fields === 'object' && !Array.isArray(a.fields) ? a.fields : {};
  const schema = { type: 'object', properties: props, required: Array.isArray(a.required) ? a.required.map(String) : [] };
  const fields = formFields(schema);
  if (!fields.length) return { text: 'fields: at least one, as a JSON schema’s properties ({ "name": { "type": "string", "title": "Name" } }).', isError: true };
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return { text: 'Nobody can fill it in now (the session is not running in the app): ask in your reply instead.', isError: true };
  const card: ApprovalRequest = {
    id: `form-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'other',
    title: String(a.title ?? '').trim().replace(/\s+/g, ' ').slice(0, 120) || 'A few details, please',
    detail: typeof a.message === 'string' && a.message.trim() ? a.message.trim().slice(0, 4000) : undefined,
    prose: true,
    options: [
      { id: 'accept', label: String(a.submit ?? '').trim().slice(0, 30) || 'Send', style: 'primary' },
      { id: 'decline', label: 'Not now' },
    ],
    form: { fields },
    createdAt: Date.now(),
  };
  const limit = AbortSignal.timeout(WAIT_MS);
  const check = (x: ApprovalAnswer) => {
    if (x.decision !== 'accept') return null;
    const [field, why] = Object.entries(formContent(schema, x.form ?? {}).errors)[0] ?? [];
    return field ? `${fields.find((f) => f.id === field)?.label ?? field}: ${why}` : null;
  };
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit, check });
  if (!answer) return { text: limit.aborted ? 'The user did not fill in the form in time; it was withdrawn. Ask in your reply instead.' : 'The form was withdrawn before the user answered.', isError: true };
  if (answer.decision !== 'accept') return { text: 'The user closed the form without filling it in. Ask in words if you still need it, or go on without it.' };
  return { text: `The user filled in the form:\n${JSON.stringify(formContent(schema, answer.form ?? {}).content, null, 1)}` };
}
