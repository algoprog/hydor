// Script test for what a ready-made app's page starts with and keeps (pick.ts): the program and mode are shared, the model,
// tier and effort are each app's own and kept only when changed, and a pick saved the old way never overrides an app's tier.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/apps/pick-test.ts && node dist/dev/pick-test.js
import assert from 'node:assert/strict';
import { PROGRAM_KEY, startingProgram, startingThinks, thinksKey, thinksToKeep, type Own } from './pick';

const best: Own = { agent: 'claude', tier: 'best' };
const quick: Own = { agent: 'claude', tier: 'quick' };
const plain: Own = { agent: 'claude' };

// A fake localStorage: what a run keeps, read by the next page.
const store = new Map<string, string>();
const get = (k: string) => store.get(k) ?? null;
const run = (app: string, own: Own, thinks: { model: string | null; tier: 'quick' | 'standard' | 'best' | 'max' | null; effort: string | null }, program = { agent: 'claude', mode: 'auto' }) => {
  store.set(PROGRAM_KEY, JSON.stringify(program));
  const keep = thinksToKeep(thinks, own);
  if (keep) store.set(thinksKey(app), JSON.stringify(keep));
  else store.delete(thinksKey(app));
};

assert.deepEqual(startingThinks(null, best), { model: null, tier: 'best', effort: null }, 'nothing kept: the app’s own tier');
assert.deepEqual(startingThinks(null, plain), { model: null, tier: null, effort: null });

// Running an app unchanged keeps nothing for it: the next app starts on its own tier.
run('tpl:deep-research', best, { model: null, tier: 'best', effort: null });
assert.equal(get(thinksKey('tpl:deep-research')), null);
assert.deepEqual(startingThinks(get(thinksKey('tpl:document-qa')), quick), { model: null, tier: 'quick', effort: null }, 'one run of a Best app does not move another');

// A change is kept for that app alone, and the next time it starts on it.
run('tpl:document-qa', quick, { model: null, tier: 'max', effort: 'high' });
assert.deepEqual(startingThinks(get(thinksKey('tpl:document-qa')), quick), { model: null, tier: 'max', effort: 'high' });
assert.deepEqual(startingThinks(get(thinksKey('tpl:deep-research')), best), { model: null, tier: 'best', effort: null });
// A model named wins over a tier, and is kept the same way.
run('tpl:document-qa', quick, { model: 'my-model', tier: 'max', effort: null });
assert.deepEqual(startingThinks(get(thinksKey('tpl:document-qa')), quick), { model: 'my-model', tier: null, effort: null });
// Setting it back to the app's own clears what was kept.
run('tpl:document-qa', quick, { model: null, tier: 'quick', effort: null });
assert.equal(get(thinksKey('tpl:document-qa')), null);
assert.deepEqual(startingThinks(get(thinksKey('tpl:document-qa')), quick), { model: null, tier: 'quick', effort: null });
// An app with no tier of its own: choosing none is its own.
assert.equal(thinksToKeep({ model: null, tier: null, effort: null }, plain), null);
assert.deepEqual(thinksToKeep({ model: null, tier: 'standard', effort: null }, plain), { model: null, tier: 'standard', effort: null });

// The program and mode are shared by every ready-made app.
assert.deepEqual(startingProgram(get(PROGRAM_KEY), best), { agent: 'claude', acpAgent: null, mode: 'auto' });
run('tpl:x', plain, { model: null, tier: null, effort: null }, { agent: 'codex', mode: 'plan' });
assert.deepEqual(startingProgram(get(PROGRAM_KEY), quick), { agent: 'codex', acpAgent: null, mode: 'plan' });
assert.deepEqual(startingProgram(null, quick), { agent: 'claude', acpAgent: null, mode: null }, 'nothing kept: the app’s own program');

// A pick saved the old way: only its program and mode count; its tier and model never override an app's own.
const old = JSON.stringify({ agent: 'codex', acpAgent: undefined, model: 'old-model', tier: 'best', effort: 'high', mode: 'auto' });
assert.deepEqual(startingProgram(old, quick), { agent: 'codex', acpAgent: null, mode: 'auto' });
assert.deepEqual(startingThinks(null, quick), { model: null, tier: 'quick', effort: null }, 'the page reads no old thinking from the shared key');
// Damaged values are ignored.
assert.deepEqual(startingProgram('{oops', quick), { agent: 'claude', acpAgent: null, mode: null });
assert.deepEqual(startingThinks('[1]', quick), { model: null, tier: 'quick', effort: null });
console.log('ok   what a ready-made app starts with: its own tier until changed on its own page; the program and mode shared; the old key read for those only');
