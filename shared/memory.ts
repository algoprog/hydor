// Memory across sessions, as the server keeps it and the pages show it: notes about the user (global),
// about a project (repo: a repository's root, or a folder outside git) and about one session, and the
// user's profile. Agents and the user write notes and the profile; agents start with the profile and the
// notes that bear most on the request. The nightly tidy-up merges near-copies and, where a place's notes
// no longer fit, sums related notes up in topics, and writes a project's short profile.

export type MemoryScope = 'global' | 'repo' | 'session';
export const MEMORY_SCOPES: MemoryScope[] = ['global', 'repo', 'session'];

/**
 * A note; a topic, which sums up related notes (they stay, for recall); or a profile, which agents always get:
 * the user's own (about the user: one at most, kept by agents and the user) or a project's (the tidy-up's).
 */
export type MemoryKind = 'note' | 'topic' | 'profile';

/** How long the user's profile may grow, in words (Settings → Memory): unless changed, what Settings offers, and the most. */
export const PROFILE_WORDS_DEFAULT = 1000;
export const PROFILE_WORDS_CHOICES = [250, 500, 1000, 2000];
export const PROFILE_WORDS_MIN = 50;
export const PROFILE_WORDS_MAX = 5000;

/** A text's words, as the profile's length counts them: runs of letters between spaces, and in Chinese and Japanese each character. */
export const wordCount = (t: string) => (t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? []).length;

/** How many notes about the user and the project agents start with (Settings → Memory), unless changed, and the most. */
export const TOP_K_DEFAULT = 10;
export const TOP_K_MAX = 50;
/** What Settings offers. */
export const TOP_K_CHOICES = [5, 10, 20, 40];

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
  /** The user's profile, when there is one, and how many words it may have. */
  profile: MemoryListEntry | null;
  profileWords: number;
  /** The helper model shortening a profile that is longer than that, or why it could not lately. */
  profileFit?: ProfileFit;
  /** How many notes about the user and the project agents start with: those bearing most on the request, then the latest. */
  topK: number;
  meaning: MeaningState;
  /** The nightly tidy-up is on, and how the latest went. */
  tidyOn: boolean;
  tidy?: TidyReport;
  /** Notes no agent has needed for a long while (suggested for removal in Settings). */
  stale: number;
}

/** A rewrite of the user's profile to fit its words, in the background: running, or why the latest failed. */
export interface ProfileFit {
  running: boolean;
  at: number;
  error?: string;
}

/** An entry as Settings and notes list it, with names for its place and the session that wrote it. */
export interface MemoryListEntry extends MemoryEntry {
  /** "About you", the project's folder name, or the session's title. */
  scopeLabel: string;
  sessionTitle?: string;
}

/** A plain-words name for a scope ("About you", "Project", "This session"). */
export const scopeName = (s: MemoryScope) => (s === 'global' ? 'About you' : s === 'repo' ? 'Project' : 'Session');

/** The user's profile (a profile about the user), as opposed to a project's or a note. */
export const isUserProfile = (e: { scope: MemoryScope; kind?: MemoryKind }) => e.scope === 'global' && e.kind === 'profile';

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
