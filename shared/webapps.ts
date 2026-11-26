// Web apps: apps with pages of their own, built by an agent in any stack to a small contract (hydor.json,
// shared/hydor-file.ts), that Hydor keeps running on this computer, signs people in to and serves from an origin apart from
// its own (server/webapps). What the server and the pages share: an app as the list shows it, its running state, what it may
// use of Hydor, and the routes' bodies.
import type { KeyLooks } from './keys.ts';
import type { RecordSteps, ServerSteps } from './services.ts';
import type { Tier } from './tiers.ts';

/** How much of Hydor an app may use. Stored and returned now; enforced by a later round. */
export interface WebAppSettings {
  /** The model tiers it may ask for (none until the person allows some). */
  tiers: Tier[];
  /** The most it may spend on models in a day, in US dollars. */
  dailyCapUsd: number;
  /** The agent apps (ids) it may run. */
  apps: string[];
  /** The connected accounts (ids) it may use: none unless asked for. */
  connections: string[];
  /** Whether it may send notices to the person. */
  notify: boolean;
  /** Its mail, sent by Hydor from an account of the owner's (server/webapps/mail.ts). Absent until the owner has said something about it. */
  mail?: WebAppMailSettings;
}

/** The owner's say on a web app's mail. */
export interface WebAppMailSettings {
  /** true: allowed; false: turned off; absent: not decided yet. */
  on?: boolean;
  /** The connected mail account it sends from (its id in Apps → Connected apps → Email), "" until one is chosen. */
  account: string;
  /** The most mails it may send in a day (UTC), one for each person a mail goes to: the launched version and the one being made each have their own count. */
  perDay: number;
  /** Mail goes out from the version being made too (Preview, an app not launched yet). Off unless the owner says so: until then that mail is kept in the app. */
  whileMaking?: boolean;
}

export const WEBAPP_MAIL_PER_DAY = 100;
export const WEBAPP_MAIL_MAX_PER_DAY = 10_000;

export const DEFAULT_WEBAPP_SETTINGS: WebAppSettings = { tiers: [], dailyCapUsd: 1, apps: [], connections: [], notify: false };

/** The most a day's cap may be set to through the API. */
export const WEBAPP_MAX_CAP_USD = 10_000;

export type WebAppState = 'stopped' | 'starting' | 'running' | 'crashed';

/** The running state, from the host's status. */
export interface WebAppRun {
  state: WebAppState;
  /** The process the host started (bubblewrap's when sandboxed). */
  pid: number | null;
  /** When it reached its state, in ms since 1970. */
  since: number | null;
  /** The last time someone used it. */
  lastUse: number | null;
  /** How many times it was started again after it fell. */
  restarts: number;
  /** It runs inside bubblewrap. */
  sandboxed: boolean;
  /** Why it is not sandboxed where sandboxing is on, in plain words (or null). */
  sandboxNote: string | null;
  /** How the last run ended (for a stopped or crashed app). */
  lastExit: string | null;
}

/** An app's own build, run in its folder by Hydor. */
export interface WebAppBuild {
  /** none: no build exists; building: a build is running; built: a build exists (made by the last good build, or already there); failed: the last build did not finish well. */
  state: 'none' | 'building' | 'built' | 'failed';
  /** There is something to run: it has no build, or a build of it has worked. */
  exists: boolean;
  startedAt: number | null;
  endedAt: number | null;
  /** The last build's exit code (null while it runs, or when it was ended by a signal or never started). */
  exitCode: number | null;
  /** Why it failed, in a sentence (when it did). */
  problem?: string;
  /** The end of the build's output. */
  log: string[];
  /** Where a build of it runs here: said before one is started. */
  box: BuildBox;
  /** Hosts the last build tried to reach and may not (it reaches only the package registry). */
  refused?: string[];
}

/**
 * Which side of an app runs. **Two sides once it is launched**: the launched version (the production command of the launched commit, in a
 * folder of its own with data of its own) and the one being changed, which runs its development command when hydor.json names one. Editing
 * never changes what people use.
 */
export interface WebAppMode {
  /** The app has been launched inside this Hydor. */
  launched: boolean;
  /** The names of its places on servers of the person's own, when it is launched to any. */
  servers?: string[];
  /** What the version being changed runs: its development command, or its production one. */
  runsAs: 'dev' | 'built';
}

/** How people reach the apps from this Hydor. */
export interface WebAppsReach {
  /** False when web apps are off (APPS_PORT=0). */
  enabled: boolean;
  /** The port the apps' own server listens on (null when off). */
  port: number | null;
  /** The address browsers reach it at when it is not the Hydor's host on that port (APPS_ORIGIN), or null. */
  origin: string | null;
  /** The domain whose subdomains lead to the apps (APPS_DOMAIN), or null. */
  domain: string | null;
  /** Apps run inside bubblewrap where it is here. */
  sandbox: boolean;
  /** Why the apps' server is not listening, in plain words, when it could not start (a port in use). */
  error: string | null;
}

