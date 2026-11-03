// The skill library in the pages: a skill an agent proposes (skill_save, skill_patch) as a card to
// approve, edit or dismiss; and a "Using skill …" chip where an agent loads a skill, or where your words
// brought one into Custom's turn. Every skill is listed in Settings → Skills (SkillsPage.tsx).
import { skillLoaded } from '@shared/skillpack';
import type { ToolInfo } from '@shared/types';
import type { ToolView, WebFeature } from '../registry';
import { ProposalCard } from './ProposalCard';
import { SkillChip, TriggerNote } from './SkillView';

const running = (t: ToolInfo) => t.status === 'running' || t.status === 'pending';
const nameOf = (t: ToolInfo) => {
  const v = (t.input as Record<string, unknown> | undefined)?.name;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

/** A skill being loaded: a chip with the reply, outside the folded work. */
const CHIP: ToolView = { place: 'answer', Row: SkillChip, step: (t) => ({ category: 'read', verb: 'Used', title: `the skill ${skillLoaded(t) ?? ''}` }) };

export const skillpackFeature: WebFeature = {
  id: 'skillpack',
  toolViews: {
    // A proposal needs you: outside the folded work.
    skill_save: { place: 'attention', Row: ProposalCard, step: (t) => ({ verb: running(t) ? 'Proposing' : 'Proposed', title: `the skill ${nameOf(t) ?? ''}`.trim() }) },
    skill_patch: { place: 'attention', Row: ProposalCard, step: (t) => ({ verb: running(t) ? 'Proposing' : 'Proposed', title: `a change to ${nameOf(t) ?? 'a skill'}` }) },
  },
  matchTool: (t) => (t.status !== 'error' && t.status !== 'declined' && skillLoaded(t) ? CHIP : undefined),
  noteViews: { skillpack: TriggerNote },
};
