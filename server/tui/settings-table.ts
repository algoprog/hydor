// Every option of the Settings page, as the terminal reads and changes it: one row for each option of the search box's
// catalog (shared/find-catalog.ts OPTIONS, by section and the words the page shows), with what kind of value it takes,
// how to read it and how to change it, from the page's own code (web/src/features/settings/ and the pages each section
// shows). `hydor settings` (areas/settings.ts) is built on this table, and settings-test.ts fails when an option of the
// catalog has no row here, or a row names no option, so a new setting cannot be forgotten.
//
// What a row's kind means:
//   switch   on or off            choice  one of a few values (or any, when `free`)     number  a whole number in a range
//   text     a line (or a text)   list    several items, written with commas             secret  a key or token: typed hidden, read as set or not
//   action   a button (Send a test, Check now), after a yes when it asks one
//   page     only the page can do it (drawing a signature, a sign-in in a browser, the theme editor): its address is printed
//   command  an "Add…" button whose list has a command of its own (hydor mcp add): the command is named
//   device   kept in each browser (theme, language, sound); two of them are the terminal chat's own (`terminal`), kept in
//            <data folder>/terminal.json, which the chat reads with terminalPrefs()
import fs from 'node:fs';
import path from 'node:path';
import { OPTIONS, SECTIONS } from '../../shared/find-catalog.ts';
import { slackManifest } from '../../shared/chat-apps.ts';
import { config } from '../config.ts';
import { UsageError } from './args.ts';
import type { Conn } from './client.ts';

export type Kind = 'switch' | 'choice' | 'number' | 'text' | 'list' | 'secret' | 'action' | 'page' | 'device' | 'command';
export type Value = boolean | number | string | string[] | null;
export interface Choice {
  value: string;
  label: string;
}
/** The connection a row reads and changes through (a fake one in the tests). */
export type Ctl = Pick<Conn, 'api'>;
type Api = Ctl['api'];

/** Where a value is read: an endpoint (or several, handed to `pick` together) and the field in its answer, or a function. */
export interface Reader {
  endpoint: string | string[];
  /** A dotted path into the (first) answer. */
  field?: string;
  pick?: (d: any, all: any[]) => Value | undefined;
}

/** How a value is changed: one call, or `apply` for a change that takes several. `cur` is the answer of the row's read, for an endpoint that replaces a whole object. */
export interface Writer {
  method?: 'PUT' | 'POST' | 'PATCH' | 'DELETE';
  endpoint?: string;
  body?: (v: Value, cur: any) => unknown;
  /** The change reads the current state first (the row's read endpoint). */
  cur?: boolean;
  apply?: (api: Api, v: Value, cur: any) => Promise<void>;
  /** A yes/no question to ask before this change, when it needs one (it takes something away). */
  ask?: (v: Value, cur: any) => string | null;
}

export interface Action {
  /** The yes/no question to ask first (none: it just runs). */
  question?: string;
  /** What it needs typed after the option (a name for a new token). */
  arg?: string;
  /** Do it; the lines to say afterwards. */
  run: (api: Api, arg?: string) => Promise<string[]>;
  /** The call can take minutes. */
  slow?: boolean;
}

