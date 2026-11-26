// What is sent to the server to be built: the app's own files as a tar, without what is made on this computer or is private
// to it (dependencies' folders, builds, the data folder, every .env file but the examples, databases, git). A folder that
// is a git repository sends only what git would keep (so what .gitignore names stays home), with the same things left out.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { RemoteContract } from "./types.ts";

const run = promisify(execFile);

/** Folders left out wherever they are. */
const SKIP_FOLDERS = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".next", ".nuxt", ".output", ".nitro", ".svelte-kit", ".turbo", ".cache", ".parcel-cache", ".vite"]);
/** Folders left out at the app's root (deeper down, a folder of that name is source). */
const SKIP_AT_ROOT = new Set(["data", "coverage"]);
/** Built output at the root, left out when the app has a build line that makes it again. */
const BUILT_AT_ROOT = new Set(["dist", "build", "out", "target"]);
const ENV_EXAMPLE = /^\.env\.(example|sample|template|dist)$/;
const SKIP_FILES = [/^\.env/, /^\.dev\.vars/, /\.(db|sqlite|sqlite3)$/, /\.(db|sqlite|sqlite3)-(wal|shm|journal)$/, /^\.DS_Store$/, /^id_(rsa|ed25519|ecdsa)$/];

/** Whether a path of the app (with "/") stays on this computer. */
export function staysHome(rel: string, c: Pick<RemoteContract, "build" | "database">): boolean {
  const parts = rel.split("/");
  const name = parts.at(-1)!;
  const folders = parts.slice(0, -1);
  if (folders.some((f) => SKIP_FOLDERS.has(f))) return true;
  if (folders.length && (SKIP_AT_ROOT.has(folders[0]!) || (!!c.build && BUILT_AT_ROOT.has(folders[0]!)))) return true;
  if (c.database && (name === c.database.file || name.startsWith(`${c.database.file}-`))) return true;
  if (ENV_EXAMPLE.test(name)) return false;
  return SKIP_FILES.some((s) => s.test(name));
}

const isPlainFile = (file: string) => {
  try {
    // A link is not sent: what it points at may be anywhere on this computer.
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
};

function walk(dir: string, rel: string, out: string[]): void {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIP_FOLDERS.has(e.name)) walk(dir, p, out);
    } else if (e.isFile()) out.push(p);
  }
}

/** The app's files that are sent, as paths with "/", in a fixed order. */
export async function sourceFiles(dir: string, c: Pick<RemoteContract, "build" | "database">): Promise<string[]> {
  let all: string[] = [];
  let fromGit = false;
  if (fs.existsSync(path.join(dir, ".git"))) {
    try {
      const r = await run("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: dir, maxBuffer: 1 << 26, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: os.tmpdir(), GIT_CONFIG_NOSYSTEM: "1" } });
      all = r.stdout.split("\0").filter(Boolean);
      fromGit = true;
    } catch {
      /* not a repository git will read: the folder as it is */
    }
  }
  if (!fromGit) walk(dir, "", all);
  return [...new Set(all)]
    .filter((rel) => !staysHome(rel, c) && !/[\n\r]/.test(rel) && isPlainFile(path.join(dir, rel)))
    .sort();
}

/** A fingerprint of what is sent (each path and the bytes of each file), the same for the same source whenever it is made. */
export function sourceHash(dir: string, files: string[], extras: Map<string, string>): string {
  const h = createHash("sha256");
  for (const f of files) h.update(`${f}\0${createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex")}\n`);
  for (const [f, text] of [...extras].sort(([a], [b]) => a.localeCompare(b))) h.update(`${f}\0${createHash("sha256").update(text).digest("hex")}\n`);
  return h.digest("hex");
}

/** The files among those to be sent that hold one of the values (a key written into the source must not travel). */
export function holdingValues(dir: string, files: string[], values: string[]): { file: string; value: string }[] {
  const wanted = values.filter((v) => v.length >= 8);
  const out: { file: string; value: string }[] = [];
  if (!wanted.length) return out;
  for (const f of files) {
    const p = path.join(dir, f);
    if (fs.statSync(p).size > 8 * 1024 * 1024) continue;
    const bytes = fs.readFileSync(p);
    for (const v of wanted) if (bytes.includes(v)) out.push({ file: f, value: v });
  }
  return out;
}

/** Makes the tar.gz in a folder of its own. `extras` are files to put in that the app does not have. */
export async function makeSourceTar(dir: string, files: string[], extras: Map<string, string>): Promise<{ file: string; folder: string; bytes: number }> {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "hydor-source-"));
  const list = path.join(folder, "files");
  fs.writeFileSync(list, files.map((f) => `${f}\0`).join(""));
  const tar = path.join(folder, "source.tar");
  // --null with -T: names are taken as they are, never as options.
  await run("tar", ["-cf", tar, "-C", dir, "--null", "--verbatim-files-from", "-T", list], { maxBuffer: 1 << 26 });
  if (extras.size) {
    const extra = path.join(folder, "extra");
    for (const [rel, text] of extras) {
      fs.mkdirSync(path.dirname(path.join(extra, rel)), { recursive: true });
      fs.writeFileSync(path.join(extra, rel), text);
    }
    await run("tar", ["-rf", tar, "-C", extra, ...extras.keys()], { maxBuffer: 1 << 26 });
  }
  await run("gzip", ["-f", tar]);
  const file = `${tar}.gz`;
  return { file, folder, bytes: fs.statSync(file).size };
}
