// The app's capabilities in the pages (search, browser, memory, assistants…). Each adds what it needs
// through a WebFeature: views for its tools and notes in the conversation, a Settings section, pages,
// sidebar entries, buttons by the message box, items in a session's menu, options on the start page,
// and a view of the sessions it starts in place of their conversation (an app's run as its result).
// A feature module may import components, but must not call into this registry at its top level.
import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { SessionExtra, SessionNote } from '@shared/features';
import type { SessionSummary, ToolCategory, ToolInfo, ToolItem } from '@shared/types';
import { appsFeature } from './apps/feature';
import { assistantsFeature } from './assistants/feature';
import { automationsFeature } from './automations/feature';
import { browserFeature } from './browser/feature';
import { budgetFeature } from './budget/feature';
import { childrenFeature } from './children/feature';
import { connectionsFeature } from './connections/feature';
import { customFeature } from './custom/feature';
import { documentsFeature } from './documents/feature';
import { imagesFeature } from './images/feature';
import { memoryFeature } from './memory/feature';
import { opinionFeature } from './opinion/feature';
import { pagesFeature } from './pages/feature';
import { searchFeature } from './search/feature';
import { skillpackFeature } from './skillpack/feature';
import { voiceFeature } from './voice/feature';

/** How one of the app's own MCP tools shows in the conversation. */
export interface ToolView {
  /** In the folded work (the default), with the reply (a page, files made), or outside the fold because it needs the user. */
  place?: 'work' | 'answer' | 'attention';
  /** How its step reads on a line and counts in a folded group (as an MCP tool it would be "other"): web_search counts with web searches. */
  step?: (t: ToolInfo) => { category?: ToolCategory; verb?: string; title?: string };
  Row: ComponentType<{ item: ToolItem; sessionKey: string }>;
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
  noteViews?: Record<string, ComponentType<{ note: SessionNote; sessionKey: string }>>;
  /** Sections of Settings (in its Capabilities group). */
  settings?: FeatureSection[];
  /** Pages of its own. */
  routes?: { match: (path: string) => boolean; Page: ComponentType }[];
  /** Entries among the sidebar's tools. */
  nav?: { path: string; label: string; icon: ReactNode; match?: (path: string) => boolean }[];
  /** Items in a session's menu… */
  SessionMenu?: ComponentType<{ s: SessionSummary; close: () => void }>;
  /** …and the part they go in: More unless given, which keeps the main list short. */
  sessionMenuPart?: SessionMenuPart;
  /** Above a session's message box: a live browser, a spending notice… */
  SessionDock?: ComponentType<{ s: SessionSummary }>;
  /** A view of the sessions it started, in place of their conversation until you switch. */
  sessionPane?: SessionPane;
  /** Buttons beside the message box's attach button; `insert` adds text to the message being written. */
  ComposerButtons?: ComponentType<{ s?: SessionSummary; insert: (text: string) => void; disabled?: boolean }>;
  /** On the start page, options for the new session, kept in its settings. */
  StartOptions?: ComponentType<{ value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void; cwd: string }>;
}

let list: WebFeature[] | null = null;
/** Every capability, in order (built on first use, after all their modules have loaded). */
export const features = (): WebFeature[] =>
  (list ??= [
    pagesFeature,
    searchFeature,
    browserFeature,
    memoryFeature,
    childrenFeature,
    opinionFeature,
    budgetFeature,
    documentsFeature,
    imagesFeature,
    connectionsFeature,
    automationsFeature,
    voiceFeature,
    assistantsFeature,
    appsFeature,
    skillpackFeature,
    customFeature,
  ]);

/** A tool of the app's own MCP server, by its bare name; null for any other tool. The server was called agent-console once. */
export const nagetTool = (name: string): string | null => /^mcp__(?:naget-agent|agent-console)__(.+)$/.exec(name)?.[1] ?? null;

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

export function noteView(kind: string): ComponentType<{ note: SessionNote; sessionKey: string }> | undefined {
  for (const f of features()) if (f.noteViews?.[kind]) return f.noteViews[kind];
  return undefined;
}

export const featureSections = (): FeatureSection[] => features().flatMap((f) => f.settings ?? []);

/** The view a capability gives this session, if one does. */
export function sessionPaneOf(s: SessionSummary): SessionPane | undefined {
  for (const f of features()) if (f.sessionPane?.match(s)) return f.sessionPane;
  return undefined;
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

export function FeatureComposerButtons(p: { s?: SessionSummary; insert: (text: string) => void; disabled?: boolean }) {
  return (
    <>
      {features().map((f) => (f.ComposerButtons ? <f.ComposerButtons key={f.id} {...p} /> : null))}
    </>
  );
}

export function FeatureStartOptions(p: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void; cwd: string }) {
  return (
    <>
      {features().map((f) => (f.StartOptions ? <f.StartOptions key={f.id} {...p} /> : null))}
    </>
  );
}
