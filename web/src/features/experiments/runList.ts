// What the runs of an experiment show as, with no part of the page: which have a row and which sit folded under one as
// earlier attempts (the rules are shared with the server, shared/experiment-attempts.ts), what the filters leave, the
// starred ones first, the counts, the words for an attempt and for why one ended, and which runs an action takes.
import { standingKey, standingsOf, type Standings } from '@shared/experiment-attempts';
import type { RunRecord, RunRef } from '@shared/experiments';
import { LOCALE } from '../../i18n/locale';

export { standingKey, standingsOf };
export type { Standings };

/** The three switches of the Filter menu besides the status and the place. */
export interface ListFilter {
  /** Only starred runs. */
  starred?: boolean;
  /** Earlier attempts as rows of their own. */
  earlierToo?: boolean;
  /** The archived runs, and only those. */
  archived?: boolean;
}

const ACTIVE = new Set(['queued', 'waiting', 'starting', 'running']);

/** Starred first; otherwise as they came. */
export const starredFirst = <T extends Pick<RunRecord, 'starredAt'>>(runs: T[]): T[] => [...runs.filter((r) => r.starredAt), ...runs.filter((r) => !r.starredAt)];

/** The runs the charts and the Hyperparameters tab are of: those with a row, and with `earlierToo` their earlier attempts. */
export function chartedRuns<T extends RunRecord>(runs: T[], stand: Standings<T>, earlierToo: boolean): T[] {
  if (!earlierToo) return stand.rows;
  const away = new Set(stand.archived.map(standingKey));
  return runs.filter((r) => !away.has(standingKey(r)));
}

export interface TableRows<T> {
  /** The rows, in the order given. */
  rows: T[];
  /** The earlier attempts folded under a row, by its key; absent when everything shows flat. */
  earlier?: Map<string, T[]>;
  /** Rows to show unfolded: what was looked for is in an earlier attempt of theirs, not in them. */
  open: Set<string>;
}

/**
 * What the table shows: folded rows, or (with a filter that asks for runs of their own) a flat list. `test`: the
 * status and the place; `words`: what the find box has, looked for in a run's name, note, command, id and tags.
 */
export function tableRows<T extends RunRecord>(runs: T[], stand: Standings<T>, f: ListFilter, test: (r: T) => boolean, words: string[]): TableRows<T> {
  const matches = (r: T) => words.every((w) => [r.name, r.note, r.command, r.id, ...(r.tags ?? [])].some((x) => x?.toLowerCase().includes(w)));
  const open = new Set<string>();
  if (f.archived || f.starred || f.earlierToo) {
    const pool = f.archived ? stand.archived : chartedRuns(runs, stand, true);
    return { rows: pool.filter((r) => (!f.starred || r.starredAt) && test(r) && matches(r)), open };
  }
  const rows = stand.rows.filter((r) => {
    if (!test(r)) return false;
    if (matches(r)) return true;
    const k = standingKey(r);
    if (!stand.earlier.get(k)?.some(matches)) return false;
    open.add(k);
    return true;
  });
  return { rows, earlier: stand.earlier, open };
}

/** The counts an experiment's header gives, each its own words (those of nothing left out). */
export function countWords(stand: Standings<RunRecord>): string[] {
  const n = (f: (r: RunRecord) => boolean) => stand.rows.filter(f).length;
  const going = n((r) => r.status === 'running' || r.status === 'starting');
  const waiting = n((r) => r.status === 'queued' || r.status === 'waiting');
  const done = n((r) => r.status === 'done');
  const failed = n((r) => r.status === 'failed' || r.status === 'lost');
  return [
    stand.rows.length === 1 ? '1 run' : `${stand.rows.length} runs`,
    stand.folded.length ? earlierWords(stand.folded.length) : '',
    going ? `${going} running` : '',
    waiting ? `${waiting} waiting` : '',
    done ? `${done} done` : '',
    failed ? `${failed} failed` : '',
  ].filter(Boolean);
}

/** "+ 6 earlier attempts", beside the count of runs. */
export const earlierWords = (n: number) => (n === 1 ? '+ 1 earlier attempt' : `+ ${n} earlier attempts`);

