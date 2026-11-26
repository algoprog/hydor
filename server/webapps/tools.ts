// What agents get for web apps, on each session's own MCP server: webapp_new, webapp_get, webapp_run, webapp_look and the rest. They
// go through the app's own routes (/api/webapps, server/guide/api.ts `call`), so what an agent does is what the pages do and open
// pages refresh; a tool that changes something asks the person on a card first, as the app's other changing tools do
// (confirmChange: Plan mode refuses, Full access asks nothing, else a card they may allow for the session). Their names do not begin
// with anything the app sorts into file edits (shared/assistants.ts `kindByName`: write_, edit_, delete_, run_, web_…).
import path from "node:path";
import { isWebAppStage, WEBAPP_STAGES, type CheckLine, type ChooseAnswer, type FlowsOffer, type WebAppChecks, type WebAppChoice, type WebAppChoose, type WebAppDetail, type WebAppFlows, type WebAppsList, type WebAppStep, type WebAppSteps, type WebKinds } from "../../shared/webapps.ts";
import type { RunCtx, RunTool, ToolOutput } from "../features/types.ts";
import { call, confirmChange } from "../guide/api.ts";
import { fillForm } from "../guide/form.ts";
import { buildBoxSay } from "./build-box.ts";
import { readAnswer } from "./choose.ts";
import { inputFacts, rawInput } from "./fn-facts.ts";
import type { FunctionsView } from "./flows-functions.ts";
import type { SessionOffer } from "./session-fns.ts";
import { internalHeaders } from "../internal.ts";
import { keysTool } from "./key-tools.ts";
import { servicesTool } from "./services-tool.ts";
import { speakFor, technicalFor } from "./simple.ts";
import { LAUNCH_NOTE, LAUNCH_TOOL_NAMES, launchTools } from "./launch-tools.ts";

type Json = Record<string, any>;

export const WEBAPP_TOOL_NAMES = ["webapp_new", "webapp_get", "webapp_run", "webapp_look", "webapp_choose", "webapp_kinds", "webapp_steps", "webapp_add_work", "webapp_functions", "webapp_list_functions", "webapp_call_function", "webapp_contract_check", "webapp_keys", "webapp_services", ...LAUNCH_TOOL_NAMES];

/** What every agent is told of web apps (about these tools alone: Custom gets it while they are offered in full). */
export const WEBAPP_NOTE = `${[
  "Web apps (Apps → Web apps in Hydor) are apps with pages of their own, each in a folder and a project, built in any stack to a small contract (a hydor.json at the root) so that Hydor can run them: a version being changed and a launched one with data of their own, Hydor's sign-in, the keys card, backups, and Hydor's models, search vectors and mail within caps. Before you make or change one, read the web-app-builder skill (it has the stages: Brief, Design, Build, Check, Launch, Run) and its references/hydor-contract.md. webapp_new makes the folder; you write the app in it; webapp_contract_check checks it; webapp_run builds, starts and opens it; webapp_look takes a picture of a page on a phone or a computer; webapp_steps keeps each accepted change.",
  "The person who makes an app usually does not program (webapp_get says how to speak to them: follow it): put real choices on a card (webapp_choose: two or three designs as pages you wrote, or one of a few; webapp_kinds when they have not said what kind of app) instead of asking open questions or deciding alone. Outside services: when the app needs one (mail, payments, a model, search, files, a database, sign-in, maps…), call webapp_services with the need before you name or wire one. Keys: as soon as a step needs one, ask for all of that step's keys together with webapp_keys (ask: true), and never ask the person to paste a key into the chat. An agent app of the person's can be given to a web app with webapp_add_work; webapp_functions lists and allows what the web app offers agents; what was offered to sessions you find with webapp_list_functions and call with webapp_call_function, as the person, with what they may do in that app and no more.",
].join("\n")}${" "}${LAUNCH_NOTE}`;

/** The line that ends a tool's answer about an app: the pages that show the app beside the conversation read the app's id from it. */
/** The functions a person was asked about in a session, once each: by the session's key. */
const askedFor = new Map<string, Set<string>>();
const marker = (a: { id: string }) => `[web app ${a.id}]`;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const text = (t: string, isError = false): ToolOutput => (isError ? { text: t, isError: true } : { text: t });

/** One call to the app's own routes; an error answer is thrown with the app's own words. */
async function api<T = Json>(ctx: RunCtx, method: string, url: string, body?: Json): Promise<T> {
  const r = await call(ctx, method, url, body);
  if (r.status >= 400) throw new Error(String((r.json as Json | undefined)?.error ?? r.text ?? "").trim() || `The app answered ${r.status}`);
  return (r.json ?? {}) as T;
}

/**
 * The last check: the contract's lines by their ids, failed first, each with its sentence and what to do, then the pages in
 * at most a dozen lines; what was fixed since the run before is said.
 */
export function checkText(c: WebAppChecks): string {
  const mark = (l: CheckLine) => (l.state === "failed" ? "FAILED" : l.state === "notRun" ? "could not run" : "note");
  const order: Record<string, number> = { failed: 0, notRun: 1, note: 2 };
  const contract = c.lines.filter((l) => !l.group || l.group === "contract");
  const open = contract.map((l, i) => ({ l, i })).filter((x) => x.l.state !== "passed").sort((a, b) => order[a.l.state] - order[b.l.state] || a.i - b.i).map((x) => x.l);
  const passed = contract.filter((l) => l.state === "passed");
  const fixed = c.lines.filter((l) => l.fixed).map((l) => l.id);
  return [
    `${c.summary ?? (c.ok ? "Nothing failed." : "Something failed.")}${fixed.length ? ` Fixed since the run before: ${fixed.join(", ")}.` : ""}`,
    ...open.map((l) => `- ${l.id} (${l.title ?? l.id}): ${mark(l)}: ${l.text}${l.hint ? ` To do: ${l.hint}` : ""}${l.details?.length && l.state === "failed" ? ` [${l.details.slice(0, 5).join("; ")}]` : ""}`),
    ...(passed.length ? [`Passed: ${passed.map((l) => l.id).join(", ")}.`] : []),
    ...(c.pagesSummary ? [c.pagesSummary] : []),
    ...(c.signedIn ? [c.signedIn] : []),
  ].join("\n");
}

