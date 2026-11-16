// What a project's page needs to know about its memory: its notes (counted), its wiki memory (the view the server
// gives, kept current by the server's news that the wiki changed), and the Wiki memory settings (the default switch,
// and whether new documents update notes and wiki). A server without wiki memory answers the old way or not at all: that shows as off.
import { useCallback, useEffect, useState } from 'react';
import { isUserProfile, type MemoryListEntry } from '@shared/memory';
import type { ProjectWikiView, WikiMemorySettings } from '@shared/wiki';
import { api, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { useApp } from '../../lib/store';
import { useMemory, useMemoryState } from '../memory/state';
import { normalizeWikiView } from './SpaceWikiPaths';

let lastSettings: WikiMemorySettings | null = null;
/** Settings → Memory → Wiki memory, fetched when a page that needs them opens (the last answer shows at once). */
export function useWikiSettings(): WikiMemorySettings | null {
  const [settings, setSettings] = useState<WikiMemorySettings | null>(lastSettings);
  useEffect(() => {
    let live = true;
    api<WikiMemorySettings>('/api/wiki/settings').then(
      (r) => live && setSettings((lastSettings = r)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  return settings;
}

export interface SpaceMemory {
  /** How the project's notes are keyed (its repository's root, else its folder); null until known. */
  key: string | null;
  /** Active notes of its own, once loaded. */
  notes?: number;
  /** Its wiki memory, once loaded. */
  wiki?: ProjectWikiView;
  /** Grows each time the server says the project's wiki changed. */
  version: number;
  /** Loads the wiki view again (after the project's own switch changed). */
  reload: () => void;
}

/** A project's notes and wiki memory, for its page: the tab's count, the Overview's fact, the Memory tab. */
export function useSpaceMemory(id: string, folder: string | undefined): SpaceMemory {
  const home = useApp((x) => x.boot?.home);
  useMemoryState();
  const memoryVersion = useMemory((s) => s.version);
  const [key, setKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<number>();
  const [wiki, setWiki] = useState<ProjectWikiView>();
  const [version, setVersion] = useState(0);
  // Notes are kept under the repository's root; a folder that is no repository (or the home folder) is its own place.
  useEffect(() => {
    setKey(null);
    if (!folder) return;
    let live = true;
    api<{ info: { repo?: string } | null }>(`/api/git/repo-info?path=${enc(folder)}`).then(
      (r) => live && setKey(r.info?.repo && r.info.repo !== home ? r.info.repo : folder),
      () => live && setKey(folder),
    );
    return () => {
      live = false;
    };
  }, [folder, home]);
  useEffect(() => {
    setNotes(undefined);
    if (!key) return;
    let live = true;
    api<{ entries: MemoryListEntry[] }>(`/api/memory/entries?scope=repo&key=${enc(key)}`).then(
      (r) => live && setNotes(r.entries.filter((e) => !(isUserProfile(e) && e.status === 'active')).length),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [key, memoryVersion]);
  const loadWiki = useCallback(() => {
    api(`/api/projects/${enc(id)}/wiki`).then(
      (r) => setWiki(normalizeWikiView(r)),
      () => setWiki((w) => w ?? { status: 'off', on: false, inherited: true }),
    );
  }, [id]);
  useEffect(() => setWiki(undefined), [id]);
  useEffect(loadWiki, [loadWiki, version]);
  useFeatureEvent('wiki', (e) => {
    if ((e.data as { space?: string } | null)?.space === id) setVersion((v) => v + 1);
  });
  return { key, notes, wiki, version, reload: loadWiki };
}
