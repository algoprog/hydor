// The check of an app as Hydor runs it: the contract's (contract-check.ts) on a copy of the app's folder, so nothing it does
// reaches the folder itself, the app in the host's sandbox and its build line in the build's (build-box.ts), and then, while
// that throwaway copy runs, the checks of its pages (page-run.ts). A job one at a time for each app. Its lines are kept
// (checks.ts) for the Checks tab; a launch runs it on the commit it is about to launch.
import fs from "node:fs";
import path from "node:path";
import type { CheckLine, WebAppChecks } from "../../shared/webapps.ts";
import { sandboxAvailable } from "../agent/sandbox.ts";
import { HttpError } from "../auth.ts";
import { boxed, buildBoxSay } from "./build-box.ts";
import { readChecks, saveChecks } from "./checks.ts";
import { checkContract, type CheckResult, type ContractLine } from "./contract-check.ts";
import { runPages, type PagesRun } from "./page-run.ts";
import { asCheckLines, summarize } from "./pagechecks/index.ts";
import { nodeBin, sandboxArgs } from "./run-app.ts";
import type { WebAppRow } from "./store.ts";

export interface ContractChecksCtx {
  /** <data>/webapps */
  root: string;
  /** Run the app inside bubblewrap where it is here. */
  sandbox: boolean;
  changed: () => void;
  /** Ports to take from (tests). */
  ports?: [number, number];
  /** The browser chosen in Settings → Browser, if one is. */
  chosenBrowser?: () => string | undefined;
}

/** A line of the contract check as the pages show a check's line. */
export const asCheckLine = (l: ContractLine): CheckLine => ({
  id: l.id,
  state: l.state,
  title: l.title,
  text: l.text,
  group: l.group ?? "contract",
  ...(l.hint ? { hint: l.hint } : {}),
  ...(l.details?.length ? { details: l.details } : {}),
});

export function createContractChecks(c: ContractChecksCtx) {
  const running = new Map<string, { startedAt: number; step: string; done: Promise<void>; stop: AbortController }>();
  const sb = c.sandbox ? sandboxAvailable() : null;
  const bwrap = sb?.kind === "bwrap" ? sb.bin : null;
  /** The checks a launch is waiting for, so that removing the app or stopping Hydor ends them (and their browser). */
  const launching = new Map<AbortController, string>();

  /** Runs the checker on a copy of `dir`, and the page checks on the copy while it runs. */
  async function check(a: WebAppRow, dir: string, o: { build: boolean; onStep?: (s: string) => void; signal?: AbortSignal }): Promise<{ contract: CheckResult; pages: PagesRun | null }> {
    const home = path.join(c.root, a.id);
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    const work = fs.mkdtempSync(path.join(home, "check-"));
    try {
      const copy = path.join(work, "app");
      // Links are copied as links: one that leads out of the folder leads nowhere inside the sandbox.
      await fs.promises.cp(dir, copy, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true, filter: (src) => path.basename(src) !== ".git" });
      const node = nodeBin();
      let pages: PagesRun | null = null;
      const contract = await checkContract({
        dir: copy,
        build: o.build,
        work,
        ports: c.ports,
        onStep: o.onStep,
        signal: o.signal,
        running: async (x) => {
          o.onStep?.("Looking at its pages");
          // The checks of the pages never undo what the contract found: a failure of theirs is said in their lines.
          pages = await runPages({ ...x, chosenBrowser: c.chosenBrowser?.(), signal: o.signal, onStep: o.onStep }).catch((e) => {
            console.warn(`[webapps] the pages of ${a.slug} could not be checked:`, (e as Error).message);
            return null;
          });
        },
        ...(bwrap ? { box: (b) => [bwrap, ...sandboxArgs({ bwrap, node, dir: b.dir, write: [b.data, b.home], writeDir: true, argv: b.argv })] } : {}),
        buildBox: async (b) => {
          const x = await boxed({ ...b, sandbox: c.sandbox });
          return { argv: x.argv, env: x.env, say: buildBoxSay(x.box), close: x.close };
        },
      });
      return { contract, pages };
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /** Keeps the result for the page, marking what failed the time before and passes now. */
  function keep(a: WebAppRow, r: { contract: CheckResult; pages: PagesRun | null } | null, problem?: string): CheckLine[] {
    const before = readChecks(c.root, a.id);
    const failed = new Set(before.lines.filter((l) => l.state === "failed").map((l) => l.id));
    const pages = r?.pages?.result;
    const all = [...(r?.contract.lines ?? []).map(asCheckLine), ...(pages ? asCheckLines(pages) : [])];
    const lines = all.map((l) => (l.state === "passed" && failed.has(l.id) ? { ...l, fixed: true } : l));
    const of = (s: CheckLine["state"]) => lines.filter((l) => l.state === s).length;
    const out: WebAppChecks = {
      ran: true,
      at: Date.now(),
      summary: r ? `${lines.length} ${lines.length === 1 ? "line" : "lines"}: ${of("passed")} passed, ${of("failed")} failed${of("notRun") ? `, ${of("notRun")} could not be tried` : ""}${of("note") ? `, ${of("note")} to note` : ""}.` : null,
      ok: r ? !of("failed") : null,
      lines,
      ...(r ? { counts: { passed: of("passed"), failed: of("failed"), couldNotRun: of("notRun") } } : {}),
      ...(pages ? { pagesSummary: summarize(pages), notCovered: pages.notCovered } : {}),
      ...(r?.pages?.signedIn ? { signedIn: r.pages.signedIn } : {}),
      ...(problem ? { problem } : {}),
    };
    saveChecks(c.root, a.id, out);
    return all;
  }

  function start(a: WebAppRow): { startedAt: number; step: string } {
    if (running.has(a.id)) throw new HttpError(409, "The check is running already: wait for it to end.");
    const stop = new AbortController();
    const job = { startedAt: Date.now(), step: "Copying the app", done: Promise.resolve(), stop };
    running.set(a.id, job);
    job.done = (async () => {
      try {
        keep(a, await check(a, a.folder, { build: true, onStep: (s) => ((job.step = s), c.changed()), signal: stop.signal }));
      } catch (e) {
        keep(a, null, `The check did not finish: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        running.delete(a.id);
        c.changed();
      }
    })();
    c.changed();
    return { startedAt: job.startedAt, step: job.step };
  }

  return {
    start,
    /** The check a launch runs on the folder it has just built. */
    async forLaunch(a: WebAppRow, dir: string, o: { onStep?: (s: string) => void; build?: boolean } = {}): Promise<CheckLine[]> {
      const stop = new AbortController();
      launching.set(stop, a.id);
      try {
        const r = await check(a, dir, { build: o.build === true, signal: stop.signal, onStep: o.onStep });
        const lines = keep(a, r);
        c.changed();
        return lines;
      } finally {
        launching.delete(stop);
      }
    },
    running: (id: string) => {
      const j = running.get(id);
      return j ? { startedAt: j.startedAt, step: j.step } : null;
    },
    settled: (id: string) => running.get(id)?.done ?? Promise.resolve(),
    forget(id: string) {
      running.get(id)?.stop.abort();
      for (const [stop, app] of launching) if (app === id) stop.abort();
    },
    async close() {
      for (const stop of launching.keys()) stop.abort();
      for (const j of running.values()) j.stop.abort();
      await Promise.all([...running.values()].map((j) => j.done));
    },
  };
}
export type ContractChecks = ReturnType<typeof createContractChecks>;
