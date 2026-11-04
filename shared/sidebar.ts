// The tools at the bottom of the sidebar (Library, Spaces, Apps, System…) and the order you drag them into, which
// the server keeps for every device (server/sidebar). An order names the tools first to last; any it leaves out
// (one a newer version brings) follow, in their usual order. The groups of projects and folders among the sessions
// keep the order you drag them into too: groups it leaves out (a project made since) come first, newest first.

/**
 * Every tool, in its usual order: the Library, Spaces, Apps and Usage, then System, Settings, Search and Help, four
 * to a row. System holds Files, Git, Terminal, Preview and the computer's monitor (they were tools of their own
 * before 0.19.0). A capability's tool (Library, Spaces, Apps) gives its name with its entry (WebFeature.nav). Orders
 * kept on the server name them, so a name stays when its tool's page or label changes.
 */
export const SIDEBAR_TOOLS = ['pages', 'spaces', 'apps', 'usage', 'system', 'settings', 'search', 'help'] as const;
export type SidebarTool = (typeof SIDEBAR_TOOLS)[number];

/** Tools that moved into System: an order kept from before still names them, and they are passed over. */
export const RETIRED_TOOLS = ['files', 'git', 'terminal', 'preview'];

export const isSidebarTool = (v: unknown): v is SidebarTool => (SIDEBAR_TOOLS as readonly unknown[]).includes(v);

/** Every tool in the order to show: the ones named, first to last (unknown names and repeats skipped), then the rest. */
export function toolOrder(v: unknown): SidebarTool[] {
  const named = [...new Set(Array.isArray(v) ? v.filter(isSidebarTool) : [])];
  return [...named, ...SIDEBAR_TOOLS.filter((t) => !named.includes(t))];
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
