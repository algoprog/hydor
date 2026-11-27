// Every option of Settings for agents (and any client of the API): what it holds now and how to change it, in one place.
// GET /api/settings lists them by section with their values (or one, at /api/settings/:id); PUT /api/settings/:id
// changes one; POST /api/settings/:id/run presses a button. They rest on the terminal's table of every option
// (server/tui/settings-table.ts, which `hydor settings` reads and changes the same way, and whose test fails when an
// option of the page has no row), called in this process. Settings kept in each browser (theme, language…) come from
// the pages open now (shared/device.ts); an option the table cannot change says how an agent does it instead (WAYS:
// its own endpoints or tools, or why only the person can). app_api asks the user about a change made here as it asks
// about the calls the change makes (api.ts, settingChange).
import type { FastifyInstance } from 'fastify';
import { DEVICE_VALUES, type DeviceReport } from '../../shared/device.ts';
import { OPTIONS, SECTIONS } from '../../shared/find-catalog.ts';
import type { Deps } from '../features/types.ts';
import { internalHeaders } from '../internal.ts';
import { UsageError } from '../tui/args.ts';
import { choicesOf, findRow, findSection, jsonValue, parseValue, readAll, ROWS, runAction, settingsAddress, setRow, type Ctl, type Row, type Value } from '../tui/settings-table.ts';

/** A call the app answered with an error: its status and what it said. */
export class CallError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The app's own API, called in this process as the signed-in user (as the terminal calls it over HTTP). */
export function inProcess(app: FastifyInstance, timeoutMs = 15_000): Ctl {
  return {
    async api<T>(method: string, p: string, body?: unknown, o: { timeoutMs?: number } = {}): Promise<T> {
      const payload = body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined;
      let timer: NodeJS.Timeout | undefined;
      const res = await Promise.race([
        app.inject({ method: method as 'GET', url: p, payload, headers: { ...internalHeaders(), ...(payload ? { 'content-type': 'application/json' } : {}) } }),
        new Promise<never>((_, no) => {
          timer = setTimeout(() => no(new CallError(504, `${p.split('?')[0]} took too long to answer`)), o.timeoutMs ?? timeoutMs);
          timer.unref();
        }),
      ]).finally(() => clearTimeout(timer));
      let data: any = res.body;
      try {
        data = res.body ? JSON.parse(res.body) : {};
      } catch {}
      if (res.statusCode >= 400) throw new CallError(res.statusCode, data && typeof data === 'object' && typeof data.error === 'string' ? data.error : `${res.statusCode} ${String(res.body).slice(0, 200)}`);
      return data as T;
    },
  };
}

// ---- how an agent does what the table cannot -------------------------------------------------------------------------

/** For an option the table leaves to a page or a command of its own: how an agent does it (`how`), or why only the person can (`only`). */
export interface Way {
  how?: string;
  only?: string;
}

const TASKS = 'schedule_task, update_task and list_tasks (your tools), or GET and POST /api/tasks (app_guide topic api, “Scheduled tasks”)';
const EXAMPLE = 'A scheduled task with its prompt and schedule filled in: make it with schedule_task (see tasks.new-task)';
const SKILLS = 'GET /api/skillpack → skills (source bundled, learned or plugin); PUT /api/skillpack/skills/:name/off { off: true|false } switches one; GET and PUT /api/skillpack/skills/:name read and change its text (or skill_patch)';
const THEMES = 'GET /api/themes, then PUT /api/themes with every theme to keep and the new one ({ id, name, base: "dark"|"light", colors }); show it on a device with PUT /device { themeName }';
const ACP = 'GET /api/acp-agents (agents, and presets to add); POST /api/acp-agents { id?, name, command, args?, env? } adds one or changes the one with that id; DELETE /api/acp-agents/:id removes it';
const OWN_BROWSING = 'That is the person’s own browsing (the Browser page), which agents never use: they change it there.';

