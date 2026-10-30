import { navigate } from 'wouter/use-browser-location';
import { machineBase, machineId, splitMachinePath } from './machine';
import { useUI } from './store';

/** Moves to a page of the machine this page shows. */
export function go(path: string, replace = false) {
  navigate(machineBase + path, { replace });
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

export function openFile(path: string, line?: number) {
  useUI.getState().openTab({ id: `f:${path}`, kind: 'file', ref: path });
  go(filePath(path, line));
}
