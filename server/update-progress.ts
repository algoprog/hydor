// What an update of a copy from git says of how far it has got (server/updates.ts runs the steps; shared/update-progress.ts
// has the steps, the guesses and the curve the pages share). Each step's own output is the measure where it has one:
//   pull     git's "Receiving objects: 45%" and "Resolving deltas: 30%" (asked for with --progress, \r between updates)
//   install  one line per package npm gets with --loglevel=http ("npm http fetch GET 200 …/x-1.0.0.tgz", or
//            "npm http cache x@…/x-1.0.0.tgz 0ms (cache hit)"), against how many the last install added
//   build    "> pkg@1.0 build:web" when the web part starts, and the lines vite.config.ts prints when run with
//            HYDOR_BUILD_PROGRESS=1: "hydor-build-progress 300" (modules read), "… done 5339", "… written"
// Reading it never decides whether a step works (updates.ts calls it inside a try), and a step whose output says
// nothing (an older build without the plugin, a quiet npm) is measured by the clock alone.
import { combine, expectedOf, isSlow, timeLeft, timeShare, type StepTimes, type Took, type UpdateProgress, type UpdateStep } from '../shared/update-progress.ts';

/** Modules a web build reads, when the machine has not built one yet (measured on the app's own build: 5339). */
export const DEFAULT_MODULES = 5300;

/** Splits output into lines at \n or \r (git rewrites its progress line with \r), keeping an unfinished line for the next piece. */
export class Lines {
  private rest = '';
  push(text: string, each: (line: string) => void) {
    const parts = (this.rest + text).split(/[\r\n]+/);
    this.rest = parts.pop() ?? '';
    for (const l of parts) if (l) each(l);
  }
  /** A line that has no end yet, as a line. */
  flush(each: (line: string) => void) {
    if (this.rest) each(this.rest);
    this.rest = '';
  }
}

/** How far a pull is, 0 to 1 (receiving the objects is 80% of it, resolving the deltas the rest), or null for any other line. */
export function pullShare(line: string): number | null {
  const m = /^(?:remote: )?(Receiving objects|Resolving deltas):\s+(\d{1,3})%/.exec(line.trim());
  if (!m) return null;
  const p = Math.min(100, Number(m[2])) / 100;
  return m[1] === 'Receiving objects' ? 0.8 * p : 0.8 + 0.2 * p;
}

/**
 * The package npm just got: its tarball's address, or null for another line. A package got from the network shows as a
 * fetch of its tarball and then as a cache read (a cache hit shows only that), so the address is what counts once.
 */
export function npmPackage(line: string): string | null {
  const m = /^npm http fetch GET \d+ (\S+\.tgz)\b/.exec(line) ?? /^npm http cache .*?@(https?:\/\/\S+?\.tgz)\b/.exec(line);
  return m ? m[1] : null;
}

/** How many packages an install added, from the end of its output ("added 537 packages in 4s"), or null. */
export function addedPackages(out: string): number | null {
  const m = /^added (\d+) packages?\b/m.exec(out);
  return m ? Number(m[1]) : null;
}

/** The packages a lock file installs: its node_modules entries that are neither optional nor links (an estimate: some optional ones install). */
export function lockPackages(lock: string): number | null {
  try {
    const packages = (JSON.parse(lock) as { packages?: Record<string, { optional?: boolean; link?: boolean }> }).packages;
    if (!packages) return null;
    let n = 0;
    for (const [k, v] of Object.entries(packages)) if (k.startsWith('node_modules/') && !v?.optional && !v?.link) n++;
    return n || null;
  } catch {
    return null;
  }
}

export type BuildLine = { modules: number } | { done: number } | { written: true } | { web: true };

/** What a line of `npm run build` says of the build, or null. */
export function buildLine(line: string): BuildLine | null {
  const l = line.trim();
  const p = /^hydor-build-progress (?:(\d+)|done (\d+)|(written))$/.exec(l);
  if (p) return p[1] ? { modules: Number(p[1]) } : p[2] ? { done: Number(p[2]) } : { written: true };
  return /^> \S+ build:web$/.test(l) ? { web: true } : null;
}

/** What the steps took, from what is kept (kv 'update.took'); nothing wrong in it matters, it is only a guess. */
export function tookOf(json: string | undefined): Took {
  try {
    const v = JSON.parse(json ?? 'null');
    if (!v || typeof v !== 'object') return {};
    const out: Took = {};
    for (const k of ['pull', 'install', 'build', 'restart', 'packages', 'modules'] as const) if (typeof v[k] === 'number' && Number.isFinite(v[k]) && v[k] > 0) out[k] = v[k];
    return out;
  } catch {
    return {};
  }
}

/** Whether progress is told to the pages now: at most every 500 ms, when the share moved by 0.005 or the step, the number of steps or slowness changed, and at least every 2 s. */
export function dueToTell(last: { at: number; share: number; step: number; steps: number; slow: boolean } | null, next: UpdateProgress, now: number): boolean {
  if (!last) return true;
  const gap = now - last.at;
  if (gap < 500) return false;
  return gap >= 2000 || Math.abs(next.share - last.share) >= 0.005 || next.step !== last.step || next.steps !== last.steps || !!next.slow !== last.slow;
}

const ORDER: UpdateStep[] = ['pull', 'install', 'build', 'restart'];

/** What the install step's tail (unpacking, install scripts, which print nothing) is expected to take: a tenth of the step, at least 3 s. */
const installTail = (e: number) => Math.max(3000, 0.1 * e);
/** The shares of a build: the server's part first, then the web build's modules, then writing its files. */
const BUILD_WEB_FROM = 0.1;
const BUILD_MODULES_TO = 0.85;

interface StepView {
  share: number;
  left?: number;
  slow: boolean;
}

