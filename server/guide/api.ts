// app_api: an agent does in the app what the user could do in its pages (change a setting, make a space, an
// assistant, a scheduled task…) by calling the app's own API, in the server's own process (internal.ts).
// What it may do follows the rules below: reading is free; a change shows the user a card first (with a form
// to fill in or check, when the agent gives one), which they can allow for the rest of the session; risky or
// hard-to-undo changes ask every time; a session's permissions and spending caps ask every time in every mode, Full
// access too; some things are never an agent's (passwords, keys' values, files and commands, answering approval
// cards). Plan mode only reads, but for the session's own settings (on a card); Full access asks nothing else.
// An agent names its own session `this` (/api/sessions/this/config).
// Settings kept on each device (theme, language…) go to the pages showing the session.
import crypto from 'node:crypto';
import { DEVICE_VALUES, deviceChange, type DeviceReport } from '../../shared/device.ts';
import { formContent, formFields } from '../../shared/forms.ts';
import { BUILT_IN_THEMES } from '../../shared/themes.ts';
import type { ApprovalRequest, ServerEvent } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { confidentialIn, NOT_FROM_HERE, withoutConfidential } from '../confidential/index.ts';
import type { RunCtx, ToolOutput } from '../features/types.ts';
import { internalHeaders } from '../internal.ts';
import { findRow, settingsAddress, type Row } from '../tui/settings-table.ts';
import { asText, deviceBody, notHere, planAction, planSetting, type Planned } from './settings.ts';

/** free: no card; confirm: a card unless allowed for the session (none in Full access); always: a card each time (none in
 * Full access); ask: a card each time, Full access too, never allowed for the session; refuse: never. */
type Level = 'free' | 'confirm' | 'always' | 'ask' | 'refuse';
type Json = Record<string, any>;

/** Methods a rule is for: one, several ("PUT|PATCH"), any change ("W"), or any ("*"). */
type Rule = [methods: string, path: RegExp, level: Level, why?: string];

const YOUR_TOOLS = 'Use your own tools for that (files, commands, git): they ask the user as the session’s permissions say.';
const CAP = 'This changes a spending cap: how much may be spent before the work stops.';
const PERMISSIONS = 'This changes what the agent may do without asking you.';
const AGENT_HOURS = 'This changes the limit on the GPU hours agents’ runs may use in seven days.';
const TOOL_STATES = 'This changes which of a connected account’s tools agents may use, and which wait for your OK in the Outbox first.';
const APP_MAIL = 'This lets a web app send mail from your account, in your name, to addresses the app chooses (or changes which account, how many a day, or whether it sends while it is being made, so that trying it out mails real people). A link in its mail opens only for someone who has opened the app from Hydor.';

