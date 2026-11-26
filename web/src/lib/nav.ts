import { navigate } from 'wouter/use-browser-location';
import { create } from 'zustand';
import { crossFade } from './motion';
import { machineBase, machineId, splitMachinePath } from './machine';
import { useUI } from './store';

/** The tabs of a project's details (its page or its window), and the parts of its Memory tab. */
export type ProjectTab = 'overview' | 'files' | 'memory' | 'skills' | 'agents' | 'settings';
export type ProjectPart = 'all' | 'notes' | 'wiki' | 'documents' | 'findings';

/**
 * The project whose details show in a window over the page (features/spaces/ProjectDialog, held by the shell), if any
 * (in the Projects section a project has its own page instead, `/projects/<id>`: see openProject):
 * the tab it opened on, the chip of its Memory (none: All), whether it opened to share it. `n` counts the openings, so one opened
 * again (on another tab, say) starts afresh.
 */
export const useProjectWindow = create<{ at: { id: string; tab: ProjectTab; part?: ProjectPart; share?: boolean; dir?: string; n: number; req: number } | null }>(() => ({ at: null }));

/** Windows opened so far (each a fresh one: `n`), and every ask to show one (`req`: a tab asked for again shows). */
let opens = 0;
let asks = 0;

type ProjectOpts = { part?: ProjectPart; share?: boolean; dir?: string };

/** The page shown now, without the machine's part of the address. */
const here = () => location.pathname.slice(machineBase.length);

/** The Projects section is on screen: its list (`/projects`) or a project's own page (`/projects/<id>…`). */
const inProjects = () => /^\/projects(\/|$)/.test(here());

/** The address of a project's own page, on a tab (Overview if none), with the Memory chip, the Share dialog or the Files folder asked for. */
export function projectHref(id: string, tab: ProjectTab = 'overview', opts?: ProjectOpts) {
  const q = new URLSearchParams();
  if (tab === 'memory' && opts?.part && opts.part !== 'all') q.set('part', opts.part);
  if (opts?.share) q.set('share', '1');
  if (tab === 'files' && opts?.dir) q.set('dir', opts.dir);
  const s = q.toString();
  return `/projects/${encodeURIComponent(id)}${tab === 'overview' ? '' : `/${tab}`}${s ? `?${s}` : ''}`;
}

/** Opens a project's window over the page that is open (asked for the Files of the project already open there, it stays as it is and only `dir` changes). */
function openWindow(id: string, tab: ProjectTab, opts?: ProjectOpts) {
  useProjectWindow.setState((s) => {
    const same = s.at?.id === id && tab === 'files' && s.at.tab === 'files';
    return { at: { id, tab, part: opts?.part, share: opts?.share, dir: opts?.dir, n: same && s.at ? s.at.n : ++opens, req: ++asks } };
  });
}

/**
 * Opens a project's details on a tab (Overview if none). `dir`: the folder its Files tab shows. In the Projects section
 * (its list, or a project's page) they are the project's own page in the workspace, with the way back to all projects;
 * anywhere else (a session, the sidebar beside it) a window over the page that is open, which stays.
 */
export function openProject(id: string, tab: ProjectTab = 'overview', opts?: ProjectOpts) {
  if (!inProjects()) return openWindow(id, tab, opts);
  const to = projectHref(id, tab, opts);
  // Another tab or folder of the project on screen changes the page in place (the browser's Back steps back to it).
  if (projectAddress(here())?.id === id) return navigate(machineBase + to);
  go(to);
}

/** Closes the project's window; on a project's own page (where there is none), goes back to all projects. */
export function closeProject() {
  if (useProjectWindow.getState().at) useProjectWindow.setState({ at: null });
  else if (projectAddress(here())?.id) go('/projects');
}

const PROJECT_TABS = ['overview', 'files', 'memory', 'skills', 'agents', 'settings'];

/**
 * What an address of a project's page (`/projects/<id>[/<tab>][?part=…&share=1&dir=…]`) means: the project and the tab
 * it shows, or no id for the Projects page (`/projects`). Null for any other address. The Library tab is Files now, and
 * the old Knowledge and LLM Wiki tabs are parts of Memory.
 */
