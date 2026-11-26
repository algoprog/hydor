// The flows half of a web app: an agent app (server/apps) whose definition is kept as files in the web app's own
// folder (`flows`, beside `src`), linked to the web app on both sides, and a key of its own that the web app is
// started with, so its pages start Hydor's agents and follow their runs through Hydor's API.
//
//   POST   /api/webapps/:id/flows   give it a flows half { app? }: a small starting recipe, or an agent app that is there already
//   DELETE /api/webapps/:id/flows   unlink: the agent app stays, its folder back where agent apps keep theirs
//   GET    /api/webapps/:id/flows/functions   the functions the web app offers its agents (functions.json) and which the recipe allows
//   PUT    /api/webapps/:id/flows/functions   allow some (or none): the `fn:` entries of the agent app's tools (flows-functions.ts)
//
// The key's value is kept only here, in a file of its own beside the app's secret (`<data>/webapps/<id>/flows-key`, mode
// 0600: not in the app's folder and not in the data folder the app can write), and goes to the app only as an environment
// variable at its start. No route shows it. Hydor keeps only a hash of any key, so an existing agent app's own keys cannot
// be reused: a key for the web app is made, named after it, on that agent app.
import fs from "node:fs";
import path from "node:path";
import type { AppDef, AppRecipe, RunPerson } from "../../shared/apps.ts";
import { cleanRecipe } from "../../shared/apps.ts";
import { STEP_ONLY_TOOLS } from "../../shared/app-manifest.ts";
import type { WebAppFlows } from "../../shared/webapps.ts";
import { FN_ENTRY, FN_FREE } from "../apps/appfns.ts";
import { APP_FILE, defaultFolder, linkFolder, readFolder, unwatch } from "../apps/folder.ts";
import { problemsOf } from "../apps/index.ts";
import { useWebappLinks } from "../apps/keyroutes.ts";
import { appChanged } from "../apps/runs.ts";
import { runTools } from "../features/registry.ts";
import { createFunctions, functionsView, readFunctions } from "./flows-functions.ts";
import { appOfKey, createKey, deleteApp, getApp, listKeys, revokeKey, saveApp } from "../apps/store.ts";
import { HttpError } from "../auth.ts";
import type { DB } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { sessionFns } from "./session-fns.ts";
import { verifyPerson } from "./sign.ts";
import { getWebApp, within, type WebAppRow } from "./store.ts";

/** How long after a header ran out a run may still be started with it: the web app forwards it a moment after it got it. */
export const PERSON_GRACE_SECONDS = 120;

/** What the flows half of a web app needs of the server around it. */
export interface FlowsContext {
  /** `<Hydor's data folder>/webapps`: each app's secret, data and (here) key. */
  root: string;
  /** Where the web app reaches Hydor from this computer. */
  hydorUrl: () => string;
  /** The secret of a web app, which signs the header that says who is there (and so what a person token is checked with). */
  secret: (id: string) => string;
  /** Every secret that may have signed a person's header for the web app: the side that is launched and the one being changed (when it has both). Defaults to `secret`. */
  secrets?: (id: string) => string[];
  /** Stops a web app that is running, so its next start has the environment as it is now. */
  restart: (id: string) => Promise<void>;
  /** The page of agent apps hears of a change. */
  changed: () => void;
  /** The port a web app listens on, starting it when it is not running (the call of a function waits for it, and a run starts it first). */
  port: (id: string) => Promise<number>;
  /** Holds a web app awake until the returned function is called: a run does, for as long as it lasts. */
  hold: (id: string) => () => void;
  /** The person signed in to Hydor, as a run started on Hydor's own pages for a linked app is recorded to act for them. */
  owner: () => RunPerson;
}

const tables = new WeakSet<DB>();
function flowsTables(db: DB) {
  if (tables.has(db)) return;
  db.exec(`
    create table if not exists web_app_flows (
      web_id text primary key,
      app_id text not null unique,
      key_id text,
      created_at integer not null
    );
  `);
  tables.add(db);
}

