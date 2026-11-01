// Agent Guidelines (parts.tsx): the session menu's Guidelines (in Session settings), the start page's option
// under Options, and the dialog they open, kept with the session's page so it outlives the menu that opened it.
import { ScrollText } from 'lucide-react';
import { create } from 'zustand';
import type { SessionSummary } from '@shared/types';
import { MenuItem } from '../../components/ui';
import type { WebFeature } from '../registry';
import { GuidelinesDialog, GuidelinesStartOption, hasGuidelines } from './parts';

/** The session whose guidelines are being edited, if any. */
const useDialog = create<{ key: string | null }>(() => ({ key: null }));

function GuidelinesMenuItem({ s, close }: { s: SessionSummary; close: () => void }) {
  return (
    <MenuItem icon={<ScrollText size={15} />} hint={hasGuidelines(s.extra) ? 'Set' : undefined} onClick={() => (close(), useDialog.setState({ key: s.key }))}>
      Guidelines
    </MenuItem>
  );
}

function GuidelinesDock({ s }: { s: SessionSummary }) {
  const key = useDialog((x) => x.key);
  if (key !== s.key) return null;
  return <GuidelinesDialog open onClose={() => useDialog.setState({ key: null })} sessionKey={s.key} spaceId={typeof s.extra?.space === 'string' ? s.extra.space : undefined} />;
}

export const guidelinesFeature: WebFeature = {
  id: 'guidelines',
  SessionMenu: GuidelinesMenuItem,
  sessionMenuPart: 'settings',
  SessionDock: GuidelinesDock,
  StartOptions: GuidelinesStartOption,
};
