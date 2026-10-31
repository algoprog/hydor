// Documents: finished files as cards (present_files), documents the agent read (read_document), Office
// previews in the file viewer (OfficePreview).
import { basename } from '../../lib/format';
import type { WebFeature } from '../registry';
import { FileCards } from './FileCards';
import { docPath, ReadRow } from './ReadRow';

export const documentsFeature: WebFeature = {
  id: 'documents',
  toolViews: {
    present_files: { place: 'answer', Row: FileCards },
    // A step of the work, counted with the agent's other reads.
    read_document: {
      place: 'work',
      Row: ReadRow,
      step: (t) => {
        const p = docPath(t);
        return { category: 'read', verb: t.status === 'running' || t.status === 'pending' ? 'Reading' : 'Read', title: p ? basename(p) : undefined };
      },
    },
  },
};
