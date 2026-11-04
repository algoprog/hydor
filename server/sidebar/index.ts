// The sidebar's orders, as you drag them (shared/sidebar.ts): the tools at its bottom, and the groups of your projects
// and folders among the sessions. Kept here, so every device shows the same order, and open pages change at once.
// Another machine's pages show this server's.
import { MAX_FOLDER_NAME, MAX_FOLDER_NAMES, RETIRED_TOOLS, SIDEBAR_TOOLS, folderNameMap, isSidebarTool, placeOrder, toolOrder, usualOrder, type SidebarTool } from '../../shared/sidebar.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Feature } from '../features/types.ts';

const KEY = 'sidebar.tools';
const PLACES = 'sidebar.places';
const NAMES = 'sidebar.folderNames';

/** Every tool, first to last. */
export function sidebarTools(db: DB): SidebarTool[] {
  try {
    return toolOrder(JSON.parse(kvGet(db, KEY) ?? '[]'));
  } catch {
    return toolOrder([]);
  }
}

/** Keeps an order; a name it does not know is refused, so a mistyped one is not dropped unseen (those that moved into System are passed over). */
export function setSidebarTools(db: DB, v: unknown): SidebarTool[] {
  if (!Array.isArray(v)) throw new HttpError(400, `tools: the tools first to last ([] for their usual order): ${SIDEBAR_TOOLS.join(', ')}`);
  v = v.filter((t) => !RETIRED_TOOLS.includes(t as string));
  const unknown = (v as unknown[]).filter((t) => !isSidebarTool(t));
  if (unknown.length) throw new HttpError(400, `Not a tool of the sidebar: ${unknown.map(String).join(', ')}. The tools: ${SIDEBAR_TOOLS.join(', ')}`);
  const tools = toolOrder(v as unknown[]);
  // The usual order is kept as none, so a newer version's usual order shows to whoever never changed it.
  kvSet(db, KEY, JSON.stringify(usualOrder(tools) ? [] : tools));
  return tools;
}

/** The groups of projects and folders, first to last, as dragged: "space:<id>" and "dir:<folder>". */
export function sidebarPlaces(db: DB): string[] {
  try {
    return placeOrder(JSON.parse(kvGet(db, PLACES) ?? '[]'));
  } catch {
    return [];
  }
}

/** Keeps the order of the projects' and folders' groups; anything else in the list is refused. */
export function setSidebarPlaces(db: DB, v: unknown): string[] {
  if (!Array.isArray(v)) throw new HttpError(400, 'places: the groups first to last, as "space:<project id>" or "dir:<folder>" ([] for their usual order, newest first)');
  const bad = v.filter((x) => placeOrder([x]).length === 0);
  if (bad.length) throw new HttpError(400, `Not a project or folder group: ${bad.slice(0, 3).map((x) => JSON.stringify(x)).join(', ')}. Give "space:<project id>" or "dir:<folder>"`);
  const places = placeOrder(v);
  kvSet(db, PLACES, JSON.stringify(places));
  return places;
}

/** The names you gave folders (folder → name): the sidebar, the session list and the folder menus show them for the folders' own. */
export function folderNames(db: DB): Record<string, string> {
  try {
    return folderNameMap(JSON.parse(kvGet(db, NAMES) ?? '{}'));
  } catch {
    return {};
  }
}

/** Gives a folder a name of yours, or with an empty name goes back to the folder's own. */
export function setFolderName(db: DB, folder: unknown, name: unknown): Record<string, string> {
  if (typeof folder !== 'string' || !/^\/[^\0\n]*$/.test(folder) || folder.length > 1100) throw new HttpError(400, 'path: the folder, as a full path (/home/you/code/app)');
  if (name !== undefined && name !== null && typeof name !== 'string') throw new HttpError(400, 'name: the name to show for the folder ("" for its own)');
  const n = (name ?? '').trim();
  if (n.length > MAX_FOLDER_NAME) throw new HttpError(400, `name: at most ${MAX_FOLDER_NAME} characters`);
  const dir = folder.length > 1 ? folder.replace(/\/+$/, '') : folder;
  const names = folderNames(db);
  delete names[dir];
  if (n && n !== dir.split('/').pop()) {
    if (Object.keys(names).length >= MAX_FOLDER_NAMES) throw new HttpError(400, `At most ${MAX_FOLDER_NAMES} folders keep a name: give one back its own first`);
    names[dir] = n;
  }
  kvSet(db, NAMES, JSON.stringify(names));
  return names;
}

export const sidebar: Feature = {
  id: 'sidebar',
  routes(d) {
    d.app.get('/api/sidebar', async () => ({ tools: sidebarTools(d.db), places: sidebarPlaces(d.db), names: folderNames(d.db) }));
    d.app.put('/api/sidebar/folder-name', async (req) => {
      const b = (req.body ?? {}) as { path?: unknown; name?: unknown };
      const names = setFolderName(d.db, b.path, b.name);
      d.broadcast({ t: 'feature', id: 'sidebar', data: { names } });
      return { names };
    });
    d.app.put('/api/sidebar', async (req) => {
      const b = (req.body ?? {}) as { tools?: unknown; places?: unknown };
      if (b.tools === undefined && b.places === undefined) throw new HttpError(400, 'Give tools, places or both');
      const tools = b.tools === undefined ? sidebarTools(d.db) : setSidebarTools(d.db, b.tools);
      const places = b.places === undefined ? sidebarPlaces(d.db) : setSidebarPlaces(d.db, b.places);
      d.broadcast({ t: 'feature', id: 'sidebar', data: { tools, places } });
      return { tools, places };
    });
  },
};
