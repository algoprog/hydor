// Agent Guidelines: what the user wants every agent to follow, whatever the agent (Claude Code, Codex, Custom and
// the ACP agents alike), at three levels: every session, a space (its own field), and one session. The app gives
// them to the agent itself, so one text works for all of them; CLAUDE.md and AGENTS.md still work as before.

/** Most a level's text may hold. */
export const MAX_GUIDELINES = 20_000;

/** GET /api/guidelines: every session's, and a space's or a session's when asked for. */
export interface GuidelinesView {
  global: string;
  space?: { id: string; name: string; text: string };
  session?: { key: string; text: string };
}

/** PUT /api/guidelines: the levels to change (others stay); an empty text clears one. */
export interface GuidelinesPut {
  global?: string;
  space?: { id: string; text: string };
  session?: { key: string; text: string };
}
