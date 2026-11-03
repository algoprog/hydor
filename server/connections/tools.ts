// The tools every session's agent has for connections and keys: request_secret (a card where the person
// enters a key or a whole sign-in, straight into the vault), http_request (an API call signed with keys
// the agent never sees), run_with_secrets (a command with keys in its environment, its output masked)
// and list_connections (what is connected and saved: names, never values).
import { cleanDomains, fieldKey, SECRET_LIKE, SECRET_NAME, secretName, type SecretField, type SecretView } from '../../shared/connections.ts';
import type { RunCtx, RunTool } from '../features/types.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { connections, isRemote, onFor, toolOn } from './apps.ts';
import { httpCall, RefusedRequest } from './http.ts';
import { listNames, runWithSecrets } from './run.ts';
import { addRequest, latestRequest, listSecrets, maskUsed, readSecret, redact, secretView, touchSecret } from './vault.ts';

/** Set by index.ts: tells the pages showing a session that a request changed. */
export let notifyRequest: (key: string) => void = () => {};
export const onRequestChange = (fn: (key: string) => void) => {
  notifyRequest = fn;
};

/** How the agent uses saved keys, as far as the user allowed them (hosts, commands). */
export function howToUse(names: string[], hosts: boolean, commands: boolean): string {
  const n = names.length === 1 ? names[0] : 'NAME';
  const ways: string[] = [];
  if (hosts) ways.push(`in http_request (auth: "${n}", or {{${n}}} in the address, headers or body)`, `in the browser (a browser_act type step with "secret": "${n}")`);
  if (commands) ways.push(`in commands through run_with_secrets (as $${n})`);
  const it = names.length > 1 ? 'them' : 'it';
  if (!ways.length) return `${names.length > 1 ? 'They have' : 'It has'} no hosts to go to and ${names.length > 1 ? 'are' : 'is'} not allowed in commands, so the user has to allow that first (Apps → Connected apps → Keys).`;
  return `You never see ${names.length > 1 ? 'their values' : 'its value'}: use ${it} by name, ${ways.length > 1 ? `${ways.slice(0, -1).join(', ')} or ${ways[ways.length - 1]}` : ways[0]}.`;
}

const where = (s: Pick<SecretView, 'domains' | 'commands'>) => [s.domains.length ? `for ${s.domains.join(', ')}` : '', s.commands ? 'for commands on this computer' : ''].filter(Boolean).join(' and ');

const words = (id: string) => {
  const s = id.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : id;
};
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, n) : undefined);
const TYPES = ['password', 'text', 'email', 'url', 'number'] as const;

