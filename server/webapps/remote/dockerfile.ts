// The Dockerfile a launch builds an app with. The app's own is used when it has one; else Hydor writes one from hydor.json's
// `build` and `start` lines, for the cases it can be sure of:
//
//   Node     start runs node, npm, npx, yarn, pnpm or a program of node_modules/.bin (the version from package.json's
//            engines or .nvmrc, else 22; a compiler in the build stage when the lock file has packages that need one)
//   Python   start runs python, gunicorn, uvicorn and the like, or a program of a .venv (3.12, or .python-version's)
//   Go       the app has a go.mod and start runs a program of its folder that the build line makes
//
// Anything else is refused with a sentence that says to add a Dockerfile. The lines of hydor.json go in as JSON arrays for
// `sh -c`, so nothing in them is read by Docker.
import fs from "node:fs";
import path from "node:path";
import type { RemoteContract } from "./types.ts";

/** The port the app is given on the server (it is not published: Caddy reaches it on the project's own network). */
export const APP_PORT = 3000;
/** The data folder the app is given on the server (a volume). */
export const DATA_PATH = "/data";

export type DockerfileKind = "own" | "node" | "python" | "go";

export type DockerfileChoice = { ok: true; kind: DockerfileKind; text: string | null; say: string } | { ok: false; say: string };

const read = (dir: string, name: string): string | null => {
  try {
    const file = path.join(dir, name);
    const st = fs.lstatSync(file);
    return st.isFile() && st.size < 8 * 1024 * 1024 ? fs.readFileSync(file, "utf8") : null;
  } catch {
    return null;
  }
};

