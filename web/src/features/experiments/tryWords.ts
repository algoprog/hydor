// The words of Try it first and of what a run used, with no React: how long the whole run should take, the three lines
// a trial answers with, the peaks of a run, and the titles of the System charts.
import type { RunPeak, TrialAnswer } from '@shared/experiments';
import { tr } from '../../i18n/runtime';

/** A translated sentence with its {0}, {1}… filled in. */
export const fill = (sentence: string, ...values: (string | number)[]) => sentence.replace(/\{(\d)\}/g, (_, i) => String(values[Number(i)]));

/** A tenth of a GB is close enough, except for something small, which would read "0 GB": that gets a hundredth. */
export const gb = (v: number) => String(v > 0 && v < 0.095 ? Math.max(0.01, Math.round(v * 100) / 100) : Math.round(v * 10) / 10);

/** "3 h 20 min", "40 min", "2 days 3 h", "less than a minute". */
export function lengthWords(hours: number): string {
  const m = Math.round(hours * 60);
  if (m < 1) return tr('less than a minute');
  if (m < 60) return fill(tr('{0} min'), m);
  const h = Math.floor(m / 60);
  if (h >= 48) return fill(tr('{0} days {1} h'), Math.floor(h / 24), h % 24);
  return m % 60 ? fill(tr('{0} h {1} min'), h, m % 60) : fill(tr('{0} h'), h);
}

/** The three lines a trial that has ended answers with: whether it runs, its memory, and how long the whole run should take. */
export function trialLines(a: TrialAnswer): string[] {
  const ran = a.ran ?? 0;
  if (a.ok === false) return [fill(tr('It failed after {0} s.'), ran)];
  if (a.ok === undefined) return [tr('It was stopped before it started.')];
  const first = a.finished ? fill(tr('It ran to its end in {0} s.'), ran) : tr('It runs.');
  const memory =
    a.gpuMemGb && a.ask?.gpuMemGb
      ? fill(tr('It used up to {0} GB of GPU memory: ask for {1} GB free on each GPU.'), gb(a.gpuMemGb), a.ask.gpuMemGb)
      : a.ramGb
        ? fill(tr('It used up to {0} GB of memory.'), gb(a.ramGb))
        : tr('It was over before its memory could be read.');
  // One that ran to its end without steps left to do: the estimate is how long it took.
  const asLong = a.finished && !(a.stepSeconds !== undefined && a.steps && a.steps.done < a.steps.total);
  const time = asLong
    ? tr('The whole run takes about that long, unless your script shortens itself when it sees HYDOR_TRY.')
    : a.estimateHours
      ? fill(tr('The whole run should take about {0}.'), lengthWords(a.estimateHours))
      : tr('It did not say how far it has to go.');
  return [first, memory, time];
}

/** What other programs held counts from half a GB. */
const OTHERS_FROM = 0.5;

/** What a run used at most, a line for each GPU and one for its memory. */
export function peakLines(r: { gpuIds?: number[]; peak?: RunPeak; gpuTotalGb?: number[]; others?: { start?: number[] } }): string[] {
  const out: string[] = [];
  for (const [i, id] of (r.gpuIds ?? []).entries()) {
    const used = r.peak?.gpuMemGb[i];
    const total = r.gpuTotalGb?.[i];
    if (used && total) out.push(fill(tr('GPU {0}: up to {1} of {2} GB'), id, gb(used), gb(total)));
    const other = r.others?.start?.[i] ?? 0;
    if (other >= OTHERS_FROM) out.push(fill(tr('GPU {0}: other programs held {1} GB when it started'), id, gb(other)));
  }
  if (r.peak?.ramGb) out.push(fill(tr('Memory: up to {0} GB'), gb(r.peak.ramGb)));
  return out;
}

/** The title of a System chart: "system/gpu_mem_gb" (or ".../gpu1" when the run holds several GPUs). */
export function systemTitle(name: string): string {
  const [, what, gpu] = /^system\/(\w+)(?:\/gpu(\d+))?$/.exec(name) ?? [];
  if (what === 'gpu_mem_gb') return gpu === undefined ? tr('GPU memory (GB)') : fill(tr('GPU {0} memory (GB)'), gpu);
  if (what === 'gpu_util') return gpu === undefined ? tr('GPU use (%)') : fill(tr('GPU {0} use (%)'), gpu);
  if (what === 'cpu') return tr('Processor (%)');
  if (what === 'ram_gb') return tr('Memory (GB)');
  return name;
}

/** The System charts' order: memory and use of each GPU, then the processor and memory. */
export function systemOrder(names: string[]): string[] {
  const rank = (n: string) => ['gpu_mem_gb', 'gpu_util', 'cpu', 'ram_gb'].findIndex((w) => n.startsWith(`system/${w}`));
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }));
}