/** An app's shape, as far as the pages need it: what hydor.json says (server/webapps/shape.ts). */
export interface WebAppShapeView {
  /** It can be read and run. */
  ok: boolean;
  /** Why not, in a sentence, and everything else that is wrong. */
  problem?: string;
  problems?: string[];
  /** Who signs people in: Hydor (the signed header), or the app itself. */
  signIn: 'hydor' | 'own';
  /** It has a build of its own, and a command for the version being changed. */
  build: boolean;
  dev: boolean;
  services: { ai: boolean; embed: boolean; mail: boolean };
  database: { file: string; sqlite: boolean } | null;
  /** How many keys the file lists. */
  keys: number;
}

/** A web app, as the list shows it. */
export interface WebApp {
  id: string;
  shape: WebAppShapeView;
  /** A name for its hostname: `<slug>.localhost`. Fixed when it is registered, except that an app made without a name takes it from its first name while nobody uses it. */
  slug: string;
  name: string;
  /** Where its source and build are: an absolute path. */
  folder: string;
  /** The stage it is at (null: none yet). */
  stage: WebAppStage | null;
  /** What was decided along the way (the choice cards answered), oldest first. */
  decisions: WebAppDecision[];
  /** The project that keeps its sessions, files and memory together (its id), when it has one. */
  project?: string;
  /** Its flows half, when it has one: the agent app whose runs its pages start (server/webapps/flows.ts). */
  flows?: WebAppFlows;
  settings: WebAppSettings;
  /** What its model use is, when its hydor.json lists `ai`: the tiers it asks for and the owner allowed, and what it has spent today against its daily cap (server/webapps/ai.ts). */
  ai?: WebAppAi;
  /** Its mail, when the app sends mail through Hydor: whether the owner allows it, from which account, and today's count against the limit (server/webapps/mail.ts). */
  mail?: WebAppMail;
  /** What the app's search has had Hydor make today, when its hydor.json lists `embed`: texts made into vectors, and the most a day (server/webapps/embed.ts). */
  meaning?: { texts: number; limit: number };
  run: WebAppRun;
  build: WebAppBuild;
  /** What Hydor runs for it and why: see WebAppMode. */
  mode: WebAppMode;
  createdAt: number;
  updatedAt: number;
}

/** What one side of a web app's mail has done today. */
export interface WebAppMailDay {
  /** Mails accepted: what counts against the day's limit. */
  counted: number;
  /** Of those, handed to the mail server. */
  sent: number;
  /** Still being sent, or waiting to be tried again. */
  waiting: number;
  /** Of those accepted, that did not go in the end. */
  failed: number;
  /** Requests Hydor refused (not allowed, turned off, no account, over a limit, being made): the app keeps what it was told Hydor cannot send yet. */
  refused: number;
}

/** A web app's mail, as its page and its JSON show it. Never a recipient's address or a word of a mail. */
export interface WebAppMail {
  /** allowed: mail goes out; off: the owner turned it off; ask: not decided yet. */
  state: 'allowed' | 'off' | 'ask';
  /** This Hydor has a connected mail account that can send. */
  canSend: boolean;
  /** The account chosen for it, while it is connected. */
  account?: { id: string; address: string };
  /** An account was chosen and is not connected any more. */
  accountGone?: boolean;
  /** The most mails a day, for each side. */
  perDay: number;
  /** The app is launched in this Hydor, so it has a launched version. */
  launched: boolean;
  /** The owner lets mail go out while it is being made as well (off unless they switched it on). */
  whileMaking: boolean;
  /** The launched version's day. */
  today: WebAppMailDay;
  /** The launched version has no more mail until `resetsAt`. */
  atLimit: boolean;
  /** The day of the version being made, with a count of its own. */
  making: { today: WebAppMailDay; atLimit: boolean };
  /** When the day's count starts again (midnight UTC). */
  resetsAt: string;
  /** Where a link the app writes into its mail points (the app's own address). `local`: it is a name only this computer knows (no APPS_DOMAIN). Either way the app opens only for someone who opened it from Hydor. */
  links: { host: string; local: boolean };
}

/** One request to send, as the owner's records keep it. */
export interface WebAppMailRecord {
  at: number;
  /** It came from the version being made, not the launched one. */
  making?: boolean;
  /** How many people it was for. */
  recipients: number;
  /** The length of its subject, in characters. */
  subjectChars: number;
  /** How many of them it was handed to the mail server for. */
  sent: number;
  status: 'sending' | 'queued' | 'sent' | 'partial' | 'failed' | 'lost' | 'refused';
  /** Why it was refused or did not go. */
  reason?: 'ask' | 'off' | 'making' | 'no-account' | 'limit' | 'sign-in' | 'server' | 'recipient' | 'content' | 'restart';
}

/** What the app's page asks for to draw the card about its mail. */
export interface WebAppMailPage {
  mail: WebAppMail;
  /** The connected accounts that can send; `keepsCopy`: that provider keeps a copy of what is sent by itself. */
  accounts: { id: string; address: string; keepsCopy: boolean }[];
  /** The last requests, newest first. */
  recent: WebAppMailRecord[];
}

