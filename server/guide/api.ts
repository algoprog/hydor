// app_api: an agent does in the app what the user could do in its pages (change a setting, make a space, an
// assistant, a scheduled task…) by calling the app's own API, in the server's own process (internal.ts).
// What it may do follows the rules below: reading is free; a change shows the user a card first (with a form
// to fill in or check, when the agent gives one), which they can allow for the rest of the session; risky or
// hard-to-undo changes ask every time; some things are never an agent's (passwords, keys' values, files and
// commands, answering approval cards). Plan mode only reads; full access asks nothing (Custom's still asks
// before the risky ones). Settings kept on each device (theme, language…) go to the pages showing the session.
import crypto from 'node:crypto';
import { formContent, formFields } from '../../shared/forms.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { confidentialIn, NOT_FROM_HERE, withoutConfidential } from '../confidential/index.ts';
import type { RunCtx, ToolOutput } from '../features/types.ts';
import { internalHeaders } from '../internal.ts';

type Level = 'free' | 'confirm' | 'always' | 'refuse';
type Json = Record<string, any>;

/** Methods a rule is for: one, several ("PUT|PATCH"), any change ("W"), or any ("*"). */
type Rule = [methods: string, path: RegExp, level: Level, why?: string];

const YOUR_TOOLS = 'Use your own tools for that (files, commands, git): they ask the user as the session’s permissions say.';

