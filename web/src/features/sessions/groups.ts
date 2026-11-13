// The sidebar's groups of sessions: Active, Pinned, a group for each space and for each folder you work in, then the
// rest by day (Today, Yesterday, This week, months, years), and Snoozed at the bottom. Spaces' and folders' groups
// come by their newest session, or in the order you dragged them into (any you never moved first). A space's
// sessions are in its group from the first; a folder needs two sessions for one, and a session in a worktree counts
// for its main checkout. Folders no one picked get no group, so their sessions go by day: the home folder and the default one, and
// what is under the app's own places (task folders, apps' runs, worktrees, the temporary folder: the server's
// autoFolders). With grouping off, or while the list shows one space, the rest all go by day. A folder whose work began
// outside Hydor (its first session came from VS Code, a terminal, Claude's or Codex's own app) says where its sessions
// came from, as a found project's group does.
import { isChatgptProjectFolder, type FolderOrigin } from '@shared/sidebar';
import type { SpaceView } from '@shared/spaces';
import type { SessionSummary } from '@shared/types';
import { basename, dayGroup, dirname, inside, isWinPath, joinPath, pathParts, sepOf } from '../../lib/format';
import { folderSources, fromOrigins, type FolderSource } from '../../lib/origin';

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
  /** A folder group whose first session was started outside Hydor: where its sessions came from (Claude Code, Codex; the apps). */
  from?: FolderSource[];
}

/** Sessions a folder needs for a group of its own. */
export const FOLDER_MIN = 2;
/** Rows a space or folder group shows before "Show N more". */
export const GROUP_ROWS = 5;
/** A space or folder group with no session this recent starts folded. */
export const STALE_MS = 7 * 86400_000;
/** Active means recent activity, background tasks (agents, commands, monitors) still running, or a session scheduled to resume after a usage limit. */
export const ACTIVE_MS = 5 * 60_000;
/**
 * Background tasks or subagents still run: the agent picks up again when they finish, though its transcript may be
 * quiet meanwhile. A Hydor subagent's end changes its parent's summary too, which groups the list again.
 */
export const hasBackgroundWork = (s: SessionSummary) =>
  !!(s.live && s.live.status !== 'exited' && s.live.status !== 'error' && s.live.backgroundTasks?.length) || !!s.external?.backgroundTasks?.length || !!s.helpers;
export const lastActivityAt = (s: SessionSummary) => Math.max(s.updatedAt ?? s.createdAt ?? 0, s.doneAt ?? 0, s.live?.startedAt ?? 0, s.live?.turnStartedAt ?? 0, s.external?.since ?? 0);

/** Whether a space or folder group shows folded: as you left it, else when none of its sessions was at work this week. */
export const isFolded = (g: SessionGroup, folds: Record<string, boolean>, now: number) => folds[g.id] ?? now - (g.items[0]?.updatedAt ?? 0) > STALE_MS;

const trim = (p: string) => (p.length > 1 && !/^[A-Za-z]:[\\/]$/.test(p) ? p.replace(isWinPath(p) ? /[\\/]+$/ : /\/+$/, '') : p);

/**
 * Whether no one picked a folder: the home folder, the default one, or one under the app's own places (`auto`, from
 * the server; a server too old to say gets the usual ones).
 */
export function unpickedFolders(home?: string, defaultCwd?: string, auto?: string[]): (dir: string) => boolean {
  const own = auto ?? (home ? [...['Hydor', 'hydor-apps', '.hydor', 'Naget', 'naget-apps', '.naget-agent', '.web-agent'].map((n) => joinPath(home, n)), '/tmp'] : ['/tmp']);
  const roots = own.map(trim);
  const exact = new Set(['/', home, defaultCwd].filter((d): d is string => !!d).map(trim));
  return (dir) => {
    const d = trim(dir);
    return exact.has(d) || roots.some((r) => inside(d, r)) || isChatgptProjectFolder(d);
  };
}


/**
 * Labels for folders' groups: a folder's own name (`names` gives some another, such as a Codex project's), and two
 * folders of the same name told apart by as many of the folders they are in as it takes ("client/app", "server/app").
 */
