// Web apps: apps with pages of their own, built by an agent in any stack to the contract (a hydor.json at their root). Each lives
// in a folder of its own; Hydor keeps it running on this computer (host.ts), says who is there (sign.ts) and serves it from an
// origin apart from its own (proxy.ts, a server on its own port). Everything reads one shape of an app (shape.ts). Here: the table
// of the apps Hydor knows (store.ts), their builds (build.ts), the sweep for apps a crash left behind (sweep.ts), and the routes.
//
// Settings from the environment:
//   APPS_PORT     the port of the apps' own server (default 8792); 0 turns web apps off, and every route says so
//   APPS_ORIGIN   the address browsers reach that server at, when it is not this host on APPS_PORT (a reverse proxy, a tunnel)
//   APPS_DOMAIN   a domain whose subdomains (`<slug>.<domain>`) lead to that server: a hostname of its own for each app
//   APPS_IDLE_MINUTES  how long an app nobody uses is kept running before it is stopped (default 15; a number above 0,
//                 decimals allowed, so 0.5 is half a minute: it starts again on the next visit, with its data)
//
// Two ways in, nothing else: a hostname of its own for each app (`<slug>.localhost` when Hydor is opened on localhost or
// 127.0.0.1, `<slug>.<APPS_DOMAIN>` when that is set), else a path with a token for a tunnel with a single hostname
// (`/w/<token>/…`, the page in a sandbox).
//
// At start: the pid files of a crash are swept (apps whose process this server's earlier run left behind are stopped,
// nothing else), then the apps' server listens. At shutdown: every app and build is stopped (SIGTERM, SIGKILL after 5 s),
// and whatever is left when the process exits is killed outright.
//
// Routes, signed in (the person is this Hydor's owner):
//   GET    /api/webapps                the apps, with each one's state, and how they are reached
//   POST   /api/webapps                register an app that is in a folder with a hydor.json { folder, name? }
//   POST   /api/webapps/scratch        a new app: a folder, a git repository, a project { name, folder? }
//   GET    /api/webapps/kinds          the ideas of "What do you want to make?"
//   GET    /api/webapps/:id            one app with the last lines of its log
//   PUT    /api/webapps/:id            change { name?, settings? }
//   DELETE /api/webapps/:id            stop it and forget it (?data=1 also removes what Hydor kept for it)
//   POST   /api/webapps/:id/build      build it (a tracked job: returns at once)
//   POST   /api/webapps/:id/start      start it
//   POST   /api/webapps/:id/stop       stop it
//   POST   /api/webapps/:id/open       an address that signs this person in { path? } → { url, way }
//   GET    /api/webapps/:id/data       the tables of the app's own database (read only)
//   GET    /api/webapps/:id/data/:table  a page of one table's rows (?offset, ?limit)
//   POST   /api/webapps/:id/flows      link an agent app to it { app? } (flows.ts)
//   DELETE /api/webapps/:id/flows      unlink it: the agent app stays
//   POST   /api/webapps/:id/shot       a picture of a page of the running app { path?, as?, device?, scheme? } → image/png (kept: x-picture is its id)
//   GET    /api/webapps/:id/pictures/:pid   a picture kept from a shot or of a design page
//   GET    /api/webapps/:id/brief      the app's docs/brief.md
//   GET    /api/webapps/:id/steps      the app's steps (its own git repository), newest first
//   POST   /api/webapps/:id/steps      save what changed as a step { message, stage? }
//   POST   /api/webapps/:id/steps/:sha/back   go back to before a step (the later steps stay listed), then rebuild
//   GET    /api/webapps/:id/choices    the choices put to the maker and answered
//   POST   /api/webapps/:id/choices    keep a card (designs: Hydor takes the pictures of each direction's page)
//   GET    /api/webapps/:id/choices/:cid   one of them (or that it is waiting)
//   GET    /api/webapps/:id/mail       its mail: the owner's say, the accounts to choose from, the last requests (mail.ts; the app's own route is POST /api/apps/:slug/mail)
//   GET    /api/webapps/:id/checks     the last check, as lines
//   POST   /api/webapps/:id/check      check it against its hydor.json (a job; GET …/checks has it)
import fs from "node:fs";
import path from "node:path";
import type { FastifyRequest } from "fastify";
import {
  webappSlug,
  type WebAppShapeView,
  type WebApp,
  type WebAppDetail,
  type WebAppMode,
  type WebAppOpen,
  type WebAppsList,
  type WebAppsReach,
  type WebAppShot,
  type WebAppBrief,
  type WebAppChoices,
  type WebAppDecision,
  type WebAppStepSave,
  type WebAppStage,
  WEBAPP_STAGES,
  isWebAppStage,
} from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { APP_ROOT, config } from "../config.ts";
import { createSpace, allSpaces } from "../spaces/index.ts";
import { makeProjectAgent } from "../assistants/projectAgent.ts";
import { cardHooks, keyUses } from "../connections/cards.ts";
import type { Deps, Feature } from "../features/types.ts";
import { ownerName } from "../spaces/share.ts";
import { type BuiltApp, createBuilds } from "./build.ts";
import { createContractChecks, type ContractChecks } from "./contract-run.ts";
import { type AppShape, setLaunchedFolders, shapeOf, shapeStamp } from "./shape.ts";
import { readChecks } from "./checks.ts";
import { dayOf, isPictureId, keeper, normalizeChoose, readAnswer, summarize } from "./choose.ts";
import { registerStandingAnswer } from "../openForms.ts";
import { ensureRepo, goBack, listSteps, saveStep, STEPS_MAX } from "./steps.ts";
import { aiAsks, aiRoutes, aiView } from "./ai.ts";
import { checkMailChoice, mailRoutes, mailView, reviewMail, stopMail, usesMail } from "./mail.ts";
import { embedKey, embedRoutes, embedUse, hasSearch } from "./embed.ts";
import { launchedKey } from "./sides.ts";
import { flowsEnv, flowsRoutes, flowsView, forgetFlows, linkOf } from "./flows.ts";
import { flowsPageRoutes, joinFlows } from "./flows-pages.ts";
import { functionsView } from "./flows-functions.ts";
import { createSessionFunctions, forgetSessionFns, sessionFns, sessionRoutes } from "./session-fns.ts";
import { getApp as getAgentApp } from "../apps/store.ts";
import { listTables, readRows } from "./data.ts";
import { webappTools, WEBAPP_NOTE, WEBAPP_TOOL_NAMES } from "./tools.ts";
import { kindsView, webKindNote } from "./ideas.ts";
import { hasPlaceholderName, markPlaceholderName, namedByThemselves, simpleRoutes, speakFor } from "./simple.ts";
import { pageFile, shootPages } from "./design-shots.ts";
import { createHost, type Host, type HostedApp } from "./host.ts";
import { createAppKeys, type AppKeys } from "./app-keys.ts";
import { createServices, needView, readCatalog } from "./services.ts";
import { baseIdOf, createLaunches, liveIdOf, type Launches } from "./hydor-launch.ts";
import { browserSettings } from "../browser/settings.ts";
import { createServerOps, type ServerOps } from "./server-launch.ts";
import { forgetLaunches, listDeployments } from "./launch-store.ts";
import { forgetFirst, type FirstOptions } from "./remote/firstboot.ts";
import { launchRoutes } from "./launch-routes.ts";
import { readAppKey, vaultTables } from "../connections/vault.ts";
import { createAppsProxy, frameOrigin, type AppsProxy, webappOpenToken, webappSession } from "./proxy.ts";
import type { Person } from "./sign.ts";
import {
  addWebApp,
  changeWebApp,
  moveSlug,
  cleanName,
  freeSlug,
  getWebApp,
  listWebApps,
  removeWebApp,
  setStage,
  within,
  webAppBySlug,
  webappTables,
  type WebAppRow,
} from "./store.ts";
import { sweepOrphans } from "./sweep.ts";
import { persistLimits } from "../apps/limits.ts";

