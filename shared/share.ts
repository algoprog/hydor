// Sharing a project with people (server/spaces/share.ts): the owner invites someone (an advisor, a student) into one
// project by a personal link, /p/<token>. There they see the project as a portal: its documents, sessions, runs and
// reading list; they comment on its documents by name, and with Edit documents change them too. Never the owner's
// agents, files, settings or other projects. What the server and the pages share.
import type { Comment } from './comments.ts';
import type { PageInfo } from './pages.ts';
import type { Agent } from './types.ts';

/** comment: View and comment; edit: Edit documents (and comment). */
export type ShareRole = 'comment' | 'edit';

export const SHARE_ROLES: Record<ShareRole, string> = { comment: 'View and comment', edit: 'Edit documents' };

/** How long a new link works, in days; null: until the owner stops it. */
export const SHARE_DAYS = [7, 30, null] as const;

/** What a person did last: commented on a document, replied on one, changed one, or read one. */
export interface ShareActivity {
  at: number;
  what: 'comment' | 'reply' | 'edit' | 'read';
  /** The document it was about: its id and its title then. */
  page?: string;
  title?: string;
}

/** Someone a project is shared with, as the owner sees them. */
export interface ProjectShare {
  id: string;
  /** The project's id. */
  space: string;
  name: string;
  role: ShareRole;
  createdAt: number;
  /** When the link stops by itself; none: when the owner stops it. */
  expiresAt?: number;
  /** When they last had the project open, and on how many visits (a visit: half an hour apart). */
  seenAt?: number;
  views: number;
  activity?: ShareActivity;
}

/** A document of the project, as a person's portal lists it. */
export interface PortalItem {
  id: string;
  title: string;
  /** Another kind than a page of HTML. */
  kind?: PageInfo['kind'];
  version: number;
  updatedAt: number;
  /** Its picture is ready: GET /p-api/<token>/pages/<id>/thumb?v=<thumb>. */
  thumb?: string;
}

/** A session of the project, as a person's portal lists it. */
export interface PortalSession {
  key: string;
  title: string;
  agent: Agent;
  acpName?: string;
  updatedAt?: number;
  /** working, waiting, starting: at work now; else idle. */
  status: string;
}

/** An experiment's run of the project: what can be shown of it (never its command, folder, log or machine). */
export interface PortalRun {
  id: string;
  name?: string;
  group?: string;
  status: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  /** Its metrics as last read, and the best of each. */
  metrics?: Record<string, number>;
  best?: Record<string, number>;
  params?: Record<string, string | number | boolean>;
  seed?: number;
  tags?: string[];
}

/** A paper of the project's reading list (the Reading list app's records). */
export interface PortalPaper {
  id: string;
  title: string;
  authors?: string;
  year?: string;
  venue?: string;
  /** Where to read it: its own link, else its DOI's or arXiv's. */
  link?: string;
  /** to read, reading or read. */
  status?: string;
  tags?: string[];
}

/** What a person's link opens. */
export interface PortalView {
  project: { name: string; color: string; description?: string };
  /** The name the owner's comments show under. */
  owner: string;
  me: { id: string; name: string; role: ShareRole; expiresAt?: number };
  items: PortalItem[];
  sessions: PortalSession[];
  runs: PortalRun[];
  reading: PortalPaper[];
  /** LaTeX documents can be changed through a link here (TeX runs shut in, by bubblewrap). */
  texEdits: boolean;
}

/** One document, as a person's portal opens it. */
export interface PortalItemView {
  page: PortalItem;
  /** It opens in its editor (Edit documents, a kind people may change): `model` is what to edit. */
  editable: boolean;
  model?: unknown;
  /** Otherwise its own page, to read (shown in the sandboxed frame). */
  html?: string;
  /** A document's or a LaTeX document's comments, the owner's under their name. */
  comments?: Comment[];
}

/** The kinds a person with Edit documents changes in their editor (LaTeX too where TeX runs shut in). */
export const PORTAL_EDITS: NonNullable<PageInfo['kind']>[] = ['doc', 'sheet', 'slides', 'tex'];

/** The kinds that carry comments. */
export const PORTAL_COMMENTS: NonNullable<PageInfo['kind']>[] = ['doc', 'tex'];

/** A name's first letters, for a person's mark: "Maria Lopez" → "ML". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (s: string) => [...s][0] ?? '';
  return ((parts.length > 1 ? first(parts[0]) + first(parts[parts.length - 1]) : [...(parts[0] ?? '?')].slice(0, 2).join('')) || '?').toUpperCase();
}