/** A web app's use of the owner's models, as its page and its JSON show it. */
export interface WebAppAi {
  /** The tiers its hydor.json asks for (`services.ai.tiers`); it cannot ask for one that is not listed. */
  asks: ('quick' | 'standard' | 'best')[];
  /** Of those, the tiers its owner allowed (none until they do). */
  allowed: ('quick' | 'standard' | 'best')[];
  /** What the app says a day of it costs, when it says (`services.ai.usdPerDay`). */
  asksUsdPerDay?: number;
  /** The most it may spend a day, in US dollars: the one cap its flows half's runs are held to as well. */
  capUsd: number;
  /** What it has spent today against the cap: its model use, and the runs of its flows half. */
  spentUsd: number;
  today: {
    /** Its model use today, in US dollars. */
    usd: number;
    /** What its flows half's runs spent today. */
    flowsUsd: number;
    /** Answers made. */
    calls: number;
    inputTokens: number;
    outputTokens: number;
    /** The people (proven by Hydor's header) it answered for. */
    people: number;
    /** Calls Hydor refused (not allowed yet, over the cap, not a tier it uses). */
    refused: number;
    /** Answers whose cost Hydor could not know (a plan's model, Automatic): counted as $0 against the cap. */
    unpriced: number;
  };
  /** The cap (or the day's ceiling of tokens) is reached: no answers until `until`. */
  atCap: boolean;
  /** When the day's count starts again (midnight on this computer), as a date and time. */
  until: string;
}

/** The agent app that is the flows half of a web app: work done by Hydor's agents, started and followed from the web app's own pages with a key. */
export interface WebAppFlows {
  /** The agent app. */
  app: { id: string; slug: string; name: string };
  /** Where its definition is kept: `flows` in the web app's folder (null when it is no longer kept as files). */
  folder: string | null;
  /** The key the web app is started with (HYDOR_APP_KEY): never its value, and whether it still opens the app (a revoked one is made again at the next start). */
  key: { id: string; hint: string; ok: boolean } | null;
  /** When the two were linked, in ms since 1970. */
  since: number;
}

/** POST /api/webapps/:id/flows */
export interface WebAppFlowsAdd {
  /** An agent app (its id or address) to make this web app's flows half. Without it, a new one is made from a small starting recipe. */
  app?: string;
}

/** One thing to try, as the agent wrote it (docs/try.md), and what the person found of it. */
export interface TryItem {
  id: string;
  text: string;
  result?: 'works' | 'wrong';
  /** What happened, in the person's words. */
  note?: string;
  at?: number;
  /** A step was saved after it was tried: to be tried again. */
  again?: boolean;
}

/** GET /api/webapps/:id/guide: what the simple view shows beside the app. */
export interface WebAppGuide {
  try: TryItem[];
  /** What the agent says it is doing now (webapp_steps `doing`). */
  doing: { text: string; at: number } | null;
  /** The app was made without a name of the person's: the agent suggests one. */
  placeholderName?: boolean;
}

/** One provider or registrar of the catalog, as the path to put an app online offers it. */
export interface OnlineOffer {
  id: string;
  name: string;
  why: string;
  page: string;
  /** The price while the catalog's figure is fresh, and the day it was read. */
  price?: string;
  read?: string;
  catch?: string;
}

/** GET /api/webapps/online-help */
export interface WebAppOnlineHelp {
  providers: (OnlineOffer & { server?: ServerSteps })[];
  registrars: (OnlineOffer & { record?: RecordSteps })[];
}

/** GET /api/webapps/:id/values: the names of what each place is started with (never a key's value). */
export interface WebAppStartValues {
  values: { name: string; what: 'port' | 'host' | 'data' | 'secret' | 'url' | 'key' }[];
  /** The command that runs the contract's checker on its folder in a shell. */
  check?: string;
}

/** One app with what the page of an app wants besides. */
export interface WebAppDetail extends WebApp {
  /** The last lines its server printed (oldest first, 200 at most). */
  log: string[];
}

export interface WebAppsList {
  reach: WebAppsReach;
  apps: WebApp[];
}

/** POST /api/webapps/scratch: a new app, with a folder of its own. */
export interface WebAppScratch {
  name: string;
  /** Where to make it: an absolute path that does not exist or is empty (default: a folder of its own in Hydor's web apps folder). */
  folder?: string;
}

/** POST /api/webapps */
export interface WebAppAdd {
  /** The folder the app is in (absolute): it needs a hydor.json. */
  folder: string;
  /** What to call it (default: the name in its hydor.json, else the folder's name). */
  name?: string;
}

/** PUT /api/webapps/:id: each field optional. `settings` fields not named are kept. */
export interface WebAppChange {
  name?: string;
  settings?: Partial<WebAppSettings>;
}