export const WAYS: Record<string, Way> = {
  'general.new-theme': { how: THEMES },
  'general.import': { how: `A shared theme is JSON { name, base, colors }: add it with an id of its own the same way. ${THEMES}` },
  'general.take-the-tour': { only: 'The tour runs in the browser: give the person the link, and it starts there.' },
  'phone.serve-it-on-my-devices': { how: 'GET /api/phone (Tailscale’s state), then POST /api/phone/serve { port?: 443|8443|10000 }, which asks the person every time' },
  'phone.tailscale-on-this-computer': { how: 'GET /api/phone → tailscale' },
  'phone.open-it-on-your-phone': { how: 'GET /api/phone → serving.url: the address to open on the phone' },
  'phone.stop-serving': { how: 'POST /api/phone/stop' },
  'phone.add-to-home-screen': { only: 'Done on the phone itself: Share → Add to Home Screen on an iPhone, the browser’s menu on Android.' },
  'security.change-password': { only: 'The password is the person’s alone: Settings → Password.' },
  'signatures.new-signature': { how: 'ask_signature (your tool) shows the person a card to draw one on; place_signature places one by name. GET /api/signatures lists them by name.' },
  'scm.add-an-account': { how: 'GET /api/scm/accounts; POST /api/scm/accounts { provider: "github"|"gitea", web?, useGh: true } uses gh’s sign-in when gh is true; DELETE /api/scm/accounts/:id removes one. A token only the person enters, on the page.' },
  'connect.what-they-can-do': { how: 'GET /api/mcp/tokens lists the tokens; DELETE /api/mcp/tokens/:id revokes one. A token gives list_sessions, read_session, start_session, send_message, list_models and the apps offered to other agents.' },
  'machines.add-a-machine': { how: 'GET /api/machines; PATCH /api/machines/:id, POST /api/machines/:id/reconnect and DELETE /api/machines/:id change one. Adding one takes a token from the other machine, which only the person enters (Settings → Machines).' },
  'machines.access-from-other-machines': { how: 'GET /api/access-tokens lists them; DELETE /api/access-tokens/:id revokes one. Only the person makes one (Settings → Machines), so its value never passes through an agent.' },
  'accounts.accounts': { how: 'GET /api/accounts; POST /api/agent-accounts { agent: "claude"|"codex"|"grok", name } adds one (Antigravity CLI has its own sign-in only), PATCH /api/agent-accounts/:id { name } renames it, DELETE /api/agent-accounts/:id removes it. Signing in and out is the person’s (Settings → Accounts).' },
  'agents.your-agents': { how: ACP },
  'agents.add-your-own': { how: ACP },
  'agents.agents-that-speak-acp': { how: ACP },
  'models.tiers': { how: 'GET /api/models/tiers; PUT /api/models/tiers { tiers: { claude|codex|console: { quick|standard|best|max: { model, effort } } } }' },
  'models.runtimes-and-endpoints': { how: 'This value is Ollama’s address. Endpoints and what each of their models can do (images, reasoning, effort levels): GET /api/models → endpoints; PUT /api/models { endpointModel: { endpoint, model, vision?, reasoning?, efforts? } } or { endpoint: { name, baseUrl } }; an endpoint’s key is the person’s' },
  'models.your-subscriptions': { how: 'GET /api/models → subscriptions. Signing in is the person’s (Settings → Accounts).' },
  'models.on-this-machine': { how: 'GET /api/models → local; POST /api/models/start { repo }, POST /api/models/stop { repo }, POST /api/models/remove { id }' },
  'models.add-a-model-from-hugging-face': { how: 'GET /api/models/picks, or GET /api/models/hf?q=; POST /api/models/install { repo } or { ollama } (its progress: GET /api/models → downloads)' },
  'guidelines.for-a-project': { how: 'GET /api/guidelines?space=<project id>; PUT /api/guidelines { space: { id, text } }' },
  'guidelines.for-one-session': { how: 'GET /api/guidelines?key=this; PUT /api/guidelines { session: { key: "this" (or a session’s key), text } }' },
  'guidelines.instruction-files': { how: 'GET /api/setup/instructions?agent=claude|codex&cwd=<folder> lists them; read and change a file with your own file tools.' },
  'mcp.add-server': { how: 'GET /api/setup/mcp; POST /api/setup/mcp { agents: ["claude","codex","custom"], name, transport: "stdio"|"http"|"sse", command?, args?, url?, scope?, cwd? }; PUT /api/setup/mcp/custom/:name changes one of Custom’s; POST /api/setup/mcp/remove { agent, name, scope?, cwd? }. Keys, tokens and signing in (Sign in on the server) are the person’s.' },
  'skills.new-skill': { how: 'skill_save (your tool), or POST /api/skillpack/skills { name, description, body }' },
  'skills.built-in': { how: SKILLS },
  'skills.yours': { how: `${SKILLS}; POST /api/skillpack/skills/:name/remove removes one of yours` },
  'skills.from-plugins': { how: SKILLS },
  'skills.claude-code-and-codex': { how: 'GET /api/setup/skills?cwd=; POST /api/setup/skills/toggle { agent, name, path, enabled }; POST /api/setup/skills/delete { agent, path }' },
  'skills.make-my-own-version': { how: 'GET /api/skillpack/skills/:name, then PUT /api/skillpack/skills/:name { text } (or skill_patch); POST /api/skillpack/skills/:name/remove brings the built-in one back' },
  'plugins.your-plugins': { how: 'GET /api/plugins → installed; POST /api/plugins/:name/enable, /disable, /update, /setup or /remove' },
  'plugins.come-with-the-app': { how: 'GET /api/plugins → available; POST /api/plugins/install { name }' },
  'plugins.make-a-plugin': { how: 'POST /api/plugins/new { name, title?, description? }, then PUT /api/plugins/:name/draft (app_guide topic api, “Plugins”)' },
  'plugins.from-a-link': { how: 'POST /api/plugins/inspect { url, ref?, subdir? }, then POST /api/plugins/install { token }' },
  'plugins.from-a-zip-file': { how: 'From a folder: POST /api/plugins/inspect { path }, then POST /api/plugins/install { token }. A .zip file the person adds on the page.' },
  'plugins.pack-into-a-zip': { only: 'The page downloads the plugin as one file, which an agent cannot hand over.' },
  'plugins.claude-code': { how: 'GET /api/setup/plugins?q=; POST /api/setup/plugins/install|uninstall|enable|disable { id, scope? }; POST /api/setup/marketplaces/add|remove { target }' },
  'plugins.codex': { how: 'GET /api/setup/codex-plugins?q=; POST /api/setup/codex-plugins/add|remove { id }; POST /api/setup/codex-marketplaces/add|remove|upgrade { target }' },
  'tasks.new-task': { how: TASKS },
  'tasks.week-view': { how: 'GET /api/automations/week?start=YYYY-MM-DD&days=7' },
  'tasks.start-from-an-example': { how: EXAMPLE },
  'browser.bookmarks': { only: OWN_BROWSING },
  'browser.extensions': { only: OWN_BROWSING },
  'browser.browser-settings': { only: OWN_BROWSING },
  'memory.wiki-folder': { how: 'GET /api/wiki/settings → hubPath; PUT /api/wiki/settings { hubPath } while the folder it has now is empty. Moving a wiki that has files the person reviews on the page.' },
  'memory.notes': { how: 'recall, remember and forget (your tools), or GET /api/memory/entries?q=, PATCH and DELETE /api/memory/entries/:id' },
  'memory.add-a-note': { how: 'remember (your tool), or POST /api/memory/entries { text, scope?, key? }' },
  'memory.deleted-notes': { how: 'GET /api/memory/entries?status=deleted; POST /api/memory/entries/:id/restore' },
  'memory.bring-in': { how: 'GET /api/memory/bring-in; POST /api/memory/bring-in/read, then POST /api/memory/bring-in/apply { notes, profile? } with the notes the person picked. An export file the person adds on the page.' },
  'assistants.your-agents': { how: 'list_agents, save_agent and delete_agent (your tools)' },
  'apps.about-you': { how: 'GET /api/apps/me; PUT /api/apps/me { home?, country?, language?, units?, currency?, diet?, household?, services?, teams?, fields?, topics?, venues?, author?, compute? }, which asks the person every time' },
  'custom.auto-mode': { how: 'A Custom session’s own mode: POST /api/sessions/this/config { mode: "auto" }, which asks the person every time' },
};
// The ready-made scheduled tasks are made as any task is.
for (const [s, l] of OPTIONS) if (s === 'tasks' && !WAYS[`tasks.${slugOf(l)}`]) WAYS[`tasks.${slugOf(l)}`] = { how: EXAMPLE };

