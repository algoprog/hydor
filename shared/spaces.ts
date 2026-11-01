// Spaces: a project's sessions, files, documents, memory, instructions and assistant in one place, picked by
// name on the start page in place of a folder. Each space has a folder of its own (its files, and so its project
// memory), knowledge bases of its own (shared/knowledge.ts) that only its sessions search, instructions every
// session in it gets, and the assistant its sessions start as. What the server and the pages share.

export interface Space {
  id: string;
  name: string;
  /** A name from SPACE_COLORS. */
  color: string;
  description?: string;
  /** Where its sessions work, its files are and its memory is kept. */
  folder: string;
  /** What every session in it is told (who it is for, how to work, what to keep in mind). */
  instructions?: string;
  /** The assistant its sessions start as (General, Researcher…). */
  assistant?: string;
  /** False: its sessions search only the space's own knowledge, not the shared knowledge too. */
  sharedKnowledge?: boolean;
  /**
   * The spaces it brings together, by id: a group. Its sessions get theirs too: their documents, instructions
   * and folders. A group brings in plain spaces, not other groups.
   */
  members?: string[];
  createdAt: number;
}

/** A space with how many sessions it has, when one was last at work, and how many documents its knowledge holds. */
export interface SpaceView extends Space {
  sessions: number;
  lastAt?: number;
  docs: number;
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

export const MAX_SPACE_INSTRUCTIONS = 4000;
/** Most spaces a group brings together. */
export const MAX_GROUP = 12;

/** A space that brings others together. */
export const isGroup = (s: Pick<Space, 'members'>) => !!s.members?.length;
