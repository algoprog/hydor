// What the queue can tell of what comes: when each running run should end (its time left, worked out from its progress,
// or its time limit), which GPUs are kept for a run that has waited long for them and by when it could have them, about
// when each waiting run may start, and the words for these. Pure: the queue (queue.ts) gives what runs and waits now.
import { progressOf, type GpuNow, type RunRecord } from '../../shared/experiments.ts';
import { askOf, roomOn, type Occupant } from './gpus.ts';

/** A run that has waited this long for GPUs is next: no later run takes what it waits for. */
export const NEXT_AFTER_MS = 20 * 60_000;
/** A run that has waited this long tells you, once. */
export const TELL_AFTER_MS = 6 * 3_600_000;
/** An end worked out from progress that passed this long ago is not believed any more. */
const OVERDUE_MS = 5 * 60_000;
const HOUR = 3_600_000;

/** About when something that holds a place should end; `atLimit`: that is its time limit, so at the latest. */
export interface Ending {
  end: number;
  name: string;
  atLimit?: boolean;
}

/**
 * About when a running run should end: by its progress, or its time limit, whichever comes first (`atLimit`: the limit,
 * so it may well end sooner); Infinity: unknown.
 */
export function endsBy(r: Pick<RunRecord, 'status' | 'metrics' | 'startedAt' | 'hours'>, now: number): { end: number; atLimit: boolean } {
  const limit = r.hours && r.startedAt ? r.startedAt + r.hours * HOUR : Infinity;
  const left = progressOf(r)?.left;
  let byProgress = left !== undefined ? r.metrics!.progress!.at + left : Infinity;
  if (byProgress < now - OVERDUE_MS) byProgress = Infinity;
  return { end: Math.max(Math.min(limit, byProgress), now), atLimit: Number.isFinite(limit) && limit <= byProgress };
}

export const endAbout = (r: Parameters<typeof endsBy>[0], now: number): number => endsBy(r, now).end;

/** A run of yours on a GPU, until when. */
export interface Holder extends Occupant, Ending {}

export interface GpuState {
  gpu: GpuNow;
  /** What other programs hold on it (MiB). */
  others: number;
  on: Holder[];
}

/** A run that waits, as far as this needs it. */
export interface Want {
  id: string;
  name: string;
  /** 0: a run without a GPU, which waits for a slot. */
  gpus: number;
  gpuMemGb?: number;
  alone?: boolean;
  hours?: number;
  /** Waiting for GPUs since. */
  since?: number;
}

/** The memory a run would find left on a GPU with these runs on it, by what they asked for; null: it does not fit. */
function fits(s: GpuState, w: Want, on: Holder[], sharing: boolean): number | null {
  if (!sharing && on.length) return null;
  const used = s.others + on.reduce((a, h) => a + (h.ask ?? 0), 0);
  return roomOn({ ...s.gpu, memUsed: used }, w.gpuMemGb, w.alone, on);
}

/** Whether a run could ever have this GPU while other programs hold what they hold now. */
const couldUse = (s: GpuState, w: Want) => fits(s, w, [], true) !== null;

/**
 * The GPUs a long-waiting run could use, and the earliest moment enough of them could all be free for it (Infinity:
 * the runs on them do not say). `now`: those it fits on already. Null when too few could ever be its own, whatever your
 * runs do (other programs hold them): nothing is kept for it then.
 */
export function freeBy(states: GpuState[], w: Want, sharing: boolean, now: number, fitsNow: Set<number>): { gpus: Set<number>; at: number } | null {
  const can = states.filter((s) => couldUse(s, w));
  if (can.length < w.gpus) return null;
  const when = can.map((s) => {
    if (fitsNow.has(s.gpu.index) || !s.on.length) return now;
    const ends = s.on.map((h) => h.end).filter(Number.isFinite).sort((a, b) => a - b);
    return ends.find((t) => fits(s, w, s.on.filter((h) => h.end > t), sharing) !== null) ?? Infinity;
  });
  when.sort((a, b) => a - b);
  return { gpus: new Set(can.map((s) => s.gpu.index)), at: when[w.gpus - 1] };
}

export interface Forecast {
  /** About when it may start. */
  at?: number;
  /** The run whose end lets it, and whether that end is its time limit. */
  because?: string;
  atLimit?: boolean;
  /** It waits on runs that do not say how far they have to go. */
  unknown?: boolean;
}

/**
 * About when each run in line may start: the runs that are going end as they say, and those in line take what comes
 * free in their order (one that has waited long keeps the later ones from the GPUs). A run in line with no time limit
 * is taken to hold what it gets for an unknown time.
 */
