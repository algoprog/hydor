// An app that opens on its own page (its view has pages for that page, like Explore's magazine): the answers it runs
// with from there, kept as its settings (its form's questions, each at its default until changed), and Update every
// day, a scheduled task that runs it each day at a time with those answers. The task shows in Settings → Scheduled
// tasks like any other; turning Update every day off removes it. Ready-made apps and your own alike.
import type { AppField, AppRecipe } from '../../shared/apps.ts';
import type { ScheduledTask } from '../../shared/automations.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Scheduler } from '../scheduler.ts';

export interface HomeSettings {
  /** The answers its runs from its page, and its daily runs, take: each question's, as text. */
  inputs: Record<string, string>;
  /** Update every day: whether it is on, and at what time where you are (HH:MM). */
  daily: { on: boolean; time: string };
}

/** When a daily update runs unless you pick another time. */
export const DAILY_TIME = '07:00';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const kvKey = (id: string) => `apps.home.${id}`;
const origin = (id: string) => `daily:${id}`;

/** Its form's answers: those kept, else each question's default (files are never kept). */
function answers(fields: AppField[], kept: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(fields.filter((f) => f.type !== 'file').map((f) => [f.id, typeof kept?.[f.id] === 'string' ? (kept[f.id] as string) : (f.default ?? '')]));
}

/** The task that updates it every day, when there is one. */
export const dailyTask = (scheduler: Scheduler | undefined, id: string): ScheduledTask | undefined => scheduler?.list().find((t) => t.origin === origin(id));

export function homeOf(db: DB, scheduler: Scheduler | undefined, id: string, recipe: Pick<AppRecipe, 'fields'>): HomeSettings {
  let kept: Record<string, unknown> | undefined;
  try {
    kept = JSON.parse(kvGet(db, kvKey(id)) ?? 'null')?.inputs;
  } catch {}
  const t = dailyTask(scheduler, id);
  return { inputs: answers(recipe.fields, kept), daily: { on: !!t?.enabled, time: t?.schedule.kind === 'daily' ? t.schedule.time : DAILY_TIME } };
}

/** Keeps new answers and turns Update every day on or off (at a time); the daily task follows. Gives the settings as they are now. */
export function saveHome(db: DB, scheduler: Scheduler | undefined, id: string, recipe: Pick<AppRecipe, 'name' | 'fields'>, body: unknown): HomeSettings {
  const b = (body ?? {}) as { inputs?: unknown; daily?: unknown };
  const cur = homeOf(db, scheduler, id, recipe);
  const inputs = { ...cur.inputs };
  if (b.inputs && typeof b.inputs === 'object' && !Array.isArray(b.inputs)) {
    for (const f of recipe.fields) {
      const v = (b.inputs as Record<string, unknown>)[f.id];
      if (v !== undefined && f.type !== 'file') inputs[f.id] = String(v ?? '').slice(0, 4000);
    }
  }
  const d = b.daily && typeof b.daily === 'object' ? (b.daily as { on?: unknown; time?: unknown }) : {};
  if (d.time !== undefined && (typeof d.time !== 'string' || !HHMM.test(d.time))) throw new HttpError(400, 'A time of day, as 07:00');
  const daily = { on: typeof d.on === 'boolean' ? d.on : cur.daily.on, time: typeof d.time === 'string' ? d.time : cur.daily.time };
  const missing = recipe.fields.filter((f) => f.required && f.type !== 'file' && !inputs[f.id]?.trim());
  if (daily.on && missing.length) throw new HttpError(400, `Fill in ${missing.map((f) => `“${f.label}”`).join(', ')} first: each update needs it`);
  if (daily.on && recipe.fields.some((f) => f.required && f.type === 'file')) throw new HttpError(400, 'It needs a file each time, so it cannot update by itself');
  if (daily.on && !scheduler) throw new HttpError(503, 'Scheduled tasks are not on here');
  kvSet(db, kvKey(id), JSON.stringify({ inputs }));
  // The daily task follows: made, changed (its time, its answers) or removed.
  const t = dailyTask(scheduler, id);
  if (daily.on) {
    scheduler!.save(
      { ...(t ? { id: t.id } : {}), name: t?.name ?? recipe.name, prompt: '', agent: 'claude', cwd: '~', schedule: { kind: 'daily', time: daily.time }, app: { id, inputs }, enabled: true, ...(t?.failLimit !== undefined ? { failLimit: t.failLimit } : {}) },
      { origin: origin(id) },
    );
  } else if (t) scheduler!.remove(t.id);
  return homeOf(db, scheduler, id, recipe);
}

/** Its daily task goes with it (an app deleted, a ready-made one uninstalled). */
export function dropDaily(scheduler: Scheduler | undefined, id: string) {
  const t = dailyTask(scheduler, id);
  if (t) scheduler!.remove(t.id);
}
