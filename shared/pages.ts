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

/** The most words a description of something in the Library may have (more are cut off). */
export const DESCRIPTION_WORDS = 100;

/** Chinese, Japanese and Korean characters: written without spaces, two of them count as a word. */
const CJK = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af';
const WORD = new RegExp(`[${CJK}]|[^\\s${CJK}]+`, 'gu');
const isCjk = new RegExp(`^[${CJK}]$`, 'u');

/** A text's words, each with where it starts and what it counts for (a CJK character half a word). */
function wordsOf(text: string): { at: number; w: number }[] {
  return [...text.matchAll(WORD)].map((m) => ({ at: m.index ?? 0, w: isCjk.test(m[0]) ? 0.5 : 1 }));
}

/** How many words a text has (in Chinese, Japanese or Korean, two characters make one). */
export const wordCount = (text: string) => Math.ceil(wordsOf(text).reduce((n, x) => n + x.w, 0));

/** A description as it is kept: on one line, without control characters, at most DESCRIPTION_WORDS words ('' for none). */
export function cleanDescription(v: unknown): string {
  const s = String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let n = 0;
  for (const x of wordsOf(s)) {
    n += x.w;
    if (n > DESCRIPTION_WORDS) return s.slice(0, x.at).trim().slice(0, 1500);
  }
  return s.slice(0, 1500);
}

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
  /** Someone the project is shared with made it (their name). */
  who?: string;
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
  /** The Library folder it is in (LibFolder's id, a folder of its space); none at its place's top. */
  folder?: string;
  /** A page of HTML's icon: the emoji the page editor puts at its top (links to it in other pages show it). */
  icon?: string;
  /**
   * What it is, in a few sentences (at most DESCRIPTION_WORDS words): written by the agent that saved it, by the helper
   * model for what came in without one (a file added, a page kept from a conversation), or by the user. The Library's
   * search, the search box and agents find it by it.
   */
  description?: string;
}

/**
 * A folder of the Library: it holds things kept (pages, documents, pictures…) and other folders of its place, a
 * project or none. Deleting one deletes nothing it holds: what is in it goes up a level.
 */
export interface LibFolder {
  id: string;
  name: string;
  /** The folder it is in; none at its place's top. */
  parent?: string;
  /** The project (space) it is in; none when it is in no project. */
  space?: string;
  createdAt: number;
}

/** A folder's name may be this long; folders go this deep (a folder at the top is 1), and the Library holds this many. */
export const FOLDER_LIMITS = { name: 80, depth: 8, count: 2000 };

/** What a folder of this computer brought into the Library gave (POST /api/pages/import-folder). */
export interface FolderImport {
  /** The Library folder made for it; none when it came in as one LaTeX document. */
  folder?: LibFolder;
  /** What came in, as things of the Library. */
  pages: PageInfo[];
  /** Folders made for its folders (the one made for it too). */
  folders: number;
  /** What was left out, by its path in the folder, and why. */
  skipped: { path: string; why: FolderSkip }[];
  /** More that was said: a LaTeX project's files that did not fit, and the like. */
  notes: string[];
}

/**
 * Why a file of a folder was left out: a picture, video or sound (kept from a conversation instead), a PDF or slides
 * (opened in Files), a part of a LaTeX document rather than a whole one, too large, not readable as its kind, of a kind
 * the Library does not keep, or past what one import brings in.
 */
export type FolderSkip = 'picture' | 'video' | 'audio' | 'pdf' | 'slides' | 'part' | 'large' | 'unreadable' | 'kind' | 'limit';

export interface PageVersion {
  version: number;
  title: string;
  bytes: number;
  createdAt: number;
  /** agent: save_page; user: Keep; restore: an older version brought back; edit: changed by the user in the editor; made: a page the user made. */
  by: 'agent' | 'user' | 'restore' | 'edit' | 'made';
  /** Changed (or commented on) by someone the project is shared with, through their link: their name. */
  who?: string;
  /** An agent's saves in a row kept as this one version (left out for one). */
  steps?: number;
  /** The name the user gave it ("Sent to ICML"): a named version is kept past the newest 40. */
  name?: string;
}

/** The longest a version's name may be. */
export const VERSION_NAME_MAX = 80;

/** One of a page's stored values (window.hydor.storage), as the Data view lists them. */
export interface PageDataEntry {
  key: string;
  value: unknown;
  bytes: number;
  updatedAt: number;
}

/**
 * A page an agent is writing (show_html, save_page, or an HTML file written whole), or a document, deck, spreadsheet
 * or LaTeX document it is saving (save_doc, save_slides, save_sheet, save_latex), as its call streams in: the pages
 * showing the session (and an editor that has that page open) watch it grow until the call is complete.
 */
export interface PageDraft {
  /** The tool call's id: its item in the conversation. */
  id: string;
  tool: 'show_html' | 'save_page' | 'file' | 'save_doc' | 'save_slides' | 'save_sheet' | 'save_latex';
  title?: string;
  /** An HTML file's path. */
  path?: string;
  /** save_page (or a save of another kind) with an id: the saved page it changes. */
  pageId?: string;
  /** The page's HTML so far; for a save of another kind, the call's own input so far (JSON still being written). */
  text: string;
  /** The call is complete (or stopped). */
  done: boolean;
  startedAt: number;
  /** The session it is in. */
  key?: string;
  /** Counts what was sent of it: a window that hears of it twice (the session and the page both open) takes it once. */
  seq?: number;
  /** A save of another kind, once its call has run: the version it saved (the page's, when it made a new one)… */
  saved?: { pageId: string; version: number };
  /** …or that it saved nothing (the call failed, or the turn stopped first): the page stays as it was. */
  failed?: boolean;
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
  /** A page's comments changed (by an agent's save_page, or in another window). */
  | { what: 'comments'; id: string }
  /** To one session's pages (and a save's page, open in an editor): a draft grew by `text`, which goes at `from` (0 with the whole text so far starts it over). */
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