function slugOf(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---- settings kept on each device ---------------------------------------------------------------------------------------

type Device = DeviceReport & { at: number; showing: boolean };

/** How an agent changes a device option (app_api's PUT /device), by the table's device key. */
const DEVICE_SET: Record<string, string> = {
  theme: 'PUT /device { theme: "dark"|"light"|"system", themeName?: a theme’s name }',
  language: 'PUT /device { language } (the page reloads)',
  motion: 'PUT /device { motion: "full"|"calm"|"off" }',
  textSize: 'PUT /device { textSize: "default"|"large"|"larger" }',
  sound: 'PUT /device { sound: true|false }',
  enter: 'PUT /device { enter: "join"|"queue" }',
  suggestions: 'PUT /device { terminalSuggestions: true|false }',
  'word-suggestions': 'PUT /device { wordSuggestions: true|false }',
  'technical-details': 'PUT /device { technicalDetails: true|false }',
  dictation: 'PUT /device { dictation: "browser"|"server" }',
  'speech-language': 'PUT /device { voiceLanguage: a tag such as "de-DE", or "" for the browser’s }',
  'read-aloud': 'PUT /device { readingVoice: one of its voices, or "" for the browser’s pick; readingSpeed: 0.5 to 2 }',
};
/** Device options only the person changes, on that device. */
const DEVICE_ONLY: Record<string, string> = {
  push: 'Each device turns notices on for itself: its browser asks the person’s permission (Settings → Notifications → Notify this device, on that device).',
  signout: 'Only the person signs a browser out (Settings → Password, in that browser).',
};

/** A device option's value, from what a page's browser keeps. */
function deviceValue(r: Row, d?: DeviceReport): unknown {
  if (!d || !r.device) return undefined;
  const s = d.settings;
  switch (r.device.key) {
    case 'theme':
      return s.theme === undefined ? undefined : { theme: s.theme, darkTheme: s.darkTheme, lightTheme: s.lightTheme };
    case 'language':
      return s.language;
    case 'motion':
      return s.motion;
    case 'textSize':
      return s.textSize;
    case 'sound':
      return s.sound;
    case 'enter':
      return s.enter;
    case 'suggestions':
      return s.terminalSuggestions;
    case 'word-suggestions':
      return s.wordSuggestions;
    case 'technical-details':
      return s.technicalDetails;
    case 'push':
      return d.notifications;
    case 'dictation':
      return s.dictation;
    case 'speech-language':
      return s.voiceLanguage;
    case 'read-aloud':
      return s.readingVoice === undefined && s.readingSpeed === undefined ? undefined : { readingVoice: s.readingVoice, readingSpeed: s.readingSpeed, ...(d.voices ? { voices: d.voices } : {}) };
    default:
      return undefined;
  }
}

const yes = (v: unknown) => (typeof v === 'string' ? /^(on|true|yes|1)$/i.test(v.trim()) : !!v);

/** A device option's new value as app_api's PUT /device body; null when it is not one an agent sets. */
export function deviceBody(r: Row, v: unknown): Record<string, unknown> | null {
  const k = r.device?.key;
  const obj = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  switch (k) {
    case 'theme':
      return obj ?? (typeof v === 'string' ? (['dark', 'light', 'system'].includes(v) ? { theme: v } : { themeName: v }) : null);
    case 'read-aloud':
      return obj ?? (typeof v === 'number' ? { readingSpeed: v } : typeof v === 'string' ? { readingVoice: v } : null);
    case 'sound':
      return { sound: yes(v) };
    case 'suggestions':
      return { terminalSuggestions: yes(v) };
    case 'word-suggestions':
      return { wordSuggestions: yes(v) };
    case 'technical-details':
      return { technicalDetails: yes(v) };
    case 'language':
    case 'motion':
    case 'textSize':
    case 'enter':
    case 'dictation':
      return { [k]: v };
    case 'speech-language':
      return { voiceLanguage: v };
    default:
      return null;
  }
}

// ---- reading -----------------------------------------------------------------------------------------------------------

/** What an option takes, in a few words, for a change through PUT /api/settings/:id. */
async function takes(ctl: Ctl, r: Row, full: boolean): Promise<{ takes?: string; choices?: { value: string; label: string }[] }> {
  if (r.readonly || !r.write) return {};
  switch (r.kind) {
    case 'switch':
      return { takes: 'true or false' };
    case 'number':
      return { takes: r.range ? `a whole number from ${r.range.min} to ${r.range.max}` : 'a whole number' };
    case 'text':
      return { takes: r.multiline ? 'text (it may be long)' : 'text' };
    case 'list':
      return { takes: `a list${r.items ? `: ${r.items}` : ''} (an array, or items with commas)` };
    case 'choice': {
      const cs = full || !r.load ? await choicesOf(ctl, r) : (r.choices ?? []);
      const free = r.free ? ', or another value' : '';
      if (full) return { takes: `one of the choices${free}`, choices: cs.map((c) => ({ value: c.value, label: c.label })) };
      if (r.load) return { takes: `a value from GET /api/settings/${r.id}${free}` };
      return { takes: `${cs.map((c) => c.value).join(' | ')}${free}` };
    }
    default:
      return {};
  }
}

export interface Listed {
  id: string;
  label: string;
  kind: string;
  value?: unknown;
  error?: string;
  /** For PUT /api/settings/:id { value }. */
  takes?: string;
  choices?: { value: string; label: string }[];
  /** How it changes otherwise: PUT /device, POST …/run, the endpoints or tools of its own. */
  change?: string;
  /** Only the person can: why, and where. */
  only?: string;
  note?: string;
  link?: string;
}

/** One option as listed: its value, and how it changes. `full`: with its choices, note and link (a few options asked for). */
async function listed(ctl: Ctl, r: Row, read: { value?: Value; error?: string } | undefined, dev: Device | undefined, full: boolean): Promise<Listed> {
  const out: Listed = { id: r.id, label: r.label, kind: r.kind };
  if (r.device) {
    const v = deviceValue(r, dev);
    if (v !== undefined) out.value = v;
    else if (DEVICE_SET[r.device.key]) out.error = dev ? 'not told by that page' : 'no page of the app is open to tell it';
    if (DEVICE_SET[r.device.key]) out.change = DEVICE_SET[r.device.key];
    if (DEVICE_ONLY[r.device.key]) out.only = DEVICE_ONLY[r.device.key];
  } else {
    if (read?.error) out.error = read.error;
    else if (read && read.value !== undefined) out.value = jsonValue(r, read.value);
    const way = WAYS[r.id];
    if (way?.how) out.change = way.how;
    if (way?.only) out.only = way.only;
    if (r.kind === 'secret') out.only = `A key’s value never passes through an agent: the person enters it in Settings (${settingsAddress(r)}). PUT /api/settings/${r.id} { value: "" } removes it.`;
    else if (r.kind === 'action' && r.act) out.change = `POST /api/settings/${r.id}/run${r.act.arg ? ` { arg: ${r.act.arg} }` : ''}`;
    else Object.assign(out, await takes(ctl, r, full));
  }
  if (full) {
    if (r.note) out.note = r.note;
    out.link = settingsAddress(r);
  }
  return out;
}

export interface ListQuery {
  section?: string;
  q?: string;
  id?: string;
  /** The session asking (app_api adds it): a device showing it gives the device's own settings. */
  key?: string;
  values?: string;
}

const STOP = new Set('a an and are be can do does for how i in is it me my of on or the to what which with you your'.split(' '));
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(ings?|ed|es|s)$/, '') : w));

