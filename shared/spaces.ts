// Spaces: a project's sessions, files, documents, memory, instructions, skills and assistant in one place,
// picked by name on the start page in place of a folder. Each space has a folder of its own (its files, and so
// its project memory), and can work with other folders of yours where they are; knowledge bases of its own
// (shared/knowledge.ts) that only its sessions search, instructions every session in it gets, skills of its
// own its sessions get with the skill library (shared/skillpack.ts), and the assistant its sessions start as.
// What the server and the pages share.

export interface Space {
  id: string;
  name: string;
  /** A name from SPACE_COLORS. */
  color: string;
  description?: string;
  /** Where its sessions work, its files are and its memory is kept. */
  folder: string;
  /** Folders of yours it works with besides, where they are (a project, a folder of papers): its sessions get them too. */
  folders?: string[];
  /** What every session in it is told (who it is for, how to work, what to keep in mind). */
  instructions?: string;
  /** The assistant its sessions start as (General, Researcher…). */
  assistant?: string;
  /** False: its sessions search only the space's own knowledge, not the shared knowledge too. */
  sharedKnowledge?: boolean;
  /**
   * The spaces it brings together, by id: a group. Its sessions get theirs too: their documents, instructions,
   * skills and folders. A group brings in plain spaces, not other groups.
   */
  members?: string[];
  createdAt: number;
}

/** A space with how many sessions it has, when one was last at work, how many documents its knowledge holds, and its skills. */
export interface SpaceView extends Space {
  sessions: number;
  lastAt?: number;
  docs: number;
  /** How many skills of its own it has (its Skills tab). */
  skills: number;
}

/** A space's colour, by name (as templates have theirs). */
export const SPACE_COLORS: Record<string, string> = {
  amber: '#d99a06',
  blue: '#3b82f6',
  green: '#22a55e',
  pink: '#ec4899',
  violet: '#8b5cf6',
  teal: '#14b8a6',
  orange: '#f97316',
  slate: '#64748b',
};

export const spaceColor = (s: Pick<Space, 'color'>) => SPACE_COLORS[s.color] ?? SPACE_COLORS.blue;

/** A space's guidelines (Agent Guidelines), as long as any level's. */
export const MAX_SPACE_INSTRUCTIONS = 20_000;
/** Most spaces a group brings together. */
export const MAX_GROUP = 12;
/** Most folders a space works with besides its own. */
export const MAX_FOLDERS = 12;

/** A space that brings others together. */
export const isGroup = (s: Pick<Space, 'members'>) => !!s.members?.length;

/** A folder worth a space of its own (the Spaces page's suggestions): sessions worked in it lately, or changed its files, and no space has it yet. */
export interface SpaceSuggestion {
  path: string;
  /** Sessions that worked in it or changed files in it, in the last 90 days. */
  sessions: number;
  /** Of those, how many only changed its files (they ran in another folder). */
  changed: number;
  /** When one of them was last at work. */
  lastAt: number;
}