/** An app nobody has used for this long is stopped. */
export const IDLE_MS = 15 * 60_000;

export interface WebappsOptions {
  /** How often the weekly check and the daily backups look at what is due (ms; default an hour); false for none (tests). */
  weekly?: false | number;
  /** For tests: called at the start of each step of a launch, and may throw to make it fail. */
  testInject?: (step: string) => void | Promise<void>;
  /** Hydor's data folder: each app's secret, data, pid file and build log go in <dataDir>/webapps/<id>/. */
  dataDir: string;
  /** Where an app reaches Hydor from this computer (`HYDOR_URL` in the environment of an app with a flows half); default: this server's own address. */
  hydorUrl?: string;
  /** The apps' server's port; 0 turns web apps off. */
  port: number;
  /** Where browsers reach it, when that is not this host on `port` (no trailing slash), or "". */
  origin: string;
  /** A domain whose subdomains lead to it, or "". */
  domain: string;
  idleMs: number;
  /** Run apps inside bubblewrap where it is here. */
  sandbox: boolean;
  /** Where the apps' server listens (127.0.0.1 unless Hydor is reached from other computers). */
  listen?: string;
  /** How long an app may take to start (ms). */
  startTimeoutMs?: number;
  /** The ports apps may take, from and to (default: any the system gives). */
  ports?: [number, number];
  /** Where the apps Hydor makes go, one folder each (default: WebApps in the folder Hydor keeps people's apps in). */
  appsRoot?: string;
  /** The app's own checks run by themselves a little after a build or a saved step: how long after, in ms (none: only when asked). */
  autoCheckMs?: number;
  /** For tests: how a web address is looked up. */
  resolve?: (name: string) => Promise<string[]>;
  /** For tests: a stand-in for SSH when a server created with Hydor's text is connected to. */
  first?: Pick<FirstOptions, "scan" | "connect">;
  /** A picture of an address, as a browser here sees it (default: the one Preview uses for dev servers). */
  shot?: (url: string, o: { device: "phone" | "desktop"; scheme: "dark" | "light" }) => Promise<{ png: Buffer; width: number; height: number; url: string }>;
}

/** The idle time APPS_IDLE_MINUTES gives, in ms: a number above 0 (at most a week); anything else is the usual 15 minutes. */
export function idleMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.APPS_IDLE_MINUTES ?? "").trim();
  const minutes = raw === "" ? NaN : Number(raw);
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 7 * 24 * 60 ? Math.max(100, Math.round(minutes * 60_000)) : IDLE_MS;
}

/** The options the environment gives. */
export function webappsOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): WebappsOptions {
  const port = Number(env.APPS_PORT ?? 8792);
  return {
    dataDir: config.dataDir,
    port: Number.isInteger(port) && port >= 0 && port <= 65535 ? port : 8792,
    origin: (env.APPS_ORIGIN ?? "").trim().replace(/\/+$/, ""),
    domain: (env.APPS_DOMAIN ?? "").trim().toLowerCase().replace(/^\.+|\.+$/g, ""),
    idleMs: idleMsFromEnv(env),
    sandbox: true,
    listen: config.host,
    appsRoot: path.join(config.taskRoot, "WebApps"),
    autoCheckMs: 20_000,
  };
}

/** The address of an app's own hostname, as `open` gives it: with a domain, `<slug>.<domain>` (the scheme and port of APPS_ORIGIN when it is given, else http and the apps' port); without, `<slug>.localhost`. */
export function appAddressOf(o: Pick<WebappsOptions, "port" | "origin" | "domain">, slug: string): string {
  if (!o.domain) return `http://${slug}.localhost:${o.port}`;
  let proto = "http";
  let port = `:${o.port}`;
  if (o.origin) {
    try {
      const u = new URL(o.origin);
      proto = u.protocol === "https:" ? "https" : "http";
      port = u.port ? `:${u.port}` : "";
    } catch {}
  }
  return `${proto}://${slug}.${o.domain}${port}`;
}

/** A path inside the app, as a person gives it: starts with one slash, no backslash. */
function cleanPath(v: unknown): string {
  if (v === undefined || v === null || v === "") return "/";
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//") || v.includes("\\") || v.length > 2000)
    throw new HttpError(400, "The path has to start with one slash, like /notes.");
  return v;
}

/** A named test person for a picture: a role by itself (member) or { name, role }. */
function testPerson(v: unknown): Person | null {
  if (v === undefined || v === null || v === "") return null;
  const roles = ["owner", "admin", "member", "guest"];
  const given = typeof v === "string" ? { name: `Test ${v}`, role: v } : (v as { name?: unknown; role?: unknown });
  if (!given || typeof given !== "object") throw new HttpError(400, "as is a role (owner, admin, member or guest) or { name, role }.");
  const role = given.role === undefined ? "member" : String(given.role);
  if (!roles.includes(role)) throw new HttpError(400, `The role is one of ${roles.join(", ")}.`);
  const name = String(given.name ?? `Test ${role}`).replace(/\s+/g, " ").trim().slice(0, 60) || `Test ${role}`;
  return { id: `test-${webappSlug(name)}`, name, role: role as Person["role"] };
}

