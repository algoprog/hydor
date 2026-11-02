// The sidebar's groups of sessions: Active, Pinned, a group for each space and for each folder you work in, then the
// rest by day (Today, Yesterday, This week, months, years), and Snoozed at the bottom. A space's sessions are in its
// group from the first; a folder needs two sessions for one, and a session in a worktree counts for its main
// checkout. Folders no one picked get no group, so their sessions go by day: the home folder and the default one, and
// what is under the app's own places (task folders, apps' runs, worktrees, the temporary folder: the server's
// autoFolders). With grouping off, or while the list shows one space, the rest all go by day.
import type { SpaceView } from '@shared/spaces';
import type { SessionSummary } from '@shared/types';
import { basename, dayGroup, dirname } from '../../lib/format';

export type GroupKind = 'active' | 'pinned' | 'space' | 'folder' | 'day' | 'snoozed';

export interface SessionGroup {
  /** "active", "pinned", "snoozed", "day:Today", "space:<its id>" or "dir:<the folder>": what a fold is kept by. */
  id: string;
  kind: GroupKind;
  /** Its heading: "Active", "Today", the space's name or the folder's. */
  label: string;
  items: SessionSummary[];
  keys: string[];
  /** A folder group's folder. */
  path?: string;
  space?: SpaceView;
}

/** Sessions a folder needs for a group of its own. */
export const FOLDER_MIN = 2;
/** Rows a space or folder group shows before "Show N more". */
export const GROUP_ROWS = 5;
/** A space or folder group with no session this recent starts folded. */
export const STALE_MS = 7 * 86400_000;
/** Active means recent activity, or a session scheduled to resume after a usage limit. */
export const ACTIVE_MS = 5 * 60_000;
export const lastActivityAt = (s: SessionSummary) => Math.max(s.updatedAt ?? s.createdAt ?? 0, s.doneAt ?? 0, s.live?.startedAt ?? 0, s.live?.turnStartedAt ?? 0, s.external?.since ?? 0);

/** Whether a space or folder group shows folded: as you left it, else when none of its sessions was at work this week. */
export const isFolded = (g: SessionGroup, folds: Record<string, boolean>, now: number) => folds[g.id] ?? now - (g.items[0]?.updatedAt ?? 0) > STALE_MS;

const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/**
 * Whether no one picked a folder: the home folder, the default one, or one under the app's own places (`auto`, from
 * the server; a server too old to say gets the usual ones).
 */
export function unpickedFolders(home?: string, defaultCwd?: string, auto?: string[]): (dir: string) => boolean {
  const own = auto ?? (home ? [`${home}/Naget`, `${home}/naget-apps`, `${home}/.naget-agent`, `${home}/.web-agent`, '/tmp'] : ['/tmp']);
  const roots = own.map(trim);
  const exact = new Set(['/', home, defaultCwd].filter((d): d is string => !!d).map(trim));
  return (dir) => {
    const d = trim(dir);
    return exact.has(d) || roots.some((r) => d === r || d.startsWith(r + '/'));
  };
}

/** The folder a session counts for: its worktree's main checkout, else its own. */
export function workFolder(s: SessionSummary): string | undefined {
  const dir = s.worktree?.repo || s.cwd;
  return dir ? trim(dir) : undefined;
}

const RANK: Record<GroupKind, number> = { active: 0, pinned: 1, space: 2, folder: 2, day: 3, snoozed: 4 };

/**
 * The groups, in order, for sessions listed newest first. Spaces and folders come by their newest session; each
 * keeps its sessions newest first, as days do. Active, Pinned and Snoozed are left in that order for the list to sort.
 */
export function groupSessions(list: SessionSummary[], o: { now: Date; byFolder: boolean; spaces: SpaceView[] | null; unpicked: (dir: string) => boolean }): SessionGroup[] {
  const spaces = new Map((o.spaces ?? []).map((sp) => [sp.id, sp]));
  const spaceOf = (s: SessionSummary) => (typeof s.extra?.space === 'string' ? spaces.get(s.extra.space) : undefined);
  const folderOf = (s: SessionSummary) => {
    const dir = workFolder(s);
    return dir && !o.unpicked(dir) ? dir : undefined;
  };
  // How many listed sessions work in each folder, whichever group they show in now: a folder's group stays while
  // one of its two sessions is active or pinned.
  const inFolder = new Map<string, number>();
  if (o.byFolder) {
    for (const s of list) {
      const dir = spaceOf(s) ? undefined : folderOf(s);
      if (dir) inFolder.set(dir, (inFolder.get(dir) ?? 0) + 1);
    }
  }
  const out = new Map<string, SessionGroup>();
  const put = (s: SessionSummary, id: string, kind: GroupKind, label: string, more?: Pick<SessionGroup, 'path' | 'space'>) => {
    let g = out.get(id);
    if (!g) out.set(id, (g = { id, kind, label, items: [], keys: [], ...more }));
    g.items.push(s);
  };
  const t = o.now.getTime();
  for (const s of list) {
    const space = o.byFolder ? spaceOf(s) : undefined;
    const dir = o.byFolder && !space ? folderOf(s) : undefined;
    // Snoozed ones wait at the bottom until their time (or until they need you).
    if (s.snoozedUntil && s.snoozedUntil > t) put(s, 'snoozed', 'snoozed', 'Snoozed');
    else if (s.resumeAt != null || lastActivityAt(s) > t - ACTIVE_MS) put(s, 'active', 'active', 'Active');
    else if (s.pinned) put(s, 'pinned', 'pinned', 'Pinned');
    else if (space) put(s, `space:${space.id}`, 'space', space.name, { space });
    else if (dir && (inFolder.get(dir) ?? 0) >= FOLDER_MIN) put(s, `dir:${dir}`, 'folder', basename(dir) || dir, { path: dir });
    else {
      const day = dayGroup(s.updatedAt, o.now);
      put(s, `day:${day}`, 'day', day);
    }
  }
  const groups = [...out.values()];
  // Two folders of the same name are told apart by the folder each is in ("client/app", "server/app").
  const folders = groups.filter((g) => g.kind === 'folder');
  const named = new Map<string, number>();
  for (const g of folders) named.set(g.label, (named.get(g.label) ?? 0) + 1);
  for (const g of folders) if (named.get(g.label)! > 1) g.label = `${basename(dirname(g.path!)).replace(/^\/$/, '')}/${g.label}`;
  return groups.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}
