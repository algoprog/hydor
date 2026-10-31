// The catalog of apps: one JSON file per app in catalog/connections/, added by pull request (see
// catalog/CONTRIBUTING.md; scripts/check-catalog.mjs checks them all). Read when first needed and again
// when the folder changes; a file that does not hold together is left out with a warning.
import fs from 'node:fs';
import path from 'node:path';
import { CONNECTION_CATEGORIES, type CatalogApp, type CatalogField } from '../../shared/connections.ts';
import { APP_ROOT } from '../config.ts';

export const CATALOG_DIR = path.join(APP_ROOT, 'catalog', 'connections');

export const APP_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Ids an app cannot have: the app's own MCP server's names, and words its addresses use. */
export const RESERVED_IDS = new Set(['naget-agent', 'agent-console', 'catalog', 'secrets', 'requests', 'session', 'flows', 'callback', 'mcp', 'launch']);
const FIELD = /^[A-Z][A-Z0-9_]{0,63}$/;
const PLACEHOLDER = /\{\{([A-Za-z0-9_]+)\}\}/g;

/** A small SVG that cannot run or fetch anything (it is shown as an image anyway). */
export function safeSvg(svg: string): boolean {
  return (
    svg.length <= 8192 &&
    /^<svg[\s>]/.test(svg.trim()) &&
    !/<script|<foreignObject|<iframe|<image|<use|\son[a-z]+\s*=|javascript:|data:|href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i.test(svg)
  );
}

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const httpsUrl = (v: unknown) => {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v.replace(PLACEHOLDER, 'x'));
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname));
  } catch {
    return false;
  }
};

/** Why an entry cannot be used, or null when it holds together. The check script says more. */
export function problem(a: any, file?: string): string | null {
  if (!a || typeof a !== 'object') return 'not an object';
  if (typeof a.id !== 'string' || !APP_ID.test(a.id)) return 'id: lowercase letters, digits and dashes';
  if (RESERVED_IDS.has(a.id)) return `id: ${a.id} is taken by the app itself`;
  if (file && path.basename(file, '.json') !== a.id) return `the file should be named ${a.id}.json`;
  if (!str(a.name, 60) || !str(a.description, 240) || !str(a.homepage, 300)) return 'name, description and homepage are needed';
  if (!(a.category in CONNECTION_CATEGORIES)) return `category: one of ${Object.keys(CONNECTION_CATEGORIES).join(', ')}`;
  if (typeof a.icon === 'object' ? !a.icon || typeof a.icon.svg !== 'string' || !safeSvg(a.icon.svg) : !/^[a-z0-9-]{1,40}$/.test(String(a.icon))) return 'icon: a slug, or { "svg": "<svg …>" } without scripts or links';
  const s = a.server;
  if (!s || typeof s !== 'object') return 'server is needed';
  if (s.transport === 'http' || s.transport === 'sse') {
    if (!httpsUrl(s.url)) return 'server.url: an https address';
  } else if (s.transport === 'stdio') {
    if (!str(s.command, 200) || /[\s;&|`$<>]/.test(s.command)) return 'server.command: one program, without spaces or shell signs';
    if (s.args !== undefined && (!Array.isArray(s.args) || s.args.some((x: unknown) => typeof x !== 'string'))) return 'server.args: a list of strings';
    if (s.env !== undefined && (typeof s.env !== 'object' || Object.entries(s.env).some(([k, v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== 'string'))) return 'server.env: names to strings';
  } else return 'server.transport: http, sse or stdio';
  const auth = a.auth;
  if (!auth || !['none', 'oauth', 'api_key'].includes(auth.type)) return 'auth.type: none, oauth or api_key';
  if (auth.type === 'oauth' && s.transport === 'stdio') return 'oauth is for remote servers';
  if (auth.header !== undefined && !/^[A-Za-z0-9-]{1,64}$/.test(auth.header)) return 'auth.header: a header name';
  const fields: CatalogField[] = a.fields ?? [];
  if (!Array.isArray(fields) || fields.some((f) => !f || !FIELD.test(f.name) || !str(f.label, 80))) return 'fields: each with a NAME and a label';
  const names = new Set(fields.map((f) => f.name));
  const used = [...JSON.stringify(s).matchAll(PLACEHOLDER)].map((m) => m[1]);
  const unknown = used.find((n) => !names.has(n));
  if (unknown) return `{{${unknown}}} is not one of the fields`;
  if (s.transport !== 'stdio' && fields.some((f) => f.secret && used.includes(f.name))) return 'a secret field cannot go in an address';
  if (s.transport === 'stdio' && fields.some((f) => f.secret && JSON.stringify(s.args ?? []).includes(`{{${f.name}}}`))) return 'a secret field goes in env, not in args (others can read a command line)';
  if (auth.type === 'api_key' && s.transport === 'stdio' && !fields.some((f) => f.secret)) return 'a local server with a key needs a secret field';
  if (a.defaultTools !== undefined && (!Array.isArray(a.defaultTools) || a.defaultTools.some((t: unknown) => typeof t !== 'string'))) return 'defaultTools: a list of tool names';
  if (a.verified !== null && (typeof a.verified !== 'object' || !str(a.verified?.by, 80) || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.verified?.date)))) return 'verified: { by, date } or null';
  return null;
}

let cache: { mtime: number; apps: CatalogApp[] } | null = null;

export function catalog(): CatalogApp[] {
  let mtime = 0;
  try {
    mtime = fs.statSync(CATALOG_DIR).mtimeMs;
  } catch {
    return [];
  }
  if (cache && cache.mtime === mtime) return cache.apps;
  const apps: CatalogApp[] = [];
  for (const f of fs.readdirSync(CATALOG_DIR).filter((x) => x.endsWith('.json')).sort()) {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, f), 'utf8'));
      const why = problem(a, f);
      if (why) {
        console.warn(`[connections] catalog/connections/${f} left out: ${why}`);
        continue;
      }
      delete a.$schema;
      apps.push(a as CatalogApp);
    } catch (e) {
      console.warn(`[connections] catalog/connections/${f} left out: ${(e as Error).message}`);
    }
  }
  apps.sort((x, y) => x.name.localeCompare(y.name));
  cache = { mtime, apps };
  return apps;
}

export const catalogApp = (id: string) => catalog().find((a) => a.id === id);

/** `s` with each {{NAME}} replaced by its value. */
export const fill = (s: string, values: Record<string, string>) => s.replace(PLACEHOLDER, (_m, n: string) => values[n] ?? '');

export const placeholders = (s: string) => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]);
