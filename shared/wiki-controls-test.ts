// Exercise inherited defaults, project overrides, chat isolation and dependent features.
import assert from 'node:assert/strict';
import { resolveWikiFeatures, type WikiFeature } from './wiki-controls.ts';

const allOn = { autoLessons: true, contracts: true, autoContracts: true, plans: true, execution: true };
for (const key of Object.keys(allOn) as WikiFeature[]) {
  const state = resolveWikiFeatures({ ...allOn, [key]: false }, { [key]: true }, {}, true, true);
  assert.equal(state.enabled[key], true, `project overrides global default for ${key}`);
  const blocked = resolveWikiFeatures(allOn, { [key]: false }, { [key]: true }, true, true);
  assert.equal(blocked.enabled[key], false, `project disables chat ${key}`);
  assert.equal(blocked.available[key], false);
}
assert.equal(resolveWikiFeatures(allOn, {}, { contracts: false }, true, true).enabled.autoContracts, false);
assert.equal(resolveWikiFeatures(allOn, {}, { plans: false }, true, true).enabled.execution, true);
assert.equal(resolveWikiFeatures(allOn, {}, { execution: false }, true, true).enabled.plans, true);
assert.equal(resolveWikiFeatures(allOn, {}, {}, true, false).enabled.autoLessons, false);
assert.equal(resolveWikiFeatures(allOn, {}, {}, true, false).enabled.autoContracts, false);
assert.ok(Object.values(resolveWikiFeatures(allOn, {}, {}, false, true).enabled).every((v) => !v));
// Unexpected persisted values fail closed rather than acting as a truthy switch.
assert.equal(resolveWikiFeatures(allOn, { plans: 'yes' } as never, {}, true, true).enabled.plans, false);
assert.equal(resolveWikiFeatures(allOn, {}, { execution: 'yes' } as never, true, true).enabled.execution, false);
console.log('Wiki feature inheritance and dependencies passed');
