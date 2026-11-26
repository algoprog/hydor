// An app's steps: its folder is a git repository of its own (Hydor makes one when it makes or
// registers an app that has none), and each accepted change is a commit whose message says what changed for the maker ("Added team
// invitations"). **Back to before this** puts the files back as they were at an earlier step and records that as a new step on top:
// the steps after it stay in the list, so going back is never a loss and can itself be gone back from. Whatever was not saved yet is
// saved as a step first. Only git's plain commands run, in a clean environment (never the person's own git settings: no hooks, no
// signing, an identity of Hydor's), and nothing outside the app's folder is touched.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { WebAppStep, WebAppSteps } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";

const TIMEOUT_MS = 60_000;
/** The most steps the list gives. */
export const STEPS_MAX = 200;
/** The identity of the steps Hydor writes: not a person's. */
const AUTHOR = { name: "Hydor", email: "hydor@localhost" };
/** What every new repository leaves out (an app with a .gitignore of its own keeps that one). */
export const DEFAULT_IGNORE = ["node_modules/", "dist/", ".output/", ".nitro/", ".tanstack/", ".vinxi/", ".wrangler/", "data/", "*.db", "*.db-*", ".env", ".env.*", "!.env.example", ".dev.vars", ".dev.vars.*", "!.dev.vars.example", ""].join("\n");

const env = (): NodeJS.ProcessEnv => {
  const out: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME ?? "/tmp",
    LANG: "C.UTF-8",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: AUTHOR.name,
    GIT_AUTHOR_EMAIL: AUTHOR.email,
    GIT_COMMITTER_NAME: AUTHOR.name,
    GIT_COMMITTER_EMAIL: AUTHOR.email,
  };
  return out;
};

/** The settings every call takes with it: no hooks, no signing, no pager, no line-ending changes, names of files as they are. */
const SETTINGS = ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "core.quotepath=false", "-c", "core.autocrlf=false", "-c", "core.fsmonitor=false", "-c", "gc.auto=0", "-c", "safe.directory=*"];

interface Out {
  code: number;
  out: string;
  err: string;
}

