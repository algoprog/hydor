// The tools at the bottom of the sidebar (Files, Git, Terminal…) and the order you drag them into, which the
// server keeps for every device (server/sidebar). An order names the tools first to last; any it leaves out
// (one a newer version brings) follow, in their usual order.

/**
 * Every tool, in its usual order. A capability's tool (Pages, Spaces, Apps) gives its name with its entry
 * (WebFeature.nav). Orders kept on the server name them, so a name stays when its tool's page or label changes.
 */
export const SIDEBAR_TOOLS = ['files', 'git', 'terminal', 'pages', 'spaces', 'apps', 'preview', 'usage', 'system', 'settings', 'search', 'help'] as const;
export type SidebarTool = (typeof SIDEBAR_TOOLS)[number];

export const isSidebarTool = (v: unknown): v is SidebarTool => (SIDEBAR_TOOLS as readonly unknown[]).includes(v);

/** Every tool in the order to show: the ones named, first to last (unknown names and repeats skipped), then the rest. */
export function toolOrder(v: unknown): SidebarTool[] {
  const named = [...new Set(Array.isArray(v) ? v.filter(isSidebarTool) : [])];
  return [...named, ...SIDEBAR_TOOLS.filter((t) => !named.includes(t))];
}

/** The order is the usual one. */
export const usualOrder = (tools: readonly string[]) => tools.join() === SIDEBAR_TOOLS.join();
