// The agents keep their sign-ins and sessions where the app reads them: a copy of the app with a Claude Code or Codex
// folder of its own (CLAUDE_CONFIG_DIR, CODEX_HOME, another HOME) gives its agents that folder; one with yours, nothing.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/env-test.ts && DATA_DIR=/tmp/hydor-test-env node dist/dev/env-test.js
import assert from 'node:assert/strict';
import { ownFolders } from './env.ts';

const agentsGet = (login: Record<string, string>, own: Parameters<typeof ownFolders>[1]) => {
  const env = { ...login };
  ownFolders(env, own);
  return env;
};
const login = { HOME: '/home/u', PATH: '/usr/bin:/bin' };

// The app in use, started with your HOME and no folders of its own: the login's variables as they are, a
// CLAUDE_CONFIG_DIR your shell sets included.
assert.deepEqual(agentsGet(login, { home: '/home/u', loginHome: '/home/u' }), login);
assert.deepEqual(agentsGet({ ...login, CLAUDE_CONFIG_DIR: '/home/u/.claude-work' }, { home: '/home/u/', loginHome: '/home/u' }), { ...login, CLAUDE_CONFIG_DIR: '/home/u/.claude-work' });

// A copy tried out under /tmp with a HOME and folders of its own, as on 2026-11-19: its agents use its folders (their
// HOME stays the login's: its shell files, keys and programs).
assert.deepEqual(agentsGet(login, { home: '/tmp/x/home', loginHome: '/home/u', claudeDir: '/tmp/x/home/.claude', codexHome: '/tmp/x/home/.codex' }), {
  ...login,
  CLAUDE_CONFIG_DIR: '/tmp/x/home/.claude',
  CODEX_HOME: '/tmp/x/home/.codex',
});

// Another HOME alone: the folders in it, where the app looks.
assert.deepEqual(agentsGet(login, { home: '/tmp/x/home', loginHome: '/home/u' }), { ...login, CLAUDE_CONFIG_DIR: '/tmp/x/home/.claude', CODEX_HOME: '/tmp/x/home/.codex' });

// One folder of its own with your HOME: that one, the other as the login has it. The app's own comes before the shell's.
assert.deepEqual(agentsGet(login, { home: '/home/u', loginHome: '/home/u', claudeDir: '/home/u/.claude' }), { ...login, CLAUDE_CONFIG_DIR: '/home/u/.claude' });
assert.deepEqual(agentsGet({ ...login, CODEX_HOME: '/home/u/.codex-old' }, { home: '/home/u', loginHome: '/home/u', codexHome: '/srv/codex' }), { ...login, CODEX_HOME: '/srv/codex' });

console.log('agents’ folders: ok');
