// What a folder is called where the app names it (the sidebar's groups, a session's folder, the folder menus): a
// name you gave it (kept by the server for every device, server/sidebar), else the name of the Codex project it
// belongs to (bootstrap's folderNames), else its own. The folders the Codex app makes for ChatGPT projects are named
// only by an id: without a name they show as "ChatGPT project".
import { create } from 'zustand';
import { folderNameMap, isChatgptProjectFolder } from '@shared/sidebar';
import { put } from './api';
import { basename } from './format';
import { toastError, useApp } from './store';

const KEY = 'wa.sidebar.folderNames';

function saved(): Record<string, string> {
  try {
    return folderNameMap(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return {};
  }
}

/** The names you gave folders (folder → name), here at once and from the server as it says. */
export const useFolderNames = create<{ mine: Record<string, string> }>(() => ({ mine: saved() }));

/** Takes the names the server keeps (on load, and as they change on any device). */
export function keepFolderNames(v: unknown) {
  const mine = folderNameMap(v);
  if (JSON.stringify(mine) === JSON.stringify(useFolderNames.getState().mine)) return;
  useFolderNames.setState({ mine });
  try {
    localStorage.setItem(KEY, JSON.stringify(mine));
  } catch {}
}

/** What the home folder is called where a folder is named (translated, unlike folders' own names). */
export const HOME_FOLDER = 'Home folder';
/** What a folder the Codex app made for a ChatGPT project is called when nothing says the project's name. */
export const CHATGPT_PROJECT = 'ChatGPT project';

const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

export { isChatgptProjectFolder };

/** Every folder that has a name besides its own: Codex projects', then yours over them. */
export function namedFolders(mine = useFolderNames.getState().mine): Record<string, string> {
  return { ...useApp.getState().boot?.folderNames, ...mine };
}

/** The name you gave a folder, or its Codex project's; undefined for neither. */
export function givenName(dir: string): string | undefined {
  const d = trim(dir);
  return useFolderNames.getState().mine[d] ?? useApp.getState().boot?.folderNames?.[d];
}

/** The folder's name as the app shows it ("Home folder" for the home folder). */
export function folderName(cwd: string | undefined, home?: string): string {
  if (!cwd) return '';
  const dir = trim(cwd);
  const given = givenName(dir);
  if (given) return given;
  if (home && dir === trim(home)) return HOME_FOLDER;
  if (isChatgptProjectFolder(dir)) return CHATGPT_PROJECT;
  return basename(dir) || '/';
}

/** Names it would show that the app's dictionaries translate (the rest are folders' own and your names). */
export const translatable = (name: string) => name === HOME_FOLDER || name === CHATGPT_PROJECT;

/** Gives a folder a name of yours ("" for its own back): here at once, on every device a moment later. */
export function renameFolder(dir: string, name: string) {
  const d = trim(dir);
  const n = name.trim();
  const mine = { ...useFolderNames.getState().mine };
  delete mine[d];
  if (n && n !== basename(d)) mine[d] = n;
  keepFolderNames(mine);
  put<{ names: Record<string, string> }>('/api/sidebar/folder-name', { path: d, name: n })
    .then((r) => keepFolderNames(r.names))
    .catch(toastError);
}
