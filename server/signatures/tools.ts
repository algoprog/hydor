// The tools every session's agent has for signatures: ask_signature (a card where the user draws, types or uploads
// their signature and keeps it under a name; the agent hears only the name) and place_signature (a saved signature put
// into a Word file, a PDF, a picture or a document of the Library, once the user allows it on a card that shows where).
// Agents never see a signature's picture: the cards send it to the user's own routes, and the tools answer in words.
import crypto from 'node:crypto';
import { defaultSignatureName, signatureKind, signatureName, type SignatureCard, type SignatureView } from '../../shared/signatures.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import type { RunCtx, RunTool } from '../features/types.ts';
import { findSignature, listSignatures } from './store.ts';

/** How long a card waits (under Codex's ten minutes for a tool call). */
const WAIT_MS = 570_000;

/** The card shown in the run's conversation, and the user's answer; or why there is none. */
export async function onCard(ctx: RunCtx, card: ApprovalRequest, check?: (a: ApprovalAnswer) => string | null): Promise<{ answer: ApprovalAnswer } | { why: 'nobody' | 'timeout' | 'withdrawn' }> {
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return { why: 'nobody' };
  const limit = AbortSignal.timeout(WAIT_MS);
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit, check });
  if (!answer) return { why: limit.aborted ? 'timeout' : 'withdrawn' };
  return { answer };
}

/** A card of the app's own about a signature. */
export function signatureCard(o: { title: string; detail?: string; options: ApprovalRequest['options']; signature: SignatureCard }): ApprovalRequest {
  return { id: `sig-${crypto.randomBytes(6).toString('hex')}`, kind: 'other', title: o.title, detail: o.detail || undefined, prose: true, options: o.options, signature: o.signature, createdAt: Date.now() };
}

const kindWord = (s: Pick<SignatureView, 'kind'>) => (s.kind === 'initials' ? 'initials' : 'signature');

/** The saved signatures as an agent hears of them: by name and kind, never more. */
export function savedList(list: SignatureView[]): string {
  return list.map((s) => `“${s.name}” (${kindWord(s)}${s.until ? ', for today only' : ''})`).join(', ');
}

const NOT_CRYPTO = 'It is a picture of their signature, not a cryptographic digital signature.';

const ASK_SIGNATURE: RunTool = {
  name: 'ask_signature',
  description: [
    'Ask the user for their signature (or initials) on a card in the conversation, to place it into a document or file with place_signature.',
    'They draw it with a mouse, a finger or a pen, type their name in handwriting, or upload a photo of it, and keep it under a name, for later or for today only.',
    'You never see it: you hear only that it is saved, and its name. The call waits while they draw (up to nine minutes).',
    'If one of the kind asked for is saved already, you get their names instead of a card: use one of those, unless the user wants a new one (new: true).',
    'A drawn signature is a picture of a signature, not a cryptographic digital signature: say so if the user seems to expect one.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['signature', 'initials'], description: 'A full signature (the default) or initials.' },
      name: { type: 'string', description: 'What to keep it as, which the user can change: "Signature", "Initials", "Work signature".' },
      why: { type: 'string', description: 'One sentence for the user: what it will sign ("The rental agreement, on page 3").' },
      new: { type: 'boolean', description: 'Ask for a new one even though one of that kind is saved.' },
    },
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const kind = signatureKind(a.kind);
    const saved = listSignatures(db).filter((s) => s.kind === kind);
    if (saved.length && a.new !== true)
      return `The user has ${saved.length > 1 ? 'these' : 'this'} saved already: ${savedList(saved)}. Place one by name with place_signature (they allow each placement on a card). To have them draw another, call ask_signature with new: true.`;
    const want = signatureName(a.name) || defaultSignatureName(kind);
    // A name no saved signature has, for the card to start with.
    let name = want;
    for (let i = 2; findSignature(db, name); i++) name = `${want} ${i}`;
    const why = typeof a.why === 'string' ? a.why.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
    const card = signatureCard({
      title: kind === 'initials' ? 'Your initials, please' : 'Your signature, please',
      detail: why,
      options: [
        { id: 'accept', label: 'Save', style: 'primary' },
        { id: 'decline', label: 'Not now' },
      ],
      signature: { ask: { kind, name, ...(why ? { why } : {}) } },
    });
    // The card keeps the signature itself, then answers with its id alone.
    const r = await onCard(ctx, card, (x) => (x.decision === 'accept' && !findSignature(db, String(x.form?.signature ?? '')) ? 'Draw your signature and save it first' : null));
    if ('why' in r) {
      if (r.why === 'nobody') return { text: 'Nobody can draw it now (the session is not running in the app). Ask the user to draw one in Settings → App → Signatures.', isError: true };
      if (r.why === 'timeout') return { text: 'The user did not answer in time, so the card was withdrawn. Ask again when they are back.', isError: true };
      return { text: 'The card was withdrawn before the user answered.', isError: true };
    }
    if (r.answer.decision !== 'accept') return 'The user chose not to give a signature now. Go on without it, or ask in words what they would like instead.';
    const s = findSignature(db, String(r.answer.form?.signature ?? ''))!;
    return `The user saved their ${kindWord(s)} as “${s.name}”${s.until ? ', for today only (it goes in a day unless they keep it in Settings → App → Signatures)' : ''}. You never see it: place it by that name with place_signature, and the user allows each placement on a card. ${NOT_CRYPTO}`;
  },
};

export const signatureTools = (_ctx: RunCtx): RunTool[] => [ASK_SIGNATURE];