// ---- finding the app ------------------------------------------------------------------------------------------------------------

/** The app an agent means: by id, address (slug), name or folder; none given: the one in its folder, else the only one there is. */
async function findApp(ctx: RunCtx, ref: unknown): Promise<WebAppDetail> {
  const list = (await api<WebAppsList>(ctx, "GET", "/api/webapps")).apps;
  const want = typeof ref === "string" ? ref.trim() : "";
  let hit = want ? list.filter((a) => a.id === want || a.slug === want || a.name.toLowerCase() === want.toLowerCase() || a.folder === want) : [];
  if (!want) {
    const here = list.filter((a) => ctx.cwd && (path.resolve(ctx.cwd) === path.resolve(a.folder) || path.resolve(ctx.cwd).startsWith(path.resolve(a.folder) + path.sep)));
    hit = here.length ? here : list.length === 1 ? list : [];
  }
  if (hit.length > 1) throw new Error(`More than one web app fits: ${hit.map((a) => `${a.name} (${a.id})`).join(", ")}. Give its id.`);
  if (!hit.length)
    throw new Error(
      want
        ? `There is no web app “${want}”.${list.length ? ` The web apps are: ${list.map((a) => `${a.name} (${a.id})`).join(", ")}.` : " There are none yet: webapp_new makes one."}`
        : list.length
          ? `Say which web app (app: its id or name): ${list.map((a) => `${a.name} (${a.id})`).join(", ")}.`
          : "There are no web apps yet: webapp_new makes one.",
    );
  return (await api<{ app: WebAppDetail }>(ctx, "GET", `/api/webapps/${encodeURIComponent(hit[0].id)}`)).app;
}

const pageOf = (ctx: RunCtx, a: { id: string }, tab = "") => `${ctx.deps.publicBase()}/apps/web/${encodeURIComponent(a.id)}${tab ? `?tab=${tab}` : ""}`;

