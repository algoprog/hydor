// A web app's own functions as the tools of the agents that work for it (the flows half's agents, server/apps).
//
// What the web app says: `functions.json` at its root.
//   { format: 1, app, functions: [{ name, description, input, writes, path? }] }
// `name` (lower case, digits and _), `description` (what the agent is told), `input` (a JSON Schema object: the shape of what the function
// takes) and `writes` (it changes what the app keeps).
// `path` is the address on the app that serves the function (`/api/agent-functions/<name>` when it
// is not there). The app has to serve it: Hydor sends `POST <path>` with the input as JSON, and the signed `x-hydor-person` header.
//
// What Hydor does. When a run of the linked agent app begins, and its recipe allows functions (entries `fn:<name>` or `fn:*` in its
// tools: nothing else does, and a new link allows none), Hydor reads the file (leniently: a missing or broken one means no functions,
// said on the run), starts the web app then (so a cold start is over before the first call) and holds it awake until the run ends.
// A run that acts for nobody gets none. Each function is a tool named `appfn_<name>`; a call goes to the app with the header signed
// by Hydor for the person the run acts for, so the app's own access rules decide what that person may touch, as for a click.
// The answer comes back as the tool's result (cut to a sensible size), or the app's own sentence on a refusal, and every call is a
// step of the run's page (which function, for whom, how it ended: nothing of what it returned).
import fs from "node:fs";
import path from "node:path";
import type { RunPerson } from "../../shared/apps.ts";
import { FN_ENTRY, FN_NAME, fnAllowed, fnAsks, fnOfTool, MAX_FN_NAME, recipeWantsFunctions, toolNameOf, useRunFunctions, type RunFunctions } from "../apps/appfns.ts";
import { Limiter } from "../apps/limits.ts";
import { onFinished, noteChanged } from "../apps/runs.ts";
import { getRun, listSteps, saveStep, updateRun, type RunRecord } from "../apps/store.ts";
import type { DB } from "../db.ts";
import { confirmChange } from "../guide/api.ts";
import type { RunCtx, RunTool, ToolOutput } from "../features/types.ts";
import { inputFacts, rawInput } from "./fn-facts.ts";
import { signPerson } from "./sign.ts";
import type { WebAppRow } from "./store.ts";

export const FUNCTIONS_FILE = "functions.json";

/** What a run may ask of the app's functions, and how much of an answer Hydor passes on. */
export const FN_LIMITS = {
  /** Calls one run may make in all. */
  perRun: 60,
  /** Calls one run may make in a minute. */
  perRunPerMinute: 20,
  /** Calls all the runs of one web app may make in a minute. */
  perAppPerMinute: 120,
  /** Characters of an answer passed on. */
  resultChars: 20_000,
  /** How long one call may take. */
  timeoutMs: 30_000,
  /** The most an input may hold when it is sent (characters of its JSON). */
  inputChars: 20_000,
  /** The longest a run holds the app awake, whatever it does (a run that never ends does not keep it for ever). */
  holdMs: 3 * 3600_000,
};

/** One function as Hydor reads it. */
export interface FnDef {
  name: string;
  description: string;
  input: Record<string, unknown>;
  writes: boolean;
  /** The address on the app that serves it. */
  path: string;
}

/** What the file said: the functions Hydor can offer, and each thing in the way, as a sentence. `file`: missing, broken or ok. */
export interface FunctionsRead {
  file: "ok" | "missing" | "broken";
  fns: FnDef[];
  problems: string[];
}

export const defaultPath = (name: string) => `/api/agent-functions/${name}`;
const PATH = /^\/[A-Za-z0-9_\-./~%]{0,198}$/;

