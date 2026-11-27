// The project a run works in: chosen by a question of type "project" in its form. The answer is the project's id (a
// name is taken too, from an agent or the API, and becomes the id); the first such question that is answered decides.
// The run then works in the project's folder, its agents' sessions belong to the project, and knowledge_search and
// knowledge_read in its steps search the project's knowledge bases.
import fs from 'node:fs';
import type { AppField, AppRun } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { allSpaces } from '../spaces/index.ts';

export type RunProject = NonNullable<AppRun['project']>;

/**
 * The project of a form's checked answers: each project question answered is set to that project's id (`values` is
 * changed), and the first one's project is given. Throws, in words, when there is no such project or its folder is gone.
 */
export function projectOfAnswers(db: DB, fields: AppField[], values: Record<string, string>, o: { names?: boolean } = {}): RunProject | undefined {
  let out: RunProject | undefined;
  const asked = fields.filter((f) => f.type === 'project' && values[f.id]);
  if (!asked.length) return undefined;
  const spaces = allSpaces(db);
  for (const f of asked) {
    const v = values[f.id].trim();
    const s = spaces.find((x) => x.id === v) ?? spaces.find((x) => x.name.trim().toLowerCase() === v.toLowerCase());
    // A program with an app's key hears of no project it did not name.
    const have = o.names === false ? '' : ` (you have ${spaces.map((x) => x.name).join(', ').slice(0, 300) || 'none yet'})`;
    if (!s) throw new HttpError(400, `Check the form: ${f.label}: there is no project “${v.slice(0, 80)}”${have}`);
    values[f.id] = s.id;
    out ??= { id: s.id, name: s.name, folder: s.folder };
  }
  if (out && !fs.statSync(out.folder, { throwIfNoEntry: false })?.isDirectory()) throw new HttpError(409, `The folder of the project “${out.name}” is not there: ${out.folder}`);
  return out;
}
