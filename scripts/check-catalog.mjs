#!/usr/bin/env node
// Checks every app in catalog/connections/ against catalog/schema.json and the rules the app relies on
// (file named after the id, ids unique, placeholders declared, keys never in an address or a command
// line, icons safe). With --probe it also asks each server how it answers: a remote one is sent an MCP
// initialize (and its sign-in is looked up for OAuth apps), a local one's package is looked up on npm
// or PyPI. Nothing is installed or run.
//
//   node scripts/check-catalog.mjs                  check the files (exits 1 on a problem)
//   node scripts/check-catalog.mjs --probe [ids…]   also probe the servers (all, or the ids given)
//   node scripts/check-catalog.mjs --probe --json   the probe's findings as JSON
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'catalog', 'connections');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'schema.json'), 'utf8'));
const argv = process.argv.slice(2);
const PROBE = argv.includes('--probe');
const JSON_OUT = argv.includes('--json');
const only = argv.filter((a) => !a.startsWith('--'));

// ---- a small JSON Schema check: the keywords schema.json uses ------------------------------------------

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

function validate(s, v, at, errs) {
  if (s.const !== undefined && v !== s.const) return errs.push(`${at}: should be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) return errs.push(`${at}: one of ${s.enum.join(', ')}`);
  if (s.oneOf) {
    const fits = s.oneOf.filter((x) => {
      const e = [];
      validate(x, v, at, e);
      return !e.length;
    });
    if (fits.length !== 1) {
      // The closest branch says best what is wrong.
      const tries = s.oneOf.map((x) => {
        const e = [];
        validate(x, v, at, e);
        return e;
      });
      tries.sort((a, b) => a.length - b.length);
      errs.push(...(fits.length > 1 ? [`${at}: fits more than one shape`] : tries[0]));
    }
    return;
  }
  if (s.type) {
    const t = typeOf(v);
    const ok = Array.isArray(s.type) ? s.type.includes(t) : s.type === t || (s.type === 'number' && t === 'integer');
    if (!ok) return errs.push(`${at}: should be ${s.type}`);
  }
  if (typeof v === 'string') {
    if (s.minLength !== undefined && v.length < s.minLength) errs.push(`${at}: too short`);
    if (s.maxLength !== undefined && v.length > s.maxLength) errs.push(`${at}: longer than ${s.maxLength} characters`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${at}: does not match ${s.pattern}`);
  }
  if (Array.isArray(v)) {
    if (s.maxItems !== undefined && v.length > s.maxItems) errs.push(`${at}: more than ${s.maxItems} items`);
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) errs.push(`${at}: has repeats`);
    if (s.items) v.forEach((x, i) => validate(s.items, x, `${at}[${i}]`, errs));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const r of s.required ?? []) if (!(r in v)) errs.push(`${at}: ${r} is missing`);
    for (const [k, x] of Object.entries(v)) {
      if (s.propertyNames?.pattern && !new RegExp(s.propertyNames.pattern).test(k)) errs.push(`${at}: bad name ${k}`);
      if (s.properties?.[k]) validate(s.properties[k], x, `${at}.${k}`, errs);
      else if (s.additionalProperties === false) errs.push(`${at}: unknown field ${k}`);
      else if (typeof s.additionalProperties === 'object') validate(s.additionalProperties, x, `${at}.${k}`, errs);
    }
  }
}

// ---- the rules beyond the schema ------------------------------------------------------------------------

const PLACEHOLDER = /\{\{([A-Za-z0-9_]+)\}\}/g;
const RESERVED = new Set(['hydor', 'naget-agent', 'agent-console', 'catalog', 'secrets', 'requests', 'session', 'flows', 'callback', 'mcp', 'launch']);
const GLYPHS = new Set(['folder', 'git', 'globe', 'brain', 'clock', 'database', 'browser', 'search', 'terminal', 'mail', 'calendar', 'chat', 'key', 'cloud', 'list']);

function safeSvg(svg) {
  return !/<script|<foreignObject|<iframe|<image|<use|\son[a-z]+\s*=|javascript:|data:|href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i.test(svg);
}