/** A sign-in's fields as the agent wrote them (a list, or an object by name), each with the key it is saved as. */
function signInFields(raw: unknown, name: string): SecretField[] {
  if (raw === undefined || raw === null) return [];
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'object'
      ? Object.entries(raw as Record<string, unknown>).map(([k, v]) => (v && typeof v === 'object' ? { name: k, ...(v as object) } : { name: k, label: v }))
      : [];
  if (!list.length) throw new Error('fields: a list like [{ "name": "username", "label": "Username" }, { "name": "password", "label": "Password" }]');
  if (list.length > 10) throw new Error('fields: at most 10');
  const out: SecretField[] = [];
  for (const f of list) {
    const o = (typeof f === 'string' ? { name: f } : f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const own = secretName(String(o.name ?? o.key ?? o.id ?? ''));
    if (!own) throw new Error('fields: each needs a name, like "password"');
    const key = fieldKey(name, own);
    if (!SECRET_NAME.test(key)) throw new Error(`fields: ${String(o.name)} does not make a key’s name (it would be ${key})`);
    if (out.some((x) => x.key === key)) throw new Error(`fields: ${key} is there twice`);
    const secret = o.secret !== false;
    const t = String(o.type ?? '').toLowerCase();
    const type: SecretField['type'] = (TYPES as readonly string[]).includes(t)
      ? (t as SecretField['type'])
      : secret && SECRET_LIKE.test(own)
        ? 'password'
        : /EMAIL/.test(own)
          ? 'email'
          : /URL/.test(own)
            ? 'url'
            : /PORT/.test(own)
              ? 'number'
              : 'text';
    const help = clip(o.help ?? o.description, 200);
    out.push({ key, label: clip(o.label ?? o.title, 60) ?? words(own), secret, type, ...(help ? { help } : {}), ...(o.optional === true ? { optional: true } : {}) });
  }
  if (!out.some((f) => f.secret)) throw new Error('fields: none of them is secret. For details that are not secret, use ask_form.');
  return out;
}

const REQUEST_SECRET: RunTool = {
  name: 'request_secret',
  description: [
    'Ask the user for a password, API key, token or a whole sign-in without it passing through the conversation.',
    'A card appears in the chat where they fill it in; it goes straight into the vault, and you never see it.',
    'For one key, give name. For a sign-in or anything in several parts (an email and a password; a database’s host, user and password), give fields too: each secret one becomes a key named after name (VOLTARO and password: VOLTARO_PASSWORD), and those you mark secret: false come back to you as typed.',
    'It returns at once: carry on with what does not need it; a message tells you when it is saved (or declined).',
    'Then use the keys by name: http_request (auth: NAME, or {{NAME}} in the address, headers or body), browser_act (a type step with "secret": NAME) and, with commands: true, run_with_secrets ($NAME).',
    'Never ask the user to type a secret into the chat.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'What to call it, in capitals: OPENWEATHER_API_KEY, GITHUB_TOKEN. With fields: what their keys start with, like VOLTARO.' },
      why: { type: 'string', description: 'One or two sentences for the user: what it is for, and where they can get it.' },
      domains: { type: 'array', items: { type: 'string' }, description: 'The hosts it may be sent to and typed on, like api.openweathermap.org (subdomains included). The user can change them.' },
      fields: {
        type: 'array',
        description: 'For a sign-in: what the card asks for, in order (at most 10).',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short: username, password, host.' },
            label: { type: 'string', description: 'What the card shows: "Email or username".' },
            secret: { type: 'boolean', description: 'false for a detail that is not secret (a server’s address, a port, a database’s name): you get its value. Secret by default.' },
            type: { type: 'string', enum: [...TYPES], description: 'password hides it as it is typed (the default for names like PASSWORD, TOKEN, KEY, SECRET or PIN); email, url and number bring the right keyboard.' },
            help: { type: 'string', description: 'A short hint under the field.' },
            optional: { type: 'boolean' },
          },
          required: ['name'],
        },
      },
      commands: { type: 'boolean', description: 'It is for commands on this computer (run_with_secrets): the card asks the user to allow that. Also for a saved key that is not allowed in commands yet.' },
      replace: { type: 'boolean', description: 'Ask again even though it is saved (it stopped working).' },
    },
    required: ['name', 'why'],
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const name = secretName(String(a.name ?? ''));
    if (!SECRET_NAME.test(name)) throw new Error('name: capitals, digits and underscores, starting with a letter, like WEATHER_API_KEY');
    const why = String(a.why ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
    if (!why) throw new Error('why: say what it is for, so the user knows what to enter');
    const commands = a.commands === true;
    const fields = signInFields(a.fields, name);
    const open = latestRequest(db, ctx.key, name);
    const waiting = `A card asking for ${name} is already in the conversation. You will get a message when the user saves it.`;

    if (fields.length) {
      const secrets = fields.filter((f) => f.secret);
      const saved = secrets.map((f) => secretView(db, f.key));
      const all = saved.every(Boolean);
      const details = fields.filter((f) => !f.secret);
      if (all && !details.length && !a.replace && (!commands || saved.every((s) => s!.commands)))
        return `${listNames(secrets.map((f) => f.key))} are already in the vault (${where(saved[0]!) || 'not allowed anywhere yet'}). ${howToUse(secrets.map((f) => f.key), saved.some((s) => s!.domains.length), saved.every((s) => s!.commands))} If they stopped working, ask again with replace: true.`;
      if (open?.state === 'pending') return waiting;
      // Keys that are there keep their hosts; the agent may only suggest hosts for new ones.
      const have = saved.find(Boolean);
      addRequest(db, { key: ctx.key, name, why, domains: have ? have.domains : cleanDomains(a.domains ?? []), fields, commands });
      notifyRequest(ctx.key);
      return [
        `A card in the conversation asks the user for ${listNames(secrets.map((f) => `${f.key} (${f.label})`))}${details.length ? `, and for ${listNames(details.map((f) => f.label))}, which you will get as typed` : ''}.`,
        'You will get a message when it is saved (or if they decline); meanwhile carry on with anything that does not need it.',
        `You never see the secret values: use them by name (http_request, browser_act's "secret"${commands ? ', run_with_secrets' : ''}).`,
      ].join(' ');
    }

    const have = secretView(db, name);
    if (have && !a.replace && (!commands || have.commands))
      return `${name} is already in the vault${where(have) ? ` (${where(have)})` : ''}. ${howToUse([name], have.domains.length > 0, !!have.commands)} If it stopped working, ask again with replace: true.`;
    if (open?.state === 'pending') return waiting;
    // A key that is there keeps its hosts; the agent may only suggest hosts for a new one.
    addRequest(db, { key: ctx.key, name, why, domains: have ? have.domains : cleanDomains(a.domains ?? []), commands });
    notifyRequest(ctx.key);
    if (have && !a.replace) return `A card in the conversation asks the user to let commands on this computer use ${name}. You will get a message when they do (or if they decline).`;
    return `A card in the conversation asks the user for ${name}. You will get a message when it is saved (or if they decline); meanwhile carry on with anything that does not need it. You never see the value: use it by name (http_request with auth: "${name}"${commands ? `, or $${name} in run_with_secrets` : ''}).`;
  },
};

