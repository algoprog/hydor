// What one search of a project's memory finds: its notes, its wiki memory and its own documents at once, for the
// project's Memory tab (GET /api/projects/:id/memory/search?q=).
import type { KnowledgeHit } from './knowledge.ts';
import type { MemoryListEntry } from './memory.ts';

/** A wiki article (or one of its sources) that matches: by a passage the wiki's index found, or by its title. */
export interface ProjectMemoryArticleHit {
  /** Its path in the wiki: wiki/… for an article, raw/… for a source. */
  path: string;
  title: string;
  /** The passage that matched; its summary when only its title did. */
  excerpt?: string;
  /** How it was found: its words, its meaning, the exact text, or its title. */
  by: ('words' | 'meaning' | 'exact' | 'title')[];
}

export interface ProjectMemorySearch {
  query: string;
  /** The project's own memory notes (its topics, profile and findings too), best first. */
  notes: MemoryListEntry[];
  /** Its wiki memory's articles and sources, best first; none while wiki memory is off. */
  articles: ProjectMemoryArticleHit[];
  /** Passages of the project's own documents, best first: not its wiki's index, not the shared knowledge, not a group's projects. */
  documents: KnowledgeHit[];
  /** Whether search by meaning took part (Settings → Memory), besides the words. */
  meaning: boolean;
}