/** Reads a web app's functions.json, never throwing: a missing or broken file is no functions, with the reason. */
export function readFunctions(folder: string): FunctionsRead {
  const file = path.join(folder, FUNCTIONS_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { file: "missing", fns: [], problems: [`The app has no ${FUNCTIONS_FILE} (its build writes it from src/blocks/flows/agent-functions.ts), so it offers its agents no functions. Build the app again.`] };
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { file: "broken", fns: [], problems: [`The app’s ${FUNCTIONS_FILE} cannot be read (${(e as Error).message.slice(0, 120)}), so it offers its agents no functions. Build the app again.`] };
  }
  if (!json || typeof json !== "object" || !Array.isArray(json.functions)) return { file: "broken", fns: [], problems: [`The app’s ${FUNCTIONS_FILE} has no list of functions, so it offers its agents none. Build the app again.`] };
  if (json.format !== undefined && json.format !== 1) return { file: "broken", fns: [], problems: [`The app’s ${FUNCTIONS_FILE} is in a format (${String(json.format).slice(0, 20)}) this Hydor does not read, so it offers its agents no functions.`] };
  const fns: FnDef[] = [];
  const problems: string[] = [];
  for (const raw of json.functions.slice(0, 200)) {
    const name = raw && typeof raw === "object" && typeof raw.name === "string" ? raw.name : "";
    const skip = (why: string) => problems.push(`The function “${name.slice(0, 60) || "(no name)"}” is left out: ${why}.`);
    if (!FN_NAME.test(name)) {
      skip("its name is not lower-case letters, digits and _ starting with a letter");
      continue;
    }
    if (name.length > MAX_FN_NAME) {
      skip(`its name is longer than ${MAX_FN_NAME} letters, more than agents’ tool names may hold`);
      continue;
    }
    if (fns.some((f) => f.name === name)) {
      skip("another has its name");
      continue;
    }
    if (typeof raw.description !== "string" || !raw.description.trim()) {
      skip("it has no description, which is what an agent reads to know when to call it");
      continue;
    }
    const input = raw.input;
    if (!input || typeof input !== "object" || Array.isArray(input) || input.type !== "object" || typeof input.properties !== "object" || input.properties === null) {
      skip("its input is not a JSON Schema object (type object, with properties)");
      continue;
    }
    if (JSON.stringify(input).length > 20_000) {
      skip("its input shape is longer than 20000 characters");
      continue;
    }
    if (raw.path !== undefined && (typeof raw.path !== "string" || !PATH.test(raw.path) || raw.path.includes("..") || raw.path.startsWith("//"))) {
      skip("its path is not an address on the app (it has to start with / and hold letters, digits and - _ . / only)");
      continue;
    }
    fns.push({ name, description: raw.description.trim().slice(0, 600), input, writes: raw.writes === true, path: raw.path ?? defaultPath(name) });
  }
  return { file: "ok", fns, problems };
}

// ---- what a run holds ---------------------------------------------------------------------------------------------------------

/** What the functions of one run (a top-level run: its agent steps' runs go by it) are, as they were when it began. */
interface RunFns {
  web: WebAppRow;
  /** Who the run acts for (the one Hydor proved), or none: then there are no functions. */
  person: RunPerson | null;
  fns: FnDef[];
  /** Calls made. */
  calls: number;
  /** The functions that change things which the person has said yes to in this run (they are asked once). */
  agreed?: Set<string>;
  /** Lets the app go idle again. */
  release?: () => void;
  timer?: NodeJS.Timeout;
  /** Why the app could not be started, when it could not. */
  startError?: string;
}

/** What the functions need of the server around them. */
export interface FunctionsContext {
  db: DB;
  /** The web app linked to an agent app, by the agent app's id. */
  webOf(appId: string): WebAppRow | null;
  /** The port the web app listens on, starting it if it is not running (and the sentence why not, when it cannot start). */
  port(webId: string): Promise<number>;
  /** Holds the web app awake until the returned function is called. */
  hold(webId: string): () => void;
  /** The web app's secret, which signs the header that says who is there. */
  secret(webId: string): string;
}

/** Calls in one minute, by run and by web app. */
const limiter = new Limiter(Date.now, "web-functions");
/** How many calls a run made, in all (the limit of one run): kept with the other rates, so a restart of Hydor does not start a run's count again. */
const RUN_WINDOW_MS = 7 * 24 * 3600_000;
const states = new Map<string, RunFns>();

/** What a person is called in a sentence. */
const named = (p: RunPerson) => p.name || p.id;

