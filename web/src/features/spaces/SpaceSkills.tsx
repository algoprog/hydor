// A space's Skills tab: every skill its sessions get, each with a switch for them alone (whatever Settings →
// Skills says for every other session): its own skills first (written for it, or a library skill changed for it
// alone), those of the spaces a group brings together, the skill library's, and Claude Code's and Codex's own for
// its folder. The list is Settings → Skills' own (skillpack/SkillsPage), told which space it is for. Agents
// working in the space can propose a skill too: you approve it in the conversation (skillpack/ProposalCard).
import type { Space } from '@shared/spaces';
import { SkillsSettings } from '../skillpack/SkillsPage';

/** The Skills tab. */
export function SpaceSkillsTab({ s }: { s: Space }) {
  return (
    <div className="mx-auto max-w-[880px]">
      <SkillsSettings space={s} />
    </div>
  );
}