/** The rows a query asks for: by id, section or words (those with every word, else with the most; its own words count twice). */
export function rowsFor(qy: ListQuery): Row[] {
  if (qy.id) return [findRow(qy.id)];
  let pool = ROWS;
  if (qy.section) {
    const ids = qy.section.split(',').map((x) => findSection(x.trim())?.id ?? x.trim());
    pool = pool.filter((r) => ids.includes(r.section));
    if (!pool.length) throw new UsageError(`No section “${qy.section}”. The sections: ${SECTIONS.map(([id]) => id).join(', ')}.`);
  }
  const q = qy.q ? [...new Set(words(qy.q))] : [];
  if (!q.length) return pool;
  const has = (ws: string[], w: string) => ws.some((h) => h === w || h.startsWith(w));
  const scored = pool
    .map((r) => {
      const own = words(r.label);
      const all = words(textOf(r));
      const n = q.filter((w) => has(all, w)).length;
      return { r, n, score: n + q.filter((w) => has(own, w)).length };
    })
    .filter((x) => x.n > 0);
  const every = scored.filter((x) => x.n === q.length);
  return (every.length ? every : scored)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map((x) => x.r);
}

/** What an option is searched by: its words, the catalog's other words and what it does, its section's name. */
function textOf(r: Row): string {
  const o = OPTIONS.find(([s, l]) => s === r.section && l === r.label);
  const sec = SECTIONS.find(([id]) => id === r.section);
  return [r.label, o?.[2], o?.[3], o?.[4], sec?.[1], r.note].filter(Boolean).join(' ');
}