/** "1st", "2nd", "3rd", "11th" as the language writes them ("3.", "3e", "3η"). */
export function ordinal(n: number, locale: string | undefined = LOCALE): string {
  const lang = locale?.slice(0, 2);
  if (lang === 'de') return `${n}.`;
  if (lang === 'fr') return n === 1 ? '1re' : `${n}e`;
  if (lang === 'es') return `${n}.º`;
  // An attempt is a feminine word in French ("tentative"), Portuguese ("tentativa") and Greek ("προσπάθεια").
  if (lang === 'pt') return `${n}.ª`;
  if (lang === 'el') return `${n}η`;
  if (lang === 'ja' || lang === 'zh') return String(n);
  const t = n % 100;
  const s = t > 10 && t < 14 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${s}`;
}

/** The chip on a row that stands for several attempts: "4th attempt". */
export const attemptChip = (n: number, locale?: string) => `${ordinal(n, locale)} attempt`;

type Ended = Pick<RunRef, 'status' | 'why' | 'exitCode' | 'error'>;

const outOfMemory = (r: Ended) => /ran out of memory/i.test(r.why ?? '');

/** Why an earlier attempt ended, in a few words; `own`: what the program itself said (not translated). */
export function endedFew(r: Ended): { words: string; own?: string } {
  if (r.status === 'lost') return { words: 'Went missing' };
  if (r.status === 'stopped') return { words: r.why?.startsWith('Stopped early') ? 'Stopped early' : r.why === 'Stopped by you' ? 'Stopped by you' : 'Stopped' };
  if (r.status !== 'failed') return { words: r.status === 'done' ? 'Done' : 'Not ended' };
  if (outOfMemory(r)) return { words: 'Failed: out of memory' };
  if (r.error?.trim()) return { words: 'Failed', own: r.error.trim() };
  if (typeof r.exitCode === 'number') return { words: `Failed with exit code ${r.exitCode}` };
  return { words: 'Failed' };
}

/** "The 4th attempt: the 3rd ran out of memory": the sentence on a run's page about the one before it. */
export function afterWords(attempt: number, previous: Ended, locale?: string): string {
  const a = ordinal(attempt, locale);
  const b = ordinal(attempt - 1, locale);
  if (previous.status === 'lost') return `The ${a} attempt: the ${b} went missing`;
  if (previous.status === 'stopped') return previous.why?.startsWith('Stopped early') ? `The ${a} attempt: the ${b} was stopped early` : `The ${a} attempt: the ${b} was stopped`;
  if (previous.status === 'failed' && outOfMemory(previous)) return `The ${a} attempt: the ${b} ran out of memory`;
  if (previous.status === 'failed') return `The ${a} attempt: the ${b} failed`;
  return `The ${a} attempt`;
}

/** A run of the list as the page keys it. */
type Keyed = RunRecord;

/**
 * The runs to bring back so that each of these shows again: itself, and the later attempts that are archived (an earlier
 * attempt of an archived run is archived with it).
 */
export function bringBack<T extends Keyed>(runs: T[], picked: T[]): T[] {
  const by = new Map(runs.map((r) => [standingKey(r), r]));
  const out = new Map<string, T>();
  for (const p of picked) {
    const seen = new Set<string>();
    for (let r: T | undefined = by.get(standingKey(p)) ?? p; r && !seen.has(standingKey(r)); r = r.replacedBy ? by.get(standingKey({ id: r.replacedBy, machine: r.machine })) : undefined) {
      seen.add(standingKey(r));
      if (r.archivedAt) out.set(standingKey(r), r);
    }
  }
  return [...out.values()];
}

/** What the bar offers for the picked runs: which are going (Stop), ended (Delete), all starred, all archived. */
export function pickedActions<T extends Keyed>(all: T[], picked: T[]) {
  const away = new Set(standingsOf(all).archived.map(standingKey));
  return {
    going: picked.filter((r) => ACTIVE.has(r.status)),
    ended: picked.filter((r) => !ACTIVE.has(r.status)),
    starred: picked.length > 0 && picked.every((r) => r.starredAt),
    archived: picked.length > 0 && picked.every((r) => away.has(standingKey(r))),
  };
}

/** After Archive: how many were put aside, the earlier attempts that went with them, and those still going that stayed. */
export function archivedSaid<T extends Keyed>(all: T[], picked: T[]): string {
  const going = picked.filter((r) => ACTIVE.has(r.status)).length;
  const ids = new Set(picked.map(standingKey));
  const stand = standingsOf(all);
  const along = picked.reduce((n, r) => n + (stand.earlier.get(standingKey(r))?.filter((e) => !ids.has(standingKey(e))).length ?? 0), 0);
  const done = picked.length - going;
  const words = [
    done ? (done === 1 ? '1 run archived' : `${done} runs archived`) : '',
    done && along ? (along === 1 ? 'with 1 earlier attempt' : `with ${along} earlier attempts`) : '',
    going ? (going === 1 ? '1 still going was left: stop it first' : `${going} still going were left: stop them first`) : '',
  ].filter(Boolean);
  return words.join(' · ');
}