/** POST /api/webapps/:id/open */
export interface WebAppOpenRequest {
  /** A path inside the app to open at (starts with a slash; default /). */
  path?: string;
  /** The address is for showing the app in a frame of Hydor's own page (its Preview): the app lets that page frame it. */
  frame?: boolean;
}

/** The address that signs the person in: `hostname` is an address of the app's own, `path` one for a tunnel with a single hostname (the page runs in a sandbox there). */
export interface WebAppOpen {
  url: string;
  way: 'hostname' | 'path';
}

/** One table of an app's own database. */
export interface WebAppTable {
  name: string;
  /** How many rows it has. */
  rows: number;
  columns: { name: string; type: string; pk: boolean }[];
}

/** GET /api/webapps/:id/data */
export interface WebAppDataTables {
  /** The database file read (in the app's data folder). */
  file: string;
  /** The app has made it (false until it first runs). */
  exists: boolean;
  tables: WebAppTable[];
}

/** GET /api/webapps/:id/data/:table: a page of its rows, each a list of cells in the order of `columns`. */
export interface WebAppDataPage {
  table: string;
  /** `hidden`: the values are not shown (a password, a token, a key). */
  columns: { name: string; type: string; pk: boolean; hidden?: boolean }[];
  rows: (string | number | null)[][];
  total: number;
  offset: number;
  limit: number;
  /** Some cell was longer than the most that is sent, and was cut. */
  truncated: boolean;
}

/** A slug is safe as a hostname label. */
export const WEBAPP_SLUG = /^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/;

/** A name for an app as a slug: lower case letters, digits and single hyphens, at most 48 characters. */
export function webappSlug(name: string): string {
  return (
    String(name ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/, '') || 'app'
  );
}

/** What an app says of one key it needs (its hydor.json's `keys`, or the services catalog). */
export interface KeyInfo {
  name: string;
  why?: string;
  optional?: boolean;
  /** What the card calls its field. */
  label?: string;
  /** Who gives it: a provider's name, or host (Hydor or the server says it), made (Hydor makes it), you (the maker chooses it). */
  from?: string;
  /** Keys got together, one tab. */
  group?: { id: string; title?: string };
  /** How to get it: plain steps. */
  how?: string[];
  /** The provider's page. */
  url?: string;
  looks?: KeyLooks;
  /** False: not a secret (a client id, an address), so it is typed in the open. */
  secret?: boolean;
  /** Other keys any one of which does instead of this one. */
  or?: string[];
}

/** A key of a web app's environment: by name, who gives it, whether it is set. Never a value. */
export interface AppKey extends KeyInfo {
  /** provider: someone else's page; you: yours to choose; host and made: never asked for. */
  givenBy: 'provider' | 'you' | 'host' | 'made';
  /** The environment needs it (not only offers it). */
  needed: boolean;
  /** The vault has a value under its name. */
  set: boolean;
  /** The saved value may not be used here: a live payments key, for an app inside Hydor. */
  refused?: 'live';
  savedAt?: number;
  /** Asked with `env=all`: each place that has this key, with what is set there. */
  places?: AppKeyPlace[];
}

/**
 * Where a build of an app runs (server/webapps/build-box.ts): `registry`: in the sandbox, with no network but the package
 * registry; `open`: in the sandbox, with the network as it is; `own`: no sandbox here, with the owner's own access.
 */
export type BuildAccess = 'registry' | 'open' | 'own';
export interface BuildBox {
  access: BuildAccess;
  /** With `registry`: the hosts a build of this folder may reach (none: its folder names no packages). */
  registries: string[];
}

export interface AppKeyPlace {
  env: string;
  set: boolean;
  savedAt?: number;
  needed: boolean;
  refused?: 'live';
}

export interface WebAppKeys {
  env: string;
  /** The environments this app can show keys for: inside Hydor and its servers. */
  envs: string[];
  /** Which of them run on a server. */
  servers: string[];
  /** It runs inside Hydor there: payments take a test key only. */
  inside: boolean;
  keys: AppKey[];
}

// ---- the ideas of "What do you want to make?" ---------------------------------------------------------------------------------------

/** One kind of web app: an idea to start from, not a template. */
export interface WebKind {
  id: string;
  name: string;
  /** One sentence on who it is for. */
  who: string;
  /** What such an app usually needs, in words. */
  needs: string[];
  /** An agent app with pages of its own. */
  agent?: boolean;
  /** What the App builder is told of this kind beyond its needs (not shown to the person). */
  builder?: string;
}

/** GET /api/webapps/kinds */
export interface WebKinds {
  kinds: WebKind[];
}

/** What a conversation is told when it starts from the page (SessionExtra.webKind): checked by the server before it is told. */
export interface WebKindPick {
  /** The kind's id, or none ("something else"). */
  kind?: string;
  /** The app's name, as the person typed it. */
  name?: string;
  /** What it is for, in the person's words. */
  line?: string;
  /** The web app made for the conversation (its id), whose folder it works in. */
  app?: string;
  /** An agent app (its id) the web app is to give pages of its own. */
  agentApp?: string;
}