/** {{NAME}} in a request: a key from the vault, put in by the server (capitals, as keys are named). */
const PLACE = /\{\{\s*([A-Z][A-Z0-9_]{1,63})\s*\}\}/g;

const HTTP_REQUEST: RunTool = {
  name: 'http_request',
  description: [
    'Make an HTTP request to a public address (an API), with keys from the vault you never see.',
    'auth: a key’s NAME signs the request (in Authorization: Bearer, or as the user set it up; auth_header, auth_prefix or auth_query change that for one call).',
    'Or write {{NAME}} where a key goes, in the address, a header or the body (a sign-in’s password in a JSON body: "password": "{{VOLTARO_PASSWORD}}"), and basic_auth takes a user name and password the same way.',
    'The server puts the keys in, only for the hosts each is allowed for, and masks them in the answer.',
    'list_connections shows the saved keys; request_secret asks the user for a missing one.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], description: 'GET by default.' },
      url: { type: 'string', description: 'The full https address ({{NAME}} where a key goes).' },
      headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Request headers (keys only as {{NAME}}).' },
      body: { description: 'The request body: a string, or JSON (sent as application/json); keys only as {{NAME}}.' },
      auth: { type: 'string', description: 'The NAME of a key in the vault to sign the request with.' },
      auth_header: { type: 'string', description: 'The header to put the key in, like X-Api-Key.' },
      auth_prefix: { type: 'string', description: 'What goes before the key in that header, like "Bearer " or "token ".' },
      auth_query: { type: 'string', description: 'Send the key as this query parameter instead, like api_key.' },
      basic_auth: {
        type: 'object',
        properties: { username: { type: 'string' }, password: { type: 'string' } },
        description: 'HTTP Basic sign-in: { "username": "{{VOLTARO_EMAIL}}", "password": "{{VOLTARO_PASSWORD}}" } (plain text where it is not a secret).',
      },
      max_chars: { type: 'number', description: 'Most characters of the answer to return (default 40000, at most 200000).' },
    },
    required: ['url'],
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const used: { name: string; value: string }[] = [];
    let auth;
    if (a.auth) {
      const name = secretName(String(a.auth));
      const s = readSecret(db, name);
      if (!s) return { text: `There is no key named ${name} in the vault. Ask the user for it with request_secret.`, isError: true };
      used.push({ name, value: s.value });
      const header = a.auth_header ? String(a.auth_header) : a.auth_query ? undefined : s.view.header;
      auth = {
        name,
        value: s.value,
        domains: s.view.domains,
        header,
        prefix: a.auth_prefix !== undefined ? String(a.auth_prefix) : a.auth_header ? '' : s.view.prefix,
        query: a.auth_query ? String(a.auth_query) : a.auth_header ? undefined : s.view.query,
      };
      if (auth.header && !/^[A-Za-z0-9-]{1,64}$/.test(auth.header)) return { text: 'auth_header: a header name', isError: true };
      if (auth.query && !/^[A-Za-z0-9_.-]{1,64}$/.test(auth.query)) return { text: 'auth_query: a parameter name', isError: true };
      if (auth.prefix && /[\r\n]/.test(auth.prefix)) return { text: 'auth_prefix: one line', isError: true };
    }
    const jsonBody = a.body !== undefined && a.body !== null && typeof a.body !== 'string';
    let body = a.body === undefined || a.body === null ? undefined : typeof a.body === 'string' ? a.body : JSON.stringify(a.body);
    const headers: Record<string, string> = {};
    if (a.headers && typeof a.headers === 'object') for (const [k, v] of Object.entries(a.headers)) headers[k] = String(v);
    const basic = a.basic_auth && typeof a.basic_auth === 'object' ? (a.basic_auth as Record<string, unknown>) : null;
    if (basic && (auth?.header ?? 'Authorization').toLowerCase() === 'authorization' && auth && !auth.query) return { text: 'auth and basic_auth would both set the Authorization header: use one of them.', isError: true };

    // The keys written into the request, each checked for its own hosts by httpCall.
    const url = String(a.url ?? '');
    const named = new Set<string>();
    const scan = (s: string | undefined) => {
      for (const m of String(s ?? '').matchAll(PLACE)) named.add(secretName(m[1]));
    };
    scan(url);
    Object.values(headers).forEach(scan);
    scan(body);
    if (basic) [basic.username, basic.password].forEach((v) => scan(v === undefined ? undefined : String(v)));
    const bound: { name: string; value: string; domains: string[] }[] = [];
    for (const n of named) {
      const s = readSecret(db, n);
      if (!s) return { text: `There is no key named ${n} in the vault. Ask the user for it with request_secret.`, isError: true };
      bound.push({ name: n, value: s.value, domains: s.view.domains });
      used.push({ name: n, value: s.value });
    }
    const fill = (s: string, enc: (v: string) => string = (v) => v) => s.replace(PLACE, (_m, n: string) => enc(bound.find((b) => b.name === secretName(n))!.value));
    const form = Object.entries(headers).some(([k, v]) => k.toLowerCase() === 'content-type' && /x-www-form-urlencoded/i.test(v));
    let target = url;
    if (bound.length) {
      target = fill(url, encodeURIComponent);
      for (const k of Object.keys(headers)) headers[k] = fill(headers[k]);
      if (body !== undefined) body = fill(body, jsonBody || /^\s*[[{]/.test(body) ? (v) => JSON.stringify(v).slice(1, -1) : form ? encodeURIComponent : undefined);
    }
    if (basic) {
      const pair = `${fill(String(basic.username ?? ''))}:${fill(String(basic.password ?? ''))}`;
      for (const k of Object.keys(headers)) if (k.toLowerCase() === 'authorization') delete headers[k];
      headers.Authorization = `Basic ${Buffer.from(pair).toString('base64')}`;
      used.push({ name: 'basic_auth', value: pair });
    }
    const clean = (t: string) => maskUsed(redact(t), used);
    try {
      const r = await httpCall(
        { method: String(a.method ?? 'GET'), url: target, headers, body, auth, bound: bound.map((b) => ({ name: b.name, domains: b.domains })) },
        { allowPrivate: testHooks.allowPrivate, lookup: testHooks.lookup },
      );
      for (const u of used) if (u.name !== 'basic_auth') touchSecret(db, u.name);
      const max = Math.min(Math.max(Number(a.max_chars) || 40_000, 1000), 200_000);
      const signed = [...new Set(used.filter((u) => u.name !== 'basic_auth').map((u) => u.name))];
      const lines = [`HTTP ${r.status} ${r.statusText}`.trim() + `  ·  ${new URL(r.url).host}  ·  ${r.bytes.toLocaleString('en')} bytes${signed.length ? `  ·  with ${signed.join(', ')}` : ''}`];
      for (const [k, v] of Object.entries(r.headers)) lines.push(`${k}: ${v}`);
      if (r.stopped) lines.push('', `(The redirect was not followed: ${r.stopped}.)`);
      lines.push('');
      if (r.binary) lines.push(`(A ${r.headers['content-type'] ?? 'binary'} answer, not shown.)`);
      else {
        // Masked before it is cut, so no value is left in half at the cut.
        const all = clean(r.body);
        const text = all.length > max ? `${all.slice(0, max)}\n… (cut at ${max.toLocaleString('en')} characters of ${all.length.toLocaleString('en')})` : all;
        lines.push(text || '(empty)');
        if (r.truncated) lines.push('(The answer was longer than 2 MB; the rest was not read.)');
      }
      return { text: clean(lines.join('\n')), isError: r.status >= 400 };
    } catch (e) {
      const m = e instanceof RefusedRequest ? e.message : `The request failed: ${(e as Error).message}`;
      return { text: clean(m), isError: true };
    }
  },
};

const RUN_WITH_SECRETS: RunTool = {
  name: 'run_with_secrets',
  annotations: { openWorldHint: true },
  description: [
    'Run a shell command on this computer with keys from the vault in its environment, each as $NAME: for programs that need a password or token (git, psql, curl, a script).',
    'Only keys the user allowed in commands (list_connections says which; request_secret with commands: true asks for that).',
    'It runs with bash in the session’s folder. The user is asked first unless the session has full access, and what it prints comes back with the values masked: you never see them.',
    'Use your own shell for commands that need no key.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command, with each key as "$NAME" (in double quotes).' },
      secrets: { type: 'array', items: { type: 'string' }, description: 'The keys it gets (by default, the ones the command names as $NAME).' },
      description: { type: 'string', description: 'What it does, for the user’s card: "Push the branch to GitHub".' },
      timeout: { type: 'number', description: 'Seconds before it is stopped (default 120, at most 600).' },
      max_chars: { type: 'number', description: 'Most characters of output to return (default 30000).' },
    },
    required: ['command'],
  },
  run: (a, ctx) => runWithSecrets(a, ctx),
};

