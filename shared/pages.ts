// Pages that stay: what server and app share about saved pages (the Pages library), their versions and
// storage, and sites published at a link.

/** What a saved page's window.hydor.storage may hold. */
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
  /** Who made the current version. */
  by?: PageVersion['by'];
  /** Its picture in Pages is ready (GET /api/pages/:id/thumb?v=<thumb>). */
  thumb?: string;
  /** Published at a link. */
  published?: boolean;
  /** Another kind than a page of HTML: slides (shared/slides.ts), a document (shared/docs.ts), a spreadsheet (shared/sheets.ts), LaTeX (shared/latex.ts), a Jupyter notebook (shared/notebook.ts). */
  kind?: 'slides' | 'doc' | 'sheet' | 'tex' | 'notebook';
  /** A template's screen: the template it belongs to (it is not in the library). */
  app?: string;
  /** The space it is in (the Library shows each space's together); none when unset. */
  space?: string;
  /** A page of HTML's icon: the emoji the page editor puts at its top (links to it in other pages show it). */
  icon?: string;
}

export interface PageVersion {
  version: number;
  title: string;
  bytes: number;
  createdAt: number;
  /** agent: save_page; user: Keep; restore: an older version brought back; edit: changed by the user in the editor; made: a page the user made. */
  by: 'agent' | 'user' | 'restore' | 'edit' | 'made';
}

/** One of a page's stored values (window.hydor.storage), as the Data view lists them. */
export interface PageDataEntry {
  key: string;
  value: unknown;
  bytes: number;
  updatedAt: number;
}

/**
 * A page an agent is writing (show_html, save_page, or an HTML file written whole), as its call streams in:
 * the pages showing the session watch it grow until the call is complete.
 */
export interface PageDraft {
  /** The tool call's id: its item in the conversation. */
  id: string;
  tool: 'show_html' | 'save_page' | 'file';
  title?: string;
  /** An HTML file's path. */
  path?: string;
  /** save_page with an id: the saved page it changes. */
  pageId?: string;
  /** The page's HTML so far. */
  text: string;
  /** The call is complete (or stopped). */
  done: boolean;
  startedAt: number;
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
export type PagesEvent =
  | { what: 'pages' }
  | { what: 'sites' }
  | { what: 'request'; request: PublishRequest }
  /** A page's picture in Pages is ready. */
  | { what: 'thumb'; id: string; thumb: string }
  /** To one session's pages: a draft grew by `text`, which goes at `from` (0 with the whole text so far starts it over). */
  | { what: 'draft'; draft: Omit<PageDraft, 'text'>; from: number; text: string }
  /** An agent answered, resolved or added comments of these files of this computer (LaTeX files opened from Files). */
  | { what: 'file-comments'; paths: string[] };

/** What a page-edit note in the conversation holds: the user changed a page, and whether the agent heard of it yet. */
export interface PageEditNote {
  /** A saved page, at `version`… */
  pageId?: string;
  /** …or an HTML file. */
  path?: string;
  title: string;
  version: number;
  told: boolean;
}