function rules(a, file) {
  const errs = [];
  const warn = [];
  if (path.basename(file, '.json') !== a.id) errs.push(`the file should be named ${a.id}.json`);
  if (RESERVED.has(a.id)) errs.push(`the id ${a.id} is taken by the app itself`);
  const s = a.server ?? {};
  const fields = a.fields ?? [];
  const names = new Set(fields.map((f) => f.name));
  if (names.size !== fields.length) errs.push('fields: two have the same name');
  const used = [...JSON.stringify(s).matchAll(PLACEHOLDER)].map((m) => m[1]);
  for (const n of used) if (!names.has(n)) errs.push(`{{${n}}} is not one of the fields`);
  for (const f of fields) if (!used.includes(f.name)) warn.push(`field ${f.name} is not used in the server's address, arguments or environment`);
  if (s.transport !== 'stdio') {
    if (fields.some((f) => f.secret && used.includes(f.name))) errs.push('a secret field cannot go in an address (keys go in a header: auth.type api_key)');
    if (/[?&](api[_-]?key|key|token|secret)=/i.test(s.url ?? '')) errs.push('the address carries a key: use auth.type api_key with a header');
  } else {
    if (a.auth?.type === 'oauth') errs.push('oauth is for remote servers');
    if (fields.some((f) => f.secret && JSON.stringify(s.args ?? []).includes(`{{${f.name}}}`))) errs.push('a secret field goes in env, not args (a command line is visible to others on the machine)');
    if (a.auth?.type === 'api_key' && !fields.some((f) => f.secret)) errs.push('a local server with a key needs a secret field');
    if (a.auth?.type === 'api_key' && (a.auth.header || a.auth.prefix)) errs.push('auth.header and auth.prefix are for remote servers');
    if (a.defaultTools) warn.push('defaultTools on a local server only applies through the bridge (it is honoured, but every tool still downloads)');
  }
  if (a.auth?.type === 'none' && fields.some((f) => f.secret)) errs.push('auth.type none, but a field is secret: use api_key');
  if (typeof a.icon === 'object' && !safeSvg(a.icon.svg)) errs.push('icon.svg: no scripts, event handlers, links, images or data addresses');
  if (typeof a.icon === 'string' && !GLYPHS.has(a.icon) && a.icon !== a.id) warn.push(`icon "${a.icon}" is neither the app's id nor a generic glyph: a monogram is drawn`);
  if (typeof a.icon === 'string' && !a.color && !GLYPHS.has(a.icon)) warn.push('no color for the monogram tile');
  if (a.description && !/[.!]$/.test(a.description.trim())) warn.push('the description should end with a full stop');
  if (a.verified && a.verified.date > new Date().toISOString().slice(0, 10)) errs.push('verified.date is in the future');
  return { errs, warn };
}

// ---- probing ------------------------------------------------------------------------------------------

const UA = { 'user-agent': 'Hydor catalog check (+https://github.com/algoprog/hydor)' };
const fillDefaults = (u, fields) => u.replace(PLACEHOLDER, (_m, n) => fields?.find((f) => f.name === n)?.default ?? fields?.find((f) => f.name === n)?.placeholder ?? 'example');

