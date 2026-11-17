// Wiki memory: Markdown articles agents keep for each project (and one shared wiki), compiled from its documents
// and its work, beside memory's notes and the documents themselves (server/wiki). What the server and the pages share.

/** The most documents a wiki may be set to read: a limit is a whole number from 0 to this. */
export const MAX_WIKI_DOCUMENTS = 100_000;
/** The default limit: a project with more documents keeps them out of its wiki. */
export const DEFAULT_WIKI_DOCUMENTS = 100;

/** Settings → Memory → Wiki memory (GET and PUT /api/wiki/settings). */
export interface WikiMemorySettings {
  /** Wiki memory for the shared wiki, and for every project that does not say otherwise (Space.wikiMemory). Default on. */
  enabled: boolean;
  /** New and changed documents in knowledge add memory notes and update the wiki, with the helper model. Default on. */
  fromDocuments: boolean;
  /**
   * The most documents a project's knowledge may hold for its wiki to read them (0 to 100000; default 100). A project with
   * more keeps them out of its wiki: agents search them instead. A project's own number (Space.wikiDocumentLimit) wins;
   * the shared wiki uses this one.
   */
  documentLimit: number;
  /** The shared wiki's folder, an absolute path; project wikis kept there are under its projects/ folder. */
  hubPath: string;
  /** Where each project's wiki is kept: 'hub' or 'folder' (default: inside the project's own folder, at projectPath). */
  projectWikis: 'hub' | 'folder';
  /** With projectWikis 'folder': the wiki's folder, relative to each project's folder. Default ".wiki". */
  projectPath: string;
  /** Add a project-local wiki folder to the project's .gitignore, in Git repositories only. Default on. */
  gitIgnore: boolean;
  /** Wiki access for chats without a session-specific choice. Default on. */
  defaultChatEnabled: boolean;
  /** Automatically suggest lessons in chats without a session-specific choice. Default off. */
  defaultAutoLessons: boolean;
}

/** How many documents a place's knowledge holds against the most its wiki reads (GET /api/projects/:id/wiki/updates, GET /api/wiki/updates). */
export interface WikiDocuments {
  /** Indexed documents in its knowledge, not counting wikis. */
  count: number;
  /** The most documents its wiki reads: the project's own number, else Settings'. */
  limit: number;
  /** count is more than limit: its documents are not read into the wiki, agents search them. */
  over: boolean;
}

/** An article or a source in a wiki, by its path inside the wiki. */
export interface WikiItem {
  path: string;
  title: string;
}

/** GET /api/projects/:id/wiki: a project's wiki memory. */
export interface ProjectWikiView {
  /** off: wiki memory is off for the project; empty: on, nothing in it yet; ready: articles or sources to show. */
  status: 'off' | 'empty' | 'ready' | 'error';
  /** Whether wiki memory is on for the project now. */
  on: boolean;
  /** True when the project follows Settings (it has no switch of its own). */
  inherited: boolean;
  root?: string;
  articles?: WikiItem[];
  sources?: WikiItem[];
  /** Active project plans and execution evidence under output/projects/. */
  plans?: WikiItem[];
  truncated?: boolean;
  error?: string;
}

/** GET /api/projects/:id/wiki/updates: what new and changed documents and the project's conversations did to the project's memory, newest first. */
export interface WikiUpdate {
  id: number;
  at: number;
  /** The document's title and path, as knowledge has them; for a conversation, the session's title and `session:<session key>`. */
  document: string;
  path: string;
  /** The wiki articles it created or changed, by path. */
  articles: string[];
  /** How many memory notes it added. */
  notes: number;
  /** Why it did nothing, or what went wrong. */
  error?: string;
}
