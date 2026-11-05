// The app's capabilities in the pages (search, browser, memory, assistants…). Each adds what it needs
// through a WebFeature: views for its tools and notes in the conversation, a Settings section, pages,
// sidebar entries, buttons by the message box, items in a session's menu, options on the start page,
// and a view of the sessions it starts in place of their conversation (an app's run as its result).
// A feature module may import components, but must not call into this registry at its top level.
import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { SessionExtra, SessionNote } from '@shared/features';
import type { SidebarTool } from '@shared/sidebar';
import type { SessionSummary, ToolCategory, ToolInfo, ToolItem } from '@shared/types';
import { appsFeature } from './apps/feature';
import { arenaFeature } from './arena/feature';
import { assistantsFeature } from './assistants/feature';
import { automationsFeature } from './automations/feature';
import { browserFeature } from './browser/feature';
import { budgetFeature } from './budget/feature';
import { childrenFeature } from './children/feature';
import { computerFeature } from './computer/feature';
import { confidentialFeature } from './confidential/feature';
import { connectionsFeature } from './connections/feature';
import { customFeature } from './custom/feature';
import { documentsFeature } from './documents/feature';
import { experimentsFeature } from './experiments/feature';
import { commitsFeature } from './git/feature';
import { guideFeature } from './guide/feature';
import { guidelinesFeature } from './guidelines/feature';
import { imagesFeature } from './images/feature';
import { mediaFeature } from './media/feature';
import { knowledgeFeature } from './knowledge/feature';
import { memoryFeature } from './memory/feature';
import { opinionFeature } from './opinion/feature';
import { pagesFeature } from './pages/feature';
import { researchFeature } from './research/feature';
import { searchFeature } from './search/feature';
import { shotsFeature } from './shots/feature';
import { skillpackFeature } from './skillpack/feature';
import { spacesFeature } from './spaces/feature';
import { swarmFeature } from './swarm/feature';
import { voiceFeature } from './voice/feature';

/** A view of a note in the conversation. One that shows several (`many`) gets the later notes of its kind in that turn as `more`, shown as one note with the first. */
/** `afterChanges`: it shows below the turn's changed files rather than above them (the commits it made). */
export type NoteView = ComponentType<{ note: SessionNote; sessionKey: string; more?: SessionNote[] }> & { many?: boolean; afterChanges?: boolean };

/** How one of the app's own MCP tools shows in the conversation. */
export interface ToolView {
  /** In the folded work (the default), with the reply (a page, files made), or outside the fold because it needs the user. */
  place?: 'work' | 'answer' | 'attention';
  /** How its step reads on a line and counts in a folded group (as an MCP tool it would be "other"): web_search counts with web searches. */
  step?: (t: ToolInfo) => { category?: ToolCategory; verb?: string; title?: string };
  /** Shown with the reply, its later calls in that reply come to the first as `more` and show with it, as one (screenshots). */
  many?: boolean;
  /**
   * Shown with the reply, what a call makes again when called again (a saved page, by its id). Of a turn's calls
   * that make the same, the reply shows only the newest that did not fail (or was not declined or stopped), the others
   * coming to it as `more`; they stay steps of the work, drawn as their `step` says.
   */
  same?: (t: ToolInfo) => string | undefined;
  Row: ComponentType<{ item: ToolItem; sessionKey: string; more?: ToolItem[] }>;
}

/** A part of a session's menu: its main list, or its Session settings or More submenu. */
export type SessionMenuPart = 'main' | 'settings' | 'more';

/** Another view of a session than its conversation (an app's run as its result): it opens first, beside a switch to the conversation. */
export interface SessionPane {
  /** Its name and icon on the switch. */
  label: string;
  icon: ReactNode;
  match: (s: SessionSummary) => boolean;
  /** What the message box suggests while it shows. */
  placeholder?: string;
  Body: ComponentType<{ s: SessionSummary }>;
}

export interface FeatureSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** One line under the title. */
  sub: string;
  Body: ComponentType;
}

export interface WebFeature {
  id: string;
  /** Views for its tools on each session's own MCP server, by bare name ("web_search"). */
  toolViews?: Record<string, ToolView>;
  /** A view for another tool call it recognises (an agent loading a skill), or nothing. */
  matchTool?: (t: ToolInfo) => ToolView | undefined;
  /** Views for the notes it adds to conversations, by kind. */
  noteViews?: Record<string, NoteView>;
  /** Sections of Settings (in its Capabilities group). */
  settings?: FeatureSection[];
  /** Pages of its own. */
  routes?: { match: (path: string) => boolean; Page: ComponentType }[];
  /** Entries among the sidebar's tools; `id` names one in the order you drag them into (shared/sidebar.ts). */
  nav?: { id: SidebarTool; path: string; label: string; icon: ReactNode; match?: (path: string) => boolean }[];
  /** Items in a session's menu… */
  SessionMenu?: ComponentType<{ s: SessionSummary; close: () => void }>;
  /** …and the part they go in: More unless given, which keeps the main list short. */
  sessionMenuPart?: SessionMenuPart;
  /** Above a session's message box: a live browser, a spending notice… */
  SessionDock?: ComponentType<{ s: SessionSummary }>;
  /** A view of the sessions it started, in place of their conversation until you switch. */
  sessionPane?: SessionPane;
  /** Beside a session's conversation on a wide screen (a page being written or changed), while `useOpen` says so. */
  sessionSide?: { useOpen: (key: string) => boolean; close: (key: string) => void; Panel: ComponentType<{ s: SessionSummary }> };
  /**
   * Buttons beside the message box's attach button; `insert` adds text to the message being written. `confidential`: the
   * start page's box, for a confidential session (a session's own box has it in `s`).
   */
  ComposerButtons?: ComponentType<{ s?: SessionSummary; insert: (text: string) => void; disabled?: boolean; confidential?: boolean }>;
  /** On the start page, options for the new session, kept in its settings. */
  StartOptions?: ComponentType<{ value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void; cwd: string }>;
}

