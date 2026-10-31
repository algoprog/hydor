// Pages that stay: what server and app share about saved pages (the Pages library), their versions and
// storage, and sites published at a link.

/** What a saved page's window.naget.storage may hold. */
export const STORAGE_LIMITS = {
  /** Longest key, in characters. */
  key: 200,
  /** Largest value, as JSON, in bytes. */
  value: 512 * 1024,
  /** All of a page's values together, in bytes. */
  total: 2 * 1024 * 1024,
  keys: 1000,
};

/** Versions a page keeps (the oldest go first), and at most this many bytes of them. */
export const VERSION_LIMITS = { count: 40, bytes: 24 * 1024 * 1024 };

export interface PageInfo {
  id: string;
  title: string;
  /** The current version's number. */
  version: number;
  versions: number;
  /** Size of the current version's HTML. */
  bytes: number;
  storageBytes: number;
  createdAt: number;
  updatedAt: number;
  /** The session it came from. */
  sessionKey?: string;
}

export interface PageVersion {
  version: number;
  title: string;
  bytes: number;
  createdAt: number;
  /** agent: save_page; user: Keep; restore: an older version brought back. */
  by: 'agent' | 'user' | 'restore';
}

export type SiteVisibility = 'private' | 'public';

export interface SiteInfo {
  id: string;
  name: string;
  visibility: SiteVisibility;
  /** A folder on this machine (a build), or a saved page. */
  kind: 'folder' | 'page';
  folder?: string;
  pageId?: string;
  pageTitle?: string;
  /** Where it is served, from this app's address: /site/…/ */
  path: string;
  createdAt: number;
  sessionKey?: string;
}

/** An agent's publish_site call, waiting for the user's say. */
export interface PublishRequest {
  id: string;
  sessionKey: string;
  name: string;
  kind: 'folder' | 'page';
  folder?: string;
  pageId?: string;
  pageTitle?: string;
  files: number;
  bytes: number;
  status: 'open' | 'published' | 'declined' | 'failed';
  site?: SiteInfo;
  error?: string;
  createdAt: number;
  decidedAt?: number;
}

/** News the server sends the pages ({ t: 'feature', id: 'pages', data }). */
export type PagesEvent = { what: 'pages' } | { what: 'sites' } | { what: 'request'; request: PublishRequest };