/** A picture of a page of an app: POST /api/webapps/:id/shot. */
export interface WebAppShot {
  /** A path inside the app (starts with a slash; default /). */
  path?: string;
  /** Who looks: the signed-in person (default), or a named test person with a role. */
  as?: string | { name: string; role?: string };
  device?: 'phone' | 'desktop';
}

// ---- the guide: stages, choices, steps and checks (docs/plans/web-apps.md, sections 7 and 8) ------------------------------------

/** The stages of making an app, in order. */
export const WEBAPP_STAGES = ['brief', 'design', 'build', 'check', 'launch', 'run'] as const;
export type WebAppStage = (typeof WEBAPP_STAGES)[number];
export const isWebAppStage = (v: unknown): v is WebAppStage => typeof v === 'string' && (WEBAPP_STAGES as readonly string[]).includes(v);

/** One thing decided along the way (`at` is a day, year-month-day). */
export interface WebAppDecision {
  at: string;
  stage: string;
  /** What was decided, in a sentence. */
  what: string;
  /** The choice card it came from (GET /api/webapps/:id/choices/:id). */
  choice?: string;
  /** designs or one. */
  shape?: ChooseShape;
}

// A card that puts real options to the maker (the `webapp_choose` tool).

export type ChooseShape = 'designs' | 'one';

/** One direction for how the app looks: a small page the agent made, with the pictures Hydor took of it. */
export interface ChooseDesign {
  id: string;
  name: string;
  /** What it is, in a line. */
  line: string;
  /** The page it was taken from (a file in the app's folder). */
  page: string;
  /** Pictures (ids Hydor keeps) on a computer and on a phone, dark. */
  pictures: { desktop?: string; phone?: string };
  /** The same two in the light look (the card shows the one that fits the page). */
  light?: { desktop?: string; phone?: string };
}

/** One of a few real choices, with a picture or without. */
export interface ChooseOption {
  id: string;
  title: string;
  line?: string;
  /** A picture id (from webapp_look). */
  picture?: string;
  /** When the option is a place on the web to look at (https). */
  url?: string;
}

/** What `webapp_choose` shows (and what the card is drawn from). */
export interface WebAppChoose {
  /** Made by the tool. */
  id: string;
  /** The web app (its id) the choice is for. */
  app: string;
  shape: ChooseShape;
  stage: WebAppStage;
  title: string;
  message?: string;
  designs?: ChooseDesign[];
  options?: ChooseOption[];
  /** one: the maker may write an answer of their own. */
  other?: boolean;
  submit?: string;
}

/** What the maker answered (sent by the card as JSON). */
export type ChooseAnswer = { shape: 'designs'; pick: string; take?: string; youDecide?: boolean } | { shape: 'one'; pick?: string; other?: string; youDecide?: boolean };

/** A choice as kept (GET /api/webapps/:id/choices): what was offered, what was picked, and the decision in a sentence. */
export interface WebAppChoice {
  id: string;
  shape: ChooseShape;
  stage: WebAppStage;
  title: string;
  /** ms since 1970. */
  at: number;
  offered: WebAppChoose;
  answer: ChooseAnswer;
  /** The decision in a sentence. */
  summary: string;
}

/** GET /api/webapps/:id/choices */
export interface WebAppChoices {
  choices: WebAppChoice[];
}

/** One kind of thing the app keeps, in a sketch: what is kept of it, in plain words, and who may see it. */
export interface SketchKeeps {
  /** What it is called in the app ("Customers"). */
  title: string;
  /** What is kept of each, in words ("name, phone, notes"). */
  line?: string;
  /** Who may see it, in words ("Only you", "Everyone who signs in"). */
  who: string;
}

/** The sketch of a web app, as `app_sketch` with kind "web" gives it to the card. */
export interface WebSketch {
  kind: 'web';
  name: string;
  description: string;
  /** The idea it is closest to, when there is one. */
  type?: { id: string; title: string };
  who: string;
  does: string[];
  keeps: SketchKeeps[];
  runs: string;
}

// The app's steps (its own git repository).

/** One step of an app: a commit of its folder. */
export interface WebAppStep {
  sha: string;
  /** What changed for the maker, in the words of the commit. */
  message: string;
  /** ms since 1970. */
  at: number;
  /** How many files it changed. */
  files: number;
  /** It put the files back as they were at an earlier step. */
  back?: { to: string };
}

/** GET /api/webapps/:id/steps */
export interface WebAppSteps {
  /** The folder is a git repository (Hydor makes it one when it registers an app). */
  repo: boolean;
  /** Newest first. */
  steps: WebAppStep[];
  /** What is in the folder now and is not in a step yet (files changed, added or removed). */
  unsaved: number;
}

/** POST /api/webapps/:id/steps */
export interface WebAppStepSave {
  /** What changed for the maker ("Added team invitations"). */
  message: string;
  /** The stage the app is at now. */
  stage?: string;
}

// The checks.

export type CheckState = 'passed' | 'failed' | 'note' | 'notRun';

