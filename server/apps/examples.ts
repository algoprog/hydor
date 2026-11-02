// Examples: saved inputs a template is tried with, and checks on what each run gives. Trying them starts a
// test run for each; when one ends, its checks are read against what it gave: its answer ({{answer.field}}),
// its steps' values ({{step.value}}), its reply ({{reply}}) and its inputs ({{topic}}). The builder shows
// how each went, agents try them with app_try, and Firm it up compares a change on them.
import type { AppExample, CheckResult, Scope } from '../../shared/app-manifest.ts';
import { asText, evalRule, lookup, refsIn } from '../../shared/app-manifest.ts';
import type { AppDef, AppRecipe } from '../../shared/apps.ts';
import type { DB } from '../db.ts';
import { startRun } from './runs.ts';
import { listSteps, type RunRecord } from './store.ts';

/** What a run gave, as its checks see it: its inputs, its steps' values (not a Repeat's rounds), its answer and its reply. */
export function scopeOfRun(db: DB, r: RunRecord): Scope {
  const steps: Scope['steps'] = {};
  for (const st of listSteps(db, r.id)) if (!st.path.includes('#') && st.outputs && st.status === 'done') steps[st.id] = st.outputs;
  steps.answer = r.result ?? {};
  return { inputs: r.inputs, steps, vars: { reply: r.reply ?? '', today: new Date().toISOString().slice(0, 10) } };
}

/** How an example run's checks went (null: it tried no example, or its example is gone). */
export function checkRun(db: DB, r: RunRecord): CheckResult[] | null {
  const ex = r.example ? r.recipe.examples?.find((e) => e.id === r.example) : undefined;
  if (!ex) return null;
  const scope = scopeOfRun(db, r);
  return (ex.checks ?? []).map((rule) => {
    try {
      if (evalRule(rule, scope)) return { rule, ok: true };
      // What it saw, to say why it does not hold.
      const seen = refsIn(rule).map((p) => `${p} is ${asText(lookup(p, scope).value, 80) || 'empty'}`);
      return { rule, ok: false, ...(seen.length ? { why: seen.join('; ') } : {}) };
    } catch (e) {
      return { rule, ok: false, why: (e as Error).message };
    }
  });
}

/** Whether a run passed its example: it ended with its answer, and every check held. */
export const passed = (r: Pick<RunRecord, 'status' | 'checks'>) => r.status === 'done' && (r.checks ?? []).every((c) => c.ok);

/** Starts a test run for each of a template's examples (or those named): the recipe given (the builder's), or as saved. */
export function tryExamples(o: { app: AppDef | null; recipe: AppRecipe; only?: string[]; slug: string }): { example: AppExample; run?: RunRecord; error?: string }[] {
  return (o.recipe.examples ?? [])
    .filter((e) => !o.only || o.only.includes(e.id))
    .map((example) => {
      try {
        const run = startRun({ app: o.app?.id ?? 'test', slug: o.slug, recipe: o.recipe, source: 'test', inputs: example.inputs, ...(example.flow ? { flow: example.flow } : {}), example: example.id });
        return { example, run };
      } catch (e) {
        return { example, error: (e as Error).message };
      }
    });
}