/**
 * An update's progress as it runs: the plan of steps, each started with begin(), the lines of its output fed to line(),
 * and view() at any time for how far it is. The share never goes back.
 */
export class UpdateTracker {
  private plan: UpdateStep[];
  private exp: StepTimes;
  private step: UpdateStep = 'pull';
  private at: number;
  private max = 0;
  private started: Partial<Record<UpdateStep, number>> = {};
  private took: Partial<Record<UpdateStep, number>> = {};
  // pull
  private pulled = 0;
  // install
  private urls = new Set<string>();
  private packagesExpected: number | undefined;
  private fullAt: number | undefined;
  // build
  private modules = 0;
  private modulesDone = false;
  private modulesAt: number | undefined;
  private webAt: number | undefined;
  private doneAt: number | undefined;
  private writtenAt: number | undefined;
  private modulesExpected: number;

  constructor(
    plan: UpdateStep[],
    private kept: Took,
    now: number,
  ) {
    this.plan = plan;
    this.exp = expectedOf(kept);
    this.at = now;
    this.modulesExpected = kept.modules ?? DEFAULT_MODULES;
    this.started.pull = now;
  }

  /** Changes the steps ahead (installing turned out to be needed, or not). */
  setPlan(plan: UpdateStep[]) {
    this.plan = plan;
  }

  /** How many packages the install on its way is expected to add (the last one's count, else from the lock file). */
  expectPackages(estimate: number | null | undefined) {
    this.packagesExpected = this.kept.packages ?? (estimate && estimate > 0 ? estimate : undefined);
  }

  /** A step starts: the one before it is over. */
  begin(step: UpdateStep, now: number) {
    this.finish(now);
    this.step = step;
    this.at = now;
    this.started[step] = now;
    if (!this.plan.includes(step)) this.plan = [...this.plan, step].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  }

  /** The step on its way is over (not begun again), taking this long. */
  finish(now: number) {
    this.took[this.step] = Math.max(1, now - this.at);
  }

  /** A line of the current step's output. */
  line(line: string, now: number) {
    if (this.step === 'pull') {
      const p = pullShare(line);
      if (p != null) this.pulled = Math.max(this.pulled, p);
    } else if (this.step === 'install') {
      const url = npmPackage(line);
      if (url) {
        this.urls.add(url);
        if (this.fullAt == null && this.packagesExpected && this.urls.size >= this.packagesExpected) this.fullAt = now;
      }
    } else if (this.step === 'build') {
      const b = buildLine(line);
      if (!b) return;
      if ('web' in b) this.webAt = now;
      else if ('modules' in b) {
        this.modules = Math.max(this.modules, b.modules);
        this.modulesAt ??= now;
      } else if ('done' in b) {
        this.modules = Math.max(this.modules, b.done);
        this.modulesDone = true;
        this.modulesAt ??= now;
        this.doneAt = now;
      } else this.writtenAt = now;
    }
  }

  /** The packages the install added and the modules the build read (the next update's expected counts). */
  counts(added: number | null): Took {
    return { ...(added ? { packages: added } : this.urls.size ? { packages: this.urls.size } : {}), ...(this.modulesDone ? { modules: this.modules } : {}) };
  }

  /** How long each step that ran took (the last one up to now). */
  times(now: number): Took {
    this.finish(now);
    return { ...this.took };
  }

  private stepView(now: number): StepView {
    const elapsed = now - this.at;
    const E = this.exp[this.step];
    const byClock = (): StepView => ({ share: timeShare(elapsed, E), left: timeLeft(elapsed, E), slow: isSlow(elapsed, E) });
    if (this.step === 'pull' && this.pulled > 0) {
      const s = this.pulled;
      return { share: s, left: elapsed > 1000 && s > 0.02 ? (elapsed * (1 - s)) / s : E * (1 - s), slow: false };
    }
    if (this.step === 'install' && this.urls.size > 0 && this.packagesExpected) {
      const c = this.urls.size;
      const N = this.packagesExpected;
      const tail = installTail(E);
      if (c < N) {
        const share = 0.9 * (c / N);
        const fetching = c >= 10 && elapsed > 2000 ? (elapsed * (N - c)) / c : E * (1 - share);
        return { share, left: fetching + tail, slow: false };
      }
      const since = now - (this.fullAt ?? now);
      return { share: 0.9 + 0.08 * timeShare(since, tail), left: timeLeft(since, tail), slow: false };
    }
    if (this.step === 'build' && this.modulesAt != null) {
      const tail = 0.15 * E;
      if (this.writtenAt != null) return { share: 0.99, left: 500, slow: false };
      if (this.doneAt != null) {
        const since = now - this.doneAt;
        return { share: BUILD_MODULES_TO + (0.99 - BUILD_MODULES_TO) * timeShare(since, tail), left: timeLeft(since, tail), slow: false };
      }
      const n = this.modules;
      const N = Math.max(this.modulesExpected, n + 1);
      const share = BUILD_WEB_FROM + (BUILD_MODULES_TO - BUILD_WEB_FROM) * Math.min(0.98, n / N);
      const web = now - (this.webAt ?? this.at);
      const reading = n >= 100 && web > 1000 ? (web * (N - n)) / n : E * (1 - share);
      return { share, left: reading + tail, slow: false };
    }
    return byClock();
  }

  /** How far the update is now. */
  view(now: number): UpdateProgress {
    let v: StepView;
    try {
      v = this.stepView(now);
    } catch {
      v = { share: timeShare(now - this.at, this.exp[this.step]), slow: false };
    }
    const p = combine(this.plan, this.exp, this.step, v.share, v.left, v.slow);
    this.max = Math.max(this.max, p.share);
    return { ...p, share: this.max };
  }
}
