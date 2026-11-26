// The tools on the rail at the left edge (Browser, Projects, Files, Agents, Apps, Git, Experiments, then Inbox and
// Search, and Usage, System…)
// and the order you drag them into, which the server keeps for every device (server/sidebar). An order names the tools
// first to last; any it leaves out (one a newer version brings) take their usual place: right before the next tool
// that comes after them in the usual order, else last. The groups of projects and folders among the sessions
// keep the order you drag them into too: groups it leaves out (a project made since) come first, newest first.
import type { Agent } from './types.ts';

/**
 * Every tool, in its usual order: Browser, Projects, Files, Agents, Apps, Git and Experiments (the sections, on the rail's
 * upper part, with the Inbox and Search right under them, which stay where they are), then Usage, System, Settings and
 * Help (its lower part); a phone's drawer shows them all in one grid, six to a row. Each group keeps its own order on
 * the rail. Files and Git were tools of their own before 0.19.0, then tabs of System with Terminal, Preview and the
 * computer's monitor, and Experiments a tab of System since it came; all three are sections of their own again: Files
 * beside Projects, whose files it shows, Git and Experiments after Apps. Usage was a tab of System from 0.37.0 to 0.82.0
 * and is a tool of its own again. A capability's tool (Projects, Agents, Apps, Browser, Experiments) gives its name with
 * its entry (WebFeature.nav). Orders kept on the server name them, so a name stays when its tool's page or label
 * changes. Projects had a tool until 0.92 and is one again (its page lists every project; a project's details open in
 * a window over it, or over any page). The Library is gone: what agents keep is a file of its project, in the
 * project's Files.
 */
export const SIDEBAR_TOOLS = ['browser', 'spaces', 'files', 'agents', 'apps', 'git', 'experiments', 'search', 'usage', 'system', 'settings', 'help'] as const;
export type SidebarTool = (typeof SIDEBAR_TOOLS)[number];

/** The tools that are sections of the app, on the rail's upper part; the rest are its lower part (Search sits under the sections, not among them). */
export const SECTION_TOOLS: readonly SidebarTool[] = ['browser', 'spaces', 'files', 'agents', 'apps', 'git', 'experiments'];

/** Tools that moved into System, or went away (Terminal, Preview and the Library, 'pages'): an order kept from before still names them, and they are passed over. */
export const RETIRED_TOOLS = ['terminal', 'preview', 'pages'];

export const isSidebarTool = (v: unknown): v is SidebarTool => (SIDEBAR_TOOLS as readonly unknown[]).includes(v);

/**
 * Every tool in the order to show: the ones named, first to last (unknown names and repeats skipped). A tool left out
 * (one a newer version brings, such as Files, Git and Experiments for someone who dragged their tools into their own
 * order) takes its usual place among its own group (the sections, or the rest): right before the first tool of its
 * group that follows it in the usual order and is in the result, else right after the last one before it (Git after
 * Apps), else before the first tool of any group that follows it, else last. Its group counts, as a phone's drawer
 * puts every tool in one grid, where a tool below the gap may be dragged before the sections. With no order named,
 * that is the usual order.
 */
export function toolOrder(v: unknown): SidebarTool[] {
  const out = [...new Set(Array.isArray(v) ? v.filter(isSidebarTool) : [])];
  SIDEBAR_TOOLS.forEach((t, i) => {
    if (out.includes(t)) return;
    const mine = (x: SidebarTool) => SECTION_TOOLS.includes(x) === SECTION_TOOLS.includes(t) && out.includes(x);
    const next = SIDEBAR_TOOLS.slice(i + 1).find(mine);
    if (next) return void out.splice(out.indexOf(next), 0, t);
    const before = SIDEBAR_TOOLS.slice(0, i).reverse().find(mine);
    if (before) return void out.splice(out.indexOf(before) + 1, 0, t);
    const any = SIDEBAR_TOOLS.slice(i + 1).find((x) => out.includes(x));
    if (any) out.splice(out.indexOf(any), 0, t);
    else out.push(t);
  });
  return out;
}