interface LinkRow {
  web_id: string;
  app_id: string;
  key_id: string | null;
  created_at: number;
}
export const linkOf = (db: DB, webId: string): LinkRow | null => {
  flowsTables(db);
  return (db.prepare("select * from web_app_flows where web_id = ?").get(webId) as LinkRow | undefined) ?? null;
};
export const linkOfApp = (db: DB, appId: string): LinkRow | null => {
  flowsTables(db);
  return (db.prepare("select * from web_app_flows where app_id = ?").get(appId) as LinkRow | undefined) ?? null;
};

const keyFile = (root: string, webId: string) => path.join(root, webId, "flows-key");

/** The starting recipe: one flow, a short form, one agent step, and a cap on what a run may spend. */
export function startingRecipe(webName: string): AppRecipe {
  return cleanRecipe({
    name: `${webName} flows`.slice(0, 80),
    description: `The work Hydor’s agents do for the web app “${webName}”. Its pages start it and follow it.`,
    icon: "bot",
    color: "indigo",
    agent: "claude",
    fields: [{ id: "request", label: "What should it do?", type: "long", required: true, help: "What the web app asks of the agent, in words." }],
    answer: [{ id: "answer", label: "Answer", type: "markdown", required: true }],
    tools: null,
    limits: { capUsd: 0.5 },
    flow: {
      steps: [
        {
          id: "work",
          do: "agent",
          title: "Do the work",
          instructions: "Do what is asked, and hand in the answer.\n\n{{request}}",
          outputs: [{ id: "answer", label: "Answer", type: "markdown", required: true }],
        },
      ],
    },
  });
}

// ---- the view -------------------------------------------------------------------------------------------------------

/** A web app's flows half as `GET` shows it, or undefined when it has none. */
export function flowsView(db: DB, web: { id: string }): WebAppFlows | undefined {
  const l = linkOf(db, web.id);
  if (!l) return undefined;
  const a = getApp(db, l.app_id);
  if (!a) return undefined;
  const key = l.key_id ? listKeys(db, a.id).find((k) => k.id === l.key_id) : undefined;
  return {
    app: { id: a.id, slug: a.slug, name: a.name },
    folder: a.folder ?? null,
    key: l.key_id ? { id: l.key_id, hint: key?.hint ?? "", ok: !!key } : null,
    since: l.created_at,
  };
}

// ---- the key ------------------------------------------------------------------------------------------------------------

/** The key the web app starts with: the one kept, if it still opens the app, else a new one (the old is revoked). Never written anywhere but its own file. */
function ensureKey(db: DB, root: string, link: LinkRow, web: { id: string; name: string }): string {
  const file = keyFile(root, web.id);
  try {
    const kept = fs.readFileSync(file, "utf8").trim();
    const k = kept ? appOfKey(db, kept) : null;
    if (k && k.app === link.app_id && k.id === link.key_id) return kept;
  } catch {}
  if (link.key_id) revokeKey(db, link.app_id, link.key_id);
  const made = createKey(db, link.app_id, `Web app: ${web.name}`);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${made.key}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  db.prepare("update web_app_flows set key_id = ? where web_id = ?").run(made.id, web.id);
  return made.key;
}

/** What a web app with a flows half is started with, beyond what the host always gives: where Hydor is, the agent app's address and the key. */
export function flowsEnv(db: DB, ctx: Pick<FlowsContext, "root" | "hydorUrl">, id: string): Record<string, string> | undefined {
  const l = linkOf(db, id);
  if (!l) return undefined;
  const a = getApp(db, l.app_id);
  const web = getWebApp(db, id);
  if (!a || !web) return undefined;
  return { HYDOR_URL: ctx.hydorUrl(), HYDOR_APP_SLUG: a.slug, HYDOR_APP_KEY: ensureKey(db, ctx.root, l, web) };
}

// ---- folders ----------------------------------------------------------------------------------------------------------

const hasFiles = (dir: string) => {
  try {
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
};

/** Moves a folder (a rename; across disks, a copy and then removing the old one, which is the app's own). */
export function moveDir(from: string, to: string) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) fs.rmdirSync(to);
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    fs.cpSync(from, to, { recursive: true, errorOnExist: true });
    fs.rmSync(from, { recursive: true });
  }
}

