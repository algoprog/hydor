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
        const a = args(t);
        const initials = a.kind === 'initials';
        // Its title: what the agent said it is for, or the name it suggested.
        const said = [a.why, a.name].find((v): v is string => typeof v === 'string' && !!v.trim());
        return {
          category: 'question',
          verb: busy(t) ? (initials ? 'Asking for your initials' : 'Asking for your signature') : initials ? 'Asked for your initials' : 'Asked for your signature',
          title: said?.trim() ?? (initials ? 'Initials' : 'Signature'),
        };
      },
    },
    place_signature: {
      Row: StepRow,
      step: (t) => {
        const a = args(t);
        const file = typeof a.file === 'string' && a.file.trim() ? basename(a.file.trim()) : '';
        if (a.look === true) return { category: 'read', verb: busy(t) ? 'Looking where to sign' : 'Looked where to sign', title: file || 'A document of your Library' };
        return { category: 'edit', verb: busy(t) ? 'Signing' : 'Signed', title: file || 'A document of your Library' };
      },
    },
  },
};
