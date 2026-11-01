// A form an MCP server asks the user to fill in partway through a call (MCP "elicitation", the
// 2025-06-18 and 2025-11-25 versions): Codex passes its servers' on, and connected apps' come through
// the app (the bridge for local apps, the relay for remote ones). Each shows as an approval card with
// the fields as a template's form (shared/forms.ts); the answer goes back in MCP's terms.
import type { ApprovalRequest } from '../../shared/types.ts';
import { formContent, formFields } from '../../shared/forms.ts';
import type { ApprovalAnswer } from './live.ts';

export interface ElicitParams {
  message?: string;
  requestedSchema?: unknown;
  /** URL mode (2025-11-25): a page for the user to open, instead of fields. */
  mode?: 'form' | 'url';
  url?: string;
  elicitationId?: string;
}

export interface ElicitResult {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}

/** The card: the server's message, then its fields; a form with no fields is a yes/no question. */
export function elicitCard(id: string, from: string, p: ElicitParams, o: { app?: boolean } = {}): ApprovalRequest {
  const url = p.mode === 'url' && typeof p.url === 'string' && /^https?:\/\//i.test(p.url) ? p.url : undefined;
  const fields = url ? [] : formFields(p.requestedSchema);
  const asks = url ? 'asks you to open a page' : fields.length ? 'asks you to fill in a form' : 'asks to go ahead';
  return {
    id,
    kind: 'other',
    title: `${from} ${asks}`,
    detail: String(p.message ?? '').slice(0, 4000) || undefined,
    options: [
      url ? { id: 'accept', label: 'Open it', style: 'primary' as const } : { id: 'accept', label: fields.length ? 'Send' : 'Allow', style: 'primary' as const },
      { id: 'decline', label: 'Decline', style: 'danger' as const },
      { id: 'cancel', label: 'Not now' },
    ],
    form: fields.length || url ? { fields, url } : undefined,
    from: o.app ? from : undefined,
    createdAt: Date.now(),
  };
}

/** What is wrong with a sent form, in words (the first problem), or null. */
export function elicitCheck(p: ElicitParams, a: ApprovalAnswer): string | null {
  if (a.decision !== 'accept' || p.mode === 'url') return null;
  const { errors } = formContent(p.requestedSchema, a.form ?? {});
  const [field, why] = Object.entries(errors)[0] ?? [];
  if (!field) return null;
  const label = formFields(p.requestedSchema).find((f) => f.id === field)?.label ?? field;
  return `${label}: ${why}`;
}

/** The answer for the server; no answer (the turn ended first) cancels. */
export function elicitResult(p: ElicitParams, a: ApprovalAnswer | null): ElicitResult {
  if (!a || a.decision === 'cancel') return { action: 'cancel' };
  if (a.decision !== 'accept') return { action: 'decline' };
  if (p.mode === 'url') return { action: 'accept' };
  return { action: 'accept', content: formContent(p.requestedSchema, a.form ?? {}).content };
}
