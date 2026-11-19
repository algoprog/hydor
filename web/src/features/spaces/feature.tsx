// Spaces: a project's sessions, files, memory, guidelines and assistant together. Its details open in a window over
// the page (ProjectDialog.tsx), from the sessions sidebar, the search box and any link to an old address of its page;
// picked by name in the start page's folder chip (assistants/start.tsx), filtered by in the sidebar's session list.
// Its old addresses (/projects, /projects/<id>/<tab>), typed, reloaded or opened from a notification, open the window
// over the start page.
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { go, projectAddress } from '../../lib/nav';
import type { WebFeature } from '../registry';

/** An old address of a project's page loaded directly: go() opens its window and puts the start page's address in its place. */
function ProjectAddress() {
  const [loc] = useLocation();
  useEffect(() => {
    const to = `${loc}${window.location.search}${window.location.hash}`;
    // An address that names no project (deeper than a tab) is the start page.
    go(projectAddress(to) ? to : '/', true);
  }, [loc]);
  return null;
}

export const spacesFeature: WebFeature = {
  id: 'spaces',
  routes: [{ match: (p) => p === '/projects' || p.startsWith('/projects/'), Page: ProjectAddress }],
};