export function folderLabels(dirs: string[], names: Record<string, string> = {}): Map<string, string> {
  const label = (d: string, depth: number) => {
    if (names[d]) return names[d];
    const p = pathParts(d);
    const sep = sepOf(d);
    // A folder at the top shows whole once it needs telling apart ("/app", "C:\app").
    return depth > 1 && depth >= p.length ? (isWinPath(d) ? d : `/${p.join('/')}`) : p.slice(-depth).join(sep) || d;
  };
  const out = new Map(dirs.map((d) => [d, label(d, 1)]));
  for (let depth = 2; depth <= 8; depth++) {
    const seen = new Map<string, number>();
    for (const l of out.values()) seen.set(l, (seen.get(l) ?? 0) + 1);
    const clash = dirs.filter((d) => !names[d] && seen.get(out.get(d)!)! > 1);
    if (!clash.length) break;
    for (const d of clash) out.set(d, label(d, depth));
  }
  return out;
}

/** The folder a session counts for: its worktree's main checkout, else its own. */
export function workFolder(s: SessionSummary): string | undefined {
  const dir = s.worktree?.repo || s.cwd;
  return dir ? trim(dir) : undefined;
}

const RANK: Record<GroupKind, number> = { active: 0, pinned: 1, space: 2, folder: 2, day: 3, snoozed: 4 };

/** A space's or a folder's group, which goes under Projects and keeps the place you drag it to. */
export const isPlaceKind = (kind: GroupKind) => kind === 'space' || kind === 'folder';

/**
 * The groups, in order, for sessions listed newest first. Spaces and folders come by their newest session, unless
 * `places` (their ids, as dragged: "space:<id>", "dir:<folder>") gives them a place: those come after the ones it
 * does not name, in its order. Each keeps its sessions newest first, as days do. Active, Pinned and Snoozed are left
 * in that order for the list to sort.
 */
export function groupSessions(
  list: SessionSummary[],
  o: {
    now: Date;
    byFolder: boolean;
    spaces: SpaceView[] | null;
    unpicked: (dir: string) => boolean;
    places?: readonly string[];
    names?: Record<string, string>;
    /** Where each folder's work began, as the server knows it (bootstrap's folderOrigins); a folder it leaves out goes by the sessions listed. */
    origins?: Record<string, FolderOrigin[]>;
  },
): SessionGroup[] {
  const spaces = new Map((o.spaces ?? []).map((sp) => [sp.id, sp]));
  const spaceOf = (s: SessionSummary) => (typeof s.extra?.space === 'string' ? spaces.get(s.extra.space) : undefined);
  const folderOf = (s: SessionSummary) => {
    const dir = workFolder(s);
    return dir && (o.names?.[dir] || !o.unpicked(dir)) ? dir : undefined;
  };
  // The listed sessions that work in each folder, whichever group they show in now: a folder's group stays while
  // one of its two sessions is active or pinned, and the first of them says where its work began when the server did not.
  const inFolder = new Map<string, SessionSummary[]>();
  if (o.byFolder) {
    for (const s of list) {
      const dir = spaceOf(s) ? undefined : folderOf(s);
      if (!dir) continue;
      const l = inFolder.get(dir);
      if (l) l.push(s);
      else inFolder.set(dir, [s]);
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
    else if (s.resumeAt != null || hasBackgroundWork(s) || lastActivityAt(s) > t - ACTIVE_MS) put(s, 'active', 'active', 'Active');
    else if (s.pinned) put(s, 'pinned', 'pinned', 'Pinned');
    else if (space) put(s, `space:${space.id}`, 'space', space.name, { space });
    else if (dir && (inFolder.get(dir)?.length ?? 0) >= FOLDER_MIN) put(s, `dir:${dir}`, 'folder', basename(dir) || dir, { path: dir });
    else {
      const day = dayGroup(s.updatedAt, o.now);
      put(s, `day:${day}`, 'day', day);
    }
  }
  const groups = [...out.values()];
  const folders = groups.filter((g) => g.kind === 'folder');
  const labels = folderLabels(folders.map((g) => g.path!), o.names);
  for (const g of folders) {
    g.label = labels.get(g.path!) ?? g.label;
    const known = o.origins?.[g.path!];
    g.from = known ? fromOrigins(known) : folderSources(inFolder.get(g.path!) ?? g.items);
  }
  // A found project's group: where its sessions came from, else the programs the app found it for.
  for (const g of groups) {
    if (g.kind === 'space' && g.space?.found?.length) {
      const known = o.origins?.[g.space.folder];
      g.from = (known ? fromOrigins(known) : undefined) ?? folderSources(g.items) ?? g.space.found.map((agent) => ({ agent, apps: [], sessions: 0 }));
    }
  }
  const placed = new Map((o.places ?? []).map((id, i) => [id, i]));
  const at = (g: SessionGroup) => (isPlaceKind(g.kind) ? (placed.get(g.id) ?? -1) : 0);
  return groups.sort((a, b) => RANK[a.kind] - RANK[b.kind] || at(a) - at(b));
}
