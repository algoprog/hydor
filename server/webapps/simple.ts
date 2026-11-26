// What the pages of a web app ask for beside the engines: the things to try (the agent writes them in the app's
// docs/try.md; what the person found of each is kept here), what the agent says it is doing now, whether a web address
// leads to a server yet, and, for the person with Technical details on, a saved step's changes, the app's code as an
// archive, its hydor.json to read and write, and what each place is started with (names only for keys).
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import { HYDOR_FILE, readHydorText } from "../../shared/hydor-file.ts";
import { speakingNote } from "../../shared/plain-words.ts";
import type { TryItem, WebAppGuide, WebAppOnlineHelp, WebAppStartValues } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { APP_ROOT } from "../config.ts";
import { kvGet, kvSet, type DB } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { connectFirst, firstTextFor, type FirstOptions } from "./remote/firstboot.ts";
import { getHost, makePendingKey } from "./remote/hosts.ts";
import { Refused } from "./remote/types.ts";
import { makeSourceTar, sourceFiles } from "./remote/source.ts";
import { readCatalog, serviceView } from "./services.ts";
import { findStep, listSteps } from "./steps.ts";
import type { WebAppRow } from "./store.ts";

type Json = Record<string, any>;
const run = promisify(execFile);

/** The most things to try that are shown (the skill asks for three to five). */
export const TRY_MOST = 6;
export const TRY_FILE = "docs/try.md";

/** Whether the person who is looking has Technical details on: the pages showing the session say it, else any open page. */
export function technicalFor(deps: Pick<Deps, "devices">, key?: string): boolean {
  return deps.devices?.(key)?.find((d) => d.settings.technicalDetails !== undefined)?.settings.technicalDetails === true;
}

export const speakFor = (deps: Pick<Deps, "devices">, key?: string): string => speakingNote(technicalFor(deps, key));

