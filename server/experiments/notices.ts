// The message a session gets when runs it started with report end. One message, however many ended close together:
// those that end within a few seconds of each other, or while the session is busy and its message still waits in its
// queue, are lines in it, under their experiments (those whose first run ended first, first), the latest last. Runs
// that differ only in their seed are one line, with the mean and spread of their numbers. A run the session's agent has
// read since it ended (experiment_get, experiment_wait) is left out. It starts with its head on a line of its own,
// which the conversation draws as one quiet row (shared/experiments.ts experimentNoticeOf), and ends by saying who sent
// it, as the goal loop's messages do.
import type { RunRecord } from '../../shared/experiments.ts';
import type { Deps } from '../features/types.ts';
import { commandWords } from './capture.ts';
import { mean, std } from './stats.ts';
import { seedOf } from './tables.ts';

export const NOTICE_HEAD = '[Experiments · runs ended]';
export const NOTICE_FOOT = '(This notice is from Experiments, not typed by the user. Nothing to answer unless it changes what you are doing.)';
/** The most lines in one message. */
const LINES = 20;
/** A session at rest waits this long for more runs to end before it is told (the tests make it short). */
export const gather = { ms: 4000 };

/** What the message tells of: a run that ended, or a sweep. */
export interface Ending {
  /** The runs the line tells of: it is left out once the session's agent has read them all. */
  runs: string[];
  /** Its line when it stands on its own. */
  line: string;
  at: number;
  /** The experiment it is listed under (the group), and that experiment's title when it has one. */
  group?: string;
  title?: string;
  /** A run that may share a line with its other seeds. */
  run?: {
    record: RunRecord;
    /** The names of its numbers that matter most, the first first. */
    names: string[];
    /** How long it took, in words: '' for a run done in under a minute. */
    took: string;
  };
}

/** A number as the notices write it. */
// null: a NaN that went through JSON (a kept record's metrics).
export const fmt = (v: number | null | undefined) => (v === undefined || v === null ? '?' : Number.isNaN(v) ? 'NaN' : Math.abs(v) >= 1000 || (Math.abs(v) < 0.001 && v !== 0) ? v.toExponential(2) : String(Math.round(v * 10_000) / 10_000));

/** "mean ± standard deviation" of numbers over seeds: 0 for numbers that are all the same but for rounding. */
export function spread(values: number[]): string {
  if (values.length < 2) return fmt(values[0]);
  const m = mean(values);
  const s = std(values);
  return `${fmt(m)} ± ${fmt(s <= 1e-9 * Math.max(1, Math.abs(m)) ? 0 : s)}`;
}

const SEED_NAMES = ['seed', 'random_seed'];

/** A word with the run's seed taken out, where it stands as a number of its own (not inside 13 or 0.3). */
const unseeded = (word: string, seed: string) => word.replace(new RegExp(`(?<!\\d|\\d\\.)${seed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d|\\.\\d)`, 'g'), '{seed}');

/** A flag or setting whose value may be named after the seed: the seed itself, or somewhere the run writes. */
const NAMED_FOR_SEED = /seed|(^|[-_.])(out|output|log|save|result|results|score|scores|metrics|ckpt|checkpoint|name|tag)([-_]?(file|dir|path))?($|[-_.])/i;

/**
 * Two values of a flag or setting (`name`) that are the same, or the same but for each run's own seed, where that is
 * what the seed in them means. Elsewhere a number that happens to be the seed is a setting: --k 1 is not --k 2.
 */
function sameValue(name: string, a: string, sa: string, b: string, sb: string): boolean {
  if (a === b) return true;
  const x = unseeded(a, sa);
  return x === unseeded(b, sb) && (NAMED_FOR_SEED.test(name.replace(/^[-+]+/, '')) || /seed[_=-]?\{seed\}|[_-]s\{seed\}/i.test(x));
}

/**
 * Whether two runs are seeds of one thing: the same experiment, folder and machine, and the same command and settings
 * but for the seed (and what is named after it, as a file for each seed's scores). What the command redirects to and
 * its comments do not count.
 */
