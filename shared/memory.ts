// Memory across sessions, as the server keeps it and the pages show it: notes about the user (global),
// about a project (repo: a repository's root, or a folder outside git) and about one session. Agents and
// the user write notes; the nightly tidy-up merges near-copies and, where a place's notes no longer fit
// what agents get, sums related notes up in topics and writes a short profile agents always get.

export type MemoryScope = 'global' | 'repo' | 'session';
export const MEMORY_SCOPES: MemoryScope[] = ['global', 'repo', 'session'];

/** A note; a topic, which sums up related notes (they stay, for recall); or a place's profile, which agents always get. */
export type MemoryKind = 'note' | 'topic' | 'profile';

/** Who made a change: the helper model (the nightly tidy-up, or an expiry), an agent with its tools, or the user. */
export type MemorySource = 'auto' | 'agent' | 'user';

export interface MemoryEntry {
  id: number;
  scope: MemoryScope;
  /** The folder for "repo", the session's key for "session", empty for "global". */
  scopeKey: string;
  kind: MemoryKind;
  text: string;
  status: 'active' | 'deleted';
  createdAt: number;
  updatedAt: number;
  /** When it stops being true: from then on agents no longer get it, and it is deleted. */
  expiresAt?: number;
  /** When an agent last got it as bearing on what it was doing, or found it with recall; and how often. */
  usedAt?: number;
  uses: number;
  /** A topic's or a profile's: how many notes it sums up. */
  covers?: number;
  /** The session, and the reply in it, that wrote it or changed it last. */
  session?: string;
  turn?: string;
  source: MemorySource;
}

/** One step in an entry's life. "expiry": its end date was set (`after` holds it as a date) or taken away. */
export interface MemoryHistoryRow {
  id: number;
  entry: number;
  at: number;
  action: 'added' | 'updated' | 'deleted' | 'restored' | 'expiry';
  before?: string;
  after?: string;
  why?: string;
  session?: string;
  turn?: string;
  source: MemorySource;
}

/** A change a turn or a tidy-up made, as the note under a reply and Settings show it. */
export interface MemoryChange {
  entry: number;
  action: 'added' | 'updated' | 'deleted' | 'expiry';
  scope: MemoryScope;
  scopeKey: string;
  kind?: MemoryKind;
  before?: string;
  after?: string;
  /** For "expiry": the end date set (none: taken away), and the one before. */
  expiresAt?: number;
  expiredBefore?: number;
  why?: string;
  source: MemorySource;
  /** Undone since. */
  undone?: boolean;
}

/** The data of a note of kind "memory". */
export interface MemoryNoteData {
  changes: MemoryChange[];
}

/** Search by meaning: notes and queries as vectors from an embedding model that runs on this computer. */
export interface MeaningState {
  /** Turned on in Settings. */
  on: boolean;
  /** off: not turned on; setting-up: installing its Python libraries; starting: loading the model (the first time, downloading it); ready; failed. */
  status: 'off' | 'setting-up' | 'starting' | 'ready' | 'failed';
  /** Progress while setting up, or why it failed. */
  detail?: string;
  model: string;
  /** Where it may run: the best place (a GPU with room, else the CPU), or the CPU only. */
  where: 'auto' | 'cpu';
  /** Where it runs ("NVIDIA GeForce RTX 4090", "CPU"). */
  device?: string;
  /** Active notes with a vector, of all of them. */
  embedded: number;
  total: number;
}

/** The latest tidy-up: what it changed (each can be undone), or why it stopped. */
export interface TidyReport {
  at: number;
  running?: boolean;
  /** The latest tidy-up's changes; when it found nothing to change, those of the one before that did. */
  changes: MemoryChange[];
  /** When those earlier changes were made. */
  changesAt?: number;
  /** Notes looked at, and places summed up. */
  checked: number;
  error?: string;
}

export interface MemoryState {
  /** Memory at all: agents get it, and can write it. */
  enabled: boolean;
  counts: Record<MemoryScope, number>;
  meaning: MeaningState;
  /** The nightly tidy-up is on, and how the latest went. */
  tidyOn: boolean;
  tidy?: TidyReport;
  /** Notes no agent has needed for a long while (suggested for removal in Settings). */
  stale: number;
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
  const parts = [
    n('added') && `${n('added')} added`,
    n('updated') && `${n('updated')} updated`,
    n('deleted') && `${n('deleted')} removed`,
    n('expiry') && `${n('expiry')} given an end date`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'undone';
}