/** For tests: how many runs hold a web app now. */
export const heldBy = (webId: string): number => [...states.values()].filter((s) => s.web.id === webId && s.release).length;
/** For tests: forget the calls counted by the limits. */
export const forgetLimits = () => {
  for (const s of states.values()) s.calls = 0;
  limiter.clear();
};

/** The top-level run a run belongs to (an agent step's run goes by the run whose step it is). */
function topOf(db: DB, run: RunRecord): RunRecord {
  let r = run;
  for (let i = 0; i < 6 && r.parent && r.source === "step"; i++) {
    const up = getRun(db, r.parent);
    if (!up) break;
    r = up;
  }
  return r;
}

/** The run a tool call is for: its session's, or the run a tool step of a flow made it (`flow-<run>`). */
export const runOfStepCtx = (db: DB, ctx: Pick<RunCtx, "runId">): RunRecord | null => (ctx.runId.startsWith("flow-") ? getRun(db, ctx.runId.slice(5)) : null);

// ---- one call to the app, for a run and for a session ---------------------------------------------------------------------------

/** What one call to a function of the app came to: its answer (cut to a sensible size), or the sentence why not, with how it ended for the record. */
export type Invoked =
  | { ok: true; text: string; chars: number; ms: number }
  | { ok: false; text: string; ended: string; ms: number; failure: NonNullable<ToolOutput["failure"]>; extra: Record<string, unknown> };

/**
 * Calls a function of a web app as `person`: the app is started when it is not running (at the launched version when it has one, else the one being made: the context's `port`),
 * and the request carries the header Hydor signs for that person with the app's secret, so the app's own access rules decide what they may touch, as for a click.
 * A run calls it for the person it acts for, a session for the person it belongs to. `started` is told once the app answers its port.
 */
export async function invokeFunction(c: Pick<FunctionsContext, "port" | "secret">, web: Pick<WebAppRow, "id" | "name">, person: RunPerson, def: FnDef, input: Record<string, unknown>, signal?: AbortSignal, started?: () => void): Promise<Invoked> {
  const t0 = Date.now();
  const fail = (text: string, ended: string, failure: NonNullable<ToolOutput["failure"]>, extra: Record<string, unknown> = {}): Invoked => ({ ok: false, text, ended, ms: Date.now() - t0, failure, extra });
  let port: number;
  try {
    port = await c.port(web.id);
    started?.();
  } catch (e) {
    const why = String((e as Error).message ?? e).split("\n")[0].slice(0, 300);
    return fail(`The app “${web.name}” is not running and could not be started${why ? `: ${why}` : ""}.`, "app not started", { kind: "unreachable" });
  }
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}${def.path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "x-hydor-person": signPerson(person, c.secret(web.id)) },
      body: JSON.stringify(input),
      redirect: "manual",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(FN_LIMITS.timeoutMs)]) : AbortSignal.timeout(FN_LIMITS.timeoutMs),
    });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    if (err.name === "TimeoutError") return fail(`The app did not answer within ${FN_LIMITS.timeoutMs / 1000} seconds.`, "no answer in time", { kind: "timeout" });
    if (err.name === "AbortError") return fail("The call was given up on.", "given up", { kind: "dropped" });
    return fail(`The app could not be reached (${err.cause?.code ?? err.message}).`, "not reached", { kind: err.cause?.code === "ECONNREFUSED" ? "unreachable" : "dropped" });
  }
  let text = "";
  try {
    text = await res.text();
  } catch (e) {
    return fail(`The app’s answer broke off (${(e as Error).message}).`, "answer broke off", { kind: "dropped" }, { status: res.status });
  }
  if (!res.ok) {
    const said = sentenceOf(text);
    const wait = Number(res.headers.get("retry-after"));
    const sentence = res.status === 401 || res.status === 403 ? `The app refused it (${res.status})${said ? `: ${said}` : "."}` : `The app answered ${res.status}${said ? `: ${said}` : "."}`;
    return fail(sentence, `the app answered ${res.status}`, { status: res.status, ...(Number.isFinite(wait) && wait > 0 ? { waitMs: wait * 1000 } : {}) }, { status: res.status });
  }
  let out = text;
  try {
    if (/json/i.test(res.headers.get("content-type") ?? "")) out = JSON.stringify(JSON.parse(text));
  } catch {}
  if (!out.trim()) out = "The function answered with nothing.";
  const chars = out.length;
  if (chars > FN_LIMITS.resultChars) out = `${out.slice(0, FN_LIMITS.resultChars)}\n…(cut: the app’s answer is ${chars} characters, and Hydor passes on the first ${FN_LIMITS.resultChars}. Ask for less, with a narrower input.)`;
  return { ok: true, text: out, chars, ms: Date.now() - t0 };
}


