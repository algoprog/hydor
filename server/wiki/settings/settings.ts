// Installation-local settings for the native wiki; paths are interpreted by the Hydor server.
import path from 'node:path';
import { HttpError } from '../../auth.ts';
import { kvGet, kvSet, type DB } from '../../db.ts';
import { taskRoot } from '../../assistants/store.ts';
import type { WikiMemorySettings } from '../../../shared/wiki.ts';

/** Settings → Memory → Wiki memory (shared/wiki.ts). */
export type WikiSettings = WikiMemorySettings;

/** Read the settings without creating a wiki or touching its contents. */
export function wikiSettings(db: DB): WikiMemorySettings {
  return {
    enabled: kvGet(db, 'wiki.enabled') !== '0',
    fromDocuments: kvGet(db, 'wiki.fromDocuments') !== '0',
    hubPath: kvGet(db, 'wiki.hubPath') || path.join(taskRoot(db), '.wiki'),
    projectWikis: kvGet(db, 'wiki.projectWikis') === 'folder' ? 'folder' : 'hub',
    projectPath: kvGet(db, 'wiki.projectPath') ?? '.wiki',
    gitIgnore: kvGet(db, 'wiki.gitIgnore') === '1',
  };
}

const FIELDS = ['enabled', 'fromDocuments', 'hubPath', 'projectWikis', 'projectPath', 'gitIgnore'] as const;

/** Validate the complete change before saving any setting; fields that are not settings are ignored. */
export function setWikiSettings(db: DB, given: Partial<WikiMemorySettings>): WikiMemorySettings {
  const input: Partial<WikiMemorySettings> = {};
  for (const k of FIELDS) if ((given as Record<string, unknown>)[k] !== undefined) (input as Record<string, unknown>)[k] = (given as Record<string, unknown>)[k];
  const next = { ...wikiSettings(db), ...input };
  if (typeof next.enabled !== 'boolean' || typeof next.fromDocuments !== 'boolean' || typeof next.gitIgnore !== 'boolean') throw new HttpError(400, 'Wiki switches must be on or off');
  if (next.projectWikis !== 'hub' && next.projectWikis !== 'folder') throw new HttpError(400, 'Project wikis are kept in the hub or in each project’s folder');
  if (typeof next.hubPath !== 'string' || (next.hubPath && (!path.isAbsolute(next.hubPath) || next.hubPath.includes('\0') || path.parse(path.resolve(next.hubPath)).root === path.resolve(next.hubPath)))) throw new HttpError(400, 'The wiki hub must be an absolute path to a folder');
  if (typeof next.projectPath !== 'string' || !next.projectPath.trim() || path.isAbsolute(next.projectPath) || /[\0\r\n]/.test(next.projectPath) || next.projectPath.split(/[\\/]/).some((p) => p === '..' || p.toLowerCase() === '.git') || path.normalize(next.projectPath.trim()) === '.') throw new HttpError(400, 'The project wiki path must be inside the project');
  db.transaction(() => {
    // Write only requested fields so an inherited hub default continues to follow the task root.
    if (input.enabled !== undefined) kvSet(db, 'wiki.enabled', next.enabled ? '1' : '0');
    if (input.fromDocuments !== undefined) kvSet(db, 'wiki.fromDocuments', next.fromDocuments ? '1' : '0');
    if (input.hubPath !== undefined) kvSet(db, 'wiki.hubPath', next.hubPath.trim());
    if (input.projectWikis !== undefined) kvSet(db, 'wiki.projectWikis', next.projectWikis);
    if (input.projectPath !== undefined) kvSet(db, 'wiki.projectPath', next.projectPath.trim());
    if (input.gitIgnore !== undefined) kvSet(db, 'wiki.gitIgnore', next.gitIgnore ? '1' : '0');
  })();
  return wikiSettings(db);
}
