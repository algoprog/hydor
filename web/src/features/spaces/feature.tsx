// Spaces: a project's sessions, files, memory, instructions and assistant together. Picked by name in the
// start page's folder chip (assistants/start.tsx), filtered by in the sidebar, kept on the Spaces page.
import type { WebFeature } from '../registry';
import { SpacesPage } from './SpacesPage';

export const spacesFeature: WebFeature = {
  id: 'spaces',
  routes: [{ match: (p) => p === '/spaces' || p.startsWith('/spaces/'), Page: SpacesPage }],
};