/** The first of `want`, `want-2`, `want-3`… that is not there or is empty. */
function freeFolder(want: string): string {
  for (let n = 1; ; n++) {
    const p = n === 1 ? want : `${want}-${n}`;
    if (!fs.existsSync(p) || !hasFiles(p)) return p;
  }
}

// ---- linking -------------------------------------------------------------------------------------------------------------

/**
 * The recipe a flows folder already holds: checked as any recipe is, and what is wrong in it comes back as
 * plain reasons. null: the folder holds none (there is no app.json in it).
 */
function folderRecipe(db: DB, dest: string): AppRecipe | null {
  if (!fs.existsSync(path.join(dest, APP_FILE))) return null;
  const { recipe, screens, errors } = readFolder(dest);
  const problems = [...errors];
  if (!problems.length) {
    const checked = problemsOf(db, recipe);
    problems.push(...checked.errors);
    if (Object.keys(screens).length) problems.push("it has screens, which an agent app linked to a web app does not use: the web app’s own pages are its screens");
    if (!problems.length) return checked.recipe;
  }
  throw new HttpError(400, `The folder flows in the web app’s folder has a recipe (${APP_FILE}) that cannot be used as it is: ${problems.slice(0, 8).join("; ")}. Fix it, or move the folder away to start from a small recipe.`, { problems });
}

/** Gives a web app a flows half, from a recipe already in its flows folder, a starting recipe or an agent app that is there. Everything is checked before anything changes; a failure after leaves nothing half-made. */
export function addFlows(db: DB, ctx: FlowsContext, web: WebAppRow, given: { app?: unknown }): { app: AppDef; created: boolean; from: "folder" | "starting" | "app" } {
  flowsTables(db);
  const have = linkOf(db, web.id);
  if (have) throw new HttpError(409, `This web app already has a flows half: ${getApp(db, have.app_id)?.name ?? "an app"}. Unlink it first (DELETE /api/webapps/${web.id}/flows) to link another.`);
  const dest = path.join(web.folder, "flows");
  let st: fs.Stats | null = null;
  try {
    st = fs.lstatSync(dest);
  } catch {}
  if (st?.isSymbolicLink()) throw new HttpError(409, "The folder flows in the web app’s folder is a link: it has to be a real folder (or not there).");
  if (st && !st.isDirectory()) throw new HttpError(409, "There is a file called flows in the web app’s folder: the flows half is kept in a folder of that name.");
  let existing: AppDef | null = null;
  if (given.app !== undefined && given.app !== null && given.app !== "") {
    if (typeof given.app !== "string" || given.app.startsWith("tpl:")) throw new HttpError(400, "app is the id or the address of one of your agent apps.");
    existing = getApp(db, given.app);
    if (!existing) throw new HttpError(404, `There is no agent app “${given.app}”.`);
    const other = linkOfApp(db, existing.id);
    if (other || existing.webapp) throw new HttpError(409, `“${existing.name}” is already the flows half of the web app “${existing.webapp?.name ?? "another"}”.`);
  }
  // The folder is empty or not there, or it is already the agent app's own (it was kept there before).
  const folderHas = !!st && hasFiles(dest);
  const sameFolder = !!existing?.folder && path.resolve(existing.folder) === dest;
  // A folder that already holds a valid recipe becomes the agent app's definition.
  let held: AppRecipe | null = null;
  if (folderHas && !sameFolder) {
    if (existing) throw new HttpError(409, "The folder flows in the web app’s folder already has files in it: move them away first (or link the agent app they belong to by its id, when they are its own).");
    held = folderRecipe(db, dest);
    if (!held) throw new HttpError(409, `The folder flows in the web app’s folder already has files in it, and no ${APP_FILE} to say what the agent app is: move them away first, or add the recipe as ${APP_FILE} there (or link the agent app they belong to by its id).`);
  }
  const from = existing?.folder ? path.resolve(existing.folder) : null;
  if (from && from !== dest) {
    if (within(dest, from) || within(web.folder, from)) throw new HttpError(409, "That agent app’s folder holds the web app: it cannot be moved into it.");
    if (!fs.existsSync(path.join(from, APP_FILE))) throw new HttpError(409, "That agent app’s folder has no app.json any more: unlink it from its folder first (DELETE /api/apps/:id/folder).");
  }

  let created: AppDef | null = null;
  let moved: { from: string; to: string } | null = null;
  try {
    let a: AppDef;
    if (existing) {
      a = existing;
      if (from && from !== dest) {
        unwatch(a.id);
        moveDir(from, dest);
        moved = { from, to: dest };
      }
    } else a = created = saveApp(db, { recipe: held ?? startingRecipe(web.name), by: "you", why: held ? `Made from the recipe in the flows folder of the web app “${web.name}”.` : `Made as the flows half of the web app “${web.name}”.` });
    a = linkFolder(db, a, dest);
    a = saveApp(db, { id: a.id, recipe: a, webapp: { id: web.id, name: web.name }, by: "you", why: `The flows half of the web app “${web.name}”.` });
    db.prepare("insert into web_app_flows (web_id, app_id, key_id, created_at) values (?, ?, null, ?)").run(web.id, a.id, Date.now());
    ensureKey(db, ctx.root, linkOf(db, web.id)!, web);
    return { app: getApp(db, a.id)!, created: !!created, from: held ? "folder" : created ? "starting" : "app" };
  } catch (e) {
    // Nothing half-made: the link, the key and its file, the app we made and the files we wrote, and an app's folder moved back.
    const l = linkOf(db, web.id);
    if (l) {
      if (l.key_id) revokeKey(db, l.app_id, l.key_id);
      db.prepare("delete from web_app_flows where web_id = ?").run(web.id);
    }
    fs.rmSync(keyFile(ctx.root, web.id), { force: true });
    const mine = !moved && !sameFolder && !folderHas;
    if (created) {
      unwatch(created.id);
      deleteApp(db, created.id);
      if (mine) fs.rmSync(dest, { recursive: true, force: true });
    } else if (existing) {
      unwatch(existing.id);
      if (moved) {
        try {
          moveDir(moved.to, moved.from);
        } catch {}
      } else if (mine) fs.rmSync(dest, { recursive: true, force: true });
      try {
        saveApp(db, { id: existing.id, recipe: existing, folder: existing.folder ?? null, webapp: null });
        if (existing.folder && fs.existsSync(existing.folder)) linkFolder(db, getApp(db, existing.id)!, existing.folder);
      } catch {}
    }
    if (e instanceof HttpError) throw e;
    throw new HttpError(500, `The flows half could not be made: ${(e as Error).message}`);
  }
}