export function projectAddress(path: string): { id?: string; tab: ProjectTab; part?: ProjectPart; share?: boolean; dir?: string } | null {
  const m = /^\/projects(?:\/([^/?#]+)(?:\/([^/?#]+))?)?\/?(?:\?([^#]*))?(?:#.*)?$/.exec(path);
  if (!m) return null;
  if (!m[1]) return { tab: 'overview' };
  // An address that does not decode names no project (a typo, a cut-off link).
  let id: string;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const q = new URLSearchParams(m[3] ?? '');
  const t = m[2] === 'library' ? 'files' : m[2];
  let part: ProjectPart | undefined;
  if (t === 'knowledge') part = 'documents';
  else if (t === 'wiki') part = 'wiki';
  else if (t === 'memory') part = ['notes', 'wiki', 'documents', 'findings'].includes(q.get('part') ?? '') ? (q.get('part') as ProjectPart) : undefined;
  const tab: ProjectTab = t === 'knowledge' || t === 'wiki' ? 'memory' : PROJECT_TABS.includes(t ?? '') ? (t as ProjectTab) : 'overview';
  return { id, tab, part, share: q.get('share') === '1' || undefined, dir: q.get('dir') || undefined };
}

/**
 * Moves to a page of the machine this page shows. A project's address (`/projects/<id>…`) is its own page in the
 * Projects section; from anywhere else it opens the project's window over the page instead (the page stays).
 */
export function go(path: string, replace = false) {
  const project = projectAddress(path);
  if (project?.id) {
    // An old address of a page (the Library's, a space's…), and a kept thing's own page (/pages/<id>, whose arrow leads
    // back to its project's Files), give way to the project's page; from a session or any other page, its window opens over it.
    if (/^\/(spaces|library|pages)(\/|$)/.test(here())) replace = true;
    else if (!inProjects()) return openWindow(project.id, project.tab, { part: project.part, share: project.share, dir: project.dir });
  }
  // Going anywhere else from the project's window (New session, a session, a document from its Files) leaves it, even
  // when the page under it is that place already.
  if (useProjectWindow.getState().at) useProjectWindow.setState({ at: null });
  const to = machineBase + path;
  // Pages cross-fade (Motion: Full), but not to or from the Browser (its page is a window of its own, which cannot be
  // part of the picture), not for a change inside a page (its query or its # only), and not where code goes on at once
  // from the new address (a section's # to scroll to, a redirect that replaces the page).
  const now = location.pathname;
  const target = to.split(/[?#]/)[0];
  const page = (p: string) => p.slice(machineBase.length).split('/')[1] ?? '';
  if (replace || to.includes('#') || target === now || page(target) === 'browser' || page(now) === 'browser') return navigate(to, { replace });
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
 * What the file window over the page (features/files/FilePeek) shows: a file, or a folder (`dir` when it is known to be
 * one; `sel`, the item picked in it). `back` is what it showed before, which its Back button returns to.
 */
export type Peeked = { path: string; line?: number; dir?: boolean; sel?: string; back?: Peeked };

/**
 * The file window's file or folder, if it is open. `show`, while it is, moves it to another one with Back to this one,
 * asking first about changes not saved (it says whether it moved): a folder in a file's path there opens in it.
 */
export const useFilePeek = create<{ file: Peeked | null; show?: (to: Peeked) => Promise<boolean> }>(() => ({ file: null }));

/** A session's page is the one on screen. */
export const inSession = () => location.pathname.slice(machineBase.length).startsWith('/s/');

/** Opens a file. From a session it shows in a dialog over the conversation, which stays where it was; elsewhere on the Files page. */
export function openFile(path: string, line?: number) {
  if (inSession()) useFilePeek.setState({ file: { path, line } });
  else showInFiles(path, line);
}

/** Opens a file on the Files page, among its tabs. */
export function showInFiles(path: string, line?: number) {
  useUI.getState().openTab({ id: `f:${path}`, kind: 'file', ref: path });
  go(filePath(path, line));
}
