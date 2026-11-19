// The tools on the rail at the left edge (Browser, Projects, Agents, Apps, then Inbox and Search, and Usage, System…)
// and the order you drag them into, which the server keeps for every device (server/sidebar). An order names the tools
// first to last; any it leaves out (one a newer version brings) take their usual place: right before the next tool
// that comes after them in the usual order, else last. The groups of projects and folders among the sessions
// keep the order you drag them into too: groups it leaves out (a project made since) come first, newest first.
import type { Agent } from './types.ts';

/**
 * Every tool, in its usual order: Browser, Projects, Agents and Apps (the sections, on the rail's upper part, with the
 * Inbox and Search right under them, which stay where they are), then Usage, System, Settings and Help (its lower part); a phone's
 * drawer shows them all in one grid, five to a row. Each group keeps its own order on the rail. System holds Files, Git,
 * Terminal, Preview and the computer's monitor (tools of their own before 0.19.0). Usage was a tab of System from 0.37.0
 * to 0.82.0 and is a tool of its own again. A capability's tool (Projects, Agents, Apps, Browser) gives its name with its
 * entry (WebFeature.nav). Orders kept on the server name them, so a name stays when its tool's page or label changes.
 * Projects had a tool until 0.92 and is one again (its page lists every project; a project's details open in a window
 * over it, or over any page). The Library is gone: what agents keep is a file of its project, in the project's Files.
 */
export const SIDEBAR_TOOLS = ['browser', 'spaces', 'agents', 'apps', 'search', 'usage', 'system', 'settings', 'help'] as const;
export type SidebarTool = (typeof SIDEBAR_TOOLS)[number];

/** The tools that are sections of the app, on the rail's upper part; the rest are its lower part (Search sits under the sections, not among them). */
export const SECTION_TOOLS: readonly SidebarTool[] = ['browser', 'spaces', 'agents', 'apps'];

/** Tools that moved into System, or went away (Files, Git… and the Library, 'pages'): an order kept from before still names them, and they are passed over. */
export const RETIRED_TOOLS = ['files', 'git', 'terminal', 'preview', 'pages'];

export const isSidebarTool = (v: unknown): v is SidebarTool => (SIDEBAR_TOOLS as readonly unknown[]).includes(v);

/**
 * Every tool in the order to show: the ones named, first to last (unknown names and repeats skipped). A tool left out
 * (one a newer version brings, such as Projects for someone who dragged their tools into their own order) takes its
 * usual place: right before the first tool that follows it in the usual order and is in the result, else last. With no
 * order named, that is the usual order.
 */
export function toolOrder(v: unknown): SidebarTool[] {
  const out = [...new Set(Array.isArray(v) ? v.filter(isSidebarTool) : [])];
  SIDEBAR_TOOLS.forEach((t, i) => {
    if (out.includes(t)) return;
    const next = SIDEBAR_TOOLS.slice(i + 1).find((x) => out.includes(x));
    if (next) out.splice(out.indexOf(next), 0, t);
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
