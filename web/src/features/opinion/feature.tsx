// Second opinion: another company's model checks a turn's work. The session menu asks for one; it shows
// as a note under the turn it checked.
import { ScanSearch } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { MenuItem } from '../../components/ui';
import type { WebFeature } from '../registry';
import { OpinionCard } from './OpinionCard';
import { OpinionDialog, useOpinionDialog } from './OpinionDialog';

function OpinionMenuItem({ s, close }: { s: SessionSummary; close: () => void }) {
  const open = useOpinionDialog((x) => x.open);
  return (
    <MenuItem icon={<ScanSearch size={15} />} onClick={() => (close(), open(s.key))}>
      Second opinion…
    </MenuItem>
  );
}

export const opinionFeature: WebFeature = {
  id: 'opinion',
  noteViews: { opinion: OpinionCard },
  SessionMenu: OpinionMenuItem,
  // Nothing shows above the message box: the dock only holds the dialog.
  SessionDock: OpinionDialog,
};