/** The order is the usual one. */
export const usualOrder = (tools: readonly string[]) => tools.join() === SIDEBAR_TOOLS.join();

/** At most this many project and folder groups keep a place (the first ones). */
export const MAX_PLACES = 400;

/** A project's group ("space:<its id>") or a folder's ("dir:<the folder>"). */
export const isPlaceId = (v: unknown): v is string => typeof v === 'string' && v.length <= 1100 && (/^space:[\w-]{1,80}$/.test(v) || /^dir:\/[^\0\n]*$/.test(v));

/** The groups of projects and folders in the order to show, first to last: names that are not one skipped, and repeats. */
export function placeOrder(v: unknown): string[] {
  return [...new Set(Array.isArray(v) ? v.filter(isPlaceId) : [])].slice(0, MAX_PLACES);
}

/** A name you gave a folder is at most this long; at most this many folders keep one. */
export const MAX_FOLDER_NAME = 80;
export const MAX_FOLDER_NAMES = 400;

/** Names you gave folders (folder → name), as kept: absolute folders without a trailing slash, names trimmed and not empty. */
export function folderNameMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const dir = k.length > 1 ? k.replace(/\/+$/, '') : k;
    const name = typeof n === 'string' ? n.trim().slice(0, MAX_FOLDER_NAME) : '';
    if (name && /^\/[^\0\n]*$/.test(dir) && dir.length <= 1100 && Object.keys(out).length < MAX_FOLDER_NAMES) out[dir] = name;
  }
  return out;
}

/** A folder the Codex app made for one of your ChatGPT projects (~/.codex/.chatgpt-projects/g-p-…): named only by an id. */
export const isChatgptProjectFolder = (dir: string) => /\/\.chatgpt-projects\/[^/]+\/*$/.test(dir);

/**
 * Where the sessions of a folder whose work began outside Hydor came from (bootstrap's folderOrigins): one agent's,
 * in one account, to an entry, the most sessions first.
 */
export interface FolderOrigin {
  agent: Agent;
  /** The account added in Settings → Accounts whose history they are in; none for the agent's own sign-in. */
  account?: string;
  /** The apps they were started in, as the agent wrote them down (Claude Code's entrypoint, Codex's source: "claude-vscode", "cli"…), the most sessions first. */
  sources: string[];
  sessions: number;
}

/** A folder you made for sessions in the sidebar: at the top level, or inside one project (`space`, its id). */
export interface SessionFolder {
  id: string;
  name: string;
  space?: string;
  createdAt: number;
}

/** At most this many session folders; a name is cut at this many characters. */
export const MAX_SESSION_FOLDERS = 200;
export const MAX_SESSION_FOLDER_NAME = 60;

/** The folders as kept: well-formed ones only (an id, a name), repeats of an id dropped, at most MAX_SESSION_FOLDERS. */
export function sessionFolderList(v: unknown): SessionFolder[] {
  const out: SessionFolder[] = [];
  if (!Array.isArray(v)) return out;
  const seen = new Set<string>();
  for (const x of v) {
    if (out.length >= MAX_SESSION_FOLDERS) break;
    if (!x || typeof x !== 'object') continue;
    const f = x as Record<string, unknown>;
    if (typeof f.id !== 'string' || !/^sf[\w-]{4,40}$/.test(f.id) || seen.has(f.id)) continue;
    const name = typeof f.name === 'string' ? f.name.trim().slice(0, MAX_SESSION_FOLDER_NAME).trim() : '';
    if (!name) continue;
    seen.add(f.id);
    out.push({ id: f.id, name, ...(typeof f.space === 'string' && f.space ? { space: f.space } : {}), createdAt: typeof f.createdAt === 'number' && Number.isFinite(f.createdAt) ? f.createdAt : 0 });
  }
  return out;
}