/** One line of the check of an app (contract-check.ts). */
export interface CheckLine {
  id: string;
  state: CheckState;
  /** The plain sentence: what was looked at, and what is wrong when it failed. */
  text: string;
  /** What to do about it. */
  hint?: string;
  /** A plain name for the line. */
  title?: string;
  group?: string;
  /** The particulars: each page, control or file that is the matter (at most eight). */
  details?: string[];
  /** It failed in the run before this one and passes now: shown as fixed until the next run. */
  fixed?: boolean;
}

/** GET /api/webapps/:id/checks: the last check, as lines. */
export interface WebAppChecks {
  /** It was run at least once since Hydor kept results. */
  ran: boolean;
  /** ms since 1970. */
  at: number | null;
  summary: string | null;
  /** Nothing failed (a line that could not run is not a failure, and is said). */
  ok: boolean | null;
  lines: CheckLine[];
  counts?: { passed: number; failed: number; couldNotRun: number };
  /** The check did not finish: why. */
  problem?: string;
  /** The check is running now, and what it is doing. */
  running?: { startedAt: number; step: string };
  /** The page checks in at most a dozen lines, failures first, as the agent is told them. */
  pagesSummary?: string;
  /** Why signed-in pages were not looked at, when they were not. */
  signedIn?: string;
  /** What no script can judge about the pages: still to be looked at by a person. */
  notCovered?: string[];
}

/** Lines the contract check makes that are warnings, never a launch's stop: they sit with the pages' lines, and are told to the agent with the contract's. */
export const CONTRACT_WARNINGS = ['paths'];

/** Whether the contract check made this line (not the checks of the pages). */
export const fromContract = (l: Pick<CheckLine, 'id' | 'group'>) => !l.group || l.group === 'contract' || CONTRACT_WARNINGS.includes(l.id);

/** The lines of the page checks that stop a launch: what could hurt someone. Every failed line of the contract stops one too. */
export const PAGE_LINES_THAT_STOP = ['browser-keys', 'cross-site-forms', 'cookie-flags', 'pages-answer'];

/** Whether a failed line stops a launch (the owner may let one through). */
export const stopsLaunch = (l: Pick<CheckLine, 'id' | 'state' | 'group'>) => l.state === 'failed' && (!l.group || l.group === 'contract' || PAGE_LINES_THAT_STOP.includes(l.id));

/** The file of the app's brief, docs/brief.md. */
export interface WebAppBrief {
  exists: boolean;
  text: string;
}

// ---- an agent app linked to a web app: what its Flows tab shows ----------------------------------------------------------------

/** One question or answer field of a flow, as the pages say it in plain words. */
export interface JoinField {
  id: string;
  label: string;
  /** What kind of thing it is, in the app's own words (text, long text, number, yes or no, date, choice, file; markdown, list, table, link…). */
  type: string;
  required?: boolean;
  /** A choice's words. */
  options?: string[];
  /** A table's columns, by label. */
  columns?: string[];
}

/** One flow of an agent app: its form's questions and its answer's fields. */
export interface JoinFlow {
  id: string;
  name: string;
  form: JoinField[];
  answer: JoinField[];
}

/** One run of a web app's flows, as the Flows tab lists it. */
export interface FlowsRun {
  id: string;
  flow: string;
  status: string;
  /** Who it acted for (null: nobody). */
  person: { id: string; name: string } | null;
  inputs?: string;
  createdAt: number;
  endedAt?: number;
  costUsd?: number;
  /** The reference the app started it with, when it did. */
  ref?: string;
  /** Hydor's own page for the run. */
  path: string;
}

/** One function the web app offers its agents, for the Flows tab. */
export interface FlowsFunction {
  name: string;
  description: string;
  writes: boolean;
  allowed: boolean;
  /** A function that changes things is allowed without asking the person first (off: it asks on a card the first time in a run). */
  withoutAsking: boolean;
  /** Offered to the agents in sessions too (a second switch): they find it with webapp_list_functions and call it as the person the session belongs to. */
  inSessions: boolean;
  /** A function that changes things is offered to sessions without asking the person first. */
  inSessionsWithoutAsking: boolean;
}

/** GET /api/webapps/:id/flows/overview */
export interface FlowsOverview {
  app: { id: string; slug: string; name: string; description: string };
  flows: JoinFlow[];
  runs: FlowsRun[];
  functions: { file: "ok" | "missing" | "broken"; problems: string[]; list: FlowsFunction[] };
  spend: { todayUsd: number; capUsd: number; /** Texts its search had made into vectors today, and the most a day: present when it asks Hydor for them. */ meaning?: { texts: number; limit: number } };
}

/** GET /api/webapps/:id/flows/offer: what "Add agents' work" can link: a small starting recipe, or one of the agent apps that is free. */
export interface FlowsOffer {
  /** The agent apps that are not the flows half of any web app. */
  apps: { id: string; slug: string; name: string; description: string; icon: string; color: string; flows: JoinFlow[] }[];
  /** What a new app made from the starting recipe would be. */
  starting: { name: string; description: string; flow: JoinFlow };
  /** Why it cannot be done now, when it cannot (it has flows already). */
  problem?: string;
}

