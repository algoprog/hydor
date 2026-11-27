// Which program a run takes, settled before it starts (shared/app-run-with.ts has the order). The setting "Ready-made
// apps run with" and the choice kept for each ready-made app are held here, by the app's id, so they hold on every device
// and for runs that no page starts. A run that would work with a Claude Code or Codex not signed in here is refused with
// the program and where to change it: another is never taken in its place.
import { cleanPick, isRunWith, programsOf, resolvePick, withPick, type AppPick, type PickFrom, type RunsWithView, type RunWith, type SentPick } from '../../shared/app-run-with.ts';
import type { AppRecipe, AppTemplate, RunSource } from '../../shared/apps.ts';
import { isProgram, PROGRAM_LABEL, programUsable } from '../../shared/programs.ts';
import { programRefusal, programsNow, programStatus } from '../agents/programs.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { templateById } from './templates.ts';

const KEY = 'apps.runWith';
const keptKey = (id: string) => `apps.runWith.${id}`;

export function runWithSetting(db: DB): RunWith {
  const v = kvGet(db, KEY);
  return isRunWith(v) ? v : 'auto';
}

export const setRunWith = (db: DB, v: RunWith) => kvSet(db, KEY, v);

/** The choice kept for a ready-made app (by its template id), or null. */
export function keptPick(db: DB, id: string): AppPick | null {
  try {
    return cleanPick(JSON.parse(kvGet(db, keptKey(id)) ?? 'null'));
  } catch {
    return null;
  }
}

export function keepPick(db: DB, id: string, pick: AppPick | null) {
  if (pick) kvSet(db, keptKey(id), JSON.stringify(pick));
  else db.prepare('delete from kv where k = ?').run(keptKey(id));
}

/** What a ready-made app runs with: `sent`, what this run picked for itself. */
export function readyPick(db: DB, t: AppTemplate, sent?: SentPick | null): { pick: AppPick; from: PickFrom } {
  return resolvePick(t, { sent, kept: keptPick(db, t.id), setting: runWithSetting(db), status: programsNow() });
}

export function runsWithView(db: DB, t: AppTemplate): RunsWithView {
  const r = readyPick(db, t);
  return { pick: r.pick, from: r.from as RunsWithView['from'] };
}

/** What settling a run needs to know of it (StartInput has it all). */
export interface ToSettle {
  /** The app's id, or "tpl:<id>". */
  app: string;
  recipe: AppRecipe;
  source: RunSource;
  flow?: string;
  /** A ready-made app's run: what it picked for itself. */
  pick?: SentPick;
  /** Its recipe's program is settled already (a test of a recipe on screen, a run again of an earlier one): taken as it is. */
  settled?: boolean;
  public?: unknown;
}

type Said = PickFrom | 'own' | 'again';

/** Why a run on the program is refused: the program, and where to change which one runs it. */
function sentence(program: string, name: string, from: Said | 'step'): string {
  const out = `${program} is not signed in here`;
  const sign = 'sign in to it in Settings → Agents → Accounts';
  if (from === 'kept') return `“${name}” is kept to run with ${program}, and ${out}: ${sign}, or pick another on the app’s page (Change, then Back to default or Keep for this app).`;
  if (from === 'setting') return `Ready-made apps are set to run with ${program}, and ${out}: ${sign}, or change Settings → Capabilities → Apps → Ready-made apps run with.`;
  if (from === 'own') return `“${name}” runs with ${program}, and ${out}: ${sign}, or pick another program in the app (Edit → Settings → Who does it).`;
  if (from === 'step') return `A step of “${name}” runs with ${program}, and ${out}: ${sign}, or change that step’s program.`;
  if (from === 'again') return `That run of “${name}” used ${program}, and ${out}: ${sign}, or run the app again from its page.`;
  return `${out[0].toUpperCase()}${out.slice(1)}: ${sign}, or pick another program for this run.`;
}

/** A run's recipe with its program settled, and why it may not start (null: it may). */
export function settle(db: DB, o: ToSettle): { recipe: AppRecipe; why: string | null } {
  // A public page's runs are Custom's, whatever the app names.
  if (o.public) return { recipe: o.recipe, why: null };
  let recipe = o.recipe;
  let from: Said = o.source === 'step' ? 'run' : o.settled && o.app.startsWith('tpl:') ? (o.source === 'test' ? 'run' : 'again') : 'own';
  const t = !o.settled && o.source !== 'step' && o.app.startsWith('tpl:') ? templateById(o.app.slice(4)) : undefined;
  if (t) {
    const r = readyPick(db, t, o.pick);
    recipe = withPick(o.recipe, r.pick);
    from = r.from;
  }
  const status = programsNow();
  const out = programsOf(recipe, o.flow).find((p) => !programUsable(status, p.agent));
  return { recipe, why: out && isProgram(out.agent) ? sentence(PROGRAM_LABEL[out.agent], recipe.name, out.step ? 'step' : from) : null };
}

/**
 * Before a run starts, from where it can wait: whether each program is signed in is known, and one the run needs that
 * reads as not is asked afresh (a sign-in made in a terminal shows then).
 */
export async function lookAgain(db: DB, o: ToSettle): Promise<void> {
  await programStatus();
  if (o.public) return;
  for (const p of programsOf(settle(db, o).recipe, o.flow)) await programRefusal(p.agent);
}
