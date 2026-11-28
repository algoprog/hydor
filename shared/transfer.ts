// Projects between machines (Settings → Machines): a project sent to another machine running Hydor as a copy, moved
// there, or kept in sync with its copy there. What the server and the pages share.
//
// Every Hydor answers for its own projects (the endpoint routes, /api/projects/…): what one would carry, the bundle that
// carries it, where a project arriving would go, making one from a bundle, and the state and changes of a project kept
// in sync. The machine you opened the app on drives the rest (the hub routes, /api/machines/projects/…, which the app
// always asks of this server, whichever machine its page shows): it reads from one machine and writes to the other, its
// own or another of Settings → Machines, and keeps the copies in sync while both are reachable.

/** A machine: '' for this server's own, else the id of a machine in Settings → Machines. */
export type MachineRef = string;

/** How a project goes: a copy there (this one stays), a copy kept in sync with this one, or moved (it leaves here). */
export type SendHow = 'copy' | 'sync' | 'move';

/** The Hydor version that first has these routes: an older machine is asked to update. */
export const TRANSFER_SINCE = '0.120.0';

/** The bundle format's version (its first line: "HYDOR-BUNDLE 1"). */
export const BUNDLE_VERSION = 1;

/**
 * The parts of a project a bundle or a sync carries, each a folder of files: `folder` (its own folder), `also/<n>` (the
 * n-th of its other folders, when they go too), `skills` (its own skills), `wiki` (its wiki memory's folder), `knowledge/<base>`
 * (the files dropped into one of its own knowledge bases) and `media` (its kept pictures, videos and sounds, by id).
 */
export type Area = string;

/** The areas a sync keeps in step. */
export type SyncArea = 'folder' | 'skills' | 'wiki';

/** A folder or file left out, with why: made again by a command (`rebuilt`), a link that leads out, not a file (`special`), a worktree's pointer (`worktree`), a name the other machine cannot have (`name`). */
export interface LeftOut {
  /** Relative to the project's folder, '/' between folders. */
  path: string;
  files: number;
  bytes: number;
  why: 'rebuilt' | 'link' | 'special' | 'worktree' | 'name';
}

/** What a project would carry to another machine (GET /api/projects/:id/carry on the machine it is on). */
export interface CarryPlan {
  project: { id: string; name: string; color: string; folder: string; group?: boolean };
  /** Its folder's files that go, its Git history among them. */
  files: { count: number; bytes: number };
  /** Has a Git history (.git) that goes with it. */
  git: boolean;
  /** What is left out, the largest first (at most 20), and all of it summed up. */
  leftOut: LeftOut[];
  leftOutTotal: { files: number; bytes: number };
  /** The other folders it works with, where they are; `home`: under its machine's home folder (only those can go too). */
  also: { path: string; files: number; bytes: number; home: boolean }[];
  skills: number;
  /** Its memory notes (notes, findings, topics and its profile). */
  notes: number;
  /** Agents of its own. */
  agents: number;
  /** Things kept in it: pages, slides, documents, spreadsheets, notebooks, diagrams, boards, pictures, videos and sounds. */
  kept: number;
  /** Its own documents (knowledge bases): those that go, and the folders they read that cannot go (outside its folder). */
  documents: { count: number; bytes: number; leftOut: string[] };
  /** Its wiki memory, when it has one. */
  wiki: { files: number; bytes: number } | null;
  /** All that goes, every area summed up. */
  total: { files: number; bytes: number };
  /** It is kept in sync with a copy already. */
  sync?: ProjectSyncMark;
}

/** Where a project arriving would go on a machine (GET /api/projects/arrival there). */
export interface ArrivalPlace {
  /** The folder it would get: free (not there yet, or empty). */
  folder: string;
  /** Free space on that disk, in bytes (null when it cannot say). */
  free: number | null;
  home: string;
  platform: string;
  version: string;
  /** Where each of its other folders would go when they go too ('' when that one cannot: its folder there is taken). */
  also?: string[];
}

