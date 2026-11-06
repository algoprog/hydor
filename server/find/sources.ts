// What the server finds by meaning, each as an id the search box knows ("app:<id>", "s:<session key>") and a
// short text: what ships with the app (the catalog of shared/find-catalog.ts, app templates, built-in assistants
// and skills), whose vectors are made ahead of time (npm run find:vectors), and what people make (sessions,
// spaces, apps, scheduled tasks, assistants, learned skills, the Library's pages, images and videos, connected
// apps), whose vectors are made the moment they are made or changed (index.ts). The guide's sections ship too.
import type { FindPlace } from '../../shared/find.ts';
import { catalogItems, catalogText } from '../../shared/find-catalog.ts';
import type { MediaItem } from '../../shared/media.ts';
import type { PageInfo } from '../../shared/pages.ts';
import { isGroup } from '../../shared/spaces.ts';
import type { SessionSummary } from '../../shared/types.ts';
import { listApps } from '../apps/store.ts';
import { TEMPLATES } from '../apps/templates.ts';
import { BUILTINS } from '../assistants/builtins.ts';
import { allAssistants } from '../assistants/store.ts';
import { connections, connectionView } from '../connections/apps.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { guideItems } from '../guide/content.ts';
import { listMedia } from '../media/store.ts';
import { listPages } from '../pages/store.ts';
import { libraryView } from '../skillpack/proposals.ts';
import { allSpaces } from '../spaces/index.ts';

export interface Item {
  id: string;
  text: string;
}

export type Kind = 'catalog' | 'guide' | 'sessions' | 'spaces' | 'apps' | 'tasks' | 'assistants' | 'skills' | 'pages' | 'connections';
export const KINDS: Kind[] = ['catalog', 'guide', 'sessions', 'spaces', 'apps', 'tasks', 'assistants', 'skills', 'pages', 'connections'];

/** The places of the search box's Search in menu each kind is in: a search looks only at the kinds of the places asked for. */
export const KIND_PLACES: Record<Kind, FindPlace[]> = {
  catalog: ['settings', 'actions'],
  guide: ['guide'],
  sessions: ['sessions'],
  spaces: ['spaces'],
  apps: ['templates'],
  tasks: ['tasks'],
  assistants: ['assistants'],
  skills: ['skills'],
  pages: ['pages'],
  connections: ['connections'],
};

/** Sessions given vectors: the latest. */
export const MAX_SESSIONS = 3000;

const text = (...parts: (string | undefined)[]) => joined(400, parts);

function joined(max: number, parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join('. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** What each kind of the Library's pages is called in its text. */
const PAGE_KIND: Record<string, string> = { slides: 'A slide deck', doc: 'A document', sheet: 'A spreadsheet', tex: 'A LaTeX document', notebook: 'A Jupyter notebook' };

/**
 * A page of the Library (of any kind) as the search box finds it by meaning, and the Library's own search
 * (pages/search.ts) by the same vector: its title, its kind and its description, whole (a description has at most
 * 100 words).
 */
export const pageItemText = (p: Pick<PageInfo, 'title' | 'kind' | 'description'>) => joined(1000, [p.title, PAGE_KIND[p.kind ?? ''] ?? 'A page', p.description]);
/** A picture, a video or a sound of the Library, the same way. */
export const mediaItemText = (m: Pick<MediaItem, 'title' | 'kind' | 'description'>) =>
  joined(1000, [m.title, m.kind === 'video' ? 'A video' : m.kind === 'audio' ? 'A sound' : 'An image', m.description]);

export const sessionItem = (s: Pick<SessionSummary, 'key' | 'title' | 'firstPrompt'>): Item => ({ id: `s:${s.key}`, text: text(s.title, s.firstPrompt && s.firstPrompt !== s.title ? s.firstPrompt : undefined) });

const catalog = (): Item[] => catalogItems().map((it) => ({ id: it.id, text: catalogText(it) }));
/** An app's text for its vector: the search box finds apps by it, and agents' find_apps (apps/search.ts) by the same vector. */
export const appItemText = (name: string, own: boolean, description?: string) => text(name, own ? 'An app' : 'A ready-made app', description);
const templates = (): Item[] => TEMPLATES.map((t) => ({ id: `app:tpl:${t.id}`, text: appItemText(t.name, false, t.description) }));
const assistant = (a: { id: string; name: string; description?: string }): Item => ({ id: `asst:${a.id}`, text: text(a.name, 'An assistant', a.description) });
/** A skill as the search box finds it (and agents' skill suggestions, skillpack/match.ts, by its vector). */
export const skillItemText = (name: string, description?: string) => text(name.replace(/-/g, ' '), 'A skill', description);
const skill = (s: { name: string; description: string }): Item => ({ id: `skill:${s.name}`, text: skillItemText(s.name, s.description) });

/** Each kind's items now. */
export function itemsOf(kind: Kind, d: Pick<Deps, 'db' | 'sessions' | 'scheduler'>): Item[] {
  const { db } = d;
  switch (kind) {
    case 'catalog':
      return catalog();
    case 'guide':
      return guideItems();
    case 'sessions':
      return d.sessions
        .list({ limit: MAX_SESSIONS })
        .sessions.filter((s) => !s.archived)
        .map(sessionItem);
    case 'spaces':
      return allSpaces(db).map((s) => ({ id: `space:${s.id}`, text: text(s.name, isGroup(s) ? 'A group of projects' : 'A project', s.description) }));
    case 'apps':
      return [...listApps(db).map((a) => ({ id: `app:${a.id}`, text: appItemText(a.name, true, a.description) })), ...templates()];
    case 'tasks':
      return d.scheduler.list().map((t) => ({ id: `task:${t.id}`, text: text(t.name, 'A scheduled task', t.prompt.slice(0, 300)) }));
    case 'assistants':
      return allAssistants(db).map(assistant);
    case 'skills':
      return libraryView(db).map(skill);
    case 'pages':
      // The Library: its pages of every kind, and the images, videos and sounds kept there, with their descriptions.
      return [...listPages(db).map((p) => ({ id: `page:${p.id}`, text: pageItemText(p) })), ...listMedia(db).map((m) => ({ id: `media:${m.id}`, text: mediaItemText(m) }))];
    case 'connections':
      return connections(db).map((c) => ({ id: `conn:${c.id}`, text: text(connectionView(db, c).name, 'A connected account', c.entry.name, c.entry.description) }));
  }
}

/** What ships with the app: its vectors are made ahead of time and kept in the repository. */
export function shippedItems(db: DB): Item[] {
  return [...catalog(), ...guideItems(), ...templates(), ...BUILTINS.map(assistant), ...libraryView(db).filter((s) => s.source === 'bundled').map(skill)];
}
