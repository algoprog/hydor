// Installation-local settings for the native wiki; paths are interpreted by the Hydor server.
import path from 'node:path';
import { HttpError } from '../../auth.ts';
import { kvGet, kvSet, type DB } from '../../db.ts';
import { taskRoot } from '../../assistants/store.ts';

export interface WikiSettings {
  enabled: boolean;
  hubPath: string;
  projectPath: string;
  gitIgnore: boolean;
}

/** Read the settings without creating a wiki or touching its contents. */
export function wikiSettings(db: DB): WikiSettings {
  return {
    enabled: kvGet(db, 'wiki.enabled') === '1',
    hubPath: kvGet(db, 'wiki.hubPath') || path.join(taskRoot(db), '.wiki'),
    projectPath: kvGet(db, 'wiki.projectPath') ?? '.wiki',
    gitIgnore: kvGet(db, 'wiki.gitIgnore') !== '0',
  };
}

/** Validate the complete change before saving any setting. */
export function setWikiSettings(db: DB, input: Partial<WikiSettings>): WikiSettings {
  const next = { ...wikiSettings(db), ...input };
  if (typeof next.enabled !== 'boolean' || typeof next.gitIgnore !== 'boolean') throw new HttpError(400, 'Wiki switches must be on or off');
  if (typeof next.hubPath !== 'string' || (next.hubPath && (!path.isAbsolute(next.hubPath) || next.hubPath.includes('\0')))) throw new HttpError(400, 'The wiki hub must be an absolute path');
  if (typeof next.projectPath !== 'string' || !next.projectPath.trim() || path.isAbsolute(next.projectPath) || /[\0\r\n]/.test(next.projectPath) || next.projectPath.split(/[\\/]/).some((p) => p === '..' || p.toLowerCase() === '.git') || path.normalize(next.projectPath.trim()) === '.') throw new HttpError(400, 'The project wiki path must be inside the project');
  db.transaction(() => {
    // Write only requested fields so an inherited hub default continues to follow the task root.
    if (input.enabled !== undefined) kvSet(db, 'wiki.enabled', next.enabled ? '1' : '0');
    if (input.hubPath !== undefined) kvSet(db, 'wiki.hubPath', next.hubPath.trim());
    if (input.projectPath !== undefined) kvSet(db, 'wiki.projectPath', next.projectPath.trim());
    if (input.gitIgnore !== undefined) kvSet(db, 'wiki.gitIgnore', next.gitIgnore ? '1' : '0');
  })();
  return wikiSettings(db);
}