/** The picture Preview takes of dev servers, for any address on this computer. */
async function defaultShot(url: string, o: { device: "phone" | "desktop"; scheme: "dark" | "light" }) {
  const { pageShot } = await import("../preview.ts");
  const s = await pageShot(url, o.device, { colorScheme: o.scheme });
  return { png: s.data, width: s.width, height: s.height, url: s.url };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Where the page that asked is: from the address it was loaded from (Origin), else the Host it reached this server by. */
function pageAddress(req: FastifyRequest): { hostname: string; https: boolean; origin: string } {
  const h = req.headers;
  let https = h["x-forwarded-proto"] === "https" || String(h["cf-visitor"] ?? "").includes("https");
  let hostname = "";
  let at = "";
  const origin = typeof h.origin === "string" ? h.origin : "";
  try {
    if (origin && origin !== "null") {
      const u = new URL(origin);
      hostname = u.hostname;
      at = u.host;
      https = https || u.protocol === "https:";
    }
  } catch {}
  if (!hostname) {
    try {
      const u = new URL(`http://${h["x-forwarded-host"] ?? h.host ?? "localhost"}`);
      hostname = u.hostname;
      at = u.host;
    } catch {
      hostname = at = "localhost";
    }
  }
  // The page's own origin: where Hydor's server is reached, and so where it carries the path way.
  return { hostname: hostname.toLowerCase(), https, origin: `${https ? "https" : "http"}://${at.toLowerCase()}` };
}

export interface Webapps extends Feature {
  /** Resolves with the port the apps' server listens on (null when web apps are off or it could not listen), once start() ran. */
  ready: Promise<number | null>;
  /** The pieces, for tests. */
  parts(): { host: Host | null; proxy: AppsProxy | null };
}

/** The feature, for the options given (index.ts below makes the app's own from the environment). */
export function createWebapps(o: WebappsOptions): Webapps {
  const root = path.join(o.dataDir, "webapps");
  const on = o.port > 0;
  let host: Host | null = null;
  let proxy: AppsProxy | null = null;
  let listenError: string | null = null;
  let deps: Deps | null = null;
  let builds: ReturnType<typeof createBuilds> | null = null;
  let launches: Launches | null = null;
  let contractChecks: ContractChecks | null = null;
  let stopWeekly: (() => void) | null = null;
  let serverOps: ServerOps | null = null;
  let appKeys: AppKeys | null = null;
  let services: ReturnType<typeof createServices> | null = null;
  let sessionFunctions: ReturnType<typeof createSessionFunctions> | null = null;
  let onExit: (() => void) | null = null;
  let unregister: (() => void) | null = null;
  let resolveReady: (p: number | null) => void = () => {};
  const ready = new Promise<number | null>((r) => (resolveReady = r));

  /** The project whose folder is the app's (its sessions, files and memory), when there is one. */
  const projectOf = (a: WebAppRow): string | undefined => {
    if (!deps) return undefined;
    try {
      return allSpaces(deps.db).find((x) => path.resolve(x.folder) === path.resolve(a.folder))?.id;
    } catch {
      return undefined;
    }
  };

  /** Where an app reaches Hydor from this computer: the address Hydor itself listens on (127.0.0.1 when it listens on every address). */
  const hydorUrl = (): string => {
    if (o.hydorUrl) return o.hydorUrl.replace(/\/+$/, "");
    const h = config.host;
    const host = !h || h === "0.0.0.0" || h === "::" || h === "localhost" ? "127.0.0.1" : h.includes(":") && !h.startsWith("[") ? `[${h}]` : h;
    return `http://${host}:${config.port}`;
  };

  /** An app's shape (shape.ts), read from its folder: kept while the file it comes from is as it was, as the proxy asks on every request. */
  const shapes = new Map<string, { key: string; shape: AppShape }>();
  const shapeFor = (folder: string): AppShape => {
    const key = shapeStamp(folder);
    const hit = shapes.get(folder);
    if (hit && hit.key === key) return hit.shape;
    const shape = shapeOf(folder);
    shapes.set(folder, { key, shape });
    return shape;
  };
  const shapeA = (a: Pick<WebAppRow, "folder">): AppShape => shapeFor(a.folder);
  /** What runs for an app: the version being changed runs its development command when it has one. */
  const modeFor = (a: WebAppRow): WebAppMode => {
    const servers = deps ? listDeployments(deps.db, a.id).map((x) => x.env) : [];
    return {
      // The app has a launched version inside this Hydor (hydor-launch.ts): its two sides run at the same time.
      launched: !!(deps && launches?.live(a)),
      runsAs: shapeA(a).dev ? "dev" : "built",
      ...(servers.length ? { servers } : {}),
    };
  };
  /** The side being changed: the development server while the app is being made (its hostname is `<slug>--preview` once a launched version has `<slug>`). */
  const hosted = (a: WebAppRow): HostedApp => ({ id: a.id, slug: modeFor(a).launched ? `${a.slug}--preview` : a.slug, dir: a.folder, shape: shapeA(a), ...(modeFor(a).runsAs === "dev" ? { dev: true } : {}) });
  /** The launched version: the production run of the launched commit, in a folder of its own, with data of its own. */
  const hostedLive = (a: WebAppRow, dir: string): HostedApp => ({ id: liveIdOf(a.id), slug: a.slug, dir, shape: shapeFor(dir) });
  /** An app as a build needs to know it. */
  const built = (a: WebAppRow): BuiltApp => ({ id: a.id, dir: a.folder, ...(shapeA(a).build ? { build: shapeA(a).build } : {}) });
  /** The side that serves people now: the launched version when there is one, else the one being made. */
  const servingId = (a: WebAppRow): string => (launches?.live(a) ? liveIdOf(a.id) : a.id);

  /** The address an app is reached at, which it is told as APP_URL: under APPS_DOMAIN (the scheme and port APPS_ORIGIN gives, else http and the apps' port) when that is set, else `<slug>.localhost` on the apps' port. */
  const appAddress = (slug: string): string => appAddressOf(o, slug);

  const reach = (): WebAppsReach => ({
    enabled: on,
    port: on ? o.port : null,
    origin: o.origin || null,
    domain: o.domain || null,
    sandbox: o.sandbox,
    error: listenError,
  });

  /** What was decided along the way: the choice cards answered, oldest first. */
  const decisionsOf = (id: string): WebAppDecision[] => keeper(root, id).list().map((c) => ({ at: dayOf(c.at), stage: c.stage, what: c.summary, choice: c.id, shape: c.shape }));
  const shapeView = (a: WebAppRow): WebAppShapeView => {
    const sh = shapeA(a);
    return {
      ok: sh.ok,
      ...(sh.problem ? { problem: sh.problem, problems: sh.problems } : {}),
      signIn: sh.signIn,
      build: !!sh.build,
      dev: !!sh.dev,
      services: { ai: !!sh.services.ai, embed: sh.services.embed, mail: sh.services.mail },
      database: sh.database,
      keys: sh.keys.length,
    };
  };

  const view = (a: WebAppRow): WebApp => {
    const s = host!.status(a.id);
    const flows = deps ? flowsView(deps.db, a) : undefined;
    return {
      id: a.id,
      slug: a.slug,
      name: a.name,
      folder: a.folder,
      shape: shapeView(a),
      stage: a.stage,
      decisions: decisionsOf(a.id),
      ...(projectOf(a) ? { project: projectOf(a) } : {}),
      ...(flows ? { flows } : {}),
      settings: a.settings,
      ...(deps && hasSearch(a) ? { meaning: embedUse(deps.db, a.id) } : {}),
      ...(deps ? ((ai) => (ai ? { ai } : {}))(aiView(deps.db, a)) : {}),
      ...(deps ? ((mail) => (mail ? { mail } : {}))(mailView(deps.db, a, !!launches?.live(a), appAddress(a.slug))) : {}),
      run: {
        state: s.state,
        pid: s.pid,
        since: s.since,
        lastUse: s.lastUse,
        restarts: s.restarts,
        sandboxed: s.sandboxed,
        sandboxNote: s.sandboxNote,
        lastExit: s.lastExit,
      },
      build: builds!.state(built(a)),
      mode: modeFor(a),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  };
  const detail = (a: WebAppRow): WebAppDetail => ({ ...view(a), log: host!.status(a.id).log });

  const changed = () => deps?.broadcast({ t: "feature", id: "webapps", data: { changed: "webapps" } });

  /**
   * The app's own checks run by themselves after a build or a saved step, so that the person only ever reads their one line.
   * A little after the last of them (an agent saves and builds in bursts), and not while a build or a check is going: then
   * it is put off. Never for an app whose hydor.json cannot be read yet.
   */
  const soon = new Map<string, NodeJS.Timeout>();
  function checkSoon(id: string) {
    if (!o.autoCheckMs) return;
    clearTimeout(soon.get(id));
    const t = setTimeout(() => {
      soon.delete(id);
      const a = deps ? getWebApp(deps.db, id) : null;
      if (!a || !contractChecks || !builds || !shapeA(a).ok) return;
      if (builds.state(built(a)).state === "building" || contractChecks.running(id)) return checkSoon(id);
      try {
        contractChecks.start(a);
      } catch (e) {
        console.warn(`[webapps] ${a.slug} was not checked by itself: ${(e as Error).message}`);
      }
    }, o.autoCheckMs);
    t.unref?.();
    soon.set(id, t);
  }

  /** An app that has got to `stage` is at it, when it was at an earlier one. */
  const reach_ = (a: WebAppRow, stage: WebAppStage) => {
    if (!deps || WEBAPP_STAGES.indexOf(stage) <= WEBAPP_STAGES.indexOf(a.stage ?? "brief")) return;
    setStage(deps.db, a.id, stage);
    changed();
  };

  /**
   * The project for the app's folder, made if there is none (the way the app makes projects for folders: its sessions, files and memory
   * stay together), with its own agent: the web developer one, from the template (no model is asked for it). Forgetting the app leaves the project.
   */
  // An app nobody uses yet takes its address from the name it has now; a preview that runs starts again under it.
  const rehome = async (id: string) => {
    const a = getWebApp(deps!.db, id);
    if (!a || launches!.live(a) || serverOps!.deployments(a).length) return;
    if (moveSlug(deps!.db, id)) await host!.stop(id);
  };
  const ensureProject = async (a: WebAppRow): Promise<string | undefined> => {
    if (!deps) return undefined;
    try {
      let id = projectOf(a);
      if (!id) {
        id = createSpace(deps.db, { name: a.name, folder: a.folder, description: "A web app, in this folder, which Hydor runs." }).id;
        deps.broadcast({ t: "feature", id: "spaces", data: { changed: true } });
      }
      // Its agent, when the project has none: the template of its kind, never a draft by a model.
      const sp = allSpaces(deps.db).find((x) => x.id === id);
      if (sp && !sp.assistant) {
        await makeProjectAgent(deps.db, id, { draft: () => Promise.reject(new Error("template")) });
        deps.broadcast({ t: "feature", id: "assistants", data: { changed: true } });
        deps.broadcast({ t: "feature", id: "spaces", data: { changed: true } });
      }
      return id;
    } catch (e) {
      console.error("[webapps] the project for", a.folder, "could not be made:", (e as Error).message);
      return projectOf(a);
    }
  };

  /** Preview is started again so it has a key just given: when it is running (else its next start has it), once for keys saved close together. */
  const restarts = new Map<string, ReturnType<typeof setTimeout>>();
  let restartPreview: (id: string) => void = () => {};

  function routes(d: Deps) {
    deps = d;
    const { app, db } = d;
    webappTables(db);
    // The rates of the app's functions and of the API keys are kept in the database: a restart does not start the minute again.
    persistLimits(db);
    vaultTables(db);
    // The keys an app needs, the card that asks for them, and who uses a key of the vault.
    const keys = createAppKeys({
      db,
      asked: (key) => {
        if (!key.startsWith("webapp:")) d.toSubscribers(key, { t: "feature", id: "connections", key, data: { changed: "request" } });
        d.broadcast({ t: "feature", id: "connections", data: { changed: "secrets" } });
      },
      inside: (id) => restartPreview(id),
    });
    appKeys = keys;
    // The services a web app needs, from the catalog: the card that offers them, and what a choice does.
    services = createServices({
      db,
      keys,
      changed,
      tell: async (session, text) => {
        await d.sessions.deliverOrQueue(session, text, { person: true }).catch((e) => console.warn(`[webapps] could not tell ${session} what was chosen: ${(e as Error).message}`));
      },
    });
    cardHooks.sources = keys.sources;
    cardHooks.saved = keys.saved;
    keyUses.set("webapps", keys.uses);
    launches = createLaunches({
      db,
      root,
      host: () => host!,
      changed,
      who: () => ({ id: "owner", name: ownerName(db) }),
      hostedLive,
      inject: o.testInject ? (step) => o.testInject!(step) : undefined,
      keys: (a) => keys.insideValues(a),
      checkContract: (a, dir) => contractChecks!.forLaunch(a, dir),
      launched: (a) => setStage(db, a.id, "run"),
      sandbox: o.sandbox,
    });
    contractChecks = createContractChecks({ root, sandbox: o.sandbox, changed, ports: o.ports, chosenBrowser: () => browserSettings(db).chrome });
    setLaunchedFolders((id) => {
      const a = getWebApp(db, id);
      return a ? (launches?.live(a)?.dir ?? null) : null;
    });
    serverOps = createServerOps({
      db,
      root,
      dataDir: o.dataDir,
      changed,
      who: () => ({ id: "owner", name: ownerName(db) }),
      values: (a, env) => keys.savedValues(a, env),
      launched: (a) => setStage(db, a.id, "run"),
      check: (a, dir, onStep) => contractChecks!.forLaunch(a, dir, { build: true, onStep }),
      sandbox: o.sandbox,
    });
    if (on) {
      host = createHost({
        dataDir: o.dataDir,
        idleMs: o.idleMs,
        sandbox: o.sandbox,
        startTimeoutMs: o.startTimeoutMs,
        ports: o.ports,
        address: appAddress,
        // The flows half's key and address, read at each start: the key is never kept in the app's folder.
        environment: (a) => {
          if (!deps) return undefined;
          const base = baseIdOf(a.id);
          const row = getWebApp(deps.db, base);
          // A web app with a flows half asks Hydor for vectors, answers and mail with that half's key; one without it, with the key made from its secret for that alone (embed.ts, ai.ts, mail.ts).
          const own = flowsEnv(deps.db, { root, hydorUrl }, base) ?? (row && (hasSearch(row) || aiAsks(row) !== null || usesMail(row)) ? { HYDOR_URL: hydorUrl(), HYDOR_APP_SLUG: row.slug, HYDOR_APP_KEY: embedKey(host!.secret(base)) } : undefined);
          // The launched version's key carries a mark (sides.ts): the process Hydor starts as it, and no other, is told apart by it.
          const flows = own && a.id !== base ? { ...own, HYDOR_APP_KEY: launchedKey(deps.db, base, own.HYDOR_APP_KEY) } : own;
          // Its own keys (never written anywhere): the launched version those for inside Hydor, Preview the same with made ones of its own.
          const values = row && appKeys ? (a.id !== base ? appKeys.insideValues(row) : appKeys.previewValues(row)) : {};
          return flows || Object.keys(values).length ? { ...(flows ?? {}), ...values } : undefined;
        },
        hidden: (a) => {
          const base = baseIdOf(a.id);
          const row = deps ? getWebApp(deps.db, base) : null;
          return row && appKeys ? Object.values(a.id !== base ? appKeys.insideValues(row) : appKeys.previewValues(row)) : [];
        },
      });
      builds = createBuilds(root, o.sandbox);
      proxy = createAppsProxy({
        host,
        apps: {
          bySlug: (label) => {
            const preview = label.endsWith("--preview");
            const a = webAppBySlug(db, preview ? label.slice(0, -"--preview".length) : label);
            if (!a) return undefined;
            const l = launches?.live(a);
            if (preview) return hosted(a);
            return l ? hostedLive(a, l.dir) : hosted(a);
          },
          byId: (id) => {
            if (id.endsWith("_live")) {
              const a = getWebApp(db, baseIdOf(id));
              const l = a && launches?.live(a);
              return a && l ? hostedLive(a, l.dir) : undefined;
            }
            const a = getWebApp(db, id);
            return a ? hosted(a) : undefined;
          },
        },
        port: o.port,
        listen: o.listen,
        domain: o.domain,
      });
    }
    restartPreview = (id) => {
      clearTimeout(restarts.get(id));
      const t = setTimeout(() => {
        restarts.delete(id);
        const a = getWebApp(db, id);
        if (!a || !host || host.status(a.id).state === "stopped") return;
        void host
          .stop(a.id)
          .then(() => host!.ensure(hosted(a)))
          .then(changed, (e) => console.warn(`[webapps] ${a.slug}: Preview did not start again with its new key: ${(e as Error).message}`));
      }, 800);
      t.unref?.();
      restarts.set(id, t);
    };
    /** Every route asks for this first. */
    const enabled = () => {
      if (!on)
        throw new HttpError(
          400,
          "Web apps are off on this computer (APPS_PORT=0). Set APPS_PORT to a port, or remove it, and restart Hydor.",
          { off: true },
        );
    };
    const P = (req: { params: unknown }) => req.params as { id: string };
    const own = (req: { params: unknown }): WebAppRow => {
      const a = getWebApp(db, P(req).id);
      if (!a) throw new HttpError(404, "There is no such web app.");
      return a;
    };
    const B = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;
    /** The person who is signed in: this Hydor's owner (every signed-in request is, until sharing comes). */
    const who = (): Person => ({ id: "owner", name: ownerName(db), role: "owner" });
    /** Only this Hydor's owner may see an app as someone else: no one else is signed in to these routes, and a request of an app's own (its key) is not this. */
    const mustBeOwner = () => {
      if (who().role !== "owner") throw new HttpError(403, "Only the app's owner can see it as someone else.");
    };
    /** Its hydor.json can be read and run, else why not. */
    const readable = (a: WebAppRow) => {
      const sh = shapeA(a);
      if (!sh.ok) throw new HttpError(409, sh.problem ?? "Its hydor.json cannot be read.");
    };
    const needBuild = (a: WebAppRow) => {
      readable(a);
      // An app being made runs its development server (mode.ts): nothing has to be built for it.
      if (modeFor(a).runsAs === "dev") return;
      if (!builds!.state(built(a)).exists)
        throw new HttpError(409, "This app is not built yet: build it first (its Build button, or POST /api/webapps/:id/build).");
    };
    const startApp = async (a: WebAppRow) => {
      needBuild(a);
      try {
        await host!.ensure(hosted(a));
      } catch (e) {
        throw new HttpError(502, `The app could not start. ${String((e as Error).message).split("\n")[0]}`);
      }
    };

    app.get("/api/webapps", async () => {
      enabled();
      const list: WebAppsList = { reach: reach(), apps: listWebApps(db).map(view) };
      return list;
    });

    app.post("/api/webapps", async (req) => {
      enabled();
      const b = B(req);
      const a = addWebApp(db, { folder: b.folder as string, name: b.name as string | undefined }, o.dataDir);
      // Its own git repository, for its steps, when it has none.
      await ensureRepo(a.folder);
      await ensureProject(a);
      changed();
      return { app: detail(a) };
    });

    // The ideas of "What do you want to make?".
    app.get("/api/webapps/kinds", async () => {
      enabled();
      return kindsView();
    });

    // A new app: a folder of its own (a git repository), a project and its place in the list, before a line of it is written.
    // The conversation that builds it writes its hydor.json, which is what makes it runnable.
    app.post("/api/webapps/scratch", async (req) => {
      enabled();
      const b = B(req);
      const name = cleanName(b.name);
      const folder = folderFor(name, b.folder);
      let there: string[] = [];
      try {
        there = fs.readdirSync(folder);
      } catch {}
      if (there.length) throw new HttpError(409, `${folder} is not empty: a new app starts in a folder of its own. To add an app that is there, POST /api/webapps.`);
      fs.mkdirSync(folder, { recursive: true });
      let a: WebAppRow;
      try {
        a = addWebApp(db, { folder, name }, o.dataDir, { unwritten: true });
      } catch (e) {
        try {
          fs.rmdirSync(folder);
        } catch {}
        throw e;
      }
      await ensureRepo(a.folder, "An empty folder for the app");
      await ensureProject(a);
      if (b.placeholder === true) markPlaceholderName(db, a.id);
      changed();
      return { app: detail(a), folder: a.folder };
    });

    app.get("/api/webapps/:id", async (req) => {
      enabled();
      return { app: detail(own(req)) };
    });

    app.put("/api/webapps/:id", async (req) => {
      enabled();
      const b = B(req);
      // A mail account the owner picks has to be one that can send now.
      const mail = (b.settings as { mail?: unknown } | undefined)?.mail;
      if (mail !== undefined) checkMailChoice(db, own(req), mail);
      const unnamed = typeof b.name === "string" && !!b.name.trim() && hasPlaceholderName(db, own(req).id);
      let a = changeWebApp(db, own(req).id, { name: b.name, settings: b.settings });
      if (unnamed) {
        namedByThemselves(db, a.id);
        await rehome(a.id);
        a = getWebApp(db, a.id)!;
      }
      if (mail !== undefined) reviewMail(db, a.id);
      changed();
      return { app: detail(a) };
    });

    app.delete("/api/webapps/:id", async (req) => {
      enabled();
      const a = own(req);
      const withData = String((req.query as { data?: unknown })?.data ?? "") === "1";
      clearTimeout(soon.get(a.id));
      soon.delete(a.id);
      contractChecks?.forget(a.id);
      await contractChecks?.settled(a.id);
      if (builds!.state(built(a)).state === "building")
        throw new HttpError(409, "It is being built: wait for the build to end first.");
      await host!.stop(a.id);
      await host!.stop(liveIdOf(a.id));
      launches?.forget(a.id);
      serverOps?.forget(a.id);
      forgetFirst(path.join(o.dataDir, "server-hosts"), a.id);
      forgetSessionFns(db, a.id);
      // Its flows half: the link and its key go; the agent app stays, and the answer says so.
      const left = forgetFlows(db, { root }, a);
      // Its own keys go with it (the page and the agents' card say so first).
      const keysRemoved = appKeys!.forget(a.id);
      // What runs on a server of their own keeps running: Hydor only forgets it, and says where.
      const servers = serverOps!.deployments(a).map((x) => ({ env: x.env, host: x.host, address: x.address }));
      services!.forget(a.id);
      removeWebApp(db, a.id);
      forgetLaunches(db, a.id);
      builds!.forget(a.id);
      // What Hydor kept for it (its data, secret and build log, and the launched version's builds, data and backups) goes only when asked; its folder never goes.
      if (withData && /^[0-9a-f]{16}$/.test(a.id)) {
        fs.rmSync(path.join(root, a.id), { recursive: true, force: true });
        fs.rmSync(path.join(root, liveIdOf(a.id)), { recursive: true, force: true });
      }
      changed();
      return {
        ok: true,
        data: withData ? "removed" : "kept",
        ...(keysRemoved.length ? { keysRemoved } : {}),
        ...(servers.length ? { servers } : {}),
        ...(left
          ? {
              flows: {
                kept: true,
                app: left.app,
                folder: left.folder,
                note: `Its flows half, the agent app “${left.app.name}”, stays (with its definition where it was kept). The key the web app used is revoked.`,
              },
            }
          : {}),
      };
    });

    const servingOf = (id: string): string => {
      const a = getWebApp(db, id);
      return a ? servingId(a) : id;
    };
    const flowsContext = {
      root,
      hydorUrl,
      secret: (id: string) => host!.secret(servingOf(id)),
      secrets: (id: string) => {
        const a = getWebApp(db, id);
        return a && launches!.live(a) ? [host!.secret(id), host!.secret(liveIdOf(id))] : [host!.secret(id)];
      },
      restart: async (id: string) => {
        await host!.stop(id);
        await host!.stop(liveIdOf(id));
      },
      changed,
      port: (id: string) => {
        const a = getWebApp(db, id);
        if (!a) return Promise.reject(new Error("The web app is gone."));
        // Agents act on what people use: the launched version when there is one.
        const l = launches!.live(a);
        return host!.ensure(l ? hostedLive(a, l.dir) : hosted(a));
      },
      hold: (id: string) => host!.hold(servingOf(id)),
      owner: () => who(),
    };
    flowsRoutes(d, flowsContext, { enabled, own, detail });
    flowsPageRoutes(d, { enabled, own });
    simpleRoutes(d, { root, hostsDir: path.join(o.dataDir, "server-hosts"), own, enabled, changed, rename: async (a, name) => {
      changeWebApp(db, a.id, { name });
      await rehome(a.id);
    }, ...(o.resolve ? { resolve: o.resolve } : {}), first: { ...o.first, deployed: (host) => listDeployments(db).some((x) => x.host === host) } });
    embedRoutes(d, { enabled, secret: (id) => host!.secret(id) });
    aiRoutes(d, { enabled, secret: (id) => host!.secret(id), secrets: flowsContext.secrets, own, changed });
    mailRoutes(d, { enabled, secret: (id) => host!.secret(id), launched: (web) => !!launches!.live(web), address: (web) => appAddress(web.slug), own, changed });
    // A web app's functions for the agents in sessions (session-fns.ts): the person a session belongs to is this Hydor's owner, and the app is called at the version people use.
    const functionsOf = (web: WebAppRow) => {
      const l = linkOf(db, web.id);
      return functionsView(web, (l ? getAgentApp(db, l.app_id)?.tools : null) ?? null, sessionFns(db, web.id));
    };
    sessionFunctions = createSessionFunctions({ db, port: flowsContext.port, secret: flowsContext.secret, launchedDir: (web) => launches?.live(web)?.dir ?? null, who: () => who() });
    sessionRoutes(d, sessionFunctions, { enabled, own, view: functionsOf });

    stopWeekly = launchRoutes(d, { weekly: o.weekly, root, launches: launches!, server: serverOps!, host: () => host!, changed, enabled, own, who, modeFor: (a) => modeFor(a), hosted, hostedLive, values: (a) => keys.insideValues(a) }).stopWeekly;

    // ---- the services an app needs, from the catalog -------------------------------------------------------------------------
    app.get("/api/webapps/services", async () => {
      enabled();
      const catalog = readCatalog();
      return { needs: catalog.needs.map((n) => needView(n, Date.now())) };
    });
    app.get("/api/webapps/services/cards/:card", async (req) => {
      enabled();
      const card = services!.cardView(String((req.params as { card: string }).card), (id) => getWebApp(db, id) ?? undefined);
      if (!card) throw new HttpError(404, "That card is not there any more.");
      return { card };
    });
    app.get("/api/webapps/:id/services", async (req) => {
      enabled();
      return services!.view(own(req));
    });
    app.post("/api/webapps/:id/services/cards", async (req) => {
      enabled();
      const a = own(req);
      const b = B(req);
      const session = typeof b.session === "string" && b.session ? b.session.slice(0, 200) : undefined;
      return { card: services!.open(a, String(b.need ?? ""), session) };
    });
    app.post("/api/webapps/:id/services/:need", async (req) => {
      enabled();
      const a = own(req);
      const b = B(req);
      const need = String((req.params as { need: string }).need);
      const r = await services!.choose(a, need, String(b.service ?? ""), {
        ...(typeof b.card === "string" && b.card ? { card: b.card } : {}),
        ...(typeof b.session === "string" && b.session ? { session: b.session.slice(0, 200) } : {}),
      });
      return { chosen: r.chosen, keys: r.keys, say: r.say };
    });
    app.delete("/api/webapps/:id/services/:need", async (req) => {
      enabled();
      services!.remove(own(req), String((req.params as { need: string }).need));
      return { ok: true };
    });

    // ---- the keys an app needs (names, never values) -----------------------------------------------------------------------------
    app.get("/api/webapps/:id/keys", async (req) => {
      enabled();
      const a = own(req);
      const env = String((req.query as { env?: unknown })?.env ?? "hydor");
      return env === "all" ? appKeys!.overview(a) : appKeys!.list(a, env);
    });
    app.delete("/api/webapps/:id/keys/:name", async (req) => {
      enabled();
      const a = own(req);
      appKeys!.remove(a, String((req.query as { env?: unknown })?.env ?? "hydor"), String((req.params as { name: string }).name));
      d.broadcast({ t: "feature", id: "connections", data: { changed: "secrets" } });
      return { ok: true };
    });
    app.post("/api/webapps/:id/keys/card", async (req) => {
      enabled();
      const a = own(req);
      const b = B(req);
      const names = Array.isArray(b.names) ? b.names.filter((n): n is string => typeof n === "string").slice(0, 40) : undefined;
      const card = await appKeys!.open(a, String(b.env ?? "hydor"), {
        ...(typeof b.session === "string" && b.session ? { session: b.session.slice(0, 200) } : {}),
        ...(names ? { names } : {}),
        replace: b.replace === true,
        skippable: b.skippable === true,
      });
      return { card };
    });

    app.post("/api/webapps/:id/build", async (req) => {
      enabled();
      const a = own(req);
      readable(a);
      builds!.start(built(a), () => host!.stop(a.id));
      // Its end is news to the pages.
      void builds!.settled(a.id).then(() => (changed(), checkSoon(a.id)));
      changed();
      return { app: detail(a) };
    });

    app.post("/api/webapps/:id/start", async (req) => {
      enabled();
      const a = own(req);
      if (builds!.state(built(a)).state === "building")
        throw new HttpError(409, "It is being built: start it when the build has ended.");
      await startApp(a);
      changed();
      return { app: detail(a) };
    });

    app.post("/api/webapps/:id/stop", async (req) => {
      enabled();
      const a = own(req);
      await host!.stop(a.id);
      changed();
      return { app: detail(a) };
    });

    // What the app keeps in its own database: read only, the file opened by the server from the app's data folder.
    const dataFolder = (a: WebAppRow) => path.join(root, a.id, "data");
    /** The data of the launched version (`?side=launched`, which people use) or of the one being changed (the default). */
    const dataOf = (a: WebAppRow, side: unknown) => {
      if (side === "launched") {
        if (!launches!.live(a)) throw new HttpError(409, "This app has not been launched inside this Hydor.");
        return path.join(root, liveIdOf(a.id), "data");
      }
      return dataFolder(a);
    };
    /** The database file to read: the one asked for, else the one the side's shape names. */
    const databaseOf = (a: WebAppRow, side: unknown, asked: unknown) => {
      if (asked !== undefined && asked !== "") return asked;
      const live = side === "launched" ? launches!.live(a) : null;
      const db_ = (live ? shapeFor(live.dir) : shapeA(a)).database;
      if (!db_?.sqlite) throw new HttpError(404, "This app names no SQLite database in its hydor.json, so there is no data to show here.");
      return db_.file;
    };

    app.get("/api/webapps/:id/data", async (req) => {
      enabled();
      const a = own(req);
      const q = (req.query ?? {}) as { side?: unknown; file?: unknown };
      return listTables(dataOf(a, q.side), databaseOf(a, q.side, q.file));
    });

    app.get("/api/webapps/:id/data/:table", async (req) => {
      enabled();
      const a = own(req);
      const q = (req.query ?? {}) as { file?: unknown; offset?: unknown; limit?: unknown; side?: unknown };
      return readRows(dataOf(a, q.side), String((req.params as { table: string }).table), { ...q, file: databaseOf(a, q.side, q.file) });
    });

    app.post("/api/webapps/:id/open", async (req) => {
      enabled();
      const a = own(req);
      const b = B(req);
      // `resume`: where the app's frame in Hydor's page was last, when the server knows (turning pointing on does not lose the place).
      const to = cleanPath(b.resume === true && proxy?.lastPath(a.id) ? proxy.lastPath(a.id) : b.path);
      // Which side: the launched version (what people use) or the one being changed (Preview). Left out: the launched version when there is one.
      const lv = launches!.live(a);
      if (b.side !== undefined && b.side !== "launched" && b.side !== "preview") throw new HttpError(400, "side is launched or preview.");
      if (b.side === "launched" && !lv) throw new HttpError(409, "This app has not been launched inside this Hydor: there is only the one being made.");
      const side: "launched" | "preview" = (b.side as "launched" | "preview" | undefined) ?? (lv ? "launched" : "preview");
      if (side === "launched" && b.point === true) throw new HttpError(409, "This is the launched version: it shows what the people who use it see. Pointing is for the version being changed (Preview).");
      const target: HostedApp = side === "launched" ? hostedLive(a, lv!.dir) : hosted(a);
      const flags = b.point === true ? { point: true } : {};
      if (listenError)
        throw new HttpError(502, `The server for web apps is not running: ${listenError}`);
      if (builds!.state(built(a)).state === "building")
        throw new HttpError(409, "It is being built: open it when the build has ended.");
      const was = host!.status(target.id).state;
      if (side === "launched") {
        try {
          await host!.ensure(target);
        } catch (e) {
          throw new HttpError(502, `The launched version could not start. ${String((e as Error).message).split("\n")[0]}`);
        }
      } else await startApp(a);
      // Opening starts it when it was stopped: the pages that show where it stands hear of that.
      if (was !== "running") changed();
      const person = who();
      const page = pageAddress(req);
      // For Hydor's own page to show it in a frame (its Preview): the page's origin goes in the link, and the app lets that page frame it.
      const frame = B(req).frame === true ? (frameOrigin(req.headers.origin) ?? undefined) : undefined;
      const scheme = (u: string) => (u.startsWith("https:") ? "https" : "http");
      let out: WebAppOpen;
      if (LOCAL_HOSTS.has(page.hostname) || page.hostname.endsWith(".localhost")) {
        // Hydor is opened on this computer: the app's own hostname under .localhost, which a browser takes to 127.0.0.1.
        const t = webappOpenToken(target.id, person, undefined, frame, flags);
        out = {
          way: "hostname",
          url: `${page.https ? "https" : "http"}://${target.slug}.localhost:${o.port}/__hydor/open?t=${encodeURIComponent(t)}&to=${encodeURIComponent(to)}`,
        };
      } else if (o.domain) {
        // A domain whose subdomains lead to the apps' server: its scheme and port from APPS_ORIGIN when that is given.
        let proto = page.https ? "https" : "http";
        let port = `:${o.port}`;
        if (o.origin) {
          try {
            const u = new URL(o.origin);
            proto = scheme(u.protocol);
            port = u.port ? `:${u.port}` : "";
          } catch {}
        }
        const t = webappOpenToken(target.id, person, undefined, frame, flags);
        out = {
          way: "hostname",
          url: `${proto}://${target.slug}.${o.domain}${port}/__hydor/open?t=${encodeURIComponent(t)}&to=${encodeURIComponent(to)}`,
        };
      } else {
        // One hostname only (a tunnel to this Hydor, an address on the network): the path with a token, the page in a sandbox, at
        // Hydor's own address (its server carries the path way to the apps' server), or at APPS_ORIGIN when that is given. Shown in
        // Hydor's page, the page's origin goes in it, and the app lets that page, and no other, frame it.
        const base = o.origin || page.origin;
        out = { way: "path", url: `${base}/w/${webappSession(target.id, person, undefined, frame, flags)}${to}` };
      }
      return out;
    });

    // ---- a picture of a page ---------------------------------------------------------------------------------------------------

    /** Where a new app goes: a folder of its own under the place Hydor keeps people's web apps, one that is not there yet. */
    const folderFor = (name: string, given: unknown): string => {
      if (typeof given === "string" && given.trim()) {
        const raw = given.trim();
        if (!path.isAbsolute(raw)) throw new HttpError(400, "The folder has to be a full path, starting with /.");
        const f = path.resolve(raw);
        let data = o.dataDir;
        try {
          data = fs.realpathSync(o.dataDir);
        } catch {}
        if (within(f, data) || within(data, f)) throw new HttpError(400, "That folder is inside Hydor’s own data folder, or holds it: an app has to live in a folder of its own.");
        if (listWebApps(db).some((x) => x.folder === f)) throw new HttpError(409, "That folder is already a web app.");
        return f;
      }
      const slug = freeSlug(db, name);
      for (let n = 1; ; n++) {
        const f = path.join(o.appsRoot ?? path.join(config.taskRoot, "WebApps"), n === 1 ? slug : `${slug}-${n}`);
        if (!fs.existsSync(f)) return f;
      }
    };

    app.post("/api/webapps/:id/shot", async (req, reply) => {
      enabled();
      const a = own(req);
      const b = B(req) as WebAppShot & Record<string, unknown>;
      const to = cleanPath(b.path);
      if (b.device !== undefined && b.device !== "phone" && b.device !== "desktop") throw new HttpError(400, "device is phone or desktop.");
      const scheme = b.scheme === "light" ? "light" : b.scheme === undefined || b.scheme === "dark" ? "dark" : null;
      if (!scheme) throw new HttpError(400, "scheme is dark or light.");
      // Who looks: the owner, or a person named for the picture (when Hydor signs people in).
      let person = who();
      if (b.as !== undefined && b.as !== null && b.as !== "") {
        mustBeOwner();
        person = testPerson(b.as) ?? person;
      }
      if (listenError) throw new HttpError(502, `The server for web apps is not running: ${listenError}`);
      if (builds!.state(built(a)).state === "building") throw new HttpError(409, "It is being built: look at it when the build has ended.");
      await startApp(a);
      // The app's own address, signed in as that person (the link works once): the browser here opens it like any other page of the app.
      const t = webappOpenToken(a.id, person);
      const url = `http://${a.slug}.localhost:${o.port}/__hydor/open?t=${encodeURIComponent(t)}&to=${encodeURIComponent(to)}`;
      let shot;
      try {
        shot = await (o.shot ?? defaultShot)(url, { device: b.device ?? "desktop", scheme });
      } catch (e) {
        throw new HttpError(502, `The picture could not be taken: ${String((e as Error).message).split("\n")[0].slice(0, 300)}`);
      }
      // Kept, so that a card can show it: the id is what the tool gives the agent to hand to webapp_choose.
      let picture = "";
      try {
        picture = keeper(root, a.id).savePicture(shot.png);
      } catch {}
      reply.header("content-type", "image/png").header("cache-control", "no-store").header("x-shot-size", `${shot.width}x${shot.height}`).header("x-picture", picture).header("x-shot-url", encodeURIComponent(shot.url.replace(/\?.*$/, "")));
      return reply.send(shot.png);
    });
    // ---- the guide: the brief, the steps, the choices, the checks --------------------------------------------------------------

    app.get("/api/webapps/:id/pictures/:pid", async (req, reply) => {
      enabled();
      const a = own(req);
      const pid = String((req.params as { pid: string }).pid);
      const png = isPictureId(pid) ? keeper(root, a.id).picture(pid) : null;
      if (!png) throw new HttpError(404, "There is no such picture.");
      return reply.header("content-type", "image/png").header("cache-control", "private, max-age=86400, immutable").send(png);
    });

    app.get("/api/webapps/:id/brief", async (req) => {
      enabled();
      const a = own(req);
      const file = path.join(a.folder, "docs", "brief.md");
      let out: WebAppBrief = { exists: false, text: "" };
      try {
        const st = fs.lstatSync(file);
        if (st.isFile() && st.size <= 200_000) out = { exists: true, text: fs.readFileSync(file, "utf8").slice(0, 40_000) };
      } catch {}
      return out;
    });

    app.get("/api/webapps/:id/steps", async (req) => {
      enabled();
      const a = own(req);
      const limit = Number((req.query as { limit?: unknown })?.limit);
      return listSteps(a.folder, Number.isFinite(limit) && limit > 0 ? Math.min(limit, STEPS_MAX) : 50);
    });

    app.post("/api/webapps/:id/steps", async (req) => {
      enabled();
      const a = own(req);
      const b = B(req) as Partial<WebAppStepSave> & Record<string, unknown>;
      if (builds!.state(built(a)).state === "building") throw new HttpError(409, "It is being built: save the step when the build has ended.");
      if (b.stage !== undefined && !isWebAppStage(b.stage)) throw new HttpError(400, `stage is one of ${WEBAPP_STAGES.join(", ")}.`);
      if (b.stage) setStage(db, a.id, b.stage);
      const step = await saveStep(a.folder, b.message);
      if (step && ["build", "check"].includes(getWebApp(db, a.id)?.stage ?? "")) checkSoon(a.id);
      changed();
      return { step };
    });

    app.post("/api/webapps/:id/steps/:sha/back", async (req) => {
      enabled();
      const a = own(req);
      const sha = String((req.params as { sha: string }).sha);
      if (builds!.state(built(a)).state === "building") throw new HttpError(409, "It is being built: go back when the build has ended.");
      const went = await goBack(a.folder, sha);
      // The files are what they were: build them again (the way a change by hand is built).
      if (shapeA(a).ok) {
        builds!.start(built(a), () => host!.stop(a.id));
        void builds!.settled(a.id).then(() => (changed(), checkSoon(a.id)));
      }
      changed();
      return { went, app: detail(a) };
    });

    app.get("/api/webapps/:id/choices", async (req) => {
      enabled();
      const a = own(req);
      const out: WebAppChoices = { choices: keeper(root, a.id).list() };
      return out;
    });

    app.get("/api/webapps/:id/choices/:cid", async (req) => {
      enabled();
      const a = own(req);
      const got = keeper(root, a.id).get(String((req.params as { cid: string }).cid));
      if (!got.offered) throw new HttpError(404, "There is no such choice.");
      return { choice: got.choice, offered: got.offered, waiting: !got.choice };
    });

    // What an agent puts to the maker: the card is checked and kept (POST), and the answer is checked and kept as a decision
    // (POST …/answer). For designs, Hydor takes the pictures of each direction's page first.
    app.post("/api/webapps/:id/choices", async (req) => {
      enabled();
      const a = own(req);
      const k = keeper(root, a.id);
      let body = B(req);
      if (body.shape === "designs" && Array.isArray(body.designs)) body = { ...body, designs: await picturesOf(a, body.designs) };
      const made = normalizeChoose(body, { app: a.id, hasPicture: (id) => k.hasPicture(id) });
      if (!made.ok) throw new HttpError(400, `Not shown. Fix these first:\n- ${made.errors.join("\n- ")}`);
      k.offer(made.choose);
      reach_(a, made.choose.stage);
      return { choose: made.choose };
    });

    /** Each direction given by its page gets its pictures (computer and phone, dark and light), kept with the app's pictures. */
    async function picturesOf(a: WebAppRow, given: unknown[]): Promise<unknown[]> {
      const designs = given.slice(0, 4).map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>) : {}));
      const pages = designs.map((d) => (typeof d.page === "string" ? d.page.replace(/^\.?\/+/, "") : ""));
      const missing = pages.filter((p) => p && !(/\.html?$/i.test(p) && pageFile(a.folder, p)));
      if (missing.length) throw new HttpError(400, `Not shown. There is no page at ${missing.map((p) => `“${p}”`).join(", ")} in the app's folder (a direction's page is an HTML file there).`);
      const asked = pages.filter(Boolean);
      if (!asked.length) return designs;
      let pictures;
      try {
        pictures = await shootPages(a.folder, asked, async (url, how) => (o.shot ?? defaultShot)(url, how));
      } catch (e) {
        throw new HttpError(502, `The pictures of the pages could not be taken: ${String((e as Error).message).split("\n")[0].slice(0, 300)}`);
      }
      const k = keeper(root, a.id);
      const save = (x: { desktop: Buffer; phone: Buffer }) => ({ desktop: k.savePicture(x.desktop), phone: k.savePicture(x.phone) });
      let n = 0;
      return designs.map((d, i) => {
        if (!pages[i]) return d;
        const p = pictures[n++];
        return { ...d, page: pages[i], pictures: save(p.dark), light: save(p.light) };
      });
    }

    /** Takes an answer to a card: checked against what was offered, and kept as a decision. */
    async function recordAnswer(a: WebAppRow, cid: string, raw: unknown) {
      const k = keeper(root, a.id);
      const got = k.get(cid);
      if (!got.offered) throw new HttpError(404, "There is no such choice.");
      // Answered already (the card's answer reached the agent as a message, and the agent records it again): once only.
      if (got.choice) return { choice: got.choice, already: true as const };
      const r = readAnswer(got.offered, raw);
      if (!r.ok) throw new HttpError(400, r.error);
      const choice = k.answer(got.offered, r.answer, summarize(got.offered, r.answer));
      changed();
      return { choice };
    }

    app.post("/api/webapps/:id/choices/:cid/answer", async (req) => {
      enabled();
      const a = own(req);
      return recordAnswer(a, String((req.params as { cid: string }).cid), B(req).answer);
    });

    // A card answered after the agent's wait ended: the answer reaches the agent as the person's next message (openForms.ts), and it is recorded here
    // first, so the agent is told what was recorded instead of having to remember to.
    unregister = registerStandingAnswer("webapp-choose", async (card, content) => {
      const c = card.choose;
      const a = c ? getWebApp(db, c.app) : null;
      if (!c || !a) return null;
      try {
        const r = await recordAnswer(a, c.id, content.answer);
        if ("already" in r && r.already) return "That was recorded already.";
        return `(Already recorded in Hydor: ${r.choice.summary} Do not record it again; carry on from it.)`;
      } catch (e) {
        return `(It could not be recorded: ${(e as Error).message})`;
      }
    });

    app.get("/api/webapps/:id/checks", async (req) => {
      enabled();
      const a = own(req);
      const running = contractChecks!.running(a.id);
      return { ...readChecks(root, a.id), ...(running ? { running } : {}) };
    });

    app.post("/api/webapps/:id/check", async (req) => {
      enabled();
      const a = own(req);
      if (builds!.state(built(a)).state === "building") throw new HttpError(409, "It is being built: check it when the build has ended.");
      const running = contractChecks!.start(a);
      reach_(a, "check");
      return { running };
    });
  }

  function start(d: Deps) {
    deps = d;
    // Keys saved before under plain names become the apps' own, once (every capability has said what it keeps by now).
    try {
      appKeys?.migrate();
    } catch (e) {
      console.warn("[webapps] the keys saved before could not be moved:", (e as Error).message);
    }
    if (!on || !host || !proxy) return resolveReady(null);
    // A crash may have left apps running: they go before the server listens, so nothing here is taken for one.
    sweepOrphans(root)
      .then((swept) => {
        const n = swept.filter((s) => s.result === "stopped").length;
        if (n) console.log(`[webapps] stopped ${n} app${n === 1 ? "" : "s"} left running by an earlier crash`);
      })
      .catch((e) => console.error("[webapps] the sweep for apps left behind failed:", (e as Error).message))
      .then(() => proxy!.listen())
      .then(
        (p) => {
          console.log(`[webapps] web apps on port ${p}`);
          resolveReady(p);
        },
        (e: NodeJS.ErrnoException) => {
          listenError =
            e.code === "EADDRINUSE"
              ? `port ${o.port} is in use (set APPS_PORT to another)`
              : `it could not listen on port ${o.port} (${e.message})`;
          console.error(`[webapps] ${listenError}`);
          resolveReady(null);
        },
      );
    // The process is going, however it goes: what is still running is ended outright.
    onExit = () => host?.killNow();
    process.on("exit", onExit);
  }

  async function stop() {
    stopWeekly?.();
    stopWeekly = null;
    stopMail();
    unregister?.();
    unregister = null;
    for (const t of soon.values()) clearTimeout(t);
    soon.clear();
    if (onExit) process.off("exit", onExit);
    onExit = null;
    await contractChecks?.close().catch(() => {});
    await builds?.close().catch(() => {});
    for (const t of restarts.values()) clearTimeout(t);
    await Promise.all([host?.close().catch(() => {}), proxy?.close().catch(() => {})]);
  }

  return {
    id: "webapps",
    routes,
    start,
    stop,
    ready,
    parts: () => ({ host, proxy }),
    tools: (ctx) => webappTools(ctx),
    spawn: (s) => {
      // From "What do you want to make?": the brief known, the skill and the contract's page, and the app made for the conversation when it works in that app's folder.
      const extra = s.extra?.webKind as { app?: unknown; agentApp?: unknown } | undefined;
      const web = deps && typeof extra?.app === "string" ? getWebApp(deps.db, extra.app) : null;
      const agent = deps && typeof extra?.agentApp === "string" ? getAgentApp(deps.db, extra.agentApp) : null;
      const skill = path.join(APP_ROOT, "skills", "web-app-builder");
      const note = webKindNote(
        s.extra?.webKind,
        {
          skill: path.join(skill, "SKILL.md"),
          page: path.join(skill, "references", "hydor-contract.md"),
          check: path.join(skill, "references", "hydor-check.mjs"),
          ...(web && path.resolve(s.cwd) === path.resolve(web.folder) ? { app: { id: web.id, folder: web.folder } } : {}),
        },
        agent ? { id: agent.id, name: agent.name, description: agent.description, flows: joinFlows(agent) } : null,
      );
      // How to speak to the person, in a session about a web app (webapp_get says it again, should the switch change).
      const about = !!note || !!(deps && listWebApps(deps.db).some((x) => path.resolve(x.folder) === path.resolve(s.cwd)));
      return { guides: [{ tools: WEBAPP_TOOL_NAMES, text: WEBAPP_NOTE }], ...(note ? { instructions: [note] } : {}), ...(about && deps ? { notes: [speakFor(deps, s.key)] } : {}) };
    },
  };
}

export const webapps = createWebapps(webappsOptionsFromEnv());