async function getJson(u) {
  try {
    const r = await fetch(u, { headers: { accept: 'application/json', ...UA }, signal: AbortSignal.timeout(15_000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const challenge = (h) => Object.fromEntries([...(h ?? '').matchAll(/([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3]]));

/** Protected-resource and authorization-server metadata, the way the app looks them up. */
async function signIn(url, wwwAuth) {
  const ch = challenge(wwwAuth);
  const u = new URL(url);
  const p = u.pathname.replace(/\/+$/, '');
  let prm = null;
  for (const t of [ch.resource_metadata, `${u.origin}/.well-known/oauth-protected-resource${p}`, `${u.origin}/.well-known/oauth-protected-resource`].filter(Boolean)) {
    prm = await getJson(t);
    if (prm?.authorization_servers?.length) break;
    prm = null;
  }
  const issuer = prm ? prm.authorization_servers[0] : u.origin;
  const iu = new URL(issuer);
  const ip = iu.pathname.replace(/\/+$/, '');
  for (const t of [`${iu.origin}/.well-known/oauth-authorization-server${ip}`, `${iu.origin}/.well-known/openid-configuration${ip}`, ...(ip ? [`${iu.origin}${ip}/.well-known/openid-configuration`] : [])]) {
    const m = await getJson(t);
    if (m?.authorization_endpoint && m?.token_endpoint)
      return { prm: !!prm, issuer: m.issuer ?? issuer, dcr: !!m.registration_endpoint, s256: !m.code_challenge_methods_supported || m.code_challenge_methods_supported.includes('S256') };
  }
  return { prm: !!prm, issuer, dcr: false, s256: false, missing: true };
}

async function probeRemote(a) {
  const url = fillDefaults(a.server.url, a.fields);
  if (a.server.transport === 'sse') {
    const ctl = new AbortController();
    try {
      const r = await fetch(url, { headers: { accept: 'text/event-stream', ...UA }, signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(15_000)]) });
      if (r.status === 401) {
        const s = await signIn(url, r.headers.get('www-authenticate'));
        return { ok: a.auth.type !== 'none', how: `sse, asks to sign in${a.auth.type === 'oauth' ? `; OAuth at ${s.issuer}, ${s.dcr ? 'registers by itself' : 'needs a client id'}${s.s256 ? '' : ', no S256'}` : ''}`, ...s };
      }
      const type = r.headers.get('content-type') ?? '';
      if (r.ok && type.includes('text/event-stream')) {
        const reader = r.body.getReader();
        const { value } = await Promise.race([reader.read(), new Promise((res) => setTimeout(() => res({}), 8000))]);
        ctl.abort();
        const text = value ? new TextDecoder().decode(value) : '';
        return { ok: /event:\s*endpoint/.test(text), how: /event:\s*endpoint/.test(text) ? 'sse, names its endpoint without sign-in' : 'sse stream, no endpoint seen' };
      }
      ctl.abort();
      return { ok: false, how: `answered ${r.status} ${type}` };
    } catch (e) {
      return { ok: false, how: `unreachable: ${e.message}` };
    }
  }
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...UA },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'hydor-catalog-check', version: '1' } } }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ok: false, how: `unreachable: ${e.cause?.code ?? e.message}` };
  }
  const type = r.headers.get('content-type') ?? '';
  const text = await r.text().catch(() => '');
  if (r.status === 401 || r.status === 403) {
    if (a.auth.type === 'none') return { ok: false, how: `asks to sign in (${r.status}), but the entry says none` };
    const s = await signIn(url, r.headers.get('www-authenticate'));
    if (a.auth.type === 'oauth') return { ok: !s.missing && s.s256, how: s.missing ? 'asks to sign in, but no OAuth metadata found' : `OAuth at ${s.issuer}${s.prm ? '' : ' (no resource metadata)'}, ${s.dcr ? 'registers by itself' : 'needs a client id'}${s.s256 ? '' : ', no S256'}`, ...s };
    return { ok: true, how: `asks for a key (${r.status})${s.missing ? '' : `; it also offers OAuth at ${s.issuer}${s.dcr ? ' with registration' : ''}`}`, ...s };
  }
  if (r.ok && (type.includes('json') || type.includes('event-stream')) && /"jsonrpc"/.test(text)) {
    // Some servers answer initialize to anyone and want a token for their tools (Google's).
    if (a.auth.type === 'oauth') {
      const s = await signIn(url, null);
      return { ok: !s.missing && s.prm, how: s.prm && !s.missing ? `answers initialize openly; OAuth for its tools at ${s.issuer}, ${s.dcr ? 'registers by itself' : 'needs a client id'}` : 'answers without sign-in, but the entry says oauth', ...s };
    }
    return { ok: true, how: `answers without sign-in${/serverInfo/.test(text) ? '' : ' (no serverInfo)'}` };
  }
  return { ok: false, how: `answered ${r.status} ${type.split(';')[0]}` };
}

