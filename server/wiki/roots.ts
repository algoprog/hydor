// Where wiki memory lives: whether it is on for a project (or the shared wiki), and its folder.
// A first version: the wiki memory core replaces wikiRoot's body with the full rules (folder mode, AGENTS.md
// bindings, containment checks) and keeps these two signatures, which the document digest and the routes use.
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db.ts';
import { spaceById } from '../spaces/index.ts';
import { wikiSettings } from './settings/settings.ts';

/** Wiki memory is on for the shared wiki (space null) as Settings says, and for a project unless it says otherwise. */
export function wikiMemoryOn(db: DB, space: string | null): boolean {
  const on = wikiSettings(db).enabled;
  if (!space) return on;
  return spaceById(db, space)?.wikiMemory ?? on;
}

/**
 * The wiki's folder, its real path: the shared wiki (space null) or a project's. Null while wiki memory is off for
 * it, or while the folder does not exist and `create` is not given; with `create`, made with wiki/ and raw/.
 */
export function wikiRoot(db: DB, space: string | null, o: { create?: boolean } = {}): string | null {
  if (!wikiMemoryOn(db, space)) return null;
  const hub = path.resolve(wikiSettings(db).hubPath);
  const root = space ? path.join(hub, 'projects', space) : hub;
  if (!fs.existsSync(root)) {
    if (!o.create) return null;
    for (const d of ['wiki', 'raw']) fs.mkdirSync(path.join(root, d), { recursive: true, mode: 0o700 });
  }
  return fs.realpathSync(root);
}
