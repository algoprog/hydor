// The tools every session's agent has for connections and keys: request_secret (a card where the person
// enters a key, straight into the vault), http_request (an API call signed with a key the agent never
// sees) and list_connections (what is connected and saved: names, never values).
import { cleanDomains, SECRET_NAME, secretName } from '../../shared/connections.ts';
import type { RunCtx, RunTool } from '../features/types.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { connections, isRemote, onFor, toolOn } from './apps.ts';
import { httpCall, RefusedRequest } from './http.ts';
import { addRequest, latestRequest, listSecrets, readSecret, redact, secretView, touchSecret } from './vault.ts';

/** Set by index.ts: tells the pages showing a session that a request changed. */
export let notifyRequest: (key: string) => void = () => {};
export const onRequestChange = (fn: (key: string) => void) => {
  notifyRequest = fn;
};

const REQUEST_SECRET: RunTool = {
  name: 'request_secret',
  description: [
    'Ask the user for a password, API key or token without it passing through the conversation.',
    'A card appears in the chat where they paste it; it goes straight into the vault, and you never see it.',
    'Returns at once: carry on with what does not need it; a message tells you when it is saved (or declined).',
    'Then call the API through http_request with auth: NAME. Never ask the user to type a secret into the chat.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'What to call it, in capitals: OPENWEATHER_API_KEY, GITHUB_TOKEN.' },
      why: { type: 'string', description: 'One or two sentences for the user: what it is for, and where they can get it.' },
      domains: { type: 'array', items: { type: 'string' }, description: 'The hosts it may be sent to, like api.openweathermap.org (subdomains included). The user can change them.' },
      replace: { type: 'boolean', description: 'Ask again even though a key by that name is saved (it stopped working).' },
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
    const have = secretView(db, name);
    if (have && !a.replace)
      return `${name} is already in the vault${have.domains.length ? ` (for ${have.domains.join(', ')})` : ''}. Use it with http_request, auth: "${name}". If it stopped working, ask again with replace: true.`;
    const open = latestRequest(db, ctx.key, name);
    if (open?.state === 'pending') return `A card asking for ${name} is already in the conversation. You will get a message when the user saves it.`;
    // A key that is there keeps its hosts; the agent may only suggest hosts for a new one.
    addRequest(db, { key: ctx.key, name, why, domains: have ? have.domains : cleanDomains(a.domains ?? []) });
    notifyRequest(ctx.key);
    return `A card in the conversation asks the user for ${name}. You will get a message when it is saved (or if they decline); meanwhile carry on with anything that does not need it. You never see the value: use it through http_request with auth: "${name}".`;
  },
};

