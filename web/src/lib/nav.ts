import { navigate } from 'wouter/use-browser-location';
import { create } from 'zustand';
import { crossFade } from './motion';
import { machineBase, machineId, splitMachinePath } from './machine';
import { useUI } from './store';

/** Moves to a page of the machine this page shows. */
export function go(path: string, replace = false) {
  const to = machineBase + path;
  // Pages cross-fade (Motion: Full), but not to or from the Browser (its page is a window of its own, which cannot be
  // part of the picture), not for a change inside a page (its query or its # only), and not where code goes on at once
  // from the new address (a section's # to scroll to, a redirect that replaces the page).
  const here = location.pathname;
  const target = to.split(/[?#]/)[0];
  const page = (p: string) => p.slice(machineBase.length).split('/')[1] ?? '';
  if (replace || to.includes('#') || target === here || page(target) === 'browser' || page(here) === 'browser') return navigate(to, { replace });
  crossFade('page', () => navigate(to, { replace }));
}

/**
 * Follows a link to one of the app's own pages (the guide's, an agent's): `/settings?s=memory`, or
 * `/guide/projects#make-a-project`, whose section the page then scrolls to (it hears `hydor:hash`).
 */
export function goApp(href: string) {
  go(href);
  window.dispatchEvent(new Event('hydor:hash'));
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

/**
 * The file shown in a dialog over the page (features/files/FilePeek), if any: a folder too (`dir` when it is known to be
 * one; `sel`, the item picked in it), and a file opened from a folder there (`from`) has a way back to it. `leave` closes
 * it the way its own close does (asking first about changes not saved) and says whether it did: what goes elsewhere from
 * the dialog awaits it.
 */
export const useFilePeek = create<{ file: { path: string; line?: number; dir?: boolean; sel?: string; from?: string } | null; leave?: () => Promise<boolean> }>(() => ({ file: null }));

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
