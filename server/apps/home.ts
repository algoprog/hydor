// An app that opens on its own page (its view has pages for that page, like Explore's magazine): the answers it runs
// with from there, kept as its settings (its form's questions, each at its default until changed), and Update
// automatically, a scheduled task that runs it at a time with those answers: every day, on weekdays, or once a week on
// a day of your choice (the days a "daily" schedule keeps). The task shows in Settings → Scheduled tasks like any
// other; turning it off removes it. A ready-made app may say when it starts updating (`home` on its recipe: the weekly
// report on Fridays at 16:00). Ready-made apps and your own alike.
import type { AppField, AppRecipe } from '../../shared/apps.ts';
import { cleanDays, TIME_OF_DAY } from '../../shared/apps.ts';
import type { ScheduledTask } from '../../shared/automations.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Scheduler } from '../scheduler.ts';

export interface HomeSettings {
  /** The answers its runs from its page, and its automatic runs, take: each question's, as text. */
  inputs: Record<string, string>;
  /**
   * Update automatically: whether it is on, at what time where you are (HH:MM), and on which days of the week (0 is
   * Sunday; unset: every day). Off, the time and days are what it would start with.
   */
  daily: { on: boolean; time: string; days?: number[] };
}

/** When an update runs unless the app or you pick another time. */
export const DAILY_TIME = '07:00';
const kvKey = (id: string) => `apps.home.${id}`;
const origin = (id: string) => `daily:${id}`;

/** Its form's answers: those kept, else each question's default (files are never kept). */
function answers(fields: AppField[], kept: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(fields.filter((f) => f.type !== 'file').map((f) => [f.id, typeof kept?.[f.id] === 'string' ? (kept[f.id] as string) : (f.default ?? '')]));
}

/** The task that updates it by itself, when there is one. */
export const dailyTask = (scheduler: Scheduler | undefined, id: string): ScheduledTask | undefined => scheduler?.list().find((t) => t.origin === origin(id));

/** What is kept of its settings: its answers, and the time and days last picked (for when it is turned on again). */
function keptOf(db: DB, id: string): { inputs?: Record<string, unknown>; when?: { time?: unknown; days?: unknown } } {
  try {
    const v = JSON.parse(kvGet(db, kvKey(id)) ?? 'null');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function homeOf(db: DB, scheduler: Scheduler | undefined, id: string, recipe: Pick<AppRecipe, 'fields' | 'home'>): HomeSettings {
  const kept = keptOf(db, id);
  const t = dailyTask(scheduler, id);
  const s = t?.schedule.kind === 'daily' ? t.schedule : null;
  // Without its task: when it would start (as last picked, else the app's own say, else every morning).
  const picked = kept.when && typeof kept.when.time === 'string' && TIME_OF_DAY.test(kept.when.time) ? { time: kept.when.time, days: cleanDays(kept.when.days) } : null;
  const time = s ? s.time : (picked?.time ?? recipe.home?.time ?? DAILY_TIME);
  const days = s ? cleanDays(s.days) : picked ? picked.days : cleanDays(recipe.home?.days);
  return { inputs: answers(recipe.fields, kept.inputs), daily: { on: !!t?.enabled, time, ...(days ? { days } : {}) } };
}

/**
 * Keeps new answers and turns Update automatically on or off (at a time, on some days); the task follows. Days: a
 * list of 0 (Sunday) to 6, or null (or every day listed) for every day. Gives the settings as they are now.
 */
export function saveHome(db: DB, scheduler: Scheduler | undefined, id: string, recipe: Pick<AppRecipe, 'name' | 'fields' | 'home'>, body: unknown): HomeSettings {
  const b = (body ?? {}) as { inputs?: unknown; daily?: unknown };
  const cur = homeOf(db, scheduler, id, recipe);
  const inputs = { ...cur.inputs };
  if (b.inputs && typeof b.inputs === 'object' && !Array.isArray(b.inputs)) {
    for (const f of recipe.fields) {
      const v = (b.inputs as Record<string, unknown>)[f.id];
      if (v !== undefined && f.type !== 'file') inputs[f.id] = String(v ?? '').slice(0, 4000);
    }
  }
  const d = b.daily && typeof b.daily === 'object' ? (b.daily as { on?: unknown; time?: unknown; days?: unknown }) : {};
  if (d.time !== undefined && (typeof d.time !== 'string' || !TIME_OF_DAY.test(d.time))) throw new HttpError(400, 'A time of day, as 07:00');
  if (d.days !== undefined && d.days !== null && (!Array.isArray(d.days) || !d.days.length || d.days.some((x) => !Number.isInteger(x) || (x as number) < 0 || (x as number) > 6)))
    throw new HttpError(400, 'Days of the week, as numbers from 0 (Sunday) to 6 (Saturday), or null for every day');
  const days = d.days === undefined ? cur.daily.days : cleanDays(d.days);
  const daily = { on: typeof d.on === 'boolean' ? d.on : cur.daily.on, time: typeof d.time === 'string' ? d.time : cur.daily.time, ...(days ? { days } : {}) };
  const missing = recipe.fields.filter((f) => f.required && f.type !== 'file' && !inputs[f.id]?.trim());
  if (daily.on && missing.length) throw new HttpError(400, `Fill in ${missing.map((f) => `“${f.label}”`).join(', ')} first: each update needs it`);
  if (daily.on && recipe.fields.some((f) => f.required && f.type === 'file')) throw new HttpError(400, 'It needs a file each time, so it cannot update by itself');
  if (daily.on && !scheduler) throw new HttpError(503, 'Scheduled tasks are not on here');
  kvSet(db, kvKey(id), JSON.stringify({ inputs, when: { time: daily.time, ...(daily.days ? { days: daily.days } : {}) } }));
  // The task follows: made, changed (its time, its days, its answers) or removed.
  const t = dailyTask(scheduler, id);
  if (daily.on) {
    scheduler!.save(
      {
        ...(t ? { id: t.id } : {}),
        name: t?.name ?? recipe.name,
        prompt: '',
        agent: 'claude',
        cwd: '~',
        schedule: { kind: 'daily', time: daily.time, ...(daily.days ? { days: daily.days } : {}) },
        app: { id, inputs },
        enabled: true,
        ...(t?.failLimit !== undefined ? { failLimit: t.failLimit } : {}),
      },
      { origin: origin(id) },
    );
  } else if (t) scheduler!.remove(t.id);
  return homeOf(db, scheduler, id, recipe);
}

/** Its task goes with it (an app deleted, a ready-made one uninstalled). */
export function dropDaily(scheduler: Scheduler | undefined, id: string) {
  const t = dailyTask(scheduler, id);
  if (t) scheduler!.remove(t.id);
}