// ---- Launch and Run (docs/plans/web-apps.md, sections 8 and 9) ----------------------------------------------------------------

/** The places an app can go. */
export const LAUNCH_PLACES = ['hydor', 'server'] as const;
export type LaunchPlaceId = (typeof LAUNCH_PLACES)[number];

/** One place on the places card. */
export interface LaunchPlace {
  id: LaunchPlaceId;
  title: string;
  /** What it means, in one plain sentence. */
  line: string;
  /** What it costs the person in effort. */
  effort: string;
  /** What it costs each month, in a few words. */
  cost: string;
  /** ready: Hydor does it; unavailable: not for this app (`unavailable` says why and what to do). */
  state: 'ready' | 'unavailable';
  unavailable?: string;
  /** Where the app is launched to now (a launched version inside Hydor, or an environment on a server), if it is. */
  launched?: { env: string; at: number; version?: string; address?: string; host?: string };
  /** The servers the services catalog names for it, with their sentence and price (shared/services.ts). */
  offers?: { name: string; recommended: boolean; why: string; price?: string; catch?: string; page: string; readOn?: string }[];
  /** What cannot be had for now (the catalog holds it back), with why and the page that says so. */
  notOffered?: { name: string; why: string; url: string }[];
}

/** One step of a launch, as it ends. */
export interface LaunchStep {
  id: string;
  title: string;
  state: 'waiting' | 'running' | 'passed' | 'failed' | 'skipped';
  /** What it did or why it failed, in a sentence. */
  say?: string;
  /** The particulars of a failure (the last lines of a log). */
  details?: string[];
  /** How long it took. */
  ms?: number;
}

/** A line of the check that stopped a launch, which the person may let through. */
export interface LaunchStop {
  id: string;
  title: string;
  group?: string;
  text: string;
  hint?: string;
  /** Which pages, controls or files (at most a few). */
  details?: string[];
}

/** What a launch asks the person on a card, while it waits. */
export type LaunchAsk = { kind: 'override'; stops: LaunchStop[] } | { kind: 'restore'; message: string; backup: string };

/** A launch (or a way back), as a job: inside Hydor, or to a server. */
export interface LaunchJob {
  id: string;
  app: string;
  place: 'hydor' | 'server';
  /** launch, back or restore. */
  action: 'launch' | 'back';
  env: string;
  host?: string;
  address?: string;
  state: 'running' | 'asking' | 'done' | 'failed';
  steps: LaunchStep[];
  /** A line in plain words for the end (what happened, and for a failure what happened to the previous version). */
  summary?: string;
  problems?: string[];
  /** What else a person should know, said when it worked too. */
  notes?: string[];
  /** A way back that needs the data put back too (the database has changed shape since). */
  needsData?: boolean;
  /** How long people reached nothing, in seconds. */
  downtimeSeconds?: number | null;
  /** The previous version came back by itself (a server launch that failed after the switch). */
  previousBack?: boolean;
  /** What the job waits for. */
  ask?: LaunchAsk;
  /** The lines of the check that were let through. */
  overrides?: string[];
  startedAt: number;
  endedAt: number | null;
  /** The record this launch made (its id). */
  record?: string;
}

/** What Hydor keeps of each launch: when, who, the commit, the lines let through, how long. */
export interface LaunchRecord {
  id: string;
  app: string;
  place: 'hydor' | 'server';
  env: string;
  host?: string;
  address?: string;
  /** The commit that was launched. */
  commit: string;
  version?: string;
  by: string;
  at: number;
  ms: number;
  result: 'live' | 'failed' | 'rolled-back' | 'back';
  overrides: string[];
  /** Inside Hydor: the backup taken just before it replaced the one before. */
  backup?: string;
  /** Inside Hydor: the one before it (the way back). */
  previous?: string;
  downtimeSeconds?: number | null;
  summary?: string;
  /** On a server: the id of the record the server keeps. */
  remote?: string;
}

/** What Hydor remembers being deployed on a server of the person's own. */
export interface Deployment {
  app: string;
  /** The place's name for this app: production, or another (staging…). Its keys are kept under it. */
  env: string;
  host: string;
  /** The deployment's name on the server. */
  name: string;
  address: string;
  commit: string;
  /** When it was last launched or gone back (ms). */
  at: number;
}

/** A host: a server of the person's own. */
export interface LaunchHost {
  name: string;
  /** user@address[:port]. */
  ssh: string;
  user?: string;
  address?: string;
  port?: number;
  /** The host's key as recorded (the person accepted it). */
  fingerprint?: string;
  keyType?: string;
  /** Hydor made the key pair for it and kept it (the public key to put on the server). */
  publicKey?: string;
  /** The one line to paste in ~/.ssh/authorized_keys on the server, or in the provider's SSH keys box. */
  authorizedLine?: string;
  /** Recorded (accepted) or only made (waiting for the key to be put on the server and its fingerprint accepted). */
  state: 'made' | 'recorded';
  checked?: { at: number; ok: boolean; looked: { what: string; ok: boolean | null; say: string }[] };
  /** The web apps Hydor has deployed on it, by name. */
  apps?: string[];
}

