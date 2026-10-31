// Connections: apps every agent can use, signed in once (Notion, Linear, GitHub…), from a catalog anyone
// can add to with a pull request (catalog/connections/*.json), and the vault for keys. What the server
// and the pages share. Secret values never travel in any of these: only masked hints.

export const CONNECTION_CATEGORIES = {
  docs: 'Notes & docs',
  tasks: 'Tasks & projects',
  communication: 'Mail, chat & meetings',
  calendar: 'Calendar & scheduling',
  files: 'Files & storage',
  design: 'Design & media',
  dev: 'Developer tools',
  cloud: 'Cloud & hosting',
  data: 'Databases & data',
  analytics: 'Analytics & monitoring',
  sales: 'Sales, marketing & support',
  finance: 'Payments & finance',
  commerce: 'Websites & shops',
  search: 'Search & the web',
  ai: 'AI & automation',
  life: 'Travel & everyday',
  local: 'On this computer',
} as const;

export type ConnectionCategory = keyof typeof CONNECTION_CATEGORIES;

/** Something the person fills in when connecting: a folder, a site's address, or a key (secret). */
export interface CatalogField {
  /** Its placeholder in the server's address, arguments or environment: {{NAME}}. */
  name: string;
  label: string;
  /** Kept in the vault and never shown back; only a local server's environment may use it. */
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
  default?: string;
  help?: string;
  /** Where to get it. */
  url?: string;
}

export type CatalogServer =
  /** A remote MCP server: Streamable HTTP ("http") or the older HTTP with server-sent events ("sse"). */
  | { transport: 'http' | 'sse'; url: string }
  /** A command this computer runs (npx, uvx, docker…), talking over stdin and stdout. */
  | { transport: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };

export type CatalogAuth =
  | { type: 'none' }
  /** Signed in in the browser; Naget registers itself with the app's sign-in server (or uses clientId). */
  | { type: 'oauth'; scopes?: string[]; clientId?: string; help?: string; /** Extra parameters for the sign-in address (Google: access_type=offline). */ params?: Record<string, string> }
  /**
   * A key: a remote server gets it in a header (Authorization: Bearer … unless said otherwise); a local
   * server gets its secret fields in its environment.
   */
  | { type: 'api_key'; header?: string; prefix?: string; url?: string; help?: string };

export interface CatalogApp {
  id: string;
  name: string;
  /** One short sentence: what an agent can do with it. */
  description: string;
  category: ConnectionCategory;
  /** A slug ("github", "folder") or a small inline SVG. */
  icon: string | { svg: string };
  /** The tile's colour (#rrggbb) when the icon is a slug. */
  color?: string;
  homepage: string;
  docs?: string;
  server: CatalogServer;
  auth: CatalogAuth;
  fields?: CatalogField[];
  /** The tools on until the person turns others on (remote servers); every tool when left out. */
  defaultTools?: string[];
  keywords?: string[];
  featured?: boolean;
  /** Who checked the server answers as described, and when; null for an address not checked yet. */
  verified: { by: string; date: string } | null;
  /** Anything to know before connecting, in one or two plain sentences. */
  notes?: string;
}

export type ConnectionStatus = 'ok' | 'untested' | 'signin' | 'error';

/** A connected app, as Settings shows it. */
export interface ConnectionView {
  id: string;
  name: string;
  app: CatalogApp;
  /** On for every session (each session may still turn it off, or on). */
  enabled: boolean;
  status: ConnectionStatus;
  error?: string;
  /** A masked key ("…f3a9"), or the account it signed in as. */
  hint?: string;
  /** The fields that are not secret, as entered. */
  fields: Record<string, string>;
  /** The secret fields that are set (values stay in the vault). */
  secretFields: string[];
  /** From the last test; `on` says whether agents get it. */
  tools?: { name: string; description?: string; on: boolean }[];
  testedAt?: number;
  /** When the current sign-in ends (it renews by itself while it can). */
  expiresAt?: number;
  /** The catalog now has another server or sign-in for it: it keeps the old one until connected again. */
  catalogChanged?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A key in the vault: its value is never sent, only a masked hint. */
export interface SecretView {
  name: string;
  hint: string;
  /** Where http_request may send it: these hosts and their subdomains. */
  domains: string[];
  note: string;
  /** How http_request sends it by default: a header (with a prefix), or a query parameter. */
  header?: string;
  prefix?: string;
  query?: string;
  createdAt: number;
  updatedAt: number;
  usedAt?: number;
}

/** An agent asked the person for a key (request_secret), with a card in the conversation. */
export interface SecretRequestView {
  id: string;
  key: string;
  name: string;
  why: string;
  domains: string[];
  state: 'pending' | 'saved' | 'dismissed';
  createdAt: number;
  doneAt?: number;
  /** The vault has a key by that name (its hint, when so). */
  exists: boolean;
  hint?: string;
}

/** One app as a session sees it: on or off here, and whether that differs from every session's default. */
export interface SessionConnection {
  id: string;
  name: string;
  on: boolean;
  /** Its setting for all sessions. */
  global: boolean;
  remote: boolean;
}

/** The session's own choices, in its settings (app_sessions.extra): app id → on or off. */
export type SessionConnections = Record<string, boolean>;

/** Names a key may have (they go in the conversation, so agents can refer to them). */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;

/** A key's name from what an agent or a person typed: GitHub token → GITHUB_TOKEN. */
export const secretName = (s: string) =>
  String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^[^A-Z]+|_+$/g, '')
    .slice(0, 64);

/** Hosts from a list typed by a person or an agent ("https://api.x.com/v1, example.org"). */
export function cleanDomains(v: unknown): string[] {
  const parts = Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[\s,]+/);
  const out = new Set<string>();
  for (let p of parts) {
    p = p.trim().toLowerCase();
    if (!p) continue;
    p = p.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^\*\./, '').replace(/\.$/, '');
    if (/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/.test(p) || /^\d{1,3}(\.\d{1,3}){3}$/.test(p)) out.add(p);
  }
  return [...out].slice(0, 20);
}

/** Whether `host` is one of `domains` or a subdomain of one. */
export const domainAllowed = (host: string, domains: string[]) => {
  const h = host.toLowerCase().replace(/\.$/, '');
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
};
