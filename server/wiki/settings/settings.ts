// Installation-local settings for the native wiki; paths are interpreted by the Hydor server.
import path from 'node:path';
import { WIKI_FEATURES, type WikiChoices } from '../../../shared/wiki-controls.ts';
import { HttpError } from '../../auth.ts';
import { kvGet, kvSet, type DB } from '../../db.ts';
import { taskRoot } from '../../assistants/store.ts';
import { DEFAULT_WIKI_DOCUMENTS, MAX_WIKI_DOCUMENTS, type WikiMemorySettings } from '../../../shared/wiki.ts';

/** Settings → Memory → Wiki memory (shared/wiki.ts). */
export type WikiSettings = WikiMemorySettings;

const storedLimit = (v: string | undefined | null) => (v != null && v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= MAX_WIKI_DOCUMENTS ? Number(v) : DEFAULT_WIKI_DOCUMENTS);

/** Read the settings without creating a wiki or touching its contents. */
export function wikiSettings(db: DB): WikiMemorySettings {
  return {
    enabled: kvGet(db, 'wiki.enabled') !== '0',
    fromDocuments: kvGet(db, 'wiki.fromDocuments') !== '0',
    documentLimit: storedLimit(kvGet(db, 'wiki.documentLimit')),
    hubPath: kvGet(db, 'wiki.hubPath') || path.join(taskRoot(db), '.wiki'),
    projectWikis: kvGet(db, 'wiki.projectWikis') === 'folder' ? 'folder' : 'hub',
    projectPath: kvGet(db, 'wiki.projectPath') ?? '.wiki',
    gitIgnore: kvGet(db, 'wiki.gitIgnore') === '1',
    defaultChatEnabled: kvGet(db, 'wiki.defaultChatEnabled') !== '0',
    // New installs enable automatic lessons; a previously saved off choice remains off.
    defaultAutoLessons: kvGet(db, 'wiki.defaultAutoLessons') !== '0',
    // New feature defaults are on; the existing auto-lessons chat default remains unchanged.
    featureDefaults: Object.fromEntries(WIKI_FEATURES.map((key) => [key, kvGet(db, `wiki.feature.${key}`) !== '0'])) as WikiChoices,
  };
}

const FIELDS = ['enabled', 'fromDocuments', 'documentLimit', 'hubPath', 'projectWikis', 'projectPath', 'gitIgnore', 'defaultChatEnabled', 'defaultAutoLessons', 'featureDefaults'] as const;

/** Validate the complete change before saving any setting; fields that are not settings are ignored. */
export function setWikiSettings(db: DB, given: Partial<WikiMemorySettings>): WikiMemorySettings {
  const input: Partial<WikiMemorySettings> = {};
  for (const k of FIELDS) if ((given as Record<string, unknown>)[k] !== undefined) (input as Record<string, unknown>)[k] = (given as Record<string, unknown>)[k];
  // Validate the complete feature map before applying any change.
  if (input.featureDefaults !== undefined && (!input.featureDefaults || typeof input.featureDefaults !== 'object' || Array.isArray(input.featureDefaults) || Object.entries(input.featureDefaults).some(([key, value]) => !WIKI_FEATURES.includes(key as typeof WIKI_FEATURES[number]) || typeof value !== 'boolean'))) throw new HttpError(400, 'Wiki feature defaults must be on or off');
  const next = { ...wikiSettings(db), ...input };
  if (typeof next.enabled !== 'boolean' || typeof next.fromDocuments !== 'boolean' || typeof next.gitIgnore !== 'boolean' || typeof next.defaultChatEnabled !== 'boolean' || typeof next.defaultAutoLessons !== 'boolean') throw new HttpError(400, 'Wiki switches must be on or off');
  if (typeof next.documentLimit !== 'number' || !Number.isInteger(next.documentLimit) || next.documentLimit < 0 || next.documentLimit > MAX_WIKI_DOCUMENTS) throw new HttpError(400, `The most documents to read into the wiki is a whole number from 0 to ${MAX_WIKI_DOCUMENTS}`);
  if (next.projectWikis !== 'hub' && next.projectWikis !== 'folder') throw new HttpError(400, 'Project wikis are kept in the hub or in each project’s folder');
  if (typeof next.hubPath !== 'string' || (next.hubPath && (!path.isAbsolute(next.hubPath) || next.hubPath.includes('\0') || path.parse(path.resolve(next.hubPath)).root === path.resolve(next.hubPath)))) throw new HttpError(400, 'The wiki hub must be an absolute path to a folder');
  if (typeof next.projectPath !== 'string' || !next.projectPath.trim() || path.isAbsolute(next.projectPath) || /[\0\r\n]/.test(next.projectPath) || next.projectPath.split(/[\\/]/).some((p) => p === '..' || p.toLowerCase() === '.git') || path.normalize(next.projectPath.trim()) === '.') throw new HttpError(400, 'The project wiki path must be inside the project');
  db.transaction(() => {
    // Write only requested fields so an inherited hub default continues to follow the task root.
    if (input.featureDefaults !== undefined) for (const [key, value] of Object.entries(input.featureDefaults)) kvSet(db, `wiki.feature.${key}`, value ? '1' : '0');
    if (input.enabled !== undefined) kvSet(db, 'wiki.enabled', next.enabled ? '1' : '0');
    if (input.fromDocuments !== undefined) kvSet(db, 'wiki.fromDocuments', next.fromDocuments ? '1' : '0');
    if (input.documentLimit !== undefined) kvSet(db, 'wiki.documentLimit', String(next.documentLimit));
    if (input.hubPath !== undefined) kvSet(db, 'wiki.hubPath', next.hubPath.trim());
    if (input.projectWikis !== undefined) kvSet(db, 'wiki.projectWikis', next.projectWikis);
    if (input.projectPath !== undefined) kvSet(db, 'wiki.projectPath', next.projectPath.trim());
    if (input.gitIgnore !== undefined) kvSet(db, 'wiki.gitIgnore', next.gitIgnore ? '1' : '0');
    if (input.defaultChatEnabled !== undefined) kvSet(db, 'wiki.defaultChatEnabled', next.defaultChatEnabled ? '1' : '0');
    if (input.defaultAutoLessons !== undefined) kvSet(db, 'wiki.defaultAutoLessons', next.defaultAutoLessons ? '1' : '0');
  })();
  return wikiSettings(db);
}