/** The first rule that matches decides. */
const RULES: Rule[] = [
  // Never an agent's.
  ['POST', /^\/api\/wiki\/migration\/apply$/, 'refuse', 'The user chooses wiki folder moves in Settings.'],
  // An evaluation is how the person keeps score: agents read it, ask for scores and put sealed files back.
  ['POST', /^\/api\/experiments\/evaluations$/, 'refuse', 'Only the person creates and seals an evaluation; propose one with evaluation_propose.'],
  ['PUT|PATCH', /^\/api\/experiments\/evaluations\//, 'refuse', 'Only the person changes an evaluation; propose one with evaluation_propose.'],
  ['DELETE', /^\/api\/experiments\/evaluations\//, 'refuse', 'Only the person deletes an evaluation or its scores.'],
  ['W', /^\/api\/experiments\/evaluations\/[^/]+\/seal$/, 'refuse', 'Only the person seals an evaluation; propose one with evaluation_propose.'],
  ['W', /^\/api\/experiments\/evaluations\/[^/]+\/baseline$/, 'refuse', 'Only the person sets the baseline: tell them which score you would use.'],
  ['*', /^\/api\/experiments\/evaluations\/[^/]+\/final$/, 'refuse', 'Only the person runs the final test and reads its numbers.'],
  ['*', /^\/api\/experiments\/runs\/[^/]+\/let-run$/, 'refuse', 'Only the person lets a held run go past the limit on agents’ GPU hours: tell them it waits (its page has Let it run).'],
  ['*', /^\/api\/experiments\/evolutions\/[^/]+\/let-run$/, 'refuse', 'Only the person lets a held search go past the limit on agents’ GPU hours: tell them it waits (its page has Let it run).'],
  // Evolve: agents read; starting one, pausing, resuming, stopping and taking the best ask each time (below).
  ['DELETE', /^\/api\/experiments\/evolutions\//, 'refuse', 'Only the person deletes an evolution: its candidates, their scores and its worktrees go with it.'],
  // What the person has looked at and what they put off is theirs: an agent reading the brief must not mark it seen.
  ['POST', /^\/api\/projects\/[^/]+\/research\/(seen|later)$/, 'refuse', 'Only the person marks the Research tab as looked at, or puts a final test off: read the brief with GET /api/projects/:id/research and tell them what needs them.'],
  ['*', /^\/api\/auth\//, 'refuse', 'The password and signing in are the user’s alone (Settings → App → Password).'],
  ['*', /^\/api\/(fs|terminals|terminal-history|kernels|git|uploads)(\/|$)/, 'refuse', YOUR_TOOLS],
  ['*', /^\/api\/pdf\//, 'refuse', 'Use your PDF tools for that: pdf_look and pdf_form to see a PDF and its form, pdf_fill, pdf_write and pdf_pages to change it.'],
  ['*', /^\/api\/browser\/sessions\//, 'refuse', 'Use the browser tools (browser_open, browser_act, browser_read) for that.'],
  // The user's own browsing (the Browser page) is theirs alone: agents get a page of it only when the user hands it to them (Ask's Do).
  ['*', /^\/api\/browser\/browsing(\/|$)/, 'refuse', 'That is the user’s own browsing, which agents never use. Use the browser tools for the web; the user can hand you a page from the Browser page (Ask, then Do).'],
  // Its bookmarks and extensions are part of it: the user manages them on the Browser page (an extension runs where they are signed in).
  ['*', /^\/api\/browser\/(bookmarks|extensions)(\/|$)/, 'refuse', 'Bookmarks and extensions belong to the user’s own browsing, which agents never use: the user manages them on the Browser page (/browser?panel=bookmarks, where Organize with AI sorts bookmarks into folders, and /browser?panel=extensions).'],
  ['*', /^\/api\/computer\/sessions\//, 'refuse', 'Use the computer tools (computer_screenshot, computer_act) for that.'],
  // Sign-ins the user does: an MCP server's OAuth in a terminal they drive, a profile's sites in a browser they drive.
  ['POST', /^\/api\/setup\/mcp\/login$/, 'refuse', 'Signing in to an MCP server happens in a terminal the user drives: they press Sign in on the server in Settings → MCP servers.'],
  ['POST', /^\/api\/setup\/mcp\/signin$/, 'refuse', 'Signing in to an MCP server happens in the user’s browser: they press Sign in on the server in Settings → MCP servers.'],
  ['POST', /^\/api\/browser\/profiles\/[^/]+\/open$/, 'refuse', 'Signing in to sites in a profile is the user’s: they press Log in to sites on the profile in Settings → Browser.'],
  ['POST', /^\/api\/computer\/permissions\//, 'refuse', 'macOS asks the user for these permissions itself: tell them to press Allow in Settings → Capabilities → Computer use.'],
  ['*', /^\/api\/sessions\/[^/]+\/approvals\//, 'refuse', 'Only the user answers approval cards.'],
  // A call held for the user's OK (Ask first) is sent by the user alone, or Ask first would mean nothing.
  ['POST', /^\/api\/outbox\/(send-all|[^/]+\/send)$/, 'refuse', 'Only the user sends a held call: it waits in their Outbox (in the Inbox) for their OK. Tell them it waits there.'],
  ['W', /^\/api\/(skillpack\/proposals|automations\/proposals|sites\/requests|connections\/requests)\//, 'refuse', 'Only the user decides on these cards.'],
  ['W', /^\/api\/(access-tokens|mcp\/tokens)$/, 'refuse', 'Tokens are made by the user in Settings, so their value never passes through an agent. Tell them where: Settings → App → Machines (access from other machines) or Connect other agents.'],
  ['POST', /^\/api\/apps\/[^/]+\/keys$/, 'refuse', 'An app’s API keys are made by the user, on its Share tab.'],
  // A web app's own mail goes through this route with its key: an agent never sends with it.
  ['*', /^\/api\/apps\/[^/]+\/mail$/, 'refuse', 'That route is for a web app’s own server, with its key. To send mail for the user, use your email tools (send_email, of the Email connection), which ask them as their settings say.'],
  ['POST|PATCH', /^\/api\/connections\/secrets/, 'refuse', 'A key’s value never passes through an agent: ask for it with request_secret, and the user enters it in a card.'],
  ['POST|PATCH', /^\/api\/mail\/accounts(\/[^/]+)?$/, 'refuse', 'A mail account’s app password never passes through an agent: the user connects their mail in Apps → Connected apps → Email (/apps/connected?tab=market).'],
  // A signature is the user's own: agents list them by name, and place one with place_signature, which the user allows on a card.
  ['*', /^\/api\/signatures\/./, 'refuse', 'A signature is the user’s own: you never see its picture, and only the user changes or deletes one (Settings → App → Signatures). Ask them to draw one with ask_signature, and place one by name with place_signature (they allow each placement on a card).'],
  ['W', /^\/api\/signatures$/, 'refuse', 'Only the user draws their signature: ask for one with ask_signature, which shows them a card to draw it on.'],
  ['POST', /^\/api\/apps\/[^/]+\/secrets$/, 'refuse', 'A key’s value never passes through an agent: the user gives the keys an app needs on its page, its install card, or its card in a session (use_app shows it).'],
  ['*', /^\/api\/accounts\/[^/]+\/(login|logout)/, 'refuse', 'Signing in and out of an agent’s account is the user’s to do, in Settings → Agents → Accounts.'],
  ['*', /^\/api\/accounts\/claude\/api-keys\//, 'refuse', 'An API key is the user’s to add, in Settings → Agents → Accounts (an account’s ⋯ menu → Add API key…).'],
  ['W', /^\/api\/budget\//, 'ask', CAP],
  // Reaching the app from other devices: a card each time, Full access too (Settings → App → Use on your phone).
  ['POST', /^\/api\/phone\/serve$/, 'ask', 'This publishes the app with Tailscale Serve: every device signed in to your Tailscale account can then open it over HTTPS (never the public internet), and the password is still asked.'],
  ['POST', /^\/api\/phone\/stop$/, 'always', 'This stops serving the app on your tailnet: your phone and other devices no longer reach it.'],
  ['W', /^\/api\/sessions\/[^/]+\/(takeover|seen|queue)/, 'refuse', 'That is for the session’s own page.'],
  ['W', /^\/api\/sites$/, 'refuse', 'Publish with your publish_site tool: the user confirms on its card.'],
  ['PUT', /^\/api\/memory\/bring-in\/file$/, 'refuse', 'An export comes from the user’s own browser: they add it with Bring in… in Settings → Memory.'],
  ['W', /^\/api\/me\/language$/, 'refuse', 'The language is set on each device: PUT /device with { language }.'],
  // About you is the person's own record: an agent may change it only with their OK each time, Full access too.
  // Web apps: launching, a host's fingerprint, restoring and going back are outward-facing or hard to undo: a card each time (the webapp_* tools ask with their own, saying more).
  ['POST', /^\/api\/webapps\/[^/]+\/keys\/card$/, 'refuse', 'Use webapp_keys with ask: true: it puts the card up in your own session. The user fills it in; you never see a value.'],
  ['GET', /^\/api\/webapps\/[^/]+\/server-text$/, 'refuse', 'The text for a new server holds the private half of its identity: only the person copies it, from the app’s Put it online page.'],
  ['POST', /^\/api\/webapps\/[^/]+\/server-connect$/, 'refuse', 'Only the person connects the server they created, on the app’s Put it online page. For a server added by hand use webapp_host.'],
  ['POST', /^\/api\/webapps\/hosts\/[^/]+\/accept$/, 'refuse', 'Only the person compares a server’s fingerprint with their provider’s and accepts it: use webapp_host accept, which asks them on a card that says where to compare it.'],
  ['POST', /^\/api\/webapps\/[^/]+\/functions\/[^/]+\/call$/, 'refuse', 'Use webapp_call_function: a function that changes what the app keeps asks the person on a card the first time, which this route would skip.'],
  ['POST', /^\/api\/webapps\/[^/]+\/services\/[^/]+$/, 'refuse', 'Which service an app uses is the person’s choice: use webapp_services, which puts the card up (or takes the one they named).'],
  ['PUT', /^\/api\/webapps\/[^/]+\/functions\/sessions$/, 'ask', 'This offers functions of a web app to agents in your sessions: they act as you, with what you may do in that app.'],
  ['POST', /^\/api\/webapps\/[^/]+\/launch\/answer$/, 'refuse', 'Only the person lets a failed line of the check through: webapp_launch asks them on a card.'],
  ['POST', /^\/api\/webapps\/[^/]+\/launch\/(hydor|server|back)$/, 'ask', 'This launches the app, or goes back to an earlier launch: what is used changes.'],
  ['POST', /^\/api\/webapps\/[^/]+\/launch\/takedown$/, 'ask', 'This stops the app on its server: nobody is answered at its address any more.'],
  ['DELETE', /^\/api\/webapps\/hosts\/[^/]+$/, 'ask', 'This forgets the server, the key Hydor made for it and what it deployed there.'],
  ['POST', /^\/api\/webapps\/[^/]+\/run\/[^/]+\/backups\/[^/]+\/restore$/, 'ask', 'This stops the app and replaces what it keeps with a backup: whatever was written since is lost.'],
  ['POST', /^\/api\/webapps\/hosts\/[^/]+\/check$/, 'ask', 'This may install Docker and a firewall on the server (with prepare).'],
  ['POST', /^\/api\/webapps\/scratch$/, 'ask', 'This makes a folder, a project and a new web app in it.'],
  ['W', /^\/api\/apps\/me$/, 'ask', 'About you is your own record, which apps read instead of asking (Settings → Apps → About you): this changes it.'],
  ['W', /^\/api\/(push\/(subscribe|unsubscribe)|me\/timezone|find\/usage|tour|away\/here|voice\/(transcribe|command|cancel))$/, 'refuse', 'That is for the app’s pages themselves.'],
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
    'Use your own tools for that: generate_image (pictures, and changes to one), make_svg (drawings), remove_background, erase_from_image, upscale_image, make_plot, generate_video, edit_image, edit_video, edit_audio (sounds) and find_photos (free photos). They save what they make in your folder (they also take the pictures already in a deck or document, named naget-asset:…), and you put it in with save_slides, save_doc or save_page.',
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
  ['DELETE', /^\/api\/lean$/, 'refuse', 'Only the user removes Lean: Settings → General → Lean (proof checker).'],
  ['DELETE', /^\/api\/webapps\/[^/]+\/keys\//, 'refuse', 'Only the user removes a web app’s key, on its Keys tab.'],
  ['DELETE', /^\/api\/webapps\/[^/]+$/, 'always', 'This forgets the web app, and removes its own keys (those saved for it, for each place) from the vault.'],
  ['DELETE', /./, 'always'],
  ['W', /\/(remove|delete|discard|clear|reset|rotate|branch-delete|stop|stop-all|interrupt|cancel)(\/|$)/, 'always'],
  ['W', /^\/api\/setup\//, 'always', 'This changes what Claude Code, Codex or Custom load in every session; an MCP server runs a program on this computer.'],
  ['W', /^\/api\/(custom|browser)\/settings$/, 'always', 'This changes what agents may do without asking.'],
  ['W', /^\/api\/computer\/settings$/, 'always', 'This lets agents see this Mac’s screen and use its mouse and keyboard (each session still asks before its agent starts).'],
  ['W', /^\/api\/(update|update\/auto|startup|machines|scm\/accounts|acp-agents|agent-accounts|clients)(\/|$)/, 'always'],
  ['W', /^\/api\/models\/(install|start)$/, 'always', 'This downloads or starts a model on this computer.'],
  ['POST', /^\/api\/images\/local\/setup$/, 'always', 'This sets up the picture tools on this computer: a private Python with what they need (about 145 MB, or about 2.1 GB with an NVIDIA graphics card, to run on it), and each tool’s model (about 200 MB) the first time it is used.'],
  ['POST', /^\/api\/lean\/setup$/, 'ask', 'This downloads and sets up Lean, the proof checker (about 620 MB, about 3 GB once unpacked), in the app’s own folder; with mathlib, Mathlib too (about 600 MB more to download, about 8 GB unpacked).'],
  ['POST', /^\/api\/apps\/install$|^\/api\/apps\/[^/]+\/env$/, 'always', 'This installs an app on this computer, with the apps and the Node or Python packages it needs.'],
  ['W', /^\/api\/plugins\/(install|new|[^/]+\/(enable|setup|update|draft|files))$/, 'always', 'A plugin runs programs on this computer, installs what it needs, and gives every agent its skills, tools and instructions.'],
  ['W', /^\/api\/voice$/, 'confirm'],
  ['POST', /^\/api\/sessions$/, 'always', 'This starts a new session.'],
  ['W', /^\/api\/sessions\/[^/]+\/(message|handoff|fork|rewind|guest-links|pr|worktree|start|compact|goal)/, 'always'],
  ['W', /^\/api\/(preview\/link|pages\/[^/]+\/link)$/, 'always', 'Anyone with the link can open it.'],
  ['W', /^\/api\/projects\/[^/]+\/shares(\/|$)/, 'always', 'Whoever has a project’s link sees its documents, sessions, runs and reading list, and may comment on (or change) its documents.'],
  ['W', /^\/api\/(pages|media)\/[^/]+\/shares(\/|$)/, 'always', 'Whoever has the link opens it, comments on it, and with Edit changes it.'],
  // Bringing an earlier version of a picture, video or sound back: the one shown now is kept, but it shows at once.
  ['POST', /^\/api\/media\/[^/]+\/versions\/[^/]+\/restore$/, 'always'],
  ['W', /^\/api\/(tasks|apps\/[^/]+\/(runs|batches)|apps\/runs\/[^/]+\/ask|apps\/[^/]+\/run|automations\/(test-run|runs\/[^/]+\/rerun)|opinion\/[^/]+|arena\/[^/]+\/winner)(\/|$)/, 'always', 'This starts agent work that may cost.'],
  ['POST', /^\/api\/experiments\/(jobs|sweeps|try|runs\/[^/]+\/again)$/, 'always', 'This starts jobs on this computer (its GPUs), another machine or a cluster. Agents in sessions use experiment_run, experiment_try and experiment_sweep.'],
  ['POST', /^\/api\/experiments\/(tables\/preview|clusters\/check)$/, 'free'],
  ['POST', /^\/api\/experiments\/evaluations\/[^/]+\/scores$/, 'always', 'This starts jobs on this computer (its GPUs). Agents in sessions use evaluation_score.'],
  ['POST', /^\/api\/experiments\/evaluations\/[^/]+\/restore$/, 'always', 'This writes the sealed copies over the files that changed in that folder: what is in them now is lost.'],
  ['POST', /^\/api\/experiments\/evolutions$/, 'always', 'This starts a search that runs the evaluation once or more for every change it tries (on this computer, its GPUs too) and asks the helper model for each. Agents in sessions use evolve_start.'],
  ['POST', /^\/api\/experiments\/evolutions\/[^/]+\/(pause|resume|stop)$/, 'always', 'This pauses, resumes or stops a search that runs the evaluation for every change it tries.'],
  ['POST', /^\/api\/experiments\/evolutions\/[^/]+\/take$/, 'always', 'This makes a branch (or a new commit on it) in the repository, with the candidate’s files.'],
  // An agent's file read, to show what it would bring: nothing is saved.
  ['POST', /^\/api\/assistants\/install\/check$/, 'free'],
  // Trying an agent's examples starts a session for each, on its tier.
  ['POST', /^\/api\/assistants\/[^/]+\/examples\/try$/, 'always', 'This starts a session for each example, as the agent: agent work that may cost.'],
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

/** What a call carries that the user decides on a card each time, in every mode: a session's permissions or its spending cap. */
function askedFor(path: string, body: Json): { level: Level; why: string } | null {
  const s = /^\/api\/sessions\/[^/]+(\/[^/]+)$/.exec(path);
  if (s?.[1] === '/config' && body.mode !== undefined) return { level: 'ask', why: PERMISSIONS };
  if (s?.[1] === '/extra' && body.capUsd !== undefined) return { level: 'ask', why: CAP };
  if (path === '/api/experiments/settings' && body.agentGpuHours !== undefined) return { level: 'ask', why: AGENT_HOURS };
  // A connected account's tools On, Ask first or Off: the user's say over what goes out without their OK.
  if (/^\/api\/connections\/[^/]+$/.test(path) && !/^\/api\/connections\/(catalog|secrets|requests|session|flows)$/.test(path) && body.tools !== undefined) return { level: 'ask', why: TOOL_STATES };
  // A web app's mail goes out in the user's name: allowing it, and which account and how many, is theirs to say, on a card, every time.
  const settings = body.settings as Json | undefined;
  if (/^\/api\/webapps\/[^/]+$/.test(path) && settings && typeof settings === 'object' && settings.mail !== undefined) return { level: 'ask', why: APP_MAIL };
  return null;
}

/** A few calls are refused for what they carry. */
function refusedBody(method: string, path: string, body: Json, own: string): string | null {
  const s = /^\/api\/sessions\/([^/]+)(\/.*)?$/.exec(path);
  // An app's keys go with a run or an install only from the user's own pages.
  // (A recipe's own `secrets` is a list of the keys it needs, by name: that is not a value.)
  if (/^\/api\/apps\//.test(path) && ((body.secrets && typeof body.secrets === 'object' && !Array.isArray(body.secrets)) || body.allow !== undefined)) return 'A key’s value never passes through an agent: the user gives the keys an app needs on its page, its install card, or its card in a session (use_app shows it).';
  // Keys for models (OpenRouter's, Hugging Face's, an endpoint's): the tools that need one ask the user on a card.
  const given = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  if (path === '/api/models' && (given(body.openrouterKey) || given(body.hfToken) || (body.endpoint && typeof body.endpoint === 'object' && given((body.endpoint as Json).apiKey))))
    return 'A key’s value never passes through an agent. The tools that need an OpenRouter key (generate_image and the rest) ask the user for it on a card when they need it; other keys the user enters in Settings → Models.';
  // The other keys and tokens a setting takes: the user enters them where the setting is (an empty value, removing one, is fine).
  const inner = (o: unknown, k: string) => (o && typeof o === 'object' ? (o as Json)[k] : undefined);
  const KEYS: [RegExp, (b: Json) => boolean, string][] = [
    [/^\/api\/search\/(settings|test)$/, (b) => given(b.key) || given(inner(b.provider, 'key')), 'Settings → Search'],
    [/^\/api\/(telegram|discord|slack)$/, (b) => given(b.token) || given(b.botToken) || given(b.appToken), 'Settings → Chat apps'],
    [/^\/api\/voice$/, (b) => given(inner(b.endpoint, 'apiKey')), 'Settings → Voice'],
    [/^\/api\/scm\/accounts$/, (b) => given(b.token), 'Settings → Source control (or useGh: true, with gh signed in)'],
    [/^\/api\/machines(\/[^/]+)?$/, (b) => given(b.token), 'Settings → Machines'],
  ];
  for (const [re, has, where] of KEYS) if (re.test(path) && has(body)) return `A key’s or token’s value never passes through an agent: the user enters it in ${where}.`;
  if (!s) return null;
  const key = decodeURIComponent(s[1]);
  if (s[2] === '/message' && key === own) return 'That is this session: just answer here.';
  if (method === 'DELETE' && !s[2] && key === own) return 'An agent cannot delete its own session.';
  return null;
}

// ---- the session's permissions -------------------------------------------------------------------

export type Mode = 'read-only' | 'full' | 'normal';

export function modeOf(ctx: RunCtx): Mode {
  const m = ctx.deps.sessions.adapterByRun(ctx.runId)?.state.mode;
  const custom = ctx.agent === 'acp' && ctx.acpAgent === CONSOLE_ID;
  if (m === 'plan' || (ctx.agent === 'codex' && m === 'read-only')) return 'read-only';
  if ((ctx.agent === 'claude' && m === 'bypassPermissions') || (ctx.agent === 'codex' && m === 'full')) return 'full';
  if (custom && m === 'full') return 'full';
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

type Seen = DeviceReport & { at: number; showing: boolean };

/** The themes a device can show, by name: the built-in ones and the user's own. */
async function themeNames(ctx: RunCtx): Promise<{ id: string; name: string }[]> {
  const own = ((await call(ctx, 'GET', '/api/themes').catch(() => null))?.json as { themes?: { id: string; name: string }[] } | undefined)?.themes ?? [];
  return [...BUILT_IN_THEMES, ...own].map((t) => ({ id: t.id, name: t.name }));
}

/** GET /device: what each open page's browser keeps; PUT /device: a change there, for the pages showing this session unless `device` names others. */
async function device(ctx: RunCtx, method: string, body: Json, mode: Mode): Promise<ToolOutput> {
  // Each open page tells the server its browser's settings (web/src/lib/device.ts); none told here: an older page, or a test.
  const all: Seen[] | undefined = ctx.deps.devices?.(ctx.key);
  const how = `PUT /device changes them on the pages showing this session; add device: "<id>" for another open page, or "all" for every one. Settings: ${DEVICE_VALUES}.`;
  if (method === 'GET') {
    if (!all) return { text: `Settings kept on each device (in its browser): ${DEVICE_VALUES}. Their values are not known here. ${how}` };
    if (!all.length) return { text: `No page of the app is open now, so the settings each device keeps in its browser cannot be read. They change on a device once the app is open there (or in Settings → General there). Settings: ${DEVICE_VALUES}.` };
    const devices = all.map((d) => ({
      id: d.id,
      device: d.label,
      showsThisSession: d.showing,
      settings: d.settings,
      ...(d.notifications ? { notifications: d.notifications } : {}),
      ...(d.voices ? { voices: d.voices } : {}),
      toldAt: new Date(d.at).toISOString(),
    }));
    return { text: JSON.stringify({ devices, note: `notifications and voices are read only: each device turns notices on for itself (the browser asks its permission). ${how}` }, null, 1) };
  }
  if (method !== 'PUT' && method !== 'PATCH') return { text: 'Use PUT /device with the settings to change (GET /device reads them).', isError: true };
  if (mode === 'read-only') return { text: 'This session only reads (Plan mode): tell the user what you would change instead.', isError: true };
  const { device: target, ...rest } = body;
  const { set, bad } = deviceChange(rest);
  if (bad.length) return { text: `Not a device setting, or not a value it takes: ${bad.join(', ')}. They are ${DEVICE_VALUES}.`, isError: true };
  if (!Object.keys(set).length) return { text: 'Nothing to change.', isError: true };
  if (typeof set.themeName === 'string') {
    const want = set.themeName.toLowerCase();
    const themes = await themeNames(ctx);
    const t = themes.find((x) => x.name.toLowerCase() === want || x.id === want);
    if (!t) return { text: `No theme is called “${set.themeName}”. The themes: ${themes.map((x) => x.name).join(', ')}.`, isError: true };
    set.themeName = t.name;
  }
  const e: ServerEvent = { t: 'feature', id: 'guide', key: ctx.key, data: { device: set } };
  const names = Object.keys(set).join(', ');
  if (target !== undefined && target !== null && target !== '') {
    if (!all || !ctx.deps.toDevice) return { text: 'Open pages cannot be named here: leave device out, for the pages showing this session.', isError: true };
    const ids = target === 'all' ? [...new Set(all.map((d) => d.id))] : [String(target)];
    const reached = ids.filter((id) => ctx.deps.toDevice!(id, e));
    if (!reached.length) return { text: `No open page has the id “${String(target)}”: GET /device lists the open ones.`, isError: true };
    const label = (id: string) => all.find((d) => d.id === id)?.label ?? id;
    return { text: `Sent to ${reached.map(label).join(', ')}, which switch${reached.length === 1 ? 'es' : ''} now (${names}).` };
  }
  if (all && !all.some((d) => d.showing)) {
    const open = all.map((d) => `${d.id} (${d.label})`).join(', ');
    return {
      text: `No page shows this session now, so no device took it. ${open ? `Pages open now: ${open}. Send it again with device: "<id>" for one of them, or "all".` : 'No page of the app is open: it changes on the device once the app is open there (Settings → General).'}`,
      isError: true,
    };
  }
  ctx.deps.toSubscribers(ctx.key, e);
  return { text: `Sent to the pages showing this session, which switch now (${names}). Other devices keep their own settings until changed there.` };
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
  // `this`: the agent's own session, in a path, a query's key or a body's key.
  url = url.replace(/^\/api\/sessions\/(this|self)(?=[/?]|$)/, `/api/sessions/${encodeURIComponent(ctx.key)}`);
  url = url.replace(/([?&]key=)(this|self)(?=&|$)/, `$1${encodeURIComponent(ctx.key)}`);
  const path = url.split('?')[0].replace(/\/+$/, '') || '/';
  const body: Json = a.body && typeof a.body === 'object' && !Array.isArray(a.body) ? { ...(a.body as Json) } : {};
  if (body.key === 'this' || body.key === 'self') body.key = ctx.key;
  if (body.session && typeof body.session === 'object' && ['this', 'self'].includes((body.session as Json).key)) body.session = { ...(body.session as Json), key: ctx.key };
  const mode = modeOf(ctx);
  if (path === '/device' || path === '/api/device') return device(ctx, method, body, mode);
  if (!path.startsWith('/api/') || path.includes('..')) return { text: 'path: one of the app’s /api/… addresses (app_guide topic "api" lists them), or /device.', isError: true };
  // Every option of Settings: read with the settings of the device showing this session; changed as the calls it makes ask.
  if (/^\/api\/settings(\/[^/]+)?$/.test(path) && method === 'GET' && !/[?&]key=/.test(url)) url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(ctx.key)}`;
  if (/^\/api\/settings\/[^/]+(\/run)?$/.test(path) && method !== 'GET') return settingChange(ctx, a, method, path, body, mode);

  let rule = ruleFor(method, path);
  if (rule.level === 'refuse') return { text: `Not through app_api: ${rule.why ?? 'that is the user’s to do.'}`, isError: true };
  rule = askedFor(path, body) ?? rule;
  const refused = refusedBody(method, path, body, ctx.key);
  if (refused) return { text: `Not through app_api: ${refused}`, isError: true };
  // A confidential session stays out of other sessions' reach (server/confidential).
  if (confidentialIn(ctx.deps.db, url).some((k) => k !== ctx.key)) return { text: `Not through app_api: ${NOT_FROM_HERE}`, isError: true };
  if (method === 'GET' || rule.level === 'free') return out(await call(ctx, method, url), ctx);
  // Plan mode changes nothing, but for the session's own settings (its model, effort, permissions, memory), which the
  // user allows on a card: "leave plan mode and start" works.
  const own = /^\/api\/sessions\/([^/]+)\/(config|extra)$/.exec(path);
  if (mode === 'read-only') {
    if (!own || decodeURIComponent(own[1]) !== ctx.key) return { text: 'This session only reads (Plan mode, or read-only): tell the user what you would change, or change this session’s own mode with POST /api/sessions/this/config { mode } (the user allows it on a card).', isError: true };
    if (rule.level !== 'ask') rule = { level: 'ask', why: rule.why };
  }

  const form = a.form && typeof a.form === 'object' ? (a.form as Json) : null;
  // A form always shows (it asks for input); otherwise Full access asks nothing,
  // and the other modes ask for changes not yet allowed for the session.
  const needsCard = !!form || rule.level === 'ask' || (rule.level === 'always' ? mode !== 'full' : mode === 'normal' && !allowed.has(ctx.key));
  if (needsCard) {
    const answer = await askCard(ctx, { method, url, path, body, summary: a.summary, form, rule });
    if (answer.declined) return { text: answer.declined, isError: true };
    Object.assign(body, answer.body);
  }
  return out(await call(ctx, method, url, method === 'DELETE' && !Object.keys(body).length ? undefined : body), ctx);
}

// ---- an option of Settings, by its id (GET /api/settings lists them with their values) -------------------------------

const RANK: Record<Level, number> = { free: 0, confirm: 1, always: 2, ask: 3, refuse: 4 };

/** How the most careful of a change's calls asks (the first to refuse refuses it); null when one is refused, with why. */
function ruleOfCalls(ctx: RunCtx, calls: Planned['calls']): { level: Level; why?: string; refused?: string } {
  let rule: { level: Level; why?: string } = { level: 'free' };
  for (const c of calls) {
    const p = c.path.split('?')[0];
    const b = c.body && typeof c.body === 'object' && !Array.isArray(c.body) ? (c.body as Json) : {};
    let r = ruleFor(c.method, p);
    if (r.level === 'refuse') return { level: 'refuse', refused: r.why ?? 'that is the user’s to do.' };
    r = askedFor(p, b) ?? r;
    const no = refusedBody(c.method, p, b, ctx.key);
    if (no) return { level: 'refuse', refused: no };
    if (RANK[r.level] > RANK[rule.level] || (r.level === rule.level && !rule.why && r.why)) rule = r;
  }
  return rule;
}

/**
 * PUT /api/settings/:id { value } (and POST /api/settings/:id/run, a button): the option's change is made once with only
 * its reads going through, to see the calls it makes; it then asks as those calls would (the most careful deciding,
 * one refused refusing it), on a card that says the option, its value before and after, and the calls. A device's own
 * option goes to the pages as PUT /device does; a key's value never goes through here.
 */
async function settingChange(ctx: RunCtx, a: ApiArgs, method: string, path: string, body: Json, mode: Mode): Promise<ToolOutput> {
  const m = /^\/api\/settings\/([^/]+)(\/run)?$/.exec(path)!;
  const run = !!m[2];
  if (run ? method !== 'POST' : method !== 'PUT' && method !== 'PATCH') return { text: run ? 'Press a button with POST /api/settings/<id>/run.' : 'Change an option with PUT /api/settings/<id> { value }.', isError: true };
  let row: Row;
  try {
    row = findRow(decodeURIComponent(m[1]));
  } catch (e) {
    return { text: (e as Error).message.replace(/\(?hydor settings list shows them\)?/g, '(GET /api/settings lists them)'), isError: true };
  }
  if (!run && row.device) {
    const b = deviceBody(row, body.value);
    if (!b) return { text: `Not through app_api: ${notHere(row)}`, isError: true };
    return device(ctx, 'PUT', { ...b, ...(body.device !== undefined ? { device: body.device } : {}) }, mode);
  }
  if (mode === 'read-only') return { text: 'This session only reads (Plan mode, or read-only): tell the user what you would change instead.', isError: true };
  const base = ctx.deps.publicBase();
  if (run && row.kind !== 'action') return { text: `Not through app_api: ${notHere(row) ?? `${row.label} is not a button: PUT /api/settings/${row.id} { value } changes it.`}`, isError: true };
  if (!run) {
    const why = notHere(row);
    if (why) return { text: `Not through app_api: ${why}`, isError: true };
    if (!('value' in body)) return { text: `body: { value }, the option’s new value (GET /api/settings/${row.id} says what it takes).`, isError: true };
    if (row.kind === 'secret' && asText(body.value).trim()) return { text: `Not through app_api: a key’s or token’s value never passes through an agent. The user enters it in Settings (${base}${settingsAddress(row)}); { value: "" } removes it.`, isError: true };
  }
  const plan = async (b: Json): Promise<Planned | ToolOutput> => {
    try {
      return run ? await planAction(ctx.deps.app, row, typeof b.arg === 'string' ? b.arg : undefined) : await planSetting(ctx.deps.app, row, b.value);
    } catch (e) {
      return { text: `${(e as Error).message.replace(/^[a-z]+\.[a-z0-9-]+: /, `${row.label}: `)}`, isError: true };
    }
  };
  let p = await plan(body);
  if ('text' in p) return p;
  if (!p.calls.length) return { text: `Nothing to change: ${row.label} is ${shown(p.before)} already.` };
  let rule = ruleOfCalls(ctx, p.calls);
  if (rule.refused) return { text: `Not through app_api: ${rule.refused}`, isError: true };
  const form = a.form && typeof a.form === 'object' ? (a.form as Json) : null;
  const needsCard = !!form || rule.level === 'ask' || (rule.level === 'always' ? mode !== 'full' : rule.level === 'confirm' && mode === 'normal' && !allowed.has(ctx.key));
  if (needsCard) {
    const secret = row.kind === 'secret';
    const lines = run ? [`Presses **${row.label}**.`] : [p.before !== undefined ? `- **${row.label}**: ${secret ? (p.before ? 'set' : 'not set') : shown(p.before)} → ${secret ? 'removed' : shown(p.after)}` : `- **${row.label}**: ${shown(p.after)}`];
    if (p.question) lines.push(p.question);
    const title = String(a.summary ?? '').trim() || (run ? `Press “${row.label}”` : `Change “${row.label}”`);
    const answer = await askCard(ctx, { method, url: path, path, body, summary: title, form, rule, lines, calls: p.calls.slice(0, 4).map((c) => `${c.method} ${c.path}`) });
    if (answer.declined) return { text: answer.declined, isError: true };
    if (Object.keys(answer.body).length) {
      // The user's answers on the form: the change as they made it, which must not be one refused.
      Object.assign(body, answer.body);
      if (!run && row.kind === 'secret' && asText(body.value).trim()) return { text: 'Not through app_api: a key’s value never passes through an agent.', isError: true };
      p = await plan(body);
      if ('text' in p) return p;
      rule = ruleOfCalls(ctx, p.calls);
      if (rule.refused) return { text: `Not through app_api: ${rule.refused}`, isError: true };
    }
  }
  const url = `/api/settings/${encodeURIComponent(row.id)}${run ? '/run' : ''}`;
  return out(await call(ctx, run ? 'POST' : 'PUT', url, run ? { ...(typeof body.arg === 'string' ? { arg: body.arg } : {}), confirm: true } : { value: body.value, confirm: true }), ctx);
}

interface CardIn {
  method: string;
  url: string;
  path: string;
  body: Json;
  summary?: string;
  form: Json | null;
  rule: { level: Level; why?: string };
  /** What the change does, when the caller says it (an option of Settings: before → after), and the calls it makes. */
  lines?: string[];
  calls?: string[];
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
  if (!c.lines && (c.method === 'PUT' || c.method === 'PATCH')) now = (await call(ctx, 'GET', c.url).catch(() => null))?.json;
  // A session's model, effort and permissions as they are now (its config has no GET of its own).
  const config = !c.lines && /^\/api\/sessions\/([^/]+)\/config$/.exec(c.path);
  if (config) {
    const s = ctx.deps.sessions.summary(decodeURIComponent(config[1]));
    if (s) now = { model: s.live?.model ?? s.prefs?.model ?? s.model, effort: s.live?.effort ?? s.prefs?.effort, mode: s.live?.mode ?? s.prefs?.mode };
  }
  const asked = new Set(fields.map((f) => f.id));
  const lines = c.lines ?? changeLines(Object.fromEntries(Object.entries(c.body).filter(([k]) => !asked.has(k))), now);
  const session = /^\/api\/sessions\/([^/]+)/.exec(c.path)?.[1];
  const other = session && decodeURIComponent(session) !== ctx.key ? ctx.deps.sessions.summary(decodeURIComponent(session)) : null;
  const detail = [
    typeof c.form?.message === 'string' && c.form.message.trim() ? c.form.message.trim().slice(0, 1500) : '',
    other ? `In the session **${other.title.replace(/\*/g, '')}**.` : '',
    lines.join('\n'),
    c.rule.why ?? '',
    (c.calls ?? [`${c.method} ${c.url}`]).map((x) => `\`${x.length > 120 ? `${x.slice(0, 120)}…` : x}\``).join(' · '),
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

/**
 * A change one of the app's own tools makes (save_agent, delete_agent…), asked as app_api asks: Plan mode refuses it;
 * Full access asks nothing but `ask`; otherwise a card, which for `confirm` the user may allow for the rest of the
 * session (the same allowance as app_api's). Null when it may go ahead; else why not, for the agent.
 */
export async function confirmChange(ctx: RunCtx, c: { title: string; detail: string; level: 'confirm' | 'always' | 'ask'; danger?: boolean; label?: string; facts?: ApprovalRequest['facts']; raw?: string }): Promise<string | null> {
  const mode = modeOf(ctx);
  if (mode === 'read-only') return 'This session only reads (Plan mode, or read-only): tell the user what you would change instead.';
  if (c.level === 'confirm' ? mode === 'full' || allowed.has(ctx.key) : c.level === 'always' && mode === 'full') return null;
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return 'Nobody can confirm it now (the session is not running in the app).';
  const card: ApprovalRequest = {
    id: `app-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'other',
    title: c.title.replace(/\s+/g, ' ').trim().slice(0, 120),
    detail: c.detail.slice(0, 6000),
    prose: true,
    ...(c.facts?.length ? { facts: c.facts.slice(0, 14), ...(c.raw ? { raw: c.raw.slice(0, 3000) } : {}) } : {}),
    options: [
      { id: 'accept', label: c.label ?? (c.danger ? 'Delete' : 'Allow'), style: c.danger ? 'danger' : 'primary' },
      ...(c.level === 'confirm' ? [{ id: 'always', label: 'Allow for this session' }] : []),
      { id: 'deny', label: 'Don’t', style: 'default' as const },
    ],
    createdAt: Date.now(),
  };
  const limit = AbortSignal.timeout(WAIT_MS);
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit });
  if (!answer) return limit.aborted ? 'The user did not answer the card in time; it was withdrawn. Ask them in your reply whether to go ahead.' : 'The card was withdrawn before the user answered.';
  if (answer.decision !== 'accept' && answer.decision !== 'always') return `The user said no${answer.message?.trim() ? `: “${answer.message.trim()}”` : '.'} Nothing was changed.`;
  if (answer.decision === 'always') allowed.add(ctx.key);
  return null;
}