/** The device whose settings an answer gives: one showing the session, else the one that spoke last. */
const deviceFor = (deps: Pick<Deps, 'devices'>, key?: string): Device | undefined => deps.devices?.(key)[0];

const sectionOf = (id: string) => {
  const sec = SECTIONS.find(([x]) => x === id);
  return { id, title: sec?.[1] ?? id, tab: sec?.[2] ?? '' };
};

/**
 * GET /api/settings. Asked for some (a section, words, an option): each with its value, what it takes and how it changes.
 * Asked for all: a short view, each section's values by option id, and the options that are buttons, pages or lists of
 * their own (more), to be asked about by section or id.
 */
export async function listSettings(deps: Pick<Deps, 'app' | 'devices'>, qy: ListQuery) {
  const ctl = inProcess(deps.app, 8_000);
  const rows = rowsFor(qy);
  const some = !!(qy.id || qy.q || qy.section);
  const reads = qy.values === '0' ? new Map<string, { value?: Value; error?: string }>() : await readAll(ctl, rows.filter((r) => !r.device));
  const dev = deviceFor(deps, qy.key);
  const device = dev ? { label: dev.label, showsThisSession: dev.showing } : null;
  if (some) {
    const sections: (ReturnType<typeof sectionOf> & { options: Listed[] })[] = [];
    for (const r of rows) {
      let s = sections.find((x) => x.id === r.section);
      if (!s) sections.push((s = { ...sectionOf(r.section), options: [] }));
      s.options.push(await listed(ctl, r, reads.get(r.id), dev, true));
    }
    return { how: HOW, device, sections };
  }
  const sections: (ReturnType<typeof sectionOf> & { values: Record<string, unknown>; errors?: Record<string, string>; more?: string[] })[] = [];
  for (const r of rows) {
    let s = sections.find((x) => x.id === r.section);
    if (!s) sections.push((s = { ...sectionOf(r.section), values: {} }));
    const read = reads.get(r.id);
    const v = r.device ? deviceValue(r, dev) : read?.value !== undefined ? jsonValue(r, read.value) : undefined;
    if (v !== undefined) s.values[r.id] = v;
    else if (read?.error) (s.errors ??= {})[r.id] = read.error;
    else (s.more ??= []).push(r.id);
  }
  return {
    how: `${HOW} This is every option’s value by its id; ask GET /api/settings?section=<id>, ?q=<words> or GET /api/settings/<id> for what one takes and how it changes. more: buttons, pages and lists with endpoints of their own.${dev ? '' : ' The settings each device keeps are left out: no page of the app is open to tell them.'}`,
    device,
    sections,
  };
}

