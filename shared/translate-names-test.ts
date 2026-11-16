// Menu labels must translate their wording without translating user-provided targets.
import assert from 'node:assert/strict';
import { translator } from './translate.ts';

const t = translator({ 'More for {0}': 'Mehr für {0}', Sage: 'Salbei', 'New folder': 'Neuer Ordner', 'Find in {0}': 'In {0} suchen', 'What is in {0}': 'Inhalt von {0}', work: 'Arbeit' });
assert.equal(t('More for Sage'), 'Mehr für Sage');
assert.equal(t('More for New folder'), 'Mehr für New folder');
assert.equal(t('More for notes/Sage.md'), 'Mehr für notes/Sage.md');
// Folder names stay intact in accessible labels and search hints.
assert.equal(t('Find in work'), 'In work suchen');
assert.equal(t('What is in work'), 'Inhalt von work');
console.log('User-provided names remain unchanged');
