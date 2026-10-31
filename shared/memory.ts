// Memory across sessions, as the server keeps it and the pages show it: notes about the user (global),
// about a project (repo: a repository's root, or a folder outside git) and about one session.

export type MemoryScope = 'global' | 'repo' | 'session';
export const MEMORY_SCOPES: MemoryScope[] = ['global', 'repo', 'session'];

/** Who made a change: the helper model after a turn, an agent with its remember tool, or the user. */
export type MemorySource = 'auto' | 'agent' | 'user';

export interface MemoryEntry {
  id: number;
  scope: MemoryScope;
  /** The folder for "repo", the session's key for "session", empty for "global". */
  scopeKey: string;
  text: string;
  status: 'active' | 'deleted';
  createdAt: number;
  updatedAt: number;
  /** The session, and the reply in it, that wrote it or changed it last. */
  session?: string;
  turn?: string;
  source: MemorySource;
}

/** One step in an entry's life. */
export interface MemoryHistoryRow {
  id: number;
  entry: number;
  at: number;
  action: 'added' | 'updated' | 'deleted' | 'restored';
  before?: string;
  after?: string;
  why?: string;
  session?: string;
  turn?: string;
  source: MemorySource;
}

/** A change a turn made, as the note under its reply shows it. */
export interface MemoryChange {
  entry: number;
  action: 'added' | 'updated' | 'deleted';
  scope: MemoryScope;
  scopeKey: string;
  before?: string;
  after?: string;
  why?: string;
  source: MemorySource;
  /** Undone from the note since. */
  undone?: boolean;
}

/** The data of a note of kind "memory". */
export interface MemoryNoteData {
  changes: MemoryChange[];
}

export interface MemoryState {
  /** Memory at all: agents get it, and it is written. */
  enabled: boolean;
  /** Written by itself after every reply (agents can still save notes with their tool). */
  auto: boolean;
  counts: Record<MemoryScope, number>;
  /** When the latest automatic update failed, why. */
  lastError?: { at: number; message: string };
}

/** An entry as Settings and notes list it, with names for its place and the session that wrote it. */
export interface MemoryListEntry extends MemoryEntry {
  /** "About you", the project's folder name, or the session's title. */
  scopeLabel: string;
  sessionTitle?: string;
}

/** A plain-words name for a scope ("About you", "Project", "This session"). */
export const scopeName = (s: MemoryScope) => (s === 'global' ? 'About you' : s === 'repo' ? 'Project' : 'Session');

/** "2 added, 1 updated": what a note's changes did, the undone ones left out. */
export function changeSummary(changes: MemoryChange[]): string {
  const live = changes.filter((c) => !c.undone);
  const n = (a: MemoryChange['action']) => live.filter((c) => c.action === a).length;
  const parts = [n('added') && `${n('added')} added`, n('updated') && `${n('updated')} updated`, n('deleted') && `${n('deleted')} removed`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'undone';
}