function sameButSeed(a: RunRecord, b: RunRecord): boolean {
  const sa = seedOf(a)!;
  const sb = seedOf(b)!;
  if (a.group !== b.group || a.cwd !== b.cwd || (a.where ?? 'local') !== (b.where ?? 'local')) return false;
  const wa = commandWords(a.command);
  const wb = commandWords(b.command);
  const unsaid = !/seed/i.test(`${a.command} ${b.command}`);
  const words = wa.every((w, i) => {
    const v = wb[i];
    if (w === v) return true;
    const named = /^([^=]*)=/.exec(w)?.[1] ?? (i && wa[i - 1].startsWith('-') ? wa[i - 1] : '');
    // A bare argument that is the seed, where the command had {seed} and says "seed" nowhere.
    if (unsaid && !named && w === sa && v === sb) return true;
    return sameValue(named, w, sa, v, sb);
  });
  if (wa.length !== wb.length || !words) return false;
  const settings = (r: RunRecord) => Object.keys(r.params ?? {}).filter((k) => !SEED_NAMES.includes(k)).sort();
  const ka = settings(a);
  return ka.join('\n') === settings(b).join('\n') && ka.every((k) => sameValue(k, String(a.params![k]), sa, String(b.params![k]), sb));
}

/** A run's name without its seed: "bm25l seed 1", "bm25l (seed=1)", "bm25l-s1" and "bm25l_1" are all "bm25l". */
function seedlessName(r: RunRecord): string {
  const seed = seedOf(r)!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const name = r.name ?? r.id;
  return (
    name
      .replace(new RegExp(`[\\s,;·_-]*[\\[(]?(?:random[_ ])?seed[\\s=_:#-]*${seed}(?!\\d)[\\])]?`, 'i'), '')
      .replace(new RegExp(`[\\s_#-]+s?${seed}$`, 'i'), '')
      .replace(/[\s,;·_-]+$/, '')
      .trim() || name
  );
}