/** POST /api/webapps/hosts */
export interface LaunchHostAdd {
  name: string;
  /** user@address[:port]. */
  ssh: string;
}

/** The fingerprints a machine offered (nothing is recorded until one is accepted). */
export interface LaunchHostOffer {
  offered: { type: string; fingerprint: string }[];
  /** Where to compare one: in plain words. */
  where: string;
  problem?: string;
}

/** One key an app needs on a server, and where its value is to come from. */
export interface LaunchKey {
  name: string;
  /** vault: saved for that place; server: the server holds it from a launch before; made: the server makes it; missing: it has to be asked for. */
  state: 'vault' | 'server' | 'made' | 'missing';
  /** Why the app needs it (its hydor.json's words). */
  why?: string;
}

/** What the Launch tab reads. */
export interface WebAppLaunchView {
  places: LaunchPlace[];
  /** The two sides inside Hydor: the launched version and the one being changed. */
  hydor: {
    launched: LaunchRecord | null;
    previous: LaunchRecord | null;
    /** The launched version's address people open (null while it is not launched). */
    openable: boolean;
    /** What was committed since the launched commit (the version being changed is ahead). */
    ahead: number | null;
    /** Changes not yet saved as a step. */
    unsaved: boolean;
    /** The launched side's own state. */
    run: WebAppRun | null;
  };
  /** The places that run on a server, with what is remembered of them. */
  envs: (Deployment & { keys: LaunchKey[]; last: LaunchRecord | null })[];
  hosts: LaunchHost[];
  /** What a launch to a server would build it with, or why it cannot be built. */
  serverBuild?: { ok: boolean; say: string };
  /** The launch that is going, or the last one that ended. */
  job: LaunchJob | null;
  history: LaunchRecord[];
  /** Why it cannot be launched yet, in a sentence, or null. */
  blocked?: string | null;
}

/** POST /api/webapps/:id/launch/hydor */
export interface LaunchHydorBody {
  /** Check line ids to let through (each is recorded). */
  override?: string[];
}

/** POST /api/webapps/:id/launch/server */
export interface LaunchServerBody {
  host: string;
  env?: string;
  /** https://… the name that points at the machine. */
  address: string;
  override?: string[];
}

/** One backup, as its manifest says. */
export interface RunBackup {
  id: string;
  /** manual, launch, scheduled, pre-launch, before-restore… */
  label: string | null;
  at: number;
  bytes: number;
  tables: Record<string, number>;
  files?: number;
  /** The app was stopped while it was copied (it names no SQLite database that can be copied while it runs). */
  stopped?: boolean;
  /** Copied to storage elsewhere (S3). */
  elsewhere?: boolean;
}

export interface RunStatus {
  /** hydor, or the name of a place on a server. */
  place: string;
  kind: 'hydor' | 'server';
  /** A server: the host's name. */
  host?: string;
  up: boolean | null;
  /** What it says in a line, in plain words. */
  say: string;
  version?: string;
  /** When it has been running since (ms). */
  since?: number | null;
  lastLaunch?: { at: number; result: string; version?: string } | null;
  lastBackup?: { id: string; at: number; ageHours: number } | null;
  disk?: { freeGb: number | null; say: string } | null;
  /** In the log since the period asked for. */
  errors?: number;
  requests?: number;
  address?: string;
  /** The services (a server: app, caddy, backup). */
  services?: { name: string; up: boolean | null }[];
  /** The backup time and days kept, when the place says. */
  schedule?: { at: string; keepDays: number } | null;
  problem?: string;
}


/** What the Run tab reads for one app: a status for each place it is launched to, and the weekly check. */
export interface WebAppRunView {
  places: RunStatus[];
  weekly: WeeklyCheck | null;
}

/** The weekly check of a launched app: what it found and when it ran. */
export interface WeeklyCheck {
  at: number;
  /** Things that need the person, plain words, each with where to look. */
  /** `days`: how old the last backup is, for one that is too old. */
  needs: { id: string; say: string; tab: 'run' | 'launch'; days?: number }[];
  /** What it looked at (so a quiet week says what was fine). */
  looked: string[];
  next: number | null;
}

/** A count with its noun, the noun singular for one: `count(1, "error")` is "1 error", `count(3, "error")` "3 errors" (`count(2, "day")`, `count(0, "box", "boxes")`). */
export const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

// ---- a server of your own ---------------------------------------------------------------------------------------------------

/** An app that lets Hydor say who is there cannot go to a server: nobody there vouches for who is signed in. */
export const SERVER_NEEDS_ACCOUNTS =
  'It lets Hydor say who is signed in ("signIn": "hydor"), which nothing on a server can do, so ask the agent to give it accounts of its own first.';
