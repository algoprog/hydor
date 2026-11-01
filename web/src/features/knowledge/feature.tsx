// Knowledge bases: documents and folders the user adds once (the Knowledge page) for every agent to search,
// and how an agent's search of them shows in the conversation.
import { Library } from 'lucide-react';
import type { WebFeature } from '../registry';
import { KnowledgePage } from './KnowledgePage';
import { KnowledgeRow, knowledgeStep } from './views';

export const knowledgeFeature: WebFeature = {
  id: 'knowledge',
  toolViews: {
    knowledge_search: { place: 'work', Row: KnowledgeRow, step: knowledgeStep },
  },
  routes: [{ match: (p) => p === '/knowledge', Page: KnowledgePage }],
  nav: [{ path: '/knowledge', label: 'Knowledge', icon: <Library size={17} /> }],
};