/** Undoes the link in the table and the key; the agent app stays (its link mark cleared). Returns the agent app. */
export function release(db: DB, ctx: Pick<FlowsContext, "root">, web: { id: string }): AppDef | null {
  const l = linkOf(db, web.id);
  if (!l) return null;
  if (l.key_id) revokeKey(db, l.app_id, l.key_id);
  fs.rmSync(keyFile(ctx.root, web.id), { force: true });
  db.prepare("delete from web_app_flows where web_id = ?").run(web.id);
  const a = getApp(db, l.app_id);
  return a ? saveApp(db, { id: a.id, recipe: a, webapp: null, by: "you", why: "No longer the flows half of a web app." }) : null;
}

/** Unlinks: the agent app stays, with its folder moved back to where agent apps keep theirs; the key is revoked. */
export function removeFlows(db: DB, ctx: FlowsContext, web: WebAppRow): { app: AppDef | null; folder: string | null } {
  const l = linkOf(db, web.id);
  if (!l) throw new HttpError(404, "This web app has no flows half.");
  const a = getApp(db, l.app_id);
  const dest = path.join(web.folder, "flows");
  let back: string | null = null;
  if (a?.folder && path.resolve(a.folder) === dest && fs.existsSync(path.join(dest, APP_FILE))) {
    back = freeFolder(defaultFolder(a.slug));
    unwatch(a.id);
    try {
      moveDir(dest, back);
    } catch (e) {
      // Not moved: still kept where it was.
      linkFolder(db, a, dest);
      throw new HttpError(500, `Its folder could not be moved back: ${(e as Error).message}`);
    }
  }
  const left = release(db, ctx, web);
  if (left && back) linkFolder(db, left, back);
  return { app: left ? getApp(db, left.id) : null, folder: back ?? left?.folder ?? null };
}

