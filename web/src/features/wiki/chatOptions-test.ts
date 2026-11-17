// Check inherited defaults, independent session overrides and privacy gates.
import assert from 'node:assert/strict';
import { wikiChatOptions } from './chatOptions';

const defaults = { enabled: true, defaultChatEnabled: true, defaultAutoLessons: false };
assert.deepEqual(wikiChatOptions(defaults, {}, true), { available: true, wiki: true, lessonsAvailable: true, lessons: false });
assert.equal(wikiChatOptions({ ...defaults, defaultAutoLessons: true }, {}, true).lessons, true);
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
console.log('Wiki chat choices follow defaults and privacy controls');