/** What arrived (POST /api/projects/arrive): the new project and what it holds. */
export interface Arrived {
  project: { id: string; name: string; folder: string };
  files: number;
  bytes: number;
  notes: number;
  skills: number;
  agents: number;
  kept: number;
  documents: number;
  wiki: boolean;
  /** What could not be placed there, in words ("notes.txt: a file of that name differs only in case"). */
  leftOut: string[];
}

/** A project's sending (the hub's), from its start to its end. */
export interface Transfer {
  id: string;
  how: SendHow;
  from: { machine: MachineRef; name: string };
  to: { machine: MachineRef; name: string };
  project: { id: string; name: string };
  state: 'sending' | 'finishing' | 'done' | 'failed' | 'cancelled';
  /** How far it has got (bytes and files of the files carried), of the plan's total. */
  done: { files: number; bytes: number };
  total: { files: number; bytes: number };
  startedAt: number;
  endedAt?: number;
  error?: string;
  /** Once done: the project there, what could not go, and for a move what became of it here. */
  result?: {
    project: string;
    folder: string;
    leftOut: string[];
    /** A move: where its folder went in the Trash of the machine it left (null: it stayed where it was, `kept` says why). */
    trashed?: string | null;
    kept?: string;
    /** A copy kept in sync: the link. */
    link?: string;
  };
}

/** A project kept in sync with its copy on another machine, as each of the two projects has it (Space.sync). */
export interface ProjectSyncMark {
  /** The link's id, on the machine that keeps it. */
  link: string;
  /** The machine that keeps it (its own id, from GET /api/machine, and its name). */
  by: { id: string; name: string };
  /** The other copy: its machine's name as the keeper calls it, its project's id there and its name. */
  peer: { name: string; project: string; projectName: string };
  /** When a round last ended with everything in step. */
  at?: number;
  state: 'ok' | 'syncing' | 'waiting' | 'held' | 'error';
  /** What went wrong, or what holds it (state error, waiting or held), in words. */
  error?: string;
  /** Files changed on both sides that were kept both, the latest first (at most 10): the copy's name and when. */
  conflicts?: { path: string; copy: string; at: number }[];
}

/** One of the links this server keeps (GET /api/machines/projects/links). */
export interface SyncLink {
  id: string;
  /** The project here and its copy there. */
  here: { project: string; name: string };
  there: { machine: string; machineName: string; project: string; name: string };
  createdAt: number;
  state: ProjectSyncMark['state'];
  at?: number;
  error?: string;
  conflicts?: ProjectSyncMark['conflicts'];
  /** A round under way: how far its files have got. */
  progress?: { files: number; bytes: number; total: { files: number; bytes: number } };
}

/** A file of a project kept in sync, as its machine has it: the size and time it was last changed (ms). */
export interface SyncFile {
  area: SyncArea;
  /** Relative to its area, '/' between folders. */
  path: string;
  size: number;
  mtime: number;
  /** Its permission bits (an executable stays one). */
  mode?: number;
}

/** A memory note kept in step: its hash (shared/transfer.ts noteHash on the server) says it is the same note. */
export interface SyncNote {
  hash: string;
  kind: 'note' | 'finding';
  text: string;
  title?: string;
  createdAt: number;
  /** A finding's data (its verdict, evidence…), which a finding cannot be made without. */
  finding?: unknown;
}

/** The details of a project kept in step: last change wins, and when both changed, the keeper's. */
export interface SyncDetails {
  name: string;
  color: string;
  description?: string;
  instructions?: string;
}

/** A project kept in sync as its machine has it now (GET /api/projects/:id/sync/state). */
export interface SyncState {
  details: SyncDetails;
  /** Its files by area; an area that is not there (null, as a wiki with wiki memory off) is left alone. */
  files: Record<SyncArea, SyncFile[] | null>;
  notes: SyncNote[];
  mark: ProjectSyncMark | null;
}
