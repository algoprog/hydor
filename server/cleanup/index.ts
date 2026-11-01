// Cleaning up after a task: every agent hears when it starts that, once a task is done, it removes what it
// made along the way and no longer needs (scratch files, test data, branches, worktrees, processes it
// started), keeps the work, and says what it removed. The clean-up skill (skills/clean-up) has the method.
// On unless turned off in Settings → Assistants.
import { cleanUpOn } from '../assistants/store.ts';
import type { Feature } from '../features/types.ts';

export const CLEAN_UP_INSTRUCTIONS = [
  'Cleaning up: when a task is done, as its last step, remove what you made along the way that is no longer needed:',
  'scratch and test files, temporary folders and data, debug output and screenshots, git branches, worktrees and stashes you created that are merged or abandoned,',
  'and processes, servers or containers you started, unless the user wants them kept running.',
  'Keep what was asked for and work someone still has to review or merge (a branch with unmerged commits); never remove anything you did not make;',
  'ask first when something is large or unclear (a big download, anything shared). Name each thing you remove rather than using broad patterns,',
  'and say in a line what you removed and what you left. The clean-up skill has the method.',
].join(' ');

export const cleanup: Feature = {
  id: 'cleanup',
  spawn: (_s, d) => (cleanUpOn(d.db) ? { instructions: [CLEAN_UP_INSTRUCTIONS] } : undefined),
};
