import { navigate } from 'wouter/use-browser-location';
import { create } from 'zustand';
import { machineBase, machineId, splitMachinePath } from './machine';
import { useUI } from './store';

/** Moves to a page of the machine this page shows. */
export function go(path: string, replace = false) {
  navigate(machineBase + path, { replace });
}

/**
 * Follows a link to one of the app's own pages (the guide's, an agent's): `/settings?s=memory`, or
 * `/guide/spaces#make-a-project`, whose section the page then scrolls to (it hears `naget:hash`).
 */
export function goApp(href: string) {
  go(href);
  window.dispatchEvent(new Event('naget:hash'));
}

/** Opens a page by its full path (as notifications carry it): another machine's pages load afresh. */
export function goFull(path: string) {
  const t = splitMachinePath(path);
  if (t.id === machineId) go(t.path);
  else location.href = path;
}

export function sessionPath(key: string) {
  return `/s/${encodeURIComponent(key)}`;
}

export function openSession(key: string) {
  go(sessionPath(key));
}

export function filePath(path: string, line?: number) {
  return `/file?path=${encodeURIComponent(path)}${line ? `&line=${line}` : ''}`;
}

/** The file shown in a dialog over the page (features/files/FilePeek), if any. */
export const useFilePeek = create<{ file: { path: string; line?: number } | null }>(() => ({ file: null }));

/** Opens a file. From a session it shows in a dialog over the conversation, which stays where it was; elsewhere on the Files page. */
export function openFile(path: string, line?: number) {
  if (location.pathname.slice(machineBase.length).startsWith('/s/')) useFilePeek.setState({ file: { path, line } });
  else showInFiles(path, line);
}

/** Opens a file on the Files page, among its tabs. */
export function showInFiles(path: string, line?: number) {
  useUI.getState().openTab({ id: `f:${path}`, kind: 'file', ref: path });
  go(filePath(path, line));
}