const HOW = `Change an option with PUT /api/settings/<id> { value } (takes says what it takes), press a button with POST /api/settings/<id>/run, and a device’s own with PUT /device (${DEVICE_VALUES}). An option with change names the endpoints or tools that do it; only says what only the person can do. Its page: /settings?s=<section>&find=<label>.`;

// ---- changing --------------------------------------------------------------------------------------------------------

/** A value as the terminal's table reads typed text. */
export function asText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (Array.isArray(v)) return v.map(String).join(', ');
  return String(v);
}

/** Why an option is not changed through PUT /api/settings/:id, and how it is instead; null when it is. */
export function notHere(r: Row): string | null {
  if (r.device) return DEVICE_ONLY[r.device.key] ?? `${r.label} is kept in each browser: ${DEVICE_SET[r.device.key] ?? 'it changes on the device'} (app_api), for the pages showing the session.`;
  if (r.kind === 'action') return `${r.label} is a button: POST /api/settings/${r.id}/run.`;
  const way = WAYS[r.id];
  if (r.kind === 'page' || r.kind === 'command' || !r.write || r.readonly) return way?.only ?? (way?.how ? `${r.label}: ${way.how}.` : `${r.label} is read only.`);
  return null;
}

export interface Planned {
  row: Row;
  /** The calls the change makes (in a dry run: what is only read is read, nothing is changed). */
  calls: { method: string; path: string; body?: unknown }[];
  /** The value as it is now, and as it will be. */
  before?: unknown;
  after?: unknown;
  /** The question the change asks first (a list that deletes what it leaves out), or a button's own. */
  question?: string;
}

