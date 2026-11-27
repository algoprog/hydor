// The project a run works in: chosen by a question of type "project" in its form. The answer is the project's id (a
// name is taken too, from an agent or the API, and becomes the id); the first such question that is answered decides.
// The run then works in the project's folder, its agents' sessions belong to the project, and knowledge_search and
// knowledge_read in its steps search the project's knowledge bases.
//
// Only the person chooses a project freely: on the app's pages, in their sessions (use_app), in their schedules and
// with their own tokens. A run started by anyone else (an app's key, so a web app and its people; a public page; a
// webhook call or a watcher that fills the answer in) is held to the project the app itself sets (the question's
// default), or none (limitProjects, before projectOfAnswers).
import fs from 'node:fs';
import { answerOf, type AppField, type AppRun } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { allSpaces } from '../spaces/index.ts';

export type RunProject = NonNullable<AppRun['project']>;

const named = (spaces: ReturnType<typeof allSpaces>, v: string) => spaces.find((x) => x.id === v) ?? spaces.find((x) => x.name.trim().toLowerCase() === v.toLowerCase());

/**
 * Holds the project questions of a run to what the app sets: `limited` says which questions someone other than the
 * person answers. Such a question may be left out (it takes the app's default, else none: never the person's last
 * answer) or answered with the default itself, or with the project the run that calls this one already works in
 * (`inherited`). Anything else is refused, in words that name no project. `values` (the checked answers) is changed.
 * A default naming a project that is not here is none, whoever runs it. `given`: the answers as they were sent.
 */
export function limitProjects(db: DB, fields: AppField[], values: Record<string, string>, given: Record<string, unknown>, o: { limited: (f: AppField) => boolean; inherited?: string }) {
  const asked = fields.filter((f) => f.type === 'project');
  if (!asked.length) return;
  const spaces = allSpaces(db);
  for (const f of asked) {
    const set = f.default?.trim() ?? '';
    const own = set ? named(spaces, set)?.id : undefined;
    const said = answerOf(f, given);
    const left = said === undefined || said === null;
    const limited = o.limited(f);
    if (!limited) {
      // Left to a default that is not here (an app from another computer, a project deleted): none.
      if (left && set && !own && values[f.id] === set) values[f.id] = '';
    } else {
      const v = left ? (own ?? '') : (values[f.id] ?? '').trim();
      const s = v ? named(spaces, v) : undefined;
      if (v && v !== set && !(s && (s.id === own || s.id === o.inherited))) throw new HttpError(403, `Check the form: ${f.label}: a run started this way cannot choose a project. Leave it out, and the app uses the one it sets, if it sets one`);
      values[f.id] = s?.id ?? '';
    }
    if (f.required && !values[f.id]) {
      if (limited) throw new HttpError(403, `Check the form: ${f.label}: a run started this way cannot choose a project, and the app sets none for it`);
      throw new HttpError(400, `Check the form: ${f.label}: needed`);
    }
  }
}

/**
 * The project of a form's checked answers: each project question answered is set to that project's id (`values` is
 * changed), and the first one's project is given. Throws, in words, when there is no such project or its folder is
 * gone; `quiet` leaves the person's other projects and folders unnamed.
 */
export function projectOfAnswers(db: DB, fields: AppField[], values: Record<string, string>, o: { quiet?: boolean } = {}): RunProject | undefined {
  let out: RunProject | undefined;
  const asked = fields.filter((f) => f.type === 'project' && values[f.id]);
  if (!asked.length) return undefined;
  const spaces = allSpaces(db);
  for (const f of asked) {
    const v = values[f.id].trim();
    const s = named(spaces, v);
    if (!s) throw new HttpError(400, `Check the form: ${f.label}: there is no project “${v.slice(0, 80)}” (you have ${spaces.map((x) => x.name).join(', ').slice(0, 300) || 'none yet'})`);
    values[f.id] = s.id;
    out ??= { id: s.id, name: s.name, folder: s.folder };
  }
  if (out && !fs.statSync(out.folder, { throwIfNoEntry: false })?.isDirectory()) {
    if (o.quiet) throw new HttpError(409, 'The folder of the project the app sets is not there');
    throw new HttpError(409, `The folder of the project “${out.name}” is not there: ${out.folder}`);
  }
  return out;
}
