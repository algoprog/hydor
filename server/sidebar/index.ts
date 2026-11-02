// The order of the tools at the bottom of the sidebar, as you drag them (shared/sidebar.ts): kept here, so every
// device shows the same order, and open pages change at once. Another machine's pages show this server's.
import { SIDEBAR_TOOLS, isSidebarTool, toolOrder, usualOrder, type SidebarTool } from '../../shared/sidebar.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Feature } from '../features/types.ts';

const KEY = 'sidebar.tools';

/** Every tool, first to last. */
export function sidebarTools(db: DB): SidebarTool[] {
  try {
    return toolOrder(JSON.parse(kvGet(db, KEY) ?? '[]'));
  } catch {
    return toolOrder([]);
  }
}

/** Keeps an order; a name it does not know is refused, so a mistyped one is not dropped unseen. */
export function setSidebarTools(db: DB, v: unknown): SidebarTool[] {
  if (!Array.isArray(v)) throw new HttpError(400, `tools: the tools first to last ([] for their usual order): ${SIDEBAR_TOOLS.join(', ')}`);
  const unknown = v.filter((t) => !isSidebarTool(t));
  if (unknown.length) throw new HttpError(400, `Not a tool of the sidebar: ${unknown.map(String).join(', ')}. The tools: ${SIDEBAR_TOOLS.join(', ')}`);
  const tools = toolOrder(v);
  // The usual order is kept as none, so a newer version's usual order shows to whoever never changed it.
  kvSet(db, KEY, JSON.stringify(usualOrder(tools) ? [] : tools));
  return tools;
}

export const sidebar: Feature = {
  id: 'sidebar',
  routes(d) {
    d.app.get('/api/sidebar', async () => ({ tools: sidebarTools(d.db) }));
    d.app.put('/api/sidebar', async (req) => {
      const tools = setSidebarTools(d.db, (req.body as { tools?: unknown } | undefined)?.tools);
      d.broadcast({ t: 'feature', id: 'sidebar', data: { tools } });
      return { tools };
    });
  },
};