let list: WebFeature[] | null = null;
/** Every capability, in order (built on first use, after all their modules have loaded). */
export const features = (): WebFeature[] =>
  (list ??= [
    pagesFeature,
    shotsFeature,
    searchFeature,
    browserFeature,
    computerFeature,
    confidentialFeature,
    memoryFeature,
    knowledgeFeature,
    spacesFeature,
    childrenFeature,
    opinionFeature,
    budgetFeature,
    swarmFeature,
    researchFeature,
    arenaFeature,
    commitsFeature,
    documentsFeature,
    imagesFeature,
    mediaFeature,
    connectionsFeature,
    automationsFeature,
    experimentsFeature,
    voiceFeature,
    assistantsFeature,
    appsFeature,
    skillpackFeature,
    customFeature,
    guidelinesFeature,
    guideFeature,
  ]);

/** A tool of the app's own MCP server, by its bare name; null for any other tool. The server was called agent-console once. */
export const nagetTool = (name: string): string | null => /^mcp__(?:hydor|naget-agent|agent-console)__(.+)$/.exec(name)?.[1] ?? null;

/** How a tool call shows: the app's own tools by name; with the call itself, others a capability recognises. */
export function toolView(name: string, t?: ToolInfo): ToolView | undefined {
  const bare = nagetTool(name);
  if (bare) for (const f of features()) if (f.toolViews?.[bare]) return f.toolViews[bare];
  if (t)
    for (const f of features()) {
      const v = f.matchTool?.(t);
      if (v) return v;
    }
  return undefined;
}

export function noteView(kind: string): NoteView | undefined {
  for (const f of features()) if (f.noteViews?.[kind]) return f.noteViews[kind];
  return undefined;
}

export const featureSections = (): FeatureSection[] => features().flatMap((f) => f.settings ?? []);

/** The view a capability gives this session, if one does. */
export function sessionPaneOf(s: SessionSummary): SessionPane | undefined {
  for (const f of features()) if (f.sessionPane?.match(s)) return f.sessionPane;
  return undefined;
}

/** What shows beside this session's conversation now, if anything (the first capability that shows something). */
export function useSessionSide(key: string): NonNullable<WebFeature['sessionSide']> | null {
  let found: NonNullable<WebFeature['sessionSide']> | null = null;
  // Each side's hook runs every time, in the same order (the list never changes).
  for (const f of features())
    if (f.sessionSide) {
      const open = f.sessionSide.useOpen(key);
      if (open && !found) found = f.sessionSide;
    }
  return found;
}

/** Each feature's items in one part of a session's menu. */
export function FeatureMenuItems({ s, close, part }: { s: SessionSummary; close: () => void; part: SessionMenuPart }) {
  return (
    <>
      {features().map((f) => (f.SessionMenu && (f.sessionMenuPart ?? 'more') === part ? <f.SessionMenu key={f.id} s={s} close={close} /> : null))}
    </>
  );
}

export function FeatureDock({ s }: { s: SessionSummary }) {
  return (
    <>
      {features().map((f) => (f.SessionDock ? <f.SessionDock key={f.id} s={s} /> : null))}
    </>
  );
}

export function FeatureComposerButtons(p: { s?: SessionSummary; insert: (text: string) => void; disabled?: boolean; confidential?: boolean }) {
  return (
    <>
      {features().map((f) => (f.ComposerButtons ? <f.ComposerButtons key={f.id} {...p} /> : null))}
    </>
  );
}

/** The assistant leads the start options: picking one can set the others. */
const startRank = (f: WebFeature) => (f.id === 'assistants' ? 0 : 1);

/**
 * The capabilities' options for a new session; with `part`, only the one that leads (on the start page's
 * row, always there) or the rest (in its Options menu, there only while it is open).
 */
export function FeatureStartOptions({ part, ...p }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void; cwd: string; part?: 'lead' | 'rest' }) {
  return (
    <>
      {[...features()]
        .sort((a, b) => startRank(a) - startRank(b))
        .filter((f) => !part || (startRank(f) === 0) === (part === 'lead'))
        .map((f) => (f.StartOptions ? <f.StartOptions key={f.id} {...p} /> : null))}
    </>
  );
}
