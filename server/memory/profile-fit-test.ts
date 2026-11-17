// The user's profile for Custom with a model of a small context: its start, cut at a line's end, and a session that saw
// only its start may not rewrite it (it would drop the rest).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import type { RunCtx } from '../features/types.ts';
import { fitWords, profile, PROFILE_WORDS_LEAN, PROFILE_WORDS_TINY, saveProfile, userProfile } from './profile.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-profile-fit-'));
try {
  const db = openDb(path.join(tmp, 'p.db'));
  const deps = { db, broadcast() {} } as unknown as RunCtx['deps'];

  // fitWords: whole when it fits, else cut at a line's end; a first line longer than the limit is cut by words.
  assert.deepEqual(fitWords('One two.\nThree four.', 10), { text: 'One two.\nThree four.', cut: false });
  assert.deepEqual(fitWords('One two.\nThree four five.', 3), { text: 'One two.', cut: true });
  assert.deepEqual(fitWords('One two three four five.', 3), { text: 'One two three', cut: true });

  const lines = Array.from({ length: 60 }, (_, i) => `- Line ${i + 1} of the profile, with ten words in it here.`);
  saveProfile(db, `Who they are:\n${lines.join('\n')}`, { source: 'user' });
  const whole = userProfile(db)!.text;
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const at = (window?: number, lean?: boolean, key = 'acp:small') => profile.context!({ key, cwd: tmp, extra: {}, window, lean }, deps) as string;

  // A large model gets it whole, and is told to keep it current.
  const big = at(200_000, false, 'acp:big');
  assert.ok(big.includes(whole));
  assert.match(big, /Keep it current with update_user_profile/);

  // A lean one (up to 33k) gets at most 400 words of it, a tiny one (under 12k) at most 120, each said to be its start.
  for (const [window, lean, limit] of [[32_000, true, PROFILE_WORDS_LEAN], [8_000, true, PROFILE_WORDS_TINY]] as const) {
    const block = at(window, lean);
    const body = block.split('\n\n')[1];
    assert.ok(words(body) <= limit, `${window}: ${words(body)} words`);
    assert.ok(whole.startsWith(body), 'its start, line by line');
    assert.match(block, /Only its start, to fit this model’s context/);
    assert.doesNotMatch(block, /Keep it current/);
  }

  // The session given it cut cannot rewrite it; another one, given it whole, can.
  const tool = (key: string) => profile.tools!({ key, deps, runId: 'r', agent: 'acp', cwd: tmp } as RunCtx)[0];
  await assert.rejects(tool('acp:small').run({ profile: 'Who they are:\n- Short now.', why: 'test' }, { key: 'acp:small', deps, runId: 'r', agent: 'acp', cwd: tmp } as RunCtx), /only the start of the profile/);
  assert.equal(userProfile(db)!.text, whole, 'unchanged');
  await tool('acp:big').run({ profile: `${whole}\n- One more line.`, why: 'test' }, { key: 'acp:big', deps, runId: 'r2', agent: 'acp', cwd: tmp } as RunCtx);
  assert.match(userProfile(db)!.text, /One more line/);

  // Given whole again (the model was switched to a larger one), the session may rewrite it once more.
  at(200_000, false, 'acp:small');
  await tool('acp:small').run({ profile: `${userProfile(db)!.text}\n- And another.`, why: 'test' }, { key: 'acp:small', deps, runId: 'r3', agent: 'acp', cwd: tmp } as RunCtx);
  assert.match(userProfile(db)!.text, /And another/);
  db.close();
  process.stdout.write('Profile for small models: 4 tests passed\n');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
