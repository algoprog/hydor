// Knowledge bases: documents and folders the user adds once for agents to search (shared ones on Spaces →
// Shared knowledge, a space's own on its Knowledge tab), and how an agent's search of them shows in the
// conversation.
import type { WebFeature } from '../registry';
import { KnowledgePage } from './KnowledgePage';
import { KnowledgeRow, knowledgeStep } from './views';

export const knowledgeFeature: WebFeature = {
  id: 'knowledge',
  toolViews: {
    knowledge_search: { place: 'work', Row: KnowledgeRow, step: knowledgeStep },
  },
  routes: [{ match: (p) => p === '/knowledge', Page: KnowledgePage }],
};
