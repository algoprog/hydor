// Check that all configured dictionary languages cover the wiki module's registered UI strings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LANGS } from '../../../../shared/i18n.ts';

const directory = path.resolve('web/src/i18n');
const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'strings.json'), 'utf8')) as Record<string, string>;
const keys = Object.entries(catalog).filter(([, source]) => source.includes('features/wiki/') || source.includes('server/wiki/')).map(([key]) => key);
// strings.json is made again by npm run i18n:extract once the pages are final: until then it still holds the old texts.
assert.ok(keys.includes('Wiki folder') && keys.includes('Folder inside each project'), 'The wiki strings are registered');
// German is supplied separately until the independent language package is present.
const german = JSON.parse(fs.readFileSync(path.join(directory, 'de.wiki.json'), 'utf8')) as Record<string, string>;
assert.deepEqual(keys.filter((key) => !german[key]?.trim()), [], 'Missing German wiki translations');
for (const { id } of LANGS) {
  // English is the source language; all other configured languages use their normal dictionaries.
  if (id === 'en') continue;
  const dictionary = JSON.parse(fs.readFileSync(path.join(directory, `${id}.json`), 'utf8')) as Record<string, string>;
  // Feature dictionaries supply translations when a separate language package is installed.
  for (const name of fs.readdirSync(directory).filter((name) => name.startsWith(`${id}.`) && name.endsWith('.json')).sort()) {
    const supplement = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as Record<string, string>;
    for (const [key, value] of Object.entries(supplement)) if (!(key in dictionary)) dictionary[key] = value;
  }
  const missing = keys.filter((key) => typeof dictionary[key] !== 'string' || !dictionary[key].trim());
  assert.deepEqual(missing, [], `Missing wiki translations for ${id}`);
}
console.log('Wiki strings cover all configured languages');
