// The shape of a web app: how to build and run it, who signs people in, the keys it needs, the services of Hydor it calls and
// where its database is. An app says so itself in hydor.json (the contract, shared/hydor-file.ts); everything after this reads
// the shape.
import fs from "node:fs";
import path from "node:path";
import { HYDOR_FILE, HYDOR_FILE_MAX, type HydorFile, type HydorKey, readHydorText, type SignIn } from "../../shared/hydor-file.ts";
import { contractRunShape, type RunShape } from "./run-app.ts";

export interface AppShape extends RunShape {
  /** It can be read and run. */
  ok: boolean;
  /** Why not, in a sentence (the first of `problems`). */
  problem?: string;
  problems: string[];
  /** The name the file gives it. */
  name?: string;
  /** The app's own build: a line for the shell. None: nothing to build. */
  build?: string;
  signIn: SignIn;
  /** An address only a signed-in person is answered at (for the checker). */
  private: string;
  /** The keys the file lists. */
  keys: HydorKey[];
  services: { ai: { tiers: ("quick" | "standard" | "best")[]; usdPerDay?: number } | null; embed: boolean; mail: boolean };
  database: { file: string; sqlite: boolean } | null;
  /** hydor.json as read, when it was. */
  file?: HydorFile;
}

const nothing: AppShape["services"] = { ai: null, embed: false, mail: false };

function broken(problems: string[], run: RunShape): AppShape {
  return { ...run, ok: false, problem: problems[0], problems, signIn: "own", private: "/", keys: [], services: nothing, database: null };
}

const NO_RUN: RunShape = { start: { shell: "false" }, vars: { port: "PORT", data: "DATA_DIR" }, ready: "/" };

/** A hydor.json as a shape. */
export function contractShape(file: HydorFile): AppShape {
  return {
    ...contractRunShape(file),
    ok: true,
    problems: [],
    ...(file.name ? { name: file.name } : {}),
    ...(file.build ? { build: file.build } : {}),
    signIn: file.signIn,
    private: file.private,
    keys: file.keys,
    services: {
      ai: file.services.ai ? { tiers: file.services.ai.tiers, ...(file.services.ai.usdPerDay !== undefined ? { usdPerDay: file.services.ai.usdPerDay } : {}) } : null,
      embed: !!file.services.embed,
      mail: !!file.services.mail,
    },
    database: file.database ?? null,
    file,
  };
}

function fileShape(folder: string): AppShape {
  const file = path.join(folder, HYDOR_FILE);
  let text: string;
  try {
    const st = fs.lstatSync(file);
    // A link could lead anywhere on this computer; a file of the app's own is what says how it runs.
    if (!st.isFile()) return broken([`${HYDOR_FILE} in this folder is not a plain file.`], NO_RUN);
    if (st.size > HYDOR_FILE_MAX) return broken([`${HYDOR_FILE} is too large to be one (over 64 KB).`], NO_RUN);
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return broken([fs.existsSync(folder) ? `This folder has no ${HYDOR_FILE} yet, which says how Hydor builds and runs the app.` : "The folder is not there any more."], NO_RUN);
    return broken([`${HYDOR_FILE} could not be read (${(e as Error).message}).`], NO_RUN);
  }
  const r = readHydorText(text);
  if (!r.ok) return broken(r.problems, NO_RUN);
  return contractShape(r.file);
}

/** The folder of a web app's launched version inside Hydor, when it has one (set by the feature, which knows the launches). */
let launchedFolder: (webId: string) => string | null = () => null;
export const setLaunchedFolders = (f: (webId: string) => string | null): void => void (launchedFolder = f);

/** The shapes that speak for an app: its folder's, and the launched version's too (a change being made must not take a service or a key from the version people use). */
function sides(web: { id?: string; folder: string }): AppShape[] {
  const now = shapeOf(web.folder);
  const live = web.id ? launchedFolder(web.id) : null;
  return live ? [now, shapeOf(live)] : [now];
}

/** The services of Hydor the app calls. */
export function servicesOf(web: { id?: string; folder: string }): AppShape["services"] {
  const all = sides(web).map((s) => s.services);
  const ai = all.flatMap((s) => (s.ai ? [s.ai] : []));
  const usdPerDay = ai.find((x) => x.usdPerDay !== undefined)?.usdPerDay;
  return {
    ai: ai.length ? { tiers: [...new Set(ai.flatMap((x) => x.tiers))], ...(usdPerDay !== undefined ? { usdPerDay } : {}) } : null,
    embed: all.some((s) => s.embed),
    mail: all.some((s) => s.mail),
  };
}

/** The keys an app lists, by name (the folder's first). */
export function listedKeys(web: { id?: string; folder: string }): HydorKey[] {
  const out = new Map<string, HydorKey>();
  for (const s of sides(web)) for (const k of s.keys) if (!out.has(k.name)) out.set(k.name, k);
  return [...out.values()];
}

/** The shape of the app in `folder`, read now. A missing or broken file is `ok: false` with why, never an error. */
export function shapeOf(folder: string): AppShape {
  return fileShape(folder);
}

/** What changes the shape: for what is kept until it does (the proxy asks on every request). */
export function shapeStamp(folder: string): string {
  try {
    return String(fs.statSync(path.join(folder, HYDOR_FILE)).mtimeMs);
  } catch {
    return "-";
  }
}