export function forecast(o: { now: number; gpus: GpuState[]; sharing: boolean; cpu: Ending[]; slots: number; queue: Want[] }): Map<string, Forecast> {
  const states = o.gpus.map((s) => ({ ...s, on: [...s.on] }));
  let cpu = [...o.cpu];
  const out = new Map<string, Forecast>();
  let t = o.now;
  for (let step = 0; step < 5000 && out.size < o.queue.length; step++) {
    let next = Infinity;
    for (const s of states) for (const h of s.on) if (h.end < next) next = h.end;
    for (const h of cpu) if (h.end < next) next = h.end;
    if (!Number.isFinite(next)) break;
    t = Math.max(t, next);
    const freed = new Map<number, Ending>();
    let last: Ending | undefined;
    for (const s of states) {
      for (const h of s.on)
        if (h.end <= t) {
          freed.set(s.gpu.index, h);
          last = h;
        }
      s.on = s.on.filter((h) => h.end > t);
    }
    const slot = cpu.find((h) => h.end <= t);
    const after = (x: Ending | undefined): Forecast => ({ at: t, because: x?.name, ...(x?.atLimit ? { atLimit: true } : {}) });
    cpu = cpu.filter((h) => h.end > t);
    let kept = false;
    for (const w of o.queue) {
      if (out.has(w.id)) continue;
      const end = w.hours ? t + w.hours * HOUR : Infinity;
      if (!w.gpus) {
        if (cpu.length >= o.slots) continue;
        cpu.push({ end, name: w.name, atLimit: !!w.hours });
        out.set(w.id, after(slot));
        continue;
      }
      if (kept) continue;
      const fit = states
        .map((s) => ({ s, left: fits(s, w, s.on, o.sharing) }))
        .filter((x) => x.left !== null)
        .sort((a, b) => (a.s.on.length ? 1 : 0) - (b.s.on.length ? 1 : 0) || b.left! - a.left!);
      if (fit.length >= w.gpus) {
        const chosen = fit.slice(0, w.gpus).map((x) => x.s);
        const because = chosen.map((s) => freed.get(s.gpu.index)).find(Boolean) ?? last ?? slot;
        for (const s of chosen) s.on.push({ id: w.id, ask: askOf(w), end, name: w.name, atLimit: !!w.hours });
        out.set(w.id, after(because));
      } else if (w.since !== undefined && t - w.since >= NEXT_AFTER_MS) kept = true;
    }
  }
  for (const w of o.queue) {
    if (out.has(w.id)) continue;
    const endless = (h: { end: number }) => !Number.isFinite(h.end);
    const unknown = w.gpus ? states.filter((s) => couldUse(s, w)).length >= w.gpus && states.some((s) => s.on.some(endless)) : cpu.some(endless);
    out.set(w.id, unknown ? { unknown } : {});
  }
  return out;
}

// ---- the words ------------------------------------------------------------------------------------------------

export const gpuCountWords = (n: number) => (n === 1 ? '1 GPU' : `${n} GPUs`);

/** "35 min", "2 h", "3 days". */
export function waitedWords(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`;
}

/** A time to come on the person's own clock: "14:20", "14:20 tomorrow", "14:20 on Saturday", "14:20 on 5 December". */
export function whenWords(at: number, now: number, tz?: string): string {
  const parts = (t: number, o: Intl.DateTimeFormatOptions, locale = 'en-GB') => {
    try {
      return new Intl.DateTimeFormat(locale, { ...o, timeZone: tz }).format(t);
    } catch {
      return new Intl.DateTimeFormat(locale, o).format(t);
    }
  };
  const time = parts(at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayOf = (t: number) => Date.parse(parts(t, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA'));
  const days = Math.round((dayOf(at) - dayOf(now)) / (24 * HOUR));
  if (days <= 0) return time;
  if (days === 1) return `${time} tomorrow`;
  return days < 7 ? `${time} on ${parts(at, { weekday: 'long' })}` : `${time} on ${parts(at, { day: 'numeric', month: 'long' })}`;
}

/** What a waiting run's reason goes on with. */
export function estimateWords(f: Forecast | undefined, now: number, tz?: string): string {
  if (f?.at !== undefined) {
    const when = `. About ${whenWords(f.at, now, tz)}`;
    if (!f.because) return when;
    return f.atLimit ? `${when} at the latest, when “${f.because}” reaches its time limit` : `${when}, when “${f.because}” should end`;
  }
  return f?.unknown ? '. No telling when: those runs do not say how far they have to go' : '';
}