const seconds = (v: unknown, d: number, max: number) => {
  const n = Number(v);
  return Math.round(Math.max(1, Math.min(max, Number.isFinite(n) && v !== undefined ? n : d)) * 1000);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Where an app stands. */
async function appText(ctx: RunCtx, app: WebAppDetail, n: number): Promise<string> {
  const sh = app.shape;
  const base = `/api/webapps/${encodeURIComponent(app.id)}`;
  const [steps, checks] = await Promise.all([api<WebAppSteps>(ctx, "GET", `${base}/steps?limit=5`).catch(() => null), api<WebAppChecks>(ctx, "GET", `${base}/checks`).catch(() => null)]);
  const services = Object.entries(sh.services).filter(([, v]) => v).map(([k]) => k);
  const lines = [
    `${app.name} (id ${app.id}, address ${app.slug}), ${app.folder}`,
    `Page in Hydor: ${pageOf(ctx, app)}${app.project ? `; its project is ${app.project}` : ""}.`,
    `Stage: ${app.stage ?? "none yet"}.`,
    sh.ok
      ? `hydor.json: sign-in by ${sh.signIn === "hydor" ? "Hydor (x-hydor-person)" : "the app itself"}; ${sh.build ? "has a build" : "nothing to build"}; ${sh.dev ? "has a development command" : "the version being changed runs its production command after a build"}; ${sh.database ? `database ${sh.database.file}${sh.database.sqlite ? " (SQLite)" : ""}` : "names no database"}; ${sh.keys} key(s); services: ${services.join(", ") || "none"}.`
      : `hydor.json: ${(sh.problems ?? [sh.problem ?? "cannot be read"]).join(" ")}`,
    `Run: ${app.run.state}${app.run.lastExit ? ` (last ended: ${app.run.lastExit})` : ""}${app.run.restarts ? `, started again ${app.run.restarts} time(s)` : ""}.`,
    ...(app.mode.launched ? ["It has a launched version inside Hydor, which has data of its own; what you change is the version being changed."] : app.mode.servers?.length ? [] : ["It has not been launched."]),
    ...(app.mode.servers?.length ? [`It runs on a server of the person's own (${app.mode.servers.join(", ")}); a change reaches it only when it is launched there again.`] : []),
    `Build: ${app.build.state}${app.build.problem ? ` — ${app.build.problem}` : ""}.`,
  ];
  if (app.ai) lines.push(`Its models: it asks for ${app.ai.asks.join(", ")}; the owner has allowed ${app.ai.allowed.join(", ") || "none yet (they press Allow it on the card on its Overview: tell them, do not do it for them)"}.`);
  if (app.mail) lines.push(`Its mail: ${app.mail.state === "allowed" ? "allowed by the owner" : app.mail.state === "off" ? "turned off by the owner" : "not allowed yet (the card on its Overview)"}.`);
  if (app.build.state === "failed" && app.build.log.length) lines.push(`What the build said:\n${app.build.log.slice(-n).join("\n")}`);
  if (app.log.length) lines.push(`The server's last lines:\n${app.log.slice(-(app.run.state === "crashed" || app.run.state === "stopped" ? n : Math.min(n, 12))).join("\n")}`);
  if (app.decisions.length) lines.push(`Decided:\n${app.decisions.slice(-10).map((d) => `- ${d.stage}: ${d.what}`).join("\n")}`);
  if (steps?.steps.length) lines.push(`Steps (newest first):\n${steps.steps.map((s) => `- ${s.message}`).join("\n")}${steps.unsaved ? `\n${steps.unsaved} file(s) changed and not saved as a step.` : ""}`);
  if (checks) {
    // The contract's failures in words, the pages' by id: webapp_contract_check says more.
    const failed = checks.lines.filter((l) => l.state === "failed");
    const pages = failed.filter((l) => l.group && l.group !== "contract").map((l) => l.id);
    lines.push(checks.ran ? `Last check (${checks.ok ? "nothing failed" : "something failed"}): ${checks.summary ?? checks.problem ?? ""}${failed.filter((l) => !l.group || l.group === "contract").map((l) => `\n- ${l.id}: ${l.text}`).join("")}${pages.length ? `\n- pages: ${pages.join(", ")}` : ""}` : "The check has not been run yet (webapp_contract_check).");
  }
  lines.push(marker(app));
  return lines.join("\n");
}

const APP = { type: "string", description: "The web app: its id, its address (slug) or its name. Left out: the one whose folder you are working in, or the only one there is." };

export function webappTools(ctx: RunCtx): RunTool[] {
  const all = webappToolList(ctx);
  // An app's own steps have the functions of their own app as tools (appfn_…, server/webapps/flows-functions.ts): the session tools are for the agents in sessions.
  return ctx.step ? all.filter((t) => t.name !== "webapp_list_functions" && t.name !== "webapp_call_function") : all;
}

function webappToolList(ctx: RunCtx): RunTool[] {
  return [
    {
      name: "webapp_new",
      description:
        "Makes a new web app: an empty folder, a git repository, a project with a web developer agent, and the app's place in Hydor, for you to write (any stack, with a hydor.json as the web-app-builder skill's references/hydor-contract.md says). The person confirms on a card, and their answer comes back as this tool's result: do not ask them to confirm in text first. Not needed when the session already works in a web app's folder.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "What to call the app, as people see it." },
          folder: { type: "string", description: "Where to make it: a full path that does not exist yet. Left out: a folder of its own in Hydor's web apps folder." },
        },
        required: ["name"],
      },
      async run(a) {
        try {
          const name = String(a.name ?? "").trim().slice(0, 80);
          const declined = await confirmChange(ctx, {
            title: `Make the web app “${name}”`,
            detail: !technicalFor(ctx.deps, ctx.key) ? "A new, empty app with its own place on the Apps page. The agent builds it from there." : [a.folder ? `In ${a.folder}.` : "In a folder of its own in Hydor's web apps folder.", "An empty folder with a git repository, which becomes a project with its own agent. You write the app in it; Hydor runs it once its hydor.json says how."].join("\n"),
            level: "confirm",
            label: "Make it",
          });
          if (declined) return text(declined, true);
          const made = await api<{ app: WebAppDetail; folder: string }>(ctx, "POST", "/api/webapps/scratch", { name, ...(a.folder ? { folder: a.folder } : {}) });
          return text([`Made “${made.app.name}” (web app id ${made.app.id}${made.app.project ? `, project ${made.app.project}` : ""}) in ${made.folder}.`, `Its page in Hydor: ${pageOf(ctx, made.app)}.`, "Next: read the web-app-builder skill, write the app and its hydor.json in that folder, then check it with webapp_contract_check and look at it with webapp_look.", marker(made.app)].join("\n"));
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_get",
      description:
        "Where a web app stands: its stage and what was decided, what its hydor.json says, whether it is built and running, what its build and its server last said, what is wrong with it, its steps and its last check. With no app, lists the web apps. Read it before you change an app and after.",
      inputSchema: {
        type: "object",
        properties: { app: APP, log: { type: "number", description: "How many of the last lines of the server's log and of the build to show (default 25, at most 200)." } },
      },
      annotations: { readOnlyHint: true },
      async run(a) {
        try {
          const n = Math.max(1, Math.min(200, Number(a.log) || 25));
          if (!a.app) {
            const list = (await api<WebAppsList>(ctx, "GET", "/api/webapps")).apps;
            const here = list.filter((x) => ctx.cwd && path.resolve(ctx.cwd).startsWith(path.resolve(x.folder)));
            if (!here.length && list.length !== 1) return text(list.length ? `Web apps:\n${list.map((x) => `- ${x.name} (id ${x.id}): ${x.stage ?? "no stage"}, ${x.run.state}; ${x.folder}`).join("\n")}` : "There are no web apps yet: webapp_new makes one.");
          }
          const app = await findApp(ctx, a.app);
          return text(`${await appText(ctx, app, n)}\n${speakFor(ctx.deps, ctx.key)}`);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_run",
      description:
        "Builds, starts, stops or opens a web app. build: builds it (a minute or so; waits for the end and returns what the build said; a build, and its installs, run in a sandbox that reaches only the app's folder and its package registry, so one that downloads from anywhere else fails: bring such files in as packages); start and stop: its server in Hydor (it also starts by itself when someone opens it, and stops after a while with nobody using it); open: starts it and gives the address to hand to the person (its page in Hydor, whose Preview shows it live as a phone or a computer, with a button to open it in a tab of its own). Build after changing its code (an app with a development command shows changes without one), then open or look.",
      inputSchema: {
        type: "object",
        properties: {
          app: APP,
          action: { type: "string", enum: ["build", "start", "stop", "open"] },
          wait: { type: "number", description: "For build: seconds to wait for the end (default 180, at most 900)." },
        },
        required: ["action"],
      },
      async run(a) {
        try {
          const app = await findApp(ctx, a.app);
          const id = encodeURIComponent(app.id);
          const word = (d: WebAppDetail) => `${d.name}: ${d.run.state}, build ${d.build.state}.`;
          if (a.action === "build") {
            await api(ctx, "POST", `/api/webapps/${id}/build`);
            const end = Date.now() + seconds(a.wait, 180, 900);
            let d = app;
            do {
              await sleep(1000);
              d = (await api<{ app: WebAppDetail }>(ctx, "GET", `/api/webapps/${id}`)).app;
            } while (d.build.state === "building" && Date.now() < end && !ctx.signal?.aborted);
            const tail = `${buildBoxSay(d.build.box)}\n${d.build.log.slice(-25).join("\n")}`;
            if (d.build.state === "building") return text(`The build is still going after the wait; ask again with webapp_get.\n${tail}\n${marker(d)}`);
            return d.build.state === "built" ? text(`Built. ${word(d)}\n${tail}\n${marker(d)}`) : text(`The build ${d.build.state === "failed" ? "failed" : "did not make a server"}: ${d.build.problem ?? ""}\n${tail}\n${marker(d)}`, true);
          }
          if (a.action === "start" || a.action === "open") {
            const d = (await api<{ app: WebAppDetail }>(ctx, "POST", `/api/webapps/${id}/start`)).app;
            if (a.action === "start") return text(`Started. ${word(d)}\n${marker(d)}`);
            return text(`It is running (${word(d)})\nGive the person this address: ${pageOf(ctx, d, "preview")} (its Preview shows the app live as a phone or a computer; “Open in a new tab” opens it on its own, signed in as them).\n${marker(d)}`);
          }
          if (a.action === "stop") {
            const d = (await api<{ app: WebAppDetail }>(ctx, "POST", `/api/webapps/${id}/stop`)).app;
            return text(`Stopped. ${word(d)}\n${marker(d)}`);
          }
          return text("action is build, start, stop or open.", true);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_look",
      description:
        "A picture of a page of the running web app, so you see what you built: as the signed-in person (the default) or as a named person with a role (owner, admin, member or guest, when Hydor signs people in), on a phone or a computer, dark (the default) or light. Each picture is kept and has an id, which webapp_choose takes for the picture of an option (shape one). The app is started when it is not running; it has to be built unless it has a development command. Look at each page you change on both a phone and a computer, before you say it is done.",
      inputSchema: {
        type: "object",
        properties: {
          app: APP,
          path: { type: "string", description: "A path in the app, starting with a slash (default /)." },
          as: { description: "Who looks: a role (owner, admin, member, guest) or { name, role }. Left out: the signed-in person.", oneOf: [{ type: "string" }, { type: "object", properties: { name: { type: "string" }, role: { type: "string", enum: ["owner", "admin", "member", "guest"] } } }] },
          device: { type: "string", enum: ["phone", "desktop"], description: "Phone (390 wide) or desktop (1280 wide); default desktop." },
          scheme: { type: "string", enum: ["dark", "light"], description: "The colour scheme the page is told the device prefers (default dark)." },
        },
      },
      annotations: { readOnlyHint: true },
      async run(a): Promise<ToolOutput> {
        try {
          const app = await findApp(ctx, a.app);
          const body = { ...(a.path ? { path: a.path } : {}), ...(a.as ? { as: a.as } : {}), ...(a.device ? { device: a.device } : {}), ...(a.scheme ? { scheme: a.scheme } : {}) };
          const res = await ctx.deps.app.inject({ method: "POST", url: `/api/webapps/${encodeURIComponent(app.id)}/shot`, payload: JSON.stringify(body), headers: { ...internalHeaders(), "content-type": "application/json" } });
          if (res.statusCode >= 400) {
            let msg = res.body;
            try {
              msg = JSON.parse(res.body).error ?? msg;
            } catch {}
            return text(String(msg), true);
          }
          const who = a.as ? (typeof a.as === "string" ? `a ${a.as}` : `${(a.as as Json).name ?? "a test person"}`) : "the signed-in person";
          const pid = String(res.headers["x-picture"] ?? "");
          return { text: `${app.name}, ${a.path || "/"} as ${who}, ${a.device === "phone" ? "on a phone" : "on a computer"}, ${a.scheme === "light" ? "light" : "dark"} (${res.headers["x-shot-size"] ?? ""}).${pid ? ` Picture id ${pid}: webapp_choose takes it for the picture of an option.` : ""}\n${marker(app)}`, images: [{ data: res.rawPayload.toString("base64"), mimeType: "image/png" }] };
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_choose",
      description: [
        "Puts real options to the person who makes the app on a card in the conversation and WAITS for their answer (as ask_form does), instead of asking an open question or deciding for them. The answer is kept in Hydor as a decision.",
        "shape \"designs\": two or three directions for how the app looks, side by side. First write each as a small static page of the app's own first screen in its folder (design/calm.html…: one file each, inline CSS, made-up content, following prefers-color-scheme, fine at phone width; not three apps), then give designs: [{ id, name, line (what it is), page: \"design/calm.html\" }]. Hydor takes the pictures (computer and phone, dark and light) and the person picks one and may say what to take from another.",
        "shape \"one\": one of a few real choices, with pictures or without ({ options: [{ id, title, line, picture, url }] (2 to 6), other: true lets them write their own }; a picture is an id webapp_look gave).",
        "The card always has “You decide” too: do not offer that as an option of your own.",
        "Always: stage (brief, design, build or check), title, message (optional), submit (the button's words, optional), app (default: the app you work in). Returns { choice, status, answer, summary }. If they have not answered when your time is up the card stays open and their answer reaches you as their next message, ALREADY RECORDED: end your turn; when it comes, carry on from it.",
      ].join(" "),
      inputSchema: {
        type: "object",
        properties: {
          app: APP,
          shape: { type: "string", enum: ["designs", "one"] },
          stage: { type: "string", enum: [...WEBAPP_STAGES] },
          title: { type: "string", description: "What they are picking, as the card's title (“How should it look?”)." },
          message: { type: "string", description: "A line or two above the options." },
          submit: { type: "string", description: "The button's words." },
          designs: { type: "array", items: { type: "object" }, description: "designs: each { id, name, line, page (an HTML file in the app's folder) }." },
          options: { type: "array", items: { type: "object" }, description: "one: each { id, title, line?, picture?, url? }." },
          other: { type: "boolean", description: "one: they may write an answer of their own." },
        },
        required: ["shape", "title"],
      },
      async run(a) {
        try {
          const app = await findApp(ctx, a.app);
          const base = `/api/webapps/${encodeURIComponent(app.id)}`;
          const { choose } = await api<{ choose: WebAppChoose }>(ctx, "POST", `${base}/choices`, { shape: a.shape, stage: a.stage, title: a.title, message: a.message, submit: a.submit, designs: a.designs, options: a.options, other: a.other });
          const r = await fillForm(ctx, {
            title: choose.title,
            message: choose.message,
            schema: { properties: { answer: { type: "string", title: "Answer" } }, required: ["answer"] },
            submit: choose.submit,
            stand: true,
            card: { choose },
            validate: (c) => {
              const x = readAnswer(choose, c.answer);
              return x.ok ? null : x.error;
            },
          });
          if (!r.ok) {
            const why = r.why;
            if (why === "standing")
              return text(JSON.stringify({ choice: choose.id, app: app.id, status: "standing", said: "They have not answered yet. The card stays open in the conversation and their answer will reach you as their next message, already recorded: end your turn now, saying in a line that you will go on when they have picked." }, null, 1));
            if (why === "declined") return text(JSON.stringify({ choice: choose.id, app: app.id, status: "declined", said: "They closed the card without picking. Go on with your best assumption and say what it is, or ask in words if you cannot." }, null, 1));
            return text(why === "nobody" ? "Nobody can answer a card now (the session is not running in the app): ask in your reply instead." : why === "timeout" ? "They did not answer in time and the card was withdrawn. Ask in your reply instead." : "The card was withdrawn before they answered.", true);
          }
          const given = readAnswer(choose, r.content.answer);
          if (!given.ok) return text(given.error, true);
          const rec = await api<{ choice: WebAppChoice }>(ctx, "POST", `${base}/choices/${encodeURIComponent(choose.id)}/answer`, { answer: given.answer });
          const left = (rec.choice.answer as ChooseAnswer).youDecide ? { said: "They left it to you: pick what suits them best, say which in a line and go on." } : {};
          return text(JSON.stringify({ choice: choose.id, app: app.id, status: "answered", answer: rec.choice.answer as ChooseAnswer, summary: rec.choice.summary, ...left }, null, 1));
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_kinds",
      description:
        "Shows the person the ideas for a web app as a card to pick from (the same as the Apps page's “What do you want to make?”), when they ask for an app and have not said what kind, or you cannot tell. suggest: ids that fit best, shown first. Skip it when it is clear. Their pick comes back as this tool's result or, when they take long, as their next message; then give the sketch (app_sketch with kind \"web\").",
      inputSchema: {
        type: "object",
        properties: { suggest: { type: "array", items: { type: "string" }, description: "Ids that fit what they said, best first (at most three)." } },
      },
      annotations: { readOnlyHint: true },
      async run(a) {
        try {
          const kinds = await api<WebKinds>(ctx, "GET", "/api/webapps/kinds");
          const suggest = (Array.isArray(a.suggest) ? a.suggest : []).map(String).filter((n) => kinds.kinds.some((k) => k.id === n)).slice(0, 3);
          const r = await fillForm(ctx, {
            title: "What kind of app is it?",
            message: "Pick the closest. It is only an idea to start from: everything can be changed.",
            schema: { properties: { kind: { type: "string", title: "Kind" } }, required: ["kind"] },
            submit: "Use this kind",
            stand: true,
            card: { kinds: { ...kinds, ...(suggest.length ? { suggest } : {}) } },
            validate: (c) => {
              const k = String(c.kind ?? "");
              return k === "other" || k === "you" || kinds.kinds.some((x) => x.id === k) ? null : "There is no such kind.";
            },
          });
          if (!r.ok) {
            if (r.why === "standing") return text(JSON.stringify({ status: "standing", said: "They have not picked yet. The card stays open in the conversation and their pick will reach you as their next message: end your turn now, saying in a line that you will go on when they have picked." }, null, 1));
            if (r.why === "declined") return text(JSON.stringify({ status: "declined", said: "They closed the card without picking. Go on with your best guess of the kind and say what it is, or ask in words if you cannot." }, null, 1));
            return text(r.why === "nobody" ? "Nobody can answer a card now (the session is not running in the app): ask in your reply instead." : r.why === "timeout" ? "They did not answer in time and the card was withdrawn. Ask in your reply instead." : "The card was withdrawn before they answered.", true);
          }
          if (r.content.kind === "you") return text(JSON.stringify({ status: "answered", kind: "yours to decide", said: "They left it to you: pick the kind that fits what they said, say which in a line, then give the sketch." }, null, 1));
          const picked = kinds.kinds.find((x) => x.id === String(r.content.kind ?? ""));
          if (!picked) return text(JSON.stringify({ status: "answered", kind: "other", said: "It is something else: ask what they have in mind in a line if you cannot tell, then give the sketch." }, null, 1));
          return text(JSON.stringify({ status: "answered", kind: picked.name, id: picked.id, needs: picked.needs, said: `They picked “${picked.name}”: go on with the sketch (app_sketch with kind "web", type "${picked.id}").${picked.builder ? ` ${picked.builder}` : ""}` }, null, 1));
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_steps",
      description:
        "An app's steps: its folder is a git repository of its own, and each accepted change is one step with words that say what changed for the person who makes it (“Added team invitations”). list: the steps, newest first, and what is changed and not in a step yet. save: keeps what changed as a step (message: in plain words, what changed for them; stage: the stage the app is at now, which the app's page shows): do it after each change they accepted, never in the middle of a half-made one. doing: only says what you are making (doing), for the person's progress strip: say it as you start each part. back: returns the app's files to as they were before a step (step: its id from list) after the person says yes on a card; the later steps stay in the list, so it can itself be undone, and the app is built again.",
      inputSchema: {
        type: "object",
        properties: {
          app: APP,
          action: { type: "string", enum: ["list", "save", "back", "doing"] },
          message: { type: "string", description: "save: what changed, in a few plain words, as the person would say it." },
          doing: { type: "string", description: "What you are making now, a few plain words the person's progress strip shows (“Making the list of customers”). With save, or alone with action doing." },
          name: { type: "string", description: "A name you suggest for the app, taken only while it has none of the person's own." },
          stage: { type: "string", enum: [...WEBAPP_STAGES], description: "save: the stage the app is at now." },
          step: { type: "string", description: "back: the step to go back to before (its id from list, at least 7 characters)." },
          limit: { type: "number", description: "list: how many (default 15, at most 100)." },
        },
        required: ["action"],
      },
      async run(a) {
        try {
          const app = await findApp(ctx, a.app);
          const base = `/api/webapps/${encodeURIComponent(app.id)}`;
          const words = (x: WebAppStep) => `${x.sha.slice(0, 7)}  ${new Date(x.at).toISOString().slice(0, 16).replace("T", " ")}  ${x.message}${x.files ? ` (${x.files} ${x.files === 1 ? "file" : "files"})` : ""}`;
          if (a.action === "list") {
            const r = await api<WebAppSteps>(ctx, "GET", `${base}/steps?limit=${Math.max(1, Math.min(100, Number(a.limit) || 15))}`);
            if (!r.repo) return text(`${app.name}'s folder is not a git repository yet: webapp_steps save makes it one.\n${marker(app)}`);
            return text(`${r.steps.length ? r.steps.map(words).join("\n") : "No steps yet."}${r.unsaved ? `\n${r.unsaved} changed ${r.unsaved === 1 ? "file is" : "files are"} not in a step yet.` : ""}\n${marker(app)}`);
          }
          // What the person's progress strip says, and a name for an app that has none yet: neither changes the app.
          const guide = typeof a.doing === "string" || typeof a.name === "string" ? { ...(typeof a.doing === "string" ? { doing: a.doing } : {}), ...(typeof a.name === "string" ? { name: a.name } : {}) } : null;
          if (guide) await api(ctx, "PUT", `${base}/guide`, guide);
          if (a.action === "doing") return text(`Noted.\n${marker(app)}`);
          if (a.action === "save") {
            if (a.stage !== undefined && !isWebAppStage(a.stage)) return text(`stage is one of ${WEBAPP_STAGES.join(", ")}.`, true);
            const r = await api<{ step: WebAppStep | null }>(ctx, "POST", `${base}/steps`, { message: a.message, ...(a.stage ? { stage: a.stage } : {}) });
            return text(`${r.step ? `Kept as a step: ${words(r.step)}` : "Nothing had changed, so there is no new step."}\n${marker(app)}`);
          }
          if (a.action === "back") {
            const list = await api<WebAppSteps>(ctx, "GET", `${base}/steps?limit=100`);
            const id = String(a.step ?? "");
            const at = list.steps.findIndex((x) => id.length >= 7 && x.sha.startsWith(id));
            if (at < 0) return text("Say which step to go back to before (step: its id from webapp_steps list).", true);
            const from = list.steps[at];
            const declined = await confirmChange(ctx, {
              title: `Take “${app.name}” back to before “${from.message.slice(0, 80)}”`,
              detail: !technicalFor(ctx.deps, ctx.key) ? "The app goes back to how it was before this change. What people saved in it stays, and you can undo this too." : [
                `Its files go back to how they were before this step${at > 0 ? ` (that also undoes the ${at} step${at === 1 ? "" : "s"} after it)` : ""}.`,
                "The steps after it stay in the list, so this can itself be undone, and the app is built again.",
                list.unsaved ? `${list.unsaved} files changed since the last step are kept as a step first.` : "",
              ].filter(Boolean).join("\n"),
              level: "confirm",
              label: "Go back",
            });
            if (declined) return text(declined, true);
            const r = await api<{ went: { from: WebAppStep; to: WebAppStep; step: WebAppStep | null; saved: WebAppStep | null } }>(ctx, "POST", `${base}/steps/${encodeURIComponent(from.sha)}/back`);
            return text(`Went back to before “${r.went.from.message}”.${r.went.saved ? ` What was not saved is kept as “${r.went.saved.message}”.` : ""}${r.went.step ? ` Recorded as a step: ${words(r.went.step)}.` : " The files were already like that."} The app is being built again: webapp_run build waits for it.\n${marker(app)}`);
          }
          return text("action is list, save, back or doing.", true);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_add_work",
      description:
        "Adds agents' work to a web app (its Flows half): a small starting recipe (one question, one agent step, at most $0.50 a run), or one of the user's agent apps that is free (app), linked to the web app through its flows folder. The web app's pages start the work and follow it with its own key (the contract page's section on an agent app with pages of its own). The agent app keeps its address, keys and schedules and still runs in sessions. It changes things, so it asks the person on a card first. Without confirm it lists what could be linked.",
      inputSchema: {
        type: "object",
        properties: {
          webapp: APP,
          with: { type: "string", description: "An agent app to link: its id, address or name. Left out: a new app is made from the starting recipe." },
          confirm: { type: "boolean", description: "true to do it; left out, it lists what could be linked." },
        },
      },
      async run(a) {
        try {
          const app = await findApp(ctx, a.webapp);
          const id = encodeURIComponent(app.id);
          const offer = await api<FlowsOffer>(ctx, "GET", `/api/webapps/${id}/flows/offer`);
          if (offer.problem) return text(offer.problem, true);
          if (a.confirm !== true)
            return text(`Agents' work could be added to “${app.name}”: a starting recipe (${offer.starting.description}), or one of: ${offer.apps.map((x) => `${x.name} (${x.id})`).join(", ") || "no free agent app"}.\nCall webapp_add_work again with confirm: true${offer.apps.length ? ", and with to link one of them" : ""}.\n${marker(app)}`);
          const want = typeof a.with === "string" ? a.with.trim() : "";
          const pick = want ? offer.apps.find((x) => x.id === want || x.slug === want || x.name.toLowerCase() === want.toLowerCase()) : null;
          if (want && !pick) return text(`“${want}” is not a free agent app of yours. They are: ${offer.apps.map((x) => `${x.name} (${x.id})`).join(", ") || "none"}.`, true);
          const declined = await confirmChange(ctx, {
            title: `Add agents' work to “${app.name}”?`,
            detail: pick ? `The agent app “${pick.name}” becomes the work of “${app.name}”: its definition moves into the web app's flows folder, and the web app is restarted. “${pick.name}” keeps its address, keys and schedules.` : `A small agent app is made for “${app.name}” (one question, one agent step, at most $0.50 a run) and linked to it, and the web app is restarted.`,
            level: "confirm",
            label: "Add it",
          });
          if (declined) return text(declined, true);
          const r = await api<{ app: WebAppDetail; flows: WebAppFlows; created: boolean; from: string }>(ctx, "POST", `/api/webapps/${id}/flows`, pick ? { app: pick.id } : {});
          return text(`Added: “${r.flows.app.name}” is the work of “${app.name}”${r.created ? " (made now)" : ""}. Its flows folder holds the definition. The web app's Flows tab shows it: ${pageOf(ctx, app, "flows")}\n${marker(app)}`);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_functions",
      description:
        "Lists the functions a web app offers (what its pages' own code lets agents do: find a person's rows, write a note), each with what it does and whether it changes what the app keeps, and where each may be used now: by the agents that work for the app (its own flows) and by agents in sessions (webapp_list_functions finds them, webapp_call_function calls them as the person). Nothing is allowed until the owner allows it. allow: the names to allow to the app's own agents (an empty list allows none; \"*\" allows every one that only reads); without_asking: of those, the ones that change things and may do so without asking the person first (otherwise a function that changes things asks the person on a card the first time an agent calls it in a run). in_sessions: the same for agents in sessions, a list of names or \"*\"; in_sessions_without_asking: of those, the ones that change things and need not ask the person. Allowing changes things, so it asks the person on a card first. Without allow or in_sessions it only lists.",
      inputSchema: {
        type: "object",
        properties: {
          webapp: APP,
          allow: { description: "The functions' names to allow to the app's own agents, a list, or \"*\" for every one that only reads. An empty list allows none." },
          without_asking: { type: "array", items: { type: "string" }, description: "Of those allowed, the ones that change things and need not ask the person." },
          in_sessions: { description: "The functions' names to offer to agents in sessions, a list, or \"*\" for every one that only reads. An empty list offers none." },
          in_sessions_without_asking: { type: "array", items: { type: "string" }, description: "Of those offered to sessions, the ones that change things and need not ask the person." },
        },
      },
      async run(a) {
        try {
          const app = await findApp(ctx, a.webapp);
          const id = encodeURIComponent(app.id);
          const view = await api<FunctionsView>(ctx, "GET", `/api/webapps/${id}/functions`);
          // Where each is switched on: for its own agents (as the tool always said it) and, after it, for agents in sessions.
          const where = (f: FunctionsView["functions"][number]) => {
            const own = f.writes ? (f.allowed ? (f.withoutAsking ? "allowed without asking" : "allowed, asks the person first") : "off") : f.allowed ? "allowed" : "off";
            const ses = f.inSessions ? (f.writes ? (f.inSessionsWithoutAsking ? "in sessions without asking" : "in sessions, asks the person first") : "in sessions") : "";
            return [own, ses].filter(Boolean).join(", ");
          };
          const lines = view.functions.map((f) => `- ${f.name} (${f.writes ? "changes things" : "only reads"}, ${where(f)}): ${f.description}`).join("\n");
          const head = view.file === "ok" ? (view.functions.length ? lines : "The app offers no functions.") : view.problems.join(" ");
          if (a.allow === undefined && a.in_sessions === undefined) return text(`${app.name}: ${head}\n${marker(app)}`);
          const names = (v: unknown) => (v === "*" ? "*" : Array.isArray(v) ? v.map(String) : null);
          const allow = a.allow === undefined ? undefined : names(a.allow);
          const sessions = a.in_sessions === undefined ? undefined : names(a.in_sessions);
          if (allow === null || sessions === null) return text('allow and in_sessions are lists of the functions’ names, or "*".', true);
          const say = (v: string[] | "*") => (v === "*" ? "every function that only reads" : v.length ? v.join(", ") : "none of its functions");
          if (allow !== undefined) {
            const declined = await confirmChange(ctx, {
              title: `Let the agents of “${app.name}” use ${say(allow)}?`,
              detail: `${allow === "*" ? "All the functions that only read" : allow.length ? allow.join(", ") : "No function"} would be offered to the agents that work for “${app.name}”. Each acts for the person a run is for, with what that person may do in the app, and no more.${Array.isArray(a.without_asking) && a.without_asking.length ? ` ${a.without_asking.join(", ")} may change what the app keeps without asking the person first.` : " A function that changes things asks the person on a card the first time a run calls it."}`,
              level: "confirm",
              label: "Allow",
            });
            if (declined) return text(declined, true);
            await api<FunctionsView>(ctx, "PUT", `/api/webapps/${id}/flows/functions`, { allow, ...(Array.isArray(a.without_asking) ? { free: a.without_asking.map(String) } : {}) });
          }
          if (sessions !== undefined) {
            const free = Array.isArray(a.in_sessions_without_asking) ? a.in_sessions_without_asking.map(String) : [];
            const declined = await confirmChange(ctx, {
              title: `Let agents in your sessions use ${say(sessions)} of “${app.name}”?`,
              detail: `${sessions === "*" ? "All the functions that only read" : sessions.length ? sessions.join(", ") : "No function"} would be offered to agents in your sessions. They act as you, with what you may do in “${app.name}”, and no more.${free.length ? ` ${free.join(", ")} may change what the app keeps without asking you first.` : " A function that changes things asks you on a card the first time a session calls it."}`,
              level: "confirm",
              label: "Allow",
            });
            if (declined) return text(declined, true);
            await api<FunctionsView>(ctx, "PUT", `/api/webapps/${id}/functions/sessions`, { allow: sessions, free });
          }
          const r = await api<FunctionsView>(ctx, "GET", `/api/webapps/${id}/functions`);
          return text(`Saved.\n${r.functions.map((f) => `- ${f.name}: ${where(f)}`).join("\n") || "The app offers no functions."}\n${marker(app)}`);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_list_functions",
      description:
        "Lists the functions of the person's web apps that they offered to agents in their sessions, by app: each with its name, what it does, the shape of its input and whether it changes what the app keeps. Nothing is here until the person switches a function on (the app's Flows tab, In sessions, or you with webapp_functions on a card). Call one with webapp_call_function: you act as the person, with what they may do in that app and no more. The app is called at the version people use (the launched one, else the one being made).",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async run() {
        try {
          const { apps } = await api<{ apps: SessionOffer[] }>(ctx, "GET", "/api/webapps/functions/offered");
          if (!apps.length) return text("No web app offers its functions to sessions. The person switches them on, per function, on the app's Flows tab (In sessions).");
          return text(
            apps
              .map((o) => {
                const fns = o.functions.map((f) => `  - ${f.name} (${f.writes ? (f.withoutAsking ? "changes things, no card" : "changes things, asks the person on a card the first time") : "only reads"}): ${f.description}\n    input: ${JSON.stringify(f.input)}`);
                return `${o.app.name} (${o.app.slug}, ${o.version === "launched" ? "launched version" : "the version being made"}):\n${[...fns, ...o.problems.map((p) => `  ! ${p}`)].join("\n")}`;
              })
              .join("\n\n"),
          );
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_call_function",
      description:
        "Calls one of the functions a web app offers to sessions (see webapp_list_functions), as the person this session belongs to: the app's own access rules decide what they may touch, as for a click on its pages, and nothing of other people's. The input is what the function's input shape says. A function that changes what the app keeps asks the person on a card the first time you call it in this session, unless they chose 'without asking' for it. The answer is the app's own, cut to a sensible size; a refusal is the app's own sentence. The call shows in the session as a step.",
      inputSchema: {
        type: "object",
        properties: {
          webapp: { type: "string", description: "The web app: its id, address (slug) or name, as webapp_list_functions says." },
          function: { type: "string", description: "The function's name." },
          input: { type: "object", description: "The function's input, as its shape says." },
        },
        required: ["webapp", "function"],
      },
      async run(a) {
        try {
          const { apps } = await api<{ apps: SessionOffer[] }>(ctx, "GET", "/api/webapps/functions/offered");
          const want = String(a.webapp ?? "").trim().toLowerCase();
          const hit = apps.filter((o) => o.app.id === a.webapp || o.app.slug.toLowerCase() === want || o.app.name.toLowerCase() === want);
          if (hit.length !== 1) return text(hit.length ? `More than one web app fits “${a.webapp}”: give its id.` : apps.length ? `No web app “${a.webapp}” offers functions to sessions. Those that do: ${apps.map((o) => `${o.app.name} (${o.app.slug})`).join(", ")}.` : "No web app offers its functions to sessions: the person switches them on, per function, on the app's Flows tab (In sessions).", true);
          const o = hit[0];
          const fn = o.functions.find((f) => f.name === a.function);
          if (!fn) return text(`“${o.app.name}” does not offer a function “${a.function}” to sessions${o.functions.length ? ` (it offers ${o.functions.map((f) => f.name).join(", ")})` : ""}.`, true);
          const input = a.input && typeof a.input === "object" && !Array.isArray(a.input) ? (a.input as Json) : {};
          if (fn.writes && !fn.withoutAsking) {
            const asked = (askedFor.get(ctx.key) ?? new Set<string>());
            askedFor.set(ctx.key, asked);
            const k = `${o.app.id}:${fn.name}`;
            if (!asked.has(k)) {
              const declined = await confirmChange(ctx, {
                title: `Let the agent change what “${o.app.name}” keeps for you?`,
                detail: `It wants to use the function “${fn.name}” of the web app “${o.app.name}”.\n\n${fn.description}\n\nIt changes what the app keeps for you. You are asked once for each function in a session.`,
                facts: inputFacts(fn.input, input),
                raw: rawInput(input),
                level: "ask",
                label: "Allow",
              });
              if (declined) return text(declined, true);
              asked.add(k);
            }
          }
          const r = await api<{ text: string; chars: number; ms: number; as: { name: string }; version: string }>(ctx, "POST", `/api/webapps/${encodeURIComponent(o.app.id)}/functions/${encodeURIComponent(fn.name)}/call`, { input, session: ctx.key });
          return text(`Called ${fn.name} of ${o.app.name} as ${r.as.name} (${r.version === "launched" ? "launched version" : "the version being made"}): answered in ${r.ms} ms.\n${r.text}\n${marker(o.app)}`);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_contract_check",
      description:
        "Checks a web app against its hydor.json, on a throwaway copy with made-up keys and a stand-in for Hydor's services (the app in the sandbox, its build as a build): it builds, starts and answers ready in 30 s, listens where env.host says, lets in only whom Hydor says (signIn hydor), keeps keys from the browser, asks each service as Hydor takes it (give each a `try`), passes its smoke test, stops when asked, keeps its data across a restart and writes nowhere else. Then it looks at its pages in a browser, forms posted too: phone layout, reading, weight, safety and broken things, in at most a dozen lines. Signed-in pages need signIn hydor or hydor.json's `accounts`. A launch runs the same; of the pages only a key in a page, a form another site can post to, an unprotected sign-in cookie and a server error stop it. Fix every failed line and run it again; then use the app yourself with webapp_look on a phone.",
      inputSchema: { type: "object", properties: { app: APP, wait: { type: "number", description: "Seconds to wait for it to end (default 600, at most 900)." } } },
      async run(a) {
        try {
          const app = await findApp(ctx, a.app);
          const id = encodeURIComponent(app.id);
          const before = Date.now();
          // A check Hydor started by itself after a build may be going: wait for it, then check what is there now.
          const give = Date.now() + seconds(a.wait, 600, 900);
          for (;;) {
            try {
              await api(ctx, "POST", `/api/webapps/${id}/check`);
              break;
            } catch (e) {
              if (!/running already/.test((e as Error).message) || Date.now() >= give || ctx.signal?.aborted) throw e;
              await sleep(1500);
            }
          }
          const end = Date.now() + seconds(a.wait, 600, 900);
          let c: WebAppChecks;
          for (;;) {
            await sleep(700);
            c = await api<WebAppChecks>(ctx, "GET", `/api/webapps/${id}/checks`);
            if (!c.running || Date.now() >= end || ctx.signal?.aborted) break;
          }
          if (c.running) return text(`Still running (${c.running.step}): webapp_get shows its lines when it ends.\n${marker(app)}`);
          if (c.problem || !c.ran || (c.at ?? 0) < before) return text(`${c.problem ?? "The check did not run."}\n${marker(app)}`, true);
          return text(`${checkText(c)}\n${marker(app)}`, !c.ok);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    keysTool({ api, findApp, text, marker }, APP),
    servicesTool({ api, findApp, text, marker }, APP),
    ...launchTools(ctx, { api, findApp, text, marker, pageOf }),
  ];
}