/** The first rule that matches decides. */
const RULES: Rule[] = [
  // Never an agent's.
  ['*', /^\/api\/auth\//, 'refuse', 'The password and signing in are the user’s alone (Settings → App → Password).'],
  ['*', /^\/api\/(fs|terminals|terminal-history|kernels|git|uploads)(\/|$)/, 'refuse', YOUR_TOOLS],
  ['*', /^\/api\/pdf\//, 'refuse', 'Use your PDF tools for that: pdf_look and pdf_form to see a PDF and its form, pdf_fill, pdf_write and pdf_pages to change it.'],
  ['*', /^\/api\/browser\/sessions\//, 'refuse', 'Use the browser tools (browser_open, browser_act, browser_read) for that.'],
  ['*', /^\/api\/computer\/sessions\//, 'refuse', 'Use the computer tools (computer_screenshot, computer_act) for that.'],
  ['POST', /^\/api\/computer\/permissions\//, 'refuse', 'macOS asks the user for these permissions itself: tell them to press Allow in Settings → Capabilities → Computer use.'],
  ['*', /^\/api\/sessions\/[^/]+\/approvals\//, 'refuse', 'Only the user answers approval cards.'],
  ['W', /^\/api\/(skillpack\/proposals|automations\/proposals|sites\/requests|connections\/requests)\//, 'refuse', 'Only the user decides on these cards.'],
  ['W', /^\/api\/(access-tokens|mcp\/tokens)$/, 'refuse', 'Tokens are made by the user in Settings, so their value never passes through an agent. Tell them where: Settings → App → Machines (access from other machines) or Connect other agents.'],
  ['POST', /^\/api\/apps\/[^/]+\/keys$/, 'refuse', 'An app’s API keys are made by the user, on its Share tab.'],
  ['POST|PATCH', /^\/api\/connections\/secrets/, 'refuse', 'A key’s value never passes through an agent: ask for it with request_secret, and the user enters it in a card.'],
  // A signature is the user's own: agents list them by name, and place one with place_signature, which the user allows on a card.
  ['*', /^\/api\/signatures\/./, 'refuse', 'A signature is the user’s own: you never see its picture, and only the user changes or deletes one (Settings → App → Signatures). Ask them to draw one with ask_signature, and place one by name with place_signature (they allow each placement on a card).'],
  ['W', /^\/api\/signatures$/, 'refuse', 'Only the user draws their signature: ask for one with ask_signature, which shows them a card to draw it on.'],
  ['POST', /^\/api\/apps\/[^/]+\/secrets$/, 'refuse', 'A key’s value never passes through an agent: the user gives the keys an app needs on its page, its install card, or its card in a session (use_app shows it).'],
  ['*', /^\/api\/accounts\/[^/]+\/(login|logout)/, 'refuse', 'Signing in and out of an agent’s account is the user’s to do, in Settings → Agents → Accounts.'],
  ['W', /^\/api\/budget\//, 'refuse', 'Spending caps are the user’s to set: the session’s menu → Spending cap, or Options on the start page.'],
  ['W', /^\/api\/sessions\/[^/]+\/(takeover|seen|queue)/, 'refuse', 'That is for the session’s own page.'],
  ['W', /^\/api\/sites$/, 'refuse', 'Publish with your publish_site tool: the user confirms on its card.'],
  ['W', /^\/api\/me\/language$/, 'refuse', 'The language is set on each device: PUT /device with { language }.'],
  ['W', /^\/api\/(push\/(subscribe|unsubscribe)|me\/timezone|find\/usage|tour|voice\/(transcribe|command|cancel))$/, 'refuse', 'That is for the app’s pages themselves.'],
  // A slideshow's narration sounds and its phone remote are the editor's and the slideshow's own.
  [
    '*',
    /^\/api\/slides\/(sounds|narration|shows)(\/|$)/,
    'refuse',
    'That is for the slides editor and the slideshow. To narrate slides, make each slide’s voice-over with generate_audio and give its file as the slide’s narration ({"file": …}) in save_slides.',
  ],
  // The editors' own AI tools: agents have tools of their own for each, which save into their folder and ask the user as needed.
  [
    '*',
    /^\/api\/(images\/(make|edit|svg|cutout|erase)|plots\/make|videos\/make(\/[^/]+)?|mediaedit\/.*|photos\/.*)$/,
    'refuse',
    'Use your own tools for that: generate_image (pictures, and changes to one), make_svg (drawings), remove_background, erase_from_image, make_plot, generate_video, edit_image, edit_video and find_photos (free photos). They save what they make in your folder (they also take the pictures already in a deck or document, named naget-asset:…), and you put it in with save_slides, save_doc or save_page.',
  ],
  // Changes that change nothing, or only look something up.
  ['POST', /^\/api\/(update-check|knowledge\/search|models\/inspect|automations\/next|automations\/watch\/test|apps\/draft|apps\/check|apps\/install\/check|automations\/draft)$/, 'free'],
  ['POST', /^\/api\/(search|push|voice)\/test$|^\/api\/connections\/[^/]+\/test$/, 'free'],
  ['POST', /^\/api\/plugins\/inspect$/, 'free'],
  // Words rewritten, a picture described, a slide's design ideas: answers, nothing changed.
  ['POST', /^\/api\/write\/(rewrite|describe|design-ideas)$/, 'free'],
  // A LaTeX reference looked up, a LaTeX document typeset, a document's pages printed: answers, nothing kept changed.
  ['POST', /^\/api\/pages\/(tex\/(reference|compile)|docs\/print)$/, 'free'],
  // Ask every time: risky, costly or hard to undo.
  ['DELETE', /./, 'always'],
  ['W', /\/(remove|delete|discard|clear|reset|rotate|branch-delete|stop|interrupt|cancel)(\/|$)/, 'always'],
  ['W', /^\/api\/setup\//, 'always', 'This changes what Claude Code or Codex load in every session; an MCP server runs a program on this computer.'],
  ['W', /^\/api\/(custom|browser)\/settings$/, 'always', 'This changes what agents may do without asking.'],
  ['W', /^\/api\/computer\/settings$/, 'always', 'This lets agents see this Mac’s screen and use its mouse and keyboard (each session still asks before its agent starts).'],
  ['W', /^\/api\/(update|update\/auto|startup|machines|scm\/accounts|acp-agents|agent-accounts|clients)(\/|$)/, 'always'],
  ['W', /^\/api\/models\/(install|start)$/, 'always', 'This downloads or starts a model on this computer.'],
  ['POST', /^\/api\/images\/local\/setup$/, 'always', 'This sets up the picture tools on this computer: a private Python (about 120 MB), and each model (about 220 MB) the first time it is used.'],
  ['POST', /^\/api\/apps\/install$|^\/api\/apps\/[^/]+\/env$/, 'always', 'This installs an app on this computer, with the apps and the Node or Python packages it needs.'],
  ['W', /^\/api\/plugins\/(install|new|[^/]+\/(enable|setup|update|draft|files))$/, 'always', 'A plugin runs programs on this computer, installs what it needs, and gives every agent its skills, tools and instructions.'],
  ['W', /^\/api\/voice$/, 'confirm'],
  ['POST', /^\/api\/sessions$/, 'always', 'This starts a new session.'],
  ['W', /^\/api\/sessions\/[^/]+\/(message|handoff|fork|rewind|guest-links|pr|worktree|start|compact|goal)/, 'always'],
  ['W', /^\/api\/(preview\/link|pages\/[^/]+\/link)$/, 'always', 'Anyone with the link can open it.'],
  ['W', /^\/api\/projects\/[^/]+\/shares(\/|$)/, 'always', 'Whoever has a project’s link sees its documents, sessions, runs and reading list, and may comment on (or change) its documents.'],
  ['W', /^\/api\/(tasks|apps\/[^/]+\/(runs|batches)|apps\/runs\/[^/]+\/ask|apps\/[^/]+\/run|automations\/(test-run|runs\/[^/]+\/rerun)|opinion\/[^/]+|arena\/[^/]+\/winner)(\/|$)/, 'always', 'This starts agent work that may cost.'],
  ['POST', /^\/api\/experiments\/(jobs|sweeps|runs\/[^/]+\/again)$/, 'always', 'This starts jobs on this computer (its GPUs), another machine or a cluster. Agents in sessions use experiment_run and experiment_sweep.'],
  ['POST', /^\/api\/experiments\/(tables\/preview|clusters\/check)$/, 'free'],
  // Every other change: the user's OK, once or for the rest of the session.
  ['W', /./, 'confirm'],
  ['GET', /./, 'free'],
];

function matches(methods: string, method: string) {
  if (methods === '*') return true;
  if (methods === 'W') return method !== 'GET';
  return methods.split('|').includes(method);
}

/** What the rules say of a call (the path without its query). */
export function ruleFor(method: string, path: string): { level: Level; why?: string } {
  for (const [m, re, level, why] of RULES) if (matches(m, method) && re.test(path)) return { level, why };
  return { level: method === 'GET' ? 'free' : 'confirm' };
}

/** A few calls are refused for what they carry: an agent changing a session's permissions or its spending cap. */
function refusedBody(method: string, path: string, body: Json, own: string): string | null {
  const s = /^\/api\/sessions\/([^/]+)(\/.*)?$/.exec(path);
  // An app's keys go with a run or an install only from the user's own pages.
  // (A recipe's own `secrets` is a list of the keys it needs, by name: that is not a value.)
  if (/^\/api\/apps\//.test(path) && ((body.secrets && typeof body.secrets === 'object' && !Array.isArray(body.secrets)) || body.allow !== undefined)) return 'A key’s value never passes through an agent: the user gives the keys an app needs on its page, its install card, or its card in a session (use_app shows it).';
  // Keys for models (OpenRouter's, Hugging Face's, an endpoint's): the tools that need one ask the user on a card.
  const given = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  if (path === '/api/models' && (given(body.openrouterKey) || given(body.hfToken) || (body.endpoint && typeof body.endpoint === 'object' && given((body.endpoint as Json).apiKey))))
    return 'A key’s value never passes through an agent. The tools that need an OpenRouter key (generate_image and the rest) ask the user for it on a card when they need it; other keys the user enters in Settings → Models.';
  if (!s) return null;
  const key = decodeURIComponent(s[1]);
  if (s[2] === '/config' && body.mode !== undefined) return 'A session’s permissions are the user’s to change (the picker by the message box, or Shift+Tab).';
  if (s[2] === '/extra' && body.capUsd !== undefined) return 'Spending caps are the user’s to set: the session’s menu → Spending cap.';
  if (s[2] === '/message' && key === own) return 'That is this session: just answer here.';
  if (method === 'DELETE' && !s[2] && key === own) return 'An agent cannot delete its own session.';
  return null;
}

// ---- the session's permissions -------------------------------------------------------------------

export type Mode = 'read-only' | 'full' | 'custom-full' | 'normal';

export function modeOf(ctx: RunCtx): Mode {
  const m = ctx.deps.sessions.adapterByRun(ctx.runId)?.state.mode;
  const custom = ctx.agent === 'acp' && ctx.acpAgent === CONSOLE_ID;
  if (m === 'plan' || (ctx.agent === 'codex' && m === 'read-only')) return 'read-only';
  if ((ctx.agent === 'claude' && m === 'bypassPermissions') || (ctx.agent === 'codex' && m === 'full')) return 'full';
  if (custom && m === 'full') return 'custom-full';
  return 'normal';
}

/** Sessions whose user allowed app changes for the rest of the session (until the app restarts). */
const allowed = new Set<string>();

// ---- the card --------------------------------------------------------------------------------------

const words = (k: string) => {
  const s = k.replace(/[_.-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : k;
};

function shown(v: unknown): string {
  if (v === undefined || v === null || v === '') return '(none)';
  if (v === true) return 'on';
  if (v === false) return 'off';
  if (typeof v === 'string') return v.length > 140 ? `“${v.slice(0, 140)}…”` : `“${v}”`;
  if (typeof v === 'number') return String(v);
  const j = JSON.stringify(v);
  return j.length > 140 ? `${j.slice(0, 140)}…` : j;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The body's fields, one or two levels down ("search.results"), as [name, value]. */
function fieldsOf(body: Json, depth = 2, prefix = ''): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [k, v] of Object.entries(body)) {
    const name = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && depth > 1 && Object.keys(v).length) out.push(...fieldsOf(v, depth - 1, name));
    else out.push([name, v]);
  }
  return out;
}

const at = (o: unknown, name: string) => name.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Json)[k] : undefined), o);

function setAt(o: Json, name: string, v: unknown) {
  const ks = name.split('.');
  let x = o;
  for (const k of ks.slice(0, -1)) x = x[k] && typeof x[k] === 'object' ? x[k] : (x[k] = {});
  x[ks[ks.length - 1]] = v;
}

/** What the change does, field by field: before → after where the same address says what is there now. */
function changeLines(body: Json, now: unknown): string[] {
  const lines: string[] = [];
  const all = fieldsOf(body);
  for (const [name, v] of all.slice(0, 12)) {
    const was = now && typeof now === 'object' ? at(now, name) : undefined;
    if (was !== undefined && same(was, v)) continue;
    lines.push(was !== undefined ? `- **${words(name)}**: ${shown(was)} → ${shown(v)}` : `- **${words(name)}**: ${shown(v)}`);
  }
  if (all.length > 12) lines.push(`- and ${all.length - 12} more`);
  return lines;
}

// ---- calling the app ---------------------------------------------------------------------------------

export interface Reply {
  status: number;
  json?: unknown;
  text: string;
}

/** One call to the app's own API, in this process, as the signed-in user. */
export async function call(ctx: RunCtx, method: string, url: string, body?: Json): Promise<Reply> {
  const payload = body && method !== 'GET' ? JSON.stringify(body) : undefined;
  const res = await Promise.race([
    ctx.deps.app.inject({ method: method as 'GET', url, payload, headers: { ...internalHeaders(), ...(payload ? { 'content-type': 'application/json' } : {}) } }),
    new Promise<never>((_, no) => setTimeout(() => no(new Error('The app took over a minute to answer')), 60_000).unref()),
  ]);
  const type = String(res.headers['content-type'] ?? '');
  if (/json/.test(type)) {
    try {
      return { status: res.statusCode, json: res.json(), text: res.body };
    } catch {}
  }
  if (/^text\/|xml|javascript/.test(type) || !type) return { status: res.statusCode, text: res.body };
  return { status: res.statusCode, text: `(${type}, ${res.rawPayload.length} bytes)` };
}

const MAX_OUT = 24_000;

/** The app's answer for the agent; confidential sessions are left out of it (server/confidential). */
function out(r: Reply, ctx: RunCtx): ToolOutput {
  const text = r.json !== undefined ? JSON.stringify(withoutConfidential(ctx.deps.db, r.json), null, 1) : r.text;
  const cut = text.length > MAX_OUT ? `${text.slice(0, MAX_OUT)}\n… (cut: ${Math.round(text.length / 1024)} KB in all; ask for less, by id or with a query string)` : text;
  const err = r.status >= 400 ? ((r.json as Json | undefined)?.error ?? r.text).toString() : '';
  return r.status >= 400 ? { text: `${r.status}: ${err || 'failed'}`, isError: true } : { text: `${r.status} OK\n${cut || '(no content)'}` };
}

// ---- settings kept on each device ---------------------------------------------------------------------

const DEVICE: Record<string, (v: unknown) => unknown> = {
  theme: (v) => (v === 'dark' || v === 'light' || v === 'system' ? v : undefined),
  themeName: (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : undefined),
  language: (v) => (v === 'en' || v === 'zh' || v === 'el' ? v : undefined),
  sound: (v) => (typeof v === 'boolean' ? v : undefined),
  enter: (v) => (v === 'join' || v === 'queue' ? v : undefined),
  terminalSuggestions: (v) => (typeof v === 'boolean' ? v : undefined),
  sidebar: (v) => (typeof v === 'boolean' ? v : undefined),
  groupSessions: (v) => (typeof v === 'boolean' ? v : undefined),
};

function device(ctx: RunCtx, method: string, body: Json, mode: Mode): ToolOutput {
  if (method === 'GET') return { text: `Settings kept on each device, set with PUT /device: ${Object.keys(DEVICE).join(', ')}. Their current values live in the user’s browser, out of reach here.` };
  if (method !== 'PUT' && method !== 'PATCH') return { text: 'Use PUT /device with the settings to change.', isError: true };
  if (mode === 'read-only') return { text: 'This session only reads (Plan mode): tell the user what you would change instead.', isError: true };
  const set: Json = {};
  const bad: string[] = [];
  for (const [k, v] of Object.entries(body)) {
    const ok = DEVICE[k]?.(v);
    if (ok === undefined) bad.push(k);
    else set[k] = ok;
  }
  if (bad.length) return { text: `Not a device setting, or not a value it takes: ${bad.join(', ')}. They are theme (dark, light, system), themeName (a theme's name), language (en, zh, el), sound, enter (join, queue), terminalSuggestions, sidebar, groupSessions (true/false).`, isError: true };
  if (!Object.keys(set).length) return { text: 'Nothing to change.', isError: true };
  ctx.deps.toSubscribers(ctx.key, { t: 'feature', id: 'guide', key: ctx.key, data: { device: set } });
  return { text: `Sent to the pages showing this session, which switch now (${Object.keys(set).join(', ')}). Other devices keep their own settings until changed there.` };
}

// ---- the tool -----------------------------------------------------------------------------------------

export interface ApiArgs {
  method?: string;
  path?: string;
  body?: unknown;
  summary?: string;
  form?: unknown;
}

/** How long a card waits for the user (under Codex's ten minutes for a tool call). */
const WAIT_MS = 570_000;

export async function appApi(a: ApiArgs, ctx: RunCtx): Promise<ToolOutput> {
  const method = String(a.method ?? 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return { text: 'method: GET, POST, PUT, PATCH or DELETE', isError: true };
  let url = String(a.path ?? '').trim();
  if (/^https?:\/\//i.test(url)) url = url.replace(/^https?:\/\/[^/]+/i, '');
  const path = url.split('?')[0].replace(/\/+$/, '') || '/';
  const body: Json = a.body && typeof a.body === 'object' && !Array.isArray(a.body) ? { ...(a.body as Json) } : {};
  const mode = modeOf(ctx);
  if (path === '/device' || path === '/api/device') return device(ctx, method, body, mode);
  if (!path.startsWith('/api/') || path.includes('..')) return { text: 'path: one of the app’s /api/… addresses (app_guide topic "api" lists them), or /device.', isError: true };

  const rule = ruleFor(method, path);
  if (rule.level === 'refuse') return { text: `Not through app_api: ${rule.why ?? 'that is the user’s to do.'}`, isError: true };
  const refused = refusedBody(method, path, body, ctx.key);
  if (refused) return { text: `Not through app_api: ${refused}`, isError: true };
  // A confidential session stays out of other sessions' reach (server/confidential).
  if (confidentialIn(ctx.deps.db, url).some((k) => k !== ctx.key)) return { text: `Not through app_api: ${NOT_FROM_HERE}`, isError: true };
  if (method === 'GET' || rule.level === 'free') return out(await call(ctx, method, url), ctx);
  if (mode === 'read-only') return { text: 'This session only reads (Plan mode, or read-only): tell the user what you would change, or ask them to switch the mode.', isError: true };

  const form = a.form && typeof a.form === 'object' ? (a.form as Json) : null;
  // A form always shows (it asks for something); otherwise full access asks nothing, Custom's full access only
  // what asks every time, and the rest of the modes everything not yet allowed for the session.
  const needsCard = !!form || (rule.level === 'always' ? mode !== 'full' : mode === 'normal' && !allowed.has(ctx.key));
  if (needsCard) {
    const answer = await askCard(ctx, { method, url, path, body, summary: a.summary, form, rule });
    if (answer.declined) return { text: answer.declined, isError: true };
    Object.assign(body, answer.body);
  }
  return out(await call(ctx, method, url, method === 'DELETE' && !Object.keys(body).length ? undefined : body), ctx);
}

interface CardIn {
  method: string;
  url: string;
  path: string;
  body: Json;
  summary?: string;
  form: Json | null;
  rule: { level: Level; why?: string };
}

/** Shows the change on a card (with the form, when given) and waits for the user. */
async function askCard(ctx: RunCtx, c: CardIn): Promise<{ body: Json; declined?: string }> {
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return { body: {}, declined: 'Nobody can confirm it now (the session is not running in the app).' };
  // The form: fields given as a JSON schema's properties, each an address in the body; what the body has already fills them in.
  const props: Json = c.form?.fields && typeof c.form.fields === 'object' ? c.form.fields : c.form?.properties && typeof c.form.properties === 'object' ? c.form.properties : {};
  const required: string[] = Array.isArray(c.form?.required) ? c.form!.required.map(String) : [];
  const schema = {
    type: 'object',
    properties: Object.fromEntries(Object.entries(props).map(([id, p]) => [id, { ...(p as Json), default: (p as Json)?.default ?? at(c.body, id) }])),
    required,
  };
  const fields = formFields(schema);
  // For a change in place, what is there now (the same address read), so the card shows before → after.
  let now: unknown;
  if (c.method === 'PUT' || c.method === 'PATCH') now = (await call(ctx, 'GET', c.url).catch(() => null))?.json;
  const asked = new Set(fields.map((f) => f.id));
  const lines = changeLines(Object.fromEntries(Object.entries(c.body).filter(([k]) => !asked.has(k))), now);
  const session = /^\/api\/sessions\/([^/]+)/.exec(c.path)?.[1];
  const other = session && decodeURIComponent(session) !== ctx.key ? ctx.deps.sessions.summary(decodeURIComponent(session)) : null;
  const detail = [
    typeof c.form?.message === 'string' && c.form.message.trim() ? c.form.message.trim().slice(0, 1500) : '',
    other ? `In the session **${other.title.replace(/\*/g, '')}**.` : '',
    lines.join('\n'),
    c.rule.why ?? '',
    `\`${c.method} ${c.url.length > 120 ? `${c.url.slice(0, 120)}…` : c.url}\``,
  ]
    .filter(Boolean)
    .join('\n\n');
  const title = String(c.summary ?? '').trim().replace(/\s+/g, ' ').slice(0, 120) || (c.method === 'DELETE' ? 'Delete something in the app' : 'Change something in the app');
  const sessionOk = c.rule.level === 'confirm';
  const card: ApprovalRequest = {
    id: `app-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'other',
    title,
    detail,
    prose: true,
    options: [
      { id: 'accept', label: c.method === 'DELETE' ? 'Delete' : fields.length ? 'Save' : 'Allow', style: c.method === 'DELETE' ? 'danger' : 'primary' },
      ...(sessionOk ? [{ id: 'always', label: 'Allow for this session' }] : []),
      { id: 'deny', label: 'Don’t', style: 'default' as const },
    ],
    form: fields.length ? { fields } : undefined,
    createdAt: Date.now(),
  };
  const limit = AbortSignal.timeout(WAIT_MS);
  const check = (x: ApprovalAnswer) => {
    if (x.decision !== 'accept' && x.decision !== 'always') return null;
    const [field, why] = Object.entries(formContent(schema, x.form ?? {}).errors)[0] ?? [];
    return field ? `${fields.find((f) => f.id === field)?.label ?? field}: ${why}` : null;
  };
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit, check });
  if (!answer) return { body: {}, declined: limit.aborted ? 'The user did not answer the card in time; it was withdrawn. Ask them in your reply whether to go ahead.' : 'The card was withdrawn before the user answered.' };
  if (answer.decision !== 'accept' && answer.decision !== 'always')
    return { body: {}, declined: `The user said no${answer.message?.trim() ? `: “${answer.message.trim()}”` : '.'} Nothing was changed.` };
  if (answer.decision === 'always') allowed.add(ctx.key);
  const filled: Json = {};
  for (const [k, v] of Object.entries(formContent(schema, answer.form ?? {}).content)) setAt(filled, k, v);
  // A field the user emptied goes as empty, not as the agent's first value.
  for (const f of fields) if (at(filled, f.id) === undefined && f.type !== 'yesno') setAt(filled, f.id, '');
  return { body: filled };
}

/** For tests: forget the sessions that allowed changes. */
export const forgetAllowed = () => allowed.clear();