/** A change's calls, found by making it with nothing but reads going through. */
async function dryRun(real: Ctl, fn: (ctl: Ctl) => Promise<unknown>): Promise<Planned['calls']> {
  const calls: Planned['calls'] = [];
  const ctl: Ctl = {
    api: async <T>(method: string, p: string, body?: unknown, o?: { timeoutMs?: number }) => {
      if (method === 'GET') return real.api<T>(method, p, body, o);
      calls.push({ method, path: p, body });
      return {} as T;
    },
  };
  try {
    await fn(ctl);
  } catch (e) {
    // Past its first change a dry run may trip on an answer it did not get: the calls so far are enough to ask about.
    if (!calls.length) throw e;
  }
  return calls;
}

/** What a change of one option would do: its calls, its value before and after, its question. Throws a UsageError for a value it does not take. */
export async function planSetting(app: FastifyInstance, r: Row, value: unknown): Promise<Planned> {
  const ctl = inProcess(app);
  const v = await parseValue(ctl, r, asText(value));
  const before = (await readAll(ctl, [r])).get(r.id)?.value;
  let question: string | undefined;
  const calls = await dryRun(ctl, (c) =>
    setRow(c, r, asText(value), {
      confirm: async (q) => {
        question = q;
        return true;
      },
    }),
  );
  return { row: r, calls, before: jsonValue(r, before), after: jsonValue(r, v), question };
}

/** What pressing a button would do: its calls and its question. */
export async function planAction(app: FastifyInstance, r: Row, arg?: string): Promise<Planned> {
  const calls = await dryRun(inProcess(app), (c) => runAction(c, r, arg));
  return { row: r, calls, question: r.act?.question };
}

// ---- the routes ----------------------------------------------------------------------------------------------------------

/** An error the route answers with: a usage error is the caller's (400), a failed call keeps its status. */
function failed(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  if (e instanceof UsageError) return reply.code(400).send({ error: e.message.replace(/\(?hydor settings list shows them\)?/g, '(GET /api/settings lists them)') });
  if (e instanceof CallError) return reply.code(e.status).send({ error: e.message });
  throw e;
}

export function settingsRoutes(d: Deps) {
  d.app.get('/api/settings', async (req, reply) => {
    try {
      return await listSettings(d, req.query as ListQuery);
    } catch (e) {
      return failed(reply, e);
    }
  });
  d.app.get('/api/settings/:id', async (req, reply) => {
    try {
      const q = req.query as ListQuery;
      const r = findRow((req.params as { id: string }).id);
      const all = await listSettings(d, { id: r.id, key: q.key });
      // Asked for one, the answer is that option in full.
      const sec = all.sections[0];
      return { ...(sec && 'options' in sec ? sec.options[0] : { id: r.id }), section: sec?.title, device: all.device };
    } catch (e) {
      return failed(reply, e);
    }
  });
  d.app.put('/api/settings/:id', async (req, reply) => {
    try {
      const r = findRow((req.params as { id: string }).id);
      const b = (req.body ?? {}) as { value?: unknown; confirm?: boolean };
      const why = notHere(r);
      if (why) return reply.code(400).send({ error: why });
      if (!('value' in b)) return reply.code(400).send({ error: 'value: the option’s new value' });
      const ctl = inProcess(d.app);
      let asked: string | undefined;
      const done = await setRow(ctl, r, asText(b.value), {
        confirm: async (q) => {
          asked = q;
          return b.confirm === true;
        },
      });
      if (asked && b.confirm !== true) return reply.code(409).send({ error: `${asked} Send confirm: true with the value to go ahead.`, question: asked });
      return { id: r.id, label: r.label, changed: done.changed, value: done.value, said: done.say };
    } catch (e) {
      return failed(reply, e);
    }
  });
  d.app.post('/api/settings/:id/run', async (req, reply) => {
    try {
      const r = findRow((req.params as { id: string }).id);
      const b = (req.body ?? {}) as { arg?: unknown; confirm?: boolean };
      if (r.kind !== 'action' || !r.act) return reply.code(400).send({ error: notHere(r) ?? `${r.label} is not a button: PUT /api/settings/${r.id} { value } changes it.` });
      if (r.act.question && b.confirm !== true) return reply.code(409).send({ error: `${r.act.question} Send confirm: true to go ahead.`, question: r.act.question });
      const said = await runAction(inProcess(d.app, r.act.slow ? 600_000 : 60_000), r, typeof b.arg === 'string' ? b.arg : undefined);
      return { id: r.id, label: r.label, said };
    } catch (e) {
      return failed(reply, e);
    }
  });
}
