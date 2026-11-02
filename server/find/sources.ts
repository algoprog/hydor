// What the server finds by meaning, each as an id the search box knows ("app:<id>", "s:<session key>") and a
// short text: what ships with the app (the catalog of shared/find-catalog.ts, app templates, built-in assistants
// and skills), whose vectors are made ahead of time (npm run find:vectors), and what people make (sessions,
// spaces, apps, scheduled tasks, assistants, learned skills, pages, connected apps), whose vectors are made the
// moment they are made or changed (index.ts). The guide's sections (docs/guide) ship too.
import type { FindPlace } from '../../shared/find.ts';
import { catalogItems, catalogText } from '../../shared/find-catalog.ts';
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

const text = (...parts: (string | undefined)[]) =>
  parts
    .filter(Boolean)
    .join('. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);

export const sessionItem = (s: Pick<SessionSummary, 'key' | 'title' | 'firstPrompt'>): Item => ({ id: `s:${s.key}`, text: text(s.title, s.firstPrompt && s.firstPrompt !== s.title ? s.firstPrompt : undefined) });

const catalog = (): Item[] => catalogItems().map((it) => ({ id: it.id, text: catalogText(it) }));
const templates = (): Item[] => TEMPLATES.map((t) => ({ id: `app:tpl:${t.id}`, text: text(t.name, 'A ready-made template', t.description) }));
const assistant = (a: { id: string; name: string; description?: string }): Item => ({ id: `asst:${a.id}`, text: text(a.name, 'An assistant', a.description) });
const skill = (s: { name: string; description: string }): Item => ({ id: `skill:${s.name}`, text: text(s.name.replace(/-/g, ' '), 'A skill', s.description) });

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
      return allSpaces(db).map((s) => ({ id: `space:${s.id}`, text: text(s.name, isGroup(s) ? 'A group of spaces' : 'A space', s.description) }));
    case 'apps':
      return [...listApps(db).map((a) => ({ id: `app:${a.id}`, text: text(a.name, 'A template', a.description) })), ...templates()];
    case 'tasks':
      return d.scheduler.list().map((t) => ({ id: `task:${t.id}`, text: text(t.name, 'A scheduled task', t.prompt.slice(0, 300)) }));
    case 'assistants':
      return allAssistants(db).map(assistant);
    case 'skills':
      return libraryView(db).map(skill);
    case 'pages':
      return listPages(db).map((p) => ({ id: `page:${p.id}`, text: text(p.title, 'A page') }));
    case 'connections':
      return connections(db).map((c) => ({ id: `conn:${c.id}`, text: text(connectionView(db, c).name, 'A connected app', c.entry.name, c.entry.description) }));
  }
}

/** What ships with the app: its vectors are made ahead of time and kept in the repository. */
export function shippedItems(db: DB): Item[] {
  return [...catalog(), ...guideItems(), ...templates(), ...BUILTINS.map(assistant), ...libraryView(db).filter((s) => s.source === 'bundled').map(skill)];
}
