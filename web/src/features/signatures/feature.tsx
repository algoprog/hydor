// Signatures in the conversation: an agent asking for one (ask_signature) and placing one (place_signature) read as steps
// of its work ("Asked for your signature", "Signed lease.docx"). The cards they show, the pad and the placement to allow,
// are approval cards (Cards.tsx); the pad and the saved signatures are in Settings (SignatureSettings.tsx).
import type { ToolInfo } from '@shared/types';
import { basename } from '../../lib/format';
import { StepRow } from '../automations/StepRow';
import type { WebFeature } from '../registry';

const args = (t: ToolInfo) => (t.input && typeof t.input === 'object' ? (t.input as Record<string, unknown>) : {});
const busy = (t: ToolInfo) => t.status === 'running' || t.status === 'pending' || t.status === 'waiting';

export const signaturesFeature: WebFeature = {
  id: 'signatures',
  toolViews: {
    ask_signature: {
      Row: StepRow,
      step: (t) => {
        const initials = args(t).kind === 'initials';
        return { category: 'question', verb: busy(t) ? (initials ? 'Asking for your initials' : 'Asking for your signature') : initials ? 'Asked for your initials' : 'Asked for your signature', title: '' };
      },
    },
    place_signature: {
      Row: StepRow,
      step: (t) => {
        const a = args(t);
        const file = typeof a.file === 'string' && a.file.trim() ? basename(a.file.trim()) : '';
        if (a.look === true) return { category: 'read', verb: busy(t) ? 'Looking where to sign' : 'Looked where to sign', title: file };
        return { category: 'edit', verb: file ? (busy(t) ? 'Signing' : 'Signed') : busy(t) ? 'Signing a document' : 'Signed a document', title: file };
      },
    },
  },
};