const readJson = (dir: string, name: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(read(dir, name) ?? "");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** The program a command line starts with, without quotes. */
const programOf = (line: string): string => (/^\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(line)?.slice(1).find((x) => x !== undefined) ?? "").trim();

const nodeProgram = (p: string) => /^(node|nodejs|npm|npx|yarn|pnpm|corepack)$/.test(p) || /^(\.\/)?node_modules\/\.bin\//.test(p);
const pythonProgram = (p: string) => /^(python(3(\.\d+)?)?|gunicorn|uvicorn|waitress-serve|hypercorn|daphne|flask|fastapi|streamlit)$/.test(p) || /^(\.\/)?\.?venv\/bin\//.test(p);

/** The major version of Node the app asks for: engines.node or .nvmrc, else the one Hydor runs apps with. */
export function nodeMajor(dir: string): number {
  const engines = (readJson(dir, "package.json")?.engines as Record<string, unknown> | undefined)?.node;
  const asked = typeof engines === "string" ? engines : (read(dir, ".nvmrc") ?? "");
  const m = /(\d+)/.exec(asked);
  if (!m) return 22;
  const major = Number(m[1]);
  if (major < 18) return 22;
  // "at least this" is met by anything newer; a pinned or caret version is taken as it is.
  return /^\s*>=?/.test(asked) ? Math.max(major, 22) : major;
}

const header = (kind: string) => [`# Written by Hydor for this app from the build and start lines of hydor.json (${kind}). Add a Dockerfile of your own at the`, "# app's root and Hydor builds with that one instead. Nothing secret goes in the image: keys are given when it starts."];

const dataFolder = (user: string) => `RUN mkdir -p ${DATA_PATH} && chown ${user} ${DATA_PATH}`;
const cmd = (line: string) => `CMD ${JSON.stringify(["sh", "-c", `exec ${line}`])}`;
const buildRun = (line: string) => `RUN ${JSON.stringify(["sh", "-c", line])}`;

function nodeFile(dir: string, c: RemoteContract): string {
  const major = nodeMajor(dir);
  const image = `node:${major}-bookworm-slim`;
  const lines = header(`Node ${major}`);
  const lock = read(dir, "package-lock.json") ?? "";
  // A package with an install script may compile from source (better-sqlite3 and the like): the build stage then has a compiler.
  const compiles = /"hasInstallScript":\s*true/.test(lock);
  const corepack = /\b(pnpm|yarn)\b/.test(`${c.build ?? ""} ${c.start}`);
  if (c.build) {
    lines.push(`FROM ${image} AS build`);
    if (compiles) lines.push("RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*");
    if (corepack) lines.push("RUN corepack enable");
    lines.push("WORKDIR /app", "COPY . .", buildRun(c.build), "", `FROM ${image}`, "WORKDIR /app", "COPY --from=build /app ./");
  } else lines.push(`FROM ${image}`, "WORKDIR /app", "COPY . .");
  if (corepack) lines.push("RUN corepack enable");
  lines.push("ENV NODE_ENV=production", dataFolder("node:node"), "USER node", cmd(c.start));
  return `${lines.join("\n")}\n`;
}

function pythonFile(dir: string, c: RemoteContract): string {
  const version = /^\s*(3\.\d{1,2})/.exec(read(dir, ".python-version") ?? "")?.[1] ?? "3.12";
  const lines = [
    ...header(`Python ${version}`),
    `FROM python:${version}-slim`,
    "WORKDIR /app",
    // `pip install --user` puts packages where the app's user can read them.
    "ENV PYTHONUSERBASE=/opt/python-user PATH=/opt/python-user/bin:$PATH PYTHONUNBUFFERED=1",
    "COPY . .",
    ...(c.build ? [buildRun(c.build)] : []),
    "ENV NODE_ENV=production",
    "RUN useradd --uid 1000 --create-home app",
    dataFolder("app"),
    "USER app",
    cmd(c.start),
  ];
  return `${lines.join("\n")}\n`;
}

function goFile(c: RemoteContract): string {
  const lines = [
    ...header("Go"),
    "FROM golang:1-bookworm AS build",
    "WORKDIR /app",
    "COPY . .",
    buildRun(c.build!),
    "",
    "FROM debian:bookworm-slim",
    "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*",
    "WORKDIR /app",
    "COPY --from=build /app ./",
    "ENV NODE_ENV=production",
    "RUN useradd --uid 1000 --create-home app",
    dataFolder("app"),
    "USER app",
    cmd(c.start),
  ];
  return `${lines.join("\n")}\n`;
}

const ADD = "Add a Dockerfile at the app's root that builds it and starts it: it listens on the address in HOST and the port in the port variable of hydor.json, and keeps its data in the folder of the data variable.";

/** The app's own Dockerfile, or the one Hydor writes, or why it writes none. */
export function dockerfileFor(dir: string, c: RemoteContract): DockerfileChoice {
  if (read(dir, "Dockerfile") !== null) return { ok: true, kind: "own", text: null, say: "The app has its own Dockerfile: Hydor builds with it, as it is." };
  const no = (why: string): DockerfileChoice => ({ ok: false, say: `${why} ${ADD}` });
  const program = programOf(c.start);
  const pkg = readJson(dir, "package.json");
  const both = "Hydor writes a Dockerfile for one language at a time, and this app's lines use both Node and Python.";
  if (nodeProgram(program)) {
    if (/\bpip3?\s+install\b|\bpoetry\b|\buv\s+(sync|pip)\b/.test(c.build ?? "")) return no(both);
    const deps = Object.keys((pkg?.dependencies as Record<string, unknown> | undefined) ?? {});
    if (deps.length && !c.build) return { ok: false, say: `package.json lists packages (${deps.slice(0, 3).join(", ")}${deps.length > 3 ? "…" : ""}) and hydor.json names no build line that installs them: add "build": "npm ci --omit=dev" to it (or a Dockerfile of your own).` };
    return { ok: true, kind: "node", text: nodeFile(dir, c), say: `Hydor writes the Dockerfile: Node ${nodeMajor(dir)}${c.build ? `, “${c.build}” to build` : ""}, “${c.start}” to start.` };
  }
  if (pythonProgram(program)) {
    if (/\b(npm|npx|yarn|pnpm|node)\b/.test(c.build ?? "")) return no(both);
    if (read(dir, "requirements.txt") !== null && !c.build) return { ok: false, say: 'The app has a requirements.txt and hydor.json names no build line that installs it: add "build": "pip install -r requirements.txt" (or a Dockerfile of your own).' };
    return { ok: true, kind: "python", text: pythonFile(dir, c), say: `Hydor writes the Dockerfile: Python${c.build ? `, “${c.build}” to build` : ""}, “${c.start}” to start.` };
  }
  if (read(dir, "go.mod") !== null && /^\.\//.test(program)) {
    if (!c.build) return no("A Go app needs a build line that makes the program its start line runs, and hydor.json names none.");
    return { ok: true, kind: "go", text: goFile(c), say: `Hydor writes the Dockerfile: Go, “${c.build}” to build, “${c.start}” to start.` };
  }
  return no(`Hydor writes a Dockerfile only for Node, Python and Go apps, and this one's start line (“${c.start}”) is none of those.`);
}
