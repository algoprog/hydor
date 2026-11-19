// Projects: a project's sessions, files, memory, guidelines and assistant together. The Projects page (/projects,
// ProjectsPage.tsx) lists them all as cards, and has a button on the rail before Agents. A project's details open in a
// window over the page (ProjectDialog.tsx), from a card, the sessions sidebar, the search box and any link to an old
// address of its page; picked by name in the start page's folder chip (assistants/start.tsx), filtered by in the sidebar's
// session list. Its old addresses (/projects/<id>/<tab>), typed, reloaded or opened from a notification, open the
// window over the Projects page.
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Boxes } from 'lucide-react';
import { go, projectAddress } from '../../lib/nav';
import type { WebFeature } from '../registry';
import { ProjectsPage } from './ProjectsPage';

/** An old address of a project's page loaded directly: go() opens its window and puts the Projects page's address in its place. */
function ProjectAddress() {
  const [loc] = useLocation();
  useEffect(() => {
    const to = `${loc}${window.location.search}${window.location.hash}`;
    // An address that names no project (a slash after /projects, or deeper than a tab) is the Projects page.
    go(projectAddress(to)?.id ? to : '/projects', true);
  }, [loc]);
  return null;
}

export const spacesFeature: WebFeature = {
  id: 'spaces',
  routes: [
    { match: (p) => p === '/projects', Page: ProjectsPage },
    { match: (p) => p.startsWith('/projects/'), Page: ProjectAddress },
  ],
  nav: [{ id: 'spaces', path: '/projects', label: 'Projects', icon: <Boxes size={17} />, match: (p) => p === '/projects' }],
};
