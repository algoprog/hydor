// The keys an app needs (an API key, a token, a password): what its recipe says of each, never a value. Values live
// in the vault (Settings' Keys, server/connections/vault.ts) under the key's name, where every agent uses them by
// name; an app's own runs are told which are theirs. The person gives one when they install the app, or on a form
// the first time it runs without it (its page's form, or its card in a session when an agent runs it).
import { cleanDomains, SECRET_NAME, secretName } from './connections.ts';

export interface AppSecret {
  /** Its name in the vault: capitals, digits and _ (OPENWEATHER_API_KEY). Its steps use it by this name. */
  name: string;
  /** What it is, in a few words ("OpenWeather API key"). */
  label: string;
  /** A line on what it is for, or how to find it. */
  help?: string;
  /** Where to get one (the service's page for keys). */
  url?: string;
  /** The hosts it may be sent to and typed on (api.openweathermap.org; their subdomains too). */
  domains?: string[];
  /** Commands on this computer may have it in their environment (run_with_secrets). */
  commands?: boolean;
  /** How http_request sends it unless a call says otherwise: a header (with what goes before the key), or a query parameter. */
  header?: string;
  prefix?: string;
  query?: string;
  /** The app runs without it, doing less. */
  optional?: boolean;
}

/** A key an app needs, as its pages show it: whether the vault has it (and its masked end). */
export type AppSecretState = AppSecret & { have: boolean; hint?: string };

export const MAX_APP_SECRETS = 10;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The keys a recipe needs, from anything: names the vault takes, each once; errors say what to fix. */
export function cleanSecrets(raw: unknown): { secrets?: AppSecret[]; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { errors };
  if (!Array.isArray(raw)) return { errors: ['The keys it needs (“secrets”) are a list: [{ "name": "OPENWEATHER_API_KEY", "label": "OpenWeather API key", "url": "…", "domains": ["api.openweathermap.org"] }]'] };
  if (raw.length > MAX_APP_SECRETS) errors.push(`An app needs at most ${MAX_APP_SECRETS} keys`);
  const out: AppSecret[] = [];
  for (const x of raw.slice(0, MAX_APP_SECRETS)) {
    const o = (typeof x === 'string' ? { name: x } : x && typeof x === 'object' && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
    const name = secretName(String(o.name ?? o.label ?? ''));
    if (!name || !SECRET_NAME.test(name)) {
      errors.push(`A key it needs: “${String(o.name ?? '').slice(0, 60)}” is not a key's name (capitals, digits and _, like GITHUB_TOKEN)`);
      continue;
    }
    if (out.some((s) => s.name === name)) {
      errors.push(`The key ${name} is there twice`);
      continue;
    }
    const s: AppSecret = { name, label: str(o.label, 80) || name.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) };
    const help = str(o.help, 300);
    if (help) s.help = help;
    const url = str(o.url, 500);
    if (url) {
      if (/^https?:\/\/\S+$/i.test(url)) s.url = url;
      else errors.push(`The key ${name}: its url is a web address (https://…)`);
    }
    const domains = cleanDomains(o.domains);
    if (domains.length) s.domains = domains;
    if (o.commands === true) s.commands = true;
    const header = str(o.header, 64);
    if (header) {
      if (/^[A-Za-z0-9-]{1,64}$/.test(header)) s.header = header;
      else errors.push(`The key ${name}: a header's name has letters, digits and dashes`);
    }
    if (typeof o.prefix === 'string' && o.prefix) s.prefix = o.prefix.replace(/[\r\n]/g, '').slice(0, 40);
    const query = str(o.query, 64);
    if (query) {
      if (/^[A-Za-z0-9_.-]{1,64}$/.test(query)) s.query = query;
      else errors.push(`The key ${name}: a query parameter's name has letters, digits, dots, dashes and underscores`);
    }
    if (o.optional === true) s.optional = true;
    if (!s.domains && !s.commands) errors.push(`The key ${name}: say where it may go (domains, like ["api.example.com"]) or that commands use it (commands: true), or nothing can use it`);
    out.push(s);
  }
  return { secrets: out.length ? out : undefined, errors };
}

/** How an app's run is told of its keys: their names and how to use each, never a value. */
export function secretsLine(secrets: AppSecretState[] | undefined): string | null {
  const list = secrets ?? [];
  if (!list.length) return null;
  const one = (s: AppSecretState) => {
    const ways = [s.domains?.length ? `http_request (auth: "${s.name}", or {{${s.name}}} in the address, headers or body) for ${s.domains.join(', ')}` : '', s.commands ? `run_with_secrets ($${s.name})` : ''].filter(Boolean).join(', or ');
    return `- ${s.name} (${s.label})${s.have ? '' : s.optional ? ': not given, so do without it' : ': missing'}${s.have && ways ? `: use it in ${ways}` : ''}`;
  };
  return ['The app’s keys, in the vault (you never see their values: use them by name):', ...list.map(one)].join('\n');
}
