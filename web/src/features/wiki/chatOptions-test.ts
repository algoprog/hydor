// Check inherited defaults, independent session overrides and privacy gates.
import assert from 'node:assert/strict';
import { wikiChatOptions, wikiFeatureChange } from './chatOptions';

const defaults = { enabled: true, defaultChatEnabled: true, defaultAutoLessons: false };
const initial = wikiChatOptions(defaults, {}, true);
assert.deepEqual([initial.available, initial.wiki, initial.lessonsAvailable, initial.lessons], [true, true, true, false]);
assert.equal(wikiChatOptions(defaults, { wikiFeatures: { contracts: false } }, true).features.enabled.autoContracts, false);
assert.equal(wikiChatOptions(defaults, { wikiFeatures: { plans: true } }, true, true, { plans: false }).features.enabled.plans, false);
assert.equal(wikiChatOptions({ ...defaults, defaultAutoLessons: true }, {}, true).lessons, true);
// The API alias and established chat field resolve consistently.
assert.equal(wikiChatOptions({ ...defaults, defaultAutoLessons: true }, { wikiFeatures: { autoLessons: false } }, true).lessons, false);
assert.equal(wikiChatOptions({ ...defaults, defaultAutoLessons: true }, { wikiAutoLessons: true, wikiFeatures: { autoLessons: false } }, true).lessons, true);
assert.equal(wikiChatOptions({ ...defaults, defaultChatEnabled: false }, {}, true).wiki, false);
assert.equal(wikiChatOptions({ ...defaults, defaultChatEnabled: false }, { wikiEnabled: true }, true).wiki, true);
assert.equal(wikiChatOptions(defaults, { wikiEnabled: false, wikiAutoLessons: true }, true).lessons, false);
assert.equal(wikiChatOptions(defaults, { wikiAutoLessons: true }, false).lessonsAvailable, false);
assert.equal(wikiChatOptions(defaults, { wikiAutoLessons: true, memory: false }, true).lessons, false);
assert.equal(wikiChatOptions(defaults, { wikiEnabled: true, confidential: true }, true).available, false);
assert.equal(wikiChatOptions({ ...defaults, enabled: false }, { wikiEnabled: true }, true).wiki, false);
assert.equal(wikiChatOptions({ ...defaults, enabled: false }, { wikiEnabled: true }, true, true).wiki, true);
assert.equal(wikiChatOptions(defaults, { wikiEnabled: true }, true, false).wiki, false);
assert.equal(wikiChatOptions(null, { wikiEnabled: true }, true).available, false);
// Start forms merge shallowly, so successive feature choices must carry their siblings forward.
const first = wikiFeatureChange({}, 'contracts', false);
const second = wikiFeatureChange(first, 'plans', false);
assert.deepEqual(second.wikiFeatures, { contracts: false, plans: false });
assert.deepEqual(wikiFeatureChange(second, 'execution', false, true).wikiFeatures, { execution: false }, 'session patches retain the server\'s field-level merge');
console.log('Wiki chat choices follow defaults and privacy controls');