/** The line for runs that are seeds of one thing: their numbers over the seeds that finished, then what the others did. */
function seedsLine(entries: Ending[]): string {
  const runs = entries.map((e) => e.run!);
  const names = runs.map((x) => seedlessName(x.record));
  let name = names[0];
  // Names that differ beyond the seed: what they begin with.
  for (const n of names) while (!n.startsWith(name)) name = name.slice(0, -1);
  name = name.replace(/[\s,;·_([-]+$/, '') || names[0];
  const done = runs.filter((x) => x.record.status === 'done');
  const others = runs.filter((x) => x.record.status !== 'done');
  const word = (s: RunRecord['status']) => (s === 'failed' ? 'failed' : s === 'lost' ? 'went missing' : 'stopped');
  const counts = [...new Set(others.map((x) => word(x.record.status)))].map((w) => `${others.filter((x) => word(x.record.status) === w).length} ${w}`);
  const numbers = (done.find((x) => x.names.length)?.names ?? []).flatMap((k) => {
    const values = done.map((x) => x.record.metrics?.last[k]).filter((v): v is number => v !== undefined);
    return values.length ? [`${k} ${spread(values)}${values.length < done.length ? ` (${values.length} of ${done.length})` : ''}`] : [];
  });
  const longest = [...done].filter((x) => x.took).sort((a, b) => b.record.endedAt! - b.record.startedAt! - (a.record.endedAt! - a.record.startedAt!))[0];
  const head = `${name} (${runs.length} seeds${counts.length ? `, ${counts.join(', ')}` : ''})`;
  const said = [`${head}${numbers.length ? `: ${numbers.join(', ')}` : ''}`];
  if (longest) said.push(`Done in up to ${longest.took}`);
  // Those that did not finish, together when they ended the same way.
  const why = new Map<string, string[]>();
  for (const x of others) {
    const how = `${word(x.record.status)}${x.took ? ` after ${x.took}` : ''}${x.record.why ? `: ${x.record.why.replace(/\.$/, '')}` : ''}`;
    why.set(how, [...(why.get(how) ?? []), seedOf(x.record)!]);
  }
  for (const [how, seeds] of why) said.push(`Seed${seeds.length > 1 ? 's' : ''} ${seeds.join(', ')} ${how}`);
  return `${said.join('. ')} (${entries.flatMap((e) => e.runs).join(', ')})`;
}

interface Box {
  pending: Ending[];
  timer?: NodeJS.Timeout;
  sending?: boolean;
  /** The message that waits in the session's queue, which later endings are added to. */
  waiting?: { id: string; text: string; entries: Ending[] };
}

const boxes = new Map<string, Box>();
/** "<session> <run>": runs a session's agent has read since they ended. */
const seen = new Set<string>();
const SEEN_MAX = 5000;
const BUSY = new Set(['starting', 'working', 'waiting']);

const unread = (key: string, e: Ending) => !e.runs.every((id) => seen.has(`${key} ${id}`));

export function noticeText(entries: Ending[]): string {
  const experiments = new Map<string, Ending[][]>();
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    const key = e.group ?? '';
    let rows = experiments.get(key);
    if (!rows) experiments.set(key, (rows = []));
    // With the first row of its other seeds that has not got this one (a seed run again starts a row of its own).
    const seed = e.run && seedOf(e.run.record);
    const row = seed === undefined ? undefined : rows.find((x) => x[0].run && seedOf(x[0].run.record) !== undefined && x.every((o) => seedOf(o.run!.record) !== seed) && sameButSeed(x[0].run.record, e.run!.record));
    if (row) row.push(e);
    else rows.push([e]);
  }
  const lines: string[] = [];
  const more: string[] = [];
  const named = [...experiments.keys()].some(Boolean);
  let left = LINES;
  for (const [group, rows] of experiments) {
    const shown = rows.slice(0, left);
    left -= shown.length;
    if (shown.length) {
      if (named) lines.push(`${group ? (rows.flat().find((e) => e.title)?.title ?? group) : 'Other runs'}:`);
      lines.push(...shown.map((row) => `- ${(row.length > 1 ? seedsLine(row) : row[0].line).replace(/\s*\n\s*/g, ' ')}`));
    }
    if (rows.length > shown.length) more.push(`${rows.length - shown.length} more ${group ? `in ${group}` : 'in no experiment'}`);
  }
  if (more.length) lines.push(`and ${more.join(', ')} (experiment_list lists them)`);
  return [NOTICE_HEAD, ...lines, 'experiment_get reads a run’s record and the end of its log.', NOTICE_FOOT].join('\n');
}

/** The box's message while it is still in the queue as it was written (not sent, removed or rewritten by the person). */
function stillWaiting(d: Deps, key: string, box: Box) {
  const w = box.waiting;
  if (w && d.sessions.summary(key)?.queue?.some((m) => m.id === w.id && m.text === w.text)) return w;
  box.waiting = undefined;
  return undefined;
}

/** The waiting message written again with these lines (taken off the queue with none left). False when it has just gone out. */
function rewrite(d: Deps, key: string, box: Box, entries: Ending[]): boolean {
  const id = box.waiting!.id;
  try {
    if (!entries.length) {
      d.sessions.dropQueued(key, id);
      box.waiting = undefined;
    } else {
      const text = noticeText(entries);
      d.sessions.editQueued(key, id, { text });
      box.waiting = { id, text, entries };
    }
    return true;
  } catch {
    box.waiting = undefined;
    return false;
  }
}

async function flush(d: Deps, key: string): Promise<void> {
  const box = boxes.get(key);
  if (!box || box.sending) return;
  box.sending = true;
  try {
    // What ends while a message is being handed over goes round again (and into the queue, the session being at work then).
    while (box.pending.length) {
      const fresh = box.pending.splice(0).filter((e) => unread(key, e));
      if (!fresh.length) continue;
      const waiting = stillWaiting(d, key, box);
      if (waiting && rewrite(d, key, box, [...waiting.entries, ...fresh])) continue;
      const text = noticeText(fresh);
      await d.sessions.deliverOrQueue(key, text).catch(() => {});
      const queued = d.sessions.summary(key)?.queue?.find((m) => m.text === text);
      if (queued) box.waiting = { id: queued.id, text, entries: fresh };
    }
  } catch (e) {
    console.error('[experiments] telling a session:', (e as Error)?.message ?? e);
  } finally {
    box.sending = false;
    if (!box.pending.length && !box.waiting && !box.timer) boxes.delete(key);
  }
}

/** Tells a session that runs it started have ended: now into its queue when it is at work, else after a moment for more. */
export function tellEnded(d: Deps, key: string, e: Ending): void {
  const s = d.sessions.summary(key);
  if (!s) return;
  let box = boxes.get(key);
  if (!box) boxes.set(key, (box = { pending: [] }));
  box.pending.push(e);
  if (box.sending || box.timer) return;
  box.timer = setTimeout(
    () => {
      box.timer = undefined;
      void flush(d, key);
    },
    BUSY.has(s.live?.status ?? '') ? 0 : gather.ms,
  );
  box.timer.unref?.();
}

/** The session's agent has read these runs since they ended: they are not told again, and leave the message that waits. */
export function sawEnded(d: Deps, key: string, ids: string[]): void {
  for (const id of ids) seen.add(`${key} ${id}`);
  for (const old of seen) {
    if (seen.size <= SEEN_MAX) break;
    seen.delete(old);
  }
  const box = boxes.get(key);
  if (!box) return;
  const waiting = stillWaiting(d, key, box);
  if (!waiting) return;
  const left = waiting.entries.filter((e) => unread(key, e));
  if (left.length < waiting.entries.length) rewrite(d, key, box, left);
}