/** The things to try as the agent wrote them: the list lines of docs/try.md. */
export function readTry(folder: string): string[] {
  let text: string;
  try {
    const file = path.join(folder, TRY_FILE);
    // A link may lead anywhere: only a file of the app's own folder is read.
    if (!fs.lstatSync(file).isFile() || !fs.realpathSync(file).startsWith(fs.realpathSync(folder) + path.sep)) return [];
    text = fs.readFileSync(file, "utf8").slice(0, 8000);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s{0,3}(?:[-*]|\d{1,2}[.)])\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/.exec(line);
    const words = m?.[1].replace(/\*\*|__|`/g, "").slice(0, 200);
    if (words && !out.includes(words)) out.push(words);
  }
  return out.slice(0, TRY_MOST);
}

const tryId = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 12);

interface Kept {
  /** `step`: the newest saved step when it was tried. */
  try?: Record<string, { result: "works" | "wrong"; note?: string; at: number; step?: string }>;
  doing?: { text: string; at: number } | null;
  /** The app was made without a name: the agent may give it one, once. */
  placeholder?: boolean;
}

const keyOf = (id: string) => `webapps:guide:${id}`;
const keptOf = (db: DB, id: string): Kept => {
  try {
    return (JSON.parse(kvGet(db, keyOf(id)) ?? "{}") as Kept) ?? {};
  } catch {
    return {};
  }
};
const keep = (db: DB, id: string, v: Kept) => kvSet(db, keyOf(id), JSON.stringify(v));

/** Whether the app still has the name Hydor put there for want of one. */
export const hasPlaceholderName = (db: DB, id: string): boolean => !!keptOf(db, id).placeholder;
export const namedByThemselves = (db: DB, id: string) => {
  const { placeholder: _was, ...rest } = keptOf(db, id);
  keep(db, id, rest);
};

/** The app was made without a name of the person's. */
export const markPlaceholderName = (db: DB, id: string) => keep(db, id, { ...keptOf(db, id), placeholder: true });

/** The things to try with what was found of each, and what is being done. */
export async function guideOf(db: DB, a: Pick<WebAppRow, "id" | "folder">): Promise<WebAppGuide> {
  const kept = keptOf(db, a.id);
  const last = (await listSteps(a.folder, 1).catch(() => null))?.steps[0];
  const items = readTry(a.folder).map((text): TryItem => {
    const id = tryId(text);
    const found = kept.try?.[id];
    // A step saved after it was tried may have changed it: it is to be tried again.
    const again = !!found && !!last && found.step !== last.sha;
    return { id, text, ...(found ? { result: found.result, at: found.at, ...(found.note ? { note: found.note } : {}) } : {}), ...(again ? { again } : {}) };
  });
  return { try: items, doing: kept.doing ?? null, placeholderName: !!kept.placeholder };
}

// ---- a web address and a server ------------------------------------------------------------------------------------------------

export type Resolve = (name: string) => Promise<string[]>;
const resolveA: Resolve = async (name) => {
  const r = new dns.promises.Resolver({ timeout: 4000, tries: 1 });
  return r.resolve4(name).catch(() => [] as string[]);
};
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const NAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export interface SimpleCtx {
  root: string;
  /** <data>/server-hosts */
  hostsDir: string;
  own: (req: { params: unknown }) => WebAppRow;
  enabled: () => void;
  changed: () => void;
  rename: (a: WebAppRow, name: string) => Promise<void>;
  /** For tests: how a name is looked up. */
  resolve?: Resolve;
  /** Whether apps are deployed to a server; for tests, how a server is read and connected to (a stand-in for SSH). */
  first?: FirstOptions;
}

export function simpleRoutes(d: Deps, c: SimpleCtx) {
  const { app, db } = d;
  const B = (req: FastifyRequest) => (req.body ?? {}) as Json;
  const resolve = c.resolve ?? resolveA;

  app.get("/api/webapps/:id/guide", async (req) => {
    c.enabled();
    return await guideOf(db, c.own(req));
  });
  app.put("/api/webapps/:id/guide", async (req) => {
    c.enabled();
    const a = c.own(req);
    const b = B(req);
    const kept = keptOf(db, a.id);
    if (typeof b.doing === "string") kept.doing = b.doing.trim() ? { text: b.doing.replace(/\s+/g, " ").trim().slice(0, 120), at: Date.now() } : null;
    // A name the agent suggests: only while the app has none of the person's own.
    if (typeof b.name === "string" && b.name.trim() && kept.placeholder) {
      await c.rename(a, b.name);
      delete kept.placeholder;
    }
    keep(db, a.id, kept);
    c.changed();
    return await guideOf(db, a);
  });
  app.put("/api/webapps/:id/guide/try", async (req) => {
    c.enabled();
    const a = c.own(req);
    const b = B(req);
    const id = String(b.id ?? "");
    if (!readTry(a.folder).some((t) => tryId(t) === id)) throw new HttpError(404, "There is no such thing to try.");
    if (b.result !== "works" && b.result !== "wrong" && b.result !== null) throw new HttpError(400, "The result is works, wrong or null.");
    const kept = keptOf(db, a.id);
    const all = { ...(kept.try ?? {}) };
    const step = (await listSteps(a.folder, 1).catch(() => null))?.steps[0]?.sha;
    if (b.result === null) delete all[id];
    else all[id] = { result: b.result, at: Date.now(), ...(step ? { step } : {}), ...(typeof b.note === "string" && b.note.trim() ? { note: b.note.trim().slice(0, 1000) } : {}) };
    keep(db, a.id, { ...kept, try: all });
    c.changed();
    return await guideOf(db, a);
  });

  // The key to paste on a server before its address is known (Hydor's own, never the person's): one for each app.
  app.get("/api/webapps/:id/server-key", async (req) => {
    c.enabled();
    const a = c.own(req);
    return { line: await makePendingKey(c.hostsDir, a.id) };
  });

  // The text to paste into the provider's box as a new server is created (remote/firstboot.ts). It holds the private half
  // of the server's identity: the person's page asks for it, and agents are refused it (guide/api.ts).
  app.get("/api/webapps/:id/server-text", async (req) => {
    c.enabled();
    const a = c.own(req);
    return { text: await firstTextFor(c.hostsDir, a.id) };
  });
  app.post("/api/webapps/:id/server-connect", async (req) => {
    c.enabled();
    const a = c.own(req);
    const address = String(B(req).address ?? "").trim();
    if (!address) throw new HttpError(400, "Give the server's address.");
    try {
      const r = await connectFirst(c.hostsDir, a.id, address, c.first);
      c.changed();
      return { state: r.state, ...(r.host ? { host: r.host } : {}), ...(r.check ? { looked: r.check.looked } : {}), ...(r.why ? { why: r.why } : {}) };
    } catch (e) {
      if (e instanceof Refused) throw new HttpError(e.kind === "input" ? 400 : e.kind === "conflict" ? 409 : 502, e.message);
      throw e;
    }
  });

  // Where a server can be rented and an address bought, with the clicks for each: the services catalog, as it is offered.
  app.get("/api/webapps/online-help", async () => {
    c.enabled();
    const catalog = readCatalog();
    const offered = (need: string) => catalog.needs.find((n) => n.id === need)?.services ?? [];
    const view = (s: ReturnType<typeof offered>[number]) => {
      const v = serviceView(s, Date.now());
      return { id: s.id, name: s.name, why: s.why, page: s.page, ...(v.paid ? { price: v.paid, read: s.paid?.read } : {}), ...(s.catch ? { catch: s.catch } : {}) };
    };
    const out: WebAppOnlineHelp = {
      providers: offered("run").filter((s) => s.id !== "render").map((s) => ({ ...view(s), ...(s.server ? { server: s.server } : {}) })),
      registrars: offered("domain").map((s) => ({ ...view(s), ...(s.record ? { record: s.record } : {}) })),
    };
    return out;
  });

  // Whether a web address leads to a server yet (a new record takes minutes to be seen).
  app.get("/api/webapps/dns", async (req) => {
    c.enabled();
    const q = (req.query ?? {}) as { name?: unknown; host?: unknown };
    const name = String(q.name ?? "").trim().toLowerCase();
    if (!NAME.test(name) || IPV4.test(name)) throw new HttpError(400, "That is not a web address, like shop.example.com.");
    const host = getHost(c.hostsDir, String(q.host ?? ""));
    const want = IPV4.test(host.address) ? [host.address] : await resolve(host.address);
    const found = await resolve(name);
    return { points: found.length > 0 && found.every((x) => want.includes(x)), found, want: want[0] ?? host.address };
  });

  app.get("/api/webapps/:id/steps/:sha/diff", async (req) => {
    c.enabled();
    const a = c.own(req);
    const step = await findStep(a.folder, String((req.params as { sha: string }).sha));
    if (!step) throw new HttpError(404, "There is no such step.");
    const r = await run("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "safe.directory=*", "-c", "core.quotepath=false", "show", "--no-color", "--no-ext-diff", "--no-textconv", "--format=", "--stat", "--patch", step.sha, "--"], { cwd: a.folder, maxBuffer: 1 << 25, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: c.root, GIT_CONFIG_NOSYSTEM: "1" } });
    const MOST = 200_000;
    return { sha: step.sha, diff: r.stdout.slice(0, MOST), cut: r.stdout.length > MOST };
  });

  // The app's code: what a launch would send (no dependencies, builds, data, keys or git).
  app.get("/api/webapps/:id/code", async (req, reply: FastifyReply) => {
    c.enabled();
    const a = c.own(req);
    let contract: Parameters<typeof sourceFiles>[1] = {};
    try {
      const r = readHydorText(fs.readFileSync(path.join(a.folder, HYDOR_FILE), "utf8"));
      if (r.ok) contract = r.file;
    } catch {}
    const files = await sourceFiles(a.folder, contract);
    if (!files.length) throw new HttpError(409, "There is no code to download yet.");
    const made = await makeSourceTar(a.folder, files, new Map());
    const stream = fs.createReadStream(made.file);
    stream.once("close", () => fs.rm(made.folder, { recursive: true, force: true }, () => {}));
    return reply.header("content-type", "application/gzip").header("content-disposition", `attachment; filename="${a.slug}-code.tar.gz"`).send(stream);
  });

  /** The app's hydor.json, only when it is a plain file of its own folder (or not there yet). */
  const contractFile = (a: WebAppRow): string => {
    const file = path.join(a.folder, HYDOR_FILE);
    let st: fs.Stats | null = null;
    try {
      st = fs.lstatSync(file);
    } catch {}
    if (st && !st.isFile()) throw new HttpError(409, "Its hydor.json is not a plain file.");
    return file;
  };
  app.get("/api/webapps/:id/contract", async (req) => {
    c.enabled();
    const file = contractFile(c.own(req));
    return { text: fs.existsSync(file) ? fs.readFileSync(file, "utf8").slice(0, 100_000) : "" };
  });
  app.put("/api/webapps/:id/contract", async (req) => {
    c.enabled();
    const a = c.own(req);
    const text = B(req).text;
    if (typeof text !== "string" || !text.trim() || text.length > 100_000) throw new HttpError(400, "Give the file's text.");
    const read = readHydorText(text);
    if (!read.ok) throw new HttpError(400, `Not saved: ${read.problems.join(" ")}`);
    fs.writeFileSync(contractFile(a), text.endsWith("\n") ? text : `${text}\n`);
    c.changed();
    return { ok: true };
  });

  app.get("/api/webapps/:id/values", async (req) => {
    c.enabled();
    const a = c.own(req);
    let file: ReturnType<typeof readHydorText> | null = null;
    try {
      file = readHydorText(fs.readFileSync(contractFile(a), "utf8"));
    } catch {}
    // The contract's checker as a person runs it in a shell of their own (a copy of Hydor's own, in the builder's skill).
    const quoted = (s: string) => (/^[\w./~-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
    const out: WebAppStartValues = { values: [], check: `node ${quoted(path.join(APP_ROOT, "skills", "web-app-builder", "references", "hydor-check.mjs"))} ${quoted(a.folder)}` };
    if (!file?.ok) return out;
    const f = file.file;
    const add = (name: string | undefined, what: WebAppStartValues["values"][number]["what"]) => {
      if (name) out.values.push({ name, what });
    };
    add(f.env.port, "port");
    add(f.env.host ?? "HOST", "host");
    add(f.env.data, "data");
    add(f.env.secret, "secret");
    add(f.env.url, "url");
    for (const k of f.keys) add(k.name, "key");
    return out;
  });
}