function git(folder: string, args: string[], input?: string): Promise<Out> {
  return new Promise((resolve) => {
    const child = execFile("git", [...SETTINGS, ...args], { cwd: folder, env: env(), timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" }, (e, out, err) => {
      const code = e ? (typeof (e as { code?: unknown }).code === "number" ? ((e as { code: number }).code as number) : 128) : 0;
      resolve({ code, out: String(out ?? ""), err: String(err ?? (e ? e.message : "")) });
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

const fail = (what: string, r: Out): never => {
  throw new HttpError(500, `${what}: ${(r.err || r.out).split("\n").filter(Boolean).slice(0, 2).join(" ").slice(0, 300) || "git said nothing"}`);
};

/** The folder holds a repository of its own (its own .git, a folder or a file), not one that happens to hold the folder. */
export function hasRepo(folder: string): boolean {
  try {
    return fs.existsSync(path.join(folder, ".git"));
  } catch {
    return false;
  }
}

/** Whether git can be run at all on this computer. */
export async function gitThere(): Promise<boolean> {
  return new Promise((resolve) => execFile("git", ["--version"], { env: env(), timeout: 10_000 }, (e) => resolve(!e)));
}

/**
 * Makes the folder a repository of its own when it is not, with a first step of what is there (`first` its words). A folder that
 * already is one is left as it is. False when git is not on this computer or could not make one (the steps then say so).
 */
export async function ensureRepo(folder: string, first = "The app as it was started"): Promise<boolean> {
  if (hasRepo(folder)) return true;
  if (!(await gitThere())) return false;
  try {
    const init = await git(folder, ["init", "-q", "-b", "main"]);
    if (init.code !== 0) {
      // An older git has no -b.
      const again = await git(folder, ["init", "-q"]);
      if (again.code !== 0) return false;
    }
    const ignore = path.join(folder, ".gitignore");
    if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, DEFAULT_IGNORE);
    const added = await git(folder, ["add", "-A"]);
    if (added.code !== 0) return false;
    const done = await git(folder, ["commit", "-q", "--no-verify", "--allow-empty", "-m", first]);
    return done.code === 0;
  } catch {
    return false;
  }
}

const RS = "\u001e";
const US = "\u001f";

/** The steps, newest first, with the number of files each changed, and how many files are changed and not in a step yet. */
export async function listSteps(folder: string, limit = 50): Promise<WebAppSteps> {
  if (!hasRepo(folder)) return { repo: false, steps: [], unsaved: 0 };
  const n = Math.max(1, Math.min(STEPS_MAX, Math.floor(limit) || 50));
  const r = await git(folder, ["log", `-n${n}`, "--no-color", `--format=${RS}%H${US}%ct${US}%s${US}%b${US}`, "--numstat"]);
  const steps: WebAppStep[] = [];
  // A repository with no step yet answers with an error; that is an empty list.
  if (r.code === 0)
    for (const rec of r.out.split(RS).slice(1)) {
      const [sha, ct, subject, body, rest = ""] = rec.split(US);
      if (!/^[0-9a-f]{40}$/.test(sha ?? "")) continue;
      const files = rest.split("\n").filter((l) => /^(\d+|-)\t(\d+|-)\t/.test(l)).length;
      const back = /^Hydor-back-to: ([0-9a-f]{40})$/m.exec(body ?? "")?.[1];
      steps.push({ sha, message: (subject ?? "").trim(), at: Number(ct) * 1000, files, ...(back ? { back: { to: back } } : {}) });
    }
  const st = await git(folder, ["status", "--porcelain", "-uall"]);
  return { repo: true, steps, unsaved: st.code === 0 ? st.out.split("\n").filter(Boolean).length : 0 };
}

/** A step's message as one plain line: no control characters, at most 200 characters. */
export function cleanMessage(v: unknown): string {
  const s = String(v ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) throw new HttpError(400, "Say what changed, in a few words (\"Added team invitations\").");
  return s.length > 200 ? `${s.slice(0, 199).trimEnd()}…` : s;
}

/** Saves what changed as a step; null when nothing changed. */
export async function saveStep(folder: string, message: unknown, trailer?: string): Promise<WebAppStep | null> {
  const msg = cleanMessage(message);
  if (!hasRepo(folder) && !(await ensureRepo(folder))) throw new HttpError(409, "This folder is not a git repository and git could not make it one, so there are no steps to keep.");
  const add = await git(folder, ["add", "-A"]);
  if (add.code !== 0) fail("The changes could not be gathered", add);
  const quiet = await git(folder, ["diff", "--cached", "--quiet"]);
  // A repository with no step yet has nothing to compare with: its first step is whatever is there.
  const empty = (await git(folder, ["rev-parse", "--verify", "-q", "HEAD"])).code !== 0;
  if (quiet.code === 0 && !empty) return null;
  const done = await git(folder, ["commit", "-q", "--no-verify", ...(empty ? ["--allow-empty"] : []), "-m", msg, ...(trailer ? ["-m", trailer] : [])]);
  if (done.code !== 0) fail("The step could not be saved", done);
  const head = (await git(folder, ["rev-parse", "HEAD"])).out.trim();
  const l = await listSteps(folder, 1);
  return l.steps.find((s) => s.sha === head) ?? l.steps[0] ?? null;
}

/** The step with this id (a full id, or a start of one, at least 7 characters), or null. */
export async function findStep(folder: string, id: string): Promise<WebAppStep | null> {
  if (!/^[0-9a-f]{7,40}$/.test(id) || !hasRepo(folder)) return null;
  const r = await git(folder, ["rev-parse", "--verify", "-q", `${id}^{commit}`]);
  const sha = r.out.trim();
  if (r.code !== 0 || !/^[0-9a-f]{40}$/.test(sha)) return null;
  const l = await listSteps(folder, STEPS_MAX);
  return l.steps.find((s) => s.sha === sha) ?? null;
}

export interface WentBack {
  /** The step that was clicked: what it changed, and everything after it, is undone. */
  from: WebAppStep;
  /** The step the files were put back to: the one before it. */
  to: WebAppStep;
  /** The step this made (null when the files were already as they were then). */
  step: WebAppStep | null;
  /** The step made first from what was not saved (null when there was none). */
  saved: WebAppStep | null;
}

/**
 * **Back to before this**: puts the app's files back as they were before the step `id`, and records that as a step of its own. The
 * steps after it stay in the list (nothing is destroyed), and the step this makes can be gone back from like any other. What had not
 * been saved is saved as a step first, so nothing is lost.
 */
export async function goBack(folder: string, id: string): Promise<WentBack> {
  const from = await findStep(folder, id);
  if (!from) throw new HttpError(404, "There is no such step in this app.");
  const parent = await git(folder, ["rev-parse", "--verify", "-q", `${from.sha}^{commit}^`]);
  const before = parent.code === 0 ? await findStep(folder, parent.out.trim()) : null;
  if (!before) throw new HttpError(409, "That is the first step: there is nothing before it to go back to.");
  const saved = await saveStep(folder, "Saved before going back", undefined);
  const r = await git(folder, ["read-tree", "--reset", "-u", before.sha]);
  if (r.code !== 0) fail("The files could not be put back", r);
  const when = from.message.length > 90 ? `${from.message.slice(0, 89).trimEnd()}…` : from.message;
  const step = await saveStep(folder, `Went back to before “${when}”`, `Hydor-back-to: ${before.sha}`);
  return { from, to: before, step, saved };
}
