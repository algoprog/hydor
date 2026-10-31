// Running an app for each row of a CSV: every row becomes a run waiting in line, and a few at a time
// start (two unless set). A row whose values do not fit the form fails at once with the reason, so
// the table of results says what to fix. A file field takes its cell as text (a path or an address).
// Stopping ends the rows still waiting and interrupts the rest.
import type { AppBatch, AppRecipe } from '../../shared/apps.ts';
import { cellText, isActive, resultHeader, toCsv } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { checkedInputs, launchQueued, onFinished, startRun, stopRun } from './runs.ts';
import { getBatch, insertBatch, insertRun, listRuns, runningBatches, setBatchStatus, updateRun } from './store.ts';

export const MAX_ROWS = 500;
export const MAX_CONCURRENCY = 6;

/** Where each batch's app lives, for the folder names of its runs. */
const slugs = new Map<string, string>();

export function startBatch(db: DB, o: { app: string; slug: string; recipe: AppRecipe; rows: Record<string, unknown>[]; concurrency?: number; name?: string }): AppBatch {
  const rows = o.rows.slice(0, MAX_ROWS + 1);
  if (!rows.length) throw new HttpError(400, 'There are no rows to run');
  if (rows.length > MAX_ROWS) throw new HttpError(400, `At most ${MAX_ROWS} rows at a time`);
  const concurrency = Math.max(1, Math.min(Math.round(Number(o.concurrency) || 2), MAX_CONCURRENCY));
  const id = insertBatch(db, { app: o.app, name: o.name?.slice(0, 120), concurrency, total: rows.length });
  slugs.set(id, o.slug);
  rows.forEach((row, i) => {
    const { errors } = checkedInputs(o.recipe, row && typeof row === 'object' ? row : {}, false);
    if (errors.length) {
      const r = insertRun(db, { app: o.app, appName: o.recipe.name, recipe: o.recipe, source: 'batch', inputs: Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k, cellText(v)])), status: 'failed', batch: id, row: i + 1 });
      updateRun(db, r.id, { error: errors.join('; '), endedAt: Date.now() });
    } else startRun({ app: o.app, slug: o.slug, recipe: o.recipe, source: 'batch', inputs: row, batch: id, row: i + 1, queued: true });
  });
  pump(db, id);
  return getBatch(db, id)!;
}

/** Starts waiting rows while fewer than the batch's limit run; ends the batch when none are left. */
export function pump(db: DB, id: string) {
  const b = getBatch(db, id);
  if (!b || b.status !== 'running') return;
  const runs = listRuns(db, { batch: id, limit: MAX_ROWS + 10 });
  const going = runs.filter((r) => isActive(r.status) && r.status !== 'queued').length;
  const waiting = runs.filter((r) => r.status === 'queued');
  for (const r of waiting.slice(0, Math.max(0, b.concurrency - going))) launchQueued(r, slugs.get(id) ?? r.app);
  if (!waiting.length && !going) setBatchStatus(db, id, 'done');
}

export async function stopBatch(db: DB, id: string) {
  const b = getBatch(db, id);
  if (!b) throw new HttpError(404, 'No such run of rows');
  setBatchStatus(db, id, 'stopped');
  for (const r of listRuns(db, { batch: id, limit: MAX_ROWS + 10 })) if (isActive(r.status)) await stopRun(r.id);
}

/** The table of a batch's results as CSV: its inputs, each answer field, the status and the session. */
export function batchCsv(db: DB, id: string, recipe: AppRecipe, link: (key: string) => string): string {
  const runs = listRuns(db, { batch: id, limit: MAX_ROWS + 10 });
  const fields = recipe.fields;
  const answer = resultHeader(recipe.answer);
  // A result column named like a question says it is the answer.
  const asked = new Set(fields.map((f) => f.label.toLowerCase()));
  const head = ['Row', ...fields.map((f) => f.label), ...answer.map((a) => (asked.has(a.label.toLowerCase()) ? `${a.label} (answer)` : a.label)), ...(recipe.answer.length ? [] : ['Reply']), 'Status', 'Error', 'Cost (USD)', 'Session'];
  const rows = runs.map((r) => [
    r.row ?? '',
    ...fields.map((f) => r.inputs[f.id] ?? ''),
    ...answer.map((a) => cellText(r.result?.[a.id])),
    ...(recipe.answer.length ? [] : [r.reply ?? '']),
    r.status,
    r.error ?? '',
    r.costUsd ?? '',
    r.key ? link(r.key) : '',
  ]);
  return toCsv([head, ...rows]);
}

/** Batches go on after a restart; each run's end may start the next. */
export function startBatches(db: DB, slugOf: (app: string) => string | undefined) {
  onFinished((r) => {
    if (r.batch) pump(db, r.batch);
  });
  for (const id of runningBatches(db)) {
    const b = getBatch(db, id);
    if (!b) continue;
    const s = slugOf(b.app);
    if (s) slugs.set(id, s);
    pump(db, id);
  }
}