/** The package a local server's command runs, and where it is published. */
function packageOf(a) {
  const { command, args = [] } = a.server;
  const firstArg = args.find((x) => !x.startsWith('-'));
  const bare = (p) => (p.startsWith('@') ? p.replace(/^(@[^/]+\/[^@]+)(@.*)?$/, '$1') : p.replace(/@.*$/, ''));
  if (command === 'npx' && firstArg) return { registry: 'npm', name: bare(firstArg) };
  if (command === 'uvx') {
    const from = args.indexOf('--from');
    return { registry: 'pypi', name: (from >= 0 ? args[from + 1] : firstArg).replace(/[=<>@].*$/, '').replace(/\[.*\]$/, '') };
  }
  if (command === 'docker') return { registry: 'docker', name: args.find((x, i) => i > 0 && !x.startsWith('-') && args[i - 1] !== '-e') };
  return null;
}

async function probeLocal(a) {
  const p = packageOf(a);
  if (!p) return { ok: false, how: `runs ${a.server.command}: not looked up` };
  if (p.registry === 'npm') {
    const j = await getJson(`https://registry.npmjs.org/${p.name.replace('/', '%2f')}`);
    if (!j) return { ok: false, how: `npm has no package ${p.name}` };
    const latest = j['dist-tags']?.latest;
    return { ok: !j.versions?.[latest]?.deprecated, how: `npm ${p.name}@${latest}${j.versions?.[latest]?.deprecated ? ' (deprecated)' : ''}, published ${String(j.time?.[latest] ?? '').slice(0, 10)}` };
  }
  if (p.registry === 'pypi') {
    const j = await getJson(`https://pypi.org/pypi/${p.name}/json`);
    if (!j) return { ok: false, how: `PyPI has no package ${p.name}` };
    const files = j.releases?.[j.info.version] ?? [];
    return { ok: !j.info.yanked, how: `PyPI ${p.name} ${j.info.version}, published ${String(files[0]?.upload_time ?? '').slice(0, 10)}` };
  }
  return { ok: false, how: `docker image ${p.name}: not looked up` };
}

// ---- main ---------------------------------------------------------------------------------------------

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const ids = new Map();
const apps = [];
let bad = 0;
let warned = 0;
for (const f of files) {
  let a;
  try {
    a = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  } catch (e) {
    console.log(`✗ ${f}: not JSON (${e.message})`);
    bad++;
    continue;
  }
  const errs = [];
  validate(schema, a, a.id ?? f, errs);
  const r = rules(a, f);
  errs.push(...r.errs);
  if (ids.has(a.id)) errs.push(`the id ${a.id} is also used by ${ids.get(a.id)}`);
  ids.set(a.id, f);
  if (errs.length) {
    bad++;
    console.log(`✗ ${f}\n${[...new Set(errs)].map((e) => `    ${e}`).join('\n')}`);
  }
  if (r.warn.length && !JSON_OUT) {
    warned++;
    console.log(`! ${f}\n${r.warn.map((e) => `    ${e}`).join('\n')}`);
  }
  apps.push(a);
}

const byCat = {};
for (const a of apps) byCat[a.category] = (byCat[a.category] ?? 0) + 1;
if (!JSON_OUT) {
  console.log(`\n${files.length} apps, ${bad ? `${bad} with problems` : 'all fine'}${warned ? `, ${warned} with notes` : ''}.`);
  console.log(Object.entries(byCat).sort((x, y) => y[1] - x[1]).map(([c, n]) => `${c} ${n}`).join(' · '));
  console.log(`remote ${apps.filter((a) => a.server?.transport !== 'stdio').length} · local ${apps.filter((a) => a.server?.transport === 'stdio').length} · verified ${apps.filter((a) => a.verified).length} · not checked yet ${apps.filter((a) => !a.verified).length}`);
}

if (PROBE) {
  const list = apps.filter((a) => !only.length || only.includes(a.id));
  const results = {};
  let i = 0;
  // A few at a time.
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < list.length) {
        const a = list[i++];
        const r = a.server.transport === 'stdio' ? await probeLocal(a) : await probeRemote(a);
        results[a.id] = r;
        if (!JSON_OUT) console.log(`${r.ok ? '✓' : '✗'} ${a.id.padEnd(22)} ${r.how}`);
      }
    }),
  );
  if (JSON_OUT) console.log(JSON.stringify(results, null, 2));
  else console.log(`\nprobed ${list.length}: ${Object.values(results).filter((r) => r.ok).length} answered as described.`);
}

process.exit(bad ? 1 : 0);