const HTTP_REQUEST: RunTool = {
  name: 'http_request',
  description: [
    'Make an HTTP request to a public address (an API), optionally signed with a key from the vault: give its NAME as auth.',
    'The server adds the key itself, only for the hosts the key is allowed for, and masks it in the answer; you never see it.',
    'By default the key goes in Authorization: Bearer (or as the user set it up); auth_header, auth_prefix or auth_query change that for one call.',
    'list_connections shows the saved keys; request_secret asks the user for a missing one.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], description: 'GET by default.' },
      url: { type: 'string', description: 'The full https address.' },
      headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Request headers (no secrets: use auth).' },
      body: { description: 'The request body: a string, or JSON (sent as application/json).' },
      auth: { type: 'string', description: 'The NAME of a key in the vault to sign the request with.' },
      auth_header: { type: 'string', description: 'The header to put the key in, like X-Api-Key.' },
      auth_prefix: { type: 'string', description: 'What goes before the key in that header, like "Bearer " or "token ".' },
      auth_query: { type: 'string', description: 'Send the key as this query parameter instead, like api_key.' },
      max_chars: { type: 'number', description: 'Most characters of the answer to return (default 40000, at most 200000).' },
    },
    required: ['url'],
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    let auth;
    let secret: string | undefined;
    if (a.auth) {
      const name = secretName(String(a.auth));
      const s = readSecret(db, name);
      if (!s) return { text: `There is no key named ${name} in the vault. Ask the user for it with request_secret.`, isError: true };
      secret = s.value;
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
    const body = a.body === undefined || a.body === null ? undefined : typeof a.body === 'string' ? a.body : JSON.stringify(a.body);
    const headers: Record<string, string> = {};
    if (a.headers && typeof a.headers === 'object') for (const [k, v] of Object.entries(a.headers)) headers[k] = String(v);
    const clean = (t: string) => {
      let x = redact(t);
      // The key just used, even if the vault's list is being rebuilt.
      if (secret && secret.length >= 4) for (const f of new Set([secret, encodeURIComponent(secret), new URLSearchParams({ v: secret }).toString().slice(2), JSON.stringify(secret).slice(1, -1)])) x = x.split(f).join(`[secret ${auth!.name}]`);
      return x;
    };
    try {
      const r = await httpCall({ method: String(a.method ?? 'GET'), url: String(a.url ?? ''), headers, body, auth }, { allowPrivate: testHooks.allowPrivate, lookup: testHooks.lookup });
      if (auth) touchSecret(db, auth.name);
      const max = Math.min(Math.max(Number(a.max_chars) || 40_000, 1000), 200_000);
      const lines = [`HTTP ${r.status} ${r.statusText}`.trim() + `  ·  ${new URL(r.url).host}  ·  ${r.bytes.toLocaleString('en')} bytes${auth ? `  ·  signed with ${auth.name}` : ''}`];
      for (const [k, v] of Object.entries(r.headers)) lines.push(`${k}: ${v}`);
      if (r.stopped) lines.push('', `(The redirect was not followed: ${r.stopped}.)`);
      lines.push('');
      if (r.binary) lines.push(`(A ${r.headers['content-type'] ?? 'binary'} answer, not shown.)`);
      else {
        const text = r.body.length > max ? `${r.body.slice(0, max)}\n… (cut at ${max.toLocaleString('en')} characters of ${r.body.length.toLocaleString('en')})` : r.body;
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

const LIST_CONNECTIONS: RunTool = {
  name: 'list_connections',
  annotations: { readOnlyHint: true },
  description: 'What is connected here: the apps whose tools you have (by MCP server name) and those turned off for this session, and the keys in the vault with the hosts each may go to. Names only, never values.',
  inputSchema: { type: 'object', properties: {} },
  async run(_a, ctx) {
    const db = ctx.deps.db;
    const extra = sessionExtra(db, ctx.key);
    const apps = connections(db);
    const out: string[] = [];
    const on = apps.filter((c) => onFor(c, extra));
    const off = apps.filter((c) => !onFor(c, extra));
    if (on.length) {
      out.push('Connected apps (their tools come from the MCP server of the same name):');
      for (const c of on) {
        const tools = c.tools?.filter((t) => toolOn(c, t.name)).map((t) => t.name);
        const state = c.status === 'signin' ? ' — needs the user to connect it again (Settings → Connections)' : c.status === 'error' ? ` — not working: ${c.error ?? 'unknown error'}` : '';
        out.push(`- ${c.id}: ${c.entry.name}, ${c.entry.description}${tools?.length ? ` Tools: ${tools.slice(0, 40).join(', ')}${tools.length > 40 ? '…' : ''}.` : ''}${isRemote(c.entry) ? '' : ' (runs on this computer)'}${state}`);
      }
    } else out.push('No apps are connected for this session. The user connects them in Settings → Connections.');
    if (off.length) out.push('', `Off for this session (the user can turn them on in the session's menu, under Session settings → Connected apps): ${off.map((c) => `${c.id} (${c.entry.name})`).join(', ')}.`);
    const keys = listSecrets(db);
    out.push('');
    if (keys.length) {
      out.push('Keys in the vault (use them with http_request, auth: NAME):');
      for (const k of keys) out.push(`- ${k.name}: ${k.domains.length ? `for ${k.domains.join(', ')}` : 'no hosts allowed yet (the user adds them in Settings → Connections → Keys)'}${k.note ? `. ${k.note}` : ''}`);
    } else out.push('No keys are saved. If a task needs one, ask with request_secret.');
    return redact(out.join('\n'));
  },
};

/** For the script tests: reach a local fake server, and name hosts without DNS. */
export const testHooks: { allowPrivate?: boolean; lookup?: any } = {};

export const sessionTools = (_ctx: RunCtx): RunTool[] => [REQUEST_SECRET, HTTP_REQUEST, LIST_CONNECTIONS];
