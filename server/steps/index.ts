// Fewer, fuller steps: every agent hears when it starts that each separate tool step re-reads the whole conversation, so
// it sends independent lookups together, puts several lookups in one shell command, and checks on a long job at intervals
// that fit how long it should take. Part of how the app instructs agents, in its own code: no setting, no environment
// switch, nothing a user edits or turns off. Its middle bullet names sym's way of taking several names only while the
// shell tools offer sym (server/shelltools), and a session that works in one browser tab (no shell) hears the first bullet only.
import { offeredShellTools } from '../shelltools/index.ts';
import type { Feature } from '../features/types.ts';

export const STEPS_HEAD = 'Every separate tool step re-reads the whole conversation, so make fewer, fuller steps:';
export const STEPS_SEND_TOGETHER = '- Send independent tool calls (reads, searches, lookups) together in one step, not one at a time.';
export const STEPS_LOOK_SYM = '- When looking around code, put several lookups in one command: several names to one sym call, several grep or sed -n ranges chained in one shell command.';
export const STEPS_LOOK = '- When looking around code, put several lookups in one command: several grep or sed -n ranges chained in one shell command.';
export const STEPS_WAIT = '- When waiting on a running command or job, check on it at intervals that fit how long it is expected to take, not every few seconds: each check costs tokens.';

/** The text a session gets (the same every time for the same two answers, so the provider's cache of it holds). */
export const stepsText = (o: { sym: boolean; shell: boolean }): string =>
  (o.shell ? [STEPS_HEAD, STEPS_SEND_TOGETHER, o.sym ? STEPS_LOOK_SYM : STEPS_LOOK, STEPS_WAIT] : [STEPS_HEAD, STEPS_SEND_TOGETHER]).join('\n');

/** The capability; a function so a test can say which shell tools are offered. */
export function createSteps(offered: () => readonly string[] = offeredShellTools): Feature {
  return {
    id: 'steps',
    // Every agent kind and session, also when the shell tools are off. A session that works in one browser tab has no shell: shelltools skips it, so the bullets about commands would not apply.
    spawn: (s) => ({ instructions: [stepsText({ shell: !s.extra?.browserOnly, sym: offered().includes('sym') })] }),
  };
}

export const steps = createSteps();
