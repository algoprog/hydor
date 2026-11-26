// The words for runs that wait for the night: when one will start, as its status and beside the Start choice, how
// many wait (the queue line), and the date of a night. The server's reasons are read as patterns (server/experiments/
// night.ts writes them).
import type { ExperimentsSettings, RunRecord } from '@shared/experiments';
import { tr } from '../../i18n/runtime';

/** The reason of a night run that only waits for its hour. */
const AT_HOUR = /^Waits for the night \(from (\d\d:\d\d)\)$/;

/** Whether a run's reason is that it waits for a night (the next one). */
export const waitsForNight = (why: string | undefined) => /^(Waits for the night|The night ended)/.test(why ?? '');

/** Whether the status's own words already say all the reason does. */
export const saidByStatus = (why: string | undefined) => AT_HOUR.test(why ?? '');

/** "Waits for the night (from 23:00)", or without the time when the reason has none. */
export function nightStatus(why: string | undefined): string {
  const from = AT_HOUR.exec(why ?? '')?.[1];
  return from ? tr('Waits for the night (from {0})').replace('{0}', from) : 'Waits for the night';
}

/** The same left in English, for a line the page's translator takes part by part (an evolution's row and column line). */
export function nightStatusPlain(why: string | undefined): string {
  const from = AT_HOUR.exec(why ?? '')?.[1];
  return from ? `Waits for the night (from ${from})` : 'Waits for the night';
}

/** The small print beside "Tonight". `where`: where the run goes ("local", "m:<id>"). */
export function hoursWords(s: Pick<ExperimentsSettings, 'nightFrom' | 'nightTo'> | null, where: string): string {
  if (where.startsWith('m:')) return 'in that machine’s night hours';
  if (!s) return '';
  if (s.nightFrom === s.nightTo) return 'no night hours are set, so it would wait';
  return tr('between {0} and {1}').replace('{0}', s.nightFrom).replace('{1}', s.nightTo);
}

/** What Tonight also means when night runs are stopped at the night's end. */
export const stopNote = (s: Pick<ExperimentsSettings, 'nightTo' | 'nightEnds'> | null, where: string): string =>
  s?.nightEnds === 'stop' && where === 'local' ? tr('A run still going at {0} is stopped, and starts from the beginning the next night.').replace('{0}', s.nightTo) : '';

/** "1 waits for the night", "3 wait for the night". */
export const nightCountWords = (n: number) => (n === 1 ? '1 waits for the night' : `${n} wait for the night`);

/** How many of these runs wait for a night. */
export const countWaitingForNight = (runs: Pick<RunRecord, 'status' | 'why'>[]) => runs.filter((r) => (r.status === 'queued' || r.status === 'waiting') && waitsForNight(r.why)).length;

/** The noon of the day a night began on ("2026-01-05"), for writing its date; null for anything else. */
export function nightDay(night: string | null): Date | null {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(night ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
}