export interface Row {
  /** `<section>.<slug of the words the page shows>`, such as `general.resume-after-usage-limits`. */
  id: string;
  section: string;
  /** The words the page shows, as the catalog has them. */
  label: string;
  kind: Kind;
  choices?: Choice[];
  /** Values asked from the server (models), for Tab completion and the picker. */
  load?: (api: Api) => Promise<Choice[]>;
  /** Any value is accepted, not only the listed ones (a model by its id). */
  free?: boolean;
  range?: { min: number; max: number };
  /** The text is long: it comes from a file or the editor. */
  multiline?: boolean;
  /** What a list's items look like, for the help. */
  items?: string;
  check?: (v: Value) => string | null;
  read?: Reader;
  write?: Writer;
  act?: Action;
  /** A page-only option or a read-only one: nothing to change here. */
  readonly?: boolean;
  /** A command that has this option's list or button (kind command). */
  command?: string;
  /** A device setting's key; `terminal` ones are the chat's own. */
  device?: { key: 'theme' | 'language' | 'sound' | 'push' | 'signout' | 'dictation' | 'speech-language' | 'read-aloud' | 'enter' | 'suggestions'; terminal?: boolean };
  /** What an action's yes and no read as, when it has a state to show (a permission: allowed or not). */
  states?: [string, string];
  /** What the terminal cannot do here, or what to know. */
  note?: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

type Body = Omit<Row, 'id' | 'section' | 'label' | 'kind'>;
const rows: Row[] = [];
/** One row of the table. */
function row(section: string, label: string, kind: Kind, body: Body = {}) {
  rows.push({ id: `${section}.${slug(label)}`, section, label, kind, ...body });
}
const get = (d: any, field: string) => field.split('.').reduce((x, k) => (x == null ? undefined : x[k]), d);
const rd = (endpoint: string, field?: string): Reader => ({ endpoint, field });
const put = (endpoint: string, body: (v: Value, cur: any) => unknown, more: Partial<Writer> = {}): Writer => ({ method: 'PUT', endpoint, body, ...more });
const post = (endpoint: string, body?: (v: Value, cur: any) => unknown): Writer => ({ method: 'POST', endpoint, body });
const GB = (mb?: number | null) => (mb ? String(mb / 1024) : null);

/** The page's address for an option (`/settings?s=<section>&find=<words>`, as the guide links it). */
export const settingsAddress = (r: Pick<Row, 'section' | 'label'>) => `/settings?s=${r.section}&find=${encodeURIComponent(r.label)}`;

// ---- App › General ----------------------------------------------------------------------------------------------------
row('general', 'Appearance', 'device', { device: { key: 'theme' }, note: 'Dark, light or following the device, or a theme of your own.' });
row('general', 'New theme', 'page', { note: 'The theme editor is a page.' });
row('general', 'Import', 'page', { note: 'Importing a theme file is done on the page.' });
row('general', 'Language', 'device', { device: { key: 'language' }, note: 'The language the app is shown in.' });
row('general', 'Sending while an agent works', 'device', {
  device: { key: 'enter', terminal: true },
  choices: [
    { value: 'join', label: 'Join the turn' },
    { value: 'queue', label: 'Wait for it' },
  ],
  note: 'Here it is what Enter does in the terminal chat while an agent works; the app keeps its own in each browser.',
});
row('general', 'Terminal suggestions', 'device', {
  device: { key: 'suggestions', terminal: true },
  note: 'Here it is the terminal chat’s grey suggestions from your earlier messages; the app keeps its own for its terminals in each browser.',
});
row('general', 'Resume after usage limits', 'switch', { read: rd('/api/app-settings', 'autoResume'), write: put('/api/app-settings', (v) => ({ autoResume: v })) });
row('general', 'Delete inactive sessions', 'choice', {
  choices: [
    { value: 'off', label: 'Never' },
    { value: '90', label: 'After 3 months' },
    { value: '182', label: 'After 6 months' },
    { value: '365', label: 'After 1 year' },
    { value: '730', label: 'After 2 years' },
    { value: '1825', label: 'After 5 years' },
  ],
  free: true,
  check: (v) => (v === 'off' || (Number.isInteger(Number(v)) && Number(v) >= 30 && Number(v) <= 3650) ? null : 'Pick off, or a number of days from 30 to 3650'),
  read: { endpoint: '/api/retention', pick: (d) => (d.on ? String(d.days) : 'off') },
  write: put('/api/retention', (v) => (v === 'off' ? { on: false } : { on: true, days: Number(v) })),
  note: 'The days a session may stay inactive before the app deletes it (pinned ones and ones at work stay).',
});
row('general', 'Limit each session', 'list', {
  items: 'memory=<2|4|8|16> (GB), cpus=<1|2|4|8>; none for no limit',
  choices: ['memory=2', 'memory=4', 'memory=8', 'memory=16', 'cpus=1', 'cpus=2', 'cpus=4', 'cpus=8', 'none'].map((v) => ({ value: v, label: v })),
  check: (v) => {
    const bad = (v as string[]).find((i) => !/^(memory=(2|4|8|16)|cpus=(1|2|4|8))$/.test(i));
    return bad ? `“${bad}” is not one of memory=2, 4, 8 or 16 (GB) and cpus=1, 2, 4 or 8` : null;
  },
  read: { endpoint: '/api/sessions/resources', pick: (d) => [d.limits?.memoryMb ? `memory=${GB(d.limits.memoryMb)}` : '', d.limits?.cpus ? `cpus=${d.limits.cpus}` : ''].filter(Boolean) },
  write: put('/api/sessions/limits', (v) => {
    const items = v as string[];
    const of = (k: string) => items.find((i) => i.startsWith(`${k}=`))?.split('=')[1];
    return { memoryMb: of('memory') ? Number(of('memory')) * 1024 : null, cpus: of('cpus') ? Number(of('cpus')) : null };
  }),
  note: 'The most memory and processors one session’s programs may use, from its agent’s next start (Linux with systemd for your user).',
});
row('general', 'Start when this computer starts', 'switch', {
  read: rd('/api/startup', 'on'),
  write: put('/api/startup', (v) => ({ on: v })),
  note: 'Changing it needs a service of your user (or passwordless sudo for a system service); Docker’s restart policy decides there.',
});
row('general', 'Update automatically', 'switch', {
  read: { endpoint: '/api/bootstrap', pick: (d) => (d.update ? !!(d.update.auto && d.update.canRestart) : undefined) },
  write: put('/api/update/auto', (v) => ({ on: v })),
  note: 'Only where the app can restart itself.',
});
row('general', 'Take the tour', 'page', { note: 'The welcome tour starts in the browser.' });
row('general', 'Tips', 'switch', { read: rd('/api/tips', 'on'), write: put('/api/tips', (v) => ({ on: v })) });
row('general', 'Check now', 'action', {
  act: {
    run: async (api) => {
      const r = await api<{ update: any }>('POST', '/api/update-check');
      const u = r.update;
      if (!u) return ['This copy was not installed from git with an upstream, so it cannot check.'];
      if (u.error) return [`Could not check for updates: ${u.error}`];
      if (u.behind > 0)
        return [u.kind === 'app' ? `Version ${u.latest} is out.` : `${u.behind} update${u.behind === 1 ? '' : 's'} out${u.latest ? ` · latest: ${u.latest}` : ''}. hydor update installs it.`];
      return ['You have the newest version.'];
    },
  },
});

// ---- App › Notifications ----------------------------------------------------------------------------------------------
row('notifications', 'Notify this device', 'device', { device: { key: 'push' }, note: 'Each device turns notices on for itself (a browser or a phone).' });
row('notifications', 'Sound', 'device', { device: { key: 'sound' }, note: 'A chime with each notice while the app is open.' });
row('notifications', 'Send a test', 'action', {
  act: {
    run: async (api) => {
      const r = await api<{ sent: number }>('POST', '/api/push/test');
      return [r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. It shows when the app is not in view.` : 'No device got it: turn on Notify this device in the app on a device first.'];
    },
  },
});

// ---- App › Chat apps --------------------------------------------------------------------------------------------------
const CHATS = ['telegram', 'discord', 'slack'] as const;
const CHAT_NAME: Record<string, string> = { telegram: 'Telegram', discord: 'Discord', slack: 'Slack' };
const chatEndpoints = CHATS.map((c) => `/api/${c}`);
/** Writes to the chat apps that are connected (all of them when none is), whichever way they are set up. */
const chatApply = (patch: (v: Value) => unknown) => async (api: Api, v: Value, cur: any) => {
  const all = cur as any[];
  const on = CHATS.filter((_, i) => all[i]?.connected);
  for (const c of on.length ? on : CHATS) await api('PUT', `/api/${c}`, patch(v));
};
row('chat', 'Telegram', 'secret', {
  read: { endpoint: '/api/telegram', pick: (d) => !!d.connected },
  write: put('/api/telegram', (v) => ({ token: v || null })),
  note: 'The bot’s token from @BotFather. An empty value removes the bot and unlinks every chat.',
});
row('chat', 'Discord', 'secret', {
  read: { endpoint: '/api/discord', pick: (d) => !!d.connected },
  write: put('/api/discord', (v) => ({ token: v || null })),
  note: 'The bot’s token from the Developer Portal. An empty value removes the bot and unlinks every chat.',
});
row('chat', 'Slack', 'secret', {
  read: { endpoint: '/api/slack', pick: (d) => !!d.connected },
  write: put('/api/slack', (v) => {
    const parts = String(v ?? '')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!parts.length) return { token: null };
    if (parts.length !== 2 || !parts[0].startsWith('xoxb-') || !parts[1].startsWith('xapp-'))
      throw new UsageError('Slack takes both tokens: the Bot User OAuth Token (xoxb-…) and the App-Level Token (xapp-…), with a space between');
    return { botToken: parts[0], appToken: parts[1] };
  }),
  note: 'Both tokens, the Bot User OAuth Token (xoxb-…) then the App-Level Token (xapp-…), with a space between. An empty value removes the app and unlinks every chat.',
});
row('chat', 'Link a chat', 'action', {
  act: {
    run: async (api) => {
      const out: string[] = [];
      for (const c of CHATS) {
        const st = await api<any>('GET', `/api/${c}`).catch(() => null);
        if (!st?.connected) continue;
        const r = await api<any>('POST', `/api/${c}/pair`);
        out.push(`${CHAT_NAME[c]}: send this code from the chat, within ten minutes: ${r.pairing?.code ?? '?'}`);
      }
      return out.length ? out : ['No chat app is connected yet: set Telegram, Discord or Slack first.'];
    },
  },
});
row('chat', 'Add the bot to a server', 'text', {
  readonly: true,
  read: { endpoint: '/api/discord', pick: (d) => d.invite ?? '' },
  note: 'The link that adds your Discord bot to a server; open it in a browser.',
});
row('chat', 'Copy manifest', 'action', { act: { run: async () => [slackManifest()] }, note: 'Prints the Slack app’s manifest, to paste when you create the app.' });
row('chat', 'New sessions use', 'choice', {
  choices: [
    { value: 'claude', label: 'Claude Code' },
    { value: 'codex', label: 'Codex' },
  ],
  read: { endpoint: chatEndpoints, pick: (_d, all) => (all.find((x) => x?.connected) ?? all[0])?.agent },
  write: { cur: true, apply: (api, v, cur) => chatApply(() => ({ agent: v }))(api, v, cur) },
  note: 'Set for every chat app that is connected.',
});
row('chat', 'Notices from every session', 'switch', {
  read: { endpoint: chatEndpoints, pick: (_d, all) => !!(all.find((x) => x?.connected) ?? all[0])?.notify },
  write: { cur: true, apply: (api, v, cur) => chatApply(() => ({ notify: v }))(api, v, cur) },
  note: 'Set for every chat app that is connected.',
});

// ---- App › Password, Signatures, Source control, Connect other agents, Machines -----------------------------------------
row('security', 'Change password', 'command', { command: 'hydor set-password', note: 'Changing it signs out every other browser.' });
row('security', 'Sign out of this browser', 'device', { device: { key: 'signout' }, note: 'It signs out one browser.' });
row('signatures', 'New signature', 'page', { note: 'Drawing, typing or uploading a signature happens on the page.' });
row('scm', 'Add an account', 'page', { note: 'A token goes into the page’s form (GitHub and Gitea accounts).' });
row('connect', 'New token', 'action', {
  act: {
    arg: 'a name for the token',
    run: async (api, name) => {
      const r = await api<{ token: string }>('POST', '/api/mcp/tokens', { name: name || 'Terminal' });
      return [`The token (shown once): ${r.token}`];
    },
  },
});
row('connect', 'What they can do', 'page', { note: 'Nothing to set: the page lists the tools an agent with a token gets.' });
row('machines', 'Add a machine', 'command', { command: 'hydor machines add' });
row('machines', 'Access from other machines', 'command', {
  command: 'hydor access-token',
  note: 'hydor access-token makes a token for another machine; hydor machines lists the machines this one uses.',
});

// ---- Agents › Accounts, More agents, Models ---------------------------------------------------------------------------
row('accounts', 'Accounts', 'command', { command: 'hydor accounts add', note: 'Signing in to an added account is done on the page, by you.' });
row('accounts', 'Switch accounts at a limit', 'switch', { read: rd('/api/app-settings', 'autoSwitch'), write: put('/api/app-settings', (v) => ({ autoSwitch: v })) });
row('accounts', 'Use API credit at a limit', 'switch', {
  read: rd('/api/app-settings', 'apiCredit'),
  write: put('/api/app-settings', (v) => ({ apiCredit: v })),
  note: 'The Anthropic API key itself is saved on the page.',
});
row('accounts', 'Agent programs', 'action', {
  act: {
    question: 'Update every agent program that is behind now (it can take minutes)?',
    slow: true,
    run: async (api) => {
      await api('POST', '/api/clients/update', undefined, { timeoutMs: 120_000 });
      const r = await api<any>('GET', '/api/clients');
      return [(r.clients ?? []).map((c: any) => `${c.name} ${c.version ?? (c.source === 'missing' ? 'missing' : '?')}`).join(' · ') || 'No agent programs found.'];
    },
  },
  read: { endpoint: '/api/clients', pick: (d) => (d.clients ?? []).map((c: any) => `${c.name} ${c.version ?? 'missing'}`) },
  note: 'Updates them now; a program that is not installed installs on the page.',
});
row('accounts', 'Update automatically', 'switch', { read: rd('/api/clients', 'updates.auto'), write: put('/api/clients/auto', (v) => ({ on: v })) });
row('agents', 'Your agents', 'page', {
  read: { endpoint: '/api/acp-agents', pick: (d) => (d.agents ?? []).map((a: any) => a.name) },
  note: 'Agents that speak ACP are added and removed on the page.',
});
row('agents', 'Add your own', 'page', { note: 'An agent of your own, by its command, is added on the page.' });
row('agents', 'Agents that speak ACP', 'page', { note: 'Gemini CLI, OpenCode, Qwen Code, Goose and the others are added on the page.' });
row('models', 'Helper model', 'choice', {
  free: false,
  load: async (api) => ((await api<any>('GET', '/api/helper')).options ?? []).map((o: any) => ({ value: o.value, label: o.label })),
  read: rd('/api/helper', 'model'),
  write: put('/api/helper', (v) => ({ model: v })),
});
row('models', 'Tiers', 'command', { command: 'hydor tiers', note: 'hydor tiers shows the model each tier means for each program and changes them.' });
row('models', 'Lead with helpers', 'switch', { read: rd('/api/models/tiers', 'team.on'), write: put('/api/models/tiers', (v) => ({ team: { on: v } })) });
row('models', 'Max for hard problems', 'switch', { read: rd('/api/models/tiers', 'team.hard'), write: put('/api/models/tiers', (v) => ({ team: { hard: v } })) });
row('models', 'On this machine', 'page', {
  read: { endpoint: '/api/models', pick: (d) => (d.local ?? []).map((m: any) => m.repo ?? m.id) },
  note: 'Installing, starting and removing models run here is done on the page.',
});
row('models', 'Add a model from Hugging Face', 'page', { note: 'The suggestions, the search and the install are on the page.' });
row('models', 'OpenRouter', 'secret', {
  read: { endpoint: '/api/models', pick: (d) => !!d.openrouter?.keyHint },
  write: put('/api/models', (v) => ({ openrouterKey: v || null })),
  note: 'Your OpenRouter key. An empty value removes it. Pinning models is done on the page.',
});
row('models', 'Runtimes and endpoints', 'text', {
  read: rd('/api/models', 'ollama.url'),
  write: put('/api/models', (v) => ({ ollamaUrl: v })),
  note: 'Here it is Ollama’s address; the vLLM command and other OpenAI-compatible endpoints are set on the page.',
});
row('models', 'Hugging Face token', 'secret', {
  read: { endpoint: '/api/models', pick: (d) => !!d.hfTokenHint },
  write: put('/api/models', (v) => ({ hfToken: v || null })),
  note: 'Only for gated or private models. An empty value removes it.',
});

// ---- Agents › Agent Guidelines, MCP servers, Skills, Plugins, Scheduled tasks -------------------------------------------
row('guidelines', 'For every session', 'text', { multiline: true, read: rd('/api/guidelines', 'global'), write: put('/api/guidelines', (v) => ({ global: v })) });
row('guidelines', 'For a project', 'command', { command: 'hydor guidelines --project <project>' });
row('guidelines', 'For one session', 'command', { command: 'hydor guidelines --session <session>' });
row('guidelines', 'Instruction files', 'page', { note: 'CLAUDE.md and AGENTS.md are files: edit them with your editor, or on the page.' });
row('mcp', 'Add server', 'command', { command: 'hydor mcp add' });
row('mcp', 'Check connections', 'action', {
  act: {
    slow: true,
    run: async (api) => {
      const out: string[] = [];
      for (const agent of ['claude', 'codex']) {
        const r = await api<{ servers: any[] }>('POST', '/api/setup/mcp/status', { agent }, { timeoutMs: 180_000 });
        for (const s of r.servers ?? [])
          out.push(`${agent === 'claude' ? 'Claude Code' : 'Codex'} · ${s.name}: ${s.state}${s.tools != null ? ` (${s.tools} tools)` : ''}${s.error ? ` — ${s.error}` : ''}`);
      }
      return out.length ? out : ['No MCP servers are set up.'];
    },
  },
  note: 'Starts each server the way a new session would; it takes up to a couple of minutes.',
});
row('skills', 'New skill', 'command', { command: 'hydor skills add' });
row('skills', 'Built in', 'command', { command: 'hydor skills list' });
row('skills', 'Yours', 'command', { command: 'hydor skills list' });
row('skills', 'From plugins', 'command', { command: 'hydor skills list' });
row('skills', 'Claude Code and Codex', 'command', { command: 'hydor skills list' });
row('skills', 'Suggest skills that fit', 'switch', { read: rd('/api/skillpack', 'suggest'), write: put('/api/skillpack/settings', (v) => ({ suggest: v })) });
row('skills', 'Bring skills in by keywords', 'switch', { read: rd('/api/skillpack', 'triggers'), write: put('/api/skillpack/settings', (v) => ({ triggers: v })) });
row('skills', 'Make my own version', 'page', { note: 'Changing a built-in skill takes the skill editor on the page.' });
row('plugins', 'Your plugins', 'command', { command: 'hydor plugins list' });
row('plugins', 'Come with the app', 'command', { command: 'hydor plugins list' });
row('plugins', 'Make a plugin', 'page', { note: 'The plugin editor is a page.' });
row('plugins', 'From a link', 'command', { command: 'hydor plugins add' });
row('plugins', 'From a .zip file', 'command', { command: 'hydor plugins add' });
row('plugins', 'Pack into a .zip', 'page', { note: 'The page downloads a plugin as one file.' });
row('plugins', 'Claude Code', 'page', { note: 'Claude Code’s own plugins and marketplaces are managed on the page.' });
row('plugins', 'Codex', 'page', { note: 'Codex’s own plugins and marketplaces are managed on the page.' });
for (const [label, what] of [
  ['New task', 'Agent work that starts by itself'],
  ['Start from an example', 'Ready-made scheduled tasks'],
  ['Morning brief', 'A ready-made scheduled task'],
  ['News on a topic', 'A ready-made scheduled task'],
  ['Price watch', 'A ready-made scheduled task'],
  ['Page change alert', 'A ready-made scheduled task'],
  ['Weekly report from a folder', 'A ready-made scheduled task'],
  ['Inbox digest', 'A ready-made scheduled task'],
  ['Habit check-in', 'A ready-made scheduled task'],
  ['New releases', 'A ready-made scheduled task'],
  ['Site up check', 'A ready-made scheduled task'],
  ['Disk space alert', 'A ready-made scheduled task'],
  ['Review new pull requests', 'A ready-made scheduled task'],
  ['CI doctor', 'A ready-made scheduled task'],
  ['Issue triage', 'A ready-made scheduled task'],
  ['Dependency gardener', 'A ready-made scheduled task'],
  ['Incident first responder', 'A ready-made scheduled task'],
  ['New files in a folder', 'A ready-made scheduled task'],
  ['Reminder', 'A ready-made scheduled task'],
] as const) {
  row('tasks', label, 'command', {
    command: 'hydor tasks new',
    note: label === 'New task' ? what : `${what}: its wording is written on the page; hydor tasks new makes a task of your own the same way.`,
  });
}

// ---- Capabilities › Search, Browser, Computer use ----------------------------------------------------------------------
const providers = (d: any): any[] => d?.providers ?? [];
const providerRead = (id: string, pick: (p: any) => Value | undefined): Reader => ({ endpoint: '/api/search/settings', pick: (d) => pick(providers(d).find((p) => p.id === id) ?? {}) });
const SEARCH_IDS = ['naget', 'searxng', 'brave', 'duckduckgo'];
row('search', 'Providers', 'list', {
  items: 'the providers to use, in the order to try them: naget, searxng, brave, duckduckgo',
  choices: SEARCH_IDS.map((v) => ({ value: v, label: v })),
  check: (v) => {
    const bad = (v as string[]).find((i) => !SEARCH_IDS.includes(i));
    return bad ? `“${bad}” is not a search provider (${SEARCH_IDS.join(', ')})` : null;
  },
  read: {
    endpoint: '/api/search/settings',
    pick: (d) =>
      providers(d)
        .filter((p) => p.enabled)
        .map((p) => p.id),
  },
  write: {
    cur: true,
    apply: async (api, v, cur) => {
      const want = v as string[];
      await api('PUT', '/api/search/settings', { order: want });
      for (const p of providers(cur)) if (!!p.enabled !== want.includes(p.id)) await api('PUT', '/api/search/settings', { provider: { id: p.id, enabled: want.includes(p.id) } });
    },
  },
  note: 'The ones listed are on, in that order; the others are turned off.',
});
row('search', 'Naget Search', 'secret', {
  read: providerRead('naget', (p) => !!p.keyHint),
  write: put('/api/search/settings', (v) => ({ provider: { id: 'naget', key: v || null } })),
  note: 'The key turns it on. An empty value removes it.',
});
row('search', 'SearXNG', 'text', {
  read: providerRead('searxng', (p) => p.url?.value ?? ''),
  write: put('/api/search/settings', (v) => ({ provider: { id: 'searxng', url: v || null } })),
  note: 'The address of your instance; an empty value removes it.',
});
row('search', 'Brave Search', 'secret', {
  read: providerRead('brave', (p) => !!p.keyHint),
  write: put('/api/search/settings', (v) => ({ provider: { id: 'brave', key: v || null } })),
  note: 'The key turns it on. An empty value removes it.',
});
row('search', 'DuckDuckGo', 'switch', { read: providerRead('duckduckgo', (p) => !!p.enabled), write: put('/api/search/settings', (v) => ({ provider: { id: 'duckduckgo', enabled: v } })) });
row('search', 'Results per search', 'number', { range: { min: 1, max: 100 }, read: rd('/api/search/settings', 'defaultK'), write: put('/api/search/settings', (v) => ({ defaultK: v })) });
row('browser', 'A browser for agents', 'switch', {
  read: rd('/api/browser/settings', 'settings.enabled'),
  write: put('/api/browser/settings', (v) => ({ enabled: v })),
  note: 'It needs a Chromium on this machine.',
});
row('browser', 'Chromium', 'choice', {
  load: async (api) => [{ value: 'best', label: 'The best one found' }, ...((await api<any>('GET', '/api/browser/settings')).chromes ?? []).map((c: any) => ({ value: c.path, label: c.label }))],
  read: { endpoint: '/api/browser/settings', pick: (d) => d.settings?.chrome || 'best' },
  write: put('/api/browser/settings', (v) => ({ chrome: v === 'best' ? '' : v })),
  note: 'Downloading Chrome for Testing is done on the page.',
});
row('browser', 'Show a window', 'switch', { read: { endpoint: '/api/browser/settings', pick: (d) => !d.settings?.headless }, write: put('/api/browser/settings', (v) => ({ headless: !v })) });
row('browser', 'Keep pages off this machine and its network', 'switch', {
  read: rd('/api/browser/settings', 'settings.blockPrivate'),
  write: put('/api/browser/settings', (v) => ({ blockPrivate: v })),
});
row('browser', 'Screenshots for models that see images', 'switch', { read: rd('/api/browser/settings', 'settings.screenshots'), write: put('/api/browser/settings', (v) => ({ screenshots: v })) });
row('browser', 'Sites', 'list', {
  items: 'allow:<site> (only these) and block:<site> (never these), such as allow:example.com',
  check: (v) => {
    const bad = (v as string[]).find((i) => !/^(allow|block):\S+$/.test(i));
    return bad ? `“${bad}” should start with allow: or block:` : null;
  },
  read: { endpoint: '/api/browser/settings', pick: (d) => [...(d.settings?.allow ?? []).map((s: string) => `allow:${s}`), ...(d.settings?.block ?? []).map((s: string) => `block:${s}`)] },
  write: put('/api/browser/settings', (v) => ({
    allow: (v as string[]).filter((i) => i.startsWith('allow:')).map((i) => i.slice(6)),
    block: (v as string[]).filter((i) => i.startsWith('block:')).map((i) => i.slice(6)),
  })),
  note: 'Replaces both lists; none clears them.',
});
row('browser', 'Profiles', 'list', {
  items: 'profile names',
  check: (v) => ((v as string[]).find((n) => n.length > 40) ? 'A profile’s name has 1 to 40 characters' : null),
  read: { endpoint: '/api/browser/settings', pick: (d) => (d.profiles ?? []).map((p: any) => p.name) },
  write: {
    cur: true,
    ask: (v, cur) => {
      const gone = (cur?.profiles ?? []).filter((p: any) => !(v as string[]).includes(p.name)).map((p: any) => p.name);
      return gone.length ? `Delete the browser profile${gone.length === 1 ? '' : 's'} ${gone.map((n: string) => `“${n}”`).join(', ')} with ${gone.length === 1 ? 'its' : 'their'} sign-ins?` : null;
    },
    apply: async (api, v, cur) => {
      const want = v as string[];
      const have = (cur?.profiles ?? []) as { id: string; name: string }[];
      for (const p of have) if (!want.includes(p.name)) await api('DELETE', `/api/browser/profiles/${encodeURIComponent(p.id)}`);
      for (const name of want) if (!have.some((p) => p.name === name)) await api('POST', '/api/browser/profiles', { name });
    },
  },
  note: 'Replaces the list: a profile left out is deleted with its sign-ins. Signing in to sites in a profile is done on the page.',
});
row('computer', 'Computer use', 'switch', {
  read: rd('/api/computer', 'enabled'),
  write: put('/api/computer/settings', (v) => ({ enabled: v })),
  note: 'Only in the desktop apps; each session still asks you first.',
});
row('computer', 'Accessibility', 'action', {
  states: ['allowed', 'not allowed'],
  read: { endpoint: '/api/computer', pick: (d) => d.permissions?.accessibility },
  act: {
    question: 'Show macOS’s question and its System Settings for Accessibility now?',
    run: async (api) => {
      const r = await api<any>('POST', '/api/computer/permissions/accessibility');
      return [r.permissions?.accessibility ? 'Allowed.' : 'Not allowed yet: turn on Hydor in System Settings → Privacy & Security → Accessibility.'];
    },
  },
  note: 'macOS’s permission, in the Mac app only.',
});
row('computer', 'Screen Recording', 'action', {
  read: { endpoint: '/api/computer', pick: (d) => d.permissions?.screen },
  act: {
    question: 'Show macOS’s question and its System Settings for Screen Recording now?',
    run: async (api) => {
      const r = await api<any>('POST', '/api/computer/permissions/screen');
      return [r.permissions?.screen === 'granted' ? 'Allowed.' : 'Not allowed yet: turn on Hydor in System Settings → Privacy & Security → Screen Recording.'];
    },
  },
  note: 'macOS’s permission, in the Mac app only.',
});

// ---- Capabilities › Memory, Child sessions ------------------------------------------------------------------------------
row('memory', 'Memory', 'switch', { read: rd('/api/memory', 'enabled'), write: put('/api/memory', (v) => ({ enabled: v })) });
row('memory', 'Search by meaning', 'switch', {
  read: rd('/api/memory', 'meaning.on'),
  write: put('/api/memory', (v) => ({ meaning: v })),
  note: 'Turning it on downloads a 340 MB model the first time.',
});
row('memory', 'Notes each agent starts with', 'number', { range: { min: 1, max: 50 }, read: rd('/api/memory', 'topK'), write: put('/api/memory', (v) => ({ topK: v })) });
row('memory', 'Tidy up automatically', 'switch', { read: rd('/api/memory', 'tidyOn'), write: put('/api/memory', (v) => ({ tidy: v })) });
row('memory', 'Learn from conversations', 'switch', { read: rd('/api/memory', 'learnOn'), write: put('/api/memory', (v) => ({ learn: v })) });
row('memory', 'Tidy up now', 'action', {
  act: {
    run: async (api) => {
      await api('POST', '/api/memory/tidy');
      return ['Tidying memory up in the background.'];
    },
  },
});
row('memory', 'Your profile', 'text', {
  multiline: true,
  read: { endpoint: '/api/memory/profile', pick: (d) => d.profile?.text ?? '' },
  write: put('/api/memory/profile', (v) => ({ text: v })),
  note: 'An empty text clears it (it stays among the deleted notes for 30 days).',
});
row('memory', 'Profile length', 'number', {
  range: { min: 50, max: 5000 },
  read: rd('/api/memory', 'profileWords'),
  write: put('/api/memory', (v) => ({ profileWords: v })),
  note: 'The most words the profile may have; a longer one is shortened by the helper model.',
});
row('memory', 'Notes', 'command', { command: 'hydor memory list' });
row('memory', 'Add a note', 'command', { command: 'hydor memory add' });
row('memory', 'Deleted notes', 'page', { note: 'Restoring a deleted note is done on the page.' });
row('memory', 'Bring in…', 'page', { note: 'Reading other assistants’ memory and picking notes to keep is done on the page.' });
row('memory', 'Export', 'action', {
  act: {
    run: async (api) => {
      const t = await api<unknown>('GET', '/api/memory/export?format=md');
      return [typeof t === 'string' ? t : JSON.stringify(t, null, 2)];
    },
  },
  note: 'Prints every note as Markdown.',
});
row('memory', 'Clear all…', 'action', {
  act: {
    question: 'Delete every memory note and its history for good (this cannot be undone)?',
    run: async (api) => {
      const r = await api<{ cleared: number }>('DELETE', '/api/memory', { confirm: 'all' });
      return [`Deleted ${r.cleared} note${r.cleared === 1 ? '' : 's'}.`];
    },
  },
});
row('children', 'Working at once, per session', 'number', {
  range: { min: 1, max: 12 },
  read: rd('/api/children/settings', 'maxRunning'),
  write: put('/api/children/settings', (v) => ({ maxRunning: v })),
});
row('children', 'Swarm size', 'number', { range: { min: 1, max: 16 }, read: rd('/api/children/settings', 'swarmSize'), write: put('/api/children/settings', (v) => ({ swarmSize: v })) });

// ---- Capabilities › Images, video and audio, Voice, Your agents, Custom ---------------------------------------------------
const AUTO: Choice = { value: 'auto', label: 'The app’s choice' };
/** A model picked by its OpenRouter id, or the app's choice (sent as an empty id). */
const modelRow = (label: string, endpoint: string, field: string, models: string, key: string) =>
  row('images', label, 'choice', {
    free: true,
    choices: [AUTO],
    load: async (api) => [AUTO, ...((await api<{ models: any[] }>('GET', models)).models ?? []).map((m) => ({ value: m.id, label: m.label ?? m.id }))],
    read: { endpoint, pick: (d) => d[field] || 'auto' },
    write: put(endpoint, (v) => ({ [key]: v === 'auto' ? '' : v })),
    note: 'An OpenRouter model id (Settings → Models holds your key); auto is the app’s choice.',
  });
row('images', 'Making images', 'switch', { read: rd('/api/images/settings', 'enabled'), write: put('/api/images/settings', (v) => ({ enabled: v })) });
modelRow('For most pictures (Best)', '/api/images/settings', 'model', '/api/images/models?sort=picks', 'model');
modelRow('For simple pictures (Quick)', '/api/images/settings', 'quick', '/api/images/models?sort=picks', 'quick');
row('images', 'Picture tools on this computer', 'action', {
  states: ['set up', 'not set up'],
  read: rd('/api/images/local', 'ready'),
  act: {
    question: 'Set up the picture tools on this computer (a download of about 145 MB, more with an NVIDIA card; each model downloads when first used)?',
    run: async (api) => {
      await api('POST', '/api/images/local/setup');
      return ['Setting them up in the background; hydor settings get images.picture-tools-on-this-computer says when they are ready.'];
    },
  },
  note: 'Removing them is done on the page.',
});
row('images', 'Making videos', 'switch', { read: rd('/api/videos/settings', 'enabled'), write: put('/api/videos/settings', (v) => ({ enabled: v })) });
modelRow('Video model', '/api/videos/settings', 'model', '/api/videos/models?sort=picks', 'model');
row('images', 'Use the graphics card for videos', 'choice', {
  choices: [
    { value: 'auto', label: 'The graphics card when there is one' },
    { value: 'off', label: 'The processor' },
  ],
  read: rd('/api/videos/gpu', 'mode'),
  write: put('/api/videos/gpu', (v) => ({ mode: v })),
});
row('images', 'Making audio', 'switch', { read: rd('/api/audio/settings', 'enabled'), write: put('/api/audio/settings', (v) => ({ enabled: v })) });
modelRow('Music model', '/api/audio/settings', 'music', '/api/audio/models?kind=music&sort=picks', 'music');
modelRow('Voice and sound model', '/api/audio/settings', 'speech', '/api/audio/models?kind=speech&sort=picks', 'speech');
row('images', 'Captions in the Library', 'choice', {
  choices: ['auto', 'openrouter', 'claude', 'ollama', 'vllm', 'endpoint'].map((v) => ({
    value: v,
    label: { auto: 'The app’s choice', openrouter: 'OpenRouter', claude: 'Claude', ollama: 'Ollama', vllm: 'vLLM', endpoint: 'An endpoint' }[v]!,
  })),
  read: rd('/api/media/settings', 'captions.provider'),
  write: put('/api/media/settings', (v) => ({ captions: { provider: v } })),
  note: 'Where the model that writes the captions runs; its model is picked on the page (the first one it offers is used until then).',
});
row('voice', 'Dictation', 'device', { device: { key: 'dictation' }, note: 'Dictation uses a browser’s microphone.' });
row('voice', 'Language you speak', 'device', { device: { key: 'speech-language' }, note: 'The language dictation listens for.' });
row('voice', 'Speech recognition on the server', 'choice', {
  choices: [
    { value: 'off', label: 'Off' },
    { value: 'local', label: 'On this machine' },
    { value: 'endpoint', label: 'A service' },
  ],
  read: rd('/api/voice', 'engine'),
  write: put('/api/voice', (v) => ({ engine: v })),
  note: 'On this machine downloads whisper.cpp and a model; a service needs its address first, which is set on the page.',
});
row('voice', 'Read aloud', 'device', { device: { key: 'read-aloud' }, note: 'Each browser keeps its own voice and speed.' });
row('assistants', 'Your agents', 'command', { command: 'hydor agents' });
row('assistants', 'Clean up after a task', 'switch', { read: rd('/api/assistants', 'cleanUp'), write: put('/api/assistants/settings', (v) => ({ cleanUp: v })) });
row('assistants', 'Task folders', 'text', {
  read: rd('/api/assistants', 'taskRoot'),
  write: put('/api/assistants/settings', (v) => ({ taskRoot: v })),
  note: 'A full path or one starting with ~/; an empty value goes back to the default.',
});
row('custom', 'Auto mode', 'page', { note: 'Nothing to set here: Auto mode is one of Custom’s modes, picked in a session (hydor chat --agent custom --mode auto).' });
row('custom', 'Sandbox for commands', 'switch', {
  read: rd('/api/custom/settings', 'sandbox'),
  write: put('/api/custom/settings', (v) => ({ sandbox: v })),
  note: 'It needs bubblewrap on this computer.',
});
row('custom', 'Rounds before a goal pauses', 'number', { range: { min: 1, max: 500 }, read: rd('/api/custom/settings', 'goalRounds'), write: put('/api/custom/settings', (v) => ({ goalRounds: v })) });

/** Every option, in the order of the catalog (the order the page shows them). */
export const ROWS: Row[] = (() => {
  const key = (s: string, l: string) => `${s}\n${l}`;
  const by = new Map(rows.map((r) => [key(r.section, r.label), r]));
  const ordered = OPTIONS.map(([s, l]) => by.get(key(s, l))).filter((r): r is Row => !!r);
  // A row that names no catalog option stays at the end, so the test can say so.
  return [...ordered, ...rows.filter((r) => !ordered.includes(r))];
})();

/** The sections as the page groups them (App, Agents, Capabilities). */
export const SECTION_LIST = SECTIONS.map(([id, label, group, sub]) => ({ id, label, group, sub }));
export const GROUPS = ['App', 'Agents', 'Capabilities'] as const;

export const rowsOf = (section: string) => ROWS.filter((r) => r.section === section);

// ---- finding an option by what is typed ---------------------------------------------------------------------------------
const list5 = (xs: string[]) => xs.slice(0, 5).join(', ') + (xs.length > 5 ? ', …' : '');

/** A section by its id, its name, or a unique start of either (any case). */
export function findSection(text: string): (typeof SECTION_LIST)[number] | null {
  const t = slug(text);
  if (!t) return null;
  const exact = SECTION_LIST.filter((s) => s.id === t || slug(s.label) === t);
  if (exact.length === 1) return exact[0];
  const some = SECTION_LIST.filter((s) => s.id.startsWith(t) || slug(s.label).startsWith(t));
  return some.length === 1 ? some[0] : null;
}

/**
 * An option by what is typed: its id, the section and a unique start of the words (`general.resume`), or the words alone
 * when only one option starts with them. Several matches or none is a usage error that says what to type.
 */
export function findRow(text: string): Row {
  const raw = text.trim();
  const direct = ROWS.find((r) => r.id === raw.toLowerCase());
  if (direct) return direct;
  const dot = raw.indexOf('.');
  let pool = ROWS;
  let words = raw;
  if (dot > 0) {
    const sec = findSection(raw.slice(0, dot));
    if (!sec) throw new UsageError(`No section called “${raw.slice(0, dot)}”: hydor settings list shows them.`);
    pool = rowsOf(sec.id);
    words = raw.slice(dot + 1);
  }
  const t = slug(words);
  if (!t) throw new UsageError(`Name an option, such as general.resume-after-usage-limits (hydor settings list shows them).`);
  const slugOf = (r: Row) => r.id.slice(r.section.length + 1);
  const exact = pool.filter((r) => slugOf(r) === t);
  const found = exact.length ? exact : pool.filter((r) => slugOf(r).startsWith(t));
  if (found.length === 1) return found[0];
  if (found.length > 1) throw new UsageError(`“${raw}” matches ${found.length} options: ${list5(found.map((r) => r.id))}. Type more of its name.`);
  const inside = pool.filter((r) => slugOf(r).includes(t));
  if (inside.length === 1) return inside[0];
  throw new UsageError(`No option called “${raw}”${inside.length ? `: did you mean ${list5(inside.map((r) => r.id))}?` : ' (hydor settings list shows them).'}`);
}

// ---- reading ----------------------------------------------------------------------------------------------------------------
export interface Read {
  value?: Value;
  error?: string;
}

const readSync = (r: Row): Value | undefined => (r.device?.terminal ? (r.device.key === 'enter' ? terminalPrefs().enter : terminalPrefs().suggestions) : undefined);

/** What one option holds now (undefined: not known here, such as a device's own). Endpoints it shares with other options are read once through `cache`. */
export async function readRow(ctl: Ctl, r: Row, cache: Map<string, Promise<any>> = new Map()): Promise<Value | undefined> {
  if (r.device) return readSync(r);
  if (!r.read) return undefined;
  const ends = Array.isArray(r.read.endpoint) ? r.read.endpoint : [r.read.endpoint];
  const all = await Promise.all(
    ends.map((e) => {
      let p = cache.get(e);
      if (!p) cache.set(e, (p = ctl.api('GET', e).catch((x) => ({ __error: (x as Error).message }))));
      return p;
    }),
  );
  if (all.length === 1 && all[0]?.__error) throw new Error(all[0].__error);
  const data = all.map((a) => (a?.__error ? undefined : a));
  const v = r.read.pick ? r.read.pick(data[0], data) : get(data[0], r.read.field ?? '');
  return v === undefined ? undefined : (v as Value);
}

/** Every option's value, with the endpoints shared between options read once, a few at a time. A failing read is that option's error, not the list's. */
export async function readAll(ctl: Ctl, which: Row[] = ROWS): Promise<Map<string, Read>> {
  const cache = new Map<string, Promise<any>>();
  const out = new Map<string, Read>();
  let next = 0;
  const worker = async () => {
    while (next < which.length) {
      const r = which[next++];
      try {
        out.set(r.id, { value: await readRow(ctl, r, cache) });
      } catch (e) {
        out.set(r.id, { error: (e as Error).message });
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

/** An option's value as it reads on a screen: a choice by its label, a secret as set or not, a list with commas. Never a secret's value. */
export function showValue(r: Row, v: Value | undefined): string {
  if (r.kind === 'secret') return v === undefined || v === null ? 'not set' : v ? 'set' : 'not set';
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return r.states ? r.states[v ? 0 : 1] : v ? 'on' : 'off';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none';
  if (r.kind === 'choice' || r.device?.key === 'enter') return r.choices?.find((c) => c.value === v)?.label ?? String(v);
  if (r.kind === 'text' && !v) return 'none';
  return String(v);
}

/** The value as `--json` gives it (a secret is only set or not). */
export const jsonValue = (r: Row, v: Value | undefined): Value | undefined => (r.kind === 'secret' ? (v === undefined || v === null ? false : !!v) : v);

// ---- changing ---------------------------------------------------------------------------------------------------------------
/** What the terminal says when it cannot change an option itself: where to do it instead. */
export function explain(r: Row, base?: string): string[] {
  const at = `${base ?? ''}${settingsAddress(r)}`;
  if (r.kind === 'page') return [`${r.label} is only on the page${r.note ? `: ${r.note}` : '.'}`, `Open ${at}`];
  if (r.kind === 'command') return [`${r.label} has a command of its own: ${r.command}${r.note ? `. ${r.note}` : ''}`];
  if (r.device && !r.device.terminal) return [`${r.label} is kept in each browser, not on the server${r.note ? `. ${r.note}` : ''}`, `Open the app on that device: ${at}`];
  return [];
}

const ON = /^(on|true|yes|y|1|enable|enabled)$/i;
const OFF = /^(off|false|no|n|0|disable|disabled)$/i;

/** The values a choice takes: the listed ones, or what the server offers for it. */
export async function choicesOf(ctl: Ctl, r: Row): Promise<Choice[]> {
  if (r.load) return r.load(ctl.api).catch(() => r.choices ?? []);
  return r.choices ?? [];
}

/** What was typed, as the option's value; a usage error says what it takes. A choice that the server lists is checked against that list. */
export async function parseValue(ctl: Ctl, r: Row, text: string): Promise<Value> {
  const bad = (m: string) => new UsageError(`${r.id}: ${m}`);
  let v: Value;
  // A device setting of the terminal's own is a choice (Enter) or a switch (suggestions).
  const kind = r.kind === 'device' ? (r.device?.key === 'suggestions' ? 'switch' : 'choice') : r.kind;
  switch (kind) {
    case 'switch':
      if (ON.test(text.trim())) v = true;
      else if (OFF.test(text.trim())) v = false;
      else throw bad('takes on or off');
      break;
    case 'number': {
      const n = Number(text);
      if (!text.trim() || !Number.isInteger(n) || !r.range || n < r.range.min || n > r.range.max) throw bad(`takes a whole number from ${r.range?.min} to ${r.range?.max}`);
      v = n;
      break;
    }
    case 'choice': {
      const t = text.trim();
      const cs = await choicesOf(ctl, r);
      const low = t.toLowerCase();
      const exact = cs.filter((c) => c.value.toLowerCase() === low || c.label.toLowerCase() === low);
      const some = exact.length ? exact : cs.filter((c) => c.value.toLowerCase().startsWith(low) || c.label.toLowerCase().startsWith(low));
      if (some.length === 1) v = some[0].value;
      else if (r.free && t) v = t;
      else throw bad(some.length > 1 ? `“${t}” matches ${list5(some.map((c) => c.value))}: type more` : `takes one of ${list5(cs.map((c) => c.value)) || 'its values'}`);
      break;
    }
    case 'list':
      v = /^(none|-)?$/i.test(text.trim())
        ? []
        : text
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
      break;
    case 'text':
      v = r.multiline ? text : text.trim();
      break;
    case 'secret':
      v = text.trim();
      break;
    default:
      throw bad('cannot be set from the terminal');
  }
  const why = r.check?.(v);
  if (why) throw bad(why);
  return v;
}

export interface Done {
  changed: boolean;
  /** Lines to say: what was done, or where to do it. */
  say: string[];
  value?: Value;
}

/**
 * Changes an option to what was typed. Options only a page or a device can change say where instead (`changed` false).
 * `confirm` is asked with the question a change needs (a list that deletes profiles) and may stop it.
 */
export async function setRow(ctl: Ctl, r: Row, text: string, o: { confirm?: (q: string) => Promise<boolean>; base?: string } = {}): Promise<Done> {
  if (r.device?.terminal) {
    const v = await parseValue(ctl, r, text);
    setTerminalPref(r.device.key as 'enter' | 'suggestions', v as string | boolean);
    return { changed: true, say: [`${r.label}: ${showValue(r, v)} (kept for the terminal chat on this computer)`], value: v };
  }
  const why = explain(r, o.base);
  if (why.length) return { changed: false, say: why };
  if (r.kind === 'action' || !r.write) return { changed: false, say: [`${r.label} is ${r.kind === 'action' ? 'a button: hydor settings run ' + r.id : 'read only'}.`] };
  const v = await parseValue(ctl, r, text);
  const cur = r.write.cur && r.read ? await readCurrent(ctl, r.read) : undefined;
  const q = r.write.ask?.(v, cur);
  if (q && !(await o.confirm?.(q))) return { changed: false, say: ['Left as it was.'] };
  if (r.write.apply) await r.write.apply(ctl.api, v, cur);
  else await ctl.api(r.write.method ?? 'PUT', r.write.endpoint!, r.write.body ? r.write.body(v, cur) : undefined);
  // A secret is sent and forgotten: neither the words said nor the value given back hold it.
  return { changed: true, say: [`${r.label}: ${r.kind === 'secret' ? (v ? 'set' : 'removed') : showValue(r, v)}`], value: r.kind === 'secret' ? !!v : v };
}

/** The answers of a row's read endpoints, for a change that needs the state it replaces (one answer, or a list of them for several endpoints). */
async function readCurrent(ctl: Ctl, rd: Reader): Promise<any> {
  if (Array.isArray(rd.endpoint)) return Promise.all(rd.endpoint.map((e) => ctl.api('GET', e).catch(() => null)));
  return ctl.api('GET', rd.endpoint);
}

/** Runs a button (Send a test, Check now): `question` is what to ask first, when it asks one. */
export async function runAction(ctl: Ctl, r: Row, arg?: string): Promise<string[]> {
  if (r.kind !== 'action' || !r.act) throw new UsageError(`${r.id} is not a button${r.kind === 'switch' || r.write ? `: hydor settings set ${r.id} <value> changes it` : ''}.`);
  return r.act.run(ctl.api, arg);
}

// ---- the terminal's own settings (kept in <data folder>/terminal.json) ---------------------------------------------------
export interface TerminalPrefs {
  /** What Enter does while an agent works: join the running turn, or wait for it to end. */
  enter: 'join' | 'queue';
  /** The chat's grey suggestions from earlier messages. */
  suggestions: boolean;
}
const terminalFile = () => path.join(config.dataDir, 'terminal.json');

/** The terminal chat's own settings: Enter joins the turn and suggestions are on until changed. */
export function terminalPrefs(): TerminalPrefs {
  let raw: any = {};
  try {
    raw = JSON.parse(fs.readFileSync(terminalFile(), 'utf8'));
  } catch {}
  return { enter: raw?.enter === 'queue' ? 'queue' : 'join', suggestions: raw?.suggestions !== false };
}

/** Keeps one of them. */
export function setTerminalPref(key: 'enter' | 'suggestions', value: string | boolean) {
  const cur = terminalPrefs();
  const next: TerminalPrefs = { ...cur, ...(key === 'enter' ? { enter: value === 'queue' ? 'queue' : 'join' } : { suggestions: !!value }) } as TerminalPrefs;
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${terminalFile()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, terminalFile());
}