/** The web app is forgotten: its link and key go, the agent app stays (with its folder where it is). Says what was left. */
export function forgetFlows(db: DB, ctx: Pick<FlowsContext, "root">, web: { id: string }): { app: { id: string; slug: string; name: string }; folder: string | null } | null {
  const l = linkOf(db, web.id);
  if (!l) return null;
  const a = release(db, ctx, web);
  return a ? { app: { id: a.id, slug: a.slug, name: a.name }, folder: a.folder ?? null } : null;
}

// ---- routes ----------------------------------------------------------------------------------------------------------------

/** Registers the flows routes and tells the key routes which apps are flows halves, and what their web app may spend. */
export function flowsRoutes(d: Deps, ctx: FlowsContext, h: { enabled: () => void; own: (req: { params: unknown }) => WebAppRow; detail: (a: WebAppRow) => unknown }) {
  const { app, db } = d;
  flowsTables(db);
  // The web app's own functions as the tools of its agents' runs (flows-functions.ts).
  createFunctions({
    db,
    webOf: (appId) => {
      const l = linkOfApp(db, appId);
      return l ? getWebApp(db, l.web_id) : null;
    },
    port: ctx.port,
    hold: ctx.hold,
    secret: ctx.secret,
  });
  useWebappLinks({
    signedIn: (a) => (linkOfApp(db, a.id) ? ctx.owner() : null),
    of(a, keyId) {
      const l = linkOfApp(db, a.id);
      if (!l) return null;
      const web = getWebApp(db, l.web_id);
      return {
        viaKey: !!keyId && keyId === l.key_id,
        dailyCapUsd: web?.settings.dailyCapUsd ?? 0,
        // A person is who the signed header of this web app's own proxy says, still good a little after it ran out (the app forwards it a moment later).
        person(token) {
          let c = verifyPerson(token, ctx.secret(l.web_id), PERSON_GRACE_SECONDS);
          // A launched web app has two sides, each with its own secret: a header either of them signed is good (the reason a bad one is refused is the first side's).
          if (!c.ok) for (const other of ctx.secrets?.(l.web_id) ?? []) {
            const o = verifyPerson(token, other, PERSON_GRACE_SECONDS);
            if (o.ok) {
              c = o;
              break;
            }
          }
          if (c.ok) return { person: c.person };
          return {
            problem:
              c.why === "expired"
                ? "That personToken has run out: the web app has to send the x-hydor-person header it got with the request, within a couple of minutes of getting it."
                : c.why === "signature"
                  ? "That personToken is not one this web app’s own proxy signed: send the x-hydor-person header exactly as the web app received it."
                  : "That personToken is not an x-hydor-person header’s value: send it exactly as the web app received it.",
          };
        },
      };
    },
  });

  app.post("/api/webapps/:id/flows", async (req) => {
    h.enabled();
    const web = h.own(req);
    const b = (req.body ?? {}) as { app?: unknown };
    const { app: a, created, from } = addFlows(db, ctx, web, b);
    await ctx.restart(web.id);
    d.broadcast({ t: "feature", id: "apps", data: { app: { id: a.id, updatedAt: a.updatedAt, by: "user" } } });
    ctx.changed();
    return { app: h.detail(web), flows: flowsView(db, web), created, from };
  });

  /** The agent app of a web app's flows half. */
  const agentOf = (web: WebAppRow): AppDef => {
    const l = linkOf(db, web.id);
    const a = l ? getApp(db, l.app_id) : null;
    if (!a) throw new HttpError(404, "This web app has no flows half.");
    return a;
  };

  app.get("/api/webapps/:id/flows/functions", async (req) => {
    h.enabled();
    return functionsView(h.own(req), agentOf(h.own(req)).tools, sessionFns(db, h.own(req).id));
  });

  app.put("/api/webapps/:id/flows/functions", async (req) => {
    h.enabled();
    const web = h.own(req);
    const a = agentOf(web);
    const b = (req.body ?? {}) as { allow?: unknown; free?: unknown };
    const names = b.allow === "*" ? ["*"] : Array.isArray(b.allow) && b.allow.every((x) => typeof x === "string") ? [...new Set(b.allow as string[])] : null;
    if (!names) throw new HttpError(400, 'allow is "*" (every function that only reads), or a list of the functions’ names (an empty list allows none).');
    // `free`: of those allowed, the ones that change things and may be called without asking the person first (a function that changes things asks on a card the first time a run calls it, unless it is named here).
    if (b.free !== undefined && !(Array.isArray(b.free) && b.free.every((x) => typeof x === "string"))) throw new HttpError(400, "free is a list of the functions’ names that may change what the app keeps without asking the person first (they have to be allowed too).");
    const free = [...new Set((b.free ?? []) as string[])];
    const read = readFunctions(web.folder);
    const unknown = names.filter((n) => n !== "*" && !read.fns.some((f) => f.name === n));
    if (unknown.length) throw new HttpError(400, `The app does not offer ${unknown.map((n) => `“${n}”`).join(", ")}${read.fns.length ? ` (it offers ${read.fns.map((f) => f.name).join(", ")})` : read.problems[0] ? `: ${read.problems[0]}` : ""}.`);
    const notAllowed = free.filter((n) => !names.includes(n));
    if (notAllowed.length) throw new HttpError(400, `${notAllowed.map((n) => `“${n}”`).join(", ")} ${notAllowed.length === 1 ? "is" : "are"} in free but not in allow: a function has to be allowed before it can be allowed without asking.`);
    const reads = free.filter((n) => !read.fns.find((f) => f.name === n)?.writes);
    if (reads.length) throw new HttpError(400, `${reads.map((n) => `“${n}”`).join(", ")} only read${reads.length === 1 ? "s" : ""}, so ${reads.length === 1 ? "it" : "they"} never ask: leave ${reads.length === 1 ? "it" : "them"} out of free.`);
    const keep = (a.tools ?? []).filter((t) => !t.startsWith(FN_ENTRY));
    // Tools that are "all of Hydor's own" (no list) become that list, now, when functions are allowed: a list is the only place a function can be named.
    let base = keep;
    if (a.tools === null && names.length) {
      const seen = new Set<string>();
      const ctxTools = { runId: "flows-functions", key: "acp:flows-functions", agent: "acp" as const, acpAgent: "console", cwd: web.folder, deps: d, step: true };
      base = runTools(ctxTools)
        .map((t) => t.name)
        .filter((n) => n !== "submit_result" && !STEP_ONLY_TOOLS.includes(n) && !seen.has(n) && seen.add(n));
    }
    const next = names.length ? [...base, ...names.map((n) => `${FN_ENTRY}${n}${free.includes(n) ? FN_FREE : ""}`)] : a.tools === null ? null : base;
    const saved = saveApp(db, { id: a.id, recipe: { ...a, tools: next }, by: "you", why: names.length ? `Allowed the web app’s functions: ${names.map((n) => n + (free.includes(n) ? " (without asking)" : "")).join(", ")}.` : "No longer allows the web app’s functions." });
    appChanged(saved, "user");
    return { ...functionsView(web, saved.tools, sessionFns(db, web.id)), tools: saved.tools };
  });

  app.delete("/api/webapps/:id/flows", async (req) => {
    h.enabled();
    const web = h.own(req);
    const r = removeFlows(db, ctx, web);
    await ctx.restart(web.id);
    if (r.app) d.broadcast({ t: "feature", id: "apps", data: { app: { id: r.app.id, updatedAt: r.app.updatedAt, by: "user" } } });
    ctx.changed();
    return { app: h.detail(web), flows: null, agentApp: r.app ? { id: r.app.id, slug: r.app.slug, name: r.app.name, folder: r.folder } : null };
  });
}
