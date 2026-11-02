// A template an agent built, changed by the user in its editor: the agent hears of it with the user's next
// message (as it does for pages), so it builds on their version instead of writing its own over it. A
// session that saved a template with app_save is one of its builders; its next app_save after the user's
// change asks it to read their version first (app_get), unless it means to write over it (force).
import type { AppRecipe } from '../../shared/apps.ts';
import type { Step } from '../../shared/app-manifest.ts';
import { allSteps, STEP_KINDS, titleOf } from '../../shared/app-manifest.ts';
import type { DB } from '../db.ts';

export function initAppEdits(db: DB) {
  db.exec(`
    create table if not exists app_builders (app_id text not null, key text not null, seen integer not null, primary key (app_id, key));
    create table if not exists app_edits (key text not null, app_id text not null, name text not null, before text not null, after text not null, at integer not null, primary key (key, app_id));
    create table if not exists app_user_edits (app_id text primary key, at integer not null);
  `);
}

/** When the user last changed a template in its editor (undefined: never). */
export function userEditAt(db: DB, appId: string): number | undefined {
  return (db.prepare('select at from app_user_edits where app_id = ?').get(appId) as { at: number } | undefined)?.at;
}

/** A session's agent saved (or read) a template as it is now: it builds it, and has seen the user's changes so far. */
export function noteBuilder(db: DB, appId: string, key: string, seen = Date.now()) {
  db.prepare('insert into app_builders (app_id, key, seen) values (?, ?, ?) on conflict(app_id, key) do update set seen = excluded.seen').run(appId, key, seen);
}

/** When a session's agent last saw a template (undefined: it does not build it). */
export function seenBy(db: DB, appId: string, key: string): number | undefined {
  return (db.prepare('select seen from app_builders where app_id = ? and key = ?').get(appId, key) as { seen: number } | undefined)?.seen;
}

/** The agent wrote over what the user changed (it meant to): nothing left to tell. */
export function dropEdits(db: DB, appId: string, key: string) {
  db.prepare('delete from app_edits where key = ? and app_id = ?').run(key, appId);
}

/** The user changed a template in its editor: each session that builds it hears of it with its next message (from the version it last heard of). */
export function noteUserEdit(db: DB, appId: string, name: string, before: AppRecipe, after: AppRecipe) {
  db.prepare('insert or replace into app_user_edits (app_id, at) values (?, ?)').run(appId, Date.now());
  for (const { key } of db.prepare('select key from app_builders where app_id = ?').all(appId) as { key: string }[]) {
    const had = db.prepare('select before from app_edits where key = ? and app_id = ?').get(key, appId) as { before: string } | undefined;
    db.prepare('insert or replace into app_edits (key, app_id, name, before, after, at) values (?, ?, ?, ?, ?, ?)').run(key, appId, name, had?.before ?? JSON.stringify(before), JSON.stringify(after), Date.now());
  }
}

const kindName = (k: string) => STEP_KINDS.find((x) => x.value === k)?.label ?? k;
const stepsById = (r: AppRecipe) => new Map<string, Step>([...(r.flow ? allSteps(r.flow.steps) : []), ...Object.values(r.flows ?? {}).flatMap((f) => allSteps(f.steps))].map((s) => [s.id, s]));
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What changed between two versions of a template, a line each. */
export function changesOf(before: AppRecipe, after: AppRecipe): string[] {
  const out: string[] = [];
  if (before.name !== after.name) out.push(`Its name: “${before.name}” → “${after.name}”.`);
  const fieldsBefore = new Map(before.fields.map((f) => [f.id, f]));
  const fieldsAfter = new Map(after.fields.map((f) => [f.id, f]));
  const addedF = after.fields.filter((f) => !fieldsBefore.has(f.id)).map((f) => `“${f.label}” (${f.id})`);
  const goneF = before.fields.filter((f) => !fieldsAfter.has(f.id)).map((f) => `“${f.label}” (${f.id})`);
  const changedF = after.fields.filter((f) => fieldsBefore.has(f.id) && !same(fieldsBefore.get(f.id), f)).map((f) => `“${f.label}”`);
  if (addedF.length) out.push(`The form: added ${addedF.join(', ')}.`);
  if (goneF.length) out.push(`The form: removed ${goneF.join(', ')}.`);
  if (changedF.length) out.push(`The form: changed ${changedF.join(', ')}.`);
  if (before.prompt !== after.prompt) out.push('The task changed.');
  const sb = stepsById(before);
  const sa = stepsById(after);
  for (const [id, s] of sa) if (!sb.has(id)) out.push(`Added the step “${titleOf(s)}” (${id}, ${kindName(s.do)}).`);
  for (const [id, s] of sb) if (!sa.has(id)) out.push(`Removed the step “${titleOf(s)}” (${id}).`);
  for (const [id, s] of sa) {
    const was = sb.get(id);
    if (was && !same({ ...was, then: undefined, else: undefined, steps: undefined, branches: undefined, failed: Array.isArray(was.failed) ? 'steps' : was.failed }, { ...s, then: undefined, else: undefined, steps: undefined, branches: undefined, failed: Array.isArray(s.failed) ? 'steps' : s.failed }))
      out.push(`Changed the step “${titleOf(s)}” (${id}).`);
  }
  const order = (r: AppRecipe) => (r.flow ? r.flow.steps.map((s) => s.id).join(',') : '');
  if (order(before) !== order(after) && [...sa.keys()].every((id) => sb.has(id)) && [...sb.keys()].every((id) => sa.has(id))) out.push('The steps are in another order.');
  if (!same(before.flow?.outputs, after.flow?.outputs)) out.push('Where its answer comes from changed.');
  if (!same(before.answer, after.answer)) out.push('Its answer fields changed.');
  if (!same(before.data, after.data)) out.push('What it keeps changed.');
  if (!same(before.examples, after.examples)) out.push(`Its examples changed (${after.examples?.length ?? 0} now).`);
  const others = (['agent', 'acpAgent', 'model', 'effort', 'mode', 'assistant', 'tools', 'limits', 'memory', 'requires', 'description', 'icon', 'color'] as const).filter((k) => !same(before[k], after[k]));
  if (others.length) out.push(`Also changed: ${others.join(', ')}.`);
  return out;
}

/** What to tell a session of the templates the user changed since its agent last heard (null: nothing). */
export function takeAppEdits(db: DB, key: string): string | null {
  const rows = db.prepare('select * from app_edits where key = ? order by at').all(key) as { app_id: string; name: string; before: string; after: string }[];
  if (!rows.length) return null;
  db.prepare('delete from app_edits where key = ?').run(key);
  const parts = rows.map((r) => {
    const lines = changesOf(JSON.parse(r.before) as AppRecipe, JSON.parse(r.after) as AppRecipe);
    return `- “${r.name}” (template ${r.app_id}): ${lines.length ? lines.join(' ') : 'saved again, nothing in it changed.'}`;
  });
  return ['The user changed a template you built, in its editor, since your last turn. Build on their version: app_get gives it as it is now, and app_save keeps what you do not change.', ...parts].join('\n');
}
