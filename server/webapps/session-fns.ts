// A web app's functions for the agents in sessions.
//
// What the web app says (functions.json) was until now offered only to the agents of its own flows half. Its owner can also offer each function to the agents in
// their sessions: a second switch on the app's Flows tab ("In sessions"), kept here (`web_app_session_fns`: the function's name, and whether it may change things without
// asking). Nothing is offered until it is switched on, and an app that is gone or whose function is gone offers nothing.
//
//   GET  /api/webapps/:id/functions                 the functions the app declares, with both switches (for a run's agents and for sessions)
//   PUT  /api/webapps/:id/functions/sessions        offer some to sessions { allow: "*" | names, free?: names }
//   GET  /api/webapps/functions/offered             what sessions are offered, by app (what the tool webapp_list_functions reads)
//   POST /api/webapps/:id/functions/:name/call      call one as the person signed in { input?, session? } (what webapp_call_function does after its card; refused to app_api)
//
// A call acts as the person the session belongs to (this Hydor's owner), signed by Hydor with the app's secret exactly as a run's calls are, so the app's own access rules decide
// what that person may touch. A function that changes things asks the person on a card the first time a session calls it, unless the owner chose "without asking" for it (the tool
// asks; this route is the owner's own). The app is called at the version people use: the launched one when it has one, else the one being made.
import fs from "node:fs";
import path from "node:path";
import type { RunPerson } from "../../shared/apps.ts";
import { Limiter } from "../apps/limits.ts";
import { HttpError } from "../auth.ts";
import type { DB } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { FN_LIMITS, FUNCTIONS_FILE, invokeFunction, readFunctions, type FnDef, type FunctionsContext } from "./flows-functions.ts";
import { listWebApps, type WebAppRow } from "./store.ts";

const tables = new WeakSet<DB>();
function sessionTables(db: DB) {
  if (tables.has(db)) return;
  db.exec("create table if not exists web_app_session_fns (web_id text not null, name text not null, free integer not null default 0, primary key (web_id, name))");
  tables.add(db);
}

/** The functions of a web app offered to sessions, by name; `free`: one that changes things may do so without asking the person. */
export function sessionFns(db: DB, webId: string): Map<string, { free: boolean }> {
  sessionTables(db);
  const rows = db.prepare("select name, free from web_app_session_fns where web_id = ?").all(webId) as { name: string; free: number }[];
  return new Map(rows.map((r) => [r.name, { free: r.free === 1 }]));
}

/** Replaces what is offered to sessions. */
export function setSessionFns(db: DB, webId: string, offer: { name: string; free: boolean }[]) {
  sessionTables(db);
  db.prepare("delete from web_app_session_fns where web_id = ?").run(webId);
  const add = db.prepare("insert into web_app_session_fns (web_id, name, free) values (?, ?, ?)");
  for (const o of offer) add.run(webId, o.name, o.free ? 1 : 0);
}

/** A web app is forgotten: so is what it offered. */
export function forgetSessionFns(db: DB, webId: string) {
  sessionTables(db);
  db.prepare("delete from web_app_session_fns where web_id = ?").run(webId);
}

/** What sessions may ask of one app's functions, apart from the limits of the app's own flows. */
export const SESSION_FN_LIMITS = {
  /** Calls one session may make in all (an hour's window). */
  perSession: 60,
  /** Calls one session may make in a minute. */
  perSessionPerMinute: 20,
  /** Calls all sessions and runs may make to one web app in a minute (the same count the runs' calls are held to). */
  perAppPerMinute: FN_LIMITS.perAppPerMinute,
};
const limiter = new Limiter(Date.now, "web-functions");
/** For tests: forget the calls counted by the limits. */
export const forgetSessionLimits = () => limiter.clear();

