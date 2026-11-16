// Read only regular files in the configured language directory; links are not catalog inputs.
import fs from 'node:fs';
import path from 'node:path';
import { combineLanguageCatalogs, isLanguageSupplement, type LanguageCatalog } from '../../shared/language-catalog.ts';

/** Load one base dictionary and its optional, language-specific supplements. */
export function readLanguageCatalog(directory: string, lang: string): LanguageCatalog {
  if (!/^[a-z]{2,3}$/.test(lang)) throw new Error('Invalid language');
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as LanguageCatalog;
  const base = read(`${lang}.json`);
  const supplements: [string, LanguageCatalog][] = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isLanguageSupplement(entry.name, lang))
    .map((entry) => [entry.name, read(entry.name)]);
  return combineLanguageCatalogs(base, supplements);
}