/** What the app said of why it refused, in a sentence: its own `error` (or `message`), else the first line of what it said. */
function sentenceOf(body: string): string {
  const t = body.trim();
  if (!t) return "";
  try {
    const j = JSON.parse(t);
    const s = typeof j === "string" ? j : typeof j?.error === "string" ? j.error : typeof j?.message === "string" ? j.message : typeof j?.error?.message === "string" ? j.error.message : "";
    if (s) return s.trim().slice(0, 400);
  } catch {}
  if (t.startsWith("<")) return "";
  return (t.split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 300);
}

export function createFunctions(c: FunctionsContext): RunFunctions {
  const { db } = c;

  const note = (run: RunRecord, why: string): RunRecord => {
    const misses = [...(run.misses ?? [])];
    if (!misses.some((m) => m.step === "Its app’s functions" && m.why === why)) misses.push({ step: "Its app’s functions", what: "functions.json", why });
    updateRun(db, run.id, { misses: misses.slice(0, 30) });
    return getRun(db, run.id) ?? run;
  };

  /** Reads the functions and starts the app, for a top-level run: the state its calls go by. `say`: put what is wrong on the run. */
  function prepare(run: RunRecord, say: boolean): RunRecord {
    const web = c.webOf(run.app);
    if (!web || !recipeWantsFunctions(run.recipe)) return run;
    const sayIt = (why: string) => (say ? note(run, why) : run);
    if (!run.person) {
      states.set(run.id, { web, person: null, fns: [], calls: 0 });
      return sayIt("This run acts for nobody (no person started it, so it has no one to act as), so none of the app’s functions are offered to its agents: the app’s own access rules would have no one to decide for.");
    }
    const read = readFunctions(web.folder);
    const st: RunFns = { web, person: run.person, fns: read.fns, calls: 0 };
    states.set(run.id, st);
    let out = run;
    for (const p of read.problems) out = sayIt(p);
    // The app starts now, not at the first call: a cold start can outlast a tool's time limit. It is then held for the run.
    if (read.fns.length) {
      void c
        .port(web.id)
        .then(() => {
          if (states.get(run.id) === st) hold(st);
        })
        .catch((e) => void (st.startError = String((e as Error).message ?? e).split("\n")[0].slice(0, 300)));
      st.timer = setTimeout(() => release(run.id), FN_LIMITS.holdMs);
      st.timer.unref?.();
    }
    return out;
  }

  function hold(st: RunFns) {
    if (!st.release) st.release = c.hold(st.web.id);
  }

  function release(runId: string) {
    const st = states.get(runId);
    if (!st) return;
    clearTimeout(st.timer);
    st.release?.();
    st.release = undefined;
    states.delete(runId);
  }

  /** The state of a run, made now when it is not there and the run is still going (the server restarted). */
  function stateOf(top: RunRecord): RunFns | undefined {
    const have = states.get(top.id);
    if (have) return have;
    if (top.status === "done" || top.status === "failed" || top.status === "stopped") return undefined;
    prepare(top, false);
    return states.get(top.id);
  }

  // ---- a step of the run's page for each call -----------------------------------------------------------------------

  const stepOf = (top: RunRecord, def: FnDef, person: RunPerson) => {
    const n = listSteps(db, top.id).filter((s) => s.path.startsWith("fn#")).length + 1;
    const base = { run: top.id, path: `fn#${n}`, id: `fn_${def.name}`, kind: "tool", title: `Called ${def.name} for ${named(person)}`, startedAt: Date.now() };
    saveStep(db, { ...base, status: "running" });
    noteChanged(top.id);
    return (status: "done" | "failed", how: string, extra: Record<string, unknown> = {}, error?: string) => {
      saveStep(db, { ...base, status, outputs: { function: def.name, as: { id: person.id, name: person.name }, ended: how, ...extra }, ...(error ? { error: error.slice(0, 300) } : {}), endedAt: Date.now() });
      noteChanged(top.id);
    };
  };

  // ---- one call ---------------------------------------------------------------------------------------------------------

  async function call(top: RunRecord, st: RunFns, def: FnDef, args: Record<string, unknown>, ctx: RunCtx): Promise<ToolOutput> {
    const person = st.person!;
    const refuse = (text: string, ended: string): ToolOutput => {
      const end = stepOf(top, def, person);
      end("failed", ended, {}, text);
      return { text, isError: true, failure: { kind: "refused" } };
    };
    const input = args && typeof args === "object" && !Array.isArray(args) ? args : {};
    if (JSON.stringify(input).length > FN_LIMITS.inputChars) return refuse(`The input is longer than ${FN_LIMITS.inputChars} characters: send less.`, "refused: input too long");
    if (st.calls >= FN_LIMITS.perRun || limiter.count(`calls:${top.id}`, RUN_WINDOW_MS) >= FN_LIMITS.perRun) return refuse(`This run has made the ${FN_LIMITS.perRun} calls to the app’s functions that one run may make. Say what you have, or ask for more in a new run.`, "refused: calls for this run used");
    if (!limiter.take(`run:${top.id}`, FN_LIMITS.perRunPerMinute, 60_000)) return refuse(`This run has made ${FN_LIMITS.perRunPerMinute} calls to the app’s functions in the last minute, the most it may. Wait a little, then call again.`, "refused: too many a minute");
    if (!limiter.take(`web:${st.web.id}`, FN_LIMITS.perAppPerMinute, 60_000)) return refuse(`The app’s functions have been called ${FN_LIMITS.perAppPerMinute} times in the last minute by all the runs of this app, the most Hydor lets through. Wait a little, then call again.`, "refused: the app is called too often");
    // A function that changes what the app keeps asks the person on a card the first time a run calls it, unless the owner chose "without asking" for it.
    if (def.writes && fnAsks(top.recipe.tools, def.name, true) && !(st.agreed ??= new Set()).has(def.name)) {
      const no = await confirmChange(ctx, {
        title: `Let the agent change what “${st.web.name}” keeps for ${named(person)}?`,
        detail: `It wants to use the function “${def.name}” of the web app “${st.web.name}”.\n\n${def.description}\n\nIt changes what the app keeps for ${named(person)}. You are asked once for each function in a run.`,
        facts: inputFacts(def.input, input),
        raw: rawInput(input),
        level: "ask",
        label: "Allow",
      });
      if (no) return refuse(no, "not allowed by the person");
      st.agreed.add(def.name);
    }
    st.calls++;
    limiter.add(`calls:${top.id}`);
    const end = stepOf(top, def, person);
    const r = await invokeFunction(c, st.web, person, def, input, ctx.signal, () => hold(st));
    if (!r.ok) {
      st.startError = r.ended === "app not started" ? st.startError : undefined;
      end("failed", r.ended, { ms: r.ms, ...r.extra }, r.text);
      return { text: r.text, isError: true, failure: r.failure };
    }
    st.startError = undefined;
    end("done", "answered", { ms: r.ms, chars: r.chars });
    return { text: r.text };
  }

  // ---- the tools -----------------------------------------------------------------------------------------------------------

  function toolOf(top: RunRecord, st: RunFns, def: FnDef): RunTool {
    return {
      name: toolNameOf(def.name),
      description: `${def.description}${def.writes ? " This changes what the app keeps." : ""} (A function of the web app “${st.web.name}”: it acts as ${named(st.person!)}, with what that person may do in the app, and no more.)`,
      inputSchema: def.input,
      annotations: { readOnlyHint: !def.writes, openWorldHint: false },
      run: (args, ctx) => call(top, st, def, args, ctx),
    };
  }

  const functions: RunFunctions = {
    begin(run) {
      return run.source === "step" ? run : prepare(run, true);
    },
    tools(ctx, run) {
      const top = topOf(db, run);
      const st = stateOf(top);
      if (!st?.person) return [];
      return st.fns.filter((f) => fnAllowed(run.recipe.tools, f.name, f.writes)).map((f) => toolOf(top, st, f));
    },
    stepTool(run, entry) {
      const name = entry.startsWith(FN_ENTRY) ? entry.slice(FN_ENTRY.length) : entry;
      const top = topOf(db, run);
      const st = stateOf(top);
      if (!st) return { problem: `The app’s functions are not offered to this run: this app is not the flows half of a web app (or the run has ended).` };
      if (!st.person) return { problem: "This run acts for nobody, so the app’s functions are not offered to it: the app’s access rules would have no one to decide for." };
      const def = st.fns.find((f) => f.name === name);
      if (!def) return { problem: `The app’s ${FUNCTIONS_FILE} does not offer a function “${name}”${st.fns.length ? ` (it offers ${st.fns.map((f) => f.name).join(", ")})` : ""}.` };
      if (!fnAllowed(run.recipe.tools, name, def.writes)) return { problem: `The app’s tools do not allow the function “${name}”: add ${FN_ENTRY}${name}${def.writes ? "" : ` (or ${FN_ENTRY}*)`} to the agent app’s tools (PUT /api/webapps/<id>/flows/functions, or the \"tools\" list of flows/app.json).` };
      return { name: toolNameOf(name) };
    },
    allows(name, run) {
      const fn = fnOfTool(name);
      if (!fn) return false;
      const top = topOf(db, run);
      const st = stateOf(top);
      const def = st?.person ? st.fns.find((f) => f.name === fn) : undefined;
      return !!def && fnAllowed(run.recipe.tools, fn, def.writes);
    },
    end(run) {
      release(run.id);
    },
  };

  useRunFunctions(functions);
  onFinished((r) => functions.end(r));
  return functions;
}