/** What one app offers sessions. */
export interface SessionOffer {
  app: { id: string; slug: string; name: string };
  /** `launched`: the version people use; `in progress`: the one being made (it has not been launched). */
  version: "launched" | "in progress";
  functions: { name: string; description: string; input: Record<string, unknown>; writes: boolean; withoutAsking: boolean }[];
  /** Why some function is not offered (functions.json missing or broken; an offered function that the app no longer declares). */
  problems: string[];
}

export interface SessionFunctionsContext extends Pick<FunctionsContext, "db" | "port" | "secret"> {
  /** Where the version people use keeps its files (a launched app's folder), or null when the app has not been launched inside Hydor. */
  launchedDir(web: WebAppRow): string | null;
  /** The person sessions act as: the one signed in to Hydor. */
  who(): RunPerson;
}

/** The functions an app declares at the version sessions are given. */
function declared(c: SessionFunctionsContext, web: WebAppRow) {
  const dir = c.launchedDir(web);
  const launched = !!dir && fs.existsSync(path.join(dir, FUNCTIONS_FILE));
  return { read: readFunctions(launched ? dir! : web.folder), version: (dir ? "launched" : "in progress") as SessionOffer["version"] };
}

export function createSessionFunctions(c: SessionFunctionsContext) {
  const { db } = c;
  sessionTables(db);

  /** What each app offers sessions now (only apps that offer something). */
  function offered(): SessionOffer[] {
    const out: SessionOffer[] = [];
    for (const web of listWebApps(db)) {
      const on = sessionFns(db, web.id);
      if (!on.size) continue;
      const { read, version } = declared(c, web);
      const functions = read.fns.filter((f) => on.has(f.name)).map((f) => ({ name: f.name, description: f.description, input: f.input, writes: f.writes, withoutAsking: f.writes && on.get(f.name)!.free }));
      const gone = [...on.keys()].filter((n) => !read.fns.some((f) => f.name === n));
      const problems = [...read.problems.slice(0, 2), ...gone.map((n) => `“${n}” is switched on for sessions but the app no longer declares it.`)];
      if (functions.length || problems.length) out.push({ app: { id: web.id, slug: web.slug, name: web.name }, version, functions, problems });
    }
    return out;
  }

  /** One function that is offered to sessions, or why not (a sentence). */
  function find(web: WebAppRow, name: string): { def: FnDef; free: boolean; version: SessionOffer["version"] } | { problem: string; status: number } {
    const on = sessionFns(db, web.id).get(name);
    if (!on) return { status: 403, problem: `The function “${name}” of “${web.name}” is not offered to sessions: its owner switches it on, on the app’s Flows tab (In sessions).` };
    const { read, version } = declared(c, web);
    const def = read.fns.find((f) => f.name === name);
    if (!def) return { status: 404, problem: `The app “${web.name}” does not declare a function “${name}”${read.fns.length ? ` (it declares ${read.fns.map((f) => f.name).join(", ")})` : read.problems[0] ? `: ${read.problems[0]}` : ""}.` };
    return { def, free: on.free, version };
  }

  /** Calls it for the person the session belongs to. */
  async function call(web: WebAppRow, name: string, input: unknown, session: string, signal?: AbortSignal) {
    const found = find(web, name);
    if ("problem" in found) throw new HttpError(found.status, found.problem);
    const args = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    if (JSON.stringify(args).length > FN_LIMITS.inputChars) throw new HttpError(413, `The input is longer than ${FN_LIMITS.inputChars} characters: send less.`);
    const who = session.slice(0, 120) || "session";
    if (limiter.count(`session:${who}`, 3600_000) >= SESSION_FN_LIMITS.perSession) throw new HttpError(429, `This session has made the ${SESSION_FN_LIMITS.perSession} calls to web apps’ functions that one session may make in an hour. Say what you have.`);
    if (!limiter.take(`session-min:${who}`, SESSION_FN_LIMITS.perSessionPerMinute, 60_000)) throw new HttpError(429, `This session has made ${SESSION_FN_LIMITS.perSessionPerMinute} calls to web apps’ functions in the last minute, the most it may. Wait a little, then call again.`);
    if (!limiter.take(`web:${web.id}`, SESSION_FN_LIMITS.perAppPerMinute, 60_000)) throw new HttpError(429, `The app’s functions have been called ${SESSION_FN_LIMITS.perAppPerMinute} times in the last minute, the most Hydor lets through. Wait a little, then call again.`);
    limiter.add(`session:${who}`);
    const person = c.who();
    const r = await invokeFunction(c, web, person, found.def, args, signal);
    if (!r.ok) throw new HttpError(r.failure.status === 429 ? 429 : 502, r.text, { ended: r.ended, failure: r.failure, as: { id: person.id, name: person.name }, version: found.version });
    return { text: r.text, chars: r.chars, ms: r.ms, as: { id: person.id, name: person.name }, version: found.version, writes: found.def.writes };
  }

  return { offered, find, call };
}

