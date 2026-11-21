// About you (shared/app-me.ts): the one record of what apps would otherwise ask on every run, kept here once, and
// the last answers of the questions that remember theirs (remember: true), kept for each app so every device starts
// from them. Neither is ever written by an agent on its own: the record changes from Settings → Apps (or an agent's
// call the person confirms on a card), and from "Remember for all apps" on a form; the last answers from the person's
// own runs (their form, or an app an agent ran for them in a session).
import type { AppField, RunSource } from '../../shared/apps.ts';
import { changeMe, cleanMe, langOf, fromField, meOf, startFrom, type AboutMe, type MeId, type MeSource } from '../../shared/app-me.ts';
import { userLang } from '../language/index.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { userTimezone } from '../userPrefs.ts';

const KEY = 'apps.me';
const lastKey = (app: string) => `apps.last.${app}`;

/** The record as the person set it. */
export function readMe(db: DB): AboutMe {
  try {
    return cleanMe(JSON.parse(kvGet(db, KEY) ?? '{}'));
  } catch {
    return {};
  }
}

/** What the pages show: the record as set, and with what is not set worked out (and from what). */
export function aboutMe(db: DB): { me: AboutMe; values: AboutMe; derived: Partial<Record<MeId, MeSource>> } {
  const me = readMe(db);
  return { me, ...meOf(me, { timezone: userTimezone(db), lastLanguage: userLang(db) }) };
}

/** The record with a change (only the fields given; null or empty clears one). */
export function changeAboutMe(db: DB, patch: unknown) {
  const next = changeMe(readMe(db), patch);
  kvSet(db, KEY, JSON.stringify(next));
  return aboutMe(db);
}

/** The person's last answers to an app's questions that remember them, by question. */
export function lastAnswers(db: DB, app: string): Record<string, string> {
  try {
    const v = JSON.parse(kvGet(db, lastKey(app)) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
  } catch {
    return {};
  }
}

/** Runs whose answers are the person's own, to remember: their form, and an app an agent ran for them (its card). */
const OWN: RunSource[] = ['web', 'session'];

/** Keeps the answers a run of the person's own gave to the questions that remember theirs (an empty one is forgotten). */
export function keepAnswers(db: DB, app: string, source: RunSource, fields: AppField[], values: Record<string, string>) {
  if (!OWN.includes(source) || app === 'test') return;
  const kept = fields.filter((f) => f.remember && f.type !== 'file');
  if (!kept.length) return;
  const last = lastAnswers(db, app);
  for (const f of kept) {
    const v = values[f.id] ?? '';
    if (v.trim()) last[f.id] = v.slice(0, 4000);
    else delete last[f.id];
  }
  kvSet(db, lastKey(app), JSON.stringify(last));
}

/** An app that is gone forgets its last answers. */
export function forgetAnswers(db: DB, app: string) {
  db.prepare('delete from kv where k = ?').run(lastKey(app));
}

/**
 * What each question of a form starts from, by question: About you's field for one that says `from` (as set, or
 * worked out), the person's last answer for one that remembers it. Questions with neither, or with nothing to start
 * from, are left out (they start from their default).
 */
export function startsFor(db: DB, fields: AppField[], app: string, values: AboutMe = aboutMe(db).values): Record<string, string> {
  const out: Record<string, string> = {};
  const last = fields.some((f) => f.remember) ? lastAnswers(db, app) : {};
  for (const f of fields) {
    const id = fromField(f.from);
    const v = id ? startFrom(f, id, values) : f.remember ? last[f.id] : undefined;
    if (v !== undefined && v !== '') out[f.id] = v;
  }
  return out;
}

/** The language a run writes in: what started it said, else About you's (set, or the one the app was last used in), else English. */
export function runLanguage(db: DB, given: unknown, isPublic: boolean): string {
  return langOf(given) ?? (isPublic ? undefined : aboutMe(db).values.language) ?? 'en';
}
