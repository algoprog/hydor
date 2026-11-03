// Spaces: a project's sessions, files, documents, memory, guidelines and assistant together. In the sidebar
// (with the shared knowledge as its second tab), picked by name in the start page's folder chip
// (assistants/start.tsx), filtered by in the sidebar's session list.
import { Boxes } from 'lucide-react';
import type { WebFeature } from '../registry';
import { SpacesPage } from './SpacesPage';

export const spacesFeature: WebFeature = {
  id: 'spaces',
  routes: [{ match: (p) => p === '/spaces' || p.startsWith('/spaces/'), Page: SpacesPage }],
  nav: [{ id: 'spaces', path: '/spaces', label: 'Projects', icon: <Boxes size={17} />, match: (p) => p === '/spaces' || p.startsWith('/spaces/') || p === '/knowledge' }],
};