// ---- what the maker sees and allows ----------------------------------------------------------------------------------------

/** What a web app declares and what its flows half allows, for the page and for agents. */
export interface FunctionsView {
  /** `ok`, `missing` (no functions.json: or not written yet) or `broken`. */
  file: FunctionsRead["file"];
  problems: string[];
  functions: { name: string; description: string; writes: boolean; allowed: boolean; withoutAsking: boolean; path: string; inSessions: boolean; inSessionsWithoutAsking: boolean }[];
  /** Where the maker allows them. */
  allowedIn: string;
}

export function functionsView(web: Pick<WebAppRow, "folder">, tools: readonly string[] | null, sessions: ReadonlyMap<string, { free: boolean }> = new Map()): FunctionsView {
  const read = readFunctions(web.folder);
  return {
    file: read.file,
    problems: read.problems,
    functions: read.fns.map((f) => ({ name: f.name, description: f.description, writes: f.writes, allowed: fnAllowed(tools, f.name, f.writes), withoutAsking: f.writes && fnAllowed(tools, f.name, true) && !fnAsks(tools, f.name, true), path: f.path, inSessions: sessions.has(f.name), inSessionsWithoutAsking: f.writes && sessions.get(f.name)?.free === true })),
    allowedIn: `The agent app’s tools (PUT /api/webapps/<id>/flows/functions sets them, or the "tools" list of flows/app.json by hand): "${FN_ENTRY}<name>" allows one function, "${FN_ENTRY}*" every function that only reads. A function that changes what the app keeps has to be named, and asks the person on a card the first time a run calls it unless it is named as "${FN_ENTRY}<name>!" (allowed without asking). Until then no agent is offered any. Each function also has a switch for the agents in sessions (PUT /api/webapps/<id>/functions/sessions): a session's agent then finds it with webapp_list_functions and calls it with webapp_call_function, as the person the session belongs to.`,
  };
}
