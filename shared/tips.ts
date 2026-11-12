// Tips: after the welcome tour, the app goes on showing itself one part at a time. The first time a part shows
// on screen (an element marked data-tip="<id>"), a small card beside it says what it is, with a link to the
// guide. The server keeps which tips were shown and whether they are on, for every device (server/tips);
// skipping the tour, or Skip tips on a tip, turns them off; finishing the tour, or Settings → General, turns them
// on again. The words are the page's (web/src/features/tips/catalog.ts); this is what both sides know.

/** Every tip, the first ones first when several could show at once. */
export const TIP_IDS = [
  'search',
  'inbox',
  'session-menu',
  'details',
  'queue',
  'limit',
  'memory-note',
  'sources',
  'files-made',
  'page',
  'browser',
  'skill',
  'goal',
  'children',
  'research',
  'budget',
  'context',
  'pane',
  'groups',
  'dictate',
  'handsfree',
  'machines',
  'files',
  'git',
  'terminal',
  'preview',
  'review',
  'library',
  'apps',
  'spaces',
  'knowledge',
  'usage',
  'ask',
  'tasks',
  'memory',
  'guidelines',
  'assistants',
  'connections',
  'skills',
] as const;

export type TipId = (typeof TIP_IDS)[number];

export const isTipId = (v: unknown): v is TipId => (TIP_IDS as readonly unknown[]).includes(v);

/** Where the guide says more about each: its topic and section (server/guide/guide-test.ts checks they are there). */
export const TIP_GUIDE: Record<TipId, string> = {
  search: '/guide/start#search-everything-with-ctrlk',
  inbox: '/guide/inbox#answer-approvals-questions-and-forms-right-in-the-inbox',
  'session-menu': '/guide/sessions#everything-in-the-sessions-menu',
  details: '/guide/sessions#the-details-panel-changes-commands-and-info',
  queue: '/guide/sessions#manage-the-queue',
  limit: '/guide/sessions#when-a-usage-limit-stops-a-session',
  'memory-note': '/guide/memory#see-what-an-agent-saved-after-a-reply',
  sources: '/guide/web#see-the-sources-under-a-reply',
  'files-made': '/guide/documents-voice#open-or-download-the-files-an-agent-made',
  page: '/guide/library#pages-in-the-conversation',
  browser: '/guide/web#watch-the-browser-live',
  skill: '/guide/skills#approve-edit-or-dismiss-a-proposed-skill',
  goal: '/guide/sessions#give-the-session-a-goal',
  children: '/guide/research#let-an-agent-hand-work-to-subagents',
  research: '/guide/research#run-a-deep-research',
  budget: '/guide/research#put-a-spending-cap-on-a-session',
  context: '/guide/sessions#read-the-meters-context-cache-and-speed',
  pane: '/guide/apps#follow-a-run-and-read-its-result',
  groups: '/guide/start#the-session-list',
  dictate: '/guide/documents-voice#dictate-a-message',
  handsfree: '/guide/documents-voice#talk-to-the-app-hands-free',
  machines: '/guide/devices#use-other-machines-from-one-app',
  files: '/guide/files-git#open-the-files-page',
  git: '/guide/files-git#see-your-repositories-on-the-git-page',
  terminal: '/guide/files-git#use-the-terminal',
  preview: '/guide/files-git#look-at-a-dev-server-with-preview',
  review: '/guide/files-git#review-what-a-branch-changes',
  library: '/guide/library#find-your-pages',
  apps: '/guide/apps#find-your-way-around-the-apps-page',
  spaces: '/guide/projects#what-a-project-is',
  knowledge: '/guide/projects#shared-knowledge-documents-every-session-can-search',
  usage: '/guide/usage#open-the-usage-page',
  ask: '/guide/ask-agents#ask-how-to-do-something',
  tasks: '/guide/tasks#what-a-scheduled-task-is',
  memory: '/guide/memory#what-agents-remember',
  guidelines: '/guide/guidelines#what-guidelines-are',
  assistants: '/guide/agents#make-an-agent',
  connections: '/guide/connections#what-connections-keys-and-tools-are',
  skills: '/guide/skills#open-the-skills-page',
};

/**
 * The modes that cost several times what one agent does. The first time someone picks one, a short explanation
 * says what it is for, when it is not worth it and what it costs, before it is on; whether tips are on or not.
 */
export const COSTLY_MODES = ['swarm', 'campaign', 'research', 'arena'] as const;

export type CostlyMode = (typeof COSTLY_MODES)[number];

export const isCostlyMode = (v: unknown): v is CostlyMode => (COSTLY_MODES as readonly unknown[]).includes(v);

/** GET and PUT /api/tips. */
export interface TipsState {
  /** Tips show as their parts come on screen; off once skipped. */
  on: boolean;
  /** The tips shown already, in the order they came. */
  seen: TipId[];
  /** The welcome tour version finished or skipped here (as POST /api/tour keeps it): tips wait for the tour. */
  tour: number;
  /** The costly modes explained already, so the explanation comes once (on every device). */
  explained: CostlyMode[];
}
