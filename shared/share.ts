// Sharing with people (server/spaces/share.ts): the owner invites someone (an advisor, a student, a client) by a
// personal link, /p/<token>, into one project, or to one thing of the Library alone: a document, a spreadsheet, slides,
// a LaTeX document, a notebook, a page, a design, a picture, a video or a sound. A project's link opens it as a portal:
// its documents, sessions, runs and reading list; a thing's link opens that thing alone. They comment by name, and
// with Edit change it too. Never the owner's agents, files, settings or anything else. What the server and the pages
// share.
import type { Comment } from './comments.ts';
import type { MediaComment } from './media-comments.ts';
import type { MediaKind } from './media.ts';
import type { PageInfo } from './pages.ts';
import type { Agent } from './types.ts';

/** comment: View and comment; edit: change it too (and comment). */
export type ShareRole = 'comment' | 'edit';

/** What each may do, for a project (its documents changed with Edit documents). */
export const SHARE_ROLES: Record<ShareRole, string> = { comment: 'View and comment', edit: 'Edit documents' };

/** What each may do, for one thing shared alone. */
export const THING_ROLES: Record<ShareRole, string> = { comment: 'View and comment', edit: 'Edit' };

/** A thing of the Library shared alone: a page of any kind (a document, slides, a design…), or a picture, video or sound. */
export interface ShareThing {
  kind: 'page' | 'media';
  id: string;
}

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

/** Someone a project, or one thing, is shared with, as the owner sees them. */
export interface ProjectShare {
  id: string;
  /** The project's id ('' when one thing is shared alone). */
  space: string;
  /** The thing shared alone; none: the project. */
  item?: ShareThing;
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

/** A picture, video or sound shared alone, as its link opens it: what can be shown of it (never its file's place, its prompt or session). */
export interface PortalMedia {
  id: string;
  kind: MediaKind;
  title: string;
  description?: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  /** A video's or a sound's length, in seconds. */
  duration?: number;
  /** A sound's shape. */
  peaks?: number[];
  updatedAt: number;
}

/** A picture, video or sound, as a person's link opens it: its comments, and whether its editor opens for them. */
export interface PortalMediaView {
  item: PortalMedia;
  comments: MediaComment[];
  /** With Edit: the picture, video or sound editor opens, and saves over it (it keeps the one before as a version). */
  editable: boolean;
}

/** What a person's link opens. */
export interface PortalView {
  /** The project shared; none when one thing is shared alone (`thing`). */
  project?: { name: string; color: string; description?: string };
  /** One thing shared alone: it opens at once, and nothing else is there. */
  thing?: ShareThing & { title: string };
  /** The name the owner's comments show under. */
  owner: string;
  me: { id: string; name: string; role: ShareRole; expiresAt?: number };
  items: PortalItem[];
  /** A picture, video or sound shared alone. */
  media: PortalMedia[];
  sessions: PortalSession[];
  runs: PortalRun[];
  reading: PortalPaper[];
  /** LaTeX documents can be changed through a link here (TeX runs shut in, by bubblewrap). */
  texEdits: boolean;
}

/** A comment as a person's portal lists it, with where it is: a slide (its number, from 1), a sheet's cell, or a page's words. */
export interface PortalComment extends Comment {
  slide?: number;
  sheet?: string;
  cell?: string;
  /** The words of a page's block it is on. */
  on?: string;
}

/** One document, as a person's portal opens it. */
export interface PortalItemView {
  page: PortalItem;
  /** It opens in its editor (Edit, a kind people may change): `model` is what to edit, or for a page of HTML its `html`. */
  editable: boolean;
  model?: unknown;
  /** Otherwise its own page, to read (shown in the sandboxed frame); a page of HTML's own, to edit too. */
  html?: string;
  /** Its comments (every kind but a notebook), the owner's under their name. */
  comments?: PortalComment[];
  /** A deck's slides, by their titles, and a workbook's sheets, by their names: where a new comment can go. */
  slides?: string[];
  sheets?: { id: string; name: string }[];
}

/** The kinds a person with Edit changes in their editor (LaTeX too where TeX runs shut in); `page`: a page of HTML or a design. */
export const PORTAL_EDITS: (NonNullable<PageInfo['kind']> | 'page')[] = ['doc', 'sheet', 'slides', 'tex', 'diagram', 'page'];

/** The kinds that carry comments (not a notebook); `page`: a page of HTML or a design. */
export const PORTAL_COMMENTS: (NonNullable<PageInfo['kind']> | 'page')[] = ['doc', 'tex', 'slides', 'sheet', 'page'];

/** A page's kind as these lists name it: `page` for a page of HTML. */
export const kindKey = (kind: PageInfo['kind'] | undefined): NonNullable<PageInfo['kind']> | 'page' => kind ?? 'page';

/** A name's first letters, for a person's mark: "Maria Lopez" → "ML". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (s: string) => [...s][0] ?? '';
  return ((parts.length > 1 ? first(parts[0]) + first(parts[parts.length - 1]) : [...(parts[0] ?? '?')].slice(0, 2).join('')) || '?').toUpperCase();
}