const LIST_CONNECTIONS: RunTool = {
  name: 'list_connections',
  annotations: { readOnlyHint: true },
  description:
    'What is connected here: the connected accounts whose tools you have (by MCP server name) and those turned off for this session, and the keys in the vault with where each may be used (hosts, commands on this computer). Names only, never values.',
  inputSchema: { type: 'object', properties: {} },
  async run(_a, ctx) {
    const db = ctx.deps.db;
    const extra = sessionExtra(db, ctx.key);
    const apps = connections(db);
    const out: string[] = [];
    const on = apps.filter((c) => onFor(c, extra));
    const off = apps.filter((c) => !onFor(c, extra));
    if (on.length) {
      out.push('Connected accounts (their tools come from the MCP server of the same name):');
      for (const c of on) {
        const tools = c.tools?.filter((t) => toolOn(c, t.name)).map((t) => t.name);
        const state = c.status === 'signin' ? ' — needs the user to connect it again (Apps → Connected apps)' : c.status === 'error' ? ` — not working: ${c.error ?? 'unknown error'}` : '';
        out.push(`- ${c.id}: ${c.entry.name}, ${c.entry.description}${tools?.length ? ` Tools: ${tools.slice(0, 40).join(', ')}${tools.length > 40 ? '…' : ''}.` : ''}${isRemote(c.entry) ? '' : ' (runs on this computer)'}${state}`);
      }
    } else out.push('No accounts are connected for this session. The user connects them in Apps → Connected apps.');
    if (off.length) out.push('', `Off for this session (the user can turn them on in the session's menu, under Session settings → Connected accounts): ${off.map((c) => `${c.id} (${c.entry.name})`).join(', ')}.`);
    const keys = listSecrets(db);
    out.push('');
    if (keys.length) {
      out.push('Keys in the vault, used by name: http_request (auth: NAME, or {{NAME}}), browser_act (type with "secret": NAME) on their hosts, and run_with_secrets ($NAME) for those allowed in commands:');
      for (const k of keys) out.push(`- ${k.name}: ${where(k) || 'not usable yet (the user adds hosts, or allows commands, in Apps → Connected apps → Keys)'}${k.note ? `. ${k.note}` : ''}`);
    } else out.push('No keys are saved. If a task needs one, ask with request_secret.');
    return redact(out.join('\n'));
  },
};

/** For the script tests: reach a local fake server, and name hosts without DNS. */
export const testHooks: { allowPrivate?: boolean; lookup?: any } = {};

export const sessionTools = (_ctx: RunCtx): RunTool[] => [REQUEST_SECRET, HTTP_REQUEST, RUN_WITH_SECRETS, LIST_CONNECTIONS];
