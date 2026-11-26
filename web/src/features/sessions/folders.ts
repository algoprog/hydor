// What the pages know of the folders you made for sessions in the sidebar (shared/sidebar.ts SessionFolder): the
// list, loaded once and kept up to date by the server's news, and what you do with them. Which folder a session is in
// is the session's own (`extra.folder`).
import { useEffect } from 'react';
import { create } from 'zustand';
import { sessionFolderList, type SessionFolder } from '@shared/sidebar';
import type { SessionSummary } from '@shared/types';
import { api, del, enc, patch, post } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toastError, useSessions } from '../../lib/store';

export const useSessionFolderStore = create<{ list: SessionFolder[] | null }>(() => ({ list: null }));

const NONE: SessionFolder[] = [];
const keep = (v: unknown) => useSessionFolderStore.setState({ list: sessionFolderList(v) });

let listening = false;
/** Reads the folders the server keeps, and follows its changes. */
export function loadSessionFolders() {
  if (!listening) {
    listening = true;
    onFeatureEvent('session-folders', (e) => keep((e.data as { folders?: unknown } | undefined)?.folders));
  }
  api<{ folders: unknown }>('/api/session-folders')
    .then((r) => keep(r.folders))
    .catch(() => {});
}

/** The folders you made ([] until known), loaded on first use. */
export function useSessionFolders(): SessionFolder[] {
  const list = useSessionFolderStore((s) => s.list);
  useEffect(() => {
    if (!list) loadSessionFolders();
  }, [list]);
  return list ?? NONE;
}

/** Makes a folder, at the top or inside a project (its id); rejects with the server's reason when it will not. */
export async function createSessionFolder(name: string, space?: string): Promise<SessionFolder> {
  const r = await post<{ folder: SessionFolder; folders: unknown }>('/api/session-folders', { name, ...(space ? { space } : {}) });
  keep(r.folders);
  return r.folder;
}

export async function renameSessionFolder(id: string, name: string): Promise<void> {
  const r = await patch<{ folders: unknown }>(`/api/session-folders/${enc(id)}`, { name });
  keep(r.folders);
}

/** Deletes a folder: its sessions are not touched, and show where they would without it. */
export async function deleteSessionFolder(id: string): Promise<void> {
  const r = await del<{ folders: unknown }>(`/api/session-folders/${enc(id)}`);
  keep(r.folders);
}

/** Puts a session in a folder (null: takes it out), here at once and on the server a moment later; put back if the server will not. */
export function moveToFolder(s: SessionSummary, folder: string | null) {
  const st = useSessions.getState();
  const before = st.byKey[s.key] ?? s;
  st.upsert([{ ...before, extra: { ...before.extra, folder: folder ?? undefined } }]);
  post(`/api/sessions/${enc(s.key)}/folder`, { folder }).catch((e) => {
    const now = useSessions.getState().byKey[s.key] ?? before;
    useSessions.getState().upsert([{ ...now, extra: { ...now.extra, folder: before.extra?.folder } }]);
    toastError(e);
  });
}
