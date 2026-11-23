// The settings of word suggestions: kept in the database (kv, "suggest.settings") as the part that differs from
// SUGGEST_DEFAULTS, read through the same checks a change goes through, so a value that is no longer valid reads as its default.
import os from 'node:os';
import { SUGGEST_DEFAULTS, SUGGEST_LIMITS, type SuggestSettings } from '../../shared/suggest.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';

export const KEY = 'suggest.settings';

const LLM = ['auto', 'on', 'off'] as const;
const QUANT = ['q8', 'q4'] as const;
const SCHEDULE = ['nightly', 'weekly', 'manual'] as const;
const WHERE = ['chat', 'docs', 'notes', 'other'] as const;
const SOURCES = ['messages', 'replies', 'notes', 'docs'] as const;
const NUMBERS = ['precision', 'typedWords', 'contextWords', 'threads', 'userWeight', 'trainThreads'] as const;
const SWITCHES = ['enabled', 'nextWord', 'switchByLanguage', 'sessionCache', 'personalise'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * `patch` laid over `base`, every field checked: a field of the wrong type or outside its limits is a 400 naming it
 * (`strict`), or left as it was (reading what is kept). Unknown fields are refused (strict) or ignored.
 */
export function merge(base: SuggestSettings, patch: unknown, strict: boolean): SuggestSettings {
  const out: SuggestSettings = { ...base, where: { ...base.where }, sources: { ...base.sources } };
  if (!isObj(patch)) {
    if (strict) throw new HttpError(400, 'Send the settings to change as an object');
    return out;
  }
  const bad = (field: string, why: string) => {
    if (strict) throw new HttpError(400, `${field}: ${why}`);
  };
  const o = out as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if ((SWITCHES as readonly string[]).includes(k)) {
      if (typeof v === 'boolean') o[k] = v;
      else bad(k, 'true or false');
    } else if (k === 'llm' || k === 'quant' || k === 'schedule') {
      const allowed: readonly string[] = k === 'llm' ? LLM : k === 'quant' ? QUANT : SCHEDULE;
      if (typeof v === 'string' && allowed.includes(v)) o[k] = v;
      else bad(k, `one of ${allowed.join(', ')}`);
    } else if ((NUMBERS as readonly string[]).includes(k)) {
      const [lo, hi] = SUGGEST_LIMITS[k as (typeof NUMBERS)[number]];
      const whole = k !== 'precision';
      if (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && (!whole || Number.isInteger(v))) o[k] = whole ? v : Math.round(v * 100) / 100;
      else bad(k, `${whole ? 'a whole number' : 'a number'} from ${lo} to ${hi}`);
    } else if (k === 'where' || k === 'sources') {
      const names: readonly string[] = k === 'where' ? WHERE : SOURCES;
      if (!isObj(v)) {
        bad(k, `an object with ${names.join(', ')}`);
        continue;
      }
      for (const [n, b] of Object.entries(v)) {
        if (!names.includes(n)) bad(`${k}.${n}`, `not one of ${names.join(', ')}`);
        else if (typeof b !== 'boolean') bad(`${k}.${n}`, 'true or false');
        else (o[k] as Record<string, boolean>)[n] = b;
      }
    } else bad(k, 'not a setting of word suggestions');
  }
  return out;
}

/** The settings now: the defaults, with what is kept laid over them. */
export function readSettings(db: DB): SuggestSettings {
  const raw = kvGet(db, KEY);
  if (!raw) return structuredClone(SUGGEST_DEFAULTS);
  try {
    return merge(structuredClone(SUGGEST_DEFAULTS), JSON.parse(raw), false);
  } catch {
    return structuredClone(SUGGEST_DEFAULTS);
  }
}

/** Keeps `next` (only what differs from the defaults, so a later default shows in what was never changed). */
export function writeSettings(db: DB, next: SuggestSettings) {
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(next) as (keyof SuggestSettings)[]) {
    if (JSON.stringify(next[k]) !== JSON.stringify(SUGGEST_DEFAULTS[k])) diff[k] = next[k];
  }
  kvSet(db, KEY, JSON.stringify(diff));
}

/** Threads for the language model's server: the setting, else the smaller of 4 and half the cores. */
export const llmThreads = (s: SuggestSettings) => s.threads || Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
/** Threads for the small model's worker: 2, or the setting (at most 4). */
export const workerThreads = (s: SuggestSettings) => (s.threads ? Math.min(4, s.threads) : 2);
/** Threads for personalising: the setting, else the smaller of 8 and half the cores. */
export const trainThreads = (s: SuggestSettings) => s.trainThreads || Math.max(1, Math.min(8, Math.floor(os.cpus().length / 2)));