export function sessionRoutes(d: Deps, fns: ReturnType<typeof createSessionFunctions>, h: { enabled: () => void; own: (req: { params: unknown }) => WebAppRow; view: (web: WebAppRow) => unknown }) {
  const { app, db } = d;
  sessionTables(db);

  app.get("/api/webapps/functions/offered", async () => {
    h.enabled();
    return { apps: fns.offered() };
  });

  app.get("/api/webapps/:id/functions", async (req) => {
    h.enabled();
    return h.view(h.own(req));
  });

  app.put("/api/webapps/:id/functions/sessions", async (req) => {
    h.enabled();
    const web = h.own(req);
    const b = (req.body ?? {}) as { allow?: unknown; free?: unknown };
    const names = b.allow === "*" ? ["*"] : Array.isArray(b.allow) && b.allow.every((x) => typeof x === "string") ? [...new Set(b.allow as string[])] : null;
    if (!names) throw new HttpError(400, 'allow is "*" (every function that only reads), or a list of the functions’ names (an empty list offers none to sessions).');
    if (b.free !== undefined && !(Array.isArray(b.free) && b.free.every((x) => typeof x === "string"))) throw new HttpError(400, "free is a list of the functions’ names that may change what the app keeps without asking the person first (they have to be offered too).");
    const free = [...new Set((b.free ?? []) as string[])];
    const read = readFunctions(web.folder);
    const unknown = names.filter((n) => n !== "*" && !read.fns.some((f) => f.name === n));
    if (unknown.length) throw new HttpError(400, `The app does not declare ${unknown.map((n) => `“${n}”`).join(", ")}${read.fns.length ? ` (it declares ${read.fns.map((f) => f.name).join(", ")})` : read.problems[0] ? `: ${read.problems[0]}` : ""}.`);
    const chosen = names.includes("*") ? read.fns.filter((f) => !f.writes).map((f) => f.name) : names;
    const notOffered = free.filter((n) => !chosen.includes(n));
    if (notOffered.length) throw new HttpError(400, `${notOffered.map((n) => `“${n}”`).join(", ")} ${notOffered.length === 1 ? "is" : "are"} in free but not offered: a function has to be offered before it can be offered without asking.`);
    const reads = free.filter((n) => !read.fns.find((f) => f.name === n)?.writes);
    if (reads.length) throw new HttpError(400, `${reads.map((n) => `“${n}”`).join(", ")} only read${reads.length === 1 ? "s" : ""}, so ${reads.length === 1 ? "it" : "they"} never ask: leave ${reads.length === 1 ? "it" : "them"} out of free.`);
    setSessionFns(db, web.id, chosen.map((n) => ({ name: n, free: free.includes(n) })));
    return h.view(web);
  });

  app.post("/api/webapps/:id/functions/:name/call", async (req) => {
    h.enabled();
    const web = h.own(req);
    const b = (req.body ?? {}) as { input?: unknown; session?: unknown };
    const out = await fns.call(web, (req.params as { name: string }).name, b.input, typeof b.session === "string" ? b.session : "", undefined);
    return out;
  });
}

