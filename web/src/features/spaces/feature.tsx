// Projects: a project's sessions, files, memory, guidelines and assistant together. The Projects page (/projects,
// ProjectsPage.tsx) lists them all as cards, and has a button on the rail before Agents. In the Projects section a
// project's details are its own page in the workspace (/projects/<id>[/<tab>], below), from a card, with an arrow back
// to all projects; from anywhere else (the sessions sidebar, the search box, a link) they open in a window over the page
// (ProjectDialog.tsx), so a session stays where it is. Picked by name in the start page's folder chip
// (assistants/start.tsx), filtered by in the sidebar's session list.
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Boxes } from 'lucide-react';
import { Throbber } from '../../components/ui';
import { go, projectAddress } from '../../lib/nav';
import type { WebFeature } from '../registry';
import { ProjectsPage } from './ProjectsPage';

const SpacePage = lazy(() => import('./SpacePage').then((m) => ({ default: m.SpacePage })));

/** A project's own page (`/projects/<id>[/<tab>][?part=…&share=1&dir=…]`): its details in the workspace. */
function ProjectPage() {
  const [loc] = useLocation();
  const search = useSearch();
  const at = projectAddress(`${loc}${search ? `?${search}` : ''}`);
  // An address that names no project (a slash after /projects, or deeper than a tab) is the Projects page.
  useEffect(() => {
    if (!at?.id) go('/projects', true);
  }, [!at?.id]);
  // Each new address is an ask for what it names (another tab, a folder of its Files), which the page then shows.
  const asks = useRef(0);
  const req = useMemo(() => ++asks.current, [loc, search]);
  if (!at?.id) return null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-fg-3">
            <Throbber size={28} />
          </div>
        }
      >
        <SpacePage key={at.id} id={at.id} tab={at.tab} part={at.part} share={at.share} dir={at.dir} note={at.note} req={req} page />
      </Suspense>
    </div>
  );
}

export const spacesFeature: WebFeature = {
  id: 'spaces',
  routes: [
    { match: (p) => p === '/projects', Page: ProjectsPage },
    { match: (p) => p.startsWith('/projects/'), Page: ProjectPage },
  ],
  nav: [{ id: 'spaces', path: '/projects', label: 'Projects', icon: <Boxes size={17} />, match: (p) => p === '/projects' || p.startsWith('/projects/') }],
};
